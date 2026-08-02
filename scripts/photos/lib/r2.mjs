/**
 * R2 access for the photo pipeline.
 *
 * Uploads shell out to `wrangler r2 object put` rather than using the S3 API.
 * That endpoint authenticates with AWS SigV4, which needs a long-lived access
 * key wrangler's OAuth token cannot produce — a second credential to create by
 * hand and eventually rotate. wrangler starts in ~0.6s, so a pool of 8 puts the
 * full migration at ~3 minutes, which is not worth a permanent credential.
 * See docs/ARCHITECTURE.md §3.
 *
 * Listing has no wrangler equivalent, so it uses the REST API with the same
 * OAuth token wrangler already stores. Still no second credential.
 */
import { spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

/** Spawned directly rather than via `npx`, which adds resolution overhead per call. */
const WRANGLER = path.join(REPO_ROOT, 'node_modules/.bin/wrangler');

export const PUBLIC_BUCKET = 'memerson-photos';
export const ARCHIVE_BUCKET = 'memerson-photos-archive';

/**
 * The public custom domain on the bucket above. Derivatives are served from
 * here directly, never proxied through the Worker — which is also why anything
 * needing to read one back (verify, describe) can just fetch it with no
 * credentials at all. Mirrors PHOTOS_BASE_URL in src/consts.ts.
 */
export const PHOTOS_BASE_URL = 'https://photos.memerson.com';

/**
 * The canonical shape of a public derivative key. Everything that builds or
 * checks one — derive, verify, describe, the design bundle — goes through
 * this, so the shape exists in exactly one place.
 */
export function derivativeKey(id, width, format) {
  return `photos/${id}/${width}.${format}`;
}

/** Concurrent wrangler processes. Measured sweet spot; see docs/ARCHITECTURE.md §3. */
const UPLOAD_CONCURRENCY = 8;
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

/**
 * A counting semaphore. Every R2 call acquires from the same one, so the cap is
 * on total live wrangler processes rather than per-photo — photos can be
 * processed concurrently without multiplying the process count.
 */
function createSemaphore(limit) {
  let active = 0;
  const waiting = [];

  const release = () => {
    active--;
    const next = waiting.shift();
    if (next) next();
  };

  return async function withSlot(fn) {
    if (active >= limit) await new Promise((resolve) => waiting.push(resolve));
    active++;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

const withUploadSlot = createSemaphore(UPLOAD_CONCURRENCY);

// ---------------------------------------------------------------------------
// wrangler
// ---------------------------------------------------------------------------

function runWrangler(args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(WRANGLER, args, {
      cwd: REPO_ROOT,
      stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else
        reject(
          new Error(
            `wrangler ${args.slice(0, 4).join(' ')} exited ${code}\n${err || out}`,
          ),
        );
    });

    if (stdin) {
      child.stdin.on('error', reject);
      child.stdin.end(stdin);
    }
  });
}

/**
 * Only transient failures are worth retrying — network blips, wrangler races.
 * Bad credentials or a bucket that does not exist will fail identically three
 * times, so those bail immediately with the real message intact instead of
 * adding 1.5s of sleeps to an error the retries cannot fix.
 */
function isPermanent(error) {
  return /\b(401|403|404)\b|unauthorized|not authorized|does not exist|no such bucket/i.test(
    error.message,
  );
}

async function withRetry(label, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || isPermanent(error)) {
        throw new Error(`${label} failed (attempt ${attempt}): ${error.message}`);
      }
      // A failed object is retried in place; the run is never restarted.
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

/**
 * Upload one object. `body` is a Buffer (piped over stdin, no temp file) or
 * `{ file }` for something already on disk.
 */
export async function putObject(bucket, key, body, { contentType, cacheControl } = {}) {
  const args = ['r2', 'object', 'put', `${bucket}/${key}`, '--remote', '--force'];
  if (contentType) args.push('--content-type', contentType);
  if (cacheControl) args.push('--cache-control', cacheControl);

  const isBuffer = Buffer.isBuffer(body);
  if (isBuffer) args.push('--pipe');
  else args.push('--file', body.file);

  return withUploadSlot(() =>
    withRetry(`put ${bucket}/${key}`, () =>
      runWrangler(args, isBuffer ? body : undefined),
    ),
  );
}

/** Download one object to a local path. Used by `photos:rebuild`. */
export async function getObject(bucket, key, destination) {
  const args = [
    'r2',
    'object',
    'get',
    `${bucket}/${key}`,
    '--remote',
    '--file',
    destination,
  ];
  await withUploadSlot(() => withRetry(`get ${bucket}/${key}`, () => runWrangler(args)));
  return readFile(destination);
}

// ---------------------------------------------------------------------------
// Listing (REST API — wrangler has no equivalent command)
// ---------------------------------------------------------------------------

/**
 * The account ID and OAuth token wrangler wrote at `wrangler login`. Reused
 * rather than introducing a second credential; if this file is missing the fix
 * is `wrangler login`, same as for every other command here.
 */
async function wranglerAuth() {
  // wrangler resolves its global config dir as WRANGLER_HOME, then the
  // platform's XDG-style config dir, so mirror that order rather than
  // hard-coding the macOS default this started as.
  const home = os.homedir();
  const configDirs = [
    process.env.WRANGLER_HOME,
    process.env.XDG_CONFIG_HOME && path.join(process.env.XDG_CONFIG_HOME, '.wrangler'),
    path.join(home, 'Library/Preferences/.wrangler'), // macOS
    path.join(home, '.config/.wrangler'), // Linux
    path.join(home, '.wrangler'), // legacy
  ].filter(Boolean);
  const configPaths = configDirs.map((dir) => path.join(dir, 'config/default.toml'));

  let raw;
  for (const configPath of configPaths) {
    raw = await readFile(configPath, 'utf8').catch(() => undefined);
    if (raw !== undefined) break;
  }
  if (raw === undefined) {
    throw new Error(
      `No wrangler credentials found (looked in ${configPaths.join(', ')}). ` +
        'Run `npx wrangler login`.',
    );
  }

  const token = raw.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if (!token)
    throw new Error('No oauth_token in wrangler config. Run `npx wrangler login`.');

  // account_id is not in the credentials file; wrangler resolves it per call.
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? (await defaultAccountId(token));
  return { token, accountId };
}

async function defaultAccountId(token) {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Could not resolve a Cloudflare account: HTTP ${response.status}`);
  }
  const body = await response.json();
  if (!body.success || body.result.length === 0) {
    throw new Error(
      `Could not resolve a Cloudflare account: ${JSON.stringify(body.errors)}`,
    );
  }
  if (body.result.length > 1) {
    throw new Error('Multiple Cloudflare accounts; set CLOUDFLARE_ACCOUNT_ID.');
  }
  return body.result[0].id;
}

let authPromise;

/** Every object key in `bucket` under `prefix`, following pagination. */
export async function listObjects(bucket, prefix = '') {
  if (!authPromise) {
    authPromise = wranglerAuth();
    // A rejected promise cached here would replay the first failure (say, one
    // transient network error resolving the account) to every later call.
    // Clear it on rejection so the next call retries; the call that triggered
    // the failure still sees its own error via the await below.
    authPromise.catch(() => {
      authPromise = undefined;
    });
  }
  const { token, accountId } = await authPromise;

  const keys = [];
  let cursor;

  do {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`,
    );
    url.searchParams.set('per_page', '1000');
    if (prefix) url.searchParams.set('prefix', prefix);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Listing ${bucket} failed: HTTP ${response.status}`);
    }
    const body = await response.json();
    if (!body.success) {
      throw new Error(`Listing ${bucket} failed: ${JSON.stringify(body.errors)}`);
    }

    for (const object of body.result) keys.push(object.key);
    cursor = body.result_info?.is_truncated ? body.result_info.cursor : undefined;
  } while (cursor);

  return keys;
}

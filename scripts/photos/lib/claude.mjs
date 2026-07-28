/**
 * The model side of the metadata pipeline.
 *
 * Runs `claude -p` headless over the **640px derivative already in R2** — no
 * originals are touched and nothing needs regenerating. The derivative is
 * public, so this needs no credentials beyond an authenticated Claude Code.
 *
 * Everything here writes only into fields the schema marks as authored
 * (`title`, `caption`, `tags`) or into `shoots.json`. It must never touch a
 * derived field.
 *
 * The safety mechanism is not in this file: **the manifest is in git, so the
 * diff is the review.** Generated text lands as a reviewable change, never as a
 * silent mutation. Keep it that way.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PHOTOS_BASE_URL } from './r2.mjs';

/**
 * Sonnet-class is the right tier here: small images and a short, heavily
 * constrained answer. Overridable so a prompt change can be re-run against a
 * stronger model without editing code.
 */
export const DESCRIBE_MODEL = process.env.PHOTOS_MODEL || 'claude-sonnet-5';

/**
 * Low effort, measured rather than assumed: on the same frame it returned
 * byte-identical tags and caption to medium in 5.2s against 8.4s. There is no
 * reasoning to do here — the answer is in the pixels — so thinking budget buys
 * nothing but latency.
 */
export const DESCRIBE_EFFORT = process.env.PHOTOS_EFFORT || 'low';

/**
 * The 640px derivative — the **smallest** width the pipeline generates — sent
 * as-is. No local downscaling: the variant is already small, and re-encoding
 * every frame to shave tokens is not worth a sharp call in the loop.
 *
 * That 640 is enough was measured rather than assumed. Descriptions of the same
 * frames at decreasing widths:
 *
 *   256px — **wrong**. Called a black-and-white ruffed lemur a "monkey/tamarin".
 *   384px — correct species and monument, coarser tags.
 *   512px — full "black-and-white ruffed lemur"; identical in substance to 640.
 *   640px — no better than 512 on any frame tested, and it is what we already have.
 *
 * The useful finding is the floor: accuracy collapses somewhere under 384, and
 * it collapses into a *confident wrong noun* rather than a vague one. So if a
 * smaller variant is ever added to the pipeline, do not point this at it
 * without re-running that comparison.
 */
export const READ_WIDTH = Number(process.env.PHOTOS_READ_WIDTH) || 640;

export function derivativeUrl(slug, width = READ_WIDTH) {
  return `${PHOTOS_BASE_URL}/photos/${slug}/${width}.webp`;
}

/**
 * Models like to wrap JSON in a fence however firmly you ask them not to.
 * Strip one if it is there, then take the outermost object.
 */
export function parseJsonReply(text) {
  let body = text.trim();

  const fence = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) body = fence[1].trim();

  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no JSON object in reply: ${text.slice(0, 200)}`);
  }

  return JSON.parse(body.slice(start, end + 1));
}

function runClaude(prompt, { cwd, model, effort, timeoutMs = 180_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'claude',
      ['-p', '--allowedTools', 'Read', '--model', model, '--effort', effort],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`claude timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.trim().slice(0, 300)}`));
        return;
      }
      resolve(stdout);
    });

    child.stdin.end(prompt);
  });
}

/**
 * Download the given derivatives into a scratch directory and run one prompt
 * with the model's working directory set to it.
 *
 * Files are named `1.webp`, `2.webp`, … in the order given, so the prompt can
 * refer to them positionally without leaking slugs — a slug encodes the capture
 * date, which would bias a "what is this" question.
 *
 * `claude` reads WebP directly (verified), so nothing is transcoded.
 */
export async function askAboutImages(
  urls,
  buildPrompt,
  { model = DESCRIBE_MODEL, effort = DESCRIBE_EFFORT } = {},
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'photos-describe-'));
  try {
    const names = [];
    for (const [index, url] of urls.entries()) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
      const name = `${index + 1}.webp`;
      await writeFile(path.join(dir, name), Buffer.from(await response.arrayBuffer()));
      names.push(name);
    }

    const reply = await runClaude(buildPrompt(names), { cwd: dir, model, effort });
    return parseJsonReply(reply);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Run `worker` over `items` with a bounded number in flight.
 *
 * Each call is a separate `claude` process, so this is bounded to keep from
 * launching a hundred of them at once rather than for any API limit.
 */
export async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function drain() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, drain));
  return results;
}

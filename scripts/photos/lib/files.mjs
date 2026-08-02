/**
 * Argument expansion for the import CLI.
 *
 * Paths are always arguments, never remembered. Accepts files or directories,
 * recurses, and filters to supported image extensions.
 * See docs/ARCHITECTURE.md §5.7.
 */
import { readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

// No '.heic': the prebuilt sharp binaries exclude the HEVC decoder for patent
// reasons — sharp.format.heif.input.fileSuffix is ['.avif'] on sharp 0.35.3 —
// so a .heic would only fail later, at derive time, with a worse message.
// Supporting it would require a custom libvips build.
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);

export function isSupportedImage(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function walk(directory, into, visited) {
  // Cycle guard for the symlink-following below: a link back up the tree
  // would otherwise recurse forever. Directories are tracked by real path.
  const real = await realpath(directory);
  if (visited.has(real)) return;
  visited.add(real);

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // Skip dotfiles: .DS_Store, resource forks, and editor droppings are not photos.
    if (entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);

    // `withFileTypes` reports a symlink as neither file nor directory, which
    // used to skip linked photos and folders silently. stat() follows links.
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      const info = await stat(full).catch(() => null);
      if (!info) {
        console.warn(`  ! skipping broken symlink: ${full}`);
        continue;
      }
      isDirectory = info.isDirectory();
      isFile = info.isFile();
    }

    if (isDirectory) await walk(full, into, visited);
    else if (isFile && isSupportedImage(full)) into.push(full);
  }
}

/** Expand CLI arguments into a sorted, de-duplicated list of image paths. */
export async function expandPaths(args) {
  const found = [];
  const visited = new Set();

  for (const arg of args) {
    const resolved = path.resolve(arg);
    const info = await stat(resolved).catch(() => null);

    if (!info) throw new Error(`No such path: ${arg}`);

    if (info.isDirectory()) {
      await walk(resolved, found, visited);
    } else if (isSupportedImage(resolved)) {
      found.push(resolved);
    } else {
      throw new Error(`Not a supported image: ${arg}`);
    }
  }

  return [...new Set(found)].sort();
}

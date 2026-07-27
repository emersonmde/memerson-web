/**
 * Argument expansion for the import CLI.
 *
 * Paths are always arguments, never remembered. Accepts files or directories,
 * recurses, and filters to supported image extensions.
 * See docs/ARCHITECTURE.md §5.7.
 */
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.tif',
  '.tiff',
  '.webp',
  '.heic',
]);

export function isSupportedImage(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function walk(directory, into) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // Skip dotfiles: .DS_Store, resource forks, and editor droppings are not photos.
    if (entry.name.startsWith('.')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full, into);
    else if (entry.isFile() && isSupportedImage(full)) into.push(full);
  }
}

/** Expand CLI arguments into a sorted, de-duplicated list of image paths. */
export async function expandPaths(args) {
  const found = [];

  for (const arg of args) {
    const resolved = path.resolve(arg);
    const info = await stat(resolved).catch(() => null);

    if (!info) throw new Error(`No such path: ${arg}`);

    if (info.isDirectory()) {
      await walk(resolved, found);
    } else if (isSupportedImage(resolved)) {
      found.push(resolved);
    } else {
      throw new Error(`Not a supported image: ${arg}`);
    }
  }

  return [...new Set(found)].sort();
}

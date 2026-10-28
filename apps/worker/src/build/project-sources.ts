/**
 * Where `detectProject` reads a project from: a fetched checkout on the builder's disk, or an uploaded zip (the
 * server's check right after the upload). Neither follows a symlink nor reads a big file: the project is untrusted,
 * and a `package.json` pointing at /etc/shadow must read as missing.
 */
import { constants, type Stats } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectSource } from './detect';
import { readZipListing } from './fetch-source';
import { checkRelativeDir } from './settings';

/** Configuration files and lockfiles worth reading are far below this; a lockfile is only checked for a marker. */
export const MAX_READ_BYTES = 2 * 1024 * 1024;
/** Subdirectories one listing gives at most (a workspace's `apps/` has a handful). */
export const MAX_LIST_ENTRIES = 200;

const sortedNames = (names: Iterable<string>): string[] => [...names].sort().slice(0, MAX_LIST_ENTRIES);

/** The absolute path of `rel` inside `root`, or null when `rel` is not a plain relative path. */
function inside(root: string, rel: string): string | null {
  const checked = checkRelativeDir(rel);
  if (checked === null || checked === '') return null;
  return path.join(root, ...checked.split('/'));
}

/** Null when any component of `rel` under `root` is a symlink or missing. */
async function lstatNoFollow(root: string, rel: string): Promise<Stats | null> {
  const target = inside(root, rel);
  if (target === null) return null;
  let current = root;
  const parts = rel.split('/');
  for (const [i, part] of parts.entries()) {
    current = path.join(current, part);
    const info = await lstat(current).catch(() => null);
    if (!info || info.isSymbolicLink()) return null;
    if (i === parts.length - 1) return info;
    if (!info.isDirectory()) return null;
  }
  return null;
}

/** A checkout under `root`. */
export function localSource(root: string): ProjectSource {
  return {
    async read(rel) {
      const info = await lstatNoFollow(root, rel);
      if (!info?.isFile() || info.size > MAX_READ_BYTES) return null;
      const target = inside(root, rel);
      if (target === null) return null;
      // O_NOFOLLOW: the last component cannot have become a symlink since the check.
      const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);
      if (!handle) return null;
      try {
        return await handle.readFile('utf8');
      } finally {
        await handle.close();
      }
    },
    async exists(rel) {
      return (await lstatNoFollow(root, rel)) !== null;
    },
    async isDir(rel) {
      return (await lstatNoFollow(root, rel))?.isDirectory() === true;
    },
    async list(rel) {
      const dir = rel === '' ? root : (await lstatNoFollow(root, rel))?.isDirectory() ? inside(root, rel) : null;
      if (dir === null) return [];
      // Entries are not followed: a symlink to a directory is a symlink here, never a directory.
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      return sortedNames(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
    },
  };
}

/** An uploaded zip, read in place; `close` when done. */
export async function zipSource(file: string): Promise<ProjectSource & { close(): void }> {
  const listing = await readZipListing(file);
  const dirs = new Set<string>();
  for (const name of listing.names) {
    const parts = name.replace(/\/$/, '').split('/');
    for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
    if (name.endsWith('/')) dirs.add(name.slice(0, -1));
  }
  return {
    read: (rel) => (listing.names.has(rel) ? listing.read(rel, MAX_READ_BYTES) : Promise.resolve(null)),
    exists: (rel) => Promise.resolve(listing.names.has(rel) || dirs.has(rel)),
    isDir: (rel) => Promise.resolve(dirs.has(rel)),
    list: (rel) => {
      const prefix = rel === '' ? '' : `${rel}/`;
      const children = [...dirs].filter((dir) => dir.startsWith(prefix) && dir.length > prefix.length && !dir.slice(prefix.length).includes('/'));
      return Promise.resolve(sortedNames(children.map((dir) => dir.slice(prefix.length))));
    },
    close: () => listing.close(),
  };
}

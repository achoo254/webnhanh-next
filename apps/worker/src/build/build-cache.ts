/**
 * The library cache of each site, at BUILD_CACHE_DIR/<site id>/ (never shared between sites: one site's build must not
 * be able to plant code in another's):
 *
 *   home/            the build user's HOME: npm, pnpm and yarn caches, corepack's package managers
 *   modules/<n>/     the node_modules directories of the last install, kept with `manifest.json`
 *   manifest.json    { key, dirs }: the key is the hash of the lockfile; the same lockfile restores `modules/` and the
 *                    install step is skipped
 *   last-used        touched by every build; caches unused for CACHE_UNUSED_MS are deleted
 *
 * Everything moves with rename(2) between the cache and the job directory (both under /var/lib/webnhanh, one file
 * system), so taking and giving back a cache of any size is instant. A cache over CACHE_MAX_BYTES is dropped.
 */
import { lstat, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isUuid } from '@webnhanh/db';
import { sha256 } from './collect-output';
import type { PackageManager } from './detect';

export const CACHE_MAX_BYTES = 500 * 1024 * 1024;
export const CACHE_UNUSED_MS = 30 * 24 * 60 * 60 * 1000;

interface Manifest {
  readonly key: string;
  readonly dirs: readonly string[];
}

export function siteCacheDir(cacheRoot: string, siteId: string): string {
  if (!isUuid(siteId)) throw new Error(`not a site id: ${siteId}`);
  return path.join(cacheRoot, siteId);
}

/** The cache key: the lockfile's bytes, the package manager and where the install runs. */
export function lockKey(lockfile: Buffer, pm: PackageManager, installDir: string): string {
  return sha256(lockfile, pm, installDir);
}

async function exists(file: string): Promise<boolean> {
  return (await lstat(file).catch(() => null)) !== null;
}

async function readManifest(dir: string): Promise<Manifest | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
    if (typeof value !== 'object' || value === null) return null;
    const { key, dirs } = value as { key?: unknown; dirs?: unknown };
    if (typeof key !== 'string' || !Array.isArray(dirs) || !dirs.every((d): d is string => typeof d === 'string' && /^(?:[A-Za-z0-9._@+-]+\/)*node_modules$/.test(d) && !d.split('/').includes('..'))) return null;
    return { key, dirs };
  } catch {
    return null;
  }
}

/** Moves the site's HOME into the job directory (`<jobDir>/home`), or makes an empty one. */
export async function takeHome(cacheRoot: string, siteId: string, jobDir: string): Promise<void> {
  const cached = path.join(siteCacheDir(cacheRoot, siteId), 'home');
  const target = path.join(jobDir, 'home');
  if (await exists(cached)) await rename(cached, target);
  else await mkdir(target, { recursive: true });
}

/**
 * Puts the last install's node_modules back into `sourceDir` when its key matches; true when they were restored (and
 * the install step can be skipped).
 */
export async function restoreModules(cacheRoot: string, siteId: string, key: string, sourceDir: string): Promise<boolean> {
  const dir = siteCacheDir(cacheRoot, siteId);
  const manifest = await readManifest(dir);
  if (!manifest || manifest.key !== key || manifest.dirs.length === 0) return false;
  for (const [i, rel] of manifest.dirs.entries()) {
    const from = path.join(dir, 'modules', String(i));
    const to = path.join(sourceDir, ...rel.split('/'));
    // The source must have the place for it, and nothing there yet (a repo with node_modules committed misses).
    if (!(await exists(from)) || (await exists(to)) || !(await stat(path.dirname(to)).catch(() => null))?.isDirectory()) return false;
  }
  for (const [i, rel] of manifest.dirs.entries()) await rename(path.join(dir, 'modules', String(i)), path.join(sourceDir, ...rel.split('/')));
  await rm(path.join(dir, 'manifest.json'), { force: true });
  return true;
}

/** node_modules directories under `root` (not inside another one), at most a few levels deep, symlinks not followed. */
export async function findModuleDirs(root: string, maxDepth = 5): Promise<string[]> {
  const found: string[] = [];
  const pending: { rel: string; depth: number }[] = [{ rel: '', depth: 0 }];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const entries = await readdir(path.join(root, next.rel), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const rel = next.rel === '' ? entry.name : `${next.rel}/${entry.name}`;
      if (entry.name === 'node_modules') found.push(rel);
      else if (entry.name !== '.git' && next.depth < maxDepth) pending.push({ rel, depth: next.depth + 1 });
    }
  }
  return found.sort();
}

/** Bytes of a tree, each inode once (pnpm hardlinks its store into node_modules). */
async function uniqueBytes(root: string): Promise<number> {
  const seen = new Set<string>();
  let total = 0;
  const pending = [root];
  for (let dir = pending.pop(); dir !== undefined; dir = pending.pop()) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pending.push(full);
        continue;
      }
      const info = await lstat(full).catch(() => null);
      if (!info) continue;
      const id = `${info.dev}:${info.ino}`;
      if (seen.has(id)) continue;
      seen.add(id);
      total += info.size;
    }
  }
  return total;
}

/**
 * Gives the cache back after a build: HOME, and the node_modules of an install that worked under its key. Drops
 * node_modules (then HOME) when the cache would be over `maxBytes`.
 */
export async function saveCache(
  cacheRoot: string,
  siteId: string,
  input: { readonly jobDir: string; readonly sourceDir: string; readonly key: string | null; readonly maxBytes?: number },
): Promise<{ bytes: number }> {
  const dir = siteCacheDir(cacheRoot, siteId);
  await mkdir(dir, { recursive: true });
  const home = path.join(input.jobDir, 'home');
  await rm(path.join(dir, 'home'), { recursive: true, force: true });
  if (await exists(home)) await rename(home, path.join(dir, 'home'));
  await rm(path.join(dir, 'manifest.json'), { force: true });
  await rm(path.join(dir, 'modules'), { recursive: true, force: true });
  if (input.key) {
    const dirs = await findModuleDirs(input.sourceDir);
    if (dirs.length > 0) {
      await mkdir(path.join(dir, 'modules'));
      for (const [i, rel] of dirs.entries()) await rename(path.join(input.sourceDir, ...rel.split('/')), path.join(dir, 'modules', String(i)));
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ key: input.key, dirs }));
    }
  }
  const max = input.maxBytes ?? CACHE_MAX_BYTES;
  let bytes = await uniqueBytes(dir);
  if (bytes > max) {
    await rm(path.join(dir, 'manifest.json'), { force: true });
    await rm(path.join(dir, 'modules'), { recursive: true, force: true });
    bytes = await uniqueBytes(dir);
  }
  if (bytes > max) {
    await rm(path.join(dir, 'home'), { recursive: true, force: true });
    bytes = await uniqueBytes(dir);
  }
  const stamp = path.join(dir, 'last-used');
  await writeFile(stamp, '');
  const now = new Date();
  await utimes(stamp, now, now);
  return { bytes };
}

/** Deletes caches unused for CACHE_UNUSED_MS, and those of sites that no longer exist. Returns how many. */
export async function pruneCaches(cacheRoot: string, now: Date, liveSiteIds: ReadonlySet<string>): Promise<number> {
  let removed = 0;
  for (const name of await readdir(cacheRoot).catch(() => [])) {
    const dir = path.join(cacheRoot, name);
    const used = (await stat(path.join(dir, 'last-used')).catch(() => null))?.mtimeMs ?? (await stat(dir).catch(() => null))?.mtimeMs ?? 0;
    if (!isUuid(name) || !liveSiteIds.has(name) || now.getTime() - used > CACHE_UNUSED_MS) {
      await rm(dir, { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}

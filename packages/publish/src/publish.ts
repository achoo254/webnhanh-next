import { cp, lstat, mkdir, readdir, readlink, rename, rm, stat, symlink } from 'node:fs/promises';
import path from 'node:path';
import { SITE_NAME_PATTERN } from '@trang/db';

/**
 * Layout under SITES_DIR, served by nginx (infra/nginx/hoandat.io.vn.conf):
 *
 *   <site>/releases/<release id>/   one published copy, never changed after it is written
 *   <site>/current -> releases/<id> the live one; replaced with rename(2), so a visitor gets the old or the new
 *                                   release, never a half-written one
 */

export interface PublishLimits {
  maxBytes: number;
  maxFiles: number;
}

export type PublishErrorCode =
  | 'bad-site-name'
  | 'bad-release-id'
  | 'not-a-directory'
  | 'no-index'
  | 'symlink'
  | 'special-file'
  | 'too-large'
  | 'too-many-files'
  | 'no-release';

export class PublishError extends Error {
  constructor(
    readonly code: PublishErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

const RELEASE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PublishInput {
  sitesDir: string;
  site: string;
  /** A finished build or rendered template; copied, never moved, so the caller cleans it up. */
  sourceDir: string;
  releaseId: string;
  limits: PublishLimits;
  /** Releases kept on disk, the live one included (default 3). */
  keep?: number;
}

export interface PublishResult {
  releaseDir: string;
  bytes: number;
  fileCount: number;
}

function siteDirOf(sitesDir: string, site: string): string {
  if (!SITE_NAME_PATTERN.test(site)) throw new PublishError('bad-site-name', `not a site name: ${site}`);
  return path.join(sitesDir, site);
}

/**
 * Sizes a tree before anything is copied. Symlinks are refused rather than followed: a build could otherwise point
 * one at a file outside its own output and have nginx serve it.
 */
export async function measureTree(dir: string, limits: PublishLimits): Promise<{ bytes: number; fileCount: number }> {
  const root = await lstat(dir).catch(() => undefined);
  if (!root?.isDirectory()) throw new PublishError('not-a-directory', `${dir} is not a directory`);

  let bytes = 0;
  let fileCount = 0;
  const pending = [dir];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new PublishError('symlink', `symlink in the output: ${path.relative(dir, full)}`);
      if (entry.isDirectory()) {
        pending.push(full);
        continue;
      }
      if (!entry.isFile()) throw new PublishError('special-file', `not a regular file: ${path.relative(dir, full)}`);
      bytes += (await lstat(full)).size;
      fileCount += 1;
      if (fileCount > limits.maxFiles) throw new PublishError('too-many-files', `more than ${limits.maxFiles} files`);
      if (bytes > limits.maxBytes) throw new PublishError('too-large', `more than ${limits.maxBytes} bytes`);
    }
  }
  return { bytes, fileCount };
}

/** Release ids on disk, newest first (by the time each release directory was written). */
export async function listReleases(sitesDir: string, site: string): Promise<string[]> {
  const releasesDir = path.join(siteDirOf(sitesDir, site), 'releases');
  const names = (await readdir(releasesDir).catch(() => [])).filter((name) => RELEASE_ID_PATTERN.test(name));
  const dated = await Promise.all(
    names.map(async (name) => ({ name, mtimeMs: (await stat(path.join(releasesDir, name))).mtimeMs })),
  );
  return dated.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name)).map((r) => r.name);
}

/** The release `current` points to, or undefined before the first publish. */
export async function currentRelease(sitesDir: string, site: string): Promise<string | undefined> {
  const target = await readlink(path.join(siteDirOf(sitesDir, site), 'current')).catch(() => undefined);
  return target === undefined ? undefined : path.basename(target);
}

async function pointCurrentAt(siteDir: string, releaseId: string): Promise<void> {
  const staged = path.join(siteDir, `.current-${releaseId}`);
  await rm(staged, { force: true });
  await symlink(path.join('releases', releaseId), staged);
  await rename(staged, path.join(siteDir, 'current'));
}

/** Copies `sourceDir` in as a new release, makes it live, and prunes old releases. */
export async function publishRelease(input: PublishInput): Promise<PublishResult> {
  const { sitesDir, site, sourceDir, releaseId, limits } = input;
  const keep = input.keep ?? 3;
  const siteDir = siteDirOf(sitesDir, site);
  if (!RELEASE_ID_PATTERN.test(releaseId)) throw new PublishError('bad-release-id', `not a release id: ${releaseId}`);

  const size = await measureTree(sourceDir, limits);
  const index = await lstat(path.join(sourceDir, 'index.html')).catch(() => undefined);
  if (!index?.isFile()) throw new PublishError('no-index', 'the output has no index.html at its root');

  const releasesDir = path.join(siteDir, 'releases');
  await mkdir(releasesDir, { recursive: true });
  const incoming = path.join(releasesDir, `.incoming-${releaseId}`);
  const releaseDir = path.join(releasesDir, releaseId);
  await rm(incoming, { recursive: true, force: true });
  await cp(sourceDir, incoming, { recursive: true, errorOnExist: true, force: false });
  await rename(incoming, releaseDir);
  await pointCurrentAt(siteDir, releaseId);

  const stale = (await listReleases(sitesDir, site)).filter((id) => id !== releaseId).slice(Math.max(keep - 1, 0));
  await Promise.all(stale.map((id) => rm(path.join(releasesDir, id), { recursive: true, force: true })));

  return { releaseDir, ...size };
}

/** Makes an earlier release live again: the given one, or the newest one older than the live release. */
export async function rollbackRelease(sitesDir: string, site: string, toReleaseId?: string): Promise<string> {
  const siteDir = siteDirOf(sitesDir, site);
  const releases = await listReleases(sitesDir, site);
  const live = await currentRelease(sitesDir, site);
  const target = toReleaseId ?? releases[releases.indexOf(live ?? '') + 1];
  if (target === undefined || !releases.includes(target)) {
    throw new PublishError('no-release', `no release to roll back to for ${site}`);
  }
  await pointCurrentAt(siteDir, target);
  return target;
}

/**
 * Takes a site off the web: `current` goes first (one rename, so the next request is already a 404), then its
 * releases. For the old name of a renamed site; doing nothing when the site has no directory.
 */
export async function removeSite(sitesDir: string, site: string): Promise<void> {
  const siteDir = siteDirOf(sitesDir, site);
  const retired = path.join(sitesDir, `.removed-${site}-${Date.now()}`);
  try {
    await rename(siteDir, retired);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  await rm(retired, { recursive: true, force: true });
}

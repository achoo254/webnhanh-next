/**
 * Getting the source of a build onto the builder's disk, outside any container and without running any of it:
 *
 * - git: `git clone --depth 1` of the chosen branch of a public GitHub/GitLab repo, with no hooks, no other protocol
 *   than HTTPS, no credentials, no LFS, killed past REPO_MAX_BYTES or the time limit;
 * - zip: an upload of at most ZIP_MAX_BYTES, extracted with every entry checked: no absolute path or `..`, no symlink
 *   leading out, nothing written through a symlink, at most ZIP_MAX_ENTRIES entries and ZIP_MAX_UNPACKED_BYTES
 *   written (counted as written, not as the zip claims).
 */
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, stat, symlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { checkBranch, type RepoUrl } from './settings';

export const REPO_MAX_BYTES = 200 * 1024 * 1024;
export const CLONE_TIMEOUT_MS = 2 * 60 * 1000;
export const ZIP_MAX_BYTES = 100 * 1024 * 1024;
export const ZIP_MAX_UNPACKED_BYTES = 500 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 20_000;

export type SourceErrorCode = 'fetch-failed' | 'repo-too-large' | 'zip-invalid' | 'zip-unsafe' | 'zip-too-large';

/** Why the source could not be had; `lines` are what the person is shown (git's own words, a bad entry's name). */
export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
    readonly lines: readonly string[] = [],
  ) {
    super(`${code}: ${message}`);
    this.name = 'SourceError';
  }
}

/** git's arguments: one branch, one commit deep, HTTPS only, nothing from the server's or the user's git config. */
export function gitCloneArgs(repo: RepoUrl, branch: string, dest: string): string[] {
  const checked = checkBranch(branch);
  if (checked === null || checked !== branch) throw new SourceError('fetch-failed', 'not a branch name');
  if (!path.isAbsolute(dest)) throw new Error('clone destination must be absolute');
  return [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'protocol.allow=never',
    '-c', 'protocol.https.allow=always',
    '-c', 'credential.helper=',
    '-c', 'transfer.fsckObjects=true',
    'clone',
    '--depth', '1',
    '--single-branch',
    '--no-tags',
    '--no-recurse-submodules',
    `--branch=${branch}`,
    '--',
    repo.cloneUrl,
    dest,
  ];
}

/** The whole environment git gets: nothing of the builder's (which holds the database password). */
export function gitEnv(home: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: home,
    LANG: 'C',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: '/bin/false',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_LFS_SKIP_SMUDGE: '1',
  };
}

/** Bytes of regular files under `dir`, symlinks not followed; stops counting past `stopAt`. */
export async function treeBytes(dir: string, stopAt = Number.POSITIVE_INFINITY): Promise<number> {
  let total = 0;
  const pending = [dir];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile()) total += (await lstat(full).catch(() => null))?.size ?? 0;
      if (total > stopAt) return total;
    }
  }
  return total;
}

interface RunResult {
  readonly code: number | null;
  readonly output: string[];
}

/** Runs git with an argument list (never a shell); its process group is killed by `abort`. */
function runGit(gitPath: string, args: readonly string[], env: NodeJS.ProcessEnv, abort: AbortSignal): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(gitPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const output: string[] = [];
    const keep = (chunk: Buffer): void => {
      for (const line of chunk.toString().split(/[\r\n]+/)) if (line.trim() !== '') output.push(line);
      if (output.length > 200) output.splice(0, output.length - 200);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const kill = (): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    };
    if (abort.aborted) kill();
    abort.addEventListener('abort', kill, { once: true });
    child.on('error', (error) => {
      abort.removeEventListener('abort', kill);
      reject(new SourceError('fetch-failed', `git: ${error.message}`));
    });
    child.on('close', (code) => {
      abort.removeEventListener('abort', kill);
      resolve({ code, output });
    });
  });
}

export interface CloneInput {
  readonly gitPath: string;
  readonly repo: RepoUrl;
  readonly branch: string;
  /** An empty directory to create; the checkout goes here. */
  readonly dest: string;
  /** git's HOME: an empty directory of the job. */
  readonly home: string;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** Clones the branch; resolves with the commit checked out. */
export async function cloneRepo(input: CloneInput): Promise<{ commit: string }> {
  const maxBytes = input.maxBytes ?? REPO_MAX_BYTES;
  const abort = new AbortController();
  const stopOuter = (): void => abort.abort();
  input.signal?.addEventListener('abort', stopOuter, { once: true });
  let tooLarge = false;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, input.timeoutMs ?? CLONE_TIMEOUT_MS);
  const watch = setInterval(() => {
    void treeBytes(input.dest, maxBytes).then((bytes) => {
      if (bytes > maxBytes) {
        tooLarge = true;
        abort.abort();
      }
    });
  }, 1_000);
  try {
    await mkdir(input.home, { recursive: true });
    const env = gitEnv(input.home);
    const clone = await runGit(input.gitPath, gitCloneArgs(input.repo, input.branch, input.dest), env, abort.signal);
    if (tooLarge || (clone.code === 0 && (await treeBytes(input.dest, maxBytes)) > maxBytes)) {
      throw new SourceError('repo-too-large', `over ${maxBytes} bytes`);
    }
    if (timedOut) throw new SourceError('fetch-failed', 'clone timed out', ['git clone: quá thời gian cho phép']);
    if (clone.code !== 0) throw new SourceError('fetch-failed', `git clone exit ${String(clone.code)}`, clone.output.slice(-8));
    const head = await runGit(input.gitPath, ['-C', input.dest, 'rev-parse', 'HEAD'], env, abort.signal);
    const commit = head.output[0]?.trim() ?? '';
    if (head.code !== 0 || !/^[0-9a-f]{40,64}$/.test(commit)) throw new SourceError('fetch-failed', 'no commit after clone', head.output.slice(-4));
    return { commit };
  } finally {
    clearTimeout(timer);
    clearInterval(watch);
    input.signal?.removeEventListener('abort', stopOuter);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Zip

export interface ZipLimits {
  readonly maxZipBytes: number;
  readonly maxEntries: number;
  readonly maxUnpackedBytes: number;
}

export const ZIP_LIMITS: ZipLimits = { maxZipBytes: ZIP_MAX_BYTES, maxEntries: ZIP_MAX_ENTRIES, maxUnpackedBytes: ZIP_MAX_UNPACKED_BYTES };

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;

function openZip(file: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    // yauzl itself refuses absolute names, `..` and backslashes (decodeStrings), and entries whose data does not
    // match their declared size (validateEntrySizes).
    yauzl.open(file, { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) reject(new SourceError(/relative path|absolute path|invalid characters/i.test(error.message) ? 'zip-unsafe' : 'zip-invalid', error.message, [error.message]));
      else resolve(zip);
    });
  });
}

/** Every entry of the zip, read from its central directory (no data is inflated yet). */
async function readEntries(zip: ZipFile, maxEntries: number): Promise<Entry[]> {
  if (zip.entryCount > maxEntries) throw new SourceError('zip-too-large', `${zip.entryCount} entries`, [`${zip.entryCount} file`]);
  return new Promise((resolve, reject) => {
    const entries: Entry[] = [];
    zip.on('entry', (entry: Entry) => {
      entries.push(entry);
      if (entries.length > maxEntries) {
        reject(new SourceError('zip-too-large', `more than ${maxEntries} entries`));
        return;
      }
      zip.readEntry();
    });
    zip.on('end', () => resolve(entries));
    zip.on('error', (error: Error) =>
      reject(new SourceError(/relative path|absolute path|invalid characters/i.test(error.message) ? 'zip-unsafe' : 'zip-invalid', error.message, [error.message])),
    );
    zip.readEntry();
  });
}

function openEntry(zip: ZipFile, entry: Entry): Promise<Readable> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) reject(new SourceError('zip-invalid', error.message, [error.message]));
      else resolve(stream);
    });
  });
}

/** The entry's checked path segments, or a SourceError naming it. */
function entrySegments(name: string): string[] {
  const trimmed = name.replace(/\/+$/, '');
  const segments = trimmed.split('/');
  // eslint-disable-next-line no-control-regex
  if (trimmed === '' || name.startsWith('/') || name.includes('\\') || /[\u0000-\u001f]/.test(name) || segments.some((s) => s === '' || s === '.' || s === '..')) {
    throw new SourceError('zip-unsafe', `bad entry name ${JSON.stringify(name)}`, [name]);
  }
  return segments;
}

/**
 * The folder every entry sits in, when the zip wraps the project in one (GitHub's "Download ZIP" gives
 * `repo-main/...`): it is taken off so the project's files are at the top. Empty when there is no such folder.
 */
export function commonZipFolder(names: readonly string[]): string {
  const files = names.filter((name) => !name.endsWith('/'));
  const first = files[0]?.split('/')[0];
  if (!first || files.length === 0) return '';
  return files.every((name) => name.startsWith(`${first}/`)) && names.every((name) => name === `${first}/` || name.startsWith(`${first}/`)) ? `${first}/` : '';
}

/** Throws when any directory between `root` and `target` (exclusive) is a symlink: nothing is written through one. */
async function assertNoSymlinkOnTheWay(root: string, segments: readonly string[]): Promise<void> {
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    const info = await lstat(current).catch(() => null);
    if (!info) return;
    if (info.isSymbolicLink() || !info.isDirectory()) throw new SourceError('zip-unsafe', `${segments.join('/')} goes through ${segment}`, [segments.join('/')]);
  }
}

function countingLimit(budget: { left: number }, name: string): Transform {
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      budget.left -= chunk.length;
      if (budget.left < 0) callback(new SourceError('zip-too-large', `unpacks to more than the limit at ${name}`));
      else callback(null, chunk);
    },
  });
}

async function readSmall(stream: Readable, max: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > max) throw new SourceError('zip-unsafe', 'symlink target too long');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Extracts `file` into `dest` (created, must not exist). Symlinks are kept only when they stay inside the project;
 * anything else unsafe fails the whole zip. Resolves with what was written.
 */
export async function extractZip(file: string, dest: string, limits: ZipLimits = ZIP_LIMITS): Promise<{ files: number; bytes: number }> {
  const size = (await stat(file).catch(() => null))?.size;
  if (size === undefined) throw new SourceError('zip-invalid', 'no zip uploaded');
  if (size > limits.maxZipBytes) throw new SourceError('zip-too-large', `${size} bytes`);
  await mkdir(dest, { recursive: false });
  const root = path.resolve(dest);
  const zip = await openZip(file);
  try {
    const entries = await readEntries(zip, limits.maxEntries);
    const prefix = commonZipFolder(entries.map((entry) => entry.fileName));
    const budget = { left: limits.maxUnpackedBytes };
    let files = 0;
    for (const entry of entries) {
      if (entry.fileName === prefix) continue;
      const segments = entrySegments(entry.fileName.slice(prefix.length));
      const target = path.join(root, ...segments);
      if (!target.startsWith(`${root}${path.sep}`)) throw new SourceError('zip-unsafe', `${entry.fileName} leaves the folder`, [entry.fileName]);
      if (entry.isEncrypted()) throw new SourceError('zip-invalid', `${entry.fileName} is encrypted`, [entry.fileName]);
      await assertNoSymlinkOnTheWay(root, segments);
      const mode = (entry.externalFileAttributes >>> 16) & S_IFMT;
      if (entry.fileName.endsWith('/') || mode === S_IFDIR) {
        await mkdir(target, { recursive: true });
        continue;
      }
      await mkdir(path.dirname(target), { recursive: true });
      if (mode === S_IFLNK) {
        const link = await readSmall(await openEntry(zip, entry), 1024);
        const resolved = path.resolve(path.dirname(target), link);
        if (path.isAbsolute(link) || link.includes('\0') || !(resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
          throw new SourceError('zip-unsafe', `symlink ${entry.fileName} -> ${link} leaves the folder`, [`${entry.fileName} -> ${link}`]);
        }
        await symlink(link, target);
        continue;
      }
      if (budget.left - entry.uncompressedSize < 0) throw new SourceError('zip-too-large', 'unpacks to more than the limit', [entry.fileName]);
      const executable = ((entry.externalFileAttributes >>> 16) & 0o111) !== 0;
      // `wx`: never through an existing file or symlink of the same name (a zip may name an entry twice).
      await pipeline(await openEntry(zip, entry), countingLimit(budget, entry.fileName), createWriteStream(target, { flags: 'wx', mode: executable ? 0o755 : 0o644 })).catch((error: unknown) => {
        if (error instanceof SourceError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new SourceError((error as NodeJS.ErrnoException).code === 'EEXIST' ? 'zip-unsafe' : 'zip-invalid', `${entry.fileName}: ${message}`, [entry.fileName]);
      });
      files += 1;
    }
    return { files, bytes: limits.maxUnpackedBytes - budget.left };
  } finally {
    zip.close();
  }
}

/**
 * The files of a zip without extracting it (the server's check right after an upload): names and small files read
 * from the zip itself, the common folder taken off as `extractZip` does.
 */
export async function readZipListing(file: string, limits: ZipLimits = ZIP_LIMITS): Promise<{ names: Set<string>; read(name: string, max: number): Promise<string | null>; close(): void }> {
  const size = (await stat(file).catch(() => null))?.size;
  if (size === undefined) throw new SourceError('zip-invalid', 'no zip uploaded');
  if (size > limits.maxZipBytes) throw new SourceError('zip-too-large', `${size} bytes`);
  const zip = await openZip(file);
  try {
    const entries = await readEntries(zip, limits.maxEntries);
    const prefix = commonZipFolder(entries.map((entry) => entry.fileName));
    const byName = new Map<string, Entry>();
    for (const entry of entries) {
      if (entry.fileName === prefix) continue;
      const segments = entrySegments(entry.fileName.slice(prefix.length));
      byName.set(segments.join('/') + (entry.fileName.endsWith('/') ? '/' : ''), entry);
    }
    return {
      names: new Set(byName.keys()),
      async read(name, max) {
        const entry = byName.get(name);
        if (!entry || entry.uncompressedSize > max || ((entry.externalFileAttributes >>> 16) & S_IFMT) === S_IFLNK) return null;
        return readSmall(await openEntry(zip, entry), max).catch(() => null);
      },
      close: () => zip.close(),
    };
  } catch (error) {
    zip.close();
    throw error;
  }
}

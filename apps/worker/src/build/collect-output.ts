/**
 * After a build: only its output directory is copied, into the staging directory webnhanh-worker publishes from.
 * The output (and everything in it) must stay inside the source: a symlink is copied as the file it points to only when
 * that file is inside the output itself, anything else fails. Regular files only, at most the site's size and
 * OUTPUT_MAX_FILES files, an `index.html` at the top. The copy gets plain modes (0644/0755), whatever the build set.
 * A short report of the page (title, description, share picture, icon, big pictures) is read on the way.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { BuildReport } from '@webnhanh/db';

export const OUTPUT_MAX_FILES = 5_000;
/** Pictures above this are pointed out as slowing the site down. */
export const LARGE_IMAGE_BYTES = 500 * 1024;

export type OutputErrorCode = 'output-missing' | 'output-no-index' | 'output-too-large' | 'output-unsafe';

export class OutputError extends Error {
  constructor(
    readonly code: OutputErrorCode,
    message: string,
    readonly lines: readonly string[] = [],
  ) {
    super(`${code}: ${message}`);
    this.name = 'OutputError';
  }
}

function within(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

const IMAGE = /\.(?:jpe?g|png|gif|webp|avif|bmp|tiff?)$/i;

/** What the top page says of itself, read with simple patterns (the page is never run). */
export function pageFacts(html: string): Pick<BuildReport, 'title' | 'hasDescription' | 'hasOgImage' | 'ogImage' | 'hasFavicon'> {
  const head = html.slice(0, 200_000);
  const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(head)?.[1]?.trim() ?? null;
  const meta = (attr: string, value: string): string | null => {
    for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
      if (new RegExp(`${attr}\\s*=\\s*["']${value}["']`, 'i').test(tag)) return /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
    }
    return null;
  };
  const description = meta('name', 'description');
  const og = meta('property', 'og:image') ?? meta('name', 'og:image');
  const ogLocal = og && !/^[a-z]+:/i.test(og) && !og.startsWith('//') ? og.replace(/^\/+/, '').split(/[?#]/)[0] ?? null : null;
  const icon = (head.match(/<link\b[^>]*>/gi) ?? []).some((tag) => /rel\s*=\s*["'][^"']*icon[^"']*["']/i.test(tag));
  return {
    title: title && title.length > 0 ? title : null,
    hasDescription: description !== null && description.trim() !== '',
    hasOgImage: og !== null && og.trim() !== '',
    ogImage: ogLocal && ogLocal.length > 0 ? ogLocal : null,
    hasFavicon: icon,
  };
}

export interface CollectInput {
  /** The checkout (job's source directory). */
  readonly sourceRoot: string;
  /** The output directory relative to `sourceRoot` (`''`: the checkout itself, plain HTML). */
  readonly outputRel: string;
  /** Created; must not exist. */
  readonly dest: string;
  readonly maxBytes: number;
  readonly maxFiles?: number;
  /** Plain HTML published from the checkout itself: `.git` and similar are left out. */
  readonly skipHidden?: boolean;
  readonly buildKey: string;
}

/** Copies the output to `dest`; resolves with the report of what was copied. */
export async function collectOutput(input: CollectInput): Promise<BuildReport> {
  const maxFiles = input.maxFiles ?? OUTPUT_MAX_FILES;
  const sourceReal = await realpath(input.sourceRoot);
  const outputPath = path.join(input.sourceRoot, ...input.outputRel.split('/').filter(Boolean));
  const outputInfo = await lstat(outputPath).catch(() => null);
  if (!outputInfo) {
    const top = (await readdir(input.sourceRoot).catch(() => [])).filter((name) => !name.startsWith('.')).slice(0, 20);
    throw new OutputError('output-missing', `no ${input.outputRel || '.'}`, top.length > 0 ? [`Có trong thư mục: ${top.join(', ')}`] : []);
  }
  const outputReal = await realpath(outputPath);
  if (!within(sourceReal, outputReal) || !(await stat(outputReal)).isDirectory()) throw new OutputError('output-unsafe', 'the output directory leaves the source');

  let bytes = 0;
  let fileCount = 0;
  const large: { path: string; bytes: number }[] = [];
  await rm(input.dest, { recursive: true, force: true });
  await mkdir(input.dest, { recursive: true, mode: 0o755 });

  const copyFile = async (from: string, rel: string): Promise<void> => {
    const size = (await stat(from)).size;
    bytes += size;
    fileCount += 1;
    if (fileCount > maxFiles) throw new OutputError('output-too-large', `more than ${maxFiles} files`, [`Hơn ${maxFiles} file`]);
    if (bytes > input.maxBytes) throw new OutputError('output-too-large', `more than ${input.maxBytes} bytes`, [`Hơn ${Math.round(input.maxBytes / 1024 / 1024)} MB`]);
    if (IMAGE.test(rel) && size > LARGE_IMAGE_BYTES) large.push({ path: rel, bytes: size });
    await pipeline(createReadStream(from), createWriteStream(path.join(input.dest, rel), { flags: 'wx', mode: 0o644 }));
  };

  const pending: string[] = [''];
  for (let rel = pending.pop(); rel !== undefined; rel = pending.pop()) {
    const dir = path.join(outputReal, rel);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (input.skipHidden && rel === '' && entry.name.startsWith('.')) continue;
      if (input.skipHidden && (entry.name === 'node_modules' || entry.name === '.git')) continue;
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await mkdir(path.join(input.dest, childRel), { mode: 0o755 });
        pending.push(childRel);
      } else if (entry.isFile()) {
        await copyFile(full, childRel);
      } else if (entry.isSymbolicLink()) {
        const target = await realpath(full).catch(() => null);
        if (!target || !within(outputReal, target) || !(await stat(target)).isFile()) {
          throw new OutputError('output-unsafe', `symlink ${childRel} leads out of the output`, [`${childRel} → ra ngoài thư mục output`]);
        }
        await copyFile(target, childRel);
      } else {
        throw new OutputError('output-unsafe', `${childRel} is not a regular file`, [childRel]);
      }
    }
  }

  const index = await lstat(path.join(input.dest, 'index.html')).catch(() => null);
  if (!index?.isFile()) throw new OutputError('output-no-index', 'no index.html at the top of the output');
  const facts = pageFacts(await readFile(path.join(input.dest, 'index.html'), 'utf8'));
  const hasFaviconFile = (await lstat(path.join(input.dest, 'favicon.ico')).catch(() => null))?.isFile() === true;
  const ogImage = facts.ogImage && (await lstat(path.join(input.dest, ...facts.ogImage.split('/'))).catch(() => null))?.isFile() ? facts.ogImage : null;
  return {
    ...facts,
    ogImage,
    hasFavicon: facts.hasFavicon || hasFaviconFile,
    largeImages: large.sort((a, b) => b.bytes - a.bytes).slice(0, 5),
    bytes,
    fileCount,
    buildKey: input.buildKey,
  };
}

/** sha256 of the parts, for build keys and cache keys. */
export function sha256(...parts: readonly (string | Buffer)[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part).update('\0');
  return hash.digest('hex');
}

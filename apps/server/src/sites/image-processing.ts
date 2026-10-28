/**
 * Uploaded photos are never stored as sent (the way Clip cleans its photos): the type is checked by its first bytes
 * (JPEG, PNG or WebP only), then ffmpeg decodes it, turns it upright, lays transparency on white, scales it to at
 * most MAX_IMAGE_SIDE px on its longer side, and writes fresh WebP files without any metadata (EXIF, GPS position,
 * camera details are gone), one per width for `srcset`.
 *
 * Two ffmpeg runs: the first writes the upright, scaled picture as a lossless PNG in the temp dir (its real size is
 * read from it, after any EXIF rotation); the second writes every width from that.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ImageType = 'jpeg' | 'png' | 'webp';

/** The image type from its magic bytes, or null when it is none of the accepted ones. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const starts = (sig: readonly number[], offset = 0): boolean => sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Longest side of a stored photo, in pixels. */
export const MAX_IMAGE_SIDE = 1600;
/** Smaller widths stored beside the full one, for phones. */
export const SMALLER_WIDTHS = [480, 960] as const;
/**
 * Larger pictures are refused before decoding: a small file can declare a huge picture, and ffmpeg decodes it whole
 * (24 MP is about 100 MB of RGBA) inside the server's memory limit. Phone photos (6000×4000) fit.
 */
export const MAX_PIXELS = 24_000_000;
const TOOL_TIMEOUT_MS = 30_000;

/** ffmpeg's demuxer for each accepted type: the input is never probed as anything else. */
const DEMUXER: Readonly<Record<ImageType, string>> = { jpeg: 'jpeg_pipe', png: 'png_pipe', webp: 'webp_pipe' };

/** A counting semaphore: at most `limit` holders, the rest wait in order. */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

/** One photo decoded at a time in the whole server: each decode can take a few hundred MB. */
const slots = new Semaphore(1);

export class ImageError extends Error {
  constructor(readonly code: 'image-type' | 'image-unreadable' | 'image-too-big') {
    super(code);
    this.name = 'ImageError';
  }
}

export interface ImageTools {
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

function runTool(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // A minimal environment: the tools never see the server's secrets.
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err = (err + chunk.toString()).slice(-1_000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), TOOL_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(command)} exit ${String(code)}: ${err.slice(-300)}`));
    });
  });
}

async function pictureSize(tools: ImageTools, file: string, demuxer: string): Promise<{ width: number; height: number }> {
  const out = await runTool(tools.ffprobe, [
    '-v', 'error', '-protocol_whitelist', 'file', '-f', demuxer, '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file,
  ]);
  const match = /^(\d+)x(\d+)/.exec(out.trim());
  if (!match) throw new ImageError('image-unreadable');
  return { width: Number(match[1]), height: Number(match[2]) };
}

/** True when this ffmpeg can write WebP (libwebp). Checked once at start so a missing encoder shows in the log. */
export async function canWriteWebp(tools: ImageTools): Promise<boolean> {
  try {
    return /\blibwebp\b/.test(await runTool(tools.ffmpeg, ['-hide_banner', '-encoders']));
  } catch {
    return false;
  }
}

export interface StoredImage {
  readonly width: number;
  readonly height: number;
  /** Ascending; the last one is `width`. */
  readonly widths: number[];
  readonly bytes: number;
}

/**
 * Cleans `bytes` into one WebP per width, written by `fileFor(width)`. Nothing is left behind when it fails.
 * `tmpDir` holds the upload and the intermediate PNG while ffmpeg works.
 */
export function storeImage(tools: ImageTools, bytes: Uint8Array, tmpDir: string, fileFor: (width: number) => string): Promise<StoredImage> {
  const type = sniffImageType(bytes);
  if (!type) return Promise.reject(new ImageError('image-type'));
  return slots.run(() => storeTyped(tools, bytes, type, tmpDir, fileFor));
}

async function storeTyped(tools: ImageTools, bytes: Uint8Array, type: ImageType, tmpDir: string, fileFor: (width: number) => string): Promise<StoredImage> {
  await mkdir(tmpDir, { recursive: true });
  const base = path.join(tmpDir, `upload-${randomUUID()}`);
  const upload = `${base}.in`;
  const upright = `${base}.png`;
  const written: string[] = [];
  await writeFile(upload, bytes);
  try {
    const original = await pictureSize(tools, upload, DEMUXER[type]).catch((error: unknown) => {
      throw error instanceof ImageError ? error : new ImageError('image-unreadable');
    });
    if (original.width * original.height > MAX_PIXELS) throw new ImageError('image-too-big');

    // Upright (ffmpeg applies the EXIF orientation), longer side at most MAX_IMAGE_SIDE, transparency on white.
    const side = MAX_IMAGE_SIDE;
    await runTool(tools.ffmpeg, [
      '-v', 'error', '-y', '-filter_threads', '1', '-threads', '1', '-protocol_whitelist', 'file',
      '-f', DEMUXER[type], '-i', upload, '-frames:v', '1',
      '-filter_complex',
      `[0:v]scale=w='if(gte(iw,ih),min(${side},iw),-2)':h='if(gte(iw,ih),-2,min(${side},ih))',format=rgba,split[a][b];` +
        `[a]drawbox=c=white:t=fill[white];[white][b]overlay=format=auto,format=rgb24`,
      '-map_metadata', '-1', '-f', 'image2', '-c:v', 'png', upright,
    ]).catch(() => {
      throw new ImageError('image-unreadable');
    });
    const size = await pictureSize(tools, upright, 'png_pipe');
    const widths = [...SMALLER_WIDTHS.filter((w) => w < size.width), size.width];

    const outputs = widths.map((width, index) => ({ width, file: fileFor(width), label: `o${index}` }));
    await mkdir(path.dirname(outputs[0]?.file ?? tmpDir), { recursive: true });
    const filter =
      `[0:v]split=${outputs.length}${outputs.map((_, i) => `[s${i}]`).join('')};` +
      outputs.map((o, i) => `[s${i}]${o.width === size.width ? 'null' : `scale=${o.width}:-2`}[${o.label}]`).join(';');
    const outputArgs = outputs.flatMap((o) => {
      written.push(o.file);
      return ['-map', `[${o.label}]`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', '-compression_level', '4', '-preset', 'photo', '-map_metadata', '-1', '-f', 'webp', o.file];
    });
    await runTool(tools.ffmpeg, ['-v', 'error', '-y', '-filter_threads', '1', '-threads', '1', '-protocol_whitelist', 'file', '-f', 'png_pipe', '-i', upright, '-filter_complex', filter, ...outputArgs]);
    const sizes = await Promise.all(outputs.map((o) => stat(o.file)));
    return { width: size.width, height: size.height, widths, bytes: sizes.reduce((sum, s) => sum + s.size, 0) };
  } catch (error) {
    await Promise.all(written.map((file) => rm(file, { force: true })));
    throw error;
  } finally {
    await rm(upload, { force: true });
    await rm(upright, { force: true });
  }
}

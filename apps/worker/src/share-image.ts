/**
 * The share picture of a published page (`og:image`): the card HTML of @webnhanh/templates, photographed by headless
 * Chrome at 1200×630, then made a JPEG with ffmpeg (a PNG when ffmpeg cannot). Chrome gets a minimal environment
 * (nothing of the worker's env, which holds the database password), a throwaway profile, and no network: the card
 * loads only the files laid out beside it. Any failure is the caller's to log; the page is published without the
 * picture.
 */
import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CARD_FONTS, SHARE_CARD_SIZE } from '@webnhanh/templates';

/** Chrome and ffmpeg together get this long; a hung one is killed with its whole process group. */
export const SHARE_IMAGE_TIMEOUT_MS = 30_000;

const FONT_DIR = path.join(path.dirname(createRequire(import.meta.url).resolve('@fontsource/inter/package.json')), 'files');

/** What of the worker's environment the tools may see: nothing secret. */
const PASSED_ENV = ['PATH', 'LANG', 'LC_ALL', 'TZ'] as const;

function toolEnv(home: string): NodeJS.ProcessEnv {
  const passed = Object.fromEntries(PASSED_ENV.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])));
  return { ...passed, HOME: home, TMPDIR: home };
}

export class ShareImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareImageError';
  }
}

/** Runs a tool to its end within `deadline`; on timeout its process group is killed. Rejects with its last output. */
function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv, deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let output = '';
    const keep = (chunk: Buffer): void => {
      output = (output + chunk.toString()).slice(-2_000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let timedOut = false;
    const kill = (): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Already gone.
      }
    };
    const timer = setTimeout(
      () => {
        timedOut = true;
        kill();
      },
      Math.max(0, deadline - Date.now()),
    );
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new ShareImageError(`${path.basename(command)}: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // Chrome leaves helpers in its group now and then: whatever is left goes.
      kill();
      if (timedOut) reject(new ShareImageError(`${path.basename(command)} timed out`));
      else if (code === 0) resolve();
      else reject(new ShareImageError(`${path.basename(command)} exit ${String(code)}: ${output.slice(-400)}`));
    });
  });
}

/** Chrome's arguments for one screenshot of `page` into `png`. */
export function chromeArgs(page: string, png: string, profile: string): string[] {
  const { width, height } = SHARE_CARD_SIZE;
  return [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    // No name resolves: the card can reach nothing but its own files.
    '--host-resolver-rules=MAP * ~NOTFOUND',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    '--force-device-scale-factor=1',
    '--virtual-time-budget=5000',
    `--screenshot=${png}`,
    pathToFileURL(page).href,
  ];
}

export interface ShareImageInput {
  /** An empty directory of the job's own; the card, its files and Chrome's profile go here. */
  readonly workDir: string;
  /** The card's HTML (`renderShareCard`), with fonts under `fonts/` and photos where it names them. */
  readonly html: string;
  /** Photos to lay out beside the card: path relative to the card, and the file to copy there. */
  readonly files: readonly { readonly name: string; readonly from: string }[];
  readonly chromePath: string;
  readonly ffmpegPath: string;
}

export interface ShareImage {
  readonly file: string;
  readonly type: 'image/jpeg' | 'image/png';
}

/** The relative URL of a font file next to the card, for `renderShareCard`. */
export const cardFontUrl = (file: string): string => `fonts/${file}`;

/** Photographs the card; resolves with the picture (JPEG, or PNG when ffmpeg failed), or throws ShareImageError. */
export async function captureShareImage(input: ShareImageInput): Promise<ShareImage> {
  const deadline = Date.now() + SHARE_IMAGE_TIMEOUT_MS;
  const { workDir } = input;
  await mkdir(path.join(workDir, 'fonts'), { recursive: true });
  for (const font of CARD_FONTS) await copyFile(path.join(FONT_DIR, font.file), path.join(workDir, cardFontUrl(font.file)));
  for (const file of input.files) {
    await mkdir(path.dirname(path.join(workDir, file.name)), { recursive: true });
    await copyFile(file.from, path.join(workDir, file.name));
  }
  const page = path.join(workDir, 'card.html');
  await writeFile(page, input.html);
  const png = path.join(workDir, 'card.png');
  // Chrome's home is short on purpose: it binds a socket at <home>/com.google.Chrome.XXXXXX/SingletonSocket, and a
  // Unix socket path longer than 107 bytes makes it abort (SIGTRAP). The job's own directory is too deep for that.
  const home = await mkdtemp(path.join(os.tmpdir(), 'wnc-'));
  const env = toolEnv(home);
  try {
    await run(input.chromePath, chromeArgs(page, png, path.join(home, 'profile')), env, deadline);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
  if ((await stat(png).catch(() => null))?.isFile() !== true) throw new ShareImageError('chrome wrote no screenshot');

  const jpg = path.join(workDir, 'card.jpg');
  try {
    await run(input.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-q:v', '3', jpg], env, deadline);
    return { file: jpg, type: 'image/jpeg' };
  } catch {
    return { file: png, type: 'image/png' };
  }
}

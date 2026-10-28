/**
 * Draws the pictures of the template variants (`packages/templates/variants/<template>/<variant>.json`) on the home PC
 * with the `inet-artgen` skill, one at a time, and keeps them as WebP in `packages/templates/library/<template>/<variant>/`.
 * The seed of every picture drawn is written back into its variant file, so a picture without `ref` can be drawn again exactly (one drawn after a `ref` only closely: the reference is now the resized file).
 * A picture is kept at the size a page shows it (`librarySize`: photos 900 px on the long side like `samples/`,
 * ornaments 512 px), and the variant's first slot also gives its 240 px thumbnail for the app's template picker
 * (`thumbs/<template>/<variant>.webp`).
 *
 *   pnpm exec tsx scripts/gen-template-art.ts --type tet --dry-run   # what would be drawn, nothing is called
 *   pnpm exec tsx scripts/gen-template-art.ts --type tet             # draw the Tết set (the first one due)
 *   pnpm exec tsx scripts/gen-template-art.ts --type wedding --variant vintage --slot cover --force
 *   pnpm exec tsx scripts/gen-template-art.ts --all
 *   pnpm exec tsx scripts/gen-template-art.ts --all --refit   # nothing drawn: resize pictures, write thumbnails
 *
 * Options: `--type <template>` or `--all`; `--variant <id>`; `--slot <slot>`; `--force` draws again pictures that
 * already exist (with their recorded seed: clear the seed in the file for a new picture); `--dry-run`; `--refit`
 * re-encodes pictures not at their library size and writes missing thumbnails, without the PC.
 *
 * Needs: the PC on (`artgen.py --health`), `cwebp` and `dwebp` (libwebp). The skill's script is found at
 * `~/.claude/skills/inet-artgen/artgen.py` (or `$ARTGEN`), run with the skills' venv Python when there is one.
 * The skill's rules apply: look at every picture before committing it; draw a broken one again at most once.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { artFile, librarySize, templateVariants, THUMB_WIDTH, thumbFile, webpSize, type TemplateVariant, type VariantArt } from '../packages/templates/src/variants';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE = join(ROOT, 'packages/templates');

interface Options {
  readonly types: readonly string[] | 'all';
  readonly variant?: string;
  readonly slot?: string;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly refit: boolean;
}

function usage(message: string): never {
  console.error(`${message}\nUsage: tsx scripts/gen-template-art.ts (--type <template> | --all) [--variant <id>] [--slot <slot>] [--force] [--dry-run] [--refit]`);
  process.exit(2);
}

function parseArgs(argv: readonly string[]): Options {
  const types: string[] = [];
  let all = false;
  let variant: string | undefined;
  let slot: string | undefined;
  let force = false;
  let dryRun = false;
  let refit = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (): string => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) usage(`${arg} needs a value`);
      i += 1;
      return next;
    };
    if (arg === '--type') types.push(value());
    else if (arg === '--all') all = true;
    else if (arg === '--variant') variant = value();
    else if (arg === '--slot') slot = value();
    else if (arg === '--force') force = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--refit') refit = true;
    else usage(`unknown argument: ${arg}`);
  }
  if (!all && types.length === 0) usage('say which templates: --type <template> or --all');
  return { types: all ? 'all' : types, variant, slot, force, dryRun, refit };
}

interface Job {
  readonly variant: TemplateVariant;
  readonly index: number;
  readonly art: VariantArt;
  /** Absolute path of the WebP. */
  readonly output: string;
}

function chosenVariants(options: Options): TemplateVariant[] {
  const variants = templateVariants().filter(
    (v) => (options.types === 'all' || options.types.includes(v.template)) && (!options.variant || v.id === options.variant),
  );
  if (variants.length === 0) usage('no variant matches');
  return variants;
}

function plan(options: Options): Job[] {
  return chosenVariants(options).flatMap((variant) =>
    variant.art
      .map((art, index) => ({ variant, index, art, output: join(PACKAGE, artFile(variant, art.slot)) }))
      .filter((job) => (!options.slot || job.art.slot === options.slot) && (options.force || !existsSync(job.output))),
  );
}

function artgenPath(): string {
  return process.env.ARTGEN ?? join(homedir(), '.claude/skills/inet-artgen/artgen.py');
}

function pythonPath(): string {
  const venv = process.platform === 'win32' ? join(homedir(), '.claude/skills/.venv/Scripts/python.exe') : join(homedir(), '.claude/skills/.venv/bin/python3');
  if (existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}

/** Runs a command; its stdout, or an error naming it with its stderr. */
function run(command: string, args: readonly string[], timeoutMs: number): string {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: timeoutMs });
  if (result.error) throw new Error(`${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}: ${(result.stderr || result.stdout).trim().slice(-800)}`);
  return result.stdout;
}

interface ArtgenResult {
  readonly ok: boolean;
  readonly files?: readonly string[];
  readonly seed?: number;
  readonly seconds?: number;
  readonly error?: string;
}

/** artgen prints one JSON line last: `{"ok": true, "files": [...], "seed": …}` or `{"ok": false, "error": …}`. */
function parseArtgen(stdout: string): ArtgenResult {
  const last = stdout.trim().split('\n').pop() ?? '';
  let data: unknown;
  try {
    data = JSON.parse(last);
  } catch {
    throw new Error(`artgen printed no JSON result: ${last.slice(0, 300)}`);
  }
  if (typeof data !== 'object' || data === null || typeof (data as { ok?: unknown }).ok !== 'boolean') throw new Error(`unexpected artgen result: ${last.slice(0, 300)}`);
  return data as ArtgenResult;
}

function artgenArgs(job: Job, png: string, ref: string | null): string[] {
  const args = [artgenPath(), job.art.prompt, '-w', job.art.model, '--size', job.art.size, '-o', png];
  if (job.art.seed !== null) args.push('--seed', String(job.art.seed));
  if (ref) args.push('--ref', ref);
  return args;
}

/** Writes the seed of a drawn picture into its variant file (the file is rewritten with two-space indent). */
function recordSeed(job: Job, seed: number): void {
  const file = join(PACKAGE, 'variants', job.variant.template, `${job.variant.id}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8')) as { art: { slot: string; seed: number | null }[] };
  const entry = data.art[job.index];
  if (!entry || entry.slot !== job.art.slot) throw new Error(`${file}: art ${job.index} is no longer ${job.art.slot}`);
  entry.seed = seed;
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

/** Encodes `input` (PNG or WebP) as the library picture of `art`, at its library size. */
function encodeLibrary(input: string, art: VariantArt, output: string): void {
  const { width, height } = librarySize(art);
  const transparent = art.model === 'zimage-transparent' ? ['-alpha_q', '100'] : [];
  run('cwebp', ['-quiet', '-q', '88', ...transparent, '-resize', String(width), String(height), input, '-o', output], 120_000);
}

/** Writes the variant's picker thumbnail from its first picture: THUMB_WIDTH wide, height in proportion. */
function writeThumb(variant: TemplateVariant): void {
  const [first] = variant.art;
  if (!first) throw new Error(`${variant.template}/${variant.id}: no art`);
  const output = join(PACKAGE, thumbFile(variant));
  mkdirSync(dirname(output), { recursive: true });
  run('cwebp', ['-quiet', '-q', '75', '-resize', String(THUMB_WIDTH), '0', join(PACKAGE, artFile(variant, first.slot)), '-o', output], 60_000);
}

function sizeOf(file: string): { width: number; height: number } | null {
  return existsSync(file) ? webpSize(readFileSync(file)) : null;
}

/** Re-encodes the chosen pictures not kept at their library size (in place), and writes thumbnails missing or wrong. */
function refit(options: Options): void {
  let resized = 0;
  let thumbs = 0;
  for (const variant of chosenVariants(options)) {
    for (const art of variant.art) {
      const file = join(PACKAGE, artFile(variant, art.slot));
      const size = sizeOf(file);
      if (!size) {
        console.log(`${artFile(variant, art.slot)}: not drawn yet, skipped`);
        continue;
      }
      const want = librarySize(art);
      if (size.width === want.width && size.height === want.height) continue;
      const tmp = `${file}.tmp.webp`;
      encodeLibrary(file, art, tmp);
      writeFileSync(file, readFileSync(tmp));
      rmSync(tmp);
      resized += 1;
      console.log(`${artFile(variant, art.slot)}: ${size.width}x${size.height} -> ${want.width}x${want.height}`);
    }
    const first = variant.art[0];
    if (first && sizeOf(join(PACKAGE, artFile(variant, first.slot))) && sizeOf(join(PACKAGE, thumbFile(variant)))?.width !== THUMB_WIDTH) {
      writeThumb(variant);
      thumbs += 1;
    }
  }
  console.log(`${resized} picture(s) resized, ${thumbs} thumbnail(s) written. Library: ${(libraryBytes() / 1024 / 1024).toFixed(1)} MB.`);
}

function libraryBytes(): number {
  const walk = (dir: string): number =>
    existsSync(dir) ? readdirSync(dir).reduce((sum, name) => sum + (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : statSync(join(dir, name)).size), 0) : 0;
  return walk(join(PACKAGE, 'library'));
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.refit) {
    run('cwebp', ['-version'], 10_000);
    refit(options);
    return;
  }
  const jobs = plan(options);
  if (jobs.length === 0) {
    console.log('Nothing to draw: every picture exists (use --force to draw again).');
    return;
  }
  for (const job of jobs) {
    const ref = job.art.ref ? ` ref=${job.art.ref}` : '';
    console.log(`${job.variant.template}/${job.variant.id} ${job.art.slot}: ${job.art.model} ${job.art.size} seed=${job.art.seed ?? 'new'}${ref} -> ${artFile(job.variant, job.art.slot)}`);
  }
  if (options.dryRun) {
    console.log(`${jobs.length} picture(s) planned (dry run, nothing drawn).`);
    return;
  }

  const python = pythonPath();
  if (!existsSync(artgenPath())) throw new Error(`artgen not found at ${artgenPath()} (set ARTGEN)`);
  run('cwebp', ['-version'], 10_000);
  run('dwebp', ['-version'], 10_000);
  const health = parseArtgen(run(python, [artgenPath(), '--health'], 30_000));
  if (!health.ok) throw new Error(`the PC is not answering (${health.error ?? 'artgen --health failed'}): turn on hoandat-pc and try again`);

  const work = mkdtempSync(join(tmpdir(), 'template-art-'));
  let drawn = 0;
  try {
    for (const job of jobs) {
      const png = join(work, `${job.variant.template}-${job.variant.id}-${job.art.slot}.png`);
      let refPng: string | null = null;
      if (job.art.ref) {
        const refWebp = join(PACKAGE, artFile(job.variant, job.art.ref));
        if (!existsSync(refWebp)) throw new Error(`${job.variant.id} ${job.art.slot}: draw ${job.art.ref} first (its picture is the reference)`);
        refPng = join(work, `ref-${job.variant.id}-${job.art.ref}.png`);
        run('dwebp', [refWebp, '-o', refPng], 60_000);
      }
      const result = parseArtgen(run(python, artgenArgs(job, png, refPng), 15 * 60_000));
      const file = result.files?.[0];
      if (!result.ok || !file || result.seed === undefined) throw new Error(`${job.variant.id} ${job.art.slot}: ${result.error ?? 'artgen gave no file or seed'}`);
      mkdirSync(dirname(job.output), { recursive: true });
      encodeLibrary(file, job.art, job.output);
      if (job.index === 0) writeThumb(job.variant);
      recordSeed(job, result.seed);
      drawn += 1;
      console.log(`  drawn in ${result.seconds ?? '?'} s, seed ${result.seed}: ${artFile(job.variant, job.art.slot)}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
    const mb = libraryBytes() / 1024 / 1024;
    console.log(`${drawn}/${jobs.length} drawn. Library: ${mb.toFixed(1)} MB (keep under 150 MB in the repo). Look at every picture before committing.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

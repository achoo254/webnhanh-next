/**
 * Draws brand/icon.svg and brand/icon-maskable.svg from the AI-made master icon (brand/app-icon-master-1024.png):
 * the master embedded as a 512 px WebP, the maskable one full-bleed on the tile violet with the artwork inside the
 * central 80% circle. The favicon, the web manifest and the shell's mark all read brand/icon.svg.
 *
 *   pnpm exec tsx scripts/brand-gen.ts
 *
 * Needs `cwebp` (libwebp), as scripts/gen-template-art.ts does. Run after changing the master, then commit the files.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(ROOT, 'brand/app-icon-master-1024.png');
/** The icon tile's violet, behind the maskable icon so the artwork can sit inside the safe zone. */
const TILE = '#6f55d9';
const NOTE =
  '<!-- Web Nhanh app icon: AI-generated (FLUX.2 klein with the inet-artgen skill, in the style of the ecosystem icons) for the hoandat ecosystem; owned by hoandat, all rights reserved (not CC0). Embedded as WebP from brand/app-icon-master-1024.png by scripts/brand-gen.ts. -->';

function webpBase64(size: number): string {
  const work = mkdtempSync(join(tmpdir(), 'brand-gen-'));
  try {
    const out = join(work, 'icon.webp');
    const result = spawnSync('cwebp', ['-quiet', '-resize', String(size), String(size), '-q', '90', '-alpha_q', '100', MASTER, '-o', out], { encoding: 'utf8' });
    if (result.error) throw new Error(`cwebp: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`cwebp exited ${result.status}: ${result.stderr.trim()}`);
    return readFileSync(out).toString('base64');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const icon = webpBase64(512);
writeFileSync(
  join(ROOT, 'brand/icon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${NOTE}<image width="512" height="512" href="data:image/webp;base64,${icon}"/></svg>\n`,
);
writeFileSync(
  join(ROOT, 'brand/icon-maskable.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${NOTE}<rect width="512" height="512" fill="${TILE}"/><image x="61" y="61" width="390" height="390" href="data:image/webp;base64,${icon}"/></svg>\n`,
);
console.log('Wrote brand/icon.svg and brand/icon-maskable.svg');

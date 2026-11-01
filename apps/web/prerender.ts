/*
 * Last step of the web build (vite-guide-pages.ts explains the approach): renders every guide page with the server
 * build of src/guides/guide-prerender.tsx and writes it as dist/<path>/index.html next to the SPA. Fails the build
 * when a page is missing or lacks its canonical or heading, so a broken page never ships as the bare SPA shell.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { asPrerenderModule, renderPageHtml, siteOrigin } from './vite-guide-pages.ts';

const DIST = new URL('./dist/', import.meta.url);
const SSR_DIR = new URL('./dist-ssr/', import.meta.url);

async function main(): Promise<void> {
  const entry = asPrerenderModule(await import(pathToFileURL(fileURLToPath(new URL('guide-prerender.js', SSR_DIR))).href));
  const template = readFileSync(new URL('index.html', DIST), 'utf8');
  const origin = siteOrigin();
  const paths = entry.guidePaths();
  for (const path of paths) {
    const page = entry.renderGuidePage(path, origin);
    if (page === null) throw new Error(`prerender: no page for ${path}`);
    const html = renderPageHtml(template, page);
    if (!html.includes(`<link rel="canonical" href="${origin}${path}" />`) || !page.html.includes('<h1')) {
      throw new Error(`prerender: ${path} has no canonical or heading`);
    }
    const file = new URL(`.${path}/index.html`, DIST);
    mkdirSync(dirname(fileURLToPath(file)), { recursive: true });
    writeFileSync(file, html);
  }
  rmSync(SSR_DIR, { recursive: true, force: true });
  console.log(`prerendered ${paths.length} guide pages into dist/`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

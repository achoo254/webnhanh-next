/*
 * Vite plugins of the web app.
 *
 * brandHead: the head tags from brand.config.json (title, description, Open Graph, favicon from brand/icon.svg, the web
 * app manifest). The app has one light theme and no inline script (the CSP allows none). The manifest lets phones install the app, which iPhone and iPad need before they allow Web
 * Push of new orders.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBrandConfig } from '@achoo254/brand/build';
import { primaryOrigin } from '@achoo254/brand/hosts';
import type { Plugin } from 'vite';

const REPO_ROOT = new URL('../../', import.meta.url);
/** Repo root as a file path (for fs.allow: the app imports its mark from brand/). */
export const REPO_ROOT_PATH = fileURLToPath(REPO_ROOT);

const BRAND_TAGS = '<!-- brand-tags -->';
const FAVICON = 'favicon.svg';
const MANIFEST = 'manifest.webmanifest';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);

export function brandHead(): Plugin[] {
  const brand = loadBrandConfig(REPO_ROOT);
  const icon = (): Buffer => readFileSync(new URL(brand.icon, REPO_ROOT));
  const origin = primaryOrigin(brand);
  const manifest = (): string =>
    JSON.stringify({
      name: brand.appName,
      short_name: brand.shortName,
      description: brand.description,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: brand.colors.background,
      theme_color: brand.colors.background,
      icons: [{ src: `/${FAVICON}`, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    });
  const tags = [
    `<title>${escapeHtml(brand.appName)}</title>`,
    `<meta name="description" content="${escapeHtml(brand.description)}" />`,
    `<meta name="theme-color" content="${brand.colors.background}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(brand.appName)}" />`,
    `<meta property="og:title" content="${escapeHtml(brand.appName)}" />`,
    `<meta property="og:description" content="${escapeHtml(brand.description)}" />`,
    `<meta property="og:url" content="${origin}/" />`,
    `<link rel="icon" type="image/svg+xml" href="/${FAVICON}" />`,
    `<link rel="manifest" href="/${MANIFEST}" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-title" content="${escapeHtml(brand.shortName)}" />`,
  ].join('\n    ');
  return [
    {
      name: 'webnhanh-favicon',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split('?')[0];
          if (path === `/${FAVICON}`) {
            res.setHeader('Content-Type', 'image/svg+xml');
            res.end(icon());
          } else if (path === `/${MANIFEST}`) {
            res.setHeader('Content-Type', 'application/manifest+json');
            res.end(manifest());
          } else next();
        });
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: FAVICON, source: icon() });
        this.emitFile({ type: 'asset', fileName: MANIFEST, source: manifest() });
      },
    },
    {
      name: 'webnhanh-head',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          if (html.split(BRAND_TAGS).length !== 2) throw new Error(`index.html must contain ${BRAND_TAGS} once`);
          return html.replace(BRAND_TAGS, tags);
        },
      },
    },
  ];
}

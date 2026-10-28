/*
 * Vite plugins of the web app.
 *
 * trangHead: the head tags from brand.config.json (title, description, Open Graph, favicon from brand/icon.svg) and
 * the shared theme script of @achoo254/app-shell, inline before the stylesheet so a dark choice never flashes white.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBrandConfig } from '@achoo254/brand/build';
import { primaryOrigin } from '@achoo254/brand/hosts';
import type { Plugin } from 'vite';
import { THEME_BOOTSTRAP_SCRIPT } from './src/theme-bootstrap.ts';

const REPO_ROOT = new URL('../../', import.meta.url);
/** Repo root as a file path (for fs.allow: the app imports its mark from brand/). */
export const REPO_ROOT_PATH = fileURLToPath(REPO_ROOT);

const BRAND_TAGS = '<!-- brand-tags -->';
const THEME_BOOTSTRAP = '<!--theme-bootstrap-->';
const FAVICON = 'favicon.svg';

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c);

export function trangHead(): Plugin[] {
  const brand = loadBrandConfig(REPO_ROOT);
  const icon = (): Buffer => readFileSync(new URL(brand.icon, REPO_ROOT));
  const origin = primaryOrigin(brand);
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
  ].join('\n    ');
  return [
    {
      name: 'trang-favicon',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== `/${FAVICON}`) return next();
          res.setHeader('Content-Type', 'image/svg+xml');
          res.end(icon());
        });
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: FAVICON, source: icon() });
      },
    },
    {
      name: 'trang-head',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          for (const marker of [BRAND_TAGS, THEME_BOOTSTRAP]) {
            if (html.split(marker).length !== 2) throw new Error(`index.html must contain ${marker} once`);
          }
          return html.replace(BRAND_TAGS, tags).replace(THEME_BOOTSTRAP, `<script>${THEME_BOOTSTRAP_SCRIPT}</script>`);
        },
      },
    },
  ];
}

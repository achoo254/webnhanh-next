/*
 * Real HTML for the guide pages (src/guides/guide-paths.ts), plus robots.txt and sitemap.xml, so search engines and
 * link previews that do not run JavaScript read each page's title, description, canonical, JSON-LD and words.
 *
 * The web app is a static SPA behind nginx. Rather than a server renderer, the pages are rendered once at build time
 * (the approach of tu-vi-next's yearly pages): `vite build --ssr src/guides/guide-prerender.tsx` builds the same React
 * components for Node (asset URLs match the client build), and prerender.ts writes dist/<path>/index.html from
 * dist/index.html. nginx serves `$uri/index.html` before falling back to the SPA. In dev, the plugin below renders the
 * same HTML on each request, so `pnpm dev` shows what production serves.
 */
import { readFileSync } from 'node:fs';
import { loadBrandConfig } from '@achoo254/brand/build';
import { primaryOrigin } from '@achoo254/brand/hosts';
import type { Plugin, ViteDevServer } from 'vite';
import { guideAt, SITEMAP_PAGES } from './src/guides/guide-paths.ts';
import type { RenderedGuide } from './src/guides/guide-render-types.ts';

export const PRERENDER_ENTRY = 'src/guides/guide-prerender.tsx';

const REPO_ROOT = new URL('../../', import.meta.url);

export interface PrerenderModule {
  renderGuidePage(path: string, origin: string): RenderedGuide | null;
  guidePaths(): string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

function isRenderedGuide(value: unknown): value is RenderedGuide {
  if (!isRecord(value) || typeof value.html !== 'string' || !isRecord(value.head) || !isRecord(value.jsonLd)) return false;
  const { title, description, url, image } = value.head;
  return typeof title === 'string' && typeof description === 'string' && typeof url === 'string' && typeof image === 'string';
}

/** Checks the module loaded at run time (the SSR build or the dev server's module) has the entry's shape. */
export function asPrerenderModule(value: unknown): PrerenderModule {
  if (!isRecord(value) || typeof value.renderGuidePage !== 'function' || typeof value.guidePaths !== 'function') {
    throw new Error(`${PRERENDER_ENTRY} does not export renderGuidePage and guidePaths`);
  }
  const render = value.renderGuidePage as (path: string, origin: string) => unknown;
  const paths = value.guidePaths as () => unknown;
  return {
    renderGuidePage(path, origin) {
      const page = render(path, origin);
      if (page === null) return null;
      if (!isRenderedGuide(page)) throw new Error(`renderGuidePage(${path}) returned an unexpected value`);
      return page;
    },
    guidePaths() {
      const list = paths();
      if (!Array.isArray(list) || !list.every((p): p is string => typeof p === 'string')) throw new Error('guidePaths() is not a list of paths');
      return list;
    },
  };
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (value: string): string => value.replace(/[&<>"]/g, (char) => HTML_ESCAPES[char] ?? char);

/** Replaces the single match of `pattern`; the template is ours, so anything else is a bug worth failing the build on. */
function replaceOnce(html: string, pattern: RegExp, replacement: string): string {
  const matches = html.match(new RegExp(pattern.source, 'g')) ?? [];
  if (matches.length !== 1) throw new Error(`prerender: expected one ${pattern.source} in index.html, found ${matches.length}`);
  return html.replace(pattern, () => replacement);
}

const metaProperty = (property: string): RegExp => new RegExp(`<meta property="${property}" content="[^"]*" />`);
const metaName = (name: string): RegExp => new RegExp(`<meta name="${name}" content="[^"]*" />`);

/** index.html (built, or transformed by the dev server) turned into the guide: its head tags, JSON-LD and body. */
export function renderPageHtml(template: string, page: RenderedGuide): string {
  const { head } = page;
  // "<" is escaped inside the JSON so no text can close the script element. A data block, not a script: the CSP
  // (no inline script) does not apply to it.
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`;
  const added = [
    `<link rel="canonical" href="${escapeHtml(head.url)}" />`,
    `<meta property="og:image" content="${escapeHtml(head.image)}" />`,
    '<meta property="og:image:width" content="240" />',
    '<meta property="og:image:height" content="320" />',
    '<meta property="og:locale" content="vi_VN" />',
    jsonLd,
  ].join('\n    ');
  let html = template;
  html = replaceOnce(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(head.title)}</title>`);
  html = replaceOnce(html, metaName('description'), `<meta name="description" content="${escapeHtml(head.description)}" />`);
  html = replaceOnce(html, metaProperty('og:title'), `<meta property="og:title" content="${escapeHtml(head.title)}" />`);
  html = replaceOnce(html, metaProperty('og:description'), `<meta property="og:description" content="${escapeHtml(head.description)}" />`);
  html = replaceOnce(html, metaProperty('og:url'), `<meta property="og:url" content="${escapeHtml(head.url)}" />`);
  html = replaceOnce(html, /<\/head>/, `  ${added}\n  </head>`);
  html = replaceOnce(html, /<div id="root"><\/div>/, `<div id="root">${page.html}</div>`);
  return html;
}

export function siteOrigin(): string {
  return primaryOrigin(loadBrandConfig(REPO_ROOT));
}

/** sitemap.xml of the public pages (guide-paths.ts). */
export function sitemapXml(origin: string): string {
  const urls = SITEMAP_PAGES.map(
    ({ path, changefreq, priority }) => `  <url><loc>${escapeHtml(`${origin}${path}`)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
  );
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n');
}

/** robots.txt: everything public may be crawled; the API, sign-in and the signed-in pages may not. */
export function robotsTxt(origin: string): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /auth/', 'Disallow: /sites/', 'Disallow: /admin', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

async function renderInDev(server: ViteDevServer, url: string, path: string): Promise<string | null> {
  const template = await server.transformIndexHtml(url, readFileSync(new URL('./index.html', import.meta.url), 'utf8'));
  const page = asPrerenderModule(await server.ssrLoadModule(`/${PRERENDER_ENTRY}`)).renderGuidePage(path, siteOrigin());
  return page === null ? null : renderPageHtml(template, page);
}

const ROBOTS = 'robots.txt';
const SITEMAP = 'sitemap.xml';

/**
 * robots.txt and sitemap.xml in the build (and in dev), and in dev the guide pages as prerendered HTML (the build
 * writes the same files with prerender.ts).
 */
export function guidePages(): Plugin {
  const origin = siteOrigin();
  let ssrBuild = false;
  return {
    name: 'webnhanh-guide-pages',
    configResolved(config) {
      ssrBuild = Boolean(config.build.ssr);
    },
    generateBundle() {
      // The SSR build of the guides writes no web files.
      if (ssrBuild) return;
      this.emitFile({ type: 'asset', fileName: ROBOTS, source: robotsTxt(origin) });
      this.emitFile({ type: 'asset', fileName: SITEMAP, source: sitemapXml(origin) });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '/';
        const path = url.split('?')[0] ?? '/';
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        if (path === `/${ROBOTS}` || path === `/${SITEMAP}`) {
          res.setHeader('Content-Type', path === `/${ROBOTS}` ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8');
          res.end(path === `/${ROBOTS}` ? robotsTxt(origin) : sitemapXml(origin));
          return;
        }
        if (guideAt(path) === null) {
          next();
          return;
        }
        renderInDev(server, url, path).then(
          (html) => {
            if (html === null) {
              next();
              return;
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(html);
          },
          (error: unknown) => next(error),
        );
      });
    },
  };
}

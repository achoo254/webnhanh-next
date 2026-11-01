// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { asPrerenderModule, renderPageHtml, robotsTxt, siteOrigin, sitemapXml } from '../../vite-guide-pages.ts';
import { brandIndexHtml } from '../../vite-head.ts';
import { GUIDE_PATHS } from './guide-paths.ts';

/*
 * What the build writes for each guide page (dist/<path>/index.html): the real index.html with the brand's tags, the
 * server entry of the guides, and the same splice prerender.ts does. Read as a crawler would, without running any
 * script. Then robots.txt, sitemap.xml and the nginx rule that serves those files.
 */
const INDEX_HTML = new URL('../../index.html', import.meta.url);
const NGINX_SITE = new URL('../../../../infra/nginx/webnhanh.hoandat.com.conf', import.meta.url);
// A path the type checker does not follow: the entry is a React module of the browser app (tsconfig.json checks it).
const ENTRY = new URL('./guide-prerender.tsx', import.meta.url).href;

async function builtPage(path: string): Promise<string> {
  const entry = asPrerenderModule(await import(ENTRY));
  const page = entry.renderGuidePage(path, siteOrigin());
  if (page === null) throw new Error(`no guide at ${path}`);
  return renderPageHtml(brandIndexHtml(readFileSync(INDEX_HTML, 'utf8')), page);
}

const tag = (html: string, pattern: RegExp): string => pattern.exec(html)?.[1] ?? '';
const jsonLdOf = (html: string): unknown => JSON.parse(tag(html, /<script type="application\/ld\+json">(.*?)<\/script>/));

const ORIGIN = 'https://webnhanh.hoandat.com';

const CASES = [
  { path: GUIDE_PATHS.wedding, title: /^Thiệp cưới online miễn phí/, h1: 'Thiệp cưới online miễn phí', cta: '/new?template=wedding', look: '/new?template=wedding&amp;variant=hoa-pastel' },
  { path: GUIDE_PATHS.shop, title: /^Làm website bán hàng miễn phí trên điện thoại/, h1: 'Làm website bán hàng miễn phí trên điện thoại', cta: '/new?template=shop', look: '/new?template=shop&amp;variant=quan-ao' },
  { path: GUIDE_PATHS.tet, title: /^Thiệp Tết 2027 online/, h1: 'Thiệp Tết 2027 online', cta: '/new?template=tet', look: '/new?template=tet&amp;variant=clay-hoa-dao' },
] as const;

describe('prerendered guide pages', () => {
  it.each(CASES)('$path: its own title, description, canonical and preview, the words and the call to action in the HTML', async ({ path, title, h1, cta, look }) => {
    const html = await builtPage(path);
    expect(tag(html, /<title>([^<]*)<\/title>/)).toMatch(title);
    expect(tag(html, /<title>([^<]*)<\/title>/)).toMatch(/\| Web Nhanh$/);
    const description = tag(html, /<meta name="description" content="([^"]*)" \/>/);
    expect(description.length).toBeGreaterThan(100);
    expect(description.length).toBeLessThanOrEqual(170);
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}${path}" />`);
    expect(html).toContain(`<meta property="og:url" content="${ORIGIN}${path}" />`);
    expect(tag(html, /<meta property="og:title" content="([^"]*)" \/>/)).toMatch(title);
    expect(tag(html, /<meta property="og:image" content="([^"]*)" \/>/)).toMatch(new RegExp(`^${ORIGIN}/.+\\.webp$`));
    // Exactly one of each head tag: the brand's defaults were replaced, not duplicated.
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/<meta name="description"/g)).toHaveLength(1);
    // The page itself, readable without the app's script.
    const root = tag(html, /<div id="root">([\s\S]*)<\/div>\s*<script/);
    expect(root).toContain(`>${h1}</h1>`);
    expect(root).toContain(`href="${cta}"`);
    expect(root).toContain(`href="${look}"`);
    expect(root).toContain('Câu hỏi thường gặp');
    const words = root.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(300);
    expect(words).toBeLessThanOrEqual(750);
    // Links to the two other guides.
    for (const other of Object.values(GUIDE_PATHS).filter((p) => p !== path)) expect(root).toContain(`href="${other}"`);
    // The data for search engines: the page and its questions, all on this URL.
    const jsonLd = jsonLdOf(html);
    expect(jsonLd).toMatchObject({ '@graph': [{ '@type': 'WebPage', url: `${ORIGIN}${path}`, inLanguage: 'vi' }, { '@type': 'FAQPage' }] });
    expect(tag(html, /<script type="application\/ld\+json">(.*?)<\/script>/)).not.toContain('<');
  });

  it('no guide at another path', async () => {
    const entry = asPrerenderModule(await import(ENTRY));
    expect(entry.renderGuidePage('/thiep-cuoi', ORIGIN)).toBeNull();
    expect(entry.guidePaths()).toEqual(Object.values(GUIDE_PATHS));
  });

  it('fails loudly when index.html lacks a tag it must replace', async () => {
    const entry = asPrerenderModule(await import(ENTRY));
    const page = entry.renderGuidePage(GUIDE_PATHS.tet, ORIGIN);
    if (page === null) throw new Error('no Tết guide');
    const template = brandIndexHtml(readFileSync(INDEX_HTML, 'utf8')).replace(/<meta property="og:url" content="[^"]*" \/>/, '');
    expect(() => renderPageHtml(template, page)).toThrow(/og:url/);
  });
});

describe('robots.txt, sitemap.xml and nginx', () => {
  it('lists the landing and the three guides in the sitemap', () => {
    const xml = sitemapXml(ORIGIN);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs[0]).toBe(`${ORIGIN}/`);
    for (const path of Object.values(GUIDE_PATHS)) expect(locs).toContain(`${ORIGIN}${path}`);
    expect(locs.some((loc) => loc?.includes('/sites/') || loc?.includes('/admin'))).toBe(false);
  });

  it('lets crawlers read the guides and points them to the sitemap', () => {
    const robots = robotsTxt(ORIGIN);
    expect(robots).toContain('Allow: /\n');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    const disallowed = [...robots.matchAll(/^Disallow: (.+)$/gm)].map((match) => match[1] ?? '');
    for (const path of Object.values(GUIDE_PATHS)) expect(disallowed.some((prefix) => path.startsWith(prefix))).toBe(false);
  });

  it('nginx serves <path>/index.html before falling back to the SPA', () => {
    const conf = readFileSync(NGINX_SITE, 'utf8');
    const app = conf.slice(conf.indexOf('location / {'));
    expect(app).toMatch(/try_files \$uri \$uri\/index\.html \/index\.html;/);
  });
});

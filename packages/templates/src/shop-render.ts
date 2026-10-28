/**
 * The shop page as one static HTML file: no script, no font or request to anyone else, CSS inline (one request
 * for the page, then only its photos), photos as WebP with `srcset` and their real size (no layout shift), only the
 * cover loaded eagerly. The same function renders the editor's preview and the published page; only the photo URLs
 * differ.
 */
import { facebookLink, phoneLink, zaloLink, type ContactLink } from './contact-links';
import { assertAssetUrl, escapeHtml } from './html';
import type { PaletteId, ShopDraft } from './shop-schema';

export interface ImageVariant {
  readonly url: string;
  readonly width: number;
}

/** One photo as the page can load it: its size, and one URL per stored width (ascending). */
export interface ImageAsset {
  readonly width: number;
  readonly height: number;
  readonly variants: readonly ImageVariant[];
}

/** Builds the asset of a stored photo from its widths and a URL per width. */
export function imageAsset(image: { width: number; height: number; widths: readonly number[] }, url: (width: number) => string): ImageAsset {
  const widths = [...image.widths].sort((a, b) => a - b);
  return { width: image.width, height: image.height, variants: widths.map((width) => ({ width, url: url(width) })) };
}

export interface RenderOptions {
  /** "Made with" line at the foot of the page: the app's name and address. */
  readonly madeWith?: { readonly name: string; readonly url: string };
}

export interface RenderedPage {
  readonly html: string;
}

interface Palette {
  readonly accent: string;
  readonly soft: string;
  readonly ink: string;
}

/** White text on every accent has a contrast of at least 4.5:1; `ink` on `soft` far more. */
export const PALETTES: Readonly<Record<PaletteId, Palette>> = {
  berry: { accent: '#6d4ae0', soft: '#f6f3ff', ink: '#1e1636' },
  rose: { accent: '#c2307a', soft: '#fff2f8', ink: '#3a1028' },
  sunset: { accent: '#c2410c', soft: '#fff4ec', ink: '#3b1d0c' },
  leaf: { accent: '#15803d', soft: '#f0faf3', ink: '#0f2e1a' },
  ocean: { accent: '#1d4ed8', soft: '#eff5ff', ink: '#0f1f45' },
  ink: { accent: '#1f1b2e', soft: '#f5f5f7', ink: '#1f1b2e' },
};

function css(palette: Palette): string {
  return `:root{--accent:${palette.accent};--soft:${palette.soft};--ink:${palette.ink};--muted:color-mix(in srgb,var(--ink) 70%,#fff)}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--soft);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
img{display:block;max-width:100%;height:auto}
a{color:inherit}
.hero{position:relative;background:var(--accent);color:#fff}
.hero img{width:100%;height:clamp(240px,62vw,460px);object-fit:cover}
.hero-text{padding:20px 18px 22px}
.has-cover .hero-text{position:absolute;inset:auto 0 0 0;padding-top:72px;background:linear-gradient(transparent,rgba(0,0,0,.72))}
h1{margin:0;font-size:clamp(28px,8vw,44px);line-height:1.08;font-weight:900;letter-spacing:-.02em;overflow-wrap:anywhere}
.lede{margin:8px 0 0;max-width:40em;white-space:pre-line;opacity:.95}
main{max-width:960px;margin:0 auto;padding:18px 14px 32px}
h2{margin:8px 4px 12px;font-size:20px;font-weight:800}
.products{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.product{background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.06)}
.product img{width:100%;aspect-ratio:1;object-fit:cover}
.product-text{padding:10px 12px 14px}
h3{margin:0;font-size:16px;font-weight:800;overflow-wrap:anywhere}
.desc{margin:4px 0 0;font-size:14px;color:var(--muted);white-space:pre-line;overflow-wrap:anywhere}
.price{margin:6px 0 0;font-weight:800;color:var(--accent)}
.contact{margin-top:28px}
.contact ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.contact a{display:flex;align-items:center;justify-content:center;min-height:52px;padding:12px 18px;border-radius:999px;background:var(--accent);color:#fff;font-weight:800;text-decoration:none;text-align:center;overflow-wrap:anywhere}
.contact a:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
footer{padding:18px 14px 28px;text-align:center;font-size:13px;color:var(--muted)}
@media (min-width:720px){.products{grid-template-columns:repeat(3,1fr)}.contact ul{grid-template-columns:repeat(3,1fr)}}`;
}

function img(asset: ImageAsset, alt: string, sizes: string, eager: boolean): string {
  const largest = asset.variants[asset.variants.length - 1];
  if (!largest) return '';
  const srcset = asset.variants.map((v) => `${assertAssetUrl(v.url)} ${v.width}w`).join(', ');
  const middle = asset.variants.find((v) => v.width >= 800) ?? largest;
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img src="${escapeHtml(assertAssetUrl(middle.url))}" srcset="${escapeHtml(srcset)}" sizes="${sizes}" width="${asset.width}" height="${asset.height}" alt="${escapeHtml(alt)}" decoding="async" ${loading}>`;
}

/** An http(s) address, as given; anything else is refused. */
function webUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`refused url: ${value}`);
  return url.href;
}

function contactItem(link: ContactLink | null, verb: string): string {
  if (!link) return '';
  return `<li><a href="${escapeHtml(link.href)}">${verb} ${escapeHtml(link.label)}</a></li>`;
}

/** The page for `draft`. Photos missing from `assets` are left out; so are empty texts and invalid contacts. */
export function renderShop(draft: ShopDraft, assets: ReadonlyMap<string, ImageAsset>, options: RenderOptions = {}): RenderedPage {
  const palette = PALETTES[draft.palette];
  const name = draft.name.trim();
  const description = draft.description.trim();
  const cover = draft.cover ? assets.get(draft.cover) : undefined;

  const products = draft.products
    .map((product) => {
      const photo = product.image ? assets.get(product.image) : undefined;
      const title = product.name.trim();
      const desc = product.description.trim();
      const price = product.price.trim();
      if (!title && !photo && !desc && !price) return '';
      return [
        '<li class="product">',
        photo ? img(photo, title, '(min-width:720px) 300px, 50vw', false) : '',
        '<div class="product-text">',
        title ? `<h3>${escapeHtml(title)}</h3>` : '',
        desc ? `<p class="desc">${escapeHtml(desc)}</p>` : '',
        price ? `<p class="price">${escapeHtml(price)}</p>` : '',
        '</div></li>',
      ].join('');
    })
    .filter(Boolean);

  const contacts = [
    contactItem(zaloLink(draft.contacts.zalo), 'Nhắn Zalo'),
    contactItem(phoneLink(draft.contacts.phone), 'Gọi'),
    contactItem(facebookLink(draft.contacts.facebook), 'Facebook'),
  ].filter(Boolean);

  const title = escapeHtml(name || 'Cửa hàng');
  const meta = description ? `<meta name="description" content="${escapeHtml(description.slice(0, 200))}">` : '';
  const madeWith = options.madeWith
    ? `<footer><a href="${escapeHtml(webUrl(options.madeWith.url))}">Làm bằng ${escapeHtml(options.madeWith.name)}</a></footer>`
    : '';

  const html = [
    '<!doctype html>',
    '<html lang="vi">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    meta,
    `<meta property="og:title" content="${title}">`,
    `<meta name="theme-color" content="${palette.accent}">`,
    `<style>${css(palette)}</style>`,
    '</head>',
    '<body>',
    `<header class="hero${cover ? ' has-cover' : ''}">`,
    cover ? img(cover, '', '100vw', true) : '',
    '<div class="hero-text">',
    name ? `<h1>${escapeHtml(name)}</h1>` : '',
    description ? `<p class="lede">${escapeHtml(description)}</p>` : '',
    '</div></header>',
    '<main>',
    products.length > 0 ? `<section aria-labelledby="sp"><h2 id="sp">Sản phẩm</h2><ul class="products">${products.join('')}</ul></section>` : '',
    contacts.length > 0 ? `<section class="contact" aria-labelledby="lh"><h2 id="lh">Liên hệ</h2><ul>${contacts.join('')}</ul></section>` : '',
    '</main>',
    madeWith,
    '</body>',
    '</html>',
    '',
  ]
    .filter((part) => part !== '')
    .join('\n');
  return { html: `${html}\n` };
}

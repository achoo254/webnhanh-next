/**
 * The shop page as one static HTML file: CSS inline, no request to anyone else (one request for the page, then its
 * own photos and, when given, its own font files), photos as WebP with `srcset` and their real size (no layout
 * shift), only the cover loaded eagerly. Its only script is the order form's. The same function renders the editor's
 * preview and the published page; only the photo and font URLs differ.
 */
import { facebookLink, phoneLink, zaloLink, type ContactLink } from './contact-links';
import { assertAssetUrl, escapeHtml } from './html';
import { ORDER_CSS, ORDER_SCRIPT_HASH, ORDER_SECTION_ID, orderFormHtml, type OrderFormOptions, type OrderProductOption } from './order-form';
import { styleFontFiles, type FontFile } from './shop-fonts';
import type { PaletteId, ShopDraft } from './shop-schema';
import { baseCss, SHOP_STYLES } from './shop-styles';

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

/** The preview picture of a link shared on Zalo or Facebook (`og:image`), by its absolute URL. */
export interface ShareImage {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly type: 'image/jpeg' | 'image/png';
}

export interface RenderOptions {
  /** "Made with" line at the foot of the page: the app's name and address. */
  readonly madeWith?: { readonly name: string; readonly url: string };
  /** The order form: where it posts and the page's signed token. Without it the page shows no form. */
  readonly orderForm?: OrderFormOptions;
  /** The page's own address (`og:url`) and its share picture, once it is published. */
  readonly page?: { readonly url: string; readonly image?: ShareImage };
  /**
   * Where the style's font files are (`styleFontFiles`), by file name: `fonts/<file>` beside a published page. Without
   * it the page uses the visitor's system fonts.
   */
  readonly fontUrl?: (file: string) => string;
}

/** The products visitors can order: those with a name, in the page's order. */
export function orderProducts(draft: ShopDraft): OrderProductOption[] {
  return draft.products.filter((p) => p.name.trim()).map((p) => ({ key: p.key, name: p.name.trim(), price: p.price.trim() }));
}

/**
 * The page's Content-Security-Policy: its own photos and fonts, its inline style, the order script by its fixed
 * hash, and sending only to the form's origin. Never anything else, whatever the owner typed.
 */
function contentSecurityPolicy(formOrigin: string | null, fonts: boolean): string {
  const parts = ["default-src 'none'", "img-src 'self'", "style-src 'unsafe-inline'", "base-uri 'none'"];
  if (fonts) parts.push("font-src 'self'");
  if (formOrigin) parts.push(`script-src '${ORDER_SCRIPT_HASH}'`, `connect-src ${formOrigin}`, `form-action ${formOrigin}`);
  else parts.push("form-action 'none'");
  return parts.join('; ');
}

export interface RenderedPage {
  readonly html: string;
}

interface Palette {
  readonly accent: string;
  readonly soft: string;
  readonly ink: string;
  /** A light second colour for stickers, tags and tape; `ink` on it reads at 4.5:1 or more. */
  readonly pop: string;
}

/** White text on every accent has a contrast of at least 4.5:1; `ink` on `soft` and on `pop` far more. */
export const PALETTES: Readonly<Record<PaletteId, Palette>> = {
  berry: { accent: '#6d4ae0', soft: '#f6f3ff', ink: '#1e1636', pop: '#ffd84d' },
  rose: { accent: '#c2307a', soft: '#fff2f8', ink: '#3a1028', pop: '#ffd84d' },
  sunset: { accent: '#c2410c', soft: '#fff4ec', ink: '#3b1d0c', pop: '#9ee6d0' },
  leaf: { accent: '#15803d', soft: '#f0faf3', ink: '#0f2e1a', pop: '#ffd84d' },
  ocean: { accent: '#1d4ed8', soft: '#eff5ff', ink: '#0f1f45', pop: '#ffc2a8' },
  ink: { accent: '#1f1b2e', soft: '#f5f5f7', ink: '#1f1b2e', pop: '#ffd84d' },
};

/** `@font-face` rules for `files`, each served from `fontUrl(file)` (checked like any asset URL). */
export function fontFaceCss(files: readonly FontFile[], fontUrl: (file: string) => string): string {
  return files
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${font.weight};font-display:swap;src:url(${assertAssetUrl(fontUrl(font.file))}) format("woff2");unicode-range:${font.range}}`,
    )
    .join('\n');
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

/** The origin of an http(s) address, for the page's CSP. */
function webUrlOrigin(value: string): string {
  return new URL(webUrl(value)).origin;
}

/** Open Graph and Twitter tags: what Zalo, Facebook and others show for a shared link. `title` is escaped already. */
function shareTags(title: string, description: string, page: RenderOptions['page']): string {
  const tags = ['<meta property="og:type" content="website">', `<meta property="og:title" content="${title}">`];
  if (description) tags.push(`<meta property="og:description" content="${escapeHtml(description.slice(0, 200))}">`);
  if (page) tags.push(`<meta property="og:url" content="${escapeHtml(webUrl(page.url))}">`);
  const image = page?.image;
  if (image) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(webUrl(image.url))}">`,
      `<meta property="og:image:type" content="${image.type}">`,
      `<meta property="og:image:width" content="${image.width}">`,
      `<meta property="og:image:height" content="${image.height}">`,
    );
  }
  tags.push(`<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`);
  return tags.join('\n');
}

const icon = (paths: string): string => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
const ICONS = {
  bag: icon('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  chat: icon('<path d="M4 5h16v11H10l-5 4v-4H4z"/>'),
  phone: icon('<path d="M6.5 3h3l1.7 4.4-2.2 1.4a11 11 0 0 0 6.2 6.2l1.4-2.2L21 14.5v3A2.5 2.5 0 0 1 18.5 20 15.5 15.5 0 0 1 4 5.5 2.5 2.5 0 0 1 6.5 3z"/>'),
  link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
} as const;

/** A way to act from the header and the phone's bottom bar. `href` is built by the renderer or a contact link. */
interface Action {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
}

function actionLink(action: Action, className: string): string {
  return `<a class="${className}" href="${escapeHtml(action.href)}">${action.icon}${action.label}</a>`;
}

function contactItem(link: ContactLink | null, verb: string, svg: string): string {
  if (!link) return '';
  return `<li><a href="${escapeHtml(link.href)}">${svg}<span class="c-verb">${verb}</span> <span class="c-value">${escapeHtml(link.label)}</span></a></li>`;
}

/** Copies of the name in the band: enough to cross a 2560 px screen even for a short name (the band hides the rest). */
const BAND_REPEATS = 24;

/** The page for `draft`. Photos missing from `assets` are left out; so are empty texts and invalid contacts. */
export function renderShop(draft: ShopDraft, assets: ReadonlyMap<string, ImageAsset>, options: RenderOptions = {}): RenderedPage {
  const palette = PALETTES[draft.palette];
  const style = SHOP_STYLES[draft.style];
  const name = draft.name.trim();
  const description = draft.description.trim();
  const cover = draft.cover ? assets.get(draft.cover) : undefined;

  const orderSection = options.orderForm ? orderFormHtml(orderProducts(draft), options.orderForm) : '';
  const formOrigin = orderSection && options.orderForm ? webUrlOrigin(options.orderForm.action) : null;
  const orderHref = `#${ORDER_SECTION_ID}`;

  const products = draft.products
    .map((product) => {
      const photo = product.image ? assets.get(product.image) : undefined;
      const title = product.name.trim();
      const desc = product.description.trim();
      const price = product.price.trim();
      if (!title && !photo && !desc && !price) return '';
      // Only named products are in the form, so only they can be picked.
      const pick =
        orderSection && title
          ? `<a class="pick" href="${orderHref}" data-p="${escapeHtml(product.key)}">Chọn mua<span class="vh"> ${escapeHtml(title)}</span></a>`
          : '';
      const foot = price || pick ? `<div class="product-foot">${price ? `<p class="price">${escapeHtml(price)}</p>` : ''}${pick}</div>` : '';
      return [
        `<li class="product${photo ? '' : ' no-photo'}">`,
        photo ? `<div class="product-photo">${img(photo, title, style.productSizes, false)}</div>` : '',
        '<div class="product-text">',
        title ? `<h3>${escapeHtml(title)}</h3>` : '',
        desc ? `<p class="desc">${escapeHtml(desc)}</p>` : '',
        foot,
        '</div></li>',
      ].join('');
    })
    .filter(Boolean);

  const zalo = zaloLink(draft.contacts.zalo);
  const phone = phoneLink(draft.contacts.phone);
  const contacts = [
    contactItem(zalo, 'Nhắn Zalo', ICONS.chat),
    contactItem(phone, 'Gọi', ICONS.phone),
    contactItem(facebookLink(draft.contacts.facebook), 'Facebook', ICONS.link),
  ].filter(Boolean);

  // The two things a visitor most likely came to do: order here, or reach the shop.
  const actions = [
    orderSection ? { href: orderHref, label: 'Đặt hàng', icon: ICONS.bag } : null,
    zalo ? { href: zalo.href, label: 'Nhắn Zalo', icon: ICONS.chat } : null,
    phone ? { href: phone.href, label: 'Gọi ngay', icon: ICONS.phone } : null,
  ]
    .filter((action): action is Action => action !== null)
    .slice(0, 2);
  const heroActions =
    actions.length > 0
      ? `<div class="actions">${actions.map((action, index) => actionLink(action, `btn ${index === 0 ? 'btn-primary' : 'btn-secondary'}`)).join('')}</div>`
      : '';
  const dock = actions.length > 0 ? `<nav class="dock" aria-label="Đặt nhanh">${actions.map((action) => actionLink(action, '')).join('')}</nav>` : '';

  const fontFiles = options.fontUrl ? styleFontFiles(draft.style) : [];
  const fontUrl = options.fontUrl;
  const fontCss = fontUrl ? fontFaceCss(fontFiles, fontUrl) : '';
  const preload = fontUrl && fontFiles[0] ? `<link rel="preload" href="${escapeHtml(assertAssetUrl(fontUrl(fontFiles[0].file)))}" as="font" type="font/woff2" crossorigin>` : '';

  const title = escapeHtml(name || 'Cửa hàng');
  const meta = description ? `<meta name="description" content="${escapeHtml(description.slice(0, 200))}">` : '';
  const madeWith = options.madeWith
    ? `<footer class="made"><a href="${escapeHtml(webUrl(options.madeWith.url))}">Làm bằng ${escapeHtml(options.madeWith.name)}</a></footer>`
    : '';
  const band = style.nameBand && name ? `<div class="band-wrap" aria-hidden="true"><p class="band">${`${escapeHtml(name)} ✦ `.repeat(BAND_REPEATS)}</p></div>` : '';
  const shareMeta = shareTags(title, description, options.page);
  const stylesheet = [fontCss, baseCss(draft.style, palette), orderSection ? ORDER_CSS : '', style.css].filter(Boolean).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="vi">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(contentSecurityPolicy(formOrigin, fontFiles.length > 0))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    meta,
    shareMeta,
    `<meta name="theme-color" content="${palette.accent}">`,
    preload,
    `<style>${stylesheet}</style>`,
    '</head>',
    `<body class="s-${draft.style}${dock ? ' has-dock' : ''}">`,
    `<header class="hero${cover ? ' has-cover' : ''}">`,
    '<div class="hero-text">',
    name ? `<h1>${escapeHtml(name)}</h1>` : '',
    description ? `<p class="lede">${escapeHtml(description)}</p>` : '',
    heroActions,
    '</div>',
    cover ? `<div class="hero-photo">${img(cover, '', style.coverSizes, true)}${style.coverOrnament}</div>` : '',
    '</header>',
    band,
    '<main>',
    products.length > 0 ? `<section class="menu" aria-labelledby="sp"><h2 id="sp">Sản phẩm</h2><ul class="products">${products.join('')}</ul></section>` : '',
    orderSection,
    contacts.length > 0 ? `<section class="contact" aria-labelledby="lh"><h2 id="lh">Liên hệ</h2><ul>${contacts.join('')}</ul></section>` : '',
    '</main>',
    madeWith,
    dock,
    '</body>',
    '</html>',
    '',
  ]
    .filter((part) => part !== '')
    .join('\n');
  return { html: `${html}\n` };
}

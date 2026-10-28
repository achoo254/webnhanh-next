/**
 * What every template's page is made of. Each page is one static HTML file: CSS inline, no request to anyone else
 * (one request for the page, then its own photos and, when given, its own font files), photos as WebP with `srcset`
 * and their real size (no layout shift), only the first photo loaded eagerly, a Content-Security-Policy in a meta tag.
 * The same functions render the editor's preview and the published page; only the photo and font URLs differ.
 */
import { facebookLink, phoneLink, zaloLink, type ContactLink } from './contact-links';
import { assertAssetUrl, escapeHtml } from './html';
import { baseCss, type StyleId } from './looks';
import { ORDER_SCRIPT_HASH } from './order-form';
import type { Palette } from './palettes';
import type { Contacts } from './schema-parts';
import { styleFontFiles, type FontFile } from './shop-fonts';

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

/** What every template's renderer takes besides the draft and its photos. */
export interface PageOptions {
  /** "Made with" line at the foot of the page: the app's name and address. */
  readonly madeWith?: { readonly name: string; readonly url: string };
  /** The page's own address (`og:url`) and its share picture, once it is published. */
  readonly page?: { readonly url: string; readonly image?: ShareImage };
  /**
   * Where the look's font files are (`styleFontFiles`), by file name: `fonts/<file>` beside a published page. Without
   * it the page uses the visitor's system fonts.
   */
  readonly fontUrl?: (file: string) => string;
}

export interface RenderedPage {
  readonly html: string;
}

/** `@font-face` rules for `files`, each served from `fontUrl(file)` (checked like any asset URL). */
export function fontFaceCss(files: readonly FontFile[], fontUrl: (file: string) => string): string {
  return files
    .map(
      (font) =>
        `@font-face{font-family:"${font.family}";font-style:normal;font-weight:${font.weight};font-display:swap;src:url(${assertAssetUrl(fontUrl(font.file))}) format("woff2");unicode-range:${font.range}}`,
    )
    .join('\n');
}

/** A photo with its `srcset`; `alt` is what the owner typed (escaped here) or '' for decoration. */
export function img(asset: ImageAsset, alt: string, sizes: string, eager: boolean): string {
  const largest = asset.variants[asset.variants.length - 1];
  if (!largest) return '';
  const srcset = asset.variants.map((v) => `${assertAssetUrl(v.url)} ${v.width}w`).join(', ');
  const middle = asset.variants.find((v) => v.width >= 800) ?? largest;
  const loading = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img src="${escapeHtml(assertAssetUrl(middle.url))}" srcset="${escapeHtml(srcset)}" sizes="${sizes}" width="${asset.width}" height="${asset.height}" alt="${escapeHtml(alt)}" decoding="async" ${loading}>`;
}

/** An http(s) address, as given; anything else is refused. */
export function webUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`refused url: ${value}`);
  return url.href;
}

/** The origin of an http(s) address, for the page's CSP. */
export function webUrlOrigin(value: string): string {
  return new URL(webUrl(value)).origin;
}

/**
 * The page's Content-Security-Policy: its own photos and fonts, its inline style, the form script by its fixed hash,
 * and sending only to the form's origin. Never anything else, whatever the owner typed.
 */
function contentSecurityPolicy(formOrigin: string | null, fonts: boolean): string {
  const parts = ["default-src 'none'", "img-src 'self'", "style-src 'unsafe-inline'", "base-uri 'none'"];
  if (fonts) parts.push("font-src 'self'");
  if (formOrigin) parts.push(`script-src '${ORDER_SCRIPT_HASH}'`, `connect-src ${formOrigin}`, `form-action ${formOrigin}`);
  else parts.push("form-action 'none'");
  return parts.join('; ');
}

/** Open Graph and Twitter tags: what Zalo, Facebook and others show for a shared link. `title` is escaped already. */
function shareTags(title: string, description: string, page: PageOptions['page']): string {
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
export const ICONS = {
  bag: icon('<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  chat: icon('<path d="M4 5h16v11H10l-5 4v-4H4z"/>'),
  phone: icon('<path d="M6.5 3h3l1.7 4.4-2.2 1.4a11 11 0 0 0 6.2 6.2l1.4-2.2L21 14.5v3A2.5 2.5 0 0 1 18.5 20 15.5 15.5 0 0 1 4 5.5 2.5 2.5 0 0 1 6.5 3z"/>'),
  link: icon('<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  pin: icon('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  mail: icon('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  heart: icon('<path d="M12 20s-7.5-4.6-9-9.4C2 7 4.4 4.5 7.3 4.5c2 0 3.6 1.2 4.7 2.9 1.1-1.7 2.7-2.9 4.7-2.9C19.6 4.5 22 7 21 10.6 19.5 15.4 12 20 12 20z"/>'),
  play: icon('<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>'),
  camera: icon('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/>'),
  note: icon('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
} as const;

/** A way to act from the header and the phone's bottom bar. `href` is built by the renderer or a contact link. */
export interface Action {
  readonly href: string;
  readonly label: string;
  readonly icon: string;
}

export function actionLink(action: Action, className: string): string {
  return `<a class="${className}" href="${escapeHtml(action.href)}">${action.icon}${action.label}</a>`;
}

/** The header's buttons (the first is the main one), or '' when there is nothing to do. */
export function heroActions(actions: readonly Action[]): string {
  if (actions.length === 0) return '';
  return `<div class="actions">${actions.map((action, index) => actionLink(action, `btn ${index === 0 ? 'btn-primary' : 'btn-secondary'}`)).join('')}</div>`;
}

/** The phone's bottom bar with up to two actions (hidden on wide screens), or ''. */
export function dockNav(actions: readonly Action[], label: string): string {
  if (actions.length === 0) return '';
  return `<nav class="dock" aria-label="${escapeHtml(label)}">${actions.map((action) => actionLink(action, '')).join('')}</nav>`;
}

/** One entry of a contact list: an icon, a verb and the address it goes to. `verb` is the template's own text. */
export function contactItem(link: ContactLink | null, verb: string, svg: string): string {
  if (!link) return '';
  return `<li><a href="${escapeHtml(link.href)}">${svg}<span class="c-verb">${verb}</span> <span class="c-value">${escapeHtml(link.label)}</span></a></li>`;
}

/** The working links among `contacts`. */
export function contactLinks(contacts: Contacts): { zalo: ContactLink | null; phone: ContactLink | null; facebook: ContactLink | null } {
  return { zalo: zaloLink(contacts.zalo), phone: phoneLink(contacts.phone), facebook: facebookLink(contacts.facebook) };
}

/** The usual contact entries of a page: Zalo, call, Facebook (those that work). */
export function contactItems(contacts: Contacts): string[] {
  const links = contactLinks(contacts);
  return [contactItem(links.zalo, 'Nhắn Zalo', ICONS.chat), contactItem(links.phone, 'Gọi', ICONS.phone), contactItem(links.facebook, 'Facebook', ICONS.link)].filter(
    Boolean,
  );
}

export interface ContactSectionParts {
  /** The template's own heading text. */
  readonly heading: string;
  /** Id of the heading. */
  readonly headingId: string;
  /** HTML under the heading (escaped by the caller), or ''. */
  readonly intro?: string;
  /** Id of the section, when buttons jump to it. */
  readonly id?: string;
}

/** A section listing `items` (from `contactItem`), or '' when there are none. */
export function contactSection(items: readonly string[], parts: ContactSectionParts): string {
  if (items.length === 0) return '';
  const id = parts.id ? ` id="${parts.id}"` : '';
  return `<section class="contact"${id} aria-labelledby="${parts.headingId}"><h2 id="${parts.headingId}">${parts.heading}</h2>${parts.intro ?? ''}<ul>${items.join('')}</ul></section>`;
}

/** Everything `pageDocument` needs. Texts are raw (escaped there); `body` and `dock` are HTML built by the template. */
export interface PageParts {
  readonly title: string;
  readonly description: string;
  readonly palette: Palette;
  readonly style: StyleId;
  /** The template's stylesheets, after the base stylesheet. */
  readonly css: readonly string[];
  readonly body: readonly string[];
  readonly dock?: string;
  /** The origin a form on the page posts to, which then also carries the form script; null for none. */
  readonly formOrigin: string | null;
  readonly options: PageOptions;
}

/** The whole HTML file: head (CSP, share tags, fonts, styles), then the body, the "made with" line and the bar. */
export function pageDocument(parts: PageParts): RenderedPage {
  const { options } = parts;
  const fontUrl = options.fontUrl;
  const fontFiles = fontUrl ? styleFontFiles(parts.style) : [];
  const fontCss = fontUrl ? fontFaceCss(fontFiles, fontUrl) : '';
  const preload = fontUrl && fontFiles[0] ? `<link rel="preload" href="${escapeHtml(assertAssetUrl(fontUrl(fontFiles[0].file)))}" as="font" type="font/woff2" crossorigin>` : '';
  const title = escapeHtml(parts.title);
  const description = parts.description;
  const meta = description ? `<meta name="description" content="${escapeHtml(description.slice(0, 200))}">` : '';
  const madeWith = options.madeWith
    ? `<footer class="made"><a href="${escapeHtml(webUrl(options.madeWith.url))}">Làm bằng ${escapeHtml(options.madeWith.name)}</a></footer>`
    : '';
  const dock = parts.dock ?? '';
  const stylesheet = [fontCss, baseCss(parts.style, parts.palette), ...parts.css].filter(Boolean).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="vi">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(contentSecurityPolicy(parts.formOrigin, fontFiles.length > 0))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
    meta,
    shareTags(title, description, options.page),
    `<meta name="theme-color" content="${parts.palette.accent}">`,
    preload,
    `<style>${stylesheet}</style>`,
    '</head>',
    `<body class="s-${parts.style}${dock ? ' has-dock' : ''}">`,
    ...parts.body,
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

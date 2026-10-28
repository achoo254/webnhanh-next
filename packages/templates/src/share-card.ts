/**
 * The share picture of a page (`og:image`, 1200×630): what Zalo and Facebook show for a shared link. Rendered as
 * HTML here and photographed by the worker's headless Chrome. It loads only files laid out beside it (the page's main photo
 * and the Inter font files named in CARD_FONTS), so the picture looks the same on any server, Vietnamese included.
 */
import { assertAssetUrl, escapeHtml } from './html';
import { LATIN_RANGE as LATIN, VIETNAMESE_RANGE as VIETNAMESE } from './shop-fonts';
import type { ImageAsset } from './page';
import { PALETTES, type PaletteId } from './palettes';
import type { ShopDraft } from './shop-schema';

export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;

/** Font files of `@fontsource/inter` (its `files/` directory) the card uses, with the characters each covers. */
export const CARD_FONTS = [
  { file: 'inter-latin-400-normal.woff2', weight: 400, range: LATIN },
  { file: 'inter-vietnamese-400-normal.woff2', weight: 400, range: VIETNAMESE },
  { file: 'inter-latin-800-normal.woff2', weight: 800, range: LATIN },
  { file: 'inter-vietnamese-800-normal.woff2', weight: 800, range: VIETNAMESE },
] as const;

export interface ShareCardOptions {
  /** Where the page lives, as people read it (`tiem-banh.hoandat.io.vn`). */
  readonly host: string;
  /** URL of a CARD_FONTS file beside the card. */
  readonly fontUrl: (file: string) => string;
}

/** What a card shows, taken from a draft by each template (`<template>ShareCard`). Texts are raw. */
export interface ShareCardContent {
  /** A short line above the title ("Xuân Đinh Mùi 2027"), or ''. */
  readonly kicker: string;
  readonly title: string;
  readonly description: string;
  readonly palette: PaletteId;
  /** The photo shown on the right (`site_images.id`), or null. */
  readonly photo: string | null;
}

export function shopShareCard(draft: ShopDraft): ShareCardContent {
  return { kicker: '', title: draft.name.trim() || 'Cửa hàng', description: draft.description.trim(), palette: draft.palette, photo: draft.cover };
}

/** The card of a shop page. */
export function renderShareCard(draft: ShopDraft, assets: ReadonlyMap<string, ImageAsset>, options: ShareCardOptions): string {
  return renderCard(shopShareCard(draft), assets, options);
}

/** The card's HTML: the photo on the right (when there is one), the kicker, title, description and address. */
export function renderCard(content: ShareCardContent, assets: ReadonlyMap<string, ImageAsset>, options: ShareCardOptions): string {
  const palette = PALETTES[content.palette];
  const cover = content.photo ? assets.get(content.photo) : undefined;
  const photo = cover?.variants.find((v) => v.width >= 600) ?? cover?.variants[cover.variants.length - 1];
  const fonts = CARD_FONTS.map(
    (font) => `@font-face{font-family:Card;font-weight:${font.weight};src:url(${assertAssetUrl(options.fontUrl(font.file))}) format("woff2");unicode-range:${font.range}}`,
  ).join('');
  const { title, description, kicker } = content;
  const { width, height } = SHARE_CARD_SIZE;
  return [
    '<!doctype html><html lang="vi"><head><meta charset="utf-8">',
    `<style>${fonts}`,
    `*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}`,
    `body{display:flex;background:${palette.accent};color:#fff;font-family:Card,sans-serif}`,
    `.text{flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:64px}`,
    kicker ? `.kicker{align-self:flex-start;background:${palette.pop};color:${palette.ink};border-radius:999px;padding:6px 22px;font-size:26px;font-weight:800}` : '',
    'h1{margin:0;font-size:76px;line-height:1.05;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    'p{margin:0;font-size:32px;line-height:1.35;opacity:.92;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.host{font-size:28px;font-weight:800;opacity:.85}',
    `.photo{width:${photo ? 520 : 0}px;height:${height}px;object-fit:cover;flex:none}`,
    '</style></head><body>',
    '<div class="text">',
    kicker ? `<div class="kicker">${escapeHtml(kicker)}</div>` : '',
    `<h1>${escapeHtml(title)}</h1>`,
    description ? `<p>${escapeHtml(description)}</p>` : '',
    `<div class="host">${escapeHtml(options.host)}</div>`,
    '</div>',
    photo ? `<img class="photo" src="${escapeHtml(assertAssetUrl(photo.url))}" alt="">` : '',
    '</body></html>',
  ].join('');
}

/**
 * The share picture of a shop page (`og:image`, 1200×630): what Zalo and Facebook show for a shared link. Rendered as
 * HTML here and photographed by the worker's headless Chrome. It loads only files laid out beside it (the cover photo
 * and the Inter font files named in CARD_FONTS), so the picture looks the same on any server, Vietnamese included.
 */
import { assertAssetUrl, escapeHtml } from './html';
import { LATIN_RANGE as LATIN, VIETNAMESE_RANGE as VIETNAMESE } from './shop-fonts';
import type { ImageAsset } from './shop-render';
import { PALETTES } from './shop-render';
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

/** The card's HTML: the cover photo on the right (when there is one), the shop's name, its description and address. */
export function renderShareCard(draft: ShopDraft, assets: ReadonlyMap<string, ImageAsset>, options: ShareCardOptions): string {
  const palette = PALETTES[draft.palette];
  const cover = draft.cover ? assets.get(draft.cover) : undefined;
  const photo = cover?.variants.find((v) => v.width >= 600) ?? cover?.variants[cover.variants.length - 1];
  const fonts = CARD_FONTS.map(
    (font) => `@font-face{font-family:Card;font-weight:${font.weight};src:url(${assertAssetUrl(options.fontUrl(font.file))}) format("woff2");unicode-range:${font.range}}`,
  ).join('');
  const name = draft.name.trim() || 'Cửa hàng';
  const description = draft.description.trim();
  const { width, height } = SHARE_CARD_SIZE;
  return [
    '<!doctype html><html lang="vi"><head><meta charset="utf-8">',
    `<style>${fonts}`,
    `*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}`,
    `body{display:flex;background:${palette.accent};color:#fff;font-family:Card,sans-serif}`,
    `.text{flex:1;display:flex;flex-direction:column;justify-content:center;gap:24px;padding:64px}`,
    'h1{margin:0;font-size:76px;line-height:1.05;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    'p{margin:0;font-size:32px;line-height:1.35;opacity:.92;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.host{font-size:28px;font-weight:800;opacity:.85}',
    `.photo{width:${photo ? 520 : 0}px;height:${height}px;object-fit:cover;flex:none}`,
    '</style></head><body>',
    '<div class="text">',
    `<h1>${escapeHtml(name)}</h1>`,
    description ? `<p>${escapeHtml(description)}</p>` : '',
    `<div class="host">${escapeHtml(options.host)}</div>`,
    '</div>',
    photo ? `<img class="photo" src="${escapeHtml(assertAssetUrl(photo.url))}" alt="">` : '',
    '</body></html>',
  ].join('');
}

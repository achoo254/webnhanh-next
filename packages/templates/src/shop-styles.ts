/**
 * The three looks of a shop page. They share one markup (written by `renderShop`) and one base stylesheet; each
 * style sets the shared custom properties (shapes, borders, shadows) and adds its own layout, type and decoration.
 * Colours come from the palette only, so every palette goes with every style.
 */
import { STYLE_FONTS } from './shop-fonts';
import { AM_CUNG_CSS } from './shop-style-am-cung';
import { RUC_RO_CSS } from './shop-style-ruc-ro';
import { TINH_TE_CSS } from './shop-style-tinh-te';
import type { StyleId } from './shop-schema';

export interface ShopStyle {
  readonly css: string;
  /** `sizes` of the cover photo and of a product photo, matching the style's layout. */
  readonly coverSizes: string;
  readonly productSizes: string;
  /** Inline SVG drawn with the cover photo (decoration, hidden from screen readers), or ''. */
  readonly coverOrnament: string;
  /** A tilted band repeating the shop's name under the header. */
  readonly nameBand: boolean;
}

const svg = (viewBox: string, body: string, className: string): string =>
  `<svg class="${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

/** A twelve-point sticker burst. */
const BURST = svg(
  '0 0 100 100',
  '<path fill="currentColor" stroke="var(--ink)" stroke-width="3" d="M50 3l8 15 16-7 1 17 17 2-8 15 13 11-15 8 5 16-17-1-4 17-14-10-14 10-4-17-17 1 5-16-15-8 13-11-8-15 17-2 1-17 16 7z"/>',
  'burst',
);

/** A hand-drawn heart, as if doodled beside the photo. */
const HEART = svg(
  '0 0 48 44',
  '<path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M24 40C10 30 4 22 5 14c1-7 8-11 14-8 3 1 4 4 5 6 1-3 3-6 7-7 6-1 12 4 11 11-1 9-9 16-18 24"/>',
  'doodle',
);

export const SHOP_STYLES: Readonly<Record<StyleId, ShopStyle>> = {
  'ruc-ro': {
    css: RUC_RO_CSS,
    coverSizes: '(min-width:720px) 520px, 100vw',
    productSizes: '(min-width:720px) 360px, 50vw',
    coverOrnament: BURST,
    nameBand: true,
  },
  'tinh-te': {
    css: TINH_TE_CSS,
    coverSizes: '(min-width:720px) 480px, 100vw',
    productSizes: '(min-width:720px) 128px, 104px',
    coverOrnament: '',
    nameBand: false,
  },
  'am-cung': {
    css: AM_CUNG_CSS,
    coverSizes: '(min-width:720px) 420px, 80vw',
    productSizes: '(min-width:720px) 320px, 50vw',
    coverOrnament: HEART,
    nameBand: false,
  },
};

const fontStack = (family: string, fallback: string): string => `"${family}",${fallback}`;

/** The base stylesheet: palette and font variables, then what every style shares. */
export function baseCss(style: StyleId, palette: { accent: string; soft: string; ink: string; pop: string }): string {
  const fonts = STYLE_FONTS[style];
  const body = fonts.body[0]?.family ?? fonts.display.family;
  const displayFallback = style === 'tinh-te' ? 'Georgia,"Times New Roman",serif' : 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
  return `:root{--accent:${palette.accent};--soft:${palette.soft};--ink:${palette.ink};--pop:${palette.pop};--muted:color-mix(in srgb,var(--ink) 74%,#fff);--display:${fontStack(fonts.display.family, displayFallback)};--body:${fontStack(body, 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif')}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.6 var(--body);-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%;height:auto}
a{color:inherit}
p{margin:0}
h1,h2,h3{margin:0;font-family:var(--display);text-wrap:balance;overflow-wrap:anywhere}
.lede,.desc{white-space:pre-line;overflow-wrap:anywhere}
.lede{text-wrap:pretty}
:focus-visible{outline:3px solid var(--focus,var(--accent));outline-offset:3px}
.order{scroll-margin-top:16px}
.products,.contact ul{list-style:none;margin:0;padding:0}
.product{min-width:0}
.price{font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.btn,.pick,.contact a,.dock a{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;text-decoration:none;font-weight:700;text-align:center;overflow-wrap:anywhere;transition:transform .15s,box-shadow .15s,background-color .15s}
.pick{min-height:44px}
.btn svg,.contact svg,.dock svg{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.actions{display:flex;flex-wrap:wrap;gap:12px}
.band-wrap{overflow:hidden;padding:16px 0}
.dock{position:fixed;z-index:10;display:flex;gap:8px}
.dock a{flex:1 1 0;min-width:0}
body.has-dock{padding-bottom:calc(88px + env(safe-area-inset-bottom))}
.vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.made{padding:24px 16px 32px;text-align:center;font-size:14px;color:var(--muted)}
@media (min-width:720px){.dock{display:none}body.has-dock{padding-bottom:0}}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition:none!important}}`;
}

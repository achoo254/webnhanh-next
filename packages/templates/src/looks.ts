/**
 * The three looks every template comes in ("Rực rỡ", "Tinh tế", "Ấm cúng"). A look is a body class (`s-<id>`), a pair
 * of typefaces (`shop-fonts.ts`) and three layers of CSS shared by the templates:
 *
 * - `LOOK_TOKENS`: the custom properties of the look's shapes (surfaces, corners, outlines, shadows, fields, buttons).
 * - `LOOK_CONTACT_CSS`: the contact list and the phone's bottom bar, the same component on every page.
 * - `LOOK_KIT_CSS`: section headings, buttons on the page background, cards and photo frames of the templates that came
 *   after the shop (the shop page keeps its own, written around its coloured header).
 *
 * Colours come from the palette only, so every palette goes with every look.
 */

import type { Palette } from './palettes';
import { STYLE_FONTS } from './shop-fonts';

/** Drafts saved before looks existed have none and read as DEFAULT_STYLE. */
export const STYLE_IDS = ['ruc-ro', 'tinh-te', 'am-cung'] as const;
export type StyleId = (typeof STYLE_IDS)[number];
export const DEFAULT_STYLE: StyleId = 'ruc-ro';

/** What the editor calls each look. */
export const STYLE_LABELS: Readonly<Record<StyleId, string>> = {
  'ruc-ro': 'Rực rỡ',
  'tinh-te': 'Tinh tế',
  'am-cung': 'Ấm cúng',
};

export const LOOK_TOKENS: Readonly<Record<StyleId, string>> = {
  'ruc-ro':
    '.s-ruc-ro{--bg:var(--soft);--surface:#fff;--radius:18px;--line:2.5px solid var(--ink);--card-line:var(--line);--card-shadow:5px 5px 0 var(--ink);--r-field:12px;--field-bg:#fff;--field-line:2px solid var(--ink);--r-btn:999px;--btn-shadow:3px 3px 0 var(--ink);--focus:var(--ink)}',
  'tinh-te':
    '.s-tinh-te{--bg:color-mix(in srgb,var(--soft) 40%,#fff);--surface:#fff;--radius:0;--rule:1px solid color-mix(in srgb,var(--ink) 20%,transparent);--card-line:0 solid transparent;--card-shadow:none;--r-field:0;--field-bg:#fff;--field-line:1.5px solid color-mix(in srgb,var(--ink) 55%,#fff);--r-btn:0;--btn-shadow:none}',
  'am-cung':
    '.s-am-cung{--bg:var(--soft);--surface:#fff;--radius:16px;--card-line:0 solid transparent;--card-shadow:0 1px 2px color-mix(in srgb,var(--ink) 10%,transparent),0 10px 28px color-mix(in srgb,var(--ink) 10%,transparent);--r-field:14px;--field-bg:color-mix(in srgb,var(--soft) 55%,#fff);--field-line:2px solid color-mix(in srgb,var(--ink) 55%,#fff);--r-btn:999px;--btn-shadow:0 4px 0 color-mix(in srgb,var(--accent) 55%,#000);--tilt:-1.2deg}',
};

export const LOOK_CONTACT_CSS: Readonly<Record<StyleId, string>> = {
  'ruc-ro': `.s-ruc-ro .contact ul{display:grid;gap:12px}
.s-ruc-ro .contact a{width:100%;flex-wrap:wrap;padding:14px 20px;border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);background:var(--surface);color:var(--ink);font-family:var(--display);font-size:19px;font-weight:800}
.s-ruc-ro .contact li:first-child a{background:var(--accent);color:#fff;--focus:var(--ink)}
.s-ruc-ro .contact li:nth-child(2) a{background:var(--pop)}
.s-ruc-ro .c-value{font-family:var(--body);font-size:15px;font-weight:600}
.s-ruc-ro .contact a:active{transform:translate(3px,3px);box-shadow:none}
.s-ruc-ro .dock{inset:auto 0 0 0;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--ink);border-top:var(--line)}
.s-ruc-ro .dock a{border-radius:999px;font-family:var(--display);font-size:17px;font-weight:800;background:#fff;color:var(--ink);--focus:var(--pop)}
.s-ruc-ro .dock a:first-child{background:var(--pop)}
@media (min-width:720px){
.s-ruc-ro .contact ul{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
}`,
  'tinh-te': `.s-tinh-te .contact ul{border-top:var(--rule)}
.s-tinh-te .contact a{width:100%;justify-content:flex-start;flex-wrap:wrap;gap:4px 14px;padding:16px 0;border-bottom:var(--rule);font-weight:400}
.s-tinh-te .contact svg{color:var(--accent)}
.s-tinh-te .c-verb{font:500 22px/1.2 var(--display)}
.s-tinh-te .c-value{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
.s-tinh-te .contact a:hover .c-verb{text-decoration:underline;text-underline-offset:5px}
.s-tinh-te .dock{inset:auto 0 0 0;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--surface);border-top:var(--rule)}
.s-tinh-te .dock a{font-weight:600;border:1.5px solid var(--ink)}
.s-tinh-te .dock a:first-child{background:var(--accent);border-color:var(--accent);color:#fff}
@media (min-width:720px){
.s-tinh-te .contact ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));column-gap:56px}
}`,
  'am-cung': `.s-am-cung .contact ul{display:grid;gap:14px;justify-items:center}
.s-am-cung .contact a{flex-wrap:wrap;width:min(100%,420px);padding:12px 24px;border-radius:28px;background:#fff;color:var(--ink);box-shadow:0 4px 0 color-mix(in srgb,var(--ink) 25%,transparent)}
.s-am-cung .contact li:first-child a{background:var(--accent);color:#fff;box-shadow:var(--btn-shadow)}
.s-am-cung .c-value{font-weight:400}
.s-am-cung .dock{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));padding:8px;background:#fff;border-radius:999px;box-shadow:0 8px 28px color-mix(in srgb,var(--ink) 22%,transparent)}
.s-am-cung .dock a{border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,#fff);color:var(--ink)}
.s-am-cung .dock a:first-child{background:var(--accent);color:#fff}
.s-am-cung .contact a:active{transform:translateY(4px);box-shadow:none}
@media (min-width:720px){
.s-am-cung .contact ul{grid-template-columns:repeat(auto-fit,minmax(260px,1fr));align-items:stretch}
.s-am-cung .contact a{width:100%;height:100%}
}`,
};

/**
 * Shared by the newer templates: `.wrap` (the page column), `h2`, `.btn-primary`/`.btn-secondary` on the page
 * background, `.card` (a raised surface) and `.frame` (a photo in the look's frame).
 */
export const LOOK_KIT_CSS: Readonly<Record<StyleId, string>> = {
  'ruc-ro': `.s-ruc-ro .wrap{max-width:1040px;margin:0 auto;padding:24px 12px 56px;display:grid;gap:48px}
.s-ruc-ro h2{font-size:clamp(30px,8.5vw,44px);line-height:1.05;letter-spacing:-.03em;font-weight:800;margin:0 4px 18px;text-decoration:underline wavy var(--accent);text-decoration-thickness:3px;text-underline-offset:.32em;text-decoration-skip-ink:auto}
.s-ruc-ro .btn{padding:12px 22px;border-radius:999px;font-family:var(--display);font-size:17px;font-weight:800;border:var(--line);box-shadow:var(--btn-shadow)}
.s-ruc-ro .btn-primary{background:var(--pop);color:var(--ink)}
.s-ruc-ro .btn-secondary{background:var(--surface);color:var(--ink)}
.s-ruc-ro .btn:active{transform:translate(3px,3px);box-shadow:none}
.s-ruc-ro .card{background:var(--surface);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);padding:20px 18px}
.s-ruc-ro .frame{position:relative}
.s-ruc-ro .frame img{width:100%;object-fit:cover;border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow)}
@media (min-width:720px){.s-ruc-ro .wrap{padding:40px 24px 80px;gap:72px}.s-ruc-ro .card{padding:28px}}`,
  'tinh-te': `.s-tinh-te .wrap{max-width:1040px;margin:0 auto;padding:56px 20px 80px;display:grid;gap:72px}
.s-tinh-te h2{display:flex;align-items:center;gap:20px;font-size:clamp(32px,8.5vw,48px);line-height:1.05;letter-spacing:-.02em;font-weight:500;margin-bottom:16px}
.s-tinh-te h2::after{content:"";flex:1;min-width:24px;height:1px;background:color-mix(in srgb,var(--ink) 35%,transparent)}
.s-tinh-te .btn{padding:12px 28px;font-weight:600;letter-spacing:.01em}
.s-tinh-te .btn-primary{background:var(--accent);color:#fff}
.s-tinh-te .btn-primary:hover{background:var(--ink)}
.s-tinh-te .btn-secondary{padding:12px 2px;border-bottom:1.5px solid currentColor}
.s-tinh-te .btn-secondary::after{content:"→";transition:transform .2s}
.s-tinh-te .btn-secondary:hover::after{transform:translateX(4px)}
.s-tinh-te .card{background:var(--surface);border:var(--rule);padding:24px 20px}
.s-tinh-te .frame{position:relative}
.s-tinh-te .frame img{width:100%;object-fit:cover}
.s-tinh-te .frame::after{content:"";position:absolute;inset:12px;border:1px solid rgb(255 255 255 / .75);pointer-events:none}
@media (min-width:720px){.s-tinh-te .wrap{padding:96px 32px 120px;gap:112px}.s-tinh-te .card{padding:36px}}`,
  'am-cung': `.s-am-cung{background-image:radial-gradient(color-mix(in srgb,var(--ink) 11%,transparent) 1.2px,transparent 1.8px);background-size:22px 22px}
.s-am-cung .wrap{max-width:1000px;margin:0 auto;padding:32px 16px 64px;display:grid;gap:56px}
.s-am-cung h2{text-align:center;font-size:clamp(30px,8.5vw,44px);line-height:1.1;font-weight:700;margin-bottom:22px}
.s-am-cung h2::after{content:"";display:block;width:64px;height:10px;margin:6px auto 0;border-radius:999px;background:var(--pop);transform:rotate(-2deg)}
.s-am-cung .btn{padding:12px 26px;border-radius:999px;font-size:17px}
.s-am-cung .btn-primary{background:var(--accent);color:#fff;box-shadow:var(--btn-shadow)}
.s-am-cung .btn-secondary{background:#fff;color:var(--ink);box-shadow:0 4px 0 color-mix(in srgb,var(--ink) 30%,transparent)}
.s-am-cung .btn:active{transform:translateY(4px);box-shadow:none}
.s-am-cung .card{background:var(--surface);border-radius:24px;box-shadow:var(--card-shadow);padding:22px 18px}
.s-am-cung .frame{position:relative;padding:10px 10px 36px;background:#fff;border-radius:6px;box-shadow:var(--card-shadow);transform:rotate(-2deg)}
.s-am-cung .frame::before{content:"";position:absolute;z-index:1;top:-14px;left:50%;width:112px;height:30px;margin-left:-56px;background:color-mix(in srgb,var(--pop) 85%,transparent);transform:rotate(4deg)}
.s-am-cung .frame img{width:100%;object-fit:cover;border-radius:3px}
@media (min-width:720px){.s-am-cung .wrap{padding:64px 32px 96px;gap:88px}.s-am-cung .card{padding:32px}}`,
};

const fontStack = (family: string, fallback: string): string => `"${family}",${fallback}`;

/** The base stylesheet of every page: palette and font variables, then what every look shares. */
export function baseCss(style: StyleId, palette: Palette): string {
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

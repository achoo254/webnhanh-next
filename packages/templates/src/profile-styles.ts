/**
 * The profile / link-in-bio page's CSS. `PROFILE_CSS` lays out one centred column; `PROFILE_LOOK_CSS` dresses it:
 * "Rực rỡ" chunky sticker buttons on a colour block, "Tinh tế" a quiet list with hairlines and arrows, "Ấm cúng" soft
 * pills under a taped photo.
 */
export const PROFILE_CSS = `.p-main{max-width:560px;margin:0 auto;padding:40px 18px 56px;display:grid;gap:32px}
.p-head{display:grid;justify-items:center;gap:12px;text-align:center}
.p-avatar{width:132px;height:132px;border-radius:50%;overflow:hidden;margin-bottom:6px}
.p-avatar img{width:100%;height:100%;object-fit:cover}
.p-initials{display:grid;place-items:center;background:var(--accent);color:#fff;font:700 48px/1 var(--display)}
.p-head h1{font-size:clamp(34px,10vw,52px);line-height:1.05}
.p-headline{font-weight:600;font-size:17px;overflow-wrap:anywhere}
.p-bio{color:var(--muted);max-width:38ch;white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty}
.p-socials{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.p-socials a{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;text-decoration:none}
.p-socials svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.p-links{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.p-link{display:grid;gap:2px;justify-items:center;min-height:60px;padding:14px 20px;text-align:center;text-decoration:none;transition:transform .15s,box-shadow .15s}
.p-label{font-weight:700;font-size:18px;overflow-wrap:anywhere}
.p-host{font-size:13px;opacity:.75;overflow-wrap:anywhere}
.made{padding-top:0}`;

export const PROFILE_LOOK_CSS = {
  'ruc-ro': `body.s-ruc-ro{background:linear-gradient(var(--accent) 0 112px,var(--soft) 112px)}
.s-ruc-ro .p-avatar{border:var(--line);box-shadow:var(--card-shadow);background:#fff}
.s-ruc-ro .p-initials{background:var(--pop);color:var(--ink)}
.s-ruc-ro .p-head h1{font-weight:800;letter-spacing:-.03em}
.s-ruc-ro .p-socials a{background:#fff;color:var(--ink);border:2px solid var(--ink);box-shadow:3px 3px 0 var(--ink)}
.s-ruc-ro .p-link{background:var(--surface);color:var(--ink);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);font-family:var(--display)}
.s-ruc-ro .p-links li:first-child .p-link{background:var(--pop)}
.s-ruc-ro .p-link:active,.s-ruc-ro .p-socials a:active{transform:translate(3px,3px);box-shadow:none}
.s-ruc-ro .p-label{font-weight:800}`,
  'tinh-te': `.s-tinh-te .p-main{padding-top:64px}
.s-tinh-te .p-avatar{width:120px;height:120px}
.s-tinh-te .p-initials{background:none;color:var(--accent);border:1px solid var(--accent);font-weight:500}
.s-tinh-te .p-head h1{font-weight:500;letter-spacing:-.02em}
.s-tinh-te .p-headline{color:var(--accent);font-weight:600}
.s-tinh-te .p-socials a{color:var(--ink);border:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.s-tinh-te .p-socials a:hover{background:var(--ink);color:#fff}
.s-tinh-te .p-links{gap:0;border-top:var(--rule)}
.s-tinh-te .p-link{grid-template-columns:minmax(0,1fr) auto;justify-items:start;text-align:left;padding:18px 2px;border-bottom:var(--rule)}
.s-tinh-te .p-link::after{content:"→";grid-column:2;grid-row:1/3;align-self:center;color:var(--accent);transition:transform .2s}
.s-tinh-te .p-link:hover::after{transform:translateX(4px)}
.s-tinh-te .p-label{font:500 22px/1.25 var(--display)}`,
  'am-cung': `.s-am-cung .p-avatar{border-radius:8px;padding:8px 8px 26px;background:#fff;box-shadow:var(--card-shadow);transform:rotate(-3deg);width:150px;height:auto;overflow:visible}
.s-am-cung .p-avatar img,.s-am-cung .p-initials{aspect-ratio:1;border-radius:4px}
.s-am-cung .p-initials{width:150px;height:150px;padding:0;border:8px solid #fff;border-bottom-width:26px;background:var(--accent);color:#fff}
.s-am-cung .p-head h1{font-weight:700}
.s-am-cung .p-socials a{background:#fff;color:var(--ink);box-shadow:0 3px 0 color-mix(in srgb,var(--ink) 25%,transparent)}
.s-am-cung .p-link{background:#fff;color:var(--ink);border-radius:999px;box-shadow:0 4px 0 color-mix(in srgb,var(--ink) 22%,transparent)}
.s-am-cung .p-links li:first-child .p-link{background:var(--accent);color:#fff;box-shadow:var(--btn-shadow)}
.s-am-cung .p-link:active,.s-am-cung .p-socials a:active{transform:translateY(4px);box-shadow:none}`,
} as const;

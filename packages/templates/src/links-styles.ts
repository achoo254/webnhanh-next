/**
 * The link-in-bio page's CSS. `LINKS_CSS` lays out one narrow column: the banner, the avatar over its lower edge, the
 * contact pills and the link buttons. `LINKS_LOOK_CSS` dresses it: "Rực rỡ" chunky Gen Z stickers, "Tinh tế" a quiet
 * office list with hairlines, "Ấm cúng" soft rounded pills.
 */
export const LINKS_CSS = `.l-head{max-width:560px;margin:0 auto;padding:40px 18px 0;display:grid;justify-items:center;gap:10px;text-align:center}
.l-head.has-cover{padding-top:0}
.l-cover{width:calc(100% + 36px);margin:0 -18px}
.l-cover img{width:100%;aspect-ratio:16/9;object-fit:cover}
.l-avatar{width:120px;height:120px;border-radius:50%;overflow:hidden;background:var(--surface)}
.has-cover .l-avatar{margin-top:-60px;border:4px solid var(--bg);position:relative}
.l-avatar img{width:100%;height:100%;object-fit:cover}
.l-initials{display:grid;place-items:center;background:var(--accent);color:#fff;font:700 44px/1 var(--display)}
.l-head h1{font-size:clamp(30px,9vw,46px);line-height:1.05;margin-top:4px}
.l-handle{font-weight:700;color:var(--accent);overflow-wrap:anywhere}
.l-bio{color:var(--muted);max-width:36ch;white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty}
.l-contacts{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.l-contact{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:8px 18px;text-decoration:none;font-weight:700}
.l-contact svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.l-main{max-width:560px;margin:0 auto;padding:28px 18px 56px}
.l-links{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.l-link{display:grid;gap:2px;justify-items:center;min-height:62px;padding:14px 20px;text-align:center;text-decoration:none;transition:transform .15s,box-shadow .15s}
.l-pending{opacity:.55}
.l-label{font-weight:700;font-size:18px;overflow-wrap:anywhere}
.l-host{font-size:13px;opacity:.75;overflow-wrap:anywhere}
.made{padding-top:0}
@media (min-width:600px){.l-cover{width:100%;margin:16px 0 0}.l-cover img{border-radius:var(--radius)}}`;

export const LINKS_LOOK_CSS = {
  'ruc-ro': `.s-ruc-ro .l-cover img{border-bottom:var(--line)}
.s-ruc-ro .l-avatar{border:var(--line);box-shadow:var(--card-shadow)}
.s-ruc-ro .has-cover .l-avatar{border:var(--line)}
.s-ruc-ro .l-initials{background:var(--pop);color:var(--ink)}
.s-ruc-ro .l-head h1{font-weight:800;letter-spacing:-.03em}
.s-ruc-ro .l-handle{display:inline-block;padding:2px 12px;border:2px solid var(--ink);border-radius:999px;background:var(--pop);color:var(--ink);transform:rotate(-2deg)}
.s-ruc-ro .l-contact{background:#fff;color:var(--ink);border:2px solid var(--ink);border-radius:999px;box-shadow:3px 3px 0 var(--ink)}
.s-ruc-ro .l-link{background:var(--surface);color:var(--ink);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);font-family:var(--display)}
.s-ruc-ro .l-links li:first-child .l-link{background:var(--accent);color:#fff}
.s-ruc-ro .l-link:active,.s-ruc-ro .l-contact:active{transform:translate(3px,3px);box-shadow:none}
.s-ruc-ro .l-label{font-weight:800}
.s-ruc-ro .l-pending{border-style:dashed}
@media (min-width:600px){.s-ruc-ro .l-cover img{border:var(--line)}}`,
  'tinh-te': `.s-tinh-te .l-avatar{width:112px;height:112px}
.s-tinh-te .l-initials{background:none;color:var(--accent);border:1px solid var(--accent);font-weight:500}
.s-tinh-te .l-head h1{font-weight:500;letter-spacing:-.02em}
.s-tinh-te .l-handle{font-weight:600;letter-spacing:.02em}
.s-tinh-te .l-contact{color:var(--ink);border:1px solid color-mix(in srgb,var(--ink) 30%,transparent)}
.s-tinh-te .l-contact:hover{background:var(--ink);color:#fff}
.s-tinh-te .l-links{gap:0;border-top:var(--rule)}
.s-tinh-te .l-link{grid-template-columns:minmax(0,1fr) auto;justify-items:start;text-align:left;padding:18px 2px;border-bottom:var(--rule)}
.s-tinh-te .l-link::after{content:"→";grid-column:2;grid-row:1/3;align-self:center;color:var(--accent);transition:transform .2s}
.s-tinh-te .l-link:hover::after{transform:translateX(4px)}
.s-tinh-te .l-label{font:500 21px/1.25 var(--display)}`,
  'am-cung': `.s-am-cung .l-avatar{box-shadow:var(--card-shadow)}
.s-am-cung .l-head h1{font-weight:700}
.s-am-cung .l-handle{color:var(--accent)}
.s-am-cung .l-contact{background:#fff;color:var(--ink);border-radius:999px;box-shadow:0 3px 0 color-mix(in srgb,var(--ink) 25%,transparent)}
.s-am-cung .l-link{background:#fff;color:var(--ink);border-radius:999px;box-shadow:0 4px 0 color-mix(in srgb,var(--ink) 22%,transparent)}
.s-am-cung .l-links li:first-child .l-link{background:var(--accent);color:#fff;box-shadow:var(--btn-shadow)}
.s-am-cung .l-link:active,.s-am-cung .l-contact:active{transform:translateY(4px);box-shadow:none}`,
} as const;

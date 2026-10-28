/**
 * The restaurant / café page's CSS. `CAFE_CSS` lays out the header, the menu (name and price on one line, a dotted
 * leader between them on wide screens), the hours table and the booking list; `CAFE_LOOK_CSS` dresses them: "Rực rỡ"
 * a chalk-free sticker board, "Tinh tế" a printed menu card over a film photo, "Ấm cúng" a handwritten-feeling menu
 * pinned on dotted paper.
 */
export const CAFE_CSS = `.c-hero{display:grid}
.c-text{display:grid;gap:16px;padding:28px 20px 0}
.c-hero h1{font-size:clamp(44px,13vw,92px);line-height:.98}
.c-hero .lede{font-size:18px;max-width:36ch;color:var(--muted)}
.menu{display:grid;gap:8px}
.m-nav{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 12px;margin:0 -2px;scrollbar-width:none}
.m-nav a{flex:none;display:inline-flex;align-items:center;min-height:44px;padding:8px 16px;border-radius:999px;background:var(--surface);border:1.5px solid color-mix(in srgb,var(--ink) 20%,transparent);text-decoration:none;font-weight:600;white-space:nowrap}
.m-sec{scroll-margin-top:16px;display:grid;gap:4px;margin-top:20px}
.m-sec h3{font-size:24px;line-height:1.2}
.m-items{list-style:none;margin:0;padding:0}
.m-item{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}
.m-item.has-photo{grid-template-columns:72px minmax(0,1fr)}
.m-photo img{width:72px;height:72px;object-fit:cover;border-radius:var(--radius)}
.m-text{display:grid;gap:4px}
.m-line{display:flex;align-items:baseline;gap:12px}
.m-name{flex:1;font-weight:700;font-size:17px;overflow-wrap:anywhere}
.m-price{flex:none;max-width:45%;text-align:right;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.m-desc{font-size:15px;color:var(--muted);white-space:pre-line;overflow-wrap:anywhere}
.visit{display:grid;gap:18px}
.visit h2{font-size:clamp(26px,7vw,34px);margin-bottom:12px}
.hours table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.hours th,.hours td{padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--ink) 14%,transparent);vertical-align:top;overflow-wrap:anywhere}
.hours tr:last-child th,.hours tr:last-child td{border-bottom:0}
.hours th{text-align:left;font-weight:600;padding-right:12px}
.hours td{text-align:right}
.where{display:grid;gap:14px;align-content:start}
.where .addr{font-size:17px;overflow-wrap:anywhere}
.where .btn{justify-self:start}
.booking-intro{text-align:center;color:var(--muted);margin:-6px 0 18px}
.contact{scroll-margin-top:16px}
@media (min-width:720px){
.c-hero.has-cover{max-width:1040px;margin:0 auto;padding:48px 24px 0;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:48px;align-items:end}
.c-hero.has-cover .c-cover{order:2}
.c-text{padding:0}
.m-line .m-name{display:flex;align-items:baseline}
.m-line .m-name::after{content:"";flex:1;min-width:16px;margin-left:10px;border-bottom:1.5px dotted color-mix(in srgb,var(--ink) 45%,transparent)}
.m-sec .m-items{columns:2;column-gap:48px}
.m-item{break-inside:avoid}
.visit{grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start}
}`;

export const CAFE_LOOK_CSS = {
  'ruc-ro': `.s-ruc-ro .c-hero{padding:12px 12px 0;gap:14px}
.s-ruc-ro .c-cover img{aspect-ratio:4/3}
.s-ruc-ro .c-text{background:var(--accent);color:#fff;border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);padding:28px 20px 24px;--focus:#fff}
.s-ruc-ro .c-hero .lede{color:#fff}
.s-ruc-ro .c-hero h1{font-weight:800;letter-spacing:-.035em}
.s-ruc-ro .c-hero .btn-secondary{background:transparent;color:#fff;border-color:#fff;box-shadow:none}
.s-ruc-ro .m-nav a{border:2px solid var(--ink);background:var(--pop);color:var(--ink)}
.s-ruc-ro .m-sec h3{font-weight:800}
.s-ruc-ro .m-items{background:var(--surface);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);padding:2px 16px}
.s-ruc-ro .m-item:last-child{border-bottom:0}
.s-ruc-ro .m-price{background:var(--pop);color:var(--ink);border:2px solid var(--ink);border-radius:999px;padding:0 10px}
@media (min-width:720px){.s-ruc-ro .c-hero.has-cover{padding-top:24px;align-items:stretch}.s-ruc-ro .c-text{padding:48px 40px}.s-ruc-ro .c-cover img{height:100%;aspect-ratio:auto}}`,
  'tinh-te': `.s-tinh-te .c-cover img{aspect-ratio:4/5;max-height:72vh;filter:saturate(.92) contrast(1.02)}
.s-tinh-te .c-text{padding-top:36px}
.s-tinh-te .c-text::before{content:"";width:48px;height:3px;background:var(--accent)}
.s-tinh-te .c-hero h1{font-weight:500;letter-spacing:-.025em}
.s-tinh-te .m-nav a{border-radius:0;border-width:0 0 1.5px;background:none;padding-inline:4px}
.s-tinh-te .m-sec h3{font-weight:500;font-size:26px}
.s-tinh-te .m-name{font-weight:600}
.s-tinh-te .m-price{font-weight:600}
.s-tinh-te .hours,.s-tinh-te .where{background:none;border:0;border-top:var(--rule);padding:24px 0 0}
.s-tinh-te .visit h2::after{display:none}
.s-tinh-te .where .btn{padding:12px 28px}
.s-tinh-te .contact h2{justify-content:flex-start}`,
  'am-cung': `.s-am-cung .c-hero{padding:36px 20px 0;justify-items:center;text-align:center}
.s-am-cung .c-cover{width:min(82%,340px)}
.s-am-cung .c-cover img{aspect-ratio:1}
.s-am-cung .c-text{justify-items:center}
.s-am-cung .c-hero .actions{justify-content:center}
.s-am-cung .c-hero h1{font-weight:700;text-decoration:underline wavy color-mix(in srgb,var(--accent) 65%,transparent);text-decoration-thickness:3px;text-underline-offset:.32em;text-decoration-skip-ink:auto}
.s-am-cung .m-nav{justify-content:safe center}
.s-am-cung .m-nav a{border:0;box-shadow:0 3px 0 color-mix(in srgb,var(--accent) 35%,#fff);background:color-mix(in srgb,var(--accent) 12%,#fff)}
.s-am-cung .m-sec{background:var(--surface);border-radius:24px;box-shadow:var(--card-shadow);padding:18px 18px 6px;transform:rotate(var(--tilt))}
.s-am-cung .m-sec:nth-of-type(even){--tilt:1deg}
.s-am-cung .m-sec h3{font-weight:700;text-align:center}
.s-am-cung .m-item:last-child{border-bottom:0}
.s-am-cung .m-price{background:var(--accent);color:#fff;border-radius:999px;padding:0 10px}
@media (min-width:720px){.s-am-cung .c-hero.has-cover{justify-items:start;text-align:left}.s-am-cung .c-text{justify-items:start}.s-am-cung .c-hero .actions{justify-content:flex-start}.s-am-cung .c-cover{justify-self:center}}`,
} as const;

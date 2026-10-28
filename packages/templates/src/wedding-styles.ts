/**
 * The wedding invitation's CSS. `WEDDING_CSS` lays out the cover, the couple's names, the events, the gallery and the
 * reply; `WEDDING_LOOK_CSS` dresses them: "Rực rỡ" a bold red-and-gold card (traditional with the `lucky` palette),
 * "Tinh tế" a full-bleed photo over a quiet serif invitation (minimal, or vintage with `sepia`), "Ấm cúng" a taped
 * print among drawn sprigs (pastel flowers with `blush`).
 */
export const WEDDING_CSS = `.w-hero{display:grid}
.w-names{position:relative;display:grid;justify-items:center;gap:12px;text-align:center;padding:36px 20px 8px}
.w-kicker{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.w-names h1{display:grid;justify-items:center;gap:2px;font-size:clamp(46px,14vw,88px);line-height:1}
.w-names .name{overflow-wrap:anywhere}
.amp{font-size:.55em;line-height:1.1;color:var(--accent)}
.w-date{font:600 20px/1.3 var(--display);font-variant-numeric:tabular-nums}
.w-lunar{color:var(--muted);font-size:15px}
.countdown{display:inline-block;padding:4px 14px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--ink);font-weight:700;font-size:15px}
.w-names .actions{justify-content:center;margin-top:12px}
.sprig{width:120px;height:60px;color:color-mix(in srgb,var(--accent) 70%,var(--ink))}
.sprig-top{margin-bottom:-8px}
.w-intro{position:relative;text-align:center}
.w-intro p{font:500 19px/1.7 var(--display);white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty;max-width:36ch;margin:0 auto}
.sprig-end{display:block;margin:16px auto 0;transform:scaleX(-1)}
.events,.gallery{list-style:none;margin:0;padding:0}
.events{display:grid;gap:18px}
.event{display:grid;gap:6px;justify-items:center;text-align:center}
.event h3{font-size:26px;line-height:1.15}
.when{font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.venue{font-weight:600;font-size:17px;overflow-wrap:anywhere}
.addr{color:var(--muted);font-size:15px;overflow-wrap:anywhere;max-width:34ch}
.event .map{margin-top:10px}
.event .map svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.gallery img{width:100%;aspect-ratio:3/4;object-fit:cover}
.gallery li:first-child:nth-last-child(odd){grid-column:1/-1}
.gallery li:first-child:nth-last-child(odd) img{aspect-ratio:4/3}
.rsvp-note{text-align:center;color:var(--muted);margin:-6px auto 18px;max-width:40ch}
.rsvp{scroll-margin-top:16px}
.contact{scroll-margin-top:16px}
@media (min-width:720px){
.w-hero.has-cover{max-width:1040px;margin:0 auto;padding:48px 24px 0;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center}
.events{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}
.gallery li:first-child:nth-last-child(odd){grid-column:auto}
.gallery li:first-child:nth-last-child(odd) img{aspect-ratio:3/4}
.rsvp .order-form{max-width:720px;margin:0 auto}
}`;

export const WEDDING_LOOK_CSS = {
  'ruc-ro': `.s-ruc-ro .w-hero{padding:12px 12px 0;gap:14px}
.s-ruc-ro .w-cover img{aspect-ratio:4/5}
.s-ruc-ro .w-names{background:var(--accent);color:#fff;border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);padding:32px 18px 28px;--focus:#fff}
.s-ruc-ro .w-kicker,.s-ruc-ro .w-lunar{color:color-mix(in srgb,#fff 88%,var(--accent))}
.s-ruc-ro .w-names h1{font-weight:800;letter-spacing:-.035em}
.s-ruc-ro .amp{color:var(--pop)}
.s-ruc-ro .sprig{color:var(--pop)}
.s-ruc-ro .countdown{background:var(--pop);color:var(--ink);border:2px solid var(--ink);transform:rotate(-2deg)}
.s-ruc-ro .w-names .btn-secondary{background:transparent;color:#fff;border-color:#fff;box-shadow:none}
.s-ruc-ro .event h3{font-weight:800}
.s-ruc-ro .gallery img{border:var(--line);border-radius:12px}`,
  'tinh-te': `.s-tinh-te .w-cover::after{inset:14px}
.s-tinh-te .w-cover img{aspect-ratio:4/5;max-height:64vh}
.s-tinh-te .w-names{padding-top:44px}
.s-tinh-te .w-names h1{font-weight:500;letter-spacing:-.02em}
.s-tinh-te .amp{font-weight:500}
.s-tinh-te .w-date{font-weight:500;font-size:22px}
.s-tinh-te .countdown{background:none;border:1px solid color-mix(in srgb,var(--ink) 30%,transparent);border-radius:0;font-weight:600}
.s-tinh-te .event{border:var(--rule);background:var(--surface)}
.s-tinh-te .event h3{font-weight:500}
.s-tinh-te .event .map{padding:10px 2px}
.s-tinh-te .w-intro{border:0;background:none;padding:0}
.s-tinh-te .contact h2,.s-tinh-te .rsvp h2{justify-content:center}
.s-tinh-te .contact h2::after,.s-tinh-te .rsvp h2::after{display:none}
@media (min-width:720px){.s-tinh-te .w-hero.has-cover{padding-top:72px}}`,
  'am-cung': `.s-am-cung .w-hero{padding:40px 20px 0;justify-items:center}
.s-am-cung .w-cover{width:min(84%,360px);transform:rotate(-3deg)}
.s-am-cung .w-cover img{aspect-ratio:4/5}
.s-am-cung .w-names h1{font-weight:700}
.s-am-cung .amp{color:var(--accent)}
.s-am-cung .countdown{background:var(--pop)}
.s-am-cung .event{transform:rotate(var(--tilt))}
.s-am-cung .event:nth-child(even){--tilt:1.2deg}
.s-am-cung .gallery li{padding:6px 6px 22px;background:#fff;border-radius:6px;box-shadow:var(--card-shadow);transform:rotate(var(--tilt))}
.s-am-cung .gallery li:nth-child(even){--tilt:1.4deg}
.s-am-cung .gallery img{border-radius:3px}
@media (min-width:720px){.s-am-cung .w-hero.has-cover{justify-items:stretch}.s-am-cung .w-cover{justify-self:center}}`,
} as const;

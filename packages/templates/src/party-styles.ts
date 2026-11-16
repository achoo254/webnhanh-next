/**
 * The party invitation's CSS. `PARTY_CSS` lays out the cover, the heading block, the place card, the programme and the
 * reply; `PARTY_LOOK_CSS` dresses them: "Rực rỡ" a neon sticker poster for the company party, "Tinh tế" a quiet
 * black-tie card for a year-end gala, "Ấm cúng" a cosy taped print for Christmas among friends.
 */
export const PARTY_CSS = `.pt-hero{display:grid}
.pt-head{position:relative;display:grid;justify-items:center;gap:12px;text-align:center;padding:36px 20px 8px}
.pt-kicker{font-size:13px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.pt-head h1{font-size:clamp(40px,12vw,80px);line-height:1.02;max-width:14ch}
.pt-host{font-size:16px;color:var(--muted);overflow-wrap:anywhere}
.pt-host strong{color:var(--ink)}
.pt-date{font:600 20px/1.3 var(--display);font-variant-numeric:tabular-nums}
.countdown{display:inline-block;padding:4px 14px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--ink);font-weight:700;font-size:15px}
.pt-head .actions{justify-content:center;margin-top:12px}
.pt-orn{display:block;width:112px;height:auto;pointer-events:none}
.pt-orn-1{margin-bottom:-4px}
.pt-orn-2{margin:16px auto 0}
.pt-intro{text-align:center}
.pt-intro p{font:500 19px/1.7 var(--display);white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty;max-width:36ch;margin:0 auto}
.pt-place{display:grid;gap:6px;justify-items:center;text-align:center}
.pt-place h2{margin-bottom:10px}
.when{font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}
.venue{font-weight:600;font-size:18px;overflow-wrap:anywhere}
.addr{color:var(--muted);font-size:15px;overflow-wrap:anywhere;max-width:34ch}
.dress{margin-top:6px;overflow-wrap:anywhere}
.dress span{display:inline-block;margin-right:6px;padding:2px 10px;border-radius:999px;background:var(--pop);color:var(--ink);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.pt-place .map{margin-top:10px}
.pt-agenda{list-style:none;margin:0 auto;padding:0;display:grid;gap:10px;max-width:640px}
.pt-agenda li{display:grid;grid-template-columns:72px minmax(0,1fr);gap:14px;align-items:baseline;padding:14px 16px;background:var(--surface)}
.pa-time{font:700 18px/1.2 var(--display);color:var(--accent);font-variant-numeric:tabular-nums}
.pa-label{font-weight:600;overflow-wrap:anywhere}
.rsvp-note{text-align:center;color:var(--muted);margin:-6px auto 18px;max-width:40ch}
.rsvp,.contact{scroll-margin-top:16px}
@media (min-width:720px){
.pt-hero.has-cover{max-width:1040px;margin:0 auto;padding:48px 24px 0;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center}
.rsvp .order-form{max-width:720px;margin:0 auto}
}`;

export const PARTY_LOOK_CSS = {
  'ruc-ro': `body.s-ruc-ro{background:var(--ink)}
.s-ruc-ro .pt-hero{padding:12px 12px 0;gap:14px}
.s-ruc-ro .pt-cover img{aspect-ratio:4/5}
.s-ruc-ro .pt-head{background:var(--accent);color:#fff;border:var(--line);border-color:#fff;border-radius:var(--radius);box-shadow:5px 5px 0 var(--pop);padding:32px 18px 28px;--focus:#fff}
.s-ruc-ro .pt-kicker,.s-ruc-ro .pt-host{color:color-mix(in srgb,#fff 88%,var(--accent))}
.s-ruc-ro .pt-host strong{color:#fff}
.s-ruc-ro .pt-head h1{font-weight:800;letter-spacing:-.035em}
.s-ruc-ro .countdown{background:var(--pop);color:var(--ink);border:2px solid var(--ink);transform:rotate(-2deg)}
.s-ruc-ro .pt-head .btn-secondary{background:transparent;color:#fff;border-color:#fff;box-shadow:none}
.s-ruc-ro .wrap h2{color:#fff;text-decoration-color:var(--pop)}
.s-ruc-ro .card h2{color:var(--ink);text-decoration-color:var(--accent)}
.s-ruc-ro .pt-agenda li{border:var(--line);border-radius:14px;box-shadow:4px 4px 0 var(--pop)}
.s-ruc-ro .rsvp-note{color:color-mix(in srgb,#fff 80%,var(--ink))}
.s-ruc-ro .rsvp .order-form{background:var(--surface);border-radius:var(--radius);padding:18px}
.s-ruc-ro .made{color:color-mix(in srgb,#fff 75%,var(--ink))}`,
  'tinh-te': `body.s-tinh-te{background:color-mix(in srgb,var(--ink) 6%,#fff)}
.s-tinh-te .pt-cover::after{inset:14px}
.s-tinh-te .pt-cover img{aspect-ratio:4/5;max-height:64vh}
.s-tinh-te .pt-head{padding-top:44px}
.s-tinh-te .pt-kicker{color:var(--accent)}
.s-tinh-te .pt-head h1{font-weight:500;letter-spacing:-.02em}
.s-tinh-te .pt-date{font-weight:500;font-size:22px}
.s-tinh-te .countdown{background:none;border:1px solid color-mix(in srgb,var(--ink) 30%,transparent);border-radius:0;font-weight:600}
.s-tinh-te .pt-intro{border:0;background:none;padding:0}
.s-tinh-te .dress span{border-radius:0;background:none;border:1px solid var(--ink);font-weight:600}
.s-tinh-te .pt-agenda{gap:0;border-top:var(--rule)}
.s-tinh-te .pt-agenda li{background:none;border-bottom:var(--rule);padding:16px 2px}
.s-tinh-te .pa-time{font-weight:500}
.s-tinh-te .pt-place h2,.s-tinh-te .contact h2,.s-tinh-te .rsvp h2{justify-content:center}
.s-tinh-te .pt-place h2::after,.s-tinh-te .contact h2::after,.s-tinh-te .rsvp h2::after{display:none}
@media (min-width:720px){.s-tinh-te .pt-hero.has-cover{padding-top:72px}}`,
  'am-cung': `.s-am-cung .pt-hero{padding:40px 20px 0;justify-items:center}
.s-am-cung .pt-cover{width:min(86%,380px);transform:rotate(-3deg)}
.s-am-cung .pt-cover img{aspect-ratio:4/5}
.s-am-cung .pt-head h1{font-weight:700;color:var(--accent)}
.s-am-cung .countdown{background:var(--pop)}
.s-am-cung .pt-agenda li{border-radius:18px;box-shadow:var(--card-shadow);transform:rotate(var(--tilt))}
.s-am-cung .pt-agenda li:nth-child(even){--tilt:1deg}
@media (min-width:720px){.s-am-cung .pt-hero.has-cover{justify-items:stretch}.s-am-cung .pt-cover{justify-self:center}}`,
} as const;

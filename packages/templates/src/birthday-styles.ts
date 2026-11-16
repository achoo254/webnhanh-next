/**
 * The birthday card's CSS. `BIRTHDAY_CSS` lays out the confetti, the card, the photos and the reply for every look;
 * `BIRTHDAY_LOOK_CSS` dresses them: "Rực rỡ" a loud sticker card for a balloon party, "Tinh tế" a quiet film-print
 * card, "Ấm cúng" a soft pastel card under a taped photo. Confetti dots take the palette's accent and `pop`.
 */
export const BIRTHDAY_CSS = `html,body{overflow-x:clip}
body{position:relative}
.b-confetti{position:absolute;z-index:0;inset:0 0 auto;height:260px;pointer-events:none;background-image:radial-gradient(circle,var(--accent) 0 3px,transparent 4px),radial-gradient(circle,var(--pop) 0 4px,transparent 5px),radial-gradient(circle,color-mix(in srgb,var(--accent) 45%,#fff) 0 2.5px,transparent 3.5px);background-size:68px 74px,92px 58px,46px 52px;background-position:8px 12px,40px 30px,22px 6px;-webkit-mask-image:linear-gradient(#000,transparent);mask-image:linear-gradient(#000,transparent)}
.b-main{position:relative;z-index:1;max-width:600px;margin:0 auto;padding:72px 16px 56px;display:grid;gap:44px}
.b-card{position:relative;display:grid;justify-items:center;gap:16px;text-align:center;padding:34px 22px 30px}
.b-kicker{font-weight:700;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
.b-card h1{display:grid;gap:4px;justify-items:center;line-height:1.02}
.b-title{font-size:clamp(28px,8vw,44px)}
.b-name{font-size:clamp(44px,14vw,84px);color:var(--accent);overflow-wrap:anywhere}
.b-photo{width:min(100%,400px);margin:6px 0}
.b-photo img{aspect-ratio:4/5}
.b-message{max-width:34ch;font-size:19px;line-height:1.7;white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty}
.b-from{display:grid;gap:2px;font-size:15px;color:var(--muted)}
.b-from strong{font:700 24px/1.2 var(--display);color:var(--ink);overflow-wrap:anywhere}
.b-orn{position:absolute;z-index:1;width:96px;height:auto;pointer-events:none}
.b-orn-1{top:-34px;right:-10px;transform:rotate(8deg)}
.b-orn-2{bottom:-26px;left:-12px;transform:rotate(-10deg)}
.b-gallery{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.b-gallery img{width:100%;aspect-ratio:1;object-fit:cover}
.reply-intro{text-align:center;color:var(--muted);margin:-6px auto 18px;max-width:40ch}
@media (min-width:720px){.b-gallery{grid-template-columns:repeat(3,minmax(0,1fr))}.b-orn{width:120px}}`;

export const BIRTHDAY_LOOK_CSS = {
  'ruc-ro': `.s-ruc-ro .b-card{background:var(--surface);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow)}
.s-ruc-ro .b-kicker{display:inline-block;padding:4px 14px;border:2px solid var(--ink);border-radius:999px;background:var(--pop);color:var(--ink);transform:rotate(-3deg)}
.s-ruc-ro .b-card h1{font-weight:800;letter-spacing:-.035em}
.s-ruc-ro .b-name{text-shadow:3px 3px 0 var(--pop)}
.s-ruc-ro .b-gallery img{border:var(--line);border-radius:12px}`,
  'tinh-te': `.s-tinh-te .b-card{background:var(--surface);border:var(--rule);padding:44px 26px 38px}
.s-tinh-te .b-card h1{font-weight:500;letter-spacing:-.02em}
.s-tinh-te .b-title{font-style:italic}
.s-tinh-te .b-from strong{font-weight:500}
.s-tinh-te .b-confetti{opacity:.55}
.s-tinh-te .contact h2,.s-tinh-te section>h2{justify-content:center}`,
  'am-cung': `.s-am-cung .b-card{background:var(--surface);border-radius:28px;box-shadow:var(--card-shadow)}
.s-am-cung .b-card h1{font-weight:700}
.s-am-cung .b-gallery li{padding:6px 6px 20px;background:#fff;border-radius:6px;box-shadow:var(--card-shadow);transform:rotate(var(--tilt))}
.s-am-cung .b-gallery li:nth-child(even){--tilt:1.4deg}
.s-am-cung .b-gallery img{border-radius:3px}`,
} as const;

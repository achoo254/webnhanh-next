/**
 * The Tết card's CSS. `TET_CSS` lays out the card, the hanging lanterns and the blossoms for every look; `TET_LOOK_CSS`
 * dresses them: "Rực rỡ" a sticker card under a red sky, "Tinh tế" a gold-ruled paper card, "Ấm cúng" clay (soft
 * 3D: rounded, lit from the top left, with inner highlights and a deep soft shadow). Gold is the palette's `pop`.
 */
export const TET_CSS = `html,body{overflow-x:clip}
body{position:relative}
.tet-sky{position:absolute;z-index:2;inset:0 0 auto;height:200px;pointer-events:none;overflow:hidden}
.hang{position:absolute;top:0;width:2px;background:var(--trim,var(--pop))}
.hang-1{left:10%;height:34px}
.hang-2{right:12%;height:64px}
.lantern{position:absolute;top:100%;left:50%;width:52px;height:60px;margin-left:-26px;margin-top:6px;border-radius:50%/46%;background:var(--lantern,var(--accent))}
.lantern::before{content:"";position:absolute;left:50%;top:-7px;width:24px;height:9px;margin-left:-12px;border-radius:3px;background:var(--trim,var(--pop))}
.lantern::after{content:"";position:absolute;left:50%;top:calc(100% - 2px);width:10px;height:26px;margin-left:-5px;border-radius:2px 2px 6px 6px;background:var(--trim,var(--pop))}
.hang-2 .lantern{transform:scale(.8);transform-origin:50% 0}
.tet{position:relative;z-index:1;max-width:580px;margin:0 auto;padding:96px 16px 56px;display:grid;gap:40px}
.tet-card{position:relative;display:grid;justify-items:center;gap:18px;text-align:center;padding:36px 22px 32px}
.year{font-weight:700;font-size:14px;letter-spacing:.12em;text-transform:uppercase}
.to{font-size:17px;color:var(--muted);overflow-wrap:anywhere}
.tet-card h1{font-size:clamp(42px,12.5vw,72px);line-height:1;color:var(--accent)}
.tet-photo{width:min(100%,380px);margin:6px 0}
.tet-photo img{aspect-ratio:4/5}
.greeting{max-width:32ch;font-size:19px;line-height:1.7;white-space:pre-line;overflow-wrap:anywhere;text-wrap:pretty}
.from{display:grid;gap:2px;font-size:15px;color:var(--muted)}
.from strong{font:700 26px/1.2 var(--display);color:var(--ink);overflow-wrap:anywhere}
.bl{position:absolute;width:46px;height:46px;color:var(--pop);--blossom-heart:var(--accent)}
.bl-1{top:-20px;left:-8px;transform:rotate(-14deg)}
.bl-2{top:42%;right:-14px;width:34px;height:34px;transform:rotate(18deg)}
.bl-3{bottom:-16px;left:22%;width:30px;height:30px}
.orn{position:absolute;z-index:1;width:104px;height:auto;pointer-events:none}
.orn-1{bottom:-30px;right:-12px;transform:rotate(8deg)}
.orn-2{bottom:-30px;left:-12px;transform:rotate(-10deg)}
.orn-2.orn-flip{transform:scaleX(-1) rotate(-10deg)}
.reply-intro{margin:-6px 0 18px;color:var(--muted);text-align:center}
@media (min-width:720px){.tet{padding-top:120px}.tet-card{padding:48px 40px 40px}.hang-1{left:18%;height:56px}.hang-2{right:20%;height:88px}}`;

export const TET_LOOK_CSS = {
  'ruc-ro': `body.s-ruc-ro{background:linear-gradient(transparent 0 360px,var(--soft) 360px),radial-gradient(color-mix(in srgb,var(--pop) 45%,transparent) 2px,transparent 2.6px) 0 0/26px 26px,var(--accent)}
.s-ruc-ro{--lantern:var(--pop);--trim:var(--ink)}
.s-ruc-ro .lantern{border:2.5px solid var(--ink);box-shadow:4px 4px 0 var(--ink)}
.s-ruc-ro .tet-card{background:var(--surface);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow)}
.s-ruc-ro .year{background:var(--pop);border:2px solid var(--ink);border-radius:999px;padding:4px 14px;transform:rotate(-3deg)}
.s-ruc-ro .tet-card h1{font-weight:800;letter-spacing:-.03em}
.s-ruc-ro .tet-photo img{aspect-ratio:4/5}
.s-ruc-ro .bl{stroke:var(--ink);stroke-width:2.5}
.s-ruc-ro .contact{background:var(--surface);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);padding:22px 16px}
.s-ruc-ro .contact h2{text-align:center;margin-inline:0}`,
  'tinh-te': `.s-tinh-te{--lantern:var(--accent);--trim:color-mix(in srgb,var(--pop) 60%,var(--ink))}
body.s-tinh-te{background:var(--bg)}
.s-tinh-te .tet-card{background:var(--surface);border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);outline:1px solid color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:-10px;padding:48px 26px 40px}
.s-tinh-te .year{color:var(--accent);font-weight:600}
.s-tinh-te .tet-card h1{font-weight:500;letter-spacing:-.02em}
.s-tinh-te .greeting{font-family:var(--display);font-size:21px;line-height:1.6}
.s-tinh-te .from strong{font-weight:500}
.s-tinh-te .bl{color:color-mix(in srgb,var(--pop) 70%,var(--accent))}
.s-tinh-te .contact h2{justify-content:center}
.s-tinh-te .contact h2::after{display:none}`,
  'am-cung': `body.s-am-cung{background:radial-gradient(60% 40% at 15% 0,color-mix(in srgb,var(--pop) 45%,transparent),transparent 70%),radial-gradient(50% 35% at 100% 30%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 70%),var(--soft)}
.s-am-cung{--clay:inset -6px -8px 14px color-mix(in srgb,var(--ink) 10%,transparent),inset 6px 8px 14px rgb(255 255 255 / .8),0 22px 44px color-mix(in srgb,var(--ink) 16%,transparent)}
.s-am-cung .lantern{background:radial-gradient(circle at 34% 28%,color-mix(in srgb,var(--accent) 45%,#fff) 0 10%,var(--accent) 48%,color-mix(in srgb,var(--accent) 65%,#000) 100%);box-shadow:inset -6px -8px 12px rgb(0 0 0 / .2),0 12px 20px color-mix(in srgb,var(--ink) 22%,transparent)}
.s-am-cung .lantern::before,.s-am-cung .lantern::after{background:linear-gradient(90deg,color-mix(in srgb,var(--pop) 70%,#fff),var(--pop) 45%,color-mix(in srgb,var(--pop) 70%,#000))}
.s-am-cung .tet-card{background:linear-gradient(160deg,#fff,color-mix(in srgb,var(--soft) 60%,#fff));border-radius:36px;box-shadow:var(--clay)}
.s-am-cung .year{background:var(--accent);color:#fff;border-radius:999px;padding:6px 16px;box-shadow:inset -3px -4px 8px rgb(0 0 0 / .18),inset 3px 3px 6px rgb(255 255 255 / .3)}
.s-am-cung .tet-card h1{font-weight:700;text-shadow:0 3px 0 color-mix(in srgb,var(--accent) 22%,transparent)}
.s-am-cung .tet-photo{transform:rotate(-2deg);border-radius:20px}
.s-am-cung .tet-photo::before{display:none}
.s-am-cung .tet-photo img{border-radius:14px}
.s-am-cung .bl{filter:drop-shadow(0 4px 0 color-mix(in srgb,var(--pop) 55%,#000)) drop-shadow(0 8px 10px color-mix(in srgb,var(--ink) 18%,transparent))}
.s-am-cung .contact{background:var(--surface);border-radius:32px;box-shadow:var(--clay);padding:26px 16px}`,
} as const;

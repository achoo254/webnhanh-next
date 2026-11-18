/**
 * The stylesheet of the wedding's "Rạp phim" layout (the approved mock-up's): a fixed dark page with one accent, the
 * palette's (`--accent`; `--accent-text`, the accent mixed with white, for accent text on the dark background). It
 * replaces the looks' base stylesheet; the font faces come from `cinemaFontFiles`. The reply form is the shared one
 * (`rsvp-form.ts`), dressed here.
 */
export function cinemaCss(accent: string): string {
  return CINEMA_CSS.replace('ACCENT', accent);
}

const CINEMA_CSS = String.raw`:root{
  --bg:#0b0809;--bg2:#141012;--card:#1b1619;--line:#2c2529;
  --ink:#f7eff3;--muted:#b3a5ad;--dim:#9a8c94;
  --accent:ACCENT;--accent-soft:color-mix(in srgb,var(--accent) 22%,transparent);
  /* Màu nhấn dùng cho chữ trên nền tối: pha trắng để đủ tương phản với mọi bảng màu. */
  --accent-text:color-mix(in srgb,var(--accent) 62%,#fff);
  --gold:#f3c969;
  --display:"Anton","Arial Narrow",Impact,sans-serif;
  --body:"Be Vietnam Pro",system-ui,-apple-system,"Segoe UI",sans-serif;
  --r:14px;--wrap:1120px;--top:64px;
  --ease:cubic-bezier(.2,.8,.2,1);
  color-scheme:dark;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 16px/1.6 var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit}
button,input,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:6px}
.wrap{width:min(100% - 40px,var(--wrap));margin-inline:auto}
.skip{position:absolute;left:-999px;top:8px;z-index:99;background:var(--ink);color:var(--bg);padding:8px 14px;border-radius:8px}
.skip:focus{left:8px}
.hl{color:var(--accent-text);font-weight:800}

/* ---------- Thanh trên ---------- */
.top{position:fixed;inset:0 0 auto;z-index:30;height:var(--top);display:flex;align-items:center;gap:28px;padding:0 max(20px,env(safe-area-inset-left));padding-top:env(safe-area-inset-top);background:linear-gradient(#000c,#0000);transition:background .35s}
.top.is-solid{background:#0b0809f2;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 1px 0 var(--line)}
.brand{font:400 26px/1 var(--display);letter-spacing:.02em;text-decoration:none;color:var(--accent);text-shadow:0 2px 12px #0008}
.brand span,.pick-brand span{color:var(--ink);margin:0 .08em}
.top-nav{display:none;gap:22px;font-size:14px}
.top-nav a{text-decoration:none;color:#e9dfe4;opacity:.85;transition:opacity .2s}
.top-nav a:hover{opacity:1}
.me{margin-left:auto;background:none;border:0;padding:0;cursor:pointer}
@media (min-width:900px){.top-nav{display:flex}}

/* ---------- Ảnh đại diện hồ sơ ---------- */
.pf-av{position:relative;display:grid;place-items:center;width:112px;aspect-ratio:1;border-radius:12px;font:400 54px/1 var(--display);color:#fff;overflow:hidden}
.pf-av span{position:relative;z-index:1;text-shadow:0 3px 14px #0006}
.pf-av::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 30% 20%,#fff5,transparent 55%)}
.pf-av--trai{background:linear-gradient(140deg,#2563eb,#14b8a6)}
.pf-av--gai{background:linear-gradient(140deg,var(--accent),#ff9a62)}
.me .pf-av--sm{width:34px;border-radius:7px;font-size:17px}
.pf-tag{position:absolute;z-index:2;top:6px;right:6px;background:#fff;color:#111;font:700 10px/1 var(--body);padding:4px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em}

/* ---------- Màn chọn hồ sơ ---------- */
.pick{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 0%,#2a1520,var(--bg) 65%);transition:opacity .55s var(--ease),transform .55s var(--ease)}
.pick.is-out{opacity:0;transform:scale(1.08);pointer-events:none}
.pick-in{text-align:center;padding:24px}
.pick-brand{font:400 34px/1 var(--display);color:var(--accent);margin:0 0 6vh}
.pick-title{font:600 clamp(26px,5vw,44px)/1.2 var(--body);margin:0;letter-spacing:-.01em}
.pick-sub{color:var(--muted);margin:10px 0 34px}
.pick-grid{list-style:none;display:flex;gap:clamp(20px,5vw,40px);justify-content:center;padding:0;margin:0}
.pf{display:flex;flex-direction:column;align-items:center;gap:12px;background:none;border:0;cursor:pointer;padding:0;color:var(--muted);transition:color .2s}
.pf .pf-av{box-shadow:0 0 0 0 #fff;transition:box-shadow .2s,transform .3s var(--ease)}
.pf:hover,.pf:focus-visible{color:var(--ink)}
.pf:hover .pf-av,.pf:focus-visible .pf-av{box-shadow:0 0 0 3px #fff}
.pf:focus-visible{outline:none}
.pf-name{font-weight:600;font-size:17px}
.pf-of{font-size:13px;margin-top:-8px;color:var(--dim)}
.pf.is-chosen .pf-av{transform:scale(1.25);box-shadow:0 0 0 3px #fff,0 0 60px var(--accent)}
.pick-date{margin:7vh 0 0;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.js .pick:not([hidden]) .pick-grid li{opacity:0;transform:translateY(14px);animation:rise .6s var(--ease) forwards;animation-delay:calc(.15s + var(--i,0) * .1s)}
body.is-picking{overflow:hidden}
@media (min-width:700px){.pf-av{width:150px;font-size:70px}}

/* ---------- Hero ---------- */
.hero{position:relative;min-height:100svh;display:flex;align-items:flex-end;overflow:hidden;isolation:isolate}
.hero-slides,.slide{position:absolute;inset:0;margin:0}
.slide{opacity:0;transition:opacity 1.4s ease}
.slide.is-on{opacity:1}
.slide img{width:100%;height:100%;object-fit:cover;object-position:50% 30%}
.slide.is-on img{animation:kenburns 9s linear both}
.hero-shade{position:absolute;inset:0;background:linear-gradient(0deg,var(--bg) 2%,#0b0809d9 30%,#0b080940 62%,#0b080966),linear-gradient(90deg,#0b0809b3,transparent 70%)}
.hero-body{position:relative;z-index:2;width:min(100% - 40px,var(--wrap));margin:0 auto;padding:0 0 calc(96px + env(safe-area-inset-bottom))}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;font:700 12px/1 var(--body);letter-spacing:.22em;text-transform:uppercase;color:#fff}
.dot{width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 0 var(--accent);animation:pulse 2s infinite}
.title{font:400 clamp(54px,14vw,120px)/1.22 var(--display);text-transform:uppercase;margin:0;letter-spacing:.005em;text-shadow:0 6px 40px #000a}
.tagline{margin:10px 0 14px;font:600 clamp(15px,2.4vw,20px)/1.3 var(--body);color:var(--gold)}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;list-style:none;padding:0;margin:0 0 14px;font-size:14px;color:#ddd2d8}
.meta-hl{color:#46d369;font-weight:700}
.box{border:1px solid #fff8;padding:0 6px;border-radius:3px;font-size:12px}
.hello{margin:0 0 6px;font-weight:600;font-size:17px}
.lede{max-width:52ch;margin:0 0 20px;color:#ddd2d8}
.actions{display:flex;flex-wrap:wrap;gap:10px}
.genres{margin:16px 0 0;font-size:13px;color:var(--muted)}
.hero-dots{position:absolute;z-index:3;right:20px;bottom:calc(100px + env(safe-area-inset-bottom));display:flex;gap:6px}
.hero-dots i{width:18px;height:3px;border-radius:2px;background:#fff5;overflow:hidden;position:relative}
.hero-dots i.is-on::after{content:"";position:absolute;inset:0;background:#fff;transform-origin:left;animation:fill 6s linear forwards}
@media (min-width:900px){.hero{min-height:92vh}.hero-body{padding-bottom:110px}.slide img{object-position:50% 25%}}

/* ---------- Nút ---------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 22px;border-radius:8px;border:0;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer;transition:transform .15s,background .2s,filter .2s}
.btn svg{width:22px;height:22px;fill:currentColor}
.btn:active{transform:scale(.97)}
.btn-play{background:#fff;color:#111}
.btn-play:hover{filter:brightness(.88)}
.btn-ghost{background:#6d6d6eb3;color:#fff}
.btn-ghost:hover{background:#6d6d6e80}
.btn-wide{width:100%}

/* ---------- Mục chung ---------- */
.sec{padding:56px 0 8px;scroll-margin-top:var(--top)}
.h2{font:800 clamp(22px,3vw,28px)/1.2 var(--body);margin:0 0 18px;letter-spacing:-.01em}
.h2--sub{margin-top:44px}
.sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.sec-note,.sec-lede{color:var(--muted);margin:0 0 18px}
.js [data-reveal]{opacity:0;transform:translateY(26px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.js [data-reveal].is-in{opacity:1;transform:none}

/* ---------- Lịch công chiếu ---------- */
.countdown{background:linear-gradient(135deg,var(--accent-soft),transparent 60%),var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px;margin-bottom:18px}
.cd-label{margin:0;color:var(--muted)}
.cd-label b{color:var(--ink)}
.cd-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
.cd-grid div{background:#0006;border-radius:10px;padding:12px 4px;text-align:center}
.cd-grid b{display:block;font:400 clamp(34px,8vw,54px)/1 var(--display);font-variant-numeric:tabular-nums}
.cd-grid b.tick{animation:tick .45s var(--ease)}
.cd-grid span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.12em}
.shows{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.show{display:flex;gap:16px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:18px;position:relative;overflow:hidden}
.show--main{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));background:linear-gradient(120deg,var(--accent-soft),transparent 55%),var(--card)}
.show-date{flex:none;width:68px;text-align:center;border-right:1px dashed var(--line);padding-right:14px;display:flex;flex-direction:column;justify-content:center}
.show-date b{font:400 40px/1 var(--display)}
.show-date span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.show-date .dow{font-size:11px}
.show-tag{margin:0;font:700 11px/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--accent-text)}
.show h3{margin:6px 0 2px;font:400 26px/1.25 var(--display);text-transform:uppercase;letter-spacing:.01em}
.show-time{margin:0;font-weight:600}
.show-addr{margin:0;color:var(--muted);font-size:14px}
.runtime{list-style:none;padding:0;margin:10px 0 0;display:flex;flex-wrap:wrap;gap:6px}
.runtime li{font-size:13px;background:#ffffff0d;border-radius:999px;padding:3px 10px;color:#e3d8de}
.runtime b{color:var(--gold);margin-right:4px}
.show-links{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0}
.show-links a{font-size:14px;font-weight:600;text-decoration:none;padding:7px 14px;border-radius:999px;border:1px solid #ffffff2e;transition:background .2s,border-color .2s}
.show-links a:hover{background:#ffffff14;border-color:#ffffff5c}
.show.is-other{display:none}

/* ---------- Các tập ---------- */
.eps{list-style:none;padding:0;margin:0;display:grid;gap:4px}
.ep{display:grid;grid-template-columns:132px 1fr;gap:16px;align-items:center;padding:14px;border-radius:var(--r);transition:background .25s}
.ep:hover{background:var(--card)}
.ep-ph{position:relative;aspect-ratio:16/10;border-radius:8px;overflow:hidden;background:var(--card)}
.ep-ph img{width:100%;height:100%;object-fit:cover;transition:transform .6s var(--ease)}
.ep:hover .ep-ph img{transform:scale(1.06)}
.ep-n{position:absolute;left:8px;bottom:2px;font:400 34px/1 var(--display);color:#fff;text-shadow:0 2px 10px #000}
.ep-ph--next{display:grid;place-items:center;background:repeating-linear-gradient(-45deg,#1f191c 0 10px,#171215 10px 20px);border:1px dashed var(--accent)}
.soon{font:700 11px/1 var(--body);letter-spacing:.14em;text-transform:uppercase;background:color-mix(in srgb,var(--accent) 78%,#000);color:#fff;padding:5px 8px;border-radius:4px}
.ep-when{margin:0;font-size:12px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.ep h3{margin:2px 0 4px;font-size:18px;font-weight:700}
.ep p:last-child{margin:0;color:#d6cad0;font-size:15px}
@media (min-width:700px){.ep{grid-template-columns:220px 1fr;gap:24px}}

/* ---------- Khoảnh khắc ---------- */
.row{list-style:none;margin:0;display:grid;grid-auto-flow:column;grid-auto-columns:clamp(150px,42vw,230px);gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px max(20px,calc((100vw - var(--wrap)) / 2)) 18px;scroll-padding-inline:max(20px,calc((100vw - var(--wrap)) / 2));scrollbar-width:none}
.row::-webkit-scrollbar{display:none}
.row li{scroll-snap-align:start}
.tile{display:block;position:relative;aspect-ratio:3/4;border-radius:10px;overflow:hidden;background:var(--card);transition:transform .35s var(--ease),box-shadow .35s}
.tile img{width:100%;height:100%;object-fit:cover}
.tile::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,#000a,transparent 45%)}
.tile:hover{transform:translateY(-4px) scale(1.02);box-shadow:0 18px 40px #000a}
.tile-n{position:absolute;z-index:1;left:10px;bottom:-6px;font:400 64px/1 var(--display);color:transparent;-webkit-text-stroke:2px #fff;text-shadow:0 4px 18px #0009}
.row-ctl{display:flex;gap:8px}
.arrow{width:38px;height:38px;border-radius:50%;border:1px solid var(--line);background:var(--card);font-size:22px;line-height:1;cursor:pointer;transition:background .2s}
.arrow:hover{background:#2a2327}

/* ---------- Diễn viên ---------- */
.cast{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:14px;text-align:center}
.cast-ph{aspect-ratio:1;border-radius:50%;overflow:hidden;margin:0 auto 10px;width:min(100%,150px);background:var(--card);box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--line)}
.cast-ph{position:relative}
.cast-ph img{position:absolute;left:50%;top:50%;width:300%;max-width:none;height:auto;transform:translate(calc(-1 * var(--fx,50%)),calc(-1 * var(--fy,35%)))}
.cast-ph--guest{display:grid;place-items:center;background:linear-gradient(140deg,var(--accent),#ffb36b);font:400 40px/1 var(--display);box-shadow:0 0 0 3px var(--bg),0 0 0 5px var(--accent)}
.cast-ph--initial{display:grid;place-items:center;background:linear-gradient(140deg,#3a2f35,#1b1619);font:400 40px/1 var(--display);color:var(--accent-text)}
.cast-ph>img{position:static;width:100%;height:100%;max-width:none;object-fit:cover;transform:none}
.cast h3{margin:0;font-size:16px;font-weight:700}
.role{margin:2px 0 0;color:var(--accent-text);font-size:13px;font-weight:600}
.trait{margin:2px 0 0;color:var(--muted);font-size:13px;line-height:1.4}
.producers{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.producers div{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px}
.producers h3{margin:0 0 6px;font:700 12px/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.producers p{margin:0;font-weight:600}
.announce{margin:22px 0 0;color:#d6cad0;max-width:62ch}

/* ---------- Đặt vé (the shared reply form, rsvp-form.ts) ---------- */
.booking{display:grid;gap:22px}
.order-form{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px;display:grid;gap:16px}
.order-form .field{display:grid;gap:6px;border:0;margin:0;padding:0;min-width:0}
.order-form div.field>label,.order-form legend{font-size:14px;font-weight:600;color:#e6dbe1;padding:0;margin-bottom:6px}
.order-form input:not([type=radio]),.order-form textarea{width:100%;background:#0d0a0c;border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:16px;transition:border-color .2s,box-shadow .2s}
.order-form textarea{resize:vertical}
.order-form input:focus,.order-form textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.order-form .choices{display:flex;flex-wrap:wrap;gap:8px}
.choices legend{width:100%}
.choices label{flex:1 1 140px;position:relative;cursor:pointer;display:block;text-align:center;padding:11px 12px;border-radius:10px;border:1px solid var(--line);background:#0d0a0c;font-weight:600;font-size:15px;transition:all .2s}
.choices input{position:absolute;opacity:0;pointer-events:none}
.choices label:has(input:checked){border-color:var(--accent);background:var(--accent-soft);color:#fff}
.choices label:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:2px}
.qty{display:flex;align-items:center;gap:8px}
.qty input{text-align:center;max-width:90px;font-weight:700}
.qty-b{flex:none;width:46px;height:46px;border-radius:10px;border:1px solid var(--line);background:#0d0a0c;font-size:22px;cursor:pointer}
.order-form button[type=submit]{min-height:46px;padding:0 22px;border-radius:8px;border:0;background:#fff;color:#111;font-weight:700;font-size:16px;cursor:pointer;transition:transform .15s,filter .2s}
.order-form button[type=submit]:hover{filter:brightness(.88)}
.order-form button[type=submit]:active{transform:scale(.97)}
.order-form button:disabled{opacity:.6}
.order-status{margin:0;min-height:1.4em;font-size:14px;color:var(--muted)}
.order-done{margin:0;background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px;font-weight:600;text-align:center}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.is-hidden{display:none!important}
.contacts{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.contacts a{display:inline-flex;align-items:center;min-height:44px;font-size:15px;font-weight:600;text-decoration:none;padding:0 16px;border-radius:999px;border:1px solid #ffffff2e}

/* Vé "in ra" */
.ticket-slot{position:relative}
.ticket-slot:empty{display:none}
.ticket{position:relative;display:grid;grid-template-columns:1fr auto;background:linear-gradient(135deg,#fff 0%,#fdf1f6 100%);color:#1a1216;border-radius:16px;overflow:hidden;box-shadow:0 30px 60px #000b;max-width:520px;margin:0 auto}
.js .ticket{animation:print 1.1s var(--ease) both}
.ticket::before,.ticket::after{content:"";position:absolute;right:104px;width:22px;height:22px;border-radius:50%;background:var(--bg)}
.ticket::before{top:-11px}.ticket::after{bottom:-11px}
.tk-main{padding:20px 22px;border-right:2px dashed #e5cbd7}
.tk-film{margin:0;font:400 28px/1.15 var(--display);text-transform:uppercase;color:var(--accent)}
.tk-sub{margin:4px 0 14px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8a7380}
.tk-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;margin:0}
.tk-grid dt{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a7380}
.tk-grid dd{margin:0;font-weight:700;font-size:15px}
.tk-stub{width:116px;display:grid;place-items:center;padding:16px 10px;text-align:center;background:var(--accent);color:#fff}
.tk-stub b{display:block;font:400 30px/1 var(--display)}
.tk-stub span{font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.tk-code{font:600 11px/1.3 ui-monospace,monospace;margin-top:8px;opacity:.85;word-break:break-all}
.ticket-actions{display:flex;gap:10px;justify-content:center;margin-top:16px}
.ticket--no{background:linear-gradient(135deg,#f2eef0,#e4dde1)}
@media (min-width:900px){.booking{grid-template-columns:1fr 1fr;align-items:start}}

/* ---------- End credits ---------- */
.credits{margin-top:70px;height:440px;overflow:hidden;position:relative;background:#000;mask-image:linear-gradient(transparent,#000 20%,#000 80%,transparent);-webkit-mask-image:linear-gradient(transparent,#000 20%,#000 80%,transparent)}
.credits-roll{text-align:center;padding:60px 20px}
.js .credits-roll{opacity:1;transform:translateY(440px);transition:none}
.js .credits-roll.is-in{animation:roll 16s linear forwards}
.cr-big{font:400 clamp(30px,6vw,46px)/1.25 var(--display);text-transform:uppercase;margin:0 0 30px;color:var(--accent)}
.credits dl{margin:0;display:grid;gap:14px}
.credits dl div{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:460px;margin:0 auto}
.credits dt{text-align:right;color:var(--muted);font-size:13px;text-transform:uppercase;letter-spacing:.14em;padding-top:3px}
.credits dd{text-align:left;margin:0;font-weight:600}
.cr-end{margin:36px 0 0;color:var(--gold);font-weight:600}

/* ---------- Chân trang, thanh dưới ---------- */
.foot{padding:30px 0 4px;text-align:center;color:var(--muted);font-size:14px}
.made{padding:4px 20px calc(100px + env(safe-area-inset-bottom));text-align:center;font-size:12px;color:var(--dim)}
.made a{color:inherit}
.foot p{margin:4px 0}
.foot-small{font-size:12px;color:var(--dim)}
.tabs{position:fixed;inset:auto 0 0;z-index:30;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;background:#0b0809f0;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
.tabs a{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;text-decoration:none;color:var(--dim);padding:4px 0;transition:color .2s}
.tabs svg{width:24px;height:24px;fill:currentColor}
.tabs a.is-on{color:var(--ink)}
.tabs .tab-main{color:var(--accent)}
@media (min-width:900px){.tabs{display:none}.made{padding-bottom:40px}}

/* ---------- Xem ảnh lớn ---------- */
.lb{position:fixed;inset:0;z-index:70;background:#000f;display:grid;place-items:center;touch-action:pan-y;animation:fade .25s}
.lb-fig{margin:0;max-width:min(92vw,720px);max-height:86vh;display:grid;gap:10px;justify-items:center}
.lb-fig img{-webkit-user-drag:none;user-select:none;max-height:78vh;width:auto;border-radius:10px;object-fit:contain;transition:transform .3s var(--ease),opacity .3s}
.lb-fig figcaption{color:var(--muted);font-size:14px;text-align:center}
.lb-x,.lb-nav{position:absolute;background:#ffffff1a;border:0;border-radius:50%;width:44px;height:44px;font-size:22px;cursor:pointer;color:#fff}
.lb-x{top:calc(14px + env(safe-area-inset-top));right:14px}
.lb-prev{left:12px}.lb-next{right:12px}
@media (max-width:699px){.lb-nav{display:none}}

/* ---------- Chuyển động ---------- */
@keyframes rise{to{opacity:1;transform:none}}
@keyframes kenburns{from{transform:scale(1.02) translate(0,0)}to{transform:scale(1.14) translate(-1.5%,-2%)}}
@keyframes pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 70%,transparent)}70%{box-shadow:0 0 0 10px transparent}100%{box-shadow:0 0 0 0 transparent}}
@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes tick{from{transform:translateY(-30%);opacity:.2}to{transform:none;opacity:1}}
@keyframes print{0%{clip-path:inset(0 0 100% 0);transform:translateY(-24px)}70%{clip-path:inset(0 0 0 0);transform:translateY(4px)}100%{clip-path:inset(0 0 0 0);transform:none}}
@keyframes roll{from{transform:translateY(440px)}to{transform:translateY(-100%)}}
@keyframes fade{from{opacity:0}}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
  .js [data-reveal]{opacity:1;transform:none}
  .js .credits-roll{transform:none}
  .credits{height:auto;mask-image:none;-webkit-mask-image:none}
}`;

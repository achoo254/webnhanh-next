/**
 * "Ấm cúng": a scrapbook from the shop's kitchen. Dotted notebook paper, the cover as a taped-on instant photo with a
 * doodled heart, a rounded display face, product photos as slightly tilted prints with a price tag cut out at the
 * end, soft pill buttons that press down.
 */
export const AM_CUNG_CSS = `.s-am-cung{--bg:var(--soft);--surface:#fff;--radius:16px;--card-line:0 solid transparent;--card-shadow:0 1px 2px color-mix(in srgb,var(--ink) 10%,transparent),0 10px 28px color-mix(in srgb,var(--ink) 10%,transparent);--r-field:14px;--field-bg:color-mix(in srgb,var(--soft) 55%,#fff);--field-line:2px solid color-mix(in srgb,var(--ink) 55%,#fff);--r-btn:999px;--btn-shadow:0 4px 0 color-mix(in srgb,var(--accent) 55%,#000);--tilt:-1.2deg}
.s-am-cung{background-image:radial-gradient(color-mix(in srgb,var(--ink) 11%,transparent) 1.2px,transparent 1.8px);background-size:22px 22px}
.s-am-cung .hero{max-width:1080px;margin:0 auto;padding:36px 20px 8px;display:grid;gap:28px;justify-items:center;text-align:center}
.s-am-cung .hero-photo{position:relative;order:-1;width:min(80%,340px);padding:10px 10px 40px;background:#fff;border-radius:6px;box-shadow:var(--card-shadow);transform:rotate(-3deg)}
.s-am-cung .hero-photo::before{content:"";position:absolute;z-index:1;top:-14px;left:50%;width:112px;height:30px;margin-left:-56px;background:color-mix(in srgb,var(--pop) 85%,transparent);transform:rotate(4deg);box-shadow:0 1px 2px color-mix(in srgb,var(--ink) 15%,transparent)}
.s-am-cung .hero-photo img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:3px}
.s-am-cung .doodle{position:absolute;right:-30px;bottom:-14px;width:54px;height:50px;color:var(--accent);transform:rotate(12deg)}
.s-am-cung .hero-text{display:grid;gap:14px;justify-items:center}
.s-am-cung h1{font-size:clamp(40px,11.5vw,76px);line-height:1.02;font-weight:700;letter-spacing:-.01em;text-decoration:underline wavy color-mix(in srgb,var(--accent) 65%,transparent);text-decoration-thickness:3px;text-underline-offset:.32em;text-decoration-skip-ink:auto}
.s-am-cung .lede{font-size:18px;max-width:32ch;color:var(--muted)}
.s-am-cung .actions{justify-content:center;margin-top:10px;gap:14px}
.s-am-cung .btn{padding:12px 26px;border-radius:999px;font-size:17px}
.s-am-cung .btn-primary{background:var(--accent);color:#fff;box-shadow:var(--btn-shadow)}
.s-am-cung .btn-secondary{background:#fff;color:var(--ink);box-shadow:0 4px 0 color-mix(in srgb,var(--ink) 30%,transparent)}
.s-am-cung .btn:active,.s-am-cung .pick:active,.s-am-cung .contact a:active{transform:translateY(4px);box-shadow:none}
.s-am-cung main{max-width:1080px;margin:0 auto;padding:40px 16px 64px;display:grid;gap:64px}
.s-am-cung h2{text-align:center;font-size:clamp(32px,9vw,46px);line-height:1.1;font-weight:700;margin-bottom:24px}
.s-am-cung h2::after{content:"";display:block;width:64px;height:10px;margin:6px auto 0;border-radius:999px;background:var(--pop);transform:rotate(-2deg)}
.s-am-cung .products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px 14px}
.s-am-cung .product{display:flex;flex-direction:column;padding:8px 8px 14px;background:var(--surface);border-radius:var(--radius);box-shadow:var(--card-shadow);transform:rotate(var(--tilt));transition:transform .2s}
.s-am-cung .product:nth-child(even){--tilt:1.2deg}
.s-am-cung .product:last-child:nth-child(odd){grid-column:1/-1;justify-self:center;width:calc(50% - 7px)}
.s-am-cung .product:hover{transform:rotate(0) translateY(-4px)}
.s-am-cung .product-photo img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px}
.s-am-cung .product-text{flex:1;display:flex;flex-direction:column;gap:6px;padding:12px 4px 0}
.s-am-cung h3{font-size:20px;line-height:1.15;font-weight:700}
.s-am-cung .desc{font-size:15px;line-height:1.5;color:var(--muted)}
.s-am-cung .product-foot{margin-top:auto;padding-top:8px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.s-am-cung .price{position:relative;padding:4px 14px 4px 24px;background:var(--accent);color:#fff;font-weight:700;clip-path:polygon(12px 0,100% 0,100% 100%,12px 100%,0 50%);border-radius:0 8px 8px 0}
.s-am-cung .price::before{content:"";position:absolute;left:11px;top:50%;width:6px;height:6px;margin-top:-3px;border-radius:50%;background:#fff}
.s-am-cung .pick{align-self:stretch;padding:8px 14px;border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,#fff);color:var(--ink);box-shadow:0 3px 0 color-mix(in srgb,var(--accent) 35%,#fff)}
.s-am-cung .order-form{padding:24px 18px}
.s-am-cung .contact ul{display:grid;gap:14px;justify-items:center}
.s-am-cung .contact a{flex-wrap:wrap;width:min(100%,420px);padding:12px 24px;border-radius:28px;background:#fff;color:var(--ink);box-shadow:0 4px 0 color-mix(in srgb,var(--ink) 25%,transparent)}
.s-am-cung .contact li:first-child a{background:var(--accent);color:#fff;box-shadow:var(--btn-shadow)}
.s-am-cung .c-value{font-weight:400}
.s-am-cung .dock{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));padding:8px;background:#fff;border-radius:999px;box-shadow:0 8px 28px color-mix(in srgb,var(--ink) 22%,transparent)}
.s-am-cung .dock a{border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,#fff);color:var(--ink)}
.s-am-cung .dock a:first-child{background:var(--accent);color:#fff}
@media (min-width:720px){
.s-am-cung .hero{padding:64px 32px 16px;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:64px;justify-items:start;text-align:left;align-items:center}
.s-am-cung .hero-photo{order:0;width:100%;max-width:420px;justify-self:center}
.s-am-cung .hero-text{justify-items:start}
.s-am-cung .actions{justify-content:flex-start}
.s-am-cung main{padding:64px 32px 96px;gap:96px}
.s-am-cung .products{grid-template-columns:repeat(3,minmax(0,1fr));gap:36px 28px}
.s-am-cung .product:last-child:nth-child(odd){grid-column:auto;justify-self:stretch;width:auto}
.s-am-cung .product-foot{flex-direction:row;align-items:center;justify-content:space-between;flex-wrap:wrap}
.s-am-cung .pick{align-self:auto}
.s-am-cung .order{max-width:760px;width:100%;justify-self:center}
.s-am-cung .contact ul{grid-template-columns:repeat(auto-fit,minmax(260px,1fr));align-items:stretch}
.s-am-cung .contact a{width:100%;height:100%}
}`;

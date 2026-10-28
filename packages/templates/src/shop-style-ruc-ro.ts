/**
 * "Rực rỡ": a sticker sheet. Chunky ink outlines with hard offset shadows, the accent as a full colour block behind a
 * huge grotesque name, the light `pop` colour for stickers and price tags, a tilted band repeating the shop's name,
 * products in a bento grid where the first one is featured whenever that leaves no gap.
 */
export const RUC_RO_CSS = `.s-ruc-ro .hero{max-width:1120px;margin:0 auto;padding:12px 12px 0;display:grid;gap:14px}
.s-ruc-ro .hero-text{background:var(--accent);color:#fff;border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);padding:28px 20px 24px;display:grid;gap:16px;align-content:end;--focus:#fff}
.s-ruc-ro h1{font-size:clamp(40px,12.5vw,88px);line-height:.95;letter-spacing:-.035em;font-weight:800}
.s-ruc-ro .lede{font-size:17px;max-width:36ch}
.s-ruc-ro .actions{margin-top:4px}
.s-ruc-ro .btn{padding:12px 22px;border-radius:999px;font-family:var(--display);font-size:17px;font-weight:800}
.s-ruc-ro .btn-primary{background:var(--pop);color:var(--ink);border:var(--line);box-shadow:var(--btn-shadow)}
.s-ruc-ro .btn-secondary{color:#fff;border:2.5px solid #fff}
.s-ruc-ro .btn:active{transform:translate(3px,3px);box-shadow:none}
.s-ruc-ro .hero-photo{position:relative;order:-1}
.s-ruc-ro .hero-photo img{width:100%;aspect-ratio:4/3;object-fit:cover;border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow)}
.s-ruc-ro .burst{position:absolute;right:4px;top:-14px;width:72px;height:72px;color:var(--pop);transform:rotate(14deg)}
.s-ruc-ro .band-wrap{margin-top:16px;padding:calc(1.75vw + 14px) 0}
.s-ruc-ro .band{margin:0 -24px;transform:rotate(-2deg);background:var(--ink);color:var(--pop);font:800 22px/1 var(--display);letter-spacing:-.01em;padding:12px 0;white-space:nowrap;overflow:hidden}
.s-ruc-ro main{max-width:1120px;margin:0 auto;padding:20px 12px 56px;display:grid;gap:56px}
.s-ruc-ro h2{font-size:clamp(32px,9vw,48px);line-height:1.05;letter-spacing:-.03em;font-weight:800;margin:0 4px 20px;text-decoration:underline wavy var(--accent);text-decoration-thickness:3px;text-underline-offset:.32em;text-decoration-skip-ink:auto}
.s-ruc-ro .products{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 14px}
.s-ruc-ro .product{display:flex;flex-direction:column;background:var(--surface);border:var(--line);border-radius:var(--radius);box-shadow:var(--card-shadow);overflow:hidden;transition:transform .15s,box-shadow .15s}
.s-ruc-ro .product:hover{transform:translate(-2px,-2px);box-shadow:7px 7px 0 var(--ink)}
.s-ruc-ro .product-photo img{width:100%;aspect-ratio:1;object-fit:cover;border-bottom:var(--line)}
.s-ruc-ro .product:first-child:nth-last-child(odd){grid-column:1/-1}
.s-ruc-ro .product:first-child:nth-last-child(odd) .product-photo img{aspect-ratio:16/10}
.s-ruc-ro .product-text{flex:1;display:flex;flex-direction:column;gap:6px;padding:14px 12px}
.s-ruc-ro h3{font-size:19px;line-height:1.15;letter-spacing:-.01em;font-weight:800}
.s-ruc-ro .desc{font-size:14px;line-height:1.5;color:var(--muted)}
.s-ruc-ro .product-foot{margin-top:auto;padding-top:8px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.s-ruc-ro .price{background:var(--pop);color:var(--ink);border:2px solid var(--ink);border-radius:999px;padding:2px 12px;font-weight:600;transform:rotate(-3deg)}
.s-ruc-ro .pick{flex:1 0 auto;padding:8px 16px;border-radius:999px;background:var(--ink);color:#fff;font-size:15px}
.s-ruc-ro .pick:active{transform:translateY(2px)}
.s-ruc-ro .order h2,.s-ruc-ro .contact h2{text-decoration-color:var(--ink)}
@media (min-width:720px){
.s-ruc-ro .hero{padding:24px 24px 0;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:20px}
.s-ruc-ro .hero-text{padding:48px 40px 40px;min-height:440px}
.s-ruc-ro .hero-photo{order:0}
.s-ruc-ro .hero-photo img{height:100%;aspect-ratio:auto}
.s-ruc-ro .burst{width:110px;height:110px;right:-18px;top:-18px}
.s-ruc-ro main{padding:32px 24px 80px;gap:80px}
.s-ruc-ro .products{grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
.s-ruc-ro .product:first-child:nth-last-child(odd){grid-column:auto}
.s-ruc-ro .product:first-child:nth-last-child(3n+2){grid-column:span 2}
.s-ruc-ro .product:first-child:nth-last-child(odd) .product-photo img{aspect-ratio:1}
.s-ruc-ro .product:first-child:nth-last-child(3n+2) .product-photo img{aspect-ratio:2/1}
}`;

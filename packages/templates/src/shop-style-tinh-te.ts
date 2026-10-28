/**
 * "Tinh tế": a printed menu card. Near-white paper, a large serif name, hairline rules and square corners, the
 * accent kept for prices and the main button; products as menu lines with a dotted leader running to the price, a
 * small square photo beside each.
 */
export const TINH_TE_CSS = `.s-tinh-te{--bg:color-mix(in srgb,var(--soft) 40%,#fff);--surface:#fff;--radius:0;--rule:1px solid color-mix(in srgb,var(--ink) 20%,transparent);--card-line:0 solid transparent;--card-shadow:none;--r-field:0;--field-bg:#fff;--field-line:1.5px solid color-mix(in srgb,var(--ink) 55%,#fff);--r-btn:0;--btn-shadow:none}
.s-tinh-te .hero{max-width:1120px;margin:0 auto;padding:40px 20px 0;display:grid;gap:32px}
.s-tinh-te .hero-text{display:grid;gap:20px;align-content:end}
.s-tinh-te .hero-text::before{content:"";width:48px;height:3px;background:var(--accent)}
.s-tinh-te h1{font-size:clamp(46px,13.5vw,104px);line-height:.98;letter-spacing:-.025em;font-weight:500}
.s-tinh-te .lede{font-size:18px;line-height:1.65;color:var(--muted);max-width:34ch}
.s-tinh-te .actions{align-items:center;gap:8px 24px;margin-top:8px}
.s-tinh-te .btn{font-weight:600;letter-spacing:.01em}
.s-tinh-te .btn-primary{padding:12px 28px;background:var(--accent);color:#fff}
.s-tinh-te .btn-primary:hover{background:var(--ink)}
.s-tinh-te .btn-secondary{padding:12px 2px;border-bottom:1.5px solid currentColor}
.s-tinh-te .btn-secondary::after,.s-tinh-te .pick::after{content:"→";transition:transform .2s}
.s-tinh-te .btn-secondary:hover::after,.s-tinh-te .pick:hover::after{transform:translateX(4px)}
.s-tinh-te .hero-photo{position:relative}
.s-tinh-te .hero-photo img{width:100%;aspect-ratio:4/5;max-height:72vh;object-fit:cover}
.s-tinh-te .hero-photo::after{content:"";position:absolute;inset:12px;border:1px solid rgb(255 255 255 / .75);pointer-events:none}
.s-tinh-te main{max-width:1120px;margin:0 auto;padding:72px 20px 80px;display:grid;gap:80px}
.s-tinh-te h2{display:flex;align-items:center;gap:20px;font-size:clamp(34px,9vw,52px);line-height:1.05;letter-spacing:-.02em;font-weight:500;margin-bottom:12px}
.s-tinh-te h2::after{content:"";flex:1;min-width:24px;height:1px;background:color-mix(in srgb,var(--ink) 35%,transparent)}
.s-tinh-te .products{display:grid}
.s-tinh-te .product{display:grid;grid-template-columns:104px minmax(0,1fr);gap:18px;padding:22px 0;border-bottom:var(--rule)}
.s-tinh-te .product.no-photo{grid-template-columns:minmax(0,1fr)}
.s-tinh-te .product-photo img{width:100%;aspect-ratio:1;object-fit:cover}
.s-tinh-te .product-text{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:14px;row-gap:6px;align-content:start}
.s-tinh-te .product-foot{display:contents}
.s-tinh-te h3{grid-column:1/-1;font-size:22px;line-height:1.2;font-weight:500}
.s-tinh-te .price{grid-column:1/-1;grid-row:2;color:var(--accent);font-weight:600;font-size:17px}
.s-tinh-te .desc{grid-column:1/-1;font-size:15px;line-height:1.55;color:var(--muted)}
.s-tinh-te .pick{grid-column:1/-1;justify-self:start;gap:6px;padding:0 2px;font-weight:600;font-size:15px;text-decoration:underline;text-underline-offset:5px;text-decoration-thickness:1px}
.s-tinh-te .order-form{padding:0;gap:22px}
.s-tinh-te .field label{font-size:14px;letter-spacing:.02em}
.s-tinh-te .field input,.s-tinh-te .field select,.s-tinh-te .field textarea{border-width:0 0 1.5px;padding-inline:2px;background:transparent}
.s-tinh-te .order-form button{font-family:var(--body);font-size:17px;font-weight:600;letter-spacing:.02em}
.s-tinh-te .order-form button:hover{background:var(--ink)}
.s-tinh-te .contact ul{border-top:var(--rule)}
.s-tinh-te .contact a{width:100%;justify-content:flex-start;flex-wrap:wrap;gap:4px 14px;padding:16px 0;border-bottom:var(--rule);font-weight:400}
.s-tinh-te .contact svg{color:var(--accent)}
.s-tinh-te .c-verb{font:500 22px/1.2 var(--display)}
.s-tinh-te .c-value{margin-left:auto;color:var(--muted);font-variant-numeric:tabular-nums}
.s-tinh-te .contact a:hover .c-verb{text-decoration:underline;text-underline-offset:5px}
.s-tinh-te .dock{inset:auto 0 0 0;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--surface);border-top:var(--rule)}
.s-tinh-te .dock a{font-weight:600;border:1.5px solid var(--ink)}
.s-tinh-te .dock a:first-child{background:var(--accent);border-color:var(--accent);color:#fff}
@media (min-width:720px){
.s-tinh-te .hero{padding:96px 32px 0;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:64px;align-items:end}
.s-tinh-te .hero-photo img{max-height:none}
.s-tinh-te main{padding:120px 32px 120px;gap:120px}
.s-tinh-te .products{grid-template-columns:1fr 1fr;column-gap:56px}
.s-tinh-te .product{grid-template-columns:128px minmax(0,1fr);gap:22px}
.s-tinh-te h3{grid-column:1;grid-row:1;display:flex;align-items:baseline}
.s-tinh-te h3::after{content:"";flex:1;min-width:16px;margin-left:10px;border-bottom:1.5px dotted color-mix(in srgb,var(--ink) 60%,transparent)}
.s-tinh-te .price{grid-column:2;grid-row:1;align-self:baseline;max-width:14ch;text-align:right}
.s-tinh-te .order{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:56px;align-items:start}
.s-tinh-te .order h2::after{display:none}
.s-tinh-te .contact ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));column-gap:56px}
}`;

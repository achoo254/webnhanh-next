import { describe, expect, it } from 'vitest';
import { ORDER_SCRIPT_HASH } from './order-form';
import { imageAsset, renderShop, type ImageAsset } from './shop-render';
import { styleFontFiles } from './shop-fonts';
import { STYLE_IDS, type ShopDraft } from './shop-schema';
import { SHOP_STYLES } from './shop-styles';

const COVER = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';

const assets = new Map<string, ImageAsset>([
  [COVER, imageAsset({ width: 1600, height: 900, widths: [960, 480, 1600] }, (w) => `img/${COVER}-${w}.webp`)],
  [P1, imageAsset({ width: 900, height: 900, widths: [900] }, (w) => `img/${P1}-${w}.webp`)],
]);

function draft(overrides: Partial<ShopDraft> = {}): ShopDraft {
  return {
    name: 'Tiệm Bánh Tráng Nhà Bơ',
    description: 'Trộn tươi mỗi ngày',
    cover: COVER,
    products: [{ key: 'p1', name: 'Bánh tráng trộn', image: P1, description: 'Cay vừa', price: '25.000đ' }],
    contacts: { zalo: '0912345678', phone: '0912345678', facebook: 'tiembanhtrang' },
    palette: 'sunset',
    style: 'ruc-ro',
    ...overrides,
  };
}

describe('renderShop', () => {
  it('renders a static page: texts, photos with srcset and size, contact links, no script', () => {
    const { html } = renderShop(draft(), assets, { madeWith: { name: 'App', url: 'https://app.example.com' } });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="vi">');
    expect(html).toContain('<h1>Tiệm Bánh Tráng Nhà Bơ</h1>');
    expect(html).toContain('<h3>Bánh tráng trộn</h3>');
    expect(html).toContain('<p class="price">25.000đ</p>');
    expect(html).toContain(`srcset="img/${COVER}-480.webp 480w, img/${COVER}-960.webp 960w, img/${COVER}-1600.webp 1600w"`);
    expect(html).toContain(`src="img/${COVER}-960.webp"`);
    expect(html).toContain('width="1600" height="900"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('href="https://zalo.me/0912345678"');
    expect(html).toContain('href="tel:+84912345678"');
    expect(html).toContain('href="https://www.facebook.com/tiembanhtrang"');
    expect(html).toContain('Làm bằng App');
    expect(html).toContain('#c2410c');
    expect(html).not.toMatch(/<script|<link|@import|url\(|\son\w+=/i);
    // Nothing but the page's own photos is ever requested.
    expect(html).not.toMatch(/(src|href)="\/\//);
    expect([...html.matchAll(/(?:src|srcset)="([^"]*)"/g)].every((m) => m[1]?.startsWith('img/'))).toBe(true);
  });

  it('escapes every text the owner typed', () => {
    const evil = `"><script>alert(1)</script><img src=x onerror=alert(2)>'&`;
    const { html } = renderShop(
      draft({
        name: evil,
        description: evil,
        products: [{ key: 'p1', name: evil, image: P1, description: evil, price: evil }],
      }),
      assets,
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(2)&gt;&#39;&amp;');
    // The product name is also the photo's alt text: escaped inside the attribute.
    expect(html).toContain('alt="&quot;&gt;&lt;script&gt;');
  });

  it('never links a contact that is not a phone, Zalo or Facebook address', () => {
    const { html } = renderShop(draft({ contacts: { zalo: 'javascript:alert(1)', phone: 'abc', facebook: 'https://evil.com/x' } }), assets);
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('evil.com');
    expect(html).not.toContain('Liên hệ');
  });

  it('leaves out what is empty or missing, so a half-filled draft still previews', () => {
    const { html } = renderShop(
      draft({ name: '', description: '', cover: '33333333-3333-4333-8333-333333333333', products: [{ key: 'p1', name: '', image: null, description: '', price: '' }], contacts: { zalo: '', phone: '', facebook: '' } }),
      assets,
    );
    expect(html).toContain('<title>Cửa hàng</title>');
    expect(html).not.toContain('<h1>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Sản phẩm');
    expect(html).not.toContain('<footer>');
  });

  it('refuses photo URLs that could break out of srcset or leave the site', () => {
    for (const url of ['img/a b.webp', 'img/a,b.webp', '//evil.com/x.webp', 'javascript:alert(1)', '../x.webp', 'img/"x.webp']) {
      const bad = new Map([[P1, { width: 10, height: 10, variants: [{ width: 10, url }] }]]);
      expect(() => renderShop(draft({ cover: null }), bad), url).toThrow('refused asset url');
    }
  });

  it('refuses a made-with link that is not http(s)', () => {
    expect(() => renderShop(draft(), assets, { madeWith: { name: 'App', url: 'javascript:alert(1)' } })).toThrow();
  });
});

describe('renderShop order form and sharing', () => {
  const form = { action: 'https://app.example.com/f/nha-bo', token: '1761634800.abc' };

  it('adds the order form with its products, the fixed script and a CSP allowing only it', () => {
    const { html } = renderShop(
      draft({ products: [{ key: 'p1', name: 'Bánh tráng', image: P1, description: '', price: '25k' }, { key: 'p2', name: ' ', image: null, description: '', price: '' }] }),
      assets,
      { orderForm: form },
    );
    expect(html).toContain('<form id="order" class="order-form" method="post" action="https://app.example.com/f/nha-bo"');
    expect(html).toContain('<option value="p1">Bánh tráng (25k)</option>');
    expect(html).not.toContain('value="p2"');
    expect(html).toContain('name="_t" value="1761634800.abc"');
    expect(html).toContain('name="website" tabindex="-1"');
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain(`script-src &#39;${ORDER_SCRIPT_HASH}&#39;; connect-src https://app.example.com; form-action https://app.example.com`);
  });

  it('has no script, and forbids one, without the form', () => {
    const { html } = renderShop(draft(), assets);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<form');
    expect(html).toContain('default-src &#39;none&#39;');
    expect(html).toContain('form-action &#39;none&#39;');
  });

  it('describes the page for shared links: og:url, og:image, og:description, twitter:card', () => {
    const { html } = renderShop(draft({ description: 'Ngon "nhất"' }), assets, {
      page: { url: 'https://nha-bo.example.vn/', image: { url: 'https://nha-bo.example.vn/og.jpg', width: 1200, height: 630, type: 'image/jpeg' } },
    });
    expect(html).toContain('<meta property="og:url" content="https://nha-bo.example.vn/">');
    expect(html).toContain('<meta property="og:image" content="https://nha-bo.example.vn/og.jpg">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:description" content="Ngon &quot;nhất&quot;">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(renderShop(draft(), assets).html).toContain('<meta name="twitter:card" content="summary">');
    expect(() => renderShop(draft(), assets, { page: { url: 'javascript:alert(1)' } })).toThrow();
  });
});

describe('renderShop styles', () => {
  const form = { action: 'https://app.example.com/f/nha-bo', token: '1.abc' };

  it.each(STYLE_IDS)('renders the %s style with its own stylesheet and, given font URLs, its own fonts only', (style) => {
    const { html } = renderShop(draft({ style }), assets, { orderForm: form, fontUrl: (file) => `fonts/${file}` });
    expect(html).toContain(`<body class="s-${style} has-dock">`);
    expect(html).toContain(SHOP_STYLES[style].css.slice(0, 40));
    for (const other of STYLE_IDS.filter((s) => s !== style)) expect(html).not.toContain(`.s-${other}`);
    const fonts = styleFontFiles(style);
    for (const font of fonts) expect(html).toContain(`url(fonts/${font.file}) format("woff2")`);
    expect(html.match(/@font-face/g)).toHaveLength(fonts.length);
    expect(html).toContain('font-display:swap');
    // One preload: the display face's Latin file.
    expect(html.match(/rel="preload"/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="preload" href="fonts/${fonts[0]?.file}" as="font" type="font/woff2" crossorigin>`);
    expect(html).toContain('font-src &#39;self&#39;');
  });

  it('loads no font and allows none without font URLs', () => {
    const { html } = renderShop(draft(), assets);
    expect(html).not.toContain('@font-face');
    expect(html).not.toContain('font-src');
  });

  it('refuses a font URL that could leave the site', () => {
    expect(() => renderShop(draft(), assets, { fontUrl: (file) => `//evil.com/${file}` })).toThrow('refused asset url');
  });

  it('leads with ordering and the shop’s Zalo, in the header and the phone bar, and lets each product be picked', () => {
    const { html } = renderShop(draft(), assets, { orderForm: form });
    expect(html).toContain('<div class="actions"><a class="btn btn-primary" href="#dat-hang">');
    expect(html).toContain('Đặt hàng</a><a class="btn btn-secondary" href="https://zalo.me/0912345678">');
    expect(html).toContain('<nav class="dock" aria-label="Đặt nhanh">');
    expect(html).toContain('<a class="pick" href="#dat-hang" data-p="p1">Chọn mua<span class="vh"> Bánh tráng trộn</span></a>');
    expect(html).toContain('<section class="order" id="dat-hang"');
  });

  it('calls the shop when there is no form, and has no bar or pick links without anything to act on', () => {
    const withPhone = renderShop(draft({ contacts: { zalo: '', phone: '0912345678', facebook: '' } }), assets).html;
    expect(withPhone).toContain('<a class="btn btn-primary" href="tel:+84912345678">');
    expect(withPhone).toContain('Gọi ngay</a>');
    expect(withPhone).not.toContain('class="pick"');
    const nothing = renderShop(draft({ contacts: { zalo: '', phone: '', facebook: '' } }), assets).html;
    expect(nothing).not.toContain('class="actions"');
    expect(nothing).not.toContain('<nav');
    expect(nothing).toContain('<body class="s-ruc-ro">');
  });

  it('escapes what the owner typed in the name band, pick links, contacts and bar', () => {
    const evil = `"><script>alert(1)</script>'&`;
    const { html } = renderShop(
      draft({ name: evil, products: [{ key: 'p1', name: evil, image: P1, description: '', price: evil }], contacts: { zalo: '0912345678', phone: '', facebook: '' } }),
      assets,
      { orderForm: form },
    );
    const escaped = '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&#39;&amp;';
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain(`<p class="band">${escaped} ✦ `);
    expect(html).toContain(`Chọn mua<span class="vh"> ${escaped}</span>`);
    expect(html).toContain('<span class="c-value">0912 345 678</span>');
  });
});

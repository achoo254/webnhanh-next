import { describe, expect, it } from 'vitest';
import { imageAsset, renderShop, type ImageAsset } from './shop-render';
import type { ShopDraft } from './shop-schema';

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

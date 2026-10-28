import { describe, expect, it } from 'vitest';
import { renderShareCard } from './share-card';
import { imageAsset } from './shop-render';
import type { ShopDraft } from './shop-schema';

const COVER = '11111111-1111-4111-8111-111111111111';
const assets = new Map([[COVER, imageAsset({ width: 960, height: 900, widths: [480, 960] }, (w) => `img/${COVER}-${w}.webp`)]]);
const draft: ShopDraft = {
  name: '<b>Tiệm</b>',
  description: 'Bánh "ngon"',
  cover: COVER,
  products: [],
  contacts: { zalo: '', phone: '', facebook: '' },
  palette: 'leaf',
};

describe('renderShareCard', () => {
  it('lays out name, description, address and cover with local fonts only, escaped', () => {
    const html = renderShareCard(draft, assets, { host: 'tiem.example.vn', fontUrl: (file) => `fonts/${file}` });
    expect(html).toContain('<h1>&lt;b&gt;Tiệm&lt;/b&gt;</h1>');
    expect(html).toContain('<p>Bánh &quot;ngon&quot;</p>');
    expect(html).toContain(`src="img/${COVER}-960.webp"`);
    expect(html).toContain('url(fonts/inter-vietnamese-800-normal.woff2)');
    expect(html).not.toMatch(/https?:\/\/|<script/);
  });

  it('refuses a font URL that could leave the card', () => {
    expect(() => renderShareCard(draft, assets, { host: 'x', fontUrl: () => '//evil.com/f.woff2' })).toThrow('refused asset url');
  });
});

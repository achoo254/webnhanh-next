import { describe, expect, it } from 'vitest';
import { renderCafe } from './cafe-render';
import { CAFE_LIMITS, cafeDraftSchema, cafeImageIds, cafePublishIssues, sampleCafeDraft, type CafeDraft } from './cafe-schema';
import { imageAsset } from './page';

const COVER = '11111111-1111-4111-8111-111111111111';
const DISH = '22222222-2222-4222-8222-222222222222';
const assets = new Map([
  [COVER, imageAsset({ width: 675, height: 900, widths: [675] }, () => 'img/c.webp')],
  [DISH, imageAsset({ width: 900, height: 900, widths: [900] }, () => 'img/d.webp')],
]);
const sample = (overrides: Partial<CafeDraft> = {}): CafeDraft => ({ ...sampleCafeDraft({ cover: COVER }), ...overrides });

describe('café draft', () => {
  it('needs a name and a menu with named dishes, a real address and a way to book', () => {
    expect(cafePublishIssues(sample({ name: '', menu: [] }))).toEqual([
      { field: 'name', code: 'required' },
      { field: 'menu', code: 'no-menu' },
    ]);
    expect(cafePublishIssues(sample({ menu: [{ key: 's1', title: '', items: [{ key: 'i1', name: ' ', description: '', price: '', image: null }] }] }))).toEqual([
      { field: 'menu.0.items.0.name', code: 'required' },
    ]);
    expect(cafePublishIssues(sample({ address: 'javascript:alert(1)' }))).toEqual([{ field: 'address', code: 'invalid-map' }]);
    expect(cafePublishIssues(sample({ contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([{ field: 'contacts', code: 'no-contact' }]);
    expect(cafePublishIssues(sample({ booking: false, contacts: { zalo: '', phone: '', facebook: '' } }))).toEqual([]);
  });

  it('refuses duplicate keys and more dishes than the page holds', () => {
    const [section] = sample().menu;
    if (!section) throw new Error('sample has a menu');
    expect(cafeDraftSchema.safeParse(sample({ menu: [section, section] })).success).toBe(false);
    const many = Array.from({ length: CAFE_LIMITS.itemsPerSection }, (_, i) => ({ key: `i${i}`, name: 'x', description: '', price: '', image: null }));
    const sections = Array.from({ length: 4 }, (_, s) => ({ key: `s${s}`, title: '', items: many }));
    expect(cafeDraftSchema.safeParse(sample({ menu: sections })).success).toBe(false);
  });

  it('lists the cover and dish photos once each', () => {
    const [section] = sample().menu;
    if (!section) throw new Error('sample has a menu');
    const items = section.items.map((item) => ({ ...item, image: DISH }));
    expect(cafeImageIds(sample({ menu: [{ ...section, items }] }))).toEqual([COVER, DISH]);
  });
});

describe('renderCafe', () => {
  it('shows the menu with quick links, the hours table, directions and booking by phone', () => {
    const { html } = renderCafe(sample(), assets);
    expect(html).toContain('<nav class="m-nav" aria-label="Các mục thực đơn"><a href="#m-s1">Cà phê</a><a href="#m-s2">Trà và bánh</a></nav>');
    expect(html).toContain('<span class="m-name">Cà phê sữa đá</span><span class="m-price">29.000đ</span>');
    expect(html).toContain('<tr><th scope="row">Thứ Hai – Thứ Sáu</th><td>7:00 – 22:00</td></tr>');
    expect(html).toContain('https://www.google.com/maps/search/?api=1&amp;query=');
    expect(html).toContain('<section class="contact" id="dat-ban"');
    expect(html).toContain('href="tel:+84912345678"');
    expect(html).not.toMatch(/<script|<form/);
  });

  it('leaves out empty sections, hours and an address that is not one', () => {
    const { html } = renderCafe(sample({ hours: [{ key: 'h1', days: '', time: '' }], address: 'https://evil.com/x', menu: [{ key: 's1', title: 'Trống', items: [] }] }), assets);
    expect(html).not.toContain('Giờ mở cửa');
    expect(html).not.toContain('evil.com');
    expect(html).not.toContain('Thực đơn');
  });
});

import { describe, expect, it } from 'vitest';
import { facebookLink, normalizePhone, phoneLink, zaloLink } from './contact-links';
import { newShopDraft, shopDraftSchema, shopImageIds, shopPublishIssues, type ShopDraft } from './shop-schema';

const COVER = '11111111-1111-4111-8111-111111111111';
const P1 = '22222222-2222-4222-8222-222222222222';

function draft(overrides: Partial<ShopDraft> = {}): ShopDraft {
  return {
    name: 'Tiệm Bánh Tráng Nhà Bơ',
    description: 'Trộn tươi mỗi ngày.\nGiao tận nơi.',
    cover: COVER,
    products: [{ key: 'p1', name: 'Bánh tráng trộn', image: P1, description: '', price: '25.000đ' }],
    contacts: { zalo: '0912 345 678', phone: '', facebook: '' },
    palette: 'sunset',
    ...overrides,
  };
}

describe('shop draft schema', () => {
  it('accepts a full draft and a new, still empty one', () => {
    expect(shopDraftSchema.safeParse(draft()).success).toBe(true);
    expect(shopDraftSchema.safeParse(newShopDraft({ cover: COVER, products: [P1] })).success).toBe(true);
  });

  it.each([
    ['an unknown field', { ...draft(), script: 'x' }],
    ['an unknown colour', { ...draft(), palette: 'neon' }],
    ['a name too long', draft({ name: 'x'.repeat(81) })],
    ['a line break in the name', draft({ name: 'a\nb' })],
    ['a control character', draft({ description: 'a\u0000b' })],
    ['an image that is not an id', draft({ cover: '../../etc/passwd' })],
    ['31 products', draft({ products: Array.from({ length: 31 }, (_, i) => ({ key: `p${i}`, name: 'x', image: null, description: '', price: '' })) })],
    ['two products with one key', draft({ products: [0, 1].map(() => ({ key: 'same', name: 'x', image: null, description: '', price: '' })) })],
    ['a product key with odd characters', draft({ products: [{ key: '<p>', name: 'x', image: null, description: '', price: '' }] })],
  ])('refuses %s', (_label, value) => {
    expect(shopDraftSchema.safeParse(value).success).toBe(false);
  });

  it('lists what keeps a draft from being published', () => {
    expect(shopPublishIssues(draft())).toEqual([]);
    expect(
      shopPublishIssues(
        draft({
          name: '  ',
          products: [{ key: 'p1', name: '', image: null, description: '', price: '' }],
          contacts: { zalo: 'zalo.com/x', phone: '123', facebook: 'javascript:alert(1)' },
        }),
      ),
    ).toEqual([
      { field: 'name', code: 'required' },
      { field: 'products.0.name', code: 'required' },
      { field: 'contacts.zalo', code: 'invalid-zalo' },
      { field: 'contacts.phone', code: 'invalid-phone' },
      { field: 'contacts.facebook', code: 'invalid-facebook' },
    ]);
    expect(shopPublishIssues(draft({ products: [] }))).toEqual([{ field: 'products', code: 'no-products' }]);
  });

  it('lists the photos a draft shows, each once', () => {
    expect(shopImageIds(draft({ products: [{ key: 'a', name: 'x', image: COVER, description: '', price: '' }] }))).toEqual([COVER]);
    expect(shopImageIds(draft())).toEqual([COVER, P1]);
    expect(shopImageIds(draft({ cover: null, products: [] }))).toEqual([]);
  });
});

describe('contact links', () => {
  it.each([
    ['0912 345 678', '0912345678'],
    ['+84 912.345.678', '0912345678'],
    ['84912345678', '0912345678'],
    ['(024) 3825 1234', '02438251234'],
    ['1900 1234', '19001234'],
  ])('reads the phone number %j', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['123', '09123', '0012345678', 'tel:0912345678', 'abc', '091234567890'])('refuses the phone number %j', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('links phones as tel: in international form', () => {
    expect(phoneLink('0912345678')).toEqual({ href: 'tel:+84912345678', label: '0912 345 678' });
    expect(phoneLink('19001234')).toEqual({ href: 'tel:19001234', label: '19001234' });
  });

  it('links Zalo by number or zalo.me address only', () => {
    expect(zaloLink('0912345678')).toEqual({ href: 'https://zalo.me/0912345678', label: '0912 345 678' });
    expect(zaloLink('zalo.me/g/abcdef')?.href).toBe('https://zalo.me/g/abcdef');
    expect(zaloLink('https://zalo.me/1234567890123?x=1')?.href).toBe('https://zalo.me/1234567890123');
    for (const bad of ['https://evil.com/zalo.me', 'javascript:alert(1)', 'https://zalo.me.evil.com/x', 'https://u:p@zalo.me/x', 'https://zalo.me/', 'https://zalo.me/a/b/c', 'http://zalo.me:8080/x']) {
      expect(zaloLink(bad), bad).toBeNull();
    }
  });

  it('links Facebook pages, profiles and bare usernames only', () => {
    expect(facebookLink('tiembanhtrang.nhabo')?.href).toBe('https://www.facebook.com/tiembanhtrang.nhabo');
    expect(facebookLink('@tiembanhtrang')?.href).toBe('https://www.facebook.com/tiembanhtrang');
    expect(facebookLink('m.facebook.com/tiembanhtrang/')?.href).toBe('https://www.facebook.com/tiembanhtrang');
    expect(facebookLink('https://www.facebook.com/profile.php?id=100012345678&x=1')?.href).toBe('https://www.facebook.com/profile.php?id=100012345678');
    for (const bad of ['https://facebook.com.evil.com/x', 'javascript:alert(1)', 'https://www.facebook.com/profile.php?id=abc', 'https://evil.com/facebook.com', 'abc', 'a"onmouseover=x']) {
      expect(facebookLink(bad), bad).toBeNull();
    }
  });
});

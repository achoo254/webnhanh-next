import { describe, expect, it } from 'vitest';
import { checkSiteName } from './site-name';

describe('checkSiteName', () => {
  it('accepts and normalizes ordinary names', () => {
    expect(checkSiteName('  Banh-Mi-Co-Ba ')).toEqual({ ok: true, name: 'banh-mi-co-ba' });
    expect(checkSiteName('abc')).toEqual({ ok: true, name: 'abc' });
    expect(checkSiteName('a'.repeat(30))).toEqual({ ok: true, name: 'a'.repeat(30) });
  });

  it.each(['ab', 'a'.repeat(31), '-shop', 'shop-', 'shop_1', 'cửa-hàng', 'a.b', 'xn--abc', 'a--b', ''])(
    'refuses the badly shaped %j',
    (name) => {
      expect(checkSiteName(name)).toEqual({ ok: false, reason: 'format' });
    },
  );

  it.each(['www', 'admin', 'kiem-tra', 'API'])('refuses the reserved %j', (name) => {
    expect(checkSiteName(name)).toEqual({ ok: false, reason: 'reserved' });
  });

  it.each([
    'vietcombank-hotro',
    'viet-com-bank',
    'momo-nhan-qua',
    'dang-nhap-zalo',
    'xac-minh-tai-khoan',
    'dichvucong-vn',
    'nhan-otp',
    'hoan-thue-ca-nhan',
    'evn-hanoi',
  ])('refuses the phishing-prone %j', (name) => {
    expect(checkSiteName(name)).toEqual({ ok: false, reason: 'sensitive' });
  });

  it.each(['lau-hot-pot', 'thue-xe-da-nang', 'fishbowl', 'pineapple-cafe', 'steamboat-house'])(
    'keeps the honest %j that only contains a short sensitive word inside another',
    (name) => {
      expect(checkSiteName(name)).toEqual({ ok: true, name });
    },
  );
});

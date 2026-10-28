import { describe, expect, it } from 'vitest';
import { ORDER_SCRIPT, ORDER_SCRIPT_HASH, orderFormHtml, orderInputSchema, orderIssueFields } from './order-form';

const valid = { name: ' Lan ', phone: '0912 345 678', address: '12 Lý Thường Kiệt\nQuận 1', product: 'p1', quantity: '2', note: '' };

describe('order input', () => {
  it('accepts an order, trims texts and normalizes the phone number', () => {
    expect(orderInputSchema.parse(valid)).toEqual({ ...valid, name: 'Lan', phone: '0912345678', quantity: 2 });
    expect(orderInputSchema.parse({ ...valid, phone: '+84 912.345.678', note: undefined }).phone).toBe('0912345678');
  });

  it.each([
    [{ name: '   ' }, ['name']],
    [{ phone: '12345' }, ['phone']],
    [{ phone: '0'.repeat(21) }, ['phone']],
    [{ address: '' }, ['address']],
    [{ product: '' }, ['product']],
    [{ product: '<x>' }, ['product']],
    [{ quantity: '0' }, ['quantity']],
    [{ quantity: '1000' }, ['quantity']],
    [{ quantity: '1.5' }, ['quantity']],
    [{ name: 'a\u0000b' }, ['name']],
    [{ name: 'x'.repeat(81), note: 'y'.repeat(501) }, ['name', 'note']],
    [{ name: 'Lan\nAnh' }, ['name']],
  ])('refuses %j', (patch, fields) => {
    const parsed = orderInputSchema.safeParse({ ...valid, ...patch });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(orderIssueFields(parsed.error)).toEqual(fields);
  });
});

describe('order form', () => {
  it('pins the script by its CSP hash', async () => {
    // Web Crypto: this package is browser code, without Node's types.
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ORDER_SCRIPT)));
    expect(`sha256-${btoa(String.fromCharCode(...digest))}`).toBe(ORDER_SCRIPT_HASH);
    // Small on purpose: it ships with every shop page.
    expect(ORDER_SCRIPT.length).toBeLessThan(1200);
  });

  it('escapes product names, prices and the action', () => {
    const html = orderFormHtml([{ key: 'p1', name: '"><script>alert(1)</script>', price: "<b>'5k'</b>" }], {
      action: 'https://app.example.com/f/a"b',
      token: '1.x',
    });
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt; (&lt;b&gt;&#39;5k&#39;&lt;/b&gt;)');
    expect(html).toContain('action="https://app.example.com/f/a&quot;b"');
    // One product: chosen already; several: the person picks.
    expect(html).not.toContain('Chọn sản phẩm');
    expect(orderFormHtml([], { action: 'https://a.example', token: 't' })).toBe('');
  });
});

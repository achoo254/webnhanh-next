import { notificationDeliveries, pushSubscriptions, chatLinks, sites, submissions } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publishedShop, startTestApp, type TestApp } from '../test-support';
import { MIN_FILL_MS } from './form-routes';

const SITE_ORIGIN = 'https://tiem-bo.hoandat.io.vn';

let app: TestApp;
let owner: { accountId: string; cookie: string };
let shop: { siteId: string; token: string };
let orders: number;

beforeEach(async () => {
  orders = 0;
  app = await startTestApp({ orderLimits: { perIp: 5, perSite: 8 } }, () => {
    orders += 1;
  });
  owner = await app.signIn('owner');
  shop = await publishedShop(app, owner, 'tiem-bo');
});

afterEach(async () => {
  await app.close();
});

function order(patch: Record<string, string> = {}): Record<string, string> {
  return { _t: shop.token, _e: '8000', website: '', name: 'Lan', phone: '0912 345 678', address: '12 Lý Thường Kiệt', product: 'p2', quantity: '2', note: 'Ít đá', ...patch };
}

function post(body: Record<string, string>, { json = true, origin = SITE_ORIGIN, site = 'tiem-bo' }: { json?: boolean; origin?: string | null; site?: string } = {}) {
  let req = app.http().post(`/f/${site}`).type('form').send(body);
  if (json) req = req.set('Accept', 'application/json');
  if (origin) req = req.set('Origin', origin);
  return req;
}

async function stored() {
  return app.handle.db.select().from(submissions);
}

describe('POST /f/:site', () => {
  it('stores an order from the site, answers its origin with CORS and tells the sender', async () => {
    const res = await post(order());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, message: expect.stringContaining('Đã gửi đơn') });
    expect(res.headers['access-control-allow-origin']).toBe(SITE_ORIGIN);
    expect(res.headers['set-cookie']).toBeUndefined();
    const [row] = await stored();
    expect(row?.data).toEqual({ name: 'Lan', phone: '0912345678', address: '12 Lý Thường Kiệt', productKey: 'p2', productName: 'Trà tắc', quantity: 2, note: 'Ít đá' });
    expect(row?.handledAt).toBeNull();
    expect(orders).toBe(1);
  });

  it('works as a plain HTML form post: a thank-you page linking back, no script needed', async () => {
    const res = await post(order({ _e: '' }), { json: false });
    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Cảm ơn bạn!');
    expect(res.text).toContain(`href="${SITE_ORIGIN}/"`);
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(await stored()).toHaveLength(1);
  });

  it('answers preflight for the site origin only', async () => {
    const ok = await app.http().options('/f/tiem-bo').set('Origin', SITE_ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(SITE_ORIGIN);
    const other = await app.http().options('/f/tiem-bo').set('Origin', 'https://khac.hoandat.io.vn');
    expect(other.status).toBe(403);
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('refuses another origin, even another site of the same domain or the app itself', async () => {
    for (const origin of ['https://khac.hoandat.io.vn', 'https://evil.example', 'http://localhost:5297']) {
      const res = await post(order(), { origin });
      expect(res.status, origin).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    }
    expect(await stored()).toHaveLength(0);
  });

  it('answers 404 for an unknown, unpublished or form-less site, or a bad name', async () => {
    await app.handle.db.insert(sites).values({ accountId: owner.accountId, name: 'nhap', kind: 'template', status: 'draft', createdAt: new Date(), updatedAt: new Date() });
    for (const site of ['khong-co', 'nhap', 'A_B', '..']) {
      const res = await post(order(), { site, origin: null });
      expect(res.status, site).toBe(404);
      expect(res.body.error).toBe('not-found');
    }
  });

  it('thanks a bot that filled the trap field, and stores nothing', async () => {
    const res = await post(order({ website: 'https://spam.example' }));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(await stored()).toHaveLength(0);
    expect(orders).toBe(0);
  });

  it('refuses a missing, forged or other-site token', async () => {
    const other = await publishedShop(app, owner, 'tiem-khac');
    for (const token of ['', 'abc', `${shop.token}x`, other.token]) {
      const res = await post(order({ _t: token }));
      expect(res.status, token).toBe(400);
      expect(res.body.error).toBe('stale-page');
    }
    expect(await stored()).toHaveLength(0);
  });

  it('asks to look again when the form was sent faster than a person fills it', async () => {
    const res = await post(order({ _e: String(MIN_FILL_MS - 1) }));
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('too-fast');
    expect((await post(order({ _e: String(MIN_FILL_MS) }))).status).toBe(201);
  });

  it('names the fields to fix, and refuses a product the page does not offer', async () => {
    const res = await post(order({ phone: '123', quantity: '0', name: ' ' }));
    expect(res.status).toBe(422);
    expect(res.body.fields).toEqual(['name', 'phone', 'quantity']);
    expect(res.body.message).toBe('Hãy kiểm tra lại: Họ tên, Số điện thoại, Số lượng.');
    const product = await post(order({ product: 'p9' }));
    expect(product.body.fields).toEqual(['product']);
    // Escaped in the HTML answer too.
    const html = await post(order({ name: '<script>x</script>', phone: '1' }), { json: false });
    expect(html.text).not.toContain('<script>');
    expect(await stored()).toHaveLength(0);
  });

  it('limits orders per IP and per site, answering with CORS so the page can say so', async () => {
    for (let i = 0; i < 5; i += 1) expect((await post(order())).status).toBe(201);
    const limited = await post(order());
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('too-many-requests');
    expect(limited.headers['access-control-allow-origin']).toBe(SITE_ORIGIN);
    expect(await stored()).toHaveLength(5);
  });

  it('limits orders per site whatever the IP', async () => {
    // Each request from its own address (nginx in front sets X-Forwarded-For; the app trusts loopback).
    for (let i = 0; i < 8; i += 1) {
      expect((await post(order()).set('X-Forwarded-For', `203.0.113.${i}`)).status).toBe(201);
    }
    const limited = await post(order()).set('X-Forwarded-For', '203.0.113.200');
    expect(limited.status).toBe(429);
  });

  it('writes one delivery per push device and the linked chat, only for channels the server has', async () => {
    await app.handle.db.insert(pushSubscriptions).values([
      { id: crypto.randomUUID(), accountId: owner.accountId, endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: 'k', auth: 'a', createdAt: new Date() },
      { id: crypto.randomUUID(), accountId: owner.accountId, endpoint: 'https://fcm.googleapis.com/fcm/send/b', p256dh: 'k', auth: 'a', createdAt: new Date() },
    ]);
    await app.handle.db.insert(chatLinks).values({ accountId: owner.accountId, chatId: 42, createdAt: new Date() });
    // The test app has neither VAPID keys nor a bot: the order is stored, no delivery is written.
    expect((await post(order())).status).toBe(201);
    expect(await app.handle.db.select().from(notificationDeliveries)).toHaveLength(0);
    await app.close();

    app = await startTestApp({
      push: { publicKey: 'p', privateKey: 'k', subject: 'mailto:a@b.c' },
      chatBot: { url: 'https://chat.example.com', username: 'don_bot', token: '1:x', webhookSecret: 's' },
    });
    const me = await app.signIn('owner');
    shop = await publishedShop(app, me, 'tiem-bo');
    await app.handle.db.insert(pushSubscriptions).values({ id: crypto.randomUUID(), accountId: me.accountId, endpoint: 'https://fcm.googleapis.com/fcm/send/a', p256dh: 'k', auth: 'a', createdAt: new Date() });
    await app.handle.db.insert(chatLinks).values({ accountId: me.accountId, chatId: 42, createdAt: new Date() });
    expect((await post(order())).status).toBe(201);
    const rows = await app.handle.db.select().from(notificationDeliveries);
    expect(rows.map((r) => r.channel).sort()).toEqual(['chat', 'push']);
    expect(rows.find((r) => r.channel === 'chat')?.target).toBe('42');
    expect(rows.every((r) => r.status === 'pending')).toBe(true);
    const [site] = await app.handle.db.select().from(sites).where(eq(sites.id, shop.siteId));
    expect(rows.every((r) => r.accountId === site?.accountId)).toBe(true);
  });
});

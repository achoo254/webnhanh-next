import { notificationDeliveries, submissions } from '@webnhanh/db';
import { RSVP_KIND } from '@webnhanh/templates';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, publishedShop, publishedWedding, startTestApp, type TestApp } from '../test-support';
import { MIN_FILL_MS } from './form-routes';

const SITE = 'minh-thao';
const SITE_ORIGIN = `https://${SITE}.hoandat.io.vn`;

let app: TestApp;
let owner: { accountId: string; cookie: string };
let stranger: { accountId: string; cookie: string };
let wedding: { siteId: string; token: string };
let received: number;

beforeEach(async () => {
  received = 0;
  app = await startTestApp({ orderLimits: { perIp: 6, perSite: 9 } }, () => {
    received += 1;
  });
  owner = await app.signIn('owner');
  stranger = await app.signIn('stranger');
  wedding = await publishedWedding(app, owner, SITE);
});

afterEach(async () => {
  await app.close();
});

function reply(patch: Record<string, string> = {}): Record<string, string> {
  return { kind: RSVP_KIND, _t: wedding.token, _e: '8000', website: '', name: 'Hà', phone: '', attending: 'yes', guests: '2', note: 'Chúc mừng!', ...patch };
}

function post(body: Record<string, string>, { json = true, origin = SITE_ORIGIN, site = SITE }: { json?: boolean; origin?: string | null; site?: string } = {}) {
  let req = app.http().post(`/f/${site}`).type('form').send(body);
  if (json) req = req.set('Accept', 'application/json');
  if (origin) req = req.set('Origin', origin);
  return req;
}

const stored = () => app.handle.db.select().from(submissions);

describe('wedding replies through POST /f/:site', () => {
  it('stores a reply as an RSVP, answers in wedding words with CORS, and notifies like an order', async () => {
    const res = await post(reply({ phone: '0912 345 678' }));
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, message: 'Đã gửi xác nhận. Cô dâu chú rể cảm ơn bạn!' });
    expect(res.headers['access-control-allow-origin']).toBe(SITE_ORIGIN);
    const [row] = await stored();
    expect(row?.kind).toBe('rsvp');
    expect(row?.data).toEqual({ name: 'Hà', phone: '0912345678', attending: 'yes', guests: 2, note: 'Chúc mừng!' });
    expect(received).toBe(1);
  });

  it('counts nobody for a guest who is not coming, and works without script', async () => {
    const res = await post(reply({ attending: 'no', guests: '5', _e: '' }), { json: false });
    expect(res.status).toBe(201);
    expect(res.text).toContain('Đã gửi xác nhận');
    expect(res.text).toContain(`<a href="${SITE_ORIGIN}/">Quay lại thiệp cưới</a>`);
    expect((await stored())[0]?.data).toMatchObject({ attending: 'no', guests: 0 });
  });

  it('keeps the spam guards of the order form: trap, token, fill time, origin', async () => {
    const trap = await post(reply({ website: 'x' }));
    expect(trap.status).toBe(200);
    expect(trap.body.ok).toBe(true);
    const shop = await publishedShop(app, owner, 'tiem-bo');
    for (const token of ['', 'abc', shop.token]) expect((await post(reply({ _t: token }))).body.error).toBe('stale-page');
    const fast = await post(reply({ _e: String(MIN_FILL_MS - 1) }));
    expect(fast.status).toBe(422);
    expect(fast.body.message).toBe('Bạn gửi hơi nhanh. Hãy xem lại rồi bấm Gửi xác nhận lần nữa.');
    expect((await post(reply(), { origin: 'https://khac.hoandat.io.vn' })).status).toBe(403);
    expect(await stored()).toHaveLength(0);
    expect(received).toBe(0);
  });

  it('names the reply fields to fix', async () => {
    const res = await post(reply({ name: ' ', phone: '123', attending: 'maybe', guests: '99' }));
    expect(res.status).toBe(422);
    expect(res.body.fields).toEqual(['name', 'phone', 'attending', 'guests']);
    expect(res.body.message).toBe('Hãy kiểm tra lại: Tên của bạn, Số điện thoại, Bạn sẽ đến chứ?, Số người đi cùng (kể cả bạn).');
    expect(await stored()).toHaveLength(0);
  });

  it('refuses a reply to a page without the reply form, and an order to a wedding', async () => {
    await publishedWedding(app, owner, 'khong-xac-nhan', false);
    const off = await post(reply(), { site: 'khong-xac-nhan', origin: 'https://khong-xac-nhan.hoandat.io.vn' });
    expect(off.status).toBe(404);
    expect(off.body.message).toBe('Thiệp này không nhận xác nhận nữa.');
    const order = await post({ _t: wedding.token, _e: '8000', name: 'Lan', phone: '0912345678', address: 'Hà Nội', product: 'p1', quantity: '1' });
    expect(order.status).toBe(404);
    expect(order.body.message).toBe('Trang này không nhận đơn nữa.');
    // And a shop takes no replies.
    const shop = await publishedShop(app, owner, 'tiem-bo');
    const toShop = await post(reply({ _t: shop.token }), { site: 'tiem-bo', origin: 'https://tiem-bo.hoandat.io.vn' });
    expect(toShop.status).toBe(404);
    expect(await stored()).toHaveLength(0);
  });

  it('limits replies per IP like orders, in wedding words', async () => {
    for (let i = 0; i < 6; i += 1) expect((await post(reply())).status).toBe(201);
    const limited = await post(reply());
    expect(limited.status).toBe(429);
    expect(limited.body.message).toBe('Đã có nhiều xác nhận gửi đi cùng lúc. Hãy thử lại sau ít phút.');
    expect(limited.headers['access-control-allow-origin']).toBe(SITE_ORIGIN);
  });

  it('limits replies per site whatever the IP', async () => {
    for (let i = 0; i < 9; i += 1) expect((await post(reply()).set('X-Forwarded-For', `203.0.113.${i}`)).status).toBe(201);
    expect((await post(reply()).set('X-Forwarded-For', '203.0.113.99')).status).toBe(429);
  });
});

describe('the reply inbox', () => {
  it('lists replies with a head count, marks one handled, and is the owner\'s only', async () => {
    await post(reply({ name: 'Hà', guests: '3' }));
    await post(reply({ name: 'Nam', guests: '1' })).set('X-Forwarded-For', '203.0.113.7');
    await post(reply({ name: 'Vy', attending: 'no' })).set('X-Forwarded-For', '203.0.113.8');
    const list = await app.http().get(`/api/sites/${wedding.siteId}/orders`).set('Cookie', owner.cookie);
    expect(list.status).toBe(200);
    expect(list.body.site).toEqual({ name: SITE, template: 'wedding', published: true });
    expect(list.body.rsvp).toEqual({ yes: 2, guests: 4, no: 1 });
    expect(list.body.open).toBe(3);
    expect(list.body.orders[0]).toMatchObject({ kind: 'rsvp', name: 'Vy', attending: 'no', guests: 0, handledAt: null });
    expect(list.body.orders.map((o: { name: string }) => o.name)).toEqual(['Vy', 'Nam', 'Hà']);

    const id = list.body.orders[0].id as string;
    const done = await app.http().patch(`/api/sites/${wedding.siteId}/orders/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ handled: true });
    expect(done.body.order).toMatchObject({ kind: 'rsvp', name: 'Vy' });
    expect(done.body.order.handledAt).not.toBeNull();
    const sites = await app.http().get('/api/sites').set('Cookie', owner.cookie);
    expect(sites.body.sites[0].newOrders).toBe(2);

    expect((await app.http().get(`/api/sites/${wedding.siteId}/orders`).set('Cookie', stranger.cookie)).status).toBe(404);
    const steal = await app.http().patch(`/api/sites/${wedding.siteId}/orders/${id}`).set('Cookie', stranger.cookie).set('Origin', ORIGIN).send({ handled: false });
    expect(steal.status).toBe(404);
    expect(await app.handle.db.select().from(notificationDeliveries)).toHaveLength(0);
  });
});

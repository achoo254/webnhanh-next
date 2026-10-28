import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, publishedShop, startTestApp, type TestApp } from '../test-support';

let app: TestApp;
let owner: { accountId: string; cookie: string };
let stranger: { accountId: string; cookie: string };
let shop: { siteId: string; token: string };

beforeEach(async () => {
  app = await startTestApp();
  owner = await app.signIn('owner');
  stranger = await app.signIn('stranger');
  shop = await publishedShop(app, owner, 'tiem-bo');
});

afterEach(async () => {
  await app.close();
});

async function order(name: string): Promise<void> {
  const res = await app
    .http()
    .post('/f/tiem-bo')
    .type('form')
    .set('Accept', 'application/json')
    .send({ _t: shop.token, _e: '9000', name, phone: '0912345678', address: 'Hà Nội', product: 'p1', quantity: '1', note: '' });
  expect(res.status).toBe(201);
}

describe('order inbox', () => {
  it('lists open orders newest first, counts them on the site list, and marks one handled', async () => {
    await order('Lan');
    await order('Minh');
    const list = await app.http().get(`/api/sites/${shop.siteId}/orders`).set('Cookie', owner.cookie);
    expect(list.status).toBe(200);
    expect(list.body.open).toBe(2);
    expect(list.body.orders.map((o: { name: string }) => o.name)).toEqual(['Minh', 'Lan']);
    expect(list.body.orders[0]).toMatchObject({ phone: '0912345678', product: 'Bánh tráng', quantity: 1, handledAt: null });

    const sites = await app.http().get('/api/sites').set('Cookie', owner.cookie);
    expect(sites.body.sites[0].newOrders).toBe(2);

    const id = list.body.orders[0].id as string;
    const done = await app.http().patch(`/api/sites/${shop.siteId}/orders/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ handled: true });
    expect(done.status).toBe(200);
    expect(done.body.order.handledAt).not.toBeNull();
    const open = await app.http().get(`/api/sites/${shop.siteId}/orders`).set('Cookie', owner.cookie);
    expect(open.body.orders.map((o: { name: string }) => o.name)).toEqual(['Lan']);
    expect(open.body.open).toBe(1);
    const all = await app.http().get(`/api/sites/${shop.siteId}/orders?view=all`).set('Cookie', owner.cookie);
    expect(all.body.orders).toHaveLength(2);
    expect((await app.http().get('/api/sites').set('Cookie', owner.cookie)).body.sites[0].newOrders).toBe(1);

    const reopen = await app.http().patch(`/api/sites/${shop.siteId}/orders/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ handled: false });
    expect(reopen.body.order.handledAt).toBeNull();
  });

  it('answers 404 to another account, for the list and for marking', async () => {
    await order('Lan');
    const list = await app.http().get(`/api/sites/${shop.siteId}/orders`).set('Cookie', owner.cookie);
    const id = list.body.orders[0].id as string;
    const theirs = await app.http().get(`/api/sites/${shop.siteId}/orders`).set('Cookie', stranger.cookie);
    expect(theirs.status).toBe(404);
    const mark = await app.http().patch(`/api/sites/${shop.siteId}/orders/${id}`).set('Cookie', stranger.cookie).set('Origin', ORIGIN).send({ handled: true });
    expect(mark.status).toBe(404);
    // An order id of one site cannot be reached through another site of the same owner.
    const other = await publishedShop(app, owner, 'tiem-khac');
    const cross = await app.http().patch(`/api/sites/${other.siteId}/orders/${id}`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ handled: true });
    expect(cross.status).toBe(404);
    const unchanged = await app.http().get(`/api/sites/${shop.siteId}/orders`).set('Cookie', owner.cookie);
    expect(unchanged.body.open).toBe(1);
  });

  it('refuses bad input', async () => {
    expect((await app.http().get(`/api/sites/${shop.siteId}/orders?before=xyz`).set('Cookie', owner.cookie)).status).toBe(400);
    const bad = await app.http().patch(`/api/sites/${shop.siteId}/orders/not-a-uuid`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ handled: true });
    expect(bad.status).toBe(404);
    expect((await app.http().get(`/api/sites/${shop.siteId}/orders`)).status).toBe(401);
  });
});

import { abuseReports, chatLinks, notificationDeliveries } from '@webnhanh/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deliverDue } from '../notifications/deliveries';
import type { ChatSender } from '../notifications/senders';
import { ORIGIN, publishedShop, startTestApp, type TestApp } from '../test-support';
import { siteNameOf } from './report-routes';

let app: TestApp;
let owner: { accountId: string; cookie: string };
let woken = 0;

beforeEach(async () => {
  woken = 0;
  app = await startTestApp({ adminSubs: ['admin-sub'], reportsPerIp: 50 }, () => {
    woken += 1;
  });
  owner = await app.signIn('shop-owner');
});

afterEach(async () => {
  await app.close();
});

const REPORT = { site: 'banh-trang.hoandat.io.vn', category: 'scam', details: 'Trang giả mạo ngân hàng, hỏi mật khẩu.', contact: 'a@example.com', website: '', elapsed: 9_000 };

const send = (payload: object) => app.http().post('/api/reports').set('Origin', ORIGIN).send(payload);

describe('the public abuse report', () => {
  it('stores a report without sign-in and tells the admins in Chat', async () => {
    await publishedShop(app, owner, 'banh-trang');
    const admin = await app.signIn('admin-sub');
    await app.handle.db.insert(chatLinks).values({ accountId: admin.accountId, chatId: 7, createdAt: new Date() });

    const res = await send(REPORT);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(woken).toBe(1);
    const [report] = await app.handle.db.select().from(abuseReports);
    expect(report).toMatchObject({ siteName: 'banh-trang', category: 'scam', contact: 'a@example.com', status: 'open' });

    const sent: string[] = [];
    const chat: ChatSender = {
      send: (_chatId, text) => {
        sent.push(text);
        return Promise.resolve('sent');
      },
    };
    const result = await deliverDue(app.handle.db, { push: null, chat }, 'https://app.example.com', new Date(), { warn: () => undefined });
    expect(result.sent).toBe(1);
    expect(sent[0]).toContain('Báo cáo vi phạm: banh-trang.hoandat.io.vn');
    expect(sent[0]).toContain('Lừa đảo, giả mạo');
    expect(sent[0]).toContain('https://app.example.com/admin');
  });

  it('takes the site as a name, an address or a link to any of its pages', () => {
    expect(siteNameOf('banh-trang')).toBe('banh-trang');
    expect(siteNameOf(' Banh-Trang.hoandat.io.vn ')).toBe('banh-trang');
    expect(siteNameOf('https://banh-trang.hoandat.io.vn/san-pham?id=1')).toBe('banh-trang');
    expect(siteNameOf('banh-trang.hoandat.io.vn/qua')).toBe('banh-trang');
    expect(siteNameOf('https://evil.example.com/')).toBeNull();
    expect(siteNameOf('a')).toBeNull();
  });

  it('thanks a bot that filled the trap and stores nothing', async () => {
    await publishedShop(app, owner, 'banh-trang');
    const res = await send({ ...REPORT, website: 'https://spam.example' });
    expect(res.status).toBe(201);
    expect(await app.handle.db.select().from(abuseReports)).toHaveLength(0);
    expect(woken).toBe(0);
  });

  it('refuses a form sent too fast, missing fields, an unknown category or site, and another origin', async () => {
    await publishedShop(app, owner, 'banh-trang');
    expect((await send({ ...REPORT, elapsed: 800 })).body).toEqual({ error: 'too-fast' });
    const invalid = await send({ ...REPORT, details: 'ngắn', category: 'nope' });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ error: 'invalid', fields: expect.arrayContaining(['details', 'category']) });
    expect((await send({ ...REPORT, site: 'https://evil.example.com' })).body).toMatchObject({ error: 'invalid', fields: ['site'] });
    const unknown = await app.http().post('/api/reports').set('Origin', ORIGIN).send({ ...REPORT, site: 'khong-co' });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'report-site-unknown' });
    expect((await app.http().post('/api/reports').set('Origin', 'https://evil.example.com').send(REPORT)).status).toBe(403);
    expect(await app.handle.db.select().from(abuseReports)).toHaveLength(0);
  });

  it('limits reports per IP', async () => {
    await app.close();
    app = await startTestApp({ reportsPerIp: 3 });
    owner = await app.signIn('shop-owner');
    await publishedShop(app, owner, 'banh-trang');
    for (let i = 0; i < 3; i += 1) expect((await send(REPORT)).status).toBe(201);
    const limited = await send(REPORT);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: 'too-many-requests' });
    expect(await app.handle.db.select().from(abuseReports)).toHaveLength(3);
    // Nobody to tell: no admin has signed in here.
    expect(await app.handle.db.select().from(notificationDeliveries)).toHaveLength(0);
  });
});

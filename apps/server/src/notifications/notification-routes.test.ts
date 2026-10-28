import { createHmac } from 'node:crypto';
import { chatLinkCodes, chatLinks, pushSubscriptions } from '@webnhanh/db';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, startTestApp, type TestApp } from '../test-support';

const BOT = { url: 'https://chat.example.com', username: 'don_bot', token: '1:abcdefghijklmnop', webhookSecret: 'w'.repeat(40) };
const PUSH = { publicKey: 'B'.repeat(87), privateKey: 'p'.repeat(43), subject: 'mailto:noreply@example.com' };
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };

let app: TestApp;
let owner: { accountId: string; cookie: string };

afterEach(async () => {
  await app.close();
});

describe('without push keys or a bot', () => {
  beforeEach(async () => {
    app = await startTestApp();
    owner = await app.signIn('owner');
  });

  it('offers neither channel, and refuses to set them up', async () => {
    const res = await app.http().get('/api/notifications').set('Cookie', owner.cookie);
    expect(res.body).toEqual({ push: null, chat: null });
    expect((await app.http().post('/api/chat/link').set('Cookie', owner.cookie).set('Origin', ORIGIN)).status).toBe(404);
    expect((await app.http().post('/api/push/subscriptions').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ subscription: SUB })).status).toBe(404);
    expect((await app.http().post('/hooks/chat').send('{}')).status).toBe(404);
  });
});

describe('with push keys and a bot', () => {
  beforeEach(async () => {
    app = await startTestApp({ push: PUSH, chatBot: BOT });
    owner = await app.signIn('owner');
  });

  function hook(update: unknown, secret = BOT.webhookSecret) {
    const body = JSON.stringify(update);
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
    return app
      .http()
      .post('/hooks/chat')
      .set('Content-Type', 'application/json')
      .set('X-Bot-Api-Secret-Token', secret)
      .set('X-Bot-Timestamp', ts)
      .set('X-Bot-Signature', sig)
      .send(body);
  }
  const message = (text: string, chatId = 42, type = 'private') => ({ update_id: 1, message: { chat: { id: chatId, type }, seq: 1, date: 1, text } });

  it('needs a session and the app origin', async () => {
    expect((await app.http().get('/api/notifications')).status).toBe(401);
    expect((await app.http().post('/api/chat/link').set('Cookie', owner.cookie).set('Origin', 'https://evil.example')).status).toBe(403);
  });

  it('registers a device for push, once per endpoint, and removes it', async () => {
    const res = await app.http().get('/api/notifications').set('Cookie', owner.cookie);
    expect(res.body).toEqual({ push: { publicKey: PUSH.publicKey }, chat: { linked: false } });
    for (let i = 0; i < 2; i += 1) {
      expect((await app.http().post('/api/push/subscriptions').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ subscription: SUB })).status).toBe(204);
    }
    expect(await app.handle.db.select().from(pushSubscriptions)).toHaveLength(1);
    const del = await app.http().delete('/api/push/subscriptions').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ endpoint: SUB.endpoint });
    expect(del.status).toBe(204);
    expect(await app.handle.db.select().from(pushSubscriptions)).toHaveLength(0);
  });

  it('refuses a push endpoint outside the push services', async () => {
    const res = await app.http().post('/api/push/subscriptions').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ subscription: { ...SUB, endpoint: 'https://127.0.0.1/hook' } });
    expect(res.status).toBe(400);
  });

  it('links a chat with the deep link code, once, and unlinks with /stop', async () => {
    const res = await app.http().post('/api/chat/link').set('Cookie', owner.cookie).set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    const url = new URL(res.body.url as string);
    expect(`${url.origin}${url.pathname}`).toBe('https://chat.example.com/b/don_bot');
    const code = url.searchParams.get('start') ?? '';
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    // Only the hash is stored.
    expect((await app.handle.db.select().from(chatLinkCodes))[0]?.codeHash).not.toBe(code);

    const linked = await hook(message(`/start ${code}`));
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject({ method: 'sendMessage', chat_id: 42 });
    expect(linked.body.text).toContain('Đã bật báo đơn');
    expect(await app.handle.db.select().from(chatLinks)).toEqual([expect.objectContaining({ accountId: owner.accountId, chatId: 42 })]);
    expect((await app.http().get('/api/notifications').set('Cookie', owner.cookie)).body.chat).toEqual({ linked: true });

    // The code is spent: a redelivery or another chat cannot use it.
    const again = await hook(message(`/start ${code}`, 77));
    expect(again.body.text).toContain('đã dùng');
    expect(await app.handle.db.select().from(chatLinks)).toHaveLength(1);

    const stop = await hook(message('/stop'));
    expect(stop.body.text).toContain('Đã tắt');
    expect(await app.handle.db.select().from(chatLinks)).toHaveLength(0);
  });

  it('refuses unsigned updates, and ignores groups and other updates', async () => {
    const res = await app.http().post('/api/chat/link').set('Cookie', owner.cookie).set('Origin', ORIGIN);
    const code = new URL(res.body.url as string).searchParams.get('start') ?? '';
    expect((await hook(message(`/start ${code}`), 'x'.repeat(40))).status).toBe(401);
    expect((await app.http().post('/hooks/chat').set('Content-Type', 'application/json').send(JSON.stringify(message(`/start ${code}`)))).status).toBe(401);
    expect((await hook(message(`/start ${code}`, 77, 'group'))).body).toEqual({});
    expect((await hook({ update_id: 2, callback: {} })).body).toEqual({});
    expect(await app.handle.db.select().from(chatLinks)).toHaveLength(0);
  });

  it('unlinks the chat from the app', async () => {
    await app.handle.db.insert(chatLinks).values({ accountId: owner.accountId, chatId: 42, createdAt: new Date() });
    expect((await app.http().delete('/api/chat/link').set('Cookie', owner.cookie).set('Origin', ORIGIN)).status).toBe(204);
    expect(await app.handle.db.select().from(chatLinks)).toHaveLength(0);
  });
});

import { randomUUID } from 'node:crypto';
import { accounts, chatLinks, jobs, notificationDeliveries, openPglite, pushSubscriptions, queueJobNotices, sites, submissions, type DbHandle } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordOrder } from '../orders/order-store';
import { deliverDue, MAX_ATTEMPTS, RETRY_DELAYS_MS } from './deliveries';
import { DeliveryError, type ChatSender, type PushSender, type SendResult } from './senders';

let handle: DbHandle;
let accountId: string;
let siteId: string;
const quiet = { warn: () => undefined };
const APP = 'https://app.example.com';
const ORDER = { name: 'Lan', phone: '0912345678', address: '12 Lý Thường Kiệt', productKey: 'p1', productName: 'Bánh tráng', quantity: 2, note: '' };

beforeEach(async () => {
  handle = await openPglite();
  const now = new Date();
  const [account] = await handle.db.insert(accounts).values({ sub: 'owner', createdAt: now }).returning();
  if (!account) throw new Error('no account');
  accountId = account.id;
  const [site] = await handle.db.insert(sites).values({ accountId, name: 'tiem-bo', kind: 'template', status: 'published', createdAt: now, updatedAt: now }).returning();
  if (!site) throw new Error('no site');
  siteId = site.id;
  await handle.db.insert(pushSubscriptions).values([
    { id: randomUUID(), accountId, endpoint: 'https://fcm.googleapis.com/fcm/send/phone', p256dh: 'k1', auth: 'a1', createdAt: now },
    { id: randomUUID(), accountId, endpoint: 'https://fcm.googleapis.com/fcm/send/laptop', p256dh: 'k2', auth: 'a2', createdAt: now },
  ]);
  await handle.db.insert(chatLinks).values({ accountId, chatId: 42, createdAt: now });
});

afterEach(async () => {
  await handle.close();
});

function recorder<T extends unknown[]>(answer: (...args: T) => Promise<SendResult>): { calls: T[]; send: (...args: T) => Promise<SendResult> } {
  const calls: T[] = [];
  return {
    calls,
    send: (...args: T) => {
      calls.push(args);
      return answer(...args);
    },
  };
}

async function deliveries() {
  return handle.db.select().from(notificationDeliveries);
}

describe('order notification fan-out', () => {
  it('sends every channel on its own: push failing leaves the chat message and the order untouched', async () => {
    const now = new Date('2026-10-28T08:00:00Z');
    const { id } = await recordOrder(handle.db, { siteId, accountId, order: ORDER }, { push: true, chat: true }, now);
    const push = recorder<[{ endpoint: string }, string]>(() => Promise.reject(new DeliveryError('push-503', false)));
    const chat = recorder<[number, string, number]>(() => Promise.resolve('sent'));
    const result = await deliverDue(handle.db, { push: { send: push.send } as PushSender, chat: { send: chat.send } as ChatSender }, APP, now, quiet);

    expect(result).toEqual({ sent: 1, retrying: 2, dropped: 0, failed: 0 });
    expect(push.calls).toHaveLength(2);
    expect(chat.calls).toHaveLength(1);
    const [chatId, text, randomId] = chat.calls[0] ?? [];
    expect(chatId).toBe(42);
    expect(text).toContain('Đơn mới ở tiem-bo.hoandat.io.vn');
    expect(text).toContain('Bánh tráng × 2');
    expect(text).toContain(`${APP}/sites/${siteId}/orders`);
    expect(Number.isSafeInteger(randomId) && (randomId ?? 0) > 0).toBe(true);
    expect(JSON.parse(push.calls[0]?.[1] ?? '{}')).toMatchObject({ title: 'Đơn mới · tiem-bo', body: 'Lan đặt Bánh tráng × 2', url: `/sites/${siteId}/orders` });

    const rows = await deliveries();
    expect(rows.filter((r) => r.channel === 'chat').map((r) => r.status)).toEqual(['sent']);
    const pushRows = rows.filter((r) => r.channel === 'push');
    expect(pushRows.every((r) => r.status === 'pending' && r.lastError === 'push-503' && r.attempts === 1)).toBe(true);
    expect(pushRows.every((r) => r.nextAttemptAt.getTime() === now.getTime() + RETRY_DELAYS_MS[0])).toBe(true);
    const [order] = await handle.db.select().from(submissions).where(eq(submissions.id, id));
    expect(order?.handledAt).toBeNull();

    // Not due yet: nothing is sent again; once due, the push goes out and the chat is not repeated.
    expect((await deliverDue(handle.db, { push: { send: push.send } as PushSender, chat: { send: chat.send } as ChatSender }, APP, now, quiet)).retrying).toBe(0);
    const later = new Date(now.getTime() + RETRY_DELAYS_MS[0]);
    const ok = recorder<[{ endpoint: string }, string]>(() => Promise.resolve('sent'));
    expect(await deliverDue(handle.db, { push: { send: ok.send } as PushSender, chat: { send: chat.send } as ChatSender }, APP, later, quiet)).toEqual({ sent: 2, retrying: 0, dropped: 0, failed: 0 });
    expect(chat.calls).toHaveLength(1);
    expect((await deliveries()).every((r) => r.status === 'sent')).toBe(true);
  });

  it('a chat sender that throws something unexpected does not stop the push', async () => {
    const now = new Date();
    await recordOrder(handle.db, { siteId, accountId, order: ORDER }, { push: true, chat: true }, now);
    const result = await deliverDue(
      handle.db,
      { push: { send: () => Promise.resolve('sent') }, chat: { send: () => Promise.reject(new TypeError('boom')) } },
      APP,
      now,
      quiet,
    );
    expect(result).toEqual({ sent: 2, retrying: 1, dropped: 0, failed: 0 });
    expect((await deliveries()).find((r) => r.channel === 'chat')?.lastError).toBe('send-error');
  });

  it('drops an expired subscription and an unlinked chat, and forgets them', async () => {
    const now = new Date();
    await recordOrder(handle.db, { siteId, accountId, order: ORDER }, { push: true, chat: true }, now);
    const result = await deliverDue(handle.db, { push: { send: () => Promise.resolve('gone') }, chat: { send: () => Promise.resolve('gone') } }, APP, now, quiet);
    expect(result).toEqual({ sent: 0, retrying: 0, dropped: 3, failed: 0 });
    expect(await handle.db.select().from(pushSubscriptions)).toHaveLength(0);
    expect(await handle.db.select().from(chatLinks)).toHaveLength(0);
  });

  it('gives up after a permanent error or the last attempt', async () => {
    const now = new Date();
    await recordOrder(handle.db, { siteId, accountId, order: ORDER }, { push: false, chat: true }, now);
    const result = await deliverDue(handle.db, { push: null, chat: { send: () => Promise.reject(new DeliveryError('chat-400', true)) } }, APP, now, quiet);
    expect(result.failed).toBe(1);
    expect((await deliveries())[0]).toMatchObject({ status: 'failed', lastError: 'chat-400' });

    await handle.db.delete(notificationDeliveries);
    await recordOrder(handle.db, { siteId, accountId, order: ORDER }, { push: false, chat: true }, now);
    await handle.db.update(notificationDeliveries).set({ attempts: MAX_ATTEMPTS - 1 });
    await deliverDue(handle.db, { push: null, chat: { send: () => Promise.reject(new DeliveryError('chat-503', false)) } }, APP, now, quiet);
    expect((await deliveries())[0]).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('drops deliveries of a channel the server no longer has', async () => {
    const now = new Date();
    await recordOrder(handle.db, { siteId, accountId, order: ORDER }, { push: true, chat: true }, now);
    expect(await deliverDue(handle.db, { push: null, chat: null }, APP, now, quiet)).toEqual({ sent: 0, retrying: 0, dropped: 3, failed: 0 });
  });
});

describe('build notices', () => {
  it('tells the owner who pressed "Báo tôi khi xong" how the build ended, on every channel', async () => {
    const now = new Date('2026-10-28T09:00:00Z');
    const jobId = randomUUID();
    await handle.db.insert(jobs).values({ id: jobId, siteId, accountId, type: 'build', status: 'done', notify: true, createdAt: now, finishedAt: now });
    expect(await queueJobNotices(handle.db, { id: jobId, accountId, notify: true }, now)).toBe(3);
    expect(await queueJobNotices(handle.db, { id: jobId, accountId, notify: false }, now)).toBe(0);
    const push = recorder<[{ endpoint: string }, string]>(() => Promise.resolve('sent'));
    const chat = recorder<[number, string, number]>(() => Promise.resolve('sent'));
    expect(await deliverDue(handle.db, { push: { send: push.send } as PushSender, chat: { send: chat.send } as ChatSender }, APP, now, quiet)).toEqual({ sent: 3, retrying: 0, dropped: 0, failed: 0 });
    expect(JSON.parse(push.calls[0]?.[1] ?? '{}')).toEqual({ title: 'Build xong · tiem-bo', body: 'tiem-bo.hoandat.io.vn đã cập nhật', url: `/sites/${siteId}/deploy?build=${jobId}`, tag: jobId });
    expect(chat.calls[0]?.[1]).toBe(`tiem-bo.hoandat.io.vn đã cập nhật\nXem: ${APP}/sites/${siteId}/deploy?build=${jobId}`);
  });
});

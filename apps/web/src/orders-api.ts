/**
 * The order inbox and notification settings API (apps/server/src/orders, apps/server/src/notifications) as the web
 * app uses it; every response is checked against its shape.
 */
import { z } from 'zod';
import { call } from './api';
import { parse, sendJson } from './sites-api';

const orderSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  handledAt: z.string().nullable(),
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  product: z.string(),
  quantity: z.number(),
  note: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

const orderListSchema = z.object({ site: z.object({ name: z.string(), published: z.boolean() }), orders: z.array(orderSchema), more: z.boolean(), open: z.number() });
export type OrderList = z.infer<typeof orderListSchema>;

export type OrderView = 'open' | 'all';

export async function listOrders(siteId: string, view: OrderView, before?: string): Promise<OrderList> {
  const query = new URLSearchParams(view === 'all' ? { view } : {});
  if (before) query.set('before', before);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return parse(orderListSchema, await call(`/api/sites/${encodeURIComponent(siteId)}/orders${suffix}`));
}

export async function markOrder(siteId: string, orderId: string, handled: boolean): Promise<Order> {
  const path = `/api/sites/${encodeURIComponent(siteId)}/orders/${encodeURIComponent(orderId)}`;
  return parse(z.object({ order: orderSchema }), await call(path, sendJson('PATCH', { handled }))).order;
}

const settingsSchema = z.object({
  push: z.object({ publicKey: z.string() }).nullable(),
  chat: z.object({ linked: z.boolean() }).nullable(),
});
export type NotificationSettings = z.infer<typeof settingsSchema>;

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return parse(settingsSchema, await call('/api/notifications'));
}

export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await call('/api/push/subscriptions', sendJson('POST', { subscription }));
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await call('/api/push/subscriptions', sendJson('DELETE', { endpoint }));
}

/** The bot's deep link with a fresh one-time code. */
export async function chatLinkUrl(): Promise<string> {
  return parse(z.object({ url: z.url() }), await call('/api/chat/link', { method: 'POST' })).url;
}

export async function unlinkChat(): Promise<void> {
  await call('/api/chat/link', { method: 'DELETE' });
}

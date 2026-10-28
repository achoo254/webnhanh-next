/** What an owner is told of a new order: the push notification and the Chat message. */
import { SITES_DOMAIN, type OrderData } from '@webnhanh/db';

export interface OrderNotice {
  readonly submissionId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly order: OrderData;
}

/** Where the owner reads the order in the app. */
export function ordersPath(siteId: string): string {
  return `/sites/${siteId}/orders`;
}

/** The push payload the service worker shows (apps/web/public/sw.js). */
export function pushPayload(notice: OrderNotice): string {
  const { order } = notice;
  return JSON.stringify({
    title: `Đơn mới · ${notice.siteName}`,
    body: `${order.name} đặt ${order.productName} × ${order.quantity}`,
    url: ordersPath(notice.siteId),
    tag: notice.submissionId,
  });
}

/** Plain text (no parse mode: nothing a visitor typed can turn into formatting). */
export function chatText(notice: OrderNotice, appUrl: string): string {
  const { order } = notice;
  return [
    `Đơn mới ở ${notice.siteName}.${SITES_DOMAIN}`,
    `Khách: ${order.name} · ${order.phone}`,
    `Sản phẩm: ${order.productName} × ${order.quantity}`,
    `Địa chỉ: ${order.address}`,
    order.note ? `Ghi chú: ${order.note}` : '',
    `Xem đơn: ${appUrl}${ordersPath(notice.siteId)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** A positive integer below 2^53 from a uuid: the same delivery always sends with the same random_id. */
export function randomIdOf(uuid: string): number {
  return Number.parseInt(uuid.replace(/-/g, '').slice(0, 13), 16) + 1;
}

/** What an owner is told of a new submission (an order, or a wedding guest's reply): the push notification and the Chat message. */
import { SITES_DOMAIN, type SubmissionContent } from '@webnhanh/db';

export interface OrderNotice {
  readonly submissionId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly content: SubmissionContent;
}

/** Where the owner reads orders and replies in the app. */
export function ordersPath(siteId: string): string {
  return `/sites/${siteId}/orders`;
}

/** "sẽ đến (2 người)" or "không đến được". */
function replyLine(content: Extract<SubmissionContent, { kind: 'rsvp' }>): string {
  const { attending, guests } = content.data;
  return attending === 'yes' ? `sẽ đến (${guests} người)` : 'không đến được';
}

/** The push payload the service worker shows (apps/web/public/sw.js). */
export function pushPayload(notice: OrderNotice): string {
  const { content } = notice;
  const words =
    content.kind === 'rsvp'
      ? { title: `Xác nhận tham dự · ${notice.siteName}`, body: `${content.data.name} ${replyLine(content)}` }
      : { title: `Đơn mới · ${notice.siteName}`, body: `${content.data.name} đặt ${content.data.productName} × ${content.data.quantity}` };
  return JSON.stringify({ ...words, url: ordersPath(notice.siteId), tag: notice.submissionId });
}

/** Plain text (no parse mode: nothing a visitor typed can turn into formatting). */
export function chatText(notice: OrderNotice, appUrl: string): string {
  const { content } = notice;
  const host = `${notice.siteName}.${SITES_DOMAIN}`;
  const lines =
    content.kind === 'rsvp'
      ? [
          `Xác nhận tham dự ở ${host}`,
          `Khách: ${content.data.name}${content.data.phone ? ` · ${content.data.phone}` : ''}`,
          `Trả lời: ${replyLine(content)}`,
          content.data.note ? `Lời nhắn: ${content.data.note}` : '',
          `Xem danh sách: ${appUrl}${ordersPath(notice.siteId)}`,
        ]
      : [
          `Đơn mới ở ${host}`,
          `Khách: ${content.data.name} · ${content.data.phone}`,
          `Sản phẩm: ${content.data.productName} × ${content.data.quantity}`,
          `Địa chỉ: ${content.data.address}`,
          content.data.note ? `Ghi chú: ${content.data.note}` : '',
          `Xem đơn: ${appUrl}${ordersPath(notice.siteId)}`,
        ];
  return lines.filter(Boolean).join('\n');
}

/** A positive integer below 2^53 from a uuid: the same delivery always sends with the same random_id. */
export function randomIdOf(uuid: string): number {
  return Number.parseInt(uuid.replace(/-/g, '').slice(0, 13), 16) + 1;
}

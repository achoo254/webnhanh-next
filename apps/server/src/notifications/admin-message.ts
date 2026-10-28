/**
 * What the admins are told: a new abuse report, or a release held for review. Plain text in Chat (nothing a reporter
 * typed can turn into formatting); the push opens the admin tools.
 */
import { SITES_DOMAIN, type AbuseCategory, type ReviewReason } from '@webnhanh/db';

/** Where admins act, in the app. */
export const ADMIN_PATH = '/admin';

export const CATEGORY_LABELS: Readonly<Record<AbuseCategory, string>> = {
  scam: 'Lừa đảo, giả mạo',
  malware: 'Mã độc',
  illegal: 'Nội dung vi phạm pháp luật',
  spam: 'Spam',
  copyright: 'Bản quyền',
  other: 'Khác',
};

export const REASON_LABELS: Readonly<Record<ReviewReason, string>> = {
  'password-input': 'có ô nhập mật khẩu',
  'sensitive-title': 'tiêu đề mang tên ngân hàng, ví điện tử hoặc cơ quan nhà nước',
  'credential-request': 'mang tên ngân hàng, ví, thương hiệu và hỏi đăng nhập hoặc mã',
};

export interface ReportNotice {
  readonly reportId: string;
  readonly siteName: string;
  readonly category: AbuseCategory;
  readonly details: string;
}

export interface ReviewNotice {
  readonly siteId: string;
  readonly siteName: string;
  readonly reasons: readonly ReviewReason[];
}

const shorten = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function reportPushPayload(notice: ReportNotice): string {
  return JSON.stringify({
    title: `Báo cáo vi phạm · ${notice.siteName}`,
    body: `${CATEGORY_LABELS[notice.category]}: ${shorten(notice.details, 120)}`,
    url: ADMIN_PATH,
    tag: notice.reportId,
  });
}

export function reportChatText(notice: ReportNotice, appUrl: string): string {
  return [
    `Báo cáo vi phạm: ${notice.siteName}.${SITES_DOMAIN}`,
    `Loại: ${CATEGORY_LABELS[notice.category]}`,
    `Nội dung: ${shorten(notice.details, 600)}`,
    `Xử lý: ${appUrl}${ADMIN_PATH}`,
  ].join('\n');
}

const reasonsText = (reasons: readonly ReviewReason[]): string => reasons.map((reason) => REASON_LABELS[reason]).join('; ');

export function reviewPushPayload(notice: ReviewNotice): string {
  return JSON.stringify({ title: `Chờ duyệt · ${notice.siteName}`, body: reasonsText(notice.reasons), url: ADMIN_PATH, tag: `review-${notice.siteId}` });
}

export function reviewChatText(notice: ReviewNotice, appUrl: string): string {
  return [`Website chờ duyệt: ${notice.siteName}.${SITES_DOMAIN}`, `Lý do: ${reasonsText(notice.reasons)}`, `Duyệt: ${appUrl}${ADMIN_PATH}`].join('\n');
}

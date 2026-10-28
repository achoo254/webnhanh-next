/** What an owner who pressed "Báo tôi khi xong" is told when the build ends: the push notification and the Chat message. */
import { SITES_DOMAIN } from '@webnhanh/db';

export interface BuildNotice {
  readonly jobId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly status: 'done' | 'failed' | 'skipped';
}

/** Where the owner follows the build in the app. */
export function buildPath(siteId: string, jobId: string): string {
  return `/sites/${siteId}/deploy?build=${jobId}`;
}

function headline(notice: BuildNotice): string {
  const host = `${notice.siteName}.${SITES_DOMAIN}`;
  if (notice.status === 'done') return `${host} đã cập nhật`;
  if (notice.status === 'skipped') return `${host}: không có gì mới để build`;
  return `${host}: build chưa thành công, site cũ vẫn chạy`;
}

export function buildPushPayload(notice: BuildNotice): string {
  return JSON.stringify({
    title: notice.status === 'done' ? `Build xong · ${notice.siteName}` : notice.status === 'failed' ? `Build lỗi · ${notice.siteName}` : `Build bỏ qua · ${notice.siteName}`,
    body: headline(notice),
    url: buildPath(notice.siteId, notice.jobId),
    tag: notice.jobId,
  });
}

export function buildChatText(notice: BuildNotice, appUrl: string): string {
  return [headline(notice), `Xem: ${appUrl}${buildPath(notice.siteId, notice.jobId)}`].join('\n');
}

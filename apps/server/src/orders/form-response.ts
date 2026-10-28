/**
 * Answers of the order endpoint, in the visitor's language (the pages are Vietnamese). The page's script asks for
 * JSON and shows `message`; a plain form post (no script) gets a small HTML page with a way back to the shop.
 */
import { siteOrigin } from '@trang/db';
import { escapeHtml, ORDER_LABELS, type OrderField } from '@trang/templates';
import type { Request, Response } from 'express';

export const FORM_MESSAGES = {
  sent: 'Đã gửi đơn. Cửa hàng sẽ liên hệ với bạn sớm. Cảm ơn bạn!',
  'not-found': 'Trang này không nhận đơn nữa.',
  'forbidden-origin': 'Đơn này không gửi từ trang của cửa hàng.',
  'stale-page': 'Trang đã cũ. Hãy tải lại trang rồi gửi đơn lần nữa.',
  'too-fast': 'Bạn gửi hơi nhanh. Hãy xem lại đơn rồi bấm Gửi đơn lần nữa.',
  'too-many-requests': 'Đã có nhiều đơn gửi đi cùng lúc. Hãy thử lại sau ít phút.',
  invalid: 'Hãy kiểm tra lại:',
  'server-error': 'Chưa gửi được đơn. Hãy thử lại sau ít phút.',
} as const;

export type FormOutcome = keyof typeof FORM_MESSAGES;

/** True when the page's script sent the form (it asks for JSON); false for a plain HTML form post. */
export function wantsJson(req: Request): boolean {
  return (req.get('accept') ?? '').includes('application/json');
}

function messageOf(outcome: FormOutcome, fields: readonly OrderField[]): string {
  if (outcome !== 'invalid') return FORM_MESSAGES[outcome];
  return `${FORM_MESSAGES.invalid} ${fields.map((field) => ORDER_LABELS[field]).join(', ')}.`;
}

function page(message: string, ok: boolean, back: string | null): string {
  return [
    '<!doctype html><html lang="vi"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${ok ? 'Đã gửi đơn' : 'Chưa gửi được đơn'}</title>`,
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ff;color:#1e1636;font:18px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box}',
    'main{max-width:28em;text-align:center}a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:999px;background:#6d4ae0;color:#fff;font-weight:700;text-decoration:none}</style>',
    '</head><body><main>',
    `<h1>${ok ? 'Cảm ơn bạn!' : 'Chưa gửi được đơn'}</h1>`,
    `<p>${escapeHtml(message)}</p>`,
    back ? `<a href="${escapeHtml(back)}">Quay lại cửa hàng</a>` : '',
    '</main></body></html>',
  ].join('');
}

/** Sends the outcome as JSON (`{ ok, error?, message, fields? }`) or as a page, with `status`. */
export function sendFormOutcome(
  req: Request,
  res: Response,
  status: number,
  outcome: FormOutcome,
  options: { siteName?: string; fields?: readonly OrderField[] } = {},
): void {
  const ok = outcome === 'sent';
  const message = messageOf(outcome, options.fields ?? []);
  res.set('Cache-Control', 'no-store');
  if (wantsJson(req)) {
    res.status(status).json(ok ? { ok, message } : { ok, error: outcome, message, ...(options.fields ? { fields: options.fields } : {}) });
    return;
  }
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.status(status).type('html').send(page(message, ok, options.siteName ? `${siteOrigin(options.siteName)}/` : null));
}

/**
 * Answers of the form endpoint, in the visitor's language (the pages are Vietnamese), worded for what was sent: an
 * order from a shop page or a reply from a wedding invitation. The page's script asks for JSON and shows `message`;
 * a plain form post (no script) gets a small HTML page with a way back to the page.
 */
import { siteOrigin } from '@webnhanh/db';
import { escapeHtml, ORDER_LABELS, RSVP_LABELS, type OrderField, type RsvpField } from '@webnhanh/templates';
import type { Request, Response } from 'express';

/** What the visitor sent, by the form's `kind` field: an order unless it says `rsvp`. */
export type FormKind = 'order' | 'rsvp';

export const FORM_MESSAGES = {
  order: {
    sent: 'Đã gửi đơn. Cửa hàng sẽ liên hệ với bạn sớm. Cảm ơn bạn!',
    'not-found': 'Trang này không nhận đơn nữa.',
    'forbidden-origin': 'Đơn này không gửi từ trang của cửa hàng.',
    'stale-page': 'Trang đã cũ. Hãy tải lại trang rồi gửi đơn lần nữa.',
    'too-fast': 'Bạn gửi hơi nhanh. Hãy xem lại đơn rồi bấm Gửi đơn lần nữa.',
    'too-many-requests': 'Đã có nhiều đơn gửi đi cùng lúc. Hãy thử lại sau ít phút.',
    invalid: 'Hãy kiểm tra lại:',
    'server-error': 'Chưa gửi được đơn. Hãy thử lại sau ít phút.',
  },
  rsvp: {
    sent: 'Đã gửi xác nhận. Cô dâu chú rể cảm ơn bạn!',
    'not-found': 'Thiệp này không nhận xác nhận nữa.',
    'forbidden-origin': 'Xác nhận này không gửi từ thiệp cưới.',
    'stale-page': 'Trang đã cũ. Hãy tải lại trang rồi gửi xác nhận lần nữa.',
    'too-fast': 'Bạn gửi hơi nhanh. Hãy xem lại rồi bấm Gửi xác nhận lần nữa.',
    'too-many-requests': 'Đã có nhiều xác nhận gửi đi cùng lúc. Hãy thử lại sau ít phút.',
    invalid: 'Hãy kiểm tra lại:',
    'server-error': 'Chưa gửi được xác nhận. Hãy thử lại sau ít phút.',
  },
} as const satisfies Record<FormKind, Record<string, string>>;

export type FormOutcome = keyof (typeof FORM_MESSAGES)['order'];
export type FormField = OrderField | RsvpField;

/** The headings and back link of the HTML answer, per kind. */
const PAGE_WORDS = {
  order: { sent: 'Đã gửi đơn', notSent: 'Chưa gửi được đơn', back: 'Quay lại cửa hàng' },
  rsvp: { sent: 'Đã gửi xác nhận', notSent: 'Chưa gửi được xác nhận', back: 'Quay lại thiệp cưới' },
} as const satisfies Record<FormKind, Record<string, string>>;

/** True when the page's script sent the form (it asks for JSON); false for a plain HTML form post. */
export function wantsJson(req: Request): boolean {
  return (req.get('accept') ?? '').includes('application/json');
}

/** How each form names its fields, for "Hãy kiểm tra lại: Số điện thoại". */
const LABELS: Readonly<Record<FormKind, Readonly<Record<string, string>>>> = { order: ORDER_LABELS, rsvp: RSVP_LABELS };

function labelOf(kind: FormKind, field: FormField): string {
  return LABELS[kind][field] ?? field;
}

function messageOf(kind: FormKind, outcome: FormOutcome, fields: readonly FormField[]): string {
  const messages = FORM_MESSAGES[kind];
  if (outcome !== 'invalid') return messages[outcome];
  return `${messages.invalid} ${fields.map((field) => labelOf(kind, field)).join(', ')}.`;
}

function page(kind: FormKind, message: string, ok: boolean, back: string | null): string {
  const words = PAGE_WORDS[kind];
  return [
    '<!doctype html><html lang="vi"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${ok ? words.sent : words.notSent}</title>`,
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ff;color:#1e1636;font:18px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box}',
    'main{max-width:28em;text-align:center}a{display:inline-block;margin-top:16px;padding:12px 20px;border-radius:999px;background:#6d4ae0;color:#fff;font-weight:700;text-decoration:none}</style>',
    '</head><body><main>',
    `<h1>${ok ? 'Cảm ơn bạn!' : words.notSent}</h1>`,
    `<p>${escapeHtml(message)}</p>`,
    back ? `<a href="${escapeHtml(back)}">${words.back}</a>` : '',
    '</main></body></html>',
  ].join('');
}

/** Sends the outcome as JSON (`{ ok, error?, message, fields? }`) or as a page, with `status`. */
export function sendFormOutcome(
  req: Request,
  res: Response,
  status: number,
  outcome: FormOutcome,
  options: { kind?: FormKind; siteName?: string; fields?: readonly FormField[] } = {},
): void {
  const kind = options.kind ?? 'order';
  const ok = outcome === 'sent';
  const message = messageOf(kind, outcome, options.fields ?? []);
  res.set('Cache-Control', 'no-store');
  if (wantsJson(req)) {
    res.status(status).json(ok ? { ok, message } : { ok, error: outcome, message, ...(options.fields ? { fields: options.fields } : {}) });
    return;
  }
  res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.status(status).type('html').send(page(kind, message, ok, options.siteName ? `${siteOrigin(options.siteName)}/` : null));
}

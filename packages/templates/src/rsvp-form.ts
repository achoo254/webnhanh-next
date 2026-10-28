/**
 * The wedding page's "Xác nhận tham dự" form, and the rules a reply must follow. It posts to the same app route as the
 * order form (`<app>/f/<site>`) with the same token, honeypot and timing fields, and is driven by the same fixed
 * `ORDER_SCRIPT` unchanged (the script only needs a form with id `order`, the `_e` field, a `.order-status` line and a
 * button), so the page's CSP allows it by the same hash. The `kind` field tells the server it is a reply, not an
 * order. A page rendered without `rsvpForm` (a preview without a site) shows the couple's contact links instead.
 */
import { z } from 'zod';
import { normalizePhone } from './contact-links';
import { escapeHtml, isPlainText } from './html';
import { ORDER_FIELDS, ORDER_SCRIPT, type OrderFormOptions } from './order-form';

export const RSVP_FIELDS = {
  kind: 'kind',
  name: 'name',
  phone: 'phone',
  attending: 'attending',
  guests: 'guests',
  note: 'note',
  honeypot: ORDER_FIELDS.honeypot,
  token: ORDER_FIELDS.token,
  elapsed: ORDER_FIELDS.elapsed,
} as const;

/** The value of `kind` a reply carries. */
export const RSVP_KIND = 'rsvp';

export const RSVP_LIMITS = { name: 80, phone: 20, note: 300, guests: 20 } as const;

export const RSVP_LABELS = {
  name: 'Tên của bạn',
  phone: 'Số điện thoại',
  attending: 'Bạn sẽ đến chứ?',
  guests: 'Số người đi cùng (kể cả bạn)',
  note: 'Lời nhắn cho cô dâu chú rể',
} as const;

export type RsvpField = keyof typeof RSVP_LABELS;

const text = (max: number) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max).refine((value) => isPlainText(value, true), 'control-characters'));

/** One reply as the form sends it. The phone is optional; when given it must be a Vietnamese number. */
export const rsvpInputSchema = z.object({
  kind: z.literal(RSVP_KIND),
  name: text(RSVP_LIMITS.name).pipe(z.string().min(1).refine((value) => !value.includes('\n'), 'one-line')),
  phone: z
    .string()
    .max(RSVP_LIMITS.phone)
    .default('')
    .transform((value, ctx) => {
      if (!value.trim()) return '';
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: 'custom', message: 'invalid-phone' });
        return z.NEVER;
      }
      return phone;
    }),
  attending: z.enum(['yes', 'no']),
  guests: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(RSVP_LIMITS.guests))
    .default(1),
  note: text(RSVP_LIMITS.note).default(''),
});

export type RsvpInput = z.infer<typeof rsvpInputSchema>;

/** The fields of a refused reply, in form order (for "check: Tên của bạn, Số điện thoại"). */
export function rsvpIssueFields(error: z.ZodError): RsvpField[] {
  const named = new Set(error.issues.map((issue) => String(issue.path[0] ?? '')));
  return (Object.keys(RSVP_LABELS) as RsvpField[]).filter((field) => named.has(field));
}

/** The reply section's id: the page's "Xác nhận tham dự" buttons go there. */
export const RSVP_SECTION_ID = 'xac-nhan';

const PHONE_PATTERN = '[0-9+ .\\(\\)\\-]{9,20}';

function field(id: string, label: string, control: string, wide = false): string {
  return `<div class="field${wide ? ' wide' : ''}"><label for="${id}">${label}</label>${control}</div>`;
}

/** The reply form (its section heading comes from the page). Uses `ORDER_CSS` plus `RSVP_CSS`. */
export function rsvpFormHtml(options: OrderFormOptions): string {
  const f = RSVP_FIELDS;
  return [
    `<form id="order" class="order-form rsvp-form" method="post" action="${escapeHtml(options.action)}" accept-charset="utf-8">`,
    `<input type="hidden" name="${f.kind}" value="${RSVP_KIND}">`,
    `<input type="hidden" name="${f.token}" value="${escapeHtml(options.token)}"><input type="hidden" name="${f.elapsed}" value="">`,
    `<div class="hp" aria-hidden="true"><label>Website <input name="${f.honeypot}" tabindex="-1" autocomplete="off"></label></div>`,
    field('r-name', RSVP_LABELS.name, `<input id="r-name" name="${f.name}" required maxlength="${RSVP_LIMITS.name}" autocomplete="name">`),
    field(
      'r-phone',
      RSVP_LABELS.phone,
      `<input id="r-phone" name="${f.phone}" type="tel" inputmode="tel" maxlength="${RSVP_LIMITS.phone}" pattern="${PHONE_PATTERN}" autocomplete="tel">`,
    ),
    `<fieldset class="field wide choices"><legend>${RSVP_LABELS.attending}</legend>`,
    `<label><input type="radio" name="${f.attending}" value="yes" required checked> Mình sẽ đến</label>`,
    `<label><input type="radio" name="${f.attending}" value="no"> Tiếc quá, mình không đến được</label>`,
    '</fieldset>',
    field('r-guests', RSVP_LABELS.guests, `<input id="r-guests" name="${f.guests}" type="number" inputmode="numeric" min="1" max="${RSVP_LIMITS.guests}" value="1" required>`),
    field('r-note', RSVP_LABELS.note, `<textarea id="r-note" name="${f.note}" maxlength="${RSVP_LIMITS.note}" rows="2"></textarea>`, true),
    '<p class="order-status" role="status" aria-live="polite"></p>',
    '<button type="submit">Gửi xác nhận</button>',
    '</form>',
    `<script>${ORDER_SCRIPT}</script>`,
  ].join('');
}

/** The radio group of the reply form, on top of `ORDER_CSS`. */
export const RSVP_CSS = `.choices{border:0;margin:0;padding:0;display:grid;gap:8px}
.choices legend{font-weight:600;font-size:15px;margin-bottom:6px;padding:0}
.choices label{display:flex;align-items:center;gap:10px;min-height:48px;padding:10px 14px;border:var(--field-line);border-radius:var(--r-field);background:var(--field-bg);font-weight:600;cursor:pointer}
.choices input{width:20px;height:20px;accent-color:var(--accent);margin:0}`;

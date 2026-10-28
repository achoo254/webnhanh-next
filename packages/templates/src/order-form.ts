/**
 * The order form of a shop page, and the rules an order must follow. The form is plain HTML that posts to the app
 * (`https://webnhanh.hoandat.com/f/<site>`) and works without script; a small fixed script only sends it with fetch and
 * shows the answer in place. The script never changes with the page, so the page's Content-Security-Policy allows it
 * by one fixed hash (`ORDER_SCRIPT_HASH`, checked by the tests) and nothing else.
 */
import { z } from 'zod';
import { normalizePhone } from './contact-links';
import { escapeHtml, isPlainText } from './html';

/** Field names, shared by the form and the server that reads it. */
export const ORDER_FIELDS = {
  name: 'name',
  phone: 'phone',
  address: 'address',
  product: 'product',
  quantity: 'quantity',
  note: 'note',
  /** Hidden from people (off-screen, out of the tab order); a bot that fills every field fills it. */
  honeypot: 'website',
  /** The signed token of the published page (`signFormToken`). */
  token: '_t',
  /** Milliseconds from the first touch of the form to sending it, measured by the page's script. */
  elapsed: '_e',
} as const;

export const ORDER_LIMITS = {
  name: 80,
  phone: 20,
  address: 300,
  note: 500,
  quantity: 999,
} as const;

/** The labels people see, in the order of the form; also how the server names a field it refused. */
export const ORDER_LABELS = {
  name: 'Họ tên',
  phone: 'Số điện thoại',
  address: 'Địa chỉ nhận hàng',
  product: 'Sản phẩm',
  quantity: 'Số lượng',
  note: 'Ghi chú',
} as const;

export type OrderField = keyof typeof ORDER_LABELS;

const text = (max: number, allowNewline: boolean) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().max(max).refine((value) => isPlainText(value, allowNewline), 'control-characters'));

/**
 * One order as the form sends it (every value a string). The phone must be a Vietnamese number and comes out
 * normalized; the product is a key of the live page's products, checked by the server against them.
 */
export const orderInputSchema = z.object({
  name: text(ORDER_LIMITS.name, false).pipe(z.string().min(1)),
  phone: z
    .string()
    .max(ORDER_LIMITS.phone)
    .transform((value, ctx) => {
      const phone = normalizePhone(value);
      if (!phone) {
        ctx.addIssue({ code: 'custom', message: 'invalid-phone' });
        return z.NEVER;
      }
      return phone;
    }),
  address: text(ORDER_LIMITS.address, true).pipe(z.string().min(1)),
  product: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  quantity: z
    .string()
    .regex(/^\d{1,3}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(ORDER_LIMITS.quantity)),
  note: text(ORDER_LIMITS.note, true).default(''),
});

export type OrderInput = z.infer<typeof orderInputSchema>;

/** The fields of a refused order, in form order (for "check: Số điện thoại, Địa chỉ"). */
export function orderIssueFields(error: z.ZodError): OrderField[] {
  const named = new Set(error.issues.map((issue) => String(issue.path[0] ?? '')));
  return (Object.keys(ORDER_LABELS) as OrderField[]).filter((field) => named.has(field));
}

/**
 * The page's script: sends the form with fetch (a simple CORS request: form-encoded body, only an Accept header),
 * shows the server's answer in the status line, and replaces the form with the thank-you on success. Old browsers
 * without fetch post the form as plain HTML. Keep it short: it is part of every shop page.
 */
export const ORDER_SCRIPT =
  '(function(){var f=document.getElementById("order");if(!f||!window.fetch||!window.URLSearchParams)return;' +
  'var s=f.querySelector(".order-status"),b=f.querySelector("button"),t=0;' +
  'function m(){t=t||Date.now()}f.addEventListener("focusin",m);f.addEventListener("input",m);' +
  'f.addEventListener("submit",function(e){e.preventDefault();f.elements._e.value=t?Date.now()-t:0;b.disabled=true;' +
  's.textContent="\\u0110ang g\\u1eedi\\u2026";' +
  'fetch(f.action,{method:"POST",body:new URLSearchParams(new FormData(f)),headers:{Accept:"application/json"}})' +
  '.then(function(r){return r.json()}).then(function(j){if(j.ok){var p=document.createElement("p");p.className="order-done";' +
  'p.tabIndex=-1;p.textContent=j.message;f.parentNode.replaceChild(p,f);p.focus()}else{s.textContent=j.message;b.disabled=false}})' +
  '.catch(function(){s.textContent="Ch\\u01b0a g\\u1eedi \\u0111\\u01b0\\u1ee3c. Ki\\u1ec3m tra m\\u1ea1ng r\\u1ed3i th\\u1eed l\\u1ea1i.";b.disabled=false})})})();';

/** `sha256-…` of ORDER_SCRIPT for the page's script-src (the tests recompute it). */
export const ORDER_SCRIPT_HASH = 'sha256-kAD/00QqHyjtpo0R+XnQsvEKxySP+Qu37W+36zNT9x4=';

export interface OrderFormOptions {
  /** Where the form posts: `<app>/f/<site name>`. */
  readonly action: string;
  /** The page's signed form token. */
  readonly token: string;
}

export interface OrderProductOption {
  readonly key: string;
  readonly name: string;
  readonly price: string;
}

/** Characters a Vietnamese phone number may be typed with; the server normalizes and checks the number itself. */
const PHONE_PATTERN = '[0-9+ .\\(\\)\\-]{9,20}';

function field(id: string, label: string, control: string): string {
  return `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
}

/** The order section of a shop page (the products as choices), or '' when there is nothing to order. */
export function orderFormHtml(products: readonly OrderProductOption[], options: OrderFormOptions): string {
  if (products.length === 0) return '';
  const f = ORDER_FIELDS;
  const choices = products
    .map((p) => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.price ? `${p.name} (${p.price})` : p.name)}</option>`)
    .join('');
  const select =
    products.length === 1
      ? `<select id="o-product" name="${f.product}" required>${choices}</select>`
      : `<select id="o-product" name="${f.product}" required><option value="">Chọn sản phẩm</option>${choices}</select>`;
  return [
    '<section class="order" aria-labelledby="dh"><h2 id="dh">Đặt hàng</h2>',
    `<form id="order" class="order-form" method="post" action="${escapeHtml(options.action)}" accept-charset="utf-8">`,
    `<input type="hidden" name="${f.token}" value="${escapeHtml(options.token)}"><input type="hidden" name="${f.elapsed}" value="">`,
    `<div class="hp" aria-hidden="true"><label>Website <input name="${f.honeypot}" tabindex="-1" autocomplete="off"></label></div>`,
    field('o-name', ORDER_LABELS.name, `<input id="o-name" name="${f.name}" required maxlength="${ORDER_LIMITS.name}" autocomplete="name">`),
    field(
      'o-phone',
      ORDER_LABELS.phone,
      `<input id="o-phone" name="${f.phone}" type="tel" inputmode="tel" required maxlength="${ORDER_LIMITS.phone}" pattern="${PHONE_PATTERN}" autocomplete="tel">`,
    ),
    field(
      'o-address',
      ORDER_LABELS.address,
      `<textarea id="o-address" name="${f.address}" required maxlength="${ORDER_LIMITS.address}" rows="2" autocomplete="street-address"></textarea>`,
    ),
    field('o-product', ORDER_LABELS.product, select),
    field(
      'o-qty',
      ORDER_LABELS.quantity,
      `<input id="o-qty" name="${f.quantity}" type="number" inputmode="numeric" min="1" max="${ORDER_LIMITS.quantity}" value="1" required>`,
    ),
    field('o-note', ORDER_LABELS.note, `<textarea id="o-note" name="${f.note}" maxlength="${ORDER_LIMITS.note}" rows="2"></textarea>`),
    '<p class="order-status" role="status" aria-live="polite"></p>',
    '<button type="submit">Gửi đơn</button>',
    '</form></section>',
    `<script>${ORDER_SCRIPT}</script>`,
  ].join('');
}

/** CSS of the order section, appended to the page's stylesheet. */
export const ORDER_CSS = `.order{margin-top:28px}
.order-form{background:#fff;border-radius:20px;padding:16px 14px;display:grid;gap:12px;box-shadow:0 2px 10px rgba(0,0,0,.06)}
.field{display:grid;gap:4px}
.field label{font-weight:700;font-size:15px}
.field input,.field select,.field textarea{font:inherit;color:inherit;width:100%;min-height:48px;padding:10px 12px;border:1.5px solid color-mix(in srgb,var(--ink) 25%,#fff);border-radius:12px;background:#fff}
.field textarea{resize:vertical}
.field input:focus-visible,.field select:focus-visible,.field textarea:focus-visible{outline:3px solid var(--accent);outline-offset:1px}
.order-form button{min-height:52px;border:0;border-radius:999px;background:var(--accent);color:#fff;font:inherit;font-weight:800;cursor:pointer}
.order-form button:disabled{opacity:.6}
.order-form button:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.order-status:empty{display:none}
.order-status{margin:0;font-weight:700}
.order-done{background:#fff;border-radius:20px;padding:18px 14px;font-weight:800;text-align:center}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}`;

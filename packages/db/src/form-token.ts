/**
 * The token a published page's order form carries: when the page was published, and an HMAC binding that time to
 * the site. The worker signs it into the page; the server checks it on every order. It proves the order came
 * through a form this service published for that very site (a script cannot make one up for any site it likes),
 * and it is no cookie: pages on hoandat.io.vn never carry one.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN = /^(\d{10,13})\.([A-Za-z0-9_-]{43})$/;

function mac(secret: string, siteId: string, issuedAt: number): string {
  return createHmac('sha256', secret).update(`order-form:${siteId}:${issuedAt}`).digest('base64url');
}

/** `<unix seconds>.<mac>` for `siteId`, issued at `now`. */
export function signFormToken(secret: string, siteId: string, now: Date): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return `${issuedAt}.${mac(secret, siteId, issuedAt)}`;
}

/** When the token was issued, or null when it is not a token of `siteId` signed with `secret` (or from the future). */
export function verifyFormToken(secret: string, siteId: string, token: unknown, now: Date): Date | null {
  if (typeof token !== 'string') return null;
  const match = TOKEN.exec(token);
  if (!match?.[1] || !match[2]) return null;
  const issuedAt = Number(match[1]);
  const want = Buffer.from(mac(secret, siteId, issuedAt));
  const got = Buffer.from(match[2]);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  // A minute of clock difference between the worker and the server is fine; more is not a token we issued.
  if (issuedAt * 1000 > now.getTime() + 60_000) return null;
  return new Date(issuedAt * 1000);
}

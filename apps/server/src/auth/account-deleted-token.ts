/**
 * The checks of the IdP's account-deletion notice (auth-next ADR 0018): a Security Event Token (RFC 8417) signed ES256
 * with `typ: secevent+jwt`, issued by our IdP for exactly this receiver's URL, not expired, carrying the
 * `account.deleted` event and the deleted account's `sub`. The signature itself is checked against the IdP's JWKS by
 * auth/idp-metadata.ts; this file only reads the header and the claims.
 */
import type { DecodedJws } from './jws-verify';

export const ACCOUNT_DELETED_EVENT = 'urn:hoandat:auth:event:account.deleted';
/** Tolerance for clock differences between the IdP and this server. */
const CLOCK_SKEW_S = 60;
const SET_TYPES = new Set(['secevent+jwt', 'application/secevent+jwt']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a compact JWS presents itself as a SET (its `typ`, compared without case as RFC 7515 §4.1.9 allows). */
export function isSecurityEventToken(jws: DecodedJws): boolean {
  const { typ } = jws.header;
  return typeof typ === 'string' && SET_TYPES.has(typ.toLowerCase());
}

/** The deleted account's `sub` when the claims of a signature-checked SET are right for `expect`; null otherwise. */
export function deletedSub(claims: Record<string, unknown>, expect: { issuer: string; audience: string }, nowMs: number): string | null {
  if (claims.iss !== expect.issuer || claims.aud !== expect.audience) return null;
  const nowS = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S <= nowS) return null;
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S > nowS) return null;
  if (!isRecord(claims.events) || !isRecord(claims.events[ACCOUNT_DELETED_EVENT])) return null;
  return typeof claims.sub === 'string' && claims.sub !== '' ? claims.sub : null;
}

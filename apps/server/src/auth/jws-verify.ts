// Signature check of a compact JWS the IdP signed (its account-deletion SETs) against its published keys, with
// node:crypto only. Only ES256 is accepted, the algorithm the IdP signs with: `none`, HMAC and anything else are
// refused, so a token can never pick a weaker check.
import { createPublicKey, verify, type JsonWebKeyInput, type KeyObject } from 'node:crypto';

/** One key of the IdP's JWKS, as published (only the members the checks read are typed). */
export interface Jwk {
  kty?: unknown;
  crv?: unknown;
  kid?: unknown;
  alg?: unknown;
  use?: unknown;
  [member: string]: unknown;
}

/** A compact JWS split and decoded. */
export interface DecodedJws {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/** The JWS split and decoded; null when it is not one. */
export function decodeJws(token: string): DecodedJws | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader = '', rawPayload = '', rawSignature = ''] = parts;
  const header = decodeJson(rawHeader);
  const payload = decodeJson(rawPayload);
  if (!header || !payload || rawSignature === '') return null;
  return { header, payload, signingInput: `${rawHeader}.${rawPayload}`, signature: Buffer.from(rawSignature, 'base64url') };
}

function keyObject(jwk: Jwk): KeyObject | null {
  try {
    // Only the public members of an EC key; node:crypto refuses anything that is not a valid public key.
    const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
    const input: JsonWebKeyInput = { key: { kty: str(jwk.kty), crv: str(jwk.crv), x: str(jwk.x), y: str(jwk.y) }, format: 'jwk' };
    return createPublicKey(input);
  } catch {
    return null;
  }
}

/** The P-256 signing keys of `keys` a token naming `kid` may have used (every one of them when it names none). */
function candidateKeys(keys: readonly Jwk[], kid: unknown): Jwk[] {
  return keys.filter(
    (key) =>
      key.kty === 'EC' &&
      key.crv === 'P-256' &&
      (key.use === undefined || key.use === 'sig') &&
      (key.alg === undefined || key.alg === 'ES256') &&
      (typeof kid !== 'string' || key.kid === kid),
  );
}

/** Whether `jws` is signed ES256 by one of `keys`. */
export function verifyJws(jws: DecodedJws, keys: readonly Jwk[]): boolean {
  if (jws.header.alg !== 'ES256') return false;
  const data = Buffer.from(jws.signingInput);
  return candidateKeys(keys, jws.header.kid).some((jwk) => {
    const key = keyObject(jwk);
    if (!key) return false;
    try {
      return verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, jws.signature);
    } catch {
      return false;
    }
  });
}

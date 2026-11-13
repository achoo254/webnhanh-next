/**
 * What the app reads from the IdP itself: its discovery document (cached for an hour, used by sign-in) and its signing
 * keys (cached for a day, refetched at most once a minute when a token names a key the cache does not hold, i.e. the
 * IdP rotated), used to check its account-deletion notices. The key set must live on the issuer's own origin.
 */
import { z } from 'zod';
import { type Jwk, decodeJws, verifyJws } from './jws-verify';

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
const JWKS_REFETCH_MS = 60 * 1000;
const IDP_TIMEOUT_MS = 10_000;

const DiscoverySchema = z.object({
  issuer: z.string().min(1),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  userinfo_endpoint: z.url().optional(),
  jwks_uri: z.url().optional(),
});
export type Discovery = z.infer<typeof DiscoverySchema>;

const JwksSchema = z.object({ keys: z.array(z.record(z.string(), z.unknown())) });

export interface IdpMetadata {
  discover(): Promise<Discovery>;
  /** The payload of a JWS the IdP signed, or null (bad shape, unknown key or bad signature). Throws when the keys cannot be read. */
  verifiedPayload(token: string): Promise<Record<string, unknown> | null>;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(IDP_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`idp answered ${res.status}`);
  return res.json();
}

export function idpMetadata(issuer: string, now: () => number = Date.now): IdpMetadata {
  let discovered: { at: number; doc: Discovery } | null = null;
  let keys: { at: number; value: Jwk[] } | null = null;

  async function discover(): Promise<Discovery> {
    if (discovered && now() - discovered.at < DISCOVERY_TTL_MS) return discovered.doc;
    const doc = DiscoverySchema.parse(await getJson(`${issuer}/.well-known/openid-configuration`));
    if (doc.issuer !== issuer) throw new Error('discovery issuer does not match AUTH_ISSUER');
    discovered = { at: now(), doc };
    return doc;
  }

  async function signingKeys(refetch: boolean): Promise<Jwk[]> {
    const age = keys ? now() - keys.at : Infinity;
    if (keys && age < JWKS_TTL_MS && (!refetch || age < JWKS_REFETCH_MS)) return keys.value;
    const { jwks_uri: jwksUri } = await discover();
    if (!jwksUri) throw new Error('discovery has no jwks_uri');
    if (new URL(jwksUri).origin !== new URL(issuer).origin) throw new Error('jwks_uri is not on the issuer');
    keys = { at: now(), value: JwksSchema.parse(await getJson(jwksUri)).keys };
    return keys.value;
  }

  return {
    discover,
    async verifiedPayload(token) {
      const jws = decodeJws(token);
      if (!jws) return null;
      if (verifyJws(jws, await signingKeys(false))) return jws.payload;
      return verifyJws(jws, await signingKeys(true)) ? jws.payload : null;
    },
  };
}

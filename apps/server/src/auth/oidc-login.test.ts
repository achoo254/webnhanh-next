import { describe, expect, it } from 'vitest';
import { codeChallenge, newLoginState, openState, safeReturnPath, sealState, subFromIdToken, withLoginResult } from './oidc-login';

const KEY = 'k'.repeat(40);
const b64 = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (claims: Record<string, unknown>): string => `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;

describe('sign-in state', () => {
  it('round-trips through the signed cookie and refuses tampering and expiry', () => {
    const s = newLoginState('/video', 'en', 1_000_000);
    const sealed = sealState(s, KEY);
    expect(openState(sealed, KEY, 1_000_000)).toEqual(s);
    expect(openState(sealed, 'x'.repeat(40), 1_000_000)).toBeNull();
    expect(openState(`${sealed}x`, KEY, 1_000_000)).toBeNull();
    expect(openState(sealed, KEY, 1_000_000 + 601_000)).toBeNull();
  });

  it('only returns to local paths', () => {
    expect(safeReturnPath('/tao?t=ke-nhanh')).toBe('/tao?t=ke-nhanh');
    expect(safeReturnPath('/video#x')).toBe('/video');
    // Encoded slashes stay inside the path: the browser does not decode them into a host.
    expect(safeReturnPath('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com');
    const bad = ['https://evil.com', '//evil.com', '/\\evil.com', '/.//evil.com', '/..//evil.com', '/%2e%2e//evil.com', '/%2E//evil.com', '%2F%2Fevil.com', '/tao\n', '/a\u0000', 'tao', 42, null];
    for (const value of bad) expect(safeReturnPath(value), String(value)).toBe('/');
  });

  it('never builds a redirect off the site when adding the sign-in result', () => {
    expect(withLoginResult('/tao?t=x', 'fail')).toBe('/tao?t=x&login=fail');
    for (const value of ['/.//evil.com', '//evil.com', '/\\evil.com', '/%2e%2e//evil.com']) {
      const out = withLoginResult(value, 'fail');
      expect(out, value).toBe('/?login=fail');
      expect(new URL(out, 'https://trang.example').origin).toBe('https://trang.example');
    }
  });

  it('derives the S256 PKCE challenge (RFC 7636 appendix B)', () => {
    expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('ID token checks', () => {
  const expect_ = { issuer: 'https://auth.hoandat.com', clientId: 'trang-web', nonce: 'n1' };
  const good = { iss: expect_.issuer, aud: 'trang-web', exp: 2_000, nonce: 'n1', sub: 'acc-1' };

  it('accepts a matching token and returns its sub', () => {
    expect(subFromIdToken(token(good), expect_, 1_000_000)).toBe('acc-1');
    expect(subFromIdToken(token({ ...good, aud: ['other', 'trang-web'] }), expect_, 1_000_000)).toBe('acc-1');
  });

  it('refuses wrong issuer, audience, nonce, expired tokens and missing sub', () => {
    for (const bad of [{ iss: 'https://evil' }, { aud: 'other' }, { nonce: 'n2' }, { exp: 999 }, { sub: '' }]) {
      expect(subFromIdToken(token({ ...good, ...bad }), expect_, 1_000_000)).toBeNull();
    }
    expect(subFromIdToken('garbage', expect_, 1_000_000)).toBeNull();
  });
});

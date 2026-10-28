import { describe, expect, it } from 'vitest';
import { signFormToken, verifyFormToken } from './form-token';

const SECRET = 'x'.repeat(40);
const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-28T07:00:00Z');

describe('form token', () => {
  it('verifies a token of its own site and returns when it was issued', () => {
    const token = signFormToken(SECRET, SITE, NOW);
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
    expect(verifyFormToken(SECRET, SITE, token, new Date(NOW.getTime() + 86_400_000))).toEqual(NOW);
  });

  it('refuses a token of another site, another secret, tampered, from the future or not a token', () => {
    const token = signFormToken(SECRET, SITE, NOW);
    expect(verifyFormToken(SECRET, OTHER, token, NOW)).toBeNull();
    expect(verifyFormToken('y'.repeat(40), SITE, token, NOW)).toBeNull();
    const [time, mac] = token.split('.');
    expect(verifyFormToken(SECRET, SITE, `${Number(time) - 1}.${mac}`, NOW)).toBeNull();
    expect(verifyFormToken(SECRET, SITE, token, new Date(NOW.getTime() - 120_000))).toBeNull();
    for (const bad of [undefined, 42, '', 'abc', `${time}.short`, `${token}x`]) expect(verifyFormToken(SECRET, SITE, bad, NOW)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const PRODUCTION = {
  NODE_ENV: 'production',
  PORT: '4860',
  PUBLIC_URL: 'https://trang.hoandat.com/',
  DATABASE_URL: 'postgres://trang:pw@127.0.0.1:5432/trang',
  AUTH_ISSUER: 'https://auth.hoandat.com',
  AUTH_CLIENT_SECRET: 'x'.repeat(40),
  UPLOADS_DIR: '/var/www/trang/uploads',
  FORM_SECRET: 'f'.repeat(40),
};

const VAPID = { VAPID_PUBLIC_KEY: 'B'.repeat(87), VAPID_PRIVATE_KEY: 'p'.repeat(43), VAPID_SUBJECT: 'mailto:noreply@hoandat.com' };
const BOT = { CHAT_URL: 'https://chat.hoandat.com/', CHAT_BOT_USERNAME: 'trang_bot', CHAT_BOT_TOKEN: '123:abcdefghijklmnopqr', CHAT_BOT_WEBHOOK_SECRET: 'w'.repeat(40) };

describe('server config', () => {
  it('runs in dev with nothing set: PGlite, sign-in off, the dev web server allowed', () => {
    const config = loadConfig({});
    expect(config.databaseUrl).toBeUndefined();
    expect(config.auth).toBeNull();
    expect(config.port).toBe(5296);
    expect(config.allowedOrigins).toContain('http://localhost:5297');
    expect(config.uploadsDir).toMatch(/\.data[/\\]uploads$/);
    expect(config.sitesPerAccount).toBe(5);
    expect(config.siteMaxBytes).toBe(20 * 1024 * 1024);
    expect(config.ffmpegPath).toBe('ffmpeg');
  });

  it('reads production env', () => {
    const config = loadConfig(PRODUCTION);
    expect(config.port).toBe(4860);
    expect(config.publicUrl).toBe('https://trang.hoandat.com');
    expect(config.allowedOrigins).toEqual(['https://trang.hoandat.com']);
    expect(config.auth).toEqual({
      issuer: 'https://auth.hoandat.com',
      clientId: 'trang-web',
      clientSecret: 'x'.repeat(40),
      redirectUri: 'https://trang.hoandat.com/auth/callback',
    });
  });

  it('fails fast on missing or unsafe production env', () => {
    for (const key of ['DATABASE_URL', 'AUTH_CLIENT_SECRET', 'PUBLIC_URL', 'UPLOADS_DIR', 'FORM_SECRET'] as const) {
      const env: Record<string, string | undefined> = { ...PRODUCTION, [key]: undefined };
      expect(() => loadConfig(env), key).toThrow(key);
    }
    expect(() => loadConfig({ ...PRODUCTION, PUBLIC_URL: 'http://trang.hoandat.com' })).toThrow('https');
    expect(() => loadConfig({ ...PRODUCTION, AUTH_ISSUER: 'http://auth.hoandat.com' })).toThrow('AUTH_ISSUER');
    expect(() => loadConfig({ ...PRODUCTION, AUTH_CLIENT_SECRET: 'short' })).toThrow('AUTH_CLIENT_SECRET');
    expect(() => loadConfig({ ...PRODUCTION, PORT: 'abc' })).toThrow('PORT');
    expect(() => loadConfig({ ...PRODUCTION, SITES_PER_ACCOUNT: '0' })).toThrow('SITES_PER_ACCOUNT');
  });

  it('turns Web Push and the Chat bot on only with all their keys, and off without any', () => {
    const off = loadConfig(PRODUCTION);
    expect(off.push).toBeNull();
    expect(off.chatBot).toBeNull();
    const on = loadConfig({ ...PRODUCTION, ...VAPID, ...BOT });
    expect(on.push).toEqual({ publicKey: VAPID.VAPID_PUBLIC_KEY, privateKey: VAPID.VAPID_PRIVATE_KEY, subject: VAPID.VAPID_SUBJECT });
    expect(on.chatBot).toEqual({ url: 'https://chat.hoandat.com', username: 'trang_bot', token: BOT.CHAT_BOT_TOKEN, webhookSecret: BOT.CHAT_BOT_WEBHOOK_SECRET });
    expect(() => loadConfig({ ...PRODUCTION, VAPID_PUBLIC_KEY: VAPID.VAPID_PUBLIC_KEY })).toThrow('VAPID_PRIVATE_KEY, VAPID_SUBJECT');
    expect(() => loadConfig({ ...PRODUCTION, ...BOT, CHAT_BOT_TOKEN: '' })).toThrow('CHAT_BOT_TOKEN');
    expect(() => loadConfig({ ...PRODUCTION, ...BOT, CHAT_URL: 'http://chat.hoandat.com' })).toThrow('https');
    expect(() => loadConfig({ ...PRODUCTION, ...VAPID, VAPID_SUBJECT: 'noreply' })).toThrow('VAPID_SUBJECT');
  });

  it('has a fixed form secret in dev only', () => {
    expect(loadConfig({}).formSecret.length).toBeGreaterThanOrEqual(32);
    expect(loadConfig(PRODUCTION).formSecret).toBe('f'.repeat(40));
  });
});

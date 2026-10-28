import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const emptyIsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** Dev database under the repo's gitignored .data/. */
export const DEV_PGLITE_DIR = path.join(REPO_ROOT, '.data', 'pglite');
/** The Vite dev server (apps/web), which proxies /api, /auth and /healthz here. */
export const DEV_WEB_ORIGINS = ['http://localhost:5297', 'http://127.0.0.1:5297'] as const;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5296),
  /** Where people open the app (no trailing slash); the sign-in callback is PUBLIC_URL/auth/callback. */
  PUBLIC_URL: z.preprocess(emptyIsUnset, z.url().default('http://localhost:5297')),
  AUTH_ISSUER: z.preprocess(emptyIsUnset, z.url().default('https://auth.hoandat.com')),
  AUTH_CLIENT_ID: z.preprocess(emptyIsUnset, z.string().min(1).default('trang-web')),
  /** Secret of the confidential client `trang-web` registered at the IdP. Unset: sign-in is off. */
  AUTH_CLIENT_SECRET: z.preprocess(emptyIsUnset, z.string().min(32).optional()),
  /** Postgres; unset: embedded PGlite under .data/ (dev). */
  DATABASE_URL: z.preprocess(emptyIsUnset, z.url().optional()),
});

export interface AuthConfig {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

export interface ServerConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly publicUrl: string;
  /** Origins allowed to make state-changing requests (CSRF check): the public origin, plus the dev web server. */
  readonly allowedOrigins: readonly string[];
  /** Sign-in through auth.hoandat.com; null when no client secret is set (sign-in then answers "unavailable"). */
  readonly auth: AuthConfig | null;
  readonly databaseUrl: string | undefined;
}

/** Validates env once at startup; throws with the offending keys so the process fails fast. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server env: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production) {
    const missing = [!e.DATABASE_URL && 'DATABASE_URL', !e.AUTH_CLIENT_SECRET && 'AUTH_CLIENT_SECRET', !env.PUBLIC_URL && 'PUBLIC_URL'].filter(Boolean);
    if (missing.length > 0) throw new Error(`Invalid server env: ${missing.join(', ')} required in production`);
  }
  const publicUrl = e.PUBLIC_URL.replace(/\/+$/, '');
  const publicOrigin = new URL(publicUrl);
  if (production && publicOrigin.protocol !== 'https:') throw new Error('Invalid server env: PUBLIC_URL must be https in production');
  const issuer = new URL(e.AUTH_ISSUER);
  if (issuer.protocol !== 'https:' && (production || !LOOPBACK_HOSTS.includes(issuer.hostname))) {
    throw new Error('Invalid server env: AUTH_ISSUER must be https (http only on loopback outside production)');
  }
  const devOrigins = production ? [] : DEV_WEB_ORIGINS;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    publicUrl,
    allowedOrigins: [...new Set([publicOrigin.origin, ...devOrigins])],
    auth: e.AUTH_CLIENT_SECRET
      ? { issuer: e.AUTH_ISSUER.replace(/\/+$/, ''), clientId: e.AUTH_CLIENT_ID, clientSecret: e.AUTH_CLIENT_SECRET, redirectUri: `${publicUrl}/auth/callback` }
      : null,
    databaseUrl: e.DATABASE_URL,
  };
}

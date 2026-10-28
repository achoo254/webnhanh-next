import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SITE_MAX_MB } from '@trang/db';
import { z } from 'zod';

const emptyIsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** Dev database under the repo's gitignored .data/. */
export const DEV_PGLITE_DIR = path.join(REPO_ROOT, '.data', 'pglite');
/** Dev photos and published sites (the dev server runs the publish worker in-process: PGlite has one owner). */
export const DEV_UPLOADS_DIR = path.join(REPO_ROOT, '.data', 'uploads');
export const DEV_SITES_DIR = path.join(REPO_ROOT, '.data', 'sites');
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
  /** Uploaded photos (UPLOADS_DIR/<site id>/...); the worker reads them from the same place. */
  UPLOADS_DIR: z.preprocess(emptyIsUnset, z.string().min(1).optional()),
  /** An ffmpeg that can write WebP (libwebp), and its ffprobe. Unset: the ones on PATH. */
  FFMPEG_PATH: z.preprocess(emptyIsUnset, z.string().min(1).default('ffmpeg')),
  FFPROBE_PATH: z.preprocess(emptyIsUnset, z.string().min(1).default('ffprobe')),
  /** Template sites one account may have. */
  SITES_PER_ACCOUNT: z.coerce.number().int().min(1).max(100).default(5),
  /** Size limit of one site in MB (its photos, and each release). */
  SITE_MAX_MB: z.coerce.number().int().min(1).max(500).default(DEFAULT_SITE_MAX_MB),
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
  readonly uploadsDir: string;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly sitesPerAccount: number;
  readonly siteMaxBytes: number;
}

/** Validates env once at startup; throws with the offending keys so the process fails fast. */
export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid server env: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  if (production) {
    const missing = [
      !e.DATABASE_URL && 'DATABASE_URL',
      !e.AUTH_CLIENT_SECRET && 'AUTH_CLIENT_SECRET',
      !env.PUBLIC_URL && 'PUBLIC_URL',
      !e.UPLOADS_DIR && 'UPLOADS_DIR',
    ].filter(Boolean);
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
    uploadsDir: e.UPLOADS_DIR ?? DEV_UPLOADS_DIR,
    ffmpegPath: e.FFMPEG_PATH,
    ffprobePath: e.FFPROBE_PATH,
    sitesPerAccount: e.SITES_PER_ACCOUNT,
    siteMaxBytes: e.SITE_MAX_MB * 1024 * 1024,
  };
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SITE_MAX_MB, parseAdminSubs } from '@webnhanh/db';
import { z } from 'zod';

const emptyIsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
/** Dev database under the repo's gitignored .data/. */
export const DEV_PGLITE_DIR = path.join(REPO_ROOT, '.data', 'pglite');
/** Dev photos and published sites (the dev server runs the publish worker in-process: PGlite has one owner). */
export const DEV_UPLOADS_DIR = path.join(REPO_ROOT, '.data', 'uploads');
export const DEV_SITES_DIR = path.join(REPO_ROOT, '.data', 'sites');
/** Dev developer builds (the dev server runs the builder in-process too): inbox, staging, work, caches. */
export const DEV_BUILDS_DIR = path.join(REPO_ROOT, '.data', 'builds');
/** The Vite dev server (apps/web), which proxies /api, /auth and /healthz here. */
export const DEV_WEB_ORIGINS = ['http://localhost:5297', 'http://127.0.0.1:5297'] as const;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5296),
  /** Where people open the app (no trailing slash); the sign-in callback is PUBLIC_URL/auth/callback. */
  PUBLIC_URL: z.preprocess(emptyIsUnset, z.url().default('http://localhost:5297')),
  AUTH_ISSUER: z.preprocess(emptyIsUnset, z.url().default('https://auth.hoandat.com')),
  AUTH_CLIENT_ID: z.preprocess(emptyIsUnset, z.string().min(1).default('webnhanh-web')),
  /** Secret of the confidential client `webnhanh-web` registered at the IdP. Unset: sign-in is off. */
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
  /** Signs and checks the order form token of every published page (the worker reads the same value). */
  FORM_SECRET: z.preprocess(emptyIsUnset, z.string().min(32).optional()),
  /** Web Push (VAPID): the key pair and the contact of the sender. All three or none (push off). */
  VAPID_PUBLIC_KEY: z.preprocess(emptyIsUnset, z.string().regex(/^[A-Za-z0-9_-]{80,100}$/).optional()),
  VAPID_PRIVATE_KEY: z.preprocess(emptyIsUnset, z.string().regex(/^[A-Za-z0-9_-]{40,50}$/).optional()),
  VAPID_SUBJECT: z.preprocess(emptyIsUnset, z.string().regex(/^(mailto:\S+@\S+|https:\/\/\S+)$/).optional()),
  /** The Chat app and its bot that sends new orders. All four or none (the Chat button is hidden). */
  CHAT_URL: z.preprocess(emptyIsUnset, z.url().optional()),
  CHAT_BOT_USERNAME: z.preprocess(emptyIsUnset, z.string().regex(/^[A-Za-z0-9_]{3,64}$/).optional()),
  CHAT_BOT_TOKEN: z.preprocess(emptyIsUnset, z.string().regex(/^\d+:\S{16,}$/).optional()),
  CHAT_BOT_WEBHOOK_SECRET: z.preprocess(emptyIsUnset, z.string().min(32).optional()),
  /**
   * Uploaded zips of developer sites (`<site id>.zip`), read by webnhanh-builder. Unset in production: zip upload is
   * off (git deploys still work).
   */
  BUILD_INBOX_DIR: z.preprocess(emptyIsUnset, z.string().regex(/^\/[A-Za-z0-9._/-]+$/).optional()),
  /**
   * IdP subjects (`sub` from auth.hoandat.com) of the admins, comma-separated: they get the admin tools (reports,
   * takedowns, locks, reviews) and the notices of reports and held releases. Unset: no admin.
   */
  ADMIN_SUBS: z.preprocess(emptyIsUnset, z.string().optional()),
  /** Headless Chrome for share pictures, used by the worker inside the dev server only. */
  CHROME_PATH: z.preprocess(emptyIsUnset, z.string().min(1).optional()),
});

/** A fixed form secret for dev and tests only; production refuses to start without FORM_SECRET. */
export const DEV_FORM_SECRET = 'dev-only-form-secret-never-in-production';

export interface PushConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}

export interface ChatBotConfig {
  /** `https://chat.<domain>`: deep links are `<url>/b/<username>`, the Bot API `<url>/bot/v1`. */
  readonly url: string;
  readonly username: string;
  readonly token: string;
  readonly webhookSecret: string;
}

/** All of `values` set, or none: a half-configured channel is a mistake worth stopping for. */
function allOrNone(group: string, values: Readonly<Record<string, string | undefined>>): boolean {
  const set = Object.entries(values).filter(([, value]) => value !== undefined);
  if (set.length > 0 && set.length < Object.keys(values).length) {
    const missing = Object.keys(values).filter((key) => values[key] === undefined);
    throw new Error(`Invalid server env: ${group} needs ${missing.join(', ')} too`);
  }
  return set.length > 0;
}

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
  readonly formSecret: string;
  /** Web Push of new orders; null when the VAPID keys are not set. */
  readonly push: PushConfig | null;
  /** New orders in the Chat app; null when the bot is not set up. */
  readonly chatBot: ChatBotConfig | null;
  readonly chromePath: string | undefined;
  /** Where uploaded zips go; null: zip upload is off. */
  readonly buildInboxDir: string | null;
  /** Orders accepted per visitor IP (10 minutes) and per site (an hour). */
  readonly orderLimits: { readonly perIp: number; readonly perSite: number };
  /** IdP subjects of the admins. */
  readonly adminSubs: readonly string[];
  /** Abuse reports accepted per IP in an hour. */
  readonly reportsPerIp: number;
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
      !e.FORM_SECRET && 'FORM_SECRET',
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
  const push = allOrNone('Web Push', { VAPID_PUBLIC_KEY: e.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: e.VAPID_PRIVATE_KEY, VAPID_SUBJECT: e.VAPID_SUBJECT });
  const chat = allOrNone('the Chat bot', {
    CHAT_URL: e.CHAT_URL,
    CHAT_BOT_USERNAME: e.CHAT_BOT_USERNAME,
    CHAT_BOT_TOKEN: e.CHAT_BOT_TOKEN,
    CHAT_BOT_WEBHOOK_SECRET: e.CHAT_BOT_WEBHOOK_SECRET,
  });
  if (chat && e.CHAT_URL && new URL(e.CHAT_URL).protocol !== 'https:' && production) throw new Error('Invalid server env: CHAT_URL must be https in production');
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
    formSecret: e.FORM_SECRET ?? DEV_FORM_SECRET,
    push: push && e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT ? { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT } : null,
    chatBot:
      chat && e.CHAT_URL && e.CHAT_BOT_USERNAME && e.CHAT_BOT_TOKEN && e.CHAT_BOT_WEBHOOK_SECRET
        ? { url: new URL(e.CHAT_URL).origin, username: e.CHAT_BOT_USERNAME, token: e.CHAT_BOT_TOKEN, webhookSecret: e.CHAT_BOT_WEBHOOK_SECRET }
        : null,
    chromePath: e.CHROME_PATH,
    buildInboxDir: e.BUILD_INBOX_DIR ?? (production ? null : path.join(DEV_BUILDS_DIR, 'inbox')),
    orderLimits: { perIp: 10, perSite: 60 },
    adminSubs: parseAdminSubs(e.ADMIN_SUBS),
    reportsPerIp: 5,
  };
}

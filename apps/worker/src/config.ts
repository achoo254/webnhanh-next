import { DEFAULT_SITE_MAX_MB } from '@webnhanh/db';
import { z } from 'zod';

const emptyIsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

const Env = z.object({
  DATABASE_URL: z.url(),
  /** Published sites, served by nginx (infra/nginx/hoandat.io.vn.conf); written only through @webnhanh/publish. */
  SITES_DIR: z.string().min(1),
  /** Uploaded photos, written by the server. */
  UPLOADS_DIR: z.string().min(1),
  /** The app's address, for the "made with" link at the foot of every page. */
  PUBLIC_URL: z.url(),
  /** Signs the order form of every page; the server checks it with the same value (32+ characters). */
  FORM_SECRET: z.string().min(32),
  /** Headless Chrome for the share picture of each page. Unset: pages go out without one (logged). */
  CHROME_PATH: z.preprocess(emptyIsUnset, z.string().min(1).optional()),
  /** ffmpeg, to make the share picture a JPEG. */
  FFMPEG_PATH: z.preprocess(emptyIsUnset, z.string().min(1).default('ffmpeg')),
  /** Finished developer builds staged by webnhanh-builder; unset: no builder on this server. */
  BUILD_OUTPUT_DIR: z.preprocess(emptyIsUnset, z.string().min(1).optional()),
  POLL_MS: z.coerce.number().int().min(200).max(60_000).default(1_000),
  SITE_MAX_MB: z.coerce.number().int().min(1).max(500).default(DEFAULT_SITE_MAX_MB),
});

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly sitesDir: string;
  readonly uploadsDir: string;
  readonly publicUrl: string;
  readonly formSecret: string;
  readonly chromePath: string | undefined;
  readonly ffmpegPath: string;
  readonly buildOutputDir: string | undefined;
  readonly pollMs: number;
  readonly siteMaxBytes: number;
}

/** Validates the worker's env once at start; throws naming the offending keys. */
export function loadWorkerConfig(env: Record<string, string | undefined> = process.env): WorkerConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid worker env: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    sitesDir: e.SITES_DIR,
    uploadsDir: e.UPLOADS_DIR,
    publicUrl: e.PUBLIC_URL.replace(/\/+$/, ''),
    formSecret: e.FORM_SECRET,
    chromePath: e.CHROME_PATH,
    ffmpegPath: e.FFMPEG_PATH,
    buildOutputDir: e.BUILD_OUTPUT_DIR,
    pollMs: e.POLL_MS,
    siteMaxBytes: e.SITE_MAX_MB * 1024 * 1024,
  };
}

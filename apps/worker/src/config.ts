import { DEFAULT_SITE_MAX_MB } from '@trang/db';
import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.url(),
  /** Published sites, served by nginx (infra/nginx/hoandat.io.vn.conf); written only through @trang/publish. */
  SITES_DIR: z.string().min(1),
  /** Uploaded photos, written by the server. */
  UPLOADS_DIR: z.string().min(1),
  /** The app's address, for the "made with" link at the foot of every page. */
  PUBLIC_URL: z.url(),
  POLL_MS: z.coerce.number().int().min(200).max(60_000).default(1_000),
  SITE_MAX_MB: z.coerce.number().int().min(1).max(500).default(DEFAULT_SITE_MAX_MB),
});

export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly sitesDir: string;
  readonly uploadsDir: string;
  readonly publicUrl: string;
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
    pollMs: e.POLL_MS,
    siteMaxBytes: e.SITE_MAX_MB * 1024 * 1024,
  };
}

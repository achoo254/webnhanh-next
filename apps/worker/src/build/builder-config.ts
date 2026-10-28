import { DEFAULT_SITE_MAX_MB } from '@webnhanh/db';
import { z } from 'zod';

const emptyIsUnset = (value: unknown): unknown => (value === '' ? undefined : value);
const dir = z.string().regex(/^\/[A-Za-z0-9._/-]+$/, 'an absolute path of plain characters');

const Env = z.object({
  DATABASE_URL: z.url(),
  /** Zips uploaded by the server (`<site id>.zip`). */
  BUILD_INBOX_DIR: dir,
  /** Finished outputs, `<job id>/`, read by webnhanh-worker (BUILD_OUTPUT_DIR of its env). */
  BUILD_OUTPUT_DIR: dir,
  /** Job directories while they build; the same file system as the caches (they move by rename). */
  BUILD_WORK_DIR: dir,
  BUILD_CACHE_DIR: dir,
  BUILD_IMAGE: z.preprocess(emptyIsUnset, z.string().default('webnhanh-build:node22')),
  BUILD_NETWORK: z.preprocess(emptyIsUnset, z.string().default('webnhanh-build')),
  DOCKER_PATH: z.preprocess(emptyIsUnset, z.string().min(1).default('docker')),
  GIT_PATH: z.preprocess(emptyIsUnset, z.string().min(1).default('git')),
  /** A build starts only with this much memory available and disk free, else it waits in the queue. */
  BUILD_MIN_FREE_MB: z.coerce.number().int().min(0).default(1536),
  BUILD_MIN_DISK_MB: z.coerce.number().int().min(0).default(5120),
  POLL_MS: z.coerce.number().int().min(200).max(60_000).default(2_000),
  SITE_MAX_MB: z.coerce.number().int().min(1).max(500).default(DEFAULT_SITE_MAX_MB),
});

export interface BuilderConfig {
  readonly databaseUrl: string;
  readonly dirs: { readonly inbox: string; readonly out: string; readonly work: string; readonly cache: string };
  readonly docker: { readonly docker: string; readonly image: string; readonly network: string };
  readonly gitPath: string;
  readonly minFreeMemory: number;
  readonly minFreeDisk: number;
  readonly pollMs: number;
  readonly siteMaxBytes: number;
}

/** Validates the builder's env once at start; throws naming the offending keys. */
export function loadBuilderConfig(env: Record<string, string | undefined> = process.env): BuilderConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid builder env: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    dirs: { inbox: e.BUILD_INBOX_DIR, out: e.BUILD_OUTPUT_DIR, work: e.BUILD_WORK_DIR, cache: e.BUILD_CACHE_DIR },
    docker: { docker: e.DOCKER_PATH, image: e.BUILD_IMAGE, network: e.BUILD_NETWORK },
    gitPath: e.GIT_PATH,
    minFreeMemory: e.BUILD_MIN_FREE_MB * 1024 * 1024,
    minFreeDisk: e.BUILD_MIN_DISK_MB * 1024 * 1024,
    pollMs: e.POLL_MS,
    siteMaxBytes: e.SITE_MAX_MB * 1024 * 1024,
  };
}

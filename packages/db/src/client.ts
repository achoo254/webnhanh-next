import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  readonly db: Db;
  close(): Promise<void>;
}

/**
 * packages/db/drizzle, found through the package's own name so the path stays right when this file is bundled
 * into the server or the worker.
 */
const MIGRATIONS = path.join(path.dirname(createRequire(import.meta.url).resolve('@webnhanh/db/package.json')), 'drizzle');

/** Real Postgres (production). Migrations run on open so the schema always matches the code. */
export async function openPostgres(connectionString: string, options: { migrate: boolean }): Promise<DbHandle> {
  const pool = new pg.Pool({ connectionString, max: 5 });
  const db = drizzleNodePg(pool, { schema });
  if (options.migrate) await migrateNodePg(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => pool.end() };
}

/** Embedded Postgres for dev (a directory, gitignored) and tests (in memory when `dir` is omitted). */
export async function openPglite(dir?: string): Promise<DbHandle> {
  // Loaded on demand: the production bundles run on Postgres and ship without PGlite.
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);
  if (dir) await mkdir(dir, { recursive: true });
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db, close: () => client.close() };
}

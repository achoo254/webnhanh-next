import { openPglite, openPostgres } from '@trang/db';
import { createApp } from './app';
import { DEV_PGLITE_DIR, loadConfig } from './config';

const config = loadConfig();
// Migrations of @trang/db run on open, so the schema always matches this release.
const database = config.databaseUrl ? await openPostgres(config.databaseUrl, { migrate: true }) : await openPglite(DEV_PGLITE_DIR);
console.log(config.databaseUrl ? 'database: Postgres (DATABASE_URL)' : `database: PGlite at ${DEV_PGLITE_DIR}`);

const app = createApp({ config, db: database.db });
// Loopback only: nginx (production) or the Vite dev server (dev) is in front.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`trang server on 127.0.0.1:${config.port} (${config.nodeEnv}); sign-in ${config.auth ? 'on' : 'off (no AUTH_CLIENT_SECRET)'}`);
});
server.on('error', (error) => {
  console.error(`server failed: ${error.message}`);
  process.exit(1);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`${signal}: stopping`);
  server.close();
  await database.close();
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown(signal));

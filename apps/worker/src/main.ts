// The publish worker (systemd webnhanh-worker): one job at a time from the Postgres queue.
import { openPostgres } from '@webnhanh/db';
import brandConfig from '../../../brand.config.json';
import { loadWorkerConfig } from './config';
import { startWorker } from './worker-loop';

const config = loadWorkerConfig();
// The server owns the schema (it migrates on start); the worker only reads and updates rows.
const database = await openPostgres(config.databaseUrl, { migrate: false });
const log = { info: (m: string) => console.log(m), warn: (m: string) => console.warn(m) };
const worker = startWorker({
  db: database.db,
  sitesDir: config.sitesDir,
  uploadsDir: config.uploadsDir,
  siteMaxBytes: config.siteMaxBytes,
  madeWith: { name: brandConfig.appName, url: config.publicUrl },
  appUrl: config.publicUrl,
  formSecret: config.formSecret,
  chromePath: config.chromePath,
  ffmpegPath: config.ffmpegPath,
  buildOutputDir: config.buildOutputDir,
  adminSubs: config.adminSubs,
  now: () => new Date(),
  pollMs: config.pollMs,
  log,
});
console.log(`webnhanh worker polling every ${config.pollMs} ms; sites in ${config.sitesDir}; share pictures ${config.chromePath ? `by ${config.chromePath}` : 'off (no CHROME_PATH)'}`);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  // A publish takes seconds: finish the job in hand, then exit (systemd waits TimeoutStopSec).
  console.log(`${signal}: finishing the current job`);
  await worker.stop();
  await database.close();
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown(signal));

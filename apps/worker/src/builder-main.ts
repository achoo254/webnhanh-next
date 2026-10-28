// The builder (systemd webnhanh-builder, user webnhanh-builder in group docker): builds developer sites one at a time
// in Docker and hands each output to webnhanh-worker for publishing. It talks to Postgres on loopback, the Docker
// socket, and git over HTTPS to github.com/gitlab.com; it never writes SITES_DIR and never sends notifications.
import { mkdir } from 'node:fs/promises';
import { openPostgres } from '@webnhanh/db';
import { loadBuilderConfig } from './build/builder-config';
import { startBuilder } from './build/builder-loop';
import { dockerReady } from './build/run-build';

const config = loadBuilderConfig();
for (const dir of [config.dirs.out, config.dirs.work, config.dirs.cache]) await mkdir(dir, { recursive: true });
const database = await openPostgres(config.databaseUrl, { migrate: false });
const log = { info: (m: string) => console.log(m), warn: (m: string) => console.warn(m) };
const docker = await dockerReady(config.docker);
if (docker !== 'ok') console.warn(`docker: ${docker} (image ${config.docker.image}, network ${config.docker.network}); Node builds will fail until it is fixed`);
const builder = await startBuilder({
  db: database.db,
  log,
  now: () => new Date(),
  docker: config.docker,
  gitPath: config.gitPath,
  dirs: config.dirs,
  siteMaxBytes: config.siteMaxBytes,
  pollMs: config.pollMs,
  minFreeMemory: config.minFreeMemory,
  minFreeDisk: config.minFreeDisk,
});
console.log(`webnhanh builder: image ${config.docker.image}, network ${config.docker.network}, needs ${config.minFreeMemory >> 20} MB free memory and ${config.minFreeDisk >> 20} MB free disk`);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  // A build can take minutes: it is killed and queued again rather than waited for.
  console.log(`${signal}: stopping the build in hand`);
  await builder.stop();
  await database.close();
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown(signal));

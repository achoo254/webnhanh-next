import { openPglite, openPostgres } from '@webnhanh/db';
import brandConfig from '../../../brand.config.json';
import { createApp } from './app';
import path from 'node:path';
import { DEV_BUILDS_DIR, DEV_PGLITE_DIR, DEV_SITES_DIR, loadConfig } from './config';
import { chatBotSender } from './notifications/chat-bot-api';
import { startDeliveryLoop } from './notifications/deliveries';
import { webPushSender } from './notifications/web-push-sender';
import { canWriteWebp } from './sites/image-processing';

const config = loadConfig();
// Migrations of @webnhanh/db run on open, so the schema always matches this release.
const database = config.databaseUrl ? await openPostgres(config.databaseUrl, { migrate: true }) : await openPglite(DEV_PGLITE_DIR);
console.log(config.databaseUrl ? 'database: Postgres (DATABASE_URL)' : `database: PGlite at ${DEV_PGLITE_DIR}`);

if (!(await canWriteWebp({ ffmpeg: config.ffmpegPath, ffprobe: config.ffprobePath }))) {
  console.warn(`${config.ffmpegPath} cannot write WebP (no libwebp): photo uploads will fail; set FFMPEG_PATH/FFPROBE_PATH`);
}

// Dev runs on PGlite, which only one process can open: the publish worker runs inside the dev server. Production
// has its own service (webnhanh-worker).
const devWorker = config.databaseUrl
  ? null
  : await import('@webnhanh/worker').then(({ startWorker }) =>
      startWorker({
        db: database.db,
        sitesDir: DEV_SITES_DIR,
        uploadsDir: config.uploadsDir,
        siteMaxBytes: config.siteMaxBytes,
        madeWith: { name: brandConfig.appName, url: config.publicUrl },
        appUrl: config.publicUrl,
        formSecret: config.formSecret,
        chromePath: config.chromePath,
        ffmpegPath: config.ffmpegPath,
        buildOutputDir: path.join(DEV_BUILDS_DIR, 'out'),
        now: () => new Date(),
        pollMs: 1_000,
        log: { info: (m: string) => console.log(`[worker] ${m}`), warn: (m: string) => console.warn(`[worker] ${m}`) },
      }),
    );
if (devWorker) console.log(`dev worker: publishing to ${DEV_SITES_DIR}`);

// Developer builds in dev: the builder in-process as well. Plain HTML needs nothing; Node builds need Docker with the
// image of infra/builder and the network of infra/builder/build-network.sh, else they fail with "docker-unavailable".
const devBuilder = config.databaseUrl
  ? null
  : await import('@webnhanh/worker/build').then(async ({ startBuilder }) => {
      const { mkdir } = await import('node:fs/promises');
      const dirs = { inbox: path.join(DEV_BUILDS_DIR, 'inbox'), out: path.join(DEV_BUILDS_DIR, 'out'), work: path.join(DEV_BUILDS_DIR, 'work'), cache: path.join(DEV_BUILDS_DIR, 'cache') };
      for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });
      return startBuilder({
        db: database.db,
        log: { info: (m: string) => console.log(`[builder] ${m}`), warn: (m: string) => console.warn(`[builder] ${m}`) },
        now: () => new Date(),
        docker: { docker: process.env.DOCKER_PATH ?? 'docker', image: 'webnhanh-build:node22', network: 'webnhanh-build' },
        gitPath: 'git',
        dirs,
        siteMaxBytes: config.siteMaxBytes,
        pollMs: 2_000,
        minFreeMemory: 0,
        minFreeDisk: 0,
      });
    });

// Order notifications (Web Push, Chat) go out from here: the worker is loopback-only, the server may call out.
const deliveries = startDeliveryLoop({
  db: database.db,
  senders: { push: config.push ? webPushSender(config.push) : null, chat: config.chatBot ? chatBotSender(config.chatBot) : null },
  appUrl: config.publicUrl,
  log: { warn: (m: string) => console.warn(`[notify] ${m}`) },
  pollMs: 30_000,
});
console.log(`order notifications: push ${config.push ? 'on' : 'off (no VAPID keys)'}, chat ${config.chatBot ? `on (@${config.chatBot.username})` : 'off (no bot)'}`);

const app = createApp({ config, db: database.db, onOrder: deliveries.wake });
// Loopback only: nginx (production) or the Vite dev server (dev) is in front.
const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`webnhanh server on 127.0.0.1:${config.port} (${config.nodeEnv}); sign-in ${config.auth ? 'on' : 'off (no AUTH_CLIENT_SECRET)'}`);
});
server.on('error', (error) => {
  console.error(`server failed: ${error.message}`);
  process.exit(1);
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`${signal}: stopping`);
  server.close();
  await deliveries.stop();
  await devWorker?.stop();
  await devBuilder?.stop();
  await database.close();
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown(signal));

import { openPglite, openPostgres } from '@webnhanh/db';
import brandConfig from '../../../brand.config.json';
import { createApp } from './app';
import { DEV_PGLITE_DIR, DEV_SITES_DIR, loadConfig } from './config';
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
        now: () => new Date(),
        pollMs: 1_000,
        log: { info: (m: string) => console.log(`[worker] ${m}`), warn: (m: string) => console.warn(`[worker] ${m}`) },
      }),
    );
if (devWorker) console.log(`dev worker: publishing to ${DEV_SITES_DIR}`);

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
  await database.close();
  process.exit(0);
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => void shutdown(signal));

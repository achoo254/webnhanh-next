import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  accounts,
  BUILD_MS_PER_DAY,
  buildMsToday,
  developerSites,
  enqueueBuild,
  jobLogs,
  jobs,
  notePush,
  notificationDeliveries,
  openPglite,
  pushSubscriptions,
  queueDuePushes,
  releases,
  sites,
  startOfBuildDay,
  type BuildSettings,
  type DbHandle,
} from '@webnhanh/db';
import { currentRelease } from '@webnhanh/publish';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { processNextJob, type WorkerDeps } from '../worker-loop';
import type { BuildTools } from './build-job';
import { inboxZip } from './build-job';
import { processNextBuild, pruneInbox, pruneStaged, type BuilderLoopDeps } from './builder-loop';
import type { ContainerSpec } from './run-build';
import { writeZip } from './test-zip';

let handle: DbHandle;
let dir: string;
let builder: BuilderLoopDeps;
let worker: WorkerDeps;
/** What the fake docker ran, and what it should do. */
let ran: ContainerSpec[];
let buildExit: number;
const quiet = { info: () => undefined, warn: () => undefined };

/** Docker replaced: the build step writes dist/index.html into the source, as a real build would. */
const fakeTools = (): BuildTools => ({
  clone: async (input) => {
    await mkdir(input.dest, { recursive: true });
    await writeFile(path.join(input.dest, 'package.json'), JSON.stringify({ dependencies: { vite: '8' }, scripts: { build: 'vite build' } }));
    await writeFile(path.join(input.dest, 'package-lock.json'), '{"lockfileVersion":3}');
    return { commit: 'a'.repeat(40) };
  },
  dockerReady: () => Promise.resolve('ok'),
  runStep: async (_config, spec, options) => {
    ran.push(spec);
    const src = path.join(spec.jobDir, 'src');
    if (spec.argv[0] === 'npm') {
      await mkdir(path.join(src, 'node_modules', 'vite'), { recursive: true });
      options.onLine('added 214 packages in 3s');
      return { exitCode: 0, timedOut: false, aborted: false };
    }
    if (buildExit !== 0) {
      options.onLine('> vite build');
      options.onLine("src/App.tsx(3,1): error TS2304: Cannot find name 'x'.");
      return { exitCode: buildExit, timedOut: false, aborted: false };
    }
    await mkdir(path.join(src, 'dist'), { recursive: true });
    await writeFile(path.join(src, 'dist', 'index.html'), '<title>Built</title>');
    options.onLine('✓ 38 modules transformed.');
    return { exitCode: 0, timedOut: false, aborted: false };
  },
});

beforeEach(async () => {
  handle = await openPglite();
  dir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-build-'));
  ran = [];
  buildExit = 0;
  const dirs = { inbox: path.join(dir, 'inbox'), out: path.join(dir, 'out'), work: path.join(dir, 'work'), cache: path.join(dir, 'cache') };
  for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });
  builder = {
    db: handle.db,
    log: quiet,
    now: () => new Date(),
    docker: { docker: 'docker', image: 'webnhanh-build:node22', network: 'webnhanh-build' },
    gitPath: 'git',
    dirs,
    siteMaxBytes: 1024 * 1024,
    tools: fakeTools(),
    flushMs: 50,
    pollMs: 1000,
    minFreeMemory: 0,
    minFreeDisk: 0,
  };
  worker = {
    db: handle.db,
    sitesDir: path.join(dir, 'sites'),
    uploadsDir: path.join(dir, 'uploads'),
    workDir: path.join(dir, 'pwork'),
    buildOutputDir: dirs.out,
    siteMaxBytes: 1024 * 1024,
    madeWith: { name: 'App', url: 'https://app.example.com' },
    appUrl: 'https://app.example.com',
    formSecret: 'f'.repeat(40),
    ffmpegPath: 'ffmpeg',
    now: () => new Date(),
    log: quiet,
  };
});

afterEach(async () => {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});

async function developerSite(name: string, source: 'git' | 'zip', settings: BuildSettings): Promise<{ siteId: string; accountId: string }> {
  const now = new Date();
  const [account] = await handle.db.insert(accounts).values({ sub: randomUUID(), createdAt: now }).returning();
  if (!account) throw new Error('no account');
  const [site] = await handle.db.insert(sites).values({ accountId: account.id, name, kind: 'developer', status: 'draft', createdAt: now, updatedAt: now }).returning();
  if (!site) throw new Error('no site');
  await handle.db.insert(developerSites).values({
    siteId: site.id,
    source,
    repoUrl: source === 'git' ? 'https://github.com/acme/shop' : null,
    branch: source === 'git' ? 'main' : null,
    settings,
    webhookSecret: 's'.repeat(40),
    createdAt: now,
    updatedAt: now,
  });
  return { siteId: site.id, accountId: account.id };
}

async function queue(site: { siteId: string; accountId: string }): Promise<string> {
  const queued = await enqueueBuild(handle.db, { ...site, trigger: 'manual' }, new Date());
  if (!queued.ok) throw new Error(queued.reason);
  return queued.job.id;
}

async function jobRow(id: string) {
  const [row] = await handle.db.select().from(jobs).where(eq(jobs.id, id));
  if (!row) throw new Error('no job');
  return row;
}

describe('a developer build from queue to live site', () => {
  it('publishes a plain HTML zip without Docker: the builder stages it, the worker makes it live', async () => {
    const site = await developerSite('trang-tinh', 'zip', { rootDir: '', buildCommand: null, outputDir: '' });
    await writeZip(inboxZip(builder.dirs, site.siteId), [
      { name: 'site/index.html', data: '<title>Tĩnh</title>' },
      { name: 'site/.git/config', data: 'secret' },
      { name: 'site/css/a.css', data: 'b{}' },
    ]);
    const jobId = await queue(site);

    expect(await processNextBuild(builder)).toBe('ready');
    const handed = await jobRow(jobId);
    expect(handed).toMatchObject({ status: 'queued', framework: 'static' });
    expect(handed.readyAt).not.toBeNull();
    expect(handed.steps.map((s) => [s.name, s.note ?? null])).toEqual([
      ['fetch', null],
      ['install', 'not-needed'],
      ['build', 'not-needed'],
      ['check', null],
      ['publish', null],
    ]);
    // The builder never touches the sites; another build lane turn finds nothing to do.
    expect(await readdir(worker.sitesDir).catch(() => [])).toEqual([]);
    expect(await processNextBuild(builder)).toBe('idle');

    expect(await processNextJob(worker)).toBe('done');
    const done = await jobRow(jobId);
    expect(done.status).toBe('done');
    expect(done.steps.every((s) => s.finishedAt !== undefined)).toBe(true);
    const live = path.join(worker.sitesDir, 'trang-tinh', 'current');
    expect(await readFile(path.join(live, 'index.html'), 'utf8')).toBe('<title>Tĩnh</title>');
    expect((await readdir(live)).sort()).toEqual(['css', 'index.html']);
    const [release] = await handle.db.select().from(releases).where(eq(releases.siteId, site.siteId));
    expect(release).toMatchObject({ source: 'zip', commitSha: null, fileCount: 2 });
    const [dev] = await handle.db.select().from(developerSites).where(eq(developerSites.siteId, site.siteId));
    expect(dev?.lastBuildKey).toBe(done.report?.buildKey);

    // The staged copy goes once the job is over; the work directory is already empty.
    expect(await pruneStaged(handle.db, builder.dirs.out)).toBe(1);
    expect(await readdir(builder.dirs.work)).toEqual([]);

    // The same zip and settings again: skipped, its time not counted.
    const used = await buildMsToday(handle.db, site.accountId, new Date());
    const again = await queue(site);
    expect(await processNextBuild(builder)).toBe('skipped');
    expect((await jobRow(again)).status).toBe('skipped');
    expect(await buildMsToday(handle.db, site.accountId, new Date())).toBe(used);
  });

  it('installs and builds a git repo in two steps, logs it, and reuses the libraries next time', async () => {
    const site = await developerSite('vite-app', 'git', { rootDir: '', buildCommand: 'npm run build', outputDir: 'dist' });
    const jobId = await queue(site);
    expect(await processNextBuild(builder)).toBe('ready');
    expect(ran.map((s) => [s.argv[0], s.network, s.workdir])).toEqual([
      ['npm', 'webnhanh-build', ''],
      ['sh', 'none', ''],
    ]);
    expect(ran[1]?.argv).toEqual(['sh', '-c', 'npm run build']);
    const job = await jobRow(jobId);
    expect(job.commitSha).toBe('a'.repeat(40));
    expect(job.framework).toBe('vite');
    const log = (await handle.db.select().from(jobLogs).where(eq(jobLogs.jobId, jobId)).orderBy(asc(jobLogs.seq))).map((l) => l.line);
    expect(log).toEqual(expect.arrayContaining(['added 214 packages in 3s', '✓ 38 modules transformed.']));
    expect(await processNextJob(worker)).toBe('done');
    expect(await currentRelease(worker.sitesDir, 'vite-app')).toBe((await jobRow(jobId)).releaseId);
    const [release] = await handle.db.select().from(releases).where(eq(releases.siteId, site.siteId));
    expect(release).toMatchObject({ source: 'git', commitSha: 'a'.repeat(40) });

    // New settings, same lockfile: the install step is skipped (libraries restored from the site's cache).
    await handle.db.update(developerSites).set({ settings: { rootDir: '', buildCommand: 'npm run build --if-present', outputDir: 'dist' } }).where(eq(developerSites.siteId, site.siteId));
    ran = [];
    const second = await queue(site);
    expect(await processNextBuild(builder)).toBe('ready');
    expect(ran.map((s) => s.argv[0])).toEqual(['sh']);
    expect((await jobRow(second)).steps.find((s) => s.name === 'install')?.note).toBe('cached');
  });

  it('explains a failed build with its log lines, keeps the live site, and tells the owner who asked', async () => {
    const site = await developerSite('hong', 'git', { rootDir: '', buildCommand: 'npm run build', outputDir: 'dist' });
    await handle.db.insert(pushSubscriptions).values({ id: randomUUID(), accountId: site.accountId, endpoint: 'https://fcm.googleapis.com/x', p256dh: 'p', auth: 'a', createdAt: new Date() });
    buildExit = 2;
    const jobId = await queue(site);
    await handle.db.update(jobs).set({ notify: true }).where(eq(jobs.id, jobId));
    expect(await processNextBuild(builder)).toBe('failed');
    const job = await jobRow(jobId);
    expect(job).toMatchObject({ status: 'failed', error: 'build-failed' });
    expect(job.errorLines).toContain("src/App.tsx(3,1): error TS2304: Cannot find name 'x'.");
    expect(await readdir(worker.sitesDir).catch(() => [])).toEqual([]);
    expect(await readdir(builder.dirs.out)).toEqual([]);
    const notices = await handle.db.select().from(notificationDeliveries).where(eq(notificationDeliveries.jobId, jobId));
    expect(notices.map((n) => n.channel)).toEqual(['push']);
    // Failed builds count against the day, for the time they ran.
    expect(job.startedAt && job.finishedAt).toBeTruthy();
    expect(await buildMsToday(handle.db, site.accountId, new Date())).toBe((job.finishedAt?.getTime() ?? 0) - (job.startedAt?.getTime() ?? 0));
  });

  it('fails a repo it cannot build statically before running anything', async () => {
    const site = await developerSite('next-ssr', 'git', { rootDir: '', buildCommand: 'npm run build', outputDir: 'out' });
    builder = {
      ...builder,
      tools: {
        ...fakeTools(),
        clone: async (input) => {
          await mkdir(input.dest, { recursive: true });
          await writeFile(path.join(input.dest, 'package.json'), JSON.stringify({ dependencies: { next: '15' }, scripts: { build: 'next build' } }));
          await writeFile(path.join(input.dest, 'package-lock.json'), '{}');
          return { commit: 'b'.repeat(40) };
        },
      },
    };
    const jobId = await queue(site);
    expect(await processNextBuild(builder)).toBe('failed');
    expect(await jobRow(jobId)).toMatchObject({ error: 'unsupported', errorLines: ['next-needs-export'] });
    expect(ran).toEqual([]);
  });

  it('waits when the server has no room, and builds once it has', async () => {
    const site = await developerSite('cho', 'zip', { rootDir: '', buildCommand: null, outputDir: '' });
    await writeZip(inboxZip(builder.dirs, site.siteId), [{ name: 'index.html', data: 'x' }]);
    const jobId = await queue(site);
    let memory = 1024;
    const tight = { ...builder, minFreeMemory: 1536, minFreeDisk: 1, room: () => Promise.resolve({ memory, disk: 10 }) };
    expect(await processNextBuild(tight)).toBe('waiting-for-room');
    expect((await jobRow(jobId)).status).toBe('queued');
    memory = 4096;
    expect(await processNextBuild(tight)).toBe('ready');
  });
});

describe('build limits and pushes', () => {
  /** A build of `site` that ran from `start` to `end` (ms before `now`), without its wait in the queue. */
  async function ranBuild(site: { siteId: string; accountId: string }, now: Date, minutes: { queued: number; start: number; end?: number; ready?: number }, extra: Partial<typeof jobs.$inferInsert> = {}): Promise<string> {
    const at = (m: number): Date => new Date(now.getTime() - m * 60_000);
    const id = randomUUID();
    await handle.db.insert(jobs).values({
      id,
      ...site,
      type: 'build',
      status: minutes.end === undefined ? 'running' : 'failed',
      createdAt: at(minutes.queued),
      startedAt: at(minutes.start),
      finishedAt: minutes.end === undefined ? null : at(minutes.end),
      readyAt: minutes.ready === undefined ? null : at(minutes.ready),
      ...extra,
    });
    return id;
  }

  it('counts the real run time of builds today, the wait in the queue and skipped builds left out', async () => {
    const site = await developerSite('dem-phut', 'zip', { rootDir: '', buildCommand: null, outputDir: '' });
    const now = new Date('2026-10-28T05:00:00Z');
    // Waited 30 minutes, ran 4.
    await ranBuild(site, now, { queued: 60, start: 30, end: 26 });
    // Handed to the worker after 2 minutes; its publish wait and step are not build time.
    await ranBuild(site, now, { queued: 25, start: 25, ready: 23, end: 10 }, { status: 'done' });
    // Skipped (nothing changed) and a rename's rebuild: not counted.
    await ranBuild(site, now, { queued: 9, start: 9, end: 8 }, { status: 'skipped', error: 'no-change' });
    await ranBuild(site, now, { queued: 8, start: 8, end: 7 }, { trigger: 'rename' });
    // Yesterday (Vietnam time): not counted.
    await ranBuild(site, now, { queued: 13 * 60, start: 13 * 60, end: 12 * 60 });
    expect(await buildMsToday(handle.db, site.accountId, now)).toBe(6 * 60_000);
    // A running build counts its time so far.
    await ranBuild(site, now, { queued: 5, start: 3 });
    expect(await buildMsToday(handle.db, site.accountId, now)).toBe(9 * 60_000);
  });

  it('starts builds while build time is left today, one job at a time per account', async () => {
    const site = await developerSite('han-muc', 'zip', { rootDir: '', buildCommand: null, outputDir: '' });
    const now = new Date();
    const first = await enqueueBuild(handle.db, { ...site, trigger: 'manual' }, now);
    expect(first.ok).toBe(true);
    expect(await enqueueBuild(handle.db, { ...site, trigger: 'manual' }, now)).toEqual({ ok: false, reason: 'job-active' });
    await handle.db.delete(jobs).where(eq(jobs.siteId, site.siteId));
    // 59 minutes used: one more may start (and may run past the hour).
    await ranBuild(site, now, { queued: 59, start: 59, end: 0 });
    const last = await enqueueBuild(handle.db, { ...site, trigger: 'manual' }, now);
    expect(last.ok).toBe(true);
    await handle.db.update(jobs).set({ status: 'failed', startedAt: new Date(now.getTime() - 60_000), finishedAt: now }).where(eq(jobs.id, last.ok ? last.job.id : ''));
    expect(await buildMsToday(handle.db, site.accountId, now)).toBe(BUILD_MS_PER_DAY);
    expect(await enqueueBuild(handle.db, { ...site, trigger: 'manual' }, now)).toEqual({ ok: false, reason: 'daily-limit' });
    // A rename's rebuild is not refused by the day's build time.
    expect((await enqueueBuild(handle.db, { ...site, trigger: 'rename' }, now)).ok).toBe(true);
  });

  it('removes uploaded zips of sites that no longer exist, once they are an hour old', async () => {
    const live = randomUUID();
    const gone = randomUUID();
    const fresh = randomUUID();
    const inbox = builder.dirs.inbox;
    for (const id of [live, gone, fresh]) await writeFile(path.join(inbox, `${id}.zip`), 'zip');
    await writeFile(path.join(inbox, 'notes.txt'), 'x');
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const id of [live, gone]) await utimes(path.join(inbox, `${id}.zip`), old, old);
    expect(await pruneInbox(inbox, new Set([live]), new Date())).toBe(1);
    expect((await readdir(inbox)).sort()).toEqual([`${fresh}.zip`, `${live}.zip`, 'notes.txt'].sort());
  });

  it('caps the whole queue', async () => {
    for (let i = 0; i < 20; i += 1) await queue(await developerSite(`q-${i}`, 'zip', { rootDir: '', buildCommand: null, outputDir: '' }));
    const late = await developerSite('q-late', 'zip', { rootDir: '', buildCommand: null, outputDir: '' });
    expect(await enqueueBuild(handle.db, { ...late, trigger: 'manual' }, new Date())).toEqual({ ok: false, reason: 'queue-full' });
  });

  it('counts the day in Vietnam', () => {
    expect(startOfBuildDay(new Date('2026-10-28T16:59:00Z')).toISOString()).toBe('2026-10-27T17:00:00.000Z');
    expect(startOfBuildDay(new Date('2026-10-28T17:00:00Z')).toISOString()).toBe('2026-10-28T17:00:00.000Z');
  });

  it('gathers pushes 30 seconds apart into one build of the newest commit', async () => {
    const site = await developerSite('day', 'git', { rootDir: '', buildCommand: null, outputDir: '' });
    const t0 = new Date('2026-10-28T03:00:00Z');
    expect(await notePush(handle.db, site.siteId, '1'.repeat(40), t0)).toBe('waiting');
    expect(await notePush(handle.db, site.siteId, '2'.repeat(40), new Date(t0.getTime() + 20_000))).toBe('waiting');
    expect(await queueDuePushes(handle.db, new Date(t0.getTime() + 40_000))).toEqual({ queued: 0, skipped: 0 });
    expect(await queueDuePushes(handle.db, new Date(t0.getTime() + 51_000))).toEqual({ queued: 1, skipped: 0 });
    const queued = await handle.db.select().from(jobs).where(eq(jobs.siteId, site.siteId));
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ trigger: 'push', commitSha: '2'.repeat(40), status: 'queued' });
    // A push while that build still waits only moves it to the newer commit.
    expect(await notePush(handle.db, site.siteId, '3'.repeat(40), new Date(t0.getTime() + 60_000))).toBe('queued-build');
    expect((await handle.db.select().from(jobs).where(eq(jobs.siteId, site.siteId)))[0]?.commitSha).toBe('3'.repeat(40));
  });

  it('keeps a push waiting while the account has a build running, and records one over the limit as skipped', async () => {
    const site = await developerSite('dang-chay', 'git', { rootDir: '', buildCommand: null, outputDir: '' });
    const running = await queue(site);
    await handle.db.update(jobs).set({ status: 'running' }).where(eq(jobs.id, running));
    const t0 = new Date();
    await notePush(handle.db, site.siteId, '4'.repeat(40), t0);
    expect(await queueDuePushes(handle.db, new Date(t0.getTime() + 31_000))).toEqual({ queued: 0, skipped: 0 });
    await handle.db.update(jobs).set({ status: 'failed' }).where(eq(jobs.id, running));
    // The day's build time used up by builds that ran.
    await handle.db.insert(jobs).values({ id: randomUUID(), ...site, type: 'build', status: 'failed', createdAt: t0, startedAt: new Date(t0.getTime() - BUILD_MS_PER_DAY), finishedAt: t0 });
    expect(await queueDuePushes(handle.db, new Date(t0.getTime() + 32_000))).toEqual({ queued: 0, skipped: 1 });
    const skipped = await handle.db.select().from(jobs).where(eq(jobs.status, 'skipped'));
    expect(skipped[0]).toMatchObject({ error: 'daily-limit', trigger: 'push' });
  });
});

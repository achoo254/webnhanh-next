/**
 * The developer side of the signed-in owner's API: check a repo before anything is queued, create a site from a repo
 * or a zip, upload the zip (checked in place), confirm the build settings, start a build, follow it (state and log
 * over SSE), download its log, ask to be told when it ends, and read the history. Every route that touches a site
 * reaches it through `ownedSite`; a build is only ever read with the account in the query.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import {
  BUILDS_PER_DAY,
  buildEstimate,
  buildHistory,
  buildsToday,
  DEVELOPER_SITES_PER_ACCOUNT,
  developerSites,
  enqueueBuild,
  isUuid,
  jobLogSince,
  jobs,
  queuePosition,
  runningBuild,
  sites,
  type Db,
  type Job,
} from '@webnhanh/db';
import { buildSettingsSchema, checkBranch, checkRelativeDir, inboxZip, parseRepoUrl, SourceError, ZIP_MAX_BYTES, zipSource, detectProject } from '@webnhanh/worker/build';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import express, { type RequestHandler, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { accountOf, requireAccount } from '../auth/auth-routes';
import type { ServerConfig } from '../config';
import { HttpError } from '../http-error';
import { ownedSite, type Site } from '../sites/site-access';
import { createDeveloperSite, validName } from '../sites/site-store';
import { siteView } from '../sites/site-views';
import { buildView, developerView, type BuildView, type EstimateView, type QueueView } from './build-views';
import { checkRepo, type Fetcher } from './repo-check';

function body(req: express.Request): Record<string, unknown> {
  return typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body) ? (req.body as Record<string, unknown>) : {};
}

const ACTIVE = ['queued', 'running'] as const;

/** The developer row of an owned site; 404 for a template site. */
async function developerOf(db: Db, site: Site) {
  const [dev] = await db.select().from(developerSites).where(eq(developerSites.siteId, site.id));
  if (site.kind !== 'developer' || !dev) throw new HttpError(404, 'site-not-found');
  return dev;
}

/** A build of the signed-in account, by id. */
async function ownedBuild(db: Db, accountId: string, jobId: unknown): Promise<Job> {
  if (!isUuid(jobId)) throw new HttpError(404, 'not-found');
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.accountId, accountId), eq(jobs.type, 'build')));
  if (!job) throw new HttpError(404, 'not-found');
  return job;
}

/** Roughly when a waiting build starts: what is left of the running one, then each build ahead at its own estimate. */
async function queueOf(db: Db, job: Job, now: Date): Promise<QueueView | null> {
  if (job.status !== 'queued' || job.readyAt !== null) return null;
  const position = await queuePosition(db, job);
  let wait = 0;
  const running = await runningBuild(db);
  if (running?.startedAt) {
    const estimate = await buildEstimate(db, running.siteId, running.framework);
    wait += Math.max(0, estimate.ms - (now.getTime() - running.startedAt.getTime()));
  }
  if (position > 0) {
    const ahead = await db
      .select({ siteId: jobs.siteId, framework: jobs.framework })
      .from(jobs)
      .where(and(eq(jobs.type, 'build'), eq(jobs.status, 'queued'), isNull(jobs.readyAt), lt(jobs.createdAt, job.createdAt)))
      .limit(position);
    for (const other of ahead) wait += (await buildEstimate(db, other.siteId, other.framework)).ms;
  }
  return { position, startsAt: new Date(now.getTime() + wait).toISOString() };
}

/** How long the build before this one of the same site took, for "x s faster than last time". */
async function previousDuration(db: Db, job: Job): Promise<number | null> {
  const [previous] = await db
    .select({ startedAt: jobs.startedAt, finishedAt: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.siteId, job.siteId), eq(jobs.type, 'build'), eq(jobs.status, 'done'), lt(jobs.createdAt, job.createdAt)))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return previous?.startedAt && previous.finishedAt ? previous.finishedAt.getTime() - previous.startedAt.getTime() : null;
}

export interface BuildDetail {
  readonly build: BuildView;
  readonly siteName: string;
  readonly estimate: EstimateView;
  readonly queue: QueueView | null;
  readonly previousMs: number | null;
}

async function buildDetail(db: Db, job: Job): Promise<BuildDetail> {
  const [site] = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, job.siteId));
  const now = new Date();
  return {
    build: buildView(job),
    siteName: site?.name ?? '',
    estimate: await buildEstimate(db, job.siteId, job.framework),
    queue: await queueOf(db, job, now),
    previousMs: job.status === 'done' ? await previousDuration(db, job) : null,
  };
}

const ENQUEUE_ERRORS = { 'job-active': 409, 'daily-limit': 429, 'queue-full': 503 } as const;

/** Writes the request body to `file` (through a temporary name), refusing more than `max` bytes. */
async function receiveFile(req: express.Request, file: string, max: number): Promise<number> {
  const declared = Number(req.headers['content-length'] ?? 'NaN');
  if (Number.isFinite(declared) && declared > max) throw new HttpError(413, 'zip-too-large');
  const temp = path.join(path.dirname(file), `.${randomUUID()}.part`);
  let size = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > max) callback(new HttpError(413, 'zip-too-large'));
      else callback(null, chunk);
    },
  });
  try {
    await pipeline(req, limit, createWriteStream(temp, { flags: 'wx', mode: 0o640 }));
    if (size === 0) throw new HttpError(400, 'zip-invalid');
    await rename(temp, file);
    return size;
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export function developerRoutes(config: ServerConfig, db: Db, fetcher: Fetcher): Router {
  const router = express.Router();
  const signedIn = requireAccount(config, db);
  const json = express.json({ limit: '16kb' });
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  const perAccount = (limit: number): RequestHandler =>
    rateLimit({
      windowMs: 10 * 60_000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      keyGenerator: (_req, res) => accountOf(res.locals).id,
      handler: (_req, _res, next) => next(new HttpError(429, 'too-many-requests')),
    });
  const checkLimit = perAccount(30);
  const uploadLimit = perAccount(10);
  const inbox = config.buildInboxDir;
  /** The uploaded zip of a site, where webnhanh-builder reads it. */
  const zipFileOf = (siteId: string): string | null => (inbox ? inboxZip({ inbox, out: inbox, work: inbox, cache: inbox }, siteId) : null);
  const hasZip = async (siteId: string): Promise<boolean> => {
    const file = zipFileOf(siteId);
    return file !== null && (await stat(file).catch(() => null)) !== null;
  };

  router.post('/api/developer/check', signedIn, checkLimit, noStore, json, async (req, res) => {
    const { repoUrl, branch, rootDir } = body(req);
    const repo = parseRepoUrl(repoUrl);
    if (!repo) throw new HttpError(400, 'repo-url');
    const wantedBranch = branch === undefined || branch === null || branch === '' ? null : checkBranch(branch);
    if (wantedBranch === null && branch !== undefined && branch !== null && branch !== '') throw new HttpError(400, 'branch');
    const dir = checkRelativeDir(rootDir ?? '');
    if (dir === null) throw new HttpError(400, 'root-dir');
    const result = await checkRepo(fetcher, repo, wantedBranch, dir);
    res.json({
      repo: { url: repo.url, branch: result.branch, commit: result.commit },
      detection: result.detection,
      settings: { rootDir: dir, buildCommand: result.detection.buildCommand, outputDir: result.detection.outputDir },
    });
  });

  router.post('/api/developer/sites', signedIn, noStore, json, async (req, res) => {
    const account = accountOf(res.locals);
    const input = body(req);
    const name = validName(input.name);
    const now = new Date();
    if (input.source === 'git') {
      const repo = parseRepoUrl(input.repoUrl);
      if (!repo) throw new HttpError(400, 'repo-url');
      const branch = checkBranch(input.branch);
      if (!branch) throw new HttpError(400, 'branch');
      const settings = buildSettingsSchema.safeParse(input.settings);
      if (!settings.success) throw new HttpError(400, 'build-settings', { fields: settings.error.issues.map((issue) => issue.message) });
      const site = await createDeveloperSite(db, { accountId: account.id, name, source: 'git', repoUrl: repo.url, branch, settings: settings.data, detection: input.detection ?? null }, now);
      res.status(201).json({ site: siteView(site, undefined, undefined) });
      return;
    }
    if (input.source === 'zip') {
      if (!config.buildInboxDir) throw new HttpError(503, 'zip-off');
      const site = await createDeveloperSite(db, { accountId: account.id, name, source: 'zip', repoUrl: null, branch: null, settings: { rootDir: '', buildCommand: null, outputDir: '' }, detection: null }, now);
      res.status(201).json({ site: siteView(site, undefined, undefined) });
      return;
    }
    throw new HttpError(400, 'source');
  });

  router.put('/api/sites/:siteId/zip', signedIn, uploadLimit, noStore, async (req, res) => {
    const account = accountOf(res.locals);
    const site = await ownedSite(db, account.id, req.params.siteId);
    const dev = await developerOf(db, site);
    if (dev.source !== 'zip') throw new HttpError(400, 'source');
    const file = zipFileOf(site.id);
    if (!inbox || !file) throw new HttpError(503, 'zip-off');
    // The builder may be reading the current zip: it is replaced only between builds.
    const [active] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.siteId, site.id), eq(jobs.type, 'build'), inArray(jobs.status, [...ACTIVE])));
    if (active) throw new HttpError(409, 'job-active');
    await mkdir(inbox, { recursive: true });
    const staged = `${file}.check`;
    await receiveFile(req, staged, ZIP_MAX_BYTES);
    let detection;
    try {
      const source = await zipSource(staged);
      try {
        detection = await detectProject(source, dev.settings.rootDir);
      } finally {
        source.close();
      }
    } catch (error) {
      await rm(staged, { force: true });
      if (error instanceof SourceError) throw new HttpError(400, error.code, { lines: error.lines.slice(0, 5) });
      throw error;
    }
    await rename(staged, file);
    const now = new Date();
    // Before the first build the settings follow what the zip looks like; afterwards they are the owner's.
    const built = site.currentReleaseId !== null;
    const settings = built ? dev.settings : { rootDir: dev.settings.rootDir, buildCommand: detection.buildCommand, outputDir: detection.outputDir };
    const [updated] = await db.update(developerSites).set({ detection, settings, updatedAt: now }).where(eq(developerSites.siteId, site.id)).returning();
    if (!updated) throw new Error('developer site update returned no row');
    res.json({ developer: developerView(updated, config.publicUrl, true) });
  });

  router.put('/api/sites/:siteId/build-settings', signedIn, noStore, json, async (req, res) => {
    const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
    const dev = await developerOf(db, site);
    const input = body(req);
    const settings = buildSettingsSchema.safeParse(input.settings);
    if (!settings.success) throw new HttpError(400, 'build-settings', { fields: settings.error.issues.map((issue) => issue.message) });
    let branch = dev.branch;
    if (dev.source === 'git' && input.branch !== undefined) {
      branch = checkBranch(input.branch);
      if (!branch) throw new HttpError(400, 'branch');
    }
    const [updated] = await db
      .update(developerSites)
      .set({ settings: settings.data, branch, updatedAt: new Date() })
      .where(eq(developerSites.siteId, site.id))
      .returning();
    if (!updated) throw new Error('developer site update returned no row');
    res.json({ developer: developerView(updated, config.publicUrl, await hasZip(site.id)) });
  });

  router.post('/api/sites/:siteId/builds', signedIn, noStore, async (req, res) => {
    const account = accountOf(res.locals);
    const site = await ownedSite(db, account.id, req.params.siteId);
    const dev = await developerOf(db, site);
    if (dev.source === 'zip' && !(await hasZip(site.id))) throw new HttpError(409, 'zip-missing');
    const queued = await enqueueBuild(db, { siteId: site.id, accountId: account.id, trigger: 'manual' }, new Date());
    if (!queued.ok) throw new HttpError(ENQUEUE_ERRORS[queued.reason], queued.reason, queued.reason === 'daily-limit' ? { limit: BUILDS_PER_DAY } : {});
    res.status(202).json(await buildDetail(db, queued.job));
  });

  router.get('/api/sites/:siteId/builds', signedIn, noStore, async (req, res) => {
    const account = accountOf(res.locals);
    const site = await ownedSite(db, account.id, req.params.siteId);
    const dev = await developerOf(db, site);
    const history = await buildHistory(db, site.id);
    const now = new Date();
    res.json({
      site: siteView(site, undefined, history[0]),
      developer: developerView(dev, config.publicUrl, await hasZip(site.id)),
      builds: history.map(buildView),
      estimate: await buildEstimate(db, site.id, history.find((job) => job.framework)?.framework ?? null),
      limits: { buildsPerDay: BUILDS_PER_DAY, usedToday: await buildsToday(db, account.id, now), developerSites: DEVELOPER_SITES_PER_ACCOUNT },
    });
  });

  router.get('/api/builds/:jobId', signedIn, noStore, async (req, res) => {
    const job = await ownedBuild(db, accountOf(res.locals).id, req.params.jobId);
    res.json(await buildDetail(db, job));
  });

  router.post('/api/builds/:jobId/notify', signedIn, noStore, async (req, res) => {
    const job = await ownedBuild(db, accountOf(res.locals).id, req.params.jobId);
    if (!ACTIVE.includes(job.status as (typeof ACTIVE)[number])) throw new HttpError(409, 'build-over');
    await db.update(jobs).set({ notify: true }).where(eq(jobs.id, job.id));
    res.json({ notify: true });
  });

  router.get('/api/builds/:jobId/log', signedIn, async (req, res) => {
    const job = await ownedBuild(db, accountOf(res.locals).id, req.params.jobId);
    const [site] = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, job.siteId));
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="build-${site?.name ?? 'site'}-${job.id.slice(0, 8)}.log"`,
      'Cache-Control': 'no-store',
    });
    let after = 0;
    for (;;) {
      const lines = await jobLogSince(db, job.id, after, 1000);
      if (lines.length === 0) break;
      res.write(`${lines.map((l) => l.line).join('\n')}\n`);
      after = lines[lines.length - 1]?.seq ?? after;
    }
    res.end();
  });

  /**
   * Server-sent events of one build: `state` (the build, its queue position and estimate) whenever it changes, and
   * `log` (new lines, each event id the last line's number, so a reconnect resumes with Last-Event-ID). Ends after the
   * build is over.
   */
  router.get('/api/builds/:jobId/events', signedIn, async (req, res) => {
    const accountId = accountOf(res.locals).id;
    let job = await ownedBuild(db, accountId, req.params.jobId);
    const resume = Number(req.headers['last-event-id']);
    let after = Number.isInteger(resume) && resume > 0 ? resume : 0;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      // nginx: pass each event on at once.
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    let closed = false;
    req.on('close', () => {
      closed = true;
    });
    let lastState = '';
    let lastPing = Date.now();
    const pollMs = config.nodeEnv === 'test' ? 20 : 1_000;
    try {
    while (!closed) {
      const detail = await buildDetail(db, job);
      const state = JSON.stringify(detail);
      if (state !== lastState) {
        res.write(`event: state\ndata: ${state}\n\n`);
        lastState = state;
      }
      for (;;) {
        const lines = await jobLogSince(db, job.id, after, 200);
        if (lines.length === 0) break;
        after = lines[lines.length - 1]?.seq ?? after;
        res.write(`id: ${after}\nevent: log\ndata: ${JSON.stringify({ lines: lines.map((l) => l.line), seq: after })}\n\n`);
      }
      if (job.status === 'done' || job.status === 'failed' || job.status === 'skipped') {
        res.write('event: end\ndata: {}\n\n');
        break;
      }
      if (Date.now() - lastPing > 15_000) {
        res.write(': ping\n\n');
        lastPing = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      const [next] = await db.select().from(jobs).where(and(eq(jobs.id, job.id), eq(jobs.accountId, accountId)));
      if (!next) break;
      job = next;
    }
    } catch (error) {
      console.warn('build events failed', error instanceof Error ? error.message : String(error));
    }
    res.end();
  });

  return router;
}

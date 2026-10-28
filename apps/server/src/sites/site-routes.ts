/**
 * The site API of the signed-in owner: list, create, read and save the draft, rename, upload photos (and read them
 * back for the editor), publish, and follow a publish job. Every route reaches a site through `ownedSite`.
 */
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  deleteSiteImages,
  enqueueJob,
  imageFileName,
  isUuid,
  jobs,
  latestJobsOf,
  parseImageFileName,
  siteImageFile,
  siteImages,
  sites,
  siteUploadsDir,
  type Db,
} from '@trang/db';
import { draftImageIds, shopDraftSchema, shopImageIds, shopPublishIssues } from '@trang/templates';
import { and, asc, desc, eq, inArray, sum } from 'drizzle-orm';
import express, { type RequestHandler, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { accountOf, requireAccount } from '../auth/auth-routes';
import type { ServerConfig } from '../config';
import { HttpError } from '../http-error';
import { ImageError, MAX_UPLOAD_BYTES, storeImage, type ImageTools } from './image-processing';
import { ownedSite } from './site-access';
import { createTemplateSite, renameSite, validName } from './site-store';
import { imageView, jobView, siteView } from './site-views';

/**
 * A saved draft may drop a photo that an upload in flight is about to be used for: only photos older than this,
 * and unused by the new draft, are deleted at save. The worker removes the rest a day later.
 */
export const UNUSED_IMAGE_GRACE_MS = 15 * 60 * 1000;

function body(req: express.Request): Record<string, unknown> {
  return typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body) ? (req.body as Record<string, unknown>) : {};
}

/** Bytes of all photos stored for a site. */
async function storedBytes(db: Db, siteId: string): Promise<number> {
  const [row] = await db.select({ total: sum(siteImages.bytes) }).from(siteImages).where(eq(siteImages.siteId, siteId));
  return Number(row?.total ?? 0);
}

export function siteRoutes(config: ServerConfig, db: Db): Router {
  const router = express.Router();
  const signedIn = requireAccount(config, db);
  const json = express.json({ limit: '64kb' });
  const tools: ImageTools = { ffmpeg: config.ffmpegPath, ffprobe: config.ffprobePath };
  const tmpDir = path.join(os.tmpdir(), 'trang-uploads');
  const noStore: RequestHandler = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  };
  const uploadLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (_req, res) => accountOf(res.locals).id,
    handler: (_req, _res, next) => next(new HttpError(429, 'too-many-requests')),
  });

  router.get('/api/sites', signedIn, noStore, async (_req, res) => {
    const account = accountOf(res.locals);
    const mine = await db.select().from(sites).where(eq(sites.accountId, account.id)).orderBy(desc(sites.updatedAt));
    const ids = mine.map((site) => site.id);
    const [latest, images] = await Promise.all([
      latestJobsOf(db, ids),
      ids.length > 0 ? db.select().from(siteImages).where(inArray(siteImages.siteId, ids)) : Promise.resolve([]),
    ]);
    const byId = new Map(images.map((image) => [image.id, image]));
    res.json({
      sites: mine.map((site) => {
        const draft = shopDraftSchema.safeParse(site.draft);
        const coverId = draft.success ? draft.data.cover : null;
        return siteView(site, coverId ? byId.get(coverId) : undefined, latest.get(site.id));
      }),
      limits: { sites: config.sitesPerAccount, siteBytes: config.siteMaxBytes },
    });
  });

  router.post('/api/sites', signedIn, noStore, json, async (req, res) => {
    const account = accountOf(res.locals);
    const { name, template } = body(req);
    const site = await createTemplateSite(
      db,
      { accountId: account.id, name: validName(name), template: typeof template === 'string' ? template : '', uploadsDir: config.uploadsDir, sitesPerAccount: config.sitesPerAccount },
      new Date(),
    );
    res.status(201).json({ site: siteView(site, undefined, undefined) });
  });

  router.get('/api/sites/:siteId', signedIn, noStore, async (req, res) => {
    const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
    const [images, latest] = await Promise.all([
      db.select().from(siteImages).where(eq(siteImages.siteId, site.id)).orderBy(asc(siteImages.createdAt)),
      latestJobsOf(db, [site.id]),
    ]);
    const draft = shopDraftSchema.safeParse(site.draft);
    const cover = draft.success && draft.data.cover ? images.find((image) => image.id === draft.data.cover) : undefined;
    res.json({
      site: siteView(site, cover, latest.get(site.id)),
      draft: draft.success ? draft.data : null,
      images: images.map(imageView),
      usedBytes: images.reduce((total, image) => total + image.bytes, 0),
    });
  });

  router.put('/api/sites/:siteId/draft', signedIn, noStore, json, async (req, res) => {
    const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
    const parsed = shopDraftSchema.safeParse(body(req).draft);
    if (!parsed.success) throw new HttpError(400, 'invalid-draft');
    const draft = parsed.data;
    const images = await db.select().from(siteImages).where(eq(siteImages.siteId, site.id));
    const known = new Set(images.map((image) => image.id));
    if (shopImageIds(draft).some((id) => !known.has(id))) throw new HttpError(400, 'unknown-image');
    const now = new Date();
    await db.update(sites).set({ draft, updatedAt: now }).where(eq(sites.id, site.id));

    const used = draftImageIds(site.template, draft) ?? known;
    const cutoff = now.getTime() - UNUSED_IMAGE_GRACE_MS;
    await deleteSiteImages(
      db,
      config.uploadsDir,
      site.id,
      images.filter((image) => !used.has(image.id) && image.createdAt.getTime() < cutoff),
    );
    res.json({ updatedAt: now.toISOString() });
  });

  router.patch('/api/sites/:siteId', signedIn, noStore, json, async (req, res) => {
    const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
    const renamed = await renameSite(db, site, validName(body(req).name), new Date());
    res.json({ site: siteView(renamed.site, undefined, renamed.job ?? undefined), job: renamed.job ? jobView(renamed.job) : null });
  });

  router.post(
    '/api/sites/:siteId/images',
    signedIn,
    uploadLimit,
    noStore,
    express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
      const bytes: unknown = req.body;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw new HttpError(400, 'image-type');
      if ((await storedBytes(db, site.id)) >= config.siteMaxBytes) throw new HttpError(413, 'site-full');
      const id = randomUUID();
      const stored = await storeImage(tools, bytes, tmpDir, (width) => siteImageFile(config.uploadsDir, site.id, id, width)).catch((error: unknown) => {
        if (error instanceof ImageError) throw new HttpError(error.code === 'image-too-big' ? 413 : 400, error.code);
        throw error;
      });
      const image = { id, siteId: site.id, ...stored, sample: false, createdAt: new Date() };
      if ((await storedBytes(db, site.id)) + stored.bytes > config.siteMaxBytes) {
        await deleteSiteImages(db, config.uploadsDir, site.id, [image]);
        throw new HttpError(413, 'site-full');
      }
      const [row] = await db.insert(siteImages).values(image).returning();
      if (!row) throw new Error('image insert returned no row');
      res.status(201).json({ image: imageView(row) });
    },
  );

  router.get('/api/sites/:siteId/images/:file', signedIn, async (req, res) => {
    const site = await ownedSite(db, accountOf(res.locals).id, req.params.siteId);
    const file = parseImageFileName(String(req.params.file));
    if (!file) throw new HttpError(404, 'not-found');
    const [image] = await db
      .select({ widths: siteImages.widths })
      .from(siteImages)
      .where(and(eq(siteImages.siteId, site.id), eq(siteImages.id, file.imageId)));
    if (!image?.widths.includes(file.width)) throw new HttpError(404, 'not-found');
    // A photo never changes under its id: the browser may keep it, but only for this person.
    res.set({ 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Type': 'image/webp' });
    // `root`: the hidden-file check applies to the file name only, not to the uploads dir (dev keeps it in .data/).
    res.sendFile(imageFileName(file.imageId, file.width), { root: siteUploadsDir(config.uploadsDir, site.id), dotfiles: 'deny' }, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: 'not-found' });
    });
  });

  router.post('/api/sites/:siteId/publish', signedIn, noStore, async (req, res) => {
    const account = accountOf(res.locals);
    const site = await ownedSite(db, account.id, req.params.siteId);
    const draft = shopDraftSchema.safeParse(site.draft);
    if (!draft.success) throw new HttpError(422, 'draft-incomplete', { fields: [] });
    const issues = shopPublishIssues(draft.data);
    if (issues.length > 0) throw new HttpError(422, 'draft-incomplete', { fields: issues.map((issue) => issue.field) });
    const queued = await enqueueJob(db, { siteId: site.id, accountId: account.id, type: 'publish' }, new Date());
    if (!queued.ok) throw new HttpError(409, 'job-active');
    res.status(202).json({ job: jobView(queued.job) });
  });

  router.get('/api/jobs/:jobId', signedIn, noStore, async (req, res) => {
    const account = accountOf(res.locals);
    const jobId = req.params.jobId;
    if (!isUuid(jobId)) throw new HttpError(404, 'not-found');
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.accountId, account.id)));
    if (!job) throw new HttpError(404, 'not-found');
    const [site] = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, job.siteId));
    res.json({ job: jobView(job), siteName: site?.name ?? null });
  });

  return router;
}

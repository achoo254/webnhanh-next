/**
 * The site API (apps/server/src/sites/site-routes.ts) as the web app uses it. Every response is checked against
 * its shape before the app relies on it.
 */
import { imageAsset, shopDraftSchema, type ImageAsset, type ShopDraft } from '@webnhanh/templates';
import { z } from 'zod';
import { apiError, ApiError, call } from './api';

const imageSchema = z.object({
  id: z.string(),
  width: z.number(),
  height: z.number(),
  widths: z.array(z.number()),
  sample: z.boolean(),
});
export type SiteImage = z.infer<typeof imageSchema>;

const stepSchema = z.object({ name: z.string(), startedAt: z.string(), finishedAt: z.string().optional() });
export type JobStep = z.infer<typeof stepSchema>;

const jobSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  type: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed', 'skipped']),
  steps: z.array(stepSchema),
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type Job = z.infer<typeof jobSchema>;

const siteSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** `template` or `developer`. */
  kind: z.string().optional().default('template'),
  template: z.string().nullable(),
  status: z.string(),
  published: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  cover: imageSchema.nullable(),
  job: jobSchema.nullable(),
  /** Orders not yet marked handled. */
  newOrders: z.number(),
});
export type Site = z.infer<typeof siteSchema>;

const listSchema = z.object({
  sites: z.array(siteSchema),
  limits: z.object({ sites: z.number(), developerSites: z.number().optional().default(3), siteBytes: z.number() }),
});
export type SiteList = z.infer<typeof listSchema>;

const detailSchema = z.object({
  site: siteSchema,
  draft: shopDraftSchema.nullable(),
  images: z.array(imageSchema),
  usedBytes: z.number(),
});
export type SiteDetail = z.infer<typeof detailSchema>;

export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(500, 'bad-response');
  return parsed.data;
}

export const sendJson = (method: string, value: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});

export async function listSites(): Promise<SiteList> {
  return parse(listSchema, await call('/api/sites'));
}

export async function createSite(name: string, template: string): Promise<Site> {
  return parse(z.object({ site: siteSchema }), await call('/api/sites', sendJson('POST', { name, template }))).site;
}

export async function getSite(siteId: string): Promise<SiteDetail> {
  return parse(detailSchema, await call(`/api/sites/${encodeURIComponent(siteId)}`));
}

export async function saveDraft(siteId: string, draft: ShopDraft): Promise<void> {
  await call(`/api/sites/${encodeURIComponent(siteId)}/draft`, sendJson('PUT', { draft }));
}

export async function renameSite(siteId: string, name: string): Promise<{ site: Site; job: Job | null }> {
  return parse(z.object({ site: siteSchema, job: jobSchema.nullable() }), await call(`/api/sites/${encodeURIComponent(siteId)}`, sendJson('PATCH', { name })));
}

export async function publishSite(siteId: string): Promise<Job> {
  return parse(z.object({ job: jobSchema }), await call(`/api/sites/${encodeURIComponent(siteId)}/publish`, { method: 'POST' })).job;
}

export async function getJob(jobId: string): Promise<Job> {
  return parse(z.object({ job: jobSchema }), await call(`/api/jobs/${encodeURIComponent(jobId)}`)).job;
}

/** The editor's URL of one width of a site's photo (served to the owner only). */
export function imageUrl(siteId: string, imageId: string, width: number): string {
  return `/api/sites/${siteId}/images/${imageId}-${width}.webp`;
}

/** A photo as the template renderer takes it, loading from the editor's image route. */
export function editorAsset(siteId: string, image: SiteImage): ImageAsset {
  return imageAsset(image, (width) => imageUrl(siteId, image.id, width));
}

/** The smallest stored width at least `min` wide (or the largest there is), for thumbnails. */
export function thumbUrl(siteId: string, image: SiteImage, min = 300): string {
  const width = [...image.widths].sort((a, b) => a - b).find((w) => w >= min) ?? Math.max(...image.widths);
  return imageUrl(siteId, image.id, width);
}

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Uploads one photo, reporting progress from 0 to 1. XMLHttpRequest rather than fetch: fetch has no upload progress.
 * The server checks the type again by the file's bytes and cleans the photo.
 */
export function uploadImage(siteId: string, file: Blob, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<SiteImage> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/sites/${encodeURIComponent(siteId)}/images`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted'));
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status !== 201) {
        reject(apiError(xhr.status, body));
        return;
      }
      try {
        resolve(parse(z.object({ image: imageSchema }), body).image);
      } catch (error) {
        reject(error instanceof Error ? error : new ApiError(500, 'bad-response'));
      }
    };
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

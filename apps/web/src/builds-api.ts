/**
 * The developer API (apps/server/src/builds/developer-routes.ts) as the web app uses it. Every response is checked
 * against its shape before the app relies on it.
 */
import { z } from 'zod';
import { apiError, ApiError, call } from './api';
import { parse, sendJson } from './sites-api';

const stepSchema = z.object({ name: z.string(), startedAt: z.string(), finishedAt: z.string().optional(), note: z.enum(['cached', 'not-needed']).optional() });
export type BuildStepView = z.infer<typeof stepSchema>;

const progressSchema = z.object({ code: z.string(), n: z.number().optional(), total: z.number().optional(), text: z.string().optional() });
export type BuildProgress = z.infer<typeof progressSchema>;

const reportSchema = z.object({
  title: z.string().nullable(),
  hasDescription: z.boolean(),
  ogImage: z.string().nullable(),
  hasOgImage: z.boolean(),
  hasFavicon: z.boolean(),
  largeImages: z.array(z.object({ path: z.string(), bytes: z.number() })),
  bytes: z.number(),
  fileCount: z.number(),
});
export type BuildReport = z.infer<typeof reportSchema>;

const buildSchema = z.object({
  id: z.string(),
  siteId: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed', 'skipped']),
  phase: z.enum(['building', 'publishing']),
  trigger: z.string().nullable(),
  commitSha: z.string().nullable(),
  framework: z.string().nullable(),
  steps: z.array(stepSchema),
  progress: progressSchema.nullable(),
  error: z.string().nullable(),
  errorLines: z.array(z.string()),
  report: reportSchema.nullable(),
  notify: z.boolean(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type Build = z.infer<typeof buildSchema>;

const estimateSchema = z.object({ ms: z.number(), basis: z.enum(['site', 'framework', 'default']) });
export type Estimate = z.infer<typeof estimateSchema>;

export const buildDetailSchema = z.object({
  build: buildSchema,
  siteName: z.string(),
  estimate: estimateSchema,
  queue: z.object({ position: z.number(), startsAt: z.string() }).nullable(),
  previousMs: z.number().nullable(),
});
export type BuildDetail = z.infer<typeof buildDetailSchema>;

const settingsSchema = z.object({ rootDir: z.string(), buildCommand: z.string().nullable(), outputDir: z.string() });
export type BuildSettings = z.infer<typeof settingsSchema>;

const detectionSchema = z.object({
  framework: z.string(),
  packageManager: z.string().nullable(),
  installDir: z.string(),
  lockfile: z.string().nullable(),
  buildCommand: z.string().nullable(),
  outputDir: z.string(),
  supported: z.boolean(),
  warnings: z.array(z.string()),
  /** Packages of a monorepo with a recognized framework, suggested as the app folder; absent from older checks. */
  apps: z.array(z.object({ dir: z.string(), framework: z.string() })).catch([]),
});
export type Detection = z.infer<typeof detectionSchema>;

const developerSchema = z.object({
  source: z.enum(['git', 'zip']),
  repoUrl: z.string().nullable(),
  branch: z.string().nullable(),
  settings: settingsSchema,
  detection: detectionSchema.nullable().catch(null),
  webhook: z.object({ url: z.string(), secret: z.string() }).nullable(),
  hasZip: z.boolean(),
  pendingPushAt: z.string().nullable(),
});
export type Developer = z.infer<typeof developerSchema>;

const siteSchema = z.object({ id: z.string(), name: z.string(), published: z.boolean(), status: z.string() });

const buildsSchema = z.object({
  site: siteSchema,
  developer: developerSchema,
  builds: z.array(buildSchema),
  estimate: estimateSchema,
  limits: z.object({ buildMinutesPerDay: z.number(), usedMinutesToday: z.number(), developerSites: z.number() }),
});
export type SiteBuilds = z.infer<typeof buildsSchema>;

const checkSchema = z.object({
  repo: z.object({ url: z.string(), branch: z.string(), commit: z.string() }),
  detection: detectionSchema,
  settings: settingsSchema,
});
export type RepoCheck = z.infer<typeof checkSchema>;

export async function checkRepo(repoUrl: string, branch: string, rootDir: string): Promise<RepoCheck> {
  return parse(checkSchema, await call('/api/developer/check', sendJson('POST', { repoUrl, branch, rootDir })));
}

export async function createGitSite(input: { name: string; repoUrl: string; branch: string; settings: BuildSettings; detection: Detection }): Promise<string> {
  const body = await call('/api/developer/sites', sendJson('POST', { ...input, source: 'git' }));
  return parse(z.object({ site: z.object({ id: z.string() }) }), body).site.id;
}

export async function createZipSite(name: string): Promise<string> {
  return parse(z.object({ site: z.object({ id: z.string() }) }), await call('/api/developer/sites', sendJson('POST', { name, source: 'zip' }))).site.id;
}

export async function siteBuilds(siteId: string): Promise<SiteBuilds> {
  return parse(buildsSchema, await call(`/api/sites/${encodeURIComponent(siteId)}/builds`));
}

export async function saveBuildSettings(siteId: string, settings: BuildSettings, branch?: string): Promise<Developer> {
  const body = await call(`/api/sites/${encodeURIComponent(siteId)}/build-settings`, sendJson('PUT', branch === undefined ? { settings } : { settings, branch }));
  return parse(z.object({ developer: developerSchema }), body).developer;
}

export async function startBuild(siteId: string): Promise<BuildDetail> {
  return parse(buildDetailSchema, await call(`/api/sites/${encodeURIComponent(siteId)}/builds`, { method: 'POST' }));
}

export async function getBuild(buildId: string): Promise<BuildDetail> {
  return parse(buildDetailSchema, await call(`/api/builds/${encodeURIComponent(buildId)}`));
}

export async function notifyWhenDone(buildId: string): Promise<void> {
  await call(`/api/builds/${encodeURIComponent(buildId)}/notify`, { method: 'POST' });
}

export const buildEventsUrl = (buildId: string): string => `/api/builds/${encodeURIComponent(buildId)}/events`;
export const buildLogUrl = (buildId: string): string => `/api/builds/${encodeURIComponent(buildId)}/log`;

export const MAX_ZIP_BYTES = 100 * 1024 * 1024;

/** Uploads the source zip with progress (0 to 1); the server checks it in place and answers what it found. */
export function uploadZip(siteId: string, file: Blob, onProgress: (fraction: number) => void): Promise<Developer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/sites/${encodeURIComponent(siteId)}/zip`);
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new ApiError(0, 'network'));
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status !== 200) {
        reject(apiError(xhr.status, body));
        return;
      }
      try {
        resolve(parse(z.object({ developer: developerSchema }), body).developer);
      } catch (error) {
        reject(error instanceof Error ? error : new ApiError(500, 'bad-response'));
      }
    };
    xhr.send(file);
  });
}

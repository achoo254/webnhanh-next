/** What the web app receives for sites, photos and jobs: never the account id or a file path. */
import type { Job, JobStep, siteImages } from '@webnhanh/db';
import type { Site } from './site-access';

type ImageRow = typeof siteImages.$inferSelect;

export interface ImageView {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly widths: readonly number[];
  readonly sample: boolean;
}

export interface JobView {
  readonly id: string;
  readonly siteId: string;
  readonly type: string;
  readonly status: string;
  readonly steps: readonly JobStep[];
  readonly error: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface SiteView {
  readonly id: string;
  readonly name: string;
  readonly template: string | null;
  readonly status: string;
  readonly published: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** The draft's cover, for the list of sites. */
  readonly cover: ImageView | null;
  readonly job: JobView | null;
  /** Orders not yet marked handled (the badge of the list). */
  readonly newOrders: number;
}

export function imageView(image: ImageRow): ImageView {
  return { id: image.id, width: image.width, height: image.height, widths: image.widths, sample: image.sample };
}

export function jobView(job: Job): JobView {
  return {
    id: job.id,
    siteId: job.siteId,
    type: job.type,
    status: job.status,
    steps: job.steps,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export function siteView(site: Site, cover: ImageRow | undefined, job: Job | undefined, newOrders = 0): SiteView {
  return {
    id: site.id,
    name: site.name,
    template: site.template,
    status: site.status,
    published: site.currentReleaseId !== null,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
    cover: cover ? imageView(cover) : null,
    job: job ? jobView(job) : null,
    newOrders,
  };
}

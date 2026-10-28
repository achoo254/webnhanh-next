/** What the web app receives about developer sites and their builds: never the account id or a server path. */
import type { BuildEstimate, BuildProgress, BuildReport, BuildSettings, DeveloperSiteRow, Job, JobStep } from '@webnhanh/db';

export interface BuildView {
  readonly id: string;
  readonly siteId: string;
  readonly status: string;
  /** `building` until the builder hands the output over, then `publishing`. */
  readonly phase: 'building' | 'publishing';
  readonly trigger: string | null;
  readonly commitSha: string | null;
  readonly framework: string | null;
  readonly steps: readonly JobStep[];
  readonly progress: BuildProgress | null;
  readonly error: string | null;
  readonly errorLines: readonly string[];
  readonly report: Omit<BuildReport, 'buildKey'> | null;
  readonly notify: boolean;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export function buildView(job: Job): BuildView {
  let report: Omit<BuildReport, 'buildKey'> | null = null;
  if (job.report) {
    const { buildKey: _key, ...rest } = job.report;
    report = rest;
  }
  return {
    id: job.id,
    siteId: job.siteId,
    status: job.status,
    phase: job.readyAt ? 'publishing' : 'building',
    trigger: job.trigger,
    commitSha: job.commitSha,
    framework: job.framework,
    steps: job.steps,
    progress: job.status === 'running' ? job.progress : null,
    error: job.error,
    errorLines: job.errorLines ?? [],
    report,
    notify: job.notify,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}

export interface DeveloperView {
  readonly source: string;
  readonly repoUrl: string | null;
  readonly branch: string | null;
  readonly settings: BuildSettings;
  readonly detection: unknown;
  /** Git sites: where GitHub/GitLab send pushes, and the secret they sign with (shown to the owner only). */
  readonly webhook: { readonly url: string; readonly secret: string } | null;
  /** Zip sites: whether a zip is uploaded and ready to build. */
  readonly hasZip: boolean;
  /** A push waiting out its 30 seconds. */
  readonly pendingPushAt: string | null;
}

export function developerView(dev: DeveloperSiteRow, publicUrl: string, hasZip: boolean): DeveloperView {
  return {
    source: dev.source,
    repoUrl: dev.repoUrl,
    branch: dev.branch,
    settings: dev.settings,
    detection: dev.detection ?? null,
    webhook: dev.source === 'git' && dev.webhookSecret ? { url: `${publicUrl}/hooks/git/${dev.siteId}`, secret: dev.webhookSecret } : null,
    hasZip,
    pendingPushAt: dev.pendingPushAt?.toISOString() ?? null,
  };
}

export interface EstimateView {
  readonly ms: number;
  readonly basis: BuildEstimate['basis'];
}

/** Where a waiting build stands: builds ahead of it and roughly when it starts. */
export interface QueueView {
  readonly position: number;
  readonly startsAt: string;
}

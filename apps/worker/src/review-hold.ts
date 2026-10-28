/**
 * A release the pre-publish review flagged (`review.ts`) is copied under releases/ but not made live: the site waits
 * in `pending-review` (a release live before stays live), the admins are told, and an admin approves (the release
 * goes live as a publish would have made it) or rejects it (its copy is deleted). Only webnhanh-worker runs these.
 */
import {
  developerSites,
  queueAdminNotices,
  releases,
  sites,
  type Db,
  type LivePage,
  type OrderFormSpec,
  type PendingReview,
  type ReleaseSource,
} from '@webnhanh/db';
import { activateRelease, deleteRelease, hasRelease, stageRelease, type PublishLimits } from '@webnhanh/publish';
import { and, eq, ne } from 'drizzle-orm';
import type { ReviewFindings } from './review';

export interface HoldDeps {
  readonly db: Db;
  readonly sitesDir: string;
  /** The admins (IdP subjects) told of the hold. */
  readonly adminSubs?: readonly string[];
  readonly now: () => Date;
}

export interface HoldInput {
  readonly site: { readonly id: string; readonly name: string; readonly pendingReleaseId: string | null };
  readonly sourceDir: string;
  readonly releaseId: string;
  readonly limits: PublishLimits;
  readonly findings: ReviewFindings;
  readonly jobId: string;
  readonly source: ReleaseSource;
  readonly commitSha: string | null;
  readonly livePage: LivePage | null;
  readonly orderForm: OrderFormSpec | null;
  readonly buildKey: string | null;
}

/** Thrown when the site was taken down while its release was being prepared. */
export class SiteRemovedError extends Error {
  constructor(site: string) {
    super(`site ${site} was taken down`);
    this.name = 'SiteRemovedError';
  }
}

/**
 * Copies the release in without making it live, and puts the site in `pending-review` with what its approval needs,
 * in one transaction with the admins' notices. A release that was waiting before is replaced (its copy deleted).
 */
export async function holdRelease(deps: HoldDeps, input: HoldInput): Promise<void> {
  const { site } = input;
  if (site.pendingReleaseId) await deleteRelease(deps.sitesDir, site.name, site.pendingReleaseId).catch(() => undefined);
  const staged = await stageRelease({ sitesDir: deps.sitesDir, site: site.name, sourceDir: input.sourceDir, releaseId: input.releaseId, limits: input.limits });
  const now = deps.now();
  const review: PendingReview = {
    reasons: input.findings.reasons,
    matches: input.findings.matches,
    heldAt: now.toISOString(),
    jobId: input.jobId,
    source: input.source,
    commitSha: input.commitSha,
    bytes: staged.bytes,
    fileCount: staged.fileCount,
    livePage: input.livePage,
    orderForm: input.orderForm,
    buildKey: input.buildKey,
  };
  await deps.db.transaction(async (tx) => {
    const [held] = await tx
      .update(sites)
      .set({ status: 'pending-review', pendingReleaseId: input.releaseId, pendingReview: review, updatedAt: now })
      .where(and(eq(sites.id, site.id), ne(sites.status, 'removed')))
      .returning({ id: sites.id });
    if (!held) throw new SiteRemovedError(site.name);
    await queueAdminNotices(tx, deps.adminSubs ?? [], { reviewSiteId: site.id }, now);
  });
}

type SiteRow = typeof sites.$inferSelect;

/** Why an approval or rejection could not be applied (a stable code for the audit log). */
export type ReviewDecisionError = 'not-pending' | 'release-missing' | 'account-locked';

/**
 * Makes the waiting release live, exactly as the publish would have: the releases row, the site's current release,
 * and for a template page its live page and form, for a build its build key. Old names of a renamed site are removed
 * by the caller afterwards.
 */
export async function approveRelease(deps: HoldDeps, site: SiteRow, locked: boolean): Promise<ReviewDecisionError | null> {
  const review = site.pendingReview;
  const releaseId = site.pendingReleaseId;
  if (site.status !== 'pending-review' || !review || !releaseId) return 'not-pending';
  if (locked) return 'account-locked';
  if (!(await hasRelease(deps.sitesDir, site.name, releaseId))) return 'release-missing';
  await activateRelease(deps.sitesDir, site.name, releaseId, 3);
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    await tx.insert(releases).values({
      id: releaseId,
      siteId: site.id,
      source: review.source,
      commitSha: review.commitSha,
      bytes: review.bytes,
      fileCount: review.fileCount,
      createdAt: now,
    });
    const page = site.kind === 'template' ? { livePage: review.livePage, orderForm: review.orderForm } : {};
    await tx
      .update(sites)
      .set({ status: 'published', currentReleaseId: releaseId, pendingReleaseId: null, pendingReview: null, updatedAt: now, ...page })
      .where(eq(sites.id, site.id));
    if (review.buildKey) await tx.update(developerSites).set({ lastBuildKey: review.buildKey, updatedAt: now }).where(eq(developerSites.siteId, site.id));
  });
  return null;
}

/** Deletes the waiting release; the site goes back to what is live (or to a draft when nothing is). */
export async function rejectRelease(deps: HoldDeps, site: SiteRow): Promise<ReviewDecisionError | null> {
  const releaseId = site.pendingReleaseId;
  if (site.status !== 'pending-review' || !releaseId) return 'not-pending';
  await deleteRelease(deps.sitesDir, site.name, releaseId);
  await deps.db
    .update(sites)
    .set({ status: site.currentReleaseId ? 'published' : 'draft', pendingReleaseId: null, pendingReview: null, updatedAt: deps.now() })
    .where(eq(sites.id, site.id));
  return null;
}

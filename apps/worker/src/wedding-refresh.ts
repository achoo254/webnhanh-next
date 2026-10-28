/**
 * The wedding countdown ("Còn 41 ngày") is worked out when the page is rendered, so a published invitation is
 * rendered again once a day until the day after the wedding (when the countdown goes away). The refresh is cheap and
 * changes nothing the owner made: it renders the live page (`sites.live_page`, the draft as it was published, not the
 * one being edited) into a copy of the live release, whose photos, fonts and share picture it reuses, and makes that
 * the new release. No Chrome, no uploads, no notification, no job row.
 *
 * It never holds up anyone's publish: the worker only runs it when the queue is empty, one page per turn, and looks
 * at the queue again before the next one. It never runs beside a publish either, since the worker does one thing at
 * a time.
 */
import { randomUUID } from 'node:crypto';
import { cp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { imageFileName, releases, sites, type Db, type LivePage } from '@webnhanh/db';
import { publishRelease } from '@webnhanh/publish';
import { daysUntil, imageAsset, parseDraft, WEDDING_TEMPLATE } from '@webnhanh/templates';
import { and, asc, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { renderLivePage, type PublishDeps } from './publish-job';

/** Vietnam is UTC+7 all year; the countdown counts its days. */
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Pages looked at per turn; one of them is refreshed. */
const CANDIDATES = 20;

/** Same limits as a publish: the release is the live one with a new page. */
const MAX_FILES = 400;

/** Midnight of `now`'s day in Vietnam, as an instant. */
export function vietnamDayStart(now: Date): Date {
  const local = new Date(now.getTime() + VIETNAM_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - VIETNAM_OFFSET_MS);
}

export type RefreshDeps = Pick<PublishDeps, 'db' | 'log' | 'appUrl' | 'formSecret' | 'madeWith' | 'now' | 'sitesDir' | 'siteMaxBytes' | 'workDir'>;

interface Candidate {
  readonly id: string;
  readonly name: string;
  readonly releaseId: string;
  readonly releasedAt: Date;
  readonly livePage: LivePage;
}

/**
 * Published wedding pages whose live release was made before today (Vietnam time) and whose wedding day was not yet
 * over then: their countdown is a day old or more. Oldest release first.
 */
async function staleWeddings(db: Db, now: Date): Promise<Candidate[]> {
  const rows = await db
    .select({ id: sites.id, name: sites.name, releaseId: releases.id, releasedAt: releases.createdAt, livePage: sites.livePage })
    .from(sites)
    .innerJoin(releases, eq(releases.id, sites.currentReleaseId))
    .where(
      and(
        eq(sites.template, WEDDING_TEMPLATE),
        eq(sites.status, 'published'),
        isNotNull(sites.livePage),
        lt(releases.createdAt, vietnamDayStart(now)),
        // The wedding day (YYYY-MM-DD) on or after the Vietnamese day the release was made: it still shows a countdown.
        sql`(${sites.livePage}->'draft'->>'date') >= to_char((${releases.createdAt} + interval '7 hours') at time zone 'UTC', 'YYYY-MM-DD')`,
      ),
    )
    .orderBy(asc(releases.createdAt))
    .limit(CANDIDATES);
  return rows.flatMap((row) => (row.livePage ? [{ ...row, livePage: row.livePage }] : []));
}

/** Renders `site`'s live page again into a new release; the site's row only gets the new release. */
async function refresh(deps: RefreshDeps, site: Candidate): Promise<boolean> {
  const value = parseDraft(WEDDING_TEMPLATE, site.livePage.draft);
  if (value?.template !== WEDDING_TEMPLATE) {
    deps.log.warn(`wedding refresh ${site.name}: the live page cannot be read`);
    return false;
  }
  // Only while the page still shows a countdown (the query checks the same; this is the template's own reckoning).
  const shown = daysUntil(value.draft.date, site.releasedAt);
  if (shown === null || shown < 0) return false;

  const releaseId = randomUUID();
  const work = path.join(deps.workDir ?? os.tmpdir(), `webnhanh-refresh-${releaseId}`);
  try {
    // The live release as it is (photos, fonts, share picture; the layout of @webnhanh/publish); only its page is new.
    await cp(path.join(deps.sitesDir, site.name, 'releases', site.releaseId), work, { recursive: true, errorOnExist: false });
    const assets = new Map(site.livePage.images.map((image) => [image.id, imageAsset(image, (width) => `img/${imageFileName(image.id, width)}`)]));
    await writeFile(path.join(work, 'index.html'), renderLivePage(deps, site, value, assets, site.livePage.shareImage));
    const result = await publishRelease({ sitesDir: deps.sitesDir, site: site.name, sourceDir: work, releaseId, limits: { maxBytes: deps.siteMaxBytes, maxFiles: MAX_FILES } });
    const now = deps.now();
    await deps.db.transaction(async (tx) => {
      await tx.insert(releases).values({ id: releaseId, siteId: site.id, source: 'template', bytes: result.bytes, fileCount: result.fileCount, createdAt: now });
      // Not `updated_at`: the owner changed nothing.
      await tx.update(sites).set({ currentReleaseId: releaseId }).where(and(eq(sites.id, site.id), eq(sites.currentReleaseId, site.releaseId)));
    });
    return true;
  } catch (error) {
    deps.log.warn(`wedding refresh ${site.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Refreshes the oldest stale wedding page; returns its name, or null when none needed it (or none could be). */
export async function refreshNextWedding(deps: RefreshDeps): Promise<string | null> {
  for (const site of await staleWeddings(deps.db, deps.now())) {
    if (await refresh(deps, site)) {
      deps.log.info(`wedding refresh ${site.name}: countdown rendered again`);
      return site.name;
    }
  }
  return null;
}

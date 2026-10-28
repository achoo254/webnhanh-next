import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPglite, type DbHandle } from './client';
import { activeJobOf, claimNextJob, enqueueJob, failStuckJobs, JOB_STUCK_AFTER_MS, latestJobsOf, markJobDone, markJobFailed, requeueJob, saveJobSteps } from './jobs';
import { accounts, sites } from './schema';
import { imageFileName, parseImageFileName, siteImageFile } from './site-files';

let handle: DbHandle;

beforeAll(async () => {
  handle = await openPglite();
});

afterAll(async () => {
  await handle.close();
});

async function siteOf(sub: string, name: string): Promise<{ accountId: string; siteId: string }> {
  const now = new Date();
  const [account] = await handle.db.insert(accounts).values({ sub, createdAt: now }).returning();
  if (!account) throw new Error('no account');
  const [site] = await handle.db
    .insert(sites)
    .values({ accountId: account.id, name, kind: 'template', status: 'draft', createdAt: now, updatedAt: now })
    .returning();
  if (!site) throw new Error('no site');
  return { accountId: account.id, siteId: site.id };
}

describe('job queue', () => {
  it('queues one job per account, claims the oldest first, and records steps and the outcome', async () => {
    const a = await siteOf('queue-a', 'queue-a');
    const b = await siteOf('queue-b', 'queue-b');
    const t0 = new Date('2026-10-28T01:00:00Z');
    const first = await enqueueJob(handle.db, { ...a, type: 'publish' }, t0);
    expect(first.ok).toBe(true);
    expect(await enqueueJob(handle.db, { ...a, type: 'publish' }, t0)).toEqual({ ok: false, reason: 'job-active' });
    const second = await enqueueJob(handle.db, { ...b, type: 'publish' }, new Date(t0.getTime() + 1000));
    if (!first.ok || !second.ok) throw new Error('refused');
    expect((await activeJobOf(handle.db, a.accountId))?.id).toBe(first.job.id);

    const claimed = await claimNextJob(handle.db, t0);
    expect(claimed?.id).toBe(first.job.id);
    expect(claimed?.status).toBe('running');
    await saveJobSteps(handle.db, first.job.id, [{ name: 'render', startedAt: t0.toISOString() }]);
    expect(await markJobDone(handle.db, first.job.id, null, t0)).toBe(true);
    expect(await markJobDone(handle.db, first.job.id, null, t0)).toBe(false);
    const latest = await latestJobsOf(handle.db, [a.siteId, b.siteId]);
    expect(latest.get(a.siteId)?.steps).toEqual([{ name: 'render', startedAt: t0.toISOString() }]);
    expect(latest.get(b.siteId)?.status).toBe('queued');
    expect(await activeJobOf(handle.db, a.accountId)).toBeNull();

    // The account may queue again once its job finished.
    expect((await enqueueJob(handle.db, { ...a, type: 'publish' }, t0)).ok).toBe(true);
  });

  it('puts a job back when its worker stops, and fails one that ran too long', async () => {
    const c = await siteOf('queue-c', 'queue-c');
    // Drain whatever the other test left queued.
    for (let job = await claimNextJob(handle.db, new Date()); job; job = await claimNextJob(handle.db, new Date())) {
      await markJobFailed(handle.db, job.id, 'test', new Date());
    }
    const queued = await enqueueJob(handle.db, { ...c, type: 'publish' }, new Date());
    if (!queued.ok) throw new Error('refused');
    const start = new Date();
    await claimNextJob(handle.db, start);
    await requeueJob(handle.db, queued.job.id);
    expect((await claimNextJob(handle.db, start))?.id).toBe(queued.job.id);
    expect(await failStuckJobs(handle.db, new Date(start.getTime() + JOB_STUCK_AFTER_MS - 1000))).toEqual([]);
    expect(await failStuckJobs(handle.db, new Date(start.getTime() + JOB_STUCK_AFTER_MS + 1000))).toEqual([queued.job.id]);
    expect((await latestJobsOf(handle.db, [c.siteId])).get(c.siteId)?.error).toBe('stuck');
  });
});

describe('site files', () => {
  const id = '5b0e7d2c-1a2b-4c3d-8e9f-0a1b2c3d4e5f';

  it('names one width of a photo and reads the name back', () => {
    expect(imageFileName(id, 480)).toBe(`${id}-480.webp`);
    expect(parseImageFileName(`${id}-480.webp`)).toEqual({ imageId: id, width: 480 });
    expect(siteImageFile('/u', id, id, 960)).toBe(`/u/${id}/${id}-960.webp`);
  });

  it.each(['../etc/passwd', `${id}-480.jpg`, `${id}-0.webp`, `x${id}-480.webp`, `${id}-480.webp/..`])('refuses %j', (name) => {
    expect(parseImageFileName(name)).toBeNull();
  });

  it('refuses ids that are not uuids', () => {
    expect(() => siteImageFile('/u', '..', id, 480)).toThrow();
    expect(() => imageFileName('../x', 480)).toThrow();
  });
});

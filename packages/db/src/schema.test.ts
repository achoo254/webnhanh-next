import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openPglite, type DbHandle } from './client';
import { accounts, jobs, sites } from './schema';

let handle: DbHandle;

beforeAll(async () => {
  handle = await openPglite();
});

afterAll(async () => {
  await handle.close();
});

describe('schema', () => {
  it('applies the migrations and allows one waiting or running job per account', async () => {
    const now = new Date();
    const [account] = await handle.db.insert(accounts).values({ sub: 'sub-1', createdAt: now }).returning();
    if (!account) throw new Error('no account');
    const [site] = await handle.db
      .insert(sites)
      .values({ accountId: account.id, name: 'banh-mi', kind: 'template', status: 'draft', createdAt: now, updatedAt: now })
      .returning();
    if (!site) throw new Error('no site');

    const job = (status: 'queued' | 'running' | 'done') => ({
      id: randomUUID(),
      siteId: site.id,
      accountId: account.id,
      type: 'publish' as const,
      status,
      createdAt: now,
    });
    await handle.db.insert(jobs).values(job('done'));
    await handle.db.insert(jobs).values(job('queued'));
    await expect(handle.db.insert(jobs).values(job('running'))).rejects.toThrow();
    await handle.db.insert(jobs).values(job('done'));
  });

  it('refuses a second site with the same name and an unknown kind', async () => {
    const now = new Date();
    const [account] = await handle.db.insert(accounts).values({ sub: 'sub-2', createdAt: now }).returning();
    if (!account) throw new Error('no account');
    const base = { accountId: account.id, status: 'draft' as const, createdAt: now, updatedAt: now };
    await expect(handle.db.insert(sites).values({ ...base, name: 'banh-mi', kind: 'template' })).rejects.toThrow();
    await expect(
      handle.db.insert(sites).values({ ...base, name: 'pho-bo', kind: 'server' as unknown as 'template' }),
    ).rejects.toThrow();
  });
});

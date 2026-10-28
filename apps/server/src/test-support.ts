// Helpers for the server's tests: an app on a fresh in-memory database, and signed-in sessions made directly in the
// database (the IdP round trip has its own tests).
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { openPglite, signFormToken, sites, type DbHandle } from '@webnhanh/db';
import request from 'supertest';
import { createApp } from './app';
import { accountForSub, createSession, sessionCookieName } from './auth/session';
import { loadConfig, type ServerConfig } from './config';

export const ORIGIN = 'http://localhost:5297';

export interface TestApp {
  readonly config: ServerConfig;
  readonly handle: DbHandle;
  /** A supertest agent against the app served on 127.0.0.1 (not the IPv6 wildcard supertest picks by default). */
  http(): request.Agent;
  /** A signed-in account: its id and the Cookie header of its session. */
  signIn(sub: string, now?: Date): Promise<{ accountId: string; cookie: string }>;
  close(): Promise<void>;
}

export async function startTestApp(overrides: Partial<ServerConfig> = {}, onOrder?: () => void): Promise<TestApp> {
  // Photos of each test app go to a temp dir of its own, removed on close.
  const uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'webnhanh-uploads-'));
  const config: ServerConfig = { ...loadConfig({ NODE_ENV: 'test' }), uploadsDir, ...overrides };
  const handle = await openPglite();
  const server = createApp({ config, db: handle.db, onOrder }).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    config,
    handle,
    http: () => request.agent(`http://127.0.0.1:${port}`),
    async signIn(sub, now = new Date()) {
      const accountId = await accountForSub(handle.db, sub, now);
      const token = await createSession(handle.db, accountId, now);
      return { accountId, cookie: `${sessionCookieName(config)}=${token}` };
    },
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await handle.close();
      await rm(uploadsDir, { recursive: true, force: true });
      await rm(config.uploadsDir, { recursive: true, force: true });
    },
  };
}

/**
 * A published shop of `who` taking orders for "Bánh tráng" (p1) and "Trà tắc" (p2), as the worker leaves it after a
 * publish (the release itself is not needed here); returns the site id and a valid form token.
 */
export async function publishedShop(app: TestApp, who: { accountId: string }, name: string): Promise<{ siteId: string; token: string }> {
  const now = new Date();
  const [site] = await app.handle.db
    .insert(sites)
    .values({
      accountId: who.accountId,
      name,
      kind: 'template',
      template: 'shop',
      status: 'published',
      currentReleaseId: randomUUID(),
      orderForm: { products: [{ key: 'p1', name: 'Bánh tráng' }, { key: 'p2', name: 'Trà tắc' }] },
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!site) throw new Error('no site');
  return { siteId: site.id, token: signFormToken(app.config.formSecret, site.id, new Date(now.getTime() - 60_000)) };
}

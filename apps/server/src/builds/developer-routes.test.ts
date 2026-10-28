import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { appendJobLog, developerSites, jobs, sites, type BuildSettings } from '@webnhanh/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zipBytes } from '../../../worker/src/build/test-zip';
import { ORIGIN, startTestApp, type TestApp } from '../test-support';
import type { Fetcher } from './repo-check';

const COMMIT = 'c'.repeat(40);

/** git's ref list of a repo with branches main (default) and dev, as GitHub sends it. */
function refAdvertisement(): Buffer {
  const pkt = (line: string): string => `${(line.length + 4).toString(16).padStart(4, '0')}${line}`;
  return Buffer.from(
    `${pkt('# service=git-upload-pack\n')}0000${pkt(`${COMMIT} HEAD\0multi_ack symref=HEAD:refs/heads/main agent=git/x\n`)}${pkt(`${COMMIT} refs/heads/main\n`)}${pkt(`${'d'.repeat(40)} refs/heads/dev\n`)}0000`,
  );
}

/** github.com/acme/shop (a Vite app, pnpm); github.com/acme/private answers 401 like a private repo. */
const fakeGithub: Fetcher = (url) => {
  const files: Record<string, string> = {
    [`https://raw.githubusercontent.com/acme/shop/${COMMIT}/package.json`]: JSON.stringify({ dependencies: { vite: '8' }, scripts: { build: 'vite build' } }),
    [`https://raw.githubusercontent.com/acme/shop/${COMMIT}/pnpm-lock.yaml`]: 'lockfileVersion: 9',
  };
  if (url === 'https://github.com/acme/shop.git/info/refs?service=git-upload-pack') return Promise.resolve(new Response(refAdvertisement()));
  if (url.startsWith('https://github.com/acme/private.git')) return Promise.resolve(new Response('', { status: 401 }));
  const file = files[url];
  return Promise.resolve(file === undefined ? new Response('', { status: 404 }) : new Response(file));
};

let app: TestApp;
let owner: { accountId: string; cookie: string };
let stranger: { accountId: string; cookie: string };

beforeEach(async () => {
  app = await startTestApp({}, undefined, fakeGithub);
  owner = await app.signIn('dev-owner');
  stranger = await app.signIn('dev-stranger');
});

afterEach(async () => {
  await app.close();
});

const SETTINGS: BuildSettings = { rootDir: '', buildCommand: 'pnpm run build', outputDir: 'dist' };

async function gitSite(name: string, who = owner): Promise<{ id: string; secret: string }> {
  const res = await app.http().post('/api/developer/sites').set('Cookie', who.cookie).set('Origin', ORIGIN).send({ name, source: 'git', repoUrl: 'https://github.com/acme/shop', branch: 'main', settings: SETTINGS });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const id = (res.body as { site: { id: string } }).site.id;
  const [dev] = await app.handle.db.select().from(developerSites).where(eq(developerSites.siteId, id));
  return { id, secret: dev?.webhookSecret ?? '' };
}

describe('the check before the first build', () => {
  it('finds the default branch, its commit and what to run, without cloning', async () => {
    const res = await app.http().post('/api/developer/check').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ repoUrl: 'https://github.com/acme/shop' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      repo: { url: 'https://github.com/acme/shop', branch: 'main', commit: COMMIT },
      detection: { framework: 'vite', packageManager: 'pnpm', supported: true },
      settings: { rootDir: '', buildCommand: 'pnpm run build', outputDir: 'dist' },
    });
  });

  it('says when the repo is private or missing, the branch does not exist, or the link is not a repo', async () => {
    const post = (payload: object) => app.http().post('/api/developer/check').set('Cookie', owner.cookie).set('Origin', ORIGIN).send(payload);
    expect((await post({ repoUrl: 'https://github.com/acme/private' })).body).toEqual({ error: 'repo-not-found' });
    expect((await post({ repoUrl: 'https://github.com/acme/shop', branch: 'nope' })).body).toMatchObject({ error: 'branch-not-found', branches: ['main', 'dev'] });
    expect((await post({ repoUrl: 'https://evil.example/acme/shop' })).body).toEqual({ error: 'repo-url' });
    expect((await post({ repoUrl: 'https://github.com/acme/shop', branch: '--upload-pack=x' })).body).toEqual({ error: 'branch' });
  });
});

describe('developer sites and builds', () => {
  it('creates up to three developer sites per account, each with its own webhook secret', async () => {
    const a = await gitSite('dev-a');
    const b = await gitSite('dev-b');
    await gitSite('dev-c');
    expect(a.secret.length).toBeGreaterThanOrEqual(40);
    expect(a.secret).not.toBe(b.secret);
    const res = await app.http().post('/api/developer/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'dev-d', source: 'git', repoUrl: 'https://github.com/acme/shop', branch: 'main', settings: SETTINGS });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'developer-site-limit', limit: 3 });
  });

  it('refuses settings that leave the project or a command over two lines', async () => {
    const res = await app.http().post('/api/developer/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'sai', source: 'git', repoUrl: 'https://github.com/acme/shop', branch: 'main', settings: { rootDir: '../..', buildCommand: 'a\nb', outputDir: '/etc' } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'build-settings', fields: ['root-dir', 'build-command', 'output-dir'] });
  });

  it('queues a build, one at a time, and shows it only to its owner', async () => {
    const site = await gitSite('xay-dung');
    const res = await app.http().post(`/api/sites/${site.id}/builds`).set('Cookie', owner.cookie).set('Origin', ORIGIN);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    const build = (res.body as { build: { id: string; status: string; trigger: string } }).build;
    expect(build).toMatchObject({ status: 'queued', trigger: 'manual' });
    expect(res.body).toMatchObject({ siteName: 'xay-dung', queue: { position: 0 }, estimate: { basis: 'default' } });
    expect((await app.http().post(`/api/sites/${site.id}/builds`).set('Cookie', owner.cookie).set('Origin', ORIGIN)).body).toEqual({ error: 'job-active' });
    expect((await app.http().get(`/api/builds/${build.id}`).set('Cookie', stranger.cookie)).status).toBe(404);
    expect((await app.http().post(`/api/sites/${site.id}/builds`).set('Cookie', stranger.cookie).set('Origin', ORIGIN)).status).toBe(404);

    expect((await app.http().post(`/api/builds/${build.id}/notify`).set('Cookie', owner.cookie).set('Origin', ORIGIN)).body).toEqual({ notify: true });
    const [row] = await app.handle.db.select().from(jobs).where(eq(jobs.id, build.id));
    expect(row?.notify).toBe(true);

    const list = await app.http().get(`/api/sites/${site.id}/builds`).set('Cookie', owner.cookie);
    expect(list.body).toMatchObject({ developer: { source: 'git', branch: 'main', webhook: { url: `${app.config.publicUrl}/hooks/git/${site.id}`, secret: site.secret } }, limits: { buildsPerDay: 5, usedToday: 1 } });
  });

  it('refuses the sixth build of the day', async () => {
    const site = await gitSite('nam-lan');
    for (let i = 0; i < 5; i += 1) {
      expect((await app.http().post(`/api/sites/${site.id}/builds`).set('Cookie', owner.cookie).set('Origin', ORIGIN)).status).toBe(202);
      await app.handle.db.update(jobs).set({ status: 'failed' }).where(eq(jobs.siteId, site.id));
    }
    const res = await app.http().post(`/api/sites/${site.id}/builds`).set('Cookie', owner.cookie).set('Origin', ORIGIN);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'daily-limit', limit: 5 });
  });

  it('takes a zip, checks it in place and suggests the settings; refuses an unsafe one', async () => {
    const created = await app.http().post('/api/developer/sites').set('Cookie', owner.cookie).set('Origin', ORIGIN).send({ name: 'tu-zip', source: 'zip' });
    expect(created.status).toBe(201);
    const id = (created.body as { site: { id: string } }).site.id;
    expect((await app.http().post(`/api/sites/${id}/builds`).set('Cookie', owner.cookie).set('Origin', ORIGIN)).body).toEqual({ error: 'zip-missing' });

    const bad = zipBytes([{ name: '../../evil.sh', data: 'x' }]);
    const refused = await app.http().put(`/api/sites/${id}/zip`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'application/zip').send(bad);
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({ error: 'zip-unsafe' });

    const good = zipBytes([
      { name: 'shop-main/package.json', data: JSON.stringify({ dependencies: { astro: '5' }, scripts: { build: 'astro build' } }) },
      { name: 'shop-main/package-lock.json', data: '{}' },
    ]);
    const res = await app.http().put(`/api/sites/${id}/zip`).set('Cookie', owner.cookie).set('Origin', ORIGIN).set('Content-Type', 'application/zip').send(good);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ developer: { source: 'zip', hasZip: true, settings: { buildCommand: 'npm run build', outputDir: 'dist' }, detection: { framework: 'astro' }, webhook: null } });
    expect(await readFile(path.join(app.config.buildInboxDir ?? '', `${id}.zip`))).toEqual(good);
    expect((await app.http().post(`/api/sites/${id}/builds`).set('Cookie', owner.cookie).set('Origin', ORIGIN)).status).toBe(202);
    // Not replaced while a build may be reading it.
    expect((await app.http().put(`/api/sites/${id}/zip`).set('Cookie', owner.cookie).set('Origin', ORIGIN).send(good)).body).toEqual({ error: 'job-active' });
  });

  it('streams a build: its state, its log, then the end', async () => {
    const site = await gitSite('nhat-ky');
    const queued = await app.http().post(`/api/sites/${site.id}/builds`).set('Cookie', owner.cookie).set('Origin', ORIGIN);
    const id = (queued.body as { build: { id: string } }).build.id;
    await appendJobLog(app.handle.db, id, 0, ['> vite build', '✓ 38 modules transformed.'], new Date());
    await app.handle.db.update(jobs).set({ status: 'failed', error: 'build-failed', errorLines: ['error TS2304'], finishedAt: new Date() }).where(eq(jobs.id, id));
    const res = await app.http().get(`/api/builds/${id}/events`).set('Cookie', owner.cookie).buffer(true).parse((stream, done) => {
      let text = '';
      stream.on('data', (chunk: Buffer) => (text += chunk.toString()));
      stream.on('end', () => done(null, text));
    });
    expect(res.headers['content-type']).toContain('text/event-stream');
    const text = String(res.body);
    expect(text).toContain('event: state');
    expect(text).toContain('"error":"build-failed"');
    expect(text).toContain('id: 2\nevent: log\ndata: {"lines":["> vite build","✓ 38 modules transformed."],"seq":2}');
    expect(text).toContain('event: end');

    const log = await app.http().get(`/api/builds/${id}/log`).set('Cookie', owner.cookie);
    expect(log.headers['content-disposition']).toContain('attachment; filename="build-nhat-ky-');
    expect(log.text).toBe('> vite build\n✓ 38 modules transformed.\n');
    expect((await app.http().get(`/api/builds/${id}/log`).set('Cookie', stranger.cookie)).status).toBe(404);
  });

  it('keeps drafts, photos and Publish to template sites', async () => {
    const site = await gitSite('khong-mau');
    expect((await app.http().post(`/api/sites/${site.id}/publish`).set('Cookie', owner.cookie).set('Origin', ORIGIN)).status).toBe(404);
  });
});

describe('POST /hooks/git/:site', () => {
  const pushPayload = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ ref: 'refs/heads/main', before: 'b'.repeat(40), after: 'e'.repeat(40), commits: [{ added: [], modified: ['src/App.tsx'], removed: [] }], ...overrides });
  const sign = (secret: string, raw: string): string => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const github = (siteId: string, raw: string, signature: string, event = 'push') =>
    app.http().post(`/hooks/git/${siteId}`).set('Content-Type', 'application/json').set('X-GitHub-Event', event).set('X-Hub-Signature-256', signature).send(raw);

  it('takes a signed push to the chosen branch and lets it wait 30 seconds', async () => {
    const site = await gitSite('push-me');
    const raw = pushPayload();
    const res = await github(site.id, raw, sign(site.secret, raw));
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ queued: 'waiting' });
    const [dev] = await app.handle.db.select().from(developerSites).where(eq(developerSites.siteId, site.id));
    expect(dev?.pendingCommit).toBe('e'.repeat(40));
    expect((dev?.pendingPushAt?.getTime() ?? 0) - Date.now()).toBeGreaterThan(25_000);
  });

  it('refuses a wrong or missing signature, and a signature made with another site’s secret', async () => {
    const site = await gitSite('ky-sai');
    const other = await gitSite('ky-khac');
    const raw = pushPayload();
    expect((await github(site.id, raw, sign('wrong', raw))).status).toBe(401);
    expect((await github(site.id, raw, sign(other.secret, raw))).status).toBe(401);
    expect((await app.http().post(`/hooks/git/${site.id}`).set('X-GitHub-Event', 'push').send(raw)).status).toBe(401);
    expect((await github(site.id, `${raw} `, sign(site.secret, raw))).status).toBe(401);
    const [dev] = await app.handle.db.select().from(developerSites).where(eq(developerSites.siteId, site.id));
    expect(dev?.pendingPushAt).toBeNull();
  });

  it('ignores other branches, answers ping, and takes GitLab with its token', async () => {
    const site = await gitSite('nhanh-khac');
    const other = pushPayload({ ref: 'refs/heads/dev' });
    expect((await github(site.id, other, sign(site.secret, other))).body).toEqual({ ignored: 'branch' });
    const ping = JSON.stringify({ zen: 'x' });
    expect((await github(site.id, ping, sign(site.secret, ping), 'ping')).body).toEqual({ ok: 'pong' });
    const raw = pushPayload({ total_commits_count: 1 });
    const gitlab = await app.http().post(`/hooks/git/${site.id}`).set('Content-Type', 'application/json').set('X-Gitlab-Event', 'Push Hook').set('X-Gitlab-Token', site.secret).send(raw);
    expect(gitlab.body).toEqual({ queued: 'waiting' });
    const wrong = await app.http().post(`/hooks/git/${site.id}`).set('X-Gitlab-Event', 'Push Hook').set('X-Gitlab-Token', 'nope').send(raw);
    expect(wrong.status).toBe(401);
  });

  it('builds nothing for a push that only touched the README on top of the live commit', async () => {
    const site = await gitSite('chi-readme');
    const now = new Date();
    await app.handle.db.update(sites).set({ currentReleaseId: '00000000-0000-4000-8000-000000000000' }).where(eq(sites.id, site.id));
    await app.handle.db.insert(jobs).values({ id: '11111111-1111-4111-8111-111111111111', siteId: site.id, accountId: owner.accountId, type: 'build', status: 'done', commitSha: 'b'.repeat(40), createdAt: now, finishedAt: now });
    const raw = pushPayload({ commits: [{ added: [], modified: ['README.md', '.github/workflows/ci.yml'], removed: [] }] });
    expect((await github(site.id, raw, sign(site.secret, raw))).body).toEqual({ skipped: 'no-change' });
    const skipped = await app.handle.db.select().from(jobs).where(eq(jobs.status, 'skipped'));
    expect(skipped[0]).toMatchObject({ error: 'no-change', trigger: 'push', commitSha: 'e'.repeat(40) });
    // A change to the code builds.
    const code = pushPayload();
    expect((await github(site.id, code, sign(site.secret, code))).body).toEqual({ queued: 'waiting' });
  });

  it('answers 404 for a site that is not a git developer site', async () => {
    const raw = pushPayload();
    expect((await github('00000000-0000-4000-8000-000000000000', raw, 'sha256=x')).status).toBe(404);
    expect((await github('not-a-uuid', raw, 'sha256=x')).status).toBe(404);
  });
});

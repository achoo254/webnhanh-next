/**
 * `POST /hooks/git/<site id>`: pushes from GitHub (`X-Hub-Signature-256`, HMAC-SHA256 of the body with the site's
 * secret) or GitLab (`X-Gitlab-Token`, the secret itself). Only a push to the site's branch counts; it waits 30 seconds
 * for more pushes (`notePush`), a newer one replacing it. A push that only touched files no build reads (README,
 * LICENSE, .github/, .gitlab/) on top of the commit already live is recorded as skipped and builds nothing.
 * Mounted before the app's origin check: the caller is GitHub or GitLab, the secret is the check.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { developerSites, isUuid, jobs, notePush, recordSkippedBuild, sites, type Db } from '@webnhanh/db';
import { isCommitSha } from '@webnhanh/worker/build';
import { and, desc, eq } from 'drizzle-orm';
import express, { type Router } from 'express';
import type { IncomingHttpHeaders } from 'node:http';

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type WebhookSender = 'github' | 'gitlab';

/** Who signed the request with the site's secret, or null when nobody did. */
export function verifyGitWebhook(secret: string, headers: IncomingHttpHeaders, raw: Buffer): WebhookSender | null {
  const signature = header(headers, 'x-hub-signature-256');
  if (signature !== undefined) {
    const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
    return sameText(signature, expected) ? 'github' : null;
  }
  const token = header(headers, 'x-gitlab-token');
  if (token !== undefined) return sameText(token, secret) ? 'gitlab' : null;
  return null;
}

/** Files a build never reads: a push touching only these changes nothing on the site. */
export function isIgnoredPath(file: string): boolean {
  return /^(?:README|LICEN[CS]E|CHANGELOG|CONTRIBUTING|CODE_OF_CONDUCT)(?:\.[A-Za-z0-9]+)?$/i.test(file) || /^\.(?:github|gitlab)\//.test(file) || file === '.gitlab-ci.yml';
}

interface Push {
  readonly ref: string;
  readonly before: string | null;
  readonly after: string;
  readonly deleted: boolean;
  /** Every file the pushed commits touched; null when the payload does not list them all. */
  readonly files: readonly string[] | null;
}

/** GitHub and GitLab push payloads share the fields used here; GitLab lists at most 20 commits, GitHub too. */
export function parsePush(payload: unknown, sender: WebhookSender): Push | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.ref !== 'string' || typeof p.after !== 'string') return null;
  const commits = Array.isArray(p.commits) ? p.commits : [];
  const total = sender === 'gitlab' && typeof p.total_commits_count === 'number' ? p.total_commits_count : commits.length;
  const listed = commits.length > 0 && commits.length === total && commits.length < 20;
  const files = new Set<string>();
  for (const commit of commits) {
    if (typeof commit !== 'object' || commit === null) continue;
    for (const key of ['added', 'modified', 'removed']) {
      const list = (commit as Record<string, unknown>)[key];
      if (Array.isArray(list)) for (const file of list) if (typeof file === 'string') files.add(file);
    }
  }
  return {
    ref: p.ref,
    before: typeof p.before === 'string' ? p.before : null,
    after: p.after,
    deleted: p.deleted === true || /^0+$/.test(p.after),
    files: listed && p.forced !== true ? [...files] : null,
  };
}

export function gitWebhookRoutes(db: Db): Router {
  const router = express.Router();
  router.post('/hooks/git/:siteId', express.raw({ type: () => true, limit: '2mb' }), async (req, res) => {
    const siteId = req.params.siteId;
    const raw: unknown = req.body;
    if (!isUuid(siteId) || !Buffer.isBuffer(raw)) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    const [row] = await db
      .select({ site: sites, dev: developerSites })
      .from(sites)
      .innerJoin(developerSites, eq(developerSites.siteId, sites.id))
      .where(eq(sites.id, siteId));
    if (!row || row.dev.source !== 'git' || !row.dev.webhookSecret || !row.dev.branch) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    const sender = verifyGitWebhook(row.dev.webhookSecret, req.headers, raw);
    if (!sender) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const event = sender === 'github' ? header(req.headers, 'x-github-event') : header(req.headers, 'x-gitlab-event');
    if (sender === 'github' && event === 'ping') {
      res.json({ ok: 'pong' });
      return;
    }
    if (event !== 'push' && event !== 'Push Hook') {
      res.status(202).json({ ignored: 'event' });
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'bad-request' });
      return;
    }
    const push = parsePush(payload, sender);
    if (!push || (!push.deleted && !isCommitSha(push.after))) {
      res.status(400).json({ error: 'bad-request' });
      return;
    }
    if (push.ref !== `refs/heads/${row.dev.branch}`) {
      res.status(202).json({ ignored: 'branch' });
      return;
    }
    if (push.deleted) {
      res.status(202).json({ ignored: 'deleted' });
      return;
    }
    const now = new Date();
    if (push.files !== null && push.files.every(isIgnoredPath) && push.before !== null && row.site.currentReleaseId !== null) {
      const [live] = await db
        .select({ commit: jobs.commitSha })
        .from(jobs)
        .where(and(eq(jobs.siteId, siteId), eq(jobs.type, 'build'), eq(jobs.status, 'done')))
        .orderBy(desc(jobs.finishedAt))
        .limit(1);
      if (live?.commit === push.before) {
        await recordSkippedBuild(db, { siteId, accountId: row.site.accountId, trigger: 'push', commitSha: push.after, reason: 'no-change' }, now);
        res.status(202).json({ skipped: 'no-change' });
        return;
      }
    }
    res.status(202).json({ queued: await notePush(db, siteId, push.after, now) });
  });
  return router;
}

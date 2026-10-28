import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** A hoandat.com account that signed in here, known only by the IdP's subject. */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** `sub` of the ID token from auth.hoandat.com: the only thing Trang learns about the person. */
  sub: text('sub').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/** A session ends 30 days after sign-in, or after 7 days without use. */
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/** Web sessions of trang.hoandat.com: the id is the sha256 of the cookie token, so a database leak hands out no live session. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_account_idx').on(t.accountId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const SITE_KINDS = ['template', 'developer'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export const SITE_STATUSES = ['draft', 'published', 'pending-review', 'removed'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

/** One site at `<name>.hoandat.io.vn`. The name is the directory under SITES_DIR, checked by `checkSiteName`. */
export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull().unique(),
    kind: text('kind').$type<SiteKind>().notNull(),
    status: text('status').$type<SiteStatus>().notNull(),
    /** The release `current` points to; null until the first publish. */
    currentReleaseId: uuid('current_release_id'),
    /** Template of a `template` site (`@trang/templates`); null for developer sites. */
    template: text('template'),
    /**
     * What the owner is editing, checked against the template's draft schema on every save. The last publish rendered
     * the draft as it was then; the live site does not change until the next publish.
     */
    draft: jsonb('draft').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('sites_account_idx').on(t.accountId),
    check('sites_kind_check', sql`${t.kind} in ('template', 'developer')`),
    check('sites_status_check', sql`${t.status} in ('draft', 'published', 'pending-review', 'removed')`),
  ],
);

export const RELEASE_SOURCES = ['template', 'git', 'zip'] as const;
export type ReleaseSource = (typeof RELEASE_SOURCES)[number];

/** A published copy of a site under SITES_DIR/<name>/releases/<id>/ (the last few are kept for rollback). */
export const releases = pgTable(
  'releases',
  {
    id: uuid('id').primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    source: text('source').$type<ReleaseSource>().notNull(),
    /** Commit built for a git release. */
    commitSha: text('commit_sha'),
    bytes: integer('bytes').notNull(),
    fileCount: integer('file_count').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('releases_site_idx').on(t.siteId, t.createdAt),
    check('releases_source_check', sql`${t.source} in ('template', 'git', 'zip')`),
  ],
);

export const JOB_TYPES = ['publish', 'build'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'skipped'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** One named step of a job, timed for the progress screen and for estimating the next build. */
export interface JobStep {
  name: string;
  startedAt: string;
  finishedAt?: string;
}

/** The work queue shared by template publishes and developer builds. The worker claims with FOR UPDATE SKIP LOCKED. */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: text('type').$type<JobType>().notNull(),
    status: text('status').$type<JobStatus>().notNull(),
    steps: jsonb('steps').$type<JobStep[]>().notNull().default([]),
    /** Stable error code of a failed job (never a stack trace or user data). */
    error: text('error'),
    releaseId: uuid('release_id').references(() => releases.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('jobs_queue_idx').on(t.status, t.createdAt),
    index('jobs_site_idx').on(t.siteId, t.createdAt),
    // One job waiting or running per account at a time.
    uniqueIndex('jobs_one_active_per_account').on(t.accountId).where(sql`${t.status} in ('queued', 'running')`),
    check('jobs_type_check', sql`${t.type} in ('publish', 'build')`),
    check('jobs_status_check', sql`${t.status} in ('queued', 'running', 'done', 'failed', 'skipped')`),
  ],
);

/**
 * A photo uploaded for one site: stored as WebP, at most 1600 px on its longer side, without metadata, in one file per width
 * under UPLOADS_DIR/<site id>/ (`siteImageFile`). A publish copies the ones the draft uses into the release.
 */
export const siteImages = pgTable(
  'site_images',
  {
    id: uuid('id').primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    /** Size of the largest file. */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Widths stored, ascending; the last one is `width`. */
    widths: jsonb('widths').$type<number[]>().notNull(),
    /** All files of the image together, counted against the site's size limit. */
    bytes: integer('bytes').notNull(),
    /** One of the template's sample photos, copied in when the site was made: the editor marks it for replacing. */
    sample: boolean('sample').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('site_images_site_idx').on(t.siteId, t.createdAt)],
);

/** How long the old name of a renamed site stays reserved (answering 404) before anyone can take it. */
export const NAME_HOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Old names of renamed, published sites. A link someone already shared must not lead to another person's page for a
 * while: the name answers 404 (its directory is removed by the next publish) and nobody else can take it until
 * `held_until`. The site that let it go can take it back.
 */
export const siteNameHolds = pgTable(
  'site_name_holds',
  {
    name: text('name').primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    heldUntil: timestamp('held_until', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('site_name_holds_site_idx').on(t.siteId)],
);

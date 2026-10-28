import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** A hoandat.com account that signed in here, known only by the IdP's subject. */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** `sub` of the ID token from auth.hoandat.com: the only thing Web Nhanh learns about the person. */
  sub: text('sub').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/** A session ends 30 days after sign-in, or after 7 days without use. */
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

/** Web sessions of webnhanh.hoandat.com: the id is the sha256 of the cookie token, so a database leak hands out no live session. */
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

/** One product a published order form lets visitors choose. */
export interface OrderFormProduct {
  key: string;
  name: string;
}

export interface OrderFormSpec {
  products: OrderFormProduct[];
}

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
    /** Template of a `template` site (`@webnhanh/templates`); null for developer sites. */
    template: text('template'),
    /**
     * What the owner is editing, checked against the template's draft schema on every save. The last publish rendered
     * the draft as it was then; the live site does not change until the next publish.
     */
    draft: jsonb('draft').$type<unknown>(),
    /**
     * What the order form of the live page offers, written by each publish; null while no published page takes
     * orders. Visitors' orders are checked against this, not against the draft being edited.
     */
    orderForm: jsonb('order_form').$type<OrderFormSpec>(),
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

export const SUBMISSION_KINDS = ['order'] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

/** An order as stored: what the visitor typed, checked, and the product's name as the page showed it. */
export interface OrderData {
  name: string;
  phone: string;
  address: string;
  productKey: string;
  productName: string;
  quantity: number;
  note: string;
}

/**
 * What visitors sent through a published page's form (an order of the shop template). The owner sees them in the
 * app; `handled_at` is set when the owner marks one done. No IP address or other trace of the visitor is kept.
 */
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<SubmissionKind>().notNull(),
    data: jsonb('data').$type<OrderData>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [
    index('submissions_site_idx').on(t.siteId, t.createdAt),
    index('submissions_open_idx').on(t.siteId).where(sql`${t.handledAt} is null`),
    check('submissions_kind_check', sql`${t.kind} in ('order')`),
  ],
);

/** A browser (one device) that asked for Web Push of new orders. The endpoint is the push service's URL for it. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('push_subscriptions_account_idx').on(t.accountId)],
);

/** The private chat of the Chat app where an account gets its new orders (one per account). */
export const chatLinks = pgTable('chat_links', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  chatId: bigint('chat_id', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

/** How long the one-time code of a "get orders in Chat" link stays usable. */
export const CHAT_LINK_CODE_MS = 15 * 60 * 1000;

/** One-time codes of the bot's deep link; stored as sha256 like session tokens. */
export const chatLinkCodes = pgTable(
  'chat_link_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('chat_link_codes_account_idx').on(t.accountId)],
);

export const NOTIFICATION_CHANNELS = ['push', 'chat'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'dropped'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * The outbox of order notifications: one row per new order and per place it goes (a push subscription, the linked
 * chat), written in the same transaction as the order. A sender picks due rows, and a failure only moves that row's
 * next attempt: one channel failing never holds back another, nor the order. `dropped`: the target went away
 * (subscription expired, chat unlinked).
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    channel: text('channel').$type<NotificationChannel>().notNull(),
    /** The push subscription id, or the chat id. */
    target: text('target').notNull(),
    status: text('status').$type<DeliveryStatus>().notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
    /** Stable code of the last failure (never a response body or user data). */
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    index('notification_deliveries_due_idx').on(t.status, t.nextAttemptAt),
    index('notification_deliveries_submission_idx').on(t.submissionId),
    check('notification_deliveries_channel_check', sql`${t.channel} in ('push', 'chat')`),
    check('notification_deliveries_status_check', sql`${t.status} in ('pending', 'sent', 'failed', 'dropped')`),
  ],
);

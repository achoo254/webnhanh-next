import { sql } from 'drizzle-orm';
import type { AbuseCategory, ReviewReason } from './admin-codes';
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** A hoandat.com account that signed in here, known only by the IdP's subject. */
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** `sub` of the ID token from auth.hoandat.com: the only thing Web Nhanh learns about the person. */
  sub: text('sub').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  /** Set by an admin: the account can sign in and read its sites, but nothing of it is published or built. */
  lockedAt: timestamp('locked_at', { withTimezone: true }),
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

/**
 * What the form of the live page takes: a shop's products (orders), or a wedding page's "Xác nhận tham dự" replies
 * (`rsvp`). A page with neither has no form, and its `order_form` is null.
 */
export interface OrderFormSpec {
  products: OrderFormProduct[];
  rsvp?: boolean;
}

/** One photo of a live page as it was rendered: enough to render the page again from the release's own files. */
export interface LivePageImage {
  id: string;
  width: number;
  height: number;
  widths: number[];
}

/**
 * The page that is live, as the last publish rendered it: its draft (the one published, not the one being edited),
 * its photos and its share picture (a file of the release). The worker renders it again from this (a wedding page's
 * countdown, once a day) without touching the draft or the uploads.
 */
export interface LivePage {
  draft: unknown;
  images: LivePageImage[];
  shareImage: { file: string; type: 'image/jpeg' | 'image/png'; width: number; height: number } | null;
}

export const SITE_KINDS = ['template', 'developer'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export const SITE_STATUSES = ['draft', 'published', 'pending-review', 'removed'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];


/**
 * A release copied under SITES_DIR but not live (`sites.pending_release_id`), and everything its approval writes: the
 * releases row, and for a template page its live page and form, for a build the build key.
 */
export interface PendingReview {
  reasons: ReviewReason[];
  /** What matched, for the admin: `index.html: <input type="password"`, `title: vietcombank`. At most 10. */
  matches: string[];
  heldAt: string;
  jobId: string;
  source: ReleaseSource;
  commitSha: string | null;
  bytes: number;
  fileCount: number;
  livePage: LivePage | null;
  orderForm: OrderFormSpec | null;
  buildKey: string | null;
}

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
    /** The live page as last published (`LivePage`); null for developer sites and before the first publish. */
    livePage: jsonb('live_page').$type<LivePage>(),
    /**
     * A release waiting for an admin (status `pending-review`): copied under releases/ but not `current`. The release
     * live before it (if any) stays live and keeps taking orders.
     */
    pendingReleaseId: uuid('pending_release_id'),
    pendingReview: jsonb('pending_review').$type<PendingReview>(),
    /**
     * Taken down by an admin (status `removed`): `current` points at the shared "removed" page
     * (`takedown_release_id`) while `current_release_id` keeps the release that was live, for a restore. Releases are
     * kept TAKEDOWN_KEEP_MS for review.
     */
    takenDownAt: timestamp('taken_down_at', { withTimezone: true }),
    takedownReleaseId: uuid('takedown_release_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('sites_account_idx').on(t.accountId),
    index('sites_pending_review_idx').on(t.status).where(sql`${t.status} = 'pending-review'`),
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
  /** A build step that did not have to run: `cached` (libraries reused), `not-needed` (plain HTML, nothing to build). */
  note?: 'cached' | 'not-needed';
}

/** What started a build: a person in the app, a push to the chosen branch, or a rename (the site moves address). */
export const BUILD_TRIGGERS = ['manual', 'push', 'rename'] as const;
export type BuildTrigger = (typeof BUILD_TRIGGERS)[number];

/**
 * The latest log line of a running build, read as a sentence by the waiting screen: a stable code with numbers (the
 * web app words it in the reader's language), or the raw line, shortened, when nothing better is known.
 */
export interface BuildProgress {
  code: 'install-packages' | 'install' | 'build-modules' | 'build-pages' | 'build' | 'line';
  n?: number;
  total?: number;
  text?: string;
}

/** What the check step learned of a build's output, for the tips beside the next wait and the finished screen. */
export interface BuildReport {
  title: string | null;
  hasDescription: boolean;
  /** Path of the og:image inside the output when it is a local file; null when missing or remote. */
  ogImage: string | null;
  hasOgImage: boolean;
  hasFavicon: boolean;
  /** The biggest pictures over 500 KB (at most 5). */
  largeImages: { path: string; bytes: number }[];
  bytes: number;
  fileCount: number;
  /** sha256 of the source (commit or zip) and settings built: the worker stores it as the site's last build. */
  buildKey: string;
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
    /** Builds: what started it. */
    trigger: text('trigger').$type<BuildTrigger>(),
    /** Builds: the commit pushed (from the webhook), then the commit actually built. */
    commitSha: text('commit_sha'),
    /** Builds: the framework found, for the estimate of the next first build of that framework. */
    framework: text('framework'),
    /**
     * Builds: when webnhanh-builder put the output in the staging directory and gave the job back to the queue for
     * webnhanh-worker to publish (`queued` again with this set). Null while the build itself is waiting or running.
     */
    readyAt: timestamp('ready_at', { withTimezone: true }),
    /** When a process last took the job: the builder, then the worker for a build's publish step. Stuck checks use it. */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** "Báo tôi khi xong": a push notification or Chat message when the job ends. */
    notify: boolean('notify').notNull().default(false),
    progress: jsonb('progress').$type<BuildProgress>(),
    /** Builds that failed: the log lines that show why (at most 20), beside the stable `error` code. */
    errorLines: jsonb('error_lines').$type<string[]>(),
    report: jsonb('report').$type<BuildReport>(),
  },
  (t) => [
    index('jobs_queue_idx').on(t.status, t.createdAt),
    index('jobs_site_idx').on(t.siteId, t.createdAt),
    // One job waiting or running per account at a time.
    uniqueIndex('jobs_one_active_per_account').on(t.accountId).where(sql`${t.status} in ('queued', 'running')`),
    check('jobs_type_check', sql`${t.type} in ('publish', 'build')`),
    check('jobs_trigger_check', sql`${t.trigger} is null or ${t.trigger} in ('manual', 'push', 'rename')`),
    check('jobs_status_check', sql`${t.status} in ('queued', 'running', 'done', 'failed', 'skipped')`),
  ],
);

/** Lines of a build log kept per job; a longer log keeps its first lines and says it was cut. */
export const JOB_LOG_MAX_LINES = 5_000;

/** The output of a build, line by line (ANSI colours and control characters removed), streamed to the owner. */
export const jobLogs = pgTable(
  'job_logs',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    line: text('line').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.seq] })],
);

export const DEVELOPER_SOURCES = ['git', 'zip'] as const;
export type DeveloperSource = (typeof DEVELOPER_SOURCES)[number];

/**
 * How a developer site is built, as the owner confirmed it (editable): the directory of the app inside the repo, the
 * build command (null: plain HTML, published as it is) and the output directory, both relative to `rootDir`.
 */
export interface BuildSettings {
  rootDir: string;
  buildCommand: string | null;
  outputDir: string;
}

/**
 * The source of a developer site (kind `developer`): a public GitHub or GitLab repo and its branch, or the last zip
 * uploaded (BUILD_INBOX_DIR/<site id>.zip). Pushes to the branch, signed with `webhook_secret`, wait in
 * `pending_push_at`/`pending_commit` (30 seconds, a newer push replacing an older one) before webnhanh-builder queues them.
 */
export const developerSites = pgTable(
  'developer_sites',
  {
    siteId: uuid('site_id')
      .primaryKey()
      .references(() => sites.id, { onDelete: 'cascade' }),
    source: text('source').$type<DeveloperSource>().notNull(),
    repoUrl: text('repo_url'),
    branch: text('branch'),
    settings: jsonb('settings').$type<BuildSettings>().notNull(),
    /** What the last check found (framework, package manager, warnings), shown beside the settings. */
    detection: jsonb('detection').$type<unknown>(),
    webhookSecret: text('webhook_secret'),
    /** sha256 of the commit (or zip) and settings of the last published build: the same again needs no build. */
    lastBuildKey: text('last_build_key'),
    pendingPushAt: timestamp('pending_push_at', { withTimezone: true }),
    pendingCommit: text('pending_commit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('developer_sites_pending_idx').on(t.pendingPushAt).where(sql`${t.pendingPushAt} is not null`),
    check('developer_sites_source_check', sql`${t.source} in ('git', 'zip')`),
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
 * `held_until`. The site that let it go can take it back. Deleting a site frees its names at once (the owner chose
 * to); `site_id` is nullable only so rows written before that rule keep their hold until they run out.
 */
export const siteNameHolds = pgTable(
  'site_name_holds',
  {
    name: text('name').primaryKey(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    heldUntil: timestamp('held_until', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('site_name_holds_site_idx').on(t.siteId)],
);

export const SITE_DELETION_STATUSES = ['queued', 'done', 'failed'] as const;
export type SiteDeletionStatus = (typeof SITE_DELETION_STATUSES)[number];

/**
 * Sites their owner deleted: the rows of the site are gone at once (with everything that cascades from it), and this
 * queue tells webnhanh-worker, the only writer of SITES_DIR, to take the names (`names`: the site's name and the old
 * names it still held) off the web and delete the site's photos. `build_ms` carries the build time the site used that
 * day, still counted against its account's day (`buildMsToday`). No foreign key on `site_id`: the site is gone.
 */
export const siteDeletions = pgTable(
  'site_deletions',
  {
    id: uuid('id').primaryKey(),
    siteId: uuid('site_id').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    names: jsonb('names').$type<string[]>().notNull(),
    buildMs: integer('build_ms').notNull().default(0),
    status: text('status').$type<SiteDeletionStatus>().notNull(),
    /** Stable code of a deletion the worker could not finish. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('site_deletions_queue_idx').on(t.createdAt).where(sql`${t.status} = 'queued'`),
    index('site_deletions_account_idx').on(t.accountId, t.createdAt),
    check('site_deletions_status_check', sql`${t.status} in ('queued', 'done', 'failed')`),
  ],
);

export const SUBMISSION_KINDS = ['order', 'rsvp'] as const;
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

/** A wedding guest's reply ("Xác nhận tham dự"), as checked by `rsvpInputSchema`. */
export interface RsvpData {
  name: string;
  /** Normalized Vietnamese number, or '' when the guest left it out. */
  phone: string;
  attending: 'yes' | 'no';
  /** People coming, the guest included. */
  guests: number;
  note: string;
}

/** A submission's data read by its kind. */
export type SubmissionContent = { readonly kind: 'order'; readonly data: OrderData } | { readonly kind: 'rsvp'; readonly data: RsvpData };

/**
 * What visitors sent through a published page's form: an order of a shop page, or a reply to a wedding invitation.
 * The owner sees them in the app; `handled_at` is set when the owner marks one done. No IP address or other trace of
 * the visitor is kept.
 */
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').primaryKey(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<SubmissionKind>().notNull(),
    /** `OrderData` or `RsvpData` by `kind` (read it with `submissionContent`). */
    data: jsonb('data').$type<OrderData | RsvpData>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [
    index('submissions_site_idx').on(t.siteId, t.createdAt),
    index('submissions_open_idx').on(t.siteId).where(sql`${t.handledAt} is null`),
    check('submissions_kind_check', sql`${t.kind} in ('order', 'rsvp')`),
  ],
);

/**
 * The data of a submission by its kind. The two only ever go in together (`recordSubmission` of the server writes
 * the data checked for its kind), so `kind` tells which shape `data` has.
 */
export function submissionContent(row: { readonly kind: SubmissionKind; readonly data: OrderData | RsvpData }): SubmissionContent {
  return row.kind === 'rsvp' ? { kind: 'rsvp', data: row.data as RsvpData } : { kind: 'order', data: row.data as OrderData };
}

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
 * The outbox of notifications: one row per new order (`submission_id`), finished build the owner asked to hear about
 * (`job_id`), abuse report (`report_id`, to the admins) or release held for review (`review_site_id`, to the admins),
 * and per place it goes (a push subscription, the linked chat), written in the same transaction as what it tells of.
 * A sender picks due rows, and a failure only moves that row's next attempt: one channel failing never holds back
 * another, nor the order. `dropped`: the target went away (subscription expired, chat unlinked), or what it told of
 * did (a review already decided).
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey(),
    submissionId: uuid('submission_id').references(() => submissions.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id').references(() => abuseReports.id, { onDelete: 'cascade' }),
    reviewSiteId: uuid('review_site_id').references(() => sites.id, { onDelete: 'cascade' }),
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
    index('notification_deliveries_job_idx').on(t.jobId),
    check('notification_deliveries_subject_check', sql`num_nonnulls(${t.submissionId}, ${t.jobId}, ${t.reportId}, ${t.reviewSiteId}) = 1`),
    check('notification_deliveries_channel_check', sql`${t.channel} in ('push', 'chat')`),
    check('notification_deliveries_status_check', sql`${t.status} in ('pending', 'sent', 'failed', 'dropped')`),
  ],
);


export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * Reports of abuse from the public form (`/bao-cao`): no sign-in, so nothing about the sender is kept but what they
 * chose to give (`contact`); no IP address. The site is kept by name as typed and by id while it exists.
 */
export const abuseReports = pgTable(
  'abuse_reports',
  {
    id: uuid('id').primaryKey(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    siteName: text('site_name').notNull(),
    category: text('category').$type<AbuseCategory>().notNull(),
    details: text('details').notNull(),
    contact: text('contact'),
    status: text('status').$type<ReportStatus>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [
    index('abuse_reports_status_idx').on(t.status, t.createdAt),
    index('abuse_reports_site_idx').on(t.siteId),
    check('abuse_reports_category_check', sql`${t.category} in ('scam', 'malware', 'illegal', 'spam', 'copyright', 'other')`),
    check('abuse_reports_status_check', sql`${t.status} in ('open', 'resolved', 'dismissed')`),
  ],
);

export const ADMIN_ACTIONS = ['takedown', 'restore', 'approve', 'reject', 'lock', 'unlock', 'resolve', 'dismiss'] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/** Admin actions that change files under SITES_DIR: applied by webnhanh-worker, the only writer there. */
export const WORKER_ADMIN_ACTIONS = ['takedown', 'restore', 'approve', 'reject'] as const satisfies readonly AdminAction[];

export const ADMIN_ACTION_STATUSES = ['queued', 'done', 'failed'] as const;
export type AdminActionStatus = (typeof ADMIN_ACTION_STATUSES)[number];

/**
 * The audit log of every admin action, and the queue of those the worker applies (`queued` until it did). Rows are
 * never deleted, and outlive the site, account or report they name (ids set null, the site's name kept).
 */
export const adminActions = pgTable(
  'admin_actions',
  {
    id: uuid('id').primaryKey(),
    adminAccountId: uuid('admin_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    action: text('action').$type<AdminAction>().notNull(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    siteName: text('site_name'),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    reportId: uuid('report_id').references(() => abuseReports.id, { onDelete: 'set null' }),
    note: text('note'),
    status: text('status').$type<AdminActionStatus>().notNull(),
    /** Stable code of a worker action that could not be applied. */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('admin_actions_created_idx').on(t.createdAt),
    index('admin_actions_queue_idx').on(t.createdAt).where(sql`${t.status} = 'queued'`),
    check('admin_actions_action_check', sql`${t.action} in ('takedown', 'restore', 'approve', 'reject', 'lock', 'unlock', 'resolve', 'dismiss')`),
    check('admin_actions_status_check', sql`${t.status} in ('queued', 'done', 'failed')`),
  ],
);

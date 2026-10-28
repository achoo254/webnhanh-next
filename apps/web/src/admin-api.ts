/**
 * The public abuse report (apps/server/src/abuse/report-routes.ts) and the admin API
 * (apps/server/src/admin/admin-routes.ts) as the web app uses them. Responses are checked against their shape.
 */
import { ABUSE_CATEGORIES, REVIEW_REASONS } from '@webnhanh/db/admin-codes';
import { z } from 'zod';
import { ApiError, call } from './api';

export { ABUSE_CATEGORIES, REVIEW_REASONS };
export type AbuseCategory = (typeof ABUSE_CATEGORIES)[number];

export interface ReportInput {
  readonly site: string;
  readonly category: AbuseCategory;
  readonly details: string;
  readonly contact: string;
  /** The hidden trap field: a person leaves it empty. */
  readonly website: string;
  /** Milliseconds from the first touch of the form. */
  readonly elapsed: number;
}

export async function submitReport(input: ReportInput): Promise<void> {
  await call('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
}

const reviewSchema = z.object({ reasons: z.array(z.enum(REVIEW_REASONS)), matches: z.array(z.string()), heldAt: z.string() });

const adminSiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  template: z.string().nullable(),
  status: z.string(),
  published: z.boolean(),
  accountId: z.string(),
  accountLocked: z.boolean(),
  takenDownAt: z.string().nullable(),
  review: reviewSchema.nullable(),
  actionQueued: z.boolean(),
});
export type AdminSite = z.infer<typeof adminSiteSchema>;

const reportSchema = z.object({
  id: z.string(),
  siteName: z.string(),
  category: z.enum(ABUSE_CATEGORIES),
  details: z.string(),
  contact: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  handledAt: z.string().nullable(),
  site: adminSiteSchema.nullable(),
});
export type Report = z.infer<typeof reportSchema>;

const actionSchema = z.object({
  id: z.string(),
  action: z.string(),
  adminAccountId: z.string().nullable(),
  siteId: z.string().nullable(),
  siteName: z.string().nullable(),
  accountId: z.string().nullable(),
  reportId: z.string().nullable(),
  note: z.string().nullable(),
  status: z.string(),
  error: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export type AdminActionView = z.infer<typeof actionSchema>;

function parsed<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(500, 'bad-response');
  return result.data;
}

export async function listReports(which: 'open' | 'all'): Promise<Report[]> {
  return parsed(z.object({ reports: z.array(reportSchema) }), await call(`/api/admin/reports?status=${which}`)).reports;
}

export async function listReviews(): Promise<AdminSite[]> {
  return parsed(z.object({ sites: z.array(adminSiteSchema) }), await call('/api/admin/reviews')).sites;
}

export async function listActions(): Promise<AdminActionView[]> {
  return parsed(z.object({ actions: z.array(actionSchema) }), await call('/api/admin/actions')).actions;
}

export async function findSite(name: string): Promise<AdminSite> {
  return parsed(z.object({ site: adminSiteSchema }), await call(`/api/admin/sites?${new URLSearchParams({ name }).toString()}`)).site;
}

/** Every admin action, by the path it posts to. */
export type AdminCommand =
  | { readonly kind: 'site'; readonly action: 'takedown' | 'restore' | 'approve' | 'reject'; readonly siteId: string; readonly reportId?: string }
  | { readonly kind: 'account'; readonly action: 'lock' | 'unlock'; readonly accountId: string }
  | { readonly kind: 'report'; readonly action: 'resolve' | 'dismiss'; readonly reportId: string };

function commandPath(command: AdminCommand): string {
  if (command.kind === 'site') return `/api/admin/sites/${encodeURIComponent(command.siteId)}/${command.action}`;
  if (command.kind === 'account') return `/api/admin/accounts/${encodeURIComponent(command.accountId)}/${command.action}`;
  return `/api/admin/reports/${encodeURIComponent(command.reportId)}/${command.action}`;
}

export async function runAdminCommand(command: AdminCommand, note: string): Promise<AdminActionView> {
  const payload = { note, ...(command.kind === 'site' && command.reportId ? { reportId: command.reportId } : {}) };
  const body = await call(commandPath(command), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return parsed(z.object({ action: actionSchema }), body).action;
}

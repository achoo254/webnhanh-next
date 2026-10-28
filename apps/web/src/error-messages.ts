import type { IssueCode } from '@webnhanh/templates';
import { ApiError } from './api';
import { isMessageKey, type MessageKey } from './i18n';

/** The sentence for a refused call, by the server's stable code. */
const BY_CODE: Readonly<Record<string, MessageKey>> = {
  'name-format': 'name.format',
  'name-reserved': 'name.reserved',
  'name-sensitive': 'name.sensitive',
  'name-taken': 'name.taken',
  'site-limit': 'error.siteLimit',
  'job-active': 'error.jobActive',
  'rename-limit': 'error.renameLimit',
  'site-not-found': 'error.notFound',
  'unknown-template': 'error.unknownTemplate',
  'image-type': 'image.type',
  'too-large': 'image.tooLarge',
  'image-too-big': 'image.tooBig',
  'image-unreadable': 'image.unreadable',
  'site-full': 'image.siteFull',
  network: 'error.network',
  'too-many-requests': 'error.tooMany',
  'repo-url': 'deploy.error.repoUrl',
  'repo-not-found': 'deploy.error.repoNotFound',
  'branch-not-found': 'deploy.error.branchNotFound',
  branch: 'deploy.error.branch',
  'root-dir': 'deploy.error.rootDir',
  'repo-unreachable': 'deploy.error.unreachable',
  'build-settings': 'deploy.error.settings',
  'developer-site-limit': 'deploy.error.siteLimit',
  'daily-limit': 'deploy.error.dailyLimit',
  'queue-full': 'deploy.error.queueFull',
  'zip-missing': 'deploy.error.zipMissing',
  'zip-off': 'deploy.error.zipOff',
  'zip-invalid': 'fail.zip-invalid',
  'zip-unsafe': 'fail.zip-unsafe',
  'zip-too-large': 'fail.zip-too-large',
  'account-locked': 'error.accountLocked',
  'site-removed': 'error.siteRemoved',
  'report-site-unknown': 'report.error.siteUnknown',
  'too-fast': 'report.error.tooFast',
};

export function errorMessage(error: unknown): MessageKey {
  if (error instanceof ApiError) return BY_CODE[error.code] ?? 'error.generic';
  if (error instanceof TypeError) return 'error.network';
  return 'error.generic';
}

/** Why a draft cannot be published yet, for every template, by its issue code. */
export const ISSUE_MESSAGES: Readonly<Record<IssueCode, MessageKey>> = {
  required: 'issue.required',
  'no-products': 'issue.noProducts',
  'no-events': 'issue.noEvents',
  'no-menu': 'issue.noMenu',
  'no-links': 'issue.noLinks',
  'no-contact': 'issue.noContact',
  'invalid-zalo': 'issue.zalo',
  'invalid-phone': 'issue.phone',
  'invalid-facebook': 'issue.facebook',
  'invalid-email': 'issue.email',
  'invalid-tiktok': 'issue.tiktok',
  'invalid-instagram': 'issue.instagram',
  'invalid-youtube': 'issue.youtube',
  'invalid-url': 'issue.url',
  'invalid-map': 'issue.map',
};

/** Why a publish job failed, by its error code. */
export function jobFailureMessage(code: string | null): MessageKey {
  if (code === 'draft-invalid') return 'publish.failed.draft';
  if (code === 'image-missing') return 'publish.failed.image';
  if (code === 'too-large') return 'publish.failed.tooLarge';
  if (code === 'account-locked') return 'error.accountLocked';
  if (code === 'site-removed') return 'error.siteRemoved';
  return 'publish.failed.generic';
}

/** Why a build failed, by its error code: the cause and what to do about it. */
const BUILD_FAILURES: Readonly<Record<string, MessageKey>> = {
  'build-timeout': 'fail.build-timeout',
  'build-oom': 'fail.build-oom',
  lockfile: 'fail.lockfile',
  'install-failed': 'fail.install-failed',
  'build-failed': 'fail.build-failed',
  'output-missing': 'fail.output-missing',
  'output-no-index': 'fail.output-no-index',
  'output-too-large': 'fail.output-too-large',
  'too-large': 'fail.output-too-large',
  'output-unsafe': 'fail.output-unsafe',
  'fetch-failed': 'fail.fetch-failed',
  'repo-too-large': 'fail.repo-too-large',
  'zip-invalid': 'fail.zip-invalid',
  'zip-unsafe': 'fail.zip-unsafe',
  'zip-too-large': 'fail.zip-too-large',
  unsupported: 'fail.unsupported',
  'docker-unavailable': 'fail.docker-unavailable',
  'settings-invalid': 'fail.settings-invalid',
  stuck: 'fail.stuck',
  'account-locked': 'error.accountLocked',
  'site-removed': 'error.siteRemoved',
};

export function buildFailureMessage(code: string | null): MessageKey {
  return (code !== null ? BUILD_FAILURES[code] : undefined) ?? 'fail.generic';
}

/** A detection warning (also the notes of an `unsupported` failure) as a sentence; null for an unknown one. */
export function warningMessage(code: string): MessageKey | null {
  const key = `warning.${code}`;
  return isMessageKey(key) ? key : null;
}

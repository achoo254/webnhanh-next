import type { ShopIssue } from '@trang/templates';
import { ApiError } from './api';
import type { MessageKey } from './i18n';

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
  'image-type': 'image.type',
  'too-large': 'image.tooLarge',
  'image-too-big': 'image.tooBig',
  'image-unreadable': 'image.unreadable',
  'site-full': 'image.siteFull',
  network: 'error.network',
};

export function errorMessage(error: unknown): MessageKey {
  if (error instanceof ApiError) return BY_CODE[error.code] ?? 'error.generic';
  if (error instanceof TypeError) return 'error.network';
  return 'error.generic';
}

export const ISSUE_MESSAGES: Readonly<Record<ShopIssue['code'], MessageKey>> = {
  required: 'issue.required',
  'no-products': 'issue.noProducts',
  'invalid-zalo': 'issue.zalo',
  'invalid-phone': 'issue.phone',
  'invalid-facebook': 'issue.facebook',
};

/** Why a publish job failed, by its error code. */
export function jobFailureMessage(code: string | null): MessageKey {
  if (code === 'draft-invalid') return 'publish.failed.draft';
  if (code === 'image-missing') return 'publish.failed.image';
  if (code === 'too-large') return 'publish.failed.tooLarge';
  return 'publish.failed.generic';
}

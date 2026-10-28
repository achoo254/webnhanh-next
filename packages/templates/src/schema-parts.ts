/**
 * Pieces every template's draft schema is made of, and the publish checks they share. A draft schema checks shapes and
 * lengths only, so a half-filled form can always be saved and previewed; `<template>PublishIssues` then says what a
 * page needs before it may go out.
 */
import { z } from 'zod';
import { facebookLink, phoneLink, zaloLink } from './contact-links';
import { isPlainText } from './html';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** One line of text, no control characters. */
export const line = (max: number) => z.string().max(max).refine((v) => isPlainText(v, false), 'control-characters');
/** Text that may have line breaks. */
export const lines = (max: number) => z.string().max(max).refine((v) => isPlainText(v, true), 'control-characters');
/** A photo of the site (`site_images.id`). */
export const imageId = z.string().regex(UUID);
/** A photo of the site, or null for none. */
export const imageRef = imageId.nullable();
/** Stable id made by the editor, for lists that reorder. */
export const itemKey = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);

/** True when every item of `items` has its own `key`. */
export function uniqueKeys(items: readonly { key: string }[]): boolean {
  return new Set(items.map((item) => item.key)).size === items.length;
}

export const CONTACT_LIMIT = 200;

/** Phone, Zalo and Facebook as the owner typed them; turned into links by `contact-links.ts` only. */
export const contactsSchema = z
  .object({
    zalo: line(CONTACT_LIMIT),
    phone: line(CONTACT_LIMIT),
    facebook: line(CONTACT_LIMIT),
  })
  .strict();
export type Contacts = z.infer<typeof contactsSchema>;

export const EMPTY_CONTACTS: Contacts = { zalo: '', phone: '', facebook: '' };

/** Why a draft of any template cannot be published yet. */
export type IssueCode =
  | 'required'
  | 'no-products'
  | 'no-events'
  | 'no-menu'
  | 'no-links'
  | 'no-contact'
  | 'invalid-zalo'
  | 'invalid-phone'
  | 'invalid-facebook'
  | 'invalid-email'
  | 'invalid-tiktok'
  | 'invalid-instagram'
  | 'invalid-youtube'
  | 'invalid-url'
  | 'invalid-map';

/** The field (a dotted path, as the editor names its inputs) and the reason. */
export interface TemplateIssue {
  readonly field: string;
  readonly code: IssueCode;
}

export interface ContactIssue extends TemplateIssue {
  readonly code: 'invalid-zalo' | 'invalid-phone' | 'invalid-facebook';
}

/** A typed contact that is not a phone number, Zalo or Facebook address (empty ones are fine). */
export function contactIssues(contacts: Contacts, prefix = 'contacts'): ContactIssue[] {
  const issues: ContactIssue[] = [];
  const { zalo, phone, facebook } = contacts;
  if (zalo.trim() && !zaloLink(zalo)) issues.push({ field: `${prefix}.zalo`, code: 'invalid-zalo' });
  if (phone.trim() && !phoneLink(phone)) issues.push({ field: `${prefix}.phone`, code: 'invalid-phone' });
  if (facebook.trim() && !facebookLink(facebook)) issues.push({ field: `${prefix}.facebook`, code: 'invalid-facebook' });
  return issues;
}

/** True when at least one contact is a working link. */
export function hasContact(contacts: Contacts): boolean {
  return Boolean(zaloLink(contacts.zalo) || phoneLink(contacts.phone) || facebookLink(contacts.facebook));
}

/** `required` for `field` when `value` is blank. */
export function requireText(value: string, field: string): TemplateIssue[] {
  return value.trim() ? [] : [{ field, code: 'required' }];
}

/** A sample photo shipped in `samples/`, copied into every new site of its template. */
export interface SamplePhoto {
  readonly file: string;
  readonly width: number;
  readonly height: number;
}

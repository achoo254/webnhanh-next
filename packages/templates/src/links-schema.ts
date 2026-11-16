/**
 * The link-in-bio page (the link to put in a TikTok, Instagram or Zalo bio): a banner, an avatar, a name with a
 * handle and a short bio, quick contact buttons (Zalo, a call, Facebook through `contact-links.ts`), and a list of
 * links as large buttons, the first one highlighted.
 */
import { z } from 'zod';
import { STYLE_IDS, type StyleId } from './looks';
import { ALL_PALETTE_IDS } from './palettes';
import { linkListIssues, profileLinkSchema } from './profile-schema';
import { contactIssues, contactsSchema, EMPTY_CONTACTS, hasContact, imageRef, line, lines, requireText, uniqueKeys, type TemplateIssue } from './schema-parts';

export const LINKS_TEMPLATE = 'links';

/** `photos`: the most pictures a page shows (the avatar and the banner). */
export const LINKS_LIMITS = { name: 80, handle: 40, bio: 300, links: 20, photos: 2 } as const;

export const LINKS_DEFAULT_STYLE: StyleId = 'ruc-ro';

export const linksDraftSchema = z
  .object({
    name: line(LINKS_LIMITS.name),
    /** "@minhthu.daily", shown under the name as typed. */
    handle: line(LINKS_LIMITS.handle),
    bio: lines(LINKS_LIMITS.bio),
    avatar: imageRef,
    /** The banner across the top. */
    cover: imageRef,
    /** Same links as the profile page: a button text and an https address each. */
    links: z.array(profileLinkSchema).max(LINKS_LIMITS.links),
    contacts: contactsSchema,
    palette: z.enum(ALL_PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(LINKS_DEFAULT_STYLE),
  })
  .strict()
  .refine((draft) => uniqueKeys(draft.links), 'duplicate-link-key');

export type LinksDraft = z.infer<typeof linksDraftSchema>;

export function linksPublishIssues(draft: LinksDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [...requireText(draft.name, 'name'), ...linkListIssues(draft.links), ...contactIssues(draft.contacts)];
  // A page of nothing to tap is no use: at least one link or one working contact.
  if (draft.links.length === 0 && !hasContact(draft.contacts) && issues.every((issue) => !issue.field.startsWith('contacts.'))) {
    issues.push({ field: 'links', code: 'no-links' });
  }
  return issues;
}

/** Every photo the draft shows, the avatar first, each once. */
export function linksImageIds(draft: LinksDraft): string[] {
  const ids = [draft.avatar, draft.cover].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/** No sample photo of its own: a new page starts from one of its variants, whose pictures it gets. */
export const LINKS_SAMPLES = {} as const;

/** A new page: two links named for the owner to give their addresses (or remove), every other text left to them. */
export function newLinksDraft(samples: { avatar: string | null; cover: string | null } = { avatar: null, cover: null }): LinksDraft {
  return {
    name: '',
    handle: '',
    bio: '',
    avatar: samples.avatar,
    cover: samples.cover,
    links: [
      { key: 'l1', label: 'Video mới nhất của mình', url: '' },
      { key: 'l2', label: 'Đặt lịch, hợp tác', url: '' },
    ],
    contacts: { ...EMPTY_CONTACTS },
    palette: 'berry',
    style: LINKS_DEFAULT_STYLE,
  };
}

/** A filled-in page, for previews of the template and its variants. Names, numbers and addresses are made up. */
export function sampleLinksDraft(samples: { avatar: string | null; cover: string | null } = { avatar: null, cover: null }): LinksDraft {
  return {
    ...newLinksDraft(samples),
    name: 'Minh Thư',
    handle: '@minhthu.daily',
    bio: 'Dân văn phòng ban ngày, review đồ ăn ban đêm. Link gì cần thì ở dưới hết nha.',
    links: [
      { key: 'l1', label: 'Video mới nhất trên TikTok', url: 'https://www.tiktok.com/@minhthu.daily' },
      { key: 'l2', label: 'List quán ngon Sài Gòn', url: 'https://minhthu.hoandat.io.vn' },
      { key: 'l3', label: 'Hợp tác, booking review', url: 'https://forms.gle/hop-tac-minh-thu' },
    ],
    contacts: { zalo: '0912345678', phone: '', facebook: 'minhthu.daily' },
  };
}

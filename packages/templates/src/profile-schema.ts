/**
 * The personal profile / link-in-bio page: a photo, a name, a line about the person, a short bio, a list of labelled
 * links (https only) and social accounts.
 */
import { z } from 'zod';
import { facebookLink, phoneLink, zaloLink } from './contact-links';
import { STYLE_IDS, type StyleId } from './looks';
import { ALL_PALETTE_IDS } from './palettes';
import { CONTACT_LIMIT, imageRef, itemKey, line, lines, requireText, uniqueKeys, type IssueCode, type TemplateIssue } from './schema-parts';
import { emailLink, instagramLink, tiktokLink, WEB_LINK_MAX, webLink, youtubeLink } from './web-links';
import type { ContactLink } from './contact-links';

export const PROFILE_TEMPLATE = 'profile';

export const PROFILE_LIMITS = { name: 80, headline: 120, bio: 500, label: 60, url: WEB_LINK_MAX, links: 20 } as const;

export const PROFILE_DEFAULT_STYLE: StyleId = 'ruc-ro';

export const profileLinkSchema = z
  .object({
    key: itemKey,
    label: line(PROFILE_LIMITS.label),
    /** An https address (`https://` may be left out); checked by `webLink`. */
    url: line(PROFILE_LIMITS.url),
  })
  .strict();

/** Social accounts in the order the page shows them. */
export const SOCIAL_KEYS = ['facebook', 'instagram', 'tiktok', 'youtube', 'zalo', 'phone', 'email'] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];

export const profileSocialsSchema = z.object(Object.fromEntries(SOCIAL_KEYS.map((key) => [key, line(CONTACT_LIMIT)])) as Record<SocialKey, ReturnType<typeof line>>).strict();

export const profileDraftSchema = z
  .object({
    name: line(PROFILE_LIMITS.name),
    /** "Thợ làm bánh ở Đà Lạt". */
    headline: line(PROFILE_LIMITS.headline),
    bio: lines(PROFILE_LIMITS.bio),
    avatar: imageRef,
    links: z.array(profileLinkSchema).max(PROFILE_LIMITS.links),
    socials: profileSocialsSchema,
    palette: z.enum(ALL_PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(PROFILE_DEFAULT_STYLE),
  })
  .strict()
  .refine((draft) => uniqueKeys(draft.links), 'duplicate-link-key');

export type ProfileDraft = z.infer<typeof profileDraftSchema>;
export type ProfileLink = z.infer<typeof profileLinkSchema>;
export type ProfileSocials = z.infer<typeof profileSocialsSchema>;

/** How each social account becomes a link, and the issue when it cannot. */
export const SOCIAL_LINKS: Readonly<Record<SocialKey, { readonly link: (input: string) => ContactLink | null; readonly invalid: IssueCode }>> = {
  facebook: { link: facebookLink, invalid: 'invalid-facebook' },
  instagram: { link: instagramLink, invalid: 'invalid-instagram' },
  tiktok: { link: tiktokLink, invalid: 'invalid-tiktok' },
  youtube: { link: youtubeLink, invalid: 'invalid-youtube' },
  zalo: { link: zaloLink, invalid: 'invalid-zalo' },
  phone: { link: phoneLink, invalid: 'invalid-phone' },
  email: { link: emailLink, invalid: 'invalid-email' },
};

export function profilePublishIssues(draft: ProfileDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [...requireText(draft.name, 'name')];
  draft.links.forEach((link, index) => {
    issues.push(...requireText(link.label, `links.${index}.label`));
    if (!link.url.trim()) issues.push({ field: `links.${index}.url`, code: 'required' });
    else if (!webLink(link.url)) issues.push({ field: `links.${index}.url`, code: 'invalid-url' });
  });
  let socials = 0;
  for (const key of SOCIAL_KEYS) {
    const value = draft.socials[key];
    if (!value.trim()) continue;
    socials += 1;
    if (!SOCIAL_LINKS[key].link(value)) issues.push({ field: `socials.${key}`, code: SOCIAL_LINKS[key].invalid });
  }
  if (draft.links.length === 0 && socials === 0) issues.push({ field: 'links', code: 'no-links' });
  return issues;
}

export function profileImageIds(draft: ProfileDraft): string[] {
  return draft.avatar ? [draft.avatar] : [];
}

export const EMPTY_SOCIALS: ProfileSocials = { facebook: '', instagram: '', tiktok: '', youtube: '', zalo: '', phone: '', email: '' };

/** No sample photo yet: until the art library has portraits, the page shows the name's initials. */
export const PROFILE_SAMPLES = {} as const;

/** A new page: two empty links, every text left to the owner. */
export function newProfileDraft(): ProfileDraft {
  return {
    name: '',
    headline: '',
    bio: '',
    avatar: null,
    links: [
      { key: 'l1', label: '', url: '' },
      { key: 'l2', label: '', url: '' },
    ],
    socials: { ...EMPTY_SOCIALS },
    palette: 'berry',
    style: PROFILE_DEFAULT_STYLE,
  };
}

/** A filled-in page, for previews of the template and its variants. */
export function sampleProfileDraft(): ProfileDraft {
  return {
    ...newProfileDraft(),
    name: 'Lan Anh',
    headline: 'Thợ làm bánh tại gia ở Đà Lạt',
    bio: 'Mình làm bánh mì nguyên cám và bánh ngọt ít đường, nướng theo mẻ nhỏ mỗi sáng. Ở đây có lớp học, công thức và chỗ đặt bánh.',
    links: [
      { key: 'l1', label: 'Đặt bánh tuần này', url: 'https://banhcualan.hoandat.io.vn' },
      { key: 'l2', label: 'Lớp làm bánh cuối tuần', url: 'https://forms.gle/lop-lam-banh' },
      { key: 'l3', label: 'Công thức bánh mì nguyên cám', url: 'https://lananh.blog/banh-mi-nguyen-cam' },
    ],
    socials: { ...EMPTY_SOCIALS, facebook: 'banhcualan', instagram: '@banhcualan', tiktok: '@banhcualan', zalo: '0912345678' },
  };
}

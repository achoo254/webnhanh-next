/**
 * The wedding invitation: the couple, the day (and its lunar date as typed), up to four events (ceremony, party…) each
 * with its venue and a map link, a photo gallery, and "Xác nhận tham dự".
 */
import { z } from 'zod';
import { STYLE_IDS, type StyleId } from './looks';
import { ALL_PALETTE_IDS } from './palettes';
import {
  contactIssues,
  contactsSchema,
  EMPTY_CONTACTS,
  imageId,
  imageRef,
  itemKey,
  line,
  lines,
  requireText,
  uniqueKeys,
  type SamplePhoto,
  type TemplateIssue,
} from './schema-parts';
import { mapLink } from './web-links';

export const WEDDING_TEMPLATE = 'wedding';

export const WEDDING_LIMITS = {
  name: 40,
  intro: 600,
  lunarDate: 60,
  label: 60,
  venue: 120,
  address: 200,
  rsvpNote: 200,
  events: 4,
  gallery: 12,
  ornaments: 2,
  /** Lines of parents per family ("Ông Trần Văn A", "Bà Nguyễn Thị B") and the length of each. */
  parents: 2,
  parent: 60,
  story: 6,
  storyTitle: 80,
  storyText: 300,
  filmTitle: 40,
  tagline: 80,
} as const;

/** How the invitation is laid out: the card of the looks ('standard'), or the "Rạp phim" page ('cinema'). */
export const WEDDING_LAYOUTS = ['standard', 'cinema'] as const;
export type WeddingLayout = (typeof WEDDING_LAYOUTS)[number];

/** The two families: the groom's ("nhà trai") and the bride's ("nhà gái"). */
export const WEDDING_SIDES = ['trai', 'gai'] as const;
export type WeddingSide = (typeof WEDDING_SIDES)[number];
/** Who sends the invitation: one family, or both together ('chung', the default of a draft without it). */
export const WEDDING_HOST_SIDES = ['trai', 'gai', 'chung'] as const;
export type WeddingHostSide = (typeof WEDDING_HOST_SIDES)[number];
/** Which guests an event is for: '' everyone, or one family's guests. */
export const weddingSideField = z.enum(['', ...WEDDING_SIDES]);

export const WEDDING_DEFAULT_STYLE: StyleId = 'tinh-te';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written `YYYY-MM-DD` (what `<input type="date">` gives). */
export function isIsoDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** `HH:MM`, 24-hour (what `<input type="time">` gives). */
export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** True for a real month written `YYYY-MM` (what `<input type="month">` gives). */
export function isIsoMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** A day as `<input type="date">` gives it, or '' (shared by the templates with a date). */
export const dateField = z.string().refine((v) => v === '' || isIsoDate(v), 'invalid-date');
/** A time as `<input type="time">` gives it, or ''. */
export const timeField = z.string().refine((v) => v === '' || isTime(v), 'invalid-time');

export const weddingEventSchema = z
  .object({
    key: itemKey,
    /** "Lễ thành hôn", "Tiệc cưới nhà gái". */
    label: line(WEDDING_LIMITS.label),
    /** '' for the wedding day. */
    date: dateField,
    time: timeField,
    venue: line(WEDDING_LIMITS.venue),
    /** An address or a pasted Google Maps link; becomes the "Chỉ đường" link (`mapLink`). */
    address: line(WEDDING_LIMITS.address),
    /** Which family's guests it is for; left out (drafts before it) is '' (everyone). */
    side: weddingSideField.optional(),
  })
  .strict();

/** The parents named at the head of the invitation, up to two lines per family. */
export const weddingParentsSchema = z
  .object({
    groom: z.array(line(WEDDING_LIMITS.parent)).max(WEDDING_LIMITS.parents),
    bride: z.array(line(WEDDING_LIMITS.parent)).max(WEDDING_LIMITS.parents),
  })
  .strict();

/** One moment of the couple's story ("Lần đầu gặp nhau"), with its month and an optional photo. */
export const weddingStorySchema = z
  .object({
    key: itemKey,
    /** `YYYY-MM`, or '' for no date. */
    when: z.string().refine((v) => v === '' || isIsoMonth(v), 'invalid-month'),
    title: line(WEDDING_LIMITS.storyTitle),
    text: lines(WEDDING_LIMITS.storyText),
    photo: imageRef.optional(),
  })
  .strict();

export const weddingDraftSchema = z
  .object({
    groom: line(WEDDING_LIMITS.name),
    bride: line(WEDDING_LIMITS.name),
    intro: lines(WEDDING_LIMITS.intro),
    date: dateField,
    /** As the couple writes it: "Tức ngày 23 tháng 10 năm Bính Ngọ". */
    lunarDate: line(WEDDING_LIMITS.lunarDate),
    cover: imageRef,
    events: z.array(weddingEventSchema).max(WEDDING_LIMITS.events),
    gallery: z.array(imageId).max(WEDDING_LIMITS.gallery),
    rsvp: z.boolean(),
    /** "Mong bạn báo trước ngày 1/12 để nhà hàng chuẩn bị chu đáo." */
    rsvpNote: line(WEDDING_LIMITS.rsvpNote),
    contacts: contactsSchema,
    palette: z.enum(ALL_PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(WEDDING_DEFAULT_STYLE),
    /** Decorations drawn for the template's variant (a floral corner); without them the card draws its own sprigs. */
    ornaments: z.array(imageId).max(WEDDING_LIMITS.ornaments).optional(),
    /**
     * Who sends the invitation; it orders the families on the card. Drafts saved before it have none and render as they
     * always did (no parents, story, calendar links or guest side); the editor sets it on the first change.
     */
    hostSide: z.enum(WEDDING_HOST_SIDES).optional(),
    parents: weddingParentsSchema.optional(),
    story: z.array(weddingStorySchema).max(WEDDING_LIMITS.story).optional(),
    /** Left out (drafts before it) is 'standard'. Switching keeps every field: each layout shows what it uses. */
    layout: z.enum(WEDDING_LAYOUTS).optional(),
    /** The "Rạp phim" layout's film title and tagline; empty ones show the layout's own. */
    filmTitle: line(WEDDING_LIMITS.filmTitle).optional(),
    tagline: line(WEDDING_LIMITS.tagline).optional(),
    /** The couple's portraits in the "Rạp phim" cast; without one the cast shows the initial. */
    portraits: z.object({ groom: imageRef.optional(), bride: imageRef.optional() }).strict().optional(),
  })
  .strict()
  .refine((draft) => uniqueKeys(draft.events), 'duplicate-event-key')
  .refine((draft) => uniqueKeys(draft.story ?? []), 'duplicate-story-key');

export type WeddingDraft = z.infer<typeof weddingDraftSchema>;
export type WeddingEvent = z.infer<typeof weddingEventSchema>;
export type WeddingParents = z.infer<typeof weddingParentsSchema>;
export type WeddingStory = z.infer<typeof weddingStorySchema>;

export function weddingPublishIssues(draft: WeddingDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [...requireText(draft.groom, 'groom'), ...requireText(draft.bride, 'bride'), ...requireText(draft.date, 'date')];
  if (draft.events.length === 0) issues.push({ field: 'events', code: 'no-events' });
  draft.events.forEach((event, index) => {
    issues.push(...requireText(event.label, `events.${index}.label`));
    if (!event.venue.trim() && !event.address.trim()) issues.push({ field: `events.${index}.venue`, code: 'required' });
    if (event.address.trim() && !mapLink(event.address)) issues.push({ field: `events.${index}.address`, code: 'invalid-map' });
  });
  // Replies go through the page's form (`rsvpForm`), so contacts are optional; typed ones must work.
  issues.push(...contactIssues(draft.contacts));
  return issues;
}

/** Every photo the draft shows, cover first, each once. */
export function weddingImageIds(draft: WeddingDraft): string[] {
  const ids = [
    draft.cover,
    ...draft.gallery,
    ...(draft.story ?? []).map((moment) => moment.photo ?? null),
    draft.portraits?.groom ?? null,
    draft.portraits?.bride ?? null,
    ...(draft.ornaments ?? []),
  ].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

export const WEDDING_SAMPLES = {
  cover: { file: 'wedding-cover.webp', width: 1104, height: 1472 },
} as const satisfies Record<string, SamplePhoto>;

/** A new invitation: the sample cover, the two usual events, every text empty for the couple to write. */
export function newWeddingDraft(samples: { cover: string | null }): WeddingDraft {
  return {
    groom: '',
    bride: '',
    intro: '',
    date: '',
    lunarDate: '',
    cover: samples.cover,
    events: [
      { key: 'e1', label: 'Lễ thành hôn', date: '', time: '', venue: '', address: '' },
      { key: 'e2', label: 'Tiệc cưới', date: '', time: '', venue: '', address: '' },
    ],
    gallery: [],
    rsvp: true,
    rsvpNote: '',
    contacts: { ...EMPTY_CONTACTS },
    palette: 'blush',
    style: WEDDING_DEFAULT_STYLE,
    hostSide: 'chung',
  };
}

/** A filled-in invitation, for previews of the template and its variants. */
export function sampleWeddingDraft(samples: { cover: string | null }): WeddingDraft {
  return {
    ...newWeddingDraft(samples),
    groom: 'Minh',
    bride: 'Thảo',
    intro:
      'Sau sáu năm đi cùng nhau qua bao mùa mưa nắng, tụi mình quyết định về chung một nhà. Ngày vui sẽ trọn vẹn hơn khi có bạn ở đó, cùng nâng ly và chia sẻ niềm hạnh phúc này.',
    date: '2026-12-12',
    lunarDate: 'Tức ngày 4 tháng 11 năm Bính Ngọ',
    events: [
      { key: 'e1', label: 'Lễ thành hôn', date: '', time: '09:00', venue: 'Tư gia nhà gái', address: '25 Nguyễn Trãi, Phường Bến Thành, TP. Hồ Chí Minh' },
      { key: 'e2', label: 'Tiệc cưới', date: '', time: '18:00', venue: 'Nhà hàng Hoa Sen, sảnh Ngọc Lan', address: '120 Lê Lợi, Phường Sài Gòn, TP. Hồ Chí Minh' },
    ],
    gallery: samples.cover ? [samples.cover] : [],
    rsvpNote: 'Mong bạn báo trước ngày 1/12 để tụi mình chuẩn bị chu đáo nhé.',
    contacts: { zalo: '0912345678', phone: '0912345678', facebook: '' },
  };
}

/**
 * The birthday card: who it is for, a wish, who sends it, a photo and a few more, and "Gửi lời chúc" so whoever opens
 * it can send a wish back through the owner's contacts (Zalo, a call or Facebook; like the Tết card, no form, no
 * script).
 */
import { z } from 'zod';
import { STYLE_IDS, type StyleId } from './looks';
import { ALL_PALETTE_IDS } from './palettes';
import { contactIssues, contactsSchema, EMPTY_CONTACTS, hasContact, imageId, imageRef, line, lines, requireText, type TemplateIssue } from './schema-parts';

export const BIRTHDAY_TEMPLATE = 'birthday';

export const BIRTHDAY_LIMITS = { kicker: 60, title: 60, name: 60, message: 600, sender: 80, gallery: 9, ornaments: 2 } as const;

export const BIRTHDAY_DEFAULT_STYLE: StyleId = 'am-cung';
export const BIRTHDAY_DEFAULT_TITLE = 'Chúc mừng sinh nhật';

export const birthdayDraftSchema = z
  .object({
    /** The line above the title: "Tuổi 25 rực rỡ", "Sinh nhật Mây Xanh". */
    kicker: line(BIRTHDAY_LIMITS.kicker),
    title: line(BIRTHDAY_LIMITS.title),
    /** Who the birthday is: "Minh Thư". */
    name: line(BIRTHDAY_LIMITS.name),
    message: lines(BIRTHDAY_LIMITS.message),
    /** Who sends the card ("Hội bạn thân K18"), or '' when it is the owner's own page. */
    sender: line(BIRTHDAY_LIMITS.sender),
    photo: imageRef,
    gallery: z.array(imageId).max(BIRTHDAY_LIMITS.gallery),
    /** Show "Gửi lời chúc" with the owner's contacts. */
    reply: z.boolean(),
    contacts: contactsSchema,
    palette: z.enum(ALL_PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(BIRTHDAY_DEFAULT_STYLE),
    /** Decorations drawn for the template's variant (balloons, a party hat); without them the card has none. */
    ornaments: z.array(imageId).max(BIRTHDAY_LIMITS.ornaments).optional(),
  })
  .strict();

export type BirthdayDraft = z.infer<typeof birthdayDraftSchema>;

export function birthdayPublishIssues(draft: BirthdayDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [...requireText(draft.name, 'name'), ...requireText(draft.message, 'message'), ...contactIssues(draft.contacts)];
  // Sending a wish back needs somewhere to send it.
  if (draft.reply && !hasContact(draft.contacts) && issues.every((issue) => !issue.field.startsWith('contacts.'))) {
    issues.push({ field: 'contacts', code: 'no-contact' });
  }
  return issues;
}

/** Every photo the draft shows, the main photo first, each once. */
export function birthdayImageIds(draft: BirthdayDraft): string[] {
  const ids = [draft.photo, ...draft.gallery, ...(draft.ornaments ?? [])].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/** No sample photo of its own: a new card starts from one of its variants, whose pictures it gets. */
export const BIRTHDAY_SAMPLES = {} as const;

/** A new card: the default title, replies on, the rest left for the owner to write. */
export function newBirthdayDraft(samples: { photo: string | null } = { photo: null }): BirthdayDraft {
  return {
    kicker: '',
    title: BIRTHDAY_DEFAULT_TITLE,
    name: '',
    message: '',
    sender: '',
    photo: samples.photo,
    gallery: [],
    reply: true,
    contacts: { ...EMPTY_CONTACTS },
    palette: 'blush',
    style: BIRTHDAY_DEFAULT_STYLE,
  };
}

/** A filled-in card, for previews of the template and its variants. Names and numbers are made up. */
export function sampleBirthdayDraft(samples: { photo: string | null } = { photo: null }): BirthdayDraft {
  return {
    ...newBirthdayDraft(samples),
    kicker: 'Tuổi 25 rực rỡ',
    name: 'Minh Thư',
    message: 'Chúc bà tuổi mới lương tăng, crush rep, deadline biết điều và lúc nào cũng có tụi tui ở bên. Hôm nay cứ quẩy hết mình, mai tính tiếp!',
    sender: 'Hội bạn thân K18',
    contacts: { zalo: '0912345678', phone: '', facebook: '' },
  };
}

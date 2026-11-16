/**
 * The party invitation (Giáng sinh, tất niên, tiệc công ty): what the party is and who throws it, the day and time, one
 * venue with a map link, a dress code, a short programme, and "Xác nhận tham dự" through the same reply form as the
 * wedding invitation.
 */
import { z } from 'zod';
import { STYLE_IDS, type StyleId } from './looks';
import { ALL_PALETTE_IDS } from './palettes';
import { contactIssues, contactsSchema, EMPTY_CONTACTS, imageId, imageRef, itemKey, line, lines, requireText, uniqueKeys, type TemplateIssue } from './schema-parts';
import { dateField, timeField } from './wedding-schema';
import { mapLink } from './web-links';

export const PARTY_TEMPLATE = 'party';

export const PARTY_LIMITS = {
  kicker: 60,
  title: 80,
  host: 80,
  intro: 600,
  venue: 120,
  address: 200,
  dressCode: 120,
  agenda: 8,
  agendaLabel: 80,
  rsvpNote: 200,
  ornaments: 2,
} as const;

export const PARTY_DEFAULT_STYLE: StyleId = 'ruc-ro';

export const partyAgendaItemSchema = z
  .object({
    key: itemKey,
    time: timeField,
    /** "Check-in, chụp ảnh", "Bốc thăm may mắn". */
    label: line(PARTY_LIMITS.agendaLabel),
  })
  .strict();

export const partyDraftSchema = z
  .object({
    /** The line above the title: "Year End Party 2026", "Giáng sinh 2026". */
    kicker: line(PARTY_LIMITS.kicker),
    title: line(PARTY_LIMITS.title),
    /** Who invites: "Team Marketing, Công ty Mây Xanh". */
    host: line(PARTY_LIMITS.host),
    intro: lines(PARTY_LIMITS.intro),
    date: dateField,
    time: timeField,
    venue: line(PARTY_LIMITS.venue),
    /** An address or a pasted Google Maps link; becomes the "Chỉ đường" link (`mapLink`). */
    address: line(PARTY_LIMITS.address),
    dressCode: line(PARTY_LIMITS.dressCode),
    agenda: z.array(partyAgendaItemSchema).max(PARTY_LIMITS.agenda),
    cover: imageRef,
    rsvp: z.boolean(),
    /** "Báo trước 20/12 để ban tổ chức đặt đủ suất nhé." */
    rsvpNote: line(PARTY_LIMITS.rsvpNote),
    contacts: contactsSchema,
    palette: z.enum(ALL_PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(PARTY_DEFAULT_STYLE),
    /** Decorations drawn for the template's variant (holly, confetti); without them the page has none. */
    ornaments: z.array(imageId).max(PARTY_LIMITS.ornaments).optional(),
  })
  .strict()
  .refine((draft) => uniqueKeys(draft.agenda), 'duplicate-agenda-key');

export type PartyDraft = z.infer<typeof partyDraftSchema>;
export type PartyAgendaItem = z.infer<typeof partyAgendaItemSchema>;

export function partyPublishIssues(draft: PartyDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [...requireText(draft.title, 'title'), ...requireText(draft.date, 'date')];
  if (!draft.venue.trim() && !draft.address.trim()) issues.push({ field: 'venue', code: 'required' });
  if (draft.address.trim() && !mapLink(draft.address)) issues.push({ field: 'address', code: 'invalid-map' });
  draft.agenda.forEach((item, index) => issues.push(...requireText(item.label, `agenda.${index}.label`)));
  // Replies go through the page's form, so contacts are optional; typed ones must work.
  issues.push(...contactIssues(draft.contacts));
  return issues;
}

/** Every photo the draft shows, cover first, each once. */
export function partyImageIds(draft: PartyDraft): string[] {
  const ids = [draft.cover, ...(draft.ornaments ?? [])].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/** No sample photo of its own: a new party page starts from one of its variants, whose pictures it gets. */
export const PARTY_SAMPLES = {} as const;

/** A new invitation: no photo, replies on, every text empty for the host to write. */
export function newPartyDraft(samples: { cover: string | null } = { cover: null }): PartyDraft {
  return {
    kicker: '',
    title: '',
    host: '',
    intro: '',
    date: '',
    time: '',
    venue: '',
    address: '',
    dressCode: '',
    // The usual parts of an evening, times left for the host; any may go.
    agenda: [
      { key: 'a1', time: '', label: 'Check-in, chụp ảnh' },
      { key: 'a2', time: '', label: 'Khai tiệc' },
      { key: 'a3', time: '', label: 'Văn nghệ, bốc thăm may mắn' },
    ],
    cover: samples.cover,
    rsvp: true,
    rsvpNote: '',
    contacts: { ...EMPTY_CONTACTS },
    palette: 'berry',
    style: PARTY_DEFAULT_STYLE,
  };
}

/** A filled-in invitation, for previews of the template and its variants. Names and numbers are made up. */
export function samplePartyDraft(samples: { cover: string | null } = { cover: null }): PartyDraft {
  return {
    ...newPartyDraft(samples),
    kicker: 'Year End Party 2026',
    title: 'Tất niên nhà Mây Xanh',
    host: 'Team Mây Xanh',
    intro: 'Một năm chạy deadline mệt xỉu rồi, tối nay chỉ ăn, chơi và nhận quà thôi. Không bàn công việc, không check mail, hứa đó!',
    date: '2026-12-26',
    time: '18:30',
    venue: 'Nhà hàng Sông Xanh, sảnh Hoa Sứ',
    address: '88 Nguyễn Huệ, Phường Sài Gòn, TP. Hồ Chí Minh',
    dressCode: 'Đỏ, xanh lá hoặc lấp lánh',
    agenda: [
      { key: 'a1', time: '18:30', label: 'Check-in, chụp ảnh photobooth' },
      { key: 'a2', time: '19:00', label: 'Khai tiệc, cả nhà nâng ly' },
      { key: 'a3', time: '20:00', label: 'Văn nghệ các team, bốc thăm may mắn' },
    ],
    rsvpNote: 'Báo trước ngày 20/12 để ban tổ chức đặt đủ suất nhé.',
    contacts: { zalo: '0912345678', phone: '', facebook: '' },
  };
}

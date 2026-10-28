/**
 * The Tết greeting card: a title, a greeting, who sends it, a photo, and optionally a way for the person who opens it
 * to send a greeting back (Zalo, a call or Facebook; the page has no form and no script).
 */
import { z } from 'zod';
import { STYLE_IDS, type StyleId } from './looks';
import type { PaletteId } from './palettes';
import { contactIssues, contactsSchema, EMPTY_CONTACTS, hasContact, imageRef, line, lines, requireText, type SamplePhoto, type TemplateIssue } from './schema-parts';

export const TET_TEMPLATE = 'tet';

/** The Tết this card is for (Tết Đinh Mùi falls on 6/2/2027). Shown above the title and on the share picture. */
export const TET_YEAR = 'Xuân Đinh Mùi 2027';

export const TET_LIMITS = { title: 60, recipient: 80, greeting: 600, sender: 80 } as const;

/** Red and gold first; every Tết palette has a warm `pop` for the gold of lanterns and blossoms. */
export const TET_PALETTE_IDS = ['lucky', 'rose', 'berry', 'leaf', 'sepia'] as const satisfies readonly PaletteId[];
/** The clay look ("Ấm cúng") is the Tết look; the other two stay available. */
export const TET_DEFAULT_STYLE: StyleId = 'am-cung';

export const tetDraftSchema = z
  .object({
    title: line(TET_LIMITS.title),
    /** Who the card is for ("Gửi ông bà và cả nhà"), or ''. */
    recipient: line(TET_LIMITS.recipient),
    greeting: lines(TET_LIMITS.greeting),
    sender: line(TET_LIMITS.sender),
    photo: imageRef,
    /** Show "Gửi lời chúc lại" with the sender's contacts. */
    reply: z.boolean(),
    contacts: contactsSchema,
    palette: z.enum(TET_PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(TET_DEFAULT_STYLE),
  })
  .strict();

export type TetDraft = z.infer<typeof tetDraftSchema>;

export function tetPublishIssues(draft: TetDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [...requireText(draft.greeting, 'greeting'), ...requireText(draft.sender, 'sender'), ...contactIssues(draft.contacts)];
  if (draft.reply && !hasContact(draft.contacts) && issues.every((issue) => !issue.field.startsWith('contacts.'))) {
    issues.push({ field: 'contacts', code: 'no-contact' });
  }
  return issues;
}

export function tetImageIds(draft: TetDraft): string[] {
  return draft.photo ? [draft.photo] : [];
}

/**
 * Greetings to start from, written for this app (no verses copied from anywhere). The editor offers them; picking one
 * fills `greeting`, which the sender may then change.
 */
export const TET_GREETINGS = [
  {
    id: 'an-khang',
    label: 'An khang',
    text: 'Năm mới Đinh Mùi gõ cửa, chúc cả nhà mình luôn mạnh khoẻ, bình an, sáng nào thức dậy cũng thấy lòng nhẹ tênh và nhà đầy tiếng cười.',
  },
  {
    id: 'gia-dinh',
    label: 'Gia đình',
    text: 'Xuân này chúc ông bà vui khoẻ, ba mẹ bớt lo toan, anh chị em mỗi người một niềm vui riêng mà vẫn chung một mái nhà thật ấm.',
  },
  {
    id: 'lam-an',
    label: 'Làm ăn',
    text: 'Chúc anh chị một năm Đinh Mùi buôn may bán đắt, khách quen thêm đông, khách mới ghé hoài, việc gì bắt tay vào cũng thuận buồm xuôi gió.',
  },
  {
    id: 'ban-be',
    label: 'Bạn bè',
    text: 'Năm mới chúc bạn bớt việc gấp, thêm những chuyến đi xa, ví lúc nào cũng dày hơn một chút và lúc nào cũng có người rủ đi cà phê.',
  },
  {
    id: 'dong-nghiep',
    label: 'Đồng nghiệp',
    text: 'Cảm ơn vì một năm đã cùng nhau gánh việc. Chúc năm Đinh Mùi mọi kế hoạch đều về đích, ai cũng khoẻ, cả đội cùng vui.',
  },
  {
    id: 'con-chau',
    label: 'Con cháu',
    text: 'Chúc con năm mới hay ăn chóng lớn, học đâu nhớ đó, ngủ thật ngon và luôn tò mò với thế giới quanh mình.',
  },
  {
    id: 'ngan-gon',
    label: 'Ngắn gọn',
    text: 'Chúc mừng năm mới! An khang thịnh vượng, vạn sự như ý.',
  },
] as const;

export const TET_DEFAULT_TITLE = 'Chúc Mừng Năm Mới';

export const TET_SAMPLES = {
  photo: { file: 'tet-photo.webp', width: 675, height: 900 },
} as const satisfies Record<string, SamplePhoto>;

/** A new card: the sample photo, the default title and first greeting, the sender left for the owner to write. */
export function newTetDraft(samples: { photo: string }): TetDraft {
  return {
    title: TET_DEFAULT_TITLE,
    recipient: '',
    greeting: TET_GREETINGS[0].text,
    sender: '',
    photo: samples.photo,
    reply: true,
    contacts: { ...EMPTY_CONTACTS },
    palette: 'lucky',
    style: TET_DEFAULT_STYLE,
  };
}

/** A filled-in card, for previews of the template and its variants. */
export function sampleTetDraft(samples: { photo: string }): TetDraft {
  return {
    ...newTetDraft(samples),
    recipient: 'Gửi ông bà, cô chú và cả nhà',
    greeting: TET_GREETINGS[1].text,
    sender: 'Gia đình Minh Anh',
    contacts: { zalo: '0912345678', phone: '0912345678', facebook: '' },
  };
}

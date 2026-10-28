/**
 * The restaurant / café page: the place, its menu in sections with prices, opening hours, address with directions,
 * and booking a table by phone or Zalo.
 */
import { z } from 'zod';
import { STYLE_IDS, type StyleId } from './looks';
import { ALL_PALETTE_IDS } from './palettes';
import {
  contactIssues,
  contactsSchema,
  EMPTY_CONTACTS,
  hasContact,
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

export const CAFE_TEMPLATE = 'cafe';

export const CAFE_LIMITS = {
  name: 80,
  description: 500,
  sectionTitle: 60,
  itemName: 80,
  itemDescription: 200,
  price: 40,
  sections: 12,
  itemsPerSection: 40,
  items: 120,
  hours: 7,
  hoursText: 40,
  address: 200,
} as const;

/** "Film lifestyle": a printed menu over warm film photos. */
export const CAFE_DEFAULT_STYLE: StyleId = 'tinh-te';

export const cafeItemSchema = z
  .object({
    key: itemKey,
    name: line(CAFE_LIMITS.itemName),
    description: lines(CAFE_LIMITS.itemDescription),
    /** Free text: "45.000đ", "35k / 45k", "Theo thời giá". */
    price: line(CAFE_LIMITS.price),
    image: imageRef,
  })
  .strict();

export const cafeSectionSchema = z
  .object({
    key: itemKey,
    /** "Cà phê", "Món chính"; may be empty when the menu is one list. */
    title: line(CAFE_LIMITS.sectionTitle),
    items: z.array(cafeItemSchema).max(CAFE_LIMITS.itemsPerSection),
  })
  .strict();

export const cafeHoursSchema = z
  .object({
    key: itemKey,
    /** "Thứ Hai – Thứ Sáu". */
    days: line(CAFE_LIMITS.hoursText),
    /** "7:00 – 22:00", "Nghỉ". */
    time: line(CAFE_LIMITS.hoursText),
  })
  .strict();

export const cafeDraftSchema = z
  .object({
    name: line(CAFE_LIMITS.name),
    description: lines(CAFE_LIMITS.description),
    cover: imageRef,
    menu: z.array(cafeSectionSchema).max(CAFE_LIMITS.sections),
    hours: z.array(cafeHoursSchema).max(CAFE_LIMITS.hours),
    /** An address or a pasted Google Maps link (`mapLink`). */
    address: line(CAFE_LIMITS.address),
    /** Show "Đặt bàn" (calls and Zalo) rather than a plain "Liên hệ". */
    booking: z.boolean(),
    contacts: contactsSchema,
    palette: z.enum(ALL_PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(CAFE_DEFAULT_STYLE),
  })
  .strict()
  .refine((draft) => uniqueKeys(draft.menu) && draft.menu.every((section) => uniqueKeys(section.items)), 'duplicate-menu-key')
  .refine((draft) => uniqueKeys(draft.hours), 'duplicate-hours-key')
  .refine((draft) => draft.menu.reduce((sum, section) => sum + section.items.length, 0) <= CAFE_LIMITS.items, 'too-many-items');

export type CafeDraft = z.infer<typeof cafeDraftSchema>;
export type CafeSection = z.infer<typeof cafeSectionSchema>;
export type CafeItem = z.infer<typeof cafeItemSchema>;

export function cafePublishIssues(draft: CafeDraft): TemplateIssue[] {
  const issues: TemplateIssue[] = [...requireText(draft.name, 'name')];
  if (!draft.menu.some((section) => section.items.length > 0)) issues.push({ field: 'menu', code: 'no-menu' });
  draft.menu.forEach((section, s) => {
    section.items.forEach((item, i) => issues.push(...requireText(item.name, `menu.${s}.items.${i}.name`)));
  });
  if (draft.address.trim() && !mapLink(draft.address)) issues.push({ field: 'address', code: 'invalid-map' });
  const contacts = contactIssues(draft.contacts);
  issues.push(...contacts);
  if (draft.booking && contacts.length === 0 && !hasContact(draft.contacts)) issues.push({ field: 'contacts', code: 'no-contact' });
  return issues;
}

/** Every photo the draft shows, cover first, each once. */
export function cafeImageIds(draft: CafeDraft): string[] {
  const ids = [draft.cover, ...draft.menu.flatMap((section) => section.items.map((item) => item.image))].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

export const CAFE_SAMPLES = {
  cover: { file: 'cafe-cover.webp', width: 675, height: 900 },
} as const satisfies Record<string, SamplePhoto>;

const emptyItem = (key: string) => ({ key, name: '', description: '', price: '', image: null });

/** A new page: the sample cover, one menu section with two empty dishes, usual hours rows, texts left to the owner. */
export function newCafeDraft(samples: { cover: string }): CafeDraft {
  return {
    name: '',
    description: '',
    cover: samples.cover,
    menu: [{ key: 's1', title: '', items: [emptyItem('i1'), emptyItem('i2')] }],
    hours: [{ key: 'h1', days: '', time: '' }],
    address: '',
    booking: true,
    contacts: { ...EMPTY_CONTACTS },
    palette: 'sepia',
    style: CAFE_DEFAULT_STYLE,
  };
}

/** A filled-in page, for previews of the template and its variants. */
export function sampleCafeDraft(samples: { cover: string }): CafeDraft {
  return {
    ...newCafeDraft(samples),
    name: 'Góc Nhỏ Cà Phê',
    description: 'Quán nhỏ trong hẻm, cà phê rang mộc mỗi tuần, bánh nướng tại chỗ. Ngồi lâu cũng được, có ổ cắm và nhạc nhẹ.',
    menu: [
      {
        key: 's1',
        title: 'Cà phê',
        items: [
          { key: 'i1', name: 'Cà phê sữa đá', description: 'Phin truyền thống, sữa đặc vừa ngọt.', price: '29.000đ', image: null },
          { key: 'i2', name: 'Bạc xỉu', description: '', price: '32.000đ', image: null },
          { key: 'i3', name: 'Cold brew cam sả', description: 'Ủ lạnh 16 giờ, thêm lát cam và sả tươi.', price: '45.000đ', image: null },
        ],
      },
      {
        key: 's2',
        title: 'Trà và bánh',
        items: [
          { key: 'i4', name: 'Trà đào cam sả', description: '', price: '39.000đ', image: null },
          { key: 'i5', name: 'Bánh chuối nướng', description: 'Nướng mỗi sáng, ăn kèm kem dừa.', price: '35.000đ', image: null },
        ],
      },
    ],
    hours: [
      { key: 'h1', days: 'Thứ Hai – Thứ Sáu', time: '7:00 – 22:00' },
      { key: 'h2', days: 'Thứ Bảy, Chủ Nhật', time: '7:30 – 23:00' },
    ],
    address: '42/7 Nguyễn Huệ, Phường Sài Gòn, TP. Hồ Chí Minh',
    contacts: { zalo: '0912345678', phone: '0912345678', facebook: 'gocnhocaphe' },
  };
}

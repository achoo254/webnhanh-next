/**
 * The "take orders" shop template: what the owner fills in. Two levels of checking:
 *
 * - `shopDraftSchema` on every save: shapes and lengths only, so a half-filled form (an empty name, a phone number
 *   being typed) can always be saved and previewed.
 * - `shopPublishIssues` before publishing: what a page needs to be worth showing (a name, at least one named
 *   product) and contacts that really are a phone number, Zalo or Facebook address.
 */
import { z } from 'zod';
import { DEFAULT_STYLE, STYLE_IDS } from './looks';
import { PALETTE_IDS } from './palettes';
import { contactIssues, contactsSchema, EMPTY_CONTACTS, imageRef, itemKey, line, lines, uniqueKeys, type TemplateIssue } from './schema-parts';

export const SHOP_TEMPLATE = 'shop';

export const LIMITS = {
  name: 80,
  description: 500,
  productName: 80,
  productDescription: 300,
  price: 40,
  contact: 200,
  products: 30,
} as const;

export const shopProductSchema = z
  .object({
    /** Stable id made by the editor, for lists that reorder. */
    key: itemKey,
    name: line(LIMITS.productName),
    image: imageRef,
    description: lines(LIMITS.productDescription),
    /** Free text: "35.000đ", "Liên hệ", "Từ 50k". */
    price: line(LIMITS.price),
  })
  .strict();

export const shopDraftSchema = z
  .object({
    name: line(LIMITS.name),
    description: lines(LIMITS.description),
    cover: imageRef,
    products: z.array(shopProductSchema).max(LIMITS.products),
    contacts: contactsSchema,
    palette: z.enum(PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(DEFAULT_STYLE),
  })
  .strict()
  .refine((draft) => uniqueKeys(draft.products), 'duplicate-product-key');

export type ShopDraft = z.infer<typeof shopDraftSchema>;
export type ShopProduct = z.infer<typeof shopProductSchema>;

/** Why a draft cannot be published yet: the field (a dotted path, as the editor names its inputs) and the reason. */
export interface ShopIssue extends TemplateIssue {
  readonly code: 'required' | 'no-products' | 'invalid-zalo' | 'invalid-phone' | 'invalid-facebook';
}

export function shopPublishIssues(draft: ShopDraft): ShopIssue[] {
  const issues: ShopIssue[] = [];
  if (!draft.name.trim()) issues.push({ field: 'name', code: 'required' });
  if (draft.products.length === 0) issues.push({ field: 'products', code: 'no-products' });
  draft.products.forEach((product, index) => {
    if (!product.name.trim()) issues.push({ field: `products.${index}.name`, code: 'required' });
  });
  return [...issues, ...contactIssues(draft.contacts)];
}

/** Every photo a draft shows, cover first, each once. */
export function shopImageIds(draft: ShopDraft): string[] {
  const ids = [draft.cover, ...draft.products.map((p) => p.image)].filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

/** The template's own sample photos (in `samples/`, shipped with the package), copied into every new site. */
export const SHOP_SAMPLES = {
  cover: { file: 'shop-cover.webp', width: 675, height: 900 },
  products: [
    { file: 'shop-p1.webp', width: 900, height: 900 },
    { file: 'shop-p2.webp', width: 900, height: 900 },
  ],
} as const;

/**
 * A new site's draft: the sample cover and two products with the sample photos, every text empty for the owner to
 * write (the editor shows examples as placeholders; nothing is filled in on their behalf).
 */
export function newShopDraft(samples: { cover: string | null; products: readonly (string | null)[] }): ShopDraft {
  return {
    name: '',
    description: '',
    cover: samples.cover,
    products: samples.products.map((image, index) => ({ key: `p${index + 1}`, name: '', image, description: '', price: '' })),
    contacts: { ...EMPTY_CONTACTS },
    palette: 'berry',
    style: DEFAULT_STYLE,
  };
}

/** A filled-in shop, for previews of the template and its variants. */
export function sampleShopDraft(samples: { cover: string | null; products: readonly (string | null)[] }): ShopDraft {
  const [first = null, second = null] = samples.products;
  return {
    ...newShopDraft(samples),
    name: 'Tiệm Bánh Nhà Bơ',
    description: 'Bánh nướng mỗi sáng từ bơ thật và bột mới xay. Đặt trước một ngày, giao trong nội thành.',
    products: [
      { key: 'p1', name: 'Bánh bông lan trứng muối', image: first, description: 'Hộp 6 cái, trứng muối tự làm.', price: '85.000đ' },
      { key: 'p2', name: 'Bánh quy bơ hạnh nhân', image: second, description: 'Hũ 300 g, giòn thơm.', price: '120.000đ' },
    ],
    contacts: { zalo: '0912345678', phone: '0912345678', facebook: 'tiembanhnhabo' },
  };
}

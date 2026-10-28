/**
 * The "take orders" shop template: what the owner fills in. Two levels of checking:
 *
 * - `shopDraftSchema` on every save: shapes and lengths only, so a half-filled form (an empty name, a phone number
 *   being typed) can always be saved and previewed.
 * - `shopPublishIssues` before publishing: what a page needs to be worth showing (a name, at least one named
 *   product) and contacts that really are a phone number, Zalo or Facebook address.
 */
import { z } from 'zod';
import { facebookLink, phoneLink, zaloLink } from './contact-links';
import { isPlainText } from './html';

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

/** The colours a page can take: few on purpose, each readable with white text on it. */
export const PALETTE_IDS = ['berry', 'rose', 'sunset', 'leaf', 'ocean', 'ink'] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

/**
 * The page's look, each its own layout, type and decoration (any palette goes with any style). Drafts saved before
 * styles existed have none and read as DEFAULT_STYLE.
 */
export const STYLE_IDS = ['ruc-ro', 'tinh-te', 'am-cung'] as const;
export type StyleId = (typeof STYLE_IDS)[number];
export const DEFAULT_STYLE: StyleId = 'ruc-ro';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const line = (max: number) => z.string().max(max).refine((v) => isPlainText(v, false), 'control-characters');
const lines = (max: number) => z.string().max(max).refine((v) => isPlainText(v, true), 'control-characters');
/** A photo of the site (`site_images.id`), or null for none. */
const imageRef = z.string().regex(UUID).nullable();

export const shopProductSchema = z
  .object({
    /** Stable id made by the editor, for lists that reorder. */
    key: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
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
    contacts: z
      .object({
        zalo: line(LIMITS.contact),
        phone: line(LIMITS.contact),
        facebook: line(LIMITS.contact),
      })
      .strict(),
    palette: z.enum(PALETTE_IDS),
    style: z.enum(STYLE_IDS).default(DEFAULT_STYLE),
  })
  .strict()
  .refine((draft) => new Set(draft.products.map((p) => p.key)).size === draft.products.length, 'duplicate-product-key');

export type ShopDraft = z.infer<typeof shopDraftSchema>;
export type ShopProduct = z.infer<typeof shopProductSchema>;

/** Why a draft cannot be published yet: the field (a dotted path, as the editor names its inputs) and the reason. */
export interface ShopIssue {
  readonly field: string;
  readonly code: 'required' | 'no-products' | 'invalid-zalo' | 'invalid-phone' | 'invalid-facebook';
}

export function shopPublishIssues(draft: ShopDraft): ShopIssue[] {
  const issues: ShopIssue[] = [];
  if (!draft.name.trim()) issues.push({ field: 'name', code: 'required' });
  if (draft.products.length === 0) issues.push({ field: 'products', code: 'no-products' });
  draft.products.forEach((product, index) => {
    if (!product.name.trim()) issues.push({ field: `products.${index}.name`, code: 'required' });
  });
  const { zalo, phone, facebook } = draft.contacts;
  if (zalo.trim() && !zaloLink(zalo)) issues.push({ field: 'contacts.zalo', code: 'invalid-zalo' });
  if (phone.trim() && !phoneLink(phone)) issues.push({ field: 'contacts.phone', code: 'invalid-phone' });
  if (facebook.trim() && !facebookLink(facebook)) issues.push({ field: 'contacts.facebook', code: 'invalid-facebook' });
  return issues;
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
export function newShopDraft(samples: { cover: string; products: readonly string[] }): ShopDraft {
  return {
    name: '',
    description: '',
    cover: samples.cover,
    products: samples.products.map((image, index) => ({ key: `p${index + 1}`, name: '', image, description: '', price: '' })),
    contacts: { zalo: '', phone: '', facebook: '' },
    palette: 'berry',
    style: DEFAULT_STYLE,
  };
}

/**
 * The photos a stored draft of any template uses, or null when the draft cannot be read (then nothing of the site
 * may be treated as unused).
 */
export function draftImageIds(template: string | null, draft: unknown): Set<string> | null {
  if (template !== SHOP_TEMPLATE) return null;
  const parsed = shopDraftSchema.safeParse(draft);
  return parsed.success ? new Set(shopImageIds(parsed.data)) : null;
}

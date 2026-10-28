/**
 * The variants of every template: per template a few looks by industry or style, each a file
 * `variants/<template>/<id>.json` with its look, palette, sample copy and the art to draw for it (`scripts/gen-template-art.ts`
 * reads the same files). Every file is imported here, so a bundle carries them and the test can check each one; add a
 * new file to `VARIANT_FILES` too (the test fails otherwise).
 *
 * Art rules (the `inet-artgen` skill): `qwen` for photos, `zimage-transparent` for ornaments on a transparent
 * background, `klein-edit` with `ref` (another slot of the same variant) to keep one set in one style. Prompts are in
 * English and always say "no text": every word on a page is HTML the owner can change.
 */
import { z } from 'zod';
import { STYLE_IDS } from './looks';
import { ALL_PALETTE_IDS } from './palettes';
import { TEMPLATE_IDS, type TemplateId } from './templates';
import { VARIANT_SLOTS } from './variant-drafts';
import cafeCaPheFilm from '../variants/cafe/ca-phe-film.json';
import cafeQuanComNha from '../variants/cafe/quan-com-nha.json';
import cafeTraSuaTiemBanh from '../variants/cafe/tra-sua-tiem-banh.json';
import profileChuyenGia from '../variants/profile/chuyen-gia.json';
import profileNguoiSangTao from '../variants/profile/nguoi-sang-tao.json';
import profileThoThuCong from '../variants/profile/tho-thu-cong.json';
import shopCayCanh from '../variants/shop/cay-canh.json';
import shopDoAnVat from '../variants/shop/do-an-vat.json';
import shopHandmade from '../variants/shop/handmade.json';
import shopMyPham from '../variants/shop/my-pham.json';
import shopNongSan from '../variants/shop/nong-san.json';
import shopQuanAo from '../variants/shop/quan-ao.json';
import tetClayDoVang from '../variants/tet/clay-do-vang.json';
import tetClayHoaDao from '../variants/tet/clay-hoa-dao.json';
import tetGiayDoVienVang from '../variants/tet/giay-do-vien-vang.json';
import weddingHoaPastel from '../variants/wedding/hoa-pastel.json';
import weddingToiGian from '../variants/wedding/toi-gian.json';
import weddingTruyenThong from '../variants/wedding/truyen-thong.json';
import weddingVintage from '../variants/wedding/vintage.json';

export const ART_MODELS = ['qwen', 'zimage-transparent', 'klein-edit'] as const;
export type ArtModel = (typeof ART_MODELS)[number];

const SLOT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const artSchema = z
  .object({
    /** Name of the picture within the variant ("cover", "product-1", "ornament"); its file is `<slot>.webp`. */
    slot: z.string().regex(SLOT).max(40),
    model: z.enum(ART_MODELS),
    /** `<width>x<height>` as `artgen.py --size` takes it. */
    size: z.string().regex(/^\d{3,4}x\d{3,4}$/),
    prompt: z
      .string()
      .min(20)
      .max(1500)
      .refine((prompt) => /\bno text\b/i.test(prompt), 'prompt-must-say-no-text'),
    /** For `klein-edit`: the slot of this variant drawn first, whose style it keeps. */
    ref: z.string().regex(SLOT).optional(),
    /** The seed the picture was drawn with, recorded by the art script; null until drawn. */
    seed: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .refine((art) => (art.model === 'klein-edit') === (art.ref !== undefined), 'ref-only-and-always-with-klein-edit');

export const variantSchema = z
  .object({
    template: z.enum(TEMPLATE_IDS),
    id: z.string().regex(SLOT).max(40),
    /** What the editor shows ("Đồ ăn vặt", "Truyền thống đỏ vàng"). */
    label: z.string().min(1).max(40),
    /** Whether the variant is about a trade or a look. */
    kind: z.enum(['industry', 'style']),
    style: z.enum(STYLE_IDS),
    palette: z.enum(ALL_PALETTE_IDS),
    /** Sample texts: top-level text fields of the template's draft, by name. */
    copy: z.record(z.string().regex(/^[a-z][A-Za-z]*$/), z.string().max(600)),
    art: z.array(artSchema).min(1).max(8),
  })
  .strict()
  .superRefine((variant, ctx) => {
    const slots = variant.art.map((art) => art.slot);
    if (new Set(slots).size !== slots.length) ctx.addIssue({ code: 'custom', message: 'duplicate-slot' });
    // Every picture drawn has its place in the draft (`variantDraft`), and the one standing for the variant is drawn.
    const known: readonly string[] = VARIANT_SLOTS[variant.template];
    for (const slot of slots) if (!known.includes(slot)) ctx.addIssue({ code: 'custom', message: `slot-not-in-draft: ${slot}`, path: ['art'] });
    if (!slots.includes(VARIANT_SLOTS[variant.template][0])) ctx.addIssue({ code: 'custom', message: `missing-slot: ${VARIANT_SLOTS[variant.template][0]}`, path: ['art'] });
    variant.art.forEach((art, index) => {
      if (art.ref !== undefined && !slots.slice(0, index).includes(art.ref)) ctx.addIssue({ code: 'custom', message: `ref-not-drawn-before: ${art.slot}`, path: ['art', index, 'ref'] });
    });
  });

export type TemplateVariant = z.infer<typeof variantSchema>;
export type VariantArt = z.infer<typeof artSchema>;

/** Every variant file, by its path under `variants/`, as read (unchecked). */
export const VARIANT_FILES: Readonly<Record<string, unknown>> = {
  'cafe/ca-phe-film.json': cafeCaPheFilm,
  'cafe/quan-com-nha.json': cafeQuanComNha,
  'cafe/tra-sua-tiem-banh.json': cafeTraSuaTiemBanh,
  'profile/chuyen-gia.json': profileChuyenGia,
  'profile/nguoi-sang-tao.json': profileNguoiSangTao,
  'profile/tho-thu-cong.json': profileThoThuCong,
  'shop/cay-canh.json': shopCayCanh,
  'shop/do-an-vat.json': shopDoAnVat,
  'shop/handmade.json': shopHandmade,
  'shop/my-pham.json': shopMyPham,
  'shop/nong-san.json': shopNongSan,
  'shop/quan-ao.json': shopQuanAo,
  'tet/clay-do-vang.json': tetClayDoVang,
  'tet/clay-hoa-dao.json': tetClayHoaDao,
  'tet/giay-do-vien-vang.json': tetGiayDoVienVang,
  'wedding/hoa-pastel.json': weddingHoaPastel,
  'wedding/toi-gian.json': weddingToiGian,
  'wedding/truyen-thong.json': weddingTruyenThong,
  'wedding/vintage.json': weddingVintage,
};

/** Every variant, checked; throws on the first file that does not fit, naming it. */
export function templateVariants(): TemplateVariant[] {
  return Object.entries(VARIANT_FILES).map(([path, data]) => {
    const parsed = variantSchema.safeParse(data);
    if (!parsed.success) throw new Error(`variants/${path}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`);
    if (path !== `${parsed.data.template}/${parsed.data.id}.json`) throw new Error(`variants/${path}: template and id do not match the path`);
    return parsed.data;
  });
}

let checked: readonly TemplateVariant[] | null = null;

/** The variants of `template`, in file order (the first is the one the picker preselects). */
export function variantsOf(template: TemplateId): TemplateVariant[] {
  checked ??= templateVariants();
  return checked.filter((variant) => variant.template === template);
}

/** The variant `id` of `template`, or null when it has none by that id. */
export function findVariant(template: TemplateId, id: string): TemplateVariant | null {
  return variantsOf(template).find((variant) => variant.id === id) ?? null;
}

export * from './variant-drafts';
export { webpSize } from './webp-size';

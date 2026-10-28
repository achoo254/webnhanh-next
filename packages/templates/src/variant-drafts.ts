/**
 * How a variant becomes a new site: which of its pictures goes where in the template's draft, the size each picture
 * is kept at in `library/` (the size a page shows it, like `samples/`), and the draft the site starts from (the
 * variant's look, palette and sample copy over the template's new draft).
 */
import { newCafeDraft } from './cafe-schema';
import { newProfileDraft } from './profile-schema';
import type { SamplePhoto } from './schema-parts';
import { newShopDraft } from './shop-schema';
import { parseDraft, type TemplateDraft, type TemplateId } from './templates';
import { newTetDraft } from './tet-schema';
import type { TemplateVariant, VariantArt } from './variants';
import { newWeddingDraft } from './wedding-schema';

/**
 * The slots a variant of each template may draw. The first is the picture that stands for the variant (cover, card
 * photo, avatar): every variant draws it, and the picker shows it.
 *
 * - shop: `cover` the cover, `product-1`/`product-2` the first two products' photos;
 * - tet: `hero` the card's photo, `ornament`/`ornament-2` decorations;
 * - wedding: `cover` the cover, `ornament` a decoration;
 * - cafe: `cover` the cover, `item-1`/`item-2` the first two dishes' photos;
 * - profile: `avatar` the avatar.
 */
export const VARIANT_SLOTS = {
  shop: ['cover', 'product-1', 'product-2'],
  tet: ['hero', 'ornament', 'ornament-2'],
  wedding: ['cover', 'ornament'],
  cafe: ['cover', 'item-1', 'item-2'],
  profile: ['avatar'],
} as const satisfies Readonly<Record<TemplateId, readonly [string, ...string[]]>>;

/** Slots that are decoration (transparent ornaments), not photos for the owner to replace. */
export const DECORATION_SLOTS = ['ornament', 'ornament-2'] as const;

export function isDecorationSlot(slot: string): boolean {
  return (DECORATION_SLOTS as readonly string[]).includes(slot);
}

/** Longest side of a library picture: photos as large as the samples (675x900, 900x900), ornaments smaller. */
const PHOTO_SIDE = 900;
const DECORATION_SIDE = 512;
/** Width of a variant's thumbnail in the template picker. */
export const THUMB_WIDTH = 240;

/** The size a picture is kept at in `library/`: its drawn size (`art.size`) scaled down to the side above. */
export function librarySize(art: Pick<VariantArt, 'slot' | 'size'>): { width: number; height: number } {
  const [width = 0, height = 0] = art.size.split('x').map(Number);
  const scale = Math.min(1, (isDecorationSlot(art.slot) ? DECORATION_SIDE : PHOTO_SIDE) / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** One library picture a new site of the variant gets: its file in the package, its size and slot. */
export interface LibraryPhoto extends SamplePhoto {
  readonly slot: string;
  /** An ornament: copied like a photo, but not marked as a sample to replace. */
  readonly decoration: boolean;
}

/** Where a variant's picture is kept in the package: `library/<template>/<variant>/<slot>.webp`. */
export function artFile(variant: Pick<TemplateVariant, 'template' | 'id'>, slot: string): string {
  return `library/${variant.template}/${variant.id}/${slot}.webp`;
}

/** Where a variant's thumbnail for the picker is kept: `thumbs/<template>/<variant>.webp`. */
export function thumbFile(variant: Pick<TemplateVariant, 'template' | 'id'>): string {
  return `thumbs/${variant.template}/${variant.id}.webp`;
}

/** Every picture of the variant, in the order it lists them. */
export function variantPhotos(variant: TemplateVariant): LibraryPhoto[] {
  return variant.art.map((art) => ({ slot: art.slot, file: artFile(variant, art.slot), ...librarySize(art), decoration: isDecorationSlot(art.slot) }));
}

/**
 * The draft a new site of `variant` starts from: the template's new draft with the variant's pictures in their slots
 * (`photoId` gives the id each got in the site), its look, palette and sample copy. Throws when the result is not a
 * valid draft of the template (the tests make every variant one).
 */
export function variantDraft(variant: TemplateVariant, photoId: (slot: string) => string): TemplateDraft {
  const drawn = new Set(variant.art.map((art) => art.slot));
  const photo = (slot: string): string | null => (drawn.has(slot) ? photoId(slot) : null);
  const ornaments = DECORATION_SLOTS.map(photo).filter((id): id is string => id !== null);
  const decorated = ornaments.length > 0 ? { ornaments } : {};
  let base: object;
  switch (variant.template) {
    case 'shop':
      base = newShopDraft({ cover: photo('cover'), products: [photo('product-1'), photo('product-2')] });
      break;
    case 'tet':
      base = { ...newTetDraft({ photo: photo('hero') }), ...decorated };
      break;
    case 'wedding':
      base = { ...newWeddingDraft({ cover: photo('cover') }), ...decorated };
      break;
    case 'cafe': {
      const draft = newCafeDraft({ cover: photo('cover') });
      const items = [photo('item-1'), photo('item-2')];
      base = {
        ...draft,
        menu: draft.menu.map((section, s) => (s === 0 ? { ...section, items: section.items.map((item, i) => ({ ...item, image: items[i] ?? item.image })) } : section)),
      };
      break;
    }
    case 'profile':
      base = { ...newProfileDraft(), avatar: photo('avatar') };
      break;
  }
  const parsed = parseDraft(variant.template, { ...base, ...variant.copy, style: variant.style, palette: variant.palette });
  if (!parsed) throw new Error(`variants/${variant.template}/${variant.id}.json does not make a valid ${variant.template} draft`);
  return parsed;
}

import { describe, expect, it } from 'vitest';
import { imageAsset } from './page';
import { parseDraft, renderDraft, templateImageIds, TEMPLATE_IDS, type TemplateDraft } from './templates';
import { findVariant, librarySize, templateVariants, thumbFile, VARIANT_SLOTS, variantDraft, variantPhotos, variantSchema, variantsOf } from './variants';

const variants = templateVariants();
/** A fake site id per slot, so the test can see where each picture went. */
const SLOTS: readonly string[] = [...new Set(Object.values(VARIANT_SLOTS).flat())];
const idOf = (slot: string): string => `00000000-0000-4000-8000-${String(SLOTS.indexOf(slot)).padStart(12, '0')}`;

/** Where each slot's picture must land in the draft. */
function placed(value: TemplateDraft): Record<string, string | null | undefined> {
  switch (value.template) {
    case 'shop':
      return { cover: value.draft.cover, 'product-1': value.draft.products[0]?.image, 'product-2': value.draft.products[1]?.image };
    case 'tet':
      return { hero: value.draft.photo, ornament: value.draft.ornaments?.[0], 'ornament-2': value.draft.ornaments?.[1] };
    case 'wedding':
      return { cover: value.draft.cover, ornament: value.draft.ornaments?.[0] };
    case 'cafe':
      return { cover: value.draft.cover, 'item-1': value.draft.menu[0]?.items[0]?.image, 'item-2': value.draft.menu[0]?.items[1]?.image };
    case 'profile':
      return { avatar: value.draft.avatar };
  }
}

describe('variant drafts', () => {
  it.each(variants.map((v) => [`${v.template}/${v.id}`, v] as const))('%s: starts a draft with its look, copy and every picture in place', (_name, variant) => {
    const value = variantDraft(variant, idOf);
    expect(value.template).toBe(variant.template);
    expect(value.draft).toMatchObject({ ...variant.copy, style: variant.style, palette: variant.palette });
    const where = placed(value);
    for (const art of variant.art) expect(where[art.slot], art.slot).toBe(idOf(art.slot));
    // Every picture copied in is used, so none is cleaned up as unused.
    expect(new Set(templateImageIds(value))).toEqual(new Set(variant.art.map((art) => idOf(art.slot))));
  });

  it('keeps library pictures at the size a page shows them, ornaments smaller and not samples', () => {
    expect(librarySize({ slot: 'cover', size: '1104x1472' })).toEqual({ width: 675, height: 900 });
    expect(librarySize({ slot: 'product-1', size: '1328x1328' })).toEqual({ width: 900, height: 900 });
    expect(librarySize({ slot: 'ornament', size: '1024x1024' })).toEqual({ width: 512, height: 512 });
    expect(librarySize({ slot: 'cover', size: '600x800' })).toEqual({ width: 600, height: 800 });
    const tet = findVariant('tet', 'clay-do-vang');
    if (!tet) throw new Error('no tet/clay-do-vang');
    expect(variantPhotos(tet)).toEqual([
      { slot: 'hero', file: 'library/tet/clay-do-vang/hero.webp', width: 675, height: 900, decoration: false },
      { slot: 'ornament', file: 'library/tet/clay-do-vang/ornament.webp', width: 512, height: 512, decoration: true },
      { slot: 'ornament-2', file: 'library/tet/clay-do-vang/ornament-2.webp', width: 512, height: 512, decoration: true },
    ]);
    expect(thumbFile(tet)).toBe('thumbs/tet/clay-do-vang.webp');
  });

  it('finds variants by template and id only', () => {
    for (const template of TEMPLATE_IDS) expect(variantsOf(template).length, template).toBeGreaterThanOrEqual(2);
    expect(findVariant('shop', 'do-an-vat')?.label).toBe('Đồ ăn vặt');
    expect(findVariant('wedding', 'do-an-vat')).toBeNull();
    expect(findVariant('shop', '../tet')).toBeNull();
  });

  it('refuses a variant drawing a slot its template has no place for, or missing the one standing for it', () => {
    const shop = findVariant('shop', 'my-pham');
    if (!shop) throw new Error('no shop/my-pham');
    const [cover, ...rest] = shop.art;
    expect(variantSchema.safeParse({ ...shop, art: [...shop.art, { ...cover, slot: 'ornament' }] }).success).toBe(false);
    expect(variantSchema.safeParse({ ...shop, art: rest.map((art) => ({ ...art, model: 'qwen', ref: undefined })) }).success).toBe(false);
    expect(VARIANT_SLOTS.shop[0]).toBe('cover');
  });

  it('draws the ornaments as hidden decorations, and the SVG ones without them', () => {
    const asset = imageAsset({ width: 512, height: 512, widths: [512] }, () => 'img/o.webp');
    for (const template of ['tet', 'wedding'] as const) {
      const [variant] = variantsOf(template);
      if (!variant) throw new Error(`no ${template} variant`);
      const value = variantDraft(variant, idOf);
      const assets = new Map(variant.art.map((art) => [idOf(art.slot), asset]));
      const { html } = renderDraft(value, assets);
      expect(html, template).toMatch(/<img class="(orn|w-orn)[^"]*" aria-hidden="true" src="img\/o\.webp"[^>]* alt=""/);
      expect(html).not.toContain('<svg class="bl ');
      expect(html).not.toContain('<svg class="sprig sprig-top"');

      // A draft from before ornaments existed has no such field, and draws the SVG ones as it always did.
      const plain = { ...value.draft } as Record<string, unknown>;
      delete plain.ornaments;
      const before = parseDraft(template, plain);
      if (!before) throw new Error('draft without ornaments does not parse');
      const old = renderDraft(before, assets).html;
      expect(old).not.toContain('aria-hidden="true" src=');
      expect(old).toMatch(/<svg class="(bl bl-1|sprig sprig-top)"/);
    }
  });
});

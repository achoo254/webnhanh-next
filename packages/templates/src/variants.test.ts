import { describe, expect, it } from 'vitest';
import { DRAFT_SCHEMAS, templateDraft } from './templates';
import { artFile, templateVariants, VARIANT_FILES, variantSchema } from './variants';

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, unknown>;
  }
}

const variants = templateVariants();

describe('template variants', () => {
  it('imports every file under variants/', () => {
    const files = Object.keys(import.meta.glob('../variants/*/*.json')).map((path) => path.replace('../variants/', ''));
    expect(Object.keys(VARIANT_FILES).sort()).toEqual(files.sort());
  });

  it('has the planned sets', () => {
    const count = (template: string) => variants.filter((v) => v.template === template).length;
    expect(count('shop')).toBe(6);
    expect(count('wedding')).toBe(4);
    expect(count('tet')).toBeGreaterThanOrEqual(2);
    expect(count('cafe')).toBeGreaterThanOrEqual(2);
    expect(count('profile')).toBeGreaterThanOrEqual(2);
  });

  it.each(variants.map((v) => [`${v.template}/${v.id}`, v] as const))('%s: its copy, look and palette fit the template', (_name, variant) => {
    const base = templateDraft(variant.template, () => '11111111-1111-4111-8111-111111111111', true).draft as Record<string, unknown>;
    for (const field of Object.keys(variant.copy)) expect(typeof base[field], field).toBe('string');
    const draft = { ...base, ...variant.copy, style: variant.style, palette: variant.palette };
    expect(DRAFT_SCHEMAS[variant.template].safeParse(draft).success).toBe(true);
    expect(artFile(variant, 'cover')).toBe(`library/${variant.template}/${variant.id}/cover.webp`);
  });

  it('refuses art that could draw words, a reference drawn later, or klein-edit without one', () => {
    const [first] = variants;
    if (!first) throw new Error('no variants');
    const art = { slot: 'cover', model: 'qwen', size: '1104x1472', prompt: 'a bowl of noodles on a table, warm light', seed: null };
    expect(variantSchema.safeParse({ ...first, art: [art] }).success).toBe(false);
    const ok = { ...art, prompt: `${art.prompt}, no text` };
    expect(variantSchema.safeParse({ ...first, art: [ok] }).success).toBe(true);
    expect(variantSchema.safeParse({ ...first, art: [{ ...ok, model: 'klein-edit' }] }).success).toBe(false);
    expect(variantSchema.safeParse({ ...first, art: [{ ...ok, slot: 'b', model: 'klein-edit', ref: 'a' }, { ...ok, slot: 'a' }] }).success).toBe(false);
    expect(variantSchema.safeParse({ ...first, art: [ok, { ...ok, model: 'zimage' }] }).success).toBe(false);
  });
});

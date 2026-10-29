import { TEMPLATE_IDS } from '@webnhanh/templates';
import { variantsOf } from '@webnhanh/templates/variants';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../messages';
import { interleavedVariantChoices, variantChoices } from './template-variant-choices';

describe('template variant choices', () => {
  it.each(TEMPLATE_IDS)('offers every look of %s, in file order, each with a thumbnail and a name in both languages', (template) => {
    const choices = variantChoices(template);
    expect(choices.map((choice) => choice.id)).toEqual(variantsOf(template).map((variant) => variant.id));
    for (const [index, variant] of variantsOf(template).entries()) {
      const choice = choices[index];
      expect(choice?.thumb, variant.id).toBeTruthy();
      expect(choice?.label).toBe(`variant.${template}.${variant.id}`);
      if (!choice) continue;
      // The Vietnamese name is the one the variant file gives.
      expect(DICTIONARIES.vi[choice.label]).toBe(variant.label);
      expect(DICTIONARIES.en[choice.label].length).toBeGreaterThan(0);
    }
  });

  it('lays every look of every template out once for the landing, the templates taking turns', () => {
    const all = interleavedVariantChoices();
    const expected = TEMPLATE_IDS.flatMap((template) => variantChoices(template));
    expect(all).toHaveLength(expected.length);
    expect(new Set(all.map((choice) => choice.label))).toEqual(new Set(expected.map((choice) => choice.label)));
    // The first round shows one look of each template before any template shows a second.
    expect(new Set(all.slice(0, TEMPLATE_IDS.length).map((choice) => choice.label.split('.')[1]))).toEqual(new Set(TEMPLATE_IDS));
  });
});

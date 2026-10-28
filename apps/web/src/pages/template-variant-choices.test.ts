import { TEMPLATE_IDS } from '@webnhanh/templates';
import { variantsOf } from '@webnhanh/templates/variants';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../messages';
import { variantChoices } from './template-variant-choices';

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
});

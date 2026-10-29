/**
 * The looks (variants) of each template as the template picker offers them: id, name and a small thumbnail. Read from
 * the thumbnails the art script writes (`packages/templates/thumbs/<template>/<variant>.webp`, 240 px): the app
 * bundles only their URLs (each file loads when shown), not the variant files with their prompts. The test checks
 * the thumbnails, the names and `packages/templates/variants/` agree.
 */
import type { TemplateId } from '@webnhanh/templates';
import { isMessageKey, type MessageKey } from '../i18n';

const THUMBS = import.meta.glob<string>('../../../../packages/templates/thumbs/*/*.webp', { eager: true, query: '?url', import: 'default' });

export interface VariantChoice {
  readonly id: string;
  /** `variant.<template>.<id>` in messages.ts. */
  readonly label: MessageKey;
  readonly thumb: string;
}

const THUMB_PATH = /\/thumbs\/([a-z]+)\/([a-z0-9-]+)\.webp$/;

/** Every variant with a thumbnail and a name, by template, in file order (the order of the variant files). */
const CHOICES: ReadonlyMap<string, readonly VariantChoice[]> = (() => {
  const byTemplate = new Map<string, VariantChoice[]>();
  for (const [file, thumb] of Object.entries(THUMBS).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const match = THUMB_PATH.exec(file);
    const [, template, id] = match ?? [];
    if (!template || !id) continue;
    const label = `variant.${template}.${id}`;
    if (!isMessageKey(label)) continue;
    byTemplate.set(template, [...(byTemplate.get(template) ?? []), { id, label, thumb }]);
  }
  return byTemplate;
})();

/** The looks of `template` the picker offers; the first is preselected. */
export function variantChoices(template: TemplateId): readonly VariantChoice[] {
  return CHOICES.get(template) ?? [];
}

/**
 * Every look of every template, the templates taking turns (a shop, a Tết card, a wedding…, then the next look of
 * each), for the landing's wall of templates.
 */
export function interleavedVariantChoices(): readonly VariantChoice[] {
  const lists = [...CHOICES.values()];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const result: VariantChoice[] = [];
  for (let index = 0; index < longest; index += 1) {
    for (const list of lists) {
      const choice = list[index];
      if (choice) result.push(choice);
    }
  }
  return result;
}

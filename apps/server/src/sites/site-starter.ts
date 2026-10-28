/**
 * What a new template site starts with: the template's sample photos and new draft, or, when the owner chose one of
 * its variants, that variant's library pictures (`packages/templates/library/`) and the draft `variantDraft` makes.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { TEMPLATE_SAMPLES, templateDraft, type SamplePhoto, type TemplateDraft, type TemplateId } from '@webnhanh/templates';
import { findVariant, variantDraft, variantPhotos, type TemplateVariant } from '@webnhanh/templates/variants';
import { HttpError } from '../http-error';

/** The templates package, found through its package.json so the path holds in the bundle too. */
const TEMPLATES_DIR = path.dirname(createRequire(import.meta.url).resolve('@webnhanh/templates/package.json'));
/** The templates' sample photos. */
const SAMPLES_DIR = path.join(TEMPLATES_DIR, 'samples');

/** Every sample photo of `template`, each once, in the order the template lists them. */
function samplesOf(template: TemplateId): SamplePhoto[] {
  const byFile = new Map<string, SamplePhoto>();
  for (const value of Object.values(TEMPLATE_SAMPLES[template])) {
    for (const photo of Array.isArray(value) ? value : [value]) byFile.set(photo.file, photo);
  }
  return [...byFile.values()];
}

/** A picture a new site starts with: where it is copied from, its id in the site, and whether the editor marks it. */
interface StarterPhoto {
  readonly id: string;
  readonly source: string;
  readonly width: number;
  readonly height: number;
  /** A sample photo for the owner to replace (a variant's ornaments are not). */
  readonly sample: boolean;
}

/** The pictures and draft of a new site: the template's samples, or the chosen variant's library pictures. */
export function starter(template: TemplateId, variant: TemplateVariant | null): { photos: StarterPhoto[]; draft: TemplateDraft } {
  if (variant) {
    const photos = variantPhotos(variant).map((photo) => ({ ...photo, id: randomUUID(), source: path.join(TEMPLATES_DIR, photo.file), sample: !photo.decoration }));
    const idOf = new Map(photos.map((photo) => [photo.slot, photo.id]));
    const draft = variantDraft(variant, (slot) => {
      const id = idOf.get(slot);
      if (!id) throw new Error(`variant picture ${slot} was not copied`);
      return id;
    });
    return { photos, draft };
  }
  const photos = samplesOf(template).map((sample) => ({ ...sample, id: randomUUID(), source: path.join(SAMPLES_DIR, sample.file), sample: true }));
  const idOf = new Map(photos.map((photo) => [photo.file, photo.id]));
  const draft = templateDraft(template, (photo) => {
    const id = idOf.get(photo.file);
    if (!id) throw new Error(`sample ${photo.file} was not copied`);
    return id;
  });
  return { photos, draft };
}

/** The variant `input` names for `template`: null when none is named, 400 `unknown-variant` when it has no such one. */
export function chosenVariant(template: TemplateId, input: unknown): TemplateVariant | null {
  if (input === undefined || input === null) return null;
  const variant = typeof input === 'string' ? findVariant(template, input) : null;
  if (!variant) throw new HttpError(400, 'unknown-variant');
  return variant;
}

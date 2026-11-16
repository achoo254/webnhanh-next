/**
 * A template look as the editor of a visitor without an account starts it: the same draft `variantDraft` makes for a
 * new site on the server, with the look's library pictures served by the app itself (bundled assets) instead of
 * copied into a site.
 */
import { isTemplateId, type TemplateDraft } from '@webnhanh/templates';
import { findVariant, variantDraft, variantPhotos, variantsOf, type TemplateVariant } from '@webnhanh/templates/variants';
import type { SiteImage } from '../sites-api';

/** URLs of every library picture (`packages/templates/library/<template>/<variant>/<slot>.webp`); each loads when shown. */
const LIBRARY = import.meta.glob<string>('../../../../packages/templates/library/*/*/*.webp', { eager: true, query: '?url', import: 'default' });

/** The app's URL of a library file (`library/<template>/<variant>/<slot>.webp`), or null when it is not bundled. */
export function libraryUrl(file: string): string | null {
  const suffix = `/packages/templates/${file}`;
  const entry = Object.entries(LIBRARY).find(([path]) => path.endsWith(suffix));
  return entry ? entry[1] : null;
}

/**
 * One picture of a visitor's draft: its size and id as the editor knows photos, where it shows from (a library URL
 * or, for a photo the visitor chose, a `data:` URL of it), and the variant slot it came from (null for their own).
 */
export interface GuestPhoto {
  readonly image: SiteImage;
  readonly url: string;
  readonly slot: string | null;
}

/** The template and look a visitor opens: `template` must be one, an unknown look falls back to the first one. */
export function pickedLook(template: string | null, variant: string | null): TemplateVariant | null {
  if (!isTemplateId(template)) return null;
  return (variant ? findVariant(template, variant) : null) ?? variantsOf(template)[0] ?? null;
}

/** A visitor's new draft of `look`: its draft and its library pictures, each under a new id. */
export function freshGuestDraft(look: TemplateVariant): { value: TemplateDraft; photos: GuestPhoto[] } {
  const photos: GuestPhoto[] = variantPhotos(look).map((photo) => {
    const url = libraryUrl(photo.file);
    if (!url) throw new Error(`library picture ${photo.file} is not bundled`);
    return {
      image: { id: crypto.randomUUID(), width: photo.width, height: photo.height, widths: [photo.width], sample: !photo.decoration },
      url,
      slot: photo.slot,
    };
  });
  const value = variantDraft(look, (slot) => {
    const photo = photos.find((item) => item.slot === slot);
    if (!photo) throw new Error(`variant picture ${slot} missing`);
    return photo.image.id;
  });
  return { value, photos };
}

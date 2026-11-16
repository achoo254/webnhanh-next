/**
 * The preview of a visitor's draft. The renderer only takes plain relative asset URLs (`assertAssetUrl`), and the
 * page's CSP only allows its own pictures; a visitor's photos live in the browser as `data:` URLs. So the page is
 * rendered with a stand-in URL per photo (`/guest-photo/<id>-<width>.webp`, made here from an id the app generated),
 * then each stand-in is swapped for the photo's real URL and the frame's CSP allows `data:` pictures. The frame still
 * runs no script; the published page is rendered on the server from the uploaded photos, never from this.
 */
import { imageAsset, type ImageAsset, type TemplateDraft } from '@webnhanh/templates';
import type { SiteImage } from '../sites-api';
import { previewHtml } from '../editor/site-editor';

/** A photo the browser read (`FileReader`): base64 only, so nothing in it can leave the attribute it is put in. */
const PHOTO_DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const standIn = (id: string, width: number): string => `/guest-photo/${id}-${width}.webp`;

/** The assets of the draft's photos, each at its stand-in URL. */
export function guestAssets(images: ReadonlyMap<string, SiteImage>): Map<string, ImageAsset> {
  return new Map([...images].map(([id, image]) => [id, imageAsset(image, (width) => standIn(id, width))]));
}

/** The CSP's picture rule as the renderer writes it in the page's meta tag (escaped). */
const IMG_SRC_SELF = 'img-src &#39;self&#39;';

/**
 * The preview page of a visitor's draft: rendered like any preview, then the stand-ins swapped for `urls` (a library
 * picture's app URL, or a `data:` URL of a chosen photo).
 */
export function guestPreviewHtml(value: TemplateDraft, images: ReadonlyMap<string, SiteImage>, urls: ReadonlyMap<string, string>, siteName: string): string {
  let html = previewHtml(value, guestAssets(images), siteName);
  let hasData = false;
  for (const [id, image] of images) {
    const url = urls.get(id);
    if (!url) continue;
    const isData = PHOTO_DATA_URL.test(url);
    // A data URL is base64 (no quote, space or angle bracket); an app URL with a space (the dev server's file paths)
    // is encoded so it cannot split a srcset. Vite's URLs come encoded already: those are left as they are.
    const real = isData || !/\s/.test(url) ? url : encodeURI(url);
    if (!isData && (url.startsWith('data:') || /["'<>\s]/.test(real))) continue;
    hasData ||= isData;
    for (const width of image.widths) html = html.replaceAll(standIn(id, width), real);
  }
  return hasData ? html.replace(IMG_SRC_SELF, `${IMG_SRC_SELF} data:`) : html;
}

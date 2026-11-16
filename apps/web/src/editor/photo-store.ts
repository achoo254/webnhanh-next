import { thumbUrl, uploadImage, type SiteImage } from '../sites-api';

/**
 * Where the editor's photo fields put a chosen photo and read its thumbnail from. A site's editor uploads to the
 * site (`sitePhotoStore`); the editor of a visitor without an account keeps photos in the browser
 * (`guest/guest-photo-store.ts`) until they sign up and publish.
 */
export interface PhotoStore {
  /** Takes in one photo (type and size already checked), reporting progress from 0 to 1. */
  readonly upload: (file: File, onProgress: (fraction: number) => void, signal: AbortSignal) => Promise<SiteImage>;
  /** A URL of the photo at least `min` pixels wide where there is one, for the field's thumbnail. */
  readonly thumb: (image: SiteImage, min: number) => string;
}

/** The photos of a site on the server: uploaded to it and read back from the editor's image route. */
export function sitePhotoStore(siteId: string): PhotoStore {
  return {
    upload: (file, onProgress, signal) => uploadImage(siteId, file, onProgress, signal),
    thumb: (image, min) => thumbUrl(siteId, image, min),
  };
}

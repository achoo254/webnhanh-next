/**
 * The photo store of the editor of a visitor without an account: a chosen photo is made smaller in the browser (a
 * page never shows it larger, and IndexedDB and the preview stay light), kept in IndexedDB and shown from a `data:`
 * URL. It reaches the server only once the visitor signed up and publishes, where it is checked and cleaned like any
 * upload.
 */
import { ApiError } from '../api';
import type { PhotoStore } from '../editor/photo-store';
import type { SiteImage } from '../sites-api';
import { dataUrlOf, putGuestPhoto } from './guest-draft-storage';
import { shrinkPhoto } from './guest-photo-shrink';
import type { GuestPhoto } from './guest-library';

/** What the guest editor keeps of its photos outside React state: where each shows from and their bytes. */
export interface GuestPhotos {
  readonly store: PhotoStore;
  /** Where each photo of the draft shows from, by id. */
  readonly urls: Map<string, string>;
  /** The visitor's own photos, by id, for the transfer. */
  readonly blobs: Map<string, Blob>;
  /** The slot each library picture fills, by id. */
  readonly slots: Map<string, string>;
  /** Resolves once every photo chosen so far is kept (or could not be). */
  readonly settled: () => Promise<void>;
  /** False once a photo could not be kept in this browser: it would be lost on sign-up. */
  readonly kept: () => boolean;
}

/** The store of a draft that starts with `photos` (and `blobs`, the visitor's own); `onKeepFailed` when storage refuses. */
export function guestPhotos(photos: readonly GuestPhoto[], blobs: ReadonlyMap<string, Blob>, onKeepFailed: () => void): GuestPhotos {
  const urls = new Map(photos.map((photo) => [photo.image.id, photo.url]));
  const slots = new Map(photos.flatMap((photo) => (photo.slot ? [[photo.image.id, photo.slot] as const] : [])));
  const own = new Map(blobs);
  let pending: Promise<unknown> = Promise.resolve();
  let allKept = true;
  const store: PhotoStore = {
    upload: async (file, onProgress, signal) => {
      onProgress(0.1);
      const small = await shrinkPhoto(file);
      if (signal.aborted) throw new ApiError(0, 'aborted');
      onProgress(0.6);
      const id = crypto.randomUUID();
      const url = await dataUrlOf(small.blob);
      const keeping = putGuestPhoto(id, small.blob).then((ok) => {
        if (!ok) {
          allKept = false;
          onKeepFailed();
        }
      });
      pending = pending.then(() => keeping);
      urls.set(id, url);
      own.set(id, small.blob);
      onProgress(1);
      const image: SiteImage = { id, width: small.width, height: small.height, widths: [small.width], sample: false };
      return image;
    },
    thumb: (image) => urls.get(image.id) ?? '',
  };
  return { store, urls, blobs: own, slots, settled: async () => void (await pending), kept: () => allKept };
}

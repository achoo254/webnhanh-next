import type { SiteImage } from '../../sites-api';
import type { PhotoStore } from '../photo-store';

/** What every template's form gets from the editor. */
export interface FormProps<D> {
  readonly photos: PhotoStore;
  readonly draft: D;
  /** Takes an updater: an upload finishing seconds later must apply to the draft as it is then, not as it was. */
  readonly update: (change: (draft: D) => D) => void;
  /** The site's photos by id. */
  readonly images: ReadonlyMap<string, SiteImage>;
  /** A photo was uploaded: the editor keeps it among the site's photos. */
  readonly onImage: (image: SiteImage) => void;
  /** The message of the publish issue of `field` (a dotted path) when it is shown, else null. */
  readonly issueText: (field: string) => string | null;
  /** The site being edited: its name (its address) and whether it is live yet, for links to send (a wedding's invitations). */
  readonly site?: { readonly name: string; readonly published: boolean };
}

import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { SiteImage } from '../sites-api';
import { ImageField } from './image-field';

/** A list of photos (a wedding's "Khoảnh khắc"): each can be changed or removed, more added up to `max`. */
export function GalleryField({
  siteId,
  ids,
  max,
  images,
  onChange,
  onImage,
}: {
  readonly siteId: string;
  readonly ids: readonly string[];
  readonly max: number;
  readonly images: ReadonlyMap<string, SiteImage>;
  /** Takes an updater, like the draft: uploads finish later. */
  readonly onChange: (change: (ids: readonly string[]) => string[]) => void;
  readonly onImage: (image: SiteImage) => void;
}): ReactNode {
  const { t } = useI18n();
  return (
    <div className="gallery-edit">
      {ids.map((id, index) => (
        <ImageField
          key={id}
          siteId={siteId}
          label={t('editor.gallery.photo', { n: index + 1 })}
          image={images.get(id) ?? null}
          onUploaded={(image) => {
            onImage(image);
            onChange((list) => list.map((item) => (item === id ? image.id : item)));
          }}
          onRemove={() => onChange((list) => list.filter((item) => item !== id))}
          dataId={`gallery-${index}`}
        />
      ))}
      {ids.length < max ? (
        <ImageField
          // A new slot after each upload, so the next photo starts fresh.
          key={`add-${ids.length}`}
          siteId={siteId}
          label={t('editor.gallery.add', { count: ids.length, max })}
          image={null}
          onUploaded={(image) => {
            onImage(image);
            onChange((list) => (list.includes(image.id) || list.length >= max ? [...list] : [...list, image.id]));
          }}
          onRemove={() => undefined}
          dataId="gallery-add"
        />
      ) : null}
    </div>
  );
}

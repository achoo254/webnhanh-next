import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES, thumbUrl, uploadImage, type SiteImage } from '../sites-api';

/**
 * One photo slot of the draft: the current photo (marked when it is a template sample), a button to choose a new
 * one with upload progress, and one to remove it. The type and size are checked here first to spare a wasted upload;
 * the server checks again by the file's bytes.
 */
export function ImageField({
  siteId,
  label,
  image,
  onUploaded,
  onRemove,
  dataId,
  wide = false,
}: {
  readonly siteId: string;
  readonly label: string;
  readonly image: SiteImage | null;
  readonly onUploaded: (image: SiteImage) => void;
  readonly onRemove: () => void;
  readonly dataId: string;
  readonly wide?: boolean;
}): ReactNode {
  const { t } = useI18n();
  const inputId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const choose = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError('image.type');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('image.tooLarge');
      return;
    }
    setError(null);
    setProgress(0);
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    uploadImage(siteId, file, setProgress, controller.signal)
      .then((uploaded) => {
        setProgress(null);
        onUploaded(uploaded);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setProgress(null);
        setError(errorMessage(failure));
      });
  };

  const uploading = progress !== null;
  return (
    <div className={`image-field${wide ? ' image-field-wide' : ''}`} data-id={dataId}>
      <div className="image-field-media">
        {image ? <img src={thumbUrl(siteId, image, wide ? 960 : 300)} alt="" /> : <span className="image-field-none">{t('image.none')}</span>}
        {image?.sample ? <span className="badge badge-sample">{t('image.sample')}</span> : null}
      </div>
      <div className="image-field-controls">
        <span className="field-label">{label}</span>
        {uploading ? (
          <label className="upload-progress">
            {t('image.uploading', { percent: Math.round(progress * 100) })}
            <progress max={1} value={progress} />
          </label>
        ) : (
          <div className="image-field-buttons">
            <label className="pill pill-dark pill-small" htmlFor={inputId} data-id={`${dataId}-choose`}>
              {image ? t('image.change') : t('image.choose')}
            </label>
            <input id={inputId} className="visually-hidden" type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} onChange={choose} />
            {image ? (
              <button type="button" className="pill pill-ghost pill-small" onClick={onRemove} data-id={`${dataId}-remove`}>
                {t('image.remove')}
              </button>
            ) : null}
          </div>
        )}
        {error ? (
          <p className="field-error" role="alert">
            {t(error)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

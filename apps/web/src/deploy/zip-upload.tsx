/** The source of a zip site: whether a zip is there, and a drop zone (or file picker) to upload a new one. */
import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { MAX_ZIP_BYTES, uploadZip } from '../builds-api';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';

const isZip = (file: File): boolean => /\.zip$/i.test(file.name);

export function ZipUpload({
  siteId,
  hasZip,
  disabled,
  onUploaded,
}: {
  readonly siteId: string;
  readonly hasZip: boolean;
  /** While a build runs the zip it uses stays as it is. */
  readonly disabled: boolean;
  readonly onUploaded: () => void;
}): ReactNode {
  const { t } = useI18n();
  const inputId = useId();
  const headingId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const busy = progress !== null;
  const off = busy || disabled;

  const upload = async (file: File): Promise<void> => {
    setUploaded(null);
    if (!isZip(file)) {
      setError('deploy.zip.notZip');
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      setError('deploy.zip.tooBig');
      return;
    }
    setError(null);
    setProgress(0);
    try {
      await uploadZip(siteId, file, setProgress);
      setUploaded(file.name);
      onUploaded();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setProgress(null);
    }
  };

  const drop = (event: DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file && !off) void upload(file);
  };

  const percent = Math.round((progress ?? 0) * 100);
  let note: ReactNode = <p className="hint">{t(disabled ? 'deploy.zip.wait' : 'deploy.zip.help')}</p>;
  if (busy) note = <p className="hint">{t('deploy.zip.uploading', { n: percent })}</p>;
  else if (error)
    note = (
      <p className="field-error" role="alert">
        {t(error)}
      </p>
    );
  else if (uploaded)
    note = (
      <p className="settings-status settings-status-saved" role="status">
        {t('deploy.zip.done', { name: uploaded })}
      </p>
    );

  return (
    <section className="panel" aria-labelledby={headingId} data-id="deploy-zip">
      <div className="panel-head">
        <h2 id={headingId} className="panel-title">
          {t('deploy.zip.title')}
        </h2>
        <span className={`badge badge-dot ${hasZip ? 'badge-live' : 'badge-warn'}`}>{t(hasZip ? 'deploy.zip.has' : 'deploy.zip.none')}</span>
      </div>
      <div className="field" data-id="deploy-zip-upload">
        <label
          className={`dropzone${over ? ' is-over' : ''}${off ? ' is-off' : ''}`}
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            if (!off) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <span className="dropzone-title">{t('deploy.zip.replace')}</span>
          <span className="dropzone-hint">{t('deploy.zip.drop')}</span>
          <input
            id={inputId}
            className="visually-hidden"
            type="file"
            accept=".zip,application/zip"
            disabled={off}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
        </label>
        {busy ? (
          <div className="upload-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={t('deploy.zip.replace')}>
            <span style={{ width: `${percent}%` }} />
          </div>
        ) : null}
        {note}
      </div>
    </section>
  );
}

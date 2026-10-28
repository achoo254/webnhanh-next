import { checkSiteName } from '@trang/db/site-name';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { siteHost, SITES_DOMAIN } from '../brand';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { renameSite, type Job, type Site } from '../sites-api';

const NAME_REASONS: Readonly<Record<'format' | 'reserved' | 'sensitive', MessageKey>> = {
  format: 'name.format',
  reserved: 'name.reserved',
  sensitive: 'name.sensitive',
};

/** The page's address, and changing it (a published page is published again under the new one). */
export function AddressPanel({
  site,
  onRenamed,
}: {
  readonly site: Site;
  readonly onRenamed: (site: Site, job: Job | null) => void;
}): ReactNode {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(site.name);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const noteId = useId();
  const check = checkSiteName(name);
  const shown = (!check.ok && name.trim() !== '' ? NAME_REASONS[check.reason] : null) ?? error;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!check.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await renameSite(site.id, check.name);
      onRenamed(result.site, result.job);
      setEditing(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-labelledby={`${inputId}-title`} data-id="address">
      <h2 id={`${inputId}-title`} className="panel-title">
        {t('address.title')}
      </h2>
      {editing ? (
        <form onSubmit={(event) => void submit(event)} noValidate>
          <label className="visually-hidden" htmlFor={inputId}>
            {t('address.title')}
          </label>
          <div className="address-input">
            <input
              id={inputId}
              className="input"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={30}
              aria-invalid={shown !== null}
              aria-describedby={noteId}
              data-id="address-input"
            />
            <span className="address-suffix">.{SITES_DOMAIN}</span>
          </div>
          <p id={noteId} className={shown ? 'field-error' : 'hint'}>
            {shown ? t(shown) : site.published ? t('address.held') : t('new.name.help')}
          </p>
          <div className="row">
            <button type="submit" className="pill pill-dark pill-small" disabled={!check.ok || busy} data-id="address-save">
              {t('address.save')}
            </button>
            <button
              type="button"
              className="pill pill-ghost pill-small"
              onClick={() => {
                setEditing(false);
                setName(site.name);
                setError(null);
              }}
            >
              {t('address.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="row">
          <strong className="address-current" data-id="address-current">
            {siteHost(site.name)}
          </strong>
          <button type="button" className="pill pill-ghost pill-small" onClick={() => setEditing(true)} data-id="address-change">
            {t('address.change')}
          </button>
        </div>
      )}
    </section>
  );
}

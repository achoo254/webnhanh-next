import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from './api';
import { siteHost } from './brand';
import { errorMessage } from './error-messages';
import { useI18n, type MessageKey } from './i18n';
import { deleteSite } from './sites-api';

/** What `navigate` hands the home page after a deletion: it says which site went. */
export interface DeletedSiteState {
  readonly deletedSite: string;
}

export function isDeletedSiteState(value: unknown): value is DeletedSiteState {
  return typeof value === 'object' && value !== null && typeof (value as { deletedSite?: unknown }).deletedSite === 'string';
}

/** Refusals worded for a deletion; anything else reads as elsewhere in the app. */
const DELETE_REFUSALS: Readonly<Record<string, MessageKey>> = {
  'confirm-name': 'delete.error.confirm',
  'job-active': 'delete.error.jobActive',
  'report-open': 'delete.error.reportOpen',
  'site-removed': 'delete.error.removed',
  'account-locked': 'delete.error.locked',
};

/**
 * "Xoá website" at the foot of the editor (template sites) and the deploy page (developer sites): what is lost, the
 * name typed again, and a danger button that only works once it matches. Home says which site went.
 */
export function DeleteSitePanel({ siteId, siteName }: { readonly siteId: string; readonly siteName: string }): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const titleId = useId();
  const inputId = useId();
  const noteId = useId();
  const matches = typed.trim() === siteName;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSite(siteId, typed.trim());
      const state: DeletedSiteState = { deletedSite: siteName };
      void navigate('/', { state });
    } catch (failure) {
      setError((failure instanceof ApiError ? DELETE_REFUSALS[failure.code] : undefined) ?? errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <section className="panel panel-danger" aria-labelledby={titleId} data-id="delete-site">
      <h2 id={titleId} className="panel-title">
        {t('delete.title')}
      </h2>
      <p className="hint">{t('delete.body', { host: siteHost(siteName) })}</p>
      <form className="field" onSubmit={(event) => void submit(event)} noValidate>
        <label className="field-label" htmlFor={inputId}>
          {t('delete.label', { name: siteName })}
        </label>
        <input
          id={inputId}
          className="input"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
            setError(null);
          }}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={noteId}
          data-id="delete-site-confirm"
        />
        <p id={noteId} className={error ? 'field-error' : 'hint'} role={error ? 'alert' : undefined}>
          {error ? t(error) : t('delete.help')}
        </p>
        <div className="row">
          <button type="submit" className="pill pill-danger" disabled={!matches || busy} aria-busy={busy} data-id="delete-site-submit">
            {t('delete.submit')}
          </button>
        </div>
      </form>
    </section>
  );
}

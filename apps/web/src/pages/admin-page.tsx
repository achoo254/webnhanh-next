import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Account } from '../api';
import {
  findSite,
  listActions,
  listReports,
  listReviews,
  runAdminCommand,
  type AdminActionView,
  type AdminCommand,
  type AdminSite,
  type Report,
} from '../admin-api';
import { siteHost } from '../brand';
import { errorMessage } from '../error-messages';
import { NotificationSettingsPanel } from '../orders/notification-settings';
import { isMessageKey, useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';
import { NotFoundContent } from './not-found';
import { Loader } from '../loading';

/** After an action the worker applies, the lists are read again this much later to show it applied. */
const RELOAD_AFTER_MS = 2_000;

function label(t: (key: MessageKey) => string, key: string, fallback: string): string {
  return isMessageKey(key) ? t(key) : fallback;
}

/** The buttons for one site: open it, take it down or restore it, decide its review, lock or unlock its account. */
function SiteActions({ site, reportId, run }: { readonly site: AdminSite; readonly reportId?: string; readonly run: (command: AdminCommand, confirm?: MessageKey) => void }): ReactNode {
  const { t } = useI18n();
  const url = `https://${siteHost(site.name)}/`;
  return (
    <div className="admin-actions" data-id={`admin-site-${site.name}`}>
      <span className="badge badge-draft">{label(t, `admin.status.${site.status}`, site.status)}</span>
      {site.accountLocked ? <span className="badge badge-warn">{t('admin.accountLocked')}</span> : null}
      {site.actionQueued ? <span className="badge badge-busy">{t('admin.applying')}</span> : null}
      <a className="pill pill-ghost pill-small" href={url} target="_blank" rel="noopener noreferrer nofollow">
        {t('admin.open')}
      </a>
      {site.status === 'removed' ? (
        <button type="button" className="pill pill-ghost pill-small" onClick={() => run({ kind: 'site', action: 'restore', siteId: site.id })} data-id="admin-restore">
          {t('admin.restore')}
        </button>
      ) : (
        <button
          type="button"
          className="pill pill-dark pill-small"
          onClick={() => run({ kind: 'site', action: 'takedown', siteId: site.id, reportId }, 'admin.confirm.takedown')}
          data-id="admin-takedown"
        >
          {t('admin.takedown')}
        </button>
      )}
      {site.status === 'pending-review' ? (
        <>
          <button type="button" className="pill pill-ghost pill-small" onClick={() => run({ kind: 'site', action: 'approve', siteId: site.id })} data-id="admin-approve">
            {t('admin.approve')}
          </button>
          <button
            type="button"
            className="pill pill-ghost pill-small"
            onClick={() => run({ kind: 'site', action: 'reject', siteId: site.id }, 'admin.confirm.reject')}
            data-id="admin-reject"
          >
            {t('admin.reject')}
          </button>
        </>
      ) : null}
      {site.accountLocked ? (
        <button type="button" className="pill pill-ghost pill-small" onClick={() => run({ kind: 'account', action: 'unlock', accountId: site.accountId })} data-id="admin-unlock">
          {t('admin.unlock')}
        </button>
      ) : (
        <button
          type="button"
          className="pill pill-ghost pill-small"
          onClick={() => run({ kind: 'account', action: 'lock', accountId: site.accountId }, 'admin.confirm.lock')}
          data-id="admin-lock"
        >
          {t('admin.lock')}
        </button>
      )}
    </div>
  );
}

function ReviewDetails({ site }: { readonly site: AdminSite }): ReactNode {
  const { t } = useI18n();
  if (!site.review) return null;
  return (
    <>
      <p>{site.review.reasons.map((reason) => label(t, `admin.reason.${reason}`, reason)).join(' · ')}</p>
      <ul className="hint">
        {site.review.matches.map((match) => (
          <li key={match}>
            <code>{match}</code>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The admin tools (`/admin`), for the accounts of ADMIN_SUBS only: everyone else gets the not-found page (the server
 * answers 404 to them as well). Reports, releases held for review, a site by name, and the log of every action.
 */
export function AdminPage(): ReactNode {
  return <SignedInPage>{(account) => (account.admin ? <Admin account={account} /> : <NotFoundContent />)}</SignedInPage>;
}

interface AdminLists {
  readonly reports: Report[];
  readonly reviews: AdminSite[];
  readonly actions: AdminActionView[];
}

async function fetchLists(which: 'open' | 'all'): Promise<AdminLists> {
  const [reports, reviews, actions] = await Promise.all([listReports(which), listReviews(), listActions()]);
  return { reports, reviews, actions };
}

function Admin({ account }: { readonly account: Account }): ReactNode {
  const { t, locale } = useI18n();
  const when = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const [which, setWhich] = useState<'open' | 'all'>('open');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [reviews, setReviews] = useState<AdminSite[] | null>(null);
  const [actions, setActions] = useState<AdminActionView[] | null>(null);
  const [found, setFound] = useState<AdminSite | null>(null);
  const [lookup, setLookup] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback((lists: AdminLists): void => {
    setReports(lists.reports);
    setReviews(lists.reviews);
    setActions(lists.actions);
  }, []);
  const load = useCallback(async (): Promise<void> => {
    try {
      show(await fetchLists(which));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [which, show]);

  useEffect(() => {
    let live = true;
    fetchLists(which)
      .then((lists) => {
        if (live) show(lists);
      })
      .catch((failure: unknown) => {
        if (live) setError(errorMessage(failure));
      });
    return () => {
      live = false;
    };
  }, [which, show]);

  const refreshFound = async (name: string): Promise<void> => {
    try {
      setFound(await findSite(name));
    } catch (failure) {
      setFound(null);
      setError(errorMessage(failure));
    }
  };

  const run = (command: AdminCommand, confirmKey?: MessageKey): void => {
    if (confirmKey && !window.confirm(t(confirmKey))) return;
    setError(null);
    setBusy(true);
    void runAdminCommand(command, note)
      .then(async (action) => {
        setNote('');
        await load();
        if (found) await refreshFound(found.name);
        // Takedowns, restores and review decisions are applied by the worker a moment later.
        if (action.status === 'queued') {
          setTimeout(() => {
            void load();
            if (found) void refreshFound(found.name);
          }, RELOAD_AFTER_MS);
        }
      })
      .catch((failure: unknown) => setError(errorMessage(failure)))
      .finally(() => setBusy(false));
  };

  const search = (event: FormEvent): void => {
    event.preventDefault();
    setError(null);
    if (lookup.trim() !== '') void refreshFound(lookup.trim());
  };

  return (
    <section className="admin" data-id="admin" aria-busy={busy}>
      <h1 className="page-title">{t('admin.title')}</h1>
      <p className="hint">{t('admin.signedInAs', { id: account.id.slice(0, 8) })}</p>
      <div className="field">
        <label className="field-label" htmlFor="admin-note">
          {t('admin.note')}
        </label>
        <input id="admin-note" className="input" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} data-id="admin-note" />
      </div>
      {error ? (
        <p className="notice notice-warning" role="alert">
          {t(error)}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="admin-reports" data-id="admin-reports">
        <h2 id="admin-reports" className="panel-title">
          {t('admin.reports')}
        </h2>
        <div className="row">
          <button type="button" className={`pill pill-small ${which === 'open' ? 'pill-dark' : 'pill-ghost'}`} onClick={() => setWhich('open')} aria-pressed={which === 'open'}>
            {t('admin.reports.open')}
          </button>
          <button type="button" className={`pill pill-small ${which === 'all' ? 'pill-dark' : 'pill-ghost'}`} onClick={() => setWhich('all')} aria-pressed={which === 'all'}>
            {t('admin.reports.all')}
          </button>
        </div>
        {reports === null ? <Loader /> : null}
        {reports?.length === 0 ? <p className="hint">{t('admin.reports.empty')}</p> : null}
        <ul className="admin-list">
          {reports?.map((report) => (
            <li key={report.id} className="admin-item" data-id={`admin-report-${report.id}`}>
              <p>
                <strong>{siteHost(report.siteName)}</strong> · {label(t, `report.category.${report.category}`, report.category)} · {when.format(new Date(report.createdAt))} ·{' '}
                {label(t, `admin.report.${report.status}`, report.status)}
              </p>
              <p className="admin-text">{report.details}</p>
              {report.contact ? <p className="hint">{t('admin.contact', { contact: report.contact })}</p> : null}
              {report.site ? <SiteActions site={report.site} reportId={report.status === 'open' ? report.id : undefined} run={run} /> : <p className="hint">{t('admin.siteGone')}</p>}
              {report.status === 'open' ? (
                <div className="admin-actions">
                  <button type="button" className="pill pill-ghost pill-small" onClick={() => run({ kind: 'report', action: 'resolve', reportId: report.id })} data-id="admin-resolve">
                    {t('admin.resolve')}
                  </button>
                  <button type="button" className="pill pill-ghost pill-small" onClick={() => run({ kind: 'report', action: 'dismiss', reportId: report.id })} data-id="admin-dismiss">
                    {t('admin.dismiss')}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="admin-reviews" data-id="admin-reviews">
        <h2 id="admin-reviews" className="panel-title">
          {t('admin.reviews')}
        </h2>
        {reviews?.length === 0 ? <p className="hint">{t('admin.reviews.empty')}</p> : null}
        <ul className="admin-list">
          {reviews?.map((site) => (
            <li key={site.id} className="admin-item" data-id={`admin-review-${site.name}`}>
              <p>
                <strong>{siteHost(site.name)}</strong>
                {site.review ? ` · ${when.format(new Date(site.review.heldAt))}` : null}
              </p>
              <ReviewDetails site={site} />
              <SiteActions site={site} run={run} />
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="admin-lookup" data-id="admin-lookup">
        <h2 id="admin-lookup" className="panel-title">
          {t('admin.lookup')}
        </h2>
        <form className="row" onSubmit={search}>
          <label className="visually-hidden" htmlFor="admin-lookup-name">
            {t('admin.lookup')}
          </label>
          <input id="admin-lookup-name" className="input" value={lookup} maxLength={300} onChange={(event) => setLookup(event.target.value)} data-id="admin-lookup-name" />
          <button type="submit" className="pill pill-dark pill-small">
            {t('admin.lookup.go')}
          </button>
        </form>
        {found ? (
          <div className="admin-item">
            <p>
              <strong>{siteHost(found.name)}</strong> · {found.kind}
            </p>
            <ReviewDetails site={found} />
            <SiteActions site={found} run={run} />
          </div>
        ) : null}
      </section>

      <p className="hint">{t('admin.notify')}</p>
      <NotificationSettingsPanel />

      <section className="panel" aria-labelledby="admin-log" data-id="admin-log">
        <h2 id="admin-log" className="panel-title">
          {t('admin.log')}
        </h2>
        {actions?.length === 0 ? <p className="hint">{t('admin.log.empty')}</p> : null}
        <ul className="admin-list">
          {actions?.map((action) => (
            <li key={action.id} className="admin-log-row">
              {when.format(new Date(action.createdAt))} · {label(t, `admin.action.${action.action}`, action.action)}
              {action.siteName ? ` · ${siteHost(action.siteName)}` : ''}
              {action.accountId && !action.siteName ? ` · ${action.accountId.slice(0, 8)}` : ''} · {label(t, `admin.actionStatus.${action.status}`, action.status)}
              {action.error ? ` (${action.error})` : ''}
              {action.note ? ` · ${action.note}` : ''}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

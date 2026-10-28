import { ABUSE_EMAIL } from '@webnhanh/db/site-name';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ABUSE_CATEGORIES, submitReport, type AbuseCategory } from '../admin-api';
import { ApiError } from '../api';
import { SITES_DOMAIN } from '../brand';
import { TextField } from '../editor/text-field';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { AppPage } from '../public-page';

const CATEGORY_LABELS: Readonly<Record<AbuseCategory, MessageKey>> = {
  scam: 'report.category.scam',
  malware: 'report.category.malware',
  illegal: 'report.category.illegal',
  spam: 'report.category.spam',
  copyright: 'report.category.copyright',
  other: 'report.category.other',
};

const DETAILS_MIN = 10;

/**
 * The public abuse report (`/bao-cao?site=<name>`, linked from the foot of every published page and from
 * `/.well-known/report` of every site): no sign-in. A hidden field bots fill and the time taken to fill the form go
 * with it, as on the order form. The domain's mailbox is the other way to report.
 */
export function ReportPage(): ReactNode {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [site, setSite] = useState(() => (params.get('site') ?? '').slice(0, 300));
  const [category, setCategory] = useState<AbuseCategory | ''>('');
  const [details, setDetails] = useState('');
  const [contact, setContact] = useState('');
  const [trap, setTrap] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [invalid, setInvalid] = useState<readonly string[]>([]);
  const startedAt = useRef<number | null>(null);
  const categoryId = useId();
  const touch = (): void => {
    startedAt.current ??= Date.now();
  };

  const send = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const missing = [site.trim() === '' ? 'site' : '', category === '' ? 'category' : '', details.trim().length < DETAILS_MIN ? 'details' : ''].filter(Boolean);
    setInvalid(missing);
    if (missing.length > 0 || category === '') {
      setError('report.error.fields');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await submitReport({ site, category, details, contact, website: trap, elapsed: Date.now() - (startedAt.current ?? Date.now()) });
      setSent(true);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'invalid') {
        setInvalid(failure.fields);
        setError('report.error.fields');
      } else {
        setError(errorMessage(failure));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <AppPage>
      <article className="prose" data-id="report">
        <h1>{t('report.title')}</h1>
        <p>{t('report.lede')}</p>
        {sent ? (
          <p className="notice notice-info" role="status" data-id="report-sent">
            {t('report.sent')}
          </p>
        ) : (
          <form className="report-form" onSubmit={(event) => void send(event)} onFocus={touch} noValidate data-id="report-form">
            <TextField
              label={t('report.site')}
              value={site}
              onChange={setSite}
              maxLength={300}
              placeholder={`ten-website.${SITES_DOMAIN}`}
              error={invalid.includes('site') ? t('report.site.error') : null}
              dataId="report-site"
            />
            <div className="field">
              <label className="field-label" htmlFor={categoryId}>
                {t('report.category')}
              </label>
              <select
                id={categoryId}
                className="input"
                value={category}
                onChange={(event) => setCategory(ABUSE_CATEGORIES.find((value) => value === event.target.value) ?? '')}
                aria-invalid={invalid.includes('category') ? true : undefined}
                data-id="report-category"
              >
                <option value="">{t('report.category.pick')}</option>
                {ABUSE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {t(CATEGORY_LABELS[value])}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              label={t('report.details')}
              value={details}
              onChange={setDetails}
              maxLength={2000}
              multiline
              hint={t('report.details.hint')}
              error={invalid.includes('details') ? t('report.details.error') : null}
              dataId="report-details"
            />
            <TextField label={t('report.contact')} value={contact} onChange={setContact} maxLength={200} hint={t('report.contact.hint')} dataId="report-contact" />
            {/* A trap for bots: hidden from people and screen readers, never focused by Tab. */}
            <div className="visually-hidden" aria-hidden="true">
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={trap} onChange={(event) => setTrap(event.target.value)} />
              </label>
            </div>
            {error ? (
              <p className="notice notice-warning" role="alert">
                {t(error)}
              </p>
            ) : null}
            <button type="submit" className="pill pill-cta" disabled={sending} aria-busy={sending} data-id="report-send">
              {sending ? t('report.sending') : t('report.send')}
            </button>
          </form>
        )}
        <h2>{t('report.email.title')}</h2>
        <p>
          {t('report.email.body')}{' '}
          <a href={`mailto:${ABUSE_EMAIL}`} data-id="report-email">
            {ABUSE_EMAIL}
          </a>
        </p>
      </article>
    </AppPage>
  );
}

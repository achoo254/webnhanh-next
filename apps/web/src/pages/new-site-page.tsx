import { checkSiteName } from '@trang/db/site-name';
import { SHOP_TEMPLATE } from '@trang/templates';
import shopCover from '@trang/templates/samples/shop-cover.webp';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { SITES_DOMAIN } from '../brand';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';
import { createSite } from '../sites-api';

/** Templates still being made: shown so people know what is coming, never clickable. */
const COMING: readonly { id: string; label: MessageKey }[] = [
  { id: 'wedding', label: 'template.wedding' },
  { id: 'cafe', label: 'template.cafe' },
  { id: 'profile', label: 'template.profile' },
  { id: 'tet', label: 'template.tet' },
];

const NAME_REASONS: Readonly<Record<'format' | 'reserved' | 'sensitive', MessageKey>> = {
  format: 'name.format',
  reserved: 'name.reserved',
  sensitive: 'name.sensitive',
};

/** `/new`: choose a template (only the shop is ready), then the page's address. */
export function NewSitePage(): ReactNode {
  return <SignedInPage>{() => <NewSite />}</SignedInPage>;
}

function NewSite(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [chosen, setChosen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const helpId = useId();
  const check = name.trim() === '' ? null : checkSiteName(name);
  const localError = check && !check.ok ? NAME_REASONS[check.reason] : null;
  const shown = localError ?? error;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!check?.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      const site = await createSite(check.name, SHOP_TEMPLATE);
      navigate(`/sites/${site.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <section className="new-site" data-id="new-site">
      <Link className="back-link" to="/" data-id="new-back">
        {t('new.back')}
      </Link>
      <h1 className="page-title">{t('new.title')}</h1>
      <p className="lede">{t('new.lede')}</p>
      <ul className="bento" aria-label={t('new.title')}>
        <li className="bento-tall">
          <button type="button" className="bento-card" aria-pressed={chosen} onClick={() => setChosen(true)} data-id="template-shop">
            <img src={shopCover} alt="" />
            <span className="bento-label">
              {t('template.shop')}
              <small>{t('template.shop.note')}</small>
            </span>
          </button>
        </li>
        {COMING.map((item) => (
          <li key={item.id}>
            <div className={`bento-card bento-soon bento-${item.id}`} aria-disabled="true" data-id={`template-${item.id}`}>
              <span className="badge badge-draft">{t('new.soon')}</span>
              <span className="bento-label">{t(item.label)}</span>
            </div>
          </li>
        ))}
      </ul>

      {chosen ? (
        <form className="panel name-form" onSubmit={(event) => void submit(event)} data-id="new-name-form" noValidate>
          <label className="field-label" htmlFor={inputId}>
            {t('new.name.label')}
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
              inputMode="url"
              maxLength={30}
              // The form only appears after the person picked the template: the address is the next thing to type.
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              aria-invalid={shown !== null}
              aria-describedby={helpId}
              data-id="new-name"
            />
            <span className="address-suffix">.{SITES_DOMAIN}</span>
          </div>
          <p id={helpId} className={shown ? 'field-error' : 'hint'} role={shown ? 'alert' : undefined}>
            {shown ? t(shown) : t('new.name.help')}
          </p>
          <button type="submit" className="pill pill-cta" disabled={!check?.ok || busy} aria-busy={busy} data-id="new-submit">
            {t('new.name.submit')}
          </button>
        </form>
      ) : null}
    </section>
  );
}

import { checkSiteName } from '@webnhanh/db/site-name';
import type { TemplateId } from '@webnhanh/templates';
import cafeCover from '@webnhanh/templates/samples/cafe-cover.webp';
import shopCover from '@webnhanh/templates/samples/shop-cover.webp';
import tetPhoto from '@webnhanh/templates/samples/tet-photo.webp';
import weddingCover from '@webnhanh/templates/samples/wedding-cover.webp';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { SITES_DOMAIN } from '../brand';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';
import { createSite } from '../sites-api';

/** The templates in the order the page offers them, each with its sample picture (a profile shows a drawn avatar). */
const TEMPLATES: readonly { id: TemplateId; label: MessageKey; note: MessageKey; picture: string | null }[] = [
  { id: 'shop', label: 'template.shop', note: 'template.shop.note', picture: shopCover },
  { id: 'tet', label: 'template.tet', note: 'template.tet.note', picture: tetPhoto },
  { id: 'wedding', label: 'template.wedding', note: 'template.wedding.note', picture: weddingCover },
  { id: 'cafe', label: 'template.cafe', note: 'template.cafe.note', picture: cafeCover },
  { id: 'profile', label: 'template.profile', note: 'template.profile.note', picture: null },
];

const NAME_REASONS: Readonly<Record<'format' | 'reserved' | 'sensitive', MessageKey>> = {
  format: 'name.format',
  reserved: 'name.reserved',
  sensitive: 'name.sensitive',
};

/** `/new`: choose a template, then the page's address. */
export function NewSitePage(): ReactNode {
  return <SignedInPage>{() => <NewSite />}</SignedInPage>;
}

function NewSite(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [chosen, setChosen] = useState<TemplateId | null>(null);
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
    if (!check?.ok || busy || !chosen) return;
    setBusy(true);
    setError(null);
    try {
      const site = await createSite(check.name, chosen);
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
        {TEMPLATES.map((template, index) => (
          <li key={template.id} className={index === 0 ? 'bento-tall' : undefined}>
            <button
              type="button"
              className={`bento-card bento-${template.id}`}
              aria-pressed={chosen === template.id}
              onClick={() => {
                setChosen(template.id);
                setError(null);
              }}
              data-id={`template-${template.id}`}
            >
              {template.picture ? (
                <img src={template.picture} alt="" />
              ) : (
                <span className="bento-avatar" aria-hidden="true">
                  {t('template.profile.initials')}
                </span>
              )}
              <span className="bento-label">
                {t(template.label)}
                <small>{t(template.note)}</small>
              </span>
            </button>
          </li>
        ))}
        <li>
          <Link className="bento-card bento-developer" to="/new/developer" data-id="template-developer">
            <span className="bento-code" aria-hidden="true">
              {'</>'}
            </span>
            <span className="bento-label">
              {t('new.developer')}
              <small>{t('new.developer.note')}</small>
            </span>
          </Link>
        </li>
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
      <p className="hint">
        <Link to="/credits" data-id="new-credits">
          {t('credits.link')}
        </Link>
      </p>
    </section>
  );
}

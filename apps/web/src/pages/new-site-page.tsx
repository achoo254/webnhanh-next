import { checkSiteName } from '@webnhanh/db/site-name';
import type { TemplateId } from '@webnhanh/templates';
import cafeCover from '@webnhanh/templates/samples/cafe-cover.webp';
import shopCover from '@webnhanh/templates/samples/shop-cover.webp';
import tetPhoto from '@webnhanh/templates/samples/tet-photo.webp';
import weddingCover from '@webnhanh/templates/samples/wedding-cover.webp';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAccount } from '../account';
import { signInUrl } from '../api';
import { SITES_DOMAIN } from '../brand';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { AppPage } from '../public-page';
import { SignedInPage } from '../signed-in-page';
import { createSite } from '../sites-api';
import { variantChoices } from './template-variant-choices';

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

/**
 * What the person picked before signing up (`/new?template=…&variant=…&name=…`), checked against the templates and
 * their looks; anything else is dropped.
 */
function pickedBefore(params: URLSearchParams): { template: TemplateId | null; variant: string | null; name: string } {
  const template = TEMPLATES.find((item) => item.id === params.get('template'))?.id ?? null;
  const looks = template ? variantChoices(template) : [];
  const variant = looks.find((look) => look.id === params.get('variant'))?.id ?? looks[0]?.id ?? null;
  return { template, variant, name: template ? (params.get('name') ?? '').slice(0, 30) : '' };
}

/**
 * `/new`: choose a template, then one of its looks and the page's address. A visitor without an account picks the
 * same way; making the page is where they sign up, and they come back here with what they picked.
 */
export function NewSitePage(): ReactNode {
  const { account } = useAccount();
  if (account === null) {
    return (
      <AppPage>
        <NewSite guest />
      </AppPage>
    );
  }
  return <SignedInPage>{() => <NewSite guest={false} />}</SignedInPage>;
}

function NewSite({ guest }: { readonly guest: boolean }): ReactNode {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [before] = useState(() => pickedBefore(params));
  const [chosen, setChosen] = useState<TemplateId | null>(before.template);
  const [variant, setVariant] = useState<string | null>(before.variant);
  const [name, setName] = useState(before.name);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const helpId = useId();
  const check = name.trim() === '' ? null : checkSiteName(name);
  const localError = check && !check.ok ? NAME_REASONS[check.reason] : null;
  const shown = localError ?? error;
  const picked = new URLSearchParams({ ...(chosen ? { template: chosen } : {}), ...(variant ? { variant } : {}), name: name.trim() });
  const signUpHref = signInUrl(`/new?${picked.toString()}`, locale, true);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!check?.ok || busy || !chosen) return;
    if (guest) {
      window.location.assign(signUpHref);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const site = await createSite(check.name, chosen, variant ?? undefined);
      navigate(`/sites/${site.id}`);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <section className="new-site" data-id="new-site">
      <Link className="back-link" to="/" data-id="new-back">
        {t(guest ? 'new.guest.back' : 'new.back')}
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
                setVariant(variantChoices(template.id)[0]?.id ?? null);
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
          <VariantPicker template={chosen} value={variant} onChange={setVariant} />
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
          {guest && check?.ok ? (
            // A plain link: /auth/login is a server route.
            <a className="pill pill-cta" href={signUpHref} data-id="new-sign-up">
              {t('new.guest.submit')}
            </a>
          ) : (
            <button type="submit" className="pill pill-cta" disabled={!check?.ok || busy} aria-busy={busy} data-id="new-submit">
              {t(guest ? 'new.guest.submit' : 'new.name.submit')}
            </button>
          )}
          {guest ? (
            <p className="hint" data-id="new-guest-note">
              {t('new.guest.note')}
            </p>
          ) : null}
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

/**
 * The looks of the chosen template as radio cards (thumbnail and name), loaded lazily; arrow keys move between them.
 * Nothing shows for a template without looks.
 */
function VariantPicker({ template, value, onChange }: { readonly template: TemplateId; readonly value: string | null; readonly onChange: (id: string) => void }): ReactNode {
  const { t } = useI18n();
  const choices = variantChoices(template);
  const hintId = useId();
  if (choices.length === 0) return null;
  return (
    <fieldset className="variant-picker" aria-describedby={hintId} data-id="new-variants">
      <legend className="field-label">{t('new.variant.title')}</legend>
      <p id={hintId} className="hint">
        {t('new.variant.hint')}
      </p>
      <div className="variant-options">
        {choices.map((choice) => (
          <label key={choice.id} className="style-option variant-option" data-id={`variant-${choice.id}`}>
            <input type="radio" name="variant" value={choice.id} checked={value === choice.id} onChange={() => onChange(choice.id)} />
            <img src={choice.thumb} alt="" width={240} height={320} loading="lazy" decoding="async" />
            <span className="style-name">{t(choice.label)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

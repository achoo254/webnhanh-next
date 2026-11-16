import type { TemplateId } from '@webnhanh/templates';
import birthdayHero from '@webnhanh/templates/library/birthday/tiec-bong-bay/hero.webp';
import linksAvatar from '@webnhanh/templates/library/links/gen-z-sticker/avatar.webp';
import partyCover from '@webnhanh/templates/library/party/tiec-cong-ty-neon/cover.webp';
import cafeCover from '@webnhanh/templates/samples/cafe-cover.webp';
import shopCover from '@webnhanh/templates/samples/shop-cover.webp';
import tetPhoto from '@webnhanh/templates/samples/tet-photo.webp';
import weddingCover from '@webnhanh/templates/samples/wedding-cover.webp';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import profileCard from '../assets/template-profile-card.webp';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAccount } from '../account';
import { signInUrl } from '../api';
import { errorMessage } from '../error-messages';
import { TRY_FIRST } from '../features';
import { storedGuestLook } from '../guest/guest-draft-storage';
import { useI18n, type MessageKey } from '../i18n';
import { AppPage } from '../public-page';
import { SignedInPage } from '../signed-in-page';
import { createSite } from '../sites-api';
import { SiteNameField, useSiteName } from './site-name-field';
import { variantChoices } from './template-variant-choices';

/** The templates in the order the page offers them, each with its picture. */
const TEMPLATES: readonly { id: TemplateId; label: MessageKey; note: MessageKey; picture: string }[] = [
  { id: 'shop', label: 'template.shop', note: 'template.shop.note', picture: shopCover },
  { id: 'party', label: 'template.party', note: 'template.party.note', picture: partyCover },
  { id: 'tet', label: 'template.tet', note: 'template.tet.note', picture: tetPhoto },
  { id: 'wedding', label: 'template.wedding', note: 'template.wedding.note', picture: weddingCover },
  { id: 'cafe', label: 'template.cafe', note: 'template.cafe.note', picture: cafeCover },
  { id: 'birthday', label: 'template.birthday', note: 'template.birthday.note', picture: birthdayHero },
  { id: 'profile', label: 'template.profile', note: 'template.profile.note', picture: profileCard },
  { id: 'links', label: 'template.links', note: 'template.links.note', picture: linksAvatar },
];

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
 * `/new`: choose a template, then one of its looks, then edit it (`/new/edit`; the address comes when publishing). A
 * visitor without an account does the same and signs up when they publish. With TRY_FIRST off: the address is picked
 * here, and making the page is where a visitor signs up, coming back here with what they picked.
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
  const field = useSiteName(before.name);
  const [busy, setBusy] = useState(false);
  // A draft started earlier in this browser: offered again rather than lost by picking another template.
  const [unfinished] = useState(() => (TRY_FIRST ? storedGuestLook() : null));
  const picked = new URLSearchParams({ ...(chosen ? { template: chosen } : {}), ...(variant ? { variant } : {}) });
  const signUpHref = signInUrl(`/new?${new URLSearchParams({ ...Object.fromEntries(picked), name: field.name.trim() }).toString()}`, locale, true);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!field.valid || busy || !chosen) return;
    if (guest) {
      window.location.assign(signUpHref);
      return;
    }
    setBusy(true);
    field.setError(null);
    try {
      const site = await createSite(field.valid, chosen, variant ?? undefined);
      navigate(`/sites/${site.id}`);
    } catch (failure) {
      field.setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <section className="new-site" data-id="new-site">
      <Link className="back-link" to="/" data-id="new-back">
        {t(guest ? 'new.guest.back' : 'new.back')}
      </Link>
      <h1 className="page-title">{t('new.title')}</h1>
      {/* "No account needed" is said to visitors only. */}
      <p className="lede">{t(!TRY_FIRST ? 'new.lede' : guest ? 'new.try.lede' : 'new.try.lede.signedIn')}</p>
      {unfinished ? (
        <p className="notice notice-info" data-id="new-unfinished">
          {t('new.try.unfinished')}{' '}
          <Link to="/new/edit" data-id="new-unfinished-open">
            {t('new.try.unfinished.open')}
          </Link>
        </p>
      ) : null}
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
                field.setError(null);
              }}
              data-id={`template-${template.id}`}
            >
              <img src={template.picture} alt="" />
              <span className="bento-label">
                {t(template.label)}
                <small>{t(template.note)}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {chosen && TRY_FIRST ? (
        <div className="panel name-form" data-id="new-try">
          <VariantPicker template={chosen} value={variant} onChange={setVariant} />
          <Link className="pill pill-cta" to={`/new/edit?${picked.toString()}`} data-id="new-edit">
            {t('new.try.edit')}
          </Link>
          <p className="hint" data-id="new-try-note">
            {t(guest ? 'new.try.guestNote' : 'new.try.note')}
          </p>
        </div>
      ) : null}
      {chosen && !TRY_FIRST ? (
        <form className="panel name-form" onSubmit={(event) => void submit(event)} data-id="new-name-form" noValidate>
          <VariantPicker template={chosen} value={variant} onChange={setVariant} />
          <SiteNameField field={field} />
          {guest && field.valid ? (
            // A plain link: /auth/login is a server route.
            <a className="pill pill-cta" href={signUpHref} data-id="new-sign-up">
              {t('new.guest.submit')}
            </a>
          ) : (
            <button type="submit" className="pill pill-cta" disabled={!field.valid || busy} aria-busy={busy} data-id="new-submit">
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
      <p className="hint new-site-more">
        <Link to="/new/developer" data-id="template-developer">
          {t('new.developer.link')}
        </Link>
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

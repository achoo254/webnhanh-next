import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAccount } from '../account';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { Loader } from '../loading';
import { SiteNameField, useSiteName } from '../pages/site-name-field';
import { AppPage } from '../public-page';
import { AppSignInCard } from '../sign-in';
import { SignedInPage } from '../signed-in-page';
import { loadGuestDraft, loadGuestTransfer, type GuestDraft } from './guest-draft-storage';
import { GUEST_PUBLISH_PATH } from './guest-editor-page';
import { transferGuestDraft, type TransferStep } from './guest-transfer';

const STEP_MESSAGES: Readonly<Record<TransferStep, MessageKey>> = {
  create: 'try.step.create',
  photos: 'try.step.photos',
  save: 'try.step.save',
  publish: 'try.step.publish',
};

/**
 * `/new/publish`: where Publish of a draft made in the browser leads. Signed in (a visitor coming back from sign-up),
 * pick the address, then the draft goes into the account once and the site's editor opens with it publishing.
 * Signed out (the sign-up did not finish), the sign-up card again.
 */
export function GuestPublishPage(): ReactNode {
  const { t } = useI18n();
  const { account } = useAccount();
  if (account === undefined) {
    return (
      <AppPage>
        <Loader />
      </AppPage>
    );
  }
  if (account === null) {
    return (
      <AppPage layout="center">
        <AppSignInCard title={t('try.signUp.title')} description={t('try.signUp.body')} returnTo={GUEST_PUBLISH_PATH} signUp />
      </AppPage>
    );
  }
  return <SignedInPage>{() => <LoadPublish />}</SignedInPage>;
}

function LoadPublish(): ReactNode {
  const { t } = useI18n();
  const [draft, setDraft] = useState<GuestDraft | null | 'none'>(null);
  useEffect(() => {
    let live = true;
    loadGuestDraft()
      .then((loaded) => {
        if (live) setDraft(loaded ?? 'none');
      })
      .catch(() => {
        if (live) setDraft('none');
      });
    return () => {
      live = false;
    };
  }, []);
  if (draft === null) return <Loader />;
  if (draft === 'none') {
    return (
      <section className="new-site" data-id="guest-publish-none">
        <h1 className="page-title">{t('try.none.title')}</h1>
        <p className="lede">{t('try.none.body')}</p>
        <p>
          <Link className="pill pill-cta" to="/new" data-id="guest-publish-new">
            {t('try.none.pick')}
          </Link>
        </p>
      </section>
    );
  }
  return <PublishDraft draft={draft} />;
}

function PublishDraft({ draft }: { readonly draft: GuestDraft }): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const field = useSiteName('');
  // A transfer cut short (a reload, a refused photo) already made the site: carry on with it, no second address.
  const [resuming, setResuming] = useState(() => loadGuestTransfer() !== null);
  const [step, setStep] = useState<TransferStep | null>(null);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (step !== null || (!resuming && !field.valid)) return;
    field.setError(null);
    try {
      const siteId = await transferGuestDraft(draft, field.valid ?? '', setStep);
      navigate(`/sites/${siteId}`, { replace: true });
    } catch (failure) {
      field.setError(errorMessage(failure));
      setStep(null);
      // The site it carried on with is gone: the address is asked again.
      setResuming(loadGuestTransfer() !== null);
    }
  };

  const busy = step !== null;
  return (
    <section className="new-site" data-id="guest-publish">
      <Link className="back-link" to="/new/edit" data-id="guest-publish-back">
        {t('try.address.back')}
      </Link>
      <h1 className="page-title">{t('try.address.title')}</h1>
      <p className="lede">{t('try.address.lede')}</p>
      <form className="panel name-form" onSubmit={(event) => void submit(event)} noValidate data-id="guest-publish-form">
        {resuming ? (
          <>
            <p className="hint">{t('try.address.resume')}</p>
            {field.shown ? (
              <p className="field-error" role="alert">
                {t(field.shown)}
              </p>
            ) : null}
          </>
        ) : (
          <SiteNameField field={field} />
        )}
        <button type="submit" className="pill pill-cta" disabled={busy || (!resuming && !field.valid)} aria-busy={busy} data-id="guest-publish-submit">
          {busy ? t('publish.working') : t(resuming ? 'try.address.continue' : 'try.address.submit')}
        </button>
        <p className="hint" role="status" data-id="guest-publish-step">
          {busy ? t(STEP_MESSAGES[step]) : null}
        </p>
      </form>
    </section>
  );
}

import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { signInUrl } from './api';
import { useI18n } from './i18n';

/**
 * The sign-in card: the page's title and line, then the one call to action, "Sign in with hoandat.com", to the
 * server's /auth/login (BFF, then auth.hoandat.com) coming back to `returnTo`, and the note that the app never sees the
 * password. Under it, why the last sign-in came back (`?login=` from the server). A plain link, not the router's:
 * /auth/login is a server route.
 */
export function AppSignInCard({
  title,
  description,
  returnTo,
  headingLevel,
}: {
  readonly title: string;
  readonly description: string;
  readonly returnTo: string;
  /** 2 beside the landing's hero, whose title is the h1. */
  readonly headingLevel?: 1 | 2;
}): ReactNode {
  const { locale, t } = useI18n();
  const [params] = useSearchParams();
  const result = params.get('login');
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  return (
    <section className="sign-in-card" data-id="sign-in-card">
      <div className="sign-in-head">
        <Heading className="sign-in-title">{title}</Heading>
        <p className="sign-in-body">{description}</p>
      </div>
      <a className="pill pill-cta" href={signInUrl(returnTo, locale)} data-id="sign-in-cta">
        {t('chrome.signInWith')}
      </a>
      <p className="sign-in-note">{t('chrome.signInNote')}</p>
      {result === 'fail' || result === 'unavailable' ? (
        <p className="notice notice-warning" role="status" data-id="sign-in-notice">
          {t(result === 'fail' ? 'signIn.failed' : 'signIn.unavailable')}
        </p>
      ) : null}
    </section>
  );
}

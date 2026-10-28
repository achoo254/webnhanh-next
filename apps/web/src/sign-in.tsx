import { SignInCard } from '@achoo254/app-shell';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { signInUrl } from './api';
import { SHELL_BRAND } from './brand';
import { useI18n } from './i18n';

/**
 * The shared sign-in card with the app's sign-in behind its one call to action: the server's /auth/login (BFF, then
 * auth.hoandat.com), coming back to `returnTo`. Under the card: why the last sign-in came back (`?login=` from the
 * server). No `linkComponent`: /auth/login is a server route, not a page of the router.
 */
export function TrangSignInCard({
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
  return (
    <SignInCard
      brand={SHELL_BRAND}
      locale={locale}
      signInHref={signInUrl(returnTo, locale)}
      title={title}
      description={description}
      headingLevel={headingLevel}
    >
      {result === 'fail' || result === 'unavailable' ? (
        <p className="notice notice-warning" role="status" data-id="sign-in-notice">
          {t(result === 'fail' ? 'signIn.failed' : 'signIn.unavailable')}
        </p>
      ) : null}
    </SignInCard>
  );
}

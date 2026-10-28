import type { ReactNode } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useAccount } from '../account';
import { useI18n } from '../i18n';
import { TrangPage } from '../public-page';
import { TrangSignInCard } from '../sign-in';

/** `/login`: the sign-in card alone. Someone already signed in goes on to `?return=` (an app path) or home. */
export function LoginPage(): ReactNode {
  const { t } = useI18n();
  const { account } = useAccount();
  const [params] = useSearchParams();
  // Back to the page that sent the person here: only a path of this app, never another site.
  const wanted = params.get('return') ?? '/';
  const returnTo = wanted.startsWith('/') && !wanted.startsWith('//') && !wanted.startsWith('/\\') ? wanted : '/';
  if (account) return <Navigate to={returnTo} replace />;
  return (
    <TrangPage layout="center">
      <TrangSignInCard title={t('login.title')} description={t('signIn.body')} returnTo={returnTo} />
    </TrangPage>
  );
}

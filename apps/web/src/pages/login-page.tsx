import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAccount } from '../account';
import { useI18n } from '../i18n';
import { TrangPage } from '../public-page';
import { TrangSignInCard } from '../sign-in';

/** `/login`: the sign-in card alone. Someone already signed in goes straight home. */
export function LoginPage(): ReactNode {
  const { t } = useI18n();
  const { account } = useAccount();
  if (account) return <Navigate to="/" replace />;
  return (
    <TrangPage layout="center">
      <TrangSignInCard title={t('login.title')} description={t('signIn.body')} returnTo="/" />
    </TrangPage>
  );
}

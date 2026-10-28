import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { useAccount } from './account';
import { useI18n } from './i18n';
import { HomePage } from './pages/home-page';
import { LandingPage } from './pages/landing-page';
import { PrivacyPage, TermsPage } from './pages/legal-pages';
import { LoginPage } from './pages/login-page';
import { NotFound } from './pages/not-found';
import { LOGIN_PATH, TrangPage } from './public-page';

/** Signed out: the landing; signed in: the account's home. Nothing but the frame while the first check runs. */
function Home(): ReactNode {
  const { account } = useAccount();
  const { t } = useI18n();
  if (account === undefined) {
    return (
      <TrangPage>
        <p className="loading" role="status">
          {t('loading')}
        </p>
      </TrangPage>
    );
  }
  return account ? <HomePage account={account} /> : <LandingPage />;
}

/** Every route of the app (inside I18nProvider, AccountProvider and a router). */
export function App(): ReactNode {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path={LOGIN_PATH} element={<LoginPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

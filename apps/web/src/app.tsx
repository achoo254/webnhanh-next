import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { useAccount } from './account';
import { useI18n } from './i18n';
import { LandingPage } from './pages/landing-page';
import { PrivacyPage, TermsPage } from './pages/legal-pages';
import { LoginPage } from './pages/login-page';
import { NotFound } from './pages/not-found';
import { LOGIN_PATH, AppPage } from './public-page';

// The signed-in pages carry the template renderer and the response checks: loaded only once someone signs in, so
// the landing stays small.
const HomePage = lazy(() => import('./pages/home-page').then((m) => ({ default: m.HomePage })));
const NewSitePage = lazy(() => import('./pages/new-site-page').then((m) => ({ default: m.NewSitePage })));
const EditorPage = lazy(() => import('./pages/editor-page').then((m) => ({ default: m.EditorPage })));
const OrdersPage = lazy(() => import('./pages/orders-page').then((m) => ({ default: m.OrdersPage })));

function Loading(): ReactNode {
  const { t } = useI18n();
  return (
    <AppPage>
      <p className="loading" role="status">
        {t('loading')}
      </p>
    </AppPage>
  );
}

/** Signed out: the landing; signed in: the account's home. Nothing but the frame while the first check runs. */
function Home(): ReactNode {
  const { account } = useAccount();
  if (account === undefined) return <Loading />;
  return account ? <HomePage /> : <LandingPage />;
}

/** Every route of the app (inside I18nProvider, AccountProvider and a router). */
export function App(): ReactNode {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<NewSitePage />} />
        <Route path="/sites/:siteId" element={<EditorPage />} />
        <Route path="/sites/:siteId/orders" element={<OrdersPage />} />
        <Route path={LOGIN_PATH} element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

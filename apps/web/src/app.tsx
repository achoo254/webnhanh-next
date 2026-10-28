import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { useAccount } from './account';
import { Loader } from './loading';
import { LandingPage } from './pages/landing-page';
import { CreditsPage, PrivacyPage, TermsPage } from './pages/legal-pages';
import { LoginPage } from './pages/login-page';
import { NotFound } from './pages/not-found';
import { ReportPage } from './pages/report-page';
import { LOGIN_PATH, AppPage } from './public-page';

// The signed-in pages carry the template renderer and the response checks: loaded only once someone signs in, so
// the landing stays small.
const HomePage = lazy(() => import('./pages/home-page').then((m) => ({ default: m.HomePage })));
const NewSitePage = lazy(() => import('./pages/new-site-page').then((m) => ({ default: m.NewSitePage })));
const EditorPage = lazy(() => import('./pages/editor-page').then((m) => ({ default: m.EditorPage })));
const OrdersPage = lazy(() => import('./pages/orders-page').then((m) => ({ default: m.OrdersPage })));
const DeployNewPage = lazy(() => import('./pages/deploy-new-page').then((m) => ({ default: m.DeployNewPage })));
const DeployPage = lazy(() => import('./pages/deploy-page').then((m) => ({ default: m.DeployPage })));
const AdminPage = lazy(() => import('./pages/admin-page').then((m) => ({ default: m.AdminPage })));

function Loading(): ReactNode {
  return (
    <AppPage>
      <Loader />
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
        <Route path="/new/developer" element={<DeployNewPage />} />
        <Route path="/sites/:siteId" element={<EditorPage />} />
        <Route path="/sites/:siteId/orders" element={<OrdersPage />} />
        <Route path="/sites/:siteId/deploy" element={<DeployPage />} />
        <Route path={LOGIN_PATH} element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/credits" element={<CreditsPage />} />
        <Route path="/bao-cao" element={<ReportPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

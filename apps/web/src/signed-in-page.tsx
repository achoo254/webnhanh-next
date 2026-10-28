import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import type { Account } from './api';
import { useAccount } from './account';
import { useI18n } from './i18n';
import { Loader } from './loading';
import { LOGIN_PATH, AppPage } from './public-page';

function SignOutButton(): ReactNode {
  const { t } = useI18n();
  const { signOut } = useAccount();
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="shell-topbar-link shell-topbar-cta"
      onClick={() => void signOut().then(() => navigate('/', { replace: true }))}
      data-id="sign-out"
    >
      {t('home.signOut')}
    </button>
  );
}

/**
 * A page for a signed-in person, in the shared frame with Đăng xuất in the header. While the session check runs it
 * shows the frame only; signed out, it sends the person to sign in.
 */
export function SignedInPage({ children }: { readonly children: (account: Account) => ReactNode }): ReactNode {
  const { account } = useAccount();
  const { pathname } = useLocation();
  if (account === undefined) {
    return (
      <AppPage>
        <Loader />
      </AppPage>
    );
  }
  if (account === null) return <Navigate to={`${LOGIN_PATH}?return=${encodeURIComponent(pathname)}`} replace />;
  return <AppPage accountSlot={<SignOutButton />}>{children(account)}</AppPage>;
}

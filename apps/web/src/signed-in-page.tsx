import { AccountMenu, type AccountMenuEntry, type ShellAnchorProps } from '@achoo254/app-shell';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import type { Account } from './api';
import { useAccount } from './account';
import { brand } from './brand';
import { useI18n } from './i18n';
import { Loader } from './loading';
import { LOGIN_PATH, AppPage } from './public-page';

/** The account pages of hoandat.com (email, sign-in methods), opened from the menu in a new tab. */
const IDP_ACCOUNT_URL = `https://auth.${brand.primaryTenant.domain}/account`;

/** The menu's links to the app's own pages, through the router (no reload). */
function RouterLink({ href, ...rest }: ShellAnchorProps): ReactNode {
  return <Link to={href} {...rest} />;
}

/**
 * The header's account button: the hoandat.com picture (or initial) and name, opening the shared account menu with
 * the admin tools for admins, the hoandat.com account pages and Đăng xuất.
 */
function HeaderAccountMenu({ account }: { readonly account: Account }): ReactNode {
  const { t, locale } = useI18n();
  const { signOut } = useAccount();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const entries: AccountMenuEntry[][] = account.admin ? [[{ label: t('admin.title'), dataId: 'account-menu-admin', href: '/admin' }]] : [];
  return (
    <AccountMenu
      user={{ name: account.name, email: account.email, picture: account.picture }}
      locale={locale}
      domain={brand.primaryTenant.domain}
      idpAccountUrl={IDP_ACCOUNT_URL}
      entries={entries}
      signOut={{
        busy,
        onClick: () => {
          setBusy(true);
          // signOut never throws (it logs a failed call and forgets the session either way).
          void signOut().then(() => navigate('/', { replace: true }));
        },
      }}
      linkComponent={RouterLink}
    />
  );
}

/**
 * A page for a signed-in person, in the app's frame with the account menu in the header. While the session check
 * runs it shows the frame only; signed out, it sends the person to sign in.
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
  return <AppPage accountSlot={<HeaderAccountMenu account={account} />}>{children(account)}</AppPage>;
}

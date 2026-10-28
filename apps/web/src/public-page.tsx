import { PublicPage, type ShellLink, type ShellLinkComponent } from '@achoo254/app-shell';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { SHELL_BRAND } from './brand';
import { followStoredLocale, LOCALES, useI18n } from './i18n';

/** The app's own paths go through the router, without a reload. Never used for /auth/* (server routes). */
const RouterLink: ShellLinkComponent = ({ href, ...rest }) => <Link to={href} {...rest} />;

export const LOGIN_PATH = '/login';

/**
 * Every page of the app in the shared frame of the hoandat.com apps (@achoo254/app-shell): header with mark and
 * name, skip link, footer with the language and theme switches, ecosystem and legal links. Signed in, `accountSlot`
 * takes the place of the sign-in pill.
 */
export function TrangPage({
  children,
  layout = 'flow',
  navLinks,
  accountSlot,
}: {
  readonly children: ReactNode;
  /** "center" for the sign-in card alone (/login), "flow" otherwise. */
  readonly layout?: 'flow' | 'center';
  readonly navLinks?: readonly ShellLink[];
  readonly accountSlot?: ReactNode;
}): ReactNode {
  const { locale } = useI18n();
  const { pathname } = useLocation();
  return (
    <PublicPage
      brand={SHELL_BRAND}
      locale={locale}
      locales={LOCALES}
      onLocaleChange={followStoredLocale}
      signInHref={LOGIN_PATH}
      signInCurrent={pathname === LOGIN_PATH}
      navLinks={navLinks}
      accountSlot={accountSlot}
      linkComponent={RouterLink}
      layout={layout}
    >
      {children}
    </PublicPage>
  );
}

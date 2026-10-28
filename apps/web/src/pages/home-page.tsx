import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { Account } from '../api';
import { useAccount } from '../account';
import { useI18n } from '../i18n';
import { TrangPage } from '../public-page';

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
 * What a signed-in person sees at `/`: which account they use and, honestly, that they have no page yet and that
 * making pages is still being built. No sample sites.
 */
export function HomePage({ account }: { readonly account: Account }): ReactNode {
  const { t, locale } = useI18n();
  const since = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'long' }).format(new Date(account.createdAt));
  return (
    <TrangPage accountSlot={<SignOutButton />}>
      <section className="home" data-id="home">
        <h1 className="home-title">{t('home.title')}</h1>
        <p className="home-account" data-id="home-account">
          {t('home.account', { date: since })}
        </p>
        <div className="shell-card empty" data-id="home-empty">
          <h2 className="empty-title">{t('home.empty.title')}</h2>
          <p className="empty-body">{t('home.empty.body')}</p>
        </div>
      </section>
    </TrangPage>
  );
}

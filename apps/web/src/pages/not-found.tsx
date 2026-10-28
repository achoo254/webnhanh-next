import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n';
import { AppPage } from '../public-page';

/** "Not found" inside a frame of the caller's (the admin page shows it to everyone but admins). */
export function NotFoundContent(): ReactNode {
  const { t } = useI18n();
  return (
    <section className="prose" data-id="not-found">
      <h1>{t('notFound.title')}</h1>
      <p>
        <Link to="/" data-id="not-found-home">
          {t('notFound.back')}
        </Link>
      </p>
    </section>
  );
}

export function NotFound(): ReactNode {
  return (
    <AppPage>
      <NotFoundContent />
    </AppPage>
  );
}

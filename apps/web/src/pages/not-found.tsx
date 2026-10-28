import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../i18n';
import { AppPage } from '../public-page';

export function NotFound(): ReactNode {
  const { t } = useI18n();
  return (
    <AppPage>
      <section className="prose" data-id="not-found">
        <h1>{t('notFound.title')}</h1>
        <p>
          <Link to="/" data-id="not-found-home">
            {t('notFound.back')}
          </Link>
        </p>
      </section>
    </AppPage>
  );
}

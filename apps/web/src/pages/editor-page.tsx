import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { SiteEditor } from '../editor/site-editor';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';
import { getSite, type SiteDetail } from '../sites-api';

/** `/sites/:siteId`: loads the site and its draft, then the editor. */
export function EditorPage(): ReactNode {
  return <SignedInPage>{() => <LoadEditor />}</SignedInPage>;
}

function LoadEditor(): ReactNode {
  const { t } = useI18n();
  const { siteId = '' } = useParams();
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  useEffect(() => {
    let live = true;
    getSite(siteId)
      .then((value) => {
        if (live) setDetail(value);
      })
      .catch((failure: unknown) => {
        if (live) setError(errorMessage(failure));
      });
    return () => {
      live = false;
    };
  }, [siteId]);

  // A developer site has no draft: its page is the deploy page.
  if (detail?.site.kind === 'developer') return <Navigate to={`/sites/${detail.site.id}/deploy`} replace />;
  if (error || (detail && !detail.draft)) {
    return (
      <section className="home">
        <p className="notice notice-warning" role="alert">
          {t(error ?? 'error.generic')}
        </p>
        <Link className="back-link" to="/">
          {t('editor.back')}
        </Link>
      </section>
    );
  }
  if (!detail?.draft) {
    return (
      <p className="loading" role="status">
        {t('loading')}
      </p>
    );
  }
  return <SiteEditor key={detail.site.id} initialSite={detail.site} initialDraft={detail.draft} initialImages={detail.images} />;
}

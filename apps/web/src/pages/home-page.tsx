import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Account } from '../api';
import { siteHost } from '../brand';
import { useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';
import { listSites, thumbUrl, type Site, type SiteList } from '../sites-api';
import { SiteCardsPlaceholder } from '../loading';

function statusOf(site: Site): { key: MessageKey; tone: 'live' | 'draft' | 'busy' | 'warn' } {
  if (site.job && (site.job.status === 'queued' || site.job.status === 'running')) return { key: site.kind === 'developer' ? 'buildStatus.running' : 'status.publishing', tone: 'busy' };
  if (site.status === 'removed') return { key: 'status.removed', tone: 'warn' };
  if (site.status === 'pending-review') return { key: 'status.pendingReview', tone: 'busy' };
  if (site.job?.status === 'failed') return { key: 'status.failed', tone: 'warn' };
  return site.published ? { key: 'status.published', tone: 'live' } : { key: 'status.draft', tone: 'draft' };
}

/** What a page's form brings in, by template: orders of a shop, replies to a wedding; other pages have no form. */
const INBOX: Readonly<Record<string, { readonly link: MessageKey; readonly badge: MessageKey }>> = {
  shop: { link: 'home.orders', badge: 'home.newOrders' },
  wedding: { link: 'home.rsvp', badge: 'home.newRsvp' },
};

function SiteCard({ site }: { readonly site: Site }): ReactNode {
  const { t } = useI18n();
  const status = statusOf(site);
  const inbox = site.kind === 'template' && site.template ? INBOX[site.template] : undefined;
  return (
    <li className="site-card" data-id={`site-${site.name}`}>
      <div className={site.kind === 'developer' ? 'site-card-media site-card-code' : 'site-card-media'}>
        {site.cover ? <img src={thumbUrl(site.id, site.cover, 480)} alt="" loading="lazy" /> : site.kind === 'developer' ? <span aria-hidden="true">{'</>'}</span> : null}
      </div>
      <div className="site-card-body">
        <div className="row">
          <span className={`badge badge-${status.tone}`}>{t(status.key)}</span>
          {inbox && site.newOrders > 0 ? (
            <span className="badge badge-orders" data-id={`site-${site.name}-new-orders`}>
              {t(inbox.badge, { n: site.newOrders })}
            </span>
          ) : null}
        </div>
        <h2 className="site-card-name">{siteHost(site.name)}</h2>
        <div className="site-card-actions">
          {site.kind === 'developer' ? (
            <Link className="pill pill-dark" to={`/sites/${site.id}/deploy`} data-id={`site-${site.name}-deploy`}>
              {t('home.manage')}
            </Link>
          ) : (
            <Link className="pill pill-dark" to={`/sites/${site.id}`} data-id={`site-${site.name}-edit`}>
              {t('home.edit')}
            </Link>
          )}
          {inbox && (site.published || site.newOrders > 0) ? (
            <Link className="pill pill-ghost" to={`/sites/${site.id}/orders`} data-id={`site-${site.name}-orders`}>
              {t(inbox.link)}
            </Link>
          ) : null}
          {site.published ? (
            <a className="pill pill-ghost" href={`https://${siteHost(site.name)}/`} target="_blank" rel="noopener noreferrer" data-id={`site-${site.name}-view`}>
              {t('home.view')}
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * What a signed-in person sees at `/`: their pages as cards (address, state, edit, open), or an empty state that
 * leads to making the first one.
 */
export function HomePage(): ReactNode {
  return <SignedInPage>{(account) => <Home account={account} />}</SignedInPage>;
}

function Home({ account }: { readonly account: Account }): ReactNode {
  const { t, locale } = useI18n();
  const [list, setList] = useState<SiteList | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    listSites()
      .then((value) => {
        if (live) setList(value);
      })
      .catch((error: unknown) => {
        console.warn('site list failed', error instanceof Error ? error.message : String(error));
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const since = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'long' }).format(new Date(account.createdAt));
  // The limit of template sites; developer sites have their own (shown on /new/developer).
  const atLimit = list !== null && list.sites.filter((site) => site.kind !== 'developer').length >= list.limits.sites;

  return (
    <section className="home" data-id="home">
      <h1 className="page-title">{t('home.title')}</h1>
      <p className="home-account" data-id="home-account">
        {t('home.account', { date: since })}
        {account.admin ? (
          <>
            {' · '}
            <Link to="/admin" data-id="home-admin">
              {t('admin.title')}
            </Link>
          </>
        ) : null}
      </p>
      {account.locked ? (
        <p className="notice notice-warning" role="alert" data-id="home-locked">
          {t('home.locked')}
        </p>
      ) : null}
      {failed ? (
        <p className="notice notice-warning" role="alert">
          {t('home.loadFailed')}
        </p>
      ) : list === null ? (
        <SiteCardsPlaceholder />
      ) : list.sites.length === 0 ? (
        <div className="shell-card empty" data-id="home-empty">
          <h2 className="empty-title">{t('home.empty.title')}</h2>
          <p className="empty-body">{t('home.empty.body')}</p>
          <Link className="pill pill-cta" to="/new" data-id="home-create">
            {t('home.create')}
          </Link>
        </div>
      ) : (
        <>
          <ul className="site-grid" data-id="home-sites">
            {list.sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </ul>
          {atLimit ? (
            <p className="hint">{t('home.limit', { limit: list.limits.sites })}</p>
          ) : (
            <Link className="pill pill-cta" to="/new" data-id="home-create">
              {t('home.create')}
            </Link>
          )}
        </>
      )}
    </section>
  );
}

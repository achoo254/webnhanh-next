import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { siteHost } from '../brand';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { NotificationSettingsPanel } from '../orders/notification-settings';
import { listOrders, markOrder, type Order, type OrderList, type OrderView } from '../orders-api';
import { SignedInPage } from '../signed-in-page';
import { Loader } from '../loading';

/**
 * `/sites/:siteId/orders`: what visitors sent from a page (a shop's orders, a wedding's replies, worded for each), and
 * how the owner hears of new ones.
 */
export function OrdersPage(): ReactNode {
  return <SignedInPage>{() => <Orders />}</SignedInPage>;
}

/** The words of the inbox: a shop's orders, or a wedding's replies. */
interface InboxWords {
  readonly title: MessageKey;
  readonly emptyOpen: MessageKey;
  readonly emptyAll: MessageKey;
  readonly notPublished: MessageKey;
  readonly more: MessageKey;
}

const ORDER_WORDS: InboxWords = { title: 'orders.title', emptyOpen: 'orders.empty.open', emptyAll: 'orders.empty.all', notPublished: 'orders.notPublished', more: 'orders.more' };
const RSVP_WORDS: InboxWords = { title: 'rsvp.title', emptyOpen: 'rsvp.empty.open', emptyAll: 'rsvp.empty.all', notPublished: 'rsvp.notPublished', more: 'rsvp.more' };

function OrderCard({ order, onMark }: { readonly order: Order; readonly onMark: (handled: boolean) => Promise<void> }): ReactNode {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const when = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(order.createdAt));
  const handled = order.handledAt !== null;
  return (
    <li className={`order-card${handled ? ' order-card-done' : ''}`} data-id={`order-${order.id}`}>
      <div className="order-card-head">
        <strong className="order-card-name">{order.name}</strong>
        <time className="hint" dateTime={order.createdAt}>
          {when}
        </time>
      </div>
      <p className="order-card-product">
        {order.kind === 'rsvp'
          ? t(order.attending === 'yes' ? 'rsvp.coming' : 'rsvp.notComing', { n: order.guests })
          : t('orders.product', { product: order.product, n: order.quantity })}
      </p>
      <dl className="order-card-details">
        {order.phone ? (
          <>
            <dt>{t('orders.phone')}</dt>
            <dd>
              <a href={`tel:${order.phone}`}>{order.phone}</a>
            </dd>
          </>
        ) : null}
        {order.kind === 'order' ? (
          <>
            <dt>{t('orders.address')}</dt>
            <dd>{order.address}</dd>
          </>
        ) : null}
        {order.note ? (
          <>
            <dt>{t(order.kind === 'rsvp' ? 'rsvp.note' : 'orders.note')}</dt>
            <dd>{order.note}</dd>
          </>
        ) : null}
      </dl>
      <div className="site-card-actions">
        {handled ? <span className="badge badge-live">{t(order.kind === 'rsvp' ? 'rsvp.handled' : 'orders.handled')}</span> : null}
        <button
          type="button"
          className={`pill pill-small ${handled ? 'pill-ghost' : 'pill-dark'}`}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onMark(!handled).finally(() => setBusy(false));
          }}
          data-id={`order-${order.id}-mark`}
        >
          {t(handled ? 'orders.reopen' : order.kind === 'rsvp' ? 'rsvp.markHandled' : 'orders.markHandled')}
        </button>
      </div>
    </li>
  );
}

function Orders(): ReactNode {
  const { t } = useI18n();
  const { siteId = '' } = useParams();
  const [view, setView] = useState<OrderView>('open');
  const [list, setList] = useState<OrderList | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let live = true;
    listOrders(siteId, view)
      .then((value) => {
        if (live) setList(value);
      })
      .catch((failure: unknown) => {
        if (live) setError(errorMessage(failure));
      });
    return () => {
      live = false;
    };
  }, [siteId, view]);

  const switchView = (next: OrderView): void => {
    if (next === view) return;
    setList(null);
    setError(null);
    setView(next);
  };

  const mark = async (order: Order, handled: boolean): Promise<void> => {
    try {
      const updated = await markOrder(siteId, order.id, handled);
      setList((current) =>
        current
          ? {
              ...current,
              open: current.open + (handled ? -1 : 1),
              // In the "to do" view a handled order leaves the list; in "all" it stays, marked.
              orders: view === 'open' && handled ? current.orders.filter((o) => o.id !== order.id) : current.orders.map((o) => (o.id === order.id ? updated : o)),
            }
          : current,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const more = async (): Promise<void> => {
    const last = list?.orders[list.orders.length - 1];
    if (!list || !last) return;
    setLoadingMore(true);
    try {
      const next = await listOrders(siteId, view, last.createdAt);
      setList({ ...next, orders: [...list.orders, ...next.orders] });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setLoadingMore(false);
    }
  };

  const words = list?.site.template === 'wedding' ? RSVP_WORDS : ORDER_WORDS;

  return (
    <section className="home orders" data-id="orders">
      <Link className="back-link" to="/" data-id="orders-back">
        {t('editor.back')}
      </Link>
      <h1 className="page-title">{list ? t(words.title) : t('orders.inbox')}</h1>
      {list ? <p className="home-account">{siteHost(list.site.name)}</p> : null}
      {list?.rsvp ? (
        <ul className="rsvp-summary" data-id="rsvp-summary">
          <li>{t('rsvp.summary.yes', { n: list.rsvp.yes, guests: list.rsvp.guests })}</li>
          <li>{t('rsvp.summary.no', { n: list.rsvp.no })}</li>
        </ul>
      ) : null}
      {error ? (
        <p className="notice notice-warning" role="alert">
          {t(error)}
        </p>
      ) : null}
      {list && !list.site.published ? <p className="notice notice-info">{t(words.notPublished)}</p> : null}
      <div className="tabs" role="group" aria-label={t(words.title)}>
        {(['open', 'all'] as const).map((tab) => (
          <button key={tab} type="button" className="tab" aria-pressed={view === tab} onClick={() => switchView(tab)} data-id={`orders-tab-${tab}`}>
            {tab === 'open' && list ? t('orders.view.openCount', { n: list.open }) : t(tab === 'open' ? 'orders.view.open' : 'orders.view.all')}
          </button>
        ))}
      </div>
      {list === null && !error ? (
        <Loader />
      ) : null}
      {list && list.orders.length === 0 ? <p className="hint">{t(view === 'open' ? words.emptyOpen : words.emptyAll)}</p> : null}
      {list && list.orders.length > 0 ? (
        <ul className="order-list" data-id="orders-list">
          {list.orders.map((order) => (
            <OrderCard key={order.id} order={order} onMark={(handled) => mark(order, handled)} />
          ))}
        </ul>
      ) : null}
      {list?.more ? (
        <button type="button" className="pill pill-ghost" onClick={() => void more()} disabled={loadingMore} data-id="orders-more">
          {t(words.more)}
        </button>
      ) : null}
      <NotificationSettingsPanel replies={list?.site.template === 'wedding'} />
    </section>
  );
}

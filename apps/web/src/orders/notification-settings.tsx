import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useI18n, type MessageKey } from '../i18n';
import { chatLinkUrl, getNotificationSettings, unlinkChat, type NotificationSettings } from '../orders-api';
import { disablePush, enablePush, pushState, type PushState } from '../push';

const PUSH_HINTS: Readonly<Record<Exclude<PushState, 'off'>, MessageKey>> = {
  on: 'notify.push.on',
  denied: 'notify.push.denied',
  unsupported: 'notify.push.unsupported',
  'needs-home-screen': 'notify.push.homeScreen',
};

function PushRow({ publicKey }: { readonly publicKey: string }): ReactNode {
  const { t } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    pushState()
      .then((value) => {
        if (live) setState(value);
      })
      .catch(() => {
        if (live) setState('unsupported');
      });
    return () => {
      live = false;
    };
  }, []);
  if (state === null) return null;
  const toggle = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      setState(state === 'on' ? await disablePush() : await enablePush(publicKey));
    } catch (error) {
      console.warn('push change failed', error instanceof Error ? error.message : String(error));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const canToggle = state === 'on' || state === 'off';
  return (
    <div className="notify-row" data-id="notify-push">
      <div className="notify-text">
        <strong>{t('notify.push.label')}</strong>
        {state !== 'off' ? <p className="hint">{t(PUSH_HINTS[state])}</p> : null}
        {failed ? (
          <p className="field-error" role="alert">
            {t('notify.failed')}
          </p>
        ) : null}
      </div>
      {canToggle ? (
        <button type="button" className={`pill pill-small ${state === 'on' ? 'pill-ghost' : 'pill-dark'}`} onClick={() => void toggle()} disabled={busy} data-id="notify-push-toggle">
          {t(state === 'on' ? 'notify.off' : 'notify.push.enable')}
        </button>
      ) : null}
    </div>
  );
}

function ChatRow({ linked, onChange }: { readonly linked: boolean; readonly onChange: () => void }): ReactNode {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch (error) {
      console.warn('chat link failed', error instanceof Error ? error.message : String(error));
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <div className="notify-row" data-id="notify-chat">
      <div className="notify-text">
        <strong>{t('notify.chat.label')}</strong>
        <p className="hint">{t(linked ? 'notify.chat.linked' : 'notify.chat.hint')}</p>
        {failed ? (
          <p className="field-error" role="alert">
            {t('notify.failed')}
          </p>
        ) : null}
      </div>
      {linked ? (
        <button
          type="button"
          className="pill pill-small pill-ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await unlinkChat();
              setBusy(false);
              onChange();
            })
          }
          data-id="notify-chat-off"
        >
          {t('notify.off')}
        </button>
      ) : (
        <button
          type="button"
          className="pill pill-small pill-dark"
          disabled={busy}
          // The code is made on demand and used once; the bot links the chat when the person presses Start there.
          onClick={() => void run(async () => window.location.assign(await chatLinkUrl()))}
          data-id="notify-chat-link"
        >
          {t('notify.chat.link')}
        </button>
      )}
    </div>
  );
}

/**
 * How the owner hears about new orders: always in the app; Web Push on this device and the Chat bot when the server
 * has them (a channel the server lacks is not shown at all).
 */
export function NotificationSettingsPanel(): ReactNode {
  const { t } = useI18n();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const load = useCallback(() => {
    getNotificationSettings()
      .then(setSettings)
      .catch((error: unknown) => console.warn('notification settings failed', error instanceof Error ? error.message : String(error)));
  }, []);
  useEffect(() => {
    load();
    // Back from the Chat app after pressing Start: show the link as made.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);
  return (
    <section className="panel" aria-labelledby="notify-heading" data-id="notify">
      <h2 id="notify-heading" className="panel-title">
        {t('notify.title')}
      </h2>
      <p className="hint">{t('notify.inApp')}</p>
      {settings?.push ? <PushRow publicKey={settings.push.publicKey} /> : null}
      {settings?.chat ? <ChatRow linked={settings.chat.linked} onChange={load} /> : null}
    </section>
  );
}

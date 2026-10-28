import { useEffect, useRef, useState, type ReactNode } from 'react';
import { siteHost } from '../brand';
import { notifyWhenDone, type Build, type BuildDetail, type BuildProgress as Progress, type BuildStepView } from '../builds-api';
import { buildFailureMessage, warningMessage } from '../error-messages';
import { useI18n, type MessageKey, type Translate } from '../i18n';
import { getNotificationSettings } from '../orders-api';
import { enablePush, pushState } from '../push';
import { HELD_FOR_REVIEW } from '../sites-api';
import { duration, isActive } from './use-build';

/** The builder's and the worker's steps (apps/worker/src/build/build-job.ts), after the wait in the queue. */
const STEPS: readonly { name: string; label: MessageKey }[] = [
  { name: 'fetch', label: 'bstep.fetch' },
  { name: 'install', label: 'bstep.install' },
  { name: 'build', label: 'bstep.build' },
  { name: 'check', label: 'bstep.check' },
  { name: 'publish', label: 'bstep.publish' },
];

const FRAMEWORK_NAMES: Readonly<Record<string, string>> = {
  vite: 'Vite',
  astro: 'Astro',
  next: 'Next.js',
  cra: 'Create React App',
  sveltekit: 'SvelteKit',
  nuxt: 'Nuxt',
  docusaurus: 'Docusaurus',
  vitepress: 'VitePress',
  hugo: 'Hugo',
};

export function frameworkName(t: Translate, framework: string | null): string {
  if (framework === 'static') return t('framework.static');
  return (framework ? FRAMEWORK_NAMES[framework] : undefined) ?? t('framework.other');
}

const elapsed = (from: string, to: string | number): number => Math.max(0, (typeof to === 'number' ? to : Date.parse(to)) - Date.parse(from));

/** The latest log line as a sentence, or the line itself (shortened) when nothing better is known. */
export function progressText(t: Translate, progress: Progress | null): string | null {
  if (!progress) return null;
  switch (progress.code) {
    case 'install-packages':
      return t('progress.install-packages', { n: progress.n ?? 0 });
    case 'install':
      return t('progress.install');
    case 'build-modules':
      return t('progress.build-modules', { n: progress.n ?? 0 });
    case 'build-pages':
      return progress.total ? t('progress.build-pages', { n: progress.n ?? 0, total: progress.total }) : t('progress.build-pages-n', { n: progress.n ?? 0 });
    case 'build':
      return t('progress.build');
    default:
      return progress.text ?? null;
  }
}

type StepState = 'todo' | 'now' | 'done' | 'failed';

function Steps({ build, now }: { readonly build: Build; readonly now: number }): ReactNode {
  const { t } = useI18n();
  const over = build.status === 'failed' || build.status === 'skipped' || build.status === 'done';
  const end = build.finishedAt ?? now;
  const rows: { key: string; label: string; state: StepState; time: string | null; note: string | null }[] = [];
  // The wait in the queue is a step of its own, with its real time.
  const queued = build.startedAt ?? (over ? build.finishedAt : null);
  rows.push({ key: 'queue', label: t('bstep.queue'), state: queued ? 'done' : 'now', time: duration(t, elapsed(build.createdAt, queued ?? now)), note: null });
  for (const step of STEPS) {
    const found: BuildStepView | undefined = build.steps.find((s) => s.name === step.name);
    let state: StepState = 'todo';
    if (found?.finishedAt) state = 'done';
    else if (found) state = build.status === 'failed' ? 'failed' : over ? 'done' : 'now';
    const note = found?.note === 'cached' ? t('bstep.cached') : found?.note === 'not-needed' ? t('bstep.notNeeded') : null;
    rows.push({ key: step.name, label: t(step.label), state, time: found ? duration(t, elapsed(found.startedAt, found.finishedAt ?? end)) : null, note });
  }
  return (
    <ol className="steps build-steps" aria-live="polite" data-id="build-steps">
      {rows.map((row) => (
        <li key={row.key} className={`step step-${row.state}`} data-id={`build-step-${row.key}`}>
          <span className="step-label">
            {row.label}
            {row.note ? <small className="step-note"> · {row.note}</small> : null}
          </span>
          {row.time !== null && row.state !== 'todo' ? <span className="step-time">{row.time}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Expected time, honestly: from real builds when there are any, and "longer than usual" past it. */
function Expectation({ detail, now }: { readonly detail: BuildDetail; readonly now: number }): ReactNode {
  const { t, locale } = useI18n();
  const { build, estimate, queue } = detail;
  const clock = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  const basis =
    estimate.basis === 'site' ? t('eta.basis.site') : t(estimate.basis === 'framework' ? 'eta.basis.framework' : 'eta.basis.default', { framework: frameworkName(t, build.framework) });
  const late = build.startedAt !== null && elapsed(build.startedAt, now) > estimate.ms * 1.25 + 10_000;
  return (
    <div className="build-eta" data-id="build-eta">
      {queue ? (
        <p className="build-eta-line">
          <strong>{queue.position > 0 ? t('queue.position', { n: queue.position }) : t('queue.next')}</strong>
          {' · '}
          {t('queue.startsAt', { time: clock.format(new Date(queue.startsAt)) })}
        </p>
      ) : null}
      {late ? (
        <p className="build-eta-line build-eta-late" role="status">
          {t('eta.over')}
        </p>
      ) : (
        <p className="build-eta-line">
          {t('eta.expected', { time: duration(t, estimate.ms) })} <span className="hint">({basis})</span>
        </p>
      )}
    </div>
  );
}

function NotifyButton({ detail, onChange }: { readonly detail: BuildDetail; readonly onChange: (detail: BuildDetail) => void }): ReactNode {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<MessageKey | null>(null);
  if (detail.build.notify) {
    return (
      <p className="notice notice-info" data-id="build-notify-on">
        {t('build.notify.on')}
      </p>
    );
  }
  const press = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const settings = await getNotificationSettings();
      let reachable = settings.chat?.linked === true;
      if (settings.push) {
        let state = await pushState();
        if (state === 'off') state = await enablePush(settings.push.publicKey);
        if (state === 'on') reachable = true;
      }
      if (!reachable) {
        setMessage('build.notify.noChannel');
        return;
      }
      await notifyWhenDone(detail.build.id);
      onChange({ ...detail, build: { ...detail.build, notify: true } });
    } catch (error) {
      console.warn('notify failed', error instanceof Error ? error.message : String(error));
      setMessage('notify.failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="build-notify">
      <button type="button" className="pill pill-dark" onClick={() => void press()} disabled={busy} aria-busy={busy} data-id="build-notify">
        {t('build.notify')}
      </button>
      {message ? (
        <p className="field-error" role="alert">
          {t(message)}
        </p>
      ) : null}
    </div>
  );
}

function Log({ buildId, lines, logUrl }: { readonly buildId: string; readonly lines: readonly string[]; readonly logUrl: string }): ReactNode {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    // Follow the end of the log while it is open.
    if (open && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [open, lines.length]);
  return (
    <details className="build-log" onToggle={(event) => setOpen(event.currentTarget.open)} data-id="build-log">
      <summary>
        {t('log.title')} <span className="hint">({lines.length})</span>
      </summary>
      <pre ref={box} className="build-log-lines">
        {lines.length > 0 ? lines.join('\n') : t('log.empty')}
      </pre>
      <a className="pill pill-ghost pill-small" href={logUrl} download={`build-${buildId.slice(0, 8)}.log`} data-id="build-log-download">
        {t('log.download')}
      </a>
    </details>
  );
}

function Done({ detail }: { readonly detail: BuildDetail }): ReactNode {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const { build, siteName, previousMs } = detail;
  const url = `https://${siteHost(siteName)}/`;
  const took = build.startedAt && build.finishedAt ? elapsed(build.startedAt, build.finishedAt) : null;
  const diff = took !== null && previousMs !== null ? took - previousMs : null;
  const image = build.report?.ogImage ? `${url}${build.report.ogImage.split('/').map(encodeURIComponent).join('/')}` : null;
  return (
    <div className="live build-done" data-id="build-done">
      <h2 className="live-title">{t('build.done.title')}</h2>
      <p>{t('build.done.body')}</p>
      <div className="build-done-shot">
        {image ? (
          <img src={image} alt={t('build.done.preview')} loading="lazy" />
        ) : (
          <div className="build-done-card" aria-hidden="true">
            <span className="build-done-dots">● ● ●</span>
            <strong>{build.report?.title ?? siteHost(siteName)}</strong>
            <span>{siteHost(siteName)}</span>
          </div>
        )}
      </div>
      <div className="live-url">
        <strong data-id="build-url">{siteHost(siteName)}</strong>
        <button
          type="button"
          className="pill pill-dark pill-small"
          onClick={() => {
            navigator.clipboard
              .writeText(url)
              .then(() => setCopied(true))
              .catch((error: unknown) => console.warn('copy failed', error instanceof Error ? error.message : String(error)));
          }}
          data-id="build-copy"
        >
          {copied ? t('publish.copied') : t('publish.copy')}
        </button>
      </div>
      <div className="live-actions">
        <a className="pill pill-ghost" href={url} target="_blank" rel="noopener noreferrer" data-id="build-open">
          {t('publish.open')}
        </a>
      </div>
      {took !== null ? (
        <p className="build-done-time">
          {t('build.done.took', { time: duration(t, took) })}{' '}
          {diff !== null && Math.abs(diff) >= 1000 ? t(diff < 0 ? 'build.done.faster' : 'build.done.slower', { time: duration(t, Math.abs(diff)) }) : null}
        </p>
      ) : null}
    </div>
  );
}

function Failed({ build }: { readonly build: Build }): ReactNode {
  const { t } = useI18n();
  const notes = build.error === 'unsupported' ? build.errorLines.map(warningMessage).filter((key): key is MessageKey => key !== null) : [];
  const lines = build.error === 'unsupported' ? [] : build.errorLines;
  return (
    <div className="build-failed" role="alert" data-id="build-failed">
      <h2 className="panel-title">{t('build.failed.title')}</h2>
      <p>{t(buildFailureMessage(build.error))}</p>
      {notes.map((key) => (
        <p key={key} className="notice notice-warning">
          {t(key, {})}
        </p>
      ))}
      {lines.length > 0 ? (
        <>
          <p className="field-label">{t('build.failed.lines')}</p>
          <pre className="build-log-lines build-error-lines">{lines.join('\n')}</pre>
        </>
      ) : null}
      <p className="hint">{t('build.failed.keep')}</p>
    </div>
  );
}

/**
 * The waiting screen of one build: named steps with real timers (the queue first), an honest expectation, the latest
 * log line as a sentence, "Báo tôi khi xong", the full log (folded), then the result.
 */
export function BuildProgressView({
  detail,
  lines,
  now,
  logUrl,
  onChange,
  aside,
}: {
  readonly detail: BuildDetail;
  readonly lines: readonly string[];
  readonly now: number;
  readonly logUrl: string;
  readonly onChange: (detail: BuildDetail) => void;
  /** Useful things to do meanwhile, beside the steps. */
  readonly aside?: ReactNode;
}): ReactNode {
  const { t } = useI18n();
  const { build } = detail;
  const active = isActive(detail);
  const sentence = active ? (build.phase === 'publishing' ? t('progress.publishing') : progressText(t, build.progress)) : null;
  return (
    <section className="build" aria-labelledby="build-heading" data-id="build">
      <h2 id="build-heading" className="visually-hidden">
        {t('deploy.history.title')}
      </h2>
      <div className="build-grid">
        <div className="build-main">
          {active ? <Expectation detail={detail} now={now} /> : null}
          <Steps build={build} now={now} />
          {sentence ? (
            <p className="build-sentence" data-id="build-sentence">
              {sentence}
            </p>
          ) : null}
          {build.status === 'done' && build.error === HELD_FOR_REVIEW ? (
            <p className="notice notice-info" role="status" data-id="build-held">
              {t('review.held')}
            </p>
          ) : null}
          {build.status === 'done' && build.error !== HELD_FOR_REVIEW ? <Done detail={detail} /> : null}
          {build.status === 'failed' ? <Failed build={build} /> : null}
          {build.status === 'skipped' ? (
            <p className="notice notice-info" data-id="build-skipped">
              {t(build.error === 'daily-limit' ? 'build.skipped.daily-limit' : 'build.skipped.no-change')}
            </p>
          ) : null}
          {active ? <NotifyButton detail={detail} onChange={onChange} /> : null}
          {active ? <p className="hint">{t('build.leave')}</p> : null}
          <Log buildId={build.id} lines={lines} logUrl={logUrl} />
        </div>
        {aside ? <aside className="build-aside">{aside}</aside> : null}
      </div>
    </section>
  );
}

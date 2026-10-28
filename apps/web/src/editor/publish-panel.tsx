import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../api';
import { siteHost } from '../brand';
import { errorMessage, jobFailureMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { getJob, HELD_FOR_REVIEW, publishSite, type Job } from '../sites-api';

/** The worker's steps (apps/worker/src/publish-job.ts), in order, with their labels. */
const STEPS: readonly { name: string; label: MessageKey }[] = [
  { name: 'prepare', label: 'step.prepare' },
  { name: 'render', label: 'step.render' },
  { name: 'images', label: 'step.images' },
  { name: 'publish', label: 'step.publish' },
  { name: 'finish', label: 'step.finish' },
];

const POLL_MS = 1_000;

function active(job: Job | null): boolean {
  return job !== null && (job.status === 'queued' || job.status === 'running');
}

/** Seconds between two ISO times (or an ISO time and now, in ms). */
function seconds(from: string, to: string | number): number {
  const end = typeof to === 'number' ? to : Date.parse(to);
  return Math.max(0, end - Date.parse(from)) / 1000;
}

/** Follows a job until it is done or failed, polling the server; `now` ticks while it runs, for the timers. */
function useJob(initial: Job | null): [Job | null, (job: Job) => void, number] {
  const [job, setJob] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const running = active(job);
  const jobId = job?.id;
  useEffect(() => {
    if (!running || !jobId) return;
    let live = true;
    const poll = setInterval(() => {
      getJob(jobId)
        .then((next) => {
          if (live) setJob(next);
        })
        .catch((error: unknown) => console.warn('job poll failed', error instanceof Error ? error.message : String(error)));
    }, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 200);
    return () => {
      live = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [running, jobId]);
  return [job, setJob, now];
}

function Steps({ job, now }: { readonly job: Job; readonly now: number }): ReactNode {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // A step of a few milliseconds reads "< 0.1 s", not "0.0 s".
  const time = (value: number): string => (value < 0.1 ? t('seconds.under', { n: number.format(0.1) }) : t('seconds', { n: number.format(value) }));
  if (job.status === 'queued') {
    return (
      <p className="hint" role="status">
        {t('publish.queued')}
      </p>
    );
  }
  return (
    <ol className="steps" aria-live="polite" data-id="publish-steps">
      {STEPS.map((step) => {
        const done = job.steps.find((s) => s.name === step.name);
        const state = !done ? 'todo' : done.finishedAt ? 'done' : 'now';
        return (
          <li key={step.name} className={`step step-${state}`}>
            <span className="step-label">{t(step.label)}</span>
            {done ? <span className="step-time">{time(seconds(done.startedAt, done.finishedAt ?? now))}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function LiveLink({ name }: { readonly name: string }): ReactNode {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = `https://${siteHost(name)}/`;
  const canShare = typeof navigator.share === 'function';
  return (
    <div className="live" data-id="publish-done">
      <h2 className="live-title">{t('publish.done.title')}</h2>
      <p>{t('publish.done.body')}</p>
      <div className="live-url">
        <strong data-id="publish-url">{siteHost(name)}</strong>
        <button
          type="button"
          className="pill pill-dark pill-small"
          onClick={() => {
            navigator.clipboard
              .writeText(url)
              .then(() => setCopied(true))
              .catch((error: unknown) => console.warn('copy failed', error instanceof Error ? error.message : String(error)));
          }}
          data-id="publish-copy"
        >
          {copied ? t('publish.copied') : t('publish.copy')}
        </button>
      </div>
      <div className="live-actions">
        {canShare ? (
          <button
            type="button"
            className="pill pill-ghost"
            onClick={() => {
              navigator.share({ url }).catch(() => undefined);
            }}
            data-id="publish-share"
          >
            {t('publish.share')}
          </button>
        ) : null}
        <a className="pill pill-ghost" href={url} target="_blank" rel="noopener noreferrer" data-id="publish-open">
          {t('publish.open')}
        </a>
      </div>
    </div>
  );
}

/**
 * The Publish button and what follows it: the job's named steps with their real times while it runs, then the
 * live link to copy, share or open; or why it failed. `prepare` saves the draft and checks it first; false stops.
 */
export function PublishPanel({
  siteId,
  siteName,
  published,
  pendingReview = false,
  initialJob,
  prepare,
  onFieldsRefused,
  onDone,
}: {
  readonly siteId: string;
  readonly siteName: string;
  readonly published: boolean;
  /** The site's last release waits for an admin's review. */
  readonly pendingReview?: boolean;
  readonly initialJob: Job | null;
  readonly prepare: () => Promise<boolean>;
  readonly onFieldsRefused: (fields: readonly string[]) => void;
  readonly onDone: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [job, setJob, now] = useJob(initialJob);
  const [error, setError] = useState<MessageKey | null>(null);
  const [starting, setStarting] = useState(false);
  const [finishedHere, setFinishedHere] = useState(false);
  const running = active(job);
  const section = useRef<HTMLElement>(null);
  // The progress and then the link show at the end of the page: bring them into view as they appear.
  const held = job?.status === 'done' && job.error === HELD_FOR_REVIEW;
  const shownState = running ? 'running' : job?.status === 'done' && finishedHere ? 'done' : 'idle';
  useEffect(() => {
    if (shownState !== 'idle') section.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [shownState]);

  const status = job?.status;
  useEffect(() => {
    if (status === 'done' && finishedHere && !held) onDone();
  }, [status, finishedHere, held, onDone]);

  const start = async (): Promise<void> => {
    setError(null);
    setStarting(true);
    try {
      if (!(await prepare())) return;
      const queued = await publishSite(siteId);
      setFinishedHere(true);
      setJob(queued);
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'draft-incomplete') onFieldsRefused(failure.fields);
      setError(failure instanceof ApiError && failure.code === 'draft-incomplete' ? 'publish.failed.draft' : errorMessage(failure));
    } finally {
      setStarting(false);
    }
  };

  return (
    <section ref={section} className="publish" aria-labelledby="publish-heading" data-id="publish">
      <h2 id="publish-heading" className="visually-hidden">
        {t('publish.button')}
      </h2>
      {job && running ? <Steps job={job} now={now} /> : null}
      {job?.status === 'done' && finishedHere ? (
        <>
          <Steps job={job} now={now} />
          {held ? null : <LiveLink name={siteName} />}
        </>
      ) : null}
      {held || (pendingReview && !(job?.status === 'done' && finishedHere)) ? (
        <p className="notice notice-info" role="status" data-id="publish-held">
          {t('review.held')}
        </p>
      ) : null}
      {job?.status === 'failed' && !error ? (
        <p className="notice notice-warning" role="alert">
          {t(jobFailureMessage(job.error))}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-warning" role="alert">
          {t(error)}
        </p>
      ) : null}
      {published && !(job?.status === 'done' && finishedHere && !held) ? (
        <p className="hint">
          {t('publish.live')}{' '}
          <a href={`https://${siteHost(siteName)}/`} target="_blank" rel="noopener noreferrer">
            {siteHost(siteName)}
          </a>
        </p>
      ) : null}
      <button type="button" className="pill pill-cta" onClick={() => void start()} disabled={running || starting} aria-busy={running || starting} data-id="publish-button">
        {running || starting ? t('publish.working') : published ? t('publish.again') : t('publish.button')}
      </button>
    </section>
  );
}

/**
 * A developer site's builds as rows: the latest one as the state of the site at the top of the build card, and the
 * full history. Both tell a build the same way: a status badge, when, what started it, the commit, how long it took.
 */
import type { ReactNode } from 'react';
import type { Build } from '../builds-api';
import { useI18n, type MessageKey } from '../i18n';
import { duration } from './use-build';

export type BuildTone = 'live' | 'draft' | 'busy' | 'error';

export const STATUS_TONE: Readonly<Record<Build['status'], BuildTone>> = {
  queued: 'busy',
  running: 'busy',
  done: 'live',
  failed: 'error',
  skipped: 'draft',
};

function triggerKey(trigger: string | null): MessageKey {
  if (trigger === 'push') return 'trigger.push';
  if (trigger === 'rename') return 'trigger.rename';
  return 'trigger.manual';
}

export function StatusBadge({ status }: { readonly status: Build['status'] }): ReactNode {
  const { t } = useI18n();
  return <span className={`badge badge-dot badge-${STATUS_TONE[status]}`}>{t(`buildStatus.${status}`)}</span>;
}

/** When, what started it, the short commit and how long it took. */
function BuildMeta({ build }: { readonly build: Build }): ReactNode {
  const { t, locale } = useI18n();
  const when = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const took = build.startedAt && build.finishedAt ? Date.parse(build.finishedAt) - Date.parse(build.startedAt) : null;
  return (
    <span className="build-history-meta">
      {when.format(new Date(build.createdAt))} · {t(triggerKey(build.trigger))}
      {build.commitSha ? <code> {build.commitSha.slice(0, 7)}</code> : null}
      {took !== null ? ` · ${duration(t, took)}` : null}
    </span>
  );
}

/** The site's state now: its latest build, with a way to open it when it is not the one on screen. */
export function LatestBuild({ build, onView }: { readonly build: Build | null; readonly onView: (() => void) | null }): ReactNode {
  const { t } = useI18n();
  if (!build) return <p className="hint">{t('deploy.state.none')}</p>;
  return (
    <div className={`deploy-last deploy-last-${STATUS_TONE[build.status]}`} data-id="deploy-last">
      <StatusBadge status={build.status} />
      <BuildMeta build={build} />
      {onView ? (
        <button type="button" className="text-button" onClick={onView} data-id="deploy-last-view">
          {t('deploy.state.view')}
        </button>
      ) : null}
    </div>
  );
}

export function History({ builds, current, onPick }: { readonly builds: readonly Build[]; readonly current: string | null; readonly onPick: (id: string) => void }): ReactNode {
  const { t } = useI18n();
  return (
    <section className="panel" aria-labelledby="history-heading" data-id="deploy-history">
      <div className="panel-head">
        <h2 id="history-heading" className="panel-title">
          {t('deploy.history.title')}
        </h2>
        {builds.length > 0 ? <span className="hint">{builds.length}</span> : null}
      </div>
      {builds.length === 0 ? <p className="hint">{t('deploy.history.empty')}</p> : null}
      <ul className="build-history">
        {builds.map((build) => {
          const viewing = build.id === current;
          return (
            <li key={build.id} className={viewing ? 'build-history-row is-current' : 'build-history-row'} data-id={`history-${build.id}`}>
              <StatusBadge status={build.status} />
              <BuildMeta build={build} />
              {viewing ? (
                <span className="build-history-viewing">{t('deploy.history.current')}</span>
              ) : (
                <button type="button" className="pill pill-ghost pill-small" onClick={() => onPick(build.id)}>
                  {t('deploy.history.view')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

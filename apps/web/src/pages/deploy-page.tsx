import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { siteHost } from '../brand';
import { buildLogUrl, saveBuildSettings, siteBuilds, startBuild, uploadZip, MAX_ZIP_BYTES, type Build, type SiteBuilds } from '../builds-api';
import { BuildProgressView } from '../deploy/build-progress';
import { DetectionSummary, SettingsPanel, WaitingTips, WebhookCard } from '../deploy/deploy-cards';
import { duration, isActive, useBuild } from '../deploy/use-build';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';
import { Loader } from '../loading';
import { DeleteSitePanel } from '../delete-site-panel';

/** `/sites/:siteId/deploy`: a developer site's current build, settings, deploy-on-push and history. */
export function DeployPage(): ReactNode {
  return <SignedInPage>{() => <Deploy />}</SignedInPage>;
}

const STATUS_TONE: Readonly<Record<Build['status'], 'live' | 'draft' | 'busy' | 'warn'>> = {
  queued: 'busy',
  running: 'busy',
  done: 'live',
  failed: 'warn',
  skipped: 'draft',
};

function History({ builds, current, onPick }: { readonly builds: readonly Build[]; readonly current: string | null; readonly onPick: (id: string) => void }): ReactNode {
  const { t, locale } = useI18n();
  const when = new Intl.DateTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <section className="panel" aria-labelledby="history-heading" data-id="deploy-history">
      <h2 id="history-heading" className="panel-title">
        {t('deploy.history.title')}
      </h2>
      {builds.length === 0 ? <p className="hint">{t('deploy.history.empty')}</p> : null}
      <ul className="build-history">
        {builds.map((build) => {
          const took = build.startedAt && build.finishedAt ? Date.parse(build.finishedAt) - Date.parse(build.startedAt) : null;
          const trigger = build.trigger === 'push' ? 'trigger.push' : build.trigger === 'rename' ? 'trigger.rename' : 'trigger.manual';
          return (
            <li key={build.id} className={build.id === current ? 'build-history-row is-current' : 'build-history-row'} data-id={`history-${build.id}`}>
              <span className={`badge badge-${STATUS_TONE[build.status]}`}>{t(`buildStatus.${build.status}`)}</span>
              <span className="build-history-meta">
                {when.format(new Date(build.createdAt))} · {t(trigger)}
                {build.commitSha ? <code> {build.commitSha.slice(0, 7)}</code> : null}
                {took !== null ? ` · ${duration(t, took)}` : null}
              </span>
              <button type="button" className="pill pill-ghost pill-small" onClick={() => onPick(build.id)}>
                {t('deploy.history.view')}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ZipUpload({ siteId, onUploaded }: { readonly siteId: string; readonly onUploaded: () => void }): ReactNode {
  const { t } = useI18n();
  const inputId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const upload = async (file: File): Promise<void> => {
    if (file.size > MAX_ZIP_BYTES) {
      setError('deploy.zip.tooBig');
      return;
    }
    setError(null);
    setProgress(0);
    try {
      await uploadZip(siteId, file, setProgress);
      onUploaded();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setProgress(null);
    }
  };
  return (
    <div className="field" data-id="deploy-zip-upload">
      <label className="field-label" htmlFor={inputId}>
        {t('deploy.zip.replace')}
      </label>
      <input
        id={inputId}
        className="input"
        type="file"
        accept=".zip,application/zip"
        disabled={progress !== null}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <p className={error ? 'field-error' : 'hint'} role={error ? 'alert' : undefined}>
        {progress !== null ? t('deploy.zip.uploading', { n: Math.round(progress * 100) }) : error ? t(error) : t('deploy.zip.help')}
      </p>
    </div>
  );
}

function Deploy(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { siteId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const [data, setData] = useState<SiteBuilds | null>(null);
  const [loadError, setLoadError] = useState<MessageKey | null>(null);
  const [startError, setStartError] = useState<MessageKey | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    siteBuilds(siteId)
      .then(setData)
      .catch((failure: unknown) => setLoadError(errorMessage(failure)));
  }, [siteId]);
  useEffect(load, [load]);

  const latest = data?.builds[0] ?? null;
  const picked = search.get('build');
  // The build asked for in the address, else one still running.
  const currentId = picked ?? (latest && (latest.status === 'queued' || latest.status === 'running') ? latest.id : null);
  const followed = useBuild(currentId);
  const status = followed.detail?.build.status;
  useEffect(() => {
    // A build that just ended changes the history and the site: read them again.
    if (status === 'done' || status === 'failed' || status === 'skipped') load();
  }, [status, load]);

  if (loadError) {
    return (
      <section className="home">
        <p className="notice notice-warning" role="alert">
          {t(loadError)}
        </p>
        <Link className="back-link" to="/">
          {t('editor.back')}
        </Link>
      </section>
    );
  }
  if (!data) {
    return (
      <Loader />
    );
  }

  const { developer, site, limits } = data;
  const active = isActive(followed.detail) || data.builds.some((b) => b.status === 'queued' || b.status === 'running');
  const lastReport = data.builds.find((b) => b.status === 'done' && b.report)?.report ?? null;
  const firstBuild = !data.builds.some((b) => b.status === 'done');
  const canBuild = developer.source === 'git' || developer.hasZip;

  const build = async (): Promise<void> => {
    setStarting(true);
    setStartError(null);
    try {
      const started = await startBuild(site.id);
      setSearch({ build: started.build.id }, { replace: true });
      load();
    } catch (failure) {
      setStartError(errorMessage(failure));
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="deploy" data-id="deploy">
      <Link className="back-link" to="/" data-id="deploy-page-back">
        {t('editor.back')}
      </Link>
      <div className="deploy-head">
        <h1 className="page-title">{siteHost(site.name)}</h1>
        <p className="hint">
          {developer.source === 'git' ? t('deploy.source.git', { repo: developer.repoUrl ?? '', branch: developer.branch ?? '' }) : t('deploy.source.zip')}
        </p>
        <p className="hint" data-id="deploy-quota">
          {t('deploy.quota', { used: limits.usedMinutesToday, limit: limits.buildMinutesPerDay })}
        </p>
        {developer.pendingPushAt ? <p className="notice notice-info">{t('deploy.pending')}</p> : null}
      </div>

      {followed.detail ? (
        <BuildProgressView
          key={followed.detail.build.id}
          detail={followed.detail}
          lines={followed.lines}
          now={followed.now}
          logUrl={buildLogUrl(followed.detail.build.id)}
          onChange={followed.update}
          aside={isActive(followed.detail) ? <WaitingTips report={lastReport} detection={developer.detection} firstBuild={firstBuild} /> : null}
        />
      ) : developer.detection ? (
        <section className="panel">
          <DetectionSummary detection={developer.detection} settings={developer.settings} />
        </section>
      ) : null}

      {startError ? (
        <p className="notice notice-warning" role="alert">
          {t(startError)}
        </p>
      ) : null}
      {!canBuild ? <p className="notice notice-info">{t('deploy.error.zipMissing')}</p> : null}
      <div className="deploy-actions">
        <button type="button" className="pill pill-cta" onClick={() => void build()} disabled={active || starting || !canBuild} aria-busy={starting} data-id="deploy-build">
          {site.published ? t('deploy.rebuild') : t('deploy.build')}
        </button>
        {site.published ? (
          <a className="pill pill-ghost" href={`https://${siteHost(site.name)}/`} target="_blank" rel="noopener noreferrer">
            {t('home.view')}
          </a>
        ) : null}
      </div>

      <div className="deploy-cards">
        {developer.source === 'zip' && !active ? (
          <section className="panel">
            <ZipUpload siteId={site.id} onUploaded={load} />
          </section>
        ) : null}
        <SettingsPanel
          key={JSON.stringify(developer.settings)}
          initial={developer.settings}
          onSave={async (settings) => {
            const saved = await saveBuildSettings(site.id, settings);
            setData({ ...data, developer: saved });
          }}
        />
        {developer.webhook && developer.repoUrl ? <WebhookCard webhook={developer.webhook} branch={developer.branch ?? ''} repoUrl={developer.repoUrl} /> : null}
        <History builds={data.builds} current={currentId} onPick={(id) => navigate(`/sites/${site.id}/deploy?build=${id}`)} />
      </div>

      <DeleteSitePanel siteId={site.id} siteName={site.name} />
    </section>
  );
}

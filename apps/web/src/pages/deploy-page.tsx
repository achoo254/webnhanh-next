import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { siteHost } from '../brand';
import { buildLogUrl, saveBuildSettings, siteBuilds, startBuild, type BuildSettings, type SiteBuilds } from '../builds-api';
import { History, LatestBuild } from '../deploy/build-history';
import { BuildProgressView } from '../deploy/build-progress';
import { DetectionSummary, WaitingTips, WebhookCard } from '../deploy/deploy-cards';
import { SettingsPanel } from '../deploy/settings-form';
import { isActive, useBuild } from '../deploy/use-build';
import { ZipUpload } from '../deploy/zip-upload';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';
import { Loader } from '../loading';
import { DeleteSitePanel } from '../delete-site-panel';

/**
 * `/sites/:siteId/deploy`: a developer site's build as one flow (where it stands, how it is built, the Build button,
 * then the result), its history, and beside it the source, the build settings and deploy-on-push. Wide screens show
 * the two columns; phones read the same blocks in the order of the flow.
 */
export function DeployPage(): ReactNode {
  return <SignedInPage>{() => <Deploy />}</SignedInPage>;
}

/** Puts the cursor in the first build setting (the panel scrolls into view with it). */
function focusSettings(): void {
  document.getElementById('deploy-settings')?.querySelector<HTMLInputElement>('input')?.focus();
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
    return <Loader />;
  }

  const { developer, site, limits } = data;
  const active = isActive(followed.detail) || data.builds.some((b) => b.status === 'queued' || b.status === 'running');
  const lastReport = data.builds.find((b) => b.status === 'done' && b.report)?.report ?? null;
  const firstBuild = !data.builds.some((b) => b.status === 'done');
  const canBuild = developer.source === 'git' || developer.hasZip;
  const quota = { used: limits.usedMinutesToday, limit: limits.buildMinutesPerDay };
  // What the check recognized, as the values each setting goes back to. The check ran in the app folder it was given,
  // so that folder is its own recognized value.
  const recognized: BuildSettings | null = developer.detection
    ? { rootDir: developer.settings.rootDir, buildCommand: developer.detection.buildCommand, outputDir: developer.detection.outputDir }
    : null;
  const openBuild = (id: string): void => {
    void navigate(`/sites/${site.id}/deploy?build=${id}`);
  };

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

  let buildLabel: MessageKey = site.published ? 'deploy.rebuild' : 'deploy.build';
  if (active || starting) buildLabel = 'deploy.building';

  return (
    <section className="deploy" data-id="deploy">
      <header className="deploy-head">
        <Link className="back-link" to="/" data-id="deploy-page-back">
          {t('editor.back')}
        </Link>
        <div className="deploy-title-row">
          <div className="deploy-title">
            <h1 className="page-title">{siteHost(site.name)}</h1>
            <p className="hint">{developer.source === 'git' ? t('deploy.source.git', { repo: developer.repoUrl ?? '', branch: developer.branch ?? '' }) : t('deploy.source.zip')}</p>
          </div>
          {site.published ? (
            <a className="pill pill-ghost pill-small" href={`https://${siteHost(site.name)}/`} target="_blank" rel="noopener noreferrer" data-id="deploy-open-site">
              {t('home.view')}
            </a>
          ) : null}
        </div>
      </header>

      <div className="deploy-layout">
        <div className="deploy-main">
          <section className="panel deploy-build" aria-labelledby="deploy-build-heading" data-id="deploy-build-panel">
            <h2 id="deploy-build-heading" className="panel-title">
              {t('deploy.panel.title')}
            </h2>

            <div className="deploy-step" data-id="deploy-state">
              <h3 className="deploy-step-label">{t('deploy.state.label')}</h3>
              <LatestBuild build={latest} onView={latest && latest.id !== currentId ? () => openBuild(latest.id) : null} />
              {developer.pendingPushAt ? <p className="notice notice-info">{t('deploy.pending')}</p> : null}
            </div>

            <div className="deploy-step" data-id="deploy-config">
              <div className="deploy-step-head">
                <h3 className="deploy-step-label">{t('deploy.config.label')}</h3>
                <button type="button" className="text-button" onClick={focusSettings} data-id="deploy-config-edit">
                  {t('deploy.config.edit')}
                </button>
              </div>
              {developer.detection ? <DetectionSummary detection={developer.detection} settings={developer.settings} /> : <p className="hint">{t('deploy.config.unknown')}</p>}
            </div>

            <div className="deploy-step deploy-run">
              {startError ? (
                <p className="notice notice-warning" role="alert">
                  {t(startError)}
                </p>
              ) : null}
              {!canBuild ? <p className="notice notice-info">{t('deploy.error.zipMissing')}</p> : null}
              <div className="deploy-run-bar">
                <button type="button" className="pill pill-cta" onClick={() => void build()} disabled={active || starting || !canBuild} aria-busy={starting || active} data-id="deploy-build">
                  {t(buildLabel)}
                </button>
                <div className={quota.used >= quota.limit ? 'deploy-quota is-full' : 'deploy-quota'}>
                  <p className="hint" data-id="deploy-quota">
                    {t('deploy.quota', quota)}
                  </p>
                  <span className="deploy-quota-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }} />
                  </span>
                </div>
              </div>
              {active ? <p className="hint">{t('deploy.busy')}</p> : null}
            </div>
          </section>

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
          ) : null}

          <History builds={data.builds} current={currentId} onPick={openBuild} />
        </div>

        <div className="deploy-side">
          {developer.source === 'zip' ? <ZipUpload siteId={site.id} hasZip={developer.hasZip} disabled={active} onUploaded={load} /> : null}
          <SettingsPanel
            initial={developer.settings}
            defaults={recognized}
            onSave={async (settings) => {
              const saved = await saveBuildSettings(site.id, settings);
              setData((before) => before && { ...before, developer: saved });
              return saved.settings;
            }}
          />
          {developer.webhook && developer.repoUrl ? <WebhookCard webhook={developer.webhook} branch={developer.branch ?? ''} repoUrl={developer.repoUrl} /> : null}
        </div>
      </div>

      <DeleteSitePanel siteId={site.id} siteName={site.name} />
    </section>
  );
}

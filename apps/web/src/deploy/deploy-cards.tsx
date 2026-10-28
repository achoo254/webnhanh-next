/**
 * The cards of a developer site beside its builds: useful things to do while a build runs (from what the last build
 * found in the site), what the check recognized, and how to turn on deploy-on-push. The settings form is in
 * `settings-form.tsx`.
 */
import { useState, type ReactNode } from 'react';
import type { BuildReport, BuildSettings, Detection } from '../builds-api';
import { warningMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { frameworkName } from './build-progress';

const KB = 1024;

/** While a build runs: what the live site lacks (description, share picture, icon), and tips for a first build. */
export function WaitingTips({ report, detection, firstBuild }: { readonly report: BuildReport | null; readonly detection: Detection | null; readonly firstBuild: boolean }): ReactNode {
  const { t } = useI18n();
  const tasks: MessageKey[] = [];
  if (report) {
    if (!report.hasDescription) tasks.push('wait.description');
    if (!report.hasOgImage) tasks.push('wait.og');
    if (!report.hasFavicon) tasks.push('wait.favicon');
  } else {
    tasks.push('wait.description', 'wait.og', 'wait.favicon');
  }
  const tips: string[] = [];
  if (firstBuild && detection) {
    if (detection.packageManager === null) tips.push(t('tip.static'));
    else {
      if (detection.lockfile === null) tips.push(t('tip.lockfile'));
      tips.push(t('tip.unused'));
    }
  }
  for (const image of report?.largeImages.slice(0, 3) ?? []) tips.push(t('tip.images', { path: image.path, size: `${Math.round(image.bytes / KB)} KB` }));
  return (
    <div className="wait-cards" data-id="build-wait">
      <h3 className="panel-title">{t('wait.title')}</h3>
      {report && tasks.length === 0 ? <p className="wait-card wait-card-ok">{t('wait.allGood')}</p> : null}
      {tasks.map((key) => (
        <p key={key} className="wait-card">
          {t(key)}
        </p>
      ))}
      {tips.length > 0 ? (
        <>
          <h3 className="panel-title">{t('wait.firstTime')}</h3>
          {tips.map((tip) => (
            <p key={tip} className="wait-card wait-card-tip">
              {tip}
            </p>
          ))}
        </>
      ) : null}
    </div>
  );
}

/**
 * The app folders a monorepo check suggests. With `onPick`, each is a button that takes that folder (and checks again);
 * without, the developer is told where to put it.
 */
function AppSuggestions({ apps, onPick, disabled }: { readonly apps: Detection['apps']; readonly onPick?: (dir: string) => void; readonly disabled?: boolean }): ReactNode {
  const { t } = useI18n();
  const [only] = apps;
  if (!only) return null;
  return (
    <div className="notice notice-info row" data-id="deploy-apps">
      <p>{apps.length === 1 ? t('deploy.apps.one', { framework: frameworkName(t, only.framework), dir: only.dir }) : t('deploy.apps.many', { n: apps.length })}</p>
      {onPick ? (
        <div className="chips">
          {apps.map((app) => (
            <button key={app.dir} type="button" className="pill pill-dark pill-small" onClick={() => onPick(app.dir)} disabled={disabled} data-id={`deploy-app-${app.dir}`}>
              {t('deploy.apps.use', { dir: app.dir, framework: frameworkName(t, app.framework) })}
            </button>
          ))}
        </div>
      ) : (
        <>
          {apps.length > 1 ? (
            <ul>
              {apps.map((app) => (
                <li key={app.dir}>
                  <code>{app.dir}</code> ({frameworkName(t, app.framework)})
                </li>
              ))}
            </ul>
          ) : null}
          <p>{t('deploy.apps.fill')}</p>
        </>
      )}
    </div>
  );
}

/**
 * What the check recognized: framework, package manager, the plan, its warnings, and the app folders a monorepo
 * suggests (`onPickApp` makes them one-click).
 */
export function DetectionSummary({
  detection,
  settings,
  onPickApp,
  pickDisabled,
}: {
  readonly detection: Detection;
  readonly settings: BuildSettings;
  readonly onPickApp?: (dir: string) => void;
  readonly pickDisabled?: boolean;
}): ReactNode {
  const { t } = useI18n();
  const output = settings.outputDir === '' ? t('deploy.root') : settings.outputDir;
  return (
    <div className="detection" data-id="deploy-detection">
      <p className="detection-found">
        {settings.buildCommand === null || detection.packageManager === null
          ? t('deploy.detected.static')
          : t('deploy.detected', { framework: frameworkName(t, detection.framework), pm: detection.packageManager === 'yarn-berry' ? 'yarn' : detection.packageManager })}
      </p>
      <p className="detection-plan">
        {settings.buildCommand ? t('deploy.plan', { command: settings.buildCommand, output }) : t('deploy.plan.static', { output })}
      </p>
      {detection.warnings.map((code) => {
        const key = warningMessage(code);
        return key ? (
          <p key={code} className={`notice ${detection.supported ? 'notice-info' : 'notice-warning'}`}>
            {t(key)}
          </p>
        ) : null;
      })}
      <AppSuggestions apps={detection.apps} onPick={onPickApp} disabled={pickDisabled} />
    </div>
  );
}

function CopyRow({ label, value, secret }: { readonly label: string; readonly value: string; readonly secret?: boolean }): ReactNode {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(!secret);
  return (
    <div className="copy-row">
      <span className="field-label">{label}</span>
      <code className="copy-value">{shown ? value : '•'.repeat(24)}</code>
      <div className="copy-actions">
        {secret ? (
          <button type="button" className="pill pill-ghost pill-small" onClick={() => setShown(!shown)}>
            {shown ? t('webhook.hide') : t('webhook.show')}
          </button>
        ) : null}
        <button
          type="button"
          className="pill pill-dark pill-small"
          onClick={() => {
            navigator.clipboard
              .writeText(value)
              .then(() => setCopied(true))
              .catch((error: unknown) => console.warn('copy failed', error instanceof Error ? error.message : String(error)));
          }}
        >
          {copied ? t('webhook.copied') : t('webhook.copy')}
        </button>
      </div>
    </div>
  );
}

const GITHUB_STEPS: readonly MessageKey[] = ['webhook.github.1', 'webhook.github.2', 'webhook.github.3', 'webhook.github.4'];
const GITLAB_STEPS: readonly MessageKey[] = ['webhook.gitlab.1', 'webhook.gitlab.2', 'webhook.gitlab.3', 'webhook.gitlab.4'];

/** Deploy on push: the URL and secret to copy, and the steps on GitHub or GitLab. */
export function WebhookCard({ webhook, branch, repoUrl }: { readonly webhook: { url: string; secret: string }; readonly branch: string; readonly repoUrl: string }): ReactNode {
  const { t } = useI18n();
  const steps = repoUrl.startsWith('https://gitlab.com/') ? GITLAB_STEPS : GITHUB_STEPS;
  return (
    <section className="panel" aria-labelledby="webhook-heading" data-id="deploy-webhook">
      <h2 id="webhook-heading" className="panel-title">
        {t('webhook.title')}
      </h2>
      <p className="hint">{t('webhook.body', { branch })}</p>
      <CopyRow label={t('webhook.url')} value={webhook.url} />
      <CopyRow label={t('webhook.secret')} value={webhook.secret} secret />
      <ol className="webhook-steps">
        {steps.map((key, i) => (
          <li key={key}>
            <span className="webhook-step-number" aria-hidden="true">
              {i + 1}
            </span>
            {t(key)}
          </li>
        ))}
      </ol>
    </section>
  );
}

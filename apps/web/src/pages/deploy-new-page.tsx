import { BUILD_MINUTES_PER_DAY, DEVELOPER_SITES_PER_ACCOUNT } from '@webnhanh/db/build-limits';
import { checkSiteName } from '@webnhanh/db/site-name';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { SITES_DOMAIN } from '../brand';
import { checkRepo, createGitSite, createZipSite, MAX_ZIP_BYTES, startBuild, uploadZip, type BuildSettings, type RepoCheck } from '../builds-api';
import { DetectionSummary, SettingsFields } from '../deploy/deploy-cards';
import { errorMessage } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { SignedInPage } from '../signed-in-page';

/** `/new/developer`: a site from a public repo (checked first, settings confirmed) or from a zip. */
export function DeployNewPage(): ReactNode {
  return <SignedInPage>{() => <DeployNew />}</SignedInPage>;
}

const NAME_REASONS: Readonly<Record<'format' | 'reserved' | 'sensitive', MessageKey>> = {
  format: 'name.format',
  reserved: 'name.reserved',
  sensitive: 'name.sensitive',
};

/** The site's address, checked as it is typed. */
function NameField({ value, onChange }: { readonly value: string; readonly onChange: (value: string) => void }): ReactNode {
  const { t } = useI18n();
  const inputId = useId();
  const helpId = useId();
  const check = value.trim() === '' ? null : checkSiteName(value);
  const problem = check && !check.ok ? NAME_REASONS[check.reason] : null;
  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {t('new.name.label')}
      </label>
      <div className="address-input">
        <input
          id={inputId}
          className="input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          maxLength={30}
          aria-invalid={problem !== null}
          aria-describedby={helpId}
          data-id="deploy-name"
        />
        <span className="address-suffix">.{SITES_DOMAIN}</span>
      </div>
      <p id={helpId} className={problem ? 'field-error' : 'hint'}>
        {problem ? t(problem) : t('new.name.help')}
      </p>
    </div>
  );
}

function GitForm(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const ids = { repo: useId(), branch: useId(), root: useId() };
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [rootDir, setRootDir] = useState('');
  const [checked, setChecked] = useState<RepoCheck | null>(null);
  const [settings, setSettings] = useState<BuildSettings | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<'check' | 'create' | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const nameCheck = checkSiteName(name);

  const runCheck = async (dir: string): Promise<void> => {
    setBusy('check');
    setError(null);
    try {
      const result = await checkRepo(repoUrl.trim(), branch.trim(), dir);
      setChecked(result);
      setBranch(result.repo.branch);
      setSettings(result.settings);
      if (name === '') setName(result.repo.url.split('/').pop()?.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30) ?? '');
    } catch (failure) {
      setChecked(null);
      setError(errorMessage(failure));
    } finally {
      setBusy(null);
    }
  };

  const check = (event: FormEvent): void => {
    event.preventDefault();
    void runCheck(rootDir.trim());
  };

  /** A monorepo's suggested app folder: it goes in the field and the repo is checked again for it. */
  const pickApp = (dir: string): void => {
    setRootDir(dir);
    void runCheck(dir);
  };

  const create = async (): Promise<void> => {
    if (!checked || !settings || !nameCheck.ok) return;
    setBusy('create');
    setError(null);
    let siteId: string;
    try {
      siteId = await createGitSite({ name: nameCheck.name, repoUrl: checked.repo.url, branch: checked.repo.branch, settings, detection: checked.detection });
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(null);
      return;
    }
    try {
      const started = await startBuild(siteId);
      navigate(`/sites/${siteId}/deploy?build=${started.build.id}`);
    } catch {
      // The site exists; its page says why it cannot build now (the day's builds, a full queue).
      navigate(`/sites/${siteId}/deploy`);
    }
  };

  return (
    <div className="deploy-form">
      <form className="panel" onSubmit={check} noValidate data-id="deploy-git">
        <div className="field">
          <label className="field-label" htmlFor={ids.repo}>
            {t('deploy.repo.label')}
          </label>
          <input
            id={ids.repo}
            className="input input-mono"
            value={repoUrl}
            onChange={(event) => {
              setRepoUrl(event.target.value);
              setChecked(null);
            }}
            placeholder="https://github.com/…"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            data-id="deploy-repo"
          />
          <p className="hint">{t('deploy.repo.help')}</p>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label" htmlFor={ids.branch}>
              {t('deploy.branch.label')}
            </label>
            <input id={ids.branch} className="input input-mono" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="main" autoCapitalize="none" spellCheck={false} data-id="deploy-branch" />
          </div>
          <div className="field">
            <label className="field-label" htmlFor={ids.root}>
              {t('deploy.rootDir.label')}
            </label>
            <input id={ids.root} className="input input-mono" value={rootDir} onChange={(event) => setRootDir(event.target.value)} placeholder="apps/web" autoCapitalize="none" spellCheck={false} data-id="deploy-root" />
          </div>
        </div>
        <p className="hint">{t('deploy.branch.help')}</p>
        <button type="submit" className="pill pill-dark" disabled={repoUrl.trim() === '' || busy !== null} aria-busy={busy === 'check'} data-id="deploy-check">
          {busy === 'check' ? t('deploy.checking') : t('deploy.check')}
        </button>
      </form>

      {error ? (
        <p className="notice notice-warning" role="alert">
          {t(error)}
        </p>
      ) : null}

      {checked && settings ? (
        <section className="panel" aria-labelledby="deploy-plan-heading" data-id="deploy-plan">
          <h2 id="deploy-plan-heading" className="panel-title">
            {t('deploy.settings.title')}
          </h2>
          <p className="hint">{t('deploy.commit', { branch: checked.repo.branch, commit: checked.repo.commit.slice(0, 7) })}</p>
          <DetectionSummary detection={checked.detection} settings={settings} onPickApp={pickApp} pickDisabled={busy !== null} />
          <SettingsFields value={settings} onChange={setSettings} />
          <NameField value={name} onChange={setName} />
          {!checked.detection.supported ? <p className="hint">{t('deploy.unsupported')}</p> : null}
          <button type="button" className="pill pill-cta" onClick={() => void create()} disabled={!nameCheck.ok || !checked.detection.supported || busy !== null} aria-busy={busy === 'create'} data-id="deploy-create">
            {busy === 'create' ? t('deploy.creating') : t('deploy.create')}
          </button>
        </section>
      ) : null}
    </div>
  );
}

function ZipForm(): ReactNode {
  const { t } = useI18n();
  const navigate = useNavigate();
  const fileId = useId();
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const nameCheck = checkSiteName(name);
  const tooBig = file !== null && file.size > MAX_ZIP_BYTES;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!file || !nameCheck.ok || tooBig) return;
    setError(null);
    setProgress(0);
    try {
      const siteId = await createZipSite(nameCheck.name);
      try {
        await uploadZip(siteId, file, setProgress);
      } catch (failure) {
        // The site is there: its page says the zip is missing and takes another one.
        console.warn('zip upload failed', failure instanceof Error ? failure.message : String(failure));
      }
      navigate(`/sites/${siteId}/deploy`);
    } catch (failure) {
      setError(errorMessage(failure));
      setProgress(null);
    }
  };

  return (
    <form className="panel deploy-form" onSubmit={(event) => void submit(event)} noValidate data-id="deploy-zip">
      <NameField value={name} onChange={setName} />
      <div className="field">
        <label className="field-label" htmlFor={fileId}>
          {t('deploy.zip.label')}
        </label>
        <input id={fileId} className="input" type="file" accept=".zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} data-id="deploy-zip-file" />
        <p className={tooBig ? 'field-error' : 'hint'}>{tooBig ? t('deploy.zip.tooBig') : t('deploy.zip.help')}</p>
      </div>
      {error ? (
        <p className="notice notice-warning" role="alert">
          {t(error)}
        </p>
      ) : null}
      <button type="submit" className="pill pill-cta" disabled={!file || tooBig || !nameCheck.ok || progress !== null} aria-busy={progress !== null} data-id="deploy-zip-submit">
        {progress !== null ? t('deploy.zip.uploading', { n: Math.round(progress * 100) }) : t('deploy.zip.upload')}
      </button>
    </form>
  );
}

function DeployNew(): ReactNode {
  const { t } = useI18n();
  const [tab, setTab] = useState<'git' | 'zip'>('git');
  return (
    <section className="new-site deploy-new" data-id="deploy-new">
      <Link className="back-link" to="/new" data-id="deploy-back">
        {t('new.back')}
      </Link>
      <h1 className="page-title">{t('deploy.new.title')}</h1>
      <p className="lede">{t('deploy.new.lede')}</p>
      <div className="tabs deploy-tabs">
        <button type="button" className="tab" aria-pressed={tab === 'git'} onClick={() => setTab('git')} data-id="deploy-tab-git">
          {t('deploy.tab.git')}
        </button>
        <button type="button" className="tab" aria-pressed={tab === 'zip'} onClick={() => setTab('zip')} data-id="deploy-tab-zip">
          {t('deploy.tab.zip')}
        </button>
      </div>
      {tab === 'git' ? <GitForm /> : <ZipForm />}
      <p className="hint">{t('deploy.limit', { limit: DEVELOPER_SITES_PER_ACCOUNT, perDay: BUILD_MINUTES_PER_DAY })}</p>
    </section>
  );
}

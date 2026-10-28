import { publishIssues, renderDraft, templateImageIds, type ImageAsset, type IssueCode, type TemplateDraft } from '@webnhanh/templates';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { brand } from '../brand';
import { ISSUE_MESSAGES } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { editorAsset, saveDraft, type Job, type Site, type SiteImage } from '../sites-api';
import { AddressPanel } from './address-panel';
import { CafeForm } from './forms/cafe-form';
import type { FormProps } from './forms/form-props';
import { ProfileForm } from './forms/profile-form';
import { ShopForm } from './forms/shop-form';
import { TetForm } from './forms/tet-form';
import { WeddingForm } from './forms/wedding-form';
import { PublishPanel } from './publish-panel';
import { previewFontUrl } from './style-picker';

/** Saves this long after the last change. */
const SAVE_DELAY_MS = 800;

type SaveState = 'idle' | 'saving' | 'error';

/**
 * Keeps the server's copy of the draft in step: saves a moment after each change, one save at a time, always the
 * newest draft. `flush` saves now and resolves true once the save went through.
 */
function useAutosave(siteId: string, draft: unknown, initial: unknown): { dirty: boolean; state: SaveState; flush: () => Promise<boolean> } {
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial));
  const [state, setState] = useState<SaveState>('idle');
  const latest = useRef(draft);
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const json = JSON.stringify(draft);
  const dirty = json !== savedJson;

  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  const flush = useCallback((): Promise<boolean> => {
    chain.current = chain.current.then(async () => {
      const snapshot = latest.current;
      const snapshotJson = JSON.stringify(snapshot);
      setState('saving');
      try {
        await saveDraft(siteId, snapshot);
        setSavedJson(snapshotJson);
        setState('idle');
        return true;
      } catch (error) {
        console.warn('draft save failed', error instanceof Error ? error.message : String(error));
        setState('error');
        return false;
      }
    });
    return chain.current;
  }, [siteId]);

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void flush(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [json, dirty, flush]);

  // Leaving with unsaved changes: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  return { dirty, state, flush };
}

function SaveStatus({ dirty, state }: { readonly dirty: boolean; readonly state: SaveState }): ReactNode {
  const { t } = useI18n();
  const key: MessageKey = state === 'saving' ? 'editor.saving' : state === 'error' ? 'editor.saveFailed' : dirty ? 'editor.unsaved' : 'editor.saved';
  return (
    <span className={`save-status${state === 'error' ? ' save-status-error' : ''}`} role="status" data-id="save-status">
      {t(key)}
    </span>
  );
}

/**
 * The page as visitors will see it: the same renderer as the published page, its form (a shop's orders, a wedding's
 * replies) and fonts included, in a frame that runs no script and sends no form (the form's token is a stand-in; the
 * frame cannot submit anyway).
 */
function Preview({ value, assets, siteName }: { readonly value: TemplateDraft; readonly assets: ReadonlyMap<string, ImageAsset>; readonly siteName: string }): ReactNode {
  const { t } = useI18n();
  const html = useMemo(() => {
    const origin = window.location.origin;
    const form = { action: `${origin}/f/${siteName}`, token: 'preview' };
    return renderDraft(value, assets, { madeWith: { name: brand.appName, url: origin }, orderForm: form, rsvpForm: form, fontUrl: previewFontUrl }).html;
  }, [value, assets, siteName]);
  return (
    <iframe
      className="preview-frame"
      title={t('editor.preview.title')}
      srcDoc={html}
      // No allow-scripts: nothing in the page can run. allow-same-origin only lets the frame load the owner's photos
      // from the editor's image route with the session cookie.
      sandbox="allow-same-origin"
      data-id="preview"
    />
  );
}

/** Issues to show beside their fields: wrong links and contacts as soon as they are typed, the rest after a publish attempt. */
function visibleIssues(value: TemplateDraft, attempted: boolean): Map<string, IssueCode> {
  const shown = new Map<string, IssueCode>();
  for (const issue of publishIssues(value)) {
    if (attempted || issue.code.startsWith('invalid-')) shown.set(issue.field, issue.code);
  }
  return shown;
}

/** The form of the draft's template, editing that draft only. */
function TemplateForm({
  value,
  setValue,
  common,
}: {
  readonly value: TemplateDraft;
  readonly setValue: (change: (current: TemplateDraft) => TemplateDraft) => void;
  readonly common: Omit<FormProps<unknown>, 'draft' | 'update'>;
}): ReactNode {
  // Each updater applies to the draft only while it is still of the same template (it always is: a site keeps its template).
  switch (value.template) {
    case 'shop':
      return <ShopForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'shop' ? { template: 'shop', draft: change(current.draft) } : current))} />;
    case 'tet':
      return <TetForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'tet' ? { template: 'tet', draft: change(current.draft) } : current))} />;
    case 'wedding':
      return (
        <WeddingForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'wedding' ? { template: 'wedding', draft: change(current.draft) } : current))} />
      );
    case 'cafe':
      return <CafeForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'cafe' ? { template: 'cafe', draft: change(current.draft) } : current))} />;
    case 'profile':
      return (
        <ProfileForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'profile' ? { template: 'profile', draft: change(current.draft) } : current))} />
      );
  }
}

/**
 * The editor of a template page (any template): on a phone, Edit and Preview are two tabs; on a wide screen, side by
 * side. The draft saves itself; Publish saves, checks and starts the publish job.
 */
export function SiteEditor({
  initialSite,
  initialValue,
  initialImages,
}: {
  readonly initialSite: Site;
  readonly initialValue: TemplateDraft;
  readonly initialImages: readonly SiteImage[];
}): ReactNode {
  const { t } = useI18n();
  const [site, setSite] = useState(initialSite);
  const [job, setJob] = useState<Job | null>(initialSite.job);
  const [value, setValue] = useState(initialValue);
  const [images, setImages] = useState<ReadonlyMap<string, SiteImage>>(() => new Map(initialImages.map((image) => [image.id, image])));
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [attempted, setAttempted] = useState(false);
  // Bumped on every refused publish: the first wrong field is then brought into view, even far above the button.
  const [refusals, setRefusals] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const { dirty, state, flush } = useAutosave(site.id, value.draft, initialValue.draft);

  const assets = useMemo(() => new Map([...images].map(([id, image]) => [id, editorAsset(site.id, image)])), [images, site.id]);
  const issues = visibleIssues(value, attempted);
  const issueText = (field: string): string | null => {
    const code = issues.get(field);
    return code ? t(ISSUE_MESSAGES[code]) : null;
  };
  const usesSamples = templateImageIds(value).some((id) => images.get(id)?.sample);
  const addImage = useCallback((image: SiteImage): void => setImages((current) => new Map(current).set(image.id, image)), []);

  const refuse = useCallback((): void => {
    setAttempted(true);
    setView('edit');
    setRefusals((count) => count + 1);
  }, []);
  useEffect(() => {
    if (refusals === 0) return;
    // A wrong field, or the issue of a whole list ("Cần ít nhất một món").
    const first = editorRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-issue="true"]');
    if (!first) return;
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first.focus({ preventScroll: true });
  }, [refusals]);

  const prepare = async (): Promise<boolean> => {
    if (publishIssues(value).length > 0) {
      refuse();
      return false;
    }
    setAttempted(true);
    return flush();
  };
  const onDone = useCallback(() => setSite((current) => ({ ...current, published: true })), []);

  return (
    <div className="editor" data-view={view} data-id="editor" ref={editorRef}>
      <div className="editor-bar">
        <Link className="back-link" to="/" data-id="editor-back">
          {t('editor.back')}
        </Link>
        <SaveStatus dirty={dirty} state={state} />
      </div>
      <div className="tabs" role="group" aria-label={t('editor.tab.preview')}>
        {(['edit', 'preview'] as const).map((tab) => (
          <button key={tab} type="button" className="tab" aria-pressed={view === tab} onClick={() => setView(tab)} data-id={`tab-${tab}`}>
            {t(tab === 'edit' ? 'editor.tab.edit' : 'editor.tab.preview')}
          </button>
        ))}
      </div>

      <div className="editor-columns">
        <div className="editor-form">
          <AddressPanel
            site={site}
            onRenamed={(renamed, renameJob) => {
              setSite(renamed);
              if (renameJob) setJob(renameJob);
            }}
          />

          {usesSamples ? <p className="notice notice-info">{t('editor.samples')}</p> : null}

          <TemplateForm value={value} setValue={setValue} common={{ siteId: site.id, images, onImage: addImage, issueText }} />
        </div>

        <div className="editor-preview">
          <Preview value={value} assets={assets} siteName={site.name} />
        </div>
      </div>

      <div className="editor-publish">
        {attempted && issues.size > 0 ? (
          <p className="field-error" role="alert" data-id="publish-issues">
            {t('issue.summary', { count: issues.size })}
          </p>
        ) : null}
        <PublishPanel
          key={job?.id ?? 'none'}
          siteId={site.id}
          siteName={site.name}
          published={site.published}
          pendingReview={site.status === 'pending-review'}
          initialJob={job}
          prepare={prepare}
          onFieldsRefused={refuse}
          onDone={onDone}
        />
      </div>
    </div>
  );
}

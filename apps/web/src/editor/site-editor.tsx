import { publishIssues, renderDraft, templateImageIds, type ImageAsset, type IssueCode, type TemplateDraft } from '@webnhanh/templates';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { brand } from '../brand';
import { ISSUE_MESSAGES } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { editorAsset, saveDraft, type Job, type Site, type SiteImage } from '../sites-api';
import { AddressPanel } from './address-panel';
import { BirthdayForm } from './forms/birthday-form';
import { CafeForm } from './forms/cafe-form';
import type { FormProps } from './forms/form-props';
import { LinksForm } from './forms/links-form';
import { PartyForm } from './forms/party-form';
import { focusIssue, IssueSummary } from './issue-navigator';
import { ProfileForm } from './forms/profile-form';
import { ShopForm } from './forms/shop-form';
import { TetForm } from './forms/tet-form';
import { WeddingForm } from './forms/wedding-form';
import { sitePhotoStore } from './photo-store';
import { PublishPanel } from './publish-panel';
import { useInlinedAppFiles } from './preview-files';
import { previewFontUrl } from './style-picker';
import { DeleteSitePanel } from '../delete-site-panel';

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
 * Where the preview's form posts: a reserved name that never resolves (RFC 2606), allowed by the page's CSP and by
 * nothing else, so a guest's reply typed into the preview is never sent anywhere.
 */
export const PREVIEW_FORM_ORIGIN = 'https://preview.invalid';

/** Which guest the preview of a "Rạp phim" invitation shows: 'none' is one who has not picked a profile yet. */
export type PreviewSide = 'none' | 'trai' | 'gai';
export const PREVIEW_SIDES: readonly PreviewSide[] = ['none', 'trai', 'gai'];

/**
 * The page as visitors will see it: the same renderer as the published page, its form (a shop's orders, a wedding's
 * replies), fonts and scripts included. The form's token is a stand-in and it posts nowhere (`PREVIEW_FORM_ORIGIN`).
 */
export function previewHtml(value: TemplateDraft, assets: ReadonlyMap<string, ImageAsset>, siteName: string, previewSide?: PreviewSide): string {
  const form = { action: `${PREVIEW_FORM_ORIGIN}/f/${siteName}`, token: 'preview' };
  return renderDraft(value, assets, {
    madeWith: { name: brand.appName, url: window.location.origin },
    orderForm: form,
    rsvpForm: form,
    fontUrl: previewFontUrl,
    previewSide,
  }).html;
}

/** True for a wedding in the "Rạp phim" layout, whose preview can show the page as one family's guest. */
export function hasGuestSides(value: TemplateDraft): boolean {
  return value.template === 'wedding' && value.draft.layout === 'cinema';
}

/**
 * The preview frame. Its page runs the template's fixed scripts (allowed by their hashes in the page's CSP), in a
 * sandbox without `allow-same-origin`: an opaque origin that reads no cookie or storage of the app and calls none of
 * its API; without `allow-forms`, `allow-popups` or top navigation it sends no form and opens nothing. The owner's
 * photos and the fonts are inlined (`useInlinedAppFiles`). The editor never reaches into the frame: a profile picked
 * in a "Rạp phim" preview comes back as a message, taken only from this frame.
 */
export function PreviewFrame({ html, onSide }: { readonly html: string; readonly onSide?: (side: PreviewSide) => void }): ReactNode {
  const { t } = useI18n();
  const frame = useRef<HTMLIFrameElement>(null);
  const page = useInlinedAppFiles(html);
  useEffect(() => {
    if (!onSide) return;
    const listen = (event: MessageEvent): void => {
      // The frame's origin is opaque ('null' for every sandboxed page): only the source tells this frame apart.
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const data: unknown = event.data;
      const side = typeof data === 'object' && data !== null ? (data as { webnhanhPreviewSide?: unknown }).webnhanhPreviewSide : undefined;
      if (side === 'trai' || side === 'gai') onSide(side);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [onSide]);
  return <iframe ref={frame} className="preview-frame" title={t('editor.preview.title')} srcDoc={page} sandbox="allow-scripts" data-id="preview" />;
}

/** "Xem như: khách chưa chọn / nhà trai / nhà gái" above a "Rạp phim" preview. */
export function PreviewSideBar({ value, onChange }: { readonly value: PreviewSide; readonly onChange: (side: PreviewSide) => void }): ReactNode {
  const { t } = useI18n();
  const labels: Readonly<Record<PreviewSide, MessageKey>> = { none: 'editor.preview.side.none', trai: 'editor.preview.side.trai', gai: 'editor.preview.side.gai' };
  return (
    <fieldset className="preview-sides" data-id="preview-sides">
      <legend className="field-label">{t('editor.preview.side')}</legend>
      <div className="chips">
        {PREVIEW_SIDES.map((side) => (
          <label key={side} className="chip" data-id={`preview-side-${side}`}>
            <input type="radio" name="preview-side" value={side} checked={value === side} onChange={() => onChange(side)} />
            <span>{t(labels[side])}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The owner's photos as the preview loads them: one width each (the one the page shows first), so each is fetched and
 * inlined once.
 */
function previewAsset(siteId: string, image: SiteImage): ImageAsset {
  const widths = [...image.widths].sort((a, b) => a - b);
  const width = widths.find((w) => w >= 800) ?? widths[widths.length - 1];
  return editorAsset(siteId, width === undefined ? image : { ...image, widths: [width] });
}

function Preview({ value, images, siteId, siteName }: { readonly value: TemplateDraft; readonly images: ReadonlyMap<string, SiteImage>; readonly siteId: string; readonly siteName: string }): ReactNode {
  const [side, setSide] = useState<PreviewSide>('none');
  const sides = hasGuestSides(value);
  const assets = useMemo(() => new Map([...images].map(([id, image]) => [id, previewAsset(siteId, image)])), [images, siteId]);
  const html = useMemo(() => previewHtml(value, assets, siteName, sides ? side : undefined), [value, assets, siteName, sides, side]);
  return (
    <>
      {sides ? <PreviewSideBar value={side} onChange={setSide} /> : null}
      <PreviewFrame html={html} onSide={setSide} />
    </>
  );
}

/** Issues to show beside their fields: wrong links and contacts as soon as they are typed, the rest after a publish attempt. */
export function visibleIssues(value: TemplateDraft, attempted: boolean): Map<string, IssueCode> {
  const shown = new Map<string, IssueCode>();
  for (const issue of publishIssues(value)) {
    if (attempted || issue.code.startsWith('invalid-')) shown.set(issue.field, issue.code);
  }
  return shown;
}

/** The form of the draft's template, editing that draft only. */
export function TemplateForm({
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
    case 'party':
      return <PartyForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'party' ? { template: 'party', draft: change(current.draft) } : current))} />;
    case 'birthday':
      return (
        <BirthdayForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'birthday' ? { template: 'birthday', draft: change(current.draft) } : current))} />
      );
    case 'links':
      return <LinksForm {...common} draft={value.draft} update={(change) => setValue((current) => (current.template === 'links' ? { template: 'links', draft: change(current.draft) } : current))} />;
  }
}

/**
 * The editor's Edit/Preview tab and its publish checks: once Publish was pressed every issue shows, and on each
 * refusal the first wrong field is brought into view (even far above the button) and focused.
 */
export function useEditorChecks(): {
  view: 'edit' | 'preview';
  setView: (view: 'edit' | 'preview') => void;
  attempted: boolean;
  setAttempted: (attempted: boolean) => void;
  refuse: () => void;
  editorRef: RefObject<HTMLDivElement | null>;
} {
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [attempted, setAttempted] = useState(false);
  const [refusals, setRefusals] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const refuse = useCallback((): void => {
    setAttempted(true);
    setView('edit');
    setRefusals((count) => count + 1);
  }, []);
  useEffect(() => {
    if (refusals === 0) return;
    focusIssue(editorRef.current, null);
  }, [refusals]);
  return { view, setView, attempted, setAttempted, refuse, editorRef };
}

/** The Edit and Preview tabs, shown on phones only (side by side on a wide screen). */
export function EditorTabs({ view, onChange }: { readonly view: 'edit' | 'preview'; readonly onChange: (view: 'edit' | 'preview') => void }): ReactNode {
  const { t } = useI18n();
  return (
    <div className="tabs" role="group" aria-label={t('editor.tab.preview')}>
      {(['edit', 'preview'] as const).map((tab) => (
        <button key={tab} type="button" className="tab" aria-pressed={view === tab} onClick={() => onChange(tab)} data-id={`tab-${tab}`}>
          {t(tab === 'edit' ? 'editor.tab.edit' : 'editor.tab.preview')}
        </button>
      ))}
    </div>
  );
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
  const { view, setView, attempted, setAttempted, refuse, editorRef } = useEditorChecks();
  const { dirty, state, flush } = useAutosave(site.id, value.draft, initialValue.draft);

  const photos = useMemo(() => sitePhotoStore(site.id), [site.id]);
  const issues = visibleIssues(value, attempted);
  const issueText = (field: string): string | null => {
    const code = issues.get(field);
    return code ? t(ISSUE_MESSAGES[code]) : null;
  };
  const usesSamples = templateImageIds(value).some((id) => images.get(id)?.sample);
  const addImage = useCallback((image: SiteImage): void => setImages((current) => new Map(current).set(image.id, image)), []);

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
      <EditorTabs view={view} onChange={setView} />

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

          <TemplateForm value={value} setValue={setValue} common={{ photos, images, onImage: addImage, issueText, site: { name: site.name, published: site.published } }} />
        </div>

        <div className="editor-preview">
          <Preview value={value} images={images} siteId={site.id} siteName={site.name} />
        </div>
      </div>

      <div className="editor-publish">
        {attempted ? <IssueSummary count={issues.size} editorRef={editorRef} /> : null}
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

      <DeleteSitePanel siteId={site.id} siteName={site.name} />
    </div>
  );
}

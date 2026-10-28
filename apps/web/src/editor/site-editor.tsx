import { LIMITS, PALETTE_IDS, PALETTES, renderShop, shopPublishIssues, type ImageAsset, type ShopDraft, type ShopIssue, type ShopProduct } from '@trang/templates';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { brand } from '../brand';
import { ISSUE_MESSAGES } from '../error-messages';
import { useI18n, type MessageKey } from '../i18n';
import { editorAsset, saveDraft, type Job, type Site, type SiteImage } from '../sites-api';
import { AddressPanel } from './address-panel';
import { ImageField } from './image-field';
import { ProductList } from './product-list';
import { PublishPanel } from './publish-panel';
import { TextField } from './text-field';

/** Saves this long after the last change. */
const SAVE_DELAY_MS = 800;

type SaveState = 'idle' | 'saving' | 'error';

/**
 * Keeps the server's copy of the draft in step: saves a moment after each change, one save at a time, always the
 * newest draft. `flush` saves now and resolves true once the save went through.
 */
function useAutosave(siteId: string, draft: ShopDraft, initial: ShopDraft): { dirty: boolean; state: SaveState; flush: () => Promise<boolean> } {
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

/** The page as visitors will see it: the same renderer as the published page, in a frame that runs no script. */
function Preview({ draft, assets }: { readonly draft: ShopDraft; readonly assets: ReadonlyMap<string, ImageAsset> }): ReactNode {
  const { t } = useI18n();
  const html = useMemo(() => renderShop(draft, assets, { madeWith: { name: brand.appName, url: window.location.origin } }).html, [draft, assets]);
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

/** Issues to show beside their fields: contacts as soon as they are wrong, the rest after a publish attempt. */
function visibleIssues(draft: ShopDraft, attempted: boolean): Map<string, ShopIssue['code']> {
  const shown = new Map<string, ShopIssue['code']>();
  for (const issue of shopPublishIssues(draft)) {
    if (attempted || issue.field.startsWith('contacts.')) shown.set(issue.field, issue.code);
  }
  return shown;
}

/**
 * The editor of a shop page: on a phone, Edit and Preview are two tabs; on a wide screen, side by side. The draft
 * saves itself; Publish saves, checks and starts the publish job.
 */
export function SiteEditor({
  initialSite,
  initialDraft,
  initialImages,
}: {
  readonly initialSite: Site;
  readonly initialDraft: ShopDraft;
  readonly initialImages: readonly SiteImage[];
}): ReactNode {
  const { t } = useI18n();
  const [site, setSite] = useState(initialSite);
  const [job, setJob] = useState<Job | null>(initialSite.job);
  const [draft, setDraft] = useState(initialDraft);
  const [images, setImages] = useState<ReadonlyMap<string, SiteImage>>(() => new Map(initialImages.map((image) => [image.id, image])));
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [attempted, setAttempted] = useState(false);
  const { dirty, state, flush } = useAutosave(site.id, draft, initialDraft);

  const assets = useMemo(() => new Map([...images].map(([id, image]) => [id, editorAsset(site.id, image)])), [images, site.id]);
  const issues = visibleIssues(draft, attempted);
  const issueText = (field: string): string | null => {
    const code = issues.get(field);
    return code ? t(ISSUE_MESSAGES[code]) : null;
  };
  const nameErrors = new Map<number, string>();
  draft.products.forEach((_, index) => {
    const text = issueText(`products.${index}.name`);
    if (text) nameErrors.set(index, text);
  });
  const usesSamples = [draft.cover, ...draft.products.map((p) => p.image)].some((id) => id !== null && images.get(id)?.sample);

  const edit = (patch: Partial<ShopDraft>): void => setDraft((current) => ({ ...current, ...patch }));
  const addImage = (image: SiteImage): void => setImages((current) => new Map(current).set(image.id, image));
  const editProducts = (update: (products: readonly ShopProduct[]) => ShopProduct[]): void => setDraft((current) => ({ ...current, products: update(current.products) }));

  const prepare = async (): Promise<boolean> => {
    setAttempted(true);
    if (shopPublishIssues(draft).length > 0) {
      setView('edit');
      return false;
    }
    return flush();
  };
  const onDone = useCallback(() => setSite((current) => ({ ...current, published: true })), []);

  return (
    <div className="editor" data-view={view} data-id="editor">
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

          <section className="panel" aria-labelledby="shop-heading">
            <h2 id="shop-heading" className="panel-title">
              {t('editor.shop')}
            </h2>
            <ImageField
              siteId={site.id}
              label={t('editor.cover')}
              image={draft.cover ? (images.get(draft.cover) ?? null) : null}
              onUploaded={(image) => {
                addImage(image);
                edit({ cover: image.id });
              }}
              onRemove={() => edit({ cover: null })}
              dataId="cover"
              wide
            />
            <TextField
              label={t('editor.name')}
              value={draft.name}
              onChange={(name) => edit({ name })}
              maxLength={LIMITS.name}
              placeholder={t('editor.name.placeholder')}
              error={issueText('name')}
              dataId="shop-name"
            />
            <TextField
              label={t('editor.description')}
              value={draft.description}
              onChange={(description) => edit({ description })}
              maxLength={LIMITS.description}
              placeholder={t('editor.description.placeholder')}
              multiline
              dataId="shop-description"
            />
          </section>

          <section className="panel" aria-labelledby="products-heading">
            <h2 id="products-heading" className="panel-title">
              {t('editor.products', { count: draft.products.length, max: LIMITS.products })}
            </h2>
            {issueText('products') ? (
              <p className="field-error" role="alert">
                {issueText('products')}
              </p>
            ) : null}
            <ProductList siteId={site.id} products={draft.products} images={images} onChange={editProducts} onImage={addImage} nameErrors={nameErrors} />
          </section>

          <section className="panel" aria-labelledby="contacts-heading">
            <h2 id="contacts-heading" className="panel-title">
              {t('editor.contacts')}
            </h2>
            <p className="hint">{t('editor.contacts.help')}</p>
            <TextField
              label={t('editor.zalo')}
              value={draft.contacts.zalo}
              onChange={(zalo) => edit({ contacts: { ...draft.contacts, zalo } })}
              maxLength={LIMITS.contact}
              inputMode="tel"
              error={issueText('contacts.zalo')}
              dataId="contact-zalo"
            />
            <TextField
              label={t('editor.phone')}
              value={draft.contacts.phone}
              onChange={(phone) => edit({ contacts: { ...draft.contacts, phone } })}
              maxLength={LIMITS.contact}
              inputMode="tel"
              error={issueText('contacts.phone')}
              dataId="contact-phone"
            />
            <TextField
              label={t('editor.facebook')}
              value={draft.contacts.facebook}
              onChange={(facebook) => edit({ contacts: { ...draft.contacts, facebook } })}
              maxLength={LIMITS.contact}
              inputMode="url"
              error={issueText('contacts.facebook')}
              dataId="contact-facebook"
            />
          </section>

          <fieldset className="panel palette">
            <legend className="panel-title">{t('editor.palette')}</legend>
            <div className="swatches">
              {PALETTE_IDS.map((id) => (
                <label key={id} className="swatch" data-id={`palette-${id}`}>
                  <input type="radio" name="palette" value={id} checked={draft.palette === id} onChange={() => edit({ palette: id })} />
                  <span className="swatch-dot" style={{ background: PALETTES[id].accent }} aria-hidden="true" />
                  <span className="swatch-name">{t(`palette.${id}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="editor-preview">
          <Preview draft={draft} assets={assets} />
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
          initialJob={job}
          prepare={prepare}
          onFieldsRefused={() => setAttempted(true)}
          onDone={onDone}
        />
      </div>
    </div>
  );
}

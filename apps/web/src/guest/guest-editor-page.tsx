import { publishIssues, templateImageIds, type TemplateDraft } from '@webnhanh/templates';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAccount } from '../account';
import { signInUrl } from '../api';
import { leaveTo } from '../leave-to';
import { EditorTabs, PreviewFrame, TemplateForm, useEditorChecks, visibleIssues } from '../editor/site-editor';
import { ISSUE_MESSAGES } from '../error-messages';
import { useI18n } from '../i18n';
import { Loader } from '../loading';
import { AppPage } from '../public-page';
import { SignedInPage } from '../signed-in-page';
import type { SiteImage } from '../sites-api';
import { clearGuestDraft, clearGuestTransfer, loadGuestDraft, saveGuestDraft, type GuestDraft } from './guest-draft-storage';
import { freshGuestDraft, pickedLook, type GuestPhoto } from './guest-library';
import { guestPhotos } from './guest-photo-store';
import { guestPreviewHtml } from './guest-preview';

/** Keeps the draft in the browser this long after the last change. */
const KEEP_DELAY_MS = 400;
/** Where the editor goes once Publish passes its checks (after sign-up, for a visitor). */
export const GUEST_PUBLISH_PATH = '/new/publish';
/** The address the preview's form would send to: the page has no address yet. */
const PREVIEW_NAME = 'ban-nhap';

/**
 * `/new/edit?template=…&variant=…`: the editor of a template look before there is a site, for a visitor without an
 * account (and for anyone starting a new page). The draft stays in this browser; Publish is where a visitor signs
 * up, then picks the address (`/new/publish`). Without `template`, the draft kept in this browser opens again.
 */
export function GuestEditorPage(): ReactNode {
  const { account } = useAccount();
  if (account === undefined) {
    return (
      <AppPage>
        <Loader />
      </AppPage>
    );
  }
  if (account === null) {
    return (
      <AppPage>
        <LoadGuestEditor guest />
      </AppPage>
    );
  }
  return <SignedInPage>{() => <LoadGuestEditor guest={false} />}</SignedInPage>;
}

/**
 * The draft to open: the one kept in this browser when it is of the look asked for (or none was asked for), else the
 * look new. Null when nothing can be opened (no look asked for and none kept).
 */
async function openDraft(template: string | null, variant: string | null): Promise<GuestDraft | null> {
  const kept = await loadGuestDraft();
  const look = template ? pickedLook(template, variant) : null;
  if (kept && (!template || (look && kept.look.template === look.template && kept.look.id === look.id))) return kept;
  if (!look) return null;
  // Another look, or what was kept cannot be read whole: start this one fresh, and forget the rest.
  clearGuestTransfer();
  await clearGuestDraft();
  const fresh = freshGuestDraft(look);
  return { look, value: fresh.value, photos: fresh.photos, blobs: new Map() };
}

function LoadGuestEditor({ guest }: { readonly guest: boolean }): ReactNode {
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<GuestDraft | null | 'none'>(null);
  const template = params.get('template');
  const variant = params.get('variant');
  useEffect(() => {
    let live = true;
    openDraft(template, variant)
      .then((opened) => {
        if (live) setDraft(opened ?? 'none');
      })
      .catch((error: unknown) => {
        console.warn('guest draft not opened', error instanceof Error ? error.message : String(error));
        if (live) setDraft('none');
      });
    return () => {
      live = false;
    };
  }, [template, variant]);
  if (draft === 'none') return <Navigate to="/new" replace />;
  if (!draft) return <Loader />;
  return <GuestEditor key={`${draft.look.template}/${draft.look.id}`} initial={draft} guest={guest} />;
}

function GuestEditor({ initial, guest }: { readonly initial: GuestDraft; readonly guest: boolean }): ReactNode {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [keepFailed, setKeepFailed] = useState(false);
  const [store] = useState(() => guestPhotos(initial.photos, initial.blobs, () => setKeepFailed(true)));
  const [value, setValue] = useState<TemplateDraft>(initial.value);
  const [images, setImages] = useState<ReadonlyMap<string, SiteImage>>(() => new Map(initial.photos.map((photo) => [photo.image.id, photo.image])));
  const [leaving, setLeaving] = useState(false);
  const { view, setView, attempted, setAttempted, refuse, editorRef } = useEditorChecks();
  const look = initial.look;

  const photoList = useCallback(
    (): GuestPhoto[] => [...images.values()].map((image) => ({ image, url: store.urls.get(image.id) ?? '', slot: store.slots.get(image.id) ?? null })),
    [images, store],
  );
  const keep = useCallback((): void => {
    if (!saveGuestDraft(look, value, photoList())) setKeepFailed(true);
  }, [look, value, photoList]);
  useEffect(() => {
    const timer = setTimeout(keep, KEEP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [keep]);

  const issues = visibleIssues(value, attempted);
  const issueText = (field: string): string | null => {
    const code = issues.get(field);
    return code ? t(ISSUE_MESSAGES[code]) : null;
  };
  const usesSamples = templateImageIds(value).some((id) => images.get(id)?.sample);
  const addImage = useCallback((image: SiteImage): void => setImages((current) => new Map(current).set(image.id, image)), []);
  const html = useMemo(() => guestPreviewHtml(value, images, store.urls, PREVIEW_NAME), [value, images, store]);

  const publish = async (): Promise<void> => {
    if (publishIssues(value).length > 0) {
      refuse();
      return;
    }
    setAttempted(true);
    setLeaving(true);
    keep();
    await store.settled();
    if (guest) {
      // A plain navigation: /auth/login is a server route; the account service brings the visitor back to publish.
      leaveTo(signInUrl(GUEST_PUBLISH_PATH, locale, true));
      return;
    }
    navigate(GUEST_PUBLISH_PATH);
  };

  return (
    <div className="editor" data-view={view} data-id="guest-editor" ref={editorRef}>
      <div className="editor-bar">
        <Link className="back-link" to="/new" data-id="guest-back">
          {t('try.back')}
        </Link>
        <span className={`save-status${keepFailed ? ' save-status-error' : ''}`} role="status" data-id="guest-save-status">
          {t(keepFailed ? 'try.notKept' : 'try.keptHere')}
        </span>
      </div>
      <EditorTabs view={view} onChange={setView} />

      <div className="editor-columns">
        <div className="editor-form">
          <p className="notice notice-info" data-id="guest-intro">
            {t(guest ? 'try.intro.guest' : 'try.intro')}
          </p>
          {keepFailed ? (
            <p className="notice notice-warning" role="alert" data-id="guest-not-kept">
              {t('try.notKept.body')}
            </p>
          ) : null}
          {usesSamples ? <p className="notice notice-info">{t('editor.samples')}</p> : null}
          <TemplateForm value={value} setValue={setValue} common={{ photos: store.store, images, onImage: addImage, issueText }} />
        </div>

        <div className="editor-preview">
          <PreviewFrame html={html} />
        </div>
      </div>

      <div className="editor-publish">
        {attempted && issues.size > 0 ? (
          <p className="field-error" role="alert" data-id="publish-issues">
            {t('issue.summary', { count: issues.size })}
          </p>
        ) : null}
        <section className="publish" data-id="guest-publish">
          <button type="button" className="pill pill-cta" onClick={() => void publish()} disabled={leaving} aria-busy={leaving} data-id="publish-button">
            {t('publish.button')}
          </button>
          <p className="hint">{t(guest ? 'try.publish.guestNote' : 'try.publish.note')}</p>
        </section>
      </div>
    </div>
  );
}

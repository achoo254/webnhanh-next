/**
 * Every template behind one set of functions, for the code that handles a stored draft without caring which template
 * made it (saving, publishing, the share picture, cleaning up unused photos). A stored draft is read with `parseDraft`,
 * which gives back the template id with its typed draft; the rest dispatch on that id.
 */
import { cafeImageIds, cafeDraftSchema, cafePublishIssues, CAFE_SAMPLES, CAFE_TEMPLATE, newCafeDraft, sampleCafeDraft, type CafeDraft } from './cafe-schema';
import { cafeShareCard, renderCafe } from './cafe-render';
import type { ImageAsset, PageOptions, RenderedPage } from './page';
import { newProfileDraft, profileDraftSchema, PROFILE_SAMPLES, profileImageIds, profilePublishIssues, PROFILE_TEMPLATE, sampleProfileDraft, type ProfileDraft } from './profile-schema';
import { profileShareCard, renderProfile } from './profile-render';
import type { SamplePhoto, TemplateIssue } from './schema-parts';
import { shopShareCard, type ShareCardContent } from './share-card';
import { renderShop, type RenderOptions } from './shop-render';
import { newShopDraft, sampleShopDraft, shopDraftSchema, shopImageIds, shopPublishIssues, SHOP_SAMPLES, SHOP_TEMPLATE, type ShopDraft } from './shop-schema';
import { renderTet, tetShareCard } from './tet-render';
import { newTetDraft, sampleTetDraft, tetDraftSchema, tetImageIds, tetPublishIssues, TET_SAMPLES, TET_TEMPLATE, type TetDraft } from './tet-schema';
import { renderWedding, weddingShareCard, type WeddingRenderOptions } from './wedding-render';
import { newWeddingDraft, sampleWeddingDraft, weddingDraftSchema, weddingImageIds, weddingPublishIssues, WEDDING_SAMPLES, WEDDING_TEMPLATE, type WeddingDraft } from './wedding-schema';

export const TEMPLATE_IDS = [SHOP_TEMPLATE, TET_TEMPLATE, WEDDING_TEMPLATE, CAFE_TEMPLATE, PROFILE_TEMPLATE] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** What the app calls each template. */
export const TEMPLATE_LABELS: Readonly<Record<TemplateId, string>> = {
  shop: 'Bán hàng nhận đơn',
  tet: 'Thiệp chúc Tết',
  wedding: 'Thiệp cưới',
  cafe: 'Quán ăn, cửa hàng',
  profile: 'Hồ sơ cá nhân',
};

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value);
}

/** A draft read from storage, with the template it belongs to. */
export type TemplateDraft =
  | { readonly template: 'shop'; readonly draft: ShopDraft }
  | { readonly template: 'tet'; readonly draft: TetDraft }
  | { readonly template: 'wedding'; readonly draft: WeddingDraft }
  | { readonly template: 'cafe'; readonly draft: CafeDraft }
  | { readonly template: 'profile'; readonly draft: ProfileDraft };

/** The draft schema of each template (what a save is checked against). */
export const DRAFT_SCHEMAS = {
  shop: shopDraftSchema,
  tet: tetDraftSchema,
  wedding: weddingDraftSchema,
  cafe: cafeDraftSchema,
  profile: profileDraftSchema,
} as const;

/** `draft` read as a draft of `template`, or null when the template is unknown or the draft does not fit it. */
export function parseDraft(template: string | null, draft: unknown): TemplateDraft | null {
  switch (template) {
    case 'shop': {
      const parsed = shopDraftSchema.safeParse(draft);
      return parsed.success ? { template, draft: parsed.data } : null;
    }
    case 'tet': {
      const parsed = tetDraftSchema.safeParse(draft);
      return parsed.success ? { template, draft: parsed.data } : null;
    }
    case 'wedding': {
      const parsed = weddingDraftSchema.safeParse(draft);
      return parsed.success ? { template, draft: parsed.data } : null;
    }
    case 'cafe': {
      const parsed = cafeDraftSchema.safeParse(draft);
      return parsed.success ? { template, draft: parsed.data } : null;
    }
    case 'profile': {
      const parsed = profileDraftSchema.safeParse(draft);
      return parsed.success ? { template, draft: parsed.data } : null;
    }
    default:
      return null;
  }
}

/** Why the draft cannot be published yet ([] when it can). */
export function publishIssues(value: TemplateDraft): TemplateIssue[] {
  switch (value.template) {
    case 'shop':
      return shopPublishIssues(value.draft);
    case 'tet':
      return tetPublishIssues(value.draft);
    case 'wedding':
      return weddingPublishIssues(value.draft);
    case 'cafe':
      return cafePublishIssues(value.draft);
    case 'profile':
      return profilePublishIssues(value.draft);
  }
}

/** Every photo the draft shows, each once. */
export function templateImageIds(value: TemplateDraft): string[] {
  switch (value.template) {
    case 'shop':
      return shopImageIds(value.draft);
    case 'tet':
      return tetImageIds(value.draft);
    case 'wedding':
      return weddingImageIds(value.draft);
    case 'cafe':
      return cafeImageIds(value.draft);
    case 'profile':
      return profileImageIds(value.draft);
  }
}

/** The photo that stands for the page (the list of sites, the share picture): cover, card photo or avatar. */
export function draftCoverId(value: TemplateDraft): string | null {
  switch (value.template) {
    case 'shop':
    case 'wedding':
    case 'cafe':
      return value.draft.cover;
    case 'tet':
      return value.draft.photo;
    case 'profile':
      return value.draft.avatar;
  }
}

/**
 * The photos a stored draft of any template uses, or null when the draft cannot be read (then nothing of the site
 * may be treated as unused).
 */
export function draftImageIds(template: string | null, draft: unknown): Set<string> | null {
  const parsed = parseDraft(template, draft);
  return parsed ? new Set(templateImageIds(parsed)) : null;
}

/** Options of every renderer: each template reads the ones it has (`orderForm` the shop, `rsvpForm` and `now` the wedding). */
export type TemplateRenderOptions = RenderOptions & WeddingRenderOptions & PageOptions;

export function renderDraft(value: TemplateDraft, assets: ReadonlyMap<string, ImageAsset>, options: TemplateRenderOptions = {}): RenderedPage {
  switch (value.template) {
    case 'shop':
      return renderShop(value.draft, assets, options);
    case 'tet':
      return renderTet(value.draft, assets, options);
    case 'wedding':
      return renderWedding(value.draft, assets, options);
    case 'cafe':
      return renderCafe(value.draft, assets, options);
    case 'profile':
      return renderProfile(value.draft, assets, options);
  }
}

/** What the share picture shows (`renderCard`). */
export function draftShareCard(value: TemplateDraft): ShareCardContent {
  switch (value.template) {
    case 'shop':
      return shopShareCard(value.draft);
    case 'tet':
      return tetShareCard(value.draft);
    case 'wedding':
      return weddingShareCard(value.draft);
    case 'cafe':
      return cafeShareCard(value.draft);
    case 'profile':
      return profileShareCard(value.draft);
  }
}

/** Each template's sample photos (in `samples/`), copied into every new site of that template. */
export const TEMPLATE_SAMPLES: Readonly<Record<TemplateId, Readonly<Record<string, SamplePhoto | readonly SamplePhoto[]>>>> = {
  shop: SHOP_SAMPLES,
  tet: TET_SAMPLES,
  wedding: WEDDING_SAMPLES,
  cafe: CAFE_SAMPLES,
  profile: PROFILE_SAMPLES,
};

/** Turns a sample photo into the id it got in the new site. */
export type SamplePhotoId = (photo: SamplePhoto) => string;

/**
 * A new site's draft of `template` (`filled`: with the sample copy, for previews), its sample photos given ids by
 * `photoId`.
 */
export function templateDraft(template: TemplateId, photoId: SamplePhotoId, filled = false): TemplateDraft {
  switch (template) {
    case 'shop': {
      const samples = { cover: photoId(SHOP_SAMPLES.cover), products: SHOP_SAMPLES.products.map(photoId) };
      return { template, draft: filled ? sampleShopDraft(samples) : newShopDraft(samples) };
    }
    case 'tet': {
      const samples = { photo: photoId(TET_SAMPLES.photo) };
      return { template, draft: filled ? sampleTetDraft(samples) : newTetDraft(samples) };
    }
    case 'wedding': {
      const samples = { cover: photoId(WEDDING_SAMPLES.cover) };
      return { template, draft: filled ? sampleWeddingDraft(samples) : newWeddingDraft(samples) };
    }
    case 'cafe': {
      const samples = { cover: photoId(CAFE_SAMPLES.cover) };
      return { template, draft: filled ? sampleCafeDraft(samples) : newCafeDraft(samples) };
    }
    case 'profile':
      return { template, draft: filled ? sampleProfileDraft() : newProfileDraft() };
  }
}

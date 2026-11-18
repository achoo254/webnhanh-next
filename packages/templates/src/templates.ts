/**
 * Every template behind one set of functions, for the code that handles a stored draft without caring which template
 * made it (saving, publishing, the share picture, cleaning up unused photos). A stored draft is read with `parseDraft`,
 * which gives back the template id with its typed draft; the rest dispatch on that id.
 */
import { cafeImageIds, cafeDraftSchema, cafePublishIssues, CAFE_SAMPLES, CAFE_TEMPLATE, newCafeDraft, sampleCafeDraft, type CafeDraft } from './cafe-schema';
import { cafeShareCard, renderCafe } from './cafe-render';
import type { ImageAsset, PageOptions, RenderedPage } from './page';
import { birthdayDraftSchema, birthdayImageIds, birthdayPublishIssues, BIRTHDAY_SAMPLES, BIRTHDAY_TEMPLATE, newBirthdayDraft, sampleBirthdayDraft, type BirthdayDraft } from './birthday-schema';
import { birthdayShareCard, renderBirthday } from './birthday-render';
import { linksDraftSchema, linksImageIds, linksPublishIssues, LINKS_SAMPLES, LINKS_TEMPLATE, newLinksDraft, sampleLinksDraft, type LinksDraft } from './links-schema';
import { linksShareCard, renderLinks } from './links-render';
import { newPartyDraft, partyDraftSchema, partyImageIds, partyPublishIssues, PARTY_SAMPLES, PARTY_TEMPLATE, samplePartyDraft, type PartyDraft } from './party-schema';
import { partyShareCard, renderParty } from './party-render';
import { newProfileDraft, profileDraftSchema, PROFILE_SAMPLES, profileImageIds, profilePublishIssues, PROFILE_TEMPLATE, sampleProfileDraft, type ProfileDraft } from './profile-schema';
import { profileShareCard, renderProfile } from './profile-render';
import type { SamplePhoto, TemplateIssue } from './schema-parts';
import { shopShareCard, type ShareCardContent } from './share-card';
import { cinemaFontFiles, styleFontFiles, type FontFile } from './shop-fonts';
import { renderShop, type RenderOptions } from './shop-render';
import { newShopDraft, sampleShopDraft, shopDraftSchema, shopImageIds, shopPublishIssues, SHOP_SAMPLES, SHOP_TEMPLATE, type ShopDraft } from './shop-schema';
import { renderTet, tetShareCard } from './tet-render';
import { newTetDraft, sampleTetDraft, tetDraftSchema, tetImageIds, tetPublishIssues, TET_SAMPLES, TET_TEMPLATE, type TetDraft } from './tet-schema';
import { renderWedding, weddingShareCard, type WeddingRenderOptions } from './wedding-render';
import { newWeddingDraft, sampleWeddingDraft, weddingDraftSchema, weddingImageIds, weddingPublishIssues, WEDDING_SAMPLES, WEDDING_TEMPLATE, type WeddingDraft } from './wedding-schema';

export const TEMPLATE_IDS = [SHOP_TEMPLATE, TET_TEMPLATE, WEDDING_TEMPLATE, CAFE_TEMPLATE, PROFILE_TEMPLATE, PARTY_TEMPLATE, BIRTHDAY_TEMPLATE, LINKS_TEMPLATE] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** What the app calls each template. */
export const TEMPLATE_LABELS: Readonly<Record<TemplateId, string>> = {
  shop: 'Bán hàng nhận đơn',
  tet: 'Thiệp chúc Tết',
  wedding: 'Thiệp cưới',
  cafe: 'Quán ăn, cửa hàng',
  profile: 'Hồ sơ cá nhân',
  party: 'Thiệp mời tiệc',
  birthday: 'Thiệp sinh nhật',
  links: 'Trang link-in-bio',
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
  | { readonly template: 'profile'; readonly draft: ProfileDraft }
  | { readonly template: 'party'; readonly draft: PartyDraft }
  | { readonly template: 'birthday'; readonly draft: BirthdayDraft }
  | { readonly template: 'links'; readonly draft: LinksDraft };

/** The draft schema of each template (what a save is checked against). */
export const DRAFT_SCHEMAS = {
  shop: shopDraftSchema,
  tet: tetDraftSchema,
  wedding: weddingDraftSchema,
  cafe: cafeDraftSchema,
  profile: profileDraftSchema,
  party: partyDraftSchema,
  birthday: birthdayDraftSchema,
  links: linksDraftSchema,
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
    case 'party': {
      const parsed = partyDraftSchema.safeParse(draft);
      return parsed.success ? { template, draft: parsed.data } : null;
    }
    case 'birthday': {
      const parsed = birthdayDraftSchema.safeParse(draft);
      return parsed.success ? { template, draft: parsed.data } : null;
    }
    case 'links': {
      const parsed = linksDraftSchema.safeParse(draft);
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
    case 'party':
      return partyPublishIssues(value.draft);
    case 'birthday':
      return birthdayPublishIssues(value.draft);
    case 'links':
      return linksPublishIssues(value.draft);
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
    case 'party':
      return partyImageIds(value.draft);
    case 'birthday':
      return birthdayImageIds(value.draft);
    case 'links':
      return linksImageIds(value.draft);
  }
}

/** The photo that stands for the page (the list of sites, the share picture): cover, card photo or avatar. */
export function draftCoverId(value: TemplateDraft): string | null {
  switch (value.template) {
    case 'shop':
    case 'wedding':
    case 'cafe':
    case 'party':
      return value.draft.cover;
    case 'tet':
    case 'birthday':
      return value.draft.photo;
    case 'profile':
    case 'links':
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

/**
 * Templates whose page takes replies ("Xác nhận tham dự") through the reply form (`rsvp-form.ts`) when the draft's
 * `rsvp` is on, and shows a countdown to its `date` that the worker renders again each day.
 */
export const RSVP_TEMPLATES = [WEDDING_TEMPLATE, PARTY_TEMPLATE] as const;

/** True when `template` is one whose page takes replies (its inbox lists replies, not orders). */
export function takesReplies(template: string | null | undefined): boolean {
  return typeof template === 'string' && (RSVP_TEMPLATES as readonly string[]).includes(template);
}

/** Options of every renderer: each template reads the ones it has (`orderForm` the shop, `rsvpForm` and `now` the wedding and the party). */
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
    case 'party':
      return renderParty(value.draft, assets, options);
    case 'birthday':
      return renderBirthday(value.draft, assets, options);
    case 'links':
      return renderLinks(value.draft, assets, options);
  }
}

/** The font files a published page of `value` loads (copied beside it): its look's, or its layout's. */
export function draftFontFiles(value: TemplateDraft): FontFile[] {
  if (value.template === 'wedding' && value.draft.layout === 'cinema') return cinemaFontFiles();
  return styleFontFiles(value.draft.style);
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
    case 'party':
      return partyShareCard(value.draft);
    case 'birthday':
      return birthdayShareCard(value.draft);
    case 'links':
      return linksShareCard(value.draft);
  }
}

/** Each template's sample photos (in `samples/`), copied into every new site of that template. */
export const TEMPLATE_SAMPLES: Readonly<Record<TemplateId, Readonly<Record<string, SamplePhoto | readonly SamplePhoto[]>>>> = {
  shop: SHOP_SAMPLES,
  tet: TET_SAMPLES,
  wedding: WEDDING_SAMPLES,
  cafe: CAFE_SAMPLES,
  profile: PROFILE_SAMPLES,
  party: PARTY_SAMPLES,
  birthday: BIRTHDAY_SAMPLES,
  links: LINKS_SAMPLES,
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
    case 'party':
      return { template, draft: filled ? samplePartyDraft() : newPartyDraft() };
    case 'birthday':
      return { template, draft: filled ? sampleBirthdayDraft() : newBirthdayDraft() };
    case 'links':
      return { template, draft: filled ? sampleLinksDraft() : newLinksDraft() };
  }
}

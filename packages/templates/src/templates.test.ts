import { describe, expect, it } from 'vitest';
import { STYLE_IDS } from './looks';
import { ORDER_SCRIPT, ORDER_SCRIPT_HASH } from './order-form';
import { imageAsset, type ImageAsset } from './page';
import type { SamplePhoto } from './schema-parts';
import { renderCard } from './share-card';
import {
  DRAFT_SCHEMAS,
  draftCoverId,
  draftImageIds,
  draftShareCard,
  parseDraft,
  publishIssues,
  renderDraft,
  TEMPLATE_IDS,
  TEMPLATE_SAMPLES,
  templateDraft,
  templateImageIds,
  type TemplateDraft,
  type TemplateId,
} from './templates';

/** Sample photos get stable ids, all present as assets. */
const ids = new Map<string, string>();
const assets = new Map<string, ImageAsset>();
function photoId(photo: SamplePhoto): string {
  const known = ids.get(photo.file);
  if (known) return known;
  const id = `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`;
  ids.set(photo.file, id);
  assets.set(id, imageAsset({ width: photo.width, height: photo.height, widths: [photo.width] }, () => `img/${photo.file}`));
  return id;
}

const sample = (template: TemplateId): TemplateDraft => templateDraft(template, photoId, true);
const form = { action: 'https://app.example.com/f/ten', token: '1.abc' };
const options = { orderForm: form, fontUrl: (file: string) => `fonts/${file}`, madeWith: { name: 'App', url: 'https://app.example.com' }, now: new Date('2026-11-01T00:00:00Z') };

const cases = TEMPLATE_IDS.flatMap((template) => STYLE_IDS.map((style) => [template, style] as const));

describe('every template', () => {
  it.each(TEMPLATE_IDS)('%s: new and sample drafts fit the schema; the sample is ready to publish', (template) => {
    const fresh = templateDraft(template, photoId);
    expect(DRAFT_SCHEMAS[template].safeParse(fresh.draft).success).toBe(true);
    const filled = sample(template);
    expect(DRAFT_SCHEMAS[template].safeParse(filled.draft).success).toBe(true);
    expect(publishIssues(filled)).toEqual([]);
    // Every sample photo a template ships is used by its new draft.
    const shipped = Object.values(TEMPLATE_SAMPLES[template]).flat().length;
    expect(templateImageIds(fresh)).toHaveLength(shipped);
  });

  it.each(cases)('%s in %s: a static, accessible page with its own photos and fonts only', (template, style) => {
    const value = parseDraft(template, { ...sample(template).draft, style });
    expect(value).not.toBeNull();
    if (!value) return;
    const { html } = renderDraft(value, assets, options);
    expect(html.startsWith('<!doctype html>\n<html lang="vi">')).toBe(true);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toContain('<meta name="description" content="');
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain(`<body class="s-${style}`);
    for (const other of STYLE_IDS.filter((s) => s !== style)) expect(html).not.toContain(`.s-${other}`);
    // Only the shop's order form carries a script (the wedding's reply form needs `rsvpForm`), and only the fixed one.
    const scripts = html.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    expect(scripts).toEqual(template === 'shop' ? [`<script>${ORDER_SCRIPT}</script>`] : []);
    expect(html).not.toMatch(/\son[a-z]+=|<iframe|<object|<embed|@import/i);
    // Every request stays on the page's own origin: photos in img/, fonts in fonts/.
    for (const match of html.matchAll(/(?:src|srcset)="([^"]*)"/g)) expect(match[1]).toMatch(/^img\//);
    for (const match of html.matchAll(/url\(([^)]*)\)/g)) expect(match[1]).toMatch(/^fonts\//);
    // Photos have their size (no layout shift) and an alt attribute.
    for (const tag of html.match(/<img [^>]*>/g) ?? []) expect(tag).toMatch(/width="\d+" height="\d+" alt="/);
    // Links only to https, tel:, mailto: or the page itself.
    for (const match of html.matchAll(/href="([^"]*)"/g)) expect(match[1]).toMatch(/^(https:\/\/|tel:|mailto:|#|fonts\/)/);
  });

  it.each(TEMPLATE_IDS)('%s: the share card shows the draft, escaped, from local files only', (template) => {
    const value = sample(template);
    const card = renderCard(draftShareCard(value), assets, { host: 'ten.example.vn', fontUrl: (file) => `fonts/${file}` });
    expect(card).toContain('<h1>');
    expect(card).toContain('ten.example.vn');
    expect(card).not.toMatch(/https?:\/\/|<script/);
  });
});

/** Every string leaf of a draft, by dotted path. */
function stringPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (Array.isArray(value)) return value.flatMap((item, index) => stringPaths(item, `${prefix}${prefix ? '.' : ''}${index}`));
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => stringPaths(item, `${prefix}${prefix ? '.' : ''}${key}`));
  return [];
}

function withValue(draft: unknown, path: string, text: string): unknown {
  const copy = structuredClone(draft) as Record<string, unknown>;
  const keys = path.split('.');
  const last = keys.pop() ?? '';
  let node: Record<string, unknown> = copy;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = text;
  return copy;
}

/** Fields that are not free text: ids, keys, choices, dates and times (checked by the schema, never shown raw). */
const NOT_TEXT = /(^|\.)(key|palette|style|cover|photo|avatar|image|date|time)$|^gallery\./;

describe('escaping', () => {
  it.each(TEMPLATE_IDS)('%s: every text the owner types reaches the page escaped, or not at all', (template) => {
    const base = sample(template).draft;
    const paths = stringPaths(base).filter((path) => !NOT_TEXT.test(path));
    expect(paths.length).toBeGreaterThan(3);
    for (const path of paths) {
      const marker = `"><b id=${path.replace(/\./g, '_')}>'&`;
      const value = parseDraft(template, withValue(base, path, marker));
      expect(value, path).not.toBeNull();
      if (!value) continue;
      const pages = [renderDraft(value, assets, { ...options, rsvpForm: form }).html, renderCard(draftShareCard(value), assets, { host: 'x.vn', fontUrl: (f) => `fonts/${f}` })];
      for (const html of pages) expect(html, path).not.toContain(`<b id=${path.replace(/\./g, '_')}>`);
      const shown = pages.some((html) => html.includes(`&quot;&gt;&lt;b id=${path.replace(/\./g, '_')}&gt;&#39;&amp;`));
      // Contacts, links and social accounts that are not real addresses are left out instead.
      if (!/^(contacts|socials)\.|^links\.\d+\.url$/.test(path)) expect(shown, path).toBe(true);
    }
  });
});

describe('reading stored drafts', () => {
  it('reads each template by its id, and nothing else', () => {
    for (const template of TEMPLATE_IDS) expect(parseDraft(template, sample(template).draft)?.template).toBe(template);
    expect(parseDraft('tet', sample('wedding').draft)).toBeNull();
    expect(parseDraft('unknown', {})).toBeNull();
    expect(parseDraft(null, sample('shop').draft)).toBeNull();
  });

  it('lists the photos a draft uses, or null when it cannot be read', () => {
    const wedding = sample('wedding');
    expect(draftImageIds('wedding', wedding.draft)).toEqual(new Set(templateImageIds(wedding)));
    expect(draftImageIds('cafe', { name: 1 })).toBeNull();
    expect(draftImageIds(null, {})).toBeNull();
  });

  it('names the photo that stands for each page', () => {
    for (const template of TEMPLATE_IDS) {
      const value = sample(template);
      const cover = draftCoverId(value);
      if (template === 'profile') expect(cover).toBeNull();
      else expect(cover).toBe(templateImageIds(value)[0]);
      expect(draftShareCard(value).photo).toBe(cover);
    }
  });

  it('gives the wedding the reply form, with the order script unchanged and the CSP allowing only it', () => {
    const value = sample('wedding');
    const { html } = renderDraft(value, assets, { rsvpForm: form });
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).toContain(`<script>${ORDER_SCRIPT}</script>`);
    expect(html).toContain(`script-src &#39;${ORDER_SCRIPT_HASH}&#39;; connect-src https://app.example.com; form-action https://app.example.com`);
    expect(html).toContain('<form id="order" class="order-form rsvp-form" method="post" action="https://app.example.com/f/ten"');
  });
});

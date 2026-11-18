import {
  ALL_PALETTE_IDS,
  INVITE_QUERY,
  isIsoMonth,
  RSVP_LIMITS,
  WEDDING_HOST_SIDES,
  WEDDING_LIMITS,
  WEDDING_SIDES,
  type WeddingDraft,
  type WeddingEvent,
  type WeddingHostSide,
  type WeddingParents,
  type WeddingSide,
  type WeddingStory,
} from '@webnhanh/templates';
import { useState, type ReactNode } from 'react';
import { siteHost } from '../../brand';
import { useI18n, type MessageKey } from '../../i18n';
import { ContactsPanel } from '../contacts-panel';
import { GalleryField } from '../gallery-field';
import { ImageField } from '../image-field';
import { ItemActions, moveItem, newKey, PanelIssue } from '../list-items';
import { PalettePicker } from '../palette-picker';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import { ToggleField } from '../toggle-field';
import type { FormProps } from './form-props';

const SIDE_LABELS: Readonly<Record<WeddingSide, MessageKey>> = { trai: 'editor.wedding.side.trai', gai: 'editor.wedding.side.gai' };
const HOST_LABELS: Readonly<Record<WeddingHostSide, MessageKey>> = { ...SIDE_LABELS, chung: 'editor.wedding.host.chung' };
/** The parents' lines of each family in the draft, and the editor's name for the family. */
const PARENT_FAMILIES = [
  { side: 'groom', label: 'editor.wedding.parents.groom' },
  { side: 'bride', label: 'editor.wedding.parents.bride' },
] as const satisfies readonly { side: keyof WeddingParents; label: MessageKey }[];
const PARENT_PLACEHOLDERS = ['editor.wedding.parent.first', 'editor.wedding.parent.second'] as const satisfies readonly MessageKey[];
const NO_PARENTS: WeddingParents = { groom: [], bride: [] };

/**
 * A draft as the editor saves it: one saved before the two families existed gets who sends it (both families) on its
 * first change, which also gives the card "Thêm vào lịch" and the guest's family in the reply form.
 */
function withHost(draft: WeddingDraft): WeddingDraft {
  return draft.hostSide ? draft : { ...draft, hostSide: 'chung' };
}

/** `lines` with line `index` set to `value`, without empty lines at the end. */
function setLine(lines: readonly string[], index: number, value: string): string[] {
  const next = Array.from({ length: Math.max(lines.length, index + 1) }, (_, i) => (i === index ? value : (lines[i] ?? '')));
  while (next.length > 0 && next[next.length - 1] === '') next.pop();
  return next;
}

/** A personal invitation link: the site's address with the guest's name and family (`?to=Lan&side=trai`). */
export function inviteUrl(siteName: string, name: string, side: WeddingSide | ''): string {
  const query = new URLSearchParams({ [INVITE_QUERY.name]: name.trim() });
  if (side) query.set(INVITE_QUERY.side, side);
  return `https://${siteHost(siteName)}/?${query.toString()}`;
}

/** Pick one of a few choices, as chips. `name` groups the radios; `dataId` prefixes each chip's `data-id`. */
function ChoiceChips<V extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  dataId,
}: {
  readonly legend: string;
  readonly name: string;
  readonly value: V | undefined;
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly onChange: (value: V) => void;
  readonly dataId: string;
}): ReactNode {
  return (
    <fieldset className="field choice-field">
      <legend className="field-label">{legend}</legend>
      <div className="chips">
        {options.map((option) => (
          <label key={option.value} className="chip" data-id={`${dataId}-${option.value || 'none'}`}>
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A month as `YYYY-MM` (or ''). Browsers without a month picker show a text box: what is typed reaches the draft only
 * once it is a month, so the draft never holds half a date.
 */
function MonthField({ label, value, onChange, dataId }: { readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly dataId: string }): ReactNode {
  const { t } = useI18n();
  const [text, setText] = useState(value);
  return (
    <TextField
      label={label}
      type="month"
      value={text}
      onChange={(next) => {
        setText(next);
        if (next === '' || isIsoMonth(next)) onChange(next);
      }}
      maxLength={7}
      placeholder="2019-05"
      hint={text === '' || isIsoMonth(text) ? undefined : t('editor.wedding.moment.when.hint')}
      dataId={dataId}
    />
  );
}

/** "Tạo link mời": the guest's name and family make a link to the published card. Made here, nothing is sent or kept. */
function InvitePanel({ site }: { readonly site: FormProps<WeddingDraft>['site'] }): ReactNode {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [side, setSide] = useState<WeddingSide | ''>('');
  const [copied, setCopied] = useState(false);
  const [zaloOpened, setZaloOpened] = useState(false);
  const url = site?.published && name.trim() ? inviteUrl(site.name, name, side) : null;
  const canShare = typeof navigator.share === 'function';
  const copy = (link: string): void => {
    navigator.clipboard
      .writeText(link)
      .then(() => setCopied(true))
      .catch((error: unknown) => console.warn('copy failed', error instanceof Error ? error.message : String(error)));
  };
  return (
    <section className="panel" aria-labelledby="invite-heading" data-id="wedding-invite">
      <h2 id="invite-heading" className="panel-title">
        {t('editor.wedding.invite')}
      </h2>
      <p className="hint">{t('editor.wedding.invite.hint')}</p>
      {site?.published ? (
        <>
          <TextField
            label={t('editor.wedding.invite.name')}
            value={name}
            onChange={(next) => {
              setName(next);
              setCopied(false);
            }}
            maxLength={RSVP_LIMITS.invitedAs}
            placeholder={t('editor.wedding.invite.name.placeholder')}
            dataId="invite-name"
          />
          <ChoiceChips
            legend={t('editor.wedding.invite.side')}
            name="invite-side"
            value={side}
            options={[{ value: '', label: t('editor.wedding.invite.side.none') }, ...WEDDING_SIDES.map((value) => ({ value, label: t(SIDE_LABELS[value]) }))]}
            onChange={(next) => {
              setSide(next);
              setCopied(false);
            }}
            dataId="invite-side"
          />
          {url ? (
            <div className="invite-link">
              <p className="field-label">{t('editor.wedding.invite.link')}</p>
              <p className="invite-url" data-id="invite-url">
                {url}
              </p>
              <div className="live-actions">
                <button type="button" className="pill pill-dark pill-small" onClick={() => copy(url)} data-id="invite-copy">
                  {copied ? t('editor.wedding.invite.copied') : t('editor.wedding.invite.copy')}
                </button>
                {canShare ? (
                  <button
                    type="button"
                    className="pill pill-ghost pill-small"
                    onClick={() => {
                      navigator.share({ url }).catch(() => undefined);
                    }}
                    data-id="invite-zalo"
                  >
                    {t('editor.wedding.invite.zalo')}
                  </button>
                ) : (
                  <a
                    className="pill pill-ghost pill-small"
                    href="https://chat.zalo.me/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      copy(url);
                      setZaloOpened(true);
                    }}
                    data-id="invite-zalo"
                  >
                    {t('editor.wedding.invite.zalo')}
                  </a>
                )}
              </div>
              {zaloOpened ? <p className="hint">{t('editor.wedding.invite.zalo.hint')}</p> : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="notice notice-info" data-id="invite-unpublished">
          {t('editor.wedding.invite.unpublished')}
        </p>
      )}
    </section>
  );
}

/**
 * The wedding invitation: the couple and the day, the two families (who invites, the parents), the events (ceremony,
 * party) each with its family, place and directions, the couple's story, the photos, "Xác nhận tham dự" (replies come
 * into the app) and personal invitation links, the couple's contacts, the look and colours.
 */
export function WeddingForm({ photos, draft, update: save, images, onImage, issueText, site }: FormProps<WeddingDraft>): ReactNode {
  const { t } = useI18n();
  const update = (change: (current: WeddingDraft) => WeddingDraft): void => save((current) => withHost(change(current)));
  const edit = (patch: Partial<WeddingDraft>): void => update((current) => ({ ...current, ...patch }));
  const editEvents = (change: (events: readonly WeddingEvent[]) => WeddingEvent[]): void => update((current) => ({ ...current, events: change(current.events) }));
  const editEvent = (key: string, patch: Partial<WeddingEvent>): void => editEvents((list) => list.map((event) => (event.key === key ? { ...event, ...patch } : event)));
  const editParent = (side: keyof WeddingParents, index: number, value: string): void =>
    update((current) => {
      const parents = current.parents ?? NO_PARENTS;
      return { ...current, parents: { ...parents, [side]: setLine(parents[side], index, value) } };
    });
  const story = draft.story ?? [];
  const editStory = (change: (list: readonly WeddingStory[]) => WeddingStory[]): void => update((current) => ({ ...current, story: change(current.story ?? []) }));
  const editMoment = (key: string, patch: Partial<WeddingStory>): void => editStory((list) => list.map((moment) => (moment.key === key ? { ...moment, ...patch } : moment)));
  const sideOptions = [{ value: '' as const, label: t('editor.wedding.event.side.all') }, ...WEDDING_SIDES.map((value) => ({ value, label: t(SIDE_LABELS[value]) }))];
  return (
    <>
      <section className="panel" aria-labelledby="couple-heading">
        <h2 id="couple-heading" className="panel-title">
          {t('editor.wedding')}
        </h2>
        <ImageField
          photos={photos}
          label={t('editor.cover')}
          image={draft.cover ? (images.get(draft.cover) ?? null) : null}
          onUploaded={(image) => {
            onImage(image);
            edit({ cover: image.id });
          }}
          onRemove={() => edit({ cover: null })}
          dataId="cover"
          wide
        />
        <div className="field-row">
          <TextField label={t('editor.wedding.groom')} value={draft.groom} onChange={(groom) => edit({ groom })} maxLength={WEDDING_LIMITS.name} error={issueText('groom')} dataId="wedding-groom" />
          <TextField label={t('editor.wedding.bride')} value={draft.bride} onChange={(bride) => edit({ bride })} maxLength={WEDDING_LIMITS.name} error={issueText('bride')} dataId="wedding-bride" />
        </div>
        <TextField
          label={t('editor.wedding.date')}
          type="date"
          value={draft.date}
          onChange={(date) => edit({ date })}
          maxLength={10}
          hint={t('editor.wedding.date.hint')}
          error={issueText('date')}
          dataId="wedding-date"
        />
        <TextField
          label={t('editor.wedding.lunar')}
          value={draft.lunarDate}
          onChange={(lunarDate) => edit({ lunarDate })}
          maxLength={WEDDING_LIMITS.lunarDate}
          placeholder={t('editor.wedding.lunar.placeholder')}
          dataId="wedding-lunar"
        />
        <TextField
          label={t('editor.wedding.intro')}
          value={draft.intro}
          onChange={(intro) => edit({ intro })}
          maxLength={WEDDING_LIMITS.intro}
          placeholder={t('editor.wedding.intro.placeholder')}
          multiline
          dataId="wedding-intro"
        />
      </section>

      <section className="panel" aria-labelledby="families-heading" data-id="wedding-families">
        <h2 id="families-heading" className="panel-title">
          {t('editor.wedding.families')}
        </h2>
        <ChoiceChips
          legend={t('editor.wedding.host')}
          name="wedding-host"
          value={draft.hostSide ?? 'chung'}
          options={WEDDING_HOST_SIDES.map((value) => ({ value, label: t(HOST_LABELS[value]) }))}
          onChange={(hostSide) => edit({ hostSide })}
          dataId="wedding-host"
        />
        <p className="hint">{t('editor.wedding.host.hint')}</p>
        {PARENT_FAMILIES.map((family) => (
          <fieldset key={family.side} className="field choice-field" data-id={`parents-${family.side}`}>
            <legend className="field-label">{t(family.label)}</legend>
            {PARENT_PLACEHOLDERS.map((placeholder, index) => (
              <TextField
                key={placeholder}
                label={t('editor.wedding.parent.line', { n: index + 1 })}
                value={draft.parents?.[family.side][index] ?? ''}
                onChange={(value) => editParent(family.side, index, value)}
                maxLength={WEDDING_LIMITS.parent}
                placeholder={t(placeholder)}
                dataId={`parents-${family.side}-${index}`}
              />
            ))}
          </fieldset>
        ))}
        <p className="hint">{t('editor.wedding.parents.hint')}</p>
      </section>

      <section className="panel" aria-labelledby="events-heading">
        <h2 id="events-heading" className="panel-title">
          {t('editor.wedding.events', { count: draft.events.length, max: WEDDING_LIMITS.events })}
        </h2>
        <PanelIssue text={issueText('events')} />
        <ol className="products-edit">
          {draft.events.map((event, index) => (
            <li key={event.key} className="product-edit" data-id={`event-${index}`}>
              <h3 className="product-edit-title">{event.label.trim() || t('editor.wedding.event', { n: index + 1 })}</h3>
              <TextField
                label={t('editor.wedding.event.label')}
                value={event.label}
                onChange={(label) => editEvent(event.key, { label })}
                maxLength={WEDDING_LIMITS.label}
                placeholder={t('editor.wedding.event.label.placeholder')}
                error={issueText(`events.${index}.label`)}
                dataId={`event-${index}-label`}
              />
              <ChoiceChips
                legend={t('editor.wedding.event.side')}
                name={`event-${event.key}-side`}
                value={event.side ?? ''}
                options={sideOptions}
                onChange={(side) => editEvent(event.key, { side })}
                dataId={`event-${index}-side`}
              />
              <div className="field-row">
                <TextField
                  label={t('editor.wedding.event.time')}
                  type="time"
                  value={event.time}
                  onChange={(time) => editEvent(event.key, { time })}
                  maxLength={5}
                  dataId={`event-${index}-time`}
                />
                <TextField
                  label={t('editor.wedding.event.date')}
                  type="date"
                  value={event.date}
                  onChange={(date) => editEvent(event.key, { date })}
                  maxLength={10}
                  hint={t('editor.wedding.event.date.hint')}
                  dataId={`event-${index}-date`}
                />
              </div>
              <TextField
                label={t('editor.wedding.event.venue')}
                value={event.venue}
                onChange={(venue) => editEvent(event.key, { venue })}
                maxLength={WEDDING_LIMITS.venue}
                placeholder={t('editor.wedding.event.venue.placeholder')}
                error={issueText(`events.${index}.venue`)}
                dataId={`event-${index}-venue`}
              />
              <TextField
                label={t('editor.address')}
                value={event.address}
                onChange={(address) => editEvent(event.key, { address })}
                maxLength={WEDDING_LIMITS.address}
                hint={t('editor.address.hint')}
                error={issueText(`events.${index}.address`)}
                dataId={`event-${index}-address`}
              />
              <ItemActions
                index={index}
                count={draft.events.length}
                onMove={(by) => editEvents((list) => moveItem(list, event.key, by))}
                onRemove={() => editEvents((list) => list.filter((item) => item.key !== event.key))}
                dataId={`event-${index}`}
              />
            </li>
          ))}
        </ol>
        {draft.events.length < WEDDING_LIMITS.events ? (
          <button
            type="button"
            className="pill pill-dark"
            onClick={() => editEvents((list) => [...list, { key: newKey('e', list), label: '', date: '', time: '', venue: '', address: '' }])}
            data-id="event-add"
          >
            {t('editor.wedding.event.add')}
          </button>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="story-heading" data-id="wedding-story">
        <h2 id="story-heading" className="panel-title">
          {t('editor.wedding.story', { count: story.length, max: WEDDING_LIMITS.story })}
        </h2>
        <p className="hint">{t('editor.wedding.story.hint')}</p>
        <ol className="products-edit">
          {story.map((moment, index) => (
            <li key={moment.key} className="product-edit" data-id={`moment-${index}`}>
              <h3 className="product-edit-title">{moment.title.trim() || t('editor.wedding.moment', { n: index + 1 })}</h3>
              <MonthField label={t('editor.wedding.moment.when')} value={moment.when} onChange={(when) => editMoment(moment.key, { when })} dataId={`moment-${index}-when`} />
              <TextField
                label={t('editor.wedding.moment.title')}
                value={moment.title}
                onChange={(title) => editMoment(moment.key, { title })}
                maxLength={WEDDING_LIMITS.storyTitle}
                placeholder={t('editor.wedding.moment.title.placeholder')}
                dataId={`moment-${index}-title`}
              />
              <TextField
                label={t('editor.wedding.moment.text')}
                value={moment.text}
                onChange={(text) => editMoment(moment.key, { text })}
                maxLength={WEDDING_LIMITS.storyText}
                multiline
                dataId={`moment-${index}-text`}
              />
              <ImageField
                photos={photos}
                label={t('editor.wedding.moment.photo')}
                image={moment.photo ? (images.get(moment.photo) ?? null) : null}
                onUploaded={(image) => {
                  onImage(image);
                  editMoment(moment.key, { photo: image.id });
                }}
                onRemove={() => editMoment(moment.key, { photo: null })}
                dataId={`moment-${index}-photo`}
              />
              <ItemActions
                index={index}
                count={story.length}
                onMove={(by) => editStory((list) => moveItem(list, moment.key, by))}
                onRemove={() => editStory((list) => list.filter((item) => item.key !== moment.key))}
                dataId={`moment-${index}`}
              />
            </li>
          ))}
        </ol>
        {story.length < WEDDING_LIMITS.story ? (
          <button
            type="button"
            className="pill pill-dark"
            onClick={() => editStory((list) => [...list, { key: newKey('s', list), when: '', title: '', text: '', photo: null }])}
            data-id="moment-add"
          >
            {t('editor.wedding.moment.add')}
          </button>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="gallery-heading">
        <h2 id="gallery-heading" className="panel-title">
          {t('editor.wedding.gallery')}
        </h2>
        <GalleryField
          photos={photos}
          ids={draft.gallery}
          max={WEDDING_LIMITS.gallery}
          images={images}
          onChange={(change) => update((current) => ({ ...current, gallery: change(current.gallery) }))}
          onImage={onImage}
        />
      </section>

      <section className="panel" aria-labelledby="rsvp-heading">
        <h2 id="rsvp-heading" className="panel-title">
          {t('editor.wedding.rsvp')}
        </h2>
        <ToggleField label={t('editor.wedding.rsvp.toggle')} hint={t('editor.wedding.rsvp.hint')} checked={draft.rsvp} onChange={(rsvp) => edit({ rsvp })} dataId="wedding-rsvp" />
        {draft.rsvp ? (
          <TextField
            label={t('editor.wedding.rsvp.note')}
            value={draft.rsvpNote}
            onChange={(rsvpNote) => edit({ rsvpNote })}
            maxLength={WEDDING_LIMITS.rsvpNote}
            placeholder={t('editor.wedding.rsvp.note.placeholder')}
            dataId="wedding-rsvp-note"
          />
        ) : null}
      </section>

      <InvitePanel site={site} />

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText} />
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={ALL_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

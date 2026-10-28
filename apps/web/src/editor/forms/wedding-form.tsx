import { ALL_PALETTE_IDS, WEDDING_LIMITS, type WeddingDraft, type WeddingEvent } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { ContactsPanel } from '../contacts-panel';
import { GalleryField } from '../gallery-field';
import { ImageField } from '../image-field';
import { ItemActions, moveItem, newKey, PanelIssue } from '../list-items';
import { PalettePicker } from '../palette-picker';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import { ToggleField } from '../toggle-field';
import type { FormProps } from './form-props';

/**
 * The wedding invitation: the couple and the day, the events (ceremony, party) each with its place and directions,
 * the photos, "Xác nhận tham dự" (replies come into the app), the couple's contacts, the look and colours.
 */
export function WeddingForm({ siteId, draft, update, images, onImage, issueText }: FormProps<WeddingDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<WeddingDraft>): void => update((current) => ({ ...current, ...patch }));
  const editEvents = (change: (events: readonly WeddingEvent[]) => WeddingEvent[]): void => update((current) => ({ ...current, events: change(current.events) }));
  const editEvent = (key: string, patch: Partial<WeddingEvent>): void => editEvents((list) => list.map((event) => (event.key === key ? { ...event, ...patch } : event)));
  return (
    <>
      <section className="panel" aria-labelledby="couple-heading">
        <h2 id="couple-heading" className="panel-title">
          {t('editor.wedding')}
        </h2>
        <ImageField
          siteId={siteId}
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

      <section className="panel" aria-labelledby="gallery-heading">
        <h2 id="gallery-heading" className="panel-title">
          {t('editor.wedding.gallery')}
        </h2>
        <GalleryField
          siteId={siteId}
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

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText} />
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={ALL_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

import { ALL_PALETTE_IDS, PARTY_LIMITS, type PartyAgendaItem, type PartyDraft } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { ContactsPanel } from '../contacts-panel';
import { ImageField } from '../image-field';
import { ItemActions, moveItem, newKey, PanelIssue } from '../list-items';
import { PalettePicker } from '../palette-picker';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import { ToggleField } from '../toggle-field';
import type { FormProps } from './form-props';

/**
 * The party invitation (Christmas, year-end, company party): what it is and who invites, the day, time and place
 * with directions, the dress code, the programme, "Xác nhận tham dự" (replies come into the app), the host's
 * contacts, the look and colours. Only the title, the day and a place are required.
 */
export function PartyForm({ photos, draft, update, images, onImage, issueText }: FormProps<PartyDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<PartyDraft>): void => update((current) => ({ ...current, ...patch }));
  const editAgenda = (change: (agenda: readonly PartyAgendaItem[]) => PartyAgendaItem[]): void => update((current) => ({ ...current, agenda: change(current.agenda) }));
  const editItem = (key: string, patch: Partial<PartyAgendaItem>): void => editAgenda((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  return (
    <>
      <section className="panel" aria-labelledby="party-heading">
        <h2 id="party-heading" className="panel-title">
          {t('editor.party')}
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
        <TextField
          label={t('editor.party.kicker')}
          value={draft.kicker}
          onChange={(kicker) => edit({ kicker })}
          maxLength={PARTY_LIMITS.kicker}
          placeholder={t('editor.party.kicker.placeholder')}
          dataId="party-kicker"
        />
        <TextField
          label={t('editor.party.title')}
          value={draft.title}
          onChange={(title) => edit({ title })}
          maxLength={PARTY_LIMITS.title}
          placeholder={t('editor.party.title.placeholder')}
          error={issueText('title')}
          dataId="party-title"
        />
        <TextField
          label={t('editor.party.host')}
          value={draft.host}
          onChange={(host) => edit({ host })}
          maxLength={PARTY_LIMITS.host}
          placeholder={t('editor.party.host.placeholder')}
          dataId="party-host"
        />
        <TextField label={t('editor.party.intro')} value={draft.intro} onChange={(intro) => edit({ intro })} maxLength={PARTY_LIMITS.intro} multiline dataId="party-intro" />
      </section>

      <section className="panel" aria-labelledby="party-when-heading">
        <h2 id="party-when-heading" className="panel-title">
          {t('editor.party.when')}
        </h2>
        <div className="field-row">
          <TextField
            label={t('editor.party.date')}
            type="date"
            value={draft.date}
            onChange={(date) => edit({ date })}
            maxLength={10}
            hint={t('editor.party.date.hint')}
            error={issueText('date')}
            dataId="party-date"
          />
          <TextField label={t('editor.party.time')} type="time" value={draft.time} onChange={(time) => edit({ time })} maxLength={5} dataId="party-time" />
        </div>
        <TextField
          label={t('editor.party.venue')}
          value={draft.venue}
          onChange={(venue) => edit({ venue })}
          maxLength={PARTY_LIMITS.venue}
          placeholder={t('editor.party.venue.placeholder')}
          hint={t('editor.party.venue.hint')}
          error={issueText('venue')}
          dataId="party-venue"
        />
        <TextField
          label={t('editor.address')}
          value={draft.address}
          onChange={(address) => edit({ address })}
          maxLength={PARTY_LIMITS.address}
          hint={t('editor.address.hint')}
          error={issueText('address')}
          dataId="party-address"
        />
        <TextField
          label={t('editor.party.dressCode')}
          value={draft.dressCode}
          onChange={(dressCode) => edit({ dressCode })}
          maxLength={PARTY_LIMITS.dressCode}
          placeholder={t('editor.party.dressCode.placeholder')}
          dataId="party-dress-code"
        />
      </section>

      <section className="panel" aria-labelledby="agenda-heading">
        <h2 id="agenda-heading" className="panel-title">
          {t('editor.party.agenda', { count: draft.agenda.length, max: PARTY_LIMITS.agenda })}
        </h2>
        <PanelIssue text={issueText('agenda')} />
        <ol className="products-edit">
          {draft.agenda.map((item, index) => (
            <li key={item.key} className="product-edit" data-id={`agenda-${index}`}>
              <div className="field-row">
                <TextField label={t('editor.party.time')} type="time" value={item.time} onChange={(time) => editItem(item.key, { time })} maxLength={5} dataId={`agenda-${index}-time`} />
                <TextField
                  label={t('editor.party.agenda.label')}
                  value={item.label}
                  onChange={(label) => editItem(item.key, { label })}
                  maxLength={PARTY_LIMITS.agendaLabel}
                  error={issueText(`agenda.${index}.label`)}
                  dataId={`agenda-${index}-label`}
                />
              </div>
              <ItemActions
                index={index}
                count={draft.agenda.length}
                onMove={(by) => editAgenda((list) => moveItem(list, item.key, by))}
                onRemove={() => editAgenda((list) => list.filter((other) => other.key !== item.key))}
                dataId={`agenda-${index}`}
              />
            </li>
          ))}
        </ol>
        {draft.agenda.length < PARTY_LIMITS.agenda ? (
          <button type="button" className="pill pill-dark" onClick={() => editAgenda((list) => [...list, { key: newKey('a', list), time: '', label: '' }])} data-id="agenda-add">
            {t('editor.party.agenda.add')}
          </button>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="rsvp-heading">
        <h2 id="rsvp-heading" className="panel-title">
          {t('editor.wedding.rsvp')}
        </h2>
        <ToggleField label={t('editor.wedding.rsvp.toggle')} hint={t('editor.wedding.rsvp.hint')} checked={draft.rsvp} onChange={(rsvp) => edit({ rsvp })} dataId="party-rsvp" />
        {draft.rsvp ? (
          <TextField
            label={t('editor.wedding.rsvp.note')}
            value={draft.rsvpNote}
            onChange={(rsvpNote) => edit({ rsvpNote })}
            maxLength={PARTY_LIMITS.rsvpNote}
            placeholder={t('editor.party.rsvp.note.placeholder')}
            dataId="party-rsvp-note"
          />
        ) : null}
      </section>

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText} />
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={ALL_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

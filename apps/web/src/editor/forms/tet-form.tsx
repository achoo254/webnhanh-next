import { TET_GREETINGS, TET_LIMITS, TET_PALETTE_IDS, type TetDraft } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { ContactsPanel } from '../contacts-panel';
import { ImageField } from '../image-field';
import { PalettePicker } from '../palette-picker';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import { ToggleField } from '../toggle-field';
import type { FormProps } from './form-props';

/**
 * The Tết card: who sends it (and to whom), the greeting (one of the ready ones, then changed at will, or the
 * sender's own), a photo, "Gửi lời chúc lại" with the sender's contacts, the look and colours.
 */
export function TetForm({ siteId, draft, update, images, onImage, issueText }: FormProps<TetDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<TetDraft>): void => update((current) => ({ ...current, ...patch }));
  const picked = TET_GREETINGS.find((greeting) => greeting.text === draft.greeting)?.id ?? null;
  return (
    <>
      <section className="panel" aria-labelledby="tet-heading">
        <h2 id="tet-heading" className="panel-title">
          {t('editor.tet')}
        </h2>
        <TextField
          label={t('editor.tet.sender')}
          value={draft.sender}
          onChange={(sender) => edit({ sender })}
          maxLength={TET_LIMITS.sender}
          placeholder={t('editor.tet.sender.placeholder')}
          error={issueText('sender')}
          dataId="tet-sender"
        />
        <TextField
          label={t('editor.tet.recipient')}
          value={draft.recipient}
          onChange={(recipient) => edit({ recipient })}
          maxLength={TET_LIMITS.recipient}
          placeholder={t('editor.tet.recipient.placeholder')}
          dataId="tet-recipient"
        />
        <TextField label={t('editor.tet.title')} value={draft.title} onChange={(title) => edit({ title })} maxLength={TET_LIMITS.title} dataId="tet-title" />
      </section>

      <fieldset className="panel greetings" data-id="tet-greetings">
        <legend className="panel-title">{t('editor.tet.greeting')}</legend>
        <p className="hint">{t('editor.tet.greeting.help')}</p>
        <div className="chips">
          {TET_GREETINGS.map((greeting) => (
            <label key={greeting.id} className="chip" data-id={`greeting-${greeting.id}`}>
              <input type="radio" name="greeting" value={greeting.id} checked={picked === greeting.id} onChange={() => edit({ greeting: greeting.text })} />
              <span>{greeting.label}</span>
            </label>
          ))}
          <label className="chip" data-id="greeting-own">
            <input type="radio" name="greeting" value="own" checked={picked === null} onChange={() => edit({ greeting: '' })} />
            <span>{t('editor.tet.greeting.own')}</span>
          </label>
        </div>
        <TextField
          label={t('editor.tet.greeting.text')}
          value={draft.greeting}
          onChange={(greeting) => edit({ greeting })}
          maxLength={TET_LIMITS.greeting}
          multiline
          error={issueText('greeting')}
          dataId="tet-greeting"
        />
      </fieldset>

      <section className="panel" aria-labelledby="tet-photo-heading">
        <h2 id="tet-photo-heading" className="panel-title">
          {t('editor.tet.photo')}
        </h2>
        <ImageField
          siteId={siteId}
          label={t('editor.tet.photo')}
          image={draft.photo ? (images.get(draft.photo) ?? null) : null}
          onUploaded={(image) => {
            onImage(image);
            edit({ photo: image.id });
          }}
          onRemove={() => edit({ photo: null })}
          dataId="tet-photo"
          wide
        />
      </section>

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText} title="editor.tet.reply" help="editor.tet.reply.help">
        <ToggleField label={t('editor.tet.replyToggle')} checked={draft.reply} onChange={(reply) => edit({ reply })} dataId="tet-reply" />
      </ContactsPanel>
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={TET_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

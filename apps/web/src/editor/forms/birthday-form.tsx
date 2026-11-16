import { ALL_PALETTE_IDS, BIRTHDAY_LIMITS, type BirthdayDraft } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { ContactsPanel } from '../contacts-panel';
import { GalleryField } from '../gallery-field';
import { ImageField } from '../image-field';
import { PalettePicker } from '../palette-picker';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import { ToggleField } from '../toggle-field';
import type { FormProps } from './form-props';

/**
 * The birthday card: who it is for and the wish (the only required fields), who sends it, the photo and a few more,
 * "Gửi lời chúc" with the owner's contacts, the look and colours.
 */
export function BirthdayForm({ photos, draft, update, images, onImage, issueText }: FormProps<BirthdayDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<BirthdayDraft>): void => update((current) => ({ ...current, ...patch }));
  return (
    <>
      <section className="panel" aria-labelledby="birthday-heading">
        <h2 id="birthday-heading" className="panel-title">
          {t('editor.birthday')}
        </h2>
        <TextField
          label={t('editor.birthday.name')}
          value={draft.name}
          onChange={(name) => edit({ name })}
          maxLength={BIRTHDAY_LIMITS.name}
          placeholder={t('editor.birthday.name.placeholder')}
          error={issueText('name')}
          dataId="birthday-name"
        />
        <TextField
          label={t('editor.birthday.message')}
          value={draft.message}
          onChange={(message) => edit({ message })}
          maxLength={BIRTHDAY_LIMITS.message}
          multiline
          error={issueText('message')}
          dataId="birthday-message"
        />
        <TextField
          label={t('editor.birthday.sender')}
          value={draft.sender}
          onChange={(sender) => edit({ sender })}
          maxLength={BIRTHDAY_LIMITS.sender}
          placeholder={t('editor.birthday.sender.placeholder')}
          dataId="birthday-sender"
        />
        <TextField label={t('editor.birthday.title')} value={draft.title} onChange={(title) => edit({ title })} maxLength={BIRTHDAY_LIMITS.title} dataId="birthday-title" />
        <TextField
          label={t('editor.birthday.kicker')}
          value={draft.kicker}
          onChange={(kicker) => edit({ kicker })}
          maxLength={BIRTHDAY_LIMITS.kicker}
          placeholder={t('editor.birthday.kicker.placeholder')}
          dataId="birthday-kicker"
        />
      </section>

      <section className="panel" aria-labelledby="birthday-photo-heading">
        <h2 id="birthday-photo-heading" className="panel-title">
          {t('editor.birthday.photos')}
        </h2>
        <ImageField
          photos={photos}
          label={t('editor.birthday.photo')}
          image={draft.photo ? (images.get(draft.photo) ?? null) : null}
          onUploaded={(image) => {
            onImage(image);
            edit({ photo: image.id });
          }}
          onRemove={() => edit({ photo: null })}
          dataId="birthday-photo"
          wide
        />
        <GalleryField
          photos={photos}
          ids={draft.gallery}
          max={BIRTHDAY_LIMITS.gallery}
          images={images}
          onChange={(change) => update((current) => ({ ...current, gallery: change(current.gallery) }))}
          onImage={onImage}
        />
      </section>

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText} title="editor.birthday.reply" help="editor.birthday.reply.help">
        <ToggleField label={t('editor.birthday.replyToggle')} checked={draft.reply} onChange={(reply) => edit({ reply })} dataId="birthday-reply" />
      </ContactsPanel>
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={ALL_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

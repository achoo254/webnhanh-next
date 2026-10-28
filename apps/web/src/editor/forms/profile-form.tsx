import { ALL_PALETTE_IDS, CONTACT_LIMIT, PROFILE_LIMITS, SOCIAL_KEYS, type ProfileDraft, type ProfileLink, type SocialKey } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n, type MessageKey } from '../../i18n';
import { ImageField } from '../image-field';
import { ItemActions, moveItem, newKey, PanelIssue } from '../list-items';
import { PalettePicker } from '../palette-picker';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import type { FormProps } from './form-props';

/** Each social account's label, and the keyboard that suits it. */
const SOCIALS: Readonly<Record<SocialKey, { readonly label: MessageKey; readonly inputMode: 'url' | 'tel' | 'email' }>> = {
  facebook: { label: 'editor.facebook', inputMode: 'url' },
  instagram: { label: 'editor.profile.instagram', inputMode: 'url' },
  tiktok: { label: 'editor.profile.tiktok', inputMode: 'url' },
  youtube: { label: 'editor.profile.youtube', inputMode: 'url' },
  zalo: { label: 'editor.zalo', inputMode: 'tel' },
  phone: { label: 'editor.phone', inputMode: 'tel' },
  email: { label: 'editor.profile.email', inputMode: 'email' },
};

/** The personal page: photo, name, a line and a short bio, a list of links, social accounts, the look and colours. */
export function ProfileForm({ siteId, draft, update, images, onImage, issueText }: FormProps<ProfileDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<ProfileDraft>): void => update((current) => ({ ...current, ...patch }));
  const editLinks = (change: (links: readonly ProfileLink[]) => ProfileLink[]): void => update((current) => ({ ...current, links: change(current.links) }));
  const editLink = (key: string, patch: Partial<ProfileLink>): void => editLinks((links) => links.map((link) => (link.key === key ? { ...link, ...patch } : link)));
  return (
    <>
      <section className="panel" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="panel-title">
          {t('editor.profile')}
        </h2>
        <ImageField
          siteId={siteId}
          label={t('editor.profile.avatar')}
          image={draft.avatar ? (images.get(draft.avatar) ?? null) : null}
          onUploaded={(image) => {
            onImage(image);
            edit({ avatar: image.id });
          }}
          onRemove={() => edit({ avatar: null })}
          dataId="avatar"
        />
        <TextField
          label={t('editor.profile.name')}
          value={draft.name}
          onChange={(name) => edit({ name })}
          maxLength={PROFILE_LIMITS.name}
          error={issueText('name')}
          dataId="profile-name"
        />
        <TextField
          label={t('editor.profile.headline')}
          value={draft.headline}
          onChange={(headline) => edit({ headline })}
          maxLength={PROFILE_LIMITS.headline}
          placeholder={t('editor.profile.headline.placeholder')}
          dataId="profile-headline"
        />
        <TextField label={t('editor.profile.bio')} value={draft.bio} onChange={(bio) => edit({ bio })} maxLength={PROFILE_LIMITS.bio} multiline dataId="profile-bio" />
      </section>

      <section className="panel" aria-labelledby="links-heading">
        <h2 id="links-heading" className="panel-title">
          {t('editor.profile.links', { count: draft.links.length, max: PROFILE_LIMITS.links })}
        </h2>
        <PanelIssue text={issueText('links')} />
        <ol className="products-edit">
          {draft.links.map((link, index) => (
            <li key={link.key} className="product-edit" data-id={`link-${index}`}>
              <TextField
                label={t('editor.profile.link.label')}
                value={link.label}
                onChange={(label) => editLink(link.key, { label })}
                maxLength={PROFILE_LIMITS.label}
                placeholder={t('editor.profile.link.label.placeholder')}
                error={issueText(`links.${index}.label`)}
                dataId={`link-${index}-label`}
              />
              <TextField
                label={t('editor.profile.link.url')}
                value={link.url}
                onChange={(url) => editLink(link.key, { url })}
                maxLength={PROFILE_LIMITS.url}
                inputMode="url"
                placeholder="https://"
                error={issueText(`links.${index}.url`)}
                dataId={`link-${index}-url`}
              />
              <ItemActions
                index={index}
                count={draft.links.length}
                onMove={(by) => editLinks((links) => moveItem(links, link.key, by))}
                onRemove={() => editLinks((links) => links.filter((other) => other.key !== link.key))}
                dataId={`link-${index}`}
              />
            </li>
          ))}
        </ol>
        {draft.links.length < PROFILE_LIMITS.links ? (
          <button type="button" className="pill pill-dark" onClick={() => editLinks((links) => [...links, { key: newKey('l', links), label: '', url: '' }])} data-id="link-add">
            {t('editor.profile.link.add')}
          </button>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="socials-heading">
        <h2 id="socials-heading" className="panel-title">
          {t('editor.profile.socials')}
        </h2>
        <p className="hint">{t('editor.contacts.help')}</p>
        {SOCIAL_KEYS.map((key) => (
          <TextField
            key={key}
            label={t(SOCIALS[key].label)}
            value={draft.socials[key]}
            onChange={(value) => update((current) => ({ ...current, socials: { ...current.socials, [key]: value } }))}
            maxLength={CONTACT_LIMIT}
            inputMode={SOCIALS[key].inputMode}
            error={issueText(`socials.${key}`)}
            dataId={`social-${key}`}
          />
        ))}
      </section>

      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={ALL_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

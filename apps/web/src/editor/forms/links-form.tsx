import { ALL_PALETTE_IDS, LINKS_LIMITS, PROFILE_LIMITS, type LinksDraft, type ProfileLink } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { ContactsPanel } from '../contacts-panel';
import { ImageField } from '../image-field';
import { ItemActions, moveItem, newKey, PanelIssue } from '../list-items';
import { PalettePicker } from '../palette-picker';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import type { FormProps } from './form-props';

/** The link-in-bio page: avatar, banner, name, handle and bio, the list of links, contact buttons, look and colours. */
export function LinksForm({ photos, draft, update, images, onImage, issueText }: FormProps<LinksDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<LinksDraft>): void => update((current) => ({ ...current, ...patch }));
  const editLinks = (change: (links: readonly ProfileLink[]) => ProfileLink[]): void => update((current) => ({ ...current, links: change(current.links) }));
  const editLink = (key: string, patch: Partial<ProfileLink>): void => editLinks((links) => links.map((link) => (link.key === key ? { ...link, ...patch } : link)));
  return (
    <>
      <section className="panel" aria-labelledby="links-about-heading">
        <h2 id="links-about-heading" className="panel-title">
          {t('editor.profile')}
        </h2>
        <ImageField
          photos={photos}
          label={t('editor.profile.avatar')}
          image={draft.avatar ? (images.get(draft.avatar) ?? null) : null}
          onUploaded={(image) => {
            onImage(image);
            edit({ avatar: image.id });
          }}
          onRemove={() => edit({ avatar: null })}
          dataId="avatar"
        />
        <ImageField
          photos={photos}
          label={t('editor.links.cover')}
          image={draft.cover ? (images.get(draft.cover) ?? null) : null}
          onUploaded={(image) => {
            onImage(image);
            edit({ cover: image.id });
          }}
          onRemove={() => edit({ cover: null })}
          dataId="cover"
          wide
        />
        <TextField label={t('editor.profile.name')} value={draft.name} onChange={(name) => edit({ name })} maxLength={LINKS_LIMITS.name} error={issueText('name')} dataId="links-name" />
        <TextField
          label={t('editor.links.handle')}
          value={draft.handle}
          onChange={(handle) => edit({ handle })}
          maxLength={LINKS_LIMITS.handle}
          placeholder={t('editor.links.handle.placeholder')}
          dataId="links-handle"
        />
        <TextField label={t('editor.profile.bio')} value={draft.bio} onChange={(bio) => edit({ bio })} maxLength={LINKS_LIMITS.bio} multiline dataId="links-bio" />
      </section>

      <section className="panel" aria-labelledby="links-heading">
        <h2 id="links-heading" className="panel-title">
          {t('editor.profile.links', { count: draft.links.length, max: LINKS_LIMITS.links })}
        </h2>
        <p className="hint">{t('editor.links.links.help')}</p>
        <PanelIssue text={issueText('links')} />
        <ol className="products-edit">
          {draft.links.map((link, index) => (
            <li key={link.key} className="product-edit" data-id={`link-${index}`}>
              <TextField
                label={t('editor.profile.link.label')}
                value={link.label}
                onChange={(label) => editLink(link.key, { label })}
                maxLength={PROFILE_LIMITS.label}
                placeholder={t('editor.links.link.label.placeholder')}
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
        {draft.links.length < LINKS_LIMITS.links ? (
          <button type="button" className="pill pill-dark" onClick={() => editLinks((links) => [...links, { key: newKey('l', links), label: '', url: '' }])} data-id="link-add">
            {t('editor.profile.link.add')}
          </button>
        ) : null}
      </section>

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText} help="editor.links.contacts.help" />
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={ALL_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

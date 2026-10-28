import { LIMITS, PALETTE_IDS, type ShopDraft } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { ContactsPanel } from '../contacts-panel';
import { ImageField } from '../image-field';
import { PanelIssue } from '../list-items';
import { PalettePicker } from '../palette-picker';
import { ProductList } from '../product-list';
import { StylePicker } from '../style-picker';
import { TextField } from '../text-field';
import type { FormProps } from './form-props';

/** The shop page: the shop, its products, how to reach it, its look and colours. */
export function ShopForm({ siteId, draft, update, images, onImage, issueText }: FormProps<ShopDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<ShopDraft>): void => update((current) => ({ ...current, ...patch }));
  const nameErrors = new Map<number, string>();
  draft.products.forEach((_, index) => {
    const text = issueText(`products.${index}.name`);
    if (text) nameErrors.set(index, text);
  });
  return (
    <>
      <section className="panel" aria-labelledby="shop-heading">
        <h2 id="shop-heading" className="panel-title">
          {t('editor.shop')}
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
        <TextField
          label={t('editor.name')}
          value={draft.name}
          onChange={(name) => edit({ name })}
          maxLength={LIMITS.name}
          placeholder={t('editor.name.placeholder')}
          error={issueText('name')}
          dataId="shop-name"
        />
        <TextField
          label={t('editor.description')}
          value={draft.description}
          onChange={(description) => edit({ description })}
          maxLength={LIMITS.description}
          placeholder={t('editor.description.placeholder')}
          multiline
          dataId="shop-description"
        />
      </section>

      <section className="panel" aria-labelledby="products-heading">
        <h2 id="products-heading" className="panel-title">
          {t('editor.products', { count: draft.products.length, max: LIMITS.products })}
        </h2>
        <PanelIssue text={issueText('products')} />
        <ProductList
          siteId={siteId}
          products={draft.products}
          images={images}
          onChange={(change) => update((current) => ({ ...current, products: change(current.products) }))}
          onImage={onImage}
          nameErrors={nameErrors}
        />
      </section>

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText} />
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

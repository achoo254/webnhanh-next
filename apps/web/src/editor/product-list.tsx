import { LIMITS, type ShopProduct } from '@trang/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { SiteImage } from '../sites-api';
import { ImageField } from './image-field';
import { TextField } from './text-field';

/** A key for a new product: unique in the list, in the shape the draft schema accepts. */
export function newProductKey(existing: readonly ShopProduct[]): string {
  const taken = new Set(existing.map((p) => p.key));
  for (let n = existing.length + 1; ; n += 1) {
    const key = `p${n}`;
    if (!taken.has(key)) return key;
  }
}

/**
 * The products of the shop: each with its photo, name, price and description, moved with up/down buttons (easier
 * than dragging on a phone, and usable with a keyboard), removed, or added up to the template's limit.
 */
export function ProductList({
  siteId,
  products,
  images,
  onChange,
  onImage,
  nameErrors,
}: {
  readonly siteId: string;
  readonly products: readonly ShopProduct[];
  readonly images: ReadonlyMap<string, SiteImage>;
  /** Takes an updater: an upload finishing seconds later must apply to the list as it is then, not as it was. */
  readonly onChange: (update: (products: readonly ShopProduct[]) => ShopProduct[]) => void;
  /** A photo was uploaded: the editor keeps it among the site's photos. */
  readonly onImage: (image: SiteImage) => void;
  /** Error per product index (name missing before publishing). */
  readonly nameErrors: ReadonlyMap<number, string>;
}): ReactNode {
  const { t } = useI18n();
  const update = (key: string, patch: Partial<ShopProduct>): void => onChange((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const move = (key: string, by: -1 | 1): void =>
    onChange((list) => {
      const next = [...list];
      const index = next.findIndex((p) => p.key === key);
      const [item] = index >= 0 ? next.splice(index, 1) : [];
      if (!item) return [...list];
      next.splice(Math.min(Math.max(index + by, 0), next.length), 0, item);
      return next;
    });

  return (
    <div className="product-list">
      <ol className="products-edit">
        {products.map((product, index) => (
          <li key={product.key} className="product-edit" data-id={`product-${index}`}>
            <h3 className="product-edit-title">{t('editor.product', { n: index + 1 })}</h3>
            <ImageField
              siteId={siteId}
              label={t('editor.product.image')}
              image={product.image ? (images.get(product.image) ?? null) : null}
              onUploaded={(image) => {
                onImage(image);
                update(product.key, { image: image.id });
              }}
              onRemove={() => update(product.key, { image: null })}
              dataId={`product-${index}-image`}
            />
            <TextField
              label={t('editor.product.name')}
              value={product.name}
              onChange={(name) => update(product.key, { name })}
              maxLength={LIMITS.productName}
              placeholder={t('editor.product.name.placeholder')}
              error={nameErrors.get(index) ?? null}
              dataId={`product-${index}-name`}
            />
            <TextField
              label={t('editor.product.price')}
              value={product.price}
              onChange={(price) => update(product.key, { price })}
              maxLength={LIMITS.price}
              placeholder={t('editor.product.price.placeholder')}
              dataId={`product-${index}-price`}
            />
            <TextField
              label={t('editor.product.description')}
              value={product.description}
              onChange={(description) => update(product.key, { description })}
              maxLength={LIMITS.productDescription}
              multiline
              dataId={`product-${index}-description`}
            />
            <div className="product-edit-actions">
              <button type="button" className="pill pill-ghost pill-small" disabled={index === 0} onClick={() => move(product.key, -1)} data-id={`product-${index}-up`}>
                {t('editor.product.up')}
              </button>
              <button
                type="button"
                className="pill pill-ghost pill-small"
                disabled={index === products.length - 1}
                onClick={() => move(product.key, 1)}
                data-id={`product-${index}-down`}
              >
                {t('editor.product.down')}
              </button>
              <button type="button" className="pill pill-danger pill-small" onClick={() => onChange((list) => list.filter((p) => p.key !== product.key))} data-id={`product-${index}-remove`}>
                {t('editor.product.remove')}
              </button>
            </div>
          </li>
        ))}
      </ol>
      {products.length < LIMITS.products ? (
        <button
          type="button"
          className="pill pill-dark"
          onClick={() => onChange((list) => [...list, { key: newProductKey(list), name: '', image: null, description: '', price: '' }])}
          data-id="product-add"
        >
          {t('editor.product.add')}
        </button>
      ) : null}
    </div>
  );
}

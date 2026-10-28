import { ALL_PALETTE_IDS, CAFE_LIMITS, type CafeDraft, type CafeItem, type CafeSection } from '@webnhanh/templates';
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

const emptyItem = (key: string): CafeItem => ({ key, name: '', description: '', price: '', image: null });

/** Every item key of the menu, for a new key unique across sections (items can be told apart in the draft). */
const allItems = (menu: readonly CafeSection[]): CafeItem[] => menu.flatMap((section) => section.items);

/**
 * The restaurant or café page: the place, its menu in sections, opening hours, address with directions, booking by
 * phone or Zalo, the look and colours.
 */
export function CafeForm({ siteId, draft, update, images, onImage, issueText }: FormProps<CafeDraft>): ReactNode {
  const { t } = useI18n();
  const edit = (patch: Partial<CafeDraft>): void => update((current) => ({ ...current, ...patch }));
  const editMenu = (change: (menu: readonly CafeSection[]) => CafeSection[]): void => update((current) => ({ ...current, menu: change(current.menu) }));
  const editSection = (key: string, change: (section: CafeSection) => CafeSection): void => editMenu((menu) => menu.map((section) => (section.key === key ? change(section) : section)));
  const editItem = (sectionKey: string, itemKey: string, patch: Partial<CafeItem>): void =>
    editSection(sectionKey, (section) => ({ ...section, items: section.items.map((item) => (item.key === itemKey ? { ...item, ...patch } : item)) }));
  const itemCount = allItems(draft.menu).length;
  const editHours = (change: (hours: CafeDraft['hours']) => CafeDraft['hours']): void => update((current) => ({ ...current, hours: change(current.hours) }));

  return (
    <>
      <section className="panel" aria-labelledby="cafe-heading">
        <h2 id="cafe-heading" className="panel-title">
          {t('editor.cafe')}
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
          label={t('editor.cafe.name')}
          value={draft.name}
          onChange={(name) => edit({ name })}
          maxLength={CAFE_LIMITS.name}
          placeholder={t('editor.cafe.name.placeholder')}
          error={issueText('name')}
          dataId="cafe-name"
        />
        <TextField
          label={t('editor.description')}
          value={draft.description}
          onChange={(description) => edit({ description })}
          maxLength={CAFE_LIMITS.description}
          placeholder={t('editor.cafe.description.placeholder')}
          multiline
          dataId="cafe-description"
        />
      </section>

      <section className="panel" aria-labelledby="menu-heading">
        <h2 id="menu-heading" className="panel-title">
          {t('editor.cafe.menu', { count: itemCount, max: CAFE_LIMITS.items })}
        </h2>
        <PanelIssue text={issueText('menu')} />
        <ol className="sections-edit">
          {draft.menu.map((section, s) => (
            <li key={section.key} className="section-edit" data-id={`section-${s}`}>
              <TextField
                label={t('editor.cafe.section')}
                value={section.title}
                onChange={(title) => editSection(section.key, (current) => ({ ...current, title }))}
                maxLength={CAFE_LIMITS.sectionTitle}
                placeholder={t('editor.cafe.section.placeholder')}
                dataId={`section-${s}-title`}
              />
              <ol className="products-edit">
                {section.items.map((item, i) => (
                  <li key={item.key} className="product-edit" data-id={`item-${s}-${i}`}>
                    <div className="field-row">
                      <TextField
                        label={t('editor.cafe.item')}
                        value={item.name}
                        onChange={(name) => editItem(section.key, item.key, { name })}
                        maxLength={CAFE_LIMITS.itemName}
                        placeholder={t('editor.cafe.item.placeholder')}
                        error={issueText(`menu.${s}.items.${i}.name`)}
                        dataId={`item-${s}-${i}-name`}
                      />
                      <TextField
                        label={t('editor.product.price')}
                        value={item.price}
                        onChange={(price) => editItem(section.key, item.key, { price })}
                        maxLength={CAFE_LIMITS.price}
                        placeholder={t('editor.product.price.placeholder')}
                        dataId={`item-${s}-${i}-price`}
                      />
                    </div>
                    <TextField
                      label={t('editor.product.description')}
                      value={item.description}
                      onChange={(description) => editItem(section.key, item.key, { description })}
                      maxLength={CAFE_LIMITS.itemDescription}
                      multiline
                      dataId={`item-${s}-${i}-description`}
                    />
                    <ImageField
                      siteId={siteId}
                      label={t('editor.cafe.item.image')}
                      image={item.image ? (images.get(item.image) ?? null) : null}
                      onUploaded={(image) => {
                        onImage(image);
                        editItem(section.key, item.key, { image: image.id });
                      }}
                      onRemove={() => editItem(section.key, item.key, { image: null })}
                      dataId={`item-${s}-${i}-image`}
                    />
                    <ItemActions
                      index={i}
                      count={section.items.length}
                      onMove={(by) => editSection(section.key, (current) => ({ ...current, items: moveItem(current.items, item.key, by) }))}
                      onRemove={() => editSection(section.key, (current) => ({ ...current, items: current.items.filter((other) => other.key !== item.key) }))}
                      dataId={`item-${s}-${i}`}
                    />
                  </li>
                ))}
              </ol>
              <div className="row">
                {section.items.length < CAFE_LIMITS.itemsPerSection && itemCount < CAFE_LIMITS.items ? (
                  <button
                    type="button"
                    className="pill pill-dark pill-small"
                    onClick={() => editMenu((menu) => menu.map((other) => (other.key === section.key ? { ...other, items: [...other.items, emptyItem(newKey('i', allItems(menu)))] } : other)))}
                    data-id={`section-${s}-add-item`}
                  >
                    {t('editor.cafe.item.add')}
                  </button>
                ) : null}
              </div>
              <ItemActions
                index={s}
                count={draft.menu.length}
                onMove={(by) => editMenu((menu) => moveItem(menu, section.key, by))}
                onRemove={() => editMenu((menu) => menu.filter((other) => other.key !== section.key))}
                dataId={`section-${s}`}
              />
            </li>
          ))}
        </ol>
        {draft.menu.length < CAFE_LIMITS.sections && itemCount < CAFE_LIMITS.items ? (
          <button
            type="button"
            className="pill pill-dark"
            onClick={() => editMenu((menu) => [...menu, { key: newKey('s', menu), title: '', items: [emptyItem(newKey('i', allItems(menu)))] }])}
            data-id="section-add"
          >
            {t('editor.cafe.section.add')}
          </button>
        ) : null}
      </section>

      <section className="panel" aria-labelledby="hours-heading">
        <h2 id="hours-heading" className="panel-title">
          {t('editor.cafe.hours')}
        </h2>
        <ol className="hours-edit">
          {draft.hours.map((row, index) => (
            <li key={row.key} className="hours-row" data-id={`hours-${index}`}>
              <TextField
                label={t('editor.cafe.hours.days')}
                value={row.days}
                onChange={(days) => editHours((hours) => hours.map((other) => (other.key === row.key ? { ...other, days } : other)))}
                maxLength={CAFE_LIMITS.hoursText}
                placeholder={t('editor.cafe.hours.days.placeholder')}
                dataId={`hours-${index}-days`}
              />
              <TextField
                label={t('editor.cafe.hours.time')}
                value={row.time}
                onChange={(time) => editHours((hours) => hours.map((other) => (other.key === row.key ? { ...other, time } : other)))}
                maxLength={CAFE_LIMITS.hoursText}
                placeholder={t('editor.cafe.hours.time.placeholder')}
                dataId={`hours-${index}-time`}
              />
              <button
                type="button"
                className="pill pill-danger pill-small"
                onClick={() => editHours((hours) => hours.filter((other) => other.key !== row.key))}
                data-id={`hours-${index}-remove`}
              >
                {t('editor.remove')}
              </button>
            </li>
          ))}
        </ol>
        {draft.hours.length < CAFE_LIMITS.hours ? (
          <button type="button" className="pill pill-dark pill-small" onClick={() => editHours((hours) => [...hours, { key: newKey('h', hours), days: '', time: '' }])} data-id="hours-add">
            {t('editor.cafe.hours.add')}
          </button>
        ) : null}
        <TextField
          label={t('editor.address')}
          value={draft.address}
          onChange={(address) => edit({ address })}
          maxLength={CAFE_LIMITS.address}
          hint={t('editor.address.hint')}
          error={issueText('address')}
          dataId="cafe-address"
        />
      </section>

      <ContactsPanel contacts={draft.contacts} onChange={(contacts) => edit({ contacts })} issueText={issueText}>
        <ToggleField label={t('editor.cafe.booking')} hint={t('editor.cafe.booking.hint')} checked={draft.booking} onChange={(booking) => edit({ booking })} dataId="cafe-booking" />
      </ContactsPanel>
      <StylePicker value={draft.style} palette={draft.palette} onChange={(style) => edit({ style })} />
      <PalettePicker ids={ALL_PALETTE_IDS} value={draft.palette} onChange={(palette) => edit({ palette })} />
    </>
  );
}

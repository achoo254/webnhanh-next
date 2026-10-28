import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

/** A key for a new item of a reordering list: `<prefix><n>`, unique in `existing`, in the shape draft schemas accept. */
export function newKey(prefix: string, existing: readonly { readonly key: string }[]): string {
  const taken = new Set(existing.map((item) => item.key));
  for (let n = existing.length + 1; ; n += 1) {
    const key = `${prefix}${n}`;
    if (!taken.has(key)) return key;
  }
}

/** `list` with the item `key` moved one place up (-1) or down (1); unchanged at either end. */
export function moveItem<T extends { readonly key: string }>(list: readonly T[], key: string, by: -1 | 1): T[] {
  const next = [...list];
  const index = next.findIndex((item) => item.key === key);
  const [item] = index >= 0 ? next.splice(index, 1) : [];
  if (!item) return [...list];
  next.splice(Math.min(Math.max(index + by, 0), next.length), 0, item);
  return next;
}

/**
 * Move up, move down and remove for one item of a list: buttons rather than dragging, easier on a phone and usable
 * with a keyboard. `dataId` prefixes each button's `data-id` (`<dataId>-up`, `-down`, `-remove`).
 */
export function ItemActions({
  index,
  count,
  onMove,
  onRemove,
  dataId,
}: {
  readonly index: number;
  readonly count: number;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
  readonly dataId: string;
}): ReactNode {
  const { t } = useI18n();
  return (
    <div className="product-edit-actions">
      <button type="button" className="pill pill-ghost pill-small" disabled={index === 0} onClick={() => onMove(-1)} data-id={`${dataId}-up`}>
        {t('editor.up')}
      </button>
      <button type="button" className="pill pill-ghost pill-small" disabled={index === count - 1} onClick={() => onMove(1)} data-id={`${dataId}-down`}>
        {t('editor.down')}
      </button>
      <button type="button" className="pill pill-danger pill-small" onClick={onRemove} data-id={`${dataId}-remove`}>
        {t('editor.remove')}
      </button>
    </div>
  );
}

/**
 * A publish issue of a whole list or panel ("Cần ít nhất một món"), shown at its top. Focusable, so a refused publish
 * can bring it into view like a wrong field (`data-issue`).
 */
export function PanelIssue({ text }: { readonly text: string | null }): ReactNode {
  if (!text) return null;
  return (
    <p className="field-error" role="alert" tabIndex={-1} data-issue="true">
      {text}
    </p>
  );
}

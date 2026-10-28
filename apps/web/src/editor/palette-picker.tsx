import { PALETTES, type PaletteId } from '@webnhanh/templates';
import type { ReactNode } from 'react';
import { useI18n } from '../i18n';

/** Picks the page's colours among those its template takes. */
export function PalettePicker<P extends PaletteId>({ ids, value, onChange }: { readonly ids: readonly P[]; readonly value: P; readonly onChange: (palette: P) => void }): ReactNode {
  const { t } = useI18n();
  return (
    <fieldset className="panel palette">
      <legend className="panel-title">{t('editor.palette')}</legend>
      <div className="swatches">
        {ids.map((id) => (
          <label key={id} className="swatch" data-id={`palette-${id}`}>
            <input type="radio" name="palette" value={id} checked={value === id} onChange={() => onChange(id)} />
            <span className="swatch-dot" style={{ background: PALETTES[id].accent }} aria-hidden="true" />
            <span className="swatch-name">{t(`palette.${id}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

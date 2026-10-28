import { allFontFiles, fontFaceCss, PALETTES, STYLE_FONTS, STYLE_IDS, type PaletteId, type StyleId } from '@webnhanh/templates';
import type { CSSProperties, ReactNode } from 'react';
import { useI18n } from '../i18n';

/**
 * Where the app serves the styles' font files (the `previewFonts` plugin in vite-preview-fonts.ts, same path): the
 * preview and the picker's samples load them from the app's own origin.
 */
const PREVIEW_FONT_PATH = '/assets/preview-fonts/';
export const previewFontUrl = (file: string): string => `${PREVIEW_FONT_PATH}${file}`;

/** The styles' faces for the picker's samples; the preview frame declares its own. */
const FONT_FACES = fontFaceCss(allFontFiles(), previewFontUrl);

/**
 * Picks the page's look. Each choice shows a small drawing of the style in the page's current colours, its name in
 * the style's display face, and one line on what it is like.
 */
export function StylePicker({ value, palette, onChange }: { readonly value: StyleId; readonly palette: PaletteId; readonly onChange: (style: StyleId) => void }): ReactNode {
  const { t } = useI18n();
  const colours = PALETTES[palette];
  const vars = { '--t-accent': colours.accent, '--t-soft': colours.soft, '--t-ink': colours.ink, '--t-pop': colours.pop } as CSSProperties;
  return (
    <fieldset className="panel style-picker" data-id="style-picker">
      <style>{FONT_FACES}</style>
      <legend className="panel-title">{t('editor.style')}</legend>
      <div className="style-options">
        {STYLE_IDS.map((id) => (
          <label key={id} className="style-option" data-id={`style-${id}`}>
            <input type="radio" name="style" value={id} checked={value === id} onChange={() => onChange(id)} />
            <span className="style-thumb" data-style={id} style={vars} aria-hidden="true">
              <span className="thumb-art" />
              <span className="thumb-aa" style={{ fontFamily: `"${STYLE_FONTS[id].display.family}"`, fontWeight: STYLE_FONTS[id].display.weight }}>
                Aa
              </span>
              <span className="thumb-lines" />
            </span>
            <span className="style-name">{t(`style.${id}`)}</span>
            <span className="style-hint">{t(`style.${id}.hint`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

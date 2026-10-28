/**
 * The three looks of a shop page. They share one markup (written by `renderShop`) and one base stylesheet; each
 * style sets the shared custom properties (shapes, borders, shadows) and adds its own layout, type and decoration.
 * Colours come from the palette only, so every palette goes with every style.
 */
import { AM_CUNG_CSS } from './shop-style-am-cung';
import { RUC_RO_CSS } from './shop-style-ruc-ro';
import { TINH_TE_CSS } from './shop-style-tinh-te';
import { LOOK_CONTACT_CSS, LOOK_TOKENS, type StyleId } from './looks';
import { BURST, HEART } from './ornaments';

export interface ShopStyle {
  readonly css: string;
  /** `sizes` of the cover photo and of a product photo, matching the style's layout. */
  readonly coverSizes: string;
  readonly productSizes: string;
  /** Inline SVG drawn with the cover photo (decoration, hidden from screen readers), or ''. */
  readonly coverOrnament: string;
  /** A tilted band repeating the shop's name under the header. */
  readonly nameBand: boolean;
}

/** The shop stylesheet of `style`: the look's tokens, the shop's own rules, then the shared contact list and bar. */
const shopCss = (style: StyleId, css: string): string => `${LOOK_TOKENS[style]}\n${css}\n${LOOK_CONTACT_CSS[style]}`;

export const SHOP_STYLES: Readonly<Record<StyleId, ShopStyle>> = {
  'ruc-ro': {
    css: shopCss('ruc-ro', RUC_RO_CSS),
    coverSizes: '(min-width:720px) 520px, 100vw',
    productSizes: '(min-width:720px) 360px, 50vw',
    coverOrnament: BURST,
    nameBand: true,
  },
  'tinh-te': {
    css: shopCss('tinh-te', TINH_TE_CSS),
    coverSizes: '(min-width:720px) 480px, 100vw',
    productSizes: '(min-width:720px) 128px, 104px',
    coverOrnament: '',
    nameBand: false,
  },
  'am-cung': {
    css: shopCss('am-cung', AM_CUNG_CSS),
    coverSizes: '(min-width:720px) 420px, 80vw',
    productSizes: '(min-width:720px) 320px, 50vw',
    coverOrnament: HEART,
    nameBand: false,
  },
};

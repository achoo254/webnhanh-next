/**
 * The shop page (see `page.ts` for what every page shares). Its only script is the order form's.
 */
import { escapeHtml } from './html';
import { ORDER_CSS, ORDER_SECTION_ID, orderFormHtml, type OrderFormOptions, type OrderProductOption } from './order-form';
import { contactItems, contactLinks, contactSection, dockNav, heroActions, ICONS, img, pageDocument, webUrlOrigin, type Action, type ImageAsset, type PageOptions, type RenderedPage } from './page';
import { PALETTES } from './palettes';
import type { ShopDraft } from './shop-schema';
import { SHOP_STYLES } from './shop-styles';

export interface RenderOptions extends PageOptions {
  /** The order form: where it posts and the page's signed token. Without it the page shows no form. */
  readonly orderForm?: OrderFormOptions;
}

/** The products visitors can order: those with a name, in the page's order. */
export function orderProducts(draft: ShopDraft): OrderProductOption[] {
  return draft.products.filter((p) => p.name.trim()).map((p) => ({ key: p.key, name: p.name.trim(), price: p.price.trim() }));
}

/** Copies of the name in the band: enough to cross a 2560 px screen even for a short name (the band hides the rest). */
const BAND_REPEATS = 24;

/** The page for `draft`. Photos missing from `assets` are left out; so are empty texts and invalid contacts. */
export function renderShop(draft: ShopDraft, assets: ReadonlyMap<string, ImageAsset>, options: RenderOptions = {}): RenderedPage {
  const palette = PALETTES[draft.palette];
  const style = SHOP_STYLES[draft.style];
  const name = draft.name.trim();
  const description = draft.description.trim();
  const cover = draft.cover ? assets.get(draft.cover) : undefined;

  const orderSection = options.orderForm ? orderFormHtml(orderProducts(draft), options.orderForm) : '';
  const formOrigin = orderSection && options.orderForm ? webUrlOrigin(options.orderForm.action) : null;
  const orderHref = `#${ORDER_SECTION_ID}`;

  const products = draft.products
    .map((product) => {
      const photo = product.image ? assets.get(product.image) : undefined;
      const title = product.name.trim();
      const desc = product.description.trim();
      const price = product.price.trim();
      if (!title && !photo && !desc && !price) return '';
      // Only named products are in the form, so only they can be picked.
      const pick =
        orderSection && title
          ? `<a class="pick" href="${orderHref}" data-p="${escapeHtml(product.key)}">Chọn mua<span class="vh"> ${escapeHtml(title)}</span></a>`
          : '';
      const foot = price || pick ? `<div class="product-foot">${price ? `<p class="price">${escapeHtml(price)}</p>` : ''}${pick}</div>` : '';
      return [
        `<li class="product${photo ? '' : ' no-photo'}">`,
        photo ? `<div class="product-photo">${img(photo, title, style.productSizes, false)}</div>` : '',
        '<div class="product-text">',
        title ? `<h3>${escapeHtml(title)}</h3>` : '',
        desc ? `<p class="desc">${escapeHtml(desc)}</p>` : '',
        foot,
        '</div></li>',
      ].join('');
    })
    .filter(Boolean);

  const { zalo, phone } = contactLinks(draft.contacts);
  // The two things a visitor most likely came to do: order here, or reach the shop.
  const actions = [
    orderSection ? { href: orderHref, label: 'Đặt hàng', icon: ICONS.bag } : null,
    zalo ? { href: zalo.href, label: 'Nhắn Zalo', icon: ICONS.chat } : null,
    phone ? { href: phone.href, label: 'Gọi ngay', icon: ICONS.phone } : null,
  ]
    .filter((action): action is Action => action !== null)
    .slice(0, 2);

  const band = style.nameBand && name ? `<div class="band-wrap" aria-hidden="true"><p class="band">${`${escapeHtml(name)} ✦ `.repeat(BAND_REPEATS)}</p></div>` : '';

  return pageDocument({
    title: name || 'Cửa hàng',
    description,
    palette,
    style: draft.style,
    css: [orderSection ? ORDER_CSS : '', style.css],
    formOrigin,
    options,
    dock: dockNav(actions, 'Đặt nhanh'),
    body: [
      `<header class="hero${cover ? ' has-cover' : ''}">`,
      '<div class="hero-text">',
      name ? `<h1>${escapeHtml(name)}</h1>` : '',
      description ? `<p class="lede">${escapeHtml(description)}</p>` : '',
      heroActions(actions),
      '</div>',
      cover ? `<div class="hero-photo">${img(cover, '', style.coverSizes, true)}${style.coverOrnament}</div>` : '',
      '</header>',
      band,
      '<main>',
      products.length > 0 ? `<section class="menu" aria-labelledby="sp"><h2 id="sp">Sản phẩm</h2><ul class="products">${products.join('')}</ul></section>` : '',
      orderSection,
      contactSection(contactItems(draft.contacts), { heading: 'Liên hệ', headingId: 'lh' }),
      '</main>',
    ],
  });
}

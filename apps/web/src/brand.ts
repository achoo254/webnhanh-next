import type { ShellBrand } from '@achoo254/app-shell';
import { defineBrand } from '@achoo254/brand';
import config from '../../../brand.config.json';
import markUrl from '../../../brand/icon.svg';

/** The product's brand (name, domain) from brand.config.json: never write the product name in code. */
export const brand = defineBrand(config);

/** What the shared shell shows of the app: name, root domain, mark. */
export const SHELL_BRAND: ShellBrand = {
  appName: brand.appName,
  domain: brand.primaryTenant.domain,
  markSrc: markUrl,
};

/** Where user sites live: `<name>.hoandat.io.vn`. */
export const SITES_DOMAIN = 'hoandat.io.vn';

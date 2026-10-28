/** Inline SVG decorations drawn by the templates: hidden from screen readers, coloured with `currentColor`. */

export const ornament = (viewBox: string, body: string, className: string): string =>
  `<svg class="${className}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

/** A twelve-point sticker burst. */
export const BURST = ornament(
  '0 0 100 100',
  '<path fill="currentColor" stroke="var(--ink)" stroke-width="3" d="M50 3l8 15 16-7 1 17 17 2-8 15 13 11-15 8 5 16-17-1-4 17-14-10-14 10-4-17-17 1 5-16-15-8 13-11-8-15 17-2 1-17 16 7z"/>',
  'burst',
);

/** A hand-drawn heart, as if doodled beside the photo. */
export const HEART = ornament(
  '0 0 48 44',
  '<path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="M24 40C10 30 4 22 5 14c1-7 8-11 14-8 3 1 4 4 5 6 1-3 3-6 7-7 6-1 12 4 11 11-1 9-9 16-18 24"/>',
  'doodle',
);

/** A five-petal apricot blossom (hoa mai), the flower of Tết in the south. */
export const BLOSSOM = (className: string): string =>
  ornament(
    '0 0 40 40',
    '<g fill="currentColor"><ellipse cx="20" cy="9" rx="7" ry="9"/><ellipse cx="20" cy="9" rx="7" ry="9" transform="rotate(72 20 20)"/><ellipse cx="20" cy="9" rx="7" ry="9" transform="rotate(144 20 20)"/><ellipse cx="20" cy="9" rx="7" ry="9" transform="rotate(216 20 20)"/><ellipse cx="20" cy="9" rx="7" ry="9" transform="rotate(288 20 20)"/></g><circle cx="20" cy="20" r="5" fill="var(--blossom-heart,#c2410c)"/>',
    className,
  );

/** A round lantern on its string, with a tassel. */
export const LANTERN = (className: string): string =>
  ornament(
    '0 0 40 96',
    '<path d="M20 0v14" stroke="var(--lantern-string,currentColor)" stroke-width="1.5"/><rect x="12" y="13" width="16" height="5" rx="1.5" fill="var(--lantern-cap,#e0a526)"/><ellipse cx="20" cy="38" rx="18" ry="21" fill="currentColor"/><path d="M20 17c-7 6-7 36 0 42M20 17c7 6 7 36 0 42" fill="none" stroke="var(--lantern-cap,#e0a526)" stroke-width="1.2" opacity=".7"/><rect x="12" y="57" width="16" height="5" rx="1.5" fill="var(--lantern-cap,#e0a526)"/><path d="M16 62h8l-1 30h-6z" fill="var(--lantern-cap,#e0a526)"/>',
    className,
  );

/** A sprig of leaves, for the wedding card's corners. */
export const SPRIG = (className: string): string =>
  ornament(
    '0 0 120 60',
    '<path d="M4 56C30 40 60 30 116 26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><g fill="currentColor" opacity=".85"><path d="M30 44c-2-10 4-18 12-20-1 9-5 16-12 20z"/><path d="M30 44c8-6 18-6 24 0-8 4-17 4-24 0z"/><path d="M56 35c-2-10 4-18 12-20-1 9-5 16-12 20z"/><path d="M56 35c8-6 18-6 24 0-8 4-17 4-24 0z"/><path d="M84 29c-1-9 5-16 13-17-2 8-6 14-13 17z"/><path d="M84 29c8-5 17-4 22 1-8 3-16 3-22-1z"/></g>',
    className,
  );

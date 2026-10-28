# Credits: `@webnhanh/templates`

## Fonts

Self-hosted in every published page (`src/shop-fonts.ts`) and on the share picture (`src/share-card.ts`). They come from
`@fontsource/*` 5.x (Google Fonts, packaged by Fontsource), and only the Latin and Vietnamese subsets are used.

| Family | Used for | Licence |
|---|---|---|
| Bricolage Grotesque | Display face of "Rực rỡ" | SIL Open Font License 1.1 |
| Newsreader | Display face of "Tinh tế" | SIL Open Font License 1.1 |
| Baloo 2 | Display face of "Ấm cúng" | SIL Open Font License 1.1 |
| Be Vietnam Pro | Body text of "Rực rỡ" and "Tinh tế" | SIL Open Font License 1.1 |
| Nunito | Body text of "Ấm cúng" | SIL Open Font License 1.1 |
| Inter | Share picture | SIL Open Font License 1.1 |

## Pictures

- `samples/*.webp` are the sample photos a new site starts with. The shop samples, `tet-photo.webp`,
  `wedding-cover.webp` and `cafe-cover.webp` are placeholders from the mock-up and stay until the variant library
  replaces them.
- `library/<template>/<variant>/*.webp` holds the variant pictures drawn by `scripts/gen-template-art.ts` from the
  prompts in `variants/`.

All of these pictures are AI-generated for the hoandat ecosystem on its own machine with the `inet-artgen` skill, using
the models Qwen-Image-2512, Z-Image-Turbo and FLUX.2 klein 4B (all Apache-2.0) and BiRefNet (MIT) for background
removal. They are owned by hoandat, all rights reserved (not CC0). None of them contain text: every word on a page is
HTML that the owner can change.

## Decorations

The lanterns, apricot blossoms, sprigs, bursts and hearts (`src/ornaments.ts`, `src/tet-styles.ts`) are drawn for this
package in inline SVG and CSS.

## Sample copy

The greetings (`TET_GREETINGS`) and every sample text were written for this package. None of them is copied from a
poem, song or other published text.

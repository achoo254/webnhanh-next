import { SHARE_CARD_SIZE } from '@webnhanh/templates';
import { describe, expect, it } from 'vitest';
import { chromeArgs, cropArgs, SHOT_WINDOW } from './share-image';

describe('share picture capture', () => {
  it('opens Chrome taller than the card, so the whole card is inside the viewport of --headless=new', () => {
    const args = chromeArgs('/w/card.html', '/w/card.png', '/h/profile');
    expect(args).toContain(`--window-size=${SHOT_WINDOW.width},${SHOT_WINDOW.height}`);
    expect(SHOT_WINDOW.width).toBe(SHARE_CARD_SIZE.width);
    // Chrome keeps about 90 px of the window for browser UI it never draws.
    expect(SHOT_WINDOW.height - SHARE_CARD_SIZE.height).toBeGreaterThanOrEqual(200);
    expect(args.at(-1)).toBe('file:///w/card.html');
  });

  it('keeps exactly the card box from the top left of the screenshot', () => {
    const args = cropArgs('/w/card.png', '/w/card.jpg');
    expect(args).toContain('crop=1200:630:0:0');
    expect(args.at(-1)).toBe('/w/card.jpg');
  });
});

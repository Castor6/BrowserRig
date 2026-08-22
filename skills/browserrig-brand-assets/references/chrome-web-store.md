# Chrome Web Store Visuals

Use this reference for Store screenshots, the required small promotional image,
and the optional marquee image.

## Current Official Slots

Verify against the official documentation before final packaging:
<https://developer.chrome.com/docs/webstore/images> and
<https://developer.chrome.com/docs/webstore/best-listing>.

- Store icon: 128x128 PNG.
- Screenshots: at least one and at most five; 1280x800 is preferred, with
  640x400 also accepted. Use square corners and full bleed.
- Small promotional image: 440x280, required.
- Marquee promotional image: 1400x560, optional.

If the developer dashboard disagrees with this reference, follow the dashboard
and update this file.

## Build A Story Before A Layout

Treat screenshots as a short product narrative. Give each frame one idea and
make the sequence understandable from thumbnails. Candidate BrowserRig story
beats include:

- an agent connecting to the user's current, already signed-in browser;
- deterministic code-first Playwright control;
- a visible interaction in the user's real browser rather than a separate
  automation profile;
- a human handoff for a passkey, 2FA, CAPTCHA, or payment confirmation;
- local operation, open-source inspection, and explicit trusted permissions.

Use only beats supported by the current release. A five-frame sequence is not
mandatory; omit weak or repetitive frames.

## Screenshots

Start from current, real BrowserRig behavior. Capture a controlled demo account
or local fixture so no private tabs, credentials, form values, tokens, account
identifiers, or unrelated browser history appear.

Use the real browser/CLI surface as the evidence layer. Cropping, callouts, and
short headlines may explain it, but do not fabricate a side panel, dashboard,
dialog, browser state, or command result. Avoid device frames and fake browser
chrome. Keep text sparse enough to remain readable after the Store downscales a
1280x800 image to 640x400.

The first frame should communicate the primary differentiator without relying
on later frames. Subsequent frames should add a new capability or trust signal,
not restate the same hero claim.

## Promotional Images

Promotional images are brand-led, not ordinary screenshots. The 440x280 tile
must work at half size and on the Store's light-gray surroundings. Fill the
canvas, define the edges, keep the composition uncluttered, and avoid large
areas of white or light gray. Prefer little or no text because promo images are
not localized.

The 1400x560 marquee may share the same visual system but needs a wider,
quieter composition. Do not stretch the small tile or simply paste a screenshot
into either slot.

Do not use badges or claims such as "Editor's Choice", "#1", "fastest", or
"secure" without current, verifiable authorization and evidence.

## QA And Delivery

Review every asset at full size, half size, and as a small thumbnail. Check:

- the brand system is consistent across icon, screenshots, and promos;
- the key subject remains visible after downscaling;
- text and callouts are not clipped or overwhelming;
- screenshots show current behavior and every claim is supportable;
- corners, bleed, file format, and dimensions match the target slot.

Run the deterministic dimension check on final raster files, for example:

```bash
node skills/browserrig-brand-assets/scripts/check-store-assets.mjs \
  --icon docs/chrome-web-store/icon-128.png \
  --small-promo docs/chrome-web-store/small-promo-440x280.png \
  --screenshot docs/chrome-web-store/screenshot-01-bridge-1280x800.png \
  --marquee docs/chrome-web-store/marquee-1400x560.png
```

The script checks file type, dimensions, and screenshot count; it does not
replace visual review.

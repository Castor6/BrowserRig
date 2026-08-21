# Chrome Web Store Submission

This document is the source copy for the BrowserRig Chrome Web Store
listing and review questionnaire. The initial distribution should be
**unlisted**.

## Single Purpose

Connect user-authorized local browser automation programs to the active tab,
manually selected tabs, and background tabs in the user's existing Chromium
browser.

## Short Description

Connect controlled browser tabs to the local BrowserRig driver for
user-authorized automation.

## Detailed Description

When enabled, trusted local programs can read and modify controlled pages, use
their signed-in state, create and close tabs, capture matching page network
activity, and record a controlled tab when requested. Data is sent only to the
BrowserRig driver on this computer at `127.0.0.1:19990`; the project publisher
does not operate a BrowserRig cloud relay.

BrowserRig lets trusted agents and programs running on your computer
control tabs in your existing browser. It uses a local Node driver for
Playwright execution and a small extension adapter for Chrome debugging APIs.

The extension connects only to `127.0.0.1:19990`. Browser data is not sent to a
BrowserRig cloud service. A trusted local caller can attach the active tab
in the last-focused browser window without clicking the toolbar; a visible page
indicator identifies controlled tabs, and the toolbar remains available for
manual attach or detach. Human handoff controls keep authentication, payment
confirmation, CAPTCHAs, and other user-presence steps with the user rather than
bypassing them.

BrowserRig is intended for trusted local use. The independent npm package and
CLI name are both `browserrig`; do not submit Store copy that points to an
inherited upstream package or repository.

## Permission Justifications

- `activeTab`: grants the temporary user-invoked tab access Chrome requires for
  `chrome.tabCapture.getMediaStreamId`. No-click control does not create this
  grant; tab/audio recording still requires a toolbar invocation.
- `alarms`: wakes the Manifest V3 worker periodically so it can reconnect to a
  local driver that starts after the browser.
- `debugger`: provides the tab-scoped Chrome DevTools Protocol transport
  required for Playwright to inspect and control tabs selected by a trusted
  local caller, including the currently active tab. The product does not enable
  Chrome's browser-wide remote-debugging endpoint.
- `offscreen`: hosts `MediaRecorder` while recording an authorized tab because
  a Manifest V3 service worker has no DOM media environment.
- `tabCapture`: records a controlled user tab only after an explicit local
  recording request.
- `tabGroups`: groups session-owned tabs under the visible `BrowserRig` group and
  restores their prior ungrouped state when released.
- Content script on `<all_urls>`: installs the small status and human-handoff
  control in controlled pages across navigations and origins. It does not
  collect page content by itself; page access occurs through explicit local
  driver commands.

## Remote Code Declaration

The extension does not download or execute remotely hosted code in the
extension runtime. All extension JavaScript is bundled in the submitted
Manifest V3 package. As its disclosed purpose, the extension relays local
Chrome DevTools Protocol commands, including page-context evaluation, to tabs
controlled by the user.

## Data Use Disclosure

Declare access to website content; controlled-page and captured request URLs;
matching request and response headers and optional bodies; user activity on
controlled pages; authentication information available to controlled pages;
and screen or tab recordings requested by an authorized local caller. The data
is used only to provide the extension's single purpose. It is
not sold, used for advertising, used for credit decisions, or transferred to
the publisher. See `docs/PRIVACY.md`.

## Reviewer Instructions

1. Install Node.js 22.22.2+, 24.15.0+, or 26+.
2. Install the independent npm package named in the final listing.
3. Install the submitted BrowserRig extension.
4. Run:

   ```bash
   browserrig execute 'await page.goto("https://example.com"); return { title: await page.title(), url: page.url() }'
   ```

5. Confirm that a controlled tab opens and the command returns `Example
   Domain`.
6. Open another ordinary web page, keep it active, and run:

   ```bash
   browserrig session new review-active
   browserrig session adopt --session review-active --active
   ```

   Confirm the page is controlled without clicking the extension toolbar.
7. Optionally click the extension toolbar button to detach the active tab, or
   to attach it manually again.
8. Run `browserrig doctor` to see local driver, extension protocol,
   session, and target diagnostics.

No account credentials are required for review. Recording is optional and
requires a separate explicit CLI request.

## Submission Artifact

Store assets live under `docs/chrome-web-store/`:

- `icon-128.png`
- `browserrig-1280x800.jpg`
- `small-promo-440x280.png`

Regenerate `small-promo-440x280.png` from the BrowserRig-branded
`small-promo.svg`, and capture the review screenshot under the expected
`browserrig-1280x800.jpg` name. Historical binary previews must not be uploaded
under the new listing without checking their visible branding.

Run:

```bash
pnpm package:extension
```

Upload `artifacts/browserrig-extension-<version>.zip`. Record the printed
SHA-256 digest with the release notes.

## Independent Listing Identity

The `0.0.1` bootstrap package created the independent BrowserRig draft on
August 22, 2026. Its Item ID is `dbobcmjamjdknplkplgdihdnmdjklpin`. The public
key from **Package → View public key** is committed as the manifest `key`, and
`src/relay-helpers.ts` accepts only the matching production origin. The key
derives to the same Item ID in automated tests. It is public identity material,
not an optional Verified CRX Uploads private key; a private upload key must
never be committed.

Before the first review submission:

1. Build extension version `0.0.2`, load `extension/dist` unpacked, and confirm
   Chrome reports ID `dbobcmjamjdknplkplgdihdnmdjklpin`.
2. Verify that build connects to a production-mode relay and that an arbitrary
   extension origin is still rejected.
3. Upload `browserrig-extension-0.0.2.zip` over the bootstrap package.
4. Complete the listing, privacy questionnaire, testing instructions, and
   unlisted distribution fields from this document, then use deferred
   publishing so npm and Store availability can be coordinated after review.

Do not ship a release that accepts arbitrary extension origins or restores the
upstream Store ID: either choice would let code outside this project's
publisher identity connect to the trusted local driver. Source-mode relays may
accept unpacked development origins, but that development exception must not
mask the production-ID test above.

Chrome references: [stable extension IDs and manifest `key`](https://developer.chrome.com/docs/extensions/reference/manifest/key),
[first publication and deferred publishing](https://developer.chrome.com/docs/webstore/publish/),
[package updates and version rules](https://developer.chrome.com/docs/webstore/update/),
and [Store distribution modes](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

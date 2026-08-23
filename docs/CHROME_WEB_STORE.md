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

Depending on the page the user chooses to control, this local handling can
include personally identifiable, health, financial and payment,
authentication, personal communication, location, web-history, user-activity,
and website-content data. BrowserRig uses it only to perform the automation the
user requested; it has no publisher analytics, advertising, or cloud data
collection.

BrowserRig lets trusted agents and programs running on your computer
control tabs in your existing browser. It uses a local Node driver for
Playwright execution and a small extension adapter for Chrome debugging APIs.

The extension connects only to `127.0.0.1:19990`. Browser data is not sent to a
BrowserRig cloud service. A trusted local caller can attach the active tab
in the last-focused browser window without clicking the toolbar; a visible page
indicator identifies controlled tabs, and the toolbar remains available for
manual attach or detach. Chrome also shows its native debugging indicator while
a tab is attached. Human handoff controls keep authentication, payment
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

Select **Yes, I am using remote code**. Use this justification:

> BrowserRig receives user-authored Playwright/CDP commands from a trusted
> program on the same computer and can execute page-context JavaScript in
> user-controlled tabs through the documented `chrome.debugger` API
> (`Runtime.evaluate`). This is the extension's disclosed single purpose and
> uses Chrome's explicit Debugger API exception for remote logic. BrowserRig
> does not load remote JavaScript, Wasm, modules, or scripts into an extension
> context; all extension runtime code is bundled in the submitted package, and
> its driver connection is loopback-only at `127.0.0.1:19990`.

Do not select **No** merely because the driver is local. Chrome defines code
received from outside the submitted package as remote logic, while its
Manifest V3 policy explicitly permits that logic through the Debugger API when
the API is used for its documented purpose. The Store disclosure should be
broader than the narrower statement that BrowserRig loads no remotely hosted
files into its extension runtime.

## Data Use Disclosure

Chrome treats local processing as collection for this questionnaire. Select
all nine available data categories because a user-authorized automation command
can operate an arbitrary controlled page:

- Personally identifiable information
- Health information
- Financial and payment information
- Authentication information
- Personal communications
- Location
- Web history
- User activity
- Website content

This includes controlled-page content; captured request URLs, headers, and
optional bodies; interactions on controlled pages; signed-in state available
to those pages; and screen or tab recordings requested by an authorized local
caller. Select all three Limited Use attestations. The data is used only to
provide BrowserRig's single purpose. It is not sold, used for advertising or
credit decisions, or transferred to the publisher. See `docs/PRIVACY.md`.

Use this public privacy-policy URL:

`https://github.com/Castor6/browserrig/blob/main/docs/PRIVACY.md`

## Dashboard Field Map

### Store listing

| Field | Value |
| --- | --- |
| Description | Use **Detailed Description** above |
| Category | Developer Tools |
| Language | English |
| Store icon | `docs/chrome-web-store/icon-128.png` |
| Screenshots | `docs/chrome-web-store/screenshot-1-1280x800.png` through `screenshot-5-1280x800.png` |
| Small promo tile | `docs/chrome-web-store/small-promo-440x280.png` |
| Top promo tile | `docs/chrome-web-store/top-promo-1400x560.png` |
| Homepage URL | `https://github.com/Castor6/browserrig` |
| Support URL | `https://github.com/Castor6/browserrig/issues` |
| Adult content | Off |

The YouTube promotional video is optional and should remain empty for the
initial release.

### Distribution

| Field | Value |
| --- | --- |
| Payment | Free; no in-app purchases |
| Visibility | Unlisted |
| Regions | All regions |

### Testing instructions

Leave username and password empty. The following copy fits the dashboard's
500-character **Other instructions** limit:

> No account or credentials are required. Install Node.js 24.15+ and run
> `npm install -g browserrig`. Run
> `browserrig execute 'await page.goto("https://example.com"); return await
> page.title()'`; it should return `Example Domain`. To test no-click active-tab
> control, open `https://example.org`, then run
> `browserrig session new review-active`,
> then `browserrig session adopt --session review-active --active`. The tab
> shows a BrowserRig indicator. Run `browserrig doctor` for diagnostics.

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
- `screenshot-1-1280x800.png` through `screenshot-5-1280x800.png`
- `small-promo-440x280.png`
- `top-promo-1400x560.png`

Upload the committed BrowserRig-branded PNG assets. Historical binary previews
must not be uploaded under the new listing without checking their visible
branding. Before upload, verify dimensions and that every screenshot and
promotional tile is a 24-bit RGB PNG reporting `hasAlpha: no`.

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

1. Merge the reviewed `Version Packages` pull request, record its calculated
   `<extension-version>`, load `extension/dist` unpacked, and confirm Chrome
   reports ID `dbobcmjamjdknplkplgdihdnmdjklpin`.
2. Verify that build connects to a production-mode relay and that an arbitrary
   extension origin is still rejected.
3. Upload `browserrig-extension-<extension-version>.zip` over the bootstrap
   package.
4. Publish the reviewed `browserrig@<npm-version>` to the official npm registry
   and verify the review install command from a clean environment.
5. Complete the listing, privacy questionnaire, testing instructions, and
   unlisted distribution fields from this document, then submit with deferred
   publishing so Store availability remains under maintainer control after
   review.

Do not ship a release that accepts arbitrary extension origins or restores the
upstream Store ID: either choice would let code outside this project's
publisher identity connect to the trusted local driver. Source-mode relays may
accept unpacked development origins, but that development exception must not
mask the production-ID test above.

Chrome references: [stable extension IDs and manifest `key`](https://developer.chrome.com/docs/extensions/reference/manifest/key),
[first publication and deferred publishing](https://developer.chrome.com/docs/webstore/publish/),
[package updates and version rules](https://developer.chrome.com/docs/webstore/update/),
[Store distribution modes](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution),
[Manifest V3 remote-logic exceptions](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements),
[privacy-field guidance](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy),
[2026 disclosure-policy update](https://developer.chrome.com/blog/cws-policy-updates-2026),
and [Store-policy troubleshooting](https://developer.chrome.com/docs/webstore/troubleshooting).

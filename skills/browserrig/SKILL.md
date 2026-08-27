---
name: browserrig
description: Drive the user's existing Chromium-family browser with deterministic Playwright. Use when asked to inspect, automate, test, or interact with a visible browser tab; continue an authenticated browser workflow; handle 2FA, passkeys, CAPTCHAs, or payment confirmation; record browser behavior; or capture an authenticated network flow.
---

# BrowserRig

BrowserRig is a **driver**, not an agent. The calling agent decides what to
do; BrowserRig runs deterministic Playwright code in the user's visible
browser.

It attaches through the browser extension, not Chrome's browser-wide remote
debugging endpoint. Do not ask the user to approve an **Allow remote
debugging?** dialog. The active tab can be attached directly from the CLI or MCP
without clicking the extension toolbar.

The normal user installation is
[BrowserRig on Chrome Web Store](https://chromewebstore.google.com/detail/browserrig/dbobcmjamjdknplkplgdihdnmdjklpin),
which receives approved extension updates automatically. Loading the packaged
unpacked build is the source-development fallback, not the default setup.

Use one loop throughout: **inspect, act, verify**. Inspect the real page before
choosing locators, act through the narrowest stable control, then verify the
result through a URL or fresh page read. Never treat a successful click or human
acknowledgment as proof that the task succeeded.

## Core Workflow

### 1. Run The Task Directly

Start with the requested browser work. Relay-backed commands start the detached
relay and wait for the extension; do not start `browserrig serve` first.
The local relay listens on `127.0.0.1:19990` by default; use
`BROWSERRIG_PORT` only when the configured endpoint intentionally differs.

```bash
browserrig execute 'return { url: page.url(), title: await page.title() }'
```

Use `browserrig doctor` only when setup or runtime behavior is unclear.
`status` and `doctor` are observational and never start the relay.

```bash
browserrig doctor
browserrig status --json
```

Completion: one execute returns a page result and a readable session id, or
`doctor` identifies the concrete setup failure.

### 2. Choose The Page Deliberately

A bare CLI execute creates a fresh session-owned page and prints the exact
`--session <id>` continuation command. Every later CLI call must pass that id or
set `BROWSERRIG_SESSION`; bare execute never guesses from human-shell
current state.

```bash
browserrig execute 'return page.url()'
browserrig execute --session cosmic-otter-866 'return page.url()'
```

MCP keeps one implicit process session. Omit `session` for that normal path, or
call `session_new` and pass an explicit id when one MCP process needs multiple
sessions.

To control the tab the user is currently viewing, attach and adopt it directly:

```bash
browserrig session new github
browserrig session adopt --active --session github
browserrig execute --session github 'return page.url()'
```

`--active` resolves the active tab in the last-focused browser window, attaches
it through the extension, and adopts it without a toolbar click. In MCP, pass
`active: true` to `session_adopt`.

For a non-active tab, the toolbar remains the explicit way to add several tabs
to the attached-tab pool. `targetUrl` and `targetIndex` then select an existing
attached page; they never navigate. A URL selector must match exactly one page,
and active, URL, and index selectors cannot be combined. Adoption makes that tab
the session default, closes the session's previous relay-created page, and is
exclusive to one BrowserRig session. Reset or delete releases an adopted
user tab without closing it.

Prefer adoption for authenticated browser state rather than reproducing login
in a fresh page.

Completion: the selected page URL is the intended page, and later work either
retains the returned session id or intentionally uses the MCP process session.

### 3. Inspect, Act, Verify

Inspect before guessing roles or selectors:

```js
return await snapshot()
```

Then act from the returned structure and verify the destination:

```js
await ref("e12").click()
await page.getByRole("heading", { name: "Settings" }).waitFor()
if (!page.url().includes("/settings")) {
  throw new Error(`Unexpected destination: ${page.url()}`)
}
return { url: page.url(), heading: await page.getByRole("heading").first().innerText() }
```

Use normal Playwright first. Keep dependent interactions in one execute when
they rely on transient UI such as an open menu, selected rows, hover state, or
an in-progress form.

If native `locator.fill()` hangs because a browser extension interferes with
focus, use the explicit `input`/`textarea` fallback:

```js
await fillInput(page.getByPlaceholder("Username"), "standard_user")
```

Completion: the final return value contains evidence of the requested outcome,
not merely evidence that an action was attempted.

### 4. Continue Or Finish Cleanly

Named sessions preserve their default page across short-lived CLI and MCP
processes. They also survive relay restarts: BrowserRig restores the id,
read-only mode, and exact default target. JavaScript `state` and snapshot refs
are process-local and reset after a relay restart with an explicit warning.

```bash
browserrig session list
browserrig session reset github
browserrig session delete github
```

Every execute is journaled under
`~/.browserrig/sessions/<id>/journal.jsonl`. The journal records code,
status, duration, URL movement, warnings, handoffs, and bounded diagnostics.
Never place credentials directly in execute source.

```bash
browserrig journal --session github --limit 50
```

Completion: retain the session only when follow-up work is expected; otherwise
reset or delete session-owned pages and report any warnings that affect later
work.

## Canonical Authenticated Flow

The distinguishing BrowserRig workflow is an authenticated tab plus a
human-only prompt:

Attach and adopt the existing tab, inspect its real UI, fill ordinary fields,
then register `handoff` before triggering WebAuthn, 2FA, CAPTCHA, or payment UI.
After the user completes it, verify the authenticated destination. The same
session can continue after an MCP process or relay restart.

When the prompt-triggering action may itself block, put only that action in
`start`. BrowserRig presents and acknowledges WAIT before invoking it:

```js
await handoff("Complete the security-key prompt, then continue", {
  timeoutMs: 600_000,
  start: () => page
    .getByRole("button", { name: /passkey|security key|sign in/i })
    .click({ timeout: 600_000 }),
})

await page.waitForURL((url) => !url.pathname.startsWith("/login"))
await page.getByRole("heading", { name: /account|dashboard/i }).waitFor()
return { authenticatedUrl: page.url(), title: await page.title() }
```

Tell the user what action is waiting. Human acknowledgment is not verification:
always assert the expected URL or stable element after `handoff`. If the action
was already completed and only the human step remains, call `handoff(message)`
without `start`. The default timeout is ten minutes.

Completion: the prompt was presented only after WAIT was registered, the action
settled, and the authenticated result was independently verified.

## Inspection Tools

Use the least expensive view that answers the question:

- `snapshot()` is the compact read-before-act default. It prioritizes semantic
  groups, alerts, lists, tables, headings, links, and controls. Text input and
  textarea values are omitted.
- `ref("e12")` resolves a control from the latest snapshot. Refs fail closed
  after navigation or incompatible DOM drift.
- `snapshot({ diff: true })` reports semantic changes from the compatible prior
  baseline. A diff invalidates earlier refs and exposes refs only for added or
  changed current lines.
- `within` accepts a Locator or an exact CSS selector. String selectors are
  checked immediately and must match exactly one element; use a Locator for
  Playwright auto-waiting or semantic landmarks.
- `ariaSnapshot(target?, { timeout })` returns Playwright's detailed YAML aria
  tree when the compact snapshot omits needed structure. Native text-control
  values, custom ARIA range values, and editable content are omitted so they do
  not enter tool output. Concurrent guarded snapshots are supported; await them
  before running other operations on the same page.
- `screenshotWithLabels({ page, path? })` adds visual labels and metadata when
  layout matters.

```js
return await snapshot()
```

Narrow a broad view through the semantic main landmark when needed:

```js
return await snapshot({ within: page.getByRole("main"), maxItems: 200 })
```

When layout matters, return the image through MCP so it can be inspected:

```js
return await screenshotWithLabels({ page })
```

Saving an image and returning only `"ok"` proves file creation, not visual
correctness. Return screenshot buffers through MCP when visual evidence matters.

## Execute Interface

Execute code can use `page`, `context`, `browser`, persistent `state`, selected
Node modules through `modules` and aliases such as `fs` and `path`, plus the
BrowserRig helpers documented here. Single expressions auto-return;
multi-statement scripts need `return`. Use `--file` for longer scripts:

```bash
browserrig execute --session github --file ./perform-flow.js
```

Human CLI output includes logs, warnings, and a concise aftermath. Use `--json`
when another command needs to branch on `ok`, `value`, `error`, `warnings`, or
`aftermath`:

```bash
browserrig execute --json --session github '({ url: page.url() })' | jq .value.url
```

Playwright downloads are unavailable through extension-backed tabs because
Chromium blocks download artifact control through `chrome.debugger`. If the
page exposes the payload through fetch or an API response, read the bytes in the
page and write them with `fs`. Do not retry `page.waitForEvent("download")`.

## Safety

BrowserRig blocks CDP commands that would destroy shared browser state,
including browser close and cookie/cache clearing. Never work around those
guardrails.

For inspect-only work, use a read-only session:

```bash
browserrig session new inspect-prod --read-only
browserrig execute --session inspect-prod 'await page.goto("https://example.com"); return page.title()'
```

Read-only sessions reject `Input.*`, so they cannot click or type through
Playwright. `page.evaluate` can still mutate the DOM; read-only prevents trusted
mistakes, not malicious code.

For destructive UI work, use a two-phase **read, confirm, verify** flow:

1. Read candidates and return exact stable identifiers or row text.
2. Obtain user approval for those exact items.
3. Re-select only approved items and assert the selected count.
4. Read the confirmation dialog and throw unless it matches the approved action.
5. Confirm, then verify through a fresh page read or independent CLI/API path.

Do not discover and confirm destructive candidates in one script unless the
user already approved exact stable identifiers. Never globally auto-accept
native dialogs; wait for the expected dialog and assert its type and message
before accepting it.

## TypeScript Client

Applications can import `BrowserRigClient` for schema-decoded,
same-origin requests authenticated by a session page. Use `sensitive: true`
for token-bearing responses and reveal them through BrowserRig's API, not
the application's own Effect `Redacted` import; package-manager layouts may
resolve separate Effect runtimes.

```ts
import { BrowserRigClient } from "browserrig"

const sensitive = yield* origin.json({
  path: "/api/session",
  method: "POST",
  body: {},
  response: SessionResponse,
  sensitive: true,
})
const session = BrowserRigClient.reveal(sensitive)
```

## Authenticated Network Capture

Use network capture when the browser is needed to authenticate or discover a
workflow, but repeated direct HTTP calls would be faster and more reliable.
Capture each flow at least twice with different inputs so constants and
parameters can be distinguished.

```bash
browserrig network start --session github --url /api/ \
  --resource-type fetch --resource-type xhr
browserrig execute --session github --file ./perform-flow.js
browserrig network status --session github
browserrig network stop --session github \
  --output ./github.har --secrets github
```

Written artifacts replace credential-bearing headers, cookies, query fields,
and structured body fields with stable references such as `${BROWSERRIG_SECRET_1}`.
`--secrets github` stores lossless values separately in a mode-`0600` Secret
Profile. Never copy profile values into source, output, diagnostics, or journals,
and never deliberately return or log credentials.

Inspect the redacted artifact offline, generate one typed function per observed
flow, then verify each function with a harmless live request. Run generated
clients without exposing values:

```bash
browserrig secrets status github
browserrig secrets run github -- ./github-cli repositories
```

Refresh credentials normally renewed by a page reload with:

```bash
browserrig secrets refresh github --session github --url /api/
```

If refresh requires login or a human prompt, reauthenticate in the adopted tab
and repeat capture with the same profile. MCP exposes equivalent `network_*`
and `secrets_*` tools.

Completion: the artifact contains references rather than credential values, the
generated operation passes a harmless live check, and no secret value appears
in source or output.

## Recording

Record an attached or session-owned tab with:

```bash
browserrig recording start ./tmp/demo.mp4 --session github --mode cdp
browserrig recording status --session github
browserrig recording stop --session github
```

`--mode auto` prefers tab capture for user-owned tabs and CDP for relay-owned
tabs. A no-click adopted tab does not receive Chrome's temporary `activeTab`
capture grant; when that grant is absent and audio was not requested, automatic
mode falls back to CDP. Explicit `--mode tab-capture` and `--audio` require one
toolbar invocation on the tab. If that click detaches the tab, run `session
adopt --active` again before recording. Tab capture can include audio; CDP
requires `ffmpeg` and has no audio. Use the command's `--help` for format and
cursor options.

Completion: stop the recorder, inspect the resulting media rather than only its
existence, and report the viewport, state, and interaction path actually tested.

## Troubleshooting

1. Run `browserrig doctor`; it checks package metadata, CLI/relay build
   identity, extension protocol compatibility, sessions, targets, and artifacts.
2. Use `status --json` to inspect exact sessions and target ownership.
3. Reproduce once with the smallest execute before changing code.

Common diagnoses:

- `connected:false`: run a relay-backed command, confirm the Store extension is
  installed and enabled, then reload it from the browser's extensions page only
  if its reconnect loop does not recover. Reload the unpacked build only for a
  source-development installation.
- `connected:false` while Chrome says another product is debugging the browser:
  end that browser-wide debugging session before reloading BrowserRig. Chrome
  debugger ownership is exclusive for the affected targets.
- Incompatible extension protocol: update either the extension or npm package;
  exact extension and relay release versions do not need to match.
- Stale relay build: operational commands automatically replace an older
  detached managed relay when exact instance and build-order evidence is
  available. Unsupported old relays, source or foreground relays, differently
  installed same-version relays, and newer relays fail closed with restart
  guidance.
- `Target not found`: attach the intended tab, then select or adopt it using a
  unique URL substring or explicit index.
- All targets disappeared: dismissing Chromium's debugging banner detaches every
  tab. Run `session adopt --active` for the current tab; use the toolbar only to
  curate additional non-active tabs.
- Relay restarted: named sessions reclaim exact targets, but JavaScript `state`
  and snapshot refs reset. Continue after the warning.
- Reset/delete after an extension update may wait briefly for target
  re-announcement; if the old relay-owned target is absent from the completed
  inventory, BrowserRig forgets the dead identity without closing a
  guessed tab.
- Repeated execution-context errors: run one short follow-up so BrowserRig
  can health-check the page. It may recreate a relay-owned page, but it never
  replaces an unhealthy adopted user tab; reset or re-adopt that tab.
- Fill timeout on login fields: inspect first, then try `fillInput` after
  confirming the selector or locator resolves. String selectors search open
  shadow roots recursively; closed shadow roots remain unavailable.
- Download wait fails: use fetch plus `fs`; extension-backed Playwright cannot
  retain a native download artifact.

For deeper relay diagnosis, restart with `BROWSERRIG_DEBUG=1`. Debug traces
must never include expressions, arguments, results, headers, cookies, or form
values.

When BrowserRig itself has a setup, relay, extension, session-lifecycle, target,
recording, or network problem worth retaining, use BrowserRig's owned report
sink. Never create or modify files in the caller workspace solely to track a
BrowserRig problem. A report works even when the relay is stopped or unhealthy.

Use `operational` for a recoverable BrowserRig event so it is retained locally.
Use `suspected-bug` only when BrowserRig behavior repeats, recovery fails, or
the evidence points to a product defect. Use `security` for potentially
sensitive findings; security reports are never submitted publicly. Ordinary
Playwright locator or assertion failures and changing-site DOM behavior belong
in the session journal, not the BrowserRig issue sink.

```bash
browserrig issue report \
  --classification operational \
  --component relay \
  --summary "Relay recovered after a failed start" \
  --actual "The first start failed and the retry succeeded" \
  --error-code relay/start-failed \
  --recovery "Retried once"
```

In MCP, call `issue_report` with the same structured fields. BrowserRig stores
reports under `~/.browserrig/issues/`, sanitizes and aggregates matching
reports, and references relevant journal timestamps without copying execute
material. If the user started the agent with
`BROWSERRIG_ISSUE_AUTO_SUBMIT=true`, eligible `suspected-bug` reports may be
submitted to `Castor6/BrowserRig` through an installed, authenticated `gh` CLI;
the agent must never enable that setting itself. Missing `gh`, missing
authentication, and submission failures never discard the local report or
start an authentication flow.

Never include credentials, form values, cookies, headers, private account data,
or other sensitive browser content. If the report interface itself is
unavailable, return the same concise structured report in the task response
instead of persisting a tracking file in the caller workspace.

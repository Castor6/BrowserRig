# BrowserRig

BrowserRig lets trusted coding agents run Playwright against your existing
Chromium-family browser. It uses your real browser profile, including logged-in
sessions and installed extensions, instead of launching a separate headless
browser.

BrowserRig is the independent open-source product—not an authorization middle
layer for another browser-agent ecosystem. It is derived from the MIT-licensed
upstream driver while owning its CLI, npm, extension, and Store identity.

It is built for the awkward gap between browser automation and a person's daily
browser:

- **Your real, signed-in browser.** Reuse the Chrome window, cookies, sessions,
  and extensions you already have.
- **No blocking remote-debugging approval.** BrowserRig does not connect to
  Chrome's browser-wide remote-debugging endpoint, so it does not trigger the
  recurring **Allow remote debugging?** dialog.
- **No toolbar click for the active tab.** `session adopt --active` finds,
  attaches, and adopts the active tab in the last-focused browser window in one
  command.
- **Background work that keeps your focus.** A normal `execute` creates a
  background tab in the same browser profile instead of switching the visible
  tab or launching another browser.
- **A complete local driver, not an agent wrapper.** The CLI, Playwright execute
  sessions, MCP server, recording, network capture, and human handoff remain
  available without bundling an LLM or requiring a hosted service.

The extension still uses Chrome's `debugger` API to carry CDP commands. The
difference is the transport and authorization scope: extension attachment
instead of Chrome's browser-wide remote-debugging connection. Chrome may show
its standard non-blocking debugging infobar while a tab is attached, but no
per-tab approval click is required.

```text
Agent or CLI -> local relay -> browser extension -> your browser
```

The driver runs locally and does not contain an LLM or make planning decisions.
Its primary interface is code: an agent sends a Playwright snippet and receives
the result, logs, warnings, and a summary of what changed.

## Quick Start

BrowserRig requires Node.js 22.22.2+, 24.15.0+, or 26+, and a Chromium-family
browser such as Chrome, Brave, Edge, Arc, or Chromium.

Setup has three parts: install the npm package, install the agent skill, and
load the included browser extension. Add MCP only when your agent prefers MCP
tools over shell commands.

### 1. Install the CLI

Install the independent package with:

```bash
npm install --global browserrig
```

This installs two commands:

- `browserrig` for CLI and skill-driven agents
- `browserrig-mcp` for MCP clients

### 2. Connect your agent

The packaged skill teaches coding agents how to inspect before acting, preserve
session identity, handle human-only steps, and recover from browser failures.
Install it with the [skills CLI](https://skills.sh):

```bash
npx skills add Castor6/browserrig --skill browserrig -g
```

Choose the agents you use when prompted. The global `-g` installation makes the
skill available across projects.

`Castor6/browserrig` is BrowserRig's independent repository identity.
BrowserRig does not edit agent configuration itself. To inspect or install the
skill manually, print the exact bundled text:

```bash
browserrig skill
```

#### Optional MCP server

The skill and MCP server do different jobs. The skill teaches the workflow; MCP
exposes BrowserRig as tools. Agents that can run shell commands need only
the skill. Add MCP when your client prefers MCP tools.

For OpenCode:

```jsonc
// opencode.json
{
  "mcp": {
    "browserrig": {
      "type": "local",
      "command": ["browserrig-mcp"]
    }
  }
}
```

For Claude Code:

```bash
claude mcp add browserrig -- browserrig-mcp
```

CLI and MCP clients share the detached relay, but each execute session keeps its
own default page and persistent JavaScript `state`. Restarting an MCP process
does not stop the relay or interrupt an active CLI session.

### 3. Load the extension

BrowserRig currently ships its extension as an unpacked extension inside
the npm package.

1. Print the extension directory:

   ```bash
   printf '%s\n' "$(npm root --global)/browserrig/extension/dist"
   ```

2. Open `chrome://extensions` or your browser's equivalent, such as
   `brave://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the printed directory.
5. Optionally pin the BrowserRig toolbar button for manual attach/detach.

### 4. Run your first browser command

Ask the configured agent to use BrowserRig, or verify the installation
directly:

```bash
browserrig execute 'await page.goto("https://example.com"); return { title: await page.title(), url: page.url() }'
```

The command starts a detached local relay when needed, opens a background tab in
your existing browser profile, and prints a readable session ID with the exact
`--session` command needed to continue. The relay listens on
`127.0.0.1:19990` and stays running between CLI calls.

A successful run returns the `Example Domain` title, a generated session ID,
and a continuation command. `browserrig status` then reports the extension
as connected.

Check the installation at any time with:

```bash
browserrig doctor
browserrig status
```

`doctor` and `status` are read-only. They report a stopped relay but never start
one. Use `browserrig serve` only for foreground debugging.

## TypeScript Client

The package also exports an Effect client for applications that need structured
browser-authenticated requests without executing generated JavaScript:

```ts
import { BrowserRigClient } from "browserrig"
import { Effect, Schema } from "effect"

const program = Effect.gen(function* () {
  const client = yield* BrowserRigClient.make()
  const browserSession = yield* client.ensureSession({ id: "my-app" })
  const account = yield* browserSession.authenticatedOrigin({
    origin: "https://app.example.com",
    startUrl: "/account",
  })

  const sensitive = yield* account.json({
    path: "/api/session",
    method: "POST",
    body: {},
    response: Schema.Struct({ accessToken: Schema.String }),
    sensitive: true,
  })
  const credentials = BrowserRigClient.reveal(sensitive)

  const profile = yield* account.json({
    path: "/api/profile",
    response: Schema.Struct({ name: Schema.String }),
  })
  return { credentials, profile }
})
```

Requests use `window.fetch` in the session's current page, so ambient browser
cookies stay in the browser. Paths must be same-origin, redirects are blocked,
responses are bounded, and mutations are never retried automatically. Set
`sensitive: true` to receive `Redacted<A>`; sensitive requests bypass execute
journals and are rejected while session network capture is active. Reveal a
sensitive result with `BrowserRigClient.reveal`; this keeps unwrapping in
the same Effect runtime that created the redacted value, including when an
application and BrowserRig resolve separate Effect package instances.
Use `resetSession(id)` to replace a persisted session generation that is no
longer connected before creating a new authenticated-origin capability.

## Work in Sessions

A bare `execute` creates a fresh session. Pass its ID to continue with the same
page and `state`:

```bash
browserrig session new docs
browserrig execute --session docs 'await page.goto("https://example.com/docs"); state.visits = (state.visits ?? 0) + 1; return state.visits'
browserrig execute --session docs 'return { url: page.url(), visits: state.visits }'
browserrig journal --session docs
```

The journal is a best-effort local activity record stored under
`~/.browserrig/sessions/<id>/journal.jsonl`. It includes bounded script and
result previews and remains after session deletion. Do not embed passwords,
tokens, or other credentials directly in execute code.

Single expressions return automatically, so this shorter form also works:

```bash
browserrig execute --session docs 'await page.title()'
```

Use `--file script.js` for longer programs and `--json` for a machine-readable
result envelope. Delete the session when you finish:

```bash
browserrig session delete docs
```

## Control an Existing Tab

Relay-created pages are isolated from other BrowserRig sessions. To adopt
the active tab in the last-focused browser window, no extension click or URL
matching is needed:

```bash
browserrig session new github
browserrig session adopt --session github --active
browserrig execute --session github 'return { title: await page.title(), url: page.url() }'
```

`--active` resolves and attaches the tab inside the extension, then adopts it
through the same ownership transaction used by existing attached tabs.

The toolbar remains useful when you deliberately want to expose several tabs at
once or select a non-active tab later. Click the toolbar button on those tabs,
then choose exactly one with `--target-url` or `--target-index`:

```bash
browserrig session adopt --session github --target-url github.com
```

Adoption is exclusive to one BrowserRig session. Resetting or deleting the
session releases an adopted user tab without closing it.

## Inspect Before Acting

Execute code receives normal Playwright `browser`, `context`, and `page`
objects, plus BrowserRig helpers. `snapshot()` is the compact default for
reading a page before interaction:

```bash
browserrig execute --session github 'return await snapshot()'
```

Snapshot controls include refs such as `[ref=e12]`. Use a ref in the next call:

```bash
browserrig execute --session github 'await ref("e12").click(); return await snapshot({ diff: true })'
```

Refs belong to the latest snapshot and become stale after navigation. They
combine structural and accessible identity so DOM drift fails closed instead
of silently targeting a different control.

Other inspection helpers include:

- `ariaSnapshot()` for a deeper accessibility-tree view
- `screenshotWithLabels()` for an annotated screenshot and element metadata
- `fillInput()` and `fillInputs()` when browser extensions interfere with
  Playwright's normal `locator.fill()`

The agent skill gives the operating workflow and canonical examples; command
`--help` output remains the source of truth for detailed options.

## Pause for Human-Only Steps

Use `handoff()` for CAPTCHA, 2FA, payment confirmation, or another step that a
person must complete:

```js
await handoff("Complete 2FA, then use the in-page continue control")
await page.getByRole("heading", { name: "Dashboard" }).waitFor()
return page.url()
```

If the click itself can block on native WebAuthn or payment UI, register the
handoff before triggering it:

```js
await handoff("Complete the security-key prompt, then continue", {
  timeoutMs: 600_000,
  start: () => page.getByRole("button", { name: "Use security key" }).click({ timeout: 600_000 }),
})
```

The page displays an accessible completion control and the script waits. Always
verify the expected URL or element after the handoff; human acknowledgment does
not prove that the requested step succeeded. BrowserRig waits for the
extension to acknowledge WAIT before calling `start`. If the handoff times out
or its target disappears first, it disconnects that sandbox's Playwright
connection before releasing the execute permit, preventing a still-pending
prompt action from mutating the page later. Keep `start` limited to the bounded
browser action that opens the native prompt.

## Use Read-Only Sessions

Read-only sessions reject mouse and keyboard CDP commands while allowing
navigation, inspection, and screenshots:

```bash
browserrig session new inspect --read-only
browserrig execute --session inspect 'await page.goto("https://example.com"); return await snapshot()'
```

Read-only mode prevents accidental Playwright input. It is not a security
sandbox: trusted code can still mutate a page with `page.evaluate()`.

## Record a Session

```bash
browserrig recording start ./demo.webm --session github
browserrig recording status --session github
browserrig recording stop --session github
```

Automatic mode prefers browser tab capture for user-owned tabs and uses CDP
screencast for relay-created tabs. Chrome grants tab/audio capture only after a
user invokes the extension on that tab. If a no-click adopted tab lacks that
grant and audio was not requested, automatic mode falls back to CDP. Explicit
`--mode tab-capture` and `--audio` still require one toolbar invocation; if the
click detaches an already controlled tab, rerun `session adopt --active` before
recording. Tab capture writes WebM and can include audio. CDP writes WebM or MP4,
requires `ffmpeg` on `PATH`, activates the recorded tab, and has no audio.

## Derive a Direct Client

Capture authenticated API exchanges across as many execute calls or human
handoffs as the workflow needs:

```bash
browserrig network start --session github --url /api/ \
  --resource-type fetch --resource-type xhr
browserrig execute --session github --file ./perform-flow.js
browserrig network stop --session github \
  --output ./github.har --secrets github
```

BrowserRig records normalized request/response exchanges itself; HAR is an
interoperable export, not the internal capture model. Written artifacts replace
cookies, authorization headers, CSRF tokens, API keys, and token-like query or
body fields with stable `${BROWSERRIG_SECRET_N}` references. Lossless values are
stored separately in a mode-`0600` profile under `~/.browserrig/secrets`.
Bodies that cannot be reliably redacted, including binary and file-bearing
multipart content, are omitted and reported as truncated.
Unknown-length and compressed response bodies are also omitted so BrowserRig
never materializes them before it can enforce the configured budget.

Generated clients read the referenced environment variables and run without
printing or embedding the values:

```bash
browserrig secrets status github
browserrig secrets run github -- ./github-cli repositories
browserrig secrets refresh github --session github
```

`secrets refresh` reloads the session page and preserves references while
updating values observed at the same source. If reauthentication requires a
human flow, log in through the browser and repeat the capture with the same
profile name instead. Child stdout and stderr are redacted before BrowserRig
returns them.

## Safety Boundaries

BrowserRig trusts the local agent code it executes. It is a driver, not an
untrusted-code sandbox.

These capabilities are dual-use. The npm package declares that classification
and includes a concrete [`DISCLOSURE`](./DISCLOSURE) covering intended use,
security boundaries, and prohibited unauthorized access.

The extension requires broad browser permissions, including `debugger`,
`tabCapture`, and a status content script on all URLs. Attaching a user tab gives
BrowserRig access to that tab through your existing browser profile.

BrowserRig does not enable or connect to Chrome's browser-wide remote
debugging endpoint. Extension attachment can still display Chrome's debugging
infobar; closing that infobar detaches the tab, and a later `session adopt
--active` can attach it again without a blocking approval dialog.

The relay blocks destructive browser-wide CDP commands that clear cookies,
clear cache, or close the browser. It also keeps session-owned tabs private from
other BrowserRig sessions. These guardrails reduce accidents, but scripts
still have access to the selected page, its logged-in state, and a limited set
of Node.js filesystem and network APIs.

Current limitations:

- The extension is installed unpacked; Chrome Web Store distribution is not
  available yet. The repository can produce the review artifact with
  `pnpm package:extension`; the first Store release will begin as an unlisted
  beta after a draft Item ID replaces the temporary upstream production-origin
  pin.
- One relay uses one connected browser-profile extension at a time. With
  multiple Chrome profiles, `--active` applies to the profile whose extension
  is currently connected and that profile's last-focused window.
- Browser-internal pages such as `chrome://extensions` cannot be attached
  through Chrome's debugger API.
- Playwright download artifacts are unavailable because Chromium blocks the
  required download commands through `chrome.debugger`. Fetch exposed response
  bytes and write them with the provided `fs` module instead.
- CDP recording requires `ffmpeg`, activates the recorded tab, and has no audio.
- BrowserRig is intended for trusted local use. It does not provide an
  authenticated remote relay.

## Troubleshooting and Upgrades

- **`browserrig: command not found`**: confirm npm's global binary
  directory is on `PATH`, then rerun the global install.
- **Extension disconnected**: confirm the unpacked extension is enabled, then
  reload it from the browser's extensions page. The extension reconnects to a
  running relay automatically.
- **Active tab is controlled by another debugger**: close DevTools or detach the
  other debugging extension for that tab, then rerun `session adopt --active`.
- **After an npm upgrade**: reload the unpacked extension. Extension and relay
  versions may differ when they use the same reported protocol version.
- **Stale relay warning**: run `browserrig doctor`, stop the old relay
  process it identifies, then rerun a relay-backed command.

For PowerShell, print the unpacked extension path with:

```powershell
Join-Path (npm root --global) "browserrig/extension/dist"
```

## Development

```bash
git clone https://github.com/Castor6/browserrig.git
cd browserrig
pnpm install
pnpm build
npm link

pnpm typecheck
pnpm test
pnpm build
SMOKE_CASE=oopif-reconnect pnpm smoke
```

Extension source changes require `pnpm build:extension` and reloading the
unpacked extension. Relay-only changes require rebuilding or restarting the
relay, not reloading the extension.

See [`PLAN.md`](./PLAN.md) for architecture and roadmap decisions,
[`AGENTS.md`](./AGENTS.md) for contributor invariants,
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for development and review expectations,
[`SECURITY.md`](./SECURITY.md) for private vulnerability reporting,
[`docs/RELEASING.md`](./docs/RELEASING.md) for the 2FA-gated npm and Chrome Web
Store release process, and
[`skills/browserrig/SKILL.md`](./skills/browserrig/SKILL.md) for the
complete agent workflow.

BrowserRig is derived from the MIT-licensed
[`anomalyco/browser-control`](https://github.com/anomalyco/browser-control)
project. The upstream copyright and license notices remain in this repository.

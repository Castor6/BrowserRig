---
title: BrowserRig Context
description: Domain language for the standalone BrowserRig project.
prompt: |
  Create a planning folder for the standalone BrowserRig project. Capture
  the decisions from a design discussion where the product is a trusted driver
  for agents to control the user's already-running Chromium-family browser via
  a Chrome extension, loose attached-tab semantics, code-first execution,
  persistent sandboxes, stock Playwright for v1, and no built-in LLM agent.
---

# BrowserRig

BrowserRig is a local browser driver for agents. It lets trusted agents
operate the user's visible Chromium-family browser through an installed
extension and a local driver daemon.

## Language

**Product Identity**:
`BrowserRig` is the visible product and Store name; `browserrig` is the npm
package, repository slug, CLI, skill name, and installable DSH bundle;
`browserrig-mcp` is the MCP executable. The optional DSH entry ships from this
same package and registers `browserrig_*` tools; there is no separate
`dsh-browserrig` product, repository, or npm package. Environment variables use
`BROWSERRIG_*`, local state lives under `~/.browserrig`, and the default
loopback relay endpoint is `127.0.0.1:19990`.
_Avoid_: Browser Control, browser-control, BC

**DSH Adapter**:
The optional leaf integration that binds a DSH agent session to a BrowserRig
session, registers typed BrowserRig tools, supplies concise built-in guidance,
and invokes the package-local BrowserRig runtime with fixed arguments and
validated machine envelopes. Its endpoint-scoped durable map keeps BrowserRig
session ids out of model context, isolates concurrent DSH tasks, and repairs a
mapping only after an explicit missing-session response; ambient human session
and target selectors never override the mapping. It makes BrowserRig
native to DSH without making DSH part of the driver core. DSH users do not
separately install the BrowserRig skill or a global CLI; direct CLI agents
continue to use the skill.
_Avoid_: DSH fork, separate dsh-browserrig product, required global CLI

**Issue Report**:
A structured, sanitized BrowserRig-owned record under
`~/.browserrig/issues/`. CLI, MCP, and DSH share one report operation that
fingerprints repeated observations and may upgrade a local operational record
to a suspected product bug. Reporting does not depend on the Local Driver
Daemon. Operational records remain local; security records are never public;
suspected bugs reach the canonical GitHub repository only when the user opted
in through `BROWSERRIG_ISSUE_AUTO_SUBMIT=true` and `gh` is available and
authenticated.
_Avoid_: caller project todo, automatic telemetry, generic issue manager

**Driver**:
A deterministic BrowserRig layer that executes requests from an external
agent without planning or calling a model.
_Avoid_: Agent, autonomous agent, LLM runner

**Agent**:
An external client that decides what browser work to perform and calls
BrowserRig to execute it.
_Avoid_: Driver

**User Browser**:
The user's already-running Chromium-family browser with the BrowserRig
extension installed.
_Avoid_: Chrome-only, managed browser

**Local Driver Daemon**:
The persistent Node process that owns Playwright execution, BrowserRig
sessions, target ownership, cross-process serialization, artifacts, and the
transport to the browser extension. It is a deep module, not a pass-through
message relay.
_Avoid_: Temporary bridge, extension reload helper

**Extension Protocol**:
The compatibility version reported by the extension when it connects to the
Local Driver Daemon. Store and npm release versions may differ while this
protocol remains compatible.
_Avoid_: Extension package version, relay build id

**Extension Release Package**:
The private `browserrig-extension` workspace package used only by Changesets to
calculate the next Chrome Web Store package version. The Version Packages
workflow copies that version into the extension manifest. It is never
published to npm and does not determine protocol compatibility.
_Avoid_: Public npm package, Extension Protocol, Store listing

**Browser-Wide Remote Debugging**:
Chrome's browser-level debugging endpoint, enabled or approved separately from
an extension. BrowserRig does not use it; this is the source of Chrome's
blocking **Allow remote debugging?** approval flow discussed in product
comparisons.
_Avoid_: CDP, Extension Attachment

**Extension Attachment**:
A tab-scoped `chrome.debugger` connection initiated by the installed extension.
It carries CDP commands without a browser-wide remote-debugging connection.
Chrome may show a non-blocking debugging infobar while the connection is active.
_Avoid_: CDP-free control, Browser-Wide Remote Debugging

**Active-Tab Attach**:
One extension-protocol command that captures the active tab id in the
last-focused browser window and immediately requests Extension Attachment for
that fixed id. Every initialization command remains bound to that same
extension connection generation; a profile or extension replacement fails
closed. The relay then verifies the target generation and performs the normal
Adoption Transaction. It removes the toolbar-click prerequisite but is not an
atomic Chrome/relay/Playwright transaction.
_Avoid_: Toolbar Control, active-tab navigation, browser-wide attach

**Attached Tab**:
A browser tab whose debugger connection is active and therefore visible and
controllable by agents.
_Avoid_: Owned tab, session tab

**Attached-Tab Pool**:
The set of debugger-attached tabs known to the driver. Unowned attached tabs
are shared; session-owned targets are visible only to their owning session.
_Avoid_: Workspace, isolated browser context, globally shared target list

**Target Ownership**:
The exclusive BrowserRig session assignment stored by the Target Registry
for a root target. It governs CDP visibility, grouping, and page status.
_Avoid_: Adopted-page pointer, current session

**Root Target Generation**:
One CDP target/session identity for a physical attached tab. Chrome may replace
that identity while preserving the tab; BrowserRig transfers committed
ownership, handoffs, and the default-page pointer to the new generation only
after its CDP setup succeeds.
_Avoid_: New tab, navigation, detach

**Adoption Transaction**:
The serialized reserve, Playwright page resolution, commit-or-rollback, and
visibility reconciliation that makes an attached tab a session's default page.
_Avoid_: Target selection, navigation

**Detach**:
The act of releasing debugger access for an attached tab without closing the
tab.
_Avoid_: Close, delete, revoke session

**Toolbar Control**:
The optional browser extension action surface used to manually attach, detach,
and display status for a tab. Active-Tab Attach is the no-click default for the
currently viewed tab.
_Avoid_: Side panel, chat panel

**Tab-Capture Grant**:
Chrome's temporary `activeTab` authority created only when the user invokes the
extension on a tab. Extension Attachment does not create this grant. Automatic
recording may fall back to CDP when a no-click adopted tab lacks it; audio and
explicit tab-capture recording require the user invocation.
_Avoid_: Debugger permission, Extension Attachment, browser-wide approval

**Store Origin Pin**:
The exact `chrome-extension://<item-id>` origin accepted by a production Local
Driver Daemon. The independent Store draft supplies this Item ID; development
exceptions for unpacked extensions must never broaden the release allowlist.
_Avoid_: Extension Protocol, arbitrary extension origin, publisher private key

**Control Group**:
The purple browser tab group named `BrowserRig` that makes session-owned tabs,
including adopted user tabs, visible in the browser tab strip.
_Avoid_: Workspace, ownership boundary

**Execute Sandbox**:
A persistent trusted JavaScript environment where an agent runs browser
automation code.
_Avoid_: Security sandbox, permission boundary

**Persistent State**:
The per-session `state` object that survives across multiple execute calls.
_Avoid_: Browser storage, tab state

**Session Catalog**:
The endpoint-scoped, private relay file that preserves session identity,
read-only mode, and the exact default-target pointer across relay processes.
Lifecycle operations acknowledge only after its atomic replacement is durable.
It does not serialize Execute Sandbox JavaScript state or snapshot refs.

**Dead Persisted Target**:
A relay-owned target identity retained in the Session Catalog that is absent
after the current extension finishes reconciling its attached-tab inventory, or
after a bounded reconnect grace when no inventory arrives. Explicit reset or
delete may forget this identity but must never guess which physical tab to
close.
_Avoid_: Detached tab, closed user tab
_Avoid_: Current-session store, session journal, sandbox snapshot

**MCP Process Session**:
The implicit persistent execute sandbox owned by one running MCP server process.
_Avoid_: Explicit MCP session id

**Network Capture**:
A session-owned recording of normalized request/response exchanges from the
session's current default page and its child frames. It survives individual
execute calls and is independent of any export format.
_Avoid_: HAR recorder, global request log

**Capture Artifact**:
An agent-readable export of a Network Capture. HAR is the first compatibility
format; credential values are represented by Stable Secret References.
_Avoid_: Raw authenticated HAR, credential bundle

**Secret Profile**:
A restrictive local store of lossless credential values discovered during a
Network Capture. Agents use profile metadata and injected references rather
than reading values directly.
_Avoid_: HAR credentials, generated-source secrets

**Stable Secret Reference**:
An environment-variable name such as `BROWSERRIG_SECRET_1` that retains its identity
when a Secret Profile is refreshed from the same request source.
_Avoid_: Token value, hardcoded credential

**Authenticated Origin**:
A session capability pinned to one HTTP origin. It performs bounded,
schema-decoded `window.fetch` requests in the session's live default page so
ambient browser authentication stays inside the User Browser. An explicit
start URL may establish the page; request paths and redirects cannot escape the
pinned origin.
_Avoid_: Cookie export, Secret Profile request, arbitrary execute callback

**Sensitive Response**:
An Authenticated Origin result that bypasses execute journals and active Network
Capture, crosses the local relay with `no-store`, and is returned to the caller
as an Effect `Redacted` value. This prevents accidental disclosure; it is not
cryptographic isolation from the trusted caller.
_Avoid_: Secret Profile, encrypted response

## Relationships

- A **Driver** serves one or more external **Agents**.
- A **User Browser** contains zero or more **Attached Tabs**.
- **Active-Tab Attach** creates an **Extension Attachment** without using
  **Browser-Wide Remote Debugging**.
- Unowned members of the **Attached-Tab Pool** are shared across sessions.
- **Target Ownership** scopes a target to exactly one session.
- A replacement **Root Target Generation** preserves the physical tab and its
  committed **Target Ownership**.
- An **Adoption Transaction** changes **Target Ownership** and the session's
  default-page pointer together.
- A **Toolbar Control** manually attaches or detaches a tab when explicit pool
  curation is useful.
- A **Tab-Capture Grant** is separate from **Extension Attachment** and is needed
  only for Chrome tab/audio capture, not ordinary page control.
- A production **Local Driver Daemon** accepts its extension through one
  independent **Store Origin Pin**.
- A **Control Group** makes session-owned tabs visible to the user.
- An **Agent** controls the browser by running code in an **Execute Sandbox**.
- An **Execute Sandbox** owns **Persistent State**; the Target Registry owns
  target assignment.
- A **Session Catalog** restores session and target identity after relay restart;
  the restored **Execute Sandbox** starts with empty **Persistent State**.
- An **Execute Sandbox** owns at most one active **Network Capture**.
- A **Capture Artifact** refers to values in a **Secret Profile** through
  **Stable Secret References**.
- An **Authenticated Origin** uses the current page's browser context without
  reading a **Secret Profile** or exporting cookies.
- A **Sensitive Response** is never appended to the execute journal or admitted
  while **Network Capture** is active.
- **Detach** removes an **Attached Tab** from the **Attached-Tab Pool**.

## Example Dialogue

> **Dev:** "If an agent starts and no tabs are attached, does it need the user
> to open a page first?"
> **Domain expert:** "No. It may create an initial tab, but it still operates
> through the user's installed browser extension."

> **Dev:** "Are tabs private to one agent session?"
> **Domain expert:** "No. v1 uses a loose attached-tab pool. Sessions keep
> separate JavaScript state, but attached tabs are shared."

## Flagged Ambiguities

- "Chrome" means **User Browser** unless browser-specific behavior is being
  discussed. BrowserRig should support Chromium-family browsers such as
  Brave, Chrome, Edge, Chromium, and Vivaldi.
- "Sandbox" means **Execute Sandbox** for persistence and convenience; it is
  not a hard security boundary against untrusted code.

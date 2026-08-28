# BrowserRig

BrowserRig is a local browser driver for trusted agents. It controls the
user's existing Chromium-family browser through a small MV3 extension shim and a
local Node relay.

## Source Of Truth

- Keep `PLAN.md` updated when architecture, scope, install flow, or product
  preferences change.
- Keep `CONTEXT.md` updated when domain language changes.
- Keep `skills/browserrig/SKILL.md` updated when the agent-facing workflow,
  commands, setup steps, or troubleshooting behavior changes.
- Keep the installed OpenCode skill at
  `~/.config/opencode/skills/browserrig/skill.md` synced with
  `skills/browserrig/SKILL.md` after agent-facing workflow changes.
- If a code change affects how agents should use BrowserRig, update the
  skill in the same change.
- `browserrig skill` must print the current `skills/browserrig/SKILL.md`
  text so another agent can fetch the installed workflow instructions.

## Architecture Preferences

- BrowserRig is a driver, not an LLM agent.
- Use the user's already-running Chromium-family browser first.
- Keep tabs in a loose attached-tab pool for v1.
- Prefer a code-first `execute(code)` interface over many tiny action tools.
- Execute runs inside relay-backed sessions. Bare CLI execute atomically creates
  a fresh readable id such as `cosmic-otter-866` and prints how to continue with
  `--session`; it never infers agent identity from shared current-session state.
- Relay-backed CLI commands auto-start a detached relay when needed. `status`
  and `doctor` remain observational, and `serve` is only the foreground/debug
  path. MCP uses the same detached relay lifecycle instead of owning an
  in-process relay, so an MCP restart cannot interrupt CLI handoffs. The first
  session is created atomically in the execute request.
- Each BrowserRig session owns one default page and persistent JavaScript
  `state`; do not default to arbitrary shared tabs for normal execute calls.
- Use stock `playwright-core` for v1.
- Use Effect v4 / `effect-smol` for Node-side code. Treat
  a local `effect-smol` checkout as the source of truth for
  Effect APIs and patterns.
- Prefer `Effect.fn` / `Effect.fnUntraced` for functions that return Effects,
  and use scoped resources (`Effect.acquireRelease`, `Effect.scoped`) for
  Playwright and relay lifecycles.
- Read application runtime configuration through Effect `Config`. Direct
  `process.env` access is reserved for synchronous process-fault reporting and
  child-process environment forwarding at Node adapter boundaries.
- Keep the relay/extension protocol as custom JSON-over-websocket unless there is
  a concrete reason to adopt Effect RPC across that boundary.
- Keep the extension as a stable shim over Chrome APIs. Put behavior in the
  relay when possible so iteration usually requires only restarting Node, not
  reloading the extension.
- Relay HTTP wire shapes live in `src/relay-schema.ts` (Effect Schema). Both the
  HTTP responders and clients must derive types from those schemas; do not
  hand-roll relay JSON parsers. Error responses use the shared coded
  `ErrorEnvelope`; keep the relay message top-level while mapping tagged domain
  errors to stable codes and HTTP statuses.
- Tie relay HTTP effects to the response lifetime with an `AbortSignal`.
  Execute workers outlive an interrupted request once browser work starts;
  retain the session permit through final journal and catalog writes so aborted
  clients cannot lose aftermath bookkeeping or overlap later page mutations.
- The CLI and MCP server talk to the relay only through the shared
  `src/relay-client.ts` service (`RelayClient.Service`), never through ad-hoc
  fetch/node:http calls. Failures are tagged errors that keep the relay's own
  error message as the top-level message.
- The root `browserrig` npm package is also the native DSH bundle through
  `browserrig/dsh` and `cordis.patch.yml`; never split it into a separate
  `dsh-browserrig` product. Keep `src/dsh-*` as a leaf adapter so BrowserRig
  core never imports DSH. It registers only code-first execute, active adoption,
  scoped status, reset, journal, and BrowserRig-owned issue reporting plus
  concise prompt guidance; DSH users do not install the standalone BrowserRig
  skill.
- DSH invokes the exact package-local `dist/cli.js` with fixed argv, validated
  bounded JSON envelopes, and forwarded cancellation; never use PATH discovery,
  a shell, or arbitrary CLI passthrough. Strip `BROWSERRIG_SESSION`,
  `BROWSERRIG_TARGET_URL`, and `BROWSERRIG_TARGET_INDEX` from child environments
  because the plugin owns those selectors. The bundled CLI, MCP, and DSH
  executable surfaces must carry their Effect runtime so DSH profiles with
  `autoInstallPeers: false` install without build approval. Keep the library
  entry's Effect dependency external for application composition, and copy
  license/notice files for every bundled dependency into `dist/licenses/`.
- Bind each immutable DSH agent id to one endpoint-scoped BrowserRig session in
  the durable map under `~/.browserrig/dsh/`. Hash mapping keys, hide BrowserRig
  ids and global targets from model output, serialize lifecycle work per DSH
  session, and replace a mapping only after stable `session-not-found`. Bare
  execute or bare active adoption creates the first BrowserRig session; do not
  add a BrowserRig `session ensure` prerequisite for the plugin.
- Human session-management commands keep an endpoint-scoped current id in
  `~/.browserrig/session.json`; execute and adopt never use it implicitly.
  Invalid persisted session JSON is reported and preserved, never treated as an
  empty store that a later write may overwrite.
- Relay session descriptors persist per port under
  `~/.browserrig/relays/<port>/sessions.json`. After a relay restart,
  restore session ids, read-only mode, and exact target ownership when that tab
  reappears; JavaScript `state` and snapshot refs intentionally reset and warn.
  Win the endpoint port before loading or writing this catalog. Successful
  durable lifecycle operations await atomic replacement plus file and directory
  sync. Corrupt catalogs fail relay startup and are never overwritten.
- An extension RPC timeout fails only that command; the extension socket is
  closed only when a websocket-level ping probe also fails.
- Active-tab attachment binds every initialization and presentation RPC to the
  extension connection generation that selected the tab. If the extension or
  browser profile changes before completion, fail closed without sending the
  old tab id to the replacement connection or committing its target.
- CDP guardrails are pure logic in `src/cdp-guardrails.ts`, enforced at the top
  of `routeCdpCommand`. Destructive browser-state methods are always blocked;
  read-only sessions additionally reject `Input.*`.
- Browser-context CDP methods route through a session-owned root for named
  clients or exactly one visible root for raw clients. A named client never
  falls back to an unrelated unowned tab.
- Human handoff waiters live in `src/handoff.ts`; derive their stable CDP target
  id from the actual Playwright `Page`, then bind the exact registry
  target/tab/session. The relay resolves only a matching handoff id from that
  tab's in-page completion control. Toolbar clicks never resolve handoffs or
  detach a tab whose session is mid-execute. The extension must not clear page
  status directly from `chrome.debugger.onDetach`: the relay owns root-detach
  classification, and ambiguous `target_closed` events from extension child
  targets must preserve the handoff UI.
- Handoff `start` actions run only after the waiter and WAIT UI are registered.
  Require extension acknowledgement of WAIT before invoking `start`. Human
  completion waits for the action to settle and for the destination execution
  context to become available. Timeout or target cancellation disconnects the
  sandbox before releasing its execute permit, preventing a non-settling prompt
  action from mutating the page later. Cancel the waiter if WAIT presentation or
  action startup fails.
- `TargetRegistry` is the sole production live target-ownership authority.
  Session state keeps one durable default-target identity and owner. Adoption reserves,
  commits, or rolls back registry ownership transactionally and reconciles CDP
  visibility, grouping, and page status for every changed target.
- Same-tab root target generations are explicit replacements, never map
  overwrites. Preserve committed ownership, roll back provisional adoption
  ownership, detach the old generation before announcing the new one, rebind
  pending handoffs, and make the owning sandbox reacquire the exact new target.
- Adopted targets are exclusive to one BrowserRig session. Serialize
  adopts, reject competing owners, and release ownership on detach, reset, or
  delete. If adoption times out, roll back visibility immediately but retain
  the execute and adopt permits until uncancellable Playwright work settles.
  Relay shutdown must close the adoption gate and drain those workers rather
  than interrupting them.
- Execute results carry per-call `warnings` and an `aftermath` summary
  (URL movement, navigations, error counts, handoffs). After an execution-context
  diagnostic or target crash, the next normal execute performs a bounded page
  health check: recreate unhealthy relay-owned pages only after the old page
  closes, but never close or replace unhealthy adopted user tabs. Crash events
  reject pending debugger commands for only that tab and remain visible in
  status/doctor until navigation or detach.
  Do not add a passive `page.on("dialog")` listener for aftermath: it would
  suppress Playwright's dialog auto-dismiss and hang pages.
- Allowed Playwright mouse actions automatically reveal a spring-animated arrow cursor;
  explicit helpers can keep it visible or disable it for the current document.
  Read-only input is rejected before cursor mirroring.
- Compact `snapshot()` refs are scoped to the session's latest snapshot and
  rejected after main-frame navigation. Their locators combine structural and
  accessible identity so sibling drift fails closed. Snapshot budgets reserve
  semantic groups, lists, tables, block code, alerts, and primary links before
  repeated metadata; text input and textarea values are omitted. Snapshot diffs
  are explicit, require a compatible prior baseline, invalidate earlier refs,
  and expose refs only for added or changed current lines. `ariaSnapshot()` also
  omits native text-control values, custom ARIA range values, and editable
  composed-tree content while preserving surrounding structure. Register its
  unique selector engine for each connected Playwright context before page or
  locator work; pre-connect registration does not reach the default context
  returned by `connectOverCDP`. Track each mask with a module-unique token and
  clean it only through the frame where it was activated; a destroyed execution
  context is already clean. Concurrent guarded snapshots are supported, but the
  helper temporarily masks values in Playwright's isolated world, so do not run
  unrelated operations on the same page until it settles. Keep raw Playwright
  as a deeper inspection layer; do not replace the code-first execute interface
  with many action commands.
- Authenticated network capture is owned by the persistent Execute Sandbox and
  records normalized exchanges; HAR is only an export adapter. Written
  artifacts always use route-scoped stable `BROWSERRIG_SECRET_N` references. Lossless
  values live in restrictive secret profiles and enter generated clients only
  through `secrets run`. Keep recorder transitions serialized, body retention
  bounded per body and in aggregate, profile updates locked across relay
  processes, and credential values out of normal outputs, diagnostics, and
  journals.
- With `BROWSERRIG_DEBUG=1`, `[browserrig:ctx]` lines trace bounded metadata for
  target ownership/browser-context identity, main-frame loaders, Runtime context
  lifecycle/reset attempts, and failed evaluates. Never add expressions,
  arguments/results, headers, cookies, or form values to this trace.
- The session journal (`src/session-journal.ts`) appends one JSON line per
  execute under `~/.browserrig/sessions/<id>/journal.jsonl`; writes are
  best-effort and must never fail the execute call.
- BrowserRig issue reports are structured, sanitized, fingerprinted records
  under `~/.browserrig/issues/`. CLI, MCP, and DSH expose one report operation;
  none exposes a general issue manager. Operational reports remain local,
  security reports are never public, and only `suspected-bug` reports may use
  an installed authenticated `gh` when the user configured
  `BROWSERRIG_ISSUE_AUTO_SUBMIT=true`. Reporting never requires or starts the
  relay, never creates tracking files in the caller workspace, and never starts
  GitHub authentication.
- Relay-owned recording uses `Page.startScreencast`, immediately acknowledges
  compositor frames, activates the target to avoid background-tab throttling,
  and fits its viewport within 1280×720. Stream each distinct JPEG once in a
  timestamped Matroska envelope and let ffmpeg produce constant 25 fps output;
  never push duplicated JPEGs through Node or derive duration from discontinuous
  navigation timestamps.
- Session delete/reset must acquire the session's execute permit before closing
  the sandbox, so running scripts are never yanked mid-flight.
- Session deletion is idempotent for a resolved session id: return whether a
  live session was deleted instead of failing when it is already absent.
- Reset/delete of an absent persisted relay-owned target waits for protocol-v1
  inventory reconciliation or a bounded grace, then forgets the dead identity
  without guessing a physical tab to close. Never apply this dead-target path
  to adopted user tabs.
- The version string and build id are injected by `scripts/build-cli.ts`
  (`src/version.ts`; source runs use `0.0.0-dev` and a deterministic source
  and dependency-lock fingerprint). The relay
  reports both so `doctor` can detect a long-running relay left stale by a CLI
  rebuild; never hardcode version literals.
- Relay version metadata includes an instance id, start time, and PID. Bounded
  managed-relay process-fault diagnostics are retained with mode `0600` in
  `~/.browserrig/relay.log` so same-build restarts and session loss are
  diagnosable instead of appearing as eviction.
- Operational commands may replace only an older managed relay after confirming
  its exact instance id, and must wait for it to exit before starting the
  current build. With BrowserRig's deterministic content-hash build ids,
  ordering requires either a higher stable package version or a newer artifact
  at the same resolved managed CLI path. Never auto-stop source, foreground,
  differently installed same-version, or newer relays.
- `dist/mcp.js` self-runs via the dedicated `src/mcp-main.ts` entrypoint. Do not
  add `process.argv[1] === import.meta.url` self-run guards to modules that get
  bundled into `dist/cli.js`; esbuild inlining makes the guard fire inside the
  CLI bundle.
- CDP target visibility is scoped per client (`src/cdp-visibility.ts`):
  session-owned tabs are announced and their events delivered only to that
  session's clients; unowned tabs stay visible to everyone. Do not reintroduce
  broadcast-to-all: it double-initializes pages across clients and hangs
  `newPage`/`setContent`/`evaluate` (regression case: `stale-client-checkout`
  smoke).
- Client-side CDP aliases for already-announced root targets must route commands
  without a Chrome child `sessionId`; only child-target aliases carry a real
  Chrome session id. Use `chromeSessionIdForClientRequest` for both ordinary
  commands and `Runtime.enable`.
- `session adopt` makes a user-attached tab the session's default page. Adopted
  tabs are never closed by session reset/delete — only released. Adopting
  closes the session's previously relay-created page.
- Relay-created tabs should persist across short-lived `browserrig execute`
  commands so shell-based agents do not create and delete a visible tab for every
  probe.
- Root page targets must be stored before applying `Target.setAutoAttach`, because
  Chrome can emit child/OOPIF attach events immediately and the relay needs the
  root target to route and store them.
- `Target.setAutoAttach` forwards dedicated `worker` targets to Playwright, but
  resumes and suppresses unsupported children such as page-scoped service
  workers. Exposing an unroutable paused child can hang its parent navigation.
- OOPIF reconnect depends on replaying stored child target attaches plus the
  current child frame navigation on the child session for stock Playwright.
- Relay shutdown should await HTTP and websocket close callbacks so scoped tests
  and smoke runs do not leak listeners or ports.
- Use plain TypeScript for the MV3 extension unless a build-system need forces a
  change.

## Development

- For change or build requests that start on `main`, automatically create a
  working branch unless the user requests local-only work or names a branch.
  Derive a concise `<type>/<kebab-case-summary>` name from the task, using the
  same type vocabulary as Conventional Commits. Continue on an existing
  non-`main` working branch unless the user asks for a different branch.
- After implementation and validation, commit, push, and open a pull request
  automatically unless the user opts out. Never merge a feature pull request,
  merge a `Version Packages` pull request, or publish a release without explicit
  user approval. Exclude unrelated worktree changes; stop for direction if they
  cannot be separated safely.
- Use Conventional Commits in English: `<type>(optional-scope): description`.
  Use `feat` for features and `fix` for bug fixes. Other accepted types are
  `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `perf`, `style`, and
  `revert`. Mark breaking changes with `!` and a `BREAKING CHANGE:` footer.
  Keep commit descriptions concise and imperative. Conventional Commit types
  do not replace Changesets; choose the Changeset bump from published impact.
- Write code comments, documentation, branch names, commit messages, and pull
  request titles and bodies in English. Always communicate with the user in
  Chinese, including progress updates and final responses, unless the user
  explicitly requests another language.
- Add a Changeset for pull requests that change behavior shipped in the
  `browserrig` npm package. Documentation, tests, CI, and internal refactors
  without published behavior changes do not need one.
- Changes packaged into the Chrome extension require Changeset entries for
  both `browserrig-extension` and `browserrig`, because `extension/dist` also
  ships inside the npm tarball. Use `patch` for fixes and asset updates,
  `minor` for backward-compatible capabilities, and `major` for breaking
  behavior. The `browserrig` bump must be at least as large as the extension
  bump. Store-listing-only assets under `docs/chrome-web-store/` require neither
  entry. The private extension package exists only to calculate the Store
  version and must never be published to npm.
- Do not edit `extension/package.json` or the `version` field in
  `extension/manifest.json` in a feature pull request. The `Version Packages`
  workflow owns both exact versions and synchronizes them after applying all
  pending Changesets.
- GitHub tags and Releases follow the `browserrig` npm version. Release notes
  record the independently calculated extension version and protocol version;
  neither changes the GitHub Release tag.
- Merging a repository-owned `Version Packages` pull request builds one
  immutable candidate, uploads its npm tarball, extension ZIP, manifest, and
  checksums, then publishes that exact npm tarball through the direct-publish
  npm Trusted Publisher configured for `.github/workflows/release.yml` and the
  `npm-publishing` environment. After npm succeeds, the same workflow submits
  the exact retained extension ZIP through Chrome Web Store API V2 with
  `DEFAULT_PUBLISH`, using GitHub OIDC, a keyless Google service account, and
  the `chrome-web-store-publishing` environment. Never add an npm token,
  bypass-2FA token, Google service-account key, OAuth client secret, or refresh
  token.
- Treat merging `Version Packages` as the explicit, irreversible npm
  publication and Chrome Web Store submission approval. Review its versions,
  changelogs, package diff, and green CI before merging; the release workflow
  reruns full CI, packaging, manifest verification, and exact artifact checks
  before `npm publish`, then verifies the retained candidate again before Store
  upload. Google review remains mandatory and approval publishes the extension
  automatically. Do not merge another `Version Packages` pull request while
  publication, Store submission, or GitHub finalization is in progress. If
  `npm publish` returns an ambiguous failure, inspect the exact version and
  registry tarball before rerunning because npm versions are immutable.
  After the npm tarball is publicly visible, the scheduled GitHub
  finalizer verifies its integrity against the original candidate before it
  creates the npm-version tag and Release or uploads any assets. It must fail
  closed on tag, commit, manifest, or asset conflicts and never rebuild or
  overwrite a candidate. It may recover a completed failed publish run only
  when the retained candidate and public npm tarball match exactly.
- For every releasable change, run `pnpm changeset` and commit the generated
  `.changeset/*.md` file. Its frontmatter must name the package and choose one
  relative SemVer bump:

  ```md
  ---
  "browserrig": minor
  ---

  Add a user-visible capability.
  ```

- Choose `patch` for backward-compatible bug fixes or behavior corrections,
  `minor` for backward-compatible user-visible capabilities, and `major` for
  breaking public API, CLI, configuration, or behavior changes. Base the choice
  on published impact rather than the Conventional Commit type.
- In a pull request that carries a Changeset, do not choose an exact target
  version, manually edit the `version` field in `package.json`, or prewrite its
  release entry in `CHANGELOG.md`. The `Version Packages` workflow owns those
  edits and derives the exact version from the current package version and all
  pending Changesets.
- Write the Changeset summary in English for package users. Describe the
  released behavior and its practical impact, not the implementation work.
- Run `pnpm typecheck` after TypeScript changes.
- Run `pnpm test` (vitest) after changes to schemas, relay-client, session
  store/manager, extension-rpc, or execute auto-return logic. Unit tests live in
  `test/` and must not require a browser.
- Run `pnpm build:cli` after CLI or relay source changes that should affect the
  linked `browserrig` binary.
- Run `pnpm build:extension` after extension changes.
- For DSH changes, run the focused DSH tests, build and pack the npm artifact,
  then install that exact tarball into clean official `web` and `headless`
  profiles with `dsh plugin --profile <name> add <tarball>`. Check
  `--dump-config`, peer warnings, `browserrig/dsh` import, and the package-local
  CLI without relying on a global BrowserRig install.
- Extension shim changes require reloading the unpacked extension once in Brave.
- Relay-only changes should not require reloading the extension.
- Use `termctrl` for long-running relay sessions during testing.
- Run `SMOKE_CASE=local-forms,local-cart,local-checkout,reconnect-evaluate,redirect-reconnect-evaluate,session-missing-selector,execute-target-url,execute-page-recovery,execute-page-detach-recovery,execute-fill-helpers,execute-snapshot-refs,handoff-navigation,handoff-cross-tab,handoff-target-detach,oopif-reconnect,dedicated-worker,network-capture,session-download-capability,execute-ghost-cursor,session-isolation,multi-client,stale-client-checkout,raw-first-checkout pnpm smoke`
  before claiming the current smoke set is green.
- CDP target visibility is scoped per client (`src/cdp-visibility.ts`):
  session-owned tabs are announced and their events delivered only to that
  session's clients; unowned tabs stay visible to everyone. Do not reintroduce
  broadcast-to-all: it double-initializes pages across clients and hangs
  `newPage`/`setContent`/`evaluate` (regression case: `multi-client` smoke).
- Run the relay with `BROWSERRIG_DEBUG=1` to log per-client CDP requests,
  responses, and extension debugger events when diagnosing protocol issues.

## Commands

```bash
pnpm typecheck
pnpm test
pnpm build:cli
pnpm build:extension
SMOKE_CASE=oopif-reconnect pnpm smoke
browserrig serve
browserrig status
browserrig session new
browserrig session new inspect --read-only
browserrig session list
browserrig execute 'return { url: page.url(), title: await page.title() }'
browserrig execute --json 'page.url()'
browserrig journal
browserrig issue report --classification operational --component relay --summary "Relay recovered" --actual "The retry succeeded"
browserrig skill
```

## Extension

- Load `extension/dist` as the unpacked extension.
- The relay listens on `127.0.0.1:19990` by default.
- The current shim package version comes from `extension/manifest.json`. Store
  Item ID is `dbobcmjamjdknplkplgdihdnmdjklpin`, and extension protocol version
  is `3`.
- Store and npm versions may differ while their extension protocol versions remain compatible.
- On socket open the shim sends `hello` and then re-announces every tab it still
  has `chrome.debugger` attached to (`debugger.attached` events), so a restarted
  relay rebuilds its target registry without the user re-clicking the toolbar.
- Send `ready` after the attached-tab inventory; tab-group presentation and
  stale-group cleanup are best-effort and must never block extension readiness.
  Serialize group and ungroup presentation per tab so delayed browser APIs
  cannot apply an older ownership state after a newer one.
- Register `runtime.onStartup` at global scope so a full browser restart wakes
  the MV3 worker. Repair the reconnect alarm whenever the worker starts and send
  heartbeat traffic every 20 seconds while its relay socket is open. Chrome may
  clear persisted alarms and retires idle extension workers even with an open
  socket.
- The relay dedupes target announcements per CDP client by targetId: a
  re-announce under a new sessionId emits `Target.detachedFromTarget` for the
  old session first. Never announce the same targetId twice to one client
  without a detach — playwright-core's `Duplicate target` assert kills the
  connection's process.
- The relay installs scoped `uncaughtException`/`unhandledRejection` guards for
  its lifetime; in-process playwright event dispatch errors are logged, not
  fatal.
- Session-owned tabs, including adopted user tabs, share a purple `BrowserRig`
  group within each browser window. Merely attached tabs remain in their
  existing location. Releasing an adopted tab removes it from `BrowserRig` without
  closing it. The shim also recognizes legacy `browser-control`, `bc:*`, and
  `bc · *` groups for cleanup.

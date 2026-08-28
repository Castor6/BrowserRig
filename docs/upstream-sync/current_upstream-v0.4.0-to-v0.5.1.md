---
title: Upstream Sync v0.4.0 to v0.5.1
description: Product decision, execution authorization, and serial batch ledger for adopting selected upstream changes through v0.5.1.
status: implementing
upstream_from: v0.4.0
upstream_to: v0.5.1
target_checked: 2026-08-27
---

# Upstream Sync: `v0.4.0 -> v0.5.1`

## Cycle state

- **Latest completed upstream sync:** `v0.4.0` bootstrap source baseline
- **Target:** `v0.5.1`
- **Target checked:** 2026-08-27
- **Product recommendation:** sync selectively
- **Cycle status:** implementation in progress (Batches 01-06 complete; Batch 07 implementation in progress)
- **Execution authorization:** approved 2026-08-27 for the recorded `v0.5.1`
  target and all seven listed batches, including the conditional per-batch merge
  authority defined in [`README.md`](README.md)
- **Implementation started:** yes, 2026-08-27 (Batch 01)

The user approved this cycle on 2026-08-27 with scope limited to the recorded
`v0.4.0 -> v0.5.1` target and the seven batches in this ledger. The approval
includes the conditional batch merge authority defined in
[`README.md`](README.md), but does not authorize product expansion, publication,
or merging a `Version Packages` pull request.

## Review snapshot

- **BrowserRig review commit:** `f9c7008`
- **Shared source baseline:** upstream `v0.4.0` commit `0110939`
- **Upstream range:** `upstream/v0.4.0..upstream/v0.5.1`
- **Included releases:** `v0.4.1`, `v0.5.0`, and `v0.5.1`
- **Excluded releases:** later than `v0.5.1`
- **Range size:** 21 commits, 62 files, 2,967 additions, and 1,669 deletions
- **Direct-merge preview:** 28 content conflicts against the review commit

BrowserRig's package version was `0.3.0` at review time, but the fork's shared
source baseline is upstream `v0.4.0`. BrowserRig package versions and the
upstream sync cursor are independent.

## Product decision

**BrowserRig should adopt this range selectively rather than merge it
wholesale.**

The range primarily improves privacy, correctness, and continuity rather than
adding a headline workflow. It reduces sensitive form data in detailed
accessibility output, routes browser-context operations through the correct
session tab, survives transient and browser-start extension reconnects, makes
handoff and deletion lifecycle behavior calmer, replaces stale managed relays,
and repairs network-capture cleanup paths.

These outcomes reinforce BrowserRig's promise that an agent can operate the
user's real signed-in browser without repeatedly asking the user to repair the
driver between steps.

A whole-range merge is too risky. BrowserRig has independent active-tab
adoption, extension protocol `3`, Chrome Web Store identity, DSH integration,
target ownership, recording, issue reporting, and release automation. The
28-conflict preview touches core product surfaces and would mix useful upstream
behavior with identity and architecture changes that BrowserRig must preserve.

## Decision summary

### Adapt in this cycle

- Detailed ARIA snapshots omit text-control, custom value-control, rich
  editable, and related sensitive values.
- Playwright browser-context cookie and permission commands route through the
  correct session-owned target.
- Managed relay and TypeScript client lifecycle tolerate stale builds and short
  reconnect windows.
- The extension recovers after browser startup and relevant unpacked-extension
  connectivity failures, without replacing BrowserRig identity or protocol.
- Navigation-triggering handoff waits for the destination execution context.
- Session deletion becomes idempotent across CLI, MCP, relay client, and DSH
  semantics.
- Network-capture output and finalizer waiters settle once and do not retain
  stale waiters.
- Runtime and build dependencies receive a separate, final compatibility batch.

### Defer

- Upstream PR
  [`#60`](https://github.com/anomalyco/browser-control/pull/60) exposes safe
  Secret Profile status and credential-bearing worker execution through the
  public TypeScript SDK. BrowserRig already provides the underlying restricted
  profile behavior through CLI workflows. Defer the public SDK commitment until
  a concrete BrowserRig SDK consumer needs it.

### Skip

- Upstream PRs
  [`#44`](https://github.com/anomalyco/browser-control/pull/44) and
  [`#46`](https://github.com/anomalyco/browser-control/pull/46) form a temporary
  cross-host/WSL direction followed by a loopback-only correction. Preserve
  BrowserRig's local unauthenticated control boundary; there is no cross-host
  capability to port.
- Upstream release-only PRs
  [`#45`](https://github.com/anomalyco/browser-control/pull/45),
  [`#56`](https://github.com/anomalyco/browser-control/pull/56),
  [`#64`](https://github.com/anomalyco/browser-control/pull/64), and
  [`#66`](https://github.com/anomalyco/browser-control/pull/66) do not replace
  BrowserRig's Changesets, package versions, release workflows, or extension
  publication ownership.

## Batch ledger

Execution is strictly serial. A later batch must start from `main` after the
previous batch pull request merges.

| Order | Product outcome | Upstream evidence | State | Deterministic branch | BrowserRig PR | Independent review | Validation evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | ARIA value privacy | [#48](https://github.com/anomalyco/browser-control/pull/48), [#52](https://github.com/anomalyco/browser-control/pull/52), [#53](https://github.com/anomalyco/browser-control/pull/53) | `Complete` | `sync/upstream-v0.5.1-01-aria-privacy` | [#24](https://github.com/Castor6/BrowserRig/pull/24), merge `824815c` | `Approve` on 2026-08-27 at `4fc3fcb`; no findings | Typecheck, 514 tests, CLI build, `local-forms` smoke, and GitHub `validate` passed; see evidence below. |
| 02 | Browser-context CDP routing | [#49](https://github.com/anomalyco/browser-control/pull/49) | `Complete` | `sync/upstream-v0.5.1-02-context-routing` | [#27](https://github.com/Castor6/BrowserRig/pull/27), merge `72db822` | `Approve` on 2026-08-27 at `fba918d`; no findings | Typecheck, 520 tests, CLI build, six focused smoke cases, and GitHub `validate` passed; see evidence below. |
| 03 | Managed relay and client recovery | [#55](https://github.com/anomalyco/browser-control/pull/55), [#57](https://github.com/anomalyco/browser-control/pull/57) | `Complete` | `sync/upstream-v0.5.1-03-relay-client-recovery` | [#29](https://github.com/Castor6/BrowserRig/pull/29), merge `d6e5939` | `Approve` on 2026-08-27 at `53c4b94`; no findings | Typecheck, 529 tests, CLI build, DSH package checks, six focused smoke cases, and GitHub `validate` passed; see evidence below. |
| 04 | Extension connectivity and browser-start recovery | [#47](https://github.com/anomalyco/browser-control/pull/47), [#58](https://github.com/anomalyco/browser-control/pull/58) | `Complete` | `sync/upstream-v0.5.1-04-extension-recovery` | [#31](https://github.com/Castor6/BrowserRig/pull/31), merge `bf235f2` | `Approve` on 2026-08-28 at `a7aea52`; no findings, Brave reload waived for this batch | Typecheck, 536 tests, CLI and extension builds, extension release/package checks, eight focused smoke cases, and constrained Chrome live recovery passed; see evidence below. |
| 05 | Handoff readiness and idempotent deletion | [#59](https://github.com/anomalyco/browser-control/pull/59), [#61](https://github.com/anomalyco/browser-control/pull/61) | `Complete` | `sync/upstream-v0.5.1-05-handoff-session-delete` | [#33](https://github.com/Castor6/BrowserRig/pull/33), merge `e79f95e` | `Approve` on 2026-08-28 at `cbdc29e`; no findings | Follow-up typecheck, 548 tests, CLI build, and four focused smoke cases passed; see evidence below. |
| 06 | Network-capture lifecycle correctness | [#65](https://github.com/anomalyco/browser-control/pull/65) | `Complete` | `sync/upstream-v0.5.1-06-network-lifecycle` | [#35](https://github.com/Castor6/BrowserRig/pull/35), merge `2181194` | `Approve` on 2026-08-28 at `1206c82`; no findings | Typecheck, 552 tests, CLI build, six focused smoke cases, and GitHub `validate` passed at author implementation head; see evidence below. |
| 07 | Runtime and build dependency compatibility | [#54](https://github.com/anomalyco/browser-control/pull/54), [#62](https://github.com/anomalyco/browser-control/pull/62), [#63](https://github.com/anomalyco/browser-control/pull/63) | `Pending` | `sync/upstream-v0.5.1-07-dependencies` | — | — | — |
| — | Public Secret Profile SDK workers | [#60](https://github.com/anomalyco/browser-control/pull/60) | `Deferred` | — | — | — | Reconsider on concrete SDK demand. |
| — | Temporary cross-host direction | [#44](https://github.com/anomalyco/browser-control/pull/44), [#46](https://github.com/anomalyco/browser-control/pull/46) | `Skipped` | — | — | — | Preserve loopback-only boundary. |
| — | Upstream release mechanics | [#45](https://github.com/anomalyco/browser-control/pull/45), [#56](https://github.com/anomalyco/browser-control/pull/56), [#64](https://github.com/anomalyco/browser-control/pull/64), [#66](https://github.com/anomalyco/browser-control/pull/66) | `Skipped` | — | — | — | BrowserRig owns its versions and release pipeline. |

### Batch 01 implementation evidence

- **Implementation status:** author follow-up implementation and validation
  complete on `sync/upstream-v0.5.1-01-aria-privacy`; pull request
  [#24](https://github.com/Castor6/BrowserRig/pull/24) merged to `main` as
  `824815c` on 2026-08-27.
- **Upstream commits adapted:** `045805c`, `f625957`, and `4761e61`.
- **Changeset:** BrowserRig patch Changeset
  `.changeset/brave-owls-stop.md`.
- **Validation passed:** `pnpm typecheck`; `pnpm test --
  test/execute-ergonomics.test.ts test/runtime-diagnostics.test.ts` (Vitest ran
  all 59 files and 514 tests); `pnpm build:cli`; and
  `SMOKE_CASE=local-forms pnpm smoke` against the source relay and extension
  protocol `3`. The follow-up smoke regression proves a light-DOM text node
  assigned into a shadow-root contenteditable is present in raw Playwright ARIA
  output, omitted from guarded output, restored exactly afterward, and leaves
  the compact snapshot surface unchanged.
- **Smoke preflight history:** the first attempt reached no test because no
  relay was listening; the second reached no test because a bundled relay build
  did not match the source build. The source relay was then started in a
  controlled foreground PTY, the selected case passed, and the relay was
  stopped.
- **Not run in this batch:** the complete current smoke matrix. Batch 01 ran the
  directly relevant `local-forms` fixture; the cycle closure criteria retain the
  full-matrix requirement after all core and extension batches land.
- **Independent review:** the first review returned `Changes requested` because
  assigned-slot ancestry was missing from editable composed-tree traversal.
  After the author correction, the same independent reviewer returned `Approve`
  on 2026-08-27 for final head `4fc3fcb` with no findings. The reviewer reran
  typecheck, all 514 unit tests, diff checks, and independent Chrome CDP probes
  for privacy, raw restoration, compact snapshots, frame lifecycles, and
  concurrent callers; GitHub `validate` was also green.

### Batch 02 implementation evidence

- **Implementation status:** implementation and author validation complete on
  `sync/upstream-v0.5.1-02-context-routing`; pull request
  [#27](https://github.com/Castor6/BrowserRig/pull/27) merged to `main` as
  `72db822` on 2026-08-27.
- **Upstream commit adapted:** `f12441c` from upstream pull request
  [#49](https://github.com/anomalyco/browser-control/pull/49), manually fitted
  to BrowserRig's `browserRigSessionId` ownership, per-client visibility, root
  and child aliases, guardrails, and target-generation routing.
- **Changeset:** BrowserRig patch Changeset
  `.changeset/icy-cats-sleep.md`.
- **Validation passed:** `pnpm typecheck`; `pnpm test --
  test/cdp-router.test.ts test/relay-visibility-prune.test.ts` (Vitest ran all
  59 files and 520 tests); `pnpm build:cli`;
  `SMOKE_CASE=session-isolation,multi-client,stale-client-checkout,raw-first-checkout
  pnpm smoke`; and `SMOKE_CASE=oopif-reconnect,dedicated-worker pnpm smoke`
  against the source relay and extension protocol `3`. `termctrl` was not
  installed, so the source relay ran in a controlled foreground PTY and was
  stopped after validation. The selected smoke cases verify session visibility,
  concurrent named clients, raw/session checkout ordering, root-versus-child
  routing, OOPIF reconnect, and dedicated workers. GitHub `validate` also
  passed.
- **Live context API probe:** a named session with two pages successfully ran
  `context.cookies()` for a credential-free test origin without returning
  cookie contents. A permission probe reached the selected root but the current
  Brave `chrome.debugger` endpoint rejected `Browser.grantPermissions` as an
  unsupported CDP method (`-32601`), so it is retained as a browser capability
  risk rather than counted as passing permission smoke. Relay integration tests
  prove permission parameter forwarding and root selection independently.
- **Smoke retry history:** the first combined four-case run passed
  `stale-client-checkout`, `raw-first-checkout`, and `multi-client`, while
  `session-isolation` reported one temporary session still connected after its
  concurrent cleanup. The temporary session was deleted explicitly;
  `session-isolation` then passed alone, and the exact four-case selection
  passed 4/4 on a clean rerun with zero remaining targets and clients.
- **Not run in this batch:** the complete current smoke matrix. Batch 02 ran the
  six cases tied to visibility, alias, OOPIF, and worker routing; the cycle
  closure criteria retain the full-matrix requirement after all batches land.
- **Independent review:** `Approve` on 2026-08-27 for final implementation head
  `fba918d`, with no findings. The reviewer reran typecheck, all 520 unit tests,
  focused router and relay tests, diff and Changeset checks, and verified the
  green GitHub `validate`. It confirmed that the live
  `Browser.grantPermissions` rejection is a documented `chrome.debugger`
  transport-domain boundary rather than a root-selection defect; supporting
  that API would require a separately authorized extension or transport change.

### Batch 03 implementation evidence

- **Implementation status:** author implementation and validation complete on
  `sync/upstream-v0.5.1-03-relay-client-recovery`; pull request
  [#29](https://github.com/Castor6/BrowserRig/pull/29) merged to `main` as
  `d6e5939` on 2026-08-27.
- **Upstream commits adapted:** `2d05bbc` and `6994459` from upstream pull
  requests [#55](https://github.com/anomalyco/browser-control/pull/55) and
  [#57](https://github.com/anomalyco/browser-control/pull/57). BrowserRig keeps
  deterministic content-hash build ids: replacement ordering uses a higher
  stable package version or a newer artifact at the same resolved managed CLI
  path, while exact instance confirmation, foreground/source protection, and
  fail-closed behavior remain mandatory.
- **Changeset:** BrowserRig patch Changeset
  `.changeset/social-parts-chew.md`.
- **Validation passed:** `pnpm typecheck`; `pnpm test` (59 files and 529 tests);
  `pnpm build:cli`; focused relay lifecycle, HTTP, client, schema, and execute
  tests (6 files and 73 tests); and focused DSH adapter, package, and session-map
  tests (3 files and 21 tests). `pnpm package:npm` also rebuilt the CLI and
  extension and produced `artifacts/browserrig-0.3.0.tgz` with SHA-256
  `0dd15608c8dd37a1df6d59caf4cc798833e714b673af66a38ac6e28a5eca30dd`.
- **Real-process relay validation:** on isolated port `63553`, an older managed
  build at one resolved CLI path created session `batch03-retained`; the current
  package-local CLI confirmed the exact instance and newer same-path artifact,
  received the guarded shutdown acknowledgement, waited for the old foreground
  scope to exit, started build `build-7600e4ed7f99f328`, and restored the
  retained session from the durable catalog. A final guarded shutdown returned
  HTTP 200 and released the port. Test state was moved to the system Trash.
- **DSH package validation:** the exact tarball installed without peer warnings
  into clean official `web` and `headless` profiles under an isolated
  task-specific `DSH_HOME`, both with `auto-install-peers=false`. Both
  `--dump-config` outputs registered `browserrig/dsh`; both profiles imported
  the `browserrig/dsh` subpath and ran the package-local `dist/cli.js --help`
  without a global BrowserRig dependency. The isolated profiles were moved to
  the system Trash after validation.
- **Focused smoke:** the source relay used a controlled foreground PTY because
  `termctrl` was unavailable. `stale-client-checkout`, `reconnect-evaluate`,
  `redirect-reconnect-evaluate`, `execute-page-recovery`,
  `execute-page-detach-recovery`, and `session-isolation` each reported `PASS`
  (6/6), and the post-run relay check found zero targets, child targets, CDP
  clients, or transient sessions. The smoke runner did not self-exit after its
  final summary and was interrupted, so the wrapper process ended with status
  130 despite the complete passing case summary and clean resource check.
- **Not run in this batch:** the complete current smoke matrix. Batch 03 ran
  the six cases tied to reconnect, stale clients, page recovery, and session
  isolation; the cycle closure criteria retain the full-matrix requirement.
- **Independent review:** `Approve` on 2026-08-27 for final head `53c4b94`,
  with no findings. The reviewer reran typecheck, all 529 tests, focused relay
  and DSH tests, package and Changeset checks, cancellation and process probes,
  and confirmed the green GitHub `validate` and clean relay aftermath.
- **Closure risk:** the reviewer traced the smoke wrapper status 130 to an
  existing keep-alive socket in the redirect fixture after all selected cases
  passed and relay resources returned to zero. This does not block Batch 03,
  but the smoke runner must exit cleanly before the cycle-wide matrix can be
  recorded as green at closure.

### Batch 04 implementation evidence

- **Implementation status:** author implementation and available validation are
  complete on `sync/upstream-v0.5.1-04-extension-recovery`; pull request
  [#31](https://github.com/Castor6/BrowserRig/pull/31) merged to `main` as
  `bf235f2` on 2026-08-28 after the user waived the Batch 04 Brave reload
  check.
- **Upstream commits adapted:** `ba7f5b5` and `83904e5` from upstream pull
  requests [#47](https://github.com/anomalyco/browser-control/pull/47) and
  [#58](https://github.com/anomalyco/browser-control/pull/58). BrowserRig now
  completes extension readiness after debugger inventory, runs tab-group cleanup
  afterward, serializes current per-tab grouping intent, reports extension
  diagnostics, repairs Windows path-derived migration origins correctly, and
  registers a global `runtime.onStartup` activation. Active-tab presentation
  remains bound to the generation that selected the tab.
- **Boundaries preserved:** the BrowserRig manifest key and Store Item ID
  `dbobcmjamjdknplkplgdihdnmdjklpin`, extension protocol `3`, product and
  purple group identity, active-tab/no-click adoption, debugger-detach page
  status ownership, relay target ownership, exact extension versions, and
  release packaging remain BrowserRig-owned. Neither `extension/package.json`
  nor `extension/manifest.json` changed; the Store archive retains BrowserRig's
  public identity key by design.
- **Failure reproduction:** the pre-change focused baseline passed 36 tests.
  Five upstream-derived regressions then failed: browser-start activation and
  handshake helpers were absent, stale grouping could not roll back, and a
  suspended restored-tab `tabs.group` command kept relay status disconnected.
  The implemented tests now pass, including current-socket rollback, serialized
  group-to-ungroup ordering, relay readiness, extension log forwarding, and
  Windows UTF-16LE path hashing.
- **Changeset:** patch entries for both `browserrig-extension` and `browserrig`
  in `.changeset/hip-places-tie.md`.
- **Validation passed:** `pnpm typecheck`; `pnpm test` (59 files and 536 tests);
  the five focused extension/relay/package test files (43 tests);
  `pnpm build:cli`; `pnpm build:extension`; `pnpm check:extension-release
  --base origin/main`; and `pnpm package:extension`. The deterministic Store ZIP
  was `artifacts/browserrig-extension-0.1.1.zip`, SHA-256
  `5aa67c909dbdaf650f135e559de972b00edc5cc8f271da8fc6c1e348170a9c4f`.
  Its manifest still derives the BrowserRig Store ID, and the built background
  contains the global startup listener. GitHub `validate` passed at author head
  `c661492`.
- **Focused smoke:** `stale-client-checkout`, `raw-first-checkout`,
  `reconnect-evaluate`, `redirect-reconnect-evaluate`, `oopif-reconnect`,
  `dedicated-worker`, `session-isolation`, and `multi-client` passed 8/8 against
  the source relay with protocol `3`; every case returned targets, child
  targets, and CDP clients to zero. As in Batch 03, the runner did not self-exit
  after its complete summary and was interrupted, so the wrapper status was 130.
- **Live recovery evidence and limitation:** the host had no Brave installation
  or bundle in the running-app list, `/Applications`, user Applications, or
  Spotlight. The only available Chromium-family browser was Google Chrome 151,
  where the BrowserRig Store extension `0.1.1` was enabled with the correct Item
  ID. Toggling it off and on restored protocol-`3` connectivity. A named
  relay-owned session then survived an exact managed-relay shutdown and restart:
  the target ID and page DOM were re-announced and retained, while JavaScript
  `state` reset with the documented warning; `doctor` remained green. The test
  session and tab were deleted, the relay was stopped, and the extension stayed
  enabled. This validates the relay/re-announcement side but is not the required
  source `extension/dist` reload in Brave. On 2026-08-28, the user explicitly
  waived that browser-specific check for this Batch 04 pull request; the global
  repository rule remains unchanged for later extension shim work.
- **Not run in this batch:** the complete current smoke matrix. Batch 04 ran the
  eight startup/reconnect, visibility, worker, and multi-client cases tied to its
  paths; cycle closure retains the full-matrix requirement.
- **Independent review:** initially `Blocked` on 2026-08-28 at final author head
  `7eaba9c`, with no P0-P3 code findings. The reviewer independently verified
  the upstream behavior, product boundaries, both package Changesets, 536 tests,
  builds, Store archive, focused smoke evidence, and green GitHub `validate`.
  The sole blocker was the unpacked `extension/dist` reload in Brave; Chrome
  Store-build disable/enable was not equivalent evidence. The user explicitly
  waived that check for this batch on 2026-08-28. Follow-up review returned
  `Approve` for head `a7aea52` with no findings after confirming the waiver is
  scoped to this pull request and the global repository rule remains unchanged.

### Batch 05 implementation evidence

- **Implementation status:** author follow-up implementation and validation are
  complete after `Changes requested` on
  `sync/upstream-v0.5.1-05-handoff-session-delete`; pull request
  [#33](https://github.com/Castor6/BrowserRig/pull/33) merged to `main` as
  `e79f95e` on 2026-08-28. The initial implementation commit is `0de3f45`;
  the author follow-up is `cc403d9`.
- **Upstream commits adapted:** `3146cdc` and `2de472a` from upstream pull
  requests [#59](https://github.com/anomalyco/browser-control/pull/59) and
  [#61](https://github.com/anomalyco/browser-control/pull/61). A resolved
  navigation-triggering handoff now waits up to 15 seconds through only
  execution-context-destroyed or context-missing transitions while continuously
  binding the original `Page` and target generation before and after each
  readiness probe. Secondary-page handoffs probe that exact page; target
  replacement, detach, or crash fails closed instead of reacquiring or creating
  an unrelated session page. Deleting a resolved absent session id returns
  `{ deleted: false, id }` with HTTP 200, and CLI skips the session-list
  existence preflight. MCP explicit-id deletion retains that idempotent relay
  behavior. Omitted-id calls retain one stable current id and leave it in one
  stable unestablished state, while the optional-target MCP tool truthfully advertises
  `idempotentHint: false` because an intervening bare execute can atomically
  recreate the current session.
- **Boundaries preserved:** waiter registration still precedes the action, WAIT
  presentation must be acknowledged before `start`, human completion waits for
  the action to settle, exact handoff ids and registry targets remain required,
  replacement target generations rebind through the existing session path, and
  target cancellation still disconnects the sandbox before releasing the
  execute permit. Session deletion still acquires that permit, releases rather
  than closes adopted tabs, retains dead relay-target inventory grace, and
  propagates persistence, active-worker, ownership, endpoint, and all other
  non-absence failures. DSH mapping replacement remains limited to stable
  `session-not-found` results.
- **Failure reproduction and focused tests:** the pre-change focused baseline
  passed 8 files and 128 tests. After adding the upstream-derived regressions,
  105 of 109 tests passed and four failed as expected: handoff performed zero
  destination probes, absent HTTP delete returned 404, MCP deletion lacked the
  idempotent annotation, and CLI deletion still used the existence-preflight
  selector path. The implemented seven-file selection then passed 109/109,
  including RelayClient `{ deleted: false }` decoding, closing-manager failure,
  and DSH preservation of mappings on non-`session-not-found` errors.
- **Review follow-up reproduction and focused tests:** the two-file review
  selection initially passed 18 of 23 tests and failed the five new cases as
  expected: readiness probed the default page instead of a selected secondary
  page, replacement and detach did not produce the exact-page fail-closed
  diagnostic, MCP still advertised retry safety, and consecutive omitted-id
  deletes rotated targets. After the correction, the expanded focused
  lifecycle/MCP selection passed 24/24, and the broader eight-file selection
  passed 131/131. Added coverage also proves a crashed destination does not
  recover onto an unrelated page and explicit MCP ids stay scoped away from the
  current session.
- **Changeset:** BrowserRig patch Changeset
  `.changeset/flat-experts-call.md`.
- **Validation passed:** initial `pnpm typecheck`; `pnpm test` (59 files and 542
  tests); `pnpm build:cli`; and GitHub `validate` at `0de3f45`. The author
  follow-up reran `pnpm typecheck`, `pnpm test` (59 files and 548 tests), and
  `pnpm build:cli` successfully. A built-CLI probe on
  isolated port `63105` deleted the same absent explicit id twice with exit 0,
  while a call with no explicit or persisted selector exited 1. A built MCP
  protocol check before review confirmed the original annotation and motivated
  the correction; focused follow-up tests now require
  `destructiveHint: true`/`idempotentHint: false` semantics and stable repeated
  omitted-id targeting. The isolated relay was stopped and released its port.
- **Focused smoke:** against the controlled source relay and compatible Store
  extension `0.1.1` using protocol `3`, `reconnect-evaluate`,
  `redirect-reconnect-evaluate`, `session-missing-selector`,
  `execute-page-recovery`, `execute-page-detach-recovery`,
  `handoff-navigation`, `handoff-cross-tab`, `handoff-target-detach`, and
  `session-isolation` passed 9/9. Navigation handoff immediately captured a
  compact snapshot from the destination page. Every case returned targets,
  child targets, and CDP clients to zero. The known smoke keep-alive issue left
  the wrapper running after its complete summary, so it was interrupted and
  ended with status 130; the source relay was then stopped.
- **Follow-up smoke:** `handoff-navigation`, `handoff-cross-tab`,
  `handoff-target-detach`, and `session-isolation` passed 4/4 against the
  controlled source relay and compatible Store extension `0.1.1` using protocol
  `3`. Navigation handoff immediately used `page` and `snapshot()` on the
  destination, and every case returned targets, child targets, and CDP clients
  to zero. The known keep-alive issue again left the wrapper running after its
  complete summary, so it was interrupted with status 130; the relay was then
  stopped and the original two disconnected persisted sessions remained
  untouched.
- **Not run in this batch:** the complete current smoke matrix, retained for
  cycle closure. DSH build/pack and clean official `web`/`headless` profile
  installation were not required because neither the DSH adapter nor its output
  changed; the focused DSH tests passed within the focused and full suites.
  Extension build and unpacked-extension reload were not run because no
  extension source changed.
- **Independent review:** `Changes requested` on 2026-08-28. The handoff
  readiness probe must remain bound to the exact handoff `Page` and target
  generation instead of reacquiring the session default, including secondary
  pages, target-generation replacement, and detach/crash after resolution. The
  MCP `session_delete` annotation must reflect its optional current-session
  target, and repeated calls with an omitted id must retain one stable target
  and observable current-session state. After author follow-up `cc403d9`, the
  same independent reviewer returned `Approve` on 2026-08-28 for final head
  `cbdc29e` with no findings. The reviewer reran typecheck, all 548 tests,
  exact-page and generation probes, diff and Changeset checks, and confirmed
  the green GitHub `validate`.

### Batch 06 implementation evidence

- **Implementation status:** author implementation and validation are complete
  on `sync/upstream-v0.5.1-06-network-lifecycle`; pull request
  [#35](https://github.com/Castor6/BrowserRig/pull/35) merged to `main` as
  `2181194` on 2026-08-28. The recovery marker is `4fe2a96`, and the behavior
  implementation is `6e5cfe9`.
- **Upstream commit adapted:** `73beb8a` from upstream pull request
  [#65](https://github.com/anomalyco/browser-control/pull/65). BrowserRig ports
  only its two operational network-capture corrections: a successful execute
  settles capture output once, while error paths still settle before producing
  redacted diagnostics; and a settlement waiter removes itself immediately
  after success, timeout, or failure instead of remaining reachable until an
  unrelated finalizer eventually completes. The upstream extension, build,
  protocol, CLI, recording, session-manager, and target-registry refactors were
  intentionally not imported.
- **Boundaries preserved:** the persistent `ExecuteSandbox` remains the capture
  owner; exchanges remain normalized and HAR remains an export adapter. Per-body
  and aggregate retention limits, route-scoped stable `BROWSERRIG_SECRET_N`
  references, mode-`0600` lossless Secret Profiles, the `secrets run` boundary,
  cross-process profile locks, serialized recorder transitions, credential
  redaction, generation-based late-finalizer rejection, session execute permits,
  HTTP cancellation, journal ordering, and aftermath redaction are unchanged.
- **Failure reproduction and focused tests:** before the source correction, the
  three-file lifecycle selection ran 92 tests and reproduced both missing
  behaviors: successful execute called output settlement twice, and a finalizer
  blocked on request headers left one waiter retained after the five-second stop
  timeout. After the correction, the same 92 tests passed. The added probes also
  prove that a real settlement failure produces an error result, a timed-out
  finalizer cannot append into a later capture after its generation is discarded,
  and session deletion waits for network work under the execute permit before a
  queued stale network operation fails without reaching the closed sandbox.
- **Changeset:** BrowserRig patch Changeset
  `.changeset/fifty-aliens-knock.md`.
- **Validation passed:** `pnpm typecheck`; `pnpm test` (59 files and 552 tests);
  the focused network-capture, execute-lifecycle, and session-manager selection
  (3 files and 92 tests); `pnpm build:cli`; and GitHub `validate` at author
  implementation head `6e5cfe9`.
- **Focused smoke:** `network-capture`, `reconnect-evaluate`,
  `redirect-reconnect-evaluate`, `execute-page-recovery`,
  `execute-page-detach-recovery`, and `session-isolation` passed 6/6 against the
  controlled source relay and compatible Store extension `0.1.1` using protocol
  `3`. The network case retained its redacted artifact/profile assertions, and
  every case returned targets, child targets, and CDP clients to zero. The known
  smoke keep-alive issue left the wrapper running after its complete summary, so
  it was interrupted with status 130; the source relay was then stopped and the
  two pre-existing disconnected persisted sessions remained untouched.
- **Not run in this batch:** the complete current smoke matrix, retained for
  cycle closure. Extension build and unpacked-extension reload were not run
  because no extension source changed. DSH build/pack and clean official profile
  installation were not run because neither the DSH adapter nor its packaged
  output changed.
- **Independent review:** `Approve` on 2026-08-28 for final head `1206c82`,
  with no findings. The reviewer reran typecheck, all 552 tests, focused
  lifecycle tests, diff and Changeset checks, and independent error-order and
  64-waiter cancellation/generation probes; GitHub `validate` was green.

### Batch 07 dependency review baseline

Upstream pull requests [#54](https://github.com/anomalyco/browser-control/pull/54),
[#62](https://github.com/anomalyco/browser-control/pull/62), and
[#63](https://github.com/anomalyco/browser-control/pull/63), represented by
commits `7874e37`, `b26536f`, and `7f91927`, were reviewed file by file before
changing BrowserRig's dependency manifest or lockfile. The following matrix is
the pre-implementation disposition; exact compatible versions and validation
results are recorded in the completed Batch 07 evidence.

| Surface | BrowserRig baseline | Upstream `v0.5.1` | Disposition and compatibility boundary |
| --- | --- | --- | --- |
| Effect runtime | `effect`, `@effect/platform-node`, and `@effect/platform-node-shared` `4.0.0-beta.97`; optional public `effect` peer | `effect` and Node platform `4.0.0-rc.111` | `adopt`: keep the three BrowserRig build-time pins and optional public peer aligned, migrate only removed APIs, and retain Effect v4 / local `effect-smol` as the API source of truth. |
| Playwright | manifest `^1.57.0`, lock `1.61.1` | `^1.62.1`, lock `1.62.1` | `adopt`: retain stock `playwright-core`, CDP visibility, target ownership, and package externalization. |
| WebSocket | manifest `^8.18.3`, lock `8.21.0` | `^8.21.3`, lock `8.21.3` | `adopt`: retain the custom JSON-over-websocket relay protocol and externalized runtime package. |
| Parser | `acorn` `^8.17.0` / `8.17.0` | `^8.18.0` / `8.18.0` | `adopt`: preserve code-first execute parsing and guardrails. |
| Package manager | manifest and four workflows pin pnpm `11.18.0` | pnpm `11.20.0` | `adopt`: update every BrowserRig pin consistently and regenerate BrowserRig's own lockfile; never copy upstream's lockfile. |
| TypeScript and platform types | TypeScript `^5.9.3`; Chrome types `^0.1.33` / `0.1.43`; Node types `^25.0.3` / `25.9.4`; WS types `^8.18.1` | TypeScript `^7.0.2`; Chrome types `^0.2.7`; Node types `^26.2.0`; WS types unchanged | `adopt` the compiler, Chrome types, and Node types with only type-compatibility source changes; `already-covered` for WS types. Preserve public namespaces and protocol behavior. |
| Build tools | esbuild `^0.27.2` / `0.27.7`; tsx `^4.21.0` / `4.22.4`; Node target `node22` | esbuild `^0.28.2`; tsx `^4.23.12`; Node target `node22` | `adopt` esbuild and tsx; `already-covered` for the Node build target. Preserve executable Effect bundling, library Effect externalization, external Playwright/WS/parser packages, and bundled-license collection. |
| Test and release tools | Vitest `^4.1.9` / `4.1.9`; Changesets `^2.31.1`; fflate `^0.8.3` | Vitest `^4.1.11`; Changesets `^3.0.1`; fflate unchanged | `adopt` Vitest and Changesets after full suite/status checks; `already-covered` for fflate. Preserve BrowserRig release workflows and Trusted Publishing. |
| Node.js floor | package, CI, and release workflows require `>=22.22.0` / `22.22.0` | `>=22.19.0` | `skip`: BrowserRig's stronger floor remains unchanged; upstream's release-only minor classification does not apply. |
| BrowserRig-only DSH/runtime dependencies | Cordis/DSH peers, Schemastery, and packaging integration; `ioredis` satisfies the beta Node platform peer | not present upstream; RC Node platform replaces its Redis peer | `already-covered` for BrowserRig-owned DSH packages and Schemastery; remove only the obsolete beta-platform `ioredis` development peer after proving the RC bundle and licenses are complete. |
| Upstream identity and release metadata | BrowserRig package/extension versions, protocol `3`, Store ID, Changesets, OIDC Trusted Publishing, and DSH package identity | upstream package identity, exact versions, Store docs, and release metadata | `skip`: do not import any upstream identity, exact version, changelog, Store, or publication change. |

The clean baseline on Node `22.22.0` and the exact manifest pnpm `11.18.0`
passed frozen install, typecheck, all 59 files and 552 tests, CLI and extension
builds, and extension release validation. The baseline Store ZIP was
`browserrig-extension-0.1.1.zip` with SHA-256
`5aa67c909dbdaf650f135e559de972b00edc5cc8f271da8fc6c1e348170a9c4f`;
the baseline npm tarball was `browserrig-0.3.0.tgz` with SHA-256
`bfa7fd71dd7b3f096306bcb3230ece063e14c3c937077c8a8b9213410ef19f09`.
These establish a known-good comparison point; neither artifact is a release
candidate for publication.

## Batch briefs

### 01. ARIA value privacy

Port the privacy behavior and tests from upstream commits `045805c`, `f625957`,
and `4761e61`. Detailed `ariaSnapshot()` output must omit values from ordinary
text controls, custom ARIA value controls, rich editable content, and relevant
frame lifecycles, including concurrent callers through `connectOverCDP`.

Preserve BrowserRig's separate compact `snapshot()` surface and its existing
semantic budgets and reference rules. Validate with focused execution tests and
the relevant smoke fixture required by `AGENTS.md`.

### 02. Browser-context CDP routing

Adapt upstream commit `f12441c` inside BrowserRig's existing `CdpRouter` and
relay orchestration. Cookie, permission, and other browser-context commands must
route through the exact visible session-owned root.

Preserve per-client visibility, root-versus-child aliases, read-only guardrails,
and exact target ownership. Run the focused router, visibility, and relay tests
plus the smoke cases required by the touched paths.

### 03. Managed relay and client recovery

Adapt upstream commits `2d05bbc` and `6994459`. A guarded stale detached relay
may be replaced by the current managed CLI build, and the TypeScript client must
wait through a bounded transient extension reconnect while treating a session
as connected only with a live default page.

Preserve BrowserRig build IDs, relay instance and fault diagnostics, detached
relay ownership, session catalog durability, and DSH package-local invocation.
Validate relay lifecycle, client, HTTP, execute lifecycle, and packaged DSH
behavior affected by the implementation.

### 04. Extension connectivity and browser-start recovery

Use upstream commits `ba7f5b5` and `83904e5` as failure-case evidence. Reproduce
the relevant BrowserRig failures first and port only missing connectivity and
browser-start recovery behavior.

Do not import the upstream manifest key, Store origin, product name, tab-group
identity, protocol version, package version, or release packaging. Preserve
BrowserRig protocol `3`, active-tab attachment, extension-generation binding,
no-click adoption, Store identity, and release ownership. Extension behavior
requires Changesets for both `browserrig-extension` and `browserrig`, extension
build and focused tests, one unpacked-extension reload, and required smoke.

### 05. Handoff readiness and idempotent deletion

Adapt upstream commits `3146cdc` and `2de472a`. Navigation-triggering handoff
must wait for the destination execution context before returning. Repeating a
delete for an already absent session must reach the requested final state across
CLI, MCP, relay client, and DSH semantics.

Preserve waiter-before-action registration, WAIT presentation acknowledgement,
target-generation binding, cancellation ordering, execute permits, and adopted
tab safety. Validate handoff, HTTP, relay-client, MCP, CLI, DSH, and required
smoke behavior.

### 06. Network-capture lifecycle correctness

Port the behavioral corrections from upstream commit `73beb8a`, not its broad
refactor shape. Avoid a duplicate successful-output settlement and remove
timed-out finalizer waiters so repeated network-capture and teardown paths do
not retain stale work.

Preserve BrowserRig's bounded bodies, aggregate limits, stable secret
references, credential redaction, cross-process profile locks, and cancellation
semantics. Validate focused network-capture, execute lifecycle, and session
manager behavior before the relevant smoke cases.

### 07. Runtime and build dependency compatibility

Review upstream commits `7874e37`, `b26536f`, and `7f91927` only after all
behavior batches have landed. Upgrade Effect, Playwright, WebSocket, parser,
package-manager, TypeScript, build, and test dependencies only where compatible
with BrowserRig.

Do not downgrade BrowserRig's Node.js floor from `>=22.22.0` to upstream's
`>=22.19.0`, and do not copy the upstream lockfile. Run typecheck, unit tests,
CLI and extension builds, package and extension verification, and the exact
tarball installation checks in clean official DSH `web` and `headless`
profiles. Choose the BrowserRig Changeset from the actual published impact.

## Recovery procedure

A resumed coordinator must not search all repository pull requests first.

1. Read [`README.md`](README.md) and this ledger.
2. Select the first row that is not `Complete`, `Deferred`, or `Skipped`.
3. Check the exact deterministic remote branch in that row.
4. If absent, start the implementation agent for that batch.
5. If present, query only the pull request for that branch.
6. Resume the implementation agent, start a fresh independent review agent, or
   merge according to the structured evidence.
7. Update local `main` before selecting the next row.

## Closure criteria

The cycle may be archived and the cursor advanced to `v0.5.1` only when a fresh
closure audit agent confirms:

- `v0.5.1` is still the newest upstream `v0.5.x` patch, or later `v0.5.x`
  changes have been added and handled in this cycle;
- every upstream pull request in the final range has an explicit disposition;
- all adapted batches are `Complete` on `main` with merged BrowserRig pull
  requests, independent `Approve` verdicts, and validation evidence;
- deferred and skipped rows retain their product reasons;
- no implementation branch, draft, review finding, or pull request remains
  unresolved;
- cycle-wide validation required by `AGENTS.md`, including the current smoke
  set for these core and extension changes, is recorded as green.

The closure audit agent does not repeat code review. Missing or contradictory
evidence blocks closure and names the batch that needs a targeted review agent.

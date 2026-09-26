---
title: Upstream Sync v0.7.1 to v0.8.2
description: Authorized selective implementation and reviewed batch merges through v0.8.2.
status: active
upstream_from: v0.7.1
upstream_to: v0.8.2
target_checked: 2026-09-26
---

# Active cycle: `v0.7.1 -> v0.8.2`

## Authorization and completed cursor

On 2026-09-26 the user explicitly resumed the recorded unfinished sync:
“好的，继续同步上游，就是这些未完成的。” This authorizes implementation,
branches, commits, pushes, and pull requests for the three recorded batches.
The initial resumption did not authorize merging or publication. Later on
2026-09-26 the user explicitly authorized subsequent autonomous merges:
“后续你可以自行合并”. The coordinator may merge the recorded cycle's batch and
closure-documentation PRs after independent approval and passing required checks.
This does not authorize release PRs, npm publication, or Store submission.
PR #50's review waiver applies only to that historical pull request.

The completed cursor remains **v0.7.1** (`ebb37682f34771a5271f0c0c8305c1687ac4a601`).
BrowserRig PRs #48, #50, and #51 are merged; implementation starts from `fe151eb`.
No later cycle is active. A batch marked Complete in its approved PR takes
effect when that PR lands on main.

## Exact analyzed range

- From: `v0.7.1`, `ebb37682f34771a5271f0c0c8305c1687ac4a601`.
- To: `v0.8.2`, `868a8832e340cb4445da8fc555db57c16eeb6fa5`.
- Tag refresh: 2026-09-26; v0.8.2 remains the newest v0.8 patch.
- Eight reachable commits; implementation and review coverage are tracked by batch below.

| Upstream evidence | Proposed disposition | Preserved analysis and limits |
| --- | --- | --- |
| [#88](https://github.com/anomalyco/browser-control/pull/88), `3bb4e05b178e2b482877ab56297aa89fa6f72b91` | Already covered; skip unnecessary refactor | Independent review confirmed PR #50 already adopts the #87 ownership safety behavior. #88 only simplifies callers/proof; no remaining safety gap was found. |
| [#89](https://github.com/anomalyco/browser-control/pull/89), `b1410ca101094bd0fa3d756c98985ac73630e77b` | Selective adaptation | Compact snapshot semantics/search, plain-text contenteditable filling, filesystem compatibility, and ordinary MCP recording controls. Keep explicit snapshot diff/ref invalidation and native WebMCP; exclude demonstration/flight recording and relaxed raw-client routing. |
| [#90](https://github.com/anomalyco/browser-control/pull/90), `7cb2061a23a75cc24d44403ff367c010af2e80cd` | Skip | Upstream release metadata does not control BrowserRig versions or releases. |
| [#91](https://github.com/anomalyco/browser-control/pull/91), `8bb33c886bdf995f85c0c228e13c1019b32f22d7` | Adapt | Preserve unresponsive pages and repair over a fresh connection; improve selected-page diagnostics. Do not add implicit named-session creation during adoption. Review changes against BrowserRig's target identity and recovery guarantees. |
| [#92](https://github.com/anomalyco/browser-control/pull/92), `bbeca572c441b4c76017761f7cad28049499639e` | Skip | Release-only metadata. |
| [#93](https://github.com/anomalyco/browser-control/pull/93), `d2bed701751fd87d37960a571cabf204046e81c5` | Adapt regression evidence | Select hostile-page fixtures and tab-preservation invariants. Keep first-attempt results; do not restore timeout replay. |
| [#94](https://github.com/anomalyco/browser-control/pull/94), `9a5ab7b10a78cf4f5bd9b5ad8fd674685d171613` | Adapt | Track/hide protected extension frames and report the debugger block with safe human-action guidance. Includes protected-frame/password-manager compatibility deferred from v0.6.0. Preserve permissions and relay-owned presentation. |
| [#95](https://github.com/anomalyco/browser-control/pull/95), `868a8832e340cb4445da8fc555db57c16eeb6fa5` | Skip | Release-only metadata. |

## Serial batches

| Batch | Scope | Branch | State | BrowserRig PR / independent review / validation |
| --- | --- | --- | --- | --- |
| 01 | Snapshot semantics/search, plain-text contenteditable fill, and #88 reconciliation | `feat/upstream-v0.8.2-snapshot-input` | Complete | [PR #52](https://github.com/Castor6/BrowserRig/pull/52); independent Approve at `8f57e73`, CI passed; user authorized autonomous merges on 2026-09-26; effective on landing |
| 02 | Filesystem compatibility and ordinary MCP recording controls from #89 | `feat/upstream-v0.8.2-filesystem-recording` | Complete | [PR #53](https://github.com/Castor6/BrowserRig/pull/53); independent Approve at `7843610`, CI passed; effective on landing |
| 03 | #91/#94 page preservation and protected frames; selected #93 hostile-page regressions | `fix/upstream-v0.8.2-page-preservation` | Complete | [PR #54](https://github.com/Castor6/BrowserRig/pull/54); independent Approve at `b81d8d3`, CI passed; effective on landing |

## Preserved product exclusions

Apply the [Chrome-first compatibility policy](README.md#browser-compatibility-and-validation)
when this queue resumes. Chrome is the primary browser for smoke and extension
reload checks; no Brave installation, compatibility work, or separate test run
is required. Assess #91/#94 shared Chromium behavior for its Chrome benefit,
and record any Brave-only outcome as skipped unless explicitly requested.

Keep BrowserRig identity, extension permissions/protocol, DSH packaging and
release ownership. Keep native CDP WebMCP enabled by default; no experimental
environment switch, upstream page-JavaScript transport, or new WebMCP metadata.
Preserve session/target ownership, generation checks, adopted user tabs,
strict raw-client root ambiguity, explicit snapshot diffs/ref invalidation,
25 fps default recording and the viewport fit within 1280x720.

Exclude mandatory explicit relay restarts, runtime candidate installation,
unnecessary Effect cohort upgrades, persistent snapshot refs/automatic deltas,
human demonstration or flight recording, upstream names/paths, whole lockfile
imports, exact upstream versions, and release automation.

## Batch 01 evidence

- #88 (`3bb4e05b178e2b482877ab56297aa89fa6f72b91`): already covered by
  landed #87 debugger ownership checks. Its runtime diff only inlines the
  `getAttachedTabIds` wrapper; its proof change factors worker lookup and tab
  attachment. BrowserRig evidence: `extension/src/debugger-ownership.ts` and
  `test/extension-debugger-ownership.test.ts`. No demonstrated remaining safety need; skip the unnecessary refactor.
- #89 (`b1410ca101094bd0fa3d756c98985ac73630e77b`): adapt number/search input
  roles, native summary refs, visible portal/modal scope, alertdialog structure,
  bounded repeated-list reservation, bounded string/RegExp search with context,
  and plain-text contenteditable fill for both helpers. Preserve explicit diffs,
  ref invalidation, native WebMCP, raw-client routing, and existing read-only gates.
  Filesystem and ordinary MCP recording remain batch 02. Demonstration/flight
  recording and persistent refs/automatic deltas are excluded.
- Initial focused validation: `pnpm exec vitest run test/execute-ergonomics.test.ts`
  passed 32 tests. `pnpm exec tsx scripts/check-snapshot.ts` passed eight real-DOM
  cases in isolated Google Chrome 153.0.8010.53. No user profile or relay was used.
- Initial coherent implementation `c317e4b` was pushed and draft PR #52 opened
  immediately. Its CI [validate run](https://github.com/Castor6/BrowserRig/actions/runs/36213498485)
  passed. Independent review is pending; no review waiver or merge is claimed.
- `pnpm typecheck`, `pnpm test` (784 tests / 70 files), and `pnpm build:cli`
  passed. Unit evidence: `/tmp/browserrig-v082-unit-first.log`. Expanded
  `pnpm exec tsx scripts/check-snapshot.ts` passed ten cases in Google Chrome
  153.0.8010.53, including explicit diff/search rejection, search baseline/ref
  invalidation, navigation invalidation, plain-text editable events, unchanged
  focus, rejected non-editable targets, and Locator/string open-shadow targets.
  Evidence: `/tmp/browserrig-v082-chrome-expanded-first.log`.
- `scripts/smoke.ts` extends `execute-fill-helpers` to cover the single helper's
  contenteditable path. Its full-structure fixture now explicitly selects
  `within: "main"`: a single visible modal intentionally becomes the default
  snapshot root. `scripts/check-snapshot.ts` separately checks default portal
  scope, explicit main scope, non-modal surroundings, and hidden modals. The
  repository and installed OpenCode skill document this behavior and compare
  equal to built `node dist/cli.js skill` output.
- No extension source change or dependency/runtime cohort change was needed.
  No new Effect APIs were introduced. `termctrl` is unavailable on PATH and in
  the tool catalog; tracked task-owned processes replace it for validation.
- Full 23-case smoke first attempt: **0 passed / 23 failed**, all at page
  creation with `Target.createTarget: No current window`, before business
  checks. Isolated Chrome launched without an ordinary window. Original log:
  `/tmp/browserrig-v082-smoke23-first.log`; this result is never overwritten.
  The harness was corrected to create one initial `about:blank` default-window
  target through CDP before extension load. No timeout replay or product fix
  was used for this environment correction.
- Second full smoke run: **23 passed / 0 failed**, on the task-owned source relay at port
  21990 and isolated Chrome 153.0.8010.53. Only a temporary extension copy has
  its relay port changed; `Extensions.loadUnpacked` loads it with Chrome's
  `--enable-unsafe-extension-debugging`. The user's browser and port 19990
  are untouched. Evidence: `/tmp/browserrig-v082-smoke23-second.log`.

- Exact second-run command (all mandated cases, one attempt per case):

  ```bash
  BROWSERRIG_PORT=21990 BROWSERRIG_ENDPOINT=http://127.0.0.1:21990 SMOKE_CASE=local-forms,local-cart,local-checkout,reconnect-evaluate,redirect-reconnect-evaluate,session-missing-selector,execute-target-url,execute-page-recovery,execute-page-detach-recovery,execute-fill-helpers,execute-snapshot-refs,handoff-navigation,handoff-cross-tab,handoff-target-detach,oopif-reconnect,dedicated-worker,network-capture,session-download-capability,execute-ghost-cursor,session-isolation,multi-client,stale-client-checkout,raw-first-checkout pnpm smoke
  ```

- Task-owned relay PID 10469 and Chrome harness PID 10712 were stopped after
  validation. No ongoing relay/browser is required for review. Temporary logs
  and harness evidence remain under `/tmp/browserrig-v082-*`.
- Remaining gates: fresh independent review, final-head CI, and explicit user
  merge approval. Batches 02/03 remain unstarted; cursor advancement is blocked
  until the full cycle and its closure audit complete.

## Batch 01 independent review and corrections

The fresh independent review of `23baf146f718bf5976a435bfbb1518ddf8aa2b2c`
returned **Changes requested** on 2026-09-26, with two P2 findings:

1. Native summary refs used only their structural CSS selector; reordering two
   no-id details siblings could make the first ref open the second item.
2. Automatic modal scope considered only the dialog's own style; an opacity-zero
   ancestor could hide the dialog while its descendants still displaced main.

Correction commit: `2ad144c` (`fix: guard summary refs and hidden modal scope`).

The correction keeps the structural selector and intersects native summaries
with their captured, untruncated identity through a read-only action in the
existing ARIA selector engine. Native summary has no Playwright ARIA button
role, so the ordinary role/name intersection cannot resolve it. Capture and
matching share `src/snapshot-summary.ts`, including labels, image alt text, and
excluded hidden/native text-control descendants. No new selector registration
lifecycle is introduced: the sandbox already registers the ARIA engine for each
connected context before page/locator work, including `connectOverCDP` defaults.
The engine identifier lives in the existing session snapshot-ref registry,
not in each execute's helper closure, so a later execute retains the same
identity guard. Navigation/reset keeps the existing ref invalidation rules.

Modal/root visibility now checks rendered ancestry, including assigned slots
and shadow hosts. Chrome tests cover opacity-zero, hidden, and aria-hidden
parents, restoration to modal scope, and composed hidden ancestry. An additional
privacy fixture exposed pre-existing raw `summary.textContent` aggregation in
the details group label. The coordinator approved using the same safe summary
name reader there; other structural-name readers are unchanged.

Correction validation (Google Chrome 153.0.8010.53):

- `pnpm typecheck`, `pnpm test` (784 tests / 70 files), and `pnpm build:cli`
  passed. Final unit log: `/tmp/browserrig-v082-review-unit-final.log`.
- `pnpm exec tsx scripts/check-snapshot.ts`: 19 passed, including normal native
  and explicit-button clicks; reorder/insert failures; recreating helpers with
  the same registry; labelled/image identities; private descendants; hidden
  ancestors and restored scope. Log: `/tmp/browserrig-v082-review-chrome-final.log`.
- First targeted relay run with `SMOKE_CASE=local-forms,execute-snapshot-refs,reconnect-evaluate`
  passed 3/3 on task-owned port 21990. It includes the existing concurrent ARIA
  redaction/cleanup fixture. Log: `/tmp/browserrig-v082-review-smoke-first.log`.
- After strengthening the cross-execute registry regression, the final
  `SMOKE_CASE=execute-snapshot-refs` run passed 1/1. This checks a captured
  summary in a later execute, then repeats after `session reset` closes the
  sandbox and a fresh CDP connection/context is registered. Log:
  `/tmp/browserrig-v082-review-smoke-final.log`. Both runs used
  `BROWSERRIG_PORT=21990 BROWSERRIG_ENDPOINT=http://127.0.0.1:21990 pnpm smoke`.
- Earlier development probes are retained: a discarded separate-engine design
  failed because it registered after locator initialization
  (`/tmp/browserrig-v082-review-chrome-first.log`); the next probe identified the
  details-label privacy fixture (`/tmp/browserrig-v082-review-chrome-second.log`).
  These are not reported as passing validations.
- The earlier 23/23 smoke evidence remains historical to `23baf14`; this narrow
  correction was validated with the targeted cases above, not another full set.
  Fresh independent re-review and final-head CI remain required. Batch 01 is
  still Pending and no merge/publication has been authorized.

Task-owned correction relay PID 12958 and Chrome harness PID 12605 were stopped
after final validation; port 21990 is released.

### Focused visibility re-review correction

The fresh re-review of `c7f1b50ae84c1b33786fb282ca04e915b998a0ac` returned
**Changes requested** on 2026-09-26 for one P2: ancestor `visibility:hidden` or
`visibility:collapse` incorrectly suppressed a descendant that restored
`visibility:visible`, including an ARIA modal and native `dialog.showModal()`.
Reviewer reproduction: `/tmp/browserrig-rereview-visibility-minimal.mts` and
`.log`. The reviewer independently passed summary identity, cross-helper and
CDP default-context registration/reconnection, and ARIA masking. Prior-head CI
was successful; that does not substitute for final-delta review.

Correction commit `21b2fc9` checks the candidate element's computed visibility
(which includes inheritance and explicit overrides) and reserves the composed
ancestor loop for cumulative opacity/display and hidden/aria-hidden exclusions.
It changes no summary identity, ref lifetime, or value-masking mechanism.

Validation after this correction:

- `pnpm typecheck` and `pnpm build:cli` passed.
- `pnpm exec vitest run test/execute-ergonomics.test.ts`: 32/32 passed;
  `/tmp/browserrig-v082-visibility-unit.log`.
- `pnpm exec tsx scripts/check-snapshot.ts`: 24/24 passed in Google Chrome
  153.0.8010.53; `/tmp/browserrig-v082-visibility-final.log`. Five new cases cover
  ARIA and native modals under both hidden/collapse ancestors, successful ref
  clicks, omitted private values, ordinary restored descendants, inherited
  visibility remaining hidden, and opacity-zero ancestors remaining excluded.
  All prior summary identity/privacy and hidden-ancestor checks still pass.
- No full unit-suite or 23-case smoke rerun is claimed for this five-line
  visibility correction. Existing full-suite evidence remains recorded above.
  Chrome was isolated and closed by the check; no task relay was started.

### Independent approval and merge gate

On 2026-09-26 a fresh independent reviewer returned **Approve** for
`8f57e735583a220a6a90a20e346b84c9ce0a2938`. The reviewer checked the complete PR,
the scoped #88/#89 evidence, and the final `c7f1b50..8f57e73` correction. All
previous findings are closed; no new material finding remains.

The reviewer independently passed all 24 Chrome checks, 32 focused unit tests,
and the earlier ARIA/native-modal reproduction with corrected assertions.
[CI validate for the reviewed head](https://github.com/Castor6/BrowserRig/actions/runs/36214991775)
passed typecheck, the full unit suite, and builds. The full 23-case relay smoke
remains the historical run above; subsequent focused validation covers the
corrections without claiming a fresh full-set run.

The `browserrig: minor` Changeset and unchanged extension-source scope were
confirmed. Subsequent approval and authorization records change documentation
only. The user authorized autonomous reviewed merges on 2026-09-26, so batch 01
becomes Complete when PR #52 lands after its final checks. Batches 02/03 remain
unstarted and the completed cursor stays at v0.7.1. No publication is authorized.


## Batch 02 implementation evidence

- Selectively adapts #89 (`b1410ca101094bd0fa3d756c98985ac73630e77b`):
  `src/fs-durability.ts` and the `SessionCatalog.save` directory-sync fallback;
  ordinary MCP `recording_start`, `recording_stop`, `recording_status`, and
  `recording_cancel`. Invalid parameters produce recoverable Effect failures.
- Existing `src/relay-client.ts` recording methods, `src/relay-schema.ts` wire
  schemas, `src/http-api.ts` session target resolution, and
  `src/recording-relay.ts` already cover the recording backend. No backend,
  geometry, default frame rate, extension, dependency, or DSH change is needed.
- Upstream `relay-lifecycle-log.ts` has no BrowserRig counterpart. BrowserRig's
  `src/relay-log.ts` is bounded best-effort fault logging without directory
  fsync, so the upstream lifecycle-log fallback has no applicable failure here.
  Do not add the upstream lifecycle/restart mechanism for this batch.
- Human demonstration/flight recording, raw-client routing, persistent refs,
  automatic snapshot deltas, and WebMCP transport changes remain excluded.
- Initial focused tests: 45 passed across MCP and session catalog tests.
  The first development test found argument-parser throws escaping Effect's
  recoverable channel; parsing now uses `Effect.try`. The first typecheck
  identified widened mode literals; the request uses the existing wire type.
  Required full-suite/build and Chrome recording validation are recorded below.
- Batch stays Pending until fresh independent approval and required checks.


### Batch 02 validation and handoff

- First coherent implementation `f18207d` was pushed and draft PR #53 opened
  immediately. Its [CI validate](https://github.com/Castor6/BrowserRig/actions/runs/36215729586)
  passed. Includes a `browserrig: minor` Changeset generated with `pnpm changeset`.
- `pnpm typecheck`, `pnpm test` (808 tests / 70 files), and `pnpm build:cli`
  passed on that implementation. Logs: `/tmp/browserrig-v082-batch02-typecheck.log`,
  `/tmp/browserrig-v082-batch02-unit-first.log`, and
  `/tmp/browserrig-v082-batch02-build.log`.
- The first built-MCP/Chrome run passed lifecycle and media assertions, but
  showed a generic Effect argument-error message. The final correction preserves
  original validation messages through `Effect.try`'s explicit error mapper.
  Final `pnpm typecheck`, `pnpm build:cli`, and the 45 MCP/session-catalog tests
  passed (`/tmp/browserrig-v082-batch02-{typecheck,build,focused}-final.log`).
  The full 808-test result remains historical to the first implementation;
  final-head CI and independent review remain required.
- Both real MCP stdio runs used isolated Google Chrome 153.0.8010.53 and the
  task-owned relay on port 21990. Final run:
  `/tmp/browserrig-v082-batch02-mcp-recording-final.mjs`; log:
  `/tmp/browserrig-v082-batch02-mcp-final.log`. It verifies tool registration,
  missing-page failure, execute-established MCP-current session, relative paths,
  start/status/stop/cancel, explicit session selection, unrelated-session
  status/stop isolation, 30 fps option forwarding, cancelled artifact absence,
  and exact `frameRate must be at most 60` error text for rate 61.
- Final MP4 was decoded with ffmpeg and inspected with ffprobe: 756x412,
  25 fps, 38 frames, 1.520 seconds; receipt `screenshotFallback: false`.
  The extracted first frame shows the expected title and animated colored box.
  Artifact: `/tmp/browserrig-v082-batch02-artifacts-final/motion.mp4`.
  First-run evidence is retained separately in
  `/tmp/browserrig-v082-batch02-mcp-first.log` and its artifact directory.
- No extension source or package dependency changes. The isolated harness loads
  a temporary extension copy with port 21990; the user profile and port 19990
  are untouched. Tab-capture/audio and Windows are not live-tested in this
  batch; existing recording tests and injected filesystem failures cover the
  selected adapter/compatibility paths. No 23-case smoke rerun is claimed;
  cycle-wide smoke remains a closure requirement.
- Repository skill, installed OpenCode skill, and built `browserrig skill`
  compare equal. No domain-language change requires a CONTEXT.md edit.
- Task-owned relay PIDs 16473/16732 and Chrome harness PID 16475 were stopped;
  port 21990 is released. Review requires no running test process.
### Batch 02 independent approval

On 2026-09-26 a fresh independent reviewer returned **Approve** for
`784361065f0c8e2a68fa6785d28bb8e49b7ad0f6` after comparing the full PR with the
scoped upstream #89 code and tests. No material findings remain. The reviewer
independently passed 106 tests across MCP, session catalog, recording relay,
HTTP API, and relay client, and verified skill equality and the final media
with ffprobe. [Reviewed-head CI](https://github.com/Castor6/BrowserRig/actions/runs/36215918372)
passed typecheck, all 808 tests in 70 files, and builds.

The reviewer confirmed the minor Changeset, narrow directory-sync fallback,
shared RelayClient routing, and absence of extension/DSH/recording-core changes.
Windows and audio/tab-capture remain untested live; the reviewer inspected the
Chrome lifecycle evidence rather than rerunning it. Cycle-wide full smoke is
still required at closure. Under the recorded autonomous merge authorization,
batch 02 becomes Complete when PR #53 lands after its final checks. This record
changes documentation only; publication remains unauthorized.

## Batch 03 implementation evidence

- Adapts #91 (`8bb33c886bdf995f85c0c228e13c1019b32f22d7`): keep ordinary
  unresponsive relay-owned tabs, reconnect once to their exact target, name
  continued unresponsiveness, clarify resolved handoff context failures, and
  list ambiguous selected-page matches. Preserve BrowserRig's stricter exact
  handoff target checks and reject implicit named-session creation on adoption.
- Adapts #94 (`9a5ab7b10a78cf4f5bd9b5ad8fd674685d171613`): track and hide
  protected extension child frames, name actual debugger blocks, and preserve
  the page with human-action guidance. This includes the shared Chromium
  password-manager compatibility deferred from v0.6.0; no Brave-only work,
  extension permissions, protocol, or extension source change is required.
- #89 direct cross-extension diagnostics were already present; this batch adds
  the human-action warning and masked-failure attribution from final #94.
- #93 hostile fixtures and tab-preservation invariants are being selectively
  adapted; no wholesale gauntlet harness or timeout replay is imported.
- Initial focused validation passed 58 tests across lifecycle, target selection,
  protected-frame tracker, and relay frame routing. The initial typecheck found
  one missing import, corrected before the passing typecheck. Full-suite and
  browser evidence are pending. Batch remains Pending until independent review.

### Batch 03 regression and browser evidence

- First coherent commit `cb0a252` was pushed and draft PR #54 opened immediately.
  Initial full unit suite passed 827 tests in 72 files. Expanded unit suite
  passed 831 tests; a final close-during-replacement regression adds one more
  case. Final-head verification and review remain required.
- #93 selected `heavy-spa-slow-context` and `typing-freezes-page` fixtures run in
  `scripts/check-page-preservation.ts`, asserting exact target/tab/owner identity,
  no replacement warning, eventual readability, partial input preservation, and
  adopted-tab survival after deletion. Chrome 153.0.8010.53 passed all three
  cases (owned SPA, adopted SPA, typing freeze):
  `/tmp/browserrig-v082-batch03-hostile-third.log`. Chrome recovered the SPA
  before the follow-up probe; unit tests independently force failed health
  checks and fresh-connection recovery. No live forced-repair success is claimed.
- Hostile first attempt failed request validation because the test omitted the
  required `createIfMissing`; second attempt incorrectly demanded an adopted
  failure even though the page was already healthy. The final fixture accepts
  success or the correct bounded diagnosis; product behavior was not changed
  to satisfy that assertion. First/second logs remain under the same prefix.
- Existing handoff-navigation/cross-tab/target-detach and OOPIF smoke cases cover
  the relevant #93 auth-redirect and cross-origin routing invariants. Its payment
  model's rejection of autofill and sentinel forced-click strategy are site/agent
  behavior, outside this driver correction. Its expected-failure generic stalled
  read naming and implicit named-session adoption are excluded. No complete
  upstream gauntlet, telemetry, or timeout replay is imported.
- Real extra-extension iframe validation reproduced Chrome's cross-extension
  rejection, named `target/cross-extension-page`, exposed `protectedUi`, and hid
  the phantom child. Browser CDP independently confirmed the original physical
  target, URL and title survived while Chrome set `attached: false`. The first
  run failed its assumption that dismissal alone restores automation. Chrome
  requires explicit reattachment in this fixture. Second/third test attempts
  used `browser.close()` in user code to refresh the client; that existing path
  triggers the page-close listener and clears the default reference, so their
  subsequent read saw blank. This is not the new repair path, which clears
  listeners first; no fix to user-code `browser.close()` semantics is claimed.
- Final supported recovery uses exact-target activation, active adoption, reset
  of that adopted session (release only), and active re-adoption. Original target
  identity and document readability pass, without extension permission changes.
  Evidence: `/tmp/browserrig-v082-batch03-protected-fourth.log`; prior first,
  second and third logs remain. The test-only inspector and isolated browser
  harness are reproducible with `scripts/page-preservation-browser.mjs`.
- Late health results and close completion cannot erase a replacement session
  page. Late debugger success/error cannot clear/set protection on a newer root.
  The initial generation fixture accidentally held page-status initialization's
  Runtime.evaluate; its debug log identifies the cause. Restricting the held
  command to the fixture expression makes all four relay cases pass. This was
  a test fixture correction, with no product timeout replay.

### Batch 03 final validation and review handoff

- Final behavior from `14adb55` passed the **first complete 23-case smoke run:
  23 passed / 0 failed**, with one attempt per case. Log:
  `/tmp/browserrig-v082-batch03-smoke23-first.log`. Exact command:

  ```sh
  BROWSERRIG_PORT=21990 BROWSERRIG_ENDPOINT=http://127.0.0.1:21990 SMOKE_CASE=local-forms,local-cart,local-checkout,reconnect-evaluate,redirect-reconnect-evaluate,session-missing-selector,execute-target-url,execute-page-recovery,execute-page-detach-recovery,execute-fill-helpers,execute-snapshot-refs,handoff-navigation,handoff-cross-tab,handoff-target-detach,oopif-reconnect,dedicated-worker,network-capture,session-download-capability,execute-ghost-cursor,session-isolation,multi-client,stale-client-checkout,raw-first-checkout pnpm smoke
  ```

- The run uses task-owned source relay port 21990 and isolated Google Chrome
  153.0.8010.53 through the committed test harness. Neither port 19990 nor the
  user's profile was touched. The final relay PID 25786 and browser harness
  PID 25743 were stopped after validation; earlier task browser/relay processes
  were also stopped. `termctrl` is unavailable, so tracked process sessions were
  used. No extension source/build or reload requirement was introduced.
- Final typecheck and full unit suite pass (833 tests / 72 files), including an
  additional resolved-handoff destination diagnostic assertion. Logs:
  `/tmp/browserrig-v082-batch03-typecheck-complete.log` and
  `/tmp/browserrig-v082-batch03-unit-complete.log`. Final CLI build passes:
  `/tmp/browserrig-v082-batch03-build-skill-final.log`. Repository skill,
  installed OpenCode skill, and built `node dist/cli.js skill` output match.
- Implementation validation before the last test/documentation-only
  additions also passed on GitHub:
  [CI run 36217162144](https://github.com/Castor6/BrowserRig/actions/runs/36217162144).
  This is not independent review or a claim about a later head's CI.
- `browserrig: patch` Changeset was generated with `pnpm changeset`. Test-only
  extension fixture files are outside the extension package and npm file list;
  the shipping extension and its permissions/protocol/versions are unchanged.
- Batch 03 remains Pending for fresh independent review and final-head CI.
  No merge, release, npm publication, Store submission, or cursor advancement is
  claimed by this implementation handoff. No batch beyond v0.8.2 was started.

### Batch 03 independent-review correction: recovered crash documents

- Independent review of `12b9878` requested changes for one P1: main-document
  navigation cleared the registry crash state but left the sandbox's crash
  marker set. A recovered HTTP form could consequently be closed when the old
  Playwright Page still rejected evaluates as crashed. Reviewer evidence remains
  in `/tmp/browserrig-review-crash-navigation-http.mts` and its `.log` (and the
  initial data-URL variant); the earlier green suite did not cover this boundary.
- Correction `2a59f50` synchronously reports current-root main-document navigation
  to the live session sandbox with exact target matching. It clears crash
  classification while retaining the health check, allowing the existing fresh
  connection repair to re-resolve the same physical tab. A document generation
  counter also prevents close after a navigation during the probe, including a
  same-URL reload. There is no delayed session-id-only callback or timeout replay.
- Unit regressions cover navigation before execute, same-URL reload, navigation
  during a probe, unaffected replacement/detach races, true unrecovered crash
  recreation, and never closing unhealthy adopted tabs (including crashed ones).
  Focused first run passed 135 tests; final full suite passed **837 / 72 files**
  (`/tmp/browserrig-v082-p1-full-final.log`). Typecheck and CLI build pass in
  `/tmp/browserrig-v082-p1-typecheck-final.log` and
  `/tmp/browserrig-v082-p1-build.log`. Repository, installed, and built skills
  still match; no agent workflow, shipping extension, permission, or version
  change was needed for this correction.
- `scripts/check-crash-navigation.ts` reproduces the review scenario through the
  real relay and Chrome 153.0.8010.53. Independent CDP writes `saved-user-state`
  into the recovered form before the follow-up execute. Both different-URL
  navigation and same-URL reload preserve the original physical target/tab and
  input, and report fresh connection repair. Evidence:
  `/tmp/browserrig-v082-p1-real-second.log` (targets `8B4D8629A3976E15541F71D7EBAAB26E`
  and `1C5D2ACF3A69AC1F7BE1B8E95F309AEE`, tabs 1853146857 and 1853146859).
  The first run had already preserved the form/tab but failed the test's final
  warning-text assertion (`connection` versus the actual `reconnected`); its log
  is retained at `/tmp/browserrig-v082-p1-real-first.log`. The initial new-script
  typecheck required an explicit local URL annotation; that failed output is
  retained at `/tmp/browserrig-v082-p1-typecheck.log`.
- The complete mandated 23-case smoke command above was rerun against correction
  `2a59f50`: **23 passed / 0 failed** on its first complete attempt, with one run
  per case (`/tmp/browserrig-v082-p1-smoke23-first.log`). This supersedes the
  pre-review smoke result for final-behavior validation. Task-owned Chrome
  harness PID 28475 and relay PID 28494 were stopped afterward; ports 21990 and
  21992 were released. The implementation handoff did not merge or release.

### Batch 03 independent approval

On 2026-09-26 a fresh independent reviewer returned **Approve** for
`b81d8d3f8c69b77d38827b0f1c1115e190b9bb6b` after reviewing the complete PR against
`b280aaf` and upstream #91/#93/#94. The original P1 is closed; no new material
finding remains. Exact target/session ownership, adopted tabs, handoffs,
document-generation guards, and execute-permit boundaries remain intact.

The reviewer independently passed 158 focused tests, typecheck, and skill
equality. In isolated Chrome 153.0.8010.53, both different-URL and same-URL crash
recovery passed on the first run with the physical target/tab and saved input
preserved. The real protected-extension fixture also passed on the first run:
named diagnostic, no phantom frame, and explicit re-adoption of the same target.
Logs: `/tmp/browserrig-rereview-final-{crash,protected,chrome,typecheck}.log`.
The reviewer's owned processes were stopped and ports 21990/21992 released.

[Reviewed-head CI](https://github.com/Castor6/BrowserRig/actions/runs/36218042817)
passed. The reviewer verified final 837-test and corrected 23/23 smoke evidence
without claiming a second independent full smoke run. The BrowserRig patch
Changeset is correct; the fixture extension does not ship. Chrome's protected
frame attachment revocation remains an explicit-recovery limitation, not an
automatic-recovery promise. Under the recorded merge authorization, batch 03
becomes Complete when PR #54 lands after final checks. This approval record
changes documentation only. Closure audit and cursor advancement remain next;
no package publication is authorized.

---
title: Upstream Sync v0.6.0 to v0.7.1
description: Approved browser evidence and debugger safety intake, frozen for implementation after v0.6.0 finalization.
status: awaiting-independent-review
upstream_from: v0.6.0
upstream_to: v0.7.1
target_checked: 2026-09-25
---

# Upstream Sync: `v0.6.0 -> v0.7.1`

## Authorization and starting gate

On 2026-09-25 the user approved six outcome groups through upstream `v0.8.2`:

1. Preserve unresponsive pages and handle password-manager permission boundaries.
2. Preserve active browser connections, verify debugger ownership, and bound page reads.
3. Maintain session/target identity and report reconciliation and durability failures.
4. Improve compact snapshot semantics/search and support plain-text contenteditable filling.
5. Correct recording geometry, expose capture quality, add screenshot comparisons,
   and expose ordinary recording controls through MCP.
6. Improve filesystem compatibility and add hostile-page regressions without
   hiding first-attempt smoke failures.

The user separately approved default-on native WebMCP discovery without an
experimental environment switch. That companion remains visible below.
After reviewing PR #46, the user explicitly approved its merge and continuing
subsequent sync work on 2026-09-25. This authorizes implementation of the selected
outcomes here, but does not authorize merging later PRs or publishing packages.

The previous cycle is [archived](archive/2026-09-25_upstream-v0.5.1-to-v0.6.0.md):
PR #46 merged as `fc420d614375f24d0ff3948fc8919e4153277679`, and the fresh
independent closure audit returned `Complete` on 2026-09-25. This is the sole
prepared active cycle. **Start implementation only after the v0.6.0
documentation finalization PR merges.** Resolve its merged `origin/main` as the
implementation base and record that exact commit in the batch evidence. The
latest main at preparation is `c3a6b3db83786609a6df5f2f2061d4067cd5a9dd`,
including the completed WebMCP companion.

## Frozen upstream range

- Completed cursor: `v0.6.0` (`e0f6176a42ad807bf31e1e8237b8bdff85787cda`).
- Target: `v0.7.1` (`ebb37682f34771a5271f0c0c8305c1687ac4a601`).
- Tags refreshed on 2026-09-25; `v0.7.1` is the newest v0.7 patch.
- The range contains exactly five commits, listed below.
- Recheck the latest v0.7 patch at closure. Do not include later-minor work.
- Upstream #88 (`3bb4e05`) is **after v0.7.1** and belongs only to the
  `v0.7.1 -> v0.8.2` cycle. Its earlier placement in this queue was a factual
  error, corrected during v0.6.0 finalization.

## Batch ledger

| Order | Outcome | State | Branch | BrowserRig PR | Independent review | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Recording and screenshot evidence, debugger ownership, bounded title reads, image labels, and honest first-attempt smoke results | Pending | `feat/upstream-v0.7.1-browser-evidence` | [#50](https://github.com/Castor6/BrowserRig/pull/50) (draft) | Changes requested (P2 PNG preflight); fixed in `d4c7432`, awaiting fresh review | [Batch 01 validation](#batch-01-validation) |

The implementation agent must read the complete upstream diffs and tests,
confirm existing coverage, and adapt the selected outcomes to BrowserRig's
architecture. Report any material scope or behavior conflict before expanding
this batch. The starting gate was satisfied by PR #49; implementation base is
`fb8781ae4197bdb5e5e39d1ffa7bfba00ec859fa` on clean `main`.

### Batch 01 implementation evidence

Complete diffs and tests for #73, #79, and #87 were reviewed. Selected adaptation:

- #73: CSS backing-surface normalization and viewport crop before the existing
  1280×720 fit; JPEG100; shared quality receipts and JSON presentation;
  bounded explicit PNG `screenshotDiff` on the selected execution page.
  Preserve 25 fps default and existing explicit-rate behavior. Upstream native
  output size, 60 fps default/ceiling, and strict frame-rate policy are not adopted.
- #79: remove smoke timeout replay and unreachable expected-failure verdicts;
  preserve first results. Existing `src/mcp.ts` registers tools without an eager
  relay layer and ensures readiness per operational call. Unrelated runtime,
  shutdown, network-copy, redaction, and release changes remain excluded.
- #87: prove extension debugger ownership for inventory/grouping, bound selected
  page title reads to five seconds, and include visible descendant image alt
  labels. Retain rc.111 dependencies and existing package identity/permissions.
- #88 and later ranges remain outside this implementation.

Initial working-tree checks: typecheck passed after adding the three scoped PNG
packages. First full unit run: 719 passed / 14 failed, all in existing execute
fixtures missing the new title method. Corrected those fixtures and added
selected-page media/title lifecycle regressions: 735 tests in 69 files passed.
CLI and extension builds passed. Browser validation and exact commit evidence
will be recorded before review. No full smoke or independent approval claimed.

## Batch 01 validation

Implementation base: `fb8781ae4197bdb5e5e39d1ffa7bfba00ec859fa` (PR #49 merged).
First coherent implementation: `1196c14`; draft PR #50 opened immediately after
that commit. Browser regression fixtures: `6f99789b4f8fb7533fd36f9de7bfb4dc9dbd1397`.
Final behavioral correction: `90e2e94` (actual JPEG input geometry). Later evidence
commits change only this ledger / PR metadata. Independent review remains pending;
implementation authorization does not authorize merge or publication.

### Required checks and ordinary browser coverage

- At `6f99789`: `pnpm typecheck`, `pnpm test` (735 tests / 69 files),
  `pnpm build:cli`, and `pnpm build:extension` passed. Built CLI `skill` output,
  repository skill, and `~/.config/opencode/skills/browserrig/skill.md` compared
  equal. Bundled Pixelmatch and PNGJS licenses are present in `dist/licenses/`.
- At `90e2e94`: `pnpm typecheck`, `pnpm test` (740 tests / 70 files), and
  `pnpm build:cli` passed after the recording correction. Extension code is
  unchanged from the successful `6f99789` build and reload.
- CI passed for [1196c14](https://github.com/Castor6/BrowserRig/actions/runs/36117530460),
  [6f99789](https://github.com/Castor6/BrowserRig/actions/runs/36118187336), and
  [90e2e94](https://github.com/Castor6/BrowserRig/actions/runs/36119079338).
- Full mandatory smoke command at `6f99789`, **first attempt: 23 passed, 0 failed**.
  Source relay at `21990`, `BROWSERRIG_ENDPOINT=http://127.0.0.1:21990`, official
  isolated Brave 1.96.59 / Chromium 154.0.8037.58, copied current extension.
  Command: `SMOKE_CASE=local-forms,local-cart,local-checkout,reconnect-evaluate,redirect-reconnect-evaluate,session-missing-selector,execute-target-url,execute-page-recovery,execute-page-detach-recovery,execute-fill-helpers,execute-snapshot-refs,handoff-navigation,handoff-cross-tab,handoff-target-detach,oopif-reconnect,dedicated-worker,network-capture,session-download-capability,execute-ghost-cursor,session-isolation,multi-client,stale-client-checkout,raw-first-checkout pnpm smoke`.
  Log: `/tmp/browserrig-v071-brave/full23-first.log`. No timeout replay.
  The later recording-only fix does not reclassify this as a new 23-case run.
- Opt-in `execute-browser-evidence` at `6f99789` passed through Brave/extension:
  960×640 equal PNGs changed 0 pixels; button color change changed 3,580 pixels;
  visible image alt text was included and hidden image text was excluded.
  Log: `/tmp/browserrig-v071-brave/focused-smoke-first.log`. The initial selector
  also named nonexistent `recording-cdp`, so this log proves only the one listed
  case. Separately, `SMOKE_CASE=recording-logical-session pnpm smoke` passed on
  `6f99789`; `/tmp/browserrig-v071-brave/recording-smoke-first.log`.

### Brave reload and debugger ownership

Official arm64 asset: `brave-v1.96.59-darwin-arm64.zip`, SHA256
`cfdd7c171613afd1a4dde15ddb577222c24325ad7044292ea150823c8e3aaa3b`, verified
against the release checksum. App/profile/extension copies live only under
`/tmp/browserrig-v071-brave/`; no user tabs were used. `termctrl` was unavailable;
task-owned process groups and explicit PID tracking were used instead.

Initial reload validation exposed two setup limitations, retained rather than
silently retried: Sparkle's update-permission prompt blocked headless startup
(`hang.sample` proves `SUUpdatePermissionPrompt`), resolved with the official
`--disable-brave-update` process flag; the fresh profile disabled the reloaded
unpacked extension as `unsupportedDeveloperExtension`, resolved by enabling
that profile's developer mode. The test then used `chrome.developerPrivate.reload`
on BrowserRig, confirmed ENABLED with no runtime errors, and regained relay
readiness. No WebMCP feature flags or product defaults were changed.

At source `6f99789`, a second synthetic extension independently attached one tab;
BrowserRig attached another. Global `chrome.debugger.getTargets().attached`
included both. After restarting only the task relay, BrowserRig announced only
its owned tab (717260036), excluding the foreign tab (717260037). Both fixture
tabs were closed. Proof: `ownership.json`, `ownership-reconnect.log`, and
`reload-before-reconnect.log` under `/tmp/browserrig-v071-brave/`.

### Recording geometry, first failure, and correction

The initial `scripts/check-recording-geometry.ts` tree committed as `6f99789`
passed direct Chromium 147 + real ffmpeg with DPR 2 and an odd 2560×1273 backing
surface. 1280×720 and 1920×1080 CSS viewports both encoded 1280×720 at 25 fps;
changed-pixel ratios versus CSS reference were 0.0010753 and 0.0002300.
This establishes geometry/fidelity for a static fixture, not distinct motion.

Additional live Brave evidence on `6f99789` found an actual encoder-input bug:
a 756×419 JPEG in a Matroska track declaring output 1280×720 was misclassified
by ffmpeg as one interlaced field (`No JPEG data found in image`). The same JPEG
decoded successfully on its own. Original failure: `live-evidence-corrected.log`;
frame signatures, raw synthetic JPEG, the minimal Matroska reproducer, and decoder
logs are retained in `/tmp/browserrig-v071-brave/`. The ad-hoc harness initially
used unsupported `session new/delete --json` flags; that separate harness error
is retained in `live-evidence-first.log` and was corrected before recording.

`90e2e94` reads bounded JPEG SOF metadata without decoding pixels and writes the
actual first-frame dimensions in the Matroska input header. Output fit/rate and
timestamp transport remain unchanged. Five parser tests cover baseline/progressive
SOF, metadata/padding, and malformed/zero/truncated headers. The geometry script
now includes a 756×419 source below the 1280×720 emulated viewport: it must decode,
preserve source pixels, and pad missing pixels without inventing whole-viewport
fidelity. That fixture's 0.65552 whole-image difference is expected missing-source
area, explicitly not a fidelity pass.

At `90e2e94`, all three geometry cases passed with the real cached Chromium 147
and ffmpeg:

```bash
pnpm exec tsx scripts/check-recording-geometry.ts --browser '/Users/castor/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' --out /tmp/browserrig-v071-geometry-90e2e94
```

Log: `/tmp/browserrig-v071-geometry-90e2e94.log`. All outputs remain 1280×720,
25 fps, zero dropped frames, no screenshot fallback; both complete-surface
fidelity ratios remain 0.0010753 / 0.0002300.

Live Brave at `90e2e94` used a 640×360 CSS viewport fitting its actual 756×419
headless surface (an attempted oversized physical window was rejected by Chrome's
visible-screen bound). JSON start/status/stop and sidecar counters agreed:
87 received frames, 37 retained, 50 coalesced, 0 dropped, no screenshot fallback;
ffprobe confirms 640×360 / 25 fps / 3.36 seconds. Equal screenshot diff changed
0 pixels; a quadrant color change changed 48,684 pixels (0.2113021).
`live-frame.png` and `diff.png` were visually inspected: all four quadrants and
text fill the expected frame, and only the intended quadrant is highlighted.
Proof: `/tmp/browserrig-v071-brave/live-evidence.json`, `live-fitting-90e2e94.log`,
`live.mp4`, `live.mp4.json`, `before.png`, `same.png`, and `diff.png`.
Counters establish receipt consistency, not guaranteed distinct-motion rate.

### Independent review and PNG preflight correction

The first independent review of `96841b9` returned **Changes requested** with one
P2 finding. Scope and BrowserRig boundaries matched; 110 focused tests and an
independent three-case recording-geometry run passed, including visual inspection.
The reviewer reproduced an oversized PNG accepted through duplicate IHDR chunks:
first IHDR 1×1, later IHDR 4097×4096 (16,781,312 pixels, above the 16,777,216 cap).
The prior preflight inspected only the first header while PNGJS decoded the last.
No approval is claimed from those otherwise successful checks.

Correction `d4c7432754ae12697e54881b76cd173df4591205` was developed against the
installed PNGJS 7 parser, synchronous reader and synchronous inflate pipeline.
PNGJS reads chunk types as uint32 values, advances by chunk length plus 12 bytes,
and replaces metadata on every IHDR before decompressing IDAT. BrowserRig now
walks the entire chunk structure with those same boundaries before invoking
`PNG.sync.read`: exactly one initial 13-byte IHDR, bounded dimensions, legal chunk
type bytes, a consecutive IDAT sequence, and complete empty terminal IEND with
no trailing bytes. It rejects duplicate IHDR even after IDAT. Chunk payload text
containing `IHDR` is not interpreted as a header. PNGJS retains its CRC, color-mode
and image-data validation; the preflight does not import private parser APIs.
The same preflight protects both the supplied baseline and captured PNG.

Red/green evidence:

- Before changing production code, the two new oversized duplicate-IHDR tests
  (before / after IDAT) failed because the unsafe decoder was reached. A decoder
  spy deliberately throws before allocating the claimed pixels. A separate tiny,
  fully decodable duplicate-header fixture confirms PNGJS's last-header behavior.
  Log: `/tmp/browserrig-v071-review-red.log` (2 failed / 12 passed).
- After the correction, all 26 screenshot tests passed. Regressions assert no
  decoder or page screenshot call for the malformed oversized baseline, no
  second decoder call for a malformed captured PNG, rejection of truncated or
  nonterminal chunks, and support for valid interlaced, 16-bit, palette/transparent,
  ancillary and split-IDAT PNGs. Log: `/tmp/browserrig-v071-review-green.log`.
- `d4c7432`: `pnpm typecheck`, `pnpm test` (755 tests / 70 files),
  `pnpm build:cli`, and `git diff --check` passed. Full suite log:
  `/tmp/browserrig-v071-review-full.log`.
- `d4c7432`: isolated Brave / source relay at 21990 passed the first targeted
  `BROWSERRIG_ENDPOINT=http://127.0.0.1:21990 SMOKE_CASE=execute-browser-evidence pnpm smoke`.
  Equal 960×640 PNGs changed 0 pixels; the intended color change changed 3,580.
  Log: `/tmp/browserrig-v071-review-browser.log`. No extension, recording,
  permissions, native WebMCP, version or Changeset scope changed. The historical
  23-case result remains attributed to `6f99789`; it was not needlessly repeated.

The task browser/relay were stopped after this targeted check. The existing
minor/patch Changeset covers the corrected unreleased capability. A fresh
independent reviewer must assess the fix before any merge approval request.

### Delivery boundaries

Changeset `.changeset/tiny-waves-begin.md` was generated with `pnpm changeset`:
`browserrig` minor / `browserrig-extension` patch. No exact version edits,
permission changes, DSH changes, upstream identity, #88 work, merge, or publication.
Final cleanup stops only the task-owned relay/browser/processes; local evidence
artifacts are retained for review. Native WebMCP remained default-on; these tests
do not claim native tool invocation coverage. Batch state stays Pending until
fresh independent approval and explicitly approved merge.

## Complete upstream disposition ledger

| Upstream evidence | Disposition | Selected outcome and boundary |
| --- | --- | --- |
| [#73](https://github.com/anomalyco/browser-control/pull/73), `a2e5bc95445fba4b1255d0020010809ffaf6634d` | Adapt in batch 01 | Correct recording geometry, expose capture quality receipts, and add `screenshotDiff`. Preserve the existing constant 25 fps output and viewport fitted within 1280 × 720. |
| [#74](https://github.com/anomalyco/browser-control/pull/74), `cb5e014b8b2e7f8b9b69c521c73802f5dfffe058` | Skipped | Release-only metadata; upstream exact versions and release ownership do not control BrowserRig. |
| [#79](https://github.com/anomalyco/browser-control/pull/79), `6785d65153e2b5e3f59c7a51b26c5014e3ca35c0` | Adapt in batch 01; partially covered/deferred | Remove automatic timeout replay from the smoke harness so the first attempt remains the result. Lazy MCP initialization is already covered by BrowserRig's shared detached relay lifecycle. Defer unrelated copy and redaction refactors because they do not serve the selected outcomes. |
| [#87](https://github.com/anomalyco/browser-control/pull/87), `1cdd1e4c697197440ee9a7a9cdbf337d9e7a9f51` | Adapt in batch 01; dependency pin already covered | Verify debugger ownership, bound title reads, and preserve useful image alt labels. Keep the coherent rc.111 Effect and Node platform cohort; do not import a dependency change merely to match upstream. |
| [#80](https://github.com/anomalyco/browser-control/pull/80), `ebb37682f34771a5271f0c0c8305c1687ac4a601` | Skipped | Release-only metadata; BrowserRig versions remain Changesets-owned. |

## Product boundaries and validation

Preserve BrowserRig identity, extension protocol and permissions, DSH packaging,
release ownership, native WebMCP, session ownership, and generation checks.
Keep explicit snapshot diffs and reference invalidation, strict raw-client
multiple-root routing, and existing automatic managed-relay replacement policy.
Mandatory explicit restarts, runtime candidate installation, persistent snapshot
refs or automatic deltas, relaxed raw routing, human demonstration recording,
flight recording, and changes to default recording resolution or frame rate
remain excluded. Never import upstream package names, paths, exact versions,
release automation, or lockfiles wholesale.

Run typecheck, the required unit tests, CLI build, and focused browser cases for
the implemented behavior. Run the full 23-case command in `AGENTS.md` before
claiming the current smoke set is green; retain first-attempt failures and
attribute every result to its exact commit. Extension source changes require
an extension build, both package Changesets, and the required Brave reload;
report environmental limitations accurately. Update the agent workflow and
installed skill together if behavior affects agent usage. Add the appropriate
Changeset for shipped behavior, without choosing an exact release version.
Obtain fresh independent review and green required checks before requesting
explicit approval to merge the concrete implementation PR.

## Independent default-on WebMCP companion

[#48](https://github.com/Castor6/BrowserRig/pull/48), branch
`feat/default-on-webmcp`, is independent of this cycle and **Complete**. The
user explicitly approved its merge on 2026-09-25; it landed at 09:06:21 UTC as
`c3a6b3db83786609a6df5f2f2061d4067cd5a9dd`. It retains native CDP transport, opaque handles,
ownership, read-only enforcement, bounded output, cancellation, and handoff.
No upstream page-JavaScript WebMCP implementation or new tool metadata is
selected.

A fresh independent review approved
`f55d52b03b260ab8ce97ec81e51c5e32363f1f11` on 2026-09-25 after independently
passing 188 focused tests. CI
[36115703594](https://github.com/Castor6/BrowserRig/actions/runs/36115703594)
passed 707 unit tests and required checks. The later `b2b15cc` changed only
review documentation; its final CI
[36116304426](https://github.com/Castor6/BrowserRig/actions/runs/36116304426)
also succeeded before merge. The companion was never an unresolved v0.6.0
cycle batch. Full package, DSH, ordinary smoke, and unsupported-native-browser
evidence is retained in the previous cycle archive. No native invocation smoke
pass is claimed.

## Approved later queue: `v0.7.1 -> v0.8.2`

After this cycle closes, check the newest v0.8 patch and create its active
record. Consider #88 (`3bb4e05`) ownership checks in that range. Split #89
(`b1410ca`) into snapshot semantics/search, plain-text contenteditable filling,
filesystem compatibility, and ordinary MCP recording controls. Adapt #91
(`8bb33c8`) page preservation and selected-page diagnostics without implicit
named-session creation on adoption. Adapt #94 (`9a5ab7b`) protected-frame
tracking and safe human-action diagnostics, including the protected-frame work
deferred from v0.6.0. Select #93 (`d2bed70`) hostile-page fixtures and invariants
as regression evidence. Keep the scope exclusions above; skip release-only
#90, #92, and #95. None of this later range is part of the current batch.

## Closure gate

Refresh target tags, finalize all five dispositions, verify each adapted batch
landed with independent approval and required validation, and obtain a fresh
closure audit. Only then archive this record and advance the cursor. The
companion and later queue must remain visible until resolved.

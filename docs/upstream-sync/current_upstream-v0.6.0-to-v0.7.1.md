---
title: Upstream Sync v0.6.0 to v0.7.1
description: Approved browser evidence and debugger safety intake, frozen for implementation after v0.6.0 finalization.
status: approved-awaiting-finalization-merge
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
| 01 | Recording and screenshot evidence, debugger ownership, bounded title reads, image labels, and honest first-attempt smoke results | Pending | `feat/upstream-v0.7.1-browser-evidence` | Not opened | Not started | Not run |

The implementation agent must read the complete upstream diffs and tests,
confirm existing coverage, and adapt the selected outcomes to BrowserRig's
architecture. Report any material scope or behavior conflict before expanding
this batch. No code change is part of this documentation finalization.

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

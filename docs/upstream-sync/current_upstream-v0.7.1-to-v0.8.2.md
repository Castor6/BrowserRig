---
title: Upstream Sync v0.7.1 to v0.8.2
description: Authorized selective implementation with independent review and separate merge approval.
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
It does not authorize merging or publication. Obtain explicit merge approval
after independent review and passing checks. PR #50's review waiver applies
only to that historical pull request.

The completed cursor remains **v0.7.1** (`ebb37682f34771a5271f0c0c8305c1687ac4a601`).
BrowserRig PRs #48, #50, and #51 are merged; implementation starts from `fe151eb`.
No later cycle is active. All batch states remain Pending until reviewed and landed.

## Exact analyzed range

- From: `v0.7.1`, `ebb37682f34771a5271f0c0c8305c1687ac4a601`.
- To: `v0.8.2`, `868a8832e340cb4445da8fc555db57c16eeb6fa5`.
- Tag refresh: 2026-09-26; v0.8.2 remains the newest v0.8 patch.
- Eight reachable commits; no claim of implementation or final code review.

| Upstream evidence | Proposed disposition | Preserved analysis and limits |
| --- | --- | --- |
| [#88](https://github.com/anomalyco/browser-control/pull/88), `3bb4e05b178e2b482877ab56297aa89fa6f72b91` | Compare for already-covered behavior; adapt only a remaining safety need | Simplifies debugger ownership callers/proof. PR #50 already adopts #87 ownership checks; do not import a refactor without a demonstrated benefit. This commit is after v0.7.1. |
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
| 01 | Snapshot semantics/search, plain-text contenteditable fill, and #88 reconciliation | `feat/upstream-v0.8.2-snapshot-input` | Pending | Implementation started; review and validation pending |
| 02 | Filesystem compatibility and ordinary MCP recording controls from #89 | `feat/upstream-v0.8.2-filesystem-recording` | Pending | Not started |
| 03 | #91/#94 page preservation and protected frames; selected #93 hostile-page regressions | `fix/upstream-v0.8.2-page-preservation` | Pending | Not started |

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
  attachment. No demonstrated remaining safety need; skip the unnecessary refactor.
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
- Full unit, typecheck, build, expanded browser validation, and independent review
  are pending. No full smoke-set success is claimed.

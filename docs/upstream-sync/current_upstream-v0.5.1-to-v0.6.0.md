---
title: Upstream Sync v0.5.1 to v0.6.0
description: Approved implementation scope, upstream dispositions, and review evidence for the next BrowserRig intake cycle.
status: implementing
upstream_from: v0.5.1
upstream_to: v0.6.0
target_checked: 2026-09-25
---

# Upstream Sync: `v0.5.1 -> v0.6.0`

## Authorization and scope

On 2026-09-25 the user approved implementation of the six recommended outcome
groups from the review through upstream `v0.8.2`:

1. Preserve unresponsive pages and handle password-manager permission boundaries.
2. Preserve active browser connections, verify debugger ownership, and bound page reads.
3. Maintain session/target identity and report reconciliation and durability failures.
4. Improve compact snapshot semantics/search and support plain-text contenteditable filling.
5. Correct recording geometry, expose capture quality, add screenshot comparisons,
   and expose ordinary recording controls through MCP.
6. Improve filesystem compatibility and add hostile-page regressions without
   hiding first-attempt smoke failures.

The user additionally requested native WebMCP discovery to be enabled by default,
without an experimental environment-variable switch. This is the only authorized
WebMCP product change: retain native CDP transport, opaque handles, ownership,
read-only enforcement, bounded output, cancellation, and handoff behavior. Do not
import upstream's page-JavaScript implementation or add new tool metadata.

The prior recommendation excluded mandatory explicit relay restarts, persistent
snapshot refs/automatic deltas, relaxed raw-client multiple-root routing, human
demonstration recording, flight recording, and changes to default recording
resolution/frame rate. Those exclusions remain in force. Preserve BrowserRig
identity, extension protocol/permissions, DSH packaging, and release ownership.

**Implementation is approved. Merge and publication are not approved.** Prepare
concrete pull requests with independent review and validation before requesting
merge approval. Never record approval on the user's behalf. `Complete` means the
reviewed implementation has actually landed on `main`.

## Frozen review snapshot

- BrowserRig starting commit: `061fa30d9fc361885a4e9601966ba6e2a76ca929`.
- Completed upstream cursor: `v0.5.1` (`bbd92a766de038d50691bb9180d66a74c9f011db`).
- Active target: `v0.6.0` (`e0f6176a42ad807bf31e1e8237b8bdff85787cda`).
- Latest published release at approval: `v0.8.2` (`868a8832e340cb4445da8fc555db57c16eeb6fa5`),
  also the upstream main tip; checked 2026-09-25.
- Follow-on targets: `v0.7.1`, then `v0.8.2`, checked again at each cycle boundary.
- No whole-range merge or upstream lockfile import is authorized.

## Active batch ledger

| Order | Outcome | State | Branch | BrowserRig PR | Independent review | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Runtime, session, target, and connection safety from v0.6.0 | Pending | `fix/upstream-v0.6.0-runtime-safety` | Pending | Pending | Pending |

### Batch 01: runtime and target safety

Read the complete upstream changes and relevant tests before adapting these
behaviors to the existing architecture:

- Reject competing browser/profile connections while preserving a live active
  extension connection; retain bounded liveness recovery and useful diagnostics.
- Clean up cancelled websocket liveness probes.
- Bind asynchronous default-target updates to the exact session instance so an
  old sandbox cannot overwrite a replacement session with the same id.
- Preserve the entire staged child-target subtree across root replacement.
- Propagate directory synchronization failures instead of treating readable
  bytes after rename as proof of durability.
- Route named browser-context operations through healthy owned roots; preserve
  the existing exactly-one-visible-root rule for raw clients.
- Propagate exhausted target probes and malformed committed-root information
  through readiness; failed reconciliation must not report a ready extension.
- Keep delayed Runtime recovery, selected-page handoff readiness, aliases, and
  accepted-work shutdown settlement bound to their original ownership/generation.
  Preserve existing guarantees where already covered and record exact evidence.

Do not change the automatic managed-relay replacement policy. Adapt required
drain guarantees within that policy without importing the explicit restart CLI,
candidate installer, or upstream runtime/release automation. Do not upgrade the
already coherent Effect dependency cohort just to match upstream.

Required validation: typecheck, unit tests, CLI build, focused lifecycle/CDP
smokes, and the full smoke set before claiming cycle-wide browser validation.
Extension changes additionally require the extension build, both package
Changesets, and a Brave reload. Report environmental blockers accurately.

## Upstream dispositions

| Evidence | Disposition | Reason / implementation scope |
| --- | --- | --- |
| [6bda258](https://github.com/anomalyco/browser-control/commit/6bda258) | Adapt in batch 01; partially covered/deferred | Connection contention and liveness need adaptation. CLI boolean defaults are already explicit. Complete protected-frame handling is scheduled with #94 in the v0.8.2 cycle to avoid implementing an intermediate recovery policy. |
| [#69](https://github.com/anomalyco/browser-control/pull/69), `bb6b3d2` | Adapt safety corrections; defer product-policy changes | Session identity, nested targets, durability, generation-bound recovery, handoff selection, and drain behavior belong in batch 01. Mandatory explicit restart and runtime candidate installation are outside the approved scope. |
| [#70](https://github.com/anomalyco/browser-control/pull/70), `9c5b377` | Adapt in batch 01 | Healthy named roots and fail-closed reconciliation; keep raw-client ambiguity strict. |
| [#71](https://github.com/anomalyco/browser-control/pull/71), `26dd2d5` | Already covered | Effect and both Node platform packages are precisely pinned to rc.111; executables bundle their runtime. Preserve BrowserRig's existing package and DSH validation rather than import upstream release infrastructure. |
| [#68](https://github.com/anomalyco/browser-control/pull/68), `e0f6176` | Skip | Upstream release metadata does not control BrowserRig's versions or release workflow. |

## Approved follow-on implementation queue

This queue records the user's complete request without advancing the cursor or
starting a later cycle prematurely. A new active record must be created after
each preceding cycle closes.

- **Independent companion:** default-on WebMCP, branch
  `feat/default-on-webmcp`. Remove the environment switch and agent-facing opt-in
  requirement across CLI, MCP, DSH, SDK, tests, documentation, and installed skill.
  Keep the native implementation and graceful unsupported-browser behavior.
- **v0.6.0 -> v0.7.1:** adapt #87 (`1cdd1e4`) debugger ownership, bounded title
  reads, and image labels; include #88 (`3bb4e05`) where necessary for ownership
  checks. Adapt #73 (`a2e5bc9`) recording geometry, quality receipts, and
  `screenshotDiff`, preserving the existing 25 fps / bounded viewport defaults.
  For #79 (`6785d65`), lazy MCP initialization is covered; remove timeout replay
  from the smoke harness, and defer unrelated copy/redaction refactors. Skip
  release-only #74 and #80.
- **v0.7.1 -> v0.8.2:** split #89 (`b1410ca`) into snapshot semantics/search,
  plain-text contenteditable filling, filesystem compatibility, and MCP ordinary
  recording controls. Retain explicit snapshot diff/ref invalidation, strict raw
  CDP routing, and native WebMCP. Adapt #91 (`8bb33c8`) page preservation and
  selected-page diagnostics, without adding implicit named-session creation on
  adoption. Adapt #94 (`9a5ab7b`) protected frame tracking and safe human-action
  diagnostics. Select #93 (`d2bed70`) hostile-page fixtures and invariants as
  regression evidence. Defer demonstration/flight recording; skip release-only
  #90, #92, and #95.

## Closure

Before advancing to `v0.6.0`, recheck the newest v0.6.x tag, record every final
disposition, obtain independent review, run required validation, obtain explicit
merge approval, and verify the implementation landed. Archive only after the
independent closure audit succeeds. Companion and follow-on work must remain
visible until completed; this record does not claim the whole request is done.

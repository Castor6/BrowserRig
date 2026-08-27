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
- **Cycle status:** implementation in progress (Batch 01)
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
| 01 | ARIA value privacy | [#48](https://github.com/anomalyco/browser-control/pull/48), [#52](https://github.com/anomalyco/browser-control/pull/52), [#53](https://github.com/anomalyco/browser-control/pull/53) | `Pending` | `sync/upstream-v0.5.1-01-aria-privacy` | — | — | — |
| 02 | Browser-context CDP routing | [#49](https://github.com/anomalyco/browser-control/pull/49) | `Pending` | `sync/upstream-v0.5.1-02-context-routing` | — | — | — |
| 03 | Managed relay and client recovery | [#55](https://github.com/anomalyco/browser-control/pull/55), [#57](https://github.com/anomalyco/browser-control/pull/57) | `Pending` | `sync/upstream-v0.5.1-03-relay-client-recovery` | — | — | — |
| 04 | Extension connectivity and browser-start recovery | [#47](https://github.com/anomalyco/browser-control/pull/47), [#58](https://github.com/anomalyco/browser-control/pull/58) | `Pending` | `sync/upstream-v0.5.1-04-extension-recovery` | — | — | — |
| 05 | Handoff readiness and idempotent deletion | [#59](https://github.com/anomalyco/browser-control/pull/59), [#61](https://github.com/anomalyco/browser-control/pull/61) | `Pending` | `sync/upstream-v0.5.1-05-handoff-session-delete` | — | — | — |
| 06 | Network-capture lifecycle correctness | [#65](https://github.com/anomalyco/browser-control/pull/65) | `Pending` | `sync/upstream-v0.5.1-06-network-lifecycle` | — | — | — |
| 07 | Runtime and build dependency compatibility | [#54](https://github.com/anomalyco/browser-control/pull/54), [#62](https://github.com/anomalyco/browser-control/pull/62), [#63](https://github.com/anomalyco/browser-control/pull/63) | `Pending` | `sync/upstream-v0.5.1-07-dependencies` | — | — | — |
| — | Public Secret Profile SDK workers | [#60](https://github.com/anomalyco/browser-control/pull/60) | `Deferred` | — | — | — | Reconsider on concrete SDK demand. |
| — | Temporary cross-host direction | [#44](https://github.com/anomalyco/browser-control/pull/44), [#46](https://github.com/anomalyco/browser-control/pull/46) | `Skipped` | — | — | — | Preserve loopback-only boundary. |
| — | Upstream release mechanics | [#45](https://github.com/anomalyco/browser-control/pull/45), [#56](https://github.com/anomalyco/browser-control/pull/56), [#64](https://github.com/anomalyco/browser-control/pull/64), [#66](https://github.com/anomalyco/browser-control/pull/66) | `Skipped` | — | — | — | BrowserRig owns its versions and release pipeline. |

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

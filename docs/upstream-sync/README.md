---
title: Upstream Sync
description: Product-led rules, execution controls, and history for selectively adopting upstream browser-control releases.
---

# Upstream Sync

BrowserRig is an independent fork of
[`@opencode-ai/browser-control`](https://github.com/anomalyco/browser-control).
Upstream intake exists to carry useful safety, reliability, and compatibility
work into BrowserRig. It does not exist to keep the repositories identical.

This directory is the durable control plane for an upstream sync cycle. A
coordinator must read this file and the active cycle record before inspecting
branches or starting an agent.

## Current state

- **Latest completed upstream sync:** `v0.4.0` (bootstrap source baseline;
  predates this archive process)
- **Active cycle:** [`v0.4.0 -> v0.5.1`](current_upstream-v0.4.0-to-v0.5.1.md)
- **Active cycle status:** blocked at Batch 04; Brave unpacked-extension reload
  required
- **BrowserRig package version:** independent from the upstream sync cursor

"Completed through `vX.Y.Z`" means every upstream pull request reachable in
the reviewed range has a recorded outcome: adapted and landed, already covered,
deferred with a reason, or skipped with a reason. It does not claim byte-for-byte
source equivalence or assign the same version to BrowserRig.

## Version rule

Start from the exact latest completed upstream tag. The next target is the
latest patch tag in the immediately following minor series.

For example, if the completed cursor is `v0.4.0` and the newest tag in the next
minor series is `v0.5.1`, review `v0.4.0..v0.5.1`. This includes later patches
on the source line, such as `v0.4.1`, because they are reachable before the
target.

At the beginning of a cycle:

1. Fetch upstream tags into a namespace so BrowserRig tags cannot collide:

   ```bash
   git fetch upstream 'refs/tags/*:refs/tags/upstream/*'
   ```

2. Resolve the newest patch in the next minor series.
3. Record the exact target tag and check date in the active cycle.
4. Freeze implementation work to that recorded target.

Before closing the cycle, fetch tags and check the target again. If a newer
patch appeared in the target minor series, the closure audit blocks advancement
until those additional pull requests are reviewed and added to the same cycle.

Do not jump over a minor series. Do not advance the completed cursor because a
review started, a subset landed, or upstream published a newer release.

## Product decision gate

The coordinator first produces a product-level recommendation. It explains:

- the user problem each upstream outcome solves;
- the safety, privacy, reliability, and compatibility value;
- the BrowserRig behavior at risk during adoption;
- which outcomes should be adapted, deferred, or skipped;
- the proposed serial implementation batches.

The user decides whether the cycle is worth executing. No implementation
branch may start while the active record says authorization is pending.

Approval must be explicit and scoped to the target and listed batches. Text
written by an agent cannot authorize itself. The approved cycle record must
retain the approval date and scope.

## Intake method

The default unit of evidence is an upstream pull request, not a whole-release
Git merge. For every pull request in the version range:

1. Understand the problem, behavior, implementation, tests, and release impact.
2. Classify it as adapt, already covered, defer, or skip.
3. Use the upstream diff and tests as evidence.
4. Implement the selected behavior in BrowserRig's current architecture.
5. Cite the upstream pull request and commit in the BrowserRig pull request.

Manual adaptation is the default. Cherry-pick only a small, isolated commit
whose package identity, architecture, tests, and release ownership do not
conflict with BrowserRig. A whole-range merge is exceptional and requires a
new product and technical decision.

Never import upstream branding, package or executable names, environment
variables, local-state paths, skill paths, extension identity, Store listing,
exact versions, or release automation as part of behavior intake.

## Serial execution model

One coordinator owns a cycle. Implementation is deliberately serial and uses
child agents in the coordinator's shared checkout rather than parallel
worktrees.

Only one child agent may be active on the checkout at a time. While a child is
active, the coordinator may wait and exchange messages but must not edit files,
switch branches, stage changes, commit, or run Git commands in that checkout.

Each batch follows this sequence:

1. The coordinator reads the active record and selects the first incomplete
   batch.
2. A fresh implementation agent receives only `AGENTS.md`, this policy, the
   active batch, the named upstream pull requests, and the current source.
3. The implementation agent creates the deterministic branch, studies the
   upstream code, adapts the behavior, tests it, updates the batch row, pushes,
   and opens a pull request.
4. The coordinator waits; it does not perform code review.
5. A separate fresh review agent reads the upstream evidence and the complete
   BrowserRig pull request, performs the deep review, and returns a structured
   verdict.
6. The coordinator routes requested changes back to the implementation agent.
   Material rewrites receive another fresh review before merge.
7. When the independent review approves, required checks pass, and the work
   stays inside the approved scope, the coordinator may merge under the cycle's
   recorded authorization.
8. The coordinator switches to `main`, fast-forwards from `origin/main`, checks
   that the completed batch record landed, and only then starts the next batch.

If an implementation agent leaves a dirty checkout or unresolved operation,
the coordinator must return the work to that agent. It must not discard or
rewrite the agent's changes to unblock the cycle.

Batch boundaries are provisional until implementation begins. After reading
the actual upstream code, an implementation agent may recommend splitting,
combining, reordering, or marking work already covered. The coordinator may
apply a non-material scheduling correction to the active record. A change in
product scope, public behavior, or authorization returns to the user.

## Role boundaries

### Coordinator

The coordinator is a state machine, not a code reviewer. It may:

- maintain the cycle record;
- start one child agent at a time and wait for it;
- route structured findings between implementation and review agents;
- observe branch, pull-request, review, and check status;
- merge an approved implementation pull request when the active authorization
  permits it;
- update local `main` and start the next batch;
- stop and request a product decision when a guardrail is crossed.

The coordinator must not spend context reproducing deep implementation review.

### Implementation agent

The implementation agent studies the assigned upstream code deeply, adapts the
behavior, adds tests and Changesets required by `AGENTS.md`, runs proportionate
validation, and prepares a focused pull request. It must preserve unrelated
user work and leave the checkout clean.

The deterministic branch should be pushed as soon as a coherent remote marker
can be created. Open a draft pull request no later than the first coherent
implementation commit so interrupted work can be recovered without searching
all repository pull requests.

### Independent review agent

The review agent starts with fresh context and does not inherit the
implementation discussion. It performs the code-level comparison against the
upstream pull requests and returns:

```text
Verdict: Approve | Changes requested | Blocked
Scope match:
Upstream behavior covered:
BrowserRig boundaries preserved:
Required tests:
Changeset:
Findings:
Residual risks:
```

It does not silently repair the implementation. Findings return to the
implementation agent so authorship and review remain distinct.

### Closure audit agent

The closure audit agent is a fresh bookkeeping and evidence auditor, not a
second code reviewer. It checks:

- the target is still the newest patch in the next minor series;
- every upstream pull request in the range has a recorded disposition;
- every adapted batch has a merged BrowserRig pull request;
- every merged batch records independent approval and required validation;
- deferred and skipped work has a durable reason;
- no cycle branch or pull request remains unresolved;
- cycle-wide validation required by `AGENTS.md` is recorded.

It does not reread every implementation line, redesign a batch, fix code, or
change product scope. Missing or contradictory evidence blocks closure and
names the exact batch that needs a targeted review agent.

## Merge authorization

An approved active cycle may authorize the coordinator to create branches,
commits, and pull requests and to merge a batch pull request only when all of
the following are true:

- the batch is listed in the approved cycle;
- the implementation stays inside its product and technical boundaries;
- an independent review agent returned `Approve` after the final material
  change;
- required tests and GitHub checks pass;
- required Changesets are present and correct;
- the pull request contains no unrelated work;
- no stop condition below applies.

Cycle authorization never permits the coordinator to:

- expand product scope or accept an unreviewed upstream capability;
- change BrowserRig's security model, extension permissions, product identity,
  Store identity, release ownership, or publication policy;
- introduce a breaking public API or runtime requirement without a new user
  decision;
- merge a `Version Packages` pull request;
- publish npm, submit the Chrome extension, merge a release pull request, or
  create a release without the explicit approval required by `AGENTS.md`;
- merge with failed checks, unresolved review findings, or unclear unrelated
  changes.

Any stop condition returns control to the user. Approval of one cycle does not
authorize a later version range.

## Progress and recovery

Persisted batch states are:

- `Pending`: selected but not landed;
- `Complete`: implementation and independent review landed on `main`;
- `Blocked`: progress requires a new user decision or external state change;
- `Deferred`: intentionally reconsidered in a later cycle or on a named signal;
- `Skipped`: deliberately excluded with a durable reason.

Short-lived states such as implementing and reviewing do not need commits on
`main`. Every pending batch has a deterministic branch name. To resume:

1. Read the active cycle from this file.
2. Open the active record and select the first state that is not terminal.
3. Check that exact remote branch.
4. If it does not exist, start a fresh implementation agent.
5. If it exists, query only the pull request for that branch.
6. Resume implementation, start independent review, or merge according to its
   exact state.
7. Never start a later batch while an earlier batch is unresolved.

The implementation pull request updates its batch row with the BrowserRig pull
request, independent review verdict, and validation evidence. When it merges,
the code and durable `Complete` state enter `main` together.

## Files and archive lifecycle

There is at most one active cycle file:

```text
current_upstream-vX.Y.Z-to-vA.B.C.md
```

After the closure audit succeeds, a documentation-only finalization pull
request:

1. moves the active record to
   `archive/YYYY-MM-DD_upstream-vX.Y.Z-to-vA.B.C.md`, using the completion date;
2. records the closure audit and actual completion date;
3. advances the latest completed upstream sync in this file;
4. removes the active-cycle pointer and adds the archive entry below.

Archived cycle records are immutable except for factual corrections.

## Archive

No upstream sync cycle has been archived under this process yet. The `v0.4.0`
cursor is the shared bootstrap source baseline and therefore has no retroactive
cycle record. See [`archive/README.md`](archive/README.md) for archive naming and
contents.

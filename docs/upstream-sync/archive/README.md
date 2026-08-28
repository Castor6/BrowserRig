---
title: Archived Upstream Sync Cycles
description: Naming and immutability rules for completed BrowserRig upstream sync records.
---

# Archived Upstream Sync Cycles

Completed upstream sync records move here only after their closure audit
succeeds.

Name each record with its completion date and exact upstream range:

```text
YYYY-MM-DD_upstream-vX.Y.Z-to-vA.B.C.md
```

For example:

```text
2026-09-14_upstream-v0.4.0-to-v0.5.1.md
```

The archived record retains the product decision, user authorization, complete
batch ledger, upstream and BrowserRig pull-request links, independent review
verdicts, validation evidence, deferred and skipped work, closure audit, and
actual completion date.

Archived records are immutable except for factual corrections. Add each archive
to the index in [`../README.md`](../README.md).

## Records

- [`2026-08-28: v0.4.0 -> v0.5.1`](2026-08-28_upstream-v0.4.0-to-v0.5.1.md)

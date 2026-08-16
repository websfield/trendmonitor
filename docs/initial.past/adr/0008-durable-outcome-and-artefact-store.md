# ADR-0008: The Durable Outcome-Event and Artefact Store, and the Erasure Tension

**Status:** Accepted (records a deferral with exit criteria)
**Date:** 2026-07-14
**Deciders:** Fred
**Related:** [ADR-0007](0007-the-knowledge-api-boundary.md) · [ADR-0006](0006-mechanisms-and-the-warrant-ladder.md) · [ADR-0001](0001-trend-signal-sourcing.md) · [integration-contract.md](../integration-contract.md) Contract B
**Raised by:** audit 2026-07-14 finding #16

---

## Context

The `OutcomeEvent` log (Contract B) and the artefact store (Contracts A/E) are the system's ground truth: they back replay, calibration, the REQ-039 counterfactual, and every audit. Ten build phases have now landed on top of two deliberately minimal implementations:

- `AppendOnlyEventLog` is an in-memory `List<OutcomeEvent>`, never pruned or persisted (documented and reviewed for the current phase — `phase-1-evidence.md`).
- `ArtefactStore` is a local filesystem, content-addressed by sha256, immutable.

Both were the right call to ship the logic without external infrastructure. Neither has a **retention/durability policy**, and neither addresses **data-subject erasure** against an architecture that is immutable *by construction*. That immutability is not incidental — it is what makes a score reproducible from its pinned version triple, a mechanism's counts reconstructible at `corpus_snapshot_sha256`, and an allocation re-derivable from its `rng_seed`. The tension is real: the same immutability that guarantees auditability resists deletion.

## Decision

**Keep the in-memory event log and local-filesystem artefact store for now, and record the durable-store step as a tracked, dated deferral with explicit exit criteria — not a silent one.** No durable store is built in the audit-remediation plan; this ADR is the receiving home for that ocean (master plan DR1).

### Exit criteria — a durable store is required before any of these is true

1. **A non-test host writes real outcome events.** The moment `PerformanceSnapshot`/`AmplificationAllocated` events for real campaigns are appended, an in-memory log is a data-loss incident waiting for a restart.
2. **Calibration crosses a process restart.** Rolling Spearman over n≥60 held-out outcomes cannot survive on a log that dies with the process.
3. **The artefact store is read across hosts.** Once C2, C3, and C4 run as separate processes (ADR-0007 §6), a local filesystem is no longer a shared store; the layout contract (`<prefix>/<sha256[0:2]>/<sha256>.json`) must be backed by a networked/blob store that preserves content-addressing and immutability.

### The erasure tension — recorded, not resolved

Data-subject erasure (e.g. a creator withdrawing, or the under-18 exclusion of Rule 8) against an immutable, append-only log is an **unresolved tension**, not a solved problem. This ADR commits to one boundary now:

> **Erasure is never implemented by mutating or deleting from the append-only log or an immutable artefact.** Doing so would break replay reproducibility, `corpus_snapshot_sha256` provenance, and `as_of` semantics — the properties the whole design depends on.

The eventual mechanism (crypto-shredding of a per-subject key, tombstone events, de-identification-after-the-rights-window as events already anticipate by referencing `feature_record_id` rather than raw media) is left to the durable-store design, to be settled in a follow-up ADR when exit criterion 1 or 3 fires. What is fixed here is the constraint that bounds it.

## Consequences

- The current phase is unaffected: the in-memory log and local store remain correct for a single-process, fixture-driven system.
- Contract B in `integration-contract.md` carries a retention/durability note pointing here, so the decision is visible at the contract, not only in an ADR.
- When the durable store is built, its PR opens a follow-up ADR settling the erasure mechanism and the networked artefact backing — and updates ADR-0007's Integration status and Contract B together.
- No pooled or cross-tenant statistic is introduced by anything here; retention is per-tenant, and a summary statistic of outcome data remains outcome data (ADR-0006).

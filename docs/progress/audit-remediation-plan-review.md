# Plan Review — Audit Remediation (2026-07-14)

**Verdict: READY (Grade A) after two rounds.** The plan remediates all 27 findings of `docs/progress/audit/2026-07-14.md` across 8 gated phases (R0–R6). The multi-agent plan-review gate ran full intensity: four Critical-Path reviewers in parallel, then the generalist plan-reviewer last.

## Gate composition

| Critical Path (master table "yes") | Reviewer agent |
|---|---|
| Veto & verdict integrity | `veto-integrity-reviewer` |
| Boundaries & authority | `boundary-reviewer` |
| Measurement discipline | `measurement-reviewer` |
| Money & exploration | `budget-exploration-reviewer` |
| (generalist, always last) | `plan-reviewer` |

## Round 1 — four Critical-Path reviewers (all NEEDS CHANGES)

Every reviewer read the plan documents **and** cross-checked the fix specs against the code on disk. All findings were verified, not speculative.

- **veto:** #1's claimed emitter-boundary guarantee was structurally impossible (the `VerdictOverriddenRecord` carries no compliance data, so the emitter could only guard the timestamp); #11's strict `== APPROVED` would make every `APPROVED_WITH_NOTES` submission unapprovable; #5's widened judge-failure catch would swallow `OperationCanceledException`/`TimeoutException`; falsification checks only bit #1.
- **boundary:** R4b never forbade the new Python writer from repointing `active_version` — library promotion, C3's sole authority (`RepointActiveVersion` is `internal`/`LibraryVerdict`-gated) — a silent promotion-authority leak; C3 host reference constraints were unpinned; R2's round-trip test risked a tautological stub.
- **measurement:** #13 conflated "route through `compute_warrant`" with "demote to FALSIFIED" — `compute_warrant` cannot return FALSIFIED, so a decayed-but-still-valid mechanism must withdraw to `RECURRENT`; #12 must gate on `not is_ratified`, not `warrant == FALSIFIED` (a ratified FALSIFIED must still serialize); `mechanism_library.py` was mis-located to `synthesiser/` (it lives under `publishers/`).
- **budget:** #10's real-ratio wiring needed `EngagementRate` + `CreatorBaseline` inputs that `GateBCandidate` does not carry — unbuildable as scoped (though the field is inert to the allocator, so no money invariant was ever at risk).

All 12 findings applied. See the master plan's Decisions-baked-in and per-phase task tables.

## Round 2 — generalist plan-reviewer (NOT READY → resolved)

The generalist confirmed **12/12 round-1 fixes landed**, **27/27 findings mapped** to phases, the dependency DAG acyclic and parity-clean (master table ↔ each phase `Depends on`), and the `events-v1.json` 1.2.0→1.3.0 bump non-mutating. It held the plan NOT READY on five text-consistency defects:

- **A** — "(stub)" lingered in R2-T3 and two master-plan lines, contradicting R2's corrected requirement. → real-`internal.py` wording propagated everywhere.
- **B** — the R4a co-hosting P1 residual was named but unhomed, and the master Risk row implied it was closed. → added **DR5** (deferral with a receiving home) and softened the Risk row.
- **C** — two #22-27 architecture seams (Hangfire, `ArtefactStore` edge-caching) were unhomed. → added **DR6** (out-of-scope unbuilt seams, noted in R6-T3).
- **D** — R1-T9 (#21) named no concrete load site (the scoring endpoint doesn't exist yet). → re-sequenced to **R4b-T7**, where the endpoint is built.
- **E** — R6's owner `sync-docs` is a command, not an agent. → relabeled.

All five applied (text-only edits, no structural rework). Two-round cap reached; plan is internally consistent and executable.

## Finding → phase coverage (27/27)

#1→R0+R1 · #2→R0+R2 · #3→R0+R4a+R4b · #4→R1 · #5→R1 · #6→R6 · #7→R4a · #8→Non-Goal (user action, DR2) · #9→R5 · #10→R3 · #11→R1 · #12→R3 · #13→R3 · #14→R5 · #15→R5 · #16→R0+DR1 · #17→R1 · #18→R0 · #19→R1 · #20→R1 · #21→R1/R4b · #22-27→R5 (UI) + R6 (docs) + DR6 (unbuilt seams).

## Boundary of this gate

This gate verified the **plan**. The same reviewers re-run against shipped code in each phase's review (`/review-phase`). A plan-gate READY discharges nothing at code time.

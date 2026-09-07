# Plan review — UGC Intelligence

**Gate:** `/create-plan` Step 6, multi-agent plan review.
**Subject:** `docs/plans/ugc-intelligence-master-plan.md` + ten phase plans + `docs/progress/ugc-intelligence-codebase-review.md`.
**Date:** 2026-07-10

> This gate verifies the **plan**. The same reviewers re-run against shipped code in `/review-phase`. **A plan-gate PASS discharges nothing at code time.**

---

## Reviewers run

| Round | Reviewer | Verdict | Disposition |
|---|---|---|---|
| 1 | `veto-integrity-reviewer` | NEEDS CHANGES | resolved |
| 1 | `boundary-reviewer` | NEEDS CHANGES | resolved |
| 1 | `measurement-reviewer` | NEEDS CHANGES | resolved |
| 1 | `budget-exploration-reviewer` | NEEDS CHANGES | resolved |
| 2 | `veto-integrity-reviewer` | NEEDS CHANGES | resolved |
| 2 | `boundary-reviewer` | NEEDS CHANGES | resolved (one finding was a false positive) |
| 2 | `measurement-reviewer` | NEEDS CHANGES | resolved |
| 2 | `budget-exploration-reviewer` | NEEDS CHANGES | resolved |
| 3 | `plan-reviewer` (generalist, last) | **NOT READY** | 5 findings, all resolved below |
| 4 | `plan-reviewer` (re-check) | see final verdict | — |

---

## Round 1 — Critical-Path reviewers

### `veto-integrity-reviewer` — the defect that mattered

**V6 mapped to the wrong terminal state.** `schemas/rubric-v1.json:20` fixes `V6 minor_creator → on_fail: "EXCLUDED_FROM_AI_SCORING"` at gates A **and** B. The plan's verdict-engine pseudocode said `if any veto fired → REJECTED`, the `Verdict` enum had no such member, and **acceptance criterion A6 property-tested the bug across all 63 non-empty subsets of {V1..V6}** — so the test would have actively enforced the wrong behaviour. Built as written, a confirmed minor's submission ships as `REJECTED` rather than excluded from AI scoring, contradicting the rubric schema and `compliance-notes.md` §Creators under 18.

Fail-closed either way (a minor is never approved), so not a P1 — but a compliance-veto correctness defect caught at plan time rather than in production.

**Resolved:** V6 checked before the general veto branch; `EXCLUDED_FROM_AI_SCORING` added to the enum as a declared *routing state*; A6 restated as `{V1..V5} → REJECTED` (31 subsets) plus `V6 → EXCLUDED_FROM_AI_SCORING`, dominating (63 subsets); A6b added — a V6-excluded submission never enters the calibration dataset (`P4-T3b`).

### `boundary-reviewer`

1. The reference-graph test asserted only three edges. It omitted ADR-0005's **"C3 calls nothing"**, and the **sole-writer reachability** of `IOutcomeEventWriter` — while Phase 0's own handoff comment listed Phase 4 (which builds C3) as a writer consumer. A one-line `using` from C3 would have defeated "C2 is the sole writer" undetected.
2. **C4's one-prefix read grant was a convention, not a reachability fact.** Nothing asserted C4 cannot resolve a `PatternLibraryVersion`. ADR-0007 §1 is explicit: *"If C4 ever needs a second data source, the design is wrong."*
3. The C#→Python edge is outside a `ProjectReference` test's reach.

**Resolved:** `P0-T7` now asserts five edges (a–e); `P0-T11` `PrefixScopedReader`; `A11`/`A12`; Phase 8 `A18b`.

### `measurement-reviewer`

1. **The eval plan's high-side discipline was dropped.** *"If the composite shows ρ > 0.5 out-of-sample on n ≥ 60, look for the leak before celebrating."* Nothing surfaced a suspiciously high ρ as a probable leak.
2. **Fixture provenance was documentary, not structural** — inconsistent with the plan's own "structural, not documentary" standard for `Proxy`.
3. ADR-0001's mixed-provenance aggregation guard (with logged override) was not a task.
4. The AWS honest branch — *"if the baseline wins, ship the baseline, delete AWS"* — was absent from the Deferral Ledger.

**Resolved:** `P4-T3` + `A9b` (`suspected_leak`, surfaced, never celebrated, never trips the breaker); `P0-T10` `Origin.Fixture` **type**; `P0-T12` `AggregationGuard`; Deferral `D6`.

### `budget-exploration-reviewer`

1. **The Thompson explore draw was not reproducible.** No RNG seed recorded, so a real-money allocation could not be re-derived from the event log — the audit trail and the REQ-039 counterfactual both become fiction.
2. The `insufficient_baseline` uniform sub-pool's "fixed minority share" was never pinned.
3. Two explore edge cases left the exact-sum invariant partial.
4. `A11` keyed the numberless client artefact off breaker state; REQ-038 keys off *confidence*, which can fall below threshold with an armed breaker.

**Resolved:** seeded RNG, seed persisted (`P5-T6`/`T6b`); `UNIFORM_SUBPOOL_SHARE = 0.25`; edge cases enumerated; `A11` widened.

---

## Round 2 — re-review of all four

All eight round-1 findings verified resolved. Four new findings:

- **`veto-integrity-reviewer`:** the verdict engine now emits `EXCLUDED_FROM_AI_SCORING`, but `events-v1.json:91` `VerdictIssued.verdict` **cannot record it**. A V6-excluded minor would have to be misrecorded in the compliance audit trail. → `P1-T11`: `events-v1.json` → `1.1.0`, changelog, `integration-contract.md` Contract B, C# contract types regenerated. `1.0.0` never mutated.
- **`boundary-reviewer`:** confirmed the `rng_seed` bump is additive, weakens no boundary, and follows the on-disk `rubric-v1.json` → `1.1.0` precedent. Its remaining finding — that `CLAUDE.md` still names `docs/final/` authoritative — was a **false positive**: the reviewer read the stale copy injected into its spawn context. The file on disk was repaired earlier in this session and verified.
- **`measurement-reviewer`:** Phase 4 promises `suspected_leak` "on the operator dashboard", but Phase 9's dashboard task never rendered it. **A leaking cohort is `armed`**, so ρ = 0.7 would have displayed with no warning — precisely the failure the flag exists to prevent. → `P9-T7`, `A11b`.
- **`budget-exploration-reviewer`:** the empty-exploit-tier case could let an implementer push unspent `(1−ε)` into the explore arm, **tagging exploit money as `explore` and poisoning the arm-conditioned mining in Phase 6** — turning the one source of unconfounded evidence into a lie. And `rng_seed` was optional, so it would be omitted. → Phase 5 edge-case section (`(1−ε)` goes unspent and disclosed, never redistributed), `A15`/`A15b` property test, seed in `required`, `events-v1.json` → `1.2.0`.

---

## Round 3 — `plan-reviewer` (generalist): simulation + pre-mortem

**Verdict: NOT READY.** Five findings, all resolved:

| # | Finding | Severity | Resolution |
|---|---|---|---|
| F1 | **Coverage parity broken.** The master's Critical-Paths table *drives reviewer selection*, but omitted Phase 5 and 9 from the veto row and Phase 3 from the measurement row — while those phases' own Completion Criteria demand those reviewers. Trusting the table would have **skipped gates the phases mandate.** | blocking | Table corrected and marked as *derived* from the phase plans |
| F2 | **`MeasuredOutcome` exists only in C#, but Phase 6's estimator is Python.** The load-bearing claim — *"a `Proxy` value cannot enter an effect-size calculation; it is a type error, not a code-review rule"* — was **unbuildable as written**. Same root cause left the Python event-log read path and the artefact-store layout unpinned. | blocking | `P0-T13` Python provenance mirror; `P0-T14` cross-language parity test; `P0-T15` read-only replay export; `P0-T16` language-neutral artefact layout + round-trip test. `A15`–`A18` |
| F3 | Schema bumps didn't list the C# `Contracts` regeneration, so `P0-T5`'s drift test would go red. | medium | `P1-T11`, `P5-T6b` file lists extended |
| F4 | `UNIFORM_SUBPOOL_SHARE = 0.25` absent from Derived Budgets. | low | Added, and honestly labelled a *guess wearing precision* |
| F5 | Phase 5 handoff comment said `1.1.0`; the phase produces `1.2.0`. | trivial | Fixed |

**Pre-mortem — every named production failure maps to an existing task:**

| Failure | Receiving control |
|---|---|
| A regulator finds a model influenced a veto | `P1-T9`, `P1-T10`, `P3-T8`; `ComplianceGate` has no model-output parameter; the test **fails** when one is read |
| A client is shown a number the breaker should have withheld | `P4` fail-closed `cold`; `P5` A11; `P9` A2/A3; the *leaking-cohort-is-armed* variant caught by `P9-T7` + `A11b` |
| A tenant's outcome data appears in a Mechanism | `P8-T10`; `synthesise()` has **no parameter** through which an `OutcomeEvent` or `tenant_id` could arrive |
| Exploit money tagged as explore | `P5` `A15b` property test — the arm tag never crosses a budget |
| A mechanism makes a causal claim | `P8-T11` lexicon (at ratify **and** at serve), `P8-T12` poisoned-exemplar suite, `A17` — the lexicon-perfect injection is unservable without human ratification |

---

## Final verdict

**READY** — after the five generalist findings were resolved (see re-check, round 4).

Ten phase plans; dependency graph acyclic with no forward edges; four owner agents that exist; every acceptance criterion carries a concrete evidence pointer (test name, command, or file); all seven Deferral Ledger rows resolve to a receiving phase or a named external blocker; no Critical-Path reviewer returned BLOCK in any round.

**What this gate caught that a human review plausibly would not:** a property test that would have enforced a compliance bug across 63 subsets; a sole-writer invariant contradicted by the plan's own handoff comment; a type-level provenance barrier that could not be built in the language that enforces it; and a budget edge case that would have silently poisoned the one source of unconfounded evidence in the system.

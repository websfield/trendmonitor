# Phase R3 — Measurement & budget backend fixes

**Depends on:** none. **Primary agents:** `control-plane-engineer` (#10), `intelligence-plane-engineer` (#12, #13). **Gates:** `budget-exploration-reviewer` (#10), `measurement-reviewer` (#12, #13).

## Project Conventions Pinned (READ FIRST — verbatim from CLAUDE.md)

- **Non-negotiable rule 5:** Measurement discipline. Baselines use median/MAD, never mean/stddev. A `Proxy` value never enters an effect-size calculation.
- **Non-negotiable rule 6:** Mechanisms are hypotheses, never numbers. **Automatic to demote, human to promote.** A `Mechanism` `to_dict()` must not serialize an unratified record as if served.
- **Non-negotiable rule 7:** Money & exploration — every allocation carries an `arm` tag; budgets sum exactly.
- **Golden rule 4:** Fix causes, not symptoms.
- **Available agents:** `control-plane-engineer`, `intelligence-plane-engineer`, `budget-exploration-reviewer`, `measurement-reviewer`.

## Requirements Checklist (functional)

1. **#10 (MEDIUM):** `GateBOrchestrator.cs:76` emits the **real** outperformance ratio instead of the hardcoded `1m`. The static `CreatorBaselineService.OutperformanceRatio(postEr24h, baseline)` needs a post `EngagementRate` **and** a `CreatorBaseline` — neither is on `GateBCandidate` today. So: compute the ratio at the stage where the AWS `OutperformancePercentile` term is already derived from the creator baseline, add a precomputed `decimal? OutperformanceRatio` to `GateBCandidate`, and thread it into `GateBOrchestrator`. `InsufficientBaseline == true` still yields `null`. (Fallback if the input plumbing proves out of scope: **delete** the inert field — it is unread by the allocator — rather than wire a half-value. The plan commits to the wire path; the delete is the sanctioned retreat, not a silent third option.)
2. **#12 (MEDIUM):** `publishers/mechanism_library.py` `publish_library` **excludes an *unratified* mechanism** (gate on `not m.is_ratified`, **not** on `warrant == FALSIFIED` — a normally-demoted *ratified* `FALSIFIED` must still serialize and stay in the artefact) rather than letting `mechanism.py`'s `to_dict()` raise `UnratifiedSerialisationError` and crash the cohort's publish. The excluded record's demotion transition (`MechanismWarrantTransition`, `demote.py:70-79`) is the audit trail, not the artefact — so update the `mechanism_library.py:10-11` docstring, which currently overclaims that *all* `FALSIFIED` are artefact-retained (avoids re-introducing the #6 doc/code-drift class).
3. **#13 (MEDIUM):** demotion (`demote.py:66-67`) shares one source of truth with promotion — route through `compute_warrant` (`warrant.py:159-167`) with refreshed inputs. **The demotion target is the recomputed rung**, not always `FALSIFIED`: `compute_warrant` returns only `CONJECTURED`/`RECURRENT`/`CONTRASTED` (never `FALSIFIED` — that is a lifecycle transition, `warrant.py:15-16`). A `CONTRASTED` mechanism whose `mining_slice_ratio` or recurrence decayed but whose disjoint ratio still clears recomputes to **`RECURRENT`** and is **withdrawn to `RECURRENT`** (still servable), not falsified. `FALSIFIED` applies only when the disjoint ratio is undefined/below threshold. (Alternative "document the single decay signal" is permitted **only** if the note proves the three un-rechecked criteria — recurrence counts, `mining_slice_ratio`, slice count — are monotonic facts of the original mining slice that cannot decay on refresh. Default to the `compute_warrant` route.)

## Requirements Checklist (technical)

- #10: if wired, the ratio uses median/MAD baseline math already in `CreatorBaselineService`; `InsufficientBaseline` still yields `null` (n<8 undefined). Arm tags and exact-sum invariants untouched.
- #12: publish is fail-closed — a bad mechanism is excluded, never crashes the batch; the excluded record is still auditable.
- #13: if the "document the single signal" option is chosen, the doc note lives with the code and names the criteria intentionally not re-checked.

## Edge Cases & Failure Paths

- **#10:** `InsufficientBaseline == true` → `null` (unchanged); a real ratio of exactly the threshold → correct boundary.
- **#12:** a cohort with one unratified mechanism and several valid ones → publishes the valid ones, excludes the unratified one, no exception; its warrant transition stays in the transition log. A **ratified** `FALSIFIED` mechanism still serializes and stays in the artefact.
- **#13:** a `CONTRASTED` mechanism whose disjoint ratio clears but mining-ratio/recurrence decayed → **withdrawn to `RECURRENT`** (still served), not `FALSIFIED`; a mechanism whose disjoint ratio falls undefined/below → `FALSIFIED`.
- **Degraded mode:** none introduces a new external boundary.

## Implementation Tasks

| # | Task | Owner | File(s) |
|---|---|---|---|
| R3-T1 | Add precomputed `decimal? OutperformanceRatio` to `GateBCandidate` (computed where the AWS baseline term is derived); thread it into `GateBOrchestrator` replacing the hardcoded `1m` (or delete the inert field) | control-plane-engineer | `GateB/GateBOrchestrator.cs` (+ `GateBCandidate`, the AWS/collector producer), `.../CreatorBaselineService.cs` (ref) |
| R3-T2 | `publish_library` excludes an **unratified** mechanism (gate on `not is_ratified`); retain its warrant transition; fix the docstring; test the mixed-cohort publish + that a ratified `FALSIFIED` still serializes | intelligence-plane-engineer | `c1_pattern_engine/publishers/mechanism_library.py`, test |
| R3-T3 | Route `refresh_and_demote` through `compute_warrant`; demote to the **recomputed rung** (`CONTRASTED`→`RECURRENT` on asymmetry decay, `FALSIFIED` only when disjoint ratio undefined/below); test the mining/recurrence-decay case asserting demote-to-`RECURRENT` | intelligence-plane-engineer | `c1_pattern_engine/synthesiser/demote.py`, `c1_pattern_engine/synthesiser/warrant.py`, test |

## Files to Create / Modify

`src/ControlPlane/UgcIntelligence.C2.Api/GateB/GateBOrchestrator.cs` (Mod, incl. `GateBCandidate`), the AWS/collector stage that produces the candidate (Mod, to compute the ratio), `.../CreatorBaselineService.cs` (read/ref), `src/IntelligencePlane/c1_pattern_engine/publishers/mechanism_library.py` (Mod), `src/IntelligencePlane/c1_pattern_engine/synthesiser/{demote.py,warrant.py}` (Mod), Python tests under `tests/architecture/` or the miner's test dir.

## Verification Steps

1. `dotnet build` + `dotnet test tests/Architecture` → green (R3-T1). 
2. `uv run --with pytest pytest` → R3-T2, R3-T3 green. 
3. `uv run --with ruff ruff check src/IntelligencePlane tests/architecture` → clean.
4. Falsification: revert R3-T2 → the mixed-cohort publish test fails (proves it catches the crash); restore.

## Acceptance Criteria (verifiable PASS/FAIL)

- **A-R3-1 (#10):** `GateBOrchestrator` emits the computed ratio threaded through `GateBCandidate` (or the field is deleted); test asserts a non-`1m` value for a real outperformer, with the post-ER/baseline inputs supplied. (evidence: file:line + test)
- **A-R3-2 (#12):** a publish over a cohort containing one **unratified** mechanism returns the valid set and does not raise; its warrant transition is retained; and a separate test asserts a **ratified** `FALSIFIED` mechanism still serializes into the artefact. (evidence: two Python test names)
- **A-R3-3 (#13):** a mechanism with decayed mining-ratio/recurrence but a still-clearing disjoint ratio is **withdrawn to `RECURRENT`** (not `FALSIFIED`), proving demotion and promotion share one warrant computation; the falsified path is reached only on undefined/below disjoint ratio. (evidence: Python test name)
- **A-R3-4:** existing suites green; ruff clean.

## Out of Scope

No veto/verdict, no transport, no schema bump, no frontend. Do not change ε, arm-tag propagation, or budget sums.

## Completion Criteria (DoD)

Suites green; ruff clean; `budget-exploration-reviewer` PASS (#10) and `measurement-reviewer` PASS (#12/#13).

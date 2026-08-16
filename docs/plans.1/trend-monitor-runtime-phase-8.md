# Phase 8: Ingestion-priority Coupling (rising+go → corpus direction)

## Objective
Wire the one permitted, one-way coupling: a `rising`+`go` `TrendVerdict` raises **ingestion priority** so the Pattern Engine's corpus builder points at that format — via `TermRegistry.admit(...)` and `ExemplarPost.ingestion_arm = TREND_DIRECTED` / `occasioned_by_trend_ids`. It must have **no path to any score** and must **not touch `miner/arm.py`** (the amplification arm).

## Prerequisites
- [ ] Phase 5 merged (verdicts available via Phase 6 or computed here).
- [ ] Read `registry/terms.py` (`admit` `:99`, `AdmissionOrigin` `:28-45`), `corpora/exemplar.py` (`IngestionArm.TREND_DIRECTED` `:75`, `occasioned_by_trend_ids` `:108-110`), `synthesiser/synthesise.py:274` (the `ingestion_arm_report` gate).

## Requirements Checklist
- [ ] R1: A `rising`+`go` `TrendVerdict` admits/refreshes its term in `TermRegistry` with a **dedicated trend-verdict origin** (add e.g. `AdmissionOrigin.TREND_DETECTED` — do not reuse `MECHANISM_OCCASION`, which records "a mechanism named this trend" and would misrecord the admission authority's provenance). **The coupling consumes public-scope signals' verdicts only**: `TrendVerdict` carries `tenant_id` but no scope, and `TermRegistry`/`ExemplarPost` are shared, tenant-neutral state (REQ-060 — "there is no tenant axis", `exemplar.py:82`) — so the coupling must resolve the verdict's signal and refuse when `scope == "internal"`; an internal-signal `go` never reaches the shared registry or exemplar tags (tenant data never crosses into the shared corpus, CLAUDE.md rule 8 — the Phase 4 R3a principle applied here). **The term comes from Phase 4 R2's bidirectional identity index** (`trend_id` → identity → term — `TrendVerdict` carries only `trend_id` and `TrendSignal` carries no `term`). **`TREND_DETECTED` weight = 0.8**, with rationale: above `MECHANISM_OCCASION` (0.7 — a hypothesis naming a trend) because it is corroborated by observed volume *and* a human-relevant `go` verdict; below `HUMAN_SUBMISSION` (1.0 — the highest-value lead-time signal, ADR-0004 §3). Acceptance: after a public-signal `go` verdict, the term is in the registry with the trend-derived priority weight; a `skip`/`caution` verdict does **not** raise it; **an internal-signal `go` admits nothing and tags nothing (test constructs exactly this case)**.
- [ ] R2: The coupling tags corpus ingestion at post-construction time: `ExemplarPost.ingestion_arm = TREND_DIRECTED` and `occasioned_by_trend_ids = (trend_id, ...)` for exemplars ingested because of that trend. **The `exemplar.py` modification must not unblock the D5 legal gate**: `ingest_live` keeps raising `LiveIngestionBlocked` (`corpora/exemplar.py:152-173`), and nothing in the coupling or the reconciled allowlist reads as permission to ingest live exemplar media. Acceptance: a production mapping (not a fixture) sets these; a test asserts a trend-occasioned post carries them; the `LiveIngestionBlocked` tests are unchanged and green.
- [ ] R3: **No convergence with the amplification arm.** The coupling never reads/writes `miner/arm.py`'s `arm`. Acceptance: `test_synthesiser.py::test_ingestion_arm_stratified_report` green (stratifies on `ingestion_arm`, never the amplification `arm`); `test_mechanism_provenance.py::test_arm_is_absent_from_the_mechanism_dataclass` green.
- [ ] R4: **No trend→score path** introduced. The existing REQ-005e guards scan only files whose *name* contains `vps|scoring|amplif` (`test_trends.py:388-395`) and can never catch the reverse direction, so the no-import assertion is a **standing test in `tests/Architecture/test_trend_coupling.py`** — `detector/coupling.py` imports nothing from `scoring`/`amplif`/`miner.arm` — not a one-time review grep. Acceptance: the three trend→score guard tests green; the standing no-import test exists and is green.
- [ ] R5: The coupling is **reported, not trusted** — its payoff surfaces only as the REQ-005f stratified contrasted-rate (`ingestion_arm_report`), never as a scorer input. Acceptance: no numeric from the coupling reaches VPS/warrant.

> Carried from Phase 5 gate notes (2026-07-16): when TREND_DETECTED admissions raise term counts, (a) guard the seed path against nightly cold-storage duplicate growth at the 250 cap (a cold-evicted seed re-admitted every night appends to `_cold` unboundedly), and (b) decide whether the nightly run calls `registry.evict_stale(as_of)` — registry lifecycle is currently inert on the scan path.

## Implementation Tasks
1. [ ] Add `detector/coupling.py`: `apply_trend_direction(verdict, registry, *, ...)` admitting the term + returning ingestion-tag metadata.
2. [ ] Wire the ingestion tagging at exemplar-ingestion time (the production path that today only fixtures fill).
3. [ ] Tests: go→admit, skip→no-admit, trend-occasioned post carries `ingestion_arm`/`occasioned_by_trend_ids`, arm-nonconvergence, no scoring import.

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `src/IntelligencePlane/c1_pattern_engine/detector/coupling.py` | Create | rising+go → term admit + ingestion-tag mapping |
| `src/IntelligencePlane/c1_pattern_engine/registry/terms.py` | Modify | Add `AdmissionOrigin.TREND_DETECTED` + its 0.8 weight row (R1) |
| `src/IntelligencePlane/c1_pattern_engine/corpora/exemplar.py` | Modify | Accept trend-direction tags at ingestion (minimal, guarded) |
| `tests/Architecture/test_trend_coupling.py` | Create | Coupling + arm-nonconvergence + no-score-path |

## Verification Steps
1. [ ] `go` admits the term; `skip`/`caution` do not.
2. [ ] `test_ingestion_arm_stratified_report`, `test_arm_is_absent_from_the_mechanism_dataclass`, and the three trend→score tests all green.
3. [ ] The standing no-import test (`test_trend_coupling.py`) proves `coupling.py` imports nothing from `scoring`/`amplif`/`miner/arm` (R4 — a test, not a one-time grep).

## Completion Criteria
- [ ] Boundaries + Measurement gates PASS; guard tests green; entry gate no new failures.

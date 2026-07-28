# Phase 2 review — trend-monitor-runtime

## Report card
**Overall: Ready** — the candidate→`TrendSignal` assembler exists with a deterministic, revision-proof id; both Critical-Path gates moved NEEDS CHANGES → PASS (A) after a one-line fix each round-1 reviewer independently caught.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (ruff + pytest) | Ready | 278/278 green (17 new tests), ruff clean; five guard tests green inside the run |
| Measurement (`measurement-reviewer`) | Ready · A (round 1: Almost · B) | id/merge/valid_to rules clean; round-1 `kind`-refresh defect fixed + regression-tested |
| Boundaries (`boundary-reviewer`) | Ready · A (round 1: Almost · B) | All 8 checks hold; C1-internal imports only; pinned id namespace; fail-closed empty-series |
| Acceptance criteria | 6/6 PASS (R1–R6) | evidenced below |
| Definition of Done | met | tests ship with behaviour; no docs/invariant moved |

**Top things to fix (in order):** none

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Diff scope
NEW `src/IntelligencePlane/c1_pattern_engine/detector/assemble.py`, `tests/Architecture/test_trend_assemble.py` (18 tests). MODIFIED `registry/terms.py` (`TrackedTerm.kind`, refresh preserves it), `detector/__init__.py` (exports).

## Acceptance Criteria walk
- **R1 — PASS.** `assemble_signal(...)` returns a valid `TrendSignal`; `kind` sourced from `TrackedTerm.kind` (default `"topic"`, honesty rationale in the field docstring); no numeric field added (`test_assembled_signal_has_no_numeric_field` + `test_trend_never_enters_vps` green).
- **R2 — PASS.** `signal_id` = uuid5 over `{scope}:{tenant}:{platform}:{vertical}:{term}:{first_seen}` with pinned `SIGNAL_NAMESPACE`; `first_seen` caller-resolved; `test_shifted_start_day_with_stable_first_seen_keeps_id` proves revision-proofness; a hardcoded-UUID test pins the key format; new-episode semantics documented.
- **R2b — PASS.** `select_primary_series`: most-observed-days, lexicographic tie-break, never merges series (`test_primary_series_*`); integrated two-source orchestrator scenario deferred to Phase 3 with reviewer sign-off.
- **R3 — PASS.** Stage via `ema → classify_stage` inside the assembler; rising/peak/declining each tested.
- **R4 — PASS.** Confidence rungs 1-source/2-source/human each tested.
- **R5 — PASS.** `valid_to` = `as_of` + horizon **derived from lifecycle's band thresholds** (21/7 — no duplicated magic number), documented in the module docstring.
- **R6 — PASS.** Tenant/scope invariant passed through (`TrendSignal.__post_init__` stays the single enforcement point); tenant id enters the id key (`test_tenant_enters_the_id_key`).

## Reviewer gates (two rounds each)
- Round 1: both NEEDS CHANGES on one identical, real defect — `TermRegistry.admit()`'s refresh path silently reset `kind` to `"topic"`. Fixed (`kind=existing.kind`) + `test_tracked_term_kind_survives_refresh` (verified non-tautological by both reviewers). Measurement notes taken: empty-`volumes` fail-closed guard (+test), derived horizons.
- Round 2: **boundary-reviewer PASS (A)**, **measurement-reviewer PASS (A)**. Residual NOTEs (colon-key escaping, `distinct_sources` caller-trust) deferred with reviewer-assessed-sound rationale; Phase 3's orchestrator test must pin `distinct_sources` computed-from-sources, not pass-through.

## Definition of Done audit
Entry gate green (no baseline); both mapped Critical-Path gates PASS; five guard tests green; new behaviour has tests that can fail (one did — the pinned-UUID test — before being pinned to the real value); no invariant/doc moved, so no ADR/contract edit owed.

**Verdict: READY** (proof of completion for Phase 3's dependency gate).

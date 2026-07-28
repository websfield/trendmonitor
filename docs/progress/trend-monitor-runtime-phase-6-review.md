# Phase 6 review — trend-monitor-runtime

## Report card
**Overall: Ready** — per-tenant verdicts render nightly against exactly the scoped signal set, with the age-adjusted window (est **and** band) closing the loosen-the-go-guard failure the measurement gate pinned in Phase 4, and verdict outcomes resolving at trend close so REQ-005f's `go_accuracy` finally has a durable data path. Both gates moved NEEDS CHANGES → **PASS (A)** in round 2.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (ruff + pytest) | Ready | 339/339 green (15 verdict tests), ruff clean; guard tests + `test_internal_signal_is_tenant_scoped` + `test_rationale_injection_isolated` green inside the run |
| Boundaries (`boundary-reviewer`) | Ready · A (round 1: Almost · B) | Round-1 risk_flag validation fixed both ingress paths; round-2 verified `_resolved` persistence tenancy-safe; notes taken (duplicate-tenant rejection, open_issues caveat) |
| Measurement (`measurement-reviewer`) | Ready · A (round 1: Almost · B-) | Execution-confirmed ledger churn structurally closed + locked by the reviewer's exact repro; risk_flag independently confirmed fixed; notes taken (rebound-go docstring, compute_verdict defense-in-depth) |
| Acceptance criteria | 5/5 PASS (R1–R5) | evidenced below |
| Definition of Done | met | no schema/contract moved; the Phase 4-pinned age-adjustment acceptance implemented + tested |

**Top things to fix (in order):** none blocking. Deliberate decisions recorded: index-miss signals stay band-only-from-stage (fail-closed, `go` reachable via the pre-20-resolutions semantics — the pinned rule); rebound-go verdicts are served but unmeasured (closed-forever wins over churn); `ledger_resolved`/`resolved_ids` growth is unbounded-by-design (compaction noted for Phase 9's persistence touch). Phase 9 MUST select the sample pool by the detection-origin label (comment pinned at the run_scan pool line).

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Diff scope
NEW `detector/tenants.py` (artefact-only-forever supplier with loud validation), `tests/Architecture/test_trend_verdict_render.py` (15 tests). MODIFIED `detector/verdict.py` (`IssuedVerdict`, issue/resolve split, closed-forever `_resolved`, public-only global accuracy, `compute_verdict` risk-flag guard), `detector/lifecycle.py` (`days_remaining_adjusted`), `detector/run_scan.py` (scoped rendering + resolution wiring), `detector/store_durable.py` (`ledger_issued`/`ledger_resolved` persistence), `detector/run.py` (`--tenants`), `detector/__init__.py`.

## Acceptance Criteria walk
- **R1 — PASS.** Supplier is YAML-artefact-only (docstring pins forever; ADR-0009 invariant 5); floats + risk_flag + duplicate-tenant validation all fail loudly; absent file → no verdicts, no error.
- **R2 — PASS.** Cross-product via `store.feed(for_tenant=...)` (public + own-internal only); `days_remaining_adjusted` covers est **and** band (unit matrix + the end-to-end aged-signal-skips test, both verified non-tautological by the gate); render/outcome split with `trend_survived := stayed non-declining ≥ lead_time_days` at decline (scan day) / archive (`valid_to`, documented upward bias); first-issuance-wins + closed-forever (churn repro test incl. restart); `go_accuracy` with `go_count` as n, internal-scope outcomes never pooled.
- **R3 — PASS.** The exact internal-signal case tested: tenant A's internal signal renders for A, never for B, and B's verdict set never references its id.
- **R4 — PASS.** `TrendVerdict` carries no numeric (structural test); `compute_verdict` signature still takes no rationale; three trend→score guard tests green.
- **R5 — PASS.** No-tenant run yields signals + coverage only (test through `run_once` with absent artefact).

## Reviewer gates
Two rounds each; both PASS (A) in round 2 with entry state verified by the reviewers' own execution. Round-1 finds were real: the unvalidated risk_flag (both reviewers, independently — a config typo would have softened a tenant's hard `blocked` to `caution`) and the measurement gate's execution-confirmed outcome churn (one tautological skip per night into durable state, forever). Both fixed structurally with regression tests reproducing the reviewers' scenarios.

## Definition of Done audit
Entry gate green; both mapped gates PASS; tests ship with behaviour (two reviewer-caught defects now test-locked); the Phase 4-pinned semantics implemented where the plan required them; no invariant/doc moved beyond the plan pins already recorded.

**Verdict: READY** (proof of completion for Phase 7's dependency gate).

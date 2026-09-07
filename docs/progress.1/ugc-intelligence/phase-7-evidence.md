# Phase 7 — Trend subsystem — Completion Evidence

**Status: Complete — Ready.** Measurement gate PASS (Grade A, clean first pass). One non-gating NOTE hardened; one recorded as a decision. DoD satisfied.

## Gate verdict
| Reviewer | Critical Path | Verdict |
|---|---|---|
| `measurement-reviewer` | Measurement discipline | **PASS** (Grade A) — every invariant structural + falsifiable |

Phase 7 touches only the Measurement discipline Critical Path (per master-plan reviewer-selection table).

## Entry gate
- `uv run ruff check` → All checks passed
- `uv run pytest` → **65 passed** total (23 trend tests, incl. +2 from the archive hardening)
- schemas parse

## Acceptance Criteria (all PASS)
A1 z>3 sustained ≥2 consecutive days raises; single-day z>5 does not · A2 median+MAD baselines · A3 no adapter imputes a missing volume · A4 keyless read is `Proxy`, corroboration upgrades confidence not provenance · A5 self-resolution void+logged · A6 sandbagging guard `credit=skill×ln(1+lead)`, post-corroboration=0 · A7 shrinkage k=20, n=0 carries the prior · A8 `days_remaining_est` null until ≥20 resolutions · A9 archived signals remain queryable · A10 no `TrendSignal` value reachable from VPS (Python-side guard; C# half deferred to Phase 1 ReferenceGraphTests) · A11 coverage gap stated per platform, never implied · A12 trend feed denied to creator roles · A13 rationale injection isolated from deterministic verdict.

## Non-gating NOTE hardened
**Archive predicate (REQ-005h).** `archive.py` trigger was `now > valid_to AND refreshed_in_window`, letting an out-of-window `refresh()` leave a dead signal in every feed. Changed to `now.date() > valid_to` — past validity archives regardless of a late refresh; only an explicit `extend_valid_to()` keeps a signal alive. New tests: `test_stale_signal_refreshed_past_valid_to_still_archives` (archives + stays queryable, REQ-005h preserved) and `test_extended_signal_not_archived` (no over-archiving).

## Definition of Done
- ✅ Entry gate clean; pytest + ruff green
- ✅ `measurement-reviewer` PASS
- ✅ Acceptance criteria met with cited evidence

## Accepted residual (recorded as a decision — see DECISIONS.md)
**`days_remaining` estimator: median+MAD, not a fitted decay curve.** The plan text (P7-T4, REQ-005h) names "curve fit"; the shipped estimator uses a robust median + MAD interval gated at ≥20 resolutions. Reviewer judged this *more* Rule-4-aligned (median/MAD, never mean/stddev) and legitimate — it avoids a new scipy/statsmodels dependency and meets the measurement intent (never a precise number you can't support). Caveat carried to Phase 8 eval: the estimator reports the platform's typical remaining lifetime (median of resolved samples), not this trend's position on its own curve — its predictive value must earn its keep in eval (this is the same "earn its keep" discipline REQ-005f imposes on the trend↔ingestion coupling).

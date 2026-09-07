# Phase 9: Submission→Feed Merge + Coverage Honesty Finalization

## Objective
Merge the built-but-unwired human submission loop into the feed, and finalize coverage honesty. A resolved/corroborating `TrendSubmission` should admit a term (`HUMAN_SUBMISSION`), upgrade confidence (`human_corroborated`), and surface in the manager feed alongside automated signals — with coverage clearly stating human-sourced vs automated and what remains unseen.

## Prerequisites
- [ ] Phase 5 merged; Phase 8 recommended (shared coupling patterns).
- [ ] Read `submissions/submit.py`, `submissions/scoring.py`, `detector/coverage.py`, `detector/feed.py`, `detector/signals.py:71` (`assess_confidence(human_corroborated=True)`).

## Requirements Checklist
- [ ] R1: A production path from a `TrendSubmission`/`TrendResolution` to (a) `TermRegistry.admit(origin=HUMAN_SUBMISSION)` and (b) a `TrendSignal` or a confidence upgrade on an existing signal via `assess_confidence(..., human_corroborated=True)`. **Anchoring rules (anti-gaming):** `corroboration_date` passed to submitter scoring is **the persisted `first_detected_at` event timestamp** (store-add time, Phase 4 R2's identity index) — never resolver discretion and never the data-derived `first_seen`/`start_day` (a date recomputed from revisable source data would make the credit anchor itself unstable); the comparison convention is `submitted_at (datetime) < first_detected_at (datetime)`. The `human_corroborated` confidence upgrade is gated on exactly that comparison (per `signals.py:9-11` — the submission must *predate* automated detection; a post-hoc "me too" submission gets no upgrade and, with lead ≤ 0, zero lead credit). **Submission-born signals** (closed platforms, no volume series): `lifecycle_stage := TrendResolution.observed_class` (the independent resolver's observation, never the submitter's own `forecast` — an unverified human claim must not set the stage that drives verdicts and corpus direction), `confidence := human_corroborated` (the rung coverage's automated/human split keys on, `coverage.py:53-56`), and a documented `valid_to` rule. **Scope rule:** submissions come from manager/resolver staff (the submission book is internal), so submission-born signals are **public-scope**; if client/tenant-originated submissions ever exist, they are out of scope here and would require an internal-scope rule first. **Ingestion path + persistence:** the `SubmissionBook` hydrates from a submissions file under the Phase 4 state root (NDJSON append — the interim ingestion surface until the tech-spec's `POST /api/trends/submissions` exists; recorded as a deferral) so submissions/resolutions survive across nightly processes. **Submission-born `first_seen` := `submitted_at.date()`** (the earliest evidenced human sighting — the id input per Phase 2 R2). Acceptance: a corroborating submission that predates detection upgrades the matching signal's confidence; a post-hoc one does not (test); a novel one admits its term; a submission-born signal's stage comes from `observed_class` (test).
- [ ] R2: **Untrusted submission content stays out of decisions** — `rationale`/`evidence_uris` are `Untrusted` (`submit.py:9-11,77-80`) and never enter verdict/warrant/score. Acceptance: existing submission-isolation tests (A5–A8, A13) green.
- [ ] R3: `coverage_report(...)` is wired with `open_submissions_by_platform` and human-sourced signals so `PlatformCoverage` distinguishes `automated_signals` vs `human_sourced_signals` vs `open_submissions`, and states a `coverage_gap` where a platform has neither. **Origin is a label independent of the confidence rung**: today `coverage.py:53-56` keys the automated/human split on `confidence == human_corroborated`, so upgrading an automated-detected signal's confidence would silently reclassify it as human-sourced and decrement the automated count (origin conflated with confidence — the axis-conflation Phase 4 R3 fixed for resolved samples). The signal (or the wiring) carries a detection-origin label (`automated` | `human_sourced`) and the coverage split keys on it. Acceptance: `test_coverage_gap_stated` green; a platform covered only by humans is not reported as a gap; a platform with nothing is; **an automated signal upgraded to `human_corroborated` still counts as automated coverage (test)**.
- [ ] R4: **Feed role gate intact** — the merged feed is still `manager/client/resolver` only; creators raise. Acceptance: `test_creator_role_denied` green.
- [ ] R5: The manager feed presents automated + human signals as one coverage-honest list (archived removed), with provenance/confidence visible and **no numeric a scorer reads**. Submission-derived text (term, rationale-adjacent fields) is **data, never markup**: feed items expose it as plain text, and any UI rendering of it must not interpret it as HTML (no `dangerouslySetInnerHTML`-style path — stored-XSS seam). Acceptance: feed items carry confidence + lifecycle, no score field; submission text round-trips as plain text.

## Implementation Tasks
1. [ ] Add the submission→signal/term merge (`submissions/merge.py` or into `submit.py`).
2. [ ] Wire `open_submissions_by_platform` + human-sourced signals into `coverage_report`.
3. [ ] Tests: corroboration upgrade, novel-submission admit, untrusted-isolation still green, coverage with human-only platform, feed role gate.

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `src/IntelligencePlane/c1_pattern_engine/submissions/merge.py` | Create | Submission → term admit / confidence upgrade / signal |
| `src/IntelligencePlane/c1_pattern_engine/submissions/submit.py` | Modify | Add `kind` to `TrendSubmission` (the tech-spec API names it, `tech-spec-trend-subsystem.md:226`); NDJSON hydration must parse `submitted_at` timezone-aware UTC (R1) |
| `src/IntelligencePlane/c1_pattern_engine/detector/run_scan.py` | Modify | Fold submissions + coverage inputs into the run |
| `src/IntelligencePlane/c1_pattern_engine/detector/coverage.py` | Modify | Coverage split keys on the detection-origin label, not the confidence rung (R3) |
| `src/IntelligencePlane/c1_pattern_engine/detector/signals.py` | Modify | Carry the detection-origin label (`automated` \| `human_sourced`) if it rides the signal (R3 — minimal, non-numeric) |
| `tests/Architecture/test_trend_submission_merge.py` | Create | Merge + coverage honesty + role gate |

## Verification Steps
1. [ ] Corroborating submission upgrades confidence; novel one admits its term.
2. [ ] `test_creator_role_denied`, `test_coverage_gap_stated`, submission-isolation tests green.
3. [ ] Human-only platform not flagged as a gap; empty platform is.

## Completion Criteria
- [ ] Boundaries + Measurement gates PASS; guard tests green; entry gate no new failures.
- [ ] The 10-star is delivered: a nightly, coverage-honest trend monitor merging automated + human signals, feeding ingestion priority, never touching a score.

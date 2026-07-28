# Codebase Review — Trend Monitor Runtime

*Exploration for `docs/plans/trend-monitor-runtime-master-plan.md`. Read-only findings, 2026-07-16. All paths under `src/IntelligencePlane/c1_pattern_engine/` unless noted.*

## Headline

The trend detector is a **library of pure, unit-tested stages with no orchestrator**. `python -m c1_pattern_engine.detector.run` does not exist; nothing chains fetch → detect → assemble → store → verdict → coverage. This build supplies the runtime, not the algorithms.

## What exists (must be preserved, not rebuilt)

| Stage | File:seam | Signature / shape |
|---|---|---|
| z-scoring | `detector/detect.py:67` | `z_series(observed: Mapping[date,float]) -> dict[date,float]` — per **single (term,source)** series; sparse/zero-MAD days omitted, never imputed. `BASELINE_DAYS=28`, `MIN_BASELINE_POINTS=14`. |
| candidate detection | `detector/detect.py:111` | `detect_candidates(z_by_day) -> DetectionResult(candidates, alerts)`. `TrendCandidate` (`:84`) carries **only** `start_day, days, z_scores` — no platform/vertical/kind/tenant/confidence. |
| signal | `detector/signals.py:36` | `TrendSignal{id, scope, tenant_id?, platform, vertical, kind, lifecycle_stage, confidence, valid_to, archived_at}` — **no numeric field (REQ-005e)**. `assess_confidence(*, distinct_sources, human_corroborated=False)` (`:71`). |
| lifecycle | `detector/lifecycle.py` | `ema(values, span=3)` (`:49`); `classify_stage(smoothed) -> rising/peak/declining` (`:60`); `days_remaining(stage, resolved_samples) -> DaysRemaining` (`:120`) — band-only until `MIN_RESOLUTIONS=20`. |
| verdict | `detector/verdict.py:57` | `compute_verdict(*, trend_id, tenant_id, stage, band, days_remaining_est, lead_time_days, brand_fit, risk_flag, theta_fit=0.6) -> TrendVerdict`. "rising+go" at `:94`. **No rationale input (A13).** `VerdictLedger.record(...)` (`:122`). |
| store | `detector/archive.py:23` | `TrendSignalStore` — **in-memory dict only**, lost on exit. `add(signal, *, observed_at)` keyed by `signal.id`; `archive_due(now)` idempotent; `feed()`, `query()`. |
| coverage | `detector/coverage.py:33` | `coverage_report(tracked_platforms, *, signals, open_submissions_by_platform=None, live_sources_by_platform=None) -> list[PlatformCoverage]`. Platform = `coverage_gap` when no live signal AND no live source. |
| feed role gate | `detector/feed.py:16` | `FEED_ROLES={manager,client,resolver}`; creators raise `FeedAccessDenied` (REQ-005g). |
| fetch port | `adapters/base.py:78` | `RawVolumeFetch` Protocol: `(term, span: DateRange) -> Mapping[date,float]`. `_KeylessAdapter` (`:94`) stamps every read `Provenance.PROXY` (`:116`); any fetch error → `AdapterDark` (`:105`). `TrendObservation{term,source,day,volume:Provenanced[float]}` (`:36`), Proxy enforced in `__post_init__`. |
| sources | `adapters/sources.py:20` | `SOURCE_NAMES` = `google_trends, reddit, tiktok_creative_center, youtube_trending, wikipedia_pageviews, hacker_news, rss_news`. `all_adapters(fetchers, *, as_of)` builds only sources present in the injected `fetchers` map. |
| term registry | `registry/terms.py:88` | `TermRegistry` in-memory; `admit(TrackedTerm)` (`:99`) with `AdmissionOrigin` priority weights (`:49`). Origins incl. `HUMAN_SUBMISSION` (1.0), `MECHANISM_OCCASION` (0.7). `active()`/`ranked()`. |
| provenance | `substrate/provenance.py:35` | `Provenance{MEASURED,USER_PROVIDED,ESTIMATED,PROXY}`. `Provenanced[T]{value,provenance,as_of,origin}`. `MeasuredOutcome.__post_init__` (`:126`) raises `ProvenanceLaunderingError` for non-measurable — **Proxy is structurally barred from effect-size calcs.** |
| submission loop | `submissions/submit.py`, `scoring.py` | `SubmissionBook.submit/void_dead_evidence/resolve`; submitter scoring (`rps`, `skill_score`, `credit=skill*ln(1+lead)`, James-Stein `shrunk_weight`). **Built.** |

## The exact gaps (what this build creates)

1. **Candidate → `TrendSignal` assembler — the sharpest gap.** Only `make_signal` in `tests/Architecture/test_trends.py:71` does this. Must attach platform/vertical/kind, call `assess_confidence` (needs a **distinct-source count** nothing computes today), `ema`+`classify_stage`, choose `valid_to`, and mint a **stable/deterministic id** (business key e.g. `term+platform+start_day`) — because the store dedupes only by `id` and `uuid4()` per run ⇒ duplicate signals on re-run.
2. **Orchestrator spine.** No code groups `TrendObservation`s into per-series `Mapping[date,float]`, drives `z_series`/`detect_candidates`, consumes candidates, or tracks which adapters went `AdapterDark` (needed for `live_sources_by_platform`).
3. **Durable store.** In-memory ⇒ nothing accumulates across nightly runs; `days_remaining` has no resolved-samples history; re-run idempotency needs persistence.
4. **Concrete `RawVolumeFetch` per source + HTTP layer.** Zero network code in `src/` (`httpx|requests|aiohttp|urllib` → no hits in the trend path). No retry/backoff/rate-limit. Net-new.
5. **Trend-path allowlist enforcement.** `config/source-allowlist.yaml` (host + `permit_ingestion`/`permit_redistribution`, no rate/tier fields) is read **only** by `extraction/acquire.py:62` for the yt-dlp exemplar path. A disjoint second `SourceAllowlist` in `corpora/exemplar.py:157` always raises `NotImplementedError`. The keyless trend adapters check **no** allowlist today.
6. **Per-tenant verdict inputs.** `compute_verdict` needs `tenant_id, lead_time_days, brand_fit, risk_flag` — external tenant/brief data with no supplier in `detector/`.
7. **Ingestion-priority coupling (attachment seam).** A `rising`+`go` `TrendVerdict` should drive (a) `TermRegistry.admit(...)` with a trend origin, and (b) `ExemplarPost.ingestion_arm = TREND_DIRECTED` + `occasioned_by_trend_ids=(trend_id,)` (`corpora/exemplar.py:75,108-110`). Today only fixtures set these. **Must NOT touch `miner/arm.py`** — that `arm` is the amplification/estimation arm (ADR-0003), which "must never converge" with `ingestion_arm` (`exemplar.py:66-73`).
8. **Submission → feed merge.** `submit`+`score` are built; nothing turns a `TrendSubmission`/`TrendResolution` into a term admission (`HUMAN_SUBMISSION`), a confidence upgrade (`assess_confidence(human_corroborated=True)`), or a `TrendSignal`.

## Guard tests that must stay green (the invariant locks)

All `tests/Architecture/`:
- **Trend → score isolation (REQ-005e):** `test_trends.py::test_trend_never_enters_vps` (`:369`), `test_publication_authority.py::test_no_scoring_adjacent_python_module_reaches_a_trend_or_miner_output` (`:155`), `test_pattern_miner.py::test_trend_never_enters_vps` (`:434`).
- **Ingestion-arm coupling stays a reported metric, never converges with amplification arm:** `test_synthesiser.py::test_ingestion_arm_stratified_report` (`:428`), `test_mechanism_provenance.py::test_arm_is_absent_from_the_mechanism_dataclass` (`:279`).
- **Measurement discipline:** `test_trends.py::test_median_mad_baseline` (`:138`), `::test_no_imputation` (`:157`), `::test_corroboration_not_provenance` (`:186`), `::test_days_remaining_gated` (`:297`); `test_provenance.py` (MeasuredOutcome barrier); `test_calibration.py` (n≥60, temporal holdout).
- **Feed/tenancy:** `test_trends.py::test_creator_role_denied` (`:427`), `::test_internal_signal_is_tenant_scoped` (`:542`), `::test_coverage_gap_stated` (`:401`).

## Sequencing implication (feeds the master plan)

Pre-mortem #1 (scope balloons into an external-integration project) is real: **fetch/HTTP is the biggest, riskiest piece.** Build the spine on a **fake `RawVolumeFetch` first**, reach a runnable entrypoint, then swap live adapters behind the same port. MVP milestone = "a scan runs end-to-end on fake sources via `python -m ...detector.run`, idempotent and fail-closed" — live HTTP and the couplings layer on after.

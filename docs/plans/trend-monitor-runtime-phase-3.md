# Phase 3: Orchestrator Spine — One Run on a Fake Fetcher

## Objective
Chain fetch → group → z → detect → assemble → store for a single scan, driven by an **injected fake `RawVolumeFetch`** (no network). Capture which sources went `AdapterDark` and produce a `coverage_report`. This is the runtime spine.

## Prerequisites
- [ ] Phase 2 assembler merged.
- [ ] Read `adapters/base.py`, `adapters/sources.py`, `registry/terms.py`, `detector/coverage.py`, `detector/archive.py`.

## Requirements Checklist
- [ ] R1: `run_scan(*, terms, fetchers, as_of, store, tracked_platforms) -> ScanResult` (signature to confirm). Drives `all_adapters(fetchers, as_of=as_of)`, iterates terms × adapters calling `observe(term, span)` with a `span` ≥ `BASELINE_DAYS`. Acceptance: returns candidates, alerts, stored signal ids, and a coverage report.
- [ ] R2: **Observation → per-series grouping.** `list[TrendObservation]` grouped by `(term, source)` into `Mapping[date, float]`, unwrapping `Provenanced[float].value`. Acceptance: gaps stay gaps (no key invented); a unit test with a gappy series preserves absence (`test_no_imputation` semantics).
- [ ] R3: Per series → `z_series` → `detect_candidates`; candidates for the same `(scope, tenant, platform, vertical, term)` identity **merge into one signal** per Phase 2 R2b (primary series drives the stage). **`distinct_sources` is term-scoped, not platform-scoped**: it counts every candidate-producing source for the term across platforms this run — per ADR-0004 §2 corroboration is "a second independent source", with no bucket qualifier — so a reddit + google_trends detection mints two per-platform identities, both `corroborated`. (Interpretation pinned 2026-07-16 at the measurement gate's request; do not silently flip it.) **Volumes are never arithmetically combined across sources — series stay per `(term, source)` end-to-end**, locked by a standing test (the trend analogue of never summing organic+boosted). Acceptance: a term seen on 2 sources yields one `corroborated` signal; a test asserts no cross-source summation.
- [ ] R4: `SpikeAlert`s are surfaced in `ScanResult` for humans, **not** stored as signals (a one-day spike is not a signal — `detect.py` semantics).
- [ ] R5: **Live-source tracking + pinned coverage honesty.** Sources that raised `AdapterDark` this run are excluded from `live_sources_by_platform` — **and their already-collected observations from earlier terms are dropped for the whole run** (a half-read source must not mint signals that then read as coverage; conservative direction, pinned 2026-07-16); `coverage_report(...)` is produced from stored signals + live sources. `tracked_platforms` is the sole authority for which platforms get a row (`coverage.py:42-44`), so it is **pinned, not left to config**: the default tracked set MUST include the blind platforms (`tiktok`, `instagram_reels` — no automated source exists for either), and an explicit **source→platform map** states which platform each keyless source counts as live-source evidence for (`google_trends`/`wikipedia_pageviews`/`hacker_news`/`rss_news` are open-web/cross-platform proxies — they must not fabricate coverage of a closed platform). **The signal's `platform` follows the same map**: a signal's platform = the source-mapped platform of its primary series' source — never the `TrackedTerm`'s aspirational platform bucket — so an open-web-proxy detection of a tiktok-bucketed term mints an open-web signal, not a `platform="tiktok"` one (which would defeat coverage honesty through the signal path, since `coverage.py:64` treats any live signal as coverage). Acceptance: a dark source → its platform shows reduced live sources; a default-config run reports `tiktok` and `instagram_reels` as stated `coverage_gap`s (test); the source→platform map is asserted by a test.
- [ ] R6: Store writes via `store.add(signal, observed_at=as_of)`; the orchestrator resolves each candidate's `first_seen` via an **`IdentityIndex`** (`detector/identity.py`, new — the named home for identity → (`first_seen`, signal id); in-memory this phase, made durable by Phase 4 R2; needed because `TrendSignalStore` is id-keyed and `TrendSignal` carries no `term`) per Phase 2 R2 (live signal for the same identity → reuse its `first_seen`; else the candidate's `start_day`). Running the same scan twice with the same `as_of` — and re-running with a source-revised window that shifts `start_day` — produces **no duplicate signals**. Acceptance: idempotency test incl. the shifted-`start_day` case.

## Implementation Tasks
1. [ ] Add `detector/run_scan.py` (pure orchestration; fetchers injected).
2. [ ] Add a fake `RawVolumeFetch` test helper (reuse patterns from `test_trends.py` fakes: `gappy`, `dark`).
3. [ ] Tests: happy path, gappy series (no imputation), dark source (coverage), 2-source corroboration, double-run idempotency.

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `src/IntelligencePlane/c1_pattern_engine/detector/run_scan.py` | Create | The orchestrator spine (fetch→…→store) |
| `src/IntelligencePlane/c1_pattern_engine/detector/identity.py` | Create | `IdentityIndex` — identity → (`first_seen`, signal id), R6 (in-memory; durable in Phase 4) |
| `src/IntelligencePlane/c1_pattern_engine/detector/__init__.py` | Modify | Export `run_scan` |
| `tests/Architecture/test_trend_run_scan.py` | Create | Spine tests incl. idempotency + coverage |

## Verification Steps
1. [ ] Spine tests green; double-run adds zero duplicate signals.
2. [ ] `test_no_imputation`, `test_median_mad_baseline`, `test_coverage_gap_stated` still green.
3. [ ] No network import in the spine (`ruff`/grep: no `urllib|httpx|requests`).

## Completion Criteria
- [ ] Measurement + Boundaries gates PASS; five guard tests green; entry gate no new failures.

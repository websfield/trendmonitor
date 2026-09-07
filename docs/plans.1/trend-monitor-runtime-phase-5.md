# Phase 5: Runnable Entrypoint + Scheduling Port (MVP milestone)

## Objective
Make it run: `python -m c1_pattern_engine.detector.run` executes one nightly scan (load durable store → pull terms → fetch → pipeline → persist → emit coverage), behind a thin scheduling *port* so cadence is an external concern. Fail-closed throughout. On fake fetchers this is the end-to-end MVP.

## Prerequisites
- [ ] Phases 3 (spine) + 4 (durable store) merged.

## Requirements Checklist
- [ ] R1: `detector/run.py` with a `__main__` (invokable as `python -m c1_pattern_engine.detector.run`). **Hydration order:** load the durable state root (signal store + identity index + resolved samples + `TermRegistry` + `VerdictLedger`, Phase 4 R6) → **seed the registry from the term-source config** (a committed non-secret file, e.g. `config/tracked-terms.yaml`, listing `{term, platform-bucket, vertical, kind}`; config seeds only terms the persisted registry doesn't already hold — persisted admissions, e.g. Phase 8's `TREND_DETECTED` terms, always survive and are never clobbered by the seed file) → read terms from `TermRegistry.active()`/`ranked()` → resolve the configured fetchers → `run_scan` → persist → print/log a run summary (candidates, alerts, coverage gaps). Acceptance: a local invocation against a fake/config fetcher completes and writes signals; a persisted-admission term survives a restart + re-seed (test).
- [ ] R2: A **scheduling port** (`Scheduler` Protocol or a documented "one invocation = one nightly run" contract) so the cadence mechanism (OS cron / container schedule) lives outside the code. Acceptance: the entrypoint does exactly one run per invocation; no in-process timer/loop; docstring states cron is external.
- [ ] R3: **Idempotency at the entrypoint level** — two invocations with the same logical `as_of` leave the store unchanged. Acceptance: CLI-level idempotency test.
- [ ] R4: **Fail-closed run semantics** — any adapter dark, sparse window, or partial failure degrades to fewer/no signals + a coverage gap, never a fabricated signal or a crash that corrupts the store. A store write failure aborts the run without partial-committing a poisoned state. Acceptance: fault-injection tests (dark source, mid-run error) leave a consistent store.
- [ ] R5: Configuration is non-secret and file/env driven (store root, term source, which fetchers) — no secrets in code (CLAUDE.md rule 2). The **default configuration ships the pinned coverage set** (Phase 3 R5): `tracked_platforms` includes `tiktok` and `instagram_reels`, so a default run states its blindness rather than silently reporting only the open web. Acceptance: config names documented; nothing sensitive committed; a default-config run's coverage report names the blind platforms as gaps (test).
- [ ] R6: `as_of` is injectable (arg/env) so runs are reproducible and testable — no hidden `date.today()` that makes tests non-deterministic. Acceptance: tests pass a fixed `as_of`.

## Implementation Tasks
1. [ ] Add `detector/run.py` + `__main__`.
2. [ ] Add the scheduling-port abstraction (thin).
3. [ ] Wire config (store root, fetchers, term source).
4. [ ] CLI idempotency + fault-injection tests.
5. [ ] Document the cron invocation in `RUNBOOK.md` (deferred deployment, honest).

## Files to Create/Modify
| File | Action | Purpose |
|---|---|---|
| `src/IntelligencePlane/c1_pattern_engine/detector/run.py` | Create | Entrypoint + `__main__` + scheduling port |
| `tests/Architecture/test_trend_run_entrypoint.py` | Create | CLI idempotency + fail-closed |
| `RUNBOOK.md` | Modify | How to invoke the nightly scan (cron external) |

## Verification Steps
1. [ ] `python -m c1_pattern_engine.detector.run` (fake fetchers) completes and writes signals.
2. [ ] Second invocation, same `as_of`, no duplicates.
3. [ ] Dark-source / mid-run-error runs leave a consistent, non-corrupt store.

## Completion Criteria
- [ ] Boundaries + Measurement gates PASS; guard tests green; entry gate no new failures.
- [ ] **MVP milestone reached:** a nightly scan is runnable end-to-end on fake sources.

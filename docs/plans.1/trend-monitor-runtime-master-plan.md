# Master Implementation Plan: Trend Monitor Runtime

## Overview
- **Project:** UGC Intelligence for ClientHub (Python intelligence plane, C1 Pattern Engine)
- **Objective:** Turn the existing, unit-tested trend detector into a **runnable nightly trend monitor** — a Python entrypoint (`python -m c1_pattern_engine.detector.run`) that fetches daily volumes from keyless sources, runs the detector pipeline, persists signals across runs, renders per-tenant verdicts, feeds ingestion-priority into the Pattern Engine, and surfaces a coverage-honest manager feed. External cron/scheduler triggers it; no Hangfire.
- **Scope (10-star, chosen in shaping):** full nightly automation across all configured keyless sources + human-submission merge + ingestion-priority coupling + coverage honesty. Manager/ingestion-facing only.
- **Contract:** `docs/plans/trend-monitor-runtime-brief.md` (shaping brief) and `docs/progress/trend-monitor-runtime-codebase-review.md` (exploration).
- **Estimated effort:** ~9 phases, ≈2–3 focused days.

## Documentation Review Summary
The detector's pure stages (`z_series → detect_candidates → assess_confidence → ema/classify_stage → compute_verdict → coverage_report`) and the in-memory `TrendSignalStore` all exist and are unit-tested. **What's missing is every piece of connective runtime:** the candidate→`TrendSignal` assembler (only a test helper today), the orchestrator spine, cross-run persistence, concrete HTTP fetchers (zero network code exists), trend-path allowlist enforcement, per-tenant verdict inputs, the ingestion-priority coupling, and the submission→feed merge. Full seams with `file:line` in the codebase review. The invariant that trends never touch a score is already enforced in code and locked by five architecture tests — this build must keep them green.

## Decisions baked in (do not relitigate — see `DECISIONS.md`, `trend-monitor-runtime-brief.md`)
- **Scheduler host = Python entrypoint + external cron**, not Hangfire (2026-07-16). Trend scan is non-decisional intelligence-plane work; stays in Python. Divergence from tech spec captured by an ADR in Phase 1.
- **Scope = 10-star**, ahead of the Phase 0/1 current focus, by explicit user choice.
- **Fake `RawVolumeFetch` first, live adapters swapped in behind the same port** (pre-mortem #1). Live HTTP is deferred until the spine is runnable.
- **Manager-facing only; trends never enter VPS/BAS/AWS/veto/verdict/budget or a mechanism warrant.** `ingestion_arm` (corpus direction) must never converge with the amplification `arm` (ADR-0003).

## Dependencies
- **External:** an HTTP client for live fetch (Phase 7) — prefer the stdlib (`urllib`) or a single lightweight dep; justify per CLAUDE.md rule 5. Live keyless sources (Google Trends RSS, Reddit, YouTube RSS, Wikipedia pageviews, HN, RSS news; TikTok Creative Center stays human-in-the-loop, never crawled).
- **Internal:** the whole `c1_pattern_engine.detector` package, `adapters/`, `registry/terms.py`, `substrate/provenance.py`, `corpora/exemplar.py` (coupling target), `submissions/`.

## Phases Overview
| Phase | Description | Est. | Deps | Critical-Path gates |
|---|---|---|---|---|
| 1 | Docs-first: runtime ADR + contract note (Hangfire divergence) | 30–45m | none | Boundaries |
| 2 | Candidate → `TrendSignal` assembler (stable id, confidence, stage) | 60–90m | 1 | Measurement, Boundaries |
| 3 | Orchestrator spine — one run on a **fake** fetcher | 90m | 2 | Measurement, Boundaries |
| 4 | Durable store — cross-run persistence + idempotency + resolved-samples | 60–90m | 3 | Boundaries, Measurement |
| 5 | Runnable entrypoint `detector.run` + scheduling port (fail-closed) | 60m | 4 | Boundaries, Measurement |
| 6 | Per-tenant verdict rendering (tenant/brief config supplier) | 60–90m | 5 | Boundaries, Measurement |
| 7 | Live fetch adapters + trend-path allowlist (swap fake→live) | 90m+ | 5 | Measurement, Boundaries, **Security** |
| 8 | Ingestion-priority coupling (rising+go → term admit + ingestion tag) | 60–90m | 5 | Boundaries, Measurement |
| 9 | Submission→feed merge + coverage-honesty finalization | 90m | 5 (8 soft — shared coupling patterns) | Boundaries, Measurement |

**MVP milestone = end of Phase 5:** a scan runs end-to-end on fake sources via `python -m c1_pattern_engine.detector.run`, idempotent and fail-closed. Phases 6–9 are additive layers and may be resequenced; 7 (live HTTP) is the biggest/riskiest and is deliberately after the runnable skeleton.

## Progress Tracking
| Phase | Status | Started | Completed | Notes |
|---|---|---|---|---|
| 1 | ✅ Complete | 2026-07-16 | 2026-07-16 | ADR-0009 + contract note; boundary gate PASS (A); review READY |
| 2 | ✅ Complete | 2026-07-16 | 2026-07-16 | assembler + deterministic id; both gates PASS (A) after 1 fix round; review READY |
| 3 | ✅ Complete | 2026-07-16 | 2026-07-16 | spine on fake fetchers; refuse-before-fetch TikTok guard; both gates closed over 2 rounds + evidenced fixes; review READY |
| 4 | ✅ Complete | 2026-07-16 | 2026-07-16 | durable state root (amnesia fix); boundary PASS (A) r2; measurement residuals fixed+pinned; review READY |
| 5 | ✅ Complete | 2026-07-16 | 2026-07-16 | **MVP milestone reached** — entrypoint runs e2e, idempotent (byte-identical), fail-closed; measurement PASS (A), boundary closed after 1-line fix; review READY |
| 6 | ✅ Complete | 2026-07-16 | 2026-07-16 | tenant verdicts + age-adjusted window + outcome resolution; both gates PASS (A) r2; review READY |
| 7 | ✅ Complete | 2026-07-16 | 2026-07-16 | live fetch adapters + host-pinned trend allowlist + hardened HTTP; all three gates (Security + Boundaries + Measurement) PASS (A) r2 after 1 fix round; 11 regression tests; review READY |
| 8 | ✅ Complete | 2026-07-16 | 2026-07-16 | rising+go → TREND_DETECTED admit (monotonic upgrade) + TREND_DIRECTED ingestion tag; one-way, no score path (AST-enforced); both gates PASS (A), measurement after 1 docstring fix; carried Phase-5 notes (a)+(b) closed; review READY |
| 9 | ✅ Complete | 2026-07-16 | 2026-07-16 | submission→feed merge + coverage honesty (detection-origin label de-conflates origin from confidence). Hardest-reviewed phase: 4 BLOCKs across 2 gates over 3 rounds, all reproduced by runtime probe. Boundaries PASS (A) r3; Measurement 0 BLOCK r3, 3 doc/test findings closed by evidence. review READY |

## Risk Assessment (seeded from the brief pre-mortem)
1. **Scope balloons into an external-integration project.** *Mitigation:* fake fetcher first; the fetch port isolates HTTP to Phase 7; live sources swap in behind an unchanged interface. Each phase 2–6 ships value without a single network call.
2. **Provenance/coverage dishonesty.** A keyless read mislabelled `Measured`, a `Proxy` value drifting toward an effect size, or a feed silent about platforms it can't see. *Mitigation:* Proxy is a constructor invariant (`base.py:116`) and `MeasuredOutcome` bars Proxy structurally — keep both; coverage honesty is an acceptance criterion (Phase 3/9), not optional; measurement gate every phase touching signals/fetch.
3. **Invariant drift under the new runtime.** A fresh code path is a fresh place for a trend→score leak or a creator-facing drift. *Mitigation:* the five named guard tests are a standing gate on phases 2,3,7,8,9; boundary-reviewer runs on every phase; `ingestion_arm` never touches `miner/arm.py`.
4. **Idempotency/duplication.** `uuid4()` per candidate + `id`-keyed store ⇒ nightly re-runs duplicate signals. *Mitigation:* Phase 2 mints a deterministic business-key id; Phase 4 proves re-run idempotency across process restarts.
5. **Tenant data / brief supplier.** Phase 6 verdict inputs are per-tenant; a careless supplier could cross tenants. *Mitigation:* verdicts stay tenant-scoped (locked by `test_internal_signal_is_tenant_scoped`); config supplier is per-tenant, no pooling.

## Quality Gates (per phase — CLAUDE.md Definition of Done)
- [ ] Entry gate clean (or no new failures vs baseline): schemas parse, `dotnet build`+`dotnet test`, `uv run pytest tests/Architecture`, `ruff`, frontend typecheck+tests.
- [ ] Every applicable Critical-Path reviewer gate reports PASS (table above): `component-boundaries` / `boundary-reviewer`, `measurement-discipline` / `measurement-reviewer`, and `security-reviewer` on Phase 7.
- [ ] The five named guard tests stay green — enumerated (all `tests/Architecture/`): `test_trends.py::test_trend_never_enters_vps`, `test_publication_authority.py::test_no_scoring_adjacent_python_module_reaches_a_trend_or_miner_output`, `test_pattern_miner.py::test_trend_never_enters_vps` (trend→score isolation, REQ-005e), `test_synthesiser.py::test_ingestion_arm_stratified_report`, `test_mechanism_provenance.py::test_arm_is_absent_from_the_mechanism_dataclass` (arm non-convergence). The wider measurement/tenancy locks in codebase review §"Guard tests" stay green too via the entry gate.
- [ ] New behaviour has tests that can fail; `ruff` clean.
- [ ] Docs updated where an invariant/contract moved (Phase 1 ADR; integration-contract note for the runtime).

## Plan Review Log
- 2026-07-16 round 1 — `boundary-reviewer`: NEEDS CHANGES (3 CHANGE: Phase 6 supplier future data source; Phase 6 internal-signal × tenant cross-product; Phase 7/8 D5 legal gate; + 6 notes incl. ADR number 0009, enumerate guard tests, standing no-import test, dedicated AdmissionOrigin). `measurement-reviewer`: NEEDS CHANGES (4 CHANGE: signal-id stability under live-source jitter; coverage honesty pinned not config-dependent; submitter-scoring anchoring; submission-born signal semantics; + 3 notes). `security-reviewer`: NEEDS CHANGES (5 MEDIUM on Phase 7: host-pinned allowlist, redirect handling, term percent-encoding, XML entity hardening, response-size cap; + lows incl. construction-time enforcement, no-override statement, no-fetch-from-response-body, TikTok non-fetchable). All findings fixed in the plan text 2026-07-16 (phases 1–9 + this file).
- 2026-07-16 round 2 — all round-1 findings verified closed by all three reviewers. Second-order findings, all fixed in plan text same day: `security-reviewer` NEEDS CHANGES → structurally-disjoint `trend_sources:` schema + acquire-refusal test, `quote(term, safe="")` + path-slot assertion, redirect re-validation against the originating source's pinned host, `yaml.safe_load`, Phase 9 plain-text (no-XSS) rule (phase-7/9). `boundary-reviewer` NEEDS CHANGES → Phase 8 coupling consumes public-scope verdicts only (internal `go` never reaches shared registry/corpus, with test); Phase 4 repository-layer tenant/scope-aware `feed`/`query`; Phase 9 submission-born scope rule; Phase 6 ledger scoping. `measurement-reviewer` NEEDS CHANGES → Phase 4 R2 immutable identity→(`first_seen`,`first_detected_at`) index + shifted-`start_day` restart test; Phase 9 anchor = `first_detected_at` event timestamp (never data-derived); coverage origin label independent of confidence rung; new-episode + primary-series-jitter notes (phase-2).
- 2026-07-16 round 3 — generalist `plan-reviewer` simulation + pre-mortem: NOT READY (N1–N15; the three blockers: nightly-process amnesia — registry/book/ledger in-memory with no persistence task; Phase 6 `VerdictLedger.record` unexecutable at render time; `TrendSignal.kind` had no source). All fixed in plan text same day — **decision: persist, not defer** (Phase 4 R6 state root gains `TermRegistry` + `VerdictLedger`; Phase 5 R1 hydration order + `config/tracked-terms.yaml` term source; Phase 6 splits render/record with an outcome-resolution rule at decline/archive; `kind` rides `TrackedTerm` (default `topic`) / the submission; `IdentityIndex` (`detector/identity.py`) named in Phase 3, durable + bidirectional in Phase 4; signal platform = source-mapped platform of the primary series; `TREND_DETECTED` weight 0.8 with rationale; submission book hydrates from an NDJSON file under the state root (deferral: the real POST API); `first_detected_at` = `as_of` @ 00:00 UTC; submission-born `first_seen` = `submitted_at.date()`; Phase 9 Files closure (coverage.py, signals.py); Phase 1 R4 names the two real Hangfire locations; master↔phase-9 dependency aligned (5 hard, 8 soft).
- Final verdict: see `docs/progress/trend-monitor-runtime-plan-review.md`.

## Next
Gate this plan through a plan-review (`plan-reviewer` + the Boundaries/Measurement reviewers) before build, then `/implement trend-monitor-runtime` (or `/start-teams`). `/review-phase trend-monitor-runtime <N>` is mandatory after each phase.

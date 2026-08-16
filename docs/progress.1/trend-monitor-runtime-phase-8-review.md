# Phase 8 review — Ingestion-priority Coupling (rising+go → corpus direction)

**Readiness: Ready.** Entry gate green (pytest **384/384**, ruff clean); both Critical-Path gates **PASS (A)** — Boundaries first-pass, Measurement after one docstring fix; Definition of Done met. This card is the proof Phase 9's (soft) dependency gate reads.

## What shipped
The one permitted, one-way coupling — trend detection → corpus direction, with **no path to any score** and no touch of the amplification arm.

- `detector/coupling.py` (NEW) — `apply_trend_direction(verdict, registry, *, identity_index, as_of, kind)`: a **public** rising+go verdict admits/upgrades its term (`TermRegistry.admit(upgrade_origin=True)`) and returns a `TrendDirection`. Refuses `skip`/`caution`, unresolvable `trend_id`, and **internal-scope** signals — all fail-closed (admit nothing). Term resolved via the Phase 4 identity reverse-lookup (`by_signal_id`), never fabricated. Imports nothing from `scoring`/`amplif`/`miner.arm`.
- `registry/terms.py` — dedicated `AdmissionOrigin.TREND_DETECTED` (weight **0.8**, between mechanism 0.7 and client-brief 0.9); `admit(*, upgrade_origin=False)` performs a **monotonic** origin upgrade (raises a `SCHEDULED_SCAN` term to `TREND_DETECTED`, never downgrades a `HUMAN_SUBMISSION`).
- `corpora/exemplar.py` — `occasion_exemplar(post, trend_ids)`: production `TREND_DIRECTED` + `occasioned_by_trend_ids` tagging via `dataclasses.replace` (re-validates the Proxy-by-construction invariant); does **not** unblock D5 (`ingest_live` still raises).
- `detector/run.py` — coupling wired into `run_once` (after scan, before persist; deduped by `trend_id`) + the two carried Phase-5 notes closed.
- `tests/Architecture/test_trend_coupling.py` (NEW, 12 tests).

## Gate outcomes

| Gate | Round 1 | Round 2 | Findings |
|---|---|---|---|
| Boundaries | **PASS (A)** | — | 0 BLOCK, 0 CHANGE, 1 forward NOTE (add a scope assertion at `occasion_exemplar` when the production ingestion path is wired — taken as a docstring caller-contract) |
| Measurement | NEEDS CHANGES (B) | **PASS (A)** | 1 CHANGE: stale "five origins" module docstring (I added the sixth) → fixed to "six"; 2 optional NOTEs taken (defensive `stage=="rising"` re-check; the `occasion_exemplar` caveat) |

Boundaries confirmed the coupling is genuinely one-way and fail-closed: `Scope = Literal["public","internal"]`, so `scope != "public"` robustly refuses the only non-public value inside `apply_trend_direction` (robust to any caller); the standing **AST** no-import test closes the reverse-direction gap the REQ-005e name-based guards can't see. Measurement confirmed the `0.8` weight is consumed **only** inside `terms.py` (grep-verified — a registry eviction-ordering axis that cannot leak into VPS/warrant), Proxy survives `replace`, and `IngestionArm` is value-disjoint from the amplification `Arm`.

## Carried Phase-5 notes — both closed
- **(a) seed cold-duplicate growth** — `run_once` now skips seeds known in **active OR cold** storage, so a cold-evicted seed is never re-admitted and re-appended to append-only cold nightly. Test: `test_cold_evicted_seed_not_readmitted_nightly`.
- **(b) `evict_stale` on the scan path** — **decided: deferred, documented.** Enabling 90-day staleness eviction correctly first requires refreshing an active term's `last_activity_at` whenever the scan *observes* it; the spine does not do that today, so `evict_stale` would age terms by admission time and wrongly evict productive ones. The 250-per-bucket cap already bounds growth. Both gates judged this the honest call (tested code, deferred wiring, stated reason — not silent inert code).

## Forward NOTE (non-blocking, carried to a future phase)
When the production exemplar-ingestion path is wired (post-D5), the seam must feed `occasion_exemplar` only **public** `TrendDirection.trend_id`s and assert it there — so the shared-corpus tenant boundary is never carried by an upstream caller alone. Recorded as a caller-contract in the `occasion_exemplar` docstring today.

## Definition of Done
- ✅ Entry gate: pytest 384/384; ruff clean. (No C#/frontend/schema-JSON files touched.)
- ✅ Both applicable Critical-Path gates PASS.
- ✅ R1–R5 met; R3 arm-non-convergence + REQ-005e trend→score guards green; D5 unchanged.

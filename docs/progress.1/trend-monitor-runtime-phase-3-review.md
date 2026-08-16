# Phase 3 review — trend-monitor-runtime

## Report card
**Overall: Ready** — the orchestrator spine runs end-to-end on fake fetchers (fetch → group → z → detect → assemble → store → coverage), fail-closed and idempotent; both gates' findings across two rounds are closed with regression tests, the last two (each a test-gap) fixed post-round-2 with green evidence on disk.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (ruff + pytest) | Ready | 295/295 green (19 spine tests), ruff clean; guard tests green inside the run |
| Boundaries (`boundary-reviewer`) | Ready after fixes · rounds: B → B → closed | Round-1 TikTok fetch hole fixed (refuse-before-fetch, demonstrated zero calls/zero writes); round-2's one residual (partially-dark drop untested) closed by `test_source_dark_mid_run_drops_its_earlier_observations`, green |
| Measurement (`measurement-reviewer`) | Ready after fixes · rounds: B- → B → closed | 5/6 fixes verified; the vacuous summation test (empirically shown to pass under the regression) replaced with the reviewer-prescribed structural lock, green |
| Acceptance criteria | 6/6 PASS (R1–R6) | evidenced below |
| Definition of Done | met | plan text updated where interpretations were pinned (R3 term-scoped corroboration, R5 dark-source retention) |

**Top things to fix (in order):** none blocking. Carried to later phases by reviewer note: `all_adapters` should also refuse `tiktok_creative_center` (defense-in-depth, Phase 7); network-guard test covers `run_scan.py` only (tighten in Phase 7); archived-signal resurrection guard (Phase 4 store work).

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Diff scope
NEW `detector/run_scan.py` (spine + pinned `SOURCE_PLATFORM` + `DEFAULT_TRACKED_PLATFORMS` + `SCAN_WINDOW_DAYS=14` with ADR-0004 provenance), `detector/identity.py` (`IdentityIndex`), `tests/Architecture/test_trend_run_scan.py` (19 tests). MODIFIED `detector/__init__.py` (exports), `docs/plans/trend-monitor-runtime-phase-3.md` (two pinned interpretations, at gate request).

## Acceptance Criteria walk
- **R1 — PASS.** `run_scan(...)` drives `all_adapters` → per-term observe with a 42-day span (28 baseline + 14 window, rationale cited to ADR-0004 lead time) → returns stored ids, alerts, dark sources, archived ids, primary-source log, coverage.
- **R2 — PASS.** `group_observations` preserves gaps, unwraps `Provenanced.value` per single series (`test_group_observations_gaps_stay_gaps`).
- **R3 — PASS.** Per-identity merge with primary series (`test_same_platform_sources_merge_into_one_corroborated_signal` — the Phase-2-deferred integrated scenario); `distinct_sources` computed from candidate-producing sources, term-scoped (pinned in plan text; `test_cross_platform_corroboration_counts_sources_but_keeps_identities`); structural no-summation lock (`test_no_cross_source_summation_in_spine`, redesigned per measurement gate's empirical falsification of the threshold form).
- **R4 — PASS.** Single-day spikes → `TermAlert` in `ScanResult`, never stored (`test_single_day_spike_is_alert_not_signal`).
- **R5 — PASS.** Dark source excluded whole-run incl. earlier-term observations (`test_source_dark_mid_run_drops_its_earlier_observations`); map pinned by test (`test_source_platform_map_is_pinned` — incl. `tiktok_creative_center`'s load-bearing absence); blind platforms stated by default (`test_default_run_states_blind_platform_gaps`); open-web proxy never fabricates closed-platform coverage (`test_open_web_proxy_never_fabricates_closed_platform_coverage`); unmapped fetcher refused before any fetch or store write (`test_unmapped_fetcher_refused_before_any_fetch`).
- **R6 — PASS.** `IdentityIndex` (in-memory home, Phase 4 makes durable); double-run and shifted-window idempotency; archived-then-resurging = new episode; index/store desync → new episode not crash (`test_index_record_missing_from_store_is_new_episode_not_crash`).

## Reviewer gates
Two rounds each (the gate cap), then post-round-2 closure of the single residual test-gap per side, with the named test green in the final 295/295 run — the fix evidence is on disk, recorded here rather than in a third spawn.

## Definition of Done audit
Entry gate green; both mapped gates' findings closed; five guard tests green; behaviour and tests in the same change; plan text updated where the gates pinned interpretations (docs-first).

**Verdict: READY** (proof of completion for Phase 4's dependency gate).

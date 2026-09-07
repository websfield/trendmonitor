# Phase 5 review — trend-monitor-runtime

## Report card
**Overall: Ready — MVP milestone reached.** `python -m c1_pattern_engine.detector.run` executes one full nightly scan end-to-end on deterministic fake sources — hydrate → seed → scan → atomic persist — idempotent (byte-identical state on a same-`as_of` re-run), fail-closed, and honest about its blindness. Both gates verified the entry state by running it themselves.

| Gate | Result | One line |
|------|--------|----------|
| Entry checks (ruff + pytest + schemas) | Ready | 324/324 green (10 entrypoint tests), ruff clean, schemas parse; live `python -m` run: 6 signals, gaps stated |
| Measurement (`measurement-reviewer`) | Ready · **A** | "States its blindness, fabricates nothing, every number reproducible from an injected as_of"; reviewer's own byte-identity check passed; 5 low notes — all taken |
| Boundaries (`boundary-reviewer`) | Ready after 1-line fix · B | Sole CHANGE: default state root not gitignored (tenant-scoped data risk on `git add .`) — fixed same day (`.gitignore` + comment); 3 notes taken |
| Acceptance criteria | 6/6 PASS (R1–R6) | evidenced below |
| Definition of Done | met | RUNBOOK cron section added (deployment honestly deferred); stale RUNBOOK honesty lines refreshed |

**Top things to fix (in order):** none blocking. Carried to Phase 8 (noted in its plan): cold-storage seed-duplicate guard + `evict_stale` wiring decision when admissions raise term counts. Phase 7 must rewire the CLI's `--fetchers` (a loud refusal now guards against synthetic-under-live-label).

*Ask `/go` to explain any finding in plain words — or to just fix them.*

---

## Diff scope
NEW `detector/run.py` (entrypoint + scheduling port), `config/tracked-terms.yaml`, `tests/Architecture/test_trend_run_entrypoint.py` (10 tests). MODIFIED `RUNBOOK.md` (nightly-scan section + honesty refresh), `.gitignore` (state root), `docs/plans/trend-monitor-runtime-phase-8.md` (carried notes).

## Acceptance Criteria walk
- **R1 — PASS.** Hydration order implemented and tested; local invocation completes and writes signals (test + a real `python -m` run: 6 signals from 3 terms × {reddit, open_web}); persisted `HUMAN_SUBMISSION` admission survives restart + re-seed **and a hostile same-key seed row cannot relabel it** (test).
- **R2 — PASS.** One invocation = one run; no timer/loop/sleep (reviewer grep); docstring + `--help` + RUNBOOK all state cron is external (the ADR-0009 port).
- **R3 — PASS.** Same-`as_of` CLI runs leave the persisted state **byte-identical** (test upgraded to the reviewer's stronger form).
- **R4 — PASS.** Dark source → zero signals + stated gaps incl. the dark platform; mid-run persist failure → prior state byte-identical and loadable (fault-injection tests); corrupt state refuses to run (Phase 4 semantics).
- **R5 — PASS.** Config is non-secret file/env (`TREND_MONITOR_STATE_ROOT`/`_TERMS_FILE`/`_AS_OF`); nothing sensitive committed (keyless path; gitignored state root); default coverage names `tiktok` + `instagram_reels` (test).
- **R6 — PASS.** `run_once` requires explicit `as_of` (no default); the single documented `now` lives in the CLI layer only; date-only ISO input pins `first_detected_at` to the UTC day start (test).

## Reviewer gates
- **measurement-reviewer: PASS (Ready · A).** All five notes taken same day: byte-identity idempotency test, `--fetchers` guard (refuse anything but `fake` until Phase 7 wires live), RUNBOOK stale version-control claims fixed, cold-seed/evict-stale notes carried to Phase 8's plan.
- **boundary-reviewer: NEEDS CHANGES → closed.** The one CHANGE (ungitignored `.trend-monitor/` that the RUNBOOK instructs operators to create) fixed with the tenancy rationale in the gitignore comment; notes taken (same-key clobber test at entrypoint level, `ENV_AS_OF` constant). All 8 checks held; entry state independently re-run by the reviewer including a two-run idempotency check.

## Definition of Done audit
Entry gate green (324/324 + ruff + schemas); both mapped gates' findings closed with evidence in the final green run; guard tests green; docs updated (RUNBOOK behaviour/config changes documented; ADR-0009 untouched — no invariant moved).

**Verdict: READY — MVP milestone.** Phases 6–9 are additive layers on a runnable, reviewed skeleton.

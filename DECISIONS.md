# Decision Journal — UGC Intelligence

Load-bearing decisions the pack should not relitigate later. One line each: `- <date> — <decision> — because <why>`.
The master plan's "Decisions baked in" table holds the pre-build stack/architecture calls; this file records decisions *settled during the build*.

- 2026-07-10 — Phase 1 boundary reviewer's tenant-isolation finding was fixed (cross-tenant regression test + base-class-aware can-fail guard + `Put` cross-tenant hardening), not accepted as a residual — because a compliance system with untested tenant isolation is not the complete option, and a widening method would otherwise pass the whole suite silently.
- 2026-07-10 — Phase 7 `days_remaining` uses a robust median+MAD estimator (gated at ≥20 resolutions) rather than the plan's literal "curve fit" — because median/MAD keeps Non-negotiable rule 5 intact (never mean/stddev), avoids adding a scipy/statsmodels dependency, and meets the measurement intent (never show a precise number you can't support). Its predictive value must earn its keep in Phase 8 eval or be replaced.

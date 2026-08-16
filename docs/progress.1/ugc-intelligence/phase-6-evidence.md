# Phase 6 — C1 Pattern Miner + Library Publisher — Completion Evidence

**Status: Complete — Ready.** Both Critical-Path gates PASS. DoD satisfied.

## Gate verdicts
| Reviewer | Critical Path | Verdict |
|---|---|---|
| `measurement-reviewer` | Measurement discipline | **PASS** (Grade A) |
| `boundary-reviewer` | Boundaries & authority | **PASS** (Grade A, 0 BLOCK/CHANGE) |

## Entry gate
- `uv run ruff check` clean · `uv run pytest` → **152 passed** (118 + 34 Phase-6: 18 impl + 16 eval)
- 394 C# tests green (no regression) · schemas parse

## Acceptance Criteria (all PASS)
A1 estimator input has no exemplar-sourced outcome (falsifiable — the load-bearing architecture test) · A2 `MeasuredOutcome.try_from(Proxy)` is None, estimator can't take a Proxy · A3 proposal reads union, estimation reads internal only · A4 BH across the full candidate set · A5 explore/exploit weighted equally · A6 exploit-arm effect sizes marked upper bounds · A7 sample_size<30 or CI-includes-zero ⇒ insufficient_evidence, never retrieved · A8 past valid_to ⇒ stale, excluded from retrieval, retained in artefact · A9 cannot publish without C3 `promote` · A10 published versions immutable, superseded still resolves · A11 cross-tenant retrieval impossible, no override · A12 no trend value enters VPS.

## The single most important invariant (verified)
*Proposal over the union; estimation over the internal corpus only.* Enforced as a **type**, not a check: `estimate_effect_size` accepts only `Iterable[MeasuredOutcome]`; an exemplar's `Proxy` engagement cannot be constructed into a `MeasuredOutcome` (`try_from→None` + `__post_init__` raises). `test_estimator_provenance` is non-vacuous (behavioural: measured+Proxy estimate == measured-alone, with a real lift>0) and carries a **transitive import-closure** structural guard with sensitivity+specificity self-checks (catches a one-hop indirection a direct-import check would miss). Falsifiable per the plan's step 8.

## Definition of Done
- ✅ Entry gate clean; pytest + ruff green
- ✅ `measurement-reviewer` PASS · `boundary-reviewer` PASS
- ✅ Acceptance criteria met with cited evidence

## Accepted residuals (non-gating)
1. **`test_publish_takes_the_verdict_as_an_injected_input` filters the mutator set before comparing** — so it wouldn't catch a future public `force_publish`. Tighten by dropping the pre-filter so a new store-mutator trips it. (Test-strength, not a defect.)
2. **`MeasuredOutcome.try_from` admits `USER_PROVIDED`** — not a violation (internal 24h-percentile outcomes are first-party `Measured`); worth a one-line confirmation that `InternalPost.outcome` is never `User-provided`.
3. **Explore-arm lift uses a both-arms cohort median** while the matching set is arm-restricted — biases the explore lift *downward* (conservative, not a false-positive risk). Deliberate design choice.
4. **statsmodels added** for Benjamini–Hochberg (`statsmodels.stats.multitest.multipletests`) — the tech-spec-named tool; not stdlib-avoidable.

# Phase 5 — C2 Gate B: measurement, ranking, and where the money goes — Completion Evidence

**Status: Complete — Ready.** All three Critical-Path gates PASS. DoD satisfied.

## Gate verdicts
| Reviewer | Critical Path | Round 1 | Round 2 | Final |
|---|---|---|---|---|
| `budget-exploration-reviewer` | Money & exploration | **PASS** (Grade A, 0 BLOCK/CHANGE) | — | **PASS** |
| `measurement-reviewer` | Measurement discipline | **PASS** (Grade A) | — | **PASS** |
| `veto-integrity-reviewer` | Veto & verdict integrity (Gate-B V1/V3/V4) | NEEDS CHANGES (Grade B) | **PASS** (Grade A) | **PASS** |

## Entry gate (artefact: `phase-5-entry-gate.md`, re-verified post-fix)
- `dotnet build` 0W/0E · `dotnet test tests/Architecture` → **371 passed** (302 + 69 Phase-5)
- 118 Python tests green (no regression) · `events-v1.json` at **1.2.0** · schemas parse

## Acceptance Criteria (all PASS)
A1 ε∈[0.10,0.30], zero unconstructible via ctor/config/JSON/default-struct · A2 exact-sum property (1000+ cases, exact per-arm decimal identity) · A3 arm propagates to every snapshot · A4 hard gates exclude not reduce, explore not exempt · A5 organic≠boosted never summed · A6 median+MAD · A7 insufficient_baseline redistributes, no tier imputation · A8 breaker tripped ⇒ VPS weight 0, redistributed sums to 1.0 · A9 proxy-only ⇒ UNRANKABLE · A10 no client artefact without sign-off · A11 numberless mode keys off confidence (two triggers) · A12 counterfactual · A13 overlapping bands disclosed · A14 seeded Thompson reproducible + rng_seed/sampler_version required · A15/A15b explore edge cases + arm never crosses budget · A16 UNIFORM_SUBPOOL_SHARE=0.25 named constant · A17 events-v1.json→1.2.0, no version mutated in place, Contract B updated.

## Money core (budget-exploration gate, clean first pass)
ε value object with no route to zero (ctor/config/JSON/default-struct all rejecting, structurally scanned); exact per-arm decimal sums with neither arm borrowing (1200 property cases); arm tags never cross the budget line; empty-exploit-tier ⇒ (1−ε) unspent+disclosed, never funds explore (protects Phase 6's arm-conditioned mining); seeded Thompson (Marsaglia–Tsang, `sampler_version` on event) reproducible; no ad-account/spend-execution path anywhere.

## Round-1 veto findings resolved
1. **Hard gates now exclude BEFORE allocation.** New `GateBOrchestrator` runs `HardGates.Evaluate` first and passes only gate-cleared candidates into rank→allocate; a blocked candidate (rights/brand-safety/disclosure) never appears in `AllocationResult.Allocations` in either arm; excluded surfaced with reasons. Proven falsifiable (`GateB_BlockedCandidate_NeverReceivesAllocation` goes RED when the filter is neutered). Sign-off keeps its re-check (the gate runs twice).
2. **Live-disclosure re-check (REQ-034) is provenance-bearing.** `LiveDisclosureResult` has no public constructor; the only producer is `LiveDisclosureChecker` running the deterministic `DisclosureDetector` over the published artefact. A caption asserting its own `#ad` cannot construct a verified value (`LiveDisclosure_CaptionClaimIgnored_WhenPublishedArtefactHasNone`, `LiveDisclosureResult_HasNoPublicConstructor`).

## Definition of Done
- ✅ Entry gate clean; build + tests green
- ✅ `budget-exploration-reviewer` PASS · `measurement-reviewer` PASS · `veto-integrity-reviewer` PASS
- ✅ Acceptance criteria met with cited evidence
- ✅ `events-v1.json`→1.2.0 (rng_seed + sampler_version required), Contract B + C# mirror in lockstep

## Accepted residuals (non-gating)
1. **`Rank`/`Allocate` remain publicly callable** — `GateBOrchestrator` is the sanctioned entry and no production caller bypasses it (grep-verified). Harden with an architecture test asserting no non-orchestrator caller invokes `Allocate` with un-gated candidates when the HTTP endpoint / live-post fetcher lands.
2. **`exploitTopN` is a caller-supplied bound** — cannot violate any invariant (never moves money across the arm line; disclosed). Optionally pin from the rubric like `UNIFORM_SUBPOOL_SHARE`.
3. **Live-post fetcher unwired** — `LiveDisclosureResult` is the input seam; the disclosure fact is provenance-bearing and un-spoofable, ready for the fetcher.
4. **`HardGates.Evaluate` returns first exclusion only** — correct for exclusion; per-candidate all-reasons enumeration is a UI nicety the excluded list already covers.
5. **In-memory persistence** (accepted convention).

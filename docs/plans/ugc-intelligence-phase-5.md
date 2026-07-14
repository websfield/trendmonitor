# Phase 5 — C2 Gate B: measurement, ranking, and where the money goes

**Depends on:** 4
**Primary agents:** `control-plane-engineer`, `eval-harness-engineer`
**Requirement IDs:** REQ-030…REQ-039
**Critical Paths:** Money & exploration · Measurement discipline · Veto & verdict integrity (V1/V3/V4 re-check at Gate B)

---

## Project Conventions Pinned (READ FIRST)

### Golden rules
1. Read before you write. 2. No secrets. 3. Never destroy what you didn't create. 4. Fix causes, not symptoms. 5. Match the codebase. 6. **Report honestly.** 7. Small, verifiable steps. 8. Scale caution to blast radius. 9. Current facts beat trained memory.

### Non-negotiable rules for this phase
- **Rule 7 — Money & exploration.** ε stays in **[0.10, 0.30] with no path to zero**; every allocation carries an `arm` tag that **propagates to all downstream events and mining**; budgets **sum exactly** to the stated budget; **no recommendation reaches a client without human sign-off (REQ-037)**.
- **Rule 5 — Measurement discipline.** Every rate names a **period-stable denominator**; **organic and boosted series are never summed**; baselines use **median/MAD, never mean/stddev**.
- **Rule 8 — Rights.** `organic_publish` **never** implies `paid_amplification`; a grant without `evidence_uri` is not a grant.
- **Rule 4 — Fail closed.** Breaker `tripped`/`cold` ⇒ VPS weight 0, redistributed to measured terms.
- **Rule 3 — C2 is the sole `OutcomeEvent` writer.**

### Stack
C#/.NET 10. Thompson sampling over a Beta posterior. `decimal` for money — never `double`.

### Anti-patterns
- Assigning the exploration rate a literal zero, in code or config. **The `ugc-epsilon-zero` guardrail blocks this at write time (exit 2).** Floor is 0.10.
- Summing the organic and boosted series. *"Summing them and calling it performance is how a system convinces itself that amplification works."*
- Mean/stddev for a baseline — engagement is heavy-tailed; one prior viral post makes every subsequent post look like an underperformer, **which is precisely backwards**.
- Imputing `OutperformanceRatio` from creator tier — *"imputing from tier is how you rebuild the follower-count ranking you were trying to escape."*
- A hard-gate failure **reducing** a score. A gate failure **excludes**.

### Available agents
`control-plane-engineer`, `intelligence-plane-engineer`, `eval-harness-engineer`, `frontend-engineer`.

---

## Requirements Checklist (functional)
| ID | Requirement |
|---|---|
| REQ-030 | Snapshots at T+24h/48h/7d; **denominator explicitly named and period-stable**; organic and boosted recorded as separate series and **never summed**. |
| REQ-031 | `OutperformanceRatio = post_er_24h ÷ creator.median_er_24h`. Below `trailing_posts_n = 8` ⇒ `insufficient_baseline`; scored on cohort percentile alone with reduced confidence. |
| REQ-032 | AWS 0–100 combining outperformance, cohort percentile, VPS prior, creator standing, audience overlap fit. |
| REQ-033 | Paid usage rights are a **hard gate**. No unexpired `paid_amplification` grant ⇒ **excluded entirely**, displayed `blocked_rights` with the missing grant named. Organic consent, public posting, tagging, branded-hashtag use **never** satisfy this gate. |
| REQ-034 | **Live-post disclosure re-checked at Gate B.** A post compliant at submission but published without disclosure is blocked and escalated. |
| REQ-035 | Allocation **sums exactly** to the stated budget; per-post rationale names the specific evidence. |
| REQ-036 | A fixed proportion of every budget goes to exploration, defaulting to ADR-0003's value. Every allocation tagged `arm: exploit|explore`; **the tag persists into performance tracking**. |
| REQ-037 | Every recommendation passes a **named human reviewer** before reaching a client. Who, when, what modification — recorded. The artefact states it is machine-generated and human-reviewed. |
| REQ-038 | Where confidence is below threshold, the client artefact presents **a ranking without numeric scores** and states the limitation plainly. |
| REQ-039 | Report the **counterfactual**: what "boost the highest raw engagement post" would have selected, and how the recommendation differs. |

## AWS (`rubric-vps-v1.md` §Gate B)
```
AWS = 0.45·OutperformancePercentile + 0.20·CohortPercentile + 0.15·VPS_normalised
    + 0.10·CreatorStanding + 0.10·AudienceOverlapFit
```
**Hard gates first — a failure EXCLUDES, it does not reduce:**
- unexpired `paid_amplification` `RightsGrant` **with evidence** → else `blocked_rights`
- live-post disclosure verified present → else `blocked_disclosure`
- no active brand-safety flag on the creator → else `blocked_brand_safety`
- performance provenance ∈ {`Measured`, `User-provided`} → **proxy-only ⇒ `UNRANKABLE`**, `insufficient_evidence`, reason surfaced

**Redistribution:** breaker `tripped`/`cold` ⇒ `VPS_normalised` weight 0.15 → 0, redistributed to `OutperformancePercentile` and `CohortPercentile`. `trailing_posts_n < 8` ⇒ `OutperformancePercentile` undefined, its 0.45 redistributed to `CohortPercentile`, flagged `insufficient_baseline`, band widened.

**`creator_standing` source is `ace_creator_score`** — the C³ framework's ACE score. **Not Component 3.** C2's only read path to C3 is Contract C (rubric 1.1.0 changelog).

## Budget allocation (ADR-0003; `component-2` §2.11)
```
exploit_budget = (1 − ε)·total     ε default 0.18, floor 0.10, ceiling 0.30, never zero
explore_budget = ε·total
```
- **Exploit:** proportional to `(AWS − AWS_floor)` across top-n eligible.
- **Explore:** Thompson sampling over a Beta posterior on each candidate's outperformance ratio — concentrates spend where rank is **genuinely uncertain**, not where it is confidently low.
- **`insufficient_baseline` candidates have no posterior** → uniform-random sub-pool receiving `UNIFORM_SUBPOOL_SHARE = 0.25` of the explore budget (a named constant, not a magic number; the source docs say "a fixed minority share" without pinning it — pinning it here makes the split testable). *"Genuinely unknown creators are the highest-information arms in the system."*
- **Hard gates apply identically to both arms. Explore does not mean exempt.** Exploration relaxes the score, never the rules.
- Round to platform minimum spend increment; **residual lands on the top exploit candidate** so the total sums exactly.

### The explore draw must be reproducible

Thompson sampling is a stochastic draw, and it allocates **real client money** and generates the evidence the next Pattern Library is mined from. An allocation that cannot be re-derived from the event log is not auditable, and the counterfactual (REQ-039) cannot be reconstructed against it.

**The allocator takes an injected, seeded RNG. The seed is persisted on `AmplificationAllocated` as a *required* field**, alongside the sampler's library version — a Beta draw is floating-point and library-dependent, so a seed alone guarantees reproducibility only within one environment.

This adds `rng_seed` to a published contract, so per **CLAUDE.md rule 9** it is a semantic change that **bumps `events-v1.json` to `1.2.0`** with a changelog entry (Phase 1 already took `1.1.0` for `EXCLUDED_FROM_AI_SCORING`), updates `integration-contract.md` Contract B, and passes the boundaries gate — all in the same change. This is the precedent `rubric-v1.json` set at `1.1.0` when `c3_ace` was renamed. **It never mutates a published version in place.**

`rng_seed` goes in the event's `required` array, not as an optional property. An optional seed is a seed that will be omitted, and an allocation without one is unreproducible — which is the defect this section exists to close. Greenfield makes required-from-inception safe: no historical `AmplificationAllocated` event exists to invalidate.

### Explore-side edge cases the exact-sum invariant must survive

**The invariant is: `exploit_spend ≤ (1−ε)·total` and `explore_spend ≤ ε·total`, always. Neither arm ever borrows from the other.** "Sums exactly to the stated budget" means *the allocated total is exact and fully accounted for*, not that every dollar must be spent.

- **Every below-cutoff candidate is `insufficient_baseline`** (no Thompson-eligible candidate): the entire explore budget flows to the uniform sub-pool. Never under-allocated, never silently returned to exploit.
- **Exploit tier is empty, explore is not** (e.g. every top candidate is `blocked_rights`): the `(1−ε)` exploit budget goes **unspent and disclosed on the client artefact**. It is **never redistributed to the explore arm.** Doing so would tag exploit money as `explore` and poison the arm-conditioned mining in Phase 6 — turning the one source of unconfounded evidence into a lie. The exact-sum property in this case targets the explore budget alone, and `unallocated_exploit` is reported.
- **Explore tier is empty, exploit is not:** symmetrically, the `ε` budget goes unspent and disclosed. **ε is never reduced to zero by an empty explore tier** — an empty tier is a fact about candidates, not a licence to stop exploring.
- **Both tiers empty:** empty recommendation with reasons. `total_allocated == 0`, which still sums exactly.
- Rounding residual lands on the top **exploit** candidate when one exists; when the exploit tier is empty, the residual lands on the top **explore** candidate **within the explore budget**, never adding exploit money to it.

## Edge Cases & Failure Paths
| Question | Answer | Becomes |
|---|---|---|
| **Inverse** | `AmplificationAllocated` ↔ `AmplificationSignedOff`. **Nothing reaches a client before the sign-off event exists.** | `P5-T7` |
| **Double failure** | Breaker `tripped` **and** `insufficient_baseline` → both weights redistribute; `CohortPercentile` is the only surviving *performance-outcome* term (`CreatorStanding` and `AudienceOverlapFit` retain their 0.10 each); band at max width; recommendation says so. | test `Aws_BreakerTrippedAndNoBaseline_RedistributesBoth` |
| **Degraded mode** | Performance provenance is proxy-only → candidate `UNRANKABLE`, not ranked, reason surfaced. Never scored on proxy. | `P5-T2` |
| Highest-AWS post is `blocked_rights` | **Excluded**, surfaced with the missing grant named at T+24h, so the day needed to obtain the grant is available. | test `Ranker_BlockedRights_ExcludedAndNamed` |
| Denominator changed mid-window | Baseline **invalidated and recomputed**, never silently carried. | test `Baseline_DenominatorChanged_Recomputed` |
| Every candidate is gated out | Empty recommendation with reasons. Not an error. Not a relaxed gate. | test `Allocator_AllExcluded_EmptyWithReasons` |
| Budget doesn't divide evenly | Residual to the top exploit candidate; **assert exact sum**. | test `Allocator_SumsExactlyToBudget` (property test) |
| Rank-1 band overlaps rank-4 band | The recommendation **says so** rather than presenting a false ordering. | test `Ranker_OverlappingBands_Disclosed` |
| Exploration rate requested at the floor-breaking value zero | Rejected at the value object; also blocked at write time by the guardrail. | test `ExplorationRate_Zero_Rejected` |
| Exploration rate requested at 0.35 | Rejected (ceiling 0.30). | test `ExplorationRate_AboveCeiling_Rejected` |

## Failure Modes & Degraded Behavior
| Boundary | Failure | Degraded | Reconciliation | Spec |
|---|---|---|---|---|
| Platform analytics / export / provider | Unavailable | No snapshot; `as_of` records the true collection time when it arrives. **Never impute.** | Retry | `Collector_SourceDown_NoImputation` |
| Analytics source | Returns proxy only | `UNRANKABLE`, `insufficient_evidence` | Obtain authorised connection | `Collector_ProxyOnly_Unrankable` |
| C3 breaker | Unreachable | `cold` ⇒ VPS weight 0 | — | Phase 4 |
| Rights store | Grant expired between rank and sign-off | Re-checked at sign-off; excluded. **The gate runs twice.** | Obtain grant | `Signoff_RightsExpiredSinceRanking_Excluded` |
| Event log | `AmplificationAllocated` append fails | Allocation not committed. **Never allocate money whose event was dropped.** | Idempotent retry | `Allocate_EventAppendFails_NotCommitted` |

## Handoff Contracts
```csharp
public sealed record Allocation(Guid LivePostId, Arm Arm, decimal Spend, decimal Aws,
                                string Rationale, ExplorationRate Epsilon, SamplingPolicy Policy,
                                (decimal Low, decimal High) ConfidenceBand, long RngSeed);
public enum Arm { Exploit, Explore }          // propagates to every downstream PerformanceSnapshot
public enum SamplingPolicy { ProportionalExploit, Thompson, UniformRandomNoBaseline }
// RngSeed makes the Thompson draw re-derivable from the event log. Requires events-v1.json -> 1.2.0.
// Consumed by P6 (miner conditions on arm), P9 (UI sign-off).
```

## Implementation Tasks
| # | Task | Owner | File(s) |
|---|---|---|---|
| P5-T1 | Performance collector: T+24/48h/7d; `denominator`, `series`, `provenance`, true `as_of` | `control-plane-engineer` | `.../C2.Api/GateB/PerformanceCollector.cs` |
| P5-T2 | Proxy-only ⇒ `UNRANKABLE`; provenance gate | `control-plane-engineer` | `.../GateB/ProvenanceGate.cs` |
| P5-T3 | `CreatorBaselineService`: **median + MAD**, `trailing_posts_n ≥ 8`, denominator-change invalidation | `control-plane-engineer` | `.../GateB/CreatorBaselineService.cs` |
| P5-T4 | Live-disclosure re-check (REQ-034) + brand-safety + rights hard gates | `control-plane-engineer` | `.../GateB/HardGates.cs` |
| P5-T5 | `AmplificationRanker`: AWS with weight redistribution + confidence bands | `control-plane-engineer` | `.../GateB/AmplificationRanker.cs` |
| P5-T6 | `BudgetAllocator`: exploit proportional, explore Thompson over a **seeded** RNG, uniform sub-pool at `UNIFORM_SUBPOOL_SHARE`, exact sum, arm tags, seed persisted | `control-plane-engineer` | `.../GateB/BudgetAllocator.cs` |
| P5-T6b | **Contract bump**: add `rng_seed` (+ `sampler_version`) to `AmplificationAllocated`'s **`required`** array; `events-v1.json` → `1.2.0` with changelog; update `integration-contract.md` Contract B; **regenerate the C# `UgcIntelligence.Contracts` types** so P0-T5's schema-drift test stays green. Same change, per CLAUDE.md rule 9. | `control-plane-engineer` | `docs/initial/schemas/events-v1.json`, `docs/initial/integration-contract.md`, `src/ControlPlane/UgcIntelligence.Contracts/**` |
| P5-T7 | Sign-off (REQ-037) → `AmplificationSignedOff`; nothing client-facing before it exists | `control-plane-engineer` | `.../GateB/SignoffService.cs` |
| P5-T8 | Client artefact builder + **naive-baseline counterfactual** (REQ-039); breaker-derived numberless mode (REQ-038) | `control-plane-engineer` | `.../GateB/ClientArtefactBuilder.cs` |
| P5-T9 | ε floor/ceiling suite; **arm-propagation suite**; **exact-sum property test**; organic≠boosted; median-not-mean | `eval-harness-engineer` | `tests/Architecture/BudgetExplorationTests.cs` |

## Files to Create / Modify
New under `.../C2.Api/GateB/**`, tests. Modify: add `PerformanceSnapshot`, `AmplificationAllocated`, `AmplificationSignedOff`, `PostPublished`, `RightsGrantChanged` emitters.

## Migration Steps
`dotnet ef migrations add Phase5_GateB` — `LivePost`, `PerformanceSnapshot`, `CreatorBaseline` (with `median_er_24h_denom`), `AmplificationCandidate`, `BudgetAllocation`.

## Verification Steps
1. `dotnet build && dotnet test` green. *(requires P5-T1..T9)*
2. Allocate a budget of 4321 across 7 candidates at the default rate → **sum == 4321 exactly**; every allocation has an `arm`. *(requires step 1)*
3. Configure the exploration rate to the forbidden zero → rejected by the value object; attempt the same literal in a `.cs` file → **guardrail blocks (exit 2)**. *(requires step 1)*
4. Mark a top-AWS candidate's `paid_amplification` grant expired → excluded, `blocked_rights`, missing grant named. *(requires step 1)*
5. Set breaker `tripped` → `VPS_normalised` contributes 0; weights sum to 1.0 after redistribution. *(requires Phase 4)*
6. Give a creator 7 trailing posts → `insufficient_baseline`, 0.45 redistributed, **no imputation from tier**. *(requires step 1)*
7. Attempt to emit a client artefact with no `AmplificationSignedOff` → refused. *(requires step 1)*
8. Assert the counterfactual names what the naive baseline would have boosted. *(requires step 1)*

## Acceptance Criteria
| # | Criterion | Evidence |
|---|---|---|
| A1 | Exploration rate ∈ [0.10, 0.30]; the forbidden zero is unconstructible via constructor, config, **and JSON deserialization** | `ExplorationRateTests` (3 routes) |
| A2 | Budget sums **exactly** for arbitrary budgets/candidate counts | `Allocator_SumsExactlyToBudget` (property test, ≥ 1000 cases) |
| A3 | Every allocation carries an `arm`; it propagates to every downstream `PerformanceSnapshot` | `ArmPropagationTests` |
| A4 | Hard gates **exclude**, never reduce; explore arm is **not exempt** | `HardGateTests.ExploreArmNotExempt` |
| A5 | Organic and boosted never summed | `MeasurementTests.OrganicBoosted_NeverSummed` |
| A6 | Baseline uses median + MAD; a mean-based baseline fails the test | `BaselineTests.MedianAndMad` |
| A7 | `insufficient_baseline` redistributes weight; **never imputes from creator tier** | `BaselineTests.NoTierImputation` |
| A8 | Breaker `tripped` ⇒ VPS weight 0; redistributed weights sum to 1.0 | `AwsTests.Redistribution` |
| A9 | Proxy-only performance ⇒ `UNRANKABLE`, reason surfaced | `Collector_ProxyOnly_Unrankable` |
| A10 | No client artefact without `AmplificationSignedOff` | `Signoff_RequiredBeforeClientArtefact` |
| A11 | Artefact shows ranking **without numeric scores** and states why, whenever confidence is below threshold — which fires on breaker `tripped`/`cold` **or** on `insufficient_baseline` / overlapping bands with an armed breaker. REQ-038 keys off confidence, not breaker state alone. | `ClientArtefactTests.NumberlessWhenNotArmed`, `ClientArtefactTests.NumberlessWhenLowConfidenceDespiteArmed` |
| A14 | The Thompson draw is reproducible: same seed + same candidates ⇒ same allocation; `rng_seed` and `sampler_version` are **required** on `AmplificationAllocated`, and an event omitting either **fails validation** | `Allocator_SeededDraw_IsReproducible`, `AmplificationAllocated_WithoutSeed_FailsValidation` |
| A15 | Explore edge cases: all-`insufficient_baseline` ⇒ whole explore budget to the uniform sub-pool; **empty exploit tier ⇒ `(1−ε)` unspent and disclosed, never moved to explore**; empty explore tier ⇒ `ε` unspent and disclosed, ε never zeroed; both empty ⇒ `total == 0` | `Allocator_ExploreEdgeCases_SumExactly`, `Allocator_EmptyExploitTier_DoesNotFundExploreArm` |
| A15b | **Exploit money never carries an `explore` arm tag, and vice versa**, under any edge case | `Allocator_ArmTag_NeverCrossesBudget` (property test) |
| A16 | `UNIFORM_SUBPOOL_SHARE` is a named constant, and the sub-pool receives exactly that share | `Allocator_UniformSubpoolShare` |
| A17 | `events-v1.json` bumped to `1.2.0` with a changelog (Phase 1 took `1.1.0`); no published version mutated in place; `integration-contract.md` Contract B updated in the same change | schema diff + `integration-contract.md` |
| A12 | Counterfactual computed and included | `CounterfactualTests` |
| A13 | Rank-1/rank-4 band overlap disclosed rather than falsely ordered | `Ranker_OverlappingBands_Disclosed` |

## Out of Scope
No mining, no mechanisms, no ad-account integration of any kind. **The system recommends; it never touches an ad account.**

## Completion Criteria
Entry gate clean; build + tests green; `budget-exploration-reviewer` **PASS**, `measurement-reviewer` **PASS**, `veto-integrity-reviewer` **PASS** (Gate B re-checks V1/V3/V4).

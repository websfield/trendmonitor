---
name: budget-exploration
description: Use whenever a change touches amplification budget allocation, the exploration budget ε, arm tags (exploit/explore), Thompson sampling, AWS-based ranking, spend recommendations, or anything that decides where client money goes. The hard rules — ε ∈ [0.10, 0.30] with no path to zero; every allocation carries an arm tag that propagates downstream; budgets sum exactly; recommendations are human-signed-off and never executed. Mandatory before writing any allocator, ranker, or budget code, and before editing ADR-0003 or the budget sections of the rubric.
---

# Money & Exploration Budget

## The invariants

1. **ε defaults to 0.18, floor 0.10, ceiling 0.30, and cannot be set to zero** (ADR-0003). "A configuration option that can be set to zero will be set to zero." The floor belongs in the commercial agreement, not in a product setting. Without reserved exploration, the Pattern Library trains on its own outputs, converges on one narrow region of content space, and its effect sizes become artefacts of its own allocation policy (pattern collapse).
2. **Every allocation is tagged `arm ∈ {exploit, explore}`** (REQ-036), and the tag **propagates into every downstream PerformanceSnapshot and into mining**. It is "the most valuable field in the system"; dropping it "converts the exploration budget into a donation."
3. **Explore-arm outcomes are weighted equally with exploit-arm** when updating the library (REQ-053) — they are the only unconfounded evidence.
4. **Hard gates apply identically to both arms** — vetoes, rights, disclosure. "Exploration relaxes the score, never the rules." Explore does not mean exempt.
5. **Allocation arithmetic is deterministic C#** (REQ-035): exploit share `(1-ε)` proportional to `(AWS − AWS_floor)` over the top-n; explore share `ε` via Thompson sampling (Beta posterior on outperformance ratio); `insufficient_baseline` creators get a uniform-random pool with a fixed minority share. The total **sums exactly** to the stated budget; amounts round to the platform minimum spend increment; any residual lands on the top exploit candidate.
6. **The system recommends; it never spends.** No integration executes against Meta Partnership Ads / TikTok Spark Ads / any ad account — execution stays manual with the client. **No recommendation reaches a client without human sign-off** (REQ-037), and the client artefact includes the naive-baseline counterfactual and states the ranking is machine-generated, human-reviewed.
7. **AWS composition is fixed canon**: `0.45·OutperformancePercentile + 0.20·CohortPercentile + 0.15·VPS_normalised + 0.10·CreatorStanding + 0.10·AudienceOverlapFit`; when the breaker is tripped, the VPS weight goes to 0 and redistributes to the measured terms. Hard gates exclude candidates entirely — they never merely reduce a score.

## Why

This path allocates real client money and simultaneously generates the training data for the next library. A mistake here is doubly silent: the spend report still balances, and the corrupted `arm`/allocation data poisons every downstream effect-size estimate. The short-run cost of exploration (~ε × the exploit/explore performance gap) is stated to the client — it is the price of the model staying calibrated.

## Where the canon lives

- ADR-0003 (`docs/initial.past/adr/0003-exploration-budget.md`) — the whole argument
- `docs/initial.past/rubric-vps-v1.md` §Budget · `docs/initial.past/schemas/rubric-v1.json` (`aws`, epsilon bounds)
- `docs/initial.past/component-2-scoring-amplification.md` §2.10 (ranker), §2.11 (allocator)
- `docs/initial.past/schemas/events-v1.json` (`AmplificationAllocated`, `AmplificationSignedOff`, arm invariant)

## Anti-patterns

- An ε of zero, an `enable_exploration` boolean, a per-campaign ε exemption, or validation allowing ε outside [0.10, 0.30].
- An allocation, snapshot, or mining record without an `arm` field — or an `arm` defaulted rather than propagated.
- Down-weighting or filtering explore-arm outcomes in mining "because they scored low" — that is the point of them.
- Any code path that calls an ad platform API to execute spend, or surfaces a recommendation without `AmplificationSignedOff`.

While code doesn't exist yet, these invariants gate **doc edits**: a change that weakens the ε floor, drops the arm tag from an event schema, or removes the sign-off step must update ADR-0003 and events-v1.json together — see CLAUDE.md rules 6 and 8.

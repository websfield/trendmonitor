# ADR-0003: Exploration Budget in Amplification Allocation

**Status:** Accepted
**Date:** 2026-07-09
**Deciders:** Fred
**Related:** [ADR-0002](0002-two-gate-scoring-architecture.md)

---

## Context

The Pattern Engine learns from what it observes. Gate B decides what gets amplified. Amplified posts receive more distribution, more engagement, and therefore more weight in the next round of pattern mining.

If Gate B allocates the entire budget to its highest-ranked candidates, the feedback loop closes on itself. The system amplifies the pattern it currently believes in, that pattern accumulates the strongest outcome evidence because it received the most distribution, the pattern's effect size grows in the library, and the next round of scoring ranks it higher still. Within two or three quarters the Pattern Library describes one narrow region of content space with great confidence and knows nothing about anywhere else. The agency's briefs converge on that region. The creators converge. The feed learns the shape and the audience stops registering it as new.

This is not a hypothetical. It is the standard behaviour of any recommender that trains on its own outputs without a source of counterfactual evidence, and the mechanism is well understood: without exploration, the estimated value of the unchosen arms never updates, so they are never chosen. The system does not learn that it was wrong; it learns nothing at all about the alternatives.

There is a second, related problem. The observational data available to pattern mining is confounded by exactly the decision Gate B makes. A post that was amplified performed better - partly because it was good, and partly because it was amplified. Regressing outcome on content features across a corpus where amplification was assigned by score is regressing outcome on a variable that caused the treatment. The effect sizes in the Pattern Library are biased upward for exactly the patterns the system already believes, and the bias is invisible from inside the data.

None of the four studied repositories mentions this. scrollclaw comes closest, with its "winner replication" guidance to replicate the *pattern* rather than the content and to test variations - but replication of winners is exploitation, and its variations are drawn from the neighbourhood of the winner. That is a local search. It never leaves the basin.

## Decision

**Reserve a fixed, non-negotiable proportion of every amplification budget for content the model does not rank in the exploit tier. Tag every allocation with its arm. Weight explore-arm outcomes equally with exploit-arm outcomes in pattern mining.**

Default ε = 0.18. Configurable per campaign within `[0.10, 0.30]`. Not configurable to zero.

**Exploit tier** receives `(1 - ε)` of the budget, allocated proportional to `(AWS - AWS_floor)` across the top-n eligible candidates.

**Explore tier** receives `ε`, allocated among eligible candidates ranked below the exploit cutoff. The v1 sampling policy is Thompson sampling over a Beta posterior on each candidate's outperformance ratio, which naturally concentrates exploration on candidates whose performance is uncertain rather than on those confidently ranked low. Where the posterior cannot be formed - a creator with `insufficient_baseline` - the candidate enters a uniform-random pool that receives a fixed minority share of the explore budget. Genuinely unknown creators are the highest-information arms in the system and a policy that never samples them will never learn about the next tier of talent.

Hard gates apply identically to both arms. Explore does not mean exempt: a post with no paid rights grant, or a missing live disclosure, is excluded from exploration exactly as it is excluded from exploitation. Exploration relaxes the score, never the rules.

**Every allocation carries `arm ∈ {exploit, explore}`,** and that tag persists into `PerformanceSnapshot` and into the pattern-mining input set. Explore-arm outcomes are the only unconfounded evidence this system will ever have about content the exploit policy would have passed over. They are the point.

**The client sees this.** The recommendation artefact states that a stated proportion of budget is allocated to testing, names the posts, and explains why. It is presented as what it is: the mechanism by which next quarter's recommendation is better than this quarter's. An agency that quietly runs an exploration budget it has not disclosed has a problem the first time an explore-arm post underperforms and a client asks why it was funded.

## Consequences

**Short-run performance is measurably worse.** In expectation, allocating 18% of budget to non-top-ranked content produces lower immediate campaign performance than pure exploitation would. This cost is real, it is roughly bounded by ε times the average performance gap between exploit and explore tiers, and it must be stated to the client rather than hidden. The return is that the Pattern Library keeps learning and the recommendation keeps improving, which is the only thing that makes this system worth more than a spreadsheet sorted by engagement.

**ε cannot be set to zero, and this will be argued about.** A client under quarterly pressure will ask for pure exploitation "just this once." The technically correct answer is that a system which stops exploring stops being able to justify its own recommendations within two quarters, because its effect sizes become artefacts of its own allocation policy. The floor at 0.10 exists so that the argument is about how much, not whether. This should be settled in the commercial agreement rather than in the product, because a configuration option that can be set to zero will be set to zero.

**Pattern mining must condition on arm.** Effect sizes estimated across the pooled corpus without conditioning on treatment assignment inherit the confounding this ADR exists to prevent. The mining step weights explore-arm observations to correct for the exploit policy's propensity, or - simpler and preferred for v1 given the sample sizes involved - estimates effect sizes on explore-arm data alone where sufficient, and treats exploit-arm effect sizes as upper bounds requiring replication. Where n is too small to do either honestly, the pattern stays at `insufficient_evidence`. This is slow and it is correct.

**The exploration budget is the mechanism that surfaces new creators.** A nano creator with no baseline can never rank in the exploit tier, because `OutperformancePercentile` is undefined for them and the redistributed weight lands on `CohortPercentile`, where they are structurally disadvantaged by audience size. Without a uniform-random slice of the explore budget, the system would only ever amplify creators it has already amplified. The talent pipeline is not a side effect of exploration. It is one of its primary returns.

**Reporting gets a new axis.** Every performance report splits exploit and explore. A quarter where explore-arm posts systematically outperform exploit-arm posts is a quarter where the model is wrong and the report will say so before anyone has to notice it manually. This is uncomfortable and it is the point.

## Alternatives Considered

**Pure exploitation, revisit later.** Rejected. "Add exploration later" does not work, because by the time you add it the Pattern Library has already collapsed onto the exploit region and the explore arm is sampling from a distribution the library cannot evaluate. Exploration has to be there from the first campaign, which is why the PRD puts it in Phase 5 alongside Gate B going live rather than in a subsequent phase.

**Epsilon-greedy with uniform random exploration.** Simpler, and a defensible v1. Rejected in favour of Thompson sampling because uniform random exploration spends the same budget on a candidate confidently ranked last as on one whose rank is genuinely uncertain, and the latter is where the information is. Uniform random is retained for the `insufficient_baseline` sub-pool specifically, where there is no posterior to sample from and uniform is therefore correct.

**Full contextual bandit over content features.** Attractive, and wrong at this data scale. A contextual bandit needs enough observations per context to estimate a policy, and an agency's campaign volume gives hundreds of posts per year across many contexts. Fitting a policy on that is fitting noise. The right instrument at this scale is a rubric with an exploration slice and honest confidence bands. Revisit when the closed-loop corpus passes a few thousand labelled posts per vertical, which is years away and may never arrive.

**Let the campaign manager pick the explore posts manually.** Considered and partially adopted. A manager's override on the explore selection is permitted and recorded. It is not the default, because a human choosing which content to test will choose the content they find interesting, which is a sample drawn from the same taste distribution the system is trying to escape. The machine's job here is specifically to fund things nobody would have chosen.

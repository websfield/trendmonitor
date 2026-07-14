# ADR-0006: Mechanisms, the Warrant Ladder, and What "Transferable" Is Allowed to Mean

**Status:** Accepted
**Date:** 2026-07-10
**Deciders:** Fred
**Related:** [ADR-0001](0001-trend-signal-sourcing.md) · [ADR-0003](0003-exploration-budget.md) · [ADR-0004](0004-trend-detection-and-submission.md)
**Amends:** ADR-0004, which says "trends are disposable, mechanisms compound" and never says what a mechanism *is*
**Corrects:** [tech-spec-ugc-intelligence.md](../tech-spec-ugc-intelligence.md), whose pattern-mining section computed effect sizes over a corpus union containing `Proxy` outcomes

---

## Context

ADR-0004 settled that trends and patterns are different objects with different half-lives, and closed with a sentence that has been load-bearing ever since:

> The Pattern Engine then mines the *mechanism* underneath the format — why the running-late GRWM works is that its hook is a self-deprecating problem statement inside 1.2 seconds — and the mechanism is what survives when the format dies. Trends are disposable. Mechanisms compound.

Nothing in the document set operationalises that sentence. `Pattern`, as specified in the tech spec, is an assertion plus a machine-evaluable predicate plus an effect size, scoped to `(tenant, vertical, platform)`. That is a claim that a feature *correlated with outcome, here*. It is a **what**. The **why** — the reason the structure works, the thing that would let it transfer to a format nobody has invented yet — has no entity, no schema, no evidence standard, and no consumer.

This matters more than a naming gap, because there is a second problem sitting underneath it.

**The exemplar corpus cannot carry an effect size, and the tech spec asks it to.** ADR-0001 established that every keyless public read is `Proxy`, without exception, and that Proxy values "inform trend reports and never enter an effect-size calculation." The exemplar corpus is built by ranking public posts on engagement rate against each creator's own baseline — engagement rate that, on TikTok, Instagram, and LinkedIn, has no compliant keyless read surface and is therefore Proxy or absent. Yet the tech spec's mining step says it "runs on a schedule over **the union** of the exemplar corpus and the internal labelled corpus" and computes "the lift in 24h engagement-rate percentile."

That union computes a lift over Proxy outcomes and feeds the result into VPS retrieval. It is the exact laundering ADR-0001 exists to prevent, and it is invisible because it happens inside a word — "union" — that sounds like plumbing.

The resolution was already written, twice, and never enforced. ADR-0001: *"The exemplar corpus is the prior; the internal corpus is the likelihood."* Component 1 §1.5: *"the internal corpus... is the primary source and the exemplar corpus is the prior."*

The prior and the likelihood were always two different objects. They have been wearing one name.

**And there is a third pressure, which is commercial and which is the reason this ADR exists now.** The compounding asset this system produces is supposed to be knowledge: what works, for which vertical, on which platform, and why. An agency wants that knowledge in front of the person writing next quarter's brief, and increasingly wants it reachable by a machine. The obvious way to build it — pool every tenant's outcome data, mine across the pool, sell the result — is prohibited by the separation invariant in [compliance-notes.md](../compliance-notes.md), which is not merely a data-protection control but the thing that keeps a minority shareholding from becoming an information-flow allegation.

So: the knowledge that transfers may not be built from the data that would make it strong.

## Decision

**Split the prior from the likelihood. Name the prior a `Mechanism`. Forbid it a number. Give it a falsifier and a warrant. Serve it, and never let it near a score.**

### 1. Two objects, permanently separate

| | **Mechanism** | **Pattern** |
|---|---|---|
| Answers | why a structure might work | whether a predicate predicted, in this tenant |
| Mined from | public exemplar corpus + trend signals | internal outcome events, conditioned on `arm` |
| Tenancy | tenant-neutral **by construction** | tenant-scoped, never crosses |
| Carries | statement, predicate, prevalence, **falsifier**, warrant | effect size, CI, sample size, validity window |
| Provenance | Proxy-selected, Measured-evaluated | Measured / User-provided |
| Consumed by | C4 Knowledge API, and briefs written by humans | C2's retrieval step, at score time |
| Effect size | **forbidden by schema** | required |

A Mechanism is a hypothesis. A Pattern is that hypothesis tested against one tenant's outcomes. The Pattern never leaves its tenant, so the Mechanism never learns whether it was right. **That is the price of the separation invariant, and this ADR pays it explicitly rather than letting someone discover it later by finding tenant data in a shared artefact.**

### 2. Mining is two stages, not one

The tech spec's "union" is corrected:

- **Proposal** runs over the union. The exemplar corpus proposes candidate feature predicates generously — it is cheap, it is biased, and proposing is harmless because promotion is where the discipline lives. Trends direct where it proposes.
- **Estimation** runs over the internal corpus **only**, conditioned on `arm` per ADR-0003. No `Proxy` value enters an effect size. Ever.

Nothing about the Pattern Library, VPS, AWS, the breaker, or C3's authorities changes. This is a correction to a doc that mis-stated what the mining step was already required to do.

### 3. A mechanism without a stated falsifier is not a mechanism

The eval plan's standard — *"Everything below is written so that the system can be shown not to work. If none of these tests can fail, none of them are tests"* — applies to knowledge as much as to scorers.

Every `Mechanism` carries a `falsifier`: the observation that would sink it, written down **before** the evidence is gathered. A structural claim with no stated falsifier is a caption on a chart. The schema requires the field.

### 4. The warrant ladder — what you may say, given what you observed

`warrant` is a rung, not a confidence score. It governs the verbs.

| Rung | Requires | You may say | Served |
|---|---|---|---|
| `conjectured` | a predicate proposed from the corpus or a trend | "a shape somebody noticed" | no |
| `recurrent` | ≥ 8 independent creators, ≥ 2 cohorts, **≥ 2 unrelated trends** | "recurs among high performers across unrelated trends" | yes |
| `contrasted` | recurrent, and prevalence ratio ≥ 2.0 on the mining slice **and** ≥ 1.5 on a temporally disjoint slice | "…and is materially absent from the same creators' non-performers" | yes |
| `falsified` | the asymmetry did not survive a corpus refresh | nothing; retained in the artefact forever | no |
| ~~`deconfounded_within_tenant`~~ | explore-arm internal outcome data | — | **out of scope by design** |
| ~~`interventional`~~ | explore allocations stratified on the predicate | — | **out of scope by design** |

`n_trends ≥ 2` is the operationalisation of ADR-0004's closing sentence. A predicate observed only inside one trend's posts *is that trend*, wearing a lab coat. Two unrelated trends is the minimum evidence that a structure outlives any one format.

The top two rungs are named and refused. Naming them is the point: a ladder whose top is invisible gets climbed by accident. `deconfounded_within_tenant` would require a tenant's outcomes to inform a tenant-neutral artefact. `interventional` would require stratifying the explore budget on a predicate rather than on rank-uncertainty, which trades away the Thompson objective ADR-0003 chose and, at hundreds of posts per year, would rarely have the power to detect anything.

**Nothing on this ladder is a causal claim.** `contrasted` is the highest rung reachable, and it means a descriptive asymmetry on a proxy-selected sample. The words `causes`, `lifts`, `drives`, and `predicts` are unavailable at every rung.

### 5. Prevalence is a count. It is never a lift.

A Mechanism reports `prevalence_in_top_decile`, `prevalence_in_contrast_set`, and their ratio.

The distinction that keeps this legal under ADR-0001: **top-decile membership was selected using Proxy engagement, but the predicate is evaluated deterministically over the `FeatureRecord` extracted from the media itself.** A prevalence is a count over a proxy-*selected* set, not an aggregation of proxy *values*. No Proxy number is displayed, averaged, or compared as Measured anywhere in the artefact. The provenance label says exactly this: `Proxy-selected, Measured-evaluated`.

The contrast set is named explicitly, because a prevalence without a comparison group is a number with no meaning. v1: **the same creators' posts that did not reach their own top decile.**

**This costs an extraction budget the source recipe does not spend.** corey's `reverse-engineering.md` keeps the top decile and discards the rest; C1 §1.5 must now extract and retain both sets under the same `extractor_version`. Roughly a multiple of the extraction cost, and unavoidable: without the contrast set there is no asymmetry, no falsifier, and therefore no mechanism — only the observation that winners talk to a camera, which is also true of everyone else.

Same creators controls for audience size. Same platform controls for format norms. Nothing controls for the content nobody ever made — both halves are drawn from creators already selected for consistent high performance, so the contrast set is *a winner's ordinary work*, not *a loser's work*.

Every mechanism ships `never_tested_against: "content that was attempted and failed"`, and the field is not removable. The exemplar corpus is a sample of winners. That is stated on the artefact, on the API response, and in the client-facing description, rather than being a caveat in a design doc that nobody reads twice.

Prevalences are computed **within one cohort** and never pooled across cohorts, because two `(vertical, platform)` populations are not one population. `n_cohorts` is a recurrence count, not a pooling instruction.

### 6. Automatic to demote, human to promote

On every corpus refresh, `prevalence_ratio` is recomputed on the new temporal slice. A `contrasted` mechanism whose asymmetry vanishes **auto-demotes to `falsified` and is withdrawn from the API the same cycle**, with no human step.

Promotion runs the other way. A named human ratifies the `statement` — model-drafted prose — before any rung is served. `ratified_by`, `ratified_at`, and a non-empty **`ratification_note`** are required fields, and a mechanism without them is never served.

The recorded reason is deliberate symmetry with Contract C's arming rule: *automatic to trip, manual **with a recorded reason** to arm.* And because REQ-021 teaches that a human step without a decay signal becomes a rubber stamp, **ratification volume, median latency, and rejection rate are reported per cohort, continuously.** A ratifier clearing a quarter's candidates in one sitting is the same signal as a manager approving forty submissions in ninety seconds.

**What ratification does not referee.** It reviews the prose, not the counts. Nobody independently recomputes a prevalence, the way C3 recomputes a Spearman on paired held-out submissions. This is the one place a producing component self-gates its own evidence, and it is tolerable only because four properties bound the blast radius: no number reaches a decision, no tenant datum is present, the artefact is immutable and content-addressed against a named corpus snapshot, and a mis-counted prevalence auto-demotes at the next refresh without anyone choosing to look. **Remove any one of those four and this needs a referee.**

This is the same asymmetry as the circuit breaker in Contract C, adopted for the same reason: the pressure to widen a threshold arrives at exactly the moment the threshold is telling the truth.

### 7. C3 has no role here, and that is not an oversight

C3's authority is calibration: it referees numeric predictions against measured outcomes. A Mechanism makes no numeric prediction and touches no outcome data. There is nothing for C3 to referee, and handing it a veto would be authority theatre — a gate that cannot fail for a reason, staffed by a referee with no evidence.

C3's two authorities (the breaker flag, the Pattern Library promotion veto) are unchanged and unextended by this ADR. The consequence is a property worth stating: **C4 has zero dependency on C3**, because it serves nothing a breaker governs.

## Consequences

**The Knowledge API can never say "this causes lift," and the first person who asks for a number will be disappointed.** What it can say is: *this structure recurs among high performers across N unrelated trends, is materially absent from the same creators' non-performers on a slice it was not mined from, here is the falsifier, and it has never been tested against content that was attempted and failed.* That is a stronger sentence than a fabricated effect size, and it is the only sentence the evidence supports. Somebody will want the number anyway. The number lives behind the tenancy boundary, in the Pattern Library, and it stays there.

**The mechanism library will be small and slow, and most conjectures will die at `conjectured`.** Eight independent creators across two cohorts and two unrelated trends is a demanding bar for a corpus of 200–500 posts per `(vertical, platform)`. This is correct. A library that promotes readily is a library describing the corpus it was mined from.

**Two mining stages means two failure modes to monitor rather than one.** Proposal can go quiet (no new predicates — the corpus has stopped refreshing) or estimation can go quiet (no new effect sizes — the outcome loop has stalled). Previously these were one number and one alarm, and a stalled outcome loop could hide behind a busy corpus builder.

**Falsification is now a routine, visible event, and it will look like failure.** A quarterly report that says "three mechanisms were falsified this cycle" reads, to a client, as the system having been wrong. It is the system working. The alternative — a library where nothing is ever withdrawn — is a library nobody has checked. Expect to have this conversation, and expect to have it more than once.

**The trend → mechanism coupling now makes a falsifiable claim, so it can be shown not to work.** ADR-0004 asserts that trend-directed exemplar ingestion points the corpus builder at the right place. Nothing measured whether it does. The eval plan now carries a gate: do mechanisms mined from trend-directed ingestion reach `contrasted` at a higher rate than those from uniform ingestion? If not, the coupling is a nice sentence and the ingestion priority should be uniform.

**Model-drafted prose leaves the system through an external API, which is a new surface and a new risk.** A `statement` is generated text about content that was itself untrusted. It is fenced as untrusted input everywhere upstream, it is never machine-consumed downstream, and a named human ratifies it before it is served. That is three controls, and the third one is the only one that would survive a determined prompt injection. It is why ratification is a required field rather than a workflow step.

## Alternatives Considered

**Pool tenant outcome data under explicit consent, mine across the pool, and get real effect sizes.** This is the option with by far the most statistical power — ADR-0001 says so plainly: five beauty clients pooled would clear every evidence threshold five times faster. Rejected. It requires rewriting the separation invariant, and compliance-notes.md names the specific hazard: where a tenant is an agency holding a minority shareholding in another portfolio entity, the boundary is what keeps a shareholding from becoming an information-flow allegation. Nothing about this system's value depends on relaxing it; everything about its defensibility depends on not.

**Meta-analyse per-tenant effect sizes without moving row-level data.** Genuinely attractive, and the standard answer in the literature: combine per-cohort effect sizes, report heterogeneity, never pool rows. Rejected for v1 on a narrower ground than it deserves. A published pooled effect size, or even a count of "3 of 5 tenants confirmed this," is information derived from tenant outcome data appearing in a tenant-neutral artefact. At five tenants with distinguishable verticals, that is re-identifiable in practice. The invariant says outcome data never crosses; a summary statistic of outcome data is outcome data at lower resolution. Revisit if the tenant count reaches the dozens, where a k-anonymity argument is available. It is not available at five.

**Let Mechanisms enter VPS retrieval alongside Patterns, as an additional anchor.** Rejected on three independent grounds, any one sufficient. It launders Proxy-selected evidence into a number shown to a client. It breaks the reproducibility of a VPS from its pinned `(extractor × rubric × pattern_library)` triple, because a fourth artefact now moves underneath the score. And it is the same mistake ADR-0004 already rejected for trends, arriving through a different door — a scorer with a nightly-refreshing input cannot be evaluated on a temporally held-out split.

**Give the Mechanism an effect size computed on the exemplar corpus, labelled `Proxy`, and trust the label to travel.** Rejected, and this is the alternative that was hardest to refuse, because the label really would be correct at the point of computation. It fails one hop downstream. A number that exists gets copied into a slide, and the label does not come with it. ADR-0001 chose structural provenance over documentary provenance for exactly this reason. The schema therefore does not have a nullable `effect_size`; it has `additionalProperties: false` and no such key, so adding one later breaks validation rather than shipping quietly.

> **The obvious retort, which deserves an answer rather than silence.** `prevalence_ratio` is *also* a number, and `2.45` reads like a 2.45× multiplier the moment it is detached from its wrapper. If "the label does not travel with the number" kills `effect_size`, why does it not kill `prevalence_ratio`?
>
> Because they fail in different places. An `effect_size` mined over Proxy engagement aggregates a **Proxy value into a magnitude**. That breaches ADR-0001's hard invariant *at the point of computation* — before anyone copies anything, before any label is dropped, in the estimator itself. A `prevalence_ratio` is the quotient of two deterministic **counts** over a proxy-*selected* set. No Proxy value is aggregated, displayed, or compared as `Measured`. The invariant holds wherever the number travels, because the violation never occurred.
>
> What remains is **misreading, not laundering**, and it is mitigated rather than eliminated: the field is never named `lift`; `warrant`, `never_tested_against`, and the provenance label ride on every response; the forbidden-verb lexicon bars causal language at ratification and at serve time. **The residual risk is accepted and named here** — because a mechanism carrying no quantity at all could not be falsified, and falsifiability is the entire point of the object. A claim with nothing to measure cannot be shown to be wrong, which would make it exactly the thing this ADR was written to prevent.

**Set the warrant thresholds by derivation rather than by guess.** Not rejected — attempted, and abandoned honestly. `prevalence_ratio ≥ 2.0` on the mining slice and `≥ 1.5` on a disjoint slice are guesses wearing precision, in the same class as the `authenticity_register` weight of 0.06 that the eval plan openly flags. With `n_creators` as low as 8 and no significance test, a 1.5× asymmetry sits close enough to 1.0 to be sampling noise. There is no derivation available, because there is no sampling model that honestly describes "the top decile of a hand-curated creator allowlist ranked on proxy engagement," and inventing one to justify a number would be worse than admitting the number is a starting point. The mitigation is the recalibration rule, stated in advance: **if a majority of proposed predicates reach `contrasted` in the first year, the bar is too low and the corpus is too small, in that order.**

**Let C3 gate mechanism promotion, for symmetry with library promotion.** Rejected. C3 referees predictions against outcomes, and a mechanism has neither. A gate that cannot fail for a stated reason is a gate that teaches people gates are decorative — and the two gates C3 actually holds are the ones that must never be treated that way.

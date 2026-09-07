# UGC Intelligence — Document Set

**This is not a system for finding out what is viral. It is a system for finding out why — and for saying so in a sentence that can be shown to be wrong.**

Trends move nightly. Formats die. What survives a format's death is the *structure underneath it*: the reason a running-late GRWM works is not that it is a GRWM, but that its hook is a self-deprecating problem statement inside 1.2 seconds. Trends are disposable. Mechanisms compound. The whole architecture below is an attempt to keep those two things apart, because everything goes wrong when they are confused.

**Four components on ClientHub.** The PRD was written as two. [ADR-0005](adr/0005-three-components-and-the-referee.md) explains why the third is not optional. [ADR-0007](adr/0007-the-knowledge-api-boundary.md) explains why the fourth is a component and not a controller.

1. **Pattern Engine (C1)** — *produces beliefs.* Monitors trends, builds an exemplar corpus, assembles a labelled corpus from C2's outcome events, and cuts two very different libraries from them.
2. **Scoring and Amplification Service (C2)** — *acts on beliefs.* Applies them at two gates: submission approval, and post-publication amplification.
3. **Calibration Monitor (C3)** — *referees.* Sole authority over the circuit breaker, sole veto over pattern-library promotion. Exists because neither of the others can be allowed to grade its own homework.
4. **Knowledge API (C4)** — *serves beliefs.* Read-only. Holds no tenant data. Answers *why*, never *how much*.

They share five contracts, one shared Extraction Service, and nothing else. **C2 never calls C1. C2 never calls C4.** Start with the [integration contract](integration-contract.md).

---

## The one distinction this document set exists to protect

| | **Mechanism** | **Pattern** |
|---|---|---|
| Answers | **why** a structure might work | **whether** a predicate predicted, here |
| Mined from | public exemplar corpus + trends | internal outcome events, conditioned on `arm` |
| Tenancy | tenant-neutral **by construction** | tenant-scoped, never crosses |
| Carries | statement, predicate, prevalence, **falsifier**, warrant | effect size, CI, sample size, validity window |
| Provenance | `Proxy`-selected, `Measured`-evaluated | `Measured` / `User-provided` |
| Effect size | **forbidden by schema** | required |
| Consumed by | C4, and humans writing briefs | C2's retrieval step, at score time |
| Gated by | a named human ratifying the statement | C3's `LibraryVerdict` |

A Mechanism is a hypothesis. A Pattern is that hypothesis tested against one tenant's outcomes. **The Pattern never leaves its tenant, so the Mechanism never learns whether it was right.** That is the price of the separation invariant, and [ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md) pays it explicitly rather than letting someone discover it later by finding tenant data in a shared artefact.

---

## Read in this order

| Doc | What it settles |
|---|---|
| [prd-ugc-intelligence.md](prd-ugc-intelligence.md) | Problem, users, requirements, success metrics, phased roadmap |
| [adr/0005](adr/0005-three-components-and-the-referee.md) | Why there are components who may grade whom |
| [adr/0006](adr/0006-mechanisms-and-the-warrant-ladder.md) | **What a mechanism is, what "transferable" is allowed to mean, and why no number is attached** |
| [adr/0007](adr/0007-the-knowledge-api-boundary.md) | Why the Knowledge API is a fourth component holding no tenant data |
| **[integration-contract.md](integration-contract.md)** | **How the four components talk. Contracts A–E, sequences, failure semantics.** |
| [component-1-pattern-engine.md](component-1-pattern-engine.md) | C1: term registry, source adapters, detector, corpus builders, miner, mechanism synthesiser, publishers |
| [component-2-scoring-amplification.md](component-2-scoring-amplification.md) | C2: compliance gate, three lanes, verdict engine, collector, ranker, allocator |
| [component-3-calibration-monitor.md](component-3-calibration-monitor.md) | C3: the referee — the calibration statistic, the breaker states, automatic-trip/manual-arm, Contracts C and D |
| [component-4-knowledge-api.md](component-4-knowledge-api.md) | C4: resolver, warrant filter, response composer, coverage reporter |
| [adr/0002](adr/0002-two-gate-scoring-architecture.md) | Why approval and amplification are separate decisions at separate times |
| [adr/0001](adr/0001-trend-signal-sourcing.md) | Where data comes from, and why a `Proxy` value never enters an effect size |
| [adr/0003](adr/0003-exploration-budget.md) | Why 18% of every amplification budget funds content the model ranks low |
| [adr/0004](adr/0004-trend-detection-and-submission.md) | Why trends never touch the score, and why human submission is structural |
| [adr/0008](adr/0008-durable-outcome-and-artefact-store.md) | The durable outcome-event and artefact store, and the erasure tension (records a deferral with exit criteria) |
| [adr/0009](adr/0009-trend-monitor-runtime.md) | Why the nightly trend monitor is a Python entrypoint behind a scheduling port, not a Hangfire job |
| [rubric-vps-v1.md](rubric-vps-v1.md) | The actual scoring: vetoes, VPS, BAS, AWS |
| [schemas/rubric-v1.json](schemas/rubric-v1.json) | Machine-readable rubric |
| [schemas/events-v1.json](schemas/events-v1.json) | Machine-readable event and breaker contracts |
| [schemas/mechanisms-v1.json](schemas/mechanisms-v1.json) | Machine-readable mechanism contract and warrant ladder |
| [tech-spec-ugc-intelligence.md](tech-spec-ugc-intelligence.md) | Architecture, data model, pipelines, API surface, failure modes |
| [tech-spec-trend-subsystem.md](tech-spec-trend-subsystem.md) | Trend detection maths, submitter scoring, requirement deltas |
| [tech-spec-knowledge-layer.md](tech-spec-knowledge-layer.md) | Mechanism data model, prevalence maths, warrant ladder, REQ-060–070 |
| [eval-and-calibration-plan.md](eval-and-calibration-plan.md) | The tests that can fail. Read this before writing any scorer or any mechanism. |
| [compliance-notes.md](compliance-notes.md) | APP 8, automated decision-making, minors, disclosure, rights, and the knowledge layer's own privacy surface |

---

## How the "why" is built, and what stops it becoming a lie

A mechanism earns the right to be served by climbing a **warrant ladder**, and the ladder governs the verbs.

| Rung | Requires | You may say | Served |
|---|---|---|---|
| `conjectured` | a predicate somebody proposed | "a shape somebody noticed" | no |
| `recurrent` | ≥ 8 independent creators, ≥ 2 cohorts, **≥ 2 unrelated trends** | "recurs among high performers across unrelated trends" | yes |
| `contrasted` | recurrent, and materially absent from the same creators' non-performers, on a slice it was not mined from | "…and the asymmetry survived a window it did not come from" | yes |
| `falsified` | the asymmetry did not survive a corpus refresh | nothing | no; retained forever |
| ~~`deconfounded_within_tenant`~~ | explore-arm internal outcome data | — | **refused by design** |
| ~~`interventional`~~ | explore budget stratified on the predicate | — | **refused by design** |

**`n_trends ≥ 2` is where "mechanisms compound" stops being a slogan and becomes arithmetic.** A predicate observed only inside one trend's posts *is that trend*, wearing a lab coat.

**The top two rungs are named and refused.** A ladder whose top is invisible gets climbed by accident. Reaching them would mean either tenant outcome data in a tenant-neutral artefact, or trading away the exploration objective ADR-0003 chose for statistical power this data volume does not have.

So `contrasted` is the ceiling, and **it is not a causal claim.** The words *causes*, *lifts*, *drives*, and *predicts* are unavailable at every rung, checked by a lexicon test in CI. Every response carries `never_tested_against: "content that was attempted and failed"`, and the field is not removable, because the exemplar corpus is a sample of winners and always will be.

**Automatic to demote, human to promote.** A `contrasted` mechanism whose asymmetry vanishes on refresh is withdrawn the same cycle with no human step. Promotion requires a named person to ratify the model-drafted sentence. Same asymmetry as the circuit breaker, same reason: the pressure to widen a threshold arrives at exactly the moment the threshold is telling the truth.

---

## Source study

This design draws on four repositories, studied at source.

**[TheMattBerman/scrollclaw](https://github.com/TheMattBerman/scrollclaw)** contributes the seven-criterion virality rubric and, more valuably, its own published benchmark showing the v0 rubric was wrong: equal weights let a video score 100 on shareability and 20 on hook and still pass; frames-only evaluation structurally underestimates audio-dependent criteria; "highest-leverage fix" outputs were too generic to implement. Its corrected weights and hook hard-gate are adopted directly. Its `taste-calibration.md` is the only place in any of the four that names the actual UGC quality axis — friction over polish, clutter over showroom, believable phone-camera composition — and it becomes the `authenticity_register` criterion.

**[aaron-he-zhu/aaron-marketing-skills](https://github.com/aaron-he-zhu/aaron-marketing-skills)** contributes the governance chassis. C³ separates Creator (ACE), Content (ART), and Campaign (ROI) scoring with hard vetoes that cap a scope regardless of other scores. ECHO adds `H2` — UGC republished only with a recorded permission entry, and organic consent never covers paid use — and `O1` — no reported rate without a named, period-stable denominator, and no proxy presented as measured. Its `content-amplifier` skill supplies the constraint that reshaped this entire design: amplification "starts from content that is already published and cleared."

**[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)** contributes the ingestion recipe. `reverse-engineering.md` — identify 10-20 top creators, collect 500-1000 posts, rank by engagement rate, extract hook, format, and CTA patterns from the top decile — is the exemplar corpus methodology. `listening.md`'s pull → filter → score → draft → post → log loop is the shape of the trend scan.

**[bradautomates/claude-video](https://github.com/bradautomates/claude-video)** is what makes the rest executable. Without frames and a timestamped transcript, every scorer above is grading thumbnails.

---

## Where the sources are wrong or silent

Seven corrections, in descending order of consequence.

**Amplification cannot be decided pre-publication.** The evidence available at submission is craft. The evidence available at T+24h is a measurement. Merging them means spending money on a prediction when a measurement is a day away for free, and the dominant error mode systematically favours large creators and high production budgets. Hence two gates. See ADR-0002.

**Organic velocity must be normalised against the creator's own baseline.** Ranking by raw engagement rate ranks by follower count. The signal is `post_er_24h ÷ creator.median_er_24h`, the outperformance ratio, and it carries 0.45 of AWS. None of the four say this. It is the only reason the amplification component is worth more than a sorted spreadsheet, and the eval plan is built so that claim can be falsified.

**Nobody separates the prior from the likelihood, and the cost is a laundered number.** All four mine "what works" from a corpus of public winners. But a public winner's engagement rate is `Proxy` — no closed platform has a compliant keyless read — and a `Proxy` value that enters an effect-size calculation produces a number whose provenance label is correct where it is born and gone one hop later. **The exemplar corpus proposes predicates and anchors retrieval. It contributes no number.** Estimation runs over the internal corpus alone. See ADR-0001 and ADR-0006.

**Nobody distinguishes *what recurs* from *why it works*, so nothing they learn transfers.** A pattern is a correlation in one cohort; when the format dies, the pattern dies with it. A mechanism is a claim about the structure underneath, carrying a falsifier and a warrant, and it survives the format. This document set makes them two entities with two schemas, two consumers, and no join path. See ADR-0006.

**Nobody mentions pattern collapse.** A recommender that trains on its own outputs never updates its estimate of the arms it did not pull. Without a reserved exploration budget the Pattern Library converges on one narrow region of content space and its effect sizes become artefacts of its own allocation policy. ε defaults to 0.18 and cannot be set to zero. See ADR-0003.

**Nobody mentions prompt injection.** Creator captions and transcripts enter a model prompt, and a caption asserting that disclosure is present at a timestamp where it is not is a live attack on a regulatory control. Vetoes are therefore computed in application code from extracted features and stored records. The model may raise a suspected veto; it may never clear one. The adversarial suite is a permanent regression test on the architecture.

**Nobody has a referee.** ECHO ships with an honest note that its bands are provisional pending calibration against thirty real audits, and no mechanism by which that calibration would be performed by anyone other than its authors. scrollclaw benchmarked its own scorer, found it wanting, and did so once, by hand, because someone chose to. A scorer that decides whether to keep trusting itself never stops trusting itself. Hence C3, with sole breaker authority and sole veto over library promotion. See ADR-0005.

---

## The constraint nobody sees coming

Promoting a Pattern Library version changes the scorer, which resets the calibration window, because a rolling correlation computed across a library swap averages two different scorers and calls it one number.

Therefore: **library promotion cadence is bounded below by the time to accumulate n ≥ 60 outcomes per cohort, not by how often the miner runs.** Mining runs nightly. Publishing runs roughly quarterly, through a champion/challenger shadow window judged by C3 on paired held-out submissions. Any roadmap assuming a weekly library refresh has not read the eval plan.

This is invisible until the third library swap, at which point somebody notices the rolling correlation has been meaningless for a year.

---

## The constraint that shapes everything

At agency volume the labelled dataset is hundreds of posts per year, not millions. There is no fine-tune here. This is a rubric, a retrieval layer over an exemplar corpus, an LLM-as-judge with schema-constrained output, and a calibration layer that measures whether the whole thing rank-orders better than chance.

If it does not clear ρ ≥ 0.35 out-of-sample, it ships as advisory-only and shows no number to a client. That circuit breaker is automatic, it is in REQ-052, and it is the difference between this being a product and this being theatre.

The knowledge layer answers to the same discipline in a different currency. It has no ρ to clear, because it makes no prediction. What it has instead is a falsifier on every claim, a corpus refresh that withdraws claims automatically, and a ceiling on the ladder that it is not permitted to climb.

---

## Known gaps in this document set

Named rather than hidden, because a doc set that claims completeness is the one nobody re-reads.

- ~~**C3 has no component document.**~~ **Closed (Phase 4).** [component-3-calibration-monitor.md](component-3-calibration-monitor.md) now specifies the Calibration Monitor — its config (window length, threshold, cohort keying, held-out split method), the automatic-trip/manual-arm rule, and Contracts C and D. It documents existing invariants and weakens none.
- **The warrant thresholds are guesses wearing precision.** `prevalence_ratio ≥ 2.0` on the mining slice and `≥ 1.5` on a disjoint slice are not derived from anything. With `n_creators` as low as 8 and no significance test, a 1.5× asymmetry sits close enough to 1.0 to be sampling noise. There is no honest sampling model to derive them from, so the mitigation is the recalibration rule, stated in advance: if a majority of proposed predicates reach `contrasted` in year one, the bar is too low and the corpus is too small, in that order.
- **`contrast_set_definition` is v1 and it is a guess.** "The same creators' posts below their own top decile" controls for audience and format norms. It does not control for the post's age, its posting time, or the creator's own trajectory. Expect to revise it, and expect the first revision to invalidate a quarter of prevalence ratios.
- **Mechanism ratification is the one place a producing component self-gates its own evidence.** A human reviews the prose; nobody independently recomputes a prevalence, the way C3 recomputes a Spearman. Tolerable only because no number reaches a decision, no tenant datum is present, the artefact is immutable against a named corpus snapshot, and a mis-counted prevalence auto-demotes at the next refresh. Remove any one of those four and this needs a referee.
- **A poisoned exemplar caption is answerable only by a human.** A model-drafted `statement` is prose grounded in untrusted text and published externally. There is no deterministic fallback, because the artefact *is* the prose. An injection that avoids the forbidden verbs passes every automated control, and the ratifier is what remains.
- **The `authenticity_register` weight of 0.06 is a guess**, and the eval plan's fairness audit exists to check whether it is enough. Expect to raise it.
- **Whether the exemplar corpus can be lawfully assembled at all, per platform, is unresolved.** ADR-0001 addresses it; it does not settle it. Where the answer is no, that platform's mechanism library is empty and its `coverage.state` says so.
- **Retaining the contrast set roughly multiplies extraction cost.** The source recipe discards the non-top-decile posts; this design extracts them, because a prevalence without a comparison group is a number with no meaning. Sampling the contrast set is permitted and must be recorded per-creator.

# UGC Intelligence - Document Set

**Three components on ClientHub**, not two. The PRD was written as two; [ADR-0005](adr/0005-three-components-and-the-referee.md) explains why the third is not optional.

1. **Pattern Engine (C1)** - *produces beliefs.* Learns what constitutes high-performing UGC per vertical and platform, from an external exemplar corpus and ClientHub's own closed-loop outcome data.
2. **Scoring and Amplification Service (C2)** - *acts on beliefs.* Applies that learning at two gates: submission approval, and post-publication amplification recommendation.
3. **Calibration Monitor (C3)** - *referees.* Holds sole authority over the circuit breaker and sole veto over library promotion. Exists because neither of the other two can be allowed to grade its own homework.

They share one immutable artefact, one event log, one flag, and one shared Extraction Service. C2 never calls C1. Start with the [integration contract](integration-contract.md).

## Read in this order

| Doc | What it settles |
|---|---|
| [prd-ugc-intelligence.md](prd-ugc-intelligence.md) | Problem, users, requirements, success metrics, phased roadmap |
| [adr/0005-three-components-and-the-referee.md](adr/0005-three-components-and-the-referee.md) | Why there are three components and who may grade whom |
| **[integration-contract.md](integration-contract.md)** | **How the components talk. Contracts A-D, sequences, failure semantics.** |
| [component-1-pattern-engine.md](component-1-pattern-engine.md) | C1 internals: term registry, source adapters, detector, corpus builders, miner, publisher |
| [component-2-scoring-amplification.md](component-2-scoring-amplification.md) | C2 internals: compliance gate, three lanes, verdict engine, collector, ranker, allocator |
| [adr/0002-two-gate-scoring-architecture.md](adr/0002-two-gate-scoring-architecture.md) | Why approval and amplification are separate decisions at separate times |
| [adr/0001-trend-signal-sourcing.md](adr/0001-trend-signal-sourcing.md) | Where data comes from and how provenance is enforced |
| [adr/0003-exploration-budget.md](adr/0003-exploration-budget.md) | Why 18% of every amplification budget funds content the model ranks low |
| [adr/0004-trend-detection-and-submission.md](adr/0004-trend-detection-and-submission.md) | Why trends never touch the score, and why human submission is structural |
| [rubric-vps-v1.md](rubric-vps-v1.md) | The actual scoring: vetoes, VPS, BAS, AWS |
| [schemas/rubric-v1.json](schemas/rubric-v1.json) | Machine-readable rubric |
| [schemas/events-v1.json](schemas/events-v1.json) | Machine-readable event and breaker contracts |
| [tech-spec-ugc-intelligence.md](tech-spec-ugc-intelligence.md) | Architecture, data model, pipelines, API surface, failure modes |
| [tech-spec-trend-subsystem.md](tech-spec-trend-subsystem.md) | Trend detection maths, submitter scoring, requirement deltas |
| [eval-and-calibration-plan.md](eval-and-calibration-plan.md) | The tests that can fail. Read this before writing any scorer. |
| [compliance-notes.md](compliance-notes.md) | APP 8, automated decision-making, minors, disclosure, rights |

## Source study

This design draws on four repositories, studied at source.

**[TheMattBerman/scrollclaw](https://github.com/TheMattBerman/scrollclaw)** contributes the seven-criterion virality rubric and, more valuably, its own published benchmark showing the v0 rubric was wrong: equal weights let a video score 100 on shareability and 20 on hook and still pass; frames-only evaluation structurally underestimates audio-dependent criteria; "highest-leverage fix" outputs were too generic to implement. Its corrected weights and hook hard-gate are adopted directly. Its `taste-calibration.md` is the only place in any of the four that names the actual UGC quality axis - friction over polish, clutter over showroom, believable phone-camera composition - and it becomes the `authenticity_register` criterion.

**[aaron-he-zhu/aaron-marketing-skills](https://github.com/aaron-he-zhu/aaron-marketing-skills)** contributes the governance chassis. C³ separates Creator (ACE), Content (ART), and Campaign (ROI) scoring with hard vetoes that cap a scope regardless of other scores. ECHO adds `H2` - UGC republished only with a recorded permission entry, and organic consent never covers paid use - and `O1` - no reported rate without a named, period-stable denominator, and no proxy presented as measured. Its `content-amplifier` skill supplies the constraint that reshaped this entire design: amplification "starts from content that is already published and cleared."

**[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)** contributes the ingestion recipe. `reverse-engineering.md` - identify 10-20 top creators, collect 500-1000 posts, rank by engagement rate, extract hook, format, and CTA patterns from the top decile - is the exemplar corpus methodology. `listening.md`'s pull → filter → score → draft → post → log loop is the shape of the trend scan.

**[bradautomates/claude-video](https://github.com/bradautomates/claude-video)** is what makes the rest executable. Without frames and a timestamped transcript, every scorer above is grading thumbnails.

## Where the sources are wrong or silent

Five corrections, in descending order of consequence.

**Amplification cannot be decided pre-publication.** The evidence available at submission is craft. The evidence available at T+24h is a measurement. Merging them means spending money on a prediction when a measurement is a day away for free, and the dominant error mode systematically favours large creators and high production budgets. Hence two gates. See ADR-0002.

**Organic velocity must be normalised against the creator's own baseline.** Ranking by raw engagement rate ranks by follower count. The signal is `post_er_24h ÷ creator.median_er_24h`, the outperformance ratio, and it carries 0.45 of AWS. None of the four say this. It is the only reason the amplification component is worth more than a sorted spreadsheet, and the eval plan is built so that claim can be falsified.

**Nobody mentions pattern collapse.** A recommender that trains on its own outputs never updates its estimate of the arms it did not pull. Without a reserved exploration budget the Pattern Library converges on one narrow region of content space and its effect sizes become artefacts of its own allocation policy. ε defaults to 0.18 and cannot be set to zero. See ADR-0003.

**Nobody mentions prompt injection.** Creator captions and transcripts enter a model prompt, and a caption asserting that disclosure is present at a timestamp where it is not is a live attack on a regulatory control. Vetoes are therefore computed in application code from extracted features and stored records. The model may raise a suspected veto; it may never clear one. The adversarial suite is a permanent regression test on the architecture.

**Trends and patterns are conflated everywhere, and have different half-lives.** aaron's `trend-spotter` and corey's `listening.md` both treat trend intelligence as an input to content decisions generally. It is not: a signal that changes nightly cannot enter a scorer that must be evaluated on a temporally held-out split. Trends feed the brief. Patterns feed the score. The only permitted coupling is that a rising trend tells the Pattern Engine where to point its corpus builder, so it can mine the mechanism underneath the format. Trends are disposable; mechanisms compound. See ADR-0004.

**Nobody has a referee.** ECHO ships with an honest note that its bands are provisional pending calibration against thirty real audits, and no mechanism by which that calibration would be performed by anyone other than its authors. scrollclaw benchmarked its own scorer, found it wanting, and did so once, by hand, because someone chose to. A scorer that decides whether to keep trusting itself never stops trusting itself. Hence C3, with sole breaker authority and sole veto over library promotion. See ADR-0005.

## The constraint nobody sees coming

Promoting a Pattern Library version changes the scorer, which resets the calibration window, because a rolling correlation computed across a library swap averages two different scorers and calls it one number.

Therefore: **library promotion cadence is bounded below by the time to accumulate n ≥ 60 outcomes per cohort, not by how often the miner runs.** Mining runs nightly. Publishing runs roughly quarterly, through a champion/challenger shadow window judged by C3 on paired held-out submissions. Any roadmap assuming a weekly library refresh has not read the eval plan.

This is invisible until the third library swap, at which point somebody notices the rolling correlation has been meaningless for a year.

## The constraint that shapes everything

At agency volume the labelled dataset is hundreds of posts per year, not millions. There is no fine-tune here. This is a rubric, a retrieval layer over an exemplar corpus, an LLM-as-judge with schema-constrained output, and a calibration layer that measures whether the whole thing rank-orders better than chance.

If it does not clear ρ ≥ 0.35 out-of-sample, it ships as advisory-only and shows no number to a client. That circuit breaker is automatic, it is in REQ-052, and it is the difference between this being a product and this being theatre.

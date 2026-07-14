# PRD: UGC Intelligence - Trend Learning and Amplification Recommendation

**Status:** Draft v1.0
**Owner:** Fred
**Surface:** ClientHub (multi-tenant campaign management platform)
**Related docs:** [tech-spec](tech-spec-ugc-intelligence.md) · [VPS rubric](rubric-vps-v1.md) · [eval plan](eval-and-calibration-plan.md) · [compliance](compliance-notes.md) · [ADR-0001](adr/0001-trend-signal-sourcing.md) · [ADR-0002](adr/0002-two-gate-scoring-architecture.md) · [ADR-0003](adr/0003-exploration-budget.md)

---

## Problem and Opportunity

ClientHub already owns the two moments that matter in an influencer campaign, and extracts intelligence from neither. Creators submit content for approval before it goes live, and a campaign manager decides which live posts get paid amplification. Both decisions are currently made on taste and available time.

The approval decision is made by a human scanning a submission against a brief they may not have written, checking disclosure by eye, and forming a view on whether it will perform. On a campaign with forty creators this is forty judgement calls under time pressure, with no record of the reasoning. Content that would have underperformed gets approved because it is technically compliant. Content that would have performed gets approved with no note that its hook is weak, so the creator never learns and the next brief produces the same problem.

The amplification decision is worse, because it is where money moves. A campaign manager looks at a spreadsheet of live posts sorted by engagement, picks the top few, and recommends a spend split to the client. Sorting by raw engagement sorts by follower count. The recommendation is defensible only as far as the manager's memory of what worked last quarter, and that memory is not written down anywhere, does not transfer between managers, and is not tested against outcomes.

Meanwhile ClientHub holds something no external tool has: a closed loop. It knows what was submitted, what was approved, what was rejected and why, what went live, and - through platform analytics exports - how each live post actually performed. That is a labelled dataset connecting content features to real outcomes, generated continuously as a by-product of work already being done. Nobody is reading it.

The cost of inaction is that this data ages into nothing. Every campaign that ships without capturing its own outcome labels is a campaign whose learnings live only in a manager's head. Twelve months from now the agency will be exactly as good at predicting content performance as it is today, while its clients will increasingly expect the recommendation to come with a number attached.

The opportunity is not a viral-content generator. It is a defensible, auditable, continuously calibrated recommendation system that makes the approval decision faster and the amplification decision better, and that gets measurably better each campaign because it is fed by its own outcomes.

---

## Users and Jobs to Be Done

**The campaign manager** runs six to twelve concurrent campaigns, each with ten to fifty creators, and is the person who currently holds every judgement call. When a batch of thirty submissions lands the day before a go-live, they want to triage in minutes rather than hours, so they can spend their attention on the five pieces that actually need a decision rather than the twenty-five that obviously pass or obviously fail. They are not looking for the system to decide. They are looking for it to pre-sort, flag the compliance risks they might miss at 6pm, and hand them a defensible reason for each call. Today they do this in a browser tab and a spreadsheet.

**The client** (brand marketing lead) receives an amplification recommendation and has to justify a media spend internally. When their agency tells them to put four thousand dollars behind three specific posts, they want to see why those three, so they can defend the allocation to a finance partner who does not care about influencer marketing. What they currently receive is a ranked list with engagement numbers next to it. What they want is the reasoning, the alternatives considered, and an honest statement of confidence. A recommendation they cannot defend is a recommendation they will override.

**The creator** submits content and waits. When their content comes back with revisions requested, they want a specific, implementable note rather than "can you make the opening punchier", so they can turn it around in one pass rather than three. Creators are the constituency this system can most easily harm: a scorer that penalises low production values penalises exactly the creators who make the most authentic UGC, and a creator who is repeatedly and opaquely down-ranked has been subjected to an automated decision with a material effect on their earnings. Their job to be done is to be treated fairly and told why.

**The agency itself** is the fourth user, and the one the learning loop actually serves. When a quarter ends, the agency wants to know which content patterns worked for which client vertical on which platform, so it can write better briefs. This is the compounding asset. The scoring is a means to it.

---

## Solution Overview

Two components, deliberately separated, connected by a single versioned artefact.

**Component 1, the Pattern Engine**, builds and maintains a per-vertical, per-platform understanding of what currently constitutes high-performing UGC. It ingests two streams. The external stream is a trend and exemplar corpus: two to five hundred top-performing public posts per vertical, refreshed on a rolling basis, each one actually watched (frames plus timestamped transcript, via the existing `/watch` capability) and reduced to structured features - hook archetype, first-frame composition, on-screen text density and legibility, cut cadence, spoken opening line, authenticity register, disclosure presence. The internal stream is ClientHub's own closed loop: every post this platform has approved, published, and measured, with its features extracted identically and its real outcome attached.

The engine's output is a **Pattern Library**: a versioned, dated set of assertions of the form "for beauty vertical on TikTok, a first-person problem-statement hook delivered to camera within 1.5 seconds is associated with a 1.4x lift in 24h engagement rate relative to cohort median, n=63, confidence moderate." Each assertion carries an effect size, a sample size, a confidence band, and a validity window, because a pattern that was true in March is not automatically true in September. The Pattern Library is the only thing Component 2 reads from Component 1. There is no other coupling.

Crucially, the external stream provides the *prior* and the internal stream provides the *labels*. Trend data alone tells you what is popular; it cannot tell you what works for your client. Outcome data alone is too sparse to generalise. Together they produce a rubric that is grounded in the agency's own results and refreshed by what is currently landing.

**Component 2, the Scoring and Amplification Service**, applies the Pattern Library at two distinct moments.

At **Gate A**, on submission, it runs three lanes in parallel. A deterministic compliance lane checks the hard requirements - disclosure present and adequate, every product claim traceable to the approved claims ledger, no brand-safety trigger, usage rights recorded, platform technical specs met. Any failure here is a veto: it blocks approval regardless of how good the content is, and it is computed in code, never by the language model. A brief-adherence lane scores the submission against the specific brief it was made for. A viral-potential lane scores craft on a seven-criterion weighted rubric with a hard gate on hook strength. The manager receives a pre-sorted queue, a verdict, and - where revisions are needed - a specific, time-coded, implementable note for the creator.

At **Gate B**, twenty-four to forty-eight hours after a post goes live, it computes an Amplification Worthiness Score. This score is dominated not by craft but by measured organic outperformance: how far this post beat its own creator's trailing median, and where it sits in the campaign cohort's distribution. Craft score enters only as a weak prior. Paid usage rights are a hard gate, because organic consent never covers paid use. The output is a ranked, budget-allocated recommendation with per-item reasoning, presented to the manager for sign-off before it reaches the client.

The reason for separating the gates is that the evidence available at each is different in kind. Before publication you have craft signals and a prior. After publication you have a measured outcome. Merging them means letting a polished piece from a large creator that nobody watched outrank a scrappy piece from a nano creator that overperformed by a factor of three. That failure mode is the entire reason this system exists.

Finally, Gate B reserves a fixed slice of every amplification budget for exploration - posts that the model does not rank in the top tier, selected deliberately. Without this the system converges on last quarter's winning pattern and stops learning. See [ADR-0003](adr/0003-exploration-budget.md).

**What this is not.** This is not a model training project. At agency volume the labelled dataset is hundreds of posts per year, not millions. There is no fine-tune here, and any roadmap item that assumes one is a roadmap item that will not ship. This is a rubric, a retrieval layer over an exemplar corpus, an LLM-as-judge with structured output, and a calibration layer that measures whether the whole thing beats chance. If it does not beat chance, it ships as advisory-only and shows no number to the client. That constraint is a feature, and it is enforced in [the eval plan](eval-and-calibration-plan.md).

---

## Functional Requirements

### Pattern Engine

**REQ-001** [Must] The system ingests a public exemplar post by URL and produces a structured feature record containing extracted frames, a timestamped transcript, and the derived feature set defined in the tech spec, without a human transcribing or watching it.

**REQ-002** [Must] Every ingested exemplar and every internal post carries a provenance label on each metric of `Measured`, `User-provided`, `Estimated`, or `Proxy`, together with an as-of date. A `Proxy` value is never displayed or aggregated as if it were `Measured`, in any report, at any layer.

**REQ-003** [Must] The system maintains a Pattern Library keyed by (vertical, platform), where each pattern records the assertion, effect size, sample size, confidence band, `valid_from`, and `valid_to`. A pattern with sample size below the threshold defined in the eval plan is marked `insufficient_evidence` and is not used for scoring.

**REQ-004** [Must] The Pattern Library is versioned and immutable once published. Every score references the exact `pattern_library_version` and `rubric_version` used to produce it, so any historical decision can be reconstructed.

**REQ-005** [Must] Trend detection and the human submission loop are specified in [tech-spec-trend-subsystem.md](tech-spec-trend-subsystem.md) and decided in [ADR-0004](adr/0004-trend-detection-and-submission.md), which supersede the original REQ-005 and REQ-006. In summary: automated keyless scanning covers the open web; human submission covers the closed platforms where UGC trends actually live; submitters are scored on accuracy and lead time; and no trend signal enters VPS computation at any weight, because a scorer whose inputs change nightly cannot be evaluated on a temporally held-out split.

**REQ-006** [Must] When a pattern's supporting evidence ages past its validity window without refresh, the system flags it as stale and excludes it from scoring rather than silently continuing to apply it. The equivalent rule for trend signals is REQ-006 in the trend subsystem spec.

**REQ-007** [Could] The engine surfaces a quarterly "what changed" report per client vertical: patterns that strengthened, patterns that decayed, and new patterns that cleared the evidence threshold.

### Gate A - Submission Scoring

**REQ-010** [Must] When a creator submits content, the system runs the compliance lane and returns a binary per-check result with evidence. Checks cover: disclosure presence and adequacy, claim-to-ledger traceability, brand-safety triggers, usage-rights record existence, and platform technical specs. Any failed check is a veto.

**REQ-011** [Must] The compliance lane is implemented as deterministic application code. The language model may raise a suspected veto for human review; it can never clear a veto, and its output cannot cause a veto to be dropped.

**REQ-012** [Must] Creator-submitted text (captions, transcripts, on-screen copy) is treated as untrusted input. It is delimited and labelled as data in every model prompt, model output is validated against a strict schema, and any parse or validation failure yields `NEEDS_REVIEW`, never an auto-approval.

**REQ-013** [Must] The system produces a Viral Potential Score (VPS) 0-100 for each submission, computed per the weighted rubric in [rubric-vps-v1.md](rubric-vps-v1.md), with a hard gate: hook strength below 50 forces a REVISE verdict regardless of the weighted total.

**REQ-014** [Must] The system produces a Brief Adherence Score (BAS) 0-100 measuring the submission against the specific brief it was made for, covering required talking points, mandatory inclusions, prohibited content, and format specification.

**REQ-015** [Must] Each submission receives exactly one verdict: `APPROVED`, `APPROVED_WITH_NOTES`, `REVISIONS_REQUIRED`, or `REJECTED`. Any compliance veto forces `REJECTED`. BAS below 60 forces at minimum `REVISIONS_REQUIRED`. Verdict logic is deterministic and testable independent of the model.

**REQ-016** [Must] Where the verdict is `REVISIONS_REQUIRED` or `APPROVED_WITH_NOTES`, the system generates a single highest-leverage revision note that is specific, references a time code where applicable, includes example copy or a visual direction, and is implementable in under two hours. Generic notes ("strengthen the hook") fail acceptance.

**REQ-017** [Must] A campaign manager can override any verdict. The override, the original verdict, the reason given, and the reviewer identity are recorded. Overrides are a first-class input to calibration, not an exception path.

**REQ-018** [Must] Where scoring is performed from frames without audio, every audio-dependent criterion (hook strength, emotional specificity, completion likelihood) is explicitly flagged as degraded in both the stored score and any surfaced UI, and the confidence band on the composite widens accordingly.

**REQ-019** [Should] The submission queue is sorted by a triage priority that surfaces compliance risks first, then borderline verdicts, then clear passes - so a manager working top-down spends their attention where judgement is actually required.

**REQ-020** [Should] Scoring a submission completes within 90 seconds of upload for video under 90 seconds, and within 5 minutes for video up to 10 minutes.

**REQ-021** [Won't, this release] The system does not auto-approve. Every verdict of `APPROVED` still requires a human click. See [compliance-notes.md](compliance-notes.md) for why this is a hard constraint and not a caution.

### Gate B - Amplification Recommendation

**REQ-030** [Must] For every live post the system captures performance snapshots at T+24h, T+48h, and T+7d, with the denominator for every reported rate explicitly named and held stable across periods. Organic and boosted performance are recorded as separate series and never summed.

**REQ-031** [Must] The system computes an Outperformance Ratio for each live post: the post's 24h engagement rate divided by the trailing median 24h engagement rate for that same creator on that same platform. Where a creator has fewer than the minimum trailing posts defined in the tech spec, the ratio is marked `insufficient_baseline` and the post is scored on cohort percentile alone with reduced confidence.

**REQ-032** [Must] The system computes an Amplification Worthiness Score (AWS) 0-100 combining outperformance ratio, cohort percentile, VPS as a prior, creator standing, and audience overlap fit, with weights specified in the rubric doc.

**REQ-033** [Must] Paid usage rights are a hard gate on AWS. A post whose rights record does not include an unexpired paid-use grant is excluded from amplification recommendation entirely, regardless of score, and displayed as `blocked_rights` with the specific missing grant named. Organic consent, public posting, tagging, and branded-hashtag use never satisfy this gate.

**REQ-034** [Must] Live-post disclosure is re-checked at Gate B. A post that was compliant at submission but published without the disclosure is blocked from amplification and escalated.

**REQ-035** [Must] The recommendation output allocates a stated budget across recommended posts, sums exactly to the stated budget, and carries a per-post rationale naming the specific evidence that drove inclusion.

**REQ-036** [Must] A fixed proportion of every amplification budget, configurable per campaign and defaulting to the value in [ADR-0003](adr/0003-exploration-budget.md), is allocated to exploration: posts outside the top exploit tier, selected by the sampling policy defined there. Every allocation is tagged `arm: exploit` or `arm: explore` and this tag persists into performance tracking.

**REQ-037** [Must] Every recommendation passes through a named human reviewer before it reaches a client. The system records who signed off, when, and any modification made. The client-facing artefact states that the ranking is machine-generated and human-reviewed.

**REQ-038** [Should] Where the system's confidence in its ranking is below the threshold in the eval plan for a given (vertical, platform) cohort, the client-facing artefact presents the ranking without numeric scores and states the limitation plainly.

**REQ-039** [Should] The system reports the counterfactual: what a naive "boost the highest raw engagement post" baseline would have selected, and how the recommendation differs. This is both a client trust device and a permanent internal check on whether the model is earning its complexity.

### Calibration Loop

**REQ-050** [Must] Every VPS produced is stored against the eventual measured 7-day performance percentile of the post it scored, forming the calibration dataset.

**REQ-051** [Must] The system computes and exposes, per (vertical, platform) cohort, the Spearman rank correlation between predicted VPS and actual 7d performance percentile, on a rolling window, over a held-out set. This number is visible to the operator at all times and is the system's own report card.

**REQ-052** [Must] Where the rolling correlation for a cohort falls below the threshold in the eval plan, VPS for that cohort automatically degrades to advisory-only: it continues to be computed and stored, ceases to be shown to clients as a number, and ceases to contribute to AWS. This is an automatic circuit breaker, not a manual decision.

**REQ-053** [Must] Explore-arm outcomes are weighted equally with exploit-arm outcomes when updating the Pattern Library. The exploration budget exists precisely to generate this evidence.

**REQ-054** [Should] A fairness audit runs quarterly, reporting VPS distribution by creator follower band, and flagging where nano and micro creators are systematically scored below macro creators on criteria that proxy for production budget rather than performance.

---

## Success Metrics

**Manager triage time per submission batch.** Baseline: measure it before building anything - instrument the current approval workflow for two weeks. Target: 50% reduction in median time-to-verdict per submission at unchanged or improved override-rate-on-review. Leading indicator, measurable from week one of pilot.

**Rank-order skill of VPS.** Spearman correlation between VPS and measured 7d engagement percentile, per cohort, on held-out data. Target: ≥ 0.35 within 90 days on at least two (vertical, platform) cohorts with n ≥ 60. This is the metric that decides whether the product is real. Below it, the system is a compliance checker with a vibe attached, and it ships as one.

**Amplification lift versus naive baseline.** CPM-adjusted incremental reach of AWS-recommended allocation versus a "boost highest raw 24h engagement" baseline, measured on matched campaign pairs. Target: positive at 80% confidence within two quarters. If the baseline wins, ship the baseline and say so.

**Disclosure veto recall.** Proportion of live posts with missing or inadequate disclosure that the compliance lane caught at Gate A. Target: ≥ 0.98. False negatives here are regulatory exposure; false positives cost a manager thirty seconds. The asymmetry is total and the threshold reflects it.

**Pattern Library freshness.** Proportion of patterns in active scoring use whose supporting evidence is within its validity window. Target: ≥ 0.85. A decaying library that nobody notices is the quiet failure mode of every system like this.

---

## Out of Scope

**Content generation.** This system scores and recommends. It does not write hooks, generate scripts, or produce video. Adding generation collapses the evaluation loop: a scorer that grades content produced by the same model that wrote it is measuring its own agreement with itself, not performance.

**Fine-tuning or distillation.** Not at this data volume. Revisit after eighteen months of accumulated closed-loop labels, at which point the question is whether a small distilled scorer can replicate the rubric at lower cost, not whether it can learn something the rubric cannot.

**Automated spend execution.** The system recommends an allocation. It does not touch Meta Partnership Ads, TikTok Spark Ads, or any ad account. Execution stays manual and stays with the client.

**Scoring content from creators under 18.** Excluded entirely at Gate A by creator-record check, not by inference. See [compliance-notes.md](compliance-notes.md).

**Cross-tenant pattern sharing.** ClientHub is multi-tenant. A pattern derived from Tenant A's outcome data does not inform Tenant B's scoring, ever, regardless of how tempting the aggregate dataset is. This is a data-boundary invariant, enforced at the query layer, and it is not a configuration option.

---

## Phased Roadmap

**Phase 0 - Instrument, no build (2 weeks).** Add timing and decision logging to the existing approval workflow. Capture what managers currently do and how long it takes. Begin snapshotting live-post performance at T+24/48h/7d so that a labelled dataset exists before any scorer does. Nothing user-facing ships. This phase is non-negotiable, because without a baseline the success metrics above are unmeasurable and every subsequent claim is unfalsifiable.

**Phase 1 - Compliance lane only (4 weeks).** Ship the deterministic compliance gate at Gate A. No scoring, no LLM in the decision path. This delivers immediate value (disclosure and claims checking at scale), establishes the veto architecture, and proves out the submission pipeline. It is also the component with the clearest ROI and the least model risk.

**Phase 2 - Feature extraction and Pattern Library v0 (6 weeks).** Stand up the extraction pipeline over `/watch`. Build the exemplar corpus for one vertical on one platform. Extract features from the historical ClientHub corpus captured in Phase 0. Publish Pattern Library v0. Still nothing user-facing from the scorer.

**Phase 3 - VPS shadow mode (6 weeks).** VPS runs on every submission and is stored. It is not shown to managers and not shown to clients. Its predictions accumulate against real outcomes. At the end of this phase, either the Spearman threshold is met and VPS graduates, or it does not and the rubric is revised and shadow mode continues. The discipline of shipping a scorer to nobody until it demonstrates skill is the difference between this working and this being theatre.

**Phase 4 - Gate A live, Gate B shadow (4 weeks).** VPS and BAS surface to managers with confidence bands. Revision notes generate. AWS computes in shadow against real amplification decisions made by humans, and the counterfactual is logged.

**Phase 5 - Gate B live with exploration (4 weeks).** Amplification recommendations reach managers, then clients under human sign-off. Exploration budget active from day one, not added later - a recommender that runs pure-exploit for a quarter has already collapsed its pattern diversity before exploration is introduced.

---

## Open Questions

**Platform data access.** TikTok, Instagram, and LinkedIn have no compliant keyless read surface. Live-post performance therefore arrives either through a client-authorised platform connection, a manual analytics export, or a paid data provider. Which of these is available per client materially changes the freshness and reliability of Gate B, and the answer is likely different per client. This is the single largest unresolved dependency and it is addressed but not resolved in [ADR-0001](adr/0001-trend-signal-sourcing.md).

**Creator consent architecture for AI scoring.** Content submitted for approval contains faces and voices, and is processed by an overseas model provider. Whether this is handled by an updated creator agreement, a per-campaign consent step, or an on-shore processing path is a decision with legal, cost, and product consequences. It needs an answer before Phase 3, not before Phase 5.

**Whether the client ever sees a number.** There is a defensible position that the client should receive a ranking and a rationale but never a score, on the grounds that a number invites false precision and creates pressure to game it. There is an equally defensible position that a number with an honest confidence band is exactly what makes the recommendation defensible internally. This is a positioning decision, not a technical one, and it should be made deliberately rather than by default.

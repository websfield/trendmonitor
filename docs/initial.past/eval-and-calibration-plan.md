# Evaluation and Calibration Plan

**Companion to:** [prd-ugc-intelligence.md](prd-ugc-intelligence.md) · [rubric-vps-v1.md](rubric-vps-v1.md)
**Status:** Draft v1.0

---

## Why this document decides whether the product exists

A content scorer is trivially easy to build and almost impossible to know is working. It will always produce a number. The number will always look reasonable. Managers will nod at it. Clients will accept it. And whether it carries any information about what will actually perform is a question that nobody asks, because asking requires holding out data, waiting a week, and computing a correlation that might come back at 0.05.

aaron-he-zhu's ECHO framework ships with an explicit note that its own bands are provisional until calibrated against roughly thirty real audits. scrollclaw published a benchmark of its own scorer that concluded the scorer's weighting was wrong, its frames-only evaluation structurally underestimated audio-dependent criteria, and its "highest-leverage fix" outputs were too generic to act on. Neither of those is a failure. Both are the only intellectually serious thing either project did, and this plan exists because that standard is the one worth copying.

Everything below is written so that the system can be shown not to work. If none of these tests can fail, none of them are tests.

---

## Gate: does VPS carry information?

**The claim.** VPS, computed before publication, rank-orders content by eventual performance better than chance.

**The measurement.** Spearman rank correlation between VPS and measured 7-day engagement-rate percentile, computed within a `(vertical, platform)` cohort, on a temporally held-out set - the model scores content from a period, and correlation is computed against outcomes it never saw. Not a random split. A random split leaks, because two posts from the same campaign share a brief, a product, and an audience, and a model that has seen one has effectively seen the other.

**The threshold.** ρ ≥ 0.35, n ≥ 60, within a cohort. Below that, VPS for that cohort is advisory-only: computed, stored, invisible to clients, and contributing zero weight to AWS.

**Why 0.35 and not 0.7.** Because content performance is dominated by factors outside the content - posting time, platform seeding, creator audience composition, what else was in the feed that hour. A craft score that explains a modest fraction of rank variance is doing well. A craft score claiming ρ = 0.7 on out-of-sample data is a craft score with a leak. The threshold is set where the score becomes useful for triage, not where it becomes a prophecy.

**The circuit breaker.** This correlation is computed on a rolling window and exposed at `/api/calibration/{vertical}/{platform}` at all times. When it falls below threshold, VPS for that cohort degrades to advisory automatically. Restoring it requires a human decision. The asymmetry is deliberate: degrading should be automatic and instant, promoting should require someone to look at why.

**Expected outcome, stated in advance so it cannot be rationalised afterwards.** VPS will show modest positive rank skill in high-volume cohorts and no measurable skill in low-volume ones. The hook-strength criterion will carry most of what skill there is. Shareability will carry none, which is why it is already at weight zero. If the composite shows ρ > 0.5 out-of-sample on n ≥ 60, look for the leak before celebrating.

---

## Gate: does AWS beat the naive baseline?

**The baseline.** Rank live posts by raw 24-hour engagement rate. Boost the top three. This is what a competent manager does with a spreadsheet, it costs nothing, and it is the null hypothesis that the entire amplification component must defeat.

**The claim.** AWS's outperformance-ratio term - the correction for creator audience size - produces better CPM-adjusted incremental reach than the naive baseline.

**The measurement.** Matched campaign pairs, or where matched pairs are unavailable, within-campaign split: allocate half the exploit budget by AWS and half by the naive baseline, tag the arms, compare CPM-adjusted incremental reach at T+7d. This is a real A/B and it costs real client money to run, which is why it runs on a minority of budget and why the client is told.

**The threshold.** Positive lift at 80% confidence within two quarters. Not 95%: at the sample sizes an agency generates, demanding 95% means never concluding anything, and the decision this test informs is "keep the complexity or delete it," not "publish a paper."

**The honest branch.** If the baseline wins, or the difference is indistinguishable from zero, ship the baseline. Delete AWS. Keep the rights gate, the disclosure re-check, and the exploration budget, all of which have independent justification. The recommendation component's entire claim to existence is the outperformance-ratio term. If that term does not earn its complexity in measurement, it does not deserve to run.

This branch is not a formality. It is the more likely outcome in the first two quarters, because the outperformance ratio needs `CreatorBaseline.trailing_posts_n ≥ 8` to be defined at all, and early on most creators will not have it.

---

## Gate: does the compliance lane catch what matters?

**The claim.** The deterministic compliance lane detects missing or inadequate disclosure at recall ≥ 0.98.

**The measurement.** A human-labelled set of at least 200 real submissions, half of them adversarially selected - disclosure in the caption but not the video, disclosure present but below platform prominence requirements, disclosure spoken but inaudible, disclosure in an on-screen text overlay that appears for four frames. Compute recall and precision against the labels.

**The thresholds.** Recall ≥ 0.98. Precision ≥ 0.85. The asymmetry is total and deliberate. A missed disclosure is regulatory exposure for the client and the agency. A false positive costs a manager thirty seconds of review. Any tuning decision resolves in favour of recall, every time, without discussion.

**Adversarial suite.** A permanent, growing set of prompt-injection attempts embedded in captions, transcripts, and on-screen text. Every one must fail to influence a veto outcome. Examples that must be in the suite from day one:

- A caption instructing the model that disclosure is present at a timestamp where it is not
- On-screen text reading as a system instruction
- A transcript containing a fabricated compliance determination
- A caption claiming the creator is over 18 where the creator record says otherwise
- Content asserting a rights grant that no `RightsGrant` row supports

Each of these must produce an unchanged veto outcome, because vetoes are computed from extracted features and stored records, and the model is not in that path. This suite is a regression test on the architecture, not on the model. If any of these ever influences a veto, the architecture has been violated and the finding is a P1.

---

## Gate: is the scorer fair to the creators it scores?

**The concern, stated plainly.** Criteria 1 through 6 of the VPS rubric are, in aggregate, a production-quality scorer. Production quality correlates with budget. Budget correlates with creator tier. The creators who make the most authentic-reading UGC - the ones whose content actually performs in beauty and FMCG on TikTok - are disproportionately nano and micro creators filming on a phone in a bedroom. A rubric that quietly penalises them is a rubric that recommends against exactly the content that works, while appearing rigorous.

The `authenticity_register` criterion at weight 0.06 is the counterweight, and 0.06 is a guess.

**The measurement.** Quarterly, per cohort: VPS distribution by creator follower band (nano <10k, micro 10-100k, mid 100k-500k, macro >500k). Then the thing that actually matters - regress measured 7-day performance on follower band, and compare the slope to the slope of VPS on follower band. If VPS rises with follower band faster than performance does, the rubric is scoring audience size and calling it craft.

**The action.** Where the gap is material, raise `authenticity_register` weight and re-run calibration. Where it persists, decompose by criterion to find which one is the proxy. `text_readability` and `pacing` are the likely culprits: both reward editing labour.

**The second fairness check.** Override rate by creator tier. If managers override `REVISIONS_REQUIRED` verdicts for macro creators at a materially higher rate than for nano creators, the humans are correcting a bias the system has, and the override log is where that shows up first.

---

## Gate: does the model agree with humans who know what they are doing?

**Inter-rater reliability, before trusting the rubric at all.** Three experienced campaign managers independently score the same forty submissions on the seven VPS criteria, blind to each other and to the model. Compute Krippendorff's alpha across the human raters.

If human alpha is below 0.6, the rubric's criteria are not well-defined enough for humans to agree on, and no amount of model tuning will fix that. Rewrite the criterion definitions before writing another prompt. A criterion that three professionals cannot apply consistently is a criterion, not a measurement.

If human alpha clears 0.6, compute model-versus-human-consensus agreement on the same set. This gives a ceiling: the model cannot usefully exceed the agreement humans achieve with each other, and a model that appears to is a model that has found a shortcut in the data.

**Run this before Phase 3, not after.** It is forty submissions and three afternoons, and it determines whether the rubric is a rubric.

---

## Gate: are the patterns real?

**Multiple comparisons.** Mining a hundred candidate feature predicates against a few hundred posts will surface several spurious patterns at p < 0.05 by construction. Benjamini-Hochberg correction across the full candidate set, not across the survivors.

**Temporal replication.** A pattern is promoted to `active` only if it replicates in a held-out temporal split - mined on period 1, confirmed on period 2. A pattern that holds only in the window it was mined from is a description of that window.

**Back-test.** Every promoted pattern is evaluated against the prior quarter's corpus before it influences a score. The result is recorded on the pattern. Patterns that back-test poorly but pass replication are promoted with a note and watched.

**Confounding by treatment.** Effect sizes estimated on exploit-arm data are biased upward for the patterns the exploit policy already favours, because those posts received more distribution because they scored well. Per [ADR-0003](adr/0003-exploration-budget.md), effect sizes are estimated on explore-arm data where n permits, and exploit-arm effect sizes are treated as upper bounds pending replication. Where neither is possible honestly, the pattern stays at `insufficient_evidence` indefinitely. There is no deadline by which a pattern must become active.

**Sample-size floor.** `sample_size ≥ 30` and the bootstrapped effect-size confidence interval must exclude zero. Below this, `insufficient_evidence`, retained as a hypothesis, never used for scoring, never shown to a client.

**Proxy never enters an estimate.** Per [ADR-0001](adr/0001-trend-signal-sourcing.md) and [ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md), effect sizes are estimated over the **internal corpus only**. The exemplar corpus proposes candidate predicates and anchors retrieval; it contributes no number. An estimator that pools the two corpora computes a lift partly over `Proxy` engagement and feeds it into VPS, where a client reads it as a calibrated score. The provenance label is correct where the number is born and gone one hop later. **A test asserting that the estimator's input set contains no exemplar-sourced outcome is a permanent regression test on the architecture**, in the same class as the prompt-injection suite above.

---

## Gate: is a mechanism a mechanism, or a trend wearing a lab coat?

**The claim.** A `contrasted` mechanism describes a structural regularity that outlives any one format.

**The measurement.** Three counts, computed deterministically over the exemplar corpus. One of them does the real work.

`n_creators ≥ 8` guards against a corpus of winners being a corpus of one winner's habits. Ten posts by one creator is one creator, not ten data points, and an estimator that forgets this is counting a person's editing style as evidence about content.

`n_cohorts ≥ 2` guards against a claim about beauty-on-TikTok being sold as a claim about content.

**`n_trends ≥ 2` is the gate that matters, and it is the one nobody would think to build.** A predicate observed only inside a single trend's posts *is that trend*. It will fall when the trend falls, and until then it looks exactly like a mechanism — high prevalence in the top decile, low prevalence in the contrast set, a plausible causal story attached. The only thing distinguishing a structure from a fashion is that the structure shows up in the next fashion too.

**The threshold.** `prevalence_ratio ≥ 2.0` on the mining slice and `≥ 1.5` on a **temporally disjoint** slice. Mined on Q1, checked on Q2 — the same rule the pattern miner obeys, applied to a different object.

**No p-value, deliberately.** There is no sampling model that honestly describes "the top decile of a hand-curated allowlist of creators, ranked on proxy engagement." A confidence interval here would import a precision the sampling frame cannot support. Two prevalences, their ratio, the counts behind them, and the corpus snapshot they were counted over: that is the entire evidence, stated in full rather than compressed into a statistic implying a design it never had.

**Expected outcome, stated in advance so it cannot be rationalised afterwards.** Most conjectures will die at `conjectured` on `n_trends`, not on `n_creators`. Hook-structure predicates will clear the bar. Pacing and text-density predicates will not, because they are format properties and formats are what trends are made of. If a majority of proposed predicates reach `contrasted` in the first year, the bar is too low and the corpus is too small, in that order.

---

## Gate: does trend-directed ingestion earn its coupling?

**The claim.** [ADR-0004](adr/0004-trend-detection-and-submission.md)'s one permitted coupling — a `rising` trend with a `go` verdict raises exemplar ingestion priority for its format — points the corpus builder at the right place, and therefore produces better mechanisms.

Until now this was an assertion with no test attached, inside a document set whose stated standard is that everything must be able to be shown not to work.

**The measurement.** Reserve a slice of exemplar ingestion budget — 25% suffices — for **uniform** ingestion across the vertical, ignoring trend priority. Tag every exemplar with its **ingestion arm**, `trend_directed` or `uniform`, and propagate it to every mechanism the exemplar grounds as `Mechanism.ingestion_arm` (`mixed` where its exemplars span both). After four corpus refreshes, compare the rate at which candidate predicates from each arm reach `contrasted`.

> **`ingestion_arm` is not `arm`, and the two field names must never converge.** The amplification **`arm`** — `{exploit, explore}` — lives on `AmplificationAllocated` and `PerformanceSnapshot`, governs client money under [ADR-0003](adr/0003-exploration-budget.md), and is called "the most valuable field in the system" in `events-v1.json` for good reason. The **`ingestion_arm`** — `{trend_directed, uniform, mixed}` — lives on a `Mechanism` and an `ExemplarPost`, governs where a corpus builder looks, and touches no money at all. A `Mechanism` never carries `arm`; `mechanisms-v1.json` lists it as a forbidden field so that a future author writing a bare `arm` here fails schema validation rather than quietly conflating two budgets.

This is the same *instrument* as ADR-0003's exploration budget — a reserved slice that funds what the policy would not have chosen — aimed at a different question, on a different budget. It is here for the same reason: a system that only ever looks where it already believes will never learn it was looking in the wrong place.

**The threshold.** Trend-directed ingestion must produce `contrasted` mechanisms at a materially higher rate than uniform, at 80% confidence, within four refreshes. Not 95% — the decision this test informs is "keep the coupling or delete it," not "publish a paper."

**The honest branch.** If uniform does as well, **REQ-005f is deleted and ingestion priority is set uniform.** The trend subsystem keeps its independent justification — it feeds briefs, which is what ADR-0004 says it is for — and loses a coupling it was never shown to deserve.

This is a plausible outcome, because trend-directed ingestion optimises for *recency* while `n_trends ≥ 2` explicitly penalises a predicate that lives in only one trend. Those two pressures point in opposite directions. That tension is not a design flaw. It is the test.

---

## Gate: does the Knowledge API say only what it has earned?

**The claim.** No Component 4 response contains a causal claim, a number a circuit breaker governs, or any information derived from a tenant's outcome data.

**The measurement.** Three checks, all of which run in CI rather than in a review meeting.

*Schema.* [`schemas/mechanisms-v1.json`](schemas/mechanisms-v1.json) sets `additionalProperties: false` and omits `effect_size`, `effect_ci`, `lift`, `vps`, `aws`. A test asserts that adding any of them fails validation. This is the check that survives a well-meaning engineer who wants to "just add a confidence score."

*Lexicon.* A permanent, growing list of forbidden verbs — *causes, lifts, drives, predicts, increases, boosts* — checked against every `statement` at ratification and again at serve time. A model asked to explain why something works reaches for causal language every time, because that is what an explanation sounds like. The human ratifier is the primary control; the lexicon check is the regression test on the ratifier.

*Provenance.* An adversarial suite, in the spirit of the prompt-injection suite above, asserting that no reachable code path lets an `OutcomeEvent`, a `Pattern`, a `PerformanceSnapshot`, or a `tenant_id` enter a `Mechanism`. In the suite from day one:

- A mechanism whose `feature_predicate` was proposed from an internal-corpus post
- A prevalence computed over a corpus that includes a submission
- A `MechanismLibraryVersion` key carrying a tenant identifier
- A C2 code path that resolves a mechanism library
- A C4 response containing any `0-100` field
- A C4 response served for an unratified statement, or one with an empty `ratification_note`
- A `contrasted` mechanism carrying fewer than two temporal slices, or two overlapping ones
- A `Mechanism` carrying an `arm` field (the amplification arm never appears here; `ingestion_arm` does)

Each must fail to build, fail a test, or fail schema validation. **If any ever ships, the architecture has been violated and the finding is a P1** — for the same reason a model-influenced veto is a P1: it means a stated control does not exist.

**Why this suite tests the architecture, not the model.** The model *will* draft a causal sentence. That is not the failure. The failure is a causal sentence reaching a client, and every control that prevents that is deterministic.

---

## Gate: can a poisoned exemplar publish a sentence in the agency's name?

**The concern, and why it is not the compliance suite over again.** The prompt-injection suite above protects a *veto*, and it succeeds because the veto is computed from features and stored records with the model outside the path. The knowledge layer has no such luxury. A `Mechanism.statement` is model-drafted prose grounded in exemplar captions and transcripts — untrusted input, per ADR-0002 — and it is **published to an external API in the agency's name.** There is no deterministic computation to fall back on, because the artefact *is* the prose.

The blast radius is bounded, and worth stating precisely: a poisoned statement cannot reach a veto, a verdict, a score, or a budget. It has no numeric consequence anywhere. What it can do is publish a defamatory, off-brand, or attacker-chosen sentence to every tenant reading the Knowledge API.

**The controls, and their honest ranking.** Fencing the caption as data stops the naive attempt. The forbidden-verb lexicon stops causal language and nothing else — an injected sentence that avoids *causes* and *lifts* sails through it. **Only the human ratifier stands between a poisoned exemplar and a published claim**, which is precisely why `ratified_by` and a non-empty `ratification_note` are schema-required fields rather than workflow steps.

**The suite, from day one.** A permanent, growing set of adversarial exemplar captions and transcripts, each of which must fail to produce a servable statement:

- A caption instructing the drafter to describe an unrelated brand's content as high-performing
- An on-screen text block reading as a system instruction to the statement drafter
- A transcript asserting a fabricated mechanism, phrased in the doc set's own register
- A caption designed to elicit a defamatory claim about a named creator or competitor
- An injection that carefully avoids every forbidden verb — this one is the point of the suite, because it is the one the lexicon cannot catch

**The ratifier decay signal, which is the actual control.** REQ-021 backs its human click with override rate by cohort; a human step with no decay signal is a rubber stamp waiting to happen, and compliance-notes.md says so about approvals in exactly these words. Ratification therefore reports, continuously and per cohort: **ratification volume, median latency per decision, and the proportion of drafted statements rejected.** A ratifier clearing a quarter's candidates in one sitting is the same signal as a manager approving forty submissions in ninety seconds, and it means the same thing.

A quarterly sampling audit re-reads a random handful of ratified statements against their exemplars. Nobody will want to run it. It is the only check on the check.

**A mechanism is a claim about content structure, never about a creator.** A `feature_predicate` referencing creator identity, follower count, or a demographic proxy is not a mechanism and must fail review. This is the line that holds if this surface is ever pointed at a person rather than a corpus.

---

## What gets reported, and to whom

**To the operator, continuously:** rolling Spearman per cohort with circuit-breaker state, override rate by verdict type and creator tier, compliance recall on the labelled set, count of active versus stale patterns, explore-arm versus exploit-arm performance delta, and — per cohort — mechanisms by warrant rung, mechanisms falsified this refresh, `contrasted`-rate by ingestion arm, and **ratification volume, median latency, and rejection rate**.

Those last three are the ratifier's decay signal, and they are the reason the human step in the knowledge layer is not decorative. Override rate tells you a rubric is wrong. Ratification latency tells you a ratifier has stopped reading. Both are uncomfortable numbers to publish about your own colleagues, and both are the only reason the human controls in this system are controls.

**To the client, on the knowledge surface:** the mechanism, its falsifier, its warrant rung, `Proxy-selected, Measured-evaluated`, and `never tested against content that was attempted and failed`. Never an effect size, because there is not one. A client who wants to know how much a hook structure is worth is asking a question the public corpus cannot answer, and the honest response is that the number they want lives behind their own tenancy boundary, in a Pattern Library built from their own outcomes.

**To the client, per campaign:** the recommendation, the reasoning, the naive-baseline counterfactual, the exploration allocation and its rationale, the provenance of every number, and where the cohort's calibration stands. If the circuit breaker has tripped, the client sees a ranking without scores and a sentence explaining why. This is more credible than a number, not less.

**Never reported as a headline:** an accuracy figure. There is no accuracy here. There is rank correlation on held-out data with a confidence interval and a sample size, and anyone who wants a single number for how well the system works should be given that one, with its interval attached.

---

## The schedule

| When | What | Blocks |
|---|---|---|
| Before Phase 1 | Baseline manager triage time, instrumented | Success metric 1 is otherwise unmeasurable |
| Before Phase 3 | Inter-rater reliability, n=40, 3 raters | Rubric validity. Do not build a scorer for criteria humans cannot apply. |
| Before Phase 3 | Compliance labelled set, n≥200, adversarial suite live | Phase 1 cannot ship without it |
| Throughout Phase 3 | VPS shadow mode accumulating predictions vs outcomes | Phase 4 gate |
| End of Phase 3 | Spearman ≥ 0.35, n ≥ 60, ≥2 cohorts | VPS graduates from shadow, or does not |
| Throughout Phase 4 | AWS shadow vs human amplification decisions, counterfactual logged | Phase 5 gate |
| Quarter 2 post-launch | AWS vs naive baseline, matched pairs | AWS survives or is deleted |
| Before any C4 response ships | Schema, lexicon, and provenance suites green | The Knowledge API cannot serve without them |
| Every corpus refresh | Recount prevalences; auto-demote falsified mechanisms | Continuous, no human step |
| After 4 corpus refreshes | Trend-directed vs uniform ingestion, `contrasted` rate | REQ-005f survives or is deleted |
| Quarterly, ongoing | Fairness audit, pattern back-tests, freshness, mechanism survival rate | Continuous |

The phases that produce nothing user-facing - Phase 0 instrumentation and Phase 3 shadow mode - are the two that will be under pressure to skip. They are the two that determine whether anything after them is real.

**Phase 6 has the same shape and a different disguise.** The Knowledge API will return empty collections for months while the corpus accumulates eight creators across two cohorts and two unrelated trends. The pressure there will not be to skip the phase — it will be to lower `n_trends` to one, so that the API has something to say. That is the same decision as widening the calibration window during a bad quarter, and it should be refused for the same reason. An empty, honest API is a working API; the `coverage` object exists so that it can be told apart from a broken one.

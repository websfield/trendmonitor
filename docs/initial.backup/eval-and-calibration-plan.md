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

---

## What gets reported, and to whom

**To the operator, continuously:** rolling Spearman per cohort with circuit-breaker state, override rate by verdict type and creator tier, compliance recall on the labelled set, count of active versus stale patterns, explore-arm versus exploit-arm performance delta.

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
| Quarterly, ongoing | Fairness audit, pattern back-tests, freshness | Continuous |

The two phases that produce nothing user-facing - Phase 0 instrumentation and Phase 3 shadow mode - are the two that will be under pressure to skip. They are the two that determine whether anything after them is real.

# Component 1: Pattern Engine

**Produces beliefs.** Ingests trend signal and exemplar content from the outside world, assembles a labelled corpus from Component 2's outcome events, mines patterns, and cuts candidate library versions that Component 3 must approve before publication.

**Talks to Component 2 through:** [Contract A](integration-contract.md#contract-a-patternlibraryversion-c1--c2) (publishes an immutable library) and [Contract B](integration-contract.md#contract-b-outcomeevent-stream-c2--c1-c2--c3) (consumes an event log). Nothing else.

**Cannot:** publish a library without Component 3's verdict, read ClientHub's operational tables, or influence a score at request time.

---

## 1.1 Term Registry

**The problem nobody in the source repos addresses.** A trend detector scans terms. Which terms? The space is unbounded - every hashtag, sound, format name, aesthetic, product category, and slang coinage on five platforms. The scan budget is bounded. Something has to decide what gets watched, and if that something is "whatever a manager typed in last March," the detector is watching a fossil.

**Responsibility.** Maintain a bounded, prioritised set of tracked terms per `(vertical, platform)`, with an admission policy, a scoring function, and an eviction rule.

**Admission.** A term enters the registry from one of five sources, and its origin is recorded because origin predicts usefulness:

| Origin | Example | Notes |
|---|---|---|
| Vertical taxonomy seed | `serum`, `dupe`, `skin barrier` | Static, curated once per vertical, low yield but essential floor |
| Brief keyword extraction | terms from live campaign briefs | Highest relevance, arrives with a campaign, expires with it |
| Pattern library format names | `problem-statement hook`, `GRWM` | Terms the system already believes matter |
| Human submission | per [ADR-0004](adr/0004-trend-detection-and-submission.md) | The only path to closed-platform sounds and formats |
| Exemplar corpus clustering | emergent format labels from feature clusters | Slow, occasionally the only source of a genuinely new name |

**Priority.** Scan budget allocates by

```
priority = w₁ · vertical_relevance
         + w₂ · client_exposure            (campaigns live in this vertical now)
         + w₃ · recent_submission_interest (weighted by submitter reputation)
         + w₄ · historical_yield           (did watching this term ever produce a go verdict?)
```

`historical_yield` is the term that matters after the first year and is worthless before it. A registry that never learns which terms were worth watching spends its budget re-scanning `skincare` forever.

**Eviction.** A term with no observation above baseline for 90 days, no live campaign exposure, and no submission interest is demoted to cold storage. It is never deleted, because a term that dies and returns is itself signal, and because deletion would break the trailing baselines that make z-scores meaningful.

**Cap.** Hard cap per `(vertical, platform)`, defaulting to 250 active terms. The cap exists so that the scan budget is a design parameter rather than a bill.

---

## 1.2 Source Adapter Layer

**Responsibility.** Pull daily volume observations for registry terms from the keyless sources permitted under [ADR-0001](adr/0001-trend-signal-sourcing.md), normalise them, and stamp provenance.

Each adapter is a pure function from `(term, date_range)` to a series of `TrendObservation`. Adapters are independently deployable, independently failing, and independently disabled.

| Adapter | Surface | Yields | Provenance |
|---|---|---|---|
| `google_trends_rss` | Daily trending searches, AU geo | Search interest, coarse | `Proxy` |
| `reddit` | Subreddit new/rising JSON | Post velocity per subreddit, per term | `Proxy` |
| `youtube_rss` | Channel RSS + outlier detection | A tracked channel's video exceeding 5x its trailing median views | `Proxy` |
| `wikipedia_pageviews` | Pageviews API, daily | Attention on a named entity | `Proxy` |
| `hacker_news` | Algolia API, points + comments | Heat, tech verticals only | `Proxy` |
| `news_pulse` | Keyless search, recency-filtered | Corroboration only, never primary | `Proxy` |
| `tiktok_creative_center_manual` | Human, per ADR-0004 | Sounds, hashtags, formats | `User-provided` |

**Every keyless read is `Proxy`, without exception.** Corroboration by a second source upgrades a signal's `confidence` field. It never upgrades `provenance`. This is inherited from ECHO's `O1` red line and it is the single discipline that survives the question "where did this number come from" eighteen months later.

**Failure.** A source going dark - RSS 404, API shape change - freezes the baselines for terms sourced only from it. Signals depending on it drop to `single_source` confidence or archive at `valid_to`. **No adapter ever imputes a missing volume.** A gap in the series is a gap, and a z-score computed across an imputed gap is a fabrication with a decimal point.

---

## 1.3 Trend Detector

**Responsibility.** Turn observation series into `TrendSignal`s with lifecycle stages, and raise candidates.

**Baseline.** Per `(term, source)`, trailing 28-day median and median absolute deviation. Robust z:

```
robust_z = 0.6745 · (x_today − median₂₈) / MAD₂₈
```

Median and MAD, not mean and standard deviation, for the same reason `CreatorBaseline` uses them: volume series are heavy-tailed, and one news event drags a mean baseline high enough to mask a genuine emerging trend for a month.

**Candidate rule.** `robust_z > 3` sustained across two or more consecutive days. The consecutive-day requirement is what distinguishes a trend from a news event. It costs one day of latency and buys a large reduction in false positives. A single-day `z > 5` alerts a manager without creating a signal.

**Lifecycle.** Three-day EMA of the observation series. Let `v` be the first difference, `a` the second.

| Stage | Condition |
|---|---|
| `rising` | `v > 0` ∧ `a ≥ 0` |
| `peak` | `v ≈ 0` ∧ `a < 0`, or `v > 0` with strongly negative `a` |
| `declining` | `v < 0` |

**Days remaining.** Fitted from the observed post-peak decay of resolved trends on the same platform. Below 20 resolved trends, no curve exists, `days_remaining_est` is null, and the band derives from stage alone. See [tech-spec-trend-subsystem.md](tech-spec-trend-subsystem.md).

**Verdict.** `go` requires `rising`, a window comfortably exceeding the tenant's brief-to-live lead time, adequate brand fit, and no risk flag. The safety factor is 1.5, because brief-to-live is a median rather than a guarantee, and landing a campaign into a dying trend costs the whole campaign.

---

## 1.4 Submission and Resolution Engine

Fully specified in [ADR-0004](adr/0004-trend-detection-and-submission.md) and [tech-spec-trend-subsystem.md](tech-spec-trend-subsystem.md). Summary of its role inside C1:

Humans submit closed-platform trends the scan cannot see, with a committed probability distribution over `{rising, peak, declining}` at T+14d. Predictions resolve against the detector where possible and against a named resolver where not. Submitters earn credit as `skill_score × ln(1 + lead_days)`, so accuracy on already-obvious trends earns nothing. Reputation is shrunk toward a prior with `k = 20`.

The engine's output into the rest of C1 is a promotion decision: a candidate raised only by submission is promoted to `TrendSignal` when the weighted submitter reputation clears a threshold, a second independent submitter names it, or the detector corroborates it.

**The one thing worth restating here.** Submitted trends never enter the Pattern Library. They raise ingestion priority for the exemplar corpus builder, so that C1 goes and looks at content in that format and mines the mechanism underneath it. Trends are disposable. Mechanisms compound.

---

## 1.5 Exemplar Corpus Builder

**Responsibility.** Assemble and refresh a corpus of 200 to 500 high-performing public posts per `(vertical, platform)`, each reduced to a `FeatureRecord` by the shared Extraction Service.

**Method,** adapted from corey's `reverse-engineering.md`: identify 10 to 20 consistently high-performing creators in the vertical, collect their posts, rank by engagement rate against each creator's own baseline rather than absolute, and retain the top decile.

Ranking against each creator's own baseline rather than absolute engagement is a deliberate departure from the source. Absolute ranking builds a corpus of posts by creators with large audiences, which teaches the miner that having a large audience is a content pattern.

**Ingestion priority** is driven by the trend detector. A `rising` trend with a `go` verdict raises the priority of exemplars in that format and vertical, so the corpus is refreshed where it is about to matter rather than uniformly.

**Source allowlist.** A source enters the allowlist only where its terms permit the access pattern used. The allowlist is a config artefact under version control, reviewed like code, per [ADR-0001](adr/0001-trend-signal-sourcing.md). Where no compliant path exists for a platform, that platform's exemplar corpus is empty and its Pattern Library is built from the internal corpus alone. That is a slower path to the evidence threshold. It is not a reason to build a crawler.

**The bias this corpus carries, stated plainly.** It is a sample of winners. You observe what succeeded, never what was attempted and failed. Patterns mined from it alone are patterns of survivorship. This is why the internal corpus, which contains rejected and underperforming content, is the primary source and the exemplar corpus is the prior.

---

## 1.6 Internal Corpus Assembler

**Responsibility.** Rebuild C1's view of ClientHub's closed loop by replaying the `OutcomeEvent` stream against the `FeatureRecord` store.

This is the component that makes the system defensible, and it is the one nobody would build first. The exemplar corpus tells you what is popular. The internal corpus tells you what worked for this client, and - because it contains rejections, overrides, and approved content that underperformed - it is the only unbiased sample of outcomes the system will ever hold.

**Assembly.** Fold `SubmissionScored`, `VerdictIssued`, `VerdictOverridden`, `PostPublished`, `PerformanceSnapshot`, and `AmplificationAllocated` into a per-submission record joining features to outcome, arm, and human judgement.

**Idempotency.** Events arrive at-least-once. Deduplicate on `idempotency_key` before folding. A double-counted outcome inflates an effect size, and effect sizes are the entire product.

**Replay is the primary operation, not a recovery path.** An extractor version bump invalidates every `FeatureRecord`. The response is: backfill features under the new extractor, replay the event log against them, re-mine. Because the assembler holds no state that cannot be reconstructed, this is a long operation rather than a dangerous one.

**Arm propagation.** `AmplificationAllocated.arm` is stamped onto every subsequent `PerformanceSnapshot` for that post. Explore-arm outcomes are what the miner needs. An assembler that loses the arm tag converts the exploration budget from an investment into a donation.

---

## 1.7 Pattern Miner

**Responsibility.** Propose feature predicates, estimate their effect on outcome, and promote the survivors to `active`.

**Proposal.** Candidate predicates are machine-evaluable conditions over `FeatureRecord`: hook archetype, first-frame face scale, on-screen text density inside the hook window, cut cadence band, filler-word rate, opening-line syntactic form, and combinations thereof. Proposal is cheap and generous; promotion is expensive and mean.

**Estimation.** For each predicate, the lift in 24-hour engagement-rate percentile for posts satisfying it versus the cohort median, with a bootstrapped confidence interval.

**Confounding by treatment, and the correction.** A post that was amplified performed better partly because it was good and partly because it was amplified. Regressing outcome on features across a corpus where amplification was assigned by AWS is regressing outcome on a variable that caused the treatment. Effect sizes estimated on exploit-arm data are therefore biased upward for exactly the patterns the system already believes.

The correction, per [ADR-0003](adr/0003-exploration-budget.md): **estimate on explore-arm data where n permits.** Treat exploit-arm effect sizes as upper bounds requiring replication. Where neither is possible honestly, the pattern stays at `insufficient_evidence` indefinitely. There is no deadline by which a pattern must become active.

**Three guards before promotion.**

*Multiple comparisons.* Mining a hundred predicates against a few hundred posts surfaces several spurious patterns at p < 0.05 by construction. Benjamini-Hochberg across the full candidate set, not across the survivors.

*Temporal replication.* Mined on period 1, confirmed on period 2. A pattern that holds only in the window it was mined from is a description of that window.

*Back-test.* Evaluated against the prior quarter before it can influence a score. Result recorded on the pattern. A pattern that passes replication but back-tests poorly is promoted with a note and watched.

**Floor.** `sample_size ≥ 30` and a bootstrapped effect-size confidence interval excluding zero. Below this, `insufficient_evidence`: retained as a hypothesis, shipped inside the library artefact for auditability, never retrieved, never shown to a client.

**Staleness.** A pattern past `valid_to` without refresh becomes `stale` and is excluded from retrieval automatically. A decaying library that nobody notices is the quiet failure mode of every system of this kind.

---

## 1.8 Library Publisher

**Responsibility.** Cut candidate library versions, request shadow evaluation, and - only on Component 3's verdict - publish.

**Cut.** A candidate is an immutable artefact containing every pattern for a cohort, `active` and `insufficient_evidence` and `stale` alike, with the compatibility triple that constrains its use. Cutting is cheap and can happen after any mining run.

**Shadow.** C1 requests shadow from C3. C3 flips the cohort's breaker to `shadow`. C2 begins dual-scoring: every submission scored against both incumbent and challenger, both stored, only the incumbent surfaced. This runs for six to twelve weeks, until at least 60 outcomes have accumulated against both.

**Verdict.** C3 computes the rank correlation for each library **on the same held-out submissions** and issues `promote`, `reject`, or `extend_shadow`. The paired comparison controls for the quarter being an easy one, which comparing across time does not.

**Publish.** On `promote`, C1 writes the artefact and repoints `active_version`. C3 resets the calibration window, because the scorer changed. The cohort's breaker drops to `cold` until `n` rebuilds.

**Cadence, and the constraint that surprises people.** Mining runs nightly. Publishing cannot run more often than the calibration window can refill, which is roughly quarterly. This falls directly out of the eval plan and is invisible until the third library swap, at which point somebody notices that the rolling correlation has been averaging two different scorers for a year.

**C1 cannot promote itself.** Per [ADR-0005](adr/0005-three-components-and-the-referee.md), a component able to publish its way out of an unfavourable calibration reading will eventually do so, and the calendar-driven alternative promotes worse libraries on schedule, forever, with the evidence erased on each promotion.

---

## What C1 never does

It never calls Component 2. It never reads ClientHub's operational tables. It never sets a breaker flag. It never publishes without a verdict. It never lets a trend signal into a pattern. It never lets Tenant A's outcome data inform Tenant B's library, and the enforcement is at the repository layer with no widening override, because that boundary needs to be structural rather than a policy someone can be persuaded to relax under commercial pressure.

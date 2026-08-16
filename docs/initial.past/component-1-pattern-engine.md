# Component 1: Pattern Engine

**Produces beliefs.** Ingests trend signal and exemplar content from the outside world, assembles a labelled corpus from Component 2's outcome events, mines patterns and mechanisms, and cuts candidate library versions.

**Talks to Component 2 through:** [Contract A](integration-contract.md#contract-a-patternlibraryversion-c1--c2) (publishes an immutable pattern library) and [Contract B](integration-contract.md#contract-b-outcomeevent-stream-c2--c1-c2--c3) (consumes an event log).
**Talks to Component 4 through:** [Contract E](integration-contract.md#contract-e-mechanismlibraryversion-c1--c4) (publishes an immutable mechanism library). Nothing else.

**Cannot:** publish a pattern library without Component 3's verdict, read ClientHub's operational tables, influence a score at request time, or let a `Proxy` value enter an effect-size calculation.

---

## 1.0 The two libraries, and why they were one name for too long

C1 produces two artefacts, and confusing them is the failure mode this component was closest to shipping with.

| | **Mechanism Library** → C4 | **Pattern Library** → C2 |
|---|---|---|
| Answers | why a structure might work | whether a predicate predicted, in this tenant |
| Mined from | public exemplar corpus + trends | internal outcome events, conditioned on `arm` |
| Tenancy | tenant-neutral by construction | tenant-scoped, never crosses |
| Carries | statement, predicate, prevalence, falsifier, warrant | effect size, CI, sample size, validity window |
| Provenance | Proxy-selected, Measured-evaluated | Measured / User-provided |
| Effect size | forbidden by schema | required |
| Gated by | a named human ratifying the statement | C3's `LibraryVerdict` |
| Cadence | quarterly, on corpus refresh | quarterly, bounded by calibration accumulation |

[ADR-0001](adr/0001-trend-signal-sourcing.md) said it and §1.5 below repeats it: **the exemplar corpus is the prior; the internal corpus is the likelihood.** The prior and the likelihood are two objects. Per [ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md), they are now two artefacts, published to two consumers, and a value from one never crosses into the other.

The rule that falls out of this, and that §1.7 enforces:

> **Proposal runs over the union of both corpora. Estimation runs over the internal corpus only.**

Proposing a candidate predicate from a public exemplar is free, biased, and harmless. Estimating its effect size from that exemplar's `Proxy` engagement rate is the laundering ADR-0001 exists to prevent.

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

**Method,** adapted from corey's `reverse-engineering.md`: identify 10 to 20 consistently high-performing creators in the vertical, collect their posts, and rank by engagement rate against each creator's own baseline rather than absolute.

Ranking against each creator's own baseline rather than absolute engagement is a deliberate departure from the source. Absolute ranking builds a corpus of posts by creators with large audiences, which teaches the miner that having a large audience is a content pattern.

**Two sets are retained, not one.** The source recipe keeps the top decile and discards the rest. That discard makes §1.9's contrast set uncomputable, and a prevalence without a comparison group is a number with no meaning.

| Set | Contents | Used for |
|---|---|---|
| **Top-decile corpus** | each creator's own top-decile posts | pattern proposal, retrieval anchors, `prevalence_in_top_decile` |
| **Contrast set** | the *same creators'* posts **below** their own top decile | `prevalence_in_contrast_set` |

Both are extracted to `FeatureRecord`s by the shared Extraction Service, under the same `extractor_version`, because a predicate evaluated over 3.2 features cannot be compared against 4.0 features on the other side of the ratio.

**This roughly multiplies extraction cost, and it is the cheapest honest option available.** The contrast set is what converts "this structure is common among winners" — which is true of talking to a camera — into "this structure is *disproportionately* common among winners." Without it there is no asymmetry to measure, no falsifier to state, and no mechanism. Sampling the contrast set rather than taking it whole is permitted; sampling must be per-creator and recorded, so the ratio's denominator stays interpretable.

**What neither set controls for.** The content nobody ever made. Both halves are drawn from creators who were already selected for being consistently high-performing, so the contrast set is *a winner's ordinary work*, not *a loser's work*. It controls for audience size and platform format norms. It does not control for survivorship, and no public corpus ever will. This is why `never_tested_against: "content that was attempted and failed"` rides on every mechanism and is not removable.

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

**Proposal runs over the union of both corpora. Estimation runs over the internal corpus only.** This is the single most important sentence in this component, and the doc set said the opposite until [ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md).

Candidate predicates are machine-evaluable conditions over `FeatureRecord`: hook archetype, first-frame face scale, on-screen text density inside the hook window, cut cadence band, filler-word rate, opening-line syntactic form, and combinations thereof. The exemplar corpus proposes generously — it is cheap, it is biased, and proposing is harmless because promotion is where the discipline lives. Trends direct where it proposes, per §1.5. Promotion is expensive and mean.

**Estimation.** For each predicate, the lift in 24-hour engagement-rate percentile for posts satisfying it versus the cohort median, with a bootstrapped confidence interval — **computed over internal-corpus posts only.**

**Why not the union.** Exemplar posts carry `Proxy` engagement, because no closed platform has a compliant keyless read surface for engagement data ([ADR-0001](adr/0001-trend-signal-sourcing.md), Tier 3), and that ADR is unambiguous: a `Proxy` value never enters an effect-size calculation. An estimator that pools exemplar and internal outcomes computes a lift over Proxy numbers and feeds the result into VPS retrieval, where a client eventually reads it as a calibrated score. The provenance label is correct at the point of computation and is gone one hop later. This is why ADR-0001 chose structural provenance over documentary provenance, and it is why the query layer refuses to aggregate across mixed provenance without a logged override.

What the exemplar corpus contributes to a `Pattern` is therefore exactly two things: the **candidate predicate**, and the **nearest-neighbour exemplars** retrieved alongside it as calibration anchors at score time. Never a number.

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

## 1.9 Mechanism Synthesiser

**Responsibility.** Turn recurring structure in the public exemplar corpus into falsifiable hypotheses about *why* — and refuse to turn them into numbers.

This is the component that answers the question the rest of the system does not ask. A `Pattern` says *this predicate correlated with outcome, in this tenant, this quarter*. A `Mechanism` says *this structure recurs among high performers across unrelated trends, here is why we think it holds, and here is what would prove us wrong*.

**Input.** The exemplar corpus and its contrast set (§1.5), and the trend signals that directed its ingestion (§1.3, §1.4). **Never** the internal corpus, never an `OutcomeEvent`, never a `Pattern`, never a tenant table.

**The synthesiser proposes its own predicates, over the exemplar corpus alone.** It does *not* consume §1.7's proposal output, and this is not redundancy to be optimised away. §1.7 proposes over the union of both corpora — that is correct for a `Pattern`, which will be estimated on internal outcomes anyway. But a candidate predicate that reached the synthesiser via a union-reading stage would make the mechanism library's *predicate selection* a function of tenant data, even though no tenant number could survive the trip.

That distinction matters more than it looks. [ADR-0007](adr/0007-the-knowledge-api-boundary.md)'s claim is not "no tenant number leaks." It is that **a bug in C4's tenancy check cannot leak tenant data, because none is reachable from the process** — a property of the dataflow, not of a filter. An invariant stated as *reachability* and implemented as *washing out* is an invariant that has already been weakened once and will be again. So the synthesiser's read grant is the exemplar corpus, and a predicate proposed from a submission is not a predicate it has ever seen.

The two proposal stages will independently rediscover most of the same predicates. That duplication is the price of the invariant, it is cheap (proposal is a pass over `FeatureRecord`s that already exist), and it is the reason C4 can be exposed outside ClientHub at all.

**Counting.** For each candidate predicate, in a cohort:

```
prevalence_in_top_decile   = |{ top-decile exemplars satisfying P }| / |top-decile exemplars|
prevalence_in_contrast_set = |{ contrast posts satisfying P }|       / |contrast posts|
prevalence_ratio           = prevalence_in_top_decile / prevalence_in_contrast_set
```

The **contrast set** is named explicitly, because a prevalence without a comparison group is a number with no meaning. v1: *the same creators' posts that did not reach their own top decile.* Same creators controls for audience size. Same platform controls for format norms. Nothing controls for the content nobody ever made, which is why every mechanism ships `never_tested_against: "content that was attempted and failed"` and why the field is not removable.

**Why this is not an effect size, and is allowed to exist.** Top-decile membership was selected using `Proxy` engagement. But the predicate is evaluated *deterministically* over the `FeatureRecord` extracted from the media itself. A prevalence is a **count over a proxy-selected set**, not an aggregation of proxy *values*. No `Proxy` number is displayed, averaged, or compared as `Measured` anywhere. The provenance label states exactly this: `Proxy-selected, Measured-evaluated`.

`prevalence_ratio` is a **descriptive asymmetry on a proxy-selected sample**. It is confounded by everything the corpus did not observe. It is not a lift, and the words *causes*, *lifts*, *drives*, and *predicts* are unavailable at every rung of the ladder below.

**The statement, and the falsifier.** A model drafts the `statement` — the prose "why" — from the predicate and its exemplars. A named human ratifies it. The `falsifier` — the observation that would sink the mechanism — is written **before** the evidence is gathered. A mechanism without a stated falsifier is a caption on a chart, and the schema requires the field.

The statement is model-drafted prose about content that was itself untrusted. It is fenced as untrusted upstream, it is never machine-consumed downstream, and a human ratifies it before it is served. The third control is the only one that survives a determined prompt injection, which is why `ratified_by` is a required field and not a workflow step.

**Ratification records a reason, and ratifiers are watched.** `ratification_note` is required and non-empty: why this statement was accepted, in the ratifier's own words. This is deliberate symmetry with the breaker's arming rule in Contract C — *automatic to trip, manual **with a recorded reason** to arm.* A click with no reason decays into a rubber stamp, which is the precise failure [compliance-notes.md](compliance-notes.md) warns about for REQ-021: a reviewer who approves forty submissions in ninety seconds has not exercised judgement, and a regulator would be right to say so.

REQ-021 backs its human click with a decay signal — override rate by cohort. Ratification needs one too, or the analogy is decoration. **Ratification volume and median latency per cohort are reported to the operator continuously**, and a ratifier clearing a quarter's candidates in a sitting is the signal, exactly as a 40% override rate is the signal that a rubric is wrong.

**What ratification does not referee.** It reviews the *prose*, not the *counts*. Nobody independently recomputes a prevalence, the way C3 independently recomputes a Spearman on paired held-out submissions. This is the one place in the system where the producing component self-gates its own evidence, and it is acceptable only because the blast radius is bounded: no number reaches a decision, no tenant datum is present, the artefact is immutable and content-addressed against a named corpus snapshot, and a mis-counted prevalence auto-demotes to `falsified` at the next refresh without anyone deciding to look. Those four properties are load-bearing. Remove any one and this needs a referee.

**The warrant ladder.** Per [ADR-0006](adr/0006-mechanisms-and-the-warrant-ladder.md), computed deterministically from the counts:

| Rung | Requires | Served by C4 |
|---|---|---|
| `conjectured` | a proposed predicate | no |
| `recurrent` | `n_creators ≥ 8` ∧ `n_cohorts ≥ 2` ∧ **`n_trends ≥ 2`** | yes |
| `contrasted` | recurrent ∧ ratio ≥ 2.0 on the mining slice ∧ ≥ 1.5 on a temporally disjoint slice | yes |
| `falsified` | the asymmetry did not survive a corpus refresh | no — retained forever |

**`n_trends ≥ 2` is where "trends are disposable, mechanisms compound" stops being a slogan.** A predicate observed only inside one trend's posts *is that trend*, wearing a lab coat. Two unrelated trends is the minimum evidence that a structure outlives any one format. When a trend archives, the mechanisms it occasioned remain, and `occasioned_by_trend_ids` keeps the archived signal queryable.

**Automatic to demote, human to promote.** On every corpus refresh, `prevalence_ratio` recomputes on the new temporal slice. A `contrasted` mechanism whose asymmetry vanishes **auto-demotes to `falsified` and is withdrawn from C4 the same cycle**, with no human step. Promotion runs the other way and requires ratification. Identical in shape to the circuit breaker in Contract C, and for the identical reason: the pressure to widen a threshold arrives at exactly the moment the threshold is telling the truth.

**The rungs that are refused, named so the ceiling stays visible.** `deconfounded_within_tenant` would need explore-arm internal outcome data — which is a `Pattern`, and it stays inside its tenant. `interventional` would need explore allocations stratified on the predicate rather than on rank-uncertainty, trading away the Thompson objective [ADR-0003](adr/0003-exploration-budget.md) chose, for power it would not have at hundreds of posts per year. **Neither is reachable. `contrasted` is the top of this ladder, and it is not a causal claim.**

---

## 1.10 Mechanism Publisher

**Responsibility.** Cut and publish immutable `MechanismLibraryVersion` artefacts. [Contract E](integration-contract.md#contract-e-mechanismlibraryversion-c1--c4).

**Key.** `(vertical, platform)` — for example `beauty.tiktok.m3`. **No tenant axis.** A tenant on this key would mean a tenant's data got in.

**Cut.** An immutable artefact containing every mechanism for the cohort — `conjectured`, `recurrent`, `contrasted`, and `falsified` alike — stamped with `corpus_snapshot_sha256`, the exact corpus the prevalences were counted over. That snapshot is what makes a falsification reproducible rather than an assertion.

**C3 has no role here, and that is not an oversight.** C3 referees numeric predictions against measured outcomes. A mechanism makes no numeric prediction and touches no outcome data, so there is nothing to referee, and a gate that cannot fail for a stated reason teaches people that gates are decorative — which is exactly what the two gates C3 *does* hold cannot afford. C1 publishes a mechanism library on human ratification. It still cannot publish a *pattern* library without C3's verdict, and that is unchanged.

**Publish.** Write the artefact, repoint `active_version`. C4 reads it. Rollback is repointing, never editing: a mechanism falsified in `m4` still resolves under `m3`, because a client who was told something under `m3` must be able to reconstruct what they were told.

---

## What C1 never does

It never calls Component 2, Component 3, or Component 4. It never reads ClientHub's operational tables. It never sets a breaker flag. It never publishes a pattern library without a verdict. It never lets a trend signal into a pattern. It never lets a `Proxy` value into an effect-size calculation, which means the exemplar corpus proposes predicates and anchors retrieval and contributes no number. It never lets an `OutcomeEvent`, a `Pattern`, or anything derived from either into a `Mechanism` — so the mechanism library is tenant-neutral by construction rather than by a scoping check. It never publishes an unratified mechanism statement. And it never lets Tenant A's outcome data inform Tenant B's library, enforced at the repository layer with no widening override, because that boundary needs to be structural rather than a policy someone can be persuaded to relax under commercial pressure.

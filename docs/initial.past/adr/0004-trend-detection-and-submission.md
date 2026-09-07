# ADR-0004: Trend Detection and the Human Submission Loop

**Status:** Accepted
**Date:** 2026-07-09
**Deciders:** Fred
**Related:** [ADR-0001](0001-trend-signal-sourcing.md) · [ADR-0003](0003-exploration-budget.md)
**Supersedes:** REQ-005 and REQ-006 of the PRD, which were underspecified
**Amended by:** [ADR-0006](0006-mechanisms-and-the-warrant-ladder.md), which operationalises "mechanisms compound" — until then a claim with no entity, no evidence standard, and no way to be shown wrong

---

## Context

Trends move daily. The Pattern Library moves quarterly. The original PRD folded both into a single "Pattern Engine" with a `Should`-priority scheduled trend scan bolted on, and that framing hides two problems that only surface once something is built.

**The first is a calibration problem.** If daily trend signal enters the VPS scorer, the scorer's inputs change every night. A temporally held-out split - the only honest evaluation available, per the eval plan - becomes meaningless, because the model that scored period 1 is not the model being evaluated on period 2. The same submission scored on Tuesday and Thursday returns different numbers with no change to the content. Every threshold in the eval plan becomes unfalsifiable, and the circuit breaker in REQ-052 has nothing stable to break on.

**The second is a coverage problem, and it is worse.** The keyless sources available under ADR-0001's Tier 3 - Google Trends RSS, Reddit rising, YouTube RSS with outlier detection, Wikipedia pageviews, Hacker News, news pulse - cover the open web. They do not cover TikTok sounds, TikTok hashtag velocity, or Instagram Reels audio. That is precisely where UGC trends in beauty and FMCG actually live. An automated trend monitor built only on what can be scanned keylessly will confidently report on the wrong platforms and be silent about the right ones.

TikTok Creative Center is public and browsable and is the best surface that exists for this. A person looking at it is a different legal proposition from a crawler harvesting it, and ADR-0001 already declined to build the crawler.

There is a third thing, which is an opportunity rather than a problem. A campaign manager who lives in the feed recognises an emergent format one to two weeks before it produces a volume spike anywhere a scan can detect. That lead time is the highest-value signal in the entire system and no automated source has access to it.

## Decision

**Separate trends from patterns structurally. Automate the open web. Route the closed platforms through a human submission loop that scores its submitters on lead time and accuracy.**

### 1. Trends never touch the score

`TrendSignal` and `Pattern` are distinct entities with distinct consumers, distinct cadences, and no join path into the scorer.

- A **trend** feeds the campaign brief. It is upstream of content creation.
- A **pattern** feeds VPS. It is upstream of content scoring.
- Trend adherence may enter BAS **only** where the brief explicitly specified a format, in which case it is a deterministic check against the brief's stored text, not a live trend lookup.

The one permitted coupling runs the other way: a trend called `rising` with a `go` verdict raises the ingestion priority for exemplars in that format, so the Pattern Engine points its corpus builder at the right place. The Pattern Engine then mines the *mechanism* underneath the format - why the running-late GRWM works is that its hook is a self-deprecating problem statement inside 1.2 seconds - and the mechanism is what survives when the format dies.

Trends are disposable. Mechanisms compound. The trend tells the engine where to look; the pattern tells the scorer what to score.

> **Amendment (ADR-0006, 2026-07-10).** "Mechanisms compound" is now an entity with a schema, a required falsifier, and a warrant ladder — see [`schemas/mechanisms-v1.json`](../schemas/mechanisms-v1.json). It is also falsifiable in the specific sense this ADR demands of everything else: a mechanism reaches the `recurrent` rung only if its predicate appears across **two or more unrelated trends**. A structure observed inside a single trend's posts *is that trend*, wearing a lab coat.
>
> And the coupling asserted in the paragraph above — that trend-directed ingestion points the corpus builder at the right place — is now a gate in the [eval plan](../eval-and-calibration-plan.md) rather than an assumption. If trend-directed ingestion does not produce mechanisms that clear `contrasted` at a higher rate than uniform ingestion does, the coupling is a nice sentence and the ingestion priority should be uniform.
>
> Note the direction of travel, unchanged: a trend still never touches a score. It now also never touches a mechanism's *warrant* — it only decides where the corpus builder looks. `TrendSignal`, `Mechanism`, and `Pattern` are three entities with three cadences (nightly, quarterly, quarterly) and no join path into the scorer.

### 2. Detection is anomaly detection against own baseline

Popularity is a lagging indicator. The detector tracks growth that is anomalous relative to a term's own trailing behaviour, which is the same statistical shape as the outperformance ratio in AWS.

Per tracked term, per source: trailing 28-day median and median absolute deviation of daily volume. Robust z-score `0.6745 · (x − median) / MAD`. A candidate requires `z > 3` sustained across two or more consecutive days, because a single-day spike is a news event and not a trend.

Corroboration by a second independent source upgrades the confidence note. It never upgrades the provenance label. Every keyless read remains `Proxy`, per ADR-0001, without exception.

Lifecycle stage from the velocity and acceleration of a 3-day EMA of the smoothed series: `rising` where velocity is positive and acceleration is non-negative, `peak` where velocity approaches zero with negative acceleration, `declining` where velocity is negative.

### 3. Human submission is a scored prediction, not a suggestion

A submission is a hypothesis with a named author and a committed, falsifiable claim: this trend will be at stage `rising | peak | declining` at T+14 days, with a stated confidence distribution over the three ordered classes.

At T+14 and T+30 the prediction resolves. Where an automated source can observe the trend, the detector resolves it. Where it cannot - TikTok sounds, Reels audio - a **named resolver** records the outcome against Creative Center with evidence and a timestamp, provenance `User-provided`, with a dispute path. This is subjective resolution with an accountable resolver, which is how every prediction market with non-market-observable outcomes works.

Scoring uses a ranked probability score over the ordered classes, shrunk toward a prior so that nobody earns full weight on two lucky calls.

**Credit is proportional to lead time, not merely to accuracy:**

```
lead_days = max(0, corroboration_date − submission_date)
credit    = skill_score × log(1 + lead_days)
```

Submit a trend three days before the automated detector sees it, correctly, and the reward is large. Submit it the day after it appears on every public dashboard and `lead_days = 0`, so the credit is nil. There is no reward for piling on, and the incentive points at exactly the information the automated system does not have.

Two structural guards. Each submitter holds a capped number of concurrently open unresolved positions - default five - so scarcity forces selection rather than spraying. And credit accrues to the submitter's shrunk reputation, which is the weight applied when deciding whether a candidate trend is promoted to actionable.

### 4. The output is a time budget, not a headline

Every actionable trend carries a lifecycle stage and an estimated window, and the verdict is a function of that window against the agency's own brief-to-live lead time.

```
go       iff stage = rising ∧ days_remaining > lead_time × 1.5 ∧ brand_fit ≥ θ ∧ risk < θ
caution  iff stage = peak
skip     iff stage = declining ∨ days_remaining ≤ lead_time × 1.5
```

Until at least twenty trends per platform have resolved and a decay curve can be fitted, `days_remaining` is reported as a band - short (<7d), medium (7-21d), long (>21d) - and never as a number.

### 5. The feed is visible to managers and clients, not creators

If creators can see the trend feed, and trend adherence can enter brief adherence, every creator on a campaign submits the same format. That is the monoculture failure that ADR-0003 exists to prevent, arriving through a different door.

## Consequences

**The trend component and the scoring component can be built, evaluated, and shipped independently.** They share the extraction pipeline and nothing else. A trend feed that nobody trusts does not contaminate a scorer that works, and vice versa. This is worth more than the coupling would have bought.

**Automated coverage will be visibly poor on the platforms that matter most, and this must be stated in the UI rather than hidden.** A trend feed that shows six Reddit trends and no TikTok trends, presented without comment, reads as a claim that nothing is happening on TikTok. The interface has to say that TikTok is human-sourced and how many submissions are open.

**The submission loop only works if submitters actually submit, and they will not do so for a leaderboard.** The reputation score has to attach to something real - who gets consulted on brief direction, who is credited in the quarterly pattern report, whose calls get promoted without a second reviewer. If it is a vanity metric, it decays into a vanity metric within a quarter, and the loop was the whole point.

**Subjective resolution creates a resolver who can be lobbied.** A named resolver with recorded evidence and a dispute path is the mitigation, not a solution. Where a submitter is also the resolver on their own submission, the resolution is void. Rotate resolvers and log the pairing.

**Reputation weights will be noisy for a long time.** Twenty resolved predictions is the point at which a shrunk skill estimate begins to say anything, and a manager submitting one trend a fortnight reaches that in ten months. Until then, weights sit near the prior and submissions are treated as roughly equal. Design the promotion rule so that it degrades to "a human said so, corroborate before acting" rather than to noise-weighted nonsense.

**Sandbagging is handled structurally rather than by policy.** A submitter who only calls trends after they are obvious earns `lead_days = 0` and accumulates no credit, so their weight stays at the prior forever regardless of how many correct calls they log. Accuracy alone buys nothing. This is intentional and it will annoy someone.

**Days-remaining as a band, rather than a number, will be unpopular.** A client wants to hear "eleven days." The honest answer for the first two quarters is "medium," and printing a number that has never been validated against a resolved decay curve is how a trend feed loses credibility permanently the first time it is confidently wrong.

## Alternatives Considered

**Feed trend signal into VPS as a freshness or timeliness criterion.** Rejected. It destroys temporal held-out evaluation, makes the score non-reproducible across days, and means a piece of content's quality assessment changes because of something happening in a Reddit thread. Timeliness is a brief-level decision made before the content exists, not a property of the content.

**Scrape TikTok Creative Center on a schedule.** Rejected on the same grounds as ADR-0001's rejection of closed-platform scraping. The decisive objection is not the terms of service but that the resulting data has unrecordable provenance, and once a scraped number is treated as measured, the provenance discipline that makes the whole system credible has already collapsed.

**Accept human submissions without scoring the submitters.** Rejected. Every submitter's feed is an algorithmic filter bubble, so unweighted submissions aggregate three biased samples and produce something that looks like consensus. Scoring submitters costs one extra table and converts the same submissions into a weighted signal with a known error rate.

**Score submitters on accuracy alone, without the lead-time term.** Rejected. It rewards submitting only what is already obvious, which is exactly the information the automated detector already has. The lead-time term is the entire mechanism by which the human loop earns its existence, and without it the loop is a slower, noisier duplicate of the scan.

**Buy a social listening product with TikTok coverage.** Retained as Tier 4 per ADR-0001, priced per client, and not assumed. It is the correct answer for a large client with the budget. It is the wrong answer as a system-wide dependency, and it would not eliminate the human loop, because a listening product reports volume and the manager reports the format two weeks earlier.

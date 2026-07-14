# ADR-0005: Three Components, and the Referee

**Status:** Accepted
**Date:** 2026-07-09
**Deciders:** Fred
**Related:** [ADR-0002](0002-two-gate-scoring-architecture.md) · [ADR-0003](0003-exploration-budget.md) · [ADR-0004](0004-trend-detection-and-submission.md)
**Amends:** the PRD's framing of this system as two components

---

## Context

The PRD describes two components. A Pattern Engine that learns what good UGC looks like, and a Scoring and Amplification Service that applies that learning. REQ-052 then specifies a circuit breaker: where the rolling rank correlation between predicted VPS and measured outcome falls below threshold for a cohort, VPS degrades automatically to advisory-only and contributes zero weight to AWS.

That requirement has an owner problem, and it is not a small one.

If the circuit breaker lives inside the Scoring Service, then the Scoring Service computes its own scores, computes how well those scores predicted outcomes, and decides whether to keep trusting itself. Every incentive in the system, human and architectural, points at that check never firing. A bug that silently inflates the correlation is a bug nobody is looking for. A well-meaning engineer widens the rolling window during a bad quarter and nobody notices for six months.

If the breaker lives inside the Pattern Engine, the same problem relocates. The Pattern Engine mined the patterns that produced the scores, and asking it whether those patterns earned their use is asking it to grade its own homework.

There is a second, structurally identical problem hiding one layer up. The Pattern Engine publishes library versions. A new library version changes the scorer. A changed scorer invalidates the calibration window, because a rolling correlation computed across a library swap is averaging the performance of two different scorers and calling it one number. So the Pattern Engine has both the ability to publish, and the ability - by publishing - to erase the evidence about whether its previous publication was any good. Left alone, that is a system that can never be shown to have got worse.

The four studied repositories all have this shape. ECHO ships with an honest note that its bands are provisional pending calibration against thirty real audits, and no mechanism by which that calibration would ever be performed by anyone other than the people who wrote ECHO. scrollclaw benchmarked its own scorer and found it wanting, which is admirable and which happened once, by hand, because someone chose to.

## Decision

**Three components. The calibration monitor is a peer, not a subsystem, and it holds two powers that neither of the others may hold.**

**Component 1, the Pattern Engine.** Ingests trend signals, builds the exemplar corpus, assembles the internal labelled corpus from Component 2's event stream, mines patterns, and cuts candidate library versions. It produces beliefs.

**Component 2, the Scoring and Amplification Service.** Runs the compliance gate, scores submissions, issues verdicts, collects performance, ranks amplification candidates, and allocates budget across exploit and explore arms. It acts on beliefs.

**Component 3, the Calibration Monitor.** Consumes scores from Component 2 and outcomes from Component 2, and computes whether the beliefs earned their use. It produces nothing that a user sees. It holds exactly two write authorities:

1. **Sole authority over the breaker flag** per cohort key. Neither Component 1 nor Component 2 can set, clear, or override it. Component 2 reads it and obeys it.
2. **Veto authority over library promotion.** Component 1 may cut a candidate library version at any time. It may not promote that version to `published` without a `LibraryVerdict` from Component 3, issued after the candidate has been shadow-scored against the incumbent and beaten it.

Component 2 never calls Component 1 synchronously. It resolves a pinned, immutable library version and reads it. Component 1 never calls Component 2 at all. It consumes an append-only event stream. The two components that do the visible work communicate through one immutable artefact in one direction and one event log in the other, and the latency between them is measured in weeks, deliberately.

**The Extraction Service is shared infrastructure, owned by neither.** It must produce byte-identical `FeatureRecord`s for an exemplar scraped from the public web and a submission uploaded by a creator, because that symmetry is the only reason a pattern learned from one can be applied to the other. If Component 1 owned it, Component 2 would depend on Component 1 at request time, and the decoupling above would be a diagram rather than a fact.

## Consequences

**Library promotion becomes expensive, and this is correct.** Promoting a library resets the calibration window for every affected cohort, because the scorer changed. Component 3's shadow-scoring requirement means a challenger accumulates its own calibration evidence before promotion, so the reset does not blind the system. But the consequence stands: **promotion cadence is bounded below by the time to accumulate n ≥ 60 outcomes per cohort, not by how often the miner runs.** Mining can run nightly. Publishing cannot run more often than roughly quarterly, and any roadmap assuming a weekly library refresh has not understood what the eval plan requires.

This is the non-obvious constraint that falls straight out of REQ-051 and would otherwise be discovered eighteen months in, at the point where somebody notices that the rolling correlation has been meaningless since the third library swap.

**Champion and challenger both score, only champion surfaces.** During shadow, Component 2 scores every submission twice, against the incumbent library and the candidate. Both scores are stored, both accumulate outcomes, only the incumbent's score reaches a human. Model cost roughly doubles during shadow windows, which per the tech spec's cost section is an increase from negligible to slightly less negligible.

**Component 3 can be wrong, and it will not be the last word on itself.** A referee with no referee is a referee whose thresholds drift. Component 3's own configuration - window length, threshold, cohort keying, held-out split method - is version-controlled, changes are reviewed like code, and every breaker state transition records the config version that produced it. There is no clean way to have a system audit its own auditor, and pretending otherwise would be worse than naming the limitation.

**The compliance gate depends on nothing.** It lives in Component 2, it is deterministic, and it requires no library, no breaker state, and no pattern. It works with Components 1 and 3 dead. That is why Phase 1 ships it alone, and it is the strongest argument for the phasing in the PRD.

**Extractor version bumps become a coordinated, multi-week operation.** Features from different extractor versions are not comparable, so a bump invalidates the corpus, the patterns mined from it, and every stored score's reproducibility. The sequence is: backfill every `FeatureRecord`, re-mine, cut a candidate library, shadow it, promote it. The old extractor stays containerised and runnable indefinitely, because reproducing a historical score is the only defence available when a creator asks why they were scored the way they were. This is an ops constraint that nobody discovers until they need it.

**Three services is more operational surface than two.** Component 3 is small - it consumes two event types, computes a rank correlation, and writes one flag - and it could be a scheduled job with a table rather than a service. That is a deployment decision. What is not negotiable is that its write path is not reachable from either of the other two, and that the flag it writes cannot be overridden by them at read time.

## Alternatives Considered

**Two components, breaker inside Component 2, with a code-review culture and good intentions.** Rejected. Every failure mode here is a slow one, and slow failures are the ones culture does not catch. The breaker fires rarely, the pressure to widen the window arrives at exactly the moment the breaker is telling the truth, and by the time anyone checks, the calibration record is contaminated across a library swap nobody logged.

**Two components, breaker inside Component 1.** Rejected for the same reason with the roles reversed, plus the compounding problem that Component 1 could then publish its way out of an unfavourable calibration reading.

**Let Component 2 query Component 1's live pattern state rather than a pinned version.** Rejected. It makes a score irreproducible - re-run it tomorrow and get a different number - which destroys the audit trail that [compliance-notes.md](../compliance-notes.md) requires and makes any held-out evaluation impossible. It also introduces a synchronous runtime dependency from the component that must never go down onto the component that does batch statistics.

**Have Component 1 own extraction, since it is the one building corpora.** Rejected. Component 2 would then be unable to score a submission while Component 1 was mid-mining-run, and the deployment coupling would eventually be resolved by someone merging them.

**Promote libraries on a fixed calendar rather than on Component 3's verdict.** Rejected. A calendar promotes libraries that are worse than the incumbent, on schedule, forever, and nobody finds out because the calibration window resets on promotion. The verdict gate is what makes the phrase "the system gets better each quarter" a testable claim rather than a marketing sentence.

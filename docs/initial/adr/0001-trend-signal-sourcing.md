# ADR-0001: Trend and Exemplar Signal Sourcing

**Status:** Accepted
**Date:** 2026-07-09
**Deciders:** Fred
**Supersedes:** none

---

## Context

The Pattern Engine needs two things the platforms do not want to give it: a corpus of high-performing public UGC to learn from, and per-post performance data for live campaign content.

Every closed platform that matters here - TikTok, Instagram, LinkedIn - has no compliant keyless read surface for engagement data. This is not an oversight to be worked around. It is a deliberate product decision by each platform, enforced by terms of service, and the tools that promise to work around it (residential-proxy scrapers, unofficial API wrappers) create legal exposure that is entirely disproportionate to the value of the data. aaron-he-zhu's ECHO framework confronts this directly and lands on a discipline rather than a workaround: closed-platform numbers enter as user-exported analytics labelled `Measured` with an as-of date, or as proxy reads from adjacent public sources labelled `Proxy`, and a proxy is never presented as a measurement.

The temptation is to build the scraper, get the data, and label the provenance vaguely. The failure mode is not a takedown notice. It is that six months in, nobody remembers which numbers in the Pattern Library were measured and which were inferred, the effect sizes are contaminated, and the system is confidently wrong in a way that is undetectable from the inside.

There is a second, quieter problem. Even a perfect exemplar corpus of public high-performers is a biased sample: you observe what succeeded, not what was attempted. Patterns mined from winners alone are patterns of survivorship. The internal corpus - every submission ClientHub has ever seen, including the rejected ones and the approved-but-flopped ones - is the only unbiased sample either of these components will ever have access to.

## Decision

**Tier the sources by trust, label every value by provenance, and treat the internal closed-loop corpus as the primary source of truth rather than the supplement.**

Concretely, four tiers:

**Tier 1 - Internal closed loop (primary).** Every submission, verdict, live post, and performance snapshot inside ClientHub. Provenance `Measured` where sourced from an authorised analytics connection or a client-supplied export; `User-provided` where the client typed it in. This is the labelled dataset, it is unbiased with respect to outcome, it includes negative examples, and no competitor has it. It is also small, and it is the only thing that makes the Pattern Library defensible.

**Tier 2 - Client-authorised platform connections.** Where a client grants ClientHub access to their own or a creator's analytics through official channels (Meta Graph API with a business connection, TikTok's official business surfaces, platform-native analytics export), performance data is `Measured`. Availability will differ per client and per creator, and it will be patchy. Design for patchiness rather than assuming coverage.

**Tier 3 - Keyless public sources (trend prior only).** Google Trends RSS, Reddit, Hacker News, YouTube RSS with outlier detection, Wikipedia pageviews, and news pulse via a keyless search connector. These are the sources corey and aaron both build their trend-scout recipes from. They produce a directional read on what is rising, peaking, or declining. Provenance `Proxy` in every case. They inform trend reports and never enter an effect-size calculation.

**Tier 4 - Paid data providers (optional, per-client).** Where a client's budget justifies it and their contract permits, a licensed social-data provider supplies closed-platform metrics under terms. Provenance `Measured`, with the provider named. This is a commercial decision per client, not an architectural assumption.

**Exemplar corpus construction** operates under an explicit, human-reviewed source allowlist. A source enters the allowlist only where its terms permit the access pattern used, and the allowlist is a config artefact under version control, reviewed like code. Where no compliant path exists for a platform, that platform's exemplar corpus is empty, and its Pattern Library is built from Tier 1 alone. That is a slower path to the evidence threshold. It is not a reason to build the scraper.

**Provenance is structural, not documentary.** Every metric column that can hold a non-measured value has a sibling `provenance` column and an `as_of` column, and the query layer refuses to aggregate across mixed provenance without an explicit, logged override. A `Proxy` value cannot be silently averaged with a `Measured` one, because the type system will not let it.

## Consequences

**The Pattern Library will be slow to fill, and some cohorts will never fill.** A `(beauty, TikTok)` cohort with forty campaigns of history will clear the evidence threshold within a quarter or two. A `(fmcg, LinkedIn)` cohort with three campaigns will not, possibly ever. The system must therefore be correct when it has no patterns: it degrades to an unanchored scorer with a maximum-width confidence band and an advisory-only VPS, and it says so. A system that silently produces confident scores from an empty pattern library is worse than one that produces none.

**Gate B's freshness is a per-client property, not a system property.** A client with an authorised platform connection gets a 24-hour amplification read. A client who emails a CSV on Thursday gets a Thursday read. The recommendation must carry its own as-of date and degrade gracefully, and the client-facing artefact must state which it is. Building Gate B on an assumption of uniform 24-hour data would produce a system that only works for the best-instrumented client and quietly lies for everyone else.

**Survivorship bias is mitigated but not eliminated.** Tier 1 gives negative examples within ClientHub's own funnel - content that was rejected, and content that was approved and underperformed. It does not give the content that creators never made because the brief discouraged it. The exploration budget in ADR-0003 is the partial answer to this, and it is only partial. This limitation should be stated in any client-facing description of how the pattern library works, because a client who believes the system has seen everything will over-trust it.

**Cross-tenant aggregation would fix the sample-size problem and is prohibited.** Five beauty clients' internal corpora pooled would clear every evidence threshold five times faster. The multi-tenant boundary in the tech spec forbids it structurally. This costs real predictive power and the cost is accepted, because the alternative is a system whose commercial value depends on a data-use posture no client would agree to if asked plainly.

**Every score this system produces is `Estimated` and will be labelled as such in front of the client.** This reads, at first, like an admission of weakness. It is the opposite. An agency that hands a client a number and a confidence band and the provenance of every input is an agency the client's finance partner can be shown. An agency that hands over a bare number is one whose recommendation gets overridden the first time it disagrees with the client's instinct.

## Alternatives Considered

**Scrape closed platforms directly.** Rejected. Terms-of-service exposure and legal risk out of proportion to the value, and - the more decisive objection - it produces data whose provenance is unrecordable. Once you have decided that a scraped number can be treated as measured, the entire provenance discipline collapses, and with it the credibility of every effect size in the Pattern Library.

**Buy a data provider on day one and skip the tiering.** Rejected as a default, retained as Tier 4. It is the right answer for a specific large client with the budget for it. It is the wrong answer as a system-wide assumption, because it makes the product's viability contingent on a per-seat data cost before the product has demonstrated it works.

**Build the exemplar corpus manually.** Considered seriously. A manager saving links to good posts into a spreadsheet is a real, compliant, low-cost path to a first exemplar corpus, and it is how the first two hundred entries should probably be gathered regardless. The problem is only that it does not scale and it embeds the manager's taste as the ground truth. It is a fine Phase 2 bootstrap and a poor Phase 4 architecture. Fold it in as a manual ingestion path, not as the strategy.

**Skip the exemplar corpus entirely and learn only from internal data.** Tempting, and cleaner. Rejected because the internal corpus is a closed world: it tells you what worked among the things this agency's creators made, and nothing about what is currently landing that this agency has never tried. The exemplar corpus is the prior; the internal corpus is the likelihood. Dropping the prior means the system cannot recognise an emerging format until a creator happens to submit one and it happens to perform.

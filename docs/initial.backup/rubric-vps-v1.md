# Scoring Rubric v1.0

**Applies to:** Gate A (VPS, BAS, compliance vetoes) and Gate B (AWS)
**Machine-readable:** [schemas/rubric-v1.json](schemas/rubric-v1.json)
**Provisional:** these bands are unvalidated until calibrated against ≥60 real posts per cohort. See [eval-and-calibration-plan.md](eval-and-calibration-plan.md). Until then no VPS number is shown to a client.

---

## Lane 1: Compliance Vetoes (deterministic, binary, non-scored)

A veto is not a low score. It is a block. Any veto forces `REJECTED` at Gate A and exclusion at Gate B. All vetoes are computed in application code from extracted features and stored records. The language model may flag a suspected veto for human attention; it can never clear one, and its output is not an input to veto evaluation.

| ID | Name | Trigger | Carve-out |
|---|---|---|---|
| **V1** | Disclosure | No material-connection disclosure detected in on-screen text, caption, or spoken audio within the platform's required prominence. Australian context: ACCC guidance on influencer disclosure; AANA Code of Ethics §2.7. | Content making no endorsement and no product claim requires no disclosure line. |
| **V2** | Claim integrity | A product or offer claim appears in caption, on-screen text, or transcript that is absent from, or contradicts, the campaign's approved claims ledger. | Opinion and experience statements that assert no product property. "I liked it" is not a claim; "clinically proven" is. |
| **V3** | Brand safety | Content or creator triggers a configured brand-safety rule, or the creator carries an active brand-safety flag. | None. This one is absolute by design. |
| **V4** | Rights record | No `RightsGrant` row exists covering the intended use. At Gate A the required grant is `organic_publish`. At Gate B it is `paid_amplification`. | None. Public posting, tagging, and branded-hashtag use never constitute a grant. Organic consent never covers paid use. |
| **V5** | Technical spec | Aspect ratio, duration, resolution, or safe-zone requirements from the brief are not met. | Where the brief specifies no requirement, no check runs. |
| **V6** | Minor creator | Creator record indicates age under 18. | None. Excluded from AI scoring entirely. See [compliance-notes.md](compliance-notes.md). |

V1 and V4 are the two that carry legal weight and the two most often quietly skipped. V1's recall target of ≥0.98 is set in the PRD because a missed disclosure is a regulatory exposure while a false positive costs a manager thirty seconds of review.

---

## Lane 2: Brief Adherence Score (BAS), 0-100

Does this deliver what was actually asked for? This is a separate question from whether it is good, and merging them is how agencies end up approving beautiful content that misses the brief.

| Component | Weight | Evaluation |
|---|---|---|
| Required talking points covered | 0.35 | Deterministic checklist against brief; model assists with semantic matching, code decides coverage |
| Mandatory inclusions present | 0.25 | Product visible, handle tagged, link present, hashtags used - all deterministic |
| Prohibited content absent | 0.20 | Deterministic keyword and competitor-mention check |
| Format specification met | 0.10 | Derived from `FeatureRecord` |
| Tone and register match | 0.10 | Model judgement against brief's voice guidance; the only genuinely subjective component |

`BAS < 60 ⇒ REVISIONS_REQUIRED` at minimum, regardless of VPS. A brilliantly crafted piece that omits the mandated product claim is a brilliantly crafted piece that has to be redone.

---

## Lane 3: Viral Potential Score (VPS), 0-100

Seven criteria, each scored 0-100, combined by weighted arithmetic mean. Weights below are adapted from scrollclaw's own post-hoc correction of its equal-weighted v0, plus one addition.

| # | Criterion | Weight | Audio-dep. | What 90+ looks like | What <50 looks like |
|---|---|---|---|---|---|
| 1 | **Hook strength** | 0.20 | ✱ | Pattern interrupt inside 2s: an unexpected visual paired with a 3-5 word claim that promises a specific payoff | Generic opening frame, talking head, no visual or verbal reason to stop |
| 2 | **Scroll-stop power** | 0.18 | | Visually distinct from the surrounding feed for this vertical; composition or colour that does not read as "another one of those" | Indistinguishable from the last twenty posts in the same category |
| 3 | **Completion likelihood** | 0.18 | ✱ | The hook's promise is paid off; curiosity gap closes; length matches payload | Hook oversells, middle sags, payoff is generic or absent |
| 4 | **Pacing** | 0.14 | | Every second earns the next; cut cadence supports the beat structure; no dead zone | Repetitive, static, viewer has understood everything by 0:04 with 0:35 remaining |
| 5 | **Emotional specificity** | 0.14 | ✱ | A named, particular feeling tied to a concrete situation the target audience recognises as theirs | Vague positive affect that could attach to any product in any category |
| 6 | **Text readability** | 0.10 | | 3-5 words per line, high local contrast, inside platform safe zone, on screen long enough to read at scroll speed | Small, low contrast, occluded by platform UI, or absent where the format needs it |
| 7 | **Authenticity register** | 0.06 | | Believable phone-camera composition, ambient audio, visible friction and hesitation, lived-in setting | Studio lighting, scripted cadence, showroom cleanliness, reads as an ad |
| — | *Shareability* | **0.00** | | *Diagnostic only.* Reported, never weighted. | |

✱ = audio-dependent. When `audio_present = false`, these three are scored from visual evidence only, each is flagged `degraded = true`, and the composite's confidence band widens. The hard gate still applies to a degraded hook score.

**Hard gate.** `hook_strength < 50 ⇒ verdict ≥ REVISIONS_REQUIRED`, regardless of the weighted total. Nothing downstream of the hook matters if the scroll does not stop. A piece scoring 95 on every other criterion and 40 on hook does not get approved on the strength of its ending.

**Why shareability is weight zero.** Not because it does not matter, but because scrollclaw's own benchmark found it uninformative as a predictor and highly prone to model flattery - a language model asked "would someone send this to a friend?" tends to say yes. It is retained as a reported diagnostic because it is occasionally the criterion that explains an outlier, and it costs nothing to compute. It contributes nothing to the decision until calibration data says it should.

**Why the seventh criterion exists.** Criteria 1-6 are, in aggregate, a production-quality scorer. A production-quality scorer will systematically rate a well-lit, tightly-edited brand-produced video above a handheld phone clip from a nano creator with a messy bedroom behind her, and on TikTok in the beauty vertical the second one outperforms the first. Authenticity register at weight 0.06 is a deliberate, small, explicit counterweight, and the fairness audit in the eval plan exists to check whether 0.06 is enough. Expect to raise it.

**Composition.** Arithmetic weighted mean, floor-rounded, clamped 0-100. Arithmetic rather than geometric because craft criteria are compensatory within a single piece of content - strong on-screen text can partly carry a middling emotional read. The one non-compensatory criterion is hook, and it is handled by the hard gate rather than by punishing the rollup.

### Thresholds

| Weighted VPS | Signal |
|---|---|
| 80-100 | Strong. Amplification prior is high. |
| 70-79 | Solid. Approve. |
| 60-69 | Fix the single lowest-scoring criterion and re-score. Do not ship as-is. |
| < 60 | Regenerate. Do not polish a weak concept. |

These thresholds inform the manager. They do not determine the verdict on their own - only the hard gate and the vetoes do that, because a threshold on an uncalibrated score is a guess with a decimal point.

### Revision note requirements

A revision note that says "strengthen the hook" fails acceptance. Every generated note must be:

- **Specific** — name the change, not the goal
- **Time-coded** — reference the timestamp where the change applies
- **Exemplified** — include example copy, or a described visual, or a named edit
- **Bounded** — implementable in under two hours by the creator

Bad: *"The opening needs more impact."*
Good: *"0:00-0:02 opens on a wide shot of the bathroom. Cut straight to the close-up currently at 0:06, and overlay 'my dermatologist told me to stop' in 4 words across the upper third. The line you say at 0:11 is your real hook - move it to the top."*

The system also emits an **estimated VPS if the note is applied**, as a stated `Estimated` value. This gives the creator a reason to do the work and the manager a way to judge whether the revision is worth the turnaround.

---

## Gate B: Amplification Worthiness Score (AWS), 0-100

Computed at T+24h and refreshed at T+48h. Only for live posts. Never pre-publication.

**Hard gates. Any failure means exclusion from the recommendation, not a reduced score:**

- Unexpired `paid_amplification` RightsGrant with evidence on file
- Disclosure verified present on the *live* post, re-checked (a submission can be compliant and the published post not be)
- No active brand-safety flag on the creator
- Performance provenance is `measured` or `user_provided`. Proxy-only data yields `insufficient_evidence`, and the candidate is listed as unrankable with the reason shown.

**Score:**

```
AWS = 0.45 · OutperformancePercentile
    + 0.20 · CohortPercentile
    + 0.15 · VPS_normalised
    + 0.10 · CreatorStanding
    + 0.10 · AudienceOverlapFit
```

| Term | Definition |
|---|---|
| `OutperformancePercentile` | Percentile rank, within the campaign cohort, of `post_er_24h ÷ creator.median_er_24h`. Undefined where `trailing_posts_n < 8`. |
| `CohortPercentile` | Percentile rank of raw `post_er_24h` within the campaign cohort. |
| `VPS_normalised` | The Gate A VPS, rescaled 0-1. Zero weight if the cohort's calibration circuit breaker has tripped. |
| `CreatorStanding` | C³ ACE score for the creator, veto-capped. A creator failing an ACE veto is already excluded by the brand-safety gate. |
| `AudienceOverlapFit` | Overlap between creator's audience and the campaign's target segment. `Estimated` unless a platform export supplies it. |

**Denominator discipline.** Every engagement rate names its denominator (`reach`, `impressions`, or `followers`) and that denominator is stable across the comparison period. Two posts whose rates were computed against different denominators are not compared. A baseline whose denominator changed mid-window is invalidated and recomputed, not silently carried.

**Medians, not means.** `creator.median_er_24h` uses median and median-absolute-deviation. Engagement rates are heavy-tailed. One prior viral post in a creator's trailing window would drag a mean baseline high enough to make every subsequent post look like an underperformer, which is precisely backwards.

**Why 0.45 on outperformance.** This is the correction to how the decision is made today. Ranking by raw engagement ranks by follower count. The ratio identifies the creator who beat their own ceiling - the signal that the content, not the audience size, did the work. `CohortPercentile` at 0.20 remains, because a nano creator's 4x outperformance on 900 views should not outrank a mid-tier creator's 1.6x on 240,000 views. The two together encode "meaningfully better than expected, at meaningful scale."

**Why VPS is only 0.15.** Because at Gate B you have a measured outcome and craft is merely what you guessed beforehand. VPS earns its 0.15 as a tiebreaker between posts with similar measured performance, and as the cold-start prior in the first hours before a 24h read exists. If the calibration circuit breaker has tripped for this cohort, VPS contributes zero and the weight redistributes to the two measured terms. A prediction that has not demonstrated skill contributes nothing to a spending decision.

**Confidence.** Every AWS carries a band. `insufficient_baseline` widens it. `audio_degraded` on the underlying VPS widens it. Proxy provenance excludes the candidate outright. Where the band on rank 1 overlaps the band on rank 4, the recommendation says so rather than presenting a false ordering.

### Budget allocation

```
exploit_budget = (1 - ε) · total
explore_budget = ε · total          -- see ADR-0003, default ε = 0.18
```

Exploit budget is allocated proportional to `(AWS - AWS_floor)` across the top-n eligible candidates. Explore budget is allocated per the sampling policy in ADR-0003. Every allocation carries `arm ∈ {exploit, explore}`, and that tag persists into performance tracking so that explore-arm outcomes can enter pattern mining unbiased.

Allocations round to the platform's minimum spend increment. Residual lands on the top exploit candidate, so the total sums exactly to the stated budget.

---

## Provenance labelling

Every number surfaced anywhere in this system carries one of four labels, with an as-of date:

| Label | Meaning |
|---|---|
| `Measured` | Read from a first-party analytics surface or computed from one |
| `User-provided` | Supplied by the client or creator; trusted but unverified |
| `Estimated` | Derived, modelled, or projected. Includes every VPS, every AWS, and every effect size. |
| `Proxy` | Read from an adjacent public source standing in for an unavailable measurement |

A `Proxy` value is never displayed, aggregated, or compared as though it were `Measured`. This is inherited directly from ECHO's `O1` red line and it is the single discipline that keeps this system honest when a client asks where a number came from. Every score this system produces is `Estimated`. Saying so out loud, in the client-facing artefact, is what makes the recommendation credible rather than what undermines it.

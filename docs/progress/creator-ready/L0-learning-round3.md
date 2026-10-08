# L0 learning-honesty review — round 3 (owner-authorised scoped re-review, 2026-10-03)

Reviewer: `respin-learning-reviewer`, one run, scoped to `L0-card.md` §5 (sha `7327d23fcff4`), plan sha `2496a963cb8c`, round-2 report sha `c4aeb052eae9`, code HEAD `3533dbf` (no `respin/` diff). Authorised by the owner on 2026-10-03 (Research Inputs page: "authorise the single scoped N1 review").

**Verdict: NEEDS CHANGES · Almost · Grade C.** 0 BLOCK, 1 CHANGE rated High, 5 CHANGE Medium, 2 LOW, 2 NOTE. **N1 is NOT CLOSED as a class.** Third instance of the H1/N1 class; the same-finding recurrence rule applies.

## Diagnosis (reviewer's words, condensed)

Each fix enumerated more forbidden acts (no voiding, no look k, no release before close). None defined the admitting look as a sealed object: (1) who handles per-brief content, as an explicit list; (2) what identity the look must keep, checked on every output; (3) when it starts and closes; (4) what demotes it to a diagnostic. This is Respin non-negotiable 7 (a population is a list, not a producer) applied to people and channels.

## Findings

- **High — a first look can be tuned on its own holdout's per-brief results and still admit** (`L0-card.md:338,356,377,304,412`). (1) Only the research owner is bound as holder and only "implementers of L1–L3 and correction-batch builders" are barred; the operator, participating creators, rater and deployment/DB administrator all see per-brief content during the look, and none must be separate from L1–L3 implementation or its director; the research owner need not be independent; the withheld population is a parenthetical that omits candidate outputs, scores, errors and refusals. (2) The candidate's frozen identity (`:356`) has no consequence: an output whose observed identity differs does not demote the look; context identity (`:367`) is checked only across arms. Failure: brief 4 refused → operator who directs L1 patches a check or config, or edits C2's interview inputs for both arms → briefs 5–20 pass → 16/20 admits. Fix: (a) list every role with per-brief access, each different from any L1–L3 implementer/director/tuner and from the product/launch owner until close; explicit withheld population; (b) lock deployment/config/model id for the look; any drift demotes the whole look; (c) pre-recorded per-creator brain-document sha256, every profile asserted equal to it.
- **Medium — "look", "exposure", "closed" undefined; baseline-arm exposure inconsistent** (`:304,338,376,412`). Interleaved baseline-first runs either expose half of every set (nothing could admit) or are silently exempt; an aborted candidate run could be re-labelled "not a look". Fix: exposure = first run of either arm on any brief of the set, or per-brief content leaving the holder list; admitting look = the single look containing first exposure, both arms; closes when judging and arm-key reveal are recorded; a candidate run stopped or aborted for any reason ends it as not passed.
- **Medium — retest may reuse creators whose LR1 rows were released for tuning** (`:305,338`). `:305` weakens plan `:168` to "fresh or untrained" with "untrained" undefined. Fix: never release holdout per-brief rows to L1–L3 implementers; define untrained; require fresh participants and fresh tasks.
- **Medium — an interested party can be a sole C judge** (`:316,396`). Fix: participant eligibility rule excluding the launch owner, L1–L3 implementers/directors, research owner, operator, rater and their affiliates; distinct person per account verified.
- **Medium — N2 "identical context" unreachable through the sanctioned path** (`:363,367`). Voice build returns 1–5 items per list (`respin/packages/credits/src/infer-voice.ts:77-88`); the brain editor cannot remove array elements (`respin/packages/db/src/brain-ops.ts:799-800,828-834`). Fix: reference Voice lists hold exactly 5 items, or a bounded setup retry on the setup budget before exposure; a setup that cannot match is redone, not counted as an isolation failure.
- **Medium — provider-call cap arithmetic wrong at HEAD** (`:428`). A generation makes up to three calls (draft, rewrite, creator-rule scoring; `respin/packages/credits/src/generate.ts:14-15,449-452,934-948`). Fix: 80 × 3 + 80 = 320; re-check the USD cap; candidate bound from its frozen identity.
- **Low — immutables omit caps, stop rule and judge instructions** (`:306,429-430`).
- **Low — per-creator floor denominator ambiguous** (`:410` vs `:419-420`): "strictly more than half of the creator's frozen briefs (3 of 4), withdrawn counted not acceptable".
- **Note** — development briefs come from the same accounts; results generalise to new briefs from known creators, not to new creators.
- **Note** — `MIN_COMPARABLE_RESULTS` is defined at `respin/packages/brain/src/comparison.ts:36`; `proposal.ts:355` is a correct use-site citation.

## Paths (a)–(e)

| Path | Status |
|---|---|
| (a) admission on a non-first look | open (undefined look; abort/restart) |
| (b) per-brief content reaches tuners before close | open (unbound roles) |
| (c) set altered after first exposure | ID list/hashes closed; effective context can drift (High fix c) |
| (d) rubric/threshold change on an exposed set | closed for the manifest; caps/stop rule/judge instructions not covered (Low) |
| (e) released or failed result reported as a pass | closed |

## Round-2 fix closure

N2 partly closed; N3, N4, N5, N6, L1, L2, L4 closed; L3 closed across arms only.

## Code facts verified at `3533dbf`

`proposal.ts:355`; `seed.ts:78` (`studio: 5`); `interview-ops.ts:516` `submitInterview` (deterministic, no model call); `assemble.ts:408,412,459`; `modes.ts:261`; `brain-ops.ts:933` `editBrainDocument`; `generations.brain_activation_id` (`generation-schema.ts:435`). Hashes of card, round 2 and plan unchanged before and after the review.

# Phase 10a — the pre-registered Sample Spin evaluation set

**Status: REGISTERED, NOT RUN.** This file was written before the orchestrator was ever run against a vendor, on the build-plan M3 precedent of ten real generations. Running it needs a real Anthropic key, a deployment with `RESPIN_PUBLIC_SAMPLE_SPIN=preview` and the bucket key set, and the product owner's yes/no verdicts. Until the table below carries ten rows of recorded outcomes, nothing here is evidence of anything; the engineering it evaluates is complete (`packages/credits/src/sample-spin/`), the evaluation is not.

## What it demonstrates, and what it cannot

Sampled transformation and usability of ONE fictional brain against ONE synthetic reference — never performance, uplift, learning, or the PRD pilot metric (R-115, R-116). Refusals stay in the denominator. Exact n is reported; a run is reported as a run whether it was accepted or refused.

## The population (checked in as `SAMPLE_SPIN_EVALUATION_SET`)

Five creator-intent classes, two ideas each, all compatible with the chair-restorer fixture (`sample-fixture-v1`). `expectedRelation` says how each idea sits against the reference reel (the spindle that would not stay glued): an idea that shares the reference's subject must be rewritten away from it or refused — never accepted with the subject intact.

| id | intent | idea | expected relation |
|---|---|---|---|
| story-1 | story | The rocking chair my neighbour was about to put on the kerb, and the one joint that was actually wrong with it. | distinct subject |
| story-2 | story | The first chair I ever repaired came back to me a year later, broken in exactly the place I fixed. | distinct subject |
| lesson-1 | lesson | How to tell a hide glue joint from a modern glue joint before you take a chair apart. | distinct subject |
| lesson-2 | lesson | Why a loose spindle keeps coming out after you glue it, and what fit has to do with it. | **shares the reference subject** |
| opinion-1 | opinion | Most chairs that get thrown out did not need replacing; they needed one afternoon and the right glue. | distinct subject |
| opinion-2 | opinion | A screw through a wobbly joint is the worst repair you can make, and everyone does it. | distinct subject |
| process-1 | process | Re-seating a worn tenon in a worn socket, start to finish, one joint. | **shares the reference subject** |
| process-2 | process | Taking a card scraper to a seat someone sanded through the finish, without sanding again. | distinct subject |
| announcement-1 | announcement | I am filming one repair a week this winter, one joint each, failure first. | distinct subject |
| announcement-2 | announcement | The workshop is taking in six chairs for a repair series and here is the kind I am looking for. | distinct subject |

## The rubric (product owner, yes/no per accepted run)

1. Voice specificity: does it read like the sample brain and not like any chat model?
2. Filmability: could the creator shoot every shot line without inventing a prop?
3. Transformation: is it clear how the reference mechanism was adapted rather than copied?
4. Rule highlighting: do the highlighted rules match what the draft actually does?

Assessor: the product owner (named on the run). A refused run has no rubric row; it is counted.

## What every run records

| field | source |
|---|---|
| accepted / refused, and the refusal reason | the response |
| model ids (generation, classification) | the response's `versions.model`, the active config |
| config version | `versions.configVersion` |
| prompt bundle version | `versions.promptBundle` |
| fixture version | `versions.fixture` (`sample-fixture-v1`) |
| deterministic gate outcomes | the run's kill-test findings, the similarity result (subject / hook / structure), rewritten or not |
| the money fact | the `system_model_usage` row: call count, tokens, measured cost |
| the rubric | four yes/no answers, or "refused" |

## Results

Not run. Ten rows go here, one per idea, with the fields above. Report exact n (10), accepted count, refused count, and the failures by rubric line. No percentage is a claim about anything beyond these ten runs.

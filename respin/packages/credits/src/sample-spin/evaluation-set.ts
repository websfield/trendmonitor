// Phase 10a plan C2: the PRE-REGISTERED ten-idea evaluation set.
//
// Registered before the orchestrator was run against a vendor, on the M3
// precedent of ten real generations. Five creator-intent classes, two ideas
// each, every one compatible with the single fictional chair-restorer brain.
// `expectedRelation` says how each idea should relate to the reference reel
// (the spindle that would not stay glued): the gate must still refuse a copy,
// so an idea that shares the reference's subject is expected to be rewritten
// away from it or refused, never accepted with the subject intact.
//
// What a run records (docs/progress/respin-finish/10a-sample-spin-evaluation.md):
// accepted/refused, model ids, config version, prompt bundle version, fixture
// version, every deterministic gate outcome, and the product owner's yes/no
// rubric per accepted run. Refusals stay in the denominator. This demonstrates
// sampled transformation and usability — never performance, uplift, learning
// or the PRD pilot metric.
export type SampleSpinIntentClass = "story" | "lesson" | "opinion" | "process" | "announcement";

export type SampleSpinEvaluationIdea = Readonly<{
  id: string;
  intent: SampleSpinIntentClass;
  idea: string;
  /** How the idea sits against the fixture reference; what the gate must do with it. */
  expectedRelation: "distinct_subject" | "shares_reference_subject";
}>;

export const SAMPLE_SPIN_EVALUATION_RUBRIC = [
  "voice specificity: does it read like the sample brain and not like any chat model?",
  "filmability: could the creator shoot every shot line without inventing a prop?",
  "transformation: is it clear how the reference mechanism was adapted rather than copied?",
  "rule highlighting: do the highlighted rules match what the draft actually does?",
] as const;

export const SAMPLE_SPIN_EVALUATION_SET: readonly SampleSpinEvaluationIdea[] = Object.freeze([
  { id: "story-1", intent: "story", idea: "The rocking chair my neighbour was about to put on the kerb, and the one joint that was actually wrong with it.", expectedRelation: "distinct_subject" },
  { id: "story-2", intent: "story", idea: "The first chair I ever repaired came back to me a year later, broken in exactly the place I fixed.", expectedRelation: "distinct_subject" },
  { id: "lesson-1", intent: "lesson", idea: "How to tell a hide glue joint from a modern glue joint before you take a chair apart.", expectedRelation: "distinct_subject" },
  { id: "lesson-2", intent: "lesson", idea: "Why a loose spindle keeps coming out after you glue it, and what fit has to do with it.", expectedRelation: "shares_reference_subject" },
  { id: "opinion-1", intent: "opinion", idea: "Most chairs that get thrown out did not need replacing; they needed one afternoon and the right glue.", expectedRelation: "distinct_subject" },
  { id: "opinion-2", intent: "opinion", idea: "A screw through a wobbly joint is the worst repair you can make, and everyone does it.", expectedRelation: "distinct_subject" },
  { id: "process-1", intent: "process", idea: "Re-seating a worn tenon in a worn socket, start to finish, one joint.", expectedRelation: "shares_reference_subject" },
  { id: "process-2", intent: "process", idea: "Taking a card scraper to a seat someone sanded through the finish, without sanding again.", expectedRelation: "distinct_subject" },
  { id: "announcement-1", intent: "announcement", idea: "I am filming one repair a week this winter, one joint each, failure first.", expectedRelation: "distinct_subject" },
  { id: "announcement-2", intent: "announcement", idea: "The workshop is taking in six chairs for a repair series and here is the kind I am looking for.", expectedRelation: "distinct_subject" },
]);

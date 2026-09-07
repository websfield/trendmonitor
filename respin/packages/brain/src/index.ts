// @respin/brain — the learning loop's construction site.
//
// THE CHARTER, AND ITS DEVIATION FROM R-44, STATED RATHER THAN ABSORBED.
// R-44 says this package is created "for proposal construction only". Slice
// 9a creates it holding the COHORT AND COMPARISON BUILDER instead, because:
//
//   - The finish plan's own rule is that no package ships without a caller in
//     the same slice. A `@respin/brain` holding proposals nobody constructs in
//     9a is inventory.
//   - Phase-9 R10 requires ONE typed cohort builder shared by result and
//     feedback proposal construction. Putting it in `@respin/db` for 9a and
//     moving it in 9b is the churn R-44 itself argues against.
//   - R-44's stated trigger is untouched: it inverts on "any second writer of
//     brain-document CONTENT outside `@respin/db`". 9a writes no brain
//     content — no `writeBrainDoc`, no confirmation, no activation. Storage
//     stays exactly where it is.
//
// So the charter reads "cohort construction and proposal construction", and
// that widening gets its own `decisions.md` entry at the 9a close.
//
// WHAT IS DELIBERATELY ABSENT IN 9A (C6): no proposal construction, no brain
// write of any kind, no `performance_meta` content schema, no
// `result_summary` input class. 9b adds them.
//
// THIS PACKAGE IS DENIED TO `app/**` BY DEFAULT, like every package before it
// (the negation catch-all in `eslint.config.mjs`, fixtured in
// `tests/import-boundary.test.ts`). The reason is not that a median is
// dangerous: it is that `buildLeverComparisons` trusts its caller to have
// scoped the rows, and the code that fetches through `withWorkspace` and the
// code that compares should not be separated by a package boundary a screen
// can reach across.
export {
  MIN_COMPARABLE_RESULTS,
  ComparisonInputError,
  buildLeverComparisons,
  buildComparisonGroups,
  metricDeclarationKey,
  type ComparisonGroup,
  type DeclaredMetric,
  type ComparisonStratum,
  type Improvement,
  type LeverComparison,
  type Population,
} from "./comparison";
export {
  buildFeedbackProposalDraft,
  buildResultProposalDraft,
  isPromotionProposalDraft,
  ProposalInputError,
  type EvidenceStrength,
  type FeedbackEvidenceInput,
  type FeedbackProposalDraft,
  type FeedbackProposalInput,
  type FeedbackReaction,
  type PerformanceRule,
  type PromotionProposalDraft,
  type PromotionSource,
  type PromotionTarget,
  type ResultEvidenceInput,
  type ResultProposalDraft,
  type ResultProposalInput,
} from "./proposal";
export type {
  AudienceClass,
  ComparisonResultInput,
  ConfounderCode,
  EvidenceState,
  Lever,
  MetricDirection,
} from "./vocabulary";

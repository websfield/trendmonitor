// THE ONE PROJECTION of a promotion review onto the browser transport
// (audit Phase 2, P2-A5, and its gate). `promotion-state.ts` keeps the shape
// the client panel receives "rather than importing a database type"; returning
// the DB object whole bypassed it, so every column of the proposal row and of
// every evidence row crossed to the browser. This builds the transport from
// NAMED FIELDS ONLY, and both producers use it: `reviewPromotionAction` and
// the `/results` page load, which hands its reviews to the same client panel.
// `tests/results-log-action.test.tsx` and `tests/results-page-wiring.test.tsx`
// each serialise what crosses with a planted DB-only sentinel and assert it is
// absent.
import type { respinDb } from "@respin/db";
import type { PromotionReview } from "./promotion-state";

type DbReview = Awaited<ReturnType<typeof respinDb.promotionProposalReview>>;

export function projectPromotionReview(review: DbReview): PromotionReview {
  return {
    proposal: {
      id: review.proposal.id,
      source: review.proposal.source,
      status: review.proposal.status,
      strength: review.proposal.strength,
      payload: review.proposal.payload,
    },
    resultEvidence: review.resultEvidence.map((row) => ({ id: row.id, role: row.role })),
    feedbackEvidence: review.feedbackEvidence.map((row) => ({
      feedbackId: row.feedbackId,
      generationId: row.generationId,
    })),
    learningEligibility: review.learningEligibility,
    mergedContent: review.mergedContent,
    claims: review.claims.map((claim) => ({
      pointer: claim.pointer,
      displayedValue: claim.displayedValue,
      sourceEvidence:
        "quote" in claim.sourceEvidence
          ? { quote: claim.sourceEvidence.quote, inputClass: claim.sourceEvidence.inputClass }
          : { absence: claim.sourceEvidence.absence },
    })),
    freshnessToken: review.freshnessToken,
    alreadyPresent: review.alreadyPresent,
  };
}

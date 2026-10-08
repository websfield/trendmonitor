// This module is imported by the client-side proposal panel. Keep the review
// transport shape here rather than importing a database type: it is the
// serializable data the panel renders, and it keeps the browser graph wholly
// independent of package/server modules.
export type PromotionReview = {
  proposal: {
    id: string;
    source: "results" | "feedback";
    status: "proposed" | "accepted" | "rejected" | "superseded" | "stale";
    strength: "early" | "repeated" | "corroborated";
    payload: unknown;
  };
  resultEvidence: readonly { id: string; role: string }[];
  feedbackEvidence: readonly { feedbackId: string; generationId: string }[];
  /**
   * Derived server-side from the JOINED evidence rows and both population
   * sizes (R-115) — the reading the panel renders; the stored strength enum
   * is history and is never the source of a sentence here.
   */
  learningEligibility:
    | { kind: "verified_results"; treatmentN: number; baselineN: number }
    | { kind: "legacy_unverified" }
    | { kind: "structured_feedback"; occurrences: number };
  mergedContent: unknown;
  claims: readonly {
    pointer: string;
    displayedValue: unknown;
    sourceEvidence: { quote?: string; inputClass?: string | null; absence?: string };
  }[];
  freshnessToken: string;
  /**
   * The value is already in the document it would change (R-171): accepting
   * records the decision and writes no new version.
   */
  alreadyPresent: boolean;
};

/** Wire names shared by the proposal forms and their server actions. */
export const PROMOTION_FIELD = {
  proposalId: "proposalId",
  decision: "decision",
  freshnessToken: "freshnessToken",
  acceptConfirmedFields: "acceptConfirmedFields",
  rejectConfirmedFields: "rejectConfirmedFields",
} as const;

export type PromotionActionState =
  | { status: "idle" }
  | { status: "refreshed"; count: number }
  | { status: "reviewed"; review: PromotionReview }
  | { status: "decided"; decision: "accepted" | "rejected"; alreadyPresent: boolean }
  | { status: "refused"; code: string; copy: { title: string; detail: string } };

export const IDLE_PROMOTION_ACTION_STATE: PromotionActionState = { status: "idle" };

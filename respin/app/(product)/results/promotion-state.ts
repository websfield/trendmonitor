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
  mergedContent: unknown;
  claims: readonly {
    pointer: string;
    displayedValue: unknown;
    sourceEvidence: { quote?: string; inputClass?: string | null; absence?: string };
  }[];
  freshnessToken: string;
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
  | { status: "decided"; decision: "accepted" | "rejected" }
  | { status: "refused"; code: string; copy: { title: string; detail: string } };

export const IDLE_PROMOTION_ACTION_STATE: PromotionActionState = { status: "idle" };

export type CandidateSafetyState =
  | { status: "idle" }
  | { status: "safe" }
  | { status: "choose_profile" }
  | { status: "error" }
  | {
      status: "refused";
      reason: "reference_echo" | "reference_quote_budget";
      referenceInputId: string | null;
      field: string;
      matchedSpan: string;
      matchedSpanTruncated: boolean;
    };

export const INITIAL_CANDIDATE_SAFETY_STATE: CandidateSafetyState = {
  status: "idle",
};

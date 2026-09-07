/** In-place state returned only for an actionable reference-echo match. */
export type BrainEditRefusalState = {
  kind: "reference_echo";
  pointer: string;
  referenceInputId: string;
  matchedSpan: string;
  matchedSpanTruncated: boolean;
};

export type BrainEditAction = (
  previousState: BrainEditRefusalState | null,
  formData: FormData
) => Promise<BrainEditRefusalState | null>;

// GENERATED FILE — do not edit. Source: docs/initial.past/schemas/*.json
// Regenerate with `npm run gen:types`. Widening a type here by hand is a contract breach.

/** rubric-v1.json provenance_labels. Every VPS and AWS value is labelled Estimated. */
export type ProvenanceLabel =
  | "Measured"
  | "User-provided"
  | "Estimated"
  | "Proxy";

/** rubric-v1.json vetoes[].id */
export type VetoId =
  | "V1"
  | "V2"
  | "V3"
  | "V4"
  | "V5"
  | "V6";

/** rubric-v1.json vps.criteria[].key */
export type VpsCriterionKey =
  | "hook_strength"
  | "scroll_stop_power"
  | "completion_likelihood"
  | "pacing"
  | "emotional_specificity"
  | "text_readability"
  | "authenticity_register"
  | "shareability";

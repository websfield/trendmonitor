// GENERATED FILE — do not edit. Source: docs/initial.past/schemas/*.json
// Regenerate with `npm run gen:types`. Widening a type here by hand is a contract breach.

/** events-v1.json contract C. Only `armed` surfaces a VPS number. */
export type BreakerState =
  | "armed"
  | "tripped"
  | "cold"
  | "shadow";

/** events-v1.json VerdictIssued.verdict */
export type VerdictValue =
  | "APPROVED"
  | "APPROVED_WITH_NOTES"
  | "REVISIONS_REQUIRED"
  | "REJECTED"
  | "NEEDS_REVIEW"
  | "EXCLUDED_FROM_AI_SCORING";

/** events-v1.json envelope.event_type */
export type OutcomeEventType =
  | "SubmissionScored"
  | "VerdictIssued"
  | "VerdictOverridden"
  | "PostPublished"
  | "PerformanceSnapshot"
  | "AmplificationAllocated"
  | "AmplificationSignedOff"
  | "RightsGrantChanged";

export interface SubmissionScored {
  submission_id: string;
  feature_record_id: string;
  cohort_key: Record<string, unknown>;
  version_triple: Record<string, unknown>;
  breaker_state_at_score: "armed" | "tripped" | "cold" | "shadow";
  shadow_scores?: Record<string, unknown>[];
  vps: number;
  bas: number;
  criteria?: { [k: string]: {
    score: number;
    degraded: boolean;
    evidence?: string;
  } };
  retrieved_pattern_ids?: string[];
  audio_present?: boolean;
  anomalous?: boolean;
  provenance?: "Estimated";
}

export interface VerdictIssued {
  submission_id: unknown;
  verdict: "APPROVED" | "APPROVED_WITH_NOTES" | "REVISIONS_REQUIRED" | "REJECTED" | "NEEDS_REVIEW" | "EXCLUDED_FROM_AI_SCORING";
  vetoes_fired: ("V1" | "V2" | "V3" | "V4" | "V5" | "V6")[];
  suspected_vetoes?: unknown[];
  hook_gate_fired?: boolean;
  decided_by: "deterministic_verdict_engine";
  human_approved_at?: string | null;
}

export interface PerformanceSnapshot {
  live_post_id: unknown;
  horizon: "t24h" | "t48h" | "t7d";
  engagement_rate: number;
  denominator: "reach" | "impressions" | "followers";
  series: "organic" | "boosted";
  arm?: "exploit" | "explore" | null;
  provenance: "Measured" | "User-provided" | "Proxy";
  as_of: string;
  outperformance_ratio?: number | null;
  insufficient_baseline?: boolean;
}

export interface AmplificationAllocated {
  live_post_id: unknown;
  arm: "exploit" | "explore";
  spend: number;
  aws: number;
  aws_terms?: Record<string, unknown>;
  epsilon: number;
  rng_seed: number;
  sampler_version: string;
  sampling_policy?: "proportional_exploit" | "thompson" | "uniform_random_no_baseline";
  confidence_band?: number[];
  rationale: string;
}

export interface AmplificationSignedOff {
  allocation_id: unknown;
  reviewer_id: unknown;
  signed_off_at: unknown;
  modifications?: unknown[];
}

export interface RightsGrantChanged {
  submission_id: unknown;
  grant_type: "organic_publish" | "paid_amplification" | "website_reuse" | "email_reuse" | "perpetuity";
  change: "created" | "expired" | "revoked";
  evidence_uri: string;
}

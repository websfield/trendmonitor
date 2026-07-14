// View-model / response-envelope types.
//
// These are NOT contract types. They are thin composites and API envelopes that
// the schemas do not themselves define (e.g. the C4 `coverage` object lives in
// component-4-knowledge-api.md §4.4, not in mechanisms-v1.json). Every field here
// either references a generated contract type or mirrors a documented response
// shape verbatim. Nothing here widens a generated type.
import type { BreakerState, VerdictValue } from './generated/events';
import type { ProvenanceLabel } from './generated/rubric';
import type { Mechanism } from './generated/mechanisms';

// ---------------------------------------------------------------------------
// Provenance — every rendered number carries this. Rubric rule.
// ---------------------------------------------------------------------------
export interface Provenanced<T = number> {
  value: T;
  provenance: ProvenanceLabel; // VPS/AWS are always 'Estimated'
  as_of: string; // ISO date. Never rendered without it.
}

// ---------------------------------------------------------------------------
// Triage queue (REQ-019). Priority bands: risks first, then borderline, then clear.
// ---------------------------------------------------------------------------
export type TriageBand = 'compliance_risk' | 'borderline' | 'clear_pass';

export interface TriageItem {
  submission_id: string;
  creator_handle: string;
  band: TriageBand;
  /** Plain-language reason this item sits where it does. Never empty. */
  risk_reason: string;
  verdict: VerdictValue;
  /** Vetoes actually fired (deterministic). */
  vetoes_fired: string[];
  /** Model-raised only. NEVER acted on. Rendered as a flag for a human. */
  suspected_vetoes: string[];
  /** True when the confidence band straddles a decision threshold. */
  band_straddles_threshold: boolean;
}

// Empty-state discrimination: "no submissions at all" must not look like
// "everything was filtered out".
export type QueueEmptyReason = 'no_submissions' | 'all_filtered_out';

// ---------------------------------------------------------------------------
// Verdict panel (P9-T3)
// ---------------------------------------------------------------------------
export interface VetoEvidence {
  veto_id: string;
  name: string;
  /** The stored record the deterministic engine fired on. Never model prose. */
  evidence: string;
}

export interface SuspectedVeto {
  veto_id: string;
  name: string;
  /** Model-drafted rationale. Surfaced to a human, never read by veto computation. */
  model_note: string;
}

export interface VpsCriterionView {
  key: string;
  score: number;
  degraded: boolean;
  /** audio_dependent criteria are degraded when audio_present == false. */
  audio_dependent: boolean;
  evidence?: string;
}

export interface SubmissionDetail {
  submission_id: string;
  creator_handle: string;
  cohort_key: CohortKey;
  breaker_state: BreakerState;
  verdict: VerdictValue;
  vetoes: VetoEvidence[];
  suspected_vetoes: SuspectedVeto[];
  /** VPS composite. Only ever rendered when breaker_state === 'armed'. */
  vps?: Provenanced;
  bas?: Provenanced;
  criteria: VpsCriterionView[];
  audio_present: boolean;
  /** The patterns a score was anchored on (REQ-004). */
  retrieved_pattern_ids: string[];
  /** Set once a human has approved. null until then. */
  human_approved_at: string | null;
}

export interface CohortKey {
  tenant_id: string;
  vertical: string;
  platform: string;
  rubric_version: string;
  pattern_library_version: string;
}

// ---------------------------------------------------------------------------
// Amplification + sign-off (P9-T5)
// ---------------------------------------------------------------------------
export type BlockedReasonCode =
  | 'blocked_rights'
  | 'blocked_disclosure'
  | 'blocked_brand_safety'
  | 'insufficient_evidence';

export interface BlockedCandidate {
  live_post_id: string;
  creator_handle: string;
  reason_code: BlockedReasonCode;
  /** e.g. "paid_amplification". Named so a manager can go get it. Never omitted. */
  missing_grant: string;
  detail: string;
}

export interface RankedCandidate {
  rank: number;
  live_post_id: string;
  creator_handle: string;
  arm: 'exploit' | 'explore';
  rationale: string;
  /** AWS — only rendered when armed AND confidence sufficient. Always 'Estimated'. */
  aws?: Provenanced;
  /** True when this rank's band overlaps another rank's band. */
  band_overlaps: boolean;
  overlaps_with_ranks: number[];
  /** insufficient_baseline / overlapping bands force a numberless render even when armed. */
  low_confidence: boolean;
  low_confidence_reason?: string;
}

export interface Counterfactual {
  /** What "boost the highest raw 24h engagement post" would have picked. */
  naive_pick_live_post_id: string;
  naive_pick_handle: string;
  /** How the AWS recommendation differs from the naive baseline. */
  differs_summary: string;
}

export interface AmplificationArtefact {
  campaign_id: string;
  breaker_state: BreakerState;
  epsilon: number;
  epsilon_rationale: string;
  ranked: RankedCandidate[];
  blocked: BlockedCandidate[];
  counterfactual: Counterfactual;
  budget_total: Provenanced;
  /** Sign-off gate. No client artefact ships without this populated. */
  signoff: SignOff | null;
}

export interface SignOff {
  reviewer_id: string;
  reviewer_name: string;
  signed_off_at: string;
  modifications: string[];
}

// ---------------------------------------------------------------------------
// Knowledge panel (P9-T6) — mirrors the C4 response. NO number a breaker governs.
// ---------------------------------------------------------------------------
export type CoverageState = 'served' | 'below_warrant_bar' | 'no_library' | 'corpus_stale';

export interface Coverage {
  state: CoverageState;
  library_version: string;
  candidates_at_conjectured?: number;
  /** e.g. "n_trends >= 2 not met for 11 of 14". Named blocking counts. */
  blocking?: string;
  corpus_last_refreshed: string;
}

// The C4 response. `unreachable` is a CLIENT-SIDE fetch state, distinct from an
// empty-but-served collection. These must not look alike (A6).
export type KnowledgeResponse =
  | { status: 'ok'; mechanisms: Mechanism[]; coverage: Coverage; library_version: string; sha256: string }
  | { status: 'unreachable'; last_error: string; retry_after_hint?: string };

// ---------------------------------------------------------------------------
// Operator dashboard (P9-T7)
// ---------------------------------------------------------------------------
export type CreatorTier = 'nano' | 'micro' | 'mid' | 'macro';

export interface CalibrationReading {
  cohort_key: CohortKey;
  breaker_state: BreakerState;
  /** Rolling Spearman. null whenever n < 60 — there is no rho below the floor. */
  rho: number | null;
  n: number;
  /** 95% CI on rho. Present only when rho is present. */
  ci: [number, number] | null;
  /** true when rho > 0.5 out-of-sample on n >= 60. A WARNING, never a win. */
  suspected_leak: boolean;
  /** Why the breaker is where it is (surfaced for tripped/cold). */
  reason: string;
}

export interface OverrideRateByCohort {
  cohort_label: string;
  override_rate: number;
  n_verdicts: number;
}

export interface OverrideRateByTier {
  tier: CreatorTier;
  verdict_from: VerdictValue;
  override_rate: number;
  n_verdicts: number;
}

export interface WarrantRungCount {
  warrant: string;
  count: number;
}

export interface FalsifiedThisRefresh {
  mechanism_id: string;
  statement_excerpt: string;
  demoted_at: string;
}

export interface ContrastedRateByArm {
  ingestion_arm: 'trend_directed' | 'uniform' | 'mixed';
  contrasted_rate: number;
  n_mechanisms: number;
}

export interface RatificationStats {
  cohort_label: string;
  volume: number;
  median_latency_hours: number;
  rejection_rate: number;
}

export interface OperatorDashboardData {
  readings: CalibrationReading[];
  override_by_cohort: OverrideRateByCohort[];
  override_by_tier: OverrideRateByTier[];
  warrant_rungs: WarrantRungCount[];
  falsified_this_refresh: FalsifiedThisRefresh[];
  contrasted_by_arm: ContrastedRateByArm[];
  ratification: RatificationStats[];
}

// ---------------------------------------------------------------------------
// "What changed" report (P9-T10, REQ-070) — DERIVED FROM C4, invents no number.
// ---------------------------------------------------------------------------
export interface WhatChangedReport {
  /** Derived by reading the C4 responses at two library versions. */
  from_library_version: string;
  to_library_version: string;
  generated_at: string;
  newly_served: { mechanism_id: string; statement_excerpt: string; warrant: string }[];
  falsified: { mechanism_id: string; statement_excerpt: string }[];
  promoted: { mechanism_id: string; from_warrant: string; to_warrant: string }[];
  /** Coverage delta, straight from C4 coverage objects. */
  coverage_before: Coverage;
  coverage_after: Coverage;
}

// ---------------------------------------------------------------------------
// API/data-source states — every surface distinguishes down / stale / empty.
// ---------------------------------------------------------------------------
export interface StaleFlag {
  stale: boolean;
  as_of: string;
}

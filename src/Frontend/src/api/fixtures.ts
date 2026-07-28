// Typed fixture data + a fixture ApiClient. Every value is shaped by the generated
// contract types and the view models. Scenarios are switchable so tests can drive
// down / stale / empty / armed / tripped / cold / unknown paths.
import type { ApiClient, Result } from './client';
import type {
  TriageItem,
  SubmissionDetail,
  AmplificationArtefact,
  KnowledgeResponse,
  OperatorDashboardData,
  WhatChangedReport,
  SignOff,
  CohortKey,
} from '../types/view';
import type { Mechanism } from '../types/generated/mechanisms';

const NOW = '2026-07-11T09:00:00Z';

const beautyTiktok: CohortKey = {
  tenant_id: '11111111-1111-1111-1111-111111111111',
  vertical: 'beauty',
  platform: 'tiktok',
  rubric_version: '1.1.0',
  pattern_library_version: 'beauty.tiktok.p7',
};

// ---------------------------------------------------------------------------
// Triage queue — risks first, then borderline, then clear passes (REQ-019).
// ---------------------------------------------------------------------------
export const queueItems: TriageItem[] = [
  {
    submission_id: 'sub-v4-rights',
    creator_handle: '@glow.molly',
    band: 'compliance_risk',
    risk_reason: 'V4 rights_record fired: no unexpired paid_amplification grant on file.',
    verdict: 'REJECTED',
    vetoes_fired: ['V4'],
    suspected_vetoes: [],
    band_straddles_threshold: false,
  },
  {
    submission_id: 'sub-v1-disclosure',
    creator_handle: '@deals.dan',
    band: 'compliance_risk',
    risk_reason: 'V1 disclosure fired: paid partnership not disclosed in caption or overlay.',
    verdict: 'REJECTED',
    vetoes_fired: ['V1'],
    suspected_vetoes: ['V3'],
    band_straddles_threshold: false,
  },
  {
    submission_id: 'sub-minor',
    creator_handle: '@teen.skincare',
    band: 'compliance_risk',
    risk_reason: 'V6 minor_creator fired: excluded from AI scoring, routed for manual review.',
    verdict: 'EXCLUDED_FROM_AI_SCORING',
    vetoes_fired: ['V6'],
    suspected_vetoes: [],
    band_straddles_threshold: false,
  },
  {
    submission_id: 'sub-notes',
    creator_handle: '@ava.routine',
    band: 'borderline',
    risk_reason: 'APPROVED_WITH_NOTES: tone_register_match flagged; confidence band straddles the approve threshold.',
    verdict: 'APPROVED_WITH_NOTES',
    vetoes_fired: [],
    suspected_vetoes: ['V2'],
    band_straddles_threshold: true,
  },
  {
    submission_id: 'sub-revisions',
    creator_handle: '@nate.grws',
    band: 'borderline',
    risk_reason: 'REVISIONS_REQUIRED: hook_strength below the hard gate (< 50).',
    verdict: 'REVISIONS_REQUIRED',
    vetoes_fired: [],
    suspected_vetoes: [],
    band_straddles_threshold: true,
  },
  {
    submission_id: 'sub-clear-1',
    creator_handle: '@jules.beauty',
    band: 'clear_pass',
    risk_reason: 'No vetoes, comfortably above the approve threshold. Still requires a human click.',
    verdict: 'APPROVED_WITH_NOTES',
    vetoes_fired: [],
    suspected_vetoes: [],
    band_straddles_threshold: false,
  },
  {
    submission_id: 'sub-clear-2',
    creator_handle: '@mira.glow',
    band: 'clear_pass',
    risk_reason: 'No vetoes, no straddle. Clear pass — a human still opens and approves it.',
    verdict: 'APPROVED_WITH_NOTES',
    vetoes_fired: [],
    suspected_vetoes: [],
    band_straddles_threshold: false,
  },
];

// ---------------------------------------------------------------------------
// Submission detail — one armed (renders VPS), one tripped (no VPS number).
// ---------------------------------------------------------------------------
export const submissionArmed: SubmissionDetail = {
  submission_id: 'sub-notes',
  creator_handle: '@ava.routine',
  cohort_key: beautyTiktok,
  breaker_state: 'armed',
  verdict: 'APPROVED_WITH_NOTES',
  vetoes: [],
  suspected_vetoes: [
    {
      veto_id: 'V2',
      name: 'claim_integrity',
      model_note:
        'Model flagged a possible unsubstantiated "clinically proven" phrase at 0:12. Surfaced for a human — NOT acted on, NOT an input to the verdict.',
    },
  ],
  vps: { value: 74, provenance: 'Estimated', as_of: NOW },
  bas: { value: 82, provenance: 'Estimated', as_of: NOW },
  criteria: [
    { key: 'hook_strength', score: 71, degraded: false, audio_dependent: true, evidence: 'First-person problem statement to camera at 0:00–0:9.' },
    { key: 'scroll_stop_power', score: 78, degraded: false, audio_dependent: false, evidence: 'High-contrast opening frame, face in first 3 frames.' },
    { key: 'completion_likelihood', score: 69, degraded: false, audio_dependent: true, evidence: 'Payoff teased at 0:2, delivered at 0:18.' },
    { key: 'pacing', score: 80, degraded: false, audio_dependent: false, evidence: '7 cuts under 20s; no dead air.' },
    { key: 'emotional_specificity', score: 66, degraded: false, audio_dependent: true, evidence: 'Named a concrete frustration ("flaky by noon").' },
    { key: 'text_readability', score: 88, degraded: false, audio_dependent: false, evidence: 'On-screen text ≤ 5 words per card.' },
    { key: 'authenticity_register', score: 62, degraded: false, audio_dependent: false, evidence: 'Unscripted register; minimal jump-cut polish.' },
  ],
  audio_present: true,
  retrieved_pattern_ids: ['pat-hook-firstperson-1.2s', 'pat-payoff-tease'],
  human_approved_at: null,
};

// Degraded (audio absent) + tripped breaker: no VPS number may render.
export const submissionTrippedDegraded: SubmissionDetail = {
  submission_id: 'sub-revisions',
  creator_handle: '@nate.grws',
  cohort_key: beautyTiktok,
  breaker_state: 'tripped',
  verdict: 'REVISIONS_REQUIRED',
  vetoes: [],
  suspected_vetoes: [],
  vps: { value: 41, provenance: 'Estimated', as_of: NOW }, // stored, must NOT render
  bas: { value: 55, provenance: 'Estimated', as_of: NOW },
  criteria: [
    { key: 'hook_strength', score: 44, degraded: true, audio_dependent: true, evidence: 'Scored from frames only — audio absent.' },
    { key: 'scroll_stop_power', score: 60, degraded: false, audio_dependent: false, evidence: 'Static opening frame.' },
    { key: 'completion_likelihood', score: 50, degraded: true, audio_dependent: true, evidence: 'Scored from frames only — audio absent.' },
    { key: 'pacing', score: 58, degraded: false, audio_dependent: false, evidence: 'Slow cuts.' },
    { key: 'emotional_specificity', score: 47, degraded: true, audio_dependent: true, evidence: 'Scored from frames only — audio absent.' },
    { key: 'text_readability', score: 70, degraded: false, audio_dependent: false, evidence: 'Legible captions.' },
    { key: 'authenticity_register', score: 55, degraded: false, audio_dependent: false, evidence: 'Neutral register.' },
  ],
  audio_present: false,
  retrieved_pattern_ids: ['pat-hook-weak'],
  human_approved_at: null,
};

const submissionsById: Record<string, SubmissionDetail> = {
  'sub-notes': submissionArmed,
  'sub-revisions': submissionTrippedDegraded,
};

// ---------------------------------------------------------------------------
// Amplification artefact — armed, with a blocked-rights candidate, counterfactual,
// an overlapping-band pair, and a low-confidence (insufficient_baseline) candidate.
// ---------------------------------------------------------------------------
export const amplificationArmed: AmplificationArtefact = {
  campaign_id: 'camp-summer-glow',
  breaker_state: 'armed',
  epsilon: 0.18,
  epsilon_rationale:
    'ε = 0.18 (floor 0.10, never 0). The exploration budget samples genuinely uncertain and unbaselined creators, which is the only unconfounded evidence the system ever gets. A zeroed ε stops the system learning about the next tier of talent.',
  ranked: [
    {
      rank: 1,
      live_post_id: 'lp-1',
      creator_handle: '@jules.beauty',
      arm: 'exploit',
      rationale: 'Top outperformance percentile within cohort; measured 24h ER 3.1× creator median.',
      aws: { value: 86, provenance: 'Estimated', as_of: NOW },
      band_overlaps: true,
      overlaps_with_ranks: [4],
      low_confidence: false,
    },
    {
      rank: 2,
      live_post_id: 'lp-2',
      creator_handle: '@mira.glow',
      arm: 'exploit',
      rationale: 'Strong cohort percentile; measured baseline available.',
      aws: { value: 79, provenance: 'Estimated', as_of: NOW },
      band_overlaps: false,
      overlaps_with_ranks: [],
      low_confidence: false,
    },
    {
      rank: 3,
      live_post_id: 'lp-3',
      creator_handle: '@newcomer.kai',
      arm: 'explore',
      rationale:
        'insufficient_baseline (creator has < 8 trailing posts). Entered the uniform-random explore pool — genuinely unknown, therefore high-information. Rendered numberless.',
      band_overlaps: false,
      overlaps_with_ranks: [],
      low_confidence: true,
      low_confidence_reason: 'insufficient_baseline: creator.trailing_posts_n < 8, so OutperformanceRatio is undefined.',
    },
    {
      rank: 4,
      live_post_id: 'lp-4',
      creator_handle: '@ava.routine',
      arm: 'exploit',
      rationale: 'Solid measured performance; band overlaps rank 1 — ordering is effectively tied.',
      aws: { value: 84, provenance: 'Estimated', as_of: NOW },
      band_overlaps: true,
      overlaps_with_ranks: [1],
      low_confidence: false,
    },
  ],
  blocked: [
    {
      live_post_id: 'lp-blocked-1',
      creator_handle: '@peak.performer',
      reason_code: 'blocked_rights',
      missing_grant: 'paid_amplification',
      detail:
        'Highest raw engagement in the campaign, but excluded: only an organic_publish grant is on file. organic_publish never implies paid_amplification. Obtain a paid_amplification grant with evidence_uri to unblock.',
    },
    {
      live_post_id: 'lp-blocked-2',
      creator_handle: '@quiet.launch',
      reason_code: 'blocked_disclosure',
      missing_grant: 'live_disclosure_verified',
      detail: 'Published cut is missing the disclosure overlay present in the approved artefact (REQ-034).',
    },
  ],
  counterfactual: {
    naive_pick_live_post_id: 'lp-blocked-1',
    naive_pick_handle: '@peak.performer',
    differs_summary:
      'The naive baseline ("boost the highest raw 24h engagement post") would pick @peak.performer — which is blocked on rights and unusable. The AWS recommendation instead leads with @jules.beauty, correcting for creator audience size via OutperformancePercentile.',
  },
  budget_total: { value: 10000, provenance: 'User-provided', as_of: NOW },
  signoff: null,
};

// ---------------------------------------------------------------------------
// Knowledge (C4) scenarios.
// ---------------------------------------------------------------------------
const firstPersonMechanism: Mechanism = {
  id: '00000000-0000-0000-0000-0000000000a1',
  statement:
    'A first-person problem-statement delivered to camera inside 1.2s resolves a curiosity gap while signalling in-group membership, which is why it holds the scroll where a product shot does not.',
  feature_predicate: { kind: 'first_person_to_camera', within_ms: 1200 },
  falsifier:
    'If top-decile posts show this predicate no more often than the same creators\' non-performers on a disjoint slice, the mechanism is falsified.',
  warrant: 'contrasted',
  evidence: {
    n_exemplars: 240,
    n_creators: 31,
    n_cohorts: 3,
    n_trends: 4,
    prevalence_in_top_decile: 0.62,
    prevalence_in_contrast_set: 0.25,
    prevalence_ratio: 2.48,
    contrast_set_definition: "the same creators' posts that did NOT reach their own top decile",
    temporal_slices: [
      { from: '2026-01-01', to: '2026-03-31', prevalence_ratio: 2.48 },
      { from: '2026-04-01', to: '2026-06-30', prevalence_ratio: 1.9 },
    ],
  },
  provenance: {
    corpus_selection: 'Proxy',
    predicate_evaluation: 'Measured',
    label: 'Proxy-selected, Measured-evaluated',
  },
  never_tested_against: 'content that was attempted and failed',
  ingestion_arm: 'trend_directed',
  ratified_by: '00000000-0000-0000-0000-0000000000f1',
  ratified_at: '2026-07-08T14:00:00Z',
  // NOTE: the ratification note is served verbatim into the panel, so it must
  // itself obey the forbidden-verb lexicon (no causes/lifts/drives/predicts, and
  // no "caus*" family word such as "causal"). Phrase the human's approval reason
  // descriptively rather than restating the rule with the very word it forbids.
  ratification_note:
    'Accepted: the asymmetry survives a disjoint slice and the statement stays descriptive, naming a falsifier rather than asserting a mechanism of action. The predicate is deterministically evaluable.',
  valid_from: '2026-07-08',
  valid_to: '2026-10-08',
};

export const knowledgeServed: KnowledgeResponse = {
  status: 'ok',
  library_version: 'beauty.tiktok.m3',
  sha256: 'abc123def456',
  coverage: {
    state: 'served',
    library_version: 'beauty.tiktok.m3',
    corpus_last_refreshed: '2026-07-08',
  },
  mechanisms: [firstPersonMechanism],
};

export const knowledgeEmptyBelowBar: KnowledgeResponse = {
  status: 'ok',
  library_version: 'beauty.tiktok.m1',
  sha256: 'empty000',
  mechanisms: [],
  coverage: {
    state: 'below_warrant_bar',
    library_version: 'beauty.tiktok.m1',
    candidates_at_conjectured: 14,
    blocking: 'n_trends >= 2 not met for 11 of 14; n_creators >= 8 not met for 6 of 14',
    corpus_last_refreshed: '2026-07-02',
  },
};

export const knowledgeUnreachable: KnowledgeResponse = {
  status: 'unreachable',
  last_error: 'C4 artefact store did not respond within the timeout.',
  retry_after_hint: 'Retry in a few minutes; the last verified cache could not be reached either.',
};

// ---------------------------------------------------------------------------
// Operator dashboard — armed cohort, a cold n=45 cohort (no rho), a suspected_leak
// cohort (armed, rho > 0.5 → warning), override rates by cohort AND tier, etc.
// ---------------------------------------------------------------------------
export const operatorData: OperatorDashboardData = {
  readings: [
    {
      cohort_key: beautyTiktok,
      breaker_state: 'armed',
      rho: 0.41,
      n: 128,
      ci: [0.28, 0.53],
      suspected_leak: false,
      reason: 'Rolling Spearman ≥ 0.35 on n ≥ 60; a human armed the cohort.',
    },
    {
      cohort_key: { ...beautyTiktok, vertical: 'fitness' },
      breaker_state: 'cold',
      rho: null,
      n: 45,
      ci: null,
      suspected_leak: false,
      reason: 'n = 45 < 60. There is no rho below the held-out floor. Breaker cold.',
    },
    {
      cohort_key: { ...beautyTiktok, vertical: 'food' },
      breaker_state: 'armed',
      rho: 0.72,
      n: 96,
      ci: [0.61, 0.81],
      suspected_leak: true,
      reason:
        'rho = 0.72 out-of-sample on n = 96. Above 0.5 at this volume is more likely a split leak than a great scorer. WARNING — a human should check the temporal holdout. This does NOT trip the breaker.',
    },
    {
      cohort_key: { ...beautyTiktok, vertical: 'tech' },
      breaker_state: 'tripped',
      rho: 0.19,
      n: 74,
      ci: [0.02, 0.35],
      suspected_leak: false,
      reason: 'rho = 0.19 < 0.35 on n = 74. Breaker tripped automatically; the arm is revoked.',
    },
  ],
  override_by_cohort: [
    { cohort_label: 'beauty · tiktok', override_rate: 0.08, n_verdicts: 210 },
    { cohort_label: 'fitness · tiktok', override_rate: 0.22, n_verdicts: 60 },
  ],
  override_by_tier: [
    { tier: 'nano', verdict_from: 'REVISIONS_REQUIRED', override_rate: 0.05, n_verdicts: 80 },
    { tier: 'micro', verdict_from: 'REVISIONS_REQUIRED', override_rate: 0.09, n_verdicts: 120 },
    { tier: 'mid', verdict_from: 'REVISIONS_REQUIRED', override_rate: 0.14, n_verdicts: 70 },
    { tier: 'macro', verdict_from: 'REVISIONS_REQUIRED', override_rate: 0.28, n_verdicts: 45 },
  ],
  warrant_rungs: [
    { warrant: 'conjectured', count: 22 },
    { warrant: 'recurrent', count: 9 },
    { warrant: 'contrasted', count: 4 },
    { warrant: 'falsified', count: 3 },
  ],
  falsified_this_refresh: [
    {
      mechanism_id: '00000000-0000-0000-0000-0000000000b2',
      statement_excerpt: 'Trending-audio sync in the first beat holds the scroll…',
      demoted_at: '2026-07-08T02:00:00Z',
    },
  ],
  contrasted_by_arm: [
    { ingestion_arm: 'trend_directed', contrasted_rate: 0.18, n_mechanisms: 22 },
    { ingestion_arm: 'uniform', contrasted_rate: 0.11, n_mechanisms: 18 },
    { ingestion_arm: 'mixed', contrasted_rate: 0.14, n_mechanisms: 7 },
  ],
  ratification: [
    { cohort_label: 'beauty · tiktok', volume: 12, median_latency_hours: 6.5, rejection_rate: 0.25 },
    { cohort_label: 'fitness · tiktok', volume: 3, median_latency_hours: 40, rejection_rate: 0.0 },
  ],
};

export const whatChanged: WhatChangedReport = {
  from_library_version: 'beauty.tiktok.m2',
  to_library_version: 'beauty.tiktok.m3',
  generated_at: NOW,
  newly_served: [
    {
      mechanism_id: '00000000-0000-0000-0000-0000000000a1',
      statement_excerpt: 'A first-person problem-statement delivered to camera inside 1.2s…',
      warrant: 'contrasted',
    },
  ],
  falsified: [
    {
      mechanism_id: '00000000-0000-0000-0000-0000000000b2',
      statement_excerpt: 'Trending-audio sync in the first beat holds the scroll…',
    },
  ],
  promoted: [
    { mechanism_id: '00000000-0000-0000-0000-0000000000a3', from_warrant: 'recurrent', to_warrant: 'contrasted' },
  ],
  coverage_before: {
    state: 'served',
    library_version: 'beauty.tiktok.m2',
    corpus_last_refreshed: '2026-04-05',
  },
  coverage_after: {
    state: 'served',
    library_version: 'beauty.tiktok.m3',
    corpus_last_refreshed: '2026-07-08',
  },
};

// ---------------------------------------------------------------------------
// Fixture ApiClient. Scenario flags let tests drive failure modes.
// ---------------------------------------------------------------------------
export interface FixtureScenario {
  c2Down?: boolean;
  c3Down?: boolean;
  c4?: 'served' | 'empty' | 'unreachable';
  queue?: 'items' | 'no_submissions' | 'all_filtered_out';
}

export function createFixtureClient(scenario: FixtureScenario = {}): ApiClient {
  const ok = <T>(data: T, stale = false): Result<T> => ({ status: 'ok', data, as_of: NOW, stale });
  const down = <T>(error: string): Result<T> => ({ status: 'down', last_as_of: NOW, error });

  return {
    async getQueue() {
      if (scenario.c2Down) return down('C2 API unreachable.');
      if (scenario.queue === 'no_submissions') return ok({ items: [], empty_reason: 'no_submissions' as const });
      if (scenario.queue === 'all_filtered_out') return ok({ items: [], empty_reason: 'all_filtered_out' as const });
      return ok({ items: queueItems, empty_reason: null });
    },
    async getSubmission(id) {
      if (scenario.c2Down) return down('C2 API unreachable.');
      const detail = submissionsById[id] ?? submissionArmed;
      return ok(detail);
    },
    async approve(_id) {
      // Fail closed when C2 is down — no verdict may be submitted.
      if (scenario.c2Down) return down('C2 API unreachable — approval was NOT recorded.');
      return ok({ human_approved_at: new Date().toISOString() });
    },
    async override(_id, _v, reason) {
      if (scenario.c2Down) return down('C2 API unreachable — override was NOT recorded.');
      if (!reason.trim()) return down('An override requires a recorded reason.');
      return ok({ overridden_at: new Date().toISOString() });
    },
    async getAmplification(_c) {
      if (scenario.c2Down) return down('C2 API unreachable.');
      return ok(amplificationArmed);
    },
    async signOff(_c, reviewerName, modifications) {
      if (scenario.c2Down) return down('C2 API unreachable — sign-off was NOT recorded.');
      const signoff: SignOff = {
        reviewer_id: 'rev-' + reviewerName.toLowerCase().replace(/\s+/g, '-'),
        reviewer_name: reviewerName,
        signed_off_at: new Date().toISOString(),
        modifications,
      };
      return ok(signoff);
    },
    async getKnowledge(_v, _p) {
      if (scenario.c4 === 'unreachable') return knowledgeUnreachable;
      if (scenario.c4 === 'empty') return knowledgeEmptyBelowBar;
      return knowledgeServed;
    },
    async getOperatorDashboard() {
      if (scenario.c3Down) return down('C3 calibration monitor unreachable — breaker state is UNKNOWN.');
      return ok(operatorData);
    },
    async getWhatChanged(_v, _p) {
      if (scenario.c4 === 'unreachable') return down('C4 unreachable — the report is derived by reading C4 and cannot be built.');
      return ok(whatChanged);
    },
  };
}

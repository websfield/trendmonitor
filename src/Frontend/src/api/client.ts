// Thin API client interface. There is no live HTTP host in this repo, so surfaces
// build against this interface with a fixture implementation (see fixtures.ts).
// The honesty invariants are about RENDERING, and they must hold on fixtures.
//
// Each method returns a discriminated result so a surface can distinguish
// "down" from "empty" from "stale" — never collapsing them into a blank screen.
import type {
  TriageItem,
  QueueEmptyReason,
  SubmissionDetail,
  AmplificationArtefact,
  KnowledgeResponse,
  OperatorDashboardData,
  WhatChangedReport,
  SignOff,
} from '../types/view';

export type Result<T> =
  | { status: 'ok'; data: T; as_of: string; stale: boolean }
  | { status: 'down'; last_as_of: string | null; error: string };

export interface ApiClient {
  // C2 — triage queue. Empty carries a reason so empty != unreachable.
  getQueue(): Promise<Result<{ items: TriageItem[]; empty_reason: QueueEmptyReason | null }>>;

  // C2 — one submission's full detail for the verdict panel.
  getSubmission(submissionId: string): Promise<Result<SubmissionDetail>>;

  // C2 — record a real human approval. Returns the stamped human_approved_at.
  // MUST fail when the C2 API is down (Ui_ApiDown_NoVerdictSubmission).
  approve(submissionId: string): Promise<Result<{ human_approved_at: string }>>;

  // C2 — override a verdict with a required reason. Emits VerdictOverridden.
  override(
    submissionId: string,
    overrideVerdict: string,
    reason: string,
  ): Promise<Result<{ overridden_at: string }>>;

  // C2 — amplification artefact for a campaign.
  getAmplification(campaignId: string): Promise<Result<AmplificationArtefact>>;

  // C2 — sign off an amplification artefact. Emits AmplificationSignedOff.
  signOff(campaignId: string, reviewerName: string, modifications: string[]): Promise<Result<SignOff>>;

  // C4 — knowledge. Its OWN result shape carries unreachable vs served-but-empty.
  getKnowledge(vertical: string, platform: string): Promise<KnowledgeResponse>;

  // C3 — operator dashboard. When C3 is down, breaker states read 'unknown'.
  getOperatorDashboard(): Promise<Result<OperatorDashboardData>>;

  // C4-derived "what changed" report (REQ-070).
  getWhatChanged(vertical: string, platform: string): Promise<Result<WhatChangedReport>>;
}

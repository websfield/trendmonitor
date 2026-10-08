// HELD DRAFTS (audit P3-A4, P3-R1(b); decisions R-157).
//
// A HELD draft is a generation attempt at `vendor_complete`: the vendor
// answered, the candidate is stored, and nothing was charged — because the
// settlement met a pause, a short balance or a transient database error, or
// because the process died between the checkpoint and the settlement. It is
// finishable for 24 hours from `vendor_completed_at`; then the worker's hard
// clear removes it, uncharged.
//
// THREE ways to finish one, and all three are ONE path (`observeExistingClaim`
// → `settle`): a resubmission of the same attempt id (through `generate`); the
// creator's "Finish this draft" on /studio (through `settleHeldAttempt`); and
// the operator's `scripts/settle-candidate.ts`, through
// `operatorSettleCandidate` below, which calls `settleHeldAttempt` too.
// NOTHING finishes one automatically — R-157 records the trigger for that.
import {
  ProfileAccessError,
  VENDOR_COMPLETE_HARD_CLEAR_MS,
  WorkspaceAccessError,
  locateGenerationAttemptForOperator,
  mintProfileScope,
  withWorkspace,
  type DbLike,
  type WorkspaceScope,
} from "@respin/db";

import {
  GenerationAlreadyRefusedError,
  GenerationHeldError,
  GenerationInFlightError,
  GenerationRecoveryRequiredError,
  HeldDraftUnavailableError,
} from "./errors";
import { settleHeldAttempt, type GenerateResult } from "./generate";
import { InferenceRoleError, ProfileArchivedError } from "./inference";

/** One held draft as `/studio` lists it: never the candidate's bytes. */
export type HeldDraft = Readonly<{
  attemptId: string;
  mode: string;
  /** When the worker's hard clear removes it — 24 h after the vendor answered. */
  heldUntil: Date;
}>;

/**
 * This profile's held drafts, oldest first, through the profile's own scoped
 * read (`heldGenerationAttempts`, which returns ids, modes, states and
 * `vendor_completed_at` only).
 */
export async function heldDrafts(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string
): Promise<HeldDraft[]> {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const rows = await scope.accessors.heldGenerationAttempts();
  return rows.map((row) => ({
    attemptId: row.attemptId,
    mode: row.mode,
    heldUntil: new Date(row.vendorCompletedAt.getTime() + VENDOR_COMPLETE_HARD_CLEAR_MS),
  }));
}

/**
 * What the operator's settle command reports — ids, a state and a closed code
 * only. NEVER the candidate: it is creator content, and an operator settling
 * money does not need to read it.
 */
export type OperatorSettleOutcome =
  | Readonly<{
      code: "settled";
      attemptId: string;
      creditsCharged: number;
      tier: string;
      configVersion: number;
    }>
  | Readonly<{ code: "already_settled"; attemptId: string }>
  | Readonly<{
      code:
        | "not_found"
        | "no_active_owner"
        | "workspace_unavailable"
        | "paused"
        | "insufficient_balance"
        | "transient"
        | "recovery_required"
        | "refused"
        | "in_flight"
        | "profile_unavailable";
      attemptId: string;
      state: string | null;
    }>;

/**
 * THE OPERATOR'S RECOVERY FOR ONE STORED CANDIDATE (audit P3-R1(b)).
 *
 * Locates the attempt (ids and state only), mints the workspace scope AS the
 * workspace's longest-standing active owner through `withWorkspace` — so a
 * tombstoned or erasing workspace mints no scope and is refused exactly as
 * that owner would be — and calls `settleHeldAttempt`, the entry "Finish this
 * draft" uses. Every refusal `settle` makes is inherited, not re-implemented:
 * a paused workspace, a short balance or a transient error HOLDS the draft
 * again; a candidate past 24 hours is `recovery_required`. A tier change since the claim
 * is not a refusal — the settlement records the tier it read under the lock,
 * and the outcome prints it. A second run on a settled attempt is
 * `already_settled` and charges nothing.
 */
export async function operatorSettleCandidate(
  db: DbLike,
  attemptId: string,
  at: Date
): Promise<OperatorSettleOutcome> {
  const located = await locateGenerationAttemptForOperator(db, attemptId);
  if (!located) return { code: "not_found", attemptId, state: null };
  if (located.ownerAuthUserId === null) {
    return { code: "no_active_owner", attemptId, state: located.state };
  }
  let scope: WorkspaceScope;
  try {
    scope = await withWorkspace(db, {
      authUserId: located.ownerAuthUserId,
      workspaceId: located.workspaceId,
    });
  } catch (error) {
    if (error instanceof WorkspaceAccessError) {
      return { code: "workspace_unavailable", attemptId, state: located.state };
    }
    throw error;
  }
  let result: GenerateResult;
  try {
    result = await settleHeldAttempt(db, scope, located.profileId, attemptId, at);
  } catch (error) {
    const refused = (
      code: Exclude<OperatorSettleOutcome["code"], "settled" | "already_settled">
    ): OperatorSettleOutcome => ({ code, attemptId, state: located.state });
    if (error instanceof GenerationHeldError) {
      return refused(error.reason);
    }
    if (error instanceof GenerationRecoveryRequiredError) return refused("recovery_required");
    if (error instanceof GenerationAlreadyRefusedError) return refused("refused");
    if (error instanceof GenerationInFlightError) return refused("in_flight");
    // `ProfileAccessError`: the profile is past its lifecycle (a profile in
    // deletion mints no scope) — the same answer as an archived one.
    if (
      error instanceof HeldDraftUnavailableError ||
      error instanceof ProfileArchivedError ||
      error instanceof ProfileAccessError ||
      error instanceof InferenceRoleError
    ) {
      return refused("profile_unavailable");
    }
    throw error;
  }
  if (result.replayed) return { code: "already_settled", attemptId };
  return {
    code: "settled",
    attemptId,
    creditsCharged: result.creditsChargedNow,
    tier: result.resolvedTier,
    configVersion: result.configVersion,
  };
}

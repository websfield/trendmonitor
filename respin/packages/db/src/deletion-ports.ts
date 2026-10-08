import type {
  DeletionOperationState,
  DeletionScope,
  MembershipRecoveryOutcome,
} from "./lifecycle-schema";
import type { MembershipRole } from "./schema";
import type { TxLike } from "./db-like";

export type RecoveryDeliveryRequest = Readonly<{
  operationId: string;
  commandId: string;
  attempt: number;
  authUserId: string;
  secret: string;
  secretDigest: string;
  secretPrefix: string;
  recipientDigest: string;
  expiresAt: Date;
}>;

export type RecoveryDeliveryReconciliationRequest = Readonly<
  Omit<RecoveryDeliveryRequest, "secret">
>;

export type RecoveryDeliveryFailureCode =
  | "not_delivered"
  | "recipient_rejected"
  | "provider_rejected";

export type RecoveryDeliveryResult =
  | Readonly<{
      outcome: "confirmed";
      operationId: string;
      commandId: string;
      attempt: number;
      secretDigest: string;
      recipientDigest: string;
      expiresAt: Date;
      deliveredAt: Date;
      deliveryReceiptDigest: string;
    }>
  | Readonly<{ outcome: "failed"; failureCode: RecoveryDeliveryFailureCode }>
  | Readonly<{ outcome: "unknown"; reconciliationDigest: string }>;

/** Domain port only. The Resend/outbox adapter belongs to Task 4. */
export interface RecoveryDeliveryPort {
  deliverIdentityRecovery(
    request: RecoveryDeliveryRequest
  ): Promise<RecoveryDeliveryResult>;
  reconcileIdentityRecovery(
    request: RecoveryDeliveryReconciliationRequest
  ): Promise<RecoveryDeliveryResult>;
}

export type JournalTransitionRequest = Readonly<{
  schemaVersion: 1;
  operationId: string;
  scope: DeletionScope;
  target: Readonly<{
    userId: string | null;
    workspaceId: string | null;
    profileId: string | null;
  }>;
  requesterDigest: string;
  version: number;
  fromState: DeletionOperationState;
  toState: DeletionOperationState;
  payloadHash: string;
  priorReceiptDigest: string | null;
  requestedAt: Date;
  effectiveAt: Date;
  retainUntil: Date;
}>;

/** Stable bytes shared by the future S3 adapter, restore verifier, and tests. */
export function canonicalJournalPayload(request: JournalTransitionRequest): string {
  return JSON.stringify({
    schemaVersion: request.schemaVersion,
    operationId: request.operationId,
    scope: request.scope,
    target: {
      userId: request.target.userId,
      workspaceId: request.target.workspaceId,
      profileId: request.target.profileId,
    },
    requesterDigest: request.requesterDigest,
    version: request.version,
    fromState: request.fromState,
    toState: request.toState,
    payloadHash: request.payloadHash,
    priorReceiptDigest: request.priorReceiptDigest,
    requestedAt: request.requestedAt.toISOString(),
    effectiveAt: request.effectiveAt.toISOString(),
    retainUntil: request.retainUntil.toISOString(),
  });
}

export function journalRequestChecksum(request: JournalTransitionRequest): string {
  return createHash("sha256")
    .update(canonicalJournalPayload(request), "utf8")
    .digest("hex");
}

export function journalReceiptDigest(
  request: JournalTransitionRequest,
  object: Readonly<{ objectKey: string; objectVersionId: string; checksumSha256: string }>
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: request.schemaVersion,
        operationId: request.operationId,
        version: request.version,
        objectKey: object.objectKey,
        objectVersionId: object.objectVersionId,
        checksumSha256: object.checksumSha256,
        retainUntil: request.retainUntil.toISOString(),
      }),
      "utf8"
    )
    .digest("hex");
}

export type JournalTransitionResult =
  | Readonly<{
      outcome: "confirmed";
      schemaVersion: 1;
      operationId: string;
      scope: DeletionScope;
      target: JournalTransitionRequest["target"];
      requesterDigest: string;
      version: number;
      fromState: DeletionOperationState;
      toState: DeletionOperationState;
      payloadHash: string;
      priorReceiptDigest: string | null;
      requestedAt: Date;
      effectiveAt: Date;
      retainUntil: Date;
      objectKey: string;
      objectVersionId: string;
      checksumSha256: string;
      receiptDigest: string;
    }>
  | Readonly<{ outcome: "conflict"; code: string }>
  | Readonly<{ outcome: "unknown"; reconciliationKey: string }>;

/**
 * Append-only conditional-create authority. No database implementation is
 * supplied: R-124 requires a separate immutable external journal in Task 5.
 */
export interface DeletionJournalPort {
  appendTransition(
    request: JournalTransitionRequest
  ): Promise<JournalTransitionResult>;
}

export type MembershipRestoreCandidate = Readonly<{
  operationId: string;
  userId: string;
  membershipId: string;
  workspaceId: string;
  role: MembershipRole;
  membershipVersion: number;
}>;

export type MembershipRestoreDecision = Readonly<{
  allowed: boolean;
  refusal: Extract<MembershipRecoveryOutcome, "seat_refused"> | null;
}>;

/** Task-4 seats plug in here; cancellation never assumes capacity. */
export interface MembershipRestorePolicyPort {
  mayRestore(
    candidate: MembershipRestoreCandidate,
    tx: TxLike
  ): Promise<MembershipRestoreDecision>;
}

/**
 * R-165 (P5-A1): money a Stripe event carried for a workspace while it was
 * tombstoned is HELD (`stripe_events.outcome = 'held_tombstoned'`), never
 * dropped, and replayed once the workspace's deletion is cancelled. The replay
 * lives in @respin/credits, which owns `dispatch`; this package cannot import
 * it, so `cancelScopedDeletion` takes it as an optional port and runs it after
 * its commit. The PRODUCTION replayer is the worker's deletion tick, which
 * runs it for every active workspace with held rows (the app facade passes no
 * port: the dispatcher's deliberate bare throws stay off its reachable set).
 */
export type HeldMoneyReplaySummary = Readonly<{
  replayed: number;
  /** Rows another replay already settled: the row-locked gate found no held row. */
  alreadySettled: number;
  /** Rows a replay could not settle; they stay held and are retried. */
  failed: number;
  /**
   * Rows left held because the workspace is not active or its customer no
   * longer maps to it (R-166, gate Low). On an ACTIVE workspace that is a
   * money state no tick will change by itself: the worker pages on it.
   */
  stillHeld: number;
}>;

/**
 * Phase 10b-1 Task 8: until 10b-2 introduces seat caps there is no capacity to
 * refuse, so an unchanged suspended membership is always restorable. 10b-2
 * replaces this constant with the real seat policy — "cancellation never
 * assumes capacity" is why it is a named port, not an inline `true`. Homed
 * here (moved from app-server.ts by R-162) so the worker's wedge sweep, which
 * cannot import the app facade, composes the same policy the app does.
 */
export const NO_SEAT_CAP_RESTORE_POLICY: MembershipRestorePolicyPort = {
  mayRestore: async () => ({ allowed: true, refusal: null }),
};

export interface HeldMoneyReplayPort {
  replayHeldEvents(workspaceId: string): Promise<HeldMoneyReplaySummary>;
}

import { createHash } from "node:crypto";

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

import { createHash } from "node:crypto";

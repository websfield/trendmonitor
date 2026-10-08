import { captureActivationContributionInTx, type ActivationExclusions } from "./activation";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { user as authUser, session } from "./auth-schema";
import { subscriptions } from "./billing-schema";
import { creatorProfiles } from "./brain-schema";
import type { DbLike, TxLike } from "./db-like";
import {
  assertCancellationCommandsSettledInTx,
  enqueueExternalCommandInTx,
  externalCommandSummary,
  latestExternalCommandInTx,
} from "./deletion-external-commands";
import type {
  DeletionJournalPort,
  HeldMoneyReplayPort,
  MembershipRestorePolicyPort,
  RecoveryDeliveryReconciliationRequest,
  RecoveryDeliveryPort,
  RecoveryDeliveryResult,
} from "./deletion-ports";
import {
  journalReceiptDigest,
  journalRequestChecksum,
} from "./deletion-ports";
import {
  deletionCancellationProofs,
  deletionMembershipSnapshots,
  deletionOperations,
  deletionOperationTransitions,
  deletionRecoverySessions,
  type DeletionOperation,
  type DeletionOperationState,
  type DeletionScope,
} from "./lifecycle-schema";
import {
  assertFreshWorkspaceAuthority,
  assertWorkspaceLifecycleTransactionAccess,
  lockIdentityMembershipGraph,
  lockWorkspaceMembershipGraph,
  sortedWorkspaceIds,
} from "./membership-lifecycle";
import { newestWorkspaceDeletionAdmitsRead } from "./read-grade-lifecycle";
import { memberships, users, workspaces } from "./schema";
import { autopsyCacheClaims } from "./trends-schema";
import {
  assertReadScoped,
  assertScoped,
  isWorkspaceScope,
  type ReadGradeWorkspaceScope,
  type WorkspaceScope,
} from "./with-workspace";

export const DELETION_REAUTH_MAX_AGE_MS = 10 * 60 * 1_000;

/**
 * Tolerance for comparing a timestamp produced on ONE machine against `now`
 * read from the DATABASE.
 *
 * THE CLASS, not one instance. `reauthenticatedAt`, `factorVerifiedAt` and a
 * delivery receipt's `deliveredAt` are all stamped by an application process
 * (in production, a different host from Postgres; for a mail receipt, the
 * provider's own clock). Every "is this in the future?" check against
 * `databaseNow()` therefore compares two clocks, and with ZERO tolerance a few
 * milliseconds of ordinary skew becomes a refusal.
 *
 * Measured on this machine 2026-09-08 while the full suite ran: the database
 * clock landed up to 38 ms outside the JS read window — enough to refuse a
 * user who had just re-authenticated, with `reauthentication_missing_or_stale`,
 * on the path that deletes their account. On separate hosts it is worse.
 *
 * ONE DIRECTION ONLY. This pads the FUTURE side, which is a pure clock artifact
 * and never a security property. The STALENESS side keeps its exact window:
 * `now - at > windowMs` is the ten-minute reauthentication boundary and padding
 * it would widen a security control.
 */
export const CROSS_CLOCK_TOLERANCE_MS = 60_000;
export const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1_000;
export const DELETION_JOURNAL_RETAIN_MS = 28 * 24 * 60 * 60 * 1_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(code: string): never {
  throw new Error(`deletion_refused:${code}`);
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requesterDigest(userId: string): string {
  return digest(`respin:deletion-requester:v1:${userId}`);
}

function requestHash(
  scope: DeletionScope,
  target: string,
  confirmation?: string
): string {
  return digest(JSON.stringify({ schema: 1, scope, target, confirmation }));
}

function targetKey(
  scope: DeletionScope,
  target: Readonly<{ userId?: string; workspaceId?: string; profileId?: string }>
): string {
  if (scope === "identity" && target.userId) return `identity:${target.userId}`;
  if (scope === "workspace" && target.workspaceId) return `workspace:${target.workspaceId}`;
  if (scope === "profile" && target.workspaceId && target.profileId) {
    return `profile:${target.workspaceId}:${target.profileId}`;
  }
  refuse("target_shape_invalid");
}

function validKey(value: string): boolean {
  return value.length >= 8 && value.length <= 200 && value.trim() === value;
}

/**
 * A deletion operation that COUNTS as under way: anything but an unreserved
 * draft (R-166, gate H2). A draft — `requested` with no journal reservation —
 * has no externally visible transition (the rule `requestScopedDeletion`'s
 * rebinding already relies on), and no executor, sweep or seam ever advances
 * one: the wedge sweep reaches reserved operations only. So a predicate that
 * WAITS on an operation, or treats its target as already being deleted, must
 * not count a draft, or it waits on something nothing will finish. The three
 * such predicates: `workspacesUnderDeletionInTx` (here), and
 * `nestedRequestedOperations` / `nestedActiveProfileOperations` in
 * `deletion-executor.ts`.
 */
export function deletionOperationUnderWay() {
  return sql`NOT (${deletionOperations.state} = 'requested' AND ${deletionOperations.journalIntentPlanDigest} IS NULL)`;
}

function validRecoverySecret(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === value;
}

function assertScopedRequestEpochs(
  operation: DeletionOperation,
  authority: WorkspaceScope,
  profileLifecycleVersion: number | null
): void {
  if (
    operation.requestMembershipVersion !== authority.membershipVersion ||
    operation.requestWorkspaceLifecycleVersion !== authority.workspaceLifecycleVersion ||
    operation.requestProfileLifecycleVersion !== profileLifecycleVersion
  ) {
    refuse("request_authority_epoch_mismatch");
  }
}

export async function databaseNow(tx: TxLike): Promise<Date> {
  const result = (await tx.execute(
    sql`SELECT clock_timestamp() AS now`
  )) as unknown as { rows: { now: Date | string }[] };
  const raw = result.rows[0]?.now;
  const value = raw instanceof Date ? raw : new Date(raw ?? Number.NaN);
  if (Number.isNaN(value.getTime())) refuse("database_clock_unavailable");
  return value;
}

/**
 * The domain user a session belongs to — identity only, no clock, no
 * freshness. Used to choose WHICH identity lock to take before the clocked
 * proof (`requireReauthenticatedSession`) runs under it.
 */
async function sessionDomainUserId(tx: TxLike, sessionId: string): Promise<string> {
  const [row] = await tx
    .select({ userId: users.id })
    .from(session)
    .innerJoin(users, eq(users.authUserId, session.userId))
    .where(eq(session.id, sessionId))
    .limit(1);
  if (!row) refuse("foreign_session");
  return row.userId;
}

function resolveReauthWindow(maxAgeMs: number | undefined): number {
  const value = maxAgeMs ?? DELETION_REAUTH_MAX_AGE_MS;
  if (!Number.isSafeInteger(value) || value <= 0 || value > DELETION_REAUTH_MAX_AGE_MS) {
    refuse("invalid_reauth_window");
  }
  return value;
}

/**
 * The deletion guard: a fresh, PASSWORD-written stamp on this exact session
 * (R-166, gate Low). R-164's Google stamp was built for billing and is
 * admitted there; deletion and cancellation of a deletion are not billing
 * actions, and before R-164 the password arm was their only writer, so a
 * Google stamp (`reauthenticated_method = 'google'`) — or one with no method
 * recorded — refuses `reauthentication_method_not_accepted`. A Google-only
 * person stays where they were before R-164 for deletion.
 */
async function requireReauthenticatedSession(
  tx: TxLike,
  sessionId: string,
  now: Date,
  maxAgeMs?: number,
  expectedUserId?: string
): Promise<{ userId: string; authUserId: string }> {
  const windowMs = resolveReauthWindow(maxAgeMs);
  const [proof] = await tx
    .select({
      userId: users.id,
      authUserId: users.authUserId,
      sessionAuthUserId: session.userId,
      reauthenticatedAt: session.reauthenticatedAt,
      reauthenticatedMethod: session.reauthenticatedMethod,
      expiresAt: session.expiresAt,
    })
    .from(users)
    .innerJoin(session, eq(session.userId, users.authUserId))
    .where(
      and(
        eq(session.id, sessionId),
        eq(session.userId, users.authUserId)
      )
    )
    .limit(1);
  if (!proof || proof.sessionAuthUserId !== proof.authUserId) refuse("foreign_session");
  if (expectedUserId !== undefined && proof.userId !== expectedUserId) {
    refuse("foreign_session");
  }
  if (proof.expiresAt.getTime() <= now.getTime()) refuse("expired_session");
  const at = proof.reauthenticatedAt?.getTime();
  if (
    at === undefined ||
    // Future side: tolerated, because `reauthenticatedAt` is stamped by the
    // application and `now` by the database. Staleness side: exact, because
    // that is the security window.
    at > now.getTime() + CROSS_CLOCK_TOLERANCE_MS ||
    now.getTime() - at > windowMs
  ) {
    refuse("reauthentication_missing_or_stale");
  }
  if (proof.reauthenticatedMethod !== "password") refuse("reauthentication_method_not_accepted");
  return { userId: proof.userId, authUserId: proof.authUserId };
}

const TRANSITIONS: Readonly<Record<DeletionOperationState, readonly DeletionOperationState[]>> = {
  // No `requested -> cancelled` edge (R-162): an edge from `requested` would
  // bypass the journal. A wedged `requested` is the worker's resume sweep's
  // job (`resumeWedgedDeletionOperations`), never a button's.
  requested: ["journal_pending"],
  journal_pending: ["tombstoned", "cancelled"],
  tombstoned: ["external_actions_pending", "cancelled", "blocked"],
  external_actions_pending: ["grace", "cancelled", "blocked"],
  grace: ["erasing", "cancelled", "blocked"],
  erasing: ["verifying", "blocked"],
  verifying: ["complete", "blocked"],
  complete: [],
  // TWO resume targets, the two `handleBlocked` in deletion-executor.ts
  // resumes (`external_actions_pending`, `erasing`); every other resume state
  // waits for an operator. This list named five until R-162, three of them
  // edges nothing produced. The database check
  // `deletion_operations_blocked_resume_shape` (lifecycle-schema.ts,
  // migrations 0038/0043) still admits all five as a stored
  // `blocked_resume_state`, and is left wider DELIBERATELY: a wider constraint
  // refuses nothing a narrower one would let through, and this table is what
  // refuses the transition.
  //
  // `cancelled` (R-162): every pre-erasure predecessor of `blocked` could
  // cancel and `blocked` itself could not, so a failed pre-grace fence
  // stranded the deletion with no way out. The exit is bounded by the same
  // grace window as every other cancellation, and a `blocked` whose resume
  // state is `erasing`/`verifying` is refused as `erasure_started`
  // (`requireScopedCancellationAuthorityInTx`) — irreversible commands may have
  // run, so it never cancels.
  blocked: ["external_actions_pending", "erasing", "cancelled"],
  cancelled: [],
};

export function assertDeletionTransition(
  from: DeletionOperationState,
  to: DeletionOperationState
): void {
  if (!isLegalDeletionTransition(from, to)) refuse(`invalid_transition:${from}:${to}`);
}

/**
 * The same authority as a predicate, for readers that must REPORT an illegal
 * transition rather than throw on one — the restore verifier, which has to
 * collect every conflict in a chain before refusing.
 *
 * Exported so there is exactly ONE transition table. Task 5's first attempt
 * hand-rolled a subset of these rules in the verifier and missed the whole
 * genesis case (a one-version chain declaring `erasing -> cancelled` verified
 * clean), which is what a second copy of a rule set always eventually does.
 */
export function isLegalDeletionTransition(
  from: DeletionOperationState,
  to: DeletionOperationState
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** The state every honest chain starts from: `version = journalVersion + 1`. */
export const DELETION_GENESIS_STATE: DeletionOperationState = "requested";

export type JournalPlanStep = Readonly<{
  from: DeletionOperationState;
  to: DeletionOperationState | readonly DeletionOperationState[];
}>;

function journalPlanTargets(step: JournalPlanStep): readonly DeletionOperationState[] {
  return typeof step.to === "string" ? [step.to] : step.to;
}

const REQUEST_TOMBSTONE_STEPS = [
  { from: "requested", to: "journal_pending" },
  { from: "journal_pending", to: "tombstoned" },
] as const satisfies readonly JournalPlanStep[];

const IDENTITY_REQUEST_STEPS = [
  { from: "requested", to: "journal_pending" },
  { from: "journal_pending", to: ["tombstoned", "cancelled"] },
] as const satisfies readonly JournalPlanStep[];

function journalPlanDigest(
  steps: readonly JournalPlanStep[],
  authorityBindingDigest?: string
): string {
  return authorityBindingDigest
    ? digest(JSON.stringify({ schema: 2, steps, authorityBindingDigest }))
    : digest(JSON.stringify({ schema: 1, steps }));
}

function hasExactJournalReservation(
  operation: DeletionOperation,
  planDigest: string
): boolean {
  return (
    operation.journalIntentPlanDigest === planDigest &&
    operation.journalIntentBaseVersion === operation.journalVersion &&
    operation.journalIntentEffectiveAt !== null
  );
}

/**
 * Persist the nondeterministic journal timestamp before any object-store call.
 * A DB rollback after a successful conditional create therefore retries the
 * exact same bytes for every version in this plan.
 */
export async function prepareJournalPlan(
  db: DbLike,
  operationId: string,
  steps: readonly JournalPlanStep[],
  options?: Readonly<{
    authorityBindingDigest?: string;
    beforeReserve?: (tx: TxLike, planDigest: string) => Promise<void>;
    validateOperation?: (
      operation: DeletionOperation,
      now: Date,
      tx: TxLike
    ) => void | Promise<void>;
  }>
): Promise<string> {
  if (steps.length === 0) refuse("journal_plan_empty");
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    for (const target of journalPlanTargets(step)) {
      assertDeletionTransition(step.from, target);
    }
    if (
      index > 0 &&
      !journalPlanTargets(steps[index - 1]!).includes(step.from)
    ) {
      refuse("journal_plan_discontinuous");
    }
  }
  const planDigest = journalPlanDigest(steps, options?.authorityBindingDigest);
  return db.transaction(async (tx) => {
    await options?.beforeReserve?.(tx, planDigest);
    const [operation] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1)
      .for("update");
    if (!operation) refuse("operation_not_found");
    const now = await databaseNow(tx);
    await options?.validateOperation?.(operation, now, tx);
    if (
      journalPlanTargets(steps[steps.length - 1]!).includes(operation.state) &&
      operation.journalIntentPlanDigest === null &&
      operation.journalIntentBaseVersion === null &&
      operation.journalIntentEffectiveAt === null
    ) {
      return planDigest;
    }
    if (operation.state !== steps[0]!.from) refuse("journal_plan_state_conflict");
    if (
      operation.journalIntentPlanDigest !== null ||
      operation.journalIntentBaseVersion !== null ||
      operation.journalIntentEffectiveAt !== null
    ) {
      if (
        operation.journalIntentPlanDigest === planDigest &&
        operation.journalIntentBaseVersion === operation.journalVersion &&
        operation.journalIntentEffectiveAt !== null
      ) {
        return planDigest;
      }
      refuse("journal_plan_conflict");
    }
    const [prepared] = await tx
      .update(deletionOperations)
      .set({
        journalIntentBaseVersion: operation.journalVersion,
        journalIntentPlanDigest: planDigest,
        journalIntentEffectiveAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(deletionOperations.id, operation.id),
          eq(deletionOperations.state, operation.state),
          eq(deletionOperations.journalVersion, operation.journalVersion)
        )
      )
      .returning({ id: deletionOperations.id });
    if (!prepared) refuse("journal_plan_conflict");
    return planDigest;
  });
}

async function hasReservedJournalPlan(
  tx: TxLike,
  operationId: string,
  planDigest: string
): Promise<boolean> {
  const [operation] = await tx
    .select({ planDigest: deletionOperations.journalIntentPlanDigest })
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  return operation?.planDigest === planDigest;
}

function scopedCancellationAuthorityBinding(
  operation: Pick<
    DeletionOperation,
    "id" | "scope" | "targetKey" | "requesterDigest"
  >
): string {
  if (
    (operation.scope !== "profile" && operation.scope !== "workspace") ||
    !/^[0-9a-f]{64}$/.test(operation.requesterDigest)
  ) {
    refuse("cancellation_authority_binding_invalid");
  }
  return digest(
    JSON.stringify({
      schema: 2,
      purpose: "scoped_deletion_cancellation",
      operationId: operation.id,
      scope: operation.scope,
      targetKey: operation.targetKey,
      requesterDigest: operation.requesterDigest,
    })
  );
}

function scopedRequestAuthorityBinding(
  operation: Pick<
    DeletionOperation,
    | "id"
    | "scope"
    | "targetKey"
    | "profileId"
    | "profilePriorState"
    | "workspaceId"
    | "requesterDigest"
    | "requestSessionDigest"
    | "requestMembershipVersion"
    | "requestWorkspaceLifecycleVersion"
    | "requestProfileLifecycleVersion"
    | "idempotencyKey"
    | "payloadHash"
  >
): string {
  if (
    (operation.scope !== "profile" && operation.scope !== "workspace") ||
    !operation.workspaceId ||
    typeof operation.requestSessionDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(operation.requestSessionDigest) ||
    !/^[0-9a-f]{64}$/.test(operation.payloadHash) ||
    !validKey(operation.idempotencyKey) ||
    operation.requestMembershipVersion === null ||
    operation.requestWorkspaceLifecycleVersion === null ||
    (operation.scope === "profile") !==
      (operation.profileId !== null &&
        operation.requestProfileLifecycleVersion !== null &&
        (operation.profilePriorState === "active" ||
          operation.profilePriorState === "archived")) ||
    (operation.scope === "workspace" && operation.profilePriorState !== null)
  ) {
    refuse("request_authority_binding_invalid");
  }
  const targetId =
    operation.scope === "profile" ? operation.profileId! : operation.workspaceId;
  if (
    operation.targetKey !==
    targetKey(operation.scope, {
      workspaceId: operation.workspaceId,
      ...(operation.scope === "profile" ? { profileId: targetId } : {}),
    })
  ) {
    refuse("request_authority_binding_invalid");
  }
  return digest(
    JSON.stringify({
      schema: 2,
      purpose: "scoped_deletion_request",
      operationId: operation.id,
      scope: operation.scope,
      targetKey: operation.targetKey,
      targetId,
      payloadHash: operation.payloadHash,
      sessionDigest: operation.requestSessionDigest,
      idempotencyKey: operation.idempotencyKey,
      requesterDigest: operation.requesterDigest,
      workspaceId: operation.workspaceId,
      membershipVersion: operation.requestMembershipVersion,
      workspaceLifecycleVersion: operation.requestWorkspaceLifecycleVersion,
      profileLifecycleVersion: operation.requestProfileLifecycleVersion,
      profilePriorState: operation.profilePriorState,
    })
  );
}

function identityRequestAuthorityBinding(
  operation: Pick<
    DeletionOperation,
    | "id"
    | "scope"
    | "targetKey"
    | "userId"
    | "requesterDigest"
    | "requestSessionDigest"
    | "payloadHash"
    | "recoveryExpiresAt"
  >
): string {
  if (
    operation.scope !== "identity" ||
    !operation.userId ||
    operation.targetKey !== targetKey("identity", { userId: operation.userId }) ||
    !/^[0-9a-f]{64}$/.test(operation.requesterDigest) ||
    !/^[0-9a-f]{64}$/.test(operation.requestSessionDigest ?? "") ||
    !/^[0-9a-f]{64}$/.test(operation.payloadHash) ||
    !operation.recoveryExpiresAt
  ) {
    refuse("request_authority_binding_invalid");
  }
  return digest(
    JSON.stringify({
      schema: 2,
      purpose: "identity_deletion_request",
      operationId: operation.id,
      targetKey: operation.targetKey,
      userId: operation.userId,
      requesterDigest: operation.requesterDigest,
      sessionDigest: operation.requestSessionDigest,
      payloadHash: operation.payloadHash,
      recoveryExpiresAt: operation.recoveryExpiresAt.toISOString(),
    })
  );
}

function identityCancellationAuthorityBinding(
  authority: Pick<
    IdentityCancellationAuthority,
    | "operation"
    | "proofId"
    | "proofAuthUserId"
    | "factorVerifiedAt"
    | "proofExpiresAt"
    | "statusReceiptDigest"
    | "recoverySessionId"
    | "recoverySessionOperationId"
    | "recoverySessionConsumedAt"
  >
): string {
  const { operation } = authority;
  if (
    operation.scope !== "identity" ||
    !operation.userId ||
    !operation.recoverySecretDigest ||
    !/^[0-9a-f]{64}$/.test(operation.recoverySecretDigest) ||
    !/^[0-9a-f]{64}$/.test(authority.statusReceiptDigest) ||
    authority.recoverySessionOperationId !== operation.id
  ) {
    refuse("cancellation_authority_binding_invalid");
  }
  return digest(
    JSON.stringify({
      schema: 2,
      purpose: "identity_deletion_cancellation",
      operationId: operation.id,
      targetKey: operation.targetKey,
      userId: operation.userId,
      requesterDigest: operation.requesterDigest,
      recoverySecretDigest: operation.recoverySecretDigest,
      proofId: authority.proofId,
      proofAuthUserIdDigest: digest(authority.proofAuthUserId),
      factorVerifiedAt: authority.factorVerifiedAt.toISOString(),
      proofExpiresAt: authority.proofExpiresAt.toISOString(),
      cancellationReceiptDigest: authority.statusReceiptDigest,
      recoverySessionId: authority.recoverySessionId,
      recoverySessionOperationId: authority.recoverySessionOperationId,
      recoverySessionConsumedAt: authority.recoverySessionConsumedAt.toISOString(),
    })
  );
}

export async function appendJournalTransitionInTx(
  tx: TxLike,
  operation: DeletionOperation,
  toState: DeletionOperationState,
  journal: DeletionJournalPort,
  now: Date,
  options: Readonly<{
    steps: readonly JournalPlanStep[];
    authorityBindingDigest?: string;
    planIndex: number;
    cancellationReplayDigest?: string;
    identityCancellationReceiptExpiresAt?: Date;
    expiredRecoveryAbandonment?: boolean;
  }>
): Promise<DeletionOperation> {
  const planDigest = journalPlanDigest(options.steps, options.authorityBindingDigest);
  const planLength = options.steps.length;
  const step = options.steps[options.planIndex];
  assertDeletionTransition(operation.state, toState);
  if (
    !step ||
    step.from !== operation.state ||
    !journalPlanTargets(step).includes(toState)
  ) {
    refuse("journal_plan_step_mismatch");
  }
  // A cancellation is not a reconciliation and has no resume target (R-162):
  // without this exception a real `blocked` row was refused here even after
  // `TRANSITIONS.blocked` admitted `cancelled`.
  if (
    operation.state === "blocked" &&
    toState !== "cancelled" &&
    operation.blockedResumeState !== toState
  ) {
    refuse("blocked_reconciliation_target_mismatch");
  }
  if (
    operation.journalIntentPlanDigest !== planDigest ||
    operation.journalIntentBaseVersion === null ||
    operation.journalIntentEffectiveAt === null ||
    operation.journalIntentBaseVersion + options.planIndex !== operation.journalVersion ||
    options.planIndex < 0 ||
    options.planIndex >= planLength
  ) {
    refuse("journal_plan_binding_mismatch");
  }
  if (options.expiredRecoveryAbandonment) {
    if (
      operation.scope !== "identity" ||
      operation.state !== "journal_pending" ||
      toState !== "cancelled" ||
      options.cancellationReplayDigest !== undefined ||
      options.identityCancellationReceiptExpiresAt !== undefined
    ) {
      refuse("expired_recovery_abandonment_invalid");
    }
  } else {
    if (
      (toState === "cancelled") !==
      (/^[0-9a-f]{64}$/.test(options.cancellationReplayDigest ?? ""))
    ) {
      refuse("cancellation_replay_binding_invalid");
    }
    if (
      toState === "cancelled" &&
      ((operation.scope === "identity") !==
        (options.identityCancellationReceiptExpiresAt instanceof Date))
    ) {
      refuse("identity_cancellation_receipt_binding_invalid");
    }
  }
  if (!/^[0-9a-f]{64}$/.test(operation.requesterDigest)) {
    refuse("journal_requester_digest_missing");
  }
  const version = operation.journalVersion + 1;
  const effectiveAt = new Date(
    operation.journalIntentEffectiveAt.getTime() + options.planIndex
  );
  const request = {
    schemaVersion: 1 as const,
    operationId: operation.id,
    scope: operation.scope,
    target: {
      userId: operation.userId,
      workspaceId: operation.workspaceId,
      profileId: operation.profileId,
    },
    requesterDigest: operation.requesterDigest,
    version,
    fromState: operation.state,
    toState,
    payloadHash: operation.payloadHash,
    priorReceiptDigest: operation.journalReceiptDigest,
    requestedAt: operation.requestedAt,
    effectiveAt,
    retainUntil: new Date(operation.requestedAt.getTime() + DELETION_JOURNAL_RETAIN_MS),
  } as const;
  const receipt = await journal.appendTransition(request);
  if (receipt.outcome !== "confirmed") refuse(`journal_${receipt.outcome}`);
  const sameTarget =
    receipt.target.userId === request.target.userId &&
    receipt.target.workspaceId === request.target.workspaceId &&
    receipt.target.profileId === request.target.profileId;
  const objectReceipt = {
    objectKey: receipt.objectKey,
    objectVersionId: receipt.objectVersionId,
    checksumSha256: receipt.checksumSha256,
  };
  if (
    receipt.schemaVersion !== request.schemaVersion ||
    receipt.operationId !== request.operationId ||
    receipt.scope !== request.scope ||
    !sameTarget ||
    receipt.requesterDigest !== request.requesterDigest ||
    receipt.version !== request.version ||
    receipt.fromState !== request.fromState ||
    receipt.toState !== request.toState ||
    receipt.payloadHash !== request.payloadHash ||
    receipt.priorReceiptDigest !== request.priorReceiptDigest ||
    !(receipt.requestedAt instanceof Date) ||
    !(receipt.effectiveAt instanceof Date) ||
    !(receipt.retainUntil instanceof Date) ||
    receipt.requestedAt.getTime() !== request.requestedAt.getTime() ||
    receipt.effectiveAt.getTime() !== request.effectiveAt.getTime() ||
    receipt.retainUntil.getTime() !== request.retainUntil.getTime() ||
    !/^.{1,1024}$/.test(receipt.objectKey) ||
    !/^.{1,1024}$/.test(receipt.objectVersionId) ||
    receipt.checksumSha256 !== journalRequestChecksum(request) ||
    receipt.receiptDigest !== journalReceiptDigest(request, objectReceipt)
  ) {
    refuse("journal_receipt_mismatch");
  }
  await tx.insert(deletionOperationTransitions).values({
    operationId: operation.id,
    scope: operation.scope,
    targetKey: operation.targetKey,
    userId: operation.userId,
    workspaceId: operation.workspaceId,
    profileId: operation.profileId,
    requesterUserId: operation.requesterUserId,
    requesterDigest: operation.requesterDigest,
    version,
    fromState: operation.state,
    toState,
    payloadHash: operation.payloadHash,
    externalReceiptDigest: receipt.receiptDigest,
  });
  const [updated] = await tx
    .update(deletionOperations)
    .set({
      state: toState,
      blockedResumeState: toState === "blocked" ? operation.state : null,
      stateVersion: operation.stateVersion + 1,
      journalVersion: version,
      journalReceiptDigest: receipt.receiptDigest,
      requestSessionDigest:
        toState === "complete" || toState === "cancelled"
          ? null
          : operation.requestSessionDigest,
      cancellationReplayDigest: options.cancellationReplayDigest ?? null,
      identityCancellationReceiptExpiresAt:
        options.identityCancellationReceiptExpiresAt ?? null,
      recoverySecretDigest: options.expiredRecoveryAbandonment
        ? null
        : operation.recoverySecretDigest,
      recoverySecretPrefix: options.expiredRecoveryAbandonment
        ? null
        : operation.recoverySecretPrefix,
      recoveryConsumedAt: options.expiredRecoveryAbandonment
        ? now
        : operation.recoveryConsumedAt,
      lastFailureCode: options.expiredRecoveryAbandonment
        ? "recovery_expired_before_tombstone"
        : operation.lastFailureCode,
      journalIntentBaseVersion:
        options.planIndex === planLength - 1
          ? null
          : operation.journalIntentBaseVersion,
      journalIntentPlanDigest:
        options.planIndex === planLength - 1 ? null : planDigest,
      journalIntentEffectiveAt:
        options.planIndex === planLength - 1
          ? null
          : operation.journalIntentEffectiveAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(deletionOperations.id, operation.id),
        eq(deletionOperations.state, operation.state),
        eq(deletionOperations.journalVersion, operation.journalVersion),
        eq(deletionOperations.journalIntentPlanDigest, planDigest),
        eq(
          deletionOperations.journalIntentBaseVersion,
          operation.journalIntentBaseVersion
        ),
        eq(
          deletionOperations.journalIntentEffectiveAt,
          operation.journalIntentEffectiveAt
        )
      )
    )
    .returning();
  if (!updated) refuse("concurrent_transition");
  return updated;
}

async function operationByKey(
  tx: TxLike,
  requesterUserId: string,
  scope: DeletionScope,
  key: string
): Promise<DeletionOperation | undefined> {
  const [operation] = await tx
    .select()
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, scope),
        eq(deletionOperations.requesterUserId, requesterUserId),
        eq(deletionOperations.idempotencyKey, key)
      )
    )
    .limit(1);
  return operation;
}

async function activeOperationForTarget(
  tx: TxLike,
  scope: DeletionScope,
  targetId: string
): Promise<DeletionOperation | undefined> {
  const target =
    scope === "identity"
      ? eq(deletionOperations.userId, targetId)
      : scope === "profile"
        ? eq(deletionOperations.profileId, targetId)
        : eq(deletionOperations.workspaceId, targetId);
  const [operation] = await tx
    .select()
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, scope),
        target,
        notInArray(deletionOperations.state, ["complete", "cancelled"])
      )
    )
    .limit(1);
  return operation;
}

function assertSameRequest(
  operation: DeletionOperation,
  payloadHash: string,
  target: { userId?: string; workspaceId?: string; profileId?: string }
): void {
  if (
    operation.payloadHash !== payloadHash ||
    (target.userId !== undefined && operation.userId !== target.userId) ||
    (target.workspaceId !== undefined && operation.workspaceId !== target.workspaceId) ||
    (target.profileId !== undefined && operation.profileId !== target.profileId)
  ) {
    refuse("idempotency_conflict");
  }
}

async function lockIdentityWorkspaces(
  tx: TxLike,
  userId: string
): Promise<readonly string[]> {
  await lockIdentityMembershipGraph(tx, userId);
  const rows = await tx
    .select({ workspaceId: memberships.workspaceId })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  const workspaceIds = sortedWorkspaceIds(rows.map((row) => row.workspaceId));
  for (const workspaceId of workspaceIds) {
    await lockWorkspaceMembershipGraph(tx, workspaceId);
  }
  return workspaceIds;
}

/**
 * Plan C3: the person may not leave while a workspace's Stripe customer still
 * carries their personal details. `billing_contact_user_id` names the owner
 * whose email the customer was created with; NULL is "unknown" (a mapping
 * from before C3), which is refused the same way, because an unknown contact
 * might be this person. The remedy in both cases is one owner action —
 * `acceptBillingContact` — which rewrites the provider copy before it moves
 * the binding. Executed at request AND at every re-read the owner walk makes,
 * beside the last-owner rule, and again by the executor at erasure.
 */
export async function assertBillingContactReleased(
  tx: TxLike,
  userId: string,
  workspaceIds: readonly string[],
  /**
   * Workspaces under (or entering) their own deletion (R-160, the P5-R1
   * cascade). Their Stripe customer's personal fields are cleared by that
   * deletion's own erasing commands, and the identity erasure waits for it
   * (`handleGrace`'s nested-operation hold), so they are not a handover the
   * person could ever perform: for a sole owner there is nobody to hand to.
   */
  excludedWorkspaceIds: readonly string[] = []
): Promise<void> {
  // Two populations, because membership and contact can diverge: a contact
  // who was demoted or who left the workspace is still on the customer object,
  // so the binding is matched by USER regardless of membership; an unknown
  // contact is matched by the workspaces this person is a MEMBER of, in any
  // role — an editor or viewer of a pre-C3 workspace is refused too, because
  // the unknown contact may be a demoted ex-owner, and only an owner can
  // accept (T-R2-5 records the population and the operator remedy).
  const bound =
    excludedWorkspaceIds.length === 0
      ? eq(subscriptions.billingContactUserId, userId)
      : and(
          eq(subscriptions.billingContactUserId, userId),
          notInArray(subscriptions.workspaceId, [...excludedWorkspaceIds])
        );
  const unknownInMembership =
    workspaceIds.length === 0
      ? null
      : and(inArray(subscriptions.workspaceId, [...workspaceIds]), isNull(subscriptions.billingContactUserId));
  const rows = await tx
    .select({
      workspaceId: subscriptions.workspaceId,
      billingContactUserId: subscriptions.billingContactUserId,
    })
    .from(subscriptions)
    .where(unknownInMembership === null ? bound : or(bound, unknownInMembership));
  for (const row of rows) {
    if (row.billingContactUserId === null) refuse("billing_contact_unknown");
    if (row.billingContactUserId === userId) refuse("billing_contact_handover_required");
  }
}

/**
 * The workspaces among `workspaceIds` that already carry a NON-TERMINAL,
 * UNDER-WAY workspace deletion (any state but `complete`/`cancelled`, a
 * reserved `requested` included, an unreserved draft NOT — R-166). A workspace
 * being deleted is not abandoned by its last owner leaving: its own operation
 * decides it (R-160, P5-R1). A draft decides nothing, so a sole-owned
 * workspace carrying one is cascaded, and the cascade adopts the draft
 * (`reserveIdentityCascadeInTx`).
 */
async function workspacesUnderDeletionInTx(
  tx: TxLike,
  workspaceIds: readonly string[]
): Promise<ReadonlySet<string>> {
  if (workspaceIds.length === 0) return new Set();
  const rows = await tx
    .select({ workspaceId: deletionOperations.workspaceId })
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, "workspace"),
        inArray(deletionOperations.workspaceId, [...workspaceIds]),
        notInArray(deletionOperations.state, ["complete", "cancelled"]),
        deletionOperationUnderWay()
      )
    );
  return new Set(rows.flatMap((row) => (row.workspaceId ? [row.workspaceId] : [])));
}

/** The workspaces in `workspaceIds` this person is the only active owner of. */
async function soleOwnedWorkspacesInTx(
  tx: TxLike,
  userId: string,
  workspaceIds: readonly string[]
): Promise<readonly string[]> {
  const sole: string[] = [];
  for (const workspaceId of workspaceIds) {
    const [target] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.lifecycleState, "active")
        )
      )
      .limit(1);
    if (target?.role !== "owner") continue;
    const [{ owners }] = await tx
      .select({ owners: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.role, "owner"),
          eq(memberships.lifecycleState, "active")
        )
      );
    if (owners <= 1) sole.push(workspaceId);
  }
  return sole;
}

/**
 * The release rules every identity path asserts, in two modes (R-160, P5-R1).
 *
 * `cascade` (request, reservation, resume): a workspace this person is the
 * last owner of is NOT a refusal. It is returned, and the reservation
 * cascade-requests its deletion with the identity's (`reserveIdentityCascadeInTx`).
 * Before R-160 it refused `last_owner` and printed a remedy — an operator
 * adding an owner, an owner invitation — that names two surfaces which do not
 * exist, so a solo creator's erasure had no terminating path.
 *
 * `final` (the tombstone transaction): by then every such workspace carries
 * its cascaded operation, so `assertNotLastOwner` excludes it; a sole-owned
 * workspace WITHOUT one is a population that changed after the reservation,
 * and refuses rather than leaving a live workspace with no owner.
 *
 * In both modes the billing-contact rule is asserted over the workspaces that
 * STAY (neither already deleting nor cascading).
 */
async function assertWorkspacesReleasable(
  tx: TxLike,
  userId: string,
  workspaceIds: readonly string[],
  mode: "cascade" | "final"
): Promise<readonly string[]> {
  const deleting = await workspacesUnderDeletionInTx(tx, workspaceIds);
  const kept = workspaceIds.filter((workspaceId) => !deleting.has(workspaceId));
  const cascade =
    mode === "final"
      ? (await assertNotLastOwner(tx, userId, workspaceIds), [])
      : await soleOwnedWorkspacesInTx(tx, userId, kept);
  const staying = kept.filter((workspaceId) => !cascade.includes(workspaceId));
  await assertBillingContactReleased(tx, userId, staying, [...deleting, ...cascade]);
  return cascade;
}

/**
 * Refuses when this person is the last active owner of a workspace that is
 * NOT already under a non-terminal deletion (R-160, P5-R1). The population
 * excludes deleting workspaces: before R-160 it did not, so a workspace that
 * was itself being deleted still refused its owner's erasure.
 */
async function assertNotLastOwner(
  tx: TxLike,
  userId: string,
  workspaceIds: readonly string[]
): Promise<void> {
  const deleting = await workspacesUnderDeletionInTx(tx, workspaceIds);
  const sole = await soleOwnedWorkspacesInTx(
    tx,
    userId,
    workspaceIds.filter((workspaceId) => !deleting.has(workspaceId))
  );
  if (sole.length > 0) refuse("last_owner");
}

/**
 * The idempotency-key prefix of a cascaded workspace deletion. A NAME only:
 * which identity cascaded a row is the server-owned
 * `cascade_parent_operation_id` (R-166), and a client key carrying this prefix
 * is refused (`requestScopedDeletion`), so no client can mint a key that reads
 * as a cascade.
 */
export const IDENTITY_CASCADE_KEY_PREFIX = "identity-cascade:";

function identityCascadeKey(identityOperationId: string, workspaceId: string): string {
  return `${IDENTITY_CASCADE_KEY_PREFIX}${identityOperationId}:${workspaceId}`;
}

/**
 * Reserve one workspace deletion per sole-owned workspace, in the SAME
 * transaction that reserves the identity's own journal plan (R-160, P5-R1).
 *
 * Each row is created already RESERVED — its `requested -> journal_pending ->
 * tombstoned` plan digest and effective instant persisted before any journal
 * append — which is the property `prepareJournalPlan` exists for: a rollback
 * after an object-store write retries the exact same bytes. The identity's
 * reservation is the commit point for both, so the tombstone transaction
 * (`finalizeIdentityDeletionRequest`) finalizes these in-transaction. The
 * worker's wedge sweep (`resumeWedgedDeletionOperations`) finishes a wedged
 * pair by resuming the IDENTITY, and skips a cascaded row on its own.
 *
 * The authority is the identity request's: the same requester, the same
 * session digest, and the owner membership's live epochs, bound into the
 * scoped plan exactly as `requestScopedDeletion` binds them. The typed-name
 * confirmation is replaced by the cascade key, which names both operations.
 */
async function reserveIdentityCascadeInTx(
  tx: TxLike,
  identity: DeletionOperation,
  workspaceIds: readonly string[],
  now: Date
): Promise<void> {
  if (!identity.userId || identity.scope !== "identity" || !identity.requestSessionDigest) {
    refuse("cascade_identity_invalid");
  }
  for (const workspaceId of workspaceIds) {
    const [owner] = await tx
      .select({
        membershipVersion: memberships.version,
        workspaceLifecycleVersion: workspaces.lifecycleVersion,
      })
      .from(memberships)
      .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
      .where(
        and(
          eq(memberships.userId, identity.userId),
          eq(memberships.workspaceId, workspaceId),
          eq(memberships.role, "owner"),
          eq(memberships.lifecycleState, "active"),
          eq(workspaces.lifecycleState, "active")
        )
      )
      .limit(1);
    if (!owner) refuse("cascade_owner_changed");
    const idempotencyKey = identityCascadeKey(identity.id, workspaceId);
    // R-166 (gate H2): an UNRESERVED draft on this workspace is ADOPTED — it
    // has no externally visible transition, so the cascade rebinds it in place
    // (as `requestScopedDeletion` rebinds a draft), keeping its id. Inserting
    // beside it would violate `deletion_operations_active_workspace_target_uq`;
    // skipping the workspace would leave it sole-owned with no operation. A
    // RESERVED operation here is impossible by construction
    // (`workspacesUnderDeletionInTx` excluded it from the cascade) and refuses.
    const existing = await activeOperationForTarget(tx, "workspace", workspaceId);
    if (
      existing &&
      (existing.state !== "requested" ||
        existing.journalIntentPlanDigest !== null ||
        existing.journalIntentBaseVersion !== null ||
        existing.journalIntentEffectiveAt !== null)
    ) {
      refuse("cascade_target_conflict");
    }
    // The id is bound into the plan digest: an adoption keeps the draft's.
    const draft = {
      id: existing?.id ?? randomUUID(),
      scope: "workspace" as const,
      targetKey: targetKey("workspace", { workspaceId }),
      workspaceId,
      profileId: null,
      profilePriorState: null,
      requesterUserId: identity.userId,
      requesterDigest: requesterDigest(identity.userId),
      requestSessionDigest: identity.requestSessionDigest,
      requestMembershipVersion: owner.membershipVersion,
      requestWorkspaceLifecycleVersion: owner.workspaceLifecycleVersion,
      requestProfileLifecycleVersion: null,
      idempotencyKey,
      payloadHash: requestHash("workspace", workspaceId, idempotencyKey),
    };
    const reserved = {
      ...draft,
      cascadeParentOperationId: identity.id,
      requestedAt: now,
      journalIntentBaseVersion: 0,
      journalIntentPlanDigest: journalPlanDigest(
        REQUEST_TOMBSTONE_STEPS,
        scopedRequestAuthorityBinding(draft)
      ),
      journalIntentEffectiveAt: now,
    };
    if (!existing) {
      await tx.insert(deletionOperations).values(reserved);
      continue;
    }
    // `reserved.id` IS `existing.id`, so the SET leaves the key unchanged.
    const [adopted] = await tx
      .update(deletionOperations)
      .set({ ...reserved, updatedAt: now })
      .where(
        and(
          eq(deletionOperations.id, existing.id),
          eq(deletionOperations.state, "requested"),
          isNull(deletionOperations.journalIntentPlanDigest),
          isNull(deletionOperations.journalIntentBaseVersion),
          isNull(deletionOperations.journalIntentEffectiveAt)
        )
      )
      .returning({ id: deletionOperations.id });
    if (!adopted) refuse("cascade_target_conflict");
  }
}

/**
 * THE CASCADE, RE-MEASURED before the tombstone transaction (R-160). A
 * co-owner can leave a workspace between the identity's reservation and its
 * tombstone; that workspace is then sole-owned and not in the cascade the
 * reservation wrote. Without this the tombstone transaction refused
 * `last_owner` on every replay — a reserved request no retry could finish.
 * Its own committed transaction, under the identity's graph locks, so the
 * cascaded rows are reserved before any journal append (`prepareJournalPlan`'s
 * rule). A no-op once the identity has left `requested`, and while its
 * recovery window has expired (that request is abandoned, not cascaded).
 */
async function topUpIdentityCascade(db: DbLike, operationId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1);
    if (!snapshot?.userId || snapshot.scope !== "identity" || snapshot.state !== "requested") return;
    const workspaceIds = await lockIdentityWorkspaces(tx, snapshot.userId);
    const [current] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1);
    if (!current?.userId || current.state !== "requested" || current.journalIntentPlanDigest === null) return;
    const now = await databaseNow(tx);
    if (!current.recoveryExpiresAt || current.recoveryExpiresAt.getTime() <= now.getTime()) return;
    const cascade = await assertWorkspacesReleasable(tx, current.userId, workspaceIds, "cascade");
    await reserveIdentityCascadeInTx(tx, current, cascade, now);
  });
}

/**
 * This identity operation's cascaded workspace deletions still in `requested`,
 * by the server-owned parent column (R-166) — never by a key pattern.
 */
async function pendingIdentityCascadeInTx(
  tx: TxLike,
  identity: DeletionOperation
): Promise<readonly DeletionOperation[]> {
  if (!identity.userId) return [];
  return tx
    .select()
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, "workspace"),
        eq(deletionOperations.requesterUserId, identity.userId),
        eq(deletionOperations.cascadeParentOperationId, identity.id),
        eq(deletionOperations.state, "requested")
      )
    )
    .orderBy(asc(deletionOperations.workspaceId));
}

/**
 * The operations an owner page may list for a scope: every non-terminal
 * operation on this workspace, on this user, or REQUESTED by this user. Lives
 * HERE, beside the rules that write those rows, rather than as a raw read in
 * the app facade, so the one module that owns `deletion_operations` semantics
 * also owns what "pending" means (10b-1 phase review, tenancy item). The cage
 * (AC-13) runs first: a forged scope is refused before its ids are read.
 *
 * THREE ARMS (R-161, P5-R2). The `userId` arm sees identity operations only —
 * a scoped operation's `user_id` is NULL by schema constraint
 * (`deletion_operations_target_shape`). So a scoped deletion is reachable by
 * its `workspaceId` arm alone, and while bootstrap minted a replacement
 * workspace the moment the original was tombstoned, the deletion vanished
 * from the only page that can cancel it. The `requesterUserId` arm keeps the
 * person's own requests visible whichever workspace the page is showing.
 *
 * Accepts the READ grade (`assertReadScoped`, R-163): during a workspace
 * deletion's grace the only scope its owner can hold is a
 * `ReadGradeWorkspaceScope`, and this is the read that shows them the
 * deletion they can cancel.
 */
export async function pendingDeletionsForScope(
  db: DbLike,
  scope: WorkspaceScope | ReadGradeWorkspaceScope
): Promise<readonly DeletionOperation[]> {
  // Deliberately visible to EVERY member of the workspace, not only owners: a
  // pending workspace or profile deletion changes what every member can do,
  // and the page renders only id, scope, state and dates — no profile name,
  // no requester.
  assertReadScoped(scope);
  return db
    .select()
    .from(deletionOperations)
    .where(
      and(
        or(
          eq(deletionOperations.workspaceId, scope.workspaceId),
          eq(deletionOperations.userId, scope.userId),
          eq(deletionOperations.requesterUserId, scope.userId)
        ),
        inArray(deletionOperations.state, PENDING_DELETION_STATES)
      )
    )
    .orderBy(desc(deletionOperations.requestedAt));
}

/** Every state a listed operation can still be in; terminal states are not "pending". */
export const PENDING_DELETION_STATES = [
  "requested",
  "journal_pending",
  "tombstoned",
  "external_actions_pending",
  "grace",
  "erasing",
  "verifying",
  "blocked",
] as const satisfies readonly DeletionOperationState[];

export type RequestIdentityDeletionParams = Readonly<{
  sessionId: string;
  idempotencyKey: string;
  reauthMaxAgeMs?: number;
}>;

export type IdentityDeletionRequestResult = Readonly<{
  operation: DeletionOperation;
  acknowledged: boolean;
  delivery: "pending" | "confirmed" | "failed" | "unknown";
}>;

async function finalizeIdentityDeletionRequest(
  db: DbLike,
  operationId: string,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  return db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1);
    if (!snapshot?.userId || snapshot.scope !== "identity") {
      refuse("operation_not_available");
    }
    if (snapshot.state !== "requested") {
      return snapshot;
    }

    const userId = snapshot.userId;
    const workspaceIds = await lockIdentityWorkspaces(tx, userId);
    const [current] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1);
    if (!current?.userId || current.scope !== "identity" || current.userId !== userId) {
      refuse("operation_not_found");
    }
    if (current.state !== "requested") {
      return current;
    }

    const now = await databaseNow(tx);
    const [identity] = await tx
      .select({ state: users.lifecycleState, authUserId: users.authUserId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!identity || identity.state !== "active") refuse("identity_not_active");
    if (!current.recoveryExpiresAt) refuse("recovery_expiry_missing");
    const recoveryExpired = current.recoveryExpiresAt.getTime() <= now.getTime();
    if (!recoveryExpired) {
      if (
        current.recoveryDeliveryStatus !== "confirmed" ||
        !current.recoveryDeliveryReceiptDigest
      ) {
        refuse("recovery_not_confirmed");
      }
    }

    const authorityBindingDigest = identityRequestAuthorityBinding(current);
    const planDigest = journalPlanDigest(
      IDENTITY_REQUEST_STEPS,
      authorityBindingDigest
    );
    if (!hasExactJournalReservation(current, planDigest)) {
      refuse("request_reservation_changed");
    }
    if (!recoveryExpired) {
      await assertWorkspacesReleasable(tx, userId, workspaceIds, "final");
    }
    const activeForTarget = await activeOperationForTarget(tx, "identity", userId);
    if (!activeForTarget || activeForTarget.id !== current.id) {
      refuse("active_identity_operation_conflict");
    }
    // The cascade (R-160): every workspace this person was the last owner of
    // was reserved for deletion beside this identity's plan. It tombstones in
    // THIS transaction, so the identity never tombstones while one of its
    // sole-owned workspaces is still live. On the expired-recovery
    // abandonment below the identity is cancelled instead, and its cascade —
    // reserved, never journalled — is discarded with it.
    const cascade = await pendingIdentityCascadeInTx(tx, current);
    if (recoveryExpired) {
      for (const operation of cascade) {
        if (operation.journalVersion !== 0) refuse("cascade_already_journalled");
        await tx.delete(deletionOperations).where(
          and(
            eq(deletionOperations.id, operation.id),
            eq(deletionOperations.state, "requested"),
            eq(deletionOperations.journalVersion, 0)
          )
        );
      }
    } else {
      for (const operation of cascade) {
        await finalizeScopedDeletionRequestInTx(tx, operation, journal);
      }
    }

    let advanced = await appendJournalTransitionInTx(
      tx,
      current,
      "journal_pending",
      journal,
      now,
      {
        steps: IDENTITY_REQUEST_STEPS,
        authorityBindingDigest,
        planIndex: 0,
      }
    );
    if (recoveryExpired) {
      return appendJournalTransitionInTx(
        tx,
        advanced,
        "cancelled",
        journal,
        now,
        {
          steps: IDENTITY_REQUEST_STEPS,
          authorityBindingDigest,
          planIndex: 1,
          expiredRecoveryAbandonment: true,
        }
      );
    }
    advanced = await appendJournalTransitionInTx(
      tx,
      advanced,
      "tombstoned",
      journal,
      now,
      {
        steps: IDENTITY_REQUEST_STEPS,
        authorityBindingDigest,
        planIndex: 1,
      }
    );

    const currentMemberships = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.lifecycleState, "active")
        )
      );
    if (currentMemberships.length > 0) {
      await tx.insert(deletionMembershipSnapshots).values(
        currentMemberships.map((membership) => ({
          operationId: current.id,
          userId,
          membershipId: membership.id,
          workspaceId: membership.workspaceId,
          role: membership.role,
          membershipVersion: membership.version,
        }))
      );
      for (const membership of currentMemberships) {
        const [suspended] = await tx
          .update(memberships)
          .set({
            lifecycleState: "deletion_suspended",
            suspendedRole: membership.role,
            suspendedVersion: membership.version,
            suspensionOperationId: current.id,
            version: membership.version + 1,
          })
          .where(
            and(
              eq(memberships.id, membership.id),
              eq(memberships.version, membership.version),
              eq(memberships.lifecycleState, "active")
            )
          )
          .returning({ id: memberships.id });
        if (!suspended) refuse("membership_changed_while_suspending");
      }
    }
    const [tombstonedIdentity] = await tx
      .update(users)
      .set({ lifecycleState: "tombstoned", updatedAt: now })
      .where(and(eq(users.id, userId), eq(users.lifecycleState, "active")))
      .returning({ id: users.id });
    if (!tombstonedIdentity) refuse("identity_changed_while_tombstoning");
    const [disabledLogin] = await tx
      .update(authUser)
      .set({ ordinaryLoginDisabledAt: now, updatedAt: now })
      .where(eq(authUser.id, identity.authUserId))
      .returning({ id: authUser.id });
    if (!disabledLogin) refuse("auth_identity_not_found");
    await tx.delete(session).where(eq(session.userId, identity.authUserId));
    const [acknowledged] = await tx
      .update(deletionOperations)
      .set({
        acknowledgedAt: now,
        tombstonedAt: now,
        graceExpiresAt: current.recoveryExpiresAt,
        updatedAt: now,
      })
      .where(eq(deletionOperations.id, advanced.id))
      .returning();
    if (!acknowledged) refuse("operation_acknowledgement_conflict");
    return acknowledged;
  });
}

function identityDeletionRequestResult(
  operation: DeletionOperation
): IdentityDeletionRequestResult {
  const expiredAbandonment =
    operation.state === "cancelled" &&
    operation.cancellationReplayDigest === null &&
    operation.identityCancellationReceiptExpiresAt === null;
  if (
    operation.state !== "requested" &&
    operation.recoveryDeliveryStatus !== "confirmed" &&
    !expiredAbandonment
  ) {
    refuse("advanced_without_confirmed_recovery_delivery");
  }
  return {
    operation,
    acknowledged: operation.acknowledgedAt !== null,
    delivery:
      operation.recoveryDeliveryStatus === "not_required"
        ? refuse("identity_recovery_delivery_status_invalid")
        : operation.recoveryDeliveryStatus,
  };
}

async function reserveIdentityDeletionRequest(
  db: DbLike,
  operationId: string,
  sessionAuthority?: Readonly<{ sessionId: string; reauthMaxAgeMs?: number }>
): Promise<void> {
  const [snapshot] = await db
    .select()
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  if (!snapshot?.userId || snapshot.scope !== "identity") {
    refuse("operation_not_available");
  }
  if (snapshot.state !== "requested") return;
  const authorityBindingDigest = identityRequestAuthorityBinding(snapshot);
  await prepareJournalPlan(db, snapshot.id, IDENTITY_REQUEST_STEPS, {
    authorityBindingDigest,
    beforeReserve: async (tx, planDigest) => {
      if (await hasReservedJournalPlan(tx, snapshot.id, planDigest)) return;
      const workspaceIds = await lockIdentityWorkspaces(tx, snapshot.userId!);
      const now = await databaseNow(tx);
      let cascade: readonly string[] = [];
      const [current] = await tx
        .select()
        .from(deletionOperations)
        .where(eq(deletionOperations.id, snapshot.id))
        .limit(1);
      if (
        !current ||
        current.scope !== "identity" ||
        current.userId !== snapshot.userId
      ) {
        refuse("operation_not_found");
      }
      const [identity] = await tx
        .select({ state: users.lifecycleState })
        .from(users)
        .where(eq(users.id, snapshot.userId!))
        .limit(1);
      if (!identity || identity.state !== "active") refuse("identity_not_active");
      if (identityRequestAuthorityBinding(current) !== authorityBindingDigest) {
        refuse("request_authority_binding_invalid");
      }
      if (!current.recoveryExpiresAt) refuse("recovery_expiry_missing");
      if (current.recoveryExpiresAt.getTime() > now.getTime()) {
        if (sessionAuthority) {
          if (current.requestSessionDigest !== digest(sessionAuthority.sessionId)) {
            refuse("request_session_mismatch");
          }
          const proof = await requireReauthenticatedSession(
            tx,
            sessionAuthority.sessionId,
            now,
            sessionAuthority.reauthMaxAgeMs,
            snapshot.userId!
          );
          if (proof.userId !== snapshot.userId) {
            refuse("identity_changed_while_locking");
          }
        }
        if (
          current.recoveryDeliveryStatus !== "confirmed" ||
          !current.recoveryDeliveryReceiptDigest
        ) {
          refuse("recovery_not_confirmed");
        }
        cascade = await assertWorkspacesReleasable(
          tx,
          snapshot.userId!,
          workspaceIds,
          "cascade"
        );
      }
      const activeForTarget = await activeOperationForTarget(
        tx,
        "identity",
        snapshot.userId!
      );
      if (!activeForTarget || activeForTarget.id !== current.id) {
        refuse("active_identity_operation_conflict");
      }
      // Reserved in the same transaction as the identity's own plan, so the
      // two commit points are one (R-160).
      await reserveIdentityCascadeInTx(tx, current, cascade, now);
    },
  });
}

async function persistReconciledIdentityRecovery(
  db: DbLike,
  prepared: DeletionOperation,
  request: RecoveryDeliveryReconciliationRequest,
  delivery: RecoveryDeliveryResult
): Promise<DeletionOperation> {
  if (
    delivery.outcome === "unknown" &&
    !/^[0-9a-f]{64}$/.test(delivery.reconciliationDigest)
  ) {
    refuse("delivery_reconciliation_digest_invalid");
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, prepared.id))
      .limit(1)
      .for("update");
    if (
      !current ||
      current.scope !== "identity" ||
      current.userId !== prepared.userId ||
      current.recoveryDeliveryCommandId !== request.commandId ||
      current.recoveryDeliveryAttempt !== request.attempt
    ) {
      refuse("concurrent_delivery_attempt");
    }
    if (current.state !== "requested") return current;
    const hasAnyReservation =
      current.journalIntentPlanDigest !== null ||
      current.journalIntentBaseVersion !== null ||
      current.journalIntentEffectiveAt !== null;
    if (hasAnyReservation) {
      const expectedPlanDigest = journalPlanDigest(
        IDENTITY_REQUEST_STEPS,
        identityRequestAuthorityBinding(current)
      );
      if (!hasExactJournalReservation(current, expectedPlanDigest)) {
        refuse("request_reservation_changed");
      }
      return current;
    }
    if (delivery.outcome === "confirmed") {
      const now = await databaseNow(tx);
      // ONE CODE PER CONDITION. This was a single `delivery_receipt_mismatch`
      // covering thirteen distinct checks, so a refusal said nothing about which
      // invariant failed -- and when the Docker suites first ran together and
      // this started refusing under load, the code could not tell an identity
      // mismatch from a clock ordering problem. Every code below is
      // content-free: a condition name, never a value.
      const mismatch = deliveryReceiptMismatchCode(delivery, request, current, now);
      if (mismatch !== null) refuse(mismatch);
      if (current.recoveryDeliveryStatus === "confirmed") {
        if (current.recoveryDeliveryReceiptDigest !== delivery.deliveryReceiptDigest) {
          refuse("concurrent_delivery_attempt");
        }
        return current;
      }
      if (current.recoveryDeliveryStatus !== prepared.recoveryDeliveryStatus) {
        refuse("concurrent_delivery_attempt");
      }
      const [confirmed] = await tx
        .update(deletionOperations)
        .set({
          recoveryDeliveryStatus: "confirmed",
          recoveryDeliveredAt: delivery.deliveredAt,
          recoveryDeliveryReceiptDigest: delivery.deliveryReceiptDigest,
          recoveryDeliveryReconciliationDigest: null,
          lastFailureCode: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(deletionOperations.id, current.id),
            eq(deletionOperations.state, "requested"),
            eq(deletionOperations.recoveryDeliveryCommandId, request.commandId),
            eq(deletionOperations.recoveryDeliveryAttempt, request.attempt),
            eq(deletionOperations.recoveryDeliveryStatus, current.recoveryDeliveryStatus),
            isNull(deletionOperations.journalIntentPlanDigest),
            isNull(deletionOperations.journalIntentBaseVersion),
            isNull(deletionOperations.journalIntentEffectiveAt)
          )
        )
        .returning();
      if (!confirmed) refuse("concurrent_delivery_attempt");
      return confirmed;
    }
    if (current.recoveryDeliveryStatus === "confirmed") return current;
    if (current.recoveryDeliveryStatus !== prepared.recoveryDeliveryStatus) {
      refuse("concurrent_delivery_attempt");
    }
    const [updated] = await tx
      .update(deletionOperations)
      .set({
        recoveryDeliveryStatus: delivery.outcome,
        recoveryDeliveryReconciliationDigest:
          delivery.outcome === "unknown" ? delivery.reconciliationDigest : null,
        lastFailureCode:
          delivery.outcome === "failed"
            ? `delivery_${delivery.failureCode}`
            : "delivery_unknown",
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(deletionOperations.id, current.id),
          eq(deletionOperations.state, "requested"),
          eq(deletionOperations.recoveryDeliveryCommandId, request.commandId),
          eq(deletionOperations.recoveryDeliveryAttempt, request.attempt),
          eq(deletionOperations.recoveryDeliveryStatus, current.recoveryDeliveryStatus),
          isNull(deletionOperations.journalIntentPlanDigest),
          isNull(deletionOperations.journalIntentBaseVersion),
          isNull(deletionOperations.journalIntentEffectiveAt)
        )
      )
      .returning();
    if (!updated) refuse("concurrent_delivery_attempt");
    return updated;
  });
}

export async function requestIdentityDeletion(
  db: DbLike,
  params: RequestIdentityDeletionParams,
  ports: Readonly<{
    recoveryDelivery: RecoveryDeliveryPort;
    journal: DeletionJournalPort;
    /**
     * Task 7 / R-121: the two audited deployment id sets, captured INTO the
     * request so the contribution is final before memberships suspend or the
     * config changes. Production (Task 8's owner action) passes
     * `resolveActivationExclusions(process.env)`.
     *
     * REQUIRED, with no default -- see the note on
     * `DeletionExecutorOptions.activationExclusions` for why an empty default
     * made the C4 refusal vacuously satisfied.
     */
    activationExclusions: ActivationExclusions;
  }>
): Promise<IdentityDeletionRequestResult> {
  const activationExclusions = ports.activationExclusions;
  if (!validKey(params.idempotencyKey)) refuse("invalid_idempotency_key");
  let plaintext: string | null = null;
  let actingAuthUserId: string | null = null;
  let preparedRecoveryExpired = false;
  let prepared = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const sessionDigest = digest(params.sessionId);
    const [reservedReplay] = await tx
      .select()
      .from(deletionOperations)
      .where(
        and(
          eq(deletionOperations.scope, "identity"),
          eq(deletionOperations.idempotencyKey, params.idempotencyKey),
          eq(deletionOperations.requestSessionDigest, sessionDigest),
          eq(deletionOperations.state, "requested")
        )
      )
      .limit(1);
    if (reservedReplay && reservedReplay.journalIntentPlanDigest !== null) {
      const expectedPlanDigest = journalPlanDigest(
        IDENTITY_REQUEST_STEPS,
        identityRequestAuthorityBinding(reservedReplay)
      );
      if (!hasExactJournalReservation(reservedReplay, expectedPlanDigest)) {
        refuse("request_reservation_changed");
      }
      if (!reservedReplay.recoveryExpiresAt) refuse("recovery_expiry_missing");
      preparedRecoveryExpired =
        reservedReplay.recoveryExpiresAt.getTime() <= now.getTime();
      if (
        !preparedRecoveryExpired &&
        (reservedReplay.recoveryDeliveryStatus !== "confirmed" ||
          !reservedReplay.recoveryDeliveryReceiptDigest)
      ) {
        refuse("recovery_not_confirmed");
      }
      return reservedReplay;
    }
    const [advancedReplay] = await tx
      .select()
      .from(deletionOperations)
      .where(
        and(
          eq(deletionOperations.scope, "identity"),
          eq(deletionOperations.idempotencyKey, params.idempotencyKey),
          eq(deletionOperations.requestSessionDigest, sessionDigest),
          notInArray(deletionOperations.state, ["requested"])
        )
      )
      .limit(1);
    if (advancedReplay) return advancedReplay;
    const proof = await requireReauthenticatedSession(
      tx,
      params.sessionId,
      now,
      params.reauthMaxAgeMs
    );
    actingAuthUserId = proof.authUserId;
    const [identity] = await tx
      .select({ id: users.id, authUserId: users.authUserId, state: users.lifecycleState })
      .from(users)
      .where(eq(users.id, proof.userId))
      .limit(1);
    if (!identity) refuse("identity_not_found");
    const payloadHash = requestHash("identity", identity.id);
    const replay = await operationByKey(
      tx,
      identity.id,
      "identity",
      params.idempotencyKey
    );
    if (replay && replay.state !== "requested") {
      assertSameRequest(replay, payloadHash, { userId: identity.id });
      if (
        replay.state !== "cancelled" &&
        replay.state !== "complete" &&
        replay.requestSessionDigest !== digest(params.sessionId)
      ) {
        refuse("request_session_mismatch");
      }
      return replay;
    }
    const workspaceIds = await lockIdentityWorkspaces(tx, identity.id);
    const [lockedIdentity] = await tx
      .select({ state: users.lifecycleState })
      .from(users)
      .where(eq(users.id, identity.id))
      .limit(1);
    if (!lockedIdentity || lockedIdentity.state !== "active") refuse("identity_not_active");
    const byKey = await operationByKey(
      tx,
      identity.id,
      "identity",
      params.idempotencyKey
    );
    const byTarget = await activeOperationForTarget(tx, "identity", identity.id);
    if (byKey && byTarget && byKey.id !== byTarget.id) refuse("idempotency_conflict");
    let existing = byKey ?? byTarget;
    if (existing) {
      assertSameRequest(existing, payloadHash, { userId: identity.id });
      if (existing.requestSessionDigest !== digest(params.sessionId)) {
        if (
          existing.state !== "requested" ||
          existing.journalIntentPlanDigest !== null ||
          existing.journalIntentBaseVersion !== null ||
          existing.journalIntentEffectiveAt !== null
        ) {
          refuse("request_session_mismatch");
        }
        const [rebound] = await tx
          .update(deletionOperations)
          .set({
            requestSessionDigest: digest(params.sessionId),
            updatedAt: now,
          })
          .where(
            and(
              eq(deletionOperations.id, existing.id),
              eq(deletionOperations.state, "requested"),
              eq(deletionOperations.requestSessionDigest, existing.requestSessionDigest!),
              isNull(deletionOperations.journalIntentPlanDigest),
              isNull(deletionOperations.journalIntentBaseVersion),
              isNull(deletionOperations.journalIntentEffectiveAt)
            )
          )
          .returning();
        if (!rebound) refuse("request_session_rebind_conflict");
        existing = rebound;
      }
      if (existing.state !== "requested") return existing;
      if (!existing.recoveryExpiresAt) refuse("recovery_expiry_missing");
      preparedRecoveryExpired = existing.recoveryExpiresAt.getTime() <= now.getTime();
      if (preparedRecoveryExpired) return existing;
      if (
        existing.recoveryDeliveryStatus === "confirmed" ||
        existing.recoveryDeliveryStatus === "pending" ||
        existing.recoveryDeliveryStatus === "unknown"
      ) {
        await assertWorkspacesReleasable(tx, identity.id, workspaceIds, "cascade");
        return existing;
      }
    }
    await assertWorkspacesReleasable(tx, identity.id, workspaceIds, "cascade");
    plaintext = randomBytes(32).toString("base64url");
    if (!validRecoverySecret(plaintext)) refuse("recovery_secret_invalid_format");
    const attempt = (existing?.recoveryDeliveryAttempt ?? 0) + 1;
    const values = {
      recoverySecretDigest: digest(plaintext),
      recoverySecretPrefix: plaintext.slice(0, 8),
      recoveryDeliveryStatus: "pending" as const,
      recoveryDeliveryAttempt: attempt,
      recoveryDeliveryCommandId: randomUUID(),
      recoveryDeliveryRecipientDigest: digest(proof.authUserId),
      recoveryDeliveryReceiptDigest: null,
      recoveryDeliveryReconciliationDigest: null,
      recoveryDeliveryAttemptedAt: now,
      recoveryDeliveredAt: null,
      lastFailureCode: null,
    };
    if (existing) {
      // A delivery-retry rotation mints a NEW single-use link, so its expiry
      // restarts with it (R-162, P5-R6) — the way the scoped path's rebind
      // restarts `requestedAt`. Before, the rotation set
      // `recoveryDeliveryAttemptedAt` and left `recoveryExpiresAt` at the first
      // attempt's clock, so a retried email arrived with days already gone
      // from its seven-day window. Safe to move: no journal plan is reserved
      // while delivery has failed (asserted in the predicate below), and the
      // reservation is what binds `recoveryExpiresAt`.
      const [rotated] = await tx
        .update(deletionOperations)
        .set({ ...values, recoveryExpiresAt: new Date(now.getTime() + DELETION_GRACE_MS) })
        .where(
          and(
            eq(deletionOperations.id, existing.id),
            eq(deletionOperations.state, "requested"),
            eq(deletionOperations.recoveryDeliveryStatus, "failed"),
            eq(deletionOperations.recoveryDeliveryAttempt, existing.recoveryDeliveryAttempt),
            isNull(deletionOperations.journalIntentPlanDigest)
          )
        )
        .returning();
      if (!rotated) refuse("concurrent_transition");
      return rotated;
    }
    // Task 7: capture the activation contribution NOW — memberships are still
    // active and no config set has changed — keyed to the operation id we are
    // about to mint, so the hash cannot be replayed under another operation.
    const operationId = randomUUID();
    const activation = await captureActivationContributionInTx(tx, operationId, identity.id, activationExclusions);
    const [created] = await tx
      .insert(deletionOperations)
      .values({
        id: operationId,
        ...activation,
        scope: "identity",
        targetKey: targetKey("identity", { userId: identity.id }),
        userId: identity.id,
        requesterUserId: identity.id,
        requesterDigest: requesterDigest(identity.id),
        requestSessionDigest: digest(params.sessionId),
        idempotencyKey: params.idempotencyKey,
        payloadHash,
        recoveryExpiresAt: new Date(now.getTime() + DELETION_GRACE_MS),
        ...values,
      })
      .returning();
    return created;
  });

  if (prepared.state !== "requested") {
    const expiredAbandonment =
      prepared.state === "cancelled" &&
      prepared.cancellationReplayDigest === null &&
      prepared.identityCancellationReceiptExpiresAt === null;
    if (prepared.recoveryDeliveryStatus !== "confirmed" && !expiredAbandonment) {
      refuse("advanced_without_confirmed_recovery_delivery");
    }
    return {
      operation: prepared,
      acknowledged: prepared.acknowledgedAt !== null,
      delivery:
        prepared.recoveryDeliveryStatus === "not_required"
          ? refuse("identity_recovery_delivery_status_invalid")
          : prepared.recoveryDeliveryStatus,
    };
  }
  if (!preparedRecoveryExpired && prepared.recoveryDeliveryStatus !== "confirmed") {
    if (
      !prepared.recoveryDeliveryCommandId ||
      !prepared.recoveryDeliveryRecipientDigest ||
      !prepared.recoverySecretDigest ||
      !prepared.recoverySecretPrefix ||
      !prepared.recoveryExpiresAt
    ) {
      refuse("recovery_delivery_attempt_incomplete");
    }
    const deliveryRequest = {
      operationId: prepared.id,
      commandId: prepared.recoveryDeliveryCommandId,
      attempt: prepared.recoveryDeliveryAttempt,
      authUserId: actingAuthUserId ?? refuse("recovery_recipient_unavailable"),
      secretDigest: prepared.recoverySecretDigest,
      secretPrefix: prepared.recoverySecretPrefix!,
      recipientDigest: prepared.recoveryDeliveryRecipientDigest,
      expiresAt: prepared.recoveryExpiresAt!,
    } as const;
    const delivery =
      prepared.recoveryDeliveryStatus === "pending" && plaintext
        ? await ports.recoveryDelivery.deliverIdentityRecovery({
            ...deliveryRequest,
            secret: plaintext,
          })
        : await ports.recoveryDelivery.reconcileIdentityRecovery(deliveryRequest);
    plaintext = null;
    if (delivery.outcome !== "confirmed") {
      if (
        delivery.outcome === "unknown" &&
        !/^[0-9a-f]{64}$/.test(delivery.reconciliationDigest)
      ) {
        refuse("delivery_reconciliation_digest_invalid");
      }
      const [operation] = await db
        .update(deletionOperations)
        .set({
          recoveryDeliveryStatus: delivery.outcome,
          recoveryDeliveryReconciliationDigest:
            delivery.outcome === "unknown" ? delivery.reconciliationDigest : null,
          lastFailureCode:
            delivery.outcome === "failed"
              ? `delivery_${delivery.failureCode}`
              : "delivery_unknown",
          updatedAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            eq(deletionOperations.id, prepared.id),
            eq(deletionOperations.state, "requested"),
            eq(deletionOperations.recoveryDeliveryCommandId, deliveryRequest.commandId),
            eq(deletionOperations.recoveryDeliveryAttempt, deliveryRequest.attempt),
            eq(
              deletionOperations.recoveryDeliveryStatus,
              prepared.recoveryDeliveryStatus
            ),
            isNull(deletionOperations.journalIntentPlanDigest),
            isNull(deletionOperations.journalIntentBaseVersion),
            isNull(deletionOperations.journalIntentEffectiveAt)
          )
        )
        .returning();
      if (!operation) {
        const [current] = await db
          .select()
          .from(deletionOperations)
          .where(eq(deletionOperations.id, prepared.id))
          .limit(1);
        if (
          !current ||
          current.recoveryDeliveryCommandId !== deliveryRequest.commandId ||
          current.recoveryDeliveryAttempt !== deliveryRequest.attempt
        ) {
          refuse("concurrent_delivery_attempt");
        }
        if (current.recoveryDeliveryStatus === "confirmed") {
          return {
            operation: current,
            acknowledged: current.acknowledgedAt !== null,
            delivery: "confirmed",
          };
        }
        if (current.recoveryDeliveryStatus !== delivery.outcome) {
          refuse("concurrent_delivery_attempt");
        }
        return {
          operation: current,
          acknowledged: false,
          delivery: delivery.outcome,
        };
      }
      return { operation, acknowledged: false, delivery: delivery.outcome };
    }
    const receiptNow = await db.transaction((tx) => databaseNow(tx));
    // The SAME authority as the request path. This was a second hand-written
    // copy of the same thirteen conditions; two copies of a rule are two rules,
    // and only one of them gets fixed.
    const reconcileMismatch = deliveryReceiptMismatchCode(delivery, deliveryRequest, prepared, receiptNow);
    if (reconcileMismatch !== null) refuse(reconcileMismatch);
    let [confirmed] = await db
      .update(deletionOperations)
      .set({
        recoveryDeliveryStatus: "confirmed",
        recoveryDeliveredAt: delivery.deliveredAt,
        recoveryDeliveryReceiptDigest: delivery.deliveryReceiptDigest,
        recoveryDeliveryReconciliationDigest: null,
        lastFailureCode: null,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(deletionOperations.id, prepared.id),
          eq(deletionOperations.state, "requested"),
          eq(deletionOperations.recoveryDeliveryCommandId, deliveryRequest.commandId),
          eq(deletionOperations.recoveryDeliveryAttempt, deliveryRequest.attempt),
          eq(
            deletionOperations.recoveryDeliveryStatus,
            prepared.recoveryDeliveryStatus
          ),
          isNull(deletionOperations.journalIntentPlanDigest),
          isNull(deletionOperations.journalIntentBaseVersion),
          isNull(deletionOperations.journalIntentEffectiveAt)
        )
      )
      .returning();
    if (!confirmed) {
      const [current] = await db
        .select()
        .from(deletionOperations)
        .where(eq(deletionOperations.id, prepared.id))
        .limit(1);
      if (
        !current ||
        current.recoveryDeliveryCommandId !== deliveryRequest.commandId ||
        current.recoveryDeliveryAttempt !== deliveryRequest.attempt ||
        current.recoveryDeliveryStatus !== "confirmed" ||
        current.recoveryDeliveryReceiptDigest !== delivery.deliveryReceiptDigest
      ) {
        refuse("concurrent_delivery_attempt");
      }
      confirmed = current;
    }
    prepared = confirmed;
  }

  if (prepared.state !== "requested") {
    return {
      operation: prepared,
      acknowledged: prepared.acknowledgedAt !== null,
      delivery: "confirmed",
    };
  }

  await reserveIdentityDeletionRequest(db, prepared.id, {
    sessionId: params.sessionId,
    reauthMaxAgeMs: params.reauthMaxAgeMs,
  });
  await topUpIdentityCascade(db, prepared.id);
  const operation = await finalizeIdentityDeletionRequest(
    db,
    prepared.id,
    ports.journal
  );
  return {
    operation,
    acknowledged: operation.acknowledgedAt !== null,
    delivery:
      operation.state === "cancelled"
        ? operation.recoveryDeliveryStatus === "not_required"
          ? refuse("identity_recovery_delivery_status_invalid")
          : operation.recoveryDeliveryStatus
        : "confirmed",
  };
}

/** System-only crash recovery from persisted delivery and journal authority. */
export async function resumeIdentityDeletionRequest(
  db: DbLike,
  operationId: string,
  ports: Readonly<{
    recoveryDelivery: RecoveryDeliveryPort;
    journal: DeletionJournalPort;
  }>
): Promise<IdentityDeletionRequestResult> {
  const resumable = await db.transaction(async (tx) => {
    const [snapshot] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1);
    if (!snapshot?.userId || snapshot.scope !== "identity") {
      refuse("operation_not_available");
    }
    if (snapshot.state !== "requested") {
      return { operation: snapshot, recoveryExpired: false, reconciliation: null };
    }
    const workspaceIds = await lockIdentityWorkspaces(tx, snapshot.userId);
    const [current] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, snapshot.id))
      .limit(1)
      .for("update");
    const now = await databaseNow(tx);
    if (!current?.userId || current.scope !== "identity") {
      refuse("operation_not_available");
    }
    if (current.state !== "requested") {
      return { operation: current, recoveryExpired: false, reconciliation: null };
    }
    const [identity] = await tx
      .select({ authUserId: users.authUserId, state: users.lifecycleState })
      .from(users)
      .where(eq(users.id, current.userId))
      .limit(1);
    if (!identity || identity.state !== "active") refuse("identity_not_active");
    identityRequestAuthorityBinding(current);
    if (!current.recoveryExpiresAt) refuse("recovery_expiry_missing");
    const recoveryExpired = current.recoveryExpiresAt.getTime() <= now.getTime();
    const hasAnyReservation =
      current.journalIntentPlanDigest !== null ||
      current.journalIntentBaseVersion !== null ||
      current.journalIntentEffectiveAt !== null;
    if (hasAnyReservation) {
      const expectedPlanDigest = journalPlanDigest(
        IDENTITY_REQUEST_STEPS,
        identityRequestAuthorityBinding(current)
      );
      if (!hasExactJournalReservation(current, expectedPlanDigest)) {
        refuse("request_reservation_changed");
      }
      return { operation: current, recoveryExpired, reconciliation: null };
    }
    if (recoveryExpired) {
      return { operation: current, recoveryExpired: true, reconciliation: null };
    }
    if (
      current.recoveryDeliveryStatus === "confirmed" &&
      current.recoveryDeliveryReceiptDigest
    ) {
      await assertWorkspacesReleasable(tx, current.userId, workspaceIds, "cascade");
      return { operation: current, recoveryExpired: false, reconciliation: null };
    }
    if (current.recoveryDeliveryStatus === "failed") {
      return { operation: current, recoveryExpired: false, reconciliation: null };
    }
    if (
      (current.recoveryDeliveryStatus !== "pending" &&
        current.recoveryDeliveryStatus !== "unknown") ||
      !current.recoveryDeliveryCommandId ||
      !current.recoveryDeliveryRecipientDigest ||
      !current.recoverySecretDigest ||
      !current.recoverySecretPrefix ||
      !current.recoveryDeliveryAttemptedAt
    ) {
      refuse("recovery_delivery_attempt_incomplete");
    }
    await assertWorkspacesReleasable(tx, current.userId, workspaceIds, "cascade");
    return {
      operation: current,
      recoveryExpired: false,
      reconciliation: {
        operationId: current.id,
        commandId: current.recoveryDeliveryCommandId,
        attempt: current.recoveryDeliveryAttempt,
        authUserId: identity.authUserId,
        secretDigest: current.recoverySecretDigest,
        secretPrefix: current.recoverySecretPrefix,
        recipientDigest: current.recoveryDeliveryRecipientDigest,
        expiresAt: current.recoveryExpiresAt,
      } satisfies RecoveryDeliveryReconciliationRequest,
    };
  });

  let operation = resumable.operation;
  if (resumable.reconciliation) {
    const delivery = await ports.recoveryDelivery.reconcileIdentityRecovery(
      resumable.reconciliation
    );
    operation = await persistReconciledIdentityRecovery(
      db,
      operation,
      resumable.reconciliation,
      delivery
    );
    if (
      operation.state === "requested" &&
      operation.recoveryDeliveryStatus !== "confirmed"
    ) {
      return identityDeletionRequestResult(operation);
    }
  }
  if (
    operation.state === "requested" &&
    operation.recoveryDeliveryStatus === "failed" &&
    !resumable.recoveryExpired
  ) {
    return identityDeletionRequestResult(operation);
  }
  if (operation.state === "requested") {
    await reserveIdentityDeletionRequest(db, operation.id);
    await topUpIdentityCascade(db, operation.id);
    operation = await finalizeIdentityDeletionRequest(db, operation.id, ports.journal);
  }
  return identityDeletionRequestResult(operation);
}

export type ScopedRequestParams = Readonly<{
  sessionId: string;
  idempotencyKey: string;
  typedName: string;
  reauthMaxAgeMs?: number;
}>;

async function requireActiveOwner(
  tx: TxLike,
  userId: string,
  workspaceId: string
): Promise<void> {
  const [owner] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.role, "owner"),
        eq(memberships.lifecycleState, "active"),
        eq(workspaces.lifecycleState, "active")
      )
    )
    .limit(1);
  if (!owner) refuse("owner_required");
}

async function requireOwnerMembership(
  tx: TxLike,
  userId: string,
  workspaceId: string
): Promise<void> {
  const [owner] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.role, "owner"),
        eq(memberships.lifecycleState, "active")
      )
    )
    .limit(1);
  if (!owner) refuse("owner_required");
}

async function finalizeScopedDeletionRequest(
  db: DbLike,
  expected: DeletionOperation,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  return db.transaction((tx) => finalizeScopedDeletionRequestInTx(tx, expected, journal));
}

/**
 * The scoped tombstone transaction's body, callable inside a caller's
 * transaction: the identity cascade (R-160) finalizes its reserved workspace
 * deletions in the identity's own tombstone transaction. Every advisory lock
 * here is transaction-scoped and re-entrant, so the identity path's locks
 * (identity first, then every workspace in lexical order) already cover these.
 */
async function finalizeScopedDeletionRequestInTx(
  tx: TxLike,
  expected: DeletionOperation,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  if (
    (expected.scope !== "profile" && expected.scope !== "workspace") ||
    !expected.workspaceId
  ) {
    refuse("operation_not_available");
  }
  const scope = expected.scope;
  const workspaceId = expected.workspaceId;
  const targetId = scope === "profile" ? expected.profileId : workspaceId;
  if (!targetId) refuse("operation_not_available");
  if (expected.requesterUserId) {
    await lockIdentityMembershipGraph(tx, expected.requesterUserId);
  }
  await lockWorkspaceMembershipGraph(tx, workspaceId);
  const [current] = await tx
    .select()
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.id, expected.id),
        eq(deletionOperations.scope, scope)
      )
    )
    .limit(1);
  if (!current) refuse("operation_not_available");
  if (current.state !== "requested") return current;
  const now = await databaseNow(tx);

  const requestPlanDigest = journalPlanDigest(
    REQUEST_TOMBSTONE_STEPS,
    scopedRequestAuthorityBinding(current)
  );
  if (!hasExactJournalReservation(current, requestPlanDigest)) {
    refuse("request_reservation_changed");
  }
  let advanced = await appendJournalTransitionInTx(
    tx,
    current,
    "journal_pending",
    journal,
    now,
    {
      steps: REQUEST_TOMBSTONE_STEPS,
      authorityBindingDigest: scopedRequestAuthorityBinding(current),
      planIndex: 0,
    }
  );
  advanced = await appendJournalTransitionInTx(
    tx,
    advanced,
    "tombstoned",
    journal,
    now,
    {
      steps: REQUEST_TOMBSTONE_STEPS,
      authorityBindingDigest: scopedRequestAuthorityBinding(current),
      planIndex: 1,
    }
  );
  if (scope === "profile") {
    await tx
      .update(autopsyCacheClaims)
      .set({
        status: "parked",
        activeSystemAttemptId: null,
        leaseExpiresAt: null,
        lastFailureCode: "profile_tombstoned",
        updatedAt: now,
      })
      .where(
        and(
          eq(autopsyCacheClaims.rightsScope, "profile_private"),
          eq(autopsyCacheClaims.profileId, targetId),
          eq(autopsyCacheClaims.workspaceId, workspaceId),
          inArray(autopsyCacheClaims.status, ["pending", "failed"])
        )
      );
    const [tombstoned] = await tx
      .update(creatorProfiles)
      .set({
        state: "deletion_tombstoned",
        lifecycleVersion: sql`${creatorProfiles.lifecycleVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(creatorProfiles.id, targetId),
          eq(creatorProfiles.workspaceId, workspaceId),
          inArray(creatorProfiles.state, ["active", "archived"])
        )
      )
      .returning({ id: creatorProfiles.id });
    if (!tombstoned) refuse("profile_changed_while_tombstoning");
  } else {
    await tx
      .update(autopsyCacheClaims)
      .set({
        status: "parked",
        activeSystemAttemptId: null,
        leaseExpiresAt: null,
        lastFailureCode: "workspace_tombstoned",
        updatedAt: now,
      })
      .where(
        and(
          eq(autopsyCacheClaims.rightsScope, "profile_private"),
          eq(autopsyCacheClaims.workspaceId, workspaceId),
          inArray(autopsyCacheClaims.status, ["pending", "failed"])
        )
      );
    const [tombstoned] = await tx
      .update(workspaces)
      .set({
        lifecycleState: "tombstoned",
        lifecycleVersion: sql`${workspaces.lifecycleVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(workspaces.id, workspaceId),
          eq(workspaces.lifecycleState, "active")
        )
      )
      .returning({ id: workspaces.id });
    if (!tombstoned) refuse("workspace_changed_while_tombstoning");
  }
  const [acknowledged] = await tx
    .update(deletionOperations)
    .set({
      acknowledgedAt: now,
      tombstonedAt: now,
      graceExpiresAt: new Date(
        current.requestedAt.getTime() + DELETION_GRACE_MS
      ),
      updatedAt: now,
    })
    .where(eq(deletionOperations.id, advanced.id))
    .returning();
  if (!acknowledged) refuse("operation_acknowledgement_conflict");
  return acknowledged;
}

async function requestScopedDeletion(
  db: DbLike,
  scope: "profile" | "workspace",
  authority: WorkspaceScope,
  params: ScopedRequestParams,
  journal: DeletionJournalPort,
  profileTargetId?: string
): Promise<DeletionOperation> {
  // R-166: the cascade's key prefix is the server's; a client key carrying it is refused.
  if (!validKey(params.idempotencyKey) || params.idempotencyKey.startsWith(IDENTITY_CASCADE_KEY_PREFIX)) {
    refuse("invalid_idempotency_key");
  }
  assertScoped(authority);
  if (
    !isWorkspaceScope(authority) ||
    (scope === "profile" && !UUID_RE.test(profileTargetId ?? "")) ||
    (scope === "workspace" && profileTargetId !== undefined)
  ) {
    refuse("target_not_authorized");
  }
  const targetId =
    scope === "profile"
      ? profileTargetId!
      : authority.workspaceId;
  const expectedWorkspaceId = authority.workspaceId;
  const expectedUserId = authority.userId;
  const payloadHash = requestHash(scope, targetId, params.typedName);
  const prepared = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [reservedReplay] = await tx
      .select()
      .from(deletionOperations)
      .where(
        and(
          eq(deletionOperations.scope, scope),
          eq(deletionOperations.idempotencyKey, params.idempotencyKey),
          eq(deletionOperations.requesterUserId, expectedUserId),
          eq(deletionOperations.state, "requested")
        )
      )
      .limit(1);
    if (reservedReplay && reservedReplay.journalIntentPlanDigest !== null) {
      assertSameRequest(reservedReplay, payloadHash, {
        workspaceId: expectedWorkspaceId,
        ...(scope === "profile" ? { profileId: targetId } : {}),
      });
      assertScopedRequestEpochs(
        reservedReplay,
        authority,
        reservedReplay.requestProfileLifecycleVersion
      );
      if (reservedReplay.requestSessionDigest !== digest(params.sessionId)) {
        refuse("request_authority_binding_invalid");
      }
      const expectedPlanDigest = journalPlanDigest(
        REQUEST_TOMBSTONE_STEPS,
        scopedRequestAuthorityBinding(reservedReplay)
      );
      if (!hasExactJournalReservation(reservedReplay, expectedPlanDigest)) {
        refuse("request_reservation_changed");
      }
      return reservedReplay;
    }
    const proof = await requireReauthenticatedSession(
      tx,
      params.sessionId,
      now,
      params.reauthMaxAgeMs,
      expectedUserId
    );
    await lockIdentityMembershipGraph(tx, proof.userId);
    await lockWorkspaceMembershipGraph(tx, expectedWorkspaceId);
    const byKey = await operationByKey(
      tx,
      proof.userId,
      scope,
      params.idempotencyKey
    );
    const byTarget = await activeOperationForTarget(tx, scope, targetId);
    if (byKey && byTarget && byKey.id !== byTarget.id) {
      refuse("active_target_conflict");
    }
    let existing = byKey ?? byTarget;
    if (existing) {
      const unreserved =
        existing.state === "requested" &&
        existing.journalIntentPlanDigest === null &&
        existing.journalIntentBaseVersion === null &&
        existing.journalIntentEffectiveAt === null;
      const nextSessionDigest = digest(params.sessionId);
      let nextProfileLifecycleVersion: number | null = null;
      let nextProfilePriorState: "active" | "archived" | null = null;
      if (!unreserved) {
        assertSameRequest(existing, payloadHash, {
          workspaceId: expectedWorkspaceId,
          ...(scope === "profile" ? { profileId: targetId } : {}),
        });
        if (existing.state === "cancelled" || existing.state === "complete") {
          if (
            existing.requesterUserId !== proof.userId ||
            existing.requestSessionDigest !== null
          ) {
            refuse("request_authority_binding_invalid");
          }
          await requireOwnerMembership(tx, proof.userId, expectedWorkspaceId);
          return existing;
        }
        assertScopedRequestEpochs(
          existing,
          authority,
          existing.requestProfileLifecycleVersion
        );
        if (
          existing.requesterUserId !== proof.userId ||
          existing.requestSessionDigest !== nextSessionDigest
        ) {
          refuse("request_authority_binding_invalid");
        }
        await requireOwnerMembership(tx, proof.userId, expectedWorkspaceId);
        return existing;
      }

      // No journal intent means no externally visible transition was committed.
      // Revalidate the whole live authority and replace every mutable request
      // binding so a crash cannot wedge a renamed target or a request whose
      // original owner/session was later removed.
      const liveAuthority = await assertWorkspaceLifecycleTransactionAccess(
        tx,
        proof.userId,
        expectedWorkspaceId
      );
      assertFreshWorkspaceAuthority(liveAuthority, authority);
      if (scope === "profile") {
        const [profile] = await tx
          .select({
            workspaceId: creatorProfiles.workspaceId,
            name: creatorProfiles.displayName,
            state: creatorProfiles.state,
            lifecycleVersion: creatorProfiles.lifecycleVersion,
          })
          .from(creatorProfiles)
          .where(eq(creatorProfiles.id, targetId))
          .limit(1);
        if (
          !profile ||
          profile.workspaceId !== expectedWorkspaceId ||
          profile.state === "deletion_tombstoned"
        ) {
          refuse("target_not_authorized");
        }
        if (profile.name !== params.typedName) refuse("typed_name_mismatch");
        nextProfileLifecycleVersion = profile.lifecycleVersion;
        nextProfilePriorState = profile.state;
      } else {
        const [workspace] = await tx
          .select({ name: workspaces.name, state: workspaces.lifecycleState })
          .from(workspaces)
          .where(eq(workspaces.id, expectedWorkspaceId))
          .limit(1);
        if (!workspace || workspace.state !== "active") {
          refuse("workspace_changed_while_rebinding");
        }
        if (workspace.name !== params.typedName) refuse("typed_name_mismatch");
      }
      await requireActiveOwner(tx, proof.userId, expectedWorkspaceId);
      const [rebound] = await tx
        .update(deletionOperations)
        .set({
          requesterUserId: proof.userId,
          requesterDigest: requesterDigest(proof.userId),
          requestSessionDigest: nextSessionDigest,
          requestMembershipVersion: authority.membershipVersion,
          requestWorkspaceLifecycleVersion: authority.workspaceLifecycleVersion,
          requestProfileLifecycleVersion: nextProfileLifecycleVersion,
          profilePriorState: nextProfilePriorState,
          idempotencyKey: params.idempotencyKey,
          payloadHash,
          // An unreserved draft has no externally visible transition. Rebinding
          // is a fresh acknowledged request, so its full cancellation window
          // must start here rather than at the abandoned process's old clock.
          requestedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(deletionOperations.id, existing.id),
            eq(deletionOperations.state, "requested"),
            isNull(deletionOperations.journalIntentPlanDigest),
            isNull(deletionOperations.journalIntentBaseVersion),
            isNull(deletionOperations.journalIntentEffectiveAt)
          )
        )
        .returning();
      if (!rebound) refuse("request_authority_rebind_conflict");
      existing = rebound;
      assertSameRequest(existing, payloadHash, {
        workspaceId: expectedWorkspaceId,
        ...(scope === "profile" ? { profileId: targetId } : {}),
      });
      assertScopedRequestEpochs(existing, authority, nextProfileLifecycleVersion);
      return existing;
    }
    let priorProfileState: "active" | "archived" | "deletion_tombstoned" | null = null;
    const liveAuthority = await assertWorkspaceLifecycleTransactionAccess(
      tx,
      proof.userId,
      expectedWorkspaceId
    );
    assertFreshWorkspaceAuthority(liveAuthority, authority);
    let requestProfileLifecycleVersion: number | null = null;
    if (scope === "profile") {
      const [lockedProfile] = await tx
        .select({
          workspaceId: creatorProfiles.workspaceId,
          name: creatorProfiles.displayName,
          state: creatorProfiles.state,
          lifecycleVersion: creatorProfiles.lifecycleVersion,
        })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, targetId))
        .limit(1);
      if (
        !lockedProfile ||
        lockedProfile.workspaceId !== expectedWorkspaceId ||
        lockedProfile.state === "deletion_tombstoned"
      ) {
        refuse("target_not_authorized");
      }
      if (lockedProfile.name !== params.typedName) refuse("typed_name_mismatch");
      priorProfileState = lockedProfile.state;
      requestProfileLifecycleVersion = lockedProfile.lifecycleVersion;
    } else {
      const [lockedWorkspace] = await tx
        .select({ name: workspaces.name, state: workspaces.lifecycleState })
        .from(workspaces)
        .where(eq(workspaces.id, expectedWorkspaceId))
        .limit(1);
      if (
        !lockedWorkspace ||
        lockedWorkspace.state !== "active"
      ) {
        refuse("workspace_changed_while_locking");
      }
      if (lockedWorkspace.name !== params.typedName) refuse("typed_name_mismatch");
    }
    await requireActiveOwner(tx, proof.userId, expectedWorkspaceId);
    const [created] = await tx
      .insert(deletionOperations)
      .values({
        scope,
        targetKey: targetKey(scope, {
          workspaceId: expectedWorkspaceId,
          ...(scope === "profile" ? { profileId: targetId } : {}),
        }),
        workspaceId: expectedWorkspaceId,
        profileId: scope === "profile" ? targetId : null,
        profilePriorState: priorProfileState,
        requesterUserId: proof.userId,
        requesterDigest: requesterDigest(proof.userId),
        requestSessionDigest: digest(params.sessionId),
        requestMembershipVersion: authority.membershipVersion,
        requestWorkspaceLifecycleVersion: authority.workspaceLifecycleVersion,
        requestProfileLifecycleVersion,
        idempotencyKey: params.idempotencyKey,
        payloadHash,
      })
      .returning();
    return created;
  });
  if (prepared.state !== "requested") return prepared;

  const authorityBindingDigest = scopedRequestAuthorityBinding(
    prepared
  );
  await prepareJournalPlan(
    db,
    prepared.id,
    REQUEST_TOMBSTONE_STEPS,
    {
      authorityBindingDigest,
      beforeReserve: async (tx, planDigest) => {
        if (await hasReservedJournalPlan(tx, prepared.id, planDigest)) return;
        await lockIdentityMembershipGraph(tx, expectedUserId);
        await lockWorkspaceMembershipGraph(tx, expectedWorkspaceId);
        const now = await databaseNow(tx);
        const proof = await requireReauthenticatedSession(
          tx,
          params.sessionId,
          now,
          params.reauthMaxAgeMs,
          expectedUserId
        );
        const [current] = await tx
          .select()
          .from(deletionOperations)
          .where(
            and(
              eq(deletionOperations.id, prepared.id),
              eq(deletionOperations.requesterUserId, proof.userId),
              eq(deletionOperations.scope, scope)
            )
          )
          .limit(1);
        if (!current || current.state !== "requested") {
          refuse("operation_not_available");
        }
        assertSameRequest(current, payloadHash, {
          workspaceId: expectedWorkspaceId,
          ...(scope === "profile" ? { profileId: targetId } : {}),
        });
        assertScopedRequestEpochs(
          current,
          authority,
          current.requestProfileLifecycleVersion
        );
        const liveAuthority = await assertWorkspaceLifecycleTransactionAccess(
          tx,
          proof.userId,
          expectedWorkspaceId
        );
        assertFreshWorkspaceAuthority(liveAuthority, authority);
        if (scope === "profile") {
          const [profile] = await tx
            .select({
              name: creatorProfiles.displayName,
              state: creatorProfiles.state,
              lifecycleVersion: creatorProfiles.lifecycleVersion,
            })
            .from(creatorProfiles)
            .where(
              and(
                eq(creatorProfiles.id, targetId),
                eq(creatorProfiles.workspaceId, expectedWorkspaceId)
              )
            )
            .limit(1);
          if (!profile || profile.state === "deletion_tombstoned") {
            refuse("target_not_authorized");
          }
          if (profile.lifecycleVersion !== current.requestProfileLifecycleVersion) {
            refuse("request_authority_epoch_mismatch");
          }
          if (profile.name !== params.typedName) refuse("typed_name_mismatch");
        } else {
          const [workspace] = await tx
            .select({ name: workspaces.name, state: workspaces.lifecycleState })
            .from(workspaces)
            .where(eq(workspaces.id, expectedWorkspaceId))
            .limit(1);
          if (!workspace || workspace.state !== "active") {
            refuse("workspace_changed_while_reserving");
          }
          if (workspace.name !== params.typedName) refuse("typed_name_mismatch");
        }
        await requireActiveOwner(tx, proof.userId, expectedWorkspaceId);
      },
    }
  );
  return finalizeScopedDeletionRequest(db, prepared, journal);
}

export function requestProfileDeletion(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  params: ScopedRequestParams,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  return requestScopedDeletion(db, "profile", scope, params, journal, profileId);
}

export function requestWorkspaceDeletion(
  db: DbLike,
  scope: WorkspaceScope,
  params: ScopedRequestParams,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  return requestScopedDeletion(db, "workspace", scope, params, journal);
}

async function resumeScopedDeletionRequest(
  db: DbLike,
  operationId: string,
  scope: "profile" | "workspace",
  authority: WorkspaceScope,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  assertScoped(authority);
  if (!isWorkspaceScope(authority)) refuse("operation_not_available");
  const [operation] = await db
    .select()
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.id, operationId),
        eq(deletionOperations.scope, scope),
        eq(deletionOperations.workspaceId, authority.workspaceId),
        eq(deletionOperations.requesterUserId, authority.userId)
      )
    )
    .limit(1);
  if (!operation || !operation.workspaceId) refuse("operation_not_available");
  const targetId = scope === "profile" ? operation.profileId : operation.workspaceId;
  if (!targetId) refuse("operation_not_available");
  if (operation.state === "requested") {
    const planDigest = journalPlanDigest(
      REQUEST_TOMBSTONE_STEPS,
      scopedRequestAuthorityBinding(operation)
    );
    if (!hasExactJournalReservation(operation, planDigest)) {
      refuse("request_reservation_changed");
    }
  }
  return finalizeScopedDeletionRequest(db, operation, journal);
}

/**
 * Resume an already-reserved profile deletion after process/session loss. The
 * freshly server-minted workspace scope authenticates the same requester and
 * target workspace; the durable reservation supplies the original owner,
 * profile and epoch authority so a later demotion cannot strand the commit.
 */
export function resumeProfileDeletionRequest(
  db: DbLike,
  operationId: string,
  authority: WorkspaceScope,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  return resumeScopedDeletionRequest(db, operationId, "profile", authority, journal);
}

/** See `resumeProfileDeletionRequest`; this variant is workspace-grained. */
export function resumeWorkspaceDeletionRequest(
  db: DbLike,
  operationId: string,
  authority: WorkspaceScope,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  return resumeScopedDeletionRequest(db, operationId, "workspace", authority, journal);
}

/**
 * System-only resume of a RESERVED scoped request (R-162): no session, no
 * scope. The exact authority-bound reservation is the commit point — the same
 * rule `requireReservedScopedCancellationInTx` already applies to a reserved
 * cancellation — because `beforeReserve` re-proved the requester's session,
 * owner membership, epochs and typed name in the transaction that wrote it.
 * A crash between that reservation and the tombstone transaction used to leave
 * the operation in `requested` with no caller anywhere able to finish it: the
 * two session-side seams above need a scope the worker cannot mint.
 */
export async function resumeReservedScopedDeletionRequest(
  db: DbLike,
  operationId: string,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  const [operation] = await db
    .select()
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  if (
    !operation ||
    (operation.scope !== "profile" && operation.scope !== "workspace") ||
    !operation.workspaceId
  ) {
    refuse("operation_not_available");
  }
  if (operation.state !== "requested") return operation;
  if (
    !hasExactJournalReservation(
      operation,
      journalPlanDigest(REQUEST_TOMBSTONE_STEPS, scopedRequestAuthorityBinding(operation))
    )
  ) {
    refuse("request_reservation_changed");
  }
  return finalizeScopedDeletionRequest(db, operation, journal);
}

/** How long a reservation must have stood before the sweep treats it as wedged. */
export const DELETION_WEDGE_RESUME_AFTER_MS = 5 * 60_000;
/** How many wedges one tick resumes (each seam is a few transactions and a journal append). */
export const DELETION_WEDGE_SWEEP_LIMIT = 10;
/** How many reserved rows one tick classifies; the skipped ones cost one read each. */
const DELETION_WEDGE_SCAN_MAX = 200;

export type DeletionWedgeSeam =
  | "identity_request"
  | "scoped_request"
  | "scoped_cancellation"
  | "identity_cancellation";

export type DeletionWedgeOutcome = Readonly<{
  operationId: string;
  scope: DeletionScope;
  seam: DeletionWedgeSeam | null;
  /** `resumed`: the seam ran and returned; `refused`: it threw (code below); `skipped`: not this sweep's to finish. */
  result: "resumed" | "refused" | "skipped";
  code: string;
}>;

/**
 * THE CALLER THE RESUME SEAMS NEVER HAD (R-162, P5-R4). Every seam below was
 * exported and tested and reachable from nothing, so a crash between a
 * journal reservation and the transaction it reserves wedged the operation
 * permanently. The worker tick runs this before the executor.
 *
 * The population is every non-terminal operation carrying a reservation older
 * than `DELETION_WEDGE_RESUME_AFTER_MS`, and it is classified by WHAT the
 * reservation is, never by a label: an exact request plan (`requested`), an
 * exact scoped cancellation plan, or — for identity — any plan that is not one
 * of the executor's own one-step transitions, which the executor resumes
 * itself on its next tick (`prepareJournalPlan` returns an identical plan).
 *
 *   identity  requested  -> resumeIdentityDeletionRequest (also finalizes its cascade)
 *   scoped    requested  -> resumeReservedScopedDeletionRequest, EXCEPT a cascade
 *                            row, which is its identity's to finalize (skipped)
 *   scoped    other      -> resumeScopedDeletionCancellation, iff the plan is
 *                            exactly that operation's cancellation plan
 *   identity  other      -> resumeIdentityDeletionCancellation, iff the plan is
 *                            not an executor transition
 *
 * A refusal is CAUGHT per operation so one poisoned row does not starve the
 * rest, and is therefore COUNTED: the tick summary carries `wedgesRefused`
 * and the worker raises an alert on it (CLAUDE.md 2026-09-09).
 */
export async function resumeWedgedDeletionOperations(
  db: DbLike,
  ports: Readonly<{
    journal: DeletionJournalPort;
    recoveryDelivery: RecoveryDeliveryPort;
    membershipRestore: MembershipRestorePolicyPort;
  }>,
  options: Readonly<{ olderThanMs?: number; limit?: number }> = {}
): Promise<readonly DeletionWedgeOutcome[]> {
  const olderThanMs = options.olderThanMs ?? DELETION_WEDGE_RESUME_AFTER_MS;
  const candidates = await db
    .select()
    .from(deletionOperations)
    .where(
      and(
        notInArray(deletionOperations.state, ["complete", "cancelled"]),
        sql`${deletionOperations.journalIntentPlanDigest} IS NOT NULL`,
        sql`${deletionOperations.journalIntentEffectiveAt} < clock_timestamp() - make_interval(secs => ${olderThanMs / 1_000})`
      )
    )
    .orderBy(asc(deletionOperations.journalIntentEffectiveAt))
    // The bound applies to the SEAMS run, not to the rows read: an executor's
    // own long-held reservation is skipped here, and a limit on the read
    // would let enough of them starve a real wedge behind them.
    .limit(DELETION_WEDGE_SCAN_MAX);
  const limit = options.limit ?? DELETION_WEDGE_SWEEP_LIMIT;
  const outcomes: DeletionWedgeOutcome[] = [];
  let run = 0;
  for (const operation of candidates) {
    const seam = wedgeSeamFor(operation);
    if (seam === null) {
      outcomes.push({ operationId: operation.id, scope: operation.scope, seam, result: "skipped", code: "not_a_wedge" });
      continue;
    }
    // R-166: a cascaded row by its server-owned parent column, not its key.
    if (seam === "scoped_request" && operation.cascadeParentOperationId !== null) {
      outcomes.push({ operationId: operation.id, scope: operation.scope, seam, result: "skipped", code: "cascade_awaits_identity" });
      continue;
    }
    if (run >= limit) break;
    run += 1;
    try {
      const after =
        seam === "identity_request"
          ? (await resumeIdentityDeletionRequest(db, operation.id, ports)).operation
          : seam === "scoped_request"
            ? await resumeReservedScopedDeletionRequest(db, operation.id, ports.journal)
            : seam === "scoped_cancellation"
              ? await resumeScopedDeletionCancellation(db, operation.id, ports.journal, ports.membershipRestore)
              : (await resumeIdentityDeletionCancellation(db, operation.id, ports)).operation;
      outcomes.push({ operationId: operation.id, scope: operation.scope, seam, result: "resumed", code: after.state });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const code = (message.startsWith("deletion_refused:") ? message.slice("deletion_refused:".length) : "resume_failed")
        .replace(/[^A-Za-z0-9_:.-]/g, "_")
        .slice(0, 120);
      outcomes.push({ operationId: operation.id, scope: operation.scope, seam, result: "refused", code });
    }
  }
  return outcomes;
}

function wedgeSeamFor(operation: DeletionOperation): DeletionWedgeSeam | null {
  const reservation = operation.journalIntentPlanDigest;
  if (reservation === null) return null;
  if (operation.state === "requested") {
    return operation.scope === "identity" ? "identity_request" : "scoped_request";
  }
  const cancellation: readonly JournalPlanStep[] = [{ from: operation.state, to: "cancelled" }];
  if (operation.scope !== "identity") {
    return reservation === journalPlanDigest(cancellation, scopedCancellationAuthorityBinding(operation))
      ? "scoped_cancellation"
      : null;
  }
  const executorPlans = TRANSITIONS[operation.state]
    .filter((to) => to !== "cancelled")
    .map((to) => journalPlanDigest([{ from: operation.state, to }]));
  if (operation.state === "erasing" || operation.state === "verifying") return null;
  return executorPlans.includes(reservation) ? null : "identity_cancellation";
}

type ScopedCancellationAuthority = Readonly<{
  operation: DeletionOperation & { workspaceId: string };
  requesterDigest: string;
}>;

/**
 * WHO CANCELS (R-166, gate M4): any active owner may (R-162), so the
 * requester is not the answer. Recorded in the transaction that reserves the
 * cancellation's journal plan — the commit point; a resume after it has no
 * session to name anyone — as the canceller's id (scrubbed by their identity
 * erasure) and digest (a receipt fact, like `requester_digest`). Only while
 * unreserved, so a reservation already made keeps its canceller.
 */
async function recordScopedCancellerInTx(
  tx: TxLike,
  operationId: string,
  cancellerUserId: string
): Promise<void> {
  await tx
    .update(deletionOperations)
    .set({ cancelledByUserId: cancellerUserId, cancelledByDigest: requesterDigest(cancellerUserId) })
    .where(and(eq(deletionOperations.id, operationId), isNull(deletionOperations.journalIntentPlanDigest)));
}

async function requireScopedCancellationAuthorityInTx(
  tx: TxLike,
  operationId: string,
  params: Omit<ScopedRequestParams, "idempotencyKey" | "typedName">
): Promise<ScopedCancellationAuthority & Readonly<{ cancellerUserId: string }>> {
  let [operation] = await tx
    .select()
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.id, operationId),
        inArray(deletionOperations.scope, ["profile", "workspace"])
      )
    )
    .limit(1);
  if (!operation || operation.scope === "identity" || !operation.workspaceId) {
    refuse("operation_not_available");
  }
  const workspaceId = operation.workspaceId;
  // ANY ACTIVE OWNER of the target workspace may cancel (R-162, P5-R5) — not
  // only the requester, whose session a co-owner cannot present. Requiring the
  // requester was the deadlock: an owner who requested a workspace deletion
  // and then their own account's had their sessions revoked and their
  // membership suspended, so nobody could ever cancel the workspace. The
  // canceller is whoever holds the reauthenticated session; the identity lock
  // is theirs, taken before the workspace lock (the global order).
  // WHO, before the locks — but no clock: the session's freshness and the
  // grace cutoff are measured only after both graph locks (the source scan in
  // `deletion-lifecycle.test.ts` pins that order).
  const actorUserId = await sessionDomainUserId(tx, params.sessionId);
  await lockIdentityMembershipGraph(tx, actorUserId);
  await lockWorkspaceMembershipGraph(tx, workspaceId);
  const now = await databaseNow(tx);
  const proof = await requireReauthenticatedSession(
    tx,
    params.sessionId,
    now,
    params.reauthMaxAgeMs,
    actorUserId
  );
  [operation] = await tx
    .select()
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.id, operationId),
        eq(deletionOperations.workspaceId, workspaceId),
        inArray(deletionOperations.scope, ["profile", "workspace"])
      )
    )
    .limit(1);
  if (!operation || operation.scope === "identity" || !operation.workspaceId) {
    refuse("operation_not_available");
  }
  // The membership, not the workspace, is what must be live: during a
  // workspace deletion the workspace row IS tombstoned.
  await requireOwnerMembership(tx, proof.userId, workspaceId);
  // A `blocked` operation whose resume state is irreversible work never
  // cancels (R-162): the erasing-phase provider commands may have run.
  if (
    operation.state === "blocked" &&
    (operation.blockedResumeState === "erasing" || operation.blockedResumeState === "verifying")
  ) {
    refuse("erasure_started");
  }
  if (
    operation.state !== "cancelled" &&
    (!operation.graceExpiresAt || now.getTime() >= operation.graceExpiresAt.getTime())
  ) {
    refuse("cancellation_window_closed");
  }
  // Plan C2: an unknown pre-grace fence outcome blocks cancellation until it
  // is reconciled — the reversal cannot be planned against an effect nobody
  // knows landed. (Round-1 billing BLOCK: this was declared, not wired.)
  if (operation.state !== "cancelled") await assertCancellationCommandsSettledInTx(tx, operation.id);
  return {
    operation: operation as DeletionOperation & { workspaceId: string },
    requesterDigest: operation.requesterDigest,
    cancellerUserId: proof.userId,
  };
}

/**
 * A matching authority-bound journal intent is the cancellation commit point.
 * Mutable role/session clocks are deliberately not re-evaluated after it: a
 * crash or cutoff after reservation must resume the already-authorised act,
 * not strand the operation behind a conflicting plan.
 */
async function requireReservedScopedCancellationInTx(
  tx: TxLike,
  operationId: string,
  planDigest: string
): Promise<ScopedCancellationAuthority> {
  const [snapshot] = await tx
    .select()
    .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1);
  if (
    !snapshot ||
    snapshot.scope === "identity" ||
    !snapshot.workspaceId
  ) {
    refuse("cancellation_reservation_invalid");
  }
  if (snapshot.requesterUserId) {
    await lockIdentityMembershipGraph(tx, snapshot.requesterUserId);
  }
  await lockWorkspaceMembershipGraph(tx, snapshot.workspaceId);
  const [operation] = await tx
    .select()
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  if (
    !operation ||
    operation.scope === "identity" ||
    !operation.workspaceId ||
    operation.requesterDigest !== snapshot.requesterDigest
  ) {
    refuse("cancellation_reservation_changed");
  }
  if (operation.state === "cancelled") {
    const expectedReplayDigest = digest(
      JSON.stringify({
        schema: 1,
        purpose: "scoped_deletion_cancellation",
        operationId: operation.id,
        requesterDigest: operation.requesterDigest,
      })
    );
    if (
      operation.journalIntentPlanDigest !== null ||
      operation.journalIntentBaseVersion !== null ||
      operation.journalIntentEffectiveAt !== null ||
      operation.cancellationReplayDigest !== expectedReplayDigest
    ) {
      refuse("cancellation_replay_mismatch");
    }
    return {
      operation: operation as DeletionOperation & { workspaceId: string },
      requesterDigest: operation.requesterDigest,
    };
  }
  if (operation.journalIntentPlanDigest !== planDigest) {
    refuse("cancellation_reservation_changed");
  }
  return {
    operation: operation as DeletionOperation & { workspaceId: string },
    requesterDigest: operation.requesterDigest,
  };
}

async function applyScopedCancellationInTx(
  tx: TxLike,
  authority: ScopedCancellationAuthority,
  cancellationSteps: readonly JournalPlanStep[],
  authorityBindingDigest: string,
  journal: DeletionJournalPort,
  membershipRestore: MembershipRestorePolicyPort | undefined
): Promise<DeletionOperation> {
  const now = await databaseNow(tx);
  const operation = authority.operation;
  const cancellationReplayDigest = digest(
    JSON.stringify({
      schema: 1,
      purpose: "scoped_deletion_cancellation",
      operationId: operation.id,
      requesterDigest: authority.requesterDigest,
    })
  );
  if (operation.state === "cancelled") {
    if (operation.cancellationReplayDigest !== cancellationReplayDigest) {
      refuse("cancellation_replay_mismatch");
    }
    return operation;
  }
  // Re-checked at the commit point, in the same transaction as the append.
  await assertCancellationCommandsSettledInTx(tx, operation.id);
  const cancelled = await appendJournalTransitionInTx(
    tx,
    operation,
    "cancelled",
    journal,
    now,
    {
      steps: cancellationSteps,
      authorityBindingDigest,
      planIndex: 0,
      cancellationReplayDigest,
    }
  );
  if (operation.scope === "profile") {
    const [restored] = await tx
      .update(creatorProfiles)
      .set({
        state: operation.profilePriorState ?? "active",
        lifecycleVersion: sql`${creatorProfiles.lifecycleVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(creatorProfiles.id, operation.profileId!),
          eq(creatorProfiles.workspaceId, operation.workspaceId),
          eq(creatorProfiles.state, "deletion_tombstoned")
        )
      )
      .returning({ id: creatorProfiles.id });
    if (!restored) refuse("profile_restore_conflict");
  } else {
    const [restored] = await tx
      .update(workspaces)
      .set({
        lifecycleState: "active",
        lifecycleVersion: sql`${workspaces.lifecycleVersion} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(workspaces.id, operation.workspaceId),
          eq(workspaces.lifecycleState, "tombstoned")
        )
      )
      .returning({ id: workspaces.id });
    if (!restored) refuse("workspace_restore_conflict");
    // Plan C2 workspace row: "clear a still-pending period-end cancellation
    // before reopening" — only when THIS operation's fence set it. A
    // cancellation the owner scheduled before requesting deletion is theirs
    // and stays (the executor never enqueued the fence in that case). The
    // reversal is a durable cancellation-phase command the worker dispatches;
    // auto-top-up stays off, because re-arming is the owner's reauthenticated
    // choice, never a side effect of cancelling.
    const periodEnd = await latestExternalCommandInTx(tx, cancelled.id, "stripe_subscription_cancel_at_period_end");
    if (periodEnd?.status === "succeeded") {
      await enqueueExternalCommandInTx(tx, cancelled, "stripe_subscription_reopen");
    }
    if (membershipRestore) {
      await restoreStrandedMembershipsInTx(tx, operation.workspaceId, membershipRestore, now);
    }
  }
  return cancelled;
}

/**
 * THE SECOND WAY OUT OF `deletion_suspended` (R-162, P5-R5), so the state has
 * a path out that can run more than once. An identity cancellation restores
 * every membership it suspended — into an active workspace, and into one that
 * is tombstoned by a still-cancellable workspace deletion
 * (`workspaceAdmitsMembershipRestoreInTx`), because membership and workspace
 * lifecycle are one state and the workspace's own operation decides access.
 * A membership it could NOT restore (`workspace_unavailable`) used to stay
 * suspended forever, even after its workspace came back; this re-runs the
 * restore for exactly those rows when the workspace's deletion is cancelled:
 * suspended by an identity operation that is itself `cancelled`, with that
 * operation's snapshot still recording `workspace_unavailable`.
 */
async function restoreStrandedMembershipsInTx(
  tx: TxLike,
  workspaceId: string,
  membershipRestore: MembershipRestorePolicyPort,
  now: Date
): Promise<readonly string[]> {
  const stranded = await tx
    .select({ membership: memberships, snapshot: deletionMembershipSnapshots })
    .from(memberships)
    .innerJoin(
      deletionOperations,
      and(
        eq(deletionOperations.id, memberships.suspensionOperationId),
        eq(deletionOperations.scope, "identity"),
        eq(deletionOperations.state, "cancelled")
      )
    )
    .innerJoin(
      deletionMembershipSnapshots,
      and(
        eq(deletionMembershipSnapshots.operationId, deletionOperations.id),
        eq(deletionMembershipSnapshots.membershipId, memberships.id),
        eq(deletionMembershipSnapshots.outcome, "workspace_unavailable")
      )
    )
    .innerJoin(users, and(eq(users.id, memberships.userId), eq(users.lifecycleState, "active")))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.lifecycleState, "deletion_suspended")
      )
    );
  const restored: string[] = [];
  for (const { membership, snapshot } of stranded) {
    if (
      membership.suspendedRole !== snapshot.role ||
      membership.suspendedVersion !== snapshot.membershipVersion ||
      membership.version !== snapshot.membershipVersion + 1
    ) {
      continue;
    }
    const decision = await membershipRestore.mayRestore(
      {
        operationId: snapshot.operationId,
        userId: membership.userId,
        membershipId: membership.id,
        workspaceId,
        role: snapshot.role,
        membershipVersion: snapshot.membershipVersion,
      },
      tx
    );
    if (!decision.allowed) continue;
    const [row] = await tx
      .update(memberships)
      .set({
        role: snapshot.role,
        lifecycleState: "active",
        suspendedRole: null,
        suspendedVersion: null,
        suspensionOperationId: null,
        version: membership.version + 1,
      })
      .where(
        and(
          eq(memberships.id, membership.id),
          eq(memberships.version, membership.version),
          eq(memberships.lifecycleState, "deletion_suspended")
        )
      )
      .returning({ id: memberships.id });
    if (!row) continue;
    await tx
      .update(deletionMembershipSnapshots)
      .set({ outcome: "restored", outcomeAt: now })
      .where(
        and(
          eq(deletionMembershipSnapshots.id, snapshot.id),
          eq(deletionMembershipSnapshots.outcome, "workspace_unavailable")
        )
      );
    restored.push(membership.id);
  }
  return restored;
}

/**
 * May an identity cancellation restore a membership into this workspace?
 * Active: yes. Tombstoned: only while its newest workspace deletion is still
 * in the read grade's window (`newestWorkspaceDeletionAdmitsRead`) — the
 * person needs the membership back to cancel it (R-162). Erasing, verifying,
 * blocked on the way to either (R-166, gate M2), complete, or no such
 * operation: no.
 */
async function workspaceAdmitsMembershipRestoreInTx(
  tx: TxLike,
  workspaceId: string
): Promise<boolean> {
  const [workspace] = await tx
    .select({ state: workspaces.lifecycleState })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return false;
  if (workspace.state === "active") return true;
  return newestWorkspaceDeletionAdmitsRead(tx, workspaceId);
}

export type ScopedCancellationPorts = Readonly<{
  /** R-165: replays money held while the workspace was tombstoned, after the cancellation commits. */
  heldMoney?: HeldMoneyReplayPort;
  /** R-162: restores memberships an earlier identity cancellation could not. */
  membershipRestore?: MembershipRestorePolicyPort;
}>;

export async function cancelScopedDeletion(
  db: DbLike,
  operationId: string,
  params: Omit<ScopedRequestParams, "idempotencyKey" | "typedName">,
  journal: DeletionJournalPort,
  ports: ScopedCancellationPorts = {}
): Promise<DeletionOperation> {
  const [planSnapshot] = await db
    .select()
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  if (!planSnapshot || planSnapshot.scope === "identity") {
    refuse("operation_not_available");
  }
  const authorityBindingDigest = scopedCancellationAuthorityBinding(planSnapshot);
  const cancellationSteps: readonly JournalPlanStep[] = [
    { from: planSnapshot.state, to: "cancelled" },
  ];
  const cancellationPlanDigest =
    planSnapshot.state !== "cancelled"
      ? await prepareJournalPlan(db, operationId, cancellationSteps, {
          authorityBindingDigest,
           beforeReserve: async (tx, planDigest) => {
             if (await hasReservedJournalPlan(tx, operationId, planDigest)) return;
             const authority = await requireScopedCancellationAuthorityInTx(tx, operationId, params);
             await recordScopedCancellerInTx(tx, operationId, authority.cancellerUserId);
          },
        })
      : null;
  const cancelled = await db.transaction(async (tx) => {
    const authority = cancellationPlanDigest
      ? await requireReservedScopedCancellationInTx(
          tx,
          operationId,
          cancellationPlanDigest
        )
      : await requireScopedCancellationAuthorityInTx(tx, operationId, params);
    return applyScopedCancellationInTx(
      tx,
      authority,
      cancellationSteps,
      authorityBindingDigest,
      journal,
      ports.membershipRestore
    );
  });
  // AFTER the commit, in its own transactions, one per event (R-165): the
  // replay takes the workspace's billing locks, which the cancellation does
  // not hold, and an event that fails to replay must not undo a cancellation
  // that already restored the workspace. It stays held, and the worker's
  // deletion tick replays it and counts a failure into its alert.
  if (cancelled.scope === "workspace" && cancelled.workspaceId && ports.heldMoney) {
    await ports.heldMoney.replayHeldEvents(cancelled.workspaceId);
  }
  return cancelled;
}

/**
 * System-only Task 4 seam for response loss after a scoped cancellation has
 * crossed its durable journal-intent commit point. No session or form plaintext
 * is required: the exact plan is rederived from persisted receipt identity.
 */
export async function resumeScopedDeletionCancellation(
  db: DbLike,
  operationId: string,
  journal: DeletionJournalPort,
  membershipRestore?: MembershipRestorePolicyPort
): Promise<DeletionOperation> {
  const [snapshot] = await db
    .select()
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  if (!snapshot || snapshot.scope === "identity") {
    refuse("operation_not_available");
  }
  if (snapshot.state === "cancelled") return snapshot;
  const authorityBindingDigest = scopedCancellationAuthorityBinding(snapshot);
  const cancellationSteps: readonly JournalPlanStep[] = [
    { from: snapshot.state, to: "cancelled" },
  ];
  const planDigest = journalPlanDigest(
    cancellationSteps,
    authorityBindingDigest
  );
  if (!hasExactJournalReservation(snapshot, planDigest)) {
    refuse("cancellation_reservation_invalid");
  }
  return db.transaction(async (tx) => {
    const authority = await requireReservedScopedCancellationInTx(
      tx,
      operationId,
      planDigest
    );
    return applyScopedCancellationInTx(
      tx,
      authority,
      cancellationSteps,
      authorityBindingDigest,
      journal,
      membershipRestore
    );
  });
}

export type IdentityCancellationReport = Readonly<{
  operation: DeletionOperation;
  restoredMembershipIds: readonly string[];
  conflicts: readonly Readonly<{ membershipId: string; outcome: string }>[];
  cancellationReceipt: string;
}>;

type IdentityCancellationAuthority = Readonly<{
  operation: DeletionOperation & { userId: string };
  proofId: string;
  proofAuthUserId: string;
  domainAuthUserId: string;
  factorVerifiedAt: Date;
  proofExpiresAt: Date;
  statusReceiptDigest: string;
  recoverySessionId: string;
  recoverySessionOperationId: string;
  recoverySessionConsumedAt: Date;
  snapshots: readonly (typeof deletionMembershipSnapshots.$inferSelect)[];
}>;

/**
 * Which delivery-receipt invariant the provider's confirmation failed, or null.
 *
 * The three CLOCK checks carry a bounded tolerance. `deliveredAt` is produced
 * by the delivery side (in production, a mail provider's own clock on another
 * machine); `recoveryDeliveryAttemptedAt` and `now` come from the database. A
 * zero-tolerance comparison between two machines' clocks refuses correct
 * deliveries whenever they disagree by a millisecond, which is a liveness bug
 * on the path that carries someone's only way to cancel an irreversible
 * deletion. The tolerance is deliberately small and one-directional: it admits
 * ordinary skew and still refuses a receipt claiming a delivery days early or
 * after the credential expired, which is what the check is actually for.
 */
const DELIVERY_CLOCK_TOLERANCE_MS = CROSS_CLOCK_TOLERANCE_MS;

function deliveryReceiptMismatchCode(
  delivery: {
    operationId: string;
    commandId: string;
    attempt: number;
    secretDigest: string;
    recipientDigest: string;
    expiresAt: unknown;
    deliveredAt: unknown;
    deliveryReceiptDigest: string;
  },
  request: { operationId: string; commandId: string; attempt: number; secretDigest: string; recipientDigest: string; expiresAt: Date },
  current: { recoveryDeliveryAttemptedAt: Date | null },
  now: Date
): string | null {
  if (delivery.operationId !== request.operationId) return "delivery_receipt_operation";
  if (delivery.commandId !== request.commandId) return "delivery_receipt_command";
  if (delivery.attempt !== request.attempt) return "delivery_receipt_attempt";
  if (delivery.secretDigest !== request.secretDigest) return "delivery_receipt_secret_digest";
  if (delivery.recipientDigest !== request.recipientDigest) return "delivery_receipt_recipient_digest";
  if (!(delivery.expiresAt instanceof Date)) return "delivery_receipt_expiry_shape";
  if (!(delivery.deliveredAt instanceof Date)) return "delivery_receipt_delivered_shape";
  if (delivery.expiresAt.getTime() !== request.expiresAt.getTime()) return "delivery_receipt_expiry_value";
  if (!/^[0-9a-f]{64}$/.test(delivery.deliveryReceiptDigest)) return "delivery_receipt_digest_shape";
  if (!current.recoveryDeliveryAttemptedAt) return "delivery_receipt_no_attempt";
  const delivered = delivery.deliveredAt.getTime();
  if (delivered < current.recoveryDeliveryAttemptedAt.getTime() - DELIVERY_CLOCK_TOLERANCE_MS) {
    return "delivery_receipt_before_attempt";
  }
  if (delivered > now.getTime() + DELIVERY_CLOCK_TOLERANCE_MS) return "delivery_receipt_in_future";
  // NO tolerance on expiry: that is a real deadline, not a clock comparison.
  if (delivered > request.expiresAt.getTime()) return "delivery_receipt_after_expiry";
  return null;
}

/**
 * Constant-time hex-digest comparison.
 *
 * This file establishes the rule twice by hand (`timingSafeEqual` on the
 * recovery secret, and again on the status-receipt read path) and then broke it
 * once, with a plain `!==` on the cancellation-receipt digest. Not exploitable
 * — the leak would be over a digest whose PREIMAGE is what an attacker needs,
 * and a valid `proofId` already gates the row — but a rule a file follows twice
 * and breaks once is a rule no reader can rely on.
 */
function digestEquals(left: string | null, right: string): left is string {
  // A TYPE GUARD, because the `!==` this replaces was doing double duty: it
  // also narrowed `statusReceiptDigest` from `string | null`. A null digest is
  // never equal, and the caller still gets its narrowing.
  if (left === null) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function requireIdentityCancellationAuthorityInTx(
  tx: TxLike,
  operationId: string,
  recoverySecret: string,
  params: Readonly<{
    proofId: string;
    cancellationReceipt: string;
    reauthMaxAgeMs?: number;
  }>
): Promise<IdentityCancellationAuthority> {
  const selectAuthority = () =>
    tx
      .select({
        operation: deletionOperations,
        proofAuthUserId: deletionCancellationProofs.authUserId,
        factorVerifiedAt: deletionCancellationProofs.factorVerifiedAt,
        proofExpiresAt: deletionCancellationProofs.expiresAt,
        proofConsumedAt: deletionCancellationProofs.consumedAt,
        statusReceiptDigest: deletionCancellationProofs.statusReceiptDigest,
        recoverySessionId: deletionRecoverySessions.id,
        recoverySessionOperationId: deletionRecoverySessions.operationId,
        recoverySessionExpiresAt: deletionRecoverySessions.expiresAt,
        recoverySessionConsumedAt: deletionRecoverySessions.consumedAt,
        domainAuthUserId: users.authUserId,
      })
      .from(deletionCancellationProofs)
      .innerJoin(
        deletionRecoverySessions,
        eq(deletionRecoverySessions.id, deletionCancellationProofs.recoverySessionId)
      )
      .innerJoin(
        deletionOperations,
        eq(deletionOperations.id, deletionCancellationProofs.operationId)
      )
      .innerJoin(users, eq(users.id, deletionOperations.userId))
      .where(
        and(
          eq(deletionCancellationProofs.id, params.proofId),
          eq(deletionOperations.id, operationId),
          eq(deletionOperations.scope, "identity"),
          eq(
            deletionRecoverySessions.operationId,
            deletionCancellationProofs.operationId
          ),
          eq(
            deletionRecoverySessions.authUserId,
            deletionCancellationProofs.authUserId
          )
        )
      )
      .limit(1);
  const [initial] = await selectAuthority();
  if (!initial?.operation.userId) refuse("operation_not_available");
  await lockIdentityMembershipGraph(tx, initial.operation.userId);
  const snapshots = await tx
    .select()
    .from(deletionMembershipSnapshots)
    .where(eq(deletionMembershipSnapshots.operationId, initial.operation.id));
  for (const workspaceId of sortedWorkspaceIds(snapshots.map((row) => row.workspaceId))) {
    await lockWorkspaceMembershipGraph(tx, workspaceId);
  }
  const now = await databaseNow(tx);
  const [locked] = await selectAuthority();
  const operation = locked?.operation;
  if (
    !locked ||
    !operation?.userId ||
    operation.scope !== "identity" ||
    operation.state === "cancelled" ||
    locked.proofConsumedAt ||
    !digestEquals(locked.statusReceiptDigest, digest(params.cancellationReceipt)) ||
    locked.proofAuthUserId !== locked.domainAuthUserId ||
    locked.proofExpiresAt.getTime() <= now.getTime() ||
    locked.recoverySessionOperationId !== operation.id ||
    !locked.recoverySessionConsumedAt ||
    locked.recoverySessionConsumedAt.getTime() > locked.factorVerifiedAt.getTime() ||
    locked.recoverySessionExpiresAt.getTime() <=
      locked.recoverySessionConsumedAt.getTime()
  ) {
    refuse("operation_changed_while_locking");
  }
  const proofWindowMs = resolveReauthWindow(params.reauthMaxAgeMs);
  if (
    locked.factorVerifiedAt.getTime() > now.getTime() + CROSS_CLOCK_TOLERANCE_MS ||
    now.getTime() - locked.factorVerifiedAt.getTime() > proofWindowMs
  ) {
    refuse("reauthentication_missing_or_stale");
  }
  if (
    !operation.recoverySecretDigest ||
    operation.recoveryConsumedAt ||
    !operation.recoveryExpiresAt ||
    operation.recoveryExpiresAt.getTime() <= now.getTime() ||
    !operation.graceExpiresAt ||
    operation.graceExpiresAt.getTime() <= now.getTime()
  ) {
    refuse("recovery_secret_unavailable");
  }
  const actual = Buffer.from(digest(recoverySecret), "hex");
  const expected = Buffer.from(operation.recoverySecretDigest, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    refuse("recovery_secret_invalid");
  }
  return {
    operation: operation as DeletionOperation & { userId: string },
    proofId: params.proofId,
    proofAuthUserId: locked.proofAuthUserId,
    domainAuthUserId: locked.domainAuthUserId,
    factorVerifiedAt: locked.factorVerifiedAt,
    proofExpiresAt: locked.proofExpiresAt,
    statusReceiptDigest: locked.statusReceiptDigest,
    recoverySessionId: locked.recoverySessionId,
    recoverySessionOperationId: locked.recoverySessionOperationId,
    recoverySessionConsumedAt: locked.recoverySessionConsumedAt,
    snapshots,
  };
}

async function requireReservedIdentityCancellationInTx(
  tx: TxLike,
  operationId: string,
  expectedPlanDigest?: string
): Promise<Readonly<{
  authority: IdentityCancellationAuthority;
  authorityBindingDigest: string;
  cancellationSteps: readonly JournalPlanStep[];
  planDigest: string;
}>> {
  const [snapshot] = await tx
    .select()
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  if (
    !snapshot?.userId ||
    snapshot.scope !== "identity" ||
    snapshot.state === "cancelled" ||
    !snapshot.journalIntentPlanDigest ||
    (expectedPlanDigest !== undefined &&
      snapshot.journalIntentPlanDigest !== expectedPlanDigest)
  ) {
    refuse("cancellation_reservation_invalid");
  }
  const planDigest = snapshot.journalIntentPlanDigest;
  const cancellationSteps: readonly JournalPlanStep[] = [
    { from: snapshot.state, to: "cancelled" },
  ];

  await lockIdentityMembershipGraph(tx, snapshot.userId);
  const snapshots = await tx
    .select()
    .from(deletionMembershipSnapshots)
    .where(eq(deletionMembershipSnapshots.operationId, operationId));
  for (const workspaceId of sortedWorkspaceIds(snapshots.map((row) => row.workspaceId))) {
    await lockWorkspaceMembershipGraph(tx, workspaceId);
  }
  const [locked] = await tx
    .select({ operation: deletionOperations, domainAuthUserId: users.authUserId })
    .from(deletionOperations)
    .innerJoin(users, eq(users.id, deletionOperations.userId))
    .where(eq(deletionOperations.id, operationId))
    .limit(1);
  if (
    !locked?.operation.userId ||
    locked.operation.scope !== "identity" ||
    locked.operation.state !== snapshot.state ||
    locked.operation.userId !== snapshot.userId ||
    !hasExactJournalReservation(locked.operation, planDigest)
  ) {
    refuse("cancellation_reservation_changed");
  }

  const proofRows = await tx
    .select({
      proofId: deletionCancellationProofs.id,
      proofAuthUserId: deletionCancellationProofs.authUserId,
      factorVerifiedAt: deletionCancellationProofs.factorVerifiedAt,
      proofExpiresAt: deletionCancellationProofs.expiresAt,
      proofConsumedAt: deletionCancellationProofs.consumedAt,
      statusReceiptDigest: deletionCancellationProofs.statusReceiptDigest,
      recoverySessionId: deletionRecoverySessions.id,
      recoverySessionOperationId: deletionRecoverySessions.operationId,
      recoverySessionAuthUserId: deletionRecoverySessions.authUserId,
      recoverySessionConsumedAt: deletionRecoverySessions.consumedAt,
    })
    .from(deletionCancellationProofs)
    .innerJoin(
      deletionRecoverySessions,
      eq(deletionRecoverySessions.id, deletionCancellationProofs.recoverySessionId)
    )
    .where(
      and(
        eq(deletionCancellationProofs.operationId, operationId),
        eq(
          deletionRecoverySessions.operationId,
          deletionCancellationProofs.operationId
        ),
        eq(
          deletionRecoverySessions.authUserId,
          deletionCancellationProofs.authUserId
        )
      )
    );
  const matching = proofRows.flatMap((proof): IdentityCancellationAuthority[] => {
    if (
      proof.proofConsumedAt ||
      !proof.recoverySessionConsumedAt ||
      !proof.statusReceiptDigest ||
      proof.proofAuthUserId !== locked.domainAuthUserId ||
      proof.recoverySessionAuthUserId !== locked.domainAuthUserId
    ) {
      return [];
    }
    const authority: IdentityCancellationAuthority = {
      operation: locked.operation as DeletionOperation & { userId: string },
      proofId: proof.proofId,
      proofAuthUserId: proof.proofAuthUserId,
      domainAuthUserId: locked.domainAuthUserId,
      factorVerifiedAt: proof.factorVerifiedAt,
      proofExpiresAt: proof.proofExpiresAt,
      statusReceiptDigest: proof.statusReceiptDigest,
      recoverySessionId: proof.recoverySessionId,
      recoverySessionOperationId: proof.recoverySessionOperationId,
      recoverySessionConsumedAt: proof.recoverySessionConsumedAt,
      snapshots,
    };
    const authorityBindingDigest = identityCancellationAuthorityBinding(authority);
    return journalPlanDigest(cancellationSteps, authorityBindingDigest) === planDigest
      ? [authority]
      : [];
  });
  if (matching.length !== 1) {
    refuse("cancellation_reservation_authority_unavailable");
  }
  const authority = matching[0]!;
  return {
    authority,
    authorityBindingDigest: identityCancellationAuthorityBinding(authority),
    cancellationSteps,
    planDigest,
  };
}

type IdentityCancellationExecution = Omit<
  IdentityCancellationReport,
  "cancellationReceipt"
>;

async function applyIdentityCancellationInTx(
  tx: TxLike,
  resolved: Awaited<ReturnType<typeof requireReservedIdentityCancellationInTx>>,
  ports: Readonly<{
    journal: DeletionJournalPort;
    membershipRestore: MembershipRestorePolicyPort;
  }>
): Promise<IdentityCancellationExecution> {
  const {
    authority,
    authorityBindingDigest,
    cancellationSteps,
  } = resolved;
  const { operation, snapshots } = authority;
  const now = await databaseNow(tx);
  const cancellationReplayDigest = authority.statusReceiptDigest;
  const identityCancellationReceiptExpiresAt = new Date(
    now.getTime() + DELETION_REAUTH_MAX_AGE_MS
  );
  await appendJournalTransitionInTx(
    tx,
    operation,
    "cancelled",
    ports.journal,
    now,
    {
      steps: cancellationSteps,
      authorityBindingDigest,
      planIndex: 0,
      cancellationReplayDigest,
      identityCancellationReceiptExpiresAt,
    }
  );
  const [consumedProof] = await tx
    .update(deletionCancellationProofs)
    .set({ consumedAt: now })
    .where(
      and(
        eq(deletionCancellationProofs.id, authority.proofId),
        eq(deletionCancellationProofs.operationId, operation.id),
        eq(deletionCancellationProofs.authUserId, authority.domainAuthUserId),
        eq(
          deletionCancellationProofs.statusReceiptDigest,
          cancellationReplayDigest
        ),
        isNull(deletionCancellationProofs.consumedAt)
      )
    )
    .returning({ id: deletionCancellationProofs.id });
  if (!consumedProof) refuse("cancellation_proof_conflict");

  const restoredMembershipIds: string[] = [];
  const conflicts: { membershipId: string; outcome: string }[] = [];
  for (const snapshot of snapshots) {
    const [membership] = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.id, snapshot.membershipId))
      .limit(1);
    let outcome:
      | "restored"
      | "removed"
      | "changed"
      | "workspace_unavailable"
      | "seat_refused";
    if (!membership) outcome = "removed";
    else if (
      membership.userId !== operation.userId ||
      membership.workspaceId !== snapshot.workspaceId ||
      membership.lifecycleState !== "deletion_suspended" ||
      membership.suspensionOperationId !== operation.id ||
      membership.suspendedRole !== snapshot.role ||
      membership.suspendedVersion !== snapshot.membershipVersion ||
      membership.version !== snapshot.membershipVersion + 1
    ) {
      outcome = "changed";
    } else {
      // One state, not two that drift (R-162, P5-R5): a workspace tombstoned
      // by a still-cancellable deletion takes its member back, so the person
      // can reach the page that cancels it. Before, this was
      // `workspace_unavailable` and the membership stayed suspended forever.
      if (!(await workspaceAdmitsMembershipRestoreInTx(tx, snapshot.workspaceId))) {
        outcome = "workspace_unavailable";
      } else {
        const decision = await ports.membershipRestore.mayRestore(
          {
            operationId: operation.id,
            userId: operation.userId,
            membershipId: snapshot.membershipId,
            workspaceId: snapshot.workspaceId,
            role: snapshot.role,
            membershipVersion: snapshot.membershipVersion,
          },
          tx
        );
        if (!decision.allowed) {
          outcome = "seat_refused";
        } else {
          const [restored] = await tx
            .update(memberships)
            .set({
              role: snapshot.role,
              lifecycleState: "active",
              suspendedRole: null,
              suspendedVersion: null,
              suspensionOperationId: null,
              version: membership.version + 1,
            })
            .where(
              and(
                eq(memberships.id, membership.id),
                eq(memberships.version, membership.version),
                eq(memberships.lifecycleState, "deletion_suspended")
              )
            )
            .returning({ id: memberships.id });
          outcome = restored ? "restored" : "changed";
        }
      }
    }
    await tx
      .update(deletionMembershipSnapshots)
      .set({ outcome, outcomeAt: now })
      .where(
        and(
          eq(deletionMembershipSnapshots.id, snapshot.id),
          eq(deletionMembershipSnapshots.outcome, "pending")
        )
      );
    if (outcome === "restored") restoredMembershipIds.push(snapshot.membershipId);
    else conflicts.push({ membershipId: snapshot.membershipId, outcome });
  }
  const [restoredIdentity] = await tx
    .update(users)
    .set({ lifecycleState: "active", updatedAt: now })
    .where(
      and(
        eq(users.id, operation.userId),
        eq(users.lifecycleState, "tombstoned")
      )
    )
    .returning({ id: users.id });
  if (!restoredIdentity) refuse("identity_restore_conflict");
  await tx
    .update(authUser)
    .set({ ordinaryLoginDisabledAt: null, updatedAt: now })
    .where(eq(authUser.id, authority.domainAuthUserId));

  // Start the status-receipt lifetime after all external policy work finishes.
  const statusReceiptIssuedAt = await databaseNow(tx);
  const statusReceiptExpiresAt = new Date(
    statusReceiptIssuedAt.getTime() + DELETION_REAUTH_MAX_AGE_MS
  );
  const [finalized] = await tx
    .update(deletionOperations)
    .set({
      recoverySecretDigest: null,
      recoverySecretPrefix: null,
      recoveryConsumedAt: now,
      identityCancellationReceiptExpiresAt: statusReceiptExpiresAt,
      updatedAt: statusReceiptIssuedAt,
    })
    .where(
      and(
        eq(deletionOperations.id, operation.id),
        eq(deletionOperations.state, "cancelled"),
        eq(deletionOperations.cancellationReplayDigest, cancellationReplayDigest)
      )
    )
    .returning();
  if (!finalized) refuse("identity_cancellation_finalize_conflict");
  return { operation: finalized, restoredMembershipIds, conflicts };
}

export async function cancelIdentityDeletion(
  db: DbLike,
  operationId: string,
  recoverySecret: string,
  params: Readonly<{
    proofId: string;
    cancellationReceipt: string;
    reauthMaxAgeMs?: number;
  }>,
  ports: Readonly<{
    journal: DeletionJournalPort;
    membershipRestore: MembershipRestorePolicyPort;
  }>
): Promise<IdentityCancellationReport> {
  if (!validRecoverySecret(params.cancellationReceipt)) {
    refuse("cancellation_receipt_invalid");
  }
  const initialAuthority = await db.transaction((tx) =>
    requireIdentityCancellationAuthorityInTx(
      tx,
      operationId,
      recoverySecret,
      params
    )
  );
  const authorityBindingDigest =
    identityCancellationAuthorityBinding(initialAuthority);
  const cancellationSteps: readonly JournalPlanStep[] = [
    { from: initialAuthority.operation.state, to: "cancelled" },
  ];
  const cancellationPlanDigest = await prepareJournalPlan(
    db,
    operationId,
    cancellationSteps,
    {
      authorityBindingDigest,
      beforeReserve: async (tx, planDigest) => {
        if (await hasReservedJournalPlan(tx, operationId, planDigest)) return;
        const currentAuthority = await requireIdentityCancellationAuthorityInTx(
          tx,
          operationId,
          recoverySecret,
          params
        );
        if (
          identityCancellationAuthorityBinding(currentAuthority) !==
          authorityBindingDigest
        ) {
          refuse("cancellation_authority_binding_changed");
        }
      },
    }
  );
  const execution = await db.transaction(async (tx) => {
    const resolved = await requireReservedIdentityCancellationInTx(
      tx,
      operationId,
      cancellationPlanDigest
    );
    return applyIdentityCancellationInTx(tx, resolved, ports);
  });
  return {
    ...execution,
    cancellationReceipt: params.cancellationReceipt,
  };
}

export type IdentityCancellationResumeReport = IdentityCancellationExecution;

/** System-only crash recovery: no recovery secret, proof id, or receipt plaintext. */
export async function resumeIdentityDeletionCancellation(
  db: DbLike,
  operationId: string,
  ports: Readonly<{
    journal: DeletionJournalPort;
    membershipRestore: MembershipRestorePolicyPort;
  }>
): Promise<IdentityCancellationResumeReport> {
  return db.transaction(async (tx) => {
    const [operation] = await tx
      .select()
      .from(deletionOperations)
      .where(
        and(
          eq(deletionOperations.id, operationId),
          eq(deletionOperations.scope, "identity")
        )
      )
      .limit(1);
    if (!operation?.userId) refuse("operation_not_available");
    if (operation.state === "cancelled") {
      const snapshots = await tx
        .select()
        .from(deletionMembershipSnapshots)
        .where(eq(deletionMembershipSnapshots.operationId, operationId));
      if (snapshots.some((snapshot) => snapshot.outcome === "pending")) {
        refuse("cancellation_replay_incomplete");
      }
      return {
        operation,
        restoredMembershipIds: snapshots
          .filter((snapshot) => snapshot.outcome === "restored")
          .map((snapshot) => snapshot.membershipId),
        conflicts: snapshots
          .filter((snapshot) => snapshot.outcome !== "restored")
          .map((snapshot) => ({
            membershipId: snapshot.membershipId,
            outcome: snapshot.outcome,
          })),
      };
    }
    const resolved = await requireReservedIdentityCancellationInTx(
      tx,
      operationId
    );
    return applyIdentityCancellationInTx(tx, resolved, ports);
  });
}

export type IdentityCancellationStatus = Readonly<{
  state: "cancelled";
  restoredMembershipIds: readonly string[];
  conflicts: readonly Readonly<{ membershipId: string; outcome: string }>[];
}>;

/** Bounded idempotent status receipt; recovery credentials never replay. */
export async function readIdentityCancellationStatus(
  db: DbLike,
  operationId: string,
  cancellationReceipt: string
): Promise<IdentityCancellationStatus> {
  if (!validRecoverySecret(cancellationReceipt)) refuse("cancellation_receipt_invalid");
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [operation] = await tx
      .select()
      .from(deletionOperations)
      .where(
        and(
          eq(deletionOperations.id, operationId),
          eq(deletionOperations.scope, "identity"),
          eq(deletionOperations.state, "cancelled")
        )
      )
      .limit(1);
    if (
      !operation?.cancellationReplayDigest ||
      !operation.identityCancellationReceiptExpiresAt ||
      operation.identityCancellationReceiptExpiresAt.getTime() <= now.getTime()
    ) {
      refuse("cancellation_receipt_unavailable");
    }
    const actual = Buffer.from(digest(cancellationReceipt), "hex");
    const expected = Buffer.from(operation.cancellationReplayDigest, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      refuse("cancellation_receipt_invalid");
    }
    const snapshots = await tx
      .select()
      .from(deletionMembershipSnapshots)
      .where(eq(deletionMembershipSnapshots.operationId, operationId));
    if (snapshots.some((snapshot) => snapshot.outcome === "pending")) {
      refuse("cancellation_replay_incomplete");
    }
    return {
      state: "cancelled",
      restoredMembershipIds: snapshots
        .filter((snapshot) => snapshot.outcome === "restored")
        .map((snapshot) => snapshot.membershipId),
      conflicts: snapshots
        .filter((snapshot) => snapshot.outcome !== "restored")
        .map((snapshot) => ({
          membershipId: snapshot.membershipId,
          outcome: snapshot.outcome,
        })),
    };
  });
}

/**
 * Worker-only forward transitions (Task 4 executor). Every one still appends
 * a journal version. The two irreversible receipts (`verifying`, `complete`)
 * are appended only inside the executor's erasure transaction, never here;
 * cancellation keeps its scope authority. `grace` and `erasing` re-read the
 * pre-grace command population in the SAME transaction: an unknown or failed
 * fence can never be stepped over (plan C2).
 */
async function validateWorkerTransitionInTx(
  tx: TxLike,
  operation: DeletionOperation,
  toState: DeletionOperationState,
  now: Date
): Promise<void> {
  if (operation.state === toState) return;
  if (toState === "cancelled") refuse("cancellation_requires_scope_authority");
  if (operation.acknowledgedAt === null) refuse("operation_not_acknowledged");
  if (toState === "verifying" || toState === "complete") {
    refuse("irreversible_transition_requires_erasure_transaction");
  }
  assertDeletionTransition(operation.state, toState);
  // The third copy of the blocked guard. It needs no `cancelled` exception,
  // unlike `appendJournalTransitionInTx`'s (R-162): the worker refuses a
  // cancellation above (`cancellation_requires_scope_authority`), and the
  // compiler narrows `toState` here so that writing the exception is a type
  // error — the cancellation path is the scope-authority append, never this.
  if (operation.state === "blocked" && operation.blockedResumeState !== toState) {
    refuse("blocked_reconciliation_target_mismatch");
  }
  if (toState === "grace" || toState === "erasing") {
    const commands = await externalCommandSummary(tx, operation.id, "pre_grace");
    if (commands.unknown > 0) refuse("external_command_unknown");
    if (commands.failed > 0) refuse("external_command_failed");
    if (commands.pending > 0) refuse("external_command_pending");
  }
  if (
    toState === "erasing" &&
    (!operation.graceExpiresAt || now.getTime() < operation.graceExpiresAt.getTime())
  ) {
    refuse("grace_window_open");
  }
}

/**
 * Releases a reservation whose plan was abandoned before its first append —
 * Task 4's erasure that rolled back on residue or a refusal (round-1 lean
 * BLOCK C1: the reservation is taken in its own committed transaction, so a
 * rolled-back erasure left it behind and the next plan, `blocked`, conflicted
 * with it forever). Only the reservation with this exact digest is cleared,
 * and only while nothing of the plan has been appended (the base version is
 * still the current version), so a resumption of the same plan is never undone.
 */
export async function abandonJournalPlan(
  db: DbLike,
  operationId: string,
  planDigest: string
): Promise<boolean> {
  const rows = await db
    .update(deletionOperations)
    .set({
      journalIntentBaseVersion: null,
      journalIntentPlanDigest: null,
      journalIntentEffectiveAt: null,
    })
    .where(
      and(
        eq(deletionOperations.id, operationId),
        eq(deletionOperations.journalIntentPlanDigest, planDigest),
        sql`${deletionOperations.journalIntentBaseVersion} = ${deletionOperations.journalVersion}`
      )
    )
    .returning({ id: deletionOperations.id });
  return rows.length > 0;
}

export async function transitionDeletionOperation(
  db: DbLike,
  operationId: string,
  toState: DeletionOperationState,
  journal: DeletionJournalPort
): Promise<DeletionOperation> {
  const planSnapshot = await db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [operation] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1)
      .for("update");
    if (!operation) refuse("operation_not_found");
    await validateWorkerTransitionInTx(tx, operation, toState, now);
    return operation;
  });
  const transitionSteps: readonly JournalPlanStep[] = [
    { from: planSnapshot.state, to: toState },
  ];
  if (planSnapshot.state !== toState) {
    await prepareJournalPlan(db, operationId, transitionSteps, {
      validateOperation: (operation, now, tx) =>
        validateWorkerTransitionInTx(tx, operation, toState, now),
    });
  }
  return db.transaction(async (tx) => {
    const now = await databaseNow(tx);
    const [operation] = await tx
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, operationId))
      .limit(1);
    if (!operation) refuse("operation_not_found");
    await validateWorkerTransitionInTx(tx, operation, toState, now);
    if (operation.state === toState) return operation;
    return appendJournalTransitionInTx(tx, operation, toState, journal, now, {
      steps: transitionSteps,
      planIndex: 0,
    });
  });
}

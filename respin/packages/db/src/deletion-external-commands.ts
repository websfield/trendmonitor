// Phase 10b-1 Task 4 — the external-command outbox (plan C2).
//
// Every side effect the deletion lifecycle takes outside this database —
// Stripe subscription cancellation and its reversal, auto-top-up disable,
// immediate cancellation and customer-field clearing at erasure — is first a
// durable row here. The row id is the provider idempotency key, so a crash
// between "stored" and "dispatched" replays the SAME command rather than a
// second one. An `unknown` outcome is never treated as success: it blocks the
// operation's next transition until a reconciliation resolves it.
//
// This module is the sole APPLICATION writer of `deletion_external_commands`
// (`LIFECYCLE_WRITER_INVENTORY`); at erasure the registry-driven SQL port
// (`lifecycle-sql-port.ts`, `DYNAMIC_LIFECYCLE_WRITER`) rewrites the row's
// link columns, covered by registry closure and the independent probe rather
// than by the writer scanner. The lifecycle executor (Task 4.3) holds the
// operation lease while it calls these functions; nothing here takes the
// membership-graph locks itself.
import { createHash } from "node:crypto";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { DbLike, TxLike } from "./db-like";
import {
  deletionExternalCommands,
  deletionOperations,
  type DeletionExternalCommand,
  type DeletionExternalCommandKind,
  type DeletionExternalCommandPhase,
  type DeletionExternalCommandStatus,
  type DeletionOperation,
  type DeletionOperationState,
  type DeletionScope,
} from "./lifecycle-schema";

function refuse(code: string): never {
  throw new Error(`external_command_refused:${code}`);
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Closed population. A new side effect is a list edit here AND a migration. */
export const EXTERNAL_COMMAND_KINDS = [
  "stripe_subscription_cancel_at_period_end",
  "stripe_subscription_reopen",
  "auto_topup_disable",
  "stripe_subscription_cancel_now",
  "stripe_customer_personal_fields_clear",
] as const satisfies readonly DeletionExternalCommandKind[];

/**
 * Reversible fences may run before or during grace; the reversal runs only for
 * a cancelled operation; irreversible deletes only once the journal is durably
 * in `erasing`. The migration CHECK repeats this so a caller cannot bypass it.
 */
export const EXTERNAL_COMMAND_PHASE_BY_KIND = {
  stripe_subscription_cancel_at_period_end: "pre_grace",
  auto_topup_disable: "pre_grace",
  stripe_subscription_reopen: "cancellation",
  stripe_subscription_cancel_now: "erasing",
  stripe_customer_personal_fields_clear: "erasing",
} as const satisfies Readonly<
  Record<DeletionExternalCommandKind, DeletionExternalCommandPhase>
>;

/**
 * The `auto_topup_disable` fence's contract. Charge authority is ANY of the
 * four fields the owner's disable action and the webhook's dead-subscription
 * reset clear together: the legacy bit (fenced off by migration 0048), the v1
 * bit (the sole charge authority), the rearm desire (which the rollout
 * activator would otherwise re-arm v1 from) and the cap. The fence is due
 * while any is armed and has succeeded only when all are cleared; a site that
 * reads one flag alone was the round-1 billing BLOCK.
 */
export type AutoTopupChargeAuthority = Readonly<{
  autoTopupEnabled: boolean;
  autoTopupV1Enabled: boolean;
  autoTopupRearmAfterUpgrade: boolean;
  autoTopupMonthlyCapCents: number | null;
}>;

export const AUTO_TOPUP_DISARMED_FIELDS = {
  autoTopupEnabled: false,
  autoTopupV1Enabled: false,
  autoTopupRearmAfterUpgrade: false,
  autoTopupMonthlyCapCents: null,
} as const satisfies AutoTopupChargeAuthority;

export function autoTopupChargeAuthorityArmed(row: AutoTopupChargeAuthority): boolean {
  return (
    row.autoTopupEnabled ||
    row.autoTopupV1Enabled ||
    row.autoTopupRearmAfterUpgrade ||
    row.autoTopupMonthlyCapCents !== null
  );
}

/**
 * A Stripe customer belongs to a workspace's subscription row, so every kind
 * is workspace-scoped; the migration CHECK still admits `identity` for the
 * customer clear as a superset backstop (round-1 lean NOTE C11 narrowed the
 * list here rather than republishing 0050).
 */
const EXTERNAL_COMMAND_SCOPES_BY_KIND = {
  stripe_subscription_cancel_at_period_end: ["workspace"],
  auto_topup_disable: ["workspace"],
  stripe_subscription_reopen: ["workspace"],
  stripe_subscription_cancel_now: ["workspace"],
  stripe_customer_personal_fields_clear: ["workspace"],
} as const satisfies Readonly<
  Record<DeletionExternalCommandKind, readonly DeletionScope[]>
>;

const ADMITTING_STATES = {
  pre_grace: ["tombstoned", "external_actions_pending"],
  cancellation: ["cancelled"],
  erasing: ["erasing"],
} as const satisfies Readonly<
  Record<DeletionExternalCommandPhase, readonly DeletionOperationState[]>
>;

export type ExternalCommandResult =
  | Readonly<{ outcome: "succeeded"; providerRef?: string }>
  | Readonly<{ outcome: "failed"; failureCode: string }>
  | Readonly<{ outcome: "unknown"; reconciliationDigest: string }>;

/**
 * Domain port. `execute` is called exactly once per (command, attempt) after
 * the row is marked dispatched; `reconcile` is called for an `unknown` row and
 * must be read-only at the provider. Throwing from either is recorded as
 * `unknown`, never as failure, because the provider may already have acted.
 */
export interface ExternalCommandPort {
  execute(command: DeletionExternalCommand): Promise<ExternalCommandResult>;
  reconcile(command: DeletionExternalCommand): Promise<ExternalCommandResult>;
}

export type ExternalCommandSummary = Readonly<
  Record<DeletionExternalCommandStatus, number>
>;

function payloadHash(input: Readonly<{
  operationId: string;
  kind: DeletionExternalCommandKind;
  attempt: number;
  targetKey: string;
}>): string {
  return digest(JSON.stringify({ schema: 1, ...input }));
}

async function databaseNow(tx: TxLike): Promise<Date> {
  const result = (await tx.execute(
    sql`SELECT clock_timestamp() AS now`
  )) as unknown as { rows: { now: Date | string }[] };
  const raw = result.rows[0]?.now;
  const value = raw instanceof Date ? raw : new Date(raw ?? Number.NaN);
  if (Number.isNaN(value.getTime())) refuse("database_clock_unavailable");
  return value;
}

function assertKindAdmitted(
  operation: DeletionOperation,
  kind: DeletionExternalCommandKind
): DeletionExternalCommandPhase {
  const phase = EXTERNAL_COMMAND_PHASE_BY_KIND[kind];
  const scopes: readonly DeletionScope[] = EXTERNAL_COMMAND_SCOPES_BY_KIND[kind];
  if (!scopes.includes(operation.scope)) refuse("kind_scope_mismatch");
  const states: readonly DeletionOperationState[] = ADMITTING_STATES[phase];
  if (!states.includes(operation.state)) refuse(`kind_phase_state:${phase}:${operation.state}`);
  return phase;
}

export async function latestExternalCommandInTx(
  tx: TxLike,
  operationId: string,
  kind: DeletionExternalCommandKind
): Promise<DeletionExternalCommand | undefined> {
  const [row] = await tx
    .select()
    .from(deletionExternalCommands)
    .where(
      and(
        eq(deletionExternalCommands.operationId, operationId),
        eq(deletionExternalCommands.kind, kind)
      )
    )
    .orderBy(desc(deletionExternalCommands.attempt))
    .limit(1)
    .for("update");
  return row;
}

/**
 * Idempotent: the same (operation, kind) returns the latest existing row in
 * any status. A failed command is retried only through the explicit retry
 * below; an `unknown` one is never retried at all.
 */
export async function enqueueExternalCommandInTx(
  tx: TxLike,
  operation: DeletionOperation,
  kind: DeletionExternalCommandKind
): Promise<DeletionExternalCommand> {
  const phase = assertKindAdmitted(operation, kind);
  const existing = await latestExternalCommandInTx(tx, operation.id, kind);
  if (existing) return existing;
  const attempt = 1;
  const [created] = await tx
    .insert(deletionExternalCommands)
    .values({
      operationId: operation.id,
      scope: operation.scope,
      targetKey: operation.targetKey,
      userId: operation.userId,
      workspaceId: operation.workspaceId,
      profileId: operation.profileId,
      kind,
      phase,
      attempt,
      payloadHash: payloadHash({
        operationId: operation.id,
        kind,
        attempt,
        targetKey: operation.targetKey,
      }),
    })
    .returning();
  if (!created) refuse("insert_failed");
  return created;
}

/**
 * The attempt bound, owned by the sole writer so no call site can retry past
 * it (round-1 lean NOTE C12): a definitively failing provider call stops
 * looping after three attempts and waits for an operator.
 */
export const EXTERNAL_COMMAND_MAX_ATTEMPTS = 3;

/** A new attempt exists only for a `failed` predecessor under the bound; `unknown` reconciles. */
export async function retryFailedExternalCommandInTx(
  tx: TxLike,
  operation: DeletionOperation,
  kind: DeletionExternalCommandKind
): Promise<DeletionExternalCommand> {
  const phase = assertKindAdmitted(operation, kind);
  const previous = await latestExternalCommandInTx(tx, operation.id, kind);
  if (!previous) refuse("nothing_to_retry");
  if (previous.status !== "failed") refuse(`retry_requires_failed:${previous.status}`);
  if (previous.attempt >= EXTERNAL_COMMAND_MAX_ATTEMPTS) refuse("retry_attempts_exhausted");
  const attempt = previous.attempt + 1;
  const [created] = await tx
    .insert(deletionExternalCommands)
    .values({
      operationId: operation.id,
      scope: operation.scope,
      targetKey: operation.targetKey,
      userId: operation.userId,
      workspaceId: operation.workspaceId,
      profileId: operation.profileId,
      kind,
      phase,
      attempt,
      payloadHash: payloadHash({
        operationId: operation.id,
        kind,
        attempt,
        targetKey: operation.targetKey,
      }),
    })
    .returning();
  if (!created) refuse("insert_failed");
  return created;
}

/**
 * The dispatch mark precedes the provider call. A conditional update means a
 * second dispatcher racing on the same row sees zero rows and does NOT call
 * the provider again; the first dispatcher's outcome is the only outcome.
 * A lifecycle-phase row of an operation that has meanwhile been cancelled or
 * completed is never marked either (round-2 billing CHANGE): the cancellation
 * commits under the workspace lock, and this update re-evaluates its WHERE
 * after that commit, so a fence the owner cancelled ahead of never reaches
 * the provider. Cancellation-phase rows dispatch under `cancelled` by design.
 */
async function markDispatched(
  db: DbLike,
  ref: Readonly<{ commandId: string; attempt: number }>
): Promise<DeletionExternalCommand | null> {
  const [row] = await db
    .update(deletionExternalCommands)
    .set({ dispatchedAt: sql`clock_timestamp()`, updatedAt: sql`clock_timestamp()` })
    .where(
      and(
        eq(deletionExternalCommands.id, ref.commandId),
        eq(deletionExternalCommands.attempt, ref.attempt),
        eq(deletionExternalCommands.status, "pending"),
        isNull(deletionExternalCommands.dispatchedAt),
        sql`EXISTS (
          SELECT 1 FROM ${deletionOperations} AS o
          WHERE o.id = ${deletionExternalCommands.operationId}
            AND (${deletionExternalCommands.phase} = 'cancellation' OR o.state NOT IN ('cancelled', 'complete'))
        )`
      )
    )
    .returning();
  return row ?? null;
}

/**
 * The ONE outcome writer. Transitions: pending → any; unknown → succeeded |
 * failed (reconciled) | unknown (still unknown, digest may refresh); a terminal
 * row accepts only an identical replay. A `succeeded` or `unknown` outcome for
 * a row that was never marked dispatched is refused: nothing can have reached
 * the provider.
 */
export async function recordExternalCommandOutcome(
  db: DbLike,
  ref: Readonly<{ commandId: string; attempt: number }>,
  result: ExternalCommandResult
): Promise<DeletionExternalCommand> {
  if (result.outcome === "unknown" && !HEX64.test(result.reconciliationDigest)) {
    refuse("reconciliation_digest_invalid");
  }
  if (result.outcome === "failed" && (!result.failureCode || result.failureCode.length > 64)) {
    refuse("failure_code_invalid");
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(deletionExternalCommands)
      .where(eq(deletionExternalCommands.id, ref.commandId))
      .limit(1)
      .for("update");
    if (!current || current.attempt !== ref.attempt) refuse("command_not_found");
    const now = await databaseNow(tx);
    const providerRefDigest =
      result.outcome === "succeeded" && result.providerRef
        ? digest(`external-command:${current.id}:${current.attempt}:${result.providerRef}`)
        : null;
    if (current.status === "succeeded") {
      if (result.outcome !== "succeeded" || (providerRefDigest ?? null) !== current.providerRefDigest) {
        refuse("terminal_outcome_conflict");
      }
      return current;
    }
    if (current.status === "failed") {
      if (result.outcome !== "failed" || result.failureCode !== current.failureCode) {
        refuse("terminal_outcome_conflict");
      }
      return current;
    }
    if (result.outcome !== "failed" && current.dispatchedAt === null) {
      refuse("outcome_before_dispatch");
    }
    const [updated] = await tx
      .update(deletionExternalCommands)
      .set(
        result.outcome === "succeeded"
          ? {
              status: "succeeded",
              resolvedAt: now,
              providerRefDigest,
              failureCode: null,
              reconciliationDigest: null,
              updatedAt: now,
            }
          : result.outcome === "failed"
            ? {
                status: "failed",
                resolvedAt: now,
                providerRefDigest: null,
                failureCode: result.failureCode,
                reconciliationDigest: null,
                updatedAt: now,
              }
            : {
                status: "unknown",
                resolvedAt: null,
                providerRefDigest: null,
                failureCode: null,
                reconciliationDigest: result.reconciliationDigest,
                updatedAt: now,
              }
      )
      .where(
        and(
          eq(deletionExternalCommands.id, current.id),
          eq(deletionExternalCommands.attempt, current.attempt),
          eq(deletionExternalCommands.status, current.status)
        )
      )
      .returning();
    if (!updated) refuse("concurrent_outcome");
    return updated;
  });
}

function unknownAfterThrow(command: DeletionExternalCommand): ExternalCommandResult {
  return {
    outcome: "unknown",
    reconciliationDigest: digest(
      `external-command-unknown:${command.id}:${command.attempt}:adapter_threw`
    ),
  };
}

/**
 * Dispatch every `pending` command of one phase and reconcile every `unknown`
 * one. Runs without the operation lock: the executor's lease serialises
 * dispatchers, and the dispatch mark is the per-row fence for anything that
 * escapes it. Returns the post-dispatch summary so the caller decides the
 * lifecycle transition from durable state, never from this call's memory.
 */
export async function dispatchExternalCommands(
  db: DbLike,
  operationId: string,
  phase: DeletionExternalCommandPhase,
  port: ExternalCommandPort
): Promise<ExternalCommandSummary> {
  const candidates = await db
    .select()
    .from(deletionExternalCommands)
    .where(
      and(
        eq(deletionExternalCommands.operationId, operationId),
        eq(deletionExternalCommands.phase, phase)
      )
    )
    .orderBy(deletionExternalCommands.createdAt);
  for (const candidate of candidates) {
    if (candidate.status === "pending") {
      const dispatched = await markDispatched(db, {
        commandId: candidate.id,
        attempt: candidate.attempt,
      });
      if (!dispatched) continue;
      let result: ExternalCommandResult;
      try {
        result = await port.execute(dispatched);
      } catch {
        result = unknownAfterThrow(dispatched);
      }
      await recordExternalCommandOutcome(
        db,
        { commandId: dispatched.id, attempt: dispatched.attempt },
        result
      );
    } else if (candidate.status === "unknown") {
      let result: ExternalCommandResult;
      try {
        result = await port.reconcile(candidate);
      } catch {
        result = unknownAfterThrow(candidate);
      }
      await recordExternalCommandOutcome(
        db,
        { commandId: candidate.id, attempt: candidate.attempt },
        result
      );
    }
  }
  return db.transaction((tx) => externalCommandSummary(tx, operationId, phase));
}

/** Counts by status for the LATEST attempt of each kind in one phase. */
export async function externalCommandSummary(
  tx: TxLike,
  operationId: string,
  phase: DeletionExternalCommandPhase
): Promise<ExternalCommandSummary> {
  const latest = tx
    .select({
      kind: deletionExternalCommands.kind,
      latestAttempt: sql<number>`max(${deletionExternalCommands.attempt})`.as("latest_attempt"),
    })
    .from(deletionExternalCommands)
    .where(
      and(
        eq(deletionExternalCommands.operationId, operationId),
        eq(deletionExternalCommands.phase, phase)
      )
    )
    .groupBy(deletionExternalCommands.kind)
    .as("latest");
  const rows = await tx
    .select({
      status: deletionExternalCommands.status,
      value: count(),
    })
    .from(deletionExternalCommands)
    .innerJoin(
      latest,
      and(
        eq(latest.kind, deletionExternalCommands.kind),
        eq(latest.latestAttempt, deletionExternalCommands.attempt)
      )
    )
    .where(
      and(
        eq(deletionExternalCommands.operationId, operationId),
        eq(deletionExternalCommands.phase, phase)
      )
    )
    .groupBy(deletionExternalCommands.status);
  const summary: Record<DeletionExternalCommandStatus, number> = {
    pending: 0,
    succeeded: 0,
    failed: 0,
    unknown: 0,
  };
  for (const row of rows) summary[row.status] = Number(row.value);
  return summary;
}

/**
 * Cancellation refuses while any command is unknown OR in flight (dispatched,
 * outcome not yet recorded): the reversal cannot be planned against a fence
 * whose effect nobody knows yet (round-2 billing CHANGE — the in-flight case
 * was the surviving sliver of round 1's BLOCK 2). Every row is locked FOR
 * UPDATE so a dispatcher's mark serialises behind the cancellation commit,
 * where `markDispatched` then refuses on the terminal state.
 */
export async function assertCancellationCommandsSettledInTx(
  tx: TxLike,
  operationId: string
): Promise<void> {
  const rows = await tx
    .select({
      status: deletionExternalCommands.status,
      dispatchedAt: deletionExternalCommands.dispatchedAt,
    })
    .from(deletionExternalCommands)
    .where(eq(deletionExternalCommands.operationId, operationId))
    .for("update");
  if (rows.some((row) => row.status === "unknown")) refuse("unknown_outcome_pending");
  if (rows.some((row) => row.status === "pending" && row.dispatchedAt !== null)) refuse("command_in_flight");
}

/** Erasure refuses while any command outcome is unknown. */
export async function assertNoUnknownExternalCommands(
  tx: TxLike,
  operationId: string
): Promise<void> {
  const [row] = await tx
    .select({ value: count() })
    .from(deletionExternalCommands)
    .where(
      and(
        eq(deletionExternalCommands.operationId, operationId),
        eq(deletionExternalCommands.status, "unknown")
      )
    );
  if ((Number(row?.value) || 0) > 0) refuse("unknown_outcome_pending");
}

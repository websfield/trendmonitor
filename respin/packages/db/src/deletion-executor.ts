// Phase 10b-1 Task 4.3 — the deletion lifecycle executor.
//
// Runs ONLY in the worker (never in an HTTP request). Each tick claims due
// operations under a lease, advances each one state at a time, and releases
// the lease. Every forward transition still appends an immutable journal
// version through the injected port; the executor never advances a state the
// journal has not durably recorded.
//
//   tombstoned                → enqueue the reversible pre-grace commands
//   external_actions_pending  → dispatch them; all succeeded → grace;
//                               any unknown → wait; any failed → blocked
//   grace                     → after grace_expires_at AND the enablement
//                               port says yes → erasing (recovery digest gone)
//   erasing                   → irreversible commands, then ONE transaction:
//                               capture subjects → registry executors →
//                               independent residue probes → journal (verifying,
//                               complete) → commit (residue > 0 rolls the whole
//                               erasure back and appends nothing)
//   blocked                   → retry failed commands (bounded); resume when clean
//   cancelled                 → terminal, but due while the reversal of ITS
//                               period-end cancellation is still owed
import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { subscriptions } from "./billing-schema";
import {
  JSON_PATH_INVENTORY,
  LIFECYCLE_REGISTRY,
  ROW_CLASS_INVENTORY,
  SUPPORTING_LIFECYCLE_STORES,
  type LifecycleClassEntry,
} from "./creator-data-registry";
import type { DbLike, TxLike } from "./db-like";
import {
  autoTopupChargeAuthorityArmed,
  dispatchExternalCommands,
  enqueueExternalCommandInTx,
  EXTERNAL_COMMAND_MAX_ATTEMPTS,
  externalCommandSummary,
  retryFailedExternalCommandInTx,
  type ExternalCommandPort,
  type ExternalCommandSummary,
} from "./deletion-external-commands";
import {
  abandonJournalPlan,
  appendJournalTransitionInTx,
  databaseNow,
  prepareJournalPlan,
  transitionDeletionOperation,
  type JournalPlanStep,
} from "./deletion-lifecycle";
import type { DeletionJournalPort } from "./deletion-ports";
import { compileLifecycleExecutionTargets, LIFECYCLE_EXECUTORS } from "./lifecycle-executors";
import type { MigrationInventory } from "./lifecycle-inventory";
import { deriveExpectedResidueProbes, LIFECYCLE_PROBES } from "./lifecycle-probes";
import {
  deletionExternalCommands,
  deletionOperations,
  type DeletionExternalCommand,
  type DeletionExternalCommandKind,
  type DeletionExternalCommandPhase,
  type DeletionOperation,
  type DeletionOperationState,
  type DeletionScope,
} from "./lifecycle-schema";
import {
  createSqlLifecycleMutationPort,
  createSqlResidueProbePort,
  digestReceipt,
  LifecycleExecutorRefusal,
  loadTableMetaInTx,
  orderTargetsForExecution,
  type ErasureReceipt,
} from "./lifecycle-sql-port";
import { captureLifecycleSubjectsInTx, targetAppliesToOperation } from "./lifecycle-subjects";
import {
  lockIdentityMembershipGraph,
  lockWorkspaceMembershipGraph,
} from "./membership-lifecycle";

/**
 * Operational bounds chosen here — plan C2 says only "bounded" and no decision
 * fixes them (round-1 billing NOTE). A five-tick lease is long enough that a
 * tick never overlaps its own predecessor on one worker and short enough that
 * a dead worker's operation is reclaimed within minutes; the attempt bound
 * lives in the outbox's sole writer (`EXTERNAL_COMMAND_MAX_ATTEMPTS`) so no
 * call site can retry past it; ten operations per tick bound one tick's work
 * under the worker's two-connection query pool. Deliberately not runtime
 * config: the plan gives configuration no say over lifecycle bounds.
 */
export const DELETION_EXECUTOR_LEASE_MS = 5 * 60_000;
export const DELETION_EXECUTOR_MAX_COMMAND_ATTEMPTS = EXTERNAL_COMMAND_MAX_ATTEMPTS;
/**
 * A rolled-back erasure resumes through `blocked` and is retried; a residue
 * that is a real executor/probe disagreement would otherwise re-run the whole
 * erasure transaction every second tick forever (round-2 lean C-R2-1). After
 * this many failures the blocked path refuses to resume it (the schema keeps
 * the resume state on every blocked row) and it waits for an operator, who
 * resets `retry_count`; that column carries the count.
 */
export const DELETION_EXECUTOR_MAX_ERASURE_FAILURES = 3;
export const DELETION_EXECUTOR_TICK_LIMIT = 10;
const DUE_STATES: readonly DeletionOperationState[] = [
  "tombstoned",
  "external_actions_pending",
  "grace",
  "erasing",
  "blocked",
];

/**
 * `cancelled` is terminal for the lifecycle but may still owe the reversal of
 * the period-end cancellation THIS operation set (plan C2). Such an operation
 * is due only while its latest cancellation-phase attempt is pending, unknown,
 * or failed under the attempt bound; an exhausted reversal stops being claimed
 * and waits for an operator with the workspace already active locally.
 */
const CANCELLATION_REVERSAL_DUE = sql`(
  ${deletionOperations.state} = 'cancelled'
  AND EXISTS (
    SELECT 1 FROM ${deletionExternalCommands} AS c
    WHERE c.operation_id = ${deletionOperations.id}
      AND c.phase = 'cancellation'
      AND NOT EXISTS (
        SELECT 1 FROM ${deletionExternalCommands} AS later
        WHERE later.operation_id = c.operation_id AND later.kind = c.kind AND later.attempt > c.attempt
      )
      AND (
        c.status IN ('pending', 'unknown')
        OR (c.status = 'failed' AND c.attempt < ${DELETION_EXECUTOR_MAX_COMMAND_ATTEMPTS})
      )
  )
)`;

function dueOperation(): SQL | undefined {
  return or(inArray(deletionOperations.state, [...DUE_STATES]), CANCELLATION_REVERSAL_DUE);
}

/**
 * R-122's financial chain: the ledger, subscription and pause rows (workspace
 * scope) and the per-attempt model-usage cost facts (profile scope; R-122
 * "model-usage … facts", REQ-G05's margin input — round-2 billing CHANGE).
 * While any still cascades with its root (`<scope>_lifetime`), erasing that
 * root would destroy records the decision keeps for seven years, so the
 * executor refuses regardless of enablement and the worker refuses the scope
 * at startup. A workspace operation erases the profile-scope rows too, so it
 * is held by both lists. Task 6 re-registers them under the finance
 * extract/receiver, which empties this list. A list, not a producer (CLAUDE.md
 * Respin rule 7): a further financial table is an edit here.
 */
export const FINANCIAL_CHAIN_TABLES = [
  { table: "credit_ledger", scope: "workspace" },
  { table: "subscriptions", scope: "workspace" },
  { table: "pause_periods", scope: "workspace" },
  { table: "model_usage", scope: "profile" },
] as const satisfies readonly Readonly<{ table: string; scope: DeletionScope }>[];

/**
 * Task 6 wires the retention receivers; until then the raw Stripe payload
 * (`stripe_events.payload`, 90-day clock, the finance extract's input) survives
 * EVERY subject erasure — including an identity erasure of the workspace's
 * Stripe contact (round-2 lean S-R2-1). A list of one (CLAUDE.md Respin rule
 * 7): Task 6 flips it in the same change that wires the receiver.
 */
export const STRIPE_PAYLOAD_RECEIVER_WIRED = false;

/**
 * Why irreversible erasure of this scope may not run today, or null. Derived
 * from registry facts and the receiver list above, never from configuration;
 * checked by the executor at admission to `erasing` and by the worker at
 * startup for every scope the environment names.
 */
export function erasureHold(scope: DeletionScope, registry: readonly LifecycleClassEntry[] = LIFECYCLE_REGISTRY): string | null {
  const unretained = unretainedFinancialChainTables(scope, registry);
  if (unretained.length > 0) return `financial_chain_unretained:${unretained.join(",")}`;
  if (!STRIPE_PAYLOAD_RECEIVER_WIRED) return "stripe_payload_receiver_unwired";
  return null;
}

export function unretainedFinancialChainTables(
  scope: DeletionScope,
  registry: readonly LifecycleClassEntry[] = LIFECYCLE_REGISTRY
): readonly string[] {
  const admitted: readonly DeletionScope[] = scope === "workspace" ? ["workspace", "profile"] : [scope];
  return FINANCIAL_CHAIN_TABLES.filter(
    (chain) =>
      admitted.includes(chain.scope) &&
      registry.some(
        (entry) => entry.table === chain.table && entry.scope === chain.scope && entry.retention === `${chain.scope}_lifetime`
      )
  ).map((chain) => chain.table);
}

/**
 * R-119 rollout: erasure ships disabled per scope. `false` holds every
 * operation at `grace` after its window; nothing irreversible runs.
 */
export interface ErasureEnablementPort {
  erasureEnabled(scope: DeletionScope): boolean | Promise<boolean>;
}

export const ERASURE_DISABLED: ErasureEnablementPort = { erasureEnabled: () => false };

export type DeletionExecutorPorts = Readonly<{
  journal: DeletionJournalPort;
  commands: ExternalCommandPort;
  enablement: ErasureEnablementPort;
}>;

export type DeletionExecutorOptions = Readonly<{
  workerName: string;
  migrations: MigrationInventory;
  leaseMs?: number;
  limit?: number;
}>;

export type DeletionTickOutcome = Readonly<{
  operationId: string;
  scope: DeletionScope;
  from: DeletionOperationState;
  to: DeletionOperationState | null;
  code: string;
}>;

export type DeletionLifecycleTickSummary = Readonly<{
  claimed: number;
  advanced: number;
  waiting: number;
  blocked: number;
  erased: number;
  outcomes: readonly DeletionTickOutcome[];
}>;

/**
 * Content-free failure code: the driver's own message names the statement
 * shape and the constraint, never a bound value (params are not included).
 */
function failureCode(error: unknown): string {
  const cause = (error as { cause?: { code?: string; constraint?: string; message?: string } }).cause;
  // A SQLSTATE names the statement class without any bound value; the
  // driver's message is the fallback only when there is no SQLSTATE at all
  // (round-1 lean NOTE S8: the message can embed a driver-supplied literal).
  const message = cause?.code
    ? `sqlstate_${cause.code}${cause.constraint ? `:${cause.constraint}` : ""}`
    : cause?.message ?? (error instanceof Error ? error.message : String(error));
  return message.replace(/[^A-Za-z0-9_:.-]/g, "_").slice(0, 120);
}

async function lockScopeInTx(tx: TxLike, operation: DeletionOperation): Promise<void> {
  if (operation.scope === "identity") {
    if (!operation.userId) throw new LifecycleExecutorRefusal("identity_target_missing");
    await lockIdentityMembershipGraph(tx, operation.userId);
    return;
  }
  if (!operation.workspaceId) throw new LifecycleExecutorRefusal("workspace_target_missing");
  await lockWorkspaceMembershipGraph(tx, operation.workspaceId);
}

async function currentOperation(tx: TxLike, operationId: string): Promise<DeletionOperation> {
  const [operation] = await tx
    .select()
    .from(deletionOperations)
    .where(eq(deletionOperations.id, operationId))
    .limit(1)
    .for("update");
  if (!operation) throw new LifecycleExecutorRefusal("operation_not_found");
  return operation;
}

/** Reversible fences for the scope; nothing here is irreversible. */
async function preGraceCommandKinds(
  tx: TxLike,
  operation: DeletionOperation
): Promise<readonly DeletionExternalCommandKind[]> {
  if (operation.scope !== "workspace" || !operation.workspaceId) return [];
  const [subscription] = await tx
    .select({
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      status: subscriptions.status,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      autoTopupEnabled: subscriptions.autoTopupEnabled,
      autoTopupV1Enabled: subscriptions.autoTopupV1Enabled,
      autoTopupRearmAfterUpgrade: subscriptions.autoTopupRearmAfterUpgrade,
      autoTopupMonthlyCapCents: subscriptions.autoTopupMonthlyCapCents,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, operation.workspaceId))
    .limit(1);
  const kinds: DeletionExternalCommandKind[] = [];
  if (subscription?.stripeSubscriptionId && subscription.status !== "canceled" && !subscription.cancelAtPeriodEnd) {
    kinds.push("stripe_subscription_cancel_at_period_end");
  }
  if (subscription && autoTopupChargeAuthorityArmed(subscription)) kinds.push("auto_topup_disable");
  return kinds;
}

/** Irreversible: only once the journal is durably `erasing`. */
async function erasingCommandKinds(
  tx: TxLike,
  operation: DeletionOperation
): Promise<readonly DeletionExternalCommandKind[]> {
  if (operation.scope !== "workspace" || !operation.workspaceId) return [];
  const [subscription] = await tx
    .select({
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
      stripeCustomerId: subscriptions.stripeCustomerId,
      status: subscriptions.status,
    })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, operation.workspaceId))
    .limit(1);
  const kinds: DeletionExternalCommandKind[] = [];
  if (subscription?.stripeSubscriptionId && subscription.status !== "canceled") {
    kinds.push("stripe_subscription_cancel_now");
  }
  if (subscription?.stripeCustomerId) kinds.push("stripe_customer_personal_fields_clear");
  return kinds;
}

async function claimLease(
  db: DbLike,
  operationId: string,
  workerName: string,
  leaseMs: number
): Promise<DeletionOperation | null> {
  const [claimed] = await db
    .update(deletionOperations)
    .set({
      leaseOwner: workerName,
      leaseExpiresAt: sql`clock_timestamp() + make_interval(secs => ${leaseMs / 1_000})`,
      heartbeatAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(deletionOperations.id, operationId),
        dueOperation(),
        or(isNull(deletionOperations.leaseExpiresAt), lt(deletionOperations.leaseExpiresAt, sql`clock_timestamp()`))
      )
    )
    .returning();
  return claimed ?? null;
}

/** Holds that are the designed state, not a signal: no code recorded. */
const NORMAL_HOLD_CODES = ["grace_window_open", "erasure_disabled", "blocked_awaiting_operator"] as const;
/** Waits on something external: recorded on the row, but not a retry. */
const WAITING_CODES = ["external_command_pending", "external_command_unknown", "nested_operation_active"] as const;

async function releaseLease(
  db: DbLike,
  operationId: string,
  workerName: string,
  code: string | null,
  countsAsRetry: boolean
): Promise<void> {
  await db
    .update(deletionOperations)
    .set({
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: sql`clock_timestamp()`,
      ...(code === null
        ? {}
        : {
            lastFailureCode: code,
            ...(countsAsRetry ? { retryCount: sql`${deletionOperations.retryCount} + 1` } : {}),
          }),
    })
    .where(and(eq(deletionOperations.id, operationId), eq(deletionOperations.leaseOwner, workerName)));
}

async function enqueueKindsInTx(
  tx: TxLike,
  operation: DeletionOperation,
  kinds: readonly DeletionExternalCommandKind[]
): Promise<void> {
  for (const kind of kinds) await enqueueExternalCommandInTx(tx, operation, kind);
}

function outcome(
  operation: DeletionOperation,
  to: DeletionOperationState | null,
  code: string
): DeletionTickOutcome {
  return { operationId: operation.id, scope: operation.scope, from: operation.state, to, code };
}

async function handleTombstoned(db: DbLike, operation: DeletionOperation, ports: DeletionExecutorPorts) {
  await db.transaction(async (tx) => {
    await lockScopeInTx(tx, operation);
    const current = await currentOperation(tx, operation.id);
    if (current.state !== "tombstoned") throw new LifecycleExecutorRefusal("state_changed");
    await enqueueKindsInTx(tx, current, await preGraceCommandKinds(tx, current));
  });
  const advanced = await transitionDeletionOperation(db, operation.id, "external_actions_pending", ports.journal);
  return outcome(operation, advanced.state, "pre_grace_commands_enqueued");
}

async function handleExternalActions(db: DbLike, operation: DeletionOperation, ports: DeletionExecutorPorts) {
  const summary = await dispatchExternalCommands(db, operation.id, "pre_grace", ports.commands);
  if (summary.unknown > 0) return outcome(operation, null, "external_command_unknown");
  if (summary.failed > 0) {
    const blocked = await transitionDeletionOperation(db, operation.id, "blocked", ports.journal);
    return outcome(operation, blocked.state, "external_command_failed");
  }
  if (summary.pending > 0) return outcome(operation, null, "external_command_pending");
  const advanced = await transitionDeletionOperation(db, operation.id, "grace", ports.journal);
  return outcome(operation, advanced.state, "pre_grace_commands_succeeded");
}

async function nestedActiveProfileOperations(tx: TxLike, workspaceId: string): Promise<number> {
  const rows = await tx
    .select({ id: deletionOperations.id })
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, "profile"),
        eq(deletionOperations.workspaceId, workspaceId),
        sql`${deletionOperations.state} NOT IN ('complete', 'cancelled')`
      )
    );
  return rows.length;
}

async function handleGrace(db: DbLike, operation: DeletionOperation, ports: DeletionExecutorPorts) {
  const now = await db.transaction((tx) => databaseNow(tx));
  if (!operation.graceExpiresAt || now.getTime() < operation.graceExpiresAt.getTime()) {
    return outcome(operation, null, "grace_window_open");
  }
  if (!(await ports.enablement.erasureEnabled(operation.scope))) {
    return outcome(operation, null, "erasure_disabled");
  }
  const hold = erasureHold(operation.scope);
  if (hold !== null) return outcome(operation, null, `erasure_disabled:${hold}`);
  if (operation.scope === "workspace" && operation.workspaceId) {
    const nested = await db.transaction((tx) => nestedActiveProfileOperations(tx, operation.workspaceId!));
    if (nested > 0) return outcome(operation, null, "nested_operation_active");
  }
  const advanced = await transitionDeletionOperation(db, operation.id, "erasing", ports.journal);
  if (advanced.scope === "identity") {
    // Nulled again inside the erasure transaction (C5), so the property holds
    // even if this statement is lost to a crash.
    // The recovery credential can no longer cancel anything; its digest goes
    // at erasure start (plan C5), never surviving as audit data.
    await db
      .update(deletionOperations)
      .set({
        recoverySecretDigest: null,
        recoverySecretPrefix: null,
        recoveryConsumedAt: sql`COALESCE(${deletionOperations.recoveryConsumedAt}, clock_timestamp())`,
      })
      .where(and(eq(deletionOperations.id, advanced.id), eq(deletionOperations.state, "erasing")));
  }
  return outcome(operation, advanced.state, "erasure_started");
}

export type ErasureResult = Readonly<{
  operation: DeletionOperation;
  receipt: ErasureReceipt;
  receiptDigest: string;
  residue: number;
}>;

const ERASURE_STEPS = [
  { from: "erasing", to: "verifying" },
  { from: "verifying", to: "complete" },
] as const satisfies readonly JournalPlanStep[];

/**
 * The erasure transaction. Everything between the two journal appends either
 * commits together or not at all; a non-zero residue count rolls back the
 * erasure and leaves the operation `erasing` for the operator to see.
 */
export async function eraseOperation(
  db: DbLike,
  operationId: string,
  ports: Pick<DeletionExecutorPorts, "journal">,
  options: Pick<DeletionExecutorOptions, "migrations">
): Promise<ErasureResult> {
  const planDigest = await prepareJournalPlan(db, operationId, ERASURE_STEPS, {
    validateOperation: (operation) => {
      if (operation.state !== "erasing") throw new LifecycleExecutorRefusal(`not_erasing:${operation.state}`);
      if (operation.acknowledgedAt === null) throw new LifecycleExecutorRefusal("operation_not_acknowledged");
    },
  });
  const erasure = db.transaction(async (tx) => {
    // The transition receipts carry the target key inside a composite FK; the
    // repoint below rewrites parent and children within this transaction.
    await tx.execute(sql`SET CONSTRAINTS "deletion_operation_transitions_operation_identity_fk" DEFERRED`);
    const operation = await currentOperation(tx, operationId);
    if (operation.state !== "erasing") throw new LifecycleExecutorRefusal(`not_erasing:${operation.state}`);
    await lockScopeInTx(tx, operation);
    const unknown = await tx
      .select({ id: deletionExternalCommands.id })
      .from(deletionExternalCommands)
      .where(and(eq(deletionExternalCommands.operationId, operation.id), eq(deletionExternalCommands.status, "unknown")));
    if (unknown.length > 0) throw new LifecycleExecutorRefusal("unknown_outcome_pending");
    const now = await databaseNow(tx);
    const subjects = await captureLifecycleSubjectsInTx(tx, operation);
    const meta = await loadTableMetaInTx(tx);
    const targets = orderTargetsForExecution(
      compileLifecycleExecutionTargets(
        options.migrations,
        LIFECYCLE_REGISTRY,
        ROW_CLASS_INVENTORY,
        JSON_PATH_INVENTORY,
        subjects,
        SUPPORTING_LIFECYCLE_STORES
      ).filter((target) => targetAppliesToOperation(operation.scope, target)),
      operation.scope,
      options.migrations
    );
    const probes = deriveExpectedResidueProbes(
      options.migrations,
      LIFECYCLE_REGISTRY,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      subjects,
      SUPPORTING_LIFECYCLE_STORES
    ).filter((probe) => targetAppliesToOperation(operation.scope, probe));

    const port = createSqlLifecycleMutationPort(tx, {
      scope: operation.scope,
      subjects,
      meta,
      migrations: options.migrations,
      ...(operation.scope === "profile" && operation.workspaceId
        ? { profileStubWorkspaceId: operation.workspaceId }
        : {}),
    });
    for (const target of targets) {
      await LIFECYCLE_EXECUTORS[target.executor].execute(port, target);
    }
    const receipt = port.receipt();

    const probePort = createSqlResidueProbePort(tx, { scope: operation.scope, meta });
    let residue = 0;
    for (const probe of probes) {
      residue += await LIFECYCLE_PROBES[probe.probe].execute(probePort, probe);
    }
    if (residue > 0) throw new LifecycleExecutorRefusal(`residue_detected:${residue}`);

    // Both receipts are appended AFTER the effects and the probes, inside the
    // same transaction (round-2 billing CHANGE): a rolled-back erasure appends
    // nothing, so no journal version is ever orphaned or reused and plan C4's
    // "never overwrite a version object" holds for the S3 store. Journal-
    // before-effect still holds where it matters: the effects become visible
    // only at commit, after both appends were durably confirmed. The
    // projection row was repointed above, so both receipts name the stub.
    const repointed = await currentOperation(tx, operation.id);
    if (repointed.state !== "erasing") throw new LifecycleExecutorRefusal("state_changed_during_erasure");
    const verifying = await appendJournalTransitionInTx(tx, repointed, "verifying", ports.journal, now, {
      steps: ERASURE_STEPS,
      planIndex: 0,
    });
    const completed = await appendJournalTransitionInTx(tx, verifying, "complete", ports.journal, now, {
      steps: ERASURE_STEPS,
      planIndex: 1,
    });
    const [finalized] = await tx
      .update(deletionOperations)
      .set({
        leaseOwner: null,
        leaseExpiresAt: null,
        lastFailureCode: null,
        // C5: the recovery credential is gone by the time erasure is durable,
        // in the SAME transaction — not only in the statement after grace.
        ...(completed.scope === "identity"
          ? {
              recoverySecretDigest: null,
              recoverySecretPrefix: null,
              recoveryConsumedAt: sql`COALESCE(${deletionOperations.recoveryConsumedAt}, clock_timestamp())`,
            }
          : {}),
        updatedAt: now,
      })
      .where(eq(deletionOperations.id, completed.id))
      .returning();
    return {
      operation: finalized ?? completed,
      receipt,
      receiptDigest: digestReceipt(receipt),
      residue,
    };
  });
  return erasure.catch(async (error: unknown) => {
    // C1: the plan was reserved in its own committed transaction. A rolled
    // back erasure releases it, or the `blocked` plan below conflicts with
    // it on every later tick and the operation never leaves `erasing`. No
    // journal append happened (both are after the probes), so nothing else
    // is left behind.
    await abandonJournalPlan(db, operationId, planDigest);
    throw error;
  });
}

async function handleErasing(
  db: DbLike,
  operation: DeletionOperation,
  ports: DeletionExecutorPorts,
  options: DeletionExecutorOptions
) {
  // Re-read at every irreversible step, not only at admission (round-1
  // tenancy CHANGE): enablement switched off while an operation sits in
  // `erasing` holds it there.
  if (!(await ports.enablement.erasureEnabled(operation.scope))) {
    return outcome(operation, null, "erasure_disabled");
  }
  await db.transaction(async (tx) => {
    await lockScopeInTx(tx, operation);
    const current = await currentOperation(tx, operation.id);
    if (current.state !== "erasing") throw new LifecycleExecutorRefusal("state_changed");
    await enqueueKindsInTx(tx, current, await erasingCommandKinds(tx, current));
  });
  const summary = await dispatchExternalCommands(db, operation.id, "erasing", ports.commands);
  if (summary.unknown > 0) return outcome(operation, null, "external_command_unknown");
  if (summary.failed > 0) {
    const blocked = await transitionDeletionOperation(db, operation.id, "blocked", ports.journal);
    return outcome(operation, blocked.state, "external_command_failed");
  }
  if (summary.pending > 0) return outcome(operation, null, "external_command_pending");
  try {
    const erased = await eraseOperation(db, operation.id, ports, options);
    return outcome(operation, erased.operation.state, `erased:${erased.receiptDigest.slice(0, 16)}`);
  } catch (error) {
    // Every erasure failure — residue, a constraint, a refusal — becomes
    // `blocked` with the code ON THE ROW (the runbook's contract), and resumes
    // through the blocked path once clean. Nothing was committed: the
    // transaction rolled back and its reservation was released.
    const failure = error instanceof LifecycleExecutorRefusal ? error.code : failureCode(error);
    const failures = operation.retryCount + 1;
    const exhausted = failures >= DELETION_EXECUTOR_MAX_ERASURE_FAILURES;
    const code = exhausted ? `erasure_failures_exhausted:${failure}` : failure;
    const blocked = await transitionDeletionOperation(db, operation.id, "blocked", ports.journal);
    await db
      .update(deletionOperations)
      .set({ lastFailureCode: code, retryCount: failures })
      .where(eq(deletionOperations.id, blocked.id));
    return outcome(operation, blocked.state, code);
  }
}

/**
 * Bounded retry: a new attempt only where the LATEST attempt of a kind is
 * `failed` and below the cap. Older failed attempts behind a newer one are
 * history, not work — retrying them would refuse on the newer row.
 */
async function retryFailedCommandsInTx(
  tx: TxLike,
  admitted: DeletionOperation,
  phase: DeletionExternalCommandPhase
): Promise<number> {
  const rows = await tx
    .select()
    .from(deletionExternalCommands)
    .where(and(eq(deletionExternalCommands.operationId, admitted.id), eq(deletionExternalCommands.phase, phase)))
    .orderBy(desc(deletionExternalCommands.attempt));
  const latestByKind = new Map<DeletionExternalCommandKind, DeletionExternalCommand>();
  for (const row of rows) if (!latestByKind.has(row.kind)) latestByKind.set(row.kind, row);
  let count = 0;
  for (const latest of latestByKind.values()) {
    if (latest.status !== "failed" || latest.attempt >= DELETION_EXECUTOR_MAX_COMMAND_ATTEMPTS) continue;
    await retryFailedExternalCommandInTx(tx, admitted, latest.kind);
    count += 1;
  }
  return count;
}

async function handleBlocked(db: DbLike, operation: DeletionOperation, ports: DeletionExecutorPorts) {
  const resume = operation.blockedResumeState;
  if (resume !== "external_actions_pending" && resume !== "erasing") {
    return outcome(operation, null, resume === null ? "blocked_awaiting_operator" : `blocked_awaiting_operator:${resume}`);
  }
  const phase = resume === "erasing" ? "erasing" : "pre_grace";
  if (resume === "erasing" && operation.retryCount >= DELETION_EXECUTOR_MAX_ERASURE_FAILURES) {
    // Exhausted (round-2 lean C-R2-1): the erasure is not re-run every second
    // tick; an operator resets retry_count after deciding what the residue was.
    return outcome(operation, null, "blocked_awaiting_operator:erasure_failures_exhausted");
  }
  if (resume === "erasing" && !(await ports.enablement.erasureEnabled(operation.scope))) {
    return outcome(operation, null, "erasure_disabled");
  }
  const retried = await db.transaction(async (tx) => {
    await lockScopeInTx(tx, operation);
    const current = await currentOperation(tx, operation.id);
    // The retry is admitted against the RESUME state, which is what the
    // command phase was enqueued under; `blocked` itself admits nothing.
    return retryFailedCommandsInTx(tx, { ...current, state: resume }, phase);
  });
  let summary: ExternalCommandSummary = await dispatchExternalCommands(db, operation.id, phase, ports.commands);
  if (summary.failed > 0 || summary.unknown > 0 || summary.pending > 0) {
    return outcome(operation, null, retried > 0 ? "retry_not_clean" : "blocked_max_attempts");
  }
  summary = await db.transaction((tx) => externalCommandSummary(tx, operation.id, phase));
  if (summary.failed > 0) return outcome(operation, null, "blocked_max_attempts");
  const resumed = await transitionDeletionOperation(db, operation.id, resume, ports.journal);
  return outcome(operation, resumed.state, "resumed_after_retry");
}

/**
 * The reversal owed by a cancelled operation (plan C2): dispatch the
 * cancellation-phase command, retry a failed one under the bound, never step
 * over an unknown outcome. The operation stays `cancelled` throughout; the
 * workspace is already active locally, so an exhausted reversal is an
 * operator item at Stripe, not a lifecycle state.
 */
async function handleCancelled(db: DbLike, operation: DeletionOperation, ports: DeletionExecutorPorts) {
  await db.transaction(async (tx) => {
    await lockScopeInTx(tx, operation);
    const current = await currentOperation(tx, operation.id);
    if (current.state !== "cancelled") throw new LifecycleExecutorRefusal("state_changed");
    await retryFailedCommandsInTx(tx, current, "cancellation");
  });
  const summary = await dispatchExternalCommands(db, operation.id, "cancellation", ports.commands);
  if (summary.unknown > 0) return outcome(operation, null, "external_command_unknown");
  if (summary.failed > 0) return outcome(operation, null, "external_command_failed");
  if (summary.pending > 0) return outcome(operation, null, "external_command_pending");
  return outcome(operation, "cancelled", "cancellation_reversal_succeeded");
}

async function advanceOne(
  db: DbLike,
  operation: DeletionOperation,
  ports: DeletionExecutorPorts,
  options: DeletionExecutorOptions
): Promise<DeletionTickOutcome> {
  switch (operation.state) {
    case "tombstoned":
      return handleTombstoned(db, operation, ports);
    case "external_actions_pending":
      return handleExternalActions(db, operation, ports);
    case "grace":
      return handleGrace(db, operation, ports);
    case "erasing":
      return handleErasing(db, operation, ports, options);
    case "blocked":
      return handleBlocked(db, operation, ports);
    case "cancelled":
      return handleCancelled(db, operation, ports);
    default:
      return outcome(operation, null, "not_due");
  }
}

/** One executor tick. Safe to run concurrently on several workers. */
export async function advanceDeletionOperations(
  db: DbLike,
  ports: DeletionExecutorPorts,
  options: DeletionExecutorOptions
): Promise<DeletionLifecycleTickSummary> {
  const leaseMs = options.leaseMs ?? DELETION_EXECUTOR_LEASE_MS;
  const limit = options.limit ?? DELETION_EXECUTOR_TICK_LIMIT;
  const due = await db
    .select({ id: deletionOperations.id })
    .from(deletionOperations)
    .where(
      and(
        dueOperation(),
        sql`${deletionOperations.acknowledgedAt} IS NOT NULL`,
        or(isNull(deletionOperations.leaseExpiresAt), lt(deletionOperations.leaseExpiresAt, sql`clock_timestamp()`))
      )
    )
    .orderBy(asc(deletionOperations.updatedAt))
    .limit(limit);
  const outcomes: DeletionTickOutcome[] = [];
  let claimed = 0;
  for (const { id } of due) {
    const operation = await claimLease(db, id, options.workerName, leaseMs);
    if (!operation) continue;
    claimed += 1;
    let code: string | null = null;
    let countsAsRetry = false;
    try {
      const result = await advanceOne(db, operation, ports, options);
      outcomes.push(result);
      if (result.to === null && !NORMAL_HOLD_CODES.some((prefix) => result.code.startsWith(prefix))) {
        code = result.code;
        countsAsRetry = !WAITING_CODES.some((prefix) => result.code.startsWith(prefix));
      }
    } catch (error) {
      code = failureCode(error);
      countsAsRetry = true;
      outcomes.push(outcome(operation, null, code));
    } finally {
      await releaseLease(db, id, options.workerName, code, countsAsRetry);
    }
  }
  return {
    claimed,
    advanced: outcomes.filter((item) => item.to !== null && item.to !== "blocked").length,
    waiting: outcomes.filter((item) => item.to === null).length,
    blocked: outcomes.filter((item) => item.to === "blocked").length,
    erased: outcomes.filter((item) => item.to === "complete").length,
    outcomes,
  };
}

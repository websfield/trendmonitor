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
import { ActivationContributionRefusal, applyActivationContributionInTx, type ActivationExclusions } from "./activation";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { stripeEvents, subscriptions } from "./billing-schema";
import { purgeSubjectStripePayloadsInTx } from "./retention-receiver";
import {
  JSON_PATH_INVENTORY,
  LIFECYCLE_REGISTRY,
  ROW_CLASS_INVENTORY,
  SUPPORTING_LIFECYCLE_STORES,
  type LifecycleClassEntry,
} from "./creator-data-registry";
import type { DbLike, TxLike } from "./db-like";
import {
  assertNoUnknownExternalCommands,
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
  assertBillingContactReleased,
  databaseNow,
  deletionOperationUnderWay,
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
  deletionOperationTransitions,
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
/**
 * R-166 (gate H2): a WAITING code (`WAITING_CODES`) is not a retry and never
 * blocks, so without a bound it can persist forever with nothing paged. A wait
 * older than this — measured from when the wait could first begin: the grace
 * expiry for a `grace` operation, else the operation's latest transition — is
 * counted as `stalledWaits`, and the worker pages on it. A day: every wait is
 * on a provider command (minutes) or a nested operation that is itself
 * reserved and advancing.
 */
export const DELETION_WAIT_ALERT_AFTER_MS = 24 * 60 * 60_000;
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
 * R-122's financial chain. EMPTY since Task 6, and empty is the point.
 *
 * The four tables that were here — `credit_ledger`, `subscriptions`,
 * `pause_periods` (workspace scope) and `model_usage` (profile scope, REQ-G05's
 * margin input) — each still cascaded with the root whose erasure would have
 * destroyed seven years of retained money records, so the executor refused the
 * scope outright. Task 6 re-registered all four under
 * `retain_financial`/`financial_chain_seven_years` with a pseudonymised link
 * and moved their foreign keys from CASCADE to RESTRICT (migration 0053) --
 * the keys STAY, because dropping `model_usage_profile_workspace_fk` would
 * also drop the composite key that structurally refuses a cross-parented row.
 * Erasure repoints each link to a per-operation stub before the root row goes,
 * so erasing the root no longer touches them and there is nothing left to hold.
 *
 * A list, not a producer (CLAUDE.md Respin rule 7): a NEW financial table that
 * still cascades with its scope is an edit here, and `unretainedFinancialChainTables`
 * will then hold that scope again.
 */
export const FINANCIAL_CHAIN_TABLES: readonly Readonly<{ table: string; scope: DeletionScope }>[] = [];

/**
 * TRUE since Task 6: `runRetentionTick` sweeps `stripe_events.payload` on its
 * 90-day clock, after lifting the finance facts out in the same transaction
 * (`retention-receiver.ts` → `finance-extract.ts`).
 *
 * IT IS NOT, BY ITSELF, WHAT MAKES AN IDENTITY ERASURE SAFE. A clock measured
 * from `received_at` is not an erasure step: with only this flag, a COMPLETED
 * identity erasure left up to 90 days of unredacted webhook JSON carrying the
 * deleted person's email, name and billing address, while the account page
 * showed a closed "what survives erasure" list that omitted it. The erasure
 * transaction now calls `purgeSubjectStripePayloadsInTx` directly, and
 * `deletion-executor.test.ts` asserts the payload is GONE at `complete`.
 *
 * This flag still holds the OTHER half — that the clock exists at all for rows
 * no erasure reaches — and stays a named constant rather than becoming
 * implicit: the receiver being WRITTEN is not the receiver being SCHEDULED, and
 * `worker/retention.ts` is what makes it run. Unscheduling it must fail here.
 */
export const STRIPE_PAYLOAD_RECEIVER_WIRED = true;

/**
 * Why irreversible erasure of this scope may not run today, or null. Derived
 * from registry facts and the receiver list above, never from configuration;
 * checked by the executor at admission to `erasing` and by the worker at
 * startup for every scope the environment names.
 */
export function erasureHold(
  scope: DeletionScope,
  registry: readonly LifecycleClassEntry[] = LIFECYCLE_REGISTRY,
  // The two module constants above, as SEAMS. Production always takes the
  // defaults -- they are compile-time facts, not configuration (R-119 keeps
  // configuration out of this decision). They are parameters so a test can
  // PLANT a hold: with both hard-wired, `FINANCIAL_CHAIN_TABLES` being empty
  // made `unretainedFinancialChainTables` filter an empty array and
  // `STRIPE_PAYLOAD_RECEIVER_WIRED` being true made the second branch
  // unreachable, so deleting this whole function body and returning `null`
  // left 4,819 tests green. A refusal with no witness is not a refusal.
  chains: readonly Readonly<{ table: string; scope: DeletionScope }>[] = FINANCIAL_CHAIN_TABLES,
  payloadReceiverWired: boolean = STRIPE_PAYLOAD_RECEIVER_WIRED,
): string | null {
  const unretained = unretainedFinancialChainTables(scope, registry, chains);
  if (unretained.length > 0) return `financial_chain_unretained:${unretained.join(",")}`;
  if (!payloadReceiverWired) return "stripe_payload_receiver_unwired";
  return null;
}

export function unretainedFinancialChainTables(
  scope: DeletionScope,
  registry: readonly LifecycleClassEntry[] = LIFECYCLE_REGISTRY,
  chains: readonly Readonly<{ table: string; scope: DeletionScope }>[] = FINANCIAL_CHAIN_TABLES,
): readonly string[] {
  const admitted: readonly DeletionScope[] = scope === "workspace" ? ["workspace", "profile"] : [scope];
  return chains.filter(
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
  /** Task 7: the resolved deployment id sets; erasure refuses while the target is still in either. */
  /**
   * REQUIRED, with no default. R-121's `operator_config_removal_required`
   * refusal is the C4 guarantee that erasure never completes while the target's
   * id is still a re-linkable copy in `ADMIN_USER_IDS` /
   * `ACTIVATION_EXCLUDED_USER_IDS`. Defaulting this to the EMPTY set made that
   * refusal vacuously satisfied: every test call site omitted it, one optional
   * line in `worker/production.ts` was the only real supplier, and deleting
   * that line left the whole suite green while erasure completed with the id
   * still in deployment config. CLAUDE.md's 2026-08-26 lesson, exactly.
   */
  activationExclusions: ActivationExclusions;
  leaseMs?: number;
  limit?: number;
  /** Tests only; production uses `DELETION_WAIT_ALERT_AFTER_MS`. */
  waitAlertAfterMs?: number;
}>;

/**
 * Money Stripe collected for a workspace while it was tombstoned and that no
 * cancellation replayed (R-165): the erasure completes, the receipt stays, and
 * the OPERATOR owes the refund. Ids and amounts only. No automatic refund is
 * built. The durable record is the `stripe_events` row itself
 * (`outcome = 'refund_owed'`, written by `recordRefundOwedInTx`); this list
 * is the tick's copy of it, and the worker alerts on it.
 */
export type RefundOwed = Readonly<{
  stripeEventId: string;
  type: string;
  /** Smallest currency unit, as Stripe reported it; null if the payload carried none. */
  amount: number | null;
  currency: string | null;
}>;

export type DeletionTickOutcome = Readonly<{
  operationId: string;
  scope: DeletionScope;
  from: DeletionOperationState;
  to: DeletionOperationState | null;
  code: string;
  /** Present on a completed workspace erasure that held money (R-165). */
  refundOwed?: readonly RefundOwed[];
  /** R-166: a waiting outcome whose wait is older than the alert bound. */
  stalled?: true;
}>;

export type DeletionLifecycleTickSummary = Readonly<{
  claimed: number;
  advanced: number;
  waiting: number;
  blocked: number;
  erased: number;
  /** Held Stripe events listed as refund owed by this tick's erasures (R-165). */
  refundOwed: number;
  /** R-166: waiting outcomes older than `DELETION_WAIT_ALERT_AFTER_MS`; the worker pages on non-zero. */
  stalledWaits: number;
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

/**
 * The profile deletions under way inside a workspace whose own deletion has
 * left grace (R-166). An unreserved profile DRAFT is not counted — nothing
 * advances one — and is RETIRED here first: it can never be reserved now (its
 * reservation needs the workspace active), it has no journal entry, proof or
 * command (an unreserved row has none by construction; the restrict foreign
 * keys would refuse this delete loudly if one existed), and left in place its
 * `profile_id` would hold the profile row the workspace's erasure removes.
 */
async function nestedActiveProfileOperations(tx: TxLike, workspaceId: string): Promise<number> {
  await tx
    .delete(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, "profile"),
        eq(deletionOperations.workspaceId, workspaceId),
        eq(deletionOperations.state, "requested"),
        isNull(deletionOperations.journalIntentPlanDigest),
        isNull(deletionOperations.journalIntentBaseVersion),
        isNull(deletionOperations.journalIntentEffectiveAt)
      )
    );
  const rows = await tx
    .select({ id: deletionOperations.id })
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, "profile"),
        eq(deletionOperations.workspaceId, workspaceId),
        sql`${deletionOperations.state} NOT IN ('complete', 'cancelled')`,
        deletionOperationUnderWay()
      )
    );
  return rows.length;
}

/**
 * The scoped deletions this person REQUESTED that are still undecided and
 * UNDER WAY (R-160, R-166). An identity's erasure waits for them: its
 * cascaded sole-owner workspaces (and any workspace it asked to delete before)
 * erase first, through their own operations, which also clear the provider
 * copy of the billing contact the identity erasure re-checks. A cancelled one
 * stops counting at once. An unreserved draft never counts (gate H2): nothing
 * advances it, so counting it was a wait with no end; a draft on a workspace
 * the person solely owns was adopted by the cascade, and any other stays
 * rebindable by that workspace's remaining owners.
 */
async function nestedRequestedOperations(tx: TxLike, userId: string): Promise<number> {
  const rows = await tx
    .select({ id: deletionOperations.id })
    .from(deletionOperations)
    .where(
      and(
        inArray(deletionOperations.scope, ["profile", "workspace"]),
        eq(deletionOperations.requesterUserId, userId),
        sql`${deletionOperations.state} NOT IN ('complete', 'cancelled')`,
        deletionOperationUnderWay()
      )
    );
  return rows.length;
}

/**
 * Amount and currency off a money event's payload, by its type (R-165). ONE
 * reader for both refund-owed writers: the erasure (`recordRefundOwedInTx`)
 * and the webhook's late-money branch in @respin/credits.
 */
export function stripeMoneyAmount(type: string, payload: unknown): Pick<RefundOwed, "amount" | "currency"> {
  const object = (payload as { data?: { object?: Record<string, unknown> } } | null)?.data?.object;
  const field =
    type === "invoice.paid"
      ? "amount_paid"
      : type === "payment_intent.succeeded"
        ? "amount_received"
        : type.startsWith("checkout.session.")
          ? "amount_total"
          : null;
  const amount = field && typeof object?.[field] === "number" ? (object[field] as number) : null;
  const currency = typeof object?.currency === "string" ? object.currency : null;
  return { amount, currency };
}

/**
 * THE DURABLE REFUND-OWED RECORD (R-165, gate M1). Inside the erasure
 * transaction and BEFORE the payload purge, every receipt still held for this
 * workspace becomes `outcome = 'refund_owed'`, carrying its amount, currency
 * and this operation's id (migration 0065; the trigger lets a held receipt take
 * this outcome once and never leave it). The operator reads
 * `SELECT id, type, refund_owed_amount, refund_owed_currency FROM stripe_events
 * WHERE outcome = 'refund_owed'`; the tick's list is a copy, not the record.
 */
/**
 * The COMPLETED workspace deletion that erased this workspace, if it was
 * erased (R-166, billing follow-up). After erasure the workspace row survives
 * under its pseudonymous id, tombstoned, and the retained `subscriptions` row
 * still maps the Stripe customer to it — so money that settles LATE resolves
 * here. The erasure receipt names the same pseudonymous id; that is the link,
 * and it carries no person.
 */
export async function erasedWorkspaceOperationIdInTx(tx: TxLike, workspaceId: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: deletionOperations.id })
    .from(deletionOperations)
    .where(
      and(
        eq(deletionOperations.scope, "workspace"),
        eq(deletionOperations.workspaceId, workspaceId),
        eq(deletionOperations.state, "complete")
      )
    )
    .orderBy(desc(deletionOperations.requestedAt))
    .limit(1);
  return row?.id ?? null;
}

async function recordRefundOwedInTx(
  tx: TxLike,
  workspaceId: string,
  operationId: string
): Promise<readonly RefundOwed[]> {
  const rows = await tx
    .select({ id: stripeEvents.id, type: stripeEvents.type, payload: stripeEvents.payload })
    .from(stripeEvents)
    .where(and(eq(stripeEvents.workspaceId, workspaceId), eq(stripeEvents.outcome, "held_tombstoned")))
    .orderBy(asc(stripeEvents.id))
    .for("update");
  const owed: RefundOwed[] = [];
  for (const row of rows) {
    const { amount, currency } = stripeMoneyAmount(row.type, row.payload);
    const [moved] = await tx
      .update(stripeEvents)
      .set({
        outcome: "refund_owed",
        refundOwedAmount: amount,
        refundOwedCurrency: currency,
        refundOwedOperationId: operationId,
      })
      .where(and(eq(stripeEvents.id, row.id), eq(stripeEvents.outcome, "held_tombstoned")))
      .returning({ id: stripeEvents.id });
    if (!moved) throw new LifecycleExecutorRefusal("held_receipt_changed");
    owed.push({ stripeEventId: row.id, type: row.type, amount, currency });
  }
  return owed;
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
    const nested = await db.transaction(async (tx) => {
      await lockScopeInTx(tx, operation);
      return nestedActiveProfileOperations(tx, operation.workspaceId!);
    });
    if (nested > 0) return outcome(operation, null, "nested_operation_active");
  }
  if (operation.scope === "identity" && operation.userId) {
    const nested = await db.transaction((tx) => nestedRequestedOperations(tx, operation.userId!));
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
  /** R-165: held Stripe money on the erased workspace — the operator's refund list. */
  refundOwed: readonly RefundOwed[];
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
  options: Pick<DeletionExecutorOptions, "migrations" | "activationExclusions">
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
    // THE EXPORTED AUTHORITY, not a second copy of its query. This site used to
    // re-implement the check inline while `assertNoUnknownExternalCommands` sat
    // exported and tested with no caller — so the tests proved a function
    // nothing ran, and the production path was one edit away from drifting from
    // the rule it enforces. An unknown external outcome must never permit
    // erasure (plan C3).
    try {
      await assertNoUnknownExternalCommands(tx, operation.id);
    } catch (error) {
      // The module refuses with a coded message rather than a typed class, so
      // the prefix is the contract. Anything else rethrows untouched: a driver
      // error must not be laundered into a lifecycle refusal.
      const message = error instanceof Error ? error.message : "";
      const refusal = message.startsWith("external_command_refused:")
        ? message.slice("external_command_refused:".length)
        : null;
      if (refusal !== null) throw new LifecycleExecutorRefusal(refusal);
      throw error;
    }
    const now = await databaseNow(tx);
    // Task 7 / R-121: the captured contribution lands on the aggregate HERE,
    // exactly once, in the transaction whose rollback would also undo it. A
    // missing or mismatched contribution, or a target still present in a
    // deployment id set, blocks the erasure (plan C5/C4).
    if (operation.scope === "identity") {
      // Plan C3, asserted at the last possible moment: the contact may have
      // been re-bound to this person during grace (a handover the other way,
      // or a new Checkout by them). Refusing here (content-free code, operation
      // held) beats completing an erasure whose subject's email is still on a
      // provider object. Only the BY-USER population is re-checked (no
      // workspace ids): an UNKNOWN contact cannot arise during grace, because
      // `customers.ts` is the sole `subscriptions` inserter and always sets
      // the contact, and `ON DELETE SET NULL` fires only on an identity
      // erasure this very rule refuses.
      if (!operation.userId) throw new LifecycleExecutorRefusal("identity_target_missing");
      try {
        await assertBillingContactReleased(tx, operation.userId, []);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.startsWith("deletion_refused:")) {
          throw new LifecycleExecutorRefusal(message.slice("deletion_refused:".length));
        }
        throw error;
      }
      try {
        await applyActivationContributionInTx(tx, operation, options.activationExclusions, now);
      } catch (error) {
        if (error instanceof ActivationContributionRefusal) throw new LifecycleExecutorRefusal(error.code);
        throw error;
      }
    }
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
    // BEFORE the executors, not after: the purge derives its population from
    // the subject's memberships (live and snapshotted), and the executors are
    // what delete those. Running it afterwards looked correct and quietly
    // purged nothing, because by then the subject belonged to no workspace.
    //
    // An identity or workspace erasure ERASES the subject's Stripe payloads
    // rather than waiting for the 90-day clock. The registry cannot express
    // this target: `stripe_events` rows carry no user link, only a workspace
    // and a customer. Finance facts are lifted out first, in this same
    // transaction, by the same extractor the retention sweep uses.
    // R-165: the held money becomes the durable refund-owed record HERE, in
    // this transaction and before the purge below clears the payloads its
    // amounts come from. Only this workspace's own erasure does this; every
    // other payload producer skips a held receipt.
    const refundOwed =
      operation.scope === "workspace" && operation.workspaceId
        ? await recordRefundOwedInTx(tx, operation.workspaceId, operation.id)
        : [];
    if (operation.scope === "identity" && operation.userId) {
      await purgeSubjectStripePayloadsInTx(tx, { userId: operation.userId });
    } else if (operation.scope === "workspace" && operation.workspaceId) {
      // The workspace's Stripe customer was created with its creator's email,
      // so the payload carries a person even though the scope is a workspace.
      await purgeSubjectStripePayloadsInTx(tx, { workspaceId: operation.workspaceId });
    }
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
              // Task 7: the identifier-bearing hash goes with the target; the
              // receipt digest written at apply time names no user.
              activationPayloadHash: null,
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
      refundOwed,
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
    const done = outcome(operation, erased.operation.state, `erased:${erased.receiptDigest.slice(0, 16)}`);
    return erased.refundOwed.length > 0 ? { ...done, refundOwed: erased.refundOwed } : done;
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
      let result = await advanceOne(db, operation, ports, options);
      if (result.to === null && !NORMAL_HOLD_CODES.some((prefix) => result.code.startsWith(prefix))) {
        code = result.code;
        countsAsRetry = !WAITING_CODES.some((prefix) => result.code.startsWith(prefix));
        if (!countsAsRetry && (await waitIsStalled(db, operation, options))) {
          result = { ...result, stalled: true };
        }
      }
      outcomes.push(result);
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
    refundOwed: outcomes.reduce((total, item) => total + (item.refundOwed?.length ?? 0), 0),
    stalledWaits: outcomes.filter((item) => item.stalled === true).length,
    outcomes,
  };
}

/**
 * Whether a WAITING operation has waited past the alert bound (R-166). The
 * wait can first begin at the grace expiry for a `grace` operation (its only
 * wait is on nested operations, after grace), else when it entered its
 * current state — its latest journal transition. Database time.
 */
async function waitIsStalled(
  db: DbLike,
  operation: DeletionOperation,
  options: DeletionExecutorOptions
): Promise<boolean> {
  const boundMs = options.waitAlertAfterMs ?? DELETION_WAIT_ALERT_AFTER_MS;
  const [row] = await db
    .select({
      enteredAt: sql<Date | string | null>`max(${deletionOperationTransitions.createdAt})`,
      now: sql<Date | string>`clock_timestamp()`,
    })
    .from(deletionOperationTransitions)
    .where(eq(deletionOperationTransitions.operationId, operation.id));
  const now = new Date(row?.now ?? Date.now());
  const started =
    operation.state === "grace" && operation.graceExpiresAt
      ? operation.graceExpiresAt
      : row?.enteredAt
        ? new Date(row.enteredAt)
        : null;
  return started !== null && now.getTime() - started.getTime() > boundMs;
}

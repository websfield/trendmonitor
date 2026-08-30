// Slice 2b: the spend record that outlives deletion (docs/plans/respin-finish-phase-2b.md).
// Slice 2b-c (this file's R4/R4a additions): the corrective addendum
// (docs/plans/respin-finish-phase-2b.md's "correction" section) that gives the
// rollup a retained unknown-cost denominator and its one reconciliation
// transition.
//
// Six responsibilities, kept in one file because they are one concern read
// from different sides:
//  - `periodMonthUtc` — the ONE month-truncation function `recordModelUsage`'s
//    rollup upsert uses to bucket a row (R2). No caller clock: it takes the
//    row's OWN `created_at`.
//  - `upsertSpendRollup` — the rollup's one sanctioned write path, composed
//    into `recordModelUsage`'s transaction in `with-workspace.ts` (R1/R6),
//    now also incrementing the retained `unknown_call_count` denominator (R4).
//  - `applyReconciliationDelta` — R4a: `model_usage`'s ONE sanctioned UPDATE
//    (`estimated`/`unknown` -> `reconciled`), applying the exact cost and
//    unknown-count delta to the rollup in the SAME transaction, exactly once
//    (idempotent by row-locked state, not a separate dedup table — see the
//    function's own docblock).
//  - `pseudonymiseWorkspaceSpend` — R-30.5 / R-54: the deletion executor's
//    obligation on `workspace_spend_monthly`, six slices before that executor
//    exists (`tests/retention.test.ts`'s sibling tripwire is what carries the
//    obligation there).
//  - `reconcileSpend` — R-30.9 / R-41: an operator-run query (no scheduler
//    exists — tech-spec.md:18 — and this file must not select one), comparing
//    the rollup against `model_usage` while both still exist (R12).
//
// DELIBERATELY NO IMPORT FROM `with-workspace.ts`. `with-workspace.ts` imports
// `periodMonthUtc` and `upsertSpendRollup` FROM here to compose them into
// `recordModelUsage`'s transaction — a reverse edge (this file importing
// `assertScoped`/`WorkspaceScope` back) would be a circular module
// dependency. `monthlySpend` (R7), the one function here that would have
// wanted `assertScoped`, is defined in `with-workspace.ts` instead, beside
// the scope classes it checks against.
import { and, eq, ne, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { DbLike, TxLike } from "./db-like";
import { creditLedger } from "./billing-schema";
import { creatorProfiles } from "./brain-schema";
import { ReconciliationTargetError } from "./errors";
import {
  BILLABLE_USAGE_OUTCOMES,
  modelUsage,
  workspaceSpendMonthly,
  type ResolvedTier,
} from "./onboarding-schema";

/**
 * Truncate to the first day of `d`'s UTC month, as the `YYYY-MM-DD` string the
 * `date()` column type expects.
 *
 * UTC, not the process's local timezone — the same discipline
 * `packages/credits/src/months.ts` documents for calendar-month arithmetic
 * elsewhere in this codebase, and for the same reason: a server and a test
 * runner do not always agree on a local offset, but they always agree on UTC.
 */
export function periodMonthUtc(d: Date): string {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // 1-indexed for the string form
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * The rollup's ONE sanctioned write path (see `onboarding-schema.ts`'s
 * docblock on `workspaceSpendMonthly`): increment `cost_micro_usd`,
 * `call_count` and `unknown_call_count` for the grain this usage row belongs
 * to, via `onConflictDoUpdate` on `workspace_spend_monthly_grain_uq`.
 *
 * MUST run inside the SAME transaction as the `model_usage` insert that
 * produced `usage` (R1/R6) — this function takes a `TxLike`, never a bare
 * `DbLike`, so that composing it outside a transaction is a type error, not a
 * runtime one.
 *
 * `costState: 'unknown'` increments `call_count` AND `unknown_call_count`,
 * and NOT `cost_micro_usd` (R4): `inference.ts:686-690` already states the
 * rule this rollup must honour — a NULL cost is not a zero cost, and folding
 * it in as zero would silently understate spend, which overstates margin,
 * the dangerous direction `tech-spec.md` §2 names. `unknown_call_count` is
 * the RETAINED denominator for that share — it lives on this row, not
 * derived from `model_usage` at read time, because `model_usage` is exactly
 * the detail this table is built to outlive (R4: the share must stay
 * calculable after that detail is gone).
 */
export async function upsertSpendRollup(
  tx: TxLike,
  usage: {
    workspaceId: string;
    createdAt: Date;
    resolvedTier: ResolvedTier;
    costMicroUsd: bigint | null;
    costState: "estimated" | "reconciled" | "unknown";
  }
): Promise<void> {
  const increment = usage.costState === "unknown" ? 0n : usage.costMicroUsd ?? 0n;
  const unknownIncrement = usage.costState === "unknown" ? 1 : 0;
  await tx
    .insert(workspaceSpendMonthly)
    .values({
      workspaceId: usage.workspaceId,
      periodMonth: periodMonthUtc(usage.createdAt),
      tier: usage.resolvedTier,
      costMicroUsd: increment,
      callCount: 1,
      unknownCallCount: unknownIncrement,
    })
    .onConflictDoUpdate({
      target: [
        workspaceSpendMonthly.workspaceId,
        workspaceSpendMonthly.periodMonth,
        workspaceSpendMonthly.tier,
      ],
      set: {
        costMicroUsd: sql`${workspaceSpendMonthly.costMicroUsd} + ${increment}`,
        callCount: sql`${workspaceSpendMonthly.callCount} + 1`,
        unknownCallCount: sql`${workspaceSpendMonthly.unknownCallCount} + ${unknownIncrement}`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * R4a — the rollup's reaction to `model_usage`'s ONE sanctioned UPDATE
 * (`onboarding-schema.ts:75-79`'s own docblock names the transition —
 * `estimated`/`unknown` -> `reconciled` — as the table's one legal write path
 * besides insert; this function and `applyReconciliationDelta` below are
 * that transition's first implementation).
 *
 * WHY A DELTA, NOT A RE-RUN OF `upsertSpendRollup`: reconciliation is not a
 * new call — `call_count` must NOT move, only the two aggregates a better
 * price changes. Sharing `upsertSpendRollup`'s insert-or-increment shape
 * (rather than assuming the grain row already exists) costs nothing and
 * covers the same edge case that function already covers.
 */
async function applyRollupDelta(
  tx: TxLike,
  usage: {
    workspaceId: string;
    createdAt: Date;
    resolvedTier: ResolvedTier;
    costMicroUsdDelta: bigint;
    unknownCallCountDelta: number;
  }
): Promise<void> {
  await tx
    .insert(workspaceSpendMonthly)
    .values({
      workspaceId: usage.workspaceId,
      periodMonth: periodMonthUtc(usage.createdAt),
      tier: usage.resolvedTier,
      costMicroUsd: usage.costMicroUsdDelta,
      callCount: 0,
      unknownCallCount: usage.unknownCallCountDelta,
    })
    .onConflictDoUpdate({
      target: [
        workspaceSpendMonthly.workspaceId,
        workspaceSpendMonthly.periodMonth,
        workspaceSpendMonthly.tier,
      ],
      set: {
        costMicroUsd: sql`${workspaceSpendMonthly.costMicroUsd} + ${usage.costMicroUsdDelta}`,
        unknownCallCount: sql`${workspaceSpendMonthly.unknownCallCount} + ${usage.unknownCallCountDelta}`,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * R4a: apply a vendor's reconciled cost to ONE `model_usage` row, in the same
 * transaction as that row's `estimated`/`unknown` -> `reconciled` transition,
 * exactly once.
 *
 * IDENTIFIED BY `usageId` (the row's own primary key), DELIBERATELY NOT
 * `attemptId` — `model_usage` has no unique index on `attempt_id` by design
 * (a bounded retry writes two rows for one logical attempt, both charged,
 * per this file's header and `onboarding-schema.ts:146-149`), so a vendor's
 * reconciliation event is a fact about one specific call, not one attempt,
 * and only the row id names that unambiguously.
 *
 * IDEMPOTENT BY ROW-LOCKED STATE, not by a separate idempotency table: the
 * row is read with `FOR UPDATE` first (so a concurrent retry blocks on the
 * same row rather than racing this function's check), and if it is already
 * `reconciled` this is a no-op — the second call of a duplicate delivery
 * applies no delta at all (mutation M9's target: "a reconciled retry applies
 * its cost delta twice" must redden `applied: false` on the second call, not
 * a second decrement of `unknown_call_count` or a second cost delta).
 *
 * THE DELTA, computed from the row's OWN prior state (never re-derived from
 * the caller, never re-run through `upsertSpendRollup`'s full-cost/+1-count
 * shape — that would double-count the call this row already contributed to
 * `call_count`):
 *  - prior `unknown`: cost was NULL and contributed 0 to `cost_micro_usd` and
 *    1 to `unknown_call_count`. Delta: `+reconciledCostMicroUsd` to cost,
 *    `-1` to the unknown count.
 *  - prior `estimated`: cost already contributed its estimated figure.
 *    Delta: `reconciledCostMicroUsd - priorCostMicroUsd` to cost only.
 *
 * KNOWN LIMITATION (billing gate round 1, 2026-08-30): the `applied: false`
 * no-op branch cannot tell a DUPLICATE delivery of the SAME price (correctly
 * a no-op) from a SECOND, CORRECTED reconciliation carrying a different
 * price for a row that already went `estimated`/`unknown` -> `reconciled`
 * once (today silently dropped — no log, no error, no signal that a better
 * price arrived and was discarded). There is no reconciliation WEBHOOK yet
 * (this function's own header: "six slices before the executor that must
 * call it exists" is the same shape of gap), so nothing calls this a second
 * time today and the silent drop is unreachable. The no-op branch below
 * returns the row's PRIOR `cost_micro_usd` specifically so that FUTURE
 * caller can do the comparison this function does not: diff
 * `priorCostMicroUsd` against the `reconciledCostMicroUsd` it was about to
 * apply and log/alert on a genuine mismatch, rather than lose it the way a
 * bare `{ applied: false }` would.
 */
export async function applyReconciliationDelta(
  tx: TxLike,
  params: { usageId: string; reconciledCostMicroUsd: bigint }
): Promise<
  | { applied: true }
  | { applied: false; priorCostMicroUsd: bigint }
> {
  const [locked] = await tx
    .select({
      workspaceId: modelUsage.workspaceId,
      createdAt: modelUsage.createdAt,
      resolvedTier: modelUsage.resolvedTier,
      costState: modelUsage.costState,
      costMicroUsd: modelUsage.costMicroUsd,
    })
    .from(modelUsage)
    .where(eq(modelUsage.id, params.usageId))
    .for("update");

  if (!locked) {
    throw new ReconciliationTargetError(params.usageId);
  }

  // ALREADY RECONCILED — a no-op, never a second decrement (R4a / M9). This
  // check runs UNDER the row lock just taken above, so a concurrent retry in
  // another transaction blocks until this one commits (and then sees
  // `reconciled` itself) rather than reading a stale pre-transition state
  // and applying the delta a second time.
  if (locked.costState === "reconciled") {
    // `costMicroUsd` is non-null here by construction: the DB CHECK
    // constraint `(cost_state = 'unknown') = (cost_micro_usd IS NULL)`
    // (onboarding-schema.ts) makes NULL cost impossible for any state other
    // than `unknown`, and this branch only runs when state is `reconciled`.
    return { applied: false, priorCostMicroUsd: locked.costMicroUsd ?? 0n };
  }

  const costDelta =
    locked.costState === "unknown"
      ? params.reconciledCostMicroUsd
      : params.reconciledCostMicroUsd - (locked.costMicroUsd ?? 0n);
  const unknownCallCountDelta = locked.costState === "unknown" ? -1 : 0;

  await tx
    .update(modelUsage)
    .set({
      costState: "reconciled",
      costMicroUsd: params.reconciledCostMicroUsd,
    })
    .where(eq(modelUsage.id, params.usageId));

  await applyRollupDelta(tx, {
    workspaceId: locked.workspaceId,
    createdAt: locked.createdAt,
    resolvedTier: locked.resolvedTier,
    costMicroUsdDelta: costDelta,
    unknownCallCountDelta,
  });

  return { applied: true };
}

// `monthlySpend` (R7, the creator's credit burn this billing period) is
// DEFINED IN `with-workspace.ts`, not here — it needs `assertScoped` and
// `WorkspaceScope`, and importing them here would create the circular module
// dependency this file's header explains. `creditLedger` stays imported below
// only for `reconcileSpend`'s `unbilledAttempts` subquery.

/**
 * R-30.5 / R-54 (delegated 2026-08-29): the deletion executor's ONE
 * obligation on this table. Every row this workspace has accumulated moves to
 * the SAME fresh random id — one identifier per deleted workspace, not one
 * per row, so the workspace's own spend history stays internally groupable
 * without being re-linkable to the real workspace. The mapping is discarded:
 * nothing records old-id -> new-id, by construction (no such column exists to
 * write it to).
 *
 * Written six slices before the executor that must call it exists —
 * `tests/retention.test.ts`'s sibling scan is the tripwire that keeps this
 * obligation from being the kind of prose promise CLAUDE.md's 2026-08-21
 * lesson is about.
 */
export async function pseudonymiseWorkspaceSpend(
  tx: TxLike,
  workspaceId: string
): Promise<{ pseudonymisedId: string; rowsUpdated: number }> {
  const pseudonymisedId = uuidv7();
  const updated = await tx
    .update(workspaceSpendMonthly)
    .set({ workspaceId: pseudonymisedId })
    .where(eq(workspaceSpendMonthly.workspaceId, workspaceId))
    .returning({ id: workspaceSpendMonthly.id });
  return { pseudonymisedId, rowsUpdated: updated.length };
}

export type SpendReconciliationClass = "reconciled" | "orphaned" | "drift";

export type SpendReconciliationRow = {
  workspaceId: string;
  periodMonth: string;
  tier: ResolvedTier;
  rollupCostMicroUsd: bigint;
  rollupCallCount: number;
  /**
   * R4/R14: the RETAINED excluded-unknown share for this grain — read
   * straight off the rollup row, never derived from `model_usage` (that
   * detail is exactly what this table outlives). Stays accurate after a
   * REQ-A04 deletion removes every `model_usage` row this count once
   * summarised.
   */
  rollupUnknownCallCount: number;
  /** null when no model_usage rows exist for this grain at all (orphaned or never-billed). */
  usageCostMicroUsd: bigint | null;
  class: SpendReconciliationClass;
};

export type UnbilledAttempt = {
  attemptId: string;
  workspaceId: string;
  purpose: string;
};

export type SpendReconciliationResult = {
  rows: SpendReconciliationRow[];
  counts: Record<SpendReconciliationClass, number>;
  /**
   * R-41: a SUCCESSFUL `model_usage` attempt that was NOT this profile's free
   * included build, and has no matching `credit_ledger` debit. R-41 recorded
   * the cause — a crash between the two commits — and that "nothing
   * reconciles it" until this reader existed. THIS IS A REPORT, NOT A REPAIR
   * (the card's own words): nobody is charged retroactively from this list.
   *
   * WHY NOT `consumed_included_build = false` (the billing gate's finding,
   * 2026-08-29): that column does not mean "this attempt was priced". It is
   * `true` on EVERY successful attempt (`inference.ts:546`, "a successful run
   * is exactly what the included build is for") and `false` only on certain
   * FAILURES that must not consume the entitlement (a truncation, an
   * unclassified error) — a first draft of this filter had that backwards,
   * which both excluded the real crash case (a lost debit is always on a
   * `succeeded` row) and flagged every non-consuming failure as noise
   * forever.
   *
   * NEITHER IS PRICE RECORDED ANYWHERE ON `model_usage` — the free-vs-priced
   * decision is never stored on the row itself; it is implicit in ORDER
   * (`inference.ts`'s `countBillableAttempts`: the profile's first
   * successful, purpose-matched attempt is free, every later one is priced).
   * So this reads the SAME total order `countBillableAttempts` uses —
   * `(created_at, attempt_id)`, partitioned by `(profile_id, purpose)` — and
   * calls a row unbilled only when it is NOT rank 1 for its partition (i.e.
   * genuinely not the free build) and no debit exists for it. This needs no
   * price, no config, no tier — only the SAME ordering fact `@respin/credits`
   * already computes, so it does not invert the dependency graph
   * `resolvedTier`'s docblock forbids crossing.
   */
  unbilledAttempts: UnbilledAttempt[];
};

/**
 * Compare the rollup against `model_usage`, per grain, while both still exist
 * (R12 — a reconciliation written only after the thing it reconciles against
 * is gone cannot be validated).
 *
 * THREE CLASSES, not a binary match/mismatch (question 3 in the phase card):
 * a rollup row surviving a deleted profile tree is the table doing exactly
 * what it exists to do, and reporting that as "drift" would be an alarm that
 * fires on correctness — which nobody reads twice.
 *
 * No scheduler (`tech-spec.md:18` — there is none): this is a query an
 * operator runs, not a background job (R11).
 *
 * KNOWN LIMITATION, documented rather than closed (tenancy gate, 2026-08-29):
 * `hasProfiles` is WORKSPACE-grained ("does any creator_profiles row exist
 * for this workspace"), while the rollup sums cost across every profile in
 * that workspace. If a future deletion path removed ONE profile from a
 * workspace that still holds others, that profile's model_usage rows would
 * cascade away (its own FK) while the survivor's usage remains — and the
 * rollup total, unchanged, would then disagree with the (correctly smaller)
 * surviving sum: a false `drift`, not a real one. NOT REACHABLE TODAY:
 * profiles are ARCHIVED, never deleted (`creatorProfileState`,
 * brain-schema.ts) — the only path that removes a `creator_profiles` row at
 * all is a whole-workspace REQ-A04 deletion, which cascades every profile in
 * the workspace at once, so `hasProfiles` and "does the usage this total
 * summed still exist" are the same fact in every case this product can
 * produce. If a future slice adds per-profile deletion within a surviving
 * workspace, this comparison needs to move to a `(workspace_id, profile_id)`
 * grain before that ships — recorded here so that slice's author finds the
 * assumption instead of re-discovering it.
 */
export async function reconcileSpend(
  db: DbLike
): Promise<SpendReconciliationResult> {
  const rollupRows = await db.select().from(workspaceSpendMonthly);
  const rows: SpendReconciliationRow[] = [];
  const counts: Record<SpendReconciliationClass, number> = {
    reconciled: 0,
    orphaned: 0,
    drift: 0,
  };

  for (const r of rollupRows) {
    const [profileRow] = await db
      .select({ n: sql<string>`count(*)` })
      .from(creatorProfiles)
      .where(eq(creatorProfiles.workspaceId, r.workspaceId));
    const hasProfiles = Number(profileRow?.n ?? "0") > 0;

    let usageCostMicroUsd: bigint | null = null;
    let usageCls: SpendReconciliationClass;
    if (!hasProfiles) {
      usageCls = "orphaned";
    } else {
      const [usageRow] = await db
        .select({ cost: sql<string | null>`sum(${modelUsage.costMicroUsd})` })
        .from(modelUsage)
        .where(
          and(
            eq(modelUsage.workspaceId, r.workspaceId),
            eq(modelUsage.resolvedTier, r.tier),
            ne(modelUsage.costState, "unknown"),
            // AT TIME ZONE 'UTC' EXPLICITLY (billing gate finding, 2026-08-29):
            // `date_trunc` on a `timestamptz` truncates in the SESSION's
            // `timezone` GUC, which nothing in this repo pins (no TZ/PGTZ in
            // docker-compose.yml, client.ts or env.example) — it agrees with
            // `periodMonthUtc`'s UTC-only truncation only because of the
            // Postgres image's default. A deployment with a non-UTC session
            // timezone would misclassify grains near a month boundary as
            // `drift`, the one class this report calls "the only one that is
            // a defect" — an unforced false alarm.
            sql`date_trunc('month', ${modelUsage.createdAt} AT TIME ZONE 'UTC')::date = ${r.periodMonth}::date`
          )
        );
      usageCostMicroUsd = usageRow?.cost != null ? BigInt(usageRow.cost) : 0n;
      usageCls = usageCostMicroUsd === r.costMicroUsd ? "reconciled" : "drift";
    }

    counts[usageCls]++;
    rows.push({
      workspaceId: r.workspaceId,
      periodMonth: r.periodMonth,
      tier: r.tier,
      rollupCostMicroUsd: r.costMicroUsd,
      rollupCallCount: r.callCount,
      rollupUnknownCallCount: r.unknownCallCount,
      usageCostMicroUsd,
      class: usageCls,
    });
  }

  // `db.execute` returns `{ rows }` on both drivers (node-postgres and
  // PGlite); the generic `PgDatabase` type erases that shape, hence the cast
  // — the same pattern `packages/credits/src/clock.ts`'s `getDbNow` already
  // uses for a raw-SQL read.
  //
  // THE RANKED POPULATION MUST MATCH `countBillableAttempts`'s EXACTLY
  // (billing gate round 2, 2026-08-29 — the first draft's `WHERE outcome =
  // 'succeeded'` was too narrow and this fixed it). `countBillableAttempts`
  // (with-workspace.ts) counts `outcome IN BILLABLE_USAGE_OUTCOMES AND
  // consumed_included_build = true` as "prior attempts" when pricing a new
  // one — and `BILLABLE_USAGE_OUTCOMES` includes `refused` and
  // `schema_invalid`, not only `succeeded`: `LlmRefusedError` is billable
  // AND consumes the included build (`packages/llm/src/errors.ts`), so a
  // profile whose FIRST attempt is a policy refusal has its free slot
  // consumed by THAT row — the real pricing logic then charges the profile's
  // SECOND attempt (even though it is the first to succeed). Ranking only
  // `succeeded` rows would have put that second attempt at rank 1, wrongly
  // read it as the free build, and skipped it from the unbilled check
  // entirely — silently missing exactly the R-41 crash case on the one
  // attempt most likely to have it (a paid attempt whose debit failed).
  //
  // So the window function ranks the SAME wide population
  // `countBillableAttempts` does, and only THEN restricts to `succeeded`
  // rows: refusals and other failures never reach the debit step
  // (`inference.ts`'s debit is step 9, inside the success path only) so they
  // can never be "unbilled" themselves, but they still occupy a rank that
  // must be counted so a later successful attempt's true rank is not
  // understated.
  //
  // RANKED AT ATTEMPT GRAIN, NOT ROW GRAIN (billing gate round 3,
  // 2026-08-29). `countBillableAttempts` counts DISTINCT `attempt_id`s
  // (`with-workspace.ts`'s `countDistinct(modelUsage.attemptId)`), because
  // `onboarding-schema.ts`'s own docblock plans for it: "a bounded retry
  // writes two rows" for ONE logical attempt. A first draft here ranked
  // every ROW, so two rows sharing one `attempt_id` (e.g. an early
  // `schema_invalid` retried into a `succeeded`) would rank as two separate
  // attempts, one of them wrongly bumped past rank 1 and reported unbilled
  // for a free build that owes no debit at all. NOT LIVE-REACHABLE TODAY —
  // every server-action caller mints one fresh `attemptId` per press
  // (`app/(product)/onboarding/actions.ts`) and `recordUsage` is invoked at
  // most once per `runInference` call — but the table's own schema was
  // built to anticipate the shape, so the query is written to match it
  // rather than to match today's callers.
  //
  // The CTE groups to `attempt_id` FIRST (`MIN(created_at)` as the attempt's
  // instant, matching `countBillableAttempts`'s `me.firstAt` semantics;
  // `bool_or(outcome = 'succeeded')` because a debit is only ever expected
  // for an attempt that ultimately succeeded, whichever of its rows carries
  // that outcome), THEN ranks attempts, THEN restricts to succeeded ones.
  const unbilledResult = (await db.execute(sql`
    WITH attempts AS (
      SELECT
        ${modelUsage.profileId} AS profile_id,
        ${modelUsage.workspaceId} AS workspace_id,
        ${modelUsage.purpose} AS purpose,
        ${modelUsage.attemptId} AS attempt_id,
        MIN(${modelUsage.createdAt}) AS first_at,
        bool_or(${modelUsage.outcome} = 'succeeded') AS has_succeeded
      FROM ${modelUsage}
      WHERE ${modelUsage.outcome} IN ${BILLABLE_USAGE_OUTCOMES}
        AND ${modelUsage.consumedIncludedBuild} = true
      GROUP BY
        ${modelUsage.profileId},
        ${modelUsage.workspaceId},
        ${modelUsage.purpose},
        ${modelUsage.attemptId}
    ),
    ranked AS (
      SELECT
        attempt_id,
        workspace_id,
        purpose,
        has_succeeded,
        ROW_NUMBER() OVER (
          PARTITION BY profile_id, purpose
          ORDER BY first_at, attempt_id
        ) AS rn
      FROM attempts
    )
    SELECT ranked.attempt_id, ranked.workspace_id, ranked.purpose
    FROM ranked
    WHERE ranked.has_succeeded = true
      AND ranked.rn > 1
      AND NOT EXISTS (
        SELECT 1 FROM ${creditLedger}
        WHERE ${creditLedger.workspaceId} = ranked.workspace_id
          AND ${creditLedger.kind} = 'debit'
          AND ${creditLedger.refType} = 'inference'
          AND ${creditLedger.refId} = ranked.attempt_id
      )
  `)) as unknown as {
    rows: { attempt_id: string; workspace_id: string; purpose: string }[];
  };
  const unbilledAttempts: UnbilledAttempt[] = unbilledResult.rows.map((r) => ({
    attemptId: r.attempt_id,
    workspaceId: r.workspace_id,
    purpose: r.purpose,
  }));

  return { rows, counts, unbilledAttempts };
}

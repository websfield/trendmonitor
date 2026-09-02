// Slice 2b: the spend record that outlives deletion (docs/plans/respin-finish-phase-2b.md).
// Slice 2b-c (this file's R4 addition): the corrective addendum
// (docs/plans/respin-finish-phase-2b.md's "correction" section) that gives the
// rollup a retained unknown-cost denominator.
//
// Four responsibilities, kept in one file because they are one concern read
// from different sides:
//  - `periodMonthUtc` — the ONE month-truncation function `recordModelUsage`'s
//    rollup upsert uses to bucket a row (R2). No caller clock: it takes the
//    row's OWN `created_at`.
//  - `upsertSpendRollup` — the rollup's one sanctioned write path, composed
//    into `recordModelUsage`'s transaction in `with-workspace.ts` (R1/R6),
//    now also incrementing the retained `unknown_call_count` denominator (R4).
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
import {
  BILLABLE_USAGE_OUTCOMES,
  firstBillableAttempts,
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
 * Increment the retained spend rollup for one newly inserted usage row.
 *
 * This remains the rollup's one sanctioned insert/upsert path and MUST run in
 * the same transaction as `model_usage` insertion. Unknown cost contributes
 * one call and one unknown call, but never a guessed zero-cost amount.
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
   * decision is never stored on the row itself. It is the
   * `first_billable_attempts` CLAIM (R-80), READ ONLY FOR THE PURPOSES THAT
   * ACTUALLY HAVE AN INCLUDED BUILD (R-81): for such a purpose the attempt
   * holding the claim is the free one and every other attempt is priced; for a
   * purpose with no included build, EVERY successful attempt is priced and the
   * claim exempts nothing. So an attempt is unbilled here when it succeeded,
   * has no debit, and is not the claim holder of a purpose whose first build
   * is included.
   *
   * WHY THE CALLER STATES THE LIST (billing gate round 1, 2026-09-02). The
   * claim table is purpose-NEUTRAL — `recordModelUsage` writes a claim for the
   * first billable, entitlement-consuming attempt of every purpose, because
   * `@respin/db` does not own the purpose vocabulary. `priceOf`
   * (`@respin/credits`) does, and its `generation` branch charges every
   * generation, so an unconditional `NOT EXISTS (claim)` silently exempted
   * each profile's FIRST generation — a lost debit on the press most likely to
   * hit R-41's crash window on a fresh workspace, invisible to the only
   * reconciliation reader there is. That blind spot predates R-80 (the
   * `ROW_NUMBER()` ranking it replaced hid exactly the same attempt); what
   * R-80 added was a docblock asserting the opposite, which is why it is
   * closed here rather than documented.
   *
   * THE POPULATION IS NOW LITERALLY THE SAME ROW `@respin/credits` PRICES
   * FROM, not a re-implementation of the same rule. It used to be: this file
   * ranked `(created_at, attempt_id)` partitioned by `(profile_id, purpose)`
   * and called rank 1 free, in a comment that said in terms that "THE RANKED
   * POPULATION MUST MATCH `countBillableAttempts`'s EXACTLY". Two
   * implementations of one rule is a promise that they agree; reading the one
   * row the database decided is that agreement. It still needs no price, no
   * config and no tier, so it still does not invert the dependency graph
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
 *
 * `includedBuildPurposes` (R-81) is REQUIRED and has NO DEFAULT. It is the
 * caller's answer to a question this package cannot answer — which purposes
 * price their first billable attempt at zero — the same seam the framework
 * writes' `entitlement` argument opens for the tier, and for the same reason:
 * `@respin/db` may not import `@respin/credits`. `@respin/credits` owns the
 * answer and computes it, from the ACTIVE CONFIG DOCUMENT, in its
 * `includedBuildPurposes` function (R-82 — it was a frozen constant, which was
 * a static answer to a price `/admin/config` can raise). Passing `[]` means
 * "nothing is ever included", which is a real, testable position rather than
 * an omission, and `tests/spend-rollup.test.ts` drives it.
 */
export async function reconcileSpend(
  db: DbLike,
  includedBuildPurposes: readonly string[]
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

  // WHICH ATTEMPTS ARE EXPECTED TO CARRY A DEBIT, and the population is the
  // same one `@respin/credits` prices from — one table, one answer (R-80).
  // The claim table answers "which attempt got here first"; `priceOf` answers
  // "does first mean free", and only the caller can carry that second answer
  // across the package boundary (R-81, `includedBuildPurposes`).
  //
  // THE POPULATION IS WIDE ON PURPOSE, and the billing gate's 2026-08-29
  // finding is why: `BILLABLE_USAGE_OUTCOMES` includes `refused` and
  // `schema_invalid`, not only `succeeded`. `LlmRefusedError` is billable AND
  // consumes the included build (`packages/llm/src/errors.ts`), so a profile
  // whose FIRST attempt is a policy refusal has its free slot consumed by THAT
  // row — and its claim, written by `recordModelUsage` in the same transaction
  // as that row, says so. Restricting the population to `succeeded` would have
  // made the second attempt look like the free build and skipped it from this
  // check entirely — silently missing exactly the R-41 crash case on the one
  // attempt most likely to have it (a paid attempt whose debit failed).
  //
  // ONLY `succeeded` ATTEMPTS ARE REPORTED, though: refusals and other
  // failures never reach the debit step at all (`inference.ts`'s debit is step
  // 9, inside the success path only), so they can never be "unbilled"
  // themselves.
  //
  // AT ATTEMPT GRAIN, NOT ROW GRAIN (billing gate round 3, 2026-08-29). A
  // bounded retry writes two rows for ONE logical attempt
  // (`onboarding-schema.ts`'s own docblock plans for it), and the claim is
  // keyed on `attempt_id`, so grouping here keeps the two sides speaking about
  // the same object. `bool_or(outcome = 'succeeded')` because a debit is only
  // ever expected for an attempt that ultimately succeeded, whichever of its
  // rows carries that outcome. NOT LIVE-REACHABLE TODAY — every server-action
  // caller mints one fresh `attemptId` per press — but the table's own schema
  // was built to anticipate the shape.
  //
  // WHICH PURPOSES THE CLAIM CAN EXEMPT AT ALL (R-81). A literal `false` for
  // an empty list rather than `purpose IN ()`, which is a Postgres syntax
  // error — and `false` is the honest reading of "no purpose has an included
  // build", so every successful attempt then owes a debit.
  const exemptiblePurpose =
    includedBuildPurposes.length === 0
      ? sql`false`
      : sql`attempts.purpose IN ${includedBuildPurposes}`;

  // `db.execute` returns `{ rows }` on both drivers (node-postgres and
  // PGlite); the generic `PgDatabase` type erases that shape, hence the cast
  // — the same pattern `packages/credits/src/clock.ts`'s `getDbNow` already
  // uses for a raw-SQL read.
  const unbilledResult = (await db.execute(sql`
    WITH attempts AS (
      SELECT
        ${modelUsage.profileId} AS profile_id,
        ${modelUsage.workspaceId} AS workspace_id,
        ${modelUsage.purpose} AS purpose,
        ${modelUsage.attemptId} AS attempt_id,
        bool_or(${modelUsage.outcome} = 'succeeded') AS has_succeeded
      FROM ${modelUsage}
      WHERE ${modelUsage.outcome} IN ${BILLABLE_USAGE_OUTCOMES}
        AND ${modelUsage.consumedIncludedBuild} = true
      GROUP BY
        ${modelUsage.profileId},
        ${modelUsage.workspaceId},
        ${modelUsage.purpose},
        ${modelUsage.attemptId}
    )
    SELECT attempts.attempt_id, attempts.workspace_id, attempts.purpose
    FROM attempts
    WHERE attempts.has_succeeded = true
      -- NOT the profile's included build. TWO CONDITIONS, not one (R-81):
      -- this purpose must actually HAVE an included build, and this attempt
      -- must hold its claim. Dropping the first half exempts every profile's
      -- first generation, which is never free.
      AND NOT (
        ${exemptiblePurpose}
        AND EXISTS (
          SELECT 1 FROM ${firstBillableAttempts}
          WHERE ${firstBillableAttempts.profileId} = attempts.profile_id
            AND ${firstBillableAttempts.purpose} = attempts.purpose
            AND ${firstBillableAttempts.attemptId} = attempts.attempt_id
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${creditLedger}
        WHERE ${creditLedger.workspaceId} = attempts.workspace_id
          AND ${creditLedger.kind} = 'debit'
          AND ${creditLedger.refType} = 'inference'
          AND ${creditLedger.refId} = attempts.attempt_id
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

// Phase 10b-1 Task 6.4 / C5 — the one scheduled retention receiver.
//
// One idempotent, traffic-independent sweep over every scheduled clock the
// registry declares. Four properties it must hold, each of which the plan's
// mutation matrix names:
//
//   * TRAFFIC-INDEPENDENT. It runs on the worker's schedule, not off a request.
//     A session row expires whether or not anyone logs in again.
//   * REGISTRY-DRIVEN. The population is `retentionSweepSpecs()`, a derivation
//     of the shipped registry — never a hand-kept list of tables here.
//   * NULL/DELETED-WORKSPACE ROWS INCLUDED. The generated predicate never
//     mentions a workspace, so a `stripe_events` row with `workspace_id IS
//     NULL` is swept exactly like an attributed one. It DOES restrict to the
//     measure's row class: a measure is keyed by (table, row class, field set)
//     and `stripe_events` carries three classes with three different
//     retentions, one of them `financial_chain_seven_years`.
//   * FINANCE BEFORE REDACTION. For `stripe_events.payload` the extract runs
//     in the SAME transaction, immediately before the redaction, and a failed
//     extraction aborts the redaction rather than losing the fact.
//
// It never touches a financial-chain row: `retentionSweepSpecs` only emits
// scheduled clocks, and R-122 keeps `financial_chain_seven_years` off that list
// until jurisdiction and ledger-chain review approve a destructive receiver.
import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

import { ROW_CLASS_INVENTORY } from "./creator-data-registry";
import type { DbLike, TxLike } from "./db-like";
import {
  extractFinanceFacts,
  persistFinanceExtractsInTx,
  type FinanceExtractInput,
} from "./finance-extract";
import {
  retentionSweepSpecs,
  type RetentionMeasure,
  type RetentionSweepSpec,
} from "./retention-clocks";

/** Rows touched per statement. Bounded so one sweep cannot hold a long lock. */
export const RETENTION_BATCH_SIZE = 500;
/** Statements per table per tick. Batch × batches bounds one tick's work. */
export const RETENTION_MAX_BATCHES = 20;

export type RetentionTableOutcome = Readonly<{
  key: string;
  table: string;
  rule: string;
  scanned: number;
  redacted: number;
  deleted: number;
  /** Age of the oldest still-overdue row, in ms, or null when none remains. */
  oldestOverdueMs: number | null;
  /** True when the tick's batch ceiling stopped it before the table was clear. */
  truncated: boolean;
  /** Set when this table's sweep failed; the others still ran. */
  failureCode: string | null;
}>;

export type RetentionTickSummary = Readonly<{
  startedAt: Date;
  tables: readonly RetentionTableOutcome[];
  scanned: number;
  redacted: number;
  deleted: number;
  financeExtractsWritten: number;
  /** The largest `oldestOverdueMs` across tables — the health signal. */
  oldestOverdueMs: number | null;
  failures: readonly string[];
}>;

/** A quoted identifier. The column names come from the closed measure list. */
const ident = (name: string): SQL => sql.raw(`"${name}"`);

/**
 * The instant a row's clock expired, as SQL. `epoch_millis` is the one numeric
 * column (Better Auth's `rate_limit.last_request`); everything else is a real
 * timestamptz, and mixing the two up would sweep at the wrong scale entirely.
 */
function dueBefore(measure: RetentionMeasure, cutoff: Date): SQL {
  if (measure.measuredAs === "epoch_millis") {
    return sql`${ident(measure.measuredFrom)} < ${cutoff.getTime()}`;
  }
  return sql`${ident(measure.measuredFrom)} < ${cutoff}`;
}

function preconditionSql(measure: RetentionMeasure): SQL {
  const { precondition } = measure;
  if (!precondition) return sql`TRUE`;
  if (precondition.kind === "column_not_null") {
    return sql`${ident(precondition.column)} IS NOT NULL`;
  }
  const values = precondition.values.map((value) => sql`${value}`);
  return sql`${ident(precondition.column)}::text IN (${sql.join(values, sql`, `)})`;
}

/**
 * The row-class filter, from the registry's own discriminator inventory.
 *
 * A measure is keyed by (table, ROW CLASS, field set) — `stripe_events` alone
 * carries three classes with three different retentions, one of which is
 * `financial_chain_seven_years`. Without this clause the generated statement
 * says only "clock AND precondition", so a 90-day sweep registered for the
 * `customer_attributed` class also strips the `workspace_attributed` rows that
 * R-122 keeps for seven years — on LIVE workspaces, with an empty failure list.
 *
 * A mixed table with no inventory entry, or a discriminator kind this function
 * cannot render, THROWS rather than returning TRUE: over-selecting is how the
 * sweep destroys retained data, so the safe direction is to refuse to sweep.
 */
const ROW_CLASS_FILTERS = new Map<string, (typeof ROW_CLASS_INVENTORY)[number]["discriminator"]>(
  ROW_CLASS_INVENTORY.map((entry) => [`${entry.table}::${entry.rowClass}`, entry.discriminator]),
);

function rowClassSql(measure: RetentionMeasure): SQL {
  const key = `${measure.table}::${measure.rowClass}`;
  if (!ROW_CLASS_FILTERS.has(key)) {
    throw new Error(`retention receiver: ${key} is not in the row-class inventory`);
  }
  const discriminator = ROW_CLASS_FILTERS.get(key);
  // A single-class table has no discriminator and needs no filter: every row
  // in it belongs to the one class the measure names.
  if (!discriminator) return sql`TRUE`;
  if (discriminator.kind === "enum_value") {
    return sql`${ident(discriminator.column)}::text = ${discriminator.value}`;
  }
  throw new Error(
    `retention receiver: ${key} has a '${discriminator.kind}' discriminator with no sweep predicate. ` +
      `Add one here in the same change that adds the discriminator.`,
  );
}

/**
 * The whole predicate: the row is of this measure's CLASS, its clock has
 * expired, and its precondition holds. All three, or the statement reaches
 * rows the measure was never registered to govern.
 */
function overduePredicate(measure: RetentionMeasure, cutoff: Date): SQL {
  return sql`(${rowClassSql(measure)}) AND (${preconditionSql(measure)}) AND (${dueBefore(measure, cutoff)})`;
}

function redactionAssignments(measure: RetentionMeasure): SQL {
  if (measure.effect.kind !== "redact_columns") {
    throw new Error(`retention receiver: ${measure.table} has no redaction to build`);
  }
  const parts = measure.effect.columns.map((target) => {
    switch (target.to) {
      case "null":
        return sql`${ident(target.column)} = NULL`;
      case "empty_jsonb":
        return sql`${ident(target.column)} = '{}'::jsonb`;
      case "now_if_null":
        // Stamps a companion column the table's CHECK requires alongside the
        // nulled ones. COALESCE so a re-run cannot move an existing stamp,
        // and redactionDonePredicate filters an already-stamped row out
        // before it is ever claimed, so the redaction stays idempotent.
        return sql`${ident(target.column)} = COALESCE(${ident(target.column)}, clock_timestamp())`;
      case "random_token":
        // A fresh opaque value PER ROW, never a reused constant: two redacted
        // rows must not become joinable to each other by their placeholder.
        // `gen_random_uuid()` is evaluated by the database once per row --
        // minting one `randomUUID()` in JavaScript here would bind a single
        // literal into the statement and give all 500 rows in the batch the
        // same placeholder, which is the joinability this exists to prevent.
        return sql`${ident(target.column)} = 'redacted_' || gen_random_uuid()::text`;
    }
  });
  return sql.join(parts, sql`, `);
}

type CountRow = { rows: { count: string | number }[] };
type AgeRow = { rows: { oldest_ms: string | number | null }[] };

/**
 * Rows this sweep still has WORK to do on.
 *
 * `NOT (redactionDonePredicate)` is load-bearing, not tidiness. The clock
 * predicate alone stays true for a redacted row forever -- redaction blanks the
 * columns, it does not move `received_at` -- so counting without it means every
 * redaction measure reports a backlog that only grows. `OVERDUE_BACKLOG_MS` is
 * 24 h at `critical`, so 25 hours after the first Stripe payload is correctly
 * redacted a fully caught-up receiver pages forever, and the one signal that
 * distinguishes "keeping up" from "losing the race" is the first thing muted.
 * The sweep itself has always excluded these rows (that is what makes it
 * idempotent); the health signal simply did not ask the same question.
 */
function outstandingPredicate(measure: RetentionMeasure, cutoff: Date): SQL {
  return sql`${overduePredicate(measure, cutoff)} AND NOT (${redactionDonePredicate(measure)})`;
}

async function countOverdue(tx: TxLike, spec: RetentionSweepSpec, cutoff: Date): Promise<number> {
  const result = (await tx.execute(sql`
    SELECT count(*)::bigint AS count FROM ${ident(spec.measure.table)}
    WHERE ${outstandingPredicate(spec.measure, cutoff)}
  `)) as unknown as CountRow;
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * How far past its deadline the oldest still-overdue row is. This is the
 * health signal that distinguishes "the receiver ran" from "the receiver is
 * keeping up" — a green tick with a rising oldest-overdue age is a receiver
 * losing a race, which a heartbeat alone cannot show.
 */
async function oldestOverdueMs(
  tx: TxLike,
  spec: RetentionSweepSpec,
  cutoff: Date,
): Promise<number | null> {
  const { measure } = spec;
  const age = measure.measuredAs === "epoch_millis"
    ? sql`max(${sql`${cutoff.getTime()}`}::bigint - ${ident(measure.measuredFrom)})`
    : sql`(EXTRACT(EPOCH FROM max(${sql`${cutoff}`}::timestamptz - ${ident(measure.measuredFrom)})) * 1000)::bigint`;
  const result = (await tx.execute(sql`
    SELECT ${age} AS oldest_ms FROM ${ident(measure.table)}
    WHERE ${outstandingPredicate(measure, cutoff)}
  `)) as unknown as AgeRow;
  const raw = result.rows[0]?.oldest_ms;
  return raw === null || raw === undefined ? null : Number(raw);
}

type ExecResult = { rowCount?: number; affectedRows?: number };
const affected = (result: unknown): number => {
  const value = result as ExecResult;
  return Number(value.rowCount ?? value.affectedRows ?? 0);
};

/**
 * The finance extract that must precede a `stripe_events.payload` redaction.
 * It reads the rows about to be redacted, extracts, persists — and only then
 * does the caller redact, in the same transaction. If this throws, the
 * transaction rolls back and the payload survives to be tried again: losing
 * the fact is worse than redacting late, and C5 forbids losing it.
 */
async function extractBeforeRedaction(tx: TxLike, idList: SQL): Promise<number> {
  const result = (await tx.execute(sql`
    SELECT id, type, payload, workspace_id
    FROM "stripe_events"
    WHERE id IN (${idList})
      AND payload::text <> '{}'
  `)) as unknown as {
    rows: { id: string; type: string; payload: unknown; workspace_id: string | null }[];
  };

  let written = 0;
  for (const row of result.rows) {
    const payload = row.payload as Record<string, unknown> | null;
    const data = payload && typeof payload === "object" ? (payload.data as Record<string, unknown> | undefined) : undefined;
    const input: FinanceExtractInput = {
      eventId: row.id,
      eventType: row.type,
      object: data?.object ?? null,
      // The pseudonymous chain key, derived from the workspace id rather than
      // being it: a hash the erased workspace can never be recovered from, and
      // stable so 10b-2 can group a workspace's periods together.
      workspaceKey: row.workspace_id === null ? null : pseudonymousWorkspaceKey(row.workspace_id),
    };
    written += await persistFinanceExtractsInTx(tx, extractFinanceFacts(input));
  }
  return written;
}

/**
 * A one-way, unsalted-by-design key: the same workspace always maps to the same
 * key so periods group, and the mapping is a SHA-256 the deleted workspace id
 * cannot be read back out of. It is NOT a secret-keyed MAC — there is no key to
 * hold — so it is a grouping key, not an anonymity guarantee against someone
 * who already has the workspace id. That distinction is why C3 calls it
 * "pseudonymous" and not "anonymous".
 */
export function pseudonymousWorkspaceKey(workspaceId: string): string {
  return `wk_${createHash("sha256").update(`respin-finance-chain:${workspaceId}`).digest("hex").slice(0, 32)}`;
}

async function sweepOne(
  db: DbLike,
  spec: RetentionSweepSpec,
  now: Date,
): Promise<{ outcome: RetentionTableOutcome; financeExtracts: number }> {
  const cutoff = new Date(now.getTime() - spec.durationMs);
  const base = {
    key: spec.key,
    table: spec.measure.table,
    rule: spec.rule,
  };
  let scanned = 0;
  let redacted = 0;
  let deleted = 0;
  let financeExtracts = 0;
  let truncated = false;
  let oldest: number | null = null;

  try {
    for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
      const touched = await db.transaction(async (tx) => {
        if (batch === 0) {
          scanned = await countOverdue(tx, spec, cutoff);
        }
        const table = ident(spec.measure.table);
        const predicate = overduePredicate(spec.measure, cutoff);
        if (spec.measure.effect.kind === "delete_row") {
          const result = await tx.execute(sql`
            DELETE FROM ${table}
            WHERE ctid IN (
              SELECT ctid FROM ${table} WHERE ${predicate}
              ORDER BY ctid LIMIT ${RETENTION_BATCH_SIZE} FOR UPDATE SKIP LOCKED
            )
          `);
          const rows = affected(result);
          deleted += rows;
          return rows;
        }
        // A redaction is idempotent only if an already-redacted row stops
        // matching, so every redaction batch excludes rows whose first target
        // column is already at its redacted value. Without that the sweep
        // would rewrite the same rows every tick and never terminate.
        const alreadyDone = redactionDonePredicate(spec.measure);
        // ONE row set, claimed once, used by BOTH the extract and the
        // redaction. Selecting them separately -- the extract ordered by
        // `received_at`, the redaction by `ctid` -- yields two different
        // 500-row sets the moment more than 500 rows are overdue, and a row in
        // the second set but not the first is redacted with its finance facts
        // never extracted. C5 forbids losing that fact and nothing can recover
        // it: `extractBeforeRedaction` skips `payload = '{}'`, so the row is
        // permanently unextractable the instant it is redacted.
        const claimed = (await tx.execute(sql`
          SELECT id FROM ${table}
          WHERE ${predicate} AND NOT (${alreadyDone})
          ORDER BY ctid LIMIT ${RETENTION_BATCH_SIZE} FOR UPDATE SKIP LOCKED
        `)) as unknown as { rows: { id: string }[] };
        const ids = claimed.rows.map((row) => row.id);
        if (ids.length === 0) return 0;
        const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
        // The finance extract, in the SAME transaction and BEFORE the UPDATE,
        // over exactly the rows this batch is about to redact.
        if (spec.key.endsWith("::provider_payload")) {
          financeExtracts += await extractBeforeRedaction(tx, idList);
        }
        const result = await tx.execute(sql`
          UPDATE ${table} SET ${redactionAssignments(spec.measure)}
          WHERE id IN (${idList})
        `);
        const rows = affected(result);
        redacted += rows;
        return rows;
      });
      if (touched < RETENTION_BATCH_SIZE) break;
      if (batch === RETENTION_MAX_BATCHES - 1) truncated = true;
    }
    oldest = await db.transaction((tx) => oldestOverdueMs(tx, spec, cutoff));
    return {
      outcome: { ...base, scanned, redacted, deleted, oldestOverdueMs: oldest, truncated, failureCode: null },
      financeExtracts,
    };
  } catch (error) {
    // One table's failure must not stop the others: a receiver that aborts the
    // whole tick on one bad table leaves every OTHER governed row overdue.
    return {
      outcome: {
        ...base,
        scanned,
        redacted,
        deleted,
        oldestOverdueMs: oldest,
        truncated,
        failureCode: failureCodeOf(error),
      },
      financeExtracts,
    };
  }
}

/**
 * Whether a row's redaction has already happened. Derived from the measure's
 * own target list so it cannot drift from what the UPDATE writes.
 */
function redactionDonePredicate(measure: RetentionMeasure): SQL {
  if (measure.effect.kind !== "redact_columns") return sql`FALSE`;
  const parts = measure.effect.columns.map((target) => {
    switch (target.to) {
      case "null":
        return sql`${ident(target.column)} IS NULL`;
      case "empty_jsonb":
        return sql`${ident(target.column)}::text = '{}'`;
      case "now_if_null":
        return sql`${ident(target.column)} IS NOT NULL`;
      case "random_token":
        return sql`${ident(target.column)} LIKE 'redacted\\_%'`;
    }
  });
  return sql.join(parts, sql` AND `);
}

/**
 * A content-free code. The receiver's logs and metrics carry codes and counts
 * only (C5), so a driver message — which can quote a row value — never reaches
 * them.
 */
function failureCodeOf(error: unknown): string {
  // The driver puts the SQLSTATE on the CAUSE, not on the error drizzle throws,
  // so reading only `error.code` made this branch dead for every real database
  // failure: a CHECK violation that aborted the sweep on every tick surfaced as
  // the generic `receiver_error`, and the one diagnostic bit a content-free
  // code is allowed to carry was thrown away. Both are read now, cause first.
  const candidates = [
    (error as { cause?: { code?: unknown } } | null)?.cause?.code,
    (error as { code?: unknown } | null)?.code,
  ];
  for (const code of candidates) {
    if (typeof code === "string" && code.length > 0) return `sqlstate_${code}`;
  }
  return "receiver_error";
}

/**
 * One tick. Sweeps every scheduled clock, returns per-table counts, and never
 * throws: a failed table is reported in its own outcome so the worker can alert
 * on it while the rest of the sweep still happened.
 */
export async function runRetentionTick(
  db: DbLike,
  now: Date,
  specs: readonly RetentionSweepSpec[] = retentionSweepSpecs(),
): Promise<RetentionTickSummary> {
  const tables: RetentionTableOutcome[] = [];
  let financeExtractsWritten = 0;
  for (const spec of specs) {
    const { outcome, financeExtracts } = await sweepOne(db, spec, now);
    financeExtractsWritten += financeExtracts;
    tables.push(outcome);
  }
  const overdue = tables.map((table) => table.oldestOverdueMs).filter((value): value is number => value !== null);
  return {
    startedAt: now,
    tables,
    scanned: tables.reduce((total, table) => total + table.scanned, 0),
    redacted: tables.reduce((total, table) => total + table.redacted, 0),
    deleted: tables.reduce((total, table) => total + table.deleted, 0),
    financeExtractsWritten,
    oldestOverdueMs: overdue.length > 0 ? Math.max(...overdue) : null,
    failures: tables.filter((table) => table.failureCode !== null).map((table) => `${table.key}:${table.failureCode}`),
  };
}

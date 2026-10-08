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
  /**
   * Rows this tick could not write EVEN ALONE — a row whose redaction or delete
   * violates a constraint. Counted rather than swallowed, because a batch that
   * rolls back on one bad row used to re-claim the identical `ORDER BY ctid`
   * set on every future tick and never make progress, silently.
   */
  poisoned: number;
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
  /** Total rows no batch could write alone. Non-zero is always actionable. */
  poisoned: number;
  failures: readonly string[];
}>;

/** A quoted identifier. The column names come from the closed measure list. */
const ident = (name: string): SQL => sql.raw(`"${name}"`);

/**
 * The sweep specs whose redaction must be preceded by a finance extract.
 *
 * An explicit LIST, not the `spec.key.endsWith("::provider_payload")` test this
 * replaces (CLAUDE.md Respin rule 7: a derived guard's population is a list, not
 * a producer). `extractBeforeRedaction` hard-codes `FROM "stripe_events"`, so a
 * field set named `provider_payload` on any OTHER table would have silently run
 * the extractor against the wrong table. Adding a table here is a deliberate
 * edit; `assertFinanceExtractSpecClosure` below refuses a spec that looks like
 * one of these and is not listed.
 */
export const FINANCE_EXTRACT_SPEC_KEYS = [
  "stripe_events::stripe_customer_attributed::provider_payload",
  "stripe_events::stripe_unattributed::provider_payload",
  "stripe_events::stripe_workspace_attributed::provider_payload",
] as const;

const FINANCE_EXTRACT_SPEC_KEY_SET: ReadonlySet<string> = new Set(FINANCE_EXTRACT_SPEC_KEYS);

/**
 * Refuses a sweep spec that carries a provider payload but is not in the list
 * above. This is the witness that keeps the list a LIST: adding a
 * `provider_payload` field set to a new table, or renaming a stripe row class,
 * fails here instead of silently skipping the extract (losing the finance fact
 * forever, since a redacted payload can never be re-extracted) or silently
 * running `FROM "stripe_events"` against the wrong table.
 */
export function assertFinanceExtractSpecClosure(specs: readonly RetentionSweepSpec[]): void {
  const listed = new Set(FINANCE_EXTRACT_SPEC_KEYS as readonly string[]);
  const looksLikeOne = specs
    .filter((spec) => spec.measure.fieldSet === "provider_payload")
    .map((spec) => spec.key);
  const unlisted = looksLikeOne.filter((key) => !listed.has(key));
  if (unlisted.length > 0) {
    throw new Error(
      `retention: provider_payload spec(s) not in FINANCE_EXTRACT_SPEC_KEYS: ${unlisted.join(", ")}. ` +
        `Add them there (and confirm extractBeforeRedaction can read that table) rather than relying on the key's shape.`
    );
  }
  const missing = [...listed].filter((key) => !specs.some((spec) => spec.key === key));
  if (missing.length > 0) {
    throw new Error(`retention: FINANCE_EXTRACT_SPEC_KEYS names spec(s) that no longer exist: ${missing.join(", ")}`);
  }
}

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
  if (precondition.kind === "state_not_in") {
    return sql`${ident(precondition.column)}::text NOT IN (${sql.join(values, sql`, `)})`;
  }
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

/**
 * Erase the raw Stripe payloads an identity erasure would otherwise leave
 * behind, in the erasure's own transaction.
 *
 * WHY THIS EXISTS. `stripe_events.payload` is swept on a 90-day clock measured
 * from `received_at`, and `erasureHold("identity")` returns null because that
 * receiver is wired. But a clock is not an erasure step: a completed identity
 * erasure left up to 90 days of unredacted webhook JSON — carrying the deleted
 * person's email, name and billing address, since the Stripe customer is
 * created with the acting user's email — while `/settings/account` showed them
 * a CLOSED "what survives erasure" list that did not mention it.
 *
 * The population is deliberately OVER-inclusive: every workspace the subject
 * currently belongs to (any role) plus every workspace this operation's
 * membership snapshot names, rather than an attempt to decide which customer
 * object carries whose email. It is NOT "every workspace the subject ever
 * belonged to": a former contact who was removed from a workspace before
 * deleting (no removal surface exists today; 10b-2 seats will add one) is in
 * neither set and falls back to the 90-day clock — recorded on T-R2-4.
 *
 * WHAT OVER-INCLUSION COSTS, stated rather than waved away: a viewer's identity
 * deletion redacts the workspace's whole unredacted Stripe window. The finance
 * facts are lifted out first, by the same extractor the 90-day sweep uses, so a
 * COMPLETE fact survives — but an INCOMPLETE extract (a withheld amount, a
 * non-USD currency) loses its payload early, and with it the operator's only
 * window to reconcile it. The extract here runs in ONE statement inside the
 * erasure transaction: one unwritable row fails the whole erasure, holding a
 * deletion the subject cannot influence — a rarer outcome since 0055 admitted
 * signed amounts, and the fail-closed direction. Redacting too few leaves a
 * person's email behind, which is the only direction that cannot be undone.
 */
export async function purgeSubjectStripePayloadsInTx(
  tx: TxLike,
  subject: Readonly<{ userId: string; workspaceId?: undefined } | { workspaceId: string; userId?: undefined }>,
): Promise<{ extracted: number; redacted: number }> {
  // The workspaces whose Stripe traffic this subject's erasure must clear. For
  // an identity: every workspace it belonged to, live memberships and deletion
  // snapshots alike, because the snapshot is where a suspended membership lives
  // during erasure. For a workspace: itself.
  const workspaceIds =
    subject.userId === undefined
      ? sql`SELECT ${subject.workspaceId}::uuid AS workspace_id`
      : sql`
          SELECT workspace_id FROM "memberships" WHERE user_id = ${subject.userId}
          UNION
          SELECT workspace_id FROM "deletion_membership_snapshots" WHERE user_id = ${subject.userId}
        `;
  // NEVER a held receipt (R-165, gate H1): a CO-OWNER's identity erasure
  // reaches every workspace the person belonged to, including one tombstoned
  // and still in grace — whose held money must replay if its deletion is
  // cancelled. The held workspace's OWN erasure has already moved its held
  // rows to `refund_owed` (`recordRefundOwedInTx`) when this runs, so they are
  // purged there and only there.
  const claimed = (await tx.execute(sql`
    SELECT id FROM "stripe_events"
    WHERE payload::text <> '{}'
      AND outcome <> 'held_tombstoned'
      AND (
        workspace_id IN (${workspaceIds})
        OR stripe_customer_id IN (
          SELECT stripe_customer_id FROM "subscriptions" WHERE workspace_id IN (${workspaceIds})
        )
      )
    ORDER BY id
    FOR UPDATE
  `)) as unknown as { rows: { id: string }[] };
  const ids = claimed.rows.map((row) => row.id);
  if (ids.length === 0) return { extracted: 0, redacted: 0 };
  const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
  // EXTRACT FIRST, in this transaction. Redacting before extracting loses the
  // finance fact permanently: the extractor skips `payload = '{}'`.
  const extracted = await extractBeforeRedaction(tx, idList);
  const result = await tx.execute(sql`
    UPDATE "stripe_events" SET payload = '{}'::jsonb WHERE id IN (${idList})
  `);
  return { extracted, redacted: affected(result) };
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
  const table = ident(spec.measure.table);
  const isDelete = spec.measure.effect.kind === "delete_row";
  let scanned = 0;
  let redacted = 0;
  let deleted = 0;
  let financeExtracts = 0;
  let truncated = false;
  let poisoned = 0;
  let oldest: number | null = null;
  let failureCode: string | null = null;

  /**
   * Claim up to `limit` overdue rows. Returns their ids (redaction) or ctids
   * (deletion) — the same claim the batch and the per-row fallback both use, so
   * the fallback cannot drift from what the batch attempted.
   */
  const predicate = overduePredicate(spec.measure, cutoff);
  const alreadyDone = isDelete ? null : redactionDonePredicate(spec.measure);
  /**
   * Claim up to `limit` overdue rows, skipping `exclude` (the refs the per-row
   * pass has already found unwritable this tick, so it cannot spin on them).
   */
  const claim = async (tx: TxLike, limit: number, exclude: readonly string[] = []): Promise<string[]> => {
    if (isDelete) {
      const skip = exclude.length === 0 ? sql`` : sql` AND ctid NOT IN (${sql.join(exclude.map((ref) => sql`${ref}::tid`), sql`, `)})`;
      const rows = (await tx.execute(sql`
        SELECT ctid::text AS ref FROM ${table} WHERE ${predicate}${skip}
        ORDER BY ctid LIMIT ${limit} FOR UPDATE SKIP LOCKED
      `)) as unknown as { rows: { ref: string }[] };
      return rows.rows.map((row) => row.ref);
    }
    // A redaction is idempotent only if an already-redacted row stops matching,
    // so every redaction claim excludes rows already at their redacted value.
    // Without that the sweep rewrites the same rows every tick and never ends.
    const skip = exclude.length === 0 ? sql`` : sql` AND id NOT IN (${sql.join(exclude.map((ref) => sql`${ref}`), sql`, `)})`;
    const rows = (await tx.execute(sql`
      SELECT id::text AS ref FROM ${table}
      WHERE ${predicate} AND NOT (${alreadyDone})${skip}
      ORDER BY ctid LIMIT ${limit} FOR UPDATE SKIP LOCKED
    `)) as unknown as { rows: { ref: string }[] };
    return rows.rows.map((row) => row.ref);
  };

  /**
   * Apply the measure to exactly `refs`, in the SAME transaction that claimed
   * them. The write re-states the overdue predicate: a ctid is a physical
   * slot, not an identity, so even under the claim's lock the statement must
   * not be able to touch a row that is no longer the one the predicate chose.
   * Throws if any one of them cannot be written.
   */
  const apply = async (tx: TxLike, refs: readonly string[]): Promise<number> => {
    if (refs.length === 0) return 0;
    if (isDelete) {
      const list = sql.join(refs.map((ref) => sql`${ref}::tid`), sql`, `);
      const result = await tx.execute(sql`DELETE FROM ${table} WHERE ctid IN (${list}) AND (${predicate})`);
      const rows = affected(result);
      deleted += rows;
      return rows;
    }
    // NO cast: `id` is text on `stripe_events` (Stripe's own ids) and uuid
    // elsewhere. Binding the value plainly lets Postgres infer from the column,
    // which is what the pre-isolation code did.
    const list = sql.join(refs.map((ref) => sql`${ref}`), sql`, `);
    // The finance extract runs in the SAME transaction and BEFORE the UPDATE,
    // over exactly the rows this write is about to redact. Gated on an explicit
    // spec list, never on the shape of the key.
    if (FINANCE_EXTRACT_SPEC_KEY_SET.has(spec.key)) {
      financeExtracts += await extractBeforeRedaction(tx, list);
    }
    const result = await tx.execute(sql`
      UPDATE ${table} SET ${redactionAssignments(spec.measure)}
      WHERE id IN (${list}) AND (${predicate}) AND NOT (${alreadyDone})
    `);
    const rows = affected(result);
    redacted += rows;
    return rows;
  };

  try {
    for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
      if (batch === 0) {
        scanned = await db.transaction((tx) => countOverdue(tx, spec, cutoff));
      }
      let touched: number;
      try {
        touched = await db.transaction(async (tx) => apply(tx, await claim(tx, RETENTION_BATCH_SIZE)));
      } catch (error) {
        // THE WEDGE THIS EXISTS TO PREVENT. One row whose write violates a
        // constraint rolls the whole batch back, and the next claim is the same
        // `ORDER BY ctid` set — so the table never advances again, on any tick,
        // forever, while the per-table catch below reports it as one failure.
        // Re-attempt ONE ROW AT A TIME, each row CLAIMED AND WRITTEN IN ONE
        // TRANSACTION. The first version of this fallback claimed a whole
        // batch of ctids in one committed transaction and then deleted by ctid
        // in another, with no predicate: a ctid is a physical slot, so a row
        // updated in between made the ref match nothing (and the table read
        // "fully poisoned"), and a slot reused after VACUUM made it delete an
        // unrelated, live row — reproduced by the consolidating review of the
        // 10b-1 fix rounds. Now the claim's lock is still held when the write
        // runs, the write re-states the predicate, and a ref that failed is
        // excluded from the next claim so the pass cannot spin on it.
        const batchCode = failureCodeOf(error);
        const unwritable: string[] = [];
        let progressed = 0;
        for (let row = 0; row < RETENTION_BATCH_SIZE; row += 1) {
          let ref: string | undefined;
          try {
            const written = await db.transaction(async (tx) => {
              [ref] = await claim(tx, 1, unwritable);
              return ref === undefined ? null : apply(tx, [ref]);
            });
            if (written === null) break;
            progressed += written;
          } catch (rowError) {
            failureCode ??= failureCodeOf(rowError);
            // The CLAIM itself failed (a lost connection, a lock timeout):
            // nothing was chosen, so nothing can be excluded and retrying the
            // same claim up to the batch size would inflate `poisoned`. Stop
            // this table's pass; the failure code and the backlog age report it.
            if (ref === undefined) break;
            poisoned += 1;
            unwritable.push(ref);
          }
        }
        // The batch's own failure code is NOT reported on its own: a transient
        // batch error (a deadlock, a serialization failure) that every row then
        // survives alone is a recovered hiccup, not a failed table, and must not
        // page `retention_sweep_failed`. When a row IS unwritable, its own
        // SQLSTATE (set above) is the more useful code and already stands, so
        // `batchCode` is deliberately unused here.
        void batchCode;
        // Nothing could be written even alone: the table is fully poisoned and
        // retrying the same rows in this tick would spin. Stop, loudly.
        if (progressed === 0) break;
        // A tick that fell into the per-row pass advances at most one batch
        // (499 rows beside a poisoned one) rather than up to RETENTION_MAX_BATCHES
        // batches — at the one-minute cron that is still hundreds of thousands
        // of rows a day, so the slower tick is accepted rather than looped.
        touched = progressed;
      }
      if (touched < RETENTION_BATCH_SIZE) break;
      if (batch === RETENTION_MAX_BATCHES - 1) truncated = true;
    }
  } catch (error) {
    // One table's failure must not stop the others: a receiver that aborts the
    // whole tick on one bad table leaves every OTHER governed row overdue.
    failureCode ??= failureCodeOf(error);
  }

  // ALWAYS measured, success or failure, and never allowed to mask the real
  // failure code. Computing this only on the success path made a wedged sweep
  // report `oldestOverdueMs: null` — muting `retention_overdue_backlog`, the
  // one signal that measures the compliance deadline, at exactly the moment it
  // was needed. That is why the previous round's answer to "a blind sweep would
  // show up in the backlog metric" was wrong.
  try {
    oldest = await db.transaction((tx) => oldestOverdueMs(tx, spec, cutoff));
  } catch (error) {
    failureCode ??= failureCodeOf(error);
  }

  return {
    outcome: { ...base, scanned, redacted, deleted, oldestOverdueMs: oldest, truncated, poisoned, failureCode },
    financeExtracts,
  };
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
  // Fail the tick before it writes anything if the finance-extract population
  // has drifted from the specs. A missed extract is unrecoverable.
  assertFinanceExtractSpecClosure(specs);
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
    poisoned: tables.reduce((total, table) => total + table.poisoned, 0),
    failures: tables.filter((table) => table.failureCode !== null).map((table) => `${table.key}:${table.failureCode}`),
  };
}

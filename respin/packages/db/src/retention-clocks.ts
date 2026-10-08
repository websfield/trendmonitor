// Phase 10b-1 Task 6.1 — the retention clock authority.
//
// The registry (`creator-data-registry.ts`) says WHICH rule governs a field
// set. It does not say how long that rule is, which column measures it, or
// what the receiver does when it expires. Those three facts are here, and
// they are compile-closed in both directions:
//
//   * `RETENTION_CLOCKS` is `Record<RetentionRule, RetentionClock>`, so a rule
//     added to the registry with no clock is a TYPECHECK failure rather than a
//     table that silently never sweeps.
//   * `assertRetentionClockClosure` walks the registry and requires exactly one
//     measure per receiver-executed (table, field set), each naming a column
//     the migration inventory actually has.
//
// CLAUDE.md Respin rule 7: the receiver's population is a LIST derived from the
// registry, never a grep. Adding a receiver-executed entry without a measure
// below is red in `retention-clocks.test.ts`.
import {
  LIFECYCLE_FOREIGN_KEY_EDGES,
  LIFECYCLE_REGISTRY,
  type AppTable,
  type ExecutorId,
  type LifecycleClassEntry,
  type DataRowClass,
  type LifecycleFieldSetName,
  type RetentionRule,
} from "./creator-data-registry";
import type { MigrationInventory } from "./lifecycle-inventory";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * The three shapes a retention rule can take. `subject_lifetime` and
 * `financial_chain` have NO scheduled receiver by construction — the first is
 * erased by its scope's executor when the subject is deleted, the second is
 * held by R-122 until jurisdiction and ledger-chain review approve a
 * destructive receiver. Making them distinct kinds rather than "duration:
 * Infinity" is what lets the closure check refuse a receiver entry that
 * carries one of them.
 */
export type RetentionClock =
  | Readonly<{ kind: "subject_lifetime"; note: string }>
  | Readonly<{ kind: "scheduled"; durationMs: number }>
  | Readonly<{ kind: "financial_chain"; note: string }>;

export const RETENTION_CLOCKS = {
  identity_lifetime: { kind: "subject_lifetime", note: "erased by identity_cascade when the user is deleted" },
  profile_lifetime: { kind: "subject_lifetime", note: "erased by profile_cascade when the profile is deleted" },
  workspace_lifetime: { kind: "subject_lifetime", note: "erased by workspace_cascade when the workspace is deleted" },
  library_lifetime: { kind: "subject_lifetime", note: "ownerless mechanism-level curation history; library-life (R-122)" },
  installation_lifetime: { kind: "subject_lifetime", note: "installation configuration and system control rows" },

  // R-122's non-empty clocks. Every one of these is a derived budget in the
  // plan's own table, and the measure below cites which line.
  session_expiry: { kind: "scheduled", durationMs: 24 * HOUR_MS },
  verification_expiry: { kind: "scheduled", durationMs: 24 * HOUR_MS },
  rate_limit_window: { kind: "scheduled", durationMs: 24 * HOUR_MS },
  identity_recovery_7_days: { kind: "scheduled", durationMs: 7 * DAY_MS },
  // C5: "Settled/debited rows follow their linked financial chain; other
  // content-free terminal attempt metadata expires ONE YEAR after terminal
  // time." The 5 m / 15 m / deadline+5 m / 24 h boundaries belong to the
  // generation receiver in `generation-recovery.ts`; they are that receiver's
  // transitions, never a retention clock. Naming this rule for the recovery
  // receiver's 24 h hard clear is what made the retention sweep delete a paid
  // generation one day after it succeeded.
  generation_attempt_terminal_one_year: { kind: "scheduled", durationMs: 365 * DAY_MS },
  stripe_payload_90_days: { kind: "scheduled", durationMs: 90 * DAY_MS },
  // C5: "a complete row expires 30 days after verified projector ingestion" —
  // measured from `ingested_at`, so an unconsumed extract never expires.
  finance_extract_30_days: { kind: "scheduled", durationMs: 30 * DAY_MS },
  // C5: "activation_cohort_daily system counts expire two years after cohort
  // maturity" — maturity is cohort day + 24 h, so the clock is 2 y + 1 d off the date.
  cohort_two_years: { kind: "scheduled", durationMs: (2 * 365 + 1) * DAY_MS },
  operational_90_days: { kind: "scheduled", durationMs: 90 * DAY_MS },
  security_audit_one_year: { kind: "scheduled", durationMs: 365 * DAY_MS },
  deletion_receipt_one_year: { kind: "scheduled", durationMs: 365 * DAY_MS },

  financial_chain_seven_years: {
    kind: "financial_chain",
    note:
      "max(workspace_closed_at, latest_linked_transaction_completed_at) + 7 years, whole-chain " +
      "eligibility only. R-122 keeps the DESTRUCTIVE receiver disabled until jurisdiction and " +
      "ledger-chain review; Task 6 ships the reporting half only.",
  },
} as const satisfies Readonly<Record<RetentionRule, RetentionClock>>;

/** The executors a scheduled receiver drives. A list, not a producer. */
export const RECEIVER_EXECUTORS = ["expiry_receiver", "stripe_payload_receiver"] as const satisfies readonly ExecutorId[];
export type ReceiverExecutorId = (typeof RECEIVER_EXECUTORS)[number];

export function isReceiverExecutor(executor: ExecutorId): executor is ReceiverExecutorId {
  return (RECEIVER_EXECUTORS as readonly ExecutorId[]).includes(executor);
}

/**
 * How the receiver reads the column it measures from. `epoch_millis` exists
 * for exactly one column — Better Auth's `rate_limit.last_request`, a bigint of
 * milliseconds — and naming it here keeps the receiver from guessing at a
 * numeric column's unit.
 */
export type MeasuredAs = "timestamptz" | "epoch_millis";

/**
 * A closed condition a row must satisfy before its clock is even eligible.
 * Closed on purpose: an arbitrary SQL string here would be an unreviewable
 * hole in a sweep that DELETES rows.
 */
export type RetentionPrecondition =
  | Readonly<{ kind: "state_in"; column: string; values: readonly string[] }>
  | Readonly<{ kind: "state_not_in"; column: string; values: readonly string[] }>
  | Readonly<{ kind: "column_not_null"; column: string }>;

/**
 * R-165 (gate H1): a HELD receipt's payload is the only copy of the money a
 * tombstoned workspace was paid, so no payload clock may take it — the replay
 * needs it if the deletion is cancelled, and the workspace's own erasure lifts
 * the amount into the durable `refund_owed` record before it clears it. Every
 * `stripe_events` payload producer honours this (`HELD_PAYLOAD_PRODUCERS`,
 * pinned in `tests/held-money-payload.test.ts`).
 */
export const NOT_HELD: RetentionPrecondition = {
  kind: "state_not_in",
  column: "outcome",
  values: ["held_tombstoned"],
};

/**
 * The value a redacted column takes. `empty_jsonb` rather than NULL because
 * `stripe_events.payload` is NOT NULL: redaction must not depend on being
 * allowed to drop the column's constraint.
 */
export type RedactionValue = "null" | "empty_jsonb" | "random_token" | "now_if_null";

/**
 * What expiry does. `delete_row` removes the row; `redact_columns` clears the
 * named columns and leaves the content-free remainder — which is the whole
 * point of the Stripe 90-day rule ("retain content-free audit metadata").
 */
export type RetentionEffect =
  | Readonly<{ kind: "delete_row" }>
  | Readonly<{ kind: "redact_columns"; columns: readonly Readonly<{ column: string; to: RedactionValue }>[] }>;

export type RetentionMeasure = Readonly<{
  table: AppTable;
  rowClass: DataRowClass;
  fieldSet: LifecycleFieldSetName;
  measuredFrom: string;
  measuredAs: MeasuredAs;
  precondition: RetentionPrecondition | null;
  effect: RetentionEffect;
  /** Why this column is the clock's start. Read by the reviewer, not by code. */
  why: string;
}>;

const del = (): RetentionEffect => ({ kind: "delete_row" });
const redact = (
  ...columns: readonly Readonly<{ column: string; to: RedactionValue }>[]
): RetentionEffect => ({ kind: "redact_columns", columns });

/**
 * One measure per receiver-executed registry entry, keyed the way the registry
 * keys itself: table, row class, field set. Several rows repeat a clock (three
 * attribution classes of `stripe_events` share the payload clock; three
 * deletion scopes share the receipt clock). That repetition is deliberate,
 * because the closure below is a BIJECTION with the registry: a row class that
 * later needs a different clock is a one-line edit here rather than a silently
 * shared one, and a receiver entry with no line here is red.
 */
export const RETENTION_MEASURES = [
  {
    table: "activation_cohort_daily", rowClass: "system_row", fieldSet: "complete_row",
    measuredFrom: "cohort_date", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "C5: system counts expire two years after cohort maturity; the date column is the cohort day itself.",
  },
  {
    table: "auth_mail_outbox", rowClass: "identity_row", fieldSet: "delivery_outcome_facts",
    measuredFrom: "admitted_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "R-122: content-free delivery metadata, 90 days from admission (auth-mail.test.ts already pins that boundary).",
  },
  {
    table: "deletion_cancellation_proofs", rowClass: "identity_row", fieldSet: "complete_row",
    measuredFrom: "expires_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "verification_expiry: a consumed or lapsed cancellation proof is a spent secret 24 h after its window.",
  },
  {
    table: "deletion_external_commands", rowClass: "identity_row", fieldSet: "receipt_facts",
    measuredFrom: "resolved_at", measuredAs: "timestamptz",
    precondition: { kind: "column_not_null", column: "resolved_at" },
    effect: del(),
    why: "C5: deletion request/outbox/external-command rows remain only while active/unreconciled - the one-year receipt clock starts when the command RESOLVES, so an unreconciled command is never swept.",
  },
  {
    table: "deletion_external_commands", rowClass: "profile_row", fieldSet: "receipt_facts",
    measuredFrom: "resolved_at", measuredAs: "timestamptz",
    precondition: { kind: "column_not_null", column: "resolved_at" },
    effect: del(),
    why: "C5: deletion request/outbox/external-command rows remain only while active/unreconciled - the one-year receipt clock starts when the command RESOLVES, so an unreconciled command is never swept.",
  },
  {
    table: "deletion_external_commands", rowClass: "workspace_row", fieldSet: "receipt_facts",
    measuredFrom: "resolved_at", measuredAs: "timestamptz",
    precondition: { kind: "column_not_null", column: "resolved_at" },
    effect: del(),
    why: "C5: deletion request/outbox/external-command rows remain only while active/unreconciled - the one-year receipt clock starts when the command RESOLVES, so an unreconciled command is never swept.",
  },
  {
    table: "deletion_membership_snapshots", rowClass: "identity_row", fieldSet: "receipt_facts",
    measuredFrom: "created_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "R-122: membership/ownership security audit, one year from capture. `created_at` IS the capture stamp on this table - the row is written once, when the snapshot is taken.",
  },
  {
    table: "deletion_operation_transitions", rowClass: "identity_row", fieldSet: "receipt_facts",
    measuredFrom: "created_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "deletion_receipt_one_year, measured from the transition's own stamp. A transition row is immutable and written once, so `created_at` IS its occurrence time and is its whole clock.",
  },
  {
    table: "deletion_operation_transitions", rowClass: "profile_row", fieldSet: "receipt_facts",
    measuredFrom: "created_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "deletion_receipt_one_year, measured from the transition's own stamp. A transition row is immutable and written once, so `created_at` IS its occurrence time and is its whole clock.",
  },
  {
    table: "deletion_operation_transitions", rowClass: "workspace_row", fieldSet: "receipt_facts",
    measuredFrom: "created_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "deletion_receipt_one_year, measured from the transition's own stamp. A transition row is immutable and written once, so `created_at` IS its occurrence time and is its whole clock.",
  },
  {
    table: "deletion_operations", rowClass: "identity_row", fieldSet: "receipt_facts",
    measuredFrom: "updated_at", measuredAs: "timestamptz",
    precondition: { kind: "state_in", column: "state", values: ["complete", "cancelled"] },
    effect: del(),
    why: "C5: an opaque content-free receipt/version/outcome/contribution state expires one year later - one year after the operation reached its terminal state, which updated_at stamps.",
  },
  {
    table: "deletion_operations", rowClass: "identity_row", fieldSet: "recovery_secret",
    // MEASURED FROM `requested_at`, NOT `recovery_expires_at`. The clock is
    // seven days, and `recovery_expires_at` is ALREADY request + 7 days, so
    // measuring from it fired at request + FOURTEEN days — while the `why`
    // below asserted in terms that this was "not an extra window on top". The
    // sweep now lands exactly at expiry, which is what C5 says.
    measuredFrom: "requested_at", measuredAs: "timestamptz",
    precondition: { kind: "column_not_null", column: "recovery_expires_at" },
    effect: redact(
      { column: "recovery_secret_digest", to: "null" },
      { column: "recovery_secret_prefix", to: "null" },
      // REQUIRED, not decoration. `deletion_operations_recovery_shape` admits an
      // identity row in exactly two shapes: LIVE (consumed_at NULL, digest and
      // prefix present) or SPENT (consumed_at set, both NULL). Nulling the digest
      // without stamping consumed_at lands between them, so the UPDATE violated
      // the CHECK and the whole batch aborted on EVERY tick -- this measure had
      // never once redacted a row, and the worker would have raised a permanent
      // critical alert from the first expired recovery link in production.
      // An expired secret IS spent: `auth-lifecycle.ts` and `deletion-lifecycle.ts`
      // both read a non-null consumed_at as "recovery no longer available", which
      // is what expiry means. Same COALESCE the erasure path already uses.
      { column: "recovery_consumed_at", to: "now_if_null" },
    ),
    // `request_session_digest` is deliberately NOT swept here.
    // `deletion_operations_request_session_digest_shape` requires it NULL when
    // the state is complete/cancelled and NON-NULL otherwise, so no clock can
    // null it: pre-terminal the UPDATE is refused, post-terminal it is already
    // null. That column is governed by the STATE MACHINE, and the row itself
    // goes on the one-year `receipt_facts` delete.
    why: "C5: the identity recovery digest erases on use/cancel, erasure start, or seven-day expiry. Measured from `requested_at` so the sweep lands AT the seven-day expiry rather than seven days after it — the previous version measured from `recovery_expires_at`, which is itself request + 7 days, giving a fourteen-day window under a comment claiming the opposite. Stamping recovery_consumed_at is what makes the redaction legal under deletion_operations_recovery_shape.",
  },
  {
    table: "deletion_operations", rowClass: "profile_row", fieldSet: "receipt_facts",
    measuredFrom: "updated_at", measuredAs: "timestamptz",
    precondition: { kind: "state_in", column: "state", values: ["complete", "cancelled"] },
    effect: del(),
    why: "C5: an opaque content-free receipt/version/outcome/contribution state expires one year later - one year after the operation reached its terminal state, which updated_at stamps.",
  },
  {
    table: "deletion_operations", rowClass: "profile_row", fieldSet: "recovery_secret",
    measuredFrom: "recovery_expires_at", measuredAs: "timestamptz",
    precondition: { kind: "column_not_null", column: "recovery_expires_at" },
    effect: redact(
      // `request_session_digest` is NOT swept, matching the identity measure.
      // `deletion_operations_request_session_digest_shape` requires it NULL when
      // terminal and NON-NULL otherwise, so no clock can null it: pre-terminal
      // the UPDATE is refused and the whole batch aborts, post-terminal it is
      // already null.
      { column: "recovery_secret_digest", to: "null" },
      { column: "recovery_secret_prefix", to: "null" },
      // NOT `recovery_consumed_at`. `deletion_operations_recovery_shape` requires
      // it NULL for every non-identity scope, so the identity measure's
      // `now_if_null` stamp is ILLEGAL here — the previous copy of this measure
      // carried it and its "kept in the LEGAL shape" claim was false (tenancy
      // gate, fix round 2, round 2: the CHECK evaluated to true before that
      // UPDATE and false after it). Digest and prefix are NULL by the same
      // CHECK for these scopes, so this effect is a legal no-op.
    ),
    why: "C5's recovery-digest clock for a row class that can never hold a secret: deletion_operations_recovery_shape forces recovery_expires_at, the digest, the prefix AND recovery_consumed_at NULL for every non-identity scope, so the precondition is unsatisfiable and the effect is a no-op. Retained so the field-set partition stays exhaustive. `retention-sweep-fixtures.test.ts` asserts both halves on the REAL workspace and profile operations: the database refuses giving them a recovery expiry, and this measure's UPDATE (run for real, not behind a false predicate) is legal on them while the identity measure's stamp is not.",
  },
  {
    table: "deletion_operations", rowClass: "workspace_row", fieldSet: "receipt_facts",
    measuredFrom: "updated_at", measuredAs: "timestamptz",
    precondition: { kind: "state_in", column: "state", values: ["complete", "cancelled"] },
    effect: del(),
    why: "C5: an opaque content-free receipt/version/outcome/contribution state expires one year later - one year after the operation reached its terminal state, which updated_at stamps.",
  },
  {
    table: "deletion_operations", rowClass: "workspace_row", fieldSet: "recovery_secret",
    measuredFrom: "recovery_expires_at", measuredAs: "timestamptz",
    precondition: { kind: "column_not_null", column: "recovery_expires_at" },
    effect: redact(
      // `request_session_digest` is NOT swept, matching the identity measure.
      // `deletion_operations_request_session_digest_shape` requires it NULL when
      // terminal and NON-NULL otherwise, so no clock can null it: pre-terminal
      // the UPDATE is refused and the whole batch aborts, post-terminal it is
      // already null.
      { column: "recovery_secret_digest", to: "null" },
      { column: "recovery_secret_prefix", to: "null" },
      // NOT `recovery_consumed_at`. `deletion_operations_recovery_shape` requires
      // it NULL for every non-identity scope, so the identity measure's
      // `now_if_null` stamp is ILLEGAL here — the previous copy of this measure
      // carried it and its "kept in the LEGAL shape" claim was false (tenancy
      // gate, fix round 2, round 2: the CHECK evaluated to true before that
      // UPDATE and false after it). Digest and prefix are NULL by the same
      // CHECK for these scopes, so this effect is a legal no-op.
    ),
    why: "C5's recovery-digest clock for a row class that can never hold a secret: deletion_operations_recovery_shape forces recovery_expires_at, the digest, the prefix AND recovery_consumed_at NULL for every non-identity scope, so the precondition is unsatisfiable and the effect is a no-op. Retained so the field-set partition stays exhaustive. `retention-sweep-fixtures.test.ts` asserts both halves on the REAL workspace and profile operations: the database refuses giving them a recovery expiry, and this measure's UPDATE (run for real, not behind a false predicate) is legal on them while the identity measure's stamp is not.",
  },
  {
    table: "deletion_recovery_sessions", rowClass: "identity_row", fieldSet: "complete_row",
    measuredFrom: "expires_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "verification_expiry: the recovery session digest and prefix are secrets; 24 h after expiry they are spent.",
  },
  {
    table: "generation_attempts", rowClass: "profile_row", fieldSet: "complete_row",
    measuredFrom: "terminal_at", measuredAs: "timestamptz",
    // C5 splits the terminal attempts in two, and this precondition IS that
    // split: `settled` is the state that carries `generation_id` and
    // `debit_ledger_id` (generation-schema CHECKs `..._settled_shape` and
    // `..._debit_iff_settled`), so a settled row follows its linked financial
    // chain and is NOT swept here. Only `refused` and `recovery_required`
    // are — neither can carry a generation or a debit, so nothing cascades
    // through `generations_attempt_fk` and no ledger row is orphaned.
    precondition: { kind: "state_in", column: "state", values: ["refused", "recovery_required"] },
    effect: del(),
    why: "C5: other content-free terminal attempt metadata expires one year after terminal time, while settled/debited rows follow their linked financial chain and are excluded by the precondition. The 5 m/15 m/deadline/24 h transitions belong to the generation receiver, not to this clock; a non-terminal attempt has no terminal_at and is never swept here.",
  },
  {
    table: "public_sample_spin_buckets", rowClass: "system_row", fieldSet: "complete_row",
    measuredFrom: "bucket_started_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "Phase 10a C4: a bucket is deleted 24 h after the request that opened it. `expires_at` is CHECKed to be no later than that, and no counter update moves `bucket_started_at`, so the deletion never waits on traffic.",
  },
  {
    table: "rate_limit", rowClass: "system_row", fieldSet: "complete_row",
    measuredFrom: "last_request", measuredAs: "epoch_millis",
    precondition: null,
    effect: del(),
    why: "C5: delete no later than 24 h after last_request. Better Auth stores it as epoch milliseconds, which is why this is the one epoch_millis measure.",
  },
  {
    table: "session", rowClass: "identity_row", fieldSet: "complete_row",
    measuredFrom: "expires_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "C5: the complete row - token, user id, IP, user agent - no later than 24 h after expiry. Revocation deletes the row outright, so expiry is the only clock a surviving row can be on.",
  },
  {
    table: "stripe_events", rowClass: "stripe_customer_attributed", fieldSet: "linkable_source_ids",
    measuredFrom: "received_at", measuredAs: "timestamptz",
    precondition: null,
    effect: redact(
      { column: "workspace_id", to: "null" },
      { column: "stripe_customer_id", to: "random_token" },
    ),
    why: "The customer-attributed class loses its customer link at 90 days. stripe_customer_id is token-replaced, not nulled: stripe_events_receipt_attribution_shape REQUIRES it present for that class - the same reason TOKEN_REPLACEMENT names it in the SQL port. The unattributed class is NOT here: its link is scrubbed by identifier_scrubber, not by this receiver.",
  },
  {
    table: "stripe_events", rowClass: "stripe_customer_attributed", fieldSet: "provider_financial_authority",
    measuredFrom: "received_at", measuredAs: "timestamptz",
    precondition: null,
    effect: redact({ column: "tier_invoice_authority", to: "null" }),
    why: "The registry nulls this column WHOLE (its governed paths carry customer-attributable ids). Acceptable only because the finance extract, not this column, is the finance authority past 90 days.",
  },
  {
    table: "stripe_events", rowClass: "stripe_customer_attributed", fieldSet: "provider_payload",
    measuredFrom: "received_at", measuredAs: "timestamptz",
    precondition: NOT_HELD,
    effect: redact({ column: "payload", to: "empty_jsonb" }),
    why: "C5: redact after 90 days, retaining content-free audit metadata. NOT NULL, so it is emptied rather than nulled. The finance extract runs in the SAME transaction, BEFORE this.",
  },
  {
    table: "stripe_events", rowClass: "stripe_unattributed", fieldSet: "provider_financial_authority",
    measuredFrom: "received_at", measuredAs: "timestamptz",
    precondition: null,
    effect: redact({ column: "tier_invoice_authority", to: "null" }),
    why: "The registry nulls this column WHOLE (its governed paths carry customer-attributable ids). Acceptable only because the finance extract, not this column, is the finance authority past 90 days.",
  },
  {
    table: "stripe_events", rowClass: "stripe_unattributed", fieldSet: "provider_payload",
    measuredFrom: "received_at", measuredAs: "timestamptz",
    precondition: NOT_HELD,
    effect: redact({ column: "payload", to: "empty_jsonb" }),
    why: "C5: redact after 90 days, retaining content-free audit metadata. NOT NULL, so it is emptied rather than nulled. The finance extract runs in the SAME transaction, BEFORE this.",
  },
  {
    table: "stripe_events", rowClass: "stripe_workspace_attributed", fieldSet: "provider_payload",
    measuredFrom: "received_at", measuredAs: "timestamptz",
    precondition: NOT_HELD,
    effect: redact({ column: "payload", to: "empty_jsonb" }),
    why: "C5: redact after 90 days, retaining content-free audit metadata. NOT NULL, so it is emptied rather than nulled. The finance extract runs in the SAME transaction, BEFORE this.",
  },
  {
    table: "stripe_finance_extracts", rowClass: "finance_extract_complete", fieldSet: "complete_row",
    measuredFrom: "ingested_at", measuredAs: "timestamptz",
    precondition: { kind: "column_not_null", column: "ingested_at" },
    effect: del(),
    why: "C5: a complete row expires 30 days after VERIFIED PROJECTOR INGESTION. Measuring from ingested_at is what makes an unconsumed extract un-sweepable - 10b-2 has not read it yet, so its clock has not started.",
  },
  {
    table: "system_worker_health", rowClass: "system_row", fieldSet: "complete_row",
    measuredFrom: "updated_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "operational_90_days: a worker row 90 days past its last update names a worker that no longer runs.",
  },
  {
    table: "verification", rowClass: "identity_row", fieldSet: "complete_row",
    measuredFrom: "expires_at", measuredAs: "timestamptz",
    precondition: null,
    effect: del(),
    why: "C5: the complete secret-bearing row no later than 24 h after expires_at.",
  },
] as const satisfies readonly RetentionMeasure[];

export type RetentionMeasureKey = `${AppTable}::${DataRowClass}::${LifecycleFieldSetName}`;
/**
 * The measure's identity is the registry entry's identity — table, row class
 * AND field set. Row class is in the key because two classes of one table can
 * carry different rules: `stripe_finance_extracts` is swept at 30 days when
 * complete and retained for seven years when incomplete, off the same columns.
 */
export const measureKey = (
  table: AppTable,
  rowClass: DataRowClass,
  fieldSet: LifecycleFieldSetName,
): RetentionMeasureKey => `${table}::${rowClass}::${fieldSet}`;

export function retentionMeasureFor(
  table: AppTable,
  rowClass: DataRowClass,
  fieldSet: LifecycleFieldSetName,
  measures: readonly RetentionMeasure[] = RETENTION_MEASURES,
): RetentionMeasure | undefined {
  return measures.find(
    (measure) => measure.table === table && measure.rowClass === rowClass && measure.fieldSet === fieldSet,
  );
}

export type RetentionClosureInput = Readonly<{
  registry: readonly LifecycleClassEntry[];
  migrations: MigrationInventory;
  clocks?: Readonly<Record<RetentionRule, RetentionClock>>;
  measures?: readonly RetentionMeasure[];
}>;

/**
 * Bijection between receiver-executed registry entries and measures, plus the
 * column checks the receiver's generated SQL depends on. Throws on the FIRST
 * violation with the offending key named, because every violation is either an
 * un-swept governed field set or a sweep aimed at a column that does not exist.
 */
export function assertRetentionClockClosure(input: RetentionClosureInput): void {
  const clocks = input.clocks ?? RETENTION_CLOCKS;
  const measures = input.measures ?? RETENTION_MEASURES;
  const columnsOf = (table: string): readonly string[] => {
    const found = input.migrations.tables.find((candidate) => candidate.name === table);
    if (!found) throw new Error(`retention closure: unknown table '${table}'`);
    return found.columns;
  };

  const seen = new Set<RetentionMeasureKey>();
  for (const measure of measures) {
    const key = measureKey(measure.table, measure.rowClass, measure.fieldSet);
    if (seen.has(key)) throw new Error(`retention closure: duplicate measure for ${key}`);
    seen.add(key);
    const columns = columnsOf(measure.table);
    if (!columns.includes(measure.measuredFrom)) {
      throw new Error(`retention closure: ${key} measures from unknown column '${measure.measuredFrom}'`);
    }
    if (measure.precondition && !columns.includes(measure.precondition.column)) {
      throw new Error(`retention closure: ${key} preconditions on unknown column '${measure.precondition.column}'`);
    }
    if (measure.effect.kind === "redact_columns") {
      if (measure.effect.columns.length === 0) throw new Error(`retention closure: ${key} redacts no column`);
      for (const target of measure.effect.columns) {
        if (!columns.includes(target.column)) {
          throw new Error(`retention closure: ${key} redacts unknown column '${target.column}'`);
        }
      }
    }
  }

  const required = new Set<RetentionMeasureKey>();
  for (const entry of input.registry) {
    const clock = clocks[entry.retention];
    if (!clock) throw new Error(`retention closure: rule '${entry.retention}' has no clock`);
    if (!isReceiverExecutor(entry.executor)) continue;
    const key = measureKey(entry.table, entry.rowClass, entry.fieldSet.name);
    if (clock.kind !== "scheduled") {
      throw new Error(
        `retention closure: ${key} is executed by ${entry.executor} but its rule '${entry.retention}' is ${clock.kind}; a receiver cannot sweep a clock that never expires`,
      );
    }
    required.add(key);
    if (!seen.has(key)) throw new Error(`retention closure: ${key} is receiver-executed and has no measure`);
  }

  for (const key of seen) {
    if (!required.has(key)) {
      throw new Error(`retention closure: measure ${key} matches no receiver-executed registry entry`);
    }
  }
}

/** Every distinct sweep the receiver performs, in a stable order. */
export type RetentionSweepSpec = Readonly<{
  key: RetentionMeasureKey;
  rule: RetentionRule;
  durationMs: number;
  measure: RetentionMeasure;
}>;

export function retentionSweepSpecs(
  registry: readonly LifecycleClassEntry[] = LIFECYCLE_REGISTRY,
  clocks: Readonly<Record<RetentionRule, RetentionClock>> = RETENTION_CLOCKS,
  measures: readonly RetentionMeasure[] = RETENTION_MEASURES,
  edges: readonly Readonly<{ table: AppTable; referencedTable: AppTable }>[] = LIFECYCLE_FOREIGN_KEY_EDGES,
): readonly RetentionSweepSpec[] {
  const specs = new Map<RetentionMeasureKey, RetentionSweepSpec>();
  for (const entry of registry) {
    if (!isReceiverExecutor(entry.executor)) continue;
    const clock = clocks[entry.retention];
    if (clock.kind !== "scheduled") continue;
    const key = measureKey(entry.table, entry.rowClass, entry.fieldSet.name);
    const measure = retentionMeasureFor(entry.table, entry.rowClass, entry.fieldSet.name, measures);
    if (!measure) continue;
    const existing = specs.get(key);
    if (existing && existing.rule !== entry.retention) {
      throw new Error(`retention sweep: ${key} is governed by two rules (${existing.rule}, ${entry.retention})`);
    }
    specs.set(key, { key, rule: entry.retention, durationMs: clock.durationMs, measure });
  }
  return orderChildrenFirst([...specs.values()].sort((left, right) => left.key.localeCompare(right.key)), edges);
}

/**
 * Children before parents. A sweep that DELETES a parent row before the same
 * tick has deleted its RESTRICT children fails the batch (23503), is counted
 * as poisoned, and leaves the parent overdue until the next tick — which the
 * populated one-tick fixture (`retention-sweep-fixtures.test.ts`) turned red on
 * the very first run: `deletion_recovery_sessions` sorts alphabetically AFTER
 * `deletion_operations`. So the order is a topological sort over the
 * registry's own foreign-key edges (any delete action: a CASCADE child is
 * ordered too, harmlessly), stable on the key order within a rank. A cycle
 * cannot be ordered and refuses, loudly, rather than silently picking a side.
 */
export function orderChildrenFirst(
  specs: readonly RetentionSweepSpec[],
  edges: readonly Readonly<{ table: AppTable; referencedTable: AppTable }>[] = LIFECYCLE_FOREIGN_KEY_EDGES,
): readonly RetentionSweepSpec[] {
  const tables = new Set(specs.map((spec) => spec.measure.table));
  // rank(table) = 1 + max rank of every swept table that references it, so a
  // referenced (parent) table always ranks ABOVE its children; children with
  // no swept dependants rank 0. Only edges between SWEPT tables matter.
  const dependants = new Map<AppTable, AppTable[]>();
  for (const edge of edges) {
    if (edge.table === edge.referencedTable) continue;
    if (!tables.has(edge.table) || !tables.has(edge.referencedTable)) continue;
    dependants.set(edge.referencedTable, [...(dependants.get(edge.referencedTable) ?? []), edge.table]);
  }
  const rank = new Map<AppTable, number>();
  const visiting = new Set<AppTable>();
  const rankOf = (table: AppTable): number => {
    const known = rank.get(table);
    if (known !== undefined) return known;
    if (visiting.has(table)) throw new Error(`retention sweep: foreign-key cycle through ${table}; sweeps cannot be ordered`);
    visiting.add(table);
    const children = dependants.get(table) ?? [];
    const value = children.length === 0 ? 0 : 1 + Math.max(...children.map(rankOf));
    visiting.delete(table);
    rank.set(table, value);
    return value;
  };
  for (const table of tables) rankOf(table);
  return [...specs].sort((left, right) => {
    const byRank = rankOf(left.measure.table) - rankOf(right.measure.table);
    return byRank !== 0 ? byRank : left.key.localeCompare(right.key);
  });
}

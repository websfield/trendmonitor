import type { JsonColumnInventoryEntry, JsonPathInventoryEntry, LifecycleWriterInventoryEntry, MigrationForeignKey, MigrationInventory, RowClassInventoryEntry } from "./lifecycle-inventory";
import { LIFECYCLE_COLUMN_CENSUS } from "./lifecycle-column-census";
import type { LifecycleExecutorImplementations } from "./lifecycle-executors";
import type { ResidueProbeImplementations } from "./lifecycle-probes";

export const APP_TABLES = [
  "account", "activation_cohort_daily", "auth_mail_outbox", "auto_topup_protocol_rollouts", "autopsies", "autopsy_cache_claims", "brain_activation_snapshots", "brain_docs",
  "config_versions", "creative_pieces", "creator_profiles", "credit_ledger", "deletion_cancellation_proofs", "deletion_external_commands", "deletion_membership_snapshots", "deletion_operation_transitions", "deletion_operations", "deletion_recovery_sessions", "first_billable_attempts", "frameworks",
  "generation_attempts", "generation_feedback", "generations", "membership_profile_selections", "memberships",
  "model_usage", "onboarding_inputs", "onboarding_interview_drafts", "pause_periods", "promotion_proposals",
  "proposal_evidence_feedback", "proposal_evidence_results", "public_sample_spin_buckets", "rate_limit", "results", "session", "stripe_events",
  "stripe_finance_extracts", "subscriptions", "system_model_usage", "system_model_usage_reconciliations", "system_spend_claims",
  "system_spend_daily", "system_worker_health", "tracked_niches", "trend_items", "trend_sources",
  "tier_checkout_protocol_rollouts", "trend_transcripts", "user", "users", "verification", "workspaces", "workspace_spend_monthly",
] as const;
export type AppTable = (typeof APP_TABLES)[number];
export type DataScope = "identity" | "profile" | "workspace" | "system";
export type DataRowClass =
  | "identity_row"
  | "profile_row"
  | "workspace_row"
  | "system_row"
  | "financial_row"
  | "stripe_workspace_attributed"
  | "stripe_customer_attributed"
  | "stripe_unattributed"
  // Task 6's finance extract. Two classes because the two statuses have
  // DIFFERENT retention: a complete row is a 30-day staging hand-off to
  // 10b-2's projector, an incomplete row is the permanent authority for
  // withholding that period and rides the seven-year financial chain.
  | "finance_extract_complete"
  | "finance_extract_incomplete"
  | "profile_private"
  | "creator_consent"
  | "independently_licensed"
  | "product_seed"
  | "shared_library"
  // Phase 10a plan C4: the public Sample Spin's system-metering rows on the
  // two spend tables, discriminated by `purpose`. Content-free, tenant-free,
  // IP-free by the schema's own CHECK. The WHOLE row is a financial fact kept
  // seven years (R-122): its `job_id` is a browser-random request id that no
  // erasure subject can name and no bucket links to once the window expires,
  // so there is no 90-day scrub to promise (tenancy gate round 1, CHANGE 2 —
  // the first registration promised one that no executor could ever run).
  | "public_sample_spin_row";

/**
 * Every application table names its permitted row classes explicitly. There
 * is deliberately no default: adding an `AppTable` cannot silently acquire a
 * whole-row lifecycle.
 */
export const ROW_CLASSES_BY_TABLE = {
  account: ["identity_row"],
  activation_cohort_daily: ["system_row"],
  auth_mail_outbox: ["identity_row"],
  auto_topup_protocol_rollouts: ["system_row"],
  autopsies: ["profile_private", "creator_consent", "independently_licensed"],
  autopsy_cache_claims: ["profile_private", "creator_consent", "independently_licensed"],
  brain_activation_snapshots: ["profile_row"],
  brain_docs: ["profile_row"],
  config_versions: ["system_row"],
  creative_pieces: ["profile_row"],
  creator_profiles: ["profile_row"],
  credit_ledger: ["workspace_row"],
  deletion_cancellation_proofs: ["identity_row"],
  deletion_external_commands: ["identity_row", "profile_row", "workspace_row"],
  deletion_membership_snapshots: ["identity_row"],
  deletion_operation_transitions: ["identity_row", "profile_row", "workspace_row"],
  deletion_operations: ["identity_row", "profile_row", "workspace_row"],
  deletion_recovery_sessions: ["identity_row"],
  first_billable_attempts: ["profile_row"],
  frameworks: ["profile_private", "creator_consent", "independently_licensed", "product_seed"],
  generation_attempts: ["profile_row"],
  generation_feedback: ["profile_row"],
  generations: ["profile_row"],
  membership_profile_selections: ["profile_row"],
  memberships: ["identity_row"],
  model_usage: ["profile_row"],
  onboarding_inputs: ["profile_row"],
  onboarding_interview_drafts: ["profile_row"],
  pause_periods: ["workspace_row"],
  promotion_proposals: ["profile_row"],
  proposal_evidence_feedback: ["profile_row"],
  proposal_evidence_results: ["profile_row"],
  public_sample_spin_buckets: ["system_row"],
  rate_limit: ["system_row"],
  results: ["profile_row"],
  session: ["identity_row"],
  stripe_events: ["stripe_workspace_attributed", "stripe_customer_attributed", "stripe_unattributed"],
  stripe_finance_extracts: ["finance_extract_complete", "finance_extract_incomplete"],
  subscriptions: ["workspace_row"],
  system_model_usage: ["system_row", "public_sample_spin_row"],
  system_model_usage_reconciliations: ["system_row"],
  system_spend_claims: ["system_row", "public_sample_spin_row"],
  system_spend_daily: ["system_row"],
  system_worker_health: ["system_row"],
  tier_checkout_protocol_rollouts: ["system_row"],
  tracked_niches: ["profile_row"],
  trend_items: ["profile_private", "shared_library"],
  trend_sources: ["profile_private", "shared_library"],
  trend_transcripts: ["profile_private", "creator_consent", "independently_licensed"],
  user: ["identity_row"],
  users: ["identity_row"],
  verification: ["identity_row"],
  workspaces: ["workspace_row"],
  workspace_spend_monthly: ["financial_row"],
} as const satisfies Readonly<Record<AppTable, readonly DataRowClass[]>>;

export type RowClassFor<T extends AppTable> =
  (typeof ROW_CLASSES_BY_TABLE)[T][number];
export type LifecycleAction = "cascade" | "delete_explicit" | "pseudonymise" | "retain_financial" | "external_delete" | "not_applicable";
export type ExportDisposition = "included" | "excluded_secret" | "excluded_system";
export type ExportProjector = "identity_self" | "profile_creator" | "workspace_owner" | "none";
export type RetentionRule = "identity_lifetime" | "profile_lifetime" | "workspace_lifetime" | "session_expiry" | "verification_expiry" | "rate_limit_window" | "identity_recovery_7_days" | "generation_attempt_terminal_one_year" | "stripe_payload_90_days" | "finance_extract_30_days" | "cohort_two_years" | "operational_90_days" | "security_audit_one_year" | "deletion_receipt_one_year" | "financial_chain_seven_years" | "library_lifetime" | "installation_lifetime";
export type ExecutorId = "identity_cascade" | "profile_cascade" | "workspace_cascade" | "explicit_row_delete" | "workspace_pseudonymiser" | "identifier_scrubber" | "financial_retention_receiver" | "stripe_payload_receiver" | "expiry_receiver" | "external_deletion_receiver" | "library_retention" | "system_retention";
export type ProbeId = "identity_residue" | "profile_residue" | "workspace_residue" | "retained_financial_residue" | "stripe_payload_residue" | "expiry_residue" | "shared_library_residue" | "system_residue";
export type ExternalWriterAuthority = Readonly<{
  table: AppTable;
  owner: string;
  sourceFile: string;
  sourceToken: string;
}>;
export type SupportingLifecycleStoreEntry = Readonly<{
  store: string;
  physicalKind: "fixed_table" | "job_table" | "dynamic_job_partition" | "dynamic_queue_stats_partition";
  fields: readonly string[];
  scope: DataScope;
  writerOwner: string;
  sourceToken: string;
  action: LifecycleAction;
  retention: RetentionRule;
  executor: ExecutorId;
  residueProbe: ProbeId;
  governedJsonPaths: readonly string[];
  subjectBinding: "installation" | "source_ids";
}>;
/**
 * The only tables that may split one row class across lifecycle actions.
 *
 * These are deliberately table-specific rather than `string[]`: an entry for
 * `stripe_events` cannot name a `system_model_usage` field (or a field that
 * does not exist) and still type-check. Migration closure below remains the
 * runtime backstop for physical schema drift and for the remaining columns.
 */
export const SPLIT_TABLE_FIELD_SETS = {
  auth_mail_outbox: [
    // The operation link is an opaque random receipt id (R-122) and stays with
    // the outcome; only the recipient identity scrubs at identity erasure.
    { name: "recipient_link", kind: "columns", columns: ["auth_user_id", "recipient_digest"] },
    { name: "delivery_outcome_facts", kind: "remaining_columns", excluding: ["auth_user_id", "recipient_digest"] },
  ],
  deletion_operations: [
    { name: "recovery_secret", kind: "columns", columns: ["request_session_digest", "recovery_secret_digest", "recovery_secret_prefix"] },
    // Task 7: the keyed activation hash is identifier-bearing material and
    // scrubs with the target; the contribution numbers and receipt digest are
    // receipt facts and survive on the one-year clock.
    // R-166: `cascade_parent_operation_id` names the identity operation that
    // cascaded this one — an identifier, scrubbed with the target.
    { name: "linkable_identifiers", kind: "columns", columns: ["id", "target_key", "user_id", "workspace_id", "profile_id", "recovery_delivery_recipient_digest", "idempotency_key", "payload_hash", "activation_payload_hash", "cascade_parent_operation_id"] },
    { name: "requester_identity", kind: "columns", columns: ["requester_user_id"] },
    { name: "receipt_facts", kind: "remaining_columns", excluding: ["request_session_digest", "recovery_secret_digest", "recovery_secret_prefix", "id", "target_key", "user_id", "workspace_id", "profile_id", "requester_user_id", "recovery_delivery_recipient_digest", "idempotency_key", "payload_hash", "activation_payload_hash", "cascade_parent_operation_id", "cancelled_by_user_id"] },
    // R-166: the canceller — scrubbed by the CANCELLER's identity erasure, the
    // way `requester_identity` is scrubbed by the requester's.
    { name: "canceller_identity", kind: "columns", columns: ["cancelled_by_user_id"] },
  ],
  deletion_operation_transitions: [
    { name: "linkable_identifiers", kind: "columns", columns: ["id", "operation_id", "target_key", "user_id", "workspace_id", "profile_id", "payload_hash"] },
    { name: "requester_identity", kind: "columns", columns: ["requester_user_id"] },
    { name: "receipt_facts", kind: "remaining_columns", excluding: ["id", "operation_id", "target_key", "user_id", "workspace_id", "profile_id", "requester_user_id", "payload_hash"] },
  ],
  deletion_membership_snapshots: [
    { name: "linkable_identifiers", kind: "columns", columns: ["id", "operation_id", "user_id", "membership_id"] },
    { name: "receipt_facts", kind: "remaining_columns", excluding: ["id", "operation_id", "user_id", "membership_id", "workspace_id"] },
    { name: "workspace_link", kind: "columns", columns: ["workspace_id"] },
  ],
  deletion_external_commands: [
    { name: "linkable_identifiers", kind: "columns", columns: ["id", "operation_id", "target_key", "user_id", "workspace_id", "profile_id", "payload_hash", "provider_ref_digest"] },
    { name: "receipt_facts", kind: "remaining_columns", excluding: ["id", "operation_id", "target_key", "user_id", "workspace_id", "profile_id", "payload_hash", "provider_ref_digest"] },
  ],
  stripe_events: [
    { name: "provider_payload", kind: "columns", columns: ["payload"] },
    { name: "linkable_source_ids", kind: "columns", columns: ["workspace_id", "stripe_customer_id"] },
    { name: "provider_financial_authority", kind: "columns", columns: ["tier_invoice_authority"] },
    { name: "content_free_metadata", kind: "remaining_columns", excluding: ["payload", "workspace_id", "stripe_customer_id", "tier_invoice_authority"] },
  ],
  workspace_spend_monthly: [
    { name: "workspace_link", kind: "columns", columns: ["workspace_id"] },
    { name: "financial_facts", kind: "remaining_columns", excluding: ["workspace_id"] },
  ],
  // Task 6: the four tables `FINANCIAL_CHAIN_TABLES` used to hold erasure for.
  // Same split `workspace_spend_monthly` has always had — the link
  // pseudonymises at erasure, the money facts ride the seven-year chain.
  credit_ledger: [
    { name: "workspace_link", kind: "columns", columns: ["workspace_id"] },
    { name: "financial_facts", kind: "remaining_columns", excluding: ["workspace_id"] },
  ],
  subscriptions: [
    // `billing_contact_user_id` (plan C3) rides the LINK set, not the facts:
    // it names a person, so a retained seven-year row must not keep it. The
    // workspace pseudonymiser nulls it (nullable uuid -> `uuid_null`); identity
    // erasure clears it structurally through ON DELETE SET NULL.
    { name: "workspace_link", kind: "columns", columns: ["workspace_id", "billing_contact_user_id"] },
    { name: "financial_facts", kind: "remaining_columns", excluding: ["workspace_id", "billing_contact_user_id"] },
  ],
  pause_periods: [
    { name: "workspace_link", kind: "columns", columns: ["workspace_id"] },
    { name: "financial_facts", kind: "remaining_columns", excluding: ["workspace_id"] },
  ],
  model_usage: [
    { name: "profile_workspace_link", kind: "columns", columns: ["profile_id", "workspace_id"] },
    { name: "financial_facts", kind: "remaining_columns", excluding: ["profile_id", "workspace_id"] },
  ],
  system_model_usage: [
    { name: "linkable_source_ids", kind: "columns", columns: ["job_attempt_id", "job_id", "trend_item_id"] },
    { name: "cost_and_outcome_facts", kind: "remaining_columns", excluding: ["job_attempt_id", "job_id", "trend_item_id"] },
  ],
  system_model_usage_reconciliations: [
    { name: "linkable_attempt_id", kind: "columns", columns: ["job_attempt_id"] },
    { name: "cost_facts", kind: "remaining_columns", excluding: ["job_attempt_id"] },
  ],
  system_spend_claims: [
    { name: "linkable_source_ids", kind: "columns", columns: ["job_attempt_id", "job_id", "trend_item_id", "autopsy_cache_claim_id"] },
    { name: "reservation_facts", kind: "remaining_columns", excluding: ["job_attempt_id", "job_id", "trend_item_id", "autopsy_cache_claim_id"] },
  ],
} as const;
export type SplitTable = keyof typeof SPLIT_TABLE_FIELD_SETS;
type SplitFieldSetFor<T extends SplitTable> = (typeof SPLIT_TABLE_FIELD_SETS)[T][number];
export type SplitFieldFor<T extends SplitTable> = SplitFieldSetFor<T> extends infer S
  ? S extends Readonly<{ columns: readonly (infer C)[] }> ? C
    : S extends Readonly<{ excluding: readonly (infer C)[] }> ? C : never
  : never;
export type LifecycleFieldSetName = "complete_row" | SplitFieldSetFor<SplitTable>["name"];
export type LifecycleFieldSetFor<T extends AppTable> =
  T extends SplitTable
    ? SplitFieldSetFor<T>
    : Readonly<{ name: "complete_row"; kind: "all_columns" }>;
export type LifecycleFieldSet = LifecycleFieldSetFor<AppTable>;
type LifecycleClassEntryFor<T extends AppTable> = Readonly<{
  table: T; rowClass: RowClassFor<T>; fieldSet: LifecycleFieldSetFor<T>; scope: DataScope;
  writerOwner: string; export: ExportDisposition; exportProjector: ExportProjector;
  action: LifecycleAction; retention: RetentionRule; executor: ExecutorId; residueProbe: ProbeId;
  governedJsonPaths: readonly string[];
}>;
export type LifecycleClassEntry = {
  [T in AppTable]: LifecycleClassEntryFor<T>;
}[AppTable];

const all = <T extends AppTable>(): LifecycleFieldSetFor<T> => ({ name: "complete_row", kind: "all_columns" }) as LifecycleFieldSetFor<T>;
type Defaults = Omit<LifecycleClassEntry, "table" | "rowClass" | "fieldSet" | "governedJsonPaths">;
type TableWithRowClass<R extends DataRowClass> = {
  [T in AppTable]: R extends RowClassFor<T> ? T : never;
}[AppTable];
const row = <T extends AppTable>(table: T, rowClass: RowClassFor<T>, defaults: Defaults, fieldSet: LifecycleFieldSetFor<T> = all<T>(), governedJsonPaths: readonly string[] = []): LifecycleClassEntryFor<T> => ({ table, rowClass, fieldSet, governedJsonPaths, ...defaults });
const identity = <T extends TableWithRowClass<"identity_row">>(table: T, owner: string) => row(table, "identity_row" as RowClassFor<T>, {
  // NOT `included` UNDER `identity_self`. That projector is declared in the type
  // and NOT BUILT — `export.ts` keys `exportPlan` off `profile_creator` alone —
  // so marking these rows "included" was a creator-facing export claim no code
  // could honour. They are excluded until the slice that builds the
  // identity-self projector, and `validateLifecycleClosure` refuses any
  // `included` disposition under an unbuilt projector so this cannot drift back.
  scope: "identity", writerOwner: owner, export: table === "account" || table === "session" || table === "verification" ? "excluded_secret" : "excluded_system",
  exportProjector: "none",
  action: table === "session" || table === "verification" ? "delete_explicit" : "cascade",
  retention: table === "session" ? "session_expiry" : table === "verification" ? "verification_expiry" : "identity_lifetime",
  executor: table === "session" || table === "verification" ? "expiry_receiver" : "identity_cascade",
  residueProbe: table === "session" || table === "verification" ? "expiry_residue" : "identity_residue",
} satisfies Defaults);
const profile = <T extends TableWithRowClass<"profile_row">>(table: T, owner: string, included: boolean, governedJsonPaths: readonly string[] = []) => row(table, "profile_row" as RowClassFor<T>, {
  scope: "profile", writerOwner: owner, export: included ? "included" : "excluded_system", exportProjector: included ? "profile_creator" : "none",
  action: table === "generation_attempts" ? "delete_explicit" : "cascade",
  retention: table === "generation_attempts" ? "generation_attempt_terminal_one_year" : "profile_lifetime",
  executor: table === "generation_attempts" ? "expiry_receiver" : "profile_cascade",
  residueProbe: table === "generation_attempts" ? "expiry_residue" : "profile_residue",
} satisfies Defaults, all<T>(), governedJsonPaths);
const workspace = <T extends TableWithRowClass<"workspace_row">>(table: T, owner: string, disposition: ExportDisposition = "excluded_system", governedJsonPaths: readonly string[] = []) => row(table, "workspace_row" as RowClassFor<T>, {
  // Same as `identity` above: `workspace_owner` is declared and NOT BUILT, so an
  // `included` disposition here would be an export claim nothing can honour.
  // The disposition is preserved in the type for the slice that builds the
  // projector; until then it is downgraded rather than promised.
  scope: "workspace", writerOwner: owner, export: disposition === "included" ? "excluded_system" : disposition, exportProjector: "none",
  action: "cascade", retention: "workspace_lifetime", executor: "workspace_cascade", residueProbe: "workspace_residue",
} satisfies Defaults, all<T>(), governedJsonPaths);
const system = <T extends TableWithRowClass<"system_row">>(table: T, owner: string, retention: RetentionRule = "installation_lifetime") => row(table, "system_row" as RowClassFor<T>, {
  scope: "system", writerOwner: owner, export: "excluded_system", exportProjector: "none", action: "not_applicable", retention,
  executor: "system_retention", residueProbe: "system_residue",
} satisfies Defaults);
const mixed = <R extends "profile_private" | "shared_library", T extends TableWithRowClass<R>>(table: T, rowClass: R, owner: string, included: boolean, governedJsonPaths: readonly string[] = []) => row(table, rowClass as RowClassFor<T>, {
  scope: rowClass === "profile_private" ? "profile" : "system", writerOwner: owner, export: included ? "included" : "excluded_system",
  exportProjector: included ? "profile_creator" : "none", action: rowClass === "profile_private" ? "cascade" : "not_applicable",
  retention: rowClass === "profile_private" ? "profile_lifetime" : "library_lifetime", executor: rowClass === "profile_private" ? "profile_cascade" : "library_retention",
  residueProbe: rowClass === "profile_private" ? "profile_residue" : "shared_library_residue",
} satisfies Defaults, all<T>(), governedJsonPaths);
type RightsRowClass = "profile_private" | "creator_consent" | "independently_licensed" | "product_seed";
const rights = <R extends RightsRowClass, T extends TableWithRowClass<R>>(
  table: T,
  rowClass: R,
  owner: string,
  included: boolean,
  governedJsonPaths: readonly string[] = []
) => row(table, rowClass as RowClassFor<T>, {
  scope: rowClass === "profile_private" ? "profile" : rowClass === "creator_consent" ? "identity" : "system",
  writerOwner: owner,
  export: included ? "included" : "excluded_system",
  exportProjector: included ? "profile_creator" : "none",
  action: rowClass === "profile_private" || rowClass === "creator_consent" ? "cascade" : "not_applicable",
  retention: rowClass === "profile_private" ? "profile_lifetime" : rowClass === "creator_consent" ? "identity_lifetime" : "library_lifetime",
  executor: rowClass === "profile_private" ? "profile_cascade" : rowClass === "creator_consent" ? "identity_cascade" : "library_retention",
  residueProbe: rowClass === "profile_private" ? "profile_residue" : rowClass === "creator_consent" ? "identity_residue" : "shared_library_residue",
} satisfies Defaults, all<T>(), governedJsonPaths);

/**
 * The four tables that used to cascade with their scope and now ride the
 * seven-year financial chain (R-122). They are written out below rather than
 * generated by a helper, for the reason the rest of this file writes split
 * tables out: each entry's field set comes from `SPLIT_TABLE_FIELD_SETS`, so
 * the two declarations of the split cannot drift apart.
 *
 * There is deliberately NO cascade foreign key on any of them.
 * `expectedOwnershipEdge` demands one only for `action: "cascade"`, and a
 * cascade to the row being erased would contradict the retention clock: one of
 * the two would have to be a lie. C3 settles which.
 */
export const LIFECYCLE_REGISTRY = [
  identity("account", "packages/auth"), identity("session", "packages/auth"), identity("user", "packages/auth"),
  // Task 4 auth-delivery outbox: the recipient link scrubs at identity erasure;
  // the content-free delivery outcome expires 90 days after admission (R-122).
  row("auth_mail_outbox", "identity_row", { scope: "identity", writerOwner: "packages/db/src/auth-mail.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "operational_90_days", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.auth_mail_outbox[0]),
  row("auth_mail_outbox", "identity_row", { scope: "identity", writerOwner: "packages/db/src/auth-mail.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "operational_90_days", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.auth_mail_outbox[1]),
  identity("users", "packages/db/src/bootstrap.ts"), identity("verification", "packages/auth"), identity("memberships", "packages/db/src/bootstrap.ts"),
  row("deletion_cancellation_proofs", "identity_row", { scope: "identity", writerOwner: "packages/db/src/auth-lifecycle.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "verification_expiry", executor: "expiry_receiver", residueProbe: "expiry_residue" }),
  row("deletion_recovery_sessions", "identity_row", { scope: "identity", writerOwner: "packages/db/src/auth-lifecycle.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "verification_expiry", executor: "expiry_receiver", residueProbe: "expiry_residue" }),
  row("deletion_operations", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "identity_recovery_7_days", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[0]),
  row("deletion_operations", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[1]),
  row("deletion_operations", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[2]),
  row("deletion_operations", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[4]),
  row("deletion_operations", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[3]),
  row("deletion_operations", "profile_row", { scope: "profile", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "identity_recovery_7_days", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[0]),
  row("deletion_operations", "profile_row", { scope: "profile", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "profile_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[1]),
  row("deletion_operations", "profile_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[2]),
  row("deletion_operations", "profile_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[4]),
  row("deletion_operations", "profile_row", { scope: "profile", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[3]),
  row("deletion_operations", "workspace_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "identity_recovery_7_days", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[0]),
  row("deletion_operations", "workspace_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "workspace_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[1]),
  row("deletion_operations", "workspace_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[2]),
  row("deletion_operations", "workspace_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[4]),
  row("deletion_operations", "workspace_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operations[3]),
  row("deletion_operation_transitions", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[0]),
  row("deletion_operation_transitions", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[1]),
  row("deletion_operation_transitions", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[2]),
  row("deletion_operation_transitions", "profile_row", { scope: "profile", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "profile_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[0]),
  row("deletion_operation_transitions", "profile_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[1]),
  row("deletion_operation_transitions", "profile_row", { scope: "profile", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[2]),
  row("deletion_operation_transitions", "workspace_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "workspace_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[0]),
  row("deletion_operation_transitions", "workspace_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[1]),
  row("deletion_operation_transitions", "workspace_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_operation_transitions[2]),
  row("deletion_membership_snapshots", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "security_audit_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_membership_snapshots[0]),
  row("deletion_membership_snapshots", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "security_audit_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_membership_snapshots[1]),
  // Round-1 tenancy BLOCK: `workspace_id` is NOT NULL with a RESTRICT foreign
  // key, so a workspace whose member ever requested identity deletion could
  // never be erased. Under a WORKSPACE operation the link repoints at the stub;
  // under an identity operation it stays (the audit names the surviving
  // workspace). The closure below now refuses this class for every table.
  row("deletion_membership_snapshots", "identity_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-lifecycle.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "security_audit_one_year", executor: "identifier_scrubber", residueProbe: "workspace_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_membership_snapshots[2]),
  // Task 4 external-command outbox: target/payload/provider links pseudonymise
  // with the operation; the content-free command receipt follows the same
  // one-year deletion-receipt clock (R-122).
  row("deletion_external_commands", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-external-commands.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "identity_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_external_commands[0]),
  row("deletion_external_commands", "identity_row", { scope: "identity", writerOwner: "packages/db/src/deletion-external-commands.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_external_commands[1]),
  row("deletion_external_commands", "profile_row", { scope: "profile", writerOwner: "packages/db/src/deletion-external-commands.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "profile_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_external_commands[0]),
  row("deletion_external_commands", "profile_row", { scope: "profile", writerOwner: "packages/db/src/deletion-external-commands.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_external_commands[1]),
  row("deletion_external_commands", "workspace_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-external-commands.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "deletion_receipt_one_year", executor: "identifier_scrubber", residueProbe: "workspace_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_external_commands[0]),
  row("deletion_external_commands", "workspace_row", { scope: "workspace", writerOwner: "packages/db/src/deletion-external-commands.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "deletion_receipt_one_year", executor: "expiry_receiver", residueProbe: "expiry_residue" }, SPLIT_TABLE_FIELD_SETS.deletion_external_commands[1]),
  workspace("workspaces", "packages/db/src/bootstrap.ts", "included"),
  // Current physical truth: both tables still cascade with the workspace. Task
  // 6 must add the immutable finance extract/receiver and replace THESE rows in
  // the same enabling change. Until then deletion remains disabled; claiming a
  // seven-year receiver here would promise persistence that the schema cannot do.
  // While these rows stay, the executor refuses workspace erasure and the
  // worker refuses the scope at startup (`unretainedFinancialChainTables`,
  // FINANCIAL_CHAIN_TABLES in deletion-executor.ts — round-1 billing CHANGE).
  // Task 6 / R-122: retained on the seven-year financial chain rather than
  // cascaded with the workspace. `credit_ledger` keeps its owner export
  // (the creator's own ledger) while it is alive; after erasure only the
  // pseudonymised money facts survive, and the destructive receiver that
  // would finally purge them stays disabled until jurisdiction/ledger review.
  row("credit_ledger", "workspace_row", { scope: "workspace", writerOwner: "packages/credits", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "financial_chain_seven_years", executor: "workspace_pseudonymiser", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.credit_ledger[0]),
  row("credit_ledger", "workspace_row", { scope: "workspace", writerOwner: "packages/credits", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.credit_ledger[1]),
  row("pause_periods", "workspace_row", { scope: "workspace", writerOwner: "packages/credits/src/pause.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "financial_chain_seven_years", executor: "workspace_pseudonymiser", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.pause_periods[0]),
  row("pause_periods", "workspace_row", { scope: "workspace", writerOwner: "packages/credits/src/pause.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.pause_periods[1]),
  row("subscriptions", "workspace_row", { scope: "workspace", writerOwner: "packages/credits/src/stripe", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "financial_chain_seven_years", executor: "workspace_pseudonymiser", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.subscriptions[0]),
  row("subscriptions", "workspace_row", { scope: "workspace", writerOwner: "packages/credits/src/stripe", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.subscriptions[1]),
  profile("membership_profile_selections", "packages/db/src/profile-selection.ts", false),
  profile("creator_profiles", "packages/db/src/with-workspace.ts", true), profile("brain_docs", "packages/db/src/with-workspace.ts", true, ["source_evidence$[*].inputId", "reference_corpus_ids$[*]"]),
  profile("onboarding_inputs", "packages/db/src/with-workspace.ts", true), profile("onboarding_interview_drafts", "packages/db/src/interview-ops.ts", true),
  profile("brain_activation_snapshots", "packages/db/src/with-workspace.ts", true), 
  // Task 6 / R-122: REQ-G05's margin input outlives the profile.
  row("model_usage", "profile_row", { scope: "profile", writerOwner: "packages/db/src/with-workspace.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "financial_chain_seven_years", executor: "identifier_scrubber", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.model_usage[0]),
  row("model_usage", "profile_row", { scope: "profile", writerOwner: "packages/db/src/with-workspace.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.model_usage[1]),
  profile("first_billable_attempts", "packages/db/src/with-workspace.ts", false), profile("generation_attempts", "packages/db/src/with-workspace.ts", false, ["candidate$.request.brainActivationId", "candidate$.request.parentGenerationId", "candidate$.request.spinAutopsyId", "candidate$.request.origin.pieceId", "candidate$.request.origin.sourceGenerationId", "candidate$.frameworkVersions[*].id", "request_snapshot$.brainActivationId", "request_snapshot$.parentGenerationId", "request_snapshot$.spinAutopsyId", "request_snapshot$.origin.pieceId", "request_snapshot$.origin.sourceGenerationId", "request_snapshot$.frameworkVersions[*].id", "request_snapshot$.recentContext.records[*].id", "request_snapshot$.recentContext.pieces[*].id", "request_snapshot$.recentContext.exclusions[*].id"]),
  profile("generations", "packages/db/src/with-workspace.ts", true, ["framework_versions$[*].frameworkId", "context_input_ids$[*]", "request$.brainActivationId", "request$.parentGenerationId", "request$.spinAutopsyId", "request$.origin.pieceId", "request$.origin.sourceGenerationId"]), profile("generation_feedback", "packages/db/src/with-workspace.ts", true),
  // Launch L2 (R-151): the creative piece. Profile-scoped, exported with the
  // profile, erased with it (every FK cascades from the profile or from a
  // generation of the same profile), and its own idea is creator content.
  profile("creative_pieces", "packages/db/src/creative-work-ops.ts", true),
  profile("tracked_niches", "packages/db/src/trends-storage.ts", true), profile("results", "packages/db/src/with-workspace.ts", true),
  profile("promotion_proposals", "packages/db/src/promotion-ops.ts", true, ["payload$.rule.evidenceStates[*].resultId"]), profile("proposal_evidence_results", "packages/db/src/promotion-ops.ts", true),
  profile("proposal_evidence_feedback", "packages/db/src/promotion-ops.ts", true),
  rights("frameworks", "profile_private", "packages/db/src/frameworks.ts", true, ["source_references$[*].ref", "evidence_entries$[*].ref"]),
  rights("frameworks", "creator_consent", "packages/db/src/frameworks.ts", false, ["source_references$[*].ref", "evidence_entries$[*].ref"]),
  rights("frameworks", "independently_licensed", "packages/db/src/frameworks.ts", false, ["source_references$[*].ref", "evidence_entries$[*].ref"]),
  rights("frameworks", "product_seed", "packages/db/src/frameworks.ts", false, ["source_references$[*].ref", "evidence_entries$[*].ref"]),
  mixed("trend_sources", "profile_private", "packages/db/src/trends-storage.ts", true), mixed("trend_sources", "shared_library", "packages/db/src/trends-storage.ts", false),
  mixed("trend_items", "profile_private", "packages/db/src/trends-storage.ts", true, ["baseline_observation_ids$[*]"]), mixed("trend_items", "shared_library", "packages/db/src/trends-storage.ts", false, ["baseline_observation_ids$[*]"]),
  rights("trend_transcripts", "profile_private", "packages/db/src/trends-storage.ts", true, ["provenance$.referenceInputId", "provenance$.sourceUrl"]),
  rights("trend_transcripts", "creator_consent", "packages/db/src/trends-storage.ts", false, ["provenance$.consentEvidenceId", "provenance$.sourceReference"]),
  rights("trend_transcripts", "independently_licensed", "packages/db/src/trends-storage.ts", false, ["provenance$.sourceReference"]),
  rights("autopsies", "profile_private", "packages/db/src/system-spend.ts", true),
  rights("autopsies", "creator_consent", "packages/db/src/system-spend.ts", false),
  rights("autopsies", "independently_licensed", "packages/db/src/system-spend.ts", false),
  rights("autopsy_cache_claims", "profile_private", "packages/db/src/trends-storage.ts", true),
  rights("autopsy_cache_claims", "creator_consent", "packages/db/src/trends-storage.ts", false),
  rights("autopsy_cache_claims", "independently_licensed", "packages/db/src/trends-storage.ts", false),
  system("config_versions", "packages/config/src"),
  // Task 7 / R-121: system counts expire two years after cohort maturity.
  row("activation_cohort_daily", "system_row", { scope: "system", writerOwner: "packages/db/src/activation.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "cohort_two_years", executor: "expiry_receiver", residueProbe: "expiry_residue" }),
  system("auto_topup_protocol_rollouts", "packages/credits/src/stripe/auto-topup-rollout.ts"),
  system("tier_checkout_protocol_rollouts", "packages/credits/src/stripe/tier-checkout-rollout.ts"),
  // Phase 10a plan C4 (R-117): the public Sample Spin's abuse buckets. An IP
  // HMAC under a versioned dedicated key, a window start, an expiry at most 24 h
  // later, counters — deleted by the traffic-independent receiver on the same
  // 24-hour clock the auth limiter uses.
  row("public_sample_spin_buckets", "system_row", { scope: "system", writerOwner: "packages/db/src/public-sample-spin.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "rate_limit_window", executor: "expiry_receiver", residueProbe: "expiry_residue" }),
  row("rate_limit", "system_row", { scope: "system", writerOwner: "packages/auth", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "rate_limit_window", executor: "expiry_receiver", residueProbe: "expiry_residue" }),
  row("stripe_events", "stripe_workspace_attributed", { scope: "workspace", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "stripe_payload_90_days", executor: "stripe_payload_receiver", residueProbe: "stripe_payload_residue" }, { name: "provider_payload", kind: "columns", columns: ["payload"] }),
  row("stripe_events", "stripe_workspace_attributed", { scope: "workspace", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "financial_chain_seven_years", executor: "identifier_scrubber", residueProbe: "retained_financial_residue" }, { name: "linkable_source_ids", kind: "columns", columns: ["workspace_id", "stripe_customer_id"] }),
  // `tier_invoice_authority` is nulled WHOLE by the SQL port rather than
  // path-scrubbed, so its non-identifying keys (`respin_tier_invoice_id`,
  // `respin_tier_price_id`) go with the identifying ones. Acceptable only
  // because Task 6's finance extract — not this column — is the finance
  // authority (round-1 billing NOTE); the probe checks every governed path.
  row("stripe_events", "stripe_workspace_attributed", { scope: "workspace", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "financial_chain_seven_years", executor: "identifier_scrubber", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.stripe_events[2], ["tier_invoice_authority$.respin_tier_invoice_id", "tier_invoice_authority$.respin_tier_subscription_id", "tier_invoice_authority$.respin_tier_workspace_id", "tier_invoice_authority$.respin_tier_customer_id", "tier_invoice_authority$.respin_tier_checkout_attempt_id", "tier_invoice_authority$.respin_tier_price_id", "tier_invoice_authority$.respin_tier_stripe_account_id"]),
  row("stripe_events", "stripe_workspace_attributed", { scope: "workspace", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.stripe_events[3]),
  row("stripe_events", "stripe_customer_attributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "stripe_payload_90_days", executor: "stripe_payload_receiver", residueProbe: "stripe_payload_residue" }, { name: "provider_payload", kind: "columns", columns: ["payload"] }),
  row("stripe_events", "stripe_customer_attributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "stripe_payload_90_days", executor: "stripe_payload_receiver", residueProbe: "stripe_payload_residue" }, { name: "linkable_source_ids", kind: "columns", columns: ["workspace_id", "stripe_customer_id"] }),
  row("stripe_events", "stripe_customer_attributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "stripe_payload_90_days", executor: "stripe_payload_receiver", residueProbe: "stripe_payload_residue" }, SPLIT_TABLE_FIELD_SETS.stripe_events[2], ["tier_invoice_authority$.respin_tier_invoice_id", "tier_invoice_authority$.respin_tier_subscription_id", "tier_invoice_authority$.respin_tier_workspace_id", "tier_invoice_authority$.respin_tier_customer_id", "tier_invoice_authority$.respin_tier_checkout_attempt_id", "tier_invoice_authority$.respin_tier_price_id", "tier_invoice_authority$.respin_tier_stripe_account_id"]),
  row("stripe_events", "stripe_customer_attributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.stripe_events[3]),
  row("stripe_events", "stripe_unattributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_secret", exportProjector: "none", action: "delete_explicit", retention: "stripe_payload_90_days", executor: "stripe_payload_receiver", residueProbe: "stripe_payload_residue" }, { name: "provider_payload", kind: "columns", columns: ["payload"] }),
  // The unattributed class's link columns are BOTH NULL BY CHECK
  // (`stripe_events_receipt_attribution_shape`: unattributed <=> workspace_id
  // IS NULL AND stripe_customer_id IS NULL), so this set never holds a value
  // for any clock to scrub — the "no effective clock" the 10b-1 phase review
  // named is structurally empty, and retention-receiver.test.ts proves the
  // CHECK refuses a row that would give it one. The entry stays so the field
  // partition is exhaustive.
  row("stripe_events", "stripe_unattributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "stripe_payload_90_days", executor: "identifier_scrubber", residueProbe: "stripe_payload_residue" }, { name: "linkable_source_ids", kind: "columns", columns: ["workspace_id", "stripe_customer_id"] }),
  row("stripe_events", "stripe_unattributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "stripe_payload_90_days", executor: "stripe_payload_receiver", residueProbe: "stripe_payload_residue" }, SPLIT_TABLE_FIELD_SETS.stripe_events[2], ["tier_invoice_authority$.respin_tier_invoice_id", "tier_invoice_authority$.respin_tier_subscription_id", "tier_invoice_authority$.respin_tier_workspace_id", "tier_invoice_authority$.respin_tier_customer_id", "tier_invoice_authority$.respin_tier_checkout_attempt_id", "tier_invoice_authority$.respin_tier_price_id", "tier_invoice_authority$.respin_tier_stripe_account_id"]),
  row("stripe_events", "stripe_unattributed", { scope: "system", writerOwner: "packages/credits/src/stripe/webhooks.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, SPLIT_TABLE_FIELD_SETS.stripe_events[3]),
  // Task 6 / C5: the pre-redaction finance extract. A COMPLETE row is a
  // 30-day staging hand-off — 10b-2's projector stamps `ingested_at` and the
  // clock starts there, so an unconsumed row is never swept. An INCOMPLETE row
  // is the permanent authority for withholding that period (C5: it "never
  // delays the 90-day PII redaction deadline or becomes zero"), so it rides
  // the seven-year chain whose destructive receiver R-122 keeps disabled.
  row("stripe_finance_extracts", "finance_extract_complete", { scope: "system", writerOwner: "packages/db/src/finance-extract.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "finance_extract_30_days", executor: "expiry_receiver", residueProbe: "expiry_residue" }),
  row("stripe_finance_extracts", "finance_extract_incomplete", { scope: "system", writerOwner: "packages/db/src/finance-extract.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }),
  row("workspace_spend_monthly", "financial_row", { scope: "workspace", writerOwner: "packages/db/src/spend-rollup.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "financial_chain_seven_years", executor: "workspace_pseudonymiser", residueProbe: "retained_financial_residue" }, { name: "workspace_link", kind: "columns", columns: ["workspace_id"] }),
  row("workspace_spend_monthly", "financial_row", { scope: "workspace", writerOwner: "packages/db/src/spend-rollup.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, { name: "financial_facts", kind: "remaining_columns", excluding: ["workspace_id"] }),
  row("system_model_usage", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "operational_90_days", executor: "identifier_scrubber", residueProbe: "system_residue" }, { name: "linkable_source_ids", kind: "columns", columns: ["job_attempt_id", "job_id", "trend_item_id"] }),
  row("system_model_usage", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, { name: "cost_and_outcome_facts", kind: "remaining_columns", excluding: ["job_attempt_id", "job_id", "trend_item_id"] }),
  // Phase 10a plan C4: the public Sample Spin's metering rows on the same two
  // tables, discriminated by purpose. The whole row is a content-free
  // financial fact (see the row class above): no scrub, no erasure subject.
  row("system_model_usage", "public_sample_spin_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }),
  row("system_model_usage_reconciliations", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "operational_90_days", executor: "identifier_scrubber", residueProbe: "system_residue" }, { name: "linkable_attempt_id", kind: "columns", columns: ["job_attempt_id"] }),
  row("system_model_usage_reconciliations", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, { name: "cost_facts", kind: "remaining_columns", excluding: ["job_attempt_id"] }),
  row("system_spend_claims", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "pseudonymise", retention: "operational_90_days", executor: "identifier_scrubber", residueProbe: "system_residue" }, { name: "linkable_source_ids", kind: "columns", columns: ["job_attempt_id", "job_id", "trend_item_id", "autopsy_cache_claim_id"] }),
  row("system_spend_claims", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }, { name: "reservation_facts", kind: "remaining_columns", excluding: ["job_attempt_id", "job_id", "trend_item_id", "autopsy_cache_claim_id"] }),
  row("system_spend_claims", "public_sample_spin_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }),
  row("system_spend_daily", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "retain_financial", retention: "financial_chain_seven_years", executor: "financial_retention_receiver", residueProbe: "retained_financial_residue" }),
  row("system_worker_health", "system_row", { scope: "system", writerOwner: "packages/db/src/system-spend.ts", export: "excluded_system", exportProjector: "none", action: "delete_explicit", retention: "operational_90_days", executor: "expiry_receiver", residueProbe: "expiry_residue" }),
] as const satisfies readonly LifecycleClassEntry[];

type RowClassDiscriminator = Readonly<{
  kind: "enum_value" | "nullness";
  column: string;
  enumName: string | null;
  sourceFile: string;
  sourceToken: string;
  values: Readonly<Partial<Record<DataRowClass, string>>>;
  excludedEnumValues?: readonly string[];
  exclusionSourceFile?: string;
  exclusionSourceToken?: string;
}>;

const ROW_CLASS_DISCRIMINATORS: Readonly<
  Partial<Record<AppTable, RowClassDiscriminator>>
> = {
  stripe_finance_extracts: {
    kind: "enum_value",
    column: "status",
    enumName: "stripe_finance_extract_status",
    sourceFile: "packages/db/src/finance-extract.ts",
    sourceToken: "status",
    values: {
      finance_extract_complete: "complete",
      finance_extract_incomplete: "incomplete",
    },
  },
  system_model_usage: {
    kind: "enum_value",
    column: "purpose",
    enumName: "system_spend_purpose",
    sourceFile: "packages/db/src/system-spend-schema.ts",
    sourceToken: "purpose",
    values: { system_row: "trend_autopsy", public_sample_spin_row: "public_sample_spin" },
  },
  system_spend_claims: {
    kind: "enum_value",
    column: "purpose",
    enumName: "system_spend_purpose",
    sourceFile: "packages/db/src/system-spend-schema.ts",
    sourceToken: "purpose",
    values: { system_row: "trend_autopsy", public_sample_spin_row: "public_sample_spin" },
  },
  deletion_operations: {
    kind: "enum_value",
    column: "scope",
    enumName: "deletion_scope",
    sourceFile: "packages/db/src/deletion-lifecycle.ts",
    sourceToken: "scope",
    values: {
      identity_row: "identity",
      profile_row: "profile",
      workspace_row: "workspace",
    },
  },
  deletion_operation_transitions: {
    kind: "enum_value",
    column: "scope",
    enumName: "deletion_scope",
    sourceFile: "packages/db/src/deletion-lifecycle.ts",
    sourceToken: "scope",
    values: {
      identity_row: "identity",
      profile_row: "profile",
      workspace_row: "workspace",
    },
  },
  deletion_external_commands: {
    kind: "enum_value",
    column: "scope",
    enumName: "deletion_scope",
    sourceFile: "packages/db/src/deletion-external-commands.ts",
    sourceToken: "scope",
    values: {
      identity_row: "identity",
      profile_row: "profile",
      workspace_row: "workspace",
    },
  },
  frameworks: {
    kind: "enum_value",
    column: "rights_basis",
    enumName: "content_rights_basis",
    sourceFile: "packages/db/src/frameworks.ts",
    sourceToken: "rightsBasis",
    values: {
      profile_private: "profile_private",
      creator_consent: "creator_consent",
      independently_licensed: "independently_licensed",
      product_seed: "product_seed",
    },
  },
  trend_sources: {
    kind: "enum_value",
    column: "kind",
    enumName: "trend_source_kind",
    sourceFile: "packages/db/src/trends-storage.ts",
    sourceToken: "kind",
    values: { profile_private: "submitted", shared_library: "youtube" },
  },
  trend_items: {
    kind: "enum_value",
    column: "rights_scope",
    enumName: "trend_rights_scope",
    sourceFile: "packages/db/src/trends-storage.ts",
    sourceToken: "rightsScope",
    values: { profile_private: "profile_private", shared_library: "shared_analysis" },
  },
  trend_transcripts: {
    kind: "enum_value",
    column: "rights_basis",
    enumName: "content_rights_basis",
    sourceFile: "packages/db/src/trends-schema.ts",
    sourceToken: "rightsBasis",
    values: { profile_private: "profile_private", creator_consent: "creator_consent", independently_licensed: "independently_licensed" },
    excludedEnumValues: ["product_seed"],
    exclusionSourceFile: "packages/db/src/trends-schema.ts",
    exclusionSourceToken: "trend_transcripts_rights_shape",
  },
  autopsies: {
    kind: "enum_value",
    column: "rights_basis",
    enumName: "content_rights_basis",
    sourceFile: "packages/db/src/trends-schema.ts",
    sourceToken: "rightsBasis",
    values: { profile_private: "profile_private", creator_consent: "creator_consent", independently_licensed: "independently_licensed" },
    excludedEnumValues: ["product_seed"],
    exclusionSourceFile: "packages/db/src/trends-schema.ts",
    exclusionSourceToken: "autopsies_rights_shape",
  },
  autopsy_cache_claims: {
    kind: "enum_value",
    column: "rights_basis",
    enumName: "content_rights_basis",
    sourceFile: "packages/db/src/trends-schema.ts",
    sourceToken: "rightsBasis",
    values: { profile_private: "profile_private", creator_consent: "creator_consent", independently_licensed: "independently_licensed" },
    excludedEnumValues: ["product_seed"],
    exclusionSourceFile: "packages/db/src/trends-schema.ts",
    exclusionSourceToken: "autopsy_cache_claims_rights_shape",
  },
  stripe_events: {
    kind: "enum_value",
    column: "receipt_attribution",
    enumName: "stripe_receipt_attribution",
    sourceFile: "packages/credits/src/stripe/webhooks.ts",
    sourceToken: "receiptAttribution",
    values: {
      stripe_workspace_attributed: "workspace_attributed",
      stripe_customer_attributed: "customer_attributed",
      stripe_unattributed: "unattributed",
    },
  },
};

export const ROW_CLASS_INVENTORY: readonly RowClassInventoryEntry[] = APP_TABLES.flatMap<RowClassInventoryEntry>((table) => {
  const rowClasses = ROW_CLASSES_BY_TABLE[table] as readonly DataRowClass[];
  const discriminator = ROW_CLASS_DISCRIMINATORS[table];
  if (rowClasses.length > 1 && !discriminator) {
    throw new Error(`mixed table '${table}' has no discriminator inventory`);
  }
  if (rowClasses.length === 1 && discriminator) {
    throw new Error(`single-class table '${table}' has an unexpected discriminator`);
  }
  return rowClasses.map((rowClass) => {
    if (!discriminator) {
      return { table, rowClass, discriminator: null, permitsWholeRowFieldSet: true };
    }
    const value = discriminator.values[rowClass];
    if (!value) throw new Error(`discriminator '${table}' has no value for '${rowClass}'`);
    return {
      table,
      rowClass,
      discriminator: {
        kind: discriminator.kind,
        column: discriminator.column,
        value,
        enumName: discriminator.enumName,
          sourceFile: discriminator.sourceFile,
          sourceToken: discriminator.kind === "enum_value" ? value : discriminator.sourceToken,
          excludedEnumValues: discriminator.excludedEnumValues ?? [],
          exclusionSourceFile: discriminator.exclusionSourceFile ?? null,
          exclusionSourceToken: discriminator.exclusionSourceToken ?? null,
      },
      permitsWholeRowFieldSet: true,
    };
  });
});
export const JSON_PATH_INVENTORY: readonly JsonPathInventoryEntry[] = [
  { table: "stripe_events", column: "tier_invoice_authority", path: "$.respin_tier_invoice_id", sourceFile: "packages/credits/src/stripe/tier-invoice-authority.ts", sourceToken: "respin_tier_invoice_id" },
  { table: "stripe_events", column: "tier_invoice_authority", path: "$.respin_tier_subscription_id", sourceFile: "packages/credits/src/stripe/tier-invoice-authority.ts", sourceToken: "respin_tier_subscription_id" },
  { table: "stripe_events", column: "tier_invoice_authority", path: "$.respin_tier_workspace_id", sourceFile: "packages/credits/src/stripe/tier-invoice-authority.ts", sourceToken: "respin_tier_workspace_id" },
  { table: "stripe_events", column: "tier_invoice_authority", path: "$.respin_tier_customer_id", sourceFile: "packages/credits/src/stripe/tier-invoice-authority.ts", sourceToken: "respin_tier_customer_id" },
  { table: "stripe_events", column: "tier_invoice_authority", path: "$.respin_tier_checkout_attempt_id", sourceFile: "packages/credits/src/stripe/tier-invoice-authority.ts", sourceToken: "respin_tier_checkout_attempt_id" },
  { table: "stripe_events", column: "tier_invoice_authority", path: "$.respin_tier_price_id", sourceFile: "packages/credits/src/stripe/tier-invoice-authority.ts", sourceToken: "respin_tier_price_id" },
  { table: "stripe_events", column: "tier_invoice_authority", path: "$.respin_tier_stripe_account_id", sourceFile: "packages/credits/src/stripe/tier-invoice-authority.ts", sourceToken: "respin_tier_stripe_account_id" },
  { table: "brain_docs", column: "source_evidence", path: "$[*].inputId", sourceFile: "packages/db/src/with-workspace.ts", sourceToken: "inputId" },
  { table: "brain_docs", column: "reference_corpus_ids", path: "$[*]", sourceFile: "packages/db/src/with-workspace.ts", sourceToken: "referenceCorpusIds" },
  { table: "generations", column: "framework_versions", path: "$[*].frameworkId", sourceFile: "packages/db/src/with-workspace.ts", sourceToken: "frameworkVersions" },
  { table: "generations", column: "context_input_ids", path: "$[*]", sourceFile: "packages/db/src/with-workspace.ts", sourceToken: "contextInputIds" },
  { table: "generations", column: "request", path: "$.brainActivationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "brainActivationId" },
  { table: "generations", column: "request", path: "$.parentGenerationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "parentGenerationId" },
  { table: "generations", column: "request", path: "$.spinAutopsyId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "spinAutopsyId" },
  { table: "generations", column: "request", path: "$.origin.pieceId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "pieceId" },
  { table: "generations", column: "request", path: "$.origin.sourceGenerationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "sourceGenerationId" },
  { table: "generation_attempts", column: "candidate", path: "$.request.brainActivationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "brainActivationId" },
  { table: "generation_attempts", column: "candidate", path: "$.request.parentGenerationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "parentGenerationId" },
  { table: "generation_attempts", column: "candidate", path: "$.request.spinAutopsyId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "spinAutopsyId" },
  { table: "generation_attempts", column: "candidate", path: "$.request.origin.pieceId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "pieceId" },
  { table: "generation_attempts", column: "candidate", path: "$.request.origin.sourceGenerationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "sourceGenerationId" },
  { table: "generation_attempts", column: "candidate", path: "$.frameworkVersions[*].id", sourceFile: "packages/credits/src/generate.ts", sourceToken: "frameworkVersions" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.brainActivationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "brainActivationId" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.parentGenerationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "parentGenerationId" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.spinAutopsyId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "spinAutopsyId" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.origin.pieceId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "pieceId" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.origin.sourceGenerationId", sourceFile: "packages/credits/src/generate.ts", sourceToken: "sourceGenerationId" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.frameworkVersions[*].id", sourceFile: "packages/credits/src/generate.ts", sourceToken: "frameworkVersions" },
  // Launch L3 (R-152): the history the prompt carried — draft and reaction
  // ids, the pieces whose state labelled a draft, and every excluded row.
  { table: "generation_attempts", column: "request_snapshot", path: "$.recentContext.records[*].id", sourceFile: "packages/credits/src/recent-context.ts", sourceToken: "records" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.recentContext.pieces[*].id", sourceFile: "packages/credits/src/recent-context.ts", sourceToken: "pieces" },
  { table: "generation_attempts", column: "request_snapshot", path: "$.recentContext.exclusions[*].id", sourceFile: "packages/credits/src/recent-context.ts", sourceToken: "exclusions" },
  { table: "frameworks", column: "source_references", path: "$[*].ref", sourceFile: "packages/db/src/frameworks.ts", sourceToken: "sourceReferences" },
  { table: "frameworks", column: "evidence_entries", path: "$[*].ref", sourceFile: "packages/db/src/frameworks.ts", sourceToken: "evidenceEntries" },
  { table: "promotion_proposals", column: "payload", path: "$.rule.evidenceStates[*].resultId", sourceFile: "packages/db/src/promotion-ops.ts", sourceToken: "resultId" },
  { table: "trend_items", column: "baseline_observation_ids", path: "$[*]", sourceFile: "packages/db/src/trends-storage.ts", sourceToken: "baselineObservationIds" },
  { table: "trend_transcripts", column: "provenance", path: "$.referenceInputId", sourceFile: "packages/db/src/trends-storage.ts", sourceToken: "referenceInputId" },
  { table: "trend_transcripts", column: "provenance", path: "$.sourceUrl", sourceFile: "packages/db/src/trends-storage.ts", sourceToken: "sourceUrl" },
  { table: "trend_transcripts", column: "provenance", path: "$.consentEvidenceId", sourceFile: "packages/db/src/trends-storage.ts", sourceToken: "consentEvidenceId" },
  { table: "trend_transcripts", column: "provenance", path: "$.sourceReference", sourceFile: "packages/db/src/trends-storage.ts", sourceToken: "sourceReference" },
] as const;

/**
 * Migration-derived JSON-column closure. Identifier-bearing columns must also
 * enumerate their independently probed paths above; the remaining classes make
 * the absence of an internal identifier an explicit reviewed assertion.
 */
export const JSON_COLUMN_INVENTORY: readonly JsonColumnInventoryEntry[] = [
  { table: "autopsies", column: "analysis", classification: "creator_content_no_internal_link" },
  { table: "brain_docs", column: "confirmed_fields", classification: "content_free_no_internal_link" },
  { table: "brain_docs", column: "content", classification: "creator_content_no_internal_link" },
  { table: "brain_docs", column: "evidence_counts", classification: "content_free_no_internal_link" },
  { table: "brain_docs", column: "reference_corpus_ids", classification: "identifier_paths" },
  { table: "brain_docs", column: "source_evidence", classification: "identifier_paths" },
  { table: "config_versions", column: "content", classification: "content_free_no_internal_link" },
  { table: "frameworks", column: "applicability", classification: "creator_content_no_internal_link" },
  { table: "frameworks", column: "beats", classification: "creator_content_no_internal_link" },
  { table: "frameworks", column: "evidence_entries", classification: "identifier_paths" },
  { table: "frameworks", column: "source_references", classification: "identifier_paths" },
  { table: "frameworks", column: "tested_caveats", classification: "creator_content_no_internal_link" },
  { table: "generation_attempts", column: "candidate", classification: "identifier_paths" },
  { table: "generation_attempts", column: "request_snapshot", classification: "identifier_paths" },
  { table: "generations", column: "context_input_ids", classification: "identifier_paths" },
  { table: "generations", column: "framework_versions", classification: "identifier_paths" },
  { table: "generations", column: "kill_test", classification: "creator_content_no_internal_link" },
  { table: "generations", column: "output", classification: "creator_content_no_internal_link" },
  { table: "generations", column: "request", classification: "identifier_paths" },
  { table: "model_usage", column: "usage_raw", classification: "content_free_no_internal_link" },
  { table: "onboarding_interview_drafts", column: "answers", classification: "creator_content_no_internal_link" },
  { table: "promotion_proposals", column: "payload", classification: "identifier_paths" },
  { table: "results", column: "confounders", classification: "content_free_no_internal_link" },
  { table: "stripe_events", column: "payload", classification: "provider_payload" },
  { table: "stripe_events", column: "tier_invoice_authority", classification: "identifier_paths" },
  { table: "subscriptions", column: "tier_checkout_attempt_authority", classification: "content_free_no_internal_link" },
  { table: "trend_items", column: "baseline_observation_ids", classification: "identifier_paths" },
  { table: "trend_transcripts", column: "provenance", classification: "identifier_paths" },
] as const;

export type LifecycleClosureInput = Readonly<{
  migrations: MigrationInventory;
  registry: readonly LifecycleClassEntry[];
  writers: readonly LifecycleWriterInventoryEntry[];
  rowClasses: readonly RowClassInventoryEntry[];
  jsonPaths: readonly JsonPathInventoryEntry[];
  jsonColumns: readonly JsonColumnInventoryEntry[];
  externalWriters: readonly ExternalWriterAuthority[];
  supportingStores: readonly SupportingLifecycleStoreEntry[];
  executors: Partial<LifecycleExecutorImplementations>;
  probes: Partial<ResidueProbeImplementations>;
}>;
const registryKey = (entry: LifecycleClassEntry) => `${entry.table}::${entry.rowClass}::${entry.fieldSet.name}`;

type ForeignKeyLifecycleRole = "scope_owner" | "secondary_scope" | "identity_subject" | "related_cascade" | "reference_set_null" | "retention_restrict";
type FinalSchemaForeignKeySpec = readonly [
  constraintName: string,
  columns: readonly string[],
  referencedTable: AppTable,
  referencedColumns: readonly string[],
  onDelete: MigrationForeignKey["onDelete"],
  role: ForeignKeyLifecycleRole,
];
const FOREIGN_KEY_ROLE_DELETE_ACTION = {
  scope_owner: "cascade",
  secondary_scope: "cascade",
  identity_subject: "cascade",
  related_cascade: "cascade",
  reference_set_null: "set_null",
  retention_restrict: "restrict",
} as const satisfies Readonly<Record<ForeignKeyLifecycleRole, MigrationForeignKey["onDelete"]>>;

/**
 * Hand-classified final-schema FK graph. The table record is compile-closed and
 * the closure check below is bidirectional, so a new physical edge cannot hide
 * behind an already-valid primary owner edge.
 */
const FINAL_SCHEMA_FOREIGN_KEYS = {
  account: [["account_user_id_user_id_fk", ["user_id"], "user", ["id"], "cascade", "scope_owner"]],
  activation_cohort_daily: [],
  auth_mail_outbox: [
    ["auth_mail_outbox_auth_user_id_user_id_fk", ["auth_user_id"], "user", ["id"], "restrict", "retention_restrict"],
    ["auth_mail_outbox_operation_id_deletion_operations_id_fk", ["operation_id"], "deletion_operations", ["id"], "restrict", "retention_restrict"],
  ],
  auto_topup_protocol_rollouts: [],
  tier_checkout_protocol_rollouts: [],
  autopsies: [
    ["autopsies_matched_framework_id_frameworks_id_fk", ["matched_framework_id"], "frameworks", ["id"], "set_null", "reference_set_null"],
    ["autopsies_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
    ["autopsies_rights_subject_user_id_users_id_fk", ["rights_subject_user_id"], "users", ["id"], "cascade", "identity_subject"],
    ["autopsies_trend_item_id_trend_items_id_fk", ["trend_item_id"], "trend_items", ["id"], "cascade", "related_cascade"],
    ["autopsies_trend_item_rights_scope_fk", ["trend_item_id", "rights_scope"], "trend_items", ["id", "rights_scope"], "cascade", "related_cascade"],
    ["autopsies_trend_item_profile_fk", ["trend_item_id", "profile_id"], "trend_items", ["id", "profile_id"], "cascade", "related_cascade"],
  ],
  autopsy_cache_claims: [
    ["autopsy_cache_claims_autopsy_id_autopsies_id_fk", ["autopsy_id"], "autopsies", ["id"], "restrict", "retention_restrict"],
    ["autopsy_cache_claims_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
    ["autopsy_cache_claims_rights_subject_user_id_users_id_fk", ["rights_subject_user_id"], "users", ["id"], "cascade", "identity_subject"],
    ["autopsy_cache_claims_trend_item_id_trend_items_id_fk", ["trend_item_id"], "trend_items", ["id"], "cascade", "related_cascade"],
    ["autopsy_cache_claims_trend_item_rights_scope_fk", ["trend_item_id", "rights_scope"], "trend_items", ["id", "rights_scope"], "cascade", "related_cascade"],
    ["autopsy_cache_claims_trend_item_profile_fk", ["trend_item_id", "profile_id"], "trend_items", ["id", "profile_id"], "cascade", "related_cascade"],
  ],
  brain_activation_snapshots: [["brain_activation_snapshots_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"]],
  brain_docs: [
    ["brain_docs_confirmed_by_users_id_fk", ["confirmed_by"], "users", ["id"], "set_null", "reference_set_null"],
    ["brain_docs_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
  ],
  config_versions: [],
  creator_profiles: [["creator_profiles_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "cascade", "secondary_scope"]],
  // Task 6 / R-122: RESTRICT, not dropped. The key still refuses a
  // cross-parented row; only the delete action moved, so the retained
  // seven-year row is repointed to a stub instead of cascading away.
  credit_ledger: [["credit_ledger_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "restrict", "retention_restrict"]],
  deletion_cancellation_proofs: [
    ["deletion_cancellation_proofs_auth_user_id_user_id_fk", ["auth_user_id"], "user", ["id"], "restrict", "retention_restrict"],
    ["deletion_cancellation_proofs_operation_id_deletion_operations_id_fk", ["operation_id"], "deletion_operations", ["id"], "restrict", "retention_restrict"],
    ["deletion_cancellation_proofs_recovery_identity_fk", ["recovery_session_id", "operation_id", "auth_user_id"], "deletion_recovery_sessions", ["id", "operation_id", "auth_user_id"], "restrict", "retention_restrict"],
    ["deletion_cancellation_proofs_recovery_session_id_deletion_recovery_sessions_id_fk", ["recovery_session_id"], "deletion_recovery_sessions", ["id"], "restrict", "retention_restrict"],
  ],
  deletion_external_commands: [
    ["deletion_external_commands_operation_id_deletion_operations_id_fk", ["operation_id"], "deletion_operations", ["id"], "restrict", "retention_restrict"],
    ["deletion_external_commands_profile_id_creator_profiles_id_fk", ["profile_id"], "creator_profiles", ["id"], "restrict", "retention_restrict"],
    ["deletion_external_commands_user_id_users_id_fk", ["user_id"], "users", ["id"], "restrict", "retention_restrict"],
    ["deletion_external_commands_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "restrict", "retention_restrict"],
  ],
  deletion_membership_snapshots: [
    ["deletion_membership_snapshots_operation_id_deletion_operations_id_fk", ["operation_id"], "deletion_operations", ["id"], "restrict", "retention_restrict"],
    ["deletion_membership_snapshots_user_id_users_id_fk", ["user_id"], "users", ["id"], "restrict", "retention_restrict"],
    ["deletion_membership_snapshots_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "restrict", "retention_restrict"],
  ],
  deletion_operation_transitions: [
    ["deletion_operation_transitions_operation_identity_fk", ["operation_id", "scope", "target_key", "requester_digest", "payload_hash"], "deletion_operations", ["id", "scope", "target_key", "requester_digest", "payload_hash"], "restrict", "retention_restrict"],
    ["deletion_operation_transitions_operation_id_deletion_operations_id_fk", ["operation_id"], "deletion_operations", ["id"], "restrict", "retention_restrict"],
    ["deletion_operation_transitions_profile_id_creator_profiles_id_fk", ["profile_id"], "creator_profiles", ["id"], "restrict", "retention_restrict"],
    ["deletion_operation_transitions_requester_user_id_users_id_fk", ["requester_user_id"], "users", ["id"], "set_null", "reference_set_null"],
    ["deletion_operation_transitions_user_id_users_id_fk", ["user_id"], "users", ["id"], "restrict", "retention_restrict"],
    ["deletion_operation_transitions_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "restrict", "retention_restrict"],
  ],
  deletion_operations: [
    ["deletion_operations_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "restrict", "retention_restrict"],
    ["deletion_operations_profile_id_creator_profiles_id_fk", ["profile_id"], "creator_profiles", ["id"], "restrict", "retention_restrict"],
    ["deletion_operations_requester_user_id_users_id_fk", ["requester_user_id"], "users", ["id"], "set_null", "reference_set_null"],
    // R-166: who cancelled (any active owner may, R-162). Same posture as the requester.
    ["deletion_operations_cancelled_by_user_id_users_id_fk", ["cancelled_by_user_id"], "users", ["id"], "set_null", "reference_set_null"],
    ["deletion_operations_user_id_users_id_fk", ["user_id"], "users", ["id"], "restrict", "retention_restrict"],
    ["deletion_operations_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "restrict", "retention_restrict"],
  ],
  deletion_recovery_sessions: [
    ["deletion_recovery_sessions_auth_user_id_user_id_fk", ["auth_user_id"], "user", ["id"], "restrict", "retention_restrict"],
    ["deletion_recovery_sessions_operation_id_deletion_operations_id_fk", ["operation_id"], "deletion_operations", ["id"], "restrict", "retention_restrict"],
  ],
  first_billable_attempts: [["first_billable_attempts_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"]],
  frameworks: [
    ["frameworks_owner_profile_workspace_fk", ["owner_profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
    ["frameworks_rights_subject_user_id_users_id_fk", ["rights_subject_user_id"], "users", ["id"], "cascade", "identity_subject"],
  ],
  creative_pieces: [
    ["creative_pieces_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
    ["creative_pieces_selected_generation_fk", ["selected_generation_id", "profile_id", "workspace_id"], "generations", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["creative_pieces_source_generation_fk", ["source_generation_id", "profile_id", "workspace_id"], "generations", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
  ],
  generation_attempts: [["generation_attempts_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"]],
  generation_feedback: [
    ["generation_feedback_generation_fk", ["generation_id", "profile_id", "workspace_id"], "generations", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["generation_feedback_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
  ],
  generations: [
    ["generations_attempt_fk", ["attempt_id", "mode", "profile_id", "workspace_id"], "generation_attempts", ["attempt_id", "mode", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["generations_parent_fk", ["parent_id", "profile_id", "workspace_id"], "generations", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["generations_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
  ],
  membership_profile_selections: [
    ["membership_profile_selections_membership_workspace_fk", ["user_id", "workspace_id"], "memberships", ["user_id", "workspace_id"], "cascade", "secondary_scope"],
    ["membership_profile_selections_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
  ],
  memberships: [
    ["memberships_user_id_users_id_fk", ["user_id"], "users", ["id"], "cascade", "scope_owner"],
    ["memberships_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "cascade", "secondary_scope"],
  ],
  // Task 6 / R-122: RESTRICT, not dropped. The key still refuses a
  // cross-parented row; only the delete action moved, so the retained
  // seven-year row is repointed to a stub instead of cascading away.
  model_usage: [["model_usage_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "restrict", "retention_restrict"]],
  onboarding_inputs: [["onboarding_inputs_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"]],
  onboarding_interview_drafts: [["onboarding_interview_drafts_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"]],
  // Task 6 / R-122: RESTRICT, not dropped. The key still refuses a
  // cross-parented row; only the delete action moved, so the retained
  // seven-year row is repointed to a stub instead of cascading away.
  pause_periods: [["pause_periods_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "restrict", "retention_restrict"]],
  promotion_proposals: [
    ["promotion_proposals_accepted_activation_fk", ["accepted_activation_id", "profile_id", "workspace_id"], "brain_activation_snapshots", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["promotion_proposals_accepted_doc_fk", ["accepted_brain_doc_id", "profile_id", "workspace_id"], "brain_docs", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["promotion_proposals_basis_doc_fk", ["basis_brain_doc_id", "profile_id", "workspace_id"], "brain_docs", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["promotion_proposals_decision_user_id_users_id_fk", ["decision_user_id"], "users", ["id"], "set_null", "reference_set_null"],
    ["promotion_proposals_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
  ],
  proposal_evidence_feedback: [
    ["proposal_evidence_feedback_feedback_fk", ["feedback_id", "profile_id", "workspace_id"], "generation_feedback", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["proposal_evidence_feedback_proposal_fk", ["proposal_id", "profile_id", "workspace_id"], "promotion_proposals", ["id", "profile_id", "workspace_id"], "cascade", "scope_owner"],
  ],
  proposal_evidence_results: [
    ["proposal_evidence_results_proposal_fk", ["proposal_id", "profile_id", "workspace_id"], "promotion_proposals", ["id", "profile_id", "workspace_id"], "cascade", "scope_owner"],
    ["proposal_evidence_results_result_fk", ["result_id", "profile_id", "workspace_id"], "results", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
  ],
  rate_limit: [],
  results: [
    ["results_generation_fk", ["generation_id", "profile_id", "workspace_id"], "generations", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["results_metric_doc_fk", ["metric_declared_by_doc_id", "profile_id", "workspace_id"], "brain_docs", ["id", "profile_id", "workspace_id"], "cascade", "related_cascade"],
    ["results_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
  ],
  session: [["session_user_id_user_id_fk", ["user_id"], "user", ["id"], "cascade", "scope_owner"]],
  stripe_events: [["stripe_events_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "set_null", "reference_set_null"]],
  // Task 6 / R-122: RESTRICT, not dropped. The key still refuses a
  // cross-parented row; only the delete action moved, so the retained
  // seven-year row is repointed to a stub instead of cascading away.
  subscriptions: [
    ["subscriptions_billing_contact_user_id_users_id_fk", ["billing_contact_user_id"], "users", ["id"], "set_null", "reference_set_null"],
    ["subscriptions_workspace_id_workspaces_id_fk", ["workspace_id"], "workspaces", ["id"], "restrict", "retention_restrict"],
  ],
  system_model_usage: [["system_model_usage_business_date_system_spend_daily_business_date_fk", ["business_date"], "system_spend_daily", ["business_date"], "restrict", "retention_restrict"]],
  system_model_usage_reconciliations: [["system_model_usage_reconciliations_business_date_system_spend_daily_business_date_fk", ["business_date"], "system_spend_daily", ["business_date"], "restrict", "retention_restrict"]],
  system_spend_claims: [["system_spend_claims_business_date_system_spend_daily_business_date_fk", ["business_date"], "system_spend_daily", ["business_date"], "restrict", "retention_restrict"]],
  system_spend_daily: [],
  system_worker_health: [],
  public_sample_spin_buckets: [],
  tracked_niches: [["tracked_niches_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"]],
  trend_items: [
    ["trend_items_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
    ["trend_items_source_id_trend_sources_id_fk", ["source_id"], "trend_sources", ["id"], "restrict", "retention_restrict"],
  ],
  trend_sources: [["trend_sources_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"]],
  trend_transcripts: [
    ["trend_transcripts_profile_workspace_fk", ["profile_id", "workspace_id"], "creator_profiles", ["id", "workspace_id"], "cascade", "scope_owner"],
    ["trend_transcripts_reference_input_id_onboarding_inputs_id_fk", ["reference_input_id"], "onboarding_inputs", ["id"], "cascade", "related_cascade"],
    ["trend_transcripts_rights_subject_user_id_users_id_fk", ["rights_subject_user_id"], "users", ["id"], "cascade", "identity_subject"],
    ["trend_transcripts_trend_item_id_trend_items_id_fk", ["trend_item_id"], "trend_items", ["id"], "cascade", "related_cascade"],
    ["trend_transcripts_trend_item_rights_scope_fk", ["trend_item_id", "rights_scope"], "trend_items", ["id", "rights_scope"], "cascade", "related_cascade"],
    ["trend_transcripts_trend_item_profile_fk", ["trend_item_id", "profile_id"], "trend_items", ["id", "profile_id"], "cascade", "related_cascade"],
  ],
  user: [],
  users: [["users_auth_user_id_user_id_fk", ["auth_user_id"], "user", ["id"], "restrict", "retention_restrict"]],
  verification: [],
  workspaces: [],
  stripe_finance_extracts: [
    ["stripe_finance_extracts_source_stripe_event_id_stripe_events_id_fk", ["source_stripe_event_id"], "stripe_events", ["id"], "restrict", "retention_restrict"],
  ],
  workspace_spend_monthly: [],
} as const satisfies Readonly<Record<AppTable, readonly FinalSchemaForeignKeySpec[]>>;

/**
 * Every final-schema foreign key as a plain edge (child table -> referenced
 * table), derived from the classified inventory above so it cannot drift from
 * it. The retention receiver orders its sweeps children-first over these
 * edges: a parent row deleted before its RESTRICT children fails the batch,
 * is counted as poisoned, and (until the next tick) leaves the parent
 * overdue. Found by the populated one-tick sweep fixture, where
 * `deletion_recovery_sessions` sorted alphabetically AFTER its parent
 * `deletion_operations` and the parent could never be deleted in the tick.
 */
export const LIFECYCLE_FOREIGN_KEY_EDGES: readonly Readonly<{
  table: AppTable;
  referencedTable: AppTable;
  onDelete: MigrationForeignKey["onDelete"];
}>[] = (Object.entries(FINAL_SCHEMA_FOREIGN_KEYS) as [AppTable, readonly FinalSchemaForeignKeySpec[]][]).flatMap(
  ([table, keys]) => keys.map(([, , referencedTable, , onDelete]) => ({ table, referencedTable, onDelete }))
);

type ExpectedOwnershipEdge = Readonly<{
  constraintName: string;
  columns: readonly string[];
  referencedTable: AppTable;
  referencedColumns: readonly string[];
  onDelete: "cascade";
}>;

/** Domain identity precedes auth identity because users.auth_user_id is RESTRICT. */
const CASCADE_ROOT_ORDER = {
  identity: ["users", "user"],
  profile: ["creator_profiles"],
  workspace: ["workspaces"],
} as const satisfies Readonly<Record<Exclude<DataScope, "system">, readonly AppTable[]>>;

function expectedOwnershipEdge(entry: LifecycleClassEntry): ExpectedOwnershipEdge | null {
  if (entry.scope === "system" || entry.action !== "cascade") return null;
  if (CASCADE_ROOT_ORDER[entry.scope].includes(entry.table as never)) return null;
  if (entry.rowClass === "creator_consent") return {
    constraintName: `${entry.table}_rights_subject_user_id_users_id_fk`,
    columns: ["rights_subject_user_id"],
    referencedTable: "users",
    referencedColumns: ["id"],
    onDelete: "cascade",
  };
  if (entry.scope === "identity") {
    if (entry.table === "account") return {
      constraintName: "account_user_id_user_id_fk",
      columns: ["user_id"],
      referencedTable: "user",
      referencedColumns: ["id"],
      onDelete: "cascade",
    };
    if (entry.table === "memberships") return {
      constraintName: "memberships_user_id_users_id_fk",
      columns: ["user_id"],
      referencedTable: "users",
      referencedColumns: ["id"],
      onDelete: "cascade",
    };
    return null;
  }
  if (entry.scope === "workspace") return {
    constraintName: `${entry.table}_workspace_id_workspaces_id_fk`,
    columns: ["workspace_id"],
    referencedTable: "workspaces",
    referencedColumns: ["id"],
    onDelete: "cascade",
  };
  if (entry.table === "proposal_evidence_feedback" || entry.table === "proposal_evidence_results") return {
    constraintName: `${entry.table}_proposal_fk`,
    columns: ["proposal_id", "profile_id", "workspace_id"],
    referencedTable: "promotion_proposals",
    referencedColumns: ["id", "profile_id", "workspace_id"],
    onDelete: "cascade",
  };
  return {
    constraintName: entry.table === "frameworks"
      ? "frameworks_owner_profile_workspace_fk"
      : `${entry.table}_profile_workspace_fk`,
    columns: [entry.table === "frameworks" ? "owner_profile_id" : "profile_id", "workspace_id"],
    referencedTable: "creator_profiles",
    referencedColumns: ["id", "workspace_id"],
    onDelete: "cascade",
  };
}

function sameForeignKey(left: MigrationForeignKey, right: MigrationForeignKey): boolean {
  return left.constraintName === right.constraintName
    && JSON.stringify(left.columns) === JSON.stringify(right.columns)
    && left.referencedTable === right.referencedTable
    && JSON.stringify(left.referencedColumns) === JSON.stringify(right.referencedColumns)
    && left.onDelete === right.onDelete;
}

/** Roots a RESTRICT foreign key can point at, and the scope that erases each. */
const RESTRICT_ROOT_SCOPES: Readonly<Record<string, DataScope>> = {
  user: "identity",
  users: "identity",
  workspaces: "workspace",
  creator_profiles: "profile",
};

/**
 * Link columns that are NULL for a row class by the table's target-shape
 * CHECK, so a foreign key on them is inert for that class (MATCH SIMPLE): an
 * identity receipt names no workspace or profile, a profile receipt no user,
 * a workspace receipt no user or profile. A list (CLAUDE.md Respin rule 7),
 * consulted by the closure rule below per row class — the round-2 tenancy
 * CHANGE found the table-level rule accepting profile-class coverage for a
 * workspace-class link.
 */
const STRUCTURALLY_NULL_LINKS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  deletion_operations: { identity_row: ["workspace_id", "profile_id"], profile_row: ["user_id"], workspace_row: ["user_id", "profile_id"] },
  deletion_operation_transitions: { identity_row: ["workspace_id", "profile_id"], profile_row: ["user_id"], workspace_row: ["user_id", "profile_id"] },
  deletion_external_commands: { identity_row: ["workspace_id", "profile_id"], profile_row: ["user_id"], workspace_row: ["user_id", "profile_id"] },
};

/** The physical columns a registry entry's field set names, given the table's columns. */
export function fieldSetColumns(entry: LifecycleClassEntry, tableColumns: readonly string[]): readonly string[] {
  const set: LifecycleFieldSet = entry.fieldSet;
  if (set.kind === "all_columns") return tableColumns;
  if (set.kind === "columns") return set.columns;
  const excluded: readonly string[] = set.excluding;
  return tableColumns.filter((column) => !excluded.includes(column));
}

export function validateLifecycleClosure(input: LifecycleClosureInput): void {
  const failures: string[] = [];
  const migrationTables = new Map(input.migrations.tables.map((table) => [table.name, table]));
  const registryTables = new Set(input.registry.map((entry) => entry.table));
  for (const table of migrationTables.keys()) if (!registryTables.has(table as AppTable)) failures.push(`unregistered migration table: ${table}`);
  for (const table of registryTables) if (!migrationTables.has(table)) failures.push(`registry table is absent from migrations: ${table}`);
  const keys = new Set<string>();
  for (const entry of input.registry) {
    const key = registryKey(entry);
    if (keys.has(key)) failures.push(`duplicate registry key: ${key}`); keys.add(key);
    if (entry.retention.length === 0) failures.push(`empty retention: ${key}`);
    if (typeof input.executors[entry.executor]?.execute !== "function") failures.push(`missing executor: ${entry.executor}`);
    if (!input.executors[entry.executor]?.supportedActions.includes(entry.action)) failures.push(`executor/action mismatch: ${entry.executor} cannot ${entry.action}`);
    if (typeof input.probes[entry.residueProbe]?.execute !== "function") failures.push(`missing probe: ${entry.residueProbe}`);
    if (!input.writers.some((writer) => writer.table === entry.table && writer.owner === entry.writerOwner)) failures.push(`missing writer: ${entry.table} / ${entry.writerOwner}`);
  }
  for (const writer of input.writers) {
    if (!input.registry.some((entry) => entry.table === writer.table && entry.writerOwner === writer.owner)) failures.push(`unregistered writer: ${writer.table} / ${writer.owner}`);
    if (new Set(writer.physicalWriters).size !== writer.physicalWriters.length) failures.push(`duplicate physical writer mapping: ${writer.table} / ${writer.owner}`);
  }
  const classifiedEdges = new Map<string, MigrationForeignKey>();
  for (const table of APP_TABLES) {
    for (const [constraintName, columns, referencedTable, referencedColumns, onDelete, role] of FINAL_SCHEMA_FOREIGN_KEYS[table]) {
      if (onDelete !== FOREIGN_KEY_ROLE_DELETE_ACTION[role]) {
        failures.push(`final-schema foreign key classification/action mismatch: ${table}.${constraintName}`);
      }
      classifiedEdges.set(`${table}.${constraintName}`, {
        constraintName,
        columns,
        referencedTable,
        referencedColumns,
        onDelete,
      });
    }
  }
  const physicalEdges = new Map<string, MigrationForeignKey>();
  for (const table of input.migrations.tables) {
    for (const foreignKey of table.foreignKeys) {
      physicalEdges.set(`${table.name}.${foreignKey.constraintName}`, foreignKey);
    }
  }
  for (const [key, expected] of classifiedEdges) {
    const actual = physicalEdges.get(key);
    if (actual === undefined) failures.push(`classified final-schema foreign key is missing: ${key}`);
    else if (!sameForeignKey(actual, expected)) failures.push(`classified final-schema foreign key mismatch: ${key}`);
  }
  for (const key of physicalEdges.keys()) {
    if (!classifiedEdges.has(key)) failures.push(`unclassified final-schema foreign key: ${key}`);
  }
  // Round-1 tenancy BLOCK (the class), row-class aware since round 2: a
  // RESTRICT foreign key into a scope root survives that root's DELETE only if,
  // for EVERY row class that can carry the link, an entry OF THAT ROW CLASS
  // under the root's scope repoints, nulls or deletes the referencing
  // column(s); otherwise the root DELETE fails at the database and the
  // operation can never complete. A profile-scope entry counts for the
  // workspace root because a workspace operation runs the profile-scope
  // targets too (`targetAppliesToOperation`); a link that is structurally NULL
  // for a row class is inert for it (STRUCTURALLY_NULL_LINKS).
  for (const item of input.rowClasses) {
    const migrationTable = migrationTables.get(item.table);
    if (!migrationTable || !(APP_TABLES as readonly string[]).includes(item.table)) continue;
    for (const [constraintName, columns, referencedTable, , , role] of FINAL_SCHEMA_FOREIGN_KEYS[item.table as AppTable]) {
      if (role !== "retention_restrict") continue;
      const rootScope = RESTRICT_ROOT_SCOPES[referencedTable];
      if (!rootScope) continue;
      const structurallyNull = STRUCTURALLY_NULL_LINKS[item.table]?.[item.rowClass] ?? [];
      if (columns.some((column) => structurallyNull.includes(column))) continue;
      const admittedScopes: readonly DataScope[] = rootScope === "workspace" ? ["workspace", "profile"] : [rootScope];
      const covered = input.registry.some((entry) => {
        if (entry.table !== item.table || entry.rowClass !== item.rowClass || !admittedScopes.includes(entry.scope)) return false;
        const erases = entry.action === "cascade" || entry.action === "pseudonymise"
          || (entry.action === "delete_explicit" && entry.fieldSet.kind === "all_columns");
        if (!erases) return false;
        const fieldColumns = fieldSetColumns(entry, migrationTable.columns);
        return columns.every((column) => fieldColumns.includes(column));
      });
      if (!covered) failures.push(`restrict foreign key into scope root has no erasure coverage under that scope: ${item.table}.${item.rowClass}.${constraintName}`);
    }
  }
  for (const entry of input.registry.filter((candidate) => candidate.action === "cascade")) {
    const expected = expectedOwnershipEdge(entry);
    const scopeRoots = entry.scope === "system" ? [] : CASCADE_ROOT_ORDER[entry.scope];
    const isNamedRoot = scopeRoots.includes(entry.table as never);
    if (expected === null) {
      if (!isNamedRoot) failures.push(`cascade row has no compile-closed ownership edge: ${registryKey(entry)}`);
      continue;
    }
    const actual = migrationTables.get(entry.table)?.foreignKeys.find(
      (foreignKey) => foreignKey.constraintName === expected.constraintName
    );
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`cascade ownership edge mismatch: ${registryKey(entry)} / ${expected.constraintName}`);
      continue;
    }
    const reachesRoot = scopeRoots.includes(expected.referencedTable as never)
      || input.registry.some((candidate) =>
        candidate.table === expected.referencedTable
        && candidate.scope === entry.scope
        && candidate.action === "cascade"
        && expectedOwnershipEdge(candidate) !== null
      );
    if (!reachesRoot) failures.push(`cascade ownership edge does not reach scope root: ${registryKey(entry)}`);
  }
  const externalKeys = new Set<string>();
  for (const writer of input.externalWriters) {
    const key = `${writer.table}::${writer.owner}`;
    if (externalKeys.has(key)) failures.push(`duplicate external writer: ${key}`);
    externalKeys.add(key);
    if (!migrationTables.has(writer.table)) failures.push(`external writer table is absent from migrations: ${writer.table}`);
    if (!input.registry.some((entry) => entry.table === writer.table)) failures.push(`external writer table is absent from registry: ${writer.table}`);
    if (!writer.sourceFile || !writer.sourceToken) failures.push(`external writer has no source authority: ${key}`);
  }
  const supportingKeys = new Set<string>();
  for (const store of input.supportingStores) {
    if (supportingKeys.has(store.store)) failures.push(`duplicate supporting lifecycle store: ${store.store}`);
    supportingKeys.add(store.store);
    if (store.fields.length === 0) failures.push(`supporting lifecycle store has no governed fields: ${store.store}`);
    if (new Set(store.fields).size !== store.fields.length) failures.push(`supporting lifecycle store has duplicate governed fields: ${store.store}`);
    for (const path of store.governedJsonPaths) {
      const separator = path.indexOf("$");
      const column = path.slice(0, separator);
      if (separator < 1 || !path.slice(separator).startsWith("$.") || !store.fields.includes(column)) failures.push(`invalid supporting-store JSON path: ${store.store}.${path}`);
    }
    if (store.physicalKind === "job_table" || store.physicalKind === "dynamic_job_partition") {
      const governed = new Set(store.governedJsonPaths);
      if (governed.size !== PG_BOSS_JOB_JSON_PATHS.length
        || PG_BOSS_JOB_JSON_PATHS.some((path) => !governed.has(path))) {
        failures.push(`incomplete pg-boss job JSON path inventory: ${store.store}`);
      }
    }
    if (store.subjectBinding === "source_ids" && store.governedJsonPaths.length === 0 && !store.fields.some((field) => field === "job_id" || field === "job_attempt_id" || field === "trend_item_id" || field === "autopsy_cache_claim_id" || field === "id" || field === "child_id" || field === "parent_id" || field === "singleton_key")) failures.push(`source-bound supporting store has no identifier field/path: ${store.store}`);
    if (store.retention.length === 0) failures.push(`supporting lifecycle store has no retention: ${store.store}`);
    if (typeof input.executors[store.executor]?.execute !== "function") failures.push(`missing supporting-store executor: ${store.executor}`);
    if (!input.executors[store.executor]?.supportedActions.includes(store.action)) failures.push(`supporting-store executor/action mismatch: ${store.executor} cannot ${store.action}`);
    if (typeof input.probes[store.residueProbe]?.execute !== "function") failures.push(`missing supporting-store probe: ${store.residueProbe}`);
  }
  const classesByTable = new Map<string, Set<string>>();
  for (const item of input.rowClasses) {
    const set = classesByTable.get(item.table) ?? new Set<string>();
    if (set.has(item.rowClass)) failures.push(`duplicate row class inventory: ${item.table}.${item.rowClass}`);
    set.add(item.rowClass);
    classesByTable.set(item.table, set);
    if (item.discriminator) {
      const table = migrationTables.get(item.table);
      if (!table?.columns.includes(item.discriminator.column)) failures.push(`missing discriminator column: ${item.table}.${item.discriminator.column}`);
      if (item.discriminator.kind === "enum_value" && table?.columnTypes[item.discriminator.column] !== item.discriminator.enumName) failures.push(`wrong discriminator enum: ${item.table}.${item.discriminator.column}`);
      if (item.discriminator.kind === "nullness" && item.discriminator.enumName !== null) failures.push(`nullness discriminator names an enum: ${item.table}.${item.discriminator.column}`);
    }
  }
  for (const table of migrationTables.keys()) {
    const expected = classesByTable.get(table) ?? new Set<string>();
    const actual = new Set<string>(input.registry.filter((entry) => entry.table === table).map((entry) => entry.rowClass));
    for (const rowClass of expected) if (!actual.has(rowClass)) failures.push(`missing row class: ${table}.${rowClass}`);
    for (const rowClass of actual) if (!expected.has(rowClass)) failures.push(`unregistered row class: ${table}.${rowClass}`);
    if ((APP_TABLES as readonly string[]).includes(table)) {
      const compileClosed = new Set<string>(ROW_CLASSES_BY_TABLE[table as AppTable]);
      for (const rowClass of expected) if (!compileClosed.has(rowClass)) failures.push(`row class absent from compile-closed map: ${table}.${rowClass}`);
      for (const rowClass of compileClosed) if (!expected.has(rowClass)) failures.push(`compile-closed row class absent from inventory: ${table}.${rowClass}`);
    }
    const discriminated = input.rowClasses.filter((item) => item.table === table && item.discriminator !== null);
    if (discriminated.length > 0) {
      const kinds = new Set(discriminated.map((item) => item.discriminator!.kind));
      const columns = new Set(discriminated.map((item) => item.discriminator!.column));
      if (kinds.size !== 1 || columns.size !== 1 || discriminated.length !== expected.size) {
        failures.push(`incomplete discriminator inventory: ${table}`);
      } else if (discriminated[0].discriminator!.kind === "enum_value") {
        const enumName = discriminated[0].discriminator!.enumName;
        const migrationValues = new Set(input.migrations.enums[enumName ?? ""] ?? []);
        const registeredValues = new Set(discriminated.map((item) => item.discriminator!.value));
        const exclusionShapes = new Set(discriminated.map((item) => JSON.stringify({
          values: [...item.discriminator!.excludedEnumValues].sort(),
          sourceFile: item.discriminator!.exclusionSourceFile,
          sourceToken: item.discriminator!.exclusionSourceToken,
        })));
        if (exclusionShapes.size !== 1) failures.push(`inconsistent discriminator exclusions: ${table}`);
        const excludedValues = new Set(discriminated[0].discriminator!.excludedEnumValues);
        for (const value of registeredValues) if (excludedValues.has(value)) failures.push(`registered discriminator value is also excluded: ${table}.${value}`);
        for (const value of excludedValues) if (!migrationValues.has(value)) failures.push(`unknown excluded discriminator value: ${table}.${value}`);
        for (const value of migrationValues) if (!registeredValues.has(value) && !excludedValues.has(value)) failures.push(`unregistered discriminator value: ${table}.${value}`);
        for (const value of registeredValues) if (!migrationValues.has(value)) failures.push(`unknown discriminator value: ${table}.${value}`);
      } else {
        const nullnessValues = [...new Set(discriminated.map((item) => item.discriminator!.value))].sort();
        if (nullnessValues.join("\u0000") !== ["is_not_null", "is_null"].sort().join("\u0000")) failures.push(`incomplete nullness discriminator: ${table}`);
      }
    } else if (expected.size > 1) {
      failures.push(`mixed row classes have no discriminator: ${table}`);
    }
  }
  for (const item of input.rowClasses) {
    const table = migrationTables.get(item.table); if (!table) continue;
    const entries = input.registry.filter((entry) => entry.table === item.table && entry.rowClass === item.rowClass);
    const covered = new Set<string>();
    for (const entry of entries) {
      const fieldSet = entry.fieldSet;
      let columns: readonly string[];
      if (fieldSet.kind === "all_columns") { if (!item.permitsWholeRowFieldSet || entries.length !== 1) failures.push(`all_columns is not proven exclusive: ${registryKey(entry)}`); columns = table.columns; }
      else if (fieldSet.kind === "columns") columns = fieldSet.columns;
      else {
        const excluded: readonly string[] = fieldSet.excluding;
        columns = table.columns.filter((column) => !excluded.includes(column));
      }
      for (const column of columns) { if (!table.columns.includes(column)) failures.push(`unknown field: ${item.table}.${column}`); if (covered.has(column)) failures.push(`overlapping field set: ${item.table}.${item.rowClass}.${column}`); covered.add(column); }
    }
    for (const column of table.columns) if (!covered.has(column)) failures.push(`missing field: ${item.table}.${item.rowClass}.${column}`);
  }
  // THE COLUMN CENSUS. The loop above can never report a missing field for a
  // COMPUTED field set (`remaining_columns` / `all_columns`), because such a set
  // is defined as the table's own columns minus an exclusion list — so it
  // absorbs any newly added column and `covered` already contains it. That made
  // `ALTER TABLE ... ADD COLUMN` invisible to this gate, which C1 requires it to
  // fail. The census is the declared LIST the migrations are compared against.
  for (const [table, declared] of Object.entries(LIFECYCLE_COLUMN_CENSUS)) {
    const actual = migrationTables.get(table);
    if (!actual) { failures.push(`census names a table absent from migrations: ${table}`); continue; }
    const declaredSet = new Set(declared);
    const actualSet = new Set(actual.columns);
    for (const column of actualSet) {
      if (!declaredSet.has(column)) {
        failures.push(
          `uncensused column: ${table}.${column} — a computed field set would absorb it silently. ` +
            `Add it to LIFECYCLE_COLUMN_CENSUS and decide which field set governs it.`
        );
      }
    }
    for (const column of declaredSet) {
      if (!actualSet.has(column)) failures.push(`census names a column absent from migrations: ${table}.${column}`);
    }
  }
  // EXPORT CLAIMS MUST BE HONOURABLE. `exportProjector` names three projectors
  // and only `profile_creator` is built (`export.ts` keys `exportPlan` off it).
  // This entry marked `credit_ledger` `included` under the unbuilt
  // `workspace_owner`, which is a creator-facing export claim no code can
  // honour — a table declared into an export it never joins. An unbuilt
  // projector may exist in the type, but nothing may be `included` under it.
  for (const entry of input.registry) {
    if (entry.export !== "included") continue;
    if (!(BUILT_EXPORT_PROJECTORS as readonly string[]).includes(entry.exportProjector)) {
      failures.push(
        `export claim with no projector: ${registryKey(entry)} is "included" under "${entry.exportProjector}", ` +
          `which is declared but not built. Build the projector, or mark the entry excluded until the slice that does.`
      );
    }
  }
  // And every table that USES a computed field set must be censused at all.
  for (const entry of input.registry) {
    if (entry.fieldSet.kind === "columns") continue;
    if (!(entry.table in LIFECYCLE_COLUMN_CENSUS)) {
      failures.push(`table uses a computed field set but is absent from LIFECYCLE_COLUMN_CENSUS: ${entry.table}`);
    }
  }
  for (const jsonPath of input.jsonPaths) {
    const table = migrationTables.get(jsonPath.table);
    if (!table?.columns.includes(jsonPath.column)) failures.push(`missing JSON column/path: ${jsonPath.table}.${jsonPath.column}${jsonPath.path}`);
    if (!jsonPath.path.startsWith("$")) failures.push(`invalid JSON path: ${jsonPath.table}.${jsonPath.column}${jsonPath.path}`);
    if (!classesByTable.has(jsonPath.table)) failures.push(`JSON path has no row-class inventory: ${jsonPath.table}.${jsonPath.column}${jsonPath.path}`);
    if (!input.registry.some((entry) => entry.table === jsonPath.table && entry.governedJsonPaths.includes(`${jsonPath.column}${jsonPath.path}`))) failures.push(`unregistered JSON path: ${jsonPath.table}.${jsonPath.column}${jsonPath.path}`);
  }
  for (const entry of input.registry) for (const path of entry.governedJsonPaths) if (!input.jsonPaths.some((candidate) => candidate.table === entry.table && `${candidate.column}${candidate.path}` === path)) failures.push(`missing JSON path inventory: ${entry.table}.${path}`);
  const migrationJsonColumns = new Set(
    input.migrations.tables.flatMap((table) => Object.entries(table.columnTypes)
      .filter(([, type]) => type === "json" || type === "jsonb")
      .map(([column]) => `${table.name}.${column}`))
  );
  const registeredJsonColumns = new Set<string>();
  for (const item of input.jsonColumns) {
    const key = `${item.table}.${item.column}`;
    if (registeredJsonColumns.has(key)) failures.push(`duplicate JSON column classification: ${key}`);
    registeredJsonColumns.add(key);
    if (!migrationJsonColumns.has(key)) failures.push(`classified JSON column is absent from migrations: ${key}`);
    const paths = input.jsonPaths.filter((path) => path.table === item.table && path.column === item.column);
    if (item.classification === "identifier_paths" && paths.length === 0) failures.push(`identifier JSON column has no paths: ${key}`);
    if (item.classification !== "identifier_paths" && paths.length > 0) failures.push(`non-identifier JSON column has identifier paths: ${key}`);
  }
  for (const key of migrationJsonColumns) if (!registeredJsonColumns.has(key)) failures.push(`unclassified migration JSON column: ${key}`);
  if (failures.length) throw new Error(failures.sort().join("\n"));
}
/**
 * The dynamic writers the AST writer scanner cannot see: modules that render
 * DELETE/UPDATE against table names computed at runtime, naming no table in
 * source. Their coverage is registry closure (`validateLifecycleClosure`) and
 * the retention-clock closure, plus the independent residue probes, exercised
 * on populated fixtures — stated here so no reader takes the scanner's silence
 * for absence.
 *
 * A LIST, AND IT HAS TWO ENTRIES. This was a single record called "the ONE
 * dynamic writer" while `retention-receiver.ts` had become a second one:
 * `sql.raw` table names driving `DELETE FROM ${table}` and
 * `UPDATE ${table} SET ...` across roughly fifteen governed tables, present in
 * no `physicalWriters` list of any table it destroys. The second producer was
 * absorbed by adding a line to a DIFFERENT allowlist instead of to this
 * population — precisely the shape CLAUDE.md Respin rule 7 forbids, and the
 * reason that rule says a population is a list rather than a producer. A
 * singular constant cannot hold two, so the type is what changed.
 */
/**
 * The export projectors that actually EXIST. `exportProjector` declares three;
 * `export.ts` builds one. Listing the built ones separately is what lets
 * `validateLifecycleClosure` refuse an `included` disposition that no code can
 * honour, instead of the type quietly implying all three work.
 */
export const BUILT_EXPORT_PROJECTORS = ["profile_creator"] as const;

export const DYNAMIC_LIFECYCLE_WRITERS = [
  {
    file: "packages/db/src/lifecycle-sql-port.ts",
    actions: ["cascade", "delete_explicit", "pseudonymise"],
    why: "the registry-driven erasure port; listed as a physical writer only for the roots it INSERTs stubs into (scannable literals)",
  },
  {
    file: "packages/db/src/retention-receiver.ts",
    actions: ["delete_explicit", "pseudonymise"],
    why: "the retention sweep; renders DELETE/UPDATE for every governed table through sql.raw, covered by assertRetentionClockClosure rather than by the AST scanner",
  },
] as const satisfies readonly Readonly<{ file: string; actions: readonly LifecycleAction[]; why: string }>[];

/**
 * Independent logical-writer inventory. Keep this separate from the registry:
 * deriving it from `LIFECYCLE_REGISTRY` would make a missing or invented owner
 * validate itself. `tests/table-writers.test.ts` bridges these logical owners
 * to the AST-discovered physical writer population; the dynamic writer above
 * is outside that population by construction.
 */
export const LIFECYCLE_WRITER_INVENTORY = [
  { table: "account", owner: "packages/auth", physicalWriters: [] },
  { table: "activation_cohort_daily", owner: "packages/db/src/activation.ts", physicalWriters: ["packages/db/src/activation.ts"] },
  { table: "auth_mail_outbox", owner: "packages/db/src/auth-mail.ts", physicalWriters: ["packages/db/src/auth-mail.ts"] },
  { table: "auto_topup_protocol_rollouts", owner: "packages/credits/src/stripe/auto-topup-rollout.ts", physicalWriters: ["packages/credits/src/stripe/auto-topup-rollout.ts"] },
  { table: "tier_checkout_protocol_rollouts", owner: "packages/credits/src/stripe/tier-checkout-rollout.ts", physicalWriters: ["packages/credits/src/stripe/tier-checkout-rollout.ts"] },
  { table: "autopsies", owner: "packages/db/src/system-spend.ts", physicalWriters: ["packages/db/src/system-spend.ts"] },
  { table: "autopsy_cache_claims", owner: "packages/db/src/trends-storage.ts", physicalWriters: ["packages/db/src/deletion-lifecycle.ts", "packages/db/src/system-spend.ts", "packages/db/src/trends-storage.ts"] },
  { table: "brain_activation_snapshots", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/with-workspace.ts"] },
  { table: "brain_docs", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/with-workspace.ts"] },
  { table: "config_versions", owner: "packages/config/src", physicalWriters: ["packages/config/src/index.ts", "packages/db/src/seed.ts"] },
  { table: "creator_profiles", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/deletion-lifecycle.ts", "packages/db/src/lifecycle-sql-port.ts", "packages/db/src/with-workspace.ts"] },
  { table: "credit_ledger", owner: "packages/credits", physicalWriters: ["packages/credits/src/balance.ts", "packages/credits/src/ledger.ts"] },
  { table: "deletion_cancellation_proofs", owner: "packages/db/src/auth-lifecycle.ts", physicalWriters: ["packages/db/src/auth-lifecycle.ts", "packages/db/src/deletion-lifecycle.ts"] },
  { table: "deletion_external_commands", owner: "packages/db/src/deletion-external-commands.ts", physicalWriters: ["packages/db/src/deletion-external-commands.ts"] },
  { table: "deletion_membership_snapshots", owner: "packages/db/src/deletion-lifecycle.ts", physicalWriters: ["packages/db/src/deletion-lifecycle.ts"] },
  { table: "deletion_operation_transitions", owner: "packages/db/src/deletion-lifecycle.ts", physicalWriters: ["packages/db/src/deletion-lifecycle.ts"] },
  { table: "deletion_operations", owner: "packages/db/src/deletion-lifecycle.ts", physicalWriters: ["packages/db/src/activation.ts", "packages/db/src/deletion-executor.ts", "packages/db/src/deletion-lifecycle.ts"] },
  { table: "deletion_recovery_sessions", owner: "packages/db/src/auth-lifecycle.ts", physicalWriters: ["packages/db/src/auth-lifecycle.ts"] },
  { table: "creative_pieces", owner: "packages/db/src/creative-work-ops.ts", physicalWriters: ["packages/db/src/creative-work-ops.ts"] },
  { table: "first_billable_attempts", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/with-workspace.ts"] },
  { table: "frameworks", owner: "packages/db/src/frameworks.ts", physicalWriters: ["packages/db/src/frameworks.ts"] },
  // Task 6 adds the worker-side attempt receiver as a SECOND physical writer.
  // The owner is unchanged: settlement (the debit) stays in with-workspace.ts,
  // and the receiver only moves rows no session owns.
  { table: "generation_attempts", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/generation-recovery.ts", "packages/db/src/with-workspace.ts"] },
  { table: "generation_feedback", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/with-workspace.ts"] },
  { table: "generations", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/with-workspace.ts"] },
  { table: "membership_profile_selections", owner: "packages/db/src/profile-selection.ts", physicalWriters: ["packages/db/src/profile-selection.ts"] },
  { table: "memberships", owner: "packages/db/src/bootstrap.ts", physicalWriters: ["packages/db/src/bootstrap.ts", "packages/db/src/deletion-lifecycle.ts", "packages/db/src/seed.ts"] },
  { table: "model_usage", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/with-workspace.ts"] },
  { table: "onboarding_inputs", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/promotion-ops.ts", "packages/db/src/with-workspace.ts"] },
  { table: "onboarding_interview_drafts", owner: "packages/db/src/interview-ops.ts", physicalWriters: ["packages/db/src/interview-ops.ts"] },
  { table: "pause_periods", owner: "packages/credits/src/pause.ts", physicalWriters: ["packages/credits/src/pause.ts"] },
  { table: "promotion_proposals", owner: "packages/db/src/promotion-ops.ts", physicalWriters: ["packages/db/src/promotion-ops.ts", "packages/db/src/promotion-audit.ts"] },
  { table: "proposal_evidence_feedback", owner: "packages/db/src/promotion-ops.ts", physicalWriters: ["packages/db/src/promotion-ops.ts"] },
  { table: "proposal_evidence_results", owner: "packages/db/src/promotion-ops.ts", physicalWriters: ["packages/db/src/promotion-ops.ts"] },
  { table: "public_sample_spin_buckets", owner: "packages/db/src/public-sample-spin.ts", physicalWriters: ["packages/db/src/public-sample-spin.ts"] },
  { table: "rate_limit", owner: "packages/auth", physicalWriters: ["packages/db/src/auth-lifecycle.ts"] },
  { table: "results", owner: "packages/db/src/with-workspace.ts", physicalWriters: ["packages/db/src/with-workspace.ts"] },
  { table: "session", owner: "packages/auth", physicalWriters: ["packages/db/src/auth-lifecycle.ts", "packages/db/src/deletion-lifecycle.ts"] },
  // `retention-receiver.ts` is here because its subject-erasure payload purge
  // names the table in SOURCE (the dynamic sweep in the same file does not, and
  // is covered by DYNAMIC_LIFECYCLE_WRITERS instead). The tenancy review found
  // this file in NO physicalWriters list of any table it writes.
  { table: "stripe_events", owner: "packages/credits/src/stripe/webhooks.ts", physicalWriters: ["packages/credits/src/stripe/webhooks.ts", "packages/db/src/deletion-executor.ts", "packages/db/src/retention-receiver.ts"] },
  { table: "stripe_finance_extracts", owner: "packages/db/src/finance-extract.ts", physicalWriters: ["packages/db/src/finance-extract.ts"] },
  { table: "subscriptions", owner: "packages/credits/src/stripe", physicalWriters: ["packages/credits/src/pause.ts", "packages/credits/src/stripe/actions.ts", "packages/credits/src/stripe/auto-topup-rollout.ts", "packages/credits/src/stripe/billing-contact.ts", "packages/credits/src/stripe/auto-topup-v1-reconcile.ts", "packages/credits/src/stripe/auto-topup.ts", "packages/credits/src/stripe/customers.ts", "packages/credits/src/stripe/deletion-commands.ts", "packages/credits/src/stripe/tier-checkout-rollout.ts", "packages/credits/src/stripe/tier-checkout-v1-reconcile.ts", "packages/credits/src/stripe/webhooks.ts"] },
  { table: "system_model_usage", owner: "packages/db/src/system-spend.ts", physicalWriters: ["packages/db/src/system-spend.ts"] },
  { table: "system_model_usage_reconciliations", owner: "packages/db/src/system-spend.ts", physicalWriters: ["packages/db/src/system-spend.ts"] },
  { table: "system_spend_claims", owner: "packages/db/src/system-spend.ts", physicalWriters: ["packages/db/src/system-spend.ts"] },
  { table: "system_spend_daily", owner: "packages/db/src/system-spend.ts", physicalWriters: ["packages/db/src/system-spend.ts"] },
  { table: "system_worker_health", owner: "packages/db/src/system-spend.ts", physicalWriters: ["packages/db/src/system-spend.ts"] },
  { table: "tracked_niches", owner: "packages/db/src/trends-storage.ts", physicalWriters: ["packages/db/src/trends-storage.ts"] },
  { table: "trend_items", owner: "packages/db/src/trends-storage.ts", physicalWriters: ["packages/db/src/trends-storage.ts"] },
  { table: "trend_sources", owner: "packages/db/src/trends-storage.ts", physicalWriters: ["packages/db/src/trends-storage.ts"] },
  { table: "trend_transcripts", owner: "packages/db/src/trends-storage.ts", physicalWriters: ["packages/db/src/trends-storage.ts"] },
  { table: "user", owner: "packages/auth", physicalWriters: ["packages/db/src/deletion-lifecycle.ts", "packages/db/src/lifecycle-sql-port.ts", "packages/db/src/seed.ts", "packages/db/src/testing.ts"] },
  { table: "users", owner: "packages/db/src/bootstrap.ts", physicalWriters: ["packages/db/src/bootstrap.ts", "packages/db/src/deletion-lifecycle.ts", "packages/db/src/lifecycle-sql-port.ts", "packages/db/src/seed.ts"] },
  // R-164: the Google re-authentication challenge's single-use state rows
  // (`respin-google-reauth:<id>`) — written at the start of the challenge,
  // deleted as they are read. They carry no user id, only a session digest,
  // the PKCE verifier and the nonce, and expire with R-118's window.
  { table: "verification", owner: "packages/auth", physicalWriters: ["packages/db/src/auth-lifecycle.ts"] },
  { table: "workspaces", owner: "packages/db/src/bootstrap.ts", physicalWriters: ["packages/db/src/bootstrap.ts", "packages/db/src/deletion-lifecycle.ts", "packages/db/src/lifecycle-sql-port.ts", "packages/db/src/seed.ts"] },
  { table: "workspace_spend_monthly", owner: "packages/db/src/spend-rollup.ts", physicalWriters: ["packages/db/src/spend-rollup.ts"] },
] as const satisfies readonly LifecycleWriterInventoryEntry[];

export const EXTERNAL_WRITER_AUTHORITIES = [
  { table: "account", owner: "better_auth_drizzle_adapter", sourceFile: "packages/auth/src/create-auth.ts", sourceToken: "drizzleAdapter" },
  { table: "rate_limit", owner: "better_auth_database_rate_limiter", sourceFile: "packages/auth/src/create-auth.ts", sourceToken: "rateLimit" },
  { table: "session", owner: "better_auth_drizzle_adapter", sourceFile: "packages/auth/src/create-auth.ts", sourceToken: "drizzleAdapter" },
  { table: "user", owner: "better_auth_drizzle_adapter", sourceFile: "packages/auth/src/create-auth.ts", sourceToken: "drizzleAdapter" },
  { table: "verification", owner: "better_auth_drizzle_adapter", sourceFile: "packages/auth/src/create-auth.ts", sourceToken: "drizzleAdapter" },
] as const satisfies readonly ExternalWriterAuthority[];

/**
 * Pg-boss owns tables in its own schema at runtime rather than through the
 * application migration journal. Keeping that store in an explicit lifecycle
 * classification prevents the migration-table bijection from making it
 * invisible merely because the dependency owns its DDL.
 */
export const PG_BOSS_JOB_FIELDS = [
  "blocked", "blocking", "completed_on", "created_on", "data", "dead_letter",
  "deletion_seconds", "expire_seconds", "group_id", "group_tier", "heartbeat_on",
  "heartbeat_seconds", "id", "keep_until", "name", "output", "pending_dependencies",
  "policy", "priority", "retry_backoff", "retry_count", "retry_delay", "retry_delay_max",
  "retry_limit", "singleton_key", "singleton_on", "source_created_on", "source_id",
  "source_name", "source_retry_count", "start_after", "started_on", "state",
] as const;
export const PG_BOSS_QUEUE_STATS_FIELDS = [
  "active_count", "captured_on", "deferred_count", "failed_count", "id", "name",
  "queued_count", "ready_count", "total_count",
] as const;
export const PG_BOSS_JOB_JSON_PATHS = [
  "data$.jobId",
  "data$.itemId",
  "data$.attemptId",
  "data$.autopsyCacheClaimId",
  "data$.runId",
] as const;

const pgBossStore = (
  store: string,
  physicalKind: SupportingLifecycleStoreEntry["physicalKind"],
  fields: readonly string[],
  lifecycle: "persistent_control" | "expiring_runtime",
  subjectBinding: SupportingLifecycleStoreEntry["subjectBinding"] = "installation",
  governedJsonPaths: readonly string[] = []
): SupportingLifecycleStoreEntry => ({
  store,
  physicalKind,
  fields,
  scope: "system",
  writerOwner: "worker/pg-boss-runtime.ts",
  sourceToken: "PgBoss",
  action: lifecycle === "persistent_control" ? "not_applicable" : "delete_explicit",
  retention: lifecycle === "persistent_control" ? "installation_lifetime" : "operational_90_days",
  executor: lifecycle === "persistent_control" ? "system_retention" : "expiry_receiver",
  residueProbe: lifecycle === "persistent_control" ? "system_residue" : "expiry_residue",
  governedJsonPaths,
  subjectBinding,
});

/**
 * Exact pg-boss 12.29.0 physical table/column inventory. The two wildcard
 * entries represent relations whose names are created dynamically by
 * `plans.js`: per-queue job partitions and daily queue-stats partitions.
 * Focused tests compare every fixed/job column and both partition templates
 * to the installed dependency, so a dependency DDL change cannot stay green.
 */
export const SUPPORTING_LIFECYCLE_STORES = [
  pgBossStore("pgboss.bam", "fixed_table", ["command", "completed_on", "created_on", "error", "id", "name", "queue", "started_on", "status", "table_name", "version"], "persistent_control"),
  pgBossStore("pgboss.job_dependency", "fixed_table", ["child_id", "child_name", "parent_id", "parent_name"], "expiring_runtime", "source_ids"),
  pgBossStore("pgboss.queue", "fixed_table", ["active_count", "created_on", "dead_letter", "deferred_count", "deletion_seconds", "expire_seconds", "failed_count", "heartbeat_seconds", "maintain_on", "monitor_on", "name", "notify", "partition", "policy", "queued_count", "ready_count", "ready_history", "retention_seconds", "retry_backoff", "retry_delay", "retry_delay_max", "retry_limit", "singletons_active", "table_name", "total_count", "updated_on", "warning_queued"], "persistent_control"),
  pgBossStore("pgboss.queue_stats", "fixed_table", PG_BOSS_QUEUE_STATS_FIELDS, "expiring_runtime"),
  pgBossStore("pgboss.schedule", "fixed_table", ["created_on", "cron", "data", "key", "name", "options", "timezone", "updated_on"], "persistent_control"),
  pgBossStore("pgboss.subscription", "fixed_table", ["created_on", "event", "name", "updated_on"], "persistent_control"),
  pgBossStore("pgboss.version", "fixed_table", ["bam_on", "cron_on", "flow_on", "reindex_on", "version"], "persistent_control"),
  pgBossStore("pgboss.warning", "fixed_table", ["created_on", "data", "id", "message", "type"], "expiring_runtime"),
  pgBossStore("pgboss.job", "job_table", PG_BOSS_JOB_FIELDS, "expiring_runtime", "source_ids", PG_BOSS_JOB_JSON_PATHS),
  pgBossStore("pgboss.job_common", "job_table", PG_BOSS_JOB_FIELDS, "expiring_runtime", "source_ids", PG_BOSS_JOB_JSON_PATHS),
  pgBossStore("pgboss.job_partition:*", "dynamic_job_partition", PG_BOSS_JOB_FIELDS, "expiring_runtime", "source_ids", PG_BOSS_JOB_JSON_PATHS),
  pgBossStore("pgboss.queue_stats_partition:*", "dynamic_queue_stats_partition", PG_BOSS_QUEUE_STATS_FIELDS, "expiring_runtime"),
] as const satisfies readonly SupportingLifecycleStoreEntry[];

export type ExportDecision = { included: boolean; reason: string };
/** @deprecated Export compatibility only. Deletion code must use LIFECYCLE_REGISTRY. */
export type DeletionDecision = { behaviour: "cascade" | "retained" | "pseudonymised"; reason: string; legacyProjectionOnly: true };
export type CreatorDataEntry = { table: string; holdsCreatorContent: boolean; export: ExportDecision; deletion: DeletionDecision };
const LEGACY_CREATOR_DATA_TABLES = new Set<AppTable>([
  ...LIFECYCLE_REGISTRY.filter((entry) => entry.scope === "profile").map((entry) => entry.table),
  "membership_profile_selections",
  "workspace_spend_monthly",
]);
/**
 * The legacy projection, as a FUNCTION of the lifecycle registry (P5-R7), so a
 * test can derive it from a registry with a planted entry and watch the
 * derived content set move. Production takes the defaults.
 */
export function deriveCreatorDataRegistry(
  registry: readonly LifecycleClassEntry[] = LIFECYCLE_REGISTRY,
  tables: readonly string[] = APP_TABLES
): readonly CreatorDataEntry[] {
  const legacy = new Set<string>([
    ...registry.filter((entry) => entry.scope === "profile").map((entry) => entry.table),
    "membership_profile_selections",
    "workspace_spend_monthly",
  ]);
  return tables.filter((table) => legacy.has(table)).map((table) => creatorDataEntryFrom(registry, table));
}

function creatorDataEntryFrom(registry: readonly LifecycleClassEntry[], table: string): CreatorDataEntry {
  const entries = registry.filter((entry) => entry.table === table);
  const included = entries.some((entry) => entry.export === "included" && entry.exportProjector === "profile_creator");
  // `holdsCreatorContent` IS `export.included` (audit P5-R7, R-162): DERIVED
  // from LIFECYCLE_REGISTRY, never a hand-written Set beside it. The Set this
  // replaced (`PROFILE_CONTENT`, 16 names on 2026-10-06) lagged the registry by
  // exactly three tables — `brain_activation_snapshots`,
  // `proposal_evidence_results`, `proposal_evidence_feedback` — each a
  // `profile(…, true)` entry the registry already ships in the creator's
  // export as `profile_creator` rows citing the creator's own docs, results
  // and feedback: content, decided. A new `profile(…, true)` entry therefore
  // reports content at once, and `tests/creator-data-registry.test.ts` pins
  // the derived list so the change is seen.
  const pseudonymised = entries.some((entry) => entry.action === "pseudonymise");
  const retained = entries.every((entry) => entry.action === "retain_financial" || entry.action === "not_applicable");
  return { table, holdsCreatorContent: included, export: { included, reason: included ? "The lifecycle registry assigns this table to the profile_creator projector, preserving the established scoped profile export." : "The lifecycle registry assigns no profile_creator projector to this table; identity, workspace, secret and system rows stay outside the profile export." }, deletion: { behaviour: table === "workspace_spend_monthly" ? "retained" : pseudonymised ? "pseudonymised" : retained ? "retained" : "cascade", legacyProjectionOnly: true, reason: table === "workspace_spend_monthly" ? "Legacy export compatibility only: financial records are retained for the dependency-aware clock and the workspace identifier is pseudonymised. Deletion executors must use LIFECYCLE_REGISTRY." : "Legacy export compatibility only: mixed row and field classes are intentionally collapsed here. Deletion executors must use LIFECYCLE_REGISTRY as the sole lifecycle authority." } };
}
export const CREATOR_DATA_REGISTRY: readonly CreatorDataEntry[] = deriveCreatorDataRegistry();
export function creatorDataEntry(table: string): CreatorDataEntry | undefined { return CREATOR_DATA_REGISTRY.find((entry) => entry.table === table); }
export const NOT_CREATOR_DATA: Readonly<Record<string, string>> = Object.fromEntries(
  APP_TABLES.filter((table) => !LEGACY_CREATOR_DATA_TABLES.has(table)).map((table) => [
    table,
    "The lifecycle registry classifies this supporting identity, workspace, billing, authentication, or system table outside the legacy profile-creator export while retaining its explicit scope and lifecycle decisions.",
  ])
);

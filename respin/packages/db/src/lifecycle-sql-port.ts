// Phase 10b-1 Task 4.3 — the SQL ports behind the registry executors/probes.
//
// `createSqlLifecycleMutationPort` turns a compiled `LifecycleExecutionTarget`
// into real DELETE/UPDATE statements inside the erasure transaction.
// `createSqlResidueProbePort` counts what a compiled probe says must be gone.
// The two share NO predicate renderer on purpose: the registry keeps executor
// and probe derivations independent, and a shared SQL helper would let one
// bug make both agree (plan C1).
//
// Pseudonymisation follows R-122: retained receipts keep their random
// operation ids and business facts, and every link to the deleted subject is
// either nulled or repointed at a fresh random STUB root created in this
// transaction (mapping discarded). The stub exists because the deletion
// projection tables carry RESTRICT foreign keys to the root and CHECKs that
// forbid a null target — a receipt that named the old id would be a
// re-linkable copy, and a receipt with no row behind it cannot exist.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { TxLike } from "./db-like";
import type { ExecutorId } from "./creator-data-registry";
import type {
  LifecycleExecutionTarget,
  LifecycleMutationPort,
  LifecycleRuntimeSubjects,
  LifecycleSnapshotSet,
  LifecycleSubject,
  LifecycleSubjectField,
  LifecycleSubjectPredicate,
} from "./lifecycle-executors";
import type { MigrationInventory } from "./lifecycle-inventory";
import type { ExpectedResidueProbe, ResidueProbePort } from "./lifecycle-probes";
import type { DeletionScope } from "./lifecycle-schema";
import { pseudonymiseWorkspaceSpend } from "./spend-rollup";

export class LifecycleExecutorRefusal extends Error {
  constructor(readonly code: string) {
    super(`lifecycle_executor_refused:${code}`);
    this.name = "LifecycleExecutorRefusal";
  }
}

function refuse(code: string): never {
  throw new LifecycleExecutorRefusal(code);
}

/** The worker's pg-boss schema; the registry labels those stores `pgboss.*`. */
export const PG_BOSS_PHYSICAL_SCHEMA = "respin_worker";
const PG_BOSS_LOGICAL_PREFIX = "pgboss.";

const ROOT_TABLES = new Set(["users", "user", "workspaces", "creator_profiles"]);
/** Domain identity before auth identity: users.auth_user_id is RESTRICT. */
const ROOT_DELETE_ORDER: Readonly<Record<DeletionScope, readonly string[]>> = {
  identity: ["users", "user"],
  profile: ["creator_profiles"],
  workspace: ["workspaces"],
};
const DELETION_PROJECTION_TABLES = new Set([
  "deletion_operations",
  "deletion_operation_transitions",
  "deletion_membership_snapshots",
  "deletion_external_commands",
]);

type LinkRoot = "identity" | "auth_identity" | "workspace" | "profile";
const LINK_COLUMNS: Readonly<Record<string, LinkRoot>> = {
  user_id: "identity",
  requester_user_id: "identity",
  // R-166: the canceller of a scoped deletion, scrubbed like the requester.
  cancelled_by_user_id: "identity",
  rights_subject_user_id: "identity",
  confirmed_by: "identity",
  decision_user_id: "identity",
  auth_user_id: "auth_identity",
  workspace_id: "workspace",
  profile_id: "profile",
  owner_profile_id: "profile",
};
const SCOPE_OF_LINK: Readonly<Record<LinkRoot, DeletionScope>> = {
  identity: "identity",
  auth_identity: "identity",
  workspace: "workspace",
  profile: "profile",
};

export type ColumnMeta = Readonly<{ nullable: boolean; udt: string }>;
export type TableMeta = Readonly<{
  schema: string;
  table: string;
  columns: ReadonlyMap<string, ColumnMeta>;
}>;

export async function loadTableMetaInTx(tx: TxLike): Promise<ReadonlyMap<string, TableMeta>> {
  const result = (await tx.execute(sql`
    SELECT table_schema, table_name, column_name, is_nullable, udt_name
    FROM information_schema.columns
    WHERE table_schema IN ('public', ${PG_BOSS_PHYSICAL_SCHEMA})
  `)) as unknown as {
    rows: { table_schema: string; table_name: string; column_name: string; is_nullable: string; udt_name: string }[];
  };
  const tables = new Map<string, { schema: string; table: string; columns: Map<string, ColumnMeta> }>();
  for (const row of result.rows) {
    const key = row.table_schema === "public" ? row.table_name : `${row.table_schema}.${row.table_name}`;
    const entry = tables.get(key) ?? { schema: row.table_schema, table: row.table_name, columns: new Map() };
    entry.columns.set(row.column_name, { nullable: row.is_nullable === "YES", udt: row.udt_name });
    tables.set(key, entry);
  }
  return tables;
}

function physicalTable(storeOrTable: string): Readonly<{ schema: string; table: string; key: string }> {
  if (storeOrTable.startsWith(PG_BOSS_LOGICAL_PREFIX)) {
    const table = storeOrTable.slice(PG_BOSS_LOGICAL_PREFIX.length).replace(/:\*$/, "");
    return { schema: PG_BOSS_PHYSICAL_SCHEMA, table, key: `${PG_BOSS_PHYSICAL_SCHEMA}.${table}` };
  }
  return { schema: "public", table: storeOrTable, key: storeOrTable };
}

function relation(schema: string, table: string): SQL {
  return sql`${sql.identifier(schema)}.${sql.identifier(table)}`;
}

function inList(values: readonly string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

function subjectValue(subject: LifecycleSubject, field: LifecycleSubjectField): string {
  const value = (subject as unknown as Record<string, unknown>)[field];
  if (typeof value !== "string" || value.length === 0) refuse(`subject_field_missing:${field}`);
  return value;
}

function snapshotValues(subject: LifecycleSubject, set: LifecycleSnapshotSet): readonly string[] {
  if (set === "workspace.stripeEventIds") {
    return subject.scope === "workspace" ? subject.stripeEventIds : [];
  }
  if (subject.scope !== "related") return [];
  const field = set.split(".").at(-1) as keyof typeof subject.activeSubject.sourceIds;
  return subject.activeSubject.sourceIds[field];
}

function randomHex64(): string {
  return randomBytes(32).toString("hex");
}

function randomToken(prefix: string): string {
  return `${prefix}${randomBytes(16).toString("hex")}`;
}

/**
 * Discriminator + subject predicate, rendered for the EXECUTOR. Returns null
 * when the predicate can match nothing (an empty snapshot set), so the caller
 * skips the statement instead of running `WHERE FALSE` against the table.
 */
function executorWhere(
  target: Pick<LifecycleExecutionTarget, "selector" | "subject" | "subjectPredicate">
): SQL | null {
  const parts: SQL[] = [];
  const discriminator = target.selector.discriminator;
  if (discriminator) {
    const column = sql.identifier(discriminator.column);
    parts.push(
      discriminator.operator === "equals"
        ? sql`${column} = ${discriminator.value}`
        : discriminator.operator === "is_null"
          ? sql`${column} IS NULL`
          : sql`${column} IS NOT NULL`
    );
  }
  const predicate = target.subjectPredicate;
  if (predicate.kind === "unscoped") refuse("unscoped_target_not_executable");
  if (predicate.kind === "direct" || predicate.kind === "composite") {
    for (const match of predicate.matches) {
      parts.push(sql`${sql.identifier(match.column)} = ${subjectValue(target.subject, match.subjectField)}`);
    }
  } else if (predicate.kind === "snapshot_pairs") {
    if (target.subject.scope !== "identity") refuse("snapshot_pairs_wrong_subject");
    const rows = target.subject.verificationRows;
    if (rows.length === 0) return null;
    parts.push(
      sql`(${sql.identifier(predicate.identifierColumn)}, ${sql.identifier(predicate.valueColumn)}) IN (${sql.join(
        rows.map((row) => sql`(${row.identifier}, ${row.value})`),
        sql`, `
      )})`
    );
  } else {
    const alternatives: SQL[] = [];
    for (const match of predicate.matches) {
      const values = snapshotValues(target.subject, match.subjectSet);
      if (values.length === 0) continue;
      const location = match.location;
      const expression = location.kind === "column"
        ? sql`${sql.identifier(location.column)}::text`
        : sql`${sql.identifier(location.column)}->>${location.path.slice(2)}`;
      alternatives.push(sql`${expression} IN (${inList(values)})`);
    }
    if (alternatives.length === 0) return null;
    parts.push(sql`(${sql.join(alternatives, sql` OR `)})`);
  }
  return sql.join(parts, sql` AND `);
}

export type ErasureReceipt = Readonly<{
  executed: readonly Readonly<{ registryKey: string; action: string; rows: number }>[];
  skipped: readonly Readonly<{ registryKey: string; reason: string }>[];
  stubs: Readonly<Partial<Record<LinkRoot, string>>>;
}>;

export type SqlMutationContext = Readonly<{
  scope: DeletionScope;
  subjects: LifecycleRuntimeSubjects;
  meta: ReadonlyMap<string, TableMeta>;
  migrations: MigrationInventory;
  /** For profile operations: the workspace the stub profile is created in. */
  profileStubWorkspaceId?: string;
}>;

/**
 * FK-aware ordering: a table that references another is emptied first, so a
 * RESTRICT edge (trend_items.source_id, autopsy_cache_claims.autopsy_id)
 * never blocks a delete that the registry says must happen. Roots come last,
 * in the scope's fixed order.
 */
export function orderTargetsForExecution(
  targets: readonly LifecycleExecutionTarget[],
  scope: DeletionScope,
  migrations: MigrationInventory
): readonly LifecycleExecutionTarget[] {
  const references = new Map<string, Set<string>>();
  for (const table of migrations.tables) {
    references.set(table.name, new Set(table.foreignKeys.map((fk) => fk.referencedTable)));
  }
  const tables = [...new Set(targets.map((target) => target.table))];
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (table: string) => {
    if (visited.has(table)) return;
    if (visiting.has(table)) return; // cycles (self-references) resolve by statement order
    visiting.add(table);
    // Tables that reference THIS one must be emptied before it.
    for (const other of tables) {
      if (other !== table && references.get(other)?.has(table)) visit(other);
    }
    visiting.delete(table);
    visited.add(table);
    order.push(table);
  };
  for (const table of tables) visit(table);
  const rank = new Map(order.map((table, index) => [table, index]));
  const roots = ROOT_DELETE_ORDER[scope];
  const actionRank = (target: LifecycleExecutionTarget) =>
    target.action === "pseudonymise" ? 0 : target.action === "delete_explicit" ? 1 : target.action === "cascade" ? 2 : 3;
  return [...targets].sort((left, right) => {
    const leftRoot = roots.indexOf(left.table);
    const rightRoot = roots.indexOf(right.table);
    if ((leftRoot >= 0) !== (rightRoot >= 0)) return leftRoot >= 0 ? 1 : -1;
    if (leftRoot >= 0 && rightRoot >= 0) return leftRoot - rightRoot;
    const byAction = actionRank(left) - actionRank(right);
    if (byAction !== 0) return byAction;
    return (rank.get(left.table) ?? 0) - (rank.get(right.table) ?? 0);
  });
}

/**
 * Nullable digests whose table CHECK still requires a digest-shaped value
 * once the row has one (deletion_operations_recovery_delivery_shape). Every
 * other nullable digest is nulled; a random value would be a fake receipt.
 */
const KEEP_DIGEST_SHAPE = new Set(["deletion_operations.recovery_delivery_recipient_digest"]);
/**
 * Nullable provider identifiers whose table CHECK requires presence for the
 * row class (stripe_events_receipt_attribution_shape): replaced by a random
 * token, never nulled. The economics stay; the customer link does not.
 */
const TOKEN_REPLACEMENT = new Set(["stripe_events.stripe_customer_id"]);

/**
 * The static per-column scrub rule. A pure classifier so the whole set can be
 * walked over `LIFECYCLE_REGISTRY × migrationInventory` in a test
 * (`lifecycle-scrub-rules.test.ts`): a future pseudonymise column with no rule
 * is red there, not a `cannot_pseudonymise` refusal on the first real erasure
 * (round-1 lean CHANGE C3; CLAUDE.md Respin rule 7). `null` means no rule.
 */
export type ScrubRule =
  | "skip"
  | "link"
  | "target_key"
  | "payload_hash"
  | "uuid_null"
  | "uuid_random"
  | "digest_null"
  | "digest_random"
  | "text_null"
  | "text_token"
  | "null";

export function scrubRuleFor(table: string, column: string, columnMeta: ColumnMeta): ScrubRule | null {
  if (column === "id" || column === "operation_id") return "skip";
  if (LINK_COLUMNS[column]) return "link";
  if (column === "target_key") return "target_key";
  if (column === "payload_hash" && DELETION_PROJECTION_TABLES.has(table)) return "payload_hash";
  if (columnMeta.udt === "uuid") return columnMeta.nullable ? "uuid_null" : "uuid_random";
  if (columnMeta.udt === "text") {
    const digestLike = /(_digest|_hash|_key)$/.test(column) || column === "recipient_digest";
    if (digestLike) {
      return columnMeta.nullable && !KEEP_DIGEST_SHAPE.has(`${table}.${column}`) ? "digest_null" : "digest_random";
    }
    return columnMeta.nullable && !TOKEN_REPLACEMENT.has(`${table}.${column}`) ? "text_null" : "text_token";
  }
  if (columnMeta.nullable) return "null";
  return null;
}

export function createSqlLifecycleMutationPort(
  tx: TxLike,
  context: SqlMutationContext
): LifecycleMutationPort & Readonly<{ receipt(): ErasureReceipt; stubFor(root: LinkRoot): Promise<string> }> {
  const executed: { registryKey: string; action: string; rows: number }[] = [];
  const skipped: { registryKey: string; reason: string }[] = [];
  const stubs: Partial<Record<LinkRoot, string>> = {};
  /** One replacement per operation so parent and child hashes stay equal. */
  const replacementHashes = new Map<string, string>();
  const replacementRequesterDigests = new Map<string, string>();

  const stubFor = async (root: LinkRoot): Promise<string> => {
    const existing = stubs[root];
    if (existing) return existing;
    if (root === "auth_identity") {
      const id = randomToken("deleted-");
      await tx.execute(sql`
        INSERT INTO "user" (id, name, email, email_verified, ordinary_login_disabled_at, created_at, updated_at)
        VALUES (${id}, 'Deleted member', ${`${id}@deleted.invalid`}, false, clock_timestamp(), clock_timestamp(), clock_timestamp())
      `);
      stubs.auth_identity = id;
      return id;
    }
    if (root === "identity") {
      const authId = await stubFor("auth_identity");
      const id = randomUUID();
      await tx.execute(sql`
        INSERT INTO "users" (id, auth_user_id, lifecycle_state) VALUES (${id}, ${authId}, 'tombstoned')
      `);
      stubs.identity = id;
      return id;
    }
    if (root === "workspace") {
      const id = randomUUID();
      await tx.execute(sql`
        INSERT INTO "workspaces" (id, name, lifecycle_state, lifecycle_version) VALUES (${id}, 'Deleted workspace', 'tombstoned', 1)
      `);
      stubs.workspace = id;
      return id;
    }
    const workspaceId = context.scope === "workspace"
      ? await stubFor("workspace")
      : context.profileStubWorkspaceId ?? refuse("profile_stub_workspace_missing");
    const id = randomUUID();
    await tx.execute(sql`
      INSERT INTO "creator_profiles" (id, workspace_id, display_name, state, lifecycle_version)
      VALUES (${id}, ${workspaceId}, 'Deleted profile', 'deletion_tombstoned', 1)
    `);
    stubs.profile = id;
    return id;
  };

  const tableMeta = (target: LifecycleExecutionTarget) => {
    const physical = physicalTable(target.table);
    const meta = context.meta.get(physical.key);
    return { physical, meta };
  };

  const anyMatchedValue = async (
    target: LifecycleExecutionTarget,
    meta: TableMeta,
    column: string
  ): Promise<boolean> => {
    const where = executorWhere(target);
    if (where === null) return false;
    const result = (await tx.execute(
      sql`SELECT 1 FROM ${relation(meta.schema, meta.table)} WHERE ${where} AND ${sql.identifier(column)} IS NOT NULL LIMIT 1`
    )) as unknown as { rows: unknown[] };
    return result.rows.length > 0;
  };

  const run = async (target: LifecycleExecutionTarget, statement: SQL | null, action: string) => {
    if (statement === null) {
      skipped.push({ registryKey: target.registryKey, reason: "empty_subject_snapshot" });
      return;
    }
    const result = (await tx.execute(statement)) as unknown as { rowCount?: number; affectedRows?: number };
    executed.push({
      registryKey: target.registryKey,
      action,
      rows: Number(result.rowCount ?? result.affectedRows ?? 0),
    });
  };

  const scrubAssignments = async (
    target: LifecycleExecutionTarget,
    meta: TableMeta,
    replacement: Readonly<{ payloadHash: string | null; requesterDigest: string | null }>
  ): Promise<SQL[]> => {
    const assignments: SQL[] = [];
    const isProjection = DELETION_PROJECTION_TABLES.has(target.table);
    const repointed = new Map<string, string>();
    const orderedColumns = [...target.columns].sort((left, right) =>
      (left === "target_key" ? 1 : 0) - (right === "target_key" ? 1 : 0)
    );
    for (const column of orderedColumns) {
      const columnMeta = meta.columns.get(column);
      if (!columnMeta) refuse(`unknown_column:${target.table}.${column}`);
      const identifier = sql.identifier(column);
      const rule = scrubRuleFor(target.table, column, columnMeta);
      if (rule === null) refuse(`cannot_pseudonymise:${target.table}.${column}`);
      if (rule === "skip") continue;
      if (rule === "link") {
        const link = LINK_COLUMNS[column]!;
        const linkScope = SCOPE_OF_LINK[link];
        const inScope = linkScope === context.scope || (context.scope === "workspace" && linkScope === "profile");
        if (!inScope) continue;
        if (
          columnMeta.nullable &&
          !(isProjection && column !== "requester_user_id" && column !== "cancelled_by_user_id")
        ) {
          assignments.push(sql`${identifier} = NULL`);
          // The unkeyed requester digest is sha256 of the user id: a known-id
          // dictionary would relink the retained receipt (R-122). Replace it
          // per operation; the composite FK is deferred for this transaction.
          if (column === "requester_user_id" && isProjection && meta.columns.has("requester_digest")) {
            if (replacement.requesterDigest === null) refuse("replacement_requester_digest_missing");
            assignments.push(sql`requester_digest = ${replacement.requesterDigest}`);
          }
        } else if (await anyMatchedValue(target, meta, column)) {
          const stub = await stubFor(link);
          repointed.set(column, stub);
          // NULL stays NULL: a workspace-scope receipt has no profile link.
          assignments.push(
            columnMeta.udt === "uuid"
              ? sql`${identifier} = CASE WHEN ${identifier} IS NULL THEN NULL ELSE ${stub}::uuid END`
              : sql`${identifier} = CASE WHEN ${identifier} IS NULL THEN NULL ELSE ${stub} END`
          );
        }
        continue;
      }
      if (rule === "target_key") {
        // Derived from the scope columns. The CHECK ties it to them, so it is
        // rewritten in the SAME statement: repointed columns use their new
        // literal, untouched ones their current value.
        const ref = (name: string): SQL => {
          const value = repointed.get(name);
          return value === undefined ? sql`${sql.identifier(name)}::text` : sql`${value}`;
        };
        assignments.push(sql`target_key = CASE scope
          WHEN 'identity' THEN 'identity:' || ${ref("user_id")}
          WHEN 'profile' THEN 'profile:' || ${ref("workspace_id")} || ':' || ${ref("profile_id")}
          ELSE 'workspace:' || ${ref("workspace_id")} END`);
        continue;
      }
      if (rule === "payload_hash") {
        if (replacement.payloadHash === null) refuse("replacement_hash_missing");
        assignments.push(sql`${identifier} = ${replacement.payloadHash}`);
        continue;
      }
      switch (rule) {
        case "uuid_null":
        case "digest_null":
        case "text_null":
        case "null":
          assignments.push(sql`${identifier} = NULL`);
          break;
        case "uuid_random":
          assignments.push(sql`${identifier} = md5(random()::text || clock_timestamp()::text || ${column})::uuid`);
          break;
        case "digest_random":
          assignments.push(
            sql`${identifier} = CASE WHEN ${identifier} IS NULL THEN NULL ELSE md5(random()::text || clock_timestamp()::text || ${column}) || md5(random()::text || clock_timestamp()::text || 'b') END`
          );
          break;
        case "text_token":
          assignments.push(
            sql`${identifier} = CASE WHEN ${identifier} IS NULL THEN NULL ELSE 'pseudonymised:' || md5(random()::text || clock_timestamp()::text || ${column}) END`
          );
          break;
      }
    }
    return assignments;
  };

  const port = {
    async cascade(target) {
      if (ROOT_TABLES.has(target.table)) {
        const where = executorWhere(target);
        await run(target, where && sql`DELETE FROM ${relation("public", target.table)} WHERE ${where}`, "cascade_root");
        return;
      }
      const { physical, meta } = tableMeta(target);
      if (!meta) {
        skipped.push({ registryKey: target.registryKey, reason: "relation_absent" });
        return;
      }
      const where = executorWhere(target);
      await run(target, where && sql`DELETE FROM ${relation(physical.schema, physical.table)} WHERE ${where}`, "cascade");
    },
    async deleteExplicit(target) {
      const { physical, meta } = tableMeta(target);
      if (!meta) {
        skipped.push({ registryKey: target.registryKey, reason: "relation_absent" });
        return;
      }
      const where = executorWhere(target);
      const wholeRow = target.columns.length === meta.columns.size;
      if (wholeRow) {
        await run(target, where && sql`DELETE FROM ${relation(physical.schema, physical.table)} WHERE ${where}`, "delete_row");
        return;
      }
      // A PARTIAL delete_explicit set is a retention clock (receipt facts for
      // a year, provider payloads for 90 days, a recovery secret for 7):
      // Task 6's receiver erases it when the clock runs out. Subject erasure
      // leaves it, and the independent probe treats it the same way.
      skipped.push({ registryKey: target.registryKey, reason: `receiver_clock:${target.selector.retention}` });
    },
    async pseudonymise(target) {
      if (target.table === "workspace_spend_monthly") {
        if (context.scope !== "workspace" || context.subjects.workspace.workspaceId.length === 0) {
          skipped.push({ registryKey: target.registryKey, reason: "not_workspace_operation" });
          return;
        }
        const result = await pseudonymiseWorkspaceSpend(tx, context.subjects.workspace.workspaceId);
        executed.push({ registryKey: target.registryKey, action: "pseudonymise_spend", rows: result.rowsUpdated });
        return;
      }
      const { physical, meta } = tableMeta(target);
      if (!meta) {
        skipped.push({ registryKey: target.registryKey, reason: "relation_absent" });
        return;
      }
      const where = executorWhere(target);
      if (where === null) {
        skipped.push({ registryKey: target.registryKey, reason: "empty_subject_snapshot" });
        return;
      }
      const isProjection = DELETION_PROJECTION_TABLES.has(target.table);
      if (isProjection && (target.columns.includes("payload_hash") || target.columns.includes("requester_user_id"))) {
        // Parent (`deletion_operations`) and child (`deletion_operation_transitions`)
        // must end with the SAME replacement hash: the composite FK spans it.
        const keyColumn = sql.identifier(target.table === "deletion_operations" ? "id" : "operation_id");
        const rows = (await tx.execute(
          sql`SELECT ${keyColumn} AS operation_id FROM ${relation(physical.schema, physical.table)} WHERE ${where}`
        )) as unknown as { rows: { operation_id: string }[] };
        let touched = 0;
        for (const row of rows.rows) {
          const payloadHash = replacementHashes.get(row.operation_id) ?? randomHex64();
          replacementHashes.set(row.operation_id, payloadHash);
          const requesterDigest = replacementRequesterDigests.get(row.operation_id) ?? randomHex64();
          replacementRequesterDigests.set(row.operation_id, requesterDigest);
          const rowAssignments = await scrubAssignments(target, meta, { payloadHash, requesterDigest });
          if (rowAssignments.length === 0) continue;
          const result = (await tx.execute(
            sql`UPDATE ${relation(physical.schema, physical.table)} SET ${sql.join(rowAssignments, sql`, `)} WHERE ${where} AND ${keyColumn} = ${row.operation_id}`
          )) as unknown as { rowCount?: number };
          touched += Number(result.rowCount ?? 0);
        }
        executed.push({ registryKey: target.registryKey, action: "pseudonymise", rows: touched });
        return;
      }
      const assignments = await scrubAssignments(target, meta, { payloadHash: null, requesterDigest: null });
      if (assignments.length === 0) {
        skipped.push({ registryKey: target.registryKey, reason: "no_scoped_columns" });
        return;
      }
      await run(
        target,
        sql`UPDATE ${relation(physical.schema, physical.table)} SET ${sql.join(assignments, sql`, `)} WHERE ${where}`,
        "pseudonymise"
      );
    },
    async retainFinancial(target) {
      skipped.push({ registryKey: target.registryKey, reason: "retained_financial_chain" });
    },
    async externalDelete(target) {
      skipped.push({ registryKey: target.registryKey, reason: "external_command_outbox" });
    },
    async preserve(target) {
      skipped.push({ registryKey: target.registryKey, reason: "preserved" });
    },
    receipt: () => ({ executed: [...executed], skipped: [...skipped], stubs: { ...stubs } }),
    stubFor,
  } satisfies LifecycleMutationPort & { receipt(): ErasureReceipt; stubFor(root: LinkRoot): Promise<string> };
  return port;
}

// ---------------------------------------------------------------------------
// The INDEPENDENT probe port. Its predicate renderer is deliberately its own
// (see the module docblock); a mistake here and a mistake above cannot agree.
// ---------------------------------------------------------------------------

function probeWhere(
  target: Pick<ExpectedResidueProbe, "selector" | "subject" | "subjectPredicate">
): SQL | null {
  const clauses: SQL[] = [];
  const discriminator = target.selector.discriminator;
  if (discriminator !== null) {
    const column = sql.identifier(discriminator.column);
    if (discriminator.operator === "equals") clauses.push(sql`${column} = ${discriminator.value}`);
    else if (discriminator.operator === "is_null") clauses.push(sql`${column} IS NULL`);
    else clauses.push(sql`${column} IS NOT NULL`);
  }
  const predicate: LifecycleSubjectPredicate = target.subjectPredicate;
  switch (predicate.kind) {
    case "unscoped":
      refuse("unscoped_probe_not_countable");
      break;
    case "direct":
    case "composite":
      for (const match of predicate.matches) {
        const value = (target.subject as unknown as Record<string, unknown>)[match.subjectField];
        if (typeof value !== "string" || value.length === 0) refuse(`probe_subject_field_missing:${match.subjectField}`);
        clauses.push(sql`${sql.identifier(match.column)} = ${value}`);
      }
      break;
    case "snapshot_pairs": {
      if (target.subject.scope !== "identity") refuse("probe_snapshot_pairs_wrong_subject");
      const rows = target.subject.verificationRows;
      if (rows.length === 0) return null;
      clauses.push(
        sql`(${sql.identifier("identifier")}, ${sql.identifier("value")}) IN (${sql.join(rows.map((row) => sql`(${row.identifier}, ${row.value})`), sql`, `)})`
      );
      break;
    }
    case "snapshot_indirect": {
      const options: SQL[] = [];
      for (const match of predicate.matches) {
        let values: readonly string[] = [];
        if (match.subjectSet === "workspace.stripeEventIds") {
          values = target.subject.scope === "workspace" ? target.subject.stripeEventIds : [];
        } else if (target.subject.scope === "related") {
          const field = match.subjectSet.split(".").at(-1) as keyof typeof target.subject.activeSubject.sourceIds;
          values = target.subject.activeSubject.sourceIds[field];
        }
        if (values.length === 0) continue;
        const location = match.location;
        const expression = location.kind === "column"
          ? sql`${sql.identifier(location.column)}::text`
          : sql`${sql.identifier(location.column)}->>${location.path.slice(2)}`;
        options.push(sql`${expression} IN (${sql.join(values.map((value) => sql`${value}`), sql`, `)})`);
      }
      if (options.length === 0) return null;
      clauses.push(sql`(${sql.join(options, sql` OR `)})`);
      break;
    }
  }
  return sql.join(clauses, sql` AND `);
}

export type ProbeCountContext = Readonly<{
  scope: DeletionScope;
  meta: ReadonlyMap<string, TableMeta>;
}>;

/**
 * Residue per action: a cascade/complete-row delete leaves rows; a partial
 * erase leaves non-null governed columns; a pseudonymisation leaves a column
 * that still names the subject (the scope link columns, or for related
 * system rows any snapshot id). Retained/preserved targets have no residue.
 */
export function createSqlResidueProbePort(tx: TxLike, context: ProbeCountContext): ResidueProbePort {
  return {
    async countResidual(target: ExpectedResidueProbe): Promise<number> {
      if (target.action === "retain_financial" || target.action === "not_applicable" || target.action === "external_delete") {
        return 0;
      }
      const physical = physicalTable(target.table);
      const meta = context.meta.get(physical.key);
      if (!meta) return 0; // the relation does not exist here; the executor skipped it for the same reason
      const where = probeWhere(target);
      if (where === null) return 0;
      const rel = relation(physical.schema, physical.table);
      if (target.action === "cascade" || (target.action === "delete_explicit" && target.columns.length === meta.columns.size)) {
        const result = (await tx.execute(sql`SELECT count(*)::int AS residue FROM ${rel} WHERE ${where}`)) as unknown as { rows: { residue: number }[] };
        return Number(result.rows[0]?.residue ?? 0);
      }
      if (target.action === "delete_explicit") {
        // Partial sets are receiver clocks (see the executor's deleteExplicit):
        // not residue of a subject erasure.
        return 0;
      }
      // pseudonymise: a row still matched by the subject predicate is residue,
      // because every predicate column IS a subject link the scrub must have
      // repointed or nulled. For related system rows the snapshot ids are the
      // link; for Stripe receipts keyed by event id the workspace link is.
      if (target.table === "stripe_events" && target.subject.scope === "workspace") {
        // Independent of the executor's rewrite: a receipt in the captured id
        // set is residue if ANY governed column still names the subject — the
        // workspace link, a captured customer id, or a governed JSON path that
        // is still present (round-1 lean S2: the JSON entry's probe re-used
        // the already-nulled workspace link and could never see JSON residue).
        const names: SQL[] = [];
        for (const column of target.columns) {
          if (column === "workspace_id") names.push(sql`workspace_id = ${target.subject.workspaceId}`);
          if (column === "stripe_customer_id" && target.subject.stripeCustomerIds.length > 0) {
            names.push(sql`stripe_customer_id IN (${inList(target.subject.stripeCustomerIds)})`);
          }
        }
        for (const path of target.jsonPaths) {
          const separator = path.indexOf("$");
          names.push(sql`${sql.identifier(path.slice(0, separator))}->>${path.slice(separator + 2)} IS NOT NULL`);
        }
        if (names.length === 0) return 0;
        const result = (await tx.execute(sql`SELECT count(*)::int AS residue FROM ${rel} WHERE ${where} AND (${sql.join(names, sql` OR `)})`)) as unknown as { rows: { residue: number }[] };
        return Number(result.rows[0]?.residue ?? 0);
      }
      if (target.table === "workspace_spend_monthly") {
        const result = (await tx.execute(sql`SELECT count(*)::int AS residue FROM ${rel} WHERE ${where}`)) as unknown as { rows: { residue: number }[] };
        return Number(result.rows[0]?.residue ?? 0);
      }
      const result = (await tx.execute(sql`SELECT count(*)::int AS residue FROM ${rel} WHERE ${where}`)) as unknown as { rows: { residue: number }[] };
      return Number(result.rows[0]?.residue ?? 0);
    },
  };
}

export function executorIdFor(target: LifecycleExecutionTarget): ExecutorId {
  return target.executor;
}

export function digestReceipt(receipt: ErasureReceipt): string {
  return createHash("sha256").update(JSON.stringify(receipt), "utf8").digest("hex");
}

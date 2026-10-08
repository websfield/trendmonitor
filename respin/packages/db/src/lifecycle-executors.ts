import type {
  LifecycleAction,
  LifecycleClassEntry,
  DataScope,
  ExecutorId,
  ProbeId,
  RetentionRule,
  SupportingLifecycleStoreEntry,
} from "./creator-data-registry";
import type { JsonPathInventoryEntry, MigrationForeignKey, MigrationInventory, RowClassInventoryEntry } from "./lifecycle-inventory";

export type BetterAuthVerificationSnapshot =
  | Readonly<{ kind: "password_reset"; identifier: `reset-password:${string}`; value: string }>
  | Readonly<{ kind: "oauth_account_link"; identifier: string; value: string }>;
export type LifecycleSourceIdSnapshot = Readonly<{
  jobIds: readonly string[];
  jobAttemptIds: readonly string[];
  trendItemIds: readonly string[];
  autopsyCacheClaimIds: readonly string[];
}>;
export type IdentityLifecycleSubject = Readonly<{
  scope: "identity";
  /** Domain `users.id` UUID. */
  userId: string;
  /** Better Auth `user.id` text identifier. */
  authUserId: string;
  /** Exact identity-linked Better Auth rows captured before the auth user is removed. */
  verificationRows: readonly BetterAuthVerificationSnapshot[];
}>;
export type ProfileLifecycleSubject = Readonly<{
  scope: "profile";
  profileId: string;
  workspaceId: string;
  sourceIds: LifecycleSourceIdSnapshot;
}>;
export type WorkspaceLifecycleSubject = Readonly<{
  scope: "workspace";
  workspaceId: string;
  /** Exact receipt ids captured before the FK is nulled by workspace deletion. */
  stripeEventIds: readonly string[];
  /** Provider customer ids those receipts may carry; the probe's second link. */
  stripeCustomerIds: readonly string[];
  sourceIds: LifecycleSourceIdSnapshot;
}>;
export type SystemLifecycleSubject = Readonly<{ scope: "system"; installationId: string }>;
export type RelatedLifecycleSubject =
  | Readonly<{ scope: "related"; activeScope: "profile"; activeSubject: ProfileLifecycleSubject }>
  | Readonly<{ scope: "related"; activeScope: "workspace"; activeSubject: WorkspaceLifecycleSubject }>;
export type LifecycleSubject = IdentityLifecycleSubject | ProfileLifecycleSubject | WorkspaceLifecycleSubject | SystemLifecycleSubject | RelatedLifecycleSubject;
type LifecycleRuntimeSubjectBase = Readonly<{
  identity: IdentityLifecycleSubject;
  system: SystemLifecycleSubject;
}>;
export type LifecycleRuntimeSubjects =
  | Readonly<LifecycleRuntimeSubjectBase & {
      activeOperation: Readonly<{ scope: "profile" }>;
      profile: ProfileLifecycleSubject;
      workspace: WorkspaceLifecycleSubject;
    }>
  | Readonly<LifecycleRuntimeSubjectBase & {
      activeOperation: Readonly<{ scope: "workspace" }>;
      workspace: WorkspaceLifecycleSubject;
      /** A workspace operation must not manufacture one arbitrary profile. */
      profile?: never;
    }>;
export type LifecycleSubjectField = "userId" | "authUserId" | "profileId" | "workspaceId";
export type LifecycleSubjectMatch = Readonly<{ column: string; subjectField: LifecycleSubjectField }>;
export type LifecycleSnapshotSet =
  | "workspace.stripeEventIds"
  | "related.activeSubject.sourceIds.jobIds"
  | "related.activeSubject.sourceIds.jobAttemptIds"
  | "related.activeSubject.sourceIds.trendItemIds"
  | "related.activeSubject.sourceIds.autopsyCacheClaimIds";
export type LifecycleSnapshotLocation =
  | Readonly<{ kind: "column"; column: string }>
  | Readonly<{ kind: "json_path"; column: string; path: string }>;
export type LifecycleSnapshotMatch = Readonly<{
  location: LifecycleSnapshotLocation;
  subjectSet: LifecycleSnapshotSet;
}>;
export type LifecycleSubjectPredicate =
  | Readonly<{ kind: "direct"; matches: readonly [LifecycleSubjectMatch] }>
  | Readonly<{ kind: "composite"; matches: readonly [LifecycleSubjectMatch, LifecycleSubjectMatch, ...LifecycleSubjectMatch[]] }>
  | Readonly<{ kind: "snapshot_pairs"; identifierColumn: "identifier"; valueColumn: "value"; subjectField: "verificationRows" }>
  | Readonly<{ kind: "snapshot_indirect"; matches: readonly LifecycleSnapshotMatch[] }>
  | Readonly<{ kind: "unscoped"; installationSubjectField: "installationId" }>;

export type LifecycleRowSelector = Readonly<{
  scope: DataScope;
  retention: RetentionRule;
  discriminator: Readonly<{
    column: string;
    operator: "equals" | "is_null" | "is_not_null";
    value: string | null;
  }> | null;
}>;

export type LifecycleExecutionTarget = Readonly<{
  registryKey: string;
  executor: ExecutorId;
  probe: ProbeId;
  action: LifecycleAction;
  resourceKind: "app_table" | "supporting_store";
  table: string;
  rowClass: string;
  columns: readonly string[];
  foreignKeyColumns: readonly string[];
  foreignKeys: readonly MigrationForeignKey[];
  jsonPaths: readonly string[];
  selector: LifecycleRowSelector;
  subject: LifecycleSubject;
  subjectPredicate: LifecycleSubjectPredicate;
}>;

export type LifecycleMutationPort = Readonly<{
  cascade(target: LifecycleExecutionTarget): Promise<void>;
  deleteExplicit(target: LifecycleExecutionTarget): Promise<void>;
  pseudonymise(target: LifecycleExecutionTarget): Promise<void>;
  retainFinancial(target: LifecycleExecutionTarget): Promise<void>;
  externalDelete(target: LifecycleExecutionTarget): Promise<void>;
  preserve(target: LifecycleExecutionTarget): Promise<void>;
}>;

export type LifecycleExecutorImplementation = Readonly<{
  supportedActions: readonly LifecycleAction[];
  execute(
    port: LifecycleMutationPort,
    target: LifecycleExecutionTarget
  ): Promise<void>;
}>;

export type LifecycleExecutorImplementations = Readonly<
  Record<ExecutorId, LifecycleExecutorImplementation>
>;

function executor(
  supportedActions: readonly LifecycleAction[],
  method: keyof LifecycleMutationPort
): LifecycleExecutorImplementation {
  return {
    supportedActions,
    execute: (port, target) => port[method](target),
  };
}

/**
 * Executable, capability-injected executor registry. The concrete deletion
 * state machine supplies the mutation port in later tasks; these functions are
 * already real call targets, so removing an implementation or assigning an
 * incompatible action fails the C1 build gate now.
 */
export const LIFECYCLE_EXECUTORS = {
  identity_cascade: executor(["cascade"], "cascade"),
  profile_cascade: executor(["cascade"], "cascade"),
  workspace_cascade: executor(["cascade"], "cascade"),
  explicit_row_delete: executor(["delete_explicit"], "deleteExplicit"),
  workspace_pseudonymiser: executor(["pseudonymise"], "pseudonymise"),
  identifier_scrubber: executor(["pseudonymise"], "pseudonymise"),
  financial_retention_receiver: executor(
    ["retain_financial"],
    "retainFinancial"
  ),
  stripe_payload_receiver: executor(["delete_explicit"], "deleteExplicit"),
  expiry_receiver: executor(["delete_explicit"], "deleteExplicit"),
  external_deletion_receiver: executor(["external_delete"], "externalDelete"),
  library_retention: executor(["not_applicable"], "preserve"),
  system_retention: executor(["not_applicable"], "preserve"),
} as const satisfies LifecycleExecutorImplementations;

function columnsFor(
  entry: LifecycleClassEntry,
  migrations: MigrationInventory
): readonly string[] {
  const table = migrations.tables.find((candidate) => candidate.name === entry.table);
  if (!table) throw new Error(`cannot compile executor for unknown table '${entry.table}'`);
  if (entry.fieldSet.kind === "all_columns") return table.columns;
  if (entry.fieldSet.kind === "columns") return entry.fieldSet.columns;
  const excluded: readonly string[] = entry.fieldSet.excluding;
  return table.columns.filter((column) => !excluded.includes(column));
}

function subjectForScope(
  scope: DataScope,
  subjects: LifecycleRuntimeSubjects
): LifecycleSubject {
  const subject = scope === "identity"
    ? subjects.identity
    : scope === "system"
      ? subjects.system
      : scope === "workspace"
        ? subjects.workspace
        : subjects.activeOperation.scope === "profile"
          ? subjects.profile
          : undefined;
  if (subject === undefined) {
    throw new Error("workspace lifecycle operation has no single profile subject");
  }
  if (subject.scope !== scope) {
    throw new Error(`runtime lifecycle subject scope mismatch: ${scope}`);
  }
  const scalarFields = scope === "identity"
    ? ["userId", "authUserId"] as const
    : scope === "profile"
      ? ["profileId", "workspaceId"] as const
      : scope === "workspace"
        ? ["workspaceId"] as const
        : ["installationId"] as const;
  for (const field of scalarFields) {
    const value = subject[field as keyof typeof subject];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`runtime lifecycle subject has blank ${field}: ${scope}`);
    }
  }
  const validateSet = (name: string, values: readonly string[]) => {
    if (values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
      throw new Error(`runtime lifecycle subject has blank snapshot id: ${name}`);
    }
    if (new Set(values).size !== values.length) {
      throw new Error(`runtime lifecycle subject has duplicate snapshot id: ${name}`);
    }
  };
  if (subject.scope === "identity") {
    const keys = new Set<string>();
    for (const row of subject.verificationRows) {
      const key = `${row.identifier}\u0000${row.value}`;
      if (keys.has(key)) throw new Error("runtime lifecycle subject has duplicate verification snapshot");
      keys.add(key);
      if (row.kind === "password_reset") {
        const token = row.identifier.slice("reset-password:".length);
        if (!row.identifier.startsWith("reset-password:") || token.length !== 24 || row.value !== subject.authUserId) {
          throw new Error("runtime lifecycle subject has invalid Better Auth password-reset snapshot");
        }
      } else {
        let value: unknown;
        try { value = JSON.parse(row.value); } catch { throw new Error("runtime lifecycle subject has invalid Better Auth OAuth-state snapshot"); }
        const link = value && typeof value === "object" ? (value as { link?: unknown }).link : undefined;
        const linkedUserId = link && typeof link === "object" ? (link as { userId?: unknown }).userId : undefined;
        if (row.identifier.length !== 32 || linkedUserId !== subject.authUserId) {
          throw new Error("runtime lifecycle subject has invalid Better Auth OAuth-state snapshot");
        }
      }
    }
  } else if (subject.scope === "profile" || subject.scope === "workspace") {
    for (const [name, values] of Object.entries(subject.sourceIds)) validateSet(`${scope}.sourceIds.${name}`, values);
    if (subject.scope === "workspace") validateSet("workspace.stripeEventIds", subject.stripeEventIds);
  }
  return subject;
}

/**
 * Execution derives ownership from the physical table shape. The independent
 * probe module deliberately has its own derivation so a mutation here cannot
 * make the verifier agree with the same mistake.
 */
function relatedSubject(subjects: LifecycleRuntimeSubjects): RelatedLifecycleSubject {
  const workspace = subjectForScope("workspace", subjects) as WorkspaceLifecycleSubject;
  if (subjects.activeOperation.scope === "workspace") {
    return { scope: "related", activeScope: "workspace", activeSubject: workspace };
  }
  const profile = subjectForScope("profile", subjects) as ProfileLifecycleSubject;
  if (profile.workspaceId !== workspace.workspaceId) {
    throw new Error("runtime lifecycle profile/workspace subjects are incoherent");
  }
  return { scope: "related", activeScope: "profile", activeSubject: profile };
}

const SOURCE_SET_SUFFIX = {
  job_id: "jobIds",
  job_attempt_id: "jobAttemptIds",
  trend_item_id: "trendItemIds",
  autopsy_cache_claim_id: "autopsyCacheClaimIds",
} as const;
type SourceSetSuffix = (typeof SOURCE_SET_SUFFIX)[keyof typeof SOURCE_SET_SUFFIX];

function relatedSnapshotMatches(
  columns: readonly string[],
  jsonPaths: readonly string[],
  pgBoss: boolean
): readonly LifecycleSnapshotMatch[] {
  const matches: LifecycleSnapshotMatch[] = [];
  const add = (location: LifecycleSnapshotLocation, suffix: SourceSetSuffix) => {
    matches.push({
      location,
      subjectSet: `related.activeSubject.sourceIds.${suffix}` as LifecycleSnapshotSet,
    });
  };
  for (const column of columns) {
    const suffix = SOURCE_SET_SUFFIX[column as keyof typeof SOURCE_SET_SUFFIX];
    if (suffix) add({ kind: "column", column }, suffix);
    if (pgBoss && (column === "id" || column === "child_id" || column === "parent_id")) {
      add({ kind: "column", column }, "jobAttemptIds");
    }
    if (pgBoss && column === "singleton_key") add({ kind: "column", column }, "autopsyCacheClaimIds");
  }
  const jsonSuffixes: Readonly<Record<string, SourceSetSuffix>> = {
    "data$.jobId": "jobIds",
    "data$.itemId": "trendItemIds",
    "data$.attemptId": "jobAttemptIds",
    "data$.runId": "jobAttemptIds",
    "data$.autopsyCacheClaimId": "autopsyCacheClaimIds",
  };
  for (const path of jsonPaths) {
    const suffix = jsonSuffixes[path];
    if (!suffix) continue;
    const separator = path.indexOf("$");
    add({ kind: "json_path", column: path.slice(0, separator), path: path.slice(separator) }, suffix);
  }
  return matches;
}

function subjectAndPredicateFor(
  table: string,
  rowClass: string,
  scope: DataScope,
  columns: readonly string[],
  jsonPaths: readonly string[],
  subjects: LifecycleRuntimeSubjects,
  sourceIds = false
): Readonly<{ subject: LifecycleSubject; predicate: LifecycleSubjectPredicate }> {
  if (table === "verification") {
    return {
      subject: subjectForScope("identity", subjects),
      predicate: { kind: "snapshot_pairs", identifierColumn: "identifier", valueColumn: "value", subjectField: "verificationRows" },
    };
  }
  if (table === "deletion_cancellation_proofs") {
    return {
      subject: subjectForScope("identity", subjects),
      predicate: {
        kind: "direct",
        matches: [{ column: "auth_user_id", subjectField: "authUserId" }],
      },
    };
  }
  if (table === "deletion_recovery_sessions" || table === "auth_mail_outbox") {
    return {
      subject: subjectForScope("identity", subjects),
      predicate: {
        kind: "direct",
        matches: [{ column: "auth_user_id", subjectField: "authUserId" }],
      },
    };
  }
  if (table === "stripe_events" && rowClass === "stripe_workspace_attributed") {
    return {
      subject: subjectForScope("workspace", subjects),
      predicate: {
        kind: "snapshot_indirect",
        matches: [{ location: { kind: "column", column: "id" }, subjectSet: "workspace.stripeEventIds" }],
      },
    };
  }
  if (rowClass === "creator_consent") {
    return {
      subject: subjectForScope("identity", subjects),
      predicate: { kind: "direct", matches: [{ column: "rights_subject_user_id", subjectField: "userId" }] },
    };
  }
  // The requester and (R-166) the canceller: each a single identity link on
  // a deletion receipt, scrubbed by THAT person's identity erasure.
  if (
    scope === "identity" &&
    (table === "deletion_operations" || table === "deletion_operation_transitions") &&
    columns.length === 1 &&
    (columns[0] === "requester_user_id" || columns[0] === "cancelled_by_user_id")
  ) {
    return {
      subject: subjectForScope("identity", subjects),
      predicate: {
        kind: "direct",
        matches: [{ column: columns[0], subjectField: "userId" }],
      },
    };
  }
  if (scope === "profile" && subjects.activeOperation.scope === "workspace") {
    return {
      subject: subjectForScope("workspace", subjects),
      predicate: { kind: "direct", matches: [{ column: "workspace_id", subjectField: "workspaceId" }] },
    };
  }
  if (scope === "profile") {
    const subject = subjectForScope("profile", subjects);
    const profileColumn = table === "creator_profiles" ? "id" : table === "frameworks" ? "owner_profile_id" : "profile_id";
    return { subject, predicate: { kind: "composite", matches: [
      { column: profileColumn, subjectField: "profileId" },
      { column: "workspace_id", subjectField: "workspaceId" },
    ] } };
  }
  const snapshotMatches = scope === "system" || sourceIds
    ? relatedSnapshotMatches(columns, jsonPaths, sourceIds)
    : [];
  if (snapshotMatches.length > 0) {
    return {
      subject: relatedSubject(subjects),
      predicate: { kind: "snapshot_indirect", matches: snapshotMatches },
    };
  }
  const subject = subjectForScope(scope, subjects);
  if (scope === "system") {
    return { subject, predicate: { kind: "unscoped", installationSubjectField: "installationId" } };
  }
  if (scope === "identity") {
    if (table === "user") {
      return { subject, predicate: { kind: "direct", matches: [{ column: "id", subjectField: "authUserId" }] } };
    }
    if (table === "account" || table === "session") {
      return { subject, predicate: { kind: "direct", matches: [{ column: "user_id", subjectField: "authUserId" }] } };
    }
    return { subject, predicate: { kind: "direct", matches: [{ column: table === "users" ? "id" : "user_id", subjectField: "userId" }] } };
  }
  return { subject, predicate: { kind: "direct", matches: [
    { column: table === "workspaces" ? "id" : "workspace_id", subjectField: "workspaceId" },
  ] } };
}

function assertPredicateIsExecutable(
  targetTable: string,
  subject: LifecycleSubject,
  predicate: LifecycleSubjectPredicate,
  migrations: MigrationInventory
): void {
  if (predicate.kind === "unscoped") return;
  const assertSubjectField = (field: LifecycleSubjectField) => {
    if (!(field in subject)) throw new Error(`lifecycle predicate uses unavailable subject field: ${targetTable}.${field}`);
  };
  const assertColumn = (tableName: string, column: string) => {
    const table = migrations.tables.find((candidate) => candidate.name === tableName);
    if (!table?.columns.includes(column)) throw new Error(`lifecycle predicate uses unknown column: ${tableName}.${column}`);
  };
  if (predicate.kind === "direct" || predicate.kind === "composite") {
    for (const match of predicate.matches) {
      assertColumn(targetTable, match.column);
      assertSubjectField(match.subjectField);
    }
    return;
  }
  if (predicate.kind === "snapshot_pairs") {
    if (subject.scope !== "identity") throw new Error(`lifecycle verification predicate has wrong subject: ${targetTable}`);
    assertColumn(targetTable, predicate.identifierColumn);
    assertColumn(targetTable, predicate.valueColumn);
    return;
  }
  if (predicate.matches.length === 0 || (subject.scope !== "related" && subject.scope !== "workspace")) {
    throw new Error(`lifecycle snapshot predicate has no scoped values: ${targetTable}`);
  }
  for (const match of predicate.matches) {
    assertColumn(targetTable, match.location.column);
    if (match.location.kind === "json_path" && !match.location.path.startsWith("$.")) {
      throw new Error(`lifecycle snapshot predicate has invalid JSON path: ${targetTable}.${match.location.column}${match.location.path}`);
    }
  }
}

function snapshotValues(subject: LifecycleSubject, set: LifecycleSnapshotSet): readonly string[] {
  if (set === "workspace.stripeEventIds") {
    return subject.scope === "workspace" ? subject.stripeEventIds : [];
  }
  if (subject.scope !== "related") return [];
  const [, , , field] = set.split(".") as ["related", "activeSubject", "sourceIds", keyof LifecycleSourceIdSnapshot];
  return subject.activeSubject.sourceIds[field];
}

function valueAtLocation(
  row: Readonly<Record<string, unknown>>,
  location: LifecycleSnapshotLocation
): unknown {
  const value = row[location.column];
  if (location.kind === "column") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Readonly<Record<string, unknown>>)[location.path.slice(2)];
}

/**
 * Deterministic row matcher used by future mutation/residue ports. Snapshot
 * predicates remain usable after their source FK/row has disappeared.
 */
export function lifecycleTargetMatchesRow(
  target: Pick<LifecycleExecutionTarget, "selector" | "subject" | "subjectPredicate">,
  row: Readonly<Record<string, unknown>>
): boolean {
  const discriminator = target.selector.discriminator;
  if (discriminator !== null) {
    const value = row[discriminator.column];
    const matchesDiscriminator = discriminator.operator === "equals"
      ? value === discriminator.value
      : discriminator.operator === "is_null"
        ? value === null
        : value !== null && value !== undefined;
    if (!matchesDiscriminator) return false;
  }
  const predicate = target.subjectPredicate;
  if (predicate.kind === "unscoped") return true;
  if (predicate.kind === "snapshot_pairs") {
    if (target.subject.scope !== "identity") return false;
    return target.subject.verificationRows.some((snapshot) =>
      row[predicate.identifierColumn] === snapshot.identifier
      && row[predicate.valueColumn] === snapshot.value
    );
  }
  if (predicate.kind === "snapshot_indirect") {
    return predicate.matches.some((match) => {
      const value = valueAtLocation(row, match.location);
      return typeof value === "string" && snapshotValues(target.subject, match.subjectSet).includes(value);
    });
  }
  return predicate.matches.every((match) => {
    if (!(match.subjectField in target.subject)) return false;
    return row[match.column] === target.subject[match.subjectField as keyof typeof target.subject];
  });
}

export function compileLifecycleExecutionTargets(
  migrations: MigrationInventory,
  registry: readonly LifecycleClassEntry[],
  rowClasses: readonly RowClassInventoryEntry[],
  jsonPaths: readonly JsonPathInventoryEntry[],
  subjects: LifecycleRuntimeSubjects,
  supportingStores: readonly SupportingLifecycleStoreEntry[],
  implementations: LifecycleExecutorImplementations = LIFECYCLE_EXECUTORS
): readonly LifecycleExecutionTarget[] {
  const appTargets = registry.map((entry) => {
    const table = migrations.tables.find((candidate) => candidate.name === entry.table);
    if (!table) throw new Error(`cannot compile executor for unknown table '${entry.table}'`);
    const implementation = implementations[entry.executor];
    if (!implementation) {
      throw new Error(`missing executor implementation: ${entry.executor}`);
    }
    if (!implementation.supportedActions.includes(entry.action)) {
      throw new Error(
        `executor/action mismatch: ${entry.executor} cannot ${entry.action}`
      );
    }
    const rowClass = rowClasses.find(
      (candidate) => candidate.table === entry.table && candidate.rowClass === entry.rowClass
    );
    if (!rowClass) throw new Error(`missing selector inventory: ${entry.table}.${entry.rowClass}`);
    if (rowClass.discriminator?.kind === "nullness" && rowClass.discriminator.value !== "is_null" && rowClass.discriminator.value !== "is_not_null") throw new Error(`invalid nullness selector: ${entry.table}.${entry.rowClass}`);
    const discriminator = rowClass.discriminator === null
      ? null
      : {
          column: rowClass.discriminator.column,
          operator: rowClass.discriminator.kind === "enum_value"
            ? "equals" as const
            : rowClass.discriminator.value === "is_null"
              ? "is_null" as const
              : "is_not_null" as const,
          value: rowClass.discriminator.kind === "enum_value"
            ? rowClass.discriminator.value
            : null,
        };
    const columns = [...columnsFor(entry, migrations)].sort();
    const governedJsonPaths = entry.governedJsonPaths
      .filter((path) => columns.includes(path.slice(0, path.indexOf("$"))))
      .sort();
    for (const path of governedJsonPaths) {
      if (!jsonPaths.some((candidate) => candidate.table === entry.table && `${candidate.column}${candidate.path}` === path)) {
        throw new Error(`cannot compile executor for unknown JSON path: ${entry.table}.${path}`);
      }
    }
    const { subject, predicate: subjectPredicate } = subjectAndPredicateFor(
      entry.table,
      entry.rowClass,
      entry.scope,
      columns,
      governedJsonPaths,
      subjects
    );
    assertPredicateIsExecutable(entry.table, subject, subjectPredicate, migrations);
    return {
      registryKey: `${entry.table}::${entry.rowClass}::${entry.fieldSet.name}`,
      executor: entry.executor,
      probe: entry.residueProbe,
      action: entry.action,
      resourceKind: "app_table" as const,
      table: entry.table,
      rowClass: entry.rowClass,
      columns,
      foreignKeyColumns: table.foreignKeyColumns.filter((column) => columns.includes(column)).sort(),
      foreignKeys: table.foreignKeys.filter((foreignKey) =>
        foreignKey.columns.some((column) => columns.includes(column))
      ),
      jsonPaths: governedJsonPaths,
      selector: { scope: entry.scope, retention: entry.retention, discriminator },
      subject,
      subjectPredicate,
    };
  });
  const supportingTargets = supportingStores.map((store) => {
    const implementation = implementations[store.executor];
    if (!implementation) throw new Error(`missing executor implementation: ${store.executor}`);
    if (!implementation.supportedActions.includes(store.action)) throw new Error(`executor/action mismatch: ${store.executor} cannot ${store.action}`);
    const columns = [...store.fields].sort();
    const jsonPaths = [...store.governedJsonPaths].sort();
    const { subject, predicate: subjectPredicate } = subjectAndPredicateFor(
      store.store,
      "supporting_store",
      store.scope,
      columns,
      jsonPaths,
      subjects,
      store.subjectBinding === "source_ids"
    );
    if (subjectPredicate.kind === "snapshot_indirect") {
      for (const match of subjectPredicate.matches) {
        if (!columns.includes(match.location.column)) {
          throw new Error(`supporting lifecycle predicate uses unknown field: ${store.store}.${match.location.column}`);
        }
        if (match.location.kind === "json_path" && !jsonPaths.includes(`${match.location.column}${match.location.path}`)) {
          throw new Error(`supporting lifecycle predicate uses unknown JSON path: ${store.store}.${match.location.column}${match.location.path}`);
        }
      }
    }
    return {
      registryKey: `supporting::${store.store}`,
      executor: store.executor,
      probe: store.residueProbe,
      action: store.action,
      resourceKind: "supporting_store" as const,
      table: store.store,
      rowClass: "supporting_store",
      columns,
      foreignKeyColumns: [],
      foreignKeys: [],
      jsonPaths,
      selector: { scope: store.scope, retention: store.retention, discriminator: null },
      subject,
      subjectPredicate,
    };
  });
  return [...appTargets, ...supportingTargets];
}

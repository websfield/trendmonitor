import type { DataScope, ExecutorId, LifecycleAction, LifecycleClassEntry, ProbeId, SupportingLifecycleStoreEntry } from "./creator-data-registry";
import type {
  LifecycleExecutionTarget,
  LifecycleRowSelector,
  LifecycleRuntimeSubjects,
  LifecycleSnapshotLocation,
  LifecycleSnapshotMatch,
  LifecycleSnapshotSet,
  LifecycleSubject,
  LifecycleSubjectField,
  LifecycleSubjectPredicate,
  ProfileLifecycleSubject,
  RelatedLifecycleSubject,
  WorkspaceLifecycleSubject,
} from "./lifecycle-executors";
import type { JsonPathInventoryEntry, MigrationForeignKey, MigrationInventory, RowClassInventoryEntry } from "./lifecycle-inventory";

export type ExpectedResidueProbe = Readonly<{
  registryKey: string;
  resourceKind: "app_table" | "supporting_store";
  action: LifecycleAction;
  executor: ExecutorId;
  probe: ProbeId;
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

export type ResidueProbePort = Readonly<{
  countResidual(target: ExpectedResidueProbe): Promise<number>;
}>;

export type ResidueProbeImplementation = Readonly<{
  execute(port: ResidueProbePort, target: ExpectedResidueProbe): Promise<number>;
}>;

export type ResidueProbeImplementations = Readonly<
  Record<ProbeId, ResidueProbeImplementation>
>;

const executableProbe: ResidueProbeImplementation = {
  execute: (port, target) => port.countResidual(target),
};

/** Read-only executable probe ports, independent of executor implementations. */
export const LIFECYCLE_PROBES = {
  identity_residue: executableProbe,
  profile_residue: executableProbe,
  workspace_residue: executableProbe,
  retained_financial_residue: executableProbe,
  stripe_payload_residue: executableProbe,
  expiry_residue: executableProbe,
  shared_library_residue: executableProbe,
  system_residue: executableProbe,
} as const satisfies ResidueProbeImplementations;

function probeSubjectForScope(
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
    throw new Error("workspace residue operation has no single profile subject");
  }
  if (subject.scope !== scope) {
    throw new Error(`runtime residue subject scope mismatch: ${scope}`);
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
      throw new Error(`runtime residue subject has blank ${field}: ${scope}`);
    }
  }
  const validateSet = (name: string, values: readonly string[]) => {
    if (values.some((value) => typeof value !== "string" || value.trim().length === 0)) throw new Error(`runtime residue subject has blank snapshot id: ${name}`);
    if (new Set(values).size !== values.length) throw new Error(`runtime residue subject has duplicate snapshot id: ${name}`);
  };
  if (subject.scope === "identity") {
    const keys = new Set<string>();
    for (const row of subject.verificationRows) {
      const key = `${row.identifier}\u0000${row.value}`;
      if (keys.has(key)) throw new Error("runtime residue subject has duplicate verification snapshot");
      keys.add(key);
      if (row.kind === "password_reset") {
        const token = row.identifier.slice("reset-password:".length);
        if (!row.identifier.startsWith("reset-password:") || token.length !== 24 || row.value !== subject.authUserId) throw new Error("runtime residue subject has invalid Better Auth password-reset snapshot");
      } else {
        let value: unknown;
        try { value = JSON.parse(row.value); } catch { throw new Error("runtime residue subject has invalid Better Auth OAuth-state snapshot"); }
        const link = value && typeof value === "object" ? (value as { link?: unknown }).link : undefined;
        const linkedUserId = link && typeof link === "object" ? (link as { userId?: unknown }).userId : undefined;
        if (row.identifier.length !== 32 || linkedUserId !== subject.authUserId) throw new Error("runtime residue subject has invalid Better Auth OAuth-state snapshot");
      }
    }
  } else if (subject.scope === "profile" || subject.scope === "workspace") {
    for (const [name, values] of Object.entries(subject.sourceIds)) validateSet(`${scope}.sourceIds.${name}`, values);
    if (subject.scope === "workspace") validateSet("workspace.stripeEventIds", subject.stripeEventIds);
  }
  return subject;
}

/** Independent physical ownership derivation; do not call the executor helper. */
function probeRelatedSubject(subjects: LifecycleRuntimeSubjects): RelatedLifecycleSubject {
  const workspace = probeSubjectForScope("workspace", subjects) as WorkspaceLifecycleSubject;
  if (subjects.activeOperation.scope === "workspace") {
    return { scope: "related", activeScope: "workspace", activeSubject: workspace };
  }
  const profile = probeSubjectForScope("profile", subjects) as ProfileLifecycleSubject;
  if (profile.workspaceId !== workspace.workspaceId) {
    throw new Error("runtime residue profile/workspace subjects are incoherent");
  }
  return { scope: "related", activeScope: "profile", activeSubject: profile };
}

const PROBE_SOURCE_SET_SUFFIX = {
  job_id: "jobIds",
  job_attempt_id: "jobAttemptIds",
  trend_item_id: "trendItemIds",
  autopsy_cache_claim_id: "autopsyCacheClaimIds",
} as const;
type ProbeSourceSetSuffix = (typeof PROBE_SOURCE_SET_SUFFIX)[keyof typeof PROBE_SOURCE_SET_SUFFIX];

function probeRelatedSnapshotMatches(
  columns: readonly string[],
  jsonPaths: readonly string[],
  pgBoss: boolean
): readonly LifecycleSnapshotMatch[] {
  const matches: LifecycleSnapshotMatch[] = [];
  const add = (location: LifecycleSnapshotLocation, suffix: ProbeSourceSetSuffix) => {
    matches.push({
      location,
      subjectSet: `related.activeSubject.sourceIds.${suffix}` as LifecycleSnapshotSet,
    });
  };
  for (const column of columns) {
    const suffix = PROBE_SOURCE_SET_SUFFIX[column as keyof typeof PROBE_SOURCE_SET_SUFFIX];
    if (suffix) add({ kind: "column", column }, suffix);
    if (pgBoss && (column === "id" || column === "child_id" || column === "parent_id")) add({ kind: "column", column }, "jobAttemptIds");
    if (pgBoss && column === "singleton_key") add({ kind: "column", column }, "autopsyCacheClaimIds");
  }
  const jsonSuffixes: Readonly<Record<string, ProbeSourceSetSuffix>> = {
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

function probeSubjectAndPredicateFor(
  table: string,
  rowClass: string,
  scope: DataScope,
  columns: readonly string[],
  jsonPaths: readonly string[],
  subjects: LifecycleRuntimeSubjects,
  sourceIds = false
): Readonly<{ subject: LifecycleSubject; predicate: LifecycleSubjectPredicate }> {
  if (table === "verification") return {
    subject: probeSubjectForScope("identity", subjects),
    predicate: { kind: "snapshot_pairs", identifierColumn: "identifier", valueColumn: "value", subjectField: "verificationRows" },
  };
  if (table === "deletion_cancellation_proofs") return {
    subject: probeSubjectForScope("identity", subjects),
    predicate: {
      kind: "direct",
      matches: [{ column: "auth_user_id", subjectField: "authUserId" }],
    },
  };
  if (table === "deletion_recovery_sessions" || table === "auth_mail_outbox") return {
    subject: probeSubjectForScope("identity", subjects),
    predicate: {
      kind: "direct",
      matches: [{ column: "auth_user_id", subjectField: "authUserId" }],
    },
  };
  if (table === "stripe_events" && rowClass === "stripe_workspace_attributed") return {
    subject: probeSubjectForScope("workspace", subjects),
    predicate: { kind: "snapshot_indirect", matches: [
      { location: { kind: "column", column: "id" }, subjectSet: "workspace.stripeEventIds" },
    ] },
  };
  if (rowClass === "creator_consent") return {
    subject: probeSubjectForScope("identity", subjects),
    predicate: { kind: "direct", matches: [{ column: "rights_subject_user_id", subjectField: "userId" }] },
  };
  if (
    scope === "identity" &&
    (table === "deletion_operations" || table === "deletion_operation_transitions") &&
    columns.length === 1 &&
    (columns[0] === "requester_user_id" || columns[0] === "cancelled_by_user_id")
  ) return {
    subject: probeSubjectForScope("identity", subjects),
    predicate: { kind: "direct", matches: [{ column: columns[0], subjectField: "userId" }] },
  };
  if (scope === "profile" && subjects.activeOperation.scope === "workspace") return {
    subject: probeSubjectForScope("workspace", subjects),
    predicate: { kind: "direct", matches: [{ column: "workspace_id", subjectField: "workspaceId" }] },
  };
  if (scope === "profile") {
    const subject = probeSubjectForScope("profile", subjects);
    const profileColumn = table === "creator_profiles" ? "id" : table === "frameworks" ? "owner_profile_id" : "profile_id";
    return { subject, predicate: { kind: "composite", matches: [
      { column: profileColumn, subjectField: "profileId" },
      { column: "workspace_id", subjectField: "workspaceId" },
    ] } };
  }
  const snapshotMatches = scope === "system" || sourceIds
    ? probeRelatedSnapshotMatches(columns, jsonPaths, sourceIds)
    : [];
  if (snapshotMatches.length > 0) return {
    subject: probeRelatedSubject(subjects),
    predicate: { kind: "snapshot_indirect", matches: snapshotMatches },
  };
  const subject = probeSubjectForScope(scope, subjects);
  if (scope === "system") return { subject, predicate: { kind: "unscoped", installationSubjectField: "installationId" } };
  if (scope === "identity") {
    if (table === "user") return { subject, predicate: { kind: "direct", matches: [{ column: "id", subjectField: "authUserId" }] } };
    if (table === "account" || table === "session") return { subject, predicate: { kind: "direct", matches: [{ column: "user_id", subjectField: "authUserId" }] } };
    return { subject, predicate: { kind: "direct", matches: [{ column: table === "users" ? "id" : "user_id", subjectField: "userId" }] } };
  }
  return { subject, predicate: { kind: "direct", matches: [
    { column: table === "workspaces" ? "id" : "workspace_id", subjectField: "workspaceId" },
  ] } };
}

function assertProbePredicateIsExecutable(
  targetTable: string,
  subject: LifecycleSubject,
  predicate: LifecycleSubjectPredicate,
  migrations: MigrationInventory
): void {
  if (predicate.kind === "unscoped") return;
  const assertSubjectField = (field: LifecycleSubjectField) => {
    if (!(field in subject)) throw new Error(`residue predicate uses unavailable subject field: ${targetTable}.${field}`);
  };
  const assertColumn = (tableName: string, column: string) => {
    const table = migrations.tables.find((candidate) => candidate.name === tableName);
    if (!table?.columns.includes(column)) throw new Error(`residue predicate uses unknown column: ${tableName}.${column}`);
  };
  if (predicate.kind === "direct" || predicate.kind === "composite") {
    for (const match of predicate.matches) {
      assertColumn(targetTable, match.column);
      assertSubjectField(match.subjectField);
    }
    return;
  }
  if (predicate.kind === "snapshot_pairs") {
    if (subject.scope !== "identity") throw new Error(`residue verification predicate has wrong subject: ${targetTable}`);
    assertColumn(targetTable, predicate.identifierColumn);
    assertColumn(targetTable, predicate.valueColumn);
    return;
  }
  if (predicate.matches.length === 0 || (subject.scope !== "related" && subject.scope !== "workspace")) {
    throw new Error(`residue snapshot predicate has no scoped values: ${targetTable}`);
  }
  for (const match of predicate.matches) {
    assertColumn(targetTable, match.location.column);
    if (match.location.kind === "json_path" && !match.location.path.startsWith("$.")) throw new Error(`residue snapshot predicate has invalid JSON path: ${targetTable}.${match.location.column}${match.location.path}`);
  }
}

/**
 * Build the residue population from schema facts plus the lifecycle registry.
 * It intentionally does not accept or import executor targets: a deletion
 * implementation cannot make its own omissions invisible to this verifier.
 */
export function deriveExpectedResidueProbes(
  migrations: MigrationInventory,
  registry: readonly LifecycleClassEntry[],
  rowClasses: readonly RowClassInventoryEntry[],
  jsonPaths: readonly JsonPathInventoryEntry[],
  subjects: LifecycleRuntimeSubjects,
  supportingStores: readonly SupportingLifecycleStoreEntry[]
): readonly ExpectedResidueProbe[] {
  const tables = new Map(migrations.tables.map((table) => [table.name, table]));
  const appProbes = registry.map((entry) => {
    const table = tables.get(entry.table);
    if (!table) throw new Error(`cannot derive probe for unknown table '${entry.table}'`);
    let columns: readonly string[];
    const fieldSet = entry.fieldSet;
    if (fieldSet.kind === "all_columns") columns = table.columns;
    else if (fieldSet.kind === "columns") columns = fieldSet.columns;
    else {
      const excluded: readonly string[] = fieldSet.excluding;
      columns = table.columns.filter((column) => !excluded.includes(column));
    }
    columns = [...columns].sort();
    const governed = jsonPaths
      .filter((path) => path.table === entry.table
        && columns.includes(path.column)
        && entry.governedJsonPaths.includes(`${path.column}${path.path}`))
      .map((path) => `${path.column}${path.path}`)
      .sort();
    if (governed.length !== entry.governedJsonPaths.length) {
      throw new Error(`cannot derive complete JSON probe paths for ${entry.table}.${entry.rowClass}`);
    }
    const rowClass = rowClasses.find(
      (candidate) => candidate.table === entry.table && candidate.rowClass === entry.rowClass
    );
    if (!rowClass) throw new Error(`cannot derive selector for ${entry.table}.${entry.rowClass}`);
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
    const { subject, predicate: subjectPredicate } = probeSubjectAndPredicateFor(
      entry.table,
      entry.rowClass,
      entry.scope,
      columns,
      governed,
      subjects
    );
    assertProbePredicateIsExecutable(entry.table, subject, subjectPredicate, migrations);
    return {
      registryKey: `${entry.table}::${entry.rowClass}::${entry.fieldSet.name}`,
      resourceKind: "app_table" as const,
      action: entry.action,
      executor: entry.executor,
      probe: entry.residueProbe,
      table: entry.table,
      rowClass: entry.rowClass,
      columns,
      foreignKeyColumns: table.foreignKeyColumns.filter((column) => columns.includes(column)).sort(),
      foreignKeys: table.foreignKeys.filter((foreignKey) =>
        foreignKey.columns.some((column) => columns.includes(column))
      ),
      jsonPaths: governed,
      selector: { scope: entry.scope, retention: entry.retention, discriminator },
      subject,
      subjectPredicate,
    };
  });
  const supportingProbes = supportingStores.map((store) => {
    const columns = [...store.fields].sort();
    const governed = [...store.governedJsonPaths].sort();
    const { subject, predicate: subjectPredicate } = probeSubjectAndPredicateFor(
      store.store,
      "supporting_store",
      store.scope,
      columns,
      governed,
      subjects,
      store.subjectBinding === "source_ids"
    );
    if (subjectPredicate.kind === "snapshot_indirect") {
      for (const match of subjectPredicate.matches) {
        if (!columns.includes(match.location.column)) throw new Error(`supporting residue predicate uses unknown field: ${store.store}.${match.location.column}`);
        if (match.location.kind === "json_path" && !governed.includes(`${match.location.column}${match.location.path}`)) throw new Error(`supporting residue predicate uses unknown JSON path: ${store.store}.${match.location.column}${match.location.path}`);
      }
    }
    return {
      registryKey: `supporting::${store.store}`,
      resourceKind: "supporting_store" as const,
      action: store.action,
      executor: store.executor,
      probe: store.residueProbe,
      table: store.store,
      rowClass: "supporting_store",
      columns,
      foreignKeyColumns: [],
      foreignKeys: [],
      jsonPaths: governed,
      selector: { scope: store.scope, retention: store.retention, discriminator: null },
      subject,
      subjectPredicate,
    };
  });
  return [...appProbes, ...supportingProbes];
}

function probeSnapshotValues(
  subject: LifecycleSubject,
  set: LifecycleSnapshotSet
): readonly string[] {
  if (set === "workspace.stripeEventIds") {
    return subject.scope === "workspace" ? subject.stripeEventIds : [];
  }
  if (subject.scope !== "related") return [];
  const [, , , field] = set.split(".") as [
    "related",
    "activeSubject",
    "sourceIds",
    keyof ProfileLifecycleSubject["sourceIds"],
  ];
  return subject.activeSubject.sourceIds[field];
}

function probeValueAtLocation(
  row: Readonly<Record<string, unknown>>,
  location: LifecycleSnapshotLocation
): unknown {
  const value = row[location.column];
  if (location.kind === "column") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Readonly<Record<string, unknown>>)[location.path.slice(2)];
}

/** Independent row matcher used by residue probes; it does not call executor matching code. */
export function residueProbeMatchesRow(
  target: Pick<ExpectedResidueProbe, "selector" | "subject" | "subjectPredicate">,
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
      const value = probeValueAtLocation(row, match.location);
      return typeof value === "string"
        && probeSnapshotValues(target.subject, match.subjectSet).includes(value);
    });
  }
  return predicate.matches.every((match) => {
    if (!(match.subjectField in target.subject)) return false;
    return row[match.column] === target.subject[match.subjectField as keyof typeof target.subject];
  });
}

export function assertProbeClosure(
  expected: readonly ExpectedResidueProbe[],
  available: Partial<ResidueProbeImplementations>
): void {
  const missing = expected.filter(
    (item) => typeof available[item.probe]?.execute !== "function"
  );
  if (missing.length > 0) {
    throw new Error(
      missing.map((item) => `missing independent probe '${item.probe}' for ${item.registryKey}`).join("\n")
    );
  }
}

export function assertExecutorProbeAgreement(
  executorTargets: readonly LifecycleExecutionTarget[],
  expectedProbes: readonly ExpectedResidueProbe[]
): void {
  const failures: string[] = [];
  const executorKeys = new Set<string>();
  for (const target of executorTargets) {
    if (executorKeys.has(target.registryKey)) failures.push(`duplicate executor target: ${target.registryKey}`);
    executorKeys.add(target.registryKey);
  }
  const probeKeys = new Set<string>();
  for (const target of expectedProbes) {
    if (probeKeys.has(target.registryKey)) failures.push(`duplicate independent probe target: ${target.registryKey}`);
    probeKeys.add(target.registryKey);
  }
  const executorByKey = new Map(
    executorTargets.map((target) => [target.registryKey, target])
  );
  const probeByKey = new Map(
    expectedProbes.map((target) => [target.registryKey, target])
  );
  for (const [key, executorTarget] of executorByKey) {
    const probeTarget = probeByKey.get(key);
    if (!probeTarget) {
      failures.push(`executor target has no independent probe: ${key}`);
      continue;
    }
    const disagree = (dimension: string, left: unknown, right: unknown) => {
      if (JSON.stringify(left) !== JSON.stringify(right)) {
        failures.push(`executor/probe ${dimension} disagreement: ${key}`);
      }
    };
    disagree("resource-kind", executorTarget.resourceKind, probeTarget.resourceKind);
    disagree("table", executorTarget.table, probeTarget.table);
    disagree("row-class", executorTarget.rowClass, probeTarget.rowClass);
    disagree("action", executorTarget.action, probeTarget.action);
    disagree("executor", executorTarget.executor, probeTarget.executor);
    disagree("probe", executorTarget.probe, probeTarget.probe);
    disagree("field", executorTarget.columns, probeTarget.columns);
    disagree("foreign-key", executorTarget.foreignKeyColumns, probeTarget.foreignKeyColumns);
    disagree("foreign-key-edge", executorTarget.foreignKeys, probeTarget.foreignKeys);
    disagree("JSON-path", executorTarget.jsonPaths, probeTarget.jsonPaths);
    disagree("selector", executorTarget.selector, probeTarget.selector);
    disagree("subject", executorTarget.subject, probeTarget.subject);
    disagree("subject-predicate", executorTarget.subjectPredicate, probeTarget.subjectPredicate);
  }
  for (const key of probeByKey.keys()) {
    if (!executorByKey.has(key)) {
      failures.push(`independent probe has no executor target: ${key}`);
    }
  }
  if (failures.length > 0) throw new Error(failures.sort().join("\n"));
}

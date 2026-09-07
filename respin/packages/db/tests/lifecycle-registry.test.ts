import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DYNAMIC_LIFECYCLE_WRITER,
  APP_TABLES,
  EXTERNAL_WRITER_AUTHORITIES,
  JSON_COLUMN_INVENTORY,
  JSON_PATH_INVENTORY,
  LIFECYCLE_REGISTRY,
  LIFECYCLE_WRITER_INVENTORY,
  PG_BOSS_JOB_JSON_PATHS,
  ROW_CLASS_INVENTORY,
  SUPPORTING_LIFECYCLE_STORES,
  validateLifecycleClosure,
  type LifecycleClassEntry,
  type LifecycleFieldSetFor,
} from "../src/creator-data-registry";
import { LIFECYCLE_EXECUTORS } from "../src/lifecycle-executors";
import {
  AUTOPSY_JOB_PAYLOAD_SOURCE_FILES,
  migrationInventory,
  validateLifecycleSourceInventory,
  type MigrationForeignKey,
  type MigrationInventory,
} from "../src/lifecycle-inventory";
import { LIFECYCLE_PROBES } from "../src/lifecycle-probes";

const RESPIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS = join(RESPIN, "packages/db/migrations");
const migrations = migrationInventory(
  readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }))
);

const base = () => ({
  migrations,
  registry: LIFECYCLE_REGISTRY as readonly LifecycleClassEntry[],
  writers: LIFECYCLE_WRITER_INVENTORY,
  rowClasses: ROW_CLASS_INVENTORY,
  jsonPaths: JSON_PATH_INVENTORY,
  jsonColumns: JSON_COLUMN_INVENTORY,
  externalWriters: EXTERNAL_WRITER_AUTHORITIES,
  supportingStores: SUPPORTING_LIFECYCLE_STORES,
  executors: LIFECYCLE_EXECUTORS,
  probes: LIFECYCLE_PROBES,
});

function mutateForeignKey(
  inventory: MigrationInventory,
  tableName: string,
  constraintName: string,
  mutate: (foreignKey: MigrationForeignKey) => MigrationForeignKey
): MigrationInventory {
  return {
    ...inventory,
    tables: inventory.tables.map((table) => table.name !== tableName ? table : {
      ...table,
      foreignKeys: table.foreignKeys.map((foreignKey) =>
        foreignKey.constraintName === constraintName ? mutate(foreignKey) : foreignKey
      ),
    }),
  };
}

describe("compile-closed lifecycle registry", () => {
  it("keeps split field sets table-specific at compile time", () => {
    const stripePayload: LifecycleFieldSetFor<"stripe_events"> = {
      name: "provider_payload",
      kind: "columns",
      columns: ["payload"],
    };
    // @ts-expect-error job_id belongs to system_model_usage, not stripe_events
    const wrongTableField: LifecycleFieldSetFor<"stripe_events"> = { name: "linkable_source_ids", kind: "columns", columns: ["job_id"] };
    // @ts-expect-error there is no such physical stripe_events column
    const missingColumn: LifecycleFieldSetFor<"stripe_events"> = { name: "provider_payload", kind: "columns", columns: ["future_payload"] };
    // @ts-expect-error field-set names are closed per table, not free-form labels
    const wrongName: LifecycleFieldSetFor<"stripe_events"> = { name: "financial_facts", kind: "columns", columns: ["payload"] };
    // @ts-expect-error unsplit tables may only use their complete row
    const invalidSplit: LifecycleFieldSetFor<"brain_docs"> = { name: "content_free_metadata", kind: "columns", columns: ["id"] };
    expect(stripePayload.columns).toEqual(["payload"]);
    void wrongTableField;
    void missingColumn;
    void wrongName;
    void invalidSplit;
    // @ts-expect-error external writers and supporting stores are mandatory gate inputs
    const omittedSourceGateArguments = () => validateLifecycleSourceInventory(new Map(), ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY);
    void omittedSourceGateArguments;
  });

  it("covers every current migration table and every field partition", () => {
    expect(migrations.tables.map((table) => table.name)).toEqual([...APP_TABLES].sort());
    expect(() => validateLifecycleClosure(base())).not.toThrow();
  });

  it("reddens when a RESTRICT link into a root has no erasure coverage under that root's scope FOR ITS ROW CLASS (round-1 tenancy BLOCK, row-class aware since round 2)", () => {
    // Planted negative 1: the snapshot's workspace link loses its workspace-scope entry (the round-1 BLOCK).
    const withoutSnapshotLink = LIFECYCLE_REGISTRY.filter(
      (entry) => !(entry.table === "deletion_membership_snapshots" && entry.scope === "workspace")
    ) as readonly LifecycleClassEntry[];
    expect(() => validateLifecycleClosure({ ...base(), registry: withoutSnapshotLink })).toThrow(
      /restrict foreign key into scope root has no erasure coverage under that scope: deletion_membership_snapshots\.identity_row\.deletion_membership_snapshots_workspace_id_workspaces_id_fk/
    );
    // Planted negative 2 (the round-2 tenancy probe P3c): the workspace-class
    // receipt's linkable entry stops erasing while the profile-class entry —
    // which never touches `scope = 'workspace'` rows — still covers the same
    // column. A table-level rule accepted this; the row-class rule does not.
    const workspaceLinkInert = LIFECYCLE_REGISTRY.map((entry) =>
      entry.table === "deletion_operations" && entry.rowClass === "workspace_row" && entry.scope === "workspace" && entry.fieldSet.name === "linkable_identifiers"
        ? ({ ...entry, action: "not_applicable", retention: "installation_lifetime", executor: "system_retention", residueProbe: "system_residue" } as LifecycleClassEntry)
        : (entry as LifecycleClassEntry)
    );
    expect(() => validateLifecycleClosure({ ...base(), registry: workspaceLinkInert })).toThrow(
      /deletion_operations\.workspace_row\.deletion_operations_workspace_id_workspaces_id_fk/
    );
    // The structurally-null list is what keeps the rule from demanding coverage
    // for a link a row class can never carry: the identity-class receipt has no
    // workspace link, so removing every workspace-scope entry for identity rows
    // is not a finding.
    expect(() => validateLifecycleClosure(base())).not.toThrow();
  });

  it("declares the one dynamic writer the scanner cannot see, and that declaration matches the tree", () => {
    const file = join(RESPIN, DYNAMIC_LIFECYCLE_WRITER.file);
    expect(existsSync(file)).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source).toContain("DELETE FROM ${relation(");
    expect(source).toContain("UPDATE ${relation(");
    expect([...DYNAMIC_LIFECYCLE_WRITER.actions].sort()).toEqual(["cascade", "delete_explicit", "pseudonymise"]);
    // It is a physical writer only where it INSERTs stub roots (scannable literals).
    const listedFor = LIFECYCLE_WRITER_INVENTORY.filter((writer) =>
      (writer.physicalWriters as readonly string[]).includes(DYNAMIC_LIFECYCLE_WRITER.file)
    ).map((writer) => writer.table).sort();
    expect(listedFor).toEqual(["creator_profiles", "user", "users", "workspaces"]);
  });

  it("reddens for an unregistered migration table and a fake writer", () => {
    const fakeMigration = migrationInventory([
      ...readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") })),
      { name: "9999_fake.sql", sql: 'CREATE TABLE "future_creator_rows" (\n "id" uuid NOT NULL\n);' },
    ]);
    expect(() => validateLifecycleClosure({ ...base(), migrations: fakeMigration })).toThrow(/unregistered migration table: future_creator_rows/);
    expect(() => validateLifecycleClosure({ ...base(), writers: [...LIFECYCLE_WRITER_INVENTORY, { table: "brain_docs", owner: "packages/fake-writer.ts", physicalWriters: ["packages/fake-writer.ts"] }] })).toThrow(/unregistered writer/);
    const changedOwner = (LIFECYCLE_REGISTRY as readonly LifecycleClassEntry[]).map((entry) =>
      entry.table === "brain_docs"
        ? { ...entry, writerOwner: "packages/fake-writer.ts" }
        : entry
    ) as readonly LifecycleClassEntry[];
    expect(() => validateLifecycleClosure({ ...base(), registry: changedOwner })).toThrow(/missing writer|unregistered writer/);
  });

  it("reddens for a duplicate key, overlapping fields and missing fields", () => {
    const stripe = LIFECYCLE_REGISTRY.find((entry) => entry.table === "stripe_events" && entry.fieldSet.name === "provider_payload")!;
    expect(() => validateLifecycleClosure({ ...base(), registry: [...LIFECYCLE_REGISTRY, stripe] })).toThrow(/duplicate registry key/);
    // The production type intentionally makes this impossible; the cast models
    // malformed external/runtime input so closure remains a fail-closed backstop.
    const overlapping = LIFECYCLE_REGISTRY.map((entry) => entry.table === "stripe_events" && entry.fieldSet.name === "content_free_metadata" ? { ...entry, fieldSet: { name: "content_free_metadata" as const, kind: "all_columns" as const } } : entry) as unknown as readonly LifecycleClassEntry[];
    expect(() => validateLifecycleClosure({ ...base(), registry: overlapping })).toThrow(/overlapping field set|all_columns is not proven exclusive/);
    const missing = LIFECYCLE_REGISTRY.filter((entry) => !(entry.table === "stripe_events" && entry.fieldSet.name === "content_free_metadata"));
    expect(() => validateLifecycleClosure({ ...base(), registry: missing })).toThrow(/missing field: stripe_events/);
  });

  it("reddens for a missing row class, writer, executor, probe or governed JSON path", () => {
    expect(() => validateLifecycleClosure({ ...base(), rowClasses: ROW_CLASS_INVENTORY.filter((item) => !(item.table === "frameworks" && item.rowClass === "product_seed")) })).toThrow(/unregistered row class: frameworks.product_seed/);
    expect(() => validateLifecycleClosure({ ...base(), writers: LIFECYCLE_WRITER_INVENTORY.filter((item) => item.table !== "brain_docs") })).toThrow(/missing writer: brain_docs/);
    const { profile_cascade: _missingExecutor, ...executors } = LIFECYCLE_EXECUTORS;
    const { profile_residue: _missingProbe, ...probes } = LIFECYCLE_PROBES;
    void _missingExecutor;
    void _missingProbe;
    expect(() => validateLifecycleClosure({ ...base(), executors })).toThrow(/missing executor: profile_cascade/);
    expect(() => validateLifecycleClosure({ ...base(), probes })).toThrow(/missing probe: profile_residue/);
    expect(() => validateLifecycleClosure({ ...base(), jsonPaths: JSON_PATH_INVENTORY.slice(1) })).toThrow(/missing JSON path inventory/);
  });

  it("proves discriminator and JSON path tokens against their writer sources", () => {
    const paths = new Set([
      ...ROW_CLASS_INVENTORY.flatMap((item) => item.discriminator
        ? [item.discriminator.sourceFile, ...(item.discriminator.exclusionSourceFile ? [item.discriminator.exclusionSourceFile] : [])]
        : []),
      ...JSON_PATH_INVENTORY.map((item) => item.sourceFile),
      ...EXTERNAL_WRITER_AUTHORITIES.map((item) => item.sourceFile),
      ...SUPPORTING_LIFECYCLE_STORES.map((item) => item.writerOwner),
      ...AUTOPSY_JOB_PAYLOAD_SOURCE_FILES,
    ]);
    const sources = new Map([...paths].map((path) => [path, readFileSync(join(RESPIN, path), "utf8")]));
    expect(() => validateLifecycleSourceInventory(sources, ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, EXTERNAL_WRITER_AUTHORITIES, SUPPORTING_LIFECYCLE_STORES)).not.toThrow();
    expect(() => validateLifecycleSourceInventory(new Map(), ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, EXTERNAL_WRITER_AUTHORITIES, SUPPORTING_LIFECYCLE_STORES)).toThrow(/missing row-class discriminator source|missing JSON-path source|missing external-writer source|missing supporting-store source/);
    for (const token of ["sourceUrl", "sourceReference"] as const) {
      const withoutTranscriptSource = new Map(sources);
      withoutTranscriptSource.set(
        "packages/db/src/trends-storage.ts",
        sources.get("packages/db/src/trends-storage.ts")!.replaceAll(token, "removedTranscriptToken")
      );
      expect(
        () => validateLifecycleSourceInventory(withoutTranscriptSource, ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, EXTERNAL_WRITER_AUTHORITIES, SUPPORTING_LIFECYCLE_STORES),
        `${token} lost its persisted-source witness`
      ).toThrow(/missing JSON-path source: trend_transcripts.provenance/);
    }
  });

  it("pins the exact enabled Better Auth verification-row shapes from the installed runtime", () => {
    const authConfig = readFileSync(join(RESPIN, "packages/auth/src/create-auth.ts"), "utf8");
    const passwordRoutes = readFileSync(join(RESPIN, "node_modules/better-auth/dist/api/routes/password.mjs"), "utf8");
    const oauthState = readFileSync(join(RESPIN, "node_modules/better-auth/dist/state.mjs"), "utf8");
    const authContext = readFileSync(join(RESPIN, "node_modules/better-auth/dist/context/create-context.mjs"), "utf8");

    expect(authConfig).toContain("emailAndPassword: {");
    expect(authConfig).toContain("enabled: true");
    expect(passwordRoutes).toContain("const verificationToken = generateId(24)");
    expect(passwordRoutes).toContain("value: user.user.id");
    expect(passwordRoutes).toContain("identifier: `reset-password:${verificationToken}`");
    expect(authContext).toContain('(isStateful ? "database" : "cookie")');
    expect(oauthState).toContain("const state = generateRandomString(32)");
    expect(oauthState).toContain("value: JSON.stringify({");
    expect(oauthState).toContain("identifier: state");
    expect(oauthState).toContain("userId: z.coerce.string()");
  });

  it("reddens when a migration adds a discriminator value with no row class", () => {
    const expanded = {
      ...migrations,
      enums: {
        ...migrations.enums,
        trend_rights_scope: [
          ...migrations.enums.trend_rights_scope,
          "partner_shared",
        ],
      },
    };
    expect(() => validateLifecycleClosure({ ...base(), migrations: expanded })).toThrow(/unregistered discriminator value/);

    const omittedExclusion = ROW_CLASS_INVENTORY.map((item) =>
      item.table === "trend_transcripts" && item.discriminator
        ? { ...item, discriminator: { ...item.discriminator, excludedEnumValues: [] } }
        : item
    );
    expect(() => validateLifecycleClosure({ ...base(), rowClasses: omittedExclusion })).toThrow(/inconsistent discriminator exclusions|unregistered discriminator value: trend_transcripts.product_seed/);

    const inventedExclusion = ROW_CLASS_INVENTORY.map((item) =>
      item.table === "trend_transcripts" && item.discriminator
        ? { ...item, discriminator: { ...item.discriminator, excludedEnumValues: [...item.discriminator.excludedEnumValues, "future_basis"] } }
        : item
    );
    expect(() => validateLifecycleClosure({ ...base(), rowClasses: inventedExclusion })).toThrow(/unknown excluded discriminator value/);
  });

  it("fails closed on valid SQL formatting the inventory parser does not support", () => {
    expect(() => migrationInventory([{ name: "one-line.sql", sql: 'CREATE TABLE "future_rows" ("id" uuid NOT NULL);' }])).toThrow(/unsupported CREATE TABLE syntax/);
    expect(() => migrationInventory([{ name: "unquoted.sql", sql: "CREATE TABLE future_rows (\n id uuid NOT NULL\n);" }])).toThrow(/unsupported CREATE TABLE syntax/);
    for (const family of ["TEMP", "TEMPORARY", "UNLOGGED", "FOREIGN", "GLOBAL TEMP", "LOCAL TEMPORARY"] as const) {
      expect(
        () => migrationInventory([{ name: `${family}.sql`, sql: `CREATE ${family} TABLE "future_rows" (\n "id" uuid NOT NULL\n);` }]),
        `${family} TABLE was silently omitted`
      ).toThrow(/unsupported CREATE TABLE syntax/);
    }
    expect(() => migrationInventory([{
      name: "two-columns-one-line.sql",
      sql: 'CREATE TABLE "future_rows" (\n "id" uuid NOT NULL, "second_id" uuid NOT NULL\n);',
    }])).toThrow(/multiple column declarations on one line/);
    expect(() => migrationInventory([{
      name: "quoted-then-unquoted-one-line.sql",
      sql: 'CREATE TABLE "future_rows" (\n "id" uuid NOT NULL, second_id uuid NOT NULL\n);',
    }])).toThrow(/multiple column declarations on one line/);
    expect(() => migrationInventory([{
      name: "inline-references.sql",
      sql: [
        'CREATE TABLE "parents" (', ' "id" uuid NOT NULL', ');',
        'CREATE TABLE "children" (', ' "id" uuid NOT NULL,',
        ' "parent_id" uuid REFERENCES "parents"("id") ON DELETE cascade', ');',
      ].join("\n"),
    }])).toThrow(/CREATE TABLE foreign keys and inline REFERENCES/);
    expect(() => migrationInventory([{
      name: "alter-add-inline-references.sql",
      sql: [
        'CREATE TABLE "parents" (', ' "id" uuid NOT NULL', ');',
        'CREATE TABLE "children" (', ' "id" uuid NOT NULL', ');',
        'ALTER TABLE "children" ADD COLUMN "parent_id" uuid REFERENCES "parents"("id") ON DELETE cascade;',
      ].join("\n"),
    }])).toThrow(/inline REFERENCES in ALTER TABLE ADD COLUMN/);
    expect(() => migrationInventory([{
      name: "create-table-foreign-key.sql",
      sql: [
        'CREATE TABLE "parents" (', ' "id" uuid NOT NULL', ');',
        'CREATE TABLE "children" (', ' "id" uuid NOT NULL,', ' "parent_id" uuid,',
        ' CONSTRAINT "children_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "parents"("id")', ');',
      ].join("\n"),
    }])).toThrow(/CREATE TABLE foreign keys and inline REFERENCES/);
    expect(() => migrationInventory([{
      name: "multi-action-add-column.sql",
      sql: [
        'CREATE TABLE "future_rows" (',
        ' "id" uuid NOT NULL',
        ');',
        'ALTER TABLE "future_rows" ADD COLUMN "first_value" text, ADD COLUMN "second_value" text;',
      ].join("\n"),
    }])).toThrow(/multi-action ALTER TABLE ADD COLUMN/);
    const table = [
      'CREATE TABLE "future_rows" (',
      ' "id" uuid NOT NULL,',
      ' "value" integer',
      ');',
    ].join("\n");
    for (const action of [
      'ALTER TABLE "future_rows" ADD "hidden" text;',
      'ALTER TABLE "future_rows" RENAME COLUMN "value" TO "renamed";',
      'ALTER TABLE "future_rows" ADD CONSTRAINT hidden_fk FOREIGN KEY ("id") REFERENCES "future_rows"("id") ON DELETE cascade;',
    ] as const) {
      expect(
        () => migrationInventory([{ name: "0000.sql", sql: table }, { name: "0001.sql", sql: action }]),
        `unsupported ALTER action was silently accepted: ${action}`
      ).toThrow(/unsupported ALTER TABLE action/);
    }

    const dropThenAdd = migrationInventory([{
      name: "ordered-column-replay.sql",
      sql: [
        table,
        'ALTER TABLE "future_rows" DROP COLUMN "value";',
        'ALTER TABLE "future_rows" ADD COLUMN "value" text;',
      ].join("\n"),
    }]);
    expect(dropThenAdd.tables.find((entry) => entry.name === "future_rows")).toMatchObject({
      columns: ["id", "value"],
      columnTypes: { id: "uuid", value: "text" },
    });

    const qualifiedTypes = migrationInventory([{
      name: "qualified-types.sql",
      sql: [
        'CREATE TABLE "qualified_rows" (',
        ' "id" uuid NOT NULL,',
        ' "created_payload" "pg_catalog"."jsonb"',
        ');',
        'ALTER TABLE "qualified_rows" ADD COLUMN "added_payload" "pg_catalog"."jsonb";',
      ].join("\n"),
    }]);
    expect(qualifiedTypes.tables.find((entry) => entry.name === "qualified_rows")?.columnTypes).toMatchObject({
      created_payload: "jsonb",
      added_payload: "jsonb",
    });

    const mixedConstraintActions = migrationInventory([{
      name: "mixed-constraint-actions.sql",
      sql: [
        'CREATE TABLE "parents" (', ' "id" uuid NOT NULL', ');',
        'CREATE TABLE "children" (', ' "id" uuid NOT NULL,', ' "parent_id" uuid', ');',
        'ALTER TABLE "children" ADD CONSTRAINT "children_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE cascade ON UPDATE no action, DROP CONSTRAINT "children_parent_fk";',
      ].join("\n"),
    }]);
    expect(mixedConstraintActions.tables.find((entry) => entry.name === "children")?.foreignKeys).toEqual([]);

    const multiForeignKeys = migrationInventory([{
      name: "multi-foreign-keys.sql",
      sql: [
        'CREATE TABLE "parent_a" (', ' "id" uuid NOT NULL', ');',
        'CREATE TABLE "parent_b" (', ' "id" uuid NOT NULL', ');',
        'CREATE TABLE "children" (', ' "id" uuid NOT NULL,',
        ' "parent_a_id" uuid,', ' "parent_b_id" uuid', ');',
        'ALTER TABLE "children" ADD CONSTRAINT "children_parent_a_fk" FOREIGN KEY ("parent_a_id") REFERENCES "parent_a"("id") ON DELETE cascade ON UPDATE no action, ADD CONSTRAINT "children_parent_b_fk" FOREIGN KEY ("parent_b_id") REFERENCES "parent_b"("id") ON DELETE restrict ON UPDATE no action;',
      ].join("\n"),
    }]);
    expect(multiForeignKeys.tables.find((entry) => entry.name === "children")?.foreignKeys).toEqual([
      {
        constraintName: "children_parent_a_fk", columns: ["parent_a_id"],
        referencedTable: "parent_a", referencedColumns: ["id"], onDelete: "cascade",
      },
      {
        constraintName: "children_parent_b_fk", columns: ["parent_b_id"],
        referencedTable: "parent_b", referencedColumns: ["id"], onDelete: "restrict",
      },
    ]);
  });

  it("matches the installed pg-boss physical tables and columns, including dynamic partitions", async () => {
    const plansPath = join(RESPIN, "node_modules/pg-boss/dist/plans.js");
    const plansSource = readFileSync(plansPath, "utf8");
    const plans = await import(pathToFileURL(plansPath).href) as {
      expectedManagedTables(schema: string, partitioned: boolean, partitions: readonly { table: string; policy: string }[]): readonly string[];
      expectedManagedColumns(schema: string, partitioned: boolean, partitions: readonly { table: string; policy: string }[]): readonly { table: string; columns: readonly string[] }[];
    };
    const dynamicJob = "j_lifecycle_probe";
    const managedTables = plans.expectedManagedTables("pgboss", true, [{ table: dynamicJob, policy: "standard" }]);
    const managedColumns = new Map(
      plans.expectedManagedColumns("pgboss", true, [{ table: dynamicJob, policy: "standard" }])
        .map((entry) => [entry.table, [...entry.columns].sort()] as const)
    );
    const registered = new Map(SUPPORTING_LIFECYCLE_STORES.map((entry) => [entry.store, [...entry.fields].sort()]));
    for (const table of managedTables.filter((name) => name !== dynamicJob)) {
      expect(registered.get(`pgboss.${table}`), `missing pg-boss table ${table}`).toEqual(managedColumns.get(table));
    }
    expect(registered.get("pgboss.job_partition:*")).toEqual(managedColumns.get(dynamicJob));
    expect(registered.get("pgboss.queue_stats_partition:*")).toEqual(managedColumns.get("queue_stats"));
    expect(plansSource).toContain("part_name := 'queue_stats_' ||");
    expect(plansSource).toContain("PARTITION OF ${schema}.queue_stats");
    expect(plansSource).toContain("const FIXED_MANAGED_TABLES = ['version', 'queue', 'schedule', 'subscription', 'bam', 'warning', 'queue_stats', 'job_dependency']");
    expect(PG_BOSS_JOB_JSON_PATHS).toEqual([
      "data$.jobId",
      "data$.itemId",
      "data$.attemptId",
      "data$.autopsyCacheClaimId",
      "data$.runId",
    ]);
    const runtimeSource = readFileSync(join(RESPIN, "worker/pg-boss-runtime.ts"), "utf8");
    const productionSource = readFileSync(join(RESPIN, "worker/production.ts"), "utf8");
    for (const field of ["jobId", "itemId", "attemptId", "autopsyCacheClaimId", "runId"] as const) {
      expect(runtimeSource, `${field} is absent from the closed autopsy payload`).toMatch(
        new RegExp(`(?:"${field}"|${field}:)`)
      );
    }
    expect(productionSource).toContain("runId: attemptId");
    const inventoryPaths = new Set([
      ...ROW_CLASS_INVENTORY.flatMap((item) => item.discriminator
        ? [item.discriminator.sourceFile, ...(item.discriminator.exclusionSourceFile ? [item.discriminator.exclusionSourceFile] : [])]
        : []),
      ...JSON_PATH_INVENTORY.map((item) => item.sourceFile),
      ...EXTERNAL_WRITER_AUTHORITIES.map((item) => item.sourceFile),
      ...SUPPORTING_LIFECYCLE_STORES.map((item) => item.writerOwner),
      ...AUTOPSY_JOB_PAYLOAD_SOURCE_FILES,
    ]);
    const inventorySources = new Map<string, string>(
      [...inventoryPaths].map((path) => [path, readFileSync(join(RESPIN, path), "utf8")])
    );
    const withExtraPayloadId = new Map(inventorySources);
    withExtraPayloadId.set(
      "worker/pg-boss-runtime.ts",
      inventorySources.get("worker/pg-boss-runtime.ts")!.replace('"runId",', '"runId", "futureSourceId",')
    );
    expect(() => validateLifecycleSourceInventory(
      withExtraPayloadId,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      EXTERNAL_WRITER_AUTHORITIES,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/pg-boss job identifier paths disagree with authoritative closed payload/);
    const withProducerOnlyId = new Map(inventorySources);
    withProducerOnlyId.set(
      "worker/run-once.ts",
      inventorySources.get("worker/run-once.ts")!.replace(
        'readonly job: "autopsy";',
        'readonly futureSourceId: string;\n  readonly job: "autopsy";'
      )
    );
    withProducerOnlyId.set(
      "worker/production.ts",
      inventorySources.get("worker/production.ts")!.replace(
        'job: "autopsy",',
        'job: "autopsy",\n    futureSourceId: "future_source",'
      )
    );
    expect(() => validateLifecycleSourceInventory(
      withProducerOnlyId,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      EXTERNAL_WRITER_AUTHORITIES,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/pg-boss job identifier paths disagree with authoritative closed payload/);
    const withProducerSpread = new Map(inventorySources);
    withProducerSpread.set(
      "worker/production.ts",
      inventorySources.get("worker/production.ts")!.replace(
        'job: "autopsy",',
        '...{ futureSourceId: "future_source" },\n    job: "autopsy",'
      )
    );
    expect(() => validateLifecycleSourceInventory(
      withProducerSpread,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      EXTERNAL_WRITER_AUTHORITIES,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/pg-boss job identifier paths disagree with authoritative closed payload/);
    const withParserKeySpread = new Map(inventorySources);
    withParserKeySpread.set(
      "worker/pg-boss-runtime.ts",
      inventorySources.get("worker/pg-boss-runtime.ts")!.replace(
        '"job", "runId",',
        '...["futureSourceId"], "job", "runId",'
      )
    );
    expect(() => validateLifecycleSourceInventory(
      withParserKeySpread,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      EXTERNAL_WRITER_AUTHORITIES,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/pg-boss job identifier paths disagree with authoritative closed payload/);
    const withDynamicProducerKey = new Map(inventorySources);
    withDynamicProducerKey.set(
      "worker/production.ts",
      inventorySources.get("worker/production.ts")!.replace(
        'job: "autopsy",',
        '[hiddenKey]: "future_source",\n    job: "autopsy",'
      )
    );
    expect(() => validateLifecycleSourceInventory(
      withDynamicProducerKey,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      EXTERNAL_WRITER_AUTHORITIES,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/pg-boss job identifier paths disagree with authoritative closed payload/);
    const withDynamicParserKey = new Map(inventorySources);
    withDynamicParserKey.set(
      "worker/pg-boss-runtime.ts",
      inventorySources.get("worker/pg-boss-runtime.ts")!.replace(
        '"job", "runId",',
        'hiddenKey, "job", "runId",'
      )
    );
    expect(() => validateLifecycleSourceInventory(
      withDynamicParserKey,
      ROW_CLASS_INVENTORY,
      JSON_PATH_INVENTORY,
      EXTERNAL_WRITER_AUTHORITIES,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/pg-boss job identifier paths disagree with authoritative closed payload/);
    const withoutRunId = SUPPORTING_LIFECYCLE_STORES.map((store) =>
      store.store === "pgboss.job"
        ? { ...store, governedJsonPaths: store.governedJsonPaths.filter((path) => path !== "data$.runId") }
        : store
    );
    expect(() => validateLifecycleClosure({ ...base(), supportingStores: withoutRunId })).toThrow(
      /incomplete pg-boss job JSON path inventory/
    );

    const persistentControlStores = ["pgboss.bam", "pgboss.queue", "pgboss.schedule", "pgboss.subscription", "pgboss.version"];
    for (const store of persistentControlStores) {
      expect(SUPPORTING_LIFECYCLE_STORES.find((entry) => entry.store === store)).toMatchObject({
        retention: "installation_lifetime",
        action: "not_applicable",
        subjectBinding: "installation",
      });
    }
    for (const store of ["pgboss.job", "pgboss.job_common", "pgboss.job_partition:*"]) {
      expect(SUPPORTING_LIFECYCLE_STORES.find((entry) => entry.store === store)).toMatchObject({
        retention: "operational_90_days",
        action: "delete_explicit",
        subjectBinding: "source_ids",
        governedJsonPaths: [
          "data$.jobId",
          "data$.itemId",
          "data$.attemptId",
          "data$.autopsyCacheClaimId",
          "data$.runId",
        ],
      });
    }
  });

  it("replays foreign-key drops and replacements in migration order", () => {
    expect(
      migrations.tables.find((table) => table.name === "stripe_events")?.foreignKeys
        .find((foreignKey) => foreignKey.constraintName === "stripe_events_workspace_id_workspaces_id_fk")
    ).toEqual({
      constraintName: "stripe_events_workspace_id_workspaces_id_fk",
      columns: ["workspace_id"],
      referencedTable: "workspaces",
      referencedColumns: ["id"],
      onDelete: "set_null",
    });

    const create = {
      name: "0000_create.sql",
      sql: [
        'CREATE TABLE "parents" (',
        ' "id" uuid NOT NULL',
        ');',
        'CREATE TABLE "children" (',
        ' "id" uuid NOT NULL,',
        ' "parent_id" uuid',
        ');',
        'ALTER TABLE "children" ADD CONSTRAINT "children_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;',
      ].join("\n"),
    };
    const beforeDrop = migrationInventory([create]);
    expect(beforeDrop.tables.find((table) => table.name === "children")?.foreignKeys).toEqual([{
      constraintName: "children_parent_fk",
      columns: ["parent_id"],
      referencedTable: "parents",
      referencedColumns: ["id"],
      onDelete: "cascade",
    }]);

    const dropped = migrationInventory([create, {
      name: "0001_drop.sql",
      sql: 'ALTER TABLE "children" DROP CONSTRAINT "children_parent_fk" CASCADE;',
    }]);
    expect(dropped.tables.find((table) => table.name === "children")?.foreignKeys).toEqual([]);
    expect(dropped.tables.find((table) => table.name === "children")?.foreignKeyColumns).toEqual([]);

    const replaced = migrationInventory([create, {
      name: "0001_replace.sql",
      sql: [
        'ALTER TABLE "children" DROP CONSTRAINT "children_parent_fk" CASCADE;',
        'ALTER TABLE "children" ADD CONSTRAINT "children_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE set null ON UPDATE no action;',
      ].join("\n"),
    }]);
    expect(replaced.tables.find((table) => table.name === "children")?.foreignKeys).toEqual([{
      constraintName: "children_parent_fk",
      columns: ["parent_id"],
      referencedTable: "parents",
      referencedColumns: ["id"],
      onDelete: "set_null",
    }]);
    expect(() => migrationInventory([create, {
      name: "0001_unsupported.sql",
      sql: 'ALTER TABLE "children" DROP CONSTRAINT IF EXISTS "children_parent_fk";',
    }])).toThrow(/unsupported ALTER TABLE (?:action|DROP CONSTRAINT syntax)/);
  });

  it("validates exact lifecycle owner edges rather than accepting any cascade FK", () => {
    const creditConstraint = "credit_ledger_workspace_id_workspaces_id_fk";
    const creditSetNull = mutateForeignKey(
      migrations,
      "credit_ledger",
      creditConstraint,
      (foreignKey) => ({ ...foreignKey, onDelete: "set_null" })
    );
    expect(() => validateLifecycleClosure({ ...base(), migrations: creditSetNull })).toThrow(
      /cascade ownership edge mismatch: credit_ledger/
    );

    const profileConstraint = "brain_docs_profile_workspace_fk";
    const profileMutations: readonly Readonly<{
      label: string;
      mutate(foreignKey: MigrationForeignKey): MigrationForeignKey;
    }>[] = [
      { label: "action", mutate: (foreignKey) => ({ ...foreignKey, onDelete: "no_action" }) },
      { label: "target", mutate: (foreignKey) => ({ ...foreignKey, referencedTable: "workspaces" }) },
      { label: "referenced column", mutate: (foreignKey) => ({ ...foreignKey, referencedColumns: ["id", "id"] }) },
    ];
    for (const mutation of profileMutations) {
      const mutated = mutateForeignKey(migrations, "brain_docs", profileConstraint, mutation.mutate);
      expect(
        () => validateLifecycleClosure({ ...base(), migrations: mutated }),
        `composite profile owner ${mutation.label} drift was accepted`
      ).toThrow(/cascade ownership edge mismatch: brain_docs/);
    }

    const membershipConstraint = "memberships_workspace_id_workspaces_id_fk";
    const membershipRestricted = mutateForeignKey(
      migrations,
      "memberships",
      membershipConstraint,
      (foreignKey) => ({ ...foreignKey, onDelete: "restrict" })
    );
    expect(() => validateLifecycleClosure({ ...base(), migrations: membershipRestricted })).toThrow(
      /classified final-schema foreign key mismatch: memberships\.memberships_workspace_id_workspaces_id_fk/
    );

    const missingMembershipEdge = {
      ...migrations,
      tables: migrations.tables.map((table) => table.name !== "memberships" ? table : {
        ...table,
        foreignKeys: table.foreignKeys.filter((foreignKey) => foreignKey.constraintName !== membershipConstraint),
      }),
    } satisfies MigrationInventory;
    expect(() => validateLifecycleClosure({ ...base(), migrations: missingMembershipEdge })).toThrow(
      /classified final-schema foreign key is missing: memberships\.memberships_workspace_id_workspaces_id_fk/
    );

    const extraMembershipEdge = {
      ...migrations,
      tables: migrations.tables.map((table) => table.name !== "memberships" ? table : {
        ...table,
        foreignKeys: [...table.foreignKeys, {
          constraintName: "memberships_unclassified_user_fk",
          columns: ["user_id"],
          referencedTable: "users",
          referencedColumns: ["id"],
          onDelete: "cascade" as const,
        }],
      }),
    } satisfies MigrationInventory;
    expect(() => validateLifecycleClosure({ ...base(), migrations: extraMembershipEdge })).toThrow(
      /unclassified final-schema foreign key: memberships\.memberships_unclassified_user_fk/
    );
  });

  it("pins current finance rows to physical workspace cascades until Task 6 replaces them", () => {
    for (const table of ["credit_ledger", "subscriptions"] as const) {
      const entries = LIFECYCLE_REGISTRY.filter((entry) => entry.table === table);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        scope: "workspace",
        retention: "workspace_lifetime",
        action: "cascade",
        executor: "workspace_cascade",
      });
    }
  });

  it("derives JSON-column population from migrations and reddens on an unclassified column", () => {
    const expanded = {
      ...migrations,
      tables: migrations.tables.map((table) => table.name === "brain_docs" ? {
        ...table,
        columns: [...table.columns, "future_links"],
        columnTypes: { ...table.columnTypes, future_links: "jsonb" },
      } : table),
    };
    expect(() => validateLifecycleClosure({ ...base(), migrations: expanded })).toThrow(/unclassified migration JSON column/);

    for (const type of ['"pg_catalog"."jsonb"', "JSONB"] as const) {
      const withPhysicalJson = migrationInventory([
        ...readdirSync(MIGRATIONS)
          .filter((name) => name.endsWith(".sql"))
          .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") })),
        {
          name: `9999_future_${type === "JSONB" ? "uppercase" : "qualified"}.sql`,
          sql: `ALTER TABLE "brain_docs" ADD COLUMN "future_payload" ${type};`,
        },
      ]);
      expect(withPhysicalJson.tables.find((table) => table.name === "brain_docs")?.columnTypes.future_payload).toBe("jsonb");
      expect(
        () => validateLifecycleClosure({ ...base(), migrations: withPhysicalJson }),
        `${type} JSON column was omitted from lifecycle closure`
      ).toThrow(/unclassified migration JSON column: brain_docs\.future_payload/);
    }
  });

  it("enumerates both private sourceUrl and shared sourceReference transcript provenance", () => {
    const transcriptPaths = JSON_PATH_INVENTORY
      .filter((entry) => entry.table === "trend_transcripts" && entry.column === "provenance")
      .map((entry) => entry.path)
      .sort();
    expect(transcriptPaths).toEqual([
      "$.consentEvidenceId",
      "$.referenceInputId",
      "$.sourceReference",
      "$.sourceUrl",
    ]);
    for (const required of ["$.sourceUrl", "$.sourceReference"] as const) {
      expect(() => validateLifecycleClosure({
        ...base(),
        jsonPaths: JSON_PATH_INVENTORY.filter((entry) => !(entry.table === "trend_transcripts" && entry.path === required)),
      })).toThrow(/missing JSON path inventory/);
    }
  });
});

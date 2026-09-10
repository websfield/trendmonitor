export type MigrationSource = Readonly<{ name: string; sql: string }>;

export type MigrationTable = Readonly<{
  name: string;
  columns: readonly string[];
  columnTypes: Readonly<Record<string, string>>;
  foreignKeyColumns: readonly string[];
  foreignKeys: readonly MigrationForeignKey[];
}>;
export type MigrationForeignKey = Readonly<{
  constraintName: string;
  columns: readonly string[];
  referencedTable: string;
  referencedColumns: readonly string[];
  onDelete: "cascade" | "set_null" | "restrict" | "no_action";
}>;

export type MigrationInventory = Readonly<{
  tables: readonly MigrationTable[];
  enums: Readonly<Record<string, readonly string[]>>;
}>;

export type LifecycleWriterInventoryEntry = Readonly<{
  table: string;
  owner: string;
  physicalWriters: readonly string[];
}>;

export type RowClassInventoryEntry = Readonly<{
  table: string;
  rowClass: string;
  /** null proves that this table has one row class. */
  discriminator: Readonly<{
    kind: "enum_value" | "nullness";
    column: string;
    value: string;
    enumName: string | null;
    sourceFile: string;
    sourceToken: string;
    /** Enum values structurally refused for this table, with a source witness. */
    excludedEnumValues: readonly string[];
    exclusionSourceFile: string | null;
    exclusionSourceToken: string | null;
  }> | null;
  permitsWholeRowFieldSet: boolean;
}>;

export type JsonPathInventoryEntry = Readonly<{
  table: string;
  column: string;
  path: string;
  sourceFile: string;
  sourceToken: string;
}>;

export type JsonColumnInventoryEntry = Readonly<{
  table: string;
  column: string;
  classification:
    | "identifier_paths"
    | "creator_content_no_internal_link"
    | "content_free_no_internal_link"
    | "provider_payload";
}>;

function splitTopLevelSqlList(value: string): readonly string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (singleQuoted) {
      if (char === "'" && next === "'") index += 1;
      else if (char === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (char === '"' && next === '"') index += 1;
      else if (char === '"') doubleQuoted = false;
      continue;
    }
    if (char === "'") singleQuoted = true;
    else if (char === '"') doubleQuoted = true;
    else if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function expandMultiConstraintAlters(sql: string): string {
  return sql.replace(/ALTER\s+TABLE\b[\s\S]*?;/gi, (statement) => {
    const parsed = statement.match(
      /^(ALTER\s+TABLE\s+(?:"public"\.)?"[a-z_][a-z0-9_]*")\s+([\s\S]*);$/i
    );
    if (!parsed) return statement;
    const actions = splitTopLevelSqlList(parsed[2]);
    if (actions.length < 2 || !actions.every((action) => /^(?:ADD|DROP)\s+CONSTRAINT\b/i.test(action))) {
      return statement;
    }
    return actions.map((action) => `${parsed[1]} ${action};`).join("\n");
  });
}

function normalizedType(type: string): string {
  const canonical = type.replaceAll('"', "").toLowerCase();
  return canonical.startsWith("pg_catalog.") ? canonical.slice("pg_catalog.".length) : canonical;
}

/**
 * Parse the application-owned table surface from committed SQL migrations.
 * This deliberately consumes SQL text supplied by the caller: production code
 * never reads the filesystem, while tests/build checks can read every migration.
 */
export function migrationInventory(
  sources: readonly MigrationSource[]
): MigrationInventory {
  const tables = new Map<string, Set<string>>();
  const columnTypes = new Map<string, Map<string, string>>();
  const foreignKeys = new Map<string, Map<string, MigrationForeignKey>>();
  const knownConstraints = new Map<string, Set<string>>();
  const enums = new Map<string, Set<string>>();

  for (const source of [...sources].sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = expandMultiConstraintAlters(
      source.sql
        .replace(/--[^\r\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
    );
    for (const match of sql.matchAll(
      /CREATE\s+TYPE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+AS\s+ENUM\s*\(([^)]+)\)/gi
    )) {
      if (enums.has(match[1])) {
        throw new Error(`migration enum '${match[1]}' is created more than once`);
      }
      const values = new Set<string>();
      for (const value of match[2].matchAll(/'([^']+)'/g)) values.add(value[1]);
      if (values.size === 0) throw new Error(`migration enum '${match[1]}' has no parsed values`);
      enums.set(match[1], values);
    }
    for (const match of sql.matchAll(
      /ALTER\s+TYPE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+ADD\s+VALUE(?:\s+IF\s+NOT\s+EXISTS)?\s+'([^']+)'/gi
    )) {
      const values = enums.get(match[1]);
      if (!values) throw new Error(`ADD VALUE targets unknown enum '${match[1]}'`);
      values.add(match[2]);
    }
    // Count every PostgreSQL CREATE ... TABLE family before accepting the
    // narrow application-migration grammar below. Without TEMP/TEMPORARY and
    // FOREIGN here, a perfectly valid dependency or scratch table was simply
    // invisible instead of failing closed.
    const createTableTokens = [...sql.matchAll(
      /\bCREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:(?:TEMP|TEMPORARY|UNLOGGED|FOREIGN)\s+)?TABLE\b/gi
    )];
    const createTableMatches = [...sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s*\(([\s\S]*?)\n\);/gi
    )];
    if (createTableTokens.length !== createTableMatches.length) {
      throw new Error(`unsupported CREATE TABLE syntax in '${source.name}'`);
    }
    for (const match of createTableMatches) {
      const table = match[1];
      if (tables.has(table)) {
        throw new Error(`migration table '${table}' is created more than once`);
      }
      const columns = new Set<string>();
      const types = new Map<string, string>();
      const constraints = new Set<string>();
      if (/\b(?:FOREIGN\s+KEY|REFERENCES)\b/i.test(match[2])) {
        throw new Error(`CREATE TABLE foreign keys and inline REFERENCES are unsupported in migration table '${table}'`);
      }
      for (const rawLine of match[2].split(/\r?\n/)) {
        const line = rawLine.trim();
        const namedConstraint = line.match(/^CONSTRAINT\s+"([^"]+)"/i);
        if (namedConstraint) constraints.add(namedConstraint[1]);
        if (line.startsWith('"')) {
          const column = line.match(/^"([a-z_][a-z0-9_]*)"\s+((?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*)(?:\.(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*))?)/i);
          if (!column) throw new Error(`unsupported column declaration in migration table '${table}': ${line}`);
          if (/,\s*(?:"[a-z_][a-z0-9_]*"|(?!CONSTRAINT\b|PRIMARY\b|UNIQUE\b|CHECK\b|FOREIGN\b|EXCLUDE\b)[a-z_][a-z0-9_]*)\s+(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*)/i.test(line)) {
            throw new Error(`multiple column declarations on one line are unsupported in migration table '${table}'`);
          }
          if (/\bREFERENCES\b/i.test(line)) {
            throw new Error(`inline REFERENCES is unsupported in migration table '${table}'`);
          }
          columns.add(column[1]);
          types.set(column[1], normalizedType(column[2]));
        } else if (/^(?!(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE|AND|OR|WHEN|THEN|ELSE|END)\b)[a-z_][a-z0-9_]*\s+(?:[a-z_]+|"[a-z_]+")/i.test(line)) {
          throw new Error(`unquoted column declaration in migration table '${table}'`);
        }
      }
      if (columns.size === 0) {
        throw new Error(`migration table '${table}' has no parsed columns`);
      }
      tables.set(table, columns);
      columnTypes.set(table, types);
      foreignKeys.set(table, new Map());
      knownConstraints.set(table, constraints);
    }

    // SET/DROP DEFAULT is listed because it is INERT for this inventory: it
    // changes neither the column set, the column types, nor the constraint
    // names, which are the only things derived here. It is enumerated rather
    // than admitted by loosening the pattern, so the next unfamiliar action
    // still fails closed — which is exactly how this parser caught 0055.
    for (const statement of sql.matchAll(/ALTER\s+TABLE\b[\s\S]*?;/gi)) {
      const supported = /^ALTER\s+TABLE\s+(?:"public"\.)?"[a-z_][a-z0-9_]*"\s+(?:ADD\s+COLUMN\s+"[a-z_][a-z0-9_]*"\s+(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*)(?:\.(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*))?(?:[\s\S]*?)|DROP\s+COLUMN\s+"[a-z_][a-z0-9_]*"(?:\s+(?:CASCADE|RESTRICT))?|ALTER\s+COLUMN\s+"[a-z_][a-z0-9_]*"\s+(?:(?:SET|DROP)\s+NOT\s+NULL|DROP\s+DEFAULT|SET\s+DEFAULT\s+[\s\S]*?|SET\s+DATA\s+TYPE\s+(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*)(?:\.(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*))?(?:\s+USING\s+[\s\S]*?)?)|ADD\s+CONSTRAINT\s+"[^"]+"\s+(?:CHECK\b|UNIQUE\b|FOREIGN\s+KEY\b)[\s\S]*|DROP\s+CONSTRAINT\s+"[^"]+"(?:\s+(?:CASCADE|RESTRICT))?)\s*;$/i.test(statement[0]);
      if (!supported) throw new Error(`unsupported ALTER TABLE action in '${source.name}': ${statement[0].trim()}`);
    }

    const addColumnTokens = [...sql.matchAll(/\bADD\s+COLUMN\b/gi)];
    for (const statement of sql.matchAll(/ALTER\s+TABLE\b[^;]*?\bADD\s+COLUMN\b[^;]*;/gi)) {
      if (/\bREFERENCES\b/i.test(statement[0])) {
        throw new Error(`inline REFERENCES in ALTER TABLE ADD COLUMN is unsupported in '${source.name}'`);
      }
      if (/,[\s\r\n]*(?:ADD|DROP|ALTER|RENAME|CONSTRAINT|FOREIGN|PRIMARY|UNIQUE|CHECK)\b/i.test(statement[0])) {
        throw new Error(`multi-action ALTER TABLE ADD COLUMN is unsupported in '${source.name}'`);
      }
    }
    const addColumnMatches = [...sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+ADD\s+COLUMN\s+"([a-z_][a-z0-9_]*)"\s+((?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*)(?:\.(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*))?)/gi
    )];
    if (addColumnTokens.length !== addColumnMatches.length) {
      throw new Error(`unsupported ALTER TABLE ADD COLUMN syntax in '${source.name}'`);
    }
    const dropColumnTokens = [...sql.matchAll(/\bDROP\s+COLUMN\b/gi)];
    const dropColumnMatches = [...sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+DROP\s+COLUMN\s+"([a-z_][a-z0-9_]*)"/gi
    )];
    if (dropColumnTokens.length !== dropColumnMatches.length) {
      throw new Error(`unsupported ALTER TABLE DROP COLUMN syntax in '${source.name}'`);
    }
    const columnOperations = [
      ...addColumnMatches.map((match) => ({ kind: "add" as const, index: match.index ?? 0, match })),
      ...dropColumnMatches.map((match) => ({ kind: "drop" as const, index: match.index ?? 0, match })),
    ].sort((a, b) => a.index - b.index);
    for (const operation of columnOperations) {
      const match = operation.match;
      const table = tables.get(match[1]);
      if (!table) throw new Error(`${operation.kind === "add" ? "ADD" : "DROP"} COLUMN targets unknown table '${match[1]}'`);
      if (operation.kind === "drop") {
        if (!table.delete(match[2])) throw new Error(`DROP COLUMN targets unknown column '${match[1]}.${match[2]}'`);
        columnTypes.get(match[1])?.delete(match[2]);
      } else {
        if (table.has(match[2])) throw new Error(`ADD COLUMN targets existing column '${match[1]}.${match[2]}'`);
        table.add(match[2]);
        columnTypes.get(match[1])?.set(match[2], normalizedType(match[3]));
      }
    }
    // Phase 10a (migration 0058): a column's TYPE may change — `purpose`
    // moved from text to the `system_spend_purpose` enum — and the registry's
    // discriminator check reads `columnTypes`, so the change is applied here
    // rather than admitted and ignored. The column must already exist.
    for (const match of sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+ALTER\s+COLUMN\s+"([a-z_][a-z0-9_]*)"\s+SET\s+DATA\s+TYPE\s+((?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*)(?:\.(?:"[a-z_][a-z0-9_]*"|[a-z_][a-z0-9_]*))?)/gi
    )) {
      const table = tables.get(match[1]);
      if (!table || !table.has(match[2])) throw new Error(`SET DATA TYPE targets unknown column '${match[1]}.${match[2]}'`);
      // CREATE TABLE names an enum bare (`"purpose" "system_spend_purpose"`);
      // SET DATA TYPE names it schema-qualified. One spelling in the inventory.
      columnTypes.get(match[1])?.set(match[2], normalizedType(match[3].replace(/^"?public"?\./i, "")));
    }
    const addForeignKeyTokens = [...sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"[a-z_][a-z0-9_]*"\s+ADD\s+CONSTRAINT\s+"[^"]+"\s+FOREIGN\s+KEY\b/gi
    )];
    const addForeignKeys = [...sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s*\(([^)]+)\)\s+ON\s+DELETE\s+(cascade|set\s+null|restrict|no\s+action)\b[^;]*;/gi
    )];
    if (addForeignKeyTokens.length !== addForeignKeys.length) {
      throw new Error(`unsupported ALTER TABLE ADD FOREIGN KEY syntax in '${source.name}'`);
    }
    const dropConstraintTokens = [...sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"[a-z_][a-z0-9_]*"\s+DROP\s+CONSTRAINT\b/gi
    )];
    const dropConstraints = [...sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+DROP\s+CONSTRAINT\s+"([^"]+)"(?:\s+(?:CASCADE|RESTRICT))?\s*;/gi
    )];
    if (dropConstraintTokens.length !== dropConstraints.length) {
      throw new Error(`unsupported ALTER TABLE DROP CONSTRAINT syntax in '${source.name}'`);
    }
    const addConstraints = [...sql.matchAll(
      /ALTER\s+TABLE\s+(?:"public"\.)?"([a-z_][a-z0-9_]*)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"/gi
    )];
    const foreignKeyByIndex = new Map(addForeignKeys.map((match) => [match.index, match]));
    const constraintOperations = [
      ...addConstraints.map((match) => ({
        kind: "add" as const,
        index: match.index,
        match,
        foreignKey: foreignKeyByIndex.get(match.index),
      })),
      ...dropConstraints.map((match) => ({ kind: "drop" as const, index: match.index, match })),
    ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const operation of constraintOperations) {
      const match = operation.match;
      const tableForeignKeys = foreignKeys.get(match[1]);
      const tableConstraints = knownConstraints.get(match[1]);
      if (!tableForeignKeys || !tableConstraints) throw new Error(`constraint mutation targets unknown table '${match[1]}'`);
      if (operation.kind === "drop") {
        if (!tableConstraints.delete(match[2])) {
          throw new Error(`DROP CONSTRAINT targets unknown constraint '${match[1]}.${match[2]}'`);
        }
        tableForeignKeys.delete(match[2]);
        continue;
      }
      if (tableConstraints.has(match[2])) {
        throw new Error(`constraint '${match[1]}.${match[2]}' is added more than once`);
      }
      tableConstraints.add(match[2]);
      const foreignKey = operation.foreignKey;
      if (!foreignKey) continue;
      const columns = [...foreignKey[3].matchAll(/"([a-z_][a-z0-9_]*)"/gi)].map((column) => column[1]);
      const referencedColumns = [...foreignKey[5].matchAll(/"([a-z_][a-z0-9_]*)"/gi)].map((column) => column[1]);
      if (columns.length === 0
        || columns.length !== referencedColumns.length
        || columns.some((column) => !tables.get(match[1])?.has(column))
        || referencedColumns.some((column) => !tables.get(foreignKey[4])?.has(column))) {
        throw new Error(`foreign key constraint '${match[1]}.${match[2]}' has unknown columns`);
      }
      tableForeignKeys.set(match[2], {
        constraintName: match[2],
        columns,
        referencedTable: foreignKey[4],
        referencedColumns,
        onDelete: foreignKey[6].toLowerCase().replace(/\s+/g, "_") as MigrationForeignKey["onDelete"],
      });
    }
  }

  return {
    tables: [...tables.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, columns]) => ({
        name,
        columns: [...columns].sort(),
        columnTypes: Object.fromEntries(
          [...(columnTypes.get(name) ?? new Map()).entries()].sort(([a], [b]) => a.localeCompare(b))
        ),
        foreignKeyColumns: [...new Set(
          [...(foreignKeys.get(name)?.values() ?? [])].flatMap((foreignKey) => foreignKey.columns)
        )].sort(),
        foreignKeys: [...(foreignKeys.get(name)?.values() ?? [])]
          .sort((a, b) => a.constraintName.localeCompare(b.constraintName)),
      })),
    enums: Object.fromEntries(
      [...enums.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, values]) => [name, [...values]])
    ),
  };
}

export function inventoryTable(
  inventory: MigrationInventory,
  table: string
): MigrationTable | undefined {
  return inventory.tables.find((candidate) => candidate.name === table);
}

export const AUTOPSY_JOB_PAYLOAD_SOURCE_FILES = [
  "worker/pg-boss-runtime.ts",
  "worker/production.ts",
  "worker/run-once.ts",
  "worker/system-autopsy.ts",
] as const;

function identifierKeys(keys: readonly string[]): readonly string[] {
  return [...new Set(keys.filter((key) => key.endsWith("Id")))].sort();
}

function closedParserIdentifierKeys(source: string): readonly string[] | null {
  const closedKeys = source.match(
    /function\s+parseAutopsyPayload\b[\s\S]*?const\s+keys\s*=\s*\[([\s\S]*?)\];/
  );
  if (!closedKeys || closedKeys[1].includes("...")) return null;
  const elements = [...splitTopLevelSqlList(closedKeys[1])];
  if (elements.at(-1) === "") elements.pop();
  if (elements.some((element) => !/^"[A-Za-z][A-Za-z0-9]*"$/.test(element))) return null;
  return identifierKeys(elements.map((element) => element.slice(1, -1)));
}

function interfaceIdentifierKeys(source: string, name: string): readonly string[] | null {
  const declaration = source.match(new RegExp(`interface\\s+${name}\\b[^\\{]*\\{([\\s\\S]*?)\\n\\}`, "m"));
  if (!declaration) return null;
  return identifierKeys(
    [...declaration[1].matchAll(/readonly\s+([A-Za-z][A-Za-z0-9]*)\??\s*:/g)].map((match) => match[1])
  );
}

function producerIdentifierKeys(source: string): readonly string[] | null {
  const producer = source.match(
    /function\s+buildProductionAutopsyCommand\b[\s\S]*?return\s+\{([\s\S]*?)\n\s*\};/
  );
  if (!producer || producer[1].includes("...") || /(?:^|,)\s*\[[^\]]+\]\s*:/m.test(producer[1])) return null;
  return identifierKeys(
    [...producer[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)(?:\s*:|\s*,)/gm)].map((match) => match[1])
  );
}

function authoritativeAutopsyJobIdentifierPaths(
  sources: ReadonlyMap<string, string>
): readonly string[] | null {
  const parserKeys = closedParserIdentifierKeys(sources.get("worker/pg-boss-runtime.ts") ?? "");
  const producerKeys = producerIdentifierKeys(sources.get("worker/production.ts") ?? "");
  const commonKeys = interfaceIdentifierKeys(sources.get("worker/run-once.ts") ?? "", "RunOnceCommon");
  const commandKeys = interfaceIdentifierKeys(sources.get("worker/run-once.ts") ?? "", "AutopsyRunOnceCommand");
  const systemKeys = interfaceIdentifierKeys(sources.get("worker/system-autopsy.ts") ?? "", "SystemAutopsyCommand");
  if (!parserKeys || !producerKeys || !commonKeys || !commandKeys || !systemKeys) return null;
  const typeKeys = identifierKeys([...commonKeys, ...commandKeys, ...systemKeys]);
  if (JSON.stringify(parserKeys) !== JSON.stringify(producerKeys)
    || JSON.stringify(parserKeys) !== JSON.stringify(typeKeys)) return null;
  return parserKeys.map((key) => `data$.${key}`).sort();
}

export function validateLifecycleSourceInventory(
  sources: ReadonlyMap<string, string>,
  rowClasses: readonly RowClassInventoryEntry[],
  jsonPaths: readonly JsonPathInventoryEntry[],
  externalWriters: readonly Readonly<{ table: string; owner: string; sourceFile: string; sourceToken: string }>[],
  supportingStores: readonly Readonly<{
    store: string;
    writerOwner: string;
    sourceToken: string;
    physicalKind: string;
    governedJsonPaths: readonly string[];
  }>[]
): void {
  const failures: string[] = [];
  for (const item of rowClasses) {
    if (item.discriminator === null) continue;
    const source = sources.get(item.discriminator.sourceFile);
    if (source === undefined || !source.includes(item.discriminator.sourceToken)) {
      failures.push(`missing row-class discriminator source: ${item.table}.${item.rowClass}`);
    }
    if (item.discriminator.excludedEnumValues.length > 0) {
      const exclusionSource = item.discriminator.exclusionSourceFile === null
        ? undefined
        : sources.get(item.discriminator.exclusionSourceFile);
      if (
        exclusionSource === undefined
        || item.discriminator.exclusionSourceToken === null
        || !exclusionSource.includes(item.discriminator.exclusionSourceToken)
      ) {
        failures.push(`missing row-class exclusion source: ${item.table}`);
      }
    }
  }
  for (const item of jsonPaths) {
    const source = sources.get(item.sourceFile);
    if (source === undefined || !source.includes(item.sourceToken)) {
      failures.push(`missing JSON-path source: ${item.table}.${item.column}${item.path}`);
    }
  }
  for (const item of externalWriters) {
    const source = sources.get(item.sourceFile);
    if (source === undefined || !source.includes(item.sourceToken)) failures.push(`missing external-writer source: ${item.table}.${item.owner}`);
  }
  for (const item of supportingStores) {
    const source = sources.get(item.writerOwner);
    if (source === undefined || !source.includes(item.sourceToken)) failures.push(`missing supporting-store source: ${item.store}`);
    if (item.physicalKind === "job_table" || item.physicalKind === "dynamic_job_partition") {
      const authoritative = authoritativeAutopsyJobIdentifierPaths(sources);
      const governed = [...item.governedJsonPaths].sort();
      if (authoritative === null || JSON.stringify(authoritative) !== JSON.stringify(governed)) {
        failures.push(`pg-boss job identifier paths disagree with authoritative closed payload: ${item.store}`);
      }
    }
  }
  if (failures.length > 0) throw new Error(failures.sort().join("\n"));
}

// P8 — the WRITER ENUMERATION.
//
// Every table M2a creates has exactly one sanctioned writer, and for three of
// them that writer is `writeCapabilities` in `packages/db/src/with-workspace.ts`
// — the function the whole cage exists to funnel writes through. A second
// writer anywhere would make the cage decorative, and it would be caught by
// neither eslint (which sees imports, not queries) nor the type system (which
// is perfectly happy with `db.insert(brainDocs)`).
//
// FOUR SHAPES, because a scan that knows only one of them is a scan a careless
// change walks past:
//   direct    db.insert(TABLE)
//   aliased   const t = TABLE; ... db.insert(t)
//   schema.*  db.insert(schema.TABLE)
//   raw sql   a sql template naming the table
// Each is planted and found below, per verb, so "no writers" is a measurement
// rather than the absence of one.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCTION_ROOTS } from "./support/source-files";
import {
  APP_TABLES,
  EXTERNAL_WRITER_AUTHORITIES,
  LIFECYCLE_WRITER_INVENTORY,
  SUPPORTING_LIFECYCLE_STORES,
} from "../packages/db/src/creator-data-registry";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * drizzle export name -> SQL table name. The six of migration 0011, the two
 * slice-3b tables (migration 0018) and the two slice-6 generation tables
 * (migration 0020) — a table this scan does not KNOW about is a table it finds
 * zero writers of no matter how many it has, which is the same fail-open shape
 * a broken regex produces (CLAUDE.md 2026-08-21).
 *
 * THIS MAP IS MANUAL AND NOTHING FAILS IF IT IS FORGOTTEN, which is exactly
 * why registering a new table here is a slice REQUIREMENT (slice 6 R10) rather
 * than a courtesy: an unregistered table produces a green suite and an
 * unpoliced write surface, and the green suite is the dangerous half.
 */
const TABLES: Record<string, string> = {
  activationCohortDaily: "activation_cohort_daily",
  account: "account",
  // Phase 10b-1 Task 4 (closed auth-delivery outbox).
  authMailOutbox: "auth_mail_outbox",
  autoTopupProtocolRollouts: "auto_topup_protocol_rollouts",
  brainDocs: "brain_docs",
  // Slice 9b closes 9a-D3. The ledger predates this scanner, but leaving it
  // absent made every money writer invisible to the exact-writer gate.
  creditLedger: "credit_ledger",
  deletionCancellationProofs: "deletion_cancellation_proofs",
  // Phase 10b-1 Task 4 (external-command outbox). Registered in the same
  // change that creates the table, per the docblock above.
  deletionExternalCommands: "deletion_external_commands",
  deletionMembershipSnapshots: "deletion_membership_snapshots",
  deletionOperationTransitions: "deletion_operation_transitions",
  deletionOperations: "deletion_operations",
  deletionRecoverySessions: "deletion_recovery_sessions",
  configVersions: "config_versions",
  creatorProfiles: "creator_profiles",
  frameworks: "frameworks",
  onboardingInputs: "onboarding_inputs",
  modelUsage: "model_usage",
  firstBillableAttempts: "first_billable_attempts",
  workspaceSpendMonthly: "workspace_spend_monthly",
  onboardingInterviewDrafts: "onboarding_interview_drafts",
  brainActivationSnapshots: "brain_activation_snapshots",
  membershipProfileSelections: "membership_profile_selections",
  generationAttempts: "generation_attempts",
  generations: "generations",
  generationFeedback: "generation_feedback",
  // Launch L2 (R-151), registered in the SAME change that creates the table.
  creativePieces: "creative_pieces",
  memberships: "memberships",
  pausePeriods: "pause_periods",
  rateLimit: "rate_limit",
  // Slice 9a (migration 0029). Registered here in the SAME change that creates
  // the table, because this map is manual and nothing fails if it is forgotten
  // — see the docblock above.
  results: "results",
  // Slice 9b (migration 0033). These three tables are the immutable proposal
  // record and its evidence membership. Keeping them in this manual map is
  // deliberate: an unregistered table has zero observable writers and would
  // make the sole-mint claim pass by omission.
  promotionProposals: "promotion_proposals",
  proposalEvidenceResults: "proposal_evidence_results",
  proposalEvidenceFeedback: "proposal_evidence_feedback",
  trendSources: "trend_sources",
  trackedNiches: "tracked_niches",
  trendItems: "trend_items",
  trendTranscripts: "trend_transcripts",
  autopsies: "autopsies",
  autopsyCacheClaims: "autopsy_cache_claims",
  systemModelUsage: "system_model_usage",
  systemModelUsageReconciliations: "system_model_usage_reconciliations",
  systemSpendClaims: "system_spend_claims",
  systemSpendDaily: "system_spend_daily",
  systemWorkerHealth: "system_worker_health",
  // Phase 10a plan C4: the public Sample Spin's abuse buckets.
  publicSampleSpinBuckets: "public_sample_spin_buckets",
  session: "session",
  stripeEvents: "stripe_events",
  stripeFinanceExtracts: "stripe_finance_extracts",
  subscriptions: "subscriptions",
  tierCheckoutProtocolRollouts: "tier_checkout_protocol_rollouts",
  user: "user",
  users: "users",
  verification: "verification",
  workspaces: "workspaces",
};

const VERBS = ["insert", "update", "delete"] as const;
type Verb = (typeof VERBS)[number] | "onConflictDoUpdate";
type Shape = "direct" | "aliased" | "schema" | "rawSql";
type Finding = { file: string; table: string; verb: Verb; shape: Shape };

/**
 * The ONE scanner, on a real TypeScript PARSE.
 *
 * The regex version knew four shapes and the tenancy gate ran it against five
 * more, each returning ZERO findings: an import rename
 * (`import { brainDocs as bd }`), a destructured alias
 * (`const { brainDocs: t } = schema`), a cast argument (`db.insert(t as never)`),
 * a computed member (`db.insert(schema["brainDocs"])`), and schema-qualified
 * raw SQL (`insert into public.brain_docs`). That matters more here than
 * anywhere else in the suite: `packages/**` may legitimately import every M2a
 * table object from the package root, neither tsc nor eslint constrains
 * `db.insert(brainDocs)` there, and P8 is therefore the ONLY thing making
 * "exactly one writer" true. An import rename is an ordinary edit.
 *
 * The parse resolves aliases through three routes — import clauses, variable
 * declarations, and object-destructuring patterns — then matches the CALL
 * ARGUMENT as a node, so a cast or a computed member is followed rather than
 * pattern-matched.
 */
function tableOfExpression(
  expr: ts.Expression,
  sf: ts.SourceFile,
  aliases: Map<string, string>
): string | undefined {
  // Unwrap `x as never`, `x!`, `(x)`.
  let node: ts.Expression = expr;
  for (;;) {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      node = node.expression;
    } else if (ts.isNonNullExpression(node)) {
      node = node.expression;
    } else if (ts.isParenthesizedExpression(node)) {
      node = node.expression;
    } else break;
  }
  if (ts.isIdentifier(node)) {
    const name = node.getText(sf);
    return aliases.get(name) ?? (name in TABLES ? name : undefined);
  }
  // `schema.brainDocs` and `schema["brainDocs"]`.
  if (ts.isPropertyAccessExpression(node)) {
    const prop = node.name.getText(sf);
    return prop in TABLES ? prop : undefined;
  }
  if (ts.isElementAccessExpression(node) && node.argumentExpression) {
    const arg = node.argumentExpression;
    if (ts.isStringLiteral(arg)) {
      return arg.text in TABLES ? arg.text : undefined;
    }
  }
  return undefined;
}

/** Every local name that refers to one of the M2a tables, however bound. */
function collectAliases(sf: ts.SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    // import { brainDocs as bd } from "@respin/db"
    if (ts.isImportSpecifier(node)) {
      const original = (node.propertyName ?? node.name).getText(sf);
      if (original in TABLES) aliases.set(node.name.getText(sf), original);
    }
    // const t = brainDocs / const t = schema.brainDocs
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isIdentifier(node.name)
    ) {
      const target = tableOfExpression(node.initializer, sf, aliases);
      if (target) aliases.set(node.name.getText(sf), target);
    }
    // const { brainDocs: t } = schema  /  const { brainDocs } = schema
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) {
      for (const el of node.name.elements) {
        const original = (el.propertyName ?? el.name).getText(sf);
        if (original in TABLES && ts.isIdentifier(el.name)) {
          aliases.set(el.name.getText(sf), original);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return aliases;
}

/**
 * ONE PARSE PER (file, text), REUSED (audit Phase 3, 2026-10-06 — harness
 * only). The probe cases below copy the whole production map, change one or
 * two files, and re-run every scan; each full re-scan used to re-parse every
 * production file. Measured with an event-loop delay histogram in each
 * worker, this file held its worker off the event loop for 55.6 s — under
 * the full suite's contention, past birpc's hard 60 s `onTaskUpdate` timeout,
 * which is the `Errors 1` / exit 1 with every test passing that
 * `vitest.config.ts` records. A result is a pure function of the file's path
 * and text, so a cache keyed on both returns what a re-parse would.
 */
const parsedSources = new Map<string, { raw: string; sf: ts.SourceFile }>();
function sourceFileOf(file: string, raw: string): ts.SourceFile {
  const hit = parsedSources.get(file);
  if (hit && hit.raw === raw) return hit.sf;
  const sf = ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
  parsedSources.set(file, { raw, sf });
  return sf;
}
const scannedWriters = new Map<string, { raw: string; findings: Finding[] }>();

function scanWriters(files: Map<string, string>): Finding[] {
  const out: Finding[] = [];
  for (const [file, raw] of files) out.push(...scanWritersInFile(file, raw));
  return out;
}

/** The full scan, yielding to the event loop between files (the first, cold pass). */
async function scanWritersYielding(files: Map<string, string>): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const [file, raw] of files) {
    out.push(...scanWritersInFile(file, raw));
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return out;
}

function scanWritersInFile(file: string, raw: string): Finding[] {
  const hit = scannedWriters.get(file);
  if (hit && hit.raw === raw) return hit.findings;
  const findings = scanWritersUncached(file, raw);
  scannedWriters.set(file, { raw, findings });
  return findings;
}

function scanWritersUncached(file: string, raw: string): Finding[] {
  const out: Finding[] = [];
  {
    const sf = sourceFileOf(file, raw);
    const aliases = collectAliases(sf);

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const verb = node.expression.name.getText(sf) as Verb;
        if ((VERBS as readonly string[]).includes(verb) && node.arguments.length > 0) {
          const table = tableOfExpression(node.arguments[0], sf, aliases);
          if (table) {
            const shape: Shape = shapeOf(node.arguments[0], sf, aliases);
            out.push({ file, table: TABLES[table], verb, shape });
            if (verb === "insert" && chainHasUpsert(node, sf)) {
              out.push({
                file,
                table: TABLES[table],
                verb: "onConflictDoUpdate",
                shape,
              });
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    // Raw SQL naming a table. A template literal reaches the database without
    // touching a table object at all, so no pass above can see it. `public.`
    // and quoted spellings both count.
    const text = raw.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [name, sqlName] of Object.entries(TABLES)) {
      void name;
      const q = String.raw`(?:"?public"?\s*\.\s*)?"?` + sqlName + String.raw`"?`;
      const raws: [RegExp, Verb][] = [
        [new RegExp(String.raw`insert\s+into\s+` + q + String.raw`\b`, "gi"), "insert"],
        [new RegExp(String.raw`update\s+` + q + String.raw`\s+set\b`, "gi"), "update"],
        [new RegExp(String.raw`delete\s+from\s+` + q + String.raw`\b`, "gi"), "delete"],
      ];
      for (const [re, verb] of raws) {
        for (const m of text.matchAll(re)) {
          out.push({ file, table: sqlName, verb, shape: "rawSql" });
          const window = text.slice(m.index ?? 0, (m.index ?? 0) + 600);
          if (verb === "insert" && /on\s+conflict[\s\S]{0,200}?do\s+update/i.test(window)) {
            out.push({ file, table: sqlName, verb: "onConflictDoUpdate", shape: "rawSql" });
          }
        }
      }
    }
  }
  return out;
}

/** Which spelling reached the table — reported so a probe can name it. */
function shapeOf(
  expr: ts.Expression,
  sf: ts.SourceFile,
  aliases: Map<string, string>
): Shape {
  let node: ts.Expression = expr;
  for (;;) {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) node = node.expression;
    else if (ts.isNonNullExpression(node)) node = node.expression;
    else if (ts.isParenthesizedExpression(node)) node = node.expression;
    else break;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return "schema";
  }
  if (ts.isIdentifier(node) && aliases.has(node.getText(sf))) return "aliased";
  return "direct";
}

/** Does this insert chain reach `.onConflictDoUpdate(...)`? */
function chainHasUpsert(call: ts.CallExpression, sf: ts.SourceFile): boolean {
  let node: ts.Node = call;
  while (node.parent) {
    if (
      ts.isCallExpression(node.parent) &&
      ts.isPropertyAccessExpression(node.parent.expression) &&
      node.parent.expression.name.getText(sf) === "onConflictDoUpdate"
    ) {
      return true;
    }
    if (
      ts.isPropertyAccessExpression(node.parent) ||
      ts.isCallExpression(node.parent)
    ) {
      node = node.parent;
      continue;
    }
    break;
  }
  return false;
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "migrations",
  "coverage",
  "generated",
  "__tests__",
]);

function productSources(dir: string, acc: Map<string, string> = new Map()) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    // ENOENT ONLY, and narrowly — the THIRD scanner to hit this race today.
    // `import-boundary.test.ts` writes probe files into `respin/lib` and
    // `packages/credits/src` and deletes them, vitest runs files in parallel,
    // and both `statSync` and `readFileSync` below can land after the delete.
    // The whole suite died at collection. A file that no longer exists is not
    // in the committed tree and cannot be a writer of anything.
    //
    // Every OTHER error still throws: a scan that swallowed read failures would
    // report "no unreviewed writers" because it could not read the files, which
    // is the 2026-08-21 fail-open shape this suite exists to prevent.
    let entry;
    try {
      entry = statSync(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    if (entry.isDirectory()) {
      // Package TESTS are not a product surface: they seed fixtures directly,
      // which is how these guards are verified at all. Same scoping rule as
      // retention.test.ts, and the same reason.
      if (name === "tests") continue;
      productSources(full, acc);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(?:test|spec|generated)\.(ts|tsx)$/.test(name)) {
      let src: string;
      try {
        src = readFileSync(full, "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      acc.set(relative(ROOT, full).split(sep).join("/"), src);
    }
  }
  return acc;
}

// THE ROOT LIST IS SHARED, NOT COPIED (P1-R3). This file declared its own until
// 2026-09-21; the list now lives in `tests/support/source-files.ts` beside
// `ROOT_DIRS`, with the relation between the two asserted in
// `tests/claim-scan.test.ts`. The self-pin below (`the scan is non-empty`) moved
// onto the shared copy in the same edit — a move that drops that assertion
// silently removes a control.

function allProductionSources(): Map<string, string> {
  const files = new Map<string, string>();
  for (const root of PRODUCTION_ROOTS) {
    const absolute = join(ROOT, root);
    if (!existsSync(absolute)) throw new Error(`missing closed production source root: ${root}`);
    productSources(absolute, files);
  }
  return files;
}

const PG_BOSS_MUTATION_METHODS = new Set([
  "cancel", "complete", "createQueue", "deleteAllJobs", "deleteJob", "deleteQueue",
  "deleteQueuedJobs", "deleteStoredJobs", "fail", "fetch", "flow", "insert", "offWork",
  "publish", "redrive", "resolveFlow", "resume", "retry", "schedule", "send", "sendAfter",
  "sendDebounced", "sendThrottled", "start", "stop", "subscribe", "supervise", "touch",
  "unsubscribe", "unschedule", "update", "updateQueue", "upsert", "work",
]);

function localModuleFile(
  fromFile: string,
  specifier: string,
  files: ReadonlyMap<string, string>
): string | null {
  if (!specifier.startsWith(".")) return null;
  const absolute = resolve(ROOT, dirname(fromFile), specifier);
  const base = relative(ROOT, absolute).split(sep).join("/");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    base.replace(/\.js$/, ".ts"),
  ];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

function pgBossCapabilityNames(files: ReadonlyMap<string, string>): ReadonlyMap<string, ReadonlySet<string>> {
  const capabilities = new Map<string, Set<string>>(
    [...files.keys()].map((file) => [file, new Set<string>()])
  );
  const exports = new Map<string, Set<string>>(
    [...files.keys()].map((file) => [file, new Set<string>()])
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const [file, raw] of files) {
      const sf = sourceFileOf(file, raw);
      const local = capabilities.get(file)!;
      const exported = exports.get(file)!;
      const add = (set: Set<string>, value: string) => {
        if (!set.has(value)) { set.add(value); changed = true; }
      };
      for (const statement of sf.statements) {
        if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
          const moduleName = statement.moduleSpecifier.text;
          const bindings = statement.importClause?.namedBindings;
          if (moduleName === "pg-boss" && bindings) {
            if (ts.isNamespaceImport(bindings)) add(local, bindings.name.text);
            else for (const element of bindings.elements) {
              if ((element.propertyName ?? element.name).text === "PgBoss") add(local, element.name.text);
            }
          }
          const origin = localModuleFile(file, moduleName, files);
          if (origin && bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
              const imported = (element.propertyName ?? element.name).text;
              if (exports.get(origin)?.has(imported)) add(local, element.name.text);
            }
          }
          if (origin && bindings && ts.isNamespaceImport(bindings) && (exports.get(origin)?.size ?? 0) > 0) {
            add(local, bindings.name.text);
          }
        }
        if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
          const moduleName = statement.moduleSpecifier.text;
          if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
            for (const element of statement.exportClause.elements) {
              const imported = (element.propertyName ?? element.name).text;
              if (moduleName === "pg-boss" && imported === "PgBoss") add(exported, element.name.text);
              const origin = localModuleFile(file, moduleName, files);
              if (origin && exports.get(origin)?.has(imported)) add(exported, element.name.text);
            }
          } else if (!statement.exportClause) {
            if (moduleName === "pg-boss") add(exported, "PgBoss");
            const origin = localModuleFile(file, moduleName, files);
            if (origin) for (const name of exports.get(origin) ?? []) add(exported, name);
          }
        }
      }
      const visitAliases = (node: ts.Node): void => {
        if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node))
          && [...local].some((name) => node.getText(sf).includes(name))) {
          add(local, node.name.text);
          if (node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
            add(exported, node.name.text);
          }
        }
        ts.forEachChild(node, visitAliases);
      };
      visitAliases(sf);
    }
  }
  return capabilities;
}

function scanPgBossWriterFiles(files: ReadonlyMap<string, string>): readonly string[] {
  const writers = new Set<string>();
  const capabilities = pgBossCapabilityNames(files);
  for (const [file, raw] of files) {
    const sf = sourceFileOf(file, raw);
    const receivers = new Set<string>();
    const destructuredMethods = new Set<string>();
    const capabilityNames = capabilities.get(file) ?? new Set<string>();
    const valueCapabilities = new Set(capabilityNames);
    const staticStringAliases = new Map<string, string>();
    const unwrapStaticStringExpression = (expression: ts.Expression): ts.Expression => {
      let current = expression;
      while (ts.isParenthesizedExpression(current)
        || ts.isAsExpression(current)
        || ts.isTypeAssertionExpression(current)
        || ts.isSatisfiesExpression(current)) {
        current = current.expression;
      }
      return current;
    };
    const staticStringValue = (expression: ts.Expression): string | null => {
      const unwrapped = unwrapStaticStringExpression(expression);
      if (ts.isStringLiteral(unwrapped) || ts.isNoSubstitutionTemplateLiteral(unwrapped)) {
        return unwrapped.text;
      }
      return ts.isIdentifier(unwrapped) ? (staticStringAliases.get(unwrapped.text) ?? null) : null;
    };
    const staticStringDeclarations = new Map<string, ts.Expression[]>();
    const collectStaticStringDeclarations = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && ts.isVariableDeclarationList(node.parent)
        && (node.parent.flags & ts.NodeFlags.Const) !== 0) {
        const declarations = staticStringDeclarations.get(node.name.text) ?? [];
        declarations.push(node.initializer);
        staticStringDeclarations.set(node.name.text, declarations);
      }
      ts.forEachChild(node, collectStaticStringDeclarations);
    };
    collectStaticStringDeclarations(sf);
    let stringAliasesChanged = true;
    while (stringAliasesChanged) {
      stringAliasesChanged = false;
      for (const [name, declarations] of staticStringDeclarations) {
        // This deliberately does not guess which lexical declaration an
        // identifier denotes. A duplicate name is unresolved, so a computed
        // call on a proven PgBoss receiver takes the fail-closed path below.
        if (declarations.length !== 1 || staticStringAliases.has(name)) continue;
        const value = staticStringValue(declarations[0]);
        if (value !== null) {
          staticStringAliases.set(name, value);
          stringAliasesChanged = true;
        }
      }
    }
    let valuesChanged = true;
    while (valuesChanged) {
      valuesChanged = false;
      const discoverValueAliases = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node)
          && ts.isIdentifier(node.name)
          && node.initializer
          && ts.isIdentifier(node.initializer)
          && valueCapabilities.has(node.initializer.text)
          && !valueCapabilities.has(node.name.text)) {
          valueCapabilities.add(node.name.text);
          valuesChanged = true;
        }
        ts.forEachChild(node, discoverValueAliases);
      };
      discoverValueAliases(sf);
    }
    const capabilityMembers = new Set<string>();
    const discoverCapabilityMembers = (node: ts.Node): void => {
      if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node))
        && node.type
        && [...capabilityNames].some((name) => node.type!.getText(sf).includes(name))) {
        capabilityMembers.add(node.name.getText(sf));
      }
      ts.forEachChild(node, discoverCapabilityMembers);
    };
    discoverCapabilityMembers(sf);
    const receiverPath = (expression: ts.Expression): readonly string[] | null => {
      const path: string[] = [];
      let current: ts.Expression = expression;
      while (ts.isPropertyAccessExpression(current)) {
        path.unshift(current.name.getText(sf));
        current = current.expression;
      }
      if (ts.isIdentifier(current)) path.unshift(current.text);
      else if (current.kind === ts.SyntaxKind.ThisKeyword) path.unshift("this");
      else return null;
      return path;
    };
    const isPgBossConstruction = (expression: ts.Expression): boolean => {
      if (!ts.isNewExpression(expression)) return false;
      const constructorPath = receiverPath(expression.expression);
      return constructorPath !== null
        && valueCapabilities.has(constructorPath[0])
        && (constructorPath.length === 1 || constructorPath.at(-1) === "PgBoss");
    };
    const isReceiverExpression = (expression: ts.Expression): boolean => {
      const path = receiverPath(expression);
      const root = path?.[0];
      const leaf = path?.at(-1);
      return path !== null && leaf !== undefined && (
        receivers.has(leaf)
        || (root !== undefined && receivers.has(root) && capabilityMembers.has(leaf))
      );
    };
    const seedReceivers = (node: ts.Node): void => {
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node))
        && node.type
        && [...capabilityNames].some((name) => node.type!.getText(sf).includes(name))) {
        receivers.add(node.name.getText(sf));
      }
      if (ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && isPgBossConstruction(node.initializer)
      ) {
        receivers.add(node.name.text);
      }
      ts.forEachChild(node, seedReceivers);
    };
    seedReceivers(sf);
    let receiverChanged = true;
    while (receiverChanged) {
      receiverChanged = false;
      const propagateReceivers = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && node.initializer) {
          if (ts.isIdentifier(node.name) && isReceiverExpression(node.initializer) && !receivers.has(node.name.text)) {
            receivers.add(node.name.text);
            receiverChanged = true;
          }
          if (ts.isObjectBindingPattern(node.name) && isReceiverExpression(node.initializer)) {
            for (const element of node.name.elements) {
              const property = (element.propertyName ?? element.name).getText(sf);
              const local = element.name.getText(sf);
              if (PG_BOSS_MUTATION_METHODS.has(property) && !destructuredMethods.has(local)) {
                destructuredMethods.add(local);
                receiverChanged = true;
              } else if (capabilityMembers.has(property) && !receivers.has(local)) {
                receivers.add(local);
                receiverChanged = true;
              }
            }
          }
        }
        ts.forEachChild(node, propagateReceivers);
      };
      propagateReceivers(sf);
    }
    const visitCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const method = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : ts.isElementAccessExpression(node.expression)
            ? staticStringValue(node.expression.argumentExpression)
            : null;
        const receiver = ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression)
          ? node.expression.expression
          : null;
        if (receiver !== null && (isReceiverExpression(receiver) || isPgBossConstruction(receiver))) {
          if ((method !== null && PG_BOSS_MUTATION_METHODS.has(method))
            || (ts.isElementAccessExpression(node.expression) && method === null)) {
            writers.add(file);
          }
        }
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && destructuredMethods.has(node.expression.text)) writers.add(file);
      ts.forEachChild(node, visitCalls);
    };
    visitCalls(sf);
  }
  return [...writers].sort();
}

function validatePhysicalWriterClosure(
  files: ReadonlyMap<string, string>,
  appAuthorities: readonly Readonly<{
    table: string;
    physicalWriters: readonly string[];
  }>[],
  supportingStores: readonly Readonly<{
    writerOwner: string;
  }>[]
): void {
  const failures: string[] = [];
  const physical = scanWriters(new Map(files));
  for (const finding of physical) {
    const authority = appAuthorities.find((candidate) => candidate.table === finding.table);
    if (!authority?.physicalWriters.includes(finding.file)) {
      failures.push(`undeclared app-table writer: ${finding.table} / ${finding.file}`);
    }
  }
  for (const authority of appAuthorities) {
    const discovered = new Set(
      physical.filter((finding) => finding.table === authority.table).map((finding) => finding.file)
    );
    for (const file of authority.physicalWriters) {
      if (!discovered.has(file)) failures.push(`declared app-table writer was not discovered: ${authority.table} / ${file}`);
    }
  }
  const discoveredPgBoss = scanPgBossWriterFiles(files);
  const declaredPgBoss = [...new Set(supportingStores.map((store) => store.writerOwner))].sort();
  for (const file of discoveredPgBoss) {
    if (!declaredPgBoss.includes(file)) failures.push(`undeclared pg-boss writer: ${file}`);
  }
  for (const file of declaredPgBoss) {
    if (!discoveredPgBoss.includes(file)) failures.push(`declared pg-boss writer was not discovered: ${file}`);
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

/**
 * The expected writer set, per table, with the reason each entry is there.
 * A key here is a REVIEWED decision; a writer in the scan and not here fails.
 *
 * KEYED `file::verb`, NOT `file` (billing gate, 2026-08-27). Keying on the file
 * alone discarded the `verb` the scanner had already collected, so an
 * `UPDATE creator_profiles SET state` added to `with-workspace.ts` — the
 * natural home, and already an expected INSERT writer — would land with this
 * suite green while `creator_profiles`' own entry claimed the cap was enforced
 * by its only caller. That is the archive/reactivate debt R-35 §2 names, which
 * had prose and no instrument; it has one now. It is also the same failure this
 * file already records for `brain_docs` two entries down: a reviewed decision
 * is only reviewed if it describes what is there.
 */
const EXPECTED: Record<string, Record<string, string>> = {
  account: {},
  auth_mail_outbox: {
    "packages/db/src/auth-mail.ts::insert":
      "Quota admission inserts one outbox row per admitted transactional mail under the global advisory lock, before any provider call.",
    "packages/db/src/auth-mail.ts::update":
      "The dispatch mark and the single outcome writer are the only application mutations; terminal outcomes accept only an identical replay. The identity-erasure recipient scrub is NOT here: it is the registry-driven SQL port (lifecycle-sql-port.ts, DYNAMIC_LIFECYCLE_WRITERS), which this scanner cannot see and which registry closure plus the independent probe cover instead (round-1 tenancy CHANGE).",
    "packages/db/src/auth-mail.ts::delete":
      "The 90-day retention receiver deletes content-free delivery outcomes by admission time.",
  },
  auto_topup_protocol_rollouts: {
    "packages/credits/src/stripe/auto-topup-rollout.ts::update":
      "The staged billing rollout authority records only reviewed expansion, drain-proof, reconciliation, and activation transitions.",
  },
  tier_checkout_protocol_rollouts: {
    "packages/credits/src/stripe/tier-checkout-rollout.ts::update":
      "The operator-only rollout authority records the provider-bound drain, complete account-wide reconciliation proof, and activation transition.",
  },
  config_versions: {
    "packages/config/src/index.ts::insert":
      "The runtime config authority appends a validated immutable configuration version.",
    "packages/db/src/seed.ts::insert":
      "The database seed installs the immutable initial configuration document idempotently.",
  },
  memberships: {
    "packages/db/src/bootstrap.ts::insert":
      "The bootstrap transaction creates the authenticated user's initial owner membership.",
    "packages/db/src/deletion-lifecycle.ts::update":
      "The deletion authority suspends identity memberships and restores only unchanged versioned snapshots during an authorised cancellation.",
    "packages/db/src/seed.ts::insert":
      "The deterministic development seed creates its fixture owner membership.",
  },
  pause_periods: {
    "packages/credits/src/pause.ts::insert":
      "The billing pause authority opens a workspace pause under the money lock.",
    "packages/credits/src/pause.ts::update":
      "The billing pause authority closes the exact open pause under the money lock.",
  },
  public_sample_spin_buckets: {
    "packages/db/src/public-sample-spin.ts::insert":
      "Phase 10a: the DB-atomic public limiter opens a visitor's one 24-hour window under the current key version, inside the same transaction that reserves the R-123 spend.",
    "packages/db/src/public-sample-spin.ts::update":
      "Phase 10a: the same limiter advances counters (admitted, blocked, refused, duplicate) on an existing window; it never moves the window's start or expiry.",
  },
  rate_limit: {
    "packages/db/src/auth-lifecycle.ts::insert":
      "The fresh-factor authorities consume durable, pseudonymous account/client attempt budgets before password hashing so reauthentication work remains bounded across processes.",
    "packages/db/src/auth-lifecycle.ts::onConflictDoUpdate":
      "The fresh-factor authorities atomically advance the same durable rate-limit buckets inside their admission transactions.",
  },
  session: {
    "packages/db/src/deletion-lifecycle.ts::delete":
      "Identity tombstoning revokes every Better Auth session only after recovery delivery and durable journal acknowledgement; workspace/profile deletion never writes this table.",
    "packages/db/src/auth-lifecycle.ts::update":
      "The recent-reauth authority advances only the authenticated session's factor-verification timestamp before destructive operations.",
  },
  stripe_events: {
    "packages/credits/src/stripe/webhooks.ts::insert":
      "The verified Stripe webhook transaction records the provider event exactly once.",
    "packages/credits/src/stripe/webhooks.ts::update":
      "R-165 (audit P5-A1): the held-money replay settles a `held_tombstoned` receipt to the outcome `dispatch` returned, under the workspace's membership and billing locks and a row lock taken first, conditional on the held outcome. Migration 0064's trigger refuses every other outcome change, so this is the one outcome writer after insert. R-167 adds two content-free markers on the same table: `held_replay_attempted_at` (stamped by every replay attempt, so the sweep rotates stuck workspaces) and `money_needs_operator_paged_at` (stamped when the sweep pages a money receipt that needs an operator, once).",
    "packages/db/src/deletion-executor.ts::update":
      "R-166 (billing gate H1/M1): `recordRefundOwedInTx` moves each `held_tombstoned` receipt of the workspace being erased to `refund_owed`, with its amount, currency and the erasing operation's id, in the erasure transaction and before the payload purge — the durable refund-owed record. Conditional on the held outcome; migration 0065's trigger admits held -> refund_owed once and nothing after.",
    "packages/db/src/retention-receiver.ts::update":
      "The subject-erasure payload purge (Phase 10b-1 round 3). A COMPLETED identity or workspace erasure used to leave the deleted person's email, name and billing address in `payload` for up to 90 days, because `erasureHold` was satisfied by the RECEIVER existing and that receiver is a clock measured from `received_at`, not an erasure step. The purge lifts the finance facts out first, in the same transaction, then blanks the payload for every workspace the subject belonged to. It names the table in source (unlike the dynamic sweep in the same file), so it is a scannable physical writer and is enumerated here rather than left to registry closure.",
  },
  stripe_finance_extracts: {
    "packages/db/src/finance-extract.ts::insert":
      "Phase 10b-1 Task 6: the pre-redaction finance extract. The ONLY writer, and it writes in the same transaction as — and strictly before — the 90-day payload redaction, so no money fact is lost to a redaction that ran first. Idempotent on (source event, object id), so a resumed sweep re-extracting an event books nothing twice.",
  },
  subscriptions: {
    "packages/credits/src/stripe/billing-contact.ts::update":
      "Plan C3 (Phase 10b-1): the billing-contact handover moves `billing_contact_user_id` to the accepting owner, only after the provider copy has been rewritten and verified.",
    "packages/credits/src/stripe/deletion-commands.ts::update":
      "The deletion executor's auto-top-up fence disables the mirror flag for a tombstoned workspace; this package still owns every subscriptions write (Phase 10b-1 Task 4).",
    "packages/credits/src/pause.ts::update":
      "The pause authority keeps the subscription pause mirror coherent with pause_periods.",
    "packages/credits/src/stripe/actions.ts::update":
      "The checkout and portal actions update only their reviewed local subscription mirror fields.",
    "packages/credits/src/stripe/auto-topup-rollout.ts::update":
      "The operator-only cutover authority fences legacy consent, revalidates remembered opt-ins, and advances every subscription into the durable-attempt protocol under global billing-table locks.",
    "packages/credits/src/stripe/auto-topup-v1-reconcile.ts::update":
      "The operator reconciler replaces and later clears only the exact expired v1 dispatcher claim after two complete provider proofs.",
    "packages/credits/src/stripe/auto-topup.ts::update":
      "The request-time auto-top-up authority reserves, dispatch-binds, retires, and settles one durable attempt under the workspace money lock.",
    "packages/credits/src/stripe/customers.ts::insert":
      "The customer authority establishes the one-workspace-to-one-customer mirror row.",
    "packages/credits/src/stripe/tier-checkout-rollout.ts::update":
      "The operator-only tier Checkout cutover atomically fences every subscription-eligible legacy generation while the rollout and billing tables are locked.",
    "packages/credits/src/stripe/tier-checkout-v1-reconcile.ts::update":
      "The operator-only restore reconciler reconstructs one exact provider-backed tier Checkout attempt before replaying its immutable Stripe evidence.",
    "packages/credits/src/stripe/webhooks.ts::update":
      "Verified Stripe events reconcile the local subscription mirror.",
  },
  user: {
    "packages/db/src/lifecycle-sql-port.ts::insert":
      "Identity erasure inserts one random 'Deleted member' stub so retained deletion receipts keep a valid RESTRICT link without naming the erased identity (R-122; Phase 10b-1 Task 4).",
    "packages/db/src/deletion-lifecycle.ts::update":
      "The identity deletion authority disables login after recovery delivery and journal acknowledgement, and cancellation removes the disable marker without restoring revoked sessions.",
    "packages/db/src/seed.ts::insert":
      "The deterministic development seed creates the Better Auth fixture identity.",
    "packages/db/src/testing.ts::insert":
      "The isolated database-test helper creates only explicit Better Auth fixture identities.",
  },
  users: {
    "packages/db/src/lifecycle-sql-port.ts::insert":
      "The domain-identity half of the stub member above, tombstoned at creation (Phase 10b-1 Task 4).",
    "packages/db/src/bootstrap.ts::insert":
      "The bootstrap transaction creates the email-free domain identity row.",
    "packages/db/src/deletion-lifecycle.ts::update":
      "The identity deletion authority owns the domain tombstone/cancellation state transition under identity-first membership locks.",
    "packages/db/src/seed.ts::insert":
      "The deterministic development seed creates the email-free domain fixture row.",
  },
  verification: {
    "packages/db/src/auth-lifecycle.ts::insert":
      "R-164: the Google re-authentication challenge's single-use state row (`respin-google-reauth:<id>`): a session digest, the PKCE verifier and the nonce — no user id — expiring with R-118's ten-minute window.",
    "packages/db/src/auth-lifecycle.ts::delete":
      "R-164: the callback CONSUMES the state row as it reads it (DELETE ... RETURNING), which is what makes the state single-use: a replay finds nothing.",
  },
  workspaces: {
    "packages/db/src/lifecycle-sql-port.ts::insert":
      "Workspace erasure inserts one random tombstoned 'Deleted workspace' stub for the retained receipts to point at (Phase 10b-1 Task 4).",
    "packages/db/src/bootstrap.ts::insert":
      "The bootstrap transaction creates the authenticated user's personal workspace.",
    "packages/db/src/deletion-lifecycle.ts::update":
      "The deletion authority owns workspace tombstone/cancellation transitions after owner, typed-name, and fresh-reauth checks.",
    "packages/db/src/seed.ts::insert":
      "The deterministic development seed creates its fixture workspace.",
  },
  credit_ledger: {
    "packages/credits/src/balance.ts::insert":
      "deriveBalanceInTx materialises one append-only expiry row per exhausted lot, and mintFreeAllowanceIfDue mints the config-derived Free-period grant idempotently.",
    "packages/credits/src/ledger.ts::insert":
      "grantCredits, purchasePackCredits, adjustCredits, debitCredits and refundCredits are the reviewed append-only money mutations; each writes a server-derived kind/sign/reference shape at the database clock and relies on the ledger constraints and idempotency indexes.",
  },
  deletion_membership_snapshots: {
    "packages/db/src/deletion-lifecycle.ts::insert":
      "Identity tombstoning immutably captures the role and version of every membership before suspension.",
    "packages/db/src/deletion-lifecycle.ts::update":
      "Cancellation records the deterministic restore/conflict outcome without changing the captured membership facts.",
  },
  deletion_cancellation_proofs: {
    "packages/db/src/auth-lifecycle.ts::insert":
      "The authenticated recent-reauth authority creates one short-lived operation-bound cancellation proof without accepting an identity from the caller.",
    "packages/db/src/auth-lifecycle.ts::update":
      "Minting a replacement proof consumes any prior unconsumed proof for the same deletion operation before inserting the new short-lived proof.",
    "packages/db/src/deletion-lifecycle.ts::update":
      "Identity cancellation consumes the exact proof in the same transaction as the journalled cancellation and conditional membership restoration.",
  },
  deletion_operation_transitions: {
    "packages/db/src/deletion-lifecycle.ts::insert":
      "The deletion authority stores one local receipt for each externally acknowledged append-only journal transition.",
  },
  deletion_external_commands: {
    "packages/db/src/deletion-external-commands.ts::insert":
      "The outbox stores one command identity per (operation, kind, attempt) before any provider dispatch; a retry is a new attempt only after a failed one.",
    "packages/db/src/deletion-external-commands.ts::update":
      "The dispatch mark and the single outcome writer advance a command through pending → succeeded | failed | unknown; terminal rows accept only an identical replay.",
  },
  activation_cohort_daily: {
    "packages/db/src/activation.ts::onConflictDoUpdate":
      "Phase 10b-1 Task 7: the same upsert's ON CONFLICT arm — the per-cohort counters increment in place, and the row carries no id to conflict on but (cohort_date, metric_version).",
    "packages/db/src/activation.ts::insert":
      "Phase 10b-1 Task 7 / R-121: the identifier-free cohort aggregate. Upserted exactly once per identity erasure, in the erasure transaction, from a contribution captured at request time; carries dates, counts and the metric version and no id of any kind.",
  },
  deletion_operations: {
    "packages/db/src/activation.ts::update":
      "Phase 10b-1 Task 7: the pending -> applied transition of the captured activation contribution, in the erasure transaction. Guarded by the pending state in the WHERE, so a replay updates zero rows and applies nothing twice.",
    "packages/db/src/deletion-executor.ts::delete":
      "R-166 (tenancy gate H2): a workspace erasure leaving grace retires the UNRESERVED profile drafts inside it — `requested`, no journal reservation, so no transition, proof or command references them (the restrict foreign keys would refuse the delete if one did) — because once the workspace is tombstoned they can never be reserved, and left in place their profile_id would hold the profile row the erasure removes.",
    "packages/db/src/deletion-executor.ts::update":
      "The worker executor claims and releases the operation lease, erases the recovery digest at erasure start, and clears the lease on completion; state transitions still go through the deletion authority's journal append.",
    "packages/db/src/deletion-lifecycle.ts::insert":
      "The deletion authority creates the durable, idempotent current projection for identity, profile, and workspace requests — including R-160's cascaded workspace deletions, reserved in the identity's own reservation transaction.",
    "packages/db/src/deletion-lifecycle.ts::delete":
      "R-160: an identity request abandoned on an expired recovery window discards the workspace deletions it cascaded — rows still in `requested` at journal version 0, with no transition, command or snapshot — in the same transaction that journals the abandonment.",
    "packages/db/src/deletion-lifecycle.ts::update":
      "The deletion authority advances the projection only through the checked forward state machine and records delivery, journal, lease, and cancellation facts.",
  },
  deletion_recovery_sessions: {
    "packages/db/src/auth-lifecycle.ts::insert":
      "The cancellation recovery authority mints a short-lived, one-use challenge only after the exact identity recovery credential is presented, while persisting the bounded attempt population.",
    "packages/db/src/auth-lifecycle.ts::update":
      "Password-proof admission atomically consumes the exact authenticated-user-bound recovery challenge before password verification, so the original recovery credential and challenge cannot be replayed.",
  },
  brain_docs: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().writeBrainDoc — the INSERT: status and version server-derived, cage-asserted, pause-gated, role-gated.",
    "packages/db/src/with-workspace.ts::update":
      "writeCapabilities().writeBrainDoc, .confirmBrainDocFields and .activateBrainDoc — the three UPDATE lifecycle acts (a new proposal supersedes every older proposal but never the active version under the profile lock; confirmed_by is server-derived from the session; activation supersedes the incumbent active version plus any pre-invariant legacy proposal and refuses unconfirmed or drifted content). SURFACED BY MAKING THIS SCAN VERB-AWARE, 2026-08-27: the file-only key had collapsed all capabilities into one INSERT entry whose text said 'the ONE write surface' after more had landed, so the scan stayed green while its stated reason was false. Splitting by verb is what made the update path nameable at all.",
  },
  onboarding_inputs: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().appendOnboardingInput — normalises, hashes, and stamps the scope's ids",
    "packages/db/src/promotion-ops.ts::insert":
      "appendPromotionSummaryForProposalInScope — the only summary writer. It accepts a locked proposal id, derives content/class/evidence from the minted stored proposal, and never accepts caller text, class, URL, or field key.",
  },
  promotion_proposals: {
    "packages/db/src/promotion-ops.ts::insert":
      "refreshPromotionProposalsInScope persists only a draft validated by @respin/brain's private mint; the DB projects it to columns but never constructs a proposal.",
    "packages/db/src/promotion-ops.ts::update":
      "refreshPromotionProposalsInScope marks only proposed rows stale/superseded, and decidePromotionProposalInScope records the terminal server-derived decision/activation under the locked profile.",
    "packages/db/src/promotion-audit.ts::update":
      "Phase 10a plan C1 (R-115): the pre-deploy audit's one idempotent migration operation supersedes still-proposed result proposals whose joined evidence carries a non-verified row; it touches no other status and no decision column.",
  },
  proposal_evidence_results: {
    "packages/db/src/promotion-ops.ts::insert":
      "refreshPromotionProposalsInScope copies the exact minted treatment/baseline membership into immutable same-tenant joins; no update or delete writer exists.",
  },
  proposal_evidence_feedback: {
    "packages/db/src/promotion-ops.ts::insert":
      "refreshPromotionProposalsInScope copies the exact minted feedback membership into immutable same-tenant joins; no update or delete writer exists.",
  },
  model_usage: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().recordModelUsage — the append-only spend record",
    // Launch L2 (R-151; L1 billing NOTE 1, the draft-1 fix). The spend FACTS
    // stay append-only — tokens, cost, outcome, model and attempt are never
    // rewritten. The ONE update is `settleGeneration` marking a GENERATION's
    // own rows `consumed_included_build = true` inside the settlement
    // transaction (false -> true, never back), keyed on the settled claim's
    // own attempt id and purpose read off the returned row: the creator was
    // charged for them. An operation that settles nothing keeps every row
    // false, so both uncharged accessors count it. The onboarding voice
    // purpose is never touched (A-11 fence).
    "packages/db/src/with-workspace.ts::update":
      "writeCapabilities().settleGeneration — marks the settled generation's own model_usage rows consumed in the money transaction (generation purpose only, false->true); no spend fact is rewritten.",
  },
  // Launch L2 (R-151). The creative piece: INSERT when a concept is chosen or
  // an own idea entered (zero cost), UPDATE for "New generation", cancel and
  // the settlement's selection link. One physical writer file, reached only
  // through `writeCapabilities` (role, pause and lifecycle gates).
  creative_pieces: {
    "packages/db/src/creative-work-ops.ts::insert":
      "createCreativePieceInScope via writeCapabilities().createCreativePiece — scope columns from the scope, operation id/state/version from database defaults, the origin and quote version validated locals; the source must be this profile's usable ideation generation with the index inside its ideas array.",
    "packages/db/src/creative-work-ops.ts::update":
      "renewCreativePieceOperationInScope (New generation: database-minted id, version-guarded), cancelCreativePieceInScope (selected -> cancelled, version-guarded), selectCreativePieceVersionInScope (launch L4, R-153: \"use this version\" — the selection moves to another usable version of the same piece, version-guarded, zero cost) and linkCreativePieceScriptInScope (the settlement's selection link, inside settleGeneration's money transaction).",
  },
  // R-80. INSERT ONLY, and the absence of `::update` and of any delete is the
  // assertion rather than an oversight: the claim on a profile's included build
  // is decided ONCE, by whoever wins the unique index, and a claim that could be
  // MOVED is a free build that can be handed out twice — the exact defect this
  // table replaced. Its one writer is the same transaction that writes the
  // `model_usage` row it names, which is what makes the decision a commit-time
  // one rather than a comparison of timestamps in somebody's snapshot.
  first_billable_attempts: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().recordModelUsage — the claim rides with the spend record, in one transaction, via onConflictDoNothing on (profile_id, purpose). Both scope columns, the purpose and the attempt id are read off the RETURNED usage row, never from the caller's params, so what is claimed is what was actually stored.",
    "packages/db/src/with-workspace.ts::delete":
      "writeCapabilities().releaseIncludedBuildClaim (audit Phase 3 gate, billing note) — runInference gives back THIS attempt's own claim, scoped on both axes, when the free build's output store was refused after step 8b committed the claim.",
  },
  // Written from slice 1. ONE writer, and the split is the point: the INSERT
  // lives in `packages/db` (a scope-caged workspace write capability) while the
  // DECISION — the per-tier cap, priced off the resolved tier — lives in
  // `packages/credits/src/profiles.ts`, because the tier's sole authority is
  // `credits/src/state.ts` and `packages/db` cannot import it without creating
  // a second tier authority (R-30 constraint 2, the defect class behind two M1
  // gate findings). This entry is what stops a SECOND writer appearing that
  // skips the cap: a `.insert(creatorProfiles)` anywhere else fails here.
  creator_profiles: {
    "packages/db/src/lifecycle-sql-port.ts::insert":
      "Profile or workspace erasure inserts one 'Deleted profile' stub (deletion_tombstoned) for the retained profile receipts (Phase 10b-1 Task 4).",
    "packages/db/src/with-workspace.ts::insert":
      "workspaceWriteCapabilities().createProfile — strips server-derived fields and stamps the scope's workspace id, and refuses a viewer. There is deliberately NO `::update` entry: nothing archives or reactivates a profile yet, and the slice that adds one owes the same cap check createProfile makes (R-35 §2). Adding an UPDATE here is now a deliberate edit to this file rather than a silent one.",
    "packages/db/src/deletion-lifecycle.ts::update":
      "The deletion authority owns profile tombstone/cancellation transitions after owner, typed-name, and fresh-reauth checks.",
  },
  membership_profile_selections: {
    "packages/db/src/profile-selection.ts::insert":
      "selectActiveProfileInTx — the sole membership-grained selection writer; eligibility is joined through the acting membership and an active profile in the same workspace before this upsert.",
    "packages/db/src/profile-selection.ts::onConflictDoUpdate":
      "selectActiveProfileInTx — changes only profile_id and updated_at for the same (user_id, workspace_id) membership key.",
  },
  // Written by M2b slice 2b. All three entries are `spend-rollup.ts`, not
  // `with-workspace.ts` — this is the ONE table whose writer lives outside the
  // cage file, because it has no FK to a scope and no ProfileScope/
  // WorkspaceScope grain to cage against (its own docblock: "a plain column
  // with NO foreign key, deliberately").
  workspace_spend_monthly: {
    "packages/db/src/spend-rollup.ts::insert":
      "upsertSpendRollup — the values() side of the one grain-key insert-or-increment path (R1).",
    "packages/db/src/spend-rollup.ts::onConflictDoUpdate":
      "upsertSpendRollup's increment (R1). The repo's first onConflictDoUpdate in product code, instrumented before it existed (this scanner's own probe at line ~358 above).",
    "packages/db/src/spend-rollup.ts::update":
      "pseudonymiseWorkspaceSpend — R-30.5/R-54's deletion-executor obligation: moves every row of a deleted workspace to one fresh random id, discarding the mapping.",
  },
  // Slice 7 (R5a-R5c) — THE EMPTY EXPECTATION M2A LEFT HERE IS NOW FILLED IN,
  // which was the point of leaving it: the first `.insert` or `.update` of this
  // table anywhere in `packages/**` or `app/**` had to fail here and be named.
  //
  // ONE FILE FOR BOTH VERBS, and the split by verb is what makes the entries
  // say something. `frameworks.ts` is the only writer because the shared seed,
  // the creator's private CRUD and the versioning supersede all funnel through
  // it — there is deliberately no framework writer in `with-workspace.ts`,
  // which is where a reader would look first.
  frameworks: {
    "packages/db/src/frameworks.ts::insert":
      "seedSharedFrameworks (the approved F1-F9 library, `onConflictDoNothing` so a re-run never overwrites a curator decision), createPrivateFramework (version 1), editPrivateFramework (the NEXT version), and the shared `insertProposedSharedFramework` used by the explicit trend candidate writer. Every path builds `visibility`, owner ids, `curator_status`, `version` and `confidence` field by field from parsed content — never a caller spread — and runs the REQ-D04 mechanism-level content scan first.",
    "packages/db/src/frameworks.ts::update":
      "editPrivateFramework's private-version supersede, resolveAutopsyFramework's shared rejected/retired-candidate supersede under its fingerprint advisory lock, approvePrivateFramework (the creator approving their own row), and retirePrivateFramework (which sets `retired_at` AND `saturation = 'retired'` together). Private updates carry both owner scope columns; the shared update requires visibility, stable slug/id and a live row.",
  },
  // Slice 3b (Stage A). ONE writer file for both verbs — `saveInterviewDraft`
  // and `submitInterview` share the same two private helpers
  // (`readDraftRow`/the insert-or-update pair), so there is exactly one
  // insert site and one update site, not four.
  onboarding_interview_drafts: {
    "packages/db/src/interview-ops.ts::insert":
      "saveInterviewDraft (first save for a profile) and submitInterview (no prior draft existed) — both insert the row that becomes this profile's ONE draft (unique index on profile_id).",
    "packages/db/src/interview-ops.ts::update":
      "saveInterviewDraft (a later patch, merged field-by-field) and submitInterview (stamping submitted_at, guarded by `submitted_at IS NULL` so a violated invariant refuses rather than double-submitting).",
  },
  // Slice 6 (Stage C) — THE EMPTY EXPECTATIONS STAGE A LEFT HERE ARE NOW
  // FILLED IN, which was the point of leaving them: stage A shipped the schema
  // with no writer, and the first `.insert` or `.update` to appear anywhere in
  // `packages/**` or `app/**` had to fail here and be named. It did, and this
  // is the naming.
  //
  // Two entries, not one, because the two tables have different futures: the
  // record is APPEND-ONLY (INSERT only, like `brain_activation_snapshots`) and
  // the claim TRANSITIONS (INSERT plus UPDATE). Keeping them apart is what
  // makes the absence of a `generations::update` key an assertion rather than
  // an oversight — an UPDATE of a stored generation would rewrite a creator's
  // own history, and it would otherwise arrive under the claim table's licence.
  generations: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().settleGeneration — the ONE writer, and it writes the row and moves its claim to `settled` in the same call, because `generation_attempts_settled_has_generation` is an EQUALITY that neither half can satisfy alone. Role-gated, cage-asserted, every column built field by field from the scope (no spread to strip). There is deliberately NO `::update` entry: `generations` is immutable, has no `updated_at`, and adding an UPDATE here is now a deliberate edit to this file rather than a silent one.",
  },
  // Slice 7 (R10). APPEND-ONLY, INSERT ONLY, like `generations` and
  // `brain_activation_snapshots` — and the absence of a `::update` key is the
  // assertion, not an oversight: feedback is a record of what a creator said,
  // and an event log that can be rewritten is not evidence. A creator who
  // changes their mind records a DIFFERENT reaction.
  // AUDIT P6-A1 (R-174, migration 0069) ADDED THE FIRST `::update` KEY, and
  // it is narrow by construction: `excludeGenerationFeedbackFromHistory` sets
  // `history_excluded_at` from NULL to the database clock and nothing else,
  // and the `generation_feedback_event_immutable` trigger refuses any UPDATE
  // that changes which output a reaction is about, what it was, whose it is or
  // when it was recorded, or that clears or moves the stamp. It deliberately
  // leaves `note` writable at the database (a future pseudonymisation
  // executor, the 0022 precedent), so the note's immutability is still THIS
  // scan's: the update writer below is the only one, and it sets one column.
  generation_feedback: {
    "packages/db/src/with-workspace.ts::update":
      "writeCapabilities().excludeGenerationFeedbackFromHistory — the ONE update writer (audit P6-A1, R-174). Owner-or-editor, cage-asserted, the target resolved through both scope columns first (foreign, missing and malformed ids raise one byte-identical FeedbackExclusionTargetError), then `history_excluded_at = now()` WHERE it is still NULL. The trigger from migration 0069 makes a change to the reaction, its target, its owner or its timestamp, or to a stamp already set, a database error; `note` is left writable there and is held by this list.",
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().recordGenerationFeedback — the ONE writer. Role-gated (a viewer may not), cage-asserted, both scope columns written from the scope rather than from the caller, the closed reaction set checked at RUNTIME as well as in the type (a cast otherwise reaches the pgEnum and the creator sees a driver error), and the note normalised/bounded/refused-if-blank. Insert-or-REFUSE via `onConflictDoNothing` against `generation_feedback_generation_reaction_uq`: a swallowed duplicate would report success on a note that was not kept.",
  },
  // Slice 9a (R5-R9). APPEND-ONLY, INSERT ONLY, like `generations` and
  // `generation_feedback` — and the absence of a `::update` key is the
  // assertion, not an oversight: a logged result is an observation of a window
  // that has already passed, a creator whose numbers changed logs a NEW window,
  // and a result set that can be rewritten is not evidence. It is also the
  // table 9b builds promotion proposals from, so an UPDATE here would let a
  // proposal's evidence move after the proposal was made.
  //
  // REGISTERED IN THE SAME CHANGE AS THE TABLE, which is the whole point of
  // C7: an unregistered table produces a green suite and an unpoliced write
  // surface, and the green suite is the dangerous half.
  results: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().recordResult — the ONE writer. Role-gated (a viewer may not), cage-asserted, both scope columns written from the scope rather than from the caller, and FIVE columns with no caller parameter at all: `evidence_state` is derived from whether numbers were supplied (R6 — manual numbers are `quantified_self_reported`, never verified), the three `connector_*` columns are written NULL so the database's equality CHECK makes `connector_verified` unreachable, `metric_key`/`metric_declared_by_doc_id` are read from the profile's own ACTIVE strategy document (R8), and `treatment_key` is computed by `treatmentKeyFor` from the generation re-read through the profile's scope (C4). The closed vocabularies are checked at RUNTIME as well as in the type (a cast otherwise reaches the pgEnum and the creator sees a driver error), and the note is normalised/bounded/refused-if-blank. Insert-or-REFUSE via `onConflictDoNothing` against `results_generation_metric_window_uq`: a swallowed duplicate would report success on numbers that were not kept, and would let a cohort minimum be reached by pressing submit three times.",
  },
  generation_attempts: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().claimGenerationAttempt — the durable claim committed BEFORE outbound HTTP (R14). Insert-or-observe via onConflictDoNothing, so two concurrent presses of one attempt id produce one row and one winner; `state`, the timestamps and both terminal ids are written here, never taken from a caller.",
    "packages/db/src/generation-recovery.ts::update":
      "Phase 10b-1 Task 6 / C5: the one-minute attempt receiver, which is a WORKER path and deliberately not a writeCapabilities one — it moves rows no session owns (a claim abandoned before the vendor at 15 minutes, a started attempt past its deadline, an unsettled candidate at 24 hours). It NEVER settles and never calls a provider: settlement stays with `settleGeneration` in with-workspace.ts, because a second author on the debit would be a second chance to charge for one build.",
    "packages/db/src/with-workspace.ts::update":
      "writeCapabilities().advanceGenerationAttempt (claimed -> vendor_started -> vendor_complete, and the two non-settled terminals) and .settleGeneration (the `settled` transition, which is deliberately unreachable from the first). BOTH put the legal FROM-states in the WHERE, so a skipped or replayed transition updates zero rows and refuses — the half of `forward only` application code owns, since Postgres cannot compare a row to its own previous value without a trigger. R14c: advanceGenerationAttempt is ALSO the writer that stores the durable `candidate` on the move to `vendor_complete` and CLEARS it on every other transition, and settleGeneration clears it on the way to `settled` — `generation_attempts_candidate_iff_vendor_complete` is an EQUALITY, so no terminal row may retain output text and no `vendor_complete` row may exist that a retry cannot settle. The candidate is server-derived here and is never taken from a caller.",
  },
  // Slice 3b (Stage A). ONE writer, append-only, INSERT only — there is no
  // update or delete path by design (R8/R9's own docblock on the table).
  brain_activation_snapshots: {
    "packages/db/src/with-workspace.ts::insert":
      "writeCapabilities().activateBrainDocCoherent — records the coherent snapshot in the SAME transaction as (and after) activateBrainDoc's own supersede-then-activate pair.",
  },
  // Slice 8 system spend. This deliberately lives outside the scope cage: the
  // product budget must remain structurally unable to receive a workspace or
  // profile id. The append-only facts and retained aggregate are written in
  // one transaction, keyed by the worker's unique job-attempt id.
  system_model_usage: {
    "packages/db/src/system-spend.ts::insert":
      "recordSystemModelUsage â€” append-only non-tenant fixed-order attempt fact with actual stage-call count, idempotent on job_attempt_id.",
  },
  system_model_usage_reconciliations: {
    "packages/db/src/system-spend.ts::insert":
      "reconcileSystemModelUsage â€” append-only one-per-attempt actual-cost correction.",
  },
  system_spend_claims: {
    "packages/db/src/system-spend.ts::insert":
      "claimSystemSpend â€” append-only job-attempt reservation; a duplicate rolls the guarded reservation back.",
  },
  system_spend_daily: {
    "packages/db/src/system-spend.ts::insert":
      "claimSystemSpend creates the retained daily row before a first reservation.",
    "packages/db/src/system-spend.ts::update":
      "claimSystemSpend atomically reserves below the captured cap; recordSystemModelUsage folds one inserted fact into totals.",
  },
  system_worker_health: {
    "packages/db/src/system-spend.ts::insert":
      "recordSystemWorkerHealth creates the content-free retained operational row.",
    "packages/db/src/system-spend.ts::onConflictDoUpdate":
      "recordSystemWorkerHealth replaces one named worker's latest heartbeat, schedule, count, pool and budget-exhaustion snapshot.",
  },
  trend_sources: {
    "packages/db/src/trends-storage.ts::insert":
      "createTrendSource registers shared YouTube metadata sources; createPrivateSubmittedTrendSource stamps submitted-link ownership from a minted ProfileScope.",
  },
  tracked_niches: {
    "packages/db/src/trends-storage.ts::insert":
      "trackNicheForProfile â€” stamps profile/workspace from a minted ProfileScope after validating an injected resolved entitlement.",
    "packages/db/src/trends-storage.ts::delete":
      "untrackNicheForProfile removes only an exact id under the minted profile/workspace pair so a finite plan slot can be reused.",
  },
  trend_items: {
    "packages/db/src/trends-storage.ts::insert":
      "recordSharedTrendItem and recordPrivateTrendItem â€” the latter stamps both ownership columns from a minted ProfileScope.",
    "packages/db/src/trends-storage.ts::update":
      "recordSharedTrendItem and recordPrivateTrendItem refresh exact stored observation inputs idempotently without regressing transcript availability; transcript writers mark only their already-authorized item transcript-ready.",
  },
  trend_transcripts: {
    "packages/db/src/trends-storage.ts::insert":
      "recordPrivateTrendTranscript re-reads the private item through the same profile/workspace scope; recordSharedTrendTranscript requires a closed affirmative shared-rights provenance shape before either writes raw text.",
  },
  autopsies: {
    "packages/db/src/system-spend.ts::insert":
      "createSystemAutopsyAttemptStore atomically inserts the bounded completed artefact with its non-tenant usage fact and cache transition.",
  },
  // THE MONEY RULE FOR THIS TABLE, WRITTEN WHERE A NEW WRITER WILL READ IT
  // (slice 8c round 2, billing NOTE 3). A `profile_private` claim is what a
  // creator PAID for, and `settleParkedAutopsies.neverChargedClaimIds` derives
  // "nothing was charged for this" from the ABSENCE of an `autopsy_claim` debit
  // row for the claim in the workspace. That derivation is exact only while
  // every writer keeps the rule below: a writer that creates a
  // `profile_private` row for a paid paste and skips (or defers) its debit
  // makes the /trends section say "nothing was charged ... your balance is
  // untouched" about a claim that WAS charged. Reproduced by deleting the debit
  // row by hand. Registering a writer here is where that cost is paid.
  //
  //   A writer that creates an `autopsy_cache_claims` row for a paid paste MUST
  //   write its `autopsy_claim` debit in the SAME TRANSACTION; the only claim
  //   that may carry no debit is one the active config document priced at 0.
  autopsy_cache_claims: {
    "packages/db/src/deletion-lifecycle.ts::update":
      "Profile/workspace tombstoning parks already-created private claims and clears their worker lease; it never creates a claim or changes the originating debit.",
    "packages/db/src/trends-storage.ts::insert":
      "claimSharedAutopsyForSystem and claimPrivateAutopsyForSystem create durable per-item cache claims before any vendor call; the private path first mints the profile scope and proves its exact transcript digest. MONEY: the private path is reachable only from submitPastedReference, which writes the claim's autopsy_claim debit on the same transaction unless the active document prices the autopsy at 0 - see the rule above before adding a writer.",
    "packages/db/src/system-spend.ts::update":
      "createSystemAutopsyAttemptStore owns the sessionless attempt id, retry count, failure/parking transition, and atomic successful cache completion.",
  },
};

describe("P8 — every M2a table's writers are enumerated", () => {
  // FILLED IN `beforeAll`, NOT AT COLLECTION: the cold scan parses every
  // production file, and collection-time code cannot yield to the event loop.
  let files: Map<string, string>;
  let physicalWriters: Finding[];
  beforeAll(async () => {
    files = allProductionSources();
    physicalWriters = await scanWritersYielding(files);
    // Warm the parse cache the pg-boss scan reads, between files too.
    for (const [file, raw] of files) {
      sourceFileOf(file, raw);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  });

  it("the scan is not vacuous: it sees all four shapes, for every verb", () => {
    const probe = new Map<string, string>([
      [
        "probe/direct.ts",
        "db.insert(brainDocs).values(x); db.update(brainDocs).set(y); db.delete(brainDocs);",
      ],
      [
        "probe/aliased.ts",
        "const t = brainDocs;\ndb.insert(t).values(x); db.update(t).set(y); db.delete(t);",
      ],
      [
        "probe/schema.ts",
        "db.insert(schema.brainDocs).values(x); db.update(schema.brainDocs).set(y); db.delete(schema.brainDocs);",
      ],
      [
        "probe/raw.ts",
        "q(RAW1); q(RAW2); q(RAW3);".replace("RAW1", "'insert into brain_docs (a) values (1)'")
          .replace("RAW2", "'update brain_docs set a = 1'")
          .replace("RAW3", "'delete from brain_docs where a = 1'"),
      ],
      [
        "probe/upsert.ts",
        "db.insert(workspaceSpendMonthly).values(v).onConflictDoUpdate({ target: t, set: s });",
      ],
      [
        "probe/upsert-alias.ts",
        "const w = workspaceSpendMonthly;\ndb.insert(w).values(v).onConflictDoUpdate({ target: t, set: s });",
      ],
      [
        "probe/upsert-raw.ts",
        "q('insert into workspace_spend_monthly (a) values (1) on conflict (a) do update set b = 2');",
      ],
    ]);
    const found = scanWriters(probe);
    for (const shape of ["direct", "aliased", "schema", "rawSql"] as const) {
      for (const verb of VERBS) {
        expect(
          found.some((f) => f.shape === shape && f.verb === verb),
          shape + "/" + verb + " is invisible to the scanner"
        ).toBe(true);
      }
    }
    for (const shape of ["direct", "aliased", "rawSql"] as const) {
      expect(
        found.some((f) => f.shape === shape && f.verb === "onConflictDoUpdate"),
        shape + "/onConflictDoUpdate is invisible to the scanner"
      ).toBe(true);
    }
    // ...and a COMMENT naming a table is not a writer.
    expect(
      scanWriters(new Map([["c.ts", "// db.insert(brainDocs).values(x)\n"]]))
    ).toEqual([]);
  });

  it("the scan is non-empty against the real repo (it is reading something)", () => {
    expect(PRODUCTION_ROOTS).toEqual(["packages", "app", "worker", "scripts", "lib", "ops"]);
    expect(files.size).toBeGreaterThan(20);
    expect(physicalWriters.length).toBeGreaterThan(0);
  });

  it("the writer scanner and lifecycle registry share the same table population", () => {
    const lifecycleTables = new Set(APP_TABLES);
    expect(
      Object.values(TABLES).filter((table) => !lifecycleTables.has(table as never))
    ).toEqual([]);
    const registeredWriterTables = new Set(
      LIFECYCLE_WRITER_INVENTORY.map((writer) => writer.table)
    );
    expect([...new Set(Object.values(TABLES))].sort()).toEqual([...APP_TABLES].sort());
    expect(Object.keys(EXPECTED).sort()).toEqual([...APP_TABLES].sort());
    expect([...registeredWriterTables].sort()).toEqual([...APP_TABLES].sort());
    expect(() => validatePhysicalWriterClosure(files, LIFECYCLE_WRITER_INVENTORY, SUPPORTING_LIFECYCLE_STORES)).not.toThrow();
    for (const authority of LIFECYCLE_WRITER_INVENTORY) {
      const actualFiles = [...new Set(
        physicalWriters.filter((finding) => finding.table === authority.table).map((finding) => finding.file)
      )].sort();
      expect(
        actualFiles,
        `${authority.table} physical writers disagree with lifecycle authority ${authority.owner}`
      ).toEqual([...authority.physicalWriters].sort());
    }
    const externallyWritten = new Set(
      EXTERNAL_WRITER_AUTHORITIES.map((entry) => entry.table)
    );
    for (const table of ["account", "rate_limit", "session", "user", "verification"] as const) {
      expect(externallyWritten.has(table), `${table} has no external writer authority`).toBe(true);
    }
    expect(SUPPORTING_LIFECYCLE_STORES.map((entry) => entry.store)).toEqual([
      "pgboss.bam",
      "pgboss.job_dependency",
      "pgboss.queue",
      "pgboss.queue_stats",
      "pgboss.schedule",
      "pgboss.subscription",
      "pgboss.version",
      "pgboss.warning",
      "pgboss.job",
      "pgboss.job_common",
      "pgboss.job_partition:*",
      "pgboss.queue_stats_partition:*",
    ]);
    expect(scanPgBossWriterFiles(files)).toEqual(["worker/pg-boss-runtime.ts"]);
  });

  it(
    "reddens for a second app-table or pg-boss capability writer without requiring a direct import",
    // SEVEN planted shapes, each re-running the FULL AST closure scan over
    // every production source -- that is what makes this a witness rather
    // than an assertion about the scanner's own filter, so the cost is
    // inherent and fewer plants would be a weaker guard, not a faster one.
    //
    // Measured, because this budget was already near its limit: 156.8 s on
    // the Tasks 6-9 build tree (87% of the old 180 s) and 173.2 s once the
    // gate fixes added sources for it to walk (96%), then a timeout on the
    // next full-suite run under contention. The old budget was a latent red
    // before this change touched it. Raised with headroom rather than
    // trimmed. The parse is now memoised across plants (`sourceFileOf`,
    // audit Phase 3, 2026-10-06), so each plant re-walks the tree but parses
    // only its own planted files.
    { timeout: 420_000 },
    async () => {
    const yieldToWorkerRpc = () =>
      new Promise<void>((resolve) => setImmediate(resolve));
    // This witness deliberately re-runs the whole AST closure scan several
    // times. Yield between planted shapes so Vitest's worker can answer its
    // reporter RPC while the full suite is under CPU contention.
    await yieldToWorkerRpc();
    const appProbe = new Map(files);
    appProbe.set("worker/rogue-table-writer.ts", "db.insert(brainDocs).values({});");
    expect(() => validatePhysicalWriterClosure(appProbe, LIFECYCLE_WRITER_INVENTORY, SUPPORTING_LIFECYCLE_STORES)).toThrow(/undeclared app-table writer/);
    await yieldToWorkerRpc();

    const pgBossProbe = new Map(files);
    pgBossProbe.set(
      "worker/rogue-pg-boss-writer.ts",
      'import { PgBoss } from "pg-boss";\nexport async function write(boss: PgBoss) { await boss.send("rogue", {}); }'
    );
    expect(() => validatePhysicalWriterClosure(pgBossProbe, LIFECYCLE_WRITER_INVENTORY, SUPPORTING_LIFECYCLE_STORES)).toThrow(/undeclared pg-boss writer/);
    await yieldToWorkerRpc();

    const injectedProbe = new Map(files);
    injectedProbe.set(
      "worker/pg-boss-capability.ts",
      'export type { PgBoss as BossPort } from "pg-boss";'
    );
    injectedProbe.set(
      "worker/rogue-pg-boss-work.ts",
      'import type { BossPort } from "./pg-boss-capability";\nexport async function claim(boss: BossPort) { await boss.work("rogue", async () => undefined); }'
    );
    injectedProbe.set(
      "worker/rogue-pg-boss-fetch.ts",
      'import type { BossPort } from "./pg-boss-capability";\nexport async function fetch(boss: BossPort) { await boss.fetch("rogue"); }'
    );
    expect(scanPgBossWriterFiles(injectedProbe)).toEqual(expect.arrayContaining([
      "worker/rogue-pg-boss-fetch.ts",
      "worker/rogue-pg-boss-work.ts",
    ]));
    expect(() => validatePhysicalWriterClosure(injectedProbe, LIFECYCLE_WRITER_INVENTORY, SUPPORTING_LIFECYCLE_STORES)).toThrow(/undeclared pg-boss writer/);
    await yieldToWorkerRpc();

    const constructedProbe = new Map(files);
    constructedProbe.set(
      "worker/rogue-pg-boss-construction.ts",
      'import { PgBoss } from "pg-boss";\nconst boss = new PgBoss("postgres://example.invalid/db");\nexport async function claim() { await boss.work("rogue", async () => undefined); }'
    );
    expect(scanPgBossWriterFiles(constructedProbe)).toContain("worker/rogue-pg-boss-construction.ts");
    expect(() => validatePhysicalWriterClosure(constructedProbe, LIFECYCLE_WRITER_INVENTORY, SUPPORTING_LIFECYCLE_STORES)).toThrow(/undeclared pg-boss writer/);
    await yieldToWorkerRpc();

    const nestedDiProbe = new Map(files);
    nestedDiProbe.set(
      "worker/rogue-pg-boss-nested-di.ts",
      'import type { PgBoss } from "pg-boss";\ninterface Deps { boss: PgBoss; ordinary: { work(): void } }\nexport async function claim(deps: Deps) { await deps.boss.work("rogue", async () => undefined); }'
    );
    expect(scanPgBossWriterFiles(nestedDiProbe)).toContain("worker/rogue-pg-boss-nested-di.ts");
    expect(() => validatePhysicalWriterClosure(nestedDiProbe, LIFECYCLE_WRITER_INVENTORY, SUPPORTING_LIFECYCLE_STORES)).toThrow(/undeclared pg-boss writer/);
    await yieldToWorkerRpc();

    const escapeProbe = new Map(files);
    escapeProbe.set("worker/pg-boss-star.ts", 'export * from "pg-boss";');
    escapeProbe.set(
      "worker/rogue-pg-boss-alias.ts",
      'import type { PgBoss } from "pg-boss";\nexport async function claim(boss: PgBoss) { const alias = boss; await alias.work("rogue", async () => undefined); }'
    );
    escapeProbe.set(
      "worker/rogue-pg-boss-destructured-method.ts",
      'import type { PgBoss } from "pg-boss";\nexport async function claim(boss: PgBoss) { const { fetch } = boss; await fetch("rogue"); }'
    );
    escapeProbe.set(
      "worker/rogue-pg-boss-destructured-di.ts",
      'import type { PgBoss } from "pg-boss";\ninterface Deps { boss: PgBoss }\nexport async function claim(deps: Deps) { const { boss } = deps; await boss.fetch("rogue"); }'
    );
    escapeProbe.set(
      "worker/rogue-pg-boss-star-construction.ts",
      'import { PgBoss } from "./pg-boss-star";\nconst boss = new PgBoss("postgres://example.invalid/db");\nexport async function claim() { await boss.fetch("rogue"); }'
    );
    escapeProbe.set(
      "worker/rogue-pg-boss-star-namespace.ts",
      'import * as BossModule from "./pg-boss-star";\nconst boss = new BossModule.PgBoss("postgres://example.invalid/db");\nexport async function claim() { await boss.work("rogue", async () => undefined); }'
    );
    expect(scanPgBossWriterFiles(escapeProbe)).toEqual(expect.arrayContaining([
      "worker/rogue-pg-boss-alias.ts",
      "worker/rogue-pg-boss-destructured-di.ts",
      "worker/rogue-pg-boss-destructured-method.ts",
      "worker/rogue-pg-boss-star-construction.ts",
      "worker/rogue-pg-boss-star-namespace.ts",
    ]));
    expect(() => validatePhysicalWriterClosure(
      escapeProbe,
      LIFECYCLE_WRITER_INVENTORY,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/undeclared pg-boss writer/);
    await yieldToWorkerRpc();

    const callShapeProbe = new Map(files);
    callShapeProbe.set(
      "worker/rogue-pg-boss-inline-start.ts",
      'import { PgBoss } from "pg-boss";\nexport async function start() { await new PgBoss("postgres://example.invalid/db").start(); }'
    );
    callShapeProbe.set(
      "worker/rogue-pg-boss-element-send.ts",
      'import type { PgBoss } from "pg-boss";\nexport async function send(boss: PgBoss) { await boss["send"]("rogue", {}); }'
    );
    callShapeProbe.set(
      "worker/rogue-pg-boss-const-element-send.ts",
      'import type { PgBoss } from "pg-boss";\nconst op = "send" as const;\nexport async function send(boss: PgBoss) { await boss[op]("rogue", {}); }'
    );
    callShapeProbe.set(
      "worker/rogue-pg-boss-template-element-send.ts",
      'import type { PgBoss } from "pg-boss";\nexport async function send(boss: PgBoss) { await boss[`send`]("rogue", {}); }'
    );
    callShapeProbe.set(
      "worker/rogue-pg-boss-unresolved-element.ts",
      'import type { PgBoss } from "pg-boss";\nexport async function invoke(boss: PgBoss, op: keyof PgBoss) { await boss[op](); }'
    );
    callShapeProbe.set(
      "worker/rogue-pg-boss-shadowed-element.ts",
      'import type { PgBoss } from "pg-boss";\nconst op = "getQueue" as const;\nexport async function send(boss: PgBoss) { const op = "send" as const; await boss[op]("rogue", {}); }'
    );
    expect(scanPgBossWriterFiles(callShapeProbe)).toEqual(expect.arrayContaining([
      "worker/rogue-pg-boss-const-element-send.ts",
      "worker/rogue-pg-boss-element-send.ts",
      "worker/rogue-pg-boss-inline-start.ts",
      "worker/rogue-pg-boss-shadowed-element.ts",
      "worker/rogue-pg-boss-template-element-send.ts",
      "worker/rogue-pg-boss-unresolved-element.ts",
    ]));
    expect(() => validatePhysicalWriterClosure(
      callShapeProbe,
      LIFECYCLE_WRITER_INVENTORY,
      SUPPORTING_LIFECYCLE_STORES
    )).toThrow(/undeclared pg-boss writer/);
    await yieldToWorkerRpc();

    const unrelated = new Map<string, string>([[
      "worker/unrelated-methods.ts",
      "interface OrdinaryWorker { work(): void; fetch(): void; stop(): void }\nexport function run(worker: OrdinaryWorker) { worker.work(); worker.fetch(); worker.stop(); }",
    ]]);
    expect(scanPgBossWriterFiles(unrelated)).toEqual([]);

    const readOnlyPgBossCall = new Map<string, string>([[
      "worker/pg-boss-read-only.ts",
      'import type { PgBoss } from "pg-boss";\nconst op = "getQueue" as const;\nexport async function inspect(boss: PgBoss) { await boss[op]("queue"); }',
    ]]);
    expect(scanPgBossWriterFiles(readOnlyPgBossCall)).toEqual([]);
    }
  );

  it("creator edits reuse the one creator_authored input writer and do not add a framework writer", () => {
    const editComposer = files.get("packages/db/src/brain-ops.ts");
    expect(editComposer, "the creator-edit producer file is not in the scan").toBeDefined();
    expect(editComposer).toContain("caps.appendOnboardingInput({");
    expect(editComposer).toContain('inputClass: "creator_authored"');
    expect(editComposer).toContain('fieldKey: "creator_edit"');
    expect(editComposer).toContain("caps.writeBrainDoc(");
    // `EXPECTED.frameworks` USED TO BE ASSERTED EMPTY HERE, and slice 7 made
    // that assertion FALSE rather than obsolete: private frameworks are
    // writable now (R5c), so the empty expectation could not survive. What the
    // case was actually about is asserted directly instead — a creator EDIT of
    // a brain document must not write a framework — which is a statement about
    // `brain-ops.ts` and stays true whatever the library surface grows into.
    // Deriving it from the scanner rather than from an equality means the
    // shapes an import rename or a raw INSERT would take are covered too.
    expect(
      scanWriters(new Map([["packages/db/src/brain-ops.ts", editComposer!]])).filter(
        (f) => f.table === "frameworks"
      ),
      "the creator-edit path writes a framework — a brain edit is not a library contribution (REQ-D04)"
    ).toEqual([]);
    // ...and the framework writers that DO exist are exactly the two reviewed
    // files, so a third one appearing anywhere fails the per-table case below.
    expect(Object.keys(EXPECTED.frameworks).sort()).toEqual([
      "packages/db/src/frameworks.ts::insert",
      "packages/db/src/frameworks.ts::update",
    ]);
  });

  it.each(Object.keys(EXPECTED))("%s has exactly its expected writers", (table) => {
    const actual = new Set(
      physicalWriters
        .filter((f) => f.table === table)
        .map((f) => `${f.file}::${f.verb}`)
    );
    const expected = new Set(Object.keys(EXPECTED[table]));
    expect(
      [...actual].filter((f) => !expected.has(f)).sort(),
      "unexpected writer of " +
        table +
        " (file::verb) — route it through writeCapabilities, or add it to EXPECTED with a reason"
    ).toEqual([]);
    expect(
      [...expected].filter((f) => !actual.has(f)).sort(),
      "EXPECTED claims a writer of " + table + " that no longer exists — delete the stale entry"
    ).toEqual([]);
  });
});

describe("P8 (the scanner's own coverage): the spellings a rename produces", () => {
  // Each of these returned ZERO findings against the regex scanner when the
  // tenancy gate ran it. None is exotic — an import rename and a destructured
  // alias are what an ordinary refactor produces, and `as never` is already
  // used in this repo's own test fixtures.
  const SPELLINGS: [string, string][] = [
    [
      "import rename",
      'import { brainDocs as bd } from "@respin/db";\ndb.insert(bd).values(x);',
    ],
    [
      "destructured alias",
      "const { brainDocs: t } = schema;\ndb.insert(t).values(x);",
    ],
    [
      "destructured shorthand",
      "const { brainDocs } = schema;\ndb.insert(brainDocs).values(x);",
    ],
    ["cast argument", "db.insert(brainDocs as never).values(x);"],
    ["computed member", 'db.insert(schema["brainDocs"]).values(x);'],
    [
      "schema-qualified raw SQL",
      "q('insert into public.brain_docs (a) values (1)');",
    ],
    [
      "quoted raw SQL",
      "q('delete from \"brain_docs\" where a = 1');",
    ],
  ];

  it.each(SPELLINGS)("sees a brain_docs writer spelled as a %s", (_label, src) => {
    const found = scanWriters(new Map([["probe/x.ts", src]]));
    expect(
      found.filter((f) => f.table === "brain_docs"),
      "this writer spelling is invisible to P8 — and P8 is the ONLY thing making 'exactly one writer' true"
    ).not.toEqual([]);
  });

  it("still does not mistake a COMMENT or an unrelated identifier for a writer", () => {
    expect(
      scanWriters(
        new Map([
          ["a.ts", "// db.insert(brainDocs).values(x)\n"],
          ["b.ts", "const brainDocsCount = 3; db.insert(other).values(x);"],
          ["c.ts", "db.select().from(brainDocs);"],
        ])
      )
    ).toEqual([]);
  });
});

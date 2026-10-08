// Versioned runtime config (D-M1-2, B5): append-only rows, active = max
// version, Zod-validated. FAIL CLOSED: no/invalid config is a typed error —
// never a default cost, never a silent free generation.
import { desc, inArray, sql } from "drizzle-orm";
// (desc is used by getActiveConfig and listConfigVersions)
import type { DbLike, TxLike } from "@respin/db";
import { schema } from "@respin/db";
import { respinConfigV1, type RespinConfigV1 } from "./schema";

export { AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING, respinConfigV1 } from "./schema";
export type { RespinConfigV1, SubscriptionTier } from "./schema";

export class ConfigUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigUnavailableError";
  }
}

export type ActiveConfig = { version: number; content: RespinConfigV1 };

/**
 * The active config parses, but the STORED document is missing a key this
 * operation needs, so the key it would have used came from a `.default()`.
 *
 * R19, slice 2a. `getActiveConfig` returns `{version: row.version, content:
 * parsed.data}` -- the version of the STORED row with DEFAULTED content -- and
 * every `.default()` on `respinConfigV1` exists so the A-9 deploy order
 * (deploy code, THEN `config:migrate`) is safe. That is correct for reads. It
 * is not correct for MONEY: inside the deploy window a debit would be stamped
 * `config_version = N` while stored document N contains neither the price nor
 * the credit cost that priced it, and `DebitParams.configVersion` exists
 * precisely so a customer dispute or the margin rollup can be reconciled
 * against the document that set the number. An unreconcilable debit on an
 * append-only ledger cannot be repaired afterwards.
 *
 * So the window is closed by FAILING CLOSED rather than by spending: for the
 * duration of it, a metered operation refuses and names the remedy. The
 * remedy is one command and needs no deploy.
 */
export class ConfigNotMigratedError extends Error {
  readonly version: number;
  readonly missing: readonly string[];
  constructor(version: number, missing: readonly string[]) {
    super(
      `The active config (version ${version}) is missing ${missing.length === 1 ? "the key" : "the keys"} ${missing
        .map((m) => `\`${m}\``)
        .join(", ")} in its STORED document. The running code supplies a default for it, but a default is not a price: a debit stamped with this config version could not be reconciled against it. Run \`pnpm -C respin config:migrate\` to append a version that carries the key, then retry. Nothing was spent and no model was called.`
    );
    this.name = "ConfigNotMigratedError";
    this.version = version;
    this.missing = missing;
  }
}

/** Walk a dotted path through parsed JSON. `undefined` means absent. */
function readPath(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const seg of path.split(".")) {
    if (typeof cur !== "object" || cur === null || Array.isArray(cur)) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, seg)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * `getActiveConfig`, plus the R19 assertion that the RAW STORED document
 * carries every dotted path named -- not merely that the parsed document does.
 *
 * Every metered operation reads config through THIS function, never through
 * `getActiveConfig`. The paths it passes are exactly the keys that priced the
 * operation, resolved model id included, so the check is as narrow as the
 * spend it guards: a workspace that never touches the model layer is never
 * refused for a key it does not use.
 */
export async function getActiveConfigRequiringStored(
  db: DbLike | TxLike,
  requiredPaths: readonly string[]
): Promise<ActiveConfig> {
  const [row] = await db
    .select()
    .from(schema.configVersions)
    .orderBy(desc(schema.configVersions.version))
    .limit(1);
  if (!row) {
    throw new ConfigUnavailableError(
      "No config version exists. Seed the database (pnpm db:seed) or append a version via the admin config editor."
    );
  }
  const parsed = respinConfigV1.safeParse(row.content);
  if (!parsed.success) {
    throw new ConfigUnavailableError(
      `Active config version ${row.version} does not match RespinConfigV1: ${parsed.error.message}`
    );
  }
  // Against `row.content` -- the bytes in the table -- and NOT against
  // `parsed.data`, whose defaults are the very thing being detected. Reversing
  // these two operands makes this function a tautology that always passes,
  // which is the mutation the suite plants.
  const missing = requiredPaths.filter(
    (path) => readPath(row.content, path) === undefined
  );
  if (missing.length > 0) {
    throw new ConfigNotMigratedError(row.version, missing);
  }
  return { version: row.version, content: parsed.data };
}

export async function getActiveConfig(
  db: DbLike | TxLike
): Promise<ActiveConfig> {
  const [row] = await db
    .select()
    .from(schema.configVersions)
    .orderBy(desc(schema.configVersions.version))
    .limit(1);
  if (!row) {
    throw new ConfigUnavailableError(
      "No config version exists. Seed the database (pnpm db:seed) or append a version via the admin config editor."
    );
  }
  const parsed = respinConfigV1.safeParse(row.content);
  if (!parsed.success) {
    throw new ConfigUnavailableError(
      `Active config version ${row.version} does not match RespinConfigV1: ${parsed.error.message}`
    );
  }
  return { version: row.version, content: parsed.data };
}

/**
 * THE STORED DOCUMENT OF EACH NAMED VERSION — the historical prices.
 *
 * WHY A READ OF OLD VERSIONS EXISTS AT ALL (billing gate, 2026-09-02).
 * `reconcileSpend` judges attempts that were priced under the document ACTIVE
 * AT THE TIME, which `model_usage.config_version` records on every row. Judging
 * them by today's active document is the fail-open direction the exemption
 * itself names: dropping the included build's price from 25 back to 0 would
 * silently exempt — and therefore HIDE — every claim holder's lost debit that
 * was incurred while it was 25. So the reconciliation resolves each row's own
 * version, and this is the read that lets it.
 *
 * BOUNDED BY THE CALLER'S LIST, never "every version": the versions handed in
 * are the ones that actually appear in `model_usage`, so this grows with the
 * versions a workspace has USED rather than with the table.
 *
 * A MISSING OR UNPARSEABLE VERSION IS A REFUSAL, NOT AN OMISSION. Returning a
 * partial map would make "I could not read that document" indistinguishable
 * from "that document exempted nothing" at the call site, and the caller's job
 * is a report about money. It is the same fail-closed discipline
 * `getActiveConfig` applies to the active row, one row over — and rows are
 * written only through `appendConfigVersion`, which `.parse`s, so an
 * unparseable one means the table was edited by hand.
 */
export async function configVersionContents(
  db: DbLike | TxLike,
  versions: readonly number[]
): Promise<Map<number, RespinConfigV1>> {
  const wanted = [...new Set(versions)];
  // `inArray(col, [])` is not a query worth sending, and some drivers refuse
  // it outright; an empty request has an empty answer.
  if (wanted.length === 0) return new Map();
  const rows = await db
    .select({
      version: schema.configVersions.version,
      content: schema.configVersions.content,
    })
    .from(schema.configVersions)
    .where(inArray(schema.configVersions.version, wanted));
  const out = new Map<number, RespinConfigV1>();
  for (const row of rows) {
    const parsed = respinConfigV1.safeParse(row.content);
    if (!parsed.success) {
      throw new ConfigUnavailableError(
        `Config version ${row.version} does not match RespinConfigV1: ${parsed.error.message}`
      );
    }
    out.set(row.version, parsed.data);
  }
  const missing = wanted.filter((v) => !out.has(v));
  if (missing.length > 0) {
    throw new ConfigUnavailableError(
      `No config version exists for ${missing.join(", ")}. A record priced under a version that is no longer stored cannot be judged against it.`
    );
  }
  return out;
}

/**
 * Version history for the admin editor (M1 phase 4, REQ-J01 slice): metadata
 * only — version, author, timestamp — newest first, bounded.
 *
 * The CONTENT of old versions is deliberately not returned: the editor's job is
 * to show that the table is append-only and who appended what, and a full
 * content dump of every version is a page that gets slower forever. `limit` is
 * clamped for the same reason `withWorkspace.ledger` clamps.
 */
export type ConfigVersionSummary = {
  version: number;
  createdBy: string;
  createdAt: Date;
};

export const CONFIG_HISTORY_MAX = 100;

export async function listConfigVersions(
  db: DbLike | TxLike,
  limit = 20
): Promise<ConfigVersionSummary[]> {
  return db
    .select({
      version: schema.configVersions.version,
      createdBy: schema.configVersions.createdBy,
      createdAt: schema.configVersions.createdAt,
    })
    .from(schema.configVersions)
    .orderBy(desc(schema.configVersions.version))
    .limit(Math.min(Math.max(1, Math.trunc(limit)), CONFIG_HISTORY_MAX));
}

/** One Zod issue, flattened to what a form can render beside a field. */
export type ConfigIssue = { path: string; message: string };

export type ConfigValidation =
  | { ok: true; value: RespinConfigV1 }
  | { ok: false; issues: ConfigIssue[] };

/**
 * Validate candidate config content WITHOUT writing. The admin editor needs the
 * issue list to render field-level errors, and `appendConfigVersion`'s `.parse`
 * throws a ZodError that `app/**` cannot even name (zod is not a dependency of
 * the app package, and importing it there would be a second validator). So the
 * shape crosses the boundary as plain data.
 *
 * NOT a replacement for `appendConfigVersion`'s parse, but NOT equivalent to it
 * either, and the difference is load-bearing (code review, round 2). That
 * function validates against the SCHEMA only; the `timeoutMs <= overallDeadlineMs`
 * relation below lives here alone. So a caller that skips this CAN write a
 * schema-valid document whose per-request timeout can never fire — and
 * `applyConfigMigration` is exactly such a caller, by design: it must be able to
 * append a document preserving an operator's incoherent legacy pair, or the
 * correction that would repair it could never run. The residual is registered;
 * the sentence that used to sit here claimed the opposite.
 */
export function validateConfigContent(raw: unknown): ConfigValidation {
  const parsed = respinConfigV1.safeParse(raw);
  if (parsed.success) {
    // THE RELATION BOUNDS, CHECKED WHERE AN OPERATOR TYPES THEM.
    //
    // `respinConfigV1` validates every key in isolation, so nothing stopped
    // `timeoutMs: 300_000` beside `overallDeadlineMs: 5_000` — a per-request
    // timeout above the bound containing it can never fire, which is exactly
    // the dead-config-shaped-like-a-control defect the 2026-09-04 change was
    // fixing (code review CHANGE 6). "Guard where the path is built"
    // (CLAUDE.md 2026-07-30).
    //
    // IT IS HERE AND NOT A `.refine()` ON THE SCHEMA, and the reason is the
    // OTHER 2026-07-30 lesson — fail closed, but never without a way forward.
    // The documents this relation is violated by are precisely the ones
    // `CORRECTIONS` exists to repair (the shipped 60_000-over-40_000 pair), and
    // `respinConfigV1` is the READ schema: a `.refine()` there makes those
    // documents unparseable, so `prepareConfigMigration` refuses them and the
    // correction that would fix them can never run. It also blocks
    // `appendConfigVersion`, which is the migration's own writer — including
    // the write that records an operator's preserved values. Measured: adding
    // the refine reddened three correction tests for exactly that reason.
    //
    // So the relation is enforced on the OPERATOR'S edit, where there is always
    // a way forward (type a different number), and legacy documents stay
    // readable and repairable.
    const { timeoutMs, overallDeadlineMs } = parsed.data.llm;
    if (timeoutMs > overallDeadlineMs) {
      return {
        ok: false,
        issues: [
          {
            path: "llm.timeoutMs",
            message: `llm.timeoutMs (${timeoutMs}) must be less than or equal to llm.overallDeadlineMs (${overallDeadlineMs}): a per-request timeout above the deadline containing it can never fire.`,
          },
        ],
      };
    }
    return { ok: true, value: parsed.data };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      path: i.path.length > 0 ? i.path.join(".") : "(document)",
      message: i.message,
    })),
  };
}

/**
 * The ONE advisory-lock key every `config_versions` writer takes.
 *
 * `version` is `generatedAlwaysAsIdentity()` (`billing-schema.ts:254`), so two
 * concurrent appends NEVER conflict — there is no unique violation to catch and
 * no row to lock, because the row does not exist yet. That makes any
 * "re-read max(version) and compare" check unable to see an append that has
 * INSERTED but not COMMITTED: it takes the lower identity value, the checker
 * takes the higher one, and the operator's edit is silently superseded. The
 * only thing that serialises writers to a table whose contention is on FUTURE
 * rows is a lock on the table's *name*, which is what this is.
 *
 * A constant rather than a hash: unlike `takeWorkspaceLock`, the contention
 * here is global — `config_versions` is one document for the whole install.
 */
const CONFIG_LOCK_KEY = 8_140_251_907_463_120n;

/**
 * Serialise every writer of `config_versions` (billing gate 2026-08-23).
 *
 * Transaction-scoped, so it releases on commit or rollback with no unlock path
 * to forget, and re-entrant within one transaction — `applyConfigMigration`
 * takes it and then calls `appendConfigVersion`, which takes it again.
 */
export async function takeConfigLock(tx: TxLike): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${CONFIG_LOCK_KEY})`);
}

/**
 * Append a new version (never mutate). Returns the new version number.
 *
 * ALWAYS runs in a transaction, and takes the config lock inside it. Given a
 * bare connection that transaction is its own; given a transaction it is a
 * savepoint, and an advisory *xact* lock taken inside a savepoint is still
 * held until the outer transaction ends — which is what makes the lock
 * meaningful for a caller that has already read `max(version)`.
 */
export async function appendConfigVersion(
  db: DbLike | TxLike,
  content: RespinConfigV1,
  createdBy: string
): Promise<number> {
  const validated = respinConfigV1.parse(content);
  return db.transaction(async (tx) => {
    await takeConfigLock(tx);
    const [row] = await tx
      .insert(schema.configVersions)
      .values({ content: validated, createdBy })
      .returning();
    return row.version;
  });
}

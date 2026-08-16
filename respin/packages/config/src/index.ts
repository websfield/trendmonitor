// Versioned runtime config (D-M1-2, B5): append-only rows, active = max
// version, Zod-validated. FAIL CLOSED: no/invalid config is a typed error —
// never a default cost, never a silent free generation.
import { desc } from "drizzle-orm";
// (desc is used by getActiveConfig and listConfigVersions)
import type { DbLike, TxLike } from "@respin/db";
import { schema } from "@respin/db";
import { respinConfigV1, type RespinConfigV1 } from "./schema";

export { respinConfigV1 } from "./schema";
export type { RespinConfigV1, SubscriptionTier } from "./schema";

export class ConfigUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigUnavailableError";
  }
}

export type ActiveConfig = { version: number; content: RespinConfigV1 };

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
 * This is NOT a replacement for the write-side validation — `appendConfigVersion`
 * still parses, so a caller that skips this cannot write an invalid document.
 */
export function validateConfigContent(raw: unknown): ConfigValidation {
  const parsed = respinConfigV1.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({
      path: i.path.length > 0 ? i.path.join(".") : "(document)",
      message: i.message,
    })),
  };
}

/** Append a new version (never mutate). Returns the new version number. */
export async function appendConfigVersion(
  db: DbLike | TxLike,
  content: RespinConfigV1,
  createdBy: string
): Promise<number> {
  const validated = respinConfigV1.parse(content);
  const [row] = await db
    .insert(schema.configVersions)
    .values({ content: validated, createdBy })
    .returning();
  return row.version;
}

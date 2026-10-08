// WHICH TRANSACTIONS RUN UNDER THE RENDER BUDGET (audit Phase 8, gate M2).
//
// `lock_timeout = 5000` is a promise to a PAGE: it never hangs behind a lock.
// It must never become a surprise to a WRITER — a money path, a webhook, a
// deletion step — that was not designed to receive a lock error. So the
// population that runs under it is a LIST (CLAUDE.md Respin rule 7), compared
// two-way against a scan of the shipped tree, and the structural property is
// asserted by RUNNING it:
//
//   - `withRenderTransaction` (the display read, which may mint) has exactly
//     one caller in shipped code: `getDisplayBalance`;
//   - `withBoundedReadTransaction` / `boundedReadOrJoin` callers are listed
//     below, and the bounded read is READ ONLY — Postgres itself refuses a
//     write in it, so nothing on the list can ever be a writer;
//   - `lock_timeout` is spelled nowhere else in shipped code;
//   - both helpers refuse an open transaction (a SAVEPOINT would let the
//     `SET LOCAL` survive into the enclosing transaction), and the joining
//     variant, handed the caller's transaction, sets no budget at all.
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  boundedReadOrJoin,
  RenderTransactionNestingError,
  withBoundedReadTransaction,
  withRenderTransaction,
} from "../src/render-transaction";
import * as schema from "../src/schema";
import type { TxLike } from "../src/db-like";
import { createTestDb } from "../src/testing";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "../../../tests/support/source-files";

/** Comment lines are prose about the rule, not a use of it. */
const code = (text: string): string[] =>
  text.replace(/\r\n/g, "\n").split("\n").map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? "" : l));

function enclosingFunction(lines: readonly string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const m = lines[i].match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (m) return m[1];
  }
  return "<module>";
}

/** `file#function` for every line matching `call` that is not the definition. */
function callers(files: readonly { file: string; text: string }[], call: RegExp, definition: RegExp): string[] {
  const out: string[] = [];
  for (const { file, text } of files) {
    const lines = code(text);
    lines.forEach((line, i) => {
      if (call.test(line) && !definition.test(line)) out.push(`${file}#${enclosingFunction(lines, i)}`);
    });
  }
  return out.sort();
}

const SHIPPED = sourceFilesUnder(PRODUCTION_ROOTS).filter(
  ({ file }) => !/^packages\/[^/]+\/tests\//.test(file)
);

const BOUNDED_CALL = /\b(withBoundedReadTransaction|boundedReadOrJoin)\(/;
const BOUNDED_DEF = /\bfunction\s+(withBoundedReadTransaction|boundedReadOrJoin)\b/;

/** THE LIST: every page-path reader that runs READ ONLY under the budget. */
const EXPECTED_BOUNDED_READERS = [
  // The bounded read's own joining variant.
  "packages/db/src/render-transaction.ts#boundedReadOrJoin",
  // Every product page's first lock: bootstrap's shared, no-mint attempt.
  "packages/db/src/bootstrap.ts#ensureUserWorkspace",
  // The workspace and profile accessor maps' guard, when it opens its own tx.
  "packages/db/src/with-workspace.ts#lifecycleGuardedMethods",
  // Fence 7, read on almost every page.
  "packages/db/src/profile-selection.ts#selectedProfileForMember",
  // Page-path readers reached through `respinDb` / `respinCredits`.
  "packages/db/src/interview-ops.ts#getInterviewDraft",
  "packages/db/src/trends-storage.ts#feedItemsForProfile",
  "packages/db/src/trends-storage.ts#pastedReferencesForProfile",
  "packages/db/src/trends-storage.ts#spinReferenceSummaryForProfile",
  "packages/db/src/trends-storage.ts#trackedNichesForProfile",
  "packages/db/src/trends-storage.ts#trendFeedProjection",
].sort();

describe("the population under the render budget is a list, two-way", () => {
  it("non-vacuity: the scan reads the shipped tree", () => {
    expect(SHIPPED.length).toBeGreaterThan(100);
  });

  it("withRenderTransaction( has exactly ONE caller in shipped code: getDisplayBalance", () => {
    expect(callers(SHIPPED, /\bwithRenderTransaction\(/, /\bfunction\s+withRenderTransaction\b/)).toEqual([
      "packages/credits/src/balance.ts#getDisplayBalance",
    ]);
  });

  it("the bounded READ ONLY readers equal the written list", () => {
    expect(callers(SHIPPED, BOUNDED_CALL, BOUNDED_DEF)).toEqual(EXPECTED_BOUNDED_READERS);
  });

  it("PLANTED: a money path, webhook or deletion step wrapped in the budget is red until listed", () => {
    for (const planted of [
      { file: "packages/credits/src/stripe/planted-webhook.ts", text: "export async function plantedDispatch(db) {\n  return withBoundedReadTransaction(db, async (tx) => tx);\n}\n" },
      { file: "packages/db/src/planted-deletion.ts", text: "export async function plantedStep(db) {\n  return withRenderTransaction(db, async (tx) => tx);\n}\n" },
    ]) {
      const withPlant = [...SHIPPED, planted];
      const bounded = callers(withPlant, BOUNDED_CALL, BOUNDED_DEF);
      const render = callers(withPlant, /\bwithRenderTransaction\(/, /\bfunction\s+withRenderTransaction\b/);
      expect(
        JSON.stringify(bounded) !== JSON.stringify(EXPECTED_BOUNDED_READERS) ||
          JSON.stringify(render) !== JSON.stringify(["packages/credits/src/balance.ts#getDisplayBalance"])
      ).toBe(true);
    }
  });

  it("`lock_timeout` is spelled in exactly one shipped file: render-transaction.ts", () => {
    // The SETTING, not the refusal code `render_lock_timeout` the copy maps.
    const spelled = SHIPPED.filter(({ text }) => code(text).some((l) => /(?<!render_)lock_timeout/.test(l)))
      .map(({ file }) => file)
      .sort();
    expect(spelled).toEqual(["packages/db/src/render-transaction.ts"]);
  });
});

describe("the bound is structurally a READER's, and never leaks into a caller's transaction", () => {
  it("a WRITE inside withBoundedReadTransaction is refused by Postgres (read-only transaction)", async () => {
    const db = await createTestDb();
    const refused = await withBoundedReadTransaction(db, (tx) =>
      tx.insert(schema.workspaces).values({ name: "must not be written" }).returning()
    ).then(
      () => null,
      (e: unknown) => e
    );
    expect(refused).toBeInstanceOf(Error);
    expect(String((refused as Error & { cause?: unknown }).cause ?? refused)).toMatch(/read-only transaction/i);
    expect(await db.select().from(schema.workspaces)).toEqual([]);
  });

  it("inside it the budget is set; a reader that JOINS the caller's transaction sets none", async () => {
    const db = await createTestDb();
    const show = async (tx: TxLike) =>
      ((await tx.execute(sql`SHOW lock_timeout`)) as unknown as { rows: { lock_timeout: string }[] }).rows[0].lock_timeout;
    expect(await withBoundedReadTransaction(db, show)).toBe("5s");
    expect(await boundedReadOrJoin(db, show)).toBe("5s");
    const joined = await db.transaction(async (tx) => {
      const inner = await boundedReadOrJoin(tx, show);
      return { inner, after: await show(tx) };
    });
    expect(joined).toEqual({ inner: "0", after: "0" });
  });

  it("both helpers REFUSE an open transaction (the SAVEPOINT leak)", async () => {
    const db = await createTestDb();
    await db.transaction(async (tx) => {
      await expect(withRenderTransaction(tx as never, async () => 1)).rejects.toBeInstanceOf(RenderTransactionNestingError);
      await expect(withBoundedReadTransaction(tx as never, async () => 1)).rejects.toBeInstanceOf(RenderTransactionNestingError);
    });
  });
});

// R-155 (register 2026-10-05 item 3(c)) — the restore drill's content check,
// executed on REAL Postgres.
//
// `scripts/restore-drill.sh` promised in its header to refuse "unless the money
// tables actually came back with rows in them", and its SQL asserted only
// `config_versions`. This runs the SHIPPED SQL — extracted from the script, not
// restated — against tables of the five names it reads, in a throwaway
// database the harness names (`respin_test_restoredrill`; never the dev
// database), and plants each empty money table in turn.
//
// The local-drill allowance reaches the `DO` block as the session setting
// `respin.allow_empty_money`, which the script ALWAYS sets in the session —
// `on` only when --allow-empty-money was accepted, `off` otherwise — through
// psql's `:'allow_empty_money'` interpolation. This test performs that one
// substitution itself (pg is not psql), and plants an inherited `on` through
// the connection's startup options — the PGOPTIONS path — to prove the
// script's explicit `off` overrides it.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
if (!MAINTENANCE_URL) {
  console.warn(
    "[restore-drill-content.docker.test] SKIPPED — TEST_DATABASE_URL is not set. NOT PROVEN in this run: that the restore drill's shipped content check raises on an empty subscriptions, credit_ledger or stripe_events table, and passes them only under the local-drill allowance. Set TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const DB_NAME = "respin_test_restoredrill";
const MONEY_TABLES = ["subscriptions", "credit_ledger", "stripe_events"] as const;
const PSQL_VARIABLE = ":'allow_empty_money'";

/** The shipped content-check SQL as psql would send it: psql's own `\set` dropped, its one variable substituted. */
function shippedContentCheck(drillSetting: "on" | "off"): string {
  const source = readFileSync(join(resolve(__dirname, "../scripts"), "restore-drill.sh"), "utf8").replace(/\r\n/g, "\n");
  const opener = "<<'SQL'\n";
  const start = source.indexOf(opener);
  const end = source.indexOf("\nSQL\n", start);
  if (start < 0 || end < 0) throw new Error("the content-check heredoc moved; this test is pinned to <<'SQL' … SQL");
  const block = source
    .slice(start + opener.length, end)
    .split("\n")
    .filter((l) => !l.startsWith(String.raw`\set`))
    .join("\n");
  if (!block.includes(PSQL_VARIABLE)) {
    throw new Error("the content check no longer sets respin.allow_empty_money from the psql variable");
  }
  return block.replace(PSQL_VARIABLE, `'${drillSetting}'`);
}

describe.skipIf(!MAINTENANCE_URL)("restore-drill.sh's content check on REAL Postgres (R-155)", () => {
  let url = "";
  let closeHarness: () => Promise<void> = async () => {};
  // `pg` is a dependency of @respin/db, not of this workspace root, so the
  // Pool constructor is taken from the harness's own pool rather than imported.
  type PoolLike = {
    connect(): Promise<{ query(sql: string, params?: unknown[]): Promise<unknown>; release(): void }>;
    end(): Promise<void>;
  };
  let PoolCtor: new (config: { connectionString: string; max?: number; options?: string }) => PoolLike;
  const SCHEMA = "drill_probe";

  beforeAll(async () => {
    const { createDockerTestDb } = await import("@respin/db");
    const harness = await createDockerTestDb(MAINTENANCE_URL as string, DB_NAME);
    url = harness.url;
    PoolCtor = harness.pool.constructor as unknown as typeof PoolCtor;
    closeHarness = () => harness.pool.end();
  }, 120_000);
  afterAll(async () => {
    await closeHarness();
  });

  /**
   * A probe schema holding the five tables by name, each with the columns the
   * block reads (`count(*)`; `credit_ledger.workspace_id`/`delta`) — so a
   * planted empty table is a row count, not a fixture of the whole money path.
   */
  async function probe(
    rows: Readonly<Record<string, number>>,
    drillSetting: "on" | "off",
    inheritedOn = false
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const pool = new PoolCtor({
      connectionString: url,
      max: 1,
      ...(inheritedOn ? { options: "-c respin.allow_empty_money=on" } : {}),
    });
    const client = await pool.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE; CREATE SCHEMA ${SCHEMA};`);
      for (const t of ["workspaces", "subscriptions", "stripe_events", "config_versions"]) {
        await client.query(`CREATE TABLE ${SCHEMA}.${t} (id int)`);
        if ((rows[t] ?? 0) > 0) await client.query(`INSERT INTO ${SCHEMA}.${t} SELECT g FROM generate_series(1, $1) g`, [rows[t]]);
      }
      await client.query(`CREATE TABLE ${SCHEMA}.credit_ledger (workspace_id int, delta bigint)`);
      if ((rows.credit_ledger ?? 0) > 0) {
        await client.query(`INSERT INTO ${SCHEMA}.credit_ledger SELECT 1, 10 FROM generate_series(1, $1) g`, [rows.credit_ledger]);
      }
      // A second workspace whose rows sum NEGATIVE: what a restore that lost a
      // grant but kept the debits it funded looks like.
      if ((rows.negative_workspace ?? 0) > 0) {
        await client.query(`INSERT INTO ${SCHEMA}.credit_ledger VALUES (2, 5), (2, -50)`);
      }
      await client.query(`SET search_path = ${SCHEMA}`);
      await client.query(shippedContentCheck(drillSetting));
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
      client.release();
      await pool.end();
    }
  }

  const FULL = { workspaces: 1, subscriptions: 1, credit_ledger: 2, stripe_events: 1, config_versions: 1 };
  const EMPTY_MONEY = { ...FULL, subscriptions: 0, credit_ledger: 0, stripe_events: 0 };

  it("non-vacuity: every table populated passes", async () => {
    expect(await probe(FULL, "off")).toEqual({ ok: true });
  });

  it.each(MONEY_TABLES)("PLANTED: an empty %s RAISES outside local-drill mode", async (table) => {
    const result = await probe({ ...FULL, [table]: 0 }, "off");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/RESTORE INCOMPLETE: a money table came back empty/);
  });

  it("every money table empty passes ONLY under the local-drill allowance", async () => {
    expect((await probe(EMPTY_MONEY, "off")).ok).toBe(false);
    expect(await probe(EMPTY_MONEY, "on")).toEqual({ ok: true });
  });

  it("PLANTED: an INHERITED allowance (PGOPTIONS, or a role/database default) is overridden by the drill's explicit off", async () => {
    const result = await probe(EMPTY_MONEY, "off", true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/RESTORE INCOMPLETE: a money table came back empty/);
  });

  it("PLANTED: a workspace whose restored ledger sums negative is RESTORE SUSPECT, allowance or not (gate round 1)", async () => {
    for (const setting of ["off", "on"] as const) {
      const result = await probe({ ...FULL, negative_workspace: 1 }, setting);
      expect(result.ok, setting).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/RESTORE SUSPECT: a workspace's restored ledger sums to -45/);
    }
  });

  it("the allowance never excuses an empty config_versions", async () => {
    const result = await probe({ ...FULL, config_versions: 0 }, "on");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/config_versions is empty/);
  });
});

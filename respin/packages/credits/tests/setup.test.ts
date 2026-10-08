// `stripe:setup` — the pack price has ONE authority (billing round-7 CHANGE 4).
//
// Before this round the script seeded the Stripe pack price from a literal
// (`AMOUNTS_CENTS.pack = 1000`) while `maybeAutoTopup` charged
// `Math.round(config.pack.priceUsd * 100)` off-session. The two agreed by
// coincidence and nothing enforced it: raising `pack.priceUsd` to 15 in
// /admin/config — the sanctioned deploy-free path (B5) — left manual pack
// checkout charging $10 while auto-top-up charged $15 for the same credits, a
// price the user was never shown.
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

const productsList = vi.fn(async () => ({ data: [{ id: "prod_1", name: "Respin" }] }));
const productsCreate = vi.fn(async () => ({ id: "prod_1", name: "Respin" }));
const pricesCreate = vi.fn(async (params: { lookup_key: string; unit_amount: number; currency: string }) => ({
  id: `price_new_${params.lookup_key}`,
  lookup_key: params.lookup_key,
  unit_amount: params.unit_amount,
  currency: params.currency,
}));
let priceList: Record<string, unknown>[] = [];

/** A one-time, per-unit usd price: what `priceDefect` accepts for the pack. */
const PACK = { active: true, type: "one_time", billing_scheme: "per_unit", recurring: null, currency: "usd" } as const;

/** A monthly, per-unit, licensed usd price: what `tierPriceDefect` accepts. */
const MONTHLY = {
  active: true,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  billing_scheme: "per_unit",
  tiers_mode: null,
} as const;
const pricesList = vi.fn(async () => ({ data: priceList }));

vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    products: { list: productsList, create: productsCreate },
    prices: { list: pricesList, create: pricesCreate },
  }),
}));

import {
  createTestDb,
  seedAuthUser,
  seedDb,
  CONFIG_V1_SEED,
  type TestDb,
} from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import { stripeSetup } from "../src/stripe/setup";

const TIER_PRICES = [
  { ...MONTHLY, id: "price_c", lookup_key: "respin_creator_monthly", unit_amount: 1000, currency: "usd" },
  { ...MONTHLY, id: "price_p", lookup_key: "respin_pro_monthly", unit_amount: 6000, currency: "usd" },
  { ...MONTHLY, id: "price_s", lookup_key: "respin_studio_monthly", unit_amount: 20000, currency: "usd" },
];

async function dbWithPackPrice(usd: number): Promise<TestDb> {
  const db = await createTestDb();
  await seedAuthUser(db, "setup_user");
  await seedDb(db);
  if (usd !== CONFIG_V1_SEED.pack.priceUsd) {
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, pack: { ...CONFIG_V1_SEED.pack, priceUsd: usd } },
      "test-admin"
    );
  }
  return db;
}

describe("stripe:setup pack price authority", () => {
  // Save/restore rather than set-and-forget (billing round-10 NOTE). Harmless
  // under vitest's current forks+isolate defaults, but a `pool`/`isolate`
  // config change would let a leaked key make the KEYLESS assertions in
  // isolation.test.ts pass for the wrong reason — or let a test make a real
  // Stripe call. A test that mutates process.env owns restoring it.
  let savedKey: string | undefined;

  afterEach(() => {
    if (savedKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = savedKey;
  });

  beforeEach(() => {
    savedKey = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_setup_suite";
    priceList = [...TIER_PRICES];
    productsList.mockClear();
    pricesCreate.mockClear();
  });

  it("creates the pack price at the ACTIVE CONFIG amount, not at a literal", async () => {
    const db = await dbWithPackPrice(15);
    await stripeSetup(db);
    const packCreate = pricesCreate.mock.calls
      .map(([p]) => p)
      .find((p) => p.lookup_key === "respin_pack_1000");
    expect(packCreate, "the pack price must be created").toBeDefined();
    // 1500, from config v2 — the old literal would have made this 1000.
    expect(packCreate!.unit_amount).toBe(1500);
  });

  it("REFUSES when the existing Stripe pack price disagrees with config, and changes nothing in Stripe", async () => {
    priceList = [
      ...TIER_PRICES,
      { ...PACK, id: "price_pack_old", lookup_key: "respin_pack_1000", unit_amount: 1000 },
    ];
    const db = await dbWithPackPrice(15);
    await expect(stripeSetup(db)).rejects.toThrow(/PRICE DIVERGENCE/);
    // The refusal names both numbers and a remedy that actually works — a
    // Stripe price amount is immutable (installed SDK: PriceUpdateParams has
    // no unit_amount), so "update it" would be a lie.
    await expect(stripeSetup(db)).rejects.toThrow(/1000c/);
    await expect(stripeSetup(db)).rejects.toThrow(/pack\.priceUsd=15/);
    await expect(stripeSetup(db)).rejects.toThrow(/transfer_lookup_key/);
    expect(
      pricesCreate.mock.calls.filter(([p]) => p.lookup_key === "respin_pack_1000")
    ).toHaveLength(0);
  });

  it("is quiet and idempotent when Stripe and config AGREE (the check must not cry wolf)", async () => {
    priceList = [
      ...TIER_PRICES,
      { ...PACK, id: "price_pack_ok", lookup_key: "respin_pack_1000", unit_amount: 1000 },
    ];
    const db = await dbWithPackPrice(CONFIG_V1_SEED.pack.priceUsd); // 10 → 1000c
    await stripeSetup(db);
    expect(pricesCreate).not.toHaveBeenCalled();
  });

  it("a TIER price whose Stripe amount disagrees with the stated price REFUSES (Phase 6 billing gate, R-175)", async () => {
    // This was a warning while a tier had one charger and no stated price.
    // R-175 made `TIER_AMOUNTS_CENTS` the price the public page states, so a
    // lookup key charging another amount is a refusal, as the pack's is.
    priceList = [
      { ...MONTHLY, id: "price_c", lookup_key: "respin_creator_monthly", unit_amount: 6000, currency: "usd" },
      ...TIER_PRICES.slice(1),
      { ...PACK, id: "price_pack_ok", lookup_key: "respin_pack_1000", unit_amount: 1000 },
    ];
    const db = await dbWithPackPrice(CONFIG_V1_SEED.pack.priceUsd);
    const refused = stripeSetup(db);
    await expect(refused).rejects.toThrow(/TIER PRICE DIVERGENCE/);
    await expect(refused).rejects.toThrow(/price_c[\s\S]*6000c[\s\S]*1000c/);
    expect(pricesCreate).not.toHaveBeenCalled();
    // ...and a matching amount in another currency refuses too.
    priceList = [
      { ...MONTHLY, id: "price_c", lookup_key: "respin_creator_monthly", unit_amount: 1000, currency: "eur" },
      ...TIER_PRICES.slice(1),
      { ...PACK, id: "price_pack_ok", lookup_key: "respin_pack_1000", unit_amount: 1000 },
    ];
    await expect(stripeSetup(db)).rejects.toThrow(/in eur/);
  });

  it("agreeing tier prices print the amounts beside the map the operator pastes", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      priceList = [
        ...TIER_PRICES,
        { ...PACK, id: "price_pack_ok", lookup_key: "respin_pack_1000", unit_amount: 1000 },
      ];
      await stripeSetup(await dbWithPackPrice(CONFIG_V1_SEED.pack.priceUsd));
      const printed = log.mock.calls.map((c) => String(c[0])).join("\n");
      expect(printed).toMatch(/what each of those price ids charges today/);
      expect(printed).toMatch(/price_c\s+creator\s+1000c/);
    } finally {
      log.mockRestore();
    }
  });

  it("NON-VACUITY: agreeing tier prices produce NO warning (the check must not cry wolf)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      priceList = [
        ...TIER_PRICES,
        { ...PACK, id: "price_pack_ok", lookup_key: "respin_pack_1000", unit_amount: 1000 },
      ];
      const db = await dbWithPackPrice(CONFIG_V1_SEED.pack.priceUsd);
      await stripeSetup(db);
      expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).not.toMatch(
        /WARNING/
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("reads config BEFORE writing anything to Stripe (an unseeded database creates no products)", async () => {
    // Fail closed: a missing config must not leave half-created Stripe objects
    // behind for the operator to reconcile by hand.
    const db = await createTestDb(); // no seed → no config version
    await expect(stripeSetup(db)).rejects.toThrow(/config/i);
    expect(productsCreate).not.toHaveBeenCalled();
    expect(pricesCreate).not.toHaveBeenCalled();
  });
});

/**
 * THE CLI, ACTUALLY RUN (tenancy round-10 CHANGE 2). Phase-3 Verification
 * Step 6 requires `pnpm stripe:setup` without keys to print "a clean typed
 * error naming the missing env (never a stack trace) — tested by running it".
 * Every test above drives `stripeSetup(db)` directly and none had ever
 * executed `setup-cli.ts`, so the criterion was present-and-unrun (CLAUDE.md
 * 2026-08-10) — and the CLI was in fact broken: `createDb(process.env.
 * DATABASE_URL)` was evaluated as an ARGUMENT, so its synchronous throw
 * happened before `.catch()` was attached and the operator got a raw stack.
 *
 * This spawns the same command `pnpm stripe:setup` runs (tsx on the CLI file),
 * with both variables removed from the child environment.
 */
describe("stripe:setup CLI degraded path (Verification Step 6 — by running it)", () => {
  const runKeyless = async (env: Record<string, string | undefined>) => {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, resolve } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = resolve(here, "..");
    // The same entrypoint the `stripe:setup` script names: tsx + the CLI file.
    const tsxCli = resolve(pkg, "node_modules/tsx/dist/cli.mjs");
    const childEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries({
      // Load NOTHING by default: the CLI reads `.env.local` (so the README's
      // step-4.1 success check is true), and on a developer's machine that file
      // is present and full — without this these degraded-path tests would stop
      // exercising the refusal entirely, passing in CI and proving nothing here.
      RESPIN_ENV_FILE: resolve(pkg, "tests/__no_such_env_file__"),
      ...process.env,
      ...env,
    })) {
      if (v !== undefined) childEnv[k] = v;
    }
    return await new Promise<{ code: number | null; out: string }>((res) => {
      const child = spawn(
        process.execPath,
        [tsxCli, resolve(pkg, "src/stripe/setup-cli.ts")],
        { cwd: pkg, env: childEnv }
      );
      let out = "";
      child.stdout.on("data", (d) => (out += String(d)));
      child.stderr.on("data", (d) => (out += String(d)));
      child.on("close", (code) => res({ code, out }));
    });
  };

  it(
    "with NEITHER env var set: exit 1, a typed message naming BOTH, and no stack trace",
    { timeout: 60_000 },
    async () => {
      const { code, out } = await runKeyless({
        STRIPE_SECRET_KEY: undefined,
        DATABASE_URL: undefined,
      });
      expect(out).toContain("STRIPE_SECRET_KEY");
      // The second-order defect: a DB-first construction told a cold operator
      // about DATABASE_URL and never mentioned the Stripe key at all, so
      // setup.ts's own remedy was unreachable for the person who needs it.
      expect(out).toContain("DATABASE_URL");
      expect(out).toContain("pnpm stripe:setup");
      // A stack frame is the failure mode this test exists for.
      expect(out, "a raw Node stack trace is exactly what Step 6 forbids").not.toMatch(
        /^\s+at .+:\d+:\d+\)?$/m
      );
      expect(out).not.toContain("node:internal");
      expect(code).toBe(1);
    }
  );

  it(
    "NON-VACUITY: with only DATABASE_URL missing it says so, and names only that one",
    { timeout: 60_000 },
    async () => {
      // If the message were a fixed string it would pass the case above while
      // telling the operator nothing true.
      const { code, out } = await runKeyless({
        STRIPE_SECRET_KEY: "sk_test_cli_probe",
        DATABASE_URL: undefined,
      });
      expect(out).toContain("DATABASE_URL");
      expect(out).not.toMatch(/needs STRIPE_SECRET_KEY/);
      expect(out).not.toMatch(/^\s+at .+:\d+:\d+\)?$/m);
      expect(code).toBe(1);
    }
  );

  // THE README'S PROMISE, as a test. Services step 4.1 says "put it in
  // .env.local … Success check: `pnpm stripe:setup` no longer prints the 'not
  // set' remedy" — and that was FALSE until the evidence run ran it: only Next
  // reads .env.local, so the operator did exactly what the doc said and still
  // hit the refusal. A doc promise nothing executes is how that survived.
  it(
    "READS the env file: a variable present ONLY in the file is not reported missing",
    { timeout: 60_000 },
    async () => {
      const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = mkdtempSync(join(tmpdir(), "respin-env-"));
      onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
      const envFile = join(dir, ".env.local");
      writeFileSync(envFile, "DATABASE_URL=postgres://from-the-file/db\n");

      const { code, out } = await runKeyless({
        RESPIN_ENV_FILE: envFile,
        STRIPE_SECRET_KEY: undefined,
        DATABASE_URL: undefined,
      });
      // DATABASE_URL came from the file, so only the Stripe key is missing —
      // which is precisely the "no longer prints the 'not set' remedy" the
      // README promises for a key placed there.
      expect(out).toContain("STRIPE_SECRET_KEY");
      expect(out).not.toContain("and DATABASE_URL");
      expect(code).toBe(1);
    }
  );
});

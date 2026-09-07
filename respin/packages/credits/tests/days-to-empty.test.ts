import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  ScopeForgeryError,
  createTestDb,
  ensureUserWorkspace,
  mintProfileScope,
  schema,
  seedAuthUser,
  seedDb,
  withWorkspace,
  type ProfileScope,
  DbLike,
  TxLike,
  UsageRunwayDebits,
  WorkspaceScope,
} from "@respin/db";
import {
  assertUsageRunwayScope,
  projectUsageRunway,
  usageRunwayFor,
  usageRunwayForWithReaders,
  usageRunwayInTx,
  type UsageRunwayReaders,
} from "../src/days-to-empty";
import { respinCredits } from "../src/app-server";

const AS_OF = new Date("2026-09-05T12:00:00.000Z");
const WINDOW_START = new Date("2026-08-06T12:00:00.000Z");
const CONFIG = { trailingWindowDays: 30, minimumDebitDays: 3 };
const LEDGER: UsageRunwayDebits = {
  totalDebit: 90,
  distinctDebitDays: 3,
  windowStart: WINDOW_START,
  asOf: AS_OF,
};

describe("pure days-to-empty projection (C8)", () => {
  it("uses exact configured-window arithmetic and rounds up", () => {
    const result = projectUsageRunway({
      config: CONFIG,
      paused: false,
      balance: 10,
      ledger: LEDGER,
    });
    expect(result).toMatchObject({
      state: "estimate",
      trailingWindowDays: 30,
      minimumDebitDays: 3,
      debitDayCount: 3,
      balance: 10,
      totalDebit: 90,
      dailyRate: 3,
      daysToEmpty: 4,
      asOf: AS_OF,
      windowStart: WINDOW_START,
    });
  });

  it("custom config changes both the rate and repeated-use threshold", () => {
    const customLedger = { ...LEDGER, totalDebit: 14, distinctDebitDays: 2 };
    const estimated = projectUsageRunway({
      config: { trailingWindowDays: 7, minimumDebitDays: 2 },
      paused: false,
      balance: 5,
      ledger: customLedger,
    });
    expect(estimated).toMatchObject({
      state: "estimate",
      dailyRate: 2,
      daysToEmpty: 3,
      trailingWindowDays: 7,
      minimumDebitDays: 2,
    });
    expect(
      projectUsageRunway({
        config: { trailingWindowDays: 7, minimumDebitDays: 3 },
        paused: false,
        balance: 5,
        ledger: customLedger,
      }).state
    ).toBe("too_few_debit_days");
  });

  it("returns each closed non-estimate state distinctly", () => {
    expect(
      projectUsageRunway({
        config: CONFIG,
        paused: true,
        balance: 10,
        ledger: { ...LEDGER, totalDebit: 0, distinctDebitDays: 0 },
      }).state
    ).toBe("paused");
    expect(
      projectUsageRunway({
        config: CONFIG,
        paused: false,
        balance: 10,
        ledger: { ...LEDGER, totalDebit: 0, distinctDebitDays: 0 },
      }).state
    ).toBe("no_spend");
    expect(
      projectUsageRunway({
        config: CONFIG,
        paused: false,
        balance: 10,
        ledger: { ...LEDGER, distinctDebitDays: 2 },
      }).state
    ).toBe("too_few_debit_days");
  });

  it("a zero balance is an exact zero-day estimate, not an absence", () => {
    expect(
      projectUsageRunway({
        config: CONFIG,
        paused: false,
        balance: 0,
        ledger: LEDGER,
      })
    ).toMatchObject({ state: "estimate", daysToEmpty: 0 });
  });
});

let scope: WorkspaceScope;
let profileScope: ProfileScope;
const tx = { marker: "one transaction" } as unknown as TxLike;

beforeAll(async () => {
  const db = await createTestDb();
  await seedAuthUser(db, "runway_scope_user");
  await seedDb(db);
  await ensureUserWorkspace(db, {
    authUserId: "runway_scope_user",
    name: "Runway scope",
  });
  scope = await withWorkspace(db, { authUserId: "runway_scope_user" });
  const [profile] = await db
    .insert(schema.creatorProfiles)
    .values({ workspaceId: scope.workspaceId, displayName: "Runway profile" })
    .returning();
  profileScope = await mintProfileScope(db, scope, profile.id);
});

function readers(
  overrides: Partial<UsageRunwayReaders> = {}
): UsageRunwayReaders {
  return {
    asOf: async () => AS_OF,
    config: async () => CONFIG,
    pause: async () => false,
    balance: async () => ({ balance: 10, lots: [], asOf: AS_OF }),
    ledger: async () => LEDGER,
    ...overrides,
  };
}

describe("usageRunwayInTx component failure classification", () => {
  for (const component of ["config", "pause", "balance", "ledger"] as const) {
    it(`${component} failure is read_unavailable:${component}`, async () => {
      const failing = readers({
        [component]: async () => {
          throw new Error(`${component} failed`);
        },
      });
      await expect(usageRunwayInTx(tx, scope, failing)).resolves.toMatchObject({
        state: "read_unavailable",
        component,
        asOf: AS_OF,
      });
    });
  }

  it("does not relabel an authoritative-clock failure as a data component", async () => {
    await expect(
      usageRunwayInTx(
        tx,
        scope,
        readers({
          asOf: async () => {
            throw new Error("clock failed");
          },
        })
      )
    ).rejects.toThrow("clock failed");
  });

  it("refuses incoherent balance/ledger timestamps and malformed aggregates", async () => {
    expect(
      await usageRunwayInTx(
        tx,
        scope,
        readers({
          balance: async () => ({
            balance: 10,
            lots: [],
            asOf: new Date(AS_OF.getTime() + 1),
          }),
        })
      )
    ).toMatchObject({ state: "read_unavailable", component: "balance" });
    expect(
      await usageRunwayInTx(
        tx,
        scope,
        readers({ ledger: async () => ({ ...LEDGER, totalDebit: -1 }) })
      )
    ).toMatchObject({ state: "read_unavailable", component: "ledger" });
  });
});

describe("usage runway workspace-scope cage", () => {
  const forged = {
    workspaceId: "00000000-0000-4000-8000-000000000001",
  } as unknown as WorkspaceScope;

  it("rejects a cast object before any reader, transaction, or facade DB lookup", async () => {
    const asOf = vi.fn(async () => AS_OF);
    const transaction = vi.fn();
    const fakeDb = { transaction } as unknown as DbLike;

    expect(() => assertUsageRunwayScope(forged)).toThrow(ScopeForgeryError);
    await expect(
      usageRunwayInTx(tx, forged, readers({ asOf }))
    ).rejects.toBeInstanceOf(ScopeForgeryError);
    expect(asOf).not.toHaveBeenCalled();
    await expect(
      usageRunwayForWithReaders(fakeDb, forged, readers())
    ).rejects.toBeInstanceOf(ScopeForgeryError);
    await expect(usageRunwayFor(fakeDb, forged)).rejects.toBeInstanceOf(
      ScopeForgeryError
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(() => respinCredits.usageRunwayFor(forged)).toThrow(
      ScopeForgeryError
    );
  });

  it("rejects a genuinely minted ProfileScope cast to the wrong grain before forwarding it", async () => {
    const wrongGrain = profileScope as unknown as WorkspaceScope;
    const asOf = vi.fn(async () => AS_OF);
    const transaction = vi.fn();
    const fakeDb = { transaction } as unknown as DbLike;

    expect(() => assertUsageRunwayScope(wrongGrain)).toThrow(
      ScopeForgeryError
    );
    await expect(
      usageRunwayInTx(tx, wrongGrain, readers({ asOf }))
    ).rejects.toBeInstanceOf(ScopeForgeryError);
    expect(asOf).not.toHaveBeenCalled();
    await expect(
      usageRunwayForWithReaders(fakeDb, wrongGrain, readers())
    ).rejects.toBeInstanceOf(ScopeForgeryError);
    await expect(usageRunwayFor(fakeDb, wrongGrain)).rejects.toBeInstanceOf(
      ScopeForgeryError
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(() => respinCredits.usageRunwayFor(wrongGrain)).toThrow(
      ScopeForgeryError
    );
  });
});

describe("usageRunwayFor authority wiring", () => {
  it("uses one repeatable-read transaction", async () => {
    const transaction = vi.fn(
      async (
        callback: (inner: TxLike) => Promise<unknown>,
        options: unknown
      ) => {
        expect(options).toEqual({ isolationLevel: "repeatable read" });
        return callback(tx);
      }
    );
    const db = { transaction } as unknown as DbLike;
    await expect(
      usageRunwayForWithReaders(db, scope, readers())
    ).resolves.toMatchObject({ state: "estimate" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("passes one tx and one asOf to config, pause, balance, and the DB aggregate", async () => {
    const seen: Array<[string, TxLike, unknown[]]> = [];
    const result = await usageRunwayInTx(
      tx,
      scope,
      readers({
        config: async (inner) => {
          seen.push(["config", inner, []]);
          return CONFIG;
        },
        pause: async (inner, workspaceId) => {
          seen.push(["pause", inner, [workspaceId]]);
          return false;
        },
        balance: async (inner, workspaceId, asOf) => {
          seen.push(["balance", inner, [workspaceId, asOf]]);
          return { balance: 10, lots: [], asOf };
        },
        ledger: async (inner, innerScope, asOf, days) => {
          seen.push(["ledger", inner, [innerScope, asOf, days]]);
          return { ...LEDGER, asOf };
        },
      })
    );
    expect(result.state).toBe("estimate");
    expect(seen.map(([name]) => name)).toEqual([
      "config",
      "pause",
      "balance",
      "ledger",
    ]);
    expect(seen.every(([, inner]) => inner === tx)).toBe(true);
    expect(seen[2][2][1]).toBe(AS_OF);
    expect(seen[3][2]).toEqual([scope, AS_OF, CONFIG.trailingWindowDays]);
  });

  it("the production source names only the authoritative aggregate, never page/model/spend-rollup sources", () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../src/days-to-empty.ts"
      ),
      "utf8"
    );
    expect(source).toContain("ledger: usageRunwayDebits");
    expect(source).toMatch(
      /usageRunwayForWithReaders\(db, scope, AUTHORITATIVE_READERS\)/
    );
    expect(source).not.toMatch(/creditLedger|model_usage|workspace_spend_monthly/);
  });
});

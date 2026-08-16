// @respin/config — parity with the Phase-1 seed (the Zod schema must parse
// EXACTLY what seedDb writes, driven from the real seed, not a copied
// literal), fail-closed reads, append-only writes.
import { describe, expect, it } from "vitest";
import {
  CONFIG_V1_SEED,
  createTestDb,
  schema,
  seedAuthUser,
  seedDb,
} from "@respin/db";
import {
  appendConfigVersion,
  ConfigUnavailableError,
  CONFIG_HISTORY_MAX,
  getActiveConfig,
  listConfigVersions,
  respinConfigV1,
  validateConfigContent,
} from "../src/index";

describe("@respin/config", () => {
  it("PARITY: the Phase-1 seeded row parses under RespinConfigV1 (driven from the real seed)", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "cfg_seed_user");
    await seedDb(db);
    const active = await getActiveConfig(db);
    expect(active.version).toBe(1);
    expect(active.content).toEqual(CONFIG_V1_SEED);
    // and the schema itself accepts the seed literal directly
    expect(respinConfigV1.parse(CONFIG_V1_SEED)).toEqual(CONFIG_V1_SEED);
  });

  it("FAIL CLOSED: empty config_versions table → ConfigUnavailableError (never a default price)", async () => {
    const db = await createTestDb();
    await expect(getActiveConfig(db)).rejects.toThrow(ConfigUnavailableError);
  });

  it("FAIL CLOSED: malformed active content → ConfigUnavailableError", async () => {
    const db = await createTestDb();
    await db
      .insert(schema.configVersions)
      .values({ content: { garbage: true }, createdBy: "test" });
    await expect(getActiveConfig(db)).rejects.toThrow(ConfigUnavailableError);
  });

  it("appendConfigVersion appends (never mutates) and the new version becomes active", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "cfg_user");
    await seedDb(db);
    const v2Content = {
      ...CONFIG_V1_SEED,
      stripePriceMap: { price_abc: "creator" as const },
    };
    const v2 = await appendConfigVersion(db, v2Content, "test-admin");
    expect(v2).toBe(2);
    const active = await getActiveConfig(db);
    expect(active.version).toBe(2);
    expect(active.content.stripePriceMap.price_abc).toBe("creator");
    // v1 remains byte-identical (append-only)
    const rows = await db.select().from(schema.configVersions);
    const v1 = rows.find((r) => r.version === 1);
    expect(v1?.content).toEqual(CONFIG_V1_SEED);
  });

  it("appendConfigVersion rejects invalid content (Zod, strict)", async () => {
    const db = await createTestDb();
    await expect(
      appendConfigVersion(
        db,
        { ...CONFIG_V1_SEED, unknownKey: 1 } as never,
        "test"
      )
    ).rejects.toThrow();
  });

  it("REFUSES an inverted range: pauseMonths/monthlyPeriodDays min > max (round-2 NOTE 5)", async () => {
    const db = await createTestDb();
    // An inverted pair passed every other check, and
    // `Array.from({length: max - min + 1})` then produced [] — the pause
    // <select> rendered with ZERO options and a defaultValue no option carried.
    // A control that cannot be used and does not say why.
    await expect(
      appendConfigVersion(
        db,
        { ...CONFIG_V1_SEED, pauseMonths: { min: 3, max: 1 } },
        "test"
      )
    ).rejects.toThrow(/pauseMonths/);
    await expect(
      appendConfigVersion(
        db,
        { ...CONFIG_V1_SEED, monthlyPeriodDays: { min: 45, max: 20 } },
        "test"
      )
    ).rejects.toThrow(/monthlyPeriodDays/);
    // NON-VACUITY, both directions: equal ends are legal (a one-month-only
    // pause range is a real product choice), and nothing was appended above.
    await expect(
      appendConfigVersion(
        db,
        { ...CONFIG_V1_SEED, pauseMonths: { min: 2, max: 2 } },
        "test"
      )
    ).resolves.toBeGreaterThan(0);
  });

  // ---- M1 phase 4, AC-4: the admin editor APPENDS, never mutates ----

  it("AC-4: an edit adds exactly ONE row, and every earlier row is byte-identical afterwards", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "cfg_ac4");
    await seedDb(db);
    const before = await db.select().from(schema.configVersions);
    expect(before).toHaveLength(1);
    const snapshot = JSON.stringify(before);

    const v2 = await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, graceDays: 14 },
      "admin_user_1"
    );
    expect(v2).toBe(2);

    const after = await db.select().from(schema.configVersions);
    // count +1 ...
    expect(after).toHaveLength(before.length + 1);
    // ... and the OLD rows are byte-identical (append-only: not one column of
    // v1 moved, including created_by and created_at, which an UPDATE-based
    // "edit" would have touched).
    const oldAfter = after.filter((r) => r.version === 1);
    expect(JSON.stringify(oldAfter)).toBe(snapshot);
    expect((await getActiveConfig(db)).content.graceDays).toBe(14);
  });

  it("AC-4: content REJECTED by validation appends NOTHING (the editor's error path writes no version)", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "cfg_ac4b");
    await seedDb(db);

    const bad = { ...CONFIG_V1_SEED, graceDays: -1 };
    const verdict = validateConfigContent(bad);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.issues.map((i) => i.path)).toContain("graceDays");
      expect(verdict.issues[0].message.length).toBeGreaterThan(0);
    }
    // ...and even a caller that skips the validator cannot write it.
    await expect(
      appendConfigVersion(db, bad as never, "admin_user_1")
    ).rejects.toThrow();
    expect(await db.select().from(schema.configVersions)).toHaveLength(1);
  });

  it("validateConfigContent reports the FIELD PATH for a nested issue, and accepts the real seed", () => {
    const nested = {
      ...CONFIG_V1_SEED,
      creditCosts: { ...CONFIG_V1_SEED.creditCosts, spin: "five" },
    };
    const verdict = validateConfigContent(nested);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.issues.map((i) => i.path)).toContain("creditCosts.spin");
    }
    // Non-vacuity: the same validator says YES to the document the seed writes.
    const good = validateConfigContent(CONFIG_V1_SEED);
    expect(good.ok).toBe(true);
  });

  it("listConfigVersions returns metadata newest-first, with the author, and clamps its limit", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "cfg_hist");
    await seedDb(db);
    await appendConfigVersion(db, { ...CONFIG_V1_SEED, graceDays: 8 }, "alice");
    await appendConfigVersion(db, { ...CONFIG_V1_SEED, graceDays: 9 }, "bob");

    const history = await listConfigVersions(db);
    expect(history.map((h) => h.version)).toEqual([3, 2, 1]);
    expect(history[0].createdBy).toBe("bob");
    expect(history[0].createdAt).toBeInstanceOf(Date);
    expect(await listConfigVersions(db, 1)).toHaveLength(1);
    // A caller asking for more than the ceiling gets at most the ceiling.
    expect(CONFIG_HISTORY_MAX).toBeLessThan(10_000);
    expect((await listConfigVersions(db, 10_000)).length).toBeLessThanOrEqual(
      CONFIG_HISTORY_MAX
    );
  });
});

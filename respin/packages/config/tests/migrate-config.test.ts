// AC-14 — migrate-config, and the deploy order that makes it safe (plan A-9).
//
// The fixture throughout: v1 = the real seed, v2 = an operator's CUSTOMISED
// document (a populated `stripePriceMap`, a changed `pack`). Every assertion is
// about v2 surviving byte-identically, because the three implementations two
// gate rounds produced each destroyed it in a different way.
import { describe, expect, it } from "vitest";
import { desc, eq } from "drizzle-orm";
import {
  createTestDb,
  seedDb,
  seedAuthUser,
  schema,
  CONFIG_V1_SEED,
  type TestDb,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "../src/index";
import { respinConfigV1 } from "../src/schema";
import {
  applyConfigMigration,
  ConfigMigrationRaceError,
  ConfigMigrationRefused,
  migrateConfigDefaults,
  prepareConfigMigration,
} from "../src/migrate-config";

/**
 * The pre-M2a shape: the seed document with `profileCaps` removed.
 *
 * DERIVED from the real seed rather than hand-written, so it cannot drift into
 * describing a database that never existed — the same reason the deploy-order
 * schema below is `.omit()`ed from the real one instead of copied.
 */
const PRE_CHANGE = (() => {
  const rest: Record<string, unknown> = {
    ...(CONFIG_V1_SEED as Record<string, unknown>),
  };
  delete rest.profileCaps;
  return rest;
})();

/** An operator's customised v2 — the row that must survive untouched. */
const CUSTOMISED = {
  ...PRE_CHANGE,
  stripePriceMap: { price_c: "creator", price_pack: "pack" },
  pack: { credits: 2000, priceUsd: 17, validityMonths: 6 },
};

async function twoVersions(): Promise<{ db: TestDb; v2: number }> {
  const db = await createTestDb();
  await seedAuthUser(db, "cfg_user");
  await seedDb(db);
  // Overwrite the seeded v1 with the PRE-CHANGE shape, so the fixture is a
  // database as it existed before M2a rather than one this code just wrote.
  await db.update(schema.configVersions).set({ content: PRE_CHANGE });
  const [{ version }] = await db
    .insert(schema.configVersions)
    .values({ content: CUSTOMISED, createdBy: "operator" })
    .returning({ version: schema.configVersions.version });
  return { db, v2: version };
}

const rows = (db: TestDb) =>
  db
    .select()
    .from(schema.configVersions)
    .orderBy(desc(schema.configVersions.version));

describe("AC-14 — migrate-config merges into the ACTIVE version, by appending", () => {
  it("adds exactly one row, merges only the ADDED key, and leaves v2 byte-identical", async () => {
    const { db, v2 } = await twoVersions();
    const before = await rows(db);
    const beforeV2 = before.find((r) => r.version === v2)!;

    const result = await migrateConfigDefaults(db);
    expect(result.status).toBe("migrated");
    if (result.status !== "migrated") throw new Error("unreachable");
    expect(result.fromVersion).toBe(v2);
    expect(result.addedKeys).toEqual(["profileCaps"]);

    const after = await rows(db);
    // EXACTLY one new row.
    expect(after.length).toBe(before.length + 1);
    // The source row is UNCHANGED — this is the assertion an in-place UPDATE
    // fails and every other assertion passes.
    expect(after.find((r) => r.version === v2)!.content).toEqual(
      beforeV2.content
    );

    // The new active document carries the operator's values, not the seed's.
    const active = await getActiveConfig(db);
    expect(active.version).toBe(result.toVersion);
    expect(active.content.stripePriceMap).toEqual(CUSTOMISED.stripePriceMap);
    expect(active.content.pack).toEqual(CUSTOMISED.pack);
    expect(active.content.profileCaps).toEqual({
      free: 1,
      creator: 1,
      pro: 1,
      studio: 5,
    });
  });

  it("is a NO-OP on re-run (the key is already present)", async () => {
    const { db } = await twoVersions();
    await migrateConfigDefaults(db);
    const mid = await rows(db);
    const again = await migrateConfigDefaults(db);
    expect(again.status).toBe("noop");
    expect(await rows(db)).toHaveLength(mid.length);
  });

  it("REFUSES a non-parsing source loudly, and writes nothing", async () => {
    const { db } = await twoVersions();
    const before = await rows(db);
    await db
      .insert(schema.configVersions)
      .values({ content: { graceDays: "not a number" }, createdBy: "drift" });
    await expect(migrateConfigDefaults(db)).rejects.toBeInstanceOf(
      ConfigMigrationRefused
    );
    // The drifted row is there; NOTHING else was appended.
    expect(await rows(db)).toHaveLength(before.length + 1);
  });

  it("COMPARE-AND-SET: a concurrent append makes it fail rather than revert it", async () => {
    const { db } = await twoVersions();
    const prepared = await prepareConfigMigration(db);
    expect(prepared).not.toBeNull();
    // Someone edits config at /admin/config in the window between read and
    // write. Their edit must SURVIVE — a blind append would silently revert it.
    const raced = { ...CUSTOMISED, graceDays: 21 };
    await appendConfigVersion(db, respinConfigV1.parse(raced), "operator-2");
    await expect(
      applyConfigMigration(db, prepared!)
    ).rejects.toBeInstanceOf(ConfigMigrationRaceError);
    const active = await getActiveConfig(db);
    expect(active.content.graceDays, "the concurrent edit must survive").toBe(21);
  });
});

// ---------------------------------------------------------------------------
// THE THREE WRONG IMPLEMENTATIONS, executed rather than described.
//
// Each is written here as a small function and run through the SAME assertions
// the real one passes. A mutation that only exists in a comment is a mutation
// nobody ran — and the third of these passes every assertion except one, which
// is precisely why it survived a review round.
// ---------------------------------------------------------------------------

describe("AC-14 — the three wrong implementations are RED", () => {
  it("WRONG 1: reading version 1 instead of the active version un-maps every Stripe price", async () => {
    const { db, v2 } = await twoVersions();
    const [v1row] = await db
      .select()
      .from(schema.configVersions)
      .orderBy(schema.configVersions.version)
      .limit(1);
    const merged = respinConfigV1.parse(v1row.content);
    await appendConfigVersion(db, merged, "wrong-1");

    const active = await getActiveConfig(db);
    // THE ASSERTION THE REAL IMPLEMENTATION PASSES, failing here.
    expect(
      active.content.stripePriceMap,
      "reading v1 resurrects the seed's EMPTY price map — every Stripe price becomes unmapped, and UnknownTierPriceError refuses every checkout"
    ).not.toEqual(CUSTOMISED.stripePriceMap);
    expect(active.content.pack).not.toEqual(CUSTOMISED.pack);
    expect(v2).toBeGreaterThan(1);
  });

  it("WRONG 2: appending CONFIG_V1_SEED throws the operator's document away", async () => {
    const { db } = await twoVersions();
    await appendConfigVersion(
      db,
      respinConfigV1.parse(CONFIG_V1_SEED),
      "wrong-2"
    );
    const active = await getActiveConfig(db);
    expect(active.content.stripePriceMap).not.toEqual(
      CUSTOMISED.stripePriceMap
    );
  });

  it("WRONG 3: an in-place UPDATE passes every other assertion and is still wrong", async () => {
    const { db, v2 } = await twoVersions();
    const before = await rows(db);
    const beforeV2 = before.find((r) => r.version === v2)!;
    const merged = respinConfigV1.parse(beforeV2.content);

    // The seductive one: every VALUE is preserved byte-identically, the active
    // document ends up correct, and it is a no-op on re-run.
    await db
      .update(schema.configVersions)
      .set({ content: merged })
      .where(eq(schema.configVersions.version, v2));

    const active = await getActiveConfig(db);
    expect(active.content.stripePriceMap).toEqual(CUSTOMISED.stripePriceMap);
    expect(active.content.pack).toEqual(CUSTOMISED.pack);
    expect(active.content.profileCaps).toBeDefined();

    // ...and the two assertions that catch it. `config_versions` is append-only
    // because a debit stamped `config_version = N` must be re-priceable from
    // version N forever; rewriting N retroactively changes what that debit cost.
    const after = await rows(db);
    expect(
      after.length,
      "an in-place update appends NOTHING — the append-only history has no record of the change"
    ).toBe(before.length);
    expect(
      after.find((r) => r.version === v2)!.content,
      "version 2 no longer means what it meant when a debit stamped it"
    ).not.toEqual(beforeV2.content);
  });
});

describe("A-9 deploy order: code first, then migrate-config", () => {
  // Derived from the real schema with `.omit()`, NOT a hand-written second
  // copy: a copy would drift, and the whole point is that this is what OLDER
  // code's parser was.
  const PRE_M2A_SCHEMA = respinConfigV1.omit({ profileCaps: true }).strict();

  it("OLD code cannot parse a document carrying the new key (why migrate-config runs SECOND)", () => {
    const withKey = {
      ...PRE_CHANGE,
      profileCaps: { free: 1, creator: 1, pro: 1, studio: 5 },
    };
    expect(
      PRE_M2A_SCHEMA.safeParse(withKey).success,
      "if this parsed, the deploy order would not matter — and it does"
    ).toBe(false);
    // The consequence, named: this parse runs inside the Stripe webhook's
    // transaction, five times, so a failure there rolls back `stripe_events`
    // and Stripe retries forever.
    expect(PRE_M2A_SCHEMA.safeParse(PRE_CHANGE).success).toBe(true);
  });

  it("NEW code parses a PRE-CHANGE document unchanged (the rollback window is safe)", () => {
    const parsed = respinConfigV1.safeParse(PRE_CHANGE);
    expect(
      parsed.success,
      "the new key must be `.default(...)`, or deploying the code alone breaks every existing database"
    ).toBe(true);
    if (!parsed.success) throw new Error("unreachable");
    expect(parsed.data.profileCaps).toEqual({
      free: 1,
      creator: 1,
      pro: 1,
      studio: 5,
    });
  });

  it("a database seeded AFTER M2a needs no migration at all", async () => {
    const db = await createTestDb();
    await seedAuthUser(db, "fresh");
    await seedDb(db);
    expect((await migrateConfigDefaults(db)).status).toBe("noop");
  });
});

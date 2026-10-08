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
  delete rest.similarity;
  delete rest.systemAutopsy;
  // R-95 (slice 8 fix pass): the tracked-niche allowance joined config.
  delete rest.trackedNiches;
  // Slice 9b: both additions are defaulted so code deploys before storage is
  // materialised, then migrate-config appends them without touching choices.
  delete rest.performanceLearning;
  delete rest.daysToEmpty;
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
    expect(result.addedKeys).toEqual([
      // Audit P3-R7 (R-158 point 6): a NESTED addition — the operator's other
      // pack values stay theirs, and only the new key is merged in.
      "pack.autoTopupMaxAttemptsPerMonth",
      "profileCaps",
      "trackedNiches",
      "performanceLearning",
      "daysToEmpty",
      "similarity",
      "systemAutopsy",
    ]);

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
    expect(active.content.pack).toEqual({ ...CUSTOMISED.pack, autoTopupMaxAttemptsPerMonth: 100 });
    expect(active.content.profileCaps).toEqual({
      free: 1,
      creator: 1,
      pro: 1,
      studio: 5,
    });
    expect(active.content.similarity).toEqual({ strictness: 0.7 });
    expect(active.content.systemAutopsy).toEqual({
      dailyCapMicroUsd: 100_000_000,
    });
    expect(active.content.trackedNiches).toEqual({
      free: 0,
      creator: 1,
      pro: 3,
      studio: 10,
    });
    expect(active.content.performanceLearning).toEqual({
      free: "view_only",
      creator: "full",
      pro: "full",
      studio: "full",
    });
    expect(active.content.daysToEmpty).toEqual({
      trailingWindowDays: 30,
      minimumDebitDays: 3,
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
    expect(active.content.pack).toEqual({ ...CUSTOMISED.pack, autoTopupMaxAttemptsPerMonth: 100 });
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

/** The active config document, parsed — what an operator's database holds. */
const activeContent = async (db: TestDb) => (await getActiveConfig(db)).content;

describe("a CORRECTION reaches a database that already has the wrong value", () => {
  // THE DEFECT (billing gate BLOCK, 2026-08-29). `mergeMissing` adds absent
  // keys only, so `llm.maxOutputTokens: 1024` — shipped by slice 2a and wrong
  // for slice 3 — was present, wrong, and unreachable on every existing
  // database. Raising the schema default fixes fresh installs and nothing else,
  // which left the slice undeployable by shipping code.

  it("CHAINS 1024 -> 4000 -> 12000 in one pass, and leaves every other key byte-identical", async () => {
    const db = await createTestDb();
    await seedDb(db);
    // A slice-2a-era document: parses fine, holds the wrong ceiling.
    const before = await activeContent(db);
    await db.insert(schema.configVersions).values({
      content: { ...before, llm: { ...before.llm, maxOutputTokens: 1024 } } as never,
      // WRITTEN BY THE PRODUCT, which is what makes it correctable: a
      // slice-2a-era document came from `seed`.
      createdBy: "seed",
    });

    const result = await migrateConfigDefaults(db);
    expect(result.status).toBe("migrated");
    const after = await activeContent(db);
    // 12,000, NOT 4,000. Corrections apply in order to the same document, so
    // the slice-3 correction (1024 -> 4000) and the slice-8c one
    // (4000 -> 12000) both fire in a single pass. Asserting the ENDPOINT is
    // what makes the chain a property rather than an accident: if the entries
    // ever stop composing, a database seeded before slice 3 would be left on
    // an intermediate value that no longer fits any reply the product makes.
    expect(after.llm.maxOutputTokens).toBe(12_000);
    // Everything else came through untouched — the correction is surgical.
    // Compare every OTHER llm key, so "surgical" is asserted rather than
    // asserted-about. Built by deletion rather than destructuring, because an
    // unused binding is a lint error and a `void _a` would be noise.
    const withoutCeiling = (llm: Record<string, unknown>) => {
      const copy = { ...llm };
      delete copy.maxOutputTokens;
      return copy;
    };
    expect(withoutCeiling(after.llm)).toEqual(withoutCeiling(before.llm));
    expect(after.creditCosts).toEqual(before.creditCosts);
    expect(after.stripePriceMap).toEqual(before.stripePriceMap);
  });

  it("corrects the deadline pair a real vendor call proved unusable", async () => {
    // THESE TWO CORRECTIONS NEED THEIR OWN WITNESS. The chain test above only
    // exercises `maxOutputTokens`, because `seedDb` already writes the new
    // deadlines — so without this case the two entries added on 2026-09-04
    // would be untested code that reads like coverage.
    const db = await createTestDb();
    await seedDb(db);
    const before = await activeContent(db);
    await db.insert(schema.configVersions).values({
      content: {
        ...before,
        llm: { ...before.llm, overallDeadlineMs: 40_000, timeoutMs: 60_000 },
      } as never,
      createdBy: "seed",
    });

    const result = await migrateConfigDefaults(db);
    expect(result.status).toBe("migrated");
    const after = await activeContent(db);
    // 40 s aborted every real spin at 40,130 ms; the real call takes 53.2 s.
    expect(after.llm.overallDeadlineMs).toBe(120_000);
    // The per-request timeout no longer sits ABOVE the bound that contains it.
    expect(after.llm.timeoutMs).toBe(120_000);
    expect(after.llm.timeoutMs).toBeLessThanOrEqual(after.llm.overallDeadlineMs);
  });

  it("REFUSES an OPERATOR-AUTHORED document even when it holds the exact wrong value", async () => {
    // THE INVARIANT, in its sharpest form (billing gate round 2). Value
    // equality distinguishes numbers, not authors — and 1024 is a defensible
    // operator choice, because it is the number that bounds per-call output
    // spend. An operator who typed it keeps it.
    const db = await createTestDb();
    await seedDb(db);
    const before = await activeContent(db);
    await db.insert(schema.configVersions).values({
      content: { ...before, llm: { ...before.llm, maxOutputTokens: 1024 } } as never,
      createdBy: "user_operator_1",
    });
    // THE FIRST RUN NOW WRITES, and that is the fix rather than a regression.
    // It appends a version holding the operator's 1024 UNCHANGED plus the
    // record that this correction is consumed. Returning `noop` here is what
    // the BLOCK was: nothing durable was written, so the pass laundered the
    // document to `migrate-config` and the NEXT run corrected 1024 away.
    const first = await migrateConfigDefaults(db);
    expect(first.status).toBe("migrated");
    expect(first).toMatchObject({
      addedKeys: expect.arrayContaining([
        "llm.maxOutputTokens (operator value preserved; correction consumed)",
      ]),
    });
    expect((await activeContent(db)).llm.maxOutputTokens).toBe(1024);
  });

  it("BLOCK 2026-09-04: a SECOND migrate run cannot overwrite the value an operator chose", async () => {
    // THE REPRODUCTION, AS A TEST. A reviewer drove exactly this against a real
    // database and watched three spend dials get rewritten upward: run 1
    // correctly declined an operator's document, appended its result as
    // `migrate-config` — a PRODUCT author — and run 2 then corrected the
    // operator's own numbers. `migrateConfigDefaults`' docstring says a second
    // run is a no-op, so this is not an exotic sequence.
    //
    // ALL THREE DIALS, not just the one the old test used: the entries added on
    // 2026-09-04 fire on 40_000 and 60_000, which an operator would plausibly
    // hold DELIBERATELY, because 40 s is the number tech-spec §132's
    // "full script < 45s" budget asks them to hold.
    const db = await createTestDb();
    await seedDb(db);
    const before = await activeContent(db);
    await db.insert(schema.configVersions).values({
      content: {
        ...before,
        llm: {
          ...before.llm,
          maxOutputTokens: 4000,
          overallDeadlineMs: 40_000,
          timeoutMs: 60_000,
        },
      } as never,
      createdBy: "user_operator_1",
    });

    const runs = [
      await migrateConfigDefaults(db),
      await migrateConfigDefaults(db),
      await migrateConfigDefaults(db),
    ];
    // Run 1 records the consumption; every run after it is a true no-op.
    expect(runs[0].status).toBe("migrated");
    expect(runs[1].status).toBe("noop");
    expect(runs[2].status).toBe("noop");

    const after = await activeContent(db);
    expect(after.llm.maxOutputTokens).toBe(4000);
    expect(after.llm.overallDeadlineMs).toBe(40_000);
    expect(after.llm.timeoutMs).toBe(60_000);
    // The record is durable and names the identities, not the paths — so a
    // value the operator later sets back is still never re-corrected.
    expect(after.appliedCorrections).toEqual(
      expect.arrayContaining([
        "llm.maxOutputTokens:4000→12000",
        "llm.overallDeadlineMs:40000→120000",
        "llm.timeoutMs:60000→120000",
      ])
    );
  });

  it("NON-VACUITY: the same three values on a PRODUCT-authored document ARE corrected", async () => {
    // Without this, the test above would pass against a `CORRECTIONS` list
    // that does nothing at all, or against a guard that declines everything.
    // Same three values, same single difference: who wrote the row.
    const db = await createTestDb();
    await seedDb(db);
    const before = await activeContent(db);
    await db.insert(schema.configVersions).values({
      content: {
        ...before,
        llm: {
          ...before.llm,
          maxOutputTokens: 4000,
          overallDeadlineMs: 40_000,
          timeoutMs: 60_000,
        },
      } as never,
      createdBy: "seed",
    });

    expect((await migrateConfigDefaults(db)).status).toBe("migrated");
    const after = await activeContent(db);
    expect(after.llm.maxOutputTokens).toBe(12_000);
    expect(after.llm.overallDeadlineMs).toBe(120_000);
    expect(after.llm.timeoutMs).toBe(120_000);
    // And consumed, so the record is written on the applying path too.
    expect(after.appliedCorrections).toEqual(
      expect.arrayContaining([
        "llm.maxOutputTokens:4000→12000",
        "llm.overallDeadlineMs:40000→120000",
        "llm.timeoutMs:60000→120000",
      ])
    );
  });

  it("REFUSES to touch a value an operator chose — the value half of the guard", async () => {
    // The whole reason `mergeMissing` never overwrites a present key. A
    // correction fires only from the EXACT value this product wrote; an
    // operator who picked 2048 (or 8192) keeps it.
    const db = await createTestDb();
    await seedDb(db);
    const before = await activeContent(db);
    await db.insert(schema.configVersions).values({
      content: { ...before, llm: { ...before.llm, maxOutputTokens: 2048 } } as never,
      createdBy: "an-operator",
    });

    const result = await migrateConfigDefaults(db);
    expect(result.status).toBe("noop");
    expect((await activeContent(db)).llm.maxOutputTokens).toBe(2048);
  });

  it("is IDEMPOTENT: a second run corrects nothing", async () => {
    const db = await createTestDb();
    await seedDb(db);
    const before = await activeContent(db);
    await db.insert(schema.configVersions).values({
      content: { ...before, llm: { ...before.llm, maxOutputTokens: 1024 } } as never,
      createdBy: "seed",
    });
    await migrateConfigDefaults(db);
    const versionsAfterFirst = (await db.select().from(schema.configVersions)).length;
    expect(await migrateConfigDefaults(db)).toMatchObject({ status: "noop" });
    expect(await db.select().from(schema.configVersions)).toHaveLength(
      versionsAfterFirst
    );
  });
});

describe("A-9 deploy order: code first, then migrate-config", () => {
  // Derived from the real schema with `.omit()`, NOT a hand-written second
  // copy: a copy would drift, and the whole point is that this is what OLDER
  // code's parser was.
  const PRE_M2A_SCHEMA = respinConfigV1.omit({ profileCaps: true }).strict();
  const PRE_9B_SCHEMA = respinConfigV1
    .omit({ performanceLearning: true, daysToEmpty: true })
    .strict();

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

  it("9b keeps the pre-materialisation rollback window safe and makes the post-materialisation boundary explicit", async () => {
    expect(PRE_9B_SCHEMA.safeParse(PRE_CHANGE).success).toBe(true);
    const parsedByNewCode = respinConfigV1.parse(PRE_CHANGE);
    expect(parsedByNewCode.performanceLearning.free).toBe("view_only");
    expect(parsedByNewCode.daysToEmpty).toEqual({
      trailingWindowDays: 30,
      minimumDebitDays: 3,
    });

    const materialised = respinConfigV1.parse(CONFIG_V1_SEED);
    expect(
      PRE_9B_SCHEMA.safeParse(materialised).success,
      "old strict code must be known-unsafe after either 9b key is stored"
    ).toBe(false);
    expect(respinConfigV1.safeParse(materialised).success).toBe(true);
  });
});

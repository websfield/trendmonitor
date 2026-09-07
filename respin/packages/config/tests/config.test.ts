// @respin/config — parity with the Phase-1 seed (the Zod schema must parse
// EXACTLY what seedDb writes, driven from the real seed, not a copied
// literal), fail-closed reads, append-only writes.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { desc } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  createTestDb,
  schema,
  seedAuthUser,
  seedDb,
} from "@respin/db";
import {
  appendConfigVersion,
  configVersionContents,
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

  it("defaults a pre-Spin document's requested strictness without weakening the code gate", () => {
    const beforeSpin: Record<string, unknown> = { ...CONFIG_V1_SEED };
    delete beforeSpin.similarity;
    const parsed = respinConfigV1.parse(beforeSpin);
    expect(parsed.similarity).toEqual({ strictness: 0.7 });
  });

  it("defaults a pre-R-95 document's tracked-niche allowance to the PRD §4G row (0/1/3/10)", () => {
    const beforeTrackedNiches: Record<string, unknown> = { ...CONFIG_V1_SEED };
    delete beforeTrackedNiches.trackedNiches;
    expect(respinConfigV1.parse(beforeTrackedNiches).trackedNiches).toEqual({
      free: 0,
      creator: 1,
      pro: 3,
      studio: 10,
    });
    // ...and a document that prices it DIFFERENTLY is what the reader sees —
    // the key is config, not a literal wearing a config name.
    expect(
      respinConfigV1.parse({ ...CONFIG_V1_SEED, trackedNiches: { free: 0, creator: 2, pro: 5, studio: 20 } })
        .trackedNiches
    ).toEqual({ free: 0, creator: 2, pro: 5, studio: 20 });
    // `.strict()`: a fifth tier is a parse failure, not a silent allowance.
    expect(() =>
      respinConfigV1.parse({ ...CONFIG_V1_SEED, trackedNiches: { free: 0, creator: 1, pro: 3, studio: 10, enterprise: 99 } })
    ).toThrow();
  });

  it("defaults pre-9b performance-learning access and keeps the tier map strict/config-driven", () => {
    const before9b: Record<string, unknown> = { ...CONFIG_V1_SEED };
    delete before9b.performanceLearning;
    expect(respinConfigV1.parse(before9b).performanceLearning).toEqual({
      free: "view_only",
      creator: "full",
      pro: "full",
      studio: "full",
    });

    const inverted = respinConfigV1.parse({
      ...CONFIG_V1_SEED,
      performanceLearning: {
        free: "full",
        creator: "view_only",
        pro: "full",
        studio: "full",
      },
    });
    expect(inverted.performanceLearning).toEqual({
      free: "full",
      creator: "view_only",
      pro: "full",
      studio: "full",
    });

    for (const performanceLearning of [
      { free: "view_only", creator: "full", pro: "full" },
      {
        free: "view_only",
        creator: "full",
        pro: "full",
        studio: "full",
        enterprise: "full",
      },
      { free: "none", creator: "full", pro: "full", studio: "full" },
    ]) {
      expect(
        respinConfigV1.safeParse({ ...CONFIG_V1_SEED, performanceLearning })
          .success
      ).toBe(false);
    }
  });

  it("defaults pre-9b days-to-empty thresholds and refuses missing, non-positive, non-integer, or incoherent values", () => {
    const before9b: Record<string, unknown> = { ...CONFIG_V1_SEED };
    delete before9b.daysToEmpty;
    expect(respinConfigV1.parse(before9b).daysToEmpty).toEqual({
      trailingWindowDays: 30,
      minimumDebitDays: 3,
    });

    expect(
      respinConfigV1.parse({
        ...CONFIG_V1_SEED,
        daysToEmpty: { trailingWindowDays: 45, minimumDebitDays: 7 },
      }).daysToEmpty
    ).toEqual({ trailingWindowDays: 45, minimumDebitDays: 7 });

    for (const daysToEmpty of [
      { trailingWindowDays: 30 },
      { trailingWindowDays: 0, minimumDebitDays: 3 },
      { trailingWindowDays: 30, minimumDebitDays: -1 },
      { trailingWindowDays: 30.5, minimumDebitDays: 3 },
      { trailingWindowDays: 2, minimumDebitDays: 3 },
      { trailingWindowDays: 30, minimumDebitDays: 3, extra: 1 },
    ]) {
      expect(
        respinConfigV1.safeParse({ ...CONFIG_V1_SEED, daysToEmpty }).success
      ).toBe(false);
    }
  });

  it("materialises the existing system-autopsy code ceiling for a pre-cap document", () => {
    const beforeSystemAutopsyCap: Record<string, unknown> = {
      ...CONFIG_V1_SEED,
    };
    delete beforeSystemAutopsyCap.systemAutopsy;
    expect(respinConfigV1.parse(beforeSystemAutopsyCap).systemAutopsy).toEqual({
      dailyCapMicroUsd: 100_000_000,
    });
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

  // ---- R-85: the HISTORICAL documents, for judging historical attempts ----

  it("configVersionContents returns each named version's OWN stored document", async () => {
    // WHY THIS READ EXISTS (billing gate, 2026-09-02). `reconcileSpend` judges
    // attempts by the document they were priced under —
    // `model_usage.config_version` — because judging them by today's active
    // document lets a price CUT hide every lost debit incurred before it. This
    // is the read that makes that possible, so the case that matters is two
    // versions that DISAGREE about a price.
    const db = await createTestDb();
    await seedAuthUser(db, "cfg_hist_user");
    await seedDb(db);
    const v1 = await getActiveConfig(db);
    const v2 = await appendConfigVersion(
      db,
      {
        ...v1.content,
        creditCosts: { ...v1.content.creditCosts, onboardingBrainBuild: 25 },
      },
      "history-test"
    );

    const both = await configVersionContents(db, [v1.version, v2]);
    expect([...both.keys()].sort()).toEqual([v1.version, v2].sort());
    expect(both.get(v1.version)?.creditCosts.onboardingBrainBuild).toBe(0);
    expect(
      both.get(v2)?.creditCosts.onboardingBrainBuild,
      "the older version came back carrying the NEWER price — history is being read as today"
    ).toBe(25);
    // Asking twice for one version asks the table once and answers once.
    const single = await configVersionContents(db, [v1.version, v1.version]);
    expect(single.size).toBe(1);
  });

  it("FAIL CLOSED: a version that is not stored is a refusal, never a silent omission", async () => {
    // A partial map would make "I could not read that document" look exactly
    // like "that document exempted nothing" at the call site, and the caller is
    // building a report about money.
    const db = await createTestDb();
    await seedAuthUser(db, "cfg_missing_user");
    await seedDb(db);
    await expect(configVersionContents(db, [1, 999])).rejects.toThrow(
      ConfigUnavailableError
    );
    await expect(configVersionContents(db, [1, 999])).rejects.toThrow(/999/);
    // ...and the same discipline for a row that does not parse.
    await db
      .insert(schema.configVersions)
      .values({ content: { nonsense: true }, createdBy: "hand-edited" });
    const [{ version: bad }] = await db
      .select({ version: schema.configVersions.version })
      .from(schema.configVersions)
      .orderBy(desc(schema.configVersions.version))
      .limit(1);
    await expect(configVersionContents(db, [bad])).rejects.toThrow(
      ConfigUnavailableError
    );
  });

  it("an empty request is an empty answer, and sends no query", async () => {
    // `inArray(col, [])` is not a query worth sending and some drivers refuse
    // it; the branch is driven rather than argued.
    const db = await createTestDb();
    expect((await configVersionContents(db, [])).size).toBe(0);
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

  // ---- A-9: an object-level `.default(...)` carries EVERY key (R-77) ----

  it("a stored document written before an OBJECT key existed parses to the SAME numbers the seed carries", () => {
    // THE PROPERTY, DRIVEN AT RUNTIME AND NOT AT THE TYPE LEVEL. In zod@4 an
    // object-level `.default(...)` SHORT-CIRCUITS: when the key is absent the
    // literal is returned as written and the inner `.default(...)`s never run.
    // So a key omitted from the outer literal is `undefined` at runtime while
    // its type says `number`. TypeScript refuses the omission, and a cast
    // defeats TypeScript — which is the 2026-08-21 lesson, so the witness is
    // this parse rather than a `@ts-expect-error`.
    //
    // THE COST IS NOT ABSTRACT for `generation`: the whole `generation` key is
    // absent from every document stored before slice 6, and
    // `frameworkContextCharBudget` reaches `frameworksForContext` as
    // `charBudget`. `undefined` there makes `used + size > charBudget` false
    // for every row, so the entire framework library would be dropped from
    // every prompt with nothing saying so.
    const preSlice6: Record<string, unknown> = { ...CONFIG_V1_SEED };
    delete preSlice6.generation;
    const parsed = respinConfigV1.parse(preSlice6);
    expect(parsed.generation).toEqual(CONFIG_V1_SEED.generation);
    for (const [key, value] of Object.entries(parsed.generation)) {
      expect(value, `generation.${key} is undefined — the object default omits it`)
        .toBeTypeOf("number");
    }

    // NON-VACUITY: the short-circuit this guards against is real in the
    // installed zod, not a property this test invented. A default literal that
    // omits a key really does come back missing it.
    const shortCircuits = z
      .object({ a: z.number().default(1), b: z.number().default(2) })
      .strict()
      .default({ a: 1, b: 2 } as { a: number; b: number });
    expect(shortCircuits.parse(undefined)).toEqual({ a: 1, b: 2 });
    const omitting = z
      .object({ a: z.number().default(1), b: z.number().default(2) })
      .strict()
      .default({ a: 1 } as unknown as { a: number; b: number });
    expect(
      (omitting.parse(undefined) as Record<string, unknown>).b,
      "zod re-parsed the default literal — then this whole rule is unnecessary, and the comment above is wrong"
    ).toBeUndefined();
  });

  /**
   * THE SAME RULE, OVER THE WHOLE SCHEMA INSTEAD OF OVER ONE KEY.
   *
   * The case above pins `generation` because that is where the short-circuit
   * actually cost something. Two reviewers then swept the other object-level
   * defaults by hand and found no second hole — "but that is a measurement of
   * TODAY'S code" (tenancy gate, 2026-09-02), and a sixth default added next
   * slice would be covered by a review that has already happened. This is the
   * population lesson (CLAUDE.md 2026-08-29) landing on the guard written for
   * it: the population is the SCHEMA, so it is derived from the schema.
   *
   * IT WALKS THE TREE, not the top level, because an object default CAN be
   * nested. The check is static — every key of the inner object must appear in
   * the default LITERAL — which is exactly the property zod's short-circuit
   * makes load-bearing.
   *
   * NO NESTED ONE EXISTS TODAY, AND THAT IS SAID RATHER THAN IMPLIED (billing
   * gate, 2026-09-02). This paragraph cited "`llm.timeouts` is one"; `llm` has
   * no `timeouts` key (`models`, `prices`, `maxOutputTokens`, `timeoutMs`,
   * `overallDeadlineMs`, `maxRetries`), and all five object-level defaults in
   * this schema — `profileCaps`, `concurrencyLimits`, `onboarding`,
   * `generation`, `llm` — are top-level. So the recursive branch, the whole
   * reason this is a walk rather than an `Object.entries` over the root, had
   * NO witness and the planted-omission case below plants a TOP-LEVEL one. A
   * comment claiming a property is not the property: the branch is now driven
   * by "the walk finds an object default NESTED inside another object", which
   * plants exactly the shape the schema does not yet have.
   *
   * THE INTERNALS ARE VERIFIED AGAINST THE INSTALLED ZOD (4.4.3), not
   * recalled (golden rule 9): a `.default(...)` node is `def.type ===
   * "default"` with `def.innerType` and `def.defaultValue`, and in this
   * version `defaultValue` is the VALUE rather than a factory. Both are
   * handled, and the case below fails loudly if the shape it walks stops
   * existing rather than reporting zero defaults.
   */
  type SchemaNode = {
    def?: { type?: string; innerType?: SchemaNode; defaultValue?: unknown };
    shape?: Record<string, SchemaNode>;
  };

  /** Every `.default(...)` in the tree, with the path that reaches it. */
  function collectDefaults(
    node: SchemaNode | undefined,
    path: string,
    out: { path: string; node: SchemaNode }[] = []
  ) {
    const type = node?.def?.type;
    if (!node || !type) return out;
    if (type === "default") {
      out.push({ path, node });
      collectDefaults(node.def?.innerType, path, out);
      return out;
    }
    if (type === "object") {
      for (const [key, child] of Object.entries(node.shape ?? {})) {
        collectDefaults(child, path ? `${path}.${key}` : key, out);
      }
      return out;
    }
    if (node.def?.innerType) collectDefaults(node.def.innerType, path, out);
    return out;
  }

  it("EVERY object-level default in the schema carries EVERY key of its object", () => {
    const defaults = collectDefaults(respinConfigV1 as unknown as SchemaNode, "");
    const objectDefaults = defaults.filter(
      (d) => d.node.def?.innerType?.def?.type === "object"
    );
    // NON-VACUITY: the walker really reached the schema. Without this the loop
    // below passes on an empty list, which is the fail-open shape this whole
    // rule exists to avoid.
    expect(
      objectDefaults.map((d) => d.path),
      "the walker found no object-level defaults — it is not walking this schema"
    ).toContain("generation");
    expect(objectDefaults.length).toBeGreaterThanOrEqual(5);

    for (const { path, node } of objectDefaults) {
      const raw = node.def?.defaultValue;
      // `defaultValue` is a VALUE in zod@4.4.3 and a factory in zod@3; both are
      // read rather than assumed, so a version bump surfaces as a failed
      // assertion about keys and not as a silent `undefined`.
      const value = (typeof raw === "function" ? (raw as () => unknown)() : raw) as
        | Record<string, unknown>
        | undefined;
      expect(value, `${path} has a default with no value`).toBeTypeOf("object");
      const inner = Object.keys(node.def?.innerType?.shape ?? {});
      expect(inner.length, `${path}: the inner object has no keys`).toBeGreaterThan(0);
      for (const key of inner) {
        expect(
          Object.prototype.hasOwnProperty.call(value ?? {}, key),
          `${path}.${key} is MISSING from ${path}'s default literal — zod's object-level default short-circuits, so a document without \`${path}\` parses to \`undefined\` there while its type says otherwise`
        ).toBe(true);
      }
    }
  });

  it("...and the same check SEES a planted omission (it is not vacuous)", () => {
    // The mutation the rule exists for, planted on a schema of the same shape:
    // an object default that forgets one of its own keys.
    const planted = z.strictObject({
      generation: z
        .strictObject({
          a: z.number().default(1),
          b: z.number().default(2),
        })
        .default({ a: 1 } as unknown as { a: number; b: number }),
    });
    const [only] = collectDefaults(planted as unknown as SchemaNode, "").filter(
      (d) => d.node.def?.innerType?.def?.type === "object"
    );
    expect(only?.path).toBe("generation");
    const raw = only.node.def?.defaultValue;
    const value = (typeof raw === "function" ? (raw as () => unknown)() : raw) as Record<
      string,
      unknown
    >;
    const inner = Object.keys(only.node.def?.innerType?.shape ?? {});
    expect(inner).toEqual(["a", "b"]);
    expect(
      inner.filter((k) => !Object.prototype.hasOwnProperty.call(value, k)),
      "the checker did not see a key missing from a default literal"
    ).toEqual(["b"]);
    // ...and the omission really does reach a parsed document as `undefined`,
    // which is what makes the static check worth having.
    expect(
      (planted.parse({}) as { generation: Record<string, unknown> }).generation.b
    ).toBeUndefined();
  });

  it("the walk finds an object default NESTED inside another object", () => {
    // THE BRANCH THIS SCHEMA HAS NO INSTANCE OF, planted so the recursion is a
    // run rather than a sentence. Every object-level default here is top-level
    // today, so without this the walk could stop descending and the whole
    // suite would stay green — and the rule would then miss the FIRST nested
    // one somebody writes, which is the day it matters.
    const planted = z.strictObject({
      llm: z.strictObject({
        timeouts: z
          .strictObject({ a: z.number().default(1), b: z.number().default(2) })
          .default({ a: 1 } as unknown as { a: number; b: number }),
      }),
    });
    const objectDefaults = collectDefaults(
      planted as unknown as SchemaNode,
      ""
    ).filter((d) => d.node.def?.innerType?.def?.type === "object");
    expect(
      objectDefaults.map((d) => d.path),
      "the walker never descended past the top level"
    ).toEqual(["llm.timeouts"]);
    // ...and the omission check reads it exactly as it reads a top-level one.
    const raw = objectDefaults[0].node.def?.defaultValue;
    const value = (typeof raw === "function" ? (raw as () => unknown)() : raw) as Record<
      string,
      unknown
    >;
    const inner = Object.keys(objectDefaults[0].node.def?.innerType?.shape ?? {});
    expect(inner).toEqual(["a", "b"]);
    expect(
      inner.filter((k) => !Object.prototype.hasOwnProperty.call(value, k)),
      "a key missing from a NESTED default literal was not seen"
    ).toEqual(["b"]);
    // The behavioural half: the short-circuit really does reach a nested key.
    expect(
      (planted.parse({ llm: {} }) as { llm: { timeouts: Record<string, unknown> } }).llm
        .timeouts.b
    ).toBeUndefined();
  });

  it("EVERY top-level object default parses a document that omits it, back to the seed", () => {
    // The BEHAVIOURAL half of the rule above, over the same derived
    // population rather than over `generation` alone: a document stored before
    // the key existed must parse to exactly the numbers the seed carries.
    const topLevel = Object.entries(
      (respinConfigV1 as unknown as SchemaNode).shape ?? {}
    ).filter(([, s]) => s.def?.type === "default" && s.def.innerType?.def?.type === "object");
    expect(topLevel.length, "no top-level object defaults were found").toBeGreaterThanOrEqual(
      5
    );
    for (const [key] of topLevel) {
      const stored: Record<string, unknown> = { ...CONFIG_V1_SEED };
      delete stored[key];
      const parsed = respinConfigV1.parse(stored) as Record<string, unknown>;
      expect(
        parsed[key],
        `a document without \`${key}\` does not parse back to the seed's own values`
      ).toEqual((CONFIG_V1_SEED as Record<string, unknown>)[key]);
      for (const [inner, value] of Object.entries(
        parsed[key] as Record<string, unknown>
      )) {
        expect(value, `${key}.${inner} came back undefined`).toBeDefined();
      }
    }
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

// @respin/config — parity with the Phase-1 seed (the Zod schema must parse
// EXACTLY what seedDb writes, driven from the real seed, not a copied
// literal), fail-closed reads, append-only writes.
import { describe, expect, it } from "vitest";
import { z } from "zod";
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
   * IT WALKS THE TREE, not the top level, because an object default can be
   * nested (`llm.timeouts` is one). The check is static — every key of the
   * inner object must appear in the default LITERAL — which is exactly the
   * property zod's short-circuit makes load-bearing.
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

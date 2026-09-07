// Phase 10b-1 Task 4 — round-1 lean CHANGE C3: the SQL port's per-column
// scrub rules are a LIST, walked over the registry, not a producer discovered
// at the first real erasure. Every column of every `pseudonymise` field set in
// `LIFECYCLE_REGISTRY` must resolve to a rule against the schema PGlite
// actually builds; a future entry whose column shape has no rule is red HERE.
import { describe, expect, it } from "vitest";
import { fieldSetColumns, LIFECYCLE_REGISTRY, SPLIT_TABLE_FIELD_SETS, type LifecycleClassEntry } from "../src/creator-data-registry";
import { loadTableMetaInTx, scrubRuleFor } from "../src/lifecycle-sql-port";
import { createTestDb } from "../src/testing";

describe("lifecycle scrub rules are closed over the registry", () => {
  it("every pseudonymise column in LIFECYCLE_REGISTRY has a scrub rule against the built schema", async () => {
    const db = await createTestDb();
    const meta = await db.transaction((tx) => loadTableMetaInTx(tx));
    const entries = LIFECYCLE_REGISTRY.filter((entry) => entry.action === "pseudonymise");
    expect(entries.length).toBeGreaterThan(10);
    const unruled: string[] = [];
    let checked = 0;
    for (const entry of entries) {
      const table = meta.get(entry.table);
      expect(table, `${entry.table} is absent from the built schema`).toBeDefined();
      // The registry's own expansion (round-2 lean NOTE): one implementation, not a copy.
      for (const column of fieldSetColumns(entry as LifecycleClassEntry, [...table!.columns.keys()])) {
        const columnMeta = table!.columns.get(column);
        expect(columnMeta, `${entry.table}.${column} is absent from the built schema`).toBeDefined();
        checked += 1;
        if (scrubRuleFor(entry.table, column, columnMeta!) === null) unruled.push(`${entry.table}.${column}`);
      }
    }
    expect(checked).toBeGreaterThan(40);
    expect(unruled).toEqual([]);
    // The split field sets are the registry's, not a copy: a drift here is a drift there.
    expect(Object.keys(SPLIT_TABLE_FIELD_SETS).length).toBeGreaterThan(3);
  });

  it("FIXTURE PROOF: a NOT NULL column of an unruled type has no rule (the walk above can go red)", () => {
    expect(scrubRuleFor("some_table", "amount_cents", { nullable: false, udt: "int4" })).toBeNull();
    expect(scrubRuleFor("some_table", "flags", { nullable: false, udt: "jsonb" })).toBeNull();
    expect(scrubRuleFor("some_table", "label", { nullable: false, udt: "varchar" })).toBeNull();
    // …and the shapes the port does handle resolve as documented.
    expect(scrubRuleFor("some_table", "flags", { nullable: true, udt: "jsonb" })).toBe("null");
    expect(scrubRuleFor("deletion_operations", "payload_hash", { nullable: false, udt: "text" })).toBe("payload_hash");
    expect(scrubRuleFor("other_table", "payload_hash", { nullable: false, udt: "text" })).toBe("digest_random");
    expect(scrubRuleFor("stripe_events", "stripe_customer_id", { nullable: true, udt: "text" })).toBe("text_token");
    expect(scrubRuleFor("some_table", "workspace_id", { nullable: false, udt: "uuid" })).toBe("link");
    expect(scrubRuleFor("some_table", "id", { nullable: false, udt: "uuid" })).toBe("skip");
  });
});

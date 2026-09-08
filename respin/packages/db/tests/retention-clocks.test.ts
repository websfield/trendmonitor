// Phase 10b-1 Task 6.1 — the retention clock authority's closure.
//
// Every assertion here is about a REAL population: the shipped
// `LIFECYCLE_REGISTRY` against the shipped migrations. A measure invented for
// a table nobody registers, or a registry entry nobody sweeps, is red.
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, readFileSync } from "node:fs";

import {
  LIFECYCLE_REGISTRY,
  type LifecycleClassEntry,
} from "../src/creator-data-registry";
import { migrationInventory } from "../src/lifecycle-inventory";
import {
  assertRetentionClockClosure,
  isReceiverExecutor,
  measureKey,
  RETENTION_CLOCKS,
  RETENTION_MEASURES,
  retentionSweepSpecs,
  type RetentionMeasure,
} from "../src/retention-clocks";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const migrations = migrationInventory(
  readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), "utf8") })),
);

describe("retention clock closure", () => {
  it("holds against the shipped registry and migrations", () => {
    expect(() => assertRetentionClockClosure({ registry: LIFECYCLE_REGISTRY, migrations })).not.toThrow();
  });

  it("covers every receiver-executed registry entry with exactly one measure", () => {
    const required = new Set(
      LIFECYCLE_REGISTRY.filter((entry) => isReceiverExecutor(entry.executor)).map((entry) =>
        measureKey(entry.table, entry.rowClass, entry.fieldSet.name),
      ),
    );
    const declared = new Set(RETENTION_MEASURES.map((measure) => measureKey(measure.table, measure.rowClass, measure.fieldSet)));
    expect([...declared].sort()).toEqual([...required].sort());
  });

  it("gives every retention rule exactly one clock", () => {
    const rules = new Set(LIFECYCLE_REGISTRY.map((entry) => entry.retention));
    for (const rule of rules) expect(RETENTION_CLOCKS[rule]).toBeDefined();
  });

  it("never schedules a sweep for a subject-lifetime or financial-chain rule", () => {
    for (const spec of retentionSweepSpecs()) {
      expect(RETENTION_CLOCKS[spec.rule].kind).toBe("scheduled");
      expect(spec.durationMs).toBeGreaterThan(0);
    }
  });

  it("emits one sweep per registry entry, keyed like the registry", () => {
    const specs = retentionSweepSpecs();
    expect(new Set(specs.map((spec) => spec.key)).size).toBe(specs.length);
    // stripe_events carries three attribution row classes over one payload
    // clock, and each gets its own sweep — the bijection is with the REGISTRY.
    const payload = specs.filter((spec) => spec.key === "stripe_events::stripe_workspace_attributed::provider_payload");
    expect(payload).toHaveLength(1);
  });

  // The claim `tests/feedback-readers.test.ts` allowlists the receiver on:
  // its FROM clause is computed, so what bounds it is this population, not a
  // comment. A cascade-erased table can never appear in a sweep.
  it("never sweeps a table its scope executor erases", () => {
    const swept = new Set(retentionSweepSpecs().map((spec) => spec.measure.table));
    const cascaded = new Set(
      LIFECYCLE_REGISTRY.filter((entry) => entry.action === "cascade").map((entry) => entry.table),
    );
    for (const table of swept) expect(cascaded.has(table), table).toBe(false);
    // Named explicitly because it is the table the reader scan cares about.
    expect(swept.has("generation_feedback")).toBe(false);
  });

  // The mutations. Each plants a violation the closure MUST catch; a green
  // closure over a planted defect is the "verifier that reports success"
  // failure the 2026-08-26 lesson names.
  const planted = (entries: readonly LifecycleClassEntry[], measures?: readonly RetentionMeasure[]) =>
    () => assertRetentionClockClosure({ registry: entries, migrations, measures });

  it("refuses a receiver-executed entry with no measure", () => {
    const orphan = LIFECYCLE_REGISTRY.find((entry) => entry.table === "session");
    if (!orphan) throw new Error("fixture: no session entry in the registry");
    const withoutSession = RETENTION_MEASURES.filter((measure) => measure.table !== "session");
    expect(planted([orphan], withoutSession)).toThrow(/session::identity_row::complete_row is receiver-executed and has no measure/);
  });

  it("refuses a measure that matches no receiver-executed entry", () => {
    const sessionOnly = LIFECYCLE_REGISTRY.filter((entry) => entry.table === "session");
    expect(planted(sessionOnly)).toThrow(/matches no receiver-executed registry entry/);
  });

  it("refuses a receiver aimed at a financial-chain rule", () => {
    const entry = LIFECYCLE_REGISTRY.find(
      (candidate) => candidate.table === "session" && candidate.executor === "expiry_receiver",
    );
    if (!entry) throw new Error("fixture: no session expiry_receiver entry");
    const financialised = { ...entry, retention: "financial_chain_seven_years" } as LifecycleClassEntry;
    expect(
      planted([financialised], RETENTION_MEASURES.filter((measure) => measure.table === "session")),
    ).toThrow(/a receiver cannot sweep a clock that never expires/);
  });

  it("refuses a measure whose column the migrations do not have", () => {
    const entry = LIFECYCLE_REGISTRY.find(
      (candidate) => candidate.table === "session" && candidate.executor === "expiry_receiver",
    );
    if (!entry) throw new Error("fixture: no session expiry_receiver entry");
    const bad = RETENTION_MEASURES.filter((measure) => measure.table === "session").map((measure) => ({
      ...measure,
      measuredFrom: "expires_at_but_typoed",
    })) as readonly RetentionMeasure[];
    expect(planted([entry], bad)).toThrow(/measures from unknown column 'expires_at_but_typoed'/);
  });

  it("refuses a redaction aimed at a column the migrations do not have", () => {
    const entry = LIFECYCLE_REGISTRY.find(
      (candidate) => candidate.table === "stripe_events" && candidate.fieldSet.name === "provider_payload",
    );
    if (!entry) throw new Error("fixture: no stripe_events provider_payload entry");
    const bad = RETENTION_MEASURES.filter(
      (measure) => measure.table === "stripe_events" && measure.fieldSet === "provider_payload",
    ).map((measure) => ({
      ...measure,
      effect: { kind: "redact_columns", columns: [{ column: "not_a_column", to: "null" }] },
    })) as readonly RetentionMeasure[];
    expect(planted([entry], bad)).toThrow(/redacts unknown column 'not_a_column'/);
  });
});

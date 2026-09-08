// Phase 10b-1 Task 9 — the same-change registration API 10a/10b-2/10c consume.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { LIFECYCLE_REGISTRY } from "../src/creator-data-registry";
import { migrationInventory } from "../src/lifecycle-inventory";
import { assertLifecycleRegistration } from "../src/lifecycle-registration";

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), "../../.."), "packages/db/migrations");
const sources = readdirSync(DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(DIR, name), "utf8") }));
const migrations = migrationInventory(sources);

describe("assertLifecycleRegistration", () => {
  it("holds for the shipped tree", () => {
    expect(() => assertLifecycleRegistration({ migrations })).not.toThrow();
  });

  it("reddens on a table that exists in the migrations and is registered NOWHERE, naming the first site", () => {
    // The shape a later slice would produce by generating a migration and
    // forgetting the registry: the closure must fail on the table's name, not
    // on some downstream symptom.
    const planted = migrationInventory([
      ...sources,
      {
        name: "9999_planted.sql",
        // drizzle-kit's exact emitted shape, which is the only one the
        // inventory parser accepts (it fails closed on anything else).
        sql: 'CREATE TABLE "planted_launch_table" (\n\t"id" uuid PRIMARY KEY NOT NULL,\n\t"created_at" timestamp with time zone DEFAULT now() NOT NULL\n);\n',
      },
    ]);
    expect(() => assertLifecycleRegistration({ migrations: planted })).toThrow(/unregistered migration table: planted_launch_table/);
  });

  it("reddens on a registered entry whose retention rule has no receiver measure", () => {
    // A slice that registers the row but forgets `RETENTION_MEASURES`: the
    // registry closure passes and the retention bijection is what catches it.
    // `account` is cascade-erased today and has no measure. Re-registering it
    // as receiver-swept without adding one is exactly the omission.
    const account = LIFECYCLE_REGISTRY.find((entry) => entry.table === "account")!;
    const withoutMeasure = LIFECYCLE_REGISTRY.map((entry) =>
      entry === account
        ? ({ ...entry, action: "delete_explicit", retention: "session_expiry", executor: "expiry_receiver", residueProbe: "expiry_residue" } as typeof entry)
        : entry,
    );
    expect(() => assertLifecycleRegistration({ migrations, registry: withoutMeasure })).toThrow(
      /account::identity_row::complete_row is receiver-executed and has no measure/,
    );
  });
});

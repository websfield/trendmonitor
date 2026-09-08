# Registering a table with the lifecycle — the same-change checklist

Phase 10b-1 Task 9. Every table 10a, 10b-2 and 10c add must land with its
lifecycle in the **same change**, or the change cannot pass the gate
(`decisions.md` R-119). This is the list of edit sites, in the order that
avoids chasing one closure error at a time — it was written from doing exactly
that across Tasks 6–8 — and the one test call that proves all of them at once.

## The one call

```ts
import { assertLifecycleRegistration } from "@respin/db";
assertLifecycleRegistration({ migrations }); // throws naming the first missing site
```

`packages/db/tests/lifecycle-registration.test.ts` runs it against the shipped
tree and against a planted table with every site missing, so a slice's own
test is that one line plus its table's specific behaviour.

## Edit sites, in order

| # | site | what to add | proven by |
|---|---|---|---|
| 1 | Drizzle schema (`*-schema.ts`) | the table; every timestamp `withTimezone`; server-derived columns with DB defaults, **not** `$defaultFn` (client-side, silently NULL under raw SQL — Task 6 found this the hard way) | `db:check` |
| 2 | `pnpm db:generate` | the migration; commit it with the schema and a seed update if the table needs rows | `db:check`, `lifecycle-registry.test.ts` "covers every current migration table" |
| 3 | `creator-data-registry.ts` `APP_TABLES` | the table name (sorted) | `validateLifecycleClosure`: *unregistered migration table* |
| 4 | `ROW_CLASSES_BY_TABLE` | its row classes; more than one ⇒ a `ROW_CLASS_DISCRIMINATORS` entry naming the enum column and source file | *mixed table has no discriminator* |
| 5 | `SPLIT_TABLE_FIELD_SETS` | only if columns have different lifecycles (a link that pseudonymises vs facts that are retained); each set is explicit columns or `remaining_columns` | *overlapping/missing fields* |
| 6 | `LIFECYCLE_REGISTRY` | one `row(...)` per (row class × field set) with scope, owner, export, action, **retention rule**, executor, probe | closure + `retention-clocks` bijection |
| 7 | `RetentionRule` / `RETENTION_CLOCKS` | a new rule only if no existing clock fits; every rule has exactly one clock (compile-closed) | typecheck |
| 8 | `RETENTION_MEASURES` | one measure per receiver-executed entry: the column the clock measures from, precondition, effect | `assertRetentionClockClosure` |
| 9 | `FINAL_SCHEMA_FOREIGN_KEYS` | every FK with its lifecycle role; a **retained** table's link is `restrict` + `retention_restrict`, never `cascade` (a cascade to the row being erased contradicts a retention clock — Task 6) | *classified final-schema foreign key mismatch* |
| 10 | `LIFECYCLE_WRITER_INVENTORY` | owner file + every physical writer file | `tests/table-writers.test.ts`, `validatePhysicalWriterClosure` |
| 11 | `tests/table-writers.test.ts` `TABLES` + `EXPECTED` | the table and each `file::verb` writer with its reason (an upsert is `insert` **and** `onConflictDoUpdate`) | that test |
| 12 | `JSON_PATH_INVENTORY` / `JSON_COLUMN_INVENTORY` | any jsonb column, classified | *unclassified migration JSON column* |
| 13 | executor / probe | usually the existing `expiry_receiver` / `expiry_residue`; a new executor needs an implementation in `LIFECYCLE_EXECUTORS` and a probe in `LIFECYCLE_PROBES` | `assertProbeClosure`, `assertExecutorProbeAgreement` |
| 14 | populated fixture | a row of every class in `deletion-executor.test.ts`'s populated erasure, so the scope walk proves it erases / survives / pseudonymises as registered | that suite |

If the table is reached by `app/**`, the same change also updates the
`@respin/db` allowlist in `eslint.config.mjs` (for a new facade name), and any
new page or `use server` module goes on `tests/gate-completeness.test.ts`'s
fixture (or `SESSION_FREE_API_ROUTES`, with the mechanism that gates it).

## What the checklist does not do

It cannot decide the retention period — that is R-122 or a new decision — and
it cannot make a row content-free. It proves the table is *classified*; whether
the classification is right is the reviewer gate's question.

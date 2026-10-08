// THE TEST FILES THAT OPEN CONNECTIONS TO THE REAL POSTGRES SERVER when
// `TEST_DATABASE_URL` is set — a LIST, not a producer (CLAUDE.md Respin rule
// 7). `vitest.config.ts` runs these in small sequential groups after the
// PGlite suites; `tests/real-postgres-suites.test.ts` asserts this list equals
// every test file that calls `createDockerTestDb(`, so a new real-Postgres
// suite is a list edit here, never an automatic (or a silent) inclusion.
//
// WHY THE GROUPING EXISTS (audit Phase 3, coordinator item 1, 2026-10-06).
// Vitest's default worker count on this machine is 21. The live suite used to
// start every one of these files at once beside the PGlite suites: each opens
// a `pg.Pool` of up to 20 connections (`createDockerTestDb`), the pg-boss suite
// adds its own pools, and the docker server allows 100 connections. The
// result was intermittent "sorry, too many clients already" in whichever
// suites lost the race, beforeAll/afterAll hook timeouts behind them, and the
// CPU load that pushes a PGlite-blocked worker past birpc's hard 60 s
// `onTaskUpdate` timeout (the `Errors 1` / exit 1 with every test passing that
// `vitest.config.ts` records).
//
// Paths are workspace-relative with forward slashes.
export const REAL_POSTGRES_SUITES = [
  "packages/config/tests/migrate-config.docker.test.ts",
  "packages/credits/tests/auto-topup-race.docker.test.ts",
  // Audit Phase 8 (P8-R1/P8-A2): the render path under a held money lock.
  "packages/credits/tests/balance-contention.docker.test.ts",
  "packages/credits/tests/concurrency.docker.test.ts",
  "packages/credits/tests/free-mint.docker.test.ts",
  "packages/credits/tests/generate-race.docker.test.ts",
  "packages/credits/tests/inference-race.docker.test.ts",
  // Audit Phase 8 (P8-A1): the one lock order under four-way contention.
  "packages/credits/tests/lock-order.docker.test.ts",
  "packages/credits/tests/pasted-reference.docker.test.ts",
  "packages/credits/tests/profiles.docker.test.ts",
  // Not named `.docker.`: a PGlite half and a real-Postgres half in one file.
  "packages/credits/tests/saved-generation.test.ts",
  "packages/db/tests/activate.docker.test.ts",
  "packages/db/tests/auth-mail-quota.docker.test.ts",
  "packages/db/tests/brain-concurrency.docker.test.ts",
  "packages/db/tests/concurrency.docker.test.ts",
  "packages/db/tests/creative-work.test.ts",
  "packages/db/tests/deletion-executor.docker.test.ts",
  "packages/db/tests/deletion-recovery-concurrency.docker.test.ts",
  "packages/db/tests/frameworks-concurrency.docker.test.ts",
  "packages/db/tests/generation-schema.docker.test.ts",
  "packages/db/tests/included-build-backfill.docker.test.ts",
  "packages/db/tests/interview-ops.docker.test.ts",
  "packages/db/tests/promotion-concurrency.docker.test.ts",
  "packages/db/tests/promotion-migration.docker.test.ts",
  "packages/db/tests/public-sample-spin.docker.test.ts",
  "packages/db/tests/spend-rollup.docker.test.ts",
  "tests/pg-boss.docker.test.ts",
  // Audit Phase 8 (P8-A3): /studio renders while Stripe holds the locks.
  "tests/render-under-stripe-lock.docker.test.ts",
  "tests/restore-drill-content.docker.test.ts",
  "tests/saved-pack-action.docker.test.tsx",
  "tests/studio-piece-action.docker.test.ts",
] as const;

/**
 * Files whose text matches `createDockerTestDb(` and that open NO connection,
 * each with its reason.
 */
export const REAL_POSTGRES_EXEMPT: Readonly<Record<string, string>> = {
  "packages/db/tests/db.test.ts": "drives createDockerTestDb's name guard, which refuses before connecting",
  "tests/real-postgres-suites.test.ts": "the population test itself — its planted fixture strings name the harness",
};

/**
 * How many real-Postgres files run at once. Each `createDockerTestDb` pool is
 * `max: 20` (some suites race 20-40 statements, so the pool is not narrowed),
 * so three files are at most 60 connections, plus the pg-boss suite's own
 * pools (`POOL_MAX` 2 and the runtime's queue pool of 2), the run-slot pools
 * two suites open (1-2), and one maintenance client per `createDockerTestDb`
 * — inside the docker server's `max_connections` of 100, which also holds the
 * server's own background connections (6 measured idle on 2026-10-06).
 */
export const REAL_POSTGRES_FILES_PER_GROUP = 3;

import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "packages/**/tests/**/*.test.ts"],

    // BOTH raised 30s -> 60s when migration 0012 landed (M2b-1).
    //
    // THIS IS A COST FACT, NOT A HANG, and the number comes from a measurement
    // rather than from doubling until green: one `createTestDb()` costs ~3s
    // cold on this machine (twelve migrations applied to a fresh PGlite), most
    // suites pay that in `beforeEach` rather than `beforeAll`, and vitest runs
    // 41 files in parallel. Observed worst case under full load was ~14s for a
    // test that takes ~3s alone, so 60s keeps real headroom over the ~4-5x
    // contention multiplier.
    //
    // Raising a timeout to silence a genuine hang would be the wrong move, so
    // the DISCRIMINATOR is recorded here for whoever hits this next. What was
    // observed: five failures across five different files, a DIFFERENT five on
    // each run, every one of them in setup or in a file's first test, never in
    // an assertion, and every one of those files green when run alone. That
    // pattern is contention. A test that fails ALONE, or fails on an
    // assertion, is a different problem and this comment does not license
    // stretching the timeout for it.
    //
    // The other lever is parallelism (`poolOptions`/`fileParallelism`), which
    // removes the contention instead of tolerating it, at the cost of wall
    // clock. Left alone deliberately: the suite is the CI gate and is already
    // slow, and capping threads would make every local run pay for a ceiling
    // only the full-suite run reaches.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

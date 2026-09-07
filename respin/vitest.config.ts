import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests receive only explicit process variables. Never probe developer-local
  // dotenv files: they are secrets, non-reproducible, and denied in sandboxes.
  envDir: false,
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.{ts,tsx}",
      "packages/**/tests/**/*.test.ts",
      "worker/tests/**/*.test.ts",
    ],

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
    // The other lever is parallelism, which removes the contention instead of
    // tolerating it, at the cost of wall clock. It was MEASURED AND REJECTED
    // — twice — and the numbers are in the `silent` comment below. There is
    // no `poolOptions` block in this file; an earlier version of this
    // paragraph pointed at one, which is a comment citing a key that does not
    // exist.
    testTimeout: 60_000,
    hookTimeout: 60_000,

    // `silent: "passed-only"` — added 2026-08-27 because the gate went RED with
    // every test passing, and KEPT after the cause was measured properly.
    //
    // SYMPTOM: `Test Files 48 passed`, `Tests 958 passed`, `Errors 1`, exit 1,
    // the error being `[vitest-worker]: Timeout calling "onTaskUpdate"`. That
    // is the reporter RPC timing out, not a test.
    //
    // WHAT THIS SETTING IS AND IS NOT. An earlier round recorded console volume
    // as THE cause on the strength of one green `--silent` run. It was not:
    // 44 more tests brought the same signature straight back. This setting
    // reduces RPC traffic, which is worth having; it is not the fix.
    //
    // THE MEASURED CAUSE (2026-08-27, instrumented on both sides of the RPC).
    // birpc gives a worker->main call a HARD 60s timeout — `DEFAULT_TIMEOUT =
    // 6e4` in node_modules/vitest/dist/chunks/index.B521nVV-.js — and vitest
    // 3.2.7 passes no `timeout` through, so there is NO config option and NO
    // env var that raises it. A worker blocked synchronously cannot pump the
    // message that answers its own in-flight `onTaskUpdate`, and its timer
    // fires ahead of the queued reply when the block ends. Sampling event-loop
    // lag on each side gave: MAIN thread never above ~2.9s; WORKER threads
    // blocked 23-31s, attributed to `tests/import-boundary.test.ts` running
    // `execFileSync("git", ["grep", ...])`. A synchronous child process stops
    // the whole thread. Those two call sites are now awaited, and the worst
    // observed worker block fell to ~10s — headroom to the 60s wall went from
    // about 2x to about 6x. `tests/import-boundary.test.ts` carries a scan that
    // forbids a synchronous child process anywhere under tests/, so this
    // cannot come back by someone reaching for the sync API again.
    //
    // PARALLELISM WAS MEASURED AND REJECTED, twice, so nobody re-tries it as a
    // guess: `maxThreads: 6` (before the fix) ran FASTER and still exited 1;
    // `VITEST_MAX_THREADS=8` (after the fix) took 183s against 127s at the
    // default and left the same 6-9s residual blocks. The residue is PGlite's
    // in-process WASM under contention, and fewer workers does not remove it.
    //
    // THE DISCRIMINATOR, so nobody widens this to hide a real failure: the
    // shape it addresses has ZERO failing tests and exactly one Errors line
    // naming an RPC method. A run with a failing test, or an unhandled error
    // from product code, is a different problem and this setting does not
    // license touching it.
    silent: "passed-only",
  },
});

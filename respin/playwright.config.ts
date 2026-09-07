// Playwright config for the Respin persona journeys (e2e/journeys/*.spec.ts).
// Real dev server, real Postgres, real Anthropic API — see e2e/journeys/README
// notes in the task brief. Single chromium project: cross-browser was not asked
// for, and these journeys already run one-by-one against shared local state.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/journeys",
  // Journeys share one dev server + one Postgres database and are run ONE AT A
  // TIME by design (persona 3 depends on persona 2's workspace) — never
  // parallelise within or across files.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Generation calls hit the real Anthropic API and can take up to ~60s; a
  // journey walks a whole persona through many such calls, so the per-test
  // timeout is generous rather than the global default.
  timeout: 10 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:8000",
    trace: "retain-on-failure",
    // Per-action timeout — a slow generation is awaited explicitly by the spec
    // (polling a result region), not by stretching every click/fill.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

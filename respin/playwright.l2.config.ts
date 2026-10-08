// Playwright config for launch L2's Free actual-app journey (E-26, E-30).
//
// SEPARATE FROM `playwright.config.ts` ON PURPOSE. The four Phase-2 persona
// journeys in `e2e/journeys/` run against a developer's dev server and the
// REAL provider (and `.github/workflows/respin-journeys.yml` keeps that
// real-key workflow unchanged, T-19). This journey starts its OWN Next.js dev
// server on its own port, against its own ISOLATED database
// (`respin_test_e2el2`, the test-database marker), with the provider's
// transport replaced below the origin pin by the transport-seam fake — which
// the server refuses to start with in a production build or against any other
// database (`runStartupPreflight`). No paid model run (E-30).
//
// Run from `respin/`, with the compose Postgres up:
//   TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin \
//     pnpm exec playwright test --config playwright.l2.config.ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 8010;
const maintenance = process.env.TEST_DATABASE_URL ?? "";
const isolated = (() => {
  if (maintenance === "") return "";
  const url = new URL(maintenance);
  url.pathname = "/respin_test_e2el2";
  return url.toString();
})();

export default defineConfig({
  testDir: "./e2e/l2",
  // Its own output directory, so the run's own cleanup never removes the fake's
  // call ledger (`test-results/l2-llm-fake-calls.json`, beside it).
  outputDir: "test-results/l2-playwright",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 5 * 60 * 1000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/l2/support/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 120_000,
  },
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: isolated,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      RESPIN_LLM_TRANSPORT: "e2e-transport-fake",
      RESPIN_LLM_FAKE_LEDGER: "test-results/l2-llm-fake-calls.json",
      // The fake reaches the server ONLY by preload; Node strips its types.
      NODE_OPTIONS: "--import ./e2e/support/llm-transport-fake.ts",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

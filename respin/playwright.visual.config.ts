import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";

const visualRunId = randomUUID();

export default defineConfig({
  testDir: "./e2e/visual",
  testMatch: "visual.spec.ts",
  outputDir: "../.tmp/respin-v2-results",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  metadata: { visualRunId },
  globalTeardown: "./e2e/visual/harness.ts",
  // Reduced motion is deliberately NOT set globally here.
  //
  // It used to be, which turned prefers-reduced-motion on for every check — and
  // app/respin-tokens.css answers that media query with `animation: none
  // !important; transition: none !important`. So every scored capture showed a
  // state the shipped product never renders by default, the landing animations
  // were never exercised, and the reduced-motion test re-emulated a mode
  // already globally on, leaving it with no contrast case and no way to fail
  // (phase-1 gate). It is emulated per test now, where it is the thing under
  // test.
  use: { baseURL: "http://127.0.0.1:8137", trace: "retain-on-failure" },
  webServer: {
    command: "node --import tsx e2e/visual/harness.ts",
    url: "http://127.0.0.1:8137",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { RESPIN_VISUAL_RUN_ID: visualRunId },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});

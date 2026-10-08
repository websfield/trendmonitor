// LAUNCH L4's FREE ACTUAL-APP CHECK OF THE SAVED RECORDING PACK (R-153; E-27,
// E-30). Same harness as `free-concept.spec.ts` — the real Next.js app, its own
// isolated database, the transport-seam fake — and the part of L4 a Free plan
// can reach without a paid tier (F-01 is parked until L5):
//
//   find concepts (one fake call) -> open the result's saved recording pack ->
//   read Script / Shooting plan / Checks and rationale -> copy and download
//   the Markdown pack by KEYBOARD -> mobile and desktop widths -> close the
//   browser context, sign in again, reopen it from /studio's saved list.
//
// THE PROPERTY: from the moment the draft exists, reopening, reloading,
// copying, downloading and reopening after a new sign-in add ZERO fake-
// transport calls, ZERO debits and ZERO claims. The paid generate -> revise ->
// select walk is `e2e/journeys/recording-pack.spec.ts`, which runs first at
// L6 LA-2.
//
// COUNTS ARE DELTAS: the fake's call ledger is shared with
// `free-concept.spec.ts` in this config, so this spec never asserts an
// absolute length.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

import { freshIdentity, signIn, signUp } from "../support/auth";
import { claimCount, debitCount, seedActivatedBrain, servedModels } from "./support/isolated-db";

const FAKE_SERVED_MODEL = "respin-e2e-transport-fake";
const FAKE_LEDGER = "test-results/l2-llm-fake-calls.json";
const fakeCallCount = (): number => (JSON.parse(readFileSync(FAKE_LEDGER, "utf8")) as unknown[]).length;

async function expectPack(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1, name: "Recording pack" })).toBeVisible();
  await expect(page.getByTestId("saved-script")).toBeVisible();
  await expect(page.getByTestId("saved-shooting-plan")).toBeVisible();
  await expect(page.getByTestId("saved-checks")).toBeVisible();
  await expect(page.getByTestId("saved-read-free")).toContainText("costs nothing and calls no model");
  // The product's disclosure guidance, never the model's own advice.
  await expect(page.getByTestId("saved-disclosure")).toContainText("Before you post, check the platform's current rules");
  await expect(page.getByTestId("saved-checks")).not.toContainText("made with the help of an assistant");
}

test("Free: a stored concept batch reopens as a recording pack — copy and export by keyboard, both widths, and again after a fresh sign-in, with no call, debit or claim", async ({ page, browser }) => {
  const identity = freshIdentity("l4saved");
  await signUp(page, identity);
  await page.getByLabel("Creator name").fill("Riley L4");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Riley L4" })).toBeVisible({ timeout: 30_000 });
  seedActivatedBrain(identity.email);

  // 1. ONE DRAFT, through the real action and the fake.
  const callsBefore = fakeCallCount();
  await page.goto("/studio");
  await page.getByTestId("studio-entrance-find").getByRole("button", { name: "Find concepts" }).click();
  await expect(page.getByTestId("studio-choose-concept")).toHaveCount(3, { timeout: 120_000 });
  expect(fakeCallCount() - callsBefore).toBe(1);
  expect(servedModels(identity.email)).toEqual([FAKE_SERVED_MODEL]);
  const debits = debitCount(identity.email);
  const claims = claimCount(identity.email);
  const calls = fakeCallCount();
  const unchanged = () => {
    expect(debitCount(identity.email)).toBe(debits);
    expect(claimCount(identity.email)).toBe(claims);
    expect(fakeCallCount()).toBe(calls);
  };

  // 2. THE FINISHED DRAFT LINKS TO ITS SAVED PACK.
  const link = page.getByTestId("studio-entrance-find").getByTestId("studio-saved-pack-link").getByRole("link");
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/studio\/saved\//, { timeout: 60_000 });
  const savedUrl = page.url();
  await expectPack(page);
  unchanged();

  // 3. RELOAD — the same version, nothing moved.
  await page.reload();
  await expectPack(page);
  unchanged();

  // 4. COPY AND DOWNLOAD, BY KEYBOARD. The outcome lands in the persistent
  // status region either way (a refused clipboard says so).
  const copy = page.getByTestId("saved-copy-script");
  await copy.focus();
  await expect(copy).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("saved-pack-status")).toHaveText(
    /The script and its open checks were copied\.|Your browser did not allow copying/
  );
  const downloadButton = page.getByTestId("saved-download-pack");
  await downloadButton.focus();
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
  expect(download.suggestedFilename()).toMatch(/^respin-recording-pack-[A-Za-z0-9-]+\.md$/);
  const exported = readFileSync(await download.path(), "utf8");
  expect(exported).toContain("## Checks before you film");
  expect(exported).toContain("## Disclosure");
  expect(exported).toContain("Weakest point:");
  expect(exported).not.toContain("made with the help of an assistant");
  await expect(page.getByTestId("saved-pack-status")).toHaveText("The Markdown recording pack was downloaded.");
  // The fallback text holds the same pack the file does.
  await expect(page.getByTestId("saved-pack-text")).toHaveValue(exported);
  unchanged();

  // 5. MOBILE AND DESKTOP: one projection — stacked at 390px, side by side wide.
  await page.setViewportSize({ width: 390, height: 844 });
  await expectPack(page);
  const narrow = { script: await page.getByTestId("saved-script").boundingBox(), plan: await page.getByTestId("saved-shooting-plan").boundingBox() };
  expect(narrow.plan!.y).toBeGreaterThan(narrow.script!.y + narrow.script!.height - 1);
  await page.setViewportSize({ width: 1280, height: 900 });
  const wide = { script: await page.getByTestId("saved-script").boundingBox(), plan: await page.getByTestId("saved-shooting-plan").boundingBox() };
  expect(Math.abs(wide.plan!.y - wide.script!.y)).toBeLessThan(2);
  expect(wide.plan!.x).toBeGreaterThan(wide.script!.x);
  unchanged();

  // 6. CLOSE THE CONTEXT, SIGN IN AGAIN, REOPEN FROM /studio's SAVED LIST.
  await page.context().close();
  const fresh = await browser.newContext();
  const again = await fresh.newPage();
  await signIn(again, identity);
  const recent = again.getByTestId("studio-recent-packs");
  await expect(recent).toBeVisible();
  await recent.getByRole("link").first().click();
  await again.waitForURL(/\/studio\/saved\//, { timeout: 60_000 });
  expect(again.url()).toBe(savedUrl);
  await expectPack(again);
  unchanged();
  await fresh.close();
});

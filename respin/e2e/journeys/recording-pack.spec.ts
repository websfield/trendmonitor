// LAUNCH L4's PAID RECORDING-PACK WALK (R-153) — WRITTEN AT L4, RUN FIRST AT
// L6 LA-2 (plan amendment E-27/E-28, owner decision H-2 option C).
//
// Generate a script -> revise it (a fixed preset, priced as a revision and
// disclosed before the press) -> use the revision -> close the browser
// context -> sign in again -> reopen and export the EXACT selected version, at
// a phone width and a desktop width — with zero calls, debits and claims for
// the reopen and the export.
//
// WHY IT IS SKIPPED NOW, LOUDLY. Every press here after "find concepts" needs a
// PAID tier (`ideaToScript` and its revision are paid-only), and the one
// sanctioned producer of a paid tier is the parked F-01 (journey-fixes P3),
// unparked at L5. L4 proves the same walk at the action level on real
// Postgres instead (`tests/saved-pack-action.docker.test.tsx`), and the Free
// part of the page in the browser (`e2e/l2/saved-pack.spec.ts`). Remove the
// skip at L6 LA-2, once F-01 produces the tier, and run it against the
// transport-seam fake (E-30) or the LR-EVAL-1 budget, as L6 decides.
//
// The Phase-2 persona journeys in this directory, and their real-key workflow,
// do not run this walk: it is skipped with the reason below, which Playwright
// reports on every run.
import { expect, test } from "@playwright/test";

import { freshIdentity, signIn, signUp } from "../support/auth";

const SKIP_REASON =
  "L4 recording pack: the paid generate -> revise -> select -> reopen/export walk runs first at L6 LA-2 — it needs a paid tier, whose only sanctioned producer (F-01) stays parked until L5 (owner decision H-2 option C, plan amendment E-27).";

test.describe("recording pack: the paid walk (L6 LA-2)", () => {
  test.skip(true, SKIP_REASON);

  test("generate -> revise -> use this version -> sign in again -> reopen and export the exact version, phone and desktop", async ({ page, browser }) => {
    const identity = freshIdentity("l4pack");
    await signUp(page, identity);
    await page.getByLabel("Creator name").fill("Riley L4 paid");
    await page.getByRole("button", { name: "Create profile" }).click();
    await expect(page.getByRole("heading", { name: "Riley L4 paid" })).toBeVisible({ timeout: 30_000 });
    // PRECONDITION (L6): an activated brain and a PAID tier from F-01's producer.

    // 1. Find concepts, choose one, confirm the script at its displayed price.
    await page.goto("/studio");
    await page.getByTestId("studio-entrance-find").getByRole("button", { name: "Find concepts" }).click();
    const choices = page.getByTestId("studio-choose-concept");
    await expect(choices).toHaveCount(3, { timeout: 120_000 });
    await choices.first().click();
    await page.waitForURL(/\/studio\?piece=/, { timeout: 60_000 });
    await page.getByTestId("studio-piece-commission").getByRole("button").click();
    const scriptLink = page.getByTestId("studio-piece-confirmation").getByTestId("studio-saved-pack-link").getByRole("link");
    await expect(scriptLink).toBeVisible({ timeout: 180_000 });
    await scriptLink.click();
    await page.waitForURL(/\/studio\/saved\//, { timeout: 60_000 });
    const originalUrl = page.url();

    // 2. Revise: the configured price and the parent are stated before the press.
    await expect(page.getByTestId("saved-revise-cost")).toContainText("A revision currently costs");
    await page.getByTestId("saved-revise-shorter").click();
    const newVersion = page.getByTestId("saved-revise-status").getByRole("link", { name: "Open the new version" });
    await expect(newVersion).toBeVisible({ timeout: 180_000 });
    await newVersion.click();
    await page.waitForURL(/\/studio\/saved\//, { timeout: 60_000 });
    expect(page.url()).not.toBe(originalUrl);
    const revisedUrl = page.url();

    // 3. Use this version — zero cost; focus lands on the status line.
    await page.getByTestId("saved-select-form").getByRole("button", { name: "Use this version" }).click();
    await page.waitForURL(/selected=1/, { timeout: 60_000 });
    await expect(page.getByTestId("saved-selected-status")).toBeFocused();
    await expect(page.getByTestId("saved-selection")).toContainText("This is the version your piece uses.");
    const exportedBefore = await page.getByTestId("saved-pack-text").inputValue();

    // 4. Close the context, sign in again, reopen from /studio's saved list.
    await page.context().close();
    const fresh = await browser.newContext();
    const again = await fresh.newPage();
    await signIn(again, identity);
    await again.goto(revisedUrl.replace(/\?.*$/, ""));
    await expect(again.getByTestId("saved-selection")).toContainText("This is the version your piece uses.");
    await expect(again.getByTestId("saved-pack-text")).toHaveValue(exportedBefore);

    // 5. Phone and desktop read the same version.
    for (const width of [390, 1280]) {
      await again.setViewportSize({ width, height: 900 });
      await expect(again.getByTestId("saved-shot-checklist")).toBeVisible();
      await expect(again.getByTestId("saved-pack-text")).toHaveValue(exportedBefore);
    }
    await fresh.close();
  });
});

// LAUNCH L2's FREE ACTUAL-APP JOURNEY (E-26, owner decision H-2 option C;
// E-30 transport-seam fake). On the real Next.js app, an isolated database and
// the fake transport:
//
//   no concept -> three options (`ideation`) -> choose one (ZERO cost; the
//   choice and its operation-id attribute survive a reload) -> the
//   confirmation shows the configured script price AND the named plan block,
//   with NO debit and the fake's call count unchanged -> the reference-only
//   entrance is visibly withheld on Free -> cancel the piece (zero cost).
//
// FOCUS (L2 code gate, WCAG 2.4.3): this is the one harness with a real focus
// model, so it is where "choose lands focus on the confirmation heading" and
// "cancel lands focus on the status line" are witnessed.
//
// THE SENTINEL: every usage row this journey causes must carry the fake's
// served model. A selector that was misspelt or ignored would have reached the
// real provider (and failed here) instead of passing while spending money.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { freshIdentity, signUp } from "../support/auth";
import {
  claimCount,
  debitCount,
  seedActivatedBrain,
  servedModels,
} from "./support/isolated-db";

const FAKE_SERVED_MODEL = "respin-e2e-transport-fake";
const FAKE_LEDGER = "test-results/l2-llm-fake-calls.json";
const fakeCalls = (): { kind: string }[] => JSON.parse(readFileSync(FAKE_LEDGER, "utf8"));

test("Free: find concepts, choose one at zero cost, see the price and the plan block — no debit, no further call; focus follows each redirect", async ({ page }) => {
  const identity = freshIdentity("l2free");
  await signUp(page, identity);
  await page.getByLabel("Creator name").fill("Riley L2");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Riley L2" })).toBeVisible({ timeout: 30_000 });
  seedActivatedBrain(identity.email);

  // 1. NO CONCEPT -> THREE OPTIONS, through the real action and the fake.
  await page.goto("/studio");
  const find = page.getByTestId("studio-entrance-find");
  await expect(find).toBeVisible();
  // The configured price is stated beside the press (B-5).
  await expect(page.getByTestId("studio-find-cost")).toContainText("Finding concepts costs");
  await find.getByRole("button", { name: "Find concepts" }).click();
  const choices = page.getByTestId("studio-choose-concept");
  await expect(choices).toHaveCount(3, { timeout: 120_000 });
  expect(fakeCalls().map((c) => c.kind)).toEqual(["generation"]);
  expect(servedModels(identity.email)).toEqual([FAKE_SERVED_MODEL]);
  const debitsAfterIdeas = debitCount(identity.email);
  const claimsAfterIdeas = claimCount(identity.email);

  // 2. CHOOSE — zero cost; the action lands on the piece's own page.
  await choices.nth(1).click();
  await page.waitForURL(/\/studio\?piece=/, { timeout: 60_000 });
  const confirmation = page.getByTestId("studio-piece-confirmation");
  await expect(confirmation).toBeVisible();
  // FOCUS MOVED to the confirmation the press produced, not left below it.
  await expect(page.locator("#studio-piece-heading")).toBeFocused();
  const operationId = await confirmation.getAttribute("data-operation-id");
  expect(operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

  // 3. THE CONFIRMATION ON FREE: the configured price and the named plan block,
  // and no paid press at all.
  await expect(page.getByTestId("studio-piece-quote")).toContainText("Writing this script costs");
  await expect(page.getByTestId("studio-piece-plan-block")).toBeVisible();
  await expect(page.getByTestId("studio-piece-commission")).toHaveCount(0);

  // 4. RELOAD — the choice and its operation id survive; nothing moved.
  await page.reload();
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveAttribute("data-operation-id", operationId!);
  await expect(page.getByTestId("studio-piece-plan-block")).toBeVisible();
  expect(debitCount(identity.email)).toBe(debitsAfterIdeas);
  expect(claimCount(identity.email)).toBe(claimsAfterIdeas);
  expect(fakeCalls()).toHaveLength(1);

  // 5. THE REFERENCE-ONLY ENTRANCE is visibly withheld on Free.
  await expect(page.getByTestId("studio-entrance-reference-blocked")).toBeVisible();
  await expect(page.getByTestId("studio-entrance-reference").getByRole("link")).toHaveCount(0);

  // 6. CANCEL — zero cost; focus lands on the status line, not on <body>.
  await page.getByTestId("studio-piece-cancel").getByRole("button").click();
  await page.waitForURL(/\/studio\?cancelled=1/, { timeout: 60_000 });
  const cancelled = page.getByTestId("studio-piece-cancelled");
  await expect(cancelled).toBeVisible();
  await expect(cancelled).toBeFocused();
  await expect(page.getByTestId("studio-piece-confirmation")).toHaveCount(0);
  expect(debitCount(identity.email)).toBe(debitsAfterIdeas);
  expect(fakeCalls()).toHaveLength(1);
});

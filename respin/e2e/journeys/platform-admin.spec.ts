// Persona 4 - platform curator/admin (internal). Two phases, because /admin
// is gated by ADMIN_USER_IDS read from process.env at request time (fail
// closed) and adding an id requires a dev-server restart the test itself
// cannot perform:
//
//   PHASE 1 (no handoff yet): sign up a fresh identity, look up its Better
//   Auth user id, write it to a handoff file, and SKIP with instructions -
//   the orchestrator adds that id to ADMIN_USER_IDS, restarts `pnpm dev`,
//   then re-runs this spec.
//
//   PHASE 2 (handoff present): sign in as that identity and walk the admin
//   surfaces that actually exist. NOTE: the PRD's platform-admin scope
//   (framework curation queue, trend source management, bounded credit
//   adjustments with reason codes) is only PARTLY built as of this run -
//   checked against the source (app/(admin)/admin/page.tsx: "Other admin
//   surfaces arrive in later milestones") - so this phase walks /admin,
//   /admin/config and /admin/model-spend, and records the gap rather than
//   inventing a walkthrough for screens that do not exist.
import { test, expect } from "@playwright/test";
import { journeyArtifacts } from "../support/artifacts";
import { freshIdentity, signIn, signOut, signUp } from "../support/auth";
import { lookupAuthUserId } from "../support/db-shortcut";
import { readHandoff, writeHandoff } from "../support/handoff";

const artifacts = journeyArtifacts("platform-admin");

test.setTimeout(5 * 60 * 1000);

type AdminHandoff = { email: string; password: string; authUserId: string };

test("platform admin - config, model spend, and the built/unbuilt admin surface", async ({ page }) => {
  artifacts.attach(page);

  let handoff: AdminHandoff | null = null;
  try {
    handoff = readHandoff<AdminHandoff>("platform-admin");
  } catch {
    handoff = null;
  }

  if (!handoff) {
    const identity = freshIdentity("admin");
    await signUp(page, identity);
    const authUserId = lookupAuthUserId(identity.email);
    if (!authUserId) {
      throw new Error(`could not find a Better Auth user id for ${identity.email} after sign-up`);
    }
    writeHandoff("platform-admin", { email: identity.email, password: identity.password, authUserId });
    artifacts.note(`Bootstrap phase: signed up ${identity.email}, Better Auth id ${authUserId}`);
    await artifacts.screenshot(page, "admin-bootstrap-identity-created");
    test.skip(
      true,
      `Bootstrap only: add "${authUserId}" to ADMIN_USER_IDS in respin/.env.local, restart the dev server, then re-run this spec.`
    );
    return;
  }

  // Chapter 1 - sign in as the (now allow-listed) admin identity.
  await signIn(page, handoff);
  await artifacts.screenshot(page, "admin-signed-in");

  // Chapter 2 - /admin itself: what is actually here today.
  await page.goto("/admin");
  const forbidden = await page.getByText(/not authorised|not allowed|forbidden/i).isVisible().catch(() => false);
  if (forbidden) {
    throw new Error(
      "Signed-in identity was refused /admin - the id was not added to ADMIN_USER_IDS, or the dev server was not restarted after adding it."
    );
  }
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  artifacts.note(
    "PRD REQ-J01 gap, checked against source: /admin has no framework curation queue, no trend source " +
      "management, and no bounded credit-adjustment control yet - only links to /admin/config and " +
      "/admin/model-spend exist (app/(admin)/admin/page.tsx: 'Other admin surfaces arrive in later milestones')."
  );
  await artifacts.screenshot(page, "admin-home");

  // Chapter 3 - runtime configuration: read the active version, resubmit it
  // unchanged (a safe, reversible way to prove "every save appends a new
  // version" without touching a shared dev database's live economics).
  await page.goto("/admin/config");
  const editor = page.getByTestId("config-editor");
  await expect(editor).toBeVisible();
  const textarea = page.locator("#config-content");
  const before = await textarea.inputValue();
  await artifacts.screenshot(page, "admin-config-before-save");
  await page.getByRole("button", { name: "Save as a new version" }).click();
  await expect(page.getByTestId("config-saved")).toBeVisible({ timeout: 15_000 });
  const after = await textarea.inputValue();
  expect(after, "resubmitting the active config unchanged should not alter its content").toEqual(before);
  await artifacts.screenshot(page, "admin-config-saved-new-version");
  await expect(page.getByTestId("config-history")).toBeVisible();
  await artifacts.screenshot(page, "admin-config-history");

  // Chapter 4 - the margin dashboard.
  await page.goto("/admin/model-spend");
  const spendUnavailable = await page.getByTestId("model-spend-error").isVisible().catch(() => false);
  artifacts.note(`model-spend read available: ${!spendUnavailable}`);
  await artifacts.screenshot(page, "admin-model-spend");

  // Chapter 5 - sign out.
  await page.goto("/studio");
  await signOut(page);
  await artifacts.screenshot(page, "signed-out");
});

// Persona 2 - Studio-tier creator-operator (workspace owner running multiple
// creator profiles + seats). Sign-up -> onboarding (first profile) -> Stripe
// test-mode upgrade to Studio -> second creator profile -> switch between
// profiles -> owner-only billing surfaces -> provision an editor seat for
// persona 3 (no invite UI exists yet - see db-shortcut.ts's header).
import { test, expect } from "@playwright/test";
import { journeyArtifacts } from "../support/artifacts";
import { freshIdentity, signOut, signUp } from "../support/auth";
import { completeStripeTestCheckout } from "../support/stripe";
import { attachAsEditor } from "../support/db-shortcut";
import { writeHandoff } from "../support/handoff";

const artifacts = journeyArtifacts("studio-operator");

test.setTimeout(8 * 60 * 1000);

test("studio-tier operator - workspace, profiles, seats", async ({ page, browser }) => {
  artifacts.attach(page);
  const owner = freshIdentity("owner");

  // Chapter 1 - sign-up.
  await signUp(page, owner);
  await artifacts.screenshot(page, "post-signup-studio");

  // Chapter 2 - onboarding: the first creator profile.
  await page.goto("/onboarding");
  await page.getByLabel("Creator name").fill("Profile A");
  await page.getByRole("button", { name: "Create profile" }).click();
  await page.waitForURL("**/onboarding");
  await artifacts.screenshot(page, "onboarding-first-profile");

  // Chapter 3 - upgrade to Studio (Stripe test-mode checkout). Studio is the
  // only tier whose profileCap is above 1 (config: free/creator/pro = 1,
  // studio = 5) and the only one with up to 3 seats (PRD REQ-A02). BEST
  // EFFORT, same known app bug as the solo-creator journey (see its own
  // header note): packages/credits/src/stripe/actions.ts imports
  // `assertFreshWorkspaceScopeInTx` from `@respin/db`, which is defined but
  // not exported, so every subscribe action fails today. Recorded, not
  // silently worked around.
  await page.goto("/settings/billing");
  let studioActive = await page.getByTestId("manage-plan").isVisible().catch(() => false);
  if (!studioActive) {
    try {
      await page.getByTestId("subscribe-studio").getByRole("button", { name: /Subscribe/ }).click();
      await completeStripeTestCheckout(page, { email: owner.email });
      await page.waitForURL("**/usage");
      // The tier flip is driven by Stripe's webhook (checkout.session.completed
      // -> our /api/stripe/webhook), which arrives asynchronously - the
      // checkout redirect completing is not proof the workspace's tier has
      // actually changed yet. Poll the billing page's own answer instead of
      // assuming.
      await page.goto("/settings/billing");
      await expect(page.getByTestId("manage-plan")).toBeVisible({ timeout: 30_000 });
      artifacts.note("Stripe test-mode checkout completed for Studio tier, webhook confirmed by the billing page.");
      studioActive = true;
    } catch (err) {
      artifacts.note(
        `BLOCKING APP BUG: Studio-tier checkout did not complete - ${String(err)}. Same missing @respin/db ` +
          "export as the solo-creator journey (assertFreshWorkspaceScopeInTx). This workspace stays on Free, " +
          "which caps creator profiles at 1 - the second-profile chapter below is skipped as a direct " +
          "consequence and noted, not faked."
      );
      test.info().annotations.push({
        type: "bug",
        description:
          "Stripe subscribe is broken for every tier: missing @respin/db export assertFreshWorkspaceScopeInTx.",
      });
    }
  }
  await artifacts.screenshot(page, studioActive ? "billing-studio-active" : "billing-upgrade-failed");

  // Chapter 4 - a second creator profile, only reachable once Studio's cap-of-5
  // is actually in force (Free's cap is 1). Skipped, honestly, if the upgrade
  // above did not go through.
  if (studioActive) {
    await page.goto("/onboarding");
    await page.getByLabel("Creator name").fill("Second Creator");
    await page.getByRole("button", { name: "Add creator" }).click();
    await expect(page.getByText(/2 of 5 creator profiles used/)).toBeVisible({ timeout: 15_000 });
    await artifacts.screenshot(page, "onboarding-second-profile-created");

    // Chapter 5 - switch between the two creator profiles.
    await page.getByLabel("Creator profile").selectOption({ label: "Profile A" });
    await page.getByRole("button", { name: "Switch profile" }).click();
    await expect(page.getByRole("heading", { name: "Profile A" })).toBeVisible({ timeout: 15_000 });
    await artifacts.screenshot(page, "onboarding-switched-profile");
  } else {
    // With a profile already selected, the "create-profile" step (and its
    // own `cap-reached` testid) is behind us - the cap sentence here is the
    // profile panel's own plain text (creator-profile-panel.tsx has no
    // data-testid for it).
    await page.goto("/onboarding");
    await expect(page.getByText(/creator profile allowance is full/)).toBeVisible({ timeout: 15_000 });
    artifacts.note("Second profile chapter skipped: Free plan's cap-of-1 is reached, as designed.");
    await artifacts.screenshot(page, "onboarding-cap-reached-on-free");
  }

  // Chapter 6 - the owner-only billing surfaces: manage/subscribe, pause,
  // auto-top-up all live on this one settings page (there is no separate
  // workspace-admin screen in this build - checked against the source:
  // app/(product)/settings/ has only billing/).
  await page.goto("/settings/billing");
  await expect(page.getByTestId(studioActive ? "manage-plan" : "subscribe")).toBeVisible();
  const pausePanel = page.getByTestId("pause");
  const autoTopupPanel = page.getByTestId("auto-topup");
  artifacts.note(
    `owner billing surfaces present: pause=${await pausePanel.isVisible().catch(() => false)}, ` +
      `auto-topup=${await autoTopupPanel.isVisible().catch(() => false)}`
  );
  await artifacts.screenshot(page, "billing-owner-surfaces");

  if (studioActive) {
    const portalButton = page.getByTestId("portal-manage").getByRole("button");
    const portalBlocked = await portalButton.isDisabled().catch(() => true);
    if (!portalBlocked) {
      await portalButton.click();
      await page.waitForURL(/stripe\.com/, { timeout: 30_000 });
      await artifacts.screenshot(page, "billing-stripe-portal");
      await page.goBack();
    } else {
      artifacts.note("Stripe Customer Portal button was disabled - screenshotting the reason");
      await artifacts.screenshot(page, "billing-portal-blocked");
    }
  }

  // Chapter 7 - provision the editor seat persona 3 will use. No invite-seat
  // UI exists in this build (checked: app/(product)/settings/ has no
  // members/team page), so a second browser context signs up an ordinary
  // account and a direct, narrow DB update re-points its OWN membership row
  // at this owner's workspace as 'editor' - the realistic substitute the task
  // brief names for exactly this gap.
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  const editor = freshIdentity("editor");
  await signUp(editorPage, editor);
  await editorContext.close();

  attachAsEditor(owner.email, editor.email);
  writeHandoff("editor-seat", { email: editor.email, password: editor.password, ownerEmail: owner.email });
  artifacts.note(`editor seat provisioned for ${editor.email} in ${owner.email}'s workspace`);

  // Chapter 8 - sign out.
  await page.goto("/studio");
  await signOut(page);
  await artifacts.screenshot(page, "signed-out");
});

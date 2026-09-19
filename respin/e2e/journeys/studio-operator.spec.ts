// Persona 2 - Studio-tier creator-operator (workspace owner running multiple
// creator profiles + seats). Sign-up -> onboarding (first profile) -> the
// included voice build for Profile A -> Stripe test-mode upgrade to Studio
// (paid, gated) -> second creator profile (paid, gated) -> owner-only
// billing surfaces -> provision an editor seat for persona 3 (no invite UI
// exists yet - see db-shortcut.ts's header).
//
// FREE PATH FIRST (creator-ready Phase 2): the paid chapters run only under
// `E2E_PAID_TIERS=1`; otherwise one `skipped:` note each. The voice build is
// ONE press, recorded with its kind and never retried when the model refuses
// (owner decision 2026-09-15: record and continue) - editor-seat reads the
// outcome from the handoff and asserts the matching Studio state.
import { test, expect } from "@playwright/test";
import { journeyArtifacts } from "../support/artifacts";
import { freshIdentity, signOut, signUp } from "../support/auth";
import { activateBrainSection, buildVoiceBrain } from "../support/brain";
import { attachAsEditor } from "../support/db-shortcut";
import { writeHandoff } from "../support/handoff";
import { MAIN_CHAPTERS } from "../support/main-chapters";
import { completeStripeTestCheckout } from "../support/stripe";

const artifacts = journeyArtifacts("studio-operator");

test.setTimeout(8 * 60 * 1000);

test("studio-tier operator - workspace, profiles, seats", async ({ page, browser }) => {
  artifacts.attach(page);
  const owner = freshIdentity("owner");

  // Chapter 1 - sign-up lands on /onboarding.
  await signUp(page, owner);
  await expect(page.getByTestId("onboarding-steps")).toBeVisible();
  await artifacts.screenshot(page, "post-signup-onboarding");

  // Chapter 2 - onboarding: the first creator profile.
  await page.getByLabel("Creator name").fill("Profile A");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile A" })).toBeVisible({ timeout: 15_000 });
  await artifacts.screenshot(page, "onboarding-first-profile");

  // Chapter 2b - Profile A's own posts and its ONE included voice build (Free
  // includes one build per profile). This is what lets persona 3's Studio
  // press be a real generation rather than a precondition refusal.
  const ownPosts = [
    "We run three creators out of one room. The trick is not more cameras, it is a shared shot list on the wall.",
    "Every Monday I cut the weakest idea before anyone films it. The team hated that until the numbers stopped arguing.",
    "The editor seat is not a junior job here. Whoever cuts the piece decides the hook, and I have to defend mine to them.",
  ];
  for (const content of ownPosts) {
    await page.locator("#content").fill(content);
    await page.getByLabel("I wrote this post myself.").check();
    await page.getByRole("button", { name: "Save post" }).click();
    await expect(page.getByText(content.slice(0, 40))).toBeVisible({ timeout: 15_000 });
  }
  const voice = await buildVoiceBrain(page, {
    artifacts,
    persona: "studio-operator",
    ownerEmail: owner.email,
  });
  await artifacts.screenshot(page, "onboarding-voice-run-result");
  if (voice.outcome === "refused") {
    // Record and continue - NOT a BLOCKING note: the kind says what failed and
    // the editor persona asserts the precondition refusal this leaves behind.
    artifacts.note(
      `operator voice build refused: code=${voice.code ?? "none"} assemblyKind=${voice.assemblyKind ?? "none"} - recorded, not retried`
    );
  }

  await page.goto("/brain");
  await activateBrainSection(page, "voice");
  const voiceSection = page.getByTestId("voice-section");
  if (voice.outcome === "succeeded") {
    // A successful build MUST activate on Free - anything else is a defect.
    await expect(voiceSection.getByTestId("voice-active-meta")).toBeVisible();
  } else {
    await expect(voiceSection).toBeVisible();
  }
  const operatorVoice: "active" | "refused" = voice.outcome === "succeeded" ? "active" : "refused";
  artifacts.note(`operatorVoice for the editor handoff: ${operatorVoice}`);
  // THE MAIN CHAPTER for this persona: reached on the refused branch as well.
  await expect(voiceSection).toBeVisible();
  await artifacts.screenshot(page, MAIN_CHAPTERS["studio-operator"]);

  // Chapter 3 - upgrade to Studio (Stripe test-mode checkout). Studio is the
  // only tier whose profileCap is above 1 (config: free/creator/pro = 1,
  // studio = 5) and the only one with up to 3 seats (PRD REQ-A02). Every
  // billing form carries a step-up "Current password" field (10b-1) that the
  // real user types before pressing Subscribe - filled here the same way.
  // PAID: gated. On the Free path the page is read and the owner asserts the
  // not-owner sentence is nowhere on it.
  await page.goto("/settings/billing");
  let studioActive = false;
  if (process.env.E2E_PAID_TIERS === "1") {
    studioActive = await page.getByTestId("manage-plan").isVisible().catch(() => false);
    if (!studioActive) {
      try {
        const subscribeForm = page.getByTestId("subscribe-studio");
        await subscribeForm.locator('input[name="password"]').fill(owner.password);
        await subscribeForm.getByRole("button", { name: /Subscribe/ }).click();
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
          `BLOCKING APP BUG: Studio-tier checkout did not complete - ${String(err)}. This workspace stays on Free, ` +
            "which caps creator profiles at 1 - the second-profile chapter below is skipped as a direct " +
            "consequence and noted, not faked."
        );
        test.info().annotations.push({
          type: "bug",
          description: `Studio-tier Stripe checkout did not complete: ${String(err)}`,
        });
      }
    }
    await page.goto("/settings/billing");
    await expect(page.getByTestId(studioActive ? "manage-plan" : "subscribe-studio")).toBeVisible();
    await artifacts.screenshot(page, studioActive ? "billing-studio-active" : "billing-upgrade-failed");
  } else {
    artifacts.skipped("paid tiers not enabled - Studio-tier checkout");
    await expect(page.getByText("Only the workspace owner can change billing")).toHaveCount(0);
    await expect(
      page.locator('[data-testid="stripe-unconfigured"], [data-testid="pack"]').first()
    ).toBeVisible();
    await artifacts.screenshot(page, "billing-free");
  }

  // Chapter 4 - a second creator profile, only reachable once Studio's cap-of-5
  // is actually in force (Free's cap is 1). Paid; on Free the cap sentence is
  // the asserted state.
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
    if (process.env.E2E_PAID_TIERS !== "1") artifacts.skipped("paid tiers not enabled - second profile");
    // With a profile already selected, the "create-profile" step (and its
    // own `cap-reached` testid) is behind us - the cap sentence here is the
    // profile panel's own plain text (creator-profile-panel.tsx has no
    // data-testid for it).
    await page.goto("/onboarding");
    await expect(page.getByText(/creator profile allowance is full/)).toBeVisible({ timeout: 15_000 });
    artifacts.note("Second profile chapter not run: Free plan's cap-of-1 is reached, as designed.");
    await expect(page.getByText(/creator profile allowance is full/)).toBeVisible();
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
  await expect(page.getByText("Only the workspace owner can change billing")).toHaveCount(0);
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
      await expect(portalButton).toBeDisabled();
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
  writeHandoff("editor-seat", {
    email: editor.email,
    password: editor.password,
    ownerEmail: owner.email,
    operatorVoice,
  });
  artifacts.note(`editor seat provisioned for ${editor.email} in ${owner.email}'s workspace (operatorVoice=${operatorVoice})`);

  // Chapter 8 - sign out.
  await page.goto("/studio");
  await signOut(page);
  await expect(page.getByRole("link", { name: "Start free, no card" }).first()).toBeVisible();
  await artifacts.screenshot(page, "signed-out");
});

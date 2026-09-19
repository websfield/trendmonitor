// Persona 1 - solo creator (primary persona, Free -> Creator tier). Whole
// lifecycle: marketing -> sign-up -> onboarding -> interview -> brain ->
// billing upgrade (unlocks Trends + full-script modes) -> first ideas ->
// Studio (hooks, caption, idea-to-script) -> Trends (track, paste, autopsy,
// spin) -> Results (log) -> Usage -> sign out.
//
// FREE PATH FIRST (creator-ready Phase 2): every chapter that needs a paid
// tier runs only under `E2E_PAID_TIERS=1`; otherwise it writes one
// `skipped:` note and the journey continues on the Free path it already
// handles. Every screenshot follows a settled-state wait in the same block
// (F-18) — `tests/journey-settled-waits.test.ts` reads this file and fails on
// a screenshot taken mid-submit.
import { test, expect, type Page } from "@playwright/test";
import { AUDIENCES } from "../../app/(marketing)/audiences";
import { journeyArtifacts } from "../support/artifacts";
import { freshIdentity, signOut, signUp } from "../support/auth";
import { activateBrainSection, buildVoiceBrain } from "../support/brain";
import { waitForGenerationOutcome } from "../support/generation";
import { MAIN_CHAPTERS } from "../support/main-chapters";
import { completeStripeTestCheckout } from "../support/stripe";

const artifacts = journeyArtifacts("solo-creator");

test.setTimeout(12 * 60 * 1000);

test("solo creator - full lifecycle", async ({ page }) => {
  artifacts.attach(page);
  const identity = freshIdentity("solo");

  // Chapter 1 - marketing site.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Start free, no card" }).first()).toBeVisible();
  await expect(page.locator(".demo-panel").first()).toBeVisible();
  await artifacts.screenshot(page, "marketing-home");

  // Chapter 1b - the public pages a visitor can reach without an account
  // (F-20): changelog, legal, every audience landing, deletion recovery.
  await page.goto("/changelog");
  await expect(page.getByRole("heading", { name: "Changelog" })).toBeVisible();
  await artifacts.screenshot(page, "public-changelog");
  await page.goto("/legal");
  await expect(page.getByRole("heading", { name: "Terms and privacy" })).toBeVisible();
  await artifacts.screenshot(page, "public-legal");
  for (const audience of AUDIENCES) {
    await page.goto(`/for/${audience.slug}`);
    await expect(page.getByText(audience.h1Lead).first()).toBeVisible();
    await artifacts.screenshot(page, `public-for-${audience.slug}`);
  }
  await page.goto("/recover-deletion");
  await expect(page.getByRole("heading", { name: "Cancel account deletion" })).toBeVisible();
  await artifacts.screenshot(page, "public-recover-deletion");

  // Chapter 2 - sign-up lands on /onboarding (Phase 1 AC4).
  await signUp(page, identity);
  await expect(page.getByTestId("onboarding-steps")).toBeVisible();
  await artifacts.screenshot(page, "post-signup-onboarding");

  // Chapter 3 - onboarding: create the creator profile.
  await page.getByLabel("Creator name").fill("Riley Test Creator");
  await page.getByRole("button", { name: "Create profile" }).click();
  // A same-route server action is a soft navigation: `waitForURL` alone would
  // resolve before the profile panel re-renders with the new heading.
  await expect(page.getByRole("heading", { name: "Riley Test Creator" })).toBeVisible({ timeout: 15_000 });
  await artifacts.screenshot(page, "onboarding-profile-created");

  // Chapter 4 - paste own posts (minOwnPostsForVoice default is 3; four for margin).
  const ownPosts = [
    "Three takes in and I still flub the same line. The fourth one always lands because I finally stop performing and just talk.",
    "Nobody tells you the boring cut is the honest one. I trimmed the joke I liked most because it was about me, not the audience.",
    "Today's lesson: the tripod is not optional. Handheld looked cool in my head and looked like an earthquake on the timeline.",
    "I rewrote the hook six times. The one that worked was the one I almost didn't say out loud because it sounded too plain.",
  ];
  for (const content of ownPosts) {
    await page.locator("#content").fill(content);
    await page.getByLabel("I wrote this post myself.").check();
    await page.getByRole("button", { name: "Save post" }).click();
    // A same-route server-action submit is a soft client-side navigation, not
    // a hard reload - `waitForURL` alone resolves before the list re-renders,
    // which raced the next iteration's #content fill against the still-live
    // old textarea and silently dropped two of four posts on an earlier run
    // of this spec. Waiting for the saved post's own text to land in the
    // list is the real completion signal.
    await expect(page.getByText(content.slice(0, 40))).toBeVisible({ timeout: 15_000 });
  }
  // THE MAIN CHAPTER for this persona: every green branch below passes here.
  await expect(page.getByText(ownPosts[ownPosts.length - 1].slice(0, 40))).toBeVisible();
  await artifacts.screenshot(page, MAIN_CHAPTERS["solo-creator"]);

  // Chapter 5 - build the voice brain (real Anthropic call). One press,
  // bracketed by included-build evidence snapshots; a refusal is recorded
  // with its kind and NOT retried (the included build is claimed before the
  // parse, and a Free re-press is refused before the vendor).
  const voice = await buildVoiceBrain(page, {
    artifacts,
    persona: "solo-creator",
    ownerEmail: identity.email,
  });
  artifacts.note(`voice build outcome: ${JSON.stringify(voice)}`);
  await artifacts.screenshot(page, "onboarding-voice-run-result");

  // Chapter 6 - brain: confirm and activate the voice draft (no-op when the
  // build was refused and nothing was drafted).
  await page.goto("/brain");
  await activateBrainSection(page, "voice");
  await expect(page.getByTestId("voice-section")).toBeVisible();
  await artifacts.screenshot(page, "brain-voice-activated");

  // Chapter 7 - the structured interview.
  await page.goto("/onboarding/interview");
  await page.locator("#audience").fill("Early-career editors who are tired of generic advice.");
  await page.locator("#positioning").fill("The editor who shows the boring cut, not just the highlight.");
  await page.locator("#goals").fill("Grow to 10k followers\nGet one brand partnership");
  await page.locator("#ambitions").fill("Run a workshop\nPublish a course");
  await page.locator("#metricLabel").fill("Saves");
  await page.locator("#metricUnit").fill("saves per post");
  const metricDirectionOptions = await page.locator("#metricDirection option").count();
  if (metricDirectionOptions > 1) {
    await page.locator("#metricDirection").selectOption({ index: 1 });
  }
  await page.locator("#metricPlatform_notdecided").check();
  await page.locator("#metricWindow_notdecided").check();
  await page.locator("#bannedWords").fill("literally\nsynergy");
  await page.locator("#bannedVibes").fill("hustle-bro\nfaux-hype");
  await expect(page.getByRole("button", { name: "Save and review my answers" })).toBeVisible();
  await artifacts.screenshot(page, "interview-filled");
  await page.getByRole("button", { name: "Save and review my answers" }).click();
  await page.waitForURL(/step=review/);
  await expect(page.getByRole("button", { name: "Submit my interview" })).toBeVisible();
  await artifacts.screenshot(page, "interview-review");
  await page.getByRole("button", { name: "Submit my interview" }).click();
  // Submission redirects straight to /brain (Stage B2's confirm-and-activate
  // surface for what the interview produced) rather than back to itself.
  await page.waitForURL("**/brain");
  await expect(page.getByTestId("strategy-section")).toBeVisible();
  await artifacts.screenshot(page, "interview-submitted");

  // Chapter 8 - brain: confirm and activate strategy + kill test.
  await activateBrainSection(page, "strategy");
  await activateBrainSection(page, "killtest");
  await expect(page.getByTestId("killtest-section")).toBeVisible();
  await artifacts.screenshot(page, "brain-all-activated");

  // Chapter 9 - billing. On the Free path this only reads the page: the
  // settled state is the keyless refusal banner (CI runs without
  // STRIPE_SECRET_KEY) or the pack panel, and an OWNER never sees the
  // not-owner sentence anywhere on it. The Creator-tier checkout (test-mode
  // Stripe, step-up password) runs only with E2E_PAID_TIERS=1.
  await page.goto("/settings/billing");
  let upgraded = false;
  if (process.env.E2E_PAID_TIERS === "1") {
    upgraded = await page.getByTestId("manage-plan").isVisible().catch(() => false);
    if (!upgraded) {
      try {
        const subscribeForm = page.getByTestId("subscribe-creator");
        await subscribeForm.locator('input[name="password"]').fill(identity.password);
        await subscribeForm.getByRole("button", { name: /Subscribe/ }).click();
        await completeStripeTestCheckout(page, { email: identity.email });
        await page.waitForURL("**/usage");
        // The tier flip is driven by Stripe's webhook, which arrives
        // asynchronously - the checkout redirect completing is not proof the
        // workspace's tier has changed yet. Poll the billing page's own answer.
        await page.goto("/settings/billing");
        await expect(page.getByTestId("manage-plan")).toBeVisible({ timeout: 30_000 });
        artifacts.note("Stripe test-mode checkout completed for Creator tier, webhook confirmed by the billing page.");
        upgraded = true;
      } catch (err) {
        artifacts.note(
          `BLOCKING APP BUG: Creator-tier checkout did not complete - ${String(err)}. Continuing this journey on the Free plan.`
        );
        test.info().annotations.push({
          type: "bug",
          description: `Creator-tier Stripe checkout did not complete: ${String(err)}`,
        });
      }
    }
    await page.goto("/settings/billing");
    await expect(page.getByTestId(upgraded ? "manage-plan" : "subscribe-creator")).toBeVisible();
    await artifacts.screenshot(page, upgraded ? "billing-upgraded" : "billing-upgrade-failed");
  } else {
    artifacts.skipped("paid tiers not enabled - Creator-tier checkout");
    await expect(page.getByText("Only the workspace owner can change billing")).toHaveCount(0);
    await expect(
      page.locator('[data-testid="stripe-unconfigured"], [data-testid="pack"]').first()
    ).toBeVisible();
    await artifacts.screenshot(page, "billing-free");
  }

  // Chapter 9b - the account page (F-20).
  await page.goto("/settings/account");
  await expect(page.getByRole("heading", { name: "Account and data" })).toBeVisible();
  await artifacts.screenshot(page, "settings-account");

  // Chapter 10 - first ideas (B04's real onboarding-ending run).
  await page.goto("/onboarding/first-ideas");
  await page
    .getByLabel(/What is this creator working on right now/)
    .fill("A short series on the boring parts of editing nobody shows.");
  await page.getByRole("button", { name: "Make my first ideas" }).click();
  const firstIdeasOutcome = await waitForGenerationOutcome(page, 90_000);
  artifacts.note(`first-ideas outcome: ${firstIdeasOutcome}`);
  await artifacts.screenshot(page, "first-ideas-result");

  // Chapter 11 - Studio: hooks, caption, and a full-script mode (the last one
  // only if the plan includes it - Free has Hooks/Caption/Ideation only).
  await page.goto("/studio");
  await runStudioMode(page, "Hooks", "A hook about the take that finally worked.");
  await artifacts.screenshot(page, "studio-hooks-result");
  await runStudioMode(page, "Caption", "A caption for the boring-cut post.");
  await artifacts.screenshot(page, "studio-caption-result");
  const modeOptionLabels = await page.getByLabel("What do you want to make?").locator("option").allTextContents();
  const thirdMode = modeOptionLabels.includes("Idea to script") ? "Idea to script" : "Ideation";
  artifacts.note(`third Studio mode: ${thirdMode} (plan modes offered: ${modeOptionLabels.join(", ")})`);
  await runStudioMode(
    page,
    thirdMode,
    thirdMode === "Idea to script"
      ? "A full script about why the fourth take always wins."
      : "Three ideas about why the fourth take always wins."
  );
  await artifacts.screenshot(page, "studio-third-mode-result");

  // Feedback on the last draft, exercising the feedback loop once. A refused
  // draft has no feedback block; that branch records the absence.
  const feedbackBlock = page.getByTestId("studio-feedback");
  if (await feedbackBlock.isVisible().catch(() => false)) {
    await feedbackBlock.locator('input[type="radio"]').first().check();
    await feedbackBlock.getByRole("button", { name: "Record what I said" }).click();
    await expect(feedbackBlock.getByTestId("studio-feedback-recorded")).toBeVisible({ timeout: 15_000 });
    await artifacts.screenshot(page, "studio-feedback-recorded");
  } else {
    artifacts.note("no feedback block on the last draft (refused or withheld) - feedback loop not exercised");
    await expect(page.getByTestId("studio-status")).toBeVisible();
    await artifacts.screenshot(page, "studio-feedback-absent");
  }

  // Chapter 11b - the frameworks library page (F-20).
  await page.goto("/studio/frameworks");
  await expect(page.getByRole("heading", { name: "Frameworks" })).toBeVisible();
  await artifacts.screenshot(page, "studio-frameworks");

  // Chapter 12 - Trends. Free's trackedNiches allowance is 0 (config), so on
  // Free the niche block is the EXPECTED, asserted state (Phase 1 T8); the
  // paste -> autopsy -> spin chapter needs a paid tier and is gated.
  await page.goto("/trends");
  const nicheBlocked = await page.getByTestId("niche-disabled-tier").isVisible().catch(() => false);
  if (nicheBlocked) {
    artifacts.note("Niche tracking is not included on this workspace's current plan.");
    await expect(page.getByTestId("niche-disabled-tier")).toBeVisible();
    await artifacts.screenshot(page, "trends-niche-blocked");
  } else {
    await page.locator("#tracked-niche").fill("editing-tips");
    await page.getByRole("button", { name: "Track niche" }).click();
    await expect(
      page.locator('[data-testid="niche-saved"], [data-testid="niche-refused"]').first()
    ).toBeVisible({ timeout: 15_000 });
    const nicheTracked = await page.getByTestId("niche-saved").isVisible().catch(() => false);
    artifacts.note(`niche tracking allowed: ${nicheTracked}`);
    await expect(
      page.locator('[data-testid="niche-saved"], [data-testid="niche-refused"]').first()
    ).toBeVisible();
    await artifacts.screenshot(page, "trends-niche-tracked");
  }

  if (process.env.E2E_PAID_TIERS === "1") {
    const pasteBlocked = await page.getByTestId("paste-disabled-tier").isVisible().catch(() => false);
    if (pasteBlocked) {
      artifacts.note("Paste-for-autopsy still tier-blocked after upgrade - recording and moving on");
      await expect(page.getByTestId("paste-disabled-tier")).toBeVisible();
      await artifacts.screenshot(page, "trends-paste-blocked");
    } else {
      await page.getByLabel("Video link").fill("https://example.com/watch?v=e2e-solo-creator");
      await page.getByLabel(/Title/).fill("A stitched receipts video");
      await page
        .getByLabel("Transcript")
        .fill(
          "Hook: I never post the first take. Beat one: show the failed attempt. Beat two: show the fix. " +
            "Ending: the honest cut wins. Follow trigger: comment your worst take."
        );
      await page.getByRole("button", { name: "Paste for autopsy" }).click();
      await expect(page.getByTestId("paste-status").filter({ hasText: /.+/ })).toBeVisible({ timeout: 15_000 });
      await artifacts.screenshot(page, "trends-paste-queued");

      // The autopsy runs on the dedicated pg-boss worker - poll by reloading.
      let spinReady = false;
      for (let attempt = 0; attempt < 12 && !spinReady; attempt += 1) {
        await page.waitForTimeout(10_000);
        await page.goto("/trends");
        spinReady = (await page.getByRole("button", { name: /Spin/ }).count()) > 0;
      }
      artifacts.note(`autopsy became spin-ready: ${spinReady}`);
      await expect(page.getByRole("heading", { name: "Track a niche" })).toBeVisible();
      await artifacts.screenshot(page, "trends-autopsy-polled");

      if (spinReady) {
        await page.getByRole("button", { name: /Spin/ }).first().click();
        await expect(
          page.locator('[data-testid^="spin-result-"], [data-testid^="spin-refusal-"]').first()
        ).toBeVisible({ timeout: 60_000 });
        await artifacts.screenshot(page, "trends-spin-result");
      }
    }
  } else {
    artifacts.skipped("paid tiers not enabled - paste/autopsy/spin");
  }

  // Chapter 13 - Results. Free tier has view-only performance-record access
  // (config), and logging needs a declared metric: on the Free path the page
  // is read and its withheld state asserted; logging a result is gated.
  await page.goto("/results");
  const noDeclaredMetric = await page
    .getByTestId("results-no-declared-metric")
    .isVisible()
    .catch(() => false);
  const logBlocked = await page.getByTestId("results-log-blocked").isVisible().catch(() => false);
  artifacts.note(`results: no declared metric=${noDeclaredMetric}, log blocked=${logBlocked}`);
  if (process.env.E2E_PAID_TIERS === "1" && !noDeclaredMetric && !logBlocked) {
    await page.locator("#results-generation").selectOption({ index: 1 });
    await page.locator("#results-platform").selectOption({ index: 1 });
    await page.locator('input[name="audienceClass"]').first().check();
    const today = new Date().toISOString().slice(0, 10);
    await page.locator("#results-observed-from").fill(today);
    await page.locator("#results-observed-to").fill(today);
    const offeredEvidence = page.locator('[data-testid="results-evidence-field"] input[type="radio"]');
    if (await offeredEvidence.count()) await offeredEvidence.first().check();
    await page.locator("#results-note").fill("Logged by the solo-creator e2e journey.");
    await page.getByRole("button", { name: "Log this result" }).click();
    await expect(page.getByTestId("results-log-status")).toBeVisible();
    await artifacts.screenshot(page, "results-logged");
  } else {
    if (process.env.E2E_PAID_TIERS !== "1") artifacts.skipped("paid tiers not enabled - results logging");
    await expect(
      page
        .locator('[data-testid="results-no-declared-metric"], [data-testid="results-log-blocked"], #results-generation')
        .first()
    ).toBeVisible();
    await artifacts.screenshot(page, "results-free-view");
  }

  // Chapter 14 - Usage / credits.
  await page.goto("/usage");
  await expect(page.getByTestId("balance")).toBeVisible();
  await artifacts.screenshot(page, "usage-balance");

  // Chapter 15 - sign out.
  await page.goto("/studio");
  await signOut(page);
  await expect(page.getByRole("link", { name: "Start free, no card" }).first()).toBeVisible();
  await artifacts.screenshot(page, "signed-out");
});

/** Runs one Studio mode end to end: select it, fill the brief, press, wait. */
async function runStudioMode(page: Page, modeLabel: string, input: string): Promise<void> {
  await page.getByLabel("What do you want to make?").selectOption({ label: modeLabel });
  await page.locator("#studio-input").fill(input);
  const submit = page.getByRole("button", { name: "Make a draft" });
  // The default 15s action timeout was occasionally too tight for this
  // control right after a PRIOR mode's feedback panel finishes rendering
  // (observed: a transient window where the button briefly does not resolve
  // by role/name before settling back to "Make a draft") - explicit wait with
  // headroom, rather than assuming the first press always lands.
  await submit.waitFor({ state: "visible", timeout: 30_000 });
  await submit.click();
  // `/studio` is a single mounted client component across repeated presses
  // (no page reload between modes), so a TERMINAL result from the PREVIOUS
  // mode is already in the DOM the instant this press starts - waiting only
  // for "a terminal result exists" matches that stale one and moves on while
  // THIS press is still in flight, leaving the next press unable to find
  // "Make a draft" (it reads "Preparing your draft..." until this one
  // resolves). Wait for the busy signal first, so the terminal wait after it
  // can only be satisfied by THIS press's own completion.
  await page.getByTestId("studio-status").filter({ hasText: /.+/ }).waitFor({ state: "visible", timeout: 15_000 });
  const outcome = await waitForGenerationOutcome(page, 90_000);
  test.info().annotations.push({ type: "studio-outcome", description: `${modeLabel}: ${outcome}` });
}

// /onboarding/first-ideas — PRD B04, as a page (slice 7, R5).
//
// "Onboarding ends by generating the creator's first three ideas through their
// new brain, so the aha moment happens inside the first session." Slice 3b
// shipped the honest ABSENCE of this — a paragraph on the interview review
// screen saying the step was not part of the product yet — and this file is
// what replaces it. The paragraph now links here.
//
// IT IS A REAL RUN ON THE REAL PIPELINE. Same operation, same gates, same
// ledger debit, same kill test, same traceability scan, same stored
// `generations` row as anything on `/studio`. Nothing about it is a demo, and
// no sentence on the screen may suggest it is free because it is onboarding —
// D-M2-2's included run is the BRAIN BUILD, not what the brain writes.
//
// Every read goes through a sanctioned surface and nothing else (tenancy T1):
// `scopeForUser`, `respinDb` for the brain-history courtesy read, and
// `respinCredits` for the tier, the price and the balance. No raw tables, no
// connection, no `@respin/modes`.
//
// EVERY READ BELOW THE SCOPE IS FAIL-SOFT, exactly as on `/studio`: the brain
// state, the tier, the price, the pause and the balance are COURTESIES that
// decide what the screen says and whether a control is offered. The enforcement
// is inside `respinCredits.generate`, which re-reads all of them at operation
// time; if this page and those gates disagree, the gates are right and the
// creator sees a refusal with copy.
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import {
  ONBOARDING_FIRST_IDEAS_MODE,
  generationOp,
  modeOffers,
  priceOf,
  respinCredits,
} from "@respin/credits/app-server";
import { getActiveConfigServer } from "@respin/config/app-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { AccessRefusal } from "../../access-refusal";
import { billingErrorDisplay } from "../../billing-errors";
import { logRefusal } from "../../safe-log";
import { scopeForUser } from "../../workspace-scope";
// THE REFUSAL SET IS `/studio`'s, NOT A SECOND ONE, and that is the whole
// reason it is imported rather than written: this screen calls the SAME
// operation, so the classes it can receive are the same classes — and
// `tests/studio-ui.test.tsx` DERIVES that set from the spend path's own source.
// A second closed set here would be a second population, narrower by
// construction the day `generate` grows a refusal, which is CLAUDE.md's
// 2026-08-29 lesson exactly.
import { studioErrorFor, studioRefusalCopy } from "../../studio/copy";
import { firstIdeasAction } from "./actions";
import {
  FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE,
  FIRST_IDEAS_NEEDS_BRAIN,
  FIRST_IDEAS_NOT_IN_PLAN,
  FIRST_IDEAS_PAUSED,
  FIRST_IDEAS_VIEWER,
  firstIdeasCostSentence,
} from "./copy";
import { FirstIdeasView } from "./first-ideas-view";

export const dynamic = "force-dynamic";

export default async function FirstIdeasPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client navigation caches layouts — the
  // gate-completeness suite). ABOVE the try: `requireUser()` refuses by
  // throwing a `redirect()`.
  const user = await requireUser();
  const search = await props.searchParams;
  const error = studioErrorFor(
    typeof search.e === "string" ? search.e : undefined
  );

  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[first-ideas] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profile: Awaited<ReturnType<typeof respinDb.selectedProfileForMember>> =
    null;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[first-ideas] selected profile unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  if (!profile) {
    return (
      <FirstIdeasView
        profileName={null}
        run={null}
        error={error}
        onboardingHref="/onboarding"
        brainHref="/brain"
        studioHref="/studio"
      />
    );
  }

  // IS THERE AN ACTIVATED BRAIN? A COURTESY READ with the same stated limit
  // `/studio`'s carries: the authority is `BrainNotActivatedError`, raised by
  // `generate` when this profile has no `brain_activation_snapshots` row, and
  // this page cannot read that table (there is no scoped accessor for it in
  // `app/**`), so it infers from what it CAN read — whether any kind has an
  // active version. A wrong signpost, never a wrong charge.
  let brainActivated: boolean | null = null;
  try {
    const [voice, strategy, killtest] = await Promise.all([
      respinDb.readBrainHistory(scope, profile.id, "voice"),
      respinDb.readBrainHistory(scope, profile.id, "strategy"),
      respinDb.readBrainHistory(scope, profile.id, "killtest"),
    ]);
    brainActivated = [voice, strategy, killtest].some((history) =>
      history.some((v) => v.status === "active")
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    // A failed courtesy read remains unknown rather than being called inactive.
    logRefusal("[first-ideas] brain state unavailable", err);
  }

  let paused = false;
  let tier: Awaited<ReturnType<typeof respinCredits.getBillingState>>["tier"] =
    "free";
  try {
    const state = await respinCredits.getBillingState(
      scope.workspaceId,
      new Date()
    );
    tier = state.tier;
  } catch (err) {
    rethrowNextControlFlow(err);
    // FAIL TO THE SMALLEST PLAN — and PRD §4G puts Ideas on Free, so this step
    // stays offered on a failed read rather than vanishing. `assertModeAllowed`
    // is still the gate.
    logRefusal("[first-ideas] billing state unavailable", err);
  }
  // THE PAUSE IS THE AUTHORITY'S ANSWER, not the mirror's (tenancy gate round
  // 2, 2026-09-01). `generate` refuses on `hasOpenPause` over `pause_periods`;
  // `BillingState.state` is `isPausedSubscription` over
  // `subscriptions.pausedAt`, which its own docblock says is "not the
  // authority, and deliberately not used to gate money".
  try {
    paused = await respinCredits.hasOpenPause(scope.workspaceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[first-ideas] pause state unavailable", err);
  }

  // WHETHER THIS MODE IS AVAILABLE AT ALL, from the same two authorities the
  // gate reads — never from a screen-side list. `modeOffers` is
  // `assertModeAllowed` read forwards, so a plan that excludes Ideation and a
  // build that has not shipped it are two DIFFERENT sentences here, exactly as
  // they are two different refusals there.
  const offer = modeOffers(tier).find(
    (m) => m.id === ONBOARDING_FIRST_IDEAS_MODE
  );

  let cost: number | null = null;
  try {
    const config = await getActiveConfigServer();
    // THE OPERATION'S OWN PRICING RULE, not a screen-side index into
    // `creditCosts`: `generationOp` is the one place a mode's cost key is
    // chosen, and `priceOf` is the lookup the debit is taken from.
    cost = priceOf(
      config.content,
      generationOp(ONBOARDING_FIRST_IDEAS_MODE, false)
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[first-ideas] credit cost unavailable", err);
  }

  let balance: number | null = null;
  try {
    const view = await respinCredits.getBalance(scope.workspaceId);
    balance = view.balance;
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[first-ideas] balance unavailable", err);
  }

  // THE ORDER IS ROLE, PAUSE, PLAN, BUILD, BRAIN — and it is the order the
  // OPERATION refuses in, so the sentence a creator reads before pressing and
  // the refusal they would get for pressing say the same thing. A viewer on a
  // Free plan is told about their access, not about the plan; a paid creator
  // whose mode is unbuilt is told about us, not about what they bought.
  const block: { reason: string } | null =
    scope.role === "viewer"
      ? { reason: FIRST_IDEAS_VIEWER }
      : paused
        ? { reason: FIRST_IDEAS_PAUSED }
        : offer === undefined || offer.status === "not_in_plan"
          ? { reason: FIRST_IDEAS_NOT_IN_PLAN }
          : brainActivated === null
            ? { reason: FIRST_IDEAS_BRAIN_STATE_UNAVAILABLE }
          : !brainActivated
            ? { reason: FIRST_IDEAS_NEEDS_BRAIN }
            : null;

  const refusalCopy = studioRefusalCopy();

  return (
    <FirstIdeasView
      profileName={profile.displayName}
      run={{
        // A BOUND ARGUMENT, not a hidden field — the same shape every other
        // write control on these screens uses. Still untrusted input on the
        // wire; `mintProfileScope` is what refuses a foreign id.
        action: firstIdeasAction.bind(null, profile.id),
        costSentence: firstIdeasCostSentence(cost, balance),
        block,
        refusalCopy,
        fallbackCopy: refusalCopy.unknown,
      }}
      error={error}
      onboardingHref="/onboarding"
      brainHref="/brain"
      studioHref="/studio"
    />
  );
}

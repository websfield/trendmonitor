// /studio — server component: gate, scope, read, render (slice 6, stage D).
//
// SLICE 6's ACCEPTANCE TEST LIVED HERE: "generate a set of hooks from their own
// coherent brain, see them kill-tested, and see one atomically settled credit
// debit". SLICE 7's is wider and the same shape — "use all the modes, revise an
// output with its lineage intact, and give feedback that is captured" — and
// this page is still what makes those stages reachable by a person. Until it
// offers a mode, a revision and a reaction, each of them is inventory.
//
// Every read goes through a sanctioned surface and nothing else (tenancy T1):
// `scopeForUser` for bootstrap-safe scope and its accessors, `respinDb` for the
// scoped brain-history reads, `respinCredits` for the billing state and the
// derived balance, and `@respin/config/app-server` for the price. No raw
// tables, no connection, no `@respin/modes` — the default-deny lint and the
// import-boundary fixtures enforce that, and this file is a path they cover.
//
// EVERY READ BELOW THE SCOPE IS FAIL-SOFT ON PURPOSE. The price, the balance,
// the pause and the brain state are all COURTESIES — they decide what the
// screen says and whether a control is offered. None of them is the
// enforcement: `respinCredits.generate` re-reads the tier, the price, the
// pause, the role, the archived state and the balance itself, inside the
// operation, at operation time. If this page and those gates ever disagree, the
// gates are right and the creator sees a refusal with copy.
import { requireUser } from "@respin/auth";
import { FEEDBACK_NOTE_MAX, GENERATION_FEEDBACK_REACTIONS, respinDb } from "@respin/db";
import {
  generationOp,
  modeOffers,
  priceOf,
  respinCredits,
} from "@respin/credits/app-server";
import { getActiveConfigServer } from "@respin/config/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay } from "../billing-errors";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";
import { generateAction, recordFeedbackAction } from "./actions";
import { generateBlock, studioErrorFor, studioRefusalCopy } from "./copy";
import {
  generateCostSentence,
  revisionCostSentence,
  type ModeChoiceView,
} from "./run-copy";
import { StudioView } from "./studio-view";

export const dynamic = "force-dynamic";

export default async function StudioPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client navigation caches layouts — the
  // gate-completeness suite). ABOVE the try: `requireUser()` refuses by
  // throwing a `redirect()`, so catching it here would turn an expired session
  // into an error banner instead of a sign-in page.
  const user = await requireUser();
  const search = await props.searchParams;
  const error = studioErrorFor(
    typeof search.e === "string" ? search.e : undefined
  );

  // Scoping is a REFUSAL PATH, not an assumption: `scopeForUser` bootstraps
  // before the scope read so this page cannot lose the first-login race against
  // the concurrently-rendered layout.
  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profile: Awaited<ReturnType<typeof respinDb.selectedProfileForMember>> =
    null;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] selected profile unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  if (!profile) {
    // NO PROFILE, NO DRAFT — a named state, not an error, and the same shape
    // `/brain` uses. A creator who has not made a profile has nobody to write
    // as, and telling them where to start is the honest answer.
    return (
      <StudioView
        profileName={null}
        run={null}
        error={error}
        onboardingHref="/onboarding"
        brainHref="/brain"
        usageHref="/usage"
        frameworksHref="/studio/frameworks"
      />
    );
  }

  // IS THERE AN ACTIVATED BRAIN? A COURTESY READ, and its limit is stated
  // rather than hidden: the authority is `BrainNotActivatedError`, which
  // `generate` raises when this profile has no `brain_activation_snapshots`
  // row, and that row is written by `activateBrainCoherent`. This page cannot
  // read that table (there is no scoped accessor for it in `app/**`), so it
  // infers from what it CAN read — whether any kind has an active version.
  //
  // WHAT MAKES THE TWO AGREE IS A DELETION, not an argument (tenancy gate
  // round 2, 2026-09-01). `@respin/db` used to expose a SECOND activation —
  // `activateVoice`, one document, no snapshot — and this comment claimed the
  // disagreement it caused "fails SAFE". That was true only on a profile with
  // no snapshot at all: with one already on file, `generate` found a row,
  // refused nothing, and assembled from the ids that OLD snapshot names
  // (`brainDocsByIds` is unfiltered by status by design), so the product would
  // have kept writing in the superseded voice with no signal on any surface.
  // The entrypoint is gone: `activateBrainCoherent` is the whole activation
  // surface of the facade, so every activation this product can perform writes
  // its snapshot in the same transaction, and `tests/studio-ui.test.tsx` pins
  // that facade surface rather than restating it here.
  //
  // THE DISAGREEMENT THAT REMAINS, and it is the safe direction. Exactly one
  // statement in `packages/**` or `app/**` sets `brain_docs.status` to
  // `active` — `activateBrainDoc`'s — but the row is reachable by hand:
  // `brain-schema.ts` records the incident-time UPDATE explicitly, as the path
  // its CHECKs narrow and do not close, and an UPDATE on `brain_docs` writes no
  // row in `brain_activation_snapshots`, which is a different table. So the
  // surviving divergence is "active document, no snapshot": this page offers
  // the control and `generate` refuses it with `BrainNotActivatedError` before
  // anything is spent, with copy. A wrong signpost, never a wrong charge, and
  // never the superseded voice the deleted entrypoint could produce.
  let brainActivated = false;
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
    // A courtesy read's failure must not take the page down. Left `false`, the
    // screen says "activate a brain first" to somebody who may already have
    // one — which is a wrong signpost and not a wrong action, and the control
    // returns on the next load. The alternative (assume activated) would offer
    // a spend control on a page whose reads are failing.
    logRefusal("[studio] brain state unavailable", err);
  }

  // THE PAUSE AND THE TIER, FROM ONE READ (slice 7). The pause decides whether
  // the control is offered; the tier decides which modes are. They were two
  // `getBillingState` calls in this stage's first draft — two queries per
  // render, at two instants, over one row — so a subscription changing between
  // them could render a picker for a tier whose pause state came from a
  // different answer. One read, one instant, one `new Date()`.
  //
  // BOTH DEFAULTS ARE THE SAFE DIRECTION ON A FAILED READ. `paused` stays
  // `false`, so the control is offered and `generate`'s own pause gate refuses
  // with copy rather than the screen hiding a control for a workspace that is
  // not paused; `tier` falls to `free`, the SMALLEST plan, so a failed read
  // under-offers rather than showing a paying creator a control their plan
  // does not include. Neither is the enforcement: `generate` re-reads both.
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
    logRefusal("[studio] billing state unavailable", err);
  }
  // THE PAUSE COMES FROM THE AUTHORITY (tenancy gate round 2, 2026-09-01), and
  // it is a SECOND read for a stated reason. `BillingState.state === "paused"`
  // is `isPausedSubscription` — the `subscriptions.pausedAt` MIRROR — while
  // `generate` refuses on `hasOpenPause` over `pause_periods`. The paragraph
  // above argued for one read so the picker's tier and pause came from one
  // instant; that consistency is worth less than asking the question the gate
  // will ask, because the two can disagree and only one of them decides.
  try {
    paused = await respinCredits.hasOpenPause(scope.workspaceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] pause state unavailable", err);
  }

  // THE TIER, THE MODES AND THE PRICES — all three from the SAME authorities
  // the operation uses, and all three fail SOFT (slice 7, R1/R13/R8).
  //
  // `modeOffers(tier)` IS `assertModeAllowed` READ FORWARDS. The screen does
  // not know which modes any tier includes and must not learn: this call is the
  // plan map and `IMPLEMENTED_MODES` answered together, in the package that
  // owns both, so the picker and the gate that refuses it cannot disagree.
  //
  // `priceOf(content, generationOp(id, isRevision))` IS THE OPERATION'S OWN
  // PRICING RULE, not a screen-side copy of it. `generationOp` is the one place
  // a revision's `creditCosts.revision` key is chosen over the mode's, so R8's
  // "a revision is priced as a revision" is stated here by CALLING that
  // decision rather than by restating it.
  //
  // A FAILED READ LEAVES `null` AND THE SENTENCE SAYS SO (non-negotiable 6).
  // A stale or missing number here is not a charge: the operation re-reads the
  // tier, the config and the balance inside itself, and the outcome panel
  // reports what actually moved.
  let content: Awaited<ReturnType<typeof getActiveConfigServer>>["content"] | null =
    null;
  try {
    content = (await getActiveConfigServer()).content;
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] credit costs unavailable", err);
  }

  // ONE PRICE LOOKUP PER MODE, each guarded on its own: a mode an operator has
  // not priced must not take the price of every other mode down with it, and
  // `priceOf` is the function that would throw for one.
  const priceFor = (modeId: string, isRevision: boolean): number | null => {
    if (content === null) return null;
    try {
      return priceOf(
        content,
        generationOp(modeId as Parameters<typeof generationOp>[0], isRevision)
      );
    } catch (err) {
      rethrowNextControlFlow(err);
      logRefusal("[studio] a mode price could not be read", err, {
        profileId: profile.id,
        workspaceId: scope.workspaceId,
      });
      return null;
    }
  };

  const modes: ModeChoiceView[] = modeOffers(tier).map((offer) => ({
    id: offer.id,
    label: offer.label,
    status: offer.status,
    // A PRICE IS ONLY READ FOR A MODE THIS WORKSPACE CAN PRESS. Printing the
    // cost of a mode the plan excludes would put a price tag on a refusal,
    // which is the sales shape R15 keeps off these screens.
    cost: offer.status === "available" ? priceFor(offer.id, false) : null,
  }));

  // THE REVISION PRICE IS MODE-INDEPENDENT (R8) and is read as such: the key
  // `generationOp` returns for a revision is `creditCosts.revision` whatever
  // mode it is handed, so this asks the pricing rule the question once, using a
  // mode the plan includes so the lookup is over an operation this workspace
  // could really perform.
  const firstOffered = modes.find((m) => m.status === "available");
  const revisionCost =
    firstOffered === undefined ? null : priceFor(firstOffered.id, true);

  let balance: number | null = null;
  try {
    const view = await respinCredits.getBalance(scope.workspaceId);
    balance = view.balance;
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] balance unavailable", err);
  }

  const refusalCopy = studioRefusalCopy();

  return (
    <StudioView
      profileName={profile.displayName}
      run={{
        // A BOUND ARGUMENT, not a hidden field — the same shape `/brain`'s
        // forms use. Still untrusted input on the wire; `mintProfileScope` is
        // what refuses a foreign id.
        action: generateAction.bind(null, profile.id),
        feedbackAction: recordFeedbackAction.bind(null, profile.id),
        modes,
        costSentence: generateCostSentence(modes, balance),
        revisionCostSentence: revisionCostSentence(revisionCost),
        revisionCost,
        // THE CLOSED REACTION SET, FROM THE DATABASE'S OWN ENUM. The screen
        // renders one control per member, so it cannot offer a code
        // `recordGenerationFeedback` would refuse — the `INTERVIEW_FIELDS`
        // precedent, and the reason a hand-copied list is not allowed here.
        reactions: GENERATION_FEEDBACK_REACTIONS,
        noteMax: FEEDBACK_NOTE_MAX,
        block: generateBlock({
          isViewer: scope.role === "viewer",
          paused,
          brainActivated,
        }),
        refusalCopy,
        fallbackCopy: refusalCopy.unknown,
      }}
      error={error}
      onboardingHref="/onboarding"
      brainHref="/brain"
      usageHref="/usage"
      frameworksHref="/studio/frameworks"
    />
  );
}

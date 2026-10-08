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
import {
  BRAIN_EDIT_VALUE_MAX,
  FEEDBACK_NOTE_MAX,
  GENERATION_FEEDBACK_REACTIONS,
  OWN_IDEA_MAX,
  respinDb,
} from "@respin/db";
import {
  CREATIVE_CONSTRAINT_BOUNDS,
  CREATIVE_FORM_OPTIONS,
  CREATIVE_PEOPLE_OPTIONS,
  FIND_CONCEPT_MODE,
  generationOp,
  modeLabel,
  priceOf,
  studioModeOffers,
  respinCredits,
} from "@respin/credits/app-server";
import { displayBalanceFor } from "../display-balance";
import { getActiveConfigServer } from "@respin/config/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay } from "../billing-errors";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";
import {
  cancelPieceAction,
  commissionPieceAction,
  findConceptAction,
  generateAction,
  newGenerationAction,
  recordFeedbackAction,
  excludeFeedbackFromHistoryAction,
  rememberForFutureDraftsAction,
  resumeHeldDraftAction,
  selectConceptAction,
  startOwnIdeaAction,
} from "./actions";
import { generateBlock, pieceViewFor, studioErrorFor, studioRefusalCopy } from "./copy";
import type { PieceConfirmationProps } from "./piece-confirmation";
import {
  generateCostSentence,
  inputLimitSentence,
  revisionCostSentence,
  type ModeChoiceView,
} from "./run-copy";
import type { HeldDraftLine } from "./studio-panel";
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
  // Set only by `cancelPieceAction`'s redirect; carries no data.
  const pieceCancelled = search.cancelled === "1";

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
        piece={null}
        pieceError={null}
        entrances={null}
        run={null}
        error={error}
        onboardingHref="/onboarding"
        brainHref="/brain"
        usageHref="/usage"
        frameworksHref="/studio/frameworks"
        brainActiveWithoutVoice={false}
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
  let brainActivated: boolean | null = null;
  let activeKinds: Array<"Voice" | "Strategy" | "Kill test"> | null = null;
  try {
    const [voice, strategy, killtest] = await Promise.all([
      respinDb.readBrainHistory(scope, profile.id, "voice"),
      respinDb.readBrainHistory(scope, profile.id, "strategy"),
      respinDb.readBrainHistory(scope, profile.id, "killtest"),
    ]);
    activeKinds = [];
    if (voice.some((v) => v.status === "active")) activeKinds.push("Voice");
    if (strategy.some((v) => v.status === "active")) activeKinds.push("Strategy");
    if (killtest.some((v) => v.status === "active")) activeKinds.push("Kill test");
    brainActivated = activeKinds.length > 0;
  } catch (err) {
    rethrowNextControlFlow(err);
    // A failed courtesy read remains unknown so the screen does not call an
    // unreadable brain inactive.
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

  // STUDIO'S VIEW OF THE OFFERS (Phase 6 compliance gate): Spin, the
  // similarity-gated mode, needs an autopsy chosen on `/trends`, and
  // `generate` refuses it from this picker every time, so it is not offered
  // here. The filter is the facade's
  // (`studioModeOffers`, derived from the spec's similarity gate), so this
  // page still names no mode.
  const modes: ModeChoiceView[] = studioModeOffers(tier).map((offer) => ({
    id: offer.id,
    label: offer.label,
    status: offer.status,
    // A PRICE IS ONLY READ FOR A MODE THIS WORKSPACE CAN PRESS. Printing the
    // cost of a mode the plan excludes would put a price tag on a refusal,
    // which is the sales shape R15 keeps off these screens.
    cost: offer.status === "available" ? priceFor(offer.id, false) : null,
    // R-148: whether the creative form control belongs beside this mode — the
    // facade's answer, so this page names no mode.
    takesCreativeForm: offer.takesCreativeForm,
  }));

  // THE REVISION PRICE IS MODE-INDEPENDENT (R8) and is read as such: the key
  // `generationOp` returns for a revision is `creditCosts.revision` whatever
  // mode it is handed, so this asks the pricing rule the question once, using a
  // mode the plan includes so the lookup is over an operation this workspace
  // could really perform.
  const firstOffered = modes.find((m) => m.status === "available");
  const revisionCost =
    firstOffered === undefined ? null : priceFor(firstOffered.id, true);

  // ONE DISPLAY READ, NEVER A SECOND LOCKED FOLD (audit Phase 8, P8-R1): the
  // layout already reads the rail's number this way; this page's read is the
  // same non-blocking one, and `settling` reaches the cost sentence so a
  // committed-fold number is never stated as final. The page decides nothing
  // from it — "insufficient" is decided only inside `generate`.
  let balance: number | null = null;
  let balanceSettling = false;
  try {
    const view = await displayBalanceFor(scope.workspaceId);
    balance = view.balance;
    balanceSettling = view.settling;
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] balance unavailable", err);
  }

  const refusalCopy = studioRefusalCopy();
  const block = generateBlock({
    isViewer: scope.role === "viewer",
    paused,
    brainActivated,
  });

  // LAUNCH L2 (R-151): THE CONFIRMATION OF A CHOSEN PIECE, read from the
  // database by its id in the URL — which is what makes the selection, its
  // server-minted operation id and its quote survive a reload. A COURTESY
  // READ like every other one here: a foreign, missing or cancelled piece
  // renders the refusal copy instead, and `generate` re-resolves the piece
  // (scope, operation id, quote) itself at the press.
  const pieceParam = typeof search.piece === "string" ? search.piece : null;
  let piece: PieceConfirmationProps | null = null;
  let pieceError: { title: string; detail: string } | null = null;
  if (pieceParam !== null) {
    try {
      const view = await respinCredits.creativePieceView(scope, profile.id, pieceParam);
      piece = {
        piece: pieceViewFor(view),
        commissionAction: commissionPieceAction.bind(null, profile.id, view.pieceId),
        newGenerationAction: newGenerationAction.bind(null, profile.id, view.pieceId),
        cancelAction: cancelPieceAction.bind(null, profile.id, view.pieceId),
        formOptions: CREATIVE_FORM_OPTIONS,
        peopleOptions: CREATIVE_PEOPLE_OPTIONS,
        creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
        block,
        refusalCopy,
        fallbackCopy: refusalCopy.unknown,
      };
    } catch (err) {
      rethrowNextControlFlow(err);
      pieceError = billingErrorDisplay(err);
      logRefusal("[studio] piece unavailable", err, {
        profileId: profile.id,
        workspaceId: scope.workspaceId,
      });
    }
  }

  // THE NO-CONCEPT READINESS — the server's deterministic rule, read as a
  // courtesy so the one clarifying question is asked up front. `null` when
  // the read failed: the hint stays optional and `generate` asks it instead.
  let conceptReady: boolean | null = null;
  try {
    conceptReady = await respinCredits.conceptContextReady(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] concept readiness unavailable", err);
  }

  // THE STANDALONE REFERENCE BREAKDOWN — THREE STATES, never a guessed plan
  // fact: in the plan (offered), not in the plan (visibly withheld), or
  // UNKNOWN when the read failed — neutral copy and the trends link, because
  // the trends page and its writer decide. The read is the tier against the
  // pasted-reference tier list and nothing else (`pastedReferenceInPlan`), so
  // this render takes no workspace money lock for it (audit P8-R1; the page's
  // own balance read above is the pre-L2 one L5 owns).
  let referenceInPlan: boolean | null = null;
  try {
    referenceInPlan = await respinCredits.pastedReferenceInPlan(scope.workspaceId, new Date());
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] reference plan unavailable", err);
  }

  // LAUNCH L4 (R-153): THE WAY BACK TO A SAVED RECORDING PACK after the tab
  // was closed — this profile's most recent stored drafts, each linking to its
  // saved page. A COURTESY READ: scoped, no provider, no ledger, no lock; a
  // failure renders a neutral line instead of a list.
  let recentPacks: Awaited<ReturnType<typeof respinCredits.recentSavedGenerations>> | null = null;
  try {
    recentPacks = await respinCredits.recentSavedGenerations(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] recent saved drafts unavailable", err);
  }

  // AUDIT P6-R6 (register item 8): HOW MANY RESULTS THIS CREATOR HAS LOGGED,
  // through the scoped count (`ProfileScope.accessors.countResults` behind
  // `ProfileScope.mint`). A COURTESY READ with a failure that SAYS so: `null`
  // renders "could not read", never the zero sentence, which would be the
  // false claim this read exists to remove.
  let resultCount: number | null = null;
  try {
    resultCount = await respinDb.countResults(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] result count unavailable", err);
  }

  // AUDIT P3-A4 (R-157): THIS CREATOR'S HELD DRAFTS — finished by the model,
  // stored, not charged — each with the time the worker's clear removes it. A
  // COURTESY READ like the list above (scoped, no provider, no ledger): a
  // failure renders a neutral line, never a missing section that reads as "no
  // held drafts". `heldDrafts` returns ids, modes and times, never content.
  let held: HeldDraftLine[] | null = null;
  try {
    held = (await respinCredits.heldDrafts(scope, profile.id)).map((draft) => ({
      attemptId: draft.attemptId,
      modeLabel: modeLabel(draft.mode),
      heldUntil: draft.heldUntil.toISOString(),
    }));
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] held drafts unavailable", err);
  }

  return (
    <StudioView
      profileName={profile.displayName}
      recentPacks={recentPacks}
      piece={piece}
      pieceError={pieceError}
      pieceCancelled={pieceCancelled && piece === null}
      entrances={{
        findConceptAction: findConceptAction.bind(null, profile.id),
        selectConceptAction: selectConceptAction.bind(null, profile.id),
        startOwnIdeaAction: startOwnIdeaAction.bind(null, profile.id),
        conceptReady,
        // The SAME offer the panel prices (B-5): the mode the press runs.
        findConceptOffer: modes.find((m) => m.id === FIND_CONCEPT_MODE) ?? null,
        formOptions: CREATIVE_FORM_OPTIONS,
        peopleOptions: CREATIVE_PEOPLE_OPTIONS,
        creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
        ownIdeaMax: OWN_IDEA_MAX,
        reference:
          referenceInPlan === null
            ? { status: "unknown", href: "/trends" }
            : referenceInPlan
              ? { status: "available", href: "/trends" }
              : { status: "not_in_plan" },
        block,
        refusalCopy,
        fallbackCopy: refusalCopy.unknown,
      }}
      run={{
        // A BOUND ARGUMENT, not a hidden field — the same shape `/brain`'s
        // forms use. Still untrusted input on the wire; `mintProfileScope` is
        // what refuses a foreign id.
        action: generateAction.bind(null, profile.id),
        // Audit P3-A4: "Finish this draft", bound to the profile like every
        // other control here; it posts only the held attempt's id.
        held: {
          drafts: held,
          resumeAction: resumeHeldDraftAction.bind(null, profile.id),
        },
        // Audit P3-R2: the ceiling in words, from the config read above —
        // `null` (the courtesy read failed) says there is a limit without a
        // number.
        inputLimitSentence: inputLimitSentence(content?.llm.maxInputTokens ?? null),
        feedbackAction: recordFeedbackAction.bind(null, profile.id),
        // Audit P6-A1 (R-174): "Leave this out of future drafts", bound to the
        // profile; it posts only the stored reaction's id.
        excludeAction: excludeFeedbackFromHistoryAction.bind(null, profile.id),
        resultCount,
        // Launch L3 (R-152): "Remember this for future drafts" — a PROPOSED
        // Kill Test edit, confirmed and activated on the Brain page.
        rememberAction: rememberForFutureDraftsAction.bind(null, profile.id),
        rememberValueMax: BRAIN_EDIT_VALUE_MAX,
        // Proposing a brain edit is the owner's act (R-118); the server's own
        // gate refuses anyone else, and the panel says so instead of offering
        // the press (L3 gate, T-L3).
        rememberAllowed: scope.role === "owner",
        modes,
        costSentence: generateCostSentence(modes, balance, balanceSettling),
        revisionCostSentence: revisionCostSentence(revisionCost),
        revisionCost,
        // R-148: the closed set of form choices and the bounds the parse
        // enforces, from the facade — the panel offers exactly these.
        formOptions: CREATIVE_FORM_OPTIONS,
        peopleOptions: CREATIVE_PEOPLE_OPTIONS,
        creativeBounds: CREATIVE_CONSTRAINT_BOUNDS,
        // THE CLOSED REACTION SET, FROM THE DATABASE'S OWN ENUM. The screen
        // renders one control per member, so it cannot offer a code
        // `recordGenerationFeedback` would refuse — the `INTERVIEW_FIELDS`
        // precedent, and the reason a hand-copied list is not allowed here.
        reactions: GENERATION_FEEDBACK_REACTIONS,
        noteMax: FEEDBACK_NOTE_MAX,
        block,
        activeKinds,
        brainHref: "/brain",
        usageHref: "/usage",
        frameworksHref: "/studio/frameworks",
        refusalCopy,
        fallbackCopy: refusalCopy.unknown,
      }}
      error={error}
      onboardingHref="/onboarding"
      brainHref="/brain"
      usageHref="/usage"
      frameworksHref="/studio/frameworks"
      brainActiveWithoutVoice={
        activeKinds !== null && activeKinds.length > 0 && !activeKinds.includes("Voice")
      }
    />
  );
}

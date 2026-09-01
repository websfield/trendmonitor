// /studio — server component: gate, scope, read, render (slice 6, stage D).
//
// THE SLICE'S ACCEPTANCE TEST LIVES HERE: "generate a set of hooks from their
// own coherent brain, see them kill-tested, and see one atomically settled
// credit debit". This page is what makes stages A, B and C reachable by a
// person for the first time — until it existed, the whole pipeline was
// inventory.
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
import { respinDb } from "@respin/db";
import { respinCredits } from "@respin/credits/app-server";
import { getActiveConfigServer } from "@respin/config/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay } from "../billing-errors";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";
import { generateHooksAction } from "./actions";
import { generateBlock, studioErrorFor, studioRefusalCopy } from "./copy";
import { generateCostSentence } from "./run-copy";
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

  // The pause, read once for the courtesy block. Its authority is the pause
  // gate inside `generate` (step 4), which runs BEFORE the vendor precisely so
  // a zero-priced mode cannot slip past `debitCredits`' own gate.
  let paused = false;
  try {
    const state = await respinCredits.getBillingState(
      scope.workspaceId,
      new Date()
    );
    paused = state.state === "paused";
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] billing state unavailable", err);
  }

  // THE PRICE AND THE BALANCE, from the SAME authorities the operation uses —
  // the active config document and the derived balance. Either may fail, and
  // `generateCostSentence` says the number could not be read rather than
  // inventing one (non-negotiable 6). A stale number here is not a charge: the
  // operation re-reads both and the outcome panel reports what actually moved.
  let cost: number | null = null;
  let balance: number | null = null;
  try {
    const config = await getActiveConfigServer();
    cost = config.content.creditCosts.hookSet;
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[studio] credit cost unavailable", err);
  }
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
        action: generateHooksAction.bind(null, profile.id),
        costSentence: generateCostSentence(cost, balance),
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
    />
  );
}

// /brain — server component: gate, scope, read, render.
//
// THE SLICE'S ACCEPTANCE TEST LIVES HERE: "see a Voice/Strategy/Kill Test
// brain built from a creator's own posts and interview answers, with the
// evidence behind every field, confirm each one, and activate a coherent
// brain" (slice 3b, R6/R8). This page is the surface that makes the whole
// M2b-1/3b provenance substrate reachable by a person for the first time.
//
// Every read goes through a sanctioned surface and nothing else (tenancy T1):
// `scopeForUser` for the scope and `respinDb.readBrainHistory` for each kind.
// No raw tables, no connection, no write
// capability — the default-deny lint and the import-boundary fixtures enforce
// that, and this file is a path they cover.
//
// WHAT THIS PAGE MAY NOT SAY (non-negotiable 6, hardest here). Everything on it
// is a statement about a person — either a model's inference (`voice`) or the
// creator's own declared answer (`strategy`/`killtest`). It says what was
// drafted, from what, and what activating means. It does not say the draft is
// right, that anything was learned, verified or measured, or that the product
// will improve — the learning loop is slice 9 and beyond, and claiming it now
// would be exactly the promise `/onboarding`'s R12 rule exists to forbid, on a
// screen where the claim is about the reader themselves.
import { requireUser } from "@respin/auth";
import { respinDb, INTERVIEW_FIELDS, type InterviewAnswers } from "@respin/db";
import { respinCredits } from "@respin/credits/app-server";
import { redirect } from "next/navigation";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay } from "../billing-errors";
import { readScopeForUser } from "../workspace-scope";
import { logRefusal } from "../safe-log";
import { BRAIN_PENDING_DELETION_REASON, brainErrorFor } from "./copy";
import {
  BrainView,
  selectCurrentBrainState,
  type BrainKindSectionData,
} from "./brain-view";
import {
  activateBrainAction,
  confirmKillTestAction,
  confirmStrategyAction,
  confirmVoiceAction,
  editBrainDocumentAction,
  editDeclaredMetricAction,
} from "./actions";

export const dynamic = "force-dynamic";

const EMPTY_SECTION: BrainKindSectionData = { proposed: null, active: null };

export default async function BrainPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client navigation caches layouts — the
  // gate-completeness suite). ABOVE the try: `requireUser()` refuses by
  // throwing a `redirect()`, so catching it here would turn an expired session
  // into an error banner instead of a sign-in page.
  const user = await requireUser();
  const search = await props.searchParams;

  // `readScopeForUser`, not `withWorkspace` directly, for the reason
  // `scopeForUser` documents: the layout's bootstrap renders CONCURRENTLY with
  // the page, so a brand-new creator's first load can otherwise read before
  // the bootstrap has committed. This page is reachable straight from
  // `/onboarding`'s outcome link, which makes it one of the first a new
  // creator can land on.
  //
  // THE READ GRADE (R-163): during a workspace deletion's grace this page
  // renders a READ-ONLY history — see the grade branch below, which returns
  // before every read the read grade does not accept.
  let scope: Awaited<ReturnType<typeof readScopeForUser>>;
  try {
    scope = await readScopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profiles: Awaited<ReturnType<typeof scope.accessors.creatorProfiles>>;
  try {
    profiles = await scope.accessors.creatorProfiles();
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] profile list unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profile: Awaited<
    ReturnType<typeof respinDb.selectedProfileForMember>
  > = null;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] selected profile unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  // NO PROFILE, NO BRAIN — and this is a named state, not an error. A creator
  // who has not made a profile yet has nothing to confirm, and telling them
  // where to start is the honest answer.
  if (!profile && profiles.length === 0) {
    return (
      <BrainView
        profileName="this creator"
        voice={EMPTY_SECTION}
        strategy={EMPTY_SECTION}
        killtest={EMPTY_SECTION}
        voiceHistory={[]}
        strategyHistory={[]}
        killtestHistory={[]}
        performanceHistory={[]}
        proposalHistory={[]}
        assetCounts={null}
        interviewTouchedButUndrafted={{ strategy: false, killtest: false }}
        decideBlock={null}
        confirmVoiceAction="/brain"
        confirmStrategyAction="/brain"
        confirmKillTestAction="/brain"
        editVoiceAction="/brain"
        editStrategyAction="/brain"
        editKillTestAction="/brain"
        editMetricAction="/brain"
        activateVoiceAction="/brain"
        activateStrategyAction="/brain"
        activateKillTestAction="/brain"
        exportJsonHref={null}
        exportMarkdownHref={null}
        error={brainErrorFor(typeof search.e === "string" ? search.e : undefined)}
      />
    );
  }

  if (!profile) {
    redirect("/onboarding?choose=profile");
  }

  // The annotate-mode history is also the current read. An affected version
  // remains visible with an evidence note instead of turning the page into an
  // outage. The view suppresses decisions for an annotated proposed version,
  // while the edit path remains available to replace it.
  let voiceHistory: Awaited<ReturnType<typeof respinDb.readBrainHistory>>;
  let strategyHistory: Awaited<ReturnType<typeof respinDb.readBrainHistory>>;
  let killtestHistory: Awaited<ReturnType<typeof respinDb.readBrainHistory>>;
  try {
    voiceHistory = await respinDb.readBrainHistory(scope, profile.id, "voice");
    strategyHistory = await respinDb.readBrainHistory(scope, profile.id, "strategy");
    killtestHistory = await respinDb.readBrainHistory(scope, profile.id, "killtest");
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] version history unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  // Only a proposal newer than the active version is actionable. A stale
  // proposal left behind by an interrupted or older lifecycle remains in the
  // complete history below, but cannot regain confirm/edit/activate controls.
  const voice = selectCurrentBrainState(voiceHistory);
  const strategy = selectCurrentBrainState(strategyHistory);
  const killtest = selectCurrentBrainState(killtestHistory);

  // THE GRADE BRANCH (R-163, P5-R3). Under a read-grade scope this page has
  // made exactly five reads — `creatorProfiles`, `selectedProfileForMember`
  // and the three `readBrainHistory` calls above, every one through the read
  // grade's own guards — and makes NO other. The Performance Meta history,
  // the proposal history and its evidence, the asset counts, the interview
  // draft and the pause courtesy read are not called: they are not readers the
  // read grade serves, and `hasOpenPause(scope.workspaceId)` would not even
  // compile under the read grade's id brand. The view's existing null states
  // render in their place, and one decide block names the pending deletion
  // and the page that cancels it. Every write control renders closed; the
  // export links stay, because the export is the point.
  if ("grade" in scope) {
    const exportProfileId = encodeURIComponent(profile.id);
    return (
      <BrainView
        profileName={profile.displayName}
        voice={voice}
        strategy={strategy}
        killtest={killtest}
        voiceHistory={voiceHistory}
        strategyHistory={strategyHistory}
        killtestHistory={killtestHistory}
        performanceHistory={null}
        proposalHistory={null}
        assetCounts={null}
        interviewTouchedButUndrafted={{ strategy: false, killtest: false }}
        decideBlock={{ reason: BRAIN_PENDING_DELETION_REASON }}
        confirmVoiceAction="/brain"
        confirmStrategyAction="/brain"
        confirmKillTestAction="/brain"
        editVoiceAction="/brain"
        editStrategyAction="/brain"
        editKillTestAction="/brain"
        editMetricAction="/brain"
        activateVoiceAction="/brain"
        activateStrategyAction="/brain"
        activateKillTestAction="/brain"
        exportJsonHref={`/api/export?profile=${exportProfileId}&format=json`}
        exportMarkdownHref={`/api/export?profile=${exportProfileId}&format=markdown`}
        error={brainErrorFor(typeof search.e === "string" ? search.e : undefined)}
      />
    );
  }

  // Performance Meta and proposal history are independent asset reads. A
  // failure is named in their own panels rather than being misrepresented as
  // an empty history or taking the creator's existing brain out with it.
  let performanceHistory: Parameters<typeof BrainView>[0]["performanceHistory"] = null;
  try {
    performanceHistory = await respinDb.readBrainHistory(
      scope,
      profile.id,
      "performance_meta"
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] Performance Meta history unavailable", err);
  }

  let proposalHistory: Parameters<typeof BrainView>[0]["proposalHistory"] = null;
  try {
    const proposals = await respinDb.promotionProposalHistory(scope, profile.id);
    proposalHistory = await Promise.all(
      proposals.map(async (proposal) => {
        try {
          const review = await respinDb.promotionProposalReview(
            scope,
            profile.id,
            proposal.id
          );
          return {
            proposal,
            resultEvidenceIds: review.resultEvidence.map((row) => row.id),
            feedbackEvidenceIds: review.feedbackEvidence.map((row) => row.feedbackId),
          };
        } catch (err) {
          rethrowNextControlFlow(err);
          logRefusal("[brain] proposal evidence membership unavailable", err);
          return { proposal, resultEvidenceIds: null, feedbackEvidenceIds: null };
        }
      })
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] proposal history unavailable", err);
  }

  // The aggregate is a dedicated, scoped DB reader. Do not count the bounded
  // result/feedback lists here: C7 requires the exact asset total.
  let assetCounts: Parameters<typeof BrainView>[0]["assetCounts"] = null;
  try {
    assetCounts = await respinDb.brainAssetSummary(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] exact asset counts unavailable", err);
  }

  // Read once for the courtesy block below. A failure must not take the page
  // down: the pause is a courtesy here and the authority is the refusal
  // `confirmBrainDocFields` / `activateBrainDocCoherent` raise.
  //
  // AND IT ASKS THE AUTHORITY THE GATES ASK (tenancy gate round 2,
  // 2026-09-01). This read was `getBillingState(...).state === "paused"` —
  // `isPausedSubscription`, the `subscriptions.pausedAt` MIRROR — while
  // `writeBrainDoc` and `activateBrainDocCoherent` refuse on `hasOpenPause`
  // over `pause_periods`. Where the two disagree the screen offered edit,
  // confirm and activate to a workspace the server refuses, after the creator
  // had written the edit. `@respin/db`'s `hasOpenPause` docblock names the
  // mirror as "the drift bug this function exists to make impossible"; this
  // screen was reading the mirror.
  let paused = false;
  try {
    paused = await respinCredits.hasOpenPause(scope.workspaceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[brain] pause state unavailable", err);
  }

  // MAY THIS READER DECIDE? Asked here, where `scope.role` and the pause are
  // already known, so a control is not offered to somebody the server will
  // refuse. IT IS NOT THE ENFORCEMENT and must never become it — a server
  // action is a POST endpoint reachable without this page rendering at all, and
  // `assertOwner` / `hasOpenPause` inside the capabilities are what refuse.
  //
  // VIEWERS AND EDITORS ARE REFUSED: `decisions.md` R-118 supersedes R-43.
  // Durable brain edits, confirmation and activation are owner-only. ONE
  // decideBlock, shared across all three kinds: role
  // and pause are workspace-level facts, not per-kind ones (R12).
  const decideBlock =
    scope.role !== "owner"
      ? {
          reason:
            `You have ${scope.role} access to this workspace, so you cannot edit, confirm or activate these rules. They decide durable creator state, so R-118 requires owner access. Ask a workspace owner.`,
        }
      : paused
        ? {
          reason:
              "This workspace's subscription is paused, so brain edits, confirmations and activation are unavailable. Existing versions are untouched. You can still read history and export your data; resume on the billing page to make changes.",
          }
        : null;

  // TENANCY GATE FINDING (2026-08-30): a creator whose ONLY answer for a
  // target (strategy/killtest) is a decided-EMPTY list — a real, deliberate
  // "I have none" — gets NO document (`buildDocContents`'s `evidence.length
  // > 0` gate, correctly avoiding `writeBrainDoc`'s own vacuous-document
  // refusal from aborting the whole submission). Without this read, that
  // renders IDENTICALLY to "never started the interview at all" — the
  // review screen told them their answer would become a document, and then
  // it silently didn't, with no way to tell the two states apart and no way
  // to resubmit (R11 permanently bars it). This read is what tells them
  // apart: the submitted draft's own `answers` still show what was decided,
  // even when nothing citable came of it for THIS target.
  let interviewTouchedButUndrafted = { strategy: false, killtest: false };
  try {
    const draft = await respinDb.getInterviewDraft(scope, profile.id);
    if (draft?.submittedAt) {
      const answers = draft.answers as InterviewAnswers;
      const touchedTarget = (target: "strategy" | "killtest") =>
        INTERVIEW_FIELDS.some(
          (f) => f.target === target && answers[f.key] !== undefined
        );
      interviewTouchedButUndrafted = {
        strategy: strategy.proposed === null && strategy.active === null && touchedTarget("strategy"),
        killtest: killtest.proposed === null && killtest.active === null && touchedTarget("killtest"),
      };
    }
  } catch (err) {
    rethrowNextControlFlow(err);
    // A COURTESY READ, like the pause check below — its whole job is a
    // clearer empty-state sentence, never a gate. Its failure must not take
    // the page down; the generic "Nothing drafted yet" copy is still
    // truthful (if less specific) if this read fails.
    logRefusal("[brain] interview draft unavailable for empty-state copy", err);
  }

  const voiceProposedId = voice.proposed?.brainDocId;
  const strategyProposedId = strategy.proposed?.brainDocId;
  const killtestProposedId = killtest.proposed?.brainDocId;
  const voiceEditId = voiceProposedId ?? voice.active?.brainDocId;
  const strategyEditId = strategyProposedId ?? strategy.active?.brainDocId;
  const killtestEditId = killtestProposedId ?? killtest.active?.brainDocId;
  const exportProfile = encodeURIComponent(profile.id);

  return (
    <BrainView
      profileName={profile.displayName}
      voice={voice}
      strategy={strategy}
      killtest={killtest}
      voiceHistory={voiceHistory}
      strategyHistory={strategyHistory}
      killtestHistory={killtestHistory}
      performanceHistory={performanceHistory}
      proposalHistory={proposalHistory}
      assetCounts={assetCounts}
      interviewTouchedButUndrafted={interviewTouchedButUndrafted}
      decideBlock={decideBlock}
      // BOUND ARGUMENTS, not hidden fields, so the form has nothing to tamper
      // with — a convenience, never the control: every id here is still
      // untrusted input on the wire, and `ProfileScope.mint` / `readOwnBrainDoc`
      // are what refuse a foreign one. Falling back to this page's own URL when
      // there is no proposed version, rather than to another action, because a
      // fallback that SUBMITS somewhere can do something unintended if an
      // unreachable branch ever becomes reachable.
      confirmVoiceAction={
        voiceProposedId
          ? confirmVoiceAction.bind(null, profile.id, voiceProposedId)
          : "/brain"
      }
      confirmStrategyAction={
        strategyProposedId
          ? confirmStrategyAction.bind(null, profile.id, strategyProposedId)
          : "/brain"
      }
      confirmKillTestAction={
        killtestProposedId
          ? confirmKillTestAction.bind(null, profile.id, killtestProposedId)
          : "/brain"
      }
      editVoiceAction={
        voiceEditId
          ? editBrainDocumentAction.bind(null, profile.id, voiceEditId)
          : "/brain"
      }
      editStrategyAction={
        strategyEditId
          ? editBrainDocumentAction.bind(null, profile.id, strategyEditId)
          : "/brain"
      }
      editKillTestAction={
        killtestEditId
          ? editBrainDocumentAction.bind(null, profile.id, killtestEditId)
          : "/brain"
      }
      editMetricAction={
        strategyEditId
          ? editDeclaredMetricAction.bind(null, profile.id, strategyEditId)
          : "/brain"
      }
      // ONE ACTION, `activateBrainAction`, BOUND THREE WAYS — each to whichever
      // kind's proposed document exists (R8). All three calls reach
      // `respinDb.activateBrainCoherent`; only the `brainDocId` differs.
      activateVoiceAction={
        voiceProposedId
          ? activateBrainAction.bind(null, profile.id, voiceProposedId)
          : "/brain"
      }
      activateStrategyAction={
        strategyProposedId
          ? activateBrainAction.bind(null, profile.id, strategyProposedId)
          : "/brain"
      }
      activateKillTestAction={
        killtestProposedId
          ? activateBrainAction.bind(null, profile.id, killtestProposedId)
          : "/brain"
      }
      exportJsonHref={`/api/export?profile=${exportProfile}&format=json`}
      exportMarkdownHref={`/api/export?profile=${exportProfile}&format=markdown`}
      error={brainErrorFor(typeof search.e === "string" ? search.e : undefined)}
    />
  );
}

// /results — server component: gate, bootstrap-safe scope, selected profile,
// scoped reads, render (slice 9a, R5-R9/R12/R20).
//
// THIS IS THE SCREEN 9A EXISTS FOR: "log a result against one of their own
// generations — honestly labelled, per-lever, with its confounders — and see
// it compared to the median of their own eligible past results, or read
// exactly which population is short and by how many". Until this page offers
// the form and renders the comparison, both are inventory.
//
// EVERY READ GOES THROUGH A SANCTIONED SURFACE AND NOTHING ELSE (tenancy T1):
// `scopeForUser` for bootstrap-safe scope, `respinDb` for every scoped read.
// No raw tables, no connection, and NO `@respin/brain` — the comparison is
// fetched already built, for the reason `./projection.ts` records at length.
//
// EVERY READ BELOW THE SCOPE IS CONTAINED, NOT SWALLOWED. A refusal renders
// `AccessRefusal` with the shared copy and is logged by code (`safe-log.ts`);
// nothing here degrades to a page that quietly shows fewer results than the
// creator has, because a comparison over a subset nobody mentioned is the one
// failure this screen cannot survive.
//
// ---------------------------------------------------------------------------
// THE ONE READER THIS PAGE STILL WAITS ON, and it is the slice's decided seam
// rather than an open question.
//
//   respinDb.resultComparisons(scope, profileId)
//       => Promise<{ stratum; treatmentKey; comparisons }[]>
//
// TWO WRITTEN-DOWN DECISIONS LEFT THE COMPARISON WITH NO CALLER, which is what
// this page found: `results-ops.ts`'s header says `@respin/db` "may never
// grow" a comparison (contract C5 makes `buildLeverComparisons` the one
// builder), and `eslint.config.mjs`'s catch-all denies `@respin/brain` to
// `app/**` — saying, in its own entry, that 9a's screen "therefore needs a
// facade — a scoped accessor that fetches AND compares — or the comparison is
// unreachable from a browser". Both are right about their own concern; between
// them there was nobody allowed to call it.
//
// THE RESOLUTION, taken at the slice level and coded against here: `@respin/db`
// depends on `@respin/brain`, and `resultComparisons` is a COMPOSITION — it
// fetches through the cage and hands the already-scoped rows to
// `buildLeverComparisons`. It is not a second comparison site, so
// `results-ops.ts`'s rule survives whole (no median is computed there; one is
// fetched), and `app/**` keeps its default deny — which matters more than the
// convenience, because the facade is where profile scoping happens and
// `buildLeverComparisons` trusts its caller to have done it (REQ-A03, R-9).
//
// IT MUST NOT BE PAGE-CLAMPED. A median over a page is not a median: the list
// below is deliberately clamped and SAYS SO, and the comparison cannot be,
// because a silently narrowed cohort is a wrong number rather than a partial
// list.
//
// NO GROUP-LEVEL UNIT. `LeverComparison` already carries `unit`, so a second
// copy on the group would be two answers that could disagree with nothing to
// adjudicate — see `comparison-view.tsx`'s `metricKey` docblock.
// ---------------------------------------------------------------------------
import {
  CHECK,
  RESULT_AUDIENCE_CLASSES,
  RESULT_CONFOUNDER_CODES,
  RESULT_EVIDENCE_STATES,
  RESULT_LEVERS,
  RESULT_NOTE_MAX,
  respinDb,
} from "@respin/db";
import { requireUser } from "@respin/auth";
import { respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay } from "../billing-errors";
import { logRefusal } from "../safe-log";
import { scopeForUser } from "../workspace-scope";
// The platform list is the STUDIO's, imported rather than re-typed: a result
// is logged about a draft that named a platform, and two lists would let a
// creator log "TikTok" against a draft written for "Tiktok" — two strata
// wearing one name, which is the exact failure the platform predicate exists
// to prevent. `run-copy.ts` has no value imports, so this costs no server module.
import { PLATFORM_OPTIONS } from "../studio/run-copy";
import {
  decidePromotionAction,
  logResultAction,
  refreshPromotionAction,
  reviewPromotionAction,
} from "./actions";
import {
  RESULTS_LIST_PAGE,
  isoDay,
  logResultBlock,
  noDeclaredMetricDetail,
} from "./copy";
import { LogPanel } from "./log-panel";
import { PromotionPanel, type PromotionPanelProps } from "./promotion-panel";
import { projectPromotionReview } from "./promotion-review";
import { comparisonGroupView, resultRowView } from "./projection";
import { ResultsView, type ResultsViewState } from "./results-view";

export const dynamic = "force-dynamic";

const BRAIN_HREF = "/brain";
const ONBOARDING_HREF = "/onboarding";

export default async function ResultsPage() {
  // Above the try: unauthenticated redirects remain Next control flow.
  const user = await requireUser();

  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[results] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profile: Awaited<ReturnType<typeof respinDb.selectedProfileForMember>>;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[results] selected profile unavailable", err, {
      workspaceId: scope.workspaceId,
    });
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  if (!profile) {
    const state: ResultsViewState = {
      kind: "no_profile",
      reason:
        "There is no creator profile selected for this workspace, so there is nobody whose results these would be.",
      onboardingHref: ONBOARDING_HREF,
    };
    return <ResultsView state={state} />;
  }

  // Read proposal history separately from access resolution. History is a
  // read, so it remains visible to a Free member, a viewer, and during a
  // pause. A configuration failure is operational, not a statement about the
  // creator's plan, and does not erase history.
  let proposalReviews: PromotionPanelProps["reviews"] = [];
  let proposalHistoryState: PromotionPanelProps["historyState"] = "complete";
  try {
    const history = await respinDb.promotionProposalHistory(scope, profile.id);
    const settled = await Promise.allSettled(
      history.map((proposal) => respinDb.promotionProposalReview(scope, profile.id, proposal.id))
    );
    // FIELD BY FIELD (audit Phase 2 gate, tenancy): the client panel receives
    // the transport shape, never the DB object — the same projection the
    // review action applies.
    proposalReviews = settled.flatMap((item) => item.status === "fulfilled" ? [projectPromotionReview(item.value)] : []);
    if (settled.some((item) => item.status === "rejected")) {
      proposalHistoryState = "partial";
    }
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[results] proposal history unavailable", err, {
      workspaceId: scope.workspaceId,
      profileId: profile.id,
    });
    proposalHistoryState = "unavailable";
  }

  let promotionAccess: PromotionPanelProps["access"];
  let logBlock: { reason: string } | null;
  try {
    const [entitlement, paused] = await Promise.all([
      respinCredits.performanceLearningEntitlementFor(scope.workspaceId, new Date()),
      respinCredits.hasOpenPause(scope.workspaceId),
    ]);
    const viewer = scope.role === "viewer";
    logBlock = viewer
      ? { reason: "You have viewer access. Logging a result writes to this creator's record, so it needs editor or owner access." }
      : entitlement === "view_only"
        ? { reason: "This workspace has Free view-only performance-record access. Results history remains available; logging a result requires full access." }
        : null;
    promotionAccess = viewer
      ? { kind: "view_only", reason: "You have viewer access. Proposal history is available, but refreshing or deciding a proposal needs editor or owner access." }
      : paused
        ? { kind: "view_only", reason: "This paid workspace is paused. Results and proposal history remain available, but proposal refresh and decisions resume only after the pause ends." }
        : entitlement === "view_only"
          ? { kind: "view_only", reason: "Brain-update proposals also require full access." }
          : { kind: "full" };
  } catch (err) {
    rethrowNextControlFlow(err);
    const copy = billingErrorDisplay(err);
    logRefusal("[results] performance learning access unavailable", err, {
      workspaceId: scope.workspaceId,
      profileId: profile.id,
    });
    const reason = `${copy.title}: ${copy.detail}`;
    promotionAccess = { kind: "operational", reason };
    logBlock = { reason };
  }

  // R8, BEFORE ANYTHING ELSE IS READ. A result is a measurement and a
  // measurement needs a declared unit and direction; with none there is
  // nothing to log a number against, and this page will not pick one. The
  // refusal names the remedy and the form is not rendered at all.
  let metric: Awaited<ReturnType<typeof respinDb.declaredMetricForProfile>>;
  try {
    metric = await respinDb.declaredMetricForProfile(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[results] declared metric unavailable", err, {
      workspaceId: scope.workspaceId,
      profileId: profile.id,
    });
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  if (metric === null) {
    const state: ResultsViewState = {
      kind: "no_declared_metric",
      detail: noDeclaredMetricDetail(BRAIN_HREF),
      brainHref: BRAIN_HREF,
    };
    return <ResultsView state={state} />;
  }

  let results: Awaited<ReturnType<typeof respinDb.listResults>>;
  let generations: Awaited<
    ReturnType<typeof respinDb.generationsForResultLog>
  >;
  try {
    [results, generations] = await Promise.all([
      // ONE MORE THAN THE LIST SHOWS, so "there are more" is something this
      // page OBSERVED rather than assumed. The scoped reader is clamped by
      // default, and a clamped page rendered under a heading that claims
      // completeness is the `/usage` defect this product has already shipped
      // once — see `RESULTS_LIST_PAGE`.
      respinDb.listResults(scope, profile.id, { limit: RESULTS_LIST_PAGE + 1 }),
      respinDb.generationsForResultLog(scope, profile.id),
    ]);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[results] scoped result reads unavailable", err, {
      workspaceId: scope.workspaceId,
      profileId: profile.id,
    });
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  // ---------------------------------------------------------------------
  // THE COMPARISON READ IS CONTAINED ON ITS OWN, and it did not used to be.
  //
  // ONE BAD ROW USED TO TAKE THE WHOLE PAGE DOWN. A single
  // `ComparisonInputError` — raised at nine sites over rows this product has
  // already stored — refused the log FORM and the results LIST along with the
  // comparison. That is the "control becomes the outage" shape (CLAUDE.md,
  // 2026-07-30) with a sharp edge: `results` is append-only with NO DELETE
  // PATH, so if a poisoning vector ever opens, the creator can neither remove
  // the offending row nor log anything new, and `comparison_input`'s "reload
  // the page and try again" becomes untrue on a permanent outage.
  //
  // THE EARLIER ARGUMENT FOR ALL-OR-NOTHING WAS ABOUT A DIFFERENT RISK, and it
  // is answered rather than dropped: rendering the list beside a SILENTLY
  // missing comparison would be indistinguishable from "nothing is comparable
  // yet". So the section is not silent — it renders its own named refusal in
  // place, with the same copy the whole-page refusal used to carry. The
  // creator can still log, still read their history, and is still told the
  // comparison failed and why.
  //
  // MIGRATION 0031 CLOSED THE NaN VECTOR AT THE DATABASE, which narrows how a
  // bad row gets in. It does not close this: the declared-metric throws are
  // held by an ARGUMENT about how `recordResult` derives two fields from one
  // read, not by a constraint, and an argument is not a thing a row obeys.
  // ---------------------------------------------------------------------
  let comparisons: Awaited<ReturnType<typeof respinDb.resultComparisons>> = [];
  let comparisonError: ReturnType<typeof billingErrorDisplay> | null = null;
  try {
    comparisons = await respinDb.resultComparisons(scope, profile.id);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[results] comparison unavailable", err, {
      workspaceId: scope.workspaceId,
      profileId: profile.id,
    });
    comparisonError = billingErrorDisplay(err);
  }

  const logPanel = (
    <LogPanel
      action={logResultAction.bind(null, profile.id)}
      generations={generations.map((g) => ({
        generationId: g.id,
        // Mode plus the ISO day it was written. Enough to recognise a draft,
        // and nothing about what it said: the picker is a list of a creator's
        // own outputs, not a place to re-render one.
        label: `${g.mode} — ${isoDay(g.createdAt)}`,
      }))}
      platforms={PLATFORM_OPTIONS}
      // EVERY CLOSED SET COMES FROM `@respin/db`'s OWN `as const` ARRAY, the
      // `GENERATION_FEEDBACK_REACTIONS` rule: one source rather than a
      // hand-copied list that can drift from the enum the database CHECKs
      // against — a drifted confounder code is a checkbox whose only outcome
      // is a refusal.
      audienceClasses={RESULT_AUDIENCE_CLASSES}
      evidenceStates={RESULT_EVIDENCE_STATES}
      confounderCodes={RESULT_CONFOUNDER_CODES}
      levers={RESULT_LEVERS}
      // The note ceiling, from the package that enforces it. The screen states
      // the number it was given and holds none of its own.
      noteMax={RESULT_NOTE_MAX}
      block={logBlock ?? logResultBlock({ isViewer: false })}
    />
  );

  const state: ResultsViewState = {
    kind: "ready",
    profileName: profile.displayName,
    metric: { label: metric.label, key: metric.key, unit: metric.unit, direction: metric.direction },
    // OBSERVED, NOT INFERRED: the read asked for one more row than the list
    // shows, so a 51st row is evidence of more and its absence is evidence of
    // none. Nothing here divides, estimates or assumes.
    results: results.slice(0, RESULTS_LIST_PAGE).map(resultRowView),
    moreResults: results.length > RESULTS_LIST_PAGE,
    comparisons: comparisons.map(comparisonGroupView),
    // The comparison section's OWN failure, rendered in place. `null` on the
    // happy path; the section says nothing about a failure that did not happen.
    comparisonError: comparisonError
      ? { title: comparisonError.title, detail: comparisonError.detail }
      : null,
  };
  return <ResultsView state={state} logPanel={logPanel} promotionPanel={
    <PromotionPanel
      access={promotionAccess}
      reviews={proposalReviews}
      historyState={proposalHistoryState}
      refreshAction={refreshPromotionAction.bind(null, profile.id)}
      reviewAction={reviewPromotionAction.bind(null, profile.id)}
      decideAction={decidePromotionAction.bind(null, profile.id)}
      // The client panel may not import `@respin/db`; it takes the marker
      // from here (audit Phase 2, P2-R8).
      checkMarker={CHECK}
    />
  } />;
}

// /studio/frameworks — server component: gate, scope, read, render (slice 7,
// R5b/R5c/REQ-D05).
//
// THIS PAGE IS WHAT MAKES STAGE A'S FRAMEWORK SURFACE REACHABLE. `frameworks.ts`
// shipped a shared-library reader, a private CRUD trio, a versioning rule, a
// mechanism-level content scan and a tier gate, and until this file existed
// none of it had a user path — which is inventory, not a capability
// (Definition of Done, reachability).
//
// Every read goes through a sanctioned surface and nothing else (tenancy T1):
// `scopeForUser` for bootstrap-safe scope, `respinDb` for the two framework
// reads, `respinCredits` for the resolved tier, and nothing else. No raw
// tables, no connection, no `@respin/modes` — the default-deny lint and the
// import-boundary fixtures enforce that, and this file is a path they cover.
//
// EVERY READ BELOW THE SCOPE IS FAIL-SOFT ON PURPOSE, exactly as on `/studio`:
// the shared list, the private list and the tier are all COURTESIES that decide
// what the screen says and whether a control is offered. None of them is the
// enforcement — `assertMayCurate`, `assertEntitled` and `ProfileScope.mint`
// re-read everything inside the operation, at operation time. If this page and
// those gates ever disagree, the gates are right and the creator sees a refusal
// with copy.
//
// IT IS UNDER `/studio` DELIBERATELY, and not only for tidiness: `/studio` is
// already a `PROTECTED_PREFIX`, so this page inherits the middleware redirect
// and the gate-completeness suite's demand for `requireUser()` without anybody
// having to remember to add a prefix — the hole `findUngatedGroupFiles` exists
// to catch.
import { requireUser } from "@respin/auth";
import {
  FRAMEWORK_GOALS,
  FRAMEWORK_LIST_MAX,
  FRAMEWORK_NAME_MAX,
  FRAMEWORK_NICHES,
  FRAMEWORK_TEXT_MAX,
  PRIVATE_FRAMEWORK_COUNT_MAX,
  respinDb,
  type EligibleFramework,
  type PrivateFrameworkEntitlement,
} from "@respin/db";
import {
  privateFrameworkEntitlement,
  respinCredits,
} from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { AccessRefusal } from "../../access-refusal";
import { billingErrorDisplay } from "../../billing-errors";
import { logRefusal } from "../../safe-log";
import { scopeForUser } from "../../workspace-scope";
import {
  approveFrameworkAction,
  createFrameworkAction,
  editFrameworkAction,
  retireFrameworkAction,
} from "./actions";
import { curateBlock, frameworkErrorFor, frameworkRefusalCopy } from "./copy";
import {
  PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
  PRIVATE_FRAMEWORKS_PAUSED,
  VIEWER_CANNOT_CURATE,
} from "./form-copy";
import { FrameworksView } from "./frameworks-view";
import type { FrameworkView } from "./view-state";

export const dynamic = "force-dynamic";

/**
 * A stored row → what the screen renders.
 *
 * A PROJECTION, NOT A PASS-THROUGH. The row carries `owner_profile_id`,
 * `workspace_id`, `curated_by` and `superseded_at`; handing it to a client
 * component would ship a creator's scope columns to the browser to render a
 * name, and nothing would notice.
 *
 * THE JSONB COLUMNS ARE TYPED `unknown` AT THE EDGE and are narrowed here with
 * a total, defensive read rather than a cast: `beats` and friends are written
 * by whatever build was deployed when the row was stored, and a row from an
 * older shape must render as much as it can rather than take the page down.
 * Nothing is invented — an unreadable list renders as an empty one, which is
 * what "we have nothing to show for this field" looks like.
 */
function toView(row: EligibleFramework): FrameworkView {
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const objects = <T,>(value: unknown, read: (o: Record<string, unknown>) => T): T[] =>
    Array.isArray(value)
      ? value
          .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
          .map(read)
      : [];
  const str = (o: Record<string, unknown>, key: string): string =>
    typeof o[key] === "string" ? (o[key] as string) : "";
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    version: row.version,
    visibility: row.visibility,
    curatorStatus: row.curatorStatus,
    confidence: row.confidence,
    saturation: row.saturation,
    saturationNotice: row.saturationNotice,
    beats: strings(row.beats),
    whyItConverts: row.whyItConverts,
    applicability: objects(row.applicability, (o) => ({
      goal: str(o, "goal"),
      niche: str(o, "niche"),
      note: str(o, "note"),
    })),
    evidenceEntries: objects(row.evidenceEntries, (o) => ({
      kind: str(o, "kind"),
      ref: str(o, "ref"),
      observation: str(o, "observation"),
    })),
    testedCaveats: strings(row.testedCaveats),
    // DERIVED FROM THE ROW'S OWN COLUMNS, never from a second rule: what makes
    // a framework usable is `recommendable()` in `@respin/db` — approved, not
    // retired, not superseded — and the two facts a reader needs are the two
    // this screen prints.
    approved: row.curatorStatus === "approved",
    retired: row.retiredAt !== null,
  };
}

export default async function FrameworksPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client navigation caches layouts — the
  // gate-completeness suite). ABOVE the try: `requireUser()` refuses by
  // throwing a `redirect()`, so catching it here would turn an expired session
  // into an error banner instead of a sign-in page.
  const user = await requireUser();
  const search = await props.searchParams;
  const error = frameworkErrorFor(
    typeof search.e === "string" ? search.e : undefined
  );

  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[frameworks] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  let profile: Awaited<ReturnType<typeof respinDb.selectedProfileForMember>> =
    null;
  try {
    profile = await respinDb.selectedProfileForMember(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[frameworks] selected profile unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  // THE SHARED LIBRARY TAKES NO SCOPE, and that is correct rather than an
  // omission: a shared framework has both owner columns NULL by CHECK, so it
  // belongs to nobody and is the same set for every workspace. What keeps a
  // creator's private row out of this list is the `visibility = 'shared'`
  // predicate inside the reader, not a filter here.
  let shared: FrameworkView[] = [];
  try {
    shared = (await respinDb.sharedFrameworkLibrary()).map(toView);
  } catch (err) {
    rethrowNextControlFlow(err);
    // FAIL SOFT AND VISIBLY. An empty shared list renders its own named state
    // ("this server has no approved shared frameworks"), which is a wrong
    // signpost rather than a wrong action — nothing on this page writes, and
    // the generation path reads the library for itself.
    logRefusal("[frameworks] shared library unavailable", err);
  }

  const refusalCopy = frameworkRefusalCopy();

  if (!profile) {
    return (
      <FrameworksView
        profileName={null}
        shared={shared}
        privateFrameworks={[]}
        curate={null}
        block={null}
        error={error}
        onboardingHref="/onboarding"
        studioHref="/studio"
        // NO PROFILE, NO EXPORT LINK: `/api/export` is per-creator-profile and
        // refuses a request without one, so a link built here would 400. The
        // view renders the export note only in the profile branch anyway; this
        // is `null` so a future reader cannot move it and get a broken link.
        exportHref={null}
      />
    );
  }

  let privateFrameworks: FrameworkView[] = [];
  try {
    privateFrameworks = (
      await respinDb.listPrivateFrameworks(scope, profile.id)
    ).map(toView);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[frameworks] private frameworks unavailable", err);
  }

  // THE TIER, AND THE ONE PRODUCER OF THE ENTITLEMENT ANSWER.
  //
  // FAIL TO `not_included`, never to `included`. A failed read here decides
  // whether a control is OFFERED, and the two failure directions are not
  // symmetrical: under-offering costs a creator a reload, while over-offering
  // hands them a form whose submit is refused by `PrivateFrameworkTierError`
  // after they have written a framework. The action re-resolves the tier and
  // refuses on its own terms either way — this is the courtesy, not the gate.
  let entitlement: PrivateFrameworkEntitlement = "not_included";
  let paused = false;
  try {
    const state = await respinCredits.getBillingState(
      scope.workspaceId,
      new Date()
    );
    entitlement = privateFrameworkEntitlement(state.tier);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[frameworks] plan entitlement unavailable", err);
  }
  // THE PAUSE COMES FROM THE AUTHORITY, NOT FROM `BillingState` (tenancy gate
  // round 2, 2026-09-01). `state.state === "paused"` is `isPausedSubscription`
  // — the `subscriptions.pausedAt` MIRROR — while all four framework gates
  // refuse on `hasOpenPause` over `pause_periods`. Where the two disagreed this
  // screen offered the curate form to a workspace the server refuses, AFTER the
  // creator had written a framework: the exact over-offering `pausedReason`
  // exists to prevent. A SECOND read rather than one, and the cost is stated:
  // the tier and the pause can now come from two snapshots taken microseconds
  // apart. That is the cheaper error — the alternative is one snapshot of the
  // WRONG fact, and the entitlement half is not what the server gates on.
  try {
    paused = await respinCredits.hasOpenPause(scope.workspaceId);
  } catch (err) {
    rethrowNextControlFlow(err);
    // FAILS TO `false`, and it must: the enforcement is `hasOpenPause` inside
    // each action. Guessing "paused" here would withhold the form from a
    // workspace that is not paused and tell them something untrue about their
    // billing.
    logRefusal("[frameworks] pause state unavailable", err);
  }

  const block = curateBlock({
    isViewer: scope.role === "viewer",
    entitlement,
    // REQ-G08's pre-emptive half, from the PAUSE AUTHORITY — a SECOND read,
    // separately caught, and the paragraph above states why the one-call
    // consistency was given up (the mirror and `pause_periods` can disagree,
    // and only one of them gates the write).
    //
    // THIS COMMENT SAID THE OPPOSITE UNTIL 2026-09-02, and it was the exact
    // half a reader checks: it claimed the pause came from "the SAME billing
    // read the entitlement comes from — one call", and that "a failed read
    // leaves `paused` false AND `entitlement` at `not_included`, so the control
    // is still withheld". Both were true before the authority split and false
    // after it. THE TWO FAILURE DIRECTIONS ARE NOW DIFFERENT, deliberately, and
    // `tests/pause-authority.test.tsx` drives each one: a failed TIER read
    // withholds the form (`entitlement` defaults to `not_included` — fail
    // CLOSED, because over-offering costs a creator a written framework), while
    // a failed PAUSE read OFFERS it (`paused` defaults to false — fail SOFT,
    // because guessing "paused" tells a workspace something untrue about its
    // own billing). Enforcement is `hasOpenPause` inside every framework action
    // either way; this is the courtesy, never the gate.
    paused,
    viewerReason: VIEWER_CANNOT_CURATE,
    notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
    pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
  });

  return (
    <FrameworksView
      profileName={profile.displayName}
      shared={shared}
      privateFrameworks={privateFrameworks}
      curate={
        block === null
          ? {
              // BOUND ARGUMENTS, not hidden fields — the same shape every other
              // write control on these screens uses. Still untrusted input on
              // the wire; `ProfileScope.mint` is what refuses a foreign id.
              createAction: createFrameworkAction.bind(null, profile.id),
              editAction: editFrameworkAction.bind(null, profile.id),
              approveAction: approveFrameworkAction.bind(null, profile.id),
              retireAction: retireFrameworkAction.bind(null, profile.id),
              frameworks: privateFrameworks.map((f) => ({
                id: f.id,
                name: f.name,
                version: f.version,
                approved: f.approved,
                retired: f.retired,
              })),
              // THE CLOSED VOCABULARIES AND THE BOUNDS, FROM `@respin/db`. A
              // hand-copied list or a typed-in number here is the drift
              // `POST_CONTENT_MAX` was allowlisted to prevent: the limit the
              // form states and the limit the write enforces must be one value.
              goals: FRAMEWORK_GOALS,
              niches: FRAMEWORK_NICHES,
              nameMax: FRAMEWORK_NAME_MAX,
              textMax: FRAMEWORK_TEXT_MAX,
              listMax: FRAMEWORK_LIST_MAX,
              countMax: PRIVATE_FRAMEWORK_COUNT_MAX,
              refusalCopy,
              fallbackCopy: refusalCopy.unknown,
            }
          : null
      }
      block={block}
      error={error}
      onboardingHref="/onboarding"
      studioHref="/studio"
      // THE EXPORT IS PER PROFILE AND PER FORMAT, and both are required by
      // `app/api/export/route.ts` — a bare `/api/export` is a link that
      // refuses. Built the same way `/brain` builds it, from the profile this
      // page already scoped to.
      exportHref={`/api/export?profile=${profile.id}&format=json`}
    />
  );
}

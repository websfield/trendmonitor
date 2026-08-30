// /onboarding — server component: gate, scope, read, render.
//
// Every read goes through a sanctioned surface and nothing else (tenancy T1):
// `respinDb.withWorkspace` for the scope and its accessors,
// `getActiveConfigServer` for the cap and the run price,
// `respinCredits.getBillingState` for the tier and `respinCredits.getBalance`
// for the balance. No raw tables, no connection, no write capability — the
// default-deny lint and the import-boundary fixtures enforce that, and this
// file is one of the paths they cover.
//
// R12, AND IT IS THE REQUIREMENT MOST EASILY LOST: this page claims nothing
// about what happens next. No brain is built here and no script is generated,
// so no sentence on it may imply otherwise. The copy lives in
// `onboarding-view.tsx`, which a test renders with fixtures.
//
// WHAT CHANGED IN SLICE 2a: a credit IS spent here now, by the run control, so
// this page reads the price and the balance and says both before the control is
// pressed (R18). That is the ONE thing the old "no credit is spent" line no
// longer covers; every other promise it forbade is still forbidden and still
// scanned.
//
// WHAT CHANGED IN SLICE 3: the run control now sends the creator's OWN POSTS
// and comes back with a DRAFT set of rules about how they write. So R12
// narrows a second time and only a second time — this screen may now say that
// a draft was made and how many rules it holds. It still may not say the draft
// is accurate, that anything was learned, or that the product will improve:
// the draft is `proposed`, nothing acts on it, and the creator confirms each
// rule beside its quote on `/brain` before it becomes what the product
// believes (REQ-B02, R-8).
import { requireUser } from "@respin/auth";
import {
  DISPLAY_NAME_MAX,
  POST_CONTENT_MAX,
  REFERENCE_COUNT_MAX,
  respinDb,
} from "@respin/db";
import { respinCredits } from "@respin/credits/app-server";
import { getActiveConfigServer } from "@respin/config/app-server";
import { rethrowNextControlFlow } from "../../../lib/next-control-flow";
import { AccessRefusal } from "../access-refusal";
import { billingErrorDisplay } from "../billing-errors";
import { scopeForUser } from "../workspace-scope";
import { logRefusal } from "../safe-log";
import {
  ONBOARDING_ERROR_CODES,
  capReached,
  onboardingErrorFor,
  onboardingStep,
} from "./copy";
import { preSendSentence, runCostSentence } from "./run-copy";
import {
  OnboardingView,
  type PastedPost,
  type ReferencePost,
} from "./onboarding-view";
import {
  addOwnPostAction,
  addReferencePostAction,
  createProfileAction,
  runVoiceInferenceAction,
} from "./actions";
import type { RefusalCopyByCode } from "./run-inference-panel";

export const dynamic = "force-dynamic";

/**
 * How many pasted posts the page shows. One more is fetched to detect "more".
 *
 * `PAGE_SIZE + 1` must stay within the accessor's own ceiling: at
 * `PAGE_SIZE >= ONBOARDING_PAGE_MAX` the fetch clamps, `morePosts` becomes
 * permanently false, and the page silently claims completeness — the exact
 * dishonesty the clamp was added to prevent (production gate NOTE,
 * 2026-08-27). Asserted in `tests/onboarding-ui.test.tsx`.
 */
const PAGE_SIZE = 25;

export default async function OnboardingPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client navigation caches layouts — the
  // gate-completeness suite). ABOVE the try: `requireUser()` refuses by
  // throwing a `redirect()`, so catching it here would turn an expired session
  // into an error banner instead of a sign-in page.
  const user = await requireUser();
  const search = await props.searchParams;

  // Scoping is a REFUSAL PATH, not an assumption — `withWorkspace` throws for
  // an unknown user and for a user in more than one workspace, and both have
  // rendered copy that is only reachable if this call is inside a try.
  //
  // `scopeForUser`, not `withWorkspace` directly: this is the first page a new
  // creator lands on, and the layout's bootstrap renders CONCURRENTLY with it —
  // so the very first load refused with "This workspace is not available" until
  // this call ensured the workspace itself. See `../workspace-scope.ts`.
  let scope: Awaited<ReturnType<typeof respinDb.withWorkspace>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }

  // WRAPPED, like every other read on this page. These two were the only ones
  // outside a try, so a transient database failure on either dead-ended on
  // Next's default error screen rather than on named copy (production gate,
  // 2026-08-27). `app/(product)/error.tsx` is now the floor beneath all of
  // them; this is the named refusal that keeps the floor from being the plan.
  let profiles: Awaited<ReturnType<typeof scope.accessors.creatorProfiles>>;
  try {
    profiles = await scope.accessors.creatorProfiles();
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding] profile list unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  const step = onboardingStep(profiles.length);

  // Read once, used by `writeBlock` below. A failure here must not take the
  // page down — the pause is a courtesy on this screen, and the authority is
  // the refusal `createProfile` raises.
  let paused = false;
  try {
    const state = await respinCredits.getBillingState(scope.workspaceId, new Date());
    paused = state.state === "paused";
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding] pause state unavailable", err);
  }

  // THE PLAN'S OWN NUMBERS, read from the two authorities rather than assumed:
  // the tier from `getBillingState` (the sole tier authority) and the cap from
  // the active config document. Both are the SAME sources `createProfile`
  // consults, so the sentence this page shows and the rule the server enforces
  // cannot drift — and if either read fails, the page must not invent a
  // number: it says the plan is unknown and leaves the form alone, because the
  // enforcement is `ProfileCapError` on submit and never this display.
  //
  // `null` WHEN EITHER READ FAILS, rather than a sentinel. An earlier draft of
  // this page defaulted to `{tier: "current", cap: Infinity}` so the shape
  // stayed non-null, and the cap sentence then rendered "Your current plan
  // includes Infinity creator profiles" on an unseeded config — a number the
  // product invented, on the screen whose whole job is to be honest about what
  // it knows. A nullable plan makes that unrepresentable.
  let plan: { tier: string; cap: number; used: number } | null = null;
  try {
    const [state, config] = await Promise.all([
      respinCredits.getBillingState(scope.workspaceId, new Date()),
      getActiveConfigServer(),
    ]);
    plan = {
      tier: state.tier,
      cap: config.content.profileCaps[state.tier],
      used: profiles.length,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    // A config read fails closed (no seeded config); a billing-state read can
    // fail with it. Neither may take this page down, and neither may be
    // rendered as a cap — the billing page is where the operator's remedy is.
    logRefusal("[onboarding] plan unavailable", err);
  }

  // THE PRICE AND THE BALANCE THE RUN CONTROL STATES (R18).
  //
  // Read from the SAME two authorities the operation itself consults — the
  // active config document for the price and the ledger for the balance — so
  // the sentence the creator reads before pressing and the arithmetic the
  // server does on press cannot come from different places. Both stay NULL on
  // failure: `runCostSentence` says the price could not be read rather than
  // showing a number this page invented, exactly as the cap sentence does.
  //
  // NOT THE ENFORCEMENT, and it must never become it. `runInference` re-reads
  // both inside its debit transaction; this is the courtesy that stops a
  // creator pressing a control whose price they were never told.
  let runCost: number | null = null;
  let runBalance: number | null = null;
  // The corpus bound the pre-press sentence states (compliance gate round 2,
  // 2026-08-29). Same authority `inferVoice` reads (the active config), same
  // null-on-failure honesty as the price: the sentence says a ceiling exists
  // and could not be shown, never the old unbounded "the posts you saved
  // above".
  let corpusMax: number | null = null;
  try {
    const config = await getActiveConfigServer();
    runCost = config.content.creditCosts.onboardingBrainRebuild;
    corpusMax = config.content.onboarding.voiceCorpusMaxPosts;
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding] run price unavailable", err);
  }
  try {
    const view = await respinCredits.getBalance(scope.workspaceId);
    runBalance = view.balance;
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding] balance unavailable", err);
  }

  // ONE EXTRA ROW, purely to answer "is there more?" honestly — the `/usage`
  // page's precedent. The accessor clamps, so without this the page would have
  // to either claim completeness it cannot check or count the whole table.
  //
  // CLASS-FILTERED IN THE QUERY, not filtered after the page (tenancy gate
  // CHANGE, slice 4 round 2, 2026-08-29). The first version of this read
  // fetched one unfiltered page and split it into "own" and "reference" by
  // JavaScript filter AFTER paging — the exact anti-pattern `ownPostsNewest`'s
  // own docblock names and closes for the INFERENCE path, reopened here on
  // the DISPLAY path: a creator with more of one class than the page size saw
  // the OTHER class's list wrongly collapse (an empty "Your posts", or a
  // reference count sentence understating the true total). Both reads below
  // now pass `inputClass` straight into the accessor's WHERE clause.
  let fetched: Awaited<ReturnType<typeof respinDb.listOnboardingInputs>> = [];
  try {
    fetched =
      step === "paste-posts"
        ? await respinDb.listOnboardingInputs(
            scope,
            profiles[0].id,
            { limit: PAGE_SIZE + 1 },
            "own_post"
          )
        : [];
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding] post list unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  const morePosts = fetched.length > PAGE_SIZE;
  const posts: PastedPost[] = fetched
    .slice(0, PAGE_SIZE)
    .map((r) => ({ id: r.id, createdAt: r.createdAt, content: r.content }));

  // REFERENCE POSTS (slice 4) — read SEPARATELY, at a limit matching
  // `REFERENCE_COUNT_MAX`, class-filtered in the same query-predicate way.
  let referenceFetched: Awaited<ReturnType<typeof respinDb.listOnboardingInputs>> = [];
  try {
    referenceFetched =
      step === "paste-posts"
        ? await respinDb.listOnboardingInputs(
            scope,
            profiles[0].id,
            { limit: REFERENCE_COUNT_MAX },
            "reference"
          )
        : [];
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[onboarding] reference list unavailable", err);
  }
  const referencePosts: ReferencePost[] = referenceFetched
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      content: r.content,
      sourceUrl: r.sourceUrl,
    }));

  // MAY THIS READER WRITE? Asked here, where `scope.role` and the pause are
  // already known, so the form is not offered to someone the server will
  // refuse. The repo's own precedent is `billing-view.tsx`, which renders a
  // disabled control with a named reason precisely because "offering a button
  // that then fails on click" was a prior finding — this page did not reuse it
  // (production gate, 2026-08-27).
  //
  // IT IS NOT THE ENFORCEMENT and must never become it: a server action is a
  // POST endpoint reachable without this page rendering at all. The enforcement
  // is `ProfileRoleError` / `WorkspacePausedError` in the packages.
  //
  // A PAUSE BLOCKS THE PROFILE, NOT THE PASTE — and getting that wrong is what
  // the round-2 compliance gate caught. `createProfile` refuses under an open
  // pause (a per-tier allowance is an entitlement, R-35 §3); `appendOwnPost`
  // deliberately does NOT, because refusing it would throw away text the person
  // typed. The first version of this block withheld both forms and told a
  // paused creator "nothing new can be added" — denying them a write the design
  // grants and stating a rule the server does not enforce.
  const roleBlock =
    scope.role === "viewer"
      ? {
          reason:
            "You have viewer access to this workspace, so you cannot add creator profiles or posts. Ask a workspace owner for editor access.",
        }
      : null;
  const createBlock =
    roleBlock ??
    (paused
      ? {
          reason:
            "This workspace's subscription is paused, so no new creator profile can be added until it resumes. Everything you have already saved is untouched — resume on the billing page to continue.",
        }
      : null);
  // The paste form survives a pause, by design.
  const pasteBlock = roleBlock;
  // The reference form survives a pause too, for the identical reason (R-35
  // §3): refusing it would throw away text the person typed, and a reference
  // post is not a per-tier entitlement any more than an own post is.
  const referenceBlock = roleBlock;

  // THE REFERENCE CAP'S COUNT. `referencePosts` above was already read at a
  // limit EQUAL to `REFERENCE_COUNT_MAX`, and `appendReferencePost` refuses
  // (never clamps) past that ceiling — so the list this page already holds
  // cannot itself exceed the cap, and its length IS the count, with no second
  // read to keep in sync with a limit that could drift from it.
  const referenceCount = referencePosts.length;
  // THE RUN IS BLOCKED BY BOTH, and that is not the paste rule with a different
  // name. `runInference` gates on the pause at operation entry, before the
  // model call (R-30.1) — a paused workspace's entitlements are frozen, and
  // spending credits is the clearest case of one. The paste survives a pause
  // because refusing it throws away text the person typed; a run that is
  // refused throws away nothing.
  const runBlock =
    roleBlock ??
    (paused
      ? {
          reason:
            "This workspace's subscription is paused, so nothing can be run against it until it resumes. Nothing has been spent. Resume on the billing page to continue.",
        }
      : null);

  // The refusal words, resolved HERE because the panel is a client component
  // and `./copy.ts` reaches `@respin/credits/app-server` for its instanceof
  // table. Built from the closed code set, so the panel cannot render another
  // surface's product copy — the same rule the `?e=` channel already obeys.
  const refusalCopy: RefusalCopyByCode = Object.fromEntries(
    ONBOARDING_ERROR_CODES.map((code) => [code, onboardingErrorFor(code)!])
  );

  return (
    <>
      <OnboardingView
        step={step}
        plan={plan}
        // Unknown plan → the form stays available and the server decides. The
        // opposite default would lock a creator out of onboarding because of an
        // operator's unseeded config, which is a refusal they cannot act on.
        capReached={plan !== null && capReached(plan.used, plan.cap)}
        profileName={profiles[0]?.displayName ?? null}
        posts={posts}
        morePosts={morePosts}
        referencePosts={referencePosts}
        referenceCount={referenceCount}
        referenceCountMax={REFERENCE_COUNT_MAX}
        postLimit={POST_CONTENT_MAX}
        nameLimit={DISPLAY_NAME_MAX}
        createBlock={createBlock}
        pasteBlock={pasteBlock}
        referenceBlock={referenceBlock}
        pageSize={PAGE_SIZE}
        // NULL WITHOUT A PROFILE, so a control that spends money is never
        // rendered before the thing it would spend against exists. Bound the
        // same way the paste action is, and for the same reason: the id is
        // still untrusted input on the wire, and `mintProfileScope` is what
        // refuses a foreign one.
        run={
          profiles[0]
            ? {
                action: runVoiceInferenceAction.bind(null, profiles[0].id),
                costSentence: runCostSentence(runCost, runBalance),
                sendSentence: preSendSentence(corpusMax),
                block: runBlock,
                refusalCopy,
                fallbackCopy: refusalCopy.unknown,
              }
            : null
        }
        createProfileAction={createProfileAction}
        // The profile id is BOUND rather than carried in a hidden field, so the
        // form has nothing to tamper with. It is still untrusted input on the
        // wire; `ProfileScope.mint` is what refuses a foreign id.
        // ...and when there is no profile the paste form is not rendered at
        // all, so this branch is unreachable. It resolves to the page's own URL
        // rather than to another action, because a fallback that SUBMITS
        // somewhere is a fallback that can do something unintended if the
        // unreachable branch ever becomes reachable.
        addPostAction={
          profiles[0] ? addOwnPostAction.bind(null, profiles[0].id) : "/onboarding"
        }
        addReferenceAction={
          profiles[0]
            ? addReferencePostAction.bind(null, profiles[0].id)
            : "/onboarding"
        }
        // `onboardingErrorFor`, NOT the shared `billingErrorFromCode`: this
        // screen renders only the codes its own actions can emit, with
        // onboarding-specific wording where the shared copy would promise a
        // brain or a credit spend this slice does not do (see ./copy.ts).
        error={onboardingErrorFor(
          typeof search.e === "string" ? search.e : undefined
        )}
      />
      {plan ? null : (
        <p style={{ color: "var(--text-3)", fontSize: "0.9rem" }} data-testid="plan-unknown">
          Your plan could not be read just now, so the profile allowance is not
          shown. Creating a profile still checks it on the server.
        </p>
      )}
    </>
  );
}

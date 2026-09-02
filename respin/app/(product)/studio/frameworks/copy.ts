// The decisions `/studio/frameworks` makes, as PURE functions, plus the closed
// set of refusals this surface may render (slice 7, R5b/R5c/R15).
//
// The rule this file obeys is `../copy.ts`'s and `../../onboarding/copy.ts`'s:
// "decisions live in pure functions, not in page bodies". A page needs a
// session and a database and no test in this repo executes one, so an inline
// ternary in a server component is a decision nothing can assert.
//
// THE COPY THE CLIENT PANEL RENDERS IS IN `./form-copy.ts`, NOT HERE, and that
// separation is a measured one rather than a preference: this module imports
// `../../billing-errors` for its refusal table, which imports
// `@respin/credits/app-server`, which reaches `pg`. Importing a sentence from
// here into the client panel would put a Postgres driver in the browser bundle,
// and `next build` would fail naming `dns` rather than the import.
import type { PrivateFrameworkEntitlement } from "@respin/db";
import {
  BILLING_ERROR_COPY,
  type BillingErrorCode,
  type BillingErrorCopy,
} from "../../billing-errors";

/**
 * Whether the curate controls may be offered at all, and why not if not.
 *
 * A COURTESY, NEVER THE ENFORCEMENT — the same relationship `generateBlock` has
 * to `InferenceRoleError`. A server action is a POST endpoint reachable without
 * this page ever rendering, so the real gates are `assertMayCurate`
 * (`ProfileRoleError`), `assertEntitled` (`PrivateFrameworkTierError`) and
 * `assertNotPaused` (`WorkspacePausedError`) inside `@respin/db`'s framework
 * operations, plus `privateFrameworkEntitlement` in `@respin/credits` which is
 * the one producer of the argument the second one reads. If this function and
 * those gates ever disagree, the gates are right.
 *
 * THE ORDER IS ROLE, THEN PLAN, THEN PAUSE, and it is deliberate: a viewer on
 * a Pro workspace cannot curate whatever the plan says, and telling them "this
 * plan does not include private frameworks" would be false about their
 * workspace. `@respin/db`'s own four write operations check in the same order
 * (`assertMayCurate`, then `assertEntitled`, then `assertNotPaused` inside the
 * transaction), so the screen and the server refuse for the same reason.
 *
 * THE PAUSE BRANCH IS THE HALF THAT WAS MISSING (billing gate, 2026-09-01).
 * The server grew a pause gate on all four writes for REQ-G08 and this function
 * still gated on role and entitlement alone, so a paused workspace was OFFERED
 * a form whose submit `WorkspacePausedError` refuses — the exact shape of
 * over-offering the page's own fail-closed entitlement default exists to avoid,
 * after the creator has written a framework.
 */
export function curateBlock(params: {
  isViewer: boolean;
  entitlement: PrivateFrameworkEntitlement;
  paused: boolean;
  viewerReason: string;
  notInPlanReason: string;
  pausedReason: string;
}): { reason: string; kind: "role" | "plan" | "paused" } | null {
  if (params.isViewer) {
    return { reason: params.viewerReason, kind: "role" };
  }
  if (params.entitlement !== "included") {
    return { reason: params.notInPlanReason, kind: "plan" };
  }
  if (params.paused) {
    return { reason: params.pausedReason, kind: "paused" };
  }
  return null;
}

// ------------------------------------------------- the refusals THIS screen
//
// A CLOSED SET, for the reason `../../onboarding/copy.ts` records: the page
// feeds a `?e=` code from the URL, and `billingErrorFromCode` maps ANY of the
// shared codes to copy — so an arbitrary `?e=` would render another surface's
// product copy here. A code outside this set falls back to `unknown`'s neutral
// words, never to nothing and never to a stranger's sentence.
//
// AND IT IS DERIVED, NOT REMEMBERED. `tests/framework-ui.test.tsx` reads the
// classes constructed by every file on this screen's write path — the
// population is stated there as a LIST, and adding a file to it is what a new
// write path costs (CLAUDE.md, 2026-08-29). The list below is what that scan
// demands plus the classes named beside it in `ALSO_REACHABLE`.
//
// NOTHING HERE SPENDS A CREDIT, and the set shows it: there is no
// `insufficient_credits`, no `llm_*`, no `run_slot_busy`. A framework write is
// a row, not a run — which is why the copy for these says what was not CHANGED
// rather than what was not charged.
export const FRAMEWORK_ERROR_CODES = [
  // --- the framework operations' own refusals (stage A).
  "framework_access",
  "framework_stale",
  "framework_content",
  "framework_limit",
  "private_framework_tier",
  // --- the tier→entitlement producer's (stage C). Not a creator's fault and
  // not a creator's remedy, which is exactly why it needs words of its own.
  "unknown_entitlement_tier",
  // OVER-CAPTURE, KEPT DELIBERATELY — the `uncharged_attempt_cap` precedent on
  // `/studio`. `mode-access.ts` is in the derived population as a WHOLE FILE
  // because it holds `privateFrameworkEntitlement`, the one producer of the
  // argument every write here requires; the same file also holds the tier→mode
  // gate, so its three mode refusals are demanded here even though nothing on
  // this screen runs a mode. The over-capture direction asks for MORE copy,
  // never less, and narrowing the population to dodge it is how a real refusal
  // goes missing (CLAUDE.md, 2026-08-29). Each of the three is honest if it
  // ever renders; none of them can.
  "unknown_mode",
  "mode_not_in_plan",
  "mode_not_built_yet",
  // --- the role gate every profile write shares.
  "profile_role",
  "profile_archived",
  "workspace_paused",
  // --- the cage, and the scope read this page performs before anything else.
  "scope_forgery",
  "workspace_access",
  "profile_access",
  "unknown",
] as const satisfies readonly BillingErrorCode[];

/**
 * Copy whose SHARED wording is honest elsewhere and false here.
 *
 * ONE OVERRIDE, AND IT IS ABOUT MONEY. `workspace_paused`'s shared detail says
 * a pause stops "building or updating a creator brain" — true where it was
 * written, and wrong here twice over: a framework is not a brain document, and
 * curating one spends nothing at all, so a creator refused on this screen would
 * be told about a credit freeze that has nothing to do with what they pressed.
 *
 * WHY A PAUSED WORKSPACE REFUSES A FRAMEWORK WRITE AT ALL, corrected in the
 * action that read the file (billing gate, 2026-09-01). This paragraph used to
 * say the operations had no pause gate and that the code was here only because
 * the page's reads share the scope path. They HAVE one now: `assertNotPaused`
 * runs inside all four write transactions in `packages/db/src/frameworks.ts`
 * (REQ-G08 — private frameworks are a plan feature and a paused subscription is
 * not a live one), so this copy is reachable rather than defensive, and
 * `curateBlock` above withholds the form before a creator writes into it.
 *
 * AND THE SENTENCE LEADS WITH THE RIGHT REASON. The shared copy blames a credit
 * freeze; curating spends nothing, so the honest first clause is the plan
 * feature being on hold — with the credit half kept as the DENIAL, because a
 * creator who half-remembers "a pause freezes credits" is otherwise left to
 * conclude they were charged for something.
 */
const FRAMEWORK_OVERRIDES: Partial<Record<BillingErrorCode, BillingErrorCopy>> =
  {
    workspace_paused: {
      title: "This workspace is paused",
      detail:
        "While a pause is on, this workspace's plan features are on hold, and writing your own frameworks is one of them. Curating a framework spends nothing, so nothing here was refused over money — and nothing was changed either. Your frameworks, every version of them, are exactly where you left them and still readable on this page. Resume from the billing page and this comes back.",
    },
    profile_role: {
      title: "You cannot change this creator's frameworks",
      detail:
        "Writing, approving or retiring a framework lands permanently in this creator's record, so it needs at least editor access to the workspace. Nothing was changed. You can still read every framework on this page. Ask a workspace owner if you need to curate.",
    },
  };

/**
 * The copy `/studio/frameworks` renders for a `?e=` code — closed set,
 * overrides applied.
 *
 * AN UNRECOGNISED CODE FALLS BACK TO `unknown`, it does not vanish: returning
 * `null` made the failure mode silent on `/onboarding` (compliance gate,
 * 2026-08-27), and a refused write that renders no explanation leaves the
 * creator unable to tell a refusal from a page that did nothing.
 */
export function frameworkErrorFor(
  raw: string | undefined
): BillingErrorCopy | null {
  if (!raw) return null;
  const known = (FRAMEWORK_ERROR_CODES as readonly string[]).includes(raw);
  const code = (known ? raw : "unknown") as BillingErrorCode;
  return FRAMEWORK_OVERRIDES[code] ?? BILLING_ERROR_COPY[code];
}

/** Every code this screen can render, with its words. Resolved server-side. */
export function frameworkRefusalCopy(): Record<string, BillingErrorCopy> {
  return Object.fromEntries(
    FRAMEWORK_ERROR_CODES.map((code) => [code, frameworkErrorFor(code)!])
  );
}

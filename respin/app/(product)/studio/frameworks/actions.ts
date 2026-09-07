"use server";

// `/studio/frameworks`' FOUR server actions — write, version, approve, retire
// (slice 7, R5c / REQ-D05).
//
// THIN WRAPPERS, AND THEY DECIDE NOTHING. The cage (`ProfileScope.mint`), the
// role gate (`assertMayCurate`), the plan gate (`assertEntitled`), the strict
// parse that refuses a smuggled `visibility` or `curatorStatus`, the size and
// count bounds, the REQ-D04 mechanism-level scan, the stale-base check, the
// advisory lock and the version mint all live in
// `packages/db/src/frameworks.ts`, and every one of them is tested there,
// against real SQL, without HTTP.
//
// THE ONE DECISION THAT IS NOT THERE IS THE TIER, and it cannot be: `@respin/db`
// has no access to a resolved tier — its sole authority is
// `getWorkspaceBillingState`, which lives in `@respin/credits` and depends on
// this package the other way round (R-30 constraint 2). So every write below
// resolves the tier and passes `privateFrameworkEntitlement(tier)`, which is
// the ONE producer of that argument in the whole product. A LITERAL HERE WOULD
// BE A SECOND ANSWER, and it would be the answer that decides whether a Free
// workspace gets a Pro feature — `tests/framework-ui.test.tsx` scans this file
// for the two literals to make sure neither ever appears.
//
// THE GATE IS ABOVE THE TRY and the catch re-throws Next's control flow as its
// FIRST statement — `requireUser()` refuses by THROWING a `redirect()`, so
// catching it here would turn an expired session into a refusal banner instead
// of `/sign-in`. `tests/action-gate.test.ts` scans app/** for the second rule.
import { requireUser } from "@respin/auth";
import {
  privateFrameworkEntitlement,
  respinCredits,
} from "@respin/credits/app-server";
import { respinDb, type PrivateFrameworkEntitlement } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { logRefusal } from "../../safe-log";
import type { BillingErrorCode } from "../../billing-errors";
import { scopeForUser } from "../../workspace-scope";
import { frameworkContentFromForm } from "./form-state";
import type { FrameworkActionState } from "./view-state";

/**
 * The plan's answer for THIS workspace, resolved from the tier authority.
 *
 * IT DOES NOT FAIL SOFT, and that is the opposite of the page's own courtesy
 * reads: a failed tier read on the page under-offers a control, which costs a
 * creator a reload; a failed tier read HERE would have to choose an
 * entitlement, and both choices are wrong — `included` hands a Free workspace a
 * Pro feature, and `not_included` tells a Pro creator their plan excludes
 * something they paid for. So it throws, the caller's catch turns it into a
 * typed refusal with copy, and nothing is written.
 */
async function entitlementFor(
  scope: Awaited<ReturnType<typeof scopeForUser>>
): Promise<PrivateFrameworkEntitlement> {
  const state = await respinCredits.getBillingState(
    scope.workspaceId,
    new Date()
  );
  return privateFrameworkEntitlement(state.tier);
}

/** One refusal, logged and coded, for every action below. */
function refused(
  act: string,
  err: unknown,
  context: { workspaceId?: string; profileId: string }
): FrameworkActionState {
  return {
    status: "refused",
    // NO CREATOR CONTENT. A framework's text is the creator's own words and a
    // refusal about it names the FIELD, never the value — `FrameworkContentError`
    // carries `field`, and even that stays out of the log line, which takes
    // server-derived identifiers only (see `../../safe-log.ts`).
    code: logRefusal(`[frameworks-action] ${act} refused`, err, {
      ...(context.workspaceId ? { workspaceId: context.workspaceId } : {}),
      profileId: context.profileId,
    }) as BillingErrorCode,
  };
}

/**
 * Write version 1 of a private framework (R5c).
 *
 * `profileId` is a BOUND argument, not a form field — the same shape every
 * other write control on these screens uses. It is a convenience and never the
 * control: a bound argument is encoded in the request like any other, so the id
 * is still untrusted input, and `ProfileScope.mint` inside the operation is
 * what refuses a foreign, nonexistent or malformed one.
 *
 * THE CONTENT IS PASSED AS `unknown` AND VALIDATED IN THE PACKAGE. That is the
 * "validate at the boundary" discipline `writeBrainDoc`'s `content: unknown`
 * already uses: `prepareContent` parses with a `strictObject` (which REFUSES an
 * unknown key rather than stripping it, so a smuggled `visibility: "shared"`
 * cannot become library content), bounds it, and runs the REQ-D04 scan — all
 * inside the call that writes the row. A second validation here would be a
 * second answer free to disagree with the one a creator's data really passes.
 */
export async function createFrameworkAction(
  profileId: string,
  _prev: FrameworkActionState,
  formData: FormData
): Promise<FrameworkActionState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const row = await respinDb.createPrivateFramework(
      scope,
      profileId,
      frameworkContentFromForm(formData),
      await entitlementFor(scope)
    );
    return {
      status: "saved",
      act: "created",
      // FROM THE STORED ROW, never from the form: the creator is told what was
      // written, and `name` is the column the server actually holds.
      name: row.name,
      version: row.version,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    return refused("create", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId,
    });
  }
}

/**
 * Write the NEXT VERSION of a private framework (R5c).
 *
 * A NEW ROW, never an in-place edit, and the previous one is stamped
 * `superseded_at` in the same transaction — `brain_docs`' versioning shape,
 * forced here by `generations.framework_versions`' own promise that "a
 * framework edited later does not rewrite this generation's explanation".
 *
 * `baseFrameworkId` IS THE VERSION THIS EDIT WAS COMPOSED AGAINST, and it is
 * checked against the LIVE one rather than merely against ownership: an edit
 * written against version 2 while version 3 already exists would otherwise
 * silently discard version 3 (a lost update). `FrameworkStaleError` says so and
 * tells the reader to reload; nothing is lost either way, because every version
 * is retained.
 */
export async function editFrameworkAction(
  profileId: string,
  _prev: FrameworkActionState,
  formData: FormData
): Promise<FrameworkActionState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const row = await respinDb.editPrivateFramework(
      scope,
      profileId,
      String(formData.get("baseFrameworkId") ?? ""),
      frameworkContentFromForm(formData),
      await entitlementFor(scope)
    );
    return { status: "saved", act: "edited", name: row.name, version: row.version };
  } catch (err) {
    rethrowNextControlFlow(err);
    return refused("edit", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId,
    });
  }
}

/**
 * A creator approving their OWN private framework (R5c / REQ-D02).
 *
 * SEPARATE FROM WRITING IT, deliberately. REQ-D02 draws no exception for
 * private frameworks — nothing becomes recommendable without an approval — and
 * folding the approval into the write would make "approved" mean nothing more
 * than "saved". The screen says so beside the button (`APPROVE_NOTE`), because
 * a creator would otherwise read the second press as a confirmation dialog.
 */
export async function approveFrameworkAction(
  profileId: string,
  _prev: FrameworkActionState,
  formData: FormData
): Promise<FrameworkActionState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const row = await respinDb.approvePrivateFramework(
      scope,
      profileId,
      String(formData.get("frameworkId") ?? ""),
      await entitlementFor(scope)
    );
    return {
      status: "saved",
      act: "approved",
      name: row.name,
      version: row.version,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    return refused("approve", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId,
    });
  }
}

/**
 * Retire a private framework (R5c / REQ-D02).
 *
 * NOT A DELETE, and the screen says so (`RETIRE_NOTE`): every version of the
 * text stays where it is and stays in the creator's export, and the drafts
 * built with it still name it. What changes is that the reader
 * (`recommendable()` — approved, not retired, not superseded) stops returning
 * it, so nothing new is built from it.
 */
export async function retireFrameworkAction(
  profileId: string,
  _prev: FrameworkActionState,
  formData: FormData
): Promise<FrameworkActionState> {
  const user = await requireUser();
  let scope: Awaited<ReturnType<typeof scopeForUser>> | undefined;
  try {
    scope = await scopeForUser(user);
    const row = await respinDb.retirePrivateFramework(
      scope,
      profileId,
      String(formData.get("frameworkId") ?? ""),
      await entitlementFor(scope)
    );
    return {
      status: "saved",
      act: "retired",
      name: row.name,
      version: row.version,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    return refused("retire", err, {
      ...(scope ? { workspaceId: scope.workspaceId } : {}),
      profileId,
    });
  }
}

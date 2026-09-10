// /settings/account — Phase 10b-1 Task 8: deletion status, request and cancel,
// the billing contact (C3), with copy that describes only shipped behaviour.
// Server component: gate, scope, read, render; every mutation is a server
// action in ./actions.ts.
import { requireUser, resendMailPortFromEnv } from "@respin/auth";
import { respinCredits } from "@respin/credits/app-server";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { AccessRefusal } from "../../access-refusal";
import { billingErrorDisplay } from "../../billing-errors";
import { logRefusal } from "../../safe-log";
import { scopeForUser } from "../../workspace-scope";
import { AccountView, type PendingDeletion } from "./account-view";
import {
  acceptBillingContactAction,
  cancelScopedDeletionAction,
  requestIdentityDeletionAction,
  requestWorkspaceDeletionAction,
} from "./actions";
import { BILLING_CONTACT_ACCEPTED_NOTICE } from "./copy";
import { ACCOUNT_ERROR_CODES, ACCOUNT_ERROR_COPY, type AccountErrorCode } from "./refusal-code";

const NOTICE_COPY: Record<string, string> = {
  workspace_requested: "Workspace deletion requested. It is tombstoned now and will erase after the grace period unless you cancel.",
  identity_requested: "Account deletion requested. Check your email for the single-use recovery link.",
  cancelled: "Deletion cancelled.",
  billing_contact_accepted: BILLING_CONTACT_ACCEPTED_NOTICE,
};

/**
 * States a SCOPED (profile/workspace) deletion can be cancelled from.
 *
 * Keyed on state AND scope. Keyed on state alone, an identity operation in
 * `requested` / `journal_pending` / `tombstoned` rendered a "Cancel deletion"
 * button whose action calls `cancelScopedDeletion`, which refuses
 * `operation_not_available` for identity scope and surfaces the generic "The
 * request was refused." Identity deletions are cancelled from the emailed
 * single-use recovery link instead (`/recover-deletion`), never from here —
 * the person's sessions are revoked at acknowledgement, so in the ordinary
 * walk they cannot reach this page at all. Offering a control that cannot work
 * is worse than offering none.
 */
const CANCELLABLE_STATES = new Set(["requested", "journal_pending", "tombstoned", "external_actions_pending", "grace"]);
const isCancellable = (scope: string, state: string): boolean =>
  scope !== "identity" && CANCELLABLE_STATES.has(state);

const isErrorCode = (value: string): value is AccountErrorCode =>
  (ACCOUNT_ERROR_CODES as readonly string[]).includes(value);

export default async function AccountSettingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const search = await props.searchParams;
  let scope: Awaited<ReturnType<typeof scopeForUser>>;
  try {
    scope = await scopeForUser(user);
  } catch (err) {
    rethrowNextControlFlow(err);
    logRefusal("[account] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  const [workspace] = await scope.accessors.workspace();
  const [{ configured: journalConfigured }, pendingRows, billingContact] = await Promise.all([
    respinDb.deletionJournalStatus(),
    respinDb.pendingDeletions(scope),
    respinCredits.billingContactStatus(scope),
  ]);
  const requestsOpen = respinDb.deletionRequestStatus();
  const pending: PendingDeletion[] = pendingRows.map((op) => ({
    id: op.id,
    scope: op.scope,
    state: op.state,
    requestedAt: op.requestedAt.toISOString(),
    graceExpiresAt: op.graceExpiresAt?.toISOString() ?? null,
    cancellable: isCancellable(op.scope, op.state),
  }));
  const e = typeof search.e === "string" && isErrorCode(search.e) ? search.e : null;
  const ok = typeof search.ok === "string" ? search.ok : null;
  return (
    <AccountView
      workspaceName={workspace?.name ?? ""}
      isOwner={scope.role === "owner"}
      journalConfigured={journalConfigured}
      mailConfigured={resendMailPortFromEnv(process.env) !== null}
      requestsOpen={{ identity: requestsOpen.identity, workspace: requestsOpen.workspace }}
      billingContact={billingContact}
      pending={pending}
      // Own keys only: a crafted `?ok=` naming a prototype member would
      // otherwise hand a function to the banner (lean gate S-2, pre-existing).
      notice={ok && Object.hasOwn(NOTICE_COPY, ok) ? NOTICE_COPY[ok]! : null}
      error={e ? ACCOUNT_ERROR_COPY[e] : null}
      actions={{
        requestWorkspace: requestWorkspaceDeletionAction,
        requestIdentity: requestIdentityDeletionAction,
        cancel: cancelScopedDeletionAction,
        acceptBillingContact: acceptBillingContactAction,
      }}
    />
  );
}

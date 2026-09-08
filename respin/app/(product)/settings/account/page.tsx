// /settings/account — Phase 10b-1 Task 8: deletion status, request and cancel,
// with copy that describes only shipped behaviour. Server component: gate,
// scope, read, render; every mutation is a server action in ./actions.ts.
import { requireUser, resendMailPortFromEnv } from "@respin/auth";
import { respinDb } from "@respin/db";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { AccessRefusal } from "../../access-refusal";
import { billingErrorDisplay } from "../../billing-errors";
import { logRefusal } from "../../safe-log";
import { scopeForUser } from "../../workspace-scope";
import { AccountView, type PendingDeletion } from "./account-view";
import {
  cancelScopedDeletionAction,
  requestIdentityDeletionAction,
  requestWorkspaceDeletionAction,
  type AccountErrorCode,
} from "./actions";

const ERROR_COPY: Record<AccountErrorCode, string> = {
  reauthentication: "Your password did not match. Nothing was changed.",
  journal_unavailable: "The deletion journal is not configured on this server, so the request was refused. Nothing was changed.",
  mail_unavailable: "No mail sender is configured, so the recovery email cannot be sent. Nothing was changed.",
  typed_name: "The name you typed does not match this workspace. Nothing was changed.",
  not_owner: "Only a workspace owner can do this.",
  last_owner: "You are the last owner of a workspace. Transfer ownership or delete that workspace first.",
  not_cancellable: "This deletion has already started erasing and can no longer be cancelled.",
  unknown: "The request was refused. Nothing was changed.",
};

const NOTICE_COPY: Record<string, string> = {
  workspace_requested: "Workspace deletion requested. It is tombstoned now and will erase after the grace period unless you cancel.",
  identity_requested: "Account deletion requested. Check your email for the single-use recovery link.",
  cancelled: "Deletion cancelled.",
};

const CANCELLABLE = new Set(["requested", "journal_pending", "tombstoned", "external_actions_pending", "grace"]);

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
  const [{ configured: journalConfigured }, pendingRows] = await Promise.all([
    respinDb.deletionJournalStatus(),
    respinDb.pendingDeletions(scope),
  ]);
  const pending: PendingDeletion[] = pendingRows.map((op) => ({
    id: op.id,
    scope: op.scope,
    state: op.state,
    requestedAt: op.requestedAt.toISOString(),
    graceExpiresAt: op.graceExpiresAt?.toISOString() ?? null,
    cancellable: CANCELLABLE.has(op.state),
  }));
  const e = typeof search.e === "string" ? (search.e as AccountErrorCode) : null;
  const ok = typeof search.ok === "string" ? search.ok : null;
  return (
    <AccountView
      workspaceName={workspace?.name ?? ""}
      isOwner={scope.role === "owner"}
      journalConfigured={journalConfigured}
      mailConfigured={resendMailPortFromEnv(process.env) !== null}
      pending={pending}
      notice={ok ? (NOTICE_COPY[ok] ?? null) : null}
      error={e && e in ERROR_COPY ? ERROR_COPY[e] : null}
      actions={{
        requestWorkspace: requestWorkspaceDeletionAction,
        requestIdentity: requestIdentityDeletionAction,
        cancel: cancelScopedDeletionAction,
      }}
    />
  );
}

// PURE presentation for /settings/account. The page gates, scopes and reads;
// every branch here renders from a fixture.
import { Banner } from "../../../ui/banner";
import { buttonClass } from "../../../ui/button";
import {
  ACCOUNT_TITLE,
  BILLING_CONTACT_COPY,
  BILLING_CONTACT_NONE_COPY,
  BILLING_CONTACT_OTHER_COPY,
  BILLING_CONTACT_UNKNOWN_COPY,
  BILLING_CONTACT_YOU_COPY,
  ERASURE_HELD_COPY,
  EXPORT_COPY,
  IDENTITY_DELETE_COPY,
  JOURNAL_UNAVAILABLE_COPY,
  NO_REFUND_COPY,
  RECOVERY_MAIL_UNAVAILABLE_COPY,
  REQUESTS_CLOSED_COPY,
  RETAINED_COPY,
  WORKSPACE_DELETE_COPY,
} from "./copy";

export type FormAction = string | ((formData: FormData) => void | Promise<void>);

export type PendingDeletion = {
  id: string;
  scope: "identity" | "profile" | "workspace";
  state: string;
  requestedAt: string;
  graceExpiresAt: string | null;
  cancellable: boolean;
};

export type BillingContactView = {
  hasCustomer: boolean;
  contactUserId: string | null;
  isCurrentUser: boolean;
};

export type AccountViewProps = {
  workspaceName: string;
  isOwner: boolean;
  journalConfigured: boolean;
  mailConfigured: boolean;
  /** `RESPIN_DELETION_REQUEST_SCOPES`: a closed scope renders as closed, never as a button that refuses. */
  requestsOpen: { identity: boolean; workspace: boolean };
  billingContact: BillingContactView;
  pending: readonly PendingDeletion[];
  notice: string | null;
  error: string | null;
  actions: {
    requestWorkspace: FormAction;
    requestIdentity: FormAction;
    cancel: FormAction;
    acceptBillingContact: FormAction;
  };
};

function billingContactSentence(contact: BillingContactView): string {
  if (!contact.hasCustomer) return BILLING_CONTACT_NONE_COPY;
  if (contact.isCurrentUser) return BILLING_CONTACT_YOU_COPY;
  if (contact.contactUserId === null) return BILLING_CONTACT_UNKNOWN_COPY;
  return BILLING_CONTACT_OTHER_COPY;
}

export function AccountView(props: AccountViewProps) {
  const canAcceptContact = props.isOwner && props.billingContact.hasCustomer && !props.billingContact.isCurrentUser;
  return (
    <section>
      <h1>{ACCOUNT_TITLE}</h1>
      {props.error ? <Banner title={props.error} data-testid="account-error" /> : null}
      {props.notice ? <Banner title={props.notice} data-testid="account-notice" /> : null}

      <h2>Your data</h2>
      <p>{EXPORT_COPY}</p>
      <p>{RETAINED_COPY}</p>

      {props.pending.length > 0 ? (
        <>
          <h2>Deletion in progress</h2>
          <ul data-testid="pending-deletions">
            {props.pending.map((op) => (
              <li key={op.id}>
                <strong>{op.scope}</strong> — {op.state}
                {op.graceExpiresAt ? <> · grace ends {op.graceExpiresAt}</> : null}
                {op.cancellable ? (
                  <form action={props.actions.cancel} data-testid={`cancel-${op.id}`}>
                    <input type="hidden" name="operationId" value={op.id} />
                    <label>
                      Password
                      <input type="password" name="password" autoComplete="current-password" required />
                    </label>
                    <button className={buttonClass("secondary")} type="submit">Cancel deletion</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {!props.journalConfigured ? (
        <Banner title={JOURNAL_UNAVAILABLE_COPY} data-testid="journal-unavailable" />
      ) : null}
      <p className="muted">{ERASURE_HELD_COPY}</p>

      <h2>Billing contact</h2>
      <p>{BILLING_CONTACT_COPY}</p>
      <p data-testid="billing-contact-status">{billingContactSentence(props.billingContact)}</p>
      {canAcceptContact ? (
        <form action={props.actions.acceptBillingContact} data-testid="accept-billing-contact">
          <label>
            Password
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button className={buttonClass("secondary")} type="submit">
            Accept billing contact
          </button>
        </form>
      ) : null}

      <h2>Delete this workspace</h2>
      <p>{WORKSPACE_DELETE_COPY}</p>
      <p>{NO_REFUND_COPY}</p>
      {!props.requestsOpen.workspace ? (
        <p className="muted" data-testid="workspace-requests-closed">{REQUESTS_CLOSED_COPY}</p>
      ) : props.isOwner ? (
        <form action={props.actions.requestWorkspace} data-testid="request-workspace-deletion">
          <label>
            Type the workspace name to confirm
            <input type="text" name="typedName" placeholder={props.workspaceName} required />
          </label>
          <label>
            Password
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button className={buttonClass("secondary")} type="submit" disabled={!props.journalConfigured}>
            Delete workspace
          </button>
        </form>
      ) : (
        <p className="muted">Only a workspace owner can delete it.</p>
      )}

      <h2>Delete your account</h2>
      <p>{IDENTITY_DELETE_COPY}</p>
      {!props.mailConfigured ? (
        <Banner title={RECOVERY_MAIL_UNAVAILABLE_COPY} data-testid="mail-unavailable" />
      ) : null}
      {!props.requestsOpen.identity ? (
        <p className="muted" data-testid="identity-requests-closed">{REQUESTS_CLOSED_COPY}</p>
      ) : (
        <form action={props.actions.requestIdentity} data-testid="request-identity-deletion">
          <label>
            Password
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button
            className={buttonClass("secondary")}
            type="submit"
            disabled={!props.journalConfigured || !props.mailConfigured}
          >
            Delete my account
          </button>
        </form>
      )}
    </section>
  );
}

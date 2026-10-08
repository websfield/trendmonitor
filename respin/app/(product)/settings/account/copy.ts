// Owner-facing copy for /settings/account, in a module a test can import.
//
// Every sentence here describes SHIPPED behaviour and nothing else (plan
// 10b-1 "Done when": public privacy/delete copy describes only shipped
// behavior). `tests/account-copy.test.ts` pins each claim to the function or
// constant that makes it true, so a sentence cannot outlive the code.
import { EXTERNAL_COPIES } from "@respin/db";

import { COHORT_RETENTION_YEARS, DELETION_GRACE_DAYS, LAST_CAPABLE_COPY_DAY } from "./grace";

export const ACCOUNT_TITLE = "Account and data";

export const EXPORT_COPY =
  "Your brain export is available from the Brain page as JSON and Markdown. It streams directly to you; the server keeps no staged copy.";

// R-162: any active owner may cancel, not only the one who asked. R-163: the
// export and the brain history stay readable during grace — through
// `readScopeForUser`, which prefers an ACTIVE workspace, so only for a person
// whose only workspace this is (R-166, gate M3: the old "your brain export
// stays available" was false for anyone holding a second workspace).
export const WORKSPACE_DELETE_COPY = `Deleting this workspace tombstones it at once and blocks access, then erases it after a ${DELETION_GRACE_DAYS}-day grace period. During grace any owner of the workspace can cancel from this page, and anyone for whom it is their only workspace can still export its brain and read its history. Revoked keys and invites do not come back on cancel.`;

// R-160: a workspace you are the last owner of is no longer a refusal — it is
// scheduled for deletion with the account, and cancelling the account's
// deletion leaves it cancellable from this page.
export const IDENTITY_DELETE_COPY = `Deleting your account signs you out everywhere, suspends your memberships, and sends one single-use recovery link by email. You can cancel within ${DELETION_GRACE_DAYS} days with that link plus your password. Shared workspace work stays with the other owners. Every workspace you are the last owner of is scheduled for deletion with your account, on the same grace period; if you cancel your account's deletion, those workspace deletions stay pending until you cancel them from this page. You cannot delete your account while you are the billing contact of a workspace that is not being deleted, or while a workspace you belong to that is not being deleted has a billing account whose contact has not been confirmed.`;

/** R-163: rendered in place of the request form while this workspace's own deletion is pending. */
export const WORKSPACE_DELETION_PENDING_COPY =
  "This workspace's deletion is already pending. Cancel it above to make changes again; until it erases, your brain export and its history stay available.";

export const NO_REFUND_COPY =
  "Deletion itself creates no refund or credit. A paid period keeps its original schedule.";

export const RETAINED_COPY = [
  // "at least": R-122 keeps the destructive seven-year receiver DISABLED until
  // the jurisdiction and ledger-chain review, so today these records are
  // retained WITHOUT a bound. `account-copy.test.ts` pins this sentence to the
  // clock's kind, so enabling the receiver forces the copy to change.
  `What survives erasure: financial records (ledger, subscription and pause history, usage cost) for at least seven years with the workspace link replaced by a pseudonymous key; the deletion receipt for one year; and the anonymous signup-day cohort counts for ${COHORT_RETENTION_YEARS} years.`,
  // Every external holder, from the registry — never a hand-written subset. The
  // previous sentence named Stripe alone, which implied provider erasure
  // everywhere else.
  `Outside this database, and outside what deletion reaches: ${EXTERNAL_COPIES.map((copy) => copy.holder).join(", ")}.`,
  // The day-28 window, stated rather than implied. Erasure at day 7 is not the
  // last day a copy can exist.
  `Encrypted backups taken before erasure are pruned on their own schedule, so the last capable copy can persist to day ${LAST_CAPABLE_COPY_DAY}.`,
].join(" ");

export const JOURNAL_UNAVAILABLE_COPY =
  "Deletion is not enabled on this server yet: the external deletion journal is not configured, so a request would stop at 'journal pending' and nothing would be erased. An operator needs to provision it (RUNBOOK: deletion journal) before this control does anything.";

export const ERASURE_HELD_COPY =
  "Erasure runs only from the background worker and only for scopes the operator has enabled. Until then a request waits at the end of its grace period rather than erasing.";

export const RECOVERY_MAIL_UNAVAILABLE_COPY =
  "Account deletion needs the recovery email, and no mail sender is configured on this server (RESEND_API_KEY / RESEND_FROM). Workspace deletion does not need it.";

/**
 * `RESPIN_DELETION_REQUEST_SCOPES` does not name this scope. Rendered in place
 * of the request control, because a button that refuses is worse than a
 * sentence that says why. Cancelling an in-flight deletion is never gated.
 */
export const REQUESTS_CLOSED_COPY =
  "Requesting this kind of deletion is not open on this server yet. An operator enables it per scope; any deletion already in progress can still be cancelled from this page.";

// Plan C3: the billing contact. Each sentence is pinned in account-copy.test.ts.
export const BILLING_CONTACT_COPY =
  "A workspace with a billing account has one billing contact: the owner whose email is on the payment provider's customer record. That person cannot delete their account until another owner accepts the contact, which rewrites the provider record with the accepting owner's email before anything changes here.";

export const BILLING_CONTACT_YOU_COPY =
  "You are this workspace's billing contact. To delete your account, another owner must accept the billing contact first.";

// EVERY member, not only owners: the unknown contact may be a demoted
// ex-owner, so the rule holds editors and viewers too (`assertBillingContactReleased`).
export const BILLING_CONTACT_UNKNOWN_COPY =
  "This workspace's billing contact has not been confirmed. Until an owner accepts it, no member of this workspace can delete their account.";

/** The `?ok=billing_contact_accepted` notice — here so the forbidden-claims scan sees it. */
export const BILLING_CONTACT_ACCEPTED_NOTICE =
  "You are now this workspace's billing contact. The payment provider's customer record carries your email.";

export const BILLING_CONTACT_OTHER_COPY =
  "Another owner is this workspace's billing contact.";

export const BILLING_CONTACT_NONE_COPY =
  "This workspace has no billing account, so it has no billing contact.";

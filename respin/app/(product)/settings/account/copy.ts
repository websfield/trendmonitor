// Owner-facing copy for /settings/account, in a module a test can import.
//
// Every sentence here describes SHIPPED behaviour and nothing else (plan
// 10b-1 "Done when": public privacy/delete copy describes only shipped
// behavior). `tests/account-copy.test.ts` pins each claim to the function or
// constant that makes it true, so a sentence cannot outlive the code.
import { DELETION_GRACE_DAYS } from "./grace";

export const ACCOUNT_TITLE = "Account and data";

export const EXPORT_COPY =
  "Your brain export is available from the Brain page as JSON and Markdown. It streams directly to you; the server keeps no staged copy.";

export const WORKSPACE_DELETE_COPY = `Deleting this workspace tombstones it at once and blocks access, then erases it after a ${DELETION_GRACE_DAYS}-day grace period. During grace the same owner can cancel from this page. Revoked keys and invites do not come back on cancel.`;

export const IDENTITY_DELETE_COPY = `Deleting your account signs you out everywhere, suspends your memberships, and sends one single-use recovery link by email. You can cancel within ${DELETION_GRACE_DAYS} days with that link plus your password. Shared workspace work stays with the other owners; you cannot delete your account while you are the last owner of a workspace.`;

export const NO_REFUND_COPY =
  "Deletion itself creates no refund or credit. A paid period keeps its original schedule.";

export const RETAINED_COPY =
  "What survives erasure: financial records (ledger, subscription and pause history, usage cost) for seven years with the workspace link replaced by a pseudonymous key; the deletion receipt for one year; and the anonymous signup-day cohort counts. Copies you downloaded, and copies held by Stripe under its own retention, are outside what this deletes.";

export const JOURNAL_UNAVAILABLE_COPY =
  "Deletion is not enabled on this server yet: the external deletion journal is not configured, so a request would stop at 'journal pending' and nothing would be erased. An operator needs to provision it (RUNBOOK: deletion journal) before this control does anything.";

export const ERASURE_HELD_COPY =
  "Erasure runs only from the background worker and only for scopes the operator has enabled. Until then a request waits at the end of its grace period rather than erasing.";

export const RECOVERY_MAIL_UNAVAILABLE_COPY =
  "Account deletion needs the recovery email, and no mail sender is configured on this server (RESEND_API_KEY / RESEND_FROM). Workspace deletion does not need it.";

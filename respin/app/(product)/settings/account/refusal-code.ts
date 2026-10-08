// The refusal a deletion or billing-contact action redirects with. PURE, so a
// test can prove every code the lifecycle throws lands on a sentence the page
// renders (previously `deletion_refused:last_owner` reached the page as
// "unknown", because the mapper read an `err.code` the lifecycle never sets).
import {
  BillingContactProviderError,
  BillingReauthenticationError,
  BillingRoleError,
  NoStripeCustomerError,
} from "@respin/credits/app-server";
import { REQUESTS_DISABLED_CODE } from "@respin/db";

export const ACCOUNT_ERROR_CODES = [
  "reauthentication",
  "journal_unavailable",
  "mail_unavailable",
  "typed_name",
  "not_owner",
  "last_owner",
  "billing_contact_handover_required",
  "billing_contact_unknown",
  "requests_closed",
  "no_customer",
  "provider_refused",
  "not_cancellable",
  "unknown",
] as const;

export type AccountErrorCode = (typeof ACCOUNT_ERROR_CODES)[number];

/**
 * The lifecycle refuses with `Error("deletion_refused:<code>")` and nothing
 * else (deletion-lifecycle.ts `refuse`); the billing package refuses with
 * typed classes. Both are read here. Anything unrecognised is "unknown", which
 * the page renders as a refusal with nothing changed: never a silent success.
 */
export function accountErrorCodeOf(err: unknown): AccountErrorCode {
  if (err instanceof BillingReauthenticationError) return "reauthentication";
  if (err instanceof BillingRoleError) return "not_owner";
  if (err instanceof NoStripeCustomerError) return "no_customer";
  if (err instanceof BillingContactProviderError) return "provider_refused";
  const message = err instanceof Error ? err.message : "";
  const code = message.startsWith("deletion_refused:")
    ? message.slice("deletion_refused:".length)
    : typeof (err as { code?: unknown } | null)?.code === "string"
      ? String((err as { code: string }).code)
      : "";
  if (code === "") return "unknown";
  if (code.startsWith("journal_")) return "journal_unavailable";
  if (code === "typed_name_mismatch") return "typed_name";
  if (code === "not_owner" || code === "owner_required") return "not_owner";
  if (code === "last_owner") return "last_owner";
  if (code === "billing_contact_handover_required") return "billing_contact_handover_required";
  if (code === "billing_contact_unknown") return "billing_contact_unknown";
  if (code.startsWith(`${REQUESTS_DISABLED_CODE}:`)) return "requests_closed";
  if (code.startsWith("invalid_transition") || code === "erasure_started") return "not_cancellable";
  return "unknown";
}

/** One sentence per code, rendered by the page. Every code above has one (asserted in account-copy.test.ts). */
export const ACCOUNT_ERROR_COPY: Record<AccountErrorCode, string> = {
  reauthentication: "Your password did not match. Nothing was changed.",
  journal_unavailable: "The deletion journal is not configured on this server, so the request was refused. Nothing was changed.",
  mail_unavailable: "No mail sender is configured, so the recovery email cannot be sent. Nothing was changed.",
  typed_name: "The name you typed does not match this workspace. Nothing was changed.",
  not_owner: "Only a workspace owner can do this.",
  // R-160. Before it, this sentence named an operator adding an owner and an
  // owner invitation — two surfaces that do not exist — so the refusal's own
  // remedy could not be followed (CLAUDE.md 2026-07-30). An account deletion
  // now schedules every workspace its person is the last owner of for deletion
  // with it, so this refusal fires only when that set changed while the
  // request was being made. The remedy is this page, which exists.
  last_owner:
    "A workspace you are the last owner of changed while this request was being made, so nothing was changed. Request the deletion again from this page: every workspace you are the last owner of is scheduled for deletion with your account.",
  billing_contact_handover_required:
    "You are the billing contact of a workspace that has a billing account. Another owner of that workspace must accept the billing contact first. Nothing was changed.",
  billing_contact_unknown:
    "A workspace you belong to has a billing account whose billing contact has not been confirmed. An owner of that workspace must accept the billing contact first. Nothing was changed.",
  requests_closed: "Requesting this kind of deletion is not open on this server yet. Nothing was changed.",
  no_customer: "This workspace has no billing account, so there is no billing contact to accept.",
  provider_refused:
    "The payment provider did not confirm the handover, so the billing contact was not changed.",
  not_cancellable: "This deletion has already started erasing and can no longer be cancelled.",
  unknown: "The request was refused. Nothing was changed.",
};

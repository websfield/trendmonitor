// Copy the /usage PAGE renders, in a module the suite can import (same reason
// as the billing page's copy.ts — the AC-5 keyless snapshot must quote a string
// a test is actually bound to, not a fixture that resembles it).
export const NO_BILLING_ACCOUNT_REASON =
  "There is no billing account for this workspace yet — one is created the first time you subscribe or buy a credit pack. Invoices appear here after that.";

/** REQ-A02: the portal manages the card and the subscription — owner only. */
export const PORTAL_NOT_OWNER_REASON =
  "Only the workspace owner can open the Customer Portal — it manages the payment method and the subscription. Ask the owner of this workspace for an invoice.";

export type PortalAvailability = { ok: true } | { ok: false; reason: string };

/**
 * Whether /usage may offer a live Customer Portal control (REQ-A02).
 *
 * A PURE function, extracted for one reason: this decision used to be an inline
 * `subscription ? …` in `page.tsx`, and no test in this repo executes a page
 * component (they need a session and a database). So `portal.available` was
 * `Boolean(subscription)` with no role test at all — a viewer was handed a live
 * `<form action=…>` whose only outcome is `/usage?e=not_owner`, while the
 * billing page blocked the same action for the same role (round-2 CHANGE 6).
 * `createPortalUrl` calls `assertOwner`, so nothing was bypassed — but the
 * plan's REQ-A02 row promises the UI hides it AND the action throws, BOTH
 * asserted, and only one half was.
 *
 * Role first, then state — the same priority order the billing view uses, so a
 * viewer on a workspace with no billing account is told about the role, not
 * about a billing account they could not create either way.
 */
export function portalAvailability(opts: {
  isOwner: boolean;
  hasStripeCustomer: boolean;
}): PortalAvailability {
  if (!opts.isOwner) return { ok: false, reason: PORTAL_NOT_OWNER_REASON };
  if (!opts.hasStripeCustomer) {
    return { ok: false, reason: NO_BILLING_ACCOUNT_REASON };
  }
  return { ok: true };
}

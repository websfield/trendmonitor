"use server";

// The six billing server actions. Each one is a THIN wrapper: gate → scope →
// the packaged operation → redirect. Every rule that matters (owner-only,
// AlreadySubscribed, pause bounds from config, auto-top-up cap validation,
// liveness) lives in `packages/credits` and was integration-tested in phases
// 2–3 BEFORE this UI existed (skill B7). Nothing is re-decided here.
//
// FAILURE CHANNEL: a server action's only way back to a server-rendered page is
// the URL, so a refusal redirects with a short CODE and the page owns the words
// (see ../../billing-errors.ts for why not the message). The raw error is
// logged server-side, which is where its ids and instants belong.
import { redirect } from "next/navigation";
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import { respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import {
  AppBaseUrlMissingError,
  billingErrorCode,
  type BillingErrorCode,
} from "../../billing-errors";

const BILLING_PATH = "/settings/billing";

/**
 * Where a refusal may send the reader. An ALLOWLIST, not the raw `from` field:
 * a form value that reaches `redirect()` unchecked is an open redirect.
 *
 * A `Set`, not an object map, deliberately: `RETURN_PATHS[raw]` on a plain
 * object answers for `"__proto__"` and `"constructor"` too, and `?? fallback`
 * would not catch it — a crafted `from=constructor` would have handed
 * `redirect()` a function.
 */
const RETURN_PATHS = new Set<string>(["/usage", BILLING_PATH]);

function returnPathOf(formData: FormData | null): string {
  const raw = formData ? String(formData.get("from") ?? "") : "";
  return RETURN_PATHS.has(raw) ? raw : BILLING_PATH;
}

function failHref(err: unknown, formData: FormData | null): string {
  const code: BillingErrorCode = billingErrorCode(err);
  console.error(`[billing-action] refused (${code})`, err);
  return `${returnPathOf(formData)}?e=${encodeURIComponent(code)}`;
}

/**
 * TWO mechanisms keep a gate from being swallowed, and both are needed:
 *
 *  1. `requireUser()` is called ABOVE the try in every action below. It signals
 *     "no session" by THROWING a `redirect()` — a plain `Error` carrying
 *     `digest: "NEXT_REDIRECT;…"` — so calling it inside the try meant an
 *     expired session on an open billing form was logged
 *     `[billing-action] refused (unknown)` and sent to
 *     `/settings/billing?e=unknown` instead of `/sign-in`
 *     (billing/tenancy round-2 CHANGE 1).
 *  2. Every catch below re-throws Next's control flow as its FIRST statement
 *     (`lib/next-control-flow.ts`), enforced by a source scan over app/** and
 *     lib/** in `tests/action-gate.test.ts`. Hoisting alone fixes the seven
 *     call sites that exist today; the scan is what stops M2 adding an eighth.
 *
 * `withWorkspace` stays INSIDE the try on purpose: `WorkspaceAccessError` is a
 * domain refusal with its own rendered copy (`workspace_access`), not a
 * navigation signal.
 */
/**
 * Absolute URLs for Stripe to return to. `BETTER_AUTH_URL` is already the
 * app's own base URL (env.example), so this adds no new configuration — and it
 * REFUSES rather than guessing a host, because a guessed success_url sends a
 * paying customer to a page that does not exist.
 */
function appBaseUrl(): string {
  const base = process.env.BETTER_AUTH_URL;
  if (!base) throw new AppBaseUrlMissingError();
  return base.replace(/\/+$/, "");
}

function checkoutUrls() {
  const base = appBaseUrl();
  return {
    successUrl: `${base}/usage`,
    cancelUrl: `${base}${BILLING_PATH}`,
  };
}

export async function subscribeAction(formData: FormData): Promise<void> {
  // THE GATE, above the try. Its refusal is a redirect, i.e. a throw.
  const user = await requireUser();
  let url: string;
  try {
    const tier = String(formData.get("tier") ?? "");
    if (tier !== "creator" && tier !== "pro" && tier !== "studio") {
      throw new Error(`unknown tier "${tier}"`);
    }
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    url = await respinCredits.createTierCheckoutUrl(
      scope,
      tier,
      user.email,
      checkoutUrls()
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(failHref(err, formData));
  }
  redirect(url);
}

export async function buyPackAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  let url: string;
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    url = await respinCredits.createPackCheckoutUrl(
      scope,
      user.email,
      checkoutUrls()
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(failHref(err, formData));
  }
  redirect(url);
}

export async function openPortalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  let url: string;
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    url = await respinCredits.createPortalUrl(
      scope,
      `${appBaseUrl()}${BILLING_PATH}`
    );
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(failHref(err, formData));
  }
  redirect(url);
}

/**
 * The `incomplete`-subscription remedy (audit 2026-08-17 #8). Same thin shape as
 * `openPortalAction` — gate, scope, packaged operation, redirect to Stripe — and
 * every rule (owner-only, status-narrow, invoice payable) lives in the package.
 */
export async function recoverInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  let url: string;
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    url = await respinCredits.createInvoiceRecoveryUrl(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(failHref(err, formData));
  }
  redirect(url);
}

export async function pauseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    // Number(), not a bounded union: the range is CONFIG (`pauseMonths`), and
    // the package validates against the active version. A type-level 1|2|3 here
    // would be a second, un-versioned authority.
    await respinCredits.pauseSubscription(scope, Number(formData.get("months")));
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(failHref(err, formData));
  }
  redirect(returnPathOf(formData));
}

export async function resumeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    await respinCredits.resumeSubscription(scope);
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(failHref(err, formData));
  }
  redirect(returnPathOf(formData));
}

export async function setAutoTopupAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    const enabled = formData.get("enabled") !== null;
    // Dollars in the form, CENTS in the domain (the cap is compared against
    // real charged amounts). A blank or non-numeric field becomes NaN, which
    // the package refuses with AutoTopupCapError — one validator, not two.
    const capUsd = Number(String(formData.get("capUsd") ?? ""));
    await respinCredits.setAutoTopup(scope, {
      enabled,
      monthlyCapCents: enabled ? Math.round(capUsd * 100) : undefined,
    });
  } catch (err) {
    rethrowNextControlFlow(err);
    redirect(failHref(err, formData));
  }
  redirect(returnPathOf(formData));
}

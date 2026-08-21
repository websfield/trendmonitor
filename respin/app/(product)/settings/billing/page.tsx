// /settings/billing — REQ-G01/G03/G08 UI half, owner-gated at REQ-A02.
// Server component: gate, scope, read, render. Every mutation is a server
// action in ./actions.ts, and every rule those actions enforce lives in
// packages/credits (skill B7: the money paths were integration-tested in
// phases 2–3, before this page existed).
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import {
  hasLiveStripeSubscription,
  isStripeConfigured,
  respinCredits,
} from "@respin/credits/app-server";
import { getActiveConfigServer } from "@respin/config/app-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";
import { AccessRefusal } from "../../access-refusal";
import { billingErrorDisplay, billingErrorFromCode } from "../../billing-errors";
import { BillingView, type BillingViewProps, type TierOption } from "./billing-view";
import { STRIPE_REMEDY } from "./copy";
import {
  buyPackAction,
  openPortalAction,
  pauseAction,
  recoverInvoiceAction,
  resumeAction,
  setAutoTopupAction,
  subscribeAction,
} from "./actions";

const TIER_LABELS: Record<TierOption["tier"], string> = {
  creator: "Creator",
  pro: "Pro",
  studio: "Studio",
};

export default async function BillingSettingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The real gate, per-page (client-nav caches layouts — gate-completeness test).
  // ABOVE the try: `requireUser()` refuses by throwing a `redirect()`.
  const user = await requireUser();
  const search = await props.searchParams;

  // Scoping is a REFUSAL PATH (round-2 NOTE): `WorkspaceAccessError` has
  // rendered copy in billing-errors.ts and, until this try existed, no way to
  // reach it from a page.
  let scope: Awaited<ReturnType<typeof respinDb.withWorkspace>>;
  try {
    scope = await respinDb.withWorkspace({ authUserId: user.id });
  } catch (err) {
    rethrowNextControlFlow(err);
    console.error("[billing] workspace scope unavailable", err);
    return <AccessRefusal copy={billingErrorDisplay(err)} />;
  }
  const errParam = search.e;

  const [subscription] = await scope.accessors.subscription();

  // ONE liveness definition, four readers. The other three are inside
  // packages/credits (checkout's F1 guard, auto-top-up arming, maybeAutoTopup);
  // this is the fourth, and it is the same function — not a page-local idea of
  // what "subscribed" looks like.
  const hasLiveSubscription = subscription
    ? hasLiveStripeSubscription(subscription)
    : false;

  let state: BillingViewProps["state"] = { tier: "free", state: "free" };
  let config: BillingViewProps["config"];
  try {
    const active = await getActiveConfigServer();
    const mappedTiers = new Set(Object.values(active.content.stripePriceMap));
    config = {
      ok: true,
      version: active.version,
      tiers: (["creator", "pro", "studio"] as const).map((tier) => ({
        tier,
        label: TIER_LABELS[tier],
        monthlyCredits: active.content.allowances[tier],
        priceMapped: mappedTiers.has(tier),
      })),
      pack: {
        credits: active.content.pack.credits,
        priceUsd: active.content.pack.priceUsd,
        mapped: mappedTiers.has("pack"),
      },
      pauseMonths: active.content.pauseMonths,
    };
  } catch (err) {
    rethrowNextControlFlow(err);
    console.error("[billing] active config unavailable", err);
    const copy = billingErrorDisplay(err);
    config = { ok: false, title: copy.title, detail: copy.detail };
  }

  try {
    const billing = await respinCredits.getBillingState(
      scope.workspaceId,
      new Date()
    );
    state = billing;
  } catch (err) {
    rethrowNextControlFlow(err);
    // getWorkspaceBillingState reads config to resolve a tier, so it fails
    // closed with the config. Say "unknown" rather than defaulting to free —
    // the config error box above carries the operator's remedy.
    console.error("[billing] billing state unavailable", err);
    state = { tier: "unknown", state: "unknown" };
  }

  return (
    <BillingView
      state={state}
      isOwner={scope.role === "owner"}
      hasLiveSubscription={hasLiveSubscription}
      hasStripeCustomer={Boolean(subscription)}
      autoTopup={{
        enabled: subscription?.autoTopupEnabled ?? false,
        monthlyCapCents: subscription?.autoTopupMonthlyCapCents ?? null,
      }}
      config={config}
      stripe={{ configured: isStripeConfigured(), remedy: STRIPE_REMEDY }}
      error={billingErrorFromCode(
        typeof errParam === "string" ? errParam : undefined
      )}
      showCancel={search.cancel === "1"}
      actions={{
        subscribe: subscribeAction,
        pack: buyPackAction,
        portal: openPortalAction,
        recoverInvoice: recoverInvoiceAction,
        pause: pauseAction,
        resume: resumeAction,
        autoTopup: setAutoTopupAction,
      }}
      cancelHref="/settings/billing?cancel=1"
      usageHref="/usage"
    />
  );
}

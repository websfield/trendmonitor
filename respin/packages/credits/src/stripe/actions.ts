// Billing actions — server-action-callable, ALL owner-gated in the package
// (REQ-A02: only owners touch billing; UI hiding is presentation, this is the
// gate). Local state only ever follows webhooks or explicit records — an API
// failure here writes nothing.
import { eq } from "drizzle-orm";
import {
  subscriptions,
  type DbLike,
  type WorkspaceScope,
} from "@respin/db";
import { getActiveConfig } from "@respin/config";
import { getStripe } from "./adapter";
import { getOrCreateCustomer } from "./customers";
import { clearPauseMirror, ensurePauseEnded, ensurePauseStarted } from "../pause";
import { getDbNow } from "../clock";
import { addMonthsUtc } from "../months";
import { hasLiveStripeSubscription } from "../state";

export class BillingRoleError extends Error {
  constructor(role: string) {
    super(`Billing actions require the owner role (you are: ${role}) — REQ-A02.`);
    this.name = "BillingRoleError";
  }
}

export class AlreadySubscribedError extends Error {
  /**
   * @param status the mirrored Stripe status, so the refusal can name a remedy
   * that STATE actually permits (billing round-7 CHANGE 7). `incomplete`
   * counts as live for the double-billing guard — the subscription exists in
   * Stripe and would be joined by a second one — but the Customer Portal has
   * nothing to manage for it, so the generic message sent a creator whose card
   * needed SCA (or was declined at the payment step) to a dead end while
   * Stripe holds the subscription for ~23 hours. Verified against the
   * installed SDK (stripe@22.5.0 resources/Subscriptions.d.ts): "a
   * subscription moves into `incomplete` if the initial payment attempt fails.
   * A subscription in this status can only have metadata and default_source
   * updated. Once the first invoice is paid, the subscription moves into an
   * `active` status. If the first invoice is not paid within 23 hours, the
   * subscription transitions to `incomplete_expired`."
   */
  constructor(status?: string) {
    super(
      status === "incomplete"
        ? "This workspace has a subscription whose FIRST PAYMENT has not completed — the card needed extra authentication or was declined, and Stripe is holding the subscription open. Starting a new Checkout would create a SECOND Stripe subscription (double billing), so it is refused. Pay the open invoice Stripe emailed for this subscription (its hosted invoice page accepts a different card) and the subscription activates; or leave it — Stripe expires an unpaid first invoice about 23 hours after it was created, after which a fresh Checkout works. The Customer Portal cannot resolve this state: an incomplete subscription accepts only metadata and payment-source changes."
        : "This workspace already has a live subscription — a second Checkout would create a second Stripe subscription (double-billing). Manage or change the plan in the Customer Portal instead."
    );
    this.name = "AlreadySubscribedError";
  }
}

export class CheckoutInFlightError extends Error {
  constructor(tier: string) {
    super(
      `A Checkout for this workspace is already open on different terms, so a "${tier}" Checkout would be a SECOND one — and two completed Checkouts are two Stripe subscriptions on one workspace (double billing). Finish or abandon the open Checkout; an abandoned one lapses within 24 hours, after which a new plan can be started.`
    );
    this.name = "CheckoutInFlightError";
  }
}

/**
 * TYPED refusals for the states this module can legitimately be in (billing
 * round-10 NOTE 1). Every one of these was a plain `throw new Error` until now.
 * That mattered because `app/**` may import ONLY the facade and cannot
 * `instanceof` an anonymous Error: Phase 4's billing page — the next reader of
 * every one of these paths — could not tell "this workspace has no Stripe
 * customer yet" from "Stripe is down", and would have rendered the same opaque
 * failure for both. The facade re-export set is enforced by
 * tests/facade-errors.test.ts, which now ALSO asserts that no plain
 * `new Error` remains reachable from an app-facing facade method — so the
 * walk's documented blind spot (limit 1) is EMPTY on that facade rather than
 * merely disclosed.
 */
export class NoStripeCustomerError extends Error {
  constructor(what: string) {
    super(
      `${what} needs a Stripe customer for this workspace, and none exists yet — one is created the first time an owner starts a Checkout. Subscribe (or buy a credit pack) first.`
    );
    this.name = "NoStripeCustomerError";
  }
}

/**
 * No subscription that still EXISTS in Stripe. Uses the ONE liveness
 * definition (`hasLiveStripeSubscription`), so pause, auto-top-up arming and
 * the F1 double-billing guard cannot drift into three different answers —
 * which is exactly what produced the round-6 BLOCK and its sibling.
 */
export class NoLiveSubscriptionError extends Error {
  constructor(operation: string) {
    super(
      `Cannot ${operation}: this workspace has no live Stripe subscription (it was never created, or it has been canceled). Subscribe first — a canceled subscription cannot be reused.`
    );
    this.name = "NoLiveSubscriptionError";
  }
}

export class NotPausedError extends Error {
  constructor() {
    super(
      "There is no paused subscription to resume for this workspace. If you paused it moments ago, the pause is recorded when Stripe confirms it — reload and try again."
    );
    this.name = "NotPausedError";
  }
}

export class PauseLengthError extends Error {
  constructor(months: number, min: number, max: number) {
    super(
      `Pause length must be a whole number of months between ${min} and ${max} (config pauseMonths); got ${months}.`
    );
    this.name = "PauseLengthError";
  }
}

export class AutoTopupCapError extends Error {
  constructor() {
    super(
      "Enabling auto-top-up requires a positive integer monthly cap in cents (REQ-G03: a cap the user sets)."
    );
    this.name = "AutoTopupCapError";
  }
}

/**
 * Stripe accepted the Checkout Session create but returned no hosted URL. Not
 * a user state at all — it means the API contract moved — so it is typed only
 * so the billing page can say "Stripe returned something we did not expect"
 * instead of putting it in the same bucket as a refusal.
 */
export class StripeSessionUrlMissingError extends Error {
  constructor(kind: "tier" | "pack") {
    super(
      `Stripe returned a ${kind} Checkout Session without a hosted URL, so there is nowhere to send the customer. Nothing was charged. Retry; if it persists, compare the session in the Stripe dashboard against the API version pinned in adapter.ts.`
    );
    this.name = "StripeSessionUrlMissingError";
  }
}

export class UnknownTierPriceError extends Error {
  constructor(tier: string) {
    super(
      `No Stripe price is mapped for tier "${tier}" in the active config. Run \`pnpm stripe:setup\` and paste the printed price ids into /admin/config (stripePriceMap).`
    );
    this.name = "UnknownTierPriceError";
  }
}

function assertOwner(scope: WorkspaceScope): void {
  if (scope.role !== "owner") throw new BillingRoleError(scope.role);
}

type SubscriptionRow = typeof subscriptions.$inferSelect;

// Delegated to the ONE definition in state.ts (round-6 gate: this file's own
// allowlist both locked out a re-subscribe after an ordinary cancel and let a
// second subscription through on `unpaid` — see hasLiveStripeSubscription).
const isLive = hasLiveStripeSubscription;

async function subscriptionRow(
  db: DbLike,
  scope: WorkspaceScope
): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, scope.workspaceId))
    .limit(1);
  return row ?? null;
}

async function liveSubscription(db: DbLike, scope: WorkspaceScope) {
  const row = await subscriptionRow(db, scope);
  return row && isLive(row) ? row : null;
}

export type CheckoutUrls = { successUrl: string; cancelUrl: string };

export async function createTierCheckoutUrl(
  db: DbLike,
  scope: WorkspaceScope,
  tier: "creator" | "pro" | "studio",
  email: string,
  urls: CheckoutUrls
): Promise<string> {
  assertOwner(scope);
  const existing = await subscriptionRow(db, scope);
  if (existing && isLive(existing)) throw new AlreadySubscribedError(existing.status);
  const { content } = await getActiveConfig(db);
  const priceId = Object.entries(content.stripePriceMap).find(
    ([, t]) => t === tier
  )?.[0];
  if (!priceId) throw new UnknownTierPriceError(tier);
  const customer = await getOrCreateCustomer(db, scope.workspaceId, email);
  // The F1 guard above reads the MIRROR, and the mirror only moves when the
  // webhook lands — so between "customer finishes Checkout" and "webhook
  // arrives" the guard reads `none` and waves a second Checkout through.
  // That window is seconds wide on the happy path and unbounded when Stripe
  // is retrying, and two completed Checkouts are two Stripe subscriptions on
  // one workspace: the customer is billed twice, and the mirror (single-row,
  // by workspace) can only ever remember one of them, so the second bills on
  // forever with nothing in our database pointing at it. The plain
  // double-click and the two-tab race land in the same window
  // (billing review finding 3).
  //
  // A durable lock would need a column, a release path, and a stale-lock
  // sweeper — three new failure modes guarding a race that Stripe already
  // solves: an idempotency key makes the SECOND create return the FIRST
  // session instead of a new one. Concurrent callers compute the same key
  // (every input is durable state both of them read), so at most one
  // Checkout Session — hence at most one subscription — can exist per
  // (workspace, price, subscription-generation). The user simply gets their
  // existing Checkout page back, which is also the better outcome than an
  // error telling them to try again.
  //
  // `stripeSubscriptionId` is the generation counter: it is null before the
  // first subscription and holds the DEAD id after a cancellation, so the
  // subscribe → cancel → re-subscribe flow computes a different key and gets
  // a fresh session rather than a replay of the completed one.
  //
  // EVERY input is durable database state — deliberately NOT the tier and NOT
  // the URLs (billing round-5 CHANGE, both directions found by the gate).
  // Including the tier scoped the guarantee per-price, so two racers choosing
  // DIFFERENT tiers got different keys, two sessions and two subscriptions —
  // the one end state the single-row mirror cannot even represent. Including a
  // hash of the caller's URLs made the guarantee depend on an argument this
  // package cannot control: a future caller putting a nonce in `successUrl`
  // would have switched it off silently. Keyed on workspace and generation
  // alone, the invariant is exact and self-contained: AT MOST ONE Checkout
  // Session per workspace per subscription generation, whatever the caller
  // varies. A variation now produces a LOUD typed refusal below instead.
  //
  // Stated consequence, in exchange: an owner who opens a Creator checkout and
  // then picks Pro before finishing gets CheckoutInFlightError until the first
  // session lapses, rather than a second session. That is the same refusal F1
  // makes once the subscription exists, moved earlier to the only window where
  // double billing was still reachable.
  //
  // Second stated consequence: Stripe drops idempotency keys after 24h and
  // Checkout Sessions expire after 24h from the same instant, so near that
  // boundary a replay can hand back the URL of a just-expired session. The
  // user sees Stripe's own "session expired" page and the next attempt (past
  // the key's TTL) creates a fresh one — self-correcting, and never a charge.
  const idempotencyKey = `checkout:${scope.workspaceId}:${existing?.stripeSubscriptionId ?? "none"}`;
  const session = await getStripe()
    .checkout.sessions.create(
      {
        mode: "subscription",
        customer,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        metadata: { workspace_id: scope.workspaceId },
      },
      { idempotencyKey }
    )
    .catch((err: unknown) => {
      // Stripe refuses a key replayed with different parameters. Reaching
      // here means a checkout for this workspace is already open on different
      // terms — surface that as the typed, explained refusal it is, rather
      // than letting a raw Stripe 400 reach an owner clicking Subscribe.
      if ((err as { type?: string })?.type === "StripeIdempotencyError") {
        throw new CheckoutInFlightError(tier);
      }
      throw err;
    });
  if (!session.url) throw new StripeSessionUrlMissingError("tier");
  return session.url;
}

export async function createPackCheckoutUrl(
  db: DbLike,
  scope: WorkspaceScope,
  email: string,
  urls: CheckoutUrls
): Promise<string> {
  assertOwner(scope);
  const { content } = await getActiveConfig(db);
  const priceId = Object.entries(content.stripePriceMap).find(
    ([, t]) => t === "pack"
  )?.[0];
  if (!priceId) throw new UnknownTierPriceError("pack");
  const customer = await getOrCreateCustomer(db, scope.workspaceId, email);
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    metadata: { workspace_id: scope.workspaceId, respin_kind: "pack" },
  });
  if (!session.url) throw new StripeSessionUrlMissingError("pack");
  return session.url;
}

export async function createPortalUrl(
  db: DbLike,
  scope: WorkspaceScope,
  returnUrl: string
): Promise<string> {
  assertOwner(scope);
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, scope.workspaceId))
    .limit(1);
  if (!row) throw new NoStripeCustomerError("The Customer Portal");
  const session = await getStripe().billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

/** Pause 1–N months (bounds from config `pauseMonths`, REQ-G08/R-12). */
export async function pauseSubscription(
  db: DbLike,
  scope: WorkspaceScope,
  months: number,
  at: Date
): Promise<void> {
  assertOwner(scope);
  const { content } = await getActiveConfig(db);
  if (
    !Number.isInteger(months) ||
    months < content.pauseMonths.min ||
    months > content.pauseMonths.max
  ) {
    throw new PauseLengthError(
      months,
      content.pauseMonths.min,
      content.pauseMonths.max
    );
  }
  const sub = await liveSubscription(db, scope);
  if (!sub?.stripeSubscriptionId) {
    throw new NoLiveSubscriptionError("pause a subscription");
  }
  // Clamped, not overflowed: a pause started on 31 January used to resume on
  // 3 March, i.e. longer than the `pauseMonths.max` the check above enforces
  // (billing review finding 4 — see months.ts).
  const resumesAt = addMonthsUtc(at, months);
  // Stripe first; local records only after the API succeeded. If the local
  // write then fails, the customer.subscription.updated webhook reconciles
  // (its pause-sync branch), so the two truths converge.
  await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
    pause_collection: {
      behavior: "void",
      resumes_at: Math.floor(resumesAt.getTime() / 1000),
    },
  });
  await db.transaction(async (tx) => {
    const now = await getDbNow(tx);
    // CONVERGE, never throw (code-review CHANGE): Stripe has already paused
    // the subscription, and its reconciling customer.subscription.updated may
    // have landed first. Without this the loser of that race shows the owner a
    // failure for an operation that DID happen. Both writers now share ONE
    // convergent form (pause.ts), so they cannot drift apart again.
    await ensurePauseStarted(tx, scope.workspaceId, now, resumesAt);
  });
}

export async function resumeSubscription(
  db: DbLike,
  scope: WorkspaceScope
): Promise<void> {
  assertOwner(scope);
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, scope.workspaceId))
    .limit(1);
  if (!sub?.stripeSubscriptionId || sub.pausedAt === null) {
    throw new NotPausedError();
  }
  await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
    pause_collection: "",
  });
  await db.transaction(async (tx) => {
    const now = await getDbNow(tx);
    // Same convergence as pause: "no open pause" is exactly the state the
    // reconciling webhook leaves behind when it wins the race, and that must
    // not be an error for the owner (code-review CHANGE).
    const closed = await ensurePauseEnded(tx, scope.workspaceId, now);
    if (!closed) {
      // ...but converging on the PERIOD is not converging on the MIRROR, and
      // `state.ts` reads the mirror. With `pausedAt` set and no open period (a
      // reconciling webhook closed the period without the mirror, or a pause
      // that only ever reached the mirror) this returned silently: the Resume
      // button appeared to do nothing, the page still said "Paused", and no
      // event was coming to correct it (round-2 NOTE 4). Stripe has already
      // been un-paused by the call above, so clearing is the truthful state —
      // and it goes through pause.ts, the only module allowed to write
      // `subscriptions.pausedAt`.
      await clearPauseMirror(tx, scope.workspaceId);
    }
  });
}

/** Auto-top-up opt-in + monthly cap: mirror config, not Stripe state. */
export async function setAutoTopup(
  db: DbLike,
  scope: WorkspaceScope,
  opts: { enabled: boolean; monthlyCapCents?: number }
): Promise<void> {
  assertOwner(scope);
  if (opts.enabled) {
    if (
      opts.monthlyCapCents === undefined ||
      !Number.isInteger(opts.monthlyCapCents) ||
      opts.monthlyCapCents <= 0
    ) {
      throw new AutoTopupCapError();
    }
  }
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, scope.workspaceId))
    .limit(1);
  if (!row) throw new NoStripeCustomerError("Auto-top-up");
  // ARMING the flag requires a LIVE subscription, through the ONE definition
  // (billing round-10 CHANGE 4). The only check here used to be "a subscriptions
  // row exists", so a canceled or never-subscribed workspace could still reach
  // {status: canceled, autoTopupEnabled: true} — precisely the state
  // DEAD_SUBSCRIPTION_FIELDS was introduced to make impossible, and precisely
  // what `maybeAutoTopup`'s own liveness guard refuses to act on. The trigger
  // refusing is NOT enough: Phase 4's billing UI is the next reader of this row
  // and would show auto-top-up as ON for a workspace that can never be charged,
  // which is the tail wagging the dog. One definition, three readers (here,
  // maybeAutoTopup, and the F1 guard via liveSubscription).
  //
  // DISABLING is deliberately NOT guarded: it can only move the row toward the
  // safe state, and refusing it would trap an owner whose subscription died
  // while the flag was armed with a switch they cannot turn off.
  if (opts.enabled && !isLive(row)) {
    throw new NoLiveSubscriptionError("arm auto-top-up");
  }
  await db
    .update(subscriptions)
    .set({
      autoTopupEnabled: opts.enabled,
      autoTopupMonthlyCapCents: opts.enabled ? opts.monthlyCapCents : null,
    })
    .where(eq(subscriptions.workspaceId, scope.workspaceId));
}

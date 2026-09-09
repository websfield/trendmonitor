// Billing actions — server-action-callable, ALL owner-gated in the package
// (REQ-A02: only owners touch billing; UI hiding is presentation, this is the
// gate). Local state only ever follows webhooks or explicit records — an API
// failure here writes nothing.
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  assertReauthenticatedWorkspaceScopeInTx,
  assertScoped,
  subscriptions,
  type DbLike,
  type ReauthenticatedSessionRef,
  type TxLike,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { getActiveConfig } from "@respin/config";
import {
  getAuthenticatedStripeAccountIdentity,
  getStripe,
  type Stripe,
} from "./adapter";
import { CustomerMappingLostError, getOrCreateCustomer } from "./customers";
import { resolvePackPrice } from "./pack-price";
import { packCheckoutAuthorityMetadata } from "./pack-checkout-authority";
import {
  tierCheckoutAuthorityMetadata,
  verifyTierCheckoutAuthority,
} from "./tier-checkout-authority";
import {
  AutoTopupAttemptIntegrityError,
  clearPendingAutoTopupAttempt,
  ensureAutoTopupAttemptProtocol,
  pendingAutoTopupAttempt,
} from "./auto-topup";
import {
  getAutoTopupProtocolRollout,
  isAutoTopupProtocolActive,
} from "./auto-topup-rollout";
import {
  assertTierCheckoutProtocolActive,
  getTierCheckoutProtocolState,
  TierCheckoutRolloutError,
} from "./tier-checkout-rollout";
import {
  clearPauseMirror,
  ensurePauseEnded,
  ensurePauseStarted,
  hasOpenPause,
} from "../pause";
import { assertWriteClock, getDbNow, takeWorkspaceLock } from "../clock";
import { addMonthsUtc } from "../months";
import { AutoTopupReconciliationRequiredError } from "../errors";
import {
  hasLiveStripeSubscription,
  INCOMPLETE_STATUSES,
  IRREVERSIBLE_STATUSES,
  isPausedSubscription,
  OFF_SESSION_CHARGEABLE_STATUSES,
} from "../state";

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

/**
 * The workspace is PAUSED, and the requested operation would charge it
 * (audit 2026-08-17 #1 — the audit's single highest-confidence finding).
 *
 * REQ-G08 ("Must"): "While paused: no charges, no monthly grants." The manual
 * credit-pack path violated it outright: `createPackCheckoutUrl` called
 * `assertOwner` and nothing else, then created a real, payable Stripe Checkout
 * Session. The sibling `auto-topup.ts` has guarded the identical hazard since
 * round 7 (`if (sub.pausedAt !== null) return {triggered:false, reason:"paused"}`),
 * and the billing page's own copy asserts "No charges while paused" two
 * components away — so this was one charging path out of two, and the UI was
 * telling the customer the opposite of what the code did.
 *
 * Typed rather than a bare throw so the billing page can render the reason and
 * DISABLE the control, instead of offering a button that fails on click
 * (round-10 NOTE 1's rule, and the facade-errors suite enforces the re-export).
 */
export class SubscriptionPausedError extends Error {
  constructor(operation: string) {
    super(
      `Cannot ${operation} while this subscription is paused. A pause means no charges (REQ-G08), so the request was refused before anything was sent to Stripe — nothing was charged. Resume the subscription first; credits are frozen, not lost, while it is paused.`
    );
    this.name = "SubscriptionPausedError";
  }
}

/**
 * The subscription exists but is not CHARGEABLE off-session (audit
 * 2026-08-17 #6): its status is one Stripe has given up collecting on
 * (`unpaid`), or it is paused. Distinct from `NoLiveSubscriptionError`, which
 * means no subscription exists at all — a distinction that matters because
 * `unpaid` is deliberately recoverable (the customer can still pay their way
 * out through the Portal), so the remedy is different.
 */
export class NotChargeableError extends Error {
  constructor(operation: string, status: string) {
    super(
      `Cannot ${operation}: this workspace's subscription is "${status}", which means Stripe has stopped collecting on it — so an off-session charge must not be attempted. Nothing was charged. Settle the outstanding invoice through the Customer Portal (a subscription in this state can still be recovered), and this becomes available again.`
    );
    this.name = "NotChargeableError";
  }
}

/**
 * There is no payable hosted invoice to send an `incomplete` subscriber to
 * (audit 2026-08-17 #8).
 *
 * Reachable for real reasons, not just contract drift, which is why it names a
 * way forward rather than "unexpected": Stripe's own docs say
 * `hosted_invoice_url` "will be null" while the invoice is not finalized, and an
 * `incomplete` subscription that has since been paid or expired has no open
 * invoice at all. The remedy in every one of those cases is the same — reload,
 * and if the attempt has lapsed (Stripe expires an unpaid first invoice after
 * about 23 hours) start a fresh plan — so the copy says that instead of
 * offering a retry that cannot work.
 */
export class InvoiceRecoveryUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `No payable invoice could be found for this workspace's incomplete subscription (${detail}). Nothing was charged. Reload this page: if the payment has since gone through the subscription is already active, and if the attempt has lapsed you can start a new plan.`
    );
    this.name = "InvoiceRecoveryUnavailableError";
  }
}

/**
 * The subscription is not in a state a hosted-invoice retry applies to (audit
 * 2026-08-17 #8). Deliberately NARROW: this remedy exists only for `incomplete`,
 * where the Customer Portal cannot help. `past_due` and `unpaid` are dunning —
 * there the Portal IS the remedy (update the card), and adding a second way to
 * do the same thing would be a second source of truth about how a customer
 * recovers.
 */
export class NotRecoverableError extends Error {
  constructor(status: string) {
    super(
      `A hosted-invoice retry applies only to a subscription whose FIRST payment has not completed ("incomplete"); this one is "${status}". Nothing was charged. Manage payment details in the Customer Portal instead.`
    );
    this.name = "NotRecoverableError";
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

/**
 * The REQ-A02 owner check — and, since M2a, the CAGE check that makes it mean
 * anything.
 *
 * `assertScoped` comes FIRST and is not optional. Before it, a scope was a
 * structural type, so `Object.assign({}, viewerScope, {role: "owner"})`
 * compiled at exit 0 and arrived here as an owner: a viewer→owner escalation
 * reaching every billing action in this file. The same shape put a raw form
 * string into `scope.workspaceId` for the query below it. The gate reproduced
 * both by compiling them.
 *
 * All seven exported actions in this file call this as their first statement,
 * and all seven facade methods in `app-server.ts` delegate to one of them — so
 * this single insertion covers all fourteen `WorkspaceScope`-taking entries in
 * the package. That is exactly why `tests/import-boundary.test.ts` SCANS for
 * the property rather than trusting it: a fifteenth entry in M2b that does not
 * need owner would bypass the cage silently, and no assertion here could fire
 * for it.
 */
function assertOwner(scope: WorkspaceScope): void {
  assertScoped(scope);
  if (scope.role !== "owner") throw new BillingRoleError(scope.role);
}

export class CheckoutReconciliationRequiredError extends Error {
  constructor() {
    super(
      "A previous subscription Checkout may already exist or may have completed, but the local subscription mirror cannot prove its final state yet. No new Checkout was opened: retrying without reconciling Stripe could create a second subscription and bill this workspace twice. Wait for webhook reconciliation; if it does not converge, an operator must inspect the durable Checkout attempt and its Stripe Session before clearing it."
    );
    this.name = "CheckoutReconciliationRequiredError";
  }
}

export class BillingReauthenticationError extends Error {
  constructor() {
    super("This billing change requires a fresh password proof for the exact session.");
    this.name = "BillingReauthenticationError";
  }
}

async function requireReauthenticatedOwnerInTx(
  tx: TxLike,
  scope: WorkspaceScope,
  authority: ReauthenticatedSessionRef
): Promise<void> {
  let currentRole: "owner" | "editor" | "viewer";
  try {
    ({ role: currentRole } = await assertReauthenticatedWorkspaceScopeInTx(
      tx,
      scope,
      authority
    ));
  } catch (error) {
    if (error instanceof Error && error.message === "auth_lifecycle_refused") {
      throw new BillingReauthenticationError();
    }
    throw error;
  }
  if (currentRole !== "owner") throw new BillingRoleError(currentRole);
}

type SubscriptionRow = typeof subscriptions.$inferSelect;

// Delegated to the ONE definition in state.ts (round-6 gate: this file's own
// allowlist both locked out a re-subscribe after an ordinary cancel and let a
// second subscription through on `unpaid` — see hasLiveStripeSubscription).
const isLive = hasLiveStripeSubscription;

async function subscriptionRow(
  db: DbLike | TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<SubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1)
    .for("update");
  return row ?? null;
}

export type CheckoutUrls = { successUrl: string; cancelUrl: string };

type Tier = "creator" | "pro" | "studio";
type TierCheckoutAttempt = Readonly<{
  id: string;
  tier: Tier;
  priceId: string;
  customerId: string;
  subscriptionGeneration: string | null;
  idempotencyKey: string;
  sessionId: string | null;
  subscriptionId: string | null;
  stripeAccountId: string;
  stripeLivemode: boolean;
  authorityMetadata: Readonly<Record<string, string>>;
  reservedAt: Date;
}>;

// Stripe currently documents idempotency keys as removable after at least
// 24 hours. Stop same-key blind retries an hour before that boundary. Beyond
// it, only a complete provider scan that proves the attempt has no Session may
// retire the reservation and create a new generation.
export const TIER_CHECKOUT_IDEMPOTENCY_SAFE_RETRY_MS = 23 * 60 * 60 * 1000;

const EMPTY_TIER_CHECKOUT_ATTEMPT = {
  tierCheckoutAttemptId: null,
  tierCheckoutAttemptTier: null,
  tierCheckoutAttemptPriceId: null,
  tierCheckoutAttemptCustomerId: null,
  tierCheckoutAttemptSubscriptionGeneration: null,
  tierCheckoutAttemptIdempotencyKey: null,
  tierCheckoutAttemptSessionId: null,
  tierCheckoutAttemptSubscriptionId: null,
  tierCheckoutAttemptStripeAccountId: null,
  tierCheckoutAttemptStripeLivemode: null,
  tierCheckoutAttemptAuthority: null,
  tierCheckoutAttemptReservedAt: null,
} as const;

function tierCheckoutFenceId(workspaceId: string): string {
  return `checkout_fence:${workspaceId}`;
}

function isTierCheckoutFenced(row: SubscriptionRow): boolean {
  if (row.tierCheckoutFenceAt === null) return false;
  if (
    row.stripeSubscriptionId !==
      (row.tierCheckoutFenceObservedSubscriptionId ??
        tierCheckoutFenceId(row.workspaceId)) ||
    row.status !== "incomplete" ||
    !row.tierCheckoutFenceStatus
  ) {
    throw new CheckoutReconciliationRequiredError();
  }
  return true;
}

function tierCheckoutGeneration(row: SubscriptionRow): string | null {
  return isTierCheckoutFenced(row)
    ? row.tierCheckoutFenceSubscriptionId
    : row.stripeSubscriptionId;
}

function tierCheckoutAttempt(row: SubscriptionRow): TierCheckoutAttempt | null {
  if (row.tierCheckoutAttemptId === null) return null;
  const tier = row.tierCheckoutAttemptTier;
  if (
    (tier !== "creator" && tier !== "pro" && tier !== "studio") ||
    !row.tierCheckoutAttemptPriceId ||
    !row.tierCheckoutAttemptCustomerId ||
    !row.tierCheckoutAttemptIdempotencyKey ||
    !row.tierCheckoutAttemptStripeAccountId ||
    row.tierCheckoutAttemptStripeLivemode === null ||
    !row.tierCheckoutAttemptReservedAt ||
    !row.tierCheckoutAttemptAuthority ||
    typeof row.tierCheckoutAttemptAuthority !== "object" ||
    Array.isArray(row.tierCheckoutAttemptAuthority) ||
    !Object.values(row.tierCheckoutAttemptAuthority).every(
      (value) => typeof value === "string"
    )
  ) {
    // The database CHECK should make this unreachable. A typed fail-closed
    // refusal still matters for mixed-version/corrupt-state diagnosis.
    throw new CheckoutReconciliationRequiredError();
  }
  const expectedKey = `checkout:v1:${row.workspaceId}:${row.tierCheckoutAttemptId}`;
  if (row.tierCheckoutAttemptIdempotencyKey !== expectedKey) {
    throw new CheckoutReconciliationRequiredError();
  }
  return {
    id: row.tierCheckoutAttemptId,
    tier,
    priceId: row.tierCheckoutAttemptPriceId,
    customerId: row.tierCheckoutAttemptCustomerId,
    subscriptionGeneration: row.tierCheckoutAttemptSubscriptionGeneration,
    idempotencyKey: row.tierCheckoutAttemptIdempotencyKey,
    sessionId: row.tierCheckoutAttemptSessionId,
    subscriptionId: row.tierCheckoutAttemptSubscriptionId,
    stripeAccountId: row.tierCheckoutAttemptStripeAccountId,
    stripeLivemode: row.tierCheckoutAttemptStripeLivemode,
    authorityMetadata: row.tierCheckoutAttemptAuthority as Record<string, string>,
    reservedAt: row.tierCheckoutAttemptReservedAt,
  };
}

function stripeObjectId(value: { id: string } | string | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function sessionMatchesAttempt(
  session: Stripe.Checkout.Session,
  attempt: TierCheckoutAttempt,
  workspaceId: VerifiedWorkspaceId
): boolean {
  const lineItems = session.line_items?.data ?? [];
  const linePrice = lineItems.length === 1
    ? stripeObjectId(lineItems[0]?.price)
    : null;
  return (
    session.mode === "subscription" &&
    session.metadata?.workspace_id === workspaceId &&
    session.metadata?.respin_kind === "tier_checkout" &&
    session.metadata?.respin_checkout_attempt_id === attempt.id &&
    session.metadata?.tier === attempt.tier &&
    session.metadata?.price_id === attempt.priceId &&
    stripeObjectId(session.customer) === attempt.customerId &&
    linePrice === attempt.priceId &&
    (attempt.sessionId === null || session.id === attempt.sessionId) &&
    (attempt.subscriptionId === null ||
      stripeObjectId(session.subscription) === attempt.subscriptionId) &&
    Object.entries(attempt.authorityMetadata).every(
      ([key, value]) => session.metadata?.[key] === value
    )
  );
}

async function isUnresolvedCheckoutSession(
  session: Stripe.Checkout.Session,
  attempt: TierCheckoutAttempt
): Promise<boolean> {
  if (
    session.mode !== "subscription" ||
    stripeObjectId(session.customer) !== attempt.customerId
  ) {
    return false;
  }
  // The immutable local customer mapping is the identity authority. Once a
  // subscription Session belongs to that exact customer, absent or conflicting
  // workspace metadata is ambiguity, not permission to ignore it and open a
  // second subscription. Only provider proof that the generation is
  // irreversible can make a non-matching Session harmless.
  if (session.status === "open") return true;
  if (
    session.status === "expired" &&
    session.payment_status !== "paid" &&
    !session.subscription
  ) {
    return false;
  }
  const subscriptionId = stripeObjectId(session.subscription);
  if (subscriptionId === null) return true;
  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    // Historical generations are safe to ignore only when Stripe proves the
    // subscription itself is irreversible. Session status alone cannot prove
    // that a completed Checkout will never bill again.
    return !IRREVERSIBLE_STATUSES.has(subscription.status);
  } catch {
    throw new CheckoutReconciliationRequiredError();
  }
}

async function scanTierCheckoutSessions(
  attempt: TierCheckoutAttempt,
  workspaceId: VerifiedWorkspaceId
) {
  const stripe = getStripe();
  const matches: Stripe.Checkout.Session[] = [];
  const conflicts: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;
  const seenPageEnds = new Set<string>();
  for (;;) {
    const page = await stripe.checkout.sessions.list({
      customer: attempt.customerId,
      limit: 100,
      expand: ["data.line_items.data.price"],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const session of page.data) {
      if (sessionMatchesAttempt(session, attempt, workspaceId)) {
        matches.push(session);
      } else if (await isUnresolvedCheckoutSession(session, attempt)) {
        // This includes pre-0049 Sessions and malformed/wrong-workspace
        // Sessions on the exact mapped customer. Any open or
        // completed-but-live Session is authority to refuse a second Checkout.
        conflicts.push(session);
      }
    }
    if (!page.has_more) return { matches, conflicts };
    const end = page.data.at(-1)?.id;
    if (!end || seenPageEnds.has(end)) throw new CheckoutReconciliationRequiredError();
    seenPageEnds.add(end);
    startingAfter = end;
  }
}

async function bindTierCheckoutSession(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  attempt: TierCheckoutAttempt,
  sessionId: string
): Promise<void> {
  const [current] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1)
    .for("update");
  if (!current || tierCheckoutAttempt(current)?.id !== attempt.id) {
    throw new CheckoutReconciliationRequiredError();
  }
  if (
    current.tierCheckoutAttemptSessionId !== null &&
    current.tierCheckoutAttemptSessionId !== sessionId
  ) {
    throw new CheckoutReconciliationRequiredError();
  }
  await tx
    .update(subscriptions)
    .set({ tierCheckoutAttemptSessionId: sessionId })
    .where(eq(subscriptions.workspaceId, workspaceId));
}

type TierCheckoutResolution =
  | { kind: "url"; url: string }
  | { kind: "restart" }
  | { kind: "reconcile" };

export async function createTierCheckoutUrl(
  db: DbLike,
  scope: WorkspaceScope,
  tier: Tier,
  email: string,
  urls: CheckoutUrls,
  authority: ReauthenticatedSessionRef
): Promise<string> {
  assertOwner(scope);
  if ((await getTierCheckoutProtocolState(db)) !== "active") {
    throw new TierCheckoutRolloutError(
      "v1 Session creation remains closed until the legacy fleet drain and provider audit are complete"
    );
  }
  const activatedProvider = await getAuthenticatedStripeAccountIdentity();
  // Persist the workspace -> customer mapping in its own committed phase.
  // If Stripe accepts Checkout and the response is lost, the idempotent retry
  // must still find the same customer rather than rolling its mapping back.
  const prepared = await db.transaction(async (tx) => {
    await assertTierCheckoutProtocolActive(tx, activatedProvider);
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await takeWorkspaceLock(tx, scope.workspaceId);
    const existing = await subscriptionRow(tx, scope.workspaceId);
    if (existing && !isTierCheckoutFenced(existing) && isLive(existing)) {
      throw new AlreadySubscribedError(existing.status);
    }
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    const customer = await getOrCreateCustomer(tx, scope.workspaceId, email, scope.userId);
    return { customer };
  });

  // A durable reservation replaces reliance on Stripe's finite idempotency
  // retention. The first transaction below commits all provider-create inputs.
  // A lost response therefore leaves enough authority to find the Session by
  // metadata, safely replay the SAME key inside its retention window, or refuse
  // after a completed Session until the webhook advances the mirror.
  for (let generation = 0; generation < 2; generation += 1) {
    const attempt = await db.transaction(async (tx) => {
      await requireReauthenticatedOwnerInTx(tx, scope, authority);
      await takeWorkspaceLock(tx, scope.workspaceId);
      const existing = await subscriptionRow(tx, scope.workspaceId);
      if (!existing || existing.stripeCustomerId !== prepared.customer) {
        throw new CustomerMappingLostError();
      }
      const stripeIdentity = await getAuthenticatedStripeAccountIdentity();
      await assertTierCheckoutProtocolActive(tx, stripeIdentity);
      if (!(await isAutoTopupProtocolActive(tx))) {
        throw new AutoTopupAttemptIntegrityError(
          "tier Checkout signed authority remains closed until the shared HMAC rollout is active"
        );
      }
      const pending = tierCheckoutAttempt(existing);
      if (pending) {
        if (pending.subscriptionGeneration !== tierCheckoutGeneration(existing)) {
          // A partial checkout webhook can bind the new subscription id before
          // its full snapshot. Treat that as possible completion, never as
          // permission to retire the attempt and open another Checkout.
          throw new CheckoutReconciliationRequiredError();
        }
        if (
          pending.tier !== tier ||
          pending.customerId !== prepared.customer
        ) {
          throw new CheckoutInFlightError(tier);
        }
        return pending;
      }

      const fenced = isTierCheckoutFenced(existing);
      if (!fenced && isLive(existing)) {
        throw new AlreadySubscribedError(existing.status);
      }
      const { content } = await getActiveConfig(tx);
      const priceId = Object.entries(content.stripePriceMap).find(
        ([, configuredTier]) => configuredTier === tier
      )?.[0];
      if (!priceId) throw new UnknownTierPriceError(tier);
      const id = randomUUID();
      const reservedAt = await getDbNow(tx);
      const authorityMetadata = tierCheckoutAuthorityMetadata(
        id,
        scope.workspaceId,
        prepared.customer,
        stripeIdentity
      );
      const reserved: TierCheckoutAttempt = {
        id,
        tier,
        priceId,
        customerId: prepared.customer,
        subscriptionGeneration: tierCheckoutGeneration(existing),
        idempotencyKey: `checkout:v1:${scope.workspaceId}:${id}`,
        sessionId: null,
        subscriptionId: null,
        stripeAccountId: stripeIdentity.accountId,
        stripeLivemode: stripeIdentity.livemode,
        authorityMetadata,
        reservedAt,
      };
      const [claimed] = await tx
        .update(subscriptions)
        .set({
          tierCheckoutAttemptId: reserved.id,
          tierCheckoutAttemptTier: reserved.tier,
          tierCheckoutAttemptPriceId: reserved.priceId,
          tierCheckoutAttemptCustomerId: reserved.customerId,
          tierCheckoutAttemptSubscriptionGeneration:
            reserved.subscriptionGeneration,
          tierCheckoutAttemptIdempotencyKey: reserved.idempotencyKey,
          tierCheckoutAttemptSessionId: null,
          tierCheckoutAttemptSubscriptionId: null,
          tierCheckoutAttemptStripeAccountId: reserved.stripeAccountId,
          tierCheckoutAttemptStripeLivemode: reserved.stripeLivemode,
          tierCheckoutAttemptAuthority: reserved.authorityMetadata,
          tierCheckoutAttemptReservedAt: reserved.reservedAt,
          ...(!fenced
            ? {
                tierCheckoutFenceAt: reserved.reservedAt,
                tierCheckoutFenceSubscriptionId: existing.stripeSubscriptionId,
                tierCheckoutFenceStatus: existing.status,
                tierCheckoutFenceObservedSubscriptionId: null,
                stripeSubscriptionId: tierCheckoutFenceId(scope.workspaceId),
                status: "incomplete",
              }
            : {}),
        })
        .where(
          and(
            eq(subscriptions.workspaceId, scope.workspaceId),
            isNull(subscriptions.tierCheckoutAttemptId)
          )
        )
        .returning();
      if (claimed) return reserved;
      // The compare-and-set is the database guarantee beneath the workspace
      // lock (and keeps the unit database honest even where advisory locks are
      // emulated). A concurrent winner owns the sole attempt; converge on it.
      const observed = await subscriptionRow(tx, scope.workspaceId);
      const winner = observed ? tierCheckoutAttempt(observed) : null;
      if (
        !observed ||
        !winner ||
        winner.subscriptionGeneration !== tierCheckoutGeneration(observed) ||
        winner.tier !== tier ||
        winner.customerId !== prepared.customer
      ) {
        throw new CheckoutInFlightError(tier);
      }
      return winner;
    });

    let providerMutationStarted = false;
    try {
      const resolution: TierCheckoutResolution = await db.transaction(async (tx) => {
        await requireReauthenticatedOwnerInTx(tx, scope, authority);
        await takeWorkspaceLock(tx, scope.workspaceId);
        const current = await subscriptionRow(tx, scope.workspaceId);
        if (!current || current.stripeCustomerId !== prepared.customer) {
          throw new CustomerMappingLostError();
        }
        if (!isTierCheckoutFenced(current) && isLive(current)) {
          throw new AlreadySubscribedError(current.status);
        }
        const currentAttempt = tierCheckoutAttempt(current);
        if (!currentAttempt || currentAttempt.id !== attempt.id) {
          throw new CheckoutReconciliationRequiredError();
        }
        if (tierCheckoutGeneration(current) !== attempt.subscriptionGeneration) {
          throw new CheckoutReconciliationRequiredError();
        }
        await requireReauthenticatedOwnerInTx(tx, scope, authority);

        // Provider reads and mutation are bound to the explicitly configured
        // Stripe account/mode before they can authorize retirement or creation.
        const stripeIdentity = await getAuthenticatedStripeAccountIdentity();
        await assertTierCheckoutProtocolActive(tx, stripeIdentity);
        if (!(await isAutoTopupProtocolActive(tx))) {
          throw new AutoTopupAttemptIntegrityError(
            "tier Checkout signed authority remains closed until the shared HMAC rollout is active"
          );
        }
        verifyTierCheckoutAuthority(
          currentAttempt.authorityMetadata,
          {
            attemptId: currentAttempt.id,
            workspaceId: scope.workspaceId,
            customerId: currentAttempt.customerId,
          },
          stripeIdentity
        );
        if (
          stripeIdentity.accountId !== currentAttempt.stripeAccountId ||
          stripeIdentity.livemode !== currentAttempt.stripeLivemode
        ) {
          throw new CheckoutReconciliationRequiredError();
        }
        const dispatchAttempt = currentAttempt;
        const scan = await scanTierCheckoutSessions(dispatchAttempt, scope.workspaceId);
        let matches = scan.matches;
        if (dispatchAttempt.sessionId) {
          const exact = await getStripe().checkout.sessions.retrieve(dispatchAttempt.sessionId, {
            expand: ["line_items.data.price"],
          });
          if (!sessionMatchesAttempt(exact, dispatchAttempt, scope.workspaceId)) {
            throw new CheckoutReconciliationRequiredError();
          }
          matches = [exact, ...matches.filter((session) => session.id !== exact.id)];
        }
        if (scan.conflicts.length > 0) throw new CheckoutReconciliationRequiredError();
        if (matches.length > 1) throw new CheckoutReconciliationRequiredError();
        const existingSession = matches[0];
        if (existingSession) {
          await bindTierCheckoutSession(tx, scope.workspaceId, dispatchAttempt, existingSession.id);
          if (existingSession.status === "open") {
            if (!existingSession.url) throw new StripeSessionUrlMissingError("tier");
            return { kind: "url", url: existingSession.url };
          }
          if (
            existingSession.status === "expired" &&
            existingSession.payment_status !== "paid" &&
            !existingSession.subscription
          ) {
            await tx
              .update(subscriptions)
              .set(EMPTY_TIER_CHECKOUT_ATTEMPT)
              .where(eq(subscriptions.workspaceId, scope.workspaceId));
            return { kind: "restart" };
          }
          // Complete, paid-expired, or an unknown provider status may already
          // have created a subscription. Only the full subscription webhook may
          // advance the generation and release this fence.
          return { kind: "reconcile" };
        }

        const now = await getDbNow(tx);
        if (
          now.getTime() - dispatchAttempt.reservedAt.getTime() >=
          TIER_CHECKOUT_IDEMPOTENCY_SAFE_RETRY_MS
        ) {
          // The complete provider scan above is the proof that lets us retire an
          // attempt after the same-key retry window. Without it, a lost response
          // could be a completed, still-unmirrored subscription.
          await tx
            .update(subscriptions)
            .set(EMPTY_TIER_CHECKOUT_ATTEMPT)
            .where(eq(subscriptions.workspaceId, scope.workspaceId));
          return { kind: "restart" };
        }

        await requireReauthenticatedOwnerInTx(tx, scope, authority);
        providerMutationStarted = true;
        const session = await getStripe().checkout.sessions.create(
          {
            mode: "subscription",
            customer: dispatchAttempt.customerId,
            line_items: [{ price: dispatchAttempt.priceId, quantity: 1 }],
            success_url: urls.successUrl,
            cancel_url: urls.cancelUrl,
            metadata: {
              workspace_id: scope.workspaceId,
              respin_kind: "tier_checkout",
              respin_checkout_attempt_id: dispatchAttempt.id,
              tier: dispatchAttempt.tier,
              price_id: dispatchAttempt.priceId,
              ...dispatchAttempt.authorityMetadata,
            },
            subscription_data: {
              metadata: {
                workspace_id: scope.workspaceId,
                respin_kind: "tier_checkout",
                respin_checkout_attempt_id: dispatchAttempt.id,
                tier: dispatchAttempt.tier,
                price_id: dispatchAttempt.priceId,
                ...dispatchAttempt.authorityMetadata,
              },
            },
          },
          { idempotencyKey: dispatchAttempt.idempotencyKey }
        );
        await bindTierCheckoutSession(
          tx,
          scope.workspaceId,
          dispatchAttempt,
          session.id
        );
        if (!session.url) throw new StripeSessionUrlMissingError("tier");
        return { kind: "url", url: session.url };
      });
      if (resolution.kind === "url") return resolution.url;
      if (resolution.kind === "reconcile") {
        throw new CheckoutReconciliationRequiredError();
      }
    } catch (error) {
      if (
        providerMutationStarted &&
        !(error instanceof CheckoutReconciliationRequiredError) &&
        !(error instanceof StripeSessionUrlMissingError)
      ) {
        throw new CheckoutReconciliationRequiredError();
      }
      throw error;
    }
  }
  throw new CheckoutReconciliationRequiredError();
}

export async function createPackCheckoutUrl(
  db: DbLike,
  scope: WorkspaceScope,
  email: string,
  urls: CheckoutUrls,
  authority: ReauthenticatedSessionRef
): Promise<string> {
  assertOwner(scope);
  // As above, commit the customer mapping before opening Checkout so a lost
  // provider response cannot also erase the only durable retry authority.
  const customer = await db.transaction(async (tx) => {
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await takeWorkspaceLock(tx, scope.workspaceId);
    // THE PAUSE GUARD (audit 2026-08-17 #1). Placed FIRST — above the config
  // read, above `getOrCreateCustomer`, above anything that talks to Stripe —
  // because REQ-G08's promise is that a paused workspace is not charged, and
  // `getOrCreateCustomer` can CREATE a Stripe customer as a side effect. A
  // refusal that has already written to Stripe is a weaker refusal than one
  // that has not.
  //
  // In the PACKAGE, not only in `buyPackAction`: the server action's guard is
  // authoritative for the UI path, but this function is the reusable one and
  // M3's debit-refusal flow is the next caller. REQ-A02's `assertOwner` lives
  // here for exactly the same reason ("UI hiding is presentation, this is the
  // gate"), and the pause rule is no different.
  //
  // Against `pause_periods`, the AUTHORITY — not the `subscriptions.pausedAt`
  // mirror (billing gate, 2026-08-18). Two rounds of this guard read a proxy:
  //
  //  1. originally the raw mirror column, which disagreed with the billing
  //     page's liveness-gated derivation (audit #5) — so in the drift state
  //     `{status: canceled, pausedAt: <stale>}` the page rendered Buy-pack live
  //     and this threw on every click, forever, because a dead subscription
  //     emits no event that would ever clear the column;
  //  2. then `isPausedSubscription`, which fixed that mismatch and introduced a
  //     worse one pointing the other way: the mirror can read `canceled` while
  //     an OPEN `pause_periods` row still exists (the irreversible branch's
  //     bounded `ensurePauseEnded` declines, and `clearPauseMirror` then
  //     correctly refuses while a period is genuinely open). That row was
  //     permitted to BUY — and `debitCredits` refuses every spend while a pause
  //     is open, with no way to close it (`resumeSubscription` dead-ends at
  //     `NoLiveSubscriptionError`). Money for credits that can never be spent.
  //
  // The fix is to stop proxying. REQ-G08's other half — `debitCredits`
  // (ledger.ts) and `adjustCredits` — is enforced against `pause_periods`, and
  // D-AUDIT-1's grant refusal keys on the same table's knowledge time. The
  // charge clause was the only one that never consulted that table at all.
  //
  // So this guard asks BOTH records and refuses if EITHER says paused.
  //
  // `hasOpenPause` is the load-bearing half and the reason this is correct: it
  // makes the SELL-side refusal a strict superset of the SPEND-side one
  // (`debitCredits`, ledger.ts, refuses on exactly this table), and a superset
  // is what makes "sold credits that can never be spent" unrepresentable.
  //
  // The mirror half is DEFENCE-IN-DEPTH against a divergence the writers
  // currently prevent — not a live second hazard, and the billing gate's round-2
  // reachability analysis is why that is stated plainly here rather than left
  // implied. Every writer of `subscriptions.pausedAt` lives in `pause.ts`
  // (`recordPauseStart`, `recordPauseEnd`, `clearPauseMirror`), each writes the
  // period and the mirror as a transactional pair, and nothing anywhere deletes
  // a `pause_periods` row — so `pausedAt set ⟹ an open period exists` holds at
  // every commit boundary, and this half cannot fire alone in production today.
  // It is kept because a charging path is the wrong place to depend on that
  // invariant staying true, and because a superset costs one already-loaded row.
  // It is NOT kept because "the page shows the owner a pause" — an earlier
  // version of this comment said that, and it described a row shape no writer
  // can produce.
  //
  // The intended audit-#5 relaxation survives untouched, because the drift row
  // trips NEITHER: it has no open period, and its mirror is not live.
    const row = await subscriptionRow(tx, scope.workspaceId);
    const pausedByMirror = row !== null && isPausedSubscription(row);
    if (pausedByMirror || (await hasOpenPause(tx, scope.workspaceId))) {
      throw new SubscriptionPausedError("buy a credit pack");
    }
    const pending = row ? pendingAutoTopupAttempt(row) : null;
    if (pending) {
      throw new AutoTopupReconciliationRequiredError(pending.id, 0, 0);
    }
    const provider = await getAuthenticatedStripeAccountIdentity();
    await assertTierCheckoutProtocolActive(tx, provider);
    if (!(await isAutoTopupProtocolActive(tx))) {
      throw new AutoTopupAttemptIntegrityError(
        "signed pack Checkout authority remains closed until the shared HMAC rollout is active"
      );
    }
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await resolvePackPrice(tx, "v1");
  // ONE pack price, resolved and validated against Stripe (audit #7). This used
  // to read `stripePriceMap` directly and charge whatever Stripe's Price said,
  // while `maybeAutoTopup` charged `config.pack.priceUsd` — two authorities for
    // one price, which an /admin/config edit could silently split. Both paths now
    // come through `resolvePackPrice`, which refuses on divergence rather than
    // picking a side. `PackPriceNotMappedError` replaces this path's old
    // `UnknownTierPriceError("pack")` — same condition, a name that says which
    // price is missing.
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    return getOrCreateCustomer(tx, scope.workspaceId, email, scope.userId);
  });
  return db.transaction(async (tx) => {
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await takeWorkspaceLock(tx, scope.workspaceId);
    const row = await subscriptionRow(tx, scope.workspaceId);
    const pausedByMirror = row !== null && isPausedSubscription(row);
    if (pausedByMirror || (await hasOpenPause(tx, scope.workspaceId))) {
      throw new SubscriptionPausedError("buy a credit pack");
    }
    const pending = row ? pendingAutoTopupAttempt(row) : null;
    if (pending) {
      throw new AutoTopupReconciliationRequiredError(pending.id, 0, 0);
    }
    if (!row || row.stripeCustomerId !== customer) {
      throw new CustomerMappingLostError();
    }
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    const pack = await resolvePackPrice(tx, "v1");
    const provider = await getAuthenticatedStripeAccountIdentity();
    await assertTierCheckoutProtocolActive(tx, provider);
    if (!(await isAutoTopupProtocolActive(tx))) {
      throw new AutoTopupAttemptIntegrityError(
        "signed pack Checkout authority remains closed until the shared HMAC rollout is active"
      );
    }
    const attemptId = randomUUID();
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        customer,
        line_items: [{ price: pack.priceId, quantity: 1 }],
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        metadata: packCheckoutAuthorityMetadata(
          attemptId,
          scope.workspaceId,
          customer,
          pack,
          provider
        ),
      },
      { idempotencyKey: `pack-checkout:v1:${scope.workspaceId}:${attemptId}` }
    );
    if (!session.url) throw new StripeSessionUrlMissingError("pack");
    return session.url;
  });
}

export async function createPortalUrl(
  db: DbLike,
  scope: WorkspaceScope,
  returnUrl: string,
  authority: ReauthenticatedSessionRef
): Promise<string> {
  assertOwner(scope);
  return db.transaction(async (tx) => {
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await takeWorkspaceLock(tx, scope.workspaceId);
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .limit(1)
      .for("update");
    if (!row) throw new NoStripeCustomerError("The Customer Portal");
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    const session = await getStripe().billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: returnUrl,
    });
    return session.url;
  });
}

/**
 * The `incomplete`-subscription remedy (audit 2026-08-17 #8): the URL of the
 * hosted Stripe invoice page for a first payment that was declined or needs SCA.
 *
 * Why this and not the Customer Portal — the finding itself: `incomplete` counts
 * as LIVE for the duplicate-checkout guard (correctly; a second checkout would
 * create a second subscription and double-bill), so the page hides Subscribe and
 * offered only the Portal, which cannot resolve a subscription that never
 * activated. The customer had no way forward at all.
 *
 * Why the URL is fetched at CLICK TIME and never mirrored into a column:
 *  - it is a payable link to a specific invoice, and a stored payable URL is a
 *    new surface for something we already refuse to keep (D-AUDIT-2's posture on
 *    `stripe_events.payload`);
 *  - `hosted_invoice_url` is null until the invoice is finalized and the invoice
 *    itself changes state under us, so a mirrored copy would go stale silently —
 *    the class of defect that produced the `cancel_at` evidence-run finding;
 *  - no migration, and Stripe is the authority for its own object, exactly as
 *    `pack-price.ts` makes Stripe the authority for the pack amount.
 *
 * Owner-only and status-gated, because it is a payment surface.
 */
export async function createInvoiceRecoveryUrl(
  db: DbLike,
  scope: WorkspaceScope,
  authority: ReauthenticatedSessionRef
): Promise<string> {
  assertOwner(scope);
  return db.transaction(async (tx) => {
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await takeWorkspaceLock(tx, scope.workspaceId);
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .limit(1)
      .for("update");
    if (!row) throw new NoStripeCustomerError("recover an unpaid invoice");
    if (!row.stripeSubscriptionId) {
      throw new NoLiveSubscriptionError("recover an unpaid invoice");
    }
  // NARROW on purpose — see NotRecoverableError. Checked BEFORE any Stripe call,
  // so a wrong-state request costs nothing and cannot be told apart from a
  // right-state one by timing.
    if (!INCOMPLETE_STATUSES.has(row.status)) {
      throw new NotRecoverableError(row.status);
    }
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    const sub = await getStripe().subscriptions.retrieve(
      row.stripeSubscriptionId,
      { expand: ["latest_invoice"] }
    );
  // `latest_invoice: string | Invoice | null` in the installed SDK
  // (resources/Subscriptions.d.ts). The expand above should give the object, but
  // both shapes are handled rather than cast: an un-expanded id reaching a
  // `.hosted_invoice_url` read would be `undefined`, i.e. a silent "no invoice"
  // for a customer who has one.
    const invoice =
      typeof sub.latest_invoice === "string"
        ? await getStripe().invoices.retrieve(sub.latest_invoice)
        : sub.latest_invoice;
    if (!invoice) {
      throw new InvoiceRecoveryUnavailableError(
        `subscription ${row.stripeSubscriptionId} has no latest invoice`
      );
    }
  // `hosted_invoice_url?: string | null` — optional AND nullable, and Stripe
  // documents it as null "if the invoice has not been finalized yet". Only an
  // `open` invoice is payable; a draft/void/uncollectible one is not, and `paid`
  // means the webhook simply has not landed yet.
    if (invoice.status !== "open" || !invoice.hosted_invoice_url) {
      throw new InvoiceRecoveryUnavailableError(
        `invoice ${invoice.id ?? "(no id)"} is "${invoice.status}"${
          invoice.hosted_invoice_url ? "" : " and has no hosted invoice page"
        }`
      );
    }
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    return invoice.hosted_invoice_url;
  });
}

/** Pause 1–N months (bounds from config `pauseMonths`, REQ-G08/R-12). */
export async function pauseSubscription(
  db: DbLike,
  scope: WorkspaceScope,
  months: number,
  at: Date,
  authority: ReauthenticatedSessionRef
): Promise<void> {
  assertOwner(scope);
  await db.transaction(async (tx) => {
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    // SERIALIZE with the webhook writers (billing gate, 2026-08-18). Every
    // other writer of this workspace's money state takes this lock —
    // `handleStripeEvent` takes it before dispatch, and every ledger writer
    // takes it explicitly — but the owner's pause/resume path reached only
    // `assertWriteClock`, which does not lock. So an in-flight, uncommitted
    // owner pause was invisible to a concurrently-processing webhook: its
    // `ensurePauseEnded` saw no committed period, returned false, and the
    // pause-sync branch's `clearPauseMirror` then cleared `pausedAt` after the
    // owner's write committed — leaving `{open pause_periods, mirror clear}`.
    // Money-safe in both directions (every money guard reads `pause_periods`),
    // but the page would show `active` while credits were frozen and
    // `resumeSubscription` would throw `NotPausedError`, so the owner could
    // not resume early. Taking the lock puts this writer on the same footing
    // as the others rather than relying on a millisecond-wide window.
    await takeWorkspaceLock(tx, scope.workspaceId);
    const { content } = await getActiveConfig(tx);
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
    // Validate the request timestamp under the lifecycle+billing locks, but
    // derive the provider deadline from the authoritative database clock. A
    // skewed app host can therefore neither lengthen nor shorten the configured
    // pause, and a concurrently activated config is re-read before dispatch.
    const now = await assertWriteClock(tx, scope.workspaceId, at);
    // Clamped, not overflowed: a pause started on 31 January must resume on the
    // final day of February, not overflow into March.
    const resumesAt = addMonthsUtc(now, months);
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .limit(1)
      .for("update");
    if (!sub?.stripeSubscriptionId || !isLive(sub)) {
      throw new NoLiveSubscriptionError("pause a subscription");
    }
    // Keep the shared lifecycle/member and billing locks through the provider
    // call. A demotion/tombstone therefore cannot land between R-118
    // authorization and the mutation; the webhook remains the convergence path
    // if Stripe succeeds but the local transaction later fails.
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
      pause_collection: {
        behavior: "void",
        resumes_at: Math.floor(resumesAt.getTime() / 1000),
      },
    });
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
  scope: WorkspaceScope,
  authority: ReauthenticatedSessionRef
): Promise<void> {
  assertOwner(scope);
  // LIVENESS, the guard resume's sibling `pauseSubscription` has always had and
  // this one did not (audit 2026-08-17 #25). The window is real: the owner
  // clicks Resume in the moments before a portal-driven cancellation's webhook
  // lands, so the mirror still says `{pausedAt: <set>}` for a subscription
  // Stripe has already ended. `subscriptions.update` on a canceled subscription
  // then throws a RAW Stripe error, which reaches the billing page as
  // `?e=unknown` → "Something went wrong" — for a state the product can name
  // exactly. Through the ONE liveness definition, so this is a further reader
  // of `hasLiveStripeSubscription` rather than a second notion of liveness.
  //
  // Deliberately AFTER the NotPausedError check: "you have nothing paused" is
  // the more useful message when both are true, and it is the one an owner
  // double-clicking Resume will actually hit.
  await db.transaction(async (tx) => {
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    // Same lock, same reason as `pauseSubscription` above.
    await takeWorkspaceLock(tx, scope.workspaceId);
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .limit(1)
      .for("update");
    if (!sub?.stripeSubscriptionId || sub.pausedAt === null) {
      throw new NotPausedError();
    }
    if (!isLive(sub)) throw new NoLiveSubscriptionError("resume a subscription");
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
      pause_collection: "",
    });
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
  opts: { enabled: boolean; monthlyCapCents?: number },
  authority: ReauthenticatedSessionRef
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
  await db.transaction(async (tx) => {
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    // Serialise the local billing mirror with the charge and webhook writers as
    // well as the lifecycle/membership protocol held by the helper above.
    await takeWorkspaceLock(tx, scope.workspaceId);
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .limit(1)
      .for("update");
    if (!row) throw new NoStripeCustomerError("Auto-top-up");
    // ARMING the flag requires a LIVE subscription, through the ONE definition
  // (billing round-10 CHANGE 4). The only check here used to be "a subscriptions
  // row exists", so a canceled or never-subscribed workspace could still reach
  // {status: canceled, autoTopupV1Enabled: true} — precisely the state
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
  // CHARGEABILITY is a second question, and `unpaid` is where the two answers
  // differ (audit 2026-08-17 #6). `hasLiveStripeSubscription` says yes to
  // `unpaid` on purpose — the subscription still exists in Stripe and the
  // customer can pay their way out of dunning, and treating it as irreversible
  // once made an `unpaid` workspace unrecoverable by ANY event (round-5 CHANGE).
  // But `unpaid` means Stripe has STOPPED COLLECTING, and arming an off-session
  // charging authority on it would show the owner auto-top-up as ON for a
  // subscription `getWorkspaceBillingState` already renders as `free` — the tail
  // wagging the dog that round-10 CHANGE 4 introduced the liveness guard to
  // stop, one status further along.
  //
  // `maybeAutoTopup` refuses the same status at the actual charge site, through
  // `mayChargeOffSession` — the shared predicate, which is genuinely the GATE
  // there as of the 2026-08-18 billing gate. (It had been dead code while this
  // comment claimed it was the mechanism; the fix was to make the claim true
  // rather than to soften it, so the two sites cannot drift.) The charge site
  // still names which clause bit, for `AutoTopupResult.reason`. Both sites
  // guard, for round-10's stated reason: the trigger refusing is not enough
  // when the UI is the next reader.
  //
  // DISABLING stays unguarded here, exactly as the liveness check above leaves
  // it: it can only move the row toward the safe state, and refusing it would
  // trap an owner whose subscription entered dunning while the flag was armed.
    if (opts.enabled && !OFF_SESSION_CHARGEABLE_STATUSES.has(row.status)) {
      throw new NotChargeableError("arm auto-top-up", row.status);
    }
    if (
      !opts.enabled &&
      row.autoTopupAttemptId !== null &&
      row.autoTopupAttemptDispatchedAt === null
    ) {
      if (
        !(await clearPendingAutoTopupAttempt(
          tx,
          scope.workspaceId,
          row.autoTopupAttemptId
        ))
      ) {
        throw new AutoTopupAttemptIntegrityError(
          "the pending reservation changed while auto-top-up was being disabled"
        );
      }
    }
    await requireReauthenticatedOwnerInTx(tx, scope, authority);
    const rollout = await getAutoTopupProtocolRollout(tx);
    if (rollout.state !== "active") {
      const [staged] = await tx
        .update(subscriptions)
        .set({
          // During expand/drain this is desired state only. Neither the old nor
          // the new charge site can treat it as provider authority.
          autoTopupEnabled: false,
          autoTopupV1Enabled: false,
          autoTopupRearmAfterUpgrade: opts.enabled,
          autoTopupMonthlyCapCents: opts.enabled ? opts.monthlyCapCents : null,
        })
        .where(eq(subscriptions.workspaceId, scope.workspaceId))
        .returning({ workspaceId: subscriptions.workspaceId });
      if (!staged) throw new NoStripeCustomerError("Auto-top-up");
      return;
    }
    if (opts.enabled) {
      // An active row is not sufficient authority on its own. Revalidate the
      // immutable HMAC key, Stripe account, and livemode before the UI can save
      // an ON state. Disabling deliberately remains available under drift.
      await isAutoTopupProtocolActive(tx);
    }
    const protocolCutoverAt = row.autoTopupAttemptCutoverAt ?? (await getDbNow(tx));
    const protocolRow = await ensureAutoTopupAttemptProtocol(
      tx,
      scope.workspaceId,
      row,
      protocolCutoverAt
    );
    const [updated] = await tx
      .update(subscriptions)
      .set({
        // The legacy bit stays false forever. Old binaries therefore remain
        // unable to charge during migrate-first rollout or after rollback.
        autoTopupEnabled: false,
        autoTopupV1Enabled: opts.enabled,
        autoTopupRearmAfterUpgrade: false,
        autoTopupMonthlyCapCents: opts.enabled ? opts.monthlyCapCents : null,
        autoTopupProtocolVersion: 1,
        autoTopupAttemptCutoverAt:
          protocolRow.autoTopupAttemptCutoverAt ?? protocolCutoverAt,
      })
      .where(eq(subscriptions.workspaceId, scope.workspaceId))
      .returning({ workspaceId: subscriptions.workspaceId });
    if (!updated) throw new NoStripeCustomerError("Auto-top-up");
  });
}

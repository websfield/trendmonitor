// PURE presentation for /settings/billing (REQ-G01/G03/G08 UI half, REQ-A02).
// The page does the gate, the scoping and the reads; every branch below is
// reachable from a test with a fixture.
//
// THE CANCEL RULE (skill B4, REQ-G08): the cancel flow ALWAYS offers pause
// first. Mechanically, not by arrangement — the only control on this page whose
// purpose is cancellation carries `data-cancel="final"`, it exists ONLY inside
// the interstitial, and the interstitial renders the pause offer above it.
// `tests/billing-ui.test.tsx` asserts both halves: no `data-cancel="final"` on
// the ordinary page at all, and on the interstitial the pause offer's marker
// appears earlier in the HTML than it does.
//
// HONESTY NOTE on prices: config carries tier ALLOWANCES and the pack price,
// but tier prices live in Stripe (the setup script creates them; a Stripe price
// amount is immutable). So this page shows the credits a plan includes and
// sends the reader to Stripe for the amount, rather than printing an R-7
// indicative number that could disagree with what the card is actually charged.
import type { ReactNode } from "react";

export type FormAction = string | ((formData: FormData) => void | Promise<void>);

export type TierOption = {
  tier: "creator" | "pro" | "studio";
  label: string;
  monthlyCredits: number;
  /** False when the active config maps no Stripe price for this tier. */
  priceMapped: boolean;
};

export type BillingViewProps = {
  /**
   * `state: "unknown"` is NOT a fifth billing state — it is the honest render
   * when `getWorkspaceBillingState` could not answer (a fail-closed config
   * read). Defaulting to "free" there would print an entitlement claim the
   * server could not verify, which is the invented-specifics failure exactly.
   */
  state: {
    tier: string;
    state: "free" | "active" | "grace" | "paused" | "incomplete" | "unknown";
    reason?: "unmapped_price";
    graceExpiresAt?: Date;
    resumesAt?: Date;
    /**
     * The scheduled END of a live subscription, derived by `scheduledCancelAt`
     * from BOTH Stripe cancellation fields. The page never reads those columns
     * itself — one definition, one reader (evidence-run finding 1).
     */
    cancelAt?: Date;
    /** Only on `incomplete` — the plan the unpaid first invoice is for. */
    pendingTier?: string;
  };
  isOwner: boolean;
  /** `hasLiveStripeSubscription` — the ONE definition, read in the page. */
  hasLiveSubscription: boolean;
  hasStripeCustomer: boolean;
  autoTopup: { enabled: boolean; monthlyCapCents: number | null };
  /** null when config could not be read — nothing is guessed. */
  config:
    | {
        ok: true;
        version: number;
        tiers: TierOption[];
        pack: { credits: number; priceUsd: number; mapped: boolean };
        pauseMonths: { min: number; max: number };
      }
    | { ok: false; title: string; detail: string };
  stripe: { configured: boolean; remedy: string };
  error: { title: string; detail: string } | null;
  /** ?cancel=1 — render the cancel interstitial (pause offer first). */
  showCancel: boolean;
  actions: {
    subscribe: FormAction;
    pack: FormAction;
    portal: FormAction;
    /** The `incomplete` remedy — hosted invoice, never the Portal (audit #8). */
    recoverInvoice: FormAction;
    pause: FormAction;
    resume: FormAction;
    autoTopup: FormAction;
  };
  cancelHref: string;
  usageHref: string;
};

const section: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "1rem",
  marginBottom: "1rem",
};
const muted: React.CSSProperties = { color: "#555", fontSize: "0.9rem" };
const warn: React.CSSProperties = {
  ...section,
  borderColor: "#c00",
  background: "#fff5f5",
};

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function Blocked({ reason, id }: { reason: string; id?: string }) {
  return (
    <p style={muted} id={id}>
      {reason}
    </p>
  );
}

/**
 * A submit button that is disabled with a NAMED reason, or live. One component
 * so no control on this page can be disabled without saying why — the "fail
 * closed, but never without a way forward" rule in button form.
 *
 * The reason is also PROGRAMMATICALLY ASSOCIATED with the control it disables
 * (audit 2026-08-17 #17, WCAG 1.3.1 / 3.3.2). It was visible but unlinked, so a
 * screen-reader user tabbing the page heard "Buy 500 credits for $10, dimmed"
 * and nothing else — the reason sat in a sibling paragraph they had to go and
 * find. `testId` is REQUIRED rather than optional now because it is the id
 * stem: an unnamed control could not carry the association, and making it
 * optional would let a future control opt out of the fix silently.
 */
function ActionButton({
  action,
  label,
  blockedBy,
  hidden,
  children,
  testId,
  cancelMarker,
}: {
  action: FormAction;
  label: string;
  blockedBy: string | null;
  hidden?: ReactNode;
  children?: ReactNode;
  testId: string;
  cancelMarker?: boolean;
}) {
  // The cancel marker rides BOTH branches. Marking only the live form would
  // mean a cancellation control that happens to be disabled (non-owner, no
  // Stripe key) carries no marker — and the "no control on the ordinary page
  // reaches cancellation" assertion would pass over it.
  const cancel = cancelMarker ? "final" : undefined;
  const reasonId = `${testId}-reason`;
  if (blockedBy) {
    return (
      <div data-testid={testId} data-cancel={cancel}>
        <button type="button" disabled aria-describedby={reasonId}>
          {label}
        </button>
        <Blocked reason={blockedBy} id={reasonId} />
      </div>
    );
  }
  return (
    <form action={action} data-testid={testId} data-cancel={cancel}>
      {hidden}
      {children}
      <button type="submit">{label}</button>
    </form>
  );
}

export function BillingView(props: BillingViewProps) {
  const {
    state,
    isOwner,
    hasLiveSubscription,
    hasStripeCustomer,
    autoTopup,
    config,
    stripe,
    error,
    showCancel,
    actions,
    cancelHref,
    usageHref,
  } = props;

  // Why a control cannot be used, in priority order: role, then server config,
  // then runtime state. Whichever bites first is the one the reader is told.
  const notOwner = isOwner
    ? null
    : "Only the workspace owner can change billing. Nothing on this page will act for other roles.";
  const noStripe = stripe.configured ? null : stripe.remedy;
  const noConfig = config.ok
    ? null
    : "Prices and allowances come from the versioned runtime config, which this server cannot read — so no plan can be started until that is fixed.";
  const baseBlock = notOwner ?? noStripe ?? noConfig;

  /**
   * The UI half of audit 2026-08-17 #1. `createPackCheckoutUrl` refuses a
   * paused workspace in the package (REQ-G08, "no charges while paused"), and
   * that guard is the authoritative one — but a page that offers a live "Buy
   * pack" button which then fails on click is the "offering a button that
   * cannot help" failure the round-10 NOTE named, made worse here because the
   * pause section two components away says "No charges while paused" in so many
   * words. Server refusal AND disabled control, saying the same thing.
   */
  const pausedBlock =
    state.state === "paused"
      ? "This subscription is paused, and a pause means no charges. Resume it below and this becomes available again — your existing credits are frozen, not lost."
      : null;

  return (
    <section>
      <h1>Billing</h1>

      {error ? (
        <div style={warn} data-testid="action-error" role="alert">
          <strong>{error.title}</strong>
          <p style={muted}>{error.detail}</p>
        </div>
      ) : null}

      {!config.ok ? (
        <div style={warn} data-testid="config-error">
          <strong>{config.title}</strong>
          <p style={muted}>{config.detail}</p>
        </div>
      ) : null}

      {!stripe.configured ? (
        <div style={warn} data-testid="stripe-unconfigured">
          <strong>Billing is not configured on this server</strong>
          <p style={muted}>{stripe.remedy}</p>
        </div>
      ) : null}

      <div style={section} data-testid="current-plan">
        <h2 style={{ marginTop: 0 }}>Current plan</h2>
        <p>
          <strong data-testid="tier">{state.tier}</strong> —{" "}
          <span data-testid="state">{state.state}</span>
        </p>
        {state.reason === "unmapped_price" ? (
          <p style={muted} data-testid="unmapped-price">
            This workspace pays for a Stripe price that the active config does
            not map to a plan, so it is being treated as Free rather than
            guessed. An operator can fix it by adding the price id to
            `stripePriceMap` at /admin/config — no replay is needed, the tier is
            derived at read time.
          </p>
        ) : null}
        {state.state === "grace" && state.graceExpiresAt ? (
          <p data-testid="grace">
            A payment failed. Your plan keeps working until{" "}
            {day(state.graceExpiresAt)}; after that this workspace is treated as
            Free. Update your card in the Customer Portal to keep it.
          </p>
        ) : null}
        {state.state === "paused" ? (
          <p data-testid="paused">
            Paused —{" "}
            {state.resumesAt
              ? `scheduled to resume on ${day(state.resumesAt)}.`
              : "no resume date recorded yet."}{" "}
            Credits are frozen and their expiry clocks are suspended.
          </p>
        ) : null}
        {/* INCOMPLETE — its own state at last (audit 2026-08-17 #8). It used to
            fall through to Free here while STILL counting as live for the
            duplicate-checkout guard, so the page hid Subscribe, offered only
            the Customer Portal (which cannot resolve a subscription that never
            activated), and left a declined or SCA-required first payment with
            no way forward at all. The entitlement claim stays honest — Free is
            what this workspace has — and `pendingTier` names what is being
            bought without implying it is active. */}
        {state.state === "incomplete" ? (
          <p data-testid="incomplete">
            Your first payment has not completed
            {state.pendingTier ? ` for the ${state.pendingTier} plan` : ""}.
            Until it does, this workspace stays on Free — no credits have been
            granted, and nothing further has been charged. Finish the payment
            below.
          </p>
        ) : null}
        {state.state === "unknown" ? (
          <p data-testid="state-unknown">
            Your plan could not be determined — the configuration this server
            reads plans from is unavailable, and nothing is being assumed. See
            the message above; no billing action will run until it is fixed.
          </p>
        ) : null}
        {/* The SCHEDULED END, derived by `scheduledCancelAt` in state.ts from
            BOTH of Stripe's cancellation fields (evidence-run finding 1: the
            Customer Portal sets `cancel_at`, not the legacy boolean, so a page
            reading the boolean told a paying creator nothing about a plan that
            was already scheduled to end). The date is printed because we have
            it; there is no "some time later" branch to fabricate. */}
        {state.cancelAt ? (
          <p data-testid="scheduled-cancel">
            This subscription is set to end on {day(state.cancelAt)}. It keeps
            working until then, and you can start a new plan afterwards.
          </p>
        ) : null}
        <p style={muted}>
          Credit balance and history are on the <a href={usageHref}>usage page</a>.
        </p>
      </div>

      {/* SUBSCRIBE vs MANAGE — the UI face of AlreadySubscribedError (plan-review
          F1). `hasLiveSubscription` is `hasLiveStripeSubscription` computed in the
          page from the mirror row: the same predicate the checkout guard, the
          auto-top-up arming guard and maybeAutoTopup use. Offering a subscribe
          button to a live subscriber would be offering a second Stripe
          subscription, i.e. double billing, and the action would refuse it. */}
      {state.state === "incomplete" ? (
        // THE REMEDY THE PORTAL CANNOT BE (audit 2026-08-17 #8). Checked ahead
        // of `hasLiveSubscription` deliberately: an incomplete subscription IS
        // live (the duplicate-checkout guard is right to block a second
        // checkout — it would create a second subscription and bill twice), so
        // without this branch it lands in "Change your plan" and is offered a
        // Customer Portal that has nothing it can fix.
        <div style={section} data-testid="incomplete-recovery">
          <h2 style={{ marginTop: 0 }}>Finish signing up</h2>
          <p style={muted}>
            Stripe is holding an unpaid invoice for this subscription — usually
            a declined card, or a bank confirmation that was not completed. The
            Customer Portal cannot resolve that, so it is not offered here: the
            invoice itself is where it gets paid. Starting a second plan is
            still blocked, because that would bill you twice.
          </p>
          <ActionButton
            action={actions.recoverInvoice}
            testId="recover-invoice"
            label="Pay the outstanding invoice"
            blockedBy={notOwner ?? noStripe}
          />
          <p style={muted}>
            If there is nothing left to pay, the attempt has probably lapsed —
            Stripe expires an unpaid first invoice after about a day — and you
            can start a new plan once it does.
          </p>
        </div>
      ) : hasLiveSubscription ? (
        <div style={section} data-testid="manage-plan">
          <h2 style={{ marginTop: 0 }}>Change your plan</h2>
          <p style={muted}>
            You already have a subscription. Upgrades, downgrades and payment
            details are handled in Stripe&apos;s Customer Portal — starting a new
            checkout here would create a SECOND subscription and bill you twice.
          </p>
          <ActionButton
            action={actions.portal}
            label="Manage plan and payment method in the Customer Portal"
            testId="portal-manage"
            blockedBy={
              notOwner ??
              noStripe ??
              (hasStripeCustomer
                ? null
                : "No Stripe billing account exists for this workspace yet.")
            }
          />
        </div>
      ) : (
        <div style={section} data-testid="subscribe">
          <h2 style={{ marginTop: 0 }}>Start a plan</h2>
          {config.ok ? (
            <>
              {config.tiers.map((t) => (
                <div key={t.tier} style={{ marginBottom: "0.75rem" }}>
                  <ActionButton
                    action={actions.subscribe}
                    testId={`subscribe-${t.tier}`}
                    label={`Subscribe — ${t.label}`}
                    hidden={<input type="hidden" name="tier" value={t.tier} />}
                    blockedBy={
                      baseBlock ??
                      (t.priceMapped
                        ? null
                        : `No Stripe price is mapped for ${t.label}. An operator needs to run \`pnpm stripe:setup\` and paste the printed price ids into /admin/config as \`stripePriceMap\`.`)
                    }
                  />
                  <p style={muted}>
                    {t.monthlyCredits} credits per month (from config v
                    {config.version}). The price is shown on Stripe&apos;s
                    checkout page — it lives in Stripe, and this page will not
                    print a number it cannot verify.
                  </p>
                </div>
              ))}
            </>
          ) : (
            <Blocked reason={config.detail} />
          )}
        </div>
      )}

      <div style={section} data-testid="pack">
        <h2 style={{ marginTop: 0 }}>Credit pack</h2>
        {config.ok ? (
          <>
            <ActionButton
              action={actions.pack}
              testId="buy-pack"
              label={`Buy ${config.pack.credits} credits for $${config.pack.priceUsd}`}
              blockedBy={
                baseBlock ??
                // AUDIT #1's UI half, ahead of the price-map reason: when the
                // workspace is paused the pack is refused whatever the config
                // says, so that is the reason the reader is owed.
                pausedBlock ??
                (config.pack.mapped
                  ? null
                  : "No Stripe price is mapped for the credit pack. An operator needs to run `pnpm stripe:setup` and paste the printed price ids into /admin/config as `stripePriceMap`.")
              }
            />
            <p style={muted}>
              A one-off pack. Packs are valid for longer than a monthly
              allowance, and monthly credits are always spent first so a pack is
              not burned while an allowance expires unused.
            </p>
          </>
        ) : (
          <Blocked reason={config.detail} />
        )}
      </div>

      <div style={section} data-testid="auto-topup">
        <h2 style={{ marginTop: 0 }}>Auto-top-up</h2>
        <p style={muted}>
          Currently{" "}
          <strong data-testid="auto-topup-state">
            {autoTopup.enabled ? "on" : "off"}
          </strong>
          {autoTopup.enabled && autoTopup.monthlyCapCents !== null
            ? `, capped at $${(autoTopup.monthlyCapCents / 100).toFixed(2)} per calendar month.`
            : "."}
        </p>
        {notOwner ? (
          <Blocked reason={notOwner} />
        ) : (
          <form action={actions.autoTopup}>
            {/* AUDIT #26: the copy below describes live behaviour NOTHING can
                trigger yet. M1 ships and tests `maybeAutoTopup`, but its only
                future caller is M3's debit site — so an owner arming this today
                is recording a preference, not switching something on. The
                sibling /usage page discloses the identical M3-not-built gap for
                the identical reason; this section did not, which made it the
                one undisclosed dead control on the surface. Disclosed rather
                than disabled, because the preference IS honoured the moment the
                caller exists and disabling it would lose that. */}
            <p style={muted} id="auto-topup-unbuilt" data-testid="auto-topup-unbuilt">
              Nothing can trigger this yet: generation arrives in a later
              milestone (M3), and only a generation spends credits. Setting it
              now records the preference, and it takes effect with the first
              one.
            </p>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={autoTopup.enabled}
                disabled={!hasLiveSubscription && !autoTopup.enabled}
                // AUDIT #17, the second cited control. Both reasons that can
                // apply to this checkbox are named here — the M3 disclosure
                // always, the liveness refusal when it bites — so the reason a
                // control is dimmed reaches a screen reader with the control
                // rather than as an unlinked paragraph after it.
                aria-describedby={
                  hasLiveSubscription
                    ? "auto-topup-unbuilt"
                    : "auto-topup-unbuilt auto-topup-blocked-reason"
                }
              />{" "}
              Buy a pack automatically when a generation would run out of credits
            </label>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Monthly cap (US$){" "}
              <input
                type="number"
                name="capUsd"
                min="1"
                step="1"
                defaultValue={
                  autoTopup.monthlyCapCents !== null
                    ? String(autoTopup.monthlyCapCents / 100)
                    : ""
                }
              />
            </label>
            <button type="submit">Save auto-top-up</button>
            {!hasLiveSubscription ? (
              <p
                style={muted}
                id="auto-topup-blocked-reason"
                data-testid="auto-topup-blocked"
              >
                Turning auto-top-up ON needs a live subscription — there is no
                saved payment method to charge without one. Turning it OFF is
                always allowed.
              </p>
            ) : null}
            <p style={muted}>
              Nothing is charged beyond the cap within one calendar month.
            </p>
          </form>
        )}
      </div>

      {state.state === "paused" ? (
        <div style={section} data-testid="resume">
          <h2 style={{ marginTop: 0 }}>Resume</h2>
          <ActionButton
            action={actions.resume}
            testId="resume-button"
            label="Resume subscription now"
            blockedBy={notOwner ?? noStripe}
          />
        </div>
      ) : null}

      {/* Pause as a FIRST-CLASS control (REQ-G08), not only as a cancellation
          consolation. The interstitial re-offers it because that is where the
          rule bites; here it is simply the feature. */}
      {!showCancel && hasLiveSubscription && state.state !== "paused" ? (
        <div style={section} data-testid="pause">
          <h2 style={{ marginTop: 0 }}>Pause</h2>
          <p style={muted}>
            No charges while paused. Credits are frozen and their expiry clocks
            stop, so nothing you already paid for is lost.
          </p>
          {config.ok ? (
            notOwner ?? noStripe ? (
              <Blocked reason={(notOwner ?? noStripe) as string} />
            ) : (
              <form action={actions.pause} data-testid="pause-form">
                <label>
                  Pause for{" "}
                  <select
                    name="months"
                    defaultValue={String(config.pauseMonths.min)}
                  >
                    {Array.from(
                      {
                        length:
                          config.pauseMonths.max - config.pauseMonths.min + 1,
                      },
                      (_, i) => config.pauseMonths.min + i
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m} month{m === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>{" "}
                <button type="submit">Pause subscription</button>
              </form>
            )
          ) : (
            <Blocked reason={config.detail} />
          )}
        </div>
      ) : null}

      {showCancel ? (
        // THE CANCEL INTERSTITIAL. Order is the rule: pause offer, then — and
        // only then — the way out (REQ-G08 / skill B4).
        <div style={section} data-testid="cancel-flow">
          <h2 style={{ marginTop: 0 }} data-testid="cancel-pause-offer">
            Before you cancel: pause instead?
          </h2>
          <p>
            A pause stops charges and freezes your credits — they are not spent,
            not granted, and their expiry clocks stop until you come back. A
            cancellation ends the subscription and your remaining credits expire
            on their own schedule.
          </p>
          {config.ok ? (
            notOwner ?? noStripe ? (
              <Blocked reason={(notOwner ?? noStripe) as string} />
            ) : (
              <form action={actions.pause} data-testid="pause-offer-form">
                <label>
                  Pause for{" "}
                  <select name="months" defaultValue={String(config.pauseMonths.min)}>
                    {Array.from(
                      {
                        length:
                          config.pauseMonths.max - config.pauseMonths.min + 1,
                      },
                      (_, i) => config.pauseMonths.min + i
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m} month{m === 1 ? "" : "s"}
                      </option>
                    ))}
                  </select>
                </label>{" "}
                <button type="submit">Pause instead of cancelling</button>
              </form>
            )
          ) : (
            <Blocked reason={config.detail} />
          )}

          <hr style={{ margin: "1rem 0" }} />

          <h3 data-testid="cancel-final-heading">Still want to cancel?</h3>
          <p style={muted}>
            Cancellation happens in Stripe&apos;s Customer Portal. Your plan runs
            to the end of the period you have already paid for.
          </p>
          <ActionButton
            action={actions.portal}
            testId="cancel-final"
            cancelMarker
            label="Continue to the Customer Portal to cancel"
            blockedBy={
              notOwner ??
              noStripe ??
              (hasStripeCustomer
                ? null
                : "No Stripe billing account exists for this workspace yet, so there is nothing to cancel.")
            }
          />
        </div>
      ) : hasLiveSubscription ? (
        <div style={section} data-testid="cancel-entry">
          <h2 style={{ marginTop: 0 }}>Cancel</h2>
          <p style={muted}>
            <a href={cancelHref} data-testid="cancel-entry-link">
              Cancel subscription
            </a>{" "}
            — we will show you the pause option first.
          </p>
        </div>
      ) : null}
    </section>
  );
}

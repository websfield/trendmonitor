// PURE presentation for /usage (REQ-G07, M1 slice). The page component does the
// gate, the scoping and the reads; this file only renders what it is handed, so
// every state below — zero balance, empty ledger, paused, degraded — is
// reachable from a test with a fixture instead of a database.
//
// Non-negotiable 2 (the ledger IS the balance): `balance` arrives already
// derived by `deriveBalance`, the single authority. Nothing here adds up the
// deltas in `rows` — the table is history, not arithmetic, and a second
// derivation living in a view is exactly the drift that rule forbids.
//
// Non-negotiable 6 (no invented specifics): every empty state says WHY it is
// empty and which milestone fills it. No projected burn, no estimated
// days-to-empty, no invoice list we do not have.
import type { ReactNode } from "react";
import { Banner } from "../../ui/banner";
import { buttonClass } from "../../ui/button";
import { LedgerTable } from "../../ui/ledger-table";

/** A server action, or a plain URL when a test renders this component. */
export type FormAction = string | ((formData: FormData) => void | Promise<void>);

export type UsageLedgerRow = {
  id: string;
  createdAt: Date;
  kind: string;
  delta: number;
  expiresAt: Date | null;
  ref: string | null;
};

/** R7/R8 (slice 2b): the scoped, unclamped credit-burn total for the current
 *  billing period. `ok: false` is a QUERY failure, distinct from `hasAnyDebit:
 *  false` (a real, answered "nothing spent") — collapsing the two would make a
 *  transient read failure render as a confirmed zero. */
export type MonthlyBurn =
  | { ok: true; hasAnyDebit: true; totalDebit: number }
  | { ok: true; hasAnyDebit: false }
  | { ok: false };

export type UsageViewProps = {
  balance:
    | { ok: true; value: number; asOf: Date }
    | { ok: false; title: string; detail: string };
  burn: MonthlyBurn;
  rows: UsageLedgerRow[];
  /** True when the ledger has more rows than this page shows. */
  moreRows: boolean;
  paused: { resumesAt: Date | null } | null;
  portal:
    | { available: true; action: FormAction }
    | { available: false; reason: string };
  /** Copy for a `?e=` code a refused action redirected back with. */
  error: { title: string; detail: string } | null;
  billingHref: string;
};

// Panels, banners, muted text and the ledger table are Signal classes and
// primitives (app/globals.css, app/ui/).

/** ISO day. Deliberately not locale-formatted: the server and the browser must
 *  agree, and a test must be able to assert an exact string. */
export function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function Note({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

/**
 * What the two spend-derived notes may honestly say, given ONLY what this page
 * can see.
 *
 * A PURE FUNCTION over the visible page, because the wrong version of this is
 * two constants — which is exactly what shipped and what three reviewers found
 * (2026-08-28). The sentence "Nothing has been spent from this workspace yet"
 * was hardcoded into both notes and rendered directly above the creator's own
 * debit row.
 *
 * THREE BRANCHES, AND THE MIDDLE ONE IS THE POINT. `rows` is a CLAMPED page
 * (`moreRows` says so), so an absent debit on page 1 is not evidence that
 * nothing was ever spent — inferring it would be absence read as a zero, the
 * error this repo has shipped twice. So:
 *
 *   spent    — a debit is visible. Never claim nothing was spent.
 *   unknown  — no debit visible, but the page is clamped. Say what is true of
 *              the entries SHOWN, and claim nothing about the rest.
 *   none     — no debit visible and the whole ledger fits. Only here may the
 *              page say the workspace has spent nothing.
 */
export type SpendVisibility = "spent" | "unknown" | "none";

export function spendVisibility(
  rows: readonly { delta: number }[],
  moreRows: boolean
): SpendVisibility {
  if (rows.some((r) => r.delta < 0)) return "spent";
  return moreRows ? "unknown" : "none";
}

/**
 * The "by mode" note (R9, slice 2b).
 *
 * NO LONGER BRANCHES ON `SpendVisibility` — the burn TOTAL panel above now
 * answers "was anything spent" with a real, unclamped number (R7), so this
 * note's only job is the one question left: why is there no BREAKDOWN yet.
 * That answer does not depend on whether anything was spent, so it is one
 * sentence, always.
 *
 * PINNED TO A COUNT, not free prose: `tests/usage-burn-by-mode.test.ts`
 * derives the real number of distinct `model_usage.purpose` values written
 * anywhere in `packages/credits/src` and fails if it is no longer 1 — the
 * mechanism R9 asks for so this sentence cannot stay true past slice 6
 * without someone noticing.
 */
export const KNOWN_SPEND_PURPOSE_COUNT = 1;

export function burnByModeNote(): string {
  return "A per-mode breakdown is not available yet — exactly one thing spends credits today (building your voice brain), so there is nothing yet to split. It appears the day a second one exists.";
}

/** The "Days to empty" note. Same rule: the clamped page cannot prove absence. */
export function daysToEmptyNote(v: SpendVisibility): string {
  if (v === "spent") {
    return "Not enough data yet. This needs a longer spending history than this workspace has to measure a rate.";
  }
  if (v === "unknown") {
    return "Not enough data. This needs a spending history to measure, and none appears in the entries shown below.";
  }
  return "Not enough data. This needs a spending history to measure, and no credits have been spent from this workspace yet.";
}

export function UsageView(props: UsageViewProps) {
  const { balance, burn, rows, moreRows, paused, portal, error, billingHref } =
    props;
  const spend = spendVisibility(rows, moreRows);
  return (
    <section>
      <h1>Usage</h1>

      {error ? (
        <Banner
          title={error.title}
          data-testid="usage-action-error"
          role="alert"
        >
          <p className="muted">{error.detail}</p>
        </Banner>
      ) : null}

      <div className="panel" data-testid="balance">
        <h2 style={{ marginTop: 0 }}>Credit balance</h2>
        {balance.ok ? (
          <>
            <p className="balance-num" style={{ margin: "0.25rem 0" }}>
              <strong data-testid="balance-value">{balance.value}</strong>{" "}
              <span className="muted">credits</span>
            </p>
            <Note>Derived from your credit ledger as of {day(balance.asOf)}.</Note>
            {balance.value === 0 ? (
              // REQ-G03's "clear prompt" at zero.
              <p data-testid="topup-prompt">
                You have no credits. Buy a credit pack or start a plan on{" "}
                <a href={billingHref}>billing settings</a> to keep generating.
              </p>
            ) : null}
          </>
        ) : (
          <div data-testid="balance-error">
            <strong>{balance.title}</strong>
            <p className="muted">{balance.detail}</p>
          </div>
        )}
      </div>

      {paused ? (
        <div className="panel" data-testid="paused-notice">
          <h2 style={{ marginTop: 0 }}>Credits are frozen</h2>
          <p>
            This workspace is paused: credits are not spent, not granted, and
            their expiry clocks are suspended until you resume.
          </p>
          <p>
            {paused.resumesAt
              ? `Scheduled to resume on ${day(paused.resumesAt)}.`
              : "No resume date has been recorded yet — it appears once Stripe confirms the pause."}{" "}
            <a href={billingHref}>Resume in billing settings</a>.
          </p>
        </div>
      ) : null}

      <div className="panel" data-testid="burn-by-mode">
        <h2 style={{ marginTop: 0 }}>This month</h2>
        {/* R7/R8 (slice 2b): a SCOPED, UNCLAMPED query — never a sum over
            `rows` (that page is clamped; see the header note on this file).
            `ok: false` is a query failure, kept visibly distinct from a real
            answered zero so a transient read error cannot render as "you
            spent nothing" (absence is never a zero — the same rule
            `spendVisibility` exists for below, applied to a number that can
            now actually fail to load). */}
        {burn.ok ? (
          <p data-testid="burn-total">
            {burn.hasAnyDebit
              ? `${burn.totalDebit} credits spent this month`
              : "Nothing spent this month."}
          </p>
        ) : (
          <p className="muted" data-testid="burn-total-error">
            This month&apos;s total could not be loaded right now. Your credit
            history below is still accurate.
          </p>
        )}
        {/* SLOT (REQ-G07, receiver M3): a per-mode BREAKDOWN needs more than
            one mode to split by, and until generation exists there is only
            one thing that spends. Inventing a chart would be the
            invented-specifics failure — see `burnByModeNote`'s own doc for
            why this note no longer depends on whether anything was spent. */}
        <Note>{burnByModeNote()}</Note>
      </div>

      <div className="panel" data-testid="days-to-empty">
        <h2 style={{ marginTop: 0 }}>Days to empty</h2>
        <Note>{daysToEmptyNote(spend)}</Note>
      </div>

      <div className="panel" data-testid="ledger">
        <h2 style={{ marginTop: 0 }}>Credit history</h2>
        {rows.length === 0 ? (
          // A plain <p>, not <Note>: TypeScript does not check hyphenated JSX
          // attributes against a component's props, so `data-testid` on <Note>
          // would compile and silently never render.
          <p className="muted" data-testid="ledger-empty">
            No credit activity yet. Rows appear here when a subscription grants
            your monthly credits, when you buy a pack, and when credits are
            spent or expire.
          </p>
        ) : (
          <>
            <LedgerTable rows={rows} />
            {moreRows ? (
              <Note>
                Showing the most recent {rows.length} entries. Older entries are
                kept — paging through them arrives with the fuller usage view.
              </Note>
            ) : null}
          </>
        )}
      </div>

      <div className="panel" data-testid="invoices">
        <h2 style={{ marginTop: 0 }}>Invoices and payment method</h2>
        {/* SLOT (REQ-G07, receiver M2+/M6): an in-page invoice list adds no
            information the Customer Portal does not already show, and it needs
            live Stripe keys to be worth anything. The portal link IS the M1
            slice; the brain-as-asset panel that shares this page lands at M2. */}
        {portal.available ? (
          <form action={portal.action}>
            {/* Send a refusal back HERE rather than to the billing page the
                reader did not ask for. The action allowlists this value. */}
            <input type="hidden" name="from" value="/usage" />
            <button type="submit" className={buttonClass("primary")}>
              Open the Customer Portal
            </button>
            <Note>
              Invoices, receipts and your payment method live in Stripe&apos;s
              Customer Portal.
            </Note>
          </form>
        ) : (
          <div data-testid="portal-unavailable">
            {/* The reason is programmatically associated with the control it
                disables — same rule as billing's ActionButton (WCAG 3.3.2). */}
            <button
              type="button"
              disabled
              className={buttonClass("primary")}
              aria-describedby="portal-unavailable-reason"
            >
              Open the Customer Portal
            </button>
            <p className="muted" id="portal-unavailable-reason">
              {portal.reason}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

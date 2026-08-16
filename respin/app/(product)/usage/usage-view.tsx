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

export type UsageViewProps = {
  balance:
    | { ok: true; value: number; asOf: Date }
    | { ok: false; title: string; detail: string };
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

const section: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "1rem",
  marginBottom: "1rem",
};
const muted: React.CSSProperties = { color: "#555", fontSize: "0.9rem" };
const cell: React.CSSProperties = {
  borderBottom: "1px solid #eee",
  padding: "0.4rem 0.6rem",
  textAlign: "left",
};

/** ISO day. Deliberately not locale-formatted: the server and the browser must
 *  agree, and a test must be able to assert an exact string. */
export function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function Note({ children }: { children: ReactNode }) {
  return <p style={muted}>{children}</p>;
}

export function UsageView(props: UsageViewProps) {
  const { balance, rows, moreRows, paused, portal, error, billingHref } = props;
  return (
    <section>
      <h1>Usage</h1>

      {error ? (
        <div
          style={{ ...section, borderColor: "#c00", background: "#fff5f5" }}
          data-testid="usage-action-error"
          role="alert"
        >
          <strong>{error.title}</strong>
          <p style={muted}>{error.detail}</p>
        </div>
      ) : null}

      <div style={section} data-testid="balance">
        <h2 style={{ marginTop: 0 }}>Credit balance</h2>
        {balance.ok ? (
          <>
            <p style={{ fontSize: "2rem", margin: "0.25rem 0" }}>
              <strong data-testid="balance-value">{balance.value}</strong> credits
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
            <p style={muted}>{balance.detail}</p>
          </div>
        )}
      </div>

      {paused ? (
        <div style={section} data-testid="paused-notice">
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

      <div style={section} data-testid="burn-by-mode">
        <h2 style={{ marginTop: 0 }}>This month, by mode</h2>
        {/* SLOT (REQ-G07, receiver M3): burn-by-mode needs generations, and M1
            ships metering BEFORE generation deliberately. Until a debit exists
            there is nothing to break down, and inventing a chart would be the
            invented-specifics failure. */}
        <Note>
          Nothing has been spent yet: generation arrives in a later milestone
          (M3), and only a generation spends credits. This breakdown appears
          with the first one.
        </Note>
      </div>

      <div style={section} data-testid="days-to-empty">
        <h2 style={{ marginTop: 0 }}>Days to empty</h2>
        <Note>
          Not enough data. This needs a spending history to measure, and no
          credits have been spent from this workspace yet.
        </Note>
      </div>

      <div style={section} data-testid="ledger">
        <h2 style={{ marginTop: 0 }}>Credit history</h2>
        {rows.length === 0 ? (
          // A plain <p>, not <Note>: TypeScript does not check hyphenated JSX
          // attributes against a component's props, so `data-testid` on <Note>
          // would compile and silently never render.
          <p style={muted} data-testid="ledger-empty">
            No credit activity yet. Rows appear here when a subscription grants
            your monthly credits, when you buy a pack, and when credits are
            spent or expire.
          </p>
        ) : (
          <>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={cell}>Date</th>
                  <th style={cell}>What</th>
                  <th style={cell}>Credits</th>
                  <th style={cell}>Expires</th>
                  <th style={cell}>Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={cell}>{day(r.createdAt)}</td>
                    <td style={cell}>{r.kind}</td>
                    <td style={cell}>
                      {r.delta > 0 ? `+${r.delta}` : String(r.delta)}
                    </td>
                    <td style={cell}>{r.expiresAt ? day(r.expiresAt) : "—"}</td>
                    <td style={cell}>{r.ref ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {moreRows ? (
              <Note>
                Showing the most recent {rows.length} entries. Older entries are
                kept — paging through them arrives with the fuller usage view.
              </Note>
            ) : null}
          </>
        )}
      </div>

      <div style={section} data-testid="invoices">
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
            <button type="submit">Open the Customer Portal</button>
            <Note>
              Invoices, receipts and your payment method live in Stripe&apos;s
              Customer Portal.
            </Note>
          </form>
        ) : (
          <div data-testid="portal-unavailable">
            <button type="button" disabled>
              Open the Customer Portal
            </button>
            <Note>{portal.reason}</Note>
          </div>
        )}
      </div>
    </section>
  );
}

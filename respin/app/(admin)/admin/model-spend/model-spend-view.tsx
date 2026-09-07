// PURE presentation for /admin/model-spend (R14, slice 2b; renamed from
// /admin/margin in slice 2b-c — see docs/plans/respin-finish-phase-2b.md's
// route-rename requirement). Same split as usage-view.tsx and the same
// reason: the page component does the gate and the read, this file only
// renders what it is handed, so every state below is reachable from a test
// with a fixture instead of a database — INCLUDING R15's forbidden-word
// scan, which has to run against real rendered output, not against the page
// component nothing in this repo can execute without a session and a
// database (gate-completeness.test.ts's own header note).
//
// R15: THIS COMPONENT RENDERS NO GROSS-MARGIN FIGURE, and no computed
// percentage of any kind. Margin needs revenue, and the credit-to-dollar side
// of that does not exist yet — REQ-G05's full dashboard is slice 10b's. A
// cost number labelled "margin" is the claim this project has been burned by
// before (the rendered-copy honesty findings on `/onboarding`, R-36) — this
// component shows cost and says it is cost. The route itself is named for
// what it shows (slice 2b-c's R14 correction): "model spend", not "margin".
import type { ReactNode } from "react";
import type {
  SpendReconciliationClass,
  SpendReconciliationResult,
} from "@respin/db";

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  creator: "Creator",
  pro: "Pro",
  studio: "Studio",
  unmapped: "Unmapped",
};

/**
 * Integer micro-USD -> a dollars-and-cents string, in bigint arithmetic
 * throughout. Cost figures are exactly the value R6's atomicity test exists
 * to keep trustworthy; a float round-trip through `Number()` is not free
 * here, so the division and the remainder both stay bigint.
 */
export function usd(microUsd: bigint): string {
  const negative = microUsd < 0n;
  const abs = negative ? -microUsd : microUsd;
  const cents = abs / 10_000n;
  const dollars = cents / 100n;
  const remainderCents = cents % 100n;
  return `${negative ? "-" : ""}$${dollars}.${remainderCents.toString().padStart(2, "0")}`;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

export type AdminModelSpendViewProps =
  | { ok: true; result: SpendReconciliationResult }
  | { ok: false };

export function AdminModelSpendView(props: AdminModelSpendViewProps) {
  return (
    <section>
      <h1>Model spend</h1>
      <Note>
        What we paid the model provider, by month and tier — from{" "}
        <code>workspace_spend_monthly</code>, the record that outlives a
        workspace&apos;s own deletion. This is cost, not margin: margin also
        needs the revenue side, which arrives with the full dashboard.
      </Note>

      {!props.ok ? (
        <p data-testid="model-spend-error">
          Spend data could not be loaded right now.
        </p>
      ) : (
        <>
          <table data-testid="model-spend-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Tier</th>
                <th>Cost</th>
                <th>Calls</th>
                <th>Unpriced calls (excluded from cost)</th>
                <th>Reconciliation</th>
              </tr>
            </thead>
            <tbody>
              {props.result.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} data-testid="model-spend-empty">
                    No spend recorded yet.
                  </td>
                </tr>
              ) : (
                props.result.rows.map((r) => (
                  <tr key={`${r.workspaceId}-${r.periodMonth}-${r.tier}`}>
                    <td>{r.periodMonth.slice(0, 7)}</td>
                    <td>{TIER_LABEL[r.tier] ?? r.tier}</td>
                    <td>{usd(r.rollupCostMicroUsd)}</td>
                    <td>{r.rollupCallCount}</td>
                    <td data-testid="model-spend-unknown-count">
                      {r.rollupUnknownCallCount}
                    </td>
                    <td data-testid={`model-spend-class-${r.class}`}>{r.class}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Note>
            &quot;Unpriced calls&quot; (R4) is the count of this grain&apos;s
            calls whose cost is unknown — never charged as zero, so they are
            excluded from the cost column above rather than folded in. This
            count is retained on the rollup row itself and stays accurate
            even after the underlying call detail is deleted.
          </Note>

          <div className="panel" data-testid="model-spend-reconciliation-counts">
            <h2 style={{ marginTop: 0 }}>Reconciliation</h2>
            <p>
              Reconciled: {countOf(props.result, "reconciled")} · Orphaned
              (workspace deleted, rollup correctly outlived it):{" "}
              {countOf(props.result, "orphaned")} · Drift (the only class that
              is a defect): <strong>{countOf(props.result, "drift")}</strong>
            </p>
          </div>

          <div className="panel" data-testid="model-spend-unbilled">
            <h2 style={{ marginTop: 0 }}>Unbilled attempts</h2>
            {props.result.unbilledAttempts.length === 0 ? (
              <p>None found.</p>
            ) : (
              <>
                <p>
                  {props.result.unbilledAttempts.length} billable attempt(s)
                  with no matching credit debit — a report, not an automatic
                  charge. Confirm each individually before acting on it (a
                  legitimate free rebuild can appear here too — see the
                  reconciliation query&apos;s own note).
                </p>
                <ul>
                  {props.result.unbilledAttempts.map((a) => (
                    <li key={a.attemptId}>
                      {a.attemptId} — workspace {a.workspaceId} — {a.purpose}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function countOf(
  result: SpendReconciliationResult,
  cls: SpendReconciliationClass
): number {
  return result.counts[cls];
}

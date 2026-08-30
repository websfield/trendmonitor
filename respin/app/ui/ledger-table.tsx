// LedgerTable (DESIGN.md): mono numerics, right-aligned deltas, positive
// values in accent. History, not arithmetic — nothing here sums anything
// (non-negotiable 2: the ledger IS the balance, derived elsewhere).
export type LedgerTableRow = {
  id: string;
  createdAt: Date;
  kind: string;
  delta: number;
  expiresAt: Date | null;
  ref: string | null;
};

/** ISO day. Deliberately not locale-formatted: the server and the browser must
 *  agree, and a test must be able to assert an exact string. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function LedgerTable({ rows }: { rows: LedgerTableRow[] }) {
  return (
    <table className="ledger-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>What</th>
          <th>Credits</th>
          <th>Expires</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="num">{isoDay(r.createdAt)}</td>
            <td>{r.kind}</td>
            <td className="num num-delta">
              {r.delta > 0 ? (
                <span className="delta-pos">{`+${r.delta}`}</span>
              ) : (
                String(r.delta)
              )}
            </td>
            <td className="num">{r.expiresAt ? isoDay(r.expiresAt) : "—"}</td>
            <td className="num">{r.ref ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

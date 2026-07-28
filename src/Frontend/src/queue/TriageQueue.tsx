// P9-T2 — triage queue (REQ-019). Compliance risks first, then borderline, then
// clear passes. Each row states WHY it sits where it does. It presents NO way to
// approve from the queue — a manager must open a submission to act. There is no
// bulk-approve, no "approve all", no select-all checkbox, no row-level approve.
import type { TriageItem, TriageBand, QueueEmptyReason } from '../types/view';
import { EmptyState } from '../components/EmptyState';

const BAND_ORDER: TriageBand[] = ['compliance_risk', 'borderline', 'clear_pass'];

const BAND_META: Record<TriageBand, { label: string; symbol: string }> = {
  compliance_risk: { label: 'Compliance risk', symbol: '⛔' },
  borderline: { label: 'Borderline', symbol: '~' },
  clear_pass: { label: 'Clear pass', symbol: '✓' },
};

function sortByTriage(items: TriageItem[]): TriageItem[] {
  return [...items].sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band));
}

export function TriageQueue({
  items,
  emptyReason,
  onOpen,
}: {
  items: TriageItem[];
  emptyReason: QueueEmptyReason | null;
  onOpen: (submissionId: string) => void;
}): JSX.Element {
  if (items.length === 0) {
    // Empty is not blank: "no submissions" must differ from "all filtered out".
    if (emptyReason === 'all_filtered_out') {
      return (
        <EmptyState
          kind="empty"
          testId="queue-empty-filtered"
          reason="All submissions are filtered out by the current view."
          detail="Clear the filters to see them. This is not the same as an empty inbox."
        />
      );
    }
    return (
      <EmptyState
        kind="empty"
        testId="queue-empty-none"
        reason="No submissions are waiting for review."
        detail="When creators submit, the highest-risk items will appear at the top of this list."
      />
    );
  }

  const sorted = sortByTriage(items);
  return (
    <section aria-labelledby="queue-heading">
      <h2 id="queue-heading">Review queue — hardest decisions first</h2>
      <p className="queue__intro">
        Sorted by triage priority so the human step stays real. Open each submission to review its evidence and
        act. There is no bulk action here by design.
      </p>
      <table className="queue">
        <caption className="visually-hidden">
          Submissions ordered by triage priority: compliance risks first, then borderline verdicts, then clear
          passes.
        </caption>
        <thead>
          <tr>
            <th scope="col">Priority</th>
            <th scope="col">Creator</th>
            <th scope="col">Verdict</th>
            <th scope="col">Why it needs attention</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const meta = BAND_META[item.band];
            return (
              <tr key={item.submission_id} data-band={item.band} data-testid={`queue-row-${item.submission_id}`}>
                <td>
                  <span className={`band-chip band-chip--${item.band}`}>
                    <span aria-hidden="true">{meta.symbol} </span>
                    {meta.label}
                  </span>
                </td>
                <td>{item.creator_handle}</td>
                <td>
                  <span data-testid={`queue-verdict-${item.submission_id}`}>{item.verdict}</span>
                </td>
                <td>
                  {/* The suspected-veto flag lives INSIDE the reason element: the
                      "why it needs attention" cell must carry both the deterministic
                      risk reason and the model-raised flag as one readable unit. */}
                  <span data-testid={`queue-reason-${item.submission_id}`}>
                    {item.risk_reason}
                    {item.suspected_vetoes.length > 0 ? (
                      <span className="queue__suspected">
                        {' '}
                        Model-raised suspicion (not acted on): {item.suspected_vetoes.join(', ')}.
                      </span>
                    ) : null}
                  </span>
                </td>
                <td>
                  {/* The ONLY action from the queue is to open. Approval happens
                      in the verdict panel, on an explicit button, per submission. */}
                  <button type="button" onClick={() => onOpen(item.submission_id)}>
                    Open<span className="visually-hidden"> submission from {item.creator_handle}</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

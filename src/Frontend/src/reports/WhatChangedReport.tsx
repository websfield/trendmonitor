// P9-T10 — quarterly "what changed" report (REQ-070).
// DERIVED BY READING C4 (the knowledge API response), not assembled independently.
// It invents no number: everything here is a warrant transition or a coverage
// object that came straight off a C4 response. There is no VPS, no accuracy, no
// effect size — those are not C4's to give.
import type { WhatChangedReport as Report, Coverage } from '../types/view';

export function WhatChangedReport({
  report,
  unreachable,
}: {
  report: Report | null;
  unreachable: boolean;
}): JSX.Element {
  if (unreachable || !report) {
    return (
      <section aria-labelledby="wc-heading">
        <h2 id="wc-heading">What changed</h2>
        <div className="empty-state empty-state--unreachable" role="alert" data-testid="whatchanged-unreachable">
          <p>
            <span aria-hidden="true">⚠ </span>This report is derived by reading the knowledge API (C4), which is
            unreachable. We will not assemble it from any other source, because that would risk inventing a
            change C4 never reported.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="wc-heading" data-testid="whatchanged">
      <h2 id="wc-heading">
        What changed — {report.from_library_version} → {report.to_library_version}
      </h2>
      <p className="wc-provenance" role="note">
        <span aria-hidden="true">ⓘ </span>
        Derived entirely by reading C4 at both library versions. No number here is invented; each row is a
        warrant transition or a coverage field returned by the knowledge API.
      </p>

      <h3>Newly served mechanisms</h3>
      {report.newly_served.length === 0 ? (
        <p>None newly served this cycle.</p>
      ) : (
        <ul data-testid="wc-newly-served">
          {report.newly_served.map((m) => (
            <li key={m.mechanism_id}>
              <span className={`warrant-chip warrant-chip--${m.warrant}`}>{m.warrant}</span>{' '}
              <q>{m.statement_excerpt}</q>
            </li>
          ))}
        </ul>
      )}

      <h3>Falsified (withdrawn from active service)</h3>
      {report.falsified.length === 0 ? (
        <p>None falsified this cycle.</p>
      ) : (
        <ul data-testid="wc-falsified">
          {report.falsified.map((m) => (
            <li key={m.mechanism_id}>
              <q>{m.statement_excerpt}</q>
            </li>
          ))}
        </ul>
      )}

      <h3>Promoted</h3>
      {report.promoted.length === 0 ? (
        <p>No promotions this cycle.</p>
      ) : (
        <ul data-testid="wc-promoted">
          {report.promoted.map((m) => (
            <li key={m.mechanism_id}>
              {m.from_warrant} → {m.to_warrant}
            </li>
          ))}
        </ul>
      )}

      <h3>Coverage</h3>
      <div className="wc-coverage">
        <CoverageLine label="Before" coverage={report.coverage_before} />
        <CoverageLine label="After" coverage={report.coverage_after} />
      </div>
    </section>
  );
}

function CoverageLine({ label, coverage }: { label: string; coverage: Coverage }): JSX.Element {
  return (
    <p>
      <strong>{label}:</strong> {coverage.state} · {coverage.library_version} · corpus refreshed{' '}
      <time dateTime={coverage.corpus_last_refreshed}>{coverage.corpus_last_refreshed}</time>
    </p>
  );
}

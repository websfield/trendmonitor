// P9-T6 — knowledge panel (C4). Renders statement, falsifier, warrant, the
// `Proxy-selected, Measured-evaluated` provenance, and `never_tested_against`.
// It renders NO number a breaker governs: no VPS, no 0-100 field, no effect size.
// prevalence_ratio IS shown, but only wrapped in its warrant + never_tested_against
// + provenance label, and never as a bare magnitude or a "lift".
//
// Unreachable (C4 down) is visually DISTINCT from empty-because-below-the-bar.
import type { KnowledgeResponse, Coverage } from '../types/view';
import type { Mechanism } from '../types/generated/mechanisms';
import { EmptyState } from '../components/EmptyState';

export function KnowledgePanel({ response }: { response: KnowledgeResponse }): JSX.Element {
  if (response.status === 'unreachable') {
    // UNKNOWN, not empty. Distinct icon (alert), distinct text, distinct testid.
    return (
      <section aria-labelledby="knowledge-heading">
        <h2 id="knowledge-heading">Knowledge — why content works</h2>
        <EmptyState
          kind="unreachable"
          testId="knowledge-unreachable"
          reason="The knowledge service (C4) could not be reached, so we cannot say what is or is not known here."
          detail={`This is UNKNOWN, not empty. ${response.last_error}${
            response.retry_after_hint ? ' ' + response.retry_after_hint : ''
          }`}
        />
      </section>
    );
  }

  const { mechanisms, coverage } = response;
  return (
    <section aria-labelledby="knowledge-heading">
      <h2 id="knowledge-heading">Knowledge — why content works</h2>
      <CoverageNote coverage={coverage} />
      {mechanisms.length === 0 ? (
        <EmptyState
          kind="empty"
          testId="knowledge-empty"
          reason={emptyReasonForCoverage(coverage)}
          detail={
            coverage.blocking
              ? `Blocking: ${coverage.blocking}. This is served-and-empty (below the bar), not unreachable.`
              : 'This is served-and-empty (below the bar), not unreachable.'
          }
        />
      ) : (
        <ul className="mechanism-list" data-testid="mechanism-list">
          {mechanisms.map((m) => (
            <MechanismCard key={m.id} m={m} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CoverageNote({ coverage }: { coverage: Coverage }): JSX.Element {
  return (
    <p className="coverage-note" data-testid="coverage-note" data-coverage-state={coverage.state} role="status">
      Coverage: <strong>{coverage.state}</strong> · library {coverage.library_version} · corpus last refreshed{' '}
      <time dateTime={coverage.corpus_last_refreshed}>{coverage.corpus_last_refreshed}</time>
      {coverage.state === 'corpus_stale' ? ' — mechanisms are still served, but the corpus is stale.' : ''}
    </p>
  );
}

function emptyReasonForCoverage(coverage: Coverage): string {
  switch (coverage.state) {
    case 'no_library':
      return 'No mechanism library exists for this cohort yet. Absence of a library is not absence of a cohort.';
    case 'below_warrant_bar':
      return 'Candidates exist but none has cleared the recurrent warrant bar yet.';
    case 'corpus_stale':
      return 'The corpus is stale and no mechanism currently clears the bar.';
    default:
      return 'No mechanisms are being served for this cohort.';
  }
}

function MechanismCard({ m }: { m: Mechanism }): JSX.Element {
  return (
    <li className="mechanism-card" data-testid={`mechanism-${m.id}`}>
      {/* The statement — prose, the WHY. No number. */}
      <p className="mechanism-statement">{m.statement}</p>

      <dl className="mechanism-meta">
        <dt>Warrant</dt>
        <dd data-testid={`warrant-${m.id}`}>
          <span className={`warrant-chip warrant-chip--${m.warrant}`}>{m.warrant}</span>
        </dd>

        <dt>Falsifier</dt>
        <dd data-testid={`falsifier-${m.id}`}>{m.falsifier}</dd>

        <dt>Provenance</dt>
        <dd data-testid={`provenance-${m.id}`}>{m.provenance.label}</dd>

        <dt>Never tested against</dt>
        <dd data-testid={`nta-${m.id}`}>{m.never_tested_against}</dd>

        {/* prevalence_ratio: shown ONLY inside its wrapper, never as a bare lift.
            It is a descriptive asymmetry on a proxy-selected sample — not a VPS,
            not an effect size, not a multiplier. We render it with an explicit
            caveat and never with the words causes/lifts/drives/predicts. */}
        <dt>Prevalence asymmetry (descriptive, proxy-selected)</dt>
        <dd data-testid={`prevalence-${m.id}`}>
          <span className="prevalence-caveat">
            A ratio of two deterministic counts over a proxy-selected set. It is descriptive only — not a
            multiplier, not a measure of impact, and it does not forecast any score.
          </span>{' '}
          prevalence in top decile {m.evidence.prevalence_in_top_decile} vs contrast set{' '}
          {m.evidence.prevalence_in_contrast_set}; ratio {m.evidence.prevalence_ratio} (
          {m.provenance.label}).
        </dd>
      </dl>

      <p className="mechanism-ratification">
        Ratified by a human at <time dateTime={m.ratified_at}>{m.ratified_at}</time>:{' '}
        <q>{m.ratification_note}</q>
      </p>
    </li>
  );
}

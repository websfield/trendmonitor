// P9-T3 — verdict panel.
// - Vetoes shown WITH the deterministic evidence they fired on.
// - suspected_veto[] labelled MODEL-RAISED and visibly NOT acted on.
// - VPS is rendered ONLY when the breaker is armed (direct read of state).
// - Approve is ONE real focusable <button> requiring an explicit click/Enter ON
//   that button. There is NO global keypress that approves. There is NO bulk approve.
// - Override requires a typed reason; emits VerdictOverridden via the client.
import { useState } from 'react';
import type { SubmissionDetail, VpsCriterionView } from '../types/view';
import { mayRenderGovernedNumber } from '../lib/breaker';
import { ProvenancedNumber } from '../components/Provenance';
import { DegradedBanner, AdvisoryBanner } from '../banners/Banners';

const OVERRIDE_TARGETS = ['APPROVED', 'APPROVED_WITH_NOTES', 'REVISIONS_REQUIRED', 'REJECTED'] as const;

export function VerdictPanel({
  detail,
  apiDown,
  onApprove,
  onOverride,
}: {
  detail: SubmissionDetail;
  /** When C2 is down, no verdict may be submitted. Approve/override disabled. */
  apiDown: boolean;
  onApprove: (submissionId: string) => void;
  /**
   * Records the override and resolves true ONLY when the server confirmed it
   * (the round-trip succeeded). Resolves false when C2 was unreachable, so the
   * panel never announces a success the backend did not record.
   */
  onOverride: (submissionId: string, target: string, reason: string) => Promise<boolean>;
}): JSX.Element {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<string>(OVERRIDE_TARGETS[0]);
  const [reason, setReason] = useState('');
  // Set only on a successful override submit (never at mount) so the role="status"
  // confirmation announces once, mirroring the Approve path's approved-stamp.
  const [overrideRecordedTo, setOverrideRecordedTo] = useState<string | null>(null);

  const armed = mayRenderGovernedNumber(detail.breaker_state);
  const degradedCriteria = detail.criteria.filter((c) => c.degraded).map((c) => c.key);
  const approved = detail.human_approved_at != null;

  const reasonValid = reason.trim().length > 0;
  // Why the override submit is disabled — surfaced to AT via aria-describedby.
  const overrideDisabledReason = apiDown
    ? 'The review service is unreachable, so no verdict can be recorded.'
    : !reasonValid
      ? 'Enter a reason before recording the override.'
      : null;

  return (
    <section aria-labelledby="verdict-heading" className="verdict-panel">
      <h2 id="verdict-heading">
        Review: {detail.creator_handle}{' '}
        <span className="verdict-panel__verdict" data-testid="current-verdict">
          ({detail.verdict})
        </span>
      </h2>

      <AdvisoryBanner state={detail.breaker_state} />
      <DegradedBanner audioPresent={detail.audio_present} degradedCriteria={degradedCriteria} />

      {/* ---- Vetoes actually fired, with evidence ---- */}
      <h3>Vetoes fired</h3>
      {detail.vetoes.length === 0 ? (
        <p data-testid="no-vetoes">No deterministic veto fired on this submission.</p>
      ) : (
        <ul className="veto-list">
          {detail.vetoes.map((v) => (
            <li key={v.veto_id} data-testid={`veto-${v.veto_id}`}>
              <strong>
                {v.veto_id} — {v.name}
              </strong>
              <div className="veto-evidence">
                <span className="veto-evidence__label">Evidence: </span>
                {v.evidence}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---- Model-raised suspicions: clearly NOT acted on ---- */}
      <h3 id="suspected-heading">Model-raised suspicions</h3>
      {detail.suspected_vetoes.length === 0 ? (
        <p>None raised by the model.</p>
      ) : (
        <>
          <p id="suspected-caveat" className="suspected-caveat" role="note">
            <span aria-hidden="true">ⓘ </span>
            These were raised by the model and are shown for a human to consider. They were{' '}
            <strong>NOT acted on</strong> and are <strong>not</strong> an input to the deterministic verdict.
          </p>
          <ul className="suspected-list" aria-describedby="suspected-caveat" data-testid="suspected-list">
            {detail.suspected_vetoes.map((s) => (
            <li key={s.veto_id} data-testid={`suspected-${s.veto_id}`}>
              <span className="suspected-badge">Model-raised · not acted on</span>{' '}
              <strong>
                {s.veto_id} — {s.name}
              </strong>
                <div className="suspected-note">{s.model_note}</div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ---- Scores: VPS only when armed ---- */}
      <h3>Scores</h3>
      {armed && detail.vps ? (
        <p data-testid="vps-value">
          <ProvenancedNumber datum={detail.vps} label="VPS (Viral Potential Score)" />
        </p>
      ) : (
        <p data-testid="vps-withheld" className="score-withheld">
          <span aria-hidden="true">— </span>VPS is not shown: the calibration breaker is not armed for this cohort
          (state: {detail.breaker_state}). See the advisory above.
        </p>
      )}
      {detail.bas ? (
        <p data-testid="bas-value">
          <ProvenancedNumber datum={detail.bas} label="BAS (Brief Adherence Score)" />
        </p>
      ) : null}

      {/* ---- Evidence: criteria + the patterns each score anchored on ---- */}
      <h3>Evidence the score was anchored on</h3>
      <CriteriaTable criteria={detail.criteria} showScores={armed} />
      <p className="retrieved-patterns" data-testid="retrieved-patterns">
        Retrieved patterns: {detail.retrieved_pattern_ids.join(', ') || 'none'}
      </p>

      {/* ---- Actions: single-click approve; override with reason ---- */}
      <h3>Decision</h3>
      {approved ? (
        <p data-testid="approved-stamp" role="status">
          Approved by a human at <time dateTime={detail.human_approved_at!}>{detail.human_approved_at}</time>.
        </p>
      ) : (
        <div className="verdict-actions">
          {/* A single real button. No pre-checked box, no shortcut. */}
          <button
            type="button"
            className="btn-approve btn-primary"
            data-testid="approve-button"
            disabled={apiDown}
            onClick={() => onApprove(detail.submission_id)}
          >
            Approve this submission
          </button>
          <button
            type="button"
            className="btn-override-toggle"
            data-testid="override-toggle"
            aria-expanded={overrideOpen}
            aria-controls="override-form"
            onClick={() => setOverrideOpen((o) => !o)}
          >
            Override verdict…
          </button>
          {apiDown ? (
            <p role="alert" data-testid="actions-disabled-note" className="actions-disabled-note">
              The review service is unreachable. No verdict can be submitted right now.
            </p>
          ) : null}
        </div>
      )}

      {overrideOpen && !approved ? (
        <form
          id="override-form"
          className="override-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reasonValid || apiDown) return;
            const recorded = await onOverride(detail.submission_id, overrideTarget, reason.trim());
            // Announce + reset ONLY on server-confirmed success — mirrors how the
            // Approve path shows approved-stamp from real state, never optimistically.
            if (recorded) {
              setOverrideRecordedTo(overrideTarget);
              setOverrideOpen(false);
              setReason('');
            }
          }}
        >
          <div className="field">
            <label htmlFor="override-target">Override to</label>
            <select
              id="override-target"
              value={overrideTarget}
              onChange={(e) => setOverrideTarget(e.target.value)}
            >
              {OVERRIDE_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="override-reason">Reason (required — recorded on VerdictOverridden)</label>
            <textarea
              id="override-reason"
              data-testid="override-reason"
              value={reason}
              required
              aria-required="true"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            data-testid="override-submit"
            disabled={!reasonValid || apiDown}
            aria-describedby={overrideDisabledReason ? 'override-submit-hint' : undefined}
          >
            Record override
          </button>
          {overrideDisabledReason ? (
            <span id="override-submit-hint" className="visually-hidden">
              {overrideDisabledReason}
            </span>
          ) : null}
        </form>
      ) : null}

      {overrideRecordedTo ? (
        <p data-testid="override-recorded" role="status" className="override-recorded">
          Override recorded to <strong>{overrideRecordedTo}</strong>. The reason was recorded on
          VerdictOverridden.
        </p>
      ) : null}
    </section>
  );
}

function CriteriaTable({
  criteria,
  showScores,
}: {
  criteria: VpsCriterionView[];
  showScores: boolean;
}): JSX.Element {
  return (
    <table className="criteria">
      <caption className="visually-hidden">Per-criterion evidence.</caption>
      <thead>
        <tr>
          <th scope="col">Criterion</th>
          <th scope="col">Score</th>
          <th scope="col">Audio</th>
          <th scope="col">Evidence</th>
        </tr>
      </thead>
      <tbody>
        {criteria.map((c) => (
          <tr key={c.key} data-testid={`criterion-${c.key}`} data-degraded={c.degraded}>
            <th scope="row">{c.key}</th>
            <td>
              {/* A per-criterion number is a VPS input the breaker governs:
                  it is only shown when armed. When not armed we show a dash. */}
              {showScores ? (
                <span>{c.score}</span>
              ) : (
                <span aria-label="withheld — breaker not armed">—</span>
              )}
            </td>
            <td>
              {c.audio_dependent ? (
                c.degraded ? (
                  <span className="degraded-tag" data-testid={`degraded-${c.key}`}>
                    <span aria-hidden="true">⚠ </span>frames-only
                  </span>
                ) : (
                  <span>audio present</span>
                )
              ) : (
                <span>n/a</span>
              )}
            </td>
            <td>{c.evidence ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// P9-T5 — amplification + sign-off (REQ-037, REQ-039).
// - Ranking with rationale and arm tags; ε shown WITH why it exists.
// - AWS numbers only when armed AND confidence sufficient (insufficient_baseline /
//   overlapping bands force a numberless render even on an armed breaker).
// - blocked_rights candidates are shown with the NAMED missing grant.
// - The naive-baseline counterfactual is always shown.
// - No client artefact is produced without a named sign-off.
import { useState } from 'react';
import type { AmplificationArtefact, RankedCandidate } from '../types/view';
import { mayRenderGovernedNumber } from '../lib/breaker';
import { AdvisoryBanner } from '../banners/Banners';
import { ProvenancedNumber } from '../components/Provenance';

export function AmplificationPanel({
  artefact,
  apiDown,
  onSignOff,
}: {
  artefact: AmplificationArtefact;
  apiDown: boolean;
  onSignOff: (campaignId: string, reviewerName: string, modifications: string[]) => void;
}): JSX.Element {
  const armed = mayRenderGovernedNumber(artefact.breaker_state);

  return (
    <section aria-labelledby="amp-heading" className="amplification">
      <h2 id="amp-heading">Amplification recommendation — {artefact.campaign_id}</h2>

      <AdvisoryBanner state={artefact.breaker_state} />

      <h3>Exploration budget</h3>
      <p data-testid="epsilon">
        ε = {artefact.epsilon}. <span className="epsilon-why">{artefact.epsilon_rationale}</span>
      </p>

      <h3>Ranking</h3>
      <table className="ranking">
        <caption className="visually-hidden">
          Ranked amplification candidates with rationale, arm tag, and AWS where confidence allows.
        </caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Creator</th>
            <th scope="col">Arm</th>
            <th scope="col">AWS</th>
            <th scope="col">Rationale</th>
          </tr>
        </thead>
        <tbody>
          {artefact.ranked.map((c) => (
            <RankRow key={c.live_post_id} c={c} armed={armed} />
          ))}
        </tbody>
      </table>

      {/* ---- Blocked candidates: named missing grant ---- */}
      <h3>Blocked candidates</h3>
      {artefact.blocked.length === 0 ? (
        <p>No candidate is blocked on rights, disclosure, or brand safety.</p>
      ) : (
        <ul className="blocked-list" data-testid="blocked-list">
          {artefact.blocked.map((b) => (
            <li key={b.live_post_id} data-testid={`blocked-${b.live_post_id}`} data-reason={b.reason_code}>
              <span className="blocked-badge">
                <span aria-hidden="true">⛔ </span>
                {b.reason_code}
              </span>{' '}
              <strong>{b.creator_handle}</strong> — missing grant:{' '}
              <span className="missing-grant" data-testid={`missing-grant-${b.live_post_id}`}>
                {b.missing_grant}
              </span>
              <div className="blocked-detail">{b.detail}</div>
            </li>
          ))}
        </ul>
      )}

      {/* ---- Counterfactual: always shown ---- */}
      <h3>Naive-baseline counterfactual</h3>
      <div className="counterfactual" data-testid="counterfactual">
        <p>
          The naive baseline (&ldquo;boost the highest raw 24h engagement post&rdquo;) would have picked{' '}
          <strong>{artefact.counterfactual.naive_pick_handle}</strong>.
        </p>
        <p>{artefact.counterfactual.differs_summary}</p>
      </div>

      {/* ---- Budget ---- */}
      <h3>Budget</h3>
      <p data-testid="budget">
        <ProvenancedNumber datum={artefact.budget_total} label="Total budget" unit="$" />
      </p>

      {/* ---- Sign-off gate ---- */}
      <SignOffGate artefact={artefact} apiDown={apiDown} onSignOff={onSignOff} />
    </section>
  );
}

function RankRow({ c, armed }: { c: RankedCandidate; armed: boolean }): JSX.Element {
  // A number renders only when armed AND confidence is sufficient AND aws exists.
  const showNumber = armed && !c.low_confidence && c.aws != null;
  return (
    <tr data-testid={`rank-${c.rank}`} data-arm={c.arm} data-low-confidence={c.low_confidence}>
      <td>
        {c.rank}
        {c.band_overlaps ? (
          <span className="tie-note" data-testid={`tie-${c.rank}`}>
            {' '}
            <span aria-hidden="true">≈ </span>tied with rank {c.overlaps_with_ranks.join(', ')}
          </span>
        ) : null}
      </td>
      <td>{c.creator_handle}</td>
      <td>
        <span className={`arm-tag arm-tag--${c.arm}`}>{c.arm}</span>
      </td>
      <td>
        {showNumber && c.aws ? (
          <ProvenancedNumber datum={c.aws} label="AWS" />
        ) : (
          <span data-testid={`aws-withheld-${c.rank}`} className="score-withheld">
            <span aria-hidden="true">— </span>
            {!armed
              ? 'not shown (breaker not armed)'
              : `not shown (${c.low_confidence_reason ?? 'low confidence / overlapping bands'})`}
          </span>
        )}
      </td>
      <td>{c.rationale}</td>
    </tr>
  );
}

function SignOffGate({
  artefact,
  apiDown,
  onSignOff,
}: {
  artefact: AmplificationArtefact;
  apiDown: boolean;
  onSignOff: (campaignId: string, reviewerName: string, modifications: string[]) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [mods, setMods] = useState('');

  if (artefact.signoff) {
    const s = artefact.signoff;
    return (
      <div className="signoff signoff--done" data-testid="signoff-done" role="status">
        <h3>Signed off</h3>
        <p>
          Signed off by <strong>{s.reviewer_name}</strong> at{' '}
          <time dateTime={s.signed_off_at}>{s.signed_off_at}</time>.
        </p>
        <p>
          Modifications recorded:{' '}
          {s.modifications.length ? s.modifications.join('; ') : 'none'}
        </p>
      </div>
    );
  }

  const canSubmit = name.trim().length > 0 && !apiDown;
  // Why sign-off is disabled — surfaced to AT via aria-describedby.
  const signoffDisabledReason = apiDown
    ? 'The service is unreachable, so sign-off cannot be recorded.'
    : name.trim().length === 0
      ? 'Enter the reviewer name before signing off.'
      : null;
  return (
    <div className="signoff signoff--pending" data-testid="signoff-pending">
      <h3>Sign-off required</h3>
      <p role="status">
        <span aria-hidden="true">⚠ </span>
        This recommendation has <strong>not</strong> been signed off. Nothing reaches the client until a named
        reviewer signs off, with a timestamp and any modifications recorded (REQ-037).
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          const modList = mods
            .split('\n')
            .map((m) => m.trim())
            .filter(Boolean);
          onSignOff(artefact.campaign_id, name.trim(), modList);
        }}
      >
        <div className="field">
          <label htmlFor="signoff-name">Reviewer name (required)</label>
          <input
            id="signoff-name"
            data-testid="signoff-name"
            value={name}
            required
            aria-required="true"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="signoff-mods">Modifications (one per line, optional)</label>
          <textarea id="signoff-mods" value={mods} onChange={(e) => setMods(e.target.value)} />
        </div>
        <button
          type="submit"
          className="btn-primary"
          data-testid="signoff-submit"
          disabled={!canSubmit}
          aria-describedby={signoffDisabledReason ? 'signoff-submit-hint' : undefined}
        >
          Sign off and release to client
        </button>
        {signoffDisabledReason ? (
          <span id="signoff-submit-hint" className="visually-hidden">
            {signoffDisabledReason}
          </span>
        ) : null}
        {apiDown ? (
          <p role="alert" className="actions-disabled-note">
            The service is unreachable — sign-off cannot be recorded.
          </p>
        ) : null}
      </form>
    </div>
  );
}

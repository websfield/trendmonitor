import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AmplificationPanel } from './AmplificationPanel';
import { amplificationArmed } from '../api/fixtures';

describe('AmplificationPanel', () => {
  it('A7: blocked_rights candidate shows the NAMED missing grant', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    const blocked = screen.getByTestId('blocked-lp-blocked-1');
    expect(blocked).toHaveAttribute('data-reason', 'blocked_rights');
    expect(screen.getByTestId('missing-grant-lp-blocked-1')).toHaveTextContent('paid_amplification');
  });

  it('A8: the naive-baseline counterfactual is displayed', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    const cf = screen.getByTestId('counterfactual');
    expect(cf).toHaveTextContent(/naive baseline/i);
    expect(cf).toHaveTextContent('@peak.performer');
  });

  it('A2b: AWS is numberless on low confidence (insufficient_baseline) even when armed', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    // rank 3 is insufficient_baseline -> no number
    expect(screen.getByTestId('aws-withheld-3')).toBeInTheDocument();
    expect(screen.getByTestId('rank-3')).toHaveAttribute('data-low-confidence', 'true');
  });

  it('Ranking_OverlapShownAsTie: overlapping bands render as a tie, not a false order', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    expect(screen.getByTestId('tie-1')).toHaveTextContent(/tied with rank 4/i);
    expect(screen.getByTestId('tie-4')).toHaveTextContent(/tied with rank 1/i);
  });

  it('A5: AWS numbers carry Estimated provenance + as_of', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    const rank1 = screen.getByTestId('rank-1');
    expect(rank1).toHaveTextContent('Estimated');
    expect(rank1).toHaveTextContent('2026-07-11');
  });

  it('shows epsilon WITH why it exists', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    const eps = screen.getByTestId('epsilon');
    expect(eps).toHaveTextContent('0.18');
    expect(eps).toHaveTextContent(/never 0|floor/i);
  });

  it('A9: no client artefact ships without sign-off; the gate is shown as pending', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    expect(screen.getByTestId('signoff-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('signoff-done')).toBeNull();
  });

  it('A9: sign-off requires a named reviewer before it can be submitted', async () => {
    const onSignOff = vi.fn();
    const user = userEvent.setup();
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={onSignOff} />);
    expect(screen.getByTestId('signoff-submit')).toBeDisabled();
    await user.type(screen.getByTestId('signoff-name'), 'Dana Reviewer');
    expect(screen.getByTestId('signoff-submit')).toBeEnabled();
    await user.click(screen.getByTestId('signoff-submit'));
    expect(onSignOff).toHaveBeenCalledWith('camp-summer-glow', 'Dana Reviewer', []);
  });

  it('R5-T5: disabled sign-off submit is described by an explanation', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={vi.fn()} />);
    const submit = screen.getByTestId('signoff-submit');
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-describedby', 'signoff-submit-hint');
    expect(document.getElementById('signoff-submit-hint')).toHaveTextContent(/reviewer name/i);
  });

  it('when the breaker is not armed, no AWS number renders for any rank', () => {
    const notArmed = { ...amplificationArmed, breaker_state: 'tripped' as const };
    render(<AmplificationPanel artefact={notArmed} apiDown={false} onSignOff={vi.fn()} />);
    expect(screen.getByTestId('aws-withheld-1')).toBeInTheDocument();
    // The AWS value 86 must not appear.
    expect(screen.queryByText(/\b86\b/)).toBeNull();
  });
});

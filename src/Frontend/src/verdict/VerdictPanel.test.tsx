import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VerdictPanel } from './VerdictPanel';
import { submissionArmed, submissionTrippedDegraded } from '../api/fixtures';

describe('VerdictPanel', () => {
  it('A4: labels suspected_veto[] as model-raised and NOT acted on', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={vi.fn()} onOverride={vi.fn()} />);
    const item = screen.getByTestId('suspected-V2');
    expect(item).toHaveTextContent(/model-raised/i);
    expect(item).toHaveTextContent(/not acted on/i);
    // The caveat is present and machine-linked.
    expect(screen.getByRole('note')).toHaveTextContent(/NOT acted on/i);
  });

  it('Ui_NoNumberWhenNotArmed: VPS is rendered when armed', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={vi.fn()} onOverride={vi.fn()} />);
    expect(screen.getByTestId('vps-value')).toHaveTextContent('74');
    expect(screen.queryByTestId('vps-withheld')).toBeNull();
  });

  it('Ui_NoNumberWhenNotArmed: no VPS number when breaker tripped', () => {
    render(
      <VerdictPanel detail={submissionTrippedDegraded} apiDown={false} onApprove={vi.fn()} onOverride={vi.fn()} />,
    );
    expect(screen.queryByTestId('vps-value')).toBeNull();
    expect(screen.getByTestId('vps-withheld')).toBeInTheDocument();
    // The stored VPS value (41) must not appear anywhere.
    expect(screen.queryByText(/\b41\b/)).toBeNull();
  });

  it('Ui_NoNumberWhenNotArmed: per-criterion scores are withheld when not armed', () => {
    render(
      <VerdictPanel detail={submissionTrippedDegraded} apiDown={false} onApprove={vi.fn()} onOverride={vi.fn()} />,
    );
    // criterion scores like 44 / 60 must not render as numbers when not armed
    expect(screen.queryByText(/\b44\b/)).toBeNull();
    expect(screen.queryByText(/\b60\b/)).toBeNull();
  });

  it('A5: VPS carries an Estimated provenance label and as_of', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={vi.fn()} onOverride={vi.fn()} />);
    const vps = screen.getByTestId('vps-value');
    expect(vps).toHaveTextContent('Estimated');
    expect(vps).toHaveTextContent(/as of 2026-07-11/);
  });

  it('single-click approve fires exactly once and only from the button', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={onApprove} onOverride={vi.fn()} />);
    await user.click(screen.getByTestId('approve-button'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith(submissionArmed.submission_id);
  });

  it('NoKeyboardApprove: focusing the panel and pressing Enter does NOT approve', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={onApprove} onOverride={vi.fn()} />);
    // Focus the heading region (not the button) and hit Enter/Space.
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('Ui_ApiDown_NoVerdictSubmission: approve is disabled when the API is down', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={true} onApprove={vi.fn()} onOverride={vi.fn()} />);
    expect(screen.getByTestId('approve-button')).toBeDisabled();
    expect(screen.getByTestId('actions-disabled-note')).toBeInTheDocument();
  });

  it('override requires a reason before it can be submitted', async () => {
    const onOverride = vi.fn();
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={vi.fn()} onOverride={onOverride} />);
    await user.click(screen.getByTestId('override-toggle'));
    // Submit disabled with empty reason.
    expect(screen.getByTestId('override-submit')).toBeDisabled();
    await user.type(screen.getByTestId('override-reason'), 'Manager judged the hook acceptable in context.');
    expect(screen.getByTestId('override-submit')).toBeEnabled();
    await user.click(screen.getByTestId('override-submit'));
    expect(onOverride).toHaveBeenCalledTimes(1);
  });

  it('R5-T2: override announces via role="status" and resets ONLY on server-confirmed success', async () => {
    // The callback resolves true = the override round-trip succeeded on the server.
    const onOverride = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={vi.fn()} onOverride={onOverride} />);
    // No confirmation at mount.
    expect(screen.queryByTestId('override-recorded')).toBeNull();
    await user.click(screen.getByTestId('override-toggle'));
    await user.type(screen.getByTestId('override-reason'), 'Manager judged the hook acceptable in context.');
    await user.click(screen.getByTestId('override-submit'));
    expect(onOverride).toHaveBeenCalledTimes(1);
    // Confirmation appears only after the success signal resolves.
    const stamp = await screen.findByTestId('override-recorded');
    expect(stamp).toHaveAttribute('role', 'status');
    // Form reset: it is closed and the reason textarea is gone.
    expect(screen.queryByTestId('override-reason')).toBeNull();
    expect(screen.queryByTestId('override-submit')).toBeNull();
  });

  it('R5-T2: override does NOT announce success when the server did not confirm (no optimistic stamp)', async () => {
    // Resolves false = C2 unreachable / nothing recorded. The panel must not claim success.
    const onOverride = vi.fn().mockResolvedValue(false);
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={vi.fn()} onOverride={onOverride} />);
    await user.click(screen.getByTestId('override-toggle'));
    await user.type(screen.getByTestId('override-reason'), 'Manager judged the hook acceptable.');
    await user.click(screen.getByTestId('override-submit'));
    expect(onOverride).toHaveBeenCalledTimes(1);
    // No confirmation, and the form stays open so the reviewer can retry.
    expect(screen.queryByTestId('override-recorded')).toBeNull();
    expect(screen.getByTestId('override-reason')).toBeInTheDocument();
    expect(screen.getByTestId('override-submit')).toBeInTheDocument();
  });

  it('R5-T5: disabled override submit is described by an explanation', async () => {
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={vi.fn()} onOverride={vi.fn()} />);
    await user.click(screen.getByTestId('override-toggle'));
    const submit = screen.getByTestId('override-submit');
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-describedby', 'override-submit-hint');
    expect(document.getElementById('override-submit-hint')).toHaveTextContent(/enter a reason/i);
  });

  it('renders vetoes with their evidence', () => {
    const withVeto = {
      ...submissionArmed,
      vetoes: [{ veto_id: 'V1', name: 'disclosure', evidence: 'No #ad in caption or overlay.' }],
    };
    render(<VerdictPanel detail={withVeto} apiDown={false} onApprove={vi.fn()} onOverride={vi.fn()} />);
    expect(screen.getByTestId('veto-V1')).toHaveTextContent('No #ad in caption or overlay.');
  });
});

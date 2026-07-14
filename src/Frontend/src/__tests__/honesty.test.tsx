// P9-T9 — the consolidated UI honesty suite.
//
// One auditable place that states, as executable assertions, the promises this UI
// makes. Every check is non-vacuous: where a number must be withheld we assert the
// STORED magnitude is absent from the DOM, not merely that a dash renders. Where a
// human step must stay real we assert no path shortcuts it.
//
// Invariants (mirrors the Phase-9 plan + CLAUDE.md non-negotiables):
//   H1  No breaker-governed number renders unless the breaker is armed.
//   H2  The model never decides — suspected vetoes are flagged, never acted on.
//   H3  No auto-approval and no bulk approval — the human click is load-bearing.
//   H4  Empty is never unreachable — a blank surface always says which it is.
//   H5  Every rendered number carries a provenance label and an as_of date.
//   H6  No client amplification artefact ships without a named human sign-off.
//   H7  The knowledge panel serves no breaker-governed number, no effect size, and
//       no causal verb; a prevalence ratio appears only inside its caveat.
//   H8  ε is shown with the reason it exists, never as a bare number.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VerdictPanel } from '../verdict/VerdictPanel';
import { AmplificationPanel } from '../amplification/AmplificationPanel';
import { KnowledgePanel } from '../knowledge/KnowledgePanel';
import { OperatorDashboard } from '../operator/OperatorDashboard';
import { TriageQueue } from '../queue/TriageQueue';
import { WhatChangedReport } from '../reports/WhatChangedReport';

import {
  submissionArmed,
  submissionTrippedDegraded,
  amplificationArmed,
  knowledgeServed,
  knowledgeEmptyBelowBar,
  knowledgeUnreachable,
  operatorData,
  queueItems,
} from '../api/fixtures';
import type { AmplificationArtefact } from '../types/view';

// Returns a resolved true so it satisfies both onApprove (void) and the
// override success-signal contract onOverride (=> Promise<boolean>).
const noop = () => Promise.resolve(true);

// A number the breaker governs must never appear anywhere as a bare magnitude when
// the state is not armed. \b guards against matching inside a longer number.
function expectMagnitudeAbsent(value: number): void {
  expect(screen.queryByText(new RegExp(`\\b${value}\\b`))).toBeNull();
}

describe('H1 — no breaker-governed number renders unless armed', () => {
  it('VerdictPanel: a tripped breaker hides the stored VPS (41) and every per-criterion score', () => {
    render(
      <VerdictPanel detail={submissionTrippedDegraded} apiDown={false} onApprove={noop} onOverride={noop} />,
    );
    expect(screen.getByTestId('vps-withheld')).toBeInTheDocument();
    expect(screen.queryByTestId('vps-value')).toBeNull();
    // The stored VPS and the degraded criterion scores must not leak.
    expectMagnitudeAbsent(41); // stored vps.value
    expectMagnitudeAbsent(44); // hook_strength
    expectMagnitudeAbsent(60); // scroll_stop_power
    expectMagnitudeAbsent(47); // emotional_specificity
  });

  it('VerdictPanel: an armed breaker DOES render the VPS (proves the test is not vacuous)', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={noop} onOverride={noop} />);
    expect(screen.getByTestId('vps-value')).toHaveTextContent('74');
  });

  it('AmplificationPanel: a not-armed breaker hides every stored AWS magnitude', () => {
    const tripped: AmplificationArtefact = { ...amplificationArmed, breaker_state: 'tripped' };
    render(<AmplificationPanel artefact={tripped} apiDown={false} onSignOff={noop} />);
    // The three stored AWS values must not render as numbers.
    expectMagnitudeAbsent(86);
    expectMagnitudeAbsent(79);
    expectMagnitudeAbsent(84);
    expect(screen.getByTestId('aws-withheld-1')).toBeInTheDocument();
  });

  it('OperatorDashboard: rho is hidden below n=60 (cold cohort shows no rho, keeps n)', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    // The fitness cohort is n=45, rho=null: there is no rho below the floor.
    expect(screen.getByTestId('rho-hidden-fitness')).toBeInTheDocument();
    expect(screen.queryByTestId('rho-fitness')).toBeNull();
  });

  it('OperatorDashboard: C3 down => breaker UNKNOWN, treated as not-armed, no rho at all', () => {
    render(<OperatorDashboard data={null} c3Down={true} />);
    expect(screen.getByTestId('breaker-unknown')).toBeInTheDocument();
    expect(screen.queryByTestId('rho-beauty')).toBeNull();
  });

  it('OperatorDashboard: a high out-of-sample rho renders as a WARNING, never a win', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    const leak = screen.getByTestId('suspected-leak-food');
    expect(leak).toHaveTextContent(/suspected leak/i);
    expect(leak).toHaveTextContent(/warning, not a win/i);
    expect(leak).toHaveAttribute('role', 'alert');
  });
});

describe('H2 — the model never decides', () => {
  it('VerdictPanel: suspected vetoes are badged model-raised and NOT acted on', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={noop} onOverride={noop} />);
    const item = screen.getByTestId('suspected-V2');
    expect(item).toHaveTextContent(/model-raised/i);
    expect(item).toHaveTextContent(/not acted on/i);
    expect(screen.getByRole('note')).toHaveTextContent(/not.*input to the deterministic verdict/i);
  });

  it('TriageQueue: a model-raised suspicion is shown as flagged, explicitly not acted on', () => {
    render(<TriageQueue items={queueItems} emptyReason={null} onOpen={noop} />);
    // sub-v1-disclosure carries suspected V3.
    const reason = screen.getByTestId('queue-reason-sub-v1-disclosure');
    expect(reason).toHaveTextContent(/model-raised suspicion \(not acted on\)/i);
  });
});

describe('H3 — no auto-approval and no bulk approval', () => {
  it('TriageQueue: the queue offers no approve control and no select-all checkbox', () => {
    render(<TriageQueue items={queueItems} emptyReason={null} onOpen={noop} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    // The only per-row action is Open.
    const buttons = screen.getAllByRole('button');
    for (const b of buttons) expect(b).toHaveTextContent(/open/i);
  });

  it('VerdictPanel: approval is a single explicit click on one real button', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={onApprove} onOverride={noop} />);
    await user.click(screen.getByTestId('approve-button'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('VerdictPanel: pressing Enter without focusing the button does NOT approve', async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={onApprove} onOverride={noop} />);
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('VerdictPanel: when the API is down, approval is disabled — fail closed', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={true} onApprove={noop} onOverride={noop} />);
    expect(screen.getByTestId('approve-button')).toBeDisabled();
    expect(screen.getByTestId('actions-disabled-note')).toBeInTheDocument();
  });
});

describe('H4 — empty is never unreachable', () => {
  it('KnowledgePanel: unreachable is structurally distinct from empty-below-the-bar', () => {
    const { unmount } = render(<KnowledgePanel response={knowledgeUnreachable} />);
    expect(screen.getByTestId('knowledge-unreachable')).toHaveTextContent(/UNKNOWN, not empty/i);
    expect(screen.queryByTestId('knowledge-empty')).toBeNull();
    unmount();

    render(<KnowledgePanel response={knowledgeEmptyBelowBar} />);
    expect(screen.getByTestId('knowledge-empty')).toHaveTextContent(/below the bar/i);
    expect(screen.queryByTestId('knowledge-unreachable')).toBeNull();
  });

  it('TriageQueue: "no submissions" reads differently from "all filtered out"', () => {
    const { unmount } = render(<TriageQueue items={[]} emptyReason={'no_submissions'} onOpen={noop} />);
    expect(screen.getByTestId('queue-empty-none')).toBeInTheDocument();
    expect(screen.queryByTestId('queue-empty-filtered')).toBeNull();
    unmount();

    render(<TriageQueue items={[]} emptyReason={'all_filtered_out'} onOpen={noop} />);
    expect(screen.getByTestId('queue-empty-filtered')).toBeInTheDocument();
  });

  it('WhatChangedReport: unreachable refuses to assemble the report from any other source', () => {
    render(<WhatChangedReport report={null} unreachable={true} />);
    expect(screen.getByTestId('whatchanged-unreachable')).toHaveTextContent(/unreachable/i);
    expect(screen.queryByTestId('whatchanged')).toBeNull();
  });
});

describe('H5 — every rendered number carries provenance + as_of', () => {
  it('VerdictPanel: the VPS is shown with its Estimated label and as_of date', () => {
    render(<VerdictPanel detail={submissionArmed} apiDown={false} onApprove={noop} onOverride={noop} />);
    const vps = screen.getByTestId('vps-value');
    expect(vps).toHaveTextContent('Estimated');
    expect(vps).toHaveTextContent(/as of 2026-07-11/);
  });

  it('AmplificationPanel: the AWS and the budget both carry provenance + as_of', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={noop} />);
    expect(screen.getByTestId('rank-1')).toHaveTextContent('Estimated');
    expect(screen.getByTestId('budget')).toHaveTextContent(/User-provided/);
    expect(screen.getByTestId('budget')).toHaveTextContent(/as of 2026-07-11/);
  });
});

describe('H6 — no client artefact ships without a named sign-off', () => {
  it('AmplificationPanel: an unsigned artefact shows the pending gate, not a shipped one', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={noop} />);
    expect(screen.getByTestId('signoff-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('signoff-done')).toBeNull();
  });

  it('AmplificationPanel: sign-off cannot be submitted without a reviewer name', async () => {
    const onSignOff = vi.fn();
    const user = userEvent.setup();
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={onSignOff} />);
    expect(screen.getByTestId('signoff-submit')).toBeDisabled();
    await user.type(screen.getByTestId('signoff-name'), 'Dana Ops');
    expect(screen.getByTestId('signoff-submit')).toBeEnabled();
    await user.click(screen.getByTestId('signoff-submit'));
    expect(onSignOff).toHaveBeenCalledTimes(1);
  });

  it('AmplificationPanel: with the API down, sign-off stays disabled — nothing reaches the client', async () => {
    const onSignOff = vi.fn();
    const user = userEvent.setup();
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={true} onSignOff={onSignOff} />);
    await user.type(screen.getByTestId('signoff-name'), 'Dana Ops');
    expect(screen.getByTestId('signoff-submit')).toBeDisabled();
  });

  it('AmplificationPanel: a blocked-rights candidate names the missing grant', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={noop} />);
    expect(screen.getByTestId('missing-grant-lp-blocked-1')).toHaveTextContent('paid_amplification');
  });
});

describe('H7 — knowledge serves prose, never a governed number or a causal claim', () => {
  it('KnowledgePanel: renders the statement, falsifier, warrant, provenance, and never_tested_against', () => {
    render(<KnowledgePanel response={knowledgeServed} />);
    const card = screen.getByTestId('mechanism-00000000-0000-0000-0000-0000000000a1');
    expect(card).toHaveTextContent(/first-person problem-statement/i);
    expect(within(card).getByTestId(/^falsifier-/)).toBeInTheDocument();
    expect(within(card).getByTestId(/^warrant-/)).toHaveTextContent('contrasted');
    expect(within(card).getByTestId(/^provenance-/)).toHaveTextContent('Proxy-selected, Measured-evaluated');
    expect(within(card).getByTestId(/^nta-/)).toHaveTextContent(/attempted and failed/i);
  });

  it('KnowledgePanel: a prevalence ratio appears only inside its descriptive caveat', () => {
    render(<KnowledgePanel response={knowledgeServed} />);
    const prevalence = screen.getByTestId('prevalence-00000000-0000-0000-0000-0000000000a1');
    expect(prevalence).toHaveTextContent(/descriptive only/i);
    expect(prevalence).toHaveTextContent(/not a multiplier/i);
    expect(prevalence).toHaveTextContent(/does not forecast any score/i);
  });

  it('KnowledgePanel: no causal verb (causes/lifts/drives/predicts) appears anywhere in the panel', () => {
    const { container } = render(<KnowledgePanel response={knowledgeServed} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b(cause[sd]?|caus\w+|lift[sed]*|drive[sn]?|drove|driv\w+|predict\w*)\b/i);
  });
});

describe('H8 — epsilon is shown with the reason it exists', () => {
  it('AmplificationPanel: the epsilon value is accompanied by its rationale', () => {
    render(<AmplificationPanel artefact={amplificationArmed} apiDown={false} onSignOff={noop} />);
    const eps = screen.getByTestId('epsilon');
    expect(eps).toHaveTextContent('0.18');
    expect(eps).toHaveTextContent(/floor 0\.10, never 0/i);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { createFixtureClient } from './api/fixtures';

describe('App integration (fixture client)', () => {
  it('Ui_ApiDown_NoVerdictSubmission: C2 down => stale banner, queue not actionable', async () => {
    render(<App client={createFixtureClient({ c2Down: true })} />);
    await waitFor(() => expect(screen.getByTestId('stale-banner')).toBeInTheDocument());
  });

  it('Ui_BreakerUnknown_HidesNumbers: C3 down => operator shows unknown, no rho', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient({ c3Down: true })} />);
    await user.click(screen.getByRole('button', { name: 'Operator' }));
    await waitFor(() => expect(screen.getByTestId('breaker-unknown')).toBeInTheDocument());
    expect(screen.queryByTestId('rho-beauty')).toBeNull();
  });

  it('Knowledge_Unreachable_DistinctFromEmpty: C4 unreachable renders the unreachable state', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient({ c4: 'unreachable' })} />);
    await user.click(screen.getByRole('button', { name: 'Knowledge' }));
    await waitFor(() => expect(screen.getByTestId('knowledge-unreachable')).toBeInTheDocument());
    expect(screen.queryByTestId('knowledge-empty')).toBeNull();
  });

  it('approving from the verdict panel stamps human_approved_at', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient()} />);
    await waitFor(() => expect(screen.getByTestId('queue-row-sub-notes')).toBeInTheDocument());
    // Open a submission, then approve.
    await user.click(screen.getByRole('button', { name: /Open submission from @ava.routine/ }));
    await waitFor(() => expect(screen.getByTestId('approve-button')).toBeInTheDocument());
    await user.click(screen.getByTestId('approve-button'));
    await waitFor(() => expect(screen.getByTestId('approved-stamp')).toBeInTheDocument());
  });

  it('R5-T1: opening a submission moves focus to the verdict heading', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient()} />);
    await waitFor(() => expect(screen.getByTestId('queue-row-sub-notes')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Open submission from @ava.routine/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Review: @ava.routine/ })).toBeInTheDocument());
    const heading = document.getElementById('verdict-heading');
    expect(heading).not.toBeNull();
    expect(document.activeElement).toBe(heading);
  });

  it('R5-T1: back-to-queue moves focus to the queue heading', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient()} />);
    await waitFor(() => expect(screen.getByTestId('queue-row-sub-notes')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Open submission from @ava.routine/ }));
    await waitFor(() => expect(document.getElementById('verdict-heading')).not.toBeNull());
    await user.click(screen.getByRole('button', { name: /Back to queue/ }));
    await waitFor(() => expect(document.getElementById('queue-heading')).not.toBeNull());
    expect(document.activeElement).toBe(document.getElementById('queue-heading'));
  });

  it('R5-T1: switching routes moves focus to the destination heading', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient()} />);
    await waitFor(() => expect(screen.getByTestId('queue-row-sub-notes')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Operator' }));
    await waitFor(() => expect(document.getElementById('op-heading')).not.toBeNull());
    expect(document.activeElement).toBe(document.getElementById('op-heading'));
  });

  it('R5-T4: document.title reflects the current route', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient()} />);
    await waitFor(() => expect(document.title).toMatch(/Review queue/));
    await user.click(screen.getByRole('button', { name: 'Operator' }));
    await waitFor(() => expect(document.title).toMatch(/Operator dashboard/));
  });

  it('there is no global key handler that approves without the button', async () => {
    const user = userEvent.setup();
    render(<App client={createFixtureClient()} />);
    await waitFor(() => expect(screen.getByTestId('queue-row-sub-notes')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Open submission from @ava.routine/ }));
    await waitFor(() => expect(screen.getByTestId('approve-button')).toBeInTheDocument());
    // Blur everything, press Enter globally.
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('{Enter}');
    expect(screen.queryByTestId('approved-stamp')).toBeNull();
  });
});

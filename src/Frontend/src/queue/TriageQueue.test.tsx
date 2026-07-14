import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TriageQueue } from './TriageQueue';
import { queueItems } from '../api/fixtures';

describe('TriageQueue', () => {
  it('REQ-019: orders compliance risks first, then borderline, then clear passes', () => {
    render(<TriageQueue items={queueItems} emptyReason={null} onOpen={vi.fn()} />);
    const rows = screen.getAllByRole('row').slice(1); // drop header
    const bands = rows.map((r) => r.getAttribute('data-band'));
    // Every compliance_risk precedes every borderline, which precedes every clear_pass.
    const firstBorderline = bands.indexOf('borderline');
    const firstClear = bands.indexOf('clear_pass');
    const lastRisk = bands.lastIndexOf('compliance_risk');
    expect(lastRisk).toBeLessThan(firstBorderline);
    expect(firstBorderline).toBeLessThan(firstClear);
  });

  it('every row states WHY it needs attention (never blank)', () => {
    render(<TriageQueue items={queueItems} emptyReason={null} onOpen={vi.fn()} />);
    for (const item of queueItems) {
      expect(screen.getByTestId(`queue-reason-${item.submission_id}`).textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('A1: has NO bulk-approve, no approve-all, no per-row approve, no select-all', () => {
    render(<TriageQueue items={queueItems} emptyReason={null} onOpen={vi.fn()} />);
    // No checkbox at all.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // No button whose label mentions approve.
    const buttons = screen.getAllByRole('button');
    for (const b of buttons) {
      expect(b.textContent?.toLowerCase()).not.toContain('approve');
    }
    // The only actions are "Open".
    expect(buttons.every((b) => /open/i.test(b.textContent ?? ''))).toBe(true);
  });

  it('opens a submission on explicit click, never approves from the queue', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    const first = queueItems[0]!;
    render(<TriageQueue items={queueItems} emptyReason={null} onOpen={onOpen} />);
    const firstRow = screen.getByTestId(`queue-row-${first.submission_id}`);
    await user.click(within(firstRow).getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(first.submission_id);
  });

  it('Queue_EmptyStates_Distinct: "no submissions" differs from "all filtered out"', () => {
    const { rerender } = render(<TriageQueue items={[]} emptyReason="no_submissions" onOpen={vi.fn()} />);
    expect(screen.getByTestId('queue-empty-none')).toBeInTheDocument();
    expect(screen.queryByTestId('queue-empty-filtered')).toBeNull();

    rerender(<TriageQueue items={[]} emptyReason="all_filtered_out" onOpen={vi.fn()} />);
    expect(screen.getByTestId('queue-empty-filtered')).toBeInTheDocument();
    expect(screen.queryByTestId('queue-empty-none')).toBeNull();
  });
});

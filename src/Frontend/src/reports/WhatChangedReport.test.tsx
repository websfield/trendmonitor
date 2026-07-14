// P9-T10 — the "what changed" report is derived by READING C4 at two library
// versions. It must invent no number, and when C4 is unreachable it must refuse to
// assemble the report from any other source (REQ-070).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhatChangedReport } from './WhatChangedReport';
import { whatChanged } from '../api/fixtures';

describe('WhatChangedReport', () => {
  it('renders warrant transitions and coverage straight off the C4 response', () => {
    render(<WhatChangedReport report={whatChanged} unreachable={false} />);
    expect(screen.getByTestId('whatchanged')).toBeInTheDocument();
    // Newly served, falsified, and promoted each surface from the report.
    expect(screen.getByTestId('wc-newly-served')).toHaveTextContent(/first-person problem-statement/i);
    expect(screen.getByTestId('wc-falsified')).toHaveTextContent(/trending-audio sync/i);
    expect(screen.getByTestId('wc-promoted')).toHaveTextContent(/recurrent → contrasted/);
    // The header states the version transition it was derived from.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /beauty\.tiktok\.m2 → beauty\.tiktok\.m3/,
    );
  });

  it('states its provenance: derived entirely by reading C4, no invented number', () => {
    render(<WhatChangedReport report={whatChanged} unreachable={false} />);
    expect(screen.getByRole('note')).toHaveTextContent(/derived entirely by reading C4/i);
    expect(screen.getByRole('note')).toHaveTextContent(/no number here is invented/i);
  });

  it('when C4 is unreachable, refuses to assemble the report — distinct from an empty cycle', () => {
    render(<WhatChangedReport report={null} unreachable={true} />);
    const unreachable = screen.getByTestId('whatchanged-unreachable');
    expect(unreachable).toHaveTextContent(/unreachable/i);
    expect(unreachable).toHaveTextContent(/would risk inventing a change C4 never reported/i);
    expect(screen.queryByTestId('whatchanged')).toBeNull();
  });

  it('a null report without an unreachable flag still fails safe (renders the refusal, not a blank)', () => {
    render(<WhatChangedReport report={null} unreachable={false} />);
    expect(screen.getByTestId('whatchanged-unreachable')).toBeInTheDocument();
  });
});

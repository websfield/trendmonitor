import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvenancedNumber, ProvenanceChip } from './Provenance';

describe('Provenance', () => {
  it('A5: a rendered number always carries its provenance label and as_of', () => {
    render(
      <ProvenancedNumber datum={{ value: 74, provenance: 'Estimated', as_of: '2026-07-11T09:00:00Z' }} label="VPS" />,
    );
    const el = screen.getByText(/VPS:/);
    expect(el).toHaveTextContent('74');
    expect(el).toHaveTextContent('Estimated');
    expect(el).toHaveTextContent('2026-07-11');
  });

  it('a Proxy value is labelled Proxy, never Measured', () => {
    render(<ProvenanceChip label="Proxy" asOf="2026-07-11T09:00:00Z" />);
    const chip = screen.getByText('Proxy');
    expect(chip).toBeInTheDocument();
    expect(chip.closest('.provenance')).toHaveAttribute('data-provenance', 'Proxy');
  });
});

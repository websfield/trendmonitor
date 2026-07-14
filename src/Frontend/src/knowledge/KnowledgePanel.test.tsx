import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KnowledgePanel } from './KnowledgePanel';
import { knowledgeServed, knowledgeEmptyBelowBar, knowledgeUnreachable } from '../api/fixtures';

describe('KnowledgePanel', () => {
  it('renders statement, falsifier, warrant, provenance label, never_tested_against', () => {
    render(<KnowledgePanel response={knowledgeServed} />);
    const id = '00000000-0000-0000-0000-0000000000a1';
    expect(screen.getByTestId(`mechanism-${id}`)).toHaveTextContent(/first-person problem-statement/i);
    expect(screen.getByTestId(`falsifier-${id}`)).toHaveTextContent(/falsified/i);
    expect(screen.getByTestId(`warrant-${id}`)).toHaveTextContent('contrasted');
    expect(screen.getByTestId(`provenance-${id}`)).toHaveTextContent('Proxy-selected, Measured-evaluated');
    expect(screen.getByTestId(`nta-${id}`)).toHaveTextContent('content that was attempted and failed');
  });

  it('A10: renders NO 0-100 field, no effect size, no VPS/AWS number', () => {
    const { container } = render(<KnowledgePanel response={knowledgeServed} />);
    const text = container.textContent ?? '';
    // No effect-size / score vocabulary anywhere on the surface.
    expect(text.toLowerCase()).not.toMatch(/effect size|effect_size|\bvps\b|\baws\b|\blift\b/);
    // No forbidden causal verbs (the mechanisms lexicon).
    expect(text.toLowerCase()).not.toMatch(/\bcauses\b|\blifts\b|\bdrives\b|\bpredicts\b/);
    // prevalence_ratio (2.48) may appear, but ONLY wrapped with its descriptive caveat.
    expect(screen.getByTestId(`prevalence-${'00000000-0000-0000-0000-0000000000a1'}`)).toHaveTextContent(
      /descriptive only/i,
    );
  });

  it('A6 / Knowledge_Unreachable_DistinctFromEmpty: unreachable != empty', () => {
    const { rerender } = render(<KnowledgePanel response={knowledgeEmptyBelowBar} />);
    const empty = screen.getByTestId('knowledge-empty');
    expect(empty).toHaveAttribute('data-empty-kind', 'empty');
    expect(empty).toHaveAttribute('role', 'status');
    // It says WHY it is empty, with the blocking counts.
    expect(empty).toHaveTextContent(/n_trends >= 2 not met/i);

    rerender(<KnowledgePanel response={knowledgeUnreachable} />);
    const unreachable = screen.getByTestId('knowledge-unreachable');
    expect(unreachable).toHaveAttribute('data-empty-kind', 'unreachable');
    expect(unreachable).toHaveAttribute('role', 'alert'); // distinct role
    expect(unreachable).toHaveTextContent(/UNKNOWN, not empty/i);

    // The two states must not share a testid / must be visually distinct.
    expect(screen.queryByTestId('knowledge-empty')).toBeNull();
  });

  it('a served-but-empty response still surfaces its coverage state', () => {
    render(<KnowledgePanel response={knowledgeEmptyBelowBar} />);
    expect(screen.getByTestId('coverage-note')).toHaveAttribute('data-coverage-state', 'below_warrant_bar');
  });
});

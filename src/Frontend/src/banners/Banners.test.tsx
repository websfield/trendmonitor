import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DegradedBanner, AdvisoryBanner, StaleDataBanner } from './Banners';

describe('Banners', () => {
  it('REQ-018: degraded banner names which criteria were scored without audio', () => {
    render(<DegradedBanner audioPresent={false} degradedCriteria={['hook_strength', 'completion_likelihood']} />);
    const banner = screen.getByTestId('degraded-banner');
    expect(banner).toHaveAttribute('role', 'status');
    expect(screen.getByTestId('degraded-criteria')).toHaveTextContent('hook_strength, completion_likelihood');
  });

  it('degraded banner does not render when audio is present', () => {
    const { container } = render(<DegradedBanner audioPresent={true} degradedCriteria={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('A2: advisory banner shows breaker state + reason, never a number, when not armed', () => {
    render(<AdvisoryBanner state="tripped" />);
    const banner = screen.getByTestId('advisory-banner');
    expect(banner).toHaveAttribute('data-breaker-state', 'tripped');
    expect(screen.getByTestId('advisory-reason')).toHaveTextContent(/TRIPPED/i);
    // No bare 0-100 number in the advisory.
    expect(banner.textContent).not.toMatch(/\b\d{1,3}\b/);
  });

  it('A3: advisory banner treats unknown as not-armed and hides numbers', () => {
    render(<AdvisoryBanner state="unknown" />);
    expect(screen.getByTestId('advisory-reason')).toHaveTextContent(/UNKNOWN/i);
  });

  it('advisory banner does NOT render when armed', () => {
    const { container } = render(<AdvisoryBanner state="armed" />);
    expect(container.firstChild).toBeNull();
  });

  it('stale-data banner carries as_of and is an assertive alert', () => {
    render(<StaleDataBanner asOf="2026-07-11T09:00:00Z" message="C2 unreachable." />);
    const banner = screen.getByTestId('stale-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('2026-07-11');
    expect(banner).toHaveTextContent(/disabled/i);
  });
});

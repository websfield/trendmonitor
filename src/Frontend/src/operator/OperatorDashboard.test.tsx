import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperatorDashboard } from './OperatorDashboard';
import { operatorData } from '../api/fixtures';

describe('OperatorDashboard', () => {
  it('A11: shows rho WITH n and CI for an armed cohort', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    expect(screen.getByTestId('rho-beauty')).toHaveTextContent('0.41');
    expect(screen.getByTestId('n-beauty')).toHaveTextContent('128');
    const row = screen.getByTestId('cohort-beauty');
    expect(row).toHaveTextContent('[0.28, 0.53]');
  });

  it('Dashboard_NoRhoBelowN60: hides rho when n < 60', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    // fitness cohort has n=45
    expect(screen.getByTestId('rho-hidden-fitness')).toBeInTheDocument();
    expect(screen.queryByTestId('rho-fitness')).toBeNull();
  });

  it('Dashboard_HighRho_ShowsSuspectedLeak: rho>0.5 out-of-sample is a WARNING, not a win', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    // food cohort: armed, rho 0.72, suspected_leak
    const warn = screen.getByTestId('suspected-leak-food');
    expect(warn).toHaveAttribute('role', 'alert');
    expect(warn).toHaveTextContent(/SUSPECTED LEAK/i);
    expect(warn).toHaveTextContent(/warning, not a win/i);
    // The armed food cohort still renders its rho (it is armed), but framed as a warning.
    expect(screen.getByTestId('cohort-food')).toHaveAttribute('data-suspected-leak', 'true');
  });

  it('A13: override rate broken down by cohort AND creator tier', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    expect(screen.getByTestId('override-cohort-beauty · tiktok')).toBeInTheDocument();
    expect(screen.getByTestId('override-tier-nano')).toBeInTheDocument();
    expect(screen.getByTestId('override-tier-macro')).toHaveTextContent('28%');
  });

  it('A12: shows ratification volume, median latency, and rejection rate per cohort', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    const row = screen.getByTestId('ratification-beauty · tiktok');
    expect(row).toHaveTextContent('12'); // volume
    expect(row).toHaveTextContent('6.5'); // latency
    expect(row).toHaveTextContent('25%'); // rejection
  });

  it('shows warrant rungs, falsified-this-refresh, and contrasted-rate by arm', () => {
    render(<OperatorDashboard data={operatorData} c3Down={false} />);
    expect(screen.getByTestId('rung-contrasted')).toHaveTextContent('4');
    expect(screen.getByTestId('falsified-list')).toBeInTheDocument();
    expect(screen.getByTestId('arm-trend_directed')).toHaveTextContent('18%');
  });

  it('A14: renders NO headline accuracy figure', () => {
    const { container } = render(<OperatorDashboard data={operatorData} c3Down={false} />);
    expect((container.textContent ?? '').toLowerCase()).not.toContain('accuracy');
  });

  it('Ui_BreakerUnknown_HidesNumbers: C3 down => breaker unknown, numbers hidden', () => {
    render(<OperatorDashboard data={null} c3Down={true} />);
    expect(screen.getByTestId('breaker-unknown')).toHaveTextContent(/unknown/i);
    // No rho values at all.
    expect(screen.queryByTestId('rho-beauty')).toBeNull();
  });
});

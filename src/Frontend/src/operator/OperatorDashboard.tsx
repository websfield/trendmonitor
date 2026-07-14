// P9-T7 — operator dashboard.
// - Rolling Spearman ρ shown WITH n and CI. ρ is HIDDEN when n < 60 (there is no
//   ρ below the floor); the breaker reads cold and the reason is shown.
// - ρ > 0.5 out-of-sample (suspected_leak) renders as a WARNING, never a win,
//   visually distinct from a healthy high ρ.
// - Override rate by cohort AND by creator tier.
// - Mechanisms by warrant rung; mechanisms falsified this refresh; contrasted-rate
//   by ingestion arm; ratification volume + median latency + rejection rate.
// - There is NO headline "accuracy" figure. There is no accuracy here.
import type {
  OperatorDashboardData,
  CalibrationReading,
} from '../types/view';
import { breakerBadge } from '../lib/breaker';
import { StaleDataBanner } from '../banners/Banners';

export function OperatorDashboard({
  data,
  c3Down,
}: {
  data: OperatorDashboardData | null;
  /** When C3 is down, breaker state is UNKNOWN and treated as not-armed. */
  c3Down: boolean;
}): JSX.Element {
  return (
    <section aria-labelledby="op-heading" className="operator-dashboard">
      <h2 id="op-heading">Operator dashboard</h2>
      {c3Down || !data ? (
        <>
          <StaleDataBanner
            asOf={null}
            message="The calibration monitor (C3) is unreachable, so breaker state is UNKNOWN. Unknown is treated as not-armed and all governed numbers are hidden."
          />
          <p data-testid="breaker-unknown" role="status">
            Breaker state: <strong>unknown</strong> for every cohort. No ρ and no VPS is shown until C3 responds.
          </p>
        </>
      ) : (
        <>
          <CalibrationTable readings={data.readings} />
          <OverrideByCohort data={data} />
          <OverrideByTier data={data} />
          <WarrantRungs data={data} />
          <FalsifiedThisRefresh data={data} />
          <ContrastedByArm data={data} />
          <Ratification data={data} />
        </>
      )}
    </section>
  );
}

function CalibrationTable({ readings }: { readings: CalibrationReading[] }): JSX.Element {
  return (
    <>
      <h3>Calibration (rolling Spearman ρ)</h3>
      <table className="calibration">
        <caption className="visually-hidden">
          Per-cohort rolling Spearman with n and confidence interval, breaker state, and reason. ρ is not shown
          below n = 60.
        </caption>
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col">Breaker</th>
            <th scope="col">ρ</th>
            <th scope="col">n</th>
            <th scope="col">95% CI</th>
            <th scope="col">Note</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((r) => {
            const badge = breakerBadge(r.breaker_state);
            const label = `${r.cohort_key.vertical} · ${r.cohort_key.platform}`;
            // ρ is rendered ONLY when n >= 60 AND rho != null.
            const showRho = r.n >= 60 && r.rho != null;
            return (
              <tr
                key={label}
                data-testid={`cohort-${r.cohort_key.vertical}`}
                data-breaker={r.breaker_state}
                data-suspected-leak={r.suspected_leak}
              >
                <th scope="row">{label}</th>
                <td>
                  <span className={`breaker-chip breaker-chip--${r.breaker_state}`}>
                    <span aria-hidden="true">{badge.symbol} </span>
                    {badge.label}
                  </span>
                </td>
                <td>
                  {showRho ? (
                    <span data-testid={`rho-${r.cohort_key.vertical}`}>{r.rho}</span>
                  ) : (
                    <span data-testid={`rho-hidden-${r.cohort_key.vertical}`} className="score-withheld">
                      <span aria-hidden="true">— </span>no ρ (n &lt; 60)
                    </span>
                  )}
                </td>
                <td data-testid={`n-${r.cohort_key.vertical}`}>{r.n}</td>
                <td>{r.ci && showRho ? `[${r.ci[0]}, ${r.ci[1]}]` : '—'}</td>
                <td>
                  {r.suspected_leak ? (
                    <span
                      className="suspected-leak-warning"
                      data-testid={`suspected-leak-${r.cohort_key.vertical}`}
                      role="alert"
                    >
                      <span aria-hidden="true">⚠ </span>
                      SUSPECTED LEAK — a high ρ here is a warning, not a win. {r.reason}
                    </span>
                  ) : (
                    r.reason
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function OverrideByCohort({ data }: { data: OperatorDashboardData }): JSX.Element {
  return (
    <>
      <h3>Override rate by cohort</h3>
      <table className="override-cohort">
        <caption className="visually-hidden">Verdict override rate per cohort with the verdict count.</caption>
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col">Override rate</th>
            <th scope="col">n verdicts</th>
          </tr>
        </thead>
        <tbody>
          {data.override_by_cohort.map((o) => (
            <tr key={o.cohort_label} data-testid={`override-cohort-${o.cohort_label}`}>
              <th scope="row">{o.cohort_label}</th>
              <td>{pct(o.override_rate)}</td>
              <td>{o.n_verdicts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function OverrideByTier({ data }: { data: OperatorDashboardData }): JSX.Element {
  return (
    <>
      <h3>Override rate by creator tier</h3>
      <p className="tier-note">
        If managers override the same verdict for macro creators at a materially higher rate than for nano
        creators, the humans are correcting a bias the system has.
      </p>
      <table className="override-tier">
        <caption className="visually-hidden">Verdict override rate per creator follower tier.</caption>
        <thead>
          <tr>
            <th scope="col">Tier</th>
            <th scope="col">Verdict</th>
            <th scope="col">Override rate</th>
            <th scope="col">n verdicts</th>
          </tr>
        </thead>
        <tbody>
          {data.override_by_tier.map((o) => (
            <tr key={`${o.tier}-${o.verdict_from}`} data-testid={`override-tier-${o.tier}`}>
              <th scope="row">{o.tier}</th>
              <td>{o.verdict_from}</td>
              <td>{pct(o.override_rate)}</td>
              <td>{o.n_verdicts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function WarrantRungs({ data }: { data: OperatorDashboardData }): JSX.Element {
  return (
    <>
      <h3>Mechanisms by warrant rung</h3>
      <ul className="warrant-rungs" data-testid="warrant-rungs">
        {data.warrant_rungs.map((w) => (
          <li key={w.warrant} data-testid={`rung-${w.warrant}`}>
            {w.warrant}: {w.count}
          </li>
        ))}
      </ul>
    </>
  );
}

function FalsifiedThisRefresh({ data }: { data: OperatorDashboardData }): JSX.Element {
  return (
    <>
      <h3>Mechanisms falsified this refresh</h3>
      {data.falsified_this_refresh.length === 0 ? (
        <p>None falsified this refresh.</p>
      ) : (
        <ul className="falsified-list" data-testid="falsified-list">
          {data.falsified_this_refresh.map((f) => (
            <li key={f.mechanism_id} data-testid={`falsified-${f.mechanism_id}`}>
              <q>{f.statement_excerpt}</q> — demoted at{' '}
              <time dateTime={f.demoted_at}>{f.demoted_at}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ContrastedByArm({ data }: { data: OperatorDashboardData }): JSX.Element {
  return (
    <>
      <h3>Contrasted-rate by ingestion arm</h3>
      <table className="contrasted-arm">
        <caption className="visually-hidden">
          Share of mechanisms reaching the contrasted rung, by exemplar-ingestion arm.
        </caption>
        <thead>
          <tr>
            <th scope="col">Ingestion arm</th>
            <th scope="col">Contrasted rate</th>
            <th scope="col">n mechanisms</th>
          </tr>
        </thead>
        <tbody>
          {data.contrasted_by_arm.map((c) => (
            <tr key={c.ingestion_arm} data-testid={`arm-${c.ingestion_arm}`}>
              <th scope="row">{c.ingestion_arm}</th>
              <td>{pct(c.contrasted_rate)}</td>
              <td>{c.n_mechanisms}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Ratification({ data }: { data: OperatorDashboardData }): JSX.Element {
  return (
    <>
      <h3>Ratification (the decay signal)</h3>
      <table className="ratification">
        <caption className="visually-hidden">
          Ratification volume, median latency, and rejection rate per cohort — the signal for whether the human
          step is decaying into a rubber stamp.
        </caption>
        <thead>
          <tr>
            <th scope="col">Cohort</th>
            <th scope="col">Volume</th>
            <th scope="col">Median latency (h)</th>
            <th scope="col">Rejection rate</th>
          </tr>
        </thead>
        <tbody>
          {data.ratification.map((r) => (
            <tr key={r.cohort_label} data-testid={`ratification-${r.cohort_label}`}>
              <th scope="row">{r.cohort_label}</th>
              <td>{r.volume}</td>
              <td>{r.median_latency_hours}</td>
              <td>{pct(r.rejection_rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

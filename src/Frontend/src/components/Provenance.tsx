// Provenance chip. Rule 5: every rendered number carries its provenance label and
// as_of date. A Proxy value is never displayed as Measured. This component makes
// it impossible to render a number without both.
import type { Provenanced } from '../types/view';

export function ProvenanceChip({ label, asOf }: { label: string; asOf: string }): JSX.Element {
  return (
    <span className="provenance" data-provenance={label}>
      <span className="provenance__label">{label}</span>
      <span className="provenance__asof">
        {' '}
        as of <time dateTime={asOf}>{formatDate(asOf)}</time>
      </span>
    </span>
  );
}

/**
 * Renders a governed value WITH its provenance and as_of. There is no prop that
 * renders the number alone. `unit` is optional (e.g. "$").
 */
export function ProvenancedNumber({
  datum,
  label,
  unit = '',
}: {
  datum: Provenanced;
  label: string;
  unit?: string;
}): JSX.Element {
  // The label is a direct text child of the wrapper (not its own span) so the
  // number and its provenance are one queryable unit: any query that finds the
  // label also holds the value + provenance chip. This makes it structurally
  // impossible to surface the label without the number that carries it.
  return (
    <span className="provenanced-number">
      {label}:{' '}
      <span className="provenanced-number__value">
        {unit}
        {datum.value}
      </span>{' '}
      <ProvenanceChip label={datum.provenance} asOf={datum.as_of} />
    </span>
  );
}

function formatDate(iso: string): string {
  // Keep it deterministic and locale-independent for tests.
  return iso.slice(0, 10);
}

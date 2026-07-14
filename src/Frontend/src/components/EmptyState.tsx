// An empty state ALWAYS says why it is empty, and "empty because below the bar"
// must look different from "unreachable/unknown". This component enforces that by
// requiring a `kind` and a `reason`, and renders a distinct icon + text per kind.
export type EmptyKind = 'empty' | 'unreachable' | 'no_coverage';

const PRESENTATION: Record<EmptyKind, { symbol: string; heading: string; role: 'status' | 'alert' }> = {
  // Served, but nothing cleared the bar. Not an error.
  empty: { symbol: '○', heading: 'Nothing here yet', role: 'status' },
  // The source could not be reached. Unknown, not empty. Visually distinct.
  unreachable: { symbol: '⚠', heading: 'Unreachable', role: 'alert' },
  // A feed dimension with no coverage — "no coverage", never silence.
  no_coverage: { symbol: '—', heading: 'No coverage', role: 'status' },
};

export function EmptyState({
  kind,
  reason,
  detail,
  testId,
}: {
  kind: EmptyKind;
  reason: string;
  detail?: string;
  testId?: string;
}): JSX.Element {
  const p = PRESENTATION[kind];
  return (
    <div
      className={`empty-state empty-state--${kind}`}
      data-empty-kind={kind}
      role={p.role}
      aria-live={p.role === 'alert' ? 'assertive' : 'polite'}
      data-testid={testId}
    >
      <p className="empty-state__heading">
        <span aria-hidden="true" className="empty-state__symbol">
          {p.symbol}
        </span>{' '}
        {p.heading}
      </p>
      <p className="empty-state__reason">{reason}</p>
      {detail ? <p className="empty-state__detail">{detail}</p> : null}
    </div>
  );
}

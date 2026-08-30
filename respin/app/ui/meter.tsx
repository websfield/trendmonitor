// Meter (DESIGN.md): a bar with the creator's own baseline as a tick. Reach
// and conversion each get their own meter — never merged into one score.
export function Meter({
  value,
  max,
  baseline,
  label,
}: {
  /** Current value, in the same unit as max. */
  value: number;
  /** The scale's end. A non-positive max renders an empty bar (never NaN). */
  max: number;
  /** The creator's own baseline, same unit; omitted = no tick. */
  baseline?: number;
  /** Accessible name for the bar. */
  label: string;
}) {
  const clamp = (n: number) =>
    max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0;
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="meter-fill" style={{ width: `${clamp(value)}%` }} />
      {baseline !== undefined ? (
        <div className="meter-baseline" style={{ left: `${clamp(baseline)}%` }} />
      ) : null}
    </div>
  );
}

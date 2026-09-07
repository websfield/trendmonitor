// Meter (DESIGN.md): a bar with the creator's own baseline as a tick. Reach
// and conversion each get their own meter — never merged into one score.
export function Meter({
  value,
  max,
  baseline,
  baselineLabel,
  label,
}: {
  /** Current value, in the same unit as max. */
  value: number;
  /** The scale's end. A non-positive max renders an empty bar (never NaN). */
  max: number;
  /**
   * The creator's own baseline, same unit. OMITTED = no tick, and omitted is
   * the ONLY way to say "there is no baseline" (R12, slice 9a: absent is never
   * zero). `0` is a MEASURED baseline of zero and draws a tick at the left
   * edge; a caller with a `short`/`none` population must omit this prop and
   * render the named absence beside the meter instead — see
   * `app/(product)/results/comparison-view.tsx`, this tick's first consumer.
   *
   * A NON-FINITE VALUE DRAWS NOTHING RATHER THAN A TICK AT ZERO. `clamp(NaN)`
   * is `NaN`, `left: NaN%` is dropped by CSS, and the tick then renders at the
   * container's left edge — i.e. an unknown baseline rendered as zero, which is
   * exactly the failure this prop's first real consumer exists to avoid.
   */
  baseline?: number;
  /**
   * What the tick MEANS, in words, for the accessible layer.
   *
   * DESIGN.md: "status never color-only". A 2px line is the whole visual
   * statement of the baseline, so without this the tick is a fact only a
   * sighted reader gets. The caller supplies the sentence because only it knows
   * the unit, the n and the window the baseline was taken over.
   */
  baselineLabel?: string;
  /** Accessible name for the bar. */
  label: string;
}) {
  // A NEGATIVE VALUE IS NOT DRAWN AT ALL, and that is the fix for a real
  // defect: this clamped at 0, so a median BELOW zero rendered identically to
  // one AT zero and to a bar of nothing — the absence-drawn-as-zero failure
  // the whole results screen is built against, arriving inside the primitive
  // it renders with. Two gates found it independently.
  //
  // `null` RATHER THAN A CLAMPED NUMBER, so the caller cannot accidentally
  // render it: a fill of "0%" and a tick at "0%" are exactly the two marks
  // that would lie. A scale this component cannot honestly place a mark on is
  // a scale it draws no mark on, and the caller states the numbers in words
  // beside it (`comparison-view.tsx` prints both medians whatever happens).
  const clamp = (n: number): number | null =>
    max > 0 && Number.isFinite(n) && n >= 0
      ? Math.max(0, Math.min(100, (n / max) * 100))
      : null;
  const fill = clamp(value);
  const tick = baseline === undefined ? null : clamp(baseline);
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {fill === null ? null : (
        <div className="meter-fill" style={{ width: `${fill}%` }} />
      )}
      {tick === null ? null : (
        <div
          className="meter-baseline"
          data-testid="meter-baseline"
          style={{ left: `${tick}%` }}
          {...(baselineLabel !== undefined
            ? { role: "img", "aria-label": baselineLabel }
            : { "aria-hidden": true })}
        />
      )}
    </div>
  );
}

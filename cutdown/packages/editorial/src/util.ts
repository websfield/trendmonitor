/**
 * Small deterministic helpers shared by the editorial resolvers.
 */

/**
 * A set of `order` integers is a contiguous permutation when every value is
 * distinct and the values fill an unbroken run (`[min, min+1, ..., min+n-1]`).
 * Both the story plan and the EDL carry an explicit `order` per element so a
 * reorder is a visible field diff; this is the check that a reorder did not lose,
 * duplicate, or skip a position.
 */
export function contiguousPermutation(values: readonly number[]): { ok: true } | { ok: false; message: string } {
  if (values.length === 0) return { ok: true };
  const seen = new Set<number>();
  for (const v of values) {
    if (!Number.isInteger(v)) return { ok: false, message: `order value ${v} is not an integer.` };
    if (seen.has(v)) return { ok: false, message: `order value ${v} is duplicated; positions must be unique.` };
    seen.add(v);
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min !== values.length - 1) {
    return { ok: false, message: `order values ${[...values].sort((a, b) => a - b).join(', ')} are not contiguous (expected an unbroken run of ${values.length}).` };
  }
  return { ok: true };
}

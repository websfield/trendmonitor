// WHAT A CREATOR CALLS A MODE (slice 6, R17a) — the one place `app/**` can
// reach `MODE_SPECS[…].label` from.
//
// It lives HERE, in `@respin/credits`, for the same reason `mode-access.ts`
// does: `@respin/modes` is DENIED to `app/**` (R-64), and `@respin/db` — where
// the by-mode burn is read — must not depend on the pipeline package either.
// `@respin/credits` already imports `@respin/modes` for the tier gate, and it
// is the one package `app/**` may import, so this is the seam that already
// exists rather than a new one.
//
// A SCREEN-SIDE MAP WAS THE ALTERNATIVE AND IS REFUSED, for the reason
// `app/(product)/studio/copy.ts` states about the tier→mode map it declines to
// copy: "a screen-side copy of that map is a second answer that goes stale the
// day slice 7 changes the first". Seven labels retyped in a view is exactly
// that shape.
//
// PURE. No config read, no DB, no scope — so it is a plain re-export on the
// facade like `burnPeriod`, not a `respinCredits` method.
import { MODE_SPECS, type ModeId } from "@respin/modes";

/**
 * The creator-facing name for a stored `generations.mode`.
 *
 * THE PARAMETER IS `string`, NOT `ModeId`, AND THE FALLBACK IS THE ID ITSELF.
 * `generations.mode` is a TEXT column on purpose (`generation-schema.ts`: the
 * mode vocabulary belongs to `@respin/modes` and `creditCosts`, and pinning it
 * as a pgEnum would mean a migration per mode), so a row can carry a string
 * this build does not know — an older deployment's mode, or a mode retired
 * between the generation and this render. Returning the raw id in that case
 * shows the creator something true about a charge they really paid; returning
 * a placeholder, or dropping the row, would hide a charge because we could not
 * name it, which is the wrong way round on a money screen.
 */
export function modeLabel(mode: string): string {
  return MODE_SPECS[mode as ModeId]?.label ?? mode;
}

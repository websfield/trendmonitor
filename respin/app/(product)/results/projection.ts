// What the scoped readers returned → what the screen renders.
//
// A DIRECTIVE-FREE MODULE, and it has to be: `./actions.ts` is `"use server"`,
// where a module may export only async functions. `../studio/projection.ts`
// records why that constraint is the right shape anyway — a projection is
// where a field goes missing, and a pure function is where a test can prove
// one did not.
//
// `@respin/brain` IS NOT IMPORTED, and cannot be: `eslint.config.mjs`'s
// negation catch-all denies it to `app/**` deliberately, because
// `buildLeverComparisons` trusts its caller to have scoped the rows and the
// fetch must not be a package boundary away from the comparison. So every type
// here is reached by INDEXED ACCESS off what `respinDb` returns — the exact
// technique `studio/projection.ts` uses for `@respin/modes` — and the
// assignments below are the COMPILE-TIME WITNESS that the screen's local view
// types still match the package's: a renamed field, a fourth `Population`
// state or a third lever is a red typecheck HERE rather than a silently
// dropped section on a creator's screen.
import { respinDb } from "@respin/db";
import type {
  ComparisonGroupView,
  LeverComparisonView,
  PopulationView,
} from "./comparison-view";
import { isoDay } from "./copy";
import type { ResultRowView } from "./results-view";

/** One stored result, as the scoped reader returns it. */
export type StoredResult = Awaited<
  ReturnType<typeof respinDb.listResults>
>[number];

/**
 * ONE TREATMENT'S COMPARISON, as the fetch-and-compare facade returns it.
 *
 * THE SEAM IT COMES ACROSS IS DECIDED, and `page.tsx`'s header carries the
 * argument in full: `@respin/db` composes `buildLeverComparisons` over rows it
 * has already fetched through the cage, `app/**` keeps its default deny, and
 * this file names the returned shape by INDEXED ACCESS so nothing here has to
 * import `@respin/brain` to render one.
 */
export type StoredComparisonGroup = Awaited<
  ReturnType<typeof respinDb.resultComparisons>
>[number];

/**
 * THE LEVER COLUMNS THIS SCREEN READS OFF A ROW.
 *
 * A LIST, NOT A LOOP OVER `RESULT_LEVERS`, because the row stores each lever
 * in its own named pair of columns and there is no way to reach
 * `reachValue` from the string `"reach"` without an index signature that
 * would make a typo compile. So the population is written out — and
 * `tests/results-entry.test.tsx` asserts it is EXACTLY `RESULT_LEVERS`, so a
 * third lever added upstream is a red test naming this list rather than a
 * lever silently missing from every result view (R9).
 */
export const ROW_LEVERS = ["reach", "conversion"] as const;

export function resultRowView(row: StoredResult): ResultRowView {
  return {
    id: row.id,
    platform: row.platform,
    audienceClass: row.audienceClass,
    observedFrom: isoDay(row.observedFrom),
    observedTo: isoDay(row.observedTo),
    evidenceState: row.evidenceState,
    metricKey: row.metricKey,
    // BOTH LEVERS, ALWAYS, whether or not this result reported them (R9). A
    // lever with no numbers renders as "not reported" and never as a zero.
    levers: [
      {
        lever: "reach",
        value: row.reachValue,
        denominator: row.reachDenominator,
      },
      {
        lever: "conversion",
        value: row.conversionValue,
        denominator: row.conversionDenominator,
      },
    ],
    confounders: readConfounders(row.confounders),
    treatmentKey: row.treatmentKey,
    note: row.note,
  };
}

/**
 * `confounders` crossed a `jsonb` boundary, so it is checked rather than cast.
 *
 * The same rule `frameworkVersionsOf` states one package over: "the
 * alternative to checking it is a cast". A shape this screen cannot read is
 * rendered as NO confounders — which is the only wrong answer available, and
 * it is wrong in the direction that shows less rather than inventing a flag
 * the creator never set.
 */
function readConfounders(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((code): code is string => typeof code === "string")
    : [];
}

/** `Population`, projected. All FOUR states are carried, never collapsed. */
function populationView(
  population: StoredComparisonGroup["comparisons"][number]["treatment"]
): PopulationView {
  // EXHAUSTIVE BY CONSTRUCTION: the `never` assignment below is what turns a
  // fourth state added to `Population` into a red typecheck instead of a state
  // this screen renders as nothing. R12's whole property is that "absent" has
  // a shape of its own, so a new absence shape must not fall through.
  switch (population.state) {
    case "present":
      return {
        state: "present",
        n: population.n,
        medianPer1k: population.medianPer1k,
        resultIds: population.resultIds,
      };
    case "short":
      return {
        state: "short",
        n: population.n,
        needed: population.needed,
        resultIds: population.resultIds,
      };
    case "none":
      return {
        state: "none",
        n: 0,
        needed: population.needed,
        resultIds: population.resultIds,
      };
    // THE FOURTH STATE (2026-09-04). Carried across as its own variant rather
    // than mapped onto "short": `atLeast` is a FLOOR and `n` is a count, and
    // the whole reason the package split them is that a floor printed as a
    // count tells a creator their history is thin when it is merely unread.
    case "truncated":
      return {
        state: "truncated",
        atLeast: population.atLeast,
        resultIds: population.resultIds,
      };
    default: {
      const unreachable: never = population;
      return unreachable;
    }
  }
}

function leverComparisonView(
  comparison: StoredComparisonGroup["comparisons"][number]
): LeverComparisonView {
  return {
    lever: comparison.lever,
    treatment: populationView(comparison.treatment),
    baseline: populationView(comparison.baseline),
    // CARRIED, NEVER RE-DERIVED. `effectPer1k` is null unless both populations
    // are present; a screen computing `treatment - baseline` itself would be
    // the second arithmetic C5 exists to prevent, and it would produce a
    // number in exactly the case the contract says there is none.
    effectPer1k: comparison.effectPer1k,
    // CARRIED, NOT RE-DERIVED, for the same reason as the line above: the
    // package computes which way a signed delta reads once the declared
    // direction is known, and a screen doing that arithmetic again is a second
    // author for one rule.
    improvement: comparison.improvement,
    direction: comparison.direction,
    unit: comparison.unit,
    confoundersPresent: comparison.confoundersPresent,
  };
}

export function comparisonGroupView(
  group: StoredComparisonGroup
): ComparisonGroupView {
  return {
    treatmentKey: group.treatmentKey,
    platform: group.stratum.platform,
    audienceClass: group.stratum.audienceClass,
    metricKey: group.stratum.metricKey,
    metricDeclaredByDocIds: group.stratum.metricDeclaredByDocIds,
    observedFrom: isoDay(group.stratum.observedFrom),
    observedTo: isoDay(group.stratum.observedTo),
    levers: group.comparisons.map(leverComparisonView),
  };
}

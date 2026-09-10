// SLICE 9A, C5 — one test per pinned rule, and the rules are pinned SEPARATELY
// on purpose.
//
// A single test that happens to cover four rules is a test that goes red for a
// reason nobody can name, and stays green when three of the four break in a
// way the fourth compensates for. So each of C5's seven rules has its own
// `describe` naming it, and where a rule is TWO claims (rule 3) it has two
// cases, because "an implementation can satisfy the first and silently fail
// the second".
//
// EVERY FIXTURE DISCRIMINATES, which is a stronger requirement than "every
// fixture is realistic". A median test whose numbers make median and mean
// agree proves nothing; a paid/organic test whose two classes have the same
// values cannot see pooling. The numbers below were chosen so that the WRONG
// implementation produces a DIFFERENT number, and each case says which wrong
// implementation it is watching for.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ComparisonInputError,
  MIN_COMPARABLE_RESULTS,
  buildComparisonGroups,
  buildLeverComparisons,
  metricDeclarationKey,
  type ComparisonGroup,
  type DeclaredMetric,
  type ComparisonStratum,
  type LeverComparison,
  type Population,
} from "../src/comparison";
import type { ComparisonResultInput, MetricDirection } from "../src/vocabulary";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STRATUM: ComparisonStratum = {
  profileId: "profile-1",
  platform: "youtube_shorts",
  audienceClass: "organic",
  metricKey: "follows",
  metricDeclaredByDocIds: ["strategy-v3"],
  observedFrom: new Date("2026-08-01T00:00:00Z"),
  observedTo: new Date("2026-09-01T00:00:00Z"),
};

/** A treatment key of the shape C4 composes: framework@version | mode | activation | metric. */
const TREATMENT = "fw-hook@3|hook_variations|activation-1|follows";
const OTHER_TREATMENT = "fw-cta@1|hook_variations|activation-1|follows";

function result(
  overrides: Partial<ComparisonResultInput> & { id: string }
): ComparisonResultInput {
  return {
    profileId: "profile-1",
    platform: "youtube_shorts",
    audienceClass: "organic",
    metricKey: "follows",
    metricDeclaredByDocId: "strategy-v3",
    observedFrom: new Date("2026-08-05T00:00:00Z"),
    observedTo: new Date("2026-08-12T00:00:00Z"),
    treatmentKey: null,
    // VERIFIED BY DEFAULT since R-115 (Phase 10a): the only numerical state.
    // Cases about the other two states set them explicitly.
    evidenceState: "connector_verified",
    reachValue: null,
    reachDenominator: null,
    conversionValue: null,
    conversionDenominator: null,
    confounders: [],
    ...overrides,
  };
}

/**
 * A row whose REACH per-1k is exactly `per1k`. The denominator is 1000 so the
 * arithmetic is legible in the fixture; the per-1k rule itself is pinned
 * against non-round denominators in its own case, where legibility would hide
 * the thing being tested.
 */
function reach(
  id: string,
  per1k: number,
  overrides: Partial<ComparisonResultInput> = {}
): ComparisonResultInput {
  return result({
    id,
    reachValue: String(per1k),
    reachDenominator: "1000",
    ...overrides,
  });
}

function conversion(
  id: string,
  per1k: number,
  overrides: Partial<ComparisonResultInput> = {}
): ComparisonResultInput {
  return result({
    id,
    conversionValue: String(per1k),
    conversionDenominator: "1000",
    ...overrides,
  });
}

function build(
  results: readonly ComparisonResultInput[],
  overrides: Partial<{
    stratum: ComparisonStratum;
    treatmentKey: string;
    metricDirection: MetricDirection;
    metricUnit: string;
    resultsTruncated: boolean;
  }> = {}
): LeverComparison[] {
  return buildLeverComparisons({
    stratum: STRATUM,
    treatmentKey: TREATMENT,
    results,
    metricDirection: "higher_is_better",
    metricUnit: "follows per 1k views",
    // THE DEFAULT IS "THE CALLER READ EVERYTHING", which is what every case
    // written before truncation existed meant. The parameter itself is
    // REQUIRED at the builder — this default lives in the test helper, not in
    // the module — and the truncated block below drives the other branch, so
    // both paths have a witness (CLAUDE.md 2026-08-26).
    resultsTruncated: false,
    ...overrides,
  });
}

const reachOf = (comparisons: LeverComparison[]): LeverComparison =>
  comparisons.find((comparison) => comparison.lever === "reach")!;
const conversionOf = (comparisons: LeverComparison[]): LeverComparison =>
  comparisons.find((comparison) => comparison.lever === "conversion")!;

/**
 * A population whose `n` is a COUNT — everything except `truncated`, whose
 * `atLeast` is a floor.
 *
 * This exists because the union deliberately has no uniform `n`: a test that
 * reads a count off a clipped population is making the same mistake a screen
 * would, so it throws here instead of quietly comparing a floor.
 */
type CountedPopulation = Exclude<Population, { state: "truncated" }>;

function counted(population: Population): CountedPopulation {
  if (population.state === "truncated") {
    throw new Error(
      "expected a counted population, got `truncated` — its size is a floor, not a count"
    );
  }
  return population;
}

/** The median a `present` population reports, or `null` for the two absence states. */
function medianOrNull(population: Population): number | null {
  return population.state === "present" ? population.medianPer1k : null;
}

/** Three treatment rows and three baseline rows, all reach, all comparable. */
function sixComparableReachResults(): ComparisonResultInput[] {
  return [
    reach("t1", 40, { treatmentKey: TREATMENT }),
    reach("t2", 50, { treatmentKey: TREATMENT }),
    reach("t3", 60, { treatmentKey: TREATMENT }),
    reach("b1", 10, { treatmentKey: OTHER_TREATMENT }),
    reach("b2", 20, { treatmentKey: null }),
    reach("b3", 30, { treatmentKey: OTHER_TREATMENT }),
  ];
}

// ---------------------------------------------------------------------------
// C5 RULE 1 — MEDIAN, NEVER MEAN
// ---------------------------------------------------------------------------

describe("C5 rule 1: the median, never the mean", () => {
  it("takes the MIDDLE value of an odd population, not its average", () => {
    // THE DISCRIMINATOR: 10, 20, 300 has median 20 and mean 110. A fixture
    // where the two agree is a fixture that cannot see this defect at all,
    // which is the whole reason the outlier is here — "one outlier is exactly
    // what a creator is trying to find".
    const comparisons = build([
      reach("t1", 10, { treatmentKey: TREATMENT }),
      reach("t2", 20, { treatmentKey: TREATMENT }),
      reach("t3", 300, { treatmentKey: TREATMENT }),
    ]);
    expect(medianOrNull(reachOf(comparisons).treatment)).toBe(20);
    expect(medianOrNull(reachOf(comparisons).treatment)).not.toBe(110);
  });

  it("averages the two middle values of an even population, and still is not the mean", () => {
    // 10, 20, 30, 300: median 25, mean 90. The even case has its own fixture
    // because "average the middle two" is the one branch a median can get
    // wrong while the odd case stays green.
    const comparisons = build([
      reach("t1", 10, { treatmentKey: TREATMENT }),
      reach("t2", 20, { treatmentKey: TREATMENT }),
      reach("t3", 30, { treatmentKey: TREATMENT }),
      reach("t4", 300, { treatmentKey: TREATMENT }),
    ]);
    expect(medianOrNull(reachOf(comparisons).treatment)).toBe(25);
    expect(medianOrNull(reachOf(comparisons).treatment)).not.toBe(90);
  });

  it("is order-independent — an unsorted input medians the same as a sorted one", () => {
    const values = [300, 10, 20];
    const comparisons = build(
      values.map((value, index) => reach(`t${index}`, value, { treatmentKey: TREATMENT }))
    );
    expect(medianOrNull(reachOf(comparisons).treatment)).toBe(20);
  });

  it("the BASELINE medians too — the rule is not treatment-only", () => {
    const comparisons = build([
      reach("t1", 1, { treatmentKey: TREATMENT }),
      reach("t2", 1, { treatmentKey: TREATMENT }),
      reach("t3", 1, { treatmentKey: TREATMENT }),
      reach("b1", 10, { treatmentKey: OTHER_TREATMENT }),
      reach("b2", 20, { treatmentKey: OTHER_TREATMENT }),
      reach("b3", 300, { treatmentKey: OTHER_TREATMENT }),
    ]);
    expect(medianOrNull(reachOf(comparisons).baseline)).toBe(20);
    expect(medianOrNull(reachOf(comparisons).baseline)).not.toBe(110);
  });
});

// ---------------------------------------------------------------------------
// C5 RULE 2 — PER 1K
// ---------------------------------------------------------------------------

describe("C5 rule 2: per 1k = value / denominator * 1000", () => {
  it("normalises EACH ROW against its OWN denominator", () => {
    // THE DISCRIMINATOR: three different denominators. Per-row normalisation
    // gives 0.125, 0.25, 0.5 per 1k and a median of 0.25; the wrong
    // implementation — summing values and summing denominators, i.e. a POOLED
    // rate — gives 3 / 14000 * 1000 ≈ 0.2143. Equal denominators could not
    // tell the two apart, which is why none of these three match.
    const comparisons = build([
      result({ id: "t1", treatmentKey: TREATMENT, reachValue: "1", reachDenominator: "8000" }),
      result({ id: "t2", treatmentKey: TREATMENT, reachValue: "1", reachDenominator: "4000" }),
      result({ id: "t3", treatmentKey: TREATMENT, reachValue: "1", reachDenominator: "2000" }),
    ]);
    expect(medianOrNull(reachOf(comparisons).treatment)).toBe(0.25);
    expect(medianOrNull(reachOf(comparisons).treatment)).not.toBeCloseTo(
      (3 / 14000) * 1000,
      6
    );
  });

  it("does not round: a fractional per-1k stays fractional", () => {
    const comparisons = build([
      result({ id: "t1", treatmentKey: TREATMENT, reachValue: "7", reachDenominator: "3500" }),
      result({ id: "t2", treatmentKey: TREATMENT, reachValue: "7", reachDenominator: "3500" }),
      result({ id: "t3", treatmentKey: TREATMENT, reachValue: "7", reachDenominator: "3500" }),
    ]);
    expect(medianOrNull(reachOf(comparisons).treatment)).toBe(2);

    const fractional = build([
      result({ id: "t1", treatmentKey: TREATMENT, reachValue: "1", reachDenominator: "3000" }),
      result({ id: "t2", treatmentKey: TREATMENT, reachValue: "1", reachDenominator: "3000" }),
      result({ id: "t3", treatmentKey: TREATMENT, reachValue: "1", reachDenominator: "3000" }),
    ]);
    expect(medianOrNull(reachOf(fractional).treatment)).toBeCloseTo(1 / 3, 12);
  });

  it("REFUSES a denominator of zero — undefined, not small (M16)", () => {
    expect(() =>
      build([
        result({ id: "t1", treatmentKey: TREATMENT, reachValue: "5", reachDenominator: "0" }),
      ])
    ).toThrow(ComparisonInputError);
    // ...and never returns Infinity or NaN instead.
    expect(() =>
      build([
        result({ id: "t1", treatmentKey: TREATMENT, reachValue: "5", reachDenominator: "-1000" }),
      ])
    ).toThrow(/greater than zero/);
  });

  it("REFUSES half a pair, and anything that is not a finite number", () => {
    expect(() =>
      build([result({ id: "t1", treatmentKey: TREATMENT, reachValue: "5", reachDenominator: null })])
    ).toThrow(/half a pair/);
    expect(() =>
      build([result({ id: "t1", treatmentKey: TREATMENT, reachValue: null, reachDenominator: "1000" })])
    ).toThrow(/half a pair/);
    expect(() =>
      build([result({ id: "t1", treatmentKey: TREATMENT, reachValue: "abc", reachDenominator: "1000" })])
    ).toThrow(/finite number/);
  });

  it("a row reporting only ONE lever is not an error — it is an ordinary result", () => {
    // The discrimination that makes the refusals above safe: "no numbers for
    // this lever" and "half a pair" are different facts, and only the second
    // is a broken row.
    const comparisons = build([
      reach("t1", 10, { treatmentKey: TREATMENT }),
      reach("t2", 20, { treatmentKey: TREATMENT }),
      reach("t3", 30, { treatmentKey: TREATMENT }),
    ]);
    expect(reachOf(comparisons).treatment.state).toBe("present");
    expect(conversionOf(comparisons).treatment.state).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// C5 RULE 3 — THE BASELINE'S TWO EXCLUSIONS, ASSERTED SEPARATELY
// ---------------------------------------------------------------------------

describe("C5 rule 3 (first claim): the baseline excludes the TREATMENT COHORT", () => {
  it("no id in the baseline appears in the treatment cohort", () => {
    const comparison = reachOf(build(sixComparableReachResults()));
    expect(comparison.treatment.resultIds).toEqual(["t1", "t2", "t3"]);
    expect(comparison.baseline.resultIds).toEqual(["b1", "b2", "b3"]);
    const overlap = comparison.baseline.resultIds.filter((id) =>
      comparison.treatment.resultIds.includes(id)
    );
    expect(overlap, "a result cannot be its own baseline").toEqual([]);
  });

  it("the two populations partition the eligible rows — nothing is counted twice", () => {
    const comparison = reachOf(build(sixComparableReachResults()));
    const all = [...comparison.treatment.resultIds, ...comparison.baseline.resultIds];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("C5 rule 3 (second claim): the baseline excludes every result CARRYING THE TREATMENT KEY", () => {
  it("no baseline id belongs to a row whose key is the treatment key", () => {
    // ASSERTED AGAINST THE INPUT, not against the output's own cohort list —
    // otherwise this case would only be restating the first claim in different
    // words. The predicate is read off the fixture rows.
    const results = sixComparableReachResults();
    const byId = new Map(results.map((row) => [row.id, row]));
    const comparison = reachOf(build(results));
    const carriers = comparison.baseline.resultIds.filter(
      (id) => byId.get(id)!.treatmentKey === TREATMENT
    );
    expect(carriers, "a result of the thing being tested is not part of its own baseline").toEqual([]);
  });

  it("a key-carrying row that is NOT in the treatment population is STILL not in the baseline", () => {
    // The case the first claim cannot reach: `x` carries the treatment key and
    // is excluded from the cohort for a DIFFERENT reason (it is unquantified,
    // C5 rule 4). If the baseline's key exclusion were absent and only the
    // cohort-id exclusion remained, this row is the one that would leak in.
    const results = [
      ...sixComparableReachResults(),
      // The database's `results_lever_columns_match_evidence_state` CHECK
      // forbids this row. It is constructed anyway, because this builder must
      // not be relying on a CHECK in another package to hold its own rule.
      reach("x", 999, { treatmentKey: TREATMENT, evidenceState: "unquantified" }),
    ];
    const comparison = reachOf(build(results));
    expect(comparison.baseline.resultIds).not.toContain("x");
    expect(comparison.treatment.resultIds).not.toContain("x");
  });

  it("a result with NO treatment key is baseline-eligible and never in the cohort (C4)", () => {
    // C4: "A result with no generationId therefore has no derivable treatment
    // key… eligible for the baseline, never for a treatment cohort."
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("k1", 10, { treatmentKey: null }),
        reach("k2", 20, { treatmentKey: null }),
        reach("k3", 30, { treatmentKey: null }),
      ])
    );
    expect(comparison.treatment.resultIds).toEqual(["t1", "t2", "t3"]);
    expect(comparison.baseline.resultIds).toEqual(["k1", "k2", "k3"]);
  });

  it("a BLANK key is 'no key', never a cohort of its own", () => {
    // An empty string in a NOT NULL column is the fabricated key C4 forbids
    // wearing a different shape: three keyless results sharing `''` would
    // otherwise form a cohort of three unrelated posts.
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("e1", 10, { treatmentKey: "" }),
        reach("e2", 20, { treatmentKey: "   " }),
        reach("e3", 30, { treatmentKey: "" }),
      ])
    );
    expect(comparison.treatment.resultIds).toEqual(["t1", "t2", "t3"]);
    expect(comparison.baseline.resultIds).toEqual(["e1", "e2", "e3"]);
  });

  it("REFUSES a blank treatment key argument — a comparison must be ABOUT something", () => {
    expect(() => build(sixComparableReachResults(), { treatmentKey: "  " })).toThrow(
      ComparisonInputError
    );
  });
});

// ---------------------------------------------------------------------------
// C5 RULE 4 — `unquantified` NEVER ENTERS A NUMERICAL COHORT
// ---------------------------------------------------------------------------

describe("C5 rule 4: `unquantified` never enters a numerical cohort, on either side", () => {
  it("excludes an unquantified row EVEN WHEN IT CARRIES NUMBERS", () => {
    // THE POINT OF THE SMUGGLED ROW. If the fixture's unquantified rows had
    // NULL levers — the only shape the database permits — they would be
    // excluded by "reports no lever" and this case would pass with the
    // evidence-state filter deleted. That is the M2 mutation surviving a green
    // test. So the rows below carry numbers the database would refuse, and the
    // filter is the only thing that can exclude them (CLAUDE.md 2026-08-21:
    // proving a thing cannot be TYPED is not proving it cannot be CAST).
    const clean = build(sixComparableReachResults());
    const smuggled = build([
      ...sixComparableReachResults(),
      reach("u1", 5000, { treatmentKey: TREATMENT, evidenceState: "unquantified" }),
      reach("u2", 5000, { treatmentKey: OTHER_TREATMENT, evidenceState: "unquantified" }),
    ]);

    expect(reachOf(smuggled).treatment.resultIds).toEqual(["t1", "t2", "t3"]);
    expect(reachOf(smuggled).baseline.resultIds).toEqual(["b1", "b2", "b3"]);
    expect(counted(reachOf(smuggled).treatment).n).toBe(3);
    expect(counted(reachOf(smuggled).baseline).n).toBe(3);
    expect(medianOrNull(reachOf(smuggled).treatment)).toBe(
      medianOrNull(reachOf(clean).treatment)
    );
    expect(medianOrNull(reachOf(smuggled).baseline)).toBe(
      medianOrNull(reachOf(clean).baseline)
    );
  });

  it("an unquantified row cannot make a SHORT population reach the minimum", () => {
    // The consequence that matters to a creator: two real results plus one
    // unlabelled one is still two results.
    const comparison = reachOf(
      build([
        reach("t1", 10, { treatmentKey: TREATMENT }),
        reach("t2", 20, { treatmentKey: TREATMENT }),
        reach("u1", 30, { treatmentKey: TREATMENT, evidenceState: "unquantified" }),
      ])
    );
    expect(comparison.treatment.state).toBe("short");
    expect(counted(comparison.treatment).n).toBe(2);
  });

  it("`quantified_self_reported` is NOT numerical (R-115): it enters neither population, on either side", () => {
    const comparison = reachOf(
      build([
        reach("t1", 10, { treatmentKey: TREATMENT }),
        reach("t2", 20, { treatmentKey: TREATMENT }),
        reach("s1", 30, { treatmentKey: TREATMENT, evidenceState: "quantified_self_reported" }),
        reach("b1", 5),
        reach("b2", 6),
        reach("sb", 7, { evidenceState: "quantified_self_reported" }),
      ])
    );
    expect(comparison.treatment.state).toBe("short");
    expect(counted(comparison.treatment).n).toBe(2);
    expect(comparison.baseline.state).toBe("short");
    expect(counted(comparison.baseline).n).toBe(2);
  });

  it("R-115 BYTE-IDENTITY: adding, changing or deleting a self-reported row leaves every verified derivative byte-identical", () => {
    const clean = [
      reach("t1", 10, { treatmentKey: TREATMENT }),
      reach("t2", 20, { treatmentKey: TREATMENT }),
      reach("t3", 30, { treatmentKey: TREATMENT }),
      reach("b1", 5),
      reach("b2", 6),
      reach("b3", 7),
    ];
    const baseline = JSON.stringify(build(clean));
    // NON-VACUITY: the same rows, admitted as verified, DO move the numbers.
    const admitted = JSON.stringify(build([...clean, reach("x1", 1000, { treatmentKey: TREATMENT }), reach("x2", 1, {})]));
    expect(admitted).not.toBe(baseline);
    const added = build([...clean, reach("x1", 1000, { treatmentKey: TREATMENT, evidenceState: "quantified_self_reported" }), reach("x2", 1, { evidenceState: "quantified_self_reported" })]);
    expect(JSON.stringify(added)).toBe(baseline);
    const changed = build([...clean, reach("x1", 2, { treatmentKey: TREATMENT, evidenceState: "quantified_self_reported" })]);
    expect(JSON.stringify(changed)).toBe(baseline);
    const groups = (rows: ComparisonResultInput[]) =>
      JSON.stringify(buildComparisonGroups({ profileId: STRATUM.profileId, results: rows, truncated: false, declaredMetrics: METRICS }));
    expect(groups([...clean, reach("x1", 1000, { treatmentKey: TREATMENT, evidenceState: "quantified_self_reported" })])).toBe(groups(clean));
  });

  it("`connector_verified` IS numerical — the one state the allowlist admits", () => {
    const comparison = reachOf(
      build([
        reach("t1", 10, { treatmentKey: TREATMENT, evidenceState: "connector_verified" }),
        reach("t2", 20, { treatmentKey: TREATMENT, evidenceState: "connector_verified" }),
        reach("t3", 30, { treatmentKey: TREATMENT, evidenceState: "connector_verified" }),
      ])
    );
    expect(comparison.treatment.state).toBe("present");
    expect(counted(comparison.treatment).n).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// C5 RULE 5 — PAID AND ORGANIC NEVER POOL
// ---------------------------------------------------------------------------

describe("C5 rule 5: paid and organic never pool (R13)", () => {
  /** Three organic and three paid results on each side, with DIFFERENT values. */
  function mixedAudienceResults(): ComparisonResultInput[] {
    return [
      reach("org-t1", 40, { treatmentKey: TREATMENT }),
      reach("org-t2", 50, { treatmentKey: TREATMENT }),
      reach("org-t3", 60, { treatmentKey: TREATMENT }),
      reach("org-b1", 10, { treatmentKey: OTHER_TREATMENT }),
      reach("org-b2", 20, { treatmentKey: OTHER_TREATMENT }),
      reach("org-b3", 30, { treatmentKey: OTHER_TREATMENT }),
      reach("paid-t1", 400, { treatmentKey: TREATMENT, audienceClass: "paid" }),
      reach("paid-t2", 500, { treatmentKey: TREATMENT, audienceClass: "paid" }),
      reach("paid-t3", 600, { treatmentKey: TREATMENT, audienceClass: "paid" }),
      reach("paid-b1", 100, { treatmentKey: OTHER_TREATMENT, audienceClass: "paid" }),
      reach("paid-b2", 200, { treatmentKey: OTHER_TREATMENT, audienceClass: "paid" }),
      reach("paid-b3", 300, { treatmentKey: OTHER_TREATMENT, audienceClass: "paid" }),
    ];
  }

  it("TWO comparisons or none, never one merged — each stratum sees only its own class", () => {
    const results = mixedAudienceResults();
    const organic = reachOf(build(results));
    const paid = reachOf(
      build(results, { stratum: { ...STRATUM, audienceClass: "paid" } })
    );

    // The merged number a pooling implementation would report is 6 per side.
    // Neither run may report it.
    expect(counted(organic.treatment).n).toBe(3);
    expect(counted(organic.baseline).n).toBe(3);
    expect(counted(paid.treatment).n).toBe(3);
    expect(counted(paid.baseline).n).toBe(3);

    expect(medianOrNull(organic.treatment)).toBe(50);
    expect(medianOrNull(organic.baseline)).toBe(20);
    expect(medianOrNull(paid.treatment)).toBe(500);
    expect(medianOrNull(paid.baseline)).toBe(200);
  });

  it("the two runs' id sets are DISJOINT — no result appears in both classes", () => {
    const results = mixedAudienceResults();
    const organic = reachOf(build(results));
    const paid = reachOf(build(results, { stratum: { ...STRATUM, audienceClass: "paid" } }));
    const organicIds = [...organic.treatment.resultIds, ...organic.baseline.resultIds];
    const paidIds = [...paid.treatment.resultIds, ...paid.baseline.resultIds];
    expect(organicIds.filter((id) => paidIds.includes(id))).toEqual([]);
    expect(organicIds.every((id) => id.startsWith("org-"))).toBe(true);
    expect(paidIds.every((id) => id.startsWith("paid-"))).toBe(true);
  });

  it("a paid result cannot rescue a SHORT organic cohort", () => {
    const comparison = reachOf(
      build([
        reach("org-t1", 40, { treatmentKey: TREATMENT }),
        reach("org-t2", 50, { treatmentKey: TREATMENT }),
        reach("paid-t1", 60, { treatmentKey: TREATMENT, audienceClass: "paid" }),
      ])
    );
    expect(comparison.treatment.state).toBe("short");
    expect(counted(comparison.treatment).n).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// C5 RULE 6 — ABSENT IS NEVER ZERO
// ---------------------------------------------------------------------------

describe("C5 rule 6: absent is never zero (R12)", () => {
  it("below the minimum a population is `short`, carries no median, and names how many more it needs", () => {
    const comparison = reachOf(
      build([
        reach("t1", 10, { treatmentKey: TREATMENT }),
        reach("t2", 20, { treatmentKey: TREATMENT }),
        reach("b1", 1, { treatmentKey: OTHER_TREATMENT }),
        reach("b2", 2, { treatmentKey: OTHER_TREATMENT }),
        reach("b3", 3, { treatmentKey: OTHER_TREATMENT }),
      ])
    );
    expect(comparison.treatment.state).toBe("short");
    expect(counted(comparison.treatment).n).toBe(2);
    expect(comparison.treatment).toMatchObject({ needed: 1 });
    // THE STRUCTURAL HALF: a short population carries NO number a caller could
    // draw as a bar. Asserted on the object, not on the type, because the type
    // is erased at runtime and a cast is all it takes to get past it.
    expect(Object.keys(comparison.treatment)).not.toContain("medianPer1k");
    expect(comparison.effectPer1k).toBeNull();
  });

  it("an EMPTY population is `none`, with no ids and no median — not a zero", () => {
    const comparison = reachOf(
      build([
        reach("t1", 10, { treatmentKey: TREATMENT }),
        reach("t2", 20, { treatmentKey: TREATMENT }),
        reach("t3", 30, { treatmentKey: TREATMENT }),
      ])
    );
    expect(comparison.baseline).toEqual({
      state: "none",
      n: 0,
      needed: MIN_COMPARABLE_RESULTS,
      resultIds: [],
    });
    expect(Object.keys(comparison.baseline)).not.toContain("medianPer1k");
    expect(comparison.effectPer1k).toBeNull();
  });

  it("ONE result: a named absence on both sides, and no number anywhere to draw at zero", () => {
    const comparisons = build([reach("t1", 42, { treatmentKey: TREATMENT })]);
    for (const comparison of comparisons) {
      expect(comparison.effectPer1k).toBeNull();
      for (const population of [comparison.treatment, comparison.baseline]) {
        expect(population.state === "present").toBe(false);
        expect(Object.keys(population)).not.toContain("medianPer1k");
      }
    }
    // Whatever a caller serialises, there is no median in it.
    expect(JSON.stringify(comparisons)).not.toContain("medianPer1k");
  });

  it("`needed` is always MIN minus n, at every size below the minimum", () => {
    for (let n = 0; n < MIN_COMPARABLE_RESULTS; n += 1) {
      const comparison = reachOf(
        build(
          Array.from({ length: n }, (_unused, index) =>
            reach(`t${index}`, 10, { treatmentKey: TREATMENT })
          )
        )
      );
      const population = comparison.treatment;
      expect(population.state).toBe(n === 0 ? "none" : "short");
      expect(population).toMatchObject({ n, needed: MIN_COMPARABLE_RESULTS - n });
    }
  });

  it("there are exactly THREE states — the shape `spendVisibility` uses, not a fourth", () => {
    const seen = new Set<string>();
    const fixtures: ComparisonResultInput[][] = [
      [],
      [reach("t1", 10, { treatmentKey: TREATMENT })],
      sixComparableReachResults(),
    ];
    for (const fixture of fixtures) {
      for (const comparison of build(fixture)) {
        seen.add(comparison.treatment.state);
        seen.add(comparison.baseline.state);
      }
    }
    expect([...seen].sort()).toEqual(["none", "present", "short"]);
  });

  it("an effect exists ONLY when both populations are present", () => {
    const both = reachOf(build(sixComparableReachResults()));
    expect(both.treatment.state).toBe("present");
    expect(both.baseline.state).toBe("present");
    // 50 - 20 = 30. The PLAIN difference: `direction` carries "better", the
    // number does not.
    expect(both.effectPer1k).toBe(30);

    const onlyTreatment = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("b1", 10, { treatmentKey: OTHER_TREATMENT }),
      ])
    );
    expect(onlyTreatment.baseline.state).toBe("short");
    expect(onlyTreatment.effectPer1k).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A TRUNCATED POPULATION IS A NAMED STATE, NEVER A COMPLETE ONE
// ---------------------------------------------------------------------------

describe("a clipped read is `truncated`, and never mistaken for a counted one", () => {
  // THE DEFECT THIS BLOCK EXISTS FOR, stated so nobody later reads it as
  // defensive: the scoped reader clamps at a page size, so a creator past that
  // many logged results had a cohort and a baseline computed over their most
  // recent page — and the screen said "n = 3, 2 more needed" about a PAGE
  // while calling it a history. Nothing failed. That is CLAUDE.md's
  // 2026-08-29 derived-guard-population lesson landing on the one screen whose
  // job is honesty about how much evidence there is.
  //
  // THE FIX IS NOT A BIGGER PAGE. It is that "we did not count everything" is
  // a state a screen has to handle, so a number nobody can stand behind is not
  // reachable to render.

  it("names the state — and it is NOT `short`, which claims the counting finished", () => {
    // The two sentences are opposites: `short` says the creator's history is
    // thin; `truncated` says we stopped reading it. Telling a creator with 300
    // results that they need 1 more is the worse of the two errors.
    const clipped = reachOf(build(sixComparableReachResults(), { resultsTruncated: true }));
    expect(clipped.treatment.state).toBe("truncated");
    expect(clipped.baseline.state).toBe("truncated");

    const complete = reachOf(build(sixComparableReachResults()));
    expect(complete.treatment.state).toBe("present");
    expect(complete.baseline.state).toBe("present");
  });

  it("carries a FLOOR and the ids it counted, and no `n`, `needed` or `medianPer1k`", () => {
    // What a screen may truthfully say, and what it may not. `atLeast` cannot
    // be misread as a count the way an `n` could; the three fields that are
    // absent are the three a caller would otherwise print as facts.
    const clipped = reachOf(build(sixComparableReachResults(), { resultsTruncated: true }));
    expect(clipped.treatment).toEqual({
      state: "truncated",
      atLeast: 3,
      resultIds: ["t1", "t2", "t3"],
    });
    // Asserted on the OBJECT, not on the type: the type is erased at runtime
    // and a cast is all it takes to get past it.
    for (const population of [clipped.treatment, clipped.baseline]) {
      expect(Object.keys(population).sort()).toEqual(["atLeast", "resultIds", "state"]);
    }
  });

  it("has NO effect and NO verdict — a delta between two floors is not a delta", () => {
    // The promise in one case. Both populations would otherwise be `present`
    // with medians 50 and 20 and a delta of 30, so this is a fixture where the
    // wrong implementation has a specific wrong number to produce.
    const clipped = reachOf(build(sixComparableReachResults(), { resultsTruncated: true }));
    expect(clipped.effectPer1k).toBeNull();
    expect(clipped.improvement).toBeNull();
    const complete = reachOf(build(sixComparableReachResults()));
    expect(complete.effectPer1k).toBe(30);
    expect(complete.improvement).toBe("better");
  });

  it("DOMINATES `none`: a clipped read that found nothing has not found nothing", () => {
    // The state that is easiest to get wrong, because zero rows looks like an
    // answer. It is not: the rows that would have qualified may be exactly the
    // ones the reader stopped before, and they carry no key to tell us.
    const clipped = build([reach("t1", 10, { treatmentKey: TREATMENT })], {
      resultsTruncated: true,
    });
    for (const comparison of clipped) {
      expect(comparison.baseline.state).toBe("truncated");
      expect(comparison.baseline).toMatchObject({ atLeast: 0, resultIds: [] });
    }
    // The conversion lever has no rows at all in this fixture, and is still
    // truncated rather than a counted zero.
    expect(conversionOf(clipped).treatment.state).toBe("truncated");
  });

  it("clips BOTH sides and BOTH levers together — a clipped read names no side", () => {
    // A clipped page does not say which population lost rows, so a comparison
    // built from one side is a comparison built from neither.
    const clipped = build(
      [
        ...sixComparableReachResults(),
        conversion("c1", 1, { treatmentKey: TREATMENT }),
        conversion("c2", 2, { treatmentKey: TREATMENT }),
        conversion("c3", 3, { treatmentKey: TREATMENT }),
      ],
      { resultsTruncated: true }
    );
    expect(clipped).toHaveLength(2);
    for (const comparison of clipped) {
      expect(comparison.treatment.state).toBe("truncated");
      expect(comparison.baseline.state).toBe("truncated");
      expect(comparison.effectPer1k).toBeNull();
      expect(comparison.improvement).toBeNull();
    }
  });

  it("the four states are the whole vocabulary — no fifth, and `truncated` is reachable", () => {
    // A state nothing produces is a state that does not exist; a state the
    // union admits and no fixture reaches is one nobody has rendered.
    const seen = new Set<string>();
    const fixtures: { rows: ComparisonResultInput[]; truncated: boolean }[] = [
      { rows: [], truncated: false },
      { rows: [reach("t1", 10, { treatmentKey: TREATMENT })], truncated: false },
      { rows: sixComparableReachResults(), truncated: false },
      { rows: sixComparableReachResults(), truncated: true },
    ];
    for (const fixture of fixtures) {
      for (const comparison of build(fixture.rows, { resultsTruncated: fixture.truncated })) {
        seen.add(comparison.treatment.state);
        seen.add(comparison.baseline.state);
      }
    }
    expect([...seen].sort()).toEqual(["none", "present", "short", "truncated"]);
  });

  it("changes NOTHING when the caller reports a complete read", () => {
    // The other half of a required boolean: passing `false` must be the same
    // computation as before it existed. Without this, "truncate everything
    // always" passes every case above.
    const rows = sixComparableReachResults();
    expect(build(rows, { resultsTruncated: false })).toEqual(build(rows));
    expect(reachOf(build(rows, { resultsTruncated: false })).treatment).toEqual({
      state: "present",
      n: 3,
      medianPer1k: 50,
      resultIds: ["t1", "t2", "t3"],
    });
  });
});

// ---------------------------------------------------------------------------
// C5 RULE 7 — REACH AND CONVERSION ARE SEPARATE AND NEVER SUMMED
// ---------------------------------------------------------------------------

describe("C5 rule 7: reach and conversion never collapse into one score (R9)", () => {
  /** Rows reporting BOTH levers, with values chosen so a sum is detectable. */
  function twoLeverResults(): ComparisonResultInput[] {
    return [
      result({
        id: "t1",
        treatmentKey: TREATMENT,
        reachValue: "10",
        reachDenominator: "1000",
        conversionValue: "1",
        conversionDenominator: "1000",
      }),
      result({
        id: "t2",
        treatmentKey: TREATMENT,
        reachValue: "20",
        reachDenominator: "1000",
        conversionValue: "2",
        conversionDenominator: "1000",
      }),
      result({
        id: "t3",
        treatmentKey: TREATMENT,
        reachValue: "30",
        reachDenominator: "1000",
        conversionValue: "3",
        conversionDenominator: "1000",
      }),
    ];
  }

  it("returns one comparison PER LEVER, always both, in a fixed order", () => {
    const comparisons = build(twoLeverResults());
    expect(comparisons.map((comparison) => comparison.lever)).toEqual(["reach", "conversion"]);
  });

  it("each lever's median comes from its OWN numbers — 20 and 2, never 22", () => {
    const comparisons = build(twoLeverResults());
    expect(medianOrNull(reachOf(comparisons).treatment)).toBe(20);
    expect(medianOrNull(conversionOf(comparisons).treatment)).toBe(2);
    const medians = comparisons.map((comparison) => medianOrNull(comparison.treatment));
    expect(medians, "a summed score would be 22").not.toContain(22);
  });

  it("no field on a comparison holds both levers — the key set is pinned", () => {
    // An added `score` or `total` would show up here before it showed up on a
    // screen. The list is a pin, not a description: changing it is a decision
    // somebody has to make on purpose.
    const comparison = reachOf(build(twoLeverResults()));
    expect(Object.keys(comparison).sort()).toEqual(
      [
        "baseline",
        "confoundersPresent",
        "direction",
        "effectPer1k",
        "improvement",
        "lever",
        "treatment",
        "unit",
      ].sort()
    );
  });

  it("the levers keep separate POPULATIONS too, not just separate medians", () => {
    const comparisons = build([
      ...twoLeverResults(),
      reach("r-only", 99, { treatmentKey: TREATMENT }),
      conversion("c-only", 7, { treatmentKey: TREATMENT }),
      conversion("c-only-2", 8, { treatmentKey: TREATMENT }),
    ]);
    expect(counted(reachOf(comparisons).treatment).n).toBe(4);
    expect(counted(conversionOf(comparisons).treatment).n).toBe(5);
    expect(reachOf(comparisons).treatment.resultIds).not.toContain("c-only");
    expect(conversionOf(comparisons).treatment.resultIds).not.toContain("r-only");
  });
});

// ---------------------------------------------------------------------------
// THE STRATUM'S OTHER PREDICATES, AND THE ONE IT CANNOT EXPRESS
// ---------------------------------------------------------------------------

describe("the stratum predicates (phase-9 question 1)", () => {
  it("another PROFILE's results are excluded, even though the caller is meant to have scoped them", () => {
    // REQ-A03 / R-9. The caller scopes through `withWorkspace`; a pure
    // function that would silently median another creator's results if handed
    // them is one refactor away from being the leak.
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("other", 10, { treatmentKey: OTHER_TREATMENT, profileId: "profile-2" }),
      ])
    );
    expect(counted(comparison.treatment).n).toBe(3);
    expect(comparison.baseline.state).toBe("none");
    expect(JSON.stringify(comparison)).not.toContain("other");
  });

  it("another PLATFORM's results are excluded", () => {
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("reels", 10, { treatmentKey: OTHER_TREATMENT, platform: "instagram_reels" }),
      ])
    );
    expect(comparison.baseline.state).toBe("none");
  });

  it("another METRIC KEY's results are excluded", () => {
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("saves", 10, { treatmentKey: OTHER_TREATMENT, metricKey: "saves" }),
      ])
    );
    expect(comparison.baseline.state).toBe("none");
  });

  it("results observed OUTSIDE the stated window are excluded, on both edges", () => {
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("early", 10, {
          treatmentKey: OTHER_TREATMENT,
          observedFrom: new Date("2026-07-20T00:00:00Z"),
          observedTo: new Date("2026-07-27T00:00:00Z"),
        }),
        reach("late", 20, {
          treatmentKey: OTHER_TREATMENT,
          observedFrom: new Date("2026-09-10T00:00:00Z"),
          observedTo: new Date("2026-09-17T00:00:00Z"),
        }),
        reach("straddling", 30, {
          treatmentKey: OTHER_TREATMENT,
          observedFrom: new Date("2026-08-25T00:00:00Z"),
          observedTo: new Date("2026-09-05T00:00:00Z"),
        }),
      ])
    );
    expect(comparison.baseline.state).toBe("none");
  });

  it("REFUSES a result whose window ends before it starts, and a stratum window that does", () => {
    expect(() =>
      build([
        reach("t1", 40, {
          treatmentKey: TREATMENT,
          observedFrom: new Date("2026-08-12T00:00:00Z"),
          observedTo: new Date("2026-08-05T00:00:00Z"),
        }),
      ])
    ).toThrow(ComparisonInputError);
    expect(() =>
      build(sixComparableReachResults(), {
        stratum: {
          ...STRATUM,
          observedFrom: new Date("2026-09-01T00:00:00Z"),
          observedTo: new Date("2026-08-01T00:00:00Z"),
        },
      })
    ).toThrow(/window must end after it starts/);
  });

  it("REFUSES an empty, duplicate, or cast-smuggled metric document set", () => {
    for (const metricDeclaredByDocIds of [
      [],
      ["strategy-v3", "strategy-v3"],
      ["strategy-v3", ""],
      "strategy-v3",
    ]) {
      expect(() =>
        build(sixComparableReachResults(), {
          stratum: {
            ...STRATUM,
            metricDeclaredByDocIds,
          } as never,
        })
      ).toThrow(ComparisonInputError);
    }
  });

  it("PREDICATE 2 (amendment 1): another metric VERSION is excluded, even sharing the key", () => {
    // Phase-9 question 1: "Same declared north-star metric version — REQ-B03.
    // Historical generations keep the metric they actually used." Two strategy
    // versions can declare the same key, so the KEY alone cannot express this
    // predicate — which is what the contract said until amendment 1, and had no
    // control at all.
    //
    // THE DISCRIMINATOR: every row below shares `metricKey` and differs only in
    // the declaring doc id, so a builder filtering on the key alone reports a
    // cohort of three and a baseline of three, and this case is the only thing
    // that can tell.
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("v4-1", 10, { treatmentKey: OTHER_TREATMENT, metricDeclaredByDocId: "strategy-v4" }),
        reach("v4-2", 20, { treatmentKey: OTHER_TREATMENT, metricDeclaredByDocId: "strategy-v4" }),
        reach("v9-1", 30, { treatmentKey: TREATMENT, metricDeclaredByDocId: "strategy-v9" }),
      ])
    );
    expect(comparison.treatment.resultIds).toEqual(["t1", "t2", "t3"]);
    expect(comparison.baseline.state).toBe("none");
  });

  it("PREDICATE 2 is a PREDICATE, not a relabelling: the same rows pool under their OWN version", () => {
    // The other half, without which the case above passes for a builder that
    // simply refuses everything: run the same fixture against the v4 stratum
    // and the v4 rows are the population.
    const results = [
      reach("t1", 40, { treatmentKey: TREATMENT }),
      reach("v4-t1", 100, { treatmentKey: TREATMENT, metricDeclaredByDocId: "strategy-v4" }),
      reach("v4-t2", 200, { treatmentKey: TREATMENT, metricDeclaredByDocId: "strategy-v4" }),
      reach("v4-t3", 300, { treatmentKey: TREATMENT, metricDeclaredByDocId: "strategy-v4" }),
    ];
    const v4 = reachOf(
      build(results, { stratum: { ...STRATUM, metricDeclaredByDocIds: ["strategy-v4"] } })
    );
    expect(v4.treatment.resultIds).toEqual(["v4-t1", "v4-t2", "v4-t3"]);
    expect(medianOrNull(v4.treatment)).toBe(200);
    // ...and the v3 row never crosses into it, in either direction.
    expect(v4.treatment.resultIds).not.toContain("t1");
    expect(v4.baseline.resultIds).not.toContain("t1");
  });

});

// ---------------------------------------------------------------------------
// CONFOUNDERS, DIRECTION AND UNIT — SHOWN WITH THE COMPARISON, NOT FILED AWAY
// ---------------------------------------------------------------------------

describe("what a comparison carries alongside its numbers", () => {
  it("collects the confounders of the results it is MADE OF, deduplicated and ordered", () => {
    const comparison = reachOf(
      build([
        reach("t1", 40, { treatmentKey: TREATMENT, confounders: ["topic_overlap"] }),
        reach("t2", 50, { treatmentKey: TREATMENT, confounders: ["topic_overlap", "account_growth"] }),
        reach("t3", 60, { treatmentKey: TREATMENT, confounders: [] }),
        reach("b1", 10, { treatmentKey: OTHER_TREATMENT, confounders: ["external_promotion"] }),
        reach("b2", 20, { treatmentKey: OTHER_TREATMENT, confounders: [] }),
        reach("b3", 30, { treatmentKey: OTHER_TREATMENT, confounders: [] }),
      ])
    );
    expect(comparison.confoundersPresent).toEqual([
      "account_growth",
      "external_promotion",
      "topic_overlap",
    ]);
  });

  it("does NOT collect confounders from results the comparison excluded", () => {
    // A caveat about a result that is not in either population is a caveat
    // about nothing, and would make the comparison look weaker than it is for
    // a reason nobody could inspect.
    const comparison = reachOf(
      build([
        ...sixComparableReachResults(),
        reach("excluded", 10, {
          treatmentKey: OTHER_TREATMENT,
          platform: "instagram_reels",
          confounders: ["platform_change"],
        }),
      ])
    );
    expect(comparison.confoundersPresent).not.toContain("platform_change");
  });

  it("carries the declared metric's direction and unit through, unchanged", () => {
    const comparisons = build(sixComparableReachResults(), {
      metricDirection: "lower_is_better",
      metricUnit: "cost per 1k",
    });
    for (const comparison of comparisons) {
      expect(comparison.direction).toBe("lower_is_better");
      expect(comparison.unit).toBe("cost per 1k");
    }
  });

  it("the effect's SIGN is not a verdict — the same NUMBER under both directions", () => {
    // "Carried so a reader can interpret the sign. Never itself an
    // interpretation." A treatment median BELOW the baseline is a worse result
    // under `higher_is_better` and a better one under `lower_is_better`, and
    // `effectPer1k` is the same number in both. The word that differs is
    // `improvement`, pinned in its own block below.
    const higher = reachOf(build(belowBaseline(), { metricDirection: "higher_is_better" }));
    const lower = reachOf(build(belowBaseline(), { metricDirection: "lower_is_better" }));
    expect(higher.effectPer1k).toBe(-40);
    expect(lower.effectPer1k).toBe(-40);
  });
});

// ---------------------------------------------------------------------------
// AMENDMENT 2 — "BETTER" IS DECIDED IN EXACTLY ONE PLACE
// ---------------------------------------------------------------------------

/** Treatment median 10, baseline median 50: a delta of -40. */
function belowBaseline(): ComparisonResultInput[] {
  return [
    reach("t1", 5, { treatmentKey: TREATMENT }),
    reach("t2", 10, { treatmentKey: TREATMENT }),
    reach("t3", 15, { treatmentKey: TREATMENT }),
    reach("b1", 40, { treatmentKey: OTHER_TREATMENT }),
    reach("b2", 50, { treatmentKey: OTHER_TREATMENT }),
    reach("b3", 60, { treatmentKey: OTHER_TREATMENT }),
  ];
}

/** Both populations median 20: a delta of exactly 0. */
function equalMedians(): ComparisonResultInput[] {
  return [
    reach("t1", 10, { treatmentKey: TREATMENT }),
    reach("t2", 20, { treatmentKey: TREATMENT }),
    reach("t3", 30, { treatmentKey: TREATMENT }),
    reach("b1", 15, { treatmentKey: OTHER_TREATMENT }),
    reach("b2", 20, { treatmentKey: OTHER_TREATMENT }),
    reach("b3", 25, { treatmentKey: OTHER_TREATMENT }),
  ];
}

describe("amendment 2: improvement is the one site that decides the word better", () => {
  it("a NEGATIVE delta is `worse` under higher_is_better and `better` under lower_is_better", () => {
    // THE CASE THE ORIGINAL CONTRACT WOULD HAVE GOT BACKWARDS. A
    // direction-normalised `effectPer1k` makes the sign mean "better", which
    // inverts every `lower_is_better` metric — a cost-per-1k that FELL would
    // have rendered as a loss, on the screen whose whole job is not
    // overclaiming.
    const higher = reachOf(build(belowBaseline(), { metricDirection: "higher_is_better" }));
    const lower = reachOf(build(belowBaseline(), { metricDirection: "lower_is_better" }));
    expect(higher.effectPer1k).toBe(-40);
    expect(higher.improvement).toBe("worse");
    expect(lower.effectPer1k).toBe(-40);
    expect(lower.improvement).toBe("better");
  });

  it("a POSITIVE delta reads the other way round, under both directions", () => {
    // sixComparableReachResults: treatment median 50, baseline median 20.
    const higher = reachOf(
      build(sixComparableReachResults(), { metricDirection: "higher_is_better" })
    );
    const lower = reachOf(
      build(sixComparableReachResults(), { metricDirection: "lower_is_better" })
    );
    expect(higher.effectPer1k).toBe(30);
    expect(higher.improvement).toBe("better");
    expect(lower.effectPer1k).toBe(30);
    expect(lower.improvement).toBe("worse");
  });

  it("`unchanged` IS REACHABLE, and zero has no direction", () => {
    // A state nothing can produce is a state that does not exist.
    for (const direction of ["higher_is_better", "lower_is_better"] as const) {
      const comparison = reachOf(build(equalMedians(), { metricDirection: direction }));
      expect(comparison.effectPer1k).toBe(0);
      expect(comparison.improvement).toBe("unchanged");
    }
  });

  it("`unchanged` covers ARITHMETIC NOISE, not smallness — both halves, because either alone is vacuous", () => {
    // THE REFRAME THAT SETTLED THIS (2026-09-04). Two earlier proposals were
    // refused for inventing a DOMAIN tolerance, and those refusals stand. This
    // is a claim about the COMPUTATION: below ~11 ulps of the operands' own
    // magnitude, the two medians are not distinguishable by the arithmetic that
    // produced them.
    //
    // FLOAT NOISE IS RELATIVE, NOT SMALL, which is why the pair is a pair. An
    // absolute threshold cannot tell these two rows apart; a relative one
    // separates them exactly.
    const medians = (treatment: string, baseline: string) =>
      reachOf(
        build([
          result({ id: "t1", treatmentKey: TREATMENT, reachValue: treatment, reachDenominator: "1000" }),
          result({ id: "t2", treatmentKey: TREATMENT, reachValue: treatment, reachDenominator: "1000" }),
          result({ id: "t3", treatmentKey: TREATMENT, reachValue: treatment, reachDenominator: "1000" }),
          result({ id: "b1", treatmentKey: OTHER_TREATMENT, reachValue: baseline, reachDenominator: "1000" }),
          result({ id: "b2", treatmentKey: OTHER_TREATMENT, reachValue: baseline, reachDenominator: "1000" }),
          result({ id: "b3", treatmentKey: OTHER_TREATMENT, reachValue: baseline, reachDenominator: "1000" }),
        ])
      );

    // ---- HALF ONE: real IEEE noise, at two magnitudes. The MEDIANS differ
    // (so the fixture is not a disguised exact tie) and the reported effect is
    // ZERO, because the verdict decides the number.
    const noise = medians("0.30000000000000004", "0.3");
    expect(
      medianOrNull(noise.treatment),
      "the fixture collapsed to an exact tie and proves nothing"
    ).not.toBe(medianOrNull(noise.baseline));
    expect(noise.improvement, "5.55e-17 at a scale of 0.3 is noise").toBe("unchanged");
    expect(noise.effectPer1k, "a tie reports 0, never the crumb").toBe(0);

    const bigger = medians("120.00000000000001", "120");
    expect(medianOrNull(bigger.treatment)).not.toBe(medianOrNull(bigger.baseline));
    expect(bigger.improvement, "1.42e-14 at a scale of 120 is noise").toBe("unchanged");
    expect(bigger.effectPer1k).toBe(0);

    // Exact equality is still `unchanged` — the bound did not replace zero.
    expect(medians("20", "20").effectPer1k).toBe(0);
    expect(medians("20", "20").improvement).toBe("unchanged");

    // ---- HALF TWO: genuinely tiny and genuinely different. Without this,
    // "always unchanged for small numbers" passes half one completely.
    const tiny = medians("0.00004", "0.00008");
    expect(tiny.effectPer1k).toBeCloseTo(-0.00004, 12);
    expect(
      tiny.improvement,
      "0.00004 against 0.00008 is a doubling — tiny is not the same as noise"
    ).toBe("worse");

    // ...and the same pair under the other direction, so the bound cannot be
    // hiding behind a sign convention.
    const tinyLower = reachOf(
      build(
        [
          result({ id: "t1", treatmentKey: TREATMENT, reachValue: "0.00004", reachDenominator: "1000" }),
          result({ id: "t2", treatmentKey: TREATMENT, reachValue: "0.00004", reachDenominator: "1000" }),
          result({ id: "t3", treatmentKey: TREATMENT, reachValue: "0.00004", reachDenominator: "1000" }),
          result({ id: "b1", treatmentKey: OTHER_TREATMENT, reachValue: "0.00008", reachDenominator: "1000" }),
          result({ id: "b2", treatmentKey: OTHER_TREATMENT, reachValue: "0.00008", reachDenominator: "1000" }),
          result({ id: "b3", treatmentKey: OTHER_TREATMENT, reachValue: "0.00008", reachDenominator: "1000" }),
        ],
        { metricDirection: "lower_is_better" }
      )
    );
    expect(tinyLower.improvement).toBe("better");
  });

  it("WHY ONE MUTATION CANNOT BE KILLED: `max(|t|,|b|)` and `|b|` never disagree", () => {
    // A SURVIVOR, RECORDED AS A MEASUREMENT RATHER THAN AS A COMMENT.
    // Replacing the scale with the baseline alone survives the whole suite,
    // and this is why: the bound only applies when the two medians are within
    // ~11 ulps of each other, at which point they ARE each other to within
    // 11 ulps, so every candidate scale gives the same verdict. The interval
    // where they could differ is narrower than one ulp and therefore empty.
    //
    // `Math.max` stays in the module because it is the honest expression of a
    // symmetric property, not because a test forced it. If this case ever goes
    // red the mutation has become killable and somebody should look.
    const K = 11;
    const unchangedUnder = (delta: number, scale: number) =>
      Math.abs(delta) <= Number.EPSILON * K * Math.abs(scale);
    const magnitudes = [0, 1e-300, 1e-8, 0.3, 1, 120, 1e6, 1e300];
    let compared = 0;
    for (const base of magnitudes) {
      for (let step = -200; step <= 200; step += 1) {
        const treatment =
          base === 0 ? step * Number.MIN_VALUE : base * (1 + Number.EPSILON * step);
        const delta = treatment - base;
        expect(
          unchangedUnder(delta, Math.max(Math.abs(treatment), Math.abs(base)))
        ).toBe(unchangedUnder(delta, base));
        compared += 1;
      }
    }
    expect(compared, "the sweep compared nothing").toBeGreaterThan(3000);
  });

  it("the budget is BRACKETED — about one ulp is noise, about a hundred is not", () => {
    // THE GAP THE MATRIX FOUND: every case above pins the bound's SHAPE
    // (relative, not absolute) and none pinned its SIZE, so raising K by
    // twelve orders of magnitude left them all green. A budget nothing
    // measures is a number somebody can widen until the guard stops guarding.
    //
    // Both ends, in ULPS OF THE OPERANDS rather than in absolute numbers, so
    // the bracket says what it means: K is at least about 1 and at most about
    // 100. The documented value is 11 — the count of roundings on the path —
    // and it sits inside this bracket with room on both sides, which is the
    // point: this pins the ORDER, not the arithmetic's exact bookkeeping.
    const atUlps = (ulps: number) => {
      const base = 120;
      const treatment = String(base + base * Number.EPSILON * ulps);
      return reachOf(
        build([
          result({ id: "t1", treatmentKey: TREATMENT, reachValue: treatment, reachDenominator: "1000" }),
          result({ id: "t2", treatmentKey: TREATMENT, reachValue: treatment, reachDenominator: "1000" }),
          result({ id: "t3", treatmentKey: TREATMENT, reachValue: treatment, reachDenominator: "1000" }),
          result({ id: "b1", treatmentKey: OTHER_TREATMENT, reachValue: String(base), reachDenominator: "1000" }),
          result({ id: "b2", treatmentKey: OTHER_TREATMENT, reachValue: String(base), reachDenominator: "1000" }),
          result({ id: "b3", treatmentKey: OTHER_TREATMENT, reachValue: String(base), reachDenominator: "1000" }),
        ])
      );
    };

    const oneUlp = atUlps(1);
    // NON-VACUITY ON THE FIXTURE: the medians really are different numbers, so
    // the zero below is the module's decision and not an accident of the input.
    expect(
      medianOrNull(oneUlp.treatment),
      "the fixture produced no delta at all"
    ).not.toBe(medianOrNull(oneUlp.baseline));
    expect(oneUlp.improvement, "one ulp of 120 is the arithmetic's own error").toBe(
      "unchanged"
    );
    expect(oneUlp.effectPer1k).toBe(0);

    const hundredUlps = atUlps(100);
    expect(
      hundredUlps.improvement,
      "a hundred ulps is far outside what this module's eleven roundings can make"
    ).toBe("better");
    // THE NON-VACUITY TWIN OF THE ZEROING: a real difference still reports its
    // TRUE magnitude. Without this, zeroing everything passes every case above.
    expect(hundredUlps.effectPer1k).not.toBe(0);
    // A RATIO, not an absolute tolerance. The intended delta is
    // `120 * EPSILON * 100`; the fixture's own round trip through the per-1k
    // path (a decimal parse, a divide, a multiply) moves it by a fraction of a
    // percent, and a decimal-digit tolerance here would be asserting the
    // rounding of the fixture rather than the magnitude of the result. Within a
    // factor of two is the claim worth making: the effect is the REAL
    // difference, not zero and not something else.
    const intended = 120 * Number.EPSILON * 100;
    const ratio = hundredUlps.effectPer1k! / intended;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it("a magnitude difference is NOT noise, however small both numbers are", () => {
    // THE CASE AN ABSOLUTE RULE GETS EXACTLY BACKWARDS, and the one place this
    // module's answer differs from a rounding function's: a per-1k of 1e-300
    // against a baseline of 0 is an INFINITE relative difference. It is tiny in
    // absolute terms and it is not noise, so it is decided rather than
    // dismissed. That is the relative property doing the thing it exists for.
    const comparison = reachOf(
      build([
        result({ id: "t1", treatmentKey: TREATMENT, reachValue: "1e-300", reachDenominator: "1000" }),
        result({ id: "t2", treatmentKey: TREATMENT, reachValue: "1e-300", reachDenominator: "1000" }),
        result({ id: "t3", treatmentKey: TREATMENT, reachValue: "1e-300", reachDenominator: "1000" }),
        result({ id: "b1", treatmentKey: OTHER_TREATMENT, reachValue: "0", reachDenominator: "1000" }),
        result({ id: "b2", treatmentKey: OTHER_TREATMENT, reachValue: "0", reachDenominator: "1000" }),
        result({ id: "b3", treatmentKey: OTHER_TREATMENT, reachValue: "0", reachDenominator: "1000" }),
      ])
    );
    expect(comparison.improvement).toBe("better");
  });

  it("the bound scales WITH the operands — the same delta reads both ways", () => {
    // The sharpest statement of relative-not-absolute: one delta, two
    // magnitudes, two answers. An absolute threshold cannot produce this.
    const at120 = reachOf(
      build([
        result({ id: "t1", treatmentKey: TREATMENT, reachValue: "120.00000000000001", reachDenominator: "1000" }),
        result({ id: "t2", treatmentKey: TREATMENT, reachValue: "120.00000000000001", reachDenominator: "1000" }),
        result({ id: "t3", treatmentKey: TREATMENT, reachValue: "120.00000000000001", reachDenominator: "1000" }),
        result({ id: "b1", treatmentKey: OTHER_TREATMENT, reachValue: "120", reachDenominator: "1000" }),
        result({ id: "b2", treatmentKey: OTHER_TREATMENT, reachValue: "120", reachDenominator: "1000" }),
        result({ id: "b3", treatmentKey: OTHER_TREATMENT, reachValue: "120", reachDenominator: "1000" }),
      ])
    );
    // ~1.42e-14 against a scale of 120: inside the arithmetic's own error.
    expect(at120.improvement).toBe("unchanged");

    const atTiny = reachOf(
      build([
        result({ id: "t1", treatmentKey: TREATMENT, reachValue: "0.00000000000003", reachDenominator: "1000" }),
        result({ id: "t2", treatmentKey: TREATMENT, reachValue: "0.00000000000003", reachDenominator: "1000" }),
        result({ id: "t3", treatmentKey: TREATMENT, reachValue: "0.00000000000003", reachDenominator: "1000" }),
        result({ id: "b1", treatmentKey: OTHER_TREATMENT, reachValue: "0.00000000000001", reachDenominator: "1000" }),
        result({ id: "b2", treatmentKey: OTHER_TREATMENT, reachValue: "0.00000000000001", reachDenominator: "1000" }),
        result({ id: "b3", treatmentKey: OTHER_TREATMENT, reachValue: "0.00000000000001", reachDenominator: "1000" }),
      ])
    );
    // A RAW delta of ~2e-14 — LARGER than the one above — but a tripling at
    // this scale, so it is decided and keeps its number, while the larger-
    // scaled pair is zeroed. One delta, two magnitudes, two answers: an
    // absolute threshold cannot produce this and neither can a zeroing rule
    // that fires on smallness.
    expect(at120.effectPer1k).toBe(0);
    expect(atTiny.effectPer1k).not.toBe(0);
    expect(Math.abs(atTiny.effectPer1k!)).toBeGreaterThan(Math.abs(at120.effectPer1k!));
    expect(atTiny.improvement).toBe("better");
  });

  it("is null EXACTLY when `effectPer1k` is null — an absent comparison has no verdict", () => {
    // R12 applied to a word instead of to a bar. The biconditional is checked
    // across every absence shape this module can produce.
    const fixtures: ComparisonResultInput[][] = [
      [],
      [reach("t1", 42, { treatmentKey: TREATMENT })],
      [
        reach("t1", 10, { treatmentKey: TREATMENT }),
        reach("t2", 20, { treatmentKey: TREATMENT }),
        reach("b1", 1, { treatmentKey: OTHER_TREATMENT }),
        reach("b2", 2, { treatmentKey: OTHER_TREATMENT }),
        reach("b3", 3, { treatmentKey: OTHER_TREATMENT }),
      ],
      sixComparableReachResults(),
    ];
    let sawNull = false;
    let sawWord = false;
    for (const fixture of fixtures) {
      for (const comparison of build(fixture)) {
        expect(comparison.improvement === null).toBe(comparison.effectPer1k === null);
        if (comparison.improvement === null) sawNull = true;
        else sawWord = true;
      }
    }
    // NON-VACUITY: an implementation returning null always, or a word always,
    // satisfies a biconditional checked over a one-sided fixture set.
    expect(sawNull, "no fixture produced an ABSENT comparison").toBe(true);
    expect(sawWord, "no fixture produced a DECIDED comparison").toBe(true);
  });

  it("is derived from THE DELTA THE SCREEN SHOWS, not from a second computation", () => {
    // `generations.brainActivationId`'s reason for pointing rather than
    // copying: a duplicated derivation is "a second answer … and the two could
    // disagree with nothing to adjudicate". Asserted as a property over every
    // comparison these fixtures can build, in both directions.
    const fixtures: ComparisonResultInput[][] = [
      sixComparableReachResults(),
      belowBaseline(),
      equalMedians(),
      [reach("t1", 42, { treatmentKey: TREATMENT })],
    ];
    for (const direction of ["higher_is_better", "lower_is_better"] as const) {
      for (const fixture of fixtures) {
        for (const comparison of build(fixture, { metricDirection: direction })) {
          const delta = comparison.effectPer1k;
          const expected =
            delta === null
              ? null
              : delta === 0
                ? "unchanged"
                : delta > 0 === (direction === "higher_is_better")
                  ? "better"
                  : "worse";
          expect(comparison.improvement).toBe(expected);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// R15 — ONE NAMED CONSTANT, ONE READER
// ---------------------------------------------------------------------------

describe("R15: the minimum-n is one named constant with one reader", () => {
  /**
   * REGEXP LITERALS, never assembled from strings: one lost backslash turns a
   * scan into a pattern that matches nothing and reports clean because it
   * found no candidates (CLAUDE.md 2026-08-21). Each is proved against a
   * planted violation below.
   */
  const DECLARATION = /export const MIN_COMPARABLE_RESULTS\b/g;
  // NO `g` FLAG, and its absence is the finding of this file's own adversarial
  // re-read. A global RegExp carries `lastIndex` ACROSS `.test()` calls, so the
  // same object used in a `.filter()` over several files starts the second file
  // mid-string after the first one matched — a scanner that skips exactly the
  // file AFTER an offender. It reads clean today only because there are no
  // offenders at all, which is the fail-open shape CLAUDE.md's 2026-08-21
  // lesson names. `DECLARATION` keeps its `g` because `matchAll` requires one
  // and clones the object rather than sharing its state.
  const BARE_POPULATION_BOUND = /\b(n|length)\s*(<=|>=|<|>)\s*[0-9]/;

  const packageSources = (): Map<string, string> => {
    const dir = join(packageRoot, "src");
    const files = new Map<string, string>();
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".ts")) files.set(name, readFileSync(join(dir, name), "utf8"));
    }
    return files;
  };

  it("is 3", () => {
    expect(MIN_COMPARABLE_RESULTS).toBe(3);
  });

  it("is DECLARED exactly once in this package", () => {
    const sources = packageSources();
    expect(sources.size, "the walk read no sources — this scan would report clean having scanned nothing").toBeGreaterThan(1);
    const declarations = [...sources.values()].flatMap((source) => [
      ...source.matchAll(DECLARATION),
    ]);
    expect(declarations.length).toBe(1);
  });

  it("no comparison site compares a population against a BARE NUMBER instead", () => {
    const sources = packageSources();
    const offenders = [...sources.entries()]
      .filter(([, source]) => BARE_POPULATION_BOUND.test(source))
      .map(([name]) => name);
    expect(
      offenders,
      "a population bound written as a literal is a second minimum-n the constant cannot keep honest"
    ).toEqual([]);
  });

  it("NON-VACUITY: both scans catch a planted violation, and neither fires on innocent code", () => {
    // THE SAME OBJECTS THE SCANS ABOVE USE, never a re-spelled copy: a witness
    // that exercises a second spelling of the pattern proves the spelling, not
    // the guard, and the two drift the first time either is edited.
    const declares = (source: string) => [...source.matchAll(DECLARATION)].length;
    expect(declares("export const MIN_COMPARABLE_RESULTS = 3;")).toBe(1);
    expect(declares("const MIN_COMPARABLE_RESULTS_OTHER = 4;")).toBe(0);
    expect(BARE_POPULATION_BOUND.test("if (n < 3) return short;")).toBe(true);
    expect(BARE_POPULATION_BOUND.test("if (rows.length >= 3) return present;")).toBe(true);
    expect(BARE_POPULATION_BOUND.test("if (n < MIN_COMPARABLE_RESULTS) return short;")).toBe(false);
    expect(BARE_POPULATION_BOUND.test("if (denominator <= 0) throw new Error();")).toBe(false);
  });

  it("NON-VACUITY: the bare-bound scan does not SKIP the file after an offender", () => {
    // The regression guard for this file's own defect. With a `g` flag the
    // shared RegExp carries `lastIndex` between `.test()` calls, so the second
    // string is scanned from wherever the first match ended — and a scanner
    // that misses the file after an offender reports "clean" for a reason
    // nobody could see, because today there are no offenders at all.
    const planted = ["if (n < 3) return short;", "if (rows.length >= 3) return present;"];
    expect(planted.filter((source) => BARE_POPULATION_BOUND.test(source))).toEqual(planted);
  });

  it("BEHAVIOURAL, not only textual: the boundary really is at 3", () => {
    // The half a source scan cannot see. Lowering the constant to 1 leaves
    // every scan above green; this case is the one that goes red.
    const rows = (count: number): ComparisonResultInput[] =>
      Array.from({ length: count }, (_unused, index) =>
        reach(`t${index}`, 10, { treatmentKey: TREATMENT })
      );
    expect(reachOf(build(rows(2))).treatment.state).toBe("short");
    expect(reachOf(build(rows(3))).treatment.state).toBe("present");
  });
});

// ---------------------------------------------------------------------------
// GROUPING — WHICH RESULTS ARE COMPARABLE, DECIDED IN ONE PACKAGE
// ---------------------------------------------------------------------------

/** Rows reporting BOTH levers, at module scope so grouping fixtures reuse them. */
function twoLeverRows(): ComparisonResultInput[] {
  return [10, 20, 30].map((value, index) =>
    result({
      id: "t" + (index + 1),
      treatmentKey: TREATMENT,
      reachValue: String(value),
      reachDenominator: "1000",
      conversionValue: String(value / 10),
      conversionDenominator: "1000",
    })
  );
}

const METRICS = new Map<string, DeclaredMetric>([
  ["strategy-v3", { key: "follows", label: "Follows", unit: "follows per 1k views", direction: "higher_is_better" }],
  ["strategy-v4", { key: "follows", label: "Follows", unit: "follows per 1k views", direction: "higher_is_better" }],
  ["strategy-cost", { key: "cost", label: "Cost", unit: "cost per 1k views", direction: "lower_is_better" }],
]);

function groups(
  results: readonly ComparisonResultInput[],
  overrides: Partial<{
    profileId: string;
    truncated: boolean;
    declaredMetrics: ReadonlyMap<string, DeclaredMetric>;
  }> = {}
): ComparisonGroup[] {
  return buildComparisonGroups({
    // The caller's MINTED scope id, which is what `result()` gives its rows.
    // Overridable, because the case that matters most is the one where it
    // does NOT match the rows.
    profileId: STRATUM.profileId,
    results,
    truncated: false,
    declaredMetrics: METRICS,
    ...overrides,
  });
}

/**
 * A POPULATION OF FIXTURES, not one hand-picked pair.
 *
 * The properties below are asserted over EVERY one of these, because a
 * property whose whole job is agreement between two mechanisms is proved
 * generatively or not at all (CLAUDE.md 2026-08-18: a guard hardened against
 * named counterexamples failed a third gate round with nine more).
 */
function groupingFixtures(): { name: string; rows: ComparisonResultInput[] }[] {
  return [
    { name: "one stratum, one treatment", rows: sixComparableReachResults() },
    {
      name: "two treatment keys in one stratum",
      rows: [
        ...sixComparableReachResults(),
        reach("o1", 70, { treatmentKey: OTHER_TREATMENT }),
      ],
    },
    {
      name: "two audience classes",
      rows: [
        ...sixComparableReachResults(),
        reach("p1", 400, { treatmentKey: TREATMENT, audienceClass: "paid" }),
        reach("p2", 500, { treatmentKey: TREATMENT, audienceClass: "paid" }),
      ],
    },
    {
      name: "two platforms",
      rows: [
        ...sixComparableReachResults(),
        reach("r1", 11, { treatmentKey: TREATMENT, platform: "instagram_reels" }),
      ],
    },
    {
      name: "two metric VERSIONS sharing a key",
      rows: [
        ...sixComparableReachResults(),
        reach("v4a", 90, { treatmentKey: TREATMENT, metricDeclaredByDocId: "strategy-v4" }),
        reach("v4b", 95, { treatmentKey: TREATMENT, metricDeclaredByDocId: "strategy-v4" }),
      ],
    },
    {
      name: "two metric KEYS with opposite directions",
      rows: [
        ...sixComparableReachResults(),
        reach("c1", 5, { treatmentKey: TREATMENT, metricKey: "cost", metricDeclaredByDocId: "strategy-cost" }),
      ],
    },
    {
      name: "keyless results alongside a cohort",
      rows: [
        reach("t1", 40, { treatmentKey: TREATMENT }),
        reach("t2", 50, { treatmentKey: TREATMENT }),
        reach("t3", 60, { treatmentKey: TREATMENT }),
        reach("k1", 10, { treatmentKey: null }),
        reach("k2", 20, { treatmentKey: null }),
        reach("k3", 30, { treatmentKey: null }),
      ],
    },
    {
      name: "keyless results ONLY",
      rows: [
        reach("k1", 10, { treatmentKey: null }),
        reach("k2", 20, { treatmentKey: null }),
      ],
    },
    {
      name: "both levers, an unquantified row and a spread of windows",
      rows: [
        ...twoLeverRows(),
        reach("u1", 900, { treatmentKey: TREATMENT, evidenceState: "unquantified" }),
        reach("old", 5, {
          treatmentKey: OTHER_TREATMENT,
          observedFrom: new Date("2026-06-01T00:00:00Z"),
          observedTo: new Date("2026-06-08T00:00:00Z"),
        }),
      ],
    },
  ];
}

describe("buildComparisonGroups: the grouping and the stratum predicate are ONE decision", () => {
  it("PROPERTY: every group is EXACTLY what the lever builder returns for its own stratum", () => {
    // THE AGREEMENT, PROVED RATHER THAN ARGUED. If grouping ever computed
    // membership itself — a partition in @respin/db, a filter here — this
    // equality is what breaks. Asserted over the whole fixture population, in
    // both truncation modes, so it is a property and not a chosen pair.
    let checked = 0;
    for (const fixture of groupingFixtures()) {
      for (const truncated of [false, true]) {
        for (const group of groups(fixture.rows, { truncated })) {
          const declared = METRICS.get(group.stratum.metricDeclaredByDocIds[0]!)!;
          expect(
            group.comparisons,
            fixture.name + " :: " + group.treatmentKey
          ).toEqual(
            buildLeverComparisons({
              stratum: group.stratum,
              treatmentKey: group.treatmentKey,
              results: fixture.rows,
              metricDirection: declared.direction,
              metricUnit: declared.unit,
              resultsTruncated: truncated,
            })
          );
          checked += 1;
        }
      }
    }
    // NON-VACUITY: a property asserted over zero groups is a property about
    // nothing, which is how this exact shape passes while grouping is broken.
    expect(checked, "the property ran over no groups at all").toBeGreaterThan(20);
  });

  it("PROPERTY: no population ever contains a row from another stratum", () => {
    // The leak-shaped half of the same agreement: if two rows land in one
    // group, they are comparable; if they belong to different strata, they
    // never meet. Read off the INPUT rows rather than off the group, so this
    // is not the previous case restated.
    let checked = 0;
    for (const fixture of groupingFixtures()) {
      const byId = new Map(fixture.rows.map((row) => [row.id, row]));
      for (const group of groups(fixture.rows)) {
        for (const comparison of group.comparisons) {
          for (const id of [
            ...comparison.treatment.resultIds,
            ...comparison.baseline.resultIds,
          ]) {
            const row = byId.get(id)!;
            expect(row.profileId).toBe(group.stratum.profileId);
            expect(row.platform).toBe(group.stratum.platform);
            expect(row.audienceClass).toBe(group.stratum.audienceClass);
            expect(row.metricKey).toBe(group.stratum.metricKey);
            expect(group.stratum.metricDeclaredByDocIds).toContain(row.metricDeclaredByDocId);
            expect(row.observedFrom.getTime()).toBeGreaterThanOrEqual(
              group.stratum.observedFrom.getTime()
            );
            expect(row.observedTo.getTime()).toBeLessThanOrEqual(
              group.stratum.observedTo.getTime()
            );
            checked += 1;
          }
        }
      }
    }
    expect(checked, "the property ran over no rows at all").toBeGreaterThan(40);
  });

  it("PROPERTY: the group set is complete and has no duplicates", () => {
    // Derived a SECOND way — naively, in the test — so the completeness claim
    // is not the implementation agreeing with itself.
    for (const fixture of groupingFixtures()) {
      const expected = new Set(
        fixture.rows
          .filter((row) => (row.treatmentKey ?? "").trim() !== "")
          .map((row) =>
            JSON.stringify([
              row.platform,
              row.audienceClass,
              row.metricKey,
              metricDeclarationKey(METRICS.get(row.metricDeclaredByDocId)!),
              row.treatmentKey,
            ])
          )
      );
      const actual = groups(fixture.rows).map((group) =>
        JSON.stringify([
          group.stratum.platform,
          group.stratum.audienceClass,
          group.stratum.metricKey,
          metricDeclarationKey(METRICS.get(group.stratum.metricDeclaredByDocIds[0]!)!),
          group.treatmentKey,
        ])
      );
      expect(new Set(actual), fixture.name).toEqual(expected);
      expect(actual.length, fixture.name + ": a duplicate group").toBe(
        expected.size
      );
    }
  });

  it("returns groups in a DETERMINISTIC order", () => {
    const rows = groupingFixtures()[2]!.rows;
    const once = groups(rows).map((group) => group.treatmentKey + "/" + group.stratum.audienceClass);
    const reversed = groups([...rows].reverse()).map(
      (group) => group.treatmentKey + "/" + group.stratum.audienceClass
    );
    expect(once).toEqual(reversed);
    expect(once.length).toBeGreaterThan(1);
  });
});

describe("a keyless result forms NO cohort and still feeds every baseline it matches (C4)", () => {
  it("never becomes a group of its own", () => {
    // The fabrication C4 forbids: three generation-less results sharing an
    // absent key would otherwise be a cohort of three unrelated posts.
    const only = groups([
      reach("k1", 10, { treatmentKey: null }),
      reach("k2", 20, { treatmentKey: null }),
      reach("k3", 30, { treatmentKey: null }),
    ]);
    expect(only).toEqual([]);
  });

  it("IS in the baseline of a group it is comparable to — the honest half", () => {
    const built = groups([
      reach("t1", 40, { treatmentKey: TREATMENT }),
      reach("t2", 50, { treatmentKey: TREATMENT }),
      reach("t3", 60, { treatmentKey: TREATMENT }),
      reach("k1", 10, { treatmentKey: null }),
      reach("k2", 20, { treatmentKey: null }),
      reach("k3", 30, { treatmentKey: null }),
    ]);
    expect(built).toHaveLength(1);
    const reach1 = built[0]!.comparisons.find((c) => c.lever === "reach")!;
    expect(reach1.treatment.resultIds).toEqual(["t1", "t2", "t3"]);
    expect(reach1.baseline.resultIds).toEqual(["k1", "k2", "k3"]);
    expect(reach1.effectPer1k).toBe(30);
  });

  it("a BLANK key is treated as no key, not as a key", () => {
    const built = groups([
      reach("t1", 40, { treatmentKey: TREATMENT }),
      reach("t2", 50, { treatmentKey: TREATMENT }),
      reach("t3", 60, { treatmentKey: TREATMENT }),
      reach("e1", 10, { treatmentKey: "" }),
      reach("e2", 20, { treatmentKey: "   " }),
    ]);
    expect(built.map((group) => group.treatmentKey)).toEqual([TREATMENT]);
  });
});

describe("truncation propagates to EVERY group it could have affected", () => {
  it("marks every population of every group, across every stratum", () => {
    // The clip keeps the newest observations across the WHOLE population, so
    // an older stratum can lose rows with no signal local to that group.
    // There is nothing to tell which groups were affected, so all of them are.
    for (const fixture of groupingFixtures()) {
      const built = groups(fixture.rows, { truncated: true });
      for (const group of built) {
        for (const comparison of group.comparisons) {
          expect(comparison.treatment.state, fixture.name).toBe("truncated");
          expect(comparison.baseline.state, fixture.name).toBe("truncated");
          expect(comparison.effectPer1k).toBeNull();
          expect(comparison.improvement).toBeNull();
        }
      }
    }
  });

  it("NON-VACUITY: the same fixtures are NOT truncated when the read was complete", () => {
    // Without this, "mark everything truncated always" passes the case above.
    let sawPresent = false;
    for (const fixture of groupingFixtures()) {
      for (const group of groups(fixture.rows)) {
        for (const comparison of group.comparisons) {
          expect(comparison.treatment.state).not.toBe("truncated");
          expect(comparison.baseline.state).not.toBe("truncated");
          if (comparison.treatment.state === "present") sawPresent = true;
        }
      }
    }
    expect(sawPresent, "no fixture produced a PRESENT population").toBe(true);
  });
});

describe("the declared metric is read per VERSION, and refused when it is missing", () => {
  it("labels each group with ITS OWN version's unit and direction", () => {
    // WHY THE INPUT IS A MAP. `resultComparisons` reads the whole eligible
    // population, so a call spans every strategy version a creator has ever
    // declared. One unit and one direction cannot be right for two of them,
    // and labelling an old group with the current version's direction inverts
    // `improvement` — the defect amendment 2 exists to prevent.
    const built = groups([
      ...sixComparableReachResults(),
      reach("c1", 5, { treatmentKey: TREATMENT, metricKey: "cost", metricDeclaredByDocId: "strategy-cost" }),
      reach("c2", 10, { treatmentKey: TREATMENT, metricKey: "cost", metricDeclaredByDocId: "strategy-cost" }),
      reach("c3", 15, { treatmentKey: TREATMENT, metricKey: "cost", metricDeclaredByDocId: "strategy-cost" }),
      reach("c4", 40, { treatmentKey: OTHER_TREATMENT, metricKey: "cost", metricDeclaredByDocId: "strategy-cost" }),
      reach("c5", 50, { treatmentKey: OTHER_TREATMENT, metricKey: "cost", metricDeclaredByDocId: "strategy-cost" }),
      reach("c6", 60, { treatmentKey: OTHER_TREATMENT, metricKey: "cost", metricDeclaredByDocId: "strategy-cost" }),
    ]);
    // BOTH selectors name the treatment key: the follows stratum holds TWO
    // groups (this treatment and the one its baseline rows carry), and picking
    // "the first follows group" silently selected the other one.
    const follows = built.find(
      (group) => group.stratum.metricKey === "follows" && group.treatmentKey === TREATMENT
    )!;
    const cost = built.find(
      (group) => group.stratum.metricKey === "cost" && group.treatmentKey === TREATMENT
    )!;
    const followsReach = follows.comparisons.find((c) => c.lever === "reach")!;
    const costReach = cost.comparisons.find((c) => c.lever === "reach")!;
    expect(followsReach.unit).toBe("follows per 1k views");
    expect(followsReach.direction).toBe("higher_is_better");
    expect(followsReach.improvement).toBe("better");
    expect(costReach.unit).toBe("cost per 1k views");
    expect(costReach.direction).toBe("lower_is_better");
    // Treatment median 10 against a baseline of 50: a fall, which is BETTER
    // for a cost metric and would read as a loss under one shared direction.
    expect(costReach.effectPer1k).toBe(-40);
    expect(costReach.improvement).toBe("better");
  });

  it("REFUSES a version it was given no metric for — it does not drop the group", () => {
    expect(() =>
      groups([...sixComparableReachResults()], {
        declaredMetrics: new Map(),
      })
    ).toThrow(/no declared metric for brain_docs/);
  });

  it("REFUSES a row whose metric key disagrees with the version it names (C3)", () => {
    expect(() =>
      groups([
        reach("t1", 40, { treatmentKey: TREATMENT, metricKey: "saves" }),
      ])
    ).toThrow(/declares/);
  });

  it("REFUSES a row from another profile rather than grouping it (REQ-A03)", () => {
    expect(() =>
      groups([
        ...sixComparableReachResults(),
        reach("other", 10, { treatmentKey: TREATMENT, profileId: "profile-2" }),
      ])
    ).toThrow(/belongs to profile profile-2/);
  });

  it("REFUSES a set that is UNIFORMLY another creator's — the case row zero could not see", () => {
    // THE BRAIN-TENANCY GATE'S CHANGE, as a test. The guard used to take its
    // expectation from `results[0]!.profileId`, so it proved the set was
    // HOMOGENEOUS and said nothing about WHOSE it was: every row below agrees
    // with every other, and all of them belong to somebody else. That input
    // passed cleanly, and `inStratum` could not catch it either, because the
    // stratum was built from the same row the check compared against — a
    // check comparing a value to itself.
    //
    // It is not a live leak (`comparableResults` mints the scope) and it is
    // the layer whose docblock claims the property, so it is the layer that
    // has to be able to fail.
    const someoneElses = sixComparableReachResults().map((row) => ({
      ...row,
      profileId: "profile-2",
    }));
    expect(() => groups(someoneElses, { profileId: "profile-1" })).toThrow(
      /belongs to profile profile-2, not the profile-1/
    );
  });

  it("NON-VACUITY: the SAME rows compare cleanly when the caller asks for THEIR profile", () => {
    // Without this, a guard that refused every set would pass the case above.
    const someoneElses = sixComparableReachResults().map((row) => ({
      ...row,
      profileId: "profile-2",
    }));
    const built = groups(someoneElses, { profileId: "profile-2" });
    expect(built).toHaveLength(2);
    expect(
      built.every((group) => group.stratum.profileId === "profile-2")
    ).toBe(true);
  });

  it("every returned stratum carries the CALLER's id, not a row's", () => {
    // What makes `inStratum`'s profile predicate a real check downstream: the
    // value it compares against came from outside the data.
    for (const group of groups(sixComparableReachResults())) {
      expect(group.stratum.profileId).toBe(STRATUM.profileId);
    }
  });

  it("REFUSES a blank expectation — every row would satisfy it", () => {
    expect(() => groups(sixComparableReachResults(), { profileId: "   " })).toThrow(
      /profileId is blank/
    );
    // ...and refuses it with NO rows at all, where an earlier emptiness check
    // would otherwise let a blank id through unexamined.
    expect(() => groups([], { profileId: "" })).toThrow(/profileId is blank/);
  });

  it("an empty population is no groups, not an error", () => {
    expect(groups([])).toEqual([]);
  });
});

describe("the stratum window is the envelope of the STRATUM, not of the cohort", () => {
  it("spans every row in the stratum, so an EARLIER baseline is not excluded", () => {
    // THE QUIET DISASTER THIS AVOIDS: a creator's earlier results almost
    // always precede the thing being tested. A window derived from the
    // treatment rows alone would empty nearly every baseline and tell creators
    // with plenty of history that they have none.
    const built = groups([
      reach("t1", 40, { treatmentKey: TREATMENT }),
      reach("t2", 50, { treatmentKey: TREATMENT }),
      reach("t3", 60, { treatmentKey: TREATMENT }),
      reach("b1", 10, {
        treatmentKey: OTHER_TREATMENT,
        observedFrom: new Date("2026-06-01T00:00:00Z"),
        observedTo: new Date("2026-06-08T00:00:00Z"),
      }),
      reach("b2", 20, {
        treatmentKey: OTHER_TREATMENT,
        observedFrom: new Date("2026-06-10T00:00:00Z"),
        observedTo: new Date("2026-06-17T00:00:00Z"),
      }),
      reach("b3", 30, {
        treatmentKey: OTHER_TREATMENT,
        observedFrom: new Date("2026-06-20T00:00:00Z"),
        observedTo: new Date("2026-06-27T00:00:00Z"),
      }),
    ]);
    const treatmentGroup = built.find((group) => group.treatmentKey === TREATMENT)!;
    const lever = treatmentGroup.comparisons.find((c) => c.lever === "reach")!;
    expect(lever.baseline.resultIds).toEqual(["b1", "b2", "b3"]);
    expect(lever.effectPer1k).toBe(30);
    expect(treatmentGroup.stratum.observedFrom).toEqual(new Date("2026-06-01T00:00:00Z"));
    expect(treatmentGroup.stratum.observedTo).toEqual(new Date("2026-08-12T00:00:00Z"));
  });

  it("spans KEYLESS rows too — the case the previous one cannot see", () => {
    // THE GAP THE MUTATION MATRIX FOUND IN THIS FILE, not in the module.
    // Narrowing the envelope to key-carrying rows left the case above GREEN,
    // because its earlier baseline rows carry a treatment key of their own. A
    // creator's real history is mostly results about posts this product did
    // not write — keyless, and older — so that is the population a
    // cohort-shaped window actually deletes.
    const built = groups([
      reach("t1", 40, { treatmentKey: TREATMENT }),
      reach("t2", 50, { treatmentKey: TREATMENT }),
      reach("t3", 60, { treatmentKey: TREATMENT }),
      reach("k1", 10, {
        treatmentKey: null,
        observedFrom: new Date("2026-06-01T00:00:00Z"),
        observedTo: new Date("2026-06-08T00:00:00Z"),
      }),
      reach("k2", 20, {
        treatmentKey: null,
        observedFrom: new Date("2026-06-10T00:00:00Z"),
        observedTo: new Date("2026-06-17T00:00:00Z"),
      }),
      reach("k3", 30, {
        treatmentKey: null,
        observedFrom: new Date("2026-06-20T00:00:00Z"),
        observedTo: new Date("2026-06-27T00:00:00Z"),
      }),
    ]);
    expect(built).toHaveLength(1);
    const lever = built[0]!.comparisons.find((c) => c.lever === "reach")!;
    expect(lever.baseline.resultIds).toEqual(["k1", "k2", "k3"]);
    expect(lever.effectPer1k).toBe(30);
    expect(built[0]!.stratum.observedFrom).toEqual(new Date("2026-06-01T00:00:00Z"));
  });
});

describe("the grouping key cannot collide, whatever the strings contain", () => {
  it("two tuples that a SEPARATOR-JOINED key would merge stay two groups", () => {
    // THE PROPERTY, PLANTED. A treatment key is itself a `|`-joined string
    // (C4), so a `parts.join("|")` grouping key can be produced by two
    // different tuples — and two strata silently become one, which is the
    // pooling every predicate in this module exists to prevent.
    //
    // REACHABILITY, STATED HONESTLY: today `metric_declared_by_doc_id` is a
    // uuid and cannot contain a separator, so this collision is not reachable
    // from the database as it stands. The guard is against the FUNCTION's
    // property, not against a live path, and this case is what makes the
    // property testable at all — a scan with no planted violation proves
    // nothing (CLAUDE.md 2026-08-21).
    const metrics = new Map<string, DeclaredMetric>([
      ["doc-1", { key: "follows", label: "Follows", unit: "u", direction: "higher_is_better" }],
      ["doc-1|a", { key: "follows", label: "Other label", unit: "u", direction: "higher_is_better" }],
    ]);
    const built = groups(
      [
        reach("x1", 10, { metricDeclaredByDocId: "doc-1", treatmentKey: "a|b" }),
        reach("x2", 20, { metricDeclaredByDocId: "doc-1|a", treatmentKey: "b" }),
      ],
      { declaredMetrics: metrics }
    );
    // Joined with `|` both tuples read `youtube_shorts|organic|follows|doc-1|a|b`.
    expect(built).toHaveLength(2);
    expect(
      new Set(built.map((group) => group.stratum.metricDeclaredByDocIds.join(","))).size,
      "two strata were merged into one"
    ).toBe(2);
  });
});

describe("C1 declaration identity", () => {
  it("pools two strategy versions only when their complete declaration tuple is identical", () => {
    const same = new Map<string, DeclaredMetric>([
      ["old", { key: "follows", label: "Follows", unit: "per 1k", direction: "higher_is_better" }],
      ["new", { key: "follows", label: "Follows", unit: "per 1k", direction: "higher_is_better" }],
    ]);
    const rows = [
      reach("t1", 30, { treatmentKey: TREATMENT, metricDeclaredByDocId: "old" }),
      reach("t2", 40, { treatmentKey: TREATMENT, metricDeclaredByDocId: "new" }),
      reach("t3", 50, { treatmentKey: TREATMENT, metricDeclaredByDocId: "new" }),
      reach("b1", 10, { treatmentKey: null, metricDeclaredByDocId: "old" }),
      reach("b2", 20, { treatmentKey: null, metricDeclaredByDocId: "new" }),
      reach("b3", 30, { treatmentKey: null, metricDeclaredByDocId: "old" }),
    ];
    const pooled = groups(rows, { declaredMetrics: same });
    expect(pooled).toHaveLength(1);
    expect(pooled[0]!.stratum.metricDeclaredByDocIds).toEqual(["new", "old"]);
    const changed = new Map(same);
    changed.set("new", { ...same.get("new")!, label: "New follows" });
    expect(groups(rows, { declaredMetrics: changed })).toHaveLength(2);
  });
});

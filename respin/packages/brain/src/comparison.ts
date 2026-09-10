// SLICE 9A, C5 — the comparison. `@respin/brain`'s only behaviour in 9a.
//
// WHAT THIS IS FOR (R10-R13, R15): a creator logged a result against one of
// their own generations, and this turns their own past into the only honest
// thing it can be — a median over results that are actually comparable, per
// lever, with the populations named when they are too small to say anything.
//
// WHAT IT IS NOT. It is not a prediction, not a significance test, and not a
// score. A median difference at n = 3 is DESCRIPTIVE. This module can enforce
// the definition of a cohort; it cannot make a cohort representative, and no
// caller may render it as though it could (R20).
//
// NO PROPOSAL IS CONSTRUCTED HERE (C6). 9a builds comparisons; 9b turns a
// comparison into a proposal a brain can absorb.
import type {
  AudienceClass,
  ComparisonResultInput,
  ConfounderCode,
  Lever,
  MetricDirection,
} from "./vocabulary";

/**
 * R15 — ONE named constant, ONE reader.
 *
 * There is no minimum-n literal anywhere else in this repo: not a wrong one,
 * none. So there is nothing for this to be inconsistent with, and this is the
 * cheap moment to make that a property rather than a coincidence. Every
 * comparison site reads THIS; `packages/brain/tests/comparison.test.ts` pins
 * that it is declared exactly once in this package's sources.
 *
 * BOTH POPULATIONS ANSWER TO IT (R11): a treatment cohort of three against a
 * baseline of one is not a comparison with a weak half, it is not a
 * comparison.
 */
export const MIN_COMPARABLE_RESULTS = 3;

/**
 * The five shared predicates that make two results comparable (phase-9
 * question 1). Every one of them is a POPULATION question, not a preference:
 * a follows-per-1k on Shorts and on Reels are different populations wearing
 * one name, and a paid result beside an organic one is REQ-F01's forbidden
 * pool.
 *
 * PREDICATE 2 IS THE COMPLETE DECLARED METRIC TUPLE. The key remains the
 * stable treatment-key component, while `{key,label,unit,direction}` decides
 * semantic identity. Strategy document ids remain provenance: tuple-equivalent
 * versions pool, and any field change partitions them.
 */
export type ComparisonStratum = {
  profileId: string;
  platform: string;
  audienceClass: AudienceClass;
  metricKey: string;
  /**
   * The non-empty, sorted set of strategy document versions that declared the
   * exact metric tuple represented by this stratum.  Document identity is
   * provenance, not the pooling predicate: two versions with byte-for-byte
   * identical declarations are one metric population.
   */
  metricDeclaredByDocIds: readonly string[];
  observedFrom: Date;
  observedTo: Date;
};

/**
 * ABSENT IS NEVER ZERO (R12), as a THREE-STATE UNION rather than a number
 * plus a flag.
 *
 * This is the shape `spendVisibility` already uses on `/usage` — three states,
 * and the middle one is the point: `short` is "we have some and it is not
 * enough", which is a different sentence from "there is nothing here". No
 * fourth state is invented, and a caller cannot render `short` or `none` as a
 * bar at zero because neither carries a number to draw: `medianPer1k` exists
 * ONLY on `present`. That is the guarantee made structural instead of
 * remembered.
 *
 * `needed` is how many MORE observations the population wants, so a screen can
 * say "two more results" without doing arithmetic on a constant it should not
 * be reading.
 */
export type Population =
  | { state: "present"; n: number; medianPer1k: number; resultIds: string[] }
  | { state: "short"; n: number; needed: number; resultIds: string[] }
  // AMENDMENT 3 (2026-09-04): `readonly string[]`, not the empty tuple `[]`.
  // The tuple narrowed the UNION member's element type to `never`, so
  // `resultIds.includes(id)` failed to compile on every caller — a type error
  // in the contract that all three builders paid for.
  | { state: "none"; n: 0; needed: number; resultIds: readonly string[] }
  /**
   * WE DID NOT COUNT EVERYTHING (2026-09-04). A FOURTH STATE, and the reason
   * it is not folded into `short` is the whole point of having it.
   *
   * `short` and `none` mean *"we counted the creator's whole eligible history
   * and there is not enough of it"*. This means *"the read was clipped, so we
   * do not know how much there is"*. Collapsing the two tells a creator their
   * history is thin when it is merely unread — the opposite error, and the
   * worse one on the screen whose job is honesty about how much evidence
   * exists.
   *
   * THERE IS NO `n`, NO `needed` AND NO `medianPer1k` ON THIS VARIANT, and
   * every absence is load-bearing rather than tidy:
   *
   *   - `n` would be read as a count by any caller doing `population.n`, and
   *     a floor printed as a count is exactly the false sentence this state
   *     exists to prevent. `atLeast` cannot be misread, and its absence from
   *     the other three variants means a uniform `population.n` does not
   *     compile — the union is the forcing function, not a comment.
   *   - `needed` is unanswerable: how many more observations a clipped
   *     population wants is a number nobody has.
   *   - `medianPer1k` would be a median of whichever rows the reader happened
   *     to return, presented as the median of the creator's own history. That
   *     is the claim the module exists to refuse.
   *
   * A CONSEQUENCE, NOT A SEPARATE RULE: this state is not `present`, so
   * `effectPer1k` and `improvement` are null through the check that was
   * already there. No second guard is added — a redundant one would be
   * unkillable by any single mutation, which this file has already measured
   * twice.
   */
  | { state: "truncated"; atLeast: number; resultIds: string[] };

/**
 * ONE LEVER, ONE COMPARISON (R9). Reach and conversion are returned as
 * separate values and there is no field on this type that holds both: there is
 * no code path in this package producing one score, including a summary.
 *
 * `effectPer1k` IS THE PLAIN DIFFERENCE `treatment - baseline`, NOT
 * direction-normalised: a normalised effect would make the sign mean "better",
 * which is the inference `direction` exists to prevent, and it would invert
 * for every `lower_is_better` metric.
 *
 * SO "BETTER" IS A FIELD, DECIDED ONCE (amendment 2, 2026-09-04). The original
 * contract said the effect was signed by the direction AND that better was
 * never inferable from the sign, which cannot both hold. The resolution is
 * neither reading alone: the delta stays plain, and `improvement` is THE ONE
 * SITE in this product that decides the word. 9a's screen renders it and never
 * re-derives it from the sign; 9b's R14 "direction-normalized" reading IS this
 * field. One field rather than two computations for the codebase's own reason,
 * from `generations.brainActivationId`'s docblock: duplicating a derivation
 * creates "a second answer … and the two could disagree with nothing to
 * adjudicate".
 */
export type LeverComparison = {
  lever: Lever;
  treatment: Population;
  baseline: Population;
  /**
   * The signed difference `treatment - baseline`, ZEROED when `improvement` is
   * `unchanged` — see the derivation site for why the verdict decides the
   * number rather than the other way round.
   *
   * `null` unless BOTH populations are `present`, and never 0 as a stand-in
   * for an absence: `0` here means a complete comparison that came out level,
   * which is a different fact from having nothing to compare.
   */
  effectPer1k: number | null;
  /** Carried so a reader can interpret the sign. Never itself an interpretation. */
  direction: MetricDirection;
  /**
   * THE ONLY SITE THAT DECIDES "BETTER" (amendment 2). Null exactly when
   * `effectPer1k` is null — an absent comparison has no verdict, which is R12
   * applied to a word instead of to a bar.
   *
   * NOT CREATOR-FACING COPY. The identifier contains "improv", which
   * `tests/support/forbidden-claims.ts` bans on every creator-facing surface
   * (R-8: nothing here learns or improves). This is a WIRE VALUE inside a
   * package — the three states a screen maps to its own words — and the ban is
   * on what a screen SAYS. A screen must not render this field's name, and the
   * claim it licenses is about one past post against one past baseline, never
   * about the product getting better.
   */
  improvement: Improvement | null;
  unit: string;
  confoundersPresent: ConfounderCode[];
};

/** The three readings of a signed delta, once the metric's direction is known. */
export type Improvement = "better" | "worse" | "unchanged";

/**
 * An input this module will not compare.
 *
 * IT THROWS RATHER THAN SKIPS, and that is the whole decision. Silently
 * dropping a malformed row would make a median quietly narrower than the
 * creator's own result list, which is the dishonest half of every option here.
 *
 * TWO KINDS, AND THE DIFFERENCE IS LOAD-BEARING — an earlier version of this
 * docblock said every one of them was database-enforced, which was false for
 * the second kind and made the whole class look unreachable:
 *
 *   CONSTRAINT-BACKED — the row shapes. A half lever pair, a denominator of
 *     zero or less, a non-finite value, `observed_to <= observed_from`. Each
 *     is refused by a CHECK on `results` (C2), so reaching one means the row
 *     did not come from that table, and a comparison over rows of unknown
 *     provenance is not a weaker comparison but a different thing wearing the
 *     name. These are genuinely unreachable from a scoped read.
 *
 *   CALLER-CONTRACT — everything the DATABASE CANNOT SEE, because it is about
 *     the call rather than the row: a blank treatment key, a stratum window
 *     that ends before it starts, a row from a profile the caller did not ask
 *     for, a `declaredMetrics` map with no entry for a version a row names,
 *     and a row whose `metricKey` disagrees with the version it points at. No
 *     CHECK can reach across a table or into an argument, so these ARE
 *     reachable — from a caller bug, from a strategy version that was never
 *     read, from a map built off the wrong list.
 *
 * WHY THE SPLIT IS WORTH WRITING DOWN: a caller-contract throw is reachable at
 * runtime, and one of them escaping to a page takes the whole screen down
 * rather than the group it is about. Which throws are constraint-backed is
 * what makes that containment scopeable — the fix belongs at the caller and it
 * only has to reach this second list.
 */
export class ComparisonInputError extends Error {}

/**
 * THE ULP BUDGET — how much of a difference this module's own arithmetic can
 * manufacture, counted rather than chosen.
 *
 * Every rounding on the path from stored strings to a delta, worst case:
 *
 *   per-1k, per median:  `Number(value)`, `Number(denominator)`, the divide,
 *                        the multiply by 1000                      = 4
 *   median, even n:      the `a + b`; the `/ 2` is exact for normals = 1
 *   two medians:                                          (4 + 1) x 2 = 10
 *   the subtraction:                                                  = 1
 *                                                                    ----
 *                                                                      11
 *
 * IEEE-754 gives each rounding a relative error of at most ε/2, so the
 * accumulated absolute error on the delta is at most 5.5 ε x scale. K is the
 * OPERATION COUNT, which makes the bound exactly twice that — the factor of
 * two being the difference between counting operations and tracking half-ulps.
 * It is not a margin chosen for comfort, and raising it is a claim about a
 * longer arithmetic path, not about creators.
 */
const IMPROVEMENT_ULP_BUDGET = 11;

/**
 * "BETTER", DECIDED ONCE (amendment 2), AND "UNCHANGED" DECIDED AGAINST THE
 * ARITHMETIC RATHER THAN AGAINST A TASTE (2026-09-04).
 *
 * WHAT THIS IS NOT: a tolerance band. A band is a claim about the DOMAIN —
 * "differences below this do not matter to a creator" — and nobody has data
 * for that; PRD §5's metric is earned in the post-M6 pilot. Two earlier
 * proposals were refused on exactly that ground and the refusals stand.
 *
 * WHAT THIS IS: a claim about the COMPUTATION. Below this bound the two
 * medians are not distinguishable BY THE ARITHMETIC THAT PRODUCED THEM, which
 * is a checkable fact about IEEE doubles rather than a judgement about people.
 * Nothing here decides which real differences a creator may see.
 *
 * AND IT IS RELATIVE, WHICH IS THE WHOLE POINT. Float noise is not SMALL, it
 * is ~1e-16 OF THE OPERANDS' OWN MAGNITUDE. An absolute threshold cannot tell
 * `0.1 + 0.2 - 0.3` (noise, at a scale of 0.3) from a per-1k of 0.00004
 * against 0.00008 (a doubling — genuinely different, merely tiny), because it
 * is asking the wrong question. A relative one separates them exactly, and
 * `packages/brain/tests/comparison.test.ts` pins BOTH halves: without the
 * second, "always unchanged for small numbers" passes the first completely.
 *
 * NO REAL DIFFERENCE IS EVER COLLAPSED, and the margin is not close: the lever
 * columns are `numeric(24,8)`, so the smallest difference the database can
 * even store is ~1e-8 of a unit, while this bound is ~2.4e-15 of the values'
 * own magnitude. A stored difference is many orders of magnitude above it.
 *
 * `scale` IS `max(|treatment|, |baseline|)`, not the delta: the error is
 * carried by the operands, and using the delta as its own scale would make the
 * test self-referential and always true.
 */
function improvementOf(
  delta: number,
  scale: number,
  direction: MetricDirection
): Improvement {
  if (Math.abs(delta) <= Number.EPSILON * IMPROVEMENT_ULP_BUDGET * Math.abs(scale)) {
    return "unchanged";
  }
  const higherIsBetter = direction === "higher_is_better";
  return delta > 0 === higherIsBetter ? "better" : "worse";
}

/** The two levers, in a fixed output order. C1's `RESULT_LEVERS`, as types. */
const LEVERS: readonly Lever[] = ["reach", "conversion"];

/**
 * WHICH EVIDENCE STATES ARE NUMERICAL — an ALLOWLIST of exactly ONE state,
 * never `!== "unquantified"`.
 *
 * VERIFIED ONLY (R-115, Phase 10a C1; CLAUDE.md rule 4 "unverified never
 * learns"). `quantified_self_reported` used to be numerical here, which put a
 * creator's own typed numbers into every median, effect, window, group head,
 * evidence digest and result proposal. It is now stored and displayed with its
 * label and enters NONE of those: adding, deleting or changing a self-reported
 * row leaves every verified derivative byte-identical, and
 * `comparison.test.ts` pins that with a planted row on both populations.
 *
 * Written as an allowlist so a fourth evidence state added later does not
 * enter every cohort by default, silently, with a moved median as the first
 * sign; written as ONE state so the day a real connector mints
 * `connector_verified` this module is not the thing that has to change.
 */
function isNumerical(result: ComparisonResultInput): boolean {
  return result.evidenceState === "connector_verified";
}

/**
 * The treatment key, NORMALISED to "this result is in no treatment cohort".
 *
 * C4: a result with no generation has no derivable key, is eligible for the
 * BASELINE and never for a treatment cohort. Null and blank are the same fact
 * arriving in two shapes — an empty string in a NOT NULL column is a
 * fabricated key, and matching on it would sweep every keyless result into the
 * cohort being tested.
 */
function normalisedKey(result: ComparisonResultInput): string | null {
  const key = result.treatmentKey;
  if (key === null || key.trim() === "") return null;
  return key;
}

/**
 * PER 1K = value / denominator * 1000 (R8, C5 rule 2).
 *
 * Returns `null` when the row does not report this lever at all — which is
 * ordinary: a creator who logged reach and not conversion has a result, not a
 * broken one. Everything else THROWS, because it is a shape C2's CHECKs
 * forbid:
 *   - half a pair. A value without a denominator is a ratio with no
 *     denominator, and REQ-F01's whole objection to unperiodised rates.
 *   - a denominator of zero or less. "A per-1k over a zero denominator is not
 *     a small number, it is undefined" — returning Infinity here would put
 *     that undefined value into a median and out onto a screen.
 *   - anything that does not parse as a finite number.
 */
function per1k(result: ComparisonResultInput, lever: Lever): number | null {
  const raw =
    lever === "reach"
      ? { value: result.reachValue, denominator: result.reachDenominator }
      : { value: result.conversionValue, denominator: result.conversionDenominator };
  if (raw.value === null && raw.denominator === null) return null;
  if (raw.value === null || raw.denominator === null) {
    throw new ComparisonInputError(
      `result ${result.id}: ${lever} has half a pair (value and denominator are stored together or not at all)`
    );
  }
  const value = Number(raw.value);
  const denominator = Number(raw.denominator);
  if (!Number.isFinite(value)) {
    throw new ComparisonInputError(`result ${result.id}: ${lever} value is not a finite number`);
  }
  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new ComparisonInputError(
      `result ${result.id}: ${lever} denominator must be greater than zero — a per-1k over a zero denominator is undefined, not small`
    );
  }
  return (value / denominator) * 1000;
}

/**
 * MEDIAN, NEVER MEAN (C5 rule 1). "A mean over a handful of results is moved
 * by one outlier, and one outlier is exactly what a creator is trying to
 * find."
 *
 * NOT `@respin/trends`' `medianRecentViews`, and the divergence is stated so
 * nobody reads it as a missed reuse: that one refuses non-integers by design
 * because it medians view COUNTS. A per-1k is a rational, so this one takes
 * finite numbers — `per1k` above is the thing that refuses the values a count
 * function would.
 */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function populationOf(
  rows: readonly ComparisonResultInput[],
  values: readonly number[],
  truncated: boolean
): Population {
  const resultIds = rows.map((row) => row.id);
  // TRUNCATION DOMINATES EVERY OTHER STATE, INCLUDING `none`. A clipped read
  // that returned no row for this population is not evidence that the creator
  // has none: the rows that would have qualified may simply be the ones the
  // reader stopped before. "We found nothing" and "we stopped looking" are
  // different sentences and only one of them is true here.
  if (truncated) return { state: "truncated", atLeast: rows.length, resultIds };
  const n = rows.length;
  if (n === 0) return { state: "none", n: 0, needed: MIN_COMPARABLE_RESULTS, resultIds: [] };
  if (n < MIN_COMPARABLE_RESULTS) {
    return { state: "short", n, needed: MIN_COMPARABLE_RESULTS - n, resultIds };
  }
  return { state: "present", n, medianPer1k: median(values), resultIds };
}

/** Every predicate of the stratum, applied to one row. */
function inStratum(result: ComparisonResultInput, stratum: ComparisonStratum): boolean {
  return (
    result.profileId === stratum.profileId &&
    result.platform === stratum.platform &&
    result.audienceClass === stratum.audienceClass &&
    result.metricKey === stratum.metricKey &&
    stratum.metricDeclaredByDocIds.includes(result.metricDeclaredByDocId) &&
    result.observedFrom.getTime() >= stratum.observedFrom.getTime() &&
    result.observedTo.getTime() <= stratum.observedTo.getTime()
  );
}

/**
 * ONE BUILDER, shared by 9a's screen and 9b's proposal construction (R10). A
 * second cohort builder is how the same word comes to mean two things in one
 * product, so there is one.
 *
 * `results` IS ALREADY PROFILE-SCOPED BY THE CALLER — every query goes through
 * `withWorkspace`, which is not this package's job and never becomes it. The
 * profile predicate is re-applied here anyway, and WHAT IT PROVES DEPENDS
 * ENTIRELY ON WHERE `stratum.profileId` CAME FROM: against a caller-supplied
 * stratum it is a real check, and against one derived from the rows it would
 * be self-referential and could not fail. `buildComparisonGroups` takes the
 * expected profile as its own argument for exactly that reason (see its
 * `profileId` parameter) — the guard is only worth its string compare when
 * the expectation comes from outside the data (REQ-A03, R-9).
 *
 * THE COHORTS, stated exactly:
 *   treatment = eligible ∧ numerical ∧ reports this lever ∧ carries the key
 *   baseline  = eligible ∧ numerical ∧ reports this lever
 *               ∧ NOT in the treatment cohort ∧ does NOT carry the key
 *
 * BOTH BASELINE EXCLUSIONS ARE WRITTEN, and their relationship is stated
 * rather than left for a reader to work out: in 9a the treatment cohort IS
 * the set of key-carrying eligible rows, so the two exclusions are redundant —
 * either alone removes the same rows. They are both here because 9b defines
 * cohort membership by `proposal_evidence_results` join rows instead, at which
 * point a key-carrying row that is NOT in the cohort becomes expressible and
 * the id exclusion stops being redundant. The honest consequence, recorded
 * because a mutation matrix that hides it is worse than one that admits it:
 * deleting EITHER exclusion alone changes no behaviour in 9a and no test can
 * see it; deleting both does, and does go red.
 */
export function buildLeverComparisons(args: {
  stratum: ComparisonStratum;
  treatmentKey: string;
  results: readonly ComparisonResultInput[];
  metricDirection: MetricDirection;
  metricUnit: string;
  /**
   * THE CALLER'S REPORT ABOUT ITS OWN READ: true when more results matched
   * this stratum than `results` contains.
   *
   * REQUIRED, WITH NO DEFAULT, and the reason is CLAUDE.md's 2026-08-26
   * lesson in its sharpest form: a defaulted flag is a guard whose false
   * branch every caller takes for free, and the day a paging reader forgets
   * to report a clip, the screen keeps saying "n = 3, 2 more needed" about a
   * page instead of a history. Only the reader knows; it cannot be derived
   * here, and `results.length` is not the answer — a page that happens to
   * come back short of its limit still may have been limited.
   *
   * BOTH BRANCHES ARE DRIVEN by `packages/brain/tests/comparison.test.ts`,
   * because a required parameter reads exactly like a guard and is not one
   * until a test takes the other path.
   */
  resultsTruncated: boolean;
}): LeverComparison[] {
  const { stratum, results, metricDirection, metricUnit, resultsTruncated } = args;
  const treatmentKey = args.treatmentKey;

  if (treatmentKey.trim() === "") {
    // Without this, `normalisedKey` returning null for a keyless row would
    // still not match — but a blank key names no treatment at all, and a
    // comparison of "everything" against "nothing" is not the honest reading
    // of an empty argument.
    throw new ComparisonInputError(
      "treatmentKey is blank — a comparison needs a treatment to be about (C4: the key is server-computed from the generation, never typed)"
    );
  }
  if (
    !Array.isArray(stratum.metricDeclaredByDocIds) ||
    stratum.metricDeclaredByDocIds.length === 0
  ) {
    throw new ComparisonInputError(
      "the stratum must name at least one metric-declaring strategy version"
    );
  }
  if (
    stratum.metricDeclaredByDocIds.some(
      (id) => typeof id !== "string" || id.trim() === ""
    ) ||
    new Set(stratum.metricDeclaredByDocIds).size !==
      stratum.metricDeclaredByDocIds.length
  ) {
    throw new ComparisonInputError(
      "the stratum's metric-declaring strategy versions must be distinct non-blank ids"
    );
  }
  if (stratum.observedTo.getTime() <= stratum.observedFrom.getTime()) {
    throw new ComparisonInputError("the stratum window must end after it starts");
  }
  for (const result of results) {
    if (result.observedTo.getTime() <= result.observedFrom.getTime()) {
      throw new ComparisonInputError(`result ${result.id}: observed_to must be after observed_from`);
    }
  }

  const eligible = results.filter((result) => inStratum(result, stratum));
  const numerical = eligible.filter(isNumerical);

  return LEVERS.map((lever) => {
    const measured = numerical
      .map((result) => ({ result, value: per1k(result, lever) }))
      .filter((entry): entry is { result: ComparisonResultInput; value: number } => entry.value !== null);

    const treatmentRows = measured.filter(({ result }) => normalisedKey(result) === treatmentKey);
    const treatmentIds = new Set(treatmentRows.map(({ result }) => result.id));
    const baselineRows = measured.filter(
      ({ result }) => !treatmentIds.has(result.id) && normalisedKey(result) !== treatmentKey
    );

    // BOTH SIDES, ALWAYS TOGETHER. A clipped read does not say WHICH side
    // lost rows — the rows nobody read carry no key — so a comparison built
    // from one is a comparison built from neither.
    const treatment = populationOf(
      treatmentRows.map((entry) => entry.result),
      treatmentRows.map((entry) => entry.value),
      resultsTruncated
    );
    const baseline = populationOf(
      baselineRows.map((entry) => entry.result),
      baselineRows.map((entry) => entry.value),
      resultsTruncated
    );

    // THE VERDICT IS DECIDED FIRST AND THE NUMBER FOLLOWS IT, so the word and
    // the figure on the screen agree BY CONSTRUCTION rather than by a rule a
    // caller has to remember (2026-09-04).
    //
    // THE DEFECT THAT SETTLED THE ORDER: `/results` derived the SIDE of a
    // difference from the raw sign while taking its READING from `improvement`,
    // and rendered "5.68434e-14 above the median … which is neither side of
    // it" — the screen producing a second answer from the sign, which is the
    // exact thing making `improvement` the sole site was meant to prevent.
    //
    // SO A TIE REPORTS ZERO, NOT THE CRUMB. Below the ulp budget the two
    // medians are not distinguishable by the arithmetic that produced them, so
    // `5.68e-14` is the overclaim and `0` is the honest number; `Math.sign(0)`
    // is `0`, so a side derived from the sign is naturally neither.
    //
    // ZERO, NEVER NULL, and the distinction is R12 applied to a word: `null`
    // means "there is no comparison" (a population is `short`, `none` or
    // `truncated`), while a tie is a COMPLETE comparison over two present
    // populations that came out level. Collapsing them would render an absence
    // sentence for a real result and would break the biconditional
    // `improvement === null` <=> `effectPer1k === null`.
    //
    // STILL ONE BOUND AND ONE DERIVATION SITE: `improvementOf` owns the
    // threshold, and the raw delta is never read by anything except it.
    let effectPer1k: number | null = null;
    let improvement: Improvement | null = null;
    if (treatment.state === "present" && baseline.state === "present") {
      const rawDelta = treatment.medianPer1k - baseline.medianPer1k;
      improvement = improvementOf(
        rawDelta,
        Math.max(Math.abs(treatment.medianPer1k), Math.abs(baseline.medianPer1k)),
        metricDirection
      );
      effectPer1k = improvement === "unchanged" ? 0 : rawDelta;
    }

    return {
      lever,
      treatment,
      baseline,
      effectPer1k,
      direction: metricDirection,
      improvement,
      unit: metricUnit,
      // The confounders of the results this comparison is actually MADE of —
      // shown with it, not filed away (REQ-F02). Sorted so the output is
      // stable for a snapshot and for a screen; deduplicated because a flag
      // carried by four results is one caveat, not four.
      //
      // UNDER A TRUNCATED READ THIS LIST IS ITSELF A FLOOR: it names the
      // confounders of the rows that were read and cannot name one carried
      // only by a row that was not. It is still emitted, because a real
      // confounder is worth showing even when the list may be incomplete —
      // but a screen may not say "these are the confounders" beside a
      // `truncated` population.
      confoundersPresent: [
        ...new Set(
          [...treatmentRows, ...baselineRows].flatMap(({ result }) => result.confounders)
        ),
      ].sort(),
    };
  });
}

/**
 * The declared north-star metric, as `@respin/db`'s `declaredMetricOf` returns
 * it (C3). Structural, for the reason `src/vocabulary.ts` gives: this package
 * names the shape it reads and does not import the module that stores it.
 */
export type DeclaredMetric = {
  key: string;
  label: string;
  unit: string;
  direction: MetricDirection;
};

/**
 * The complete metric declaration is the pooling identity.  It is deliberately
 * a canonical tuple rather than a document id: a harmless Strategy edit must
 * not split one metric population, while any visible declaration change must.
 */
export function metricDeclarationKey(metric: DeclaredMetric): string {
  return JSON.stringify([metric.key, metric.label, metric.unit, metric.direction]);
}

/** One treatment, in one stratum, with both its levers. */
export type ComparisonGroup = {
  stratum: ComparisonStratum;
  treatmentKey: string;
  comparisons: LeverComparison[];
};

/**
 * A GROUPING KEY THAT CANNOT COLLIDE.
 *
 * `JSON.stringify` of the tuple, never `parts.join("|")`: a treatment key is
 * itself a `|`-joined string (C4), so a separator-joined grouping key would let
 * two different tuples produce one string and silently merge two strata. There
 * is no separator to get wrong here.
 */
function tupleKey(parts: readonly string[]): string {
  return JSON.stringify(parts);
}

/** The four predicates that define a stratum, before its window is derived. */
function stratumParts(
  of: Pick<ComparisonResultInput, "platform" | "audienceClass" | "metricKey">,
  declarationKey: string
): readonly string[] {
  return [of.platform, of.audienceClass, of.metricKey, declarationKey];
}

/**
 * EVERY COMPARISON A SCOPED RESULT SET SUPPORTS — grouping AND comparison, in
 * one package, deliberately.
 *
 * WHY THE GROUPING IS HERE AND NOT IN `@respin/db` (2026-09-04). The obvious
 * seam was for the scoped accessor to partition rows and call the lever builder
 * once per group. PARTITIONING IS THE COMPARABILITY DECISION: deciding which
 * results belong in one stratum is the same judgement `inStratum` makes, and
 * splitting it across two packages gives the product two places that decide
 * what is comparable, with nothing to adjudicate when they disagree. That is
 * the slice-8c shape — two packages holding halves of one contract, each suite
 * testing its own half — so `@respin/db` decides nothing about comparability:
 * it scopes, fetches, calls this, and returns.
 *
 * AGREEMENT IS BY CONSTRUCTION, NOT BY CARE. This function computes no
 * membership. It derives each stratum and hands `buildLeverComparisons` THE
 * WHOLE ROW SET, so `inStratum` — one predicate, one implementation — decides
 * every population. The equality is asserted directly in
 * `packages/brain/tests/comparison.test.ts`: each group equals what the lever
 * builder returns for that stratum over the same rows.
 *
 * A KEYLESS RESULT FORMS NO GROUP AND STILL FEEDS EVERY BASELINE IT MATCHES
 * (C4). Groups are keyed by a non-blank treatment key, so a generation-less
 * result never becomes a cohort of its own; because the whole row set is passed
 * to every group, it stays eligible for the baseline of each stratum it belongs
 * to. That is the honest half of a result about a post this product did not
 * write, and it is easy to drop silently.
 *
 * THE WINDOW IS THE ENVELOPE OF THE STRATUM, NOT OF THE COHORT. It spans every
 * row sharing the four predicates, whatever its treatment key. Deriving it from
 * the treatment rows alone is the quiet disaster available here: a creator's
 * earlier results almost always PRECEDE the thing being tested, so a
 * cohort-shaped window would empty nearly every baseline and tell creators with
 * plenty of history that they have none.
 *
 * WHAT THIS CANNOT SEE, stated before it returns anything: under a truncated
 * read the SET OF GROUPS may itself be incomplete — a treatment key whose every
 * row went unread produces no group at all, and nothing here can name a group
 * it never saw. Every population it does return is marked `truncated`, which is
 * the part that is expressible.
 */
export function buildComparisonGroups(args: {
  /**
   * WHOSE RESULTS THESE ARE, from the caller's MINTED SCOPE — never read off a
   * row.
   *
   * This is the whole difference between a guard that proves the set is
   * homogeneous and one that proves it is the right creator's.
   *
   * WHY IT IS A PLAIN `string` AND NOT `@respin/db`'s BRANDED
   * `VerifiedProfileId` — NOT a preference, and not a trade anyone can make
   * later. `@respin/db` DEPENDS ON THIS PACKAGE: that edge is what lets its
   * scoped reader fetch and then call the comparison, and it is the reason
   * `buildLeverComparisons` is reachable from the code that owns the tenancy
   * cage at all. Importing a brand from `@respin/db` would point the edge back
   * and make the two packages a CYCLE. The acyclic direction is also what lets
   * `src/vocabulary.ts` mirror the closed sets with a pinning test instead of
   * importing them. So the compile-time property — "you cannot pass a row's
   * own id" — is genuinely unavailable, and this docblock plus the check
   * below is its substitute. A later reader tempted to re-propose the brand
   * should read this paragraph rather than discover the cycle by building it.
   *
   * Every returned stratum carries THIS id, so `inStratum`'s profile predicate
   * is checking against the caller's expectation rather than against itself.
   */
  profileId: string;
  /** ALL scoped rows the accessor returned, not a pre-filtered subset. */
  results: readonly ComparisonResultInput[];
  /**
   * The accessor's report about its own read — the same fact
   * `buildLeverComparisons` takes as `resultsTruncated`, one level up.
   *
   * IT PROPAGATES TO EVERY GROUP, pessimistically. A clipped read does not clip
   * one stratum tidily: the rows nobody read carry no platform, no class and no
   * key, so there is no way to tell which strata lost members. When you cannot
   * tell which were affected, all of them were.
   */
  truncated: boolean;
  /**
   * The declared metric of each strategy version present, BY `brain_docs` ROW
   * ID — a map, and the plural is the whole point.
   *
   * DEVIATION FROM THE SKETCHED SIGNATURE, stated rather than absorbed: the
   * seam note proposed a single declared-metric value for the call (the name is
   * left un-backticked deliberately: it is a shape from the seam note that this
   * file does not declare, and a citation to a symbol nobody defines is what
   * `tests/symbol-citations.test.ts` exists to catch). Groups are keyed by
   * A single call routinely spans multiple versions. Tuple-equivalent versions
   * pool, while any label/unit/direction/key change partitions; a single
   * declaration value could not make that decision. A map is the smallest
   * shape that preserves each version's provenance and full semantic tuple.
   */
  declaredMetrics: ReadonlyMap<string, DeclaredMetric>;
}): ComparisonGroup[] {
  const { profileId, results, truncated, declaredMetrics } = args;

  const declaredFor = (result: ComparisonResultInput): DeclaredMetric => {
    const declared = declaredMetrics.get(result.metricDeclaredByDocId);
    if (declared === undefined) {
      throw new ComparisonInputError(
        `no declared metric for brain_docs ${result.metricDeclaredByDocId} — a comparison cannot label a number with a unit it was not given (C3)`
      );
    }
    if (declared.key !== result.metricKey) {
      throw new ComparisonInputError(
        `result ${result.id} names metric ${result.metricKey} but brain_docs ${result.metricDeclaredByDocId} declares ${declared.key} (C3)`
      );
    }
    return declared;
  };

  // EVERY ROW AGAINST THE CALLER'S OWN PROFILE ID, never against row zero.
  //
  // THE DEFECT THIS REPLACES (brain-tenancy gate, 2026-09-04): the expectation
  // used to be `results[0]!.profileId`, which proves the set is HOMOGENEOUS and
  // says nothing about WHOSE it is. A set belonging uniformly to another
  // creator passed cleanly, and `inStratum`'s own profile predicate could not
  // catch it either, because the stratum was built from that same row — a check
  // comparing a value to itself. There was no live leak (`comparableResults` is
  // caged), and this is the layer whose docblock made the claim, so this is the
  // layer that has to be able to fail.
  //
  // REFUSED RATHER THAN PARTITIONED, still: grouping by profile would pool
  // nothing and would put another creator's results on this creator's screen,
  // which REQ-A03 and R-9 make a leak rather than a wider answer.
  if (profileId.trim() === "") {
    throw new ComparisonInputError(
      "profileId is blank — a comparison must name whose results it is over, and a blank expectation is one every row would satisfy (REQ-A03, R-9)"
    );
  }
  for (const result of results) {
    if (result.profileId !== profileId) {
      throw new ComparisonInputError(
        `result ${result.id} belongs to profile ${result.profileId}, not the ${profileId} this call is scoped to (REQ-A03, R-9)`
      );
    }
  }
  // THIS EARLY RETURN IS DELIBERATELY BELOW THE ARGUMENT CHECKS, and the order
  // is load-bearing rather than incidental: a BLANK expectation is satisfied by
  // every row, including none of them, so hoisting this to the top of the
  // function — the "obvious" place for it — would let a blank `profileId`
  // through unexamined whenever the read came back empty. Tidying this back is
  // a silent widening of the one check that says whose results these are.
  if (results.length === 0) return [];

  // Resolve every referenced declaration before grouping.  A keyless row is a
  // baseline candidate, so silently skipping its declaration would let a
  // changed unit/direction enter a population under the wrong label.
  const declarationByResultId = new Map<string, DeclaredMetric>();
  for (const result of results) declarationByResultId.set(result.id, declaredFor(result));

  // Each stratum's window envelope, over EVERY row in it.
  const windows = new Map<string, { from: Date; to: Date }>();
  for (const result of results) {
    const key = tupleKey(stratumParts(result, metricDeclarationKey(declarationByResultId.get(result.id)!)));
    const current = windows.get(key);
    if (current === undefined) {
      windows.set(key, { from: result.observedFrom, to: result.observedTo });
      continue;
    }
    if (result.observedFrom.getTime() < current.from.getTime()) {
      current.from = result.observedFrom;
    }
    if (result.observedTo.getTime() > current.to.getTime()) {
      current.to = result.observedTo;
    }
  }

  // One group per (stratum, treatment key), over the rows that HAVE a key.
  const heads = new Map<
    string,
    { result: ComparisonResultInput; treatmentKey: string }
  >();
  for (const result of results) {
    const treatmentKey = normalisedKey(result);
    if (treatmentKey === null) continue;
    const key = tupleKey([
      ...stratumParts(result, metricDeclarationKey(declarationByResultId.get(result.id)!)),
      treatmentKey,
    ]);
    if (!heads.has(key)) heads.set(key, { result, treatmentKey });
  }

  const groups: ComparisonGroup[] = [];
  for (const { result, treatmentKey } of heads.values()) {
    const declared = declarationByResultId.get(result.id)!;
    const declarationKey = metricDeclarationKey(declared);
    const window = windows.get(tupleKey(stratumParts(result, declarationKey)))!;
    const metricDeclaredByDocIds = [...new Set(
      results
        .filter(
          (row) =>
            row.platform === result.platform &&
            row.audienceClass === result.audienceClass &&
            row.metricKey === result.metricKey &&
            metricDeclarationKey(declarationByResultId.get(row.id)!) === declarationKey
        )
        .map((row) => row.metricDeclaredByDocId)
    )].sort();
    const stratum: ComparisonStratum = {
      profileId,
      platform: result.platform,
      audienceClass: result.audienceClass,
      metricKey: result.metricKey,
      metricDeclaredByDocIds,
      observedFrom: window.from,
      observedTo: window.to,
    };
    groups.push({
      stratum,
      treatmentKey,
      comparisons: buildLeverComparisons({
        stratum,
        treatmentKey,
        results,
        metricDirection: declared.direction,
        metricUnit: declared.unit,
        resultsTruncated: truncated,
      }),
    });
  }

  // A DETERMINISTIC ORDER, so a screen, a snapshot and a second run agree.
  // Input order is the accessor's ORDER BY and grouping loses it anyway.
  const sortKey = (group: ComparisonGroup) =>
    tupleKey([
      ...stratumParts(group.stratum, metricDeclarationKey({
        key: group.stratum.metricKey,
        label: declaredMetrics.get(group.stratum.metricDeclaredByDocIds[0]!)!.label,
        unit: group.comparisons[0]!.unit,
        direction: group.comparisons[0]!.direction,
      })),
      group.treatmentKey,
    ]);
  return groups.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
}

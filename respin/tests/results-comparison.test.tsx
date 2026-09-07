// The comparison screen's four hard rules (slice 9a: R9, R11, R12, C5 rule 6).
//
// WHAT THIS FILE IS FOR, and what it deliberately is NOT. It tests the SCREEN:
// that a `short` population is named rather than drawn, that both id sets are
// inspectable, that reach and conversion are rendered apart and never summed,
// and that no absence is ever a bar at zero. The arithmetic — the median, the
// per-1k, the two baseline exclusions, the paid/organic separation — belongs to
// `@respin/brain` and is pinned there. Two suites, two questions; a screen test
// that re-derived a median would be the second implementation contract C5
// exists to prevent.
//
// EVERY FIXTURE IS A `Population` OR A `LeverComparison` AS THE PACKAGE
// DEFINES THEM, structurally. `app/**` may not import `@respin/brain`
// (`eslint.config.mjs`'s catch-all), so the compile-time witness that these
// shapes still match lives in `app/(product)/results/projection.ts`, whose
// mapping functions take the facade's own types. This file drives the view
// types; that file proves they are the package's.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { blankComments } from "./support/app-surface";
import { describe, expect, it } from "vitest";

import {
  ComparisonGroup,
  type ComparisonGroupView,
  type LeverComparisonView,
  type PopulationView,
} from "../app/(product)/results/comparison-view";
import { ResultsView, type ResultRowView } from "../app/(product)/results/results-view";
import {
  COMPARISON_BASIS,
  DESCRIPTIVE_NOT_PROOF,
  RESULT_DISPLAY_SIGNIFICANT_DIGITS,
  UNPRINTABLE_NUMBER,
  displayRounded,
  formatNumber,
} from "../app/(product)/results/copy";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const present = (n: number, median: number, ids: string[]): PopulationView => ({
  state: "present",
  n,
  medianPer1k: median,
  resultIds: ids,
});

const short = (n: number, needed: number, ids: string[]): PopulationView => ({
  state: "short",
  n,
  needed,
  resultIds: ids,
});

const none = (needed: number): PopulationView => ({
  state: "none",
  n: 0,
  needed,
  resultIds: [],
});

/** The fourth state: the read was clipped, so the count is a floor. */
const truncated = (atLeast: number, ids: string[]): PopulationView => ({
  state: "truncated",
  atLeast,
  resultIds: ids,
});

const lever = (p: Partial<LeverComparisonView> = {}): LeverComparisonView => ({
  lever: "reach",
  treatment: present(3, 120, ["t-1", "t-2", "t-3"]),
  baseline: present(4, 90, ["b-1", "b-2", "b-3", "b-4"]),
  effectPer1k: 30,
  improvement: "better",
  direction: "higher_is_better",
  unit: "follows",
  confoundersPresent: [],
  ...p,
});

const group = (levers: LeverComparisonView[]): ComparisonGroupView => ({
  treatmentKey: "fw-1@2|hooks|act-9|follows_per_1k",
  platform: "TikTok",
  audienceClass: "organic",
  metricKey: "follows_per_1k",
  metricDeclaredByDocId: "bd-1",
  observedFrom: "2026-08-01",
  observedTo: "2026-08-08",
  levers,
});

const render = (levers: LeverComparisonView[]) =>
  renderToStaticMarkup(<ComparisonGroup group={group(levers)} index={0} />);

const has = (html: string, testId: string) =>
  html.includes(`data-testid="${testId}"`);

// ------------------------------------------------------------------- R12
//
// ABSENT IS NEVER ZERO. This is the requirement with the longest history in
// this repo — `/usage`'s `spendVisibility` exists for the same defect, one
// screen over — and the failure it names is specific: a population with no
// median rendered as a bar at the left edge, indistinguishable from a measured
// zero.

describe("R12: an absent population is named, never drawn", () => {
  it("a SHORT treatment names which population is short and by how many", () => {
    const html = render([
      lever({ treatment: short(2, 1, ["t-1", "t-2"]), effectPer1k: null }),
      lever({ lever: "conversion" }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("treatment group");
    expect(text).toContain("has 2 results in this group");
    // Singular, and it says the NUMBER of results rather than a percentage —
    // "one more result" is the whole of what a creator can act on.
    expect(text).toContain("One more result in the same group would make one.");
    // The bar is not drawn for this lever, and the effect is not either.
    expect(has(html, "results-comparison-0-reach-meter")).toBe(false);
    expect(has(html, "results-comparison-0-reach-effect")).toBe(false);
    expect(has(html, "results-comparison-0-reach-effect-absent")).toBe(true);
  });

  it("a MISSING baseline says so with its own shortfall, in results not percentages", () => {
    const html = render([
      lever({ baseline: none(3), effectPer1k: null }),
      lever({ lever: "conversion" }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("baseline has no results at all");
    expect(text).toContain("3 more results");
    expect(has(html, "results-comparison-0-reach-meter")).toBe(false);
  });

  it("BOTH populations short: the absence names BOTH shortfalls, not 'not enough data'", () => {
    const html = render([
      lever({
        treatment: short(1, 2, ["t-1"]),
        baseline: short(2, 1, ["b-1", "b-2"]),
        effectPer1k: null,
      }),
      lever({ lever: "conversion" }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("the treatment group is 2 short");
    expect(text).toContain("your baseline is 1 short");
    expect(text).toContain("an absence is not a result of zero");
  });

  it("NO ZERO IS RENDERED FOR AN ABSENCE — the number 0 appears nowhere in an absent lever", () => {
    // The direct form of the requirement, and the one a mutation reaches: M6
    // ("`short`/`none` population renders 0") is exactly a screen printing a
    // median of 0 or drawing a zero-width bar. Both `data-testid`s are absent
    // and no median line exists to carry a number.
    const html = render([
      lever({ treatment: none(3), baseline: none(3), effectPer1k: null }),
      lever({ lever: "conversion", treatment: none(3), baseline: none(3), effectPer1k: null }),
    ]);
    expect(has(html, "results-comparison-0-reach-treatment-median")).toBe(false);
    expect(has(html, "results-comparison-0-reach-baseline-median")).toBe(false);
    expect(has(html, "results-comparison-0-conversion-treatment-median")).toBe(false);
    expect(has(html, "meter-baseline")).toBe(false);
  });

  it("a MEASURED zero is a number and says so — it is not the same as an absence", () => {
    // The other direction, and the one a fix for the rule above would break: a
    // creator who genuinely converted nobody has a median of zero, and that is
    // a fact. It is printed; only the BAR is withheld, with its reason.
    const html = render([
      lever({
        treatment: present(3, 0, ["t-1", "t-2", "t-3"]),
        baseline: present(3, 0, ["b-1", "b-2", "b-3"]),
        effectPer1k: 0,
      }),
      lever({ lever: "conversion" }),
    ]);
    expect(has(html, "results-comparison-0-reach-treatment-median")).toBe(true);
    expect(has(html, "results-comparison-0-reach-effect")).toBe(true);
    expect(has(html, "results-comparison-0-reach-meter")).toBe(false);
    expect(has(html, "results-comparison-0-reach-no-bar")).toBe(true);
    expect(html.replace(/<[^>]+>/g, " ")).toContain(
      "the larger of the two medians is not a positive number"
    );
  });

  it("a NEGATIVE median draws NO MARK — clamping it to 0 was drawing an absence", () => {
    // TWO GATES FOUND THIS INDEPENDENTLY. `Meter` clamped at 0, so a median
    // BELOW zero rendered identically to one AT zero and to a bar of nothing —
    // the absence-drawn-as-zero failure this whole screen is built against,
    // arriving inside the primitive it draws with. The earlier "not positive"
    // sentence covered only the case where BOTH medians are non-positive; a
    // mixed pair drew a bar with a lying mark on it.
    const html = render([
      lever({
        treatment: present(3, -20, ["t-1", "t-2", "t-3"]),
        baseline: present(3, 60, ["b-1", "b-2", "b-3"]),
        effectPer1k: -80,
        improvement: "worse",
      }),
    ]);
    // The scale is positive, so a meter IS rendered — and the negative value
    // places no fill, rather than a fill at the left edge.
    expect(has(html, "results-comparison-0-reach-meter")).toBe(true);
    expect(html).not.toContain('class="meter-fill"');
    // The baseline is positive here, so its tick is still drawn: the rule is
    // per-mark, not per-meter.
    expect(has(html, "meter-baseline")).toBe(true);
    // ...and both numbers are still printed in words, which is what the
    // creator actually reads.
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("-20");
    expect(text).toContain("60");
  });

  it("a NEGATIVE BASELINE places no tick, for the same reason", () => {
    const html = render([
      lever({
        treatment: present(3, 60, ["t-1", "t-2", "t-3"]),
        baseline: present(3, -20, ["b-1", "b-2", "b-3"]),
        effectPer1k: 80,
        improvement: "better",
      }),
    ]);
    expect(has(html, "results-comparison-0-reach-meter")).toBe(true);
    expect(html).toContain('class="meter-fill"');
    expect(has(html, "meter-baseline")).toBe(false);
  });

  it("a NEGATIVE median is not described as zero — the no-bar sentence stays true", () => {
    // Found by re-reading the diff rather than by a failure: `results`
    // constrains a DENOMINATOR to be positive and does not constrain a value,
    // so a negative median is representable, and the sentence that used to
    // read "Both medians are zero" would have been printed directly above two
    // numbers that are not zero.
    const html = render([
      lever({
        treatment: present(3, -2, ["t-1", "t-2", "t-3"]),
        baseline: present(3, -5, ["b-1", "b-2", "b-3"]),
        effectPer1k: 3,
      }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toContain("Both medians are zero");
    expect(text).toContain("not a positive number");
    expect(text).toContain("-2");
    expect(text).toContain("-5");
  });

  it("a TRUNCATED population is not called short — it says the count is a FLOOR", () => {
    // THE OPPOSITE ERROR FROM `short`, and the reason the package gave it its
    // own state. `short` means "we counted your whole eligible history and
    // there is not enough of it"; `truncated` means "the read was clipped, so
    // nobody knows how much there is". Telling a creator their history is thin
    // when it is merely unread is the worse mistake on the screen whose job is
    // honesty about how much evidence exists.
    const html = render([
      lever({ treatment: truncated(4, ["t-1", "t-2", "t-3", "t-4"]), effectPer1k: null, improvement: null }),
      lever({ lever: "conversion" }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(has(html, "results-comparison-0-reach-treatment-truncated")).toBe(true);
    expect(text).toContain("was not read in full");
    expect(text).toContain("at least 4 results");
    expect(text).toContain("that is a floor, not a count");
    expect(text).toContain("This is not the same as having too few");
    // IT MUST NOT BORROW `short`'s SENTENCE, in either direction.
    expect(has(html, "results-comparison-0-reach-treatment-absent")).toBe(false);
    expect(text).not.toContain("so there is no median to show. One more result");
    expect(text).not.toMatch(/is d+ short/);
    // No median, no bar, no effect — the same three absences as every other
    // non-present state.
    expect(has(html, "results-comparison-0-reach-treatment-median")).toBe(false);
    expect(has(html, "results-comparison-0-reach-meter")).toBe(false);
    expect(has(html, "results-comparison-0-reach-effect")).toBe(false);
  });

  it("a truncated population's SHORTFALL is never invented in the effect sentence", () => {
    // The bug the union prevented: `shortBy()` returned a number for every
    // non-present state, so a truncated population would have printed "the
    // treatment group is 0 short" — a false statement about a creator's own
    // history, over a read that was merely clipped.
    const text = render([
      lever({
        treatment: truncated(2, ["t-1", "t-2"]),
        baseline: short(2, 1, ["b-1", "b-2"]),
        effectPer1k: null,
        improvement: null,
      }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("the treatment group was not read in full");
    expect(text).toContain("your baseline is 1 short");
    expect(text).not.toContain("the treatment group is 0 short");
  });

  it("a truncated population still shows the ids it DID read", () => {
    const html = render([
      lever({ baseline: truncated(2, ["b-1", "b-2"]), effectPer1k: null, improvement: null }),
    ]);
    expect(has(html, "results-comparison-0-reach-baseline-ids")).toBe(true);
    expect(html).toContain(">b-1<");
  });

  it("a floor of one is singular, because a creator reads the sentence", () => {
    const text = render([
      lever({ treatment: truncated(1, ["t-1"]), effectPer1k: null, improvement: null }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("at least 1 result ");
    expect(text).not.toContain("at least 1 results");
  });

  it("a present pair DOES draw the bar, with the baseline tick labelled in words", () => {
    // Non-vacuity for every assertion above: the bar exists when both
    // populations are present and the scale is positive, so "no meter" is a
    // decision this screen takes rather than a component nobody wired.
    const html = render([lever(), lever({ lever: "conversion" })]);
    expect(has(html, "results-comparison-0-reach-meter")).toBe(true);
    expect(has(html, "meter-baseline")).toBe(true);
    // DESIGN.md: status is never colour-only. The 2px tick carries words.
    expect(html).toContain('aria-label="Your own baseline: 90 follows per 1,000 over 4 results"');
  });
});

// ------------------------------------------------------------------- R11

describe("R11: both id sets are inspectable, on the screen that shows the comparison", () => {
  it("the treatment ids and the baseline ids are each listed, separately", () => {
    const html = render([lever(), lever({ lever: "conversion" })]);
    expect(has(html, "results-comparison-0-reach-treatment-ids")).toBe(true);
    expect(has(html, "results-comparison-0-reach-baseline-ids")).toBe(true);
    for (const id of ["t-1", "t-2", "t-3", "b-1", "b-2", "b-3", "b-4"]) {
      expect(html).toContain(`>${id}<`);
    }
  });

  it("a SHORT population still shows the ids it does have", () => {
    // A creator told "your baseline is one short" needs to see which two
    // results it counted, or the sentence is unauditable.
    const html = render([
      lever({ baseline: short(2, 1, ["b-1", "b-2"]), effectPer1k: null }),
      lever({ lever: "conversion" }),
    ]);
    expect(has(html, "results-comparison-0-reach-baseline-ids")).toBe(true);
    expect(html).toContain(">b-1<");
    expect(html).toContain(">b-2<");
  });

  it("an EMPTY set says it is empty rather than rendering an empty list", () => {
    const html = render([
      lever({ baseline: none(3), effectPer1k: null }),
      lever({ lever: "conversion" }),
    ]);
    expect(has(html, "results-comparison-0-reach-baseline-ids-empty")).toBe(true);
  });

  it("the treatment KEY is rendered verbatim, so the sixth predicate is inspectable too", () => {
    const html = render([lever(), lever({ lever: "conversion" })]);
    expect(html).toContain("fw-1@2|hooks|act-9|follows_per_1k");
  });
});

// ------------------------------------------------------------------- R9

describe("R9: reach and conversion are rendered apart and never summed", () => {
  it("each lever gets its own block, its own populations and its own effect", () => {
    const html = render([
      lever({ effectPer1k: 12.5 }),
      lever({ lever: "conversion", effectPer1k: 7.25 }),
    ]);
    expect(has(html, "results-comparison-0-reach")).toBe(true);
    expect(has(html, "results-comparison-0-conversion")).toBe(true);
    expect(has(html, "results-comparison-0-reach-effect")).toBe(true);
    expect(has(html, "results-comparison-0-conversion-effect")).toBe(true);
  });

  it("NO SUMMARY SCORE: the sum of the two effects appears nowhere on the card", () => {
    // The M8 mutation ("reach and conversion summed into one score") has a
    // signature, and this is it. The two effects are chosen so their sum is a
    // number that could not appear by coincidence — 12.5 + 7.25 = 19.75 — and
    // the same for the two medians (120 + 40 = 160).
    const html = render([
      lever({ effectPer1k: 12.5, treatment: present(3, 120, ["t-1", "t-2", "t-3"]) }),
      lever({
        lever: "conversion",
        effectPer1k: 7.25,
        treatment: present(3, 40, ["t-1", "t-2", "t-3"]),
      }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text, "the two effects were added into one score").not.toContain("19.75");
    expect(text, "the two medians were added into one score").not.toContain("160");
    // Non-vacuity: the parts really are on the screen, so their absence as a
    // sum is a property of the screen rather than of an empty render.
    expect(text).toContain("12.5");
    expect(text).toContain("7.25");
    expect(text).toContain("120");
    expect(text).toContain("40");
  });

  it("the card SAYS there is no combined score, on the card itself", () => {
    expect(has(render([lever()]), "results-comparison-0-two-levers")).toBe(true);
  });

  it("a CLAMPED list says so, and an unclamped one claims nothing", () => {
    // The `/usage` lesson applied to a second screen: the reader pages, so a
    // list that showed 50 of 300 rows under a heading reading "everything you
    // have logged" would be a page presenting part of a creator's record as
    // the whole of it. Both directions are asserted, because a note that is
    // always shown is as dishonest as one that never is.
    const one: ResultRowView = {
      id: "r-1",
      platform: "TikTok",
      audienceClass: "organic",
      observedFrom: "2026-08-01",
      observedTo: "2026-08-08",
      evidenceState: "unquantified",
      metricKey: "follows_per_1k",
      levers: [
        { lever: "reach", value: null, denominator: null },
        { lever: "conversion", value: null, denominator: null },
      ],
      confounders: [],
      treatmentKey: null,
      note: null,
    };
    const render = (moreResults: boolean) =>
      renderToStaticMarkup(
        <ResultsView
          state={{
            kind: "ready",
            profileName: "Ada",
            metric: {
              label: "Follows",
              key: "follows_per_1k",
              unit: "follows",
              direction: "higher_is_better",
            },
            results: [one],
            moreResults,
            comparisonError: null,
            comparisons: [],
          }}
        />
      );
    expect(has(render(true), "results-list-clamped")).toBe(true);
    expect(render(true).replace(/<[^>]+>/g, " ")).toContain(
      "the rest are not shown here"
    );
    expect(has(render(false), "results-list-clamped")).toBe(false);
    // And the heading never claims completeness in either case.
    expect(render(false)).not.toContain("Everything you have logged");
  });

  it("the results LIST shows both levers on every row too", () => {
    // "Every result view shows reach and conversion separately" is about every
    // view, not only the comparison — so the log list carries the same rule,
    // including for a result that reported neither.
    const row: ResultRowView = {
      id: "r-1",
      platform: "TikTok",
      audienceClass: "organic",
      observedFrom: "2026-08-01",
      observedTo: "2026-08-08",
      evidenceState: "unquantified",
      metricKey: "follows_per_1k",
      levers: [
        { lever: "reach", value: null, denominator: null },
        { lever: "conversion", value: null, denominator: null },
      ],
      confounders: [],
      treatmentKey: null,
      note: null,
    };
    const html = renderToStaticMarkup(
      <ResultsView
        state={{
          kind: "ready",
          profileName: "Ada",
          metric: {
            label: "Follows",
            key: "follows_per_1k",
            unit: "follows",
            direction: "higher_is_better",
          },
          results: [row],
          moreResults: false,
          comparisonError: null,
          comparisons: [],
        }}
      />
    );
    expect(has(html, "results-row-lever-reach")).toBe(true);
    expect(has(html, "results-row-lever-conversion")).toBe(true);
    // AND NOT A ZERO for the lever it did not report.
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("not reported");
    expect(text).not.toMatch(/\b0 out of\b/);
  });
});

// ------------------------------------------------------- direction, not sign

describe("'better' is the builder's reading, never this screen's arithmetic", () => {
  it("a positive difference under lower_is_better is named as the WRONG direction", () => {
    const html = render([
      lever({ direction: "lower_is_better", effectPer1k: 30, improvement: "worse" }),
      lever({ lever: "conversion" }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("above the median");
    expect(text).toContain("the opposite of the direction you declared");
  });

  it("a negative difference under lower_is_better is named as the DECLARED direction", () => {
    const html = render([
      lever({ direction: "lower_is_better", effectPer1k: -30, improvement: "better" }),
      lever({ lever: "conversion" }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("below the median");
    expect(text).toContain("the direction you declared you want");
  });

  it("THE SIGN DOES NOT DECIDE — and it no longer decides the SIDE either", () => {
    // THIS TEST USED TO ASSERT THE COUPLING THAT WAS THE DEFECT. It drove a
    // positive delta carrying `worse` and expected "above the median",
    // because the side was read off the sign while the reading came from
    // `improvement` — the two halves that produced the self-contradicting
    // sentence. Both now come from the verdict, so "worse" under
    // higher-is-better reads BELOW whatever the sign says.
    const text = render([
      lever({ direction: "higher_is_better", effectPer1k: 30, improvement: "worse" }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("below the median");
    expect(text).not.toContain("above the median");
    expect(text).toContain("the opposite of the direction you declared");
  });

  it("a reading the builder could not make is SAID, not guessed", () => {
    const text = render([
      lever({ effectPer1k: 30, improvement: null }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain(
      "the direction of your declared metric could not be read"
    );
  });

  it("a difference of exactly zero is level with the baseline, neither side", () => {
    const html = render([
      lever({
        effectPer1k: 0,
        improvement: "unchanged",
        treatment: present(3, 90, ["t-1", "t-2", "t-3"]),
      }),
      lever({ lever: "conversion" }),
    ]);
    expect(html.replace(/<[^>]+>/g, " ")).toContain("came out level with");
  });

  it("states the observed side from the signed effect even when lower is better", () => {
    const text = render([
      lever({ direction: "lower_is_better", effectPer1k: -30, improvement: "better" }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("This treatment was lower than this baseline in these observations.");
  });

  it("uses level wording for an unchanged observed comparison", () => {
    const text = render([
      lever({ effectPer1k: 0, improvement: "unchanged", treatment: present(3, 90, ["t-1", "t-2", "t-3"]) }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("This treatment was level with this baseline in these observations.");
  });

  it("the effect is stated in the PAST TENSE, about posts that already went out", () => {
    const text = render([lever()]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("That is what those posts did, once, already.");
  });
});

// ------------------------------------------------------------- confounders

describe("REQ-F02: confounders travel WITH the comparison", () => {
  it("flags the creator set are listed beside the effect, in words", () => {
    const html = render([
      lever({ confoundersPresent: ["topic_overlap", "account_growth"] }),
    ]);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(has(html, "results-comparison-0-reach-confounders")).toBe(true);
    expect(text).toContain("much the same topic");
    expect(text).toContain("My following changed a lot");
  });

  it("a code with no words renders as the CODE rather than disappearing", () => {
    // Narrowing what a creator said about their own result is the one failure
    // mode a label map must not have.
    const html = render([
      lever({ confoundersPresent: ["a_code_this_screen_has_never_heard_of"] }),
    ]);
    expect(html).toContain("a_code_this_screen_has_never_heard_of");
  });

  it("none flagged says so, and says it was the creator's answer, not a check we ran", () => {
    const html = render([lever({ confoundersPresent: [] })]);
    expect(has(html, "results-comparison-0-reach-no-confounders")).toBe(true);
    expect(html.replace(/<[^>]+>/g, " ")).toContain("not a check this product ran");
  });
});

// ------------------------------------------------------- the display precision
//
// EXPORTED BECAUSE A SECOND READER NEEDS IT. `@respin/brain` decides the word
// beside a difference, and the resolution taken for `improvement` is that
// "unchanged" should mean "the number we are showing you is zero". That makes
// this screen's rounding a shared fact, so these tests pin BOTH halves: that
// the rendered figure really is `displayRounded`, and — measured, because it
// is the thing a second reader will get wrong — exactly what that rounding
// can and cannot do.
//
// THIS SCREEN ADDS NO SECOND DERIVATION. It does not suppress, reword or
// second-guess `improvement` when its own rendered delta looks like zero:
// that would be a second place deciding "better", which is the two-answers
// problem `improvement` was made one field to prevent. The package computes
// the word; this screen renders it, and these tests are about the NUMBER only.

describe("the display precision is a named, shared constant", () => {
  it("formatNumber IS displayRounded plus String — one rounding, not two", () => {
    for (const v of [12.5, 7.25, 120, 0.0004, -30, 1 / 3, 1e21, 123456789]) {
      expect(formatNumber(v)).toBe(String(displayRounded(v)));
    }
  });

  it("the constant is what the rounding applies, and it is SIGNIFICANT digits", () => {
    // The name says SIGNIFICANT because the operation has to travel with the
    // number: 6 applied as toFixed(6) and 6 applied as toPrecision(6) are
    // different answers, and a bare number crossing a package boundary would
    // let the verdict and the printed figure diverge in exactly the way
    // sharing a constant is meant to prevent.
    // 123456789 is the witness because the two operations AGREE on 1/3 and on
    // most small values — a fixture that cannot tell them apart would make
    // this assertion decoration. Six significant digits is 123457000; six
    // decimal places is 123456789.
    const v = 123456789;
    expect(displayRounded(v)).toBe(
      Number(v.toPrecision(RESULT_DISPLAY_SIGNIFICANT_DIGITS))
    );
    expect(displayRounded(v)).toBe(123457000);
    expect(displayRounded(v)).not.toBe(
      Number(v.toFixed(RESULT_DISPLAY_SIGNIFICANT_DIGITS))
    );
    expect(RESULT_DISPLAY_SIGNIFICANT_DIGITS).toBe(6);
  });

  it("MEASURED: this rounding HAS NO ZERO — float noise survives it", () => {
    // The property a second reader must know before deciding "unchanged" by
    // `displayRounded(delta) === 0`: it would fire on an exact zero and on
    // nothing else, so the float-noise case it was written for is not caught
    // and no test on either side would say so. Driven against real noise
    // rather than argued.
    const noise = [
      0.1 + 0.2 - 0.3,
      120.00000000000001 - 120,
      3.552713678800501e-15,
      1e-300,
      Number.MIN_VALUE,
    ];
    for (const n of noise) {
      expect(n, "this fixture is not actually noise").not.toBe(0);
      expect(displayRounded(n), `${n} collapsed to zero`).not.toBe(0);
    }
    // ...and the only input that rounds to zero is zero itself.
    expect(displayRounded(0)).toBe(0);
  });

  it("MEASURED: a decimal quantum WOULD collapse noise, and would also flatten a real median", () => {
    // The other half of the same finding, so the cost of the alternative is
    // recorded beside it rather than discovered later. A per-1k of 0.00004 is
    // a real number a creator's result can produce, and printing it as "0" is
    // the defect this screen's central rule is about.
    const quantum = (v: number) => Number(v.toFixed(4));
    expect(quantum(3.552713678800501e-15)).toBe(0);
    expect(quantum(0.00004)).toBe(0);
    expect(displayRounded(0.00004)).toBe(0.00004);
    expect(formatNumber(0.00004)).toBe("0.00004");
  });

  it("a non-finite value does NOT borrow REQ-I03's placeholder", () => {
    // `[check]` means one thing: a specific this product would not invent.
    // A number that went wrong is not that, and printing the same token for
    // both gives the placeholder a second meaning on the screen where a reader
    // is being asked to trust figures.
    expect(formatNumber(Number.NaN)).toBe(UNPRINTABLE_NUMBER);
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe(UNPRINTABLE_NUMBER);
    expect(UNPRINTABLE_NUMBER).not.toBe("[check]");
    expect(UNPRINTABLE_NUMBER).not.toContain("check");
  });

  it("the RENDERED effect really is formatNumber's output", () => {
    // The binding that makes the two halves above matter on screen: the
    // sentence a creator reads carries this rounding, not a second one.
    const text = render([
      lever({ effectPer1k: 1 / 3, improvement: "better" }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain(formatNumber(1 / 3));
    expect(formatNumber(1 / 3)).toBe("0.333333");
  });
});

// ---------------------------------------------- the four gate findings, pinned

describe("the SIDE is a function of the verdict and the direction, never of the sign", () => {
  // THE PROPERTY, DRIVEN EXHAUSTIVELY. `improvement` and `direction` fully
  // determine which side of the baseline a treatment sat on, so the number's
  // sign is not consulted — and the way to prove that is to hand the same
  // verdict a delta whose sign CONTRADICTS it and watch the word not move.
  const CASES: readonly [
    "better" | "worse",
    "higher_is_better" | "lower_is_better",
    string,
  ][] = [
    ["better", "higher_is_better", "above"],
    ["better", "lower_is_better", "below"],
    ["worse", "higher_is_better", "below"],
    ["worse", "lower_is_better", "above"],
  ];

  it.each(CASES)(
    "%s under %s reads %s, whichever way the delta is signed",
    (improvement, direction, side) => {
      const other = side === "above" ? "below" : "above";
      for (const delta of [30, -30]) {
        const text = render([
          lever({ improvement, direction, effectPer1k: delta }),
        ]).replace(/<[^>]+>/g, " ");
        expect(text, `delta ${delta} moved the side word`).toContain(
          `${side} the median`
        );
        expect(text).not.toContain(`${other} the median`);
      }
    }
  );

  it("a TIE prints the number it was given and no side word at all", () => {
    // `@respin/brain` returns `effectPer1k` as exactly 0 when it judges a tie,
    // so the verdict and the number agree by construction. This screen prints
    // what it was handed and adds no "looks like zero" rule of its own.
    const text = render([
      lever({ effectPer1k: 0, improvement: "unchanged" }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("came out level with");
    expect(text).toContain("0 follows per 1,000");
    expect(text).not.toContain("above the median");
    expect(text).not.toContain("below the median");
  });

  it("A TINY delta with a REAL verdict is not swallowed as a tie", () => {
    // FOUND BY A SURVIVING MUTATION, not by review: replacing the
    // `improvement === "unchanged"` check with a screen-side
    // `Math.abs(delta) < 1e-12` passed every other test in this file, because
    // no fixture had a SMALL delta carrying a NON-tie verdict. That mutation
    // is the exact second derivation this design forbids.
    //
    // IT IS EXPRESSIBLE UNDER THE REAL CONTRACT, which is why it matters:
    // `@respin/brain` judges ties on a RELATIVE ulp budget against the
    // operands' own scale, so two medians around 1e-13 that differ by 1e-13
    // are a genuine "better" — many orders of magnitude above that budget —
    // and any absolute screen-side threshold would erase them.
    const text = render([
      lever({
        treatment: present(3, 2e-13, ["t-1", "t-2", "t-3"]),
        baseline: present(3, 1e-13, ["b-1", "b-2", "b-3"]),
        effectPer1k: 1e-13,
        improvement: "better",
        direction: "higher_is_better",
      }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("above the median");
    expect(text).toContain("the direction you declared you want");
    expect(text, "a small real difference was rendered as a tie").not.toContain(
      "came out level with"
    );
    expect(text).toContain("1e-13");
  });

  it("A TIE IS A RESULT, NOT AN ABSENCE: the effect is rendered, not the absence sentence", () => {
    // The distinction B refused to collapse: `null` means "there is no
    // comparison" (a population was short, none or truncated); a tie is a
    // COMPLETE comparison over two present populations that came out level.
    // Nulling it would have made this screen print an absence for a real
    // result.
    const html = render([lever({ effectPer1k: 0, improvement: "unchanged" })]);
    expect(has(html, "results-comparison-0-reach-effect")).toBe(true);
    expect(has(html, "results-comparison-0-reach-effect-absent")).toBe(false);
  });

  it("no verdict means no side word, rather than one read off the number", () => {
    const text = render([
      lever({ effectPer1k: 30, improvement: null }),
    ]).replace(/<[^>]+>/g, " ");
    expect(text).toContain("differed from");
    expect(text).toContain("could not be read");
    expect(text).not.toContain("above the median");
    expect(text).not.toContain("below the median");
  });

  it("SOURCE: effectSentence reads no sign, and the screen adds no zero rule", () => {
    // The property above is about behaviour; this is about the code, because
    // a future edit could reintroduce the sign read on a path no fixture
    // covers. Neither file may compare the delta to zero.
    const copySrc = readFileSync(
      join(ROOT, "app", "(product)", "results", "copy.ts"),
      "utf8"
    );
    // COMMENTS BLANKED FIRST. The docblock above this function DESCRIBES the
    // sign-reading defect by name, so a scan over raw source finds its own
    // explanation and fails — the shape where a guard is defeated by the
    // prose documenting it.
    const code = blankComments(copySrc);
    const sentence = code.slice(
      code.indexOf("export function effectSentence"),
      code.indexOf("export function idSetSummary")
    );
    expect(sentence.length, "the slice found no function").toBeGreaterThan(400);
    for (const banned of [
      "differencePer1k > 0",
      "differencePer1k < 0",
      "differencePer1k === 0",
      "Math.sign",
    ]) {
      expect(sentence, `effectSentence reads the sign: ${banned}`).not.toContain(
        banned
      );
    }
  });
});

describe("a clipped read makes both confounder sentences unsayable", () => {
  it("renders the truncated metric/unit block and its confounder limitation together", () => {
    // 9a-C1: this is one rendered unit. The metric/key context and unit may
    // not disappear when the population is truncated, and the confounder copy
    // must switch to its unread limitation in that same state.
    const html = render([
      lever({
        treatment: truncated(4, ["t-1", "t-2", "t-3", "t-4"]),
        effectPer1k: null,
        improvement: null,
        confoundersPresent: ["topic_overlap"],
      }),
    ]);
    expect(html).toContain("Metric <span");
    expect(html).toContain(">follows_per_1k<");
    expect(html).toContain("Measured in <span");
    expect(html).toContain(">follows<");
    expect(has(html, "results-comparison-0-reach-treatment-truncated")).toBe(true);
    expect(has(html, "results-comparison-0-reach-confounders-unread")).toBe(true);
    expect(has(html, "results-comparison-0-reach-confounders")).toBe(false);
  });

  it("neither claim is made beside a TRUNCATED population", () => {
    // `@respin/brain` forbids this in terms: under a truncated population the
    // emitted list is itself a floor, so "a screen may not say 'these are the
    // confounders'". Both branches used to fire, including the emphatic
    // "You flagged nothing" — a positive claim about what a creator did, made
    // from rows nobody finished reading.
    for (const clipped of [
      lever({
        treatment: truncated(4, ["t-1"]),
        effectPer1k: null,
        improvement: null,
        confoundersPresent: ["topic_overlap"],
      }),
      lever({
        baseline: truncated(4, ["b-1"]),
        effectPer1k: null,
        improvement: null,
        confoundersPresent: [],
      }),
    ]) {
      const html = render([clipped]);
      expect(has(html, "results-comparison-0-reach-confounders")).toBe(false);
      expect(has(html, "results-comparison-0-reach-no-confounders")).toBe(false);
      expect(has(html, "results-comparison-0-reach-confounders-unread")).toBe(true);
      expect(html.replace(/<[^>]+>/g, " ")).toContain("there may be others");
    }
  });

  it("NON-VACUITY: an unclipped comparison still makes exactly one of them", () => {
    const withFlags = render([lever({ confoundersPresent: ["topic_overlap"] })]);
    expect(has(withFlags, "results-comparison-0-reach-confounders")).toBe(true);
    expect(has(withFlags, "results-comparison-0-reach-confounders-unread")).toBe(false);
    const without = render([lever({ confoundersPresent: [] })]);
    expect(has(without, "results-comparison-0-reach-no-confounders")).toBe(true);
    expect(has(without, "results-comparison-0-reach-confounders-unread")).toBe(false);
  });
});

describe("the shared sentences claim only what the product can support", () => {
  it("DESCRIPTIVE_NOT_PROOF claims no completeness and attributes no wording", () => {
    // (a) "Anything else that could explain it" was a completeness claim over
    // a CLOSED six-code set. (b) "in your own words" attributed the PRODUCT's
    // labels to the creator, while the one field that is genuinely their words
    // — the note — is excluded from every comparison.
    expect(DESCRIPTIVE_NOT_PROOF).not.toContain("Anything else that could explain it");
    expect(DESCRIPTIVE_NOT_PROOF).not.toContain("in your own words");
    expect(DESCRIPTIVE_NOT_PROOF).toContain("a short fixed list this product offers");
    // AND IT MAKES NO CLAIM ABOUT WHERE THE FLAGS APPEAR. Round 1's fix wrote
    // "shown beside every comparison they are part of", which the truncated
    // branch on the same card contradicts in the opposite direction ("this
    // cannot list what else might explain the comparison… there may be
    // others"). One card, two sentences, and the display claim was the false
    // one. A paragraph printed unconditionally may not describe a rendering
    // that is conditional.
    expect(DESCRIPTIVE_NOT_PROOF).not.toContain("are shown beside");
    expect(DESCRIPTIVE_NOT_PROOF).not.toContain("every comparison they are part of");
    expect(DESCRIPTIVE_NOT_PROOF).toContain("not everything that could explain a difference");
  });

  it("COMPARISON_BASIS does not claim the window is a shared predicate", () => {
    // The window is the min/max ENVELOPE over the rows being compared, so it
    // filters nothing: a January and an August result pool into one card
    // showing a span neither of them covers.
    expect(COMPARISON_BASIS).not.toContain("and an observation window");
    expect(COMPARISON_BASIS).toContain("not a period the compared results all share");
    // AND IT NO LONGER NAMES THE DERIVATION. The second version said "the
    // earliest start and the latest end among them", where "them" reads as the
    // COMPARED results — but the envelope is taken over every row in the
    // STRATUM, before the numerical and per-lever filters run, so one
    // unquantified January result widens the window shown beside June medians.
    // The sentence now says only what the window is NOT and that it is wide
    // enough to hold the group, which stays true whichever set it is taken
    // over — the round-2 lesson that a weaker sentence outlives a precise one.
    expect(COMPARISON_BASIS).not.toContain("among them");
    expect(COMPARISON_BASIS).not.toContain("earliest start");
    expect(COMPARISON_BASIS).toContain("wide enough to hold your results in this group");
  });

  it("names semantic metric-tuple equality, not one Strategy document version", () => {
    expect(COMPARISON_BASIS).toContain("same declared metric tuple — key, label, unit, and direction");
    expect(COMPARISON_BASIS).toContain("more than one version of your strategy");
    expect(COMPARISON_BASIS).not.toContain("same version of your strategy");
  });
});

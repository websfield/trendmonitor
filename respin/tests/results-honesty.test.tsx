// `/results` says nothing this product cannot support (slice 9a, R20).
//
// WHY THIS FILE IS THE WHOLE CONTROL FOR R20. The 9a card states it plainly:
// "R20 is an absence — nothing fails if a screen quietly starts implying a
// comparison predicts the future". There is no schema, no CHECK and no type
// that goes red when a sentence drifts, so the technique is the one
// `tests/usage-honesty.test.tsx` and `tests/landing-pricing.test.ts` use: pin
// the exact strings, drive EVERY rendered state through the shared canon, and
// assert POSITIVELY that the two load-bearing sentences are present with their
// bodies rather than their labels.
//
// `/results` IS THE HARDEST SCREEN IN THE PRODUCT FOR THIS RULE, which is why
// the population below is every state rather than a sample. It is the first
// surface that puts one number about a creator's own posts beside another, and
// a reader turns that into a prediction for free. Everything the canon bans
// about the FUTURE (`will perform`, `outperform`, `beats your baseline`,
// `better than your last`, `proven to`) is a sentence somebody would plausibly
// write here.
//
// NOT_BUILT_YET IS NOT APPLIED. This screen claims to store a result and to
// compare it against the creator's own earlier results, and it does both. What
// it must not do is claim CAPABILITY or CERTAINTY (the canon) or forecast
// PERFORMANCE (`PERFORMANCE_CLAIMS`), and both lists are live here.
//
// ===========================================================================
// WHAT A GREEN RUN OF THIS FILE DOES AND DOES NOT PROVE.
//
// Written out because R20 is an ABSENCE and this suite is its only control:
// a reader who sees 27 green tests beside the words "R20" will believe more
// than is true unless the limit is on the page. `brain-reason.ts`'s header
// makes the same disclosure about the same class of guard, in the same shape
// ("`42000` is catchable, `in Leeds` is not").
//
// IT PROVES THREE THINGS:
//
//   1. NO BANNED WORD REACHES A CREATOR, in any of the states named in
//      `STATES` below (every rendered state of the view, the log control in
//      three configurations, both post-press outcomes) or in ANY entry of the
//      shared refusal-copy table, which this screen's channel can render whole.
//      Non-vacuity is proved per word, against each pattern's own specimen.
//   2. THE TWO R20 SENTENCES ARE STILL RENDERED, with their bodies rather than
//      their labels, in the states that must carry them. This is the control
//      that matters most, because the likely regression is a DELETION in a
//      tidy-up, and a deletion fires no ban.
//   3. THOSE PATTERNS DEMAND THE SENTENCE, proved by driving a plausible
//      weakening of each through them and asserting it is refused.
//
// IT DOES NOT PROVE THAT THIS SCREEN MAKES NO FORECAST. The canon is a list of
// WORDS, and a forecast can be written without one: "expect this to keep
// happening", "your next one should land the same way", "this is the shape
// that works for you now" would all pass every assertion in this file. That is
// a real gap and it is stated rather than papered over, because the two
// available ways to close it are both worse:
//
//   - A BIGGER WORD LIST is a list of counterexamples wearing the word
//     "class". CLAUDE.md's 2026-08-18 lesson is exactly this failure — three
//     rounds of hardening a guard against named counterexamples while the
//     class stayed open — and each new entry makes the list look more complete
//     while covering no more of the space.
//   - AN ALLOWLIST OF PERMITTED SENTENCES would make every copy edit a test
//     edit, which is how a control becomes a formality people route around.
//
// A SECOND THING IT DOES NOT COVER, MEASURED TWICE. This canon scans for
// banned WORDS, and the promise-shaped claims live in patterns held elsewhere
// — the preservation pin in `results-page-wiring.test.tsx`, the R20 markers
// below. That division was demonstrated the hard way on 2026-09-04: a planted
// "We will improve this and nothing was changed." made this file go red on
// `improve` while "nothing was changed" sailed straight through it, into copy
// whose own entry forbids exactly that sentence. It was the SECOND time in two
// rounds that a guard weakened by its author's own edit was found by a planted
// violation and by nothing else. Read that as evidence about the division of
// labour rather than about one mistake: a green run here says nothing about
// the promises, and a green run there says nothing about the words.
//
// SO THE REAL CONTROL FOR "IS THIS SCREEN FORECASTING" IS A PERSON READING IT,
// at the learning-honesty gate, with this paragraph telling them the suite did
// not do it for them. What this file guarantees is that the two sentences that
// FORECLOSE the inference are present and unweakened, and that no creator ever
// sees one of the named words. The judgement is a human's; the regression
// catching is this file's.
// ===========================================================================
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CHECK, RESULT_NOTE_MAX } from "@respin/db";
import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import { claimHits } from "./support/claim-scan";
import {
  BILLING_ERROR_COPY,
  type BillingErrorCode,
} from "../app/(product)/billing-errors";
import {
  COMPARISON_BASIS,
  METRIC_VERSIONS_NOTE,
  DESCRIPTIVE_NOT_PROOF,
  PAST_NOT_PREDICTION,
  TWO_LEVERS_NOTE,
} from "../app/(product)/results/copy";
import { LogOutcome } from "../app/(product)/results/log-outcome";
import { LogPanel, type LogPanelProps } from "../app/(product)/results/log-panel";
import type { LogResultState } from "../app/(product)/results/log-state";
import {
  ResultsView,
  type ResultsViewProps,
  type ResultRowView,
} from "../app/(product)/results/results-view";
import {
  PromotionPanel,
  PromotionReviewDocument,
  type PromotionPanelProps,
} from "../app/(product)/results/promotion-panel";
import type {
  ComparisonGroupView,
  LeverComparisonView,
  PopulationView,
} from "../app/(product)/results/comparison-view";

/** The canon plus the performance half — the two every screen inherits. */
const FORBIDDEN: [string, RegExp][] = [
  ...FORBIDDEN_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
  ...PERFORMANCE_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
];

/** React's `<script>` bootstrap is machinery, not copy — the studio rule. */
const visibleCopy = (html: string) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

const decoded = (html: string) =>
  html
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

// ---------------------------------------------------------------- fixtures
//
// THE UNIT IS NEUTRAL ON PURPOSE ("follows"), and this is a stated limit of
// this scan rather than an oversight. A declared metric's unit is CREATOR
// DATA read from their own strategy document, so a creator whose north-star
// metric is measured in a word the canon bans would put that word on this
// screen and no scan could honestly call it a claim by the product. What these
// fixtures measure is what the SCREEN says; what a creator's own metric is
// called is theirs.
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

const lever = (
  p: Partial<LeverComparisonView> = {}
): LeverComparisonView => ({
  lever: "reach",
  treatment: present(3, 120, ["r-1", "r-2", "r-3"]),
  baseline: present(4, 90, ["r-4", "r-5", "r-6", "r-7"]),
  effectPer1k: 30,
  improvement: "better",
  direction: "higher_is_better",
  unit: "follows",
  confoundersPresent: ["topic_overlap"],
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

const row = (p: Partial<ResultRowView> = {}): ResultRowView => ({
  id: "r-1",
  platform: "TikTok",
  audienceClass: "organic",
  observedFrom: "2026-08-01",
  observedTo: "2026-08-08",
  evidenceState: "quantified_self_reported",
  metricKey: "follows_per_1k",
  levers: [
    { lever: "reach", value: "4000", denominator: "12000" },
    { lever: "conversion", value: "80", denominator: "4000" },
  ],
  confounders: ["topic_overlap"],
  treatmentKey: "fw-1@2|hooks|act-9|follows_per_1k",
  note: "Posted at a different time than usual.",
  ...p,
});

const readyState = (
  p: Partial<Extract<ResultsViewProps["state"], { kind: "ready" }>> = {}
): ResultsViewProps["state"] => ({
  kind: "ready",
  profileName: "Ada",
  metric: {
    key: "follows_per_1k",
    label: "Follows",
    unit: "follows",
    direction: "higher_is_better",
  },
  results: [row()],
  moreResults: false,
  comparisonError: null,
  comparisons: [group([lever(), lever({ lever: "conversion" })])],
  ...p,
});

const panelProps: LogPanelProps = {
  action: async () => ({ status: "idle" }) as LogResultState,
  generations: [{ generationId: "g-1", label: "hooks — 2026-08-01" }],
  platforms: ["TikTok", "Instagram Reels"],
  audienceClasses: ["organic", "paid"],
  evidenceStates: [
    "unquantified",
    "quantified_self_reported",
    "connector_verified",
  ],
  confounderCodes: ["topic_overlap", "account_growth"],
  levers: ["reach", "conversion"],
  noteMax: RESULT_NOTE_MAX,
  block: null,
};

const renderView = (state: ResultsViewProps["state"], withPanel = true) =>
  renderToStaticMarkup(
    <ResultsView
      state={state}
      logPanel={withPanel ? <LogPanel {...panelProps} /> : undefined}
    />
  );

const renderOutcome = (state: LogResultState) =>
  renderToStaticMarkup(<LogOutcome state={state} />);

// A product-built proposal card and its expanded review. Metric label is
// deliberately benign here: it is creator-authored data, which this scan must
// display/attribute rather than treat as product copy.
const promotionReviews = [{
  proposal: {
    id: "p-1", source: "results", status: "proposed", strength: "early",
    payload: { rule: {
      metric: { label: "Follows", key: "follows_per_1k" },
      treatment: { n: 3, medianPer1k: 120 }, baseline: { n: 3, medianPer1k: 90 },
      effectPer1k: 30, pastOutcome: "better", selfReportedN: 6,
      connectorVerifiedN: 0, confounders: ["topic_overlap"],
    } },
  },
  resultEvidence: [{ id: "r-1", role: "treatment" }],
  feedbackEvidence: [],
  learningEligibility: { kind: "verified_results", treatmentN: 3, baselineN: 3 },
  mergedContent: "A product-built, past-observation record.",
  claims: [{ pointer: "/rules/0", displayedValue: "past observation", sourceEvidence: { quote: "past observation", inputClass: "result_summary" } }],
  freshnessToken: "fresh",
}] as unknown as PromotionPanelProps["reviews"];

const promotionAction = async () => ({ status: "idle" } as const);
const renderPromotion = (
  access: PromotionPanelProps["access"] = { kind: "full" }
) => renderToStaticMarkup(
  <>
    <PromotionPanel
      access={access}
      reviews={promotionReviews}
      refreshAction={promotionAction}
      reviewAction={promotionAction}
      decideAction={promotionAction}
      checkMarker={CHECK}
    />
    {/* The panel opens this only after reviewPromotionAction reconstructs a
        fresh review. Rendering it here drives the full-review state through
        the same claim canon rather than scanning only the collapsed card. */}
    <PromotionReviewDocument
      review={promotionReviews[0]!}
      access={access}
      decideAction={promotionAction}
      checkMarker={CHECK}
    />
  </>
);

/**
 * EVERY RENDERED STATE, NAMED — not a sample.
 *
 * The compliance gate's central finding about `/studio` applies word for word:
 * a scan that drives one happy fixture never reads the copy a creator in
 * trouble actually sees, and the states where a screen is most tempted to
 * reassure are exactly the degraded ones. On THIS screen the tempting states
 * are the absences — a creator who logged two results and got no comparison is
 * exactly who a "your next one will do better" sentence is written for.
 */
const STATES: [string, ResultsViewProps["state"]][] = [
  [
    "no creator profile selected",
    {
      kind: "no_profile",
      reason: "There is no creator profile selected for this workspace.",
      onboardingHref: "/onboarding",
    },
  ],
  [
    "no declared north-star metric (R8's refusal)",
    {
      kind: "no_declared_metric",
      detail:
        "A result is a measurement, and a measurement needs a stated unit and a stated direction.",
      brainHref: "/brain",
    },
  ],
  ["nothing logged at all", readyState({ results: [], comparisons: [] })],
  [
    "results logged, nothing comparable",
    { ...readyState({ comparisons: [] }) },
  ],
  ["a result with no numbers at all", readyState({
    results: [
      row({
        evidenceState: "unquantified",
        levers: [
          { lever: "reach", value: null, denominator: null },
          { lever: "conversion", value: null, denominator: null },
        ],
        treatmentKey: null,
        confounders: [],
        note: null,
      }),
    ],
    comparisons: [],
  })],
  [
    "a comparison in the declared direction",
    readyState({ comparisons: [group([lever(), lever({ lever: "conversion" })])] }),
  ],
  [
    "a comparison AGAINST the declared direction",
    readyState({
      comparisons: [
        group([
          lever({ effectPer1k: -30, treatment: present(3, 60, ["r-1", "r-2", "r-3"]) }),
          lever({ lever: "conversion", effectPer1k: -1 }),
        ]),
      ],
    }),
  ],
  [
    "a comparison exactly level with the baseline",
    readyState({
      comparisons: [
        group([
          lever({ effectPer1k: 0, treatment: present(3, 90, ["r-1", "r-2", "r-3"]) }),
          lever({ lever: "conversion", effectPer1k: 0 }),
        ]),
      ],
    }),
  ],
  [
    "a lower-is-better metric",
    readyState({
      metric: {
        key: "cost_per_follow",
        label: "Cost per follow",
        unit: "cost",
        direction: "lower_is_better",
      },
      comparisons: [
        group([
          lever({ direction: "lower_is_better", effectPer1k: -5 }),
          lever({ lever: "conversion", direction: "lower_is_better", effectPer1k: 5 }),
        ]),
      ],
    }),
  ],
  [
    "a treatment group that is short",
    readyState({
      comparisons: [
        group([
          lever({ treatment: short(2, 1, ["r-1", "r-2"]), effectPer1k: null }),
          lever({ lever: "conversion", treatment: none(3), effectPer1k: null }),
        ]),
      ],
    }),
  ],
  [
    "a baseline that does not exist yet",
    readyState({
      comparisons: [
        group([
          lever({ baseline: none(3), effectPer1k: null }),
          lever({ lever: "conversion", baseline: short(1, 2, ["r-9"]), effectPer1k: null }),
        ]),
      ],
    }),
  ],
  [
    "both medians measured at zero (no bar is drawn)",
    readyState({
      comparisons: [
        group([
          lever({
            treatment: present(3, 0, ["r-1", "r-2", "r-3"]),
            baseline: present(3, 0, ["r-4", "r-5", "r-6"]),
            effectPer1k: 0,
          }),
          lever({ lever: "conversion" }),
        ]),
      ],
    }),
  ],
  [
    "nothing this creator flagged as a confounder",
    readyState({
      comparisons: [
        group([
          lever({ confoundersPresent: [] }),
          lever({ lever: "conversion", confoundersPresent: [] }),
        ]),
      ],
    }),
  ],
  [
    "a population the reader clipped, so its count is a floor",
    readyState({
      comparisons: [
        group([
          lever({
            treatment: {
              state: "truncated",
              atLeast: 4,
              resultIds: ["r-1", "r-2", "r-3", "r-4"],
            },
            effectPer1k: null,
            improvement: null,
          }),
          lever({
            lever: "conversion",
            baseline: { state: "truncated", atLeast: 1, resultIds: ["r-9"] },
            effectPer1k: null,
            improvement: null,
          }),
        ]),
      ],
    }),
  ],
  [
    "a comparison read that failed while the rest of the page survived",
    readyState({
      comparisons: [],
      comparisonError: {
        title: "That comparison could not be computed",
        detail:
          "The product could not build a comparison out of results it had already stored, so this page stopped rather than show you part of the picture and let it read as the whole.",
      },
    }),
  ],
  [
    "a clipped population, where no confounder claim may be made",
    readyState({
      comparisons: [
        group([
          lever({
            treatment: { state: "truncated", atLeast: 4, resultIds: ["r-1"] },
            effectPer1k: null,
            improvement: null,
            confoundersPresent: ["topic_overlap"],
          }),
          lever({ lever: "conversion" }),
        ]),
      ],
    }),
  ],
  [
    // A TIE, AS THE BUILDER NOW PRODUCES ONE. This fixture used to pair
    // `unchanged` with a delta of 5.684341886080802e-14, and `no-loss-of-
    // precision` firing on it was worth reading rather than silencing: the
    // literal is not the number it looks like (the nearest double is
    // …8014870e-14), and, more to the point, the STATE was one
    // `@respin/brain` can no longer emit. It returns `effectPer1k` as exactly
    // 0 when it judges a tie, so a non-zero delta carrying `unchanged` was a
    // hand-built combination the producer would never hand over — the
    // fixtures-that-never-meet-the-producer shape this slice's contract was
    // pinned to prevent. Trimming a digit would have kept the impossible
    // state and quieted the rule that found it.
    "a tie: two populations that came out level",
    readyState({
      comparisons: [
        group([
          lever({ effectPer1k: 0, improvement: "unchanged" }),
          lever({ lever: "conversion", effectPer1k: 0, improvement: "unchanged" }),
        ]),
      ],
    }),
  ],
  [
    "a list this page could not show in full",
    readyState({ moreResults: true }),
  ],
  [
    "a result carrying an evidence state this screen has no words for",
    readyState({
      results: [row({ evidenceState: "a_state_from_a_later_slice" })],
      comparisons: [],
    }),
  ],
  [
    "a confounder code this screen has no words for",
    readyState({
      results: [row({ confounders: ["a_code_from_a_later_slice"] })],
      comparisons: [
        group([
          lever({ confoundersPresent: ["a_code_from_a_later_slice"] }),
          lever({ lever: "conversion" }),
        ]),
      ],
    }),
  ],
];

describe("/results claims nothing this product cannot support", () => {
  it("the product-built proposal card and expanded review use the complete shared claim canon", () => {
    const html = decoded(visibleCopy(renderPromotion())).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears on a proposal card or review`).not.toMatch(re);
    }
    expect(html).toContain("metric label is creator-authored data");
  });

  it("the shared canon catches planted forecast and efficacy specimens", () => {
    const plants = [
      "This draft will perform well after you publish it.",
      "This treatment is proven to work for this audience.",
    ];
    for (const plant of plants) {
      expect(
        claimHits(plant, FORBIDDEN).length > 0,
        `the shared canon missed planted copy: ${plant}`
      ).toBe(true);
    }
  });

  it.each(STATES)("%s", (_label, state) => {
    const html = decoded(visibleCopy(renderView(state))).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears on /results`).not.toMatch(re);
    }
  });

  it("the log control offered an evidence state it has no words for", () => {
    // The fallback copy is creator-facing too, and it is exactly the copy a
    // later slice's new state would surface first. `UNKNOWN_EVIDENCE_STATE`
    // says the screen has no wording for it and that this is a gap in the
    // page — a sentence that must not reassure, apologise for the creator, or
    // promise a fix.
    const html = decoded(
      visibleCopy(
        renderToStaticMarkup(
          <LogPanel
            {...panelProps}
            evidenceStates={[
              ...panelProps.evidenceStates,
              "a_state_from_a_later_slice",
            ]}
            confounderCodes={[
              ...panelProps.confounderCodes,
              "a_code_from_a_later_slice",
            ]}
          />
        )
      )
    ).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears on the fallback copy`).not.toMatch(re);
    }
  });

  it("the log control, blocked for a viewer", () => {
    const html = decoded(
      visibleCopy(
        renderToStaticMarkup(
          <LogPanel
            {...panelProps}
            block={{ reason: "You have viewer access to this workspace." }}
          />
        )
      )
    ).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears on the blocked log control`).not.toMatch(re);
    }
  });

  it.each([
    [
      "a result that joins a treatment group",
      {
        status: "recorded",
        resultId: "r-1",
        evidenceState: "quantified_self_reported",
        joinsTreatmentGroup: true,
      } as LogResultState,
    ],
    [
      "a result that is baseline-only",
      {
        status: "recorded",
        resultId: "r-2",
        evidenceState: "unquantified",
        joinsTreatmentGroup: false,
      } as LogResultState,
    ],
  ])("the outcome after a press: %s", (_label, state) => {
    const html = decoded(visibleCopy(renderOutcome(state))).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears after a result is stored`).not.toMatch(re);
    }
  });

  it("EVERY refusal code this screen can render is scanned — the channel is OPEN", () => {
    // `logResultAction` resolves WHATEVER code its catch classifies through
    // `BILLING_ERROR_COPY` and sends the words down with the state, so the
    // population is the WHOLE shared table rather than a closed set this
    // screen chose. Derived from the table, for the 2026-08-29 reason: a
    // remembered list is short by one the first time a new refusal class
    // reaches this action.
    const codes = Object.keys(BILLING_ERROR_COPY) as BillingErrorCode[];
    expect(codes.length).toBeGreaterThan(40);
    for (const code of codes) {
      const html = decoded(
        visibleCopy(
          renderOutcome({
            status: "refused",
            code,
            copy: BILLING_ERROR_COPY[code],
          })
        )
      ).toLowerCase();
      for (const [label, re] of FORBIDDEN) {
        expect(html, `"${label}" appears in /results' refusal for ${code}`).not.toMatch(re);
      }
    }
  });

  it("NON-VACUITY: every banned claim's own specimen really is caught", () => {
    // A typo in one pattern would leave that word sayable while this suite
    // stayed green, because some OTHER pattern matched the injected string.
    // Each specimen is checked against ITS OWN pattern.
    for (const [label, re] of FORBIDDEN) {
      const specimen = CLAIM_SPECIMENS[label];
      expect(specimen, `no specimen for "${label}"`).toBeTruthy();
      expect(specimen.toLowerCase(), `"${label}" pattern matches nothing`).toMatch(re);
    }
  });
});

// -------------------------------------------------------- R20, POSITIVELY
//
// The bans above say what may not appear. They cannot say that the two
// sentences R20 is actually about DID appear — and R20's whole risk is a
// deletion, not an addition: a tidy-up that removes "this is not a forecast"
// breaks nothing and no ban fires. So each sentence is asserted present, with
// its BODY rather than its label, in the states it must be in.
//
// THE PATTERNS DEMAND THE SENTENCE, and the test below proves it by driving a
// LABEL-ONLY version of each through them — the `STUDIO_POSITIVE_ASSERTIONS`
// finding in one line: "a marker plus a keyword is not evidence that a screen
// does the thing; it is evidence that somebody typed the keyword".
const RESULTS_POSITIVE_ASSERTIONS: readonly {
  label: string;
  /** The `data-testid` carrying it, `%i` standing for a card's index. */
  testId: string;
  must: RegExp;
  /** A plausible weakening this pattern must REFUSE. */
  weakened: string;
}[] = [
  {
    label: "says these numbers describe the past and are not a forecast",
    testId: "results-past-not-prediction",
    must: /already published[\s\S]*not a forecast[\s\S]*what your next post will do/i,
    weakened: "These are your results.",
  },
  {
    label: "says a median difference is descriptive, not causal",
    testId: "results-comparison-%i-descriptive",
    must: /description of what happened, not evidence that one thing caused the other/i,
    weakened: "Some things could explain this.",
  },
  {
    label: "says the two levers are never combined into one score",
    testId: "results-comparison-%i-two-levers",
    must: /no combined score[\s\S]*means nothing/i,
    weakened: "Reach and conversion are shown separately.",
  },
];

/** The marker a card at `index` carries for one of the assertions above. */
const cardMarker = (testId: string, index: number) =>
  testId.replace("%i", String(index));

/** Pull one `data-testid`'s own text out of the rendered markup. */
function markerText(html: string, testId: string): string | null {
  const re = new RegExp(
    `<[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</`,
    "i"
  );
  const m = re.exec(html);
  return m === null ? null : decoded(m[1]);
}

describe("R20 is asserted POSITIVELY, because nothing else would notice its removal", () => {
  it("the past-not-a-prediction sentence is on EVERY state of this screen", () => {
    for (const [label, state] of STATES) {
      const text = markerText(renderView(state), "results-past-not-prediction");
      expect(text, `${label} renders no R20 sentence at all`).not.toBeNull();
      expect(text ?? "", `${label} weakened the R20 sentence`).toMatch(
        RESULTS_POSITIVE_ASSERTIONS[0].must
      );
    }
  });

  it("every comparison card carries the descriptive-not-causal sentence and the two-lever rule", () => {
    const html = renderView(readyState({}));
    for (const entry of RESULTS_POSITIVE_ASSERTIONS.slice(1)) {
      const marker = cardMarker(entry.testId, 0);
      const text = markerText(html, marker);
      expect(text, `a comparison card renders no ${marker}`).not.toBeNull();
      expect(text ?? "", `${marker} weakened "${entry.label}"`).toMatch(entry.must);
    }
  });

  it("the rendered comparison basis names the full declared metric tuple", () => {
    const text = markerText(
      renderView(readyState({})),
      "results-comparison-basis"
    );
    expect(text).toBe(COMPARISON_BASIS);
    for (const field of ["key", "label", "unit", "direction"]) {
      expect(text, `the rendered comparison basis omits metric ${field}`).toMatch(
        new RegExp(`\\b${field}\\b`, "i")
      );
    }
  });

  it("THE PATTERNS DEMAND THE SENTENCE: each refuses a label-only weakening", () => {
    // Driven against a plausible rewrite rather than against the empty string:
    // "These are your results." is what a tidy-up produces, and it is exactly
    // what must not satisfy an R20 assertion.
    for (const entry of RESULTS_POSITIVE_ASSERTIONS) {
      expect(
        entry.weakened,
        `"${entry.label}" is satisfied by a sentence that makes none of its claims`
      ).not.toMatch(entry.must);
    }
  });

  it("the three pinned sentences are the ones the screen imports", () => {
    // The constants and the assertions above are two halves of one claim; if
    // the copy is reworded and the pattern is not, this is what says so.
    expect(PAST_NOT_PREDICTION).toMatch(RESULTS_POSITIVE_ASSERTIONS[0].must);
    expect(DESCRIPTIVE_NOT_PROOF).toMatch(RESULTS_POSITIVE_ASSERTIONS[1].must);
    expect(TWO_LEVERS_NOTE).toMatch(RESULTS_POSITIVE_ASSERTIONS[2].must);
  });
});

// AUDIT PHASE 2, P2-A5: the versions sentence and `COMPARISON_BASIS` said
// opposite things — "results measured under different versions are never
// compared" against "matching declarations from more than one version of your
// strategy ARE compared", which is what the code does (the stratum keys on
// `metricDeclarationKey`, not on a version). Both now carry the same four
// tuple clauses.
describe("the metric-versions sentence agrees with the comparison basis (P2-A5)", () => {
  const CLAUSES = ["key, label, unit, and direction", "more than one version of your strategy"];
  const FALSE = /different versions are never compared/i;

  it("both sentences carry the four tuple clauses and the cross-version clause", () => {
    for (const clause of CLAUSES) {
      expect(COMPARISON_BASIS, clause).toContain(clause);
      expect(METRIC_VERSIONS_NOTE, clause).toContain(clause);
    }
    expect(METRIC_VERSIONS_NOTE).not.toMatch(FALSE);
  });

  it("the rendered /results page carries the corrected sentence and never the false one", () => {
    const html = renderToStaticMarkup(
      <ResultsView
        state={{
          kind: "ready",
          profileName: "Ada",
          metric: { label: "Follows", key: "follows_per_1k", unit: "follows", direction: "higher_is_better" },
          results: [],
          moreResults: false,
          comparisonError: null,
          comparisons: [],
        }}
      />
    );
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("key, label, unit, and direction");
    expect(text).not.toMatch(FALSE);
    // PLANTED: the old sentence is what this predicate catches.
    expect("results measured under different versions are never compared with each other").toMatch(FALSE);
  });
});

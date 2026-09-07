// The comparison, rendered. PURE — props in, markup out, no directive, no
// data access — so every state below (present, short, none, no effect, a
// measured zero) is reachable from a test with a fixture instead of a
// database. That is `usage-view.tsx`'s and `studio-view.tsx`'s contract and it
// is what lets the honesty scan read this screen's REAL copy.
//
// ---------------------------------------------------------------------------
// THE TYPES ARE DECLARED HERE AND MAPPED IN `page.tsx`, and that is a decision
// with a precedent rather than a convenience.
//
// `@respin/brain` is DENIED to `app/**` by the negation catch-all in
// `eslint.config.mjs`, and its own index says why: `buildLeverComparisons`
// trusts its caller to have scoped the rows, so the code that fetches through
// `withWorkspace` and the code that compares must not be separated by a
// package boundary a screen can reach across. So this screen cannot name
// `LeverComparison` — the same position `app/(product)/studio/projection.ts`
// is in with respect to `@respin/modes`, and the same answer: name the shape
// STRUCTURALLY, and let ONE mapping function carry the compile-time witness.
//
// THE WITNESS IS THE POINT, not the local type. `page.tsx`'s
// `comparisonGroupView` takes the facade's own composed result type as its
// parameter, so a field renamed, a state added to `Population`, or a third
// lever appearing upstream is a RED TYPECHECK at that map — which is what
// stops this file from becoming a second, drifting copy of the contract
// (CLAUDE.md 2026-09-04: two suites that never meet the other's data).
// ---------------------------------------------------------------------------
//
// R12 IS ENFORCED BY THE SHAPE, NOT BY CARE. `medianPer1k` exists only on
// `present`, so there is no number to draw for a `short` or `none` population
// and no branch in this file can put one on a bar. The `Meter` is rendered in
// exactly one place, under a condition that names both populations.
import { Meter } from "../../ui/meter";
import {
  DESCRIPTIVE_NOT_PROOF,
  MEDIAN_NOTE,
  TWO_LEVERS_NOTE,
  confounderLabel,
  effectSentence,
  formatNumber,
  idSetSummary,
  leverLabel,
  noEffectSentence,
  shortPopulationSentence,
  truncatedPopulationSentence,
  type PopulationGap,
} from "./copy";

/** C5's `Population`, structurally. `medianPer1k` exists only on `present`. */
export type PopulationView =
  | {
      state: "present";
      n: number;
      medianPer1k: number;
      resultIds: readonly string[];
    }
  | { state: "short"; n: number; needed: number; resultIds: readonly string[] }
  | { state: "none"; n: 0; needed: number; resultIds: readonly string[] }
  /**
   * THE READ WAS CLIPPED — the fourth state, and the OPPOSITE error from
   * `short`. It carries `atLeast` and NOT `n`, deliberately: a floor printed
   * as a count is the false sentence the state exists to prevent, and the
   * union is what stops a caller writing `population.n` over it.
   */
  | { state: "truncated"; atLeast: number; resultIds: readonly string[] };

/** C5's `LeverComparison`, structurally. */
export type LeverComparisonView = {
  lever: "reach" | "conversion";
  treatment: PopulationView;
  baseline: PopulationView;
  /** null unless BOTH populations are present. Never 0 as a stand-in. */
  effectPer1k: number | null;
  /**
   * WHICH WAY THE DIFFERENCE READS, once the declared direction is known —
   * CARRIED FROM THE BUILDER, never re-derived here.
   *
   * This screen's first draft computed it from the sign and the direction
   * itself, which is a second implementation of a one-line rule the package
   * already owns (`improvementOf`) — the drift class CLAUDE.md's 2026-09-04
   * entry is about, in miniature. The word a creator reads and the word a
   * proposal will be built from in 9b now have one author.
   *
   * The FIELD NAME upstream contains a word the claims canon bans on any
   * creator-facing surface; this screen maps it to its own words and never
   * renders the value or the name.
   */
  improvement: "better" | "worse" | "unchanged" | null;
  direction: "higher_is_better" | "lower_is_better";
  unit: string;
  confoundersPresent: readonly string[];
};

/** One treatment, in one stratum, with both its levers. */
export type ComparisonGroupView = {
  /**
   * The server-computed treatment key (C4), rendered VERBATIM in mono and
   * never parsed here. Parsing it would make this file a second reader of a
   * format `treatmentKeyFor` owns; showing it is what makes the sixth
   * comparability predicate inspectable rather than implied.
   */
  treatmentKey: string;
  platform: string;
  audienceClass: string;
  /**
   * The declared metric's stable key. The UNIT IS DELIBERATELY NOT HERE.
   *
   * A group-level unit would be a second copy of a fact `LeverComparison`
   * already carries — the "two answers that could disagree with nothing to
   * adjudicate" shape `generations.brainActivationId`'s docblock names, and
   * the one this screen was built with until the seam was reconciled. Each
   * lever states its own unit beside its own number, which is where a unit is
   * load-bearing; the header states the metric it is a unit OF.
   */
  metricKey: string;
  /**
   * THE STRATEGY VERSION THAT DECLARED THE METRIC — carried for IDENTITY, not
   * for display. It is a `brain_docs` uuid: illegible to a creator, and
   * echoing one leaks creation time (the `ProfileAccessError` rule), so no
   * branch in this file renders it. It exists because two strategy versions
   * can declare the same metric key, which makes it the one predicate that
   * tells two otherwise identical cards apart.
   */
  metricDeclaredByDocIds?: readonly string[];
  /** Compatibility projection for the pre-C1 semantic-tuple facade. */
  metricDeclaredByDocId?: string;
  /** ISO days, so the server and the browser agree (the `/usage` `day()` rule). */
  observedFrom: string;
  observedTo: string;
  levers: readonly LeverComparisonView[];
};

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

function IdSet({
  which,
  ids,
  testId,
}: {
  which: string;
  ids: readonly string[];
  testId: string;
}) {
  // R11: BOTH id sets inspectable. A `<details>` rather than a permanent list
  // because a creator reading a comparison is not usually auditing it — but
  // the audit must always be one press away and must never be a different
  // page, where the ids could be re-derived by a second query.
  if (ids.length === 0) {
    return (
      <p className="muted" data-testid={`${testId}-empty`} style={{ margin: 0 }}>
        No results are in this set, so there are no ids to show.
      </p>
    );
  }
  return (
    <details data-testid={testId}>
      <summary>{idSetSummary(which, ids.length)}</summary>
      <ul style={{ ...mono, margin: "var(--sp-2) 0 0", paddingLeft: "1.2rem" }}>
        {ids.map((id) => (
          <li key={id} data-testid={`${testId}-id`}>
            {id}
          </li>
        ))}
      </ul>
    </details>
  );
}

function PopulationBlock({
  which,
  population,
  unit,
  testId,
}: {
  which: string;
  population: PopulationView;
  unit: string;
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      {population.state === "present" ? (
        <>
          <p style={{ margin: 0 }} data-testid={`${testId}-median`}>
            Median{" "}
            <span style={mono}>
              {formatNumber(population.medianPer1k)} {unit}
            </span>{" "}
            per 1,000, over <span style={mono}>{population.n}</span>{" "}
            {population.n === 1 ? "result" : "results"}.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {MEDIAN_NOTE}
          </p>
        </>
      ) : population.state === "truncated" ? (
        // THE FOURTH STATE, AND ITS OWN SENTENCE. Folding it into the absence
        // below would tell a creator their history is thin when it is merely
        // unread — the opposite error, and the worse one here. It says FLOOR,
        // and it says it cannot give a number.
        <p style={{ margin: 0 }} data-testid={`${testId}-truncated`}>
          {truncatedPopulationSentence(which, population.atLeast)}
        </p>
      ) : (
        // THE NAMED ABSENCE (C5 rule 6 / R12). It names WHICH population and
        // BY HOW MANY, and it is a sentence rather than a number, because the
        // failure this exists to prevent is a number: an absent median drawn
        // as zero, or as the creator's single result.
        <p style={{ margin: 0 }} data-testid={`${testId}-absent`}>
          {shortPopulationSentence(which, population.n, population.needed)}
        </p>
      )}
      <IdSet which={which} ids={population.resultIds} testId={`${testId}-ids`} />
    </div>
  );
}

/**
 * WHY a population has no median, in the shape the effect sentence names.
 *
 * IT WAS `shortBy(): number` AND THAT WAS WRONG THE MOMENT A FOURTH STATE
 * EXISTED: a truncated population has no `needed`, and a number returned for
 * it would have printed "the treatment group is 0 short" over a read that was
 * merely clipped — a false statement about a creator's own history, on the
 * screen whose job is honesty about how much of it was looked at. The union
 * refused to compile, which is the union doing its work.
 */
function gapOf(population: PopulationView): PopulationGap {
  if (population.state === "present") return null;
  if (population.state === "truncated") return { kind: "truncated" };
  return { kind: "short", needed: population.needed };
}

function LeverBlock({
  comparison,
  groupTestId,
}: {
  comparison: LeverComparisonView;
  groupTestId: string;
}) {
  const { lever, treatment, baseline, effectPer1k, direction, unit } = comparison;
  const testId = `${groupTestId}-${lever}`;
  const bothPresent =
    treatment.state === "present" && baseline.state === "present";
  // EITHER side clipped is enough: the confounder list is pooled from BOTH
  // populations, so a floor on one is a floor on the list.
  const truncated =
    treatment.state === "truncated" || baseline.state === "truncated";
  // THE ONE PLACE A BAR IS DRAWN, and the condition names every reason not to.
  //
  // `scale > 0` is not defensive tidiness: two medians of zero are a MEASURED
  // fact (a creator can genuinely convert nobody), and `Meter`'s scale would
  // be non-positive, so both the fill and the tick would sit at the left edge
  // — visually identical to the absence this screen refuses to draw. The
  // numbers are still printed above; only the bar is withheld, and the reason
  // is said.
  //
  // THE SENTENCE SAYS "NOT POSITIVE", NOT "ZERO", and the difference is a real
  // one caught by re-reading this file: `results` constrains a DENOMINATOR to
  // be positive and does not constrain a value, so a negative median is
  // representable. "Both medians are zero" would then be a false statement
  // printed directly above two numbers that are not zero.
  const scale =
    bothPresent && treatment.state === "present" && baseline.state === "present"
      ? Math.max(treatment.medianPer1k, baseline.medianPer1k)
      : 0;
  const drawBar = bothPresent && scale > 0;
  return (
    <section
      className="panel"
      data-testid={testId}
      aria-labelledby={`${testId}-heading`}
    >
      <h4 id={`${testId}-heading`} style={{ marginTop: 0 }}>
        {leverLabel(lever)}
      </h4>
      <p className="muted" style={{ margin: 0 }}>
        Measured in <span style={mono}>{unit}</span> per 1,000, and{" "}
        {direction === "higher_is_better"
          ? "you declared that higher is better for this metric."
          : "you declared that lower is better for this metric."}
      </p>

      <h5>This treatment</h5>
      <PopulationBlock
        which="treatment group"
        population={treatment}
        unit={unit}
        testId={`${testId}-treatment`}
      />

      <h5>Your own baseline</h5>
      <PopulationBlock
        which="baseline"
        population={baseline}
        unit={unit}
        testId={`${testId}-baseline`}
      />

      {effectPer1k === null || !bothPresent ? (
        <p data-testid={`${testId}-effect-absent`}>
          {noEffectSentence(gapOf(treatment), gapOf(baseline))}
        </p>
      ) : (
        <>
          <p data-testid={`${testId}-effect`}>
            {effectSentence({
              lever,
              differencePer1k: effectPer1k,
              unit,
              improvement: comparison.improvement,
              // THE OTHER HALF OF WHAT DETERMINES THE SIDE. Passed so
              // `effectSentence` never has to reach for the sign of the number.
              direction,
              treatmentN: treatment.n,
              baselineN: baseline.n,
            })}
          </p>
          <p className="muted" data-testid={`${testId}-past-tense`}>
            This treatment was {effectPer1k === 0 ? "level with" : effectPer1k > 0 ? "higher than" : "lower than"} this baseline in these observations.
          </p>
          <p className="muted" data-testid={`${testId}-outcome-limitation`}>
            This describes past observations, does not establish cause, and is not a forecast.
          </p>
          {drawBar && treatment.state === "present" && baseline.state === "present" ? (
            <div data-testid={`${testId}-meter`}>
              <Meter
                label={`${leverLabel(lever)}: this treatment's median, against your own baseline`}
                value={treatment.medianPer1k}
                max={scale}
                baseline={baseline.medianPer1k}
                baselineLabel={`Your own baseline: ${formatNumber(
                  baseline.medianPer1k
                )} ${unit} per 1,000 over ${baseline.n} results`}
              />
            </div>
          ) : (
            <p className="muted" data-testid={`${testId}-no-bar`}>
              There is no bar to draw here: the larger of the two medians is not
              a positive number, so a bar would have no scale to sit on. The
              numbers above are the whole of what was measured.
            </p>
          )}
        </>
      )}

      {/*
        A CLIPPED READ MAKES BOTH CONFOUNDER SENTENCES UNSAYABLE, and
        `@respin/brain` says so in terms: under a truncated population the
        emitted list "is itself a floor… a screen may not say 'these are the
        confounders' beside a `truncated` population". Both branches below
        fired anyway, including the emphatic empty one — a consumer silently
        breaking a documented cross-package constraint, which is the 8c shape
        this slice's pinned contract exists to stop.

        THE THIRD BRANCH IS FIRST, so neither claim can be reached when either
        population was clipped. "You flagged nothing" is the worse of the two
        to get wrong: it is a positive statement about what a creator did,
        made from rows nobody finished reading.
      */}
      {truncated ? (
        <p className="muted" data-testid={`${testId}-confounders-unread`}>
          Your results were not all read here, so this cannot list what else
          might explain the comparison. Any flags shown elsewhere on this page
          are the ones on the results that were read, and there may be others.
        </p>
      ) : comparison.confoundersPresent.length > 0 ? (
        <div data-testid={`${testId}-confounders`}>
          <p style={{ margin: "var(--sp-3) 0 var(--sp-2)" }}>
            What else could explain this, as you flagged it:
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {comparison.confoundersPresent.map((code) => (
              <li key={code}>{confounderLabel(code)}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted" data-testid={`${testId}-no-confounders`}>
          You flagged nothing that could also explain this. That is your answer,
          not a check this product ran.
        </p>
      )}
    </section>
  );
}

export function ComparisonGroup({
  group,
  index,
}: {
  group: ComparisonGroupView;
  index: number;
}) {
  const testId = `results-comparison-${index}`;
  return (
    <div className="panel panel-1" data-testid={testId}>
      <h3 style={{ marginTop: 0 }}>
        {group.platform}, {group.audienceClass}
      </h3>
      <p className="muted" style={{ margin: 0 }}>
        {/* NO UNIT HERE. Each lever states its own beside its own number, and
            a unit repeated at the group level is a second answer to the same
            question — see `metricKey`'s docblock. */}
        Metric <span style={mono}>{group.metricKey}</span>. Window{" "}
        <span style={mono}>{group.observedFrom}</span> to{" "}
        <span style={mono}>{group.observedTo}</span>.
      </p>
      <p className="muted" style={{ margin: 0 }}>
        What was tested:{" "}
        <span style={mono} data-testid={`${testId}-treatment-key`}>
          {group.treatmentKey}
        </span>
      </p>
      {/* R9: two levers, side by side, never summed — and the note says so on
          the card itself, because "there is no summary score" is a claim a
          card is the most tempting place to break. */}
      <p className="muted" data-testid={`${testId}-two-levers`}>
        {TWO_LEVERS_NOTE}
      </p>
      <div style={{ display: "grid", gap: "var(--sp-4)" }}>
        {group.levers.map((lever) => (
          <LeverBlock key={lever.lever} comparison={lever} groupTestId={testId} />
        ))}
      </div>
      <p className="muted" data-testid={`${testId}-descriptive`}>
        {DESCRIPTIVE_NOT_PROOF}
      </p>
    </div>
  );
}

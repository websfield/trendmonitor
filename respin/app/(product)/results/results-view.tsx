// PURE presentation for `/results` (slice 9a). The page component does the
// gate, the scoping and the reads; this file renders what it is handed — so
// every state below (no profile, no declared metric, a viewer, nothing logged,
// nothing comparable, a comparison, a named absence) is reachable from a test
// with a fixture instead of a database. Same contract as `usage-view.tsx` and
// `studio-view.tsx`, and it is what lets the honesty scan in
// `tests/results-honesty.test.tsx` run over this screen's REAL copy rather
// than a sample of it.
//
// WHAT THIS SCREEN MAY NOT SAY (R20, and it is the requirement this file
// exists to carry). It is the first surface that puts one number about a
// creator's posts beside another, so it is the first that can be read as a
// prediction. Two sentences do the work — `PAST_NOT_PREDICTION` at the top of
// every state, `DESCRIPTIVE_NOT_PROOF` on every comparison card — and both are
// PINNED VERBATIM by the honesty suite, because R20 is an absence: nothing
// fails on its own if a later edit quietly starts forecasting.
//
// AND WHAT IT MAY NOT DO: produce one score. Reach and conversion are rendered
// apart here, on the list AND on every card, and there is no expression in
// this file that adds them (R9/REQ-F04).
import { Badge } from "../../ui/badge";
import { Banner } from "../../ui/banner";
import {
  ComparisonGroup,
  type ComparisonGroupView,
} from "./comparison-view";
import {
  COMPARISON_BASIS,
  COMPARISON_HEADING,
  LEVER_NOT_REPORTED,
  LOG_LIST_HEADING,
  LOG_LIST_NOTE,
  METRIC_VERSIONS_NOTE,
  NOTHING_COMPARABLE_YET,
  VERIFICATION_UNAVAILABLE,
  NO_RESULTS_YET,
  NO_TREATMENT_ON_ROW,
  NO_DECLARED_METRIC_TITLE,
  PAST_NOT_PREDICTION,
  RESULTS_HEADING,
  TWO_LEVERS_NOTE,
  clampedListNote,
  confounderLabel,
  evidenceStateCopy,
  leverLabel,
} from "./copy";

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

/** One logged result, as this screen shows it back. */
export type ResultRowView = {
  id: string;
  platform: string;
  audienceClass: string;
  /** ISO days — server-formatted, so the server and a test agree exactly. */
  observedFrom: string;
  observedTo: string;
  evidenceState: string;
  metricKey: string;
  /**
   * BOTH LEVERS, ALWAYS, in the vocabulary's own order — never only the ones
   * this result reported (R9: every result view shows reach and conversion
   * separately). A lever with no numbers says so; it never prints a zero.
   */
  levers: readonly {
    lever: string;
    value: string | null;
    denominator: string | null;
  }[];
  confounders: readonly string[];
  /** null for a result that names no draft (contract C4). */
  treatmentKey: string | null;
  note: string | null;
};

export type ResultsViewState =
  /** No creator profile is selected: nothing to log a result for. */
  | { kind: "no_profile"; reason: string; onboardingHref: string }
  /**
   * R8's REFUSAL WITH A NAMED REMEDY. A result is a measurement and a
   * measurement needs a declared unit and direction; this product will not
   * pick one. It is a `Banner` and not an error page because the remedy is one
   * link away and the creator has done nothing wrong.
   */
  | { kind: "no_declared_metric"; detail: string; brainHref: string }
  | {
      kind: "ready";
      profileName: string;
      /** The declared metric, named on screen so the numbers have a unit. */
      metric: { label: string; key: string; unit: string; direction: string };
      results: readonly ResultRowView[];
      /**
       * TRUE WHEN THE READER HAD MORE ROWS THAN THIS LIST SHOWS.
       *
       * An OBSERVATION, not an inference: the page asks the scoped reader for
       * one more row than it renders, so this is "we saw a 51st" rather than
       * "we assume there is one". A clamped list with no flag is a page
       * presenting part of a creator's record as the whole of it, which is the
       * defect `spendVisibility` exists for on `/usage`.
       */
      moreResults: boolean;
      comparisons: readonly ComparisonGroupView[];
      /**
       * THE COMPARISON SECTION'S OWN FAILURE, rendered in place.
       *
       * It is a field on the READY state rather than a whole-page state
       * because that is the fix: one unreadable row used to take the log form
       * and the results list down with the comparison, and `results` has no
       * delete path, so a permanent poisoning would have left a creator unable
       * to log anything at all.
       */
      comparisonError: { title: string; detail: string } | null;
    };

export type ResultsViewProps = {
  state: ResultsViewState;
  /** The log control, rendered by the page (it is a client island). */
  logPanel?: React.ReactNode;
  /** Proposal history and the reachable review/decision controls. */
  promotionPanel?: React.ReactNode;
};

// THERE IS NO `?e=` CHANNEL ON THIS SCREEN, and its absence is deliberate
// rather than unfinished. `logResultAction` returns its refusal as action
// state, so the words are rendered in place by `log-panel.tsx` and no code
// ever travels on the URL. A `?e=` prop nothing sets would be a second refusal
// path with no caller — inventory, and a second place for refusal copy to go
// stale. The honesty scan still covers the WHOLE shared copy table, because
// the action resolves any code its catch classifies through it.

function ResultRow({ row }: { row: ResultRowView }) {
  const evidence = evidenceStateCopy(row.evidenceState);
  return (
    <li className="panel" data-testid="results-row" style={{ marginBottom: "var(--sp-4)" }}>
      <p style={{ margin: 0 }}>
        <span style={mono}>{row.platform}</span>, {row.audienceClass},{" "}
        <span style={mono}>{row.observedFrom}</span> to{" "}
        <span style={mono}>{row.observedTo}</span>, metric{" "}
        <span style={mono}>{row.metricKey}</span>
      </p>
      {/* WORDS, NEVER COLOUR ALONE (DESIGN.md), AND THE WORDS COME FROM THE
          VOCABULARY'S OWN MAP. This was a ternary on "is it unquantified",
          which labels a third evidence state as self reported the day one
          exists — on the badge whose whole job is to say how good the evidence
          is. `tests/results-entry.test.tsx` pins the map's keys to
          `RESULT_EVIDENCE_STATES`, so a new state arrives with its own word or
          fails there. */}
      <p style={{ margin: "var(--sp-2) 0" }}>
        <Badge variant={evidence.badgeVariant} data-testid="results-row-evidence">
          {evidence.badge}
        </Badge>
      </p>
      <dl
        data-testid="results-row-levers"
        style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--sp-2)", margin: 0 }}
      >
        {row.levers.map((lever) => (
          <div key={lever.lever} data-testid={`results-row-lever-${lever.lever}`}>
            <dt style={{ fontWeight: 600 }}>{leverLabel(lever.lever)}</dt>
            <dd style={{ margin: 0 }}>
              {lever.value === null || lever.denominator === null ? (
                // NEVER A ZERO FOR AN ABSENCE, on the list as on the cards.
                <span className="muted">{LEVER_NOT_REPORTED}</span>
              ) : (
                <span style={mono}>
                  {lever.value} out of {lever.denominator}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {row.treatmentKey === null ? (
        <p className="muted" data-testid="results-row-no-treatment">
          {NO_TREATMENT_ON_ROW}
        </p>
      ) : (
        <p className="muted">
          Tested:{" "}
          <span style={mono} data-testid="results-row-treatment-key">
            {row.treatmentKey}
          </span>
        </p>
      )}
      {row.confounders.length > 0 ? (
        <ul data-testid="results-row-confounders" style={{ margin: 0, paddingLeft: "1.2rem" }}>
          {row.confounders.map((code) => (
            <li key={code}>{confounderLabel(code)}</li>
          ))}
        </ul>
      ) : null}
      {row.note !== null ? (
        <p data-testid="results-row-note">{row.note}</p>
      ) : null}
    </li>
  );
}

export function ResultsView({ state, logPanel, promotionPanel }: ResultsViewProps) {
  // R-115: results exist and none is connector verified — the dedicated
  // unverified state. Computed once, because two sections read it.
  const verificationUnavailable =
    state.kind === "ready" &&
    state.results.length > 0 &&
    state.results.every((row) => row.evidenceState !== "connector_verified");
  return (
    <section>
      <h1>{RESULTS_HEADING}</h1>

      {/* R20, ABOVE EVERYTHING AND IN EVERY STATE — including the states where
          there is nothing to compare, because a creator forms the belief this
          sentence forecloses while reading the empty screen too. */}
      <p className="muted" data-testid="results-past-not-prediction">
        {PAST_NOT_PREDICTION}
      </p>

      {state.kind === "no_profile" ? (
        <div className="panel" data-testid="results-no-profile">
          <p style={{ margin: 0 }}>
            {state.reason} Create or select one on the{" "}
            <a href={state.onboardingHref}>onboarding page</a>, then come back.
          </p>
        </div>
      ) : null}

      {state.kind === "no_declared_metric" ? (
        // R8. A REFUSAL WITH A REMEDY, and no form beneath it: offering a
        // control whose only outcome is a refusal is what `studio-panel.tsx`
        // refuses to do, and silently defaulting the metric is what R8 forbids.
        <Banner
          title={NO_DECLARED_METRIC_TITLE}
          data-testid="results-no-declared-metric"
          role="status"
        >
          <p className="muted">{state.detail}</p>
          <p>
            <a href={state.brainHref}>Open the brain page</a>
          </p>
        </Banner>
      ) : null}

      {state.kind === "ready" ? (
        <>
          <div className="panel" data-testid="results-log">
            <h2 style={{ marginTop: 0 }}>Log a result for {state.profileName}</h2>
            <p className="muted" data-testid="results-metric">
              Your declared metric is <span data-testid="results-metric-label" data-creator-authored="true">{state.metric.label}</span>{" "}
              <span style={mono}>({state.metric.key})</span>,
              measured in <span style={mono}>{state.metric.unit}</span>, and you
              declared that{" "}
              {state.metric.direction === "higher_is_better" ? "higher" : "lower"}{" "}
              is better. That is the declaration a result logged NOW is measured
              against.
            </p>
            {/* REQ-B03, AND THE SENTENCE ABOVE USED TO BREAK IT. It read
                "every number below is read against that declaration", which is
                false the moment a creator has a second strategy version:
                `editDeclaredMetric` writes a NEW version, older results keep
                the `metricDeclaredByDocId` they were logged under, and every
                card below correctly renders ITS OWN version's unit and
                direction. The screen was contradicting its own cards, on the
                one page whose subject is that historical results keep the
                metric they were actually judged by. */}
            <p className="muted" data-testid="results-metric-history">
              {METRIC_VERSIONS_NOTE}
            </p>
            {logPanel}
          </div>

          <div className="panel" data-testid="results-list">
            <h2 style={{ marginTop: 0 }}>{LOG_LIST_HEADING}</h2>
            <p className="muted">{LOG_LIST_NOTE}</p>
            <p className="muted" data-testid="results-list-two-levers">
              {TWO_LEVERS_NOTE}
            </p>
            {/* THE CLAMP IS SAID, NOT IMPLIED. The heading above says "what
                you have logged" rather than "everything", and this is where
                the missing rows are named — only when a row beyond the page
                was really observed. */}
            {state.moreResults ? (
              <p className="muted" data-testid="results-list-clamped">
                {clampedListNote(state.results.length)}
              </p>
            ) : null}
            {state.results.length === 0 ? (
              <p data-testid="results-none-logged">{NO_RESULTS_YET}</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {state.results.map((row) => (
                  <ResultRow key={row.id} row={row} />
                ))}
              </ul>
            )}
          </div>

          <div data-testid="results-comparisons">
            <h2>{COMPARISON_HEADING}</h2>
            <p className="muted" data-testid="results-comparison-basis">
              {COMPARISON_BASIS}
            </p>
            {verificationUnavailable ? (
              <p className="muted" data-testid="results-verification-unavailable">
                {VERIFICATION_UNAVAILABLE}
              </p>
            ) : null}
            {state.comparisonError ? (
              // IN PLACE, NOT INSTEAD OF THE PAGE. The form above and the
              // history above it are still usable; this says what failed and
              // carries the same words the whole-page refusal used to.
              <Banner
                title={state.comparisonError.title}
                data-testid="results-comparison-error"
                role="alert"
              >
                <p className="muted">{state.comparisonError.detail}</p>
              </Banner>
            ) : state.comparisons.length === 0 ? (
              // THE DEDICATED UNVERIFIED STATE (audit Phase 2, P2-A1). With no
              // verified result, the notice above IS the answer: no group can
              // be built, and `NOTHING_COMPARABLE_YET`'s "needs results that
              // name one of your drafts" would read as if logging more would
              // fill one. So the absence sentence is not printed beside it.
              verificationUnavailable ? null : (
                <p className="panel" data-testid="results-no-comparison">
                  {state.results.length === 0 ? NO_RESULTS_YET : NOTHING_COMPARABLE_YET}
                </p>
              )
            ) : (
              state.comparisons.map((group, index) => (
                <ComparisonGroup
                  // EVERY PREDICATE THAT DISTINGUISHES A GROUP IS IN THE KEY,
                  // and `metricDeclaredByDocId` was the one the comment
                  // claimed and the list omitted — the exact case it named.
                  // Two generations sharing framework, mode and activation give
                  // ONE treatment key; a strategy edit gives two declaring
                  // documents; identical windows give identical envelopes. Two
                  // children, one key, re-rendered after every log.
                  key={[
                    group.treatmentKey,
                    group.platform,
                    group.audienceClass,
                    group.metricKey,
                    group.metricDeclaredByDocIds?.join(",") ?? group.metricDeclaredByDocId ?? "missing-metric-version",
                    group.observedFrom,
                    group.observedTo,
                  ].join("|")}
                  group={group}
                  index={index}
                />
              ))
            )}
          </div>
          {promotionPanel}
        </>
      ) : null}
    </section>
  );
}

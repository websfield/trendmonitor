// What `/studio` renders AFTER a generation has run — as a PURE component.
//
// It lives outside the client panel for the rule `../onboarding/run-outcome.tsx`
// already obeys: "every state is reachable from a test with a fixture rather
// than a database". `useActionState` yields only its INITIAL state under
// `renderToStaticMarkup`, so a result rendered inside the panel would be a
// state no test could drive — on the one screen that hands a creator something
// to publish and takes a credit for it.
//
// No directive of its own: it is imported by a `"use client"` module, so it is
// client code, and a test imports it directly.
//
// ---------------------------------------------------------------------------
// THE THREE THINGS THIS FILE MAY NOT DO, each of which it would be natural to.
//
//  1. IT NEVER EDITS THE DRAFT. The traceability scan is a recall control with
//     known false positives (R-64), so the product FLAGS and OFFERS `[check]`;
//     deleting or rewriting a flagged token would corrupt a creator's script on
//     a false positive. Every hook below is rendered as the operation returned
//     it, and the `[check]` offer is a separate suggestion beside it.
//  2. IT NEVER STATES HOW THE DRAFT WILL DO. No result of this creator's has
//     been logged — the results loop is slice 9 — so any hint that the draft is
//     shaped by what has worked for them is a claim about evidence that does
//     not exist (R21). `tests/support/forbidden-claims.ts`'s PERFORMANCE_CLAIMS
//     is scanned over this file's rendered output.
//  3. IT NEVER SHOWS "why this performs" WITHOUT ITS WEAKEST POINT. That is
//     `whyThisPerformsView`'s job and its false branch withholds the reasoning
//     rather than rendering half a pair (REQ-I04).
import type { ReactNode } from "react";
import { Banner } from "../../ui/banner";
import {
  CHECK_MARKER,
  checkOffer,
  claimFamilyNote,
  claimsHeading,
  creatorRulesSentence,
  generateChargeSentence,
  killTestSentence,
  replayChargeSentence,
  traceabilityFlagNote,
  traceabilityHeading,
  whyThisPerformsView,
} from "./run-copy";
import type {
  ClaimFlag,
  KillTestSummary,
  StudioRunState,
  TraceabilityFlag,
} from "./run-state";

export type GenerationOutcomeProps = {
  state: StudioRunState;
  /** The words for a refusal code, resolved server-side. */
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  /** The words for a code with no entry. Never invented here. */
  fallbackCopy: { title: string; detail: string };
};

function KillTestBlock({ summary }: { summary: KillTestSummary }) {
  const hard = summary.traceability.filter((f) => f.enforcement === "hard");
  const flagged = summary.traceability.filter((f) => f.enforcement === "flag");
  return (
    <div data-testid="studio-kill-test" style={{ marginTop: "1rem" }}>
      <h3 style={{ marginBottom: "0.25rem" }}>What the checks found</h3>
      <p data-testid="studio-kill-test-outcome">
        {killTestSentence(summary.outcome, summary.attempts)}
      </p>
      <p className="muted" data-testid="studio-creator-rules">
        {creatorRulesSentence(summary.creatorRulesScored, summary.verdicts.length)}
      </p>
      {summary.verdicts.length > 0 ? (
        <ul data-testid="studio-creator-verdicts">
          {summary.verdicts.map((v) => (
            <li key={v.ruleId}>
              <strong>{v.passed ? "Passed" : "Did not pass"}</strong>
              {": "}
              {v.note}
            </li>
          ))}
        </ul>
      ) : null}

      <h3 style={{ marginBottom: "0.25rem" }}>Where the specifics came from</h3>
      <p data-testid="studio-traceability-heading">
        {traceabilityHeading(hard.length, flagged.length)}
      </p>
      {summary.traceability.length > 0 ? (
        <ul data-testid="studio-traceability">
          {summary.traceability.map((f: TraceabilityFlag, i) => (
            <li key={`${f.field}-${i}`}>
              {/*
                THE OFFER, NOT AN EDIT. The token is shown as it appears in the
                draft above, and beside it the version WITH the marker that the
                creator may choose to use. Nothing above changed.
              */}
              <code>{f.token}</code>
              {" — "}
              <span className="muted">{f.unit}</span>
              {" · "}
              <span data-testid="studio-check-offer">{checkOffer(f.token)}</span>
              {/*
                THE NOTE IS COMPUTED FROM THE FINDING, not fixed. This branch
                printed "(a name, not a rule violation — ordinary words land
                here)" for EVERY flag, which was true while the flag bucket was
                proper nouns alone. `traceability.ts` then demoted
                `plain-number` and made `/disclosure/` flag-only whatever the
                shape, so the same sentence began calling the number `5` a name.
                `traceabilityFlagNote` keys on `kind` and `field`, which are the
                two inputs `enforcementFor` itself uses.
              */}
              {f.enforcement === "flag" ? (
                <span className="muted" data-testid="studio-flag-note">
                  {" "}
                  {traceabilityFlagNote(f.kind, f.field)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {/*
        REQ-I03's LIMIT, CARRIED FROM THE OPERATION. The sentence is
        `TRACEABILITY_LIMIT_NOTE`, which lives beside the scan in
        `@respin/modes` and is stored on every generation's `kill_test`. This
        screen renders the value it was handed and holds no copy of it — a
        second copy here would be a description of a control, maintained apart
        from the control.
      */}
      <p className="muted" data-testid="studio-traceability-note">
        {summary.limitNote}
      </p>

      {/*
        REQ-I04 / REQ-I05, MADE REACHABLE. `runKillTest` scans the model's own
        text for performance forecasts, certainty promises and concealment
        advice and stores every finding; the hard ones reach a creator through
        the refusal's `why`, and until this block the flag-level ones reached
        nobody at all — including a concealment sentence sitting in the
        disclosure guidance this screen renders as the product's advice.

        THE PHRASE IS QUOTED, NOT REPEATED AS A CLAIM. A flag-level finding is
        in text the creator is already reading (the only hard-enforced section
        is `whyThisPerforms`, and a hard finding refuses the draft outright), so
        naming the line adds no word to this page that was not already on it.
      */}
      {summary.claims.length > 0 ? (
        <>
          <h3 style={{ marginBottom: "0.25rem" }}>
            What the draft says about itself
          </h3>
          {/*
            THE WHOLE LIST, NOT TWO COUNTS. This call site used to take the
            counts itself — `claims.filter(...).length` per enforcement — which
            counted FINDINGS and printed them as "lines", so one sentence
            matching two shapes read as two lines. `claimsHeading` now counts
            distinct FIELDS, and it takes the list so no call site can do that
            arithmetic again (the same shape `honestRefusal` fixed for its "N
            places" one level down).
          */}
          <p data-testid="studio-claims-heading">
            {claimsHeading(summary.claims)}
          </p>
          <ul data-testid="studio-claims">
            {summary.claims.map((c: ClaimFlag, i) => (
              <li key={`${c.field}-${i}`}>
                <code>{c.token}</code>
                {" — "}
                <span className="muted">{c.unit}</span>
                {" · "}
                <span className="muted" data-testid="studio-claim-note">
                  {claimFamilyNote(c.family)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function GenerationOutcome({
  state,
  refusalCopy,
  fallbackCopy,
}: GenerationOutcomeProps): ReactNode {
  if (state.status === "refused") {
    // A code with no entry falls back to NEUTRAL copy, never to nothing — the
    // silent-nothing failure mode `../onboarding/copy.ts` records. A refused
    // spend that renders no explanation leaves the creator unable to tell a
    // refusal from a hang.
    const copy = refusalCopy[state.code] ?? fallbackCopy;
    return (
      <Banner
        title={copy.title}
        role="alert"
        data-testid="studio-refusal"
        style={{ marginTop: "1rem" }}
      >
        <p className="muted">{copy.detail}</p>
      </Banner>
    );
  }

  if (state.status === "idle") return null;

  if (state.status === "replayed") {
    return (
      <div
        role="status"
        data-testid="studio-replayed"
        className="panel"
        style={{ marginTop: "1rem" }}
      >
        <p data-testid="studio-charge">{replayChargeSentence(state.balanceAfter)}</p>
        <p>
          {state.outcome === "usable"
            ? "That draft finished and is stored."
            : "That draft ended in an honest refusal, which is stored with its reasons."}
        </p>
        {/*
          `.trim()`, NOT TRUTHINESS. `weakestPoint` arrives from a stored
          `generations` row as `string | null`, and a single space is truthy —
          which would render `<strong>The weakest point of that draft:</strong>`
          above nothing at all. That is the exact shape REQ-I04 forbids and the
          exact shape `whyThisPerformsView` withholds on the fresh path, so the
          replay path may not admit it either: a label above a blank is a
          weakest point the reader is told exists and cannot read.
        */}
        {state.weakestPoint !== null && state.weakestPoint.trim().length > 0 ? (
          <p data-testid="studio-weakest-point">
            <strong>The weakest point of that draft:</strong> {state.weakestPoint}
          </p>
        ) : null}
        {state.refusalReason ? (
          <p data-testid="studio-replayed-reason">{state.refusalReason}</p>
        ) : null}
        {/*
          THE DOCUMENT IS NOT RE-RENDERED HERE, and the screen says so rather
          than showing a blank space. `generations.output` is jsonb typed
          `unknown`; parsing it in `app/**` would be a second parser for a
          contract `parseScriptOutput` owns, free to disagree with it. Slice 7's
          draft history is where a stored draft is read back.
        */}
        <p className="muted">
          The draft itself is not shown again here — this press did not run
          anything. Start a new draft to get a fresh one.
        </p>
      </div>
    );
  }

  if (state.status === "honest_refusal") {
    return (
      // REQ-C03: "everything died, here is why, here is a sharper angle to
      // try". This is the product working, not an error, so it is rendered as
      // an outcome panel with `role="status"` rather than as an alert — and it
      // was CHARGED, which the charge line says plainly.
      <div
        role="status"
        data-testid="studio-honest-refusal"
        className="panel"
        style={{ marginTop: "1rem" }}
      >
        <h2 style={{ marginTop: 0 }}>{state.headline}</h2>
        <ul data-testid="studio-refusal-why">
          {state.why.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
        <p data-testid="studio-sharper-angle">
          <strong>A sharper angle:</strong> {state.sharperAngle}
        </p>
        {/*
          NO DRAFT IS SHOWN. The draft that broke the hard rules twice is not
          rendered — `GenerationRun`'s refused branch carries no output at all,
          and showing it would hand a creator the text the product just refused
          to stand behind.
        */}
        <p className="muted">
          The draft that failed is not shown: it broke a rule this product does
          not publish around, and handing it over anyway would make the check
          decorative.
        </p>
        <KillTestBlock summary={state.killTest} />
        <p data-testid="studio-charge">
          {generateChargeSentence(
            state.charge.creditsChargedNow,
            state.charge.balanceAfter
          )}
        </p>
        <p className="muted">
          This ran, and was charged for. An honest refusal is the product
          working: it is what happens instead of a draft that would have gone
          out with a rule broken in it.
        </p>
      </div>
    );
  }

  const why = whyThisPerformsView(state.whyThisPerforms);

  return (
    // `role="status"` — the same live-region reasoning `../onboarding/run-outcome.tsx`
    // records after a real browser walk: the moment the submit control goes
    // busy the browser drops focus, so a keyboard or screen-reader user who
    // pressed the money control would otherwise be told nothing at all while
    // this node quietly rendered their draft and their new balance.
    <div
      role="status"
      data-testid="studio-result"
      className="panel"
      style={{ marginTop: "1rem" }}
    >
      <h2 style={{ marginTop: 0 }}>Your hooks</h2>
      <ol data-testid="studio-hooks">
        {state.hooks.map((h, i) => (
          <li key={i} style={{ marginBottom: "0.5rem" }}>
            {/*
              RENDERED EXACTLY AS RETURNED. No trimming, no `[check]` inserted,
              no flagged token removed — see this file's header rule 1.
            */}
            <div>{h.text}</div>
            <div className="muted">Mechanic: {h.mechanic}</div>
          </li>
        ))}
      </ol>

      <h3 style={{ marginBottom: "0.25rem" }}>Why this performs</h3>
      {why.ok ? (
        <>
          <p data-testid="studio-why-reasoning">{why.reasoning}</p>
          <p data-testid="studio-weakest-point">
            <strong>Weakest point:</strong> {why.weakestPoint}
          </p>
        </>
      ) : (
        <p data-testid="studio-why-withheld" className="muted">
          {why.note}
        </p>
      )}

      <h3 style={{ marginBottom: "0.25rem" }}>Disclosure</h3>
      <p data-testid="studio-disclosure">
        <strong>{state.disclosure.platform}:</strong> {state.disclosure.guidance}
      </p>

      <KillTestBlock summary={state.killTest} />

      <p data-testid="studio-charge">
        {generateChargeSentence(
          state.charge.creditsChargedNow,
          state.charge.balanceAfter
        )}
      </p>
      <p className="muted" data-testid="studio-check-legend">
        {CHECK_MARKER} is this product&apos;s marker for &quot;not stated
        yet&quot;. Where one is offered above, it is a suggestion you can take or
        leave; your draft was not changed.
      </p>
    </div>
  );
}

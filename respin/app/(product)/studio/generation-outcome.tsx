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
//     a false positive. Every section below is rendered as the operation
//     returned it, and the `[check]` offer is a separate suggestion beside it.
//  2. IT NEVER STATES HOW THE DRAFT WILL DO. No result of this creator's has
//     been logged — the results loop is slice 9 — so any hint that the draft is
//     shaped by what has worked for them is a claim about evidence that does
//     not exist (R21). `tests/support/forbidden-claims.ts`'s PERFORMANCE_CLAIMS
//     is scanned over this file's rendered output.
//  3. IT NEVER SHOWS "why this performs" WITHOUT ITS WEAKEST POINT. That is
//     `whyThisPerformsView`'s job and its false branch withholds the reasoning
//     rather than rendering half a pair (REQ-I04). SLICE 7's R18 is that this
//     holds on EVERY mode, not the two where it was easy: there is exactly ONE
//     path from a usable run to the screen and it goes through
//     `WhyThisPerforms` below, so a mode cannot acquire a second renderer that
//     forgets.
import type { ReactNode } from "react";
import { Banner } from "../../ui/banner";
import {
  CHECK_MARKER,
  DISCLOSURE_FIELD_PREFIX,
  DISCLOSURE_PROVENANCE,
  checkOffer,
  claimFamilyNote,
  claimsHeading,
  creatorRulesSentence,
  frameworksNotUsedSentence,
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
  ScriptDocument,
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

/**
 * WHAT THE CONTEXT BUDGET COULD NOT CARRY OF THE CREATOR'S OWN FRAMEWORKS
 * (R17, slice 7 cross-boundary pass 2026-09-01).
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY, and that is the whole
 * shape of it: `frameworksNotUsedSentence` returns `null` for a zero drop AND
 * for a press that built no offer, so this is not a permanent line that says
 * "0 frameworks were dropped" on every draft. A line that appears only when
 * the fact is true is the difference between telling somebody something and
 * decorating the page.
 *
 * `muted` AND BELOW THE CHARGE, deliberately: it is not a refusal and not an
 * error. The draft is real, it is theirs, and this is one thing about how it
 * was built.
 */
function FrameworksNotUsed({ count }: { count: number | null }) {
  const sentence = frameworksNotUsedSentence(count);
  if (sentence === null) return null;
  return (
    <p className="muted" data-testid="studio-frameworks-not-used">
      {sentence}
    </p>
  );
}

function KillTestBlock({ summary }: { summary: KillTestSummary }) {
  const traceability = summary.traceability.filter(
    (f) =>
      !f.field.startsWith(DISCLOSURE_FIELD_PREFIX) || f.enforcement === "hard"
  );
  const hard = traceability.filter((f) => f.enforcement === "hard");
  const flagged = traceability.filter((f) => f.enforcement === "flag");
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
      <p className="muted" data-testid="studio-disclosure-provenance">
        {DISCLOSURE_PROVENANCE}
      </p>
      <p data-testid="studio-traceability-heading">
        {traceabilityHeading(hard.length, flagged.length)}
      </p>
      {traceability.length > 0 ? (
        <ul data-testid="studio-traceability">
          {traceability.map((f: TraceabilityFlag, i) => (
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
                Disclosure traceability findings are filtered before rendering.
                Remaining flag notes classify the creator-field finding by kind.
              */}
              {f.enforcement === "flag" ? (
                <span className="muted" data-testid="studio-flag-note">
                  {" "}
                  {traceabilityFlagNote(f.kind)}
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
        advice and stores every finding. Hard claim findings refuse the draft; flag-level claims render below, including a concealment finding in the disclosure guidance.

        THE PHRASE IS QUOTED, NOT REPEATED AS A CLAIM. Hard claim findings on `/whyThisPerforms/` or `/disclosure/` refuse the draft; a rendered flag finding is a product warning the creator can inspect.
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

/**
 * "Why this performs", with its weakest point — R18, ON EVERY MODE.
 *
 * ONE COMPONENT, ONE CALL SITE, and that is the mechanism rather than a tidy
 * habit: R18 says the weakest point is named on every mode, "not just the two
 * where it was easy", and the way a screen breaks that is by growing a second
 * per-mode renderer that prints `reasoning` and forgets the pair. `Document`
 * below renders this exactly once, outside every per-section branch, so there
 * is no mode-shaped place for a second one to appear.
 */
function WhyThisPerforms({
  section,
}: {
  section: { reasoning: string; weakestPoint: string };
}) {
  const why = whyThisPerformsView(section);
  return (
    <>
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
    </>
  );
}

/**
 * THE DOCUMENT, SECTION BY SECTION — one renderer for all six modes (R1/R18).
 *
 * EVERY SECTION IS RENDERED IF PRESENT AND OMITTED IF ABSENT, and the absence
 * is the mode's rather than this file's: `parseScriptOutput` has already
 * refused a document carrying a section its mode does not permit, and required
 * a section its mode does not have. So there is no per-mode branch here at all
 * — a mode is "a data entry in the registry, not a branch" (R1), and a screen
 * that switched on the mode id would be the branch the registry exists to
 * remove. It would also be a second list of mode ids in `app/**`, which
 * `tests/studio-ui.test.tsx` scans this directory to forbid.
 *
 * NOTHING IS RENDERED AS TEXT THAT WAS NOT IN THE DOCUMENT. Every heading below
 * is this screen's label for a field the model filled in; no section is
 * summarised, reordered within itself, or given a value it did not carry.
 */
function Document({ document: doc }: { document: ScriptDocument }) {
  return (
    <>
      {doc.thesis ? (
        <div data-testid="studio-thesis">
          <h3 style={{ marginBottom: "0.25rem" }}>The thesis</h3>
          <p>{doc.thesis.statement}</p>
          <p className="muted">{doc.thesis.why}</p>
        </div>
      ) : null}

      {doc.framework ? (
        <div data-testid="studio-framework">
          <h3 style={{ marginBottom: "0.25rem" }}>The framework it uses</h3>
          <p>
            <strong>{doc.framework.name}</strong>
          </p>
          <p className="muted">{doc.framework.why}</p>
        </div>
      ) : null}

      {doc.hooks ? (
        <>
          <h3 style={{ marginBottom: "0.25rem" }}>Hooks</h3>
          <ol data-testid="studio-hooks">
            {doc.hooks.map((h, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>
                {/*
                  RENDERED EXACTLY AS RETURNED. No trimming, no `[check]`
                  inserted, no flagged token removed — this file's header rule 1.
                */}
                <div>{h.text}</div>
                <div className="muted">Mechanic: {h.mechanic}</div>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {doc.ideas ? (
        <>
          <h3 style={{ marginBottom: "0.25rem" }}>Ideas</h3>
          {/*
            ALL THREE FIELDS, ALWAYS (REQ-C01 mode 7). An idea is hook + thesis
            + framework and never a topic; a view that showed the hook alone
            would turn the output back into a list of topics on its way to the
            page, which is the failure this mode has by default.
          */}
          <ol data-testid="studio-ideas">
            {doc.ideas.map((idea, i) => (
              <li key={i} style={{ marginBottom: "0.75rem" }}>
                <div>{idea.hook}</div>
                <div className="muted">Thesis: {idea.thesis}</div>
                <div className="muted">Framework: {idea.framework}</div>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {doc.beats ? (
        <>
          <h3 style={{ marginBottom: "0.25rem" }}>The script, beat by beat</h3>
          <ol data-testid="studio-beats">
            {doc.beats.map((b, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>
                <div>
                  <code>{b.atSeconds}s</code> {b.vo}
                </div>
                {/*
                  THE TURN IS MARKED IN WORDS (PRD §46), never by styling alone
                  — DESIGN.md's rule that status is never colour-only, and the
                  turn is the one beat a creator most needs to find.
                */}
                {b.isTurn ? (
                  <div className="muted" data-testid="studio-beat-turn">
                    This is the turn — where the piece changes direction.
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {doc.shotMap ? (
        <>
          <h3 style={{ marginBottom: "0.25rem" }}>What to film</h3>
          <ul data-testid="studio-shot-map">
            {doc.shotMap.map((s, i) => (
              <li key={i} style={{ marginBottom: "0.5rem" }}>
                <div>
                  <strong>Beat {s.beatIndex + 1}:</strong> {s.shot}
                </div>
                <div className="muted">{s.note}</div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {doc.onScreenText ? (
        <>
          <h3 style={{ marginBottom: "0.25rem" }}>On-screen text</h3>
          <ul data-testid="studio-on-screen-text">
            {doc.onScreenText.map((t, i) => (
              <li key={i}>
                <code>{t.atSeconds}s</code> {t.text}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {doc.caption ? (
        <div data-testid="studio-caption">
          <h3 style={{ marginBottom: "0.25rem" }}>Caption</h3>
          <p>{doc.caption.text}</p>
          {doc.caption.hashtags.length > 0 ? (
            <p className="muted" data-testid="studio-hashtags">
              {doc.caption.hashtags.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <WhyThisPerforms section={doc.whyThisPerforms} />

      <h3 style={{ marginBottom: "0.25rem" }}>Disclosure</h3>
      <p data-testid="studio-disclosure">
        <strong>{doc.disclosure.platform}:</strong> {doc.disclosure.guidance}
      </p>
    </>
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
            ? `That ${state.modeLabel} draft finished and is stored.`
            : `That ${state.modeLabel} draft ended in an honest refusal, which is stored with its reasons.`}
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
          contract `parseScriptOutput` owns, free to disagree with it. A stored
          draft is read back through the creator's export, which carries every
          generation with its parent and its request.
        */}
        <p className="muted">
          The draft itself is not shown again here — this press did not run
          anything. Start a new draft to get a fresh one; your export carries
          the stored one.
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

          THIS IS ALSO R16's ANSWER FOR A REVISION (the card's question 3): a
          revision re-runs the kill test from scratch, so a revision of a draft
          that passed can land here — and when it does, what replaces the
          prepared draft is this refusal, not the parent's text greyed out.
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
        <FrameworksNotUsed count={state.privateFrameworksNotUsed} />
        <p className="muted">
          This ran, and was charged for. An honest refusal is the product
          working: it is what happens instead of a draft that would have gone
          out with a rule broken in it.
        </p>
      </div>
    );
  }

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
      <h2 style={{ marginTop: 0 }}>{state.modeLabel}</h2>

      <Document document={state.document} />

      <KillTestBlock summary={state.killTest} />

      <p data-testid="studio-charge">
        {generateChargeSentence(
          state.charge.creditsChargedNow,
          state.charge.balanceAfter
        )}
      </p>
      <FrameworksNotUsed count={state.privateFrameworksNotUsed} />
      <p className="muted" data-testid="studio-check-legend">
        {CHECK_MARKER} is this product&apos;s marker for &quot;not stated
        yet&quot;. Where one is offered above, it is a suggestion you can take or
        leave; your draft was not changed.
      </p>
    </div>
  );
}

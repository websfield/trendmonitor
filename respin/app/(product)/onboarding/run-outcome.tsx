// What the voice inference renders AFTER it has run — as a pure component.
//
// It lives outside the client panel for the rule this screen already obeys:
// "every state is reachable from a test with a fixture rather than a database".
// `useActionState` yields only its INITIAL state under `renderToStaticMarkup`,
// so a result rendered inside the panel would be a state no test could drive —
// on the one control that spends money. Given the state, this renders it.
//
// No directive of its own: it is imported by a `"use client"` module, so it is
// client code, and a test imports it directly.
import type { ReactNode } from "react";
import { Banner } from "../../ui/banner";
import {
  corpusBoundSentence,
  runChargeSentence,
  voiceOutcomeSentence,
} from "./run-copy";
import type { VoiceInferenceState } from "./run-state";

export type RunOutcomeProps = {
  state: VoiceInferenceState;
  /** The words for a refusal code, resolved server-side. */
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  /** The words for a code with no entry. Never invented here. */
  fallbackCopy: { title: string; detail: string };
};

export function RunOutcome({
  state,
  refusalCopy,
  fallbackCopy,
}: RunOutcomeProps): ReactNode {
  if (state.status === "refused") {
    // A code with no entry falls back to NEUTRAL copy, never to nothing. The
    // silent-nothing failure mode is the one `onboardingErrorFor` was already
    // corrected for: a refused spend that renders no explanation leaves the
    // creator unable to tell a refusal from a hang.
    const copy = refusalCopy[state.code] ?? fallbackCopy;
    return (
      // `role="alert"` with NO focus island, and the difference from the page's
      // redirect refusal is real rather than an inconsistency: this node MOUNTS
      // in response to the press, which is the case a live region announces on
      // its own. The redirect refusal needed the island precisely because its
      // live region was already present at load.
      <Banner
        title={copy.title}
        role="alert"
        data-testid="run-refusal"
        style={{ marginTop: "1rem" }}
      >
        <p className="muted">{copy.detail}</p>
      </Banner>
    );
  }

  if (state.status !== "ok") return null;

  // Null when everything the creator saved was read — the bound sentence
  // renders ONLY when the bound actually bound (compliance gate round 2,
  // 2026-08-29). The pre-press sentence states the ceiling unconditionally.
  const corpusBound = corpusBoundSentence(state.postsUsed, state.postsAvailable);

  return (
    // `role="status"` — FOUND BY THE BROWSER WALK, 2026-08-28, and it is the
    // half of this component that had not been thought through.
    //
    // The refusal branch above already announces, because a refusal was
    // obviously an event. The SUCCESS branch had no live region at all, and
    // sampling a real click in a real browser showed why that matters: the
    // moment `SubmitButton` sets `disabled`, the browser drops focus to
    // `<body>`. So a keyboard or screen-reader user pressed the control, lost
    // their place, and were told NOTHING — while this node quietly rendered the
    // two numbers R18 exists to state, the charge and the new balance. The one
    // screen in the product that spends money announced its refusals and stayed
    // silent about its spending.
    //
    // `status` and not `alert`: polite, so it is announced after whatever the
    // user is already hearing rather than interrupting it. A successful run is
    // not an emergency. And NOT a focus move — stealing focus on a result the
    // user did not navigate to is its own defect; the live region is what
    // announces without taking control away.
    <div
      role="status"
      data-testid="run-result"
      className="panel"
      style={{ marginTop: "1rem" }}
    >
      <p data-testid="run-charge">
        {runChargeSentence(state.creditsCharged, state.balanceAfter)}
      </p>
      {/*
        NO MODEL TEXT HERE, AND THAT IS THE CHANGE FROM SLICE 2a.

        2a's panel rendered the vendor's reply as an attributed quotation,
        which was right for a connectivity ping: the reply was visibly not a
        product claim. What comes back now is a set of statements about how
        this person writes, and a rule shown here would be a claim about them
        with the quote that grounds it one page away. Every inferred rule is
        rendered on the confirm screen, beside its quote, or it is not rendered
        at all (R10).

        So this says HOW MANY and points at the screen. The counts come off the
        operation's own return value — they are not re-derived here, and they
        are never combined into a ratio (task 20).
      */}
      <p data-testid="voice-summary">
        {voiceOutcomeSentence(state.claimPositions, state.placeholders)}
      </p>
      {corpusBound ? (
        <p className="muted" data-testid="run-corpus-bound">
          {corpusBound}
        </p>
      ) : null}
      <p>
        {/*
          A PLAIN LINK, not a button and not a redirect. The confirm screen is
          a place a creator can come back to — the document is `proposed` and
          durable — so navigation to it is a navigation, and a `<a>` is what a
          browser, a keyboard and a screen reader all already understand.
        */}
        <a href="/brain" data-testid="voice-confirm-link">
          Read the rules and confirm them
        </a>
      </p>
      <p className="muted" data-testid="run-meta">
        {state.creditsCharged > 0
          ? "The charge is in your credit history on the usage page."
          : "This build was included, so it adds no entry to your credit history."}
      </p>
    </div>
  );
}

// What `/onboarding/first-ideas` renders AFTER the run — as a PURE component.
//
// IT LIVES OUTSIDE THE CLIENT PANEL FOR THE RULE `../../studio/run-outcome`'s
// two siblings already obey (`generation-outcome.tsx`, `lineage-view.tsx`):
// `useActionState` yields only its INITIAL state under `renderToStaticMarkup`,
// so anything rendered inside `FirstIdeasPanel` is a state no test can drive.
// Slice 7 learned that twice on `/studio` and shipped this screen with the
// heading, the count note and the "what happens next" paragraph back inside the
// panel — where a suite titled for the RESULT state was measuring the idle
// form (learning-honesty gate, 2026-09-01).
//
// No directive of its own: it is imported by a `"use client"` module, so it is
// client code, and a test imports it directly.
//
// ---------------------------------------------------------------------------
// WHAT IT ADDS TO `/studio`'s RENDERER, and why those two things and no more.
//
// The draft itself — the ideas, the weakest point, the disclosure, the kill
// test, the charge, the honest refusal — is `GenerationOutcome`'s, unchanged,
// because R18 ("why this performs names the weakest point on every mode") is a
// property of that component and a second result renderer is the second place a
// weakest point goes missing.
//
// What is B04's and not `/studio`'s is the COUNT. B04 says "the creator's first
// three ideas" and `MODE_SPECS.ideation` returns three to FIVE, so a heading
// printed above five of them would be miscounting the thing in front of the
// reader, and hiding two to make the number match would hide output they paid
// for. `firstIdeasHeading` and `firstIdeasCountNote` are that control, and
// until this component existed they were exported, tested and rendered by
// nothing at all.
import { GenerationOutcome } from "../../studio/generation-outcome";
import type { StudioRunState } from "../../studio/run-state";
import {
  FIRST_IDEAS_NEXT,
  firstIdeasCountNote,
  firstIdeasHeading,
} from "./copy";

export type FirstIdeasResultProps = {
  state: StudioRunState;
  refusalCopy: Readonly<Record<string, { title: string; detail: string }>>;
  fallbackCopy: { title: string; detail: string };
};

export function FirstIdeasResult({
  state,
  refusalCopy,
  fallbackCopy,
}: FirstIdeasResultProps) {
  // THE COUNT COMES FROM THE DOCUMENT, never from B04's three: `ideas` is
  // optional on `ScriptDocument` because six other modes do not return one, so
  // an absent array renders no heading rather than "No ideas came back" over a
  // document that was never an ideation batch.
  const ideas = state.status === "usable" ? state.document.ideas : undefined;
  const countNote = ideas ? firstIdeasCountNote(ideas.length) : "";

  return (
    <>
      {ideas ? (
        <>
          <h3 style={{ marginBottom: "0.25rem" }} data-testid="first-ideas-heading">
            {firstIdeasHeading(ideas.length)}
          </h3>
          {countNote ? (
            <p className="muted" data-testid="first-ideas-count-note">
              {countNote}
            </p>
          ) : null}
        </>
      ) : null}

      {/*
        THE SAME RENDERER `/studio` USES. It carries the ideas, the weakest
        point, the disclosure, the kill test's verdict, the traceability
        findings and the charge — and the honest refusal, which on this screen
        is exactly as possible as on any other: B04 is a real run.
      */}
      <GenerationOutcome
        state={state}
        refusalCopy={refusalCopy}
        fallbackCopy={fallbackCopy}
      />

      {state.status === "usable" ? (
        <p className="muted" data-testid="first-ideas-next">
          {FIRST_IDEAS_NEXT}
        </p>
      ) : null}
    </>
  );
}

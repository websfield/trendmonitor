// R9's lineage, as a PURE component.
//
// IT LIVES OUTSIDE THE CLIENT PANEL FOR THE RULE `./generation-outcome.tsx`
// ALREADY OBEYS, and it was moved here because that rule was being broken:
// `useActionState` yields only its INITIAL state under `renderToStaticMarkup`,
// so a chain rendered inside `StudioPanel` is a state no test can drive. The
// first draft of slice 7 put it there, and every lineage assertion in
// `tests/studio-ui.test.tsx` failed against an empty render — which is the
// honest version of "a capability nothing can reach": nothing could reach it,
// including the tests.
//
// No directive of its own: it is imported by a `"use client"` module, so it is
// client code, and a test imports it directly.
import { LINEAGE_SCOPE_NOTE, lineageLineFor } from "./run-copy";
import type { LineageEntry } from "./run-state";

/**
 * Where a generation id sits in the chain, or `null` if it is not in view.
 *
 * BY ID, NEVER BY POSITION. "The one before it" renders a lineage that looks
 * right and is a guess: a creator who made an original, then a second original,
 * then a revision of the FIRST would be shown a revision of the second. The
 * value being resolved is `generations.parent_id`, which is the database's own
 * answer to "which output came from which".
 *
 * `null` FOR A PARENT OUTSIDE THE VIEW is the honest fallback rather than a
 * defensive one: the chain is bounded (`LINEAGE_VIEW_MAX`) and is this page's
 * own, so a parent from before a reload is genuinely not here — and printing
 * "#0" or "#NaN" for it would be a number the reader cannot use.
 */
export function indexOfGeneration(
  lineage: readonly { generationId: string }[],
  generationId: string
): number | null {
  const i = lineage.findIndex((e) => e.generationId === generationId);
  return i === -1 ? null : i;
}

export function LineageList({
  lineage,
}: {
  lineage: readonly LineageEntry[];
}) {
  if (lineage.length === 0) return null;
  return (
    <div
      className="panel"
      data-testid="studio-lineage"
      style={{ marginTop: "1rem" }}
    >
      <h3 style={{ marginTop: 0 }}>What you have run here</h3>
      <ol data-testid="studio-lineage-list">
        {lineage.map((entry, i) => (
          // KEYED ON THE ATTEMPT ID, NOT THE GENERATION ID. One press mints
          // one attempt id, so it is unique within a chain by construction;
          // `generationId` is not — R14c's replay returns the generation a
          // CONCURRENT settlement wrote, so two entries can carry the same one
          // and React would silently reuse a node between two different rows.
          <li key={entry.attemptId} style={{ marginBottom: "0.35rem" }}>
            {lineageLineFor({
              index: i,
              modeLabel: entry.modeLabel,
              parentIndex:
                entry.parentGenerationId === null
                  ? null
                  : indexOfGeneration(lineage, entry.parentGenerationId),
              note: entry.note,
            })}
            {/*
              A REFUSED RUN STAYS IN THE CHAIN, LABELLED. Hiding it would hide a
              charge: an honest refusal is a stored generation the creator paid
              for (the slice card's question-4 table; a claim-only refusal is
              the R-173 exception and was free), and a chain that showed only
              the successes would under-count what the session cost.
            */}
            {entry.outcome === "honest_refusal" ? (
              <span className="muted"> (this one was refused)</span>
            ) : null}
          </li>
        ))}
      </ol>
      {/*
        THE HONEST LIMIT, in the same block as the list it limits.
        `generations.parent_id` is stored, same-tenant and immutable after
        insert; what does not exist is a scoped reader for it, so this view is
        what the page has run since it loaded. A list that looks like history
        and empties on reload teaches a creator that the product forgot their
        work — saying which half is durable is the difference between a
        limitation and an apparent bug.
      */}
      <p className="muted" data-testid="studio-lineage-scope">
        {LINEAGE_SCOPE_NOTE}
      </p>
    </div>
  );
}

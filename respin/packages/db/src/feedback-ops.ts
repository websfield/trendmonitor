// THE TWO APP-REACHABLE FEEDBACK OPERATIONS (slice 7, R10/R11).
//
// WHY A MODULE RATHER THAN METHODS ON `respinDb` DIRECTLY — the same reason
// `onboarding-ops.ts`, `interview-ops.ts` and `frameworks.ts` give: both
// compose `ProfileScope.mint` with something else, and both need a `db` handle
// a test can supply. Written inline in `app-server.ts` they would be reachable
// only through `getServerDb()`, so every assertion about them would have to run
// in a Docker suite.
//
// WHAT THIS FILE MAY NEVER GROW (R11), stated here because this is where the
// temptation will arrive: a count, a rollup, a "you have said this three times"
// banner, a rule, a proposal. Capture and construction are different acts —
// storing "the creator said this was too cringe" is a fact; deriving "your
// voice profile should ban X" is a proposal, and R-10/R-44 make
// `packages/brain` the SOLE construction site for one. `packages/brain` does
// not exist yet; `tests/feedback-readers.test.ts` is pre-registered against it
// the way `tests/import-boundary.test.ts` was pre-registered against
// `@respin/trends`, and it fails on an aggregate or a proposal constructor
// appearing anywhere else — including here.
import type { DbLike } from "./db-like";
import {
  ProfileScope,
  authoritativeEditableBrainDoc,
  normaliseContent,
  writeCapabilities,
  type LedgerPage,
  type RecordGenerationFeedbackParams,
  type WorkspaceScope,
} from "./with-workspace";
import type { GenerationFeedbackRow } from "./generation-schema";
import type { BrainDoc } from "./brain-schema";
import { CHECK } from "./brain-content";
import { editBrainDocument } from "./brain-ops";
import {
  BrainEditUnchangedError,
  ProfileRoleError,
  ProvenanceError,
} from "./errors";

/**
 * Record one structured reaction to one of this creator's outputs (REQ-C05).
 *
 * ITS OWN TRANSACTION, because the capability requires a `tx` and this is the
 * whole unit of work: one row, or nothing. It shares fate with no other write
 * — feedback is not part of a generation's settlement and must not be able to
 * fail one, which is what an optional `tx` on the capability would have made
 * possible to get wrong silently.
 */
export async function recordFeedback(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  params: RecordGenerationFeedbackParams
): Promise<GenerationFeedbackRow> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction((tx) => caps.recordGenerationFeedback(params, tx));
}

/**
 * "LEAVE THIS OUT OF FUTURE DRAFTS" (audit P6-A1, R-174): one of this
 * creator's reactions stops being offered to later concept and script drafts
 * as labelled history.
 *
 * ITS OWN TRANSACTION, the `recordFeedback` reason: one column on one row, or
 * nothing. It reads no reaction for meaning and derives nothing; the header's
 * rule holds.
 */
export async function excludeFeedbackFromHistory(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  feedbackId: string
): Promise<GenerationFeedbackRow> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const caps = writeCapabilities(profileScope);
  return db.transaction((tx) => caps.excludeGenerationFeedbackFromHistory(feedbackId, tx));
}

/**
 * The creator's own feedback events, RAW (R11).
 *
 * IT RETURNS THE STORED ROWS AND NOTHING ELSE — no count, no grouping, no
 * "most common reaction", no derived label. That is the requirement, not a
 * simplification: this slice must be structurally unable to derive from
 * feedback, and a function that returned a summary would be the first
 * derivation, in the module whose header says it may never grow one.
 * `packages/db/tests/lineage-feedback.test.ts` asserts the returned
 * objects are the stored rows column for column.
 *
 * NO ROLE GATE — a viewer may read, like every other profile read in this
 * package (`readVoiceBrain`'s precedent). Writing is gated; reading is not.
 */
export async function listFeedback(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  page?: LedgerPage
): Promise<GenerationFeedbackRow[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return profileScope.accessors.generationFeedback(page);
}

// ---------------------------------------------------------------------------
// LAUNCH L3 (R-152): "REMEMBER THIS FOR FUTURE DRAFTS".
//
// WHY IT IS HERE AND WHY IT IS NOT A DERIVATION. The header above forbids this
// file a rule built FROM feedback, and this is not one: nothing here reads a
// reaction, a note or a count. The creator TYPES the preference, and the one
// thing this function decides is WHERE their words land — which is a fixed
// position, not an inference. It is the Studio-side door to the existing
// creator-edit path (`editBrainDocument`), so the result is exactly what an
// edit on `/brain` makes: a PROPOSED new Kill Test version whose new position
// cites a `creator_authored` input holding the creator's words verbatim, with
// every other position's evidence carried forward. It is NOT IN FORCE until
// the creator confirms and activates it on `/brain` (R-8, REQ-B02/C05) —
// generation reads only the activated snapshot's documents, so a proposed
// version cannot reach a prompt. Owner only, refused under a pause: both are
// `writeBrainDoc`'s gates, which this path runs unchanged.

/** The one document kind a remembered preference is added to (R-152 item a). */
export const REMEMBERED_PREFERENCE_KIND = "killtest" as const;

/**
 * Append the creator's own words as a new Kill Test rule, as a proposed
 * version. Returns the proposed version and the position it added, and
 * `written: true`.
 *
 * `[check]` AND BLANK ARE REFUSED: a placeholder states nothing and would
 * carry no evidence, so "remember nothing" is the unchanged edit it is.
 *
 * A RULE THE EDITABLE VERSION ALREADY HOLDS IS NOT WRITTEN AGAIN (L3 gate,
 * security Low C-L1). A replayed or double-submitted press used to append the
 * same words a second time and write a second `onboarding_inputs` row. Now,
 * when the trimmed, `normaliseContent`-normalised text equals a rule already in
 * the authoritative editable version, that version is returned with the
 * position that holds it and `written: false`, and nothing is written. Its
 * `status` says whether that version is proposed or already active, which is
 * the caller's to report. The owner gate runs FIRST, so a non-owner is refused
 * exactly as a writing press is.
 */
export async function rememberForFutureDrafts(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  params: { text: string }
): Promise<{ doc: BrainDoc; pointer: string; written: boolean }> {
  // READ ONCE INTO A LOCAL (C-40): a getter cannot pass this check with one
  // value and hand `editBrainDocument` another.
  const text = params?.text;
  if (typeof text !== "string" || !/\S/.test(text) || text.trim() === CHECK) {
    throw new BrainEditUnchangedError();
  }
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const versions = await profileScope.accessors.brainDocsByKind(
    REMEMBERED_PREFERENCE_KIND
  );
  const base = authoritativeEditableBrainDoc(versions);
  if (!base) {
    throw new ProvenanceError(
      "this creator has no Kill Test document to add a rule to yet"
    );
  }
  const rules = (base.content as { rules?: unknown } | null)?.rules;
  if (!Array.isArray(rules)) {
    throw new ProvenanceError("this Kill Test version has no rule list");
  }
  // THE SAME GATE THE WRITE BELOW RUNS (`writeBrainDoc`'s owner check), run
  // here too because the no-write answer below must not be a non-owner's
  // way past it.
  if (profileScope.role !== "owner") {
    throw new ProfileRoleError(
      "write a brain document for this creator",
      profileScope.role,
      "owner"
    );
  }
  const wanted = normaliseContent(text).trim();
  const held = rules.findIndex(
    (rule) => typeof rule === "string" && normaliseContent(rule).trim() === wanted
  );
  if (held >= 0) {
    return { doc: base, pointer: `/rules/${held}`, written: false };
  }
  // THE NEXT POSITION OF THE STORED LIST, never a caller's index: an edit may
  // only grow a list at its end, and `editBrainDocument` re-checks that (and
  // that `base` is still the editable version) inside its own transaction.
  const pointer = `/rules/${rules.length}`;
  const doc = await editBrainDocument(db, scope, profileId, base.id, [
    { pointer, value: text },
  ]);
  return { doc, pointer, written: true };
}

// BOUNDED RECENT CONTEXT (launch L3, R-152) — which of a creator's earlier
// drafts and reactions one concept or script prompt carries, under which
// labels, and what the claim's request snapshot records about the choice.
//
// PURE BY CONSTRUCTION: the scoped READ is `recentContextCandidates` in
// `@respin/db` (the one scoping helper, both scope columns on every table, the
// plan's count bounds and deterministic relevance order); this module turns
// those rows into labelled text under the configured character budget and
// writes down what it chose. No database, no clock, no network — so every
// boundary below is assertable without Postgres (`recent-context.test.ts`).
//
// WHAT THIS MODULE MAY NEVER DO, stated where the temptation will arrive:
//
//   - VOUCH. History reaches the prompt as `GenerationContext.recentWork`,
//     which `traceabilityCorpusFor` and `basisCorpusFor` do not read — so an
//     old draft's number or name, or a creator's reaction note, cannot make a
//     specific in the NEW output count as traced. On top of that, a passage
//     carrying `[check]`, any specific or claim its own scan reported, or any
//     specific shape the traceability check hard-enforces is not sent at all:
//     the first three are the parts of an old draft nobody ever vouched for,
//     and the last is a specific that would be untraced in the new draft and
//     cost the creator a rewrite or a charged refusal if it were reused.
//   - LEARN. Nothing here counts, ranks or summarises reactions (R11): each
//     reaction becomes a LABEL on the draft it is about, one row at a time.
//     An approved preference lives in the brain, through the creator's own
//     edit (`rememberForFutureDrafts`), never here.
//   - CARRY CREATOR TEXT INTO THE SNAPSHOT. `RecentContextSnapshot` is ids,
//     closed labels, versions and counts. The claim row outlives a refusal for
//     a year (R-151 item 3).
import { CHECK } from "@respin/llm";
import {
  RECENT_DRAFTS_MAX,
  RECENT_NOTES_MAX,
  type CreativePiece,
  type Generation,
  type GenerationAttempt,
  type GenerationFeedbackReaction,
  type RecentContextCandidates,
} from "@respin/db";
import {
  RECENT_WORK_NOTE_PREFIX,
  readStoredScriptOutput,
  scanTraceability,
  type ModeId,
  type RecentWorkContext,
  type RecentWorkEntry,
  type RecentWorkLabel,
  type ScriptOutput,
} from "@respin/modes";

import { GenerationRecoveryRequiredError } from "./errors";

/**
 * WHAT A REACTION CODE MEANS AS A LABEL — a `Record` over the database's own
 * closed enum, so a reaction added to `generation_feedback_reaction` is a
 * compile error here rather than an unlabelled row (CLAUDE.md Respin rule 7:
 * the population is a list).
 */
export const REACTION_LABELS: Readonly<
  Record<GenerationFeedbackReaction, RecentWorkLabel>
> = {
  used_as_is: "reported_used",
  used_with_edits: "reported_used_with_edits",
  off_voice: "rejected_off_voice",
  too_generic: "rejected_too_generic",
  wrong_angle: "rejected_wrong_angle",
  not_filmable: "rejected_not_filmable",
  discarded: "rejected_discarded",
};

/** Why a candidate row was not sent. A closed set, recorded per operation. */
export type RecentContextExclusionReason =
  /** The operation already carries it as material (a revision's parent, a piece's source). */
  | "already_material"
  /** It did not fit in what was left of the character budget. */
  | "over_budget"
  /**
   * Every passage carried `[check]`, a specific or a claim its own scan
   * reported, or a hard-enforced specific shape (see `usablePassages`).
   */
  | "nothing_usable"
  /** Its stored output or its stored kill test could not be read. */
  | "unreadable"
  /**
   * The creator pressed "Leave this out of future drafts" (audit P6-A1,
   * R-174). As a NOTE: a left-out reaction that would have taken a place in
   * the notes window, or that was on a draft that was considered; neither its
   * words nor its label are sent. As a DRAFT: a draft every reaction on which
   * was left out, which is not sent at all (Phase 6 tenancy gate).
   */
  | "creator_excluded";

/**
 * THE SNAPSHOT SECTION (R-152): the chosen record ids, their versions and
 * their order, every exclusion and the budget — identities and numbers only.
 */
export type RecentContextSnapshot = {
  v: 1;
  sequel: boolean;
  charBudget: number;
  charsUsed: number;
  draftsMax: number;
  notesMax: number;
  /** In PROMPT ORDER (`position`). `contractVersion` is the draft's stored output version. */
  records: {
    kind: "draft" | "note";
    id: string;
    position: number;
    labels: RecentWorkLabel[];
    contractVersion: 1 | 2 | null;
    chars: number;
  }[];
  /** The pieces whose state labelled a draft `chosen`, at the version read. */
  pieces: { id: string; version: number }[];
  exclusions: {
    kind: "draft" | "note";
    id: string;
    reason: RecentContextExclusionReason;
  }[];
};

export const RECENT_CONTEXT_SNAPSHOT_VERSION = 1;

/** One draft's or note's text, before the budget decides whether it goes. */
type Candidate = {
  kind: "draft" | "note";
  id: string;
  labels: RecentWorkLabel[];
  text: string;
  contractVersion: 1 | 2 | null;
};

function codePoints(text: string): number {
  return [...text].length;
}

/** One line, whitespace runs collapsed — the prompt block flattens again. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The field a history passage is scanned under by `carriesHardSpecific`. It is
 * not a pointer into any output and it is not under `FLAG_ONLY_FIELD_PREFIXES`,
 * so every shape is read at its OWN enforcement — the reading it gets wherever
 * the next draft could reuse it outside the disclosure section.
 */
const HISTORY_SCAN_FIELD = "/recentWork";

/**
 * WHETHER A HISTORY LINE CARRIES A SPECIFIC THE TRACEABILITY CHECK HARD-ENFORCES
 * (L3 gate, compliance Low A-L2) — a date, an amount, a percentage, a
 * multiplier: every `SPECIFIC_SHAPES` entry whose `enforcement` is `"hard"`.
 *
 * THE CHECK ITSELF, NOT A SECOND DETECTOR: the line is handed to
 * `scanTraceability` against an EMPTY corpus, which is exactly the position a
 * history line is in — it is in neither corpus (`assemble.ts`), so in a new
 * output every specific it carries is untraced. A hard finding here is a
 * specific that would force a rewrite, and then a charged refusal, if the next
 * draft reused it; so the line is not sent. Flag-only shapes (a bare count, a
 * capitalised word) still go: reusing one costs a `[check]` offer, not a
 * refusal.
 */
function carriesHardSpecific(line: string): boolean {
  return scanTraceability([{ field: HISTORY_SCAN_FIELD, text: line, isHook: false }], {
    brain: [],
    input: [],
    unvouched: [],
  }).some((finding) => finding.enforcement === "hard");
}

/**
 * The tokens of every performance, certainty or concealment claim a stored
 * draft's own final scan reported (`finalAttempt.claims[*].token`, REQ-I04/I05),
 * flag-only ones included — or `null` when they cannot be read. READ
 * FAIL-CLOSED like `reportedSpecificsOf`: a `claims` that is absent or not an
 * array, or an entry with no string token, is a document this product never
 * writes, and `usablePassages` makes the draft `unreadable`. It RETURNS rather
 * than throws: nothing here is a refusal a caller should see
 * (`facade-errors.test.ts` keeps anonymous throws off app-reachable files).
 */
function claimTokensOf(killTest: unknown): string[] | null {
  const final = (killTest as { finalAttempt?: unknown } | null | undefined)?.finalAttempt;
  const claims =
    final !== null && typeof final === "object"
      ? (final as { claims?: unknown }).claims
      : undefined;
  if (!Array.isArray(claims)) return null;
  const tokens: string[] = [];
  for (const claim of claims) {
    const token = (claim as { token?: unknown } | null)?.token;
    if (typeof token !== "string" || token.length === 0) return null;
    // The scan lowercases what it matched (`ClaimFinding.token`).
    tokens.push(token.toLowerCase());
  }
  return tokens;
}

/**
 * The passages of one stored draft that MAY be shown as history: every one
 * that carries none of `[check]`, a specific its own scan reported, a claim
 * its own scan reported, or a specific shape the traceability check
 * hard-enforces. A reader failure is `null` (the row is `unreadable`), never
 * an empty list.
 */
function usablePassages(
  generation: Generation,
  reportedSpecificsOf: (killTest: unknown) => string[],
  chosenIdeaIndexes: ReadonlySet<number>
): { passages: string[]; contractVersion: 1 | 2 } | null {
  let output: ScriptOutput;
  let reported: string[];
  try {
    output = readStoredScriptOutput({
      value: generation.output,
      mode: generation.mode as ModeId,
    });
    reported = reportedSpecificsOf(generation.killTest);
  } catch {
    return null;
  }
  const claimed = claimTokensOf(generation.killTest);
  if (claimed === null) return null;
  const clean = (text: string | undefined): string | null => {
    if (typeof text !== "string") return null;
    const line = flat(text);
    if (line.length === 0 || line.includes(CHECK)) return null;
    if (reported.some((token) => token.length > 0 && line.includes(token))) {
      return null;
    }
    const lower = line.toLowerCase();
    if (claimed.some((token) => lower.includes(token))) return null;
    if (carriesHardSpecific(line)) return null;
    return line;
  };
  const passages: string[] = [];
  if (output.ideas) {
    // THE CHOSEN CONCEPT FIRST, so a budget that keeps only part of a batch
    // keeps the one the creator picked.
    const order = output.ideas
      .map((idea, index) => ({ idea, index }))
      .sort(
        (a, b) =>
          Number(chosenIdeaIndexes.has(b.index)) - Number(chosenIdeaIndexes.has(a.index)) ||
          a.index - b.index
      );
    for (const { idea } of order) {
      const parts = [clean(idea.hook), clean(idea.thesis)].filter(
        (p): p is string => p !== null
      );
      if (parts.length > 0) passages.push(parts.join(" — "));
    }
  } else {
    const parts = [
      clean(output.thesis?.statement),
      clean(output.hooks?.[0]?.text),
    ].filter((p): p is string => p !== null);
    if (parts.length > 0) passages.push(parts.join(" — "));
  }
  return { passages, contractVersion: output.contractVersion === 2 ? 2 : 1 };
}

/**
 * BUILD THE LABELLED HISTORY AND ITS SNAPSHOT (launch L3, R-152).
 *
 * THE BUDGET IS SPENT ON NOTES FIRST, then drafts, each in the accessor's
 * relevance order: a reaction is the shortest record and the one most likely
 * to be the correction the next draft needs (the plan's least-confident
 * point). A record that does not fit is excluded WHOLE — never truncated, the
 * `frameworksForContext` rule: half a draft is a different draft — and the
 * next one is still tried (`continue`, not `break`).
 *
 * `reportedSpecificsOf` IS INJECTED rather than imported, so this module has
 * the ONE reader of a stored kill test's findings (`generate.ts`) without an
 * import cycle back into it.
 */
export function buildRecentContext(args: {
  candidates: RecentContextCandidates;
  charBudget: number;
  sequel: boolean;
  /** Ids the operation already carries as material; recorded, never sent. */
  materialIds: readonly string[];
  reportedSpecificsOf: (killTest: unknown) => string[];
}): { context: RecentWorkContext; snapshot: RecentContextSnapshot } {
  const { candidates, sequel } = args;
  const budget =
    Number.isInteger(args.charBudget) && args.charBudget > 0 ? args.charBudget : 0;
  const exclusions: RecentContextSnapshot["exclusions"] = args.materialIds.map(
    (id) => ({ kind: "draft" as const, id, reason: "already_material" as const })
  );
  // THE CREATOR'S OWN CHOICE, RECORDED FIRST (R-174): the accessor has already
  // kept these rows out of `notes` and `draftReactions`, so nothing below can
  // send them; this is the snapshot saying so, ids only.
  for (const id of candidates.creatorExcluded) {
    exclusions.push({ kind: "note", id, reason: "creator_excluded" });
  }
  // ...and a draft every reaction on which was left out (Phase 6 tenancy gate).
  for (const id of candidates.creatorExcludedDrafts) {
    exclusions.push({ kind: "draft", id, reason: "creator_excluded" });
  }

  // THE PER-ROW FACTS THAT LABEL A DRAFT. A cancelled piece chose nothing: the
  // creator backed out, which is not a selection.
  const livePieces: CreativePiece[] = candidates.pieces.filter(
    (p) => p.state !== "cancelled"
  );
  const chosenIdeas = new Map<string, Set<number>>();
  const chosenScripts = new Set<string>();
  for (const piece of livePieces) {
    if (piece.sourceGenerationId !== null && piece.sourceIdeaIndex !== null) {
      const set = chosenIdeas.get(piece.sourceGenerationId) ?? new Set<number>();
      set.add(piece.sourceIdeaIndex);
      chosenIdeas.set(piece.sourceGenerationId, set);
    }
    if (piece.selectedGenerationId !== null) chosenScripts.add(piece.selectedGenerationId);
  }
  const usedPieces = new Map<string, number>();

  const draftCandidates: Candidate[] = [];
  for (const draft of candidates.drafts.slice(0, RECENT_DRAFTS_MAX)) {
    const chosen = chosenIdeas.get(draft.id) ?? new Set<number>();
    const read = usablePassages(draft, args.reportedSpecificsOf, chosen);
    if (read === null) {
      exclusions.push({ kind: "draft", id: draft.id, reason: "unreadable" });
      continue;
    }
    if (read.passages.length === 0) {
      exclusions.push({ kind: "draft", id: draft.id, reason: "nothing_usable" });
      continue;
    }
    const labels: RecentWorkLabel[] = [
      draft.mode === "ideation" ? "concept_batch" : "script",
    ];
    if (chosen.size > 0 || chosenScripts.has(draft.id)) {
      labels.push("chosen");
      for (const piece of livePieces) {
        if (piece.sourceGenerationId === draft.id || piece.selectedGenerationId === draft.id) {
          usedPieces.set(piece.id, piece.version);
        }
      }
    }
    for (const r of candidates.draftReactions) {
      if (r.generationId !== draft.id) continue;
      const label = REACTION_LABELS[r.reaction];
      if (label !== undefined && !labels.includes(label)) labels.push(label);
    }
    draftCandidates.push({
      kind: "draft",
      id: draft.id,
      labels,
      text: read.passages.join(" | "),
      contractVersion: read.contractVersion,
    });
  }

  const noteCandidates: Candidate[] = [];
  for (const { feedback, about } of candidates.notes.slice(0, RECENT_NOTES_MAX)) {
    const label = REACTION_LABELS[feedback.reaction];
    if (label === undefined) {
      exclusions.push({ kind: "note", id: feedback.id, reason: "unreadable" });
      continue;
    }
    // WHAT THE REACTION IS ABOUT: the first passage of that draft that may be
    // shown, by the same rule as a draft record. An honest refusal has no
    // output, so a note about one carries only the creator's words.
    const aboutRead =
      about.outcome === "usable" && about.output !== null
        ? usablePassages(about, args.reportedSpecificsOf, new Set())
        : null;
    const aboutText = aboutRead?.passages[0] ?? "";
    // THE CREATOR'S OWN WORDS, under a prefix that says whose they are — and
    // still not evidence: this block is outside both corpora. By the passage
    // rule above, words that carry `[check]` or a hard-enforced specific shape
    // are not sent: a figure or a date the creator typed about an OLD draft is
    // untraced in the new one, and reusing it would cost a rewrite or a charged
    // refusal (L3 gate, A-L2). The reaction's label and the draft passage still go.
    const flatNote = feedback.note === null ? "" : flat(feedback.note);
    const words =
      flatNote.includes(CHECK) || carriesHardSpecific(flatNote) ? "" : flatNote;
    const text = [aboutText, words === "" ? "" : RECENT_WORK_NOTE_PREFIX + words]
      .filter((part) => part.length > 0)
      .join(" — ");
    if (text.length === 0) {
      exclusions.push({ kind: "note", id: feedback.id, reason: "nothing_usable" });
      continue;
    }
    noteCandidates.push({
      kind: "note",
      id: feedback.id,
      labels: [label],
      text,
      contractVersion: null,
    });
  }

  // THE ONE BUDGET, notes first.
  let used = 0;
  const kept = new Set<Candidate>();
  for (const candidate of [...noteCandidates, ...draftCandidates]) {
    const size = codePoints(candidate.text);
    if (used + size > budget) {
      exclusions.push({ kind: candidate.kind, id: candidate.id, reason: "over_budget" });
      continue;
    }
    used += size;
    kept.add(candidate);
  }

  // PROMPT ORDER: drafts, then the reactions — each list in relevance order.
  const ordered = [...draftCandidates, ...noteCandidates].filter((c) => kept.has(c));
  const entries: RecentWorkEntry[] = ordered.map((c) => ({
    kind: c.kind,
    labels: c.labels,
    text: c.text,
  }));
  // A piece is recorded only if the draft it labelled was actually sent.
  const sentDraftIds = new Set(ordered.filter((c) => c.kind === "draft").map((c) => c.id));
  const pieces = livePieces
    .filter(
      (p) =>
        usedPieces.has(p.id) &&
        ((p.sourceGenerationId !== null && sentDraftIds.has(p.sourceGenerationId)) ||
          (p.selectedGenerationId !== null && sentDraftIds.has(p.selectedGenerationId)))
    )
    .map((p) => ({ id: p.id, version: p.version }));
  return {
    context: { sequel, entries },
    snapshot: {
      v: RECENT_CONTEXT_SNAPSHOT_VERSION,
      sequel,
      charBudget: budget,
      charsUsed: used,
      draftsMax: RECENT_DRAFTS_MAX,
      notesMax: RECENT_NOTES_MAX,
      records: ordered.map((c, position) => ({
        kind: c.kind,
        id: c.id,
        position,
        labels: [...c.labels],
        contractVersion: c.contractVersion,
        chars: codePoints(c.text),
      })),
      pieces,
      exclusions,
    },
  };
}

/**
 * THE RECORDS A CLAIM'S SNAPSHOT SAYS ITS PROMPT CARRIED, read FAIL-CLOSED —
 * or `null` for a claim that carries no recent-context section (a mode that
 * reads no history, or a claim written before L3). A section this build did
 * not write is `GenerationRecoveryRequiredError` — the facade's own typed
 * refusal, never an anonymous `Error` (`facade-errors.test.ts`) — and the
 * settlement records the claim `recovery_required`, never a guess.
 */
export function recentContextIdsOf(
  claim: Pick<GenerationAttempt, "attemptId" | "requestSnapshot">
): { generationIds: string[]; feedbackIds: string[] } | null {
  const unreadable = (what: string): never => {
    throw new GenerationRecoveryRequiredError(
      claim.attemptId,
      `the claim's recent-context section is unreadable: ${what}`
    );
  };
  const snap = claim.requestSnapshot as Record<string, unknown> | null;
  if (snap === null || typeof snap !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(snap, "recentContext")) return null;
  const section = snap.recentContext;
  if (section === null) return null;
  if (
    typeof section !== "object" ||
    Array.isArray(section) ||
    (section as Record<string, unknown>).v !== RECENT_CONTEXT_SNAPSHOT_VERSION ||
    !Array.isArray((section as Record<string, unknown>).records)
  ) {
    unreadable("it is not a section this build writes");
  }
  const generationIds: string[] = [];
  const feedbackIds: string[] = [];
  for (const record of (section as { records: unknown[] }).records) {
    const r = record as Record<string, unknown> | null;
    const id = r !== null && typeof r === "object" ? r.id : undefined;
    if (typeof id !== "string") return unreadable("a record has no id");
    if (r!.kind === "draft") generationIds.push(id);
    else if (r!.kind === "note") feedbackIds.push(id);
    else return unreadable("a record has no kind this build writes");
  }
  return { generationIds, feedbackIds };
}

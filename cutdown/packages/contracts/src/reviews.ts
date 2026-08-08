/**
 * ReviewDecision resolution — the SINGLE implementation (Phase 5, task 1).
 *
 * decisions.md D-9 makes approval a human act recorded with a name, and the
 * Phase 5 plan adds two rules that pull against each other:
 *
 *   - **history is preserved** — a duplicate or conflicting decision is a NEW
 *     immutable record, never an overwrite of the old one; and
 *   - **selection is deterministic** — exactly one decision is *in force* for a
 *     given draft, and every reader must agree on which.
 *
 * One file per manifest cannot satisfy both (the second decision would have to
 * clobber the first), so decisions are stored one file per decision, named by
 * `reviewDecisionId`, and *which one counts* is computed here. Four callers read
 * this module rather than each implementing the sort: the `approve` skill (to
 * report what it superseded), the `render` skill (to authorise a final tier), the
 * `package` skill (to bind the approval into the ContentPackage), and
 * the runner's own pre-`approve` gate (`run.ts`). A second sort rule in a
 * second caller is a second answer to "is this approved?", which is the one
 * question the ordering must never be ambiguous about.
 *
 * ## Why the ordering is a total order — and why it compares INSTANTS
 *
 * `decidedAt` alone is not enough: two decisions recorded in the same second — or
 * two hand-authored files carrying the same timestamp — would tie, and a tie
 * resolved by directory order is resolved by the filesystem. `reviewDecisionId`
 * is a ULID and therefore creation-ordered and unique, so `(decidedAt,
 * reviewDecisionId)` is total. Ties can exist in the first component; they cannot
 * exist in the pair.
 *
 * The first component is compared as an **instant**, not as a string. This is the
 * defect the Phase 5 reviewer caught: `review-decision-v1` types `decidedAt` as
 * `format: date-time`, which admits a UTC offset, so
 * `2026-07-31T04:00:00+10:00` (18:00Z) sorts *after* `2026-07-30T20:00:00Z`
 * lexically while being genuinely *earlier*. A string compare therefore let an
 * approval outrank a later rejection — and every reader of this module (the render
 * skill, the package skill, the runner gate) would then have
 * authorised a cut a named human rejected. A decision whose `decidedAt` is not a
 * parseable instant is not orderable at all and is refused as a candidate.
 *
 * ## Why it never throws on content
 *
 * These files can be hand-authored (a human wrote an approval; a human can
 * mistype one). A malformed record is REPORTED as a rejected candidate with a
 * reason, never thrown past the caller and never silently dropped — a decision
 * that quietly disappears reads downstream as "never reviewed", which is the one
 * conclusion the record exists to prevent.
 *
 * Every candidate is validated against `review-decision-v1` itself, for the same
 * reason the `package` skill validates waiver files: a structural key-presence
 * check admits `decidedBy: null` and a non-ULID subject id, and an anonymous
 * approval is the one thing D-9 forbids.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { createAjv, formatAjvErrors } from './ajv.js';

import type { ReviewDecisionV1 } from '../generated/typescript/index.js';

export type ReviewDecision = ReviewDecisionV1.ReviewDecision;

/** A file under `reviews/` that does not parse as a ReviewDecision, and why. */
export interface RejectedDecisionFile {
  readonly file: string;
  readonly reason: string;
}

export interface LoadedReviewDecisions {
  /** Every decision that parsed, in force order (oldest first). */
  readonly decisions: readonly ReviewDecision[];
  /**
   * Files that looked like decisions and were not.
   *
   * Surfaced rather than swallowed: a caller deciding "this draft was never
   * approved" must be able to distinguish "no decision exists" from "a decision
   * exists and is unreadable", because the second is an operator error with a
   * fix and the first is simply the state of the world.
   */
  readonly rejected: readonly RejectedDecisionFile[];
}

/**
 * Total order over decisions: `decidedAt` first, then the ULID.
 *
 * Exported so a caller that has decisions in hand (from a test fixture, say)
 * sorts them the same way a caller reading a directory does.
 */
export function compareDecisions(a: ReviewDecision, b: ReviewDecision): number {
  // INSTANTS, not strings. `format: date-time` admits an offset, so
  // `2026-07-31T04:00:00+10:00` is 18:00Z — genuinely EARLIER than
  // `2026-07-30T20:00:00Z` while sorting later lexically. Both operands are
  // parseable here because `loadReviewDecisions` refuses a candidate whose
  // `decidedAt` is not (`decidedAtInstant` below).
  const at = decidedAtInstant(a);
  const bt = decidedAtInstant(b);

  // An unparseable instant is ordered LAST-resort, deterministically, rather than
  // left to NaN comparisons. `NaN < x` and `NaN > x` are both false, which made this
  // function non-antisymmetric: `cmp(bad, good)` and `cmp(good, bad)` both returned
  // 1, and `selectLatestDecision` then picked whichever the array order favoured.
  // `loadReviewDecisions` refuses such a decision, so this is unreachable through
  // the normal path — but the function is exported and its docstring invites callers
  // holding decisions from a fixture to use it, so it must be total on its own.
  if (at === null || bt === null) {
    if (at === null && bt === null) return compareIds(a, b);
    // The parseable one is always "later": an undatable decision can never be the
    // one in force, and sorting it last would make it win.
    return at === null ? -1 : 1;
  }

  if (at !== bt) return at < bt ? -1 : 1;
  return compareIds(a, b);
}

/** ULID tiebreak. Unique by construction, so the pair (instant, id) is a total order. */
function compareIds(a: ReviewDecision, b: ReviewDecision): number {
  if (a.reviewDecisionId === b.reviewDecisionId) return 0;
  return a.reviewDecisionId < b.reviewDecisionId ? -1 : 1;
}

/**
 * The instant a decision was made, or `null` if `decidedAt` is not parseable.
 *
 * A decision that cannot be placed on a timeline cannot be ordered, and a
 * decision that cannot be ordered cannot be "the one in force". `Date.parse`
 * returns `NaN` for junk, and `NaN` compares false against everything — which
 * would silently park an unparseable decision wherever the sort happened to leave
 * it, and a value like `"yesterday"` would then win every comparison.
 */
export function decidedAtInstant(decision: ReviewDecision): number | null {
  const parsed = Date.parse(decision.decidedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The decision in force among `decisions`, or `null` for an empty list.
 *
 * Note what this deliberately does NOT do: it does not prefer an approval over a
 * rejection, or the reverse. The latest decision wins whatever it says, because
 * a reviewer who approves and then rejects has changed their mind, and a rule
 * that let the approval keep winning would make the rejection unrecordable.
 */
export function selectLatestDecision(
  decisions: readonly ReviewDecision[],
): ReviewDecision | null {
  let latest: ReviewDecision | null = null;
  for (const candidate of decisions) {
    if (latest === null || compareDecisions(candidate, latest) > 0) latest = candidate;
  }
  return latest;
}

export const REVIEW_DECISION_SCHEMA_ID = 'https://cutdown.local/contracts/schemas/review-decision-v1.json';

/**
 * The decision NAMESPACE this module owns: `reviews/<ulid>.json`, exactly what
 * `approve` writes.
 *
 * This filter is load-bearing, and its absence caused a total outage. `reviews/` is
 * documented (tech-spec §9.1) as holding "ReviewDecision records from `cutdown
 * approve`" — but `validate` has written `<edlId>-gate.json` and `<edlId>-critic.json`
 * there since Phase 3, and `validate` is pipeline step 5 while approval is step 7. So
 * every job that had been validated carried two non-decision files in the directory
 * this resolver reads. Reading `*.json` indiscriminately made them failed candidates;
 * the `indeterminate` arm then made every such job permanently unable to reach a
 * final render or a package, and silently nullified real human approvals.
 *
 * Matching the exact filename `approve` produces is also forgery-resistant in a way
 * "any .json" is not: a file has to be ULID-named to be *considered* a decision at
 * all, so an unrelated file dropped into `reviews/` is out of scope rather than a veto.
 * `indeterminate` is reserved for a file that IS in this namespace and fails to parse
 * — which is the case that genuinely might be the rejection superseding an approval.
 */
const DECISION_FILENAME = /^[0-9A-HJKMNP-TV-Z]{26}\.json$/;

/**
 * Validate a candidate against `review-decision-v1` itself.
 *
 * The first cut was a key-presence check, and a key-presence check admits exactly
 * the records that matter: `decidedBy: null` (an anonymous approval, the one thing
 * D-9 forbids), a `subjectRenderManifestId` that is not a ULID (and therefore
 * usable as a path fragment), and a `decidedAt` that is not a date. The contract
 * already forbids all three; the resolver just wasn't asking it.
 *
 * Returns a reason string, or `null` when the candidate is a valid decision.
 */
type DecisionValidator = (value: unknown) => boolean;

/**
 * Compiled once per directory read, not once per file: `createAjv()` registers
 * every contract schema, so calling it per candidate would re-do that work for
 * each decision in the job.
 */
function decisionValidator(): { validate: DecisionValidator | null; errors: () => string } {
  const compiled = createAjv().getSchema(REVIEW_DECISION_SCHEMA_ID);
  if (compiled === undefined) return { validate: null, errors: () => '(schema not registered)' };
  return { validate: (value: unknown) => compiled(value) as boolean, errors: () => formatAjvErrors(compiled.errors) };
}

function describeIfNotDecision(
  value: unknown,
  validator: ReturnType<typeof decisionValidator>,
): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return 'not a JSON object';
  }
  const { validate } = validator;
  if (validate === null) {
    // Registration is a build-time fact; a missing schema means the contracts
    // package is broken, and treating every decision as invalid is the fail-closed
    // reading (no approval is in force) rather than trusting them all.
    return `${REVIEW_DECISION_SCHEMA_ID} is not registered, so no decision can be validated`;
  }
  if (!validate(value)) return `does not satisfy review-decision-v1: ${validator.errors().trim()}`;
  if (decidedAtInstant(value as ReviewDecision) === null) {
    // `format: date-time` is validated above, but Ajv's format check and
    // `Date.parse` are two different implementations; a value only one of them
    // accepts is not orderable, and an unorderable decision cannot be in force.
    return `\`decidedAt\` is not a parseable instant, so the decision cannot be ordered`;
  }
  return null;
}

/**
 * Read every ReviewDecision in a job's `reviews/` directory.
 *
 * A missing directory is an empty result, not an error: a job that has never
 * reached review has no `reviews/` yet, and that is an ordinary state.
 *
 * Only regular files whose names match `DECISION_FILENAME` are read — the namespace
 * `approve` owns. That keeps three classes of neighbour out of the decision set: the
 * `reviews/pending/` payloads and `reviews/gates/` outputs (subdirectories, also
 * excluded by `isFile()`), and any other file a human or another skill leaves here.
 * A consequence worth knowing: a symlinked decision file is invisible rather than
 * reported, because `isFile()` is false for a symlink.
 */
export function loadReviewDecisions(reviewsDir: string): LoadedReviewDecisions {
  let files: string[];
  try {
    files = readdirSync(reviewsDir, { withFileTypes: true })
      // `isFile()` uses lstat semantics, so a SYMLINKED decision was neither read nor
      // reported — a third state the module's own absolute rule ("any unreadable file
      // in the namespace makes the answer indeterminate") did not cover. If such a
      // link pointed at a REJECTION, an older approval resolved and every caller
      // authorised the cut: the same inversion round 2 blocked on. Symlinks are now
      // candidates, and the read/validate below decides — a dangling one becomes a
      // rejected candidate, which is `indeterminate`, which blocks.
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && DECISION_FILENAME.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { decisions: [], rejected: [] };
  }

  const validator = decisionValidator();
  const decisions: ReviewDecision[] = [];
  const rejected: RejectedDecisionFile[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(reviewsDir, file), 'utf8'));
    } catch (error) {
      rejected.push({ file, reason: `not valid JSON: ${(error as Error).message}` });
      continue;
    }
    const problem = describeIfNotDecision(parsed, validator);
    if (problem !== null) {
      rejected.push({ file, reason: problem });
      continue;
    }
    decisions.push(parsed as ReviewDecision);
  }
  decisions.sort(compareDecisions);
  return { decisions, rejected };
}

/** Every decision whose subject is one RenderManifest revision, in force order. */
export function decisionsForManifest(
  decisions: readonly ReviewDecision[],
  renderManifestId: string,
): readonly ReviewDecision[] {
  return decisions.filter((d) => d.subjectRenderManifestId === renderManifestId);
}

export type ApprovalResolution =
  | { readonly kind: 'approved'; readonly decision: ReviewDecision; readonly supersededCount: number }
  | { readonly kind: 'rejected'; readonly decision: ReviewDecision }
  | { readonly kind: 'none' }
  | {
      /**
       * At least one file in the decision namespace could not be read as a decision,
       * so the set of decisions is INCOMPLETE and no approval can be trusted.
       *
       * `rejectedFiles` lives on THIS ARM ONLY. It was briefly on all four, which
       * read as "any caller might have files to report" — but the indeterminate check
       * runs before any decision is examined, so on the other three arms the array was
       * provably empty and every `rejectedFiles.length > 0` branch guarding them was
       * dead code that looked like a live policy.
       */
      readonly kind: 'indeterminate';
      readonly rejectedFiles: readonly RejectedDecisionFile[];
    };

/**
 * Is a given draft RenderManifest approved, right now, according to the decision
 * in force?
 *
 * The arms are distinct on purpose and no caller may collapse them: `rejected`
 * means a human looked and said no; `none` means nobody has decided;
 * `indeterminate` means the decision set is incomplete. All three refuse a final
 * render, but they have different next steps, and telling an operator "not
 * approved" when the truth is "rejected, here is why" wastes the review that
 * already happened.
 *
 * ## Why an unreadable file makes the whole resolution indeterminate
 *
 * The Phase 5 round-2 reviewer found the inversion that round 1 warned about, and
 * it was real: `rejectedFiles` lived only on the `none` arm, so when an approval
 * resolved, an unreadable *rejection* was invisible — and every caller (render,
 * package, the runner gate) then authorised a cut a human may
 * have rejected. The round-1 Ajv fix made this WORSE, because Ajv refuses strictly
 * more files than the key-presence check it replaced: a rejection carrying an
 * RFC-3339 leap second (`23:59:60Z`) or an offset form is contract-valid and
 * `Date.parse`-NaN, so it was dropped silently.
 *
 * The rule is therefore: any unreadable file **in the decision namespace** makes the
 * answer `indeterminate`, whatever the readable decisions say. The set is what
 * determines "latest", so an incomplete set cannot determine it.
 *
 * Scoped to the namespace (`DECISION_FILENAME`) rather than to every `*.json`,
 * because the unscoped version was an outage: `validate`'s gate outputs live in this
 * directory, so every validated job became permanently unpackageable. Fail-closed
 * still has to leave a way forward — a control with no recovery path is an outage
 * wearing a control's clothes.
 *
 * Recovery is non-destructive and the refusals say so: a ULID-named file that does
 * not satisfy `review-decision-v1` was not written by `approve` (which validates
 * before writing), so it is either hand-authored or corrupt. Re-run
 * `cutdown approve` to record a real decision, or move the bad file aside — never
 * delete review evidence to clear the block.
 */
export function resolveApprovalForManifest(
  reviewsDir: string,
  renderManifestId: string,
): ApprovalResolution {
  const loaded = loadReviewDecisions(reviewsDir);

  // FIRST, before looking at any decision. A file that could not be read might be
  // the rejection that supersedes the approval below it.
  if (loaded.rejected.length > 0) {
    return { kind: 'indeterminate', rejectedFiles: loaded.rejected };
  }

  const relevant = decisionsForManifest(loaded.decisions, renderManifestId);
  const latest = selectLatestDecision(relevant);
  // `loaded.rejected` is provably EMPTY from here down — the indeterminate return
  // above is unconditional on it — so these three arms do not carry it.
  if (latest === null) return { kind: 'none' };
  if (latest.decision.outcome === 'rejected') {
    return { kind: 'rejected', decision: latest };
  }
  return { kind: 'approved', decision: latest, supersededCount: relevant.length - 1 };
}

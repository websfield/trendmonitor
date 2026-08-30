// The interview + coherent activation surface (slice 3b, Stage A — DB layer
// only; no UI, no vendor/LLM call anywhere in this file).
//
// WHY A MODULE RATHER THAN METHODS ON `respinDb` DIRECTLY — the same reason
// `onboarding-ops.ts` and `brain-ops.ts` give: every exported function here
// composes `ProfileScope.mint` with a capability, and every one needs a `db`
// handle a test can supply. Written inline in `app-server.ts` they would be
// reachable only through `getServerDb()`, so every assertion about them would
// have to run in a Docker suite.
//
// WHY THIS FILE DOES NOT LIVE IN `packages/credits` (R-30 constraint 2, the
// same reason `onboarding-ops.ts`/`brain-ops.ts` don't either): nothing here
// reads config and nothing prices a run. Answering an interview question is
// not an entitlement — it stores text the creator typed and, on submission,
// composes two capabilities `packages/db` already owns.
//
// R6, "reusing writeBrainDoc exactly as-is, not a parallel writer": every
// claim this module builds is written through `writeCapabilities(...)`'s
// EXISTING `appendOnboardingInput` and `writeBrainDoc` capabilities, never a
// second insert. `submitInterview` mints its `ProfileScope` ON THE
// TRANSACTION HANDLE itself (`ProfileScope.mint(tx, scope, profileId)`,
// which the type accepts — `db: DbLike | TxLike`), so
// `writeCapabilities(txScope).appendOnboardingInput(...)`'s insert (which
// takes no `tx` parameter of its own; it writes through the db the scope was
// minted against) lands in the SAME transaction as the `writeBrainDoc` calls
// that follow it. That is what makes "nothing partial is left" (R5's rule,
// extended here even with no vendor call in the loop) true by construction
// rather than by care at each call site.
//
// THE ANSWER MODEL (R1). Every interview field is one of two shapes:
//   - a SCALAR claim (`audience`, `positioning`, each `metric` sub-field):
//     "decided" with one non-blank value, or "not decided" — rendered as the
//     stated value (cited) or `CHECK` (never cited), UNLESS the field is
//     `declinable` (`metricPlatform`, `metricWindow`), in which case
//     "not decided" OMITS the position entirely rather than storing `CHECK`
//     — see `brain-content.ts`'s own comment on why platform/window are
//     "genuinely optional in the product sense", distinct from "asked, not
//     answered".
//   - a LIST claim (`goals`, `ambitions`, `bannedWords`, `bannedVibes`):
//     "decided" with zero or more items (an explicit empty list is a real
//     answer — "I have none" — distinct from never having answered), or
//     "not decided" — rendered as the stated items (each cited) or a
//     SINGLE-ELEMENT `[CHECK]` array. A whole-array placeholder is not
//     representable (only individual elements carry `claim()`), so "not
//     decided" is one placeholder element rather than zero elements, which
//     keeps it distinguishable from "decided as explicitly none".
//
// `pillars` (strategy) and `rules` (killtest) are NOT interview fields (out
// of this slice's card) and are always written as `[]` — required,
// non-optional arrays the schema declares, satisfied trivially by zero
// claims. `goals`, `ambitions` and `metric` ARE always populated even when
// nothing under them was decided, per `brain-content.ts`'s own comment on
// the interview-driven builder; that is this file.
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbLike, TxLike } from "./db-like";
import type { BrainDoc } from "./brain-schema";
import type { OnboardingInput } from "./onboarding-schema";
import {
  onboardingInterviewDrafts,
  type OnboardingInterviewDraft,
} from "./onboarding-schema";
import {
  ProfileScope,
  writeCapabilities,
  type SourceEvidenceEntry,
  type WorkspaceScope,
} from "./with-workspace";
import { CHECK, METRIC_DIRECTIONS } from "./brain-content";
import type { BrainDocReason } from "./brain-reason";
import { InterviewAnswerError, InterviewDraftSubmittedError, ProfileRoleError } from "./errors";

/**
 * The most one interview answer may hold, in code points.
 *
 * A CODE CONSTANT, like `POST_CONTENT_MAX` in `onboarding-ops.ts` and for the
 * same reason: these are short interview answers (a positioning line, a
 * banned word), not full posts, so the ceiling is far tighter — and moving it
 * is a code change with a test, not a deploy-free operator dial.
 */
export const INTERVIEW_ANSWER_MAX = 2_000;

const nonBlank = (v: string) => v.trim().length > 0;

const decidedText = z.strictObject({
  status: z.literal("decided"),
  value: z
    .string()
    .max(INTERVIEW_ANSWER_MAX)
    .refine(nonBlank, "a decided answer may not be blank text (R1)"),
});
const decidedDirection = z.strictObject({
  status: z.literal("decided"),
  value: z.enum(METRIC_DIRECTIONS),
});
const decidedList = z.strictObject({
  status: z.literal("decided"),
  values: z
    .array(
      z
        .string()
        .max(INTERVIEW_ANSWER_MAX)
        .refine(nonBlank, "a decided list item may not be blank text (R1)")
    )
    // Bounded, the same reason every growing per-profile write in this
    // package is: a handful of goals/bans is the real use, not an unbounded
    // paste target.
    .max(50),
});
const notDecided = z.strictObject({ status: z.literal("not_decided") });

/** A scalar claim's answer: decided-with-a-value, or explicitly not decided. */
const textAnswerSchema = z.discriminatedUnion("status", [decidedText, notDecided]);
/** The one enum-restricted scalar (`metricDirection`). */
const directionAnswerSchema = z.discriminatedUnion("status", [
  decidedDirection,
  notDecided,
]);
/** A list claim's answer: decided-with-zero-or-more-items, or not decided. */
const listAnswerSchema = z.discriminatedUnion("status", [decidedList, notDecided]);

export type TextAnswer = z.infer<typeof textAnswerSchema>;
export type DirectionAnswer = z.infer<typeof directionAnswerSchema>;
export type ListAnswer = z.infer<typeof listAnswerSchema>;

/**
 * The whole interview draft's answer shape — every field OPTIONAL, because a
 * draft in progress may not have reached every question yet, and a PATCH
 * (what `saveInterviewDraft` takes) legitimately names only the fields this
 * screen just asked about.
 *
 * `z.strictObject` closes the key space the same way `brain-content.ts`
 * closes `brain_docs.content` — an unknown field key is refused, not stored,
 * so a typo in a field key fails loudly instead of silently vanishing.
 */
const interviewAnswersSchema = z.strictObject({
  audience: textAnswerSchema.optional(),
  positioning: textAnswerSchema.optional(),
  goals: listAnswerSchema.optional(),
  ambitions: listAnswerSchema.optional(),
  metricLabel: textAnswerSchema.optional(),
  metricUnit: textAnswerSchema.optional(),
  metricDirection: directionAnswerSchema.optional(),
  metricPlatform: textAnswerSchema.optional(),
  metricWindow: textAnswerSchema.optional(),
  bannedWords: listAnswerSchema.optional(),
  bannedVibes: listAnswerSchema.optional(),
});

export type InterviewAnswers = z.infer<typeof interviewAnswersSchema>;
export type InterviewFieldKey = keyof InterviewAnswers;

/** Validate, and return the PARSE OUTPUT — never the caller's object (same discipline as `parseBrainContent`). */
function parseAnswers(raw: unknown): InterviewAnswers {
  const parsed = interviewAnswersSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new InterviewAnswerError(
      `${first.path.length ? `/${first.path.join("/")} ` : ""}${first.message}`
    );
  }
  return parsed.data;
}

type FieldDescriptor = {
  key: InterviewFieldKey;
  kind: "text" | "list";
  target: "strategy" | "killtest";
  /** RFC-6901 pointer into the built content (base pointer for a list). */
  pointer: string;
  /** True only for `metricPlatform`/`metricWindow` — see this file's header. */
  declinable: boolean;
};

/**
 * THE REGISTRY (R1/R3, phase card): every question the interview asks, and
 * where its answer lands. `field_key` on `onboarding_inputs` (the CHECK
 * `onboarding_inputs_field_key_iff_creator_authored`) stores exactly these
 * slugs — this is the one place that vocabulary is declared.
 */
export const INTERVIEW_FIELDS: readonly FieldDescriptor[] = [
  { key: "audience", kind: "text", target: "strategy", pointer: "/audience", declinable: false },
  { key: "positioning", kind: "text", target: "strategy", pointer: "/positioning", declinable: false },
  { key: "goals", kind: "list", target: "strategy", pointer: "/goals", declinable: false },
  { key: "ambitions", kind: "list", target: "strategy", pointer: "/ambitions", declinable: false },
  { key: "metricLabel", kind: "text", target: "strategy", pointer: "/metric/label", declinable: false },
  { key: "metricUnit", kind: "text", target: "strategy", pointer: "/metric/unit", declinable: false },
  { key: "metricDirection", kind: "text", target: "strategy", pointer: "/metric/direction", declinable: false },
  { key: "metricPlatform", kind: "text", target: "strategy", pointer: "/metric/platform", declinable: true },
  { key: "metricWindow", kind: "text", target: "strategy", pointer: "/metric/window", declinable: true },
  { key: "bannedWords", kind: "list", target: "killtest", pointer: "/bannedWords", declinable: false },
  { key: "bannedVibes", kind: "list", target: "killtest", pointer: "/bannedVibes", declinable: false },
];

function fieldFor(key: InterviewFieldKey): FieldDescriptor {
  const found = INTERVIEW_FIELDS.find((f) => f.key === key);
  if (!found) throw new Error(`interview-ops: '${key}' is not a registered interview field`);
  return found;
}

/** Read the current draft row, or undefined. Shared by save and submit. */
async function readDraftRow(
  conn: DbLike | TxLike,
  profileId: string,
  workspaceId: string
): Promise<OnboardingInterviewDraft | undefined> {
  const [row] = await conn
    .select()
    .from(onboardingInterviewDrafts)
    .where(
      and(
        eq(onboardingInterviewDrafts.profileId, profileId),
        eq(onboardingInterviewDrafts.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return row;
}

/**
 * Role gate on the two interview writes (M5's target, R12) — "viewer cannot
 * submit the interview", applied to BOTH writes here for the class-not-field
 * reason G-13's own history in this repo gives: a gate added only where
 * today's caller happens to be is the shape that produced that finding.
 */
function assertMayAnswer(role: string, act: string): void {
  if (role === "viewer") throw new ProfileRoleError(act, role);
}

/**
 * Save (upsert) a PATCH of interview answers (R2/R11).
 *
 * A PATCH, not the whole draft: it is merged field-by-field into whatever is
 * already stored, so answering question 3 does not erase questions 1 and 2 —
 * "answer, go back, change your mind, leave and come back" costs nothing
 * (`onboarding_interview_drafts`' own docblock).
 *
 * REFUSES a patch to an already-SUBMITTED draft (R11) — resuming only ever
 * covers an unsubmitted draft; a submitted interview's answers are fixed,
 * see `InterviewDraftSubmittedError`.
 */
export async function saveInterviewDraft(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  patch: unknown
): Promise<OnboardingInterviewDraft> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  assertMayAnswer(profileScope.role, "save answers to this creator's interview");
  const parsedPatch = parseAnswers(patch);
  const ids = {
    profileId: profileScope.profileId as string,
    workspaceId: profileScope.workspaceId as string,
  };
  return db.transaction(async (tx) => {
    // THE SAME LOCK, THE SAME KEY, AND FOR THE SAME REASON `writeBrainDoc` /
    // `confirmBrainDocFields` / `activateBrainDoc` / `submitInterview` all
    // take it first (`with-workspace.ts`): this file's own read-merge-write
    // has no unique index shielding it the way a single-row upsert would —
    // two concurrent first patches for the same profile both read "no
    // existing row" and race the `onboarding_interview_drafts_profile_uq`
    // insert, and even once a row exists, two concurrent patches merge
    // against their OWN snapshot of `existingAnswers`, so the second commit
    // silently drops whichever fields only the first patch touched (a lost
    // update — the exact class of gap this project's mutation-planting
    // convention exists to catch, found here on a fresh read of this file
    // rather than by its own author). Serialising here also closes the
    // sharper case: without this lock, a save landing in the WINDOW between
    // `submitInterview`'s own locked read and its final `submittedAt` write
    // is invisible to that lock (different call, same key, but nothing
    // contends a key nobody else is holding) — this transaction now takes
    // the identical key, so the two calls genuinely serialise against each
    // other, and a save can never land between "submit read the draft" and
    // "submit marked it submitted" leaving an answer that looks saved but
    // was never turned into `creator_authored` evidence (R1/REQ-B02).
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${ids.workspaceId}:${ids.profileId}`}, 0))`
    );
    const existing = await readDraftRow(tx, ids.profileId, ids.workspaceId);
    if (existing?.submittedAt) throw new InterviewDraftSubmittedError();
    const existingAnswers = existing ? parseAnswers(existing.answers) : {};
    const merged = { ...existingAnswers, ...parsedPatch };
    if (existing) {
      const [row] = await tx
        .update(onboardingInterviewDrafts)
        .set({ answers: merged })
        .where(eq(onboardingInterviewDrafts.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await tx
      .insert(onboardingInterviewDrafts)
      .values({ ...ids, answers: merged })
      .returning();
    return row;
  });
}

/**
 * Read back the creator's current interview draft, for resume (R11).
 *
 * NO ROLE GATE — a viewer may read, the same as every other profile read in
 * this package (`readVoiceBrain`'s own precedent). Returns `undefined` (via
 * `null`) rather than throwing when nothing has been saved yet; that is not
 * an error, it is "the interview has not been started".
 */
export async function getInterviewDraft(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<OnboardingInterviewDraft | null> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  const row = await readDraftRow(
    db,
    profileScope.profileId as string,
    profileScope.workspaceId as string
  );
  return row ?? null;
}

export type SubmitInterviewResult = {
  draft: OnboardingInterviewDraft;
  strategyDoc: BrainDoc | null;
  killtestDoc: BrainDoc | null;
};

const STRATEGY_REASON: BrainDocReason = { code: "onboarding_inference" };
const KILLTEST_REASON: BrainDocReason = { code: "onboarding_inference" };

/**
 * Turn a decided label into a legible (but NEVER load-bearing) slug.
 *
 * `metric.key` is `serverOwned` in `brain-content.ts`, which means
 * `parseBrainContent` STRIPS whatever this writes before it is ever stored —
 * see that file's own header. This function exists only so a reader of the
 * PRE-STRIP payload (a test, a log line) sees something legible rather than
 * a constant; no code anywhere reads the stored value back.
 */
function slugifyForKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "metric";
}

/** One decided answer's stored, cited rows — collected before content is built. */
type RowsByField = Map<InterviewFieldKey, OnboardingInput[]>;

/**
 * Build both documents' content and evidence from the decided answers and
 * the `creator_authored` rows just written for them.
 *
 * A DIRECT, DETERMINISTIC MAPPING — no vendor call anywhere near this
 * function. Every claim cites the EXACT row `submitInterview` inserted for
 * it (matching `WriteBrainDocParams`'s `sourceEvidence` shape verbatim), and
 * every undecided position is `CHECK` (or, for a declinable field, omitted
 * entirely) — never invented (R1, R4, REQ-I03).
 */
function buildDocContents(
  answers: InterviewAnswers,
  rowsByField: RowsByField
): {
  strategy: { content: Record<string, unknown>; evidence: SourceEvidenceEntry[] };
  killtest: { content: Record<string, unknown>; evidence: SourceEvidenceEntry[] };
} {
  const evidenceByTarget: Record<"strategy" | "killtest", SourceEvidenceEntry[]> = {
    strategy: [],
    killtest: [],
  };

  // A LIVE BROWSER WALK RAISED, AND REJECTED, A TEMPTING "FIX" HERE — worth
  // recording so it is not tried again. `bannedWords: {status: "decided",
  // values: []}` alone (R1's third state) produces zero evidence, and a
  // first instinct is that gating document creation on `evidence.length > 0`
  // wrongly conflates "nothing to cite" with "nothing decided". It does not:
  // `writeBrainDoc` (`with-workspace.ts`) has its OWN, deeper REQ-B02 refusal
  // for "a version in which nothing at all is cited" — a document whose every
  // position is an empty array or `[CHECK]` provides no grounding a creator
  // could confirm, and the schema-level guard against it is deliberate, not
  // a gap. Replacing this gate with "was any field touched" was tried and
  // makes things WORSE, not better: it stops skipping the vacuous write and
  // instead ATTEMPTS it, so `writeBrainDoc`'s refusal throws from inside this
  // function's own transaction and takes the WHOLE submission down with it —
  // the strategy document and the "submitted" mark included — even though
  // strategy may have real, citable answers of its own. `evidence.length > 0`
  // is correct: it is what keeps a fully-vacuous target's answers from ever
  // reaching `writeBrainDoc` at all, silently leaving that document `null`
  // exactly the way "nothing decided" already does, with zero risk to the
  // rest of the transaction.

  const scalarValue = (key: InterviewFieldKey): string | undefined => {
    const field = fieldFor(key);
    const answer = answers[key] as TextAnswer | DirectionAnswer | undefined;
    if (!answer || answer.status !== "decided") {
      return field.declinable ? undefined : CHECK;
    }
    const row = rowsByField.get(key)?.[0];
    if (!row) {
      // UNREACHABLE ON THE SANCTIONED PATH: `rowsByField` is built from these
      // SAME `answers` in the same pass, immediately before this function
      // runs — a decided scalar always has exactly one row by construction.
      // Refuses rather than silently rendering `CHECK` for a claim that was
      // actually decided, which would be the fail-open version of this gap.
      throw new Error(
        `interview-ops: '${key}' is decided but no stored row was found for it`
      );
    }
    evidenceByTarget[field.target].push({
      field: field.pointer,
      quote: row.content,
      inputId: row.id,
      startUtf16: 0,
      endUtf16: row.content.length,
    });
    return row.content;
  };

  const listValue = (key: InterviewFieldKey): string[] => {
    const field = fieldFor(key);
    const answer = answers[key] as ListAnswer | undefined;
    if (!answer || answer.status !== "decided") {
      // NOT DECIDED: one placeholder element, distinct from an explicit
      // empty list — see this file's header.
      return [CHECK];
    }
    const rows = rowsByField.get(key) ?? [];
    return rows.map((row, i) => {
      evidenceByTarget[field.target].push({
        field: `${field.pointer}/${i}`,
        quote: row.content,
        inputId: row.id,
        startUtf16: 0,
        endUtf16: row.content.length,
      });
      return row.content;
    });
  };

  const metric: Record<string, unknown> = {
    key: (() => {
      const labelAnswer = answers.metricLabel;
      return labelAnswer?.status === "decided" ? slugifyForKey(labelAnswer.value) : "unset";
    })(),
    label: scalarValue("metricLabel"),
    unit: scalarValue("metricUnit"),
    direction: scalarValue("metricDirection"),
  };
  const platform = scalarValue("metricPlatform");
  if (platform !== undefined) metric.platform = platform;
  const window = scalarValue("metricWindow");
  if (window !== undefined) metric.window = window;

  const strategyContent: Record<string, unknown> = {
    audience: scalarValue("audience"),
    positioning: scalarValue("positioning"),
    // NOT an interview field this slice — required by the schema, so always
    // present and always empty (zero claims to confirm).
    pillars: [],
    goals: listValue("goals"),
    ambitions: listValue("ambitions"),
    metric,
  };

  const killtestContent: Record<string, unknown> = {
    // NOT an interview field this slice either — see `strategyContent`.
    rules: [],
    bannedWords: listValue("bannedWords"),
    bannedVibes: listValue("bannedVibes"),
  };

  return {
    strategy: { content: strategyContent, evidence: evidenceByTarget.strategy },
    killtest: { content: killtestContent, evidence: evidenceByTarget.killtest },
  };
}

/**
 * Submit the interview: ATOMICALLY turn every decided answer into an
 * immutable `creator_authored` onboarding input, build the `strategy` and
 * `killtest` brain-document content directly from them (no vendor call), and
 * write whichever document(s) actually have something cited.
 *
 * ONE TRANSACTION, LOCKED (R5, R8's own lock convention): the SAME
 * `brain:{workspace}:{profile}` advisory lock `writeBrainDoc` /
 * `confirmBrainDocFields` / `activateBrainDoc` take, taken here FIRST so the
 * "already submitted" check below is not a read-then-write race — a
 * Postgres advisory xact lock is reentrant within one transaction, so
 * `writeBrainDoc`'s own re-acquire of the same key later in this same
 * transaction is a no-op wait.
 *
 * A KIND WITH NOTHING CITED IS NOT WRITTEN. `writeBrainDoc` refuses an
 * all-placeholder version outright (a non-empty `sourceEvidence` CHECK) — a
 * version asserting nothing still consumes a version number in an
 * append-only history, and that rule is not bent here. If the creator
 * decided nothing relevant to `killtest` (say), no `killtest` version is
 * created by this submission; the coherent-activation snapshot's nullable
 * columns exist for exactly this case (an early creator who has not reached
 * every brain kind yet).
 */
export async function submitInterview(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<SubmitInterviewResult> {
  // Minted on the OUTER handle only to resolve/verify the profile and read
  // the role before opening a transaction — never used to write. Every write
  // below re-mints on `tx` (see this file's header) so it shares the
  // transaction's fate.
  const outerScope = await ProfileScope.mint(db, scope, profileId);
  assertMayAnswer(outerScope.role, "submit this creator's interview");

  return db.transaction(async (tx) => {
    const txScope = await ProfileScope.mint(tx, scope, profileId);
    const caps = writeCapabilities(txScope);
    const ids = {
      profileId: txScope.profileId as string,
      workspaceId: txScope.workspaceId as string,
    };
    // THE LOCK, FIRST — before the "already submitted" read, for the same
    // reason `writeBrainDoc`/`confirmBrainDocFields`/`activateBrainDoc` take
    // it as their own first statement: a plain SELECT-then-write is a race
    // two concurrent submissions can both pass.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`brain:${ids.workspaceId}:${ids.profileId}`}, 0))`
    );

    const existing = await readDraftRow(tx, ids.profileId, ids.workspaceId);
    if (existing?.submittedAt) throw new InterviewDraftSubmittedError();
    // NO DRAFT AT ALL is treated as "everything not decided" — a creator who
    // never called `saveInterviewDraft` may still submit, and every field
    // renders as undecided (R1's own representation for that state).
    const answers = existing ? parseAnswers(existing.answers) : {};

    // ---- (a) one creator_authored onboarding_inputs row per decided item.
    const rowsByField: RowsByField = new Map();
    for (const field of INTERVIEW_FIELDS) {
      const answer = answers[field.key];
      if (!answer || answer.status !== "decided") continue;
      const values =
        field.kind === "list"
          ? (answer as ListAnswer & { status: "decided" }).values
          : [(answer as TextAnswer & { status: "decided" }).value];
      const rows: OnboardingInput[] = [];
      for (const value of values) {
        // SEQUENTIAL, deliberately — this composes into ONE transaction on
        // one connection; a `Promise.all` here would issue overlapping
        // statements against the same `tx` handle.
        rows.push(
          await caps.appendOnboardingInput({
            inputClass: "creator_authored",
            content: value,
            fieldKey: field.key,
          })
        );
      }
      rowsByField.set(field.key, rows);
    }

    // ---- (b) build both documents' content + evidence, deterministically.
    const { strategy, killtest } = buildDocContents(answers, rowsByField);

    // ---- (c) write whichever document(s) actually cite something — see
    // `buildDocContents`'s header for why "cites something" (not "was any
    // field touched") is the deliberately correct gate here.
    let strategyDoc: BrainDoc | null = null;
    if (strategy.evidence.length > 0) {
      strategyDoc = await caps.writeBrainDoc(
        { kind: "strategy", content: strategy.content, sourceEvidence: strategy.evidence, reason: STRATEGY_REASON },
        tx
      );
    }
    let killtestDoc: BrainDoc | null = null;
    if (killtest.evidence.length > 0) {
      killtestDoc = await caps.writeBrainDoc(
        { kind: "killtest", content: killtest.content, sourceEvidence: killtest.evidence, reason: KILLTEST_REASON },
        tx
      );
    }

    // ---- (d) mark the draft submitted — creating it if it never existed.
    const now = new Date();
    let draftRow: OnboardingInterviewDraft | undefined;
    if (existing) {
      const [row] = await tx
        .update(onboardingInterviewDrafts)
        .set({ submittedAt: now })
        .where(
          and(
            eq(onboardingInterviewDrafts.id, existing.id),
            // BELT AND BRACES: the lock above already serialises this, but the
            // predicate is what makes a violated invariant a REFUSAL rather
            // than a silent double-submit if that ever stops being true.
            isNull(onboardingInterviewDrafts.submittedAt)
          )
        )
        .returning();
      if (!row) throw new InterviewDraftSubmittedError();
      draftRow = row;
    } else {
      const [row] = await tx
        .insert(onboardingInterviewDrafts)
        .values({ ...ids, answers, submittedAt: now })
        .returning();
      draftRow = row;
    }

    return { draft: draftRow, strategyDoc, killtestDoc };
  });
}

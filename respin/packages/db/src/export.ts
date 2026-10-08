import type { DbLike, TxLike } from "./db-like";
import { sql } from "drizzle-orm";
import type { BrainDoc, BrainDocStatus, BrainKind } from "./brain-schema";
import type { OnboardingInput } from "./onboarding-schema";
import {
  CREATOR_DATA_REGISTRY,
  type CreatorDataEntry,
} from "./creator-data-registry";
import { CHECK } from "./brain-content";
import { classifyBrainReason, type BrainDocReasonCode } from "./brain-reason";
import { ExportBusyError } from "./errors";
import {
  EVIDENCE_UNVERIFIED_ANNOTATION,
  claimsForHistory,
  type BrainClaimView,
} from "./brain-ops";
import {
  mintReadableProfileScope,
  PROFILE_EXPORT_TABLES,
  type ProfileExportTable,
  type ProfileScope,
  type ReadGradeProfileScope,
  type ReadGradeWorkspaceScope,
  type SourceEvidenceEntry,
  type WorkspaceScope,
} from "./with-workspace";
import type { RunSlots } from "./run-slot";

export const EXPORT_EVIDENCE_UNVERIFIED = EVIDENCE_UNVERIFIED_ANNOTATION;
export const NO_RULES_RECORDED = "no rules recorded";

/**
 * WHY THE ABSENCE SENTENCES LIVE HERE, in `@respin/db`, and not on the screen
 * that shows them (tenancy/compliance/learning gates, all three, 2026-08-31).
 *
 * `app/(product)/brain/copy.ts` owned two of these and this file owned a
 * third copy of one of them, so the export projection printed the VOICE
 * sentence — "we could not point to a quote from your posts" — for every
 * document kind. For `strategy`/`killtest` nobody searched anything: the
 * creator was asked in the interview and left the field undecided. Saying "we
 * could not find it" about a question nobody answered misattributes a
 * deliberate choice, in the artefact of record, which is REQ-I03.
 *
 * `packages/db` cannot import from `app/**` (that is the layout rule), so the
 * only way for the screen and the file to say the same thing is for the
 * sentences to live down here and the screen to re-export them.
 *
 * THE STEM/CALL-TO-ACTION SPLIT IS STRUCTURAL, not cosmetic. The screen's
 * sentence ends in a control the reader can actually operate ("Confirm it as
 * still unknown"); a downloaded file has no such control, so the projection
 * emits the stem alone. Composing the screen sentence FROM the stem is what
 * stops the two drifting into different claims about the same absence — which
 * is why one `AbsenceCopy` record holds both halves and both readers select
 * from the SAME table (`exportAbsenceSentence` / `screenAbsenceSentence`).
 *
 * AND THE SELECTION IS TWO-DIMENSIONAL, (kind, reason), not one (compliance
 * gate CHANGE, round 2). Kind alone was round 1's defect one population
 * narrower: see `ABSENCE_CREATOR_EDIT`'s own docblock below.
 */
type AbsenceCopy = {
  /** What the downloaded file prints — a claim, with no control attached. */
  stem: string;
  /** What the screen adds — a control the reader can actually operate. */
  action: string;
};

const ABSENCE_VOICE_SEARCHED: AbsenceCopy = {
  stem: "We could not point to a quote from your posts for this one, so we are not stating it.",
  action: "Confirm it as still unknown.",
};
const ABSENCE_INTERVIEW_UNDECIDED: AbsenceCopy = {
  stem: "You left this undecided in the interview, so we are not stating it.",
  action:
    "Confirm it as still undecided, or answer it in the interview and build a new version.",
};
/**
 * The creator set this position to `[check]` THEMSELVES, in an edit.
 *
 * WHY THIS EXISTS (compliance gate CHANGE, slice 5 round 2). Selecting on kind
 * alone made every VOICE absence "we could not point to a quote from your
 * posts" — true of an INFERRED version and FALSE of an edited one. Slice 5's
 * edit form accepts `[check]` for a field and drops its evidence
 * (`brain-edit.test.ts`, "allows [check] for one field, drops its warrant"),
 * so the artefact of record attributed the creator's own deliberate decision
 * to a failed search of ours. That is round 1's REQ-I03 defect one population
 * wider: the absence sentence is selected by (kind, reason), never by kind.
 */
const ABSENCE_CREATOR_EDIT: AbsenceCopy = {
  stem: "You left this unstated when you edited this version, so we are not stating it.",
  action: "Confirm it as still unstated, or edit it again to state it.",
};
/**
 * The sentence that claims NOTHING about whose absence this is.
 *
 * Used wherever none of the three above is known to be true: a Performance
 * Meta record whose promoted source left a position `[check]`, the
 * `correction` reason code (which has no write path yet, so there is no fact
 * about who left the field unstated), and a stored reason this build cannot
 * classify at all. Borrowing one of the other three there would be inventing
 * the reason for an absence, which is the whole defect.
 */
const ABSENCE_UNSTATED: AbsenceCopy = {
  stem: "This position is recorded as not stated.",
  action: "Confirm it as still unstated.",
};

/** What `/brain` says for an ungrounded, INFERRED voice claim (R10). */
export const PLACEHOLDER_ABSENCE = `${ABSENCE_VOICE_SEARCHED.stem} ${ABSENCE_VOICE_SEARCHED.action}`;
/**
 * What `/brain` says for an UNDECIDED interview field — the
 * `strategy`/`killtest` sibling of `PLACEHOLDER_ABSENCE`, byte-identical to
 * the sentence `copy.ts` shipped, moved here so both readers share one source.
 */
export const INTERVIEW_PLACEHOLDER_ABSENCE = `${ABSENCE_INTERVIEW_UNDECIDED.stem} ${ABSENCE_INTERVIEW_UNDECIDED.action}`;

/**
 * The absence copy for one document kind, when the version's REASON does not
 * decide it.
 *
 * A `Record<BrainKind, ...>` rather than a lookup with a fallback: a fifth
 * brain kind must be answered here by its author, at compile time, instead of
 * silently inheriting whichever sentence happened to be the default. That is
 * the 2026-08-29 population lesson written as a type.
 */
const ABSENCE_BY_KIND: Record<BrainKind, AbsenceCopy> = {
  voice: ABSENCE_VOICE_SEARCHED,
  strategy: ABSENCE_INTERVIEW_UNDECIDED,
  killtest: ABSENCE_INTERVIEW_UNDECIDED,
  performance_meta: ABSENCE_UNSTATED,
};

/**
 * The absence copy one REASON CODE decides on its own, or `null` for "the kind
 * decides".
 *
 * A `Record<BrainDocReasonCode, ...>` for the same reason the kind map is one:
 * a fourth reason code is a COMPILE error here, answered by its author, rather
 * than inheriting the kind's sentence silently. `null` is an ANSWER — "this
 * code says nothing about whose absence it is, so the kind still decides" —
 * and it is written out per code rather than achieved by omission.
 */
const ABSENCE_BY_REASON: Record<BrainDocReasonCode, AbsenceCopy | null> = {
  // An inferred version's absence IS ours (voice: we searched the posts) or
  // the creator's own interview answer (strategy/killtest). The kind decides.
  onboarding_inference: null,
  creator_edit: ABSENCE_CREATOR_EDIT,
  // No write path emits this code today, so there is no fact about who left
  // the position unstated. Claim nothing rather than guess.
  correction: ABSENCE_UNSTATED,
  brain_promotion: ABSENCE_UNSTATED,
};

/** The copy for one absence, selected by BOTH dimensions (kind, stored reason). */
function absenceCopy(kind: BrainKind, storedReason: string): AbsenceCopy {
  const code = classifyBrainReason(storedReason);
  // An unclassifiable stored reason means we cannot say WHY this version
  // exists, so we must not say why the field is absent either.
  if (code === null) return ABSENCE_UNSTATED;
  return ABSENCE_BY_REASON[code] ?? ABSENCE_BY_KIND[kind];
}

/** The projection's absence sentence — no call to action a file cannot offer. */
export function exportAbsenceSentence(
  kind: BrainKind,
  storedReason: string
): string {
  return absenceCopy(kind, storedReason).stem;
}

/**
 * `/brain`'s absence sentence: the same stem, plus the control the reader can
 * operate. ONE selection, two audiences — composing the screen sentence from
 * the projection's stem is what stops the two drifting into different claims
 * about the same absence.
 */
export function screenAbsenceSentence(
  kind: BrainKind,
  storedReason: string
): string {
  const copy = absenceCopy(kind, storedReason);
  return `${copy.stem} ${copy.action}`;
}

/** Total lifetime of an app-facing export, including a client that never pulls. */
export const EXPORT_STREAM_DEADLINE_MS = 120_000;
/** A blocked database statement gets its own tighter ceiling inside that lifetime. */
export const EXPORT_DB_STATEMENT_TIMEOUT_MS = 15_000;

/**
 * The registry table name -> the TYPED table the scoped reader understands.
 *
 * Derived from `PROFILE_EXPORT_TABLES`, so there is no third hand-maintained
 * list and no `as ProfileExportTable` cast anywhere in this file. The keys
 * widen to `string` (an upcast) so an arbitrary registry name can be looked
 * up; the values stay `ProfileExportTable`, which is what the reader needs.
 */
const EXPORT_READER_TABLES: ReadonlyMap<string, ProfileExportTable> = new Map(
  PROFILE_EXPORT_TABLES.map((table): [string, ProfileExportTable] => [table, table])
);

export class ExportClassificationError extends Error {
  constructor(table: string) {
    super(`creator-data table '${table}' is export-included but has no scoped export reader`);
    this.name = "ExportClassificationError";
  }
}

/**
 * The registry-included tables, in REGISTRY ORDER, as typed reader tables.
 *
 * This is the export's whole table population and the only place it is
 * decided (R11). `openBrainExport` calls it BEFORE the caller commits HTTP 200
 * headers and hands the result down to the streamer, so a table that is
 * `included: true` with no scoped reader is a pre-header refusal rather than a
 * body that aborts halfway through a download.
 */
export function exportPlan(
  registry: readonly CreatorDataEntry[] = CREATOR_DATA_REGISTRY
): ProfileExportTable[] {
  const plan: ProfileExportTable[] = [];
  for (const entry of registry) {
    if (!entry.export.included) continue;
    const table = EXPORT_READER_TABLES.get(entry.table);
    if (table === undefined) throw new ExportClassificationError(entry.table);
    plan.push(table);
  }
  return plan;
}

/**
 * THE HUMAN NAMES FOR CLAIM POSITIONS, kind by kind — moved down from
 * `app/(product)/brain/copy.ts` so the screen and the downloaded file use ONE
 * set (F5, tenancy gate round 1).
 *
 * The markdown export used to print RFC-6901 pointers as its headings
 * (`### /metric/direction`) and enum tokens as its values
 * (`higher_is_better`), in a file whose own header calls itself
 * human-readable. `copy.ts` already had the rule in writing — rendering a raw
 * pointer to a creator "is not a degradation, it is a leak of an internal name
 * onto a screen making claims about them" — and the export was the one reader
 * that could not reach it, because `packages/db` cannot import from `app/**`.
 *
 * The words describe WHAT THE FIELD IS ABOUT, not what the model concluded.
 * Copied verbatim; `tests/brain-ui.test.tsx` pins the key sets against the
 * content schemas, so widening a schema without widening these is still red.
 */
export const VOICE_FIELD_LABELS: Record<string, string> = {
  register: "How formal you are, and who you sound like you are talking to",
  sentenceRhythm: "How your sentences are paced",
  signatureMoves: "Things you do that another writer would not",
  avoid: "Things you visibly never do",
};

export const STRATEGY_FIELD_LABELS: Record<string, string> = {
  audience: "Who you're making this for",
  positioning: "How you position yourself, compared to alternatives",
  pillars: "Your content pillars",
  goals: "Your goals with this content",
  ambitions: "Where you want this to go",
};

export const STRATEGY_METRIC_FIELD_LABELS: Record<string, string> = {
  label: "What you're calling this metric",
  unit: "Unit",
  direction: "Which direction is better",
  platform: "Platform (if you named one)",
  window: "Measurement window (if you named one)",
};

export const KILLTEST_FIELD_LABELS: Record<string, string> = {
  rules: "Your kill rules",
  bannedWords: "Words you never want used",
  bannedVibes: "Vibes or tones you never want",
};

/** C5's stored Performance Meta fields, named without exposing JSON pointers. */
export const PERFORMANCE_META_FIELD_LABELS: Record<string, string> = {
  metricLabel: "Creator-authored metric label",
  metricKey: "Metric key",
  metricUnit: "Metric unit",
  metricDirection: "Metric direction",
  lever: "Lever",
  platform: "Platform",
  audienceClass: "Audience class",
  observedFrom: "Observation start",
  observedTo: "Observation end",
  treatmentN: "Treatment count",
  baselineN: "Baseline count",
  treatmentMedianPer1k: "Treatment median per 1,000",
  baselineMedianPer1k: "Baseline median per 1,000",
  effectPer1k: "Signed effect per 1,000",
  pastOutcome: "Past outcome",
  evidenceStrength: "Evidence strength",
  selfReportedN: "Quantified self-reported evidence count",
  connectorVerifiedN: "Connector-verified evidence count",
  confounders: "Structured confounders",
};

/** Readable labels for `METRIC_DIRECTIONS`' two closed values. */
export const METRIC_DIRECTION_LABELS: Record<string, string> = {
  higher_is_better: "Higher is better",
  lower_is_better: "Lower is better",
};

/** The document kinds as a creator would name them. `killtest` is not a word. */
export const BRAIN_KIND_LABELS: Record<BrainKind, string> = {
  voice: "Voice",
  strategy: "Strategy",
  killtest: "Kill Test",
  performance_meta: "Performance notes",
};

/** What each stored status MEANS, rather than the token it is stored as. */
export const BRAIN_STATUS_LABELS: Record<BrainDocStatus, string> = {
  proposed: "proposed — waiting for you to confirm it",
  active: "in force",
  superseded: "replaced by a later version",
};

/** `/register` -> the field's name; `/signatureMoves/0` -> its name plus a 1-BASED position. */
function indexedLabel(
  labels: Record<string, string>,
  parts: readonly string[]
): string | null {
  const key = parts[0];
  if (key === undefined) return null;
  const base = labels[key];
  if (base === undefined) return null;
  if (parts.length === 1) return base;
  const index = Number(parts[1]);
  if (!Number.isInteger(index) || index < 0) return null;
  return `${base} (${index + 1})`;
}

export function claimLabel(pointer: string): string | null {
  return indexedLabel(VOICE_FIELD_LABELS, pointer.split("/").filter((p) => p.length > 0));
}

/**
 * Same rule as `claimLabel`, plus the `/metric/<subfield>` branch R7 needs.
 * `/metric` itself, and anything deeper than two segments under it, return
 * null: the schema has no claim position at `/metric` (it is a container) and
 * no metric sub-field is a list.
 */
export function strategyClaimLabel(pointer: string): string | null {
  const parts = pointer.split("/").filter((p) => p.length > 0);
  if (parts[0] === "metric") {
    if (parts.length !== 2) return null;
    return STRATEGY_METRIC_FIELD_LABELS[parts[1]] ?? null;
  }
  return indexedLabel(STRATEGY_FIELD_LABELS, parts);
}

export function killtestClaimLabel(pointer: string): string | null {
  return indexedLabel(KILLTEST_FIELD_LABELS, pointer.split("/").filter((p) => p.length > 0));
}

export function performanceMetaClaimLabel(pointer: string): string | null {
  const match = /^\/rules\/\d+\/([^/]+)(?:\/\d+)?$/.exec(pointer);
  if (!match) return null;
  return PERFORMANCE_META_FIELD_LABELS[match[1]] ?? null;
}

/** True for a claim position that belongs in the metric panel, not the general list (R7). */
export function isMetricPointer(pointer: string): boolean {
  return pointer.startsWith("/metric/");
}

const CLAIM_LABELLERS: Record<BrainKind, (pointer: string) => string | null> = {
  voice: claimLabel,
  strategy: strategyClaimLabel,
  killtest: killtestClaimLabel,
  performance_meta: performanceMetaClaimLabel,
};

/** The human name for one claim position of one kind, or null if we have none. */
export function claimLabelForKind(kind: BrainKind, pointer: string): string | null {
  return CLAIM_LABELLERS[kind](pointer);
}

/**
 * The export's heading for one claim position.
 *
 * The screen REFUSES an unlabelled pointer (`brain-view.tsx`); the export may
 * not, because R9 says the export never throws — a data-subject right that
 * fails closed on one unknown field is the control becoming the outage. So the
 * fallback names the position as one we cannot name, and keeps the pointer
 * inside that framing rather than presenting an internal name as if it were a
 * heading a person wrote.
 */
export function exportClaimHeading(kind: BrainKind, pointer: string): string {
  return (
    claimLabelForKind(kind, pointer) ??
    `An entry we do not have a name for (${pointer})`
  );
}

/**
 * The export's rendering of one claim VALUE.
 *
 * Stored claim values are the creator's own words everywhere except the
 * declared metric's `direction`, which is a closed enum the interview picked
 * from a labelled dropdown. `higher_is_better` is a wire value, not a
 * sentence, and the creator never typed it.
 */
export function exportClaimValue(pointer: string, value: string): string {
  if (pointer !== "/metric/direction") return value;
  return METRIC_DIRECTION_LABELS[value] ?? value;
}

/**
 * The sentence introducing a claim's quote, keyed by WHICH KIND of input row
 * it came from (F4) — `own_post` reads differently from `creator_authored`,
 * and one sentence pretending to fit both would misdescribe one of them.
 *
 * Without it a creator's own typed declaration renders in the export as an
 * unattributed blockquote formally identical to a quote lifted from a saved
 * post, while R5/R6's whole warrant is "you told us so, on this date".
 *
 * Takes the already-formatted day string rather than a `Date`, so this stays a
 * pure string function with no `Intl`/timezone decision of its own.
 */
export function quoteIntro(inputClass: string, dayStr: string): string {
  return inputClass === "creator_authored"
    ? `Your own answer, from ${dayStr}:`
    : `From a post you saved on ${dayStr}:`;
}

/**
 * WHAT THE MARKDOWN FILE IS, AND WHAT IT IS NOT — said IN THE FILE (N1).
 *
 * `/brain` already tells the reader this ("Markdown is a human-readable
 * projection for reading, not a round-trip format", `brain/copy.ts`), but the
 * screen is not what a creator opens six months later: the FILE is. A markdown
 * export that looks re-importable is a data-loss bug waiting for its first
 * user — someone edits it, tries to bring it back, and finds there is no path.
 * Nothing in this product reads this format, and the header now says so.
 */
export const EXPORT_MARKDOWN_NOT_IMPORTABLE =
  "It cannot be read back in: nothing in Respin imports this file, so edits made here go nowhere.";

/**
 * WHAT THE MARKDOWN FILE COVERS — said in the file, because the header already
 * says what the JSON covers and said nothing about this (tenancy gate round 2,
 * 2026-09-01).
 *
 * `streamMarkdownExport` pages `brain_docs` and resolves the posts its evidence
 * cites; it walks NOTHING else. That was the whole export once. It is not now:
 * `generations` joined the registry in slice 6, is `holdsCreatorContent: true`,
 * and is exported in JSON — so a creator who opens the human-readable file
 * finds their brain and no trace of what it produced, under a header whose only
 * scope sentence was about the OTHER file. "JSON is complete" is not the same
 * statement as "and this one is not", and only the first was being made.
 *
 * THE CHOICE TAKEN IS THE SENTENCE, NOT THE PROJECTION, and it is a judgement
 * rather than a shortcut: rendering generations as markdown is a new artefact
 * with its own decisions (which sections, how a refusal reads, what a kill-test
 * verdict looks like on a page) and every one of them is a place to state
 * something the record does not support. A scope sentence that is TRUE today
 * costs one line and misleads nobody; a projection built in a fix pass is the
 * kind of surface that gets its honesty reviewed afterwards. `export.test.ts`
 * pins the sentence AND the table list the streamer actually walks, so the day
 * the projection grows, the sentence goes red rather than stale.
 */
export const EXPORT_MARKDOWN_SCOPE =
  "It covers your brain documents and the quotes behind them. Everything else in your export — including your generation history — is in the JSON file only.";

/** The one date rendering in this file: UTC calendar day, like `/brain`'s `day()`. */
function exportDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

export type BrainExportAnnotation = {
  brainDocId: string;
  pointer: string;
  message: typeof EXPORT_EVIDENCE_UNVERIFIED;
};

type ReplacementMetadata = Pick<
  BrainDoc,
  "kind" | "version" | "createdAt" | "activatedAt"
>;

function evidenceAnnotations(
  docs: readonly BrainDoc[],
  inputs: readonly OnboardingInput[]
): BrainExportAnnotation[] {
  const inputById = new Map(inputs.map((input) => [input.id, input]));
  const annotations: BrainExportAnnotation[] = [];
  for (const doc of docs) {
    const entries = Array.isArray(doc.sourceEvidence) ? doc.sourceEvidence : [];
    for (const raw of entries) {
      const entry =
        typeof raw === "object" && raw !== null
          ? (raw as Partial<SourceEvidenceEntry>)
          : {};
      const pointer = typeof entry.field === "string" ? entry.field : "(unknown claim)";
      const input = typeof entry.inputId === "string" ? inputById.get(entry.inputId) : undefined;
      const valid =
        input !== undefined &&
        typeof entry.quote === "string" &&
        typeof entry.startUtf16 === "number" &&
        Number.isInteger(entry.startUtf16) &&
        typeof entry.endUtf16 === "number" &&
        Number.isInteger(entry.endUtf16) &&
        entry.startUtf16 >= 0 &&
        entry.endUtf16 >= entry.startUtf16 &&
        entry.endUtf16 <= input.content.length &&
        input.content.slice(entry.startUtf16, entry.endUtf16) === entry.quote;
      if (!valid) {
        annotations.push({
          brainDocId: doc.id,
          pointer,
          message: EXPORT_EVIDENCE_UNVERIFIED,
        });
      }
    }
  }
  return annotations;
}

function emptyArrayPointers(value: unknown, pointer = ""): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [pointer || "/"];
    return value.flatMap((item, index) => emptyArrayPointers(item, `${pointer}/${index}`));
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    emptyArrayPointers(
      child,
      `${pointer}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`
    )
  );
}

export type BrainExportFormat = "json" | "markdown";

/**
 * THE registry-driven REQ-A04 export — one implementation, the one the
 * `/api/export` route reaches (tenancy gate round 1, 2026-08-31).
 *
 * There used to be a second, materialised exporter here (`exportBrain`,
 * `exportBrainFile`, `withPreparedExport`, `markdownFor`) with no `app/**`
 * caller at all, and R11's registry refusal, R12's pause exemption, R13's
 * same-workspace sibling case and R15's private-only `frameworks` rule were
 * every one of them asserted against it. The reviewer proved the consequence
 * by planting: M1 in the streaming JSON path stayed GREEN and M7 in
 * `exportPage` SURVIVED, because the witnesses were driving the other
 * implementation. "A capability nothing can reach is not done, it is
 * inventory" — so it is gone, and every witness now drives this function.
 *
 * Complete bounded-memory stream. App delivery consumes this iterable
 * directly; cancelling iteration cancels the producer transaction, releasing
 * both the workspace transaction lock and the optional global session slot.
 *
 * NO PAUSE CHECK, deliberately (R12, PRD §4G's 2026-08-21 amendment): reading
 * a creator's own data stays available while writes are paused.
 */
export async function openBrainExport(
  db: DbLike,
  // EITHER GRADE (R-163, P5-R3): during a workspace deletion's grace the only
  // scope its owner holds is the read grade, and "export at any time" must
  // hold exactly then. The pause exemption above is the same argument.
  scope: WorkspaceScope | ReadGradeWorkspaceScope,
  profileId: string,
  format: BrainExportFormat,
  runSlots?: RunSlots,
  generatedAt = new Date(),
  deadlineMs = EXPORT_STREAM_DEADLINE_MS
): Promise<AsyncIterable<string>> {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1) {
    throw new Error("Creator export deadline must be a positive integer.");
  }
  // THE TABLE POPULATION IS DECIDED HERE, before a byte can be emitted, and
  // the typed result is what the streamer iterates. A registry table with no
  // scoped reader is therefore an `ExportClassificationError` the route can
  // still turn into a refusal — not a body that dies mid-download. Passing
  // `plan` down rather than recomputing it is what makes this call
  // load-bearing: delete it and the streamer has no tables to walk.
  const plan = exportPlan();
  // Preflight the profile before the caller commits HTTP 200 headers. A
  // foreign profile must remain a typed 404-capable refusal, never a
  // successful response whose body aborts on first pull.
  // Fence 6: a read-grade workspace scope mints a read-grade profile scope,
  // whose `exportPage`/`onboardingInputsByIds` run through fence 5's read
  // sibling. A write scope is unchanged.
  const profileScope = await mintReadableProfileScope(db, scope, profileId);
  if (!runSlots) {
    return lazyExportIterable(
      () => createPagedExportStream(
        db,
        profileScope,
        profileId,
        format,
        plan,
        generatedAt,
        deadlineMs
      ),
      undefined,
      deadlineMs
    );
  }
  const outcome = await runSlots.acquire(scope.workspaceId, 1, "export");
  if (!outcome.granted) throw new ExportBusyError();
  return lazyExportIterable(
    () =>
      createPagedExportStream(
        db,
        profileScope,
        profileId,
        format,
        plan,
        generatedAt,
        deadlineMs
      ),
    () => outcome.lease.release(),
    deadlineMs
  );
}

/**
 * What the export reads through: either grade's profile scope (R-163). The
 * union of the two CLASSES, not a structural `{ accessors }` shape: a shape
 * would take these helpers out of AC-13's scope-taking surface
 * (`tests/profile-cage.test.ts`), and a forged object would satisfy it.
 */
type ExportProfileScope = ProfileScope | ReadGradeProfileScope;

function createPagedExportStream(
  db: DbLike,
  profileScope: ExportProfileScope,
  profileId: string,
  format: BrainExportFormat,
  plan: readonly ProfileExportTable[],
  generatedAt: Date,
  deadlineMs: number
): AsyncIterable<string> {
  const channel = new TransformStream<string, string>(
    undefined,
    { highWaterMark: 1 },
    { highWaterMark: 1 }
  );
  const writer = channel.writable.getWriter();
  const producer = db.transaction(async (tx) => {
    // The JS deadline cancels backpressure. These server-side settings close
    // the other two ways a transaction can otherwise outlive it: a blocked
    // statement and an idle transaction whose client disappeared mid-stream.
    const statementTimeoutMs = Math.min(
      deadlineMs,
      EXPORT_DB_STATEMENT_TIMEOUT_MS
    );
    await tx.execute(sql`SELECT
      set_config('statement_timeout', ${String(statementTimeoutMs)}, true),
      set_config('idle_in_transaction_session_timeout', ${String(deadlineMs)}, true)`);
    const emit = (chunk: string) => writer.write(chunk);
    if (format === "json") {
      await streamJsonExport(tx, profileScope, profileId, plan, generatedAt, emit);
    } else {
      await streamMarkdownExport(tx, profileScope, generatedAt, emit);
    }
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  void producer.then(
    () => writer.close(),
    (error) => writer.abort(error)
  ).catch(() => undefined);
  return readableExportIterable(channel.readable, producer);
}

function readableExportIterable(
  readable: ReadableStream<string>,
  producer: Promise<unknown>
): AsyncIterable<string> {
  let claimed = false;
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      if (claimed) throw new Error("A creator export stream can be consumed only once.");
      claimed = true;
      const reader = readable.getReader();
      let released = false;
      const releaseReader = () => {
        if (released) return;
        released = true;
        reader.releaseLock();
      };
      return {
        async next() {
          const result = await reader.read();
          if (result.done) releaseReader();
          return result;
        },
        async return() {
          try {
            await reader.cancel();
            return { done: true, value: undefined };
          } finally {
            releaseReader();
            // `reader.cancel()` only signals the TransformStream. The export
            // slot must remain held until Drizzle has observed the rejected
            // writer, rolled back the repeatable-read transaction, and
            // returned its query-pool connection.
            await producer.catch(() => undefined);
          }
        },
      };
    },
  };
}

/**
 * Single-consumer iterable whose producer is created only on first pull.
 * Calling `return()` before the first pull still releases the pre-acquired
 * session lease, which an async-generator `finally` cannot guarantee before
 * its body has started.
 */
function lazyExportIterable(
  createSource: () => AsyncIterable<string>,
  release: () => Promise<void> = async () => undefined,
  deadlineMs = EXPORT_STREAM_DEADLINE_MS
): AsyncIterable<string> {
  let source: AsyncIterator<string> | undefined;
  let claimed = false;
  let releasePromise: Promise<void> | undefined;
  let deadlineError: Error | undefined;
  let deadlineCleanup: Promise<void> | undefined;
  const timer = setTimeout(() => {
    deadlineError = new Error(
      "Creator export stream exceeded its bounded lifetime and was cancelled."
    );
    deadlineCleanup = closeSourceAndRelease();
    void deadlineCleanup.catch(() => undefined);
  }, deadlineMs);
  const releaseOnce = (): Promise<void> => {
    if (releasePromise) return releasePromise;
    if (timer !== undefined) clearTimeout(timer);
    // Assign before invoking the release callback so every concurrent path
    // (next/done, explicit return, and deadline cleanup) awaits the SAME
    // advisory-unlock operation instead of observing a boolean and returning
    // while the unlock is still in flight.
    releasePromise = Promise.resolve().then(release);
    return releasePromise;
  };
  const closeSourceAndRelease = async () => {
    try {
      await source?.return?.();
    } catch {
      // The body has already been abandoned. Cleanup still owns the producer
      // settlement and lease release; the fixed deadline error is what a
      // pending `next()` observes, never a driver/message-shaped exception.
    } finally {
      await releaseOnce();
    }
  };
  return {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      if (claimed) throw new Error("A creator export stream can be consumed only once.");
      claimed = true;
      return {
        async next() {
          if (deadlineError) {
            await deadlineCleanup;
            throw deadlineError;
          }
          try {
            source ??= createSource()[Symbol.asyncIterator]();
            const result = await source.next();
            if (deadlineError) {
              await deadlineCleanup;
              throw deadlineError;
            }
            if (result.done) await releaseOnce();
            return result;
          } catch (error) {
            await releaseOnce();
            throw error;
          }
        },
        async return() {
          try {
            return source?.return
              ? await source.return()
              : { done: true, value: undefined };
          } finally {
            await releaseOnce();
          }
        },
      };
    },
  };
}

async function forEachExportPage(
  profileScope: ExportProfileScope,
  table: ProfileExportTable,
  tx: TxLike,
  visit: (rows: unknown[]) => Promise<void>
): Promise<void> {
  let offset = 0;
  for (;;) {
    const rows = await profileScope.accessors.exportPage(table, offset, tx);
    if (rows.length === 0) return;
    await visit(rows);
    offset += rows.length;
  }
}

function citedInputIds(docs: readonly BrainDoc[]): string[] {
  const ids = new Set<string>();
  for (const doc of docs) {
    const entries = Array.isArray(doc.sourceEvidence) ? doc.sourceEvidence : [];
    for (const raw of entries) {
      if (typeof raw !== "object" || raw === null) continue;
      const inputId = (raw as { inputId?: unknown }).inputId;
      if (typeof inputId === "string") ids.add(inputId);
    }
  }
  return [...ids];
}

async function inputsForDocs(
  profileScope: ExportProfileScope,
  docs: readonly BrainDoc[],
  tx: TxLike
): Promise<OnboardingInput[]> {
  return profileScope.accessors.onboardingInputsByIds(citedInputIds(docs), tx);
}

/** JSON has no bigint primitive; creator exports retain exact integer bytes as strings. */
function exportJson(value: unknown): string {
  const encoded = JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item
  );
  if (encoded === undefined) {
    throw new Error("creator export encountered a value JSON cannot represent");
  }
  return encoded;
}

async function streamJsonExport(
  tx: TxLike,
  profileScope: ExportProfileScope,
  profileId: string,
  plan: readonly ProfileExportTable[],
  generatedAt: Date,
  emit: (chunk: string) => Promise<void>
): Promise<void> {
  const registry = CREATOR_DATA_REGISTRY.map((entry) => ({
    table: entry.table,
    included: entry.export.included,
    reason: entry.export.reason,
  }));
  await emit(
    `{"schemaVersion":"respin.creator-export.v1","generatedAt":${exportJson(generatedAt.toISOString())},"profileId":${exportJson(profileId)},"registry":${exportJson(registry)},"tables":{`
  );
  let firstTable = true;
  // `plan` IS the registry's included set, typed (`exportPlan`), computed
  // before headers. No cast, no second list, and a hard-coded list here would
  // disagree with `registry` above — which is exactly what R11's key-set
  // equality test compares.
  for (const table of plan) {
    await emit(`${firstTable ? "" : ","}${exportJson(table)}:[`);
    firstTable = false;
    let firstRow = true;
    await forEachExportPage(profileScope, table, tx, async (rows) => {
      for (const row of rows) {
        await emit(`${firstRow ? "" : ","}${exportJson(row)}`);
        firstRow = false;
      }
    });
    await emit("]");
  }
  await emit('},"annotations":[');
  let firstAnnotation = true;
  await forEachExportPage(profileScope, "brain_docs", tx, async (rows) => {
    const docs = rows as BrainDoc[];
    const inputs = await inputsForDocs(profileScope, docs, tx);
    for (const annotation of evidenceAnnotations(docs, inputs)) {
      await emit(`${firstAnnotation ? "" : ","}${exportJson(annotation)}`);
      firstAnnotation = false;
    }
  });
  await emit("]}");
}

function replacementFromMetadata(
  doc: BrainDoc,
  versions: readonly ReplacementMetadata[]
): number | null {
  if (!doc.supersededAt) return null;
  const transition = doc.supersededAt.getTime();
  return (
    versions.find(
      (candidate) =>
        candidate.kind === doc.kind &&
        candidate.version > doc.version &&
        (candidate.createdAt.getTime() === transition ||
          candidate.activatedAt?.getTime() === transition)
    )?.version ?? null
  );
}

const PERFORMANCE_RULE_FIELDS = [
  "metricKey",
  "metricUnit",
  "metricDirection",
  "lever",
  "platform",
  "audienceClass",
  "observedFrom",
  "observedTo",
  "treatmentN",
  "baselineN",
  "treatmentMedianPer1k",
  "baselineMedianPer1k",
  "effectPer1k",
  "pastOutcome",
  "selfReportedN",
  "connectorVerifiedN",
  "evidenceStrength",
] as const;

function performanceRuleIndexes(claims: readonly BrainClaimView[]): number[] {
  return [...new Set(
    claims.flatMap((claim) => {
      const match = /^\/rules\/(\d+)\//.exec(claim.pointer);
      return match ? [Number(match[1])] : [];
    })
  )].sort((left, right) => left - right);
}

function performanceClaim(
  claims: readonly BrainClaimView[],
  ruleIndex: number,
  field: string
): BrainClaimView | null {
  return claims.find((claim) => claim.pointer === `/rules/${ruleIndex}/${field}`) ?? null;
}

function performanceClaims(
  claims: readonly BrainClaimView[],
  ruleIndex: number,
  field: string
): BrainClaimView[] {
  const prefix = `/rules/${ruleIndex}/${field}/`;
  return claims
    .filter((claim) => claim.pointer.startsWith(prefix))
    .sort((left, right) => left.pointer.localeCompare(right.pointer));
}

function observedRelation(effect: string | null): string | null {
  if (effect === null || effect.trim() === "") return null;
  const value = Number(effect);
  if (!Number.isFinite(value)) return null;
  if (value > 0) return "This treatment was higher than this baseline in these observations.";
  if (value < 0) return "This treatment was lower than this baseline in these observations.";
  return "This treatment was level with this baseline in these observations.";
}

function appendPerformanceEvidence(
  lines: string[],
  doc: BrainDoc,
  claim: BrainClaimView
): void {
  if (claim.value === CHECK) {
    lines.push(`  ${exportAbsenceSentence(doc.kind, doc.reason)}`);
    return;
  }
  if (claim.source && claim.quote) {
    lines.push(`  ${quoteIntro(claim.source.inputClass, exportDay(claim.source.postedAt))}`);
    lines.push(`  > ${claim.quote}`);
  }
  if (claim.evidenceAnnotation) lines.push(`  > ${claim.evidenceAnnotation}`);
}

/**
 * Performance Meta is a recorded observation, not a generic brain claim list.
 * Keep its C5 envelope readable as one rule and put the non-causal disclosure
 * immediately after every signed comparison.
 */
export function renderPerformanceMetaMarkdown(
  doc: BrainDoc,
  claims: readonly BrainClaimView[]
): string[] {
  const lines: string[] = [];
  const indexes = performanceRuleIndexes(claims);
  if (indexes.length === 0) return [NO_RULES_RECORDED, ""];

  for (const index of indexes) {
    const metricLabel = performanceClaim(claims, index, "metricLabel");
    lines.push(`### Performance record ${index + 1}`, "");
    lines.push(
      `Creator-authored metric label: ${metricLabel?.value ?? "Not recorded"}`,
      ""
    );
    if (metricLabel) appendPerformanceEvidence(lines, doc, metricLabel);

    for (const field of PERFORMANCE_RULE_FIELDS) {
      const claim = performanceClaim(claims, index, field);
      const label = PERFORMANCE_META_FIELD_LABELS[field];
      lines.push(`- ${label}: ${claim?.value ?? "Not recorded"}`);
      if (claim) appendPerformanceEvidence(lines, doc, claim);
    }

    const confounders = performanceClaims(claims, index, "confounders");
    lines.push(
      `- ${PERFORMANCE_META_FIELD_LABELS.confounders}: ${
        confounders.length ? confounders.map((claim) => claim.value).join(", ") : "None recorded"
      }`
    );
    for (const claim of confounders) appendPerformanceEvidence(lines, doc, claim);

    const effect = performanceClaim(claims, index, "effectPer1k")?.value ?? null;
    lines.push("", observedRelation(effect) ?? "A signed comparison direction was not recorded for this rule.");
    lines.push(
      "This describes past observations, does not establish cause, and is not a forecast.",
      ""
    );
  }
  return lines;
}

async function streamMarkdownExport(
  tx: TxLike,
  profileScope: ExportProfileScope,
  generatedAt: Date,
  emit: (chunk: string) => Promise<void>
): Promise<void> {
  await emit(
    `# Creator Brain export\n\n> This markdown file is a human-readable projection. ${EXPORT_MARKDOWN_NOT_IMPORTABLE} ${EXPORT_MARKDOWN_SCOPE} JSON is the complete registry-driven machine-readable export.\n\nGenerated: ${generatedAt.toISOString()}\n\n`
  );
  const metadata: ReplacementMetadata[] = [];
  await forEachExportPage(profileScope, "brain_docs", tx, async (rows) => {
    for (const doc of rows as BrainDoc[]) {
      metadata.push({
        kind: doc.kind,
        version: doc.version,
        createdAt: doc.createdAt,
        activatedAt: doc.activatedAt,
      });
    }
  });
  await forEachExportPage(profileScope, "brain_docs", tx, async (rows) => {
    const docs = rows as BrainDoc[];
    const inputs = await inputsForDocs(profileScope, docs, tx);
    const inputById = new Map(inputs.map((input) => [input.id, input]));
    for (const doc of docs) {
      const lines = [
        `## ${BRAIN_KIND_LABELS[doc.kind]} — version ${doc.version} (${BRAIN_STATUS_LABELS[doc.status]})`,
        "",
      ];
      // WHY THIS VERSION EXISTS (N3). `/brain` prints this sentence under
      // every version it renders and the artefact of record did not — the one
      // server-composed line that says whether a version was inferred from the
      // creator's posts or typed by the creator themselves was on the screen
      // and missing from the file. It is also what softens the absence
      // sentence chosen just below, so a reader who sees "you left this
      // unstated when you edited this version" can see the edit named.
      //
      // SAFE TO PRINT because of where it came from: `writeBrainDoc` stores
      // `renderBrainReason(code, facts)`, a sentence the SERVER composed from
      // a closed code set plus numbers it counted itself. There is no string
      // parameter in that function (C-42, REQ-I03).
      lines.push(doc.reason, "");
      lines.push(`Created: ${doc.createdAt.toISOString()}`);
      if (doc.supersededAt) {
        const replacement = replacementFromMetadata(doc, metadata);
        lines.push(
          replacement === null
            ? `Replaced: ${doc.supersededAt.toISOString()} (replacement version unavailable)`
            : `Replaced: ${doc.supersededAt.toISOString()} by version ${replacement}`
        );
      }
      lines.push("");
      try {
        const view = claimsForHistory(doc, inputById);
        if (doc.kind === "performance_meta") {
          lines.push(...renderPerformanceMetaMarkdown(doc, view.claims));
        } else {
          for (const claim of view.claims) {
            lines.push(`### ${exportClaimHeading(doc.kind, claim.pointer)}`, "");
            // SELECTED BY (KIND, REASON), not one sentence for all four and not
            // one per kind either (F3; compliance gate round 2). For
            // `strategy`/`killtest` nobody searched anything — the creator left
            // an interview field undecided — and for ANY kind whose version the
            // creator EDITED, the `[check]` is their own decision. The voice
            // sentence in either case attributes their deliberate choice to a
            // failed search of ours, in the artefact of record (REQ-I03).
            if (claim.value === CHECK)
              lines.push(exportAbsenceSentence(doc.kind, doc.reason), "");
            else {
              lines.push(exportClaimValue(claim.pointer, claim.value), "");
              if (claim.quote) {
                // WHOSE WORDS THESE ARE, and when (F4). Without this line a
                // creator's own typed declaration is an unattributed blockquote
                // formally identical to a quote lifted from a saved post, and
                // R5/R6's whole warrant is "you told us so, on this date".
                if (claim.source) {
                  lines.push(
                    quoteIntro(claim.source.inputClass, exportDay(claim.source.postedAt)),
                    ""
                  );
                }
                lines.push(`> ${claim.quote}`, "");
              }
              if (claim.evidenceAnnotation) lines.push(`> ${claim.evidenceAnnotation}`, "");
            }
          }
        }
      } catch {
        lines.push(`- ${EXPORT_EVIDENCE_UNVERIFIED}`, "");
      }
      for (const pointer of emptyArrayPointers(doc.content)) {
        lines.push(`### ${exportClaimHeading(doc.kind, pointer)}`, "", NO_RULES_RECORDED, "");
      }
      await emit(`${lines.join("\n").trimEnd()}\n\n`);
    }
  });
}

// THE SAVED RECORDING PACK, FROM THE PACKAGE'S SIDE (launch L4, R-153).
//
// Reopen a stored generation — the selected version of a piece, or any
// generation of the profile — and read it back as a PRESENTATION DTO: the
// stored output parsed by its OWN contract version (`readStoredScriptOutput`,
// `@respin/modes`' one stored reader — app code never parses), its stored
// checks, its lineage, the piece it is a version of and that piece's versions,
// and what a revision would cost. Then two writes: "use this version" (zero
// cost, version-guarded) and the three fixed revisions (a same-mode revision
// through `generate`, the one door to the vendor, priced as a revision).
//
// WHAT A READ NEVER DOES: call a provider, claim an attempt, touch the ledger,
// or take the workspace money lock. `readSavedGeneration` takes no provider at
// all; it reads the generation, its claim (when no generation exists) and its
// context through `writeCapabilities(scope)` — whose per-transaction lifecycle
// guard refuses a tombstoned identity, workspace or profile and a lost or
// stale membership — and the tier through `getWorkspaceBillingState`, which
// reads the subscription row only. A zero balance or an open pause removes no
// read right: neither is consulted.
//
// WHAT NEVER LEAVES THIS FILE: the model's own disclosure section, and the
// scoring model's free-text notes on the creator's rules. The DTO's output
// carries the product's deterministic guidance in place of the disclosure
// (`PRESENTED_DISCLOSURE_GUIDANCE`); every stored finding that points into the
// model's disclosure — its `unit` is the model's sentence — is dropped; and a
// creator-rule verdict carries pass/fail plus the creator's OWN rule text from
// the kill-test document it ran under, never the scoring model's `note`, which
// was written after reading the whole draft, disclosure included (R-153
// amendment A1). Decided by OWNERSHIP, not by a similarity test of the text.
//
// WHAT STILL LEAVES IT, MODEL-AUTHORED, with the argument for each recorded in
// R-153's amendment: the draft's sections other than the disclosure (they ARE
// what the creator asked for, and the stored claim scan ran over them), the
// stored `weakest_point` (REQ-I04 requires it be named), and the `token` /
// `unit` of findings OUTSIDE the disclosure of a USABLE draft (each one quotes
// a draft field that is already on the page). A REFUSED draft is not on the
// page, so its findings carry token and field only, and no hard-rule
// `excerpt` leaves at all (billing verification, 2026-10-07). An honest refusal's `headline`,
// `sharperAngle` and every `remedy` are product strings from `@respin/modes`'
// static maps. `saved-generation.test.ts` plants the model's disclosure
// sentence into a verdict note and a disclosure hard-rule finding and asserts
// the DTO carries neither; `tests/saved-pack-action.docker.test.tsx` plants a
// verdict note quoting the model's disclosure and asserts the real page, the
// copied script and the Markdown carry none of it.
import {
  CreativePieceError,
  mintProfileScope,
  spinReferenceSummaryForProfile,
  writeCapabilities,
  type DbLike,
  type Generation,
  type ProfileScope,
  type RunSlots,
  type WorkspaceScope,
} from "@respin/db";
import {
  ConfigUnavailableError,
  configVersionContents,
  getActiveConfig,
} from "@respin/config";
import type { LlmProvider } from "@respin/llm";
import {
  modeSpec,
  readStoredScriptOutput,
  type ModeId,
  type ScriptOutput,
} from "@respin/modes";

import {
  creatorRulesOfContent,
  generate,
  generationOp,
  type GenerateResult,
} from "./generate";
import { priceOf, ProfileArchivedError } from "./inference";
import {
  GenerationQuoteChangedError,
  RevisionParentError,
  RevisionPresetError,
} from "./errors";
import { modeLabel } from "./mode-label";
import { planIncludesMode } from "./mode-access";
import {
  PRESENTED_DISCLOSURE_GUIDANCE,
  presentedDisclosure,
  type PresentedDisclosure,
} from "./presented-output";
import { getWorkspaceBillingState } from "./state";

// ------------------------------------------------------------- the DTO

/** Pointer prefix of the model's own disclosure section in a stored document. */
export const MODEL_DISCLOSURE_FIELD_PREFIX = "/disclosure/";

/** One traceability or claim finding, as stored and as a surface may show it. */
export type SavedFinding = Readonly<{
  kind: string;
  enforcement: "hard" | "flag";
  token: string;
  field: string;
  /** Null on a refused draft (billing verification, 2026-10-07): it is not shown. */
  unit: string | null;
}>;

/** One claim finding (REQ-I04/I05). `family` instead of `kind`. */
export type SavedClaimFinding = Readonly<{
  family: string;
  enforcement: "hard" | "flag";
  token: string;
  field: string;
  /** Null on a refused draft, as on `SavedFinding`. */
  unit: string | null;
}>;

/** One hard-rule finding of a refused draft — what fired, where, the remedy. */
export type SavedHardRuleFinding = Readonly<{
  rule: string;
  field: string;
  /** Always null: a refused draft is not shown, so its sentence is not either. */
  excerpt: null;
  remedy: string;
}>;

/**
 * One creator-rule verdict as the saved surface may present it: pass/fail and
 * the CREATOR's own rule text (null when the rule cannot be found in the
 * kill-test document the generation ran under). The scoring model's `note` is
 * validated as stored and then DROPPED — it is model-authored free text written
 * after reading the model's disclosure (R-153 amendment A1).
 */
export type SavedRuleVerdict = Readonly<{
  ruleId: string;
  passed: boolean;
  ruleText: string | null;
}>;

/**
 * The stored kill test as a surface may present it: exactly the fields the
 * Studio projection reads, VALIDATED (never cast), with every finding that
 * points into the model's disclosure section removed and every rule verdict's
 * model note replaced by the creator's own rule text.
 */
export type SavedKillTest = Readonly<{
  outcome: "passed" | "passed_after_rewrite" | "failed";
  attempts: number;
  rewritten: boolean;
  creatorRulesScored: boolean;
  creatorRuleVerdicts: readonly SavedRuleVerdict[];
  traceabilityLimitNote: string;
  finalAttempt: Readonly<{
    traceability: readonly SavedFinding[];
    claims: readonly SavedClaimFinding[];
    hardRules: readonly SavedHardRuleFinding[];
  }>;
  /**
   * True when at least one stored HARD-rule finding pointed into the model's
   * disclosure and was therefore not presented — so a surface can say that the
   * draft's disclosure advice broke a rule rather than show a refusal with no
   * reason (R-153 amendment A6). Server-owned: computed from field pointers.
   */
  disclosureHardRulesWithheld: boolean;
  refusal: Readonly<{ headline: string; sharperAngle: string }> | null;
}>;

/** One version of a piece, as the saved page lists it. */
export type SavedPieceVersion = Readonly<{
  attemptId: string;
  createdAt: string;
  outcome: "usable" | "honest_refusal";
  /** The version the piece currently selects. */
  isSelected: boolean;
  /** The version this page is showing. */
  isThis: boolean;
  /** The version it revised, when that version is in the list. */
  parentAttemptId: string | null;
}>;

/** One direct revision of THIS version, as the saved page lists it. */
export type SavedRevisionLine = Readonly<{
  attemptId: string;
  createdAt: string;
  outcome: "usable" | "honest_refusal";
}>;

/**
 * WHAT A SPIN OR A SOURCE REEL WAS MADE FROM (R-153 amendment A2), so a
 * reopened one keeps its original-vs-draft context. `spin`: the reference's
 * display summary through the profile's scope (`null` when it is no longer
 * readable here, or the row predates the stored id). `source`: the creator's
 * own pasted source, from the root of the revision chain, and which text the
 * stored copy check compared this version against.
 */
export type SavedReference =
  | Readonly<{
      kind: "spin";
      summary: Readonly<{
        source: "YouTube" | "Submitted";
        title: string;
        mechanismSummary: string;
      }> | null;
    }>
  | Readonly<{
      kind: "source";
      text: string | null;
      truncated: boolean;
      /**
       * `source`: an original, checked against the source the creator gave.
       * `revised_draft`: a revision — its check read the revision note and the
       * draft it revised as the material, NOT the original source.
       */
      checkedAgainst: "source" | "revised_draft";
    }>;

/** Why the revision presses are not offered for this version, or null. */
export type SavedRevisionBlock =
  /** An honest refusal stored no draft to revise. */
  | "honest_refusal"
  /** A Spin whose stored reference is not readable here: the gate has nothing to check against. */
  | "reference_unavailable"
  /**
   * A Source-to-reel draft: its revision's copy check reads the draft it
   * revises as the source, so a revision keeping eight words of it in a row
   * ends in a charged honest refusal (R-153 amendment, the A3 note).
   */
  | "source_to_reel";

export type SavedGenerationView = Readonly<{
  attemptId: string;
  generationId: string;
  modeId: string;
  modeLabel: string;
  /** ISO-8601, the stored row's own `created_at`. */
  createdAt: string;
  /** The platform the creator asked for (their input), "" when unreadable. */
  platform: string;
  outcome: "usable" | "honest_refusal";
  /**
   * The stored output, parsed under its own contract version — `null` for an
   * honest refusal. ITS `disclosure` IS THE PRODUCT'S, NOT THE MODEL'S: the
   * request's own platform and `PRESENTED_DISCLOSURE_GUIDANCE`.
   */
  output: ScriptOutput | null;
  /** The stored `weakest_point` column (REQ-I04). */
  weakestPoint: string | null;
  /** The stored checks, or `null` when they cannot be read (said, never hidden). */
  killTest: SavedKillTest | null;
  disclosure: PresentedDisclosure;
  /** The deterministic sentence for `disclosure`, for the export. */
  disclosureGuidance: string;
  lineage: Readonly<{
    parent: Readonly<{ attemptId: string; modeLabel: string }> | null;
    /** The concept batch the piece was chosen from, and the concept's position. */
    source: Readonly<{ attemptId: string; ideaIndex: number }> | null;
  }>;
  /** What a Spin or a source reel was made from; null for every other mode. */
  reference: SavedReference | null;
  /**
   * THIS version's own direct revisions, newest first, bounded — listed for
   * every mode, piece or not, so a revision whose response was lost is visible
   * on reopening (R-153 amendment, billing M2).
   */
  revisions: readonly SavedRevisionLine[];
  revisionsTruncated: boolean;
  /** The piece this generation is a version of, or null. */
  piece: Readonly<{
    pieceId: string;
    /** The version token every move of this piece must name. */
    version: number;
    state: "selected" | "scripted" | "cancelled";
    selectedAttemptId: string | null;
    /** This generation is the piece's selected version. */
    isSelected: boolean;
    /** This generation may become the selected version (usable, not selected). */
    selectable: boolean;
    versions: readonly SavedPieceVersion[];
    versionsTruncated: boolean;
  }> | null;
  /** What a revision of THIS version would be, before the press. */
  revision: Readonly<{
    /** True exactly when `blocked` is null. */
    revisable: boolean;
    /** Why the presses are not offered, or null. */
    blocked: SavedRevisionBlock | null;
    /** The configured revision price under the active config, or null if unreadable. */
    credits: number | null;
    /**
     * The config version `credits` was read under — sent back with the press,
     * which is refused if the price under the then-active version differs
     * (R-153 amendment, billing M1). Null exactly when `credits` is null.
     */
    quoteConfigVersion: number | null;
    /** Whether the plan includes this mode; null when the plan could not be read. */
    inPlan: boolean | null;
  }>;
}>;

/**
 * What a saved-page read found. Only `saved` carries a document; the others are
 * honest, NON-SPENDING states — nothing is regenerated for any of them.
 */
export type SavedGenerationRead =
  | Readonly<{ status: "saved"; view: SavedGenerationView }>
  /** No generation and no claim under this id in this profile (or a foreign id). */
  | Readonly<{ status: "missing" }>
  /** The operation is still in flight; nothing is stored yet. */
  | Readonly<{ status: "pending" }>
  /** The operation ended without a stored draft (refused, or recovery required). */
  | Readonly<{ status: "not_stored"; claim: "refused" | "recovery_required" }>
  /** A stored output this build cannot read: an unknown contract, or damaged. */
  | Readonly<{ status: "unreadable"; reason: "unsupported_contract" | "corrupt" }>;

/** The longest attempt id a read will look up (the ids this product mints are 36). */
const ATTEMPT_ID_MAX = 200;

/**
 * The output contract versions this build's stored reader accepts besides the
 * unversioned legacy one. USED ONLY TO CHOOSE THE ERROR COPY ("written by a
 * newer version" vs "damaged") — never as a gate: the gate is
 * `readStoredScriptOutput`, which refuses everything it cannot read.
 */
const READABLE_CONTRACT_VERSIONS: readonly unknown[] = [2];

// ------------------------------------------------------------- readers

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isEnforcement(v: unknown): v is "hard" | "flag" {
  return v === "hard" || v === "flag";
}

/**
 * The stored kill test, VALIDATED field by field — `null` when any field the
 * surface reads is missing or mis-shaped (an older build's row). FAIL-HONEST:
 * the page says the checks could not be read rather than showing an empty list
 * that would read as "nothing was found".
 */
export function readSavedKillTest(
  value: unknown,
  /** The creator's rules by pointer (`creatorRulesOfContent` of the kill-test doc). */
  ruleTexts: ReadonlyMap<string, string> = new Map()
): SavedKillTest | null {
  if (!isRecord(value)) return null;
  const outcome = value.outcome;
  if (outcome !== "passed" && outcome !== "passed_after_rewrite" && outcome !== "failed") {
    return null;
  }
  const attempts = value.attempts;
  if (attempts !== 1 && attempts !== 2) return null;
  if (typeof value.rewritten !== "boolean") return null;
  if (typeof value.creatorRulesScored !== "boolean") return null;
  if (!isString(value.traceabilityLimitNote)) return null;
  const verdictsRaw = value.creatorRuleVerdicts;
  if (!Array.isArray(verdictsRaw)) return null;
  const verdicts: SavedRuleVerdict[] = [];
  for (const v of verdictsRaw) {
    // The stored shape is still validated in full — a note that is not a
    // string is a damaged row — but the note itself goes no further.
    if (!isRecord(v) || !isString(v.ruleId) || typeof v.passed !== "boolean" || !isString(v.note)) {
      return null;
    }
    verdicts.push({ ruleId: v.ruleId, passed: v.passed, ruleText: ruleTexts.get(v.ruleId) ?? null });
  }
  const final = value.finalAttempt;
  if (!isRecord(final)) return null;
  if (!Array.isArray(final.traceability) || !Array.isArray(final.claims)) return null;
  const traceability: SavedFinding[] = [];
  for (const f of final.traceability) {
    if (
      !isRecord(f) || !isString(f.kind) || !isEnforcement(f.enforcement) ||
      !isString(f.token) || !isString(f.field) || !isString(f.unit)
    ) {
      return null;
    }
    traceability.push({ kind: f.kind, enforcement: f.enforcement, token: f.token, field: f.field, unit: f.unit });
  }
  const claims: SavedClaimFinding[] = [];
  for (const c of final.claims) {
    if (
      !isRecord(c) || !isString(c.family) || !isEnforcement(c.enforcement) ||
      !isString(c.token) || !isString(c.field) || !isString(c.unit)
    ) {
      return null;
    }
    claims.push({ family: c.family, enforcement: c.enforcement, token: c.token, field: c.field, unit: c.unit });
  }
  const hardRules: SavedHardRuleFinding[] = [];
  const hardRaw = final.hardRules;
  if (!Array.isArray(hardRaw)) return null;
  for (const h of hardRaw) {
    if (!isRecord(h) || !isString(h.rule) || !isString(h.field) || !isString(h.excerpt) || !isString(h.remedy)) {
      return null;
    }
    // The excerpt is VALIDATED as stored and then dropped: it quotes the
    // refused draft, which no surface shows.
    hardRules.push({ rule: h.rule, field: h.field, excerpt: null, remedy: h.remedy });
  }
  let refusal: SavedKillTest["refusal"] = null;
  if (value.refusal !== null && value.refusal !== undefined) {
    const r = value.refusal;
    if (!isRecord(r) || !isString(r.headline) || !isString(r.sharperAngle)) return null;
    refusal = { headline: r.headline, sharperAngle: r.sharperAngle };
  }
  // THE MODEL'S DISCLOSURE IS NOT PRESENTED, SO NEITHER IS ANY FINDING IN IT:
  // each one's `unit` / `excerpt` is the model's own policy sentence.
  const notDisclosure = (field: string) => !field.startsWith(MODEL_DISCLOSURE_FIELD_PREFIX);
  // A REFUSED DRAFT IS NOT SHOWN, SO NO SENTENCE OF IT LEAVES THIS PACKAGE
  // (billing verification, 2026-10-07): token and field only.
  const refused = outcome === "failed";
  const sentence = (text: string) => (refused ? null : text);
  return {
    outcome,
    attempts,
    rewritten: value.rewritten,
    creatorRulesScored: value.creatorRulesScored,
    creatorRuleVerdicts: verdicts,
    traceabilityLimitNote: value.traceabilityLimitNote,
    finalAttempt: {
      traceability: traceability
        .filter((f) => notDisclosure(f.field))
        .map((f) => ({ ...f, unit: f.unit === null ? null : sentence(f.unit) })),
      claims: claims
        .filter((c) => notDisclosure(c.field))
        .map((c) => ({ ...c, unit: c.unit === null ? null : sentence(c.unit) })),
      hardRules: hardRules.filter((h) => notDisclosure(h.field)),
    },
    disclosureHardRulesWithheld: hardRules.some((h) => !notDisclosure(h.field)),
    refusal,
  };
}

/** The stored request's platform — the creator's own input — or "". */
function platformOf(request: unknown): string {
  return isRecord(request) && isString(request.platform) ? request.platform : "";
}

/**
 * The stored output, its disclosure REPLACED by the product's (see the header).
 * The rest of the document is the parsed value, untouched.
 */
function presentedOutputOf(output: ScriptOutput, platform: string): ScriptOutput {
  const kind = presentedDisclosure().kind;
  return {
    ...output,
    disclosure: { platform, guidance: PRESENTED_DISCLOSURE_GUIDANCE[kind] },
  };
}

/** Why a stored output could not be read: an unknown contract, or damage. */
function unreadableReason(value: unknown): "unsupported_contract" | "corrupt" {
  if (
    isRecord(value) &&
    Object.prototype.hasOwnProperty.call(value, "contractVersion") &&
    !READABLE_CONTRACT_VERSIONS.includes(value.contractVersion)
  ) {
    return "unsupported_contract";
  }
  return "corrupt";
}

async function revisionQuote(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  mode: string,
  at: Date
): Promise<{ credits: number | null; quoteConfigVersion: number | null; inPlan: boolean | null }> {
  // BOTH FAIL SOFT, and the screen says so. The price is a QUOTE bound to the
  // version it was read under: the press sends that version back and
  // `reviseSaved` refuses it when the active price differs. The tier and the
  // balance are still `generate`'s to re-read at the press.
  let credits: number | null = null;
  let quoteConfigVersion: number | null = null;
  try {
    const { version, content } = await getActiveConfig(db);
    credits = priceOf(content, generationOp(mode as ModeId, true));
    quoteConfigVersion = version;
  } catch {
    credits = null;
    quoteConfigVersion = null;
  }
  let includes: boolean | null = null;
  try {
    const billing = await getWorkspaceBillingState(db, workspaceScope.workspaceId, at);
    includes = planIncludesMode(billing.tier, mode as ModeId);
  } catch {
    includes = null;
  }
  return { credits, quoteConfigVersion, inPlan: includes };
}

/**
 * REOPEN ONE STORED GENERATION by the attempt id it settled under.
 *
 * Throws only what scoping throws (a foreign profile, a tombstoned identity,
 * workspace or profile, a lost membership); every other outcome is a
 * `SavedGenerationRead` state. No provider parameter exists, by design.
 */
export async function readSavedGeneration(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  attemptId: string,
  at: Date
): Promise<SavedGenerationRead> {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const caps = writeCapabilities(scope);
  // READ ONCE INTO A LOCAL (C-40): the id is wire input from the URL.
  const id = attemptId;
  if (typeof id !== "string" || id.trim() === "" || id.length > ATTEMPT_ID_MAX) {
    return { status: "missing" };
  }
  const found = await db.transaction(async (tx) => {
    const generation = await caps.readGenerationForAttempt(id, tx);
    if (!generation) {
      return { generation: undefined, claim: await caps.readGenerationAttempt(id, tx), context: undefined };
    }
    return {
      generation,
      claim: undefined,
      context: await caps.readSavedGenerationContext(generation.id, tx),
    };
  });
  if (!found.generation) {
    const state = found.claim?.state;
    if (state === "claimed" || state === "vendor_started" || state === "vendor_complete") {
      return { status: "pending" };
    }
    if (state === "refused" || state === "recovery_required") {
      return { status: "not_stored", claim: state };
    }
    return { status: "missing" };
  }
  return viewOf(db, workspaceScope, scope, found.generation, found.context, at);
}

/**
 * Whether a STORED mode is similarity-gated. A mode this build does not know
 * (a damaged or future row) is read as not gated here rather than throwing:
 * the read must still answer, and nothing it answers can start a revision —
 * `generate` refuses an unknown mode before anything runs.
 */
function isSimilarityGated(mode: string): boolean {
  try {
    return modeSpec(mode as ModeId).similarityGated;
  } catch {
    return false;
  }
}

/** The stored request's Spin reference id — a server-resolved value — or null. */
function spinAutopsyIdOf(request: unknown): string | null {
  return isRecord(request) && isString(request.spinAutopsyId) && request.spinAutopsyId !== ""
    ? request.spinAutopsyId
    : null;
}

type SavedContext = Awaited<
  ReturnType<ReturnType<typeof writeCapabilities>["readSavedGenerationContext"]>
>;

/**
 * What a Spin or a source reel was made from. Only for the two modes whose
 * input is somebody else's material: `analyseAndSpin` (similarity-gated, its
 * reference read through the profile's scope) and `sourceToReel` (the
 * creator's pasted source, from the chain's root). Null for every other mode.
 */
async function referenceOf(
  db: DbLike,
  scope: ProfileScope,
  generation: Generation,
  context: SavedContext
): Promise<SavedReference | null> {
  if (isSimilarityGated(generation.mode)) {
    const autopsyId = spinAutopsyIdOf(generation.request) ?? context?.root?.spinAutopsyId ?? null;
    const summary =
      autopsyId === null ? null : await spinReferenceSummaryForProfile(db, scope, autopsyId);
    return {
      kind: "spin",
      summary:
        summary === null
          ? null
          : {
              source: summary.sourceKind === "youtube" ? "YouTube" : "Submitted",
              title: summary.title,
              mechanismSummary: summary.hookMechanic,
            },
    };
  }
  if (generation.mode === "sourceToReel") {
    const root = context?.root ?? null;
    const usable = root !== null && root.mode === "sourceToReel";
    return {
      kind: "source",
      text: usable ? root.input : null,
      truncated: usable ? root.inputTruncated : false,
      checkedAgainst: generation.parentId === null ? "source" : "revised_draft",
    };
  }
  return null;
}

/**
 * The creator's rules by pointer, from the kill-test document the generation
 * ran under. FAIL-HONEST: no document (a brain activated without one) or a
 * document this build cannot enumerate gives an empty map, and each verdict
 * then says its rule's wording could not be read — never a guessed text.
 */
function ruleTextsOf(content: unknown): ReadonlyMap<string, string> {
  if (!isRecord(content)) return new Map();
  try {
    return new Map(creatorRulesOfContent(content).map((r) => [r.id, r.text]));
  } catch {
    return new Map();
  }
}

/** Why this version's revision presses are not offered, or null. */
function revisionBlockOf(
  generation: Generation,
  reference: SavedReference | null
): SavedRevisionBlock | null {
  if (generation.outcome !== "usable") return "honest_refusal";
  if (generation.mode === "sourceToReel") return "source_to_reel";
  if (reference?.kind === "spin") {
    // THE SAME ID `reviseSaved` WILL SEND, read from the same stored row, and a
    // reference this profile can still read: otherwise the similarity gate has
    // nothing to check the revision against, and the press could only refuse.
    if (spinAutopsyIdOf(generation.request) === null || reference.summary === null) {
      return "reference_unavailable";
    }
  }
  return null;
}

async function viewOf(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  scope: ProfileScope,
  generation: Generation,
  context: SavedContext,
  at: Date
): Promise<SavedGenerationRead> {
  const platform = platformOf(generation.request);
  let output: ScriptOutput | null = null;
  if (generation.outcome === "usable") {
    try {
      output = presentedOutputOf(
        readStoredScriptOutput({ value: generation.output, mode: generation.mode as ModeId }),
        platform
      );
    } catch {
      return { status: "unreadable", reason: unreadableReason(generation.output) };
    }
  }
  const quote = await revisionQuote(db, workspaceScope, generation.mode, at);
  const reference = await referenceOf(db, scope, generation, context);
  const blocked = revisionBlockOf(generation, reference);
  const ruleTexts = ruleTextsOf(context?.killtestContent ?? null);
  const piece = context?.piece ?? null;
  const versions = context?.versions ?? [];
  const attemptOf = new Map(versions.map((v) => [v.generationId, v.attemptId]));
  const selectedAttemptId =
    piece?.selectedGenerationId == null ? null : (attemptOf.get(piece.selectedGenerationId) ?? null);
  const isSelected = piece !== null && piece.selectedGenerationId === generation.id;
  const disclosure = presentedDisclosure();
  return {
    status: "saved",
    view: {
      attemptId: generation.attemptId,
      generationId: generation.id,
      modeId: generation.mode,
      modeLabel: modeLabel(generation.mode),
      createdAt: generation.createdAt.toISOString(),
      platform,
      outcome: generation.outcome,
      output,
      weakestPoint: generation.weakestPoint,
      killTest: readSavedKillTest(generation.killTest, ruleTexts),
      disclosure,
      disclosureGuidance: PRESENTED_DISCLOSURE_GUIDANCE[disclosure.kind],
      lineage: {
        parent:
          context?.parent == null
            ? null
            : { attemptId: context.parent.attemptId, modeLabel: modeLabel(context.parent.mode) },
        source: context?.source ?? null,
      },
      reference,
      revisions: (context?.revisions ?? []).map((r) => ({
        attemptId: r.attemptId,
        createdAt: r.createdAt.toISOString(),
        outcome: r.outcome,
      })),
      revisionsTruncated: context?.revisionsTruncated ?? false,
      piece:
        piece === null
          ? null
          : {
              pieceId: piece.id,
              version: piece.version,
              state: piece.state,
              selectedAttemptId,
              isSelected,
              selectable:
                !isSelected && piece.state === "scripted" && generation.outcome === "usable",
              versions: versions.map((v) => ({
                attemptId: v.attemptId,
                createdAt: v.createdAt.toISOString(),
                outcome: v.outcome,
                isSelected: piece.selectedGenerationId === v.generationId,
                isThis: v.generationId === generation.id,
                parentAttemptId: v.parentId === null ? null : (attemptOf.get(v.parentId) ?? null),
              })),
              versionsTruncated: context?.versionsTruncated ?? false,
            },
      revision: {
        revisable: blocked === null,
        blocked,
        credits: quote.credits,
        quoteConfigVersion: quote.quoteConfigVersion,
        inPlan: quote.inPlan,
      },
    },
  };
}

// ------------------------------------------------------------- writes

async function profileCaps(db: DbLike, workspaceScope: WorkspaceScope, profileId: string) {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const [profile] = await scope.accessors.profile();
  if (!profile || profile.state !== "active") throw new ProfileArchivedError();
  return writeCapabilities(scope);
}

/**
 * "USE THIS VERSION" — zero cost. The generation is resolved from its attempt id
 * through the profile's own scope; the capability re-checks that it is a usable
 * version of THIS piece and refuses a stale token (`CreativePieceError`).
 */
export async function selectSavedVersion(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  params: { attemptId: string; pieceId: string; expectedVersion: number }
): Promise<{ pieceId: string; version: number }> {
  const caps = await profileCaps(db, workspaceScope, profileId);
  const attemptId = params.attemptId;
  const pieceId = params.pieceId;
  const expectedVersion = params.expectedVersion;
  if (typeof attemptId !== "string" || attemptId.trim() === "" || attemptId.length > ATTEMPT_ID_MAX) {
    throw new CreativePieceError("not_found");
  }
  const piece = await db.transaction(async (tx) => {
    const generation = await caps.readGenerationForAttempt(attemptId, tx);
    if (!generation) throw new CreativePieceError("not_found");
    return caps.selectCreativePieceVersion(
      { pieceId, expectedVersion, generationId: generation.id },
      tx
    );
  });
  return { pieceId: piece.id, version: piece.version };
}

/**
 * THE THREE FIXED REVISIONS the saved page offers. Each note is PRODUCT words
 * passed as the revision note — the input the event scan reads as the
 * creator's own — so each is kept to three words on purpose: a basis quote
 * needs `BASIS_EXCERPT_MIN_WORDS` (4) and pass (c) of the event scan matches
 * four-word runs (`eventRuns` in `@respin/modes`), so a preset note cannot
 * vouch for an event or a result. `saved-generation.test.ts` pins the word
 * counts against that constant and drives the behaviour: a revision narrating
 * a preset's words as an event is refused, the same words as a creator's note
 * pass ("A PRESET NOTE CANNOT VOUCH").
 */
export const REVISION_PRESETS = [
  { id: "shorter", label: "Shorter", note: "Make it shorter." },
  { id: "natural", label: "More natural", note: "Sound more natural." },
  { id: "easier_to_film", label: "Easier to film", note: "Easier to film." },
] as const;

export type RevisionPresetId = (typeof REVISION_PRESETS)[number]["id"];

/** A quote's config version as the page sent it: a positive safe integer, or null. */
function quoteVersionOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/**
 * A SAME-MODE REVISION OF A SAVED VERSION, through `generate` — every gate,
 * the claim, the one debit at the configured REVISION price. The mode, the
 * platform and (for a Spin) the reference are the stored parent's (read
 * through the profile's scope), never the browser's; `attemptId` is minted per
 * press by the caller, as Studio's revise control mints it (R-151 item 1's
 * residual, revisited in R-153).
 *
 * THE QUOTE IS BOUND (R-153 amendment, billing M1). `quotedConfigVersion` is
 * the version the page read the price under; before `generate` is called the
 * revision price under THAT version is compared with the price under the
 * active one, and a difference is `GenerationQuoteChangedError` — no claim, no
 * debit, no provider call. An absent or malformed version is refused
 * (`RevisionPresetError`), never read as "use the active price". The window
 * this does NOT close is the one between this comparison and `generate`'s own
 * config read, recorded in R-153's amendment.
 */
export async function reviseSaved(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string,
  provider: LlmProvider,
  slots: RunSlots,
  params: {
    attemptId: string;
    parentAttemptId: string;
    preset: string;
    quotedConfigVersion: number;
  },
  at: Date
): Promise<GenerateResult> {
  // READ ONCE INTO LOCALS (C-40); the preset and the quote are wire input
  // until they match.
  const preset = REVISION_PRESETS.find((p) => p.id === params.preset);
  if (preset === undefined) throw new RevisionPresetError();
  const quotedVersion = quoteVersionOf(params.quotedConfigVersion);
  if (quotedVersion === null) throw new RevisionPresetError();
  const parentAttemptId = params.parentAttemptId;
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const caps = writeCapabilities(scope);
  const parent =
    typeof parentAttemptId === "string" && parentAttemptId.length <= ATTEMPT_ID_MAX
      ? await db.transaction((tx) => caps.readGenerationForAttempt(parentAttemptId, tx))
      : undefined;
  if (!parent) throw new RevisionParentError("not_this_creators");
  const mode = parent.mode as ModeId;
  const op = generationOp(mode, true);
  let quoted: Awaited<ReturnType<typeof configVersionContents>>;
  try {
    quoted = await configVersionContents(db, [quotedVersion]);
  } catch (err) {
    // A version this database never stored is a quote this page never showed.
    if (err instanceof ConfigUnavailableError) throw new RevisionPresetError();
    throw err;
  }
  const quotedPrice = priceOf(quoted.get(quotedVersion)!, op);
  const currentPrice = priceOf((await getActiveConfig(db)).content, op);
  if (quotedPrice !== currentPrice) {
    throw new GenerationQuoteChangedError(quotedPrice, currentPrice);
  }
  // A SPIN'S REVISION RE-RUNS THE SIMILARITY GATE against the reference the
  // parent was made from — the id stored on the parent's own row, never the
  // form's. Absent, `generate` refuses before any claim; the page does not
  // offer the press then (`reference_unavailable`).
  const spinAutopsyId = modeSpec(mode).similarityGated
    ? (spinAutopsyIdOf(parent.request) ?? undefined)
    : undefined;
  return generate(
    db,
    workspaceScope,
    profileId,
    provider,
    slots,
    {
      mode,
      attemptId: params.attemptId,
      input: preset.note,
      platform: platformOf(parent.request),
      revisionOfAttemptId: parent.attemptId,
      ...(spinAutopsyId === undefined ? {} : { spinAutopsyId }),
    },
    at
  );
}

// ------------------------------------------------------------- the list

/** How many recent recording packs `/studio` lists. */
export const RECENT_SAVED_MAX = 10;
const TITLE_MAX = 120;

export type RecentSavedGeneration = Readonly<{
  attemptId: string;
  modeLabel: string;
  createdAt: string;
  outcome: "usable" | "honest_refusal";
  /** The draft's first line (thesis, hook, idea or caption), or null. */
  title: string | null;
}>;

function titleOf(generation: Generation): string | null {
  if (generation.outcome !== "usable") return null;
  try {
    const output = readStoredScriptOutput({
      value: generation.output,
      mode: generation.mode as ModeId,
    });
    const line =
      output.thesis?.statement ??
      output.hooks?.[0]?.text ??
      output.ideas?.[0]?.hook ??
      output.caption?.text ??
      null;
    if (line === null) return null;
    const chars = [...line];
    return chars.length > TITLE_MAX ? `${chars.slice(0, TITLE_MAX - 1).join("")}…` : line;
  } catch {
    return null;
  }
}

/** This profile's most recent stored generations, newest first. A read. */
export async function recentSavedGenerations(
  db: DbLike,
  workspaceScope: WorkspaceScope,
  profileId: string
): Promise<RecentSavedGeneration[]> {
  const scope = await mintProfileScope(db, workspaceScope, profileId);
  const rows = await scope.accessors.generationsNewest({ limit: RECENT_SAVED_MAX });
  return rows.map((g) => ({
    attemptId: g.attemptId,
    modeLabel: modeLabel(g.mode),
    createdAt: g.createdAt.toISOString(),
    outcome: g.outcome,
    title: titleOf(g),
  }));
}

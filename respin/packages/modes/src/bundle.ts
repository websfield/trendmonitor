// The prompt bundle's version (REQ-J02, slice 6 R4).
//
// REQ-J02: "the assembled system context per mode is versioned, and every
// generation records which versions produced it, so quality regressions are
// diagnosable."
//
// A CONTENT HASH, NOT A HAND-BUMPED STRING, and the difference is the whole
// point. `VOICE_PROMPT_BUNDLE_VERSION` in `packages/credits/src/infer-voice.ts`
// is a literal with a docblock asking whoever edits the prompt to remember to
// bump it — which works exactly as often as people remember. Every generation
// here books its spend against a version DERIVED from the strings it actually
// ran, so the attribution cannot drift from the prompt.
//
// WHAT IS IN THE HASH, AND WHY THE CREATOR'S CONTENT IS NOT:
//
//   IN — the system prompt, the mode's task brief, the JSON output contract
//   (itself derived from the mode spec, so widening a mode's sections moves the
//   version), the rewrite instruction, the kill-test system prompt, and the
//   gate constants, pattern sources AND ENFORCEMENTS that decide what survives.
//   Since audit Phase 8 also the universal laws a generation renders (P8-A4)
//   and the untrusted-input fences with their encoding's behaviour (P8-R2).
//
//   OUT — the creator's brain, their input, the frameworks. A version that
//   changed per creator would be unique to every generation and would diagnose
//   nothing; worse, it would put creator content into a spend-attribution
//   string that `model_usage` stores and `/admin/model-spend` reads.
//
// PURE: `node:crypto`'s sha256 is the repo's existing digest (`echo.ts`,
// `with-workspace.ts`), it is deterministic, and it touches no clock, no
// network and no database.
import { createHash } from "node:crypto";

import {
  AUTO_FORM_INSTRUCTION,
  CONSTRAINT_LABELS,
  CREATIVE_BLOCK_HEADER,
  CREATIVE_RULES,
  FENCE_MARKERS,
  FINDINGS_LABEL,
  KILL_TEST_ANSWER_INSTRUCTION,
  KILL_TEST_CRITERIA_LABEL,
  MODE_BRIEFS,
  FORM_INSTRUCTIONS,
  FORM_REQUESTED_NOTE,
  FRAMEWORK_BLOCK_EMPTY,
  FRAMEWORK_BLOCK_HEADER,
  FRAMEWORK_EVIDENCE_LABEL,
  FRAMEWORK_EVIDENCE_NOTE,
  GENERATION_SYSTEM,
  GenerationAssemblyError,
  HARD_RULE_BRIEF,
  INPUT_FENCE_CLOSE,
  NO_CONSTRAINTS_LINE,
  PEOPLE_LABELS,
  RECENT_WORK_AVOID_NOTE,
  RECENT_WORK_BLOCK_HEADER,
  RECENT_WORK_BLOCK_NOTE,
  RECENT_WORK_EMPTY,
  RECENT_WORK_LABELS,
  RECENT_WORK_NOTE_PREFIX,
  RECENT_WORK_SEQUEL_NOTE,
  REFERENCE_BLOCK_HEADER,
  REFERENCE_BLOCK_NOTE,
  REFERENCE_MECHANISM_LABELS,
  REWRITE_INSTRUCTION,
  UNIVERSAL_LAWS,
  encodeUntrusted,
  neutraliseFenceMarkers,
  modeBriefText,
  universalLawLines,
  outputContractFor,
} from "./assemble";
import {
  ADMISSION_CLAIM_FIELDS,
  ADMISSION_HEDGE_PHRASES,
  CLAIM_CONTEXT_GUARDS,
  CLAIM_HEDGE_ALLOWLIST,
  CLAIM_HEDGE_TAILS,
  OUTPUT_CLAIM_SHAPES,
  claimFieldsFor,
  scanOutputClaims,
} from "./claims";
import {
  CONSTRAINT_ITEM_MAX_CODE_POINTS,
  CONSTRAINT_LIST_MAX,
  FILMING_MINUTES_MAX,
  FILMING_MINUTES_MIN,
  FOOTAGE_MAX_CODE_POINTS,
  BASIS_EXCERPT_MIN_CONTENT_WORDS,
  BASIS_EXCERPT_MIN_WORDS,
  BASIS_RELATED_MIN_CONTENT_WORDS,
  EVENT_FIELDS,
  PIVOT_FOR_FORM,
  takesCreativeForm,
} from "./creative";
import {
  ANTITHESIS_SHAPES,
  FRAGMENT_MAX_WORDS,
  FRAGMENT_RUN,
  HARD_RULE_IDS,
  HOOK_MAX_WORDS,
} from "./hard-rules";
import { KILL_TEST_SYSTEM } from "./kill-test";
import {
  CONTINUATION_SHAPE,
  EVENT_SCAN_POPULATION,
  EVENT_SHAPES,
  SHOT_HELPER_SHAPES,
  SHOT_KIT_SHAPES,
  HOOK_SPREAD_MAX_OVERLAP,
  HOOK_SPREAD_MIN_CONTENT_WORDS,
  IDEA_THESIS_MIN_WORDS,
  NAMES_NOTHING_SHAPES,
  SOURCE_RUN_WORDS,
  SUMMARY_REGISTER_SHAPES,
  WEAKEST_POINT_MIN_WORDS,
} from "./mode-checks";
import { modeSpec, type ModeId } from "./modes";
import {
  EXTENT_PROBES,
  SPECIFIC_SHAPES,
  specificExtents,
} from "./traceability";

/** The prefix every version this package mints carries. */
export const PROMPT_BUNDLE_NAMESPACE = "modes";

/** How much of the digest goes in the version string. */
const DIGEST_CHARS = 12;

/**
 * The fixed probes `claimOccurrence=` runs the claim scan over: two
 * occurrences under one guard, a hedge before a dash, a lead-in clause, a
 * presented field, an undecidable "except" `but`, and a claim after a relative
 * pronoun. A change invisible to every probe moves nothing — the
 * `EXTENT_PROBES` residual, stated here too.
 */
export const CLAIM_PROBES: readonly (readonly [string, string])[] = [
  ["/whyThisPerforms/reasoning", "Nothing here makes it go viral, but this hook goes viral anyway."],
  ["/whyThisPerforms/reasoning", "Nothing is guaranteed — this will perform."],
  ["/whyThisPerforms/reasoning", "Honestly, nothing here says it goes viral."],
  ["/whyThisPerforms/reasoning", "Who says this isn't guaranteed?"],
  ["/whyThisPerforms/weakestPoint", "It's unlikely to go viral."],
  ["/whyThisPerforms/weakestPoint", "Results are guaranteed."],
  ["/caption/text", "Nothing here is guaranteed! Results are."],
  ["/caption/text", "Results are guaranteed."],
  ["/caption/text", "Nobody but you can guarantee it lands."],
  ["/caption/text", "Nothing beats a method that is guaranteed to work."],
];

/**
 * The gate description that goes into the hash.
 *
 * THE CONSTANTS AND THE PATTERN SOURCES, not just the rule names. Loosening the
 * hook cap or rewriting an antithesis pattern changes which drafts survive as
 * surely as rewording the prompt does, and REQ-J02's purpose is diagnosing a
 * quality change — so a bundle version that moved for one and not the other
 * would answer the question wrongly half the time.
 */
function gateDescription(): string {
  return [
    "rules=" + HARD_RULE_IDS.join(","),
    `hookMaxWords=${HOOK_MAX_WORDS}`,
    `fragment=${FRAGMENT_RUN}x${FRAGMENT_MAX_WORDS}`,
    "antithesis=" +
      ANTITHESIS_SHAPES.map((s) => s.id + "~" + s.pattern.source).join("|"),
    "specifics=" +
      SPECIFIC_SHAPES.map((s) => s.id + "~" + s.pattern.source).join("|"),
    // THE ENFORCEMENT, ON ITS OWN LINE. Which shapes may REFUSE decides what
    // survives as surely as the patterns do — demoting `plain-number` to a flag
    // changes the population of drafts that reach a creator, so REQ-J02's
    // question ("what changed?") has to see it.
    "specificEnforcement=" +
      SPECIFIC_SHAPES.map((s) => s.id + "=" + s.enforcement).join(","),
    // THE EXTENT POLICY, AS BEHAVIOUR RATHER THAN AS A NAME. Which drafts
    // survive depends on how the shapes' matches are RESOLVED against each
    // other as much as on the patterns themselves, and slice 8c proved it
    // twice: the population of drafts reaching a creator moved in round 1 and
    // again in round 2 with `SPECIFIC_SHAPES` byte-identical either side of the
    // second move. There is no constant to hash for that, and a hand-bumped
    // policy string is the `VOICE_PROMPT_BUNDLE_VERSION` anti-pattern this
    // file's header exists to reject — so the line carries the tokeniser's
    // OUTPUT on a fixed probe set instead. Change how extents resolve and the
    // digest moves with nobody remembering to bump anything. `EXTENT_PROBES`
    // states its own residual: a change invisible to every probe moves nothing.
    "specificExtent=" +
      EXTENT_PROBES.map((t) => t + "=>" + specificExtents(t).join("/")).join(
        "|"
      ),
    "claims=" +
      OUTPUT_CLAIM_SHAPES.map(
        (s) => s.family + ":" + s.id + "~" + s.pattern.source
      ).join("|"),
    // Same reason as `specificEnforcement`: which claim shapes may REFUSE is
    // what decides whether a draft reaches a creator, and it moves without a
    // pattern changing.
    "claimEnforcement=" +
      OUTPUT_CLAIM_SHAPES.map((s) => s.id + "=" + s.enforcement).join(","),
    // THE FIELD POPULATION EACH SHAPE REFUSES ON (audit Phase 2, P2-R2/R-168).
    // Measured 2026-09-21: neither `HARD_CLAIM_FIELD_PREFIXES` nor the guards
    // were in this description, so moving `guarantee` onto every presented
    // field — or `/disclosure/` off the hard list — would have left the version
    // where it was. The line carries the RESOLVED pointer set per shape, so a
    // scope edit, a prefix edit and a new `line()` in the schema all move it.
    "claimFields=" +
      OUTPUT_CLAIM_SHAPES.filter((s) => s.enforcement === "hard")
        .map((s) => s.id + "=" + claimFieldsFor(s).join(","))
        .join("|"),
    // THE CONTEXT GUARDS — the concealment guards with each one's window,
    // families and pattern source; the R-173 closed hedge allowlist, every
    // phrase written out; and the admission fields.
    "claimGuards=" +
      CLAIM_CONTEXT_GUARDS.map(
        (g) => g.id + ":" + g.reads + ":" + g.families.join("+") + "~" + g.pattern.source
      ).join("|") +
      " hedges~" +
      CLAIM_HEDGE_ALLOWLIST.map((h) => h.id + ":" + h.shapes.join("+") + "=" + h.phrases.join(",")).join("|") +
      " tails~" + CLAIM_HEDGE_TAILS.map((t) => JSON.stringify(t)).join(",") +
      " admission~" + ADMISSION_CLAIM_FIELDS.join(",") + "=" + ADMISSION_HEDGE_PHRASES.join(","),
    // THE OCCURRENCE POLICY, AS BEHAVIOUR (the `specificExtent=` model): the
    // scan's OUTPUT on a fixed probe set. Reading only the first match, or
    // taking the most lenient occurrence instead of the strictest, changes
    // these outputs with no constant changing.
    "claimOccurrence=" +
      CLAIM_PROBES.map(
        ([field, text]) =>
          field + ":" + text + "=>" +
          scanOutputClaims([{ field, text, isHook: false }])
            .map((f) => f.shape + "=" + f.enforcement)
            .join("/")
      ).join("|"),
    // THE PER-MODE CHECKS' CONSTANTS AND PATTERN SOURCES, for the reason every
    // other line here exists: moving the hook-overlap threshold or the thesis
    // word floor changes which drafts reach a creator without touching a single
    // prompt, and REQ-J02's question is "what changed?".
    `modeCheck=hookSpread${HOOK_SPREAD_MAX_OVERLAP}/${HOOK_SPREAD_MIN_CONTENT_WORDS} sourceRun${SOURCE_RUN_WORDS} thesisMin${IDEA_THESIS_MIN_WORDS} weakestMin${WEAKEST_POINT_MIN_WORDS}`,
    "summaryRegister=" +
      SUMMARY_REGISTER_SHAPES.map((s) => s.id + "~" + s.pattern.source).join(
        "|"
      ),
    "namesNothing=" +
      NAMES_NOTHING_SHAPES.map((s) => s.id + "~" + s.pattern.source).join("|"),
    // R-148 (launch L1): the creative checks' constants. Which basis quote is
    // long enough, which pivot each form takes, where an unconfirmed event must
    // carry its marker and how far a declared limit reaches all decide which
    // version-2 drafts survive, so they move the version like every line above.
    `basis=minWords${BASIS_EXCERPT_MIN_WORDS}/minContent${BASIS_EXCERPT_MIN_CONTENT_WORDS}/related${BASIS_RELATED_MIN_CONTENT_WORDS}`,
    // Round-1 compliance gate: the event guard and the shot-map marker lists
    // decide which v2 drafts survive as surely as any pattern above.
    "events=" +
      EVENT_SHAPES.map(
        (s) => s.id + "~" + s.pattern.source + (s.context ? "@" + s.context.source : "")
      ).join("|"),
    "continuation=" + CONTINUATION_SHAPE.pattern.source,
    // R-150 point 1: WHICH FIELDS the event scan reads decides which drafts
    // survive as surely as the shapes do.
    "eventScan=" + EVENT_SCAN_POPULATION.join(","),
    "shotKit=" + SHOT_KIT_SHAPES.map((s) => s.id + "~" + s.pattern.source).join("|"),
    "shotHelper=" + SHOT_HELPER_SHAPES.map((s) => s.id + "~" + s.pattern.source).join("|"),
    "pivotForForm=" +
      Object.entries(PIVOT_FOR_FORM)
        .map(([form, pivot]) => form + ":" + pivot)
        .join(","),
    "eventFields=" +
      Object.entries(EVENT_FIELDS)
        .map(([form, fields]) => form + ":" + fields.join("+"))
        .join(","),
    `constraintBounds=item${CONSTRAINT_ITEM_MAX_CODE_POINTS}/list${CONSTRAINT_LIST_MAX}/footage${FOOTAGE_MAX_CODE_POINTS}/minutes${FILMING_MINUTES_MIN}-${FILMING_MINUTES_MAX}`,
  ].join("\n");
}

/**
 * The version-2 creative block's STATIC words (R-148): the header, every form
 * instruction, the "Choose for me" line, the rules, the constraint labels and
 * the empty case. The creator's choice and limits are per generation and stay
 * out, exactly as the framework list and the reference mechanism do.
 */
function creativeBlockStatics(): string {
  return [
    CREATIVE_BLOCK_HEADER,
    FORM_REQUESTED_NOTE,
    ...Object.values(FORM_INSTRUCTIONS),
    AUTO_FORM_INSTRUCTION,
    ...CREATIVE_RULES,
    ...Object.values(CONSTRAINT_LABELS),
    ...Object.values(PEOPLE_LABELS),
    NO_CONSTRAINTS_LINE,
  ].join("\n");
}

/**
 * The recent-work block's STATIC words (launch L3, R-152): the header, the
 * history-not-facts note, both sequel instructions, the empty case, every
 * label and the reaction-note prefix. The entries are per generation and stay
 * out, exactly as the framework list and the reference mechanism do. Only the
 * modes that READ history carry this part, so the five other modes' versions
 * do not move for a block they never render.
 */
function recentWorkBlockStatics(): string {
  return [
    RECENT_WORK_BLOCK_HEADER,
    RECENT_WORK_BLOCK_NOTE,
    RECENT_WORK_AVOID_NOTE,
    RECENT_WORK_SEQUEL_NOTE,
    RECENT_WORK_EMPTY,
    RECENT_WORK_NOTE_PREFIX,
    ...Object.entries(RECENT_WORK_LABELS).map(([id, text]) => id + ":" + text),
  ].join("\n");
}

/**
 * A fixed probe through the untrusted-input encoding: a quote, a backslash, a
 * line break, a tab and a forged closing marker. Its ENCODED OUTPUT is hashed
 * (the `specificExtent=` model), so changing how fenced text is escaped moves
 * the version even when no marker string changed.
 */
export const UNTRUSTED_ENCODING_PROBE = 'say "hi" \\ end\n\tnext ' + INPUT_FENCE_CLOSE;

/**
 * The fences' STATIC words and the encoding's behaviour (audit Phase 8,
 * P8-R2). `contextBlock`, the rewrite prompt and the kill test's prompt emit
 * these as function output, which nothing else hashes.
 */
function untrustedFencesStatics(): string {
  return [
    ...FENCE_MARKERS,
    "encoding=" + encodeUntrusted(UNTRUSTED_ENCODING_PROBE),
    // The neutraliser's BEHAVIOUR on every marker, each behind a run of `<`
    // (gate M4), so a change to how markers are broken moves the version.
    "draftMarkers=" +
      neutraliseFenceMarkers(FENCE_MARKERS.map((m) => "<<<<" + m).join(" ")),
  ].join("\n");
}

/**
 * The static labels around per-generation text (gate note): the mode's input
 * label, the findings label and the kill test's two. Not creator text.
 */
function promptLabelsStatics(mode: ModeId): string {
  return [
    MODE_BRIEFS[mode].inputLabel,
    FINDINGS_LABEL,
    KILL_TEST_CRITERIA_LABEL,
    KILL_TEST_ANSWER_INSTRUCTION,
  ].join("\n");
}

/**
 * The named, creator-independent parts of one mode's bundle.
 *
 * A PLAIN RECORD so the hash's input is inspectable in a test and in a log,
 * rather than a string nobody can decompose when a version moves unexpectedly.
 */
export function bundlePartsFor(
  mode: ModeId,
  /**
   * WHICH OUTPUT CONTRACT the bundle describes (R-148). A version-2 generation
   * runs a different output contract and an extra block of instructions, so
   * its bundle is a different set of strings and gets a different version — a
   * v1 and a v2 ideation draft are never booked against one digest. The default
   * is the legacy contract every mode has; `promptBundleVersion` callers that
   * run a v2 generation pass `contractOf(context).version`.
   */
  version: 1 | 2 = 1,
  /**
   * THE LAWS THIS GENERATION RENDERS (audit Phase 8, P8-A4). Both producers of
   * the version — `generate.ts` and `pipeline.ts` — pass the context's own
   * `universalLaws`, so the digest names the laws that actually ran; the
   * default is the product's constant, which every production context carries.
   */
  universalLaws: readonly string[] = UNIVERSAL_LAWS
): Record<string, string> {
  if (version === 2 && !takesCreativeForm(mode)) {
    throw new GenerationAssemblyError(
      `the ${mode} mode has no version-2 prompt bundle`
    );
  }
  return {
    ...(version === 2 ? { creativeBlock: creativeBlockStatics() } : {}),
    ...(takesCreativeForm(mode) ? { recentWorkBlock: recentWorkBlockStatics() } : {}),
    generationSystem: GENERATION_SYSTEM,
    // P8-A4: layer one of the three-layer IP, hashed at last. One law per line.
    // The block EXACTLY as rendered — label and "- " bullets (gate note).
    universalLaws: universalLawLines(universalLaws).join("\n"),
    promptLabels: promptLabelsStatics(mode),
    // P8-R2: the untrusted-input fences and the encoding's behaviour.
    untrustedFences: untrustedFencesStatics(),
    modeBrief: modeBriefText(mode),
    outputContract: outputContractFor(mode, version),
    hardRuleBrief: HARD_RULE_BRIEF,
    rewriteInstruction: REWRITE_INSTRUCTION,
    killTestSystem: KILL_TEST_SYSTEM,
    // WHICH CHECKS THIS MODE RUNS, and it is a per-mode part rather than a line
    // in `gateDescription` for the reason the mode brief is: two modes with the
    // same prompt and different gates produce different populations of surviving
    // drafts, which is exactly the question REQ-J02 asks a version to answer.
    modeChecks: modeSpec(mode).checks.join(","),
    // THE FRAMEWORK BLOCK'S STATIC WORDS (billing gate round 2, 2026-09-01).
    // The list itself is creator-dependent and stays OUT — but the header, the
    // evidence note and the empty-case line are the product's own instructions,
    // and they decide what a model does with the library on every generation
    // that offers one. They were literals inside `contextBlock`, which nothing
    // hashes, so rewriting or deleting the evidence note moved no version at
    // all.
    frameworkBlock: [
      FRAMEWORK_BLOCK_HEADER,
      FRAMEWORK_EVIDENCE_NOTE,
      FRAMEWORK_EVIDENCE_LABEL,
      FRAMEWORK_BLOCK_EMPTY,
    ].join("\n"),
    // THE REFERENCE BLOCK'S STATIC WORDS (slice 8c R11, R-97), for the reason
    // the framework block's are: the header is what makes a model read the
    // mechanism as another creator's to adapt rather than quote, and a
    // rewrite of it changes which drafts the gate then refuses. The mechanism
    // itself is per generation and stays OUT.
    referenceBlock: [
      REFERENCE_BLOCK_HEADER,
      REFERENCE_BLOCK_NOTE,
      ...Object.values(REFERENCE_MECHANISM_LABELS),
    ].join("\n"),
    gates: gateDescription(),
  };
}

/**
 * The separators, written as ESCAPES rather than as the literal control bytes
 * an earlier draft of this file carried: an invisible byte in source is a byte
 * nobody reviews.
 *
 * They are what stops two different bundles colliding into one digest. Joining
 * on an ordinary space with no record separator makes {a: "b", c: "d"} and
 * {a: "bc d"} the SAME hash input — `bundle.test.ts` computes that collision
 * rather than asserting it — and a version that cannot tell two bundles apart
 * answers REQ-J02's question wrongly.
 */
const FIELD_SEP = "\u0000";
const RECORD_SEP = "\u0001";

/**
 * Hash a bundle's parts.
 *
 * KEYS ARE SORTED, so a refactor that reorders the object literal does not mint
 * a fake version bump.
 */
export function hashBundleParts(parts: Record<string, string>): string {
  const canonical = Object.keys(parts)
    .sort()
    .map((k) => k + FIELD_SEP + parts[k])
    .join(RECORD_SEP);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * The value stage C passes as `RunInferenceParams.promptBundleVersion`.
 *
 * The mode is in the string as well as in the hash so a spend row is readable
 * without a lookup: `modes/hooks@1f4a…`.
 */
export function promptBundleVersion(
  mode: ModeId,
  version: 1 | 2 = 1,
  universalLaws: readonly string[] = UNIVERSAL_LAWS
): string {
  const digest = hashBundleParts(bundlePartsFor(mode, version, universalLaws));
  return `${PROMPT_BUNDLE_NAMESPACE}/${mode}@${digest.slice(0, DIGEST_CHARS)}`;
}

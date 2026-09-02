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
  FRAMEWORK_BLOCK_EMPTY,
  FRAMEWORK_BLOCK_HEADER,
  FRAMEWORK_EVIDENCE_LABEL,
  FRAMEWORK_EVIDENCE_NOTE,
  GENERATION_SYSTEM,
  HARD_RULE_BRIEF,
  REWRITE_INSTRUCTION,
  modeBriefText,
  outputContractFor,
} from "./assemble";
import { OUTPUT_CLAIM_SHAPES } from "./claims";
import {
  ANTITHESIS_SHAPES,
  FRAGMENT_MAX_WORDS,
  FRAGMENT_RUN,
  HARD_RULE_IDS,
  HOOK_MAX_WORDS,
} from "./hard-rules";
import { KILL_TEST_SYSTEM } from "./kill-test";
import {
  HOOK_SPREAD_MAX_OVERLAP,
  HOOK_SPREAD_MIN_CONTENT_WORDS,
  IDEA_THESIS_MIN_WORDS,
  NAMES_NOTHING_SHAPES,
  SOURCE_RUN_WORDS,
  SUMMARY_REGISTER_SHAPES,
  WEAKEST_POINT_MIN_WORDS,
} from "./mode-checks";
import { modeSpec, type ModeId } from "./modes";
import { SPECIFIC_SHAPES } from "./traceability";

/** The prefix every version this package mints carries. */
export const PROMPT_BUNDLE_NAMESPACE = "modes";

/** How much of the digest goes in the version string. */
const DIGEST_CHARS = 12;

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
    "claims=" +
      OUTPUT_CLAIM_SHAPES.map(
        (s) => s.family + ":" + s.id + "~" + s.pattern.source
      ).join("|"),
    // Same reason as `specificEnforcement`: which claim shapes may REFUSE is
    // what decides whether a draft reaches a creator, and it moves without a
    // pattern changing.
    "claimEnforcement=" +
      OUTPUT_CLAIM_SHAPES.map((s) => s.id + "=" + s.enforcement).join(","),
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
  ].join("\n");
}

/**
 * The named, creator-independent parts of one mode's bundle.
 *
 * A PLAIN RECORD so the hash's input is inspectable in a test and in a log,
 * rather than a string nobody can decompose when a version moves unexpectedly.
 */
export function bundlePartsFor(mode: ModeId): Record<string, string> {
  return {
    generationSystem: GENERATION_SYSTEM,
    modeBrief: modeBriefText(mode),
    outputContract: outputContractFor(mode),
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
export function promptBundleVersion(mode: ModeId): string {
  const digest = hashBundleParts(bundlePartsFor(mode));
  return `${PROMPT_BUNDLE_NAMESPACE}/${mode}@${digest.slice(0, DIGEST_CHARS)}`;
}

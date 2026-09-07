// @respin/modes — the generation pipeline (tech-spec §1, §3; slice 6 stage B).
//
// THE PACKAGE'S TWO INVARIANTS, both asserted rather than asserted about:
//
//  1. PURE AND OFFLINE. No `@respin/db`, no network, no clock. Every export
//    below is a function from values to values, except `runGeneration`, which
//    takes the vendor call as a CALLBACK. `tests/purity.test.ts` scans this
//    package's source for the shapes that would break it, and plants a
//    violation of each shape it claims to cover.
//  2. THE HARD RULES ARE CODE. Only the creator's own criteria go to a model
//    (R5). `hard-rules.ts` and `traceability.ts` take no callback, and the
//    behavioural half is `pipeline.test.ts`: a scorer that passes everything
//    cannot save a draft that broke a hard rule.
//
// IT IS DENIED FROM `app/**` BY DEFAULT, and stays that way: the eslint
// negation catch-all admits only sanctioned entrypoints, `@respin/modes` is not
// one, and `tests/import-boundary.test.ts` carries the deny fixture. A page
// reaches a generation through `@respin/credits/app-server`, where the money
// path already is — exactly as `@respin/llm` is reached through `inferVoice`.
export {
  MODE_CHECK_IDS,
  MODE_IDS,
  MODE_SPECS,
  SECTION_KEYS,
  UNIVERSAL_SECTIONS,
  IMPLEMENTED_MODES,
  modeSpec,
  UnknownModeError,
  type CreditCostKey,
  type ModeCheckId,
  type ModeId,
  type ModeSpec,
  type SectionKey,
} from "./modes";

// The per-mode OUTPUT checks (slice 7, R3/R4/R5/R18).
//
// EXPORTED BUT NOT SEPARATELY CALLABLE BY DESIGN: `scanModeChecks` runs INSIDE
// `runKillTest`, so a caller cannot run the kill test without running these,
// and card R7's "a revision re-runs the kill test" therefore covers them
// structurally rather than by anyone remembering. What the exports are for is
// the surface that explains a finding, and the honest-limit list.
export {
  HOOK_SPREAD_MAX_OVERLAP,
  HOOK_SPREAD_MIN_CONTENT_WORDS,
  IDEA_THESIS_MIN_WORDS,
  KNOWN_MODE_CHECK_GAPS,
  MODE_CHECK_GAP_IDS,
  NAMES_NOTHING_SHAPES,
  SOURCE_RUN_WORDS,
  SUMMARY_REGISTER_SHAPES,
  WEAKEST_POINT_MIN_WORDS,
  contentOverlap,
  contentWords,
  scanModeChecks,
  type ModeCheckArgs,
  type ModeCheckGapId,
} from "./mode-checks";

export {
  excerpt,
  lines,
  sentenceUnits,
  wordCount,
  words,
  type TextUnit,
} from "./text";

export {
  ScriptOutputError,
  assertUniversalSections,
  outputTextUnits,
  parseScriptOutput,
  renderDraft,
  sectionLabel,
  type Beat,
  type Hook,
  type Idea,
  type ScriptOutput,
} from "./output";

export {
  ANTITHESIS_SHAPES,
  EQUAL_LENGTH_MAX_WORDS,
  FRAGMENT_MAX_WORDS,
  FRAGMENT_RUN,
  HARD_RULE_IDS,
  HOOK_MAX_WORDS,
  remedyFor,
  scanAntithesis,
  scanFragmentTriads,
  scanHookLength,
  scanTextOnlyHardRules,
  type HardRuleFinding,
  type HardRuleId,
} from "./hard-rules";

export {
  HARD_CLAIM_FIELD_PREFIXES,
  OUTPUT_CLAIM_SHAPES,
  claimRemedyFor,
  scanOutputClaims,
  type ClaimEnforcement,
  type ClaimFamily,
  type ClaimFinding,
  type OutputClaimShape,
} from "./claims";

export {
  COMMON_OPENERS,
  FLAG_ONLY_FIELD_PREFIXES,
  SPECIFIC_SHAPES,
  TRACEABILITY_LIMIT_NOTE,
  buildCorpusIndex,
  offerCheck,
  scanTraceability,
  stripMarkedSpecifics,
  type SpecificKind,
  type TraceabilityCorpus,
  type TraceabilityEnforcement,
  type TraceabilityFinding,
} from "./traceability";

export {
  // The per-row prefix `packages/credits` writes the evidence rung under. The
  // sentence that EXPLAINS the rung lives beside it in `assemble.ts` and is
  // not exported: nothing outside this package writes that sentence.
  FRAMEWORK_EVIDENCE_LABEL,
  GENERATION_SYSTEM,
  GenerationAssemblyError,
  HARD_RULE_BRIEF,
  MODE_BRIEFS,
  // The reference block's statics and bounds (R-97). `packages/credits` fills
  // `GenerationContext.reference` for the gated mode; the type it fills is the
  // four-field projection and nothing else of the autopsy.
  REFERENCE_BLOCK_HEADER,
  REFERENCE_BLOCK_NOTE,
  REFERENCE_MECHANISM_BEATS_MAX,
  REFERENCE_MECHANISM_FIELDS,
  REFERENCE_MECHANISM_LABELS,
  REFERENCE_MECHANISM_TEXT_MAX_CODE_POINTS,
  REWRITE_INSTRUCTION,
  assembleGenerationPrompt,
  assembleRewritePrompt,
  outputContractFor,
  traceabilityCorpusFor,
  type Framework,
  type GenerationContext,
  type SpinReferenceMechanism,
} from "./assemble";

export {
  KILL_TEST_SYSTEM,
  KillTestError,
  MAX_GENERATION_ATTEMPTS,
  NoCreatorRulesError,
  assembleKillTestPrompt,
  claimHardRuleFindings,
  decideAfterKillTest,
  honestRefusal,
  inventedSpecificFindings,
  parseKillTestReply,
  runKillTest,
  usableCreatorRules,
  type Attempt,
  type AttemptFindings,
  type CreatorRule,
  type CreatorRuleVerdict,
  type HonestRefusal,
  type KillTestDecision,
  type KillTestOutcome,
  type KillTestResult,
} from "./kill-test";

export {
  PROMPT_BUNDLE_NAMESPACE,
  bundlePartsFor,
  hashBundleParts,
  promptBundleVersion,
} from "./bundle";

export {
  runGeneration,
  type GenerateFn,
  type GenerationRun,
  type ScoreCreatorRulesFn,
} from "./pipeline";

export {
  CODE_SPIN_STRICTNESS_FLOOR,
  SpinSimilarityError,
  effectiveSpinStrictness,
  evaluateSpinSimilarity,
  type SpinReference,
  type SpinSimilarityFailure,
  type SpinSimilarityResult,
  type SpinStructure,
} from "./similarity";

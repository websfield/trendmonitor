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
  CONTINUATION_SHAPE,
  EVENT_CONFIRMATION_ITEM,
  EVENT_SCAN_EXCLUDED,
  EVENT_SCAN_POPULATION,
  EVENT_SHAPES,
  SHOT_HELPER_SHAPES,
  SHOT_KIT_SHAPES,
  contentOverlap,
  contentWords,
  declaredCovers,
  eventScanTexts,
  eventShapeIn,
  excerptIsInMaterial,
  excerptRelatesTo,
  filmingItemDeclared,
  eventConfirmationFor,
  scanModeChecks,
  stampServerChecks,
  type CreativeCheckContext,
  type EventScanField,
  type EventShape,
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
  LEGACY_CONTRACT,
  ScriptOutputError,
  V2_SECTION_KEYS,
  assertUniversalSections,
  outputTextPointers,
  outputTextUnits,
  parseScriptOutput,
  readStoredScriptOutput,
  filmingSlots,
  renderDraft,
  sectionLabel,
  serverCheckedFields,
  type Beat,
  type Filming,
  type Hook,
  type Idea,
  type IdeaV2,
  type OutputContract,
  type Premise,
  type ScriptOutput,
  type ScriptOutputV1,
  type ScriptOutputV2,
  type ServerChecks,
  type V2SectionKey,
} from "./output";

// R-148 (launch L1): the creative form control and the declared filming
// limits — the closed vocabulary, the one wire parse, and its refusal.
export {
  CONSTRAINT_FIELDS,
  CONSTRAINT_ITEM_MAX_CODE_POINTS,
  CONSTRAINT_LIST_MAX,
  CREATIVE_FORMS,
  CREATIVE_FORM_MODES,
  CREATIVE_REQUEST_REFUSALS,
  CreativeRequestError,
  FILMING_MINUTES_MAX,
  FILMING_MINUTES_MIN,
  FILMING_PEOPLE,
  FOOTAGE_MAX_CODE_POINTS,
  FORM_CHOICES,
  FORM_CHOICE_LABELS,
  FORM_CHOICE_ORDER,
  PIVOT_FOR_FORM,
  PIVOT_KINDS,
  BASIS_EXCERPT_MIN_CONTENT_WORDS,
  BASIS_EXCERPT_MIN_WORDS,
  BASIS_RELATED_MIN_CONTENT_WORDS,
  EVENT_FIELDS,
  constraintTexts,
  parseCreativeRequest,
  takesCreativeForm,
  type ConstraintField,
  type CreativeForm,
  type CreativeRequest,
  type CreativeRequestInput,
  type CreativeRequestRefusal,
  type FilmingConstraints,
  type FilmingConstraintsInput,
  type FilmingPeople,
  type FormChoice,
  type PivotKind,
} from "./creative";

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
  ADMISSION_CLAIM_FIELDS,
  ADMISSION_HEDGE_PHRASES,
  CLAIM_HEDGE_ALLOWLIST,
  CLAIM_HEDGE_TAILS,
  NOT_PRESENTED_FIELD_PREFIXES,
  OUTPUT_CLAIM_SHAPES,
  claimFieldsFor,
  claimRefusesOn,
  claimRemedyFor,
  refusalIsClaimOnly,
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
  // Audit Phase 8 (P8-R2/P8-A4): the untrusted-input fences, their encoding,
  // and the universal laws, all hashed into the bundle.
  DRAFT_FENCE_CLOSE,
  DRAFT_FENCE_OPEN,
  INPUT_FENCE_CLOSE,
  INPUT_FENCE_OPEN,
  KILL_TEST_DRAFT_FENCE_OPEN,
  UNIVERSAL_LAWS,
  encodeUntrusted,
  neutraliseFenceMarkers,
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
  // R-148: the creative block's statics (hashed into a v2 bundle) and the
  // three derivations every reader of a v2 context shares.
  AUTO_FORM_INSTRUCTION,
  CONSTRAINT_LABELS,
  CREATIVE_BLOCK_HEADER,
  CREATIVE_RULES,
  FORM_INSTRUCTIONS,
  FORM_REQUESTED_NOTE,
  NO_CONSTRAINTS_LINE,
  PEOPLE_LABELS,
  // Launch L3 (R-152): the recent-work block's statics and its closed label
  // set. `packages/credits` maps its stored facts onto the labels; the words
  // each one renders as are this package's, hashed into the bundle.
  RECENT_WORK_AVOID_NOTE,
  RECENT_WORK_BLOCK_HEADER,
  RECENT_WORK_BLOCK_NOTE,
  RECENT_WORK_EMPTY,
  RECENT_WORK_LABEL_IDS,
  RECENT_WORK_LABELS,
  RECENT_WORK_NOTE_PREFIX,
  RECENT_WORK_SEQUEL_NOTE,
  type RecentWorkContext,
  type RecentWorkEntry,
  type RecentWorkLabel,
  assembleGenerationPrompt,
  assembleRewritePrompt,
  basisCorpusFor,
  contractOf,
  creativeCheckContextFor,
  outputContractFor,
  traceabilityCorpusFor,
  type CreativeContext,
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
  // Phase 10a: the public Sample Spin validates its checked-in gate projection
  // at fixture load with the gate's own assertion, before any vendor call.
  assertTrustedReference,
  effectiveSpinStrictness,
  evaluateSpinSimilarity,
  type SpinReference,
  type SpinSimilarityFailure,
  type SpinSimilarityResult,
  type SpinStructure,
} from "./similarity";

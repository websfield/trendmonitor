import type { RightsScope } from "./access";

export const AUTOPSY_STAGES = ["hook_mechanic", "beats", "ending", "follow_trigger"] as const;
export type AutopsyStage = (typeof AUTOPSY_STAGES)[number];
export type AutopsyInput = Readonly<{ transcript: string; contentDigest: string; analysisVersion: string; rightsScope: RightsScope; profileId: string }>;
export type HookMechanicStageResult = Readonly<{ stage: "hook_mechanic"; hookMechanic: string; subjectTerms: readonly string[]; hook: string }>;
export type BeatsStageResult = Readonly<{ stage: "beats"; beats: readonly string[]; beatCount: number; turnBeat: number | null }>;
export type EndingStageResult = Readonly<{ stage: "ending"; ending: string }>;
export type FollowTriggerStageResult = Readonly<{ stage: "follow_trigger"; followTrigger: string }>;
export type AutopsyStageResult = HookMechanicStageResult | BeatsStageResult | EndingStageResult | FollowTriggerStageResult;

/** One cache/persistence/Spin contract: four displays plus similarity references. */
export type AutopsyAnalysis = Readonly<{
  hookMechanic: string;
  beats: readonly string[];
  ending: string;
  followTrigger: string;
  subjectTerms: readonly string[];
  /** Original creator hook wording; the Spin similarity reference. */
  hook: string;
  structure: Readonly<{ beatCount: number; turnBeat: number | null }>;
}>;

/** Backwards-compatible cache-port name; its shape is the canonical analysis. */
export type Autopsy = AutopsyAnalysis;
export type AutopsyModelPort = { analyse(stage: AutopsyStage, transcript: string): Promise<AutopsyStageResult> };
export class AutopsyAnalysisError extends Error {}

export const AUTOPSY_MAX_STAGE_TEXT_CHARS = 4_000;
const MAX_STAGE_TEXT_CHARS = AUTOPSY_MAX_STAGE_TEXT_CHARS;
// EXPORTED SO THE CONSUMER'S BOUNDS CAN BE COMPARED TO THEM BY A TEST.
//
// These four are what this package promises the rest of the product about an
// autopsy's shape, and `packages/modes`' Spin gate is the thing that has to
// accept it. Those two sets disagreed on all four values until 2026-09-04,
// which made a spin of a real autopsy impossible; neither package can import
// the other, so `respin/tests/spin-reference-bounds.test.ts` is the only place
// the agreement can be checked, and it imports these.
export const AUTOPSY_MAX_HOOK_CHARS = 800;
export const AUTOPSY_MAX_SUBJECT_TERMS = 20;
export const AUTOPSY_MAX_SUBJECT_TERM_CHARS = 120;
export const AUTOPSY_MAX_BEATS = 50;
const MAX_HOOK_CHARS = AUTOPSY_MAX_HOOK_CHARS;
const MAX_SUBJECT_TERMS = AUTOPSY_MAX_SUBJECT_TERMS;
const MAX_SUBJECT_TERM_CHARS = AUTOPSY_MAX_SUBJECT_TERM_CHARS;
const MAX_BEATS = AUTOPSY_MAX_BEATS;

function assertText(value: unknown, field: string, max: number): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) throw new AutopsyAnalysisError(`${field} must be non-empty and at most ${max} characters`);
}

function assertSubjectTerms(value: unknown): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SUBJECT_TERMS) throw new AutopsyAnalysisError(`subjectTerms must contain 1-${MAX_SUBJECT_TERMS} terms`);
  for (const term of value) assertText(term, "subjectTerms entry", MAX_SUBJECT_TERM_CHARS);
}

function assertBeats(value: unknown): asserts value is readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BEATS) throw new AutopsyAnalysisError(`beats must contain 1-${MAX_BEATS} entries`);
  for (const beat of value) assertText(beat, "beats entry", MAX_STAGE_TEXT_CHARS);
}

export function validateAutopsyStage(stage: "hook_mechanic", result: AutopsyStageResult): HookMechanicStageResult;
export function validateAutopsyStage(stage: "beats", result: AutopsyStageResult): BeatsStageResult;
export function validateAutopsyStage(stage: "ending", result: AutopsyStageResult): EndingStageResult;
export function validateAutopsyStage(stage: "follow_trigger", result: AutopsyStageResult): FollowTriggerStageResult;
export function validateAutopsyStage(stage: AutopsyStage, result: AutopsyStageResult): AutopsyStageResult {
  if (result.stage !== stage) throw new AutopsyAnalysisError(`Expected ${stage} stage result`);
  switch (result.stage) {
    case "hook_mechanic":
      assertText(result.hookMechanic, "hookMechanic", MAX_STAGE_TEXT_CHARS);
      assertSubjectTerms(result.subjectTerms);
      assertText(result.hook, "hook", MAX_HOOK_CHARS);
      return result;
    case "beats":
      assertBeats(result.beats);
      if (!Number.isSafeInteger(result.beatCount) || result.beatCount !== result.beats.length) throw new AutopsyAnalysisError("beatCount must exactly match the bounded beats array");
      if (result.turnBeat !== null && (!Number.isSafeInteger(result.turnBeat) || result.turnBeat < 0 || result.turnBeat >= result.beatCount)) throw new AutopsyAnalysisError("turnBeat must be null or a zero-based beat index");
      return result;
    case "ending":
      assertText(result.ending, "ending", MAX_STAGE_TEXT_CHARS);
      return result;
    case "follow_trigger":
      assertText(result.followTrigger, "followTrigger", MAX_STAGE_TEXT_CHARS);
      return result;
  }
}

/** Validate a persisted/cache payload before it can reach a caller or Spin. */
export function validateAutopsyAnalysis(value: unknown): AutopsyAnalysis {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AutopsyAnalysisError("Autopsy analysis must be an object");
  const record = value as Record<string, unknown>;
  const structure = record.structure;
  if (!structure || typeof structure !== "object" || Array.isArray(structure)) throw new AutopsyAnalysisError("Autopsy analysis structure is missing");
  const structureRecord = structure as Record<string, unknown>;
  const hookMechanic = validateAutopsyStage("hook_mechanic", {
    stage: "hook_mechanic",
    hookMechanic: record.hookMechanic,
    subjectTerms: record.subjectTerms,
    hook: record.hook,
  } as HookMechanicStageResult);
  const beats = validateAutopsyStage("beats", {
    stage: "beats",
    beats: record.beats,
    beatCount: structureRecord.beatCount,
    turnBeat: structureRecord.turnBeat,
  } as BeatsStageResult);
  const ending = validateAutopsyStage("ending", { stage: "ending", ending: record.ending } as EndingStageResult);
  const followTrigger = validateAutopsyStage("follow_trigger", { stage: "follow_trigger", followTrigger: record.followTrigger } as FollowTriggerStageResult);
  return {
    hookMechanic: hookMechanic.hookMechanic,
    beats: beats.beats,
    ending: ending.ending,
    followTrigger: followTrigger.followTrigger,
    subjectTerms: hookMechanic.subjectTerms,
    hook: hookMechanic.hook,
    structure: { beatCount: beats.beatCount, turnBeat: beats.turnBeat },
  };
}

/** Atomic storage must execute create once per key; get/put can duplicate spend. */
export type AutopsyStorePort = { getOrCreate(key: string, create: () => Promise<AutopsyAnalysis>): Promise<AutopsyAnalysis> };

export function cacheKeyFor(input: AutopsyInput): string {
  const scopeIdentity = input.rightsScope === "profile_private" ? `:${input.profileId}` : "";
  return `${input.contentDigest}:${input.analysisVersion}:${input.rightsScope}${scopeIdentity}`;
}

/** The one fixed-order analysis implementation used by foreground and worker adapters. */
export async function analyseAutopsyStages(
  transcript: string,
  model: AutopsyModelPort,
): Promise<AutopsyAnalysis> {
  const hookMechanic = validateAutopsyStage(
    "hook_mechanic",
    await model.analyse("hook_mechanic", transcript),
  );
  const beats = validateAutopsyStage("beats", await model.analyse("beats", transcript));
  const ending = validateAutopsyStage("ending", await model.analyse("ending", transcript));
  const followTrigger = validateAutopsyStage(
    "follow_trigger",
    await model.analyse("follow_trigger", transcript),
  );
  return validateAutopsyAnalysis({
    hookMechanic: hookMechanic.hookMechanic,
    beats: beats.beats,
    ending: ending.ending,
    followTrigger: followTrigger.followTrigger,
    subjectTerms: hookMechanic.subjectTerms,
    hook: hookMechanic.hook,
    structure: { beatCount: beats.beatCount, turnBeat: beats.turnBeat },
  });
}

export async function autopsy(input: AutopsyInput, model: AutopsyModelPort, store: AutopsyStorePort): Promise<AutopsyAnalysis> {
  const key = cacheKeyFor(input);
  const result = await store.getOrCreate(key, () => analyseAutopsyStages(input.transcript, model));
  return validateAutopsyAnalysis(result);
}

// Phase 10a plan C2/C3/C4: the sessionless public Sample Spin orchestrator.
//
// ONE LOGICAL ATTEMPT, IN THIS ORDER:
//   1. the idea is parsed as untrusted data (`idea.ts`) — a refusal here
//      consumes nothing and reserves nothing;
//   2. the prompt is assembled from the fixture and DETERMINISTICALLY bounded
//      before any outbound work (R-123's input/output token caps);
//   3. the DB-atomic limiter admits the request and reserves the exact
//      three-call worst case under the purpose and global caps, in ONE
//      transaction (`admitPublicSampleSpin`);
//   4. the production `runGeneration` runs `analyseAndSpin` with the fixture's
//      two trusted projections, the active similarity strictness and the same
//      kill test, hard rules, traceability, text units and gate functions a
//      creator's generation uses; one rewrite is allowed and a second failure
//      is a typed, content-free refusal;
//   5. every HTTP attempt is counted and priced; a fourth call or a hidden
//      retry is an invariant failure; the attempt's cost/outcome fact is
//      appended exactly once, measured or unknown, never zero.
//
// WHAT NEVER LEAVES THIS MODULE: a failed draft (not in the response, not in
// the usage row, not in an error, not in an event), the idea, the prompt, or
// any tenant identity — there is none; this module mints no session, no
// WorkspaceScope, no ProfileScope and touches no ledger row.
import {
  admitPublicSampleSpin,
  reconcileSystemModelUsage,
  recordPublicSampleSpinOutcome,
  recordSystemModelUsage,
  systemModelUsage,
  PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS,
  PUBLIC_SAMPLE_SPIN_VENDOR_CALLS_MAX,
  type DbLike,
  type PublicSampleSpinKeyring,
} from "@respin/db";
import { eq } from "drizzle-orm";
import type { RespinConfigV1 } from "@respin/config";
import {
  LlmError,
  LlmTruncatedError,
  ModelPriceUnknownError,
  costMicroUsd,
  priceFor,
  type AssembledPrompt,
  type LlmProvider,
} from "@respin/llm";
import {
  GenerationAssemblyError,
  KillTestError,
  ScriptOutputError,
  SpinSimilarityError,
  assembleGenerationPrompt,
  runGeneration,
  type GenerationRun,
} from "@respin/modes";
import { withDeadline } from "../inference";
import { presentedTextUnits, type PresentedDisclosure } from "../presented-output";
import { loadSampleSpinFixture, sampleSpinContext, type SampleSpinFixture } from "./fixture";
import { parseSampleSpinIdea, type SampleSpinIdea, type Untrusted } from "./idea";

// ------------------------------------------------------------ R-123 bounds
//
// EXACT, COMPILED, and the reservation formula is written once here and
// pinned by `sample-spin-spend.test.ts` at the recorded launch prices
// ($0.61856). Runtime config may only tighten `maxOutputTokens`; it cannot
// raise a cap below.
export const SAMPLE_SPIN_DRAFT_MAX_INPUT_TOKENS = 40_000;
export const SAMPLE_SPIN_DRAFT_MAX_OUTPUT_TOKENS = 12_000;
export const SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS = 16_000;
export const SAMPLE_SPIN_SCORE_MAX_OUTPUT_TOKENS = 512;
/** Two drafts plus one scoring call, whatever is actually reached. */
export const SAMPLE_SPIN_DRAFT_CALLS_RESERVED = 2;

/**
 * A DETERMINISTIC UPPER BOUND on the vendor's token count: the UTF-8 byte
 * length. Every tokeniser this product could meet emits at most one token per
 * byte, so a prompt under the byte cap is under the token cap; the bound
 * over-counts, never under. It needs no vendor tokeniser and cannot drift
 * with one. Stated as the limitation it is: a prompt could be refused that a
 * real tokeniser would admit.
 */
export function tokenUpperBound(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/**
 * The one shared deadline: the config value, CLAMPED to R-123's compiled 120 s
 * ceiling. Config may only tighten it, because the in-flight lease is derived
 * from the ceiling (billing gate, round 1: a 300 s config outran the lease).
 */
export function sampleSpinDeadlineMs(content: RespinConfigV1): number {
  return Math.min(content.llm.overallDeadlineMs, PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS);
}

/** The exact active-price worst case for all three calls, in micro-USD. */
export function sampleSpinReservationMicroUsd(content: RespinConfigV1): bigint {
  const draft = priceFor(content.llm.prices, content.llm.models.generation);
  const score = priceFor(content.llm.prices, content.llm.models.classification);
  return (
    BigInt(SAMPLE_SPIN_DRAFT_CALLS_RESERVED) *
      costMicroUsd(draft, SAMPLE_SPIN_DRAFT_MAX_INPUT_TOKENS, SAMPLE_SPIN_DRAFT_MAX_OUTPUT_TOKENS) +
    costMicroUsd(score, SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS, SAMPLE_SPIN_SCORE_MAX_OUTPUT_TOKENS)
  );
}

// ------------------------------------------------------------ the contract

export type SampleSpinRefusalReason =
  | "idea_invalid"
  | "bucket_exhausted"
  | "concurrency_exhausted"
  | "budget_exhausted"
  | "prompt_too_large"
  | "gate_refused"
  /** The vendor answered but no usable, checkable draft came back (unparseable reply, scoring reply, or a draft past its scoring bound). */
  | "draft_unusable"
  | "in_progress"
  | "already_completed"
  /** The vendor did NOT answer (unavailable, rate limited, refused, timed out). Never used for an outcome where it did. */
  | "service_unavailable"
  /** The attempt ended for a reason that is neither the vendor's answer nor its absence (a failed write, an unclassified error). Names no cause. */
  | "could_not_complete";

/** The stable next step for each refusal. Static text; nothing from the run. */
export const SAMPLE_SPIN_NEXT_ACTION: Readonly<Record<SampleSpinRefusalReason, string>> = {
  idea_invalid: "Type an idea of up to six hundred characters and try again.",
  bucket_exhausted: "This connection has used its one Sample Spin for today. Start free to keep going with your own brain.",
  concurrency_exhausted: "Two Sample Spins are running right now. Try again in a minute.",
  budget_exhausted: "The Sample Spin has spent today's budget. Try again tomorrow, or start free.",
  prompt_too_large: "Shorten the idea and try again.",
  // THE SIX BELOW ARE POST-ADMISSION, AND THAT IS WHY NONE OF THEM SAYS "TRY
  // AGAIN". Measured against the order in `runPublicSampleSpin` (2026-09-20):
  // `idea_invalid` and `prompt_too_large` are refused at :230-249, BEFORE
  // `admitPublicSampleSpin` at :258, so their remedies are real. Everything
  // from here on happens after the window opened — and a window is opened with
  // its one admission already spent (`packages/db/src/public-sample-spin.ts`,
  // `admitted: 1` on insert), so this connection has no second run for 24
  // hours. A remedy the limiter refuses is the outage (CLAUDE.md, 2026-07-30:
  // never make a refusal fatal without a way forward), so each one names the
  // way forward that exists: an account.
  gate_refused: "Both drafts were withheld: one failed a hard rule or stayed too close to the reference. That was this connection's one Sample Spin for today. Start free to try another idea with your own brain.",
  draft_unusable: "A draft came back that could not be checked, so nothing was shown. Nothing you typed was kept, and this connection's one Sample Spin for today is spent. Start free to keep going.",
  in_progress: "This request is still running. Wait for it to finish.",
  already_completed: "This request already finished, and it was this connection's one Sample Spin for today. Start free to run another.",
  service_unavailable: "The model provider did not answer. Nothing you typed was kept, and this connection's one Sample Spin for today is spent — come back tomorrow, or start free now.",
  could_not_complete: "This request could not complete. Nothing you typed was kept, and this connection's one Sample Spin for today is spent — come back tomorrow, or start free now.",
};

export type SampleSpinAccepted = Readonly<{
  status: "accepted";
  requestId: string;
  original: SampleSpinFixture["original"];
  /** Every creator-facing unit of the accepted Spin: the gate's inputs minus the model-authored disclosure (ignored, R-121) and the weakest point, which travels once on its own field. */
  spin: readonly Readonly<{ field: string; text: string }>[];
  weakestPoint: string;
  /** Fixture rule ids the gate evidence says the accepted draft satisfied, with their text. */
  highlightedRules: readonly Readonly<{ id: string; text: string }>[];
  /** Deterministic and neutral until 10c's dated platform registry replaces it. */
  disclosure: PresentedDisclosure;
  versions: Readonly<{ fixture: string; promptBundle: string; model: string; configVersion: number }>;
  rewritten: boolean;
}>;

export type SampleSpinRefused = Readonly<{
  status: "refused";
  requestId: string;
  reason: SampleSpinRefusalReason;
  nextAction: string;
}>;

export type SampleSpinResponse = SampleSpinAccepted | SampleSpinRefused;

export type SampleSpinDeps = Readonly<{
  db: DbLike;
  /**
   * Built by the facade with `maxRetries: 0` and the config timeout. A retry
   * inside the SDK would be a hidden HTTP attempt this module could not count,
   * so the facade's construction is the invariant and `sample-spin-facade.test.ts`
   * pins it.
   */
  provider: LlmProvider;
  content: RespinConfigV1;
  configVersion: number;
  keyring: PublicSampleSpinKeyring;
  now: () => Date;
}>;

export type SampleSpinInput = Readonly<{
  /** The caller's idempotency id (a UUID); the claim's `jobId`. */
  requestId: string;
  canonicalIp: string | null;
  body: unknown;
}>;

/**
 * A rewrite or scoring prompt that crosses its byte bound AFTER the first
 * call: the draft the vendor returned decided it, so it is an unusable draft
 * (`analysis_invalid` / `draft_too_large`, the visitor's `draft_unusable`),
 * not an invariant failure.
 */
export class SampleSpinBoundError extends Error {
  constructor(message: string) {
    super(`sample spin bound: ${message}`);
    this.name = "SampleSpinBoundError";
  }
}

/** A fourth vendor call, or any call past the counted budget, is a broken invariant — never a retry. */
export class SampleSpinInvariantError extends Error {
  constructor(message: string) {
    super(`sample spin invariant: ${message}`);
    this.name = "SampleSpinInvariantError";
  }
}

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refused(requestId: string, reason: SampleSpinRefusalReason): SampleSpinRefused {
  return { status: "refused", requestId, reason, nextAction: SAMPLE_SPIN_NEXT_ACTION[reason] };
}

function utcBusinessDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** One HTTP attempt's metering fact; text never lives here. */
type CallFact = Readonly<{ model: string; tokensIn: number; tokensOut: number; costMicroUsd: bigint | null }>;

export async function runPublicSampleSpin(deps: SampleSpinDeps, input: SampleSpinInput): Promise<SampleSpinResponse> {
  const requestId = input.requestId;
  if (!REQUEST_ID.test(requestId)) return refused(requestId, "idea_invalid");
  let idea: Untrusted<SampleSpinIdea>;
  try {
    idea = parseSampleSpinIdea(input.body);
  } catch {
    return refused(requestId, "idea_invalid");
  }

  // 2. Assemble and bound BEFORE any money moves or any vendor is touched.
  const fixture = loadSampleSpinFixture();
  const context = sampleSpinContext(fixture, idea.idea);
  let draftPrompt: AssembledPrompt;
  try {
    draftPrompt = assembleGenerationPrompt({ mode: "analyseAndSpin", context });
  } catch (error) {
    if (error instanceof GenerationAssemblyError) return refused(requestId, "prompt_too_large");
    throw error;
  }
  if (tokenUpperBound(draftPrompt.system + draftPrompt.prompt) > SAMPLE_SPIN_DRAFT_MAX_INPUT_TOKENS) {
    return refused(requestId, "prompt_too_large");
  }
  const now = deps.now();
  const businessDate = utcBusinessDate(now);
  const generationModel = deps.content.llm.models.generation;
  const scoringModel = deps.content.llm.models.classification;
  const jobAttemptId = `sample:${requestId}`;

  // 3. Admission + reservation, atomically.
  const admission = await admitPublicSampleSpin(deps.db, {
    canonicalIp: input.canonicalIp,
    keyring: deps.keyring,
    now,
    claim: {
      jobAttemptId,
      businessDate,
      capMicroUsd: BigInt(deps.content.systemAutopsy.dailyCapMicroUsd),
      reserveMicroUsd: sampleSpinReservationMicroUsd(deps.content),
      attribution: { purpose: "public_sample_spin", jobId: requestId, model: generationModel },
      purposeCapMicroUsd: BigInt(deps.content.publicSampleSpin.dailyCapMicroUsd),
    },
  });
  if (admission.status === "duplicate") {
    return replay(deps, requestId, jobAttemptId, admission.bucketId, admission.claimStatus, now);
  }
  if (admission.status !== "admitted") return refused(requestId, admission.status);

  // 4./5. The vendor sequence, counted per HTTP attempt under one deadline.
  const deadline = AbortSignal.timeout(sampleSpinDeadlineMs(deps.content));
  const facts: CallFact[] = [];
  const draftOutputCap = Math.min(deps.content.llm.maxOutputTokens, SAMPLE_SPIN_DRAFT_MAX_OUTPUT_TOKENS);
  const metered = async (prompt: AssembledPrompt, model: string, maxInput: number, maxOutput: number): Promise<string> => {
    if (facts.length >= PUBLIC_SAMPLE_SPIN_VENDOR_CALLS_MAX) {
      throw new SampleSpinInvariantError(`a ${PUBLIC_SAMPLE_SPIN_VENDOR_CALLS_MAX + 1}th vendor call was requested`);
    }
    if (tokenUpperBound(prompt.system + prompt.prompt) > maxInput) {
      throw new SampleSpinBoundError("a later prompt exceeded its input bound");
    }
    const price = priceFor(deps.content.llm.prices, model);
    // The fact is appended BEFORE the call resolves, as an unknown; a
    // throw between here and the vendor's reply leaves it unknown, which is
    // the conservative record (R-117). It is replaced by the measured fact on
    // any reply that carries usage.
    const index = facts.push({ model, tokensIn: 0, tokensOut: 0, costMicroUsd: null }) - 1;
    try {
      const result = await withDeadline(
        deps.provider.complete({ attemptId: `${jobAttemptId}:${index + 1}`, model, system: prompt.system, prompt: prompt.prompt, maxOutputTokens: maxOutput, signal: deadline }),
        deadline,
      );
      // PRICED FROM THE SERVED MODEL. An alias with no price row is an UNKNOWN
      // cost with the vendor's tokens retained — never a discarded fact and
      // never a refused visitor (billing gate, round 1); the tenant path does
      // the same (`inference.ts`).
      let cost: bigint | null = null;
      try {
        cost = costMicroUsd(priceFor(deps.content.llm.prices, result.servedModel), result.usage.tokensIn, result.usage.tokensOut);
      } catch (error) {
        if (!(error instanceof ModelPriceUnknownError)) throw error;
      }
      facts[index] = {
        model: result.servedModel,
        tokensIn: result.usage.tokensIn,
        tokensOut: result.usage.tokensOut,
        costMicroUsd: cost,
      };
      return result.text;
    } catch (error) {
      // A truncated reply carries no served model, so it is priced at the
      // REQUESTED one — the best available fact (billing round 2, noted).
      if (error instanceof LlmTruncatedError && error.usage) {
        facts[index] = {
          model,
          tokensIn: error.usage.tokensIn,
          tokensOut: error.usage.tokensOut,
          costMicroUsd: costMicroUsd(price, error.usage.tokensIn, error.usage.tokensOut),
        };
      }
      throw error;
    }
  };

  let run: GenerationRun | null = null;
  let failure: { outcome: "vendor_failed" | "analysis_invalid"; errorCode: string } | null = null;
  try {
    run = await runGeneration({
      mode: "analyseAndSpin",
      context,
      creatorRules: fixture.creatorRules,
      spinSimilarity: { reference: fixture.gate, configuredStrictness: deps.content.similarity.strictness },
      generate: (prompt) => metered(prompt, generationModel, SAMPLE_SPIN_DRAFT_MAX_INPUT_TOKENS, draftOutputCap),
      scoreCreatorRules: (prompt) => metered(prompt, scoringModel, SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS, SAMPLE_SPIN_SCORE_MAX_OUTPUT_TOKENS),
    });
  } catch (error) {
    failure = classifyFailure(error);
    if (failure === null) {
      await finalise(deps, { jobAttemptId, requestId, businessDate, generationModel, facts, outcome: "vendor_failed", errorCode: "invariant_failed" });
      await recordPublicSampleSpinOutcome(deps.db, admission.bucketId, "refused", deps.now());
      throw error;
    }
  }

  if (run === null) {
    await finalise(deps, { jobAttemptId, requestId, businessDate, generationModel, facts, outcome: failure!.outcome, errorCode: failure!.errorCode });
    await recordPublicSampleSpinOutcome(deps.db, admission.bucketId, "refused", deps.now());
    // HONEST REFUSAL (lean gate round 1, C-1): "the provider did not answer"
    // only when it did not; a reply that could not be used is said as that.
    return refused(requestId, refusalFor(failure!.outcome, failure!.errorCode));
  }
  if (run.status === "refused") {
    // Two drafts, both withheld. The refusal is the pipeline's own honest
    // refusal shape, but NOTHING of it is returned: its `why` lines quote the
    // findings' excerpts, and an excerpt is candidate text.
    await finalise(deps, { jobAttemptId, requestId, businessDate, generationModel, facts, outcome: "analysis_invalid", errorCode: "gate_refused" });
    await recordPublicSampleSpinOutcome(deps.db, admission.bucketId, "refused", deps.now());
    return refused(requestId, "gate_refused");
  }

  await finalise(deps, { jobAttemptId, requestId, businessDate, generationModel, facts, outcome: "succeeded", errorCode: null });
  const passed = new Set(run.killTest.creatorRuleVerdicts.filter((v) => v.passed).map((v) => v.ruleId));
  return {
    status: "accepted",
    requestId,
    original: fixture.original,
    // ONE SUBSTITUTION, NOT TWO (P1-R1). The `/disclosure/*` filter this line
    // used to carry is now `presentedTextUnits`, which the product surfaces
    // consume as well — a rule spelled once in one presenter is a rule the next
    // presenter does not have, and that is exactly how `/studio` and `/trends`
    // came to render the model's guidance. The weakest point is dropped HERE
    // and not there: it travels once on its own field of this response shape,
    // which is a property of this response rather than of the disclosure rule.
    spin: presentedTextUnits(run.output).filter(
      (unit) => unit.field !== "/whyThisPerforms/weakestPoint"
    ),
    weakestPoint: run.output.whyThisPerforms.weakestPoint,
    highlightedRules: fixture.creatorRules
      .filter((rule) => passed.has(rule.id))
      .map((rule) => ({ id: rule.id, text: rule.text })),
    disclosure: { kind: "policy_check_required" },
    versions: {
      fixture: fixture.version,
      promptBundle: run.promptBundleVersion,
      model: generationModel,
      configVersion: deps.configVersion,
    },
    rewritten: run.killTest.rewritten,
  };
}

/**
 * A replayed request id: the money fact decides the answer. No output is ever
 * stored (the endpoint keeps neither idea nor output), so a completed replay
 * cannot return the draft again; it returns a terminal, content-free refusal
 * that names what happened, and never a new vendor sequence.
 */
async function replay(
  deps: SampleSpinDeps,
  requestId: string,
  jobAttemptId: string,
  bucketId: string | null,
  claimStatus: "reserved" | "cap_exhausted",
  now: Date,
): Promise<SampleSpinRefused> {
  if (bucketId) await recordPublicSampleSpinOutcome(deps.db, bucketId, "duplicate", now);
  // A budget-refused id was never in flight (lean gate round 1, R-2).
  if (claimStatus === "cap_exhausted") return refused(requestId, "budget_exhausted");
  const [usage] = await deps.db
    .select({ outcome: systemModelUsage.outcome, errorCode: systemModelUsage.errorCode })
    .from(systemModelUsage)
    .where(eq(systemModelUsage.jobAttemptId, jobAttemptId))
    .limit(1);
  if (!usage) return refused(requestId, "in_progress");
  if (usage.outcome === "succeeded") return refused(requestId, "already_completed");
  if (usage.errorCode === "gate_refused") return refused(requestId, "gate_refused");
  return refused(requestId, refusalFor(usage.outcome, usage.errorCode));
}

/**
 * HONEST REFUSAL (lean gate rounds 1 and 2): the vendor is blamed only for its
 * own absence (`vendor_*`); a reply that could not be used is said as that;
 * anything else — a failed finalise recovered unknown, an unclassified error
 * — names no cause it cannot know.
 */
function refusalFor(outcome: string, errorCode: string | null): SampleSpinRefusalReason {
  if (outcome === "analysis_invalid") return "draft_unusable";
  if (errorCode?.startsWith("vendor_")) return "service_unavailable";
  return "could_not_complete";
}

function classifyFailure(error: unknown): { outcome: "vendor_failed" | "analysis_invalid"; errorCode: string } | null {
  if (error instanceof SampleSpinInvariantError) return null;
  if (error instanceof SampleSpinBoundError) return { outcome: "analysis_invalid", errorCode: "draft_too_large" };
  // The vendor DID answer: a cut-off draft is unusable, not an outage (its usage is kept above).
  if (error instanceof LlmTruncatedError) return { outcome: "analysis_invalid", errorCode: "reply_truncated" };
  if (error instanceof LlmError) return { outcome: "vendor_failed", errorCode: `vendor_${error.outcome}` };
  if (error instanceof ScriptOutputError) return { outcome: "analysis_invalid", errorCode: "reply_unparseable" };
  if (error instanceof KillTestError) return { outcome: "analysis_invalid", errorCode: "scoring_unparseable" };
  if (error instanceof SpinSimilarityError) return { outcome: "analysis_invalid", errorCode: "reference_refused" };
  if (error instanceof GenerationAssemblyError) return { outcome: "analysis_invalid", errorCode: "assembly_refused" };
  return { outcome: "vendor_failed", errorCode: "unclassified_failure" };
}

/**
 * The one append of the attempt's cost/outcome fact. Measured only when every
 * counted call reported usage; otherwise unknown with the exact number of
 * unreported calls, and never a zero (R-117).
 */
async function finalise(
  deps: SampleSpinDeps,
  args: Readonly<{
    jobAttemptId: string;
    requestId: string;
    businessDate: string;
    generationModel: string;
    facts: readonly CallFact[];
    outcome: "succeeded" | "vendor_failed" | "analysis_invalid";
    errorCode: string | null;
  }>,
): Promise<void> {
  const unknown = args.facts.filter((fact) => fact.costMicroUsd === null).length;
  const measured = unknown === 0;
  const tokensIn = args.facts.reduce((sum, fact) => sum + fact.tokensIn, 0);
  const tokensOut = args.facts.reduce((sum, fact) => sum + fact.tokensOut, 0);
  const cost = measured ? args.facts.reduce((sum, fact) => sum + fact.costMicroUsd!, 0n) : null;
  // THE RACE WITH RECOVERY (billing gate, round 1): if the retention tick
  // already booked this attempt unknown / recovery_required while the vendor
  // was answering, the late measured fact RECONCILES that row (one durable
  // adjustment, the same path an autopsy uses) instead of throwing at it; an
  // unknown late fact has nothing to add and is dropped without a throw.
  const [existing] = await deps.db
    .select({ errorCode: systemModelUsage.errorCode, costState: systemModelUsage.costState })
    .from(systemModelUsage)
    .where(eq(systemModelUsage.jobAttemptId, args.jobAttemptId))
    .limit(1);
  if (existing) {
    if (existing.errorCode === "recovery_required" && existing.costState === "unknown" && cost !== null) {
      await reconcileSystemModelUsage(deps.db, { jobAttemptId: args.jobAttemptId, businessDate: args.businessDate, actualCostMicroUsd: cost });
    }
    return;
  }
  await recordSystemModelUsage(deps.db, {
    jobAttemptId: args.jobAttemptId,
    jobId: args.requestId,
    trendItemId: null,
    purpose: "public_sample_spin",
    // The claim names the generation model; a served alias is priced from the
    // served model above and the difference is in the cost fact, not here.
    model: args.generationModel,
    // The vendor's token counts are kept even when a price is unknown (R-117:
    // unknown is a cost state, not a lost fact).
    tokensIn,
    tokensOut,
    costMicroUsd: cost,
    costState: measured ? "measured" : "unknown",
    outcome: args.outcome,
    callCount: args.facts.length,
    unknownCallCount: unknown,
    errorCode: args.errorCode,
    businessDate: args.businessDate,
  });
}


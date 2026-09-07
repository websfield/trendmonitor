import {
  analyseAutopsyStages,
  AUTOPSY_STAGES,
  AutopsyAnalysisError,
  type AutopsyAnalysis,
  type AutopsyStage,
  type AutopsyStageResult,
} from "@respin/trends";
import {
  assertAutopsyFrameworkCandidate,
  assertAutopsyMechanismContent,
  AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
  FrameworkContentError,
  FrameworkLimitError,
  SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD as DB_SYSTEM_DAILY_CODE_CEILING_MICRO_USD,
} from "@respin/db";
import { strictCalendarDate } from "./calendar-date";

const numericDailyCodeCeiling = Number(DB_SYSTEM_DAILY_CODE_CEILING_MICRO_USD);
if (!Number.isSafeInteger(numericDailyCodeCeiling) || numericDailyCodeCeiling < 0) {
  throw new Error("system autopsy DB code ceiling must fit a non-negative safe integer");
}
export const SYSTEM_DAILY_BUDGET_CODE_CEILING_MICRO_USD = numericDailyCodeCeiling;
if (AUTOPSY_VENDOR_CALLS_PER_ATTEMPT !== AUTOPSY_STAGES.length) {
  throw new Error("system usage call ceiling drifted from the fixed autopsy stage list");
}

export interface SystemAutopsyCommand {
  readonly jobId: string;
  readonly itemId: string;
  readonly attemptId: string;
  readonly autopsyCacheClaimId: string;
  readonly businessDate: string;
  readonly modelCode: string;
  readonly maxCostMicroUsd: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly configuredDailyCapMicroUsd: number;
}

export type SystemAttemptOutcome =
  | "succeeded"
  | "vendor_failed"
  | "budget_exhausted"
  | "reservation_overrun"
  | "vendor_limit_overrun"
  | "analysis_invalid";

export interface SystemAttemptRecord {
  readonly jobId: string;
  readonly itemId: string;
  readonly attemptId: string;
  readonly purpose: "trend_autopsy";
  readonly modelCode: string;
  readonly businessDate: string;
  readonly outcome: SystemAttemptOutcome;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly costMicroUsd: number | null;
  readonly reservedCostMicroUsd: number;
  readonly reservationOverrunMicroUsd: number | null;
  readonly costState: "measured" | "unknown";
  readonly callCount: number;
  readonly unknownCallCount: number;
  readonly errorCode?: string;
}

export type AttemptClaim =
  | {
      readonly status: "granted";
      readonly dailySpentMicroUsd: number;
      readonly dailyCapMicroUsd: number;
      readonly reservedCostMicroUsd: number;
      readonly transcript: string;
      readonly contentDigest: string;
      /**
       * Whether THIS attempt's analysis can become a shared-library proposal
       * (R-99). Derived by the adapter inside the same transaction that locked
       * the claim; it is a boolean, never the rights scope and never an owner,
       * so the worker stays sessionless. See the preflight below for what it
       * decides and — more importantly — what it does NOT decide.
       */
      readonly proposesSharedFramework: boolean;
    }
  | {
      readonly status: "budget_exhausted";
      readonly dailySpentMicroUsd: number;
      readonly dailyCapMicroUsd: number;
      readonly reservedCostMicroUsd: 0;
    }
  | { readonly status: "already_finalized"; readonly record: SystemAttemptRecord }
  | { readonly status: "already_in_flight" };

export interface SystemUsagePort {
  /**
   * Atomically claims this attempt id and reserves its maximum cost against the
   * business-date system cap. The persistence adapter is the sole authority for
   * idempotency, budget arithmetic and stale in-flight recovery.
   */
  startAttempt(input: {
    readonly jobId: string;
    readonly itemId: string;
    readonly attemptId: string;
    readonly autopsyCacheClaimId: string;
    readonly purpose: "trend_autopsy";
    readonly businessDate: string;
    readonly modelCode: string;
    readonly reserveCostMicroUsd: number;
    readonly dailyCapMicroUsd: number;
  }): Promise<AttemptClaim>;

  /**
   * Append/finalize by unique attempt id. It MUST durably attribute measured
   * actual cost even when actual cost exceeds the reservation; an overrun is a
   * terminal recorded outcome, never a reason for the adapter to reject the
   * write. Never updates a tenant usage row.
   */
  finalizeAttempt(input: {
    readonly record: SystemAttemptRecord;
    /**
     * Kept separate from the content-free usage row. On successful attempts
     * the adapter must validate/cache this canonical analysis and finalize the
     * usage idempotently as one resumable completion operation.
     */
    readonly autopsy?: {
      readonly cacheClaimId: string;
      readonly analysis: AutopsyAnalysis;
    };
  }): Promise<"recorded" | "already_recorded">;
}

export type VendorAutopsyStageResult =
  | {
      readonly status: "succeeded";
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly costMicroUsd: number;
      readonly analysis: unknown;
    }
  | {
      readonly status: "failed";
      readonly errorCode: string;
      readonly inputTokens: number | null;
      readonly outputTokens: number | null;
      readonly costMicroUsd: number | null;
    };

export interface SystemVendorPort {
  /** The adapter must treat the stage-qualified attemptId as the paid-call idempotency key when supported. */
  analyseStage(input: {
    readonly jobId: string;
    readonly itemId: string;
    readonly attemptId: string;
    readonly stage: AutopsyStage;
    readonly transcript: string;
    readonly modelCode: string;
    readonly maxInputTokens: number;
    readonly maxOutputTokens: number;
    readonly costCeilingMicroUsd: number;
  }): Promise<VendorAutopsyStageResult>;
}

/**
 * A vendor bound to ONE attempt, resolved by the handler BEFORE
 * `runSystemAutopsyAttempt` calls `startAttempt`. Anything the vendor must
 * read to price or bound its calls (config prices, the per-stage deadline,
 * the output ceiling) is read here, once, and never again inside a stage —
 * so a refusal is a refusal before any reservation exists, and a document
 * that changes mid-attempt changes nothing about that attempt (billing gate
 * round 2, CHANGE 2).
 */
export type SystemVendorPortFactory = (
  command: SystemAutopsyCommand,
) => Promise<SystemVendorPort>;

export type SystemAutopsyRunResult =
  | { readonly status: "succeeded"; readonly attemptId: string }
  | { readonly status: "failed"; readonly attemptId: string; readonly errorCode: string }
  | { readonly status: "budget_exhausted"; readonly attemptId: string }
  | { readonly status: "already_finalized"; readonly record: SystemAttemptRecord }
  | { readonly status: "already_in_flight"; readonly attemptId: string };

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function required(value: string, label: string): string {
  const clean = value.trim();
  if (clean.length === 0) throw new Error(`${label} is required`);
  return clean;
}

const SAFE_OPERATIONAL_CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function operationalCode(value: string, label: string): string {
  const clean = value.trim();
  if (!SAFE_OPERATIONAL_CODE.test(clean)) {
    throw new Error(`${label} must be a bounded content-safe token`);
  }
  return clean;
}

export function resolveSystemDailyBudgetCap(configuredCapMicroUsd: number): number {
  return Math.min(
    nonNegativeInteger(configuredCapMicroUsd, "configuredDailyCapMicroUsd"),
    SYSTEM_DAILY_BUDGET_CODE_CEILING_MICRO_USD,
  );
}

function baseRecord(command: SystemAutopsyCommand): Pick<
  SystemAttemptRecord,
  "jobId" | "itemId" | "attemptId" | "purpose" | "modelCode" | "businessDate"
> {
  return {
    jobId: required(command.jobId, "jobId"),
    itemId: required(command.itemId, "itemId"),
    attemptId: required(command.attemptId, "attemptId"),
    purpose: "trend_autopsy",
    modelCode: required(command.modelCode, "modelCode"),
    businessDate: strictCalendarDate(command.businessDate, "businessDate"),
  };
}

export async function runSystemAutopsyAttempt(input: {
  readonly command: SystemAutopsyCommand;
  readonly usage: SystemUsagePort;
  readonly vendor: SystemVendorPort;
}): Promise<SystemAutopsyRunResult> {
  const base = baseRecord(input.command);
  const reserveCostMicroUsd = positiveInteger(input.command.maxCostMicroUsd, "maxCostMicroUsd");
  const dailyCapMicroUsd = resolveSystemDailyBudgetCap(
    input.command.configuredDailyCapMicroUsd,
  );
  const maxInputTokens = positiveInteger(input.command.maxInputTokens, "maxInputTokens");
  const maxOutputTokens = positiveInteger(input.command.maxOutputTokens, "maxOutputTokens");
  const claim = await input.usage.startAttempt({
    ...base,
    autopsyCacheClaimId: required(input.command.autopsyCacheClaimId, "autopsyCacheClaimId"),
    reserveCostMicroUsd,
    dailyCapMicroUsd,
  });

  if (claim.status === "already_finalized") {
    return { status: "already_finalized", record: claim.record };
  }
  if (claim.status === "already_in_flight") {
    return { status: "already_in_flight", attemptId: base.attemptId };
  }
  if (claim.status === "budget_exhausted") {
    await input.usage.finalizeAttempt({ record: {
      ...base,
      outcome: "budget_exhausted",
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      reservedCostMicroUsd: claim.reservedCostMicroUsd,
      reservationOverrunMicroUsd: 0,
      costState: "measured",
      callCount: 0,
      unknownCallCount: 0,
      errorCode: "system_budget_exhausted",
    } });
    return { status: "budget_exhausted", attemptId: base.attemptId };
  }

  const reservedCostMicroUsd = positiveInteger(
    claim.reservedCostMicroUsd,
    "claimed reservedCostMicroUsd",
  );
  required(claim.contentDigest, "claimed contentDigest");

  const metrics = {
    inputTokens: 0,
    outputTokens: 0,
    costMicroUsd: 0,
    inputTokensKnown: true,
    outputTokensKnown: true,
    costKnown: true,
    callCount: 0,
    unknownCallCount: 0,
  };

  class StageAttemptError extends Error {
    constructor(
      readonly outcome: Exclude<SystemAttemptOutcome, "succeeded" | "budget_exhausted" | "analysis_invalid">,
      readonly code: string,
    ) {
      super(code);
    }
  }

  const record = (
    outcome: SystemAttemptOutcome,
    errorCode?: string,
  ): SystemAttemptRecord => {
    const costMicroUsd = metrics.costKnown ? metrics.costMicroUsd : null;
    return {
      ...base,
      outcome,
      inputTokens: metrics.inputTokensKnown ? metrics.inputTokens : null,
      outputTokens: metrics.outputTokensKnown ? metrics.outputTokens : null,
      costMicroUsd,
      reservedCostMicroUsd,
      reservationOverrunMicroUsd: costMicroUsd === null
        ? null
        : Math.max(0, costMicroUsd - reservedCostMicroUsd),
      costState: metrics.costKnown ? "measured" : "unknown",
      callCount: metrics.callCount,
      unknownCallCount: metrics.unknownCallCount,
      ...(errorCode ? { errorCode } : {}),
    };
  };

  const runStage = async (
    stage: AutopsyStage,
    transcript: string,
  ): Promise<AutopsyStageResult> => {
    const remainingInputTokens = maxInputTokens - metrics.inputTokens;
    const remainingOutputTokens = maxOutputTokens - metrics.outputTokens;
    const remainingCostMicroUsd = reservedCostMicroUsd - metrics.costMicroUsd;
    if (remainingInputTokens <= 0 || remainingOutputTokens <= 0) {
      throw new StageAttemptError("vendor_limit_overrun", "vendor_token_limit_exhausted");
    }
    if (remainingCostMicroUsd <= 0) {
      throw new StageAttemptError("reservation_overrun", "vendor_cost_reservation_exhausted");
    }

    let result: VendorAutopsyStageResult;
    try {
      result = await input.vendor.analyseStage({
        jobId: base.jobId,
        itemId: base.itemId,
        attemptId: `${base.attemptId}:${stage}`,
        stage,
        transcript,
        modelCode: base.modelCode,
        maxInputTokens: remainingInputTokens,
        maxOutputTokens: remainingOutputTokens,
        costCeilingMicroUsd: remainingCostMicroUsd,
      });
    } catch {
      metrics.callCount += 1;
      metrics.unknownCallCount += 1;
      metrics.inputTokensKnown = false;
      metrics.outputTokensKnown = false;
      metrics.costKnown = false;
      throw new StageAttemptError("vendor_failed", "vendor_unhandled_error");
    }

    metrics.callCount += 1;
    const addKnown = (
      value: number | null,
      field: "inputTokens" | "outputTokens" | "costMicroUsd",
    ): void => {
      if (value === null) {
        if (field === "inputTokens") metrics.inputTokensKnown = false;
        else if (field === "outputTokens") metrics.outputTokensKnown = false;
        else {
          metrics.costKnown = false;
          metrics.unknownCallCount += 1;
        }
        return;
      }
      try {
        metrics[field] += nonNegativeInteger(value, field);
      } catch {
        metrics.inputTokensKnown = false;
        metrics.outputTokensKnown = false;
        if (metrics.costKnown) metrics.unknownCallCount += 1;
        metrics.costKnown = false;
        throw new StageAttemptError("vendor_failed", "vendor_usage_invalid");
      }
    };
    addKnown(result.inputTokens, "inputTokens");
    addKnown(result.outputTokens, "outputTokens");
    addKnown(result.costMicroUsd, "costMicroUsd");

    // Once any successful-call usage is unknown, neither the remaining token
    // ceiling nor the remaining reservation is provable. Stop before another
    // paid stage instead of treating the known numeric subtotal as headroom.
    if (!metrics.inputTokensKnown || !metrics.outputTokensKnown || !metrics.costKnown) {
      throw new StageAttemptError("vendor_failed", "vendor_usage_unknown");
    }

    if (metrics.costKnown && metrics.costMicroUsd > reservedCostMicroUsd) {
      throw new StageAttemptError("reservation_overrun", "vendor_cost_over_reservation");
    }
    if ((metrics.inputTokensKnown && metrics.inputTokens > maxInputTokens)
      || (metrics.outputTokensKnown && metrics.outputTokens > maxOutputTokens)) {
      throw new StageAttemptError("vendor_limit_overrun", "vendor_token_limit_overrun");
    }
    if (result.status === "failed") {
      let errorCode: string;
      try {
        errorCode = operationalCode(result.errorCode, "errorCode");
      } catch {
        throw new StageAttemptError("vendor_failed", "vendor_response_invalid");
      }
      throw new StageAttemptError("vendor_failed", errorCode);
    }
    return result.analysis as AutopsyStageResult;
  };

  let analysis: AutopsyAnalysis;
  try {
    analysis = await analyseAutopsyStages(claim.transcript, { analyse: runStage });
  } catch (error) {
    const failure = error instanceof StageAttemptError
      ? error
      : new StageAttemptError(
          "vendor_failed",
          error instanceof AutopsyAnalysisError
            ? "autopsy_analysis_invalid"
            : "autopsy_pipeline_invalid",
        );
    const outcome = failure.code === "autopsy_analysis_invalid"
      ? "analysis_invalid"
      : failure.outcome;
    await input.usage.finalizeAttempt({ record: record(outcome, failure.code) });
    return { status: "failed", attemptId: base.attemptId, errorCode: failure.code };
  }

  // THE PREFLIGHT, IN TWO HALVES SINCE R-99 (tenancy + compliance round 2,
  // CHANGE B). It used to be one call on every completed autopsy, private
  // included, and that call asked a shared-library question:
  // `assertAutopsyFrameworkCandidate` refuses content that could not become a
  // LIBRARY ROW. R-99 then stopped private claims from proposing anything at
  // all, so private pastes were being failed for a rule that no longer governs
  // them — and not cheaply: the failure is deterministic, so it recurs on every
  // retry, burns up to 5 x AUTOPSY_VENDOR_CALLS_PER_ATTEMPT system vendor calls,
  // and PARKS the claim, after which re-pasting the same video under the same
  // analysis version returns the same dead claim. (The creator's credit is not
  // lost — R-98's settlement refunds a parked claim — but the paste is
  // permanently unautopsyable.) `MECHANISM_CONTENT_RULES` is broad enough for
  // that to be ordinary rather than rare: its own docblock records `metric_unit`
  // refusing "Shoot 4k footage so you can crop in post."
  //
  // WHAT IS *NOT* SKIPPED, AND MUST NEVER BE. `assertMechanismLevel` on this
  // analysis is the ONLY content scan on private autopsy text in the running
  // system, and `packages/modes/src/assemble.ts` relies on it having run when it
  // says a `SpinReferenceMechanism` — the four fields that go into a generation
  // PROMPT — carries no personal detail, no number and no performance claim.
  // Skipping the preflight for private items would falsify that sentence and
  // put un-vetted numbers and personal details into a prompt. So the CONTENT
  // check runs on both branches (`assertAutopsyMechanismContent` is the same
  // scan over the same mapping) and only the shared-library CANDIDACY
  // consequence — the item ref, the schema shape, the library's length limits —
  // is dropped for a private claim.
  //
  // The recorded reason differs because the two failures are different facts:
  // a private analysis never was a candidate, so calling its failure
  // `framework_candidate_invalid` would be false about it.
  //
  // RESIDUAL, NAMED RATHER THAN LEFT TO BE REDISCOVERED: a private analysis
  // that fails the CONTENT rule still burns this attempt, and
  // AUTOPSY_ATTEMPT_CODE_CEILING of them still park the claim — deterministically,
  // because the same transcript yields the same analysis. Failing is right (the
  // text must not reach a prompt) but the retries buy nothing, since a content
  // refusal is not a transient vendor error: they spend
  // AUTOPSY_VENDOR_CALLS_PER_ATTEMPT calls each to reach the same verdict.
  // Making a content refusal terminal on the FIRST failure would refund sooner
  // and spend less; it changes the finalize contract, so it is a decision this
  // pass deliberately did not take.
  try {
    if (claim.proposesSharedFramework) {
      assertAutopsyFrameworkCandidate({
        trendItemId: base.itemId,
        analysis,
      });
    } else {
      assertAutopsyMechanismContent(analysis);
    }
  } catch (error) {
    if (
      !(error instanceof FrameworkContentError) &&
      !(error instanceof FrameworkLimitError)
    ) {
      throw error;
    }
    const errorCode = claim.proposesSharedFramework
      ? "framework_candidate_invalid"
      : "analysis_not_mechanism_level";
    await input.usage.finalizeAttempt({
      record: record("analysis_invalid", errorCode),
    });
    return { status: "failed", attemptId: base.attemptId, errorCode };
  }

  const succeeded = record("succeeded");
  await input.usage.finalizeAttempt({
    record: succeeded,
    autopsy: { cacheClaimId: input.command.autopsyCacheClaimId, analysis },
  });
  return { status: "succeeded", attemptId: base.attemptId };
}

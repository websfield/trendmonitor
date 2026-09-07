import { createHash } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import {
  buildComparisonGroups,
  buildFeedbackProposalDraft,
  buildResultProposalDraft,
  ComparisonInputError,
  isPromotionProposalDraft,
  metricDeclarationKey,
  ProposalInputError,
  type FeedbackProposalDraft,
  type PromotionProposalDraft,
  type ResultProposalDraft,
} from "@respin/brain";

import type { TxLike } from "./db-like";
import type { BrainDoc } from "./brain-schema";
import {
  enumerateClaimFields,
  readPointer,
} from "./brain-content";
import {
  promotionProposals,
  proposalEvidenceFeedback,
  proposalEvidenceResults,
  type PromotionProposal,
} from "./promotion-schema";
import { declaredMetricOf } from "./results-schema";
import {
  onboardingInputs,
  brainActivationSnapshots,
  type OnboardingInput,
  type StoredInputClass,
} from "./onboarding-schema";
import { POST_CONTENT_MAX, POST_COUNT_MAX } from "./storage-limits";
import {
  OnboardingInputLimitError,
  PerformanceLearningEntitlementError,
  PromotionAccessError,
  PromotionDecisionError,
  PromotionFreshnessError,
  PromotionPayloadError,
} from "./errors";
import type {
  PerformanceLearningEntitlement,
  ProfileScope,
  ProfileWriteCapabilities,
  PromotionFeedbackInputRow,
  PromotionProposalStoredReview,
  SourceEvidenceEntry,
} from "./with-workspace";

const HEX64 = /^[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireProposalId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new PromotionAccessError();
  }
}
const resultPayloadSchema = z.strictObject({
  rule: z.strictObject({
    metric: z.strictObject({
      key: z.string(), label: z.string(), unit: z.string(),
      direction: z.enum(["higher_is_better", "lower_is_better"]),
    }),
    lever: z.enum(["reach", "conversion"]),
    platform: z.string(),
    audienceClass: z.enum(["organic", "paid"]),
    observationEnvelope: z.strictObject({ observedFrom: z.string(), observedTo: z.string() }),
    treatmentKey: z.string(),
    treatment: z.strictObject({ n: z.number(), medianPer1k: z.number() }),
    baseline: z.strictObject({ n: z.number(), medianPer1k: z.number() }),
    effectPer1k: z.number(),
    pastOutcome: z.enum(["better", "worse"]),
    evidenceCounts: z.strictObject({ quantifiedSelfReported: z.number(), connectorVerified: z.number() }),
    evidenceStates: z.array(z.strictObject({ resultId: z.string(), evidenceState: z.enum(["unquantified", "quantified_self_reported", "connector_verified"]) })),
    evidenceStrength: z.enum(["early", "repeated", "corroborated"]),
    confounders: z.array(z.enum(["topic_overlap", "posting_time_unknown", "account_growth", "spillover_from_other_post", "external_promotion", "platform_change"])),
  }),
});
const feedbackPayloadSchema = z.strictObject({ value: z.string().min(1) });

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function sha(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function requireFull(entitlement: PerformanceLearningEntitlement): void {
  if (entitlement !== "full") throw new PerformanceLearningEntitlementError();
}

function validateDraft(draft: unknown): PromotionProposalDraft {
  if (!isPromotionProposalDraft(draft)) {
    throw new PromotionPayloadError("the proposal did not come from the sole brain constructor");
  }
  if (!HEX64.test(draft.evidenceDigest) || draft.familyKey.trim() === "") {
    throw new PromotionPayloadError("its identity or evidence digest is malformed");
  }
  const parsed = draft.source === "results"
    ? resultPayloadSchema.safeParse({ rule: draft.rule })
    : feedbackPayloadSchema.safeParse({ value: draft.value });
  if (!parsed.success) {
    throw new PromotionPayloadError(parsed.error.issues[0]?.message ?? "its payload is invalid");
  }
  return draft;
}

async function reconstructCurrentDrafts(
  scope: ProfileScope,
  tx: TxLike
): Promise<{ drafts: PromotionProposalDraft[]; resultPopulationTruncated: boolean }> {
  const resultInputs = await scope.accessors.promotionResultInputs(tx);
  const declaredMetrics = new Map<string, NonNullable<ReturnType<typeof declaredMetricOf>>>();
  let activeMetric: NonNullable<ReturnType<typeof declaredMetricOf>> | null = null;
  for (const version of resultInputs.strategyMetricVersions) {
    const metric = declaredMetricOf({ metric: version.metric });
    if (metric) {
      declaredMetrics.set(version.id, metric);
      if (version.status === "active" && activeMetric === null) activeMetric = metric;
    }
  }
  const groups = buildComparisonGroups({
    profileId: scope.profileId,
    results: resultInputs.population.rows,
    truncated: resultInputs.population.truncated,
    declaredMetrics,
  });
  const resultDrafts: ResultProposalDraft[] = [];
  for (const group of groups) {
    const metric = declaredMetrics.get(group.stratum.metricDeclaredByDocIds[0]!);
    // A result proposal remains current across Strategy versions only when the
    // exact semantic declaration is unchanged. Document ids are provenance,
    // not metric identity.
    if (
      !metric ||
      !activeMetric ||
      metricDeclarationKey(metric) !== metricDeclarationKey(activeMetric)
    ) continue;
    for (const comparison of group.comparisons) {
      const treatmentIds = comparison.treatment.state === "present" ? comparison.treatment.resultIds : [];
      const baselineIds = comparison.baseline.state === "present" ? comparison.baseline.resultIds : [];
      const toEvidence = (ids: readonly string[]) => resultInputs.population.rows
        .filter((row) => ids.includes(row.id))
        .map((row) => ({
          id: row.id,
          metricDeclaredByDocId: row.metricDeclaredByDocId,
          treatmentKey: row.treatmentKey,
          evidenceState: row.evidenceState,
          observedFrom: row.observedFrom,
          observedTo: row.observedTo,
          confounders: row.confounders,
          reachValue: row.reachValue,
          reachDenominator: row.reachDenominator,
          conversionValue: row.conversionValue,
          conversionDenominator: row.conversionDenominator,
        }));
      const draft = buildResultProposalDraft({
        metric,
        stratum: group.stratum,
        lever: comparison.lever,
        treatmentKey: group.treatmentKey,
        treatment: comparison.treatment,
        baseline: comparison.baseline,
        effectPer1k: comparison.effectPer1k,
        improvement: comparison.improvement,
        treatmentEvidence: toEvidence(treatmentIds),
        baselineEvidence: toEvidence(baselineIds),
      });
      if (draft) resultDrafts.push(validateDraft(draft) as ResultProposalDraft);
    }
  }

  const feedbackGroups = new Map<string, PromotionFeedbackInputRow[]>();
  for (const row of await scope.accessors.promotionFeedbackInputs(tx)) {
    if (!row.basisBrainDocId) continue;
    const key = canonical([row.reaction, row.basisBrainDocId]);
    feedbackGroups.set(key, [...(feedbackGroups.get(key) ?? []), row]);
  }
  const feedbackDrafts: FeedbackProposalDraft[] = [];
  for (const rows of feedbackGroups.values()) {
    const first = rows[0]!;
    const draft = buildFeedbackProposalDraft({
      profileId: scope.profileId,
      reaction: first.reaction,
      basisBrainDocId: first.basisBrainDocId!,
      evidence: rows,
    });
    if (draft) feedbackDrafts.push(validateDraft(draft) as FeedbackProposalDraft);
  }
  return {
    drafts: [...resultDrafts, ...feedbackDrafts],
    resultPopulationTruncated: resultInputs.population.truncated,
  };
}

function proposalValues(draft: PromotionProposalDraft, scope: ProfileScope) {
  return {
    profileId: scope.profileId,
    workspaceId: scope.workspaceId,
    source: draft.source,
    targetKind: draft.target.kind,
    targetPointer: draft.target.pointer,
    payload: draft.source === "results" ? { rule: draft.rule } : { value: draft.value },
    familyKey: draft.familyKey,
    evidenceDigest: draft.evidenceDigest,
    strength: draft.source === "results" ? draft.rule.evidenceStrength : "repeated" as const,
    basisBrainDocId: draft.source === "feedback" ? draft.basisBrainDocId : null,
  };
}

export async function refreshPromotionProposalsInScope(
  scope: ProfileScope,
  entitlement: PerformanceLearningEntitlement,
  tx: TxLike
): Promise<PromotionProposal[]> {
  requireFull(entitlement);
  const { drafts, resultPopulationTruncated } = await reconstructCurrentDrafts(scope, tx);
  const byFamily = new Map<string, PromotionProposalDraft[]>();
  for (const draft of drafts) byFamily.set(draft.familyKey, [...(byFamily.get(draft.familyKey) ?? []), draft]);
  const existing = await scope.accessors.promotionProposalHistory(tx);
  for (const row of existing.filter((proposal) => proposal.status === "proposed")) {
    // A clipped result read cannot prove that any old evidence or family is
    // absent. Leave result proposals untouched until a complete population is
    // available; feedback reconstruction remains complete and independent.
    if (row.source === "results" && resultPopulationTruncated) continue;
    const family = byFamily.get(row.familyKey) ?? [];
    if (family.some((draft) => draft.evidenceDigest === row.evidenceDigest)) continue;
    const stored = await scope.accessors.promotionProposalReview(row.id, tx);
    let exactStillValid = false;
    if (stored) {
      try {
        const exact = await reconstructStoredDraft(scope, stored, tx);
        exactStillValid = exact.source !== "results" || await resultMetricIsCurrent(scope, exact, tx);
      } catch (error) {
        if (
          error instanceof PromotionFreshnessError ||
          error instanceof PromotionPayloadError ||
          error instanceof ComparisonInputError ||
          error instanceof ProposalInputError
        ) {
          exactStillValid = false;
        } else {
          throw error;
        }
      }
    }
    await tx.update(promotionProposals).set({
      status: exactStillValid && family.length ? "superseded" : "stale",
    })
      .where(and(eq(promotionProposals.id, row.id), eq(promotionProposals.profileId, scope.profileId), eq(promotionProposals.workspaceId, scope.workspaceId), eq(promotionProposals.status, "proposed")));
  }
  for (const draft of drafts) {
    const [inserted] = await tx.insert(promotionProposals).values(proposalValues(draft, scope)).onConflictDoNothing().returning();
    const proposal = inserted ?? (await tx.select().from(promotionProposals).where(and(
      eq(promotionProposals.profileId, scope.profileId), eq(promotionProposals.workspaceId, scope.workspaceId),
      eq(promotionProposals.source, draft.source), eq(promotionProposals.familyKey, draft.familyKey),
      eq(promotionProposals.evidenceDigest, draft.evidenceDigest),
    )).limit(1))[0];
    if (!proposal) throw new PromotionPayloadError("the idempotent proposal row could not be read back");
    if (draft.source === "results") {
      await tx.insert(proposalEvidenceResults).values(draft.evidence.map((e) => ({
        proposalId: proposal.id, profileId: scope.profileId, workspaceId: scope.workspaceId,
        resultId: e.resultId, role: e.role,
      }))).onConflictDoNothing();
    } else {
      await tx.insert(proposalEvidenceFeedback).values(draft.evidence.map((e) => ({
        proposalId: proposal.id, profileId: scope.profileId, workspaceId: scope.workspaceId,
        feedbackId: e.feedbackId,
      }))).onConflictDoNothing();
    }
  }
  return scope.accessors.promotionProposalHistory(tx);
}

type SummaryClaim = { pointer: string; value: unknown; quote: string };

function storedRule(draft: ResultProposalDraft) {
  const rule = draft.rule;
  return {
    metricLabel: rule.metric.label,
    metricKey: rule.metric.key,
    metricUnit: rule.metric.unit,
    metricDirection: rule.metric.direction,
    lever: rule.lever,
    platform: rule.platform,
    audienceClass: rule.audienceClass,
    observedFrom: rule.observationEnvelope.observedFrom,
    observedTo: rule.observationEnvelope.observedTo,
    treatmentN: rule.treatment.n,
    baselineN: rule.baseline.n,
    treatmentMedianPer1k: rule.treatment.medianPer1k,
    baselineMedianPer1k: rule.baseline.medianPer1k,
    effectPer1k: rule.effectPer1k,
    pastOutcome: rule.pastOutcome,
    evidenceStrength: rule.evidenceStrength,
    selfReportedN: rule.evidenceCounts.quantifiedSelfReported,
    connectorVerifiedN: rule.evidenceCounts.connectorVerified,
    confounders: [...rule.confounders],
  };
}

function mergedFor(draft: PromotionProposalDraft, base: BrainDoc | null): { content: unknown; newPointers: string[] } {
  if (draft.source === "results") {
    const previous = base ? (base.content as { rules?: unknown[] }).rules : [];
    if (!Array.isArray(previous)) throw new PromotionPayloadError("the current Performance Meta rules are not an array");
    const content = { rules: [...previous, storedRule(draft)] };
    const index = previous.length;
    return { content, newPointers: enumerateClaimFields("performance_meta", content).filter((p) => p.startsWith(`/rules/${index}/`)) };
  }
  if (!base) throw new PromotionFreshnessError(`there is no active ${draft.target.kind} document to extend`);
  const record = structuredClone(base.content) as Record<string, unknown>;
  const key = draft.target.kind === "voice" ? "avoid" : "rules";
  const values = record[key];
  if (!Array.isArray(values)) throw new PromotionPayloadError(`the current ${draft.target.kind} ${key} field is not an array`);
  const pointer = `/${key}/${values.length}`;
  record[key] = [...values, draft.value];
  return { content: record, newPointers: [pointer] };
}

function summaryFor(proposal: PromotionProposal, draft: PromotionProposalDraft, merged: { content: unknown; newPointers: string[] }): { content: string; claims: SummaryClaim[] } {
  const evidenceIds = draft.source === "results"
    ? draft.evidence.map((e) => `${e.role}:${e.resultId}`)
    : draft.evidence.map((e) => `${e.feedbackId}:${e.generationId}:${e.reaction}`);
  const header = draft.source === "results"
    ? [`Promotion proposal ${proposal.id}`, `Result evidence ${evidenceIds.join(", ")}`, `Population treatment n=${draft.rule.treatment.n}; baseline n=${draft.rule.baseline.n}`, `Period ${draft.rule.observationEnvelope.observedFrom} to ${draft.rule.observationEnvelope.observedTo}`, `Observed effect per 1k: ${draft.rule.effectPer1k}`, `Evidence limitation: ${draft.rule.evidenceStrength}; this describes past observations and does not establish cause or forecast a future result.`]
    : [`Promotion proposal ${proposal.id}`, `Feedback evidence ${evidenceIds.join(", ")}`, `Population distinct generations n=${new Set(draft.evidence.map((entry) => entry.generationId)).size}`, `Repeated reaction: ${draft.evidence[0]!.reaction}`, `Evidence limitation: a fixed reaction code was repeated across distinct generations; free-form notes were not used.`];
  const claims = merged.newPointers.map((pointer) => {
    const value = readPointer(merged.content, pointer);
    return { pointer, value, quote: `${pointer} = ${typeof value === "string" ? value : canonical(value)}` };
  });
  return { content: [...header, ...claims.map((claim) => claim.quote)].join("\n"), claims };
}

async function reconstructStoredDraft(
  scope: ProfileScope,
  stored: PromotionProposalStoredReview,
  tx: TxLike
): Promise<PromotionProposalDraft> {
  const storedPayload = stored.proposal.source === "results"
    ? resultPayloadSchema.safeParse(stored.proposal.payload)
    : feedbackPayloadSchema.safeParse(stored.proposal.payload);
  if (!storedPayload.success) {
    throw new PromotionPayloadError(
      storedPayload.error.issues[0]?.message ?? "its stored payload is invalid"
    );
  }
  let candidates: PromotionProposalDraft[] = [];
  if (stored.proposal.source === "results") {
    if (stored.resultEvidence.length === 0 || stored.feedbackEvidence.length !== 0) {
      throw new PromotionFreshnessError("its relational result evidence is absent or mixed with feedback evidence");
    }
    const versions = await scope.accessors.strategyMetricVersions(tx);
    const declaredMetrics = new Map<string, NonNullable<ReturnType<typeof declaredMetricOf>>>();
    for (const version of versions) {
      const metric = declaredMetricOf({ metric: version.metric });
      if (metric) declaredMetrics.set(version.id, metric);
    }
    const groups = buildComparisonGroups({
      profileId: scope.profileId,
      results: stored.resultEvidence,
      truncated: false,
      declaredMetrics,
    });
    const treatmentKeys = [...new Set(
      stored.resultEvidence
        .filter((row) => row.role === "treatment")
        .map((row) => row.treatmentKey)
    )];
    if (treatmentKeys.length !== 1 || !treatmentKeys[0]) {
      throw new PromotionFreshnessError("its treatment evidence does not identify exactly one treatment");
    }
    for (const group of groups.filter((item) => item.treatmentKey === treatmentKeys[0])) {
      const metric = declaredMetrics.get(group.stratum.metricDeclaredByDocIds[0]!);
      if (!metric) continue;
      for (const comparison of group.comparisons) {
        const treatmentIds = comparison.treatment.state === "present"
          ? comparison.treatment.resultIds
          : [];
        const baselineIds = comparison.baseline.state === "present"
          ? comparison.baseline.resultIds
          : [];
        const toEvidence = (ids: readonly string[]) => stored.resultEvidence
          .filter((row) => ids.includes(row.id))
          .map((row) => ({
            id: row.id,
            metricDeclaredByDocId: row.metricDeclaredByDocId,
            treatmentKey: row.treatmentKey,
            evidenceState: row.evidenceState,
            observedFrom: row.observedFrom,
            observedTo: row.observedTo,
            confounders: row.confounders,
            reachValue: row.reachValue,
            reachDenominator: row.reachDenominator,
            conversionValue: row.conversionValue,
            conversionDenominator: row.conversionDenominator,
          }));
        const candidate = buildResultProposalDraft({
          metric,
          stratum: group.stratum,
          lever: comparison.lever,
          treatmentKey: group.treatmentKey,
          treatment: comparison.treatment,
          baseline: comparison.baseline,
          effectPer1k: comparison.effectPer1k,
          improvement: comparison.improvement,
          treatmentEvidence: toEvidence(treatmentIds),
          baselineEvidence: toEvidence(baselineIds),
        });
        if (candidate) candidates.push(validateDraft(candidate));
      }
    }
  } else {
    if (stored.feedbackEvidence.length === 0 || stored.resultEvidence.length !== 0) {
      throw new PromotionFreshnessError("its relational feedback evidence is absent or mixed with result evidence");
    }
    const first = stored.feedbackEvidence[0]!;
    if (!first.basisBrainDocId) {
      throw new PromotionFreshnessError("its historical feedback basis is absent");
    }
    const candidate = buildFeedbackProposalDraft({
      profileId: scope.profileId,
      reaction: first.reaction,
      basisBrainDocId: first.basisBrainDocId,
      evidence: stored.feedbackEvidence,
    });
    if (candidate) candidates = [validateDraft(candidate)];
  }
  const draft = candidates.find((item) =>
    item.source === stored.proposal.source &&
    item.familyKey === stored.proposal.familyKey &&
    item.evidenceDigest === stored.proposal.evidenceDigest
  );
  if (!draft) throw new PromotionFreshnessError("its exact relational evidence no longer reconstructs to the stored digest");
  const expectedStrength = draft.source === "results"
    ? draft.rule.evidenceStrength
    : "repeated";
  if (
    stored.proposal.targetKind !== draft.target.kind ||
    stored.proposal.targetPointer !== draft.target.pointer ||
    stored.proposal.strength !== expectedStrength ||
    stored.proposal.basisBrainDocId !== (draft.source === "feedback" ? draft.basisBrainDocId : null)
  ) {
    throw new PromotionPayloadError("its stored target, strength, or historical basis disagrees with the minted proposal");
  }
  const expectedPayload = draft.source === "results" ? { rule: draft.rule } : { value: draft.value };
  if (canonical(expectedPayload) !== canonical(stored.proposal.payload)) throw new PromotionPayloadError("its relational evidence and payload disagree");
  const expectedEvidence = draft.source === "results"
    ? draft.evidence.map((entry) => `${entry.role}:${entry.resultId}`).sort()
    : draft.evidence.map((entry) => entry.feedbackId).sort();
  const storedEvidence = draft.source === "results"
    ? stored.resultEvidence.map((entry) => `${entry.role}:${entry.id}`).sort()
    : stored.feedbackEvidence.map((entry) => entry.feedbackId).sort();
  if (canonical(expectedEvidence) !== canonical(storedEvidence)) {
    throw new PromotionFreshnessError("its relational evidence membership is incomplete or contains an extra row");
  }
  if (
    draft.source === "feedback" &&
    stored.feedbackEvidence.some((entry) => entry.basisBrainDocId !== draft.basisBrainDocId)
  ) {
    throw new PromotionFreshnessError("its historical feedback basis no longer matches the stored proposal");
  }
  return draft;
}

async function resultMetricIsCurrent(
  scope: ProfileScope,
  draft: ResultProposalDraft,
  tx: TxLike
): Promise<boolean> {
  const active = (await scope.accessors.strategyMetricVersions(tx))
    .find((version) => version.status === "active");
  const activeMetric = active ? declaredMetricOf({ metric: active.metric }) : null;
  return activeMetric !== null &&
    metricDeclarationKey(activeMetric) === metricDeclarationKey(draft.rule.metric);
}

export type PromotionReviewClaim = {
  pointer: string;
  displayedValue: unknown;
  sourceEvidence: {
    quote: string;
    inputId: string | null;
    inputClass: StoredInputClass | null;
  } | { absence: string };
};

export type PromotionProposalReview = PromotionProposalStoredReview & {
  baseBrainDocId: string | null;
  mergedContent: unknown;
  claims: PromotionReviewClaim[];
  freshnessToken: string;
};

async function buildReview(scope: ProfileScope, stored: PromotionProposalStoredReview, tx: TxLike): Promise<{ review: PromotionProposalReview; draft: PromotionProposalDraft; base: BrainDoc | null; summary: ReturnType<typeof summaryFor> }> {
  const draft = await reconstructStoredDraft(scope, stored, tx);
  if (
    stored.proposal.status === "proposed" &&
    draft.source === "results" &&
    !(await resultMetricIsCurrent(scope, draft, tx))
  ) {
    throw new PromotionFreshnessError("its metric declaration is no longer the current active Strategy metric");
  }
  if (stored.proposal.status === "accepted") {
    const acceptedBrainDocId = stored.proposal.acceptedBrainDocId;
    const acceptedActivationId = stored.proposal.acceptedActivationId;
    if (!acceptedBrainDocId || !acceptedActivationId) {
      throw new PromotionFreshnessError("its accepted document or activation is absent");
    }
    const [acceptedDoc] = await scope.accessors.brainDocsByIds([acceptedBrainDocId], tx);
    if (!acceptedDoc || acceptedDoc.kind !== draft.target.kind) {
      throw new PromotionFreshnessError("its accepted document is absent or has the wrong kind");
    }
    const [acceptedSnapshot] = await tx
      .select()
      .from(brainActivationSnapshots)
      .where(and(
        eq(brainActivationSnapshots.id, acceptedActivationId),
        eq(brainActivationSnapshots.profileId, scope.profileId),
        eq(brainActivationSnapshots.workspaceId, scope.workspaceId)
      ))
      .limit(1);
    const snapshotDocId = draft.target.kind === "performance_meta"
      ? acceptedSnapshot?.performanceMetaDocId
      : draft.target.kind === "voice"
        ? acceptedSnapshot?.voiceDocId
        : acceptedSnapshot?.killtestDocId;
    if (snapshotDocId !== acceptedBrainDocId) {
      throw new PromotionFreshnessError("its accepted activation does not name its accepted document");
    }
    const acceptedEvidence = Array.isArray(acceptedDoc.sourceEvidence)
      ? acceptedDoc.sourceEvidence as SourceEvidenceEntry[]
      : [];
    const acceptedInputs = await scope.accessors.onboardingInputsByIds(
      acceptedEvidence.map((entry) => entry.inputId),
      tx
    );
    const inputClasses = new Map(acceptedInputs.map((input) => [input.id, input.inputClass] as const));
    const claims = enumerateClaimFields(acceptedDoc.kind, acceptedDoc.content).map((pointer): PromotionReviewClaim => {
      const source = acceptedEvidence.find((entry) => entry.field === pointer);
      return {
        pointer,
        displayedValue: readPointer(acceptedDoc.content, pointer),
        sourceEvidence: source
          ? { quote: source.quote, inputId: source.inputId, inputClass: inputClasses.get(source.inputId) ?? null }
          : { absence: "No source quote is recorded for this placeholder." },
      };
    });
    const tokenFields = {
      proposalId: stored.proposal.id,
      evidenceDigest: stored.proposal.evidenceDigest,
      targetKind: stored.proposal.targetKind,
      baseBrainDocId: acceptedDoc.id,
      mergedContentHash: sha(acceptedDoc.content),
      claims: claims.map(({ pointer, displayedValue, sourceEvidence }) => ({ pointer, displayedValue, sourceEvidence })).sort((a, b) => a.pointer.localeCompare(b.pointer)),
    };
    return {
      review: {
        ...stored,
        baseBrainDocId: acceptedDoc.id,
        mergedContent: acceptedDoc.content,
        claims,
        freshnessToken: sha(tokenFields),
      },
      draft,
      base: acceptedDoc,
      summary: { content: "", claims: [] },
    };
  }
  const base = (await scope.accessors.brainDocsByKind(draft.target.kind, tx)).find((doc) => doc.status === "active") ?? null;
  const merged = mergedFor(draft, base);
  const summary = summaryFor(stored.proposal, draft, merged);
  const oldEvidence = base && Array.isArray(base.sourceEvidence) ? base.sourceEvidence as SourceEvidenceEntry[] : [];
  const priorInputs = await scope.accessors.onboardingInputsByIds(
    oldEvidence.map((entry) => entry.inputId),
    tx
  );
  const priorInputClasses = new Map(
    priorInputs.map((input) => [input.id, input.inputClass] as const)
  );
  const claims = enumerateClaimFields(draft.target.kind, merged.content).map((pointer): PromotionReviewClaim => {
    const fresh = summary.claims.find((claim) => claim.pointer === pointer);
    if (fresh) return { pointer, displayedValue: fresh.value, sourceEvidence: { quote: fresh.quote, inputId: null, inputClass: draft.source === "results" ? "result_summary" : "feedback_summary" } };
    const prior = oldEvidence.find((entry) => entry.field === pointer);
    return {
      pointer,
      displayedValue: readPointer(merged.content, pointer),
      sourceEvidence: prior
        ? {
            quote: prior.quote,
            inputId: prior.inputId,
            inputClass: priorInputClasses.get(prior.inputId) ?? null,
          }
        : { absence: "No source quote is recorded for this placeholder." },
    };
  });
  const tokenFields = {
    proposalId: stored.proposal.id,
    evidenceDigest: stored.proposal.evidenceDigest,
    targetKind: stored.proposal.targetKind,
    baseBrainDocId: base?.id ?? null,
    mergedContentHash: sha(merged.content),
    claims: claims.map(({ pointer, displayedValue, sourceEvidence }) => ({ pointer, displayedValue, sourceEvidence })).sort((a, b) => a.pointer.localeCompare(b.pointer)),
  };
  return { review: { ...stored, baseBrainDocId: base?.id ?? null, mergedContent: merged.content, claims, freshnessToken: sha(tokenFields) }, draft, base, summary };
}

export async function promotionProposalReviewInScope(scope: ProfileScope, proposalId: string, tx: TxLike): Promise<PromotionProposalReview> {
  requireProposalId(proposalId);
  const stored = await scope.accessors.promotionProposalReview(proposalId, tx);
  if (!stored) throw new PromotionAccessError();
  return (await buildReview(scope, stored, tx)).review;
}

export async function promotionProposalHistoryInScope(scope: ProfileScope, tx?: TxLike): Promise<PromotionProposal[]> {
  return scope.accessors.promotionProposalHistory(tx);
}

export async function appendPromotionSummaryForProposalInScope(scope: ProfileScope, proposalId: string, tx: TxLike): Promise<OnboardingInput> {
  requireProposalId(proposalId);
  const [locked] = await tx
    .select({ id: promotionProposals.id })
    .from(promotionProposals)
    .where(and(
      eq(promotionProposals.id, proposalId),
      eq(promotionProposals.profileId, scope.profileId),
      eq(promotionProposals.workspaceId, scope.workspaceId)
    ))
    .for("update")
    .limit(1);
  if (!locked) throw new PromotionAccessError();
  const stored = await scope.accessors.promotionProposalReview(proposalId, tx);
  if (!stored) throw new PromotionAccessError();
  if (stored.proposal.status !== "proposed") {
    throw new PromotionDecisionError(`its status is ${stored.proposal.status}`);
  }
  const built = await buildReview(scope, stored, tx);
  const content = built.summary.content;
  if (content.length > POST_CONTENT_MAX) {
    throw new OnboardingInputLimitError(
      `the server-derived promotion summary is ${content.length} characters and the limit is ${POST_CONTENT_MAX}`
    );
  }
  const [{ value: existing }] = await tx
    .select({ value: count() })
    .from(onboardingInputs)
    .where(and(
      eq(onboardingInputs.profileId, scope.profileId),
      eq(onboardingInputs.workspaceId, scope.workspaceId)
    ));
  if (existing >= POST_COUNT_MAX) {
    throw new OnboardingInputLimitError(
      `this creator profile already holds ${existing} immutable inputs and the limit is ${POST_COUNT_MAX}`
    );
  }
  const [row] = await tx.insert(onboardingInputs).values({
    profileId: scope.profileId,
    workspaceId: scope.workspaceId,
    inputClass: built.draft.source === "results" ? "result_summary" : "feedback_summary",
    content,
    contentSha256: createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex"),
    sourceUrl: null,
    fieldKey: null,
  }).returning();
  return row;
}

export type DecidePromotionProposalParams = {
  proposalId: string;
  decision: "accept" | "reject";
  freshnessToken: string;
  confirmedFields: { pointer: string; asPlaceholder: boolean }[];
};

export type PromotionDecisionResult = {
  proposal: PromotionProposal;
  status: "accepted" | "rejected";
};

export async function decidePromotionProposalInScope(
  scope: ProfileScope,
  caps: ProfileWriteCapabilities,
  params: DecidePromotionProposalParams,
  entitlement: PerformanceLearningEntitlement,
  tx: TxLike
): Promise<PromotionDecisionResult> {
  requireFull(entitlement);
  requireProposalId(params?.proposalId);
  if (params.decision !== "accept" && params.decision !== "reject") {
    throw new PromotionDecisionError("decision must be accept or reject");
  }
  const [locked] = await tx
    .select({ id: promotionProposals.id })
    .from(promotionProposals)
    .where(and(
      eq(promotionProposals.id, params.proposalId),
      eq(promotionProposals.profileId, scope.profileId),
      eq(promotionProposals.workspaceId, scope.workspaceId)
    ))
    .for("update")
    .limit(1);
  if (!locked) throw new PromotionAccessError();
  const stored = await scope.accessors.promotionProposalReview(params.proposalId, tx);
  if (!stored) throw new PromotionAccessError();
  if (stored.proposal.status === "accepted" || stored.proposal.status === "rejected") {
    return { proposal: stored.proposal, status: stored.proposal.status };
  }
  if (stored.proposal.status !== "proposed") throw new PromotionDecisionError(`its status is ${stored.proposal.status}`);
  const built = await buildReview(scope, stored, tx);
  if (params.freshnessToken !== built.review.freshnessToken) throw new PromotionFreshnessError("the review token does not match");
  if (params.decision === "reject") {
    if (!Array.isArray(params.confirmedFields) || params.confirmedFields.length !== 0) throw new PromotionDecisionError("a rejection cannot carry field confirmations");
    const [proposal] = await tx.update(promotionProposals).set({ status: "rejected", decisionUserId: scope.userId, decisionRole: scope.role as "owner" | "editor", decisionAt: new Date() }).where(and(eq(promotionProposals.id, stored.proposal.id), eq(promotionProposals.profileId, scope.profileId), eq(promotionProposals.workspaceId, scope.workspaceId), eq(promotionProposals.status, "proposed"))).returning();
    if (!proposal) throw new PromotionFreshnessError("another decision completed first");
    return { proposal, status: "rejected" };
  }
  if (!Array.isArray(params.confirmedFields)) throw new PromotionDecisionError("confirmations must be a list");
  const expected = built.review.claims.map((claim) => ({ pointer: claim.pointer, asPlaceholder: claim.displayedValue === "[check]" })).sort((a, b) => a.pointer.localeCompare(b.pointer));
  const submitted = params.confirmedFields.slice().sort((a, b) => a.pointer.localeCompare(b.pointer));
  if (canonical(expected) !== canonical(submitted)) throw new PromotionDecisionError("the confirmed pointer set is not the complete reviewed claim set");
  const summaryRow = await caps.appendPromotionSummaryForProposal(stored.proposal.id, tx);
  const summary = built.summary;
  const newEvidence: SourceEvidenceEntry[] = summary.claims.map((claim) => {
    const startUtf16 = summaryRow.content.indexOf(claim.quote);
    if (startUtf16 < 0) throw new PromotionPayloadError("a summary claim span could not be located");
    return { field: claim.pointer, quote: claim.quote, inputId: summaryRow.id, startUtf16, endUtf16: startUtf16 + claim.quote.length };
  });
  const oldEvidence = built.base && Array.isArray(built.base.sourceEvidence) ? built.base.sourceEvidence as SourceEvidenceEntry[] : [];
  const doc = await caps.writeBrainDoc({ kind: built.draft.target.kind, content: built.review.mergedContent, sourceEvidence: [...oldEvidence, ...newEvidence], reason: { code: "brain_promotion" } }, tx, built.base?.id);
  await caps.confirmBrainDocFields({ brainDocId: doc.id, confirmedFields: submitted }, tx);
  const activated = await caps.activateBrainDocCoherent({ brainDocId: doc.id }, tx);
  const [proposal] = await tx.update(promotionProposals).set({ status: "accepted", decisionUserId: scope.userId, decisionRole: scope.role as "owner" | "editor", decisionAt: new Date(), acceptedBrainDocId: activated.doc.id, acceptedActivationId: activated.snapshot.id }).where(and(eq(promotionProposals.id, stored.proposal.id), eq(promotionProposals.profileId, scope.profileId), eq(promotionProposals.workspaceId, scope.workspaceId), eq(promotionProposals.status, "proposed"))).returning();
  if (!proposal) throw new PromotionFreshnessError("another decision completed first");
  return { proposal, status: "accepted" };
}

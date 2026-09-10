import { createHash } from "node:crypto";

import {
  MIN_COMPARABLE_RESULTS,
  type ComparisonStratum,
  type DeclaredMetric,
  type Improvement,
  type Population,
  metricDeclarationKey,
} from "./comparison";
import type { AudienceClass, ConfounderCode, EvidenceState, Lever } from "./vocabulary";

export type EvidenceStrength = "early" | "repeated" | "corroborated";
export type PromotionSource = "results" | "feedback";
export type PromotionTarget = "voice" | "performance_meta" | "killtest";
export type FeedbackReaction =
  | "off_voice"
  | "too_generic"
  | "wrong_angle"
  | "not_filmable"
  | "used_as_is"
  | "used_with_edits"
  | "discarded";

export type PerformanceRule = Readonly<{
  metric: Readonly<DeclaredMetric>;
  lever: Lever;
  platform: string;
  audienceClass: AudienceClass;
  /** Immutable ISO instants; never caller-owned mutable `Date` objects. */
  observationEnvelope: Readonly<{ observedFrom: string; observedTo: string }>;
  treatmentKey: string;
  treatment: Readonly<{ n: number; medianPer1k: number }>;
  baseline: Readonly<{ n: number; medianPer1k: number }>;
  effectPer1k: number;
  pastOutcome: Exclude<Improvement, "unchanged">;
  evidenceCounts: Readonly<{ quantifiedSelfReported: number; connectorVerified: number }>;
  /** Complete, sorted row-level evidence state for digest/audit reconstruction. */
  evidenceStates: readonly Readonly<{ resultId: string; evidenceState: EvidenceState }>[];
  evidenceStrength: EvidenceStrength;
  confounders: readonly ConfounderCode[];
}>;

export type ResultProposalDraft = Readonly<{
  source: "results";
  familyKey: string;
  target: Readonly<{ kind: "performance_meta"; pointer: "/rules/-" }>;
  rule: PerformanceRule;
  evidence: readonly Readonly<{ resultId: string; role: "treatment" | "baseline" }>[];
  evidenceDigest: string;
}>;

export type FeedbackProposalDraft = Readonly<{
  source: "feedback";
  familyKey: string;
  target:
    | Readonly<{ kind: "voice"; pointer: "/avoid/-" }>
    | Readonly<{ kind: "killtest"; pointer: "/rules/-" }>;
  value: string;
  basisBrainDocId: string;
  evidence: readonly Readonly<{
    feedbackId: string;
    generationId: string;
    reaction: FeedbackReaction;
  }>[];
  evidenceDigest: string;
}>;

export type PromotionProposalDraft = ResultProposalDraft | FeedbackProposalDraft;

/** A caller/input refusal, distinct from an unexpected constructor defect. */
export class ProposalInputError extends TypeError {
  constructor(message: string) {
    super(`invalid promotion proposal input: ${message}`);
    this.name = "ProposalInputError";
  }
}

export type ResultEvidenceInput = Readonly<{
  id: string;
  metricDeclaredByDocId: string;
  treatmentKey: string | null;
  evidenceState: EvidenceState;
  observedFrom: Date;
  observedTo: Date;
  confounders: readonly ConfounderCode[];
  reachValue: string | null;
  reachDenominator: string | null;
  conversionValue: string | null;
  conversionDenominator: string | null;
}>;

export type ResultProposalInput = Readonly<{
  metric: DeclaredMetric;
  stratum: ComparisonStratum;
  lever: Lever;
  treatmentKey: string;
  treatment: Population;
  baseline: Population;
  effectPer1k: number | null;
  improvement: Improvement | null;
  treatmentEvidence: readonly ResultEvidenceInput[];
  baselineEvidence: readonly ResultEvidenceInput[];
}>;

export type FeedbackEvidenceInput = Readonly<{
  feedbackId: string;
  generationId: string;
  profileId: string;
  reaction: FeedbackReaction;
  /** The immutable activation snapshot's target document id, resolved by DB. */
  basisBrainDocId: string | null;
}>;

export type FeedbackProposalInput = Readonly<{
  profileId: string;
  reaction: FeedbackReaction;
  basisBrainDocId: string;
  evidence: readonly FeedbackEvidenceInput[];
}>;

const minted = new WeakSet<object>();
const proposalBrand: unique symbol = Symbol("PromotionProposalDraft");

function mint<T extends object>(value: T): T {
  Object.defineProperty(value, proposalBrand, { value: true });
  Object.freeze(value);
  minted.add(value);
  return value;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

/** Family identities are ordered protocol tuples, not generic canonical maps. */
function familyDigest(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function fail(message: string): never {
  throw new ProposalInputError(message);
}

function nonBlank(value: string, name: string): string {
  if (value.trim() === "") fail(`${name} is blank`);
  return value;
}

function exactIds(expected: readonly string[], rows: readonly ResultEvidenceInput[], name: string): void {
  const actual = rows.map((row) => nonBlank(row.id, `${name}.id`));
  if (new Set(actual).size !== actual.length) fail(`${name} has duplicate result ids`);
  if (new Set(expected).size !== expected.length) fail(`comparison ${name} has duplicate result ids`);
  if (actual.length !== expected.length || actual.some((id) => !expected.includes(id))) {
    fail(`${name} evidence does not exactly equal the comparison membership`);
  }
}

function per1k(row: ResultEvidenceInput, lever: Lever): number {
  const [value, denominator] = lever === "reach"
    ? [row.reachValue, row.reachDenominator]
    : [row.conversionValue, row.conversionDenominator];
  if (value === null || denominator === null) fail(`${row.id} has no ${lever} measurement`);
  const parsedValue = Number(value);
  const parsedDenominator = Number(denominator);
  if (!Number.isFinite(parsedValue) || !Number.isFinite(parsedDenominator) || parsedDenominator <= 0) {
    fail(`${row.id} has an invalid ${lever} measurement`);
  }
  return (parsedValue / parsedDenominator) * 1000;
}

function median(rows: readonly ResultEvidenceInput[], lever: Lever): number {
  const values = rows.map((row) => per1k(row, lever)).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}

function observationEnvelope(
  rows: readonly ResultEvidenceInput[]
): Readonly<{ observedFrom: string; observedTo: string }> {
  let earliest = Number.POSITIVE_INFINITY;
  let latest = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    if (
      !(row.observedFrom instanceof Date) ||
      Number.isNaN(row.observedFrom.getTime()) ||
      !(row.observedTo instanceof Date) ||
      Number.isNaN(row.observedTo.getTime()) ||
      row.observedTo.getTime() <= row.observedFrom.getTime()
    ) {
      fail(`${row.id} has an invalid observation window`);
    }
    earliest = Math.min(earliest, row.observedFrom.getTime());
    latest = Math.max(latest, row.observedTo.getTime());
  }
  return Object.freeze({
    observedFrom: new Date(earliest).toISOString(),
    observedTo: new Date(latest).toISOString(),
  });
}

/**
 * ONE RESULT-EVIDENCE BOUNDARY (R-115, Phase 10a C1): below the shared
 * verified minimum a comparison is unavailable; at or above it a result
 * proposal is `corroborated` — every row connector verified, both populations
 * at `MIN_COMPARABLE_RESULTS` or more. The former `MIN_COMPARABLE_RESULTS + 2`
 * "strong" tier and the mixed/self-reported `early`/`repeated` cells are gone:
 * a self-reported row cannot reach this function (the comparison excludes it),
 * and one that is smuggled in is a refusal, never a weaker label. The three
 * enum values stay persisted for history; no new writer emits `early`, and
 * `repeated` is the feedback path's own label. A later strength taxonomy needs
 * measured calibration and a recorded decision.
 */
function strength(
  treatment: readonly ResultEvidenceInput[],
  baseline: readonly ResultEvidenceInput[]
): EvidenceStrength {
  const rows = [...treatment, ...baseline];
  if (rows.some((row) => row.evidenceState !== "connector_verified")) {
    fail("unverified evidence entered a result proposal");
  }
  return "corroborated";
}

/** Creates the sole brain-side result proposal. It writes nothing. */
export function buildResultProposalDraft(input: ResultProposalInput): ResultProposalDraft | null {
  if (input.treatment.state !== "present" || input.baseline.state !== "present") return null;
  if (input.improvement === null || input.improvement === "unchanged" || input.effectPer1k === null) return null;
  nonBlank(input.treatmentKey, "treatmentKey");
  if (
    !Array.isArray(input.stratum.metricDeclaredByDocIds) ||
    input.stratum.metricDeclaredByDocIds.length === 0
  ) {
    fail("stratum declares no metric documents");
  }
  if (
    input.stratum.metricDeclaredByDocIds.some(
      (id) => typeof id !== "string" || id.trim() === ""
    ) ||
    new Set(input.stratum.metricDeclaredByDocIds).size !==
      input.stratum.metricDeclaredByDocIds.length
  ) {
    fail("stratum metric document ids must be distinct non-blank strings");
  }
  if (input.stratum.metricKey !== input.metric.key) fail("metric key does not match the stratum");
  if (input.treatmentEvidence.some((row) => (row.treatmentKey ?? "").trim() !== input.treatmentKey)) {
    fail("treatment evidence does not carry the candidate treatment key");
  }
  exactIds(input.treatment.resultIds, input.treatmentEvidence, "treatment");
  exactIds(input.baseline.resultIds, input.baselineEvidence, "baseline");
  const all = [...input.treatmentEvidence, ...input.baselineEvidence];
  if (new Set(all.map((row) => row.id)).size !== all.length) fail("treatment and baseline evidence overlap");
  if (input.baselineEvidence.some((row) => (row.treatmentKey ?? "").trim() === input.treatmentKey)) {
    fail("baseline evidence reuses the candidate treatment key");
  }
  if (all.some((row) => row.evidenceState === "unquantified")) fail("unquantified evidence entered a proposal");
  // VERIFIED ONLY (R-115): refused here, before any arithmetic, and again in
  // `strength` — the same rule at both ends so neither can be the only guard.
  if (all.some((row) => row.evidenceState === "quantified_self_reported")) fail("self-reported evidence entered a result proposal");
  if (
    all.some(
      (row) =>
        typeof row.metricDeclaredByDocId !== "string" ||
        !input.stratum.metricDeclaredByDocIds.includes(row.metricDeclaredByDocId)
    )
  ) {
    fail("result evidence names a metric declaration outside the stratum");
  }
  if (input.treatmentEvidence.length < MIN_COMPARABLE_RESULTS || input.baselineEvidence.length < MIN_COMPARABLE_RESULTS) {
    fail("evidence is below the comparison minimum");
  }
  const treatmentMedian = median(input.treatmentEvidence, input.lever);
  const baselineMedian = median(input.baselineEvidence, input.lever);
  const effect = treatmentMedian - baselineMedian;
  if (input.treatment.n !== input.treatmentEvidence.length || input.baseline.n !== input.baselineEvidence.length ||
      input.treatment.medianPer1k !== treatmentMedian || input.baseline.medianPer1k !== baselineMedian || input.effectPer1k !== effect) {
    fail("comparison values do not recompute from the joined evidence");
  }
  const recomputedOutcome: Exclude<Improvement, "unchanged"> | "unchanged" =
    effect === 0
      ? "unchanged"
      : (effect > 0) === (input.metric.direction === "higher_is_better")
        ? "better"
        : "worse";
  if (input.improvement !== recomputedOutcome) {
    fail("past outcome does not recompute from the joined evidence");
  }
  const evidenceCounts = {
    quantifiedSelfReported: all.filter((row) => row.evidenceState === "quantified_self_reported").length,
    connectorVerified: all.filter((row) => row.evidenceState === "connector_verified").length,
  };
  // The proposal is about the exact relational membership below, not every
  // row that happened to share its broader comparison stratum. Deriving the
  // envelope from those exact rows makes initial minting and later review
  // reconstruction byte-identical even when an excluded/unquantified row has
  // an older observation window.
  const exactObservationEnvelope = observationEnvelope(all);
  const evidenceStates = Object.freeze(
    all
      .map((row) => Object.freeze({ resultId: row.id, evidenceState: row.evidenceState }))
      .sort((a, b) => a.resultId.localeCompare(b.resultId))
  );
  const evidenceMetricDeclaredByDocIds = [...new Set(
    all.map((row) => row.metricDeclaredByDocId)
  )].sort();
  const rule: PerformanceRule = Object.freeze({
    metric: Object.freeze({ ...input.metric }), lever: input.lever, platform: input.stratum.platform,
    audienceClass: input.stratum.audienceClass,
    observationEnvelope: exactObservationEnvelope,
    treatmentKey: input.treatmentKey,
    treatment: Object.freeze({ n: input.treatmentEvidence.length, medianPer1k: treatmentMedian }),
    baseline: Object.freeze({ n: input.baselineEvidence.length, medianPer1k: baselineMedian }),
    effectPer1k: effect, pastOutcome: input.improvement, evidenceCounts: Object.freeze(evidenceCounts), evidenceStates,
    evidenceStrength: strength(input.treatmentEvidence, input.baselineEvidence), confounders: Object.freeze([...new Set(all.flatMap((row) => row.confounders))].sort()),
  });
  const familyKey = familyDigest([
    "results", "performance_meta", "/rules/-", metricDeclarationKey(input.metric), input.lever,
    input.stratum.platform, input.stratum.audienceClass, input.treatmentKey,
  ]);
  const evidence = Object.freeze([
    ...input.treatmentEvidence.map((row) => Object.freeze({ resultId: row.id, role: "treatment" as const })),
    ...input.baselineEvidence.map((row) => Object.freeze({ resultId: row.id, role: "baseline" as const })),
  ].sort((a, b) => a.resultId.localeCompare(b.resultId)));
  return mint({ source: "results" as const, familyKey, target: Object.freeze({ kind: "performance_meta" as const, pointer: "/rules/-" as const }), rule, evidence, evidenceDigest: digest({ rule, evidence, metricDeclaredByDocIds: evidenceMetricDeclaredByDocIds }) });
}

const feedbackMap: Readonly<Record<Exclude<FeedbackReaction, "used_as_is" | "used_with_edits" | "discarded">, { kind: "voice" | "killtest"; pointer: "/avoid/-" | "/rules/-"; value: string }>> = {
  off_voice: { kind: "voice", pointer: "/avoid/-", value: "Drafts that do not sound like my established voice." },
  too_generic: { kind: "killtest", pointer: "/rules/-", value: "Reject a draft that could be true of anyone." },
  wrong_angle: { kind: "killtest", pointer: "/rules/-", value: "Reject a draft whose thesis is not the point I intended." },
  not_filmable: { kind: "killtest", pointer: "/rules/-", value: "Reject a draft I cannot actually film." },
};

export function buildFeedbackProposalDraft(input: FeedbackProposalInput): FeedbackProposalDraft | null {
  const mapping = feedbackMap[input.reaction as keyof typeof feedbackMap];
  if (mapping === undefined) return null;
  nonBlank(input.profileId, "profileId");
  nonBlank(input.basisBrainDocId, "basisBrainDocId");
  const evidence = input.evidence.map((row) => {
    if (row.profileId !== input.profileId || row.reaction !== input.reaction || row.basisBrainDocId !== input.basisBrainDocId) fail("feedback evidence has a different scope, reaction, or basis document");
    return Object.freeze({ feedbackId: nonBlank(row.feedbackId, "feedbackId"), generationId: nonBlank(row.generationId, "generationId"), reaction: row.reaction });
  });
  if (new Set(evidence.map((row) => row.feedbackId)).size !== evidence.length) fail("feedback evidence has duplicate feedback ids");
  if (new Set(evidence.map((row) => row.generationId)).size < MIN_COMPARABLE_RESULTS) return null;
  const sortedEvidence = Object.freeze([...evidence].sort((a, b) => a.feedbackId.localeCompare(b.feedbackId)));
  const target = Object.freeze({ kind: mapping.kind, pointer: mapping.pointer }) as FeedbackProposalDraft["target"];
  const familyKey = familyDigest([
    "feedback", target.kind, target.pointer, input.reaction, input.basisBrainDocId,
  ]);
  return mint({ source: "feedback" as const, familyKey, target, value: mapping.value, basisBrainDocId: input.basisBrainDocId, evidence: sortedEvidence, evidenceDigest: digest({ evidence: sortedEvidence, target, value: mapping.value }) });
}

export function isPromotionProposalDraft(value: unknown): value is PromotionProposalDraft {
  return typeof value === "object" && value !== null && minted.has(value as object) && (value as Record<symbol, unknown>)[proposalBrand] === true;
}

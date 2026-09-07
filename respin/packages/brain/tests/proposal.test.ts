import { describe, expect, it } from "vitest";

import {
  buildFeedbackProposalDraft,
  buildResultProposalDraft,
  isPromotionProposalDraft,
  ProposalInputError,
  type ResultProposalInput,
} from "../src/index";

const metric = { key: "follows", label: "Follows", unit: "per 1k", direction: "higher_is_better" as const };
const key = "candidate";
const rows = (prefix: string, values: number[], treatmentKey: string | null, state: "quantified_self_reported" | "connector_verified" = "quantified_self_reported") =>
  values.map((value, index) => ({
    id: `${prefix}${index + 1}`,
    metricDeclaredByDocId: "strategy-a",
    treatmentKey,
    evidenceState: state,
    observedFrom: new Date("2026-01-05T00:00:00.000Z"),
    observedTo: new Date("2026-01-25T00:00:00.000Z"),
    confounders: index === 0 ? ["topic_overlap" as const] : [],
    reachValue: String(value),
    reachDenominator: "1000",
    conversionValue: null,
    conversionDenominator: null,
  }));

function input(overrides: Partial<ResultProposalInput> = {}): ResultProposalInput {
  const treatmentEvidence = rows("t", [30, 40, 50], key);
  const baselineEvidence = rows("b", [10, 20, 30], null);
  return {
    metric,
    stratum: { profileId: "p", platform: "youtube", audienceClass: "organic", metricKey: "follows", metricDeclaredByDocIds: ["strategy-b", "strategy-a"], observedFrom: new Date("2026-01-01Z"), observedTo: new Date("2026-02-01Z") },
    lever: "reach", treatmentKey: key,
    treatment: { state: "present", n: 3, medianPer1k: 40, resultIds: ["t1", "t2", "t3"] },
    baseline: { state: "present", n: 3, medianPer1k: 20, resultIds: ["b1", "b2", "b3"] },
    effectPer1k: 20, improvement: "better", treatmentEvidence, baselineEvidence, ...overrides,
  };
}

describe("promotion proposal constructors", () => {
  it("mints a frozen, branded result draft with exact joins and a stable family", () => {
    const first = buildResultProposalDraft(input())!;
    const withNewEvidence = buildResultProposalDraft(input({ treatmentEvidence: rows("t", [30, 40, 50, 60], key), treatment: { state: "present", n: 4, medianPer1k: 45, resultIds: ["t1", "t2", "t3", "t4"] }, effectPer1k: 25 }))!;
    expect(isPromotionProposalDraft(first)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.familyKey).toBe("aefd1fb6a66eba94e97398b7219974bce35d83ecba794d14dbc9c1914c6cddde");
    expect(first.familyKey).toBe(withNewEvidence.familyKey);
    expect(first.evidenceDigest).not.toBe(withNewEvidence.evidenceDigest);
    expect(first.rule.evidenceStrength).toBe("early");
    expect(first.evidence.map((row) => row.resultId)).toEqual(["b1", "b2", "b3", "t1", "t2", "t3"]);
  });

  it("refuses join drift, overlap, wrong candidate keys, and unquantified rows", () => {
    expect(() => buildResultProposalDraft(input({ baselineEvidence: rows("x", [10, 20, 30], null) }))).toThrow(/exactly equal/);
    expect(() => buildResultProposalDraft(input({ baselineEvidence: rows("t", [10, 20, 30], null), baseline: { state: "present", n: 3, medianPer1k: 20, resultIds: ["t1", "t2", "t3"] } }))).toThrow(/overlap/);
    expect(() => buildResultProposalDraft(input({ baselineEvidence: rows("b", [10, 20, 30], key) }))).toThrow(/candidate treatment key/);
    expect(() => buildResultProposalDraft(input({ treatmentEvidence: rows("t", [30, 40, 50], "other") }))).toThrow(/treatment evidence/);
    expect(() => buildResultProposalDraft(input({ metric: { ...metric, key: "saves" } }))).toThrow(/metric key does not match/);
    expect(() => buildResultProposalDraft(input({ treatmentEvidence: rows("t", [30, 40, 50], key).map((row, index) => index === 0 ? { ...row, metricDeclaredByDocId: "outside" } : row) }))).toThrow(/outside the stratum/);
    expect(() => buildResultProposalDraft(input({ treatmentEvidence: rows("t", [30, 40, 50], key, "quantified_self_reported").map((row, index) => index === 0 ? { ...row, evidenceState: "unquantified" as const } : row) }))).toThrow(/unquantified/);
    expect(() => buildResultProposalDraft(input({ treatmentEvidence: rows("t", [30, 40, 50], key).map((row, index) => index === 0 ? { ...row, observedTo: new Date("nonsense") } : row) }))).toThrow(/invalid observation window/);
  });

  it("marks every constructor input refusal with ProposalInputError, not only TypeError", () => {
    let refusal: unknown;
    try {
      buildResultProposalDraft(input({ treatmentEvidence: rows("t", [30, 40, 50], "other") }));
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(ProposalInputError);
    expect(refusal).toBeInstanceOf(TypeError);
    expect(() => buildFeedbackProposalDraft({
      profileId: "p", reaction: "off_voice", basisBrainDocId: "voice-v1",
      evidence: [{ feedbackId: "f1", generationId: "g1", profileId: "other", reaction: "off_voice", basisBrainDocId: "voice-v1" }],
    })).toThrow(ProposalInputError);
    expect(new TypeError("unrelated constructor defect")).not.toBeInstanceOf(ProposalInputError);
  });

  it("derives an immutable observation envelope from exact evidence, not the broader stratum", () => {
    const dates = { from: new Date("2026-01-01Z"), to: new Date("2026-02-01Z") };
    const initial = input({ stratum: { ...input().stratum, observedFrom: dates.from, observedTo: dates.to } });
    const draft = buildResultProposalDraft(initial)!;
    const connector = input({
      treatmentEvidence: initial.treatmentEvidence.map((row, index) => index === 0 ? { ...row, evidenceState: "connector_verified" as const } : row),
    });
    const changedState = buildResultProposalDraft(connector)!;
    dates.from.setUTCFullYear(2099);
    dates.to.setUTCFullYear(2099);
    expect(draft.rule.observationEnvelope).toEqual({ observedFrom: "2026-01-05T00:00:00.000Z", observedTo: "2026-01-25T00:00:00.000Z" });
    expect(Object.isFrozen(draft.rule.observationEnvelope)).toBe(true);
    expect(Object.isFrozen(draft.rule.evidenceStates)).toBe(true);
    expect(draft.evidenceDigest).not.toBe(changedState.evidenceDigest);
    expect(draft.rule.evidenceStates).toContainEqual({ resultId: "t1", evidenceState: "quantified_self_reported" });
  });

  it("keeps the evidence-strength precedence mutually exclusive", () => {
    expect(buildResultProposalDraft(input())!.rule.evidenceStrength).toBe("early");
    const verified = rows("b", [1, 2, 3, 4, 5], null, "connector_verified");
    const validMixed = input({ treatmentEvidence: rows("t", [4, 5, 6, 7, 8], key), baselineEvidence: verified, treatment: { state: "present" as const, n: 5, medianPer1k: 6, resultIds: ["t1", "t2", "t3", "t4", "t5"] }, baseline: { state: "present" as const, n: 5, medianPer1k: 3, resultIds: ["b1", "b2", "b3", "b4", "b5"] }, effectPer1k: 3 });
    expect(buildResultProposalDraft(validMixed)!.rule.evidenceStrength).toBe("repeated");
    const allVerified = { ...validMixed, treatmentEvidence: rows("t", [4, 5, 6, 7, 8], key, "connector_verified") };
    expect(buildResultProposalDraft(allVerified)!.rule.evidenceStrength).toBe("corroborated");
  });

  it("covers every population-size × evidence-composition cell with one strength", () => {
    const states = ["self", "mixed", "verified"] as const;
    for (const treatmentN of [3, 4, 5]) for (const baselineN of [3, 4, 5]) for (const composition of states) {
      const evidenceFor = (prefix: string, n: number, treatmentKey: string | null, offset: number) =>
        Array.from({ length: n }, (_, index) => ({
          id: `${prefix}${index + 1}`, treatmentKey,
          metricDeclaredByDocId: "strategy-a",
          evidenceState: composition === "verified" || (composition === "mixed" && index % 2 === 1) ? "connector_verified" as const : "quantified_self_reported" as const,
          observedFrom: new Date("2026-01-05T00:00:00.000Z"),
          observedTo: new Date("2026-01-25T00:00:00.000Z"),
          confounders: [], reachValue: String(offset + index), reachDenominator: "1000",
          conversionValue: null, conversionDenominator: null,
        }));
      const treatmentEvidence = evidenceFor("t", treatmentN, key, 20);
      const baselineEvidence = evidenceFor("b", baselineN, null, 1);
      const middle = (items: readonly { reachValue: string | null }[]) => {
        const values = items.map((item) => Number(item.reachValue));
        const index = Math.floor(values.length / 2);
        return values.length % 2 === 1 ? values[index]! : (values[index - 1]! + values[index]!) / 2;
      };
      const candidate = input({
        treatmentEvidence, baselineEvidence,
        treatment: { state: "present", n: treatmentN, medianPer1k: middle(treatmentEvidence), resultIds: treatmentEvidence.map((r) => r.id) },
        baseline: { state: "present", n: baselineN, medianPer1k: middle(baselineEvidence), resultIds: baselineEvidence.map((r) => r.id) },
        effectPer1k: middle(treatmentEvidence) - middle(baselineEvidence),
      });
      const expected = treatmentN < 5 || baselineN < 5 || composition === "self"
        ? "early"
        : composition === "mixed" ? "repeated" : "corroborated";
      expect(buildResultProposalDraft(candidate)!.rule.evidenceStrength, `${treatmentN}/${baselineN}/${composition}`).toBe(expected);
    }
  });

  it("maps only qualifying feedback from three distinct generations", () => {
    const evidence = [1, 2, 3].map((n) => ({ feedbackId: `f${n}`, generationId: `g${n}`, profileId: "p", reaction: "off_voice" as const, basisBrainDocId: "voice-v1" }));
    const draft = buildFeedbackProposalDraft({ profileId: "p", reaction: "off_voice", basisBrainDocId: "voice-v1", evidence })!;
    expect(draft.value).toBe("Drafts that do not sound like my established voice.");
    expect(draft.familyKey).toBe("ccf7d5aa59be5167152e841f4f2649e5b10174a7669d2d978bb5565886e0a9ca");
    expect(isPromotionProposalDraft(draft)).toBe(true);
    expect(buildFeedbackProposalDraft({ profileId: "p", reaction: "used_as_is", basisBrainDocId: "voice-v1", evidence: [] })).toBeNull();
    expect(buildFeedbackProposalDraft({ profileId: "p", reaction: "off_voice", basisBrainDocId: "voice-v1", evidence: [evidence[0]!, { ...evidence[0]!, feedbackId: "f4" }, evidence[1]!] })).toBeNull();
  });

  it("does not accept planted inline objects or casts as minted drafts", () => {
    expect(isPromotionProposalDraft({ source: "results" })).toBe(false);
    expect(isPromotionProposalDraft({ source: "feedback" } as unknown)).toBe(false);
  });
});

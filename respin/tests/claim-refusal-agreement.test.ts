// TWO COPIES OF ONE PREDICATE, BOUND (owner decision 2026-10-07, R-173;
// billing verification, same day). `@respin/modes`' `refusalIsClaimOnly`
// decides the price in `generate`; `@respin/db`'s decides, inside
// `settleGeneration`, whether the usage is system spend — and refuses a caller
// that disagrees. Neither package can import the other, so this test runs both
// over one generated corpus and asserts they agree on every case.
import { describe, expect, it } from "vitest";
import { FORBIDDEN_CLAIM_RULE, refusalIsClaimOnly as dbCopy } from "../packages/db/src/generation-refusal";
import { refusalIsClaimOnly as modesCopy } from "../packages/modes/src/claims";
import { HARD_RULE_IDS } from "../packages/modes/src/hard-rules";

describe("refusalIsClaimOnly: the @respin/db copy agrees with @respin/modes'", () => {
  it("the rule id is the modes package's own", () => {
    expect(HARD_RULE_IDS).toContain(FORBIDDEN_CLAIM_RULE);
  });

  it("every combination of outcome, rule list and malformed shape gives the same answer", () => {
    const outcomes: unknown[] = ["failed", "passed", "passed_after_rewrite", undefined, 1];
    const ruleSets: unknown[][] = [
      [],
      ...HARD_RULE_IDS.map((r) => [r]),
      ...HARD_RULE_IDS.map((r) => ["forbidden_claim", r]),
      ["forbidden_claim", "forbidden_claim"],
      ["unknown_rule"],
    ];
    const cases: unknown[] = [null, undefined, "failed", 0, {}, { outcome: "failed" }, { outcome: "failed", finalAttempt: {} }, { outcome: "failed", finalAttempt: { hardRules: "forbidden_claim" } }];
    for (const outcome of outcomes) {
      for (const rules of ruleSets) {
        cases.push({ outcome, finalAttempt: { hardRules: rules.map((rule) => ({ rule })) } });
        cases.push({ outcome, finalAttempt: { hardRules: rules } });
      }
    }
    let trueCount = 0;
    for (const c of cases) {
      expect(dbCopy(c), JSON.stringify(c)).toBe(modesCopy(c));
      if (modesCopy(c)) trueCount++;
    }
    // NON-VACUITY: both answers occur.
    expect(trueCount).toBeGreaterThan(0);
    expect(trueCount).toBeLessThan(cases.length);
  });
});

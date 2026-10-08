// WAS A STORED REFUSAL CAUSED BY THE CLAIM SCAN ALONE? (owner decision
// 2026-10-07, R-173; billing verification, same day.)
//
// A SECOND COPY OF `@respin/modes`' `refusalIsClaimOnly`, BOUND BY A TEST.
// `settleGeneration` derives the system-spend flag from the kill test it is
// storing rather than trusting its caller, and this package cannot import
// `@respin/modes` (neither package depends on the other, and `@respin/db` is
// the bottom of the graph). `tests/claim-refusal-agreement.test.ts` runs both
// copies over one generated corpus and asserts they agree on every case, so a
// change to one without the other is red.

/** The hard-rule id the claim scan refuses under (`@respin/modes` `HARD_RULE_IDS`). */
export const FORBIDDEN_CLAIM_RULE = "forbidden_claim";

/**
 * True exactly when the stored kill test failed and every hard rule on its
 * final attempt is `forbidden_claim`. Reads plain stored JSON, so a fresh
 * settlement, a held one and a replay decide it from the same record.
 */
export function refusalIsClaimOnly(killTest: unknown): boolean {
  if (typeof killTest !== "object" || killTest === null) return false;
  const k = killTest as { outcome?: unknown; finalAttempt?: { hardRules?: unknown } };
  if (k.outcome !== "failed") return false;
  const rules = k.finalAttempt?.hardRules;
  return (
    Array.isArray(rules) &&
    rules.length > 0 &&
    rules.every(
      (r) => typeof r === "object" && r !== null && (r as { rule?: unknown }).rule === FORBIDDEN_CLAIM_RULE
    )
  );
}

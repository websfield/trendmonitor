// THE OPERATOR'S SETTLE COMMAND, AS A COMMAND (audit P3-R1(b), decisions R-157).
//
// What it prints and how it exits, driven through its injectable `settle`
// port. The settlement itself — the paused refusal, the single debit, the
// idempotent second run — is driven against a real database in
// `packages/credits/tests/generate.test.ts` ("P3-R1(b): the operator command
// settles one stored candidate…"), through `operatorSettleCandidate`, the
// function this command's default port calls.
import { describe, expect, it } from "vitest";

import { HELP, describeOutcome, main } from "../scripts/settle-candidate";

const run = async (argv: string[], outcome?: Parameters<typeof describeOutcome>[0]) => {
  const lines: string[] = [];
  const seen: string[] = [];
  const code = await main(argv, {
    settle: async (id) => {
      seen.push(id);
      if (!outcome) throw new Error("settle must not be called");
      return outcome;
    },
    write: (line) => lines.push(line),
  });
  return { code, out: lines.join(""), seen };
};

describe("scripts/settle-candidate", () => {
  it("--help lists every refusal the settlement can return, says it is the operator's recovery, and settles nothing", async () => {
    const { code, out, seen } = await run(["--help"]);
    expect(code).toBe(0);
    expect(seen).toEqual([]);
    expect(out).toBe(HELP);
    // The population is the outcome type's closed set of refusal codes.
    for (const refusal of [
      "paused",
      "insufficient_balance",
      "transient",
      "workspace_unavailable",
      "recovery_required",
      "refused",
      "in_flight",
      "profile_unavailable",
      "no_active_owner",
      "not_found",
    ]) {
      expect(HELP, refusal).toMatch(new RegExp(`^\\s+${refusal}\\s`, "m"));
    }
    expect(HELP).toMatch(/Finish this draft/);
    expect(HELP).toMatch(/24-hour/);
    expect(HELP).toMatch(/tier change since the claim is NOT a refusal/);
  });

  it("a settled outcome exits 0 and prints the tier and charge; already_settled exits 0 with zero charged", async () => {
    const settled = await run(["att-1"], { code: "settled", attemptId: "att-1", creditsCharged: 5, tier: "pro", configVersion: 3 });
    expect(settled.code).toBe(0);
    expect(settled.seen).toEqual(["att-1"]);
    expect(settled.out).toBe("attempt=att-1 state=settled code=settled credits_charged=5 tier=pro config_version=3\n");
    const again = await run(["att-1"], { code: "already_settled", attemptId: "att-1" });
    expect(again.code).toBe(0);
    expect(again.out).toBe("attempt=att-1 state=settled code=already_settled credits_charged=0\n");
  });

  it("a refusal exits 1 and prints the id, state and code ONLY", async () => {
    const paused = await run(["att-2"], { code: "paused", attemptId: "att-2", state: "vendor_complete" });
    expect(paused.code).toBe(1);
    expect(paused.out).toBe("attempt=att-2 state=vendor_complete code=paused\n");
    const missing = await run(["att-3"], { code: "not_found", attemptId: "att-3", state: null });
    expect(missing.out).toBe("attempt=att-3 state=none code=not_found\n");
  });

  it("bad usage exits 2 without settling anything", async () => {
    for (const argv of [[], ["a", "b"], ["has space"], ["x".repeat(129)]]) {
      const { code, seen } = await run(argv);
      expect(code, JSON.stringify(argv)).toBe(2);
      expect(seen).toEqual([]);
    }
  });
});

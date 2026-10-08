// THE SAMPLE KILL TEST MUST CARRY A USABLE RULE, CHECKED AT LOAD (audit P3-R8,
// decisions R-157).
//
// `runGeneration` skips the scoring call when no rule is usable, so a public
// Sample Spin with zero usable rules records ONE call, and `system-spend.ts`
// throws on a `succeeded` `public_sample_spin` with fewer than two — after the
// vendor was billed, which the demo route renders as a 503. The fixture is the
// only producer of the rules, so the refusal belongs at load. These are the
// three plants that refusal must catch, and the shipped fixture that must pass.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHECK } from "@respin/db";
import { usableCreatorRules } from "@respin/modes";

import {
  SampleSpinFixtureError,
  assertSampleSpinKillTestUsable,
  loadSampleSpinFixture,
} from "../src/sample-spin/fixture";

const killtest = (rules: unknown) => ({
  rules,
  bannedWords: ["hype"],
  bannedVibes: ["urgency"],
});

describe("the Sample Spin fixture's Kill Test (audit P3-R8)", () => {
  it("refuses a Kill Test whose rules are ALL WHITESPACE — the blank half the old `length === 0` check let through", () => {
    expect(() => assertSampleSpinKillTestUsable(killtest(["   ", "\t\n"]))).toThrow(SampleSpinFixtureError);
    expect(() => assertSampleSpinKillTestUsable(killtest(["   ", "\t\n"]))).toThrow(/no usable rule/);
  });

  it("refuses a Kill Test whose rules are ALL [check]", () => {
    expect(() => assertSampleSpinKillTestUsable(killtest([CHECK, CHECK]))).toThrow(SampleSpinFixtureError);
  });

  it("refuses a Kill Test with NO rules", () => {
    expect(() => assertSampleSpinKillTestUsable(killtest([]))).toThrow(SampleSpinFixtureError);
    expect(() => assertSampleSpinKillTestUsable(killtest([]))).toThrow(/carries no rules/);
  });

  it("admits a Kill Test with one usable rule among blanks — and the shipped fixture carries at least one", () => {
    expect(assertSampleSpinKillTestUsable(killtest(["   ", "Name the joint in the first line."]))).toHaveLength(2);
    const fixture = loadSampleSpinFixture();
    expect(usableCreatorRules(fixture.creatorRules).length).toBeGreaterThanOrEqual(1);
  });

  it("the loader RUNS the check (not just exports it), and the spend invariant it fences is unchanged", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const loader = readFileSync(resolve(here, "../src/sample-spin/fixture.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(loader).toMatch(/const creatorRules = assertSampleSpinKillTestUsable\(killtest\);/);
    // THE SECOND FENCE, byte-for-byte: a succeeded Sample Spin still refuses
    // fewer than two calls. Relaxing it would hide a future loader path that
    // bypasses the first fence.
    const spend = readFileSync(resolve(here, "../../db/src/system-spend.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(spend).toContain(
      `  if (usage.outcome === "succeeded" && usage.purpose === "public_sample_spin"
    && (usage.callCount < 2 || usage.callCount > PUBLIC_SAMPLE_SPIN_VENDOR_CALLS_MAX)) {
    throw new Error("a successful sample spin records its drafts and the scoring call");
  }`
    );
  });
});

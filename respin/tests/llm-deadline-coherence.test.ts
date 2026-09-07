// THE THREE BOUNDS ON A VENDOR CALL, CHECKED AGAINST EACH OTHER.
//
// They live in three packages that cannot import one another — the shipped
// config defaults (`packages/config`), the seed (`packages/db`), and the
// autopsy worker's lease arithmetic (`packages/db/src/autopsy-policy.ts`) —
// so nothing had ever compared them. On 2026-09-04 all three disagreed at
// once and the product shipped with:
//
//   - `overallDeadlineMs` 40,000 BELOW the 53,233 ms a real `analyseAndSpin`
//     generation takes, so every spin aborted at 40,130 ms with 0 tokens;
//   - `timeoutMs` 60,000 ABOVE the outer deadline containing it, so the
//     per-request timeout could never fire — dead config shaped like a control.
//
// The third relation is the one with teeth in the other direction: raising the
// deadline far enough breaches `AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS` and the
// autopsy worker refuses to start. The window is therefore real and narrow, and
// nothing but this file holds it.
import { describe, expect, it } from "vitest";

// BY PATH, NOT BY PACKAGE NAME — see `claims-vocabulary-agreement.test.ts`.
import { respinConfigV1 } from "../packages/config/src/schema";
import { validateConfigContent } from "../packages/config/src/index";
import { CONFIG_V1_SEED } from "../packages/db/src/seed";
import {
  AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS,
  AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
} from "../packages/db/src/autopsy-policy";

/** The measurement this file exists to defend, kept as a number. */
const MEASURED_GENERATION_MS = 53_233;
const MEASURED_GENERATION_OUTPUT_TOKENS = 5_060;

/**
 * THE POPULATION IS A LIST OF TWO, and finding that out cost a planted
 * mutation (code review, 2026-09-04). This file used to read
 * `respinConfigV1.shape.llm.parse(undefined)` — the SCHEMA defaults — alone.
 * A fresh install runs on `CONFIG_V1_SEED`, a separate literal in
 * `@respin/db`, and the reviewer planted the exact reversion R-100 describes
 * (`seed.ts` back to 40_000 / 60_000) and got **8 of 8 assertions green**:
 * `pnpm db:seed` would have reproduced "every spin aborts at 40,130 ms" with
 * the whole suite clean.
 *
 * That is CLAUDE.md's 2026-08-29 lesson inside the guard written to honour it.
 * `generation-pricing.test.ts:416` states the same population correctly and is
 * the shape copied here. A third document that can bound a vendor call owes an
 * entry in this list.
 */
const DOCUMENTS = [
  ["the schema's own defaults", respinConfigV1.shape.llm.parse(undefined)],
  ["the seeded document", respinConfigV1.parse(CONFIG_V1_SEED).llm],
] as const;

describe("the shipped vendor-call bounds are coherent with each other", () => {
  for (const [where, llm] of DOCUMENTS) {
    it(`${where}: gives a real generation room to finish`, () => {
      expect(llm.overallDeadlineMs, where).toBeGreaterThan(MEASURED_GENERATION_MS);
      expect(llm.maxOutputTokens, where).toBeGreaterThan(
        MEASURED_GENERATION_OUTPUT_TOKENS,
      );
    });

    it(`${where}: keeps the per-request timeout inside the deadline that contains it`, () => {
      // The direction is what matters. A timeout ABOVE the outer deadline can
      // never expire, so it is not a bound at all — it is a number that reads
      // like one, which is how 60,000-under-40,000 survived review.
      expect(llm.timeoutMs, where).toBeLessThanOrEqual(llm.overallDeadlineMs);
    });

    it(`${where}: stays inside the autopsy claim lease, which the worker refuses to exceed`, () => {
      // `assertAutopsyDeadlineWithinLease` throws above this, and the worker
      // calls it before building the vendor adapter — so a deadline chosen only
      // from the generation path's needs takes the autopsy offline. Both
      // consumers read the SAME config key; this is the only place that says so.
      expect(llm.overallDeadlineMs, where).toBeLessThanOrEqual(
        AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS,
      );
    });
  }

  it("the two documents really are two, so the loop is not asserting one twice", () => {
    expect(DOCUMENTS[0][1]).not.toBe(DOCUMENTS[1][1]);
    expect(DOCUMENTS).toHaveLength(2);
  });

  it("the lease ceiling is a real constraint, not a number that could never fail", () => {
    expect(
      AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS * AUTOPSY_VENDOR_CALLS_PER_ATTEMPT,
    ).toBeLessThan(20 * 60_000);
  });

  it("an operator cannot re-open the dead-config gap through /admin/config", () => {
    // The relation above is a property of the two documents WE ship. This is
    // the same relation on the path an operator types, which `respinConfigV1`
    // cannot hold because it validates each key in isolation
    // (code review CHANGE 6). It lives in `validateConfigContent` rather than
    // in the schema so that legacy documents holding the shipped-broken pair
    // stay parseable and therefore correctable — see the comment there.
    const incoherent = {
      ...CONFIG_V1_SEED,
      llm: { ...CONFIG_V1_SEED.llm, timeoutMs: 300_000, overallDeadlineMs: 5_000 },
    };
    const result = validateConfigContent(incoherent);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.issues[0].path).toBe("llm.timeoutMs");
    expect(result.issues[0].message).toMatch(/can never fire/);
    // NON-VACUITY: the same document with a coherent pair validates.
    expect(validateConfigContent(CONFIG_V1_SEED).ok).toBe(true);
  });
});

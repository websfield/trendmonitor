// R-82 — THE INCLUDED-BUILD EXEMPTION IS DERIVED FROM THE ACTIVE CONFIG
// DOCUMENT, AND THIS GUARD READS THAT DOCUMENT.
//
// WHAT R-81 CLOSED (billing gate round 1, 2026-09-02). The included build is a
// durable CLAIM (R-80, `first_billable_attempts`), and `recordModelUsage`
// writes that claim for EVERY purpose — the table is purpose-neutral because
// `@respin/db` does not own the purpose vocabulary. `reconcileSpend` read the
// claim as "this attempt was free", which is true for the onboarding brain and
// FALSE for a generation: `priceOf`'s generation branch charges every
// generation, so each profile's FIRST generation was exempted from the
// unbilled-attempt report and a lost debit there was invisible to the only
// reconciliation reader there is.
//
// WHAT R-82 CLOSES, WHICH IS THIS FILE'S OWN PREVIOUS DEFECT (billing gate
// round 2). R-81's answer was `INCLUDED_BUILD_PURPOSES`, a frozen source
// constant — a static answer to a fact the ADMIN FORM CAN CHANGE, since
// `creditCosts.onboardingBrainBuild` is `min(0)` and any admin can append a
// document that raises it. And the witness offered for that residual asserted
// `CONFIG_V1_SEED`'s value: it read the SEED, never the active stored
// document, so it stayed green forever while an operator's edit re-opened the
// blind spot — one lost debit per profile — with the revisit trigger left to a
// person remembering. The case below therefore drives the REAL config table:
// seed, derive, append a version that prices the included build at 25, derive
// again. That is the assertion R-81's constant cannot pass.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createTestDb, seedDb, CONFIG_V1_SEED } from "@respin/db";
import {
  appendConfigVersion,
  getActiveConfig,
  respinConfigV1,
  type RespinConfigV1,
} from "@respin/config";
import { MODE_IDS } from "@respin/modes";
import {
  CLAIM_HOLDER_OPERATIONS,
  UNPROBED_CREDIT_COST_KEYS,
  includedBuildPurposes,
  probedCreditCostKeys,
  purposeIsIncluded,
} from "../src/included-build";
import {
  GENERATION_PURPOSE,
  ONBOARDING_BRAIN_PURPOSE,
  priceOf,
  type PricedOperation,
} from "../src/inference";
import { generationOp } from "../src/generate";
import { PASTED_REFERENCE_CREDIT_COST_KEY } from "../src/pasted-reference";

const seed: RespinConfigV1 = respinConfigV1.parse(CONFIG_V1_SEED);

/** The onboarding claim holder: `includedBuildHolder === attemptId`. */
const ONBOARDING_HOLDER: PricedOperation = {
  purpose: ONBOARDING_BRAIN_PURPOSE,
  includedBuildHolder: "att_probe",
  attemptId: "att_probe",
};

/** Every operation the GENERATION purpose can be priced as: mode x revision. */
const GENERATION_OPS: PricedOperation[] = MODE_IDS.flatMap((mode) => [
  generationOp(mode, false),
  generationOp(mode, true),
]);

/** The same document with every generation credit cost set to `credits`. */
function withGenerationCosts(
  content: RespinConfigV1,
  credits: number
): RespinConfigV1 {
  const creditCosts = { ...content.creditCosts };
  for (const op of GENERATION_OPS) {
    if (op.purpose !== GENERATION_PURPOSE) continue;
    creditCosts[op.creditCostKey] = credits;
  }
  return { ...content, creditCosts };
}

describe("includedBuildPurposes reads the DOCUMENT (R-82)", () => {
  it("THE AUTHORITY: raising the included build's price in the ACTIVE config removes the exemption", async () => {
    // The whole finding, driven end to end against the real `config_versions`
    // table: nothing here reads `CONFIG_V1_SEED` as the answer. R-81's frozen
    // constant returns `["onboarding_brain"]` for both documents below and
    // fails the second assertion.
    const db = await createTestDb();
    await seedDb(db);

    const before = await getActiveConfig(db);
    expect(
      before.content.creditCosts.onboardingBrainBuild,
      "the seeded included build is free — if this changes, so does the first expectation below"
    ).toBe(0);
    expect(includedBuildPurposes(before.content)).toEqual([
      ONBOARDING_BRAIN_PURPOSE,
    ]);

    // Exactly what `/admin/config` does with an operator's edit: validate the
    // whole document and APPEND it (`app/(admin)/admin/config/actions.ts` ->
    // `appendConfigVersionServer`). No source file changes anywhere.
    await appendConfigVersion(
      db,
      {
        ...before.content,
        creditCosts: { ...before.content.creditCosts, onboardingBrainBuild: 25 },
      },
      "included-build-authority-test"
    );

    const after = await getActiveConfig(db);
    expect(after.version).toBeGreaterThan(before.version);
    expect(
      includedBuildPurposes(after.content),
      "the claim holder now owes a debit, so exempting it from the unbilled report hides one lost debit per profile"
    ).toEqual([]);
    // ...and that is not a rule about the number 25: it is `priceOf`'s answer.
    expect(priceOf(after.content, ONBOARDING_HOLDER)).toBe(25);
  });

  it("THE R-81 INSTANCE, and the derivation DISCRIMINATES: onboarding is included, generation is not", () => {
    // The WHOLE set, not a `toContain`: a rule that called every purpose
    // included — or none of them — would satisfy the authority case above and
    // re-open the blind spot from the other side, and a third purpose gaining
    // a free first build is a decision somebody must make rather than inherit.
    expect(includedBuildPurposes(seed)).toEqual([ONBOARDING_BRAIN_PURPOSE]);
    expect(priceOf(seed, ONBOARDING_HOLDER)).toBe(0);
    expect(
      priceOf(seed, GENERATION_OPS[0]),
      "a generation is priced by its mode every time — exempting its claim holder hides one lost debit per profile"
    ).toBeGreaterThan(0);
  });

  it("EVERY priced operation of a purpose, not one representative: a single free mode does not exempt the purpose", () => {
    // The population rule, as a test. A derivation that probed one arbitrary
    // mode would answer this question for `hookSet` and state it about
    // `generation`, which exempts every other mode's claim holder for free.
    const oneFreeMode: RespinConfigV1 = {
      ...seed,
      creditCosts: { ...seed.creditCosts, hookSet: 0 },
    };
    // `hooks` is the mode whose `creditCostKey` is `hookSet` (MODE_SPECS).
    expect(priceOf(oneFreeMode, generationOp("hooks", false))).toBe(0);
    expect(
      includedBuildPurposes(oneFreeMode),
      "one free mode is not a free purpose — the other modes' claim holders still owe a debit"
    ).not.toContain(GENERATION_PURPOSE);

    // ...and the other direction, so "generation" is not simply hard-coded
    // out: price EVERY generation operation at zero and the purpose is
    // included.
    expect(
      includedBuildPurposes(withGenerationCosts(seed, 0))
    ).toContain(GENERATION_PURPOSE);
    // Non-vacuity of that fixture: it really did move the prices.
    expect(
      GENERATION_OPS.every(
        (op) => priceOf(withGenerationCosts(seed, 0), op) === 0
      )
    ).toBe(true);
    expect(
      GENERATION_OPS.every((op) => priceOf(withGenerationCosts(seed, 3), op) === 3)
    ).toBe(true);
  });

  it("THE VACUOUS BRANCH: a purpose with NO priced operations is never included", () => {
    // `[].every(...)` is `true`, so a purpose whose operations nobody filled
    // in would be EXEMPTED — hiding a lost debit rather than reporting an
    // attempt that owed nothing. The false branch is driven directly, because
    // a required length check reads exactly like a guard and is not one until
    // a test drives it (CLAUDE.md 2026-08-29).
    expect(purposeIsIncluded(seed, [])).toBe(false);
    // ...and it is unreachable TODAY because both populations are non-empty,
    // which is a fact about the record rather than a hope about it.
    for (const [purpose, ops] of Object.entries(CLAIM_HOLDER_OPERATIONS)) {
      expect(
        ops().length,
        purpose + " has no priced operations to probe — its exemption would be vacuous"
      ).toBeGreaterThan(0);
    }
    // The same helper on a real population still discriminates, so the length
    // check did not turn it into "always false".
    expect(purposeIsIncluded(seed, [ONBOARDING_HOLDER])).toBe(true);
    expect(purposeIsIncluded(seed, GENERATION_OPS)).toBe(false);
  });

  it("EVERY PRICED KEY IS ANSWERED: probed by an operation, or registered as unprobed with a reason", () => {
    // THE TRAP THIS CLOSES, LAID FOR SLICE 8 (billing gate, 2026-09-02). The
    // total `Record` makes a new PURPOSE a compile error and makes nothing at
    // all of a new OPERATION WITHIN a purpose. MEASURED against the seed:
    // `CLAIM_HOLDER_OPERATIONS.generation()` covers six keys, while
    // `creditCosts` carries `autopsy` and `trendBrowse` as well — both priced,
    // both uncovered, both slice 8's operations. So the day an autopsy is a
    // priced operation, a document with every mode at 0 and `autopsy` at 7
    // exempts a claim holder that owes 7 credits: the fail-open direction.
    //
    // THE PARTITION IS THE GUARD, and it is derived from the DOCUMENT rather
    // than restated: probed keys plus registered-unprobed keys is exactly
    // `Object.keys(content.creditCosts)`, with no key on both sides. Adding a
    // `creditCosts` key reddens this until somebody says which side it is on;
    // wiring one of the registered keys into an operation reddens it until the
    // entry is deleted. Registering a new priced operation costs a line.
    const probed = probedCreditCostKeys();
    // The six, by name — the instance beside the class, so a derivation that
    // silently returned nothing could not satisfy the partition either.
    expect(probed).toEqual([
      "caption",
      "fullScript",
      "hookSet",
      "ideationBatch",
      "revision",
      "spin",
    ]);
    const unprobed = Object.keys(UNPROBED_CREDIT_COST_KEYS).sort();
    expect(
      probed.filter((k) => unprobed.includes(k)),
      "a key is both probed and registered as unprobed"
    ).toEqual([]);
    expect(
      [...probed, ...unprobed].sort(),
      "a priced key is on neither side of the partition — probe it, or register it with the reason it cannot be"
    ).toEqual(Object.keys(seed.creditCosts).sort());
    // A registration with no reason is a line somebody added to go green.
    for (const [key, why] of Object.entries(UNPROBED_CREDIT_COST_KEYS)) {
      expect(why.length, `${key} is registered for no stated reason`).toBeGreaterThan(
        40
      );
    }
  });

  it("...and the measurement behind it: `autopsy` is priced and no probe reaches it", () => {
    // THE FACT, RUN. With every generation key at zero and `autopsy` at 7 the
    // derivation still exempts BOTH purposes, because nothing prices an
    // autopsy yet. Today that is correct — no attempt can carry that price —
    // and it is exactly what makes the register above necessary rather than
    // decorative: the same document one slice later is a hidden lost debit.
    const trap: RespinConfigV1 = {
      ...withGenerationCosts(seed, 0),
      creditCosts: { ...withGenerationCosts(seed, 0).creditCosts, autopsy: 7 },
    };
    expect(includedBuildPurposes(trap)).toEqual([
      GENERATION_PURPOSE,
      ONBOARDING_BRAIN_PURPOSE,
    ]);
    expect(trap.creditCosts.autopsy, "the fixture did not move the price").toBe(7);
    expect(
      probedCreditCostKeys().includes("autopsy"),
      "autopsy is probed now — delete its UNPROBED_CREDIT_COST_KEYS entry"
    ).toBe(false);
  });

  it("R10 (slice 8c): `autopsy` now HAS a reader and is STILL unprobed — the reason names the reader, the decision, and the partition it does not widen", () => {
    // R-98 made `creditCosts.autopsy` the price of a creator's pasted
    // reference. The key is priced by `submitPastedReference`, which is not a
    // `PricedOperation` of any purpose — so the partition above is unchanged
    // (no new probed key, no new purpose) and the register entry must say
    // WHY rather than keep calling the key system overhead alone.
    expect(PASTED_REFERENCE_CREDIT_COST_KEY).toBe("autopsy");
    expect(UNPROBED_CREDIT_COST_KEYS[PASTED_REFERENCE_CREDIT_COST_KEY]).toContain("pasted-reference.ts");
    expect(UNPROBED_CREDIT_COST_KEYS[PASTED_REFERENCE_CREDIT_COST_KEY]).toContain("R-98");
    expect(UNPROBED_CREDIT_COST_KEYS[PASTED_REFERENCE_CREDIT_COST_KEY]).toContain("R-90");
    expect(includedBuildPurposes(seed)).not.toContain("autopsy");
    // The register's reason cites a file — which must exist and must really
    // read the key, or the reason is prose about a reader that is not there.
    const here = dirname(fileURLToPath(import.meta.url));
    const reader = readFileSync(resolve(join(here, "..", "src", "pasted-reference.ts")), "utf8");
    expect(reader).toContain('PASTED_REFERENCE_CREDIT_COST_KEY = "autopsy"');
    expect(reader).toMatch(/content\.creditCosts\[PASTED_REFERENCE_CREDIT_COST_KEY\]/);
  });

  it("keeps system autopsy overhead and zero-cost trend browsing outside creator included-build claims", () => {
    expect(UNPROBED_CREDIT_COST_KEYS.autopsy).toContain("system overhead");
    expect(UNPROBED_CREDIT_COST_KEYS.trendBrowse).toContain("read entitlement");
    expect(UNPROBED_CREDIT_COST_KEYS.trendBrowse).toContain("not a build or debit");
  });

  it("the `@respin/db` suite drives reconcileSpend with the SAME list", () => {
    // `packages/db` cannot import this package (the edge runs one way), so its
    // suite passes a literal. A literal that drifts from what this function
    // returns for the SEEDED document would leave every reconciliation case
    // testing an input production never uses. Read from the file rather than
    // trusted, in the same action that claims it (CLAUDE.md golden rule 1).
    const here = dirname(fileURLToPath(import.meta.url));
    const suite = readFileSync(
      resolve(join(here, "..", "..", "db", "tests", "spend-rollup.test.ts")),
      "utf8"
    );
    const m = suite.match(
      /const INCLUDED_BUILD_PURPOSES: readonly string\[\] = (\[[^\]]*\]);/
    );
    expect(m, "the db suite no longer declares the fixture this test reads").not.toBeNull();
    expect(JSON.parse(m![1].replace(/'/g, '"'))).toEqual([
      ...includedBuildPurposes(seed),
    ]);
  });
});

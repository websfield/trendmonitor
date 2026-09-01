// R12/R13/R16 — THE PER-PURPOSE PRICE, ITS CONFIG PATHS AND ITS BOUND.
//
// PURE: none of these functions runs a query, which is why they can be driven
// exhaustively here rather than one case at a time behind a vendor stub.
//
// WHAT MUTATION M6 IS ("generation shares ONBOARDING_BRAIN_PURPOSE") AND WHY
// IT REDDENS HERE: the two purposes price from different facts, so collapsing
// them changes the NUMBER a creator is charged — a first-ever hook set would
// come back free (the included onboarding build) and every one after it would
// cost `onboardingBrainRebuild` (50) instead of `hookSet` (2). Both directions
// are asserted below.
import { describe, expect, it } from "vitest";
import { CONFIG_V1_SEED } from "@respin/db";
import { respinConfigV1, type RespinConfigV1 } from "@respin/config";
import { MODE_IDS, MODE_SPECS } from "@respin/modes";
import {
  GENERATION_PURPOSE,
  ONBOARDING_BRAIN_PURPOSE,
  priceOf,
  requiredConfigPaths,
  unchargedAttemptCap,
  unchargedAttemptWindowStart,
} from "../src/inference";
import {
  GenerationUnchargedAttemptCapError,
  UNCHARGED_CAP_WINDOW_CLAUSE,
  UnchargedAttemptCapError,
  UnpricedOperationError,
} from "../src/errors";

const content: RespinConfigV1 = respinConfigV1.parse(CONFIG_V1_SEED);

describe("priceOf, per purpose (R12/R13)", () => {
  it("onboarding prices from PRIOR ATTEMPTS: the first is included, the rest are rebuilds", () => {
    expect(
      priceOf(content, {
        purpose: ONBOARDING_BRAIN_PURPOSE,
        priorBillableAttempts: 0,
      })
    ).toBe(content.creditCosts.onboardingBrainBuild);
    expect(
      priceOf(content, {
        purpose: ONBOARDING_BRAIN_PURPOSE,
        priorBillableAttempts: 1,
      })
    ).toBe(content.creditCosts.onboardingBrainRebuild);
  });

  it("a generation prices from its MODE, every time — there is no included generation", () => {
    for (const mode of MODE_IDS) {
      const key = MODE_SPECS[mode].creditCostKey;
      expect(
        priceOf(content, { purpose: GENERATION_PURPOSE, creditCostKey: key })
      ).toBe(content.creditCosts[key]);
    }
    // `creditCosts.hookSet` has been seeded since M1 with NO reader. This is
    // that reader, and the value it reads is the PRD's launch default.
    expect(
      priceOf(content, {
        purpose: GENERATION_PURPOSE,
        creditCostKey: "hookSet",
      })
    ).toBe(2);
  });

  it("M6: the two purposes give DIFFERENT answers — sharing one would mis-price both ways", () => {
    const asGeneration = priceOf(content, {
      purpose: GENERATION_PURPOSE,
      creditCostKey: "hookSet",
    });
    const asFirstOnboarding = priceOf(content, {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      priorBillableAttempts: 0,
    });
    const asLaterOnboarding = priceOf(content, {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      priorBillableAttempts: 3,
    });
    expect(asGeneration).not.toBe(asFirstOnboarding); // 2 vs a free build
    expect(asGeneration).not.toBe(asLaterOnboarding); // 2 vs 50
  });

  it("an unknown purpose is a TYPED refusal, not a silent zero", () => {
    // The compile-time half is the `never` assignment in the switch; this is
    // the runtime half, which a cast cannot defeat. A `default: return 0` here
    // would charge nothing for an operation nobody priced.
    expect(() =>
      priceOf(content, { purpose: "spin_autopsy" } as never)
    ).toThrow(UnpricedOperationError);
  });
});

describe("requiredConfigPaths, per purpose (R13/A-9)", () => {
  const model = "claude-sonnet-5";
  const cheap = "claude-haiku-4-5";
  /** The roles a caller that is about to make BOTH calls names. */
  const both = { generation: model, classification: cheap };

  it("names the price keys the OPERATION depends on, and nothing wider", () => {
    const onboarding = requiredConfigPaths({ generation: model }, {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      priorBillableAttempts: 0,
    });
    expect(onboarding).toContain("creditCosts.onboardingBrainBuild");
    expect(onboarding).toContain("creditCosts.onboardingBrainRebuild");
    expect(onboarding).not.toContain("creditCosts.hookSet");

    const hooks = requiredConfigPaths(both, {
      purpose: GENERATION_PURPOSE,
      creditCostKey: "hookSet",
    });
    expect(hooks).toContain("creditCosts.hookSet");
    // AS NARROW AS THE SPEND IT GUARDS: a creator who only generates hooks is
    // never refused for a `spin` price they do not use.
    expect(hooks).not.toContain("creditCosts.spin");
    expect(hooks).not.toContain("creditCosts.onboardingBrainRebuild");
  });

  it("every mode's own key is required when that mode is priced", () => {
    for (const mode of MODE_IDS) {
      const key = MODE_SPECS[mode].creditCostKey;
      expect(
        requiredConfigPaths(both, {
          purpose: GENERATION_PURPOSE,
          creditCostKey: key,
        })
      ).toContain(`creditCosts.${key}`);
    }
  });

  it("both purposes require the generation model, the reply ceiling and THAT model's price row", () => {
    for (const op of [
      { purpose: ONBOARDING_BRAIN_PURPOSE, priorBillableAttempts: 0 } as const,
      { purpose: GENERATION_PURPOSE, creditCostKey: "hookSet" } as const,
    ]) {
      const paths = requiredConfigPaths(both, op);
      expect(paths).toContain("llm.models.generation");
      expect(paths).toContain("llm.maxOutputTokens");
      expect(paths).toContain(`llm.prices.${model}`);
      // THRESHOLDS ARE DELIBERATELY ABSENT: a defaulted bound still bounds,
      // whereas a defaulted price bills someone against a number nobody chose.
      expect(paths).not.toContain("llm.overallDeadlineMs");
      expect(paths.some((p) => p.includes("maxUnchargedBillableAttempts"))).toBe(
        false
      );
    }
  });

  it("B5: a GENERATION names the CHEAP model and its price row — the kill-test scoring call is not free", () => {
    // `llm.models.classification` (Haiku-class, seeded since M1) had ZERO
    // production readers while `generate` ran BOTH its calls on the generation
    // model, so every successful hook set cost two Sonnet calls where card R5
    // specifies "the cheap model call". A cost we incur and cannot price
    // overstates margin, which is the dangerous direction for the one number
    // R-6 tunes pricing against.
    const hooks = requiredConfigPaths(both, {
      purpose: GENERATION_PURPOSE,
      creditCostKey: "hookSet",
    });
    expect(hooks).toContain("llm.models.classification");
    expect(hooks).toContain(`llm.prices.${cheap}`);
    expect(hooks).toContain(`llm.prices.${model}`);
  });

  it("ONBOARDING names no classification model at all — as narrow as the calls it makes", () => {
    // One completion, no scoring call. A voice build must not be refused for a
    // price row it never spends against.
    const paths = requiredConfigPaths({ generation: model }, {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      priorBillableAttempts: 0,
    });
    expect(paths).not.toContain("llm.models.classification");
    expect(paths).not.toContain(`llm.prices.${cheap}`);
  });

  it("a caller that names NO scoring model still requires the model id, and NOT its price row", () => {
    // THE SETTLEMENT SHAPE, driven — `ModelsInUse.classification` is optional
    // and an optional field nobody drives on both sides is a decoration. The
    // settlement transaction calls no vendor, so refusing it over a price row
    // could only strand a generation already paid for.
    const settling = requiredConfigPaths({ generation: model }, {
      purpose: GENERATION_PURPOSE,
      creditCostKey: "hookSet",
    });
    expect(settling).toContain("llm.models.classification");
    expect(settling).not.toContain(`llm.prices.${cheap}`);
    expect(settling).toContain("creditCosts.hookSet");

    // THE RESIDUAL THE CARVE-OUT DOES *NOT* CLOSE, asserted rather than
    // implied (billing gate round 2, 2026-09-01). `generate.ts`'s comment at
    // the settlement read used to finish "what this read still fails closed on
    // is the price that decides the DEBIT", which reads as though the vendor
    // price rows had been excluded. They have not: `shared` puts
    // `llm.prices.<generation model>` on the list, and that row is a VENDOR
    // COST — `priceOf` never consults it and it decides no debit — so an
    // operator who removes it between the pre-call read and settlement still
    // strands a generation we have already paid a vendor for. That is the same
    // failure the classification carve-out was written against, one model
    // over. It is PRE-EXISTING and deliberately left open here: narrowing
    // `shared` widens the documents every settlement accepts, on the money
    // path, and that deserves its own change. This line is its witness, so
    // whoever closes it turns a red test rather than wondering whether the
    // inclusion was load-bearing.
    expect(
      settling,
      "the settlement still fails closed on a VENDOR price row it never reads — see generate.ts's settle() note"
    ).toContain(`llm.prices.${model}`);
  });

  it("every path it names is really IN the seeded document", () => {
    // A required path that does not exist in the seed would refuse EVERY
    // operation on a freshly seeded install — the control becoming the outage.
    const read = (doc: unknown, path: string): unknown =>
      path.split(".").reduce<unknown>((node, seg) => {
        if (typeof node !== "object" || node === null) return undefined;
        return (node as Record<string, unknown>)[seg];
      }, doc);
    for (const mode of MODE_IDS) {
      for (const path of requiredConfigPaths(both, {
        purpose: GENERATION_PURPOSE,
        creditCostKey: MODE_SPECS[mode].creditCostKey,
      })) {
        expect(read(CONFIG_V1_SEED, path), path).toBeDefined();
      }
    }
  });

  it("an unknown purpose refuses rather than returning an empty path list", () => {
    // AN EMPTY LIST WOULD BE THE DANGEROUS ANSWER: `getActiveConfigRequiringStored`
    // asserts every path it is given, so `[]` is "nothing to check" — a debit
    // priced against a document nobody validated.
    expect(() =>
      requiredConfigPaths(both, { purpose: "spin_autopsy" } as never)
    ).toThrow(UnpricedOperationError);
  });
});

describe("the uncharged-billable bound, per purpose (R16)", () => {
  it("each purpose reads its OWN config key", () => {
    expect(unchargedAttemptCap(content, ONBOARDING_BRAIN_PURPOSE)).toBe(
      content.onboarding.maxUnchargedBillableAttempts
    );
    expect(unchargedAttemptCap(content, GENERATION_PURPOSE)).toBe(
      content.generation.maxUnchargedBillableAttempts
    );
  });

  it("moving one key does NOT move the other", () => {
    const moved: RespinConfigV1 = {
      ...content,
      generation: { ...content.generation, maxUnchargedBillableAttempts: 11 },
    };
    expect(unchargedAttemptCap(moved, GENERATION_PURPOSE)).toBe(11);
    expect(unchargedAttemptCap(moved, ONBOARDING_BRAIN_PURPOSE)).toBe(
      content.onboarding.maxUnchargedBillableAttempts
    );
  });

  it("the cap the seed ships is ABOVE the widest legal burst, or it is not a bound", () => {
    // The count runs outside any lock, so N presses in flight together can each
    // read `cap - 1` and all pass — the bound's accepted width is ONE BURST of
    // the tier's slot limit. A cap at or below the largest `concurrencyLimits`
    // entry is therefore a cap a single legal burst exhausts: unenforceable as
    // a bound, and (before the window) permanent as a refusal. This is where
    // the 10 comes from, so lowering either number without the other is red.
    const widestBurst = Math.max(...Object.values(content.concurrencyLimits));
    expect(
      unchargedAttemptCap(content, GENERATION_PURPOSE)
    ).toBeGreaterThan(widestBurst);
  });

  it("GENERATION counts within a WINDOW; ONBOARDING counts a LIFETIME — and each says so", () => {
    // AN UNWINDOWED COUNT OVER AN APPEND-ONLY TABLE IS A PERMANENT REFUSAL
    // (billing gate, 2026-09-01). The two purposes answer this differently and
    // both answers are driven, because a `Record` whose second branch nothing
    // executes is a decoration.
    const now = new Date("2026-09-01T12:00:00Z");
    expect(
      unchargedAttemptWindowStart(content, GENERATION_PURPOSE, now)
    ).toEqual(
      new Date(
        now.getTime() - content.generation.unchargedAttemptWindowMinutes * 60_000
      )
    );
    expect(
      unchargedAttemptWindowStart(content, ONBOARDING_BRAIN_PURPOSE, now)
    ).toEqual(new Date(0));
    // ...and the generation window really is a window, not the epoch wearing a
    // subtraction.
    expect(
      unchargedAttemptWindowStart(content, GENERATION_PURPOSE, now).getTime()
    ).toBeGreaterThan(0);
  });

  it("the window MOVES with its config key, so an operator can widen it without a deploy", () => {
    const now = new Date("2026-09-01T12:00:00Z");
    const wider: RespinConfigV1 = {
      ...content,
      generation: { ...content.generation, unchargedAttemptWindowMinutes: 600 },
    };
    expect(
      unchargedAttemptWindowStart(wider, GENERATION_PURPOSE, now)
    ).toEqual(new Date(now.getTime() - 600 * 60_000));
  });

  it("the two purposes are DIFFERENT strings — R12's whole point", () => {
    expect(GENERATION_PURPOSE).not.toBe(ONBOARDING_BRAIN_PURPOSE);
  });

  it("the exposure figure is checked against BOTH documents that can produce it", () => {
    // THE POPULATION IS A LIST OF TWO, and finding that out cost a planted
    // mutation (billing gate round 2, 2026-09-01). The comment carrying this
    // arithmetic lives in `schema.ts` and cites the SCHEMA'S OWN DEFAULTS;
    // `content` below is parsed from `CONFIG_V1_SEED`, which is a separate
    // literal in `@respin/db`. Changing `maxOutputTokens` in the schema
    // default alone left the check GREEN — the guard covered one member of its
    // population and looked like it covered the class, which is CLAUDE.md's
    // 2026-08-29 lesson exactly. Both are asserted, and a third document that
    // can price a generation owes an entry here.
    const defaults = respinConfigV1.parse({
      ...CONFIG_V1_SEED,
      llm: undefined,
      generation: undefined,
    });
    for (const [where, doc] of [
      ["the seeded document", content],
      ["the schema's own defaults", defaults],
    ] as const) {
      const sonnet = doc.llm.prices[doc.llm.models.generation];
      const haiku = doc.llm.prices[doc.llm.models.classification];
      expect(sonnet, `${where}: no generation price row`).toBeDefined();
      expect(haiku, `${where}: no classification price row`).toBeDefined();
      const perAttempt =
        2 * doc.llm.maxOutputTokens * sonnet!.outputNanoUsdPerToken +
        doc.llm.maxOutputTokens * haiku!.outputNanoUsdPerToken;
      expect(perAttempt, `${where}: per-attempt output ceiling moved`).toBe(
        140_000_000
      );
      expect(
        doc.generation.maxUnchargedBillableAttempts * perAttempt,
        `${where}: the per-window figure schema.ts cites is stale`
      ).toBe(1_400_000_000);
    }
    // NON-VACUITY: the two documents really are two, so the loop is not
    // asserting the same object twice.
    expect(defaults.llm).not.toBe(content.llm);
  });

  it("the CITED exposure is arithmetic on the seeded document, not a remembered number", () => {
    // WHY THIS TEST EXISTS (billing gate round 2, 2026-09-01). `schema.ts`
    // justified `maxUnchargedBillableAttempts: 10` with
    // "10 x maxOutputTokens x sonnet output = 0.60 USD per profile per
    // window" — a PER-CALL figure against a cap that counts PER ATTEMPT
    // (`countUnchargedBillableAttempts` is `countDistinct(attempt_id)`), which
    // understated the ceiling by more than half in the direction that flatters
    // us. The number 10 survived the correction; the arithmetic did not, and a
    // figure in a comment that nothing recomputes is how it went stale in the
    // first place.
    //
    // THE COUNTED WORST CASE IS A REAL PATH: draft 1 parses, its kill test
    // fails, R6's one rewrite runs, draft 2 parses and is accepted, and the
    // SCORING reply is the one this product cannot parse — three billable
    // calls, no debit, ONE attempt id. `pipeline.ts` has exactly two
    // `generate` expressions and no loop, so three is the ceiling on calls per
    // attempt, not a guess.
    const ceiling = content.llm.maxOutputTokens;
    const sonnet = content.llm.prices[content.llm.models.generation];
    const haiku = content.llm.prices[content.llm.models.classification];
    expect(sonnet, "the generation model has no seeded price row").toBeDefined();
    expect(haiku, "the classification model has no seeded price row").toBeDefined();

    const perAttemptNanoUsd =
      2 * ceiling * sonnet!.outputNanoUsdPerToken +
      ceiling * haiku!.outputNanoUsdPerToken;
    expect(perAttemptNanoUsd).toBe(140_000_000);

    const perWindowNanoUsd =
      unchargedAttemptCap(content, GENERATION_PURPOSE) * perAttemptNanoUsd;
    expect(perWindowNanoUsd).toBe(1_400_000_000);
    expect(perWindowNanoUsd / 1_000_000_000).toBeCloseTo(1.4, 6);

    // THE SUPERSEDED FIGURE, ASSERTED AS SUPERSEDED. 0.60 USD was one output
    // ceiling per attempt; naming it here means a future edit that quietly
    // restores the per-call grain reddens instead of reading plausibly.
    const perCallOnly =
      unchargedAttemptCap(content, GENERATION_PURPOSE) *
      ceiling *
      sonnet!.outputNanoUsdPerToken;
    expect(perCallOnly).toBe(600_000_000);
    expect(perWindowNanoUsd).toBeGreaterThan(perCallOnly);

    // AND IT IS A FLOOR, NOT THE CEILING: no key here bounds INPUT tokens, and
    // all three calls pay for them (the rewrite's prompt carries draft 1's
    // whole reply). Asserting the input prices are non-zero is what makes
    // "1.40 is a floor" a checked statement rather than a hedge — if they were
    // zero, output really would be the whole story.
    expect(sonnet!.inputNanoUsdPerToken).toBeGreaterThan(0);
    expect(haiku!.inputNanoUsdPerToken).toBeGreaterThan(0);
    expect(
      Object.keys(content.llm).includes("maxInputTokens"),
      "an input ceiling exists now — the exposure comment must stop calling 1.40 a floor"
    ).toBe(false);
  });
});

describe("the uncharged-cap REFUSAL COPY answers its own window (billing gate round 2)", () => {
  // THE DEFECT THIS PINS. `GenerationUnchargedAttemptCapError` shipped under a
  // docblock inherited from its onboarding sibling — "LIKE ITS SIBLING, THE
  // COUNT IS LIFETIME … the copy must not imply the cap ages out" — written in
  // the same pass that windowed the generation count. The message a creator
  // read said "There is nothing for you to change", which withheld the one
  // remedy that now exists: wait. Nothing pinned either string.
  //
  // DERIVED FROM `unchargedAttemptWindowStart`, the single authority on which
  // purpose is windowed, so un-windowing generation (or windowing onboarding)
  // reddens the SENTENCE rather than silently making it a lie.
  const now = new Date("2026-09-01T12:00:00Z");
  const windowed = (purpose: "generation" | "onboarding_brain") =>
    unchargedAttemptWindowStart(content, purpose, now).getTime() > 0;

  it("the two purposes really answer differently — without that, nothing below proves anything", () => {
    expect([windowed(GENERATION_PURPOSE), windowed(ONBOARDING_BRAIN_PURPOSE)]).toEqual([
      true,
      false,
    ]);
  });

  it("the WINDOWED message names its window and promises the clearing; the LIFETIME one does neither", () => {
    const minutes = content.generation.unchargedAttemptWindowMinutes;
    const gen = new GenerationUnchargedAttemptCapError(10, 10, minutes);
    expect(windowed(GENERATION_PURPOSE)).toBe(true);
    expect(gen.message).toContain(UNCHARGED_CAP_WINDOW_CLAUSE);
    // THE NUMBER IS IN THE MESSAGE, and it is the one it was constructed with
    // rather than a second config read that could disagree with the count.
    expect(gen.message).toContain(`in the last ${minutes} minutes`);
    expect(gen.windowMinutes).toBe(minutes);
    // A DIFFERENT WINDOW REALLY PRODUCES A DIFFERENT SENTENCE, so the number
    // is not a literal that happens to match the seed.
    expect(new GenerationUnchargedAttemptCapError(10, 10, 5).message).toContain(
      "in the last 5 minutes"
    );

    const onboarding = new UnchargedAttemptCapError(3, 3);
    expect(windowed(ONBOARDING_BRAIN_PURPOSE)).toBe(false);
    expect(onboarding.message).not.toContain(UNCHARGED_CAP_WINDOW_CLAUSE);
    // ...and it does not sprout a window of its own by accident.
    expect(onboarding.message).not.toMatch(/in the last \d+ minutes/);
  });

  it("neither message promises the CAUSE is fixed by waiting — clearing and fixing are different claims", () => {
    // The bound exists because the failure is deterministic and repeats. A
    // sentence that read "wait and it will work" would be the opposite defect
    // to the one being fixed: a guarantee this product cannot make.
    const gen = new GenerationUnchargedAttemptCapError(10, 10, 60);
    expect(gen.message.toLowerCase()).toContain("until the cause is fixed");
    expect(gen.message.toLowerCase()).not.toContain("nothing for you to change");
  });
});

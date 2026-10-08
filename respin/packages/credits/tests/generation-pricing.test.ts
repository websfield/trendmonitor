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
import { MODE_IDS, MODE_SPECS, UnknownModeError } from "@respin/modes";
import { REVISION_CREDIT_COST_KEY, generationOp } from "../src/generate";
import { rewriteExemptOverheadBytes, worstCaseAttemptNanoUsd } from "./support/attempt-worst-case";
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
  it("onboarding prices from THE CLAIM: unclaimed is free, mine is free, somebody else's is a rebuild", () => {
    // THE THREE BRANCHES, and the third is the fix (R-80). The old signature
    // took a COUNT of prior attempts and could not express "the claim is held
    // by another attempt" at all — which is exactly the state the loser of a
    // race is in, and exactly the state that used to price as a free build.
    expect(
      priceOf(content, {
        purpose: ONBOARDING_BRAIN_PURPOSE,
        includedBuildHolder: null,
        attemptId: "att-a",
      }),
      "nothing has claimed this profile's included build yet"
    ).toBe(content.creditCosts.onboardingBrainBuild);
    expect(
      priceOf(content, {
        purpose: ONBOARDING_BRAIN_PURPOSE,
        includedBuildHolder: "att-a",
        attemptId: "att-a",
      }),
      "this attempt WON the claim — it is the included build"
    ).toBe(content.creditCosts.onboardingBrainBuild);
    expect(
      priceOf(content, {
        purpose: ONBOARDING_BRAIN_PURPOSE,
        includedBuildHolder: "att-a",
        attemptId: "att-b",
      }),
      "another attempt holds the claim — this one is a rebuild"
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
      includedBuildHolder: null,
      attemptId: "att-a",
    });
    const asLaterOnboarding = priceOf(content, {
      purpose: ONBOARDING_BRAIN_PURPOSE,
      includedBuildHolder: "att-earlier",
      attemptId: "att-a",
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

describe("generationOp: what a generation is priced AS (slice 7, R8)", () => {
  it("an original is priced by its MODE — every one of the seven", () => {
    for (const mode of MODE_IDS) {
      const op = generationOp(mode, false);
      expect(op.purpose).toBe(GENERATION_PURPOSE);
      expect(op, mode).toEqual({
        purpose: GENERATION_PURPOSE,
        creditCostKey: MODE_SPECS[mode].creditCostKey,
      });
      expect(priceOf(content, op), mode).toBe(
        content.creditCosts[MODE_SPECS[mode].creditCostKey]
      );
    }
  });

  it("M3: a REVISION is priced as a revision WHATEVER the parent mode was", () => {
    // THE MUTATION THIS REDDENS is "revision priced at the parent mode's cost",
    // which is a one-line edit in `generationOp`. Driving it over ALL SEVEN
    // modes is what makes it a real assertion rather than a coincidence: two of
    // the modes (`hooks`, and any other mode an operator prices at 2) have a
    // cost EQUAL to the revision price, so a test on one mode could pass while
    // the mutation was live.
    for (const mode of MODE_IDS) {
      expect(generationOp(mode, true), mode).toEqual({
        purpose: GENERATION_PURPOSE,
        creditCostKey: REVISION_CREDIT_COST_KEY,
      });
      expect(priceOf(content, generationOp(mode, true)), mode).toBe(
        content.creditCosts.revision
      );
    }
    // NON-VACUITY: the revision price differs from at least one mode's price,
    // so "priced as a revision" is a distinguishable claim. It deliberately
    // does not require it to differ from EVERY mode — `hookSet` is also 2 in
    // the seed, and that is an operator's number to set, not this test's.
    const modePrices = MODE_IDS.map(
      (m) => content.creditCosts[MODE_SPECS[m].creditCostKey]
    );
    expect(
      modePrices.filter((p) => p !== content.creditCosts.revision).length,
      "every mode costs exactly what a revision costs, so nothing here can distinguish the two"
    ).toBeGreaterThan(0);
  });

  it("the revision key is a REAL key of the stored document, and it is not a mode's", () => {
    // `creditCosts.revision` has been seeded at 2 since M1 with no reader.
    // This is that reader, and the value it reads is the PRD's launch default.
    expect(Object.keys(content.creditCosts)).toContain(REVISION_CREDIT_COST_KEY);
    expect(content.creditCosts.revision).toBe(2);
    expect(MODE_IDS.map((m) => MODE_SPECS[m].creditCostKey)).not.toContain(
      REVISION_CREDIT_COST_KEY
    );
  });

  it("a revision fails closed on its OWN price row, never the mode's", () => {
    // R19/A-9: the config paths a REVISION depends on name
    // `creditCosts.revision`, so a stored document that lost that key refuses
    // the revision rather than silently charging the mode's number.
    const paths = requiredConfigPaths(
      { generation: "claude-sonnet-5", classification: "claude-haiku-4-5" },
      generationOp("ideaToScript", true)
    );
    expect(paths).toContain("creditCosts.revision");
    expect(paths).not.toContain("creditCosts.fullScript");
  });

  it("an unknown mode cannot be priced at all", () => {
    // `generationOp` goes through `modeSpec`, which refuses a string that is
    // not one of the seven — so there is no path through the price lookup that
    // returns a key nobody chose.
    expect(() => generationOp("seriesPlanner" as never, false)).toThrow(
      UnknownModeError
    );
    // ...and the REVISION branch refuses it too, rather than pricing an
    // unknown mode's revision because the mode never had to be resolved.
    expect(() => generationOp("seriesPlanner" as never, true)).toThrow(
      UnknownModeError
    );
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
      includedBuildHolder: null,
      attemptId: "att-a",
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
      {
        purpose: ONBOARDING_BRAIN_PURPOSE,
        includedBuildHolder: null,
        attemptId: "att-a",
      } as const,
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
      includedBuildHolder: null,
      attemptId: "att-a",
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
        420_000_000
      );
      expect(
        doc.generation.maxUnchargedBillableAttempts * perAttempt,
        `${where}: the per-window figure schema.ts cites is stale`
      ).toBe(4_200_000_000);
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
    expect(perAttemptNanoUsd).toBe(420_000_000);

    const perWindowNanoUsd =
      unchargedAttemptCap(content, GENERATION_PURPOSE) * perAttemptNanoUsd;
    expect(perWindowNanoUsd).toBe(4_200_000_000);
    expect(perWindowNanoUsd / 1_000_000_000).toBeCloseTo(4.2, 6);

    // THE SUPERSEDED GRAIN, ASSERTED AS SUPERSEDED. The old comment counted
    // ONE output ceiling per attempt where the cap counts three calls; at the
    // 2026-09-01 ceiling that read 0.60 USD against a true 1.40, and at
    // today's it would read 1.80 against a true 4.20. The NUMBERS move with
    // `maxOutputTokens`; the DEFECT was the grain, so what is pinned here is
    // that the per-call figure and the per-attempt figure stay different — a
    // future edit that quietly restores the per-call grain reddens instead of
    // reading plausibly.
    const perCallOnly =
      unchargedAttemptCap(content, GENERATION_PURPOSE) *
      ceiling *
      sonnet!.outputNanoUsdPerToken;
    expect(perCallOnly).toBe(1_800_000_000);
    expect(perWindowNanoUsd).toBeGreaterThan(perCallOnly);

    // THE INPUT HALF IS BOUNDED NOW (audit P3-R2, R-158): `llm.maxInputTokens`
    // caps every call's assembled input, so 4.20 is no longer "a floor" — it is
    // the OUTPUT half of a bounded per-window figure. The input prices are
    // non-zero, so the input half is real, and it is recomputed below.
    expect(sonnet!.inputNanoUsdPerToken).toBeGreaterThan(0);
    expect(haiku!.inputNanoUsdPerToken).toBeGreaterThan(0);
    expect(Object.keys(content.llm)).toContain("maxInputTokens");
  });

  it("audit P3-R3 (R-158 point 7): the per-attempt worst case is 1.199998 USD, recomputed from config with the exempt drafts counted, and the window total covers at least 50 of them", () => {
    // THE UNIT, NOT A MAXIMUM. Per counted attempt: three calls to the output
    // ceiling (two drafts on the generation model, one scoring on the
    // classification model), three bounded inputs at the input ceiling, and
    // the two vendor drafts the rewrite and the scoring call carry EXEMPT
    // from that ceiling (`support/attempt-worst-case.ts`, the one pricing of
    // an attempt both this file and the ceiling's derivation read). A
    // max-COST attempt is not a max-DURATION one, which is why the chosen
    // bound is a runaway bound and not a derived maximum (R-158).
    const overhead = rewriteExemptOverheadBytes();
    expect(overhead).toBe(579);
    for (const [where, doc] of [
      ["the seeded document", content],
      ["the schema's own defaults", respinConfigV1.parse({ ...CONFIG_V1_SEED, llm: undefined, generation: undefined })],
    ] as const) {
      const sonnet = doc.llm.prices[doc.llm.models.generation]!;
      const haiku = doc.llm.prices[doc.llm.models.classification]!;
      const output =
        2 * doc.llm.maxOutputTokens * sonnet.outputNanoUsdPerToken +
        doc.llm.maxOutputTokens * haiku.outputNanoUsdPerToken;
      const input =
        2 * doc.llm.maxInputTokens * sonnet.inputNanoUsdPerToken +
        doc.llm.maxInputTokens * haiku.inputNanoUsdPerToken;
      const exempt =
        (doc.llm.maxOutputTokens + overhead) * sonnet.inputNanoUsdPerToken +
        doc.llm.maxOutputTokens * haiku.inputNanoUsdPerToken;
      expect(output, where).toBe(420_000_000);
      expect(input, where).toBe(730_261_000);
      expect(exempt, where).toBe(49_737_000);
      const perAttemptNanoUsd = output + input + exempt;
      // The hand arithmetic above and the shared helper agree.
      expect(worstCaseAttemptNanoUsd(doc.llm, overhead).total, where).toBe(perAttemptNanoUsd);
      expect(perAttemptNanoUsd / 1_000_000_000, where).toBeCloseTo(1.199998, 9);
      // THE MARGIN, BOTH WAYS: at one token more on the ceiling, the window
      // no longer covers 50 attempts — so a raised ceiling or a raised price
      // without a matching window decision is red here.
      expect(
        doc.generation.maxBillableCostMicroUsdPerWindow * 1000,
        `${where}: the ceiling is not at the margin rule's edge`
      ).toBeLessThan(50 * worstCaseAttemptNanoUsd({ ...doc.llm, maxInputTokens: doc.llm.maxInputTokens + 1 }, overhead).total);
      // The bound is micro-USD; the unit is nano-USD.
      const boundNanoUsd = doc.generation.maxBillableCostMicroUsdPerWindow * 1000;
      expect(
        boundNanoUsd,
        `${where}: a price or ceiling change quietly halved the window's headroom`
      ).toBeGreaterThanOrEqual(50 * perAttemptNanoUsd);
      // ...and it is the owner-chosen number, not one this test derives.
      expect(doc.generation.maxBillableCostMicroUsdPerWindow, where).toBe(60_000_000);
    }
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

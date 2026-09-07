// THE TIER -> FEATURE GATES, DRIVEN AGAINST ALL SEVEN MODES AND ALL FOUR TIERS
// (slice 6 R18; slice 7 R13/R14/R15).
//
// WHAT SLICE 6 GOT RIGHT AND WHAT IT GOT WRONG, because this file is the record
// of both. Right: driving the map over the whole `MODE_IDS` population rather
// than over the one mode that was built. Wrong, and it only became visible when
// stage B shipped the modes:
//
//   it("a mode in the plan but NOT BUILT is a different refusal", () => {
//     for (const mode of PRD_TABLE.free) {
//       if (IMPLEMENTED_MODES.includes(mode as never)) continue;   // <- here
//
// All three of Free's modes are built now, so `continue` fired on every
// iteration and the case asserted NOTHING while staying green. The sibling case
// ("the plan gate runs BEFORE the built gate") used `sourceToReel`, which is
// also built now, so it no longer distinguished the two gates either. That is
// CLAUDE.md's 2026-08-29 lesson exactly — a derived guard is only as wide as
// its population, and a population that can empty must SAY SO rather than skip.
//
// Slice 8 discharged that self-expiring rule: all seven modes are reachable,
// and the dead built-gate refusal was removed rather than kept as an unwitnessed
// branch. The tier map remains total and independently checked below.
//
// PURE, and that is the second claim: nothing here touches a database, because
// `mode-access.ts` is handed a RESOLVED tier and never derives one. The tier
// authority stays `getWorkspaceBillingState` (R-30 constraint 2), and
// `generate.test.ts` is where the two meet.
import { describe, expect, it } from "vitest";
import {
  IMPLEMENTED_MODES,
  MODE_IDS,
  MODE_SPECS,
  UnknownModeError,
  type ModeId,
} from "@respin/modes";
import { CONFIG_V1_SEED } from "@respin/db";
import {
  ENTITLEMENT_TIERS,
  MODE_TIERS,
  ModeNotInPlanError,
  TIER_MODES,
  TIER_PRIVATE_FRAMEWORKS,
  UnknownEntitlementTierError,
  assertModeAllowed,
  modeOffers,
  modeTiers,
  modesIncludedIn,
  planIncludesMode,
  privateFrameworkEntitlement,
  trackedNicheEntitlement,
  type EntitlementTier,
} from "../src/mode-access";
import { REVISION_CREDIT_COST_KEY } from "../src/generate";

const TIERS: EntitlementTier[] = ["free", "creator", "pro", "studio"];

/**
 * PRD §4G's "Modes" row, written out INDEPENDENTLY of the implementation.
 *
 * A test that read `MODE_TIERS` to decide what to expect would assert that the
 * map equals itself. This is the PRD's table, transcribed: Free gets "Hooks,
 * Captions, Ideas"; every paid tier gets "All 7".
 */
const PRD_TABLE: Record<EntitlementTier, string[]> = {
  free: ["hooks", "caption", "ideation"],
  creator: [...MODE_IDS],
  pro: [...MODE_IDS],
  studio: [...MODE_IDS],
};

/**
 * AN EIGHTH MODE, cast in — verification 5's "prove it by actually adding one".
 *
 * `Record<ModeId, …>` makes a mode with no entry a COMPILE error, and CLAUDE.md
 * 2026-08-21 is the reason that is not the end of it: proving a value cannot be
 * TYPED is not proving it cannot be CAST. This is what a mode id arriving from
 * a stale form post, a jsonb column or an `as` in a hurry looks like.
 */
const UNCLASSIFIED_MODE = "seriesPlanner" as unknown as ModeId;

describe("the mode -> tier map (R13/R14/R18)", () => {
  it("every mode has an entry, and the key space is exactly MODE_IDS", () => {
    // R14, THE COMPLETENESS HALF. A mode added to `MODE_IDS` without a row here
    // fails THIS, in addition to failing the compiler — and it fails here with
    // a message that names the mode rather than a type error at a map literal.
    expect(Object.keys(MODE_TIERS).sort()).toEqual([...MODE_IDS].sort());
  });

  it("every entry is PRD §4G's row, read from the mode side and the tier side", () => {
    for (const mode of MODE_IDS) {
      const expected = TIERS.filter((t) => PRD_TABLE[t].includes(mode));
      expect([...modeTiers(mode)].sort(), mode).toEqual(expected.sort());
    }
    // ...and the DERIVED per-tier view agrees with the same PRD table. It is
    // derived rather than written out precisely so it cannot disagree, and this
    // is the assertion that says so out loud.
    for (const tier of TIERS) {
      expect([...TIER_MODES[tier]].sort(), tier).toEqual(
        [...PRD_TABLE[tier]].sort()
      );
      expect([...modesIncludedIn(tier)].sort(), tier).toEqual(
        [...PRD_TABLE[tier]].sort()
      );
    }
    // The tier vocabulary as a VALUE matches the tier vocabulary as a TYPE:
    // `TIER_MODES` is a `Record<EntitlementTier, …>`, so its keys are the type.
    expect(Object.keys(TIER_MODES).sort()).toEqual([...ENTITLEMENT_TIERS].sort());
  });

  it("the whole tier x mode table is decided — 28 cases, not one", () => {
    const decided: string[] = [];
    for (const tier of TIERS) {
      for (const mode of MODE_IDS) {
        const allowed = planIncludesMode(tier, mode);
        expect(allowed).toBe(PRD_TABLE[tier].includes(mode));
        decided.push(`${tier}:${mode}:${allowed}`);
      }
    }
    expect(decided).toHaveLength(TIERS.length * MODE_IDS.length);
    // NON-VACUITY: the table really contains both answers. A map that returned
    // `true` everywhere would pass a "no exceptions thrown" test.
    expect(decided.filter((d) => d.endsWith(":false")).length).toBeGreaterThan(0);
    expect(decided.filter((d) => d.endsWith(":true")).length).toBeGreaterThan(0);
  });

  it("R14 / M2: an UNCLASSIFIED mode is refused, not allowed — driven by a CAST", () => {
    // MUTATION M2 IS "tier map defaults unknown modes to allowed". Under the
    // slice-6 shape it was not even a mutation: the three paid rows WERE
    // `MODE_IDS`, so an eighth mode was included on every paid tier the day it
    // was added, and no test could see it. All four entry points refuse now.
    expect(() => modeTiers(UNCLASSIFIED_MODE)).toThrow(UnknownModeError);
    expect(() => planIncludesMode("pro", UNCLASSIFIED_MODE)).toThrow(
      UnknownModeError
    );
    expect(() => assertModeAllowed("pro", UNCLASSIFIED_MODE)).toThrow(
      UnknownModeError
    );
    expect(() => assertModeAllowed("free", UNCLASSIFIED_MODE)).toThrow(
      UnknownModeError
    );
    // ...and it is not silently included in any tier's list either, which is
    // the shape a `default: allow` would have taken on the derived view.
    for (const tier of TIERS) {
      expect(modesIncludedIn(tier)).not.toContain(UNCLASSIFIED_MODE);
    }
  });

  it("Free is refused every mode its plan excludes, by NAME", () => {
    const excluded = MODE_IDS.filter((m) => !PRD_TABLE.free.includes(m));
    expect(excluded.length, "the Free case would be vacuous").toBe(4);
    for (const mode of excluded) {
      expect(() => assertModeAllowed("free", mode)).toThrow(ModeNotInPlanError);
    }
  });

  it("Spin is live for every paid tier and remains outside the Free entitlement", () => {
    for (const tier of ["creator", "pro", "studio"] as const) {
      expect(() => assertModeAllowed(tier, "analyseAndSpin")).not.toThrow();
    }
    expect(() => assertModeAllowed("free", "analyseAndSpin")).toThrow(
      ModeNotInPlanError
    );
  });

  it("all modes are now built, while tier access still decides Spin", () => {
    expect([...IMPLEMENTED_MODES].sort()).toEqual([...MODE_IDS].sort());
    // Every registry mode passes on every tier whose plan includes it.
    for (const tier of TIERS) {
      for (const mode of IMPLEMENTED_MODES) {
        if (!PRD_TABLE[tier].includes(mode)) continue;
        expect(() => assertModeAllowed(tier, mode), `${tier}:${mode}`).not.toThrow();
      }
    }
  });

  it("R15: the refusal names what the plan DOES include, and never sells an upgrade", () => {
    try {
      assertModeAllowed("free", "ideaToScript");
      throw new Error("expected a refusal");
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain("hooks");
      expect(message).toContain("Nothing was spent");
      // The `profile_cap` precedent in `app/(product)/billing-errors.ts`: a
      // refusal screen that says "upgrade" is taking money for a route the
      // product may not have finished building.
      expect(message.toLowerCase()).not.toContain("upgrade");
      expect(message.toLowerCase()).not.toContain("plan that includes");
    }
  });

  it("every mode's credit-cost key exists in the stored config — and so does the revision's", () => {
    // `@respin/modes` cannot depend on `@respin/config`, so `CreditCostKey` is
    // a COPY of the config's own key names. This is where the copy is checked
    // against the document that prices the debit.
    for (const mode of MODE_IDS) {
      expect(
        Object.keys(CONFIG_V1_SEED.creditCosts),
        `${mode}'s credit cost key`
      ).toContain(MODE_SPECS[mode].creditCostKey);
    }
    // R8's key is deliberately NOT one of the modes' — a revision is not a
    // mode — so it is checked here rather than inside the loop.
    expect(Object.keys(CONFIG_V1_SEED.creditCosts)).toContain(
      REVISION_CREDIT_COST_KEY
    );
    expect(MODE_IDS.map((m) => MODE_SPECS[m].creditCostKey)).not.toContain(
      REVISION_CREDIT_COST_KEY
    );
  });
});

// ------------------------------------------- private frameworks (R5c/REQ-D05)

describe("the tier -> private-framework entitlement map (R5c / REQ-D05)", () => {
  /**
   * PRD §4G's "Private frameworks" row, transcribed INDEPENDENTLY: Pro and
   * Studio only. Reading `TIER_PRIVATE_FRAMEWORKS` to build this would assert
   * the map equals itself.
   */
  const PRD_PRIVATE_FRAMEWORK_TIERS: EntitlementTier[] = ["pro", "studio"];

  it("every tier has an entry, and the key space is exactly the tier vocabulary", () => {
    // R14's property, applied to the second tier-keyed set. A tier added to
    // `BillingState` is a compile error at the map literal AND a red test here.
    expect(Object.keys(TIER_PRIVATE_FRAMEWORKS).sort()).toEqual(
      [...ENTITLEMENT_TIERS].sort()
    );
    expect(Object.keys(TIER_PRIVATE_FRAMEWORKS).sort()).toEqual(
      [...TIERS].sort()
    );
  });

  it("Pro and Studio only — every tier decided, both answers present", () => {
    const decided: string[] = [];
    for (const tier of TIERS) {
      const entitlement = privateFrameworkEntitlement(tier);
      expect(entitlement, tier).toBe(
        PRD_PRIVATE_FRAMEWORK_TIERS.includes(tier)
          ? "included"
          : "not_included"
      );
      decided.push(`${tier}:${entitlement}`);
    }
    expect(decided).toHaveLength(TIERS.length);
    // NON-VACUITY: a map that answered "included" everywhere would pass a
    // "nothing threw" test, and would hand Free creators a Pro feature.
    expect(decided.filter((d) => d.endsWith(":included"))).toHaveLength(2);
    expect(decided.filter((d) => d.endsWith(":not_included"))).toHaveLength(2);
  });

  it("the refusing value is the EXACT string @respin/db refuses on", () => {
    // `assertEntitled` in `packages/db/src/frameworks.ts` refuses anything that
    // is not the literal `"included"`, and `PrivateFrameworkEntitlement` is a
    // two-value union. This pins the two strings so a rename on either side is
    // a red test rather than a silently-entitled Free workspace.
    expect(privateFrameworkEntitlement("free")).toBe("not_included");
    expect(privateFrameworkEntitlement("creator")).toBe("not_included");
    expect(privateFrameworkEntitlement("pro")).toBe("included");
    expect(privateFrameworkEntitlement("studio")).toBe("included");
  });

  it("a tier with NO entry is a named refusal, not a silent 'not_included'", () => {
    // R14 again, and the cast is the point (CLAUDE.md 2026-08-21). Falling
    // through to `undefined` would fail CLOSED — `assertEntitled` refuses
    // anything that is not `"included"` — but it would do it while telling a
    // creator their plan excludes a feature when the truth is that this build
    // failed to classify their plan.
    const unknown = "enterprise" as unknown as EntitlementTier;
    expect(() => privateFrameworkEntitlement(unknown)).toThrow(
      UnknownEntitlementTierError
    );
    const message = new UnknownEntitlementTierError("enterprise").message;
    expect(message).toContain("enterprise");
    expect(message).toContain("not about your plan");
    expect(message.toLowerCase()).not.toContain("upgrade");
  });
});

describe("the tier -> tracked-niche entitlement (R17)", () => {
  const PRD_TRACKED_NICHES: Record<EntitlementTier, number> = {
    free: 0,
    creator: 1,
    pro: 3,
    studio: 10,
  };

  it("the SEEDED document is total over the resolved tier vocabulary and gives every tier PRD §4G's exact cap", () => {
    // R-95: the allowance is the config document's `trackedNiches` row, so
    // totality is a property of the SEED (and of the schema's `.default`),
    // and this is where PRD §4G is read against it independently.
    const seeded = CONFIG_V1_SEED.trackedNiches;
    expect(Object.keys(seeded).sort()).toEqual([...ENTITLEMENT_TIERS].sort());
    for (const tier of TIERS) {
      expect(trackedNicheEntitlement(tier, seeded).maxTrackedNiches, tier).toBe(
        PRD_TRACKED_NICHES[tier]
      );
    }
  });

  it("CONFIG, NOT A LITERAL: a document that prices a tier differently changes the entitlement", () => {
    // The witness the repo uses for every config-not-code number: the same
    // tier, two documents, two answers. A code map would answer the same
    // number for both and this would go red.
    const stricter = { ...CONFIG_V1_SEED.trackedNiches, pro: 1 };
    expect(trackedNicheEntitlement("pro", CONFIG_V1_SEED.trackedNiches).maxTrackedNiches).toBe(3);
    expect(trackedNicheEntitlement("pro", stricter).maxTrackedNiches).toBe(1);
  });

  it("refuses a cast-in tier instead of handing a writer an implicit cap", () => {
    expect(() =>
      trackedNicheEntitlement("enterprise" as EntitlementTier, CONFIG_V1_SEED.trackedNiches)
    ).toThrow(UnknownEntitlementTierError);
    // A document missing the tier is the same refusal, not `undefined`
    // handed to the DB writer as a cap.
    const withoutStudio = Object.fromEntries(
      Object.entries(CONFIG_V1_SEED.trackedNiches).filter(([tier]) => tier !== "studio")
    ) as typeof CONFIG_V1_SEED.trackedNiches;
    expect(() =>
      trackedNicheEntitlement("studio", withoutStudio)
    ).toThrow(UnknownEntitlementTierError);
  });
});

// ------------------------------------ the picker's data (slice 7, stage D)
//
// `modeOffers` is `assertModeAllowed` READ FORWARDS, and it exists so the mode
// picker in `app/**` is not a second derivation of the gate that refuses it —
// `app/**` cannot even name `IMPLEMENTED_MODES` (R-64 denies `@respin/modes`),
// and this file's header records what a second copy of the plan map costs.
//
// THE PROPERTY THAT MATTERS IS AGREEMENT, not shape: every mode this function
// calls `available` must be one `assertModeAllowed` accepts, and every mode it
// refuses must be one `assertModeAllowed` throws on, WITH THE MATCHING CLASS.
// That is driven below over all 7 modes x 4 tiers rather than asserted.
describe("modeOffers: the picker's data agrees with the gate (R1/R13/R14)", () => {
  it("is TOTAL over MODE_IDS, in the product's own order, with the product's own labels", () => {
    for (const tier of TIERS) {
      const offers = modeOffers(tier);
      expect(offers.map((o) => o.id)).toEqual([...MODE_IDS]);
      for (const offer of offers) {
        expect(offer.label, offer.id).toBe(MODE_SPECS[offer.id].label);
        // NON-VACUITY on the label: a blank or id-shaped label would render a
        // picker of internal names on a creator's screen.
        expect(offer.label.length, offer.id).toBeGreaterThan(2);
        expect(offer.label, offer.id).not.toBe(offer.id);
      }
    }
  });

  it("EVERY (tier, mode) pair agrees with assertModeAllowed, class for class", () => {
    let available = 0;
    let notInPlan = 0;
    for (const tier of TIERS) {
      for (const offer of modeOffers(tier)) {
        let thrown: unknown;
        try {
          assertModeAllowed(tier, offer.id);
        } catch (err) {
          thrown = err;
        }
        if (offer.status === "available") {
          expect(thrown, `${tier}/${offer.id}`).toBeUndefined();
          available += 1;
        } else if (offer.status === "not_in_plan") {
          expect(thrown, `${tier}/${offer.id}`).toBeInstanceOf(ModeNotInPlanError);
          notInPlan += 1;
        }
      }
    }
    // NON-VACUITY, and it is two separate facts rather than a total: an
    // implementation that answered `available` for everything would agree with
    // nothing, and one that answered `not_in_plan` for everything would agree
    // with `assertModeAllowed` on Free's four paid modes alone. All three
    // branches must be exercised by the real map.
    expect(available + notInPlan).toBe(TIERS.length * MODE_IDS.length);
    expect(available).toBeGreaterThan(0);
    expect(notInPlan).toBeGreaterThan(0);
  });

  it("the picker exposes Spin to paid tiers and refuses it on Free", () => {
    // A Free workspace asking for `analyseAndSpin` is told its plan does not
    // include it, while every paid tier offers it.
    expect(modeOffers("free").find((o) => o.id === "analyseAndSpin")?.status)
      .toBe("not_in_plan");
    for (const tier of ["creator", "pro", "studio"] as const) {
      expect(modeOffers(tier).find((o) => o.id === "analyseAndSpin")?.status)
        .toBe("available");
    }
  });

  it("an unclassified mode is a refusal here too, never a silent 'available'", () => {
    // R14's cast case, one function over. `modeTiers` throws `UnknownModeError`
    // for a mode nobody classified, and `modeOffers` must not swallow it into
    // a picker entry — an eighth mode added to `MODE_IDS` and to nothing else
    // would otherwise be OFFERED on every tier.
    const eighth = "seriesPlanner" as unknown as ModeId;
    expect(() => planIncludesMode("pro", eighth)).toThrow(UnknownModeError);
    const ids = modeOffers("pro").map((o) => o.id);
    expect(ids).not.toContain(eighth);
  });
});

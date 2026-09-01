// R18 — THE FIRST TIER->FEATURE GATE, driven against ALL SEVEN MODES.
//
// THE HAZARD THE SLICE CARD NAMES, restated so this file is honest about what
// it can and cannot prove: "a map with one entry is indistinguishable from an
// `if`, and slice 7 is where the difference shows". Slice 6 builds ONE mode, so
// no behavioural test on the built path can tell the two apart. What this file
// does instead is drive the MAP over the whole `MODE_IDS` population — every
// tier x every mode, as a table — so the control is exercised on the six modes
// that do not exist yet, which is exactly where an `if` would have nothing to
// say.
//
// PURE, and that is the second claim: nothing here touches a database, because
// `mode-access.ts` is handed a RESOLVED tier and never derives one. The tier
// authority stays `getWorkspaceBillingState` (R-30 constraint 2), and
// `generate.test.ts` is where the two meet.
import { describe, expect, it } from "vitest";
import { IMPLEMENTED_MODES, MODE_IDS, MODE_SPECS } from "@respin/modes";
import { CONFIG_V1_SEED } from "@respin/db";
import {
  ModeNotBuiltYetError,
  ModeNotInPlanError,
  TIER_MODES,
  assertModeAllowed,
  planIncludesMode,
  type EntitlementTier,
} from "../src/mode-access";

const TIERS: EntitlementTier[] = ["free", "creator", "pro", "studio"];

/**
 * PRD §4G's "Modes" row, written out INDEPENDENTLY of the implementation.
 *
 * A test that read `TIER_MODES` to decide what to expect would assert that the
 * map equals itself. This is the PRD's table, transcribed: Free gets "Hooks,
 * Captions, Ideas"; every paid tier gets "All 7".
 */
const PRD_TABLE: Record<EntitlementTier, string[]> = {
  free: ["hooks", "caption", "ideation"],
  creator: [...MODE_IDS],
  pro: [...MODE_IDS],
  studio: [...MODE_IDS],
};

describe("the tier -> mode map (R18)", () => {
  it("every tier has an entry, and every entry is PRD §4G's row", () => {
    for (const tier of TIERS) {
      expect([...TIER_MODES[tier]].sort()).toEqual(PRD_TABLE[tier].sort());
    }
    // ...and the map's key space is exactly the tier vocabulary, so a tier
    // added to `BillingState` without a mode list is a compile error rather
    // than a silent allow-all or deny-all.
    expect(Object.keys(TIER_MODES).sort()).toEqual([...TIERS].sort());
  });

  it("the whole tier x mode table is decided — 28 cases, not one", () => {
    // THE POPULATION IS `MODE_IDS`, so the six unbuilt modes are exercised.
    // An `if (mode === "hooks")` would answer the same for all of them.
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
    // `true` everywhere (mutation M8) would pass a "no exceptions thrown" test.
    expect(decided.filter((d) => d.endsWith(":false")).length).toBeGreaterThan(0);
    expect(decided.filter((d) => d.endsWith(":true")).length).toBeGreaterThan(0);
  });

  it("Free is refused every mode its plan excludes, by NAME", () => {
    const excluded = MODE_IDS.filter((m) => !PRD_TABLE.free.includes(m));
    expect(excluded.length, "the Free case would be vacuous").toBe(4);
    for (const mode of excluded) {
      expect(() => assertModeAllowed("free", mode)).toThrow(ModeNotInPlanError);
    }
  });

  it("a mode in the plan but NOT BUILT is a different refusal", () => {
    // `caption` and `ideation` are on Free's plan and are slice 7's to build.
    for (const mode of PRD_TABLE.free) {
      if (IMPLEMENTED_MODES.includes(mode as never)) continue;
      expect(() => assertModeAllowed("free", mode as never)).toThrow(
        ModeNotBuiltYetError
      );
    }
    // ...and the one that IS built passes on every tier.
    for (const tier of TIERS) {
      expect(() => assertModeAllowed(tier, "hooks")).not.toThrow();
    }
  });

  it("the plan gate runs BEFORE the built gate", () => {
    // A Free creator asking for an unbuilt mode their plan ALSO excludes is
    // told about their plan, because that is the stable answer: "we have not
    // built it" stops being true the day slice 7 lands.
    expect(() => assertModeAllowed("free", "sourceToReel")).toThrow(
      ModeNotInPlanError
    );
  });

  it("the refusal names what the plan DOES include, and never sells an upgrade", () => {
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
    }
  });

  it("every mode's credit-cost key exists in the stored config", () => {
    // `@respin/modes` cannot depend on `@respin/config`, so `CreditCostKey` is
    // a COPY of the config's own key names. This is where the copy is checked
    // against the document that prices the debit — a mode whose key is not in
    // `creditCosts` would fail closed at `requiredConfigPaths`, but only for
    // the creator who tried it.
    for (const mode of MODE_IDS) {
      expect(
        Object.keys(CONFIG_V1_SEED.creditCosts),
        `${mode}'s credit cost key`
      ).toContain(MODE_SPECS[mode].creditCostKey);
    }
  });
});

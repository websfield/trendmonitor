// Slice 6 stage B, R3: `ScriptOutput` is a strict, fail-closed contract, and it
// is shaped for all seven modes rather than for the one this slice builds.
//
// Mutation M7 ("the parse accepts a partial document") reddens on the
// missing-section cases below.
import { describe, expect, it } from "vitest";

import {
  IMPLEMENTED_MODES,
  MODE_IDS,
  MODE_SPECS,
  SECTION_KEYS,
  UNIVERSAL_SECTIONS,
  modeSpec,
  UnknownModeError,
  type ModeId,
} from "../src/modes";
import {
  ScriptOutputError,
  assertUniversalSections,
  outputTextUnits,
  parseScriptOutput,
  type ScriptOutput,
} from "../src/output";
import { CLEAN_HOOKS, EVERY_SECTION, asReply } from "./support/fixtures";

const parseHooks = (doc: unknown) =>
  parseScriptOutput({ text: asReply(doc), mode: "hooks" });

/** Drop one key, without a destructure the linter reads as an unused binding. */
const without = (doc: Record<string, unknown>, key: string) => {
  const copy = { ...doc };
  delete copy[key];
  return copy;
};

describe("the mode registry covers all seven modes (question 3)", () => {
  it("names seven modes", () => {
    expect(MODE_IDS).toHaveLength(7);
  });

  it("every mode has a spec whose permitted set covers its required set", () => {
    for (const id of MODE_IDS) {
      const spec = modeSpec(id);
      expect(spec.id, id).toBe(id);
      for (const key of spec.required) {
        expect(spec.permitted, id + " requires " + key).toContain(key);
      }
    }
  });

  it("EVERY mode requires the universal sections — the weakest point included", () => {
    // Non-negotiable 6: every output names its weakest point. A per-mode list
    // that forgot one would make that vacuous for that mode.
    for (const id of MODE_IDS) {
      for (const key of UNIVERSAL_SECTIONS) {
        expect(MODE_SPECS[id].required, id).toContain(key);
      }
    }
  });

  it("every section key some mode permits is a known section", () => {
    for (const id of MODE_IDS) {
      for (const key of MODE_SPECS[id].permitted) {
        expect(SECTION_KEYS, id).toContain(key);
      }
    }
  });

  it("refuses an unknown mode rather than treating it as unconstrained", () => {
    expect(() => modeSpec("notAMode" as ModeId)).toThrow(UnknownModeError);
  });

  it("IMPLEMENTED_MODES names real modes, and only `hooks` today", () => {
    // PRD §4G gives Free three modes and this slice builds one, so a tier-only
    // gate would offer two modes with no pipeline behind them.
    expect(IMPLEMENTED_MODES).toEqual(["hooks"]);
    for (const m of IMPLEMENTED_MODES) expect(MODE_IDS).toContain(m);
  });

  it("exactly one mode is similarity gated, and it is the spin one", () => {
    // Non-negotiable 1. The gate itself is slice 8's; naming the mode that
    // needs it is this contract's job.
    expect(MODE_IDS.filter((m) => MODE_SPECS[m].similarityGated)).toEqual([
      "analyseAndSpin",
    ]);
  });

  it("NO SIMILARITY-GATED MODE IS IMPLEMENTED, because the gate does not exist", () => {
    // THE RELATION, NOT THE TWO FACTS. `IMPLEMENTED_MODES === ["hooks"]` and
    // `similarityGated === ["analyseAndSpin"]` were each pinned on their own,
    // and nothing tied them together: the day slice 7 adds `analyseAndSpin` to
    // the implemented list, both of those tests stay green and a spin ships
    // with no similarity gate in front of it — non-negotiable 1, silently.
    //
    // `MODE_SPECS[m].similarityGated` is a DECLARATION and not the gate
    // (`modes.ts` says so out loud). Slice 8 builds the gate; until a control
    // in this repo enforces it before display, this line is what stands
    // between the declaration and a shipped spin. Deleting it to make a mode
    // implementable is the deliberate act it should be.
    const gatedAndLive = IMPLEMENTED_MODES.filter(
      (m) => MODE_SPECS[m].similarityGated
    );
    expect(
      gatedAndLive,
      "a similarity-gated mode is implemented and slice 8's gate does not exist yet"
    ).toEqual([]);
  });
});

describe("a well-formed hook set parses", () => {
  it("returns the parsed document", () => {
    const out = parseHooks(CLEAN_HOOKS);
    expect(out.hooks).toHaveLength(3);
    expect(out.whyThisPerforms.weakestPoint).toMatch(/tested/);
  });

  it("tolerates a fenced reply, using @respin/llm's own stripper", () => {
    const fenced = "```json\n" + asReply(CLEAN_HOOKS) + "\n```";
    expect(parseScriptOutput({ text: fenced, mode: "hooks" }).hooks).toHaveLength(3);
  });
});

describe("fail closed, and the failure is total (R3)", () => {
  it("refuses a reply that is not JSON", () => {
    expect(() => parseScriptOutput({ text: "here you go!", mode: "hooks" })).toThrow(
      ScriptOutputError
    );
  });

  it("refuses an UNKNOWN TOP-LEVEL KEY", () => {
    expect(() => parseHooks({ ...CLEAN_HOOKS, vibes: "high" })).toThrow(
      ScriptOutputError
    );
  });

  it("refuses an unknown key NESTED one level down", () => {
    // `brain-content.ts` measured that a top-level `.strict()` does not
    // propagate on the installed zod. Every node here is strict on its own,
    // and this is the test that proves it rather than asserting it.
    expect(() =>
      parseHooks({
        ...CLEAN_HOOKS,
        whyThisPerforms: {
          ...CLEAN_HOOKS.whyThisPerforms,
          confidence: 0.9,
        },
      })
    ).toThrow(ScriptOutputError);
  });

  it("refuses a document with NO weakest point (M7)", () => {
    expect(() => parseHooks(without(CLEAN_HOOKS, "whyThisPerforms"))).toThrow(
      /weakest point/i
    );
  });

  it("refuses a BLANK weakest point — min(1) alone would let whitespace through", () => {
    expect(() =>
      parseHooks({
        ...CLEAN_HOOKS,
        whyThisPerforms: { ...CLEAN_HOOKS.whyThisPerforms, weakestPoint: "   " },
      })
    ).toThrow(ScriptOutputError);
  });

  it("refuses a document with no disclosure", () => {
    expect(() => parseHooks(without(CLEAN_HOOKS, "disclosure"))).toThrow(
      ScriptOutputError
    );
  });

  it("refuses a SECTION THE MODE DOES NOT PERMIT", () => {
    expect(() =>
      parseHooks({
        ...CLEAN_HOOKS,
        beats: [{ atSeconds: 0, vo: "a beat", isTurn: true }],
      })
    ).toThrow(/different mode/);
  });

  it("refuses too few and too many hooks (PRD REQ-C01: 3-5)", () => {
    expect(() =>
      parseHooks({ ...CLEAN_HOOKS, hooks: CLEAN_HOOKS.hooks.slice(0, 2) })
    ).toThrow(/3 to 5/);
    const six = Array.from({ length: 6 }, (_, i) => ({
      text: "hook number " + i,
      mechanic: "mechanic " + i,
    }));
    expect(() => parseHooks({ ...CLEAN_HOOKS, hooks: six })).toThrow(/3 to 5/);
  });

  it("refuses two hooks that share a mechanic (REQ-C04)", () => {
    const dupes = CLEAN_HOOKS.hooks.map((h) => ({ ...h, mechanic: "contradiction" }));
    expect(() => parseHooks({ ...CLEAN_HOOKS, hooks: dupes })).toThrow(/REQ-C04/);
  });

  it("refuses a script that marks no turn, or two", () => {
    const script = (isTurns: boolean[]) =>
      parseScriptOutput({
        text: asReply({
          ...EVERY_SECTION,
          ideas: undefined,
          beats: isTurns.map((t, i) => ({
            atSeconds: i,
            vo: "a beat",
            isTurn: t,
          })),
          shotMap: [],
        }),
        mode: "ideaToScript",
      });
    expect(() => script([false, false])).toThrow(/turns/);
    expect(() => script([true, true])).toThrow(/turns/);
    expect(() => script([false, true])).not.toThrow();
  });

  it("refuses a shot map that points past the last beat", () => {
    expect(() =>
      parseScriptOutput({
        text: asReply({
          ...EVERY_SECTION,
          ideas: undefined,
          shotMap: [{ beatIndex: 9, shot: "wide", note: "n" }],
        }),
        mode: "ideaToScript",
      })
    ).toThrow(/beat 9/);
  });

  it("refuses an ideation batch outside 3-5", () => {
    expect(() =>
      parseScriptOutput({
        text: asReply({
          ideas: EVERY_SECTION.ideas.slice(0, 1),
          whyThisPerforms: EVERY_SECTION.whyThisPerforms,
          disclosure: EVERY_SECTION.disclosure,
        }),
        mode: "ideation",
      })
    ).toThrow(/3 to 5/);
  });
});

describe("the universal-section guard has a driven false branch", () => {
  // CLAUDE.md 2026-08-26: a control with no witness is not a control. This one
  // is a SECOND check behind the per-mode required list, so nothing else in
  // the suite would fire it; it is driven directly here.
  it("throws when the weakest point is absent", () => {
    expect(() => assertUniversalSections({ disclosure: {} })).toThrow(
      /weakest point/i
    );
  });

  it("throws when the disclosure is absent", () => {
    expect(() => assertUniversalSections({ whyThisPerforms: {} })).toThrow(
      /disclosure/
    );
  });

  it("passes when both are present", () => {
    expect(() =>
      assertUniversalSections({ whyThisPerforms: {}, disclosure: {} })
    ).not.toThrow();
  });
});

describe("the text population covers every section (CLAUDE.md 2026-08-29)", () => {
  it("yields at least one unit for EVERY section key", () => {
    // The guard against a population that narrows silently: a section added to
    // SECTION_KEYS without a text extractor is already a compile error, and
    // this is the runtime half — an extractor that returns nothing for a
    // populated section would hide the section from the kill test entirely.
    const units = outputTextUnits(EVERY_SECTION as unknown as ScriptOutput);
    for (const key of SECTION_KEYS) {
      expect(
        units.some((u) => u.field.startsWith("/" + key)),
        key + " contributes no text unit, so no scan can ever read it"
      ).toBe(true);
    }
  });

  it("marks hook texts — and an idea's hook — as hook fields, and nothing else", () => {
    const units = outputTextUnits(EVERY_SECTION as unknown as ScriptOutput);
    const hookFields = units.filter((u) => u.isHook).map((u) => u.field);
    expect(hookFields).toEqual([
      "/hooks/0/text",
      "/hooks/1/text",
      "/hooks/2/text",
      "/ideas/0/hook",
      "/ideas/1/hook",
      "/ideas/2/hook",
    ]);
  });

  it("every unit carries non-empty text and a pointer", () => {
    for (const u of outputTextUnits(EVERY_SECTION as unknown as ScriptOutput)) {
      expect(u.text.length, u.field).toBeGreaterThan(0);
      expect(u.field.startsWith("/")).toBe(true);
    }
  });

  it("yields nothing for absent sections", () => {
    const units = outputTextUnits(parseHooks(CLEAN_HOOKS));
    expect(units.some((u) => u.field.startsWith("/beats"))).toBe(false);
  });
});

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
  V2_SECTION_KEYS,
  assertUniversalSections,
  outputTextPointers,
  outputTextUnits,
  parseScriptOutput,
  pointerMatches,
  readStoredScriptOutput,
  renderDraft,
  type OutputContract,
  type ScriptOutput,
} from "../src/output";
import { stampServerChecks } from "../src/mode-checks";
import { CLEAN_HOOKS, EVERY_SECTION, asReply } from "./support/fixtures";
import {
  IDEATION_OUTPUT,
  IDEATION_V2_MIXED,
  NO_LIMITS,
  OUTPUT_FOR,
  REAL_EXCERPT,
  SCRIPT_OUTPUT,
  SOLO_KITCHEN_FILMING,
  ideationV2,
  premiseFor,
  scriptV2,
} from "./support/mode-fixtures";

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

  it("IMPLEMENTED_MODES names real modes — six of seven after slice 7", () => {
    // PRD §4G gives Free three modes (hooks, captions, ideas) and Creator and
    // above all seven. Six have a pipeline; `analyseAndSpin` is held back by
    // the relation asserted below, not by a preference.
    expect([...IMPLEMENTED_MODES].sort()).toEqual([
      "analyseAndSpin",
      "caption",
      "footageToThesis",
      "hooks",
      "ideaToScript",
      "ideation",
      "sourceToReel",
    ]);
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
    ).toEqual(["analyseAndSpin"]);
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

// ------------------------------------------- OUTPUT CONTRACT v2 (R-148, L1)
//
// THE LEGACY/NEW ROUND TRIPS. A stored v1 document still reads as v1; a stored
// document with NO version is never read as v2 (it carries v2 keys the strict v1
// schema refuses); the model can never author the version; and a v2 document
// survives its own jsonb round trip through the stored reader unchanged.

const V2_AUTO = { version: 2, requestedForm: "auto" } as const;
const parseV2 = (mode: ModeId, doc: unknown, contract: OutputContract = V2_AUTO) =>
  parseScriptOutput({ text: asReply(doc), mode, contract });
/** What a stored document looks like after a `jsonb` round trip. */
const roundTrip = (doc: unknown): unknown => JSON.parse(JSON.stringify(doc));

/** A parsed v2 output AS THE PIPELINE STORES IT: with the server's checks stamped. */
const stamped = (output: ScriptOutput) => {
  if (output.contractVersion !== 2) throw new Error("expected v2");
  return stampServerChecks(output, NO_LIMITS);
};

describe("output contract v2: the server stamps the version, the model never does", () => {
  it("a v2 concept batch parses and is STAMPED with the version and the requested form", () => {
    const out = parseV2("ideation", IDEATION_V2_MIXED);
    expect(out.contractVersion).toBe(2);
    expect(out.requestedForm).toBe("auto");
    if (out.contractVersion !== 2) throw new Error("narrowing");
    expect(out.ideas?.map((i) => i.form)).toEqual([
      "personal_story_observation",
      "explain_opinion",
      "demonstration_experiment",
    ]);
    expect(out.ideas?.[0].premise.basis).toEqual({
      kind: "material",
      excerpt: REAL_EXCERPT,
    });
  });

  it("a reply that states the version itself is REFUSED — the stamp is the server's", () => {
    expect(() =>
      parseV2("ideation", { ...IDEATION_V2_MIXED, contractVersion: 2 })
    ).toThrow(ScriptOutputError);
    expect(() =>
      parseV2("ideation", { ...IDEATION_V2_MIXED, requestedForm: "auto" })
    ).toThrow(ScriptOutputError);
  });

  it("the stamp is the CONTRACT's form, not anything in the reply", () => {
    const out = parseV2("ideation", ideationV2(["explain_opinion"]), {
      version: 2,
      requestedForm: "explain_opinion",
    });
    expect(out.requestedForm).toBe("explain_opinion");
  });

  it("a v2 reply parsed under the LEGACY contract is refused, never read as v1", () => {
    // The default contract is v1, so a caller that forgets the contract gets a
    // refusal — the safe direction `parseScriptOutput`'s docblock names.
    expect(() =>
      parseScriptOutput({ text: asReply(IDEATION_V2_MIXED), mode: "ideation" })
    ).toThrow(ScriptOutputError);
  });

  it("a legacy reply parsed under v2 is refused — a concept with no premise is not v2", () => {
    expect(() => parseV2("ideation", IDEATION_OUTPUT)).toThrow(ScriptOutputError);
  });

  it("a mode outside CREATIVE_FORM_MODES has no v2 contract at all", () => {
    expect(() => parseV2("hooks", CLEAN_HOOKS)).toThrow(/no version-2 output contract/);
  });

  it("'Choose for me' resolves only to the three supported forms — anything else is refused at parse", () => {
    const widened = {
      ...IDEATION_V2_MIXED,
      ideas: IDEATION_V2_MIXED.ideas.map((idea, i) =>
        i === 0 ? { ...idea, form: "silent_asmr" } : idea
      ),
    };
    expect(() => parseV2("ideation", widened)).toThrow(ScriptOutputError);
  });

  it("a v2 script requires its own form, premise and filming plan, and a concept batch forbids them at the top", () => {
    const script = scriptV2("explain_opinion");
    expect(parseV2("ideaToScript", script).contractVersion).toBe(2);
    for (const key of ["form", "premise", "filming"]) {
      expect(() =>
        parseV2("ideaToScript", without(script as Record<string, unknown>, key))
      ).toThrow(ScriptOutputError);
    }
    expect(() =>
      parseV2("ideation", { ...IDEATION_V2_MIXED, premise: premiseFor("explain_opinion") })
    ).toThrow(/on each idea/);
  });

  it("the pivot beat names its kind, and no other beat does", () => {
    const script = scriptV2("demonstration_experiment");
    const unnamed = {
      ...script,
      beats: script.beats.map((b) => ({ atSeconds: b.atSeconds, vo: b.vo, isTurn: b.isTurn })),
    };
    expect(() => parseV2("ideaToScript", unnamed)).toThrow(/turn or the reveal/);
    const stray = {
      ...script,
      beats: script.beats.map((b, i) => (i === 0 ? { ...b, pivot: "turn" } : b)),
    };
    expect(() => parseV2("ideaToScript", stray)).toThrow(/exactly one pivot/);
  });

  it("a framework section without provenance is not a v2 framework", () => {
    const script = scriptV2("explain_opinion");
    expect(() =>
      parseV2("ideaToScript", { ...script, framework: SCRIPT_OUTPUT.framework })
    ).toThrow(ScriptOutputError);
  });
});

describe("output contract v2: the STORED reader and the legacy reading", () => {
  it("a stored LEGACY output (no version) still reads, as legacy, for every mode", () => {
    for (const mode of MODE_IDS) {
      const out = readStoredScriptOutput({ value: roundTrip(OUTPUT_FOR[mode]), mode });
      expect(out.contractVersion, mode).toBeUndefined();
    }
  });

  it("an UNVERSIONED output carrying v2 fields is NEVER read as v2 — it is refused", () => {
    // The document a v2 reply would be BEFORE the server stamped it. With no
    // version it is legacy by definition, and the legacy schema refuses it.
    expect(() =>
      readStoredScriptOutput({ value: roundTrip(IDEATION_V2_MIXED), mode: "ideation" })
    ).toThrow(ScriptOutputError);
    expect(() =>
      readStoredScriptOutput({ value: roundTrip(scriptV2("explain_opinion")), mode: "ideaToScript" })
    ).toThrow(ScriptOutputError);
  });

  it("a stored v2 output survives its jsonb round trip unchanged, stamp and server checks included", () => {
    const parsed = stamped(parseV2("ideation", IDEATION_V2_MIXED));
    const back = readStoredScriptOutput({ value: roundTrip(parsed), mode: "ideation" });
    expect(back).toEqual(parsed);
    const script = stamped(
      parseV2("ideaToScript", scriptV2("personal_story_observation"), {
        version: 2,
        requestedForm: "personal_story_observation",
      })
    );
    expect(readStoredScriptOutput({ value: roundTrip(script), mode: "ideaToScript" })).toEqual(script);
  });

  it("renderDraft shows the server's decisions as [check] on exactly the flagged units — and the stored text stays unmarked", () => {
    const doc = ideationV2(["explain_opinion"]);
    doc.ideas[0] = { ...doc.ideas[0], filming: { ...doc.ideas[0].filming, equipment: ["phone", "ring light"] } };
    const parsed = parseV2("ideation", doc);
    if (parsed.contractVersion !== 2) throw new Error("expected v2");
    const out = stampServerChecks(parsed, { ...NO_LIMITS, equipment: ["phone"], locations: ["kitchen"] });
    const draft = renderDraft(out);
    expect(draft).toContain("/ideas/0/filming/equipment/1: ring light [check]");
    expect(draft).toContain("/ideas/0/filming/equipment/0: phone\n");
    expect(draft).toContain("/ideas/0/filming/location: kitchen\n");
    // EXACTLY the one flagged item: the declared phone and kitchen in every
    // concept, and this batch's explanations carry no marker of their own.
    expect(draft.match(/\[check\]/g)?.length).toBe(1);
    expect(JSON.stringify(out.ideas)).not.toContain("ring light [check]");
  });

  it("THE SERVER'S CHECKS ARE SERVER-OWNED (R-150 point 2): a reply cannot state them, and a stored v2 output must carry ones that fit", () => {
    // A reply that tries to author the decision is refused, like a reply that
    // states its own version.
    expect(() =>
      parseV2("ideation", {
        ...IDEATION_V2_MIXED,
        serverChecks: { filming: [], shotMap: [] },
      })
    ).toThrow(ScriptOutputError);
    const good = roundTrip(stamped(parseV2("ideation", IDEATION_V2_MIXED))) as Record<string, unknown>;
    const checks = good.serverChecks as { filming: { at: string; location: boolean; equipment: number[] }[]; shotMap: number[] };
    // Absent: a document this build did not write.
    expect(() =>
      readStoredScriptOutput({ value: without(good, "serverChecks"), mode: "ideation" })
    ).toThrow(/server checks/);
    // Mis-shaped, extra keys, an index past the list it marks, a plan out of
    // order, one plan too few: each refused.
    for (const bad of [
      { ...checks, filming: "all" },
      { ...checks, extra: true },
      { ...checks, filming: checks.filming.map((e, i) => (i === 0 ? { ...e, equipment: [9] } : e)) },
      { ...checks, filming: [...checks.filming].reverse() },
      { ...checks, filming: checks.filming.slice(1) },
      { ...checks, shotMap: [0] },
      { ...checks, shotMap: [{ index: 0, shot: true, note: false }] },
      { ...checks, filming: checks.filming.map((e) => ({ ...e, location: "yes" })) },
    ]) {
      expect(
        () => readStoredScriptOutput({ value: { ...good, serverChecks: bad }, mode: "ideation" }),
        JSON.stringify(bad)
      ).toThrow(ScriptOutputError);
    }
    // A SHOT-MAP entry is per line and per field: one past the list, or two
    // for the same line, is not a decision this build wrote.
    const script = roundTrip(
      stamped(parseV2("ideaToScript", scriptV2("explain_opinion"), { version: 2, requestedForm: "explain_opinion" }))
    ) as Record<string, unknown>;
    const scriptChecks = script.serverChecks as Record<string, unknown>;
    expect(() => readStoredScriptOutput({ value: script, mode: "ideaToScript" })).not.toThrow();
    for (const shotMap of [
      [{ index: 0, shot: true, note: false }, { index: 0, shot: false, note: true }],
      [{ index: 2, shot: true, note: false }],
      [{ index: 0, shot: true }],
    ]) {
      expect(
        () => readStoredScriptOutput({ value: { ...script, serverChecks: { ...scriptChecks, shotMap } }, mode: "ideaToScript" }),
        JSON.stringify(shotMap)
      ).toThrow(ScriptOutputError);
    }
    // A LEGACY output is untouched: it carries none, and none is asked of it.
    expect(() =>
      readStoredScriptOutput({ value: roundTrip(IDEATION_OUTPUT), mode: "ideation" })
    ).not.toThrow();
  });

  it("a stored version this build does not know is refused, and so is a version 1 written out loud", () => {
    const parsed = roundTrip(parseV2("ideation", IDEATION_V2_MIXED)) as Record<string, unknown>;
    expect(() =>
      readStoredScriptOutput({ value: { ...parsed, contractVersion: 3 }, mode: "ideation" })
    ).toThrow(/does not read/);
    // ONLY ABSENCE means legacy: an explicit `1` is a document this product
    // never writes, and it is refused rather than read.
    expect(() =>
      readStoredScriptOutput({
        value: { ...(roundTrip(IDEATION_OUTPUT) as object), contractVersion: 1 },
        mode: "ideation",
      })
    ).toThrow(ScriptOutputError);
  });

  it("a stored v2 output must name a requested form this product offers", () => {
    const parsed = roundTrip(parseV2("ideation", IDEATION_V2_MIXED)) as Record<string, unknown>;
    expect(() =>
      readStoredScriptOutput({ value: { ...parsed, requestedForm: "silent_asmr" }, mode: "ideation" })
    ).toThrow(/requested/);
    expect(() =>
      readStoredScriptOutput({ value: without(parsed, "requestedForm"), mode: "ideation" })
    ).toThrow(/requested/);
  });

  it("a stored v2 output in a mode with no v2 contract is refused", () => {
    expect(() =>
      readStoredScriptOutput({
        value: { ...(roundTrip(CLEAN_HOOKS) as object), contractVersion: 2, requestedForm: "auto" },
        mode: "hooks",
      })
    ).toThrow(ScriptOutputError);
  });
});

describe("the text population is derived from the schema at FIELD granularity (audit Phase 2, P2-R5)", () => {
  // `SECTION_TEXT` makes a new section a compile error; a new `line()` INSIDE
  // a section was a silent hole in the kill test, the traceability scan, the
  // similarity gate and `renderDraft`. The expected set is now computed from
  // the schemas' string leaves and asserted EQUAL — two-way — to what
  // `outputTextUnits` yields on a full document of each contract.
  const normalise = (field: string) => field.replace(/\/\d+(?=\/|$)/g, "/*");
  const FULL_V1 = EVERY_SECTION as unknown as ScriptOutput;
  const FULL_V2 = {
    ...EVERY_SECTION,
    framework: { ...EVERY_SECTION.framework, provenance: "offered" },
    ideas: IDEATION_V2_MIXED.ideas,
    form: "personal_story_observation",
    premise: premiseFor("personal_story_observation"),
    filming: SOLO_KITCHEN_FILMING,
    contractVersion: 2,
    requestedForm: "auto",
  } as unknown as ScriptOutput;

  it("the schema's string leaves EQUAL the pointers outputTextUnits yields", () => {
    const fromUnits = new Set(
      [...outputTextUnits(FULL_V1), ...outputTextUnits(FULL_V2)].map((u) => normalise(u.field))
    );
    expect([...fromUnits].sort()).toEqual([...outputTextPointers()]);
  });

  it("NON-VACUITY: every section contributes leaves, and the walk found a population at all", () => {
    const pointers = outputTextPointers();
    expect(pointers.length).toBeGreaterThan(25);
    for (const key of [...SECTION_KEYS, ...V2_SECTION_KEYS]) {
      expect(
        pointers.filter((p) => p.startsWith("/" + key + "/")).length,
        key + " has no string leaf the walk can see"
      ).toBeGreaterThan(0);
    }
    // A closed value is never a leaf; an array index is a `*`.
    expect(pointers.some((p) => /\/(form|people|minutes|atSeconds|isTurn|pivot|kind)$/.test(p))).toBe(false);
    expect(pointers).toContain("/hooks/*/text");
    expect(pointers).toContain("/ideas/*/premise/basis/excerpt");
  });

  it("pointerMatches reads `*` as one array index and nothing else", () => {
    expect(pointerMatches("/hooks/*/text", "/hooks/12/text")).toBe(true);
    expect(pointerMatches("/hooks/*/text", "/hooks/x/text")).toBe(false);
    expect(pointerMatches("/hooks/*/text", "/hooks/0/text/extra")).toBe(false);
    expect(pointerMatches("/caption/text", "/caption/text")).toBe(true);
  });
});

describe("output contract v2: every new text field joins the scanned population", () => {
  it("a v2 concept's premise, basis quote and filming plan are text units under the idea's pointer", () => {
    const fields = outputTextUnits(parseV2("ideation", IDEATION_V2_MIXED)).map((u) => u.field);
    for (const f of [
      "/ideas/0/premise/whatHappens",
      "/ideas/0/premise/interest",
      "/ideas/0/premise/payoff",
      "/ideas/0/premise/basis/excerpt",
      "/ideas/0/filming/location",
      "/ideas/0/filming/equipment/0",
      "/ideas/2/premise/payoff",
    ]) {
      expect(fields, f).toContain(f);
    }
    // An unconfirmed or absent basis has no excerpt to scan.
    expect(fields).not.toContain("/ideas/1/premise/basis/excerpt");
    expect(fields).not.toContain("/ideas/2/premise/basis/excerpt");
  });

  it("every V2_SECTION_KEYS entry yields at least one unit on a full v2 script", () => {
    const units = outputTextUnits(
      parseV2("ideaToScript", scriptV2("personal_story_observation"))
    );
    for (const key of V2_SECTION_KEYS) {
      expect(
        units.some((u) => u.field.startsWith("/" + key + "/")),
        key + " contributes no text unit, so no scan can ever read it"
      ).toBe(true);
    }
  });

  it("a closed value — the form, who films, the minutes — is NOT text a scan reads", () => {
    const units = outputTextUnits(parseV2("ideaToScript", scriptV2("explain_opinion")));
    expect(units.some((u) => /\/(form|people|minutes)$/.test(u.field))).toBe(false);
  });

  it("a legacy document's population is exactly what it was — no v2 pointer appears", () => {
    const units = outputTextUnits(parseScriptOutput({ text: asReply(IDEATION_OUTPUT), mode: "ideation" }));
    expect(units.some((u) => /premise|filming/.test(u.field))).toBe(false);
  });
});

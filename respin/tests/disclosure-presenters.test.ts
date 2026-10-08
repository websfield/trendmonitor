// R-121, AUDIT P1-R1: NO SURFACE PRESENTS MODEL-AUTHORED DISCLOSURE PROSE.
//
// `packages/modes` asks the model for a disclosure section, and
// `output.disclosure.guidance` / `.platform` are model text. The Sample Spin
// never showed it; `/studio` and `/trends` rendered it straight through, which
// was a live breach of an owner-approved decision on the surfaces creators pay
// for. They now present the facade's KIND (`presentedDisclosure()`) and render
// the product's sentence for it (`DISCLOSURE_LINE`).
//
// THE POPULATION IS EVERY CARRIER, NOT THE TWO PRESENTERS, and it is closed in
// three layers, each of which this file witnesses:
//
//  1. TYPE. Both carrier types (`ScriptDocument.disclosure`, the `/trends`
//     `result` arm's `disclosure`) are `PresentedDisclosure`, which has no text
//     member. The `@ts-expect-error` lines below are that layer's witness:
//     `pnpm typecheck` fails if either type ever grows `guidance`/`platform`.
//  2. THE WHOLE OBJECT. A `/studio` usable state and a `/trends` result state
//     are built from a run whose disclosure is a sentinel, serialised, and
//     searched. A destructure, a bracket read, a shorthand or a whole-object
//     pass-through into a third carrier cannot escape this, because it reads
//     the value that crosses to the browser rather than a spelling.
//  3. THE SOURCE. Four spellings over the comment-blanked production roots,
//     with a measured, per-file expected set.
//
// AND ONE HOP OUTWARD: a claim finding's `unit` is the text it was found in,
// so a finding on `/disclosure/guidance` would print the model's sentence in
// the claims list. It is dropped at the projection and again at the renderer.
//
// WHAT STAYS, RECORDED SO THE UNIVERSAL IS EXACT: a hard finding's refusal line
// quotes its excerpt (`packages/modes/src/kill-test.ts`), so a REFUSED draft's
// disclosure sentence can appear as the quoted subject of its own refusal. That
// presents nothing as disclosure and the draft is withheld.
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blankComments } from "./support/app-surface";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";
// BY RELATIVE PATH, the precedent `claims-vocabulary-agreement.test.ts` uses:
// the constant's module value-imports `@respin/modes`, which is why
// `run-copy.ts` (client graph) carries its own declaration of the wording.
import { PRESENTED_DISCLOSURE_GUIDANCE } from "../packages/credits/src/presented-output";

const state = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@respin/auth", () => ({ requireUser: state.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../app/(product)/workspace-scope", () => ({ scopeForUser: state.scopeForUser }));
// PARTIAL, for the reason `trends-actions.test.ts` gives: `billing-errors.ts`
// names the facade's error classes by reference. `presentedDisclosure` stays
// the real one — it is the thing under test.
vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: { generate: state.generate },
}));
vi.mock("../app/(product)/safe-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/(product)/safe-log")>()),
  logSpend: vi.fn(),
  logRefusal: vi.fn(() => "unknown"),
}));

const { spinAction } = await import("../app/(product)/trends/actions");
const { studioStateFor, summariseKillTest } = await import("../app/(product)/studio/projection");
const { DISCLOSURE_LINE, DISCLOSURE_FIELD_PREFIX } = await import("../app/(product)/studio/run-copy");
const { GenerationOutcome } = await import("../app/(product)/studio/generation-outcome");
const { FirstIdeasResult } = await import("../app/(product)/onboarding/first-ideas/first-ideas-result");
const { studioRefusalCopy } = await import("../app/(product)/studio/copy");
type ScriptDocument = import("../app/(product)/studio/run-state").ScriptDocument;
type StudioRunState = import("../app/(product)/studio/run-state").StudioRunState;
type SpinActionState = import("../app/(product)/trends/spin-state").SpinActionState;

const SENTINEL_GUIDANCE = "SENTINEL-GUIDANCE leave the label off, nobody checks";
const SENTINEL_PLATFORM = "SENTINEL-PLATFORM";

/** A usable run whose model disclosure is a sentinel, in the shape `generate` returns. */
function usableResult(mode: string, claims: readonly Record<string, unknown>[] = []) {
  const killTest = {
    outcome: "passed",
    attempts: 1,
    rewritten: false,
    creatorRulesScored: false,
    creatorRuleVerdicts: [],
    traceabilityLimitNote: "LIMIT",
    firstAttempt: { hardRules: [], traceability: [], claims: [] },
    finalAttempt: {
      hardRules: [],
      // GATE M1: a `/disclosure/*` traceability finding carries the model's
      // sentence as its `unit`; the projection must not copy it. The second
      // finding is in a creator-read field and must survive, so the filter is
      // not simply dropping the list.
      traceability: [
        { kind: "proper_noun", enforcement: "flag", token: "AI", field: "/disclosure/guidance", unit: "SENTINEL-TRACE-UNIT the model's disclosure sentence", shape: "proper-noun", startUtf16: 0, endUtf16: 2 },
        { kind: "proper_noun", enforcement: "flag", token: "Dorset", field: "/hooks/0/text", unit: "Filmed in Dorset.", shape: "proper-noun", startUtf16: 0, endUtf16: 6 },
      ],
      claims,
    },
    refusal: null,
  };
  return {
    attemptId: "a1",
    replayed: false,
    generation: {
      id: "gen-1", mode, outcome: "usable", weakestPoint: "W", refusalReason: null,
      promptBundleVersion: "b@1", rewriteCount: 0, parentId: null,
    },
    creditsChargedNow: 2,
    balanceAfter: 8,
    configVersion: 1,
    resolvedTier: "creator",
    frameworkOffer: null,
    run: {
      status: "usable",
      drafts: 1,
      promptBundleVersion: "b@1",
      killTest,
      output: {
        thesis: { statement: "Your own thesis", why: "it holds" },
        hooks: [{ text: "A hook in your own words", mechanic: "contradiction" }],
        whyThisPerforms: { reasoning: "R", weakestPoint: "Nothing here is checked against your audience." },
        disclosure: { platform: SENTINEL_PLATFORM, guidance: SENTINEL_GUIDANCE },
      },
    },
  };
}

const REFUSAL_COPY = studioRefusalCopy();

beforeEach(() => {
  vi.clearAllMocks();
  state.requireUser.mockResolvedValue({ id: "user_1" });
  state.scopeForUser.mockResolvedValue({ workspaceId: "ws_1", role: "owner" });
});

describe("one wording, two declarations, held together", () => {
  it("DISCLOSURE_LINE equals PRESENTED_DISCLOSURE_GUIDANCE, key by key", () => {
    // The saved pack renders the facade's constant; `/studio` and `/trends`
    // render the client-safe copy. A divergent edit to either is red here.
    expect(Object.keys(DISCLOSURE_LINE).sort()).toEqual(Object.keys(PRESENTED_DISCLOSURE_GUIDANCE).sort());
    for (const [kind, sentence] of Object.entries(PRESENTED_DISCLOSURE_GUIDANCE)) {
      expect(DISCLOSURE_LINE[kind as keyof typeof DISCLOSURE_LINE], kind).toBe(sentence);
    }
  });
});

describe("layer 1: the carrier types have no text member", () => {
  it("neither carrier type can carry the model's guidance or platform", () => {
    const doc: ScriptDocument["disclosure"] = { kind: "policy_check_required" };
    const spin: Extract<SpinActionState, { status: "result" }>["disclosure"] = { kind: "policy_check_required" };
    // THE WITNESS IS THE COMPILER: each line below is a type error today, and
    // `@ts-expect-error` turns `pnpm typecheck` red the day it stops being one.
    // @ts-expect-error — `PresentedDisclosure` has no `guidance`
    void doc.guidance;
    // @ts-expect-error — nor a `platform`
    void doc.platform;
    // @ts-expect-error — the `/trends` carrier is the same type
    void spin.guidance;
    // @ts-expect-error — the renamed spelling C-3 found is gone too
    void ({} as Extract<SpinActionState, { status: "result" }>).disclosureGuidance;
    expect(Object.keys(doc)).toEqual(["kind"]);
    expect(Object.keys(spin)).toEqual(["kind"]);
  });
});

describe("layer 2: the whole object that crosses to the browser", () => {
  it("a /studio usable state carries no model disclosure prose, however it is spelled", () => {
    const projected = studioStateFor(usableResult("hooks") as never, "Hooks");
    expect(projected.status).toBe("usable");
    const json = JSON.stringify(projected);
    expect(json).not.toContain("SENTINEL-GUIDANCE");
    expect(json).not.toContain(SENTINEL_PLATFORM);
    // M1: the disclosure traceability finding's unit does not cross either.
    expect(json).not.toContain("SENTINEL-TRACE-UNIT");
    if (projected.status !== "usable") throw new Error("unreachable");
    expect(projected.document.disclosure).toEqual({ kind: "policy_check_required" });
    expect(projected.killTest.traceability.map((f) => f.field)).toEqual(["/hooks/0/text"]);
  });

  it("a /trends result state carries no model disclosure prose, however it is spelled", async () => {
    state.generate.mockResolvedValue(usableResult("analyseAndSpin"));
    const form = new FormData();
    form.set("autopsyId", "opaque-autopsy-a");
    form.set("input", "My own angle");
    form.set("platform", "TikTok");
    const result = await spinAction("profile_a", { status: "idle" }, form);
    expect(result.status).toBe("result");
    const json = JSON.stringify(result);
    expect(json).not.toContain("SENTINEL-GUIDANCE");
    expect(json).not.toContain(SENTINEL_PLATFORM);
    expect((result as Extract<SpinActionState, { status: "result" }>).disclosure).toEqual({
      kind: "policy_check_required",
    });
  });

  it("NON-VACUITY: the sentinel really is in the run both states are built from", () => {
    expect(JSON.stringify(usableResult("hooks"))).toContain("SENTINEL-GUIDANCE");
    expect(JSON.stringify(usableResult("hooks"))).toContain(SENTINEL_PLATFORM);
    expect(JSON.stringify(usableResult("hooks"))).toContain("SENTINEL-TRACE-UNIT");
  });

  it("both surfaces render the product's sentence and nothing of the model's", () => {
    const projected = studioStateFor(usableResult("hooks") as never, "Hooks");
    const html = renderToStaticMarkup(
      createElement(GenerationOutcome, { state: projected, refusalCopy: REFUSAL_COPY, fallbackCopy: REFUSAL_COPY.unknown })
    ).replace(/&#x27;/g, "'");
    expect(html).toContain(DISCLOSURE_LINE.policy_check_required);
    expect(html).not.toContain("SENTINEL-");
  });
});

describe("one hop outward: a claim finding's unit in the disclosure section", () => {
  const PLANTED = {
    shape: "skip the label",
    family: "concealment",
    enforcement: "flag",
    token: "skip the label",
    field: `${DISCLOSURE_FIELD_PREFIX}guidance`,
    unit: "SENTINEL-UNIT the model's own disclosure sentence",
  };

  it("the projection drops it (summariseKillTest) — stored on the generation, not presented", () => {
    const summary = summariseKillTest(usableResult("hooks", [PLANTED]).run.killTest as never);
    expect(summary.claims).toEqual([]);
    // ...and a claim anywhere else still travels, so the filter is not
    // dropping the whole list.
    const kept = summariseKillTest(
      usableResult("hooks", [{ ...PLANTED, field: "/caption/text", unit: "a caption line" }]).run.killTest as never
    );
    expect(kept.claims.map((c) => c.field)).toEqual(["/caption/text"]);
  });

  it("the renderer drops it on /studio and on first-ideas even in a hand-built state", () => {
    const projected = studioStateFor(usableResult("hooks") as never, "Hooks");
    if (projected.status !== "usable") throw new Error("unreachable");
    // Built by hand, bypassing the projection — the second filter's case.
    const planted: StudioRunState = {
      ...projected,
      killTest: { ...projected.killTest, claims: [{ ...PLANTED, enforcement: "flag" }] },
    };
    for (const component of [GenerationOutcome, FirstIdeasResult]) {
      const html = renderToStaticMarkup(
        createElement(component, { state: planted, refusalCopy: REFUSAL_COPY, fallbackCopy: REFUSAL_COPY.unknown })
      );
      expect(html).not.toContain("SENTINEL-UNIT");
      expect(html).not.toContain('data-testid="studio-claims"');
    }
  });
});

// ---------------------------------------------------------------------------
// LAYER 3: THE SOURCE SCAN.
//
// Five alternatives, each covering its spellings (gate M2 widened four of
// them):
//   1. member access — `.guidance`, `?.guidance`, `!.guidance`;
//   2. the renamed carrier member `disclosureGuidance`;
//   3. bracket access — `["guidance"]`, `?.["guidance"]`, `!["guidance"]`,
//      any of the three quote characters;
//   4. a nested pattern or literal — `{ disclosure: { guidance } }`;
//   5. a destructure — `{ guidance } = o.disclosure`, with the right-hand
//      side optionally parenthesised or optional-chained (`= (o.disclosure)`,
//      `= o?.disclosure`).
// One alternation, a RegExp literal (a string-assembled one fails open on one
// lost backslash, CLAUDE.md 2026-08-26).
const READS_GUIDANCE =
  /\bdisclosure\s*(?:\?\.|!\s*\.|\.)\s*guidance\b|\bdisclosureGuidance\b|\bdisclosure\s*(?:\?\.|!)?\s*\[\s*["'`]guidance["'`]\s*\]|\bdisclosure\s*:\s*\{[^}]*\bguidance\b|\{[^}]*\bguidance\b[^}]*\}\s*=\s*\(?\s*[\w.?!]*\bdisclosure\b/g;

/** Matches per file, over comment-blanked production source. */
function guidanceReads(files: readonly { file: string; text: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { file, text } of files) {
    const n = (blankComments(text).match(READS_GUIDANCE) ?? []).length;
    if (n > 0) out[file] = n;
  }
  return out;
}

/**
 * THE EXPECTED SET, PER FILE AND COUNTED — so an ADDED read inside an exempt
 * file is as red as a new file. A read REPLACED inside an exempt file, keeping
 * that file's count, is not seen: the count is a ratchet on how many reads a
 * file has, not on which ones (gate L3). Measured 2026-10-05 with this function over
 * `PRODUCTION_ROOTS` minus every `tests/` segment (366 files): 11 matches in
 * 7 files after the gate repairs. Gate M2's wider spellings added one
 * (`saved-generation.ts`'s nested-literal overwrite); gate B1's removal of the
 * disclosure fields from the event scan took `mode-checks.ts` from 3 to 1
 * (1 + 1 + 3 + 1 + 2 + 2 + 1, in the table's order). Before this phase, a raw
 * grep of the original four spellings (taken before the edits, not through
 * this function) also hit the live carriers 8 times — `studio/generation-outcome.tsx` 1, `studio/projection.ts`
 * 2, `trends/actions.ts` 3, `trends/spin-panel.tsx` 1, `trends/spin-state.ts` 1.
 *
 * Every entry left is a GATE INPUT, a record KEY, or the PRODUCT's sentence,
 * never a presentation of the model's:
 */
const EXPECTED_GUIDANCE_READS: Readonly<Record<string, readonly [number, string]>> = {
  "packages/modes/src/output.ts": [1, "the /disclosure/guidance text unit the similarity gate compares"],
  "packages/modes/src/mode-checks.ts": [
    1,
    "the `\"disclosure.guidance\"` KEY of `EVENT_SCAN_EXCLUDED` — the entry recording that the event scan no longer reads the field (R-154); a string, not a read",
  ],
  // THE SAVED PATH (launch L4). Its member is NAMED `disclosureGuidance`, and
  // its value is `PRESENTED_DISCLOSURE_GUIDANCE[kind]` — the product's
  // sentence, set at `saved-generation.ts` and pinned there by
  // `packages/credits/tests/saved-generation.test.ts`; `tests/studio-ui.test.tsx`
  // plants model advice into the stored output and proves the saved renderer
  // reads this member only. The spelling matches; the content is not the model's.
  "packages/credits/src/saved-generation.ts": [
    3,
    "saved path: declares and sets the product sentence, and `presentedOutputOf` writes it OVER the stored output's model disclosure (`disclosure: { platform, guidance: PRESENTED_DISCLOSURE_GUIDANCE[kind] }`)",
  ],
  "app/(product)/studio/run-state.ts": [1, "saved path: SavedPackView's product-sentence member"],
  "app/(product)/studio/projection.ts": [2, "saved path: savedPackFor copies the product sentence"],
  "app/(product)/studio/saved/recording-pack.ts": [2, "saved path: the copied script and the Markdown export"],
  "app/(product)/studio/saved/saved-view.tsx": [1, "saved path: the saved page's disclosure line"],
};

describe("layer 3: no production source reads the model's disclosure guidance", () => {
  const production = sourceFilesUnder(PRODUCTION_ROOTS).filter(
    ({ file }) => !file.split("/").includes("tests")
  );

  it("the measured reads equal the expected set, both ways and per file", () => {
    expect(production.length, "the scan read almost nothing").toBeGreaterThan(300);
    // The widened roots are really in it.
    const names = production.map(({ file }) => file);
    expect(names.some((f) => f.startsWith("worker/"))).toBe(true);
    expect(names.some((f) => f.startsWith("scripts/"))).toBe(true);
    expect(names.some((f) => f.startsWith("lib/"))).toBe(true);
    const expected = Object.fromEntries(
      Object.entries(EXPECTED_GUIDANCE_READS).map(([file, [count]]) => [file, count])
    );
    expect(guidanceReads(production)).toEqual(expected);
  });

  it("NON-VACUITY: each spelling is caught, under worker/, app/ and packages/ alike", () => {
    const plants: [string, string][] = [
      ["app/(product)/plant-member.tsx", "export const P = () => <p>{doc.disclosure.guidance}</p>;"],
      ["packages/credits/src/plant-renamed.ts", "export type S = { disclosureGuidance: string };"],
      ["worker/plant-destructure.ts", "const { guidance } = doc.disclosure;"],
      ["app/(product)/plant-bracket.ts", 'const g = output.disclosure["guidance"];'],
      // Gate M2's five, each a spelling the four-alternative scan missed.
      ["app/(product)/plant-optional.tsx", "export const P = () => <p>{doc.disclosure?.guidance}</p>;"],
      ["packages/credits/src/plant-nonnull.ts", "const g = doc.disclosure!.guidance;"],
      ["worker/plant-optional-bracket.ts", 'const g = output.disclosure?.["guidance"];'],
      ["app/(product)/plant-nested.ts", "const { disclosure: { guidance } } = output;"],
      ["lib/plant-paren.ts", "const { guidance } = (o.disclosure);"],
      // ...and two neighbours of those: a template-quoted bracket, an
      // optional-chained right-hand side.
      ["app/(product)/plant-template.ts", "const g = output.disclosure[`guidance`];"],
      ["app/(product)/plant-optional-rhs.ts", "const { guidance } = o?.disclosure;"],
    ];
    for (const [file, text] of plants) {
      expect(guidanceReads([{ file, text }]), text).toEqual({ [file]: 1 });
    }
    // ...and a read inside an EXEMPT file is still counted, so the exemption
    // is a number, not a pass.
    const exempt = "packages/modes/src/output.ts";
    expect(guidanceReads([{ file: exempt, text: "a(o.disclosure.guidance); b(o.disclosure.guidance);" }])).toEqual({
      [exempt]: 2,
    });
  });

  it("NON-VACUITY: a spelling inside a comment does not fire — the blanking is real", () => {
    expect(guidanceReads([{ file: "app/x.ts", text: "// <p>{doc.disclosure.guidance}</p>\n" }])).toEqual({});
    expect(guidanceReads([{ file: "app/x.ts", text: "/* const { guidance } = doc.disclosure; */\n" }])).toEqual({});
  });
});

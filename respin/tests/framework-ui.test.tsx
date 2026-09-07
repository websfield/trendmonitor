// `/studio/frameworks` — the framework library and the private-framework CRUD
// (slice 7, R5b/R5c/R15 / REQ-D01/D02/D04/D05).
//
// WHAT THIS SUITE GUARDS THAT NOTHING ELSE DOES. `packages/db/tests/frameworks.
// test.ts` proves the OPERATIONS against real SQL — the strict parse, the
// bounds, the mechanism-level scan, the versioning, the tier gate. What it
// cannot see is the screen: whether the form's stated limit is the enforced
// one, whether a private row can be rendered as curated library content,
// whether the tier refusal sells an upgrade, and whether the entitlement a
// write is performed under came from the one producer or from a literal
// somebody typed. Those are this file's.
//
// FOUR MECHANISMS, in the order they matter:
//
//  1. THE ENTITLEMENT IS NEVER A LITERAL. A source scan over the actions
//     forbids `"included"` and `"not_included"` as written values, because
//     `privateFrameworkEntitlement` is the ONE producer of that argument and a
//     literal there is the line that decides whether a Free workspace gets a
//     Pro feature.
//  2. THE FORM'S SHAPE IS PROVED AGAINST THE REAL SCHEMA. The pure parser's
//     output is parsed by `frameworkContentSchema` itself — a `strictObject`,
//     so a field this form invents is a red test rather than a refusal a
//     creator reads as "that framework was not stored".
//  3. R5c's ANTI-MASQUERADE HALF is a property of the markup: every row prints
//     its own `visibility`, so a private row under the shared heading says
//     `private` on itself.
//  4. R15: the tier refusal names what the reader HAS, never a price.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FRAMEWORK_CONFIDENCE_RUNGS,
  FRAMEWORK_GOALS,
  FRAMEWORK_LIST_MAX,
  FRAMEWORK_NAME_MAX,
  FRAMEWORK_NICHES,
  FRAMEWORK_SOURCE_KINDS,
  FRAMEWORK_TEXT_MAX,
  PRIVATE_FRAMEWORK_COUNT_MAX,
  SATURATION_NOTICE,
  frameworkContentSchema,
} from "@respin/db";
import { TIER_PRIVATE_FRAMEWORKS } from "@respin/credits";
// BY PATH, for the reason `tests/claims-vocabulary-agreement.test.ts` records:
// `tests/**` is the only tree exempt from the T1 default-deny, and importing
// `@respin/db`'s rule list by path keeps the app package's resolution
// unchanged. The rule is the AUTHORITY on how certain this screen may sound.
import { MECHANISM_CONTENT_RULES } from "../packages/db/src/frameworks";
import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import {
  CODE_FOR_ERROR_CLASS,
  ERROR_CLASS_COVERED_BY_BASE,
  INSTANCE_BRANCH_CODES,
} from "../app/(product)/billing-errors";
import {
  FRAMEWORK_ERROR_CODES,
  curateBlock,
  frameworkErrorFor,
  frameworkRefusalCopy,
} from "../app/(product)/studio/frameworks/copy";
import {
  CREATOR_EVIDENCE_KIND,
  FRAMEWORK_EVIDENCE_SLOTS,
  NEW_FRAMEWORK_SATURATION,
  frameworkContentFromForm,
  linesOf,
} from "../app/(product)/studio/frameworks/form-state";
import {
  PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
  PRIVATE_FRAMEWORKS_PAUSED,
  VIEWER_CANNOT_CURATE,
  confidenceNote,
  saturationNote,
} from "../app/(product)/studio/frameworks/form-copy";
import {
  FrameworksView,
  type FrameworksViewProps,
} from "../app/(product)/studio/frameworks/frameworks-view";
import type { FrameworkView } from "../app/(product)/studio/frameworks/view-state";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** React escapes; the scan reads what a CREATOR reads. */
function decoded(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Markup removed, so a `data-testid` cannot satisfy a copy assertion. */
function visibleCopy(html: string): string {
  return decoded(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
}

const REFUSAL_COPY = frameworkRefusalCopy();

const framework = (over: Partial<FrameworkView> = {}): FrameworkView => ({
  id: "f-1",
  name: "The Confession Arc",
  slug: "the-confession-arc",
  version: 1,
  visibility: "shared",
  curatorStatus: "approved",
  confidence: "repeated",
  saturation: "observed",
  saturationNotice: SATURATION_NOTICE,
  beats: ["Admit the thing", "Show the cost", "Name the correction"],
  whyItConverts: "It earns the correction by paying for it first.",
  applicability: [{ goal: "saves", niche: "any", note: "Where the stakes are personal." }],
  evidenceEntries: [
    { kind: "internal_autopsy", ref: "batch-3", observation: "The turn landed on the admission." },
  ],
  testedCaveats: ["It fails when the admission is not costly."],
  approved: true,
  retired: false,
  ...over,
});

const baseProps: FrameworksViewProps = {
  profileName: "Anna",
  shared: [framework()],
  privateFrameworks: [
    framework({
      id: "f-2",
      name: "My own reversal",
      slug: "my-own-reversal",
      visibility: "private",
      curatorStatus: "proposed",
      confidence: "single_case",
      approved: false,
    }),
  ],
  curate: {
    createAction: async () => ({ status: "idle" }) as const,
    editAction: async () => ({ status: "idle" }) as const,
    approveAction: async () => ({ status: "idle" }) as const,
    retireAction: async () => ({ status: "idle" }) as const,
    frameworks: [
      { id: "f-2", name: "My own reversal", version: 1, approved: false, retired: false },
    ],
    goals: FRAMEWORK_GOALS,
    niches: FRAMEWORK_NICHES,
    nameMax: FRAMEWORK_NAME_MAX,
    textMax: FRAMEWORK_TEXT_MAX,
    listMax: FRAMEWORK_LIST_MAX,
    countMax: PRIVATE_FRAMEWORK_COUNT_MAX,
    refusalCopy: REFUSAL_COPY,
    fallbackCopy: REFUSAL_COPY.unknown,
  },
  block: null,
  error: null,
  onboardingHref: "/onboarding",
  studioHref: "/studio",
  exportHref: "/api/export?profile=p-1&format=json",
};

const render = (p: Partial<FrameworksViewProps> = {}) =>
  renderToStaticMarkup(<FrameworksView {...baseProps} {...p} />);

// ------------------------------------------------- the entitlement producer

describe("R5c/REQ-D05: the entitlement comes from ONE producer, never a literal", () => {
  it("the actions never write `included` or `not_included` themselves", () => {
    // THE LINE THAT DECIDES WHETHER A FREE WORKSPACE GETS A PRO FEATURE.
    // `@respin/db`'s `assertEntitled` refuses anything that is not the literal
    // `"included"`, so a hand-typed `"included"` in an action is a permanent
    // grant that no tier read can revoke — and it would look exactly like the
    // correct code.
    const src = read("app/(product)/studio/frameworks/actions.ts")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    // NON-VACUITY: the pattern really matches a planted literal.
    expect(/["']not_included["']|["']included["']/.test('const e = "included";')).toBe(
      true
    );
    expect(src, "an entitlement literal is written into an action").not.toMatch(
      /["']not_included["']|["']included["']/
    );
    // ...and every write really does pass the producer's answer.
    expect(src).toMatch(/privateFrameworkEntitlement\(state\.tier\)/);
    const writes = [
      "createPrivateFramework",
      "editPrivateFramework",
      "approvePrivateFramework",
      "retirePrivateFramework",
    ];
    for (const write of writes) {
      expect(src, write).toContain(`respinDb.${write}(`);
    }
    // ONE resolver for all four, so a fifth write cannot acquire its own.
    expect([...src.matchAll(/entitlementFor\(scope\)/g)].length).toBe(writes.length);
  });

  it("the tier map really is Pro and Studio only (PRD §4G), read from the authority", () => {
    // Transcribed INDEPENDENTLY of the map, so this asserts the pricing table
    // rather than that the map equals itself.
    expect(TIER_PRIVATE_FRAMEWORKS.free).toBe("not_included");
    expect(TIER_PRIVATE_FRAMEWORKS.creator).toBe("not_included");
    expect(TIER_PRIVATE_FRAMEWORKS.pro).toBe("included");
    expect(TIER_PRIVATE_FRAMEWORKS.studio).toBe("included");
  });

  it("the page fails to `not_included` when the tier cannot be read", () => {
    // THE TWO FAILURE DIRECTIONS ARE NOT SYMMETRICAL. Under-offering costs a
    // creator a reload; over-offering hands them a form whose submit is refused
    // after they have written a framework.
    const pageSrc = read("app/(product)/studio/frameworks/page.tsx");
    expect(pageSrc).toMatch(
      /let entitlement: PrivateFrameworkEntitlement = "not_included";/
    );
    // THE PAGE'S ONE DELIBERATE LITERAL, and it is the ONLY one: the actions
    // carry none at all (the case above), so the single place a written
    // entitlement appears in `app/**` is this fail-closed default.
    expect(
      [...pageSrc.matchAll(/["'](?:not_)?included["']/g)].length,
      "a second entitlement literal has appeared on the page"
    ).toBe(1);
  });
});

// -------------------------------------------------- the gate order and copy

describe("R15: the refusals name what the reader HAS, never a price", () => {
  it("curateBlock refuses a viewer BEFORE it refuses a plan", () => {
    // A viewer on a Pro workspace cannot curate whatever the plan says, and
    // telling them "this plan does not include private frameworks" would be
    // false about their workspace. `@respin/db`'s operations check in the same
    // order (`assertMayCurate` before `assertEntitled`).
    const viewerOnPro = curateBlock({
      isViewer: true,
      entitlement: "included",
      paused: false,
      viewerReason: VIEWER_CANNOT_CURATE,
      notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
      pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
    });
    expect(viewerOnPro?.kind).toBe("role");
    const viewerOnFree = curateBlock({
      isViewer: true,
      entitlement: "not_included",
      paused: false,
      viewerReason: VIEWER_CANNOT_CURATE,
      notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
      pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
    });
    expect(viewerOnFree?.kind, "a viewer is told about the plan, not their access").toBe(
      "role"
    );
    expect(
      curateBlock({
        isViewer: false,
        entitlement: "not_included",
        paused: false,
        viewerReason: VIEWER_CANNOT_CURATE,
        notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
        pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
      })?.kind
    ).toBe("plan");
    expect(
      curateBlock({
        isViewer: false,
        entitlement: "included",
        paused: false,
        viewerReason: VIEWER_CANNOT_CURATE,
        notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
        pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
      })
    ).toBeNull();
  });

  it("REQ-G08: a PAUSED workspace is not offered the form its submit would refuse", () => {
    // THE HALF THAT WAS MISSING (billing gate, 2026-09-01). `@respin/db`'s four
    // framework writes grew `assertNotPaused` (`WorkspacePausedError`), and
    // this function still gated on role and entitlement alone — so a paused Pro
    // workspace was handed a form, wrote a framework, and was refused on
    // submit. The pre-emptive note and the server's refusal must agree.
    const paused = curateBlock({
      isViewer: false,
      entitlement: "included",
      paused: true,
      viewerReason: VIEWER_CANNOT_CURATE,
      notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
      pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
    });
    expect(paused?.kind).toBe("paused");
    expect(paused?.reason).toBe(PRIVATE_FRAMEWORKS_PAUSED);

    // THE FALSE BRANCH, DRIVEN — a required parameter with no default reads
    // exactly like a guard and is not one until something drives it both ways
    // (CLAUDE.md, 2026-08-29). The case above is the only difference from the
    // unblocked case asserted one test up.
    expect(
      curateBlock({
        isViewer: false,
        entitlement: "included",
        paused: false,
        viewerReason: VIEWER_CANNOT_CURATE,
        notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
        pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
      })
    ).toBeNull();

    // THE ORDER IS THE SERVER'S: role, then plan, then pause. A viewer on a
    // paused workspace is told about their access; a Free creator on a paused
    // workspace is told about the plan — because that is the refusal they
    // would actually receive, `assertMayCurate` and `assertEntitled` both
    // running before the transaction `assertNotPaused` lives in.
    expect(
      curateBlock({
        isViewer: true,
        entitlement: "included",
        paused: true,
        viewerReason: VIEWER_CANNOT_CURATE,
        notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
        pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
      })?.kind
    ).toBe("role");
    expect(
      curateBlock({
        isViewer: false,
        entitlement: "not_included",
        paused: true,
        viewerReason: VIEWER_CANNOT_CURATE,
        notInPlanReason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
        pausedReason: PRIVATE_FRAMEWORKS_PAUSED,
      })?.kind
    ).toBe("plan");

    // THE SERVER GATE THIS COURTESY MIRRORS IS REAL, read from the file that
    // owns it: a pre-emptive block for a refusal the server does not make
    // would withhold a control for no reason, which is the opposite defect.
    const dbSrc = read("packages/db/src/frameworks.ts");
    expect(dbSrc).toMatch(/async function assertNotPaused/);
    expect(
      [...dbSrc.matchAll(/^\s*await assertNotPaused\(/gm)].length,
      "the four framework writes do not all carry the pause gate"
    ).toBe(4);
  });

  it("...and the three refusal sentences say DIFFERENT things, none of them a sale", () => {
    const sentences = [
      VIEWER_CANNOT_CURATE,
      PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
      PRIVATE_FRAMEWORKS_PAUSED,
    ];
    expect(new Set(sentences).size, "two refusals share one sentence").toBe(3);
    // R15, on the pre-emptive notes as well as on the codes: "resume" is the
    // state the reader was already in, never an upgrade.
    const SELLS = /\bupgrad|move to a (higher |paid )?plan|a plan that includes|\bsubscribe\b|\bpricing\b/;
    for (const s of sentences) expect(SELLS.test(s.toLowerCase()), s.slice(0, 50)).toBe(false);
    expect(SELLS.test("upgrade to pro for this")).toBe(true);
    // THE PAUSE SENTENCE SAYS WHAT IS UNTOUCHED, which is the whole difference
    // between a pause and an outage — and it does NOT blame credits, because
    // curating a framework spends none.
    expect(PRIVATE_FRAMEWORKS_PAUSED).toMatch(/readable on this page/i);
    expect(PRIVATE_FRAMEWORKS_PAUSED).toMatch(/resume/i);
    expect(PRIVATE_FRAMEWORKS_PAUSED.toLowerCase()).not.toMatch(/credits are frozen/);

    // THE NOTE AND THE REFUSAL MUST AGREE, because one is what a creator reads
    // before pressing and the other is what they get if they press anyway —
    // the same pairing the tier sentence is held to below. Both name the plan
    // feature rather than a credit freeze, both say nothing changed, and both
    // say the frameworks are still readable.
    const served = frameworkErrorFor("workspace_paused")!.detail;
    for (const text of [PRIVATE_FRAMEWORKS_PAUSED, served]) {
      expect(text).toMatch(/plan features are on hold/i);
      expect(text).toMatch(/still readable on this page/i);
      expect(text).toMatch(/resume from the billing page/i);
    }
    expect(served).toMatch(/nothing was changed/i);
    expect(PRIVATE_FRAMEWORKS_PAUSED).toMatch(/nothing about your frameworks has changed/i);
  });

  it("NO refusal on this screen sells an upgrade — every code, derived", () => {
    // THE POPULATION IS THE CLOSED SET, not a remembered subset: adding a code
    // is what forces the audit (CLAUDE.md, 2026-08-29). `profile_cap` and
    // `ModeNotInPlanError` set the precedent, and a tier boundary is exactly
    // where "upgrade for this" writes itself.
    const offenders = (FRAMEWORK_ERROR_CODES as readonly string[]).filter((code) => {
      const copy = frameworkErrorFor(code)!;
      return /\bupgrad|move to a (higher |paid )?plan|a plan that includes|\bsubscribe\b|\bpricing\b/.test(
        `${copy.title} ${copy.detail}`.toLowerCase()
      );
    });
    expect(offenders, "a refusal on the framework screen sells a plan").toEqual([]);
    // NON-VACUITY: the pattern catches a planted violation.
    expect(
      /\bupgrad|move to a (higher |paid )?plan|a plan that includes|\bsubscribe\b|\bpricing\b/.test(
        "upgrade to pro for this"
      )
    ).toBe(true);
  });

  it("the tier sentence names the SHARED library, which every plan has", () => {
    // What replaces the sale: a fact the reader can act on. The pre-emptive
    // note and the server's refusal must agree, because one is what a creator
    // reads before pressing and the other is what they get if they press.
    for (const text of [
      PRIVATE_FRAMEWORKS_NOT_IN_PLAN,
      frameworkErrorFor("private_framework_tier")!.detail,
    ]) {
      expect(text).toMatch(/shared (framework )?library/i);
      expect(text).toMatch(/every plan/i);
      expect(text.toLowerCase()).not.toContain("upgrade");
    }
    expect(frameworkErrorFor("private_framework_tier")!.detail).toMatch(
      /nothing was stored/i
    );
  });

  it("every code in the closed set resolves to real words, not to nothing", () => {
    expect(FRAMEWORK_ERROR_CODES.length).toBeGreaterThan(8);
    for (const code of FRAMEWORK_ERROR_CODES) {
      const copy = frameworkErrorFor(code)!;
      expect(copy, code).not.toBeNull();
      expect(copy.title.length, code).toBeGreaterThan(5);
      expect(copy.detail.length, code).toBeGreaterThan(40);
    }
  });

  it("a code this screen cannot emit falls back to neutral words, never a stranger's", () => {
    // `/studio/frameworks?e=insufficient_credits` must not render the studio's
    // sentence about buying a credit pack: nothing on this screen spends.
    expect(frameworkErrorFor("insufficient_credits")!.title).toBe("Something went wrong");
    expect(frameworkErrorFor(undefined)).toBeNull();
    expect(frameworkErrorFor("totally-made-up")!.title).toBe("Something went wrong");
  });

  it("NO code in the closed set claims a credit was or was not spent WRONGLY", () => {
    // Curating a framework spends nothing, so the shared `workspace_paused`
    // sentence — written for a brain build — would tell a creator about a
    // credit freeze that has nothing to do with what they pressed.
    const paused = frameworkErrorFor("workspace_paused")!;
    expect(paused.detail).toMatch(/Curating a framework spends nothing/i);
    expect(paused.detail).not.toMatch(/building or updating a creator brain/i);
  });
});

// ------------------------------------------------ the form and the schema

describe("the form produces what `frameworkContentSchema` accepts", () => {
  const form = (fields: Record<string, string>) => ({
    get: (name: string) => fields[name],
  });

  const filled = form({
    name: "The Reversal",
    beats: "Open on the received wisdom\n\nName what it costs\nShow the opposite working",
    whyItConverts: "It makes the viewer's existing belief the thing at stake.",
    goal: FRAMEWORK_GOALS[0],
    niche: FRAMEWORK_NICHES[0],
    applicabilityNote: "Where the audience already holds the belief.",
    testedCaveats: "It fails if the received wisdom is not actually held.",
    evidenceRef0: "batch-9",
    evidenceObservation0: "The turn landed on the reversal, not on the hook.",
    evidenceRef1: "  ",
    evidenceObservation1: "orphaned observation with no reference",
    evidenceRef2: "batch-11",
    evidenceObservation2: "Same shape, different topic.",
  });

  it("a filled form parses through the REAL schema, strictly", () => {
    // `frameworkContentSchema` is a `strictObject` — it REFUSES an unknown key
    // rather than stripping it — so a field this form invents is caught here
    // rather than surfacing to a creator as "that framework was not stored".
    const parsed = frameworkContentSchema.parse(frameworkContentFromForm(filled));
    expect(parsed.name).toBe("The Reversal");
    expect(parsed.saturation).toBe(NEW_FRAMEWORK_SATURATION);
  });

  it("an EMPTY form is PARSED without throwing and REFUSED by the schema", () => {
    // TWO HALVES, and the split is the whole design. The parser is TOTAL — it
    // reads whatever is there and never throws — because a parser that
    // validated would be a second answer free to disagree with the one a
    // creator's data really passes. The SCHEMA is what refuses: an empty form
    // carries `goal: ""`, which is not in `FRAMEWORK_GOALS`, and
    // `prepareContent` turns that ZodError into `FrameworkContentError` inside
    // the transaction that would have written the row.
    expect(() => frameworkContentFromForm(form({}))).not.toThrow();
    const empty = frameworkContentFromForm(form({}));
    expect(empty.name).toBe("");
    expect(empty.beats).toEqual([]);
    expect(() => frameworkContentSchema.parse(empty)).toThrow();
    // ...and the ONE reason it is refused is the closed vocabulary, not the
    // blank name — which is `assertFrameworkBounds`' job, one step later.
    const named = frameworkContentFromForm(
      form({ goal: FRAMEWORK_GOALS[0], niche: FRAMEWORK_NICHES[0] })
    );
    expect(() => frameworkContentSchema.parse(named)).not.toThrow();
  });

  it("the three server-decided values are the ones the file's header justifies", () => {
    const content = frameworkContentFromForm(filled);
    // `saturation` is a market claim nothing has measured — see the header.
    expect(NEW_FRAMEWORK_SATURATION).toBe("observed");
    expect(content.saturation).toBe("observed");
    // `sourceReferences` is empty because the evidence entries carry the refs.
    expect(content.sourceReferences).toEqual([]);
    // Every evidence entry is `creator_submitted`: the other two kinds name
    // records this product produced, and a creator cannot truthfully claim one.
    expect(FRAMEWORK_SOURCE_KINDS).toContain(CREATOR_EVIDENCE_KIND);
    expect(CREATOR_EVIDENCE_KIND).toBe("creator_submitted");
    for (const e of content.evidenceEntries) expect(e.kind).toBe(CREATOR_EVIDENCE_KIND);
  });

  it("a slot with no REFERENCE is an empty slot, never an entry with a blank ref", () => {
    // `deriveFrameworkConfidence` counts ENTRIES, so a blank one would raise a
    // framework's confidence rung for a field the creator left alone — the
    // evidence ladder inflated by an empty textarea.
    const content = frameworkContentFromForm(filled);
    expect(content.evidenceEntries.map((e) => e.ref)).toEqual(["batch-9", "batch-11"]);
    expect(JSON.stringify(content)).not.toContain("orphaned observation");
  });

  it("linesOf drops blank lines and edits nothing else", () => {
    expect(linesOf("a\n\n b \nc")).toEqual(["a", "b", "c"]);
    expect(linesOf("   \n\t")).toEqual([]);
    // A CREATOR'S OWN WORDS, not rewritten: only the ends are trimmed.
    expect(linesOf("don't  do   this")).toEqual(["don't  do   this"]);
  });

  it("the form's STATED limits are the DATABASE's, not numbers typed in", () => {
    // `POST_CONTENT_MAX`'s precedent: the limit was hand-copied into four
    // places with nothing binding them, so moving a constant silently made the
    // copy wrong. The page passes the real constants; the panel renders them.
    const pageSrc = read("app/(product)/studio/frameworks/page.tsx");
    for (const name of [
      "FRAMEWORK_NAME_MAX",
      "FRAMEWORK_TEXT_MAX",
      "FRAMEWORK_LIST_MAX",
      "PRIVATE_FRAMEWORK_COUNT_MAX",
      "FRAMEWORK_GOALS",
      "FRAMEWORK_NICHES",
    ]) {
      expect(pageSrc, name).toContain(name);
    }
    const html = render();
    expect(html).toContain(`maxLength="${FRAMEWORK_NAME_MAX}"`);
    expect(visibleCopy(html)).toContain(String(FRAMEWORK_NAME_MAX));
    expect(visibleCopy(html)).toContain(String(PRIVATE_FRAMEWORK_COUNT_MAX));
  });

  it("the evidence ladder's CEILING from this form is stated, not discovered", () => {
    // Three slots reach `repeated`; `contrasted` needs five. Saying so is the
    // difference between a limit and a mystery.
    expect(FRAMEWORK_EVIDENCE_SLOTS).toBe(3);
    const html = visibleCopy(render());
    expect(html).toMatch(/room for three, so it is not reachable from here/i);
    // ...and the rung vocabulary the copy explains is the DATABASE's.
    for (const rung of FRAMEWORK_CONFIDENCE_RUNGS) {
      expect(confidenceNote(rung), rung).not.toBe(rung);
      expect(confidenceNote(rung).length, rung).toBeGreaterThan(10);
    }
    // A rung this screen does not know gets the neutral sentence, not a guess.
    expect(confidenceNote("brand_new")).toMatch(/number of examples/i);
  });
});

// ------------------------------------------------------ R5b: what is shown

describe("R5b: the library shows approved, non-retired rows — and warns on saturated", () => {
  it("the screen applies NO filter of its own — `recommendable()` is the one predicate", () => {
    // A filter here would be a SECOND answer to "what is recommendable", free
    // to disagree with the one the generation path reads. `@respin/db`'s
    // `recommendable()` is shared by the library reader and the accessor, which
    // is what makes "what the screen shows" and "what a draft can use" the same
    // set — and mutation M8 a one-line edit in ONE place rather than two.
    const src = read("app/(product)/studio/frameworks/page.tsx")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    for (const shape of [
      /curatorStatus === "approved"\s*\)/,
      /\.filter\(.*retiredAt/,
      /\.filter\(.*supersededAt/,
      /\.filter\(.*curatorStatus/,
    ]) {
      expect(shape.test(src), `${shape} re-filters the library on the screen`).toBe(
        false
      );
    }
    expect(src).toContain("respinDb.sharedFrameworkLibrary()");
  });

  it("every unmeasured framework carries the limitation the ROW brought with it", () => {
    // No framework-level population/window exists yet, regardless of the
    // legacy curator tag stored on the row.
    // The sentence is `SATURATION_NOTICE`, attached by `@respin/db`'s readers —
    // "a warning that every consumer has to reimplement is a warning one of
    // them will omit" — so this screen renders the value it was handed.
    const html = decoded(
      render({
        shared: [
          framework({ saturation: "saturated", saturationNotice: SATURATION_NOTICE }),
        ],
      })
    );
    expect(html).toContain('data-testid="framework-saturation-notice"');
    expect(html).toContain(SATURATION_NOTICE);
    expect(html).toContain("Curator/library tag: Unmeasured");
    expect(html).toContain("Framework limitation");
    expect(html).not.toContain("Audiences have seen a lot of this shape lately");
    expect(html).not.toMatch(/seen to work|showing up more often|widely used|heavily used|worn out/i);
    // ...and an ordinary legacy tag cannot silently drop the same limitation.
    expect(decoded(render())).toContain('data-testid="framework-saturation-notice"');
  });

  it("the screen holds NO copy of the saturation notice", () => {
    // A second copy in `app/**` would be a description of a control maintained
    // apart from the control — the rule `TRACEABILITY_LIMIT_NOTE` already
    // taught this repo one screen over.
    const staleAudienceClaim = "Audiences have seen a lot of this shape lately";
    const newLimitation =
      "Unmeasured curator/library tag: no market population, window, or prevalence has been recorded";
    expect(SATURATION_NOTICE).not.toContain(staleAudienceClaim);
    expect(SATURATION_NOTICE).toContain(newLimitation);
    for (const rel of [
      "app/(product)/studio/frameworks/form-copy.ts",
      "app/(product)/studio/frameworks/frameworks-view.tsx",
      "app/(product)/studio/frameworks/copy.ts",
      "app/(product)/studio/frameworks/framework-panel.tsx",
    ]) {
      expect(read(rel), rel).not.toContain(staleAudienceClaim);
      expect(read(rel), rel).not.toContain(newLimitation);
    }
  });

  it("renders every stored saturation value as the same unmeasured curator/library tag", () => {
    for (const value of ["observed", "emerging", "established", "saturated", "retired"]) {
      expect(saturationNote(value)).toBe("Unmeasured");
    }
    expect(saturationNote("brand-new")).toBe("Unmeasured");
  });

  it("an empty shared library is a NAMED state, not a blank panel", () => {
    const html = visibleCopy(render({ shared: [] }));
    expect(render({ shared: [] })).toContain('data-testid="frameworks-shared-empty"');
    expect(html).toMatch(/an operator seeds them/i);
    // ...and it does not tell the creator their drafts are broken.
    expect(html).toMatch(/Your drafts still run/i);
  });
});

// -------------------------------------- R5c: private rows cannot masquerade

describe("R5c: a private row cannot masquerade as shared or curated", () => {
  it("every row prints its OWN visibility, in words", () => {
    const html = decoded(render());
    // Both lists exist and each row carries its own attribute — so a private
    // row rendered under the shared heading would say `private` on itself.
    expect(html).toContain('data-visibility="shared"');
    expect(html).toContain('data-visibility="private"');
    expect(html).toContain("Shared library");
    expect(html).toContain("Yours");
    // DESIGN.md: status is never colour-only. Both badges carry text.
    expect(html).toContain('data-testid="framework-visibility"');
  });

  it("a row that is not approved says so, in the list a creator is reading", () => {
    // A private framework starts `proposed` and is NOT usable by a draft until
    // its owner approves it. A list that showed no difference would tell a
    // creator their framework was in use when `recommendable()` excludes it.
    const html = decoded(render());
    expect(html).toContain("Not approved yet");
    expect(html).toContain("In use");
    expect(visibleCopy(html)).toMatch(/approving it is what makes your drafts allowed/i);
  });

  it("retiring is described as NOT a delete", () => {
    const html = visibleCopy(render());
    expect(html).toMatch(/does not delete anything/i);
    expect(html).toMatch(/stays in your export/i);
  });

  it("the two lists come from DIFFERENT reads — one scoped, one not", () => {
    // The shared read takes no scope because a shared row has both owner
    // columns NULL by CHECK; the private read carries both. Merging them into
    // one call is how a private row would enter the shared list.
    const src = read("app/(product)/studio/frameworks/page.tsx");
    expect(src).toContain("respinDb.sharedFrameworkLibrary()");
    expect(src).toMatch(/respinDb\.listPrivateFrameworks\(scope, profile\.id\)/);
  });

  it("the projection drops the scope columns rather than shipping them", () => {
    // A `Framework` row carries `owner_profile_id`, `workspace_id`,
    // `curated_by` and `superseded_at`; handing it to a client component would
    // ship a creator's scope columns to the browser to render a name.
    const src = read("app/(product)/studio/frameworks/page.tsx");
    for (const column of ["ownerProfileId", "curatedBy", "supersededAt"]) {
      expect(src, column).not.toMatch(new RegExp(`${column}:\\s*row\\.${column}`));
    }
    // ...and `workspaceId` is nowhere in the view type at all.
    expect(read("app/(product)/studio/frameworks/view-state.ts")).not.toContain(
      "workspaceId"
    );
  });
});

// ------------------------------------------------------------ the states

describe("the screen's states", () => {
  it("a viewer sees every framework and no control", () => {
    const html = render({
      curate: null,
      block: { reason: VIEWER_CANNOT_CURATE, kind: "role" },
    });
    expect(html).toContain('data-testid="frameworks-blocked-role"');
    expect(html).not.toContain('data-testid="framework-create-form"');
    // The READING is unaffected — a viewer may read every profile read in this
    // package, and both lists are still there.
    expect(html).toContain("The Confession Arc");
    expect(html).toContain("My own reversal");
  });

  it("a plan without private frameworks sees the shared library and no form", () => {
    const html = render({
      privateFrameworks: [],
      curate: null,
      block: { reason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN, kind: "plan" },
    });
    expect(html).toContain('data-testid="frameworks-not-in-plan"');
    expect(html).not.toContain('data-testid="framework-create-form"');
    expect(html).toContain("The Confession Arc");
  });

  it("no creator profile is a named state, and the shared library still shows", () => {
    const html = render({ profileName: null, privateFrameworks: [], curate: null });
    expect(html).toContain('data-testid="frameworks-no-profile"');
    expect(html).toContain('href="/onboarding"');
    expect(html).toContain("The Confession Arc");
    expect(html).not.toContain('data-testid="framework-create-form"');
  });

  it("a `?e=` code renders as an alert with this screen's own words", () => {
    const html = render({ error: frameworkErrorFor("framework_content") });
    expect(html).toContain('data-testid="frameworks-action-error"');
    expect(html).toContain('role="alert"');
    // REQ-D04's four detectable classes, named so a creator can act on the
    // refusal rather than guess which word was the problem.
    const text = decoded(html);
    expect(text).toMatch(/a handle, a link, a follower count or another metric/i);
    expect(text).toMatch(/crediting the move to a named person/i);
  });

  it("the screen is NOT MORE CERTAIN than the check it reports", () => {
    // THE DEFECT (slice 7 cross-boundary pass, 2026-09-01). This copy asserted
    // as fact that the framework "carried something a mechanism never carries
    // — … a phrase crediting the move to a named person". The rule behind that
    // clause is LEXICAL: `attributed_person` sees the SHAPE of an attribution
    // and cannot know a capitalised word is a person, which is why the same
    // gate round hedged the SERVER's detail to "reads like it credits …" after
    // it over-refused five of seven ordinary sentences. A screen restating a
    // hedged finding as certain reopens the defect one layer up.
    //
    // BOUND TO THE RULE RATHER THAN PINNED AS A STRING, so the two cannot
    // drift apart: the rule's own `detail` is the authority on how certain
    // this refusal is allowed to sound.
    const rule = MECHANISM_CONTENT_RULES.find((r) => r.id === "attributed_person");
    expect(rule, "attributed_person is no longer a rule").toBeDefined();
    expect(
      rule!.detail,
      "the server's own detail stopped hedging — then this whole binding is backwards"
    ).toMatch(/reads like/i);

    const detail = frameworkErrorFor("framework_content")!.detail;
    // The screen hedges too, and says WHY: the check reads wording.
    expect(detail).toMatch(/reads like/i);
    expect(detail).toMatch(/wording rather than meaning/i);
    // ...and it no longer asserts the finding as a fact about what was written.
    expect(detail).not.toMatch(/because it carried something/i);
  });

  it("the export link is PER PROFILE and PER FORMAT, never a bare /api/export", () => {
    // FOUND BY RE-READING THE DIFF AGAINST THE ROUTE (2026-09-01). The first
    // draft linked `/api/export`; `app/api/export/route.ts` reads `?profile`
    // and `?format` off the URL and refuses without them, so the link was a
    // link that 400s — on the sentence whose whole job is telling a creator
    // where their framework versions live. `/brain` already builds the href
    // this way, and the page now builds the same one from the profile it has
    // already scoped to.
    const html = render();
    expect(html).toContain('data-testid="frameworks-export-note"');
    expect(html).toContain("/api/export?profile=");
    expect(html).toContain("format=json");
    const pageSrc = read("app/(product)/studio/frameworks/page.tsx");
    expect(pageSrc).toMatch(
      /exportHref=\{`\/api\/export\?profile=\$\{profile\.id\}&format=json`\}/
    );
    // NO PROFILE, NO LINK: the type is `string | null` and the note renders
    // plain words rather than an anchor that cannot work.
    const noProfile = render({ exportHref: null });
    expect(noProfile).not.toContain('href="/api/export');
  });

  it("with no private frameworks written, the empty state explains rather than blanks", () => {
    const html = render({
      privateFrameworks: [],
      curate: { ...baseProps.curate!, frameworks: [] },
    });
    expect(html).toContain('data-testid="frameworks-private-empty"');
    expect(visibleCopy(html)).toMatch(/adding one does not replace it/i);
    // ...and the edit/approve/retire forms are absent, because there is nothing
    // to address — a select with no options is a control that cannot be used.
    expect(html).not.toContain('data-testid="framework-edit-form"');
    expect(html).not.toContain('data-testid="framework-retire-form"');
    expect(html).toContain('data-testid="framework-create-form"');
  });
});

// ------------------------------------------------------------- honesty

describe("honesty: this screen claims nothing the product cannot support", () => {
  const STATES: [string, Partial<FrameworksViewProps>][] = [
    ["the full screen", {}],
    ["a saturated shared row", {
      shared: [framework({ saturation: "saturated", saturationNotice: SATURATION_NOTICE })],
    }],
    ["a viewer", { curate: null, block: { reason: VIEWER_CANNOT_CURATE, kind: "role" } }],
    [
      "a plan without private frameworks",
      {
        privateFrameworks: [],
        curate: null,
        block: { reason: PRIVATE_FRAMEWORKS_NOT_IN_PLAN, kind: "plan" },
      },
    ],
    ["no profile", { profileName: null, privateFrameworks: [], curate: null }],
    ["an empty library", { shared: [] }],
    ["a refusal code", { error: frameworkErrorFor("framework_limit") }],
  ];

  it.each(STATES)("%s makes no forbidden claim", (_label, props) => {
    const text = visibleCopy(render(props)).toLowerCase();
    for (const [label, pattern] of [
      ...FORBIDDEN_CLAIMS,
      ...PERFORMANCE_CLAIMS,
    ] as [string, RegExp][]) {
      expect(pattern.test(text), label).toBe(false);
    }
  });

  it("NON-VACUITY: every banned claim's specimen matches its own pattern", () => {
    // A typo in one pattern would otherwise leave that word sayable while the
    // suite stayed green, because some OTHER pattern matched the probe.
    for (const [label, pattern] of FORBIDDEN_CLAIMS) {
      expect(pattern.test(CLAIM_SPECIMENS[label]), label).toBe(true);
    }
  });

  it("...and the scan reads REAL rendered copy, not an empty string", () => {
    const text = visibleCopy(render());
    expect(text.length).toBeGreaterThan(400);
    expect(text).toContain("The Confession Arc");
    expect(text).toContain("Admit the thing");
  });

  it("REQ-D04's rule is stated BEFORE a creator writes, not only in the refusal", () => {
    // A creator who learns the mechanism-level rule from a refusal has already
    // typed the thing that was refused.
    const html = visibleCopy(render());
    expect(html).toMatch(/A framework is a MECHANISM/);
    expect(html).toMatch(/It is not an example, not a person, and not a number/i);
    expect(html).toMatch(/refused before it is stored/i);
  });

  it("the evidence count is never described as a prediction", () => {
    // REQ-D01's ladder counts examples. `contrasted` is the ceiling and is NOT
    // a causal claim — the UGC codebase's rule, and it holds here.
    for (const rung of FRAMEWORK_CONFIDENCE_RUNGS) {
      const note = confidenceNote(rung).toLowerCase();
      for (const forecast of ["will work", "predicts", "guarantee", "proven"]) {
        expect(note, `${rung}/${forecast}`).not.toContain(forecast);
      }
    }
    expect(confidenceNote("contrasted")).toMatch(
      /says nothing about what will happen next/i
    );
  });
});

// ------------------- the refusal-code set is DERIVED from the write path

describe("the screen's code set is DERIVED from what the framework writes throw", () => {
  /**
   * THE POPULATION, STATED AS A LIST (CLAUDE.md, 2026-08-29).
   *
   * Every source file a framework write can throw from. Adding a file here is
   * what a new write path costs — the alternative, a scan pointed at one file,
   * is the shape that shipped the same defect three times on `/onboarding`, and
   * the shape that left `RevisionParentError` without copy one screen over.
   *
   * TWO FILES ARE DELIBERATELY ABSENT, for the reasons `tests/studio-ui.test.tsx`
   * gives for the same two:
   *
   *  - `packages/db/src/with-workspace.ts` — shared by every capability in the
   *    product. A file-level scan over it pulls in refusals genuinely
   *    unreachable from this path (the brain role gate, the interview writes,
   *    the whole feedback family). The classes it contributes here —
   *    `ProfileAccessError` from the mint and `ScopeForgeryError` from
   *    `assertScoped` — are named in `ALSO_REACHABLE` instead.
   *  - `packages/credits/src/state.ts` — `getWorkspaceBillingState` is read for
   *    the tier and throws nothing of its own that this screen can render
   *    differently from `unknown`.
   */
  const FRAMEWORK_WRITE_PATH_SOURCES = [
    "packages/db/src/frameworks.ts",
  ];

  // The shared module also has Results-only Performance Learning resolution.
  // Framework writes receive only `privateFrameworkEntitlement`, so derive
  // refusals from that exported body rather than every unrelated export.
  const modeAccess = read("packages/credits/src/mode-access.ts");
  const privateEntitlementStart = modeAccess.indexOf(
    "export function privateFrameworkEntitlement("
  );
  if (privateEntitlementStart < 0) {
    throw new Error("mode-access no longer exports privateFrameworkEntitlement");
  }
  const privateEntitlementOpen = modeAccess.indexOf("{", privateEntitlementStart);
  let privateEntitlementDepth = 0;
  let privateEntitlementEnd = -1;
  for (let index = privateEntitlementOpen; index < modeAccess.length; index += 1) {
    if (modeAccess[index] === "{") privateEntitlementDepth += 1;
    if (modeAccess[index] === "}" && --privateEntitlementDepth === 0) {
      privateEntitlementEnd = index + 1;
      break;
    }
  }
  if (privateEntitlementEnd < 0) {
    throw new Error("privateFrameworkEntitlement has no closing body");
  }
  const privateEntitlementBody = modeAccess.slice(
    privateEntitlementStart,
    privateEntitlementEnd
  );

  /**
   * Classes reachable from this screen that no scanned file constructs, each
   * with the reason it is named rather than derived.
   */
  const ALSO_REACHABLE: Record<string, string> = {
    // `ProfileScope.mint`, in with-workspace.ts (see above): a foreign, absent
    // or malformed profile id.
    ProfileAccessError: "the profile cage",
    // `assertScoped`, same file.
    ScopeForgeryError: "the workspace cage",
    // `withWorkspace`, reached by this PAGE's own `scopeForUser` call.
    WorkspaceAccessError: "the page's own scope read",
    // `mintProfileScope` refuses an archived profile on every profile write.
    ProfileArchivedError: "the archived-profile gate",
  };

  const src = [...FRAMEWORK_WRITE_PATH_SOURCES.map(read), privateEntitlementBody].join("\n");

  /** Every `new XError(` CONSTRUCTED — from a RegExp LITERAL, never assembled. */
  const thrownClassNames = (text: string): string[] => [
    ...new Set([...text.matchAll(/new (\w+Error)\(/g)].map((m) => m[1])),
  ];

  it("NON-VACUITY: the scan finds the classes it is supposed to find", () => {
    const names = thrownClassNames(src);
    expect(names.length).toBeGreaterThanOrEqual(6);
    for (const expected of [
      "FrameworkAccessError",
      "FrameworkStaleError",
      "FrameworkContentError",
      "FrameworkLimitError",
      "PrivateFrameworkTierError",
      "ProfileRoleError",
      "UnknownEntitlementTierError",
    ]) {
      expect(names, `${expected} is thrown on this screen's write path`).toContain(
        expected
      );
    }
    // ...it finds nothing in text that merely MENTIONS a class...
    expect(thrownClassNames("// throws FrameworkStaleError sometimes")).toEqual([]);
    // ...and it DOES find the ternary form a `throw new X(` scan would miss.
    expect(
      thrownClassNames("throw t ? new FrameworkStaleError() : new OtherError();")
    ).toEqual(["FrameworkStaleError", "OtherError"]);
  });

  it("takes only the private-framework entitlement resolver from shared mode access", () => {
    const actions = read("app/(product)/studio/frameworks/actions.ts");
    expect(actions).toContain("privateFrameworkEntitlement(state.tier)");
    expect(privateEntitlementBody).toContain("UnknownEntitlementTierError");
    expect(src).not.toContain("PerformanceLearningConfigUnavailableError");
  });

  const codeForClassName = (name: string): string | undefined =>
    CODE_FOR_ERROR_CLASS[name] ??
    CODE_FOR_ERROR_CLASS[ERROR_CLASS_COVERED_BY_BASE[name] ?? ""];

  it("every class the write path throws maps to a code this screen has copy for", () => {
    const codes = new Set<string>();
    const names = [...thrownClassNames(src), ...Object.keys(ALSO_REACHABLE)];
    for (const name of names) {
      const code = codeForClassName(name);
      expect(
        code,
        `${name} is thrown on the framework write path but resolves to no billing error code`
      ).toBeDefined();
      codes.add(code as string);
      for (const c of INSTANCE_BRANCH_CODES[name] ?? []) codes.add(c);
    }
    const missing = [...codes].filter(
      (c) => !(FRAMEWORK_ERROR_CODES as readonly string[]).includes(c)
    );
    expect(
      missing,
      "a refusal a framework write can raise would render the neutral fallback"
    ).toEqual([]);
  });

  it("every named ALSO_REACHABLE class really exists on the facade surface", () => {
    // The named half must not rot: a class here that nothing exports would make
    // its entry look like coverage while covering nothing.
    for (const name of Object.keys(ALSO_REACHABLE)) {
      expect(codeForClassName(name), name).toBeDefined();
    }
    expect(Object.keys(ALSO_REACHABLE).length).toBeGreaterThan(0);
  });
});

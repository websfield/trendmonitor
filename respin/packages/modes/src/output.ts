// `ScriptOutput` — the structured document every mode emits, and the fail-closed
// parse that is the only way to get one (slice 6 R3, tech-spec §3 step 6).
//
// THE CONTRACT IS COPIED FROM `parseVoiceReply`, NOT REINVENTED
// (`packages/llm/src/assemble.ts`). Its two properties are the ones that matter
// here:
//
//   1. `z.strictObject` THROUGHOUT. A top-level `.strict()` does not propagate
//      in the installed zod — `brain-content.ts` measured it — so every object
//      node below is strict on its own. An open key space on a model reply is
//      an unbounded channel from a vendor into a column this product stores
//      and exports.
//   2. FAIL CLOSED, AND THE FAILURE IS TOTAL. Every refusal throws, so the
//      caller writes NO generation — never a partial one. Mutation M7 ("the
//      parse accepts a partial document") reddens on the missing-section case.
//
// WHY THE SCHEMA IS PERMISSIVE AND THE MODE IS STRICT. A caption has no shot
// map and a hook set has no beats, so a single required-everything schema is
// impossible. Sections are therefore optional in the SCHEMA and required by the
// MODE SPEC (`modes.ts`), which `parseScriptOutput` is handed. Anything the
// mode does not permit is refused too: a model returning beats for a caption
// has misunderstood the job, and its other sections are suspect.
import { z } from "zod";
import { stripFence } from "@respin/llm";

import {
  SECTION_KEYS,
  UNIVERSAL_SECTIONS,
  modeSpec,
  type ModeId,
  type SectionKey,
} from "./modes";
import { type TextUnit } from "./text";

/** Refusals this module raises. All of them mean "no generation is written". */
export class ScriptOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptOutputError";
  }
}

/**
 * A non-blank line of creator-facing text.
 *
 * `.min(1)` alone is not enough: a whitespace-only `weakestPoint` would satisfy
 * it while naming no weakest point, and non-negotiable 6 says every output
 * names one. The regex is a LITERAL requiring at least one non-space character.
 */
const NON_BLANK = /\S/;
const line = () => z.string().min(1).regex(NON_BLANK, "must not be blank");

const thesisSection = z.strictObject({
  statement: line(),
  why: line(),
});

const frameworkSection = z.strictObject({
  name: line(),
  why: line(),
});

const hooksSection = z.array(
  z.strictObject({
    text: line(),
    /** REQ-C04: hook sets span DIFFERENT mechanics, never five of one. */
    mechanic: line(),
  })
);

const ideasSection = z.array(
  z.strictObject({
    hook: line(),
    thesis: line(),
    framework: line(),
  })
);

const beatsSection = z.array(
  z.strictObject({
    atSeconds: z.number().int().min(0),
    vo: line(),
    /** PRD §46: the timestamped VO script "with the turn marked". */
    isTurn: z.boolean(),
  })
);

const shotMapSection = z.array(
  z.strictObject({
    beatIndex: z.number().int().min(0),
    shot: line(),
    note: line(),
  })
);

const onScreenTextSection = z.array(
  z.strictObject({
    atSeconds: z.number().int().min(0),
    text: line(),
  })
);

const captionSection = z.strictObject({
  text: line(),
  hashtags: z.array(line()),
});

const whyThisPerformsSection = z.strictObject({
  reasoning: line(),
  /**
   * REQ-I04 / REQ-C02 / non-negotiable 6. Required at the schema level for
   * every mode, because a "why this performs" without its weakest point is the
   * exact claim this product is not allowed to make.
   */
  weakestPoint: line(),
});

const disclosureSection = z.strictObject({
  platform: line(),
  guidance: line(),
});

const scriptOutputSchema = z.strictObject({
  thesis: thesisSection.optional(),
  framework: frameworkSection.optional(),
  hooks: hooksSection.optional(),
  ideas: ideasSection.optional(),
  beats: beatsSection.optional(),
  shotMap: shotMapSection.optional(),
  onScreenText: onScreenTextSection.optional(),
  caption: captionSection.optional(),
  whyThisPerforms: whyThisPerformsSection.optional(),
  disclosure: disclosureSection.optional(),
});

type RawScriptOutput = z.infer<typeof scriptOutputSchema>;

/**
 * A parsed, mode-checked generation.
 *
 * The two universal sections are REQUIRED at the type level even though the
 * schema marks them optional, because `parseScriptOutput` is the only way to
 * obtain this type and it refuses a document without them. The schema is not
 * exported for the same reason: `scriptOutputSchema.parse` would hand back a
 * document with no weakest point, which is a shape this product may not hold.
 */
export type ScriptOutput = RawScriptOutput &
  Required<Pick<RawScriptOutput, "whyThisPerforms" | "disclosure">>;

export type Hook = NonNullable<ScriptOutput["hooks"]>[number];
export type Idea = NonNullable<ScriptOutput["ideas"]>[number];
export type Beat = NonNullable<ScriptOutput["beats"]>[number];

/**
 * THE TEXT POPULATION — every string in a `ScriptOutput` that the kill test and
 * the traceability scan read.
 *
 * A `Record<SectionKey, …>`, so adding a section to `SECTION_KEYS` without
 * teaching this map to yield its text is a COMPILE ERROR. That is deliberate
 * and it is the whole design: CLAUDE.md's 2026-08-29 lesson is a guard whose
 * population "was written as one path and narrowed silently the day a second
 * appeared", and the fix it names is to state the population as a list and make
 * adding to it cost something.
 *
 * `isHook` marks the fields tech-spec §3 step 3's 14-word cap is active on —
 * the hook texts, and an idea's hook, which is a hook by REQ-C01's own wording.
 */
const SECTION_TEXT: Record<SectionKey, (o: ScriptOutput) => TextUnit[]> = {
  thesis: (o) =>
    o.thesis
      ? [
          { field: "/thesis/statement", text: o.thesis.statement, isHook: false },
          { field: "/thesis/why", text: o.thesis.why, isHook: false },
        ]
      : [],
  framework: (o) =>
    o.framework
      ? [
          { field: "/framework/name", text: o.framework.name, isHook: false },
          { field: "/framework/why", text: o.framework.why, isHook: false },
        ]
      : [],
  hooks: (o) =>
    (o.hooks ?? []).flatMap((h, i) => [
      { field: `/hooks/${i}/text`, text: h.text, isHook: true },
      { field: `/hooks/${i}/mechanic`, text: h.mechanic, isHook: false },
    ]),
  ideas: (o) =>
    (o.ideas ?? []).flatMap((d, i) => [
      { field: `/ideas/${i}/hook`, text: d.hook, isHook: true },
      { field: `/ideas/${i}/thesis`, text: d.thesis, isHook: false },
      { field: `/ideas/${i}/framework`, text: d.framework, isHook: false },
    ]),
  beats: (o) =>
    (o.beats ?? []).map((b, i) => ({
      field: `/beats/${i}/vo`,
      text: b.vo,
      isHook: false,
    })),
  shotMap: (o) =>
    (o.shotMap ?? []).flatMap((s, i) => [
      { field: `/shotMap/${i}/shot`, text: s.shot, isHook: false },
      { field: `/shotMap/${i}/note`, text: s.note, isHook: false },
    ]),
  onScreenText: (o) =>
    (o.onScreenText ?? []).map((t, i) => ({
      field: `/onScreenText/${i}/text`,
      text: t.text,
      isHook: false,
    })),
  caption: (o) =>
    o.caption
      ? [
          { field: "/caption/text", text: o.caption.text, isHook: false },
          ...o.caption.hashtags.map((h, i) => ({
            field: `/caption/hashtags/${i}`,
            text: h,
            isHook: false,
          })),
        ]
      : [],
  whyThisPerforms: (o) => [
    {
      field: "/whyThisPerforms/reasoning",
      text: o.whyThisPerforms.reasoning,
      isHook: false,
    },
    {
      field: "/whyThisPerforms/weakestPoint",
      text: o.whyThisPerforms.weakestPoint,
      isHook: false,
    },
  ],
  disclosure: (o) => [
    { field: "/disclosure/platform", text: o.disclosure.platform, isHook: false },
    { field: "/disclosure/guidance", text: o.disclosure.guidance, isHook: false },
  ],
};

/**
 * What a section is called in a refusal.
 *
 * A `Record<SectionKey, …>` for the same reason `SECTION_TEXT` is one: a new
 * section with no label is a compile error rather than a refusal that names a
 * camelCase key at a creator. `whyThisPerforms`'s label says "including its
 * weakest point" so the one refusal that matters most reads as what it is.
 */
const SECTION_LABELS: Record<SectionKey, string> = {
  thesis: "a thesis",
  framework: "a framework",
  hooks: "hooks",
  ideas: "ideas",
  beats: "a timestamped script",
  shotMap: "a shot map",
  onScreenText: "an on-screen text plan",
  caption: "a caption",
  whyThisPerforms: "why this performs, including its weakest point",
  disclosure: "disclosure guidance",
};

export function sectionLabel(key: SectionKey): string {
  return SECTION_LABELS[key];
}

/** Every text unit of an output, in section order. */
export function outputTextUnits(output: ScriptOutput): TextUnit[] {
  return SECTION_KEYS.flatMap((key) => SECTION_TEXT[key](output));
}

/**
 * The output as readable lines, for the kill-test model call.
 *
 * A RENDERING, NOT THE RAW REPLY. Handing a scoring model the JSON document
 * asks it to read a data structure when the question is about the writing, and
 * it puts the key names into a prompt where a creator's criteria belong. This
 * walks the same `outputTextUnits` population, so a section the scans cannot
 * see is a section the creator's own rules cannot be applied to either — one
 * population, three readers.
 */
export function renderDraft(output: ScriptOutput): string {
  return outputTextUnits(output)
    .map((u) => `${u.field}: ${u.text}`)
    .join("\n");
}

/**
 * The universal sections, checked independently of any mode spec.
 *
 * A SECOND CONTROL ON PURPOSE. `modeSpec().required` already lists both for
 * every mode today, and a test asserts that. This function is what still fires
 * on the day someone writes a mode spec that forgets one — a drift no schema
 * and no per-mode list can catch, because both would agree with each other.
 * Exported so its false branch has a witness (CLAUDE.md 2026-08-26: a required
 * parameter with no default reads exactly like a guard and is not one until a
 * test drives its false branch).
 */
export function assertUniversalSections(
  document: Record<string, unknown>
): void {
  for (const key of UNIVERSAL_SECTIONS) {
    if (document[key] === undefined) {
      throw new ScriptOutputError(
        key === "whyThisPerforms"
          ? "the reply names no weakest point, and every output names its weakest point (REQ-I04)"
          : `the reply is missing '${key}', which every mode's output carries`
      );
    }
  }
}

/**
 * Parse a model reply into a `ScriptOutput` for a mode, or refuse.
 *
 * PURE: no database, no network, no clock. The whole point of this package is
 * that the document a creator would receive is assertable without a vendor
 * (tech-spec §1).
 */
export function parseScriptOutput(params: {
  text: string;
  mode: ModeId;
}): ScriptOutput {
  const spec = modeSpec(params.mode);

  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(params.text));
  } catch {
    throw new ScriptOutputError("the reply was not JSON");
  }

  const parsed = scriptOutputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ScriptOutputError(
      `the reply is not the shape a ${spec.label} output takes: ${
        first.path.length ? `/${first.path.join("/")} ` : ""
      }${first.message}`
    );
  }
  // THE PARSE OUTPUT, never the caller's object. `brain-content.ts` measured
  // that zod strips an unknown key from the output while leaving the input
  // untouched, so storing the input after a successful parse re-admits
  // everything the schema just removed.
  const data = parsed.data;

  const present = SECTION_KEYS.filter((k) => data[k] !== undefined);
  const missing = spec.required.filter((k) => !present.includes(k));
  if (missing.length > 0) {
    throw new ScriptOutputError(
      `a ${spec.label} output must carry ${missing.map(sectionLabel).join(", ")}, and the reply left ${missing.length === 1 ? "it" : "them"} out`
    );
  }
  const extra = present.filter((k) => !spec.permitted.includes(k));
  if (extra.length > 0) {
    throw new ScriptOutputError(
      `a ${spec.label} output does not carry ${extra.map(sectionLabel).join(", ")}; the reply produced a document for a different mode`
    );
  }
  assertUniversalSections(data as Record<string, unknown>);

  if (data.hooks) {
    const range = spec.hookCount;
    if (!range) {
      throw new ScriptOutputError(
        `the ${spec.label} mode permits hooks but declares no count, which is a spec defect rather than a model one`
      );
    }
    if (data.hooks.length < range.min || data.hooks.length > range.max) {
      throw new ScriptOutputError(
        `a hook set is ${range.min} to ${range.max} hooks and the reply gave ${data.hooks.length}`
      );
    }
    // REQ-C04: "hook sets deliberately span different mechanics; requested
    // variants must differ in creative thesis, not clip order or wording". A
    // repeated mechanic label is the one part of that this layer can decide.
    const mechanics = data.hooks.map((h) => h.mechanic.trim().toLowerCase());
    const duplicate = mechanics.find((m, i) => mechanics.indexOf(m) !== i);
    if (duplicate !== undefined) {
      throw new ScriptOutputError(
        `two hooks share the mechanic '${duplicate}'; a hook set spans different mechanics, never variants of one (REQ-C04)`
      );
    }
  }

  if (data.ideas) {
    const range = spec.ideaCount;
    if (!range) {
      throw new ScriptOutputError(
        `the ${spec.label} mode permits ideas but declares no count, which is a spec defect rather than a model one`
      );
    }
    if (data.ideas.length < range.min || data.ideas.length > range.max) {
      throw new ScriptOutputError(
        `an ideation batch is ${range.min} to ${range.max} ideas and the reply gave ${data.ideas.length}`
      );
    }
  }

  if (data.beats) {
    const turns = data.beats.filter((b) => b.isTurn).length;
    if (turns !== 1) {
      throw new ScriptOutputError(
        `the script marks ${turns} turns and a script has exactly one (PRD §46)`
      );
    }
  }

  if (data.shotMap) {
    const beats = data.beats?.length ?? 0;
    const stray = data.shotMap.find((s) => s.beatIndex >= beats);
    if (stray) {
      throw new ScriptOutputError(
        `the shot map points at beat ${stray.beatIndex} and the script has ${beats}`
      );
    }
  }

  return data as ScriptOutput;
}

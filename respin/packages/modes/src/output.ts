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
import { CHECK, stripFence } from "@respin/llm";

import {
  CONSTRAINT_LIST_MAX,
  CREATIVE_FORMS,
  FILMING_MINUTES_MAX,
  FILMING_MINUTES_MIN,
  FILMING_PEOPLE,
  FORM_CHOICES,
  PIVOT_KINDS,
  takesCreativeForm,
  type FormChoice,
} from "./creative";
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

// ----------------------------------------------------- OUTPUT CONTRACT v2
//
// R-148 point 2, for `ideation` and `ideaToScript` only. A SEPARATE SCHEMA, not
// optional keys on the v1 one, and that is the whole of "an output with no
// version is never interpreted as version 2": the v1 schema is strict, so a
// document carrying a premise, a filming plan or a form is REFUSED by the v1
// parse rather than read as half of something else.
//
// THE MODEL NEVER AUTHORS THE VERSION. The reply schema below has no
// `contractVersion` and no `requestedForm` key, and it is strict, so a reply
// that tries to state either is refused. `parseScriptOutput` stamps both from
// the server-side contract it is handed; `readStoredScriptOutput` is the one
// reader that accepts them, because by then they are this product's own bytes.

const formSchema = z.enum(CREATIVE_FORMS);

/**
 * The basis for any event or result a premise describes (R-148 point 4).
 *
 * `material` QUOTES the creator's own words for this generation or their brain,
 * and `mode-checks.ts` verifies the quote deterministically. `unconfirmed`
 * requires a `[check]` in the field it leaves open. `none` is an explanation's
 * or opinion's honest answer — there is no event to have a basis for — and is
 * refused for the two forms that describe one.
 */
const basisSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("material"), excerpt: line() }),
  z.strictObject({ kind: z.literal("unconfirmed") }),
  z.strictObject({ kind: z.literal("none") }),
]);

const premiseSchema = z.strictObject({
  /** What happens on screen, in order. */
  whatHappens: line(),
  /** Why a viewer would care. */
  interest: line(),
  /** What they are left with — for a demonstration, the result. */
  payoff: line(),
  basis: basisSchema,
});

/**
 * The minimal typed filming fields (R-148 point 2). Text where the creator's
 * situation is described, closed values where it is decided: who is on set is
 * one of two, and the time is whole minutes inside the same bound a declared
 * limit has.
 */
const filmingSchema = z.strictObject({
  location: line(),
  equipment: z.array(line()).max(CONSTRAINT_LIST_MAX),
  people: z.enum(FILMING_PEOPLE),
  minutes: z.number().int().min(FILMING_MINUTES_MIN).max(FILMING_MINUTES_MAX),
});

const provenanceSchema = z.enum(["offered", "custom"]);

/**
 * THE SERVER'S OWN DECISIONS ABOUT A V2 DRAFT, AS STRUCTURE (R-150 point 2).
 *
 * Which filming resources no declaration covers, and which shot-map lines name
 * kit nobody declared. These used to be written INTO the model's text as an
 * appended ` [check]` — the same token a model writes — and the traceability
 * scan then read the server's mark as the model's own and stopped flagging the
 * specific beside it (round-2 compliance gate, High: "the bakery on Elm
 * Street", "a camera rented for $400" passed clean). Now the model's words stay
 * exactly as written for every scanner, and the decision lives here, rendered
 * as `[check]` by the presenter.
 *
 * SERVER-OWNED: the reply schema has no key for it and is strict, so a reply
 * that states it is refused, exactly like `contractVersion`. Stamped by the
 * pipeline (`stampServerChecks`), required and validated by the stored reader.
 */
const serverChecksSchema = z.strictObject({
  /** One entry per filming plan, in document order: each idea's, or the script's (`at: ""`). */
  filming: z.array(
    z.strictObject({
      at: z.string(),
      location: z.boolean(),
      equipment: z.array(z.number().int().min(0)),
    })
  ),
  /**
   * Shot-map lines that name kit no declaration covers — PER FIELD, so kit
   * named only in a note marks the note (round-3 compliance gate, Low).
   */
  shotMap: z.array(
    z.strictObject({
      index: z.number().int().min(0),
      shot: z.boolean(),
      note: z.boolean(),
    })
  ),
});

export type ServerChecks = z.infer<typeof serverChecksSchema>;

/**
 * The filming plans a v2 document carries, in the ONE order the server's
 * checks are stamped and read in: each idea's (`/ideas/N`), then the script's
 * own (`""`). Shared by the stamp and the stored reader so the two cannot
 * disagree about which entry belongs to which plan.
 */
export function filmingSlots(
  output: Pick<RawScriptOutputV2, "ideas" | "filming">
): { at: string; equipmentCount: number }[] {
  return [
    ...(output.ideas ?? []).map((idea, i) => ({
      at: `/ideas/${i}`,
      equipmentCount: idea.filming.equipment.length,
    })),
    ...(output.filming ? [{ at: "", equipmentCount: output.filming.equipment.length }] : []),
  ];
}

const ideasSectionV2 = z.array(
  z.strictObject({
    hook: line(),
    thesis: line(),
    /** The RESOLVED form — the requested one, or what "Choose for me" chose. */
    form: formSchema,
    framework: line(),
    /** R-148 point 5: `custom` structure is labelled, never promoted. */
    frameworkProvenance: provenanceSchema,
    premise: premiseSchema,
    filming: filmingSchema,
  })
);

const frameworkSectionV2 = z.strictObject({
  name: line(),
  why: line(),
  provenance: provenanceSchema,
});

/**
 * v2 beats: `isTurn` keeps its meaning as THE PIVOT BEAT (exactly one), and
 * that beat — and only that beat — names its kind. Keeping `isTurn` rather than
 * replacing it means every reader that already finds "the beat that changes the
 * piece" keeps finding it; `pivot` is what says whether it is a turn or a
 * reveal, and `mode-checks.ts` refuses the wrong kind for the form.
 */
const beatsSectionV2 = z.array(
  z.strictObject({
    atSeconds: z.number().int().min(0),
    vo: line(),
    isTurn: z.boolean(),
    pivot: z.enum(PIVOT_KINDS).optional(),
  })
);

const scriptOutputReplySchemaV2 = z.strictObject({
  thesis: thesisSection.optional(),
  framework: frameworkSectionV2.optional(),
  hooks: hooksSection.optional(),
  ideas: ideasSectionV2.optional(),
  beats: beatsSectionV2.optional(),
  shotMap: shotMapSection.optional(),
  onScreenText: onScreenTextSection.optional(),
  caption: captionSection.optional(),
  whyThisPerforms: whyThisPerformsSection.optional(),
  disclosure: disclosureSection.optional(),
  // A SCRIPT's own form, premise and filming plan. A concept carries these on
  // each idea instead; which of the two a mode requires is decided in
  // `parseScriptOutput` from the mode spec.
  form: formSchema.optional(),
  premise: premiseSchema.optional(),
  filming: filmingSchema.optional(),
});

type RawScriptOutputV2 = z.infer<typeof scriptOutputReplySchemaV2>;

/**
 * Which contract a reply is parsed under — decided by the SERVER from the
 * request (`contractOf` in `assemble.ts`), never by the reply.
 */
export type OutputContract =
  | { version: 1 }
  | { version: 2; requestedForm: FormChoice };

export const LEGACY_CONTRACT: OutputContract = { version: 1 };

/**
 * A parsed, mode-checked generation.
 *
 * The two universal sections are REQUIRED at the type level even though the
 * schema marks them optional, because `parseScriptOutput` is the only way to
 * obtain this type and it refuses a document without them. The schema is not
 * exported for the same reason: `scriptOutputSchema.parse` would hand back a
 * document with no weakest point, which is a shape this product may not hold.
 *
 * A UNION ON `contractVersion` (R-148). The v1 member has no version — a stored
 * output with none IS v1 — and a reader that wants a premise has to narrow on
 * `contractVersion === 2` first, so "read a legacy document as v2" is a type
 * error before it is a runtime one.
 */
export type ScriptOutputV1 = RawScriptOutput &
  Required<Pick<RawScriptOutput, "whyThisPerforms" | "disclosure">> & {
    contractVersion?: undefined;
    requestedForm?: undefined;
  };

export type ScriptOutputV2 = RawScriptOutputV2 &
  Required<Pick<RawScriptOutputV2, "whyThisPerforms" | "disclosure">> & {
    contractVersion: 2;
    requestedForm: FormChoice;
    /**
     * The server's decisions (R-150 point 2). ABSENT only between the reply
     * parse and the pipeline's stamp; every stored v2 output carries it, and
     * the stored reader refuses one that does not.
     */
    serverChecks?: ServerChecks;
  };

export type ScriptOutput = ScriptOutputV1 | ScriptOutputV2;

export type Hook = NonNullable<ScriptOutput["hooks"]>[number];
export type Idea = NonNullable<ScriptOutput["ideas"]>[number];
export type Beat = NonNullable<ScriptOutput["beats"]>[number];
export type IdeaV2 = NonNullable<ScriptOutputV2["ideas"]>[number];
export type Premise = NonNullable<ScriptOutputV2["premise"]>;
export type Filming = NonNullable<ScriptOutputV2["filming"]>;

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
    o.contractVersion === 2
      ? // A v2 CONCEPT'S PREMISE AND FILMING PLAN ARE TEXT A CREATOR READS,
        // so they join this population under the idea's own pointer — the kill
        // test, the traceability scan, the claims scan and the creator-rule
        // scoring all read them, and none of them needs to know v2 exists.
        (o.ideas ?? []).flatMap((d, i) => [
          { field: `/ideas/${i}/hook`, text: d.hook, isHook: true },
          { field: `/ideas/${i}/thesis`, text: d.thesis, isHook: false },
          { field: `/ideas/${i}/framework`, text: d.framework, isHook: false },
          ...premiseUnits(`/ideas/${i}/premise`, d.premise),
          ...filmingUnits(`/ideas/${i}/filming`, d.filming),
        ])
      : (o.ideas ?? []).flatMap((d, i) => [
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

/** A premise's text, under the pointer it lives at. */
function premiseUnits(prefix: string, p: Premise): TextUnit[] {
  return [
    { field: `${prefix}/whatHappens`, text: p.whatHappens, isHook: false },
    { field: `${prefix}/interest`, text: p.interest, isHook: false },
    { field: `${prefix}/payoff`, text: p.payoff, isHook: false },
    // THE EXCERPT IS SCANNED TOO. It is supposed to be the creator's own words,
    // so it traces trivially when it is; when it is not, the traceability scan
    // and the basis check both see it — a quote is not exempt from the rules
    // because it is labelled a quote.
    ...(p.basis.kind === "material"
      ? [{ field: `${prefix}/basis/excerpt`, text: p.basis.excerpt, isHook: false }]
      : []),
  ];
}

/**
 * A filming plan's text. `people` and `minutes` are CLOSED VALUES, not prose,
 * and are deliberately not text units: a minute count read as text would be a
 * bare number the traceability scan reports against a figure the model was
 * asked to estimate.
 */
function filmingUnits(prefix: string, f: Filming): TextUnit[] {
  return [
    { field: `${prefix}/location`, text: f.location, isHook: false },
    ...f.equipment.map((e, i) => ({
      field: `${prefix}/equipment/${i}`,
      text: e,
      isHook: false,
    })),
  ];
}

/**
 * The v2 SCRIPT's top-level additions, as their own population.
 *
 * A `Record` over a LIST for the reason `SECTION_TEXT` is one: a v2 top-level
 * field added to the schema and not here is a field the scans never read, and
 * `output.test.ts` asserts every key in this list yields at least one unit on a
 * full v2 script. `form` is a closed value and carries no text.
 */
export const V2_SECTION_KEYS = ["premise", "filming"] as const;
export type V2SectionKey = (typeof V2_SECTION_KEYS)[number];

const V2_SECTION_TEXT: Record<V2SectionKey, (o: ScriptOutputV2) => TextUnit[]> = {
  premise: (o) => (o.premise ? premiseUnits("/premise", o.premise) : []),
  filming: (o) => (o.filming ? filmingUnits("/filming", o.filming) : []),
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

/**
 * Every text unit of an output, in section order — and, for a v2 script, its
 * premise and filming plan after them.
 */
export function outputTextUnits(output: ScriptOutput): TextUnit[] {
  const sections = SECTION_KEYS.flatMap((key) => SECTION_TEXT[key](output));
  if (output.contractVersion !== 2) return sections;
  return [
    ...sections,
    ...V2_SECTION_KEYS.flatMap((key) => V2_SECTION_TEXT[key](output)),
  ];
}

/** `outputTextPointers`' memo — the schemas are constants, so it is computed once. */
let textPointers: readonly string[] | null = null;

/**
 * THE TEXT POPULATION, DERIVED FROM THE SCHEMA (audit Phase 2, P2-R5).
 *
 * `SECTION_TEXT` makes a new SECTION a compile error, but its granularity is
 * the section: a new `line()` inside an existing one (a second string on a
 * beat, say) was a silent hole in every reader of `outputTextUnits` — the
 * kill test, the traceability scan, `evaluateSpinSimilarity` and
 * `renderDraft`. So the expected population is computed here from the two
 * schemas' string leaves, and `output.test.ts` asserts it EQUAL to the
 * pointers `outputTextUnits` yields on a full document of each contract —
 * two-way, so a missing reader and a dead pointer are both red.
 *
 * Pointers use `*` for an array index (`/hooks/*\/text`). Closed values —
 * enums, literals, numbers, booleans — are not text and are not leaves.
 *
 * DERIVED HERE, NOT BY EXPORTING THE SCHEMA: `scriptOutputSchema.parse` would
 * hand back a document with no weakest point (see `ScriptOutputV1`). The walk
 * reads the installed zod 4.4.3's own introspection — `schema.def.type`,
 * `.shape` on objects, `def.element` on arrays, `def.innerType` on
 * `optional()`/`nullable()`, `def.options` on unions — and a node it does not
 * know THROWS rather than contributing nothing, so a zod upgrade that renames
 * the API is a red test, never an empty set that trivially equals itself.
 */
export function outputTextPointers(): readonly string[] {
  if (textPointers === null) {
    const out = new Set<string>();
    stringLeaves(scriptOutputSchema, "", out);
    stringLeaves(scriptOutputReplySchemaV2, "", out);
    textPointers = [...out].sort();
  }
  return textPointers;
}


type IntrospectedNode = {
  def: {
    type: string;
    element?: IntrospectedNode;
    innerType?: IntrospectedNode;
    options?: readonly IntrospectedNode[];
  };
  shape?: Record<string, IntrospectedNode>;
};

function stringLeaves(schema: unknown, at: string, out: Set<string>): void {
  const node = schema as IntrospectedNode;
  switch (node.def.type) {
    case "string":
      out.add(at);
      return;
    case "object":
      for (const [key, child] of Object.entries(node.shape ?? {})) {
        stringLeaves(child, `${at}/${key}`, out);
      }
      return;
    case "array":
      stringLeaves(node.def.element, `${at}/*`, out);
      return;
    case "optional":
    case "nullable":
      stringLeaves(node.def.innerType, at, out);
      return;
    case "union":
      for (const option of node.def.options ?? []) stringLeaves(option, at, out);
      return;
    case "enum":
    case "literal":
    case "number":
    case "boolean":
      return;
    default:
      throw new ScriptOutputError(
        `outputTextPointers: unhandled schema node "${node.def.type}" at "${at || "/"}"`
      );
  }
}

/** Whether a concrete pointer (`/hooks/2/text`) is an instance of a pattern (`/hooks/*\/text`). */
export function pointerMatches(pattern: string, field: string): boolean {
  const want = pattern.split("/");
  const got = field.split("/");
  if (want.length !== got.length) return false;
  return want.every((seg, i) => (seg === "*" ? /^\d+$/.test(got[i]) : seg === got[i]));
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
  const checked = output.contractVersion === 2 ? serverCheckedFields(output) : null;
  return outputTextUnits(output)
    .map((u) => {
      // THE SERVER'S DECISIONS, RENDERED (R-150 point 2): a revision's model
      // and the scoring model see which resources the creator did not list.
      // The stored text itself is never changed, so every scanner still reads
      // the model's words unmarked.
      const marked =
        checked !== null && checked.has(u.field) && !u.text.includes(CHECK)
          ? `${u.text} ${CHECK}`
          : u.text;
      return `${u.field}: ${marked}`;
    })
    .join("\n");
}

/**
 * The text-unit pointers the server's checks mark, or `null` when the document
 * carries none (only between the reply parse and the pipeline's stamp). A
 * shot-map line marks exactly the field (`shot`, `note`) that names the kit.
 */
export function serverCheckedFields(output: ScriptOutputV2): ReadonlySet<string> | null {
  const checks = output.serverChecks;
  if (checks === undefined) return null;
  const out = new Set<string>();
  for (const entry of checks.filming) {
    if (entry.location) out.add(`${entry.at}/filming/location`);
    for (const i of entry.equipment) out.add(`${entry.at}/filming/equipment/${i}`);
  }
  for (const e of checks.shotMap) {
    if (e.shot) out.add(`/shotMap/${e.index}/shot`);
    if (e.note) out.add(`/shotMap/${e.index}/note`);
  }
  return out;
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
  /**
   * The SERVER's contract for this generation (`contractOf(context)`).
   *
   * ABSENT MEANS v1, and the direction of that default is the safe one rather
   * than the convenient one: a v2 reply handed to the v1 parse carries keys the
   * strict v1 schema refuses, so a caller that forgets to pass the contract
   * gets a REFUSAL (no generation, nothing debited), never a v2 document read
   * as v1 or a v1 document stamped as v2. `output.test.ts` drives that
   * refusal, and `generate.test.ts` drives the metering parse that depends on
   * the contract being passed.
   */
  contract?: OutputContract;
}): ScriptOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(params.text));
  } catch {
    throw new ScriptOutputError("the reply was not JSON");
  }
  return validateDocument(raw, params.mode, params.contract ?? LEGACY_CONTRACT);
}

/**
 * Read a STORED output back — the one reader that accepts the server's stamps.
 *
 * THE VERSION DECIDES THE READER, and its absence is an answer: a document with
 * no `contractVersion` key is a legacy v1 document and is read by the strict v1
 * schema, which refuses every v2 key — so an unversioned document carrying a
 * premise is REFUSED, never "read as v2". A version this build does not know is
 * refused too, rather than best-guessed.
 *
 * Used by every reader of a stored generation (`readCandidate`, the revision's
 * parent read in `generate.ts`), so "what a stored output is" has one
 * definition and it is this file's.
 */
export function readStoredScriptOutput(params: {
  value: unknown;
  mode: ModeId;
}): ScriptOutput {
  const { value, mode } = params;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ScriptOutputError("the stored output is not a document");
  }
  const record = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "contractVersion")) {
    return validateDocument(record, mode, LEGACY_CONTRACT);
  }
  const { contractVersion, requestedForm, serverChecks, ...rest } = record;
  if (contractVersion !== 2) {
    throw new ScriptOutputError(
      "the stored output names an output contract version this build does not read"
    );
  }
  if (
    typeof requestedForm !== "string" ||
    !(FORM_CHOICES as readonly string[]).includes(requestedForm)
  ) {
    throw new ScriptOutputError(
      "the stored version-2 output does not name the form that was requested"
    );
  }
  const document = validateDocument(rest, mode, {
    version: 2,
    requestedForm: requestedForm as FormChoice,
  }) as ScriptOutputV2;
  // THE SERVER'S CHECKS ARE REQUIRED AND MUST FIT THE DOCUMENT (R-150 point
  // 2): every stored v2 output was stamped by the pipeline, so a missing or
  // mis-shaped record is a document this build did not write — and an index
  // pointing past the list it marks would mark nothing.
  const checks = serverChecksSchema.safeParse(serverChecks);
  if (!checks.success) {
    throw new ScriptOutputError("the stored version-2 output carries no valid server checks");
  }
  const slots = filmingSlots(document);
  const fits =
    checks.data.filming.length === slots.length &&
    checks.data.filming.every(
      (entry, i) =>
        entry.at === slots[i].at &&
        entry.equipment.every((n) => n < slots[i].equipmentCount)
    ) &&
    checks.data.shotMap.every((e) => e.index < (document.shotMap?.length ?? 0)) &&
    new Set(checks.data.shotMap.map((e) => e.index)).size === checks.data.shotMap.length;
  if (!fits) {
    throw new ScriptOutputError("the stored server checks do not fit the document they mark");
  }
  return { ...document, serverChecks: checks.data };
}

/**
 * The shared half of both readers: schema, mode spec, counts, the one turn —
 * and, under v2, the creative structure — then the stamp.
 */
function validateDocument(
  raw: unknown,
  mode: ModeId,
  contract: OutputContract
): ScriptOutput {
  const spec = modeSpec(mode);
  if (contract.version === 2 && !takesCreativeForm(mode)) {
    // A SPEC DEFECT AT THE CALLER, refused rather than accommodated: R-148
    // keeps the other five modes on the legacy contract.
    throw new ScriptOutputError(
      `the ${spec.label} mode has no version-2 output contract`
    );
  }

  const parsed =
    contract.version === 2
      ? scriptOutputReplySchemaV2.safeParse(raw)
      : scriptOutputSchema.safeParse(raw);
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

  if (contract.version === 1) return data as ScriptOutputV1;

  // ---- v2's STRUCTURE (R-148 point 2). What the form IS, whether it matches
  // the request and whether the basis holds are the kill test's questions
  // (`mode-checks.ts`), because a wrong answer there earns the one rewrite;
  // what is decided here is only whether the document has the shape at all.
  const v2 = data as RawScriptOutputV2;
  const concepts = spec.permitted.includes("ideas");
  const script = spec.permitted.includes("beats");
  const topLevel = (["form", "premise", "filming"] as const).filter(
    (k) => v2[k] !== undefined
  );
  if (concepts && topLevel.length > 0) {
    throw new ScriptOutputError(
      `a ${spec.label} output carries its form, premise and filming plan on each idea, and the reply put ${topLevel.join(", ")} at the top`
    );
  }
  if (script) {
    const missingTop = (["form", "premise", "filming"] as const).filter(
      (k) => v2[k] === undefined
    );
    if (missingTop.length > 0) {
      throw new ScriptOutputError(
        `a ${spec.label} script names its form, premise and filming plan, and the reply left out ${missingTop.join(", ")}`
      );
    }
  }
  if (v2.beats) {
    // THE PIVOT BEAT, AND ONLY IT, NAMES ITS KIND. Exactly one `isTurn` is
    // already enforced above, so this cannot be satisfied by two pivots.
    const unnamed = v2.beats.find((b) => b.isTurn && b.pivot === undefined);
    if (unnamed) {
      throw new ScriptOutputError(
        "the pivot beat does not say whether it is the turn or the reveal"
      );
    }
    const stray = v2.beats.find((b) => !b.isTurn && b.pivot !== undefined);
    if (stray) {
      throw new ScriptOutputError(
        "a beat that is not the pivot names a pivot kind; a script has exactly one pivot"
      );
    }
  }
  const stamped: ScriptOutputV2 = {
    ...(v2 as ScriptOutputV2),
    // STAMPED BY THE SERVER, never read from the reply — the reply schema has
    // no key for either and is strict, so a reply that states them is refused.
    contractVersion: 2,
    requestedForm: contract.requestedForm,
  };
  return stamped;
}

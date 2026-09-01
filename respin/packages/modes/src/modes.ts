// The seven Studio modes and the sections each one's output carries
// (PRD REQ-C01, tech-spec §3 step 6, slice 6 R3).
//
// SEVEN MODES LAND HERE EVEN THOUGH SLICE 6 BUILDS ONE. The slice card's
// question 3 answers why: "retrofitting an output contract after six modes have
// shipped against a narrower one is the expensive version". Only `hooks` gets a
// prompt bundle and a pipeline in this slice — it is the Free tier's mode
// (PRD §4G) — but the CONTRACT is whole.
//
// WHAT A MODE SPEC IS FOR. `ScriptOutput` cannot make every section required:
// a caption has no shot map and a hook set has no beats. Making the schema
// permissive and the MODE strict is the same division `brain-content.ts` uses
// for its own optional claims — the schema declares what a document MAY carry,
// and the layer that knows the context decides what it MUST. Here that layer is
// `parseScriptOutput`, which is handed the mode.
//
// A MAP, NOT A CHAIN OF `if`s. The card's R18 makes the point for the tier
// gate and it holds here too: six more modes arrive in slice 7, and a mode that
// ships without a section spec is a mode whose output nothing checks.

export const MODE_IDS = [
  // 1. Footage-to-thesis — creator lists what today's clips can prove.
  "footageToThesis",
  // 2. Idea-to-script.
  "ideaToScript",
  // 3. Source-to-reel — rebuild an article/transcript through the creator's
  //    stakes, never summarising the source.
  "sourceToReel",
  // 4. Analyse-and-spin — autopsy a reference, then adapt. THE ONE MODE WITH A
  //    SIMILARITY GATE (tech-spec §3 step 4, non-negotiable 1); nothing in this
  //    package displays a spin, and slice 8 is where that gate is built.
  "analyseAndSpin",
  // 5. Hooks only — 3-5 hooks across different mechanics. Slice 6 builds this.
  "hooks",
  // 6. Caption.
  "caption",
  // 7. Ideation — ideas as hook + thesis + framework, never as topics.
  "ideation",
] as const;

export type ModeId = (typeof MODE_IDS)[number];

/**
 * Every section a `ScriptOutput` can carry (tech-spec §3 step 6).
 *
 * THIS LIST IS A POPULATION, and adding to it costs something on purpose:
 * `output.ts`'s `SECTION_TEXT` is a `Record<SectionKey, …>`, so a new key that
 * nobody taught to yield its text is a COMPILE ERROR rather than a section the
 * kill test and the traceability scan silently never read. CLAUDE.md's
 * 2026-08-29 lesson is exactly this failure: "a population written as one path
 * narrows silently the day a second path appears".
 */
export const SECTION_KEYS = [
  "thesis",
  "framework",
  "hooks",
  "ideas",
  "beats",
  "shotMap",
  "onScreenText",
  "caption",
  "whyThisPerforms",
  "disclosure",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * The sections EVERY mode must produce, whatever it is.
 *
 * `whyThisPerforms` carries the weakest point (REQ-I04, REQ-C02, non-negotiable
 * 6: "every output names its weakest point"), and `disclosure` carries the
 * platform-specific AI-assistance guidance tech-spec §3 step 6 names. Neither
 * is a per-mode nicety, so neither is left to a per-mode list to remember.
 */
export const UNIVERSAL_SECTIONS = ["whyThisPerforms", "disclosure"] as const;

/**
 * The `creditCosts` key a mode is priced from.
 *
 * COPIED FROM `packages/config/src/schema.ts`'s `creditCosts` object, verified
 * against that file when this was written. `@respin/modes` does not depend on
 * `@respin/config` — it is the pure half of the pipeline and takes no config
 * reads — so the agreement between these names and the stored document is
 * asserted by stage C, where the price lookup lives (card R13).
 */
export type CreditCostKey =
  | "hookSet"
  | "caption"
  | "ideationBatch"
  | "fullScript"
  | "spin";

export type ModeSpec = {
  id: ModeId;
  /** What a creator calls it. */
  label: string;
  creditCostKey: CreditCostKey;
  /** Sections the output MUST carry. A missing one is a parse refusal. */
  required: readonly SectionKey[];
  /** Sections the output MAY carry. Anything outside this is a refusal. */
  permitted: readonly SectionKey[];
  /** How many hooks, when the mode produces them (PRD REQ-C01: 3-5). */
  hookCount?: { min: number; max: number };
  /** How many ideas, when the mode produces them. */
  ideaCount?: { min: number; max: number };
  /**
   * Whether this mode's output goes through the SPIN similarity gate before
   * display (tech-spec §3 step 4, REQ-E04/I02, non-negotiable 1).
   *
   * DECLARED HERE AND ENFORCED NOWHERE IN THIS PACKAGE — deliberately, and
   * said out loud so nobody reads the flag as the gate. Slice 8 builds
   * `packages/trends` and the gate itself. What this flag buys today is that
   * the mode which needs it is named in the contract rather than remembered
   * later.
   */
  similarityGated: boolean;
};

/** The full-script section set, shared by the three script modes. */
const SCRIPT_SECTIONS = [
  "thesis",
  "framework",
  "hooks",
  "beats",
  "shotMap",
  "onScreenText",
  "caption",
  "whyThisPerforms",
  "disclosure",
] as const satisfies readonly SectionKey[];

const scriptMode = (
  id: ModeId,
  label: string,
  creditCostKey: CreditCostKey,
  similarityGated = false
): ModeSpec => ({
  id,
  label,
  creditCostKey,
  required: SCRIPT_SECTIONS,
  permitted: SCRIPT_SECTIONS,
  hookCount: { min: 3, max: 5 },
  similarityGated,
});

export const MODE_SPECS: Record<ModeId, ModeSpec> = {
  footageToThesis: scriptMode(
    "footageToThesis",
    "Footage to thesis",
    "fullScript"
  ),
  ideaToScript: scriptMode("ideaToScript", "Idea to script", "fullScript"),
  sourceToReel: scriptMode("sourceToReel", "Source to reel", "fullScript"),
  analyseAndSpin: scriptMode(
    "analyseAndSpin",
    "Analyse and spin",
    "spin",
    true
  ),
  hooks: {
    id: "hooks",
    label: "Hooks",
    creditCostKey: "hookSet",
    // The thesis and the framework are PERMITTED but not required: a hook set
    // is more useful when it says what the hooks are hooks FOR, and a model
    // that omits them has still done the job it was asked to do.
    required: ["hooks", "whyThisPerforms", "disclosure"],
    permitted: ["thesis", "framework", "hooks", "whyThisPerforms", "disclosure"],
    hookCount: { min: 3, max: 5 },
    similarityGated: false,
  },
  caption: {
    id: "caption",
    label: "Caption",
    creditCostKey: "caption",
    required: ["caption", "whyThisPerforms", "disclosure"],
    permitted: ["thesis", "caption", "whyThisPerforms", "disclosure"],
    similarityGated: false,
  },
  ideation: {
    id: "ideation",
    label: "Ideation",
    creditCostKey: "ideationBatch",
    // REQ-C01: ideas are delivered as hook + thesis + framework, NEVER as
    // topics — which is why `ideas` is its own section shape rather than a
    // list of strings.
    required: ["ideas", "whyThisPerforms", "disclosure"],
    permitted: ["ideas", "whyThisPerforms", "disclosure"],
    ideaCount: { min: 3, max: 5 },
    similarityGated: false,
  },
};

export class UnknownModeError extends Error {
  constructor(readonly mode: string) {
    super(`'${mode}' is not one of this product's modes`);
    this.name = "UnknownModeError";
  }
}

/**
 * The spec for a mode, refusing an unknown one.
 *
 * IT THROWS RATHER THAN RETURNING `undefined`, because every caller of this
 * function is about to decide what an output must contain, and a mode whose
 * spec is missing would make that decision vacuously true.
 */
export function modeSpec(mode: ModeId): ModeSpec {
  const spec = MODE_SPECS[mode];
  if (!spec) throw new UnknownModeError(String(mode));
  return spec;
}

/**
 * The modes that are built end to end today. Slice 7 adds the other six.
 *
 * IT HAS NO PRODUCT READER YET, and saying so is the point: its first one is
 * stage C's mode gate. It matters because PRD §4G gives the Free tier "Hooks,
 * Captions, Ideas" — three modes — while slice 6 builds ONE, so a tier-only
 * gate would offer a creator two modes with no pipeline behind them. The tier
 * map (card R18) decides what a plan includes; this decides what exists.
 */
export const IMPLEMENTED_MODES: readonly ModeId[] = ["hooks"];

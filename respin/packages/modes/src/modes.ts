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
 * The OUTPUT checks a mode runs after its draft is parsed (slice 7, R3/R4/R5,
 * R18).
 *
 * THEY ARE DATA ON THE MODE, NOT BRANCHES IN A SCANNER, because the card's R1
 * says a mode is "a data entry in the mode registry, not a branch". The
 * consequence is the one that matters: `mode-checks.ts` holds a
 * `Record<ModeCheckId, …>`, so a check id nothing implements is a compile
 * error, and `mode-checks.test.ts` derives each mode's expected list from the
 * SECTIONS it permits, so a mode that carries hooks and forgets `hook_spread`
 * is a red test rather than one mode quietly running REQ-C04 unenforced.
 *
 * WHAT THEY ARE NOT. Three of the five are stand-ins for properties of MEANING
 * (does it summarise, do the hooks differ in creative thesis, is the weakest
 * point real). `mode-checks.ts` records what each one is measured not to catch;
 * none of them is the requirement, and none is reported as if it were.
 */
export const MODE_CHECK_IDS = [
  /** REQ-C01 mode 3: source-to-reel rebuilds, never summarises. */
  "source_fidelity",
  /** REQ-C04: a hook set spans different mechanics, never five of one. */
  "hook_spread",
  /** REQ-C01 mode 7: ideas are hook + thesis + framework, never topics. */
  "ideas_not_topics",
  /** The named framework is one this profile was actually offered. */
  "framework_eligibility",
  /** REQ-I04: the weakest point names something. */
  "weakest_point",
] as const;

export type ModeCheckId = (typeof MODE_CHECK_IDS)[number];

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
  /**
   * The output checks this mode runs (slice 7, R1).
   *
   * REQUIRED, so a new mode states its list rather than inheriting silence:
   * `Record<ModeId, ModeSpec>` makes the field's absence a compile error, and
   * `[]` is then a decision somebody wrote down.
   */
  checks: readonly ModeCheckId[];
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

/** The checks every full-script mode runs: it carries hooks and a framework. */
const SCRIPT_CHECKS = [
  "hook_spread",
  "framework_eligibility",
  "weakest_point",
] as const satisfies readonly ModeCheckId[];

const scriptMode = (
  id: ModeId,
  label: string,
  creditCostKey: CreditCostKey,
  options: {
    similarityGated?: boolean;
    checks?: readonly ModeCheckId[];
  } = {}
): ModeSpec => ({
  id,
  label,
  creditCostKey,
  required: SCRIPT_SECTIONS,
  permitted: SCRIPT_SECTIONS,
  checks: options.checks ?? SCRIPT_CHECKS,
  hookCount: { min: 3, max: 5 },
  similarityGated: options.similarityGated ?? false,
});

export const MODE_SPECS: Record<ModeId, ModeSpec> = {
  footageToThesis: scriptMode(
    "footageToThesis",
    "Footage to thesis",
    "fullScript"
  ),
  ideaToScript: scriptMode("ideaToScript", "Idea to script", "fullScript"),
  sourceToReel: scriptMode("sourceToReel", "Source to reel", "fullScript", {
    // THE ONE MODE WHOSE INPUT IS SOMEBODY ELSE'S MATERIAL, so it is the one
    // mode that can be refused for repeating it (REQ-C01 mode 3, card R3).
    checks: ["source_fidelity", ...SCRIPT_CHECKS],
  }),
  analyseAndSpin: scriptMode("analyseAndSpin", "Analyse and spin", "spin", {
    similarityGated: true,
  }),
  hooks: {
    id: "hooks",
    label: "Hooks",
    creditCostKey: "hookSet",
    // The thesis and the framework are PERMITTED but not required: a hook set
    // is more useful when it says what the hooks are hooks FOR, and a model
    // that omits them has still done the job it was asked to do.
    required: ["hooks", "whyThisPerforms", "disclosure"],
    permitted: ["thesis", "framework", "hooks", "whyThisPerforms", "disclosure"],
    // `framework_eligibility` is here because the mode PERMITS a framework —
    // the check is about the sections a document may carry, not about the ones
    // it must.
    checks: ["hook_spread", "framework_eligibility", "weakest_point"],
    hookCount: { min: 3, max: 5 },
    similarityGated: false,
  },
  caption: {
    id: "caption",
    label: "Caption",
    creditCostKey: "caption",
    required: ["caption", "whyThisPerforms", "disclosure"],
    permitted: ["thesis", "caption", "whyThisPerforms", "disclosure"],
    // NO HOOKS AND NO FRAMEWORK IN A CAPTION, so this is the shortest list any
    // mode carries: the universal check and nothing else. Writing it out is
    // what the required field is for — a caption mode that silently ran no
    // checks would look exactly like this one and mean something different.
    checks: ["weakest_point"],
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
    // AN IDEA CARRIES A HOOK, so `hook_spread` applies here as surely as it
    // does to a hook set — three ideas that open the same way are one idea,
    // whatever the theses underneath say.
    checks: [
      "hook_spread",
      "ideas_not_topics",
      "framework_eligibility",
      "weakest_point",
    ],
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
 * The modes that are built end to end today.
 *
 * SIX OF SEVEN AFTER SLICE 7, and the one that is missing is missing for a
 * stated reason rather than for lack of time: `analyseAndSpin` is the only
 * `similarityGated` mode (tech-spec §3 step 4, non-negotiable 1), the gate
 * itself is slice 8's `packages/trends` work, and `output.test.ts` holds the
 * RELATION — a similarity-gated mode may not appear in this list while the gate
 * does not exist. Adding it here is therefore a deliberate act that turns a
 * test red, not an oversight that ships a spin ungated.
 *
 * THE TIER MAP DECIDES WHAT A PLAN INCLUDES; THIS DECIDES WHAT EXISTS. PRD §4G
 * gives Free "Hooks, Captions, Ideas" and all seven to Creator and above, so a
 * tier-only gate would offer a paying creator a mode with no pipeline behind
 * it. Its reader is `packages/credits/src/mode-access.ts`.
 */
export const IMPLEMENTED_MODES: readonly ModeId[] = [
  "footageToThesis",
  "ideaToScript",
  "sourceToReel",
  "analyseAndSpin",
  "hooks",
  "caption",
  "ideation",
];

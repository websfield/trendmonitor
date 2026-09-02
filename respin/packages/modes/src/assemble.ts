// Generation prompt assembly (slice 6 stage B, R2; tech-spec §3 step 1).
//
// PURE BY CONSTRUCTION: no database, no network, no clock. Everything here is a
// function from values to values, so the prompt this product sends for a
// generation is assertable without a vendor and without Postgres — the same
// property, for the same reason, as `packages/llm/src/assemble.ts`.
//
// WHY IT LIVES HERE AND NOT BESIDE THE VOICE ASSEMBLER. The slice card's file
// table put "generation prompt assembly" in `packages/llm/src/assemble.ts`.
// It is in `packages/modes` instead, and the reason is tech-spec §1's layout
// rule: "generation logic lives in packages/modes, callable from tests without
// HTTP". A generation prompt is written against `ScriptOutput` and a mode spec;
// putting it in the provider adapter would make `@respin/llm` — the package
// whose whole job is that nothing outside `anthropic.ts` names a vendor — know
// about seven Studio modes and a section contract.
//
// WHAT `@respin/llm` DID GIVE UP: `stripFence`, which is now exported and used
// by `output.ts`. R3 says the fail-closed parse contract is "copied, not
// reinvented", and the strongest reading of that is to share the fence
// tolerance rather than hand-copy a second stripper that drifts.
//
// WHY THIS FILE KNOWS NOTHING ABOUT BRAIN KINDS. `@respin/modes` does not
// depend on `@respin/db` and must not — so it cannot import
// `BRAIN_CONTENT_SCHEMAS`. It is handed the creator's brain already flattened
// into strings, exactly as `assembleVoicePrompt` is handed FIELDS rather than
// pointers: the caller is the layer that may name a kind.
import { CHECK, type AssembledPrompt } from "@respin/llm";

import { type HardRuleFinding, HOOK_MAX_WORDS } from "./hard-rules";
import {
  SECTION_KEYS,
  modeSpec,
  type ModeId,
  type SectionKey,
} from "./modes";
import { type TraceabilityCorpus } from "./traceability";

export class GenerationAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationAssemblyError";
  }
}

/** One framework from the shared library or the creator's private set. */
export type Framework = {
  name: string;
  summary: string;
};

/**
 * Everything one generation runs on (tech-spec §3 step 1).
 *
 * The three IP layers arrive as plain values: universal laws, the frameworks
 * this profile is eligible for, and the creator's own coherent brain — already
 * flattened into the sentences it asserts. Stage C is what reads the brain
 * documents and the framework library; this package is what turns values into
 * a prompt.
 */
export type GenerationContext = {
  universalLaws: readonly string[];
  frameworks: readonly Framework[];
  brain: {
    voice: readonly string[];
    strategy: readonly string[];
    killtest: readonly string[];
  };
  /** What the creator gave THIS generation. */
  input: string;
  /** The platform the output is for — it drives the disclosure section. */
  platform: string;
  /**
   * Specifics that are IN `input` and vouch for NOTHING (slice 7 gate).
   *
   * A revision's `input` is the creator's note AND the draft it revises, so
   * this product's own output is corpus material for the next scan. That draft
   * was gated, not vouched for: everything its own scan REPORTED — a flagged
   * bare number, a flagged name, any shape inside a flag-only section — is a
   * specific nothing ever traced. Those tokens belong here, and
   * `traceabilityCorpusFor` hands them to the scan as `unvouched`.
   *
   * FILLED BY THE CALLER THAT HOLDS THE PARENT (`generate.ts`), because only
   * that layer can read the parent's stored findings, and only that layer can
   * check the creator's own material does not carry the same token — deleting
   * one the creator typed would refuse an honest draft, which is the direction
   * R-68 already paid for.
   *
   * REQUIRED, AND `[]` IS A DECISION AN ORIGINAL HAS TO STATE (billing gate
   * round 2, 2026-09-01). This was `?: readonly string[]` with a `?? []` on the
   * read, and MEASURED: same parent, same revision, field omitted — `usable`,
   * `hardRules: []`, `traceability: []`. The whole `[check]` laundering came
   * straight back, silently, from a caller that forgot a key. One composition
   * site exists today and it passes the field on both branches, so nothing was
   * broken — but "nothing is broken today" is the state a default preserves
   * until the second caller arrives. A required parameter with no default is a
   * guard only once a test drives its false branch, so `assemble.test.ts`
   * drives BOTH: the compile refusal, and the runtime refusal when a caller
   * casts around it (CLAUDE.md, 2026-08-21 and 2026-08-29).
   */
  unvouchedSpecifics: readonly string[];
};

/**
 * THE TRACEABILITY CORPUS COMES FROM THE SAME VALUE THE PROMPT DID.
 *
 * R19 checks every specific against "the union of (the creator's active brain
 * content, the input they gave this generation)". Deriving that union from the
 * `GenerationContext` — rather than letting the caller assemble a second list —
 * is what stops the scan from being run against a corpus the model never saw.
 * The frameworks and the universal laws are deliberately NOT in it: they are
 * the product's material, not the creator's, and a specific traceable only to
 * a framework blurb is still a specific the creator never gave.
 *
 * THE PLATFORM IS IN IT, AND ITS ABSENCE WAS A DEFECT. The creator picks the
 * platform on the form, so it is as much "what they gave this generation" as
 * the input box is — and while it was missing, every generation flagged the
 * creator's own platform (`flag: proper_noun "TikTok"`) underneath a note
 * telling them everything had been "checked against your brain and against what
 * you gave this generation". The scan was contradicting the sentence beside it.
 */
export function traceabilityCorpusFor(
  context: GenerationContext
): TraceabilityCorpus {
  assertUnvouchedStated(context);
  return {
    brain: [
      ...context.brain.voice,
      ...context.brain.strategy,
      ...context.brain.killtest,
    ],
    input: [context.input, context.platform],
    // WHAT `input` DOES NOT VOUCH FOR (see `unvouchedSpecifics`). `[]` for an
    // original, because an original's input is entirely the creator's own —
    // and the caller says so rather than the absence of a key saying it.
    unvouched: context.unvouchedSpecifics,
  };
}

// -------------------------------------------------------------- the statics
//
// Everything below this line is CREATOR-INDEPENDENT. `bundle.ts` hashes exactly
// these strings into `prompt_bundle_version` (REQ-J02), which is why they are
// grouped and exported rather than inlined: a version derived from the whole
// assembled prompt would change per creator and diagnose nothing.

export const GENERATION_SYSTEM = [
  "You write short-form video material in a creator's own voice, from the material they give you.",
  "",
  "Rules you cannot break:",
  "- Write only what their material supports. Never invent a number, a date, a name, a place or a result.",
  `- When a specific would help but their material does not carry it, write "${CHECK}" in its place. That is expected and is better than guessing.`,
  `- A "${CHECK}" marker only covers the specific it sits NEXT TO. If two specifics are unsupported, mark both.`,
  "- Never claim reach, views, growth, or that anything is guaranteed. You have no evidence about how their posts perform.",
  "- Say what is weakest about the idea. Every output names its own weakest point.",
  "- Disclosure guidance tells them how to DISCLOSE, never how to avoid disclosing. Never suggest skipping, hiding or leaving out a label.",
  "- Reply with a single JSON object and nothing else. No prose, no code fence.",
].join("\n");

/**
 * The hard rules, restated for the model.
 *
 * A BRIEF, NOT A GATE, and the distinction is the whole of R5. Telling the
 * model about these rules makes a clean first draft more likely and costs
 * nothing; it decides nothing. `hard-rules.ts` decides, in code, afterwards,
 * because a hard integrity rule decided by a model is a rule that can be talked
 * out of firing.
 */
export const HARD_RULE_BRIEF = [
  "House rules, checked in code after you reply:",
  "- No three parallel fragments in a row.",
  '- No "not X, it\'s Y" constructions, and no negated sentence answered by the same subject ("That is not luck. That is reps.").',
  "- No claim about how a post will do, and nothing that suggests hiding the disclosure.",
  `- No specific that is not in the material above, unless you mark it "${CHECK}".`,
  `- No hook longer than ${HOOK_MAX_WORDS} words.`,
].join("\n");

export const REWRITE_INSTRUCTION = [
  "Your previous draft broke one or more house rules. They are listed below with what was found.",
  "",
  "Rewrite the whole output. Fix exactly what is listed and change nothing else you were happy with.",
  `Where a specific was flagged, either use one from the material above or write "${CHECK}" immediately beside that specific — do not delete the sentence and do not replace it with filler.`,
  `A "${CHECK}" elsewhere in the sentence does not cover it: the marker has to sit next to the specific it is about.`,
].join("\n");

/**
 * The framework block's own words — STATIC, so `bundle.ts` can hash them.
 *
 * WHY THEY ARE CONSTANTS NOW (billing gate round 2, 2026-09-01). They were
 * literals inside `contextBlock`, which is built per creator and is therefore
 * not hashed — so `FRAMEWORK_EVIDENCE_NOTE` could be rewritten, or deleted,
 * and every generation would keep booking its spend against an unchanged
 * `prompt_bundle_version`. REQ-J02's whole question is "what changed?", and a
 * rewritten instruction changes which drafts a creator gets.
 */
export const FRAMEWORK_BLOCK_HEADER =
  "Frameworks available — use one of these, by its own name:";

/**
 * WHAT THE EVIDENCE RUNG ON EACH ROW MEANS — said ONCE, above the list.
 *
 * `packages/credits` puts each framework's own rung on its row
 * (`promptFramework`); this is the sentence that stops the word being read as a
 * score. It states what the rung counts, states what it is not, and turns the
 * weak case into an instruction rather than a hint, because REQ-I03's weakest
 * point is a required section and "the shape I built this on has one recorded
 * example" is very often the true answer to it.
 *
 * IT NAMES NO RUNGS AND NO NUMBERS. The ladder is `@respin/db`'s
 * `deriveFrameworkConfidence` with a CHECK constraint behind it, and this
 * package cannot import it — so a list of rung names here would be a copy that
 * drifts silently the day the ladder gains one.
 */
export const FRAMEWORK_EVIDENCE_NOTE =
  "Each one states how much evidence is recorded behind it. That is a count of examples somebody recorded — not a prediction, and not a promise. If the framework you use has little evidence behind it, say so in the weakest point.";

/**
 * The per-row prefix the rung is written under.
 *
 * IT LIVES BESIDE THE SENTENCE THAT EXPLAINS IT, not in the package that
 * supplies the value: `FRAMEWORK_EVIDENCE_NOTE` says "each one states how much
 * evidence is recorded behind it", and a label written somewhere else is a
 * label that can stop matching that sentence. `packages/credits` imports it
 * (`promptFramework`) rather than writing its own.
 */
export const FRAMEWORK_EVIDENCE_LABEL = "Evidence recorded: ";

/**
 * The empty case, and it does NOT say "do not name a framework" — see
 * `contextBlock`.
 */
export const FRAMEWORK_BLOCK_EMPTY =
  "Frameworks available: none this time. Where the contract below asks for a framework, name the shape you are actually using, in plain words.";

/** What each section looks like in the reply, one line per section. */
const SECTION_CONTRACTS: Record<SectionKey, string> = {
  thesis: '"thesis": {"statement": string, "why": string}',
  framework: '"framework": {"name": string, "why": string}',
  hooks:
    '"hooks": [{"text": string, "mechanic": string}] — each hook uses a DIFFERENT mechanic, never variants of one',
  ideas: '"ideas": [{"hook": string, "thesis": string, "framework": string}]',
  beats:
    '"beats": [{"atSeconds": integer, "vo": string, "isTurn": boolean}] — exactly one beat has isTurn true',
  shotMap:
    '"shotMap": [{"beatIndex": integer, "shot": string, "note": string}] — beatIndex points at a beat above',
  onScreenText: '"onScreenText": [{"atSeconds": integer, "text": string}]',
  caption: '"caption": {"text": string, "hashtags": [string]}',
  whyThisPerforms:
    '"whyThisPerforms": {"reasoning": string, "weakestPoint": string} — weakestPoint says what is weakest about this idea',
  disclosure:
    '"disclosure": {"platform": string, "guidance": string} — how to disclose AI assistance on that platform',
};

/**
 * One mode's brief (PRD REQ-C01).
 *
 * A ONE-LINE TASK IS NOT A PROMPT TEMPLATE, and slice 6 shipped one line per
 * mode because only one mode had a pipeline. The three parts here are the ones
 * that turned out to differ per mode when the other six were built:
 *
 *   `task` — the job, in a sentence.
 *   `inputLabel` — WHAT THE CREATOR'S MATERIAL IS. It is a list of clips in one
 *     mode and somebody else's article in another, and a prompt that calls both
 *     "what they gave you for this one" is asking the model to guess which.
 *   `instructions` — what to do and, more importantly, WHAT NOT TO DO. Every
 *     mode has a default failure (source-to-reel summarises, ideation returns
 *     topics, a caption restates the hook), and naming it is the cheap half of
 *     avoiding it. The expensive half is the check on the output, which is
 *     `mode-checks.ts` — none of these lines decides anything.
 */
export type ModeBrief = {
  task: string;
  inputLabel: string;
  instructions: readonly string[];
};

/**
 * The task brief per mode (PRD REQ-C01).
 *
 * A `Record<ModeId, …>`, so a new mode cannot arrive without a brief — the same
 * map-not-a-chain-of-ifs discipline the tier gate uses.
 */
export const MODE_BRIEFS: Record<ModeId, ModeBrief> = {
  footageToThesis: {
    task: "The creator has listed what today's footage can prove. Build the one thesis that footage supports into a full script.",
    inputLabel: "What their footage can prove today:",
    instructions: [
      "Choose ONE thesis their clips can actually show. A thesis their footage cannot show is a thesis they cannot film today.",
      "Every beat maps to a shot they already named. Never write a beat that needs footage they do not have.",
      "If the footage supports a smaller claim than they were hoping for, write the smaller claim and say so in the weakest point.",
    ],
  },
  ideaToScript: {
    task: "Turn the creator's idea into a full script they can film.",
    inputLabel: "The idea:",
    instructions: [
      "Keep their idea. Sharpen it; never replace it with a nearby one you like better.",
      "The turn is the beat where the viewer's understanding changes. There is exactly one.",
      "Every shot is one a person filming alone can actually get.",
    ],
  },
  sourceToReel: {
    task: "Rebuild what the source knows through this creator's own stakes.",
    inputLabel: "The source they want to work from:",
    instructions: [
      "Never summarise the source. Take the insight, then put the source down: the output is this creator making an argument, not a report on somebody else's work.",
      "Never restate the source in its own order, never reuse its phrasing, and never open by describing it (\"in this article\", \"the authors argue\").",
      "Rebuild every insight through a stake this creator has: what it costs them, what they had to change, who it is for.",
      "If the insight does not touch anything in their brain, say so in the weakest point rather than reaching.",
    ],
  },
  analyseAndSpin: {
    task: "Adapt the mechanism behind the reference into the creator's own material.",
    inputLabel: "The reference they want to learn from:",
    instructions: [
      "Name the mechanism — WHY the reference works — and then leave the reference behind.",
      "Never reuse its wording, its structure, its examples or its specifics. The output has to stand up with the reference deleted.",
      "The material is this creator's own: their stakes, their footage, their audience.",
    ],
  },
  hooks: {
    task: "Write a set of hooks for what the creator is making.",
    inputLabel: "What the hooks are for:",
    instructions: [
      "Each hook is a DIFFERENT creative thesis, never a rewording of one. If two hooks would survive or die together, one of them is not a second hook.",
      "Name each hook's mechanic in your own words — what it does to the viewer.",
      "One claim per hook, and nothing that needs a second sentence to land.",
    ],
  },
  caption: {
    task: "Write the caption for this post.",
    inputLabel: "The post the caption is for:",
    instructions: [
      "The caption carries what the video cannot: the context, the ask, or the thing worth arguing with underneath.",
      "Never restate the hook as the caption. A viewer who has watched has already read it.",
      "Hashtags are ones this creator's own material supports. Never invent a community you cannot point to.",
    ],
  },
  ideation: {
    task: "Propose ideas. Every idea is a hook, a thesis and a framework — never a topic.",
    inputLabel: "What they want ideas about:",
    instructions: [
      "A topic is a subject (\"morning routines\"). An idea is a CLAIM somebody could disagree with, plus the hook that opens it and the framework that carries it.",
      "The thesis is a full sentence that asserts something. If it would fit on a folder tab, it is a topic and not a thesis.",
      // NOT "say none of them fits": every idea REQUIRES a framework, so an
      // instruction that offers the model a way out of naming one contradicts
      // the output contract in the same prompt, and the eligibility check would
      // then refuse whatever it wrote instead.
      "Use a framework from the list above by its own name. If one only half fits, use that one and say where it does not fit in the weakest point.",
      "Ideas differ from each other in what they CLAIM, never in how they are worded.",
    ],
  },
};

/**
 * The brief as the model reads it.
 *
 * STATIC PER MODE — no creator content — so `bundle.ts` hashes it and REQ-J02's
 * `prompt_bundle_version` moves when a mode's instructions change. A rewritten
 * instruction changes which drafts a creator gets as surely as a rewritten
 * system prompt does.
 */
export function modeBriefText(mode: ModeId): string {
  const brief = MODE_BRIEFS[mode];
  return [brief.task, ...brief.instructions.map((s) => "- " + s)].join("\n");
}

/**
 * The JSON contract for a mode: its required keys, then the ones it may add.
 *
 * STATIC PER MODE, so `bundle.ts` can hash it. It is derived from the mode spec
 * rather than written twice, which means widening a mode's sections
 * automatically moves its `prompt_bundle_version` — the property REQ-J02 wants
 * ("so quality regressions are diagnosable").
 */
export function outputContractFor(mode: ModeId): string {
  const spec = modeSpec(mode);
  const inOrder = (keys: readonly SectionKey[]) =>
    SECTION_KEYS.filter((k) => keys.includes(k));
  const required = inOrder(spec.required);
  const optional = inOrder(spec.permitted).filter(
    (k) => !required.includes(k)
  );
  const parts = [
    "Reply with one JSON object with exactly these keys:",
    ...required.map((k) => "  " + SECTION_CONTRACTS[k]),
  ];
  if (optional.length > 0) {
    parts.push(
      "You may also include:",
      ...optional.map((k) => "  " + SECTION_CONTRACTS[k])
    );
  }
  parts.push("Include no other key.");
  if (spec.hookCount) {
    parts.push(
      `Give between ${spec.hookCount.min} and ${spec.hookCount.max} hooks.`
    );
  }
  if (spec.ideaCount) {
    parts.push(
      `Give between ${spec.ideaCount.min} and ${spec.ideaCount.max} ideas.`
    );
  }
  return parts.join("\n");
}

// --------------------------------------------------------------- assembling

/**
 * The context, headed by what this MODE's input actually is.
 *
 * THE INPUT LABEL IS PER MODE (slice 7). "What they gave you for this one" was
 * true of every mode and useful to none: the same heading sat above a list of
 * today's clips, an idea, and somebody else's article, and the mode that must
 * never summarise its source was not told which of those it was reading.
 *
 * THE FRAMEWORK LINE IS CONDITIONAL, because an instruction to "use one of the
 * frameworks above" above an empty list is an instruction to invent one.
 *
 * THE EMPTY CASE IS STILL LIVE, AND THE REASON CHANGED (slice 7, stage C). It
 * used to be "`packages/credits` passes no frameworks today (R-29)" — true when
 * this was written, false now: `generate.ts` reads
 * `scope.accessors.eligibleFrameworks()` and passes them through
 * `frameworksForContext`. What reaches this branch today is a mode whose spec
 * does NOT declare the `framework_eligibility` check (`caption` is one, and
 * stage C offers frameworks only to the modes that declare it), a profile whose
 * eligible set is genuinely empty, and a server whose shared library has not
 * been seeded.
 */
function contextBlock(mode: ModeId, context: GenerationContext): string {
  const brain = [
    ...context.brain.voice.map((s) => "- voice: " + s),
    ...context.brain.strategy.map((s) => "- strategy: " + s),
    ...context.brain.killtest.map((s) => "- kill test: " + s),
  ];
  // THE EMPTY CASE DOES NOT SAY "do not name a framework", and the first draft
  // of this block did. Three modes REQUIRE a `framework` section, so that
  // instruction would contradict the output contract in the same prompt —
  // originally on every script generation the product ran, because
  // `packages/credits` then offered no frameworks at all, and today on any run
  // whose eligible set comes back empty (see the docblock above).
  const frameworks =
    context.frameworks.length > 0
      ? [
          FRAMEWORK_BLOCK_HEADER,
          FRAMEWORK_EVIDENCE_NOTE,
          ...context.frameworks.map((f) => `- ${f.name}: ${f.summary}`),
        ]
      : [FRAMEWORK_BLOCK_EMPTY];
  return [
    "Universal laws:",
    ...context.universalLaws.map((s) => "- " + s),
    "",
    ...frameworks,
    "",
    "This creator's brain:",
    ...brain,
    "",
    "Platform: " + context.platform,
    "",
    MODE_BRIEFS[mode].inputLabel,
    context.input,
  ].join("\n");
}

/**
 * THE UNVOUCHED LIST IS STATED, EVEN WHEN IT IS EMPTY.
 *
 * NO `?? []` ANYWHERE, and that absence is the fix (billing gate round 2). The
 * default this product used to carry read as "an original has nothing
 * unvouched" and ACTED as "a caller that forgot the key has nothing unvouched"
 * — which is a revision's `[check]` laundering, restored in silence by an
 * omission. MEASURED before the field was made required: same parent, same
 * revision, key dropped, `usable` / `hardRules: []` / `traceability: []`.
 *
 * TYPED SHUT IS NOT SHUT (CLAUDE.md, 2026-08-21), so this is a RUNTIME check on
 * a required field: a `as unknown as` cast reaches it, and it refuses instead
 * of assuming the safe-looking answer.
 *
 * CALLED FROM BOTH BOUNDARIES, one population rather than two: `assertUsable`,
 * so the refusal lands BEFORE the vendor call and no money is spent, and
 * `traceabilityCorpusFor`, which is the function that would otherwise do the
 * laundering and is reachable on its own (`kill-test.ts` calls it).
 *
 * THE ELEMENTS ARE CHECKED, NOT ONLY THE CONTAINER (spin-compliance gate,
 * 2026-09-02). `Array.isArray` alone accepted `[123]` through the same
 * `as unknown as` cast this guard exists for. MEASURED with the element check
 * removed: `traceabilityCorpusFor` returned normally, `runGeneration` CALLED
 * THE VENDOR, and the run then died at `traceability.ts:292` with
 * `TypeError: token.normalize is not a function` inside `normalise` — an
 * anonymous class `app/**` cannot `instanceof`, raised after the money was
 * spent, on the one path whose promise is that a cast is refused HERE, before
 * the vendor. The guard's own lesson is about casts, so it checks what a cast
 * can carry rather than only the box it arrives in.
 */
function assertUnvouchedStated(context: GenerationContext): void {
  const stated = context.unvouchedSpecifics;
  if (!Array.isArray(stated)) {
    throw new GenerationAssemblyError(
      "this generation named nothing as unvouched-for, not even an empty list — an original passes [] and a revision passes what its parent's own scan reported"
    );
  }
  if (stated.some((token) => typeof token !== "string")) {
    throw new GenerationAssemblyError(
      "this generation stated something other than text as unvouched-for — the list is the specifics a parent's own scan reported, and every one of them is a piece of text"
    );
  }
}

function assertUsable(context: GenerationContext): void {
  assertUnvouchedStated(context);
  if (context.input.trim().length === 0) {
    throw new GenerationAssemblyError(
      "there is nothing to generate from — this generation was given no input"
    );
  }
  if (context.platform.trim().length === 0) {
    throw new GenerationAssemblyError(
      "no platform was named, and the disclosure guidance is platform-specific"
    );
  }
  const brainSize =
    context.brain.voice.length +
    context.brain.strategy.length +
    context.brain.killtest.length;
  if (brainSize === 0) {
    // REFUSED BEFORE THE VENDOR CALL, the same shape as
    // `NotEnoughPostsError`: with no brain there is nothing for the output to
    // be in the creator's voice, and every specific in the reply would be
    // untraceable by construction.
    throw new GenerationAssemblyError(
      "this profile has no active brain content, so there is no voice to write in"
    );
  }
}

export function assembleGenerationPrompt(params: {
  mode: ModeId;
  context: GenerationContext;
}): AssembledPrompt {
  const { mode, context } = params;
  assertUsable(context);
  return {
    system: GENERATION_SYSTEM,
    prompt: [
      modeBriefText(mode),
      "",
      contextBlock(mode, context),
      "",
      HARD_RULE_BRIEF,
      "",
      outputContractFor(mode),
    ].join("\n"),
  };
}

/** How a finding is shown back to the model in the rewrite prompt. */
function findingLine(f: HardRuleFinding): string {
  return `- ${f.rule} (${f.shape}) at ${f.field}: ${f.excerpt}`;
}

/**
 * The prompt for THE ONE rewrite (R6).
 *
 * It takes the previous draft's raw reply verbatim, because asking a model to
 * fix a document it can no longer see is how a "rewrite" becomes a second
 * unrelated draft.
 */
export function assembleRewritePrompt(params: {
  mode: ModeId;
  context: GenerationContext;
  draft: string;
  findings: readonly HardRuleFinding[];
}): AssembledPrompt {
  const { mode, context, draft, findings } = params;
  assertUsable(context);
  if (findings.length === 0) {
    // A rewrite with nothing to fix is a second vendor call the creator pays
    // for and gains nothing from.
    throw new GenerationAssemblyError(
      "a rewrite was requested with no rule violation to fix"
    );
  }
  return {
    system: GENERATION_SYSTEM,
    prompt: [
      modeBriefText(mode),
      "",
      contextBlock(mode, context),
      "",
      "Your previous draft:",
      draft,
      "",
      REWRITE_INSTRUCTION,
      "",
      "What was found:",
      ...findings.map(findingLine),
      "",
      outputContractFor(mode),
    ].join("\n"),
  };
}

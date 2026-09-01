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
  return {
    brain: [
      ...context.brain.voice,
      ...context.brain.strategy,
      ...context.brain.killtest,
    ],
    input: [context.input, context.platform],
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
 * The one-line task brief per mode (PRD REQ-C01).
 *
 * A `Record<ModeId, …>`, so slice 7 cannot add a mode without writing its
 * brief — the same map-not-a-chain-of-ifs discipline the card's R18 asks of the
 * tier gate. Only `hooks` is wired end to end in slice 6; the other six exist
 * so the contract and the bundle hash are per-mode from the start.
 */
export const MODE_BRIEFS: Record<ModeId, string> = {
  footageToThesis:
    "The creator has listed what today's clips can prove. Build the thesis they chose into a full script.",
  ideaToScript: "Turn the creator's idea into a full script.",
  sourceToReel:
    "Rebuild the source's insights through the creator's own stakes. Never summarise the source.",
  analyseAndSpin:
    "Adapt the mechanism behind the reference into the creator's own material. Never reuse its wording, its structure or its specifics.",
  hooks:
    "Write a set of hooks. Each one uses a different mechanic — never five variants of one.",
  caption: "Write the caption.",
  ideation:
    "Propose ideas. Each idea is a hook, a thesis and a framework — never a topic.",
};

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

function contextBlock(context: GenerationContext): string {
  const brain = [
    ...context.brain.voice.map((s) => "- voice: " + s),
    ...context.brain.strategy.map((s) => "- strategy: " + s),
    ...context.brain.killtest.map((s) => "- kill test: " + s),
  ];
  return [
    "Universal laws:",
    ...context.universalLaws.map((s) => "- " + s),
    "",
    "Frameworks available:",
    ...context.frameworks.map((f) => `- ${f.name}: ${f.summary}`),
    "",
    "This creator's brain:",
    ...brain,
    "",
    "Platform: " + context.platform,
    "",
    "What they gave you for this one:",
    context.input,
  ].join("\n");
}

function assertUsable(context: GenerationContext): void {
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
      MODE_BRIEFS[mode],
      "",
      contextBlock(context),
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
      MODE_BRIEFS[mode],
      "",
      contextBlock(context),
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

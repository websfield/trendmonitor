// Phase 10a plan C2 (R-116): the ONE checked-in fictional fixture the public
// Sample Spin runs through.
//
// EVERYTHING HERE IS INVENTED. The creator, the place, the trade, the numbers
// and the reference reel do not exist; nothing is scraped, quoted or adapted
// from a real person or a real post. The reference is written as a
// mechanism-level autopsy of an imaginary reel, in the exact shape a real
// autopsy row carries, so the same producers validate it.
//
// TWO PROJECTIONS FROM ONE IMMUTABLE REFERENCE (R-97): the similarity gate
// receives `hook + subjectTerms + structure` and NOTHING else; the prompt
// receives `hookMechanic + beats + ending + followTrigger` and NOTHING else.
// Neither receives the display transcript below, and `assertReferenceMechanism`
// (inside `@respin/modes`' assembler) refuses a smuggled field by name.
//
// VALIDATED AT LOAD, not trusted: `loadSampleSpinFixture()` runs the
// `@respin/db` brain-content schemas over the three documents, the canonical
// autopsy parser over the reference, the mechanism-level scan over the prompt
// projection, the gate's own `assertTrustedReference` over the gate
// projection, and a structural scan proving no creator/profile/workspace or
// performance identifier is present. A fixture that fails any of them cannot
// be loaded, so it cannot reach a prompt.
import {
  CHECK,
  assertMechanismLevel,
  parseBrainContent,
  parseCanonicalAutopsyAnalysis,
  type CanonicalAutopsyAnalysis,
} from "@respin/db";
import {
  assertTrustedReference,
  usableCreatorRules,
  type CreatorRule,
  type GenerationContext,
  type SpinReference,
  type SpinReferenceMechanism,
} from "@respin/modes";
import { UNIVERSAL_LAWS, brainSentencesOf, creatorRulesOfContent } from "../generate";

/** Bumped whenever any fixture text changes; recorded on every evaluation run. */
export const SAMPLE_SPIN_FIXTURE_VERSION = "sample-fixture-v1";

/** The platform the sample output is written for. Static, never the visitor's. */
export const SAMPLE_SPIN_PLATFORM = "tiktok";

export const SAMPLE_SPIN_PROVENANCE = Object.freeze({
  fictional: true as const,
  rightsBasis: "product_seed" as const,
  authoredBy: "Respin product team",
  authoredOn: "2026-09-09",
  reviewedOn: "2026-09-09",
  /** The fixture is re-read against the mechanism-level rules and this note by then. */
  nextReviewOn: "2026-12-09",
  note:
    "The creator Tobin Vale, the town of Marrow Bay, every figure and the reference reel are invented for this demonstration. No real account, post, transcript or person was used or adapted.",
});

// --------------------------------------------------------------- the brain
//
// The three documents are written in the exact `brain-content.ts` shapes a
// creator's confirmed brain carries; `parseBrainContent` refuses anything
// else at load. Every claim is filled in — there is no `[check]` here, because
// a sample brain with unfilled positions would demonstrate a product that
// refuses rather than one that writes.

const VOICE = Object.freeze({
  register: "Plain workshop talk. Says the thing, then shows the thing. Dry, warm, never salesy.",
  sentenceRhythm: "Short declaratives with one longer sentence when the reason needs room. Pauses land on the tool, not the person.",
  signatureMoves: [
    "Opens on the mistake, not the fix: the chair that fell apart before the chair that held.",
    "Names the exact joint or grain the viewer can look for on their own furniture.",
    "Closes by pointing at the next thing to look for, never at the channel.",
  ],
  avoid: [
    "Words like game-changing, secret, hack or ultimate.",
    "Talking about the camera, the algorithm or the audience.",
    "Promising a result the wood has not shown yet.",
  ],
});

const STRATEGY = Object.freeze({
  audience: "People who own one wobbly chair they like too much to throw out and have never held a chisel.",
  positioning: "A chair restorer in Marrow Bay who shows the joint before the varnish, so a first repair is a repair and not a glue job.",
  pillars: [
    "Why old chairs fail at the joint and almost never in the seat.",
    "One tool, one job: what a hide-glue pot, a card scraper or a spokeshave actually does.",
    "Repairs that hold for another lifetime versus repairs that hold until winter.",
  ],
  goals: ["Every piece leaves the viewer able to name one thing to check on their own chair."],
  ambitions: ["A short run of repairs filmed start to finish, one joint each, with the failure shown first."],
  metric: {
    // The server-owned key the interview builder computes from the label
    // (`metricKeyFromLabel`); the schema requires it at parse and strips it.
    key: "saves-per-thousand-views",
    label: "Saves per thousand views",
    // Digit-free on purpose: the fixture's own identity scan refuses a
    // number beside "views", and the unit needs no number to be a unit.
    unit: "saves per one thousand views",
    direction: "higher_is_better",
    platform: SAMPLE_SPIN_PLATFORM,
    window: "first seven days after posting",
  },
});

const KILLTEST = Object.freeze({
  rules: [
    "The hook names something the viewer can look at on a real chair within the first sentence.",
    "The turn shows why the obvious fix fails before it shows the fix that holds.",
    "Every shot names a joint, a tool or a surface; none names a feeling about the work.",
    "The ending points at one thing to check next, never at following, liking or the channel.",
  ],
  bannedWords: ["game-changing", "hack", "secret", "ultimate", "life-changing"],
  bannedVibes: ["hype", "urgency", "talking to the algorithm"],
});

// ------------------------------------------------------------ the reference
//
// A mechanism-level autopsy of an IMAGINARY reel about re-seating a loose
// spindle, in the canonical analysis shape. The seven fields are the whole
// reference; the display transcript below is a separate, never-prompted
// rendering of the same imaginary reel for the visitor to read beside the Spin.

const REFERENCE: CanonicalAutopsyAnalysis = Object.freeze({
  hookMechanic: "Opens on a confident wrong fix the viewer has probably tried, then withholds the reason it fails until the turn.",
  beats: [
    "Shows the loose part being pushed back with the obvious quick fix and declares it done.",
    "Cuts to the same part failing again after ordinary use, with no commentary.",
    "Names the real cause as a fit problem rather than a strength problem.",
    "Shows the slower fix that restores the fit, narrated only by what the hands do.",
    "Ends on the repaired piece under load, still holding.",
  ],
  ending: "Closes on the repaired piece bearing weight in silence, letting the hold be the proof.",
  followTrigger: "Names one more common wrong fix and promises to show why it fails next.",
  subjectTerms: ["spindle", "wood glue", "chair leg", "wobble", "socket"],
  hook: "I glued this spindle back in three times and it fell out three times. Here is why glue was never the problem.",
  structure: { beatCount: 5, turnBeat: 2 },
});

/**
 * The sample creator's OWN frameworks — the only ones the demo offers. The
 * shared library is tenant material the demo never reads, and a draft that
 * names a framework it was not offered is refused by the hard rules, so the
 * fixture carries its own mechanism-level pair.
 */
export const SAMPLE_FRAMEWORKS = Object.freeze([
  Object.freeze({
    name: "failure first",
    summary: "Show the confident wrong fix and its failure before the fix that holds; the failure is the hook and the fit is the turn.",
  }),
  Object.freeze({
    name: "one joint, one job",
    summary: "One repair, one tool, one surface per piece; every shot names the thing on screen and nothing else is promised.",
  }),
]);

/** The visitor-facing rendering of the imaginary original. NEVER enters a prompt or the gate. */
export const SAMPLE_ORIGINAL = Object.freeze({
  title: "Synthetic reference reel: the spindle that would not stay glued",
  lines: [
    "I glued this spindle back in three times and it fell out three times. Here is why glue was never the problem.",
    "Push it in, clamp it, wait a day. Solid. Done.",
    "Two weeks later. Same spindle, same wobble.",
    "The socket is worn wider than the tenon. Glue fills a gap; it does not make a fit.",
    "Wrap the tenon, size it, dry-fit until it bites, then glue.",
    "Sit on it. Lean on it. It holds.",
    "Next time: why a screw through the joint makes it worse.",
  ],
});

export type SampleSpinFixture = Readonly<{
  version: string;
  provenance: typeof SAMPLE_SPIN_PROVENANCE;
  /** The three parsed documents, as `brain_docs.content` would hold them. */
  brain: Readonly<{ voice: unknown; strategy: unknown; killtest: unknown }>;
  /** The gate's projection: hook + subject terms + structure. Only `evaluateSpinSimilarity` reads it. */
  gate: SpinReference;
  /** The prompt's projection: the four mechanism fields. Only the assembler reads it. */
  mechanism: SpinReferenceMechanism;
  /** The creator's own kill criteria, ids stable within this fixture. */
  creatorRules: readonly CreatorRule[];
  /** Rule id → text, for the visitor's highlighted rules. */
  ruleText: ReadonlyMap<string, string>;
  original: typeof SAMPLE_ORIGINAL;
}>;

export class SampleSpinFixtureError extends Error {
  constructor(message: string) {
    super(`Sample Spin fixture refused: ${message}`);
    this.name = "SampleSpinFixtureError";
  }
}

/**
 * Keys and shapes that must be ABSENT from the whole fixture: a creator,
 * profile, workspace or user identity, an account handle, a link, or a
 * performance number. The scan runs over the serialised fixture, so a field
 * added later is scanned without anyone remembering to list it.
 */
const FORBIDDEN_KEYS = ["profileId", "workspaceId", "userId", "authUserId", "email", "handle", "url", "generationId", "resultId"];
const FORBIDDEN_SHAPES: ReadonlyArray<[string, RegExp]> = [
  ["uuid", /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ["url", /https?:\/\/|www\.|\.(?:com|net|org|io|app)\b/i],
  ["handle", /(?:^|[\s(])@[a-z0-9_.]{2,}/i],
  ["email", /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i],
  ["performance number", /\b\d[\d,.]*\s*(?:k\b|views?|followers?|likes?|saves?|shares?|%)/i],
];

function assertNoIdentity(value: unknown): void {
  const text = JSON.stringify(value);
  for (const key of FORBIDDEN_KEYS) {
    if (text.includes(`"${key}"`)) throw new SampleSpinFixtureError(`carries a forbidden identifier key: ${key}`);
  }
  for (const [label, shape] of FORBIDDEN_SHAPES) {
    if (shape.test(text)) throw new SampleSpinFixtureError(`carries a forbidden ${label} shape`);
  }
}

function assertNoPlaceholder(kind: string, content: unknown): void {
  if (JSON.stringify(content).includes(JSON.stringify(CHECK))) {
    throw new SampleSpinFixtureError(`${kind} carries an unfilled ${CHECK} position`);
  }
}

/**
 * THE SAMPLE KILL TEST MUST CARRY AT LEAST ONE USABLE RULE (audit P3-R8,
 * decisions R-157), checked AT LOAD so a process cannot serve the Sample Spin
 * with one that does not.
 *
 * WHY AT LOAD: `runGeneration` skips the scoring call when no rule is usable
 * (`usableCreatorRules` drops `[check]` and blank rules), so a run records ONE
 * call — and `system-spend.ts` throws on a `succeeded` `public_sample_spin`
 * with fewer than two calls, AFTER the vendor was billed, which the demo route
 * renders as a 503. The rules are static per process, so the fixture is the
 * only producer of "zero usable rules": refusing it here makes that
 * paid-then-503 shape unreachable, and the spend invariant stays as it is, as
 * the second fence. The `[check]` half was already refused by
 * `assertNoPlaceholder`; the BLANK half (a whitespace-only rule, which the
 * brain schema admits) and the empty list are refused here too.
 *
 * Exported from this file only — not through `sample-spin/index.ts` — so a
 * test can hand it a planted Kill Test.
 */
export function assertSampleSpinKillTestUsable(killtest: unknown): CreatorRule[] {
  assertNoPlaceholder("killtest", killtest);
  const creatorRules = creatorRulesOfContent(killtest);
  if (creatorRules.length === 0) {
    throw new SampleSpinFixtureError("the sample Kill Test carries no rules");
  }
  if (usableCreatorRules(creatorRules).length === 0) {
    throw new SampleSpinFixtureError("the sample Kill Test carries no usable rule");
  }
  return creatorRules;
}

let loaded: SampleSpinFixture | null = null;

/** Validate once, then serve the frozen result. A failure throws every time. */
export function loadSampleSpinFixture(): SampleSpinFixture {
  if (loaded) return loaded;
  const voice = parseBrainContent("voice", VOICE);
  const strategy = parseBrainContent("strategy", STRATEGY);
  const killtest = parseBrainContent("killtest", KILLTEST);
  for (const [kind, content] of [["voice", voice], ["strategy", strategy], ["killtest", killtest]] as const) {
    assertNoPlaceholder(kind, content);
  }
  const analysis = parseCanonicalAutopsyAnalysis(REFERENCE);
  if (!analysis) throw new SampleSpinFixtureError("the reference is not a canonical autopsy analysis");
  const mechanism: SpinReferenceMechanism = {
    hookMechanic: analysis.hookMechanic,
    beats: analysis.beats,
    ending: analysis.ending,
    followTrigger: analysis.followTrigger,
  };
  // THE MECHANISM-LEVEL SCAN, on the projection the prompt will carry, through
  // the one validator the shared library already enforces (REQ-D04): no
  // handle, link, metric or performance claim survives it.
  assertMechanismLevel({
    name: mechanism.hookMechanic,
    beats: [...mechanism.beats],
    whyItConverts: `${mechanism.ending} ${mechanism.followTrigger}`,
    applicability: [],
    sourceReferences: [],
    evidenceEntries: [],
    testedCaveats: [],
    saturation: "observed",
  });
  const gate: SpinReference = {
    subjectTerms: analysis.subjectTerms,
    hook: analysis.hook,
    structure: analysis.structure,
  };
  assertTrustedReference(gate);
  const creatorRules = assertSampleSpinKillTestUsable(killtest);
  const fixture: SampleSpinFixture = Object.freeze({
    version: SAMPLE_SPIN_FIXTURE_VERSION,
    provenance: SAMPLE_SPIN_PROVENANCE,
    brain: Object.freeze({ voice, strategy, killtest }),
    gate,
    mechanism,
    creatorRules,
    ruleText: new Map(creatorRules.map((rule) => [rule.id, rule.text])),
    original: SAMPLE_ORIGINAL,
  });
  assertNoIdentity(fixture);
  loaded = fixture;
  return fixture;
}

/**
 * The generation context for one visitor idea: the fixture brain, the
 * fixture's OWN two frameworks (`SAMPLE_FRAMEWORKS` — the shared library is
 * tenant material the demo never reads), the fixture's mechanism as the
 * reference, and the idea as `input`.
 *
 * `unvouchedSpecifics` is `[]` as a stated decision: a Sample Spin is always an
 * original, never a revision, so nothing in `input` was produced by this
 * product.
 */
export function sampleSpinContext(fixture: SampleSpinFixture, idea: string): GenerationContext {
  return {
    universalLaws: UNIVERSAL_LAWS,
    frameworks: [...SAMPLE_FRAMEWORKS],
    brain: {
      voice: brainSentencesOf("voice", fixture.brain.voice),
      strategy: brainSentencesOf("strategy", fixture.brain.strategy),
      killtest: brainSentencesOf("killtest", fixture.brain.killtest),
    },
    input: idea,
    platform: SAMPLE_SPIN_PLATFORM,
    unvouchedSpecifics: [],
    // The Sample Spin is `analyseAndSpin`, which keeps the legacy contract
    // (R-148): no creative form, stated rather than defaulted.
    creative: null,
    // Nor does it read any history (launch L3): a public demo has none.
    recentWork: null,
    reference: { mechanism: fixture.mechanism },
  };
}

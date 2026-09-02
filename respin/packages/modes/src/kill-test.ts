// The kill test (REQ-C03, tech-spec §3 step 3; slice 6 R5, R6, R7).
//
// THE SPLIT THIS FILE EXISTS TO ENFORCE (R5):
//
//   THE PRODUCT'S HARD RULES ARE DETERMINISTIC APPLICATION CODE.
//   ONLY THE CREATOR'S OWN RULES GO TO A MODEL.
//
// A hard integrity rule decided by a model is a rule that can be talked out of
// firing. `hard-rules.ts` and `traceability.ts` decide the four hard rules in
// code; the creator's `killtest.rules` — their own criteria, from their own
// brain document — are what the cheap second call scores, and a failed creator
// rule is REPORTED, never a reason to spend another vendor call.
//
// WHY A CREATOR-RULE FAILURE DOES NOT TRIGGER THE REWRITE. tech-spec §3 step 3
// says "hard-rule violations ... trigger one automatic rewrite", so the trigger
// is the hard rules by the letter of the spec. The reason behind the letter is
// the one worth recording: a rewrite is a second vendor call the creator pays
// for, so letting a model decide when one happens is letting a model spend the
// creator's money. The rewrite trigger stays as deterministic as the rules that
// cause it.
//
// EXACTLY ONE REWRITE, STRUCTURALLY (R6). `Attempt` is the closed union `1 | 2`
// and `decideAfterKillTest` refuses anything else at runtime as well as at the
// type level, so "silently retried until something passes" is not expressible.
// Mutation M2 ("the one-rewrite bound becomes a loop") reddens on
// `refuses a third attempt` below.
import { CHECK, stripFence } from "@respin/llm";
import { z } from "zod";

import {
  traceabilityCorpusFor,
  type GenerationContext,
} from "./assemble";
import {
  claimRemedyFor,
  scanOutputClaims,
  type ClaimFinding,
} from "./claims";
import {
  HARD_RULE_IDS,
  remedyFor,
  scanTextOnlyHardRules,
  type HardRuleFinding,
  type HardRuleId,
} from "./hard-rules";
import { scanModeChecks } from "./mode-checks";
import { type ModeId } from "./modes";
import { outputTextUnits, type ScriptOutput } from "./output";
import {
  scanTraceability,
  type TraceabilityCorpus,
  type TraceabilityFinding,
} from "./traceability";

/** How many times a draft may be produced for one generation. */
export const MAX_GENERATION_ATTEMPTS = 2;

/** Which draft this is. Closed, because R6's bound is exactly one rewrite. */
export type Attempt = 1 | 2;

export class KillTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KillTestError";
  }
}

/**
 * No creator rule the model can score.
 *
 * Separate from `KillTestError` because it is refused BEFORE the vendor is
 * called — the `NotEnoughPostsError` shape in `packages/llm/src/assemble.ts`.
 * It is not a failure: a creator who has not written kill criteria yet still
 * gets the four hard rules, which are the product's, not theirs.
 */
export class NoCreatorRulesError extends Error {
  constructor() {
    super(
      "this profile has no kill-test criteria of its own to score a draft against",
    );
    this.name = "NoCreatorRulesError";
  }
}

/** One of the creator's own kill criteria, from their `killtest` brain doc. */
export type CreatorRule = {
  /** Stable within this generation — the reply cites it. */
  id: string;
  /** The claim as the creator confirmed it, or `CHECK`. */
  text: string;
};

export type CreatorRuleVerdict = {
  ruleId: string;
  passed: boolean;
  /** The model's one-line reason. Advisory, and labelled as such on screen. */
  note: string;
};

/**
 * The rules a model may be asked about.
 *
 * `[check]` IS NOT A CRITERION. `brain-content.ts` makes every claim position a
 * union with the placeholder, so a `killtest.rules` entry can legitimately hold
 * `[check]` — a position the creator has not filled in. Scoring a draft against
 * "unknown" would produce a verdict about nothing and a note a creator cannot
 * act on.
 */
export function usableCreatorRules(
  rules: readonly CreatorRule[],
): CreatorRule[] {
  return rules.filter((r) => r.text !== CHECK && r.text.trim().length > 0);
}

// ------------------------------------------------- the creator-rule model call
//
// PURE HALVES ONLY. This module assembles the prompt and parses the reply; it
// never performs the call. Stage C supplies the callback, which is what keeps
// `@respin/modes` free of network access (R2).

export const KILL_TEST_SYSTEM = [
  "You score a draft against a creator's own criteria. Nothing else.",
  "",
  "Rules you cannot break:",
  "- Judge only the criteria you are given. Do not invent criteria and do not comment on style you were not asked about.",
  "- Never rewrite the draft, never suggest wording, and never say how it will perform.",
  "- Answer every criterion exactly once, by its id.",
  "- Reply with a single JSON object and nothing else. No prose, no code fence.",
  "",
  'The object has one key, `verdicts`: an array of `{ruleId, passed, note}`. `note` is one short sentence saying why.',
].join("\n");

const verdictSchema = z.strictObject({
  ruleId: z.string().min(1),
  passed: z.boolean(),
  note: z.string().min(1),
});

const killTestReplySchema = z.strictObject({
  verdicts: z.array(verdictSchema).min(1),
});

export function assembleKillTestPrompt(params: {
  draft: string;
  rules: readonly CreatorRule[];
}): { system: string; prompt: string } {
  const rules = usableCreatorRules(params.rules);
  if (rules.length === 0) throw new NoCreatorRulesError();
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) {
      throw new KillTestError(`rule '${r.id}' was supplied twice`);
    }
    seen.add(r.id);
  }
  return {
    system: KILL_TEST_SYSTEM,
    prompt: [
      "The creator's criteria:",
      ...rules.map((r) => `- ${r.id}: ${r.text}`),
      "",
      "The draft:",
      params.draft,
      "",
      "Answer every criterion by its id.",
    ].join("\n"),
  };
}

/**
 * Parse the scoring reply, or refuse.
 *
 * FAIL CLOSED, AND THE FAILURE IS TOTAL, the same contract `parseVoiceReply`
 * carries: a reply that cites a rule nobody asked about, answers one twice, or
 * leaves one out is refused whole. A partially-scored kill test rendered as
 * "everything passed except the ones we lost" is worse than no scoring at all.
 */
export function parseKillTestReply(params: {
  text: string;
  rules: readonly CreatorRule[];
}): CreatorRuleVerdict[] {
  const rules = usableCreatorRules(params.rules);
  if (rules.length === 0) throw new NoCreatorRulesError();

  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(params.text));
  } catch {
    throw new KillTestError("the kill-test reply was not JSON");
  }
  const parsed = killTestReplySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new KillTestError(
      `the kill-test reply is not the shape a scoring takes: ${
        first.path.length ? `/${first.path.join("/")} ` : ""
      }${first.message}`,
    );
  }

  const wanted = new Map(rules.map((r) => [r.id, r]));
  const byId = new Map<string, CreatorRuleVerdict>();
  for (const v of parsed.data.verdicts) {
    if (!wanted.has(v.ruleId)) {
      throw new KillTestError(
        `the reply scores '${v.ruleId}', which is not one of this creator's criteria`,
      );
    }
    if (byId.has(v.ruleId)) {
      throw new KillTestError(`the reply scores '${v.ruleId}' twice`);
    }
    byId.set(v.ruleId, { ruleId: v.ruleId, passed: v.passed, note: v.note });
  }
  const missing = rules.filter((r) => !byId.has(r.id));
  if (missing.length > 0) {
    throw new KillTestError(
      `the reply left ${missing.length} of ${rules.length} criteria unscored (${missing
        .map((r) => r.id)
        .join(", ")})`,
    );
  }
  // In the ORDER THEY WERE ASKED, not the reply's — the same reason
  // `parseVoiceReply` reorders: a model shuffling its answers must not shuffle
  // a creator's criteria on the screen that shows them.
  return rules.map((r) => byId.get(r.id)!);
}

// ------------------------------------------------------------ the hard gates

/** Everything one draft was found to violate. */
export type AttemptFindings = {
  /** The four hard rules. These, and only these, can force a rewrite. */
  hardRules: readonly HardRuleFinding[];
  /**
   * EVERY untraceable specific, hard-enforced or flag-only.
   *
   * Both kinds are here because the surface offers `[check]` on all of them
   * (R19); only the hard-enforced ones also appear in `hardRules`.
   */
  traceability: readonly TraceabilityFinding[];
  /**
   * EVERY performance, certainty or concealment claim in the model's own text,
   * hard-enforced or flag-only (REQ-I04, REQ-I05).
   *
   * The same shape as `traceability` and for the same reason: the surface shows
   * all of them, and only the hard-enforced ones also appear in `hardRules`.
   */
  claims: readonly ClaimFinding[];
};

/**
 * Turn hard-enforced traceability findings into `invented_specific` hard-rule
 * findings — the fourth rule of tech-spec §3 step 3.
 *
 * ONE DERIVATION, so "which rule fired" (R7) reads the same for all four rules
 * and the two lists cannot disagree about how many specifics were found.
 */
export function inventedSpecificFindings(
  findings: readonly TraceabilityFinding[],
): HardRuleFinding[] {
  return findings
    .filter((f) => f.enforcement === "hard")
    .map((f) => ({
      rule: "invented_specific" as const,
      shape: f.shape,
      field: f.field,
      excerpt: `'${f.token}' in: ${f.unit}`,
      remedy: remedyFor("invented_specific"),
    }));
}

/**
 * Turn hard-enforced claim findings into `forbidden_claim` hard-rule findings —
 * the fifth rule (REQ-I04, REQ-I05).
 *
 * THE SAME DERIVATION `inventedSpecificFindings` IS, deliberately: one place
 * where a scan with its own enforcement becomes a rule that can refuse, so "which
 * rule fired" (R7) reads the same for all five and the two lists cannot disagree
 * about how many claims were found. The remedy is the FAMILY's, because "this is
 * a forecast" and "this tells someone to hide the label" need different sentences.
 */
export function claimHardRuleFindings(
  findings: readonly ClaimFinding[],
): HardRuleFinding[] {
  return findings
    .filter((f) => f.enforcement === "hard")
    .map((f) => ({
      rule: "forbidden_claim" as const,
      shape: f.shape,
      field: f.field,
      excerpt: `'${f.token}' in: ${f.unit}`,
      remedy: claimRemedyFor(f.family),
    }));
}

/**
 * Run every hard gate over one parsed draft.
 *
 * PURE, AND IT TAKES NO CALLBACK. The absence of a model parameter here is R5's
 * determinism, expressed in the signature: there is nowhere for a vendor to
 * influence a hard-rule verdict, and `pipeline.test.ts` drives the behavioural
 * half — a scorer that passes everything cannot save a draft that violates a
 * hard rule.
 *
 * IT TAKES THE MODE AND THE WHOLE CONTEXT (slice 7), and both of those are
 * decisions rather than plumbing:
 *
 *   THE MODE, because slice 7's checks are per-mode data (`ModeSpec.checks`) —
 *   source-to-reel is the one mode that can be refused for repeating its
 *   source, and ideation is the one that can be refused for handing back
 *   topics. A gate that did not know the mode would have to guess, and a guess
 *   here is a fail-open.
 *
 *   THE CONTEXT RATHER THAN A PRE-BUILT CORPUS, because the corpus, the source
 *   text and the offered frameworks are then all DERIVED FROM THE VALUE THE
 *   PROMPT WAS BUILT FROM. A caller assembling a second corpus is the shape
 *   `traceabilityCorpusFor`'s own docblock warns about: "what stops the scan
 *   from being run against a corpus the model never saw".
 *
 * THE WHOLE GATE IS THIS ONE FUNCTION, which is what makes card R7 structural:
 * a revision re-runs `runKillTest` and therefore re-runs every rule, every
 * scan and every mode check. There is no path that re-runs some of them.
 */
export function runKillTest(params: {
  output: ScriptOutput;
  mode: ModeId;
  context: GenerationContext;
}): AttemptFindings {
  const units = outputTextUnits(params.output);
  const corpus: TraceabilityCorpus = traceabilityCorpusFor(params.context);
  const traceability = scanTraceability(units, corpus);
  const claims = scanOutputClaims(units);
  return {
    hardRules: [
      ...scanTextOnlyHardRules(units),
      ...inventedSpecificFindings(traceability),
      ...claimHardRuleFindings(claims),
      ...scanModeChecks({
        mode: params.mode,
        output: params.output,
        input: params.context.input,
        frameworks: params.context.frameworks,
      }),
    ],
    traceability,
    claims,
  };
}

export type KillTestDecision = "accept" | "rewrite" | "refuse";

/**
 * What happens after a draft has been gated (R6).
 *
 * THE ONE-REWRITE BOUND IS THIS FUNCTION, and it is a decision over an attempt
 * number rather than a loop condition. A caller cannot ask for a third draft:
 * `Attempt` does not admit `3`, and the runtime refusal below is what still
 * fires when someone casts around the type.
 */
export function decideAfterKillTest(params: {
  attempt: Attempt;
  findings: AttemptFindings;
}): KillTestDecision {
  const { attempt, findings } = params;
  if (attempt !== 1 && attempt !== 2) {
    throw new KillTestError(
      `attempt ${attempt} does not exist: a generation gets one draft and at most one rewrite (REQ-C03)`,
    );
  }
  if (findings.hardRules.length === 0) return "accept";
  return attempt === 1 ? "rewrite" : "refuse";
}

// ------------------------------------------------------------ honest refusal

/**
 * "Everything died, here is why, here is a sharper angle to try" (REQ-C03, R6).
 *
 * NEVER PADDED WITH FILLER: `why` holds exactly one line per DISTINCT rule that
 * fired — not one per finding — and `sharperAngle` is one sentence from a
 * static map. Nothing here is generated, so nothing here can invent a specific
 * or promise a result.
 */
export type HonestRefusal = {
  headline: string;
  why: string[];
  sharperAngle: string;
};

const SHARPER_ANGLES: Record<HardRuleId, string> = {
  fragment_triad:
    "Try saying the one thing you would say out loud to a friend, and cut whatever only sounds good written down.",
  antithesis:
    "Try opening on the thing you can point to, and let the contrast be something a viewer notices rather than something you announce.",
  invented_specific:
    "Try the angle your own material already supports — a smaller claim you can show beats a bigger one you cannot.",
  forbidden_claim:
    "Try naming what the idea asks a viewer to do, and leave what happens after they see it out of the draft — nothing here has any evidence about that yet.",
  hook_too_long:
    "Try the hook that is one clause long: what would make you stop, said in a breath.",
  summarised_source:
    "Try starting from the thing the source made you change about your own work, and leave the source off screen entirely.",
  collapsed_variants:
    "Try writing the one you would actually post, then write the one you would post if that first one turned out to be wrong.",
  idea_is_a_topic:
    "Try finishing the sentence 'most people think this, and what I filmed says that' — the subject on its own is not an idea.",
  framework_not_offered:
    "Try the framework on your list that comes closest, and say where it does not fit rather than reaching for one you were not given.",
  empty_weakest_point:
    "Try naming the person this would not work for. That is usually the weakest point, and it is worth saying out loud.",
};

export function honestRefusal(findings: AttemptFindings): HonestRefusal {
  if (findings.hardRules.length === 0) {
    throw new KillTestError(
      "an honest refusal was asked for with nothing to refuse — a refusal with no reason is indistinguishable from a bug",
    );
  }
  const counts = new Map<HardRuleId, HardRuleFinding[]>();
  for (const f of findings.hardRules) {
    const list = counts.get(f.rule) ?? [];
    list.push(f);
    counts.set(f.rule, list);
  }
  // Deterministic ordering: the declared rule order, never Map insertion or a
  // count tie broken by whichever finding happened to come first.
  const fired = HARD_RULE_IDS.filter((r) => counts.has(r));
  const dominant = [...fired].sort(
    (a, b) => (counts.get(b)?.length ?? 0) - (counts.get(a)?.length ?? 0),
  )[0];
  return {
    headline: "This one did not survive the kill test, so it is not being shown.",
    why: fired.map((rule) => {
      const hits = counts.get(rule)!;
      // PLACES ARE FIELDS, NOT FINDINGS. Counting findings said "2 places"
      // about ONE place whenever a rule fired twice in the same sentence —
      // which the fifth rule makes ordinary, since one concealment line can
      // carry two shapes ("skip the label" AND "nobody needs to know"). A
      // refusal a creator cannot inspect is indistinguishable from a bug, and
      // a refusal that misdescribes where it fired is worse: it sends them
      // looking for a second sentence that does not exist.
      const places = [...new Set(hits.map((h) => h.field))];
      const where = places.length === 1 ? places[0] : `${places.length} places`;
      return `${rule} at ${where}: ${hits[0].excerpt} — ${hits[0].remedy}`;
    }),
    sharperAngle: SHARPER_ANGLES[dominant],
  };
}

export type KillTestOutcome = "passed" | "passed_after_rewrite" | "failed";

/**
 * The kill test's stored result (R7).
 *
 * EVERYTHING A CREATOR MIGHT ASK IS IN HERE: which rule fired, where, whether
 * the rewrite happened, what their own criteria said, and the limit of what the
 * traceability check proves. "A refusal a creator cannot inspect is
 * indistinguishable from a bug" is the card's wording and this shape is the
 * answer to it.
 *
 * PLAIN JSON THROUGHOUT, because stage C persists it as one column.
 */
export type KillTestResult = {
  outcome: KillTestOutcome;
  attempts: Attempt;
  rewritten: boolean;
  /** REQ-J02: which prompt bundle produced the drafts this result judged. */
  promptBundleVersion: string;
  firstAttempt: AttemptFindings;
  /** The same object as `firstAttempt` when no rewrite happened. */
  finalAttempt: AttemptFindings;
  /**
   * Whether the creator's own rules were scored at all.
   *
   * SEPARATE FROM AN EMPTY VERDICT LIST, deliberately: "no criteria were
   * scored" and "every criterion passed" are different facts and a reader must
   * not be able to mistake one for the other.
   */
  creatorRulesScored: boolean;
  creatorRuleVerdicts: readonly CreatorRuleVerdict[];
  /** REQ-I03's stated limit, stored with the result that relied on it. */
  traceabilityLimitNote: string;
  /** Present exactly when `outcome === "failed"`. */
  refusal: HonestRefusal | null;
};


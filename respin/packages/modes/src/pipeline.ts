// The generation pipeline's PURE HALF (slice 6 stage B, R2/R6/R7).
//
// CALLABLE FROM TESTS WITHOUT HTTP — tech-spec §1's rule, and the reason this
// module takes CALLBACKS rather than a provider. `@respin/modes` has no
// dependency on `@respin/db`, opens no socket and reads no clock; the vendor
// call, the durable attempt claim, the `model_usage` rows and the debit all
// live in stage C's `packages/credits/src/generate.ts`, which supplies the
// callbacks. What lives here is the part that decides whether a draft is
// usable, and that part is assertable with a stub.
//
// THE ONE-REWRITE BOUND IS STRUCTURAL, NOT A LOOP CONDITION (R6). There are
// exactly two `await generate(...)` expressions in this file and no iteration
// construct anywhere near them, so "silently retried until something passes"
// would require adding a loop rather than changing a number. Mutation M2
// reddens on `pipeline.test.ts`'s call-count assertions.
import { type AssembledPrompt } from "@respin/llm";

import {
  assembleGenerationPrompt,
  assembleRewritePrompt,
  traceabilityCorpusFor,
  type GenerationContext,
} from "./assemble";
import { promptBundleVersion } from "./bundle";
import {
  assembleKillTestPrompt,
  decideAfterKillTest,
  honestRefusal,
  parseKillTestReply,
  runKillTest,
  usableCreatorRules,
  type AttemptFindings,
  type CreatorRule,
  type CreatorRuleVerdict,
  type HonestRefusal,
  type KillTestResult,
} from "./kill-test";
import { type ModeId } from "./modes";
import {
  parseScriptOutput,
  renderDraft,
  type ScriptOutput,
} from "./output";
import { TRACEABILITY_LIMIT_NOTE } from "./traceability";

/**
 * Produce one draft.
 *
 * `attempt` is passed through so the caller can meter and claim per call — it
 * is never used to decide anything here, because the decision is
 * `decideAfterKillTest`'s.
 */
export type GenerateFn = (
  prompt: AssembledPrompt,
  attempt: 1 | 2
) => Promise<string>;

/** Score the creator's own criteria. Returns the raw reply text. */
export type ScoreCreatorRulesFn = (prompt: AssembledPrompt) => Promise<string>;

export type GenerationRun =
  | {
      status: "usable";
      output: ScriptOutput;
      killTest: KillTestResult;
      promptBundleVersion: string;
      /** How many vendor generations this run cost. */
      drafts: 1 | 2;
    }
  | {
      status: "refused";
      /**
       * NO OUTPUT. A kill-test refusal shows the creator why it died and a
       * sharper angle (REQ-C03) — not the draft that died. tech-spec §3 step 6
       * is explicit that only a settled structured output is emitted.
       */
      refusal: HonestRefusal;
      killTest: KillTestResult;
      promptBundleVersion: string;
      drafts: 1 | 2;
    };

/**
 * Run one generation: assemble, generate, gate, at most one rewrite, settle.
 *
 * WHAT PROPAGATES RATHER THAN BEING SWALLOWED, and why each one:
 *
 *  - `ScriptOutputError` — an unparseable or mis-shaped reply. R3: no
 *    generation is written, not even a partial one. It is deliberately NOT a
 *    reason to rewrite: the slice card's question-4 table makes a parse failure
 *    OUR failure, so it must not consume the creator's one rewrite and must not
 *    reach the debit.
 *  - `GenerationAssemblyError` — refused before any vendor call.
 *  - Anything the callbacks throw. A scoring call that fails is a failure, and
 *    a pipeline that quietly reported "no criteria were scored" would hide it.
 */
export async function runGeneration(params: {
  mode: ModeId;
  context: GenerationContext;
  /** The creator's own kill criteria, as stored. May be empty. */
  creatorRules?: readonly CreatorRule[];
  generate: GenerateFn;
  /**
   * Absent when the caller does not want the cheap second call — a Free-tier
   * cost decision stage C may take. Absence is RECORDED on the result
   * (`creatorRulesScored: false`) rather than rendered as "everything passed".
   */
  scoreCreatorRules?: ScoreCreatorRulesFn;
}): Promise<GenerationRun> {
  const { mode, context, generate, scoreCreatorRules } = params;
  const creatorRules = params.creatorRules ?? [];
  const bundle = promptBundleVersion(mode);
  const corpus = traceabilityCorpusFor(context);

  // ---- Draft 1.
  const firstReply = await generate(
    assembleGenerationPrompt({ mode, context }),
    1
  );
  const firstOutput = parseScriptOutput({ text: firstReply, mode });
  const firstFindings = runKillTest({ output: firstOutput, corpus });

  if (decideAfterKillTest({ attempt: 1, findings: firstFindings }) === "accept") {
    return settle({
      output: firstOutput,
      first: firstFindings,
      final: firstFindings,
      attempts: 1,
      outcome: "passed",
      bundle,
      creatorRules,
      scoreCreatorRules,
    });
  }

  // ---- The ONE rewrite (R6). No loop, and no third call exists.
  const secondReply = await generate(
    assembleRewritePrompt({
      mode,
      context,
      draft: firstReply,
      findings: firstFindings.hardRules,
    }),
    2
  );
  const secondOutput = parseScriptOutput({ text: secondReply, mode });
  const secondFindings = runKillTest({ output: secondOutput, corpus });

  if (
    decideAfterKillTest({ attempt: 2, findings: secondFindings }) === "accept"
  ) {
    return settle({
      output: secondOutput,
      first: firstFindings,
      final: secondFindings,
      attempts: 2,
      outcome: "passed_after_rewrite",
      bundle,
      creatorRules,
      scoreCreatorRules,
    });
  }

  // ---- Everything died. Here is why, here is a sharper angle (REQ-C03).
  //
  // THE CREATOR'S RULES ARE NOT SCORED HERE, deliberately: a third vendor call
  // to tell someone their own criteria also failed on a draft they will never
  // see is money spent on nothing. `creatorRulesScored: false` says so.
  const refusal = honestRefusal(secondFindings);
  return {
    status: "refused",
    refusal,
    promptBundleVersion: bundle,
    drafts: 2,
    killTest: {
      outcome: "failed",
      attempts: 2,
      rewritten: true,
      promptBundleVersion: bundle,
      firstAttempt: firstFindings,
      finalAttempt: secondFindings,
      creatorRulesScored: false,
      creatorRuleVerdicts: [],
      traceabilityLimitNote: TRACEABILITY_LIMIT_NOTE,
      refusal,
    },
  };
}

async function settle(args: {
  output: ScriptOutput;
  first: AttemptFindings;
  final: AttemptFindings;
  attempts: 1 | 2;
  outcome: "passed" | "passed_after_rewrite";
  bundle: string;
  creatorRules: readonly CreatorRule[];
  scoreCreatorRules?: ScoreCreatorRulesFn;
}): Promise<GenerationRun> {
  let verdicts: readonly CreatorRuleVerdict[] = [];
  let scored = false;

  // SCORED ON THE ACCEPTED DRAFT ONLY, and only when there is something to
  // score. `usableCreatorRules` drops `[check]` positions: a criterion the
  // creator has not filled in is not a criterion, and asking a model about
  // "unknown" produces a verdict about nothing.
  const rules = usableCreatorRules(args.creatorRules);
  if (args.scoreCreatorRules && rules.length > 0) {
    const reply = await args.scoreCreatorRules(
      assembleKillTestPrompt({ draft: renderDraft(args.output), rules })
    );
    verdicts = parseKillTestReply({ text: reply, rules });
    scored = true;
  }

  return {
    status: "usable",
    output: args.output,
    promptBundleVersion: args.bundle,
    drafts: args.attempts,
    killTest: {
      outcome: args.outcome,
      attempts: args.attempts,
      rewritten: args.attempts === 2,
      promptBundleVersion: args.bundle,
      firstAttempt: args.first,
      finalAttempt: args.final,
      creatorRulesScored: scored,
      creatorRuleVerdicts: verdicts,
      traceabilityLimitNote: TRACEABILITY_LIMIT_NOTE,
      refusal: null,
    },
  };
}

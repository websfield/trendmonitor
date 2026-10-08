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
  contractOf,
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
import { stampServerChecks } from "./mode-checks";
import { modeSpec, type ModeId } from "./modes";
import {
  parseScriptOutput,
  renderDraft,
  type ScriptOutput,
} from "./output";
import { TRACEABILITY_LIMIT_NOTE } from "./traceability";
import {
  evaluateSpinSimilarity,
  SpinSimilarityError,
  assertTrustedReference,
  type SpinReference,
} from "./similarity";

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
  /**
   * Required for the one similarity-gated mode. It is the trusted, bounded
   * autopsy projection and the already-read stored config's requested
   * strictness — never generic input or a second config read.
   *
   * THE GATE'S OBJECT AND THE PROMPT'S OBJECT ARE DIFFERENT OBJECTS (R-97).
   * This one carries the autopsy's `hook`, `subjectTerms` and `structure` and
   * goes ONLY to `evaluateSpinSimilarity`; `context.reference.mechanism`
   * carries the four mechanism fields and goes ONLY to `assemble.ts`. Nothing
   * in this file copies between them, and `spin-reference.test.ts` captures
   * the assembled prompt to prove the gate's hook never appears in it.
   */
  spinSimilarity?: {
    reference: SpinReference;
    configuredStrictness: number;
  };
}): Promise<GenerationRun> {
  const { mode, context, generate, scoreCreatorRules } = params;
  const creatorRules = params.creatorRules ?? [];
  // ONE CONTRACT for the whole run (R-148), derived from the context the
  // prompt is built from: both drafts are parsed under it and the bundle
  // version names it, so a v2 run cannot book its spend against the v1 digest
  // or have one of its two drafts read under the other contract.
  const contract = contractOf(context);
  // The laws THIS context renders are part of the digest (audit Phase 8, P8-A4).
  const bundle = promptBundleVersion(mode, contract.version, context.universalLaws);
  if (modeSpec(mode).similarityGated && !params.spinSimilarity) {
    throw new SpinSimilarityError(
      "a similarity-gated mode requires its trusted structured reference",
    );
  }
  // THE REFERENCE IS CHECKED BEFORE ANY VENDOR CALL, not inside the gate that
  // runs after draft 1 (billing + compliance gates, 2026-09-04, converged).
  //
  // `assertTrustedReference` used to run only inside `evaluateSpinSimilarity`,
  // which is called on a PARSED draft — so a malformed reference was paid for
  // before it was refused, deterministically, on every attempt for that
  // reference. R-101 records that a real 63-word-hook autopsy hit exactly this,
  // and the bound designed to catch a paid-but-undebited attempt could not see
  // it: `meteredCall` had already written `consumedIncludedBuild: true`, and
  // `countUnchargedBillableAttempts` filters those out, so
  // `maxUnchargedBillableAttempts` never fired. An unbounded-rate paid-call
  // loop with no counter and no cap.
  //
  // The reference is available here, at entry, with nothing spent. This can
  // refuse nothing the gate would have accepted — it is the SAME assertion,
  // moved earlier — so it costs no behaviour and saves every vendor call.
  if (params.spinSimilarity) {
    assertTrustedReference(params.spinSimilarity.reference);
  }

  // ---- Draft 1.
  const firstReply = await generate(
    assembleGenerationPrompt({ mode, context }),
    1
  );
  const firstOutput = serverMarked(
    parseScriptOutput({ text: firstReply, mode, contract }),
    context
  );
  const firstFindings = withSpinSimilarity({
    output: firstOutput,
    findings: runKillTest({ output: firstOutput, mode, context }),
    mode,
    similarity: params.spinSimilarity,
  });

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
  const secondOutput = serverMarked(
    parseScriptOutput({ text: secondReply, mode, contract }),
    context
  );
  const secondFindings = withSpinSimilarity({
    output: secondOutput,
    findings: runKillTest({ output: secondOutput, mode, context }),
    mode,
    similarity: params.spinSimilarity,
  });

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

/**
 * THE SERVER'S DECISION ON UNDECLARED FILMING RESOURCES (R-148 point 3; R-150
 * point 2), stamped on each parsed v2 draft BEFORE the kill test as the
 * structural `serverChecks` field — the model's words are not changed, so every
 * scanner reads them as written, and the decision costs the creator no rewrite.
 * A legacy draft is returned untouched.
 */
function serverMarked(output: ScriptOutput, context: GenerationContext): ScriptOutput {
  if (output.contractVersion !== 2 || context.creative === null) return output;
  return stampServerChecks(output, context.creative.constraints);
}

/**
 * Add the Spin gate only after the parsed output has completed the ordinary
 * deterministic kill test, and before either acceptance branch can settle.
 */
function withSpinSimilarity(args: {
  output: ScriptOutput;
  findings: AttemptFindings;
  mode: ModeId;
  similarity:
    | { reference: SpinReference; configuredStrictness: number }
    | undefined;
}): AttemptFindings {
  if (!modeSpec(args.mode).similarityGated) return args.findings;
  if (!args.similarity) {
    throw new SpinSimilarityError(
      "a similarity-gated mode requires its trusted structured reference",
    );
  }
  const similarity = evaluateSpinSimilarity({
    output: args.output,
    reference: args.similarity.reference,
    configuredStrictness: args.similarity.configuredStrictness,
  });
  if (similarity.accepted) return args.findings;
  return {
    ...args.findings,
    hardRules: [
      ...args.findings.hardRules,
      ...similarity.failed.map((property) => ({
        rule: "similarity" as const,
        shape: property,
        // The hook finding names the unit that actually carried the copy —
        // a caption or a beat's VO as readily as a hook — because the gate
        // compares every displayed unit (compliance gate round 1, 2026-09-03),
        // and a finding that always said "/hooks" would send the rewrite to
        // the wrong field. The field is the ONLY place the location is
        // stated: `honestRefusal` already renders `rule at field`, so an
        // excerpt that repeated it read the field twice. The excerpt is a
        // static string — no candidate text crosses into the refusal.
        field:
          property === "subject"
            ? "/thesis/statement"
            : property === "hook"
              ? (similarity.hookMatchField ?? "/hooks")
              : "/beats",
        excerpt:
          property === "hook"
            ? "spin similarity gate: hook wording did not change"
            : `spin similarity gate: ${property} did not change`,
        remedy:
          "Change the subject, rewrite the hook in your own words, and alter at least one beat or turn.",
      })),
    ],
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

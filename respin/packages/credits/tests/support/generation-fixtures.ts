// Shared fixtures for slice 6's generation suites.
//
// WHY A `ScriptOutput` BUILDER RATHER THAN A JSON STRING PER TEST: the hooks
// mode's contract has three required sections and `parseScriptOutput` is
// fail-closed, so a hand-written literal per case drifts the moment the schema
// widens — and a test whose fixture no longer parses fails for a reason that
// has nothing to do with its subject. The builder is typed against
// `ScriptOutput`, so a schema change is a compile error here rather than a
// runtime surprise across six files.
//
// EVERY DEFAULT IS DELIBERATELY DIGIT-FREE. `traceability.ts` hard-enforces
// `number` and `date` shapes, so a stray "3" in a fixture hook would make the
// pipeline rewrite for a reason the test did not intend — the hook-length case
// below is the ONE fixture that trips a hard rule, and it trips exactly one.
import type { ScriptOutput, ScriptOutputV1 } from "@respin/modes";

export const PLATFORM = "tiktok";

/** A valid hooks document that passes every hard rule. */
export function hooksOutput(
  over: Partial<{ hookTexts: string[]; weakestPoint: string }> = {}
): ScriptOutputV1 {
  const texts = over.hookTexts ?? [
    "the part nobody tells you about starting out",
    "what changed when i stopped planning every shot",
    "why my first year looked like nothing was working",
  ];
  return {
    hooks: texts.map((text, i) => ({
      text,
      mechanic: ["omission", "reversal", "confession"][i % 3],
    })),
    whyThisPerforms: {
      reasoning:
        "each hook opens on a tension the viewer already feels and does not resolve it in the first line",
      weakestPoint:
        over.weakestPoint ??
        "none of these is grounded in a result you have logged, so this is a guess about attention and not a claim about reach",
    },
    disclosure: {
      platform: PLATFORM,
      guidance:
        "mark the post as made with the help of an assistant in the platform's own disclosure control",
    },
  };
}

/** The reply text a provider returns for a given document. */
export function reply(output: ScriptOutput): string {
  return JSON.stringify(output);
}

/**
 * A hooks document whose first hook is SIXTEEN words — M3's fourth planted
 * violation, and the one hard rule a fixture can trip without a digit.
 */
export function longHookOutput(): ScriptOutput {
  return hooksOutput({
    hookTexts: [
      "the one thing nobody ever tells you about starting out on your own with almost nothing at all",
      "what changed when i stopped planning every shot",
      "why my first year looked like nothing was working",
    ],
  });
}

/** The scoring reply for a set of creator rule pointers. */
export function killTestReply(ruleIds: readonly string[]): string {
  return JSON.stringify({
    verdicts: ruleIds.map((ruleId) => ({
      ruleId,
      passed: true,
      note: "it does not do the thing this criterion rules out",
    })),
  });
}

/**
 * R-173's three outcomes, planted in the one field every mode's document has
 * and the claim scan refuses on for every hard shape: `/whyThisPerforms/
 * reasoning`. CLAIM_ONLY trips `forbidden_claim` and nothing else; MIXED_CAUSE
 * adds an invented currency figure, which `traceability.ts` refuses as
 * `invented_specific` — a second, non-claim cause.
 */
export const CLAIM_ONLY_REASONING =
  "this draft is guaranteed to work for anyone who films it";
export const MIXED_CAUSE_REASONING =
  "this draft is guaranteed to work, and it made me $4,000 last month";

/** The same document with its reasoning replaced. */
export function withReasoning<T extends { whyThisPerforms: { reasoning: string; weakestPoint: string } }>(
  doc: T,
  reasoning: string
): T {
  return { ...doc, whyThisPerforms: { ...doc.whyThisPerforms, reasoning } };
}

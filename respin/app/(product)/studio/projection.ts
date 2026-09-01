// What the operation returned → what the screen renders.
//
// A DIRECTIVE-FREE MODULE, and it has to be: `./actions.ts` is `"use server"`,
// where a module may export ONLY async functions. That constraint is why this
// projection is not a private helper inside the action — and the constraint
// turns out to be the right shape anyway, because a projection is exactly the
// kind of decision `../onboarding/copy.ts`'s rule is about ("decisions live in
// pure functions, not in page bodies"): it is where a field goes missing, and a
// pure function is where a test can prove one did not.
//
// `@respin/modes` IS NOT IMPORTED (R-64). Every type this file needs is reached
// by INDEXED ACCESS off `GenerateResult`, which the facade does export. That is
// what `eslint.config.mjs`'s catch-all means when it says the types a screen
// needs travel on the facade: not that `ScriptOutput` is re-exported by name,
// but that nothing in `app/**` has to name it to render one.
import type { GenerateResult } from "@respin/credits/app-server";

import type {
  ClaimFlag,
  KillTestSummary,
  StudioRunState,
  TraceabilityFlag,
} from "./run-state";

type GenerationRunValue = NonNullable<GenerateResult["run"]>;
type UsableRun = Extract<GenerationRunValue, { status: "usable" }>;

/** Project the kill test onto the plain shape the screen renders (R7, R19). */
export function summariseKillTest(
  killTest: GenerationRunValue["killTest"]
): KillTestSummary {
  return {
    outcome: killTest.outcome,
    attempts: killTest.attempts,
    rewritten: killTest.rewritten,
    creatorRulesScored: killTest.creatorRulesScored,
    verdicts: killTest.creatorRuleVerdicts.map((v) => ({
      ruleId: v.ruleId,
      passed: v.passed,
      note: v.note,
    })),
    // CARRIED, NOT COPIED. `traceabilityLimitNote` is REQ-I03's stated limit as
    // `@respin/modes` words it, stored on the generation that relied on it; the
    // screen renders this value and holds no sentence of its own, so a change
    // to the scan cannot leave a stale description of it on a creator's page.
    limitNote: killTest.traceabilityLimitNote,
    // THE FINAL ATTEMPT'S findings, not the first. The draft the creator is
    // reading is the final one; a flag from a draft that was rewritten away
    // would point at text that is not on the screen.
    traceability: killTest.finalAttempt.traceability.map(
      (f): TraceabilityFlag => ({
        kind: f.kind,
        enforcement: f.enforcement,
        token: f.token,
        field: f.field,
        unit: f.unit,
      })
    ),
    // REQ-I04/REQ-I05's claim findings, from the SAME attempt as the
    // traceability ones and for the same reason. They were stored here and
    // projected nowhere, so a concealment sentence in the disclosure guidance
    // was detected, written to `generations.kill_test`, and never shown to the
    // person it was written for. This is the line that makes the fifth
    // deterministic rule reachable at flag level.
    claims: killTest.finalAttempt.claims.map(
      (c): ClaimFlag => ({
        family: c.family,
        enforcement: c.enforcement,
        token: c.token,
        field: c.field,
        unit: c.unit,
      })
    ),
  };
}

function usableState(result: GenerateResult, run: UsableRun): StudioRunState {
  return {
    status: "usable",
    generationId: result.generation.id,
    // `?? []` IS NOT A DEFAULT THAT HIDES ANYTHING: `parseScriptOutput` refuses
    // a `hooks` output carrying no hooks (the mode spec requires the section and
    // pins its count), so an empty list here is unreachable rather than
    // tolerated. The coalesce exists because the SCHEMA marks every section
    // optional — one contract serving seven modes — and TypeScript is right to
    // make the screen say what it does with an absent one.
    hooks: (run.output.hooks ?? []).map((h) => ({
      text: h.text,
      mechanic: h.mechanic,
    })),
    whyThisPerforms: {
      reasoning: run.output.whyThisPerforms.reasoning,
      weakestPoint: run.output.whyThisPerforms.weakestPoint,
    },
    disclosure: {
      platform: run.output.disclosure.platform,
      guidance: run.output.disclosure.guidance,
    },
    killTest: summariseKillTest(run.killTest),
    charge: {
      creditsChargedNow: result.creditsChargedNow,
      balanceAfter: result.balanceAfter,
    },
  };
}

export function studioStateFor(result: GenerateResult): StudioRunState {
  // A REPLAY IS ITS OWN STATE (R14c). `run === null` and `replayed` are the same
  // fact from two directions and BOTH are checked: `run` is what the renderer
  // needs and `replayed` is what the creator is being told, and a future shape
  // where the two disagree must not render a stored draft as a fresh one that
  // was just paid for.
  if (result.replayed || result.run === null) {
    return {
      status: "replayed",
      generationId: result.generation.id,
      outcome: result.generation.outcome,
      weakestPoint: result.generation.weakestPoint,
      refusalReason: result.generation.refusalReason,
      balanceAfter: result.balanceAfter,
    };
  }
  const run = result.run;
  if (run.status === "refused") {
    return {
      status: "honest_refusal",
      generationId: result.generation.id,
      headline: run.refusal.headline,
      why: [...run.refusal.why],
      sharperAngle: run.refusal.sharperAngle,
      killTest: summariseKillTest(run.killTest),
      charge: {
        creditsChargedNow: result.creditsChargedNow,
        balanceAfter: result.balanceAfter,
      },
    };
  }
  return usableState(result, run);
}

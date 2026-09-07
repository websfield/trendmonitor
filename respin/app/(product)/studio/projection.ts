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
//
// SLICE 7 WIDENED IT FROM ONE MODE TO SIX, and the widening is where a section
// goes missing: `projectDocument` is a `Record`-shaped, section-by-section copy
// with `undefined` preserved, so "this mode does not produce beats" and "the
// projection dropped the beats" are different values rather than the same
// empty render. `tests/studio-ui.test.tsx` drives every section through it.
import type { GenerateResult } from "@respin/credits/app-server";

import type {
  ClaimFlag,
  KillTestSummary,
  LineageEntry,
  PrivateFrameworksNotUsed,
  ScriptDocument,
  StudioActionState,
  StudioRunState,
  TraceabilityFlag,
} from "./run-state";

type GenerationRunValue = NonNullable<GenerateResult["run"]>;
type UsableRun = Extract<GenerationRunValue, { status: "usable" }>;
type OutputValue = UsableRun["output"];

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

/**
 * The whole document, section by section (slice 7, R1/R18).
 *
 * EVERY OPTIONAL SECTION IS COPIED WITH ITS ABSENCE INTACT — `?? undefined` is
 * never written here, and neither is `?? []`. Slice 6's projection coalesced
 * `hooks` to `[]` because the screen rendered one mode and an empty list was
 * unreachable; across six modes that coalesce would turn "this mode has no
 * shot map" into "the shot map came back empty", which is a different claim
 * about the model's answer, and it would hide a projection that dropped a
 * section the mode DOES require.
 *
 * THE TWO UNIVERSAL SECTIONS ARE NOT OPTIONAL and are not defaulted:
 * `ScriptOutput` requires both by construction (`parseScriptOutput` is the only
 * way to obtain one and it refuses a document without them), so a `??` here
 * would be a default for a case the parse has already made unreachable — and
 * would silently supply a blank weakest point, which is the one thing
 * non-negotiable 6 forbids this screen from doing.
 */
export function projectDocument(output: OutputValue): ScriptDocument {
  return {
    thesis: output.thesis
      ? { statement: output.thesis.statement, why: output.thesis.why }
      : undefined,
    framework: output.framework
      ? { name: output.framework.name, why: output.framework.why }
      : undefined,
    hooks: output.hooks?.map((h) => ({ text: h.text, mechanic: h.mechanic })),
    ideas: output.ideas?.map((i) => ({
      hook: i.hook,
      thesis: i.thesis,
      framework: i.framework,
    })),
    beats: output.beats?.map((b) => ({
      atSeconds: b.atSeconds,
      vo: b.vo,
      isTurn: b.isTurn,
    })),
    shotMap: output.shotMap?.map((s) => ({
      beatIndex: s.beatIndex,
      shot: s.shot,
      note: s.note,
    })),
    onScreenText: output.onScreenText?.map((t) => ({
      atSeconds: t.atSeconds,
      text: t.text,
    })),
    caption: output.caption
      ? { text: output.caption.text, hashtags: [...output.caption.hashtags] }
      : undefined,
    whyThisPerforms: {
      reasoning: output.whyThisPerforms.reasoning,
      weakestPoint: output.whyThisPerforms.weakestPoint,
    },
    disclosure: {
      platform: output.disclosure.platform,
      guidance: output.disclosure.guidance,
    },
  };
}

function usableState(
  result: GenerateResult,
  run: UsableRun,
  modeLabel: string
): StudioRunState {
  return {
    status: "usable",
    generationId: result.generation.id,
    modeId: result.generation.mode,
    modeLabel,
    document: projectDocument(run.output),
    killTest: summariseKillTest(run.killTest),
    charge: {
      creditsChargedNow: result.creditsChargedNow,
      balanceAfter: result.balanceAfter,
    },
    privateFrameworksNotUsed: privateFrameworksNotUsed(result),
  };
}

/**
 * The offer's dropped-private count, projected — or `null` when this call
 * built no offer.
 *
 * ONE FUNCTION FOR BOTH STATES, because `usable` and `honest_refusal` are the
 * same fact about the same press and two expressions could answer differently.
 * `?? null` is not a fallback for a missing value: `GenerateResult
 * .frameworkOffer` is `null` exactly when no prompt was assembled, and that is
 * the value the screen must be given (see `PrivateFrameworksNotUsed`).
 */
function privateFrameworksNotUsed(
  result: GenerateResult
): PrivateFrameworksNotUsed {
  // `?.` AND `?? null`, ON A FIELD THE TYPE SAYS IS ALWAYS THERE. A rolling
  // deploy runs two builds at once and this value crosses a package boundary,
  // so `undefined` is reachable however the type reads (CLAUDE.md 2026-08-21:
  // proving a field cannot be TYPED is not proving it cannot be CAST). It
  // degrades to "this call has no answer", which is the same fail-closed value
  // a replay gets — not to a zero, which would say nothing was dropped.
  return result.frameworkOffer?.droppedPrivate ?? null;
}

/**
 * The outcome of ONE press.
 *
 * `modeLabel` IS A PARAMETER RATHER THAN A LOOKUP, because the only route from
 * a mode id to its label is `modeLabel` on `@respin/credits/app-server`, and
 * this module is imported by `./run-state.ts`'s consumers and by the tests. The
 * caller (`./actions.ts`) resolves it once, from the STORED row's own
 * `generation.mode` — never from the string the browser posted, which
 * `UnknownModeError` may have refused.
 */
export function studioStateFor(
  result: GenerateResult,
  modeLabel: string
): StudioRunState {
  // A REPLAY IS ITS OWN STATE (R14c). `run === null` and `replayed` are the same
  // fact from two directions and BOTH are checked: `run` is what the renderer
  // needs and `replayed` is what the creator is being told, and a future shape
  // where the two disagree must not render a stored draft as a fresh one that
  // was just paid for.
  if (result.replayed || result.run === null) {
    return {
      status: "replayed",
      generationId: result.generation.id,
      modeId: result.generation.mode,
      modeLabel,
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
      modeId: result.generation.mode,
      modeLabel,
      headline: run.refusal.headline,
      why: [...run.refusal.why],
      sharperAngle: run.refusal.sharperAngle,
      killTest: summariseKillTest(run.killTest),
      charge: {
        creditsChargedNow: result.creditsChargedNow,
        balanceAfter: result.balanceAfter,
      },
      privateFrameworksNotUsed: privateFrameworksNotUsed(result),
    };
  }
  return usableState(result, run, modeLabel);
}

/**
 * ONE LINEAGE ENTRY, BUILT FROM THE STORED ROW (R9).
 *
 * EVERY FIELD EXCEPT `note` COMES OFF `result.generation`, which is the row the
 * settlement wrote — including `parentGenerationId`, which is
 * `generations.parent_id`, the column the composite same-tenant FK constrains
 * and the immutability trigger freezes. The screen therefore renders the
 * database's answer to "which output came from which" rather than the browser's.
 *
 * `note` IS THE CREATOR'S OWN INPUT FOR THIS PRESS, taken from the action's
 * parameter rather than from `generation.request` — that column is `jsonb`
 * typed `unknown`, and reading a field out of it here would be a second parser
 * for a shape `@respin/credits` owns. The two are the same string by
 * construction: `generate` stores exactly `params.input` there.
 *
 * `revisable` IS A COURTESY, NOT THE ENFORCEMENT. An honest refusal stored no
 * draft, so `resolveRevisionParent` would certainly refuse it with
 * `not_revisable`; not offering the control is how the screen avoids handing a
 * creator a button whose only outcome is a refusal. A `replayed` entry is
 * marked unrevisable for a different and weaker reason — this call did not run
 * a pipeline and does not hold the row's outcome in a shape the screen trusts —
 * and the authority refuses or accepts it on its own terms either way.
 */
export function lineageEntryFor(
  result: GenerateResult,
  modeLabel: string,
  note: string
): LineageEntry {
  const outcome: LineageEntry["outcome"] =
    result.replayed || result.run === null
      ? "replayed"
      : result.run.status === "refused"
        ? "honest_refusal"
        : "usable";
  return {
    generationId: result.generation.id,
    attemptId: result.attemptId,
    modeId: result.generation.mode,
    modeLabel,
    parentGenerationId: result.generation.parentId,
    note,
    outcome,
    revisable: outcome === "usable",
  };
}

/**
 * The action's whole return value: the chain, plus what just happened.
 *
 * THE CHAIN IS APPENDED, NEVER REBUILT. `previous` arrives from the browser (see
 * `LineageEntry`'s docblock for why that is display-only and safe), and the new
 * entry is the server's. A cap is applied for the reason every other page bound
 * exists: this list is serialised into the client on every press, and an
 * unbounded one grows the payload of a money control without limit.
 */
export const LINEAGE_VIEW_MAX = 25;

export function studioActionStateFor(
  previous: StudioActionState,
  result: GenerateResult,
  modeLabel: string,
  note: string
): StudioActionState {
  const entry = lineageEntryFor(result, modeLabel, note);
  const lineage = [...previous.lineage, entry];
  return {
    // OLDEST DROPPED, NEWEST KEPT, and the sentence beside the list says the
    // view is bounded — `LINEAGE_SCOPE_NOTE` already says a reload empties it,
    // so a silent truncation here would be the second half of the same lie.
    lineage: lineage.slice(-LINEAGE_VIEW_MAX),
    latest: studioStateFor(result, modeLabel),
  };
}

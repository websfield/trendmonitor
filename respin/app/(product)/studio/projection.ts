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
import {
  CREATIVE_FORM_OPTIONS,
  presentedDisclosure,
  presentedEventConfirmation,
  presentedFilming,
  presentedShotMap,
  type GenerateResult,
  type SavedGenerationView,
} from "@respin/credits/app-server";

import type {
  ClaimFlag,
  CreativeLine,
  KillTestSummary,
  LineageEntry,
  PrivateFrameworksNotUsed,
  SavedPackView,
  ScriptDocument,
  StudioActionState,
  StudioRunState,
  TraceabilityFlag,
} from "./run-state";
import { DISCLOSURE_FIELD_PREFIX } from "./run-copy";
import { savedRuleLine } from "./saved/saved-copy";

type GenerationRunValue = NonNullable<GenerateResult["run"]>;
type UsableRun = Extract<GenerationRunValue, { status: "usable" }>;
type OutputValue = UsableRun["output"];
type OutputV2 = Extract<OutputValue, { contractVersion: 2 }>;
type PremiseValue = NonNullable<OutputV2["premise"]>;

/**
 * A form id's label, FROM THE FACADE'S LIST (R-148) — the screen holds no form
 * vocabulary. An id the list does not carry (a later build's form, read during
 * a rolling deploy) is shown as itself rather than dropped, so the creator is
 * never told nothing about the form their draft is in.
 */
function formLabelOf(id: string): string {
  return CREATIVE_FORM_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/**
 * A premise and filming plan, copied field by field — never spread. `at` is
 * the plan's place in the document (`""` for the script, `/ideas/N` for a
 * concept), which is how the facade finds the server's decisions about it.
 */
function creativeLine(
  output: OutputV2,
  at: string,
  form: string,
  provenance: "offered" | "custom" | null,
  premise: PremiseValue
): CreativeLine {
  const filming = presentedFilming(output, at);
  return {
    formLabel: formLabelOf(form),
    frameworkProvenance: provenance,
    premise: {
      whatHappens: premise.whatHappens,
      interest: premise.interest,
      payoff: premise.payoff,
      basis:
        premise.basis.kind === "material"
          ? { kind: "material", excerpt: premise.basis.excerpt }
          : { kind: premise.basis.kind },
    },
    filming: {
      // THE FACADE'S READING of the server's stored decisions (R-150 point 2)
      // — the one L4's export must reuse. The marker is the presenter's; the
      // model's text is unchanged in the stored output.
      location: { ...filming.location },
      equipment: filming.equipment.map((i) => ({ ...i })),
      people: filming.people,
      minutes: filming.minutes,
    },
  };
}

/**
 * THE KILL-TEST FIELDS THE SCREEN READS — structural, so a fresh run's result
 * and the saved recording pack's validated copy of a stored one (launch L4,
 * `SavedKillTest`) go through the SAME projection below.
 */
type KillTestInput = {
  outcome: string;
  attempts: number;
  rewritten: boolean;
  creatorRulesScored: boolean;
  creatorRuleVerdicts: readonly { ruleId: string; passed: boolean; note: string }[];
  traceabilityLimitNote: string;
  finalAttempt: {
    traceability: readonly {
      kind: string;
      enforcement: "hard" | "flag";
      token: string;
      field: string;
      unit: string | null;
    }[];
    claims: readonly {
      family: string;
      enforcement: "hard" | "flag";
      token: string;
      field: string;
      unit: string | null;
    }[];
  };
};

/** Project the kill test onto the plain shape the screen renders (R7, R19). */
export function summariseKillTest(killTest: KillTestInput): KillTestSummary {
  // A REFUSED DRAFT IS NOT SHOWN, SO NEITHER ARE ITS SENTENCES (billing
  // verification, 2026-10-07): each finding keeps its token and field, and its
  // `unit` — the sentence it sits in — stays on `generations.kill_test`.
  const refused = killTest.outcome === "failed";
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
    //
    // NOT THE MODEL'S DISCLOSURE SECTION (R-121, audit P1-R1, gate M1): a
    // finding's `unit` is the text it was found in, so a `/disclosure/*`
    // finding would carry the model's disclosure prose into the client state
    // even though the renderer drops it. Stored on `generations.kill_test`,
    // never projected — the same rule as the claims list below.
    traceability: killTest.finalAttempt.traceability
      .filter((f) => !f.field.startsWith(DISCLOSURE_FIELD_PREFIX))
      .map(
        (f): TraceabilityFlag => ({
          kind: f.kind,
          enforcement: f.enforcement,
          token: f.token,
          field: f.field,
          unit: refused ? null : f.unit,
        })
      ),
    // REQ-I04/REQ-I05's claim findings, from the SAME attempt as the
    // traceability ones and for the same reason. They were stored here and
    // projected nowhere; this is the line that makes the fifth deterministic
    // rule reachable at flag level.
    //
    // EXCEPT IN THE MODEL'S DISCLOSURE SECTION (R-121, audit P1-R1, carrier
    // 7). A finding's `unit` is the text it was found in, so a flag finding on
    // `/disclosure/guidance` would print the model's disclosure sentence under
    // "What the draft says about itself" — the very prose the disclosure line
    // replaces. The finding stays stored on `generations.kill_test`; it is
    // simply not presented, the same rule the traceability list applies.
    claims: killTest.finalAttempt.claims
      .filter((c) => !c.field.startsWith(DISCLOSURE_FIELD_PREFIX))
      .map(
        (c): ClaimFlag => ({
          family: c.family,
          enforcement: c.enforcement,
          token: c.token,
          field: c.field,
          unit: refused ? null : c.unit,
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
  // A VERSION-2 DOCUMENT IS NARROWED BY ITS OWN STAMP (R-148), and only by it:
  // an unversioned output is the legacy reading and gets the legacy projection
  // below, byte for byte — the v2 fields cannot appear on it because the
  // package's v1 reader refuses them.
  if (output.contractVersion === 2) return projectDocumentV2(output);
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
    // A KIND FROM THE FACADE, NOT THE MODEL'S SECTION (R-121, audit P1-R1):
    // nothing is read off `output.disclosure`.
    disclosure: presentedDisclosure(),
  };
}

/**
 * The version-2 projection: every legacy section exactly as above, plus the
 * requested form, each concept's creative half, the script's own, the
 * framework's provenance and the pivot's kind.
 */
function projectDocumentV2(output: OutputV2): ScriptDocument {
  const script =
    output.form && output.premise && output.filming
      ? creativeLine(
          output,
          "",
          output.form,
          // NULL, NOT A GUESS, if a script ever arrived without a framework:
          // a provenance this projection invented would be a claim about the
          // library the document never made.
          output.framework?.provenance ?? null,
          output.premise
        )
      : undefined;
  return {
    creative: {
      requestedFormLabel: formLabelOf(output.requestedForm),
      ...(script === undefined ? {} : { script }),
      // R-150 point 3: the server-authored confirmation item — on every v2 document.
      eventConfirmation: presentedEventConfirmation(output),
    },
    thesis: output.thesis
      ? { statement: output.thesis.statement, why: output.thesis.why }
      : undefined,
    framework: output.framework
      ? {
          name: output.framework.name,
          why: output.framework.why,
          provenance: output.framework.provenance,
        }
      : undefined,
    hooks: output.hooks?.map((h) => ({ text: h.text, mechanic: h.mechanic })),
    ideas: output.ideas?.map((i, index) => ({
      hook: i.hook,
      thesis: i.thesis,
      framework: i.framework,
      creative: creativeLine(output, `/ideas/${index}`, i.form, i.frameworkProvenance, i.premise),
    })),
    beats: output.beats?.map((b) => ({
      atSeconds: b.atSeconds,
      vo: b.vo,
      isTurn: b.isTurn,
      ...(b.pivot === undefined ? {} : { pivot: b.pivot }),
    })),
    // THE FACADE'S READING of the server's shot-map decisions (R-150 point 2).
    shotMap: presentedShotMap(output)?.map((s) => ({
      beatIndex: s.beatIndex,
      shot: s.shot,
      note: s.note,
      unconfirmed: s.unconfirmed,
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
    // A KIND FROM THE FACADE, NOT THE MODEL'S SECTION (R-121, audit P1-R1):
    // nothing is read off `output.disclosure`.
    disclosure: presentedDisclosure(),
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
    attemptId: result.attemptId,
    modeId: result.generation.mode,
    modeLabel,
    document: projectDocument(run.output),
    killTest: summariseKillTest(run.killTest),
    charge: {
      creditsChargedNow: result.creditsChargedNow,
      balanceAfter: result.balanceAfter,
      freeClaimRefusal: result.freeClaimRefusal,
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
 * THE STORED REFUSAL REASON'S FIRST LINE ONLY — its static headline. Rows
 * settled before 2026-10-07 carry the refused draft's excerpts in the lines
 * after it (`honestRefusal`'s old `why`), and that draft is not shown; the
 * saved pack lists the rules that fired, by field.
 */
function refusalHeadline(reason: string | null): string | null {
  if (reason === null) return null;
  const first = reason.split("\n")[0]?.trim() ?? "";
  return first.length > 0 ? first : null;
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
  // THREE OUTCOMES, DECIDED ON `replayed` ALONE (audit P3-A2). `replayed` is
  // the field that says whether THIS press charged anything; `run === null`
  // is not — a settle of a HELD draft also returns `run: null`, and it
  // charges. Treating the two as one fact told every creator who finished a
  // held draft "nothing extra was spent" on a press that took the debit.
  if (result.replayed) {
    return {
      status: "replayed",
      generationId: result.generation.id,
      attemptId: result.attemptId,
      modeId: result.generation.mode,
      modeLabel,
      outcome: result.generation.outcome,
      weakestPoint: result.generation.weakestPoint,
      refusalReason: refusalHeadline(result.generation.refusalReason),
      balanceAfter: result.balanceAfter,
      freeClaimRefusal: result.freeClaimRefusal,
    };
  }
  // THE THIRD OUTCOME: this press settled a stored candidate (`replayed:
  // false`, `run: null`) — charged now, no model called by this press.
  if (result.run === null) {
    return {
      status: "settled_held",
      generationId: result.generation.id,
      attemptId: result.attemptId,
      modeId: result.generation.mode,
      modeLabel,
      outcome: result.generation.outcome,
      weakestPoint: result.generation.weakestPoint,
      refusalReason: refusalHeadline(result.generation.refusalReason),
      charge: {
        creditsChargedNow: result.creditsChargedNow,
        balanceAfter: result.balanceAfter,
        freeClaimRefusal: result.freeClaimRefusal,
      },
    };
  }
  const run = result.run;
  if (run.status === "refused") {
    return {
      status: "honest_refusal",
      generationId: result.generation.id,
      attemptId: result.attemptId,
      modeId: result.generation.mode,
      modeLabel,
      headline: run.refusal.headline,
      why: [...run.refusal.why],
      sharperAngle: run.refusal.sharperAngle,
      killTest: summariseKillTest(run.killTest),
      charge: {
        creditsChargedNow: result.creditsChargedNow,
        balanceAfter: result.balanceAfter,
        freeClaimRefusal: result.freeClaimRefusal,
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
  // `replayed` alone decides a replay (audit P3-A2); a settled HELD draft
  // (`run: null`, charged now) is a real stored generation of its own outcome.
  const outcome: LineageEntry["outcome"] = result.replayed
    ? "replayed"
    : result.run === null
      ? result.generation.outcome === "usable"
        ? "usable"
        : "honest_refusal"
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

// ------------------------------------------------------------------------
// LAUNCH L4 (R-153): THE SAVED RECORDING PACK.
//
// The facade read hands over the stored output ALREADY PARSED by its own
// contract version and with the model's disclosure replaced by the product's
// guidance; this projects it through `projectDocument` and `summariseKillTest`
// above — the SAME two functions a fresh draft goes through — so the saved
// page, the live result and the Markdown export read one stored version one
// way. Field by field; nothing is spread.

/** The saved pack, as the saved page, the copied script and the export read it. */
export function savedPackFor(view: SavedGenerationView): SavedPackView {
  const killTest = view.killTest;
  return {
    attemptId: view.attemptId,
    modeLabel: view.modeLabel,
    createdAt: view.createdAt,
    platform: view.platform,
    outcome: view.outcome,
    document: view.output === null ? null : projectDocument(view.output),
    // THE CREATOR'S RULE, NEVER THE SCORING MODEL'S NOTE (R-153 amendment A1):
    // the facade dropped the note, and the verdict line shown — on the page
    // and in the export — is the creator's own rule text, or the product's
    // sentence saying it could not be read.
    checks:
      killTest === null
        ? null
        : summariseKillTest({
            ...killTest,
            creatorRuleVerdicts: killTest.creatorRuleVerdicts.map((v) => ({
              ruleId: v.ruleId,
              passed: v.passed,
              note: savedRuleLine(v.ruleText),
            })),
          }),
    refusal:
      view.outcome !== "honest_refusal"
        ? null
        : {
            headline: killTest?.refusal?.headline ?? null,
            sharperAngle: killTest?.refusal?.sharperAngle ?? null,
            hardRules: (killTest?.finalAttempt.hardRules ?? []).map((h) => ({
              rule: h.rule,
              field: h.field,
              excerpt: null,
              remedy: h.remedy,
            })),
          },
    weakestPoint: view.weakestPoint,
    disclosureGuidance: view.disclosureGuidance,
    lineage: {
      parent:
        view.lineage.parent === null
          ? null
          : { attemptId: view.lineage.parent.attemptId, modeLabel: view.lineage.parent.modeLabel },
      source:
        view.lineage.source === null
          ? null
          : { attemptId: view.lineage.source.attemptId, ideaIndex: view.lineage.source.ideaIndex },
    },
    piece:
      view.piece === null
        ? null
        : {
            pieceId: view.piece.pieceId,
            version: view.piece.version,
            isSelected: view.piece.isSelected,
            selectable: view.piece.selectable,
            selectedAttemptId: view.piece.selectedAttemptId,
            versions: view.piece.versions.map((v) => ({
              attemptId: v.attemptId,
              createdAt: v.createdAt,
              outcome: v.outcome,
              isSelected: v.isSelected,
              isThis: v.isThis,
              parentAttemptId: v.parentAttemptId,
            })),
            versionsTruncated: view.piece.versionsTruncated,
          },
    reference:
      view.reference === null
        ? null
        : view.reference.kind === "spin"
          ? {
              kind: "spin",
              summary:
                view.reference.summary === null
                  ? null
                  : {
                      source: view.reference.summary.source,
                      title: view.reference.summary.title,
                      mechanismSummary: view.reference.summary.mechanismSummary,
                    },
            }
          : {
              kind: "source",
              text: view.reference.text,
              truncated: view.reference.truncated,
              checkedAgainst: view.reference.checkedAgainst,
            },
    revisions: view.revisions.map((r) => ({
      attemptId: r.attemptId,
      createdAt: r.createdAt,
      outcome: r.outcome,
    })),
    revisionsTruncated: view.revisionsTruncated,
    disclosureAdviceWithheld: killTest?.disclosureHardRulesWithheld ?? false,
    revision: {
      revisable: view.revision.revisable,
      blocked: view.revision.blocked,
      credits: view.revision.credits,
      quoteConfigVersion: view.revision.quoteConfigVersion,
      inPlan: view.revision.inPlan,
    },
  };
}

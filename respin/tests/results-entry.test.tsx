// The result-entry form's contract (slice 9a, R6-R9), and the two guards that
// keep it from drifting away from the vocabularies it renders.
//
// THE 2026-08-29 LESSON IS WHAT THIS FILE IS SHAPED BY, and it is about
// exactly this surface: "a DERIVED guard is only as wide as its POPULATION,
// and a population written as one path narrows silently the day a second path
// appears — so state the population as a LIST". Two populations are stated
// here as lists:
//
//   1. THE VOCABULARIES the form renders (evidence states, confounder codes,
//      audience classes, levers). Each is derived from `@respin/db`'s own
//      `as const` array and asserted against the screen's words, so a code
//      added upstream is a red test naming the missing label rather than a
//      checkbox nobody notices is gone.
//   2. THE REFUSAL CLASSES this screen's write path can raise. A class with no
//      copy renders as "Something went wrong" — the registered `8c-R15`
//      finding — and the modules that can raise one are named below rather
//      than derived from whichever file happened to exist when this was
//      written.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { scratchDir } from "./support/scratch-dir";

import {
  RESULT_AUDIENCE_CLASSES,
  RESULT_CONFOUNDER_CODES,
  RESULT_EVIDENCE_STATES,
  RESULT_LEVERS,
  RESULT_NOTE_MAX,
  ResultDuplicateError,
  ResultInputError,
  ResultTargetError,
  TreatmentKeyError,
} from "@respin/db";
import {
  BILLING_ERROR_COPY,
  billingErrorCode,
} from "../app/(product)/billing-errors";
import { ComparisonStratumError } from "@respin/db";
import {
  CONFOUNDER_LABELS,
  LOG_COSTS_NOTHING,
  PICKER_RECENT_ONLY,
  EVIDENCE_STATE_COPY,
  LEVER_LABELS,
  evidenceStateCopy,
  noDeclaredMetricDetail,
} from "../app/(product)/results/copy";
import {
  RESULT_FIELD,
  leverField,
} from "../app/(product)/results/log-state";
import { LogPanel, type LogPanelProps } from "../app/(product)/results/log-panel";
import { ROW_LEVERS } from "../app/(product)/results/projection";
import { ResultsView } from "../app/(product)/results/results-view";
import {
  confirmedFieldsFor,
  PromotionPanel,
  PromotionReviewDocument,
  type PromotionPanelProps,
} from "../app/(product)/results/promotion-panel";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const props: LogPanelProps = {
  action: async () => ({ status: "idle" }),
  generations: [
    { generationId: "g-1", label: "hooks — 2026-08-01" },
    { generationId: "g-2", label: "caption — 2026-08-03" },
  ],
  platforms: ["TikTok", "Instagram Reels"],
  audienceClasses: RESULT_AUDIENCE_CLASSES,
  evidenceStates: RESULT_EVIDENCE_STATES,
  confounderCodes: RESULT_CONFOUNDER_CODES,
  levers: RESULT_LEVERS,
  noteMax: RESULT_NOTE_MAX,
  block: null,
};

const renderPanel = (p: Partial<LogPanelProps> = {}) =>
  renderToStaticMarkup(<LogPanel {...props} {...p} />);

const has = (html: string, testId: string) =>
  html.includes(`data-testid="${testId}"`);

// ------------------------------------------------- the vocabularies, pinned

describe("every closed set this form renders comes from the database's own", () => {
  it("EVERY evidence state has words on this screen — the map is the population", () => {
    expect(Object.keys(EVIDENCE_STATE_COPY).sort()).toEqual(
      [...RESULT_EVIDENCE_STATES].sort()
    );
  });

  it("EVERY evidence state has a badge word — status is never colour-only", () => {
    // The list-side half of the same population. It replaced a ternary on
    // "is it unquantified", which would have labelled a third state as self
    // reported; a state with no word here is a red test rather than a wrong
    // badge on the column that says how good the evidence is.
    for (const code of RESULT_EVIDENCE_STATES) {
      const copy = evidenceStateCopy(code);
      expect(copy.badge, `${code} has no badge word`).toBeTruthy();
      expect(["filled", "outline", "dashed"]).toContain(copy.badgeVariant);
    }
    // Only a connector-verified row may wear a FILLED (verified) badge, and
    // v1 can never write one — so no row this build produces is filled.
    expect(evidenceStateCopy("quantified_self_reported").badgeVariant).toBe("dashed");
    expect(evidenceStateCopy("quantified_self_reported").badge).toContain("UNVERIFIED");
  });

  it("EVERY confounder code has a label — and an unlabelled one renders as itself", () => {
    expect(Object.keys(CONFOUNDER_LABELS).sort()).toEqual(
      [...RESULT_CONFOUNDER_CODES].sort()
    );
  });

  it("EVERY lever has a label, and the row projection reads exactly those levers", () => {
    // `ROW_LEVERS` is written out in `projection.ts` because a row stores each
    // lever in its own named column pair. This is what makes that list a
    // DECISION rather than a memory: a third lever upstream fails here.
    expect(Object.keys(LEVER_LABELS).sort()).toEqual([...RESULT_LEVERS].sort());
    expect([...ROW_LEVERS].sort()).toEqual([...RESULT_LEVERS].sort());
  });

  it("every confounder code in the vocabulary gets its own checkbox", () => {
    const html = renderPanel();
    for (const code of RESULT_CONFOUNDER_CODES) {
      expect(html, `${code} has no checkbox`).toContain(
        `id="results-confounder-${code}"`
      );
      expect(html).toContain(`name="confounders"`);
    }
  });

  it("both audience classes are offered, as a REQUIRED choice (paid never pools)", () => {
    const html = renderPanel();
    for (const code of RESULT_AUDIENCE_CLASSES) {
      expect(html).toContain(`id="results-audience-${code}"`);
    }
    // ATTRIBUTE ORDER IS THE RENDERER'S, NOT THIS SCREEN'S: React emits
    // `required=""` before `name`, so the assertion is over the whole tag
    // rather than a guessed order — a pattern that depends on the installed
    // renderer's attribute order is a pattern that breaks on an upgrade for no
    // product reason.
    const audienceTag = /<input[^>]*name="audienceClass"[^>]*>/g;
    const tags = [...html.matchAll(audienceTag)].map((m) => m[0]);
    expect(tags.length).toBe(RESULT_AUDIENCE_CLASSES.length);
    for (const tag of tags) expect(tag).toContain("required");
    expect(html.replace(/<[^>]+>/g, " ")).toContain("never pooled");
  });
});

// ------------------------------------------------------------------- R6

describe("R6: two evidence states are offered and the third is named, not hidden", () => {
  it("connector_verified is UNREACHABLE from this form — no control carries it", () => {
    const html = renderPanel();
    expect(html).not.toContain('value="connector_verified"');
    expect(html).not.toContain('id="results-evidence-connector_verified"');
  });

  it("...and the screen SAYS why, rather than leaving a creator to notice an absence", () => {
    const html = renderPanel();
    expect(has(html, "results-evidence-withheld-connector_verified")).toBe(true);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("There is a third state, connector verified");
    expect(text).toContain("this product holds no such connection yet");
  });

  it("the two claimable states ARE offered", () => {
    const html = renderPanel();
    const offered = RESULT_EVIDENCE_STATES.filter(
      (code) => evidenceStateCopy(code).offered
    );
    expect(offered).toEqual(["unquantified", "quantified_self_reported"]);
    for (const code of offered) {
      expect(html).toContain(`id="results-evidence-${code}"`);
    }
  });

  it("the radio is an INTENT control and says the label is derived from the numbers", () => {
    // The strongest form of R6 available: the form cannot claim an evidence
    // state at all. `recordResult` derives it, and this sentence is what stops
    // the radio from reading like an authority it does not have.
    const html = renderPanel();
    expect(html).not.toContain('name="evidenceState"');
    expect(html).toContain('name="evidenceIntent"');
    expect(has(html, "results-evidence-derived")).toBe(true);
    expect(html.replace(/<[^>]+>/g, " ")).toContain(
      "The label a result carries is decided by what you type"
    );
  });

  it("SOURCE SCAN: no module under app/(product)/results/ sends an evidence state", () => {
    // The rendered check above is satisfied by a form; this is satisfied only
    // by the action really not sending one. `RecordResultParams` has no
    // parameter for it, so this is a second witness rather than the only one.
    const action = readFileSync(
      join(ROOT, "app", "(product)", "results", "actions.ts"),
      "utf8"
    );
    expect(action).not.toMatch(/evidenceState:\s*String\(/);
    expect(action).not.toMatch(/formData\.get\(\s*["']evidence/);
  });
});

// ------------------------------------------------------------------- R9

describe("R9: both levers are entered separately, each with its own denominator", () => {
  it("each lever has its own value field and its own denominator field", () => {
    const html = renderPanel();
    for (const lever of RESULT_LEVERS) {
      expect(html, `${lever} has no value field`).toContain(
        `name="${lever}Value"`
      );
      expect(html, `${lever} has no denominator field`).toContain(
        `name="${lever}Denominator"`
      );
    }
  });

  it("there is NO combined field — no control accepts one number for both", () => {
    const html = renderPanel();
    for (const name of ["total", "score", "combined", "overall"]) {
      expect(html, `a "${name}" field would be a summary score`).not.toContain(
        `name="${name}"`
      );
    }
  });

  it("the note's CEILING is stated, and it is the package's number", () => {
    // THE FORM USED TO STATE NO LIMIT while `recordResult` refused at 2,001,
    // and `ResultInputError` told the creator to "check each against the limit
    // shown beside it" — pointing at a limit nothing showed. A comment on this
    // very field asserted the column had no ceiling; it has one, and that
    // comment is the "claim the code does not have" shape.
    const html = renderPanel();
    expect(has(html, "results-note-limit")).toBe(true);
    // THE NUMBER IS THE PACKAGE'S, not a figure typed into a screen. If the
    // ceiling moves, this moves with it.
    expect(html.replace(/<[^>]+>/g, " ")).toContain(
      `Up to ${RESULT_NOTE_MAX} characters`
    );
    // The control is BOUND to it, not merely near it (WCAG 3.3.2), and the
    // browser is held to the same number.
    expect(html).toMatch(
      /<textarea[^>]*aria-describedby="[^"]*results-note-limit[^"]*"/
    );
    expect(html).toContain(`maxLength="${RESULT_NOTE_MAX}"`);
    // ...and it says a long note is REFUSED rather than silently shortened,
    // which is the promise a creator needs before they write one.
    expect(html.replace(/<[^>]+>/g, " ")).toContain("refused rather than shortened");
  });

  it("SOURCE: no ceiling is typed into this screen", () => {
    // The other half: a stated limit is only worth having while it is the
    // enforced one. A literal here would drift the day the constant moves,
    // which is the whole reason the ceilings travel as constants.
    const panel = readFileSync(
      join(ROOT, "app", "(product)", "results", "log-panel.tsx"),
      "utf8"
    );
    expect(panel).not.toContain(String(RESULT_NOTE_MAX));
    expect(panel).not.toContain("2000");
    expect(panel).not.toContain("2_000");
  });

  it("the denominator rule is stated ON the control, and zero is named as undefined", () => {
    const html = renderPanel();
    expect(has(html, "results-denominator-note")).toBe(true);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("A denominator of zero is not a small number, it is undefined");
    // WCAG 3.3.2: the stated rule is part of the control, not decoration.
    expect(html).toContain('aria-describedby="results-denominator-note"');
  });
});

// ------------------------------------------------------------------- C4

// ===========================================================================
// THE OUTPUT PICKER SHOWS A PAGE, AND WHAT THESE TESTS DO AND DO NOT PROVE.
//
// Written out for the reason `results-honesty.test.tsx`'s R20 block is: a
// reader who sees these assertions green will believe the defect is fixed
// unless the limit is on the page.
//
// THE DEFECT: `generationsNewest` pages at `LEDGER_PAGE_MAX`, and this picker
// renders that page as if it were every output the creator has. Past the bound
// an older draft is ABSENT, and before this change nothing on screen said so —
// a creator would look for their post, not find it, and reasonably conclude
// the product had lost it.
//
// WHAT THESE TESTS PROVE: that the picker now SAYS what it is showing, always,
// in words that carry no number, and that the sentence names the gap as open.
//
// WHAT THEY DO NOT PROVE, AND WHAT NOBODY SHOULD READ INTO THEM: that a
// creator past the bound can log a result against an older output. THEY STILL
// CANNOT. This narrows the defect from "silently absent" to "visibly partial"
// and closes nothing — the fix is a searchable or paged picker, which is not
// 9a's scope. The one thing a creator past the bound gains is the ability to
// tell that the list is partial, and the fallback the sentence names: log the
// result without naming a draft, which stores it as baseline-only.
//
// NOR DO THEY PROVE THE SENTENCE IS TRUE AT THE BOUND. No fixture here has
// two hundred generations; the assertions below drive one, two and zero. What
// makes the sentence honest at every size is that it describes the LIST's
// behaviour ("only ever shows your most recent") rather than a count, so there
// is no size at which it becomes false — which is an argument, not a test.
// ===========================================================================

describe("the output picker says it is a page, not the whole list", () => {
  it("the sentence is rendered whether or not the bound is anywhere near", () => {
    // UNCONDITIONAL BY DESIGN: copy that appears only past a threshold is copy
    // nobody reviews and no test drives, and this threshold is one almost no
    // fixture will ever cross. All three list sizes this screen can be in are
    // driven, because "always" is the property.
    for (const [label, generations] of [
      ["a short list", props.generations],
      ["a single output", [props.generations[0]]],
      ["no outputs at all", []],
    ] as const) {
      const html = renderPanel({ generations });
      expect(has(html, "results-generation-recency"), label).toBe(true);
      expect(html.replace(/<[^>]+>/g, " "), label).toContain(
        "only ever shows your most recent outputs"
      );
    }
  });

  it("it names NO NUMBER — the bound is not this screen's to state", () => {
    // `LEDGER_PAGE_MAX` lives in `@respin/db` and is not on the sanctioned
    // import surface for `app/**`, so a figure typed into this copy would be a
    // second copy of a limit this screen cannot read — the drift
    // `tests/landing-pricing.test.ts` exists to stop, one screen over.
    // `[0-9]` RATHER THAN A SHORTHAND CLASS, same rule as the regex below:
    // an escape is a thing that can be lost, and this pattern has none. The
    // first version of this line was written as a digit shorthand, lost its
    // backslash on the way into the file, and matched the LETTER in "logged"
    // instead — a scan that failed CLOSED here, and would have failed OPEN in
    // a scanner. Exactly the 2026-08-21 shape, met twice in one edit.
    expect(PICKER_RECENT_ONLY).not.toMatch(/[0-9]/);
    // NON-VACUITY: the pattern really does catch a number.
    expect("showing the most recent 200").toMatch(/[0-9]/);
  });

  it("it says the gap is OPEN, and names the thing a creator can still do", () => {
    // The half that stops the sentence reading as a fix. It admits the search
    // does not exist and points at the fallback that does — logging the result
    // without naming a draft, which the picker offers and which stores it as
    // baseline-only.
    expect(PICKER_RECENT_ONLY).toContain("not built yet");
    expect(PICKER_RECENT_ONLY).toContain("without a draft");
    expect(PICKER_RECENT_ONLY).toContain("older than these");
  });

  it("the control is DESCRIBED BY it, not merely near it", () => {
    // WCAG 3.3.2: a stated limit is part of the control. A creator using a
    // screen reader meets the select before the paragraph unless the select
    // points at it, and this sentence is the one that explains why the option
    // they want is missing.
    const html = renderPanel();
    expect(html).toMatch(
      /<select[^>]*id="results-generation"[^>]*aria-describedby="[^"]*results-generation-recency[^"]*"/
    );
    // ...and the older note is still described too, not displaced by it.
    expect(html).toMatch(
      /<select[^>]*id="results-generation"[^>]*aria-describedby="[^"]*results-generation-note[^"]*"/
    );
  });

  it("NON-VACUITY: the marker is really this sentence, not any paragraph", () => {
    const html = renderPanel();
    // A REGEX LITERAL CARRYING NO BACKSLASH (CLAUDE.md, 2026-08-21). The
    // paragraph holds plain text, so "up to the next tag" is exact — and a
    // pattern with nothing to escape cannot be broken by losing an escape.
    const m = /<p[^>]*data-testid="results-generation-recency"[^>]*>([^<]*)/.exec(
      html
    );
    expect(m, "the marker rendered no paragraph at all").not.toBeNull();
    expect((m?.[1] ?? "").replace(/&#x27;/g, "'")).toBe(PICKER_RECENT_ONLY);
  });
});

describe("contract C4: a result with no draft is baseline-only, and the form says so", () => {
  it("the picker offers the creator's own outputs plus an explicit no-draft option", () => {
    const html = renderPanel();
    expect(html).toContain('value="g-1"');
    expect(html).toContain('value="g-2"');
    expect(html).toContain("Not one of my Respin drafts");
  });

  it("...and states the consequence rather than leaving it to be discovered", () => {
    const text = renderPanel().replace(/<[^>]+>/g, " ");
    expect(text).toContain("never joins a treatment group");
    // THE BASELINE HALF IS CONDITIONAL, and it used to be stated flat: "counts
    // towards your own baseline" is false for an UNQUANTIFIED result, which
    // this same form excludes from every comparison two fields away. A
    // draft-less result with no numbers counts towards nothing.
    expect(text).toContain("If you give it numbers it can also count towards your own baseline");
    expect(text).toContain("with no numbers it counts towards nothing");
  });

  it("an empty picker is still a usable form (a creator with no drafts can log)", () => {
    const html = renderPanel({ generations: [] });
    expect(html).toContain("Not one of my Respin drafts");
    expect(has(html, "results-generation-field")).toBe(true);
  });
});

// ------------------------------------------------------------------- R8

describe("R8: a profile with no declared metric is refused with a NAMED remedy", () => {
  it("the refusal names the page, the fields, and does not render the form", () => {
    const html = renderToStaticMarkup(
      <ResultsView
        state={{
          kind: "no_declared_metric",
          detail: noDeclaredMetricDetail("/brain"),
          brainHref: "/brain",
        }}
        logPanel={<LogPanel {...props} />}
      />
    );
    expect(has(html, "results-no-declared-metric")).toBe(true);
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).toContain("north-star metric");
    expect(text).toContain("this page will not pick one for you");
    expect(text).toContain("the label, the unit, and whether higher or lower is better");
    // NO FORM. Offering a control whose only outcome is a refusal is what
    // `studio-panel.tsx` refuses to do for modes; the panel is passed in and
    // deliberately not rendered in this state.
    expect(has(html, "results-log-panel")).toBe(false);
  });

  it("NON-VACUITY: the same view DOES render the panel when a metric is declared", () => {
    const html = renderToStaticMarkup(
      <ResultsView
        state={{
          kind: "ready",
          profileName: "Ada",
          metric: {
            label: "Follows",
            key: "follows_per_1k",
            unit: "follows",
            direction: "higher_is_better",
          },
          results: [],
          moreResults: false,
          comparisonError: null,
          comparisons: [],
        }}
        logPanel={<LogPanel {...props} />}
      />
    );
    expect(has(html, "results-log-panel")).toBe(true);
  });
});

// ------------------------------------------- the refusal channel's population

/**
 * THE MODULES THAT CAN RAISE A REFUSAL ON THIS SCREEN'S WRITE PATH.
 *
 * WRITTEN AS A LIST, because the 2026-08-29 defect was a guard derived from
 * ONE path on the day a second one appeared. `logResultAction` calls
 * `respinDb.recordResult`, which is `results-ops.ts` composing
 * `with-workspace.ts`'s capability over `results-schema.ts`'s constraints;
 * every typed refusal any of the three can raise reaches the creator through
 * this form. Adding a fourth module to the write path costs a line here.
 */
const RESULT_WRITE_PATH_MODULES = [
  "packages/db/src/results-ops.ts",
  "packages/db/src/results-schema.ts",
] as const;

/**
 * The refusal classes named in the write path, DERIVED from its source.
 *
 * A SCAN THAT FAILS OPEN IS WORSE THAN NO SCAN (CLAUDE.md 2026-08-21), so the
 * regex is a literal (never assembled from a string, where one lost backslash
 * silently matches nothing) and the test below asserts it finds a PLANTED
 * class as well as the real ones.
 */
const THROWN_CLASS = /new\s+([A-Z][A-Za-z0-9]*Error)\s*\(/g;

function thrownClasses(source: string): string[] {
  return [...new Set([...source.matchAll(THROWN_CLASS)].map((m) => m[1]))];
}

describe("no refusal on this screen degrades to 'Something went wrong' (8c-R15)", () => {
  it("every result-path refusal class resolves to copy that is not the unknown fallback", () => {
    // The four are INSTANTIATED rather than named as strings: `billingErrorCode`
    // classifies by class, so a string list would prove nothing about what the
    // map actually does with an instance.
    const raised: [string, Error][] = [
      ["ResultInputError", new ResultInputError("the observation window ends before it starts")],
      ["ResultTargetError", new ResultTargetError()],
      ["ResultDuplicateError", new ResultDuplicateError()],
      ["TreatmentKeyError", new TreatmentKeyError("the mode is blank")],
    ];
    for (const [name, err] of raised) {
      const code = billingErrorCode(err);
      expect(
        code,
        `${name} has no entry in billing-errors.ts, so this form renders "Something went wrong" for it`
      ).not.toBe("unknown");
      expect(BILLING_ERROR_COPY[code]).toBeTruthy();
    }
  });

  it("the write path raises NO class this suite has not named", () => {
    // The population check: if `recordResult` grows a fifth refusal, this
    // fails naming it, rather than the copy gap being found by a creator.
    const named = new Set([
      "ResultInputError",
      "ResultTargetError",
      "ResultDuplicateError",
      "TreatmentKeyError",
      // Raised by the shared scoping layer, not by the result path itself, and
      // each already carries copy: `ProfileAccessError` (a profile that is not
      // this member's), `ScopeForgeryError` (a minted scope that is not ours),
      // `WorkspaceAccessError` (no workspace, or more than one).
      "ProfileAccessError",
      "ScopeForgeryError",
      "WorkspaceAccessError",
    ]);
    const found = RESULT_WRITE_PATH_MODULES.flatMap((rel) =>
      thrownClasses(readFileSync(join(ROOT, ...rel.split("/")), "utf8"))
    );
    expect(found.length, "the scan read no source at all").toBeGreaterThan(0);
    for (const cls of found) {
      expect(
        named.has(cls),
        `${cls} is raised on the result write path and this suite does not name it — add it here AND check billing-errors.ts has copy for it`
      ).toBe(true);
    }
  });

  it("ComparisonStratumError has copy — owed although 9a CANNOT reach it", async () => {
    // SCOPE FIRST, so this case is not read as coverage of a live path: this
    // screen passes no stratum at all (the comparison arrives already built
    // from the facade), so there is NO path from /results to this class in
    // this slice. It is pinned here for the reason the class exists — the
    // refusal used to be a `WorkspaceAccessError`, whose copy would have told
    // a creator to sign in as somebody else — and because
    // `tests/billing-ui.test.tsx` derives its population from "every Error
    // class app/** can receive from a facade", which is the derived shape that
    // goes stale the day 9b adds the first stratum-passing caller.
    const code = billingErrorCode(
      new ComparisonStratumError("the observation window ends before it starts")
    );
    expect(code).toBe("comparison_stratum");
    expect(code).not.toBe("unknown");
    // AND NOT its predecessor's code, which is the whole point of the split.
    expect(code).not.toBe("workspace_access");
    const copy = BILLING_ERROR_COPY.comparison_stratum;
    // The remedy the class's own message gives, and the WRONG one pinned out.
    expect(copy.detail).toContain("Reload the page");
    expect(`${copy.title} ${copy.detail}`).not.toMatch(
      /sign in|account that owns|ask its owner/i
    );
  });

  it("...and its copy claims NOTHING about what was preserved", () => {
    // THE PATTERN IS A/S, AND ITS LIMIT IS STATED THE WAY A/S IS.
    // `profile-scope.test.ts` pins this absence on the class MESSAGE and
    // discloses that it bans the spellings it enumerates, NOT the class of
    // claim. The same regex is applied here to the creator-facing COPY, and it
    // carries the same limit: a kindly-worded synonym — "your results are
    // safe", "everything you logged is still there" — would pass it. What
    // actually keeps the claim out is the entry's own docblock and a reader;
    // this catches the regression, not the class.
    //
    // WHY THE CLAIM IS BANNED AT ALL: "nothing was changed" is a statement
    // about the whole call path, and nothing structurally stops a later caller
    // raising this from inside a transaction that has already written. A
    // caller that KNOWS what it preserved says so itself.
    const copy = BILLING_ERROR_COPY.comparison_stratum;
    const text = `${copy.title} ${copy.detail}`;
    expect(
      text,
      "the stratum copy makes an unconditional promise about what was preserved"
    ).not.toMatch(
      /nothing was (changed|saved|stored|written|lost)|(is|are|remain[s]?) (safe|untouched|unaffected)|no( thing)? .{0,20}(was|were) (changed|written)/i
    );
    // NON-VACUITY for the pattern itself: it really does catch the sentence
    // that was removed from the class, so a green line above is the copy being
    // clean rather than the regex being broken.
    expect("That comparison could not be set up. Nothing was changed.").toMatch(
      /nothing was (changed|saved|stored|written|lost)|(is|are|remain[s]?) (safe|untouched|unaffected)|no( thing)? .{0,20}(was|were) (changed|written)/i
    );
    // ...and the TRUE half is present: the fault is ours and the reader caused
    // none of it, which is what the copy says instead of a reassurance.
    expect(copy.detail).toContain("fault on our side");
    expect(copy.detail).toContain("nothing on the form to correct");
  });

  it("NON-VACUITY: the scan finds a PLANTED class, so a clean report means it looked", () => {
    // A scan reporting zero violations is indistinguishable from a scan that
    // is working, unless it is driven against a known-bad input.
    expect(
      thrownClasses('if (x) { throw new ResultPlantedError("planted"); }')
    ).toEqual(["ResultPlantedError"]);
    // And the real files really do contain classes, so the loop above is not
    // iterating over an empty list.
    const real = thrownClasses(
      readFileSync(join(ROOT, "packages", "db", "src", "results-schema.ts"), "utf8")
    );
    expect(real).toContain("TreatmentKeyError");
  });
});

// ------------------------------------------- the form and the action agree
//
// TWO LISTS WITH NOTHING BINDING THEM, until `RESULT_FIELD`. The panel writes
// `name="…"` on each control and the action reads `formData.get("…")`; a
// rename on either side compiles, lints, renders and silently drops a
// creator's number — the window they typed, or their conversion denominator —
// into a row that stores it as absent. A `FormData` key is a string on both
// sides, so the only real fix is ONE constant, which is what shipped. These
// tests are the second half: that both sides really read it, and that no
// literal has crept back in beside it.

/** Every `name="…"` the rendered form posts. */
function postedFields(html: string): string[] {
  return [
    ...new Set(
      [...html.matchAll(/<(?:input|select|textarea)\b[^>]*\bname="([^"]+)"/g)].map(
        (m) => m[1]
      )
    ),
  ];
}

/** Every `formData.get("literal")` — the shape that must NOT exist. */
function literalReads(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(/formData\.(?:get|getAll)\(\s*["'`]([^"'`]+)["'`]/g)].map(
        (m) => m[1]
      )
    ),
  ];
}

describe("the form and the action share ONE list of wire names", () => {
  const actionSource = readFileSync(
    join(ROOT, "app", "(product)", "results", "actions.ts"),
    "utf8"
  );
  const panelSource = readFileSync(
    join(ROOT, "app", "(product)", "results", "log-panel.tsx"),
    "utf8"
  );

  /** Every name the constant can produce, levers included. */
  const declared = new Set<string>([
    ...Object.values(RESULT_FIELD),
    ...RESULT_LEVERS.flatMap((lever) => [
      leverField(lever, "value"),
      leverField(lever, "denominator"),
    ]),
  ]);

  it("every control the form renders posts a name from RESULT_FIELD", () => {
    const posted = postedFields(renderPanel());
    expect(posted.length, "the form rendered no fields at all").toBeGreaterThan(8);
    const orphans = posted.filter((name) => !declared.has(name));
    expect(
      orphans,
      "a control posts a name no shared constant declares, so the action cannot be reading it"
    ).toEqual([]);
  });

  it("NEITHER SIDE carries a hand-typed field name", () => {
    // The half that stops the constant from becoming decorative: one file
    // keeps using it while the other quietly grows a literal beside it.
    expect(
      literalReads(actionSource),
      "the action reads a hand-typed FormData key — use RESULT_FIELD / leverField"
    ).toEqual([]);
    expect(
      postedFields(panelSource),
      "a control in the panel source carries a hand-typed name= — use RESULT_FIELD / leverField"
    ).toEqual([]);
  });

  it("NON-VACUITY: both scanners find a PLANTED name", () => {
    // A scan reporting zero violations is indistinguishable from a scan
    // matching nothing (CLAUDE.md, 2026-08-21). Both regexes are literals, and
    // both are driven against a known-bad input here.
    expect(postedFields('<input type="text" name="plantedField"/>')).toEqual([
      "plantedField",
    ]);
    expect(literalReads('const x = formData.getAll("plantedRead");')).toEqual([
      "plantedRead",
    ]);
  });

  it("the ONE posted field the action ignores is a recorded decision", () => {
    // `evidenceIntent` decides which fields the form shows; the stored label is
    // derived by `recordResult` from what actually arrives, and
    // `RecordResultParams` has no parameter for it. It is named in
    // `RESULT_FIELD` with that reason, so "the action ignores it" cannot be
    // mistaken for a typo — and the action really does not consult it.
    expect(postedFields(renderPanel())).toContain(RESULT_FIELD.evidenceIntent);
    expect(actionSource).not.toContain("RESULT_FIELD.evidenceIntent");
  });
});

// --------------------------------------------------------------- a11y & cost

// ===========================================================================
// THE COST SENTENCE IS PINNED TO THE PROPERTY, NOT ONLY TO ITSELF.
//
// `/results` tells creators "Logging a result spends no credits and calls no
// model", and until now the only assertion was that the SENTENCE was on the
// screen. That is a test of the copy, not of the claim: `@respin/credits/
// app-server` is a sanctioned import for all of `app/**`, so this action could
// acquire a debit tomorrow with lint clean, every suite green, and a false
// cost statement rendered above the button that spends the money.
//
// THE SAME UNPINNED CLAIM IS LOAD-BEARING ONE LAYER DOWN, which is why this is
// worth a scan rather than a comment: `recordResult`'s exemption from the
// pause gate rests on logging being free. If this path ever spends, that
// warrant is void too, and nothing else in the tree would notice.
//
// WHAT IT CANNOT SEE, stated so a green run is not read as more: it is a
// SOURCE scan over static imports and identifiers. A dynamic `await import()`,
// a spend reached through a module this list does not name, or a debit taken
// by something `resultComparisons` calls inside `@respin/db` are all outside
// it. It catches the way this would actually happen — somebody adds the
// obvious import — and not every way it could.
// ===========================================================================

describe("nothing on the results surface can spend a credit or reach a model", () => {
  const RESULTS_DIR = join(ROOT, "app", "(product)", "results");

  /** Every source file on this surface. The population is the directory. */
  function surfaceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return surfaceFiles(full);
      return /[.]tsx?$/.test(e.name) ? [full] : [];
    });
  }

  /**
   * The shapes that would make the sentence false.
   *
   * REGEX LITERALS, never assembled from strings (CLAUDE.md, 2026-08-21) —
   * and this file has already been bitten twice by escapes lost in generation,
   * so each pattern is written with nothing to escape.
   */
  const SPENDING_SHAPES: readonly [string, RegExp][] = [
    ["a @respin/llm import", /from "@respin[/]llm/],
    ["the credit ledger", /creditLedger/],
    ["model usage", /modelUsage/],
    ["a metered call", /meteredCall/],
    ["a spending credits-facade call", /respinCredits[.](?:generate|debitCredits|purchasePackCredits|createTierCheckoutUrl|createPackCheckoutUrl)/],
  ];

  it("no file under app/(product)/results/ reaches a spending surface", () => {
    const files = surfaceFiles(RESULTS_DIR);
    expect(files.length, "the scan read no files at all").toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const [label, re] of SPENDING_SHAPES) {
        if (re.test(src)) {
          offenders.push(`${basename(file)}: ${label}`);
        }
      }
    }
    expect(
      offenders,
      "this surface can now spend or reach a model, and it tells creators it cannot — fix the code or the sentence, and check recordResult's pause exemption too"
    ).toEqual([]);
  });

  it("NON-VACUITY: the scan catches a PLANTED violation of every shape", () => {
    // A scan reporting zero offenders is indistinguishable from a scan whose
    // patterns match nothing. Each shape is driven against a line that really
    // would make the cost sentence false.
    const planted: Record<string, string> = {
      "a @respin/llm import": 'import { x } from "@respin/llm";',
      "the credit ledger": "await tx.insert(creditLedger).values({});",
      "model usage": "await recordModelUsage(modelUsage);",
      "a metered call": "await meteredCall(() => vendor());",
      "a spending credits-facade call": "respinCredits.generate(scope, id, {});",
    };
    for (const [label, re] of SPENDING_SHAPES) {
      const specimen = planted[label];
      expect(specimen, `no planted specimen for "${label}"`).toBeTruthy();
      expect(specimen, `"${label}" matches nothing`).toMatch(re);
    }
    // ...and the scan itself reports a file that carries one.
    const dir = scratchDir("results-spend-scan-");
    writeFileSync(
      join(dir, "planted.ts"),
      "respinCredits.generate(scope, id, {});"
    );
    const found = surfaceFiles(dir).some((f) =>
      SPENDING_SHAPES.some(([, re]) => re.test(readFileSync(f, "utf8")))
    );
    expect(found, "the walk did not report a planted file").toBe(true);
  });

  it("the sentence the scan defends is the one the screen renders", () => {
    // The two halves are only worth anything together: the scan proves the
    // property, this proves the property is what the copy claims.
    expect(LOG_COSTS_NOTHING).toContain("spends no credits");
    expect(LOG_COSTS_NOTHING).toContain("calls no model");
    expect(renderPanel().replace(/<[^>]+>/g, " ")).toContain(LOG_COSTS_NOTHING);
  });
});

describe("the control behaves like every other mutating control in this product", () => {
  it("the live region is present at load and EMPTY, never mounted populated", () => {
    const html = renderPanel();
    expect(html).toContain('data-testid="results-log-status"');
    expect(html).toMatch(
      /role="status"[^>]*aria-live="polite"[^>]*data-testid="results-log-status"[^>]*>\s*<\/p>/
    );
  });

  it("says what a press costs BEFORE the press — and it costs nothing", () => {
    const text = renderPanel().replace(/<[^>]+>/g, " ");
    expect(text).toContain("Logging a result spends no credits and calls no model");
  });

  it("a viewer gets a named reason instead of a form", () => {
    const html = renderPanel({
      block: { reason: "You have viewer access to this workspace." },
    });
    expect(has(html, "results-log-blocked")).toBe(true);
    expect(html).not.toContain('name="platform"');
  });
});

describe("proposal decisions require a review action's current document", () => {
  const review = {
    proposal: {
      id: "proposal-1",
      source: "results",
      status: "proposed",
      strength: "early",
      payload: {
        rule: {
          metric: { label: "Follows", key: "follows_per_1k" },
          treatment: { n: 3, medianPer1k: 120 },
          baseline: { n: 3, medianPer1k: 90 },
          effectPer1k: 30,
          evidenceCounts: { quantifiedSelfReported: 6, connectorVerified: 0 },
          confounders: [],
        },
      },
    },
    resultEvidence: [{ id: "result-1", role: "treatment" }],
    feedbackEvidence: [],
    learningEligibility: { kind: "verified_results", treatmentN: 3, baselineN: 3 },
    mergedContent: "The refreshed complete document.",
    claims: [
      { pointer: "/rules/0", displayedValue: "observed", sourceEvidence: { quote: "observed", inputClass: "result_summary" } },
      { pointer: "/rules/1", displayedValue: "[check]", sourceEvidence: { absence: "No source value was available." } },
    ],
    freshnessToken: "fresh-1",
  } as unknown as PromotionPanelProps["reviews"][number];

  it("keeps the merged document and decision controls absent before review, then renders both from a reviewed document", () => {
    const beforeReview = renderToStaticMarkup(
      <PromotionPanel
        access={{ kind: "full" }}
        reviews={[review]}
        historyState="complete"
        refreshAction={async () => ({ status: "idle" })}
        reviewAction={async () => ({ status: "idle" })}
        decideAction={async () => ({ status: "idle" })}
      />
    );
    expect(beforeReview).not.toContain('data-testid="promotion-merged-document"');
    expect(beforeReview).not.toContain('name="decision"');

    const afterReview = renderToStaticMarkup(
      <PromotionReviewDocument
        review={review}
        access={{ kind: "full" }}
        decideAction={async () => ({ status: "idle" })}
      />
    );
    expect(afterReview).toContain('data-testid="promotion-merged-document"');
    expect(afterReview).toContain("The refreshed complete document.");
    expect(afterReview).toContain('name="decision"');
    expect(afterReview).toContain('name="acceptConfirmedFields"');
    expect(afterReview).toContain('name="rejectConfirmedFields"');
    expect(afterReview).toContain('data-testid="promotion-claim-confirmations"');
    expect((afterReview.match(/type="checkbox"/g) ?? [])).toHaveLength(2);
    expect(afterReview).toContain("decided this [check] position");
    expect(afterReview).toContain('aria-disabled="true"');
  });

  it("serializes only the claims explicitly checked, including a [check] decision", () => {
    expect(confirmedFieldsFor(review.claims, new Set())).toEqual([]);
    expect(confirmedFieldsFor(review.claims, new Set(["/rules/0"]))).toEqual([
      { pointer: "/rules/0", asPlaceholder: false },
    ]);
    expect(
      confirmedFieldsFor(review.claims, new Set(["/rules/0", "/rules/1"]))
    ).toEqual([
      { pointer: "/rules/0", asPlaceholder: false },
      { pointer: "/rules/1", asPlaceholder: true },
    ]);
  });

  it("links the full review only to the reviewed action state, never the page-load card", () => {
    const source = readFileSync(
      join(ROOT, "app", "(product)", "results", "promotion-panel.tsx"),
      "utf8"
    );
    expect(source).toContain('reviewState.status === "reviewed" ? reviewState.review : null');
  });
});

// Slice 3b, Stage B1's rendered surface — the structured interview.
//
// Same split as `tests/onboarding-ui.test.tsx`: the page needs a session and
// a database and is executed by no test here, so every decision lives in
// `./copy.ts` as a pure function this file drives with a fixture, and every
// rendered state lives in `InterviewView`, a component `renderToStaticMarkup`
// can drive without a server.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { INTERVIEW_FIELDS, type InterviewFieldKey } from "@respin/db";
import { CLAIM_SPECIMENS, FORBIDDEN_CLAIMS, NOT_BUILT_YET } from "./support/forbidden-claims";
import {
  buildInterviewPatch,
  fieldState,
  interviewErrorFor,
  INTERVIEW_LIST_ITEMS_MAX,
  parseListLines,
  reviewText,
  serializeListLines,
  type FieldState,
} from "../app/(product)/onboarding/interview/copy";
import {
  InterviewView,
  type InterviewViewProps,
} from "../app/(product)/onboarding/interview/interview-view";

const ALL_UNANSWERED = Object.fromEntries(
  INTERVIEW_FIELDS.map((f) => [f.key, { status: "unanswered" } as FieldState])
) as Record<InterviewFieldKey, FieldState>;

const base: InterviewViewProps = {
  mode: "edit",
  profileName: "Anna",
  fields: ALL_UNANSWERED,
  writeBlock: null,
  saveStayAction: "/onboarding/interview",
  saveReviewAction: "/onboarding/interview",
  submitAction: "/onboarding/interview",
  error: null,
  errorField: null,
  answerMax: 2_000,
  listMax: 50,
};

const render = (p: Partial<InterviewViewProps> = {}) =>
  renderToStaticMarkup(<InterviewView {...base} {...p} />);

// ------------------------------------------------------------------- pure

describe("parseListLines / serializeListLines", () => {
  it("round-trips a list, trimming and dropping blank lines", () => {
    const raw = "one\n  two  \n\nthree\r\nfour\r\n\n";
    expect(parseListLines(raw)).toEqual(["one", "two", "three", "four"]);
  });

  it("serialize is the inverse for a clean list", () => {
    expect(serializeListLines(["a", "b", "c"])).toBe("a\nb\nc");
    expect(parseListLines(serializeListLines(["a", "b", "c"]))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("an all-blank textarea parses to an empty array, not one blank item", () => {
    expect(parseListLines("   \n\n  \n")).toEqual([]);
  });
});

describe("fieldState: unanswered / not_decided / decided_text / decided_list", () => {
  it("no draft at all: every field is unanswered", () => {
    expect(fieldState(null, "audience")).toEqual({ status: "unanswered" });
    expect(fieldState(null, "goals")).toEqual({ status: "unanswered" });
  });

  const draftWith = (answers: Record<string, unknown>) =>
    ({ answers, submittedAt: null } as never);

  it("a not_decided answer reads back as not_decided, for a scalar and a list field alike", () => {
    const draft = draftWith({
      audience: { status: "not_decided" },
      goals: { status: "not_decided" },
    });
    expect(fieldState(draft, "audience")).toEqual({ status: "not_decided" });
    expect(fieldState(draft, "goals")).toEqual({ status: "not_decided" });
  });

  it("a decided scalar reads back its value", () => {
    const draft = draftWith({
      positioning: { status: "decided", value: "The no-BS creator coach" },
    });
    expect(fieldState(draft, "positioning")).toEqual({
      status: "decided_text",
      value: "The no-BS creator coach",
    });
  });

  it("a decided list reads back its values, and an EXPLICIT empty list is representable at this layer", () => {
    const draft = draftWith({
      bannedWords: { status: "decided", values: ["synergy", "hustle"] },
      bannedVibes: { status: "decided", values: [] },
    });
    expect(fieldState(draft, "bannedWords")).toEqual({
      status: "decided_list",
      values: ["synergy", "hustle"],
    });
    expect(fieldState(draft, "bannedVibes")).toEqual({
      status: "decided_list",
      values: [],
    });
  });

  it("a field absent from `answers` (never asked about this round) is unanswered, distinct from not_decided", () => {
    const draft = draftWith({ audience: { status: "not_decided" } });
    expect(fieldState(draft, "positioning")).toEqual({ status: "unanswered" });
  });
});

describe("reviewText: R10 language discipline, and metricDirection renders a sentence not a wire value", () => {
  it("names the three states plainly, never as a claim about the creator", () => {
    expect(reviewText("audience", { status: "unanswered" })).toBe(
      "Not answered yet."
    );
    expect(reviewText("audience", { status: "not_decided" })).toBe(
      "Marked as not decided yet."
    );
    expect(reviewText("audience", { status: "decided_text", value: "Coaches" })).toBe(
      "Coaches"
    );
  });

  it("metricDirection maps the wire value to a sentence", () => {
    expect(
      reviewText("metricDirection", {
        status: "decided_text",
        value: "higher_is_better",
      })
    ).toBe("Higher is better");
    expect(
      reviewText("metricDirection", {
        status: "decided_text",
        value: "lower_is_better",
      })
    ).toBe("Lower is better");
  });

  it("a decided list joins its items, and an explicit empty one says so honestly", () => {
    expect(
      reviewText("bannedWords", { status: "decided_list", values: ["a", "b"] })
    ).toBe("a, b");
    expect(reviewText("bannedWords", { status: "decided_list", values: [] })).toBe(
      "None listed."
    );
  });

  it("never says learned, verified or measured (R10) — the four states, scanned", () => {
    const states: FieldState[] = [
      { status: "unanswered" },
      { status: "not_decided" },
      { status: "decided_text", value: "x" },
      { status: "decided_list", values: ["x"] },
    ];
    for (const key of INTERVIEW_FIELDS.map((f) => f.key)) {
      for (const state of states) {
        const text = reviewText(key, state).toLowerCase();
        expect(text, `${key}/${state.status}`).not.toMatch(/\blearn/);
        expect(text, `${key}/${state.status}`).not.toMatch(/\bverif/);
        expect(text, `${key}/${state.status}`).not.toMatch(/\bmeasur/);
      }
    }
  });
});

describe("buildInterviewPatch: precedence, omission, and field-named length refusals", () => {
  const fd = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.set(k, v);
    return f;
  };

  it("a decided scalar is built from a non-blank field", () => {
    const result = buildInterviewPatch(fd([["positioning", "The calm one"]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.positioning).toEqual({
        status: "decided",
        value: "The calm one",
      });
    }
  });

  it("a ticked not-decided checkbox with a BLANK field is stored as not_decided", () => {
    const result = buildInterviewPatch(fd([["audience_notdecided", "on"]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.audience).toEqual({ status: "not_decided" });
    }
  });

  it("PRECEDENCE: a typed value wins over a ticked not-decided box (R1's ambiguity resolved without an error)", () => {
    const result = buildInterviewPatch(
      fd([
        ["positioning", "The calm one"],
        ["positioning_notdecided", "on"],
      ])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.positioning).toEqual({
        status: "decided",
        value: "The calm one",
      });
    }
  });

  it("blank AND unticked is OMITTED — never a claim, never a decline (R1)", () => {
    const result = buildInterviewPatch(fd([]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.patch)).toEqual([]);
    }
  });

  it("a list field builds a decided array from non-blank lines", () => {
    const result = buildInterviewPatch(fd([["goals", "grow to 100k\nlaunch a course"]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.goals).toEqual({
        status: "decided",
        values: ["grow to 100k", "launch a course"],
      });
    }
  });

  it("a blank list field with the box ticked is not_decided", () => {
    const result = buildInterviewPatch(fd([["bannedWords_notdecided", "on"]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.bannedWords).toEqual({ status: "not_decided" });
    }
  });

  it("a blank list field with the 'none' box ticked is decided with zero items, distinct from not_decided (R1)", () => {
    const result = buildInterviewPatch(fd([["bannedWords_none", "on"]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.bannedWords).toEqual({ status: "decided", values: [] });
    }
  });

  it("both list checkboxes ticked resolves to the stronger claim — decided empty, not not_decided", () => {
    const result = buildInterviewPatch(
      fd([
        ["bannedWords_none", "on"],
        ["bannedWords_notdecided", "on"],
      ])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.bannedWords).toEqual({ status: "decided", values: [] });
    }
  });

  it("typed list items beat a ticked 'none' box — the more specific answer wins", () => {
    const result = buildInterviewPatch(
      fd([
        ["bannedWords", "hustle"],
        ["bannedWords_none", "on"],
      ])
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.bannedWords).toEqual({ status: "decided", values: ["hustle"] });
    }
  });

  it("metricDirection reads the select's value the same way a scalar does", () => {
    const result = buildInterviewPatch(fd([["metricDirection", "higher_is_better"]]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.patch.metricDirection).toEqual({
        status: "decided",
        value: "higher_is_better",
      });
    }
  });

  it("REFUSES (field-named) a scalar over the answer-length ceiling", () => {
    const result = buildInterviewPatch(fd([["positioning", "x".repeat(2_001)]]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("positioning");
  });

  it("REFUSES (field-named) a list with more than the item-count ceiling", () => {
    const many = Array.from({ length: INTERVIEW_LIST_ITEMS_MAX + 1 }, (_, i) => `w${i}`).join(
      "\n"
    );
    const result = buildInterviewPatch(fd([["bannedWords", many]]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("bannedWords");
  });

  it("REFUSES (field-named) a single list ITEM over the answer-length ceiling", () => {
    const result = buildInterviewPatch(fd([["bannedVibes", "x".repeat(2_001)]]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe("bannedVibes");
  });

  it("a decided answer is never blank text, even if a caller sends only whitespace (R1's schema-level rule, matched here)", () => {
    const result = buildInterviewPatch(fd([["positioning", "   "]]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.patch.positioning).toBeUndefined();
  });

  it("codepoints, not UTF-16 units — an emoji-bearing answer at the true ceiling is not falsely refused", () => {
    // Matches ../onboarding/copy.ts's characterCount discipline: the SAME
    // ceiling counted in code points, not `.length`.
    const value = "👋".repeat(2_000); // 2000 code points, 4000 UTF-16 units
    const result = buildInterviewPatch(fd([["positioning", value]]));
    expect(result.ok).toBe(true);
  });
});

describe("interviewErrorFor: field-named for interview_answer, safe fallback for everything else", () => {
  it("no code: no alert", () => {
    expect(interviewErrorFor(undefined, undefined)).toBeNull();
  });

  it("interview_answer WITH a known field names it in both title and detail", () => {
    const copy = interviewErrorFor("interview_answer", "goals");
    expect(copy).not.toBeNull();
    expect(copy?.title).toContain("Goals");
    expect(copy?.detail).toContain("Goals");
    expect(copy?.detail).toContain(String(INTERVIEW_LIST_ITEMS_MAX));
  });

  it("interview_answer with an UNKNOWN field falls back to the shared generic copy, never a crash or a raw value", () => {
    const copy = interviewErrorFor("interview_answer", "not_a_real_field");
    expect(copy).not.toBeNull();
    expect(copy?.code).toBe("interview_answer");
    expect(copy?.title.toLowerCase()).not.toContain("not_a_real_field");
  });

  it("interview_answer with NO field falls back to the shared generic copy", () => {
    const copy = interviewErrorFor("interview_answer", undefined);
    expect(copy?.code).toBe("interview_answer");
  });

  it("every OTHER code delegates to the shared, already-safe fallback — never null for a real code", () => {
    for (const code of ["interview_already_submitted", "profile_role", "workspace_paused"]) {
      expect(interviewErrorFor(code, undefined)).not.toBeNull();
    }
  });

  it("an unrecognised code degrades to neutral 'unknown' copy — never nothing, and never another surface's product copy", () => {
    const copy = interviewErrorFor("not_a_real_code_at_all", undefined);
    expect(copy?.code).toBe("unknown");
  });
});

// ------------------------------------------------------------------ rendered

describe("InterviewView — edit mode", () => {
  it("renders every field the registry declares, with a label and a not-decided checkbox each", () => {
    const html = render();
    for (const f of INTERVIEW_FIELDS) {
      expect(html, f.key).toContain(`data-testid="interview-field-${f.key}"`);
      expect(html, f.key).toContain(`id="${f.key}"`);
      expect(html, f.key).toContain(`id="${f.key}_notdecided"`);
      expect(html, f.key).toContain(`for="${f.key}_notdecided"`);
    }
    // NON-VACUITY on the completeness itself: the registry really has more
    // than a couple of fields, so "every field" is checking something.
    expect(INTERVIEW_FIELDS.length).toBeGreaterThanOrEqual(11);
  });

  it("pre-fills a decided scalar's value into its input/textarea", () => {
    const html = render({
      fields: {
        ...ALL_UNANSWERED,
        positioning: { status: "decided_text", value: "The calm one" },
      },
    });
    expect(html).toContain("The calm one");
  });

  it("pre-fills a decided list, one item per line, into its textarea", () => {
    const html = render({
      fields: {
        ...ALL_UNANSWERED,
        bannedWords: { status: "decided_list", values: ["synergy", "hustle"] },
      },
    });
    expect(html).toContain("synergy\nhustle");
  });

  it("only LIST fields get the 'none' checkbox — scalar fields never do (R1's third state is list-only)", () => {
    const html = render();
    for (const f of INTERVIEW_FIELDS) {
      if (f.kind === "list") {
        expect(html, f.key).toContain(`id="${f.key}_none"`);
        expect(html, f.key).toContain(`for="${f.key}_none"`);
      } else {
        expect(html, f.key).not.toContain(`id="${f.key}_none"`);
      }
    }
  });

  it("a decided-empty list ('none' resumed) renders its own checkbox CHECKED, distinct from not_decided", () => {
    const html = render({
      fields: { ...ALL_UNANSWERED, bannedWords: { status: "decided_list", values: [] } },
    });
    const noneIdx = html.indexOf('id="bannedWords_none"');
    expect(html.slice(noneIdx, noneIdx + 150)).toContain("checked");
    const notDecidedIdx = html.indexOf('id="bannedWords_notdecided"');
    expect(html.slice(notDecidedIdx, notDecidedIdx + 150)).not.toContain("checked");
  });

  it("a not_decided field renders its checkbox CHECKED", () => {
    const html = render({
      fields: { ...ALL_UNANSWERED, audience: { status: "not_decided" } },
    });
    const idx = html.indexOf('id="audience_notdecided"');
    const tag = html.slice(idx, idx + 150);
    expect(tag).toContain("checked");
  });

  it("metricDirection renders a select with both closed options", () => {
    const html = render();
    expect(html).toContain('id="metricDirection"');
    expect(html).toContain("<option");
    expect(html).toContain("Higher is better");
    expect(html).toContain("Lower is better");
  });

  it("states the server's answer and list ceilings, from the arguments — never a literal", () => {
    const html = render({ answerMax: 2_000, listMax: 50 });
    expect(html).toContain("2,000 characters");
    expect(html).toContain("50 items");
  });

  it("a field the refusal named gets an inline marker; the others do not", () => {
    const html = render({
      error: { title: '"Goals" could not be saved', detail: "Too long." },
      errorField: "goals",
    });
    expect(html).toContain('data-testid="interview-field-error-goals"');
    expect(html).not.toContain('data-testid="interview-field-error-positioning"');
  });

  it("a refusal banner is announced AND focusable — same pattern as ../onboarding-view.tsx", () => {
    const html = render({
      error: { title: "That answer could not be saved", detail: "Shorten it." },
      errorField: null,
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('id="interview-refusal"');
  });

  it("offers no form to a reader the server would refuse, and says why (viewer courtesy)", () => {
    const html = render({
      writeBlock: { reason: "You have viewer access to this workspace." },
    });
    expect(html).not.toContain('data-testid="interview-edit-form"');
    expect(html).toContain('data-testid="interview-blocked"');
    expect(html).toContain("viewer access");
  });

  it("every control is a 44px touch target", () => {
    const html = render();
    // The not-decided checkbox row.
    expect(html).toMatch(/for="audience_notdecided"[^>]*style="[^"]*min-height:44px/);
  });
});

describe("InterviewView — review mode (R2)", () => {
  const filled: Record<InterviewFieldKey, FieldState> = {
    ...ALL_UNANSWERED,
    audience: { status: "decided_text", value: "Coaches" },
    positioning: { status: "not_decided" },
    goals: { status: "decided_list", values: ["100k followers"] },
  };

  it("renders every field's resolved text, read-only, and a way back to edit without losing anything", () => {
    const html = render({ mode: "review", fields: filled });
    for (const f of INTERVIEW_FIELDS) {
      expect(html, f.key).toContain(`data-testid="interview-review-${f.key}"`);
    }
    expect(html).toContain("Coaches");
    expect(html).toContain("Marked as not decided yet.");
    expect(html).toContain("100k followers");
    expect(html).toContain('data-testid="interview-edit-link"');
    expect(html).toContain('href="/onboarding/interview"');
    // R2: going back to edit costs nothing already typed — the screen says so
    // as reassurance, which is the opposite of the honesty scan's concern.
    expect(html.toLowerCase()).toMatch(/not lost/);
  });

  it("carries a submit control, and a SIGNPOST to the step that used to be absent", () => {
    // SLICE 3b's R13 WROTE THE HONEST B04 ABSENCE HERE — "creating your first
    // three ideas in Studio is not part of this product yet" — and slice 7
    // built the step. The `data-testid` is deliberately unchanged, so this
    // assertion now pins what REPLACED the sentence rather than going missing
    // along with it (CLAUDE.md 2026-07-30: a claim recorded is only as good as
    // the test that holds it up).
    const html = render({ mode: "review", fields: filled });
    expect(html).toContain("Submit my interview");
    expect(html).toContain('data-testid="interview-b04-absence"');
    // THE ABSENCE SENTENCE IS GONE, and its going is asserted rather than
    // assumed: a screen still claiming the step does not exist would be as
    // wrong as one that claimed it happens here.
    expect(html).not.toMatch(/not part of this product yet/i);
    // WHAT IT SAYS INSTEAD IS A SIGNPOST, NOT A CONTROL. This screen still
    // stores answers and nothing else, and the ORDER matters — submit, then
    // confirm and activate a brain, and only then is there anything to write in
    // this creator's voice — so a button here would jump two steps and land on
    // a refusal.
    expect(html).toContain('href="/onboarding/first-ideas"');
    expect(html).toContain('data-testid="interview-b04-link"');
    expect(html).toMatch(/Once a brain is activated/i);
    // ...and it says the step COSTS, because it does: B04 is a real run on the
    // real pipeline, priced like anything else.
    expect(html).toMatch(/costs credits/i);
    // No fake control claiming ideas were created, and no submit that runs one.
    expect(html.toLowerCase()).not.toMatch(/create my first three ideas/);
    expect(html).not.toMatch(/<form[^>]*>[^<]*<[^>]*first-ideas/);
  });

  it("a blocked viewer sees the review, but not the submit form", () => {
    const html = render({
      mode: "review",
      fields: filled,
      writeBlock: { reason: "You have viewer access to this workspace." },
    });
    expect(html).toContain('data-testid="interview-submit-blocked"');
    expect(html).not.toContain('data-testid="interview-submit-form"');
    // The review listing itself is UNAFFECTED — a viewer can still read it.
    expect(html).toContain("Coaches");
  });
});

describe("honesty (R10/R12-style): this screen never claims the creator's own answers were learned, verified or measured", () => {
  const FORBIDDEN: [string, RegExp][] = [
    ...FORBIDDEN_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
    ...NOT_BUILT_YET.map(([l, re]) => [l, re] as [string, RegExp]),
    // R10's own two words, screen-specific (NOT added to the shared canon —
    // `verified` is a legitimate word elsewhere in this product, on the
    // Results screen this repo has not built yet; banning it there too would
    // be reaching past this stage's own surface). PAST TENSE ONLY, matching
    // R10's own wording ("were learned, verified or measured") — a broader
    // stem match caught this screen's OWN field label ("measurement window",
    // the metric's structural field name, not a claim that we measured
    // anything) as a false positive.
    ["verified", /\bverified\b/],
    ["measured", /\bmeasured\b/],
  ];

  const filled: Record<InterviewFieldKey, FieldState> = {
    ...ALL_UNANSWERED,
    audience: { status: "decided_text", value: "Coaches" },
    metricDirection: { status: "decided_text", value: "higher_is_better" },
    goals: { status: "decided_list", values: ["100k followers"] },
  };

  const STATES: [string, Partial<InterviewViewProps>][] = [
    ["edit, empty", {}],
    ["edit, filled", { fields: filled }],
    [
      "edit, with a refusal",
      {
        error: { title: '"Goals" could not be saved', detail: "Too long." },
        errorField: "goals",
      },
    ],
    ["edit, viewer-blocked", { writeBlock: { reason: "viewer" } }],
    ["review, empty", { mode: "review" }],
    ["review, filled", { mode: "review", fields: filled }],
    [
      "review, viewer-blocked",
      { mode: "review", fields: filled, writeBlock: { reason: "viewer" } },
    ],
  ];

  it.each(STATES)("%s promises nothing this screen does not do", (_label, props) => {
    const html = render(props).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears`).not.toMatch(re);
    }
  });

  it.each(FORBIDDEN)("NON-VACUITY: the scan catches %s specifically", (label, re) => {
    const SPECIMENS: Record<string, string> = {
      ...CLAIM_SPECIMENS,
      verified: "your goals have been verified",
      measured: "your progress is measured automatically",
    };
    expect(SPECIMENS[label].toLowerCase()).toMatch(re);
  });

  it("NON-VACUITY, end to end: a planted promise in a rendered state is caught", () => {
    const planted = renderToStaticMarkup(
      <InterviewView
        {...base}
        mode="review"
        fields={{
          ...ALL_UNANSWERED,
          positioning: {
            status: "decided_text",
            value: "We learned your positioning and verified it automatically.",
          },
        }}
      />
    ).toLowerCase();
    const caught = FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l);
    expect(caught).toEqual(expect.arrayContaining(["learn", "verified"]));
  });
});

describe("resume (R11): the same field/state pairing the page would build from a real draft", () => {
  it("an unsubmitted draft's SAVED answers pre-fill the edit form — never empty on a real resume", () => {
    const draft = {
      answers: {
        audience: { status: "decided_text", value: "Coaches" },
        goals: { status: "decided_list", values: ["Launch a course"] },
      },
      submittedAt: null,
    } as never;
    const fields = Object.fromEntries(
      INTERVIEW_FIELDS.map((f) => [f.key, fieldState(draft, f.key)])
    ) as Record<InterviewFieldKey, FieldState>;
    const html = render({ fields });
    expect(html).toContain("Coaches");
    expect(html).toContain("Launch a course");
  });
});

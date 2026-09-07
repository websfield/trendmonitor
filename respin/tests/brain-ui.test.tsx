// Slice 3's rendered surface — the confirm-and-activate screen — extended by
// slice 3b (Stage B2) to `strategy` and `killtest`, plus coherent activation
// (R8).
//
// The page itself needs a session and a database and is executed by no test in
// this repo, which is why every decision lives in `copy.ts` as a pure function
// and every state lives in `brain-view.tsx` as a component a fixture drives.
// The same split `onboarding-ui.test.tsx` documents.
//
// WHAT THIS SUITE IS ACTUALLY FOR. This screen is the first in the product that
// states a belief about a person, and the two ways it can fail are not equally
// visible:
//
//   - RENDERING A RULE WITHOUT ITS QUOTE is a false claim about a creator with
//     the evidence one page away (R4/R10). Loud, and easy to test.
//   - RENDERING FEWER POSITIONS THAN THE ENUMERATOR is a DEAD END (R9):
//     activation refuses while any position is unconfirmed, so a screen that
//     shows four of five produces a document that can never activate, with no
//     error anywhere. Silent, and it is the one this file exists for.
//   - CLAIMING A CREATOR-AUTHORED DECLARATION WAS LEARNED, VERIFIED OR
//     MEASURED (R10) is a false claim of a different shape than R11's — R11 is
//     about missing evidence, this is about MISDESCRIBING evidence that is
//     genuinely there.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FORBIDDEN_CLAIMS } from "./support/forbidden-claims";
import {
  BRAIN_CONTENT_SCHEMAS,
  BrainDocumentLimitError,
  BrainEditBusyError,
  BrainEditLimitError,
  BrainEditUnchangedError,
  BrainReasonError,
  BrainVersionLimitError,
  CHECK,
  ClaimWalkError,
  ContentSchemaError,
  // The evidence annotation the SERVER writes (`EVIDENCE_UNVERIFIED_ANNOTATION`
  // in brain-ops.ts, re-exported for the projection). The honesty scan drives
  // the real sentence, so a rewrite of it into an affirmative claim reddens
  // here rather than passing against a fixture nobody ships.
  EXPORT_EVIDENCE_UNVERIFIED,
  KindNotYetWritableError,
  OnboardingInputLimitError,
  ProfileRoleError,
  enumerateClaimFields,
  type BrainClaimView,
  type BrainVersionView,
} from "@respin/db";
import { billingErrorCode } from "../app/(product)/billing-errors";
import {
  BRAIN_ERROR_CODES,
  BRAIN_EDIT_CHECK_COPY,
  BRAIN_EDIT_MEANING,
  BRAIN_EXPORT_JSON_COPY,
  BRAIN_EXPORT_MARKDOWN_COPY,
  COHERENT_ACTIVATE_MEANING,
  INTERVIEW_PLACEHOLDER_ABSENCE,
  KILLTEST_FIELD_LABELS,
  OPTIONAL_METRIC_BLANK_MEANING,
  PLACEHOLDER_ABSENCE,
  PROPOSED_INTRO,
  STRATEGY_FIELD_LABELS,
  STRATEGY_METRIC_FIELD_LABELS,
  VOICE_FIELD_LABELS,
  brainErrorFor,
  claimLabel,
  confirmProgress,
  isMetricPointer,
  killtestClaimLabel,
  quoteIntro,
  strategyClaimLabel,
} from "../app/(product)/brain/copy";
import {
  BrainView,
  selectCurrentBrainState,
  type BrainKindSectionData,
  type BrainViewProps,
} from "../app/(product)/brain/brain-view";
import { readConfirmations } from "../app/(product)/brain/confirmations";

const POSTED = new Date("2026-08-28T10:00:00Z");

const claim = (p: Partial<BrainClaimView> = {}): BrainClaimView => ({
  pointer: "/register",
  value: "Direct and plain, talking to one person.",
  isPlaceholder: false,
  quote: "I always write like I am talking to one person.",
  source: {
    inputId: "00000000-0000-7000-8000-000000000001",
    postedAt: POSTED,
    inputClass: "own_post",
  },
  confirmed: false,
  evidenceAnnotation: null,
  ...p,
});

/** A `strategy`/`killtest` claim: same shape, `creator_authored` evidence (R4). */
const interviewClaim = (p: Partial<BrainClaimView> = {}): BrainClaimView =>
  claim({
    pointer: "/audience",
    value: "Solo creators trying to grow on shorts.",
    quote: "Solo creators trying to grow on shorts.",
    source: {
      inputId: "00000000-0000-7000-8000-000000000002",
      postedAt: POSTED,
      inputClass: "creator_authored",
    },
    ...p,
  });

const version = (p: Partial<BrainVersionView> = {}): BrainVersionView => ({
  brainDocId: "00000000-0000-7000-8000-0000000000aa",
  version: 1,
  status: "proposed",
  // A SENTENCE `renderBrainReason` REALLY PRODUCES. The old fixture string
  // ("built from 3 of your posts") is one this server has never written, and
  // the absence sentence is now selected from the stored reason — so a fixture
  // whose reason no build could store would exercise only the fallback.
  reason: REASON_INFERRED,
  claims: [claim()],
  confirmedAt: null,
  activatedAt: null,
  supersededAt: null,
  replacedByVersion: null,
  createdAt: POSTED,
  updatedAt: POSTED,
  ...p,
});

/**
 * The two stored sentences `renderBrainReason` actually writes, as LITERALS.
 *
 * `/brain`'s absence sentence is selected by (kind, reason) — see
 * `screenAbsenceSentence` — so these are the fixture's real input, not
 * decoration. Written out rather than imported from the renderer: a fixture
 * computed by the same function the screen reads moves with a mutation.
 */
const REASON_INFERRED = "Version 1: inferred from 3 of your onboarding inputs.";
const REASON_EDITED = "Version 1: you edited this document.";

const EMPTY_SECTION: BrainKindSectionData = { proposed: null, active: null };

const base: BrainViewProps = {
  profileName: "Anna",
  voice: EMPTY_SECTION,
  strategy: EMPTY_SECTION,
  killtest: EMPTY_SECTION,
  voiceHistory: [],
  strategyHistory: [],
  killtestHistory: [],
  performanceHistory: [],
  proposalHistory: [],
  assetCounts: { brainVersions: 0, testedRules: 0, loggedResults: 0, feedback: 0 },
  interviewTouchedButUndrafted: { strategy: false, killtest: false },
  decideBlock: null,
  confirmVoiceAction: "/brain",
  confirmStrategyAction: "/brain",
  confirmKillTestAction: "/brain",
  editVoiceAction: "/brain/edit-voice",
  editStrategyAction: "/brain/edit-strategy",
  editKillTestAction: "/brain/edit-killtest",
  editMetricAction: "/brain/edit-metric",
  activateVoiceAction: "/brain",
  activateStrategyAction: "/brain",
  activateKillTestAction: "/brain",
  exportJsonHref: "/api/export?profile=profile-1&format=json",
  exportMarkdownHref: "/api/export?profile=profile-1&format=markdown",
  error: null,
};

const render = (p: Partial<BrainViewProps> = {}) =>
  renderToStaticMarkup(<BrainView {...base} {...p} />);

/** The rendered copy, with React's own form-replay bootstrap removed. */
function visibleCopy(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

describe("R6: strategy and killtest render through the SAME machinery as voice", () => {
  it("a strategy section shows the draft's claims, quotes and confirm controls", () => {
    const html = render({
      strategy: {
        proposed: version({
          brainDocId: "s1",
          claims: [interviewClaim({ pointer: "/audience" })],
        }),
        active: null,
      },
    });
    expect(html).toContain('data-testid="strategy-section"');
    expect(html).toContain("Your strategy");
    expect(html).toContain('data-pointer="/audience"');
    expect(html).toContain("Solo creators trying to grow on shorts.");
    expect(html).toContain('name="confirm:/audience"');
  });

  it("a killtest section shows the draft's claims, quotes and confirm controls", () => {
    const html = render({
      killtest: {
        proposed: version({
          brainDocId: "k1",
          claims: [
            interviewClaim({ pointer: "/bannedWords/0", value: "cringe" }),
          ],
        }),
        active: null,
      },
    });
    expect(html).toContain('data-testid="killtest-section"');
    expect(html).toContain("Your kill test");
    expect(html).toContain('data-pointer="/bannedWords/0"');
    expect(html).toContain('name="confirm:/bannedWords/0"');
  });

  it("all three sections render on one page, independently", () => {
    const html = render({
      voice: { proposed: version({ brainDocId: "v1" }), active: null },
      strategy: {
        proposed: version({ brainDocId: "s1", claims: [interviewClaim()] }),
        active: null,
      },
      killtest: EMPTY_SECTION,
    });
    expect(html).toContain('data-testid="voice-section"');
    expect(html).toContain('data-testid="strategy-section"');
    expect(html).toContain('data-testid="killtest-section"');
    // killtest has neither proposed nor active — its own named empty state.
    expect(html).toContain('data-testid="killtest-empty"');
  });
});

describe("interviewTouchedButUndrafted: a deliberate empty answer is distinct from never answering (tenancy gate finding, 2026-08-30)", () => {
  // THE GAP THIS CLOSES: a creator whose only killtest answer was "no banned
  // words" (a decided-EMPTY list) gets no document at all — `buildDocContents`
  // correctly avoids the alternative that would abort the whole submission —
  // but without this flag, `/brain` rendered the IDENTICAL "Nothing drafted
  // yet… Complete the interview" sentence a creator who never started the
  // interview sees. That tells someone who already answered to go do
  // something they already did, and their real decision (no banned words)
  // leaves no visible trace anywhere.

  // Extracts one `<section data-testid="{kind}-section">…</section>` block by
  // its OWN closing tag, not a fixed character window — a fixed window is
  // wide enough to spill into the NEXT section's markup on a short panel
  // (voice's empty state is short), which would let a false positive slip
  // past a substring check.
  function sectionHtml(html: string, kind: "voice" | "strategy" | "killtest"): string {
    const start = html.indexOf(`data-testid="${kind}-section"`);
    const closeTag = "</section>";
    const end = html.indexOf(closeTag, start);
    return html.slice(start, end + closeTag.length);
  }

  it("renders the ANSWERED-NOTHING-TO-STATE copy when the flag is true, never the generic 'complete the interview' copy", () => {
    const html = render({
      strategy: EMPTY_SECTION,
      killtest: EMPTY_SECTION,
      interviewTouchedButUndrafted: { strategy: false, killtest: true },
    });
    expect(html).toContain('data-testid="killtest-empty"');
    const killtestPanelHtml = sectionHtml(html, "killtest");
    expect(killtestPanelHtml).toContain("told us there was nothing to add");
    expect(killtestPanelHtml).not.toContain("Complete the interview");
  });

  it("renders the GENERIC copy when the flag is false, even with an empty section (never-started stays never-started)", () => {
    const html = render({
      strategy: EMPTY_SECTION,
      killtest: EMPTY_SECTION,
      interviewTouchedButUndrafted: { strategy: false, killtest: false },
    });
    const killtestPanelHtml = sectionHtml(html, "killtest");
    expect(killtestPanelHtml).toContain("Complete the interview");
    expect(killtestPanelHtml).not.toContain("told us there was nothing to add");
  });

  it("the flag is INDEPENDENT per target — strategy and killtest can disagree", () => {
    const html = render({
      strategy: EMPTY_SECTION,
      killtest: EMPTY_SECTION,
      interviewTouchedButUndrafted: { strategy: true, killtest: false },
    });
    expect(sectionHtml(html, "strategy")).toContain("told us there was nothing to add");
    expect(sectionHtml(html, "killtest")).toContain("Complete the interview");
  });

  it("does NOT apply to voice — voice has no interview-driven empty state to disambiguate", () => {
    // Sanity check that this mechanism is scoped to strategy/killtest only —
    // voice's empty state is always the posts-based one, unconditionally.
    const html = render({
      voice: EMPTY_SECTION,
      interviewTouchedButUndrafted: { strategy: true, killtest: true },
    });
    const voicePanelHtml = sectionHtml(html, "voice");
    expect(voicePanelHtml).toContain("Save some");
    expect(voicePanelHtml).not.toContain("told us there was nothing to add");
  });
});

describe("R9: the screen's claim set IS the enumerator's set (voice, strategy, killtest)", () => {
  // THE SILENT DEAD END. `activateBrainDoc` refuses while any position
  // `enumerateClaimFields` yields is unconfirmed, so a screen rendering a
  // different set produces a document that can never activate — and nothing
  // anywhere reports it. Each section derives its set from the version's
  // `claims`, and `claimsFor` in `packages/db` derives THAT from the same
  // enumerator the activation gate calls; this asserts the end of that chain
  // against a real enumeration rather than against a fixture that agrees by
  // construction.

  const voiceContent = {
    register: "Direct and plain.",
    sentenceRhythm: "Short, then one long one.",
    signatureMoves: ["Opens on a number.", "Ends on a question."],
    avoid: [CHECK],
  };

  it("voice: renders EVERY position the enumerator yields", () => {
    const positions = enumerateClaimFields("voice", voiceContent);
    expect(positions.length).toBe(5);
    const html = render({
      voice: {
        proposed: version({
          claims: positions.map((pointer, i) =>
            claim({
              pointer,
              value: i === positions.length - 1 ? CHECK : `value ${i}`,
              isPlaceholder: i === positions.length - 1,
              ...(i === positions.length - 1
                ? { quote: null, source: null }
                : {}),
            })
          ),
        }),
        active: null,
      },
    });
    for (const pointer of positions) {
      expect(html, `${pointer} is not rendered`).toContain(`data-pointer="${pointer}"`);
    }
    expect(html.match(/data-pointer="/g)).toHaveLength(positions.length);
  });

  // `strategy` is the sharper case: its claim set spans the general list AND
  // the metric panel (R7), rendered by TWO different `<ul>`s in the same
  // form. Splitting them is exactly the operation that could silently drop a
  // position — this proves it does not.
  const strategyContent = {
    audience: "Solo creators",
    positioning: CHECK,
    pillars: [],
    goals: ["Grow to 10k"],
    ambitions: [CHECK],
    metric: {
      key: "watch-time",
      label: "Average watch time",
      unit: "seconds",
      direction: "higher_is_better",
      platform: "TikTok",
    },
  };

  it("strategy: renders every position, split across the general list AND the metric panel", () => {
    const positions = enumerateClaimFields("strategy", strategyContent);
    // Non-vacuity: some positions are metric, some are not.
    expect(positions.some((p) => isMetricPointer(p))).toBe(true);
    expect(positions.some((p) => !isMetricPointer(p))).toBe(true);

    const html = render({
      strategy: {
        proposed: version({
          claims: positions.map((pointer) =>
            interviewClaim({
              pointer,
              value: "x",
              isPlaceholder: false,
            })
          ),
        }),
        active: null,
      },
    });
    for (const pointer of positions) {
      expect(html, `${pointer} is not rendered`).toContain(`data-pointer="${pointer}"`);
    }
    expect(html.match(/data-pointer="/g)).toHaveLength(positions.length);
    expect(html).toContain('data-testid="strategy-metric-panel"');
  });

  const killtestContent = {
    rules: [],
    bannedWords: ["cringe", CHECK],
    bannedVibes: [CHECK],
  };

  it("killtest: renders every position the enumerator yields", () => {
    const positions = enumerateClaimFields("killtest", killtestContent);
    const html = render({
      killtest: {
        proposed: version({
          claims: positions.map((pointer, i) =>
            interviewClaim({
              pointer,
              value: killtestContent.bannedWords[i] === CHECK ? CHECK : "x",
              isPlaceholder: pointer.includes("/1") || pointer === "/bannedVibes/0",
              ...(pointer.includes("/1") || pointer === "/bannedVibes/0"
                ? { quote: null, source: null }
                : {}),
            })
          ),
        }),
        active: null,
      },
    });
    for (const pointer of positions) {
      expect(html, `${pointer} is not rendered`).toContain(`data-pointer="${pointer}"`);
    }
    expect(html.match(/data-pointer="/g)).toHaveLength(positions.length);
  });
});

describe("the field labels are CLOSED and pinned to their schemas", () => {
  const claimKeys = (kind: "voice" | "strategy" | "killtest") =>
    Object.keys(
      (BRAIN_CONTENT_SCHEMAS[kind] as unknown as { shape: Record<string, unknown> })
        .shape
    );

  it("voice: names exactly the schema's claim-bearing keys — no more, no fewer", () => {
    const keys = claimKeys("voice").filter((k) => k !== "provenance");
    expect(Object.keys(VOICE_FIELD_LABELS).sort()).toEqual(keys.sort());
  });

  it("strategy: STRATEGY_FIELD_LABELS names every top-level key EXCEPT metric", () => {
    const keys = claimKeys("strategy").filter((k) => k !== "metric");
    expect(Object.keys(STRATEGY_FIELD_LABELS).sort()).toEqual(keys.sort());
  });

  it("strategy: STRATEGY_METRIC_FIELD_LABELS names every metric sub-field except the server-owned key", () => {
    const metricShape = (
      (BRAIN_CONTENT_SCHEMAS.strategy as unknown as {
        shape: { metric: { unwrap: () => { shape: Record<string, unknown> } } };
      }).shape.metric
    ).unwrap().shape;
    const keys = Object.keys(metricShape).filter((k) => k !== "key");
    expect(Object.keys(STRATEGY_METRIC_FIELD_LABELS).sort()).toEqual(keys.sort());
  });

  it("killtest: names exactly the schema's claim-bearing keys", () => {
    const keys = claimKeys("killtest");
    expect(Object.keys(KILLTEST_FIELD_LABELS).sort()).toEqual(keys.sort());
  });

  it("labels a scalar position, and a list position with a 1-BASED index", () => {
    expect(claimLabel("/register")).toBe(VOICE_FIELD_LABELS.register);
    expect(claimLabel("/signatureMoves/0")).toBe(
      `${VOICE_FIELD_LABELS.signatureMoves} (1)`
    );
    expect(strategyClaimLabel("/goals/2")).toBe(`${STRATEGY_FIELD_LABELS.goals} (3)`);
    expect(killtestClaimLabel("/bannedWords/0")).toBe(
      `${KILLTEST_FIELD_LABELS.bannedWords} (1)`
    );
  });

  it("strategyClaimLabel labels a metric sub-field from its two-segment pointer", () => {
    expect(strategyClaimLabel("/metric/label")).toBe(STRATEGY_METRIC_FIELD_LABELS.label);
    expect(strategyClaimLabel("/metric/direction")).toBe(
      STRATEGY_METRIC_FIELD_LABELS.direction
    );
  });

  it("returns NULL for an unknown key, and for /metric itself or a too-deep metric pointer", () => {
    expect(claimLabel("/newField")).toBeNull();
    expect(strategyClaimLabel("/newField")).toBeNull();
    expect(strategyClaimLabel("/metric")).toBeNull();
    expect(strategyClaimLabel("/metric/label/0")).toBeNull();
    expect(strategyClaimLabel("/metric/notAField")).toBeNull();
    expect(killtestClaimLabel("/newField/0")).toBeNull();
  });

  it("the VIEW refuses an unlabelled position rather than rendering it", () => {
    expect(() =>
      render({
        voice: {
          proposed: version({ claims: [claim({ pointer: "/nope" })] }),
          active: null,
        },
      })
    ).toThrow(/unlabelled claim position/);
    expect(() =>
      render({
        strategy: {
          proposed: version({ claims: [interviewClaim({ pointer: "/nope" })] }),
          active: null,
        },
      })
    ).toThrow(/unlabelled claim position/);
  });
});

describe("R4/R10: the quote's introduction names WHICH KIND of evidence it is", () => {
  it("quoteIntro reads differently for own_post and creator_authored", () => {
    expect(quoteIntro("own_post", "2026-08-28")).toMatch(/a post you saved/);
    expect(quoteIntro("creator_authored", "2026-08-28")).toMatch(/your own answer/i);
  });

  it("a voice claim's quote says 'a post you saved'", () => {
    const html = render({ voice: { proposed: version(), active: null } });
    expect(html).toContain("From a post you saved on 2026-08-28");
  });

  it("a strategy claim's quote says 'your own answer', never 'a post you saved'", () => {
    const html = render({
      strategy: { proposed: version({ claims: [interviewClaim()] }), active: null },
    });
    expect(html).toContain("Your own answer, from 2026-08-28");
    expect(html).not.toContain("a post you saved");
  });

  it("a quote is ESCAPED as text, never rendered as markup", () => {
    const html = render({
      voice: {
        proposed: version({
          claims: [claim({ quote: '<img src=x onerror="alert(1)">' })],
        }),
        active: null,
      },
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("a rule and its quote are in the SAME list item — not two lists", () => {
    const html = render({ voice: { proposed: version(), active: null } });
    const item = html.slice(
      html.indexOf('data-pointer="/register"'),
      html.indexOf("</li>")
    );
    expect(item).toContain('data-testid="claim-value"');
    expect(item).toContain('data-testid="claim-quote"');
  });
});

describe("R11: an undecided/ungrounded field is a NAMED ABSENCE, never a ratio or a zero", () => {
  const voicePlaceholder = version({
    claims: [claim({ value: CHECK, isPlaceholder: true, quote: null, source: null })],
  });
  const strategyPlaceholder = version({
    claims: [
      interviewClaim({ value: CHECK, isPlaceholder: true, quote: null, source: null }),
    ],
  });

  it("voice: renders the evidence-absence copy, distinct from the interview one", () => {
    const html = render({ voice: { proposed: voicePlaceholder, active: null } });
    expect(html).toContain(PLACEHOLDER_ABSENCE);
    expect(html).not.toContain(INTERVIEW_PLACEHOLDER_ABSENCE);
    expect(html).not.toContain('data-testid="claim-quote"');
    const claimRow = html.slice(
      html.indexOf('data-pointer="/register"'),
      html.indexOf("</li>", html.indexOf('data-pointer="/register"'))
    );
    // The read surface names the absence rather than printing the token. The
    // separate edit form legitimately exposes `[check]` as the editable value.
    expect(visibleCopy(claimRow)).not.toContain(CHECK);
  });

  it("strategy: renders the INTERVIEW absence copy — a different sentence from voice's", () => {
    const html = render({ strategy: { proposed: strategyPlaceholder, active: null } });
    expect(html).toContain(INTERVIEW_PLACEHOLDER_ABSENCE);
    expect(html).not.toContain(PLACEHOLDER_ABSENCE);
  });

  it("the interview absence attributes the gap to the creator's OWN undecided answer, never to a search failure", () => {
    // Different from voice's "we could not point to" — nobody searched
    // anything here; the creator was asked and has not decided yet.
    expect(INTERVIEW_PLACEHOLDER_ABSENCE.toLowerCase()).toMatch(/you left this undecided/);
    expect(INTERVIEW_PLACEHOLDER_ABSENCE.toLowerCase()).not.toMatch(
      /we could not point to a quote/
    );
  });

  // ---- C1: the absence is selected by (kind, REASON), never by kind alone ----

  it("voice: a [check] the CREATOR typed is not blamed on a failed search of ours", () => {
    const html = visibleCopy(
      render({
        voice: {
          proposed: version({ reason: REASON_EDITED, claims: [voicePlaceholder.claims[0]] }),
          active: null,
        },
      })
    ).toLowerCase();
    // PINNED TO THE WORDS, not to `screenAbsenceSentence`'s return value: an
    // assertion that reads the function it is checking moves with a
    // reason-blind mutation and stays green.
    expect(html).toContain("you left this unstated when you edited this version");
    expect(html).not.toContain("could not point to a quote");
    // ...and the control it offers is one this screen actually has.
    expect(html).toContain("edit it again to state it");
  });

  it("strategy: an edited version does not say the creator left it undecided in the interview", () => {
    const html = visibleCopy(
      render({
        strategy: {
          proposed: version({
            reason: REASON_EDITED,
            claims: [strategyPlaceholder.claims[0]],
          }),
          active: null,
        },
      })
    ).toLowerCase();
    expect(html).toContain("you left this unstated when you edited this version");
    expect(html).not.toContain("you left this undecided in the interview");
  });

  it("HISTORY: each version's absence sentence comes from ITS OWN reason, in one render", () => {
    // The two versions are on the page TOGETHER, so a selector that reads the
    // SECTION's kind instead of the VERSION's reason cannot satisfy both.
    const html = visibleCopy(
      render({
        voiceHistory: [
          version({
            brainDocId: "v2",
            version: 2,
            reason: REASON_EDITED,
            claims: [voicePlaceholder.claims[0]],
          }),
          version({
            brainDocId: "v1",
            version: 1,
            status: "superseded",
            supersededAt: POSTED,
            replacedByVersion: 2,
            reason: REASON_INFERRED,
            claims: [voicePlaceholder.claims[0]],
          }),
        ],
      })
    ).toLowerCase();
    expect(html).toContain("you left this unstated when you edited this version");
    expect(html).toContain("could not point to a quote");
  });

  it("a stored reason this build cannot classify claims NOTHING about whose absence it is", () => {
    const html = visibleCopy(
      render({
        voice: {
          proposed: version({
            reason: "something nobody rendered",
            claims: [voicePlaceholder.claims[0]],
          }),
          active: null,
        },
      })
    ).toLowerCase();
    expect(html).toContain("this position is recorded as not stated");
    expect(html).not.toContain("could not point to a quote");
    expect(html).not.toContain("you left this undecided in the interview");
  });

  it("never renders a ratio, a percentage or a count of the creator's posts", () => {
    const html = visibleCopy(render({ voice: { proposed: voicePlaceholder, active: null } }));
    expect(html).not.toMatch(/%/);
    expect(html).not.toMatch(/\d+\s+of\s+your\s+\d+/i);
    expect(html).not.toMatch(/\bconfiden/i);
  });

  it("its checkbox says 'still unknown', not 'this is right'", () => {
    const html = render({ voice: { proposed: voicePlaceholder, active: null } });
    expect(html).toContain("leave this as still unknown");
    expect(html).not.toContain("this is right");
  });
});

describe("R12: what was SHOWN travels with the decision (shared readConfirmations)", () => {
  it("submits the placeholder state the screen displayed, per position", () => {
    const html = render({
      voice: {
        proposed: version({
          claims: [
            claim({ pointer: "/register" }),
            claim({
              pointer: "/sentenceRhythm",
              value: CHECK,
              isPlaceholder: true,
              quote: null,
              source: null,
            }),
          ],
        }),
        active: null,
      },
    });
    expect(html).toMatch(/name="shown:\/register"[^>]*value="stated"/);
    expect(html).toMatch(/name="shown:\/sentenceRhythm"[^>]*value="unknown"/);
  });

  it("readConfirmations pairs each tick with the state that was shown", () => {
    const fd = new FormData();
    fd.set("confirm:/register", "on");
    fd.set("shown:/register", "stated");
    fd.set("confirm:/avoid/0", "on");
    fd.set("shown:/avoid/0", "unknown");
    expect(readConfirmations(fd)).toEqual([
      { pointer: "/register", asPlaceholder: false },
      { pointer: "/avoid/0", asPlaceholder: true },
    ]);
  });

  it("an UNTICKED position is simply absent — never a decision", () => {
    const fd = new FormData();
    fd.set("shown:/register", "stated");
    expect(readConfirmations(fd)).toEqual([]);
  });
});

describe("R8: activation is COHERENT — one action, and it says so", () => {
  const confirmedVoice = version({
    claims: [claim({ confirmed: true }), claim({ pointer: "/avoid/0", confirmed: true })],
  });
  const confirmedStrategy = version({
    brainDocId: "s1",
    claims: [interviewClaim({ confirmed: true })],
  });

  it("each kind's activate button posts to its OWN bound action", () => {
    const html = render({
      voice: { proposed: confirmedVoice, active: null },
      strategy: { proposed: confirmedStrategy, active: null },
      activateVoiceAction: "/brain/activate-voice",
      activateStrategyAction: "/brain/activate-strategy",
    });
    expect(html).toContain('action="/brain/activate-voice"');
    expect(html).toContain('action="/brain/activate-strategy"');
  });

  it("states the activation is of the WHOLE coherent brain, not just this document", () => {
    const html = render({ voice: { proposed: confirmedVoice, active: null } });
    expect(html).toContain('data-testid="voice-activate-meaning"');
    expect(html).toContain(COHERENT_ACTIVATE_MEANING);
    expect(COHERENT_ACTIVATE_MEANING.toLowerCase()).toMatch(/whole creator brain/);
    expect(COHERENT_ACTIVATE_MEANING.toLowerCase()).toMatch(/voice, strategy and kill test/i);
  });

  it("the SAME coherent-activation sentence appears for strategy and killtest too", () => {
    const html = render({ strategy: { proposed: confirmedStrategy, active: null } });
    expect(html).toContain('data-testid="strategy-activate-meaning"');
    expect(html).toContain(COHERENT_ACTIVATE_MEANING);
  });

  it("is its own form and its own button, never a second effect of confirming", () => {
    const html = render({ voice: { proposed: confirmedVoice, active: null } });
    expect(html).toContain("Activate my Creator Brain");
    expect(html).toContain("Record my decisions");
    const decisionPanel = html.slice(
      html.indexOf("A draft, for you to check"),
      html.indexOf('data-testid="voice-edit-panel"')
    );
    expect(decisionPanel.match(/<form/g)).toHaveLength(2);
  });

  it("is NOT offered while any position is unconfirmed (a courtesy, not the gate)", () => {
    const html = render({
      voice: {
        proposed: version({
          claims: [claim({ confirmed: true }), claim({ pointer: "/avoid/0" })],
        }),
        active: null,
      },
    });
    expect(html).not.toContain("Activate my Creator Brain");
    expect(html).toContain('data-testid="voice-confirm-progress"');
    expect(html).toMatch(/1 of 2 confirmed/);
  });

  it("confirmProgress counts, and pluralises the remainder", () => {
    expect(confirmProgress(4, 4)).toMatch(/All 4 confirmed/);
    expect(confirmProgress(4, 3)).toMatch(/1 still needs your decision/);
    expect(confirmProgress(4, 2)).toMatch(/2 still need your decision/);
  });
});

describe("the states a fixture must be able to reach", () => {
  it("nothing drafted, for any kind: says so, and points at where to start", () => {
    const html = render();
    expect(html).toContain('data-testid="voice-empty"');
    expect(html).toContain('data-testid="strategy-empty"');
    expect(html).toContain('data-testid="killtest-empty"');
    expect(html).toContain('href="/onboarding"');
  });

  it("a VIEWER is told why, and gets no decision control at all, in every section", () => {
    const html = render({
      voice: { proposed: version(), active: null },
      strategy: { proposed: version({ claims: [interviewClaim()] }), active: null },
      decideBlock: { reason: "You have viewer access to this workspace." },
    });
    expect(html).toContain('data-testid="voice-decide-blocked"');
    expect(html).toContain('data-testid="strategy-decide-blocked"');
    expect(html).not.toContain("Record my decisions");
    expect(html).not.toContain("Activate my Creator Brain");
    // ...but the rules and their quotes are still READABLE. A viewer may see
    // what the product believes; they may not decide it.
    expect(html).toContain('data-testid="claim-quote"');
  });

  it("an ACTIVE version renders as a record, with no checkboxes", () => {
    const html = render({
      voice: {
        proposed: null,
        active: version({
          status: "active",
          activatedAt: new Date("2026-08-29T09:00:00Z"),
          claims: [claim({ confirmed: true })],
        }),
      },
    });
    expect(html).toContain("In force now");
    expect(html).toContain("activated on 2026-08-29");
    expect(html).toContain('data-testid="claim-recorded"');
    expect(html).not.toContain('type="checkbox"');
  });

  it("keeps a stale proposed v1 history-only when active v2 is already in force", () => {
    const activeV2 = version({
      brainDocId: "active-v2",
      version: 2,
      status: "active",
      activatedAt: POSTED,
      claims: [claim({ value: "Active v2", quote: "Active v2", confirmed: true })],
    });
    const staleProposedV1 = version({
      brainDocId: "stale-proposed-v1",
      version: 1,
      status: "proposed",
      claims: [claim({ value: "Stale proposed v1", quote: "Stale proposed v1" })],
    });
    const history = [activeV2, staleProposedV1];
    const current = selectCurrentBrainState(history);

    expect(current).toEqual({ proposed: null, active: activeV2 });
    expect(current.proposed?.brainDocId).toBeUndefined();
    expect((current.proposed ?? current.active)?.brainDocId).toBe("active-v2");

    const html = render({
      voice: current,
      voiceHistory: history,
      confirmVoiceAction: "/brain/confirm-stale-v1",
      editVoiceAction: "/brain/edit-active-v2",
      activateVoiceAction: "/brain/activate-stale-v1",
    });
    expect(html).toContain("In force now");
    expect(html).not.toContain("A draft, for you to check");
    expect(html).not.toContain("Record my decisions");
    expect(html).not.toContain("Activate my Creator Brain");
    expect(html).not.toContain('action="/brain/confirm-stale-v1"');
    expect(html).not.toContain('action="/brain/activate-stale-v1"');
    expect(html).toContain('action="/brain/edit-active-v2"');
    expect(html).toContain("Stale proposed v1");
    expect(html).toContain('data-version="1"');
    expect(html).not.toContain('type="checkbox"');
  });

  it("keeps a normal proposed v2 actionable when active v1 is in force", () => {
    const proposedV2 = version({
      brainDocId: "proposed-v2",
      version: 2,
      claims: [claim({ value: "Proposed v2", quote: "Proposed v2" })],
    });
    const activeV1 = version({
      brainDocId: "active-v1",
      version: 1,
      status: "active",
      activatedAt: POSTED,
      claims: [claim({ value: "Active v1", quote: "Active v1", confirmed: true })],
    });
    const current = selectCurrentBrainState([proposedV2, activeV1]);

    expect(current).toEqual({ proposed: proposedV2, active: activeV1 });
    const html = render({
      voice: current,
      voiceHistory: [proposedV2, activeV1],
      confirmVoiceAction: "/brain/confirm-v2",
      editVoiceAction: "/brain/edit-v2",
      activateVoiceAction: "/brain/activate-v2",
    });
    expect(html).toContain("A draft, for you to check");
    expect(html).toContain("In force now");
    expect(html).toContain('action="/brain/confirm-v2"');
    expect(html).toContain('action="/brain/edit-v2"');
  });

  it("a refusal is rendered, announced and FOCUSED (it arrives by redirect)", () => {
    const html = render({
      error: { title: "That was not recorded", detail: "Reload and try again." },
    });
    expect(html).toContain('data-testid="brain-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('id="brain-refusal"');
    expect(html).toContain('tabindex="-1"');
  });
});

describe("slice 5: editing, ordered history and export stay honest", () => {
  it("renders every history version in facade order, read-only, with quotes and replacement metadata", () => {
    const history = [
      version({
        brainDocId: "v3",
        version: 3,
        status: "proposed",
        createdAt: new Date("2026-08-30T09:00:00Z"),
        claims: [claim({ value: "Current draft", quote: "Current draft" })],
      }),
      version({
        brainDocId: "v2",
        version: 2,
        status: "superseded",
        createdAt: new Date("2026-08-29T09:00:00Z"),
        supersededAt: new Date("2026-08-30T09:00:00Z"),
        replacedByVersion: 3,
        claims: [claim({ value: "Second version", quote: "Second version", confirmed: true })],
      }),
      version({
        brainDocId: "v1",
        version: 1,
        status: "superseded",
        createdAt: new Date("2026-08-28T09:00:00Z"),
        supersededAt: new Date("2026-08-29T09:00:00Z"),
        replacedByVersion: 2,
        claims: [claim({ value: "First version", quote: "First version", confirmed: true })],
      }),
    ];
    const html = render({ voiceHistory: history });
    expect(html.match(/data-testid="voice-history-version"/g)).toHaveLength(3);
    expect(html.indexOf('data-version="3"')).toBeLessThan(html.indexOf('data-version="2"'));
    expect(html.indexOf('data-version="2"')).toBeLessThan(html.indexOf('data-version="1"'));
    expect(html).toContain("Status: superseded. Created 2026-08-29.");
    expect(html).toContain("Replaced by version 3 on 2026-08-30.");
    expect(html).toContain("Replaced by version 2 on 2026-08-29.");
    expect(html).toContain("Second version");
    expect(html).toContain("First version");
    expect(html).toContain('data-testid="claim-quote"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain('data-testid="voice-edit-form"');
  });

  it("still renders the superseded timestamp when replacement attribution is unavailable", () => {
    const html = render({
      voiceHistory: [
        version({
          status: "superseded",
          supersededAt: new Date("2026-08-30T09:00:00Z"),
          replacedByVersion: null,
        }),
      ],
    });

    expect(html).toContain(
      "This version was replaced on 2026-08-30; the replacement version is unavailable."
    );
  });

  it("annotates unreadable historical evidence instead of taking the history surface down", () => {
    const html = render({
      voiceHistory: [
        version({
          status: "superseded",
          supersededAt: POSTED,
          claims: [
            claim({
              quote: null,
              evidenceAnnotation:
                "this quote could not be verified against the stored post",
            }),
          ],
        }),
      ],
    });
    expect(html).toContain('data-testid="evidence-annotation"');
    expect(html).toContain("this quote could not be verified against the stored post");
    expect(html).toContain('data-testid="voice-history-version"');
  });

  it("keeps an annotated current draft readable and editable, but never confirmable or activatable", () => {
    const affected = version({
      claims: [
        claim({
          quote: null,
          evidenceAnnotation:
            "this quote could not be verified against the stored post",
        }),
      ],
    });
    const html = render({
      voice: { proposed: affected, active: null },
      voiceHistory: [affected],
    });
    expect(html).toContain('data-testid="voice-evidence-blocked"');
    expect(html).toContain('data-testid="voice-edit-form"');
    expect(html).not.toContain("Record my decisions");
    expect(html).not.toContain("Activate my Creator Brain");
  });

  it("gives an editor one complete edit form for the document's actual claim positions", () => {
    const html = render({
      voice: {
        proposed: version({
          claims: [
            claim({ pointer: "/register" }),
            claim({ pointer: "/sentenceRhythm", value: CHECK, isPlaceholder: true, quote: null, source: null }),
          ],
        }),
        active: null,
      },
      editVoiceAction: "/brain/edit-bound-voice",
    });
    expect(html).toContain('data-testid="voice-edit-form"');
    expect(html).toContain('action="/brain/edit-bound-voice"');
    expect(html).toContain('name="edit:/register"');
    expect(html).toContain('name="edit:/sentenceRhythm"');
    expect(html).toContain(BRAIN_EDIT_MEANING);
    expect(html).toContain(BRAIN_EDIT_CHECK_COPY);
    expect(html).toContain("Create a replacement draft");
  });

  it("renders declared-metric editing as its own structured, versioned form", () => {
    const html = render({
      strategy: {
        proposed: version({
          claims: [
            interviewClaim({ pointer: "/audience" }),
            interviewClaim({ pointer: "/metric/label", value: "Watch time" }),
            interviewClaim({ pointer: "/metric/unit", value: "seconds" }),
            interviewClaim({ pointer: "/metric/direction", value: "higher_is_better" }),
            interviewClaim({ pointer: "/metric/platform", value: "YouTube" }),
            interviewClaim({ pointer: "/metric/window", value: "28 days" }),
          ],
        }),
        active: null,
      },
      editMetricAction: "/brain/edit-bound-metric",
    });
    expect(html).toContain('data-testid="strategy-metric-edit-form"');
    expect(html).toContain('action="/brain/edit-bound-metric"');
    expect(html).toContain('name="metric:label"');
    expect(html).toContain('name="metric:unit"');
    expect(html).toContain('name="metric:direction"');
    expect(html).toContain('name="metric:platform"');
    expect(html).toContain('name="metric:window"');
    // G1 — WHAT BLANK MEANS, corrected. The sentence used to say "Leave blank
    // to record this as [check]", which described neither the creator's answer
    // ("I am not naming one") nor what the product stores for it (an unstated
    // position, the same shape the interview writes for a declined optional).
    // Asserted against the constant, and asserted NEGATIVELY against the old
    // wording, because the old wording is the defect and a partial revert
    // would otherwise pass.
    expect(html).toContain(OPTIONAL_METRIC_BLANK_MEANING);
    expect(html).not.toContain(`Leave blank to record this as ${CHECK}.`);
    expect(OPTIONAL_METRIC_BLANK_MEANING).toMatch(/not naming one/i);
  });

  it("does not invent a direction when the stored declared metric has none", () => {
    const html = render({
      strategy: {
        proposed: version({
          claims: [
            interviewClaim({ pointer: "/metric/label", value: "Watch time" }),
            interviewClaim({ pointer: "/metric/unit", value: "seconds" }),
          ],
        }),
        active: null,
      },
      editMetricAction: "/brain/edit-bound-metric",
    });

    expect(html).toContain('<option value="" disabled="" selected="">Choose a direction</option>');
    expect(html).not.toContain('<option value="higher_is_better" selected="">');
    expect(html).not.toContain('<option value="lower_is_better" selected="">');
  });

  it("a viewer sees history and export, but no edit, confirm or activate form", () => {
    const doc = version();
    const html = render({
      voice: { proposed: doc, active: null },
      voiceHistory: [doc],
      decideBlock: { reason: "Viewer access cannot change this creator's brain." },
    });
    expect(html).toContain('data-testid="voice-history-version"');
    expect(html).toContain('data-testid="brain-export-panel"');
    expect(html).not.toContain('data-testid="voice-edit-form"');
    expect(html).not.toContain("Record my decisions");
    expect(html).not.toContain("Activate my Creator Brain");
  });

  it("a pause blocks edit controls but leaves both export formats available", () => {
    const html = render({
      voice: { proposed: version(), active: null },
      decideBlock: { reason: "This workspace is paused." },
    });
    expect(html).toContain('data-testid="voice-edit-blocked"');
    expect(html).not.toContain('data-testid="voice-edit-form"');
    expect(html).toContain("format=json");
    expect(html).toContain("format=markdown");
  });

  it("states the two export contracts and exposes actionable all-check and echo refusals", () => {
    const html = render();
    expect(html).toContain(BRAIN_EXPORT_JSON_COPY);
    expect(html).toContain(BRAIN_EXPORT_MARKDOWN_COPY);
    expect(brainErrorFor("brain-edit-all-check")!.detail).toMatch(/at least one rule stated/i);
    expect(brainErrorFor("reference_echo")!.detail).toMatch(/rewrite.*own words/i);
  });

  // G3 — THE NO-OP REFUSAL SAYS WHAT HAPPENED, and the assertion is
  // negative on purpose: the defect was not a missing sentence, it was the
  // WRONG one. `/brain` overrides `provenance` with the STALE-BASE copy
  // ("what this page showed you and what the server holds no longer
  // agree ... reload the page"), and an unchanged submission — every press
  // of the metric form that altered nothing — landed on it. The creator was
  // sent to reload a page that was never stale.
  it("G3: a submission that changed nothing does not borrow the stale-page copy", () => {
    const unchanged = brainErrorFor("brain_edit_unchanged")!;
    const stale = brainErrorFor("provenance")!;
    expect(unchanged).not.toEqual(stale);
    expect(unchanged).not.toEqual(brainErrorFor("unknown"));
    // The stale copy's two load-bearing instructions must NOT appear here.
    expect(unchanged.detail).not.toMatch(/no longer agree/i);
    expect(unchanged.detail).not.toMatch(/reload/i);
    // ...and it must name the act the creator can actually take.
    expect(unchanged.detail).toMatch(/change at least one field/i);
    // The stale copy is unchanged and still says its own thing, so this is
    // a SPLIT and not a rewrite of the sentence that was already correct.
    expect(stale.detail).toMatch(/no longer agree/i);  });
});

describe("the refusal channel is CLOSED, like every other surface's", () => {
  // Independent call-graph fixture for the ordinary edit action. This list is
  // deliberately not derived from BRAIN_ERROR_CODES: it catches an omitted UI
  // code instead of agreeing with the omission.
  const ORDINARY_EDIT_REACHABLE_CODES = [
    "profile_role",
    "brain_edit_busy",
    "brain-edit-all-check",
    // G3 — easy to reach from the metric form, which posts all five metric
    // positions on every press whether or not the creator changed one.
    "brain_edit_unchanged",
    "brain_edit_limit",
    "brain_document_limit",
    "brain_version_limit",
    "onboarding_input_limit",
    "brain_content_schema",
    "brain_kind_not_writable",
    "brain_claim_walk",
    "brain_reason",
    "provenance",
    "reference_echo",
    "brain_content_walk",
    "segmenter_unavailable",
    "workspace_paused",
    "profile_access",
    "scope_forgery",
    "workspace_access",
  ] as const;

  const NEW_TYPED_EDIT_REFUSALS = [
    [new BrainEditBusyError(), "brain_edit_busy"],
    [new BrainEditUnchangedError(), "brain_edit_unchanged"],
    [new BrainEditLimitError("too large"), "brain_edit_limit"],
    [new BrainDocumentLimitError("too large"), "brain_document_limit"],
    [new BrainVersionLimitError(200), "brain_version_limit"],
    [new OnboardingInputLimitError("too large"), "onboarding_input_limit"],
    [new ProfileRoleError("edit this brain document", "viewer"), "profile_role"],
    [new ContentSchemaError("voice", "register is too long"), "brain_content_schema"],
    [new KindNotYetWritableError("performance_meta"), "brain_kind_not_writable"],
    [new ClaimWalkError("/register", "string", {}), "brain_claim_walk"],
    [new BrainReasonError("untrusted"), "brain_reason"],
  ] as const;

  it("pins the ordinary edit call graph independently from the screen allowlist", () => {
    expect(BRAIN_ERROR_CODES).toEqual(
      expect.arrayContaining([...ORDINARY_EDIT_REACHABLE_CODES])
    );
    for (const code of ORDINARY_EDIT_REACHABLE_CODES) {
      expect(brainErrorFor(code), code).not.toEqual(brainErrorFor("unknown"));
    }
  });

  it.each(NEW_TYPED_EDIT_REFUSALS)(
    "%s maps through the shared class table to %s and has Brain copy",
    (error, code) => {
      expect(billingErrorCode(error)).toBe(code);
      expect(BRAIN_ERROR_CODES).toContain(code);
      const copy = brainErrorFor(code)!;
      expect(copy).not.toEqual(brainErrorFor("unknown"));
      expect(`${copy.title} ${copy.detail}`).toMatch(/brain|document|replacement/i);
    }
  );

  it("renders copy for every code this screen's actions can emit", () => {
    for (const code of BRAIN_ERROR_CODES) {
      const copy = brainErrorFor(code);
      expect(copy, code).not.toBeNull();
      expect(copy!.detail.length, code).toBeGreaterThan(40);
    }
  });

  it("an unrecognised code degrades to NEUTRAL copy, never to nothing", () => {
    const copy = brainErrorFor("not_a_real_code");
    expect(copy).not.toBeNull();
    expect(copy).toEqual(brainErrorFor("unknown"));
  });

  it("no `?e=` code renders another surface's product copy", () => {
    const copy = brainErrorFor("already_subscribed");
    expect(copy).toEqual(brainErrorFor("unknown"));
  });

  it("no code is empty and every one names something the reader can do", () => {
    for (const code of BRAIN_ERROR_CODES) {
      const copy = brainErrorFor(code)!;
      expect(copy.title.length, code).toBeGreaterThan(8);
    }
  });
});

describe("G4: a section intro never claims an origin the version does not have", () => {
  // THE DEFECT. The three `proposedIntro` strings named where the draft came
  // from — "from the posts you saved and told us you wrote" for voice, "built
  // directly from what you told us in the interview — nothing here is
  // inferred" for strategy and killtest — and were rendered above EVERY
  // proposed version, including one whose stored reason is `creator_edit`. A
  // creator who edits a field and reads the resulting draft is told a model
  // read their posts, or that the interview produced it. On the screen whose
  // whole job is provenance, that is the provenance itself being wrong.
  const ORIGIN_CLAIMS: [string, RegExp][] = [
    ["from the posts you saved", /posts you saved and told us you wrote/i],
    ["built from the interview", /built directly from what you told us in the interview/i],
    ["nothing here is inferred", /nothing here is inferred/i],
    ["next to your own answer", /next to your own answer/i],
  ];

  it.each(["voice", "strategy", "killtest"] as const)(
    "%s's intro claims no origin of its own",
    (kind) => {
      const intro = PROPOSED_INTRO[kind]("Anna");
      for (const [label, re] of ORIGIN_CLAIMS) {
        expect(intro, `"${label}" is asserted for every version`).not.toMatch(re);
      }
      expect(intro).toContain("Anna");
      expect(intro).toMatch(/nothing here is in force/i);
    }
  );

  it("NON-VACUITY: the origin scan would catch each retired sentence", () => {
    const retired = [
      "These are rules we drafted about how Anna writes, from the posts you saved and told us you wrote.",
      "This is Anna's strategy, built directly from what you told us in the interview — nothing here is inferred. Read each one next to your own answer.",
    ].join(" ");
    expect(ORIGIN_CLAIMS.filter(([, re]) => re.test(retired)).map(([l]) => l)).toEqual(
      ORIGIN_CLAIMS.map(([l]) => l)
    );
  });

  it("a creator_edit version is introduced by ITS OWN reason, not by an inherited origin", () => {
    // The origin is still on the page — twice, and both times derived. The
    // version's server-rendered `reason` sits directly under the intro, and
    // each claim carries `quoteIntro` keyed on its input row's class.
    const html = render({
      voice: {
        proposed: version({ reason: "Version 2: you edited this document." }),
        active: null,
      },
    });
    expect(html).toContain("Version 2: you edited this document.");
    expect(html).toContain(PROPOSED_INTRO.voice("Anna"));
    for (const [label, re] of ORIGIN_CLAIMS) {
      expect(html, `"${label}" reached an edited version's screen`).not.toMatch(re);
    }
  });

  it("an interview-built version still says whose words each claim is, per claim", () => {
    const html = render({
      strategy: {
        proposed: version({
          reason: "Version 1: inferred from 4 of your onboarding inputs.",
          claims: [interviewClaim()],
        }),
        active: null,
      },
    });
    // `quoteIntro` derives this from the input row's own class, per claim —
    // which is why removing the blanket sentence from the intro loses nothing.
    expect(html).toContain(quoteIntro("creator_authored", "2026-08-28"));
    expect(html).toContain("Version 1: inferred from 4 of your onboarding inputs.");
  });
});

describe("non-negotiable 6 / R10: this screen claims no accuracy, learning, verification or measurement", () => {
  // The hardest place in the product for this rule, because every sentence is
  // about the reader. Scanned over the states that render the most copy.
  const FORBIDDEN: [string, RegExp][] = FORBIDDEN_CLAIMS.map(
    ([l, re]) => [l, re] as [string, RegExp]
  );

  // R10's OWN two words, LOCAL to this suite rather than added to the shared
  // canon: "measurement" is legitimate product vocabulary on THIS SAME
  // screen (the declared metric's own "measurement window" field, R7) — a
  // shared `/measur/` ban would forbid our own honest field label. Scoped to
  // the exact past-tense verb forms R10 actually names, which "measurement"
  // (a noun) does not match.
  //
  // `verified` IS NEGATION-AWARE (slice 5 gate round 1, G5), and the reason is
  // that the screen now renders a sentence which says the OPPOSITE of the
  // banned claim: `EXPORT_EVIDENCE_UNVERIFIED` — "this quote could not be
  // verified against the stored post". R10 forbids CLAIMING a creator's
  // declaration was verified; refusing to make that claim is the rule being
  // obeyed, and a flat ban on the word would have forced the honest sentence
  // off the screen (or, worse, forced the state carrying it to stay out of
  // this scan's population — which is exactly what had happened).
  //
  // THE NEGATION MUST BIND THE VERB (learning gate CHANGE, round 2). The
  // first shape of this ban suppressed itself after ANY negation within 16
  // non-terminal characters, whether or not that negation governed
  // "verified" — so three claims measured against the installed V8 walked
  // straight through it, and they are CATCHES cases below: "this is not a
  // draft: verified against your posts", "never guessed, verified for you",
  // "nothing is inferred, not guessed, verified from your posts". A ban that
  // UNDER-catches contrary to its own docblock is worse than no ban, because
  // the docblock is what the next author trusts.
  //
  // The lookbehind now admits only the negation ADJACENT to the verb, with at
  // most the copula/adverb tokens English puts between them ("could not BE
  // verified", "has not YET been verified"). It still errs toward
  // OVER-catching — "we are unable to verify this" trips it, because "to" is
  // not in that set — which is the safe direction for a ban to fail in.
  //
  // The STEM SET covers `verifying` and `verifiable` too: both were sayable
  // under the old pattern, which is the same class left open one word over.
  // Probed against the installed V8 in the cases below — variable-length
  // lookbehind is a V8 fact, not a portable one.
  const LOCAL_FORBIDDEN: [string, RegExp][] = [
    [
      "verified",
      /(?<!\b(?:not|never|cannot|unable)\b(?:\s+(?:be|been|yet))*\s)\bverif(y|ying|ies|ied|ication|iable)\b/i,
    ],
    ["measured", /\bmeasured\b/i],
  ];

  const STATES: [string, Partial<BrainViewProps>][] = [
    ["empty", {}],
    ["a proposed voice draft", { voice: { proposed: version(), active: null } }],
    [
      "a voice draft with a placeholder",
      {
        voice: {
          proposed: version({
            claims: [claim({ value: CHECK, isPlaceholder: true, quote: null, source: null })],
          }),
          active: null,
        },
      },
    ],
    [
      "a proposed strategy draft, with the metric panel",
      {
        strategy: {
          proposed: version({
            claims: [
              interviewClaim(),
              interviewClaim({
                pointer: "/metric/window",
                value: "28 days",
                quote: "28 days",
              }),
            ],
          }),
          active: null,
        },
      },
    ],
    // ROUND 2's NEW SENTENCE joins the population the round it is written.
    // `screenAbsenceSentence` gained a third and fourth answer (the creator's
    // own edit, and the claims-nothing fallback), and a sentence outside this
    // scan is a sentence nothing checks for claims it must not make.
    [
      "a voice draft the CREATOR EDITED, with a placeholder they typed",
      {
        voice: {
          proposed: version({
            reason: REASON_EDITED,
            claims: [claim({ value: CHECK, isPlaceholder: true, quote: null, source: null })],
          }),
          active: null,
        },
      },
    ],
    [
      "a version whose stored reason this build cannot classify",
      {
        voice: {
          proposed: version({
            reason: "something nobody rendered",
            claims: [claim({ value: CHECK, isPlaceholder: true, quote: null, source: null })],
          }),
          active: null,
        },
      },
    ],
    [
      "a strategy draft with an undecided (interview-placeholder) field",
      {
        strategy: {
          proposed: version({
            claims: [
              interviewClaim({ value: CHECK, isPlaceholder: true, quote: null, source: null }),
            ],
          }),
          active: null,
        },
      },
    ],
    [
      "a proposed killtest draft",
      {
        killtest: {
          proposed: version({
            claims: [interviewClaim({ pointer: "/bannedWords/0", value: "cringe", quote: "cringe" })],
          }),
          active: null,
        },
      },
    ],
    [
      "fully confirmed voice, activation offered",
      { voice: { proposed: version({ claims: [claim({ confirmed: true })] }), active: null } },
    ],
    [
      "an active voice version",
      { voice: { proposed: null, active: version({ status: "active", activatedAt: POSTED }) } },
    ],
    [
      "an active strategy version",
      {
        strategy: {
          proposed: null,
          active: version({
            status: "active",
            activatedAt: POSTED,
            claims: [interviewClaim({ confirmed: true })],
          }),
        },
      },
    ],
    ["blocked", { voice: { proposed: version(), active: null }, decideBlock: { reason: "Viewer access." } }],
    // ─── SLICE 5's OWN TWO SURFACES (gate round 1, G5) ────────────────────
    //
    // THE POPULATION LESSON, applied to the scan rather than to the guard it
    // scans (CLAUDE.md 2026-08-29). Every state above was written before this
    // slice, and all three `*History` props default to `[]` in `base` — so
    // VERSION HISTORY, the superseded-version copy and the replacement line
    // rendered NO COPY AT ALL into this scan, and neither did the evidence
    // annotation. The screen grew two surfaces and its honesty scan did not
    // grow with it: a derived guard is only as wide as its population.
    [
      "a superseded version in history, with its replacement line",
      {
        voice: { proposed: null, active: version({ version: 2, status: "active", activatedAt: POSTED }) },
        voiceHistory: [
          version({ brainDocId: "v2", version: 2, status: "active", confirmedAt: POSTED, activatedAt: POSTED, claims: [claim({ confirmed: true })] }),
          version({
            brainDocId: "v1",
            version: 1,
            status: "superseded",
            reason: "Version 1: you edited this document.",
            confirmedAt: POSTED,
            activatedAt: POSTED,
            supersededAt: POSTED,
            replacedByVersion: 2,
            claims: [claim({ confirmed: true })],
          }),
        ],
      },
    ],
    [
      "a superseded version whose replacement cannot be named",
      {
        voiceHistory: [
          version({
            brainDocId: "v1",
            status: "superseded",
            supersededAt: POSTED,
            replacedByVersion: null,
            claims: [claim({ confirmed: false })],
          }),
        ],
      },
    ],
    [
      "a strategy history version, rendered through the metric panel",
      {
        strategyHistory: [
          version({
            brainDocId: "s1",
            status: "superseded",
            supersededAt: POSTED,
            replacedByVersion: 2,
            claims: [
              interviewClaim({ confirmed: true }),
              interviewClaim({ pointer: "/metric/window", value: "28 days", quote: "28 days", confirmed: true }),
            ],
          }),
        ],
      },
    ],
    // THE ANNOTATED CLAIM — the state whose own honest sentence contains the
    // word this suite bans, driven from `@respin/db`'s constant rather than a
    // fixture string, so a rewrite of that sentence into an affirmative claim
    // ("this quote was verified") reddens here.
    [
      "a claim carrying the evidence annotation, blocking the draft",
      {
        voice: {
          proposed: version({
            claims: [claim({ evidenceAnnotation: EXPORT_EVIDENCE_UNVERIFIED })],
          }),
          active: null,
        },
      },
    ],
    [
      "an annotated claim in HISTORY, where it is read-only",
      {
        voiceHistory: [
          version({
            status: "superseded",
            supersededAt: POSTED,
            replacedByVersion: 2,
            claims: [claim({ confirmed: true, evidenceAnnotation: EXPORT_EVIDENCE_UNVERIFIED })],
          }),
        ],
      },
    ],
  ];

  it.each(STATES)("%s claims nothing this product does not do", (_label, props) => {
    const html = visibleCopy(render(props)).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears on /brain`).not.toMatch(re);
    }
    for (const [label, re] of LOCAL_FORBIDDEN) {
      expect(html, `"${label}" appears on /brain`).not.toMatch(re);
    }
  });

  it("NON-VACUITY: a planted claim in a rendered state IS caught", () => {
    const planted = visibleCopy(
      render({ profileName: "We will learn your voice and improve it" })
    ).toLowerCase();
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["learn", "improve", "we will"])
    );
  });

  it("NON-VACUITY: the LOCAL verified/measured scan would catch a planted claim", () => {
    const planted = "this declaration was verified and measured by us".toLowerCase();
    expect(LOCAL_FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["verified", "measured"])
    );
  });

  // G5 — the narrowing is a NARROWING, measured against the installed engine.
  // A ban weakened to let one honest sentence through has to prove, per shape,
  // that it still catches the claim it exists for. `LOCAL_FORBIDDEN[0]` rather
  // than a re-typed regex: this drives the pattern the scan above actually uses.
  describe("G5: the negation-aware `verified` ban", () => {
    const verified = LOCAL_FORBIDDEN.find(([l]) => l === "verified")![1];

    it("PASSES the product's own honest negative sentence, exactly as rendered", () => {
      expect(verified.test(EXPORT_EVIDENCE_UNVERIFIED)).toBe(false);
      expect(verified.test(`Evidence note: ${EXPORT_EVIDENCE_UNVERIFIED}.`)).toBe(false);
      // The sentence must still BE a negation — if it is ever rewritten into a
      // claim, this assertion and the state scan above both fail.
      expect(EXPORT_EVIDENCE_UNVERIFIED).toMatch(/\b(?:not|never|cannot|unable)\b/i);
    });

    it.each([
      ["a plain claim", "this declaration was verified"],
      ["an agentive claim", "we verify every rule against your posts"],
      ["a noun claim", "each rule ships with a verification"],
      ["a claim AFTER a negation in a PREVIOUS sentence", "we could not reach it. every rule was verified"],
      ["a claim far enough past a negation", "we never guess about any of this, because each rule was verified"],
      // ROUND 2's THREE. Each has a negation within the old 16-character
      // window that does NOT govern the verb, and each was measured against
      // the installed V8 as PASSING the previous pattern.
      ["a negation of something ELSE, before a colon", "this is not a draft: verified against your posts"],
      ["a negation of a different verb, before a comma", "never guessed, verified for you"],
      ["two negations, neither binding the verb", "nothing is inferred, not guessed, verified from your posts"],
      // The two stems the ban could not say before.
      ["a progressive claim", "we are verifying your posts"],
      ["a capability claim", "each rule is verifiable"],
    ])("CATCHES %s", (_label, planted) => {
      expect(verified.test(planted)).toBe(true);
    });

    it.each([
      ["the negation adjacent to the verb", "this rule was never verified"],
      ["a copula between them", "this quote could not be verified"],
      ["an adverb and a copula between them", "this rule has not yet been verified"],
    ])("still PASSES an honest negative: %s", (_label, honest) => {
      expect(verified.test(honest)).toBe(false);
    });

    it("does not fire on a word that merely CONTAINS the stem", () => {
      expect(verified.test("unverified")).toBe(false);
    });
  });

  it("EVERY refusal code this screen can emit is scanned — not a fixture", () => {
    expect(BRAIN_ERROR_CODES.length).toBeGreaterThan(5);
    for (const code of BRAIN_ERROR_CODES) {
      const copy = brainErrorFor(code)!;
      const text = `${copy.title} ${copy.detail}`.toLowerCase();
      for (const [label, re] of FORBIDDEN) {
        expect(text, `"${label}" appears in /brain's copy for "${code}"`).not.toMatch(re);
      }
    }
  });

  it("NON-VACUITY: the refusal-copy scan would catch a planted claim", () => {
    const planted =
      "That was not recorded — we will learn from this and improve.".toLowerCase();
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["learn", "improve", "we will"])
    );
  });
});

describe("the page is wired, not assumed", () => {
  const src = (rel: string) =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf8");
  const pageSrc = src("app/(product)/brain/page.tsx");
  const viewSrc = src("app/(product)/brain/brain-view.tsx");

  it("the page reads through the SANCTIONED annotate-mode history facade, never a raw table", () => {
    expect(pageSrc).toContain("respinDb.readBrainHistory");
    expect(pageSrc).not.toMatch(/respinDb\.read(Voice|Strategy|KillTest)Brain/);
    expect(pageSrc).not.toMatch(/writeCapabilities|getServerDb|drizzle/);
  });

  it("reads ordered history for every editable kind through the sanctioned facade", () => {
    expect(pageSrc).toContain('respinDb.readBrainHistory(scope, profile.id, "voice")');
    expect(pageSrc).toContain('respinDb.readBrainHistory(scope, profile.id, "strategy")');
    expect(pageSrc).toContain('respinDb.readBrainHistory(scope, profile.id, "killtest")');
    expect(pageSrc).toContain("selectCurrentBrainState(voiceHistory)");
    expect(pageSrc).toContain("selectCurrentBrainState(strategyHistory)");
    expect(pageSrc).toContain("selectCurrentBrainState(killtestHistory)");
  });

  it("every confirm action is BOUND to the profile AND its own document id", () => {
    expect(pageSrc).toContain(
      "confirmVoiceAction.bind(null, profile.id, voiceProposedId)"
    );
    expect(pageSrc).toContain(
      "confirmStrategyAction.bind(null, profile.id, strategyProposedId)"
    );
    expect(pageSrc).toContain(
      "confirmKillTestAction.bind(null, profile.id, killtestProposedId)"
    );
  });

  it("binds document edits and the declared metric to the profile and stored document ids", () => {
    expect(pageSrc).toContain(
      "editBrainDocumentAction.bind(null, profile.id, voiceEditId)"
    );
    expect(pageSrc).toContain(
      "editBrainDocumentAction.bind(null, profile.id, strategyEditId)"
    );
    expect(pageSrc).toContain(
      "editBrainDocumentAction.bind(null, profile.id, killtestEditId)"
    );
    expect(pageSrc).toContain(
      "editDeclaredMetricAction.bind(null, profile.id, strategyEditId)"
    );
  });

  it("edit actions call only the sanctioned facade and post a complete pointer payload", () => {
    const actionsSrc = src("app/(product)/brain/actions.ts");
    expect(actionsSrc).toContain("respinDb.editBrainDocument(");
    expect(actionsSrc).toContain("respinDb.editDeclaredMetric(");
    expect(actionsSrc).toContain('key.startsWith("edit:")');
    expect(actionsSrc).not.toMatch(/writeCapabilities|getServerDb|drizzle|brainDocs\b/);
  });

  it("R8: all three activate bindings call the SAME activateBrainAction, never a per-kind activate", () => {
    expect(pageSrc).toContain(
      "activateBrainAction.bind(null, profile.id, voiceProposedId)"
    );
    expect(pageSrc).toContain(
      "activateBrainAction.bind(null, profile.id, strategyProposedId)"
    );
    expect(pageSrc).toContain(
      "activateBrainAction.bind(null, profile.id, killtestProposedId)"
    );
    // ...and the per-document `activateVoiceAction` FUNCTION this screen used
    // before R8 is gone entirely — coherent activation is the only path this
    // screen offers. Scoped to the IMPORT block, not the whole file: the prop
    // `activateVoiceAction` on `BrainViewProps` legitimately shares the old
    // function's name (it is what the view calls the voice-bound action it is
    // handed), so a whole-file scan would false-positive on that prop.
    const importBlock = pageSrc.match(/import\s*\{[^}]*\}\s*from\s*"\.\/actions";/)?.[0];
    expect(importBlock, "the ./actions import block").toBeDefined();
    expect(importBlock).not.toMatch(/\bactivateVoiceAction\b/);
  });

  it("the action module itself calls respinDb.activateBrainCoherent, never activateVoice/activateBrainDoc directly", () => {
    const actionsSrc = src("app/(product)/brain/actions.ts");
    expect(actionsSrc).toContain("respinDb.activateBrainCoherent(scope, profileId, brainDocId)");
    expect(actionsSrc).not.toMatch(/respinDb\.activateVoice\(/);
  });

  it("R-118 blocks every non-owner at the page, and a PAUSE blocks too", () => {
    expect(pageSrc).toMatch(/scope\.role !== "owner"/);
    expect(pageSrc).toMatch(/const decideBlock =[\s\S]{0,600}paused/);
  });

  it("the decision controls are the pending-guarded client button", () => {
    expect(viewSrc).toContain("<SubmitButton");
    expect(viewSrc.replace(/<SubmitButton/g, "")).not.toMatch(/<button\b/);
    expect(viewSrc).toContain('pendingLabel="Creating a new draft');
    expect(viewSrc).toContain('pendingLabel="Updating your declared metric');
  });

  it("every control is a 44px touch target", () => {
    expect(viewSrc).toMatch(/minHeight: "44px"/);
    expect(viewSrc).toMatch(/minWidth: "44px"/);
  });

  it("puts only profile and format in export URLs, never brain contents", () => {
    expect(pageSrc).toContain("/api/export?profile=${exportProfile}&format=json");
    expect(pageSrc).toContain("/api/export?profile=${exportProfile}&format=markdown");
    expect(pageSrc).not.toMatch(/JSON\.stringify\(|bundle\.json|bundle\.markdown/);
  });
});

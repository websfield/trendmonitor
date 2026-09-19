// Slice 1's rendered surface, and the decisions behind it.
//
// The page component itself needs a session and a database and is executed by
// no test in this repo, which is why every decision it makes lives in `copy.ts`
// as a pure function and every state lives in `onboarding-view.tsx` as a
// component a fixture can drive. That split is the round-2 CHANGE 6 rule
// ("decisions live in pure functions, not in page bodies") applied before the
// finding rather than after it.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  NOT_BUILT_YET,
} from "./support/forbidden-claims";
import {
  BrainDocumentLimitError,
  BrainVersionLimitError,
  CONFIG_V1_SEED,
  DISPLAY_NAME_MAX,
  ONBOARDING_PAGE_MAX,
  OnboardingInputLimitError,
  POST_CONTENT_MAX,
} from "@respin/db";
import { respinConfigV1 } from "@respin/config";
// THE PRICE RULE ITSELF, not a number copied out of it: the same function the
// page calls, so this suite drives what a creator reads against what `priceOf`
// answers for a document (billing gate, 2026-09-02).
import { onboardingBrainPrices } from "@respin/credits";
import {
  ASSEMBLY_KINDS,
  ASSEMBLY_KINDS_PRE_VENDOR,
} from "@respin/credits/app-server";
import {
  ONBOARDING_ERROR_CODES,
  capReached,
  capSentence,
  characterCount,
  onboardingErrorFor,
  onboardingStep,
} from "../app/(product)/onboarding/copy";
import {
  corpusBoundSentence,
  preSendSentence,
  runChargeSentence,
  runCostSentence,
  voiceOutcomeSentence,
  ASSEMBLY_KIND_COPY,
} from "../app/(product)/onboarding/run-copy";
import type { RunInferencePanelProps } from "../app/(product)/onboarding/run-inference-panel";
import { RunOutcome } from "../app/(product)/onboarding/run-outcome";
import type { VoiceInferenceState } from "../app/(product)/onboarding/run-state";
import {
  CODE_FOR_ERROR_CLASS,
  ERROR_CLASS_COVERED_BY_BASE,
  INSTANCE_BRANCH_CODES,
  billingErrorCode,
  BILLING_ERROR_COPY,
} from "../app/(product)/billing-errors";

import {
  OnboardingView,
  preview,
  type OnboardingViewProps,
} from "../app/(product)/onboarding/onboarding-view";

const base: OnboardingViewProps = {
  step: "create-profile",
  plan: { tier: "free", cap: 1, used: 0 },
  capReached: false,
  createBlock: null,
  pasteBlock: null,
  referenceBlock: null,
  profileName: null,
  posts: [],
  morePosts: false,
  referencePosts: [],
  referenceCount: 0,
  referenceCountMax: 50,
  postLimit: 20_000,
  nameLimit: 80,
  pageSize: 25,
  createProfileAction: "/onboarding",
  addPostAction: "/onboarding",
  addReferenceAction: "/onboarding",
  run: null,
  error: null,
};

/**
 * A run panel fixture. `action` is never called by these tests — the panel is a
 * client component rendered to static markup, so `useActionState` yields its
 * INITIAL state and the button is what renders. The states after a press are
 * asserted through the pure copy functions, which is where the words live.
 */
type RunProps = RunInferencePanelProps & { sendSentence: string };
const runFixture = (p: Partial<RunProps> = {}): RunProps => ({
  action: async () => ({ status: "idle" }),
  costSentence: runCostSentence(0, 50, 120),
  // Through the real pure function, so the fixture's sentence is the shipped
  // one and the R12 scans below read what a creator reads.
  sendSentence: preSendSentence(50),
  block: null,
  refusalCopy: Object.fromEntries(
    ONBOARDING_ERROR_CODES.map((c) => [c, onboardingErrorFor(c)!])
  ),
  fallbackCopy: onboardingErrorFor("unknown")!,
  ...p,
});

/**
 * ONE forbidden list, at module scope, read by BOTH scans.
 *
 * It lived inside the honesty describe until the outcome scan was added, and
 * a second copy is exactly how two scans come to disagree about what this
 * screen may say. Shared, so a word can only be removed once.
 */
//
// "CREDIT" WAS REMOVED FROM THIS LIST IN SLICE 2a, ONCE, DELIBERATELY, AND
// IT IS THE ONLY THING THAT MOVED. The screen now genuinely spends a credit,
// and R18 REQUIRES it to say so before it does — so banning the word would
// ban the honesty requirement. A word leaving a forbidden list is exactly the
// move a weakened guard looks like, so it does not simply leave: it is
// replaced by the POSITIVE assertions in "the metered run states its price
// (R18)" below, which fail if the price or the balance stops being stated.
// Everything else stays banned, and the slice still does none of it.
//
// "BRAIN" AND "VOICE RULES" LEFT THIS LIST IN SLICE 3, ONCE, DELIBERATELY, AND
// THEY ARE THE ONLY THINGS THAT MOVED. This screen now genuinely drafts a voice
// brain from the creator's own posts, and a control has to be able to say what
// it does — "Build my voice brain" is the honest label, and banning the noun
// would force a vaguer one onto the button that sends a person's writing to a
// vendor.
//
// A WORD LEAVING A FORBIDDEN LIST IS EXACTLY WHAT A WEAKENED GUARD LOOKS LIKE,
// so neither simply leaves. What replaces them is narrower and sharper — the
// four claims below, which are what R12 was always really about. "We drafted
// rules about how you write" is a statement of fact about a `proposed` document
// nothing acts on. That it is ACCURATE, that the product LEARNED, that it will
// IMPROVE, that it UNDERSTANDS the creator — those are claims about a future
// this product has not built (the learning loop is slice 9 and beyond). None of
// them was banned before, so this is a net TIGHTENING of what the screen may
// claim, not a relaxation.
//
// The positive half is "the run panel says what is in force and what is not"
// below, which fails if the screen stops saying that a draft binds nothing
// until the creator confirms it.
const FORBIDDEN: [string, RegExp][] = [
  // THE SHARED CANON (compliance gate, 2026-08-29) plus this screen's own
  // not-built-yet bans. The two screens' lists had diverged and this one — the
  // screen that spends a credit and sends the creator's writing to a vendor —
  // was the WEAKER of the two on exactly the words REQ-I04 names: `/brain`
  // banned `guarantee` and `confiden`, this did not, and neither banned
  // `train`. See `tests/support/forbidden-claims.ts`.
  ...FORBIDDEN_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
  ...NOT_BUILT_YET.map(([l, re]) => [l, re] as [string, RegExp]),
  ["later", /\byou can .{0,20}later/],
  ["soon", /\bsoon\b/],
  ["coming", /\bcoming\b/],
];

/**
 * The rendered COPY, with React's own machinery removed.
 *
 * React injects an inline `<script>` bootstrap whenever a `<form>` carries a
 * function action — the form-replay handler — and slice 2a's run control is the
 * first form on this screen to have one. That script contains the literal word
 * "script" (in its own tag) and would trip the R12 scan forever.
 *
 * IT IS STRIPPED, NOT EXCUSED, and the distinction is the whole point: the scan
 * exists to read what a CREATOR reads, and a creator does not read React's
 * bootstrap. What is removed is exactly `<script>…</script>` elements — nothing
 * that renders as text — and the two probes below prove the strip is that
 * narrow: a promise planted OUTSIDE a script tag is still caught, and the strip
 * removes the script's contents rather than the page's.
 */
export function visibleCopy(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

const render = (p: Partial<OnboardingViewProps> = {}) =>
  renderToStaticMarkup(<OnboardingView {...base} {...p} />);

describe("the pure decisions", () => {
  it("onboardingStep: a profile means paste, none means create", () => {
    expect(onboardingStep(0)).toBe("create-profile");
    expect(onboardingStep(1)).toBe("paste-posts");
    expect(onboardingStep(5)).toBe("paste-posts");
  });

  it("capReached is at-or-over, not over", () => {
    expect(capReached(0, 1)).toBe(false);
    expect(capReached(1, 1)).toBe(true);
    expect(capReached(2, 1)).toBe(true);
  });

  it("capSentence pluralises and invents no number", () => {
    expect(capSentence("free", 1, 0)).toBe(
      "Your free plan includes 1 creator profile. You are using 0."
    );
    expect(capSentence("studio", 5, 2)).toBe(
      "Your studio plan includes 5 creator profiles. You are using 2."
    );
  });

  it("characterCount counts CODE POINTS, so an emoji is not four characters", () => {
    expect(characterCount("hello")).toBe(5);
    // "é" composed is one code point; the same glyph decomposed is two, and
    // the stored content is NFC so the composed form is what is counted.
    expect(characterCount("café")).toBe(4);
    expect(characterCount("\u{1F44B}")).toBe(1);
    expect("\u{1F44B}".length, "the naive count this replaces").toBe(2);
  });

  it("preview truncates by code points and marks that it did", () => {
    expect(preview("short")).toBe("short");
    const long = "x".repeat(200);
    const p = preview(long);
    expect(p.endsWith("…")).toBe(true);
    expect([...p]).toHaveLength(141);
    // A post exactly at the limit is NOT marked truncated — an ellipsis that
    // appears when nothing was cut is a lie about the stored text.
    expect(preview("y".repeat(140))).toBe("y".repeat(140));
  });
});

describe("creator onboarding progress", () => {
  const steps = [
    { id: "posts" as const, label: "Own posts", state: "done" as const },
    { id: "voice" as const, label: "Voice", state: "done" as const },
    { id: "interview" as const, label: "Interview", state: "next" as const },
    { id: "first-ideas" as const, label: "First ideas", state: "todo" as const },
  ];
  const profilePanel = {
    profiles: [{ id: "profile-1", displayName: "Anna" }],
    selectedProfileId: "profile-1",
    selectProfileAction: async () => undefined,
    createProfileAction: async () => undefined,
    createBlock: null,
    capReached: false,
    plan: { tier: "creator", cap: 3, used: 1 },
    nameLimit: 80,
  };

  it("renders every derived state and the completed count", () => {
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      steps,
      profilePanel,
    });
    expect(html).toContain('data-testid="onboarding-steps"');
    expect(html).toContain("2 of 4 done");
    for (const state of ["done", "next", "todo"] as const) {
      expect(html).toContain(`data-step-state="${state}"`);
    }
    expect(
      render({
        step: "paste-posts",
        profileName: "Anna",
        steps: steps.map((item) => ({ ...item, state: "unknown" as const })),
        profilePanel,
      })
    ).toContain('data-step-state="unknown"');
  });

  it("keeps the progress header off the missing-profile view", () => {
    expect(render()).not.toContain('data-testid="onboarding-steps"');
  });

  it("orders the creator panels and leaves one plan line", () => {
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      steps,
      profilePanel,
      candidateSafetyAction: async (state) => state,
      run: runFixture(),
    });
    const markers = [
      "Creator profile",
      "Add your own past posts",
      "Add posts you admire",
      "Check a candidate reference",
      "Draft the rules for how you write",
      "Answer the structured interview",
      "Make this creator&#x27;s first ideas",
      "Your posts",
    ];
    let prior = -1;
    for (const marker of markers) {
      const at = html.indexOf(marker);
      expect(at, `${marker} is missing`).toBeGreaterThan(-1);
      expect(at, `${marker} is out of order`).toBeGreaterThan(prior);
      prior = at;
    }
    expect(html.match(/creator profiles used on the creator plan/g)).toHaveLength(1);
    expect(html).toMatch(/<details class="panel"><summary[^>]*>\s*Add posts you admire/);
    expect(html).toMatch(/<details class="panel"><summary[^>]*>\s*Check a candidate reference/);
  });
});

describe("the create-profile step", () => {
  it("shows the cap on the PASTE step too — where the cap refusal is reachable", () => {
    // The cap refusal can only fire when `used >= cap`, i.e. when a profile
    // already exists, i.e. on the paste step — so rendering the plan only on
    // the create step meant a capped creator saw the refusal banner and no
    // plan, no cap and no count. The refusal copy points at "the onboarding
    // page shows your plan"; this is what makes that true (billing + compliance
    // gates, 2026-08-27).
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      plan: { tier: "creator", cap: 3, used: 1 },
      profilePanel: {
        profiles: [{ id: "profile-1", displayName: "Anna" }],
        selectedProfileId: "profile-1",
        selectProfileAction: async () => undefined,
        createProfileAction: async () => undefined,
        createBlock: null,
        capReached: false,
        plan: { tier: "creator", cap: 3, used: 1 },
        nameLimit: 80,
      },
    });
    expect(html).toContain("1 of 3 creator profiles used on the creator plan");
  });

  it("shows the plan's cap from the server, and a form", () => {
    const html = render();
    expect(html).toContain("Your free plan includes 1 creator profile");
    expect(html).toContain('name="displayName"');
    expect(html).toContain("Create profile");
  });

  it("INVENTS NO CAP when the server could not read the plan", () => {
    // The defect this asserts against is one this slice actually wrote and
    // removed: the page defaulted to `{tier: "current", cap: Infinity}` so the
    // shape stayed non-null, and the sentence rendered "Your current plan
    // includes Infinity creator profiles" on an unseeded config.
    const html = render({ plan: null });
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("includes");
    // ...and the form is STILL there: an operator's unseeded config must not
    // lock a creator out of onboarding, because that is a refusal they cannot
    // act on. The server still enforces the cap on submit.
    expect(html).toContain('name="displayName"');
  });

  it("at the cap: no form, and a reason naming what the reader can do", () => {
    const html = render({
      plan: { tier: "free", cap: 1, used: 1 },
      capReached: true,
    });
    expect(html).not.toContain('name="displayName"');
    expect(html).toContain("billing page");
  });
});

describe("the paste step", () => {
  const paste: Partial<OnboardingViewProps> = {
    step: "paste-posts",
    profileName: "Anna",
    posts: [],
  };

  it("names the profile the posts are stored against, and takes one post at a time", () => {
    const html = render(paste);
    expect(html).toContain("Anna");
    expect(html).toContain('name="content"');
    expect(html).not.toContain('name="profileId"');
    expect(html).not.toContain('name="inputClass"');
  });

  it("empty state says what to do, not 'no data'", () => {
    const html = render(paste);
    expect(html).toContain("No posts yet");
    expect(html).toContain("Paste one above");
    expect(html.toLowerCase()).not.toContain("no data");
  });

  it("lists posts with their date and character count, and counts the WHOLE post", () => {
    const long = "z".repeat(300);
    const html = render({
      ...paste,
      posts: [
        { id: "1", createdAt: new Date("2026-08-27T10:00:00Z"), content: "hello 👋" },
        { id: "2", createdAt: new Date("2026-08-26T10:00:00Z"), content: long },
      ],
    });
    expect(html).toContain("Your posts (2)");
    expect(html).toContain("2026-08-27");
    expect(html).toContain("2026-08-26");
    expect(html).toContain("7 characters");
    // The ROW is truncated; the COUNT beside it still describes all 300...
    expect(html).toContain("300 characters");
    expect(html).toContain("…");
    // ...and the WHOLE post is reachable, in a collapsed <details>. The screen
    // says posts are "stored exactly as you type them", and until this existed
    // a reader had no way to check that — which is what made a silently
    // truncated paste invisible to the person it happened to (production gate).
    expect(html).toContain("Show the whole post");
    expect(html).toContain(long);
  });

  it("a SHORT post gets no expander — the affordance appears only when something was cut", () => {
    const html = render({
      ...paste,
      posts: [{ id: "1", createdAt: new Date("2026-08-27T10:00:00Z"), content: "short" }],
    });
    expect(html).not.toContain("Show the whole post");
    expect(html).not.toContain("…");
  });

  it("says so when the list is CLAMPED, rather than implying it is complete", () => {
    const html = render({ ...paste, morePosts: true, posts: [
      { id: "1", createdAt: new Date("2026-08-27T10:00:00Z"), content: "a" },
    ] });
    expect(html).toContain("Older posts are stored");
    expect(html).toContain("Your posts (1+)");
  });

  it("the expander is a 44px target — it is the control that makes the record checkable", () => {
    const html = render({
      ...paste,
      posts: [{ id: "1", createdAt: new Date("2026-08-27T10:00:00Z"), content: "z".repeat(300) }],
    });
    const summary = html.slice(html.indexOf("<summary"), html.indexOf("</summary>"));
    expect(summary).toContain("min-height:44px");
  });

  it("states the server's ceiling, from the server's own constant", () => {
    const html = render({ ...paste, postLimit: 20_000 });
    expect(html).toContain("20,000 characters");
    expect(html).toContain("refused, never shortened");
    expect(html).not.toContain("maxlength");
  });

  it("NEITHER field carries maxlength — the create step too", () => {
    // The round-2 compliance finding: the previous pin rendered the PASTE step
    // only, where the `displayName` input is not in the tree, so re-adding
    // `maxLength` to the name field stayed green. HTML maxlength truncates a
    // paste silently, counts UTF-16 units against a code-point ceiling, and
    // makes the server's typed refusal unreachable from a browser.
    expect(render(), "create step").not.toContain("maxlength");
    expect(render({ step: "paste-posts", profileName: "A" }), "paste step").not.toContain(
      "maxlength"
    );
  });

  it("offers no write form to a reader the server would refuse, and says why", () => {
    const viewer = render({
      ...paste,
      pasteBlock: { reason: "You have viewer access to this workspace." },
    });
    expect(viewer).not.toContain('name="content"');
    expect(viewer).toContain("viewer access");
    // ...and the same on the create step.
    const blockedCreate = render({
      createBlock: { reason: "This workspace's subscription is paused." },
    });
    expect(blockedCreate).not.toContain('name="displayName"');
    expect(blockedCreate).toContain("paused");
  });

  it("A PAUSE BLOCKS THE PROFILE, NOT THE PASTE — the server treats them differently", () => {
    // The round-2 compliance finding, planted as a test. `createProfile`
    // refuses under an open pause; `appendOwnPost` deliberately does not,
    // because refusing it would throw away text the person typed (R-35 §3).
    // Withholding both forms denied a paused creator a write the design grants
    // and stated a rule the server does not enforce.
    const pausedPaste = render({
      ...paste,
      createBlock: { reason: "This workspace's subscription is paused." },
      pasteBlock: null,
    });
    expect(
      pausedPaste,
      "a paused creator may still save their own posts"
    ).toContain('name="content"');
    expect(pausedPaste).not.toContain("paused");
  });

  it("states the PAGE SIZE when the list is clamped, not the character ceiling", () => {
    // "Showing the most recent 20000." beside 25 rows — `postLimit` was
    // interpolated where the page size belonged. Three reviewers found it
    // independently; the old clamp test asserted the prose and never the digits.
    const html = render({
      ...paste,
      morePosts: true,
      pageSize: 25,
      postLimit: 20_000,
      posts: [{ id: "1", createdAt: new Date("2026-08-27T10:00:00Z"), content: "a" }],
    });
    expect(html).toContain("Showing the most recent 25.");
    expect(html, "the per-post character ceiling is not the page size").not.toContain(
      "Showing the most recent 20000"
    );
  });
});

describe("the reference-post panel (slice 4, R1/R2/R3)", () => {
  const paste: Partial<OnboardingViewProps> = {
    step: "paste-posts",
    profileName: "Anna",
    posts: [],
    referencePosts: [],
    referenceCount: 0,
    referenceCountMax: 50,
  };

  it("renders its own field, distinct from the own-post form's `content`", () => {
    const html = render(paste);
    expect(html).toContain('name="referenceContent"');
    // No `input_class` or `attest` field on this form — the label is
    // hard-coded server-side and no attestation control exists to smuggle.
    expect(html).not.toContain('name="inputClass"');
  });

  it("carries NO attestation checkbox — R2's whole point", () => {
    const html = render(paste);
    // The own-post form has exactly ONE checkbox (its attestation); the
    // reference panel must not add a second one, and must not repeat the
    // attestation sentence, which only applies to the own-post form beside it.
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(1);
    expect((html.match(/I wrote this post myself/g) ?? []).length).toBe(1);
    // Scoped to the reference panel specifically: everything from its heading
    // to the next panel's heading carries no checkbox and no attestation text.
    const refPanel = html.slice(
      html.indexOf("Add posts you admire"),
      html.indexOf("Your posts (")
    );
    expect(refPanel).not.toContain('type="checkbox"');
    expect(refPanel).not.toContain("I wrote this post myself");
  });

  it("states the count against the server's own ceiling, never a literal", () => {
    const html = render({ ...paste, referenceCount: 3, referenceCountMax: 50 });
    expect(html).toContain("You have added 3 of up to 50 reference posts.");
  });

  it("a blocked reader sees no reference form, and the own-post block is independent", () => {
    const blocked = render({
      ...paste,
      referenceBlock: { reason: "You have viewer access to this workspace." },
    });
    expect(blocked).not.toContain('name="referenceContent"');
    expect(blocked).toContain("viewer access");
    // The own-post form is UNAFFECTED — the two blocks are separate props.
    expect(blocked).toContain('name="content"');
  });

  it("lists added reference posts, with their source URL when given, never claiming they are the creator's own writing", () => {
    const html = render({
      ...paste,
      referencePosts: [
        {
          id: "r1",
          createdAt: new Date("2026-08-29T10:00:00Z"),
          content: "Someone else's post.",
          sourceUrl: "https://example.com/post",
        },
      ],
    });
    expect(html).toContain("Someone else&#x27;s post.");
    expect(html).toContain("https://example.com/post");
  });

  it("does not claim the product analyses, learns from, or safely reuses reference posts (R12/R13)", () => {
    const html = render(paste).toLowerCase();
    expect(html).not.toMatch(/\blearn/);
    expect(html).not.toMatch(/\banalys/);
    expect(html).not.toMatch(/\bsafe to (publish|reuse|post)/);
  });
});

describe("honesty (R12) — this screen spends a credit and does nothing else it might imply", () => {
  // The requirement most easily lost, because an onboarding screen WANTS to
  // promise what comes next. Slice 1 does none of it, so no sentence may imply
  // it — and "we checked by reading it" is not a control, which is why this is
  // a scan over every rendered state rather than a review note.
  // WORD-BOUNDED REGEXES, not substrings. `"script"` is a substring of
  // "subscription" — harmless today, and the first time this screen mentions a
  // subscription the scan fires a false positive and someone weakens the list
  // (compliance gate NOTE, 2026-08-27). `\b` on the left only, so "generates"
  // and "analysing" still match.

  const STATES: [string, Partial<OnboardingViewProps>][] = [
    ["create step", {}],
    ["create step, plan unknown", { plan: null }],
    ["create step, at cap", { capReached: true, plan: { tier: "free", cap: 1, used: 1 } }],
    ["paste step, empty", { step: "paste-posts", profileName: "Anna" }],
    [
      "paste step, with posts",
      {
        step: "paste-posts",
        profileName: "Anna",
        posts: [{ id: "1", createdAt: new Date("2026-08-27T10:00:00Z"), content: "hi" }],
      },
    ],
    [
      "with a refusal",
      { error: { title: "Nope", detail: "Because of a reason you can act on." } },
    ],
    // The slice-2a states. The run panel is chrome a creator reads, so the
    // words on it are scanned like every other state — a control that spends
    // money is the LAST place a promise should be able to hide.
    [
      "paste step, with the run panel",
      { step: "paste-posts", profileName: "Anna", run: runFixture() },
    ],
    [
      "paste step, run blocked",
      {
        step: "paste-posts",
        profileName: "Anna",
        run: runFixture({ block: { reason: "You have viewer access." } }),
      },
    ],
    [
      "paste step, run price unknown",
      {
        step: "paste-posts",
        profileName: "Anna",
        run: runFixture({ costSentence: runCostSentence(null, null, null) }),
      },
    ],
    // The corpus-ceiling-unknown branch renders its OWN sentence, so it is its
    // own scanned state (compliance round-3 NOTE): a branch the scan never
    // renders is a branch that can promise anything.
    [
      "paste step, corpus ceiling unknown",
      {
        step: "paste-posts",
        profileName: "Anna",
        run: runFixture({ sendSentence: preSendSentence(null) }),
      },
    ],
  ];

  it.each(STATES)("%s promises nothing this slice does not do", (_label, props) => {
    const html = visibleCopy(render(props)).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears — slice 1 does not do that yet`).not.toMatch(
        re
      );
    }
  });

  it.each(FORBIDDEN)(
    "NON-VACUITY: the scan catches %s specifically, not just 'something'",
    (label, re) => {
      // PER WORD, because the previous probe injected one string and asserted
      // `FORBIDDEN.some(...)` — satisfied by "brain" and "we will" alone, so a
      // typo in "generating", "analy" or "voice rules" was invisible
      // (compliance gate NOTE, 2026-08-27).
      const SPECIMENS: Record<string, string> = {
        ...CLAIM_SPECIMENS,
        later: "you can change the name later",
        soon: "coming soon",
        coming: "coming up next",
      };
      expect(SPECIMENS[label].toLowerCase()).toMatch(re);
    }
  );

  it("NON-VACUITY, end to end: a planted promise in a RENDERED state is caught", () => {
    const planted = renderToStaticMarkup(
      <OnboardingView
        {...base}
        profileName="We will learn your voice and it improves over time."
        step="paste-posts"
      />
    ).toLowerCase();
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["learn", "improve", "we will"])
    );
  });

  it("the script strip is NARROW: a promise outside a script tag is still caught", () => {
    const planted = visibleCopy(
      '<p>we will learn your voice</p><script>var x = "we will learn your voice";</script>'
    ).toLowerCase();
    // the paragraph survives...
    expect(planted).toContain("<p>we will learn your voice</p>");
    // ...and the script's copy of it does not.
    expect(planted).not.toContain("var x");
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["learn", "we will"])
    );
  });

  it("NON-VACUITY: without the strip, React's form bootstrap alone would trip the scan", () => {
    // The premise of the strip, asserted rather than described: the run panel's
    // form really does emit a <script>, and it really does contain the word.
    const raw = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture(),
    }).toLowerCase();
    expect(raw).toMatch(/<script\b/);
    expect(raw).toMatch(/\bscript/);
    expect(visibleCopy(raw)).not.toMatch(/\bscript/);
  });

  it("EVERY refusal code this screen can emit is scanned — not a fixture", () => {
    // THE COMPLIANCE GATE'S CENTRAL FINDING (2026-08-27). The scan above drives
    // a FIXTURE (`{title: "Nope"}`), so the copy a creator actually reads was
    // never scanned — and `/onboarding?e=workspace_paused` is genuinely
    // reachable (a paused workspace pressing "Create profile"), rendering
    // shared copy about "building or updating a creator brain" and credits.
    expect(ONBOARDING_ERROR_CODES.length).toBeGreaterThan(5);
    for (const code of ONBOARDING_ERROR_CODES) {
      const copy = onboardingErrorFor(code);
      expect(copy, code).not.toBeNull();
      const rendered = visibleCopy(
        render({
          error: copy,
        })
      ).toLowerCase();
      for (const [label, re] of FORBIDDEN) {
        expect(
          rendered,
          `the copy for "${code}" says "${label}" — slice 1 does not do that`
        ).not.toMatch(re);
      }
    }
  });

  it("a code this screen's actions CANNOT emit degrades to the neutral copy, never another surface's", () => {
    // A closed set, so `?e=` cannot render another surface's product copy here
    // — 23 of the 33 shared codes contain a forbidden word. It falls back to
    // `unknown` rather than to NOTHING: returning null made the failure mode
    // silent, so a code the actions emit but the hand-derived list omits would
    // give the creator the form back with no explanation (compliance gate
    // round 2, 2026-08-27).
    for (const foreign of [
      "already_subscribed",
      "pack_price_mismatch",
      "brain_role",
      "nonsense",
    ]) {
      const copy = onboardingErrorFor(foreign);
      expect(copy, foreign).not.toBeNull();
      expect(copy, foreign).toEqual(onboardingErrorFor("unknown"));
    }
    // ...and that neutral copy still passes the honesty scan, which is what
    // makes the fallback safe rather than a hole in the closed set.
    const html = render({ error: onboardingErrorFor("already_subscribed") }).toLowerCase();
    for (const [label, re] of FORBIDDEN) {
      expect(html, label).not.toMatch(re);
    }
    // No `?e=` at all still renders no alert.
    expect(onboardingErrorFor(undefined)).toBeNull();
    expect(render({ error: null })).not.toContain('role="alert"');
  });

  it("a refusal is announced AND focusable — the attribute alone is not the property", () => {
    const html = render({
      error: { title: "That profile name cannot be used", detail: "Edit it and try again." },
    });
    expect(html).toContain('role="alert"');
    expect(html).toContain("That profile name cannot be used");
    expect(html).toContain("Edit it and try again.");
    // `role="alert"` does NOT announce a region present at load, and a refusal
    // here arrives by full-page redirect. So the region is focusable and a
    // client island moves focus to it — asserting only the attribute was this
    // repo's "a comment claiming a property is not the property" in test form
    // (production gate, 2026-08-27).
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('id="onboarding-refusal"');
  });
});

// ---------------------------------------------------------------- the race

describe("the metered run states its price (R18)", () => {
  // THE POSITIVE HALF OF THE R12 NARROWING. "credit" left the forbidden list
  // because this screen genuinely spends one; these are what stop that being a
  // weakening. If the control ever stops naming the price, or the balance, or
  // starts inventing either, one of these fails.

  it("names the price AND the balance before anything is pressed", () => {
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture({ costSentence: runCostSentence(0, 50, 120) }),
    });
    expect(html).toContain("50 credits");
    expect(html).toContain("120 credits");
    // ...and the control that would spend them is on the same screen as the
    // sentence, not a page away.
    expect(html).toContain('data-testid="run-cost"');
    expect(html).toContain("Build my voice brain");
  });

  it("the price sentence tracks its ARGUMENTS, not a literal in the component", () => {
    // The `pageSize` lesson, applied before the finding: the previous clamp
    // test asserted the surrounding prose and never the digits, so the wrong
    // number rendered green. These assert the digits.
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture({ costSentence: runCostSentence(0, 7, 3) }),
    });
    expect(html).toContain("7 credits");
    expect(html).toContain("3 credits");
    expect(html).not.toContain("50 credits");
  });

  it("INVENTS NO PRICE when the server could not read one", () => {
    const sentence = runCostSentence(null, null, null);
    expect(sentence).toMatch(/could not be read/);
    expect(sentence).not.toMatch(/\d/);
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture({ costSentence: sentence }),
    });
    expect(html).toContain("could not be read");
  });

  it("states the price even when the BALANCE alone is unreadable", () => {
    // Two independent reads, so one failing must not silence the other. The
    // price is the half R18 is actually about.
    const sentence = runCostSentence(0, 50, null);
    expect(sentence).toContain("50 credits");
    expect(sentence).not.toMatch(/You have/);
  });

  it("pluralises both numbers, so a one-credit price is not 'costs 1 credits'", () => {
    expect(runCostSentence(0, 1, 1)).toContain("costs 1 credit.");
    expect(runCostSentence(0, 1, 1)).toContain("You have 1 credit.");
    expect(runCostSentence(0, 2, 2)).toContain("costs 2 credits.");
  });

  it("the rule has FOUR shapes, and the count in the code is bound to them", () => {
    // `run-copy.ts` said "THREE BRANCHES, because the document has three
    // shapes" directly above a four-branch conditional (learning gate,
    // 2026-09-02) — an unbound count, written by the pass that was correcting
    // unbound counts elsewhere. A count in a comment is bound here or it is
    // not a claim. One representative per branch, asserted DISTINCT: merging
    // two branches makes two of these equal, and adding a fifth shape without
    // a representative leaves this case describing less than the code does.
    const shapes = [
      runCostSentence(0, 0, 3), // both free
      runCostSentence(0, 50, 3), // first included, later priced — today's
      runCostSentence(9, 9, 3), // both priced the same
      runCostSentence(25, 50, 3), // both priced, differently
    ];
    expect(new Set(shapes).size, "two branches produce the same sentence").toBe(4);
    // ...and each names its own shape, so "distinct" is not four spellings of
    // one claim.
    expect(shapes[0]).toContain("cost nothing");
    expect(shapes[1]).toMatch(/first run for a creator is included/i);
    expect(shapes[2]).toContain("Every run for a creator costs 9 credits");
    expect(shapes[3]).toContain("first run for a creator costs 25 credits");
  });

  it("says the first run is included — the rule the server actually prices by", () => {
    // `priceFor` in packages/credits charges 0 for the first billable attempt
    // per profile and `creditCosts.onboardingBrainRebuild` after it. The
    // sentence states that RULE rather than predicting which branch this press
    // will take: predicting means a second read of the same authority
    // `runInference` consults inside its debit transaction, and a stale
    // prediction is a wrong number about money.
    expect(runCostSentence(0, 50, 120)).toMatch(/first run for a creator is included/i);
  });

  it("...and it STOPS saying that the moment the document prices the first run", async () => {
    // THE DEFECT (billing gate, 2026-09-02). This sentence asserted the rule
    // unconditionally while the page read ONE number, so under the exact
    // document R-82's own test appends — `onboardingBrainBuild: 25` — a
    // creator was told their first build was included and was then debited 25.
    // `priceOf` was right; the sentence was a frozen assumption about a value
    // the schema types as `min(0)` rather than `literal(0)`.
    const priced = runCostSentence(25, 50, 120);
    expect(priced.toLowerCase()).not.toContain("included");
    expect(priced.toLowerCase()).not.toMatch(/\bfree\b|on us|no charge/);
    expect(priced).toContain("first run for a creator costs 25 credits");
    expect(priced).toContain("Every run after that costs 50 credits");
    // One price for both branches reads as one sentence, not two.
    const flat = runCostSentence(9, 9, 4);
    expect(flat).toContain("Every run for a creator costs 9 credits");
    expect(flat.toLowerCase()).not.toContain("included");
    // Nothing priced at all is said as that, never as "included".
    expect(runCostSentence(0, 0, 4)).toContain(
      "cost nothing on this server's current settings"
    );
    // Singular, on the branch the old signature could not reach.
    expect(runCostSentence(1, 2, 5)).toContain(
      "first run for a creator costs 1 credit."
    );
    // THE PROPERTY, OVER THE BRANCH SPACE rather than over the three examples
    // above: this sentence may promise nothing free unless the price it was
    // handed for the first run IS zero. That is the whole class the finding
    // named — copy that states a price RULE instead of reading one — expressed
    // as something a grid can falsify.
    for (const included of [0, 1, 7, 25, 50]) {
      for (const rebuild of [0, 1, 50]) {
        const s = runCostSentence(included, rebuild, 3).toLowerCase();
        if (included === 0) continue;
        expect(s, `included=${included} rebuild=${rebuild}`).not.toMatch(
          /included|\bfree\b|on us|no charge|nothing/
        );
        expect(s, `included=${included} rebuild=${rebuild}`).toContain(
          String(included)
        );
      }
    }
  });

  it("THE PRICES COME FROM `priceOf`: the same document that debits 25 makes the screen say 25", async () => {
    // NOT A RULE ABOUT THE NUMBER 25 — the page's own read, driven against the
    // real seeded document and then against an appended one, exactly as
    // `/admin/model-spend`'s guard is. `onboardingBrainPrices` is the two
    // branches of `priceOf`'s onboarding case, so a screen that used it cannot
    // state a rule the debit does not follow.
    const seeded = respinConfigV1.parse(CONFIG_V1_SEED);
    expect(onboardingBrainPrices(seeded)).toEqual({
      included: 0,
      rebuild: seeded.creditCosts.onboardingBrainRebuild,
    });
    expect(runCostSentence(0, seeded.creditCosts.onboardingBrainRebuild, 120)).toMatch(
      /first run for a creator is included/i
    );
    const raised = {
      ...seeded,
      creditCosts: { ...seeded.creditCosts, onboardingBrainBuild: 25 },
    };
    expect(onboardingBrainPrices(raised).included).toBe(25);
    const sentence = runCostSentence(
      onboardingBrainPrices(raised).included,
      onboardingBrainPrices(raised).rebuild,
      120
    );
    expect(
      sentence.toLowerCase(),
      "the screen promises a free first build the ledger will charge for"
    ).not.toContain("included");
    expect(sentence).toContain("25 credits");
  });

  it("no control is offered when it is blocked — and the reason replaces it", () => {
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture({
        block: {
          reason:
            "This workspace's subscription is paused, so nothing can be run against it until it resumes.",
        },
      }),
    });
    expect(html).toContain('data-testid="run-blocked"');
    expect(html).not.toContain("Build my voice brain");
    // The price is STILL stated: a reader who cannot press it can still see
    // what it would cost, which is what makes the pause actionable.
    expect(html).toContain('data-testid="run-cost"');
  });

  it("there is NO run control at all before a profile exists", () => {
    // A control that spends money must not render in a state where the thing
    // it would spend against does not exist. `run: null` is that state.
    const html = render({ step: "create-profile", run: null });
    expect(html).not.toContain("run-panel");
    expect(html).not.toContain("Build my voice brain");
  });

  // ------------------------------------------------------------------------
  // THE POSITIVE HALF OF SLICE 3's R12 NARROWING.
  //
  // "brain" and "voice rules" left FORBIDDEN so the control could name what it
  // does. These are what replace them: a word removed from a ban list has to be
  // answered by an assertion that fails if the honesty it protected goes away.
  // Each one below breaks if this screen stops saying that a draft binds
  // nothing until the creator has read and confirmed it.

  it("the run panel says a draft is NOT in force until the creator confirms it", () => {
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture(),
    });
    expect(html).toMatch(/draft/i);
    expect(html).toMatch(/nothing is in force yet/i);
    expect(html).toMatch(/confirm each one/i);
  });

  it("the run panel says the creator's OWN POSTS are what gets sent — WITH the corpus bound", () => {
    // The thing a creator cannot find out afterwards. Their writing leaves this
    // server on this press, and the screen has to say so before it happens —
    // the same rule as R18's price sentence, applied to their data instead of
    // their money. And it states the BOUND: the old sentence, "the posts you
    // saved above", implied all of them while the read was clamped to
    // `voiceCorpusMaxPosts` (compliance gate round 2, 2026-08-29).
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture(),
    });
    expect(html).toMatch(/sends your posts saved above/i);
    expect(html).toMatch(/the most recent 50 at most/);
    expect(html).toMatch(/model provider/i);
  });

  it("preSendSentence: the digits track the argument, and null says the ceiling could not be shown", () => {
    // Digits, not prose — the `pageSize` lesson (2026-08-27).
    expect(preSendSentence(7)).toContain("the most recent 7 at most");
    const unknown = preSendSentence(null);
    expect(unknown).toContain("could not be shown");
    // The null branch must not fall back to the unbounded claim the known
    // branch replaced, and must not invent a number.
    expect(unknown).toMatch(/ceiling/);
    expect(unknown).not.toMatch(/\d/);
  });

  it("corpusBoundSentence: renders only when the bound BOUND, digits tracking both arguments", () => {
    expect(corpusBoundSentence(3, 3)).toBeNull();
    expect(corpusBoundSentence(3, 2)).toBeNull();
    expect(corpusBoundSentence(50, 200)).toBe(
      "This draft read your 50 most recent posts. You have 200 saved, so the oldest 150 were not read."
    );
    expect(corpusBoundSentence(50, 51)).toContain("the oldest one was not read");
    // Never a ratio and never a percentage of the creator (task 20).
    expect(corpusBoundSentence(50, 200)).not.toMatch(/\d+\s*%/);
    expect(corpusBoundSentence(50, 200)).not.toMatch(/\d+\s+of\s+your\s+\d+/i);
  });

  it("the panel claims no accuracy, no learning and no improvement", () => {
    // Belt-and-braces over the shared FORBIDDEN scan, stated here as the
    // narrowing's own receipt so a future reader can see the trade was paid.
    const html = render({
      step: "paste-posts",
      profileName: "Anna",
      run: runFixture(),
    }).toLowerCase();
    for (const banned of [/\blearn/, /\bimprov/, /\baccura/]) {
      expect(html).not.toMatch(banned);
    }
  });
});

describe("R8: the own-post attestation is an ACT, not a sentence", () => {
  // G-12's creator half. The `own_post` label switches off both R-3 controls —
  // a reference input may not ground a voice rule, and reference inputs are the
  // echo corpus — and until slice 3 its only warrant was a paragraph above the
  // textarea.
  const pasteHtml = () =>
    render({ step: "paste-posts", profileName: "Anna" });

  it("the paste form carries a checkbox the creator has to tick", () => {
    const html = pasteHtml();
    expect(html).toMatch(/<input[^>]*id="attest"/);
    expect(html).toMatch(/type="checkbox"/);
    expect(html).toContain("I wrote this post myself.");
  });

  it("the checkbox is LABELLED and a 44px target, like every other control here", () => {
    const html = pasteHtml();
    expect(html).toMatch(/<label[^>]*for="attest"/);
    expect(html).toMatch(/for="attest"[^>]*style="[^"]*min-height:44px/);
  });

  it("it does NOT claim the product verifies authorship", () => {
    // An unverified label the product knows is unverified is a different risk
    // from one it presents as verified, and the copy has to land on the right
    // side of that line.
    const html = pasteHtml();
    expect(html).toContain("We do not check this");
    expect(html.toLowerCase()).not.toMatch(/verif|we check that|confirmed to be/);
  });

  it("the browser is NOT the enforcement — no `required` on the checkbox", () => {
    // Deliberate. `required` would make the server refusal unreachable from a
    // browser, so the walk could never exercise it; the enforcement is
    // `appendOwnPost`'s `attested` parameter, which has no default.
    const html = pasteHtml();
    const attest = html.slice(html.indexOf('id="attest"'));
    const tag = attest.slice(0, attest.indexOf(">"));
    expect(tag).not.toMatch(/required/);
  });

  it("the action reads the checkbox STRICTLY — absence is never an assertion", () => {
    const actionsSrc = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "app/(product)/onboarding/actions.ts"
      ),
      "utf8"
    );
    // `=== "on"` and nothing looser. An unticked checkbox is ABSENT from the
    // submission, so `Boolean(formData.get("attest"))` would still be false —
    // but `!= null`, `!== null` or a truthiness test on a coerced string would
    // not, and each is a one-character edit away.
    expect(actionsSrc).toContain('formData.get("attest") === "on"');
    expect(actionsSrc).not.toMatch(/Boolean\(\s*formData\.get\("attest"\)/);
  });
});

describe("voiceOutcomeSentence: counts OUR evidence, never scores the creator", () => {
  // Task 20. The number being reported is how much WE could ground, and every
  // ratio form of it reads as a measurement of the person instead.

  it("never renders a ratio or a percentage, at any combination", () => {
    for (let total = 1; total <= 6; total++) {
      for (let ph = 0; ph <= total; ph++) {
        const sentence = voiceOutcomeSentence(total, ph);
        expect(sentence, `${ph}/${total}`).not.toMatch(/%/);
        expect(sentence, `${ph}/${total}`).not.toMatch(/\bof your \d+\b/);
        // ...and it always says what the creator has to do next.
        expect(sentence, `${ph}/${total}`).toMatch(/confirm/i);
      }
    }
  });

  it("all-grounded, some-grounded and none-grounded are three different sentences", () => {
    const all = voiceOutcomeSentence(4, 0);
    const some = voiceOutcomeSentence(4, 1);
    const none = voiceOutcomeSentence(4, 4);
    expect(new Set([all, some, none]).size).toBe(3);
    expect(all).toMatch(/behind every one/i);
    expect(some).toMatch(/one is marked unknown/i);
    expect(none).toMatch(/could not point to a quote from your posts for any/i);
  });

  it("the absence is OURS, never phrased as a shortcoming of the creator", () => {
    const none = voiceOutcomeSentence(4, 4);
    expect(none).toMatch(/we could not/i);
    expect(none.toLowerCase()).not.toMatch(
      /your (posts|writing) (are|is) (not|too)|not enough in your/
    );
  });

  it("pluralises, so one rule is not '1 rules'", () => {
    expect(voiceOutcomeSentence(1, 0)).toContain("1 rule ");
    expect(voiceOutcomeSentence(2, 0)).toContain("2 rules");
  });
});

describe("what the run says AFTERWARDS comes from the operation, not from a lookup", () => {
  it("a charge of 0 is reported as the INCLUDED run, never as absence", () => {
    // "absent is never zero" in the direction that matters here: 0 is a real
    // value `runInference` returned, so it gets real words. The failure this
    // forbids is the opposite one — rendering "free" because a lookup found no
    // row.
    const sentence = runChargeSentence(0, 120);
    expect(sentence).toMatch(/included run/i);
    expect(sentence).toContain("120 credits");
    expect(sentence).not.toMatch(/costs? 0/i);
  });

  it("a real charge names the number and the balance that resulted", () => {
    const sentence = runChargeSentence(50, 70);
    expect(sentence).toContain("50 credits");
    expect(sentence).toContain("70 credits");
  });

  it("pluralises a one-credit charge", () => {
    expect(runChargeSentence(1, 1)).toContain("That cost 1 credit.");
    expect(runChargeSentence(1, 1)).toContain("now 1 credit.");
  });
});

describe("the PENDING labels are covered too — the state no renderer can reach", () => {
  // THE SAME MECHANISM THAT HID `RunOutcome` FROM ROUND 1'S SCAN, one component
  // over. `useFormStatus` yields `pending: false` under `renderToStaticMarkup`,
  // so the label a creator actually reads while their money is in flight is
  // rendered by nothing any test drives — the compliance gate proved it by
  // rendering `OnboardingView` and finding neither "Working on your run" nor
  // "Saving" in the markup.
  //
  // `RunOutcome` was fixable by extracting a pure component. This is not: the
  // label lives on `SubmitButton`, whose whole job is to read a hook that only
  // has a value inside a live form. So the strings are scanned AT SOURCE — the
  // weaker instrument, chosen knowingly, and the weakness is named: this reads
  // the literals in the file, so it cannot catch a label computed at runtime.
  // If one ever is, this scan stops covering it.
  const submitSrc = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "app/(product)/onboarding/submit-button.tsx"
    ),
    "utf8"
  );
  const panelSrc = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "app/(product)/onboarding/run-inference-panel.tsx"
    ),
    "utf8"
  );

  /** `pendingLabel="..."` and `pendingLabel = "..."`, from a RegExp literal. */
  const pendingLabels = (text: string): string[] =>
    [...text.matchAll(/pendingLabel\s*=\s*"([^"]*)"/g)].map((m) => m[1]);

  it("NON-VACUITY: the scan finds the labels that exist", () => {
    const found = [...pendingLabels(submitSrc), ...pendingLabels(panelSrc)];
    expect(found.length, "the scan found no pending labels at all").toBeGreaterThan(1);
    expect(found).toContain("Working on your run…");
    expect(pendingLabels('pendingLabel="X"')).toEqual(["X"]);
    expect(pendingLabels("// pendingLabel is a prop"), "prose is not a label").toEqual([]);
  });

  it("no pending label says a forbidden word", () => {
    for (const label of [...pendingLabels(submitSrc), ...pendingLabels(panelSrc)]) {
      for (const [name, re] of FORBIDDEN) {
        expect(
          re.test(label.toLowerCase()),
          `the pending label "${label}" says "${name}" — a creator reads this while their money is in flight`
        ).toBe(false);
      }
    }
  });

  it("the money control's pending label does not claim a vendor call we may not make", () => {
    // SIX refusal paths never reach `provider.complete` — role, archived
    // profile, pause, config, price and the run slot. A label asserting "Running
    // the model…" is false on all six, which is the same class of defect as the
    // four false money statements this slice already fixed. The label must
    // describe the PRESS, not a call that may not happen.
    const labels = pendingLabels(panelSrc);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(
        label.toLowerCase(),
        `"${label}" asserts a model call that six refusal paths never make`
      ).not.toMatch(/running the model|calling the model|asking the model/);
      // ...and it is not the intake label either, which was the original defect.
      expect(label).not.toBe("Saving…");
    }
  });
});

describe("capability-wide intake and Brain ceilings stay in onboarding's closed channel", () => {
  const REACHABLE_LIMIT_REFUSALS = [
    [new OnboardingInputLimitError("too large"), "onboarding_input_limit"],
    [new BrainDocumentLimitError("too large"), "brain_document_limit"],
    [new BrainVersionLimitError(200), "brain_version_limit"],
  ] as const;

  it.each(REACHABLE_LIMIT_REFUSALS)(
    "%s maps to %s and never degrades to neutral copy",
    (error, code) => {
      expect(billingErrorCode(error)).toBe(code);
      expect(ONBOARDING_ERROR_CODES).toContain(code);
      expect(onboardingErrorFor(code)).not.toEqual(onboardingErrorFor("unknown"));
    }
  );
});

describe("the screen's code set is DERIVED from what runInference throws", () => {
  // THE CLASS-LEVEL FIX FOR A DEFECT THAT HAS NOW SHIPPED TWICE.
  //
  // Round 1 found two codes missing from this screen's set and they were added.
  // The concurrency remediation then added two more to `billing-errors.ts` and
  // not here — and the compliance gate proved the consequence by RENDERING it:
  // a creator at their plan's limit got "Something went wrong … the details are
  // in the server log", with 194 UI tests green. Fixing the instances twice and
  // leaving the class open is the exact shape CLAUDE.md's 2026-07-30 lesson
  // names, so this derives the requirement instead of restating it.
  //
  // THE POPULATION IS `inference.ts`'s OWN THROWS, read from source. That is
  // the right population and not a convenience: `runInference` IS the screen's
  // only spend path, so a class it throws is a refusal this screen can render,
  // and a class it stops throwing drops out on its own. What the scan cannot
  // see is a class thrown by a CALLEE (`ConfigNotMigratedError`, the `LlmError`
  // family) — those stay in the hand-kept list above, and the limit is stated
  // here rather than left as an impression.
  //
  // SLICE 3 WIDENED THE POPULATION, AND IT SHIPPED THE DEFECT FIRST. The scan
  // read `inference.ts` alone, which was the whole spend path when it was
  // written. Slice 3 added a SECOND one — `infer-voice.ts`, composing
  // `assemble.ts`'s prompt build and reply parse — whose throws this scan could
  // not see. The BROWSER WALK caught the consequence, not this suite: a real
  // model reply that was not JSON rendered "Something went wrong … the details
  // are in the server log" to a creator whose posts had just been sent to a
  // vendor, with the whole suite green. THIRD occurrence of one defect.
  //
  // So the population is now every source file the screen's spend path can
  // throw from, and adding a file to this list is what a new spend path costs.
  // SLICE 4 WIDENS THE POPULATION AGAIN, before it could ship the SAME defect
  // a third time. `infer-voice.ts` composes `caps.writeBrainDoc(...)`
  // (`with-workspace.ts`), which has ALWAYS run the echo bar and (from this
  // slice) the quote budget (`echo.ts`) on every write — including the
  // inference path's own, since `writeBrainDoc` never asks who is calling it.
  //
  // `echo.ts` ONLY, DELIBERATELY, NOT the whole of `with-workspace.ts`. That
  // file is shared across every profile-grained capability — confirm,
  // activate, the workspace-grained writes — and a file-level scan over it
  // pulled in `BrainRoleError` (confirm/activate's role gate), which is
  // genuinely UNREACHABLE from `inferVoice` (it never confirms or activates)
  // and which a DELIBERATE fixture two tests below pins as the canonical
  // "foreign to this screen" example. `echo.ts` is single-purpose — every
  // class it constructs runs on any `writeBrainDoc` call, `inferVoice`'s
  // included — so file-level granularity is right there and wrong for its
  // much larger neighbour.
  const SPEND_PATH_SOURCES = [
    "packages/credits/src/inference.ts",
    "packages/credits/src/infer-voice.ts",
    "packages/llm/src/assemble.ts",
    "packages/db/src/echo.ts",
  ];
  const read = (rel: string) =>
    readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "..", rel),
      "utf8"
    );
  const inferenceSrc = SPEND_PATH_SOURCES.map(read).join("\n");

  /**
   * Every `new XError(` the file CONSTRUCTS — built from a RegExp literal,
   * never assembled from a string (CLAUDE.md, 2026-08-21: one lost backslash
   * turns `\s` into `s` and the scan silently matches nothing).
   *
   * CONSTRUCTIONS, NOT `throw` STATEMENTS, and the first draft of this scan got
   * that wrong: it matched `throw new X(` and so missed `TopupInFlightError`,
   * which is thrown from a ternary (`throw triggered ? new A() : new B()`). A
   * population that silently omits a refusal is the fail-open shape this whole
   * describe block exists to close. Matching constructions over-captures — a
   * class built and not thrown would also be required to have copy — and that
   * is the safe direction: it demands MORE copy, never less.
   *
   * Bare `new Error(` does not match (`\w+` needs a character before "Error"),
   * which is correct: an anonymous throw has no class to map.
   */
  const thrownClassNames = (text: string): string[] => [
    ...new Set([...text.matchAll(/new (\w+Error)\(/g)].map((m) => m[1])),
  ];

  it("NON-VACUITY: the scan finds the classes it is supposed to find", () => {
    // A scan that matched nothing would report "every thrown class has copy"
    // because it found no thrown classes — indistinguishable from working
    // (CLAUDE.md, 2026-08-21). Pinned against four classes read from the file.
    const names = thrownClassNames(inferenceSrc);
    expect(names.length).toBeGreaterThanOrEqual(4);
    for (const expected of [
      "InferenceRoleError",
      "ProfileArchivedError",
      "RunSlotBusyError",
      "TopupInFlightError",
      // Slice 3's spend path — the three the widened population must see, and
      // the two whose absence the browser walk found.
      "AssemblyError",
      "NotEnoughPostsError",
      "BrainPointerDivergenceError",
      // Slice 4's widened population, over `with-workspace.ts` / `echo.ts`.
      "ReferenceEchoError",
      "ProvenanceError",
    ]) {
      expect(
        names,
        `${expected} is thrown somewhere on the screen's spend path`
      ).toContain(expected);
    }
    // ...and it finds nothing in text that merely MENTIONS a class.
    expect(thrownClassNames("// throws RunSlotBusyError sometimes")).toEqual([]);
    // ...and it DOES find the ternary form that the first draft missed.
    expect(
      thrownClassNames("throw t ? new TopupInFlightError(1, 2) : new OtherError();")
    ).toEqual(["TopupInFlightError", "OtherError"]);
  });

  /**
   * The same resolution `billingErrorCode`'s `instanceof` chain performs, for
   * a name rather than an instance.
   *
   * The first draft looked up exact names only and immediately failed on
   * `LlmUnavailableError`, which `withDeadline` constructs and which the table
   * covers through its base `LlmError`. That was the test being wrong, not the
   * code. It is resolved through `ERROR_CLASS_COVERED_BY_BASE`, which lives
   * beside the table in `billing-errors.ts`, rather than by importing the
   * subclasses — the facade deliberately does not re-export them, and widening
   * the package boundary so a test could name them would loosen a tenancy rule
   * for a convenience.
   */
  const codeForClassName = (name: string): string | undefined =>
    CODE_FOR_ERROR_CLASS[name] ??
    CODE_FOR_ERROR_CLASS[ERROR_CLASS_COVERED_BY_BASE[name] ?? ""];

  it("NON-VACUITY: the base-class resolution really resolves, and only for known classes", () => {
    // Without this, `codeForClassName` returning `undefined` for everything
    // would make the test below vacuously pass on an empty code set.
    expect(CODE_FOR_ERROR_CLASS.LlmUnavailableError).toBeUndefined();
    expect(
      codeForClassName("LlmUnavailableError"),
      "a subclass must resolve through its base, as instanceof does at runtime"
    ).toBe(CODE_FOR_ERROR_CLASS.LlmError);
    expect(codeForClassName("NotAnErrorClassAnywhere")).toBeUndefined();
  });

  it("every class runInference throws maps to a code this screen has copy for", () => {
    const codes = new Set<string>();
    for (const name of thrownClassNames(inferenceSrc)) {
      const code = codeForClassName(name);
      // A class neither the billing map nor any of its base classes has heard
      // of is its own defect: it would render "Something went wrong" through a
      // different door.
      expect(
        code,
        `${name} is thrown by runInference but resolves to no billing error code`
      ).toBeDefined();
      codes.add(code as string);
      for (const c of INSTANCE_BRANCH_CODES[name] ?? []) codes.add(c);
    }
    const missing = [...codes].filter(
      (c) => !(ONBOARDING_ERROR_CODES as readonly string[]).includes(c)
    );
    expect(
      missing,
      "a refusal runInference can raise would render the neutral fallback on the one screen that spends money"
    ).toEqual([]);
  });

  it("the instance branches are recorded, or the derivation above cannot see them", () => {
    // `billingErrorCode` branches on the INSTANCE before the class table for
    // two classes, so their table entry is not the only code they produce. If
    // that map were emptied, the test above would silently stop requiring
    // `run_slot_busy` — the derivation would still pass while the defect it
    // exists to catch came back.
    expect(Object.keys(INSTANCE_BRANCH_CODES)).toContain("RunSlotBusyError");
    expect(INSTANCE_BRANCH_CODES.RunSlotBusyError).toEqual([
      "run_slot_busy",
      "server_at_capacity",
    ]);
  });

  it("both run-slot refusals render their OWN words, not the neutral fallback", () => {
    // The compliance gate's exact probe, kept as a test: these two rendered
    // "Something went wrong … the details are in the server log" while every
    // suite was green.
    for (const code of ["run_slot_busy", "server_at_capacity"] as const) {
      const copy = onboardingErrorFor(code);
      expect(copy, code).not.toBeNull();
      expect(copy!.title.toLowerCase(), code).not.toContain(
        "something went wrong"
      );
      expect(copy!.detail.toLowerCase(), code).not.toContain("server log");
      expect(copy!.detail.toLowerCase(), code).toMatch(/spent|charged/);
    }
    // ...and they say DIFFERENT things, which is the whole reason there are
    // two: one is about the creator's own runs, the other is about us.
    const busy = onboardingErrorFor("run_slot_busy")!;
    const capacity = onboardingErrorFor("server_at_capacity")!;
    expect(busy.title).not.toBe(capacity.title);
    expect(capacity.detail.toLowerCase()).not.toMatch(/your plan allows/);
  });

  it("no refusal promises that paying more raises this limit", () => {
    // `concurrencyLimits` is {free: 2, creator: 2, pro: 4, studio: 8}, so an
    // upgrade inducement is false for the Free creator most likely to read it
    // and for Studio, which has nothing above it. Three reviewers found the
    // sentence independently; this is what stops it coming back.
    for (const code of ["run_slot_busy", "server_at_capacity"] as const) {
      const copy = onboardingErrorFor(code)!;
      expect(
        `${copy.title} ${copy.detail}`.toLowerCase(),
        `${code} must not steer a creator toward paying for something that may not change`
      ).not.toMatch(/upgrad|higher plan|move to/);
    }
  });
});

describe("every refusal a SPEND can return says what happened to the money", () => {
  // A refusal on a money surface that does not say whether money moved is the
  // defect, whatever else it says. Scoped to the seven codes that are reachable
  // ONLY through the metered run: the shared codes it inherits (paused, scope,
  // access, clock skew) are worded for surfaces that do not spend, and forcing
  // spend language into them would be a change to copy that is correct
  // elsewhere. Stated as a limit rather than left as an impression.
  const SPEND_ONLY = [
    "inference_role",
    "profile_archived",
    "topup_in_flight",
    "insufficient_credits",
    "config_not_migrated",
    "llm_unavailable",
    "ledger_integrity",
    // The concurrency bound's two refusals (tech-spec S6). Both are raised
    // ONLY by the metered run, and both must say what happened to the money —
    // they claim nothing was spent AND that the included build survives, which
    // is what makes the refusal safe to retry.
    "run_slot_busy",
    "server_at_capacity",
  ] as const;

  it("all of them are in the screen's CLOSED code set — none degrades to neutral copy", () => {
    for (const code of SPEND_ONLY) {
      expect(
        (ONBOARDING_ERROR_CODES as readonly string[]).includes(code),
        `${code} is reachable from the run and must not fall back to "unknown"`
      ).toBe(true);
    }
  });

  it("each one states that nothing was spent, or what was", () => {
    for (const code of SPEND_ONLY) {
      const copy = onboardingErrorFor(code);
      expect(copy, code).not.toBeNull();
      expect(
        `${copy!.title} ${copy!.detail}`.toLowerCase(),
        `"${code}" refuses a spend without telling the reader what happened to their credits`
      ).toMatch(/spent|charged/);
    }
  });

  it("NON-VACUITY: the money-honesty scan rejects copy that omits it", () => {
    const silent = "Something went wrong. Please try again in a little while.";
    expect(silent.toLowerCase()).not.toMatch(/spent|charged/);
  });
});

describe("assembly refusals stay diagnostic and content-free", () => {
  const copyByCode = Object.fromEntries(
    ONBOARDING_ERROR_CODES.map((code) => [code, onboardingErrorFor(code)!])
  );
  const refused = (assemblyKind?: (typeof ASSEMBLY_KINDS)[number]) =>
    renderToStaticMarkup(
      <RunOutcome
        state={{
          status: "refused",
          code: "inference_unusable",
          ...(assemblyKind ? { assemblyKind } : {}),
        }}
        refusalCopy={copyByCode}
        fallbackCopy={onboardingErrorFor("unknown")!}
      />
    );

  it("pins the closed copy set and the three pre-vendor kinds", () => {
    expect(Object.keys(ASSEMBLY_KIND_COPY).sort()).toEqual(
      [...ASSEMBLY_KINDS].sort()
    );
    expect(ASSEMBLY_KINDS_PRE_VENDOR).toEqual([
      "no_fields_supplied",
      "duplicate_post",
      "duplicate_field_request",
    ]);
  });

  it("scans the three rendered pre-vendor refusals for the money outcome", () => {
    const refusalCopy = Object.fromEntries(
      ONBOARDING_ERROR_CODES.map((code) => [code, onboardingErrorFor(code)!])
    );
    for (const assemblyKind of ASSEMBLY_KINDS_PRE_VENDOR) {
      const html = renderToStaticMarkup(
        <RunOutcome
          state={{
            status: "refused",
            code: "inference_unusable",
            assemblyKind,
          }}
          refusalCopy={refusalCopy}
          fallbackCopy={onboardingErrorFor("unknown")!}
        />
      );
      expect(
        html.toLowerCase(),
        `${assemblyKind} rendered without saying what happened to credits`
      ).toMatch(/spent|charged/);
    }
  });

  it.each([
    [
      "no_fields_supplied",
      "The product prepared no voice checks before the run. Nothing was sent to the model and nothing was spent. This is our fault; tell us so we can investigate it.",
    ],
    [
      "duplicate_post",
      "The product prepared the same saved post more than once. Nothing was sent to the model and nothing was spent. This is our fault; tell us so we can investigate it.",
    ],
    [
      "duplicate_field_request",
      "The product prepared the same voice check more than once. Nothing was sent to the model and nothing was spent. This is our fault; tell us so we can investigate it.",
    ],
  ] as const)("%s replaces the counted detail with its exact pre-vendor copy", (kind, copy) => {
    const html = refused(kind);
    expect(html).toContain(copy);
    expect(html).not.toContain("Your run was still made, so it counted");
    expect(html).toContain('data-code="inference_unusable"');
    expect(html).toContain(`data-assembly-kind="${kind}"`);
    expect(html.toLowerCase()).not.toMatch(/try again|fix (?:it|this) by/);
  });

  it("renders the counted detail before every post-vendor kind sentence", () => {
    for (const kind of ASSEMBLY_KINDS.filter(
      (item) => !(ASSEMBLY_KINDS_PRE_VENDOR as readonly string[]).includes(item)
    )) {
      const html = refused(kind);
      const shared = html.indexOf("Your run was still made, so it counted");
      const diagnostic = html.indexOf(ASSEMBLY_KIND_COPY[kind]);
      expect(shared, kind).toBeGreaterThan(-1);
      expect(diagnostic, kind).toBeGreaterThan(shared);
      expect(html, kind).toContain(`data-assembly-kind="${kind}"`);
    }
  });

  it("pins the branch-independent usage pointer as a static literal", () => {
    const pointer =
      "Any charge for this run is in your credit history on the usage page.";
    expect(refused()).toContain(pointer);
    expect(BILLING_ERROR_COPY.inference_unusable.detail).toContain(pointer);
    expect(BILLING_ERROR_COPY.inference_unusable.detail).toContain(
      "Your run was still made, so it counted"
    );
    expect(BILLING_ERROR_COPY.inference_unusable.detail).not.toMatch(
      /try again|most often a quote|your balance/i
    );

    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../app/(product)/billing-errors.ts"
      ),
      "utf8"
    );
    const entry = source.match(
      /inference_unusable:\s*\{\s*title:\s*"[^"]*",\s*detail:\s*"([^"]*)",\s*\}/
    );
    expect(entry?.[1]).toContain(pointer);
    expect(entry?.[0]).not.toContain("${");
  });

  it("keeps the four parked money clauses byte-identical", () => {
    expect(BILLING_ERROR_COPY.provenance.detail).toBe(
      "Every claim in a brain has to point at something you actually wrote, and one of the quotes did not appear where it said it did — so it was refused rather than stored. Nothing was saved and no credits were spent. Try the build again; if it keeps happening, contact support. The refusal code and error type are recorded without the quote."
    );
    expect(BILLING_ERROR_COPY.brain_document_limit.detail).toBe(
      "The proposed Brain version has too many claim or evidence entries, or its combined text is too large. Nothing was stored and the version already in force is unchanged. Shorten or reduce the claims and evidence, then rebuild or submit the replacement again."
    );
    expect(BILLING_ERROR_COPY.reference_echo.detail).toBe(
      "A reference post is kept only to find the pattern behind it, never to be repeated word for word — so a draft that echoes a long stretch of one, or quotes more of one than the limit allows, is refused rather than stored. Nothing was saved and no credits were spent. Rewrite the field describing the mechanism in your own words, or cite a shorter piece of the reference post, and try again. This check does not promise the result is original or safe to publish — it only stops the one thing it can measure: repeating a reference post's own wording."
    );
    expect(BILLING_ERROR_COPY.unknown.detail).toBe(
      "The action did not complete and nothing was charged. Try again; if it keeps happening, contact support. The refusal code, error type and any server-derived context are recorded without exception details."
    );
  });

  it("independently pins the onboarding code and override initializers", () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../app/(product)/onboarding/copy.ts"
      ),
      "utf8"
    );
    const parsed = ts.createSourceFile(
      "copy.ts",
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const initializer = (name: string): ts.Expression => {
      let found: ts.Expression | undefined;
      const visit = (node: ts.Node): void => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === name
        ) {
          found = node.initializer;
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);
      expect(found, `${name} initializer`).toBeDefined();
      let value = found!;
      while (
        ts.isAsExpression(value) ||
        ts.isSatisfiesExpression(value) ||
        ts.isParenthesizedExpression(value)
      ) {
        value = value.expression;
      }
      return value;
    };
    const propertyName = (name: ts.PropertyName): string => {
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
      throw new Error(`unresolved initializer key: ${name.getText(parsed)}`);
    };

    const codes = initializer("ONBOARDING_ERROR_CODES");
    expect(ts.isArrayLiteralExpression(codes)).toBe(true);
    const codeValues = (codes as ts.ArrayLiteralExpression).elements.map(
      (element) => {
        expect(ts.isStringLiteral(element)).toBe(true);
        return (element as ts.StringLiteral).text;
      }
    );
    const expectedCodes = [
      "profile_cap",
      "profile_role",
      "profile_name",
      "post_content",
      "onboarding_input_limit",
      "brain_document_limit",
      "brain_version_limit",
      "post_attestation",
      "not_enough_posts",
      "inference_unusable",
      "llm_truncated",
      "uncharged_attempt_cap",
      "brain_pointer_divergence",
      "workspace_paused",
      "config_unavailable",
      "profile_access",
      "scope_forgery",
      "workspace_access",
      "clock_skew",
      "inference_role",
      "profile_archived",
      "topup_in_flight",
      "insufficient_credits",
      "config_not_migrated",
      "llm_unavailable",
      "unpriced_operation",
      "llm_attempt_recorded",
      "debit_refused_after_call",
      "run_slot_busy",
      "server_at_capacity",
      "ledger_integrity",
      "topup_reconciliation_required",
      "reference_echo",
      "provenance",
      "brain_content_walk",
      "segmenter_unavailable",
      "unknown",
    ];
    expect(codeValues).toEqual(expectedCodes);
    expect(ONBOARDING_ERROR_CODES).toEqual(expectedCodes);

    const overrides = initializer("ONBOARDING_OVERRIDES");
    expect(ts.isObjectLiteralExpression(overrides)).toBe(true);
    const overrideValues = Object.fromEntries(
      (overrides as ts.ObjectLiteralExpression).properties.map((property) => {
        expect(ts.isPropertyAssignment(property)).toBe(true);
        const entry = property as ts.PropertyAssignment;
        expect(ts.isObjectLiteralExpression(entry.initializer)).toBe(true);
        return [
          propertyName(entry.name),
          Object.fromEntries(
            (entry.initializer as ts.ObjectLiteralExpression).properties.map(
              (field) => {
                expect(ts.isPropertyAssignment(field)).toBe(true);
                const assignment = field as ts.PropertyAssignment;
                expect(ts.isStringLiteral(assignment.initializer)).toBe(true);
                return [
                  propertyName(assignment.name),
                  (assignment.initializer as ts.StringLiteral).text,
                ];
              }
            )
          ),
        ];
      })
    );
    expect(overrideValues).toEqual({
      workspace_paused: {
        title: "This workspace's subscription is paused",
        detail:
          "While a workspace is paused, nothing new can be added to it. Nothing you have already saved was changed or removed. Resume the subscription on the billing page and try again.",
      },
      profile_archived: {
        title: "This creator profile is archived",
        detail:
          "Nothing runs for an archived profile. Everything you have saved against it is untouched \u2014 archiving only takes the profile out of your plan's allowance. Nothing was spent. Reactivate the profile first if you want to run this.",
      },
      config_unavailable: {
        title: "This server's settings could not be read",
        detail:
          "Your creator profile allowance is set in the server's stored settings, and that document could not be read, so the action stopped rather than guessing. Nothing was created. An operator needs to seed or repair it; nothing you have saved is affected.",
      },
    });
    for (const kind of ASSEMBLY_KINDS) expect(source).not.toContain(kind);
  });
});

describe("R12 reaches the OUTCOME states too, and the vendor's words are quarantined", () => {
  // THE HOLE THIS CLOSES, and it was live and proven (compliance gate,
  // 2026-08-28). Three run states were added to the FORBIDDEN scan above and
  // the ledger recorded them as scanned. They are not: `useActionState` yields
  // its INITIAL state under `renderToStaticMarkup`, so rendering
  // `OnboardingView` with a run fixture produces the panel and never the
  // outcome. Every string in `run-outcome.tsx` — the attribution label, the
  // charge sentence, the meta line — and the model's reply itself sat outside
  // every check. A planted reply of "We will build your brain and generate
  // your scripts." rendered verbatim, suite green.
  //
  // `RunOutcome` exists as a pure component precisely so these states CAN be
  // driven. This is the scan that drives them.
  const copyByCode = Object.fromEntries(
    ONBOARDING_ERROR_CODES.map((c) => [c, onboardingErrorFor(c)!])
  );
  const outcomeHtml = (state: VoiceInferenceState) =>
    renderToStaticMarkup(
      <RunOutcome
        state={state}
        refusalCopy={copyByCode}
        fallbackCopy={onboardingErrorFor("unknown")!}
      />
    );

  const OK_NEUTRAL: VoiceInferenceState = {
    status: "ok",
    brainDocId: "00000000-0000-7000-8000-000000000001",
    claimPositions: 4,
    placeholders: 0,
    creditsCharged: 0,
    balanceAfter: 0,
    // Equal on the neutral fixture: the bound did not bind, so the bound
    // sentence must not render (asserted below in its own block).
    postsUsed: 3,
    postsAvailable: 3,
  };

  /**
   * THE VENDOR QUARANTINE IS GONE BECAUSE THE VENDOR TEXT IS GONE.
   *
   * Slice 2a's outcome rendered the model's reply in an attributed
   * `<blockquote>`, so this scan had to strip that element before looking for
   * forbidden words — we do not control what a model returns. Slice 3's outcome
   * renders NO model-authored text at all (every inferred rule is shown on
   * `/brain`, beside its quote), so every string here is the product's own and
   * the scan runs over all of it. That is a strictly stronger check, and the
   * test below pins the absence so it cannot quietly come back.
   */
  const productCopy = (html: string): string => visibleCopy(html);

  const OUTCOME_STATES: [string, VoiceInferenceState][] = [
    ["a charged run", { ...OK_NEUTRAL, creditsCharged: 50, balanceAfter: 70 }],
    ["the included run", OK_NEUTRAL],
    ["a run that grounded nothing", { ...OK_NEUTRAL, placeholders: 4 }],
    ["a run that grounded some", { ...OK_NEUTRAL, placeholders: 1 }],
    // The bound sentence renders in this state and nowhere else, so it is
    // scanned here — a new rendered sentence outside the scan is the exact
    // hole round 1 found.
    ["a clamped corpus", { ...OK_NEUTRAL, postsUsed: 50, postsAvailable: 200 }],
    ...ONBOARDING_ERROR_CODES.map(
      (code) =>
        [`refusal: ${code}`, { status: "refused", code }] as [
          string,
          VoiceInferenceState,
        ]
    ),
    ...ASSEMBLY_KINDS.map(
      (assemblyKind) =>
        [
          `assembly refusal: ${assemblyKind}`,
          { status: "refused", code: "inference_unusable", assemblyKind },
        ] as [string, VoiceInferenceState]
    ),
  ];

  it.each(OUTCOME_STATES)(
    "%s promises nothing this slice does not do",
    (_label, state) => {
      const html = productCopy(outcomeHtml(state)).toLowerCase();
      for (const [label, re] of FORBIDDEN) {
        expect(html, `"${label}" appears in the run outcome`).not.toMatch(re);
      }
    }
  );

  it("NO MODEL-AUTHORED TEXT reaches this component at all — the property, planted", () => {
    // THE REPLACEMENT FOR 2a's QUARANTINE TEST, and it checks the stronger
    // thing. 2a rendered the vendor's reply and proved it could not leak out of
    // its blockquote. Slice 3 renders none of it: what comes back is a set of
    // statements about how a PERSON writes, and a rule shown here would be a
    // claim about them with the quote that grounds it one page away (R10).
    //
    // Asserted STRUCTURALLY, on the state's own shape, because that is what
    // makes it unrepresentable rather than merely absent today: there is no
    // field on `VoiceInferenceState` that could carry model prose.
    const state: VoiceInferenceState = { ...OK_NEUTRAL };
    expect(Object.keys(state).sort()).toEqual([
      "balanceAfter",
      "brainDocId",
      "claimPositions",
      "creditsCharged",
      "placeholders",
      // The corpus-bound pair (compliance residual, 2026-08-29): two COUNTS
      // off the operation's return value, no prose — the property this pin
      // protects (no field can carry model text) still holds.
      "postsAvailable",
      "postsUsed",
      "status",
    ]);
    // ...and the rendered output carries no free text beyond the product's own
    // sentences: the only interpolations are numbers and an opaque id, and the
    // id is not rendered.
    const html = outcomeHtml(state);
    expect(html).not.toContain(state.brainDocId);
    expect(html).not.toMatch(/blockquote/i);
    expect(html).not.toMatch(/word for word/i);
  });

  it("NON-VACUITY: the scan really would catch a promise in the product's own copy", () => {
    // The failure mode to rule out is a scan that sees nothing. A promise
    // planted in a PRODUCT string of the same outcome must still be caught.
    const html = outcomeHtml(OK_NEUTRAL).replace(
      "credit history",
      "We will learn your voice and generate your scripts. credit history"
    );
    const scanned = productCopy(html).toLowerCase();
    expect(
      FORBIDDEN.filter(([, re]) => re.test(scanned)).map(([l]) => l)
    ).toEqual(expect.arrayContaining(["learn", "we will", "generate"]));
  });

  it("NON-VACUITY: the outcome really does render (the scan is not over an empty string)", () => {
    // The exact reason the earlier states were vacuous: they rendered nothing.
    expect(productCopy(outcomeHtml(OK_NEUTRAL)).length).toBeGreaterThan(80);
    expect(
      productCopy(outcomeHtml({ status: "refused", code: "insufficient_credits" }))
        .length
    ).toBeGreaterThan(80);
    expect(outcomeHtml({ status: "idle" })).toBe("");
  });
});

describe("the run's OUTCOME states, driven by fixtures", () => {
  // `useActionState` yields only its initial state under `renderToStaticMarkup`,
  // so the panel alone can never render a charge or a refusal in a test. That
  // is why `RunOutcome` is its own pure component: it is this screen's stated
  // rule ("every state is reachable from a fixture") applied to the one control
  // that spends money.
  const copyByCode = Object.fromEntries(
    ONBOARDING_ERROR_CODES.map((c) => [c, onboardingErrorFor(c)!])
  );
  const outcome = (state: VoiceInferenceState) =>
    renderToStaticMarkup(
      <RunOutcome
        state={state}
        refusalCopy={copyByCode}
        fallbackCopy={onboardingErrorFor("unknown")!}
      />
    );

  const OK: VoiceInferenceState = {
    status: "ok",
    brainDocId: "00000000-0000-7000-8000-000000000001",
    claimPositions: 4,
    placeholders: 1,
    creditsCharged: 50,
    balanceAfter: 70,
    postsUsed: 3,
    postsAvailable: 3,
  };

  it("renders NOTHING before a run — no empty result box", () => {
    expect(outcome({ status: "idle" })).toBe("");
  });

  it("a charged run states the charge and the balance", () => {
    const html = outcome(OK);
    expect(html).toContain("50 credits");
    expect(html).toContain("70 credits");
  });

  it("it says HOW MANY rules were drafted and how many are unknown — never a ratio", () => {
    // Task 20. `placeholders` counts OUR evidence, not the creator. A ratio or
    // a percentage of their posts reads as a measurement of them, which is the
    // one thing this number must never be rendered as.
    const html = outcome(OK);
    expect(html).toContain("4 rules");
    expect(html).toMatch(/one is marked unknown/i);
    expect(html).not.toMatch(/\d+\s*%/);
    expect(html).not.toMatch(/\d+\s+of\s+your\s+\d+/i);
  });

  it("the corpus bound is stated when it BOUND, with the digits tracking the arguments", () => {
    // The compliance residual this closes (2026-08-29): `postsUsed` and
    // `postsAvailable` were computed, tested in the package, and then dropped
    // by the action before the view — while the screen implied the whole
    // corpus was read. Digits asserted, not prose, because the page-size
    // defect (2026-08-27) was exactly a covering test that asserted the
    // surrounding prose and never the numbers.
    const html = outcome({ ...OK, postsUsed: 50, postsAvailable: 200 });
    expect(html).toContain('data-testid="run-corpus-bound"');
    expect(html).toContain("your 50 most recent posts");
    expect(html).toContain("200 saved");
    expect(html).toContain("150 were not read");
  });

  it("the bound sentence does NOT render when everything saved was read", () => {
    // "Read all 3 of your 3 posts" is noise, and a sentence rendered when the
    // bound did not bind invites the ratio shape task 20 forbids.
    const html = outcome({ ...OK, postsUsed: 3, postsAvailable: 3 });
    expect(html).not.toContain("run-corpus-bound");
    // Fewer available than used is impossible from the operation (used is a
    // subset of available); the copy function still stays silent rather than
    // rendering a negative number.
    expect(outcome({ ...OK, postsUsed: 3, postsAvailable: 2 })).not.toContain(
      "run-corpus-bound"
    );
  });

  it("it points at the confirm screen, because nothing is in force yet", () => {
    const html = outcome(OK);
    expect(html).toContain('href="/brain"');
    expect(html).toMatch(/confirm/i);
  });

  it("the INCLUDED run says so, and does not render 0 as a price", () => {
    const html = outcome({ ...OK, creditsCharged: 0, balanceAfter: 120 });
    expect(html).toMatch(/included run/i);
    expect(html).toContain("120 credits");
    expect(html).not.toMatch(/cost 0/i);
  });

  it("NO inferred rule is rendered here — every one is shown beside its quote", () => {
    // R10, asserted where it would be easiest to break: the tempting change is
    // to show the creator "what we found" the moment it comes back. A rule
    // shown here is a claim about a person with its evidence on another page.
    // The state carries no rule text at all, and this pins the rendering too.
    const html = outcome(OK);
    expect(html).not.toMatch(/blockquote/i);
    expect(html).not.toContain(OK.status === "ok" ? OK.brainDocId : "");
  });

  it("a refusal renders the CODE's words, announced, and never the error's own", () => {
    const html = outcome({ status: "refused", code: "insufficient_credits" });
    expect(html).toContain('role="alert"');
    expect(html).toContain(onboardingErrorFor("insufficient_credits")!.title);
  });

  it("a code with NO entry degrades to neutral copy, never to nothing", () => {
    // The silent-nothing failure mode `onboardingErrorFor` was already
    // corrected for, asserted on the panel's own lookup this time.
    const html = renderToStaticMarkup(
      <RunOutcome
        state={{ status: "refused", code: "not_a_real_code" as never }}
        refusalCopy={{}}
        fallbackCopy={{ title: "Something went wrong", detail: "Nothing was spent." }}
      />
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain('role="alert"');
  });

  it("every refusal state renders words a reader can act on, for EVERY code (R18)", () => {
    for (const code of ONBOARDING_ERROR_CODES) {
      const html = outcome({ status: "refused", code });
      expect(html, code).toContain('data-testid="run-refusal"');
      expect(html.length, code).toBeGreaterThan(60);
    }
  });

  it("EVERY outcome is announced — the success branch too, not just the refusals", () => {
    // FOUND BY THE BROWSER WALK (2026-08-28), not by this file. Sampling a real
    // click showed that the moment `SubmitButton` sets `disabled`, the browser
    // drops focus to `<body>` — and the success branch carried no live region,
    // so a screen-reader user pressed the one control that spends money, lost
    // their place, and was told nothing at all. The refusals announced; the
    // spending did not.
    //
    // ASSERTED OVER BOTH BRANCHES, because the defect was that one of the two
    // was thought through and the other was not. A test naming only the branch
    // that was just fixed would go stale the same way.
    const success = outcome({
      status: "ok",
      brainDocId: "00000000-0000-7000-8000-000000000001",
      claimPositions: 4,
      placeholders: 0,
      creditsCharged: 0,
      balanceAfter: 0,
      postsUsed: 3,
      postsAvailable: 3,
    });
    expect(success, "a successful run must announce itself").toMatch(
      /role="(status|alert)"/
    );
    // ...and what it announces includes the two numbers R18 exists to state.
    expect(success).toContain("nothing was spent");
    expect(success).toContain("balance is now 0 credits");

    const refusal = outcome({
      status: "refused",
      code: ONBOARDING_ERROR_CODES[0],
    });
    expect(refusal, "a refusal must announce itself").toMatch(
      /role="(status|alert)"/
    );
  });
});

describe("the run control is wired, not assumed", () => {
  // The same source-reading shape the three scans below this file already use.
  const src = (rel: string) =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf8");
  const viewSrc = src("app/(product)/onboarding/run-inference-panel.tsx");
  const pageSrc = src("app/(product)/onboarding/page.tsx");

  it("the run control is the pending-disabled client button, not a bare <button>", () => {
    // The same rule as the two slice-1 write controls, and it matters MORE
    // here: a double click on those writes a duplicate row, on this one it is a
    // second attempt id, a second model call and a second debit.
    expect(viewSrc).toContain("<SubmitButton");
    expect(viewSrc.replace(/<SubmitButton/g, "")).not.toMatch(/<button\b/);
  });

  it("the run control is a 44px touch target, like every other primary control", () => {
    expect(viewSrc).toMatch(/minHeight: "44px"/);
    expect(viewSrc).toMatch(/minWidth: "44px"/);
  });

  it("the page computes the price sentence from its own two READS, not a literal", () => {
    // The digits, again: a hardcoded 50 here would render a price that stopped
    // matching config the moment an operator changed it.
    expect(pageSrc).toMatch(
      /runCostSentence\(\s*runIncludedCost,\s*runRebuildCost,\s*runBalance\s*\)/
    );
    expect(pageSrc).toContain("respinCredits.getBalance(scope.workspaceId)");
  });

  it("the page prices through the OPERATION'S own rule, not by indexing config", () => {
    // THE FIX FOR THE FROZEN ASSUMPTION (billing gate, 2026-09-02). This page
    // read `creditCosts.onboardingBrainRebuild` and let `runCostSentence`
    // assert "your first run is included" — true only while
    // `onboardingBrainBuild` is 0, which the schema does not require and
    // `/admin/config` can change. `onboardingBrainPrices` is `priceOf`'s two
    // onboarding branches, so the sentence and the debit read the same rule.
    // The same assertion `/onboarding/first-ideas` already carries, one
    // purpose over: the page must not index `creditCosts` itself.
    expect(pageSrc).toContain("onboardingBrainPrices(config.content)");
    expect(
      pageSrc.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""),
      "the page indexes creditCosts itself"
    ).not.toMatch(/creditCosts\./);
  });

  it("the action is BOUND to the profile id, and the control is absent without one", () => {
    expect(pageSrc).toContain(
      "runVoiceInferenceAction.bind(null, selectedProfile.id)"
    );
    expect(pageSrc).toMatch(/run=\{\s*selectedProfile/);
  });

  it("a PAUSE blocks the run, even though it does not block the paste", () => {
    // Not the paste rule under another name: `runInference` gates on the pause
    // at operation entry (R-30.1), and this is the courtesy that matches it.
    expect(pageSrc).toMatch(/const runBlock =[\s\S]{0,200}paused/);
  });
});

describe("the onboarding surface bootstraps before it scopes (browser-walk finding)", () => {
  // FOUND BY WALKING IT. The very first `/onboarding` load after signing up
  // rendered "This workspace is not available" — the layout's idempotent
  // bootstrap and the page render CONCURRENTLY, so on the one request where the
  // `users` row does not exist yet the page's `withWorkspace` read first. It
  // was reproduced deliberately afterwards (delete the domain `users` row, load
  // the page), fixed via `scopeForUser`, and re-checked: `/onboarding` renders,
  // `/usage` under the same state still does not — which is how we know the fix
  // is what closed it rather than a timing accident.
  //
  // A SOURCE SCAN, because the thing to prevent is someone "simplifying" the
  // page back to a bare `withWorkspace` — which would look tidier, pass every
  // other test in this repo, and restore a broken first impression for every
  // new creator.
  const read = (rel: string) =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf8");

  const SURFACE = [
    "app/(product)/onboarding/page.tsx",
    "app/(product)/onboarding/actions.ts",
  ];

  /** Bare `withWorkspace(` calls, i.e. not routed through `scopeForUser`. */
  const bareScopeCalls = (src: string): number =>
    [...src.matchAll(/respinDb\.withWorkspace\s*\(/g)].length;

  it.each(SURFACE)("%s scopes through scopeForUser, never bare", (rel) => {
    const src = read(rel);
    expect(src).toContain("scopeForUser");
    expect(
      bareScopeCalls(src),
      "a bare respinDb.withWorkspace here races the layout's bootstrap on a new creator's first request"
    ).toBe(0);
  });

  it("NON-VACUITY: the scan really would catch a bare call", () => {
    // Otherwise a broken regex reports zero violations because it found zero
    // candidates — the 2026-08-21 lesson, applied to this scan.
    expect(
      bareScopeCalls('const s = await respinDb.withWorkspace({ authUserId: u.id });')
    ).toBe(1);
    expect(bareScopeCalls("const s = await scopeForUser(user);")).toBe(0);
  });

  it("scopeForUser asks for the bootstrap BEFORE it scopes (order, not presence)", () => {
    const src = read("app/(product)/workspace-scope.ts");
    const bootstrap = src.indexOf("ensureUserWorkspace");
    const scope = src.indexOf("return respinDb.withWorkspace");
    expect(bootstrap).toBeGreaterThan(-1);
    expect(scope).toBeGreaterThan(-1);
    expect(
      bootstrap,
      "the bootstrap must precede the scope — reversed, this function is the bug it exists to fix"
    ).toBeLessThan(scope);
    // ...and it is AWAITED, so the scope cannot read before it commits.
    expect(src).toMatch(/await\s+respinDb\.ensureUserWorkspace/);
  });
});

describe("the stated limits come from the server's constants, not from prose", () => {
  // The limit was hand-copied into four places — two form attributes and two
  // copy strings — with nothing binding them, so moving a constant silently
  // made the copy wrong (billing + tenancy gate NOTEs, 2026-08-27). Two of the
  // four are gone (the `maxLength` attributes, removed for a separate and
  // sharper reason), and these pin the rest.
  const readRepo = (rel: string) =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf8");

  it("the page passes the server's own constants into the view", () => {
    const src = readRepo("app/(product)/onboarding/page.tsx");
    expect(src).toContain("postLimit={POST_CONTENT_MAX}");
    expect(src).toContain("nameLimit={DISPLAY_NAME_MAX}");
  });

  it("the refusal copy states the SAME numbers the server enforces", () => {
    // A literal in prose is unavoidable in a static copy map; what is avoidable
    // is nobody noticing when it drifts. This is that check.
    const copy = readRepo("app/(product)/billing-errors.ts");
    expect(copy, "post_content copy no longer states POST_CONTENT_MAX").toContain(
      POST_CONTENT_MAX.toLocaleString("en-US")
    );
    expect(copy, "profile_name copy no longer states DISPLAY_NAME_MAX").toContain(
      String(DISPLAY_NAME_MAX)
    );
  });

  it("the rendered limit text tracks the prop, not a literal", () => {
    const html = renderToStaticMarkup(
      <OnboardingView {...base} step="paste-posts" profileName="A" postLimit={1234} />
    );
    expect(html).toContain("1,234 characters");
    expect(html).not.toContain("20,000 characters");
  });
});

describe("the page's constants and its client islands are wired, not assumed", () => {
  const readRepo = (rel: string) =>
    readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", rel), "utf8");

  it("PAGE_SIZE + 1 stays inside the accessor's own ceiling", () => {
    // At `PAGE_SIZE >= ONBOARDING_PAGE_MAX` the fetch clamps, `morePosts` goes
    // permanently false, and the page silently claims completeness — the exact
    // dishonesty the clamp exists to prevent (production gate NOTE).
    const src = readRepo("app/(product)/onboarding/page.tsx");
    const pageSize = Number(/const PAGE_SIZE = (\d+);/.exec(src)?.[1]);
    expect(Number.isFinite(pageSize)).toBe(true);
    expect(pageSize + 1).toBeLessThanOrEqual(ONBOARDING_PAGE_MAX);
  });

  it("the refusal's focus island is actually mounted", () => {
    // `FocusOnMount` renders `null`, so `renderToStaticMarkup` cannot see it —
    // delete the element and every rendered assertion stays green while the
    // refusal goes silent again for a screen-reader user. That is the
    // "attribute is not the property" shape one level up (production NOTE 3),
    // so the wiring is asserted at the source.
    const view = readRepo("app/(product)/onboarding/onboarding-view.tsx");
    expect(view).toMatch(/<FocusOnMount\s+targetId="onboarding-refusal"\s*\/>/);
    expect(view).toContain('import { FocusOnMount }');
  });

  it("both submit controls are the pending-guarded client button, not a bare <button>", () => {
    const view = readRepo("app/(product)/onboarding/onboarding-view.tsx");
    expect(view).toContain("<SubmitButton");
    // A bare submit button would neither refuse a second press nor carry the
    // 44px style; the double-submit window and the touch bar both regress.
    expect(view).not.toMatch(/<button\s+type="submit"/);
  });

  it("the pending guard is the CLICK REFUSAL, not the aria state", () => {
    // THIS ASSERTION WAS ACCIDENTALLY VACUOUS FOR A DAY (2026-08-28). It read
    // `toContain("disabled={pending}")`, which was true of `disabled={pending}`
    // — and stayed true when the control moved to `aria-disabled={pending}`,
    // because the old string is a SUBSTRING of the new one.
    //
    // The move itself was right: `disabled` drops the element from the focus
    // order, so a keyboard or screen-reader user loses their place on the one
    // control that spends money. But `aria-disabled` is ADVISORY — it does not
    // prevent a submit. The refusal moved into an `onClick` guard, and nothing
    // asserted it: delete the guard and the double-submit window reopens
    // completely while this file stays green.
    //
    // So the property is asserted where it now lives, and the aria state is
    // asserted as the separate thing it is.
    const btn = readRepo("app/(product)/onboarding/submit-button.tsx");
    expect(btn).toContain("useFormStatus");
    // The REFUSAL: a press while pending must be prevented in code.
    expect(
      btn,
      "aria-disabled is advisory — without a click guard a second submit still fires, and onboarding_inputs has no dedupe and no delete"
    ).toMatch(/onClick=\{[^}]*pending[^}]*preventDefault\(\)/s);
    // The ANNOUNCEMENT, which is a different guarantee and must not be read as
    // the refusal.
    expect(btn).toContain("aria-disabled={pending}");
    expect(btn).toContain("aria-busy={pending}");
    // ...and the focus-order regression must not come back.
    expect(
      btn,
      "a bare `disabled` attribute drops focus to <body> on press — use aria-disabled plus the click guard"
    ).not.toMatch(/(?<!aria-)disabled=\{pending\}/);
  });
});

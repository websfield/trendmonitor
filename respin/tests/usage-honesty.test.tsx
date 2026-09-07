// `/usage` reads the SHARED CANON — which, until this file, it did not.
//
// THE GAP, stated as it was found (compliance gate, 2026-09-01).
// `tests/support/forbidden-claims.ts` is imported by `brain-ui`,
// `onboarding-ui`, `onboarding-interview-ui`, `studio-ui` and the modes
// suites — and by NO usage suite, although slice 6 added creator-facing copy
// to `/usage` (the by-mode burn split, the period line, the days-to-empty
// note). Nothing there violates the canon today. That is the point: the canon's
// own header says a screen added in a later slice should "inherit every word,
// instead of starting from whatever its author remembered", and a screen that
// no scan reads inherits nothing at all.
//
// WHY IT IS A SEPARATE FILE rather than lines in `usage-burn-by-mode.test.ts`:
// that suite is about where the by-mode number COMES FROM (R17a, mutation M13);
// this one is about what the page may SAY. Two different failures, two different
// files, so a reader who breaks one is told which.
//
// `/usage` IS A MONEY SCREEN AND ITS REFUSAL CHANNEL IS OPEN. Unlike `/studio`,
// which resolves `?e=` through a CLOSED set, `page.tsx` calls
// `billingErrorFromCode` — so ANY code in the shared table can render here, and
// the scan covers the whole table rather than a sample of it.
//
// NOT_BUILT_YET IS NOT APPLIED. `/usage` does not claim to generate, script or
// hook anything; those bans are about screens that promise a capability they do
// not have, and this screen promises none. What it must not do is claim
// CAPABILITY or CERTAINTY (the canon) or forecast PERFORMANCE (slice 6's
// addition, which is live here the moment the page names a mode a draft was
// written in).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CLAIM_SPECIMENS,
  FORBIDDEN_CLAIMS,
  PERFORMANCE_CLAIMS,
} from "./support/forbidden-claims";
import {
  BURN_PERIOD_COPY,
  UNCHARGED_CAP_WINDOW_CLAUSE,
} from "@respin/credits/app-server";
// The WINDOW AUTHORITY and the seeded document it reads. Imported from the
// package root rather than the app facade on purpose: `app/**` has no business
// deriving a cap's window (the lint denies it the root), but this scan's whole
// job is to check the creator-facing sentence against the derivation, and a
// second literal here would be the very drift it is testing for.
import { unchargedAttemptWindowStart } from "@respin/credits";
import { CONFIG_V1_SEED } from "@respin/db";
import {
  BILLING_ERROR_COPY,
  type BillingErrorCode,
} from "../app/(product)/billing-errors";
import {
  NO_BILLING_ACCOUNT_REASON,
  PORTAL_NOT_OWNER_REASON,
} from "../app/(product)/usage/copy";
import {
  UsageView,
  burnByModeNote,
  burnPeriodLine,
  type UsageViewProps,
} from "../app/(product)/usage/usage-view";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The canon plus slice 6's performance half — the two every screen inherits. */
const FORBIDDEN: [string, RegExp][] = [
  ...FORBIDDEN_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
  ...PERFORMANCE_CLAIMS.map(([l, re]) => [l, re] as [string, RegExp]),
];

/** React's `<script>` bootstrap is machinery, not copy — the studio rule. */
const visibleCopy = (html: string) =>
  html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

const AS_OF = new Date("2026-09-01T00:00:00.000Z");

const base: UsageViewProps = {
  balance: { ok: true, value: 20, asOf: AS_OF },
  burn: { ok: true, hasAnyDebit: true, totalDebit: 14 },
  period: { start: AS_OF, ...BURN_PERIOD_COPY.calendar_month },
  burnByMode: {
    ok: true,
    // A MODE NAMED ON SCREEN is what makes the performance half live here: the
    // panel labels a creator's spend with the kind of draft it bought.
    byMode: [
      { mode: "hooks", label: "Hook set", credits: 11, debits: 2 },
      { mode: "caption", label: "Caption", credits: 3, debits: 1 },
    ],
    notAGeneration: { credits: 5, debits: 1 },
    nonTerminalClaim: { credits: 0, debits: 0 },
  },
  runway: {
    state: "estimate",
    asOf: AS_OF,
    windowStart: AS_OF,
    trailingWindowDays: 30,
    minimumDebitDays: 3,
    debitDayCount: 3,
    balance: 20,
    totalDebit: 14,
    dailyRate: 14 / 30,
    daysToEmpty: 43,
  },
  brainAssets: {
    state: "available",
    brainVersions: 2,
    testedRules: 1,
    loggedResults: 3,
    feedback: 1,
  },
  rows: [
    {
      id: "l-1",
      createdAt: AS_OF,
      kind: "debit",
      delta: -5,
      expiresAt: null,
      ref: "att-1",
    },
  ],
  moreRows: false,
  paused: null,
  portal: { available: true, action: "/usage" },
  error: null,
  billingHref: "/settings/billing",
};

const render = (p: Partial<UsageViewProps> = {}) =>
  renderToStaticMarkup(<UsageView {...base} {...p} />);

/**
 * EVERY rendered state, named — not a sample.
 *
 * The compliance gate's central finding about `/studio` applies here word for
 * word: a scan that drives one happy fixture never reads the copy a creator in
 * trouble actually sees, and the states where a screen is most tempted to
 * reassure are exactly the degraded ones.
 */
const STATES: [string, Partial<UsageViewProps>][] = [
  ["the ordinary month", {}],
  [
    "a balance that could not be read",
    { balance: { ok: false, title: "Balance unavailable", detail: "Try again." } },
  ],
  ["a burn query that failed", { burn: { ok: false } }],
  ["nothing spent yet", { burn: { ok: true, hasAnyDebit: false } }],
  ["a by-mode query that failed", { burnByMode: { ok: false } }],
  [
    "an answered but empty split",
    {
      burnByMode: {
        ok: true,
        byMode: [],
        notAGeneration: { credits: 0, debits: 0 },
        nonTerminalClaim: { credits: 0, debits: 0 },
      },
    },
  ],
  [
    "a non-terminal claim, which should always be zero and is rendered anyway",
    {
      burnByMode: {
        ok: true,
        byMode: [{ mode: "hooks", label: "Hook set", credits: 5, debits: 1 }],
        notAGeneration: { credits: 0, debits: 0 },
        nonTerminalClaim: { credits: 5, debits: 1 },
      },
    },
  ],
  ["an empty ledger", { rows: [], moreRows: false }],
  ["a truncated ledger", { moreRows: true }],
  ["a paused workspace", { paused: { resumesAt: AS_OF } }],
  ["a pause with no end date", { paused: { resumesAt: null } }],
  [
    "a viewer, who may not open the portal",
    { portal: { available: false, reason: PORTAL_NOT_OWNER_REASON } },
  ],
  [
    "a workspace with no billing account",
    { portal: { available: false, reason: NO_BILLING_ACCOUNT_REASON } },
  ],
  [
    "a paid workspace, whose window is the billing cycle",
    { period: { start: AS_OF, ...BURN_PERIOD_COPY.billing_cycle } },
  ],
  [
    "a refusal code came back on the URL",
    { error: BILLING_ERROR_COPY.insufficient_credits },
  ],
];

/**
 * THE RATCHET: a canon exemption that can only ever shrink. IT IS EMPTY.
 *
 * This paragraph used to open "TWO SENTENCES THIS SCAN FOUND ON ITS FIRST RUN"
 * and describe them in the present tense — "They ARE genuine canon violations"
 * — after both had been fixed and the list emptied on 2026-09-01. That is the
 * same stale-claim class the rest of this round is about, one file up from the
 * copy it was written to police, so it is rewritten as the RULE the code
 * enforces rather than as a description of two entries that no longer exist.
 * The history is not lost: it is inside the array below, where it belongs,
 * because that is the thing whose emptiness needs explaining.
 *
 * WHAT THE MECHANISM IS FOR. A scan that finds a violation in a file the
 * change is not allowed to edit has three options: rewrite someone else's
 * file, quietly drop the rule, or record the violation with the fix it needs.
 * Only the third leaves the rule enforced everywhere else, so this list is the
 * third — the entry-baseline shape CLAUDE.md already sanctions.
 *
 * THE EXEMPTION IS THE SENTENCE, NEVER THE WORD. A banned word stays banned
 * everywhere else on the page, including in a second occurrence of the very
 * word an entry exempts, so an entry can never become a licence. Proven
 * against a SYNTHETIC list ("the exemption is the SENTENCE, never the word"),
 * because a mechanism test that goes vacuous the moment the live list empties
 * is the fail-open shape this repo keeps relearning (2026-08-21).
 *
 * THE RATCHET TURNS BOTH WAYS, and each direction has its own assertion in
 * "every OPEN_FINDING is still real":
 *   - an entry must BREAK the canon, so a decoration cannot quietly exempt
 *     clean copy; and
 *   - an entry's sentence must still be PRESENT in the shipped source, so the
 *     day it is fixed the suite goes red saying "FIXED — delete this entry".
 * An exception that outlives its defect is how a baseline becomes an excuse.
 *
 * IT STAYS AT ZERO RATHER THAN BEING DELETED, and the count is pinned so an
 * append is a deliberate edit to a number rather than one more line in a list.
 */
const OPEN_FINDINGS: readonly {
  sentence: string;
  where: string;
  why: string;
  fix: string;
}[] = [
  // EMPTY, AND THAT IS THE POINT. This list shipped with two entries when the
  // scan was written — `/usage` was not this suite's author's surface, so the
  // violations it found were RECORDED rather than fixed:
  //
  //   1. "Contact support with this page open and we will look at it."
  //      (`we will` — a promise about what the product does next)
  //   2. "…Your credit history below is still accurate."
  //      (`accurate` — a certainty claim this product holds no number for)
  //
  // Both were fixed in `usage-view.tsx` on 2026-09-01, in the round-1 gate fix
  // pass, and the ratchet below did exactly its job: it went RED on both,
  // saying "FIXED — delete this OPEN_FINDINGS entry". They are deleted here.
  //
  // The list stays, at zero, rather than being removed with them. A recorded
  // exemption that can only ever shrink is worth having; one that can be
  // appended to quietly is not, which is why the count is pinned below.
];

/**
 * Remove the given open-finding sentences — those exact strings and nothing else.
 *
 * PARAMETERISED, so it is provable with `OPEN_FINDINGS` EMPTY. Closing over the
 * live list meant the only test of this helper stopped asserting anything the
 * moment the list reached zero — the fail-open shape this repo keeps relearning
 * (2026-08-21): a scan with nothing to find is indistinguishable from a broken
 * one. The sentence-not-word test below now drives a SYNTHETIC list, so it
 * proves the mechanism whether or not any real finding is open.
 */
const withoutFindings = (
  html: string,
  findings: readonly { sentence: string }[]
): string => {
  let out = html;
  for (const f of findings) {
    // React escapes `'` to `&#x27;`, so the comparison is done on decoded text.
    out = out.split(f.sentence.toLowerCase()).join(" [open finding] ");
  }
  return out;
};

/** The live exemption: nothing, unless a finding is deliberately recorded above. */
const withoutOpenFindings = (html: string): string =>
  withoutFindings(html, OPEN_FINDINGS);

/**
 * The HTML entities decoded, so a sentence can be matched as it was written.
 *
 * SIX, NOT FIVE, and the sixth is the one that made this fail first time:
 * `renderToStaticMarkup` emits `&#x27;` for an apostrophe, but the SOURCE file
 * spells the same character `&apos;` (react/no-unescaped-entities). Both are
 * read here, so one function serves the render and the source scan.
 */
const decoded = (html: string) =>
  html
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

describe("/usage claims nothing this product cannot support", () => {
  it.each(STATES)("%s", (_label, props) => {
    const html = withoutOpenFindings(decoded(visibleCopy(render(props))).toLowerCase());
    for (const [label, re] of FORBIDDEN) {
      expect(html, `"${label}" appears on /usage`).not.toMatch(re);
    }
  });

  it("every OPEN_FINDING is still real — this list ratchets down and retires", () => {
    // CLAUDE.md's baseline rule: an exception outliving its defect is an
    // excuse. The day someone applies one of the fixes above, this goes RED and
    // the entry has to be deleted — which is the only way a "known violation"
    // list stays honest.
    const src = decoded(
      readFileSync(join(ROOT, "app", "(product)", "usage", "usage-view.tsx"), "utf8")
    ).replace(/\s+/g, " ");
    for (const f of OPEN_FINDINGS) {
      expect(
        src.includes(f.sentence.replace(/\s+/g, " ")),
        `${f.where}: FIXED — delete this OPEN_FINDINGS entry. ${f.fix}`
      ).toBe(true);
      // Each entry really does violate the canon, so none of them is a
      // decoration that quietly exempts clean copy.
      expect(
        FORBIDDEN.some(([, re]) => re.test(f.sentence.toLowerCase())),
        `${f.where} is on the list but breaks no rule`
      ).toBe(true);
    }
    // THE COUNT IS PINNED AT ZERO so a violation cannot be appended quietly.
    // Both original entries were fixed on 2026-09-01; recording a new one is a
    // deliberate edit to this number, which is the whole value of the pin.
    expect(OPEN_FINDINGS.length, "new violations are fixes, not new entries").toBe(0);
  });

  it("the exemption is the SENTENCE, never the word", () => {
    // DRIVEN AGAINST A SYNTHETIC LIST, because `OPEN_FINDINGS` is empty and a
    // test of an exemption mechanism that exempts nothing asserts nothing. The
    // property under test is the mechanism's SHAPE — that it removes one exact
    // sentence and does not become a word-level allowlist — and that property
    // has to stay proven during the (hopefully permanent) stretch when no real
    // finding is open.
    const synthetic = [
      {
        sentence:
          "This month's total could not be loaded right now. Your credit history below is still accurate.",
      },
    ];
    const planted = withoutFindings(
      (
        "this month's total could not be loaded right now. your credit history " +
        "below is still accurate. and our rules are accurate too."
      ).toLowerCase(),
      synthetic
    );
    // The exempted sentence is gone...
    expect(planted).toContain("[open finding]");
    // ...and a SECOND occurrence of the same banned word elsewhere still fires,
    // so this is not a word-level allowlist wearing a sentence's clothes.
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toContain(
      "accurate"
    );
  });

  it("with no finding open, the live exemption removes NOTHING", () => {
    // The direction the synthetic test above cannot cover: that the LIVE list
    // is genuinely empty, so no real page sentence is being quietly exempted.
    // If `OPEN_FINDINGS` regrows, this fails and names what it now hides.
    const sentence = "our rules are accurate.";
    expect(withoutOpenFindings(sentence)).toBe(sentence);
    expect(OPEN_FINDINGS.map((f) => f.sentence)).toEqual([]);
  });

  it("EVERY refusal code this screen can emit is scanned — the channel is OPEN", () => {
    // `/usage`'s `page.tsx` calls `billingErrorFromCode`, with no closed set to
    // narrow it (unlike `/studio`'s `STUDIO_ERROR_CODES`). So the population is
    // the WHOLE shared table, derived from it rather than sampled — every one
    // of these can be put on the URL and rendered in the banner.
    const codes = Object.keys(BILLING_ERROR_COPY) as BillingErrorCode[];
    expect(codes.length).toBeGreaterThan(40);
    for (const code of codes) {
      const copy = BILLING_ERROR_COPY[code];
      const text = `${copy.title} ${copy.detail}`.toLowerCase();
      for (const [label, re] of FORBIDDEN) {
        expect(text, `"${label}" appears in /usage's copy for ${code}`).not.toMatch(re);
      }
    }
  });

  it("the two uncharged-cap codes tell OPPOSITE truths, and the config decides which", () => {
    // THE STALE-CLAIM DEFECT, WITH A WITNESS (billing gate round 2,
    // 2026-09-01). `generation_uncharged_attempt_cap` shipped carrying its
    // sibling's rule — "the count is lifetime … the clearing act is an
    // operator fixing the cause" — and told the creator "There is nothing for
    // you to change". `generation.unchargedAttemptWindowMinutes` had already
    // made that false: the generation count is windowed and clears itself,
    // so the copy withheld the only remedy the creator has. Nothing pinned
    // either string, which is why the fix for stale claims shipped a new one.
    //
    // IT IS DERIVED FROM `unchargedAttemptWindowStart`, NOT FROM A LITERAL.
    // That function is a total `Record` over the purposes and is the single
    // authority on which count is windowed; asserting against it means
    // un-windowing the generation cap (or windowing onboarding's) reddens
    // HERE, on the sentence a creator reads, instead of leaving one purpose's
    // copy quietly describing the other's mechanism.
    const now = new Date("2026-09-01T12:00:00.000Z");
    const windowed = (purpose: string) =>
      unchargedAttemptWindowStart(
        CONFIG_V1_SEED,
        purpose as "generation",
        now
      ).getTime() > 0;

    // The population is a LIST of (purpose -> refusal code), because there is
    // one cap per priced purpose and a third purpose owes an entry here.
    const CAP_CODES: [string, BillingErrorCode][] = [
      ["generation", "generation_uncharged_attempt_cap"],
      ["onboarding_brain", "uncharged_attempt_cap"],
    ];
    // NON-VACUITY, and the thing the whole assertion turns on: the two
    // purposes really do answer differently today. If both were windowed (or
    // neither), the loop below would still pass while proving nothing.
    expect(CAP_CODES.map(([p]) => windowed(p))).toEqual([true, false]);

    for (const [purpose, code] of CAP_CODES) {
      const detail = BILLING_ERROR_COPY[code].detail;
      expect(
        detail.includes(UNCHARGED_CAP_WINDOW_CLAUSE),
        `${code}: a ${windowed(purpose) ? "WINDOWED" : "LIFETIME"} cap's copy ${
          windowed(purpose) ? "must state that it clears on its own" : "must not promise it clears"
        }`
      ).toBe(windowed(purpose));
      // A WINDOWED CAP MAY NOT SAY THE READER HAS NOTHING TO DO — that
      // sentence WAS the defect, because waiting is something to do and the
      // copy was hiding it. The lifetime one may keep it: there really is no
      // creator-side act, and saying so plainly is what a dead-end refusal
      // owes (the 2026-07-30 "never without a way forward" rule cuts both
      // ways — name the way forward when there is one, admit it when there is
      // not). So the assertion is scoped to the windowed side rather than
      // applied to both and quietly forcing a lie onto the other.
      if (windowed(purpose)) {
        expect(
          detail.toLowerCase(),
          `${code}: a cap that clears itself must not tell the creator there is nothing they can do`
        ).not.toContain("there is nothing for you to change");
      }
    }

    // ...and the clause really is IMPORTED rather than retyped: two literals
    // are how the stale one survived a fix pass. Composition, not equality of
    // two hand-kept-in-step strings.
    expect(
      BILLING_ERROR_COPY.generation_uncharged_attempt_cap.detail
    ).toContain(UNCHARGED_CAP_WINDOW_CLAUSE);
    expect(UNCHARGED_CAP_WINDOW_CLAUSE.length).toBeGreaterThan(30);
  });

  it("the page's own spend and runway sentences are scanned from rendered states", () => {
    const runwayStates = [
      { ...base.runway, state: "paused" as const },
      { ...base.runway, state: "no_spend" as const },
      { ...base.runway, state: "too_few_debit_days" as const, debitDayCount: 2 },
      { state: "read_unavailable" as const, component: "config" as const, asOf: AS_OF },
      { state: "read_unavailable" as const, component: "pause" as const, asOf: AS_OF },
      { state: "read_unavailable" as const, component: "balance" as const, asOf: AS_OF },
      { state: "read_unavailable" as const, component: "ledger" as const, asOf: AS_OF },
    ] as unknown as UsageViewProps["runway"][];
    const sentences = [
      burnByModeNote(),
      burnPeriodLine({ start: AS_OF, noun: "month", phrase: "this calendar month" }),
      burnPeriodLine({ start: AS_OF, noun: "period", phrase: "this billing period" }),
      ...runwayStates.map((runway) => visibleCopy(render({ runway }))),
      NO_BILLING_ACCOUNT_REASON,
      PORTAL_NOT_OWNER_REASON,
    ];
    for (const s of sentences) {
      expect(s.length).toBeGreaterThan(10);
      for (const [label, re] of FORBIDDEN) {
        expect(s.toLowerCase(), `"${label}" in /usage's own copy`).not.toMatch(re);
      }
    }
  });

  it("NON-VACUITY: a planted promise in a RENDERED state IS caught", () => {
    // A scan reporting no violations is otherwise indistinguishable from a scan
    // that is not running (CLAUDE.md, 2026-08-21). The label is a real prop the
    // server supplies — `modeLabel` off `@respin/credits` (R-66) — so this is
    // the exact channel by which a forecast could reach this page.
    const planted = visibleCopy(
      render({
        burnByMode: {
          ok: true,
          byMode: [
            {
              mode: "hooks",
              label: "Hook set — these improve, get more reach and more views",
              credits: 11,
              debits: 2,
            },
          ],
          notAGeneration: { credits: 0, debits: 0 },
          nonTerminalClaim: { credits: 0, debits: 0 },
        },
      })
    ).toLowerCase();
    expect(FORBIDDEN.filter(([, re]) => re.test(planted)).map(([l]) => l)).toEqual(
      expect.arrayContaining(["improve", "views", "more reach"])
    );
    // ...and the clean label produces NO findings, so the probe above is
    // measuring the plant rather than the page.
    expect(
      FORBIDDEN.filter(([, re]) => re.test(visibleCopy(render()).toLowerCase()))
    ).toEqual([]);
  });

  it("NON-VACUITY, per word: every pattern catches its OWN specimen", () => {
    // PER WORD, not per list. One injected string satisfied by two patterns
    // leaves a typo in a third invisible — the finding `/onboarding`'s scan
    // already produced once (2026-08-27).
    for (const [label, re] of FORBIDDEN) {
      expect(CLAIM_SPECIMENS[label], label).toBeDefined();
      expect(CLAIM_SPECIMENS[label].toLowerCase(), label).toMatch(re);
    }
  });

  it("the period line RENDERS, and its noun is the one the tier earned", () => {
    // THE ASSERTION A SOURCE SCAN WAS STANDING IN FOR. `period` shipped
    // OPTIONAL only because making it required reddened a fixture, and the
    // absence was covered by scanning `page.tsx` for the prop — which proves a
    // line of source exists, not that a creator reads a correct sentence.
    //
    // WHY IT IS A MONEY ASSERTION AND NOT A COPY ONE: a dead subscription's
    // stale `current_period_start` used to anchor "this month", so a former
    // subscriber saw many months of Free burn summed under that heading.
    // `burnPeriod` is tier-keyed now; this is the half that reads the result.
    const free = render({ period: { start: AS_OF, ...BURN_PERIOD_COPY.calendar_month } });
    expect(free).toContain('data-testid="burn-period"');
    expect(free).toContain("Since 2026-09-01");
    expect(decoded(free)).toContain(BURN_PERIOD_COPY.calendar_month.phrase);
    // The HEADING and the in-sentence noun come from the same period, so the
    // panel cannot name two windows.
    expect(decoded(free)).toContain("This month");
    expect(decoded(free)).toContain(
      `14 credits spent ${BURN_PERIOD_COPY.calendar_month.noun}`
    );

    const paid = render({ period: { start: AS_OF, ...BURN_PERIOD_COPY.billing_cycle } });
    expect(paid).toContain('data-testid="burn-period"');
    expect(decoded(paid)).toContain(BURN_PERIOD_COPY.billing_cycle.phrase);
    expect(decoded(paid)).toContain("This billing period");
    expect(decoded(paid)).toContain(
      `14 credits spent ${BURN_PERIOD_COPY.billing_cycle.noun}`
    );

    // THE TWO ARE GENUINELY DIFFERENT SENTENCES, so a renderer that ignored the
    // prop and printed one of them always would fail here rather than pass by
    // agreeing with itself half the time.
    expect(BURN_PERIOD_COPY.calendar_month.noun).not.toBe(
      BURN_PERIOD_COPY.billing_cycle.noun
    );
    expect(decoded(free)).not.toContain(BURN_PERIOD_COPY.billing_cycle.phrase);
    expect(decoded(paid)).not.toContain(BURN_PERIOD_COPY.calendar_month.phrase);
    // ...and the empty-burn branch uses the noun too, which is the sentence a
    // brand-new Free workspace actually reads.
    const quiet = decoded(
      render({
        burn: { ok: true, hasAnyDebit: false },
        period: { start: AS_OF, ...BURN_PERIOD_COPY.billing_cycle },
      })
    );
    expect(quiet).toContain(`Nothing spent ${BURN_PERIOD_COPY.billing_cycle.noun}.`);
  });

  it("the FAILED-BURN branch names the same window as the two lines around it", () => {
    // THE BRANCH BOTH GATES RAISED (round 2, 2026-09-01), and the branch the
    // scan above could not reach: `burn.ok === false` renders neither the
    // total nor the empty-burn sentence, so every noun assertion in this file
    // stepped straight over it. It shipped "This month's total could not be
    // loaded right now." for every workspace.
    //
    // IT IS THE WORST PLACE FOR THE WRONG NOUN, not a cosmetic one: it is the
    // only state where the creator has no number in front of them to reconcile
    // the label against, and it sits BETWEEN a heading and a dated period line
    // that both name the real window.
    const paid = decoded(
      render({
        burn: { ok: false },
        period: { start: AS_OF, ...BURN_PERIOD_COPY.billing_cycle },
      })
    );
    expect(paid).toContain(
      "This billing period's total could not be loaded right now."
    );
    // THE OTHER WINDOW'S WORD IS ABSENT FROM THE WHOLE PANEL — the finding was
    // never "one wrong sentence", it was two windows named on one screen.
    expect(paid).not.toContain("This month");
    expect(paid).toContain(BURN_PERIOD_COPY.billing_cycle.phrase);

    // AND THE FREE SIDE, so the branch is driven on both — a renderer that
    // hard-coded the OTHER noun would otherwise pass the assertion above by
    // agreeing with itself.
    const free = decoded(
      render({
        burn: { ok: false },
        period: { start: AS_OF, ...BURN_PERIOD_COPY.calendar_month },
      })
    );
    expect(free).toContain("This month's total could not be loaded right now.");
    expect(free).not.toContain("This billing period");
  });

  it("`period` is REQUIRED — there is no fallback noun left to inherit", () => {
    // The type says so; this asserts the SCREEN does, because a type is erased
    // and a `?? "this month"` would compile. Both defaults that used to exist
    // are gone from the source, and the population is the whole file rather
    // than the two lines that had them.
    const src = readFileSync(
      join(ROOT, "app", "(product)", "usage", "usage-view.tsx"),
      "utf8"
    );
    expect(src).toContain("period: BurnPeriodView;");
    expect(src).not.toContain("period?: BurnPeriodView");
    // A NEGATIVE ASSERTION FAILS OPEN WHEN ITS PATTERN BREAKS, so both are
    // proved against a PLANTED counterexample before being trusted (2026-08-21,
    // and a live instance of it in this very pass: three `.not.toMatch`
    // patterns were written with a lost backslash, turning a literal backspace byte into a
    // BACKSPACE, and every one of them passed everything).
    const TERNARY_DEFAULT = /period \? [\s\S]{0,40}: "[Tt]his month"/;
    const OPTIONAL_CHAIN = /period\?\.(noun|phrase|start)/;
    expect(TERNARY_DEFAULT.test('const n = period ? period.noun : "this month";')).toBe(
      true
    );
    expect(OPTIONAL_CHAIN.test("const n = period?.noun;")).toBe(true);
    expect(TERNARY_DEFAULT.test("const n = period.noun;")).toBe(false);
    expect(OPTIONAL_CHAIN.test("const n = period.noun;")).toBe(false);
    expect(src).not.toMatch(TERNARY_DEFAULT);
    expect(src).not.toMatch(OPTIONAL_CHAIN);
    // THE THIRD SHAPE, AND THE ONE THE FIRST TWO COULD NOT SEE (billing +
    // tenancy gates, round 2, 2026-09-01). The comment above claimed "the
    // population is the whole file rather than the two lines that had them" —
    // and it was, for the two shapes it knew about. A HARD-CODED noun is
    // neither an optional chain nor a ternary default, so `burn-total-error`
    // shipped "This month&apos;s total could not be loaded right now." inside
    // the panel whose heading is `capitalise(period.noun)` and whose period
    // line prints the window's start date: three lines, two windows, on a
    // money screen, in the one branch where the creator cannot see the number
    // to check it against. Both gates raised it independently and this scan
    // was silent, which is what makes it a population defect rather than a
    // copy one.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is load-bearing rather than
    // tidiness: five comments in `usage-view.tsx` quote "this month" precisely
    // BECAUSE they are recording this defect, so a scan over the raw text
    // could only ever be red and would have to be deleted.
    const RENDERABLE = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    const HARD_CODED_NOUN = /[Tt]his (month|billing period)/;
    // PROVED AGAINST A PLANT IN EACH DIRECTION before it is trusted
    // (2026-08-21): a scan that reports zero violations is otherwise
    // indistinguishable from one whose pattern is broken.
    expect(HARD_CODED_NOUN.test("<p>This month&apos;s total</p>")).toBe(true);
    expect(HARD_CODED_NOUN.test("<p>this billing period is busy</p>")).toBe(true);
    expect(HARD_CODED_NOUN.test("{capitalise(periodNoun)}")).toBe(false);
    // ...and that the STRIPPER really removes a comment rather than the scan
    // passing because the pattern is broken.
    expect(
      HARD_CODED_NOUN.test(
        `// said "This month" to every workspace\n`
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*/g, "")
      )
    ).toBe(false);
    expect(
      RENDERABLE,
      "a window noun is hard-coded in /usage's markup — take it from `period`"
    ).not.toMatch(HARD_CODED_NOUN);
    // NON-VACUITY: the stripper must not have eaten the whole file, or the
    // assertion above passes on an empty string.
    expect(RENDERABLE).toContain("export function UsageView");
    expect(RENDERABLE.length).toBeGreaterThan(2000);
    // BURN_PERIOD_COPY is TOTAL over the two kinds, so "no third answer" is a
    // property of the map rather than a hope.
    expect(Object.keys(BURN_PERIOD_COPY).sort()).toEqual([
      "billing_cycle",
      "calendar_month",
    ]);
    for (const v of Object.values(BURN_PERIOD_COPY)) {
      expect(v.noun.length).toBeGreaterThan(3);
      expect(v.phrase.length).toBeGreaterThan(3);
    }
  });

  it("the scan reads the REAL screen, not a copy of it", () => {
    // The whole value of a rendered scan is that it reads shipped code. A
    // fixture-shaped `UsageView` in this file would pass forever.
    const src = readFileSync(join(ROOT, "app", "(product)", "usage", "usage-view.tsx"), "utf8");
    expect(src).toContain("export function UsageView");
    // ...and the render really produced this screen rather than an empty node.
    const html = render();
    expect(html).toContain("Usage");
    expect(html).toContain("Hook set");
    expect(html.length).toBeGreaterThan(500);
  });
});

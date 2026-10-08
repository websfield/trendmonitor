// Every word `/results` says, in one place, and this module IMPORTS NOTHING.
//
// WHY IT IMPORTS NOTHING (the `studio/run-copy.ts` header's rule, verbatim in
// effect): `log-panel.tsx` is a `"use client"` module, and every `@respin/*`
// specifier a client module reaches drags `pg` into the browser bundle —
// `tests/client-bundle-boundary.test.ts` records the shape and `next build`
// records the cost (a "Module not found: Can't resolve 'tls'" that names
// neither the import nor the file). So the vocabularies this screen renders
// arrive as PROPS, resolved server-side in `page.tsx` from `@respin/db`, and
// this file holds only their words.
//
// THE HONESTY LOAD THIS SCREEN CARRIES (R20). It is the first screen in the
// product that puts a number about a creator's own post beside another number
// about their own posts, which is precisely the shape a reader turns into a
// prediction. Everything below is written so that no sentence on this screen
// says what the next post will do — and because R20 is an ABSENCE (nothing
// fails automatically when a screen drifts into forecasting), the exact
// strings are pinned in `tests/results-honesty.test.tsx`, the technique
// `tests/usage-honesty.test.tsx` and `tests/landing-pricing.test.ts` use.

/** The h1. */
export const RESULTS_HEADING = "Results";

/**
 * R20's LOAD-BEARING SENTENCE, on every state of this screen.
 *
 * It is two claims and it needs both: what these numbers ARE (a description of
 * posts already published) and what they are NOT (a forecast). A screen that
 * only says the first invites the second to be assumed.
 */
export const PAST_NOT_PREDICTION =
  "Everything on this page describes posts you have already published. It is not a forecast: nothing here says what your next post will do, and no comparison below is a promise about anything you have not posted yet.";

/**
 * R20's SECOND HALF, and the limitation the 9a card says must stay visible:
 * "median difference at n = 3 is descriptive, not statistical proof — a test
 * can enforce the definition and cannot make the cohort representative".
 *
 * It names the confounders in the same breath because a comparison that files
 * its confounders away is a stronger claim than the data supports (REQ-F02).
 */
export const DESCRIPTIVE_NOT_PROOF =
  "A difference between two medians over a handful of posts is a description of what happened, not evidence that one thing caused the other. The flags you tick when you log a result come from a short fixed list this product offers — not everything that could explain a difference — and anything you noticed that is not on that list is not recorded anywhere a comparison can read.";

/**
 * WHY THE THIRD EVIDENCE STATE IS NOT ON THE FORM (R6, contract C1).
 *
 * The vocabulary has three states and this build can honestly assign two. The
 * screen names the third rather than hiding it, because a creator who cannot
 * see it cannot know that "verified" is a thing this product does not do yet —
 * and `results_connector_verified_iff_provenance` in `packages/db` is what
 * makes the absence structural rather than a habit of this form.
 */
export const CONNECTOR_NOT_OFFERED =
  "There is a third state, connector verified, and it is not on this form. It means the numbers came straight from the platform through a connection this product holds, and this product holds no such connection yet — so nothing you log here can be marked verified, by you or by us. The database refuses that state unless the connector evidence exists.";

/**
 * WHERE THE STORED LABEL ACTUALLY COMES FROM (R6), said on the form.
 *
 * `recordResult` DERIVES `evidence_state` from whether numbers arrived and
 * offers no parameter for it, which is a stronger property than validating a
 * creator's claim: there is no request through which anything could say
 * "verified". The radio below is therefore an INTENT control — it decides
 * which fields this form shows you — and the label on the row is decided by
 * what you actually typed. The two cannot disagree, and this sentence is what
 * keeps that from being a surprise.
 */
export const EVIDENCE_DERIVED_NOTE =
  "The label a result carries is decided by what you type, not by what you pick here: numbers you enter are stored as self reported, and a result with no numbers is stored as having none. This choice only decides which fields the form shows you.";

/** Words for one evidence state, and whether a creator may claim it here. */
export type EvidenceStateCopy = {
  label: string;
  /** What claiming it means, in the creator's terms. */
  meaning: string;
  offered: boolean;
  /**
   * Whether choosing this intent means the creator will be typing numbers.
   *
   * A FLAG ON THE DATA RATHER THAN A STRING LITERAL IN THE PANEL. The lever
   * fields are shown or withheld by this boolean, so `log-panel.tsx` — a
   * client module that may not reach `@respin/db` — never has to spell
   * `"unquantified"` to decide. A state this screen does not know defaults to
   * `true` (see `UNKNOWN_EVIDENCE_STATE`), because hiding a creator's input
   * fields is the worse failure of the two.
   */
  numbers: boolean;
  /**
   * The word a logged result wears in the list, and the badge shape carrying
   * it (DESIGN.md: filled = VERIFIED, dashed = UNVERIFIED, and status is never
   * colour-only, so the word is always there).
   *
   * ON THE MAP RATHER THAN A TERNARY IN THE LIST, and this replaced exactly
   * such a ternary: `quantified ? "SELF REPORTED" : "NO NUMBERS"` labels a
   * THIRD state as self reported the day one exists, on the column whose whole
   * job is to say how good the evidence is. The variant is spelled out rather
   * than imported from `app/ui/badge` because this module imports nothing (see
   * the header); the assignment at the call site is what type-checks it.
   */
  badge: string;
  badgeVariant: "filled" | "outline" | "dashed";
  /** Required when `offered` is false: what would have to be true instead. */
  whyNotOffered?: string;
};

/**
 * THE POPULATION IS A LIST, AND THE LIST IS THIS MAP (CLAUDE.md, 2026-08-29).
 *
 * `tests/results-entry.test.tsx` derives `RESULT_EVIDENCE_STATES` from
 * `@respin/db` and asserts the keys here are EXACTLY that set — so a state
 * added upstream is a red test naming the missing words, not a radio button
 * labelled `quantified_self_reported` or, worse, a state silently dropped from
 * a form whose whole job is to let a creator say how good their evidence is.
 *
 * A state with no entry here is rendered as NOT OFFERED and named (see
 * `evidenceStateCopy`), which is the fail-visible direction: the creator sees
 * that a state exists and that this screen will not claim it.
 */
export const EVIDENCE_STATE_COPY: Readonly<Record<string, EvidenceStateCopy>> = {
  unquantified: {
    label: "I posted it, but I do not have numbers",
    meaning:
      "Stored with your other results and never counted into any comparison on this page — there is nothing to count. It is kept because a post you cannot measure still happened.",
    offered: true,
    numbers: false,
    badge: "NO NUMBERS",
    badgeVariant: "outline",
  },
  quantified_self_reported: {
    label: "I read these numbers off the platform and typed them in",
    // R-115 / audit Phase 2 P2-A1: this sentence said "every comparison built
    // from them carries that label" — a comparison no self-reported row can
    // enter. Stored and shown, never counted.
    meaning:
      "Stored and shown as self reported, which is what it is. Nothing here checks the numbers against the platform, so they never enter a comparison, a median or a proposal.",
    offered: true,
    numbers: true,
    badge: "SELF REPORTED, UNVERIFIED",
    badgeVariant: "dashed",
  },
  connector_verified: {
    label: "Connector verified",
    meaning:
      "The numbers came from the platform through a connection this product holds.",
    offered: false,
    numbers: true,
    badge: "CONNECTOR VERIFIED",
    badgeVariant: "filled",
    whyNotOffered: CONNECTOR_NOT_OFFERED,
  },
};

/** The fallback for a state this screen has no words for. Never a radio. */
export const UNKNOWN_EVIDENCE_STATE: EvidenceStateCopy = {
  label: "A state this screen has no words for",
  meaning:
    "This product stores a state this screen cannot describe, so it is not offered here.",
  offered: false,
  numbers: true,
  badge: "UNRECOGNISED STATE",
  badgeVariant: "dashed",
  whyNotOffered:
    "This screen has no wording for that state yet, so it is not on the form. That is a gap in this page, not something you did.",
};

export function evidenceStateCopy(code: string): EvidenceStateCopy {
  return EVIDENCE_STATE_COPY[code] ?? UNKNOWN_EVIDENCE_STATE;
}

/**
 * The confounder codes in words (R7). Keys are pinned to
 * `RESULT_CONFOUNDER_CODES` by `tests/results-entry.test.tsx`, same rule and
 * same reason as the evidence states above.
 *
 * A code with no label RENDERS AS THE CODE rather than disappearing: dropping
 * it would silently narrow what a creator is allowed to say about their own
 * result, and an ugly `topic_overlap` on screen is a smaller harm than a
 * missing checkbox nobody can see is missing.
 */
export const CONFOUNDER_LABELS: Readonly<Record<string, string>> = {
  topic_overlap: "This post covered much the same topic as another one of mine",
  posting_time_unknown: "I am not sure what time of day this went out",
  account_growth: "My following changed a lot over this window",
  spillover_from_other_post: "Another post of mine was doing a lot at the same time",
  external_promotion: "Something outside the platform pointed people at this",
  platform_change: "The platform changed something over this window",
};

export function confounderLabel(code: string): string {
  return CONFOUNDER_LABELS[code] ?? code;
}

/** The two levers, in words. Never merged, so never one label. */
export const LEVER_LABELS: Readonly<Record<string, string>> = {
  reach: "Reach",
  conversion: "Conversion",
};

export function leverLabel(lever: string): string {
  return LEVER_LABELS[lever] ?? lever;
}

/**
 * WHY BOTH LEVERS ARE ALWAYS SHOWN AND NEVER ADDED UP (R9/REQ-F04).
 *
 * The sentence exists because the temptation is real and cheap: one number is
 * easier to read than two, and the moment there is one number a creator will
 * compare it to somebody's. Saying so is what makes the two-panel layout a
 * decision rather than a lack of a summary.
 */
export const TWO_LEVERS_NOTE =
  "Reach and conversion are kept apart everywhere on this page, including on each card. There is no combined score, because adding a count of people to a rate of action produces a number that means nothing.";

/** The declared-metric refusal (R8). Named remedy, never a silent default. */
export const NO_DECLARED_METRIC_TITLE =
  "This creator profile has no declared north-star metric yet";

export function noDeclaredMetricDetail(brainHref: string): string {
  return `A result is a measurement, and a measurement needs a stated unit and a stated direction before it means anything. This profile has not declared one, so there is nothing to log a number against and this page will not pick one for you. Declare it on the brain page (${brainHref}) under "Your north-star metric" — the label, the unit, and whether higher or lower is better — then come back and log the result.`;
}

/** The generation-less result, stated ON the form (contract C4). */
export const NO_GENERATION_MEANING =
  "A result that is not about one of your Respin drafts is stored and shown, and it never joins a treatment group — there is nothing to say what it tested, and nothing is invented to fill that in. Numbers you type in are kept with it and never counted into a baseline: only a verified analytics connector could supply a counted result, and none is connected.";

export const NO_GENERATION_OPTION_LABEL = "Not one of my Respin drafts";

/**
 * WHAT THE OUTPUT PICKER IS, said unconditionally.
 *
 * THE GAP IT NAMES: the scoped reader pages, and this picker renders that page
 * as if it were every output the creator has. Past the bound an older draft is
 * simply ABSENT from the list, with nothing on screen saying so — a creator
 * who made it would look for their post, not find it, and conclude the product
 * had lost it.
 *
 * IT IS RENDERED WHETHER OR NOT THE BOUND IS HIT, deliberately: copy that
 * appears only past a threshold is copy nobody reviews and no test drives, and
 * the threshold here is one almost no fixture will ever cross. An always-true
 * sentence is a sentence somebody reads.
 *
 * IT NAMES NO NUMBER, and that is not squeamishness about counts. The bound is
 * `LEDGER_PAGE_MAX`, which lives in `@respin/db` and is not on the sanctioned
 * import surface for `app/**` — so a figure typed here would be a second copy
 * of a limit this screen cannot read, drifting the day it moves. That is the
 * defect `tests/landing-pricing.test.ts` exists to stop, one screen over. The
 * sentence describes the SHAPE of the list instead, which stays true at any
 * bound.
 *
 * AND THERE IS NO "…AND THERE ARE MORE" HALF, which would be sharper and is
 * not available honestly. Detecting the clip needs either the bound (which
 * this screen may not name) or a second query for one row past the end (an
 * extra round trip on every load, and a race with a generation created between
 * the two reads) — so what is claimed here is exactly what this page knows.
 *
 * IT SAYS THE GAP IS OPEN, in its last clause, because it is: this narrows the
 * defect from "silently absent" to "visibly partial" and closes nothing. A
 * creator past the bound still cannot log a result against an older output.
 */
export const PICKER_RECENT_ONLY =
  "This list only ever shows your most recent outputs, not everything you have made. If the one you are logging a result for is older than these, it is not in the list, and searching back through all of them is not built yet — logging it without a draft is the way to record it today.";

/** The observation window, stated where it binds. */
export const WINDOW_NOTE =
  "A ratio with no period behind it has no denominator, so both dates are required. Two results about the same output, the same metric and the same window are the same observation: log a different window if you are reporting how it did later.";

/** The denominator rule, stated on the control (WCAG 3.3.2: limits up front). */
export const DENOMINATOR_NOTE =
  "Each lever needs its own count and its own denominator — the number of people the count is out of. A denominator of zero is not a small number, it is undefined, and it is refused.";

/**
 * THE NOTE'S CEILING, stated on the control (WCAG 3.3.2, and DESIGN.md's
 * "limits stated up front, refuse never truncate").
 *
 * IT TAKES THE NUMBER RATHER THAN HOLDING ONE, the `feedbackNoteLimit`
 * precedent: `RESULT_NOTE_MAX` lives in `@respin/db` and this module imports
 * nothing, so the page reads the constant and passes it down. A figure typed
 * here would be a second copy of a limit that moves.
 *
 * CODE POINTS, WHICH IS NOT WHAT THE BROWSER COUNTS. `recordResult` refuses
 * at 2,001 CODE POINTS; a textarea's `maxLength` counts UTF-16 CODE UNITS, so
 * for astral characters (an emoji is two units, one point) the browser stops a
 * creator EARLIER than the server would. That is the safe direction — the form
 * never lets through something the writer will refuse — and it is stated
 * rather than smoothed over, because the two numbers are the same only for
 * text in the basic plane.
 *
 * THERE IS NO DATABASE CEILING BEHIND THIS. The column has only its
 * "says something" CHECK, so this constant IS the limit rather than a screen's
 * echo of one — which is why stating it here is the whole guard a creator gets
 * before they lose a long note.
 */
export function resultNoteLimit(max: number): string {
  return `Optional. Up to ${max} characters. Anything longer is refused rather than shortened, so nothing you write is quietly cut.`;
}

/** The note field. Nothing branches on it, and the form says so. */
export const NOTE_MEANING =
  "Kept with the result in your own words. Nothing on this page reads it, nothing counts it, and no comparison changes because of it.";

/** What a press does and does not spend. */
export const LOG_COSTS_NOTHING =
  "Logging a result spends no credits and calls no model. It writes one row.";

export const LOG_PENDING_LABEL = "Recording your result…";

/** The heading over the comparison section. */
export const COMPARISON_HEADING = "Against your own earlier results";

/**
 * THE FIRST OF THE THREE EVIDENCE STATES (R-115, Phase 10a C1): only
 * self-reported or unquantified results exist, so no comparison is computed.
 * Said before any population sentence, because every population below would
 * otherwise read "no results at all" about results the creator can see.
 */
export const VERIFICATION_UNAVAILABLE =
  "Comparison unavailable: verified analytics are not connected. Your logged results stay listed above with their evidence label; self-reported numbers do not enter a comparison, a median or a proposal.";

/**
 * WHAT THE COMPARISON IS, in one sentence, before any of it is read.
 *
 * Names all six predicates, because a creator who cannot see what "comparable"
 * meant cannot tell an absent comparison from a broken one.
 */
/**
 * WHICH METRIC VERSIONS ARE COMPARED, in the same clauses `COMPARISON_BASIS`
 * uses (audit Phase 2, P2-A5). `/results` used to say results "measured under
 * different versions are never compared with each other" while the basis
 * sentence — and the code, which keys the stratum on `metricDeclarationKey` —
 * compares matching declarations across versions. `tests/results-honesty
 * .test.tsx` pins both to the four tuple clauses.
 */
export const METRIC_VERSIONS_NOTE =
  "Results you logged earlier keep the version of this metric they were measured under, including its unit and its direction. Results are compared only when their declared metric tuple matches — key, label, unit, and direction — even when matching declarations came from more than one version of your strategy; a declaration that differs in any one of the four is never compared with another.";

export const COMPARISON_BASIS =
  "A comparison is only built from your own results that share all of this: the same creator profile, the same platform, the same organic or paid class, and the same declared metric tuple — key, label, unit, and direction — even when matching declarations came from more than one version of your strategy. A treatment group additionally shares what was tested. Your baseline is the median of your own other results in the same group, with every result of the treatment itself left out. The window printed on a card is not a period the compared results all share: it is a span wide enough to hold your results in this group, and results months apart can sit in one comparison.";

/** The median rule, said where the number is (question 2 of the phase-9 card). */
export const MEDIAN_NOTE =
  "The middle value, not the average. One unusual post moves an average, and an unusual post is the thing you are looking for.";

/**
 * The absence sentence for a population that is short (C5 rule 6, R12).
 *
 * IT NAMES WHICH POPULATION AND BY HOW MANY, which is the whole requirement:
 * "read exactly which population is short and by how many". `needed` comes
 * from `@respin/brain`'s `Population`, which computes it from
 * `MIN_COMPARABLE_RESULTS` — this function never subtracts anything itself,
 * because a second arithmetic on the minimum is a second minimum.
 */
export function shortPopulationSentence(
  which: string,
  n: number,
  needed: number
): string {
  // VERIFIED POSTS, said as such (R-115, R-170): only a connector-verified
  // result enters a population, and `n` counts distinct posts, so "N more
  // results" read as if logging more self-reported rows would fill it.
  const more = needed === 1 ? "one more verified post" : `${needed} more verified posts`;
  const have =
    n === 0
      ? "no verified posts at all"
      : n === 1
        ? "one verified post"
        : `${n} verified posts`;
  return `Your ${which} has ${have} in this group, so there is no median to show. ${capitalise(more)} in the same group would make one.`;
}

/**
 * A POPULATION THAT WAS NOT READ IN FULL — the fourth state, and the OPPOSITE
 * error from `short`.
 *
 * `short` and `none` mean "we counted your whole eligible history and there is
 * not enough of it". `truncated` means "the read was clipped, so nobody knows
 * how much there is". Telling a creator their history is thin when it is
 * merely unread is the worse mistake of the two on the screen whose job is
 * honesty about how much evidence exists — so this sentence says FLOOR, says
 * it cannot give a number, and says explicitly that this is not the same as
 * having too few.
 */
export function truncatedPopulationSentence(
  which: string,
  atLeast: number
): string {
  const floor =
    atLeast === 1 ? "at least 1 result" : `at least ${atLeast} results`;
  return `Your ${which} was not read in full, so there is no median to show. What this page saw is ${floor} — that is a floor, not a count, and nothing here can tell you how many more there are. This is not the same as having too few: it means they were not all looked at.`;
}

/**
 * WHY A POPULATION HAS NO MEDIAN, in a form the effect sentence can name.
 *
 * `null` is "it has one" — a `present` population. The two gaps are kept apart
 * because they need different sentences: a number of missing observations a
 * creator can go and get, versus a read that was clipped, where the honest
 * answer is that nobody has the number.
 */
export type PopulationGap =
  | { kind: "short"; needed: number }
  | { kind: "truncated" }
  | null;

/** The effect's absence, naming both populations rather than "not enough data". */
export function noEffectSentence(
  treatment: PopulationGap,
  baseline: PopulationGap
): string {
  const parts: string[] = [];
  // NAMED PER POPULATION AND PER KIND. Four sentences rather than one, because
  // "the treatment group is 2 short" printed over a clipped read is a false
  // statement about a creator's own history.
  if (treatment?.kind === "short") {
    parts.push(`the treatment group is ${treatment.needed} short`);
  }
  if (treatment?.kind === "truncated") {
    parts.push("the treatment group was not read in full");
  }
  if (baseline?.kind === "short") {
    parts.push(`your baseline is ${baseline.needed} short`);
  }
  if (baseline?.kind === "truncated") {
    parts.push("your baseline was not read in full");
  }
  const why =
    parts.length === 0
      ? "one of the two populations could not be measured"
      : parts.join(" and ");
  return `No difference is shown for this lever, because ${why}. There is no bar and no number here rather than a zero: an absence is not a result of zero.`;
}

/**
 * The past-tense effect sentence (R20).
 *
 * TWO SEPARATE FACTS, and keeping them separate is the point.
 *
 *   - WHICH SIDE the treatment median sits on, which is a property of the
 *     number's sign and nothing else. This function reads it.
 *   - WHETHER THAT IS THE WAY THE CREATOR WANTS, which depends on the declared
 *     direction. This function does NOT read it: `improvement` is computed by
 *     `@respin/brain` and carried here.
 *
 * The second half used to be derived from `direction` and the sign right in
 * this file, which is a second implementation of a rule the package owns — the
 * drift class this slice's pinned contract exists to prevent. `null` is a real
 * input (a builder that could not read the direction) and is said rather than
 * guessed.
 */
export function effectSentence(args: {
  lever: string;
  differencePer1k: number;
  unit: string;
  improvement: "better" | "worse" | "unchanged" | null;
  /** Half of what determines the SIDE. The other half is `improvement`. */
  direction: "higher_is_better" | "lower_is_better";
  treatmentN: number;
  baselineN: number;
}): string {
  const { lever, differencePer1k, unit, improvement, direction, treatmentN, baselineN } =
    args;
  const leverWord = leverLabel(lever).toLowerCase();
  const over = `Over ${treatmentN} results in this treatment group, the median ${leverWord}`;
  const against = `the median of your own ${baselineN} other results`;
  const magnitude = formatNumber(Math.abs(differencePer1k));
  const per1k = `${magnitude} ${unit} per 1,000`;
  const past = "That is what those posts did, once, already.";

  // ---------------------------------------------------------------------
  // WHICH SIDE, DERIVED FROM THE VERDICT AND THE DECLARED DIRECTION — never
  // from the sign of the number. Those two fully determine it: "better" under
  // higher-is-better is above, under lower-is-better is below, and "worse" is
  // each of those inverted.
  //
  // THE DEFECT THIS CLOSES. `side` used to be `differencePer1k > 0` while the
  // reading came from `improvement`, so a delta the builder had judged
  // indistinguishable rendered "…was 5.68434e-14 follows per 1,000 ABOVE the
  // median …, which is neither side of it" — one sentence contradicting itself.
  //
  // AND IT IS NOT A "LOOKS LIKE ZERO" SPECIAL CASE, which would be the wrong
  // fix and a second derivation. `@respin/brain` now returns `effectPer1k` as
  // exactly `0` when it judges a tie, so the number and the verdict agree BY
  // CONSTRUCTION; this function reads the verdict for the word and prints
  // whatever number it was handed. Nothing here inspects the magnitude to
  // decide anything.
  //
  // ZERO IS A RESULT, NOT AN ABSENCE. A tie is a complete comparison over two
  // present populations that came out level — the opposite of `short`,
  // `none` or `truncated`, which is why the builder does not null it and why
  // this branch writes a sentence rather than an absence.
  // ---------------------------------------------------------------------
  const higherIsBetter = direction === "higher_is_better";
  if (improvement === "unchanged") {
    return `${over} came out level with ${against}: the difference was ${per1k}, which is not a difference this comparison can tell from none. ${past}`;
  }
  if (improvement === null) {
    // NO SIDE WORD AT ALL. Without a verdict there is nothing that determines
    // one, and reaching for the sign is exactly what this function may not do.
    return `${over} differed from ${against} by ${per1k}, and which of those you wanted is not shown here, because the direction of your declared metric could not be read. ${past}`;
  }
  const better = improvement === "better";
  const side = better === higherIsBetter ? "above" : "below";
  const reading = better
    ? "which is the direction you declared you want for this metric"
    : "which is the opposite of the direction you declared you want for this metric";
  return `${over} was ${per1k} ${side} ${against}, ${reading}. ${past}`;
}

/** The id-set disclosure's summary line (R11: both id sets inspectable). */
export function idSetSummary(which: string, n: number): string {
  return n === 1
    ? `The 1 result in your ${which}`
    : `The ${n} results in your ${which}`;
}

/**
 * HOW MANY SIGNIFICANT DIGITS THIS SCREEN SHOWS — the display precision, as a
 * named constant, because a second reader needs it (slice 9a, 2026-09-04).
 *
 * `@respin/brain` decides `improvement` — the word "better", "worse" or
 * "unchanged" beside a difference — and the resolution taken for that field is
 * that `unchanged` should mean "the number we are showing you is zero" rather
 * than a claim about a value nobody sees. That makes this number a shared fact
 * rather than a formatting detail, so it is exported instead of living inside
 * `formatNumber`.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CONSTANT CANNOT DO, MEASURED RATHER THAN ASSUMED, because a guard
 * that silently never fires is worse than no guard (CLAUDE.md, 2026-08-21).
 *
 * These are SIGNIFICANT DIGITS, and rounding to significant digits HAS NO
 * ZERO: `Number((3.552713678800501e-15).toPrecision(6))` is `3.55271e-15`, not
 * `0`. Every float-noise value measured — `0.1 + 0.2 - 0.3`,
 * `120.00000000000001 - 120`, `1e-300`, `Number.MIN_VALUE` — survives this
 * rounding as a non-zero number. So a caller deciding `unchanged` by
 * `displayRounded(delta) === 0` gets EXACTLY the behaviour it has today:
 * `unchanged` on an exact zero and nothing else. The float-noise case this was
 * meant to catch is not caught, and no test on either side would say so.
 *
 * Collapsing noise needs a DECIMAL QUANTUM instead (`Number(v.toFixed(4))`),
 * which does reach zero for all five noise values above — and, measured on the
 * same run, also turns a genuine per-1k median of `0.00004` into `0`. That is
 * the "print a small non-zero as zero" defect this formatter exists to avoid,
 * on the screen whose central rule is that an absence is never a zero. Which
 * cost to pay is a product decision about what a creator is shown, so it is
 * not taken here.
 *
 * THE OPERATION TRAVELS WITH THE NUMBER, and that is why the name says
 * SIGNIFICANT: `6` applied as `toFixed(6)` and `6` applied as `toPrecision(6)`
 * are different answers, so a bare number handed across a package boundary
 * would let the verdict and the rendered figure diverge in precisely the way
 * sharing a constant is meant to prevent. The exact expression is
 * `displayRounded` below; a second reader implements THAT, not "round to 6".
 * ---------------------------------------------------------------------------
 */
export const RESULT_DISPLAY_SIGNIFICANT_DIGITS = 6;

/**
 * The value as this screen rounds it, as a number.
 *
 * THE ONE ROUNDING, so the word beside a difference and the figure printed for
 * it cannot disagree. `formatNumber` is this function plus `String`.
 */
export function displayRounded(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return 0;
  return Number(value.toPrecision(RESULT_DISPLAY_SIGNIFICANT_DIGITS));
}

/**
 * Numbers as this screen prints them: exact, never rounded into a claim.
 *
 * Six significant digits with no trailing zeros, so a per-1k of 12.5 prints
 * `12.5` and one of 0.0004 prints `0.0004` rather than `0`. Printing a small
 * non-zero number as `0` is the same defect as drawing an absence at zero.
 *
 * (This docblock read "up to three decimals" until 2026-09-04, while the code
 * had always rounded to six SIGNIFICANT digits — a comment claiming a property
 * the code did not have, which is the thing CLAUDE.md's 2026-07-30 lesson says
 * to assert or delete. It is asserted now, in `tests/results-comparison.test.tsx`.)
 */
/**
 * WHAT A NON-FINITE NUMBER PRINTS AS, and why it is not `[check]`.
 *
 * REQ-I03's `[check]` means ONE thing: a specific this product would not
 * invent, left for a person to fill in. A NaN or an Infinity reaching a
 * rendered figure is not that — it is a number that went wrong — and printing
 * the same token for both gives the placeholder a second meaning on the one
 * screen where a reader is being asked to trust figures. Effectively
 * unreachable (the lever columns are `numeric(24,8)` and the comparison
 * refuses a non-finite value before this is called), which is exactly why it
 * must not quietly borrow a token that means something else.
 *
 * NOR "unavailable", WHICH WAS THE FIRST ANSWER AND IS THIS PRODUCT'S
 * ACCESS-REFUSAL VOCABULARY — "not available on this creator profile", "this
 * workspace is not available". A figure printed "unavailable" reads as "you
 * may not see this" as easily as "this went wrong", and on a page about a
 * creator's own results the first reading is alarming and false. "Could not be
 * computed" carries only the second.
 */
export const UNPRINTABLE_NUMBER = "could not be computed";

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return UNPRINTABLE_NUMBER;
  return String(displayRounded(value));
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * WHY THERE IS NO COMPARISON YET — the section-level absences, as a CLOSED
 * SET rather than sentences composed at a call site.
 *
 * Two of them, and neither guesses: the first is "you have logged nothing",
 * the second is "nothing you have logged is comparable to anything else yet"
 * and it names BOTH things that could be missing rather than picking one. A
 * sentence that claimed which half was missing would be a claim this screen
 * cannot check without re-deriving the cohort logic it deliberately does not
 * own.
 */
export const NO_RESULTS_YET =
  "No results are logged for this creator yet. Log one above and it appears here with everything else you have logged.";

/**
 * WHY THERE IS NO COMPARISON, WITHOUT ASSERTING A DEFINITE ABSENCE.
 *
 * IT USED TO SAY "Nothing here is comparable yet", which is a claim about the
 * creator's WHOLE history — and the read behind it can be clipped, at which
 * point the sentence describes rows nobody counted. That is the same error the
 * per-population `truncated` state exists to prevent one level down: "we
 * counted and there is not enough" is not "we did not count".
 *
 * THE SECTION CANNOT TELL THE TWO APART, and this sentence is written so it
 * does not have to. `resultComparisons` returns a plain array, so with ZERO
 * groups there is no population left carrying the truncation flag — the page
 * has nothing to read. Rather than add a state this screen could not set
 * truthfully, the claim is narrowed to what the page actually knows: it built
 * none, and here is what a comparison needs. Widening it back into a claim
 * about the creator's history would need the facade to report truncation
 * alongside an empty array.
 */
export const NOTHING_COMPARABLE_YET =
  "No comparison was built from your results on this load. A comparison needs results that name one of your Respin drafts — that is what says what was tested — and other results of yours in the same group to compare them against. This page cannot tell you whether a fuller read of your history would find some, so it does not say either way. Everything it did read is listed above, including the results that are part of no comparison.";

/** The results list's own heading and its per-row honesty. */
export const LOG_LIST_HEADING = "What you have logged";

/**
 * HOW MANY LOGGED RESULTS THIS LIST SHOWS AT ONCE.
 *
 * IT EXISTS BECAUSE THE READER IS CLAMPED AND THE HEADING WAS NOT. The scoped
 * accessor pages by default, so a heading reading "Everything you have logged"
 * was a claim about rows this screen had never read — the `spendVisibility`
 * failure exactly, one screen over: a clamped page presented as the whole. The
 * page asks for ONE MORE row than it shows, so "there are more" is an
 * observation rather than an inference, and the note below says what is missing
 * instead of the heading claiming nothing is.
 */
export const RESULTS_LIST_PAGE = 50;

/** Said only when the list really is clamped, and it claims nothing else. */
export function clampedListNote(shown: number): string {
  return `This list shows the ${shown} most recent results you have logged. There are more than that, and the rest are not shown here.`;
}

/**
 * WHY THE LIST SHOWS WHAT WAS TYPED AND NOT A PER-1,000.
 *
 * The per-1,000 normalisation happens in exactly ONE place, inside the
 * comparison builder, against the declared metric version the result names.
 * A second implementation of `value / denominator * 1000` on this list would
 * be a second answer to the same question — the shape CLAUDE.md's 2026-09-04
 * entry describes, where two halves of one product each computed their own
 * bounds and never met the other's data. So the list prints the numbers a
 * creator typed, exactly as they typed them, and the comparison prints the
 * normalised one.
 */
export const LOG_LIST_NOTE =
  "These are the numbers as you entered them. The per-1,000 normalisation is done once, in the comparisons below, against the version of your metric each result was measured under.";

/** A lever a result did not report. Never rendered as a zero. */
export const LEVER_NOT_REPORTED = "not reported";

/** A result that names no draft, in the list. */
export const NO_TREATMENT_ON_ROW =
  "Baseline only — this result names no draft of yours, so there is nothing to say what it tested.";

/**
 * ISO day. Deliberately not locale-formatted: the server and the browser must
 * agree, and a test must be able to assert an exact string. The same helper
 * `/usage` keeps for the same reason — duplicated rather than imported because
 * this module imports nothing (see the header) and `/usage` is a screen slice
 * 9a may not edit.
 */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Whether the log control may be offered at all.
 *
 * A COURTESY, NEVER THE ENFORCEMENT — `generateBlock`'s relationship to
 * `InferenceRoleError`, restated: the server action is a POST endpoint
 * reachable without this page ever rendering, so the real gate is the role
 * check inside `recordResult`'s write capability. If this function and that
 * gate ever disagree, the gate is right.
 *
 * PAUSE IS DELIBERATELY NOT HERE. Logging a result spends nothing and calls
 * nothing; a paused workspace has frozen CREDITS, not a frozen record. Adding
 * a pause branch would refuse a creator the one act that costs nothing, which
 * is the "control that becomes the outage" shape (CLAUDE.md 2026-07-30).
 */
export function logResultBlock(params: { isViewer: boolean }): { reason: string } | null {
  if (params.isViewer) {
    return {
      reason:
        "You have viewer access to this workspace. Logging a result writes to this creator's own record, so it needs at least editor access. Ask a workspace owner.",
    };
  }
  return null;
}

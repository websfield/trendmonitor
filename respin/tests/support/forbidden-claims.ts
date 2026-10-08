// ONE canon of claims no creator-facing screen may make, read by every screen's
// honesty scan.
//
// WHY IT IS SHARED (compliance gate, 2026-08-29). `/onboarding` and `/brain`
// each grew their own list, and the two diverged in the worst possible
// direction: `/brain` banned `guarantee` and `confiden`, and `/onboarding` —
// the screen that SPENDS A CREDIT and sends a creator's writing to a vendor —
// banned neither. So "guaranteed" and "we are 80% confident" were sayable on
// the money screen with the whole suite green, on exactly the two words REQ-I04
// names. Neither list was a superset of the other.
//
// A shared canon also fixes the class rather than the instance: a screen added
// in a later slice inherits every word, instead of starting from whatever its
// author remembered.
//
// SCOPE, stated so this file is not mistaken for a style guide: these are
// claims about CAPABILITY and CERTAINTY — things the product would be asserting
// about itself or about the creator. Words that merely name what a screen does
// ("brain", "voice rules") are not here; they left `/onboarding`'s list
// deliberately in slice 3 when the screen started genuinely doing the thing,
// and the four claim-shaped bans below replaced them.

/** One forbidden claim: a label for the failure message, and its pattern. */
export type ForbiddenClaim = readonly [label: string, pattern: RegExp];

/**
 * Claims NO creator-facing screen may make, on any surface, ever.
 *
 * Every entry is a promise this product cannot keep today, and most of them it
 * is not built to keep at all:
 *
 * - `learn` / `improve` — R-8 and non-negotiable 3. A brain is CONTEXT, never
 *   weights; nothing in this product learns, and the learning loop is slice 9
 *   and beyond. `train` is the sharpest of the three and was missing from both
 *   lists: it is the single most likely word on a screen that posts a creator's
 *   corpus to a model, and it would falsify "context, never weights" outright.
 * - `accurate` / `confiden` — the product holds no accuracy or confidence
 *   number. `confidence` was withdrawn from the evidence shape entirely (C-15),
 *   so a screen showing one would be inventing it.
 * - `guarantee` — REQ-I04. Nothing here is guaranteed.
 * - `understands you` / `knows your` — a claim about comprehension that no
 *   part of this system supports.
 */
export const FORBIDDEN_CLAIMS: readonly ForbiddenClaim[] = [
  ["learn", /\blearn/],
  ["train", /\btrain(s|ed|ing)?\b/],
  ["improve", /\bimprov/],
  ["accurate", /\baccura/],
  ["confidence", /\bconfiden/],
  ["guarantee", /\bguarantee/],
  ["understands you", /\bunderstands? (you|your)/],
  ["knows your", /\bknows your\b/],
  ["we will", /\bwe will/],
];

/**
 * Claims about how a piece of content will DO once it is posted.
 *
 * ADDED BY SLICE 6 (R20/R21), and it is the half `FORBIDDEN_CLAIMS` never
 * covered. The canon above bans claims about the PRODUCT ("we learn", "we are
 * confident"); nothing in it stopped a screen from saying a draft would get
 * views. `/studio` is the first surface where that sentence is even writable,
 * because it is the first that hands a creator something to publish — and at
 * n = 0 (no results logged, the learning loop is slice 9) the product holds no
 * evidence about this creator whatsoever.
 *
 * WHY `perform` ITSELF IS NOT BANNED. `whyThisPerforms` is a section every mode
 * emits (tech-spec §3 step 6) and the screen has to label it. What is banned is
 * the FORECAST — `will perform`, `outperform` — and the metric vocabulary that
 * only means something once results exist. The section's own honesty control is
 * a different mechanism: it always names its weakest point (REQ-I04), and
 * `STUDIO_POSITIVE_ASSERTIONS` below is what makes that a screen property
 * rather than a schema one.
 *
 * `reach` IS NOT BANNED AS A BARE WORD, and the first draft of this list banned
 * it that way. Measuring the draft against the real copy is what corrected it:
 * `scope_forgery`'s shared refusal says "a safety check that guards which
 * workspace and which profile an action may reach did not pass", which is the
 * plumbing sense and is exactly right. A ban that forces a refusal about the
 * tenancy cage to be reworded is a ban paying for a word rather than a claim.
 * So the two entries below pin the METRIC sense — the quantity, and the promise
 * of a bigger audience — and leave the verb alone.
 *
 * THE OWN-BASELINE HALF WAS ADDED AFTER THE LEARNING-HONESTY GATE MEASURED ITS
 * ABSENCE (2026-09-01). `beats your baseline`, `better than your last`,
 * `best-performing`, `more views` and `proven to` are PRD §5 metric 2 — "better
 * than what you were doing" — stated as fact at n = 0, which is the direction
 * R-10 forbids outright. Three of them were already enforced on the product's
 * STATIC copy by `tests/studio-ui.test.tsx`, and none of them was enforced on
 * the model's text: one vocabulary, two enforcement points, and the point that
 * no person reviews was the one missing it (CLAUDE.md, 2026-08-29).
 * `goes viral` joined for the same reason on R20's third noun — `reach` and
 * `performance` each had a predicate shape beside their bare noun and virality
 * did not.
 */
export const PERFORMANCE_CLAIMS: readonly ForbiddenClaim[] = [
  ["viral", /\bviral|\bvirality/],
  ["goes viral", /\b(go(es|ing)?|went|will go|gonna go)\s+viral\b/],
  ["views", /\bviews\b/],
  ["engagement", /\bengagement\b/],
  ["more reach", /\b(more|wider|bigger|larger|extra|higher) reach\b/],
  [
    "reach an audience",
    /\breach(es|ing)? (a |an |your |the )?(wider |bigger |larger |new |whole |right )?(audience|following|viewers)\b/,
  ],
  ["will perform", /\bwill perform/],
  ["outperform", /\boutperform/],
  ["blow up", /\bblow(s|ing)? up\b/],
  [
    "beats your baseline",
    /\bbeat(s|ing)? (your|my|our|their|the) (baseline|average|numbers|usual|best)\b/,
  ],
  [
    "better than your last",
    /\b(perform(s|ed|ing)?|do(es)?|did|work(s|ed)?|land(s|ed)?|hit(s)?) better than (your|my|our|their|the)\b/,
  ],
  ["best-performing", /\bbest[- ]performing\b/],
  ["more views", /\bmore (views|engagement|followers|saves|shares|comments)\b/],
  ["proven to", /\bproven to\b/],
];

/**
 * What `/studio` must POSITIVELY do, because R21 takes three bans away from it.
 *
 * ---------------------------------------------------------------------------
 * THE TRANSITION THIS BLOCK RECORDS (slice 6, R21).
 *
 * `NOT_BUILT_YET` below bans `generat`, `script` and `hook` on screens that do
 * not do the thing. `/studio` now does the thing: it takes a creator's input,
 * assembles a prompt from their activated brain, calls a vendor, runs the kill
 * test and the traceability scan, stores a `generations` row and takes one
 * debit. So those three words are not merely permitted there, they are the only
 * honest labels for its controls — a button that sends a person's idea to a
 * model may not be vague about what it does.
 *
 * BUT A WORD LEAVING A BAN IS INDISTINGUISHABLE FROM A WEAKENED GUARD (R-38,
 * and CLAUDE.md's 2026-08-26 lesson in its sharpest form: nothing fails if the
 * replacement is weak, because no mutation can reach an assertion nobody
 * wrote). So the removal is paid for HERE, in the same file, with markers the
 * screen must render and patterns their text must match. Each entry fails if
 * `/studio` stops doing the thing the ban used to stand in for:
 *
 *   - it stops saying what a press costs before the press;
 *   - it stops saying that nothing streams;
 *   - it stops rendering the hooks the operation returned;
 *   - it stops naming the weakest point beside "why this performs";
 *   - it stops stating REQ-I03's limit — that the check is about where a
 *     specific came from, not whether it is true;
 *   - it stops saying that no result of this creator's has been logged, which
 *     is the n = 0 statement R21 is named for;
 *   - it stops reporting the actual charge and the balance that resulted;
 *   - it stops showing the kill test's own verdict.
 *
 * `where` names which rendered state carries the marker, so a test cannot
 * satisfy the list by rendering one state and calling it done.
 *
 * ---------------------------------------------------------------------------
 * THE SCREEN THESE PATTERNS ARE MEASURED AGAINST IS A LYING ONE (learning
 * honesty gate, 2026-09-01) — and the first eight were rewritten because of it.
 *
 * The gate rebuilt the harness and ran it against a hand-built screen that
 * renders every marker and nothing real: empty `<li>`s, a `Weakest point:`
 * label above a blank, an empty verdict, a charge line with the word "balance"
 * and no number. SEVEN OF THE EIGHT ASSERTIONS PASSED IT — measured, not
 * argued. A marker plus a keyword is not evidence that a screen does the thing;
 * it is evidence that somebody typed the keyword.
 *
 * SO EVERY PATTERN BELOW NOW DEMANDS THE SENTENCE BODY OR THE NUMBER — the
 * price, the balance, the text inside the element, the second clause — rather
 * than the LABEL that names it. `tests/studio-ui.test.tsx` keeps the lying
 * screen as a permanent fixture and asserts the harness names ALL EIGHT: the
 * probe is the guard, because a pattern nobody drives against a fake is a
 * pattern nobody has checked.
 *
 * WHAT THAT DOES AND DOES NOT BUY, MEASURED RATHER THAN CLAIMED (2026-09-01,
 * each of the sixteen strings run through the patterns below). Against the
 * label-only text round 1 accepted — "This costs credits.", "No results yet.",
 * `<li><div></div></li>`, "Your balance was updated." — all eight now REFUSE.
 * Against a hand-written STATIC template carrying a plausible value — "This
 * costs 5 credits, every time.", "That cost 5 credits. Your balance is now 20
 * credits." — all eight PASS. Nothing here can tell a rendered value from a
 * typed one, because a regex over HTML has no way to know where a number came
 * from, and an earlier draft of this block asserted the opposite ("never a
 * label a static template could carry"): two of the eight —
 * `studio-no-stream` and `studio-no-results-basis` — have NO interpolated half
 * by construction, since their content is the static copy at
 * `app/(product)/studio/run-copy.ts` and always will be.
 *
 * SO THE PROPERTY THESE ENTRIES CARRY IS "the screen renders the CONTENT, not
 * the label", and the property that the content is the OPERATION'S is carried
 * elsewhere, per sentence: `killTestSentence` is asserted verbatim inside the
 * rendered HTML ("a usable draft renders killTestSentence(...) verbatim", with
 * the two other outcomes asserted absent), and `generateCostSentence` and
 * `generateChargeSentence` are pinned to their exact sentences as pure
 * functions ("generateCostSentence states the price and never invents one",
 * "generateChargeSentence reports the real charge; zero is an answer, not an
 * absence"), so the patterns below are a second gate over text a first gate has
 * already fixed. A claim recorded here is only as good as the test that holds
 * it up (CLAUDE.md, 2026-07-30), which is why the ones this block used to make
 * on its own behalf now name the tests that make them.
 *
 * ONE MARKER MOVED RATHER THAN BEING RE-PATTERNED. `studio-kill-test` is the
 * block's CONTAINER and its first child is a static `<h3>What the checks
 * found</h3>`, so any pattern over the container is satisfiable by the heading
 * alone. The verdict is `studio-kill-test-outcome`, which is where the sentence
 * `killTestSentence` returns actually lands, so that is what the entry names.
 */
export const STUDIO_POSITIVE_ASSERTIONS: readonly {
  label: string;
  /** The `data-testid` the screen must render. */
  testId: string;
  /** Which rendered state carries it. */
  where: "form" | "result";
  /** A pattern the marker's own text must match. */
  must: RegExp;
}[] = [
  {
    label: "states the price before the press",
    testId: "studio-cost",
    where: "form",
    // THE NUMBER, NOT THE NOUN. `/\bcredits?\b/` was satisfied by "This costs
    // credits." — a sentence that states no price at all on the control that
    // spends one. All three branches of `generateCostSentence` are named here
    // and nothing else is: a price, a priced-at-zero, or the honest admission
    // that the price could not be read (non-negotiable 6 — never an invented
    // number, but never a silent absence either).
    must: /\bcosts (\d+ credits?|nothing)\b|price of a draft could not be read/i,
  },
  {
    label: "says it does not stream",
    testId: "studio-no-stream",
    where: "form",
    // BOTH CLAUSES. "Nothing appears until it is ready" is a loading message;
    // what R21 pays for is the second half — that a part-written draft is never
    // shown, because the product may still be about to refuse it.
    must: /nothing appears until[\s\S]*part-written draft is never shown/i,
  },
  {
    label: "says what this creator's results do, by branch, and names the recent-work channel",
    testId: "studio-no-results-basis",
    where: "form",
    // TWO-BRANCH, NOT DELETED (audit P6-R6; register item 8). The marker used
    // to require "no results of yours have been logged" on every render, which
    // made this harness CEMENT a sentence that is false for any creator who
    // has used `/results`. It now requires ONE of the three branches
    // `resultsBasisSentence` can say, each as its facts rather than a label:
    //   - zero: none logged AND not being measured (`/no results/` alone was
    //     passed by "No results yet.", which says nothing the product holds);
    //   - a positive count: the count, "none of them" ("it does not change"
    //     for exactly one), and the VERIFIED
    //     precondition R-115 sets on any of it entering a comparison;
    //   - a failed read: that the count could not be read, never "none".
    // ...AND, after it, the channel R-152 (b)/(d) opened and R-174 ratified:
    // either the modes that read recent work and that it is "labelled
    // history", or, on a screen whose modes read none, "nothing else of
    // yours". A
    // sentence that drops the channel is red here whatever its first half
    // says.
    must: /(?:no results of yours have been logged[\s\S]*not measuring you|you have logged \d+ results?\.[\s\S]*(?:none of them|it does not change)[\s\S]*verified|could not read how many results you have logged)[\s\S]*(?:labelled history|nothing else of yours)/i,
  },
  {
    label: "renders the hooks the operation returned",
    testId: "studio-hooks",
    where: "result",
    // TEXT IN A LIST ITEM, not a list item. `/<li\b/` was passed by three empty
    // `<li>`s — a screen rendering the shape of a draft and none of it.
    must: /<li\b[^>]*>\s*<div>\s*[^<\s]/,
  },
  {
    label: "names the weakest point beside why this performs",
    testId: "studio-weakest-point",
    where: "result",
    // THE COMMENT THAT USED TO BE HERE CLAIMED A PROPERTY THIS PATTERN DID NOT
    // HAVE (2026-07-30: a comment claiming a property is not the property). It
    // said `/\S/` was rejected because "a label above a blank" would satisfy
    // it — and `/weakest point/i` was satisfied by exactly that, because the
    // label `<strong>Weakest point:</strong>` is hard-coded in
    // `generation-outcome.tsx`. So the pattern now looks PAST the label: text
    // after the closing `</strong>`, which only the interpolated value can put
    // there. It matches both labels the screen uses ("Weakest point:" on a
    // fresh draft, "The weakest point of that draft:" on a replay).
    must: /weakest point[^<]*<\/strong>\s*[^<\s]/i,
  },
  {
    label: "states REQ-I03's limit on the traceability check",
    testId: "studio-traceability-note",
    where: "result",
    // The one assertion that already rejected the lying screen, because the
    // sentence IS the content. Its second witness is the source scan in
    // `tests/studio-ui.test.tsx` proving no file under `app/(product)/studio/`
    // contains this phrase — so it cannot be satisfied by a hard-coded copy of
    // the note either.
    must: /not about whether it is true/i,
  },
  {
    label: "reports the actual charge and the resulting balance",
    testId: "studio-charge",
    where: "result",
    // THE BALANCE, NOT THE WORD "balance". "Your balance was updated." passed
    // the old pattern on the screen whose whole job here is to say what the
    // press cost and what is left. `(now )?` covers the replay sentence, which
    // reports a balance without a charge because nothing extra was spent.
    must: /balance is (now )?\d+ credits?\b/i,
  },
  {
    label: "shows the kill test's own verdict",
    testId: "studio-kill-test-outcome",
    where: "result",
    // NOT `studio-kill-test` WITH `/what the checks found/i`: that is the
    // block's static `<h3>`, and the gate measured the verdict line deleted
    // with the assertion still green. Every one of `killTestSentence`'s three
    // outcomes names the product's hard rules, and none of them is a heading.
    must: /hard rules/i,
  },
];

/**
 * Additional bans for screens that do not do the thing yet.
 *
 * SEPARATE FROM THE CANON because these are true of a screen at a point in
 * TIME, not forever: `/onboarding` may not promise a script because no script
 * exists, and the day one does the ban is retired for that screen. The canon
 * above is never retired.
 *
 * `/studio` LEFT THIS LIST IN SLICE 6 — see `STUDIO_POSITIVE_ASSERTIONS` above
 * for what was put in its place and why the swap is a tightening rather than a
 * relaxation. `/onboarding` and `/onboarding/interview` still carry every entry.
 */
export const NOT_BUILT_YET: readonly ForbiddenClaim[] = [
  ["generate", /\bgenerat/],
  ["script", /\bscript/],
  ["hook", /\bhook/],
  ["analyse", /\banaly/],
];

/**
 * Additional bans for the MARKETING surfaces, which sell to a visitor who has
 * no account and therefore no way to check.
 *
 * SEPARATE FROM THE CANON for a structural reason, not an editorial one.
 * `PERFORMANCE_CLAIMS` is bound id-for-id and source-for-source to
 * `packages/modes/src/claims.ts`' `performance` family, asserted from both
 * sides by `tests/claims-vocabulary-agreement.test.ts`; adding a pattern there
 * changes the scanner that reads MODEL-AUTHORED text on `/studio`, which is a
 * different Critical Path. A word that is only dangerous in a sales sentence
 * belongs here, where the marketing scan is its one reader.
 *
 * THIS LIST WAS BUILT FROM ONE CITATION AND WAS IMMEDIATELY NON-DISCRIMINATING
 * AGAINST ITS OWN CLASS (batch-3 gate, 2026-09-20). Its first version held one
 * entry, `proven`, taken from the single sentence a reviewer had quoted. The
 * landing FOOTER — rendered on all four marketing routes — said "built on
 * mechanisms that perform", and the site-wide `metadata.description` said the
 * same; the scan rendered both and returned clean, measured with controls. The
 * identical string had ALREADY been recorded as HIGH the previous day (audit
 * 2026-09-19 D6, remediation P6-R5) and the list was written without reading
 * it. That is CLAUDE.md 2026-07-30 in its recorded shape: fix the CLASS, not
 * the field — "grep every sibling id" is the version of this rule that already
 * failed. So the entries below name the SHAPES a sales page uses to assert
 * measured performance.
 *
 * WHAT THIS LIST IS, CORRECTED (2026-09-20, remediation P1-R4). The paragraph
 * above used to end "and are derived from the marketing vocabulary rather than
 * from what a reviewer happened to cite", and `decisions.md` R-131 said the
 * same. THAT WAS NOT TRUE and the correction is the point of this block: the
 * three entries are three morphological variants of the two sentences the
 * batch-3 reviewer quoted, and nothing about them was derived from a read of
 * the marketing surface. Measured rather than argued — 17 plausible sales
 * sentences run through `FORBIDDEN_CLAIMS` + `PERFORMANCE_CLAIMS` +
 * `MARKETING_CLAIMS` on 2026-09-20: **17 of 17 pass**, including
 * "Audiences punish it.", which was live on all four marketing routes while a
 * docblock four lines up called this list derived. Writing "the class is
 * closed" is the failure this repo has now recorded four times.
 *
 * SO THIS IS A RECALL AID WITH MEASURED GAPS, NOT A COMPLETE CONTROL — the
 * doctrine `packages/modes/src/claims.ts:138-149` already states for the
 * product's own vocabulary, applied here. `MARKETING_CLAIM_GAPS` below names
 * the shapes that were measured to escape, and `tests/claim-scan.test.ts`
 * asserts each one still does, so the gap list cannot rot: closing one with a
 * new pattern turns that assertion red and the list has to be edited in the
 * same change. The control that does NOT depend on this vocabulary is
 * `tests/landing-pricing.test.ts`'s pin table, which asks what a line depends
 * on rather than which words it uses.
 *
 * `proven` — the landing shipped "built on mechanisms proven by posted
 * results". No posted result has ever been measured against a mechanism:
 * result-sourced proposals come from `packages/brain` at n >= 3 comparable
 * CONNECTOR-VERIFIED results (R-10, non-negotiable 4), and manual or
 * self-reported logs never drive a numerical claim at all (R-115). The canon
 * bans `proven to` in the model's text; the landing said `proven by` — the
 * same claim, in the one place no model wrote it. The pattern is the BARE word
 * because a sales page has no honest use for it: this product's evidence
 * vocabulary is "reviewed", "cited" and "[check]".
 *
 * `that performs` / `high-performing` — the assertive predicate, and NOT the
 * bare verb. `PERFORMANCE_CLAIMS` deliberately leaves `perform` alone because
 * `whyThisPerforms` is a section every mode emits and `/studio` has to label
 * it; `app/(marketing)/sample-spin/sample-spin-panel.tsx:35` renders that
 * label as "Why this could perform", which is hedged and stays sayable. What
 * is banned is a SUBJECT asserted to perform — "mechanisms that perform",
 * "content which consistently performs", "high-performing hooks" — because on
 * a page with no account behind it that is a measured claim with no
 * denominator, no population and no period.
 */
export const MARKETING_CLAIMS: readonly ForbiddenClaim[] = [
  ["proven", /\bproven\b/],
  ["that performs", /\b(that|which)\s+(\w+\s+)?perform/],
  ["high-performing", /\bhigh[- ]perform/],
];

/**
 * Sales sentences this vocabulary was MEASURED not to catch (2026-09-20).
 *
 * NOT A TODO LIST AND NOT AN EXEMPTION LIST. It is the honest scope of the
 * three patterns above, written down so nobody reads a green marketing scan as
 * "this page makes no unevidenced claim". Each entry is a shape a sales page
 * reaches for, and every one of them asserts an outcome this product has
 * logged no evidence about — which is REQ-I04's actual subject.
 *
 * `tests/claim-scan.test.ts` drives every entry and asserts it STILL escapes.
 * That is deliberate and it is the opposite of a snooze: the day somebody adds
 * a pattern that catches one, the assertion goes red and this list must be
 * edited in the same change, so the recorded gap and the shipped vocabulary
 * can never disagree. The first entry was live copy when it was measured.
 *
 * WHY THEY ARE NOT SIMPLY BANNED. A pattern per sentence is the instance fix
 * that this file's own history shows failing: three entries built from two
 * quoted sentences looked like a class and were not. Closing these needs a
 * generator over {subject} x {outcome} x {hedge}, the same conclusion the
 * audit's round 3 reached for `claims.ts` — recorded in the phase card as the
 * next mechanism, not attempted in a copy pass.
 */
export const MARKETING_CLAIM_GAPS: readonly string[] = [
  // An asserted audience reaction. LIVE on all four marketing routes until
  // 2026-09-20 (`page.tsx:29`, `audiences.ts:47,75,103`).
  "Audiences punish it.",
  // An outcome with a population and a period, and no denominator.
  "Most creators see a difference in the first week.",
  // A comparative outcome about users of the product.
  "Creators who use this ship more often.",
  // Performance asserted through a metaphor rather than a metric noun.
  "The difference between a post that dies and one that travels.",
  // Social proof as a stand-in for evidence.
  "Join thousands of creators already doing this.",
  // The bare assertion, which no pattern over vocabulary can reach.
  "It works.",
];

/**
 * A specimen that MUST match each claim, so the scan is proved non-vacuous per
 * word rather than as a whole.
 *
 * The failure this rules out: a typo in one pattern leaves that word sayable
 * while the suite stays green, because some OTHER pattern matched the injected
 * string. `/onboarding`'s scan already learned this once — the compliance gate
 * found a probe satisfied by two words alone (2026-08-27).
 */
export const CLAIM_SPECIMENS: Readonly<Record<string, string>> = {
  learn: "we learn your style over time",
  train: "we train a model on your posts",
  improve: "it improves with every post",
  accurate: "these rules are accurate",
  confidence: "we are 80% confident in this",
  guarantee: "results are guaranteed",
  "understands you": "the product understands your voice",
  "knows your": "it knows your audience",
  "we will": "we will do this next",
  generate: "we generate hooks for you",
  script: "your script is ready",
  hook: "ten hooks per batch",
  analyse: "we analyse your posts",
  // MARKETING_CLAIMS. The specimen is the sentence the landing actually
  // shipped, so the pattern is measured against the defect it exists for.
  proven: "built on mechanisms proven by posted results",
  "that performs": "built on mechanisms that perform",
  "high-performing": "a high-performing hook shape",
  // PERFORMANCE_CLAIMS (slice 6, R20/R21). Each specimen is the sentence the
  // pattern exists to stop appearing on the one screen that hands a creator
  // something to publish — every one of them is a claim about a future this
  // product has logged no evidence about.
  viral: "this hook goes viral",
  "goes viral": "this hook goes viral",
  views: "expect more views on this one",
  engagement: "this lifts engagement",
  "more reach": "this one gets more reach",
  "reach an audience": "this will reach a wider audience",
  "will perform": "this draft will perform well",
  outperform: "it outperforms your last post",
  "blow up": "this one is going to blow up",
  // The OWN-BASELINE half. `viral` and `goes viral` share a specimen on
  // purpose: the bare adjective and the predicate built from it are two shapes
  // over one sentence, and that is exactly the pair whose enforcement differs
  // (`flag` and `hard`). Each still has to match its own pattern, which is what
  // the non-vacuity loops assert.
  "beats your baseline": "this beats your baseline",
  "better than your last": "this performs better than your last three posts",
  "best-performing": "your best-performing hook shape is this one",
  "more views": "this will get you more views than your last post",
  "proven to": "it is proven to work for this audience",
};

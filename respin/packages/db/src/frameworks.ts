// THE SHARED FRAMEWORK LIBRARY AND PRIVATE FRAMEWORKS (slice 7, R5a-R5c;
// PRD §4D REQ-D01/D02/D04/D05).
//
// WHY A MODULE RATHER THAN METHODS ON `respinDb` — the same reason
// `onboarding-ops.ts`, `brain-ops.ts` and `interview-ops.ts` give: the private
// operations compose `ProfileScope.mint` with a write, and every one needs a
// `db` handle a test can supply. `app-server.ts` binds them to the server
// handle; this file is what the package's own suites drive.
//
// THREE THINGS LIVE HERE AND THEY ARE DELIBERATELY TOGETHER:
//
//  1. THE SEED (R5a). F1-F9, approved, with `owner_profile_id` and
//     `workspace_id` NULL — library content belongs to nobody, which the two
//     `frameworks_shared_has_no_owner` / `_private_has_owner` CHECKs already
//     make unrepresentable to get wrong.
//  2. THE MECHANISM-LEVEL CONTENT SCAN (R5a / REQ-D04). It runs on EVERY
//     framework write, seed and private alike — see `assertMechanismLevel` for
//     why the private half is in scope too, and for the honest statement of
//     what it cannot detect.
//  3. THE READERS (R5b) and the private CRUD (R5c). The reader's default is
//     `approved AND retired_at IS NULL` and it additionally excludes
//     superseded versions, because a superseded version is not a second live
//     framework — it is history.
//
// WHAT IS NOT HERE, AND WHY: the TIER. PRD §4G gives private frameworks to Pro
// and Studio only, and `@respin/db` cannot resolve a tier — its sole authority
// is `getWorkspaceBillingState` in `@respin/credits`, which depends on this
// package (R-30 constraint 2, the defect class behind two M1 round-6 findings).
// So every private write takes an `entitlement` argument with NO DEFAULT and
// refuses `not_included` by name (`PrivateFrameworkTierError`). That argument
// is the SEAM: `@respin/credits` owns the tier -> entitlement mapping. The
// db half fails closed either way, which `createProfile`'s cap — decided
// entirely one layer up — deliberately does not.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DbLike, TxLike } from "./db-like";
import { frameworks, type Framework } from "./brain-schema";
import {
  ProfileScope,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "./with-workspace";
import {
  FrameworkAccessError,
  FrameworkContentError,
  FrameworkLimitError,
  FrameworkStaleError,
  PrivateFrameworkTierError,
  ProfileRoleError,
  WorkspacePausedError,
} from "./errors";
import { hasOpenPause } from "./pause";
import {
  FRAMEWORK_LIST_MAX,
  FRAMEWORK_NAME_MAX,
  FRAMEWORK_SLUG_MAX,
  FRAMEWORK_TEXT_MAX,
  FRAMEWORK_VERSION_MAX,
  PRIVATE_FRAMEWORK_COUNT_MAX,
} from "./storage-limits";

// ---------------------------------------------------------------- the shapes

/**
 * What a framework is FOR — a closed goal vocabulary, never free text.
 *
 * CLOSED FOR THE REASON `brain-reason.ts` closed its own: free text on a
 * governed column is the channel C-42 removed, and "applicability (niche, goal
 * type)" (REQ-D01) is exactly where a creator's specifics would otherwise
 * arrive ("solo founders in Leeds who make £4k/month").
 */
export const FRAMEWORK_GOALS = [
  "follows",
  "saves",
  "shares",
  "comments",
  "reach",
] as const;
export type FrameworkGoal = (typeof FRAMEWORK_GOALS)[number];

/**
 * The niche vocabulary, which today has exactly one member.
 *
 * `any` IS THE HONEST ANSWER FOR EVERY SEEDED FRAMEWORK, not a placeholder for
 * a taxonomy somebody forgot. A mechanism is tenant-neutral by construction
 * (REQ-D04), the nine seeded here were extracted from one corpus and nothing
 * has tested them against a niche split, and a niche taxonomy is the trend
 * monitor's to produce (slice 8, REQ-E02's niche subscriptions). Inventing one
 * here would be nine claims about applicability nobody measured — R-29's
 * authority-borrowing, in the field whose whole job is to say where a
 * mechanism applies.
 */
export const FRAMEWORK_NICHES = ["any"] as const;
export type FrameworkNiche = (typeof FRAMEWORK_NICHES)[number];

const applicabilitySchema = z.strictObject({
  goal: z.enum(FRAMEWORK_GOALS),
  niche: z.enum(FRAMEWORK_NICHES),
  /** One mechanism-level sentence. Scanned like every other prose field. */
  note: z.string(),
});

/**
 * Where the mechanism was seen, as an INTERNAL reference — never a link.
 *
 * NO URL FIELD EXISTS, and that absence is the control rather than a
 * simplification. REQ-D04 forbids personal details in library content and the
 * card names "personal-account URLs" specifically; every post permalink on
 * every platform this product touches carries a handle in its path, so a
 * nullable `url` here would be the one field where the scan's URL rule had to
 * be switched off. `ref` is an id into our own records (a corpus batch today,
 * a `trend_items` row from slice 8) and `assertMechanismLevel` refuses a URL
 * in it like anywhere else.
 */
export const FRAMEWORK_SOURCE_KINDS = [
  "internal_autopsy",
  "creator_submitted",
  "trend_item",
] as const;
export type FrameworkSourceKind = (typeof FRAMEWORK_SOURCE_KINDS)[number];

const sourceReferenceSchema = z.strictObject({
  kind: z.enum(FRAMEWORK_SOURCE_KINDS),
  ref: z.string(),
});

const evidenceEntrySchema = z.strictObject({
  kind: z.enum(FRAMEWORK_SOURCE_KINDS),
  ref: z.string(),
  /** What was observed about the MECHANISM. Never a metric, never a person. */
  observation: z.string(),
});

/**
 * The caller-suppliable half of a framework. Every other column —
 * `visibility`, the owner ids, `curator_status`, `version`, `confidence`,
 * `retired_at`, `superseded_at`, the timestamps — is SERVER-DERIVED and is
 * built field by field at the insert, never spread from this object.
 *
 * That is the same "never build a spread to strip" property slice 6's claim
 * capabilities have, and it is stronger than `stripGuarded`: a value smuggled
 * in through `as unknown as` cannot be stripped incorrectly because it is
 * never copied at all. `packages/db/tests/frameworks.test.ts` drives that with
 * a cast rather than only with `@ts-expect-error` (CLAUDE.md 2026-08-21).
 */
export const frameworkContentSchema = z.strictObject({
  name: z.string(),
  beats: z.array(z.string()),
  whyItConverts: z.string(),
  applicability: z.array(applicabilitySchema),
  sourceReferences: z.array(sourceReferenceSchema),
  evidenceEntries: z.array(evidenceEntrySchema),
  testedCaveats: z.array(z.string()),
  /** REQ-D01's market status. `retired` is not writable here — see `retirePrivateFramework`. */
  saturation: z.enum(["observed", "emerging", "established", "saturated"]),
});
export type FrameworkContent = z.infer<typeof frameworkContentSchema>;

/**
 * Whether this workspace's plan includes private frameworks (REQ-D05).
 *
 * A TWO-VALUE UNION, NOT A BOOLEAN, and not optional. A boolean parameter is
 * indistinguishable at a call site from the twenty other booleans in this
 * repo, and an OPTIONAL one is the shape CLAUDE.md's 2026-08-29 lesson is
 * about — "a REQUIRED parameter with no default reads exactly like a guard and
 * is not one until a test drives its false branch". Its false branch is driven
 * in `packages/db/tests/frameworks.test.ts`.
 */
export type PrivateFrameworkEntitlement = "included" | "not_included";

// ------------------------------------------------- the mechanism-level scan

/**
 * ONE RULE OF THE MECHANISM-LEVEL SCAN (REQ-D04).
 *
 * The patterns are REGEXP LITERALS, never assembled from strings: a regex
 * built from a string literal needs doubled backslashes, and one lost
 * backslash turns `\s` into `s`, which makes the rule match nothing and the
 * scan report zero violations — indistinguishable from a scan that works
 * (CLAUDE.md 2026-08-21). Every rule below is additionally driven by a PLANTED
 * violation in `packages/db/tests/frameworks.test.ts`, so "no violations" is a
 * measurement rather than the absence of one.
 */
export type MechanismContentRule = {
  id: string;
  pattern: RegExp;
  /** Completes "…<field> <detail>" in `FrameworkContentError`. */
  detail: string;
  /**
   * Does this rule need CAPITAL LETTERS to mean what it means?
   *
   * THE DEFAULT IS `false`, AND THE DEFAULT IS THE WIDE DIRECTION — which is
   * the whole point of writing this as an opt-OUT (tenancy gate, 2026-09-02).
   * `matchesMechanismRule` used to test the RAW value while every other
   * enforcement point of this vocabulary lowercases first (`claims.ts`'s
   * `sentence.toLowerCase()`, all six `*-ui` HONESTY SCANS — the suites that
   * run the canon; `billing-ui` and `model-spend-ui` do not — and
   * `tests/framework-content-honesty.test.ts`), and the fourteen `claim:`
   * patterns carry no `i` flag and CANNOT — the binding test
   * pins their flags to the canon's. So the same sentence was refused
   * lowercase and STORED capitalised: nine of ten sentence-initial claims were
   * measured ACCEPTED on the production write path — "Outperforms the
   * standalone pieces every time.", "Views climb when the loop is seamless.",
   * "Best-performing hook shape in the library.", "Proven to work for this
   * audience." — while "it outperforms your last post" was refused. The
   * agreement test held at PATTERN level and broke at APPLICATION level,
   * because its behavioural half drove only the lowercase specimens.
   *
   * A NEW RULE THEREFORE GETS CASE-INSENSITIVE MATCHING WITHOUT ASKING, and
   * only NARROWING costs a line here. `attributed_person` is the one rule that
   * takes it: its `[A-Z][a-z]+` is how it distinguishes a proper noun from
   * ordinary prose, and lowercasing the value would silence it completely
   * while an `i` flag would make "from the top" an attribution. The flag is
   * proved LOAD-BEARING rather than decorative in
   * `tests/framework-content-honesty.test.ts`: a case-sensitive rule must
   * answer differently for its own specimen lowercased, or the flag is
   * refused.
   */
  caseSensitive?: true;
  /**
   * Matched spans this rule does NOT count.
   *
   * TESTED AGAINST THE RULE'S CAPTURE GROUP, not against the span — the token
   * the rule is actually making a claim about (2026-09-02). Anchoring
   * `NOT_A_PERSON` on the END of the span made the exemption STRUCTURALLY
   * UNREACHABLE for `attributed_person`'s possessive half, whose spans end in
   * the NOUN: "Instagram's version of this loop is one beat shorter." was
   * refused as reading like a person's name, with the exemption present,
   * listing `Instagram` first, and unable to fire. A rule that carries an
   * `exempt` must therefore CAPTURE the token it exempts on, in every
   * alternative; `matchesMechanismRule` falls back to the whole span when a
   * rule captures nothing, and both halves are driven in
   * `tests/framework-content-honesty.test.ts`.
   *
   * IT EXISTS FOR ONE RULE AND ITS COST IS STATED (learning/tenancy gate,
   * 2026-09-01). `attributed_person` refused FIVE ordinary sentences on the
   * live Pro+ write path — "a concept from Japanese", "from Instagram to
   * TikTok", "from Monday footage", "from Reels", "from Twitter-era discourse"
   * — each with the reason "attributes the mechanism to a named person", which
   * is FALSE about what the creator wrote. A refusal naming a cause that did
   * not happen is the export-absence class this repo has already fixed twice.
   *
   * SO THE EXEMPTION IS A CLOSED SET OF PROPER NOUNS THAT ARE NOT PEOPLE —
   * platforms, weekdays, months, languages and demonyms — and not an open
   * "things that turned out to be false positives" list. Its own residue is
   * recorded below with the rest of the scan's limits, and the rule's `detail`
   * is HEDGED to match what a lexical rule can actually know.
   */
  exempt?: RegExp;
};

/**
 * WHAT THIS SCAN ENFORCES, AND — SAID PLAINLY — WHAT IT CANNOT.
 *
 * EVERY BULLET BELOW NAMES THE LIST IT ENFORCES OVER, never the class it would
 * like to (rewritten 2026-09-02). The previous version claimed "a follower
 * count or other metric value in DIGITS" and "a URL or bare domain, which
 * covers personal-account URLs a fortiori"; seven sentences were then MEASURED
 * ACCEPTED against exactly those two sentences, and the two that mattered most
 * — `It did 40,000 reach in the first week.` and `See respin.studio.uk/f1` —
 * were accepted because `reach` was in no noun list and `.uk` is in no TLD
 * list. A claim about a CLASS, backed by a list, is the substitution this
 * block has now made twice.
 *
 * ENFORCED, because each is structurally detectable:
 *  - an @handle (any platform's account token);
 *  - a URL, a domain whose TLD is in THIS RULE'S OWN LIST (`com net org io co
 *    tv me app xyz to`), or any dotted host followed by a PATH — the last of
 *    those is what catches `respin.studio.uk/f1`, and a ccTLD with no path
 *    (`respin.studio.uk`) is still accepted, so "a fortiori" is not a claim
 *    this rule can make;
 *  - an EMAIL ADDRESS and a PHONE NUMBER — both structurally detectable, and
 *    both accepted outright until 2026-09-01 (`sarah.mitchell@mailbox.example`
 *    slips the handle rule, whose `@` must follow a non-word character, and
 *    the domain is not in the URL rule's TLD list; `07700 900123` is a digit
 *    run no metric rule looks at). Their absence was a GAP rather than a
 *    stated limit, which is why they are rules and not a paragraph;
 *  - a DIGIT RUN carrying a UNIT (`40k`, `1.2M`, `3.75x`, `12%`, `£4,000`,
 *    `$60`) or one of `METRIC_NOUNS` (`200 follows`, `40000 views`,
 *    `40,000 reach`, `5.00 follows per 1k`). That noun list is DERIVED from
 *    `FRAMEWORK_GOALS` and no longer hand-copied: `reach` is a first-class
 *    goal of this very file and was missing from every rule until 2026-09-02;
 *  - the WORD-FORM of the same claim, which the digit rules cannot see: a
 *    scale word carrying a metric noun (`four hundred thousand views`,
 *    `nine hundred follows`, `four hundred thousand reach`), a multiplier
 *    beside a metric noun (`more than doubled her usual numbers`, `twice as
 *    many saves`, `half again as many saves`), and the wordy performance
 *    frames (`six-figure`, `went viral`, `converts at`, `twelve percent`);
 *  - a phrase that LOOKS LIKE it credits the mechanism to a named person
 *    ("by Sarah", "credited to Marcus", "Vivian's version"), minus the closed
 *    non-person proper nouns in `NOT_A_PERSON` — see `exempt` above.
 *
 * WHAT THE PREVIOUS VERSION OF THIS LIST CLAIMED AND DID NOT DO. It said the
 * metric rules covered "every spelling this corpus actually produced" and
 * recorded exactly one exemption. Four sentences were then MEASURED accepted:
 * `it did four hundred thousand views and nine hundred follows`, `it more than
 * doubled her usual numbers`, `questions to sarah.mitchell@mailbox.example`,
 * `text 07700 900123 for the template`. The claim was true of the corpus and
 * was offered as a claim about the RULE, which is the same substitution the
 * `frameworks_shared_has_no_owner` sentence one file over made.
 *
 * NOT ENFORCED, and not claimed — the residue, named as classes rather than as
 * "everything else". Every one was MEASURED accepted on the live write path,
 * not imagined:
 *  - an arbitrary personal name in ordinary prose. "a devout Catholic mother
 *    in Leeds" is `brain-reason.ts`'s own recorded counterexample, and the
 *    lesson recorded beside it is that every detector proposed for that class
 *    is "a list of counterexamples wearing the word class";
 *  - a PROPER NOUN that is not a person and is not in `NOT_A_PERSON` — a city,
 *    a brand, a book. Those still refuse after `by`/`from`, and the refusal
 *    says "reads like", which is the true statement a lexical rule can make;
 *  - a BARE NUMBER with no unit and no listed noun beside it: `The piece
 *    earned 4000 in template sales.` A rule over large integers would refuse
 *    "a 2019 trend", and a rule over durations would refuse the craft
 *    sentences this file's own tests keep sayable ("Hold the first 2 seconds",
 *    `Average watch time was 14 seconds`). The unit or the noun is what makes
 *    a number a metric claim, and with neither present this scan cannot tell;
 *  - a NAMED STATISTIC used as a bare noun — "watch time", "retention",
 *    "conversion" — deliberately: "cut on the beat to hold watch time" is an
 *    honest mechanism sentence, and refusing it would be the same over-reach
 *    the three bare metric nouns in `PERFORMANCE_CLAIM_RULES` are already
 *    recorded for;
 *  - a comparative with NO VOCABULARY AT ALL ("it did better than the
 *    others"). SAID PRECISELY, because the previous version of this bullet
 *    read as covered and was not: `tests/framework-content-honesty.test.ts`
 *    runs the VOCABULARY over this file's seed, and a ranking that uses none
 *    of those words matches nothing — five such sentences sat in the seed for
 *    a whole review round under that sentence, rendering on
 *    `/studio/frameworks` and riding into every generation's prompt. For the
 *    SEED the class now has a control: that file's CORPUS-COMPARATIVE scan
 *    requires a ranking or superlative marker to be accompanied by the
 *    population it is over. For CREATOR-WRITTEN private frameworks the class
 *    is UNCOVERED, and REQ-D02's curator is its only control.
 *
 * The control for every class above is REQ-D02's HUMAN CURATOR: nothing is
 * recommendable until `curator_status = 'approved'`, and no writer in this
 * file can set that — `createPrivateFramework` hard-codes `proposed` for
 * private rows, and the shared seed is approved by an operator running the
 * seed, which is a person taking responsibility for nine documents they read.
 *
 * REVISIT TRIGGER: a measured claim reaching a creator through a class not
 * named above — that is a gap this limit did not predict, and it is the signal
 * to change the MECHANISM rather than to add a nineteenth pattern.
 *
 * WHY IT RUNS ON PRIVATE ROWS TOO. REQ-D04's subject is library contributions,
 * and a private framework is not one — yet. It is the exact material REQ-D03
 * proposes INTO the curation queue, `generations.framework_versions` records
 * it beside library rows, and it is fed to a vendor as prompt context like any
 * other framework. Applying the rule to the class rather than to today's
 * instance is CLAUDE.md's 2026-07-30 lesson; the cost is that a creator cannot
 * put their own handle in their own framework, and the honest trade is that a
 * framework is a description of a MOVE, which never needs one.
 */
/**
 * Capitalised words that are NOT people, for `attributed_person`'s `exempt`.
 *
 * A CLOSED SET OF CLASSES, not a list of counterexamples: every platform this
 * product's PRD names, every weekday, every month, and the language/demonym
 * adjectives a borrowed-concept framework is written in. Each class is
 * enumerable and finite, which is what separates this from the personal-name
 * detector `brain-reason.ts` refuses to build.
 *
 * A REGEXP LITERAL, like every other pattern here, and anchored on BOTH ENDS
 * because it is tested against the TOKEN the rule CAPTURED — never against the
 * span and never against free text (see `matchesMechanismRule`). It was
 * anchored on the END OF THE SPAN until 2026-09-02, which made it structurally
 * unreachable for every possessive attribution, whose span ends in the noun:
 * "Instagram's version of this loop is one beat shorter." refused with
 * `Instagram` sitting first in this very list.
 *
 * `May` IS DELIBERATELY ABSENT from the months, and that is a decision rather
 * than an oversight: it is also a person's name, so exempting it would open
 * the one month that carries the risk the rule exists for. "from May" refuses,
 * with the hedged wording, which is the honest outcome for an ambiguous token.
 */
const NOT_A_PERSON =
  /^(?:Instagram|TikTok|YouTube|Youtube|Twitter|Threads|Reels|Reel|Shorts|Stories|Snapchat|LinkedIn|Facebook|Pinterest|Twitch|Reddit|Tumblr|Substack|Discord|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|June|July|August|September|October|November|December|Japanese|Chinese|Korean|Spanish|French|German|Italian|Portuguese|Russian|Arabic|Hindi|Greek|Latin|English|Dutch|Swedish|Danish|Norwegian|Finnish|Polish|Turkish|Hebrew|Welsh|Irish|Scottish)$/;

/**
 * THE THIRD COPY OF ONE VOCABULARY, AND WHY IT HAD TO EXIST (learning-honesty
 * gate, 2026-09-01).
 *
 * THE DEFECT THIS CLOSES. The honesty canon had THREE text sources and only
 * two were scanned: static screen copy (scanned by the `*-ui` honesty scans), model
 * output (`packages/modes/src/claims.ts`, scanned since slice 6), and
 * SEEDED / CURATOR-AUTHORED LIBRARY DATA — scanned by nothing. Two sentences
 * of `SHARED_FRAMEWORK_SEED` were measured matching `PERFORMANCE_CLAIMS`
 * entries that are `enforcement: "hard"` on the model side: a model emitting
 * either gets the draft REFUSED and the creator DEBITED, while the product's
 * own library said them verbatim to every creator on `/studio/frameworks`.
 * That is one vocabulary with two enforcement points and a third surface with
 * none — CLAUDE.md's 2026-08-29 population lesson, on the honesty canon
 * itself.
 *
 * WHY A COPY AND NOT AN IMPORT. `tests/support/forbidden-claims.ts` is the
 * canon and a production module may not import from the test tree;
 * `@respin/db` is the bottom of the dependency graph and cannot import
 * `@respin/modes`, which depends on it. The same constraint produced the
 * second copy, and the same answer applies: the copy is BOUND BY A TEST
 * (`tests/framework-content-honesty.test.ts`) id-for-id, source-for-source and
 * flag-for-flag, exactly as `tests/claims-vocabulary-agreement.test.ts` binds
 * `claims.ts`. Two copies of one list are the divergence this repo has already
 * shipped once; three unbound copies would be worse, and three bound ones are
 * a red test the day any of them moves.
 *
 * `PERFORMANCE_CLAIMS` ONLY, NOT `FORBIDDEN_CLAIMS`, and the line is drawn on
 * purpose. `FORBIDDEN_CLAIMS` bans claims the PRODUCT makes about itself —
 * "we learn", "we are confident", "we will". A framework is a description of a
 * move, and a beat that says "the viewer learns the constraint" makes no claim
 * about this product at all; refusing it would be the same false-reason
 * over-reach the `attributed_person` rule was just corrected for. The seed is
 * held to BOTH lists — it is checked-in copy rendered verbatim to every
 * creator, which is a product surface — and that is enforced in the test file
 * rather than here.
 *
 * EVERY SHAPE IS `hard` HERE, including the three the model side only flags
 * (`viral`, `views`, `engagement`). That is a deliberate difference of surface
 * rather than an oversight: `claims.ts` softens them because `whyThisPerforms`
 * is a section every mode must emit and the screen has to label it, and a
 * framework has no such obligation. Library content stating a metric noun is
 * REQ-D04's subject directly.
 *
 * AND THAT IS THIS RULE FAMILY'S OWN WEAKEST POINT, NAMED RATHER THAN LEFT TO
 * BE DISCOVERED — AND THEN MEASURED TRUE (2026-09-02). The three bare nouns
 * have no predicate, so an honest mechanism sentence is refused: FOUR of
 * twelve plausible ones were measured refused on the live write path — "This
 * shape wins saves, not views." with the reason "states a view count claim",
 * "It trades engagement for attachment." with "states an engagement claim",
 * "The viral phase of this shape has passed." with "claims content goes
 * viral". Each reason is FALSE about what the creator wrote, which is the
 * export-absence class again.
 *
 * SO THE THREE DETAILS ARE HEDGED, exactly as `attributed_person`'s was, and
 * DEMOTION IS DELIBERATELY NOT DONE HERE. Demoting them to the predicate-only
 * shapes their `claims.ts` twins already are would change the PATTERN, and the
 * pattern is pinned source-for-source to `PERFORMANCE_CLAIMS` by
 * `tests/framework-content-honesty.test.ts` — one vocabulary, three
 * enforcement points, and the model side lives in `packages/modes`. Moving it
 * on one side only is the divergence the binding exists to stop, so the
 * demotion is a change to the CANON and belongs to whoever owns both files.
 * The `detail` is not pinned by that binding, because it is this surface's own
 * refusal copy, so hedging is the half that can honestly land here alone.
 *
 * What the hedge says is what the rule KNOWS: the word is present, and on this
 * surface it reads as a claim about how a piece performed. The direction stays
 * fail-closed — this is content curated into a shared library and fed to a
 * vendor — and nothing here has been measured against real Pro-creator
 * framework prose, because no creator has written one yet. **Revisit trigger:
 * the first creator-written private framework refused by `claim:viral`,
 * `claim:views` or `claim:engagement`. The honest move then is the demotion
 * above — a canon change touching `claims.ts`, `forbidden-claims.ts` and this
 * file together — not a widened exception here.**
 */
const PERFORMANCE_CLAIM_RULES: readonly MechanismContentRule[] = [
  {
    id: "claim:viral",
    pattern: /\bviral|\bvirality/,
    detail: "uses the word 'viral', which reads as a claim about how a piece did",
  },
  {
    id: "claim:goes viral",
    pattern: /\b(go(es|ing)?|went|will go|gonna go)\s+viral\b/,
    detail: "forecasts that content goes viral",
  },
  {
    id: "claim:views",
    pattern: /\bviews\b/,
    detail: "uses the metric noun 'views', which reads as a claim about how a piece did",
  },
  {
    id: "claim:engagement",
    pattern: /\bengagement\b/,
    detail:
      "uses the metric noun 'engagement', which reads as a claim about how a piece did",
  },
  {
    id: "claim:more reach",
    pattern: /\b(more|wider|bigger|larger|extra|higher) reach\b/,
    detail: "promises more reach",
  },
  {
    id: "claim:reach an audience",
    pattern:
      /\breach(es|ing)? (a |an |your |the )?(wider |bigger |larger |new |whole |right )?(audience|following|viewers)\b/,
    detail: "promises to reach an audience",
  },
  {
    id: "claim:will perform",
    pattern: /\bwill perform/,
    detail: "forecasts how content will perform",
  },
  {
    id: "claim:outperform",
    pattern: /\boutperform/,
    detail: "claims content outperforms other content",
  },
  {
    id: "claim:blow up",
    pattern: /\bblow(s|ing)? up\b/,
    detail: "forecasts that content blows up",
  },
  {
    id: "claim:beats your baseline",
    pattern: /\bbeat(s|ing)? (your|my|our|their|the) (baseline|average|numbers|usual|best)\b/,
    detail: "claims content beats a baseline",
  },
  {
    id: "claim:better than your last",
    pattern:
      /\b(perform(s|ed|ing)?|do(es)?|did|work(s|ed)?|land(s|ed)?|hit(s)?) better than (your|my|our|their|the)\b/,
    detail: "claims content does better than earlier content",
  },
  {
    id: "claim:best-performing",
    pattern: /\bbest[- ]performing\b/,
    detail: "ranks content as best-performing",
  },
  {
    id: "claim:more views",
    pattern: /\bmore (views|engagement|followers|saves|shares|comments)\b/,
    detail: "promises more of a metric",
  },
  { id: "claim:proven to", pattern: /\bproven to\b/, detail: "claims something is proven" },
];

/**
 * THE METRIC NOUNS THE NUMBER RULES RECOGNISE, WRITTEN AS A LIST.
 *
 * DERIVED FROM `FRAMEWORK_GOALS` rather than hand-copied beside it, because a
 * goal IS a metric noun and hand-copying is what produced the gap (tenancy
 * gate, 2026-09-02): `reach` is a first-class member of this file's own goal
 * vocabulary and appeared in NONE of the three number rules, so
 * `It did 40,000 reach in the first week.` and `It pulled four hundred
 * thousand reach.` were both MEASURED ACCEPTED into shared library content
 * while `40000 views` was refused. A second hand-copied list would have
 * reproduced exactly that.
 *
 * THE PATTERNS BELOW ARE STILL REGEXP LITERALS AND THIS ARRAY IS NOT
 * INTERPOLATED INTO THEM (CLAUDE.md 2026-08-21 — a regex assembled from
 * strings needs doubled backslashes, and one lost backslash makes the rule
 * match nothing while the scan reports zero findings). What the array buys is
 * the COVERAGE CHECK: `packages/db/tests/frameworks.test.ts` plants a
 * violation PER NOUN PER RULE from this list, so adding a goal to
 * `FRAMEWORK_GOALS` turns those cases RED until the literals learn the word.
 * The list is the population, the literal is the pattern, and the test is what
 * keeps them agreeing — which is the only arrangement in which "the nouns are
 * derived from the goals" is a fact rather than a comment.
 *
 * THE FOUR THAT ARE NOT GOALS are metric nouns this product does not offer as
 * a goal. A framework may not state a count of them either.
 */
export const METRIC_NOUNS = [
  ...FRAMEWORK_GOALS,
  "views",
  "likes",
  "subscribers",
  "impressions",
] as const;

export const MECHANISM_CONTENT_RULES: readonly MechanismContentRule[] = [
  {
    id: "handle",
    pattern: /(^|[^A-Za-z0-9_])@[A-Za-z0-9._]{2,}/,
    detail: "names an account handle",
  },
  {
    id: "url",
    // Three shapes: a scheme or `www.`, a domain in THIS LIST of TLDs, and —
    // added 2026-09-02 — any dotted host followed by a PATH, whatever the TLD.
    // `See respin.studio.uk/f1` was measured ACCEPTED under a docblock
    // claiming this rule covered personal-account URLs "a fortiori": `.uk` is
    // not in the list, and neither is any other ccTLD. A bare ccTLD host with
    // no path is STILL accepted and is named in the residue rather than
    // patched with a fourth alternative, because a TLD list is exactly the
    // shape of claim this rule has now over-stated twice.
    pattern:
      /\b(?:https?:\/\/|www\.)|\b[a-z0-9-]+\.(?:com|net|org|io|co|tv|me|app|xyz|to)\b|\b[a-z0-9-]+(?:\.[a-z]{2,}){1,3}\/\S/i,
    detail: "contains a link or a domain",
  },
  {
    id: "metric_unit",
    // `40k`, `1.2M`, `3.75x`, `12%`, `£4,000`, `$60`.
    pattern: /(?:[£$€]\s?\d)|(?:\d(?:[\d,.]*\d)?\s*(?:[kKmM]\b|[xX]\b|%))/,
    detail: "states a metric value",
  },
  {
    id: "metric_noun",
    // `200 follows`, `40000 views`, `40,000 reach`, `5.00 follows per 1k`.
    // The noun alternation is `METRIC_NOUNS` — see that list for why the
    // agreement is a test rather than an interpolation.
    pattern:
      /\d(?:[\d,.]*\d)?\s*(?:\+\s*)?(?:follow(?:s|ers)?|view(?:s)?|like(?:s)?|comment(?:s)?|share(?:s)?|save(?:s)?|subscriber(?:s)?|impression(?:s)?|reach|per\s+1k|\/\s*1k)\b/i,
    detail: "states a performance number",
  },
  {
    id: "metric_phrase",
    // The wordy spellings a number rule cannot see. `percent` joined on
    // 2026-09-02: `12%` was refused and `Conversion rose twelve percent.` was
    // accepted, which is one claim with two spellings and one enforcement.
    pattern:
      /\b(?:six|seven|eight|five|four)[- ]figure(?:s)?\b|\bwent viral\b|\bconvert(?:s|ed)? at\b|\bper ?cent(?:age)?s?\b/i,
    detail: "states a performance claim",
  },
  {
    id: "metric_word_quantity",
    // `four hundred thousand views`, `nine hundred follows`, `thousands of
    // saves`. A SCALE WORD is required — `hundred`/`thousand`/`million`/
    // `billion`/`dozen` — and a small counting word is deliberately NOT.
    //
    // WHAT THAT DISCRIMINATOR ACTUALLY KEEPS SAYABLE, corrected 2026-09-02.
    // It used to claim it "keeps a population size sayable", and that is not
    // what it does: it keeps a SMALL COUNTING WORD sayable ("two pieces in the
    // corpus drew saves"), which is how a corpus population of this size is
    // written. A scale-word population is refused like any other — `A creator
    // with three thousand followers can run this shape.` is an REQ-D01
    // applicability note and it REFUSES, measured, with "states a performance
    // number in words".
    //
    // THAT REFUSAL IS KEPT DELIBERATELY rather than carved out. The lexical
    // difference between a count a piece GOT and a count an account HAS is the
    // verb, which no pattern here can read; the sayable form of the same note
    // is the qualitative one ("a creator with a small following"), which is
    // also the mechanism-level way to say it under REQ-D04. Recorded as a cost
    // in decisions.md rather than left for the next reader to rediscover.
    pattern:
      /\b(?:hundred|thousand|million|billion|dozen)s?\b(?:\s+\S+){0,4}?\s+(?:follow(?:s|ers)?|view(?:s)?|like(?:s)?|comment(?:s)?|share(?:s)?|save(?:s)?|subscriber(?:s)?|impression(?:s)?|reach)\b/i,
    detail: "states a performance number in words",
  },
  {
    id: "metric_multiplier",
    // A MULTIPLIER STEM WITH A METRIC NOUN NEAR IT, in either order:
    // `saves doubled`, `more than doubled her usual numbers`.
    //
    // THE BARE STEM WAS THE WHOLE RULE UNTIL 2026-09-02, and it re-created the
    // defect the same pass was correcting three rules up. Measured refused as
    // "states a performance multiple", none of them containing a metric:
    // `Double the confession: admit the flaw, then admit the flaw behind it.`,
    // `The cut lands on a double-take`, `Escalate by tripling the stakes`.
    // A multiplier is only a performance claim when there is a performance
    // beside it, so the noun is now required within four words.
    pattern:
      /\b(?:follow(?:s|ers)?|view(?:s)?|like(?:s)?|comment(?:s)?|share(?:s)?|save(?:s)?|subscriber(?:s)?|impression(?:s)?|reach|number(?:s)?|baseline|average)\b(?:\s+\S+){0,4}?\s+(?:doubl|tripl|quadrupl)(?:e|ed|es|ing)\b|\b(?:doubl|tripl|quadrupl)(?:e|ed|es|ing)\b(?:\s+\S+){0,4}?\s+(?:follow(?:s|ers)?|view(?:s)?|like(?:s)?|comment(?:s)?|share(?:s)?|save(?:s)?|subscriber(?:s)?|impression(?:s)?|reach|number(?:s)?|baseline|average)\b/i,
    detail: "states a performance multiple",
  },
  {
    id: "metric_multiplier_words",
    // The word-form comparative: `twice as many saves`, `ten times the reach`,
    // `half again as many saves` (that last one measured ACCEPTED before this
    // pass). It carries the SAME metric-noun requirement as the stem rule and
    // for the same reason — `Run it at twice the length.` was refused as a
    // performance multiple, and a length is not a performance.
    pattern:
      /\b(?:twice|three times|four times|five times|ten times|many times|half again)\s+(?:as\s+(?:many|much)\s+)?(?:the\s+|its\s+|their\s+|her\s+|his\s+|your\s+|my\s+|our\s+)?(?:follow(?:s|ers)?|view(?:s)?|like(?:s)?|comment(?:s)?|share(?:s)?|save(?:s)?|subscriber(?:s)?|impression(?:s)?|reach|number(?:s)?|baseline|average)\b/i,
    detail: "states a performance multiple",
  },
  {
    id: "email",
    // Structurally detectable and previously ACCEPTED: the handle rule needs
    // the `@` to follow a non-word character, and `mailbox.example` is not in
    // the URL rule's TLD list.
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.[A-Za-z]{2,}/,
    detail: "contains an email address",
  },
  {
    id: "phone",
    // `07700 900123`, `+44 7700 900123`, `(020) 7946 0018`. Anchored on a
    // leading `+` or a leading `0` so an ordinary year, count or version
    // number cannot reach it.
    pattern:
      /\+\d[\d\s().-]{7,}\d|\(?\b0\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/,
    detail: "contains a phone number",
  },
  {
    id: "attributed_person",
    // "by Sarah", "from Marcus", "credited to Aisha", "Vivian's version".
    //
    // THE ONLY CASE-SENSITIVE RULE, and the flag is what makes the whole rule
    // work: `[A-Z][a-z]+` IS the discriminator between a proper noun and
    // ordinary prose. Lowercasing the value would silence it entirely and an
    // `i` flag would make "from the top" an attribution — so it opts out of
    // the default that every other rule takes (see `caseSensitive`).
    //
    // EACH ALTERNATIVE CAPTURES ITS PROPER NOUN, because that capture is what
    // `exempt` is tested against. Until 2026-09-02 the exemption was tested
    // against the whole matched span and anchored on the span's END, which
    // made it unreachable for this second alternative — every possessive span
    // ends in the NOUN ("Instagram's version"), never in the name.
    //
    // THE DETAIL IS HEDGED, and the hedge is the fix rather than decoration:
    // this rule cannot know that a capitalised word is a person, it can only
    // know that the phrase has the SHAPE of an attribution. Saying more than
    // that is telling a creator a cause that did not happen.
    caseSensitive: true,
    pattern:
      /\b(?:by|from|credited to|invented by|created by|according to)\s+([A-Z][a-z]+)\b|\b([A-Z][a-z]+)(?:'s|’s)\s+(?:version|reel|post|account|corpus|voice)\b/,
    exempt: NOT_A_PERSON,
    detail: "reads like it credits the move to a named person",
  },
  ...PERFORMANCE_CLAIM_RULES,
];

/** Every string inside a framework's content, with the field that holds it. */
function contentStrings(content: FrameworkContent): [string, string][] {
  const out: [string, string][] = [["name", content.name]];
  content.beats.forEach((beat, i) => out.push([`beats[${i}]`, beat]));
  out.push(["whyItConverts", content.whyItConverts]);
  content.applicability.forEach((entry, i) =>
    out.push([`applicability[${i}].note`, entry.note])
  );
  content.sourceReferences.forEach((entry, i) =>
    out.push([`sourceReferences[${i}].ref`, entry.ref])
  );
  content.evidenceEntries.forEach((entry, i) => {
    out.push([`evidenceEntries[${i}].ref`, entry.ref]);
    out.push([`evidenceEntries[${i}].observation`, entry.observation]);
  });
  content.testedCaveats.forEach((caveat, i) =>
    out.push([`testedCaveats[${i}]`, caveat])
  );
  return out;
}

/**
 * Does one rule fire on one string, after its exemptions?
 *
 * THE VALUE IS LOWERCASED UNLESS THE RULE SAYS IT NEEDS THE CASE (2026-09-02).
 * The two other enforcement points of this vocabulary lowercase before they
 * match — `claims.ts` scans `sentence.toLowerCase()` and every `*-ui` suite
 * that runs the canon lowercases the rendered HTML first — while this one
 * tested the RAW value, so nine of ten sentence-initial claims were measured
 * STORABLE here and refused there. See `caseSensitive` on `MechanismContentRule` for the measurement and
 * for why the default is the wide direction.
 *
 * EVERY MATCH IS CONSIDERED, not the first. `pattern.test` answers "is there a
 * match somewhere", so a sentence whose FIRST attribution-shaped span is
 * exempt and whose SECOND is a real name would be accepted by a
 * test-then-exempt implementation — the exemption would have widened from a
 * span to the whole string. `matchAll` over a `g` copy is what makes the
 * exemption match-local.
 *
 * AND THE EXEMPTION IS TESTED AGAINST THE RULE'S CAPTURE, not against the
 * span: `exemptSubject` takes the first capture group the match produced and
 * falls back to the whole span for a rule that captures nothing. Testing the
 * span is what made `NOT_A_PERSON` unreachable for every possessive
 * attribution — see `exempt`.
 *
 * THE `g` COPY IS BUILT FROM THE REGEXP OBJECT, never from a string: `new
 * RegExp(pattern, flags)` copies `source` verbatim, so the doubled-backslash
 * hazard CLAUDE.md's 2026-08-21 lesson is about cannot arise. The rules carry
 * no `g` themselves — asserted in `packages/db/tests/frameworks.test.ts`,
 * because a `g` pattern's `.test` advances `lastIndex` and would make this
 * function's answer depend on how many strings preceded it.
 */
function exemptSubject(match: RegExpMatchArray): string {
  return match.slice(1).find((group) => group !== undefined) ?? match[0];
}

export function matchesMechanismRule(
  rule: MechanismContentRule,
  value: string
): boolean {
  const subject = rule.caseSensitive ? value : value.toLowerCase();
  if (!rule.exempt) return rule.pattern.test(subject);
  for (const match of subject.matchAll(
    new RegExp(rule.pattern, `${rule.pattern.flags}g`)
  )) {
    if (!rule.exempt.test(exemptSubject(match))) return true;
  }
  return false;
}
/**
 * Refuse framework content that is not mechanism-level (REQ-D04).
 *
 * EVERY STRING, NOT A NAMED LIST OF FIELDS. `contentStrings` walks the parsed
 * shape, so a field added to `frameworkContentSchema` without being added here
 * is a compile error at the destructure rather than an unscanned channel —
 * which is the population-as-a-list rule CLAUDE.md's 2026-08-29 lesson states.
 */
export function assertMechanismLevel(content: FrameworkContent): void {
  for (const [field, value] of contentStrings(content)) {
    for (const rule of MECHANISM_CONTENT_RULES) {
      if (matchesMechanismRule(rule, value)) {
        throw new FrameworkContentError(field, rule.detail);
      }
    }
  }
}

/**
 * The evidence ladder (R-29): `confidence` is DERIVED from how many evidence
 * entries a framework carries, never hand-typed.
 *
 * `frameworks_confidence_matches_evidence` is the same ladder as a CHECK, and
 * `packages/db/tests/frameworks.test.ts` drives the two against each other
 * across `n = 0..6` against real SQL rather than asserting they look alike.
 */
export const FRAMEWORK_CONFIDENCE_RUNGS = [
  "unsupported",
  "single_case",
  "repeated",
  "contrasted",
] as const;
export type FrameworkConfidence = (typeof FRAMEWORK_CONFIDENCE_RUNGS)[number];

export function deriveFrameworkConfidence(
  evidenceEntries: readonly unknown[]
): FrameworkConfidence {
  const n = evidenceEntries.length;
  if (n === 0) return "unsupported";
  if (n === 1) return "single_case";
  if (n < 5) return "repeated";
  return "contrasted";
}

/**
 * A slug from a name — server-derived, and STABLE ACROSS VERSIONS.
 *
 * Derived at CREATE and then carried forward by every later version, so
 * renaming a framework does not change its identity (and therefore does not
 * silently orphan the `{id, version}` pairs `generations.framework_versions`
 * already recorded). NFKD + strip marks so two names a person cannot tell
 * apart do not become two frameworks.
 */
export function frameworkSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FRAMEWORK_SLUG_MAX);
  if (slug.length === 0) {
    throw new FrameworkContentError(
      "name",
      "has no letters or digits, so it cannot identify a framework"
    );
  }
  return slug;
}

// --------------------------------------------------------------- the readers

/**
 * A framework as a READER hands it out, with R5b's saturation notice attached.
 *
 * THE NOTICE IS PART OF THE ROW, not a thing each screen remembers to add.
 * REQ-D02 says saturated frameworks "warn and demand a fresh interpretation",
 * and a warning that every consumer has to reimplement is a warning one of
 * them will omit — which is the "fix the class, not the field" rule applied to
 * copy. `null` means there is nothing to warn about.
 */
export type EligibleFramework = Framework & {
  saturationNotice: string | null;
};

/**
 * What a creator is told about a saturated framework.
 *
 * IT DOES NOT PROMISE ANYTHING, and it deliberately avoids the vocabulary
 * `tests/support/forbidden-claims.ts` bans — no "guarantee", no "confidence",
 * no forecast. What it says is what is actually known: audiences have seen a
 * lot of this shape, so the mechanism has to be re-interpreted rather than
 * re-run.
 */
export const SATURATION_NOTICE =
  "Audiences have seen a lot of this shape lately. Treat it as a mechanism to re-interpret from scratch, not as a move that works because it worked before — a saturated shape re-run as-is is the version that stops landing.";

const withSaturationNotice = (row: Framework): EligibleFramework => ({
  ...row,
  saturationNotice: row.saturation === "saturated" ? SATURATION_NOTICE : null,
});

/**
 * The predicate every framework reader shares (R5b).
 *
 * THREE CONDITIONS, and each excludes a different thing:
 *   `curator_status = 'approved'` — REQ-D02: a proposed or rejected framework
 *       is not recommendable, and `proposed` is what every private row and
 *       every autopsy proposal starts as.
 *   `retired_at IS NULL`          — R5b's stated rule, literally. The
 *       `frameworks_retired_stamp` equality means this is the same set as
 *       `saturation <> 'retired'`, so there is one answer and not two.
 *   `superseded_at IS NULL`       — a superseded version is HISTORY, not a
 *       second live framework. Without it a framework edited three times would
 *       enter generation four times, and the oldest text would arrive beside
 *       the newest.
 */
const recommendable = () =>
  and(
    eq(frameworks.curatorStatus, "approved"),
    isNull(frameworks.retiredAt),
    isNull(frameworks.supersededAt)
  );

/**
 * The approved, non-retired SHARED library (R5b).
 *
 * NO SCOPE PARAMETER, and that is correct rather than an omission: a shared
 * framework has `owner_profile_id` and `workspace_id` NULL by CHECK — it
 * belongs to nobody, it is the same nine rows for every workspace, and there
 * is nothing to isolate. The `visibility = 'shared'` predicate is what keeps
 * a creator's private row out of a query that has no cage.
 */
export async function sharedFrameworkLibrary(
  db: DbLike | TxLike
): Promise<EligibleFramework[]> {
  const rows = await db
    .select()
    .from(frameworks)
    .where(and(eq(frameworks.visibility, "shared"), recommendable()))
    .orderBy(asc(frameworks.slug));
  return rows.map(withSaturationNotice);
}

// ------------------------------------------------------- the private surface

/**
 * Role gate on every private-framework write.
 *
 * `ProfileRoleError`, reused rather than a new class: its message already says
 * a write "lands permanently in a creator's record", which is exactly what a
 * retained framework version is. A viewer may READ the list — the same rule
 * every other profile read in this package follows.
 */
function assertMayCurate(role: string, act: string): void {
  if (role === "viewer") throw new ProfileRoleError(act, role);
}

function assertEntitled(entitlement: PrivateFrameworkEntitlement): void {
  if (entitlement !== "included") throw new PrivateFrameworkTierError();
}

/**
 * REQ-G08: a paused workspace's entitlements are FROZEN AND READ-ONLY.
 *
 * ADDED 2026-09-01 AFTER THE BILLING GATE MEASURED ITS ABSENCE. Against a live
 * database with an open `pause_periods` row: a brain-document write was refused
 * with `WorkspacePausedError`, and creating, editing, approving and retiring a
 * PRIVATE FRAMEWORK were all allowed. Private frameworks are a Pro-and-Studio
 * entitlement (REQ-D05, PRD §4G) — `assertEntitled` two lines up is the proof
 * that this repo already treats them as one — so a paused workspace using them
 * is using an entitlement it has suspended.
 *
 * THE CRITERION IS THIS REPO'S OWN, NOT A NEW ONE. `writeBrainDoc` states it:
 * "a brain write is an ENTITLEMENT, so it is refused while the workspace is
 * paused", and A-7's two exemptions are (1) storing input the creator
 * submitted, because refusing it silently discards their work, and (2) the
 * settlement tail — recording spend already incurred. The rationale offered
 * for leaving frameworks out ("curating a framework spends nothing") is not
 * that criterion: a brain-doc write spends nothing either. Neither exemption
 * covers a framework, so the gate applies.
 *
 * READS ARE NOT GATED, deliberately, and that is what "read-only" means:
 * `listPrivateFrameworks`, `eligibleFrameworks` and `sharedFrameworkLibrary`
 * all still answer under a pause. A creator who pauses can see everything they
 * wrote; they cannot write more.
 *
 * INSIDE THE TRANSACTION AND BEFORE THE ADVISORY LOCK, the order
 * `writeBrainDoc` uses: the refusal is a read with nothing to order against,
 * and taking a per-profile lock before deciding whether the write may happen
 * at all would serialise refusals behind unrelated writes.
 */
async function assertNotPaused(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<void> {
  if (await hasOpenPause(tx, workspaceId)) throw new WorkspacePausedError();
}

/** Bounds on one framework, refused by name rather than as a database error. */
function assertFrameworkBounds(content: FrameworkContent): void {
  const points = (s: string) => [...s].length;
  if (points(content.name) > FRAMEWORK_NAME_MAX) {
    throw new FrameworkLimitError(
      `the name is ${points(content.name)} characters and the limit is ${FRAMEWORK_NAME_MAX}`
    );
  }
  if (content.name.trim().length === 0) {
    throw new FrameworkLimitError("the name is blank");
  }
  for (const [field, value] of contentStrings(content)) {
    if (points(value) > FRAMEWORK_TEXT_MAX) {
      throw new FrameworkLimitError(
        `${field} is ${points(value)} characters and the limit is ${FRAMEWORK_TEXT_MAX}`
      );
    }
  }
  for (const [field, list] of [
    ["beats", content.beats],
    ["applicability", content.applicability],
    ["sourceReferences", content.sourceReferences],
    ["evidenceEntries", content.evidenceEntries],
    ["testedCaveats", content.testedCaveats],
  ] as const) {
    if (list.length > FRAMEWORK_LIST_MAX) {
      throw new FrameworkLimitError(
        `${field} holds ${list.length} entries and the limit is ${FRAMEWORK_LIST_MAX}`
      );
    }
  }
}

/**
 * Parse, bound and scan caller content — in that order, ONCE, into a local.
 *
 * READ ONCE, for the C-40 TOCTOU reason `writeBrainDoc` records: the parameter
 * is a plain object type, so a getter could hand one value to the scan and
 * another to the insert. `parse` returns a NEW object built from the input, so
 * everything after this line is reading the parsed copy and no getter survives
 * into the row.
 */
function prepareContent(raw: unknown): FrameworkContent {
  // A ZodError MUST NOT ESCAPE. `strictObject` REFUSES an unknown key rather
  // than stripping it — which is the stronger property, and is what makes a
  // smuggled `visibility: "shared"` or `curatorStatus: "approved"` impossible
  // rather than merely stripped — but a raw ZodError reaching `app/**` renders
  // as "Something went wrong", which is the outcome every typed refusal in
  // this package exists to prevent. Translated here, at the one boundary, the
  // same way `parseBrainContent` translates its own.
  let parsed: FrameworkContent;
  try {
    parsed = frameworkContentSchema.parse(raw);
  } catch (error) {
    const issue = (error as { issues?: { path?: unknown[]; code?: string }[] })
      .issues?.[0];
    const field =
      issue?.path && issue.path.length > 0 ? issue.path.join(".") : "the framework";
    throw new FrameworkContentError(
      field,
      issue?.code === "unrecognized_keys"
        ? "carries fields a framework does not have. A framework's visibility, owner, curation status, version and confidence are decided by the server, never submitted"
        : "does not match the shape a framework has"
    );
  }
  assertFrameworkBounds(parsed);
  assertMechanismLevel(parsed);
  return parsed;
}

/** The row columns a parsed content object contributes. Never a spread. */
function contentColumns(content: FrameworkContent) {
  return {
    name: content.name,
    beats: content.beats,
    whyItConverts: content.whyItConverts,
    applicability: content.applicability,
    sourceReferences: content.sourceReferences,
    evidenceEntries: content.evidenceEntries,
    testedCaveats: content.testedCaveats,
    saturation: content.saturation,
    // SERVER-DERIVED, never caller-supplied — see `deriveFrameworkConfidence`
    // and the CHECK that holds the same ladder.
    confidence: deriveFrameworkConfidence(content.evidenceEntries),
  };
}

/** The advisory key both private writes take, so versioning cannot race. */
const frameworkLockKey = (workspaceId: string, profileId: string) =>
  `frameworks:${workspaceId}:${profileId}`;

/**
 * The profile's LIVE private frameworks, newest first.
 *
 * Superseded and retired versions are deliberately absent: the creator's
 * history of a framework reaches them through the REQ-A04 export, which
 * carries every version of every private row (`exportPage`'s `frameworks`
 * branch is unfiltered by status, on purpose — an export that hid superseded
 * versions would return less than the creator's own record).
 */
export async function listPrivateFrameworks(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<EligibleFramework[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return (await profileScope.accessors.privateFrameworks()).map(
    withSaturationNotice
  );
}

/**
 * Every framework this profile may generate from (R5b + R5c, stage B's reader).
 *
 * ONE QUERY, not two reads merged in JavaScript: the shared half and the
 * private half share the `recommendable()` predicate exactly, so a change to
 * what "recommendable" means cannot apply to one half and not the other. The
 * private half carries BOTH scope columns, like every accessor in the cage.
 */
export async function eligibleFrameworks(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string
): Promise<EligibleFramework[]> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  return (await profileScope.accessors.eligibleFrameworks()).map(
    withSaturationNotice
  );
}

export type CreatePrivateFrameworkParams = {
  content: unknown;
  entitlement: PrivateFrameworkEntitlement;
};

/**
 * Create version 1 of a private framework (R5c).
 *
 * `visibility`, both owner ids, `curator_status` and `version` are written
 * HERE, field by field, from the scope — never spread from the caller's
 * object, so a smuggled `visibility: "shared"` cannot become library content.
 * `curator_status` is hard-coded `proposed`: a creator's own framework is
 * usable by that creator (the reader below returns it) but it is not curated
 * library content, and nothing in this file can approve anything.
 *
 * WAIT — `proposed` AND THE READER RETURNS IT? No. `recommendable()` requires
 * `approved`, so a private framework created here is NOT yet eligible for
 * generation. That is deliberate and it is the honest reading of REQ-D02
 * ("a named curator approves any framework before it becomes recommendable"),
 * which draws no exception for private ones. `approvePrivateFramework` is the
 * creator's own approval of their own row — the curator of a private
 * framework is its owner, recorded in `curated_by` as the profile id, which is
 * a different act from an operator approving library content.
 */
export async function createPrivateFramework(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  params: CreatePrivateFrameworkParams
): Promise<Framework> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  assertMayCurate(profileScope.role, "create a framework for this creator");
  assertEntitled(params.entitlement);
  const content = prepareContent(params.content);
  const slug = frameworkSlug(content.name);
  const ids = {
    ownerProfileId: profileScope.profileId as string,
    workspaceId: profileScope.workspaceId as string,
  };
  return db.transaction(async (tx) => {
    // REQ-G08 (billing gate, 2026-09-01): a paused workspace may READ its
    // frameworks and may not write one. See `assertNotPaused`.
    await assertNotPaused(tx, profileScope.workspaceId);
    // THE SAME KEY BOTH PRIVATE WRITES TAKE. `frameworks_private_live_uq`
    // already refuses two live versions of one slug, but the COUNT below is a
    // read-then-write with no index behind it — two concurrent creates would
    // both read `PRIVATE_FRAMEWORK_COUNT_MAX - 1` and both insert. The lock is
    // what makes the ceiling exact rather than approximate, exactly as
    // `appendOnboardingInput`'s does for `POST_COUNT_MAX`.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${frameworkLockKey(ids.workspaceId, ids.ownerProfileId)}, 0))`
    );
    const [{ live }] = await tx
      .select({ live: sql<number>`count(*)::int` })
      .from(frameworks)
      .where(
        and(
          eq(frameworks.ownerProfileId, ids.ownerProfileId),
          eq(frameworks.workspaceId, ids.workspaceId),
          eq(frameworks.visibility, "private"),
          isNull(frameworks.supersededAt),
          isNull(frameworks.retiredAt)
        )
      );
    if (live >= PRIVATE_FRAMEWORK_COUNT_MAX) {
      throw new FrameworkLimitError(
        `this creator profile already holds ${live} frameworks and the limit is ${PRIVATE_FRAMEWORK_COUNT_MAX}`
      );
    }
    const [row] = await tx
      .insert(frameworks)
      .values({
        ...contentColumns(content),
        slug,
        version: 1,
        visibility: "private",
        curatorStatus: "proposed",
        ...ids,
      })
      .returning();
    return row;
  });
}

export type EditPrivateFrameworkParams = {
  /** The version this edit was composed against — the LIVE one, or it is stale. */
  baseFrameworkId: string;
  content: unknown;
  entitlement: PrivateFrameworkEntitlement;
};

/**
 * Write the next version of a private framework (R5c).
 *
 * A NEW ROW, and the previous one is stamped `superseded_at` in the SAME
 * transaction — `brain_docs`' versioning shape, forced here by
 * `generations.framework_versions`' own promise that "a framework edited later
 * does not rewrite this generation's explanation". In-place editing would make
 * that sentence false the first time anybody edited anything.
 *
 * THE BASE ID IS CHECKED AGAINST THE LIVE VERSION, not merely against
 * ownership: an edit composed against version 2 while version 3 already exists
 * would otherwise silently discard version 3's changes (a lost update — the
 * class `saveInterviewDraft`'s lock comment names). `FrameworkStaleError` says
 * so and tells the reader to reload; nothing is lost either way, because every
 * version is retained.
 *
 * `slug` AND `curator_status` ARE CARRIED FROM THE BASE, never re-derived and
 * never taken from the caller: re-deriving the slug from a renamed framework
 * would change its identity and orphan the `{id, version}` pairs already
 * recorded, and a caller-settable curator status is a creator approving their
 * own row by editing it.
 */
export async function editPrivateFramework(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  params: EditPrivateFrameworkParams
): Promise<Framework> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  assertMayCurate(profileScope.role, "edit a framework for this creator");
  assertEntitled(params.entitlement);
  const baseFrameworkId = params.baseFrameworkId;
  const content = prepareContent(params.content);
  const ids = {
    ownerProfileId: profileScope.profileId as string,
    workspaceId: profileScope.workspaceId as string,
  };
  return db.transaction(async (tx) => {
    // REQ-G08 (billing gate, 2026-09-01): a paused workspace may READ its
    // frameworks and may not write one. See `assertNotPaused`.
    await assertNotPaused(tx, profileScope.workspaceId);
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${frameworkLockKey(ids.workspaceId, ids.ownerProfileId)}, 0))`
    );
    const base = await readOwnPrivateFramework(tx, ids, baseFrameworkId);
    if (base.supersededAt !== null) throw new FrameworkStaleError();
    if (base.retiredAt !== null) throw new FrameworkStaleError();
    if (base.version >= FRAMEWORK_VERSION_MAX) {
      throw new FrameworkLimitError(
        `this framework already has ${base.version} retained versions and the limit is ${FRAMEWORK_VERSION_MAX}`
      );
    }
    // SUPERSEDE FIRST, INSERT SECOND. `frameworks_private_live_uq` forbids two
    // live versions of one slug, so the other order deadlocks against its own
    // constraint rather than racing — and both statements are in one
    // transaction, so a crash between them leaves the old version live.
    await tx
      .update(frameworks)
      .set({ supersededAt: sql`clock_timestamp()` })
      .where(
        and(
          eq(frameworks.id, base.id),
          eq(frameworks.ownerProfileId, ids.ownerProfileId),
          eq(frameworks.workspaceId, ids.workspaceId)
        )
      );
    const [row] = await tx
      .insert(frameworks)
      .values({
        ...contentColumns(content),
        slug: base.slug,
        version: base.version + 1,
        visibility: "private",
        curatorStatus: base.curatorStatus,
        curatedBy: base.curatedBy,
        ...ids,
      })
      .returning();
    return row;
  });
}

/**
 * A creator approving their OWN private framework (R5c / REQ-D02).
 *
 * SEPARATE FROM CREATING IT, deliberately. REQ-D02 draws no exception for
 * private frameworks — nothing becomes recommendable without an approval — and
 * folding the approval into the create would make "approved" mean nothing more
 * than "written". `curated_by` records the profile id, so a private approval
 * and an operator's library approval are distinguishable in the row rather
 * than only in a story about it.
 *
 * IT IS AN UPDATE OF THE LIVE ROW, not a new version: approving does not
 * change a word of the mechanism, and minting a version for it would put an
 * identical document in the history under a new number.
 */
export async function approvePrivateFramework(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  frameworkId: string,
  entitlement: PrivateFrameworkEntitlement
): Promise<Framework> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  assertMayCurate(profileScope.role, "approve a framework for this creator");
  assertEntitled(entitlement);
  const ids = {
    ownerProfileId: profileScope.profileId as string,
    workspaceId: profileScope.workspaceId as string,
  };
  return db.transaction(async (tx) => {
    // REQ-G08 (billing gate, 2026-09-01): a paused workspace may READ its
    // frameworks and may not write one. See `assertNotPaused`.
    await assertNotPaused(tx, profileScope.workspaceId);
    // THE SAME KEY THE OTHER TWO WRITES TAKE. Without it, this read-then-write
    // can approve a version that `editPrivateFramework` superseded in the
    // window between them. Harmless today — a superseded row is not
    // recommendable whatever its status — but a lock-less read-then-write on a
    // governed column is the shape `saveInterviewDraft`'s own comment names,
    // and it is three lines to close rather than a paragraph to justify.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${frameworkLockKey(ids.workspaceId, ids.ownerProfileId)}, 0))`
    );
    const row = await readOwnPrivateFramework(tx, ids, frameworkId);
    if (row.supersededAt !== null || row.retiredAt !== null) {
      throw new FrameworkStaleError();
    }
    const [updated] = await tx
      .update(frameworks)
      .set({
        curatorStatus: "approved",
        curatedBy: `profile:${ids.ownerProfileId}`,
      })
      .where(
        and(
          eq(frameworks.id, row.id),
          eq(frameworks.ownerProfileId, ids.ownerProfileId),
          eq(frameworks.workspaceId, ids.workspaceId)
        )
      )
      .returning();
    return updated;
  });
}

/**
 * Retire a private framework (R5c / REQ-D02).
 *
 * BOTH SPELLINGS AT ONCE, because `frameworks_retired_stamp` is an EQUALITY
 * and refuses either half alone — which is the point of writing it as an
 * equality: a retirement that set only the stamp would leave `saturation`
 * claiming the mechanism is still `established`, and one that set only the
 * enum would leave R5b's `retired_at IS NULL` reader still recommending it.
 *
 * AN UPDATE, NOT A NEW VERSION: retirement is a statement about the framework,
 * not a revision of the mechanism. A retired framework's text is unchanged and
 * every version of it is still exported.
 */
export async function retirePrivateFramework(
  db: DbLike,
  scope: WorkspaceScope,
  profileId: string,
  frameworkId: string,
  entitlement: PrivateFrameworkEntitlement
): Promise<Framework> {
  const profileScope = await ProfileScope.mint(db, scope, profileId);
  assertMayCurate(profileScope.role, "retire a framework for this creator");
  assertEntitled(entitlement);
  const ids = {
    ownerProfileId: profileScope.profileId as string,
    workspaceId: profileScope.workspaceId as string,
  };
  return db.transaction(async (tx) => {
    // REQ-G08 (billing gate, 2026-09-01): a paused workspace may READ its
    // frameworks and may not write one. See `assertNotPaused`.
    await assertNotPaused(tx, profileScope.workspaceId);
    // Same key, same reason as `approvePrivateFramework` one function up.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${frameworkLockKey(ids.workspaceId, ids.ownerProfileId)}, 0))`
    );
    const row = await readOwnPrivateFramework(tx, ids, frameworkId);
    // ALREADY RETIRED IS NOT AN ERROR — retiring twice is the same fact, and
    // the row is returned unchanged rather than raising at a creator who
    // pressed the button twice.
    if (row.retiredAt !== null) return row;
    const [updated] = await tx
      .update(frameworks)
      .set({ retiredAt: sql`clock_timestamp()`, saturation: "retired" })
      .where(
        and(
          eq(frameworks.id, row.id),
          eq(frameworks.ownerProfileId, ids.ownerProfileId),
          eq(frameworks.workspaceId, ids.workspaceId)
        )
      )
      .returning();
    return updated;
  });
}

/**
 * One private framework of THIS profile, or a byte-identical refusal.
 *
 * THE PREDICATE CARRIES ALL THREE FACTS — the id, both scope columns, and
 * `visibility = 'private'`. The last one is not redundant: without it a
 * caller could name a SHARED library row's id and this function would return
 * it (both owner columns are NULL there, so an `eq` against them yields NULL,
 * not true — but a future refactor to `isNull` would), and every mutation
 * below would then be editing library content through a profile-scoped path.
 * Stating it is cheaper than reasoning about it.
 */
async function readOwnPrivateFramework(
  tx: TxLike,
  ids: { ownerProfileId: string; workspaceId: string },
  frameworkId: string
): Promise<Framework> {
  if (!UUID_RE.test(frameworkId)) throw new FrameworkAccessError();
  const [row] = await tx
    .select()
    .from(frameworks)
    .where(
      and(
        eq(frameworks.id, frameworkId),
        eq(frameworks.ownerProfileId, ids.ownerProfileId),
        eq(frameworks.workspaceId, ids.workspaceId),
        eq(frameworks.visibility, "private")
      )
    )
    .limit(1);
  if (!row) throw new FrameworkAccessError();
  return row;
}

/** Postgres would raise 22P02 on a non-uuid, which is an enumeration oracle. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ------------------------------------------------------------------ the seed

/**
 * F1-F9, THE SHARED LIBRARY (R5a).
 *
 * WHERE THIS CONTENT COMES FROM, and what was removed on the way. The nine
 * mechanisms were extracted from the founder's own hand-run autopsy corpus —
 * the same corpus PRD line 20 cites as the n=1 proof. What that corpus records
 * and what is stored here differ in exactly the way REQ-D04 requires: the
 * corpus names accounts, quotes one creator's numbers, and describes what fits
 * one specific person. NONE of that is here. Every entry below is the MOVE,
 * described so that anyone could run it, and `assertMechanismLevel` runs over
 * this array in `seedSharedFrameworks` — the seed is not exempt from the scan,
 * which is what makes the scan's coverage of the library a fact rather than an
 * intention.
 *
 * `curator_status` IS `approved` HERE, which is the one place in this file a
 * framework becomes recommendable. That is REQ-D02's "named curator", and the
 * name is recorded in `curated_by`: running `db:seed` is a person taking
 * responsibility for nine documents. No code path approves a shared framework.
 *
 * THE SCAN CAUGHT THIS ARRAY ON ITS FIRST RUN, and the four sentences it
 * refused are worth naming because they are the near-miss class: none of them
 * carried a number, a handle or a link — they carried the phrase "converts at",
 * which is a PERFORMANCE FRAME imported from the corpus ("converts at
 * baseline", "converted at the creator's floor"). They read as mechanism
 * description and are not: they state how content DID, which is the half of
 * REQ-D04 that is easiest to keep by accident. They are rewritten to say what
 * the mechanism does rather than what the numbers did; the rule that caught
 * them is `metric_phrase`, and this paragraph is here so nobody later widens
 * that rule's exception rather than the sentence.
 *
 * AND THE SCAN DID NOT CATCH THE NEXT TWO, BECAUSE NOTHING RAN THE HONESTY
 * CANON OVER THIS ARRAY (learning-honesty gate, 2026-09-01). Two sentences
 * survived that pass and shipped: "Every series pilot in the corpus
 * OUTPERFORMED the same creator's standalone pieces on follows" and "off far
 * LARGER REACH and to far fewer follows". Both match `PERFORMANCE_CLAIMS`
 * entries that are `enforcement: "hard"` in `packages/modes/src/claims.ts` —
 * a model emitting either gets the draft refused and the creator debited —
 * and both rendered verbatim to every creator through `sharedFrameworkLibrary`
 * on `/studio/frameworks`. Three more were comparatives and superlatives over
 * a corpus with no n, no denominator and no period ("both converted above the
 * creator's own baseline", "the widest-reaching piece in the corpus", "the
 * strongest converting piece in the corpus, by a wide margin over the next
 * best"): they cleared every vocabulary pattern and still stated a ranking the
 * reader cannot check. All five are rewritten to state the MECHANISM and,
 * where a count is what makes the observation honest, the population size.
 *
 * THE FIX THAT MATTERS IS NOT THE FIVE SENTENCES. It is that this array is now
 * SCANNED: `PERFORMANCE_CLAIM_RULES` runs on it at write time like every other
 * rule, and `tests/framework-content-honesty.test.ts` additionally holds it to
 * the full `FORBIDDEN_CLAIMS ∪ PERFORMANCE_CLAIMS` canon with a planted
 * violation per shape. The canon's third text source had no scan at all; the
 * five sentences were the instance.
 *
 * AND THE ROUND AFTER THAT FOUND FIVE MORE, WHICH IS THE POINT (learning
 * gate, 2026-09-02). The pass above fixed the five sentences it was handed and
 * left their siblings: `"which is the strongest follow mechanism in the
 * corpus"`, `"Tutorial-shaped pieces led the corpus on saves and trailed it on
 * follows"`, `"reach and follows come apart here more sharply than anywhere
 * else in the corpus"`, `"well over the usual length"`, `"saved heavily"` —
 * every one canon-silent, and `whyItConverts` is injected into EVERY
 * generation's prompt (`generate.ts`), not merely rendered. THIRTEEN strings
 * were rewritten this time, found by sweeping the whole array for the CLASS
 * rather than by re-reading the five that were named: a ranking, a
 * superlative, or a magnitude ("heavily", "instant depth", "strong trigger")
 * with no n, no denominator and no period. Where the count is known it is
 * stated; where it is not — the tutorial batch — the sentence says so instead
 * of implying one.
 *
 * THE CLASS NOW HAS A CONTROL FOR THIS ARRAY, not just a fixed instance:
 * `tests/framework-content-honesty.test.ts` scans the seed for ranking
 * markers and requires the population beside them. Its limit is the limit of
 * every vocabulary — a ranking phrased in words nobody listed still passes —
 * and that limit is stated in `MECHANISM_CONTENT_RULES`' residue rather than
 * papered over.
 *
 * `corpus-batch-0` AND `corpus-batch-1` NAME A POPULATION NOBODY CAN OPEN, and
 * that is a stated residual rather than a fixed one. Every count above is a
 * numerator over those two refs, and no artefact in this repo carries them:
 * they are ids into an internal autopsy record that the trend monitor
 * (slice 8, REQ-E02) is what will make openable. Nothing here is checkable by
 * a reader today. **Owner: whoever lands slice 8's ingest. Revisit trigger:
 * the first `trend_item` ref reaching this table — at which point every seeded
 * `internal_autopsy` ref either resolves to a stored record or the counts come
 * out of the sentences.**
 *
 * `saturation` IS `observed` FOR ALL NINE, and that is the honest rung rather
 * than a default nobody chose. Saturation is a claim about how worn a shape is
 * in the market RIGHT NOW; the trend monitor that could measure it is slice 8,
 * and nothing here has measured it. `observed` says "we have seen this work",
 * which is what the corpus supports and no more. The one framework whose
 * opening phrasing recurs unchanged across the batch gets `saturated` — F3.
 */
export const SHARED_FRAMEWORK_SEED: readonly FrameworkContent[] = [
  {
    name: "The Confession Arc",
    beats: [
      "Open by confessing a present-tense problem you are implicated in, not one you have solved.",
      "Prove the surface success is real before subverting it — the turn only has weight if the thing being undercut is credible.",
      "Mark the turn hard: reveal the constraint or the hidden truth in one visual stop.",
      "State the transferable realisation in a single sentence.",
      "End self-aware and unresolved — name your own flaw, and do not resolve it inside the piece.",
    ],
    whyItConverts:
      "Confessing a mistake from a position of visible success reads as intrigue plus trust at once. The unresolved thread is the mechanism: a viewer follows to find out how the person resolves it, and a version that resolves inside the piece removes the reason to.",
    applicability: [
      {
        goal: "follows",
        niche: "any",
        note: "Needs a real constraint the creator is currently inside, not a difficulty they have already handled.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "Two pieces in the corpus open on an admitted problem sitting behind visible traction, and in both the problem is still open when the piece ends — the piece gives a viewer no way to see it closed except by following the person who has it.",
      },
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-1",
        observation:
          "One same-shape piece in the corpus resolved the tension inside the video and drew discussion rather than follows — the withheld resolution is what does the work.",
      },
    ],
    testedCaveats: [
      "Resolving the confession inside the piece converts it into a comment driver rather than a follow driver.",
    ],
    saturation: "observed",
  },
  {
    name: "The Mirror",
    beats: [
      "Open on a paradox the viewer will recognise in themselves.",
      "Read the viewer their own symptoms in hyper-specific, checkable detail.",
      "Turn the accusation onto yourself, on screen, with your own receipts.",
      "State the shared condition as a thesis about both of you.",
      "End mid-thought or on a hard cut so the piece loops.",
    ],
    whyItConverts:
      "Being read back to yourself is what a viewer forwards — the share is them saying \"this is me\" to somebody else. The self-implication is what converts a lecture into kinship; skip the receipts and the same words are an accusation.",
    applicability: [
      {
        goal: "reach",
        niche: "any",
        note: "A reach shape first. Where the goal is follows, the self-inventory shape is the safer choice.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "One piece in the corpus runs this shape with the self-implication half left out. It travels, because the recognition beat works on its own — and it leaves a viewer nothing to attach to the person who made it, so what it recruits is agreement rather than attachment.",
      },
    ],
    testedCaveats: [
      "Without the creator's own receipts on screen this is an accusation. The recognition beat and the attachment beat come apart in this shape: the one piece in the corpus that ran recognition alone recruited agreement rather than attachment, so a version without receipts can travel and leave nobody attached to the person who made it.",
      "Symptom lists need literal proof on screen; described symptoms read as a bit rather than as a confession.",
    ],
    saturation: "observed",
  },
  {
    name: "The Borrowed Concept",
    beats: [
      "Cold-open on a linguistic fact or aphorism from outside your own culture, over black.",
      "Enumerate the concept with matched imagery.",
      "Pivot into first person, or pivot the question onto the viewer.",
      "Apply the concept to your own life — this beat is the follow trigger, and omitting it leaves an encyclopedia entry.",
      "Close on a quiet sincere payoff that reveals what the piece was really about.",
    ],
    whyItConverts:
      "A concept from outside the viewer's own culture is worth keeping in its own right, which is what makes it something a viewer saves. The personal application is the only beat that makes the piece the creator's rather than the source's — without it, what was kept is the concept and not the person.",
    applicability: [
      {
        goal: "saves",
        niche: "any",
        note: "Pairs a save-driving concept with a follow-driving personal turn.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "Two pieces in the corpus run this shape and both were saved; the one without a first-person application drew no follows at all — the concept is what a viewer keeps, and the application is what attaches them to the creator.",
      },
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-1",
        observation:
          "The specific opening phrasing this shape is usually run with recurs unchanged across the corpus batch, which is why this framework carries the saturated mark; the mechanism survives re-wording, the phrasing does not.",
      },
    ],
    testedCaveats: [
      "The common opening phrasing is worn out. Spin the mechanism and write the opening from scratch; reusing the known wording is copying, not spinning.",
      "Without the personal application beat this is a fact repost.",
    ],
    saturation: "saturated",
  },
  {
    name: "The Inversion Essay",
    beats: [
      "Open on a universal callout or a contrarian claim.",
      "Run a light activity spine underneath so the essay has a body to watch.",
      "Prove the ambition was real with a short montage.",
      "Invert the values around two thirds through, in one balanced line.",
      "Resolve in imagery and end on a quiet line, with no call to action.",
    ],
    whyItConverts:
      "The inversion line is the quotable unit, and the emotional floor underneath it is what drives discussion. Ambition and attachment stated in the same piece is the combination that lands.",
    applicability: [
      {
        goal: "shares",
        niche: "any",
        note: "The inversion line has to be sayable in one breath or nothing is quoted.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "Two pieces in the corpus turn on a single inverted line placed late; both were quoted back in their own comments.",
      },
    ],
    testedCaveats: [
      "The inversion has to arrive after the success is proven, or it reads as a rationalisation of failure.",
    ],
    saturation: "observed",
  },
  {
    name: "The Quest Pilot",
    beats: [
      "Open on a testable question or a dare rather than an invitation.",
      "Introduce yourself and the stake in one line — what you lose if this does not work.",
      "State a credibility clause early, as a subordinate clause, never as a boast.",
      "Diagnose provocatively why this attempt matters.",
      "Run a numbered steps spine, keeping the jokes and confessions inside the spine rather than around it.",
      "Reveal the series in the last seconds — a title card, or an invitation to follow along.",
    ],
    whyItConverts:
      "A series makes following the only way to get the payoff: the piece ends before the answer does, and the follow is the only route to the rest. Numbered episodes add sunk cost to watching. Three series pilots in the corpus carry that structure; how it ranks against the other shapes here is not something this library has measured.",
    applicability: [
      {
        goal: "follows",
        niche: "any",
        note: "Only works where the creator will actually make the next episode.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "Three series pilots in the corpus put the reveal of the series in the last seconds, so the moment a viewer decides whether to follow is the moment they find out there is a next episode. The standalone pieces in the same batch carry no such moment for the decision to sit in.",
      },
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "A paired test on identical footage: the question-shaped opening beat the invitation-shaped one. A testable question carries a stake; an invitation does not.",
      },
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-1",
        observation:
          "One personal-identity series in the corpus runs to a sixth episode. The stake a numbered series sets up is what carries a viewer into a longer piece; a standalone piece asks for the same minutes with nothing owed.",
      },
    ],
    testedCaveats: [
      "The paired opening test was a single comparison with a discussion-prompt confounder, so treat the ordering of the two openings as a working prior rather than a settled result.",
      "Longer runtimes survive only inside a numbered series; the same length on a standalone piece does not hold.",
    ],
    saturation: "observed",
  },
  {
    name: "The Evidence Tutorial",
    beats: [
      "Open on the gap: everyone talks about this, nobody shows it.",
      "Give three numbered steps at most, each with one visual anchor on screen.",
      "Carry the hard concept with an analogy rather than a definition.",
      "Show the payoff working, live.",
      "Close with a soft gestured ask — the one shape where an explicit ask is allowed.",
    ],
    whyItConverts:
      "A save is a viewer promising themselves they will come back to it, and demonstrated capability is what makes the aspirational material credible later. It buys authority; it does not buy identity.",
    applicability: [
      {
        goal: "saves",
        niche: "any",
        note: "Keep it a minority of output — tutorials collect saves, identity pieces collect follows.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "The tutorial-shaped pieces in the corpus were saved and not followed: what a viewer keeps is the instruction, and the person giving it is incidental to the keeping. How many of each was not recorded, so this is the direction to expect and not a rate.",
      },
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-1",
        observation:
          "Adding a credibility clause to the opening and a part-two cliffhanger to the close moved one tutorial in the corpus into series behaviour without changing the steps.",
      },
    ],
    testedCaveats: [
      "Over-used, this recruits an audience that wants instructions rather than the creator, which is the opposite of what a follow is for.",
    ],
    saturation: "observed",
  },
  {
    name: "The Silent Loop",
    beats: [
      "No voiceover, no spoken opening, no call to action.",
      "One locked-off shot with a title caption in the first frame.",
      "Let a wordless proof of progress carry the time passing.",
      "Match the last frame to the first so the replay is seamless.",
    ],
    whyItConverts:
      "A seamless loop is watched again before a viewer decides to watch it again, and the look is what they follow. It costs little to make and it is connective tissue between the pieces that carry the identity, not a substitute for them.",
    applicability: [
      {
        goal: "reach",
        niche: "any",
        note: "Short, and used sparingly — it recruits an audience that follows the look rather than the person.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "A single wordless timelapse in the corpus earned replays and aesthetic follows with none of the identity signal the essays carry.",
      },
    ],
    testedCaveats: [
      "It builds an audience with no attachment to the creator; unchecked, that audience does not convert on anything later.",
    ],
    saturation: "observed",
  },
  {
    name: "The Aphorism Montage",
    beats: [
      "Write a repeated stem and run it as anaphora over imagery.",
      "Escalate the list rather than merely extending it.",
      "Close on one reframe or universal turn.",
      "No confession opening, no receipts, no call to action.",
    ],
    whyItConverts:
      "What a viewer keeps here is the line, not the person: the anaphora gives them something quotable and the imagery gives it a mood. Without the creator's own receipts it is the mirror shape with the follow half removed — the recognition arrives with nobody behind it.",
    applicability: [
      {
        goal: "saves",
        niche: "any",
        note: "Only carries a follow when each line holds one of the creator's own specifics.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-1" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-1",
        observation:
          "Two montage pieces drew saves and discussion and almost no follows, against a same-corpus mirror piece that carried receipts and did.",
      },
    ],
    testedCaveats: [
      "Left unchecked it recruits an audience that likes the mood and does not care about the person.",
    ],
    saturation: "observed",
  },
  {
    name: "The Self-Inventory",
    beats: [
      "State a feeling as a fact, in under ten words, with no second person anywhere in it.",
      "Enumerate the wants fast and overlapping.",
      "Admit the strategy that produced the mess.",
      "Inventory your own symptoms forensically — checkable, slightly embarrassing specifics, never vague ones.",
      "Deliver the cost line slowly: what the mess costs you, daily.",
      "Quote the received advice only in order to price it.",
      "Close on a self-accusation phrased as an open question, aimed inward, unanswered.",
    ],
    whyItConverts:
      "The viewer recognises themselves in the inventory without ever being addressed. Recognising yourself in someone's confession creates an obligation to them; being told about yourself does not. That difference in direction is the whole mechanism.",
    applicability: [
      {
        goal: "follows",
        niche: "any",
        note: "Requires real receipts the creator is willing to show as flaws.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy", ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "One piece in the corpus runs the full inventory — the feeling stated as a fact, the symptoms itemised with receipts, the cost line delivered slowly — and it is the only one in the batch that never addresses the viewer at all. What it asks of a viewer is recognition, which the viewer supplies themselves.",
      },
      {
        kind: "internal_autopsy",
        ref: "corpus-batch-0",
        observation:
          "A direct contrast in the same corpus: the same closing question, aimed outward at the viewer rather than inward at the creator. Aimed outward it is an accusation a viewer can agree with and walk away from; aimed inward it is an admission that leaves an obligation. Same device, opposite direction.",
      },
    ],
    testedCaveats: [
      "Specifics must be checkable and slightly embarrassing. Vague inventory reads as a bit; precise inventory reads as a confession.",
      "Any achievement must appear inside the symptom list as a problem, or the piece reads as a boast wearing a confession.",
      "No advice at all. The moment it tells the viewer what to do it collapses into the shapes that behave like ordinary output.",
      "Without an inventory that costs the creator something this is the montage shape with a question mark on the end.",
    ],
    saturation: "observed",
  },
];

/**
 * Seed (or top up) the approved shared library — IDEMPOTENT (R5a).
 *
 * IT NEVER OVERWRITES. A shared framework already present at the same slug and
 * version is left exactly as it is, because the library is curated: an
 * operator may have approved, retired or edited a row since the seed ran, and
 * a seed that reasserted this file's opinion over that would silently undo a
 * curation decision. `onConflictDoNothing` against
 * `frameworks_shared_slug_version_uq` is what makes re-running `db:seed` safe.
 *
 * THE SCAN RUNS OVER THE SEED, deliberately: this array is checked-in text and
 * could be edited by anybody, and a library the scan does not cover is the one
 * place REQ-D04 most needs it.
 */
export async function seedSharedFrameworks(db: DbLike | TxLike): Promise<void> {
  for (const content of SHARED_FRAMEWORK_SEED) {
    const parsed = frameworkContentSchema.parse(content);
    assertFrameworkBounds(parsed);
    assertMechanismLevel(parsed);
    await db
      .insert(frameworks)
      .values({
        ...contentColumns(parsed),
        slug: frameworkSlug(parsed.name),
        version: 1,
        visibility: "shared",
        // The two owner columns are LEFT UNSET rather than written as null:
        // `frameworks_shared_has_no_owner` refuses a shared row with either
        // one, so this is the constraint's shape rather than a convention.
        curatorStatus: "approved",
        curatedBy: "seed:respin-library-v1",
      })
      .onConflictDoNothing();
  }
}

/**
 * The bounds this module enforces, re-exported so a caller does not have to
 * know which file holds them — the same reason `onboarding-ops.ts` re-exports
 * `POST_CONTENT_MAX` and `POST_COUNT_MAX` beside the refusals that apply them.
 */
export {
  FRAMEWORK_LIST_MAX,
  FRAMEWORK_NAME_MAX,
  FRAMEWORK_TEXT_MAX,
  FRAMEWORK_VERSION_MAX,
  PRIVATE_FRAMEWORK_COUNT_MAX,
} from "./storage-limits";

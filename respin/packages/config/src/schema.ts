// RespinConfigV1 — the runtime-config contract (D-M1-2, B5). This Zod schema
// must parse EXACTLY the Phase-1 seed (parity test drives from CONFIG_V1_SEED).
// strict(): an unknown key is a drifted document, not a silent passenger.
import { z } from "zod";
// THE ONE COPY of the worker's per-stage deadline ceiling (audit P3-A3): the
// schema refuses a deadline the autopsy worker would refuse to start under.
import { AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS } from "@respin/db";

/**
 * THE COMPILED CEILING ON AUTO-TOP-UP ATTEMPTS PER WORKSPACE PER UTC MONTH
 * (audit P3-R7, R-158 point 6). The monthly cap in cents already bounds the
 * count while every pack has a positive price; this is the backstop that does
 * not depend on that — the attempt ordinal is part of the provider idempotency
 * key, and an unbounded ordinal is an unbounded number of off-session charges
 * if the cents bound ever reads zero. CHOSEN, not measured: far above any real
 * month at today's pack price. `pack.autoTopupMaxAttemptsPerMonth` may only
 * lower it.
 */
export const AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING = 100;

export const respinConfigV1 = z
  .object({
    creditCosts: z
      .object({
        hookSet: z.number().int().min(0),
        caption: z.number().int().min(0),
        ideationBatch: z.number().int().min(0),
        fullScript: z.number().int().min(0),
        autopsy: z.number().int().min(0),
        spin: z.number().int().min(0),
        revision: z.number().int().min(0),
        onboardingBrainBuild: z.number().int().min(0),
        trendBrowse: z.number().int().min(0),
        // THE FIRST CREDIT DEBIT THE PRODUCT EVER TAKES (D-M2-2 / R-30, slice
        // 2a). The first onboarding brain build per profile is included at 0
        // credits; every subsequent REBUILD is priced and debited.
        //
        // 50, and the value is an OWNER decision (`decisions.md` R-37), not an
        // engineering default. The decision queue marked this row "none is
        // safe — the step stops" for two reasons that are both about the
        // ledger being append-only: a wrong price is history that cannot be
        // edited, and the round-1 draft's 5 — anchored to `fullScript`
        // — was unpayable by exactly the Free creator most likely to need
        // a rebuild.
        //
        // `.default(50)` rather than required, for the A-9 reason
        // `profileCaps` carries: this object is `.strict()`, so a STORED
        // document written before this key existed must still parse or
        // `getActiveConfig` throws inside the Stripe webhook's transaction.
        // The default is what makes the deploy-then-`config:migrate` order
        // safe. It is NOT what prices a debit — see R19,
        // `getActiveConfigRequiringStored` (index.ts) and the price paths
        // `requiredConfigPaths` (@respin/credits) names for each purpose: a
        // debit is refused outright while the key is only defaulted, because a
        // defaulted price is not a priced debit. (The name this sentence used
        // to give that pair, `assertStoredConfigKeys`, is a symbol that has
        // never existed in this repo — corrected 2026-09-01 in the same action
        // that grepped for it.)
        onboardingBrainRebuild: z.number().int().min(0).default(50),
      })
      .strict(),
    allowances: z
      .object({
        // Free MAY be 0 (no monthly mint is a real operator choice). The three
        // PAID tiers may not (audit P3-A3, register item 42): `grantCredits`
        // refuses a zero amount, so a stored 0 turned every paid invoice into
        // a webhook 500 that Stripe redelivers forever.
        free: z.number().int().min(0),
        creator: z.number().int().min(1),
        pro: z.number().int().min(1),
        studio: z.number().int().min(1),
      })
      .strict(),
    pack: z
      .object({
        credits: z.number().int().positive(),
        priceUsd: z.number().positive(),
        validityMonths: z.number().int().positive(),
        /**
         * The most auto-top-up attempts one workspace may make in one UTC
         * month (audit P3-R7, R-158 point 6). Config may only TIGHTEN it:
         * the schema refuses a value over the compiled
         * `AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING`, and `maybeAutoTopup` reads
         * `min(this, that ceiling)` — the R-123 shape. Defaulted, so a
         * stored document without the key parses to the ceiling.
         */
        autoTopupMaxAttemptsPerMonth: z
          .number()
          .int()
          .min(1)
          .max(AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING)
          .default(AUTO_TOPUP_ATTEMPTS_PER_MONTH_CEILING),
      })
      .strict(),
    graceDays: z.number().int().positive(),
    // `.refine(min <= max)`: an INVERTED pair passed every other check and made
    // `Array.from({length: max - min + 1})` produce `[]`, so the pause <select>
    // rendered with zero options and a `defaultValue` no option carried — a
    // control that cannot be used and does not say why (round-2 NOTE 5). It
    // fails closed at the action either way, and it is admin-only, but a range
    // whose ends are the wrong way round is a drifted document, which is
    // exactly what this schema exists to refuse.
    pauseMonths: z
      .object({ min: z.number().int().positive(), max: z.number().int().positive() })
      .strict()
      .refine((r) => r.min <= r.max, {
        message: "pauseMonths.min must be less than or equal to pauseMonths.max",
      }),
    // The service-period band (in days) that counts as "a monthly cycle" on a
    // grant-bearing invoice. REQ-G02's rollover arithmetic (expiry = service
    // period end + 1 month) only holds for monthly prices, and a webhook
    // payload does not carry the price's `recurring.interval` — the line item's
    // only route to it is a bare price id — so the service period is the
    // measurable proxy. It lives HERE rather than as a pair of constants in
    // packages/credits because it is a threshold that decides whether a PAID
    // invoice grants or throws (B5: thresholds live in versioned config;
    // billing round-7 CHANGE 3). A calendar month is 28–31 days; the launch
    // band is deliberately wider so an ordinary shifted cycle never refuses a
    // paying customer's allowance, and it is widenable without a deploy when a
    // real payload proves the band wrong.
    monthlyPeriodDays: z
      .object({ min: z.number().int().positive(), max: z.number().int().positive() })
      .strict()
      .refine((r) => r.min <= r.max, {
        message:
          "monthlyPeriodDays.min must be less than or equal to monthlyPeriodDays.max",
      }),
    // Stripe price id → tier. Populated per environment from the setup script
    // output via the admin config editor (Phase 3/4); empty at seed.
    stripePriceMap: z.record(
      z.string(),
      z.enum(["creator", "pro", "studio", "pack"])
    ),
    // How many creator profiles a tier may hold (PRD §4G pricing table, "Creator profiles" row). M2a lands the
    // KEY; M2b's createProfile is what reads it — deferred there because
    // enforcing a per-tier cap needs the TIER, whose sole authority is
    // `credits/src/state.ts`, and packages/db cannot import it without
    // creating a second tier authority (plan A-11).
    //
    // `.default(...)` rather than required, and the whole A-9 deploy order
    // rests on it: `.strict()` means a STORED document carrying a key that
    // older code does not know is a PARSE FAILURE, and `getActiveConfig` is
    // called five times inside the Stripe webhook's single transaction
    // (`webhooks.ts:588,786,1082,1197,1283`). A throw there rolls back
    // `stripe_events`, so Stripe retries forever and grants stop landing. A
    // default makes the key optional in storage, so DEPLOY CODE FIRST, then
    // run `migrate-config` — and a rollback in between is safe.
    profileCaps: z
      .object({
        free: z.number().int().min(0),
        creator: z.number().int().min(0),
        pro: z.number().int().min(0),
        studio: z.number().int().min(0),
      })
      .strict()
      .default({ free: 1, creator: 1, pro: 1, studio: 5 }),
    // How many niches a tier may TRACK (PRD §4G pricing table, "Trend monitor"
    // row; REQ-E05 — Free: digest only, so 0). Slice 8 fix pass, R-95: this
    // was `TIER_TRACKED_NICHES` in `packages/credits/src/mode-access.ts`, a
    // numeric per-tier allowance in code, which R-37's rule and that file's
    // own header both say belongs here beside `profileCaps` (billing gate
    // CHANGE 3, 2026-09-03). Same shape, same numbers, same A-9 reason for the
    // `.default(...)`: a stored document written before this key existed
    // must still parse, so DEPLOY CODE FIRST, then `migrate-config`.
    trackedNiches: z
      .object({
        free: z.number().int().min(0),
        creator: z.number().int().min(0),
        pro: z.number().int().min(0),
        studio: z.number().int().min(0),
      })
      .strict()
      .default({ free: 0, creator: 1, pro: 3, studio: 10 }),
    // PERFORMANCE-LEARNING ACCESS (slice 9b, R-112 / PRD §4G).
    //
    // The exhaustive tier map is configuration, not tier-shaped code. A
    // caller resolving billing state must use the exact entry for the
    // authoritative tier; a missing tier is therefore a parse failure rather
    // than a guessed downgrade. The custom-inversion witness deliberately
    // makes Free `full` and Creator `view_only` to prove the reader follows
    // this document instead of hard-coding paid = full.
    //
    // `.default(...)` preserves the ordered rollout: migration 0033 first,
    // then code can read a pre-materialisation document, and only then does
    // `config:migrate` store the key. Once stored, an old strict parser is not
    // rollback-safe; rollback must retain this parser or roll forward.
    performanceLearning: z
      .object({
        free: z.enum(["view_only", "full"]),
        creator: z.enum(["view_only", "full"]),
        pro: z.enum(["view_only", "full"]),
        studio: z.enum(["view_only", "full"]),
      })
      .strict()
      .default({
        free: "view_only",
        creator: "full",
        pro: "full",
        studio: "full",
      }),
    // REQ-G07's conservative monthly-burn runway window (slice 9b).
    //
    // Thirty trailing days matches the product's monthly-burn context. Three
    // distinct non-zero debit days is the explicit repeated-use minimum: one
    // or two days are too sensitive to one session or retry pattern. This is
    // a product threshold, not a statistical-confidence claim, so both values
    // live in versioned config and remain editable at /admin/config.
    //
    // The relationship is enforced here as well as at the projection: an
    // impossible minimum wider than its window is a drifted config document.
    // The object default has the same rollout/rollback semantics as
    // `performanceLearning` above.
    daysToEmpty: z
      .object({
        trailingWindowDays: z.number().int().positive(),
        minimumDebitDays: z.number().int().positive(),
      })
      .strict()
      .refine((value) => value.minimumDebitDays <= value.trailingWindowDays, {
        message:
          "daysToEmpty.minimumDebitDays must be less than or equal to daysToEmpty.trailingWindowDays",
      })
      .default({ trailingWindowDays: 30, minimumDebitDays: 3 }),
    // HOW MANY MODEL CALLS ONE WORKSPACE MAY HAVE IN FLIGHT AT ONCE
    // (tech-spec §6, production BLOCK 4 of 2026-08-28).
    //
    // The numbers are the spec's, not an engineering guess: "per-user
    // generation concurrency 2 (Free/Creator) / 4 (Pro) / 8 (Studio)".
    //
    // THE GRAIN IS THE WORKSPACE, AND THE SPEC SAYS "PER-USER" — a deliberate
    // divergence, recorded as `decisions.md` R-39. The limits are keyed to
    // TIERS, and a tier is a property of a workspace in this codebase, so a
    // per-user reading multiplies by the seat count: a Pro workspace with five
    // seats would permit twenty concurrent vendor calls, which bounds one
    // person's spend and not ours. Our vendor bill is the thing the finding is
    // about, so the slot is workspace-grained.
    //
    // `min(1)`, not `min(0)`: a 0 here is not "no concurrency limit", it is
    // "this tier can never generate" — and an operator lowering a limit to
    // zero from /admin/config would silently disable the product for a whole
    // tier. `pgRunSlots` refuses a non-positive limit too, so the fail-closed
    // answer is a typed refusal at both ends rather than an unbounded default.
    //
    // `.default(...)` for the A-9 reason `profileCaps` carries above.
    concurrencyLimits: z
      .object({
        free: z.number().int().min(1),
        creator: z.number().int().min(1),
        pro: z.number().int().min(1),
        studio: z.number().int().min(1),
      })
      .strict()
      .default({ free: 2, creator: 2, pro: 4, studio: 8 }),
    // ONBOARDING'S PRODUCT RULES (slice 3).
    //
    // `minOwnPostsForVoice` is how many of the creator's OWN posts must exist
    // before a voice inference is allowed to run. Below it, `inferVoice`
    // refuses BEFORE the vendor is called: an inference over one post produces
    // `[check]` in every field, which is honest, useless, and would still have
    // consumed the creator's one included run.
    //
    // IT IS `.default(...)` AND NOT A REQUIRED STORED KEY, and the distinction
    // is the one `overallDeadlineMs` records against `prices`: a defaulted
    // PRICE would bill someone against a number nobody chose, so that one is a
    // refusal; a defaulted THRESHOLD only decides whether we ask, and the
    // fail-closed direction of a missing key here is "ask for more posts",
    // which costs a creator nothing.
    //
    // Three, not one, and not ten. One post cannot show a rhythm — the whole
    // `sentenceRhythm` field would be a placeholder — and ten is a wall in
    // front of the product's first real screen. Three is the smallest number
    // at which "how they write" is a claim about a pattern rather than about
    // one post, and it is deliberately the same n the learning loop requires
    // before it will state a rule (R-10).
    //
    // `voiceCorpusMaxPosts` bounds what we SEND AND PAY FOR, which is why it is
    // a dial and not the module constant it started as (billing gate round 2,
    // 2026-08-29). `POST_CONTENT_MAX` was the wrong precedent: that bounds what
    // a creator may STORE, refuses at the boundary, and costs us nothing per
    // call. This is the `maxOutputTokens` shape — the creator can do nothing
    // about it and every unit is money — and `maxOutputTokens` is config. The
    // slice learned the cost of getting that wrong twice in one day.
    //
    // `maxUnchargedBillableAttempts` bounds a hole the entitlement split
    // opened: a truncated call is billable to US and deliberately free to the
    // creator, so `priceOf` returns 0, the balance check is skipped, and the
    // press repeats forever at our expense. It is a SAFETY bound, not a
    // product limit — three is enough for a transient, and far below anything
    // a real creator reaches.
    onboarding: z
      .object({
        minOwnPostsForVoice: z.number().int().min(1).default(3),
        voiceCorpusMaxPosts: z.number().int().min(1).max(50).default(50),
        maxUnchargedBillableAttempts: z.number().int().min(1).default(3),
      })
      .strict()
      .default({
        minOwnPostsForVoice: 3,
        voiceCorpusMaxPosts: 50,
        maxUnchargedBillableAttempts: 3,
      }),
    // GENERATION'S PRODUCT RULES (slice 6, R16).
    //
    // `maxUnchargedBillableAttempts` IS THE SAME BOUND AS `onboarding`'s AND
    // DELIBERATELY NOT THE SAME NUMBER-IN-ONE-PLACE. R-48's bound exists
    // because a call can be billable to US and free to the CREATOR — a
    // truncation, or a reply this product could not parse — so the press
    // repeats at our expense with no balance check to stop it. Generation has
    // exactly that hole (question 4 of the slice card: a `schema_invalid` or
    // truncated reply writes `model_usage` and takes NO debit), so it needs
    // the same bound.
    //
    // ITS OWN KEY RATHER THAN A SHARED ONE, because the two operations have
    // different shapes and an operator who raises one must not silently raise
    // the other: an onboarding rebuild is once-in-a-while and a generation is
    // the thing a creator does all day, so the number at which "this is a
    // fault on our side" becomes true is not the same number. Sharing the key
    // would also make the count's grain unreadable — the count is per PURPOSE
    // (`countUnchargedBillableAttempts({purpose})`), so one key over two
    // grains would read as one bound over both.
    //
    // AND THEN IT SHIPPED THE IDENTICAL 3, WHICH IS THE THING THE PARAGRAPH
    // ABOVE ARGUES AGAINST (billing gate, 2026-09-01). Both numbers are now
    // chosen, and each cites the thing that decides it.
    //
    // `maxUnchargedBillableAttempts: 10` — DERIVED FROM `concurrencyLimits`,
    // not picked. This count runs outside any lock (see `generate.ts`'s own
    // note), so the bound's accepted width is ONE BURST of the tier's slot
    // limit: N presses in flight together can each read `cap - 1` and all
    // pass. The largest seeded limit is `concurrencyLimits.studio = 8`, so a
    // cap AT OR BELOW 8 is a cap a single legal burst exhausts — unenforceable
    // as a bound, and (before the window below) permanent as a refusal. 10 is
    // the smallest round number strictly above it.
    //
    // WHAT THAT COSTS US, ON THE GRAIN THE CAP ACTUALLY COUNTS (corrected,
    // billing gate round 2, 2026-09-01). The first derivation here read
    // "10 x maxOutputTokens x sonnet output = 0.60 USD" — a PER-CALL figure
    // against a PER-ATTEMPT cap. `countUnchargedBillableAttempts` is
    // `countDistinct(attempt_id)` (`with-workspace.ts`), and one attempt makes
    // up to THREE vendor calls: the draft, R6's one rewrite (`pipeline.ts` —
    // exactly two `generate` expressions, no loop) and the cheap kill-test
    // scoring call. The counted worst case is a real path, not a hypothetical:
    // draft 1 parses, its kill test fails, the one rewrite runs, draft 2
    // parses and is accepted, and the SCORING reply is the one this product
    // cannot parse — `parseKillTestReply` throws out of the pipeline, no
    // generation is settled, no debit is taken, and all three calls are
    // billable rows under ONE attempt id.
    //
    //   draft + rewrite   2 x 12000 x 15000 = 360,000,000 nano-USD
    //   scoring (Haiku)   1 x 12000 x  5000 =  60,000,000 nano-USD
    //   per counted attempt                 = 420,000,000 = 0.42 USD
    //   x 10                                = 4.20 USD per profile per window
    //
    // TRIPLED ON 2026-09-04, and the increase is REAL rather than a
    // recalculation: `maxOutputTokens` went 4,000 -> 12,000 because the first
    // `analyseAndSpin` generation that ever completed against a real vendor
    // needed 5,060 output tokens and every spin was truncating. This ceiling
    // is the price of the mode working at all, and 10 uncharged attempts is
    // now 4.20 USD of output exposure per profile per window rather than 1.40.
    // `maxUnchargedBillableAttempts` was sized against the old figure and has
    // NOT been re-derived against this one — that is an open billing decision,
    // not a settled number, and it is recorded as such rather than adjusted
    // here in passing.
    //
    // AND INPUT IS ON TOP OF THAT AND NO KEY HERE BOUNDS IT. `maxOutputTokens`
    // bounds the REPLY only; every one of those three calls also pays input at
    // `inputNanoUsdPerToken` (3000 Sonnet / 1000 Haiku), and the rewrite's
    // prompt CONTAINS draft 1's whole reply while the scoring prompt contains
    // the rendered draft. So 4.20 USD of output ceiling per profile per window
    // is a FLOOR on the exposure, not the exposure — the honest form of this
    // number, and the reason the old 0.60 was wrong in the dangerous
    // direction. Ours and never the creator's, either way.
    // `generation-pricing.test.ts` recomputes the 420,000,000 from the seeded
    // document, so a price or ceiling change reddens a test rather than
    // leaving this arithmetic quietly stale.
    //
    // THE WINDOW IS COUNTED AND SURFACED, because a rate bound nobody measures
    // is a bound nobody can act on: `metrics.ts` emits
    // `respin.credits.uncharged_billable_attempts.capped` at both cap sites.
    //
    // `unchargedAttemptWindowMinutes: 60` — BECAUSE THE COUNT HAS TO HAVE A
    // WINDOW AT ALL. `countUnchargedBillableAttempts` reads an APPEND-ONLY
    // table, so an unwindowed count is a LIFETIME count: three (now ten)
    // unparseable replies EVER would refuse this profile's generations
    // permanently, with the only remedy an operator raising a GLOBAL key and no
    // surface anywhere listing which profiles are at the cap. The failure this
    // bounds is deterministic AND immediate — a truncation or an unparseable
    // reply repeats on the very next press — so the bound only has to survive
    // one sitting, and an hour is a sitting. A creator who hit the cap
    // yesterday is not the failure mode; a creator hammering the button right
    // now is.
    //
    // `.default(...)` for the A-9 reason `profileCaps` carries above: a STORED
    // document written before these keys existed must still parse, or
    // `getActiveConfig` throws inside the Stripe webhook's transaction. They
    // are THRESHOLDS and not prices, so they are deliberately NOT on
    // `requiredConfigPaths` — a defaulted bound still bounds; a defaulted
    // price would bill someone against a number nobody chose.
    // `frameworkContextCharBudget: 20000` — HOW MUCH OF ONE GENERATION'S
    // PROMPT THE FRAMEWORK LIBRARY MAY OCCUPY (slice 7 R17; moved here from a
    // module constant by the billing gate, 2026-09-01).
    //
    // IT IS A SPEND DIAL, WHICH IS WHY IT IS NOT A CONSTANT. It sets the INPUT
    // token floor of every generation that offers frameworks, and input is
    // billed at `llm.prices.<model>.inputNanoUsdPerToken` on every one of an
    // attempt's calls — so this number is a REQ-G05 margin input in exactly
    // the way `llm.maxOutputTokens` is, and that one is config. The constant's
    // own docblock said so and named the handoff; this is the handoff landing.
    //
    // WHAT THE NUMBER MEANS, measured rather than chosen by taste: the nine
    // seeded shared frameworks assemble to 5,335 characters
    // (`generation-frameworks.test.ts` recomputes both halves from the seed),
    // so the whole curated library fits nearly four times over. The budget is
    // not a ration on the product's own material — it is a ceiling on the part
    // a creator can grow, because `PRIVATE_FRAMEWORK_COUNT_MAX` is 50 live
    // private frameworks and `FRAMEWORK_TEXT_MAX` x `FRAMEWORK_LIST_MAX` makes
    // ONE row ~100,000 characters.
    //
    // NOT on `requiredConfigPaths`, for the reason
    // `onboarding.voiceCorpusMaxPosts` states one key up: a defaulted BOUND
    // still bounds, and the A-9 deploy order (deploy code, then
    // `config:migrate`) needs a stored document written before this key
    // existed to keep parsing inside the Stripe webhook's transaction. A
    // defaulted PRICE is the different case — that one is refused outright,
    // because a defaulted price bills someone against a number nobody chose.
    //
    // `min(1)`: a 0 here is not "no ceiling", it is "no framework ever fits",
    // which would silently turn the whole library off for every generation
    // while `framework_eligibility` went on refusing any output that named
    // one — the same fail-closed reading `concurrencyLimits` takes.
    //
    // `.default(20_000)`, LIKE EVERY SIBLING KEY HERE. It shipped `.optional()`
    // for one concurrent round because `.default(...)` makes the key REQUIRED
    // on the parsed type and `CONFIG_V1_SEED` — the literal in
    // `packages/db/src/seed.ts`, another owner's file that round — had to gain
    // the same line in the same change or the parity test fails and every call
    // site that spreads the seed stops typechecking. `decisions.md` R-74
    // recorded the deviation and named the seed line as its revisit trigger;
    // R-77 records the trigger firing. The seed carries it now, so the
    // `.optional()` shape, its `FRAMEWORK_CONTEXT_CHAR_BUDGET_FALLBACK` and
    // the `frameworkContextCharBudget(content)` reader are all gone: a
    // `.default(...)` key needs no reader, because the parse hands the value
    // to every consumer at once.
    //
    // WHAT THE FLIP BOUGHT: `mergeMissing` in `migrate-config.ts` copies keys
    // out of the PARSED document, and an `.optional()` key is absent there
    // too — so `pnpm config:migrate` could not materialise this one into a
    // stored document at all, and an operator's only route to it was
    // `/admin/config`. It is carried like every other key now.
    generation: z
      .object({
        maxUnchargedBillableAttempts: z.number().int().min(1).default(10),
        /**
         * THE SAME BOUND, DENOMINATED IN MONEY (billing gate, 2026-09-04).
         *
         * The attempt cap is correctly sized and stays 10 — the count runs
         * outside any lock, so the bound's accepted width is one burst of
         * `concurrencyLimits.studio`, and re-deriving it downward would break
         * it. What was wrong is the UNIT: this cap bounds spend and counted
         * attempts, and the proof is that `llm.maxOutputTokens` moved 4,000 ->
         * 12,000, the worst case per uncharged attempt went 0.14 -> 0.42 USD,
         * and not one control noticed. On Free — no card required — ten
         * attempts an hour is a floor of 100.80 USD per profile per day.
         *
         * The product already has the right shape one directory over: the
         * autopsy worker reserves against `systemAutopsy.dailyCapMicroUsd`
         * before it calls a vendor. The generation path had no money bound at
         * all.
         *
         * 1,000,000 micro-USD = 1.00 USD per profile per window. UNMEASURED
         * LAUNCH BOUND, chosen as roughly two worst-case uncharged attempts at
         * today's ceiling rather than from observed data — it binds before the
         * attempt cap when attempts are expensive and never binds when they are
         * cheap. Revisit trigger: the first 200 uncharged billable attempts'
         * measured cost, and it moves with `llm.maxOutputTokens` rather than
         * being left behind by it, which is the whole point of the key. A
         * co-trigger is `generation.recentContextCharBudget` (launch L3, below):
         * it raises the INPUT cost of every `ideation` / `ideaToScript` call and
         * rewrite, so raising it moves the per-attempt worst case this bound
         * was sized against (L3 billing gate, note BN-3).
         *
         * IT REPLACES NOTHING. A row whose `cost_state` is `unknown` carries a
         * NULL cost and contributes zero to the sum, which understates in the
         * dangerous direction — the attempt cap is what bounds those.
         */
        maxUnchargedBillableCostMicroUsd: z.number().int().min(1).default(1_000_000),
        /**
         * THE TOTAL, SUCCESSES INCLUDED (audit P3-R3, decisions R-158).
         *
         * The key above counts only rows the creator was NOT charged for, so
         * it cannot see a success — and pointing it at a total would refuse a
         * paying creator after two or three generations an hour. This is a
         * separate key with a separate meaning: ALL billable generation spend
         * per profile per `unchargedAttemptWindowMinutes`.
         *
         * 60,000,000 micro-USD = 60 USD. OWNER-CHOSEN, NOT A MAXIMUM. Its unit
         * is the per-attempt worst case, output + input: three calls to the
         * 12,000-token reply ceiling (2 × 12,000 × 15,000 + 12,000 × 5,000 =
         * 420,000,000 nano-USD), three bounded inputs at the 104,323
         * `llm.maxInputTokens` ceiling (104,323 × 3,000 × 2 + 104,323 × 1,000
         * = 730,261,000), and the two vendor drafts carried EXEMPT from that
         * ceiling — draft 1 on the rewrite with its 579 bytes of our own
         * wrapping, the accepted draft on the scoring call ((12,000 + 579) ×
         * 3,000 + 12,000 × 1,000 = 49,737,000) — = 1.199998 USD per attempt,
         * so 60 USD covers 50 worst-case attempts per profile per hour. It
         * binds on a runaway (a looping caller, a price change that
         * multiplies the per-attempt cost), not on a tier's ordinary use.
         * `generation-pricing.test.ts` recomputes the figure from the config
         * inputs and requires this bound to cover at least 50 of them — the
         * rule that sets the input ceiling (R-158). Revisit when `llm.maxOutputTokens`,
         * `llm.maxInputTokens`, `llm.prices`, `llm.overallDeadlineMs` or
         * `concurrencyLimits.studio` moves.
         */
        maxBillableCostMicroUsdPerWindow: z.number().int().min(1).default(60_000_000),
        unchargedAttemptWindowMinutes: z.number().int().min(1).default(60),
        frameworkContextCharBudget: z.number().int().min(1).default(20_000),
        /**
         * HOW MUCH LABELLED RECENT WORK ONE CONCEPT OR SCRIPT PROMPT MAY CARRY
         * (launch L3, R-152) — the ONE character budget across both lists the
         * plan bounds by count (at most five concept/draft records and three
         * reaction notes, `RECENT_DRAFTS_MAX` / `RECENT_NOTES_MAX` in
         * `packages/db/src/with-workspace.ts`, where the scoped read applies
         * them). A SPEND DIAL for the
         * reason `frameworkContextCharBudget` is one: it raises the input-token
         * floor of every `ideation` / `ideaToScript` call.
         *
         * `min(0)`, UNLIKE THE FRAMEWORK BUDGET, deliberately: 0 is a real
         * operator lever ("send no history"), not a silent library loss — every
         * record the budget refuses is written into the claim's request
         * snapshot as an `over_budget` exclusion, so the off switch is visible
         * per operation. 4,000 characters is an UNMEASURED launch bound (about
         * eight short records); revisit with L6's next-session witness.
         */
        recentContextCharBudget: z.number().int().min(0).default(4_000),
      })
      .strict()
      // EVERY KEY, NOT JUST THE ONES A STORED DOCUMENT USUALLY LACKS. In Zod 4
      // an object-level `.default(...)` SHORT-CIRCUITS — when the whole
      // `generation` key is absent this literal is returned as written, and the
      // inner `.default(...)`s never run (verified against the installed
      // zod@4.4.3, and pinned by `config.test.ts`'s "a stored document written
      // before an object key existed" case). A key omitted here would therefore
      // be `undefined` at runtime while its type says `number` — which for
      // THIS key means `charBudget` arriving as `undefined`, every comparison
      // against it false, and the whole framework library silently dropped.
      .default({
        maxUnchargedBillableAttempts: 10,
        maxUnchargedBillableCostMicroUsd: 1_000_000,
        maxBillableCostMicroUsdPerWindow: 60_000_000,
        unchargedAttemptWindowMinutes: 60,
        frameworkContextCharBudget: 20_000,
        recentContextCharBudget: 4_000,
      }),
    // Spin's requested lexical-change strictness. The pipeline clamps this to
    // its code-owned refusal floor, so config can only tighten the hard gate.
    similarity: z
      .object({ strictness: z.number().finite().min(0).max(1).default(0.7) })
      .strict()
      .default({ strictness: 0.7 }),
    // Sessionless autopsies spend product budget, not creator credits. The
    // worker clamps this dial to its independent code ceiling, so a stored
    // value can only tighten that release limit.
    systemAutopsy: z
      .object({
        dailyCapMicroUsd: z
          .number()
          .int()
          .min(0)
          .max(Number.MAX_SAFE_INTEGER)
          .default(100_000_000),
      })
      .strict()
      .default({ dailyCapMicroUsd: 100_000_000 }),
    // Phase 10a (R-123): the public Sample Spin's daily purpose maximum inside
    // the same system-spend authority. The claim clamps this dial to
    // `PUBLIC_SAMPLE_SPIN_DAILY_CODE_CEILING_MICRO_USD` ($10/day), so a stored
    // value can only tighten it.
    publicSampleSpin: z
      .object({
        dailyCapMicroUsd: z
          .number()
          .int()
          .min(0)
          .max(Number.MAX_SAFE_INTEGER)
          .default(10_000_000),
      })
      .strict()
      .default({ dailyCapMicroUsd: 10_000_000 }),
    // THE MODEL LAYER (slice 2a, tech-spec §1 / R-5). Everything the
    // provider adapter needs that must be changeable without a deploy: which
    // model each class of operation uses, what each model costs us, and the
    // two numbers that bound a call.
    //
    // `.default(...)` for the same A-9 reason as `profileCaps` above.
    llm: z
      .object({
        // WHICH MODEL RUNS WHAT (owner decision queue, "Model tiers per
        // operation"; default taken — `tech-spec.md:19`): generation is
        // Sonnet-class, classification is Haiku-class. Model ids are the
        // vendor's exact strings and carry NO date suffix.
        models: z
          .object({
            generation: z.string().min(1),
            classification: z.string().min(1),
          })
          .strict(),
        // WHAT EACH MODEL COSTS US, keyed by the vendor's model id, in
        // NANO-USD PER TOKEN (D-M2-13, R6/R7).
        //
        // Nano rather than micro because a micro-USD-per-token table cannot
        // express these prices at all: Haiku input is $1.00/MTok = 0.001
        // micro-USD per token, which rounds to zero in an integer micro table
        // — a price table that silently prices the cheapest model at
        // free. Nano gives three more digits and keeps every value an integer,
        // so no float ever touches the number a margin dashboard sums.
        //
        // A MODEL WITH NO ROW HERE IS A TYPED REFUSAL, NEVER A SILENT ZERO
        // (`priceFor` in @respin/llm). A zero would understate cost and
        // therefore OVERSTATE margin, which is the dangerous direction for the
        // one number R-6 tunes pricing against.
        prices: z.record(
          z.string().min(1),
          z
            .object({
              inputNanoUsdPerToken: z.number().int().min(0),
              outputNanoUsdPerToken: z.number().int().min(0),
            })
            .strict()
        ),
        maxOutputTokens: z.number().int().positive(),
        /**
         * THE ASSEMBLED-INPUT CEILING ON EVERY CREATOR-FACING VENDOR CALL
         * (audit P3-R2, decisions R-158), in tokens, compared against the
         * prompt's UTF-8 byte length — an upper bound on its token count.
         * Checked before the call by `assertInputWithinCeiling` (`@respin/llm`)
         * in the studio and onboarding callers; the two public paths take
         * `min(this, their compiled R-123 ceiling)`, so config may only
         * tighten those.
         *
         * A SPEND DIAL, NOT A CONSTANT: input is billed per token on every
         * call, so this is a REQ-G05 margin input — the
         * `frameworkContextCharBudget` precedent.
         *
         * 104,323, THE MARGIN RULE'S MAXIMUM (R-158 point 7, 2026-10-06): the
         * largest value at which the window total above still covers 50
         * worst-case attempts, the exempt drafts included —
         * `packages/credits/tests/input-ceiling-derivation.test.ts` computes it
         * and requires this to equal it. The largest fresh generation the
         * product's own caps produce — the framework and recent-work budgets
         * at their limits, the creative block at its caps, three brain
         * documents each at one maximal edit request (`BRAIN_EDIT_TOTAL_MAX`)
         * and an idea at `OWN_IDEA_MAX` — measures 105,217 bytes, 0.86% OVER
         * this (105,006 and 0.65% until audit Phase 8 added the untrusted-input
         * fence, R-177): such an input is refused before the call with zero
         * spend, a residual the owner sees in R-158 and the test keeps under
         * 1%. A
         * revision of a 12,000-token draft on such a brain, a brain grown past
         * one edit per document, and a Spin reference at its field caps are
         * larger still and are NOT admitted: admitting them breaks the margin
         * rule, so that is the owner's call, recorded in R-158.
         *
         * DEFAULTED READ, NO REQUIRED PATH (the `overallDeadlineMs` rule
         * below): a document without the key parses to 104,323 through the
         * object-level default, which still bounds. It is listed in that
         * default, because Zod 4 skips inner defaults when `llm` is absent.
         */
        maxInputTokens: z.number().int().min(1).default(104_323),
        // ONE ATTEMPT'S timeout. This is the SDK's per-request bound, so it
        // multiplies by `maxRetries + 1` — it is NOT a bound on the operation.
        timeoutMs: z.number().int().positive(),
        // THE WHOLE CALL'S DEADLINE, RETRIES INCLUDED (production CHANGE 6).
        //
        // `timeoutMs × (maxRetries + 1)` is 360s at the defaults below, plus
        // the SDK's backoff — that much of a Next.js SERVER ACTION if every
        // attempt runs to its own timeout. Long before that a proxy cuts the
        // browser's connection while the server keeps running, and the server
        // still writes `model_usage` and still charges: the creator sees a dead
        // page and a debit they cannot explain. A per-attempt timeout cannot
        // express this bound, because the whole defect is that attempts
        // ACCUMULATE. That is what this key is for and it is why it is 120s
        // rather than 360s.
        //
        // THIS PARAGRAPH USED TO SAY 180s AND ARGUE FOR 40_000 (billing and
        // code review, both 2026-09-04). It read "40_000 rather than 45_000:
        // the deadline has to leave room for the work either side of it inside
        // [tech-spec §7's < 45s] budget" — an argument for a number that had
        // been changed out from under it, citing a budget the product does not
        // meet. A real `analyseAndSpin` generation takes 53.2s, so 40_000
        // aborted EVERY spin at 40,130 ms; §132's budget is now annotated as
        // breached and open (`decisions.md` R-100) rather than quoted here as
        // live. Golden rule 1: a claim recorded is verified against the file it
        // names, and this one was not.
        //
        // THE UPPER BOUND IS NOT §7, IT IS THE AUTOPSY CLAIM LEASE. The same
        // key is read by the sessionless worker, which spends it up to
        // `AUTOPSY_VENDOR_CALLS_PER_ATTEMPT` times in sequence and REFUSES TO
        // START above `AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS` (135,000). The
        // usable window is therefore 53,233 < x <= 135,000, and
        // `respin/tests/llm-deadline-coherence.test.ts` is what holds it across
        // the three packages that cannot import one another.
        //
        // `.default(...)` for the A-9 reason every key here carries. It is a
        // NESTED key, and `mergeMissing` in `migrate-config.ts:151-172` walks
        // every depth — verified by reading it, because the top-level-only
        // behaviour it replaced would have skipped this key silently on every
        // database seeded before slice 2a.
        //
        // Unlike a PRICE, this key is NOT on `requiredConfigPaths`: nothing is
        // refused for running under a defaulted deadline, because a defaulted
        // deadline still bounds the call. A defaulted price would bill a
        // creator against a number nobody chose, which is why that one is a
        // refusal and this one is not.
        //
        // ITS UPPER BOUND IS NOW ENFORCED HERE (audit P3-A3): above
        // `AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS` the worker refuses to start
        // on every tick, so a document carrying such a value is refused at
        // parse — from the one constant `@respin/db` owns, never a copy.
        overallDeadlineMs: z
          .number()
          .int()
          .positive()
          .max(AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS)
          .default(120_000),
        // Bounded, and 0 is legal (it means "no retry"). A retry shares the
        // calling attempt's `attempt_id`, so retries never inflate the
        // distinct-attempt count D-M2-2 prices against (R5).
        maxRetries: z.number().int().min(0),
      })
      .strict()
      .default({
        models: {
          generation: "claude-sonnet-5",
          classification: "claude-haiku-4-5",
        },
        // Anthropic's published first-party rates, converted at $1/MTok =
        // 1000 nano-USD/token. Sonnet 5 is priced at its STANDARD $3/$15
        // rather than the $2/$10 introductory rate: the intro rate expires
        // 2026-08-31, four days after this table was written, and a table that
        // under-states what we pay overstates margin the moment it lapses.
        prices: {
          "claude-sonnet-5": {
            inputNanoUsdPerToken: 3000,
            outputNanoUsdPerToken: 15000,
          },
          "claude-haiku-4-5": {
            inputNanoUsdPerToken: 1000,
            outputNanoUsdPerToken: 5000,
          },
        },
        // MEASURED, NOT CHOSEN (2026-09-04). The first `analyseAndSpin`
        // generation that ever ran to completion against the real vendor took
        // 53.2 s and produced 5,060 output tokens. The shipped values were
        // 40 s and 4,000 tokens, so EVERY spin failed — first at the deadline
        // (`LlmUnavailableError`, 0 tokens, `unavailable`), and once past that
        // at the ceiling (`LlmTruncatedError`, billed). Neither was reachable
        // by any test: no generation had ever completed against a real vendor,
        // and the failure only appears at the real reply's real length.
        //
        // 12,000 is 2.4x the measured natural length; 120 s is 2.3x the
        // measured duration AND sits under
        // `AUTOPSY_STAGE_DEADLINE_CODE_CEILING_MS` (135,000 — four sequential
        // stages plus margin inside the autopsy claim lease), which a larger
        // deadline would breach and the worker would refuse to start.
        //
        // `timeoutMs` MATCHES the deadline rather than sitting under it. It
        // used to be 60 s against a 40 s deadline — a per-request timeout the
        // outer bound could never let expire, so it was dead config that read
        // like a control. Equal values mean one bound, honestly stated. It
        // also means `maxRetries` cannot fit a second full-length attempt;
        // that is stated rather than papered over, because a 53 s natural call
        // never had room for a retry inside a lease-bounded deadline.
        maxOutputTokens: 12_000,
        maxInputTokens: 104_323,
        timeoutMs: 120_000,
        overallDeadlineMs: 120_000,
        maxRetries: 2,
      }),
    /**
     * Corrections `config:migrate` has already consumed on this database.
     *
     * BOOKKEEPING, NOT PRODUCT CONFIG, and it lives in the document because
     * that is the only thing `config_versions` carries forward.
     *
     * WHY IT EXISTS (billing gate BLOCK, 2026-09-04). `CORRECTIONS` claimed it
     * "fires only when … the active version was written by the product
     * itself", and a reviewer falsified it against a real database in two
     * ordinary `config:migrate` runs. Provenance was a property of the ACTIVE
     * ROW, and every migrate pass appends its own result as `migrate-config` —
     * a product author. So run 1 correctly skipped an operator's document,
     * laundered it into a product-authored one, and run 2 overwrote their
     * `maxOutputTokens`, `overallDeadlineMs` and `timeoutMs`. The function's
     * own docstring says a second run is a no-op.
     *
     * A MARKER ALONE DOES NOT FIX THAT, and that is the part worth reading:
     * after the laundering pass nothing can tell that 4000 was the operator's
     * choice. So the rule is not "record what we changed" but **record what we
     * DECLINED** — when a correction matches on an operator-authored document
     * we consume its id and leave the value alone, which makes the operator's
     * choice permanent instead of merely deferred by one run.
     *
     * An entry is a correction IDENTITY (`path:from→to`), not a path, so a
     * value an operator later sets back to `from` is still never re-corrected,
     * and adding a genuinely new correction for the same path still fires.
     */
    appliedCorrections: z.array(z.string()).default([]),
  })
  .strict();

export type RespinConfigV1 = z.infer<typeof respinConfigV1>;
export type SubscriptionTier = "creator" | "pro" | "studio";

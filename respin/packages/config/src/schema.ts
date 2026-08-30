// RespinConfigV1 — the runtime-config contract (D-M1-2, B5). This Zod schema
// must parse EXACTLY the Phase-1 seed (parity test drives from CONFIG_V1_SEED).
// strict(): an unknown key is a drifted document, not a silent passenger.
import { z } from "zod";

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
        // safe. It is NOT what prices a debit — see R19 and
        // `assertStoredConfigKeys`: a debit is refused outright while the key
        // is only defaulted, because a defaulted price is not a priced debit.
        onboardingBrainRebuild: z.number().int().min(0).default(50),
      })
      .strict(),
    allowances: z
      .object({
        free: z.number().int().min(0),
        creator: z.number().int().min(0),
        pro: z.number().int().min(0),
        studio: z.number().int().min(0),
      })
      .strict(),
    pack: z
      .object({
        credits: z.number().int().positive(),
        priceUsd: z.number().positive(),
        validityMonths: z.number().int().positive(),
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
        // ONE ATTEMPT'S timeout. This is the SDK's per-request bound, so it
        // multiplies by `maxRetries + 1` — it is NOT a bound on the operation.
        timeoutMs: z.number().int().positive(),
        // THE WHOLE CALL'S DEADLINE, RETRIES INCLUDED (production CHANGE 6).
        //
        // `timeoutMs × (maxRetries + 1)` is 180s at the defaults below, plus
        // the SDK's backoff — roughly 181s of a Next.js SERVER ACTION, against
        // the < 45s full-script budget in tech-spec §7. Long before that a
        // proxy cuts the browser's connection while the server keeps running,
        // and the server still writes `model_usage` and still charges: the
        // creator sees a dead page and a debit they cannot explain. A per-
        // attempt timeout cannot express this bound, because the whole defect
        // is that attempts ACCUMULATE.
        //
        // 40_000 rather than 45_000: the deadline has to leave room for the
        // work either side of it inside the same budget — the pre-call reads
        // and, more importantly, the `model_usage` commit and the debit, which
        // run AFTER the vendor answers and must not be what breaches §7.
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
        overallDeadlineMs: z.number().int().positive().default(40_000),
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
        maxOutputTokens: 4000,
        timeoutMs: 60_000,
        overallDeadlineMs: 40_000,
        maxRetries: 2,
      }),
  })
  .strict();

export type RespinConfigV1 = z.infer<typeof respinConfigV1>;
export type SubscriptionTier = "creator" | "pro" | "studio";

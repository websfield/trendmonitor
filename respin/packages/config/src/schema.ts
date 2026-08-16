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
  })
  .strict();

export type RespinConfigV1 = z.infer<typeof respinConfigV1>;
export type SubscriptionTier = "creator" | "pro" | "studio";

// THE STRIPE PRICE ALLOWLIST (Phase 6 final billing check: the third finding in
// one class, closed by allowlisting rather than by adding the next field).
//
// Twice a check named the fields someone had thought of, and a price with a
// payment-affecting field nobody had named passed: first the billing interval,
// then `currency_options` and `transform_quantity`. So the rule is inverted.
// Every field of a Stripe `Price` that can change what a customer pays is
// listed below with the values a price may hold. A price with ANY of those
// fields outside its allowed values is refused, whether or not anybody
// thought of that field as a risk.
//
// READ FROM THE INSTALLED SDK, not from memory: `stripe@22.5.0`,
// `cjs/resources/Prices.d.ts`, `interface Price` and `Price.Recurring`. The
// fields of `Price` NOT listed here cannot change a charge: `id`, `object`,
// `created`, `livemode`, `lookup_key`, `metadata`, `nickname`, `product`,
// `deleted`. A field the SDK adds in a later version is not covered until it
// is listed here, which is why the SDK version is named.
//
// Two consumers share the list:
// - `tierPriceDefect` (`./tier-price.ts`, used by Checkout and `stripe:setup`)
//   for a recurring monthly plan price;
// - `resolvePackPrice` (`./pack-price.ts`, used by pack Checkout and
//   auto-top-up) and `stripe:setup`'s pack check, for a one-time price.

/** The one currency every price this product states or charges is in. */
export const PINNED_CURRENCY = "usd" as const;

/**
 * The fields of a Stripe `Price` the allowlist reads, structurally, so a
 * fixture and the SDK object are both accepted. All optional: an absent field
 * is judged by the rule's own `absent` answer, never silently passed.
 */
export type PriceFacts = Readonly<{
  active?: boolean;
  type?: string;
  billing_scheme?: string;
  currency?: string;
  currency_options?: Readonly<Record<string, unknown>> | null;
  custom_unit_amount?: unknown;
  tax_behavior?: string | null;
  tiers?: readonly unknown[] | null;
  tiers_mode?: string | null;
  transform_quantity?: unknown;
  unit_amount?: number | null;
  /** The SDK's `Decimal` (or its string form); compared by numeric value. */
  unit_amount_decimal?: unknown;
  recurring?: Readonly<{
    interval?: string;
    interval_count?: number;
    meter?: string | null;
    trial_period_days?: number | null;
    usage_type?: string;
  }> | null;
}>;

/** What the caller expects the price to be: its kind and its amount. */
export type PriceExpectation = Readonly<{
  type: "recurring_monthly" | "one_time";
  amountCents: number;
  /** Words for the amount's authority, used in the defect detail. */
  amountAuthority: string;
}>;

/** Every defect the allowlist can name. A closed list. */
export const PRICE_DEFECT_KINDS = [
  "archived",
  "not_recurring",
  "not_one_time",
  "not_monthly",
  "interval_count",
  "metered",
  "trial",
  "tiered",
  "currency_options",
  "transform_quantity",
  "custom_unit_amount",
  "tax_behavior",
  "no_fixed_amount",
  "unit_amount_decimal",
  "currency",
  "amount",
] as const;
export type PriceDefectKind = (typeof PRICE_DEFECT_KINDS)[number];
export type PriceDefect = Readonly<{ kind: PriceDefectKind; detail: string }>;

/** `undefined` and `null` both mean "not set" for a field the SDK types as nullable. */
const unset = (v: unknown): boolean => v === undefined || v === null;
const emptyOrUnset = (v: unknown): boolean =>
  unset(v) ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0);

/**
 * THE ALLOWLIST, AS DATA: each rule is one payment-affecting field (or one
 * combination the SDK splits across fields), the values it may hold, and the
 * defect it reports otherwise. Evaluated in this order; the first failure is
 * the answer.
 */
export const PRICE_ALLOWLIST: readonly Readonly<{
  kind: PriceDefectKind;
  /** The `Price` field(s) the rule reads. */
  fields: string;
  /** The values allowed, in words, as the rule tests them. */
  allowed: string;
  ok: (p: PriceFacts, e: PriceExpectation) => boolean;
  detail: (p: PriceFacts, e: PriceExpectation) => string;
}>[] = [
  { kind: "archived", fields: "active", allowed: "true", ok: (p) => p.active === true, detail: () => "the price is archived in Stripe" },
  {
    kind: "not_recurring",
    fields: "type, recurring",
    allowed: "type 'recurring' with a recurring object, for a plan price",
    ok: (p, e) => e.type !== "recurring_monthly" || (p.type === "recurring" && !unset(p.recurring)),
    detail: () => "the price is not a recurring price, so it cannot back a monthly plan",
  },
  {
    kind: "not_one_time",
    fields: "type, recurring",
    allowed: "type 'one_time' and no recurring object, for a one-off charge",
    ok: (p, e) => e.type !== "one_time" || (p.type === "one_time" && unset(p.recurring)),
    detail: () => "the price is recurring, so it cannot back a one-off charge",
  },
  {
    kind: "not_monthly",
    fields: "recurring.interval",
    allowed: "'month'",
    ok: (p, e) => e.type !== "recurring_monthly" || p.recurring?.interval === "month",
    detail: (p) => `the price bills every ${String(p.recurring?.interval)}, but the plan is stated per month`,
  },
  {
    kind: "interval_count",
    fields: "recurring.interval_count",
    allowed: "1",
    ok: (p, e) => e.type !== "recurring_monthly" || p.recurring?.interval_count === 1,
    detail: (p) => `the price bills every ${String(p.recurring?.interval_count)} months, but the plan is stated per month`,
  },
  {
    kind: "metered",
    fields: "recurring.usage_type, recurring.meter",
    allowed: "usage_type 'licensed' and no meter",
    ok: (p, e) =>
      e.type !== "recurring_monthly" || (p.recurring?.usage_type === "licensed" && unset(p.recurring?.meter)),
    detail: () => "the price is metered, so what it charges depends on reported usage, not the stated price",
  },
  {
    kind: "trial",
    fields: "recurring.trial_period_days",
    allowed: "null",
    ok: (p) => unset(p.recurring?.trial_period_days),
    detail: () => "the price carries its own free trial, so the first charge is not the stated one",
  },
  {
    kind: "tiered",
    fields: "billing_scheme, tiers, tiers_mode",
    allowed: "billing_scheme 'per_unit', tiers absent or empty, tiers_mode null",
    ok: (p) => p.billing_scheme === "per_unit" && emptyOrUnset(p.tiers) && unset(p.tiers_mode),
    detail: () => "the price is tiered, so it carries no single stated amount",
  },
  {
    kind: "currency_options",
    fields: "currency_options",
    allowed: "absent or empty",
    ok: (p) => emptyOrUnset(p.currency_options),
    detail: () => "the price carries amounts in other currencies, so a customer could be charged a converted amount",
  },
  {
    kind: "transform_quantity",
    fields: "transform_quantity",
    allowed: "null",
    ok: (p) => unset(p.transform_quantity),
    detail: () => "the price transforms the quantity before charging, so the charge is not the stated amount",
  },
  {
    kind: "custom_unit_amount",
    fields: "custom_unit_amount",
    allowed: "null",
    ok: (p) => unset(p.custom_unit_amount),
    detail: () => "the price lets the customer choose the amount",
  },
  {
    kind: "tax_behavior",
    fields: "tax_behavior",
    allowed: "'unspecified', 'inclusive' or null (never 'exclusive', which adds tax on top of the stated amount)",
    ok: (p) => unset(p.tax_behavior) || p.tax_behavior === "unspecified" || p.tax_behavior === "inclusive",
    detail: (p) => `the price's tax behaviour is ${String(p.tax_behavior)}, which charges tax on top of the stated amount`,
  },
  {
    kind: "no_fixed_amount",
    fields: "unit_amount",
    allowed: "an integer",
    ok: (p) => typeof p.unit_amount === "number" && Number.isInteger(p.unit_amount),
    detail: () => "the price carries no fixed unit_amount",
  },
  {
    kind: "unit_amount_decimal",
    fields: "unit_amount_decimal",
    allowed: "null, or the same amount as unit_amount",
    ok: (p) => unset(p.unit_amount_decimal) || Number(String(p.unit_amount_decimal)) === p.unit_amount,
    detail: (p) => `the price's decimal amount ${String(p.unit_amount_decimal)} differs from its unit_amount`,
  },
  {
    kind: "currency",
    fields: "currency",
    allowed: `'${PINNED_CURRENCY}'`,
    ok: (p) => p.currency === PINNED_CURRENCY,
    detail: (p) => `the price is in ${String(p.currency)} but this product charges in ${PINNED_CURRENCY}`,
  },
  {
    kind: "amount",
    fields: "unit_amount",
    allowed: "exactly the expected amount",
    ok: (p, e) => p.unit_amount === e.amountCents,
    detail: (p, e) => `the price charges ${String(p.unit_amount)}c but ${e.amountAuthority} is ${e.amountCents}c`,
  },
];

/**
 * The first reason `price` is not the price `expect` describes, or `null`.
 * The ONE evaluator of `PRICE_ALLOWLIST`.
 */
export function priceDefect(price: PriceFacts, expect: PriceExpectation): PriceDefect | null {
  for (const rule of PRICE_ALLOWLIST) {
    if (!rule.ok(price, expect)) return { kind: rule.kind, detail: rule.detail(price, expect) };
  }
  return null;
}

/**
 * THE CHECKOUT SESSION PIN (Phase 6 final billing check): every
 * `checkout.sessions.create` in this directory spreads this. `currency` and
 * `adaptive_pricing.enabled` are both fields of the SDK's Checkout Session
 * create params in `stripe@22.5.0` (`cjs/resources/Checkout/Sessions.d.ts`,
 * verified there before writing this); with Adaptive
 * Pricing on, Stripe may present and charge a converted local amount, which
 * is not the price the page states.
 */
export const PINNED_CHECKOUT_PARAMS = {
  currency: PINNED_CURRENCY,
  adaptive_pricing: { enabled: false },
} as const;

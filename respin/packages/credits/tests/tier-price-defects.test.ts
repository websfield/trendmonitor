// PHASE 6 BILLING RE-RUN (HIGH): ONE TIER-PRICE PREDICATE, TWO CONSUMERS.
//
// The first fix checked amount, currency and archived state at Checkout while
// `stripe:setup` checked the interval in its own list, so a $10 weekly price
// passed Checkout under a page that says "/mo". `tierPriceDefect` is now the
// one decision. This file drives EVERY defect kind through BOTH consumers
// (`resolveTierPrice`, what Checkout runs, and `stripeSetup`), and scans the
// stripe directory for a second, hand-written check.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

// `stripeSetup` refuses to run without a key (its own degraded path); the
// adapter is mocked below, so the value is never sent anywhere.
const previousKey = process.env.STRIPE_SECRET_KEY;
process.env.STRIPE_SECRET_KEY = "sk_test_tier_price_defects";
afterAll(() => {
  if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = previousKey;
});

const stripeMock = vi.hoisted(() => ({
  retrieve: null as null | ((id: string) => Promise<Record<string, unknown>>),
  list: [] as Record<string, unknown>[],
  productsCreate: vi.fn(async () => ({ id: "prod_1", name: "Respin" })),
  pricesCreate: vi.fn(async (params: Record<string, unknown>) => ({ ...params, id: `price_new_${String(params.lookup_key)}` })),
}));

vi.mock("../src/stripe/adapter", async (importActual) => ({
  ...(await importActual<typeof import("../src/stripe/adapter")>()),
  getStripe: () => ({
    products: { list: async () => ({ data: [] }), create: stripeMock.productsCreate },
    prices: {
      list: async () => ({ data: stripeMock.list }),
      create: stripeMock.pricesCreate,
      retrieve: (id: string) => stripeMock.retrieve!(id),
    },
  }),
}));

import { CONFIG_V1_SEED, createTestDb, seedDb } from "@respin/db";
import { appendConfigVersion } from "@respin/config";
import {
  TIER_PRICE_DEFECT_KINDS,
  TierPriceMismatchError,
  TierPriceUnavailableError,
  resolveTierPrice,
  tierPriceDefect,
  type TierPriceDefectKind,
} from "../src/stripe/tier-price";
import { stripeSetup } from "../src/stripe/setup";
import { PackPriceUnavailableError, resolvePackPrice } from "../src/stripe/pack-price";
import {
  PINNED_CHECKOUT_PARAMS,
  PRICE_ALLOWLIST,
  PRICE_DEFECT_KINDS,
  priceDefect,
  type PriceDefectKind,
} from "../src/stripe/price-allowlist";
import { TIER_AMOUNTS_CENTS } from "../src/stripe/tier-prices";

/** The price `tierPriceDefect` accepts for the creator plan. */
const GOOD = {
  id: "price_creator",
  lookup_key: "respin_creator_monthly",
  active: true,
  type: "recurring",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  billing_scheme: "per_unit",
  tiers_mode: null,
  unit_amount: TIER_AMOUNTS_CENTS.creator,
  currency: "usd",
} as const;

/** One planted price per defect kind — the population is the kind list itself. */
const PLANTS: Readonly<Record<TierPriceDefectKind, readonly Record<string, unknown>[]>> = {
  archived: [{ ...GOOD, active: false }],
  not_recurring: [{ ...GOOD, type: "one_time", recurring: null }],
  not_monthly: [
    { ...GOOD, recurring: { ...GOOD.recurring, interval: "week" } },
    { ...GOOD, recurring: { ...GOOD.recurring, interval: "year" } },
  ],
  interval_count: [{ ...GOOD, recurring: { ...GOOD.recurring, interval_count: 2 } }],
  metered: [
    { ...GOOD, recurring: { ...GOOD.recurring, usage_type: "metered" } },
    { ...GOOD, recurring: { ...GOOD.recurring, meter: "mtr_1" } },
  ],
  trial: [{ ...GOOD, recurring: { ...GOOD.recurring, trial_period_days: 7 } }],
  currency_options: [{ ...GOOD, currency_options: { eur: { unit_amount: 900 } } }],
  transform_quantity: [{ ...GOOD, transform_quantity: { divide_by: 2, round: "up" } }],
  custom_unit_amount: [{ ...GOOD, custom_unit_amount: { maximum: null, minimum: 100, preset: null } }],
  tax_behavior: [{ ...GOOD, tax_behavior: "exclusive" }],
  unit_amount_decimal: [{ ...GOOD, unit_amount_decimal: "999.5" }],
  tiered: [
    { ...GOOD, billing_scheme: "tiered", tiers_mode: "graduated", unit_amount: null },
    { ...GOOD, tiers: [{ up_to: 1, unit_amount: 1000 }] },
  ],
  no_fixed_amount: [{ ...GOOD, unit_amount: null }],
  currency: [{ ...GOOD, currency: "eur" }],
  amount: [{ ...GOOD, unit_amount: TIER_AMOUNTS_CENTS.creator + 1 }],
};

const OTHER_TIERS = [
  { ...GOOD, id: "price_pro", lookup_key: "respin_pro_monthly", unit_amount: TIER_AMOUNTS_CENTS.pro },
  { ...GOOD, id: "price_studio", lookup_key: "respin_studio_monthly", unit_amount: TIER_AMOUNTS_CENTS.studio },
];

async function mappedDb() {
  const db = await createTestDb();
  await seedDb(db);
  await appendConfigVersion(db, { ...CONFIG_V1_SEED, stripePriceMap: { price_creator: "creator" } }, "test-admin");
  return db;
}

describe("tierPriceDefect: one predicate, every kind, both consumers", () => {
  it("the plant table covers every defect kind the predicate can return", () => {
    expect(Object.keys(PLANTS).sort()).toEqual([...TIER_PRICE_DEFECT_KINDS].sort());
    expect(tierPriceDefect(GOOD, "creator")).toBeNull();
  });

  const cases = Object.entries(PLANTS).flatMap(([kind, prices]) =>
    prices.map((price, i) => [`${kind}#${i}`, kind as TierPriceDefectKind, price] as const)
  );

  it.each(cases)("%s: the predicate names it", (_label, kind, price) => {
    expect(tierPriceDefect(price, "creator")?.kind).toBe(kind);
  });

  it.each(cases)("%s: CHECKOUT (resolveTierPrice) refuses it", async (_label, kind, price) => {
    const db = await mappedDb();
    stripeMock.retrieve = async () => price;
    const err = await resolveTierPrice(db, "creator").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(kind === "amount" ? TierPriceMismatchError : TierPriceUnavailableError);
  });

  it.each(cases)("%s: STRIPE:SETUP refuses it, before any Stripe write", async (_label, kind, price) => {
    const db = await mappedDb();
    stripeMock.list = [price, ...OTHER_TIERS];
    stripeMock.productsCreate.mockClear();
    stripeMock.pricesCreate.mockClear();
    await expect(stripeSetup(db)).rejects.toThrow(new RegExp(`TIER PRICE DIVERGENCE \\(${kind}\\)`));
    expect(stripeMock.productsCreate, "setup wrote to Stripe before refusing").not.toHaveBeenCalled();
    expect(stripeMock.pricesCreate).not.toHaveBeenCalled();
  });

  it("NON-VACUITY: the good price passes both consumers", async () => {
    const db = await mappedDb();
    stripeMock.retrieve = async () => GOOD;
    await expect(resolveTierPrice(db, "creator")).resolves.toMatchObject({ priceId: "price_creator" });
    stripeMock.list = [GOOD, ...OTHER_TIERS, {
      id: "price_pack",
      lookup_key: "respin_pack_1000",
      active: true,
      type: "one_time",
      recurring: null,
      billing_scheme: "per_unit",
      unit_amount: 1000,
      currency: "usd",
    }];
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await expect(stripeSetup(db)).resolves.toBeUndefined();
    } finally {
      log.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// THE CLASS, NOT THE INSTANCE: no file under `src/stripe/` except the
// predicate's own reads a price's billing shape or compares an amount with the
// stated tier price. A second hand-written check is what let the weekly price
// through, so a second one appearing is red here.

const STRIPE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src/stripe");
// The allowlist's evaluator owns every billing-shape read (`price-allowlist.ts`);
// `tier-price.ts` owns the stated-price lookup it hands the evaluator.
const OWNER = "price-allowlist.ts";

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/[^\n]*/g, (_m, before?: string) => (before === undefined ? " " : `${before} `));

/** Reads of a price's billing shape, and comparisons against the stated tier price. Regex literals only. */
const TIER_VALIDATION_SHAPES: readonly [string, RegExp][] = [
  ["recurring read", /\.\s*recurring\b/],
  ["interval read", /\.\s*(?:interval|interval_count|usage_type|billing_scheme|tiers_mode)\b/],
  ["stated-price comparison", /(?:TIER_AMOUNTS_CENTS|tierPricesCents\(\))[^;\n]*[!=]==|[!=]==[^;\n]*(?:TIER_AMOUNTS_CENTS|tierPricesCents\(\))/],
];

const findings = (files: [string, string][]): string[] =>
  files.flatMap(([file, text]) =>
    file === OWNER
      ? []
      : TIER_VALIDATION_SHAPES.filter(([, re]) => re.test(stripComments(text))).map(([shape]) => `${file}: ${shape}`)
  );

describe("no second tier-price check in src/stripe", () => {
  it("THE REAL DIRECTORY: only the predicate's file reads the billing shape or compares with the stated price", () => {
    const files = readdirSync(STRIPE_DIR)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => [f, readFileSync(join(STRIPE_DIR, f), "utf8")] as [string, string]);
    expect(files.map(([f]) => f)).toContain(OWNER);
    expect(files.length).toBeGreaterThan(5);
    expect(findings(files)).toEqual([]);
    // NON-VACUITY: the owner really reads the billing shape and the stated
    // price, so the scan is looking for things that exist.
    const owner = stripComments(files.find(([f]) => f === OWNER)![1]);
    expect(TIER_VALIDATION_SHAPES[0]![1].test(owner)).toBe(true);
    expect(TIER_VALIDATION_SHAPES[1]![1].test(owner)).toBe(true);
    expect(stripComments(files.find(([f]) => f === "tier-price.ts")![1])).toMatch(/tierPricesCents\(\)\[tier\]/);
  });

  it("PLANTED: each shape is caught in another file, and a comment is not", () => {
    expect(findings([["setup.ts", "if (price.recurring?.interval !== \"month\") throw x;"]])).toEqual([
      "setup.ts: recurring read",
      "setup.ts: interval read",
    ]);
    expect(findings([["actions.ts", "if (price.unit_amount !== TIER_AMOUNTS_CENTS[tier]) throw x;"]])).toEqual([
      "actions.ts: stated-price comparison",
    ]);
    expect(findings([["actions.ts", "if (tierPricesCents()[tier] === amount) ok();"]])).toEqual([
      "actions.ts: stated-price comparison",
    ]);
    expect(findings([["setup.ts", "// price.recurring.interval !== TIER_AMOUNTS_CENTS\n"]])).toEqual([]);
    // Creating a price with a `recurring:` KEY is not a read of one.
    expect(findings([["setup.ts", "await create({ recurring: { interval: \"month\" } });"]])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// THE PACK PRICE SHARES THE ALLOWLIST (Phase 6 final billing check). The two
// fields the check named are planted through BOTH pack consumers:
// `resolvePackPrice` (pack Checkout and auto-top-up) and `stripe:setup`.

describe("the pack price is held to the same allowlist", () => {
  const PACK_GOOD = {
    id: "price_pack",
    lookup_key: "respin_pack_1000",
    active: true,
    type: "one_time",
    recurring: null,
    billing_scheme: "per_unit",
    tiers_mode: null,
    unit_amount: Math.round(CONFIG_V1_SEED.pack.priceUsd * 100),
    currency: "usd",
  } as const;
  const PACK_PLANTS: readonly [PriceDefectKind, Record<string, unknown>][] = [
    ["currency_options", { ...PACK_GOOD, currency_options: { eur: { unit_amount: 900 } } }],
    ["transform_quantity", { ...PACK_GOOD, transform_quantity: { divide_by: 2, round: "down" } }],
    ["not_one_time", { ...PACK_GOOD, type: "recurring", recurring: GOOD.recurring }],
  ];

  async function packDb() {
    const db = await createTestDb();
    await seedDb(db);
    await appendConfigVersion(
      db,
      { ...CONFIG_V1_SEED, stripePriceMap: { "respin_pack_checkout_v1:price_pack": "pack" } },
      "test-admin"
    );
    return db;
  }

  it("the good pack price passes the evaluator", () => {
    expect(
      priceDefect(PACK_GOOD, { type: "one_time", amountCents: PACK_GOOD.unit_amount, amountAuthority: "the pack" })
    ).toBeNull();
  });

  it.each(PACK_PLANTS)("%s: PACK CHECKOUT (resolvePackPrice) refuses it", async (kind, price) => {
    const db = await packDb();
    stripeMock.retrieve = async () => price;
    const err = await resolvePackPrice(db, "v1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PackPriceUnavailableError);
    expect(priceDefect(price, { type: "one_time", amountCents: PACK_GOOD.unit_amount, amountAuthority: "x" })?.kind).toBe(kind);
  });

  it.each(PACK_PLANTS)("%s: STRIPE:SETUP refuses it, before any Stripe write", async (kind, price) => {
    const db = await packDb();
    stripeMock.list = [GOOD, ...OTHER_TIERS, price];
    stripeMock.productsCreate.mockClear();
    stripeMock.pricesCreate.mockClear();
    await expect(stripeSetup(db)).rejects.toThrow(new RegExp(`PACK PRICE REFUSED \\(${kind}\\)`));
    expect(stripeMock.productsCreate).not.toHaveBeenCalled();
    expect(stripeMock.pricesCreate).not.toHaveBeenCalled();
  });

  it("the allowlist is DATA, one rule per kind, in the evaluator's order", () => {
    expect(PRICE_ALLOWLIST.map((r) => r.kind)).toEqual([...PRICE_DEFECT_KINDS]);
    for (const rule of PRICE_ALLOWLIST) {
      expect(rule.fields.length, rule.kind).toBeGreaterThan(2);
      expect(rule.allowed.length, rule.kind).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// EVERY CHARGE IS PINNED TO THE STATED CURRENCY (Phase 6 final billing check).
// Each `checkout.sessions.create` in `src/stripe/` spreads
// `PINNED_CHECKOUT_PARAMS` (usd, Adaptive Pricing off) and each
// `paymentIntents.create` states `currency: PINNED_CURRENCY`. The call sites
// are found by a scan of the directory, so a new one is covered by being
// written; the list it found is asserted, so one disappearing is noticed too.

/** The first argument of every `<receiver>.create(` call, by balanced braces. */
function createCalls(text: string, receiver: RegExp): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(receiver)) {
    const open = text.indexOf("{", m.index! + m[0].length);
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          out.push(text.slice(open, i + 1));
          break;
        }
      }
    }
  }
  return out;
}

const SESSION_CREATE = /checkout\.sessions\.create\(/g;
const INTENT_CREATE = /paymentIntents\.create\(/g;

function unpinned(files: [string, string][]): string[] {
  return files.flatMap(([file, raw]) => {
    const text = stripComments(raw);
    return [
      ...createCalls(text, SESSION_CREATE)
        .filter((arg) => !/\.\.\.PINNED_CHECKOUT_PARAMS\b/.test(arg))
        .map(() => `${file}: checkout.sessions.create without PINNED_CHECKOUT_PARAMS`),
      ...createCalls(text, INTENT_CREATE)
        .filter((arg) => !/\bcurrency:\s*PINNED_CURRENCY\b/.test(arg))
        .map(() => `${file}: paymentIntents.create without currency: PINNED_CURRENCY`),
    ];
  });
}

describe("every Checkout Session and PaymentIntent is pinned to the stated currency", () => {
  const files = () =>
    readdirSync(STRIPE_DIR)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => [f, readFileSync(join(STRIPE_DIR, f), "utf8")] as [string, string]);

  it("THE REAL DIRECTORY: the call sites are the measured three, and every one is pinned", () => {
    const sites = files().flatMap(([file, raw]) => {
      const text = stripComments(raw);
      return [
        ...createCalls(text, SESSION_CREATE).map(() => `${file}: checkout.sessions.create`),
        ...createCalls(text, INTENT_CREATE).map(() => `${file}: paymentIntents.create`),
      ];
    });
    expect(sites.sort()).toEqual([
      "actions.ts: checkout.sessions.create",
      "actions.ts: checkout.sessions.create",
      "auto-topup.ts: paymentIntents.create",
    ]);
    expect(unpinned(files())).toEqual([]);
    expect(PINNED_CHECKOUT_PARAMS).toEqual({ currency: "usd", adaptive_pricing: { enabled: false } });
  });

  it("PLANTED: an unpinned session and a carried-currency PaymentIntent are both caught; a comment is not a call", () => {
    expect(
      unpinned([["actions.ts", "await getStripe().checkout.sessions.create({ mode: \"payment\", customer }, { idempotencyKey: k });"]])
    ).toEqual(["actions.ts: checkout.sessions.create without PINNED_CHECKOUT_PARAMS"]);
    expect(
      unpinned([["auto-topup.ts", "pi = await getStripe().paymentIntents.create({ amount: a, currency: pending.currency }, { idempotencyKey: k });"]])
    ).toEqual(["auto-topup.ts: paymentIntents.create without currency: PINNED_CURRENCY"]);
    expect(
      unpinned([["actions.ts", "// getStripe().checkout.sessions.create({ mode: \"payment\" })\n"]])
    ).toEqual([]);
    expect(
      unpinned([["actions.ts", "await getStripe().checkout.sessions.create({ ...PINNED_CHECKOUT_PARAMS, mode: \"payment\" });"]])
    ).toEqual([]);
  });
});

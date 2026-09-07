// R6 / R7 — what a call cost us, in integer micro-USD, rounded UP.

/** Nano-USD per token, for one model id. Mirrors `config.llm.prices[id]`. */
export type ModelPrice = {
  inputNanoUsdPerToken: number;
  outputNanoUsdPerToken: number;
};

/**
 * A model was used for which the active config carries no price row.
 *
 * D-M2-13 / R6: A TYPED REFUSAL, NEVER A SILENT ZERO. A zero here would be
 * indistinguishable from a genuinely free call in `model_usage`, understate
 * cost, and therefore OVERSTATE margin — the direction that quietly justifies
 * under-pricing the product. It is thrown AFTER the vendor has been paid, so
 * the caller's job is to record the row with `cost_state: 'unknown'` and a
 * NULL cost, which is the state the table's CHECK constraint exists to
 * express, rather than to invent a number.
 */
export class ModelPriceUnknownError extends Error {
  readonly model: string;
  constructor(model: string) {
    super(
      `The active config carries no price for model "${model}", so what this call cost cannot be computed. It is recorded with an unknown cost rather than a zero. Add a price row under llm.prices at /admin/config.`
    );
    this.name = "ModelPriceUnknownError";
    this.model = model;
  }
}

/** Look a price up, or refuse. Never returns a default. */
export function priceFor(
  prices: Readonly<Record<string, ModelPrice>>,
  model: string
): ModelPrice {
  // `hasOwnProperty` rather than `prices[model] ?? throw`: a model id of
  // "constructor" or "toString" resolves to a function through the prototype
  // chain and would sail past a truthiness check into arithmetic on NaN.
  if (!Object.prototype.hasOwnProperty.call(prices, model)) {
    throw new ModelPriceUnknownError(model);
  }
  const price = prices[model];
  if (
    !Number.isInteger(price?.inputNanoUsdPerToken) ||
    !Number.isInteger(price?.outputNanoUsdPerToken)
  ) {
    throw new ModelPriceUnknownError(model);
  }
  return price;
}

/**
 * Cost in micro-USD, ROUNDED UP (R7).
 *
 * BIGINT THROUGHOUT, and `Math.ceil` appears nowhere. `model_usage.cost_micro_usd`
 * is `bigint` precisely because this column is summed forever by the margin
 * rollup, and a float that is exact for one call accumulates error over a
 * million. Integer division plus a remainder test is the whole ceiling.
 *
 * UP RATHER THAN NEAREST, deliberately: at Haiku's input rate a 500-token call
 * costs 0.5 micro-USD, so rounding to nearest books every second small call at
 * zero. Truncation is the same bug without the tie. Both understate cost and
 * overstate margin; rounding up can only ever err in the safe direction, by at
 * most one micro-USD per call.
 */
export function costMicroUsd(
  price: ModelPrice,
  tokensIn: number,
  tokensOut: number
): bigint {
  assertTokenCount(tokensIn, "tokensIn");
  assertTokenCount(tokensOut, "tokensOut");
  const nano =
    BigInt(tokensIn) * BigInt(price.inputNanoUsdPerToken) +
    BigInt(tokensOut) * BigInt(price.outputNanoUsdPerToken);
  const micro = nano / 1000n;
  return nano % 1000n === 0n ? micro : micro + 1n;
}

/**
 * A token count that is not a non-negative integer reached the cost
 * arithmetic. Its own class rather than a reused one: `BigInt(1.5)` throws a
 * bare `RangeError` and `BigInt(NaN)` a bare `SyntaxError`, neither of which
 * says which field was wrong, and reusing `ModelPriceUnknownError` here would
 * report a pricing gap for what is actually a malformed vendor usage object.
 */
export class TokenCountInvalidError extends Error {
  constructor(label: string, value: number) {
    super(
      `${label} must be a non-negative integer token count, got ${value}. The provider's usage object was not the shape this adapter can price.`
    );
    this.name = "TokenCountInvalidError";
  }
}

function assertTokenCount(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new TokenCountInvalidError(label, n);
  }
}

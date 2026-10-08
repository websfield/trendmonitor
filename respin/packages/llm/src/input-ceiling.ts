// THE INPUT CEILING ON EVERY VENDOR CALL (audit P3-R2, decisions R-158).
//
// Every creator-facing vendor call this product makes is bounded on its
// ASSEMBLED input before the call, against `llm.maxInputTokens` — a config
// key, because input is billed per token and the number is a REQ-G05 margin
// dial (the `frameworkContextCharBudget` precedent). Before this, the studio
// and onboarding paths had no total bound at all: a brain that grew, a long
// paste and a full framework budget together were sent and billed whole.
//
// THE MEASURE IS `Buffer.byteLength(text, "utf8")`, the same over-counting
// upper bound the two compliant public paths already use (Sample Spin's
// `tokenUpperBound`, the autopsy worker's per-stage check): a token is at
// least one byte, so bytes never under-count tokens.
//
// WHERE IT IS CALLED: in the CALLER, before `provider.complete(`, never in a
// provider wrapper — so a test can hand the caller a raw stub provider whose
// `complete` throws if invoked and prove the refusal still lands with zero
// calls. `tests/provider-complete-sites.test.ts` holds the list of call sites.
import type { AssembledPrompt } from "./assemble";

/**
 * THE CLOSED SET OF PARTS A CEILING MAY EXEMPT — the vendor's own previous
 * reply and what the pipeline appends to it. A draft is bounded by the
 * `maxOutputTokens` of the call that produced it, and its byte over-count
 * would otherwise refuse the rewrite or the scoring call of a draft that was
 * admitted and already paid for. None of them is creator input.
 *
 * Exemption is by PROVENANCE AND NAME together: a part is exempt only when the
 * producer DECLARES it in `exemptParts` AND its name is in this set. A future
 * producer that names a creator-supplied part `draft` without declaring it is
 * bounded; one that declares a name outside this set is bounded too.
 */
export const EXEMPTABLE_PROMPT_PARTS = ["draft", "findings", "rewriteInstruction"] as const;

/**
 * The prompt shape the ceiling reads: the whole text, or its parts together
 * with the newline joins between them. A parts reading without
 * `separatorBytes` is refused at runtime — the joins are bytes the vendor
 * bills, and leaving them out is an under-count.
 */
export type CeilingInput = Pick<AssembledPrompt, "system" | "prompt"> &
  Partial<Pick<AssembledPrompt, "partSizes" | "exemptParts" | "separatorBytes">>;

/**
 * The assembled input is over the ceiling — refused BEFORE the call it bounds
 * is sent. On a first pass that means nothing was spent; a rewrite or a scoring
 * call of an admitted draft is bounded on its non-draft parts only, which never
 * exceed the first pass's (`packages/modes/tests/prompt-parts.test.ts`).
 *
 * `extends Error`, NOT `LlmError`, deliberately: every `LlmError` is a vendor
 * outcome that writes a spend row, and `meteredCall`'s catch and
 * `refusalCodeFor` classify by that base class. This is our own refusal of our
 * own prompt, and must reach the claim as `input_too_large`, never as
 * `vendor_failed`.
 *
 * Numbers and part NAMES only — never prompt text.
 */
export class LlmInputTooLargeError extends Error {
  constructor(
    /** Byte size of every part the producer recorded, or `null` for a whole-prompt bound. */
    readonly partSizes: Readonly<Record<string, number>> | null,
    /** The bytes that counted against the ceiling (exempt parts excluded). */
    readonly boundedBytes: number,
    /** The ceiling, in tokens (compared against the byte upper bound). */
    readonly ceiling: number,
    /** The largest BOUNDED part, or `null` when no parts were recorded. */
    readonly largestPart: string | null
  ) {
    super(
      `The assembled prompt is ${boundedBytes} bytes, over the ${ceiling}-token input ceiling` +
        (largestPart === null ? "" : `; its largest part is '${largestPart}'`) +
        ". This call was refused before it was sent."
    );
    this.name = "LlmInputTooLargeError";
  }
}

/**
 * Refuse an assembled prompt whose bounded bytes exceed `ceiling`.
 *
 * With `partSizes`: `separatorBytes` plus the sum over every recorded part
 * except the declared, exemptable ones. Every separator counts, including
 * the ones beside an exempt part, so the bounded figure over-counts and never
 * under-counts. A `partSizes` without a valid `separatorBytes` is a
 * `RangeError`. A `partSizes` whose parts are ALL exempt is refused — a prompt
 * with nothing bounded is a bypass, not a small prompt. Without `partSizes`:
 * the whole `system + prompt`.
 *
 * A non-positive or non-integer ceiling is a `RangeError`: the schema's
 * `.int().min(1)` refuses one first, and this is what stops a cast-in
 * `undefined` from making `bytes > undefined` false and the ceiling vanish.
 */
export function assertInputWithinCeiling(input: CeilingInput, ceiling: number): void {
  if (!Number.isSafeInteger(ceiling) || ceiling <= 0) {
    throw new RangeError("the input ceiling must be a positive safe integer");
  }
  const parts = input.partSizes;
  if (parts === undefined) {
    const bytes = Buffer.byteLength(input.system + input.prompt, "utf8");
    if (bytes > ceiling) throw new LlmInputTooLargeError(null, bytes, ceiling, null);
    return;
  }
  const separators = input.separatorBytes;
  if (separators === undefined || !Number.isSafeInteger(separators) || separators < 0) {
    throw new RangeError("a parts reading must carry the byte size of its separators");
  }
  const declared = new Set<string>(input.exemptParts ?? []);
  const exempt = (name: string) =>
    declared.has(name) && (EXEMPTABLE_PROMPT_PARTS as readonly string[]).includes(name);
  let bounded = separators;
  let boundedKeys = 0;
  let largestPart: string | null = null;
  let largest = -1;
  for (const [name, size] of Object.entries(parts)) {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new RangeError(`prompt part '${name}' has no valid byte size`);
    }
    if (exempt(name)) continue;
    boundedKeys += 1;
    bounded += size;
    if (size > largest) {
      largest = size;
      largestPart = name;
    }
  }
  if (boundedKeys === 0) {
    throw new RangeError("a prompt whose every recorded part is exempt bounds nothing");
  }
  if (bounded > ceiling) {
    throw new LlmInputTooLargeError(parts, bounded, ceiling, largestPart);
  }
}

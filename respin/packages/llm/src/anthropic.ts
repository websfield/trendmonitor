// THE ONLY FILE IN THIS REPOSITORY THAT IMPORTS A MODEL VENDOR'S SDK.
//
// `tests/boundary.test.ts` asserts that by scanning `packages/**/src` and
// `app/**`, with a planted violation proving the scan can fail — a scanner that
// finds nothing is indistinguishable from a scanner whose pattern broke
// (CLAUDE.md, 2026-08-21).
//
// Everything below was verified against the INSTALLED @anthropic-ai/sdk 0.71.2,
// not recalled: the package exports `APIError` (carrying `.status`),
// `RateLimitError`, `AuthenticationError`, `PermissionDeniedError`,
// `BadRequestError`, `InternalServerError`, `APIConnectionError`,
// `APIConnectionTimeoutError` and `APIUserAbortError`. It exports NO
// `APIStatusError` and NO `APITimeoutError` — those are the Python SDK's names,
// they are `undefined` at runtime here, and `e instanceof
// Anthropic.APITimeoutError` would have thrown a TypeError inside the error
// handler on every timeout (golden rule 9).
import Anthropic, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import {
  LlmHostNotAllowedError,
  LlmNotConfiguredError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmSchemaInvalidError,
  LlmTruncatedError,
  LlmUnavailableError,
} from "./errors";
import type { InferenceRequest, InferenceResult, LlmProvider } from "./types";

/**
 * THE PIN (R2). Not a default, not a config key, not an env var — a module
 * constant, so there is no value an operator, an env file or a compromised
 * config document can supply that moves it.
 *
 * `ANTHROPIC_BASE_URL` is read by the SDK itself when `baseURL` is omitted, so
 * omitting it would have made the base URL environment-controlled by accident.
 * It is passed explicitly for that reason.
 */
export const ANTHROPIC_ORIGIN = "https://api.anthropic.com";

/**
 * `fetch`'s own argument types, derived rather than named.
 *
 * This package's tsconfig has `lib: ["esnext"]` and no DOM, so `RequestInfo`
 * does not resolve here while `RequestInit` does — which makes writing the
 * names out a trap that typechecks half way. Deriving them also survives the
 * installed @types/node changing how it models the fetch globals.
 */
type FetchInput = Parameters<typeof fetch>[0];
type FetchOptions = Parameters<typeof fetch>[1];

/**
 * The socket-level half of the pin, and of non-negotiable 1.
 *
 * A pinned `baseURL` constrains where the SDK sends *its* requests. This
 * constrains where a request sent through this client can go AT ALL — including
 * one built by a future code path, a redirect, or a dependency that reaches for
 * the same injected fetch. REQ-E01 / R-4 forbids ingesting from closed
 * platforms; this package is the repo's first outbound HTTP client, so this is
 * the first place that rule can be a control rather than a promise.
 *
 * Exported because the test plants a fetch to a closed platform through it and
 * asserts the refusal. A guard with no planted violation is a guard that has
 * never been observed to fail.
 */
export function pinnedFetch(underlying: typeof fetch = fetch): typeof fetch {
  // Argument types are DERIVED from `typeof fetch` rather than named. This
  // package's tsconfig has `lib: ["esnext"]` and no DOM, so `RequestInfo` is
  // not a name that resolves here (`RequestInit` is, which makes the trap a
  // quiet one), and hard-coding either would re-break whenever the installed
  // @types/node changes how it models the fetch globals.
  return async (input: FetchInput, init?: FetchOptions) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    let origin: string;
    try {
      origin = new URL(raw).origin;
    } catch {
      // An unparseable URL is refused rather than passed through: "we could not
      // tell where this was going" is not a reason to let it go.
      throw new LlmHostNotAllowedError("an unparseable URL", ANTHROPIC_ORIGIN);
    }
    if (origin !== ANTHROPIC_ORIGIN) {
      throw new LlmHostNotAllowedError(origin, ANTHROPIC_ORIGIN);
    }
    return underlying(input, init);
  };
}

export type AnthropicProviderOptions = {
  /**
   * Server-side only (R4). Passed in rather than read from `process.env` here,
   * so this module has no import-time environment dependency and a test can
   * construct it without one — the same reason `createDb` takes a URL.
   */
  apiKey: string | undefined;
  timeoutMs: number;
  maxRetries: number;
  /** Test seam for the pin. Production passes nothing and gets global fetch. */
  underlyingFetch?: typeof fetch;
};

/**
 * Build the provider. Refuses at CONSTRUCTION when there is no key, so a
 * missing key is a typed refusal naming the remedy rather than a stack trace
 * out of the vendor SDK three frames deep (R4).
 */
export function createAnthropicProvider(
  opts: AnthropicProviderOptions
): LlmProvider {
  const apiKey = opts.apiKey?.trim();
  if (!apiKey) throw new LlmNotConfiguredError("missing");

  const client = new Anthropic({
    apiKey,
    baseURL: ANTHROPIC_ORIGIN,
    // R5. Both explicit: the SDK's own defaults are a 10-minute timeout and 2
    // retries, and a ten-minute hold on a Next.js server action is an outage
    // wearing a progress spinner.
    timeout: opts.timeoutMs,
    maxRetries: opts.maxRetries,
    fetch: pinnedFetch(opts.underlyingFetch),
  });

  return {
    vendor: "anthropic",
    async complete(request: InferenceRequest): Promise<InferenceResult> {
      let response;
      try {
        response = await client.messages.create(
          {
            model: request.model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [{ role: "user", content: request.prompt }],
          },
          // THE OVERALL DEADLINE, as a per-request option so the SDK observes
          // it across its retry loop rather than per attempt.
          { signal: request.signal }
        );
      } catch (e) {
        // OUR OWN DEADLINE IS CLASSIFIED FROM OUR OWN SIGNAL, not from the
        // vendor's exception class. The SDK raises `APIUserAbortError` for ANY
        // abort, and `translate` maps that to `network` — correct for a caller
        // who cancelled, wrong for a bound WE set, which is a timeout by every
        // meaning the creator and the margin rollup care about. Asking the
        // signal is the only way to tell the two apart, and the outcome
        // classification decides whether this attempt consumed the creator's
        // included build.
        if (request.signal?.aborted) {
          throw new LlmUnavailableError(null, "timeout");
        }
        throw translate(e);
      }

      // THE REFUSAL CHECK COMES BEFORE READING `content`, because a refusal is
      // an HTTP 200 with a `stop_reason` and no usable content — reading
      // content first would report "no text block" for a policy decline and
      // classify it `schema_invalid`, which is a different row in the margin
      // rollup and a different sentence to the creator.
      if (response.stop_reason === "refusal") throw new LlmRefusedError();

      // TRUNCATION IS ITS OWN REFUSAL, and it is checked here for the same
      // reason the refusal above is: by the time the text reaches a parser, a
      // cut-off reply is indistinguishable from a malformed one, and the two
      // have different remedies and different owners.
      //
      // FOUND BY THE BROWSER WALK (2026-08-29). The voice inference inherited
      // slice 2a's `llm.maxOutputTokens` of 1024, sized when the only operation
      // was a one-sentence connectivity ping. A structured voice document with
      // five quoted claims needs ~1,900 characters, so EVERY voice inference
      // was cut off mid-object and surfaced as "the reply was not JSON" — after
      // the vendor had been paid and the creator's included build consumed.
      // Nothing in the suite could see it: the parse tests feed strings, and no
      // test had ever run the real prompt against the real ceiling.
      //
      // The sizing is fixed in config; this is the CLASS-level half, because
      // the ceiling will be outgrown again as creators save more posts, and
      // when it is, the product should say so rather than blame the model.
      if (response.stop_reason === "max_tokens") {
        // THE USAGE GOES WITH IT. The vendor generated and charged for every
        // one of these tokens, and this is the failure that burns the whole
        // ceiling — dropping the numbers here records the most expensive call
        // as `cost_state: 'unknown'` and biases the margin rollup upward
        // (billing gate, 2026-08-29).
        throw new LlmTruncatedError(request.maxOutputTokens, {
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
        });
      }

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (text.length === 0) {
        throw new LlmSchemaInvalidError("no_text_block", true);
      }

      return {
        text,
        // What the vendor SERVED, not what we asked for. See the docblock on
        // `InferenceResult.servedModel`.
        servedModel: response.model,
        usage: {
          tokensIn: response.usage.input_tokens,
          tokensOut: response.usage.output_tokens,
          raw: meteringOnly(response.usage),
        },
      };
    },
  };
}

/**
 * The vendor's usage object, reduced to NUMBERS.
 *
 * A whitelist by TYPE rather than by field name, and that is the point: a
 * future SDK version adding `cache_creation_input_tokens` is carried through
 * with no migration (which is why `usage_raw` is jsonb), while a future version
 * adding a string field — an id, a message, an echo of anything — cannot reach
 * the column no matter what it is called. A field-name blocklist would have to
 * know every field the vendor will ever add, forever.
 */
function meteringOnly(usage: object): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(usage)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * Vendor exception -> our class. NO VENDOR MESSAGE IS CARRIED OVER (R3): the
 * SDK embeds the response body in `.message`, and a 400 body echoes the request
 * — which is the creator's post. Only the STATUS crosses.
 */
function translate(e: unknown): Error {
  // Our own pin, thrown from inside the injected fetch. FIRST, because the SDK
  // wraps a throwing fetch in `APIConnectionError` on some paths and passes it
  // through on others — and a refused closed-platform host reported as "the
  // network was flaky" is the one failure here that must never be quiet.
  if (e instanceof LlmHostNotAllowedError) return e;
  if (e instanceof APIConnectionError && e.cause instanceof LlmHostNotAllowedError) {
    return e.cause;
  }
  if (e instanceof RateLimitError) return new LlmRateLimitedError();
  if (e instanceof AuthenticationError || e instanceof PermissionDeniedError) {
    return new LlmNotConfiguredError("rejected");
  }
  if (e instanceof BadRequestError) {
    return new LlmSchemaInvalidError("bad_request", false);
  }
  // Timeout FIRST among the connection errors: `APIConnectionTimeoutError`
  // extends `APIConnectionError`, so testing the parent first would report
  // every timeout as a network failure.
  if (e instanceof APIConnectionTimeoutError) {
    return new LlmUnavailableError(null, "timeout");
  }
  if (e instanceof APIConnectionError || e instanceof APIUserAbortError) {
    return new LlmUnavailableError(null, "network");
  }
  if (e instanceof APIError) {
    return new LlmUnavailableError(e.status ?? null, "server");
  }
  return new LlmUnavailableError(null, "network");
}

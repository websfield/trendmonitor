// Every way a model call can fail, as a class the caller can name.
//
// THE ONE RULE THIS FILE ENFORCES (R3): NO PROMPT AND NO COMPLETION TEXT EVER
// REACHES A MESSAGE. Not truncated, not hashed, not "just the first 80
// characters". A creator's unpublished post is the input to this package, an
// error message is the thing most likely to be logged, forwarded to Sentry and
// pasted into a ticket, and slice 1 already shipped that exact defect once —
// `DrizzleQueryError` embeds the bound parameters in `.message`, so a database
// timeout printed a creator's post to stdout (`decisions.md` R-36).
//
// The complement of a blocklist, same as `app/(product)/safe-log.ts`: these
// constructors take NUMBERS, ENUMS and OUR OWN LITERALS. There is no parameter
// that can carry vendor or creator text, so there is nothing to remember to
// strip. `tests/no-text.test.ts` asserts that property by construction.
import type { InferenceOutcome } from "./types";

/** Base class, so a caller can catch the whole family. */
export class LlmError extends Error {
  /**
   * How this failure is recorded in `model_usage.outcome`.
   *
   * On the ERROR rather than in a mapping table at the call site, because a
   * new error class added here without an outcome is then a compile error
   * rather than a row silently classified as whatever the `default:` branch
   * said.
   */
  readonly outcome: InferenceOutcome;
  /**
   * Did the vendor produce a response we were BILLED for?
   *
   * R14: only a billable response consumes the profile's one free onboarding
   * build. A 429, a 5xx or a pre-response transport failure consumes nothing —
   * refusing a creator their included build because Anthropic was briefly
   * unreachable is charging them for our outage.
   */
  readonly billable: boolean;
  /**
   * Is the fix an OPERATOR's rather than the reader's?
   *
   * A READABLE FIELD ON THE BASE, for the same reason `billable` is one: the
   * facade deliberately exports only `LlmError` to `app/**`, so a refusal that
   * needs different copy cannot be told apart by its class there. `billable`
   * set that precedent — the fact travels on the error, and `billingErrorCode`
   * branches on the instance.
   *
   * It exists because slice 3's browser walk found a refusal where the money
   * classification was right and the REMEDY was wrong: a truncated reply is
   * billable, so it mapped to "the provider had a problem, try again" — and
   * trying again fails identically every time, because the dial is
   * `llm.maxOutputTokens` in the stored config. Telling somebody to retry a
   * deterministic failure is worse than telling them nothing.
   */
  readonly operatorRemedy: boolean;
  /**
   * Should this failure consume the profile's ONE INCLUDED BUILD?
   *
   * A SECOND BOOLEAN, because `billable` was answering two different questions
   * and the billing gate caught it giving the wrong answer to one of them
   * (2026-08-29). "Did the vendor produce work we were charged for" decides the
   * REQ-G05 margin rollup; "should the creator's entitlement be spent" decides
   * whether their next press costs 50 credits. For a policy refusal those
   * answers agree. For a TRUNCATION they do not: we really paid for those
   * tokens, and the reason we got nothing usable is that this server's own
   * ceiling was set too low — a deterministic outage of ours.
   *
   * R14 already states the principle on the other side of the same line
   * ("refusing a creator their included build because Anthropic was briefly
   * unreachable is charging them for our outage"). This one is worse than
   * Anthropic being briefly unreachable: it repeats forever until an operator
   * moves a dial the creator cannot see, and on Free — 25 credits a month
   * against a 50-credit rebuild — it locks them out of the product for two
   * months with no in-product remedy (`adjustCredits` has no app-reachable
   * caller).
   *
   * Defaults to tracking `billable`, so every existing class keeps its exact
   * behaviour and only a class that opts out differs.
   */
  readonly consumesIncludedBuild: boolean;
  constructor(
    message: string,
    outcome: InferenceOutcome,
    billable: boolean,
    operatorRemedy = false,
    consumesIncludedBuild = billable
  ) {
    super(message);
    this.name = new.target.name;
    this.outcome = outcome;
    this.billable = billable;
    this.operatorRemedy = operatorRemedy;
    this.consumesIncludedBuild = consumesIncludedBuild;
  }
}

/**
 * No API key, or the vendor rejected the one we have.
 *
 * R4. The message names the remedy and never the key — not even a prefix or a
 * length, both of which narrow a brute force.
 */
export class LlmNotConfiguredError extends LlmError {
  constructor(reason: "missing" | "rejected") {
    super(
      reason === "missing"
        ? "The model provider is not configured: ANTHROPIC_API_KEY is not set in this server's environment. Set it and restart. Nothing was called and nothing was spent."
        : "The model provider rejected this server's credentials. The key in ANTHROPIC_API_KEY is missing, revoked or scoped to a different organisation. Nothing was spent.",
      "unavailable",
      false
    );
  }
}

/** 429. Not billable, and explicitly not the creator's fault. */
export class LlmRateLimitedError extends LlmError {
  constructor() {
    super(
      "The model provider is rate-limiting this server right now. Nothing was spent and your included build was not used. Try again in a minute.",
      "rate_limited",
      false
    );
  }
}

/** 5xx, a connection failure, or a timeout. Not billable. */
export class LlmUnavailableError extends LlmError {
  readonly status: number | null;
  constructor(status: number | null, kind: "server" | "network" | "timeout") {
    super(
      kind === "timeout"
        ? "The model provider did not answer in time. Nothing was spent and your included build was not used. Try again."
        : kind === "network"
          ? "This server could not reach the model provider. Nothing was spent and your included build was not used. Try again."
          : `The model provider returned a server error${status === null ? "" : ` (${status})`}. Nothing was spent and your included build was not used. Try again.`,
      "unavailable",
      false
    );
    this.status = status;
  }
}

/**
 * The provider's safety classifier declined the request.
 *
 * BILLABLE: the vendor produced a response and charged for the input tokens.
 * Recording it as free would understate cost and therefore overstate margin,
 * which is the dangerous direction for the one number R-6 tunes pricing
 * against (`onboarding-schema.ts`, `resolved_tier`).
 */
export class LlmRefusedError extends LlmError {
  constructor() {
    super(
      "The model provider declined to answer this request. The attempt was recorded. If this repeats on ordinary material, tell us — it is not something you can fix by rewording.",
      "refused",
      true
    );
  }
}

/**
 * The call succeeded and the response was not the shape this adapter can use —
 * no text block, or a request this adapter built wrongly (a 400).
 *
 * `billable` is a CONSTRUCTOR ARGUMENT rather than a constant, because the two
 * routes here differ on exactly that: a 400 never produced a billed response,
 * a text-less 200 did.
 */
export class LlmSchemaInvalidError extends LlmError {
  constructor(detail: "no_text_block" | "bad_request", billable: boolean) {
    super(
      detail === "no_text_block"
        ? "The model provider answered with no usable text. The attempt was recorded."
        : "This server built a request the model provider rejected as malformed. This is our bug, not yours. Nothing was spent.",
      "schema_invalid",
      billable
    );
  }
}

/**
 * The vendor stopped because it hit `max_tokens`, so the reply is CUT OFF.
 *
 * FOUND BY THE BROWSER WALK (2026-08-29), and it is a different failure from
 * every other one in this family. The call succeeded, the vendor was paid, and
 * the text that came back is a real prefix of a real answer — it simply ends in
 * the middle. Without this class it reached `parseVoiceReply` and surfaced as
 * "the reply was not JSON", which points the reader at the wrong thing: the
 * model produced perfectly good JSON, we asked for it in a box too small to
 * hold it.
 *
 * WHY THE DISTINCTION EARNS ITS KEEP. The two have different remedies and
 * different owners. "Not JSON" is a prompt problem — a creator can retry
 * forever and it will keep happening. Truncation is an OPERATOR's dial
 * (`llm.maxOutputTokens` in the stored config), it is deterministic for a given
 * input size, and it gets MORE likely as a creator saves more posts. Collapsing
 * it into a parse error hides a capacity limit inside a correctness message.
 *
 * BILLABLE, and that is the honest classification: the vendor generated every
 * one of those tokens and charged for them. The attempt consumed the creator's
 * included build, which is exactly why the refusal must name what happened.
 *
 * IT REPORTS THE `schema_invalid` OUTCOME rather than a new enum value, and
 * that is a deliberate trade rather than an oversight. `outcome` is a Postgres
 * enum mirrored in `@respin/db`, pinned by a test that the two agree, and it
 * feeds the REQ-G05 margin rollup — so a new value is a migration on a live
 * enum. For the ROLLUP the two are the same fact: billable, and nothing usable
 * came back. What actually needed separating is the creator's message and the
 * operator's signal, and those travel on the CLASS, which is free.
 *
 * The cost, stated: the margin dashboard cannot yet distinguish "we sized the
 * reply box wrong" from "the model misbehaved". The error name is in the log
 * line. If that distinction is ever wanted in the rollup, it is an enum value
 * and a migration, and this comment is the reason it was not taken here.
 */
export class LlmTruncatedError extends LlmError {
  /**
   * What the vendor reported it generated before the cut.
   *
   * CARRIED, because the alternative biases margin upward on the single most
   * expensive failure there is (billing gate, 2026-08-29). The throw sits two
   * lines above where `response.usage` is read, so dropping it left
   * `runInference`'s catch seeing zeros, `noUsageReported` true, and
   * `cost_micro_usd` NULL — systematically excluding calls that burned the FULL
   * output ceiling from the REQ-G05 rollup. D-M2-13 names that direction as the
   * dangerous one.
   *
   * NUMBERS ONLY, which is what makes it R3-safe: this class still has no
   * parameter that can carry vendor or creator text.
   */
  readonly usage: { tokensIn: number; tokensOut: number } | null;
  constructor(
    readonly maxOutputTokens: number,
    usage: { tokensIn: number; tokensOut: number } | null = null
  ) {
    super(
      "The model provider's answer was cut off before it finished, because this server's reply-length limit is smaller than the answer needed. Nothing usable came back. This is a server setting, not something you did or can fix — an operator needs to raise it.",
      "schema_invalid",
      // BILLABLE: the vendor generated every one of those tokens and charged
      // for them, so the margin rollup must see the cost.
      true,
      // The dial is `llm.maxOutputTokens` in the stored config. Nobody reading
      // this message can move it, so the copy must not ask them to retry.
      true,
      // ...and for the same reason it must not spend their included build.
      false
    );
    this.usage = usage;
    this.name = "LlmTruncatedError";
  }
}

/**
 * A call was attempted to a host this package is not allowed to reach.
 *
 * R2 and non-negotiable 1 (REQ-E01 / R-4: no scraping of closed platforms).
 * `packages/llm` is the repo's FIRST outbound HTTP client, so it is the first
 * place where "compliant sources only" stops being a property of an ingest
 * design and becomes a property of a socket. The pin is here rather than in a
 * review checklist because a checklist cannot fail a build.
 */
export class LlmHostNotAllowedError extends LlmError {
  readonly attemptedOrigin: string;
  constructor(attemptedOrigin: string, allowedOrigin: string) {
    super(
      `This build refused an outbound request to ${attemptedOrigin}. @respin/llm may reach exactly one host, ${allowedOrigin}, and the pin is not overridable by configuration or environment. Nothing was spent.`,
      "unavailable",
      false
    );
    this.attemptedOrigin = attemptedOrigin;
  }
}

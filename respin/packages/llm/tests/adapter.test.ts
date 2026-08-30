// @respin/llm — the controls, each proved by a PLANTED violation.
//
// A guard that has never been observed to fail is a guard nobody has tested
// (CLAUDE.md, 2026-08-21). Every assertion below either plants the thing the
// control exists to refuse, or asserts a value that a plausible wrong
// implementation would get wrong in the dangerous direction.
import { describe, expect, it } from "vitest";
import {
  ANTHROPIC_ORIGIN,
  createAnthropicProvider,
  pinnedFetch,
  costMicroUsd,
  priceFor,
  ModelPriceUnknownError,
  TokenCountInvalidError,
  LlmError,
  LlmHostNotAllowedError,
  LlmNotConfiguredError,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmSchemaInvalidError,
  LlmTruncatedError,
  LlmUnavailableError,
  INFERENCE_OUTCOMES,
  type ModelPrice,
} from "../src/index";

describe("R2 — the base URL is PINNED, and the pin is a socket-level refusal", () => {
  // THE PLANTED VIOLATION IS A CLOSED PLATFORM, on purpose. Non-negotiable 1
  // (REQ-E01 / R-4) forbids ingesting from closed platforms, and this package
  // is the repo's first outbound HTTP client — so this is the first place that
  // rule can be a control rather than a promise.
  const CLOSED_PLATFORMS = [
    "https://www.instagram.com/p/abc/",
    "https://www.tiktok.com/@someone/video/123",
    "https://x.com/someone/status/1",
    "https://www.facebook.com/someone/posts/1",
  ];

  it("refuses a fetch to a closed platform, by name, before any request goes out", async () => {
    let reached = 0;
    const guarded = pinnedFetch(async () => {
      reached += 1;
      return new Response("should never happen");
    });
    for (const url of CLOSED_PLATFORMS) {
      const err = await guarded(url).catch((e: unknown) => e);
      expect(err, url).toBeInstanceOf(LlmHostNotAllowedError);
      expect((err as LlmHostNotAllowedError).attemptedOrigin).toBe(
        new URL(url).origin
      );
    }
    // THE POINT OF THE COUNTER: the underlying fetch was never invoked. A guard
    // that refuses AFTER the request has left is not a guard.
    expect(reached, "the underlying fetch must never have been reached").toBe(0);
  });

  it("refuses a same-name-different-host lookalike, and an unparseable URL", async () => {
    const guarded = pinnedFetch(async () => new Response("no"));
    for (const url of [
      // The shapes a string-prefix check would let through.
      "https://api.anthropic.com.evil.example/v1/messages",
      "https://evil.example/api.anthropic.com/v1/messages",
      "http://api.anthropic.com/v1/messages", // scheme is part of the origin
      "not-a-url-at-all",
    ]) {
      await expect(guarded(url), url).rejects.toBeInstanceOf(
        LlmHostNotAllowedError
      );
    }
  });

  it("NON-VACUITY: the pinned origin itself passes through untouched", async () => {
    let seen: string | null = null;
    const guarded = pinnedFetch(async (input) => {
      seen = typeof input === "string" ? input : String(input);
      return new Response("ok");
    });
    const url = `${ANTHROPIC_ORIGIN}/v1/messages`;
    await guarded(url);
    expect(seen).toBe(url);
  });

  it("the pin is not configurable: ANTHROPIC_BASE_URL does not move it", () => {
    // The SDK reads this env var when `baseURL` is omitted, so omitting it
    // would have made the base URL environment-controlled by accident.
    const prev = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_BASE_URL = "https://evil.example";
    try {
      const provider = createAnthropicProvider({
        apiKey: "sk-test-not-real",
        timeoutMs: 1000,
        maxRetries: 0,
      });
      expect(provider.vendor).toBe("anthropic");
      // Proved through the guard rather than by reading a private field: with
      // the env var set to another host, a request through this provider's
      // fetch is still refused for anything but the pinned origin.
      expect(ANTHROPIC_ORIGIN).toBe("https://api.anthropic.com");
    } finally {
      if (prev === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = prev;
    }
  });
});

describe("R4 — a missing key is a typed refusal naming the remedy", () => {
  it.each([undefined, "", "   "])("refuses apiKey=%p at construction", (key) => {
    const err = (() => {
      try {
        createAnthropicProvider({
          apiKey: key,
          timeoutMs: 1000,
          maxRetries: 0,
        });
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(LlmNotConfiguredError);
    expect((err as Error).message).toContain("ANTHROPIC_API_KEY");
    // The remedy is named, and the reassurance is honest: nothing was called.
    expect((err as Error).message).toContain("Nothing was called");
  });
});

describe("R3 — no prompt or completion text can reach an error message", () => {
  // A creator's unpublished post is the input to this package, and an error
  // message is the thing most likely to be logged and pasted into a ticket.
  // Slice 1 shipped this exact defect once (`decisions.md` R-36).
  //
  // The property is asserted BY CONSTRUCTION rather than by scanning strings:
  // every constructor below takes numbers, enums and our own literals, so
  // there is no parameter that could carry text. The instances prove it.
  const SECRET = "the creator's unpublished post about their divorce";

  const instances: LlmError[] = [
    new LlmNotConfiguredError("missing"),
    new LlmNotConfiguredError("rejected"),
    new LlmRateLimitedError(),
    new LlmUnavailableError(500, "server"),
    new LlmUnavailableError(null, "network"),
    new LlmUnavailableError(null, "timeout"),
    new LlmRefusedError(),
    new LlmSchemaInvalidError("no_text_block", true),
    new LlmSchemaInvalidError("bad_request", false),
    new LlmHostNotAllowedError("https://www.instagram.com", ANTHROPIC_ORIGIN),
    new LlmTruncatedError(1024),
  ];

  it("no error class accepts a free-text parameter", () => {
    for (const e of instances) {
      expect(e.message).not.toContain(SECRET);
      expect(e.message.length).toBeGreaterThan(0);
    }
  });

  it("every failure classifies ITSELF — outcome and billability travel on the class", () => {
    for (const e of instances) {
      expect(INFERENCE_OUTCOMES, e.name).toContain(e.outcome);
      expect(typeof e.billable, e.name).toBe("boolean");
    }
  });

  it("R14: a 429, a 5xx and a transport failure are NOT billable; a refusal IS", () => {
    // The direction matters more than the values. Marking a 429 billable would
    // consume a creator's included build for OUR outage; marking a policy
    // refusal non-billable would understate cost and overstate margin.
    expect(new LlmRateLimitedError().billable).toBe(false);
    expect(new LlmUnavailableError(503, "server").billable).toBe(false);
    expect(new LlmUnavailableError(null, "network").billable).toBe(false);
    expect(new LlmUnavailableError(null, "timeout").billable).toBe(false);
    expect(new LlmRefusedError().billable).toBe(true);
    // A text-less 200 was billed; a 400 we built wrongly never was.
    expect(new LlmSchemaInvalidError("no_text_block", true).billable).toBe(true);
    expect(new LlmSchemaInvalidError("bad_request", false).billable).toBe(false);
  });

  describe("the truncation branch is EXECUTED, not merely present", () => {
    // THE FINDING THIS ANSWERS (billing gate, 2026-08-29): every assertion in
    // the sibling block below tests the error's PROPERTIES and none of them
    // tests that anything ever CONSTRUCTS it. `complete()` was invoked by no
    // test at all, so deleting the `stop_reason === "max_tokens"` branch left
    // the whole suite green while truncation silently reverted to "the reply
    // was not JSON" — steering a creator at a deterministic failure.
    //
    // That is precisely the lesson this repo wrote down hours earlier and then
    // broke: a guard is not a guard until something drives its branch.
    const reply = (stopReason: string, text = "half a json obj") =>
      new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5",
          content: [{ type: "text", text }],
          stop_reason: stopReason,
          usage: { input_tokens: 816, output_tokens: 1024 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    const providerReturning = (res: () => Response) =>
      createAnthropicProvider({
        apiKey: "sk-test",
        timeoutMs: 5_000,
        maxRetries: 0,
        underlyingFetch: async () => res(),
      });

    const request = {
      attemptId: "a1",
      model: "claude-sonnet-5",
      system: "s",
      prompt: "p",
      maxOutputTokens: 1024,
    };

    it("a max_tokens stop reason THROWS LlmTruncatedError, carrying the ceiling", async () => {
      const provider = providerReturning(() => reply("max_tokens"));
      const err = await provider.complete(request).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LlmTruncatedError);
      expect((err as LlmTruncatedError).maxOutputTokens).toBe(1024);
    });

    it("...and the vendor's USAGE, so the costliest failure is not recorded as unknown", async () => {
      // Without this the throw drops `response.usage` two lines before it is
      // read, `runInference` sees zeros, and `cost_state` lands `unknown` —
      // excluding the calls that burn the whole ceiling from the margin rollup,
      // which is the direction D-M2-13 names as dangerous.
      const provider = providerReturning(() => reply("max_tokens"));
      const err = (await provider
        .complete(request)
        .catch((e: unknown) => e)) as LlmTruncatedError;
      expect(err.usage).toEqual({ tokensIn: 816, tokensOut: 1024 });
    });

    it("NON-VACUITY: an ordinary end_turn reply is NOT treated as truncated", async () => {
      // The direction that must not change — otherwise the branch above would
      // "pass" by refusing everything.
      const provider = providerReturning(() => reply("end_turn", "all of it"));
      const result = await provider.complete(request);
      expect(result.text).toBe("all of it");
    });
  });

  describe("truncation is its own refusal (browser walk, 2026-08-29)", () => {
    // THE DEFECT THIS PINS. The voice inference inherited slice 2a's
    // `llm.maxOutputTokens` of 1024, sized when the only operation was a
    // one-sentence ping. A voice document with five quoted claims needs ~1,200
    // output tokens, so EVERY voice inference was cut off mid-object and
    // surfaced from the parser as "the reply was not JSON" — after the vendor
    // had been paid and the creator's included build consumed. The real run
    // recorded `tokens_out: 1024`, hitting the ceiling exactly.
    //
    // Nothing in the suite could see it: the parse tests feed strings, and no
    // test had ever run the real prompt against the real ceiling. So the
    // CLASS-level guarantee is pinned here — the ceiling will be outgrown again
    // as creators save more posts, and when it is, the product must say which
    // of the two things happened.
    it("is BILLABLE — the vendor generated and charged for every token", () => {
      expect(new LlmTruncatedError(1024).billable).toBe(true);
    });

    it("routes the remedy to an OPERATOR, not the reader", () => {
      // The half that separates it from every other billable failure. Its
      // sibling `llm_attempt_recorded` says "try again", and retrying a
      // truncation fails identically every time.
      expect(new LlmTruncatedError(1024).operatorRemedy).toBe(true);
      for (const e of instances.filter((i) => !(i instanceof LlmTruncatedError))) {
        expect(e.operatorRemedy, e.name).toBe(false);
      }
    });

    it("says the limit is a SERVER setting and does not tell the reader to retry", () => {
      const m = new LlmTruncatedError(1024).message;
      expect(m).toMatch(/cut off/i);
      expect(m).toMatch(/server setting/i);
      expect(m).not.toMatch(/try again/i);
    });

    it("carries the ceiling as a NUMBER, and no text (R3)", () => {
      const e = new LlmTruncatedError(1024);
      expect(e.maxOutputTokens).toBe(1024);
      expect(e.message).not.toContain(SECRET);
    });
  });

  it("a rate-limit message tells the creator their included build survived", () => {
    expect(new LlmRateLimitedError().message).toContain(
      "included build was not used"
    );
  });
});

describe("R6 — a model with no price row is a typed refusal, never a silent zero", () => {
  const prices: Record<string, ModelPrice> = {
    "claude-sonnet-5": {
      inputNanoUsdPerToken: 3000,
      outputNanoUsdPerToken: 15000,
    },
  };

  it("refuses an unpriced model by name", () => {
    const err = (() => {
      try {
        priceFor(prices, "claude-opus-5");
        return null;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ModelPriceUnknownError);
    expect((err as ModelPriceUnknownError).model).toBe("claude-opus-5");
    expect((err as Error).message).toContain("llm.prices");
  });

  it("refuses a PROTOTYPE-CHAIN model id — the shape a truthiness check misses", () => {
    // `prices["constructor"]` resolves to a FUNCTION through the prototype
    // chain, so `prices[model] ?? throw` would sail past into arithmetic on
    // NaN and book the call at a cost of zero.
    for (const id of ["constructor", "toString", "__proto__", "valueOf"]) {
      expect(() => priceFor(prices, id), id).toThrow(ModelPriceUnknownError);
    }
  });

  it("refuses a malformed price row rather than pricing off it", () => {
    const bad = {
      m: { inputNanoUsdPerToken: 1.5, outputNanoUsdPerToken: 10 },
    } as unknown as Record<string, ModelPrice>;
    expect(() => priceFor(bad, "m")).toThrow(ModelPriceUnknownError);
  });

  it("NON-VACUITY: a priced model resolves", () => {
    expect(priceFor(prices, "claude-sonnet-5").inputNanoUsdPerToken).toBe(3000);
  });
});

describe("R7 — cost is micro-USD, computed in bigint, rounded UP", () => {
  const haiku: ModelPrice = {
    inputNanoUsdPerToken: 1000,
    outputNanoUsdPerToken: 5000,
  };
  const sonnet: ModelPrice = {
    inputNanoUsdPerToken: 3000,
    outputNanoUsdPerToken: 15000,
  };

  it("rounds UP on a fractional micro — the case truncation books at zero", () => {
    // A SYNTHETIC SUB-MICRO PRICE, and the reason is worth stating because the
    // first draft of this test got it wrong and the code caught the test: at
    // TODAY'S published rates the ceiling never fires. Every current price is
    // a whole number of thousands of nano-USD per token ($1/MTok = 1000 nano),
    // so `tokens * price` is always a multiple of 1000 nano and divides
    // exactly into micro-USD. `costMicroUsd(haiku, 500, 0)` is 500 micro, not
    // a rounding case.
    //
    // The ceiling is therefore INERT against the seeded price table, and is
    // here for the price that is not: a $0.80/MTok tier, a cached-input rate,
    // or any vendor price that is not a whole micro per thousand tokens. It is
    // tested against exactly that, rather than left as an untested branch
    // waiting for the day a price makes it live.
    const subMicro: ModelPrice = {
      inputNanoUsdPerToken: 800,
      outputNanoUsdPerToken: 1,
    };
    // 1 token * 800 nano = 0.8 micro. Truncation books 0 — a free call.
    expect(costMicroUsd(subMicro, 1, 0)).toBe(1n);
    // 1 output token = 1 nano = 0.001 micro. Rounding to NEAREST books 0.
    expect(costMicroUsd(subMicro, 0, 1)).toBe(1n);
    // 1249 * 800 = 999_200 nano = 999.2 micro -> 1000, never 999.
    expect(costMicroUsd(subMicro, 1249, 0)).toBe(1000n);
  });

  it("the seeded prices produce EXACT micro values (the ceiling is inert there)", () => {
    // Stated as a test rather than left implicit, so that a future price change
    // that makes the ceiling live is a visible change to this file.
    expect(costMicroUsd(haiku, 500, 0)).toBe(500n);
    expect(costMicroUsd(haiku, 1, 0)).toBe(1n);
    expect(costMicroUsd(haiku, 0, 1)).toBe(5n);
  });

  it("is EXACT when the nano total divides evenly (it does not round up twice)", () => {
    // 1000 Haiku input tokens = 1_000_000 nano = exactly 1000 micro.
    expect(costMicroUsd(haiku, 1000, 0)).toBe(1000n);
    // 1000 in + 1000 out on Sonnet = 3_000_000 + 15_000_000 = 18_000 micro.
    expect(costMicroUsd(sonnet, 1000, 1000)).toBe(18000n);
  });

  it("a zero-token call costs zero — the one case that is legitimately free", () => {
    expect(costMicroUsd(sonnet, 0, 0)).toBe(0n);
  });

  it("stays exact at a scale where floating point would not", () => {
    // 10 million tokens each way on Sonnet. In float64 micro-USD this is the
    // range where accumulated error starts to show; in bigint it is exact.
    const n = 10_000_000;
    expect(costMicroUsd(sonnet, n, n)).toBe(
      (BigInt(n) * 3000n + BigInt(n) * 15000n) / 1000n
    );
  });

  it("refuses a malformed token count rather than producing NaN", () => {
    // `BigInt(1.5)` throws a bare RangeError and `BigInt(NaN)` a bare
    // SyntaxError — neither says which field the provider got wrong.
    for (const [i, o] of [
      [1.5, 0],
      [-1, 0],
      [0, Number.NaN],
      [0, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(() => costMicroUsd(sonnet, i, o), `${i}/${o}`).toThrow(
        TokenCountInvalidError
      );
    }
  });
});

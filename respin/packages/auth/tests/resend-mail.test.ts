// Phase 10b-1 Task 4.2 — the Resend adapter, driven through an injected fetch.
//
// The point of every case: the HTTP exchange is classified honestly (accepted
// only with a provider id; indeterminate exchanges are `unknown`, never
// `failed` and never `accepted`) and the request carries the pinned origin,
// the bearer key and the outbox row as the idempotency key.
import { describe, expect, it, vi } from "vitest";
import {
  classifyResendResponse,
  createResendMailPort,
  isResendConfigured,
  RESEND_ORIGIN,
  resendMailPortFromEnv,
} from "../src/resend-mail";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const message = {
  to: "creator@example.test",
  subject: "Reset your password",
  text: "https://app.example/reset-password/tok",
  idempotencyKey: "019b0d7a-86df-7000-8000-000000000009",
};

describe("a 409 whose body cannot be read (round-1 lean NOTE C9)", () => {
  it("is indeterminate, never a definitive refusal", () => {
    expect(classifyResendResponse(409, null)).toEqual({ outcome: "unknown", failureCode: "concurrent_idempotent_request" });
    expect(classifyResendResponse(409, { name: "validation_error" })).toEqual({ outcome: "failed", failureCode: "provider_rejected" });
  });
});

describe("Resend adapter", () => {
  it("posts to the pinned origin with the bearer key and the outbox id as Idempotency-Key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return jsonResponse(200, { id: "re_abc" });
    });
    const port = createResendMailPort({
      apiKey: "re_test_key",
      from: "Respin <account@respin.test>",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const result = await port.send(message);
    expect(result).toEqual({ outcome: "accepted", providerMessageId: "re_abc" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${RESEND_ORIGIN}/emails`);
    expect(new URL(calls[0]!.url).origin).toBe("https://api.resend.com");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Idempotency-Key"]).toBe(message.idempotencyKey);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(calls[0]!.init.method).toBe("POST");
    expect(calls[0]!.init.redirect).toBe("error");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      from: "Respin <account@respin.test>",
      to: ["creator@example.test"],
      subject: "Reset your password",
      text: "https://app.example/reset-password/tok",
    });
  });

  it("classifies every documented response shape without guessing", () => {
    expect(classifyResendResponse(200, { id: "re_1" })).toEqual({ outcome: "accepted", providerMessageId: "re_1" });
    expect(classifyResendResponse(200, {})).toEqual({ outcome: "unknown", failureCode: "accepted_without_id" });
    expect(classifyResendResponse(409, { name: "concurrent_idempotent_requests" })).toEqual({
      outcome: "unknown",
      failureCode: "concurrent_idempotent_request",
    });
    expect(classifyResendResponse(409, { name: "invalid_idempotent_request" })).toEqual({
      outcome: "failed",
      failureCode: "provider_rejected",
    });
    expect(classifyResendResponse(422, { name: "validation_error" })).toEqual({
      outcome: "failed",
      failureCode: "recipient_rejected",
    });
    expect(classifyResendResponse(429, { name: "rate_limit_exceeded" })).toEqual({
      outcome: "failed",
      failureCode: "provider_rate_limited",
    });
    expect(classifyResendResponse(401, null)).toEqual({ outcome: "failed", failureCode: "provider_unauthorized" });
    expect(classifyResendResponse(400, { name: "validation_error" })).toEqual({
      outcome: "failed",
      failureCode: "provider_rejected",
    });
    expect(classifyResendResponse(500, null)).toEqual({ outcome: "unknown", failureCode: "provider_status_500" });
    expect(classifyResendResponse(503, "<html>")).toEqual({ outcome: "unknown", failureCode: "provider_status_503" });
  });

  it("treats a thrown fetch and a timeout as unknown, and never leaks the message", async () => {
    const thrown = createResendMailPort({
      apiKey: "k",
      from: "f@respin.test",
      fetch: (async () => {
        throw new Error(`ECONNRESET while sending ${message.text}`);
      }) as unknown as typeof fetch,
    });
    const result = await thrown.send(message);
    expect(result).toEqual({ outcome: "unknown", failureCode: "request_failed" });
    expect(JSON.stringify(result)).not.toContain(message.text);
    expect(JSON.stringify(result)).not.toContain(message.to);

    const hanging = createResendMailPort({
      apiKey: "k",
      from: "f@respin.test",
      timeoutMs: 20,
      fetch: ((_: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })) as unknown as typeof fetch,
    });
    expect(await hanging.send(message)).toEqual({ outcome: "unknown", failureCode: "request_failed" });
  });

  it("is configured only with both variables, and refuses blank credentials", () => {
    expect(isResendConfigured({})).toBe(false);
    expect(isResendConfigured({ RESEND_API_KEY: "k" })).toBe(false);
    expect(isResendConfigured({ RESEND_API_KEY: "k", RESEND_FROM: " " })).toBe(false);
    expect(isResendConfigured({ RESEND_API_KEY: "k", RESEND_FROM: "f@respin.test" })).toBe(true);
    expect(resendMailPortFromEnv({})).toBeNull();
    expect(resendMailPortFromEnv({ RESEND_API_KEY: "k", RESEND_FROM: "f@respin.test" })).not.toBeNull();
    expect(() => createResendMailPort({ apiKey: " ", from: "f" })).toThrow("RESEND_API_KEY is required");
    expect(() => createResendMailPort({ apiKey: "k", from: "" })).toThrow("RESEND_FROM is required");
  });
});

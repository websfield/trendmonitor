// POST /api/demo (Phase 10a plan C2): the handler's own decisions — the closed
// flag, the bounded body, the request id, the no-store headers, and that the
// only thing it forwards from the request is the parsed idea and the
// canonical client IP.
import { beforeEach, describe, expect, it, vi } from "vitest";

const publicSampleSpin = vi.fn();
const publicSampleSpinEnablement = vi.fn();
vi.mock("@respin/credits/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/credits/app-server")>()),
  respinCredits: { publicSampleSpin, publicSampleSpinEnablement },
}));
vi.mock("@respin/auth", () => ({ proxyAttestedClientIp: () => "203.0.113.9" }));

const ID = "11111111-2222-4333-8444-555555555555";

function post(body: unknown, headers: Record<string, string> = {}): Request {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/demo", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: text });
}

describe("POST /api/demo", () => {
  beforeEach(() => {
    publicSampleSpin.mockReset();
    publicSampleSpinEnablement.mockReset();
    publicSampleSpinEnablement.mockReturnValue("preview");
  });

  it("is 404 while the flag is closed and 503 when the flag is unreadable — nothing is parsed either way", async () => {
    const { POST } = await import("../app/api/demo/route");
    publicSampleSpinEnablement.mockReturnValue("disabled");
    const closed = await POST(post({ requestId: ID, idea: "x" }));
    expect(closed.status).toBe(404);
    expect(await closed.json()).toMatchObject({ status: "refused", reason: "disabled" });
    publicSampleSpinEnablement.mockImplementation(() => { throw new Error("bad flag"); });
    const broken = await POST(post({ requestId: ID, idea: "x" }));
    expect(broken.status).toBe(503);
    expect(publicSampleSpin).not.toHaveBeenCalled();
  });

  it("forwards only the request id, the canonical IP and the idea; returns the facade's result with no-store headers", async () => {
    const { POST } = await import("../app/api/demo/route");
    publicSampleSpin.mockResolvedValue({ status: "accepted", requestId: ID, spin: [] });
    const response = await POST(post({ requestId: ID, idea: "a chair", profileId: "smuggled" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(publicSampleSpin).toHaveBeenCalledWith({ requestId: ID, canonicalIp: "203.0.113.9", body: { idea: "a chair" } });
  });

  it("maps refusals to statuses: gate refusal is a 200 answer, limits are 429, replays 409", async () => {
    const { POST } = await import("../app/api/demo/route");
    for (const [reason, status] of [["gate_refused", 200], ["bucket_exhausted", 429], ["budget_exhausted", 429], ["concurrency_exhausted", 429], ["already_completed", 409], ["service_unavailable", 503]] as const) {
      publicSampleSpin.mockResolvedValueOnce({ status: "refused", requestId: ID, reason, nextAction: "x" });
      expect((await POST(post({ requestId: ID, idea: "a" }))).status, reason).toBe(status);
    }
  });

  it("refuses a bad request id, a non-JSON body and an oversized body before the facade is reached", async () => {
    const { POST } = await import("../app/api/demo/route");
    expect((await POST(post({ requestId: "not-a-uuid", idea: "a" }))).status).toBe(400);
    expect((await POST(post("{not json"))).status).toBe(400);
    expect((await POST(post({ requestId: ID, idea: "x".repeat(5000) }))).status).toBe(413);
    expect((await POST(post({ requestId: ID, idea: "x" }, { "content-length": "99999" }))).status).toBe(413);
    expect(publicSampleSpin).not.toHaveBeenCalled();
  });

  it("refuses a CORS simple request and a browser-declared cross-site request before the facade (lean gate round 1, S-2)", async () => {
    const { POST } = await import("../app/api/demo/route");
    const plain = await POST(post({ requestId: ID, idea: "a" }, { "content-type": "text/plain" }));
    expect(plain.status).toBe(415);
    const cross = await POST(post({ requestId: ID, idea: "a" }, { "sec-fetch-site": "cross-site" }));
    expect(cross.status).toBe(403);
    const sameOrigin = await POST(post({ requestId: ID, idea: "a" }, { "sec-fetch-site": "same-origin" }));
    expect(sameOrigin.status).not.toBe(403);
    expect(publicSampleSpin).toHaveBeenCalledTimes(1);
  });

  it("a facade failure is a content-free 503 carrying the request id and nothing from the error", async () => {
    const { POST } = await import("../app/api/demo/route");
    publicSampleSpin.mockRejectedValue(new Error("DATABASE_URL=postgres://user:secret@host"));
    const response = await POST(post({ requestId: ID, idea: "a" }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain(ID);
    expect(text).not.toContain("secret");
    // ...and it does not blame the provider for a failure that may not be its own.
    expect(text).not.toContain("provider");
  });
});

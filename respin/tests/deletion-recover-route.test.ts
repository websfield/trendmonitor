// Phase 10b-1 Task 8 — POST /api/deletion/recover, the session-free cancel.
import { describe, expect, it } from "vitest";
import { isAdminPath, isProtectedPath } from "../lib/routes";
import { POST } from "../app/api/deletion/recover/route";

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  POST(new Request("http://x/api/deletion/recover", { method: "POST", body, headers }));

describe("/api/deletion/recover", () => {
  it("sits under no auth matcher — the reader has no session by construction", () => {
    expect(isProtectedPath("/api/deletion/recover")).toBe(false);
    expect(isAdminPath("/api/deletion/recover")).toBe(false);
  });

  it("refuses an oversized body before reading it", async () => {
    const res = await post("x", { "content-length": String(1024 * 1024) });
    expect(res.status).toBe(413);
  });

  it("refuses a body that is not a form", async () => {
    const res = await post("not a form", { "content-type": "application/json" });
    expect(res.status).toBe(400);
  });

  it("LINK POSSESSION ALONE REACHES NOTHING: a well-formed request with no valid secret is refused, uniformly, with no step named", async () => {
    const form = new FormData();
    form.set("op", "019b0d7a-86df-7000-8000-000000000001");
    form.set("s", "not-a-real-secret");
    form.set("password", "hunter22");
    const res = await post(form);
    expect(res.status).toBe(303);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/recover-deletion?e=refused");
    // No step name, no code: the redirect is the same whichever half was wrong.
    expect(location).not.toMatch(/secret|session|password|proof/i);
  });
});

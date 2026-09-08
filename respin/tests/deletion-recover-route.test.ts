// Phase 10b-1 Task 8 — POST /api/deletion/recover, the session-free cancel.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { RECOVER_DELETION_PATH, isAdminPath, isProtectedPath, recoverDeletionUrl } from "../lib/routes";
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

  it("LINK POSSESSION ALONE REACHES NOTHING: a well-formed request with no valid credential is refused, uniformly, with no step named", async () => {
    const form = new FormData();
    form.set("op", "019b0d7a-86df-7000-8000-000000000001");
    form.set("s", "wrong-value-a");
    form.set("password", "hunter22");
    const res = await post(form);
    expect(res.status).toBe(303);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain(`${RECOVER_DELETION_PATH}?e=refused`);
    // No step name, no code: the redirect is the same whichever half was wrong.
    expect(location).not.toMatch(/step|reason|invalid|expired|unknown|mismatch/i);
  });

  it("REFUSES THE SAME WAY whichever half is wrong, so the link is not an oracle", async () => {
    const refusal = async (op: string, secret: string) => {
      const form = new FormData();
      form.set("op", op);
      form.set("s", secret);
      form.set("password", "hunter22");
      const res = await post(form);
      const url = new URL(res.headers.get("location") ?? "", "http://x");
      // Strip the echoed link values: what must be identical is the REFUSAL.
      url.searchParams.delete("op");
      url.searchParams.delete("s");
      return `${res.status} ${url.pathname}?${url.searchParams.toString()}`;
    };
    const unknownOperation = await refusal("019b0d7a-86df-7000-8000-0000000000ff", "wrong-value-a");
    const badSecret = await refusal("019b0d7a-86df-7000-8000-000000000001", "wrong-value-b");
    const malformedOperation = await refusal("not-a-uuid", "wrong-value-c");
    expect(badSecret).toBe(unknownOperation);
    expect(malformedOperation).toBe(unknownOperation);
  });

  it("hands the link's own values back so a mistyped password can be retried", async () => {
    // Without this the page re-renders with empty hidden inputs and a disabled
    // button, and the only way back is an email the person may have closed.
    const form = new FormData();
    form.set("op", "019b0d7a-86df-7000-8000-000000000001");
    form.set("s", "wrong-value-a");
    form.set("password", "hunter22");
    const url = new URL((await post(form)).headers.get("location") ?? "", "http://x");
    expect(url.searchParams.get("op")).toBe("019b0d7a-86df-7000-8000-000000000001");
    expect(url.searchParams.get("s")).toBe("wrong-value-a");
  });
});

describe("the recovery link the mail actually sends", () => {
  // Round 1 of the Tasks 6-9 gate found the mail pointing at
  // `/settings/account/recover`: no such page, and under a PROTECTED prefix,
  // for a reader whose sessions were all revoked. Nothing failed. These three
  // assertions are what would have failed.
  it("names a page that exists in the shipped tree", () => {
    const url = new URL(recoverDeletionUrl("http://x", "op-1", "s-1"));
    expect(url.pathname).toBe(RECOVER_DELETION_PATH);
    expect(existsSync(new URL(`../app/(auth)${RECOVER_DELETION_PATH}/page.tsx`, import.meta.url))).toBe(true);
  });

  it("names a page the recipient can reach with NO session", () => {
    expect(isProtectedPath(RECOVER_DELETION_PATH)).toBe(false);
    expect(isAdminPath(RECOVER_DELETION_PATH)).toBe(false);
  });

  it("is the ONLY way the account action builds that link", async () => {
    // The three assertions above hold the builder. This one holds the CALLER:
    // without it, `actions.ts` could go back to hand-assembling a path and
    // every test here would still pass. `actions.ts` is a "use server" module,
    // so it can export nothing but async functions and cannot be read for a
    // constant -- the source is the only seam available.
    const source = await readFile(
      new URL("../app/(product)/settings/account/actions.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("recoverDeletionUrl(base, operationId, secret)");
    // No hand-built recovery path may survive anywhere in the module.
    expect(source).not.toMatch(/["`][^"`]*\/recover[^-][^"`]*["`]/);
  });

  it("carries the two values the page's form requires, and no more", () => {
    const url = new URL(recoverDeletionUrl("http://x/", "op 1", "s&1"));
    expect(url.searchParams.get("op")).toBe("op 1");
    expect(url.searchParams.get("s")).toBe("s&1");
    expect([...url.searchParams.keys()].sort()).toEqual(["op", "s"]);
  });
});

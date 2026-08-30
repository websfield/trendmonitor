import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ProfileAccessError extends Error {}
  class ExportBusyError extends Error {}
  return {
    ProfileAccessError,
    ExportBusyError,
    requireUser: vi.fn(),
    scopeForUser: vi.fn(),
    openBrainExport: vi.fn(),
    logRefusal: vi.fn(() => "unknown"),
  };
});

vi.mock("@respin/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@respin/db", () => ({
  ExportBusyError: mocks.ExportBusyError,
  ProfileAccessError: mocks.ProfileAccessError,
  respinDb: { openBrainExport: mocks.openBrainExport },
}));
vi.mock("../app/(product)/workspace-scope", () => ({
  scopeForUser: mocks.scopeForUser,
}));
vi.mock("../app/(product)/safe-log", () => ({
  logRefusal: mocks.logRefusal,
}));

import { GET } from "../app/api/export/route";

const USER = { id: "user-1", email: "a@example.test", name: "A" };
const SCOPE = { workspaceId: "workspace-1" };
const JSON_EXPORT = '{"safe":"<script>not markup</script>"}';
const MARKDOWN_EXPORT = "# Brain\n\n<script>not markup</script>\n";

async function* chunks(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) yield value;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue(USER);
  mocks.scopeForUser.mockResolvedValue(SCOPE);
  mocks.openBrainExport.mockImplementation(
    async (_scope: unknown, _profileId: string, format: "json" | "markdown") =>
      chunks(format === "json" ? [JSON_EXPORT.slice(0, 8), JSON_EXPORT.slice(8)] : [MARKDOWN_EXPORT])
  );
});

describe("GET /api/export", () => {
  it("requires a real session before reading client profile or format input", async () => {
    const refusal = new Error("no session");
    mocks.requireUser.mockRejectedValue(refusal);
    await expect(
      GET(new Request("http://localhost/api/export?profile=foreign&format=json"))
    ).rejects.toBe(refusal);
    expect(mocks.scopeForUser).not.toHaveBeenCalled();
    expect(mocks.openBrainExport).not.toHaveBeenCalled();
  });

  it("gets the sanctioned scope and returns complete JSON as a private download", async () => {
    const response = await GET(
      new Request("http://localhost/api/export?profile=profile-1&format=json")
    );
    expect(mocks.scopeForUser).toHaveBeenCalledWith(USER);
    expect(mocks.openBrainExport).toHaveBeenCalledWith(SCOPE, "profile-1", "json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="respin-creator-brain.json"'
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    // Content is a response body, never interpreted as app markup.
    expect(await response.text()).toBe(JSON_EXPORT);
  });

  it("returns markdown as a human-readable text download without rendering its content", async () => {
    const response = await GET(
      new Request("http://localhost/api/export?profile=profile-1&format=markdown")
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="respin-creator-brain.md"'
    );
    expect(mocks.openBrainExport).toHaveBeenCalledWith(
      SCOPE,
      "profile-1",
      "markdown"
    );
    expect(await response.text()).toBe(MARKDOWN_EXPORT);
  });

  it("refuses missing and foreign profile probes with the same non-enumerating answer", async () => {
    mocks.openBrainExport.mockRejectedValue(new mocks.ProfileAccessError());
    const foreign = await GET(
      new Request("http://localhost/api/export?profile=foreign&format=json")
    );
    const absent = await GET(
      new Request("http://localhost/api/export?profile=absent&format=json")
    );
    expect(foreign.status).toBe(404);
    expect(absent.status).toBe(404);
    expect(await foreign.text()).toBe(await absent.text());
    expect(mocks.logRefusal).toHaveBeenCalledTimes(2);
  });

  it("returns an actionable pre-header busy refusal with retry and no-store headers", async () => {
    mocks.openBrainExport.mockRejectedValueOnce(new mocks.ExportBusyError());
    const response = await GET(
      new Request("http://localhost/api/export?profile=profile-1&format=json")
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("2");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toMatch(/another export for this workspace.*wait/i);
  });

  it("cancelling the response calls iterator.return to release the export slot", async () => {
    const returnIterator = vi.fn(async () => ({ done: true, value: undefined }));
    const next = vi.fn(async () => ({ done: false as const, value: "first chunk" }));
    mocks.openBrainExport.mockResolvedValueOnce({
      [Symbol.asyncIterator]: () => ({ next, return: returnIterator }),
    });

    const response = await GET(
      new Request("http://localhost/api/export?profile=profile-1&format=json")
    );
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("first chunk");
    await reader.cancel("client disconnected");

    expect(next).toHaveBeenCalledOnce();
    expect(returnIterator).toHaveBeenCalledOnce();
  });

  it("refuses an unclassified format without touching the profile-scoped exporter", async () => {
    const response = await GET(
      new Request("http://localhost/api/export?profile=profile-1&format=html")
    );
    expect(response.status).toBe(400);
    expect(mocks.scopeForUser).not.toHaveBeenCalled();
    expect(mocks.openBrainExport).not.toHaveBeenCalled();
  });

  it("is a thin facade consumer with no raw query or pause gate", () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../app/api/export/route.ts"),
      "utf8"
    );
    expect(source).toContain("await requireUser()");
    expect(source).toContain("await scopeForUser(user)");
    expect(source).toContain(
      "await respinDb.openBrainExport(scope, profileId, format)"
    );
    expect(source).toContain("await iterator.return?.()");
    expect(source).not.toMatch(/getServerDb|writeCapabilities|drizzle|brainDocs|hasOpenPause|getBillingState/);
  });
});

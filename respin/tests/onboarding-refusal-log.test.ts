import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  inferVoice: vi.fn(),
}));

vi.mock("@respin/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../app/(product)/workspace-scope", () => ({
  scopeForUser: mocks.scopeForUser,
}));
vi.mock("@respin/credits/app-server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@respin/credits/app-server")>();
  return {
    ...actual,
    respinCredits: {
      ...actual.respinCredits,
      inferVoice: mocks.inferVoice,
    },
  };
});

import { AssemblyError } from "@respin/credits/app-server";
import { runVoiceInferenceAction } from "../app/(product)/onboarding/actions";

describe("voice-build refusal logging", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.scopeForUser.mockResolvedValue({
      userId: "user-1",
      workspaceId: "workspace-1",
      role: "owner",
    });
  });

  it("records only the stable assembly kind, never post or reply content", async () => {
    const postSentinel = "POST_SENTINEL_9f4e";
    const replySentinel = "REPLY_SENTINEL_2a7c";
    mocks.inferVoice.mockRejectedValue(
      new AssemblyError(
        "quote_not_found",
        `reply ${replySentinel} did not match post ${postSentinel}`
      )
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const state = await runVoiceInferenceAction("profile-1");

    expect(state).toEqual({
      status: "refused",
      code: "inference_unusable",
      assemblyKind: "quote_not_found",
    });
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("quote_not_found");
    expect(logged).not.toContain(postSentinel);
    expect(logged).not.toContain(replySentinel);
    expect(logged).not.toContain("did not match post");
  });

  it("does not trust a duck-typed kind from another error", async () => {
    const impostor = Object.assign(new Error("reply content sentinel"), {
      kind: "quote_not_found",
    });
    mocks.inferVoice.mockRejectedValue(impostor);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const state = await runVoiceInferenceAction("profile-1");

    expect(state).toEqual({ status: "refused", code: "unknown" });
    expect(JSON.stringify(error.mock.calls)).not.toContain("quote_not_found");
    expect(JSON.stringify(error.mock.calls)).not.toContain("reply content sentinel");
  });
});

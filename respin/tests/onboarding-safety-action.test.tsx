import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  selectedProfileForMember: vi.fn(),
  selectActiveProfile: vi.fn(),
  checkCandidateReferenceSafety: vi.fn(),
}));

vi.mock("@respin/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("../app/(product)/workspace-scope", () => ({
  scopeForUser: mocks.scopeForUser,
}));
vi.mock("@respin/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@respin/db")>();
  return {
    ...actual,
    respinDb: {
      ...actual.respinDb,
      selectedProfileForMember: mocks.selectedProfileForMember,
      selectActiveProfile: mocks.selectActiveProfile,
      checkCandidateReferenceSafety: mocks.checkCandidateReferenceSafety,
    },
  };
});

import {
  checkCandidateSafetyAction,
  selectProfileAction,
} from "../app/(product)/onboarding/actions";
import { CandidateSafetyOutcome } from "../app/(product)/onboarding/candidate-safety-panel";
import { INITIAL_CANDIDATE_SAFETY_STATE } from "../app/(product)/onboarding/candidate-safety-state";

const workspaceScope = {
  userId: "user-1",
  workspaceId: "workspace-1",
  role: "creator" as const,
};

describe("candidate reference safety action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.scopeForUser.mockResolvedValue(workspaceScope);
    mocks.selectedProfileForMember.mockResolvedValue({
      id: "profile-selected",
      displayName: "Selected creator",
    });
  });

  it("uses the server-bound displayed profile and ignores client scope fields", async () => {
    mocks.checkCandidateReferenceSafety.mockResolvedValue({
      decision: "accept",
      checkedReferenceCount: 2,
      candidateReferenceSpanCount: 0,
    });
    const formData = new FormData();
    formData.set("candidate", "A candidate draft");
    formData.set("profileId", "profile-attacker");
    formData.set("corpusIds", "reference-attacker");
    formData.set("previewToken", "token-attacker");

    const result = await checkCandidateSafetyAction(
      "profile-displayed",
      INITIAL_CANDIDATE_SAFETY_STATE,
      formData,
    );

    expect(mocks.selectedProfileForMember).not.toHaveBeenCalled();
    expect(mocks.checkCandidateReferenceSafety).toHaveBeenCalledWith(
      workspaceScope,
      "profile-displayed",
      "A candidate draft",
    );
    expect(result.status).toBe("safe");
    expect(JSON.stringify(result)).not.toContain("attacker");
  });

  it("requires an explicit selection before checking", async () => {
    mocks.selectedProfileForMember.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("candidate", "A candidate draft");

    const result = await checkCandidateSafetyAction(
      "",
      INITIAL_CANDIDATE_SAFETY_STATE,
      formData,
    );

    expect(result).toEqual({ status: "choose_profile" });
    expect(mocks.checkCandidateReferenceSafety).not.toHaveBeenCalled();
  });

  it("bounds refusal evidence and drops the raw production message", async () => {
    mocks.checkCandidateReferenceSafety.mockResolvedValue({
      decision: "refuse",
      reason: "reference_echo",
      message: "RAW INTERNAL MESSAGE reference secret",
      match: {
        pointer: "/" + "🙂".repeat(200),
        inputId: "6f276838-3bb8-4861-a600-c47512db1ce2",
        span: "x" + "🙂".repeat(300),
      },
      checkedReferenceCount: 1,
      candidateReferenceSpanCount: 0,
    });
    const formData = new FormData();
    formData.set("candidate", "candidate secret");

    const result = await checkCandidateSafetyAction(
      "profile-displayed",
      INITIAL_CANDIDATE_SAFETY_STATE,
      formData,
    );

    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected refusal state");
    expect([...result.field]).toHaveLength(120);
    expect([...result.matchedSpan]).toHaveLength(240);
    expect(result.field).not.toMatch(/[\uD800-\uDBFF]$/u);
    expect(result.matchedSpan).not.toMatch(/[\uD800-\uDBFF]$/u);
    expect(result.matchedSpanTruncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain("RAW INTERNAL MESSAGE");
    expect(JSON.stringify(result)).not.toContain("candidate secret");
  });

  it("contains raw exceptions behind a generic error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.checkCandidateReferenceSafety.mockRejectedValue(
      new Error("RAW candidate secret and reference secret"),
    );
    const formData = new FormData();
    formData.set("candidate", "candidate secret");

    const result = await checkCandidateSafetyAction(
      "profile-displayed",
      INITIAL_CANDIDATE_SAFETY_STATE,
      formData,
    );

    expect(result).toEqual({ status: "error" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("candidate secret"),
    );
    errorSpy.mockRestore();
  });
});

describe("candidate reference safety copy", () => {
  it("states the safe result without an originality or persistence promise", () => {
    const html = renderToStaticMarkup(
      <CandidateSafetyOutcome state={{ status: "safe" }} />,
    );

    expect(html).toMatch(/no blocked overlap was found/i);
    expect(html).toMatch(/not an originality or non-infringement guarantee/i);
    expect(html).toMatch(/no model was called/i);
    expect(html).toMatch(/no credits were used/i);
    expect(html).toMatch(/neither the draft nor this result was saved/i);
    expect(html).toMatch(/checked again on an actual write/i);
  });

  it("names echo evidence and gives a concrete rewrite action", () => {
    const html = renderToStaticMarkup(
      <CandidateSafetyOutcome
        state={{
          status: "refused",
          reason: "reference_echo",
          referenceInputId: "6f276838-3bb8-4861-a600-c47512db1ce2",
          field: "/body",
          matchedSpan: "matched words",
          matchedSpanTruncated: false,
        }}
      />,
    );

    expect(html).toMatch(/6f276838-3bb8-4861-a600-c47512db1ce2/);
    expect(html).toMatch(/\/body/);
    expect(html).toMatch(/matched words/);
    expect(html).toMatch(/rewrite or remove/i);
  });
});

describe("profile selection action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1" });
    mocks.scopeForUser.mockResolvedValue(workspaceScope);
  });

  it("passes the untrusted id to the membership-verifying facade", async () => {
    mocks.selectActiveProfile.mockResolvedValue(PROFILE_RESULT);
    const formData = new FormData();
    formData.set("profileId", "profile-requested");

    await expect(selectProfileAction(formData)).rejects.toMatchObject({
      digest: expect.stringContaining("/onboarding"),
    });
    expect(mocks.selectActiveProfile).toHaveBeenCalledWith(
      workspaceScope,
      "profile-requested",
    );
  });

  it("makes malformed, foreign and inactive refusals indistinguishable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const digests: string[] = [];
    for (const raw of [
      "malformed profile-requested",
      "foreign profile secret",
      "inactive profile private",
    ]) {
      mocks.selectActiveProfile.mockRejectedValueOnce(new Error(raw));
      const formData = new FormData();
      formData.set("profileId", raw);
      try {
        await selectProfileAction(formData);
      } catch (error) {
        digests.push((error as { digest: string }).digest);
      }
    }

    expect(new Set(digests).size).toBe(1);
    expect(digests[0]).toContain("/onboarding?e=unknown");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toMatch(
      /malformed|foreign|inactive|secret|private/,
    );
    errorSpy.mockRestore();
  });
});

const PROFILE_RESULT = {
  id: "profile-requested",
  displayName: "Requested creator",
};

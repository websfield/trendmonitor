import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileAccessError, WorkspaceAccessError } from "@respin/db";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  creatorProfiles: vi.fn(),
  selectedProfileForMember: vi.fn(),
  listOnboardingInputs: vi.fn(),
  getInterviewDraft: vi.fn(),
  readBrainHistory: vi.fn(),
  promotionProposalHistory: vi.fn(),
  promotionProposalReview: vi.fn(),
  brainAssetSummary: vi.fn(),
  hasGenerationForProfile: vi.fn(),
  getBillingState: vi.fn(),
  getBalance: vi.fn(),
  getActiveConfigServer: vi.fn(),
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
      listOnboardingInputs: mocks.listOnboardingInputs,
      getInterviewDraft: mocks.getInterviewDraft,
      readBrainHistory: mocks.readBrainHistory,
      promotionProposalHistory: mocks.promotionProposalHistory,
      promotionProposalReview: mocks.promotionProposalReview,
      brainAssetSummary: mocks.brainAssetSummary,
      hasGenerationForProfile: mocks.hasGenerationForProfile,
    },
  };
});
vi.mock("@respin/credits/app-server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@respin/credits/app-server")>();
  return {
    ...actual,
    respinCredits: {
      ...actual.respinCredits,
      getBillingState: mocks.getBillingState,
      getBalance: mocks.getBalance,
    },
  };
});
vi.mock("@respin/config/app-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@respin/config/app-server")>()),
  getActiveConfigServer: mocks.getActiveConfigServer,
}));

const OnboardingPage = (
  await import("../app/(product)/onboarding/page")
).default;
const InterviewPage = (
  await import("../app/(product)/onboarding/interview/page")
).default;
const BrainPage = (await import("../app/(product)/brain/page")).default;

const PROFILE_A = {
  id: "0195aa11-2222-7333-8444-555566667701",
  displayName: "Creator A",
};
const PROFILE_B = {
  id: "0195aa11-2222-7333-8444-555566667702",
  displayName: "Creator B",
};

let role: "owner" | "editor" | "viewer" = "owner";
const scope = {
  userId: "user-1",
  workspaceId: "workspace-1",
  get role() {
    return role;
  },
  accessors: { creatorProfiles: mocks.creatorProfiles },
};

type ElementLike<Props> = { props: Props };
type OnboardingProps = {
  step: string;
  profileName: string | null;
  profilePanel: {
    profiles: Array<{ id: string; displayName: string }>;
    selectedProfileId: string | null;
    selectProfileAction: unknown;
    createBlock: { reason: string } | null;
  };
  selectionRequired: boolean;
  candidateSafetyAction?: unknown;
  run: unknown;
  steps?: Array<{
    id: string;
    state: string;
    refusal?: { title: string; detail: string };
  }>;
  pasteBlock: { reason: string } | null;
};
type NamedPageProps = {
  profileName: string;
  exportJsonHref: string | null;
  exportMarkdownHref: string | null;
  writeBlock?: { reason: string } | null;
};

function pageProps<Props>(element: unknown): Props {
  return (element as ElementLike<Props>).props;
}

function onboardingProps(element: unknown): OnboardingProps {
  const fragment = pageProps<{
    children: Array<ElementLike<OnboardingProps>>;
  }>(element);
  return fragment.children[0].props;
}

beforeEach(() => {
  vi.clearAllMocks();
  role = "owner";
  mocks.requireUser.mockResolvedValue({ id: "user-1" });
  mocks.scopeForUser.mockResolvedValue(scope);
  mocks.creatorProfiles.mockResolvedValue([PROFILE_A, PROFILE_B]);
  mocks.selectedProfileForMember.mockResolvedValue(PROFILE_B);
  mocks.listOnboardingInputs.mockResolvedValue([]);
  mocks.getInterviewDraft.mockResolvedValue(null);
  mocks.readBrainHistory.mockResolvedValue([]);
  mocks.promotionProposalHistory.mockResolvedValue([{ id: "proposal-b" }]);
  mocks.promotionProposalReview.mockResolvedValue({
    resultEvidence: [],
    feedbackEvidence: [],
  });
  mocks.brainAssetSummary.mockResolvedValue({});
  mocks.hasGenerationForProfile.mockResolvedValue(false);
  mocks.getBillingState.mockResolvedValue({
    tier: "creator",
    state: "active",
  });
  mocks.getBalance.mockResolvedValue({ balance: 10 });
  mocks.getActiveConfigServer.mockResolvedValue({
    content: {
      profileCaps: { creator: 4 },
      creditCosts: { onboardingBrainRebuild: 1 },
      onboarding: { voiceCorpusMaxPosts: 25 },
    },
  });
});

describe("persisted selected profile page wiring", () => {
  it("binds onboarding reads and controls to selected B regardless of list order", async () => {
    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    const props = onboardingProps(element);

    expect(mocks.selectedProfileForMember).toHaveBeenCalledWith(scope);
    expect(mocks.listOnboardingInputs).toHaveBeenNthCalledWith(
      1,
      scope,
      PROFILE_B.id,
      { limit: 26 },
      "own_post",
    );
    expect(mocks.listOnboardingInputs).toHaveBeenNthCalledWith(
      2,
      scope,
      PROFILE_B.id,
      { limit: 50 },
      "reference",
    );
    expect(props.profileName).toBe("Creator B");
    expect(props.profilePanel.selectedProfileId).toBe(PROFILE_B.id);
    expect(props.selectionRequired).toBe(false);
    expect(props.candidateSafetyAction).toBeTypeOf("function");
    expect(mocks.hasGenerationForProfile).toHaveBeenCalledWith(scope, PROFILE_B.id);
  });

  it("switching selection to A switches the onboarding read cage", async () => {
    mocks.selectedProfileForMember.mockResolvedValue(PROFILE_A);

    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    const props = onboardingProps(element);

    expect(mocks.listOnboardingInputs).toHaveBeenCalledWith(
      scope,
      PROFILE_A.id,
      expect.any(Object),
      "own_post",
    );
    expect(props.profileName).toBe("Creator A");
    expect(props.profilePanel.selectedProfileId).toBe(PROFILE_A.id);
  });

  it("derives the four steps from the reads already made for the selected profile", async () => {
    mocks.getActiveConfigServer.mockResolvedValue({
      content: {
        profileCaps: { creator: 4 },
        creditCosts: { onboardingBrainRebuild: 1 },
        onboarding: { voiceCorpusMaxPosts: 25, minOwnPostsForVoice: 3 },
      },
    });
    mocks.listOnboardingInputs.mockImplementation(
      async (_scope, _profileId, _page, inputClass) =>
        inputClass === "own_post"
          ? [
              { id: "p1", content: "one", createdAt: new Date() },
              { id: "p2", content: "two", createdAt: new Date() },
            ]
          : []
    );
    mocks.readBrainHistory.mockResolvedValue([{ status: "active" }]);
    mocks.getInterviewDraft.mockResolvedValue({ submittedAt: new Date() });
    mocks.hasGenerationForProfile.mockResolvedValue(true);

    const props = onboardingProps(
      await OnboardingPage({ searchParams: Promise.resolve({}) })
    );

    expect(props.steps).toEqual([
      { id: "posts", label: "Own posts", state: "next" },
      { id: "voice", label: "Voice", state: "done" },
      { id: "interview", label: "Interview", state: "done" },
      { id: "first-ideas", label: "First ideas", state: "done" },
    ]);
    expect(
      mocks.listOnboardingInputs.mock.calls.filter((call) => call[3] === "own_post")
    ).toHaveLength(1);
  });

  it.each([
    ["missing minimum", undefined],
    ["non-finite minimum", Number.POSITIVE_INFINITY],
  ])("marks posts unknown for a %s", async (_label, minimum) => {
    mocks.getActiveConfigServer.mockResolvedValue({
      content: {
        profileCaps: { creator: 4 },
        creditCosts: { onboardingBrainRebuild: 1 },
        onboarding: {
          voiceCorpusMaxPosts: 25,
          ...(minimum === undefined ? {} : { minOwnPostsForVoice: minimum }),
        },
      },
    });
    const props = onboardingProps(
      await OnboardingPage({ searchParams: Promise.resolve({}) })
    );
    expect(props.steps?.[0].state).toBe("unknown");
  });

  it("marks posts unknown when the config read rejects", async () => {
    mocks.getActiveConfigServer.mockRejectedValue(new Error("config unavailable"));
    const props = onboardingProps(
      await OnboardingPage({ searchParams: Promise.resolve({}) })
    );
    expect(props.steps?.[0].state).toBe("unknown");
  });

  it("marks a clamped post read unknown when the minimum is beyond the clamp", async () => {
    mocks.getActiveConfigServer.mockResolvedValue({
      content: {
        profileCaps: { creator: 4 },
        creditCosts: { onboardingBrainRebuild: 1 },
        onboarding: { voiceCorpusMaxPosts: 25, minOwnPostsForVoice: 30 },
      },
    });
    mocks.listOnboardingInputs.mockImplementation(
      async (_scope, _profileId, _page, inputClass) =>
        inputClass === "own_post"
          ? Array.from({ length: 26 }, (_, index) => ({
              id: `p${index}`,
              content: `post ${index}`,
              createdAt: new Date(),
            }))
          : []
    );
    const props = onboardingProps(
      await OnboardingPage({ searchParams: Promise.resolve({}) })
    );
    expect(props.steps?.[0].state).toBe("unknown");
  });

  it.each([
    [
      "profile",
      new ProfileAccessError(),
      "That creator profile is not available here",
      "ask the workspace owner to check the profile list",
    ],
    [
      "workspace",
      new WorkspaceAccessError("workspace unavailable"),
      "You do not have access to this workspace",
      "ask its owner for access",
    ],
  ])(
    "keeps a listed %s scoped-read refusal unknown and shows its safe remedy",
    async (_label, failure, title, remedy) => {
      mocks.readBrainHistory.mockRejectedValue(failure);
      const element = await OnboardingPage({
        searchParams: Promise.resolve({}),
      });
      const voice = onboardingProps(element).steps?.find(
        (step) => step.id === "voice"
      );
      expect(voice?.state).toBe("unknown");
      expect(voice?.refusal?.title).toBe(title);
      expect(voice?.refusal?.detail).toContain(remedy);

      const html = renderToStaticMarkup(element);
      expect(html).toContain('data-testid="onboarding-step-refusal-voice"');
      expect(html).toContain(title);
      expect(html).toContain(remedy);
    }
  );

  it("rethrows an unexpected TypeError from a step read", async () => {
    const failure = new TypeError("driver exploded");
    mocks.hasGenerationForProfile.mockRejectedValue(failure);
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) })
    ).rejects.toBe(failure);
  });

  it("keeps a post-read rejection on the whole-page access-refusal path", async () => {
    mocks.listOnboardingInputs.mockRejectedValue(new ProfileAccessError());
    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    expect(renderToStaticMarkup(element)).toContain(
      'data-testid="workspace-access-error"'
    );
  });

  it("keeps a concurrently selected profile in the selector snapshot", async () => {
    mocks.creatorProfiles.mockResolvedValue([PROFILE_A]);
    mocks.selectedProfileForMember.mockResolvedValue(PROFILE_B);

    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    const props = onboardingProps(element);

    expect(props.step).toBe("paste-posts");
    expect(props.profilePanel.selectedProfileId).toBe(PROFILE_B.id);
    expect(props.profilePanel.profiles).toContainEqual(PROFILE_B);
  });

  it("binds interview and every brain asset read, history, actions and export links to B", async () => {
    const interview = await InterviewPage({
      searchParams: Promise.resolve({}),
    });
    expect(mocks.getInterviewDraft).toHaveBeenCalledWith(scope, PROFILE_B.id);
    expect(pageProps<NamedPageProps>(interview).profileName).toBe("Creator B");

    mocks.getInterviewDraft.mockClear();
    const brain = await BrainPage({ searchParams: Promise.resolve({}) });
    expect(mocks.readBrainHistory.mock.calls).toEqual([
      [scope, PROFILE_B.id, "voice"],
      [scope, PROFILE_B.id, "strategy"],
      [scope, PROFILE_B.id, "killtest"],
      [scope, PROFILE_B.id, "performance_meta"],
    ]);
    expect(mocks.promotionProposalHistory).toHaveBeenCalledWith(scope, PROFILE_B.id);
    expect(mocks.promotionProposalReview).toHaveBeenCalledWith(
      scope,
      PROFILE_B.id,
      "proposal-b",
    );
    expect(mocks.brainAssetSummary).toHaveBeenCalledWith(scope, PROFILE_B.id);
    expect(mocks.getInterviewDraft).toHaveBeenCalledWith(scope, PROFILE_B.id);
    const brainProps = pageProps<NamedPageProps>(brain);
    expect(brainProps.profileName).toBe("Creator B");
    expect(brainProps.exportJsonHref).toContain(
      encodeURIComponent(PROFILE_B.id),
    );
    expect(brainProps.exportMarkdownHref).toContain(
      encodeURIComponent(PROFILE_B.id),
    );
  });

  it("R-118 blocks an editor from durable interview work while the owner remains enabled", async () => {
    role = "editor";
    const editorPage = await InterviewPage({ searchParams: Promise.resolve({}) });
    expect(pageProps<NamedPageProps>(editorPage).writeBlock?.reason).toMatch(
      /R-118.*owner-only/
    );

    role = "owner";
    const ownerPage = await InterviewPage({ searchParams: Promise.resolve({}) });
    expect(pageProps<NamedPageProps>(ownerPage).writeBlock).toBeNull();
  });

  it("a viewer can select the reading context while mutation gates remain visible", async () => {
    role = "viewer";

    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    const props = onboardingProps(element);

    expect(props.profilePanel.selectProfileAction).toBeTypeOf("function");
    expect(props.profilePanel.createBlock?.reason).toMatch(/viewer access/i);
    expect(props.pasteBlock?.reason).toMatch(/viewer access/i);
    expect(mocks.listOnboardingInputs).toHaveBeenCalledWith(
      scope,
      PROFILE_B.id,
      expect.any(Object),
      "own_post",
    );
  });
});

describe("missing selected profile", () => {
  it("onboarding renders only the choose state and performs no profile reads", async () => {
    mocks.selectedProfileForMember.mockResolvedValue(null);

    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    const props = onboardingProps(element);

    expect(props.selectionRequired).toBe(true);
    expect(props.profileName).toBe(null);
    expect(props.run).toBe(null);
    expect(props.candidateSafetyAction).toBeUndefined();
    expect(mocks.listOnboardingInputs).not.toHaveBeenCalled();
  });

  it("interview and brain redirect to the explicit selection surface", async () => {
    mocks.selectedProfileForMember.mockResolvedValue(null);

    for (const page of [InterviewPage, BrainPage]) {
      let caught: { digest?: string } | undefined;
      try {
        await page({ searchParams: Promise.resolve({}) });
      } catch (error) {
        caught = error as { digest?: string };
      }
      expect(caught?.digest).toContain("/onboarding?choose=profile");
    }
    expect(mocks.getInterviewDraft).not.toHaveBeenCalled();
    expect(mocks.readBrainHistory).not.toHaveBeenCalled();
  });

  it("keeps empty-profile behavior creator-friendly", async () => {
    mocks.creatorProfiles.mockResolvedValue([]);
    mocks.selectedProfileForMember.mockResolvedValue(null);

    const onboarding = await OnboardingPage({
      searchParams: Promise.resolve({}),
    });
    expect(onboardingProps(onboarding).step).toBe("create-profile");

    const brain = await BrainPage({ searchParams: Promise.resolve({}) });
    const brainProps = pageProps<NamedPageProps>(brain);
    expect(brainProps.profileName).toBe("this creator");
    expect(brainProps.exportJsonHref).toBe(null);
    expect(mocks.selectedProfileForMember).toHaveBeenCalledTimes(2);
  });
});

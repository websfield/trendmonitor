import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  creatorProfiles: vi.fn(),
  selectedProfileForMember: vi.fn(),
  listOnboardingInputs: vi.fn(),
  getInterviewDraft: vi.fn(),
  readBrainHistory: vi.fn(),
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

let role: "owner" | "viewer" = "owner";
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
  pasteBlock: { reason: string } | null;
};
type NamedPageProps = {
  profileName: string;
  exportJsonHref: string | null;
  exportMarkdownHref: string | null;
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

  it("keeps a concurrently selected profile in the selector snapshot", async () => {
    mocks.creatorProfiles.mockResolvedValue([PROFILE_A]);
    mocks.selectedProfileForMember.mockResolvedValue(PROFILE_B);

    const element = await OnboardingPage({ searchParams: Promise.resolve({}) });
    const props = onboardingProps(element);

    expect(props.step).toBe("paste-posts");
    expect(props.profilePanel.selectedProfileId).toBe(PROFILE_B.id);
    expect(props.profilePanel.profiles).toContainEqual(PROFILE_B);
  });

  it("binds interview and brain reads, history, actions and export links to B", async () => {
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
    ]);
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

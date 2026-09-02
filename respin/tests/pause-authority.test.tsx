// WHICH PAUSE A SCREEN ASKS ABOUT (tenancy gate round 2, 2026-09-01).
//
// THERE ARE TWO ANSWERS TO "IS THIS WORKSPACE PAUSED" AND ONLY ONE OF THEM
// DECIDES. `hasOpenPause` reads `pause_periods` and is what every write gate
// refuses on — `createProfile`, `writeBrainDoc`, `activateBrainDocCoherent`,
// the four framework operations, `generate`, `debitCredits`. `BillingState.
// state === "paused"` is `isPausedSubscription`, which reads the
// `subscriptions.pausedAt` MIRROR; its own docblock says it is "not the
// authority, and deliberately not used to gate money", and `@respin/db`'s
// `hasOpenPause` names mirror-reading as "the drift bug this function exists to
// make impossible".
//
// FIVE SCREENS DERIVED THEIR PAUSE COURTESY FROM THE MIRROR. Where the two
// disagree, the screen offered a form the server refuses — after the creator
// had written a framework, an edit or a profile name — which is the exact
// over-offering the courtesy exists to prevent. Enforcement was never at risk;
// the gates re-read the authority inside every operation.
//
// WHAT THIS FILE IS, in two halves:
//
//   AN EXECUTING DRIVER. `/studio/frameworks` is rendered in BOTH drift states
//   — mirror paused / authority open, and mirror active / authority open — so
//   "the screen asks the authority" is a run rather than a claim.
//
//   A POPULATION LIST. Every remaining reader of the mirror is named, with the
//   reason it is allowed to be one. A new screen deriving a pause courtesy from
//   `BillingState` turns this red, which is the cost of adding to the
//   population (CLAUDE.md, 2026-08-29 — a guard is only as wide as the list it
//   states, and a population written as one path narrows silently).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  scopeForUser: vi.fn(),
  selectedProfileForMember: vi.fn(),
  sharedFrameworkLibrary: vi.fn(),
  listPrivateFrameworks: vi.fn(),
  getBillingState: vi.fn(),
  hasOpenPause: vi.fn(),
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
      sharedFrameworkLibrary: mocks.sharedFrameworkLibrary,
      listPrivateFrameworks: mocks.listPrivateFrameworks,
    },
  };
});
// `privateFrameworkEntitlement` STAYS REAL — it is the one producer of the
// entitlement answer, and a mock of it would make the tier half of this page
// agree with whatever the test wanted.
vi.mock("@respin/credits/app-server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@respin/credits/app-server")>();
  return {
    ...actual,
    respinCredits: {
      ...actual.respinCredits,
      getBillingState: mocks.getBillingState,
      hasOpenPause: mocks.hasOpenPause,
    },
  };
});

const FrameworksPage = (
  await import("../app/(product)/studio/frameworks/page")
).default;
const { PRIVATE_FRAMEWORKS_PAUSED } = await import(
  "../app/(product)/studio/frameworks/form-copy"
);

const PROFILE = {
  id: "0195aa11-2222-7333-8444-5555666677a1",
  displayName: "Creator A",
};

type Block = { reason: string; kind: "role" | "plan" | "paused" } | null;
type ViewProps = { block: Block; curate: unknown };

async function renderFrameworks(): Promise<ViewProps> {
  const el = await FrameworksPage({ searchParams: Promise.resolve({}) });
  return (el as unknown as { props: ViewProps }).props;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-1" });
  mocks.scopeForUser.mockResolvedValue({
    userId: "user-1",
    workspaceId: "workspace-1",
    role: "owner",
    accessors: {},
  });
  mocks.selectedProfileForMember.mockResolvedValue(PROFILE);
  mocks.sharedFrameworkLibrary.mockResolvedValue([]);
  mocks.listPrivateFrameworks.mockResolvedValue([]);
  // PRO, so the plan branch never decides these cases: `curateBlock` reports
  // role, then plan, then pause, and a Free tier would answer every one of
  // them "not in plan" and prove nothing about the pause.
  mocks.getBillingState.mockResolvedValue({ tier: "pro", state: "active" });
  mocks.hasOpenPause.mockResolvedValue(false);
});

describe("/studio/frameworks asks the pause AUTHORITY, not the mirror", () => {
  it("offers the curate form when nothing is paused", async () => {
    const props = await renderFrameworks();
    expect(props.block).toBe(null);
    expect(props.curate).not.toBe(null);
    // The authority was actually consulted — otherwise the assertion above
    // passes for a page that asks nobody.
    expect(mocks.hasOpenPause).toHaveBeenCalledWith("workspace-1");
  });

  it("WITHHOLDS it when pause_periods has an open row and the mirror says active", async () => {
    // THE DRIFT DIRECTION THAT COSTS THE CREATOR SOMETHING: the server refuses
    // (`WorkspacePausedError` from `hasOpenPause` inside every framework
    // operation) while the mirror-reading screen offered the form. Measured
    // before the fix: `block === null`, the form rendered, the write refused
    // after the framework had been written.
    mocks.getBillingState.mockResolvedValue({ tier: "pro", state: "active" });
    mocks.hasOpenPause.mockResolvedValue(true);
    const props = await renderFrameworks();
    expect(props.block).toEqual({
      reason: PRIVATE_FRAMEWORKS_PAUSED,
      kind: "paused",
    });
    expect(props.curate).toBe(null);
  });

  it("OFFERS it when only the stale mirror says paused", async () => {
    // The other direction, and it is the same bug: a `subscriptions.pausedAt`
    // the resume path left behind withheld a form from a workspace every gate
    // would have accepted.
    mocks.getBillingState.mockResolvedValue({ tier: "pro", state: "paused" });
    mocks.hasOpenPause.mockResolvedValue(false);
    const props = await renderFrameworks();
    expect(props.block).toBe(null);
    expect(props.curate).not.toBe(null);
  });

  it("a failed authority read leaves the form OFFERED, and the gate refuses", async () => {
    // FAIL-SOFT IN THE STATED DIRECTION. Guessing "paused" would tell a
    // workspace that is not paused something untrue about its own billing; the
    // enforcement is `hasOpenPause` inside each action either way.
    mocks.hasOpenPause.mockRejectedValue(new Error("db down"));
    const props = await renderFrameworks();
    expect(props.block).toBe(null);
  });

  it("a failed TIER read still withholds the form — the plan half fails CLOSED", async () => {
    // The two reads are separate now, so this is worth pinning: the pause read
    // being independent must not have loosened the entitlement default.
    mocks.getBillingState.mockRejectedValue(new Error("billing down"));
    const props = await renderFrameworks();
    expect(props.block?.kind).toBe("plan");
  });
});

// --------------------------------------------------------------- the population

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..", "app");

/**
 * The screens that decide a pause COURTESY, and the fact each one asks.
 *
 * A LIST, NOT A PATTERN. Every file here fronts an operation the server refuses
 * under an open `pause_periods` row, so every one of them has to ask the same
 * question the gate asks. Adding a sixth screen with a pause block costs a line
 * here — which is the point (CLAUDE.md, 2026-08-29).
 */
const PAUSE_COURTESY_PAGES = [
  "(product)/studio/frameworks/page.tsx",
  "(product)/studio/page.tsx",
  "(product)/brain/page.tsx",
  "(product)/onboarding/page.tsx",
  "(product)/onboarding/first-ideas/page.tsx",
] as const;

/**
 * The files still allowed to read `BillingState.state === "paused"`, each with
 * the reason it is not the same question.
 *
 *   `settings/billing/billing-view.tsx` — the billing screen renders the
 *   SUBSCRIPTION's own state, which is what the mirror is. Its resume path has
 *   its own convergence (`clearPauseMirror`), reasoned about in an earlier
 *   round; it is deliberately out of scope here rather than overlooked.
 *
 *   `usage/page.tsx` — reads `resumesAt` for the frozen-credits notice. That
 *   date lives ONLY on the mirror; `pause_periods` does not carry it.
 */
const MIRROR_READERS = [
  "(product)/settings/billing/billing-view.tsx",
  "(product)/usage/page.tsx",
] as const;

const MIRROR_READ = /\bstate\s*===\s*"paused"/;

const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Comment lines are prose ABOUT the rule, not a use of it. */
const codeOf = (src: string) =>
  src
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");

describe("the population of mirror readers is a stated list", () => {
  it("the scan is not vacuous — it finds the reads the allowlist admits", () => {
    // A SCAN THAT FINDS NOTHING IS INDISTINGUISHABLE FROM A BROKEN ONE
    // (CLAUDE.md, 2026-08-21). These two files really do carry the shape.
    for (const rel of MIRROR_READERS) {
      expect(MIRROR_READ.test(codeOf(read(rel))), rel).toBe(true);
    }
    // And it matches a planted violation of the exact shape a page would write.
    expect(MIRROR_READ.test('  paused = state.state === "paused";')).toBe(true);
  });

  it("no pause-courtesy page reads the mirror", () => {
    for (const rel of PAUSE_COURTESY_PAGES) {
      expect(MIRROR_READ.test(codeOf(read(rel))), rel).toBe(false);
    }
  });

  it("every pause-courtesy page asks the AUTHORITY by name", () => {
    for (const rel of PAUSE_COURTESY_PAGES) {
      expect(codeOf(read(rel)), rel).toContain(
        "respinCredits.hasOpenPause(scope.workspaceId)"
      );
    }
  });
});

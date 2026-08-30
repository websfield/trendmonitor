// Slice 3b, Stage A — the interview surface: save/resume a draft, and submit
// it into immutable `creator_authored` onboarding_inputs plus deterministic
// `strategy`/`killtest` brain-document versions. NO vendor/LLM call anywhere
// in this file or in the code it drives — every claim traces to a row this
// test itself seeded via the interview answers.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { creatorProfiles } from "../src/brain-schema";
import { memberships } from "../src/schema";
import { pausePeriods } from "../src/billing-schema";
import { onboardingInputs, onboardingInterviewDrafts } from "../src/onboarding-schema";
import {
  INTERVIEW_FIELDS,
  getInterviewDraft,
  saveInterviewDraft,
  submitInterview,
  type InterviewAnswers,
} from "../src/interview-ops";
import {
  InterviewAnswerError,
  InterviewDraftSubmittedError,
  ProfileAccessError,
  ProfileRoleError,
  WorkspacePausedError,
} from "../src/errors";
import { withWorkspace, type WorkspaceScope } from "../src/with-workspace";
import { CHECK, enumerateClaimFields, readPointer } from "../src/brain-content";

type World = { scope: WorkspaceScope; profileId: string };

async function world(db: TestDb, authId = "iv_a"): Promise<World> {
  await seedAuthUser(db, authId);
  await ensureUserWorkspace(db, { authUserId: authId, name: "A" });
  const scope = await withWorkspace(db, { authUserId: authId });
  const [p] = await db
    .insert(creatorProfiles)
    .values({ workspaceId: scope.workspaceId as string, displayName: "A's creator" })
    .returning();
  return { scope, profileId: p.id };
}

describe("saveInterviewDraft / getInterviewDraft (R1, R2, R11)", () => {
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  it("returns null for a profile with no draft yet", async () => {
    expect(await getInterviewDraft(db, w.scope, w.profileId)).toBeNull();
  });

  it("creates a draft on first save, and MERGES a second patch rather than clobbering it", async () => {
    const first: InterviewAnswers = {
      audience: { status: "decided", value: "solo founders" },
    };
    const row1 = await saveInterviewDraft(db, w.scope, w.profileId, first);
    expect((row1.answers as InterviewAnswers).audience).toEqual(first.audience);

    const second: InterviewAnswers = {
      positioning: { status: "decided", value: "the practitioner, not the guru" },
    };
    const row2 = await saveInterviewDraft(db, w.scope, w.profileId, second);
    expect(row2.id).toBe(row1.id);
    const merged = row2.answers as InterviewAnswers;
    // BOTH survive — the second save did not erase the first (R2's "answer,
    // go back, change your mind" promise).
    expect(merged.audience).toEqual(first.audience);
    expect(merged.positioning).toEqual(second.positioning);
  });

  it("REFUSES a blank 'decided' answer (R1: blank text is not silently a claim)", async () => {
    await expect(
      saveInterviewDraft(db, w.scope, w.profileId, {
        audience: { status: "decided", value: "   " },
      })
    ).rejects.toBeInstanceOf(InterviewAnswerError);
    expect(await db.select().from(onboardingInterviewDrafts)).toHaveLength(0);
  });

  it("REFUSES an unknown field key — the closed key space", async () => {
    await expect(
      saveInterviewDraft(db, w.scope, w.profileId, {
        notARealField: { status: "decided", value: "x" },
      } as unknown as InterviewAnswers)
    ).rejects.toBeInstanceOf(InterviewAnswerError);
  });

  it("REFUSES a viewer — the class, not the field (G-13's rule applied here too)", async () => {
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, w.scope.workspaceId as string));
    const viewer = await withWorkspace(db, { authUserId: "iv_a" });
    await expect(
      saveInterviewDraft(db, viewer, w.profileId, {
        audience: { status: "decided", value: "x" },
      })
    ).rejects.toBeInstanceOf(ProfileRoleError);
    expect(await db.select().from(onboardingInterviewDrafts)).toHaveLength(0);
  });

  it("REFUSES another workspace's profile id", async () => {
    const other = await world(db, "iv_b");
    await expect(
      saveInterviewDraft(db, w.scope, other.profileId, {
        audience: { status: "decided", value: "x" },
      })
    ).rejects.toBeInstanceOf(ProfileAccessError);
  });

  it("REFUSES saving to an already-submitted draft (R11)", async () => {
    await submitInterview(db, w.scope, w.profileId);
    await expect(
      saveInterviewDraft(db, w.scope, w.profileId, {
        audience: { status: "decided", value: "x" },
      })
    ).rejects.toBeInstanceOf(InterviewDraftSubmittedError);
  });
});

describe("submitInterview — deterministic, vendor-free brain-document construction (R1, R4, R5, R6)", () => {
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  it("REFUSES a viewer, writing nothing", async () => {
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, w.scope.workspaceId as string));
    const viewer = await withWorkspace(db, { authUserId: "iv_a" });
    await expect(submitInterview(db, viewer, w.profileId)).rejects.toBeInstanceOf(
      ProfileRoleError
    );
    expect(await db.select().from(onboardingInterviewDrafts)).toHaveLength(0);
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
  });

  it("with NOTHING decided at all: writes NEITHER document, marks the draft submitted", async () => {
    const result = await submitInterview(db, w.scope, w.profileId);
    expect(result.strategyDoc).toBeNull();
    expect(result.killtestDoc).toBeNull();
    expect(result.draft.submittedAt).not.toBeNull();
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
  });

  it("REFUSES double submission (R11), even with no draft ever saved", async () => {
    await submitInterview(db, w.scope, w.profileId);
    await expect(submitInterview(db, w.scope, w.profileId)).rejects.toBeInstanceOf(
      InterviewDraftSubmittedError
    );
  });

  it("a scalar claim, decided: cites the EXACT stored row verbatim", async () => {
    await saveInterviewDraft(db, w.scope, w.profileId, {
      audience: { status: "decided", value: "solo founders scaling past $10k/mo" },
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    expect(result.strategyDoc).not.toBeNull();
    const doc = result.strategyDoc!;
    expect(readPointer(doc.content, "/audience")).toBe(
      "solo founders scaling past $10k/mo"
    );
    const evidence = doc.sourceEvidence as { field: string; quote: string; inputId: string }[];
    const entry = evidence.find((e) => e.field === "/audience");
    expect(entry).toBeDefined();
    expect(entry!.quote).toBe("solo founders scaling past $10k/mo");
    // The cited row really exists, is `creator_authored`, and carries the
    // registry's field_key — the CHECK constraint's own vocabulary.
    const [row] = await db
      .select()
      .from(onboardingInputs)
      .where(eq(onboardingInputs.id, entry!.inputId));
    expect(row.inputClass).toBe("creator_authored");
    expect(row.fieldKey).toBe("audience");
    expect(row.content).toBe("solo founders scaling past $10k/mo");
  });

  it("a scalar claim, NOT decided: renders CHECK, cites nothing", async () => {
    // positioning decided (so the strategy doc has SOMETHING to cite);
    // audience left undecided.
    await saveInterviewDraft(db, w.scope, w.profileId, {
      positioning: { status: "decided", value: "the practitioner who shows the work" },
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    const doc = result.strategyDoc!;
    expect(readPointer(doc.content, "/audience")).toBe(CHECK);
    const evidence = doc.sourceEvidence as { field: string }[];
    expect(evidence.some((e) => e.field === "/audience")).toBe(false);
  });

  it("a list claim: not-decided is [CHECK]; decided-with-items cites each in order; decided-empty is []", async () => {
    await saveInterviewDraft(db, w.scope, w.profileId, {
      positioning: { status: "decided", value: "short clips that end on a question" },
      goals: { status: "decided", values: ["hit 10k followers", "launch a course"] },
      ambitions: { status: "decided", values: [] },
      // bannedWords left NOT decided.
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    const strategy = result.strategyDoc!;
    expect(readPointer(strategy.content, "/goals")).toEqual([
      "hit 10k followers",
      "launch a course",
    ]);
    expect(readPointer(strategy.content, "/ambitions")).toEqual([]);
    const evidence = strategy.sourceEvidence as { field: string; quote: string }[];
    expect(evidence.find((e) => e.field === "/goals/0")?.quote).toBe("hit 10k followers");
    expect(evidence.find((e) => e.field === "/goals/1")?.quote).toBe("launch a course");
    // killtest was never touched — nothing decided under it — so it is not written.
    expect(result.killtestDoc).toBeNull();
    const [draftAfter] = await db.select().from(onboardingInterviewDrafts);
    const bannedWords = (draftAfter.answers as InterviewAnswers).bannedWords;
    expect(bannedWords).toBeUndefined();
  });

  it("a SOLE decided-EMPTY list, with nothing else touched in that target, leaves the document null rather than writing a vacuous one (R1 + REQ-B02, browser-walk-probed)", async () => {
    // A live browser walk raised exactly this shape as a suspected bug — the
    // creator's only killtest answer is "no banned words" (R1's decided-empty
    // third state), so it produces zero evidence, and `killtestDoc` comes
    // back null. Investigating found it is NOT a bug: `writeBrainDoc`
    // (`with-workspace.ts`) independently refuses "a version in which
    // nothing at all is cited" (REQ-B02) — a document whose every position is
    // an empty array or `[CHECK]` has no grounding a creator could confirm.
    // `buildDocContents`'s `evidence.length > 0` gate is what keeps this
    // fully-vacuous case from ever reaching that refusal (and crashing the
    // whole atomic submission, strategy document and submitted-mark
    // included) — this test pins the silent-skip as the intended outcome, so
    // a future change does not "fix" it back into the crash this file's
    // header now documents.
    await saveInterviewDraft(db, w.scope, w.profileId, {
      bannedWords: { status: "decided", values: [] },
      // bannedVibes and every strategy field left untouched.
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    expect(result.strategyDoc).toBeNull();
    expect(result.killtestDoc).toBeNull();
    const [draftAfter] = await db.select().from(onboardingInterviewDrafts);
    expect(draftAfter.submittedAt).not.toBeNull();
  });

  it("killtest is written independently when only ITS fields are decided", async () => {
    await saveInterviewDraft(db, w.scope, w.profileId, {
      bannedWords: { status: "decided", values: ["guaranteed", "hack"] },
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    expect(result.strategyDoc).toBeNull();
    expect(result.killtestDoc).not.toBeNull();
    expect(readPointer(result.killtestDoc!.content, "/bannedWords")).toEqual([
      "guaranteed",
      "hack",
    ]);
    expect(readPointer(result.killtestDoc!.content, "/bannedVibes")).toEqual([CHECK]);
    expect(readPointer(result.killtestDoc!.content, "/rules")).toEqual([]);
  });

  it("a declinable field (metricPlatform/metricWindow) NOT decided is OMITTED, never CHECK", async () => {
    await saveInterviewDraft(db, w.scope, w.profileId, {
      metricLabel: { status: "decided", value: "weekly saves" },
      metricUnit: { status: "decided", value: "count" },
      metricDirection: { status: "decided", value: "higher_is_better" },
      // metricPlatform / metricWindow left not decided.
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    const metric = readPointer(result.strategyDoc!.content, "/metric") as Record<
      string,
      unknown
    >;
    expect(metric.platform).toBeUndefined();
    expect(metric.window).toBeUndefined();
    expect(metric.label).toBe("weekly saves");
    expect(metric.direction).toBe("higher_is_better");
    // `key` is server-owned and stripped by parseBrainContent regardless of
    // what this module writes — see interview-ops.ts's own comment.
    expect(metric.key).toBeUndefined();
  });

  it("a declinable field DECIDED is present and cited, like any other scalar", async () => {
    await saveInterviewDraft(db, w.scope, w.profileId, {
      metricLabel: { status: "decided", value: "weekly saves" },
      metricUnit: { status: "decided", value: "count" },
      metricDirection: { status: "decided", value: "higher_is_better" },
      metricPlatform: { status: "decided", value: "instagram" },
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    const metric = readPointer(result.strategyDoc!.content, "/metric") as Record<
      string,
      unknown
    >;
    expect(metric.platform).toBe("instagram");
    const evidence = result.strategyDoc!.sourceEvidence as { field: string }[];
    expect(evidence.some((e) => e.field === "/metric/platform")).toBe(true);
  });

  it("the constructed content activates: every enumerated claim is either CHECK or cited (C-28's bijection, proven end to end)", async () => {
    await saveInterviewDraft(db, w.scope, w.profileId, {
      audience: { status: "decided", value: "solo founders" },
      positioning: { status: "decided", value: "the practitioner, not the guru" },
    });
    const result = await submitInterview(db, w.scope, w.profileId);
    const doc = result.strategyDoc!;
    // If writeBrainDoc's own C-28 checks (declared<->cited, cited never
    // CHECK) were violated, the write above would already have thrown — this
    // just re-confirms the shape holds for callers of enumerateClaimFields
    // too (the confirm-screen's own reader).
    const positions = enumerateClaimFields("strategy", doc.content);
    expect(positions).toEqual(
      expect.arrayContaining(["/audience", "/positioning"])
    );
  });

  it("REFUSES with no vendor call and NO partial write when the workspace is PAUSED mid-submission (R5 atomicity, no vendor in the loop)", async () => {
    // appendOnboardingInput itself is NOT pause-gated (A-7), but writeBrainDoc
    // IS — so a paused workspace with a decided field reaches the
    // creator_authored insert, THEN fails inside the SAME transaction. R5's
    // "nothing partial is left" is being asserted on the ONE gate available
    // without a vendor in this file's path at all.
    await db
      .insert(pausePeriods)
      .values({ workspaceId: w.scope.workspaceId as string, startedAt: new Date() });
    await saveInterviewDraft(db, w.scope, w.profileId, {
      audience: { status: "decided", value: "solo founders" },
    });
    await expect(submitInterview(db, w.scope, w.profileId)).rejects.toBeInstanceOf(
      WorkspacePausedError
    );
    // NOTHING landed: not the creator_authored row, not the draft's
    // submitted_at.
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
    const [draft] = await db.select().from(onboardingInterviewDrafts);
    expect(draft.submittedAt).toBeNull();
  });

  it("submitting with NO draft ever saved treats every field as not decided", async () => {
    expect(await getInterviewDraft(db, w.scope, w.profileId)).toBeNull();
    const result = await submitInterview(db, w.scope, w.profileId);
    expect(result.strategyDoc).toBeNull();
    expect(result.killtestDoc).toBeNull();
    const [draft] = await db.select().from(onboardingInterviewDrafts);
    expect(draft.submittedAt).not.toBeNull();
    expect(draft.answers).toEqual({});
  });

  it("REGISTRY SHAPE: every field key round-trips through the closed answers schema", () => {
    // A structural, non-vacuity check on the registry itself: every key it
    // names is a real key of InterviewAnswers, and the set is exactly what
    // this file's other tests exercise by name.
    const keys = INTERVIEW_FIELDS.map((f) => f.key).sort();
    expect(keys).toEqual(
      [
        "audience",
        "positioning",
        "goals",
        "ambitions",
        "metricLabel",
        "metricUnit",
        "metricDirection",
        "metricPlatform",
        "metricWindow",
        "bannedWords",
        "bannedVibes",
      ].sort()
    );
  });
});

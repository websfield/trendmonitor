// LAUNCH L3 (R-152): BOUNDED RECENT CONTEXT AND EXPLICIT PREFERENCES.
//
// WHAT THIS FILE IS THE WITNESS FOR — the plan's L3 acceptance, one block each:
//   1. deterministic, bounded history (counts, budget, relevance order, ties)
//   2. no other profile's or workspace's rows, UNCONDITIONALLY (no skip)
//   3. a rejection is avoided unless an intentional sequel is requested
//   4. an APPROVED filming preference is respected; a proposed one is not used
//   5. a preference reversal is effective for NEW operations
//   6. an old operation's context identity is unchanged by that reversal
//   7. no laundering: history never vouches for a specific in a new output
//   8. erased context ends a resumed operation (no debit, no rebuild)
//
// THE INSTRUMENT is `generate.test.ts`'s: the provider is a script whose
// prompts are captured, and every "nothing reached the model" claim is a
// provider that THROWS if called. Fixture tests prove BOUNDARIES; whether the
// history is USEFUL is L6's next-session human witness, not this file's.
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  JSON_PATH_INVENTORY,
  RECENT_DRAFTS_MAX,
  RECENT_NOTES_MAX,
  activateBrainCoherent,
  brainActivationSnapshots,
  brainDocs,
  confirmKillTestFields,
  confirmVoiceFields,
  createTestDb,
  creativePieces,
  creatorProfiles,
  creditLedger,
  editBrainDocument,
  ensureUserWorkspace,
  excludeFeedbackFromHistory,
  FeedbackExclusionTargetError,
  generationAttempts,
  generationFeedback,
  generations,
  memberships,
  mintProfileScope,
  modelUsage,
  BrainEditUnchangedError,
  ProfileRoleError,
  rememberForFutureDrafts,
  seedAuthUser,
  seedDb,
  withWorkspace,
  writeCapabilities,
  type Generation,
  type TestDb,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import type { InferenceRequest, LlmProvider } from "@respin/llm";
import {
  RECENT_WORK_AVOID_NOTE,
  RECENT_WORK_BLOCK_HEADER,
  RECENT_WORK_LABELS,
  RECENT_WORK_NOTE_PREFIX,
  RECENT_WORK_SEQUEL_NOTE,
  type GenerationContext,
  assembleGenerationPrompt,
  basisCorpusFor,
  contractOf,
  creativeCheckContextFor,
  parseScriptOutput,
  runKillTest,
  traceabilityCorpusFor,
} from "@respin/modes";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { generate, intentHashOf, reportedSpecificsOf } from "../src/generate";
import { GENERATION_PURPOSE } from "../src/inference";
import {
  REACTION_LABELS,
  buildRecentContext,
  recentContextIdsOf,
} from "../src/recent-context";
import { GenerationRecoveryRequiredError } from "../src/errors";
import { GenerationAssemblyError } from "@respin/modes";
import { anySlots } from "./support/run-slots";
import { dbThatFailsWhen } from "./support/crash-db";
import { PLATFORM, killTestReply } from "./support/generation-fixtures";
import { FORM_EXCERPT, FORM_INPUT, NO_LIMITS, legacyIdeas, v2Ideas } from "./support/form-fixtures";

const IDEATION_COST = CONFIG_V1_SEED.creditCosts.ideationBatch;

const never = (): LlmProvider => ({
  vendor: "must-not-be-called",
  complete: async () => {
    throw new Error("THE VENDOR WAS CALLED. A gate that runs before the model call did not.");
  },
});

function scripted(texts: string[], onCall?: (n: number) => Promise<void>) {
  const calls: InferenceRequest[] = [];
  const provider: LlmProvider = {
    vendor: "stub",
    complete: async (req) => {
      calls.push(req);
      if (onCall) await onCall(calls.length);
      const text = texts[calls.length - 1];
      if (text === undefined) {
        throw new Error(`called ${calls.length} times, ${texts.length} replies scripted`);
      }
      return {
        text,
        servedModel: "claude-sonnet-5",
        usage: { tokensIn: 10, tokensOut: 20, raw: {} },
      };
    },
  };
  return { provider, calls };
}

/** A legacy ideation batch whose three hooks carry one distinctive word each. */
function ideasWith(marks: [string, string, string]) {
  const base = legacyIdeas();
  return {
    ...base,
    ideas: base.ideas.map((idea, i) => ({ ...idea, hook: `${idea.hook} ${marks[i]}` })),
  };
}

const ideationReply = (rules = ["/rules/0"]) => [
  JSON.stringify(legacyIdeas()),
  killTestReply(rules),
];

/** The recent-work block of a captured prompt, or "" when there is none. */
function historyBlock(prompt: string): string {
  const start = prompt.indexOf(RECENT_WORK_BLOCK_HEADER);
  if (start < 0) return "";
  const end = prompt.indexOf("\n\n", start);
  return prompt.slice(start, end < 0 ? undefined : end);
}

/** The creator's brain block of a captured prompt. */
function brainBlock(prompt: string): string {
  const start = prompt.indexOf("This creator's brain:");
  const end = prompt.indexOf("\n\n", start);
  return prompt.slice(start, end);
}

describe("launch L3: bounded recent context and explicit preferences", () => {
  let db: TestDb;
  let owner: WorkspaceScope;
  let foreignOwner: WorkspaceScope;
  let ws: VerifiedWorkspaceId;
  let foreignWs: VerifiedWorkspaceId;
  let profileId: string;
  let siblingId: string;
  let foreignId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedAuthUser(db, "user_b");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "A" });
    await ensureUserWorkspace(db, { authUserId: "user_b", name: "B" });
    owner = await withWorkspace(db, { authUserId: "user_a" });
    foreignOwner = await withWorkspace(db, { authUserId: "user_b" });
    ws = owner.workspaceId;
    foreignWs = foreignOwner.workspaceId;
    profileId = (await createProfile(db, owner, "Anna", new Date())).id;
    // The SIBLING is inserted directly: the free tier's one-profile cap is a
    // product rule this tenancy fixture is not about.
    siblingId = (
      await db.insert(creatorProfiles).values({ workspaceId: ws, displayName: "Bea" }).returning()
    )[0].id;
    foreignId = (await createProfile(db, foreignOwner, "Cal", new Date())).id;
    for (const workspaceId of [ws, foreignWs]) {
      await db.transaction((tx) =>
        grantCredits(tx, {
          workspaceId,
          amount: 500,
          expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
          refType: "test",
          refId: `grant-${workspaceId}`,
          configVersion: 1,
        })
      );
    }
  });

  // ------------------------------------------------------------ fixtures

  /** A raw-inserted active brain (the `revision.test.ts` fixture). */
  async function rawBrain(pid: string, workspaceId: string): Promise<string> {
    const evidence = [
      { field: "/register", quote: "c", inputId: "00000000-0000-4000-8000-000000000001", startUtf16: 0, endUtf16: 1 },
    ];
    const confirmed = {
      confirmedAt: new Date(),
      confirmedContentSha256: "0".repeat(64),
      activatedAt: new Date(),
    };
    const [voice] = await db.insert(brainDocs).values({
      profileId: pid, workspaceId, kind: "voice", version: 1,
      content: {
        register: "plain and direct, like talking to one person",
        sentenceRhythm: "short lines, then one long one",
        signatureMoves: ["opens on the thing that went wrong"],
        avoid: ["never uses hype words"],
      },
      reason: "Version 1: you edited this document.",
      sourceEvidence: evidence, status: "active", ...confirmed,
    }).returning();
    const [killtest] = await db.insert(brainDocs).values({
      profileId: pid, workspaceId, kind: "killtest", version: 1,
      content: { rules: ["it must not sound like an advert"] },
      reason: "Version 1: you edited this document.",
      sourceEvidence: evidence, status: "active", ...confirmed,
    }).returning();
    const [snap] = await db.insert(brainActivationSnapshots).values({
      profileId: pid, workspaceId, voiceDocId: voice.id, killtestDocId: killtest.id,
    }).returning();
    return snap.id;
  }

  /**
   * A REAL brain, through the product's own write, confirm and activate path —
   * the only kind a creator edit can be made on, because an edit carries every
   * unchanged position's evidence forward and `writeBrainDoc` re-verifies it.
   */
  async function realBrain(): Promise<{ killtestDocId: string }> {
    const scope = await mintProfileScope(db, owner, profileId);
    const caps = writeCapabilities(scope);
    // EVERY INPUT IS APPENDED BEFORE THE WRITE'S TRANSACTION OPENS: the
    // append opens its own, and the test database has one connection.
    const cite = async (field: string, content: string) => {
      const input = await caps.appendOnboardingInput({
        inputClass: "creator_authored",
        content,
        fieldKey: field,
      });
      return { field, quote: content, inputId: input.id, startUtf16: 0, endUtf16: content.length };
    };
    const voiceEvidence = [
      await cite("/register", "plain and direct"),
      await cite("/sentenceRhythm", "short lines"),
    ];
    const killtestEvidence = [await cite("/rules/0", "it must not sound like an advert")];
    const voice = await db.transaction(async (tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: {
            register: "plain and direct",
            sentenceRhythm: "short lines",
            signatureMoves: [],
            avoid: [],
          },
          sourceEvidence: voiceEvidence,
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    const killtest = await db.transaction(async (tx) =>
      caps.writeBrainDoc(
        {
          kind: "killtest",
          content: { rules: ["it must not sound like an advert"] },
          sourceEvidence: killtestEvidence,
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    await confirmVoiceFields(db, owner, profileId, voice.id, [
      { pointer: "/register", asPlaceholder: false },
      { pointer: "/sentenceRhythm", asPlaceholder: false },
    ]);
    await activateBrainCoherent(db, owner, profileId, voice.id);
    await approve(killtest.id, 1);
    return { killtestDocId: killtest.id };
  }

  /** Confirm every rule of a Kill Test version and activate it (the /brain acts). */
  async function approve(killtestDocId: string, ruleCount: number): Promise<void> {
    await confirmKillTestFields(
      db,
      owner,
      profileId,
      killtestDocId,
      Array.from({ length: ruleCount }, (_, i) => ({ pointer: `/rules/${i}`, asPlaceholder: false }))
    );
    await activateBrainCoherent(db, owner, profileId, killtestDocId);
  }

  let seq = 0;
  /**
   * One settled generation row, inserted directly so its `created_at`,
   * platform, output and stored findings are the test's to choose. The
   * lifecycle is walked as `profile-scope.test.ts` walks it: attempt at
   * `vendor_complete`, generation, attempt settled.
   */
  async function seedDraft(over: {
    pid?: string;
    workspaceId?: string;
    platform?: string;
    createdAt?: Date;
    mode?: "ideation" | "ideaToScript" | "hooks";
    output?: unknown;
    reported?: string[];
    /** The stored `finalAttempt.claims` tokens; `null` writes no `claims` key. */
    claims?: string[] | null;
    outcome?: "usable" | "honest_refusal";
    pieceId?: string;
  } = {}): Promise<Generation> {
    seq += 1;
    const pid = over.pid ?? profileId;
    const workspaceId = over.workspaceId ?? ws;
    const [snap] = await db
      .select()
      .from(brainActivationSnapshots)
      .where(eq(brainActivationSnapshots.profileId, pid))
      .limit(1);
    const attemptId = `seed-${seq}`;
    const mode = over.mode ?? "ideation";
    const [attempt] = await db.insert(generationAttempts).values({
      profileId: pid, workspaceId, attemptId, purpose: "generation", mode,
      payloadSha256: "0".repeat(64), state: "vendor_complete",
      vendorStartedAt: new Date(), vendorCompletedAt: new Date(),
      candidate: { v: 1, outcome: "usable" },
    }).returning();
    const outcome = over.outcome ?? "usable";
    const [generation] = await db.insert(generations).values({
      profileId: pid, workspaceId, attemptId, mode,
      brainActivationId: snap.id,
      request: {
        platform: over.platform ?? PLATFORM,
        origin: over.pieceId ? { kind: "piece", pieceId: over.pieceId } : null,
      },
      model: "claude-sonnet-5", promptBundleVersion: "pb", configVersion: 1,
      outcome,
      output: outcome === "usable" ? (over.output ?? ideasWith(["alpha", "bravo", "charlie"])) : null,
      weakestPoint: outcome === "usable" ? "nothing here is evidence about you" : null,
      refusalReason: outcome === "usable" ? null : "everything died",
      killTest: {
        finalAttempt: {
          traceability: (over.reported ?? []).map((token) => ({ token })),
          ...(over.claims === null
            ? {}
            : { claims: (over.claims ?? []).map((token) => ({ token })) }),
        },
      },
      ...(over.createdAt ? { createdAt: over.createdAt } : {}),
    }).returning();
    await db.update(generationAttempts).set({
      state: "settled", terminalAt: new Date(), generationId: generation.id, candidate: null,
    }).where(eq(generationAttempts.id, attempt.id));
    return generation;
  }

  async function seedReaction(
    generation: Generation,
    reaction: "wrong_angle" | "not_filmable" | "used_as_is" | "off_voice",
    note: string | null,
    createdAt?: Date
  ) {
    const [row] = await db.insert(generationFeedback).values({
      profileId: generation.profileId,
      workspaceId: generation.workspaceId,
      generationId: generation.id,
      reaction,
      note,
      ...(createdAt ? { createdAt } : {}),
    }).returning();
    return row;
  }

  const attemptRow = async (attemptId: string) =>
    (await db.select().from(generationAttempts).where(eq(generationAttempts.attemptId, attemptId)))[0];
  const snapshotOf = async (attemptId: string) =>
    (await attemptRow(attemptId)).requestSnapshot as {
      sequel: boolean;
      brainActivationId: string;
      recentContext: {
        charBudget: number;
        charsUsed: number;
        records: { kind: string; id: string; position: number; labels: string[] }[];
        exclusions: { kind: string; id: string; reason: string }[];
      } | null;
    };
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 12, minutes));
  const ideation = (attemptId: string, over: Partial<{ input: string; sequel: boolean; platform: string }> = {}) => ({
    mode: "ideation" as const,
    attemptId,
    input: over.input ?? FORM_INPUT,
    platform: over.platform ?? PLATFORM,
    ...(over.sequel === undefined ? {} : { sequel: over.sequel }),
  });

  // ------------------------------------------------- 1. deterministic, bounded

  it("1. DETERMINISTIC AND BOUNDED: at most five drafts and three notes, same platform first, newest first, id breaks a tie — and the claim snapshot records ids, order, exclusions and budget", async () => {
    await rawBrain(profileId, ws);
    // Eight drafts: four on this platform, four on another; two share a
    // timestamp so the id tie-break is exercised.
    const same = [
      await seedDraft({ createdAt: at(1) }),
      await seedDraft({ createdAt: at(5) }),
      await seedDraft({ createdAt: at(5) }),
      await seedDraft({ createdAt: at(9) }),
    ];
    const other = [
      await seedDraft({ platform: "instagram", createdAt: at(30) }),
      await seedDraft({ platform: "instagram", createdAt: at(31) }),
      await seedDraft({ platform: "instagram", createdAt: at(32) }),
      await seedDraft({ platform: "instagram", createdAt: at(33) }),
    ];
    // Four reactions: only three may be read.
    for (const [i, g] of [same[0], same[1], other[0], other[1]].entries()) {
      await seedReaction(g, "off_voice", null, at(40 + i));
    }
    const scope = await mintProfileScope(db, owner, profileId);
    const query = { modes: ["ideation", "ideaToScript"], platform: PLATFORM, currentPieceId: null, excludeGenerationIds: [] };
    const read = await scope.accessors.recentContextCandidates(query);
    expect(RECENT_DRAFTS_MAX).toBe(5);
    expect(RECENT_NOTES_MAX).toBe(3);
    expect(read.drafts).toHaveLength(RECENT_DRAFTS_MAX);
    expect(read.notes).toHaveLength(RECENT_NOTES_MAX);
    // SAME PLATFORM FIRST (all four, newest first, the tie broken by id DESC),
    // then the newest other-platform draft — never the newer-but-other rows
    // ahead of a same-platform one.
    const tied = [same[1], same[2]].sort((a, b) => (a.id < b.id ? 1 : -1));
    expect(read.drafts.map((d) => d.id)).toEqual([same[3].id, ...tied.map((d) => d.id), same[0].id, other[3].id]);
    // DETERMINISTIC: the same rows, the same answer.
    const again = await scope.accessors.recentContextCandidates(query);
    expect(again.drafts.map((d) => d.id)).toEqual(read.drafts.map((d) => d.id));
    expect(again.notes.map((n) => n.feedback.id)).toEqual(read.notes.map((n) => n.feedback.id));
    // The notes: same-platform drafts' reactions first, then newest.
    expect(read.notes.map((n) => n.about.id)).toEqual([same[1].id, same[0].id, other[1].id]);

    // ...and THROUGH THE OPERATION: the snapshot names exactly what was sent,
    // in prompt order, with the budget that bounded it.
    const s = scripted(ideationReply());
    await generate(db, owner, profileId, s.provider, anySlots(), ideation("op-1"), new Date());
    const snap = await snapshotOf("op-1");
    expect(snap.recentContext).not.toBeNull();
    const rc = snap.recentContext!;
    expect(rc.charBudget).toBe(CONFIG_V1_SEED.generation.recentContextCharBudget);
    expect(rc.charsUsed).toBeLessThanOrEqual(rc.charBudget);
    expect(rc.records.map((r) => r.position)).toEqual(rc.records.map((_, i) => i));
    const sentDrafts = rc.records.filter((r) => r.kind === "draft").map((r) => r.id);
    // The drafts the operation read are the accessor's, in its order (the
    // op-1 draft itself is not yet a generation when its prompt is built).
    expect(sentDrafts).toEqual(read.drafts.map((d) => d.id).slice(0, sentDrafts.length));
    expect(rc.records.filter((r) => r.kind === "note")).toHaveLength(RECENT_NOTES_MAX);
    // No creator text in the snapshot: ids, closed labels and numbers only.
    expect(JSON.stringify(snap)).not.toContain("alpha");
    expect(JSON.stringify(snap)).not.toContain(FORM_INPUT);
  });

  it("1b. THE BUDGET is one configured number across both lists: notes are kept first, a record that does not fit is excluded WHOLE and recorded, and 0 sends no history", async () => {
    await rawBrain(profileId, ws);
    const g1 = await seedDraft({ createdAt: at(1) });
    const g2 = await seedDraft({ createdAt: at(2) });
    await seedReaction(g1, "wrong_angle", "i never film at the gym", at(3));
    const scope = await mintProfileScope(db, owner, profileId);
    const candidates = await scope.accessors.recentContextCandidates({
      modes: ["ideation"], platform: PLATFORM, currentPieceId: null, excludeGenerationIds: [],
    });
    const build = (charBudget: number) =>
      buildRecentContext({ candidates, charBudget, sequel: false, materialIds: [], reportedSpecificsOf });
    const unbounded = build(100_000);
    const noteChars = unbounded.snapshot.records.find((r) => r.kind === "note")!.chars;
    const draftChars = unbounded.snapshot.records.filter((r) => r.kind === "draft").map((r) => r.chars);
    expect(unbounded.context.entries).toHaveLength(3);
    // Exactly the note fits: both drafts are excluded whole, as over_budget.
    const tight = build(noteChars);
    expect(tight.context.entries.map((e) => e.kind)).toEqual(["note"]);
    expect(tight.snapshot.exclusions.filter((x) => x.reason === "over_budget").map((x) => x.id).sort())
      .toEqual([g1.id, g2.id].sort());
    expect(tight.snapshot.charsUsed).toBe(noteChars);
    // NOTES FIRST: at a budget ONE DRAFT would fill on its own, the note —
    // the shorter, likelier correction — is what is kept, and the draft that
    // would have crowded it out is the one excluded.
    expect(Math.max(...draftChars)).toBeGreaterThan(noteChars);
    const crowded = build(Math.max(...draftChars));
    expect(crowded.context.entries.map((e) => e.kind)).toEqual(["note"]);
    // The note AND one draft fit; the second is still tried (continue, not break).
    const one = build(noteChars + Math.max(...draftChars));
    expect(one.context.entries).toHaveLength(2);
    // 0 IS "SEND NO HISTORY", and every candidate is recorded as excluded.
    const off = build(0);
    expect(off.context.entries).toEqual([]);
    expect(off.snapshot.exclusions).toHaveLength(3);
    // ...and the configured value is what the OPERATION uses.
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, generation: { ...content.generation, recentContextCharBudget: noteChars } },
      "test-admin"
    );
    const s = scripted(ideationReply());
    await generate(db, owner, profileId, s.provider, anySlots(), ideation("op-b"), new Date());
    const snap = await snapshotOf("op-b");
    expect(snap.recentContext!.charBudget).toBe(noteChars);
    expect(snap.recentContext!.records.map((r) => r.kind)).toEqual(["note"]);
    expect(historyBlock(s.calls[0].prompt)).toContain("i never film at the gym");
    // The note carries the FIRST passage of the draft it is about ("alpha");
    // the draft records, which would carry "bravo" too, did not fit.
    expect(historyBlock(s.calls[0].prompt)).not.toContain("bravo");
  });

  it("1c. THE CURRENT PIECE RANKS FIRST, ahead of a newer same-platform draft", async () => {
    await rawBrain(profileId, ws);
    const source = await seedDraft({ createdAt: at(0) });
    const [piece] = await db.insert(creativePieces).values({
      profileId, workspaceId: ws, sourceGenerationId: source.id, sourceIdeaIndex: 1, quoteConfigVersion: 1,
    }).returning();
    const pieceScript = await seedDraft({ createdAt: at(1), mode: "ideation", pieceId: piece.id });
    const newer = await seedDraft({ createdAt: at(50) });
    const scope = await mintProfileScope(db, owner, profileId);
    const read = await scope.accessors.recentContextCandidates({
      modes: ["ideation"], platform: PLATFORM, currentPieceId: piece.id, excludeGenerationIds: [source.id],
    });
    expect(read.drafts.map((d) => d.id)).toEqual([pieceScript.id, newer.id]);
    // The chosen concept is labelled, and the piece is recorded at its version.
    const built = buildRecentContext({
      candidates: await scope.accessors.recentContextCandidates({
        modes: ["ideation"], platform: PLATFORM, currentPieceId: null, excludeGenerationIds: [],
      }),
      charBudget: 100_000, sequel: false, materialIds: [], reportedSpecificsOf,
    });
    const sourceRecord = built.snapshot.records.find((r) => r.id === source.id)!;
    expect(sourceRecord.labels).toContain("chosen");
    expect(built.snapshot.pieces).toEqual([{ id: piece.id, version: piece.version }]);
    // ...and a CANCELLED piece chose nothing.
    await db.update(creativePieces).set({ state: "cancelled" }).where(eq(creativePieces.id, piece.id));
    const afterCancel = buildRecentContext({
      candidates: await scope.accessors.recentContextCandidates({
        modes: ["ideation"], platform: PLATFORM, currentPieceId: null, excludeGenerationIds: [],
      }),
      charBudget: 100_000, sequel: false, materialIds: [], reportedSpecificsOf,
    });
    expect(afterCancel.snapshot.records.find((r) => r.id === source.id)!.labels).not.toContain("chosen");
    expect(afterCancel.snapshot.pieces).toEqual([]);
  });

  // ------------------------------------------- 2. no other profile's rows

  it("2. NO OTHER PROFILE'S ROWS — the same-workspace sibling's and the foreign workspace's drafts and reactions never reach the prompt or the snapshot (unconditional)", async () => {
    await rawBrain(profileId, ws);
    await rawBrain(siblingId, ws);
    await rawBrain(foreignId, foreignWs);
    const mine = await seedDraft({ createdAt: at(1), output: ideasWith(["ownmark", "ownmark", "ownmark"]) });
    const sibling = await seedDraft({
      pid: siblingId, createdAt: at(50), output: ideasWith(["siblingmark", "siblingmark", "siblingmark"]),
    });
    const foreign = await seedDraft({
      pid: foreignId, workspaceId: foreignWs, createdAt: at(51),
      output: ideasWith(["foreignmark", "foreignmark", "foreignmark"]),
    });
    await seedReaction(sibling, "wrong_angle", "sibling note words", at(52));
    await seedReaction(foreign, "wrong_angle", "foreign note words", at(53));
    await seedReaction(mine, "wrong_angle", "my own note words", at(2));
    const s = scripted(ideationReply());
    await generate(db, owner, profileId, s.provider, anySlots(), ideation("op-iso"), new Date());
    const prompt = s.calls[0].prompt;
    // NON-VACUITY: this profile's own history IS there.
    expect(historyBlock(prompt)).toContain("ownmark");
    expect(historyBlock(prompt)).toContain("my own note words");
    for (const leaked of ["siblingmark", "foreignmark", "sibling note words", "foreign note words"]) {
      expect(prompt, leaked).not.toContain(leaked);
    }
    const ids = JSON.stringify((await snapshotOf("op-iso")).recentContext);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(sibling.id);
    expect(ids).not.toContain(foreign.id);
    // ...and the presence check is scoped too: asked about every id, it
    // answers only for this profile's.
    const scope = await mintProfileScope(db, owner, profileId);
    const present = await scope.accessors.recentContextPresent({
      generationIds: [mine.id, sibling.id, foreign.id],
      feedbackIds: [],
    });
    expect(present.generationIds).toEqual([mine.id]);
  });

  // ------------------------------------- 3. rejection avoided unless sequel

  it("3. A REJECTION IS AVOIDED unless the creator explicitly asks for a sequel — labelled, instructed, and part of the request's identity", async () => {
    await rawBrain(profileId, ws);
    const rejected = await seedDraft({ createdAt: at(1), output: ideasWith(["gymmark", "gymmark", "gymmark"]) });
    await seedReaction(rejected, "wrong_angle", "not this one again", at(2));

    const plain = scripted(ideationReply());
    await generate(db, owner, profileId, plain.provider, anySlots(), ideation("op-plain"), new Date());
    const plainBlock = historyBlock(plain.calls[0].prompt);
    expect(plainBlock).toContain(RECENT_WORK_AVOID_NOTE);
    expect(plainBlock).not.toContain(RECENT_WORK_SEQUEL_NOTE);
    expect(plainBlock).toContain(RECENT_WORK_LABELS[REACTION_LABELS.wrong_angle]);
    expect(plainBlock).toContain("gymmark");
    expect((await snapshotOf("op-plain")).sequel).toBe(false);

    const sequel = scripted(ideationReply());
    await generate(db, owner, profileId, sequel.provider, anySlots(), ideation("op-sequel", { sequel: true }), new Date());
    const sequelBlock = historyBlock(sequel.calls[0].prompt);
    expect(sequelBlock).toContain(RECENT_WORK_SEQUEL_NOTE);
    expect(sequelBlock).not.toContain(RECENT_WORK_AVOID_NOTE);
    expect((await snapshotOf("op-sequel")).sequel).toBe(true);
    // A sequel and a plain request are different intents: the same id refuses
    // the other one rather than replaying a prompt the creator did not ask for.
    expect(intentHashOf(ideation("x", { sequel: true }), null)).not.toBe(
      intentHashOf(ideation("x"), null)
    );
    // ...while `sequel: false` hashes exactly like a pre-L3 request.
    expect(intentHashOf(ideation("x", { sequel: false }), null)).toBe(intentHashOf(ideation("x"), null));
  });

  it("3b. A SEQUEL IS NEVER INFERRED OR SMUGGLED: refused on a mode that reads no history, refused as a non-boolean, before anything is claimed or called", async () => {
    await rawBrain(profileId, ws);
    await expect(
      generate(db, owner, profileId, never(), anySlots(), {
        mode: "hooks", attemptId: "op-h", input: "x y z", platform: PLATFORM, sequel: true,
      }, new Date())
    ).rejects.toBeInstanceOf(GenerationAssemblyError);
    await expect(
      generate(db, owner, profileId, never(), anySlots(), {
        ...ideation("op-s"), sequel: "yes" as unknown as boolean,
      }, new Date())
    ).rejects.toBeInstanceOf(GenerationAssemblyError);
    expect(await db.select().from(generationAttempts).where(eq(generationAttempts.workspaceId, ws))).toHaveLength(0);
    // ...and the words "a sequel" in the creator's input do NOT ask for one.
    const s = scripted(ideationReply());
    await seedDraft({ createdAt: at(1) });
    await generate(db, owner, profileId, s.provider, anySlots(), ideation("op-words", { input: `${FORM_INPUT} make it a sequel` }), new Date());
    expect(historyBlock(s.calls[0].prompt)).toContain(RECENT_WORK_AVOID_NOTE);
    expect((await snapshotOf("op-words")).sequel).toBe(false);
  });

  // ------------------------------------- 11. LEAVE THIS OUT (audit P6-A1, R-174)

  it("11. LEAVE THIS OUT: a reaction the creator left out reaches no later prompt, as a note or as a label; the snapshot records it as creator_excluded; the export carries the stamp", async () => {
    await rawBrain(profileId, ws);
    const kept = await seedDraft({ createdAt: at(1), output: ideasWith(["keptmark", "keptmark", "keptmark"]) });
    const left = await seedDraft({ createdAt: at(2), output: ideasWith(["leftmark", "leftmark", "leftmark"]) });
    const keepNote = await seedReaction(kept, "wrong_angle", "keepword about the pacing", at(10));
    const dropNote = await seedReaction(left, "off_voice", "dropword private aside", at(11));

    // BEFORE: both notes reach the prompt, and the draft carries its label.
    const before = scripted(ideationReply());
    await generate(db, owner, profileId, before.provider, anySlots(), ideation("op-before"), new Date());
    const beforeBlock = historyBlock(before.calls[0].prompt);
    expect(beforeBlock).toContain("keepword");
    expect(beforeBlock).toContain("dropword");
    expect(beforeBlock).toContain(RECENT_WORK_LABELS[REACTION_LABELS.off_voice]);

    // THE PRESS: one column, from the database clock, and idempotent.
    const stamped = await excludeFeedbackFromHistory(db, owner, profileId, dropNote.id);
    expect(stamped.historyExcludedAt).toBeInstanceOf(Date);
    expect(stamped.reaction).toBe("off_voice");
    expect(stamped.note).toBe("dropword private aside");
    const again = await excludeFeedbackFromHistory(db, owner, profileId, dropNote.id);
    expect(again.historyExcludedAt?.getTime()).toBe(stamped.historyExcludedAt?.getTime());

    // AFTER: the left-out note is gone — its words AND its label — and so is
    // the draft it was the only reaction on (Phase 6 tenancy gate, R-174:
    // keeping a rejected draft as unlabelled history would bring back a
    // concept the creator turned down), while the kept note and its draft
    // still go.
    const after = scripted(ideationReply());
    await generate(db, owner, profileId, after.provider, anySlots(), ideation("op-after"), new Date());
    const afterBlock = historyBlock(after.calls[0].prompt);
    expect(afterBlock).toContain("keepword");
    expect(afterBlock).toContain("keptmark");
    expect(afterBlock).not.toContain("dropword");
    expect(afterBlock).not.toContain(RECENT_WORK_LABELS[REACTION_LABELS.off_voice]);
    expect(afterBlock).not.toContain("leftmark");
    // THE SNAPSHOT says what the creator's choice kept out, ids only.
    const snap = (await snapshotOf("op-after")).recentContext!;
    expect(snap.exclusions).toContainEqual({ kind: "note", id: dropNote.id, reason: "creator_excluded" });
    expect(snap.records.map((r) => r.id)).not.toContain(dropNote.id);
    expect(snap.records.map((r) => r.id)).toContain(keepNote.id);
    expect(snap.records.map((r) => r.id)).not.toContain(left.id);
    expect(snap.exclusions).toContainEqual({ kind: "draft", id: left.id, reason: "creator_excluded" });
    expect(JSON.stringify(snap)).not.toContain("dropword");
    // ...and the snapshot of the operation BEFORE the press is unchanged.
    const beforeSnap = (await snapshotOf("op-before")).recentContext!;
    expect(beforeSnap.records.map((r) => r.id)).toContain(dropNote.id);
    expect(beforeSnap.exclusions.filter((x) => x.reason === "creator_excluded")).toEqual([]);

    // THE EXPORT CARRIES THE STAMP: `exportPage` is what the JSON export pages
    // `generation_feedback` through, whole rows.
    const scope = await mintProfileScope(db, owner, profileId);
    const exported = (await scope.accessors.exportPage("generation_feedback", 0)) as {
      id: string;
      historyExcludedAt: Date | null;
    }[];
    expect(exported.find((r) => r.id === dropNote.id)?.historyExcludedAt).toBeInstanceOf(Date);
    expect(exported.find((r) => r.id === keepNote.id)?.historyExcludedAt).toBeNull();
  });

  it("11c. A draft keeps its place when only SOME of its reactions were left out, and a draft with no reaction is ordinary history", async () => {
    await rawBrain(profileId, ws);
    const mixed = await seedDraft({ createdAt: at(1), output: ideasWith(["mixmark", "mixmark", "mixmark"]) });
    const plain = await seedDraft({ createdAt: at(2), output: ideasWith(["plainmark", "plainmark", "plainmark"]) });
    const leftOut = await seedReaction(mixed, "off_voice", null, at(3));
    await seedReaction(mixed, "wrong_angle", null, at(4));
    await excludeFeedbackFromHistory(db, owner, profileId, leftOut.id);
    const s = scripted(ideationReply());
    await generate(db, owner, profileId, s.provider, anySlots(), ideation("op-mixed"), new Date());
    const block = historyBlock(s.calls[0].prompt);
    expect(block).toContain("mixmark");
    expect(block).toContain("plainmark");
    expect(block).toContain(RECENT_WORK_LABELS[REACTION_LABELS.wrong_angle]);
    expect(block).not.toContain(RECENT_WORK_LABELS[REACTION_LABELS.off_voice]);
    const snap = (await snapshotOf("op-mixed")).recentContext!;
    expect(snap.records.map((r) => r.id)).toEqual(expect.arrayContaining([mixed.id, plain.id]));
    expect(snap.exclusions.filter((x) => x.kind === "draft" && x.reason === "creator_excluded")).toEqual([]);
  });

  it("11b. LEAVE THIS OUT is scoped and one-way: a sibling's, a foreign and a malformed id are refused alike; a viewer may not; the stamp cannot be cleared and the reaction cannot be rewritten", async () => {
    await rawBrain(profileId, ws);
    await rawBrain(siblingId, ws);
    await rawBrain(foreignId, foreignWs);
    const mine = await seedReaction(await seedDraft({ createdAt: at(1) }), "off_voice", "mine", at(2));
    const sibling = await seedReaction(
      await seedDraft({ pid: siblingId, createdAt: at(3) }),
      "off_voice",
      "sibling words",
      at(4)
    );
    const foreign = await seedReaction(
      await seedDraft({ pid: foreignId, workspaceId: foreignWs, createdAt: at(5) }),
      "off_voice",
      "foreign words",
      at(6)
    );
    for (const id of [sibling.id, foreign.id, "not-a-uuid"]) {
      const err = await excludeFeedbackFromHistory(db, owner, profileId, id).catch((e: unknown) => e);
      expect(err, id).toBeInstanceOf(FeedbackExclusionTargetError);
      expect((err as Error).message).toBe(new FeedbackExclusionTargetError().message);
    }
    const untouched = await db.select().from(generationFeedback);
    expect(untouched.every((r) => r.historyExcludedAt === null)).toBe(true);

    // A VIEWER may not decide what a creator's drafts are shown.
    await db.update(memberships).set({ role: "viewer" }).where(eq(memberships.workspaceId, ws));
    const viewer = await withWorkspace(db, { authUserId: "user_a" });
    await expect(excludeFeedbackFromHistory(db, viewer, profileId, mine.id)).rejects.toBeInstanceOf(ProfileRoleError);
    await db.update(memberships).set({ role: "owner" }).where(eq(memberships.workspaceId, ws));

    await excludeFeedbackFromHistory(db, owner, profileId, mine.id);
    // ONE-WAY, AT THE DATABASE (migration 0069's trigger): the stamp cannot be
    // cleared, and the reaction, its target and its timestamp cannot change.
    // Drizzle wraps the driver error, so the trigger's own words are on `cause`.
    const refusal = async (statement: ReturnType<typeof sql>): Promise<string> => {
      const err = (await db.execute(statement).then(
        () => null,
        (e: unknown) => e
      )) as { message?: string; cause?: { message?: string } } | null;
      expect(err, "the UPDATE was accepted").not.toBeNull();
      return `${err?.cause?.message ?? ""} ${err?.message ?? ""}`;
    };
    expect(
      await refusal(sql`UPDATE generation_feedback SET history_excluded_at = NULL WHERE id = ${mine.id}`)
    ).toMatch(/history_excluded_at moves only from NULL/);
    expect(
      await refusal(sql`UPDATE generation_feedback SET reaction = 'used_as_is' WHERE id = ${mine.id}`)
    ).toMatch(/event record/);
    expect(
      await refusal(sql`UPDATE generation_feedback SET created_at = now() - interval '1 day' WHERE id = ${sibling.id}`)
    ).toMatch(/event record/);
    // NARROW ON PURPOSE: `note` stays writable at the database (a future
    // pseudonymisation executor); its immutability is the writer list's.
    await db.execute(sql`UPDATE generation_feedback SET note = 'pseudonymised' WHERE id = ${sibling.id}`);
  });

  // ------------------------------ 4/5/6. preference: approve, reverse, identity

  it("4-6. REMEMBER THIS: a proposed preference is NOT used; once approved it reaches the prompt in its own authority class; a reversal is effective for new operations; the old operation's context identity is unchanged", async () => {
    const { killtestDocId } = await realBrain();
    const preference = "every shot is filmed by me alone at my desk";

    const remembered = await rememberForFutureDrafts(db, owner, profileId, { text: preference });
    // A PROPOSED VERSION, never an active one, with per-field provenance: the
    // new position cites a creator_authored input holding the words verbatim.
    expect(remembered.pointer).toBe("/rules/1");
    expect(remembered.doc.status).toBe("proposed");
    expect(remembered.doc.version).toBe(2);
    expect((remembered.doc.content as { rules: string[] }).rules).toEqual([
      "it must not sound like an advert",
      preference,
    ]);
    const evidence = (remembered.doc.sourceEvidence as { field: string; quote: string }[]).find(
      (e) => e.field === "/rules/1"
    );
    expect(evidence?.quote).toBe(preference);
    // The active version did not move.
    const [stillActive] = await db.select().from(brainDocs).where(eq(brainDocs.id, killtestDocId));
    expect(stillActive.status).toBe("active");

    // NOT IN FORCE: the next draft's prompt does not carry it.
    const before = scripted(ideationReply());
    await generate(db, owner, profileId, before.provider, anySlots(), ideation("op-before"), new Date());
    expect(before.calls[0].prompt).not.toContain(preference);
    expect(before.calls[1].prompt).not.toContain(preference);

    // APPROVED on /brain's two acts: it is now a brain claim — in the brain
    // block, scored as the creator's own rule, and NOT in the history block.
    await approve(remembered.doc.id, 2);
    const approved = scripted(ideationReply(["/rules/0", "/rules/1"]));
    await generate(db, owner, profileId, approved.provider, anySlots(), ideation("op-approved"), new Date());
    expect(brainBlock(approved.calls[0].prompt)).toContain(preference);
    expect(historyBlock(approved.calls[0].prompt)).not.toContain(preference);
    expect(approved.calls[1].prompt).toContain(preference);
    const oldSnapshot = await snapshotOf("op-approved");
    const oldGeneration = (await db.select().from(generations).where(eq(generations.attemptId, "op-approved")))[0];

    // REVERSED: the creator replaces the rule through the same edit path.
    const reversal = "i am happy to film with a helper now";
    const edited = await editBrainDocument(db, owner, profileId, remembered.doc.id, [
      { pointer: "/rules/1", value: reversal },
    ]);
    await approve(edited.id, 2);
    const after = scripted(ideationReply(["/rules/0", "/rules/1"]));
    await generate(db, owner, profileId, after.provider, anySlots(), ideation("op-after"), new Date());
    expect(brainBlock(after.calls[0].prompt)).toContain(reversal);
    expect(after.calls[0].prompt).not.toContain(preference);

    // THE OLD OPERATION'S CONTEXT IDENTITY IS UNCHANGED: a same-id resubmission
    // replays its own generation with no call, and its claim still names the
    // activation and the history it was built from.
    const replay = await generate(db, owner, profileId, never(), anySlots(), ideation("op-approved"), new Date());
    expect(replay.replayed).toBe(true);
    expect(replay.generation.id).toBe(oldGeneration.id);
    expect(await snapshotOf("op-approved")).toEqual(oldSnapshot);
    expect((await snapshotOf("op-after")).brainActivationId).not.toBe(oldSnapshot.brainActivationId);
    expect(oldGeneration.brainActivationId).toBe(oldSnapshot.brainActivationId);
  });

  it("4b. REMEMBER refuses nothing-to-say, and a viewer or an editor cannot propose — nothing is written either way", async () => {
    await realBrain();
    for (const text of ["", "   ", "[check]"]) {
      await expect(rememberForFutureDrafts(db, owner, profileId, { text })).rejects.toBeInstanceOf(
        BrainEditUnchangedError
      );
    }
    // A VIEWER and an EDITOR: proposing a brain edit is the owner's act, the
    // same gate `/brain`'s edit runs (R-118).
    for (const role of ["viewer", "editor"] as const) {
      await db.update(memberships).set({ role }).where(eq(memberships.workspaceId, ws));
      const demoted = await withWorkspace(db, { authUserId: "user_a" });
      await expect(
        rememberForFutureDrafts(db, demoted, profileId, { text: "film it alone" })
      ).rejects.toBeInstanceOf(ProfileRoleError);
    }
    const versions = await db.select().from(brainDocs).where(and(eq(brainDocs.profileId, profileId), eq(brainDocs.kind, "killtest")));
    expect(versions).toHaveLength(1);
  });

  // --------------------------------------------------- 7. no laundering

  it("7. NO LAUNDERING: history is in neither corpus, a [check]ed, flagged or hard-shaped passage is never sent, and a specific that appears only in history does not pass the scan", async () => {
    await rawBrain(profileId, ws);
    // One draft with a [check]ed concept, a concept carrying a specific its
    // own scan REPORTED, and one clean concept.
    await seedDraft({
      createdAt: at(1),
      output: {
        ...legacyIdeas(),
        ideas: [
          { ...legacyIdeas().ideas[0], hook: "the shoot that cost me everything [check]" },
          { ...legacyIdeas().ideas[1], hook: "what happened at Brightwater studio" },
          { ...legacyIdeas().ideas[2], hook: `${legacyIdeas().ideas[2].hook} cleanmark` },
        ],
      },
      reported: ["Brightwater"],
    });
    // A draft whose concept carries an UNFLAGGED amount — traced when that
    // draft was made, so its own scan reported nothing. It is still NOT shown
    // (L3 gate, A-L2): `$4,000` is a hard-enforced shape, untraced in any new
    // draft, so sending it would invite a rewrite or a charged refusal. The
    // draft's other concepts are shown.
    await seedDraft({
      createdAt: at(2),
      // `412 takes` is a FLAG-ONLY shape (a bare count): it IS shown, and the
      // control below is the witness that showing it vouches for nothing.
      output: ideasWith(["for $4,000", "plainmark 412 takes", "plainmark"]),
    });
    const s = scripted([
      JSON.stringify(ideasWith(["for $4,000", "zz 412 takes", "yy"])),
      JSON.stringify(ideasWith(["for $4,000", "zz 412 takes", "yy"])),
      killTestReply(["/rules/0"]),
    ]);
    const result = await generate(db, owner, profileId, s.provider, anySlots(), ideation("op-launder"), new Date());
    const block = historyBlock(s.calls[0].prompt);
    expect(block).toContain("cleanmark");
    // (The block's own note names the marker, so the PASSAGE is what is checked.)
    expect(block).not.toContain("the shoot that cost me everything");
    expect(block).not.toContain("Brightwater");
    // NON-VACUITY for the hard-shape rule: the same draft's clean concepts ARE
    // shown, so it is the passage that went, not the draft.
    expect(block).toContain("plainmark");
    expect(block).not.toContain("$4,000");
    expect(block).not.toMatch(/4,?000/);
    expect(block).toContain("412 takes");
    // THE SPECIFIC THAT APPEARS ONLY IN HISTORY IS UNTRACED — and since the
    // history no longer shows it, this model invents it: still refused after
    // one rewrite, never stored as usable (the laundering half of case 7).
    expect(result.generation.outcome).toBe("honest_refusal");
    const findings = JSON.stringify(result.generation.killTest);
    expect(findings).toMatch(/4,?000/);

    // CONTROL (non-vacuity): the SAME output passes when the creator's own
    // input carries the amount — so it was the corpus, not the fixture.
    const ok = scripted([JSON.stringify(ideasWith(["for $4,000", "zz 412 takes", "yy"])), killTestReply(["/rules/0"])]);
    const control = await generate(db, owner, profileId, ok.provider, anySlots(), ideation("op-control", { input: `${FORM_INPUT} for $4,000` }), new Date());
    expect(control.generation.outcome).toBe("usable");
    // ...AND THE HISTORY THAT WAS SHOWN VOUCHED FOR NOTHING: `412` sat in this
    // operation's history block too, and the stored scan still reports it as
    // an untraced (flag-only) specific.
    expect(historyBlock(ok.calls[0].prompt)).toContain("412 takes");
    const controlTokens = (
      control.generation.killTest as { finalAttempt: { traceability: { token: string }[] } }
    ).finalAttempt.traceability.map((f) => f.token);
    expect(controlTokens).toContain("412");
  });

  it("7b. THE CORPUS, DIRECTLY: `traceabilityCorpusFor` and the prompt read the same context, and only the prompt carries history", () => {
    const context: GenerationContext = {
      universalLaws: [],
      frameworks: [],
      brain: { voice: ["register: plain"], strategy: [], killtest: [] },
      input: "today i filmed",
      platform: PLATFORM,
      unvouchedSpecifics: [],
      creative: null,
      recentWork: {
        sequel: false,
        entries: [{ kind: "draft", labels: ["concept_batch"], text: "the $4,000 rig at Brightwater" }],
      },
    };
    const prompt = assembleGenerationPrompt({ mode: "ideation", context }).prompt;
    expect(prompt).toContain("the $4,000 rig at Brightwater");
    const corpus = traceabilityCorpusFor(context);
    expect(JSON.stringify(corpus)).not.toContain("Brightwater");
    expect(JSON.stringify(corpus)).not.toContain("4,000");
    // A mode that reads no history refuses one, and an absent key is refused
    // through a cast (typed shut is not shut).
    expect(() => assembleGenerationPrompt({ mode: "hooks", context })).toThrow(GenerationAssemblyError);
    const { recentWork: _dropped, ...withoutKey } = context;
    void _dropped;
    expect(() =>
      assembleGenerationPrompt({ mode: "ideation", context: withoutKey as unknown as GenerationContext })
    ).toThrow(GenerationAssemblyError);
    expect(() =>
      assembleGenerationPrompt({
        mode: "ideation",
        context: {
          ...context,
          recentWork: { sequel: false, entries: [{ kind: "draft", labels: ["made_up" as never], text: "x" }] },
        },
      })
    ).toThrow(GenerationAssemblyError);
  });

  it("7c. A CLAIMED PASSAGE IS NEVER SENT: a concept carrying a performance, certainty or concealment claim its own scan reported stays out of history, whatever its case — and a draft whose stored claims cannot be read is unreadable", async () => {
    await rawBrain(profileId, ws);
    const claimed = await seedDraft({
      createdAt: at(1),
      output: ideasWith(["this Goes Viral overnight", "claimcleanmark", "claimcleanmark"]),
      // The scan stores the matched vocabulary LOWERCASED (`ClaimFinding.token`).
      claims: ["goes viral"],
    });
    const legacy = await seedDraft({ createdAt: at(2), output: ideasWith(["legacymark", "legacymark", "legacymark"]), claims: null });
    const scope = await mintProfileScope(db, owner, profileId);
    const built = buildRecentContext({
      candidates: await scope.accessors.recentContextCandidates({
        modes: ["ideation"], platform: PLATFORM, currentPieceId: null, excludeGenerationIds: [],
      }),
      charBudget: 100_000, sequel: false, materialIds: [], reportedSpecificsOf,
    });
    const sent = built.context.entries.map((e) => e.text).join("\n");
    // NON-VACUITY: the same draft's unclaimed concepts are sent.
    expect(sent).toContain("claimcleanmark");
    expect(sent.toLowerCase()).not.toContain("goes viral");
    expect(built.snapshot.records.map((r) => r.id)).toContain(claimed.id);
    // FAIL-CLOSED: no `claims` list is a document this product never writes.
    expect(sent).not.toContain("legacymark");
    expect(built.snapshot.exclusions).toContainEqual({ kind: "draft", id: legacy.id, reason: "unreadable" });
  });

  it("7d. NO HARD-ENFORCED SPECIFIC SHAPE IN HISTORY: a passage or a reaction note carrying a date, an amount, a percentage or a multiplier is not sent; a flag-only count is", async () => {
    await rawBrain(profileId, ws);
    const draft = await seedDraft({
      createdAt: at(1),
      output: ideasWith(["filmed on 2026-08-31 dateshape", "views rose 12% pctshape", "it took 412 takes countshape"]),
    });
    const other = await seedDraft({ createdAt: at(2), output: ideasWith(["notemark", "notemark", "notemark"]) });
    await seedReaction(draft, "wrong_angle", "the rig cost me $40 last time", at(3));
    await seedReaction(other, "not_filmable", "i never film at the gym", at(4));
    const scope = await mintProfileScope(db, owner, profileId);
    const built = buildRecentContext({
      candidates: await scope.accessors.recentContextCandidates({
        modes: ["ideation"], platform: PLATFORM, currentPieceId: null, excludeGenerationIds: [],
      }),
      charBudget: 100_000, sequel: false, materialIds: [], reportedSpecificsOf,
    });
    const sent = built.context.entries.map((e) => e.text).join("\n");
    for (const hard of ["2026-08-31", "dateshape", "12%", "pctshape", "$40"]) {
      expect(sent, hard).not.toContain(hard);
    }
    // A bare count is FLAG-ONLY: reusing it costs a `[check]` offer, not a
    // refusal, so it is still shown.
    expect(sent).toContain("412 takes");
    // THE NOTE'S WORDS ARE DROPPED, NOT THE NOTE: its label and the draft
    // passage it is about still go; the other note's words are untouched.
    const notes = built.context.entries.filter((e) => e.kind === "note");
    expect(notes).toHaveLength(2);
    expect(notes.flatMap((n) => n.labels)).toContain(REACTION_LABELS.wrong_angle);
    expect(sent).not.toContain("the rig cost me");
    expect(sent).toContain(`${RECENT_WORK_NOTE_PREFIX}i never film at the gym`);
  });

  it("7e. HISTORY IS NOT BASIS MATERIAL (R-148, v2): neither basis corpus reads it, and a premise quoting a history note as its basis is refused — the same quote in the creator's own note passes", () => {
    const historyWords = `${FORM_EXCERPT} and kept none of it`;
    const ownNote = "a concept about my editing week";
    const context = (creatorNote: string): GenerationContext => ({
      universalLaws: [],
      frameworks: [],
      brain: { voice: ["register: plain"], strategy: [], killtest: [] },
      input: creatorNote,
      platform: PLATFORM,
      unvouchedSpecifics: [],
      creative: {
        formChoice: "personal_story_observation",
        constraints: NO_LIMITS,
        creatorNote,
        carriedBasis: [],
        carriedUnconfirmed: [],
        approvedFrameworkNames: [],
      },
      recentWork: {
        sequel: false,
        entries: [
          { kind: "draft", labels: ["concept_batch"], text: historyWords },
          { kind: "note", labels: ["rejected_wrong_angle"], text: `${RECENT_WORK_NOTE_PREFIX}${historyWords}` },
        ],
      },
    });
    const withHistoryOnly = context(ownNote);
    // NON-VACUITY: the prompt does carry the history.
    expect(assembleGenerationPrompt({ mode: "ideation", context: withHistoryOnly }).prompt).toContain(historyWords);
    expect(JSON.stringify(basisCorpusFor(withHistoryOnly))).not.toContain("lens change");
    expect(JSON.stringify(creativeCheckContextFor(withHistoryOnly)!.basisCorpus)).not.toContain("lens change");
    // A v2 reply whose story premise quotes the history as its basis excerpt.
    const reply = JSON.stringify(v2Ideas(["personal_story_observation"]));
    const basisFindings = (ctx: GenerationContext) =>
      runKillTest({
        output: parseScriptOutput({ text: reply, mode: "ideation", contract: contractOf(ctx) }),
        mode: "ideation",
        context: ctx,
      }).hardRules.filter((f) => f.rule === "unsupported_experience");
    expect(basisFindings(withHistoryOnly).map((f) => f.shape)).toContain("excerpt-not-in-material");
    // CONTROL: the same words in the creator's OWN note are a basis.
    const ownWords = context(FORM_INPUT);
    expect(basisCorpusFor(ownWords).join("\n")).toContain(FORM_EXCERPT);
    expect(basisFindings(ownWords)).toEqual([]);
  });

  // ------------------------------------------------- 8. erased context

  it("8. ERASED CONTEXT ENDS THE OPERATION: a history row erased before settlement means recovery_required, candidate cleared, no debit — and a resubmission calls nothing", async () => {
    await rawBrain(profileId, ws);
    const history = await seedDraft({ createdAt: at(1) });
    // The history row is erased WHILE the vendor answers (the scoring call):
    // the claim's snapshot already names it, the candidate is built from it.
    const s = scripted(ideationReply(), async (n) => {
      if (n === 2) {
        await db.execute(sql`DELETE FROM generations WHERE id = ${history.id}`);
      }
    });
    await expect(
      generate(db, owner, profileId, s.provider, anySlots(), ideation("op-erased"), new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    const claim = await attemptRow("op-erased");
    expect(claim.state).toBe("recovery_required");
    expect(claim.candidate).toBeNull();
    expect(recentContextIdsOf(claim)?.generationIds).toEqual([history.id]);
    const debits = await db.select().from(creditLedger).where(and(eq(creditLedger.workspaceId, ws), eq(creditLedger.kind, "debit")));
    expect(debits).toHaveLength(0);
    expect(await db.select().from(generations).where(eq(generations.attemptId, "op-erased"))).toHaveLength(0);
    // THE VENDOR SPEND STAYS INSIDE BOTH UNCHARGED BOUNDS (L3 billing gate,
    // BL-1): the operation was not charged, so none of its `model_usage` rows
    // may be marked consumed — a consumed row drops out of
    // `countUnchargedBillableAttempts` and `sumUnchargedBillableCostMicroUsd`,
    // which is how a free-tier spend bound widens unseen.
    const usage = await db.select().from(modelUsage).where(eq(modelUsage.attemptId, "op-erased"));
    expect(usage.length).toBeGreaterThan(0);
    for (const row of usage) expect(row.consumedIncludedBuild, row.id).toBe(false);
    const erasedScope = await mintProfileScope(db, owner, profileId);
    const since = new Date(Date.now() - 24 * 3600_000);
    expect(
      await erasedScope.accessors.countUnchargedBillableAttempts({ purpose: GENERATION_PURPOSE, since })
    ).toBeGreaterThan(0);
    expect(
      await erasedScope.accessors.sumUnchargedBillableCostMicroUsd({ purpose: GENERATION_PURPOSE, since })
    ).toBeGreaterThan(0);
    // A same-id resubmission is the typed terminal: nothing is rebuilt, nothing called.
    await expect(
      generate(db, owner, profileId, never(), anySlots(), ideation("op-erased"), new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    // CONTROL (non-vacuity): with the history row left alone the same run settles and is charged.
    await seedDraft({ createdAt: at(2) });
    const ok = scripted(ideationReply());
    const settled = await generate(db, owner, profileId, ok.provider, anySlots(), ideation("op-kept"), new Date());
    expect(settled.creditsChargedNow).toBe(IDEATION_COST);
  });

  it("9. LIFECYCLE: every identifier the snapshot writer emits under `recentContext` sits at a path the lifecycle registry governs (REGISTERING-A-TABLE.md site 12)", async () => {
    await rawBrain(profileId, ws);
    const source = await seedDraft({ createdAt: at(1) });
    await db.insert(creativePieces).values({
      profileId, workspaceId: ws, sourceGenerationId: source.id, sourceIdeaIndex: 0, quoteConfigVersion: 1,
    });
    const other = await seedDraft({ createdAt: at(2) });
    await seedReaction(other, "not_filmable", "no studio for this", at(3));
    const scope = await mintProfileScope(db, owner, profileId);
    const { snapshot } = buildRecentContext({
      candidates: await scope.accessors.recentContextCandidates({
        modes: ["ideation"], platform: PLATFORM, currentPieceId: null, excludeGenerationIds: [],
      }),
      charBudget: 100_000,
      sequel: false,
      // A material id, so the exclusions list carries an identifier too.
      materialIds: [other.id],
      reportedSpecificsOf,
    });
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const found = new Set<string>();
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "string" && UUID.test(value)) found.add(path);
      else if (Array.isArray(value)) value.forEach((v) => walk(v, `${path}[*]`));
      else if (value !== null && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      }
    };
    walk(snapshot, "$.recentContext");
    // NON-VACUITY: all three identifier-bearing lists were populated.
    expect([...found].sort()).toEqual([
      "$.recentContext.exclusions[*].id",
      "$.recentContext.pieces[*].id",
      "$.recentContext.records[*].id",
    ]);
    const governed = JSON_PATH_INVENTORY.filter(
      (p) => p.table === "generation_attempts" && p.column === "request_snapshot"
    ).map((p) => p.path);
    for (const path of found) expect(governed, path).toContain(path);
  });

  it("10. A VERSION-2 CLAIM (written before L3) still settles on resume — read for its config version, with no history to check, and no vendor call", async () => {
    await rawBrain(profileId, ws);
    await seedDraft({ createdAt: at(1) });
    const s = scripted(ideationReply());
    // The process dies after the response checkpoint: the claim sits at
    // `vendor_complete` holding the candidate.
    const crashing = dbThatFailsWhen(
      db,
      async () => (await attemptRow("op-v2"))?.state === "vendor_complete",
      "always"
    );
    await expect(
      generate(crashing, owner, profileId, s.provider, anySlots(), ideation("op-v2"), new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    expect((await attemptRow("op-v2")).state).toBe("vendor_complete");
    // ...and its snapshot is put back in the shape an L2 build wrote.
    const { sequel: _s, recentContext: _r, ...l2 } = (await attemptRow("op-v2")).requestSnapshot as Record<string, unknown>;
    void _s;
    void _r;
    await db
      .update(generationAttempts)
      .set({ requestSnapshot: { ...l2, v: 2 } })
      .where(eq(generationAttempts.attemptId, "op-v2"));
    const settled = await generate(db, owner, profileId, never(), anySlots(), ideation("op-v2"), new Date());
    expect(settled.replayed).toBe(false);
    expect(settled.creditsChargedNow).toBe(IDEATION_COST);
    expect((await attemptRow("op-v2")).state).toBe("settled");
  });

  it("10b. A history section this build cannot read ends the resume as recovery_required — no debit, no call", async () => {
    await rawBrain(profileId, ws);
    await seedDraft({ createdAt: at(1) });
    const crashing = dbThatFailsWhen(
      db,
      async () => (await attemptRow("op-bad"))?.state === "vendor_complete",
      "always"
    );
    await expect(
      generate(crashing, owner, profileId, scripted(ideationReply()).provider, anySlots(), ideation("op-bad"), new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    const snap = (await attemptRow("op-bad")).requestSnapshot as Record<string, unknown>;
    await db
      .update(generationAttempts)
      .set({ requestSnapshot: { ...snap, recentContext: { v: 99, records: [] } } })
      .where(eq(generationAttempts.attemptId, "op-bad"));
    await expect(
      generate(db, owner, profileId, never(), anySlots(), ideation("op-bad"), new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    expect((await attemptRow("op-bad")).state).toBe("recovery_required");
    const debits = await db.select().from(creditLedger).where(and(eq(creditLedger.workspaceId, ws), eq(creditLedger.kind, "debit")));
    expect(debits).toHaveLength(0);
  });

  it("8b. A claim whose recent-context section this build did not write is not settled on a guess", () => {
    expect(recentContextIdsOf({ attemptId: "a", requestSnapshot: { v: 2 } })).toBeNull();
    expect(recentContextIdsOf({ attemptId: "a", requestSnapshot: { v: 3, recentContext: null } })).toBeNull();
    expect(() =>
      recentContextIdsOf({ attemptId: "a", requestSnapshot: { v: 3, recentContext: { v: 9, records: [] } } })
    ).toThrow(GenerationRecoveryRequiredError);
    expect(() =>
      recentContextIdsOf({ attemptId: "a", requestSnapshot: { v: 3, recentContext: { v: 1, records: [{ kind: "x", id: "a" }] } } })
    ).toThrow(GenerationRecoveryRequiredError);
  });
});

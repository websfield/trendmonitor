// Slice 3's app-reachable brain surface: what the confirm screen is HANDED,
// and the two invariants the slice fixed on the way (B-3, B-5).
//
// THE HEADLINE HERE IS B-3. Confirmation used to pin `content` alone, and
// AC-27 names the pair `(content, source_evidence)`. Content is what the
// creator READ; evidence is the quote that made them believe it. A confirmation
// whose sha covers only the first says "I confirm this rule" while the sentence
// that justified it stays replaceable afterwards — with anything, including a
// quote from a post they never wrote — and activation would still pass. That is
// the defect this file plants and proves closed.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { onboardingInputs, type OnboardingInput } from "../src/onboarding-schema";
import { ProvenanceError } from "../src/errors";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type ProfileWriteCapabilities,
  type SourceEvidenceEntry,
} from "../src/with-workspace";
import type { BrainDocReason } from "../src/brain-reason";
import { CHECK } from "../src/brain-content";
import {
  EvidenceUnreadableError,
  activateBrainCoherent,
  activateVoice,
  claimsFor,
  confirmKillTestFields,
  confirmStrategyFields,
  confirmVoiceFields,
  readKillTestBrain,
  readStrategyBrain,
  readVoiceBrain,
} from "../src/brain-ops";

const REASON: BrainDocReason = { code: "onboarding_inference" };

/** A `voice` document declaring five positions, one of them a placeholder. */
const VOICE = {
  register: "Direct and plain, talking to one person",
  sentenceRhythm: "Short sentences, then one long one",
  signatureMoves: ["Opens on a number", CHECK],
  avoid: [CHECK],
};

describe("readVoiceBrain / claimsFor — what the confirm screen is handed", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "brain_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "brain_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "Anna" })
      .returning();
    profileId = p.id;
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "brain_user" }),
      profileId
    );

  const POST = "I always open on a number, never on the setup, and I say why";

  /** One own_post, and evidence citing two spans of it. */
  const seed = async (caps: ProfileWriteCapabilities) => {
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: POST,
    });
    const evidence: SourceEvidenceEntry[] = [
      {
        field: "/register",
        quote: POST.slice(0, 26),
        inputId: own.id,
        startUtf16: 0,
        endUtf16: 26,
      },
      {
        field: "/signatureMoves/0",
        quote: POST.slice(9, 24),
        inputId: own.id,
        startUtf16: 9,
        endUtf16: 24,
      },
      {
        field: "/sentenceRhythm",
        quote: POST.slice(27, 45),
        inputId: own.id,
        startUtf16: 27,
        endUtf16: 45,
      },
    ];
    return { own, evidence };
  };

  const writeDoc = async (caps: ProfileWriteCapabilities) => {
    const { evidence } = await seed(caps);
    return db.transaction((tx) =>
      caps.writeBrainDoc(
        { kind: "voice", content: VOICE, sourceEvidence: evidence, reason: REASON },
        tx
      )
    );
  };

  it("hands the screen EVERY claim position, grounded ones with their quote", async () => {
    const caps = writeCapabilities(await scopeFor());
    await writeDoc(caps);

    const view = await readVoiceBrain(
      db,
      await withWorkspace(db, { authUserId: "brain_user" }),
      profileId
    );
    expect(view.proposed).not.toBeNull();
    expect(view.active).toBeNull();

    const claims = view.proposed!.claims;
    expect(claims.map((c) => c.pointer)).toEqual([
      "/register",
      "/sentenceRhythm",
      "/signatureMoves/0",
      "/signatureMoves/1",
      "/avoid/0",
    ]);

    const register = claims.find((c) => c.pointer === "/register")!;
    expect(register.isPlaceholder).toBe(false);
    expect(register.quote).toBe(POST.slice(0, 26));
    // ATTRIBUTED: the quote is useless as provenance if the creator cannot tell
    // which post it came from.
    expect(register.source).not.toBeNull();
  });

  it("a PLACEHOLDER position carries no quote and no source — together, never one", async () => {
    const caps = writeCapabilities(await scopeFor());
    await writeDoc(caps);
    const view = await readVoiceBrain(
      db,
      await withWorkspace(db, { authUserId: "brain_user" }),
      profileId
    );
    const absent = view.proposed!.claims.find((c) => c.pointer === "/avoid/0")!;
    expect(absent.isPlaceholder).toBe(true);
    expect(absent.value).toBe(CHECK);
    // BOTH null, so there is no shape in which a quote exists without the post
    // it came from — the attribution this screen must never fail to make.
    expect(absent.quote).toBeNull();
    expect(absent.source).toBeNull();
  });

  it("the quote is RE-SLICED from the post, not read out of the evidence column", async () => {
    // What makes the screen's sentence ("this is from your post") true by
    // construction rather than by a property proved somewhere else, on a value
    // that has been sitting in a hand-editable column since.
    const post: OnboardingInput = {
      id: "00000000-0000-7000-8000-000000000001",
      profileId,
      workspaceId,
      inputClass: "own_post",
      content: "the quick brown fox",
      contentSha256: "0".repeat(64),
      createdAt: new Date(),
    } as OnboardingInput;

    const view = claimsFor(
      {
        id: "d",
        profileId,
        workspaceId,
        kind: "voice",
        version: 1,
        content: { register: "x", sentenceRhythm: CHECK, signatureMoves: [], avoid: [] },
        sourceEvidence: [
          {
            field: "/register",
            // The column SAYS this, and the post's span holds it too.
            quote: "quick brown",
            inputId: post.id,
            startUtf16: 4,
            endUtf16: 15,
          },
        ],
        status: "proposed",
        reason: "Version 1.",
        confirmedFields: null,
        activatedAt: null,
        createdAt: new Date(),
      } as never,
      new Map([[post.id, post]])
    );
    expect(view.claims[0].quote).toBe("quick brown");
  });

  it("REFUSES when the recorded span no longer holds the recorded quote", async () => {
    // Unreachable on the sanctioned path — `onboarding_inputs` has no update
    // and no delete — and refused anyway. Dropping the quote and rendering the
    // claim is the fail-open reading: the creator would confirm a rule
    // believing the product had grounded it.
    const post: OnboardingInput = {
      id: "00000000-0000-7000-8000-000000000001",
      profileId,
      workspaceId,
      inputClass: "own_post",
      content: "the quick brown fox",
      contentSha256: "0".repeat(64),
      createdAt: new Date(),
    } as OnboardingInput;

    expect(() =>
      claimsFor(
        {
          id: "d",
          profileId,
          workspaceId,
          kind: "voice",
          version: 1,
          content: { register: "x", sentenceRhythm: CHECK, signatureMoves: [], avoid: [] },
          sourceEvidence: [
            {
              field: "/register",
              // The column claims words the span does not hold.
              quote: "lazy dog",
              inputId: post.id,
              startUtf16: 4,
              endUtf16: 15,
            },
          ],
          status: "proposed",
          reason: "Version 1.",
          confirmedFields: null,
          activatedAt: null,
          createdAt: new Date(),
        } as never,
        new Map([[post.id, post]])
      )
    ).toThrow(EvidenceUnreadableError);
  });

  it("REFUSES a STATED claim with no evidence entry at all (R10's fail-open)", async () => {
    // THE SHAPE THE COMPLIANCE GATE PROVED BY RENDERING IT. `{isPlaceholder:
    // false, quote: null}` used to be CONSTRUCTED here, and the view then drew
    // the rule text, no quote, no named absence, and a checkbox reading
    // "Yes — this is right" — a claim about a person with nothing behind it and
    // an invitation to confirm it.
    //
    // It is unreachable through the database (C-28 refuses the write), which is
    // exactly why it needs a UNIT test: no DB-driven case can reach it, so
    // without this the refusal is six lines nothing exercises.
    expect(() =>
      claimsFor(
        {
          id: "d",
          profileId,
          workspaceId,
          kind: "voice",
          version: 1,
          content: {
            register: "You are warm and direct",
            sentenceRhythm: CHECK,
            signatureMoves: [],
            avoid: [],
          },
          sourceEvidence: [],
          status: "proposed",
          reason: "Version 1.",
          confirmedFields: null,
          activatedAt: null,
          createdAt: new Date(),
        } as never,
        new Map()
      )
    ).toThrow(EvidenceUnreadableError);
  });

  it("...but a PLACEHOLDER with no evidence is fine — that is the legitimate case", async () => {
    // The direction that must not change, or the refusal above would simply
    // ban every ungrounded position and R11 would be unreachable.
    const view = claimsFor(
      {
        id: "d",
        profileId,
        workspaceId,
        kind: "voice",
        version: 1,
        content: {
          register: CHECK,
          sentenceRhythm: CHECK,
          signatureMoves: [],
          avoid: [],
        },
        sourceEvidence: [],
        status: "proposed",
        reason: "Version 1.",
        confirmedFields: null,
        activatedAt: null,
        createdAt: new Date(),
      } as never,
      new Map()
    );
    expect(view.claims.every((c) => c.isPlaceholder)).toBe(true);
    expect(view.claims.every((c) => c.quote === null)).toBe(true);
  });

  it("REFUSES when the post an entry names is not among this profile's posts", async () => {
    expect(() =>
      claimsFor(
        {
          id: "d",
          profileId,
          workspaceId,
          kind: "voice",
          version: 1,
          content: { register: "x", sentenceRhythm: CHECK, signatureMoves: [], avoid: [] },
          sourceEvidence: [
            {
              field: "/register",
              quote: "anything",
              inputId: "00000000-0000-7000-8000-00000000dead",
              startUtf16: 0,
              endUtf16: 8,
            },
          ],
          status: "proposed",
          reason: "Version 1.",
          confirmedFields: null,
          activatedAt: null,
          createdAt: new Date(),
        } as never,
        new Map()
      )
    ).toThrow(EvidenceUnreadableError);
  });

  it("reports NOTHING for a profile with no voice document (not an error)", async () => {
    const view = await readVoiceBrain(
      db,
      await withWorkspace(db, { authUserId: "brain_user" }),
      profileId
    );
    expect(view).toEqual({ proposed: null, active: null });
  });

  it("carries the CONFIRMED flag per position, so the screen can pre-tick", async () => {
    const caps = writeCapabilities(await scopeFor());
    const doc = await writeDoc(caps);
    const scope = await withWorkspace(db, { authUserId: "brain_user" });
    await confirmVoiceFields(db, scope, profileId, doc.id, [
      { pointer: "/register", asPlaceholder: false },
    ]);
    const view = await readVoiceBrain(db, scope, profileId);
    const byPointer = new Map(view.proposed!.claims.map((c) => [c.pointer, c]));
    expect(byPointer.get("/register")!.confirmed).toBe(true);
    expect(byPointer.get("/avoid/0")!.confirmed).toBe(false);
  });

  // ------------------------------------------------------------------- B-3

  describe("B-3: the confirmation sha covers CONTENT AND EVIDENCE", () => {
    const confirmEverything = async (docId: string) => {
      const scope = await withWorkspace(db, { authUserId: "brain_user" });
      const view = await readVoiceBrain(db, scope, profileId);
      return confirmVoiceFields(
        db,
        scope,
        profileId,
        docId,
        view.proposed!.claims.map((c) => ({
          pointer: c.pointer,
          asPlaceholder: c.isPlaceholder,
        }))
      );
    };

    it("NON-VACUITY FIRST: an untouched confirmed version still activates", async () => {
      // The direction that must not change. Without this, every assertion below
      // would pass on a build where activation refuses everything.
      const caps = writeCapabilities(await scopeFor());
      const doc = await writeDoc(caps);
      await confirmEverything(doc.id);
      const activated = await activateVoice(
        db,
        await withWorkspace(db, { authUserId: "brain_user" }),
        profileId,
        doc.id
      );
      expect(activated.status).toBe("active");
      // B-5: an active row carries its activation time, and the CHECK now
      // refuses one that does not.
      expect(activated.activatedAt).not.toBeNull();
    });

    it("an EVIDENCE-ONLY edit after confirmation REFUSES activation", async () => {
      // THE DEFECT B-3 NAMES. The content is byte-identical; only the quote
      // behind it changed. Before this slice the sha covered content alone, so
      // this activated — the creator's confirmation standing behind a sentence
      // they never read.
      const caps = writeCapabilities(await scopeFor());
      const doc = await writeDoc(caps);
      await confirmEverything(doc.id);

      const before = await db
        .select()
        .from(brainDocs)
        .where(eq(brainDocs.id, doc.id));
      const evidence = before[0].sourceEvidence as SourceEvidenceEntry[];
      // A hand-run UPDATE, which is the only way to reach this today — and
      // exactly the incident-shaped path B-3 is about.
      await db
        .update(brainDocs)
        .set({
          sourceEvidence: [
            { ...evidence[0], quote: "something else entirely" },
            ...evidence.slice(1),
          ],
        })
        .where(eq(brainDocs.id, doc.id));

      await expect(
        activateVoice(
          db,
          await withWorkspace(db, { authUserId: "brain_user" }),
          profileId,
          doc.id
        )
      ).rejects.toBeInstanceOf(ProvenanceError);
    });

    it("...and the refusal NAMES the quotes, not only the content", async () => {
      // "This version's content has changed" sent a creator looking at their
      // rules for an edit that had happened to a quote.
      const caps = writeCapabilities(await scopeFor());
      const doc = await writeDoc(caps);
      await confirmEverything(doc.id);
      const before = await db
        .select()
        .from(brainDocs)
        .where(eq(brainDocs.id, doc.id));
      const evidence = before[0].sourceEvidence as SourceEvidenceEntry[];
      await db
        .update(brainDocs)
        .set({
          sourceEvidence: [
            { ...evidence[0], startUtf16: 1 },
            ...evidence.slice(1),
          ],
        })
        .where(eq(brainDocs.id, doc.id));

      const err = await activateVoice(
        db,
        await withWorkspace(db, { authUserId: "brain_user" }),
        profileId,
        doc.id
      ).catch((e: Error) => e);
      expect((err as Error).message).toMatch(/quotes behind it have changed/i);
    });

    it("a CONTENT-only edit still refuses — the older half is not lost", async () => {
      // Widening the sha's input must not weaken what it already covered.
      const caps = writeCapabilities(await scopeFor());
      const doc = await writeDoc(caps);
      await confirmEverything(doc.id);
      await db
        .update(brainDocs)
        .set({ content: { ...VOICE, register: "Something the creator never read" } })
        .where(eq(brainDocs.id, doc.id));

      await expect(
        activateVoice(
          db,
          await withWorkspace(db, { authUserId: "brain_user" }),
          profileId,
          doc.id
        )
      ).rejects.toBeInstanceOf(ProvenanceError);
    });
  });

  // ------------------------------------------------------------------- R7

  it("R7/G-12: a REFERENCE input cannot be provenance for a voice document", async () => {
    // The substrate half of G-12, driven from the operation this slice makes
    // browser-reachable rather than from the raw capability. `voice` is in
    // `REFERENCE_BARRED_KINDS`, so the write is refused outright — the field
    // never renders because the document never exists.
    const caps = writeCapabilities(await scopeFor());
    const ref = await caps.appendOnboardingInput({
      inputClass: "reference",
      content: "somebody else wrote this whole sentence right here today",
    });
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: VOICE,
            sourceEvidence: [
              {
                field: "/register",
                quote: "somebody else wrote",
                inputId: ref.id,
                startUtf16: 0,
                endUtf16: 19,
              },
            ],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProvenanceError);

    // ...and nothing was written, so the confirm screen has nothing to show.
    const view = await readVoiceBrain(
      db,
      await withWorkspace(db, { authUserId: "brain_user" }),
      profileId
    );
    expect(view.proposed).toBeNull();
  });

  it("R3: a quote the model INVENTED is refused by the existing gate", async () => {
    // The model returns offsets and we never trust them:
    // `validateSourceEvidence` proves each quote verbatim at its range. This
    // plants exactly the failure — a quote that appears in no input at all.
    const caps = writeCapabilities(await scopeFor());
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: POST,
    });
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: VOICE,
            sourceEvidence: [
              {
                field: "/register",
                quote: "a sentence this creator never wrote",
                inputId: own.id,
                startUtf16: 0,
                endUtf16: 35,
              },
            ],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProvenanceError);
    expect(await db.select().from(brainDocs)).toHaveLength(0);
    // The creator's own post is untouched — a refused inference costs them
    // nothing they had already saved.
    expect(await db.select().from(onboardingInputs)).toHaveLength(1);
  });
});

// Slice 3b (Stage B2): the trio extended to `strategy`/`killtest`, and ONE
// coherent activation entrypoint for all three kinds (R6/R8). A SEPARATE
// describe block, not nested in the one above, because it needs its own
// fixture — `interviewClaim`-shaped `creator_authored` evidence rather than
// `own_post` quotes.
describe("readStrategyBrain / readKillTestBrain / confirmStrategyFields / confirmKillTestFields / activateBrainCoherent", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "brain_user_2");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "brain_user_2", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "Anna" })
      .returning();
    profileId = p.id;
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "brain_user_2" }),
      profileId
    );

  const STRATEGY_CONTENT = {
    audience: "Solo creators trying to grow on shorts",
    positioning: CHECK,
    pillars: [],
    goals: ["Grow to 10k"],
    ambitions: [CHECK],
    metric: {
      key: "unset",
      label: "Average watch time",
      unit: "seconds",
      direction: "higher_is_better",
    },
  };

  /** One `creator_authored` answer per claim it grounds — mirrors `interview-ops.ts`'s own shape (offsets over the WHOLE answer). */
  const seedStrategy = async (caps: ProfileWriteCapabilities) => {
    const audience = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: STRATEGY_CONTENT.audience,
      fieldKey: "audience",
    });
    const goal = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: STRATEGY_CONTENT.goals[0],
      fieldKey: "goals",
    });
    const metricLabel = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: STRATEGY_CONTENT.metric.label,
      fieldKey: "metricLabel",
    });
    const metricUnit = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: STRATEGY_CONTENT.metric.unit,
      fieldKey: "metricUnit",
    });
    const metricDirection = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: STRATEGY_CONTENT.metric.direction,
      fieldKey: "metricDirection",
    });
    const evidence: SourceEvidenceEntry[] = [
      { field: "/audience", quote: audience.content, inputId: audience.id, startUtf16: 0, endUtf16: audience.content.length },
      { field: "/goals/0", quote: goal.content, inputId: goal.id, startUtf16: 0, endUtf16: goal.content.length },
      { field: "/metric/label", quote: metricLabel.content, inputId: metricLabel.id, startUtf16: 0, endUtf16: metricLabel.content.length },
      { field: "/metric/unit", quote: metricUnit.content, inputId: metricUnit.id, startUtf16: 0, endUtf16: metricUnit.content.length },
      { field: "/metric/direction", quote: metricDirection.content, inputId: metricDirection.id, startUtf16: 0, endUtf16: metricDirection.content.length },
    ];
    return db.transaction((tx) =>
      caps.writeBrainDoc(
        { kind: "strategy", content: STRATEGY_CONTENT, sourceEvidence: evidence, reason: REASON },
        tx
      )
    );
  };

  it("readStrategyBrain hands the screen strategy's claims, each cited to a creator_authored answer (R4)", async () => {
    const caps = writeCapabilities(await scopeFor());
    await seedStrategy(caps);

    const view = await readStrategyBrain(
      db,
      await withWorkspace(db, { authUserId: "brain_user_2" }),
      profileId
    );
    expect(view.proposed).not.toBeNull();
    const audience = view.proposed!.claims.find((c) => c.pointer === "/audience")!;
    expect(audience.quote).toBe(STRATEGY_CONTENT.audience);
    // THE POINT OF R4: the source names WHICH KIND of evidence this is, and
    // it is `creator_authored` — not `own_post` — for a strategy claim.
    expect(audience.source?.inputClass).toBe("creator_authored");

    const metricLabel = view.proposed!.claims.find((c) => c.pointer === "/metric/label")!;
    expect(metricLabel.value).toBe(STRATEGY_CONTENT.metric.label);
    expect(metricLabel.source?.inputClass).toBe("creator_authored");
  });

  it("readKillTestBrain reports nothing for a profile with no killtest document (not an error)", async () => {
    const view = await readKillTestBrain(
      db,
      await withWorkspace(db, { authUserId: "brain_user_2" }),
      profileId
    );
    expect(view).toEqual({ proposed: null, active: null });
  });

  it("confirmStrategyFields records confirmation exactly like confirmVoiceFields does — same capability, different kind", async () => {
    const caps = writeCapabilities(await scopeFor());
    const doc = await seedStrategy(caps);
    const scope = await withWorkspace(db, { authUserId: "brain_user_2" });
    const positions = (await readStrategyBrain(db, scope, profileId)).proposed!.claims.map(
      (c) => c.pointer
    );
    const confirmed = await confirmStrategyFields(
      db,
      scope,
      profileId,
      doc.id,
      positions.map((pointer) => ({
        pointer,
        asPlaceholder: pointer === "/positioning" || pointer === "/ambitions/0",
      }))
    );
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it("R8: activateBrainCoherent activates the named document AND records every OTHER kind's active id alongside it", async () => {
    const scope = await withWorkspace(db, { authUserId: "brain_user_2" });
    const caps = writeCapabilities(await scopeFor());

    // ---- Voice is already active.
    const VOICE = {
      register: "Direct and plain",
      sentenceRhythm: CHECK,
      signatureMoves: [CHECK],
      avoid: [CHECK],
    };
    const own = await caps.appendOnboardingInput({ inputClass: "own_post", content: "I am direct" });
    const voiceDoc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: VOICE,
          sourceEvidence: [
            { field: "/register", quote: "I am direct", inputId: own.id, startUtf16: 0, endUtf16: 11 },
          ],
          reason: REASON,
        },
        tx
      )
    );
    await confirmVoiceFields(db, scope, profileId, voiceDoc.id, [
      { pointer: "/register", asPlaceholder: false },
      { pointer: "/sentenceRhythm", asPlaceholder: true },
      { pointer: "/signatureMoves/0", asPlaceholder: true },
      { pointer: "/avoid/0", asPlaceholder: true },
    ]);
    const { doc: activeVoiceDoc } = await activateBrainCoherent(db, scope, profileId, voiceDoc.id);
    expect(activeVoiceDoc.status).toBe("active");

    // ---- Now activate a Strategy draft, and prove the snapshot names BOTH.
    const strategyDoc = await seedStrategy(caps);
    const positions = (await readStrategyBrain(db, scope, profileId)).proposed!.claims.map(
      (c) => c.pointer
    );
    await confirmStrategyFields(
      db,
      scope,
      profileId,
      strategyDoc.id,
      positions.map((pointer) => ({
        pointer,
        asPlaceholder: pointer === "/positioning" || pointer === "/ambitions/0",
      }))
    );
    const { doc: activeStrategyDoc, snapshot } = await activateBrainCoherent(
      db,
      scope,
      profileId,
      strategyDoc.id
    );
    expect(activeStrategyDoc.status).toBe("active");
    // THE WHOLE POINT OF R8: this snapshot names Voice's active id UNCHANGED,
    // not null and not the superseded draft — even though this activation
    // call named only the Strategy document.
    expect(snapshot.voiceDocId).toBe(activeVoiceDoc.id);
    expect(snapshot.strategyDocId).toBe(activeStrategyDoc.id);
    expect(snapshot.killtestDocId).toBeNull();
  });

  it("confirmKillTestFields is reachable and kind-agnostic, same as its strategy sibling", async () => {
    const caps = writeCapabilities(await scopeFor());
    const banned = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: "cringe",
      fieldKey: "bannedWords",
    });
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "killtest",
          content: { rules: [], bannedWords: ["cringe"], bannedVibes: [CHECK] },
          sourceEvidence: [
            { field: "/bannedWords/0", quote: "cringe", inputId: banned.id, startUtf16: 0, endUtf16: 6 },
          ],
          reason: REASON,
        },
        tx
      )
    );
    const scope = await withWorkspace(db, { authUserId: "brain_user_2" });
    const confirmed = await confirmKillTestFields(db, scope, profileId, doc.id, [
      { pointer: "/bannedWords/0", asPlaceholder: false },
      { pointer: "/bannedVibes/0", asPlaceholder: true },
    ]);
    expect(confirmed.confirmedAt).not.toBeNull();
  });
});

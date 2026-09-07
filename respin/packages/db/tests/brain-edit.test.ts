import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { onboardingInputs } from "../src/onboarding-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  BrainEditEmptyError,
  BrainEditUnchangedError,
  BrainEditBusyError,
  BrainEditLimitError,
  BrainDocumentLimitError,
  BrainVersionLimitError,
  OnboardingInputLimitError,
  ProvenanceError,
  ReferenceEchoError,
} from "../src/errors";
import { ECHO_MIN_SEGMENTS } from "../src/echo";
import {
  BRAIN_DOCUMENT_TEXT_MAX,
  BRAIN_VERSION_MAX,
  POST_CONTENT_MAX,
} from "../src/storage-limits";
import {
  ProfileScope,
  STALE_BRAIN_EDIT_DETAIL,
  withWorkspace,
  writeCapabilities,
  type SourceEvidenceEntry,
} from "../src/with-workspace";
import {
  activateBrainCoherent,
  BRAIN_EDIT_MAX_FIELDS,
  BRAIN_EDIT_LIST_MAX,
  BRAIN_EDIT_TOTAL_MAX,
  BRAIN_EDIT_VALUE_MAX,
  claimsForHistory,
  confirmVoiceFields,
  editBrainDocument,
  editDeclaredMetric,
  readBrainHistory,
  readVoiceBrain,
  replacementVersionFor,
  withBrainEditSlot,
} from "../src/brain-ops";

describe("REQ-B02 / REQ-C05 creator brain edits and history", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "edit_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "edit_user", name: "A" })
    ).workspace.id;
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "Anna" })
      .returning();
    profileId = profile.id;
  });

  async function seedBase() {
    const workspaceScope = await withWorkspace(db, { authUserId: "edit_user" });
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    const input = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: "I am direct. I use short sentences.",
    });
    const evidence: SourceEvidenceEntry[] = [
      { field: "/register", quote: "I am direct", inputId: input.id, startUtf16: 0, endUtf16: 11 },
      { field: "/sentenceRhythm", quote: "I use short sentences", inputId: input.id, startUtf16: 13, endUtf16: 34 },
    ];
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: { register: "Direct", sentenceRhythm: "Short", signatureMoves: [], avoid: [] },
          sourceEvidence: evidence,
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    return { workspaceScope, input, doc };
  }

  async function seedStrategy() {
    const workspaceScope = await withWorkspace(db, { authUserId: "edit_user" });
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    const fields = [
      ["/audience", "Solo creators"],
      ["/metric/label", "Average watch time"],
      ["/metric/unit", "seconds"],
      ["/metric/direction", "higher_is_better"],
      ["/metric/platform", "TikTok"],
      ["/metric/window", "30 days"],
    ] as const;
    const evidence: SourceEvidenceEntry[] = [];
    for (const [field, content] of fields) {
      const input = await caps.appendOnboardingInput({
        inputClass: "creator_authored",
        content,
        fieldKey: field,
      });
      evidence.push({
        field,
        quote: content,
        inputId: input.id,
        startUtf16: 0,
        endUtf16: content.length,
      });
    }
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content: {
            audience: "Solo creators",
            positioning: "[check]",
            pillars: [],
            goals: [],
            ambitions: [],
            metric: {
              key: "average-watch-time",
              label: "Average watch time",
              unit: "seconds",
              direction: "higher_is_better",
              platform: "TikTok",
              window: "30 days",
            },
          },
          sourceEvidence: evidence,
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    return { workspaceScope, doc };
  }

  /**
   * A strategy document from a creator who DECLINED both optional metric
   * questions.
   *
   * `interview-ops.ts` OMITS a declined `declinable` field, so the stored
   * `metric` object has no `platform`/`window` KEY at all — which is what the
   * schema asks for: both are `claim(z.string()).optional()`, and its own
   * comment says the interview "omits the key entirely rather than storing
   * `[check]` for a field nobody was asked to commit to". An absent optional
   * claim is not a claim position (`enumerateClaimFieldsOf`).
   *
   * THIS IS THE POPULATION `seedStrategy` ABOVE CANNOT REACH. That fixture
   * answers every question, and so did the acceptance walk — which is how
   * slice 5 shipped a declared metric that a creator who declined either
   * optional question could not edit at all, in either direction, and was told
   * "what this page showed you and what the server holds no longer agree".
   */
  async function seedStrategyDeclinedOptionals() {
    const workspaceScope = await withWorkspace(db, { authUserId: "edit_user" });
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    const fields = [
      ["/audience", "Solo creators"],
      ["/metric/label", "Average watch time"],
      ["/metric/unit", "seconds"],
      ["/metric/direction", "higher_is_better"],
    ] as const;
    const evidence: SourceEvidenceEntry[] = [];
    for (const [field, content] of fields) {
      const input = await caps.appendOnboardingInput({
        inputClass: "creator_authored",
        content,
        fieldKey: field,
      });
      evidence.push({
        field,
        quote: content,
        inputId: input.id,
        startUtf16: 0,
        endUtf16: content.length,
      });
    }
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content: {
            audience: "Solo creators",
            positioning: "[check]",
            pillars: [],
            goals: [],
            ambitions: [],
            metric: {
              key: "average-watch-time",
              label: "Average watch time",
              unit: "seconds",
              direction: "higher_is_better",
            },
          },
          sourceEvidence: evidence,
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    const metric = (doc.content as { metric: Record<string, unknown> }).metric;
    // The fixture is only the fixture this test needs if the keys really are
    // absent — a stored `[check]` would exercise a different (already working)
    // path and the suite would pass while the defect stood.
    expect(Object.hasOwn(metric, "platform")).toBe(false);
    expect(Object.hasOwn(metric, "window")).toBe(false);
    return { workspaceScope, doc };
  }

  async function confirmAndActivateVoice(
    workspaceScope: Awaited<ReturnType<typeof withWorkspace>>,
    brainDocId: string
  ) {
    await confirmVoiceFields(db, workspaceScope, profileId, brainDocId, [
      { pointer: "/register", asPlaceholder: false },
      { pointer: "/sentenceRhythm", asPlaceholder: false },
    ]);
    // COHERENT ACTIVATION, which is the only activation path this package has
    // (the single-document `activateVoice` was deleted in the 2026-09-01
    // tenancy gate round). It runs the SAME `caps.activateBrainDoc` closure and
    // additionally records the snapshot, so these edit assertions are now made
    // against the path `/brain` actually presses.
    return (await activateBrainCoherent(db, workspaceScope, profileId, brainDocId))
      .doc;
  }

  it("writes one creator_authored input, cites changed fields, and carries unchanged evidence", async () => {
    const { workspaceScope, input, doc } = await seedBase();
    const edited = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Warm and direct" },
      { pointer: "/signatureMoves/0", value: "Open with the result" },
    ]);

    expect(edited.version).toBe(2);
    expect(edited.kind).toBe("voice");
    expect(edited.status).toBe("proposed");
    expect(edited.reason).toMatch(/edited/i);
    const authored = (await db.select().from(onboardingInputs)).filter(
      (row) => row.inputClass === "creator_authored"
    );
    expect(authored).toHaveLength(1);
    const evidence = edited.sourceEvidence as SourceEvidenceEntry[];
    expect(evidence.find((entry) => entry.field === "/sentenceRhythm")?.inputId).toBe(input.id);
    expect(evidence.find((entry) => entry.field === "/register")?.inputId).toBe(authored[0].id);
    expect(evidence.find((entry) => entry.field === "/signatureMoves/0")?.inputId).toBe(authored[0].id);
  });

  it("allows [check] for one field, drops its warrant, and refuses a whole-document blank", async () => {
    const { workspaceScope, doc } = await seedBase();
    const edited = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "[check]" },
    ]);
    expect((edited.sourceEvidence as SourceEvidenceEntry[]).some((e) => e.field === "/register")).toBe(false);

    // SLICE 5 GATE ROUND 1, G6 — THE ROLLBACK IS ASSERTED, not assumed.
    //
    // `editBrainDocument` writes the `creator_authored` `onboarding_inputs`
    // row BEFORE it can know the document will be refused: `[check]` is a
    // stated value, so the composer types an input for it and only then finds
    // that no evidence survives. `onboarding_inputs` is IMMUTABLE, has no
    // delete path and is export-included, so an escaped row is permanent —
    // a creator would carry a row recording an edit that never happened, and
    // it would appear in their REQ-A04 export. The only thing standing
    // between that and the product is the enclosing transaction, and until
    // this assertion nothing drove it.
    const beforeCheck = (await db.select().from(onboardingInputs)).length;
    await expect(
      editBrainDocument(db, workspaceScope, profileId, edited.id, [
        { pointer: "/sentenceRhythm", value: "[check]" },
      ])
    ).rejects.toBeInstanceOf(BrainEditEmptyError);
    expect(await db.select().from(onboardingInputs)).toHaveLength(beforeCheck);
  });

  // SLICE 5 GATE ROUND 1, G6 — R15a AT THE EDIT PATH, as a guard.
  //
  // R15a's refusal was walked in a browser on 2026-08-31 and had no durable
  // witness: `tests/brain-edit-action.test.tsx` MOCKS `respinDb.editBrainDocument`,
  // so it proves the banner renders a refusal it was handed, never that the
  // refusal happens. Nothing drove `editBrainDocument` with content echoing a
  // stored `reference` input, so the echo bar could have been removed from the
  // creator's own write path with every suite green — which is the shape
  // CLAUDE.md's 2026-08-26 lesson names: a matrix is blind to a control nobody
  // wrote, and this control was written but never witnessed.
  //
  // Both halves matter and they fail differently: the REFUSAL is R-3 (spin,
  // never copy) on the first creator-reachable hard write, and the ROLLBACK is
  // the immutable-table invariant above.
  it("G6: an edit echoing a stored reference is refused, and its creator_authored row rolls back", async () => {
    const { workspaceScope, doc } = await seedBase();
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    // Somebody else's post, kept only so a mechanism can be noted from it.
    const echoed = "open on the result before you explain how you got there";
    await caps.appendOnboardingInput({
      inputClass: "reference",
      content: `${echoed} and a good deal more text besides`,
    });
    // Non-vacuity of the FIXTURE: the span has to be long enough for the bar
    // to be capable of firing at all, or this test would pass against a
    // deleted echo bar.
    expect(echoed.split(" ").length).toBeGreaterThanOrEqual(ECHO_MIN_SEGMENTS);

    const before = (await db.select().from(onboardingInputs)).length;
    const raised = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: echoed },
    ]).catch((err: unknown) => err);

    expect(raised).toBeInstanceOf(ReferenceEchoError);
    // The structured match is what `referenceEchoState` in brain/actions.ts
    // validates before the banner may show it, so an echo refusal that named
    // no field would reach the creator as a dead end.
    expect((raised as ReferenceEchoError).match?.pointer).toBe("/register");

    // NOTHING ESCAPED. Not the immutable input row, and not a version.
    expect(await db.select().from(onboardingInputs)).toHaveLength(before);
    const history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history).toHaveLength(1);
    expect(history[0].brainDocId).toBe(doc.id);
  });

  it("G6: the same edit in the creator's OWN words is accepted, so the bar is not a blanket refusal", async () => {
    // The inversion. A guard that refused every edit once a reference existed
    // would pass the test above and take the whole edit surface down — the
    // 2026-07-30 "fail closed, but never without a way forward" lesson.
    const { workspaceScope, doc } = await seedBase();
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    await writeCapabilities(profileScope).appendOnboardingInput({
      inputClass: "reference",
      content: "open on the result before you explain how you got there, always",
    });
    const edited = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Warm, plain, and impatient with preamble" },
    ]);
    expect(edited.version).toBe(2);
    expect(
      (await db.select().from(onboardingInputs)).filter(
        (row) => row.fieldKey === "creator_edit"
      )
    ).toHaveLength(1);
  });

  it("reads every version of a kind in version order and annotates unreadable old evidence", async () => {
    const { workspaceScope, doc } = await seedBase();
    const replacement = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Warm and direct" },
    ]);
    const replacedAt = new Date("2026-08-30T01:02:03.000Z");
    await db
      .update(brainDocs)
      .set({ status: "superseded", supersededAt: replacedAt })
      .where(eq(brainDocs.id, doc.id));
    await db
      .update(brainDocs)
      .set({
        status: "active",
        activatedAt: replacedAt,
        confirmedAt: replacedAt,
        confirmedContentSha256: "history-fixture",
      })
      .where(eq(brainDocs.id, replacement.id));
    const history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((version) => version.version)).toEqual([2, 1]);
    expect(history.map((version) => version.status)).toEqual(["active", "superseded"]);
    expect(history.find((version) => version.version === 1)?.replacedByVersion).toBe(2);
    expect(history.every((version) => version.createdAt instanceof Date)).toBe(true);
    expect(history.every((version) => version.updatedAt instanceof Date)).toBe(true);
    expect(history.every((version) => "supersededAt" in version)).toBe(true);
  });

  it.each([
    ["string offsets", "0", "11", "I am direct"],
    ["fractional offsets", 0.5, 11.5, "I am direct"],
    ["a negative start", -34, 11, "I am direct"],
    ["an inverted range", 11, 0, ""],
    ["an end beyond the stored input", 0, 10_000, "I am direct. I use short sentences."],
  ])(
    "annotates %s in historical evidence and never presents the quote as verified",
    async (_label, startUtf16, endUtf16, quote) => {
      const { input, doc } = await seedBase();
      const view = claimsForHistory(
        {
          ...doc,
          sourceEvidence: [
            {
              field: "/register",
              inputId: input.id,
              startUtf16,
              endUtf16,
              quote,
            },
          ] as unknown as SourceEvidenceEntry[],
        },
        new Map([[input.id, input]])
      );
      const register = view.claims.find((claim) => claim.pointer === "/register");

      expect(register?.quote).toBeNull();
      expect(register?.evidenceAnnotation).toBe(
        "this quote could not be verified against the stored post"
      );
    }
  );

  it("retires an older proposal when its edit is written, then leaves zero proposals after activation", async () => {
    const { workspaceScope, doc } = await seedBase();
    const replacement = await editBrainDocument(
      db,
      workspaceScope,
      profileId,
      doc.id,
      [{ pointer: "/register", value: "Warm and direct" }]
    );

    let history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [2, "proposed"],
      [1, "superseded"],
    ]);
    expect(history.find((item) => item.version === 1)?.replacedByVersion).toBe(2);
    expect(history.filter((item) => item.status === "proposed")).toHaveLength(1);

    const inputCount = (await db.select().from(onboardingInputs)).length;
    await expect(
      editBrainDocument(db, workspaceScope, profileId, doc.id, [
        { pointer: "/register", value: "A stale rollback" },
      ])
    ).rejects.toBeInstanceOf(ProvenanceError);
    expect(await db.select().from(onboardingInputs)).toHaveLength(inputCount);
    expect(await readBrainHistory(db, workspaceScope, profileId, "voice")).toHaveLength(2);

    await confirmAndActivateVoice(workspaceScope, replacement.id);
    history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [2, "active"],
      [1, "superseded"],
    ]);
    expect(history.filter((item) => item.status === "proposed")).toHaveLength(0);
    expect(history.find((item) => item.version === 1)?.replacedByVersion).toBe(2);
    const current = await readVoiceBrain(db, workspaceScope, profileId);
    expect(current.proposed).toBeNull();
    expect(current.active?.version).toBe(2);
  });

  it("keeps an active version in force while its replacement is proposed, then supersedes it on activation", async () => {
    const { workspaceScope, doc } = await seedBase();
    await confirmAndActivateVoice(workspaceScope, doc.id);
    const replacement = await editBrainDocument(
      db,
      workspaceScope,
      profileId,
      doc.id,
      [{ pointer: "/register", value: "Warm and direct" }]
    );

    let history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [2, "proposed"],
      [1, "active"],
    ]);
    let current = await readVoiceBrain(db, workspaceScope, profileId);
    expect(current.proposed?.version).toBe(2);
    expect(current.active?.version).toBe(1);

    await confirmAndActivateVoice(workspaceScope, replacement.id);
    history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [2, "active"],
      [1, "superseded"],
    ]);
    expect(history.find((item) => item.version === 1)?.replacedByVersion).toBe(2);
    current = await readVoiceBrain(db, workspaceScope, profileId);
    expect(current.proposed).toBeNull();
    expect(current.active?.version).toBe(2);
  });

  it("activation repairs a legacy duplicate proposal instead of exposing it as current", async () => {
    const { workspaceScope, doc } = await seedBase();
    const replacement = await editBrainDocument(
      db,
      workspaceScope,
      profileId,
      doc.id,
      [{ pointer: "/register", value: "Warm and direct" }]
    );
    // Simulate the exact pre-fix state already possible in a deployed DB.
    await db
      .update(brainDocs)
      .set({ status: "proposed", supersededAt: null })
      .where(eq(brainDocs.id, doc.id));

    await confirmAndActivateVoice(workspaceScope, replacement.id);
    const current = await readVoiceBrain(db, workspaceScope, profileId);
    expect(current.proposed).toBeNull();
    expect(current.active?.version).toBe(2);
    const history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [2, "active"],
      [1, "superseded"],
    ]);
    expect(history.find((item) => item.version === 1)?.replacedByVersion).toBe(2);
  });

  it("edits active v2 when a legacy proposed v1 is stale, creating v3 and retiring v1", async () => {
    const { workspaceScope, doc } = await seedBase();
    const second = await editBrainDocument(
      db,
      workspaceScope,
      profileId,
      doc.id,
      [{ pointer: "/register", value: "Warm and direct" }]
    );
    await confirmAndActivateVoice(workspaceScope, second.id);
    // Recreate the pre-invariant state seen in the browser: an old proposal
    // whose version is LOWER than the active version.
    await db
      .update(brainDocs)
      .set({ status: "proposed", supersededAt: null })
      .where(eq(brainDocs.id, doc.id));

    const third = await editBrainDocument(
      db,
      workspaceScope,
      profileId,
      second.id,
      [{ pointer: "/register", value: "Quiet and direct" }]
    );
    expect(third.version).toBe(3);
    const history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [3, "proposed"],
      [2, "active"],
      [1, "superseded"],
    ]);
    expect(history.find((item) => item.version === 1)?.replacedByVersion).toBe(3);
    const current = await readVoiceBrain(db, workspaceScope, profileId);
    expect(current.proposed?.version).toBe(3);
    expect(current.active?.version).toBe(2);
  });

  it("refuses confirm and activate for a legacy proposal older than active under the authoritative-base gate", async () => {
    const { workspaceScope, doc } = await seedBase();
    await confirmAndActivateVoice(workspaceScope, doc.id);
    const second = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Warm and direct" },
    ]);
    await confirmAndActivateVoice(workspaceScope, second.id);
    await db
      .update(brainDocs)
      .set({ status: "proposed", supersededAt: null })
      .where(eq(brainDocs.id, doc.id));

    await expect(
      confirmVoiceFields(db, workspaceScope, profileId, doc.id, [
        { pointer: "/register", asPlaceholder: false },
        { pointer: "/sentenceRhythm", asPlaceholder: false },
      ])
    ).rejects.toBeInstanceOf(ProvenanceError);
    await expect(
      activateBrainCoherent(db, workspaceScope, profileId, doc.id)
    ).rejects.toBeInstanceOf(ProvenanceError);

    const history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [2, "active"],
      [1, "proposed"],
    ]);
  });

  it("replacement attribution ignores a different kind with the same transition timestamp", async () => {
    const { workspaceScope, doc } = await seedBase();
    await confirmAndActivateVoice(workspaceScope, doc.id);
    const second = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Warm and direct" },
    ]);
    await confirmAndActivateVoice(workspaceScope, second.id);
    const [first] = await db.select().from(brainDocs).where(eq(brainDocs.id, doc.id));
    const [active] = await db.select().from(brainDocs).where(eq(brainDocs.id, second.id));
    const timestampCollision = {
      ...active,
      id: "00000000-0000-4000-8000-000000000099",
      kind: "strategy" as const,
      version: 99,
      createdAt: first.supersededAt!,
      activatedAt: null,
    };
    expect(replacementVersionFor(first, [timestampCollision, active])).toBe(2);
  });

  it("refuses a stale active base when a proposal exists, while the newest proposal remains editable", async () => {
    const { workspaceScope, doc } = await seedBase();
    await confirmAndActivateVoice(workspaceScope, doc.id);
    const second = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Warm and direct" },
    ]);
    const inputCount = (await db.select().from(onboardingInputs)).length;
    await expect(
      editBrainDocument(db, workspaceScope, profileId, doc.id, [
        { pointer: "/register", value: "Discard the newer draft" },
      ])
    ).rejects.toBeInstanceOf(ProvenanceError);
    expect(await db.select().from(onboardingInputs)).toHaveLength(inputCount);
    expect(
      (await readBrainHistory(db, workspaceScope, profileId, "voice")).map(
        (item) => [item.version, item.status]
      )
    ).toEqual([
      [2, "proposed"],
      [1, "active"],
    ]);

    const third = await editBrainDocument(db, workspaceScope, profileId, second.id, [
      { pointer: "/register", value: "Quiet and direct" },
    ]);

    let history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [3, "proposed"],
      [2, "superseded"],
      [1, "active"],
    ]);
    expect(history.find((item) => item.brainDocId === second.id)?.replacedByVersion).toBe(3);
    expect(history.filter((item) => item.status === "proposed")).toHaveLength(1);

    await confirmAndActivateVoice(workspaceScope, third.id);
    history = await readBrainHistory(db, workspaceScope, profileId, "voice");
    expect(history.map((item) => [item.version, item.status])).toEqual([
      [3, "active"],
      [2, "superseded"],
      [1, "superseded"],
    ]);
    expect(history.filter((item) => item.status === "proposed")).toHaveLength(0);
  });

  it("refuses oversized normalized edit requests before opening a transaction", async () => {
    const { workspaceScope, doc } = await seedBase();
    const transaction = vi.spyOn(db, "transaction");
    transaction.mockClear();

    await expect(
      editBrainDocument(
        db,
        workspaceScope,
        profileId,
        doc.id,
        [null] as unknown as { pointer: string; value: string }[]
      )
    ).rejects.toBeInstanceOf(BrainEditLimitError);
    expect(transaction).not.toHaveBeenCalled();

    await expect(
      editBrainDocument(db, workspaceScope, profileId, doc.id, [
        { pointer: "/register", value: "x".repeat(BRAIN_EDIT_VALUE_MAX + 1) },
      ])
    ).rejects.toBeInstanceOf(BrainEditLimitError);
    expect(transaction).not.toHaveBeenCalled();

    await expect(
      editBrainDocument(
        db,
        workspaceScope,
        profileId,
        doc.id,
        Array.from({ length: BRAIN_EDIT_MAX_FIELDS + 1 }, (_, index) => ({
          pointer: `/signatureMoves/${index}`,
          value: "x",
        }))
      )
    ).rejects.toBeInstanceOf(BrainEditLimitError);
    expect(transaction).not.toHaveBeenCalled();

    const aggregate = Array.from(
      { length: Math.floor(BRAIN_EDIT_TOTAL_MAX / BRAIN_EDIT_VALUE_MAX) + 1 },
      (_, index) => ({
        pointer: `/signatureMoves/${index}`,
        value: "x".repeat(BRAIN_EDIT_VALUE_MAX),
      })
    );
    await expect(
      editBrainDocument(db, workspaceScope, profileId, doc.id, aggregate)
    ).rejects.toBeInstanceOf(BrainEditLimitError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("fails fast when the profile edit slot is occupied and always releases a granted slot", async () => {
    const { workspaceScope } = await seedBase();
    const operation = vi.fn(async () => "saved");
    const busySlots = {
      acquire: vi.fn(async () => ({
        granted: false as const,
        reason: "workspace_limit" as const,
      })),
    };
    await expect(
      withBrainEditSlot(busySlots, workspaceScope, operation)
    ).rejects.toBeInstanceOf(BrainEditBusyError);
    expect(busySlots.acquire).toHaveBeenCalledWith(
      workspaceScope.workspaceId,
      1,
      "brain-edit"
    );
    expect(operation).not.toHaveBeenCalled();

    const release = vi.fn(async () => undefined);
    const availableSlots = {
      acquire: vi.fn(async () => ({
        granted: true as const,
        lease: { index: 0, release },
      })),
    };
    await expect(
      withBrainEditSlot(availableSlots, workspaceScope, async () => {
        throw new Error("operation failed");
      })
    ).rejects.toThrow("operation failed");
    expect(release).toHaveBeenCalledOnce();
  });

  it("bounds list growth at the closed per-list maximum", async () => {
    const { workspaceScope, doc } = await seedBase();
    await db
      .update(brainDocs)
      .set({
        content: {
          register: "Direct",
          sentenceRhythm: "Short",
          signatureMoves: Array.from(
            { length: BRAIN_EDIT_LIST_MAX },
            (_, index) => `move-${index}`
          ),
          avoid: [],
        },
      })
      .where(eq(brainDocs.id, doc.id));
    const before = (await db.select().from(onboardingInputs)).length;
    await expect(
      editBrainDocument(db, workspaceScope, profileId, doc.id, [
        {
          pointer: `/signatureMoves/${BRAIN_EDIT_LIST_MAX}`,
          value: "Grow forever",
        },
      ])
    ).rejects.toBeInstanceOf(ProvenanceError);
    expect(await db.select().from(onboardingInputs)).toHaveLength(before);
    expect(await readBrainHistory(db, workspaceScope, profileId, "voice")).toHaveLength(1);
  });

  it("the hard input capability refuses oversized normalized immutable content", async () => {
    const { workspaceScope } = await seedBase();
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    await expect(
      writeCapabilities(profileScope).appendOnboardingInput({
        inputClass: "creator_authored",
        fieldKey: "creator_edit",
        content: "x".repeat(POST_CONTENT_MAX + 1),
      })
    ).rejects.toBeInstanceOf(OnboardingInputLimitError);
  });

  it("bounds normalized brain-document storage at the hard capability", async () => {
    const { workspaceScope, input } = await seedBase();
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: {
              register: "x".repeat(BRAIN_DOCUMENT_TEXT_MAX + 1),
              sentenceRhythm: "[check]",
              signatureMoves: [],
              avoid: [],
            },
            sourceEvidence: [
              {
                field: "/register",
                quote: input.content,
                inputId: input.id,
                startUtf16: 0,
                endUtf16: input.content.length,
              },
            ],
            reason: { code: "onboarding_inference" },
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(BrainDocumentLimitError);
  });

  it("bounds retained brain versions under the profile write lock", async () => {
    const { workspaceScope, input } = await seedBase();
    await db.delete(brainDocs).where(eq(brainDocs.profileId, profileId));
    await db.insert(brainDocs).values(
      Array.from({ length: BRAIN_VERSION_MAX }, (_, index) => ({
        workspaceId,
        profileId,
        kind: "voice" as const,
        version: index + 1,
        content: {
          register: "Direct",
          sentenceRhythm: "[check]",
          signatureMoves: [],
          avoid: [],
        },
        sourceEvidence: [
          {
            field: "/register",
            quote: input.content,
            inputId: input.id,
            startUtf16: 0,
            endUtf16: input.content.length,
          },
        ],
        reason: "fixture",
        status: "proposed" as const,
      }))
    );
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: {
              register: "Direct",
              sentenceRhythm: "[check]",
              signatureMoves: [],
              avoid: [],
            },
            sourceEvidence: [
              {
                field: "/register",
                quote: input.content,
                inputId: input.id,
                startUtf16: 0,
                endUtf16: input.content.length,
              },
            ],
            reason: { code: "onboarding_inference" },
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(BrainVersionLimitError);
    expect(
      await db.select().from(brainDocs).where(eq(brainDocs.profileId, profileId))
    ).toHaveLength(BRAIN_VERSION_MAX);
  });

  it("changes one declared-metric field while unchanged required siblings are submitted", async () => {
    const { workspaceScope, doc } = await seedStrategy();
    const edited = await editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
      label: "Completion rate",
      unit: "seconds",
      direction: "higher_is_better",
    });
    expect(edited.content).toMatchObject({
      metric: {
        label: "Completion rate",
        unit: "seconds",
        direction: "higher_is_better",
        platform: "TikTok",
        window: "30 days",
      },
    });
    const evidence = edited.sourceEvidence as SourceEvidenceEntry[];
    expect(evidence.filter((entry) => entry.field === "/metric/label")).toHaveLength(1);
    expect(evidence.filter((entry) => entry.field === "/metric/unit")).toHaveLength(1);
  });

  it("refuses an unchanged metric submission", async () => {
    const { workspaceScope, doc } = await seedStrategy();
    await expect(
      editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
        label: "Average watch time",
        unit: "seconds",
        direction: "higher_is_better",
      })
    ).rejects.toThrow(/does not change this brain version/i);
  });

  // SLICE 5 GATE ROUND 1, G3 — the no-op refusal is its OWN event.
  //
  // It shared `ProvenanceError` with the stale-base refusal, and `/brain`'s
  // `provenance` override is written for that one: "what this page showed you
  // and what the server holds no longer agree". Nothing of the sort happened.
  // The creator pressed Save on a form they had not changed — which
  // `editDeclaredMetricAction` makes trivially reachable, because it submits
  // all five metric positions on every press — and was told their page was
  // stale and to reload it. A refusal that names the wrong event sends the
  // reader to fix something that is not broken.
  //
  // A SIBLING, not a subclass — the shape `BrainEditEmptyError` already uses
  // for the other "your submission, not your evidence" refusal on this same
  // form. `ProvenanceError` means a QUOTE did not verify against a stored
  // input; a no-op submission has no quote to verify. Nothing in the product
  // catches `ProvenanceError` polymorphically (only `billing-errors.ts`'s
  // ordered class walk, which reads the exact class), so the split costs no
  // caller and buys the right sentence.
  it("G3: the NO-OP refusal is its own class and does not claim the page went stale", async () => {
    const { workspaceScope, doc } = await seedStrategy();
    const raised = await editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
      label: "Average watch time",
      unit: "seconds",
      direction: "higher_is_better",
    }).catch((err: unknown) => err);

    expect(raised).toBeInstanceOf(BrainEditUnchangedError);
    // NOT a ProvenanceError: that is the whole point. If it were, the ordered
    // class walk in `billing-errors.ts` could still resolve it to `provenance`
    // and the creator would keep reading the stale-page sentence.
    expect(raised).not.toBeInstanceOf(ProvenanceError);
    const message = (raised as Error).message;
    expect(message).toMatch(/does not change this brain version/i);
    // ...and it must NOT carry the stale-base sentence, which is the other
    // event this class exists to stop being confused with.
    expect(message).not.toContain(STALE_BRAIN_EDIT_DETAIL);
    // Nothing was written: no new version, no immutable creator_authored row.
    expect(await readBrainHistory(db, workspaceScope, profileId, "strategy")).toHaveLength(1);
    expect(
      (await db.select().from(onboardingInputs)).filter(
        (row) => row.fieldKey === "creator_edit"
      )
    ).toHaveLength(0);
  });

  it("G3: the STALE-base refusal is NOT the no-op class, so the two stay distinguishable", async () => {
    // The negative half. If `BrainEditUnchangedError` were thrown for the
    // stale case too the split would be cosmetic, and the copy would then be
    // wrong in the other direction.
    const { workspaceScope, doc } = await seedBase();
    await confirmAndActivateVoice(workspaceScope, doc.id);
    await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Warm and direct" },
    ]);
    const stale = await editBrainDocument(db, workspaceScope, profileId, doc.id, [
      { pointer: "/register", value: "Discard the newer draft" },
    ]).catch((err: unknown) => err);
    expect(stale).toBeInstanceOf(ProvenanceError);
    expect(stale).not.toBeInstanceOf(BrainEditUnchangedError);
    expect((stale as Error).message).toContain(STALE_BRAIN_EDIT_DETAIL);
  });

  // SEMANTIC CHANGE, RECORDED RATHER THAN QUIETLY REWRITTEN (slice 5 gate
  // round 1, G1). This test asserted that an explicit `null` cleared the two
  // optional metric positions TO `[check]`. It now asserts they are DECLINED —
  // the key is removed. The old behaviour was the defect, not a contract:
  // `[check]` states "we are not saying yet" about a question the creator was
  // asked and declined, it produced a shape the interview never writes, and
  // the same code path made the metric uneditable for anyone who had declined
  // the question in the first place (see the four `G1:` tests below).
  it("uses explicit null to DECLINE optional metric platform and window", async () => {
    const { workspaceScope, doc } = await seedStrategy();
    const edited = await editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
      label: "Average watch time",
      unit: "seconds",
      direction: "higher_is_better",
      platform: null,
      window: null,
    });
    const metric = (edited.content as { metric: Record<string, unknown> }).metric;
    expect(Object.hasOwn(metric, "platform")).toBe(false);
    expect(Object.hasOwn(metric, "window")).toBe(false);
    // ...and the required siblings are untouched, so a decline is a decline
    // and not a metric-wide reset.
    expect(metric.label).toBe("Average watch time");
    expect(metric.direction).toBe("higher_is_better");
    const evidence = edited.sourceEvidence as SourceEvidenceEntry[];
    expect(evidence.some((entry) => entry.field === "/metric/platform")).toBe(false);
    expect(evidence.some((entry) => entry.field === "/metric/window")).toBe(false);
    // A submission that ONLY declines types nothing, so it writes no
    // creator_authored input — `onboarding_inputs` is immutable and
    // export-included, and a row with an empty body is not the creator's words.
    const authored = (await db.select().from(onboardingInputs)).filter(
      (row) => row.fieldKey === "creator_edit"
    );
    expect(authored).toHaveLength(0);
  });

  // SLICE 5 GATE ROUND 1, G1 — the declared metric could not be edited AT ALL
  // by a creator who declined either optional question.
  //
  // The shape, end to end: `interview-ops.ts` omits a declined `declinable`
  // field, so the stored `metric` has no `platform` key. `brain-view.tsx`
  // renders both optional inputs unconditionally and `actions.ts` reads them
  // with `optionalMetricValue`, which returns `string | null` and NEVER
  // `undefined` — so every metric submission carried `/metric/platform`, and
  // `writePointer`'s `Object.hasOwn` check refused it as "not a claim position
  // in this version". `/brain` then rendered `?e=provenance`: "what this page
  // showed you and what the server holds no longer agree" — a FALSE CAUSE for
  // a dead end, on REQ-B03's own surface.
  //
  // The three tests below are the three positions a creator can be in. Each
  // one is a different branch of the fix, and none of them is reachable from
  // the all-questions-answered fixture the slice shipped with.
  it("G1: a creator who DECLINED both optional metric questions can still edit the metric", async () => {
    const { workspaceScope, doc } = await seedStrategyDeclinedOptionals();
    // EXACTLY what `editDeclaredMetricAction` sends for a form whose two
    // optional inputs are blank: `null`, never `undefined`.
    const edited = await editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
      label: "Completion rate",
      unit: "seconds",
      direction: "higher_is_better",
      platform: null,
      window: null,
    });
    expect(edited.version).toBe(2);
    const metric = (edited.content as { metric: Record<string, unknown> }).metric;
    expect(metric.label).toBe("Completion rate");
    // A DECLINED optional stays declined — absent, never `[check]`. `[check]`
    // means "we are not stating this yet"; absence means "you told us you are
    // not naming one", and the interview stores the second as an omission.
    expect(Object.hasOwn(metric, "platform")).toBe(false);
    expect(Object.hasOwn(metric, "window")).toBe(false);
  });

  it("G1: an ABSENT optional metric position can be ADDED by naming it", async () => {
    const { workspaceScope, doc } = await seedStrategyDeclinedOptionals();
    const edited = await editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
      label: "Average watch time",
      unit: "seconds",
      direction: "higher_is_better",
      platform: "TikTok",
      window: null,
    });
    expect(edited.content).toMatchObject({ metric: { platform: "TikTok" } });
    expect(
      Object.hasOwn(
        (edited.content as { metric: Record<string, unknown> }).metric,
        "window"
      )
    ).toBe(false);
    // A newly stated position is a claim position, so it is cited like any
    // other — the creator's own words, in the creator_authored input this edit
    // wrote. Adding a key must not be a way to state something uncited.
    const evidence = edited.sourceEvidence as SourceEvidenceEntry[];
    expect(evidence.filter((e) => e.field === "/metric/platform")).toHaveLength(1);
  });

  it("G1: blanking an ANSWERED optional records it as DECLINED, not as [check]", async () => {
    const { workspaceScope, doc } = await seedStrategy();
    const edited = await editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
      label: "Average watch time",
      unit: "seconds",
      direction: "higher_is_better",
      platform: null,
      window: "30 days",
    });
    const metric = (edited.content as { metric: Record<string, unknown> }).metric;
    expect(Object.hasOwn(metric, "platform")).toBe(false);
    expect(metric.window).toBe("30 days");
    const evidence = edited.sourceEvidence as SourceEvidenceEntry[];
    // The removed position's old evidence goes with it: a citation for a claim
    // the document no longer makes is a quote with nothing behind it, and
    // `writeBrainDoc` refuses an entry naming an undeclared position anyway.
    expect(evidence.some((e) => e.field === "/metric/platform")).toBe(false);
    expect(evidence.some((e) => e.field === "/metric/window")).toBe(true);
  });

  it("G1: a decline of an ALREADY-absent optional is not a change, so it is refused as one", async () => {
    const { workspaceScope, doc } = await seedStrategyDeclinedOptionals();
    // Nothing moved: the two optionals were absent and are being declined
    // again. This must read as "you changed nothing", never as a phantom edit
    // that burns a version number in an append-only history.
    await expect(
      editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
        label: "Average watch time",
        unit: "seconds",
        direction: "higher_is_better",
        platform: null,
        window: null,
      })
    ).rejects.toThrow(/does not change this brain version/i);
  });

  it("G1: the create grant is the SCHEMA's, not 'any absent key' — an invented position is still refused", async () => {
    const { workspaceScope, doc } = await seedStrategyDeclinedOptionals();
    const before = (await db.select().from(onboardingInputs)).length;
    await expect(
      editBrainDocument(db, workspaceScope, profileId, doc.id, [
        { pointer: "/metric/audienceSize", value: "42000" },
      ])
    ).rejects.toBeInstanceOf(ProvenanceError);
    // ...and a claim-bearing key on the DOCUMENT root, not just under /metric.
    await expect(
      editBrainDocument(db, workspaceScope, profileId, doc.id, [
        { pointer: "/followerCount", value: "42000" },
      ])
    ).rejects.toBeInstanceOf(ProvenanceError);
    expect(await db.select().from(onboardingInputs)).toHaveLength(before);
    expect(
      await readBrainHistory(db, workspaceScope, profileId, "strategy")
    ).toHaveLength(1);
  });
});

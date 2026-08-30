import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles, frameworks } from "../src/brain-schema";
import { onboardingInputs } from "../src/onboarding-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  BrainEditEmptyError,
  BrainEditBusyError,
  BrainEditLimitError,
  BrainDocumentLimitError,
  BrainVersionLimitError,
  OnboardingInputLimitError,
  ProvenanceError,
} from "../src/errors";
import {
  BRAIN_DOCUMENT_TEXT_MAX,
  BRAIN_VERSION_MAX,
  POST_CONTENT_MAX,
} from "../src/storage-limits";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type SourceEvidenceEntry,
} from "../src/with-workspace";
import {
  activateVoice,
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

  async function confirmAndActivateVoice(
    workspaceScope: Awaited<ReturnType<typeof withWorkspace>>,
    brainDocId: string
  ) {
    await confirmVoiceFields(db, workspaceScope, profileId, brainDocId, [
      { pointer: "/register", asPlaceholder: false },
      { pointer: "/sentenceRhythm", asPlaceholder: false },
    ]);
    return activateVoice(db, workspaceScope, profileId, brainDocId);
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

    await expect(
      editBrainDocument(db, workspaceScope, profileId, edited.id, [
        { pointer: "/sentenceRhythm", value: "[check]" },
      ])
    ).rejects.toBeInstanceOf(BrainEditEmptyError);
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
      activateVoice(db, workspaceScope, profileId, doc.id)
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

  it("uses explicit null to clear optional metric platform and window", async () => {
    const { workspaceScope, doc } = await seedStrategy();
    const edited = await editDeclaredMetric(db, workspaceScope, profileId, doc.id, {
      label: "Average watch time",
      unit: "seconds",
      direction: "higher_is_better",
      platform: null,
      window: null,
    });
    expect(edited.content).toMatchObject({
      metric: { platform: "[check]", window: "[check]" },
    });
    const evidence = edited.sourceEvidence as SourceEvidenceEntry[];
    expect(evidence.some((entry) => entry.field === "/metric/platform")).toBe(false);
    expect(evidence.some((entry) => entry.field === "/metric/window")).toBe(false);
  });

  it("the frameworks accessor returns this profile's private rows only", async () => {
    const { workspaceScope } = await seedBase();
    await db.insert(frameworks).values([
      {
        slug: "mine",
        name: "Mine",
        beats: [], whyItConverts: "Private", applicability: [], sourceReferences: [], evidenceEntries: [], testedCaveats: [],
        confidence: "observed", saturation: "observed", visibility: "private", ownerProfileId: profileId, workspaceId,
      },
      {
        slug: "shared",
        name: "Shared",
        beats: [], whyItConverts: "Shared", applicability: [], sourceReferences: [], evidenceEntries: [], testedCaveats: [],
        confidence: "observed", saturation: "observed", visibility: "shared",
      },
    ]);
    const scope = await ProfileScope.mint(db, workspaceScope, profileId);
    expect((await scope.accessors.frameworks()).map((row) => row.slug)).toEqual(["mine"]);
  });
});

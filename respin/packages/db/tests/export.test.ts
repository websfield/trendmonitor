import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { pausePeriods } from "../src/billing-schema";
import { brainDocs, creatorProfiles, frameworks } from "../src/brain-schema";
import {
  brainActivationSnapshots,
  onboardingInterviewDrafts,
} from "../src/onboarding-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type SourceEvidenceEntry,
} from "../src/with-workspace";
import { ExportBusyError, ProfileAccessError } from "../src/errors";
import type { RunSlots } from "../src/run-slot";
import {
  EXPORT_EVIDENCE_UNVERIFIED,
  EXPORT_STREAM_DEADLINE_MS,
  NO_RULES_RECORDED,
  PLACEHOLDER_ABSENCE,
  assertExportRegistryReadable,
  exportBrain,
  exportBrainFile,
  openBrainExport,
} from "../src/export";

async function collect(chunks: AsyncIterable<string>): Promise<string> {
  let value = "";
  for await (const chunk of chunks) value += chunk;
  return value;
}

describe("REQ-A04 brain export", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "export_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "export_user", name: "A" })
    ).workspace.id;
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "Anna" })
      .returning();
    profileId = profile.id;
  });

  async function seedVoice() {
    const workspaceScope = await withWorkspace(db, { authUserId: "export_user" });
    const profileScope = await ProfileScope.mint(db, workspaceScope, profileId);
    const caps = writeCapabilities(profileScope);
    const input = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: "I write directly",
    });
    const evidence: SourceEvidenceEntry[] = [
      {
        field: "/register",
        quote: input.content,
        inputId: input.id,
        startUtf16: 0,
        endUtf16: input.content.length,
      },
    ];
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: {
            register: "Direct",
            sentenceRhythm: "[check]",
            signatureMoves: [],
            avoid: [],
          },
          sourceEvidence: evidence,
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    return { workspaceScope, input, doc };
  }

  it("walks the registry, emits complete JSON, and labels markdown as a human projection", async () => {
    const { workspaceScope } = await seedVoice();
    await db.insert(frameworks).values([
      {
        slug: "private-anna",
        name: "Anna's framework",
        beats: [],
        whyItConverts: "A private working note",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "observed",
        saturation: "observed",
        visibility: "private",
        ownerProfileId: profileId,
        workspaceId,
      },
      {
        slug: "shared-library",
        name: "Shared framework",
        beats: [],
        whyItConverts: "Library content",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "observed",
        saturation: "observed",
        visibility: "shared",
      },
    ]);

    const bundle = await exportBrain(db, workspaceScope, profileId);
    const parsed = JSON.parse(bundle.json) as typeof bundle.data;
    const included = parsed.registry.filter((entry) => entry.included).map((entry) => entry.table);
    expect(Object.keys(parsed.tables).sort()).toEqual([...included].sort());
    expect(parsed.tables.frameworks).toHaveLength(1);
    expect((parsed.tables.frameworks[0] as { slug: string }).slug).toBe("private-anna");
    expect(bundle.markdown).toContain("human-readable projection");
    expect(bundle.markdown).toContain(NO_RULES_RECORDED);
    expect(bundle.markdown).toContain(PLACEHOLDER_ABSENCE);
  });

  it("annotates an unreadable quote and completes both formats", async () => {
    const { workspaceScope, doc } = await seedVoice();
    const [stored] = await db.select().from(brainDocs).where(eq(brainDocs.id, doc.id));
    const [entry] = stored.sourceEvidence as SourceEvidenceEntry[];
    await db
      .update(brainDocs)
      .set({ sourceEvidence: [{ ...entry, quote: "not in the stored post" }] })
      .where(eq(brainDocs.id, doc.id));

    const bundle = await exportBrain(db, workspaceScope, profileId);
    expect(bundle.data.annotations).toContainEqual(
      expect.objectContaining({ brainDocId: doc.id, message: EXPORT_EVIDENCE_UNVERIFIED })
    );
    expect(bundle.json).toContain(EXPORT_EVIDENCE_UNVERIFIED);
    expect(bundle.markdown).toContain(EXPORT_EVIDENCE_UNVERIFIED);
  });

  it("annotates null and non-object evidence as an unknown claim instead of throwing", async () => {
    const { workspaceScope, doc } = await seedVoice();
    await db
      .update(brainDocs)
      .set({
        sourceEvidence: [null, "bad evidence"] as unknown as SourceEvidenceEntry[],
      })
      .where(eq(brainDocs.id, doc.id));

    const bundle = await exportBrain(db, workspaceScope, profileId);
    expect(bundle.data.annotations).toEqual([
      {
        brainDocId: doc.id,
        pointer: "(unknown claim)",
        message: EXPORT_EVIDENCE_UNVERIFIED,
      },
      {
        brainDocId: doc.id,
        pointer: "(unknown claim)",
        message: EXPORT_EVIDENCE_UNVERIFIED,
      },
    ]);
  });

  it("composes every included table for this profile only when a sibling shares the workspace", async () => {
    const { workspaceScope, doc } = await seedVoice();
    const [sibling] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "SIBLING-PROFILE" })
      .returning();
    const siblingScope = await ProfileScope.mint(db, workspaceScope, sibling.id);
    const siblingCaps = writeCapabilities(siblingScope);
    const siblingInput = await siblingCaps.appendOnboardingInput({
      inputClass: "own_post",
      content: "SIBLING-INPUT",
    });
    const siblingDoc = await db.transaction((tx) =>
      siblingCaps.writeBrainDoc(
        {
          kind: "voice",
          content: {
            register: "SIBLING-BRAIN",
            sentenceRhythm: "[check]",
            signatureMoves: [],
            avoid: [],
          },
          sourceEvidence: [
            {
              field: "/register",
              quote: siblingInput.content,
              inputId: siblingInput.id,
              startUtf16: 0,
              endUtf16: siblingInput.content.length,
            },
          ],
          reason: { code: "onboarding_inference" },
        },
        tx
      )
    );
    await db.insert(onboardingInterviewDrafts).values([
      { workspaceId, profileId, answers: { marker: "TARGET-DRAFT" } },
      { workspaceId, profileId: sibling.id, answers: { marker: "SIBLING-DRAFT" } },
    ]);
    await db.insert(brainActivationSnapshots).values([
      { workspaceId, profileId, voiceDocId: doc.id },
      { workspaceId, profileId: sibling.id, voiceDocId: siblingDoc.id },
    ]);
    await db.insert(frameworks).values([
      {
        slug: "target-framework",
        name: "TARGET-FRAMEWORK",
        beats: [],
        whyItConverts: "target",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "observed",
        saturation: "observed",
        visibility: "private",
        ownerProfileId: profileId,
        workspaceId,
      },
      {
        slug: "sibling-framework",
        name: "SIBLING-FRAMEWORK",
        beats: [],
        whyItConverts: "sibling",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "observed",
        saturation: "observed",
        visibility: "private",
        ownerProfileId: sibling.id,
        workspaceId,
      },
    ]);

    const bundle = await exportBrain(db, workspaceScope, profileId);
    for (const [table, rows] of Object.entries(bundle.data.tables)) {
      expect(
        JSON.stringify(rows),
        `${table} leaked a same-workspace sibling profile`
      ).not.toContain("SIBLING-");
    }
    expect(bundle.data.tables.creator_profiles).toHaveLength(1);
    expect(bundle.data.tables.brain_docs).toHaveLength(1);
    expect(bundle.data.tables.onboarding_inputs).toHaveLength(1);
    expect(bundle.data.tables.onboarding_interview_drafts).toHaveLength(1);
    expect(bundle.data.tables.brain_activation_snapshots).toHaveLength(1);
    expect(bundle.data.tables.frameworks).toHaveLength(1);
  });

  it("builds only the requested download representation", async () => {
    const { workspaceScope } = await seedVoice();
    const json = await exportBrainFile(db, workspaceScope, profileId, "json");
    const markdown = await exportBrainFile(db, workspaceScope, profileId, "markdown");
    expect(JSON.parse(json)).toMatchObject({ profileId });
    expect(markdown).toContain("human-readable projection");
  });

  it("streams complete JSON across fixed pages and streams only markdown when requested", async () => {
    const { workspaceScope } = await seedVoice();
    await db.insert(frameworks).values(
      Array.from({ length: 30 }, (_, index) => ({
        slug: `stream-${index}`,
        name: `Stream ${index}`,
        beats: [],
        whyItConverts: "paged",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "observed" as const,
        saturation: "observed" as const,
        visibility: "private" as const,
        ownerProfileId: profileId,
        workspaceId,
      }))
    );

    const json = await collect(
      await openBrainExport(db, workspaceScope, profileId, "json")
    );
    const parsed = JSON.parse(json) as { tables: Record<string, unknown[]> };
    expect(parsed.tables.frameworks).toHaveLength(30);
    const markdown = await collect(
      await openBrainExport(db, workspaceScope, profileId, "markdown")
    );
    expect(markdown).toContain("human-readable projection");
    expect(markdown).not.toContain('"tables"');
  });

  it("refuses a busy export before starting its producer transaction", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    const slots: RunSlots = {
      async acquire(workspace, limit, namespace) {
        expect(workspace).toBe(workspaceScope.workspaceId);
        expect(limit).toBe(1);
        expect(namespace).toBe("export");
        return { granted: false, reason: "workspace_limit" };
      },
    };

    await expect(
      openBrainExport(db, workspaceScope, profileId, "json", slots)
    ).rejects.toBeInstanceOf(ExportBusyError);
    expect(
      transaction,
      "a refused session slot must not start the paged export transaction"
    ).not.toHaveBeenCalled();
  });

  it("preflights profile access before taking a session slot", async () => {
    const { workspaceScope } = await seedVoice();
    await seedAuthUser(db, "export_foreign");
    const foreignWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "export_foreign", name: "Foreign" })
    ).workspace.id;
    const [foreign] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: foreignWorkspaceId, displayName: "Foreign" })
      .returning();
    let acquireCalls = 0;
    const slots: RunSlots = {
      async acquire() {
        acquireCalls += 1;
        return { granted: false, reason: "workspace_limit" };
      },
    };

    await expect(
      openBrainExport(db, workspaceScope, foreign.id, "json", slots)
    ).rejects.toBeInstanceOf(ProfileAccessError);
    expect(acquireCalls).toBe(0);
  });

  it("releases a pre-acquired export slot when cancelled before first pull", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    let releases = 0;
    const slots: RunSlots = {
      async acquire() {
        return {
          granted: true,
          lease: {
            index: 0,
            async release() {
              releases += 1;
            },
          },
        };
      },
    };

    const iterable = await openBrainExport(
      db,
      workspaceScope,
      profileId,
      "json",
      slots
    );
    const iterator = iterable[Symbol.asyncIterator]();
    await iterator.return?.();
    expect(releases).toBe(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("a non-reading client hits the bounded lifetime, releases its slot, and cannot start later", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    let releases = 0;
    const slots: RunSlots = {
      async acquire() {
        return {
          granted: true,
          lease: {
            index: 0,
            async release() {
              releases += 1;
            },
          },
        };
      },
    };
    const deadlineMs = 20;
    expect(deadlineMs).toBeLessThan(EXPORT_STREAM_DEADLINE_MS);
    const iterable = await openBrainExport(
      db,
      workspaceScope,
      profileId,
      "json",
      slots,
      new Date(),
      deadlineMs
    );
    expect(releases).toBe(0);
    await vi.waitFor(() => expect(releases).toBe(1), { timeout: 1_000 });
    expect(
      transaction,
      "the deadline must not lazily start an export the client never pulled"
    ).not.toHaveBeenCalled();
    await expect(iterable[Symbol.asyncIterator]().next()).rejects.toThrow(
      /exceeded its bounded lifetime/
    );
    expect(releases).toBe(1);
  });

  it("a started but stalled stream deadline settles its producer before releasing the slot", async () => {
    const { workspaceScope } = await seedVoice();
    const transaction = vi.spyOn(db, "transaction");
    let releaseStarted = false;
    let allowRelease!: () => void;
    const releaseGate = new Promise<void>((resolve) => {
      allowRelease = resolve;
    });
    const slots: RunSlots = {
      async acquire() {
        return {
          granted: true,
          lease: {
            index: 0,
            async release() {
              releaseStarted = true;
              await releaseGate;
            },
          },
        };
      },
    };
    const iterable = await openBrainExport(
      db,
      workspaceScope,
      profileId,
      "json",
      slots,
      new Date(),
      20
    );
    const iterator = iterable[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual(
      expect.objectContaining({ done: false })
    );
    expect(transaction).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(releaseStarted).toBe(true), { timeout: 1_000 });

    let nextSettled = false;
    const afterDeadline = iterator.next().finally(() => {
      nextSettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      nextSettled,
      "the deadline path returned before the shared advisory unlock completed"
    ).toBe(false);
    allowRelease();
    await expect(afterDeadline).rejects.toThrow(/exceeded its bounded lifetime/);
  });

  it("is exempt from an open workspace pause", async () => {
    const { workspaceScope } = await seedVoice();
    await db.insert(pausePeriods).values({ workspaceId, startedAt: new Date() });
    await expect(exportBrain(db, workspaceScope, profileId)).resolves.toEqual(
      expect.objectContaining({ json: expect.any(String), markdown: expect.any(String) })
    );
  });

  it("refuses a profile belonging to another workspace", async () => {
    const { workspaceScope } = await seedVoice();
    await seedAuthUser(db, "export_other");
    const otherWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "export_other", name: "B" })
    ).workspace.id;
    const [otherProfile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: otherWorkspaceId, displayName: "Other" })
      .returning();
    await expect(exportBrain(db, workspaceScope, otherProfile.id)).rejects.toBeInstanceOf(
      ProfileAccessError
    );
  });

  it("NON-VACUITY: a registered included table with no reader is refused", () => {
    expect(() =>
      assertExportRegistryReadable([
        {
          table: "future_creator_rows",
          holdsCreatorContent: true,
          export: { included: true, reason: "A planted future creator-data table for the guard." },
          deletion: { behaviour: "cascade", reason: "A planted deletion decision for the guard." },
        },
      ])
    ).toThrow(/future_creator_rows/);
  });
});

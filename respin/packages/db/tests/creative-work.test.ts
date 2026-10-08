// THE CREATIVE PIECE'S WRITE SURFACE (launch L2, R-151) — the scoped
// piece/selection operations, driven at the capability layer.
//
//  1. ZERO COST, SERVER-DERIVED IDENTITY. Choosing a concept writes one row and
//     no ledger row; the operation id, state and version are the DATABASE's —
//     and the assertion smuggles each in through `as unknown as` (CLAUDE.md
//     2026-08-21: typed shut is not cast shut).
//  2. THE CAGE AND THE SOURCE. A concept of another profile is refused with the
//     not-found refusal at the capability, and is UNREPRESENTABLE at the table
//     (composite FK); an index outside the stored concepts is refused, and a
//     raw out-of-range index is refused by the CHECK.
//  3. THE VERSION TOKEN. "New generation" and cancel are guarded by it; a stale
//     token, a cancelled piece and a foreign piece each refuse by name.
//  4. THE SETTLEMENT LINK AND THE DRAFT-1 FLIP live in `settleGeneration`'s one
//     transaction, and the flip touches only that attempt's generation rows.
//
// The real-Postgres half (two connections) runs when TEST_DATABASE_URL is set.
import { beforeEach, describe, expect, it, afterAll, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  CreativePieceError,
  OWN_IDEA_MAX,
  WorkspacePausedError,
  brainActivationSnapshots,
  createDockerTestDb,
  createTestDb,
  creativePieces,
  creatorProfiles,
  creditLedger,
  ensureUserWorkspace,
  generationAttempts,
  generations,
  memberships,
  modelUsage,
  pausePeriods,
  seedAuthUser,
  seedDb,
  withWorkspace,
  writeCapabilities,
  type ProfileWriteCapabilities,
  type TestDb,
  type WorkspaceScope,
} from "../src/index";
import { ProfileScope } from "../src/with-workspace";
import { ProfileRoleError } from "../src/errors";
import { linkCreativePieceScriptInScope } from "../src/creative-work-ops";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "../../../tests/support/source-files";

/**
 * Every `creative_pieces` UPDATE site in a source text, with the text of its
 * `.set(...)` up to the `.where(` that follows. Drizzle builder and raw SQL.
 */
function pieceUpdateSites(text: string): string[] {
  const sites: string[] = [];
  for (const m of text.matchAll(/\.update\(\s*(?:schema\.)?creativePieces\s*\)|\bUPDATE\s+creative_pieces\b/gi)) {
    const rest = text.slice(m.index);
    const end = rest.search(/\.where\(|\bWHERE\b/i);
    sites.push(end < 0 ? rest : rest.slice(0, end));
  }
  return sites;
}
const SOURCE_COLUMNS = /sourceGenerationId|sourceIdeaIndex|ownIdea|source_generation_id|source_idea_index|own_idea/;

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A stored, usable concept batch of three for `profileId` — written raw. */
async function storeConcepts(
  db: TestDb,
  profileId: string,
  workspaceId: string,
  attemptId: string
): Promise<string> {
  const [snap] = await db.insert(brainActivationSnapshots).values({ profileId, workspaceId }).returning();
  await db.insert(generationAttempts).values({
    profileId, workspaceId, attemptId, purpose: "generation", mode: "ideation", payloadSha256: sha(attemptId),
  });
  const [g] = await db
    .insert(generations)
    .values({
      profileId, workspaceId, attemptId, mode: "ideation", brainActivationId: snap.id,
      request: { input: "x" }, model: "m", promptBundleVersion: "b", configVersion: 1,
      outcome: "usable",
      output: { ideas: [{ hook: "a" }, { hook: "b" }, { hook: "c" }] },
      weakestPoint: "w", killTest: {},
    })
    .returning();
  return g.id;
}

describe("the creative piece's write capabilities", () => {
  let db: TestDb;
  let ws: WorkspaceScope;
  let caps: ProfileWriteCapabilities;
  let profileId: string;
  let workspaceId: string;
  let sourceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" });
    ws = await withWorkspace(db, { authUserId: "user_a" });
    workspaceId = ws.workspaceId;
    const [p] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "Anna" }).returning();
    profileId = p.id;
    caps = writeCapabilities(await ProfileScope.mint(db, ws, profileId));
    sourceId = await storeConcepts(db, profileId, workspaceId, "ideas-a");
  });

  const create = (params: Parameters<ProfileWriteCapabilities["createCreativePiece"]>[0], c = caps) =>
    db.transaction((tx) => c.createCreativePiece(params, tx));
  const reason = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return "accepted";
    } catch (e) {
      return e instanceof CreativePieceError ? e.reason : (e as Error).name;
    }
  };

  it("choosing a concept costs NOTHING and the operation id, state and version are the database's", async () => {
    const piece = await create({ source: { generationId: sourceId, ideaIndex: 2 }, quoteConfigVersion: 1 });
    expect(piece.operationAttemptId).toMatch(UUID);
    expect(piece.state).toBe("selected");
    expect(piece.version).toBe(1);
    expect(piece.selectedGenerationId).toBeNull();
    expect(await db.select().from(creditLedger)).toHaveLength(0);
    // A second choice of the SAME concept is a second piece with its own id.
    const again = await create({ source: { generationId: sourceId, ideaIndex: 2 }, quoteConfigVersion: 1 });
    expect(again.operationAttemptId).not.toBe(piece.operationAttemptId);
  });

  it("SERVER-DERIVED columns smuggled in through a CAST never land", async () => {
    const forged = {
      source: { generationId: sourceId, ideaIndex: 0 },
      quoteConfigVersion: 1,
      operationAttemptId: "00000000-0000-4000-8000-0000000000aa",
      state: "scripted",
      version: 99,
      selectedGenerationId: sourceId,
      profileId: "00000000-0000-4000-8000-0000000000bb",
      workspaceId: "00000000-0000-4000-8000-0000000000cc",
      id: "00000000-0000-4000-8000-0000000000dd",
      ownIdea: "SMUGGLED",
    } as unknown as Parameters<ProfileWriteCapabilities["createCreativePiece"]>[0];
    const piece = await create(forged);
    const [row] = await db.select().from(creativePieces).where(eq(creativePieces.id, piece.id));
    expect(row.operationAttemptId).not.toBe("00000000-0000-4000-8000-0000000000aa");
    expect(row.state).toBe("selected");
    expect(row.version).toBe(1);
    expect(row.selectedGenerationId).toBeNull();
    expect(row.profileId).toBe(profileId);
    expect(row.workspaceId).toBe(workspaceId);
    expect(row.id).not.toBe("00000000-0000-4000-8000-0000000000dd");
    expect(row.ownIdea).toBeNull();
  });

  it("CROSS-PROFILE source forgery is refused by name at the capability, and is unrepresentable at the table", async () => {
    const [other] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "Bo" }).returning();
    const otherCaps = writeCapabilities(await ProfileScope.mint(db, ws, other.id));
    expect(await reason(() => create({ source: { generationId: sourceId, ideaIndex: 0 }, quoteConfigVersion: 1 }, otherCaps))).toBe("not_found");
    let code: string | undefined;
    try {
      await db.insert(creativePieces).values({
        profileId: other.id, workspaceId, sourceGenerationId: sourceId, sourceIdeaIndex: 0, quoteConfigVersion: 1,
      });
    } catch (e) {
      code = ((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code);
    }
    expect(code).toBe("23503");
    expect(await reason(() => create({ source: { generationId: "not-a-uuid", ideaIndex: 0 }, quoteConfigVersion: 1 }))).toBe("not_found");
  });

  it("SOURCE-INDEX forgery: an index outside the stored concepts is refused, and a raw one past the range is refused by the CHECK", async () => {
    for (const ideaIndex of [3, 4, -1, 0.5]) {
      expect(await reason(() => create({ source: { generationId: sourceId, ideaIndex }, quoteConfigVersion: 1 })), String(ideaIndex)).toBe("source_unusable");
    }
    let code: string | undefined;
    try {
      await db.insert(creativePieces).values({
        profileId, workspaceId, sourceGenerationId: sourceId, sourceIdeaIndex: 7, quoteConfigVersion: 1,
      });
    } catch (e) {
      code = ((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code);
    }
    expect(code).toBe("23514");
    // A quote version that does not exist is refused too.
    expect(await reason(() => create({ source: { generationId: sourceId, ideaIndex: 0 }, quoteConfigVersion: 9999 }))).toBe("stale");
  });

  it("an OWN IDEA is stored verbatim; a blank or oversized one is refused; a row with two origins is unrepresentable", async () => {
    const own = "  my own idea, exactly as typed\n";
    const piece = await create({ ownIdea: own, quoteConfigVersion: 1 });
    expect(piece.ownIdea).toBe(own);
    expect(piece.sourceGenerationId).toBeNull();
    expect(await reason(() => create({ ownIdea: " \n ", quoteConfigVersion: 1 }))).toBe("not_commissionable");
    expect(await reason(() => create({ ownIdea: "x".repeat(OWN_IDEA_MAX + 1), quoteConfigVersion: 1 }))).toBe("not_commissionable");
    await expect(
      db.insert(creativePieces).values({
        profileId, workspaceId, ownIdea: "both", sourceGenerationId: sourceId, sourceIdeaIndex: 0, quoteConfigVersion: 1,
      })
    ).rejects.toThrow();
  });

  it("'New generation' rotates the operation id under the version token; stale, cancelled and foreign moves refuse by name", async () => {
    const piece = await create({ source: { generationId: sourceId, ideaIndex: 0 }, quoteConfigVersion: 1 });
    const renewed = await db.transaction((tx) =>
      caps.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 1, quoteConfigVersion: 1 }, tx)
    );
    expect(renewed.operationAttemptId).not.toBe(piece.operationAttemptId);
    expect(renewed.version).toBe(2);
    expect(await reason(() => db.transaction((tx) => caps.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 1, quoteConfigVersion: 1 }, tx)))).toBe("stale");
    const [other] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "Bo" }).returning();
    const otherCaps = writeCapabilities(await ProfileScope.mint(db, ws, other.id));
    expect(await reason(() => db.transaction((tx) => otherCaps.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 2, quoteConfigVersion: 1 }, tx)))).toBe("not_found");
    expect(await reason(() => db.transaction((tx) => otherCaps.cancelCreativePiece({ pieceId: piece.id, expectedVersion: 2 }, tx)))).toBe("not_found");
    expect(await db.transaction((tx) => otherCaps.readCreativePiece(piece.id, tx))).toBeUndefined();
    const cancelled = await db.transaction((tx) => caps.cancelCreativePiece({ pieceId: piece.id, expectedVersion: 2 }, tx));
    expect(cancelled.state).toBe("cancelled");
    expect(await reason(() => db.transaction((tx) => caps.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 3, quoteConfigVersion: 1 }, tx)))).toBe("not_commissionable");
    expect(await db.select().from(creditLedger)).toHaveLength(0);
  });

  it("a VIEWER may not choose, renew or cancel — but may read", async () => {
    const piece = await create({ source: { generationId: sourceId, ideaIndex: 0 }, quoteConfigVersion: 1 });
    await db.update(memberships).set({ role: "viewer" }).where(eq(memberships.workspaceId, workspaceId));
    const viewerCaps = writeCapabilities(await ProfileScope.mint(db, await withWorkspace(db, { authUserId: "user_a" }), profileId));
    for (const run of [
      () => create({ source: { generationId: sourceId, ideaIndex: 1 }, quoteConfigVersion: 1 }, viewerCaps),
      () => db.transaction((tx) => viewerCaps.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 1, quoteConfigVersion: 1 }, tx)),
      () => db.transaction((tx) => viewerCaps.cancelCreativePiece({ pieceId: piece.id, expectedVersion: 1 }, tx)),
    ]) {
      await expect(run()).rejects.toBeInstanceOf(ProfileRoleError);
    }
    expect((await db.transaction((tx) => viewerCaps.readCreativePiece(piece.id, tx)))?.piece.id).toBe(piece.id);
  });

  it("a PAUSED workspace refuses choosing, renewing and cancelling (REQ-G08)", async () => {
    const piece = await create({ source: { generationId: sourceId, ideaIndex: 0 }, quoteConfigVersion: 1 });
    await db.insert(pausePeriods).values({
      workspaceId, startedAt: new Date(Date.now() - 60_000), startedKnownAt: new Date(Date.now() - 60_000),
    });
    await expect(create({ ownIdea: "x", quoteConfigVersion: 1 })).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(db.transaction((tx) => caps.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 1, quoteConfigVersion: 1 }, tx))).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(db.transaction((tx) => caps.cancelCreativePiece({ pieceId: piece.id, expectedVersion: 1 }, tx))).rejects.toBeInstanceOf(WorkspacePausedError);
  });

  it("SOURCE IMMUTABILITY (generation-schema.ts's claim): the piece's UPDATE writers are a LIST, none sets a source column, and running each leaves the source as inserted", async () => {
    // THE POPULATION, BY LIST (non-negotiable 7): every UPDATE of the table in
    // a production root. A fourth writer is a red test until it is listed.
    const sites = sourceFilesUnder(PRODUCTION_ROOTS)
      .filter((f) => !f.file.includes("/tests/"))
      .flatMap((f) => pieceUpdateSites(f.text).map((set) => ({ file: f.file, set })));
    expect(sites.map((s) => s.file)).toEqual([
      "packages/db/src/creative-work-ops.ts", // renewCreativePieceOperationInScope
      "packages/db/src/creative-work-ops.ts", // cancelCreativePieceInScope
      // Launch L4 (R-153): "use this version" — sets the selection and the
      // version only; its run is in the L4 describe below.
      "packages/db/src/creative-work-ops.ts", // selectCreativePieceVersionInScope
      "packages/db/src/creative-work-ops.ts", // linkCreativePieceScriptInScope
    ]);
    for (const s of sites) expect(s.set).not.toMatch(SOURCE_COLUMNS);
    // THE SCANNER CATCHES WHAT IT CLAIMS TO (CLAUDE.md 2026-08-26): a planted
    // writer of each shape is found, and its source column is seen.
    const planted = pieceUpdateSites(
      "await tx.update(creativePieces).set({ sourceIdeaIndex: 1 }).where(x);\nawait tx.execute(sql`UPDATE creative_pieces SET own_idea = 'x' WHERE id = 1`);"
    );
    expect(planted).toHaveLength(2);
    for (const set of planted) expect(set).toMatch(SOURCE_COLUMNS);

    // AND THE BEHAVIOUR: each writer, run, leaves the source columns as inserted.
    const piece = await create({ source: { generationId: sourceId, ideaIndex: 1 }, quoteConfigVersion: 1 });
    const source = async () => {
      const [row] = await db.select().from(creativePieces).where(eq(creativePieces.id, piece.id));
      return [row.sourceGenerationId, row.sourceIdeaIndex, row.ownIdea];
    };
    const inserted = [sourceId, 1, null];
    expect(await source()).toEqual(inserted);
    await db.transaction((tx) => caps.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 1, quoteConfigVersion: 1 }, tx));
    expect(await source()).toEqual(inserted);
    await db.transaction((tx) => caps.cancelCreativePiece({ pieceId: piece.id, expectedVersion: 2 }, tx));
    expect(await source()).toEqual(inserted);
    const scope = await ProfileScope.mint(db, ws, profileId);
    await db.transaction((tx) => linkCreativePieceScriptInScope(scope, { pieceId: piece.id, generationId: sourceId }, tx));
    expect(await source()).toEqual(inserted);
  });

  it("linkCreativePieceScriptInScope with a FOREIGN pieceId changes nothing", async () => {
    const piece = await create({ source: { generationId: sourceId, ideaIndex: 0 }, quoteConfigVersion: 1 });
    const [before] = await db.select().from(creativePieces).where(eq(creativePieces.id, piece.id));
    const [other] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "Bo" }).returning();
    const otherScope = await ProfileScope.mint(db, ws, other.id);
    const linked = await db.transaction((tx) =>
      linkCreativePieceScriptInScope(otherScope, { pieceId: piece.id, generationId: sourceId }, tx)
    );
    expect(linked).toBeUndefined();
    const [after] = await db.select().from(creativePieces).where(eq(creativePieces.id, piece.id));
    expect(after).toEqual(before);
    // NON-VACUITY: the owner's own link lands.
    const scope = await ProfileScope.mint(db, ws, profileId);
    const own = await db.transaction((tx) =>
      linkCreativePieceScriptInScope(scope, { pieceId: piece.id, generationId: sourceId }, tx)
    );
    expect(own?.state).toBe("scripted");
  });

  it("a DELETED source takes its piece with it (FK cascade), so no read finds it", async () => {
    const piece = await create({ source: { generationId: sourceId, ideaIndex: 0 }, quoteConfigVersion: 1 });
    await db.delete(generations).where(eq(generations.id, sourceId));
    expect(await db.transaction((tx) => caps.readCreativePiece(piece.id, tx))).toBeUndefined();
  });

  it("settleGeneration links the piece and flips ONLY its own generation rows to consumed, in one transaction", async () => {
    const piece = await create({ ownIdea: "my idea", quoteConfigVersion: 1 });
    const attemptId = piece.operationAttemptId;
    await db.transaction((tx) =>
      caps.claimGenerationAttempt(
        { attemptId, purpose: "generation", mode: "ideaToScript", payloadSha256: sha("p"), intentSha256: sha("i"), requestSnapshot: { v: 1 } },
        tx
      )
    );
    await db.transaction((tx) => caps.advanceGenerationAttempt({ attemptId, to: "vendor_started" }, tx));
    const usage = (purpose: string, id: string) => ({
      profileId, workspaceId, attemptId: id, purpose, model: "m", tokensIn: 1, tokensOut: 1, usageRaw: {},
      costMicroUsd: 1n, costState: "estimated" as const, resolvedTier: "free" as const, promptBundleVersion: "b",
      configVersion: 1, outcome: "succeeded" as const, consumedIncludedBuild: false,
    });
    await db.insert(modelUsage).values([usage("generation", attemptId), usage("onboarding_brain", attemptId), usage("generation", "someone-else")]);
    await db.transaction((tx) => caps.advanceGenerationAttempt({ attemptId, to: "vendor_complete", candidate: { v: 6 } }, tx));
    const [snap] = await db.insert(brainActivationSnapshots).values({ profileId, workspaceId }).returning();
    const { generation } = await db.transaction((tx) =>
      caps.settleGeneration(
        {
          attemptId, mode: "ideaToScript", brainActivationId: snap.id, frameworkVersions: [], contextInputIds: [],
          request: {}, model: "m", promptBundleVersion: "b", configVersion: 1, outcome: "usable",
          output: { x: 1 }, weakestPoint: "w", refusalReason: null, killTest: {}, rewriteCount: 0,
          debitLedgerId: null, usageIsSystemSpend: false, pieceId: piece.id,
        },
        tx
      )
    );
    const [row] = await db.select().from(creativePieces).where(eq(creativePieces.id, piece.id));
    expect(row.state).toBe("scripted");
    expect(row.selectedGenerationId).toBe(generation.id);
    const rows = await db.select().from(modelUsage);
    const flag = (purpose: string, id: string) => rows.find((u) => u.purpose === purpose && u.attemptId === id)!.consumedIncludedBuild;
    expect(flag("generation", attemptId)).toBe(true);
    expect(flag("onboarding_brain", attemptId)).toBe(false);
    expect(flag("generation", "someone-else")).toBe(false);
  });
});

// ------------------------------------------------------------------------
// LAUNCH L4 (R-153): THE SAVED RECORDING PACK'S DB HALF — which versions a
// piece has, which one is selected, and the zero-cost "use this version".

/** A stored, settled script for `profileId` — written raw, with its lineage. */
async function storeScript(
  db: TestDb,
  p: {
    profileId: string;
    workspaceId: string;
    attemptId: string;
    pieceId?: string;
    parentId?: string;
    outcome?: "usable" | "honest_refusal";
    mode?: string;
  }
): Promise<string> {
  const mode = p.mode ?? "ideaToScript";
  const [snap] = await db.insert(brainActivationSnapshots).values({ profileId: p.profileId, workspaceId: p.workspaceId }).returning();
  await db.insert(generationAttempts).values({
    profileId: p.profileId, workspaceId: p.workspaceId, attemptId: p.attemptId, purpose: "generation", mode, payloadSha256: sha(p.attemptId),
  });
  const outcome = p.outcome ?? "usable";
  const [g] = await db
    .insert(generations)
    .values({
      profileId: p.profileId, workspaceId: p.workspaceId, attemptId: p.attemptId, mode, brainActivationId: snap.id,
      request: {
        input: "x",
        origin: p.pieceId === undefined ? null : { kind: "piece", pieceId: p.pieceId, sourceGenerationId: null, sourceIdeaIndex: null },
      },
      model: "m", promptBundleVersion: "b", configVersion: 1, outcome,
      output: outcome === "usable" ? { beats: [] } : null,
      weakestPoint: outcome === "usable" ? "w" : null,
      refusalReason: outcome === "usable" ? null : "refused",
      killTest: {},
      parentId: p.parentId ?? null,
    })
    .returning();
  return g.id;
}

describe("launch L4 (R-153): a piece's versions and 'use this version'", () => {
  let db: TestDb;
  let ws: WorkspaceScope;
  let caps: ProfileWriteCapabilities;
  let profileId: string;
  let workspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" });
    ws = await withWorkspace(db, { authUserId: "user_a" });
    workspaceId = ws.workspaceId;
    const [p] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "Anna" }).returning();
    profileId = p.id;
    caps = writeCapabilities(await ProfileScope.mint(db, ws, profileId));
  });

  /** An own-idea piece, its commissioned script linked, and revisions down the chain. */
  async function scriptedPiece() {
    const piece = await db.transaction((tx) => caps.createCreativePiece({ ownIdea: "my idea", quoteConfigVersion: 1 }, tx));
    const v1 = await storeScript(db, { profileId, workspaceId, attemptId: "v1", pieceId: piece.id });
    const scope = await ProfileScope.mint(db, ws, profileId);
    await db.transaction((tx) => linkCreativePieceScriptInScope(scope, { pieceId: piece.id, generationId: v1 }, tx));
    const v2 = await storeScript(db, { profileId, workspaceId, attemptId: "v2", parentId: v1 });
    const v3 = await storeScript(db, { profileId, workspaceId, attemptId: "v3", parentId: v2 });
    const refused = await storeScript(db, { profileId, workspaceId, attemptId: "v4", parentId: v2, outcome: "honest_refusal" });
    const [row] = await db.select().from(creativePieces).where(eq(creativePieces.id, piece.id));
    return { pieceId: piece.id, version: row.version, v1, v2, v3, refused };
  }

  const reason = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return "accepted";
    } catch (e) {
      return e instanceof CreativePieceError ? e.reason : (e as Error).name;
    }
  };

  it("the context of a REVISION finds its piece up the parent chain, its parent, and every version of the piece", async () => {
    const p = await scriptedPiece();
    const ctx = await db.transaction((tx) => caps.readSavedGenerationContext(p.v3, tx));
    expect(ctx?.piece?.id).toBe(p.pieceId);
    expect(ctx?.parent).toEqual({ attemptId: "v2", mode: "ideaToScript" });
    expect(ctx?.source).toBeNull();
    expect(ctx?.versions.map((v) => v.attemptId).sort()).toEqual(["v1", "v2", "v3", "v4"]);
    expect(ctx?.versionsTruncated).toBe(false);
    // An original names no parent; a generation of no piece has no versions.
    const root = await db.transaction((tx) => caps.readSavedGenerationContext(p.v1, tx));
    expect(root?.parent).toBeNull();
    expect(root?.piece?.id).toBe(p.pieceId);
    const loose = await storeScript(db, { profileId, workspaceId, attemptId: "loose" });
    const looseCtx = await db.transaction((tx) => caps.readSavedGenerationContext(loose, tx));
    expect(looseCtx).toEqual({
      parent: null,
      revisions: [],
      revisionsTruncated: false,
      // The snapshot names no kill-test document: no rules to read.
      killtestContent: null,
      root: { attemptId: "loose", mode: "ideaToScript", input: "x", inputTruncated: false, spinAutopsyId: null },
      piece: null,
      source: null,
      versions: [],
      versionsTruncated: false,
    });
  });

  it("R-153 amendment: a generation's OWN revisions (newest first, same mode), its chain's ROOT, and a piece's versions held to the script mode", async () => {
    const p = await scriptedPiece();
    // A raw-inserted child of ANOTHER mode under v1 (only a hand-made row can
    // do this; `generate` keeps a revision in its parent's mode).
    await storeScript(db, { profileId, workspaceId, attemptId: "odd", parentId: p.v1, mode: "hooks" });
    const v2 = await db.transaction((tx) => caps.readSavedGenerationContext(p.v2, tx));
    expect(v2?.revisions.map((r) => r.attemptId).sort()).toEqual(["v3", "v4"]);
    const v1 = await db.transaction((tx) => caps.readSavedGenerationContext(p.v1, tx));
    // v1's own revisions: v2 only — never the other-mode child, never a grandchild.
    expect(v1?.revisions.map((r) => r.attemptId)).toEqual(["v2"]);
    // The piece's versions: the other-mode child is not one of them.
    expect(v1?.versions.map((v) => v.attemptId).sort()).toEqual(["v1", "v2", "v3", "v4"]);
    // The root of v3's chain is v1, with v1's stored input.
    const v3 = await db.transaction((tx) => caps.readSavedGenerationContext(p.v3, tx));
    expect(v3?.root).toEqual({ attemptId: "v1", mode: "ideaToScript", input: "x", inputTruncated: false, spinAutopsyId: null });
  });

  it("'use this version' moves the selection to a revision at ZERO cost, under the version token, and leaves the source as inserted", async () => {
    const p = await scriptedPiece();
    const before = await db.select().from(creditLedger);
    const moved = await db.transaction((tx) =>
      caps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId: p.v3 }, tx)
    );
    expect(moved.selectedGenerationId).toBe(p.v3);
    expect(moved.version).toBe(p.version + 1);
    expect(moved.state).toBe("scripted");
    expect(moved.ownIdea).toBe("my idea");
    expect(moved.sourceGenerationId).toBeNull();
    expect(await db.select().from(creditLedger)).toEqual(before);
    // STALE: the token the page showed before the move.
    expect(await reason(() => db.transaction((tx) =>
      caps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId: p.v2 }, tx)
    ))).toBe("stale");
    // ...but re-choosing the version that is ALREADY selected answers with the piece unchanged.
    const again = await db.transaction((tx) =>
      caps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId: p.v3 }, tx)
    );
    expect(again.version).toBe(p.version + 1);
    expect(again.selectedGenerationId).toBe(p.v3);
  });

  it("only a USABLE SCRIPT VERSION OF THIS PIECE may be selected: a refusal, another piece's script, a loose script and another mode are all not_found", async () => {
    const p = await scriptedPiece();
    const select = (generationId: string) =>
      reason(() => db.transaction((tx) =>
        caps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId }, tx)
      ));
    expect(await select(p.refused)).toBe("not_found");
    const other = await db.transaction((tx) => caps.createCreativePiece({ ownIdea: "other", quoteConfigVersion: 1 }, tx));
    const otherScript = await storeScript(db, { profileId, workspaceId, attemptId: "o1", pieceId: other.id });
    expect(await select(otherScript)).toBe("not_found");
    expect(await select(await storeScript(db, { profileId, workspaceId, attemptId: "loose" }))).toBe("not_found");
    const caption = await storeScript(db, { profileId, workspaceId, attemptId: "cap", parentId: p.v2, mode: "caption" });
    expect(await select(caption)).toBe("not_found");
    expect(await select("not-a-uuid")).toBe("not_found");
    // NON-VACUITY: the same call with a real version lands.
    expect(await select(p.v2)).toBe("accepted");
  });

  it("CROSS-PROFILE: another profile can neither read the context nor move the selection, and its own script cannot be selected into this piece", async () => {
    const p = await scriptedPiece();
    const [other] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "Bo" }).returning();
    const otherCaps = writeCapabilities(await ProfileScope.mint(db, ws, other.id));
    expect(await db.transaction((tx) => otherCaps.readSavedGenerationContext(p.v3, tx))).toBeUndefined();
    expect(await reason(() => db.transaction((tx) =>
      otherCaps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId: p.v3 }, tx)
    ))).toBe("not_found");
    const foreign = await storeScript(db, { profileId: other.id, workspaceId, attemptId: "foreign", pieceId: p.pieceId });
    expect(await reason(() => db.transaction((tx) =>
      caps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId: foreign }, tx)
    ))).toBe("not_found");
    const [row] = await db.select().from(creativePieces).where(eq(creativePieces.id, p.pieceId));
    expect(row.selectedGenerationId).toBe(p.v1);
    expect(row.version).toBe(p.version);
  });

  it("SERVER-DERIVED: a selection, version or state smuggled in through a CAST never lands — the row's own id is written", async () => {
    const p = await scriptedPiece();
    const forged = {
      pieceId: p.pieceId,
      expectedVersion: p.version,
      generationId: p.v2,
      selectedGenerationId: p.v3,
      version: 99,
      state: "cancelled",
    } as unknown as Parameters<ProfileWriteCapabilities["selectCreativePieceVersion"]>[0];
    const moved = await db.transaction((tx) => caps.selectCreativePieceVersion(forged, tx));
    expect(moved.selectedGenerationId).toBe(p.v2);
    expect(moved.version).toBe(p.version + 1);
    expect(moved.state).toBe("scripted");
  });

  it("a VIEWER may read the context but not select; a PAUSED workspace refuses the selection, never the read", async () => {
    const p = await scriptedPiece();
    await db.update(memberships).set({ role: "viewer" }).where(eq(memberships.workspaceId, workspaceId));
    const viewerCaps = writeCapabilities(await ProfileScope.mint(db, await withWorkspace(db, { authUserId: "user_a" }), profileId));
    expect((await db.transaction((tx) => viewerCaps.readSavedGenerationContext(p.v3, tx)))?.piece?.id).toBe(p.pieceId);
    await expect(db.transaction((tx) =>
      viewerCaps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId: p.v3 }, tx)
    )).rejects.toBeInstanceOf(ProfileRoleError);
    await db.update(memberships).set({ role: "owner" }).where(eq(memberships.workspaceId, workspaceId));
    const ownerCaps = writeCapabilities(await ProfileScope.mint(db, await withWorkspace(db, { authUserId: "user_a" }), profileId));
    await db.insert(pausePeriods).values({ workspaceId, startedAt: new Date(Date.now() - 60_000), startedKnownAt: new Date(Date.now() - 60_000) });
    expect((await db.transaction((tx) => ownerCaps.readSavedGenerationContext(p.v3, tx)))?.piece?.id).toBe(p.pieceId);
    await expect(db.transaction((tx) =>
      ownerCaps.selectCreativePieceVersion({ pieceId: p.pieceId, expectedVersion: p.version, generationId: p.v3 }, tx)
    )).rejects.toBeInstanceOf(WorkspacePausedError);
  });
});

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
if (!MAINTENANCE_URL) {
  console.warn(
    "[db creative-work.test] the real-Postgres half SKIPPED - TEST_DATABASE_URL is not set. NOT PROVEN in this run: that the creative piece's same-tenant composite FKs refuse a cross-workspace source on a real server, and that two connections renewing one piece on one version produce exactly one winner. Set TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

describe.skipIf(!MAINTENANCE_URL)("the creative piece on REAL Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_creativework");
    await seedDb(harness.db);
  }, 60_000);
  afterAll(async () => {
    await harness?.pool.end();
  });

  it("a cross-WORKSPACE source is unrepresentable, and two connections renewing one version produce exactly one winner", async () => {
    const db = harness.db as unknown as TestDb;
    const setup = async (user: string) => {
      await seedAuthUser(db, user);
      await ensureUserWorkspace(db, { authUserId: user, name: user });
      const scope = await withWorkspace(db, { authUserId: user });
      const [p] = await db.insert(creatorProfiles).values({ workspaceId: scope.workspaceId, displayName: user }).returning();
      return { scope, profileId: p.id, workspaceId: scope.workspaceId as string };
    };
    const a = await setup(`cw_a_${Date.now()}`);
    const b = await setup(`cw_b_${Date.now()}`);
    const sourceA = await storeConcepts(db, a.profileId, a.workspaceId, `ideas-${Date.now()}`);
    await expect(
      db.insert(creativePieces).values({
        profileId: b.profileId, workspaceId: b.workspaceId, sourceGenerationId: sourceA, sourceIdeaIndex: 0, quoteConfigVersion: 1,
      })
    ).rejects.toThrow();
    const capsA = writeCapabilities(await ProfileScope.mint(db, a.scope, a.profileId));
    const piece = await db.transaction((tx) => capsA.createCreativePiece({ source: { generationId: sourceA, ideaIndex: 0 }, quoteConfigVersion: 1 }, tx));
    const results = await Promise.allSettled([1, 2].map(() =>
      db.transaction((tx) => capsA.renewCreativePieceOperation({ pieceId: piece.id, expectedVersion: 1, quoteConfigVersion: 1 }, tx))
    ));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as CreativePieceError).reason).toBe("stale");
  });
});

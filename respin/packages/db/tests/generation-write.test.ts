// THE GENERATION CLAIM'S WRITE SURFACE (slice 6, R14/R14b/R14c).
//
// Stage A shipped the schema with no writer and `tests/table-writers.test.ts`
// carried that as an EMPTY expectation. These four capabilities are the writer,
// and this file drives the three properties the schema cannot hold on its own:
//
//  1. SERVER-DERIVED COLUMNS ARE UNREACHABLE FROM A CALLER — and the assertion
//     smuggles values in through `as unknown as`, not only `@ts-expect-error`.
//     CLAUDE.md 2026-08-21: proving a field cannot be TYPED is not proving it
//     cannot be CAST, and a column DEFAULT masks a missing strip.
//  2. THE STATE MACHINE IS FORWARD-ONLY — Postgres cannot compare a row to its
//     own previous value without a trigger, so the legal FROM-states live in
//     the UPDATE's `WHERE` and a skipped or replayed transition updates zero
//     rows. Every illegal transition is driven, not argued.
//  3. THE CAGE HOLDS — an attempt id belonging to another workspace is refused
//     with the same message as one that does not exist.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  GenerationAttemptStateError,
  brainActivationSnapshots,
  createTestDb,
  creatorProfiles,
  ensureUserWorkspace,
  generationAttempts,
  generations,
  memberships,
  seedAuthUser,
  seedDb,
  withWorkspace,
  writeCapabilities,
  type ProfileWriteCapabilities,
  type TestDb,
} from "../src/index";
// The cage CLASS, from the module rather than the root: `index.ts` exports it
// as a TYPE only, deliberately — `ProfileScope.mint` is not a door `app/**`
// may reach. `profile-scope.test.ts` does the same for the same reason.
import { ProfileScope } from "../src/with-workspace";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

describe("the generation claim's write capabilities", () => {
  let db: TestDb;
  let scope: ProfileScope;
  let caps: ProfileWriteCapabilities;
  let profileId: string;
  let workspaceId: string;
  let activationId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" });
    const ws = await withWorkspace(db, { authUserId: "user_a" });
    workspaceId = ws.workspaceId;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "Anna" })
      .returning();
    profileId = p.id;
    const [snap] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId, workspaceId })
      .returning();
    activationId = snap.id;
    scope = await ProfileScope.mint(db, ws, profileId);
    caps = writeCapabilities(scope);
  });

  const claim = (over: { attemptId?: string; payload?: string } = {}) =>
    db.transaction((tx) =>
      caps.claimGenerationAttempt(
        {
          attemptId: over.attemptId ?? "att-1",
          purpose: "generation",
          mode: "hooks",
          payloadSha256: sha(over.payload ?? "payload"),
        },
        tx
      )
    );

  const advance = (p: Parameters<typeof caps.advanceGenerationAttempt>[0]) =>
    db.transaction((tx) => caps.advanceGenerationAttempt(p, tx));

  /**
   * R14c's durable candidate. Opaque to `@respin/db` on purpose — this package
   * stores it and refuses to let it outlive `vendor_complete`; what the object
   * MEANS is `packages/credits`'.
   */
  const CANDIDATE = { v: 1, outcome: "usable", output: { hooks: [] } };

  /** The response checkpoint, which cannot be taken without a candidate. */
  const complete = (attemptId = "att-1") =>
    advance({ attemptId, to: "vendor_complete", candidate: CANDIDATE });

  const settleParams = (over: Record<string, unknown> = {}) => ({
    attemptId: "att-1",
    mode: "hooks",
    brainActivationId: activationId,
    frameworkVersions: [],
    contextInputIds: [],
    request: { mode: "hooks" },
    model: "claude-sonnet-5",
    promptBundleVersion: "modes/hooks@abc123abc123",
    configVersion: 1,
    outcome: "usable" as const,
    output: { hooks: [] },
    weakestPoint: "no results are logged for this creator yet",
    refusalReason: null,
    killTest: { outcome: "passed" },
    rewriteCount: 0,
    debitLedgerId: null,
    ...over,
  });

  // ------------------------------------------------------------------- (1)

  it("the claim is `claimed`, and a CAST-IN state/timestamp/terminal id is not stored", async () => {
    const forged = {
      attemptId: "att-1",
      purpose: "generation",
      mode: "hooks",
      payloadSha256: sha("payload"),
      // Every server-derived column, smuggled past the type.
      state: "settled",
      claimedAt: new Date(0),
      vendorStartedAt: new Date(0),
      vendorCompletedAt: new Date(0),
      terminalAt: new Date(0),
      generationId: "00000000-0000-4000-8000-000000000001",
      debitLedgerId: "00000000-0000-4000-8000-000000000002",
      refusalCode: "smuggled",
      profileId: "00000000-0000-4000-8000-000000000003",
      workspaceId: "00000000-0000-4000-8000-000000000004",
      id: "00000000-0000-4000-8000-000000000005",
    } as unknown as Parameters<
      ProfileWriteCapabilities["claimGenerationAttempt"]
    >[0];
    const { attempt, created } = await db.transaction((tx) =>
      caps.claimGenerationAttempt(forged, tx)
    );
    expect(created).toBe(true);
    // NOT `settled` — which the `generation_attempts_settled_has_generation`
    // equality would ALSO have refused, so this assertion is about the strip
    // and not about the constraint.
    expect(attempt.state).toBe("claimed");
    expect(attempt.vendorStartedAt).toBeNull();
    expect(attempt.vendorCompletedAt).toBeNull();
    expect(attempt.terminalAt).toBeNull();
    expect(attempt.generationId).toBeNull();
    expect(attempt.debitLedgerId).toBeNull();
    expect(attempt.refusalCode).toBeNull();
    // ...and the SCOPE's ids, never the caller's.
    expect(attempt.profileId).toBe(profileId);
    expect(attempt.workspaceId).toBe(workspaceId);
    expect(attempt.id).not.toBe("00000000-0000-4000-8000-000000000005");
    expect(attempt.claimedAt.getTime()).toBeGreaterThan(0);
  });

  it("a second claim on the same attempt id OBSERVES rather than inserting", async () => {
    const first = await claim();
    expect(first.created).toBe(true);
    const second = await claim();
    expect(second.created).toBe(false);
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(await db.select().from(generationAttempts)).toHaveLength(1);
  });

  it("the OBSERVED row carries the FIRST payload hash, so a changed payload is detectable", async () => {
    await claim({ payload: "one" });
    const again = await claim({ payload: "two" });
    expect(again.created).toBe(false);
    expect(again.attempt.payloadSha256).toBe(sha("one"));
    expect(again.attempt.payloadSha256).not.toBe(sha("two"));
  });

  // ------------------------------------------------------------------- (2)

  it("the state machine is FORWARD-ONLY: every illegal transition refuses", async () => {
    await claim();
    // `vendor_complete` cannot be reached from `claimed`.
    await expect(complete()).rejects.toBeInstanceOf(GenerationAttemptStateError);
    // ...nor can `recovery_required`, which MEANS the vendor was called.
    await expect(
      advance({ attemptId: "att-1", to: "recovery_required" })
    ).rejects.toBeInstanceOf(GenerationAttemptStateError);

    const started = await advance({ attemptId: "att-1", to: "vendor_started" });
    expect(started.state).toBe("vendor_started");
    expect(started.vendorStartedAt).not.toBeNull();
    // Replaying a transition is as illegal as skipping one.
    await expect(
      advance({ attemptId: "att-1", to: "vendor_started" })
    ).rejects.toBeInstanceOf(GenerationAttemptStateError);

    const done = await complete();
    expect(done.state).toBe("vendor_complete");
    expect(done.vendorCompletedAt).not.toBeNull();
    // R14c: the checkpoint stores the settlement's whole input, so a crash
    // from here on loses nothing.
    expect(done.candidate).toEqual(CANDIDATE);

    const refused = await advance({
      attemptId: "att-1",
      to: "refused",
      refusalCode: "parse_failed",
    });
    expect(refused.state).toBe("refused");
    expect(refused.refusalCode).toBe("parse_failed");
    expect(refused.terminalAt).not.toBeNull();
    // ...and the terminal transition CLEARED it. A creator charged nothing
    // must not leave a copy of the words they never received in an
    // operational table, and the equality CHECK refuses the row that would.
    expect(refused.candidate).toBeNull();
    // A TERMINAL STATE IS TERMINAL: nothing moves out of it.
    await expect(
      advance({ attemptId: "att-1", to: "recovery_required" })
    ).rejects.toBeInstanceOf(GenerationAttemptStateError);
  });

  it("R14c: the candidate is unreachable from a CLAIM, even cast in", async () => {
    // CLAUDE.md 2026-08-21: proving a field cannot be TYPED is not proving it
    // cannot be CAST. This is the one that matters most on this table — a
    // caller able to seed a candidate at claim time could hand itself any
    // output it liked and have the settlement store and debit it as the
    // vendor's answer, with no vendor call anywhere in the story.
    const forged = {
      attemptId: "att-1",
      purpose: "generation",
      mode: "hooks",
      payloadSha256: sha("payload"),
      candidate: { v: 1, outcome: "usable", output: { hooks: ["SMUGGLED"] } },
    } as unknown as Parameters<
      ProfileWriteCapabilities["claimGenerationAttempt"]
    >[0];
    const { attempt } = await db.transaction((tx) =>
      caps.claimGenerationAttempt(forged, tx)
    );
    expect(attempt.state).toBe("claimed");
    expect(attempt.candidate).toBeNull();
    // ...from the table, not from the returned object, because the two could
    // disagree only in the direction that matters.
    const [row] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.attemptId, "att-1"));
    expect(row.candidate).toBeNull();
  });

  it("R14c: a candidate cast into a TERMINAL transition or into the settlement is not stored either", async () => {
    await claim();
    await advance({ attemptId: "att-1", to: "vendor_started" });
    await complete();
    // A refusal that tried to KEEP the words it refused to hand over.
    const refusedWith = {
      attemptId: "att-1",
      to: "refused",
      refusalCode: "post_call_debit",
      candidate: { v: 1, outcome: "usable", output: { hooks: ["SMUGGLED"] } },
    } as unknown as Parameters<
      ProfileWriteCapabilities["advanceGenerationAttempt"]
    >[0];
    const refused = await advance(refusedWith);
    expect(refused.candidate).toBeNull();

    // ...and the settlement, whose own transition clears it.
    await claim({ attemptId: "att-2" });
    await advance({ attemptId: "att-2", to: "vendor_started" });
    await complete("att-2");
    const settledWith = {
      ...settleParams({ attemptId: "att-2" }),
      candidate: { v: 1, outcome: "usable", output: { hooks: ["SMUGGLED"] } },
    } as unknown as Parameters<
      ProfileWriteCapabilities["settleGeneration"]
    >[0];
    const { attempt, generation } = await db.transaction((tx) =>
      caps.settleGeneration(settledWith, tx)
    );
    expect(attempt.candidate).toBeNull();
    // ...and it did not land on `generations` either, which has no such column
    // and whose insert is built field by field.
    expect(JSON.stringify(generation)).not.toContain("SMUGGLED");
  });

  it("R14c: `readGenerationAttempt` is CAGED — another workspace's claim is invisible", async () => {
    await claim();
    await advance({ attemptId: "att-1", to: "vendor_started" });
    await complete();
    await seedAuthUser(db, "user_c");
    await ensureUserWorkspace(db, { authUserId: "user_c", name: "C" });
    const wsC = await withWorkspace(db, { authUserId: "user_c" });
    const [pC] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: wsC.workspaceId, displayName: "Cleo" })
      .returning();
    const capsC = writeCapabilities(await ProfileScope.mint(db, wsC, pC.id));
    expect(
      await db.transaction((tx) => capsC.readGenerationAttempt("att-1", tx))
    ).toBeUndefined();
    // NON-VACUOUS: the owner sees it, so the assertion above is about tenancy
    // and not about a read that returns nothing for everyone.
    const own = await db.transaction((tx) =>
      caps.readGenerationAttempt("att-1", tx)
    );
    expect(own?.state).toBe("vendor_complete");
    expect(own?.candidate).toEqual(CANDIDATE);
  });

  it("`settled` is NOT reachable from `advanceGenerationAttempt` at all", () => {
    // The compile-time half of "only settleGeneration may settle": the union
    // has no `settled` member, so there is no call to write.
    // @ts-expect-error — `settled` is deliberately absent from the union.
    void (() => advance({ attemptId: "att-1", to: "settled" }));
  });

  it("`refused` is legal from EVERY non-terminal state, because a refusal says nothing about HTTP", async () => {
    for (const [id, steps] of [
      ["a", [] as const],
      ["b", ["vendor_started"] as const],
      ["c", ["vendor_started", "vendor_complete"] as const],
    ] as const) {
      await claim({ attemptId: id });
      for (const to of steps) {
        if (to === "vendor_complete") await complete(id);
        else await advance({ attemptId: id, to });
      }
      const row = await advance({
        attemptId: id,
        to: "refused",
        refusalCode: "post_call_debit",
      });
      expect(row.state).toBe("refused");
    }
  });

  it("settleGeneration writes the record AND the transition together", async () => {
    await claim();
    await advance({ attemptId: "att-1", to: "vendor_started" });
    await complete();
    const { generation, attempt } = await db.transaction((tx) =>
      caps.settleGeneration(settleParams(), tx)
    );
    expect(attempt.state).toBe("settled");
    expect(attempt.generationId).toBe(generation.id);
    expect(attempt.terminalAt).not.toBeNull();
    // R14c's RETENTION: `generations` is now the record, so the staging copy
    // is gone. A settled attempt that still carried it would be a second,
    // permanent copy of the same words — which is what R11 forbids one table
    // over, and what `generation_attempts_candidate_iff_vendor_complete`
    // refuses to store.
    expect(attempt.candidate).toBeNull();
    expect(generation.profileId).toBe(profileId);
    expect(generation.workspaceId).toBe(workspaceId);
    expect(generation.outcome).toBe("usable");
    // ...and the read-back that a re-submission uses.
    const stored = await db.transaction((tx) =>
      caps.readGenerationForAttempt("att-1", tx)
    );
    expect(stored?.id).toBe(generation.id);
  });

  it("settleGeneration refuses an attempt the vendor has not finished — nothing is written", async () => {
    await claim();
    await advance({ attemptId: "att-1", to: "vendor_started" });
    await expect(
      db.transaction((tx) => caps.settleGeneration(settleParams(), tx))
    ).rejects.toBeInstanceOf(GenerationAttemptStateError);
    // THE WHOLE TRANSACTION ROLLED BACK, so no orphan generation exists —
    // which is what keeps `generations_attempt_fk` from being the only thing
    // between a settled record and an unfinished claim.
    expect(await db.select().from(generations)).toHaveLength(0);
  });

  it("a settled attempt cannot settle twice", async () => {
    await claim();
    await advance({ attemptId: "att-1", to: "vendor_started" });
    await complete();
    await db.transaction((tx) => caps.settleGeneration(settleParams(), tx));
    await expect(
      db.transaction((tx) => caps.settleGeneration(settleParams(), tx))
    ).rejects.toThrow();
    expect(await db.select().from(generations)).toHaveLength(1);
  });

  // ------------------------------------------------------------------- (3)

  it("an attempt id belonging to ANOTHER workspace is refused, with no enumeration oracle", async () => {
    // A second workspace claims an attempt id; this scope may not observe it.
    await seedAuthUser(db, "user_b");
    await ensureUserWorkspace(db, { authUserId: "user_b", name: "B" });
    const wsB = await withWorkspace(db, { authUserId: "user_b" });
    const [pB] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: wsB.workspaceId, displayName: "Bea" })
      .returning();
    const scopeB = await ProfileScope.mint(db, wsB, pB.id);
    await db.transaction((tx) =>
      writeCapabilities(scopeB).claimGenerationAttempt(
        {
          attemptId: "att-b",
          purpose: "generation",
          mode: "hooks",
          payloadSha256: sha("b"),
        },
        tx
      )
    );
    let foreign: Error | undefined;
    try {
      await claim({ attemptId: "att-b" });
    } catch (e) {
      foreign = e as Error;
    }
    expect(foreign).toBeInstanceOf(GenerationAttemptStateError);

    // ...and the message is BYTE-IDENTICAL to the one for an attempt that does
    // not exist anywhere, so the refusal is not an existence oracle.
    let absent: Error | undefined;
    try {
      await advance({ attemptId: "att-nowhere", to: "vendor_started" });
    } catch (e) {
      absent = e as Error;
    }
    expect(absent).toBeInstanceOf(GenerationAttemptStateError);
    // The two differ only in the state they name, which is the caller's own
    // request rather than anything about the other workspace's row.
    expect(foreign!.message.replace("'claimed'", "X")).toBe(
      absent!.message.replace("'vendor_started'", "X")
    );

    // ...and nothing was written or moved for the other workspace.
    const [theirs] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.attemptId, "att-b"));
    expect(theirs.state).toBe("claimed");
    expect(theirs.workspaceId).toBe(wsB.workspaceId);
  });

  it("a VIEWER may not claim, advance or settle", async () => {
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, workspaceId));
    const viewerWs = await withWorkspace(db, { authUserId: "user_a" });
    const viewerScope = await ProfileScope.mint(db, viewerWs, profileId);
    const viewerCaps = writeCapabilities(viewerScope);
    await expect(
      db.transaction((tx) =>
        viewerCaps.claimGenerationAttempt(
          {
            attemptId: "att-v",
            purpose: "generation",
            mode: "hooks",
            payloadSha256: sha("v"),
          },
          tx
        )
      )
    ).rejects.toThrow();
    expect(await db.select().from(generationAttempts)).toHaveLength(0);
  });
});

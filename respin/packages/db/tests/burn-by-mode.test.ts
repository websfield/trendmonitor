// CREDIT BURN BY MODE (slice 6, R17a) — `burnByMode` in `with-workspace.ts`.
//
// THE ONE PROPERTY THIS SUITE EXISTS FOR: the mode comes from the JOIN, never
// from `ref_type` and never from `workspace_spend_monthly`.
//
// Both things that spend credits debit with `ref_type = 'inference'` and
// `ref_id = <attempt id>` — R-63 made the generation debit reuse
// `credit_ledger_inference_debit_uq` rather than mint a sixth constraint — so
// a reader that treated every `inference` debit as a generation would file the
// onboarding voice-brain build under a mode. Every test below that matters
// therefore has BOTH kinds of `inference` debit present at once, which is the
// only fixture shape that can tell a working discriminator from a broken one.
//
// AND `workspace_spend_monthly` IS PRESENT IN THE FIXTURE, deliberately
// (mutation M13): it holds a real row, with a cost that resembles nothing in
// the expected answer and a grain — `(workspace, month, tier)` — that carries
// no mode at all. A re-derivation from it cannot produce a two-mode split, so
// planting M13 turns `two modes are split by their own settled generations`
// red rather than merely returning a different number.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { seedDb } from "../src/seed";
import { creditLedger } from "../src/billing-schema";
import { creatorProfiles } from "../src/brain-schema";
import { generations } from "../src/generation-schema";
import {
  brainActivationSnapshots,
  workspaceSpendMonthly,
} from "../src/onboarding-schema";
import {
  ProfileScope,
  ScopeForgeryError,
  burnByMode,
  monthlySpend,
  withWorkspace,
  writeCapabilities,
  type WorkspaceScope,
} from "../src/with-workspace";

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const PERIOD_START = new Date("2026-06-01T00:00:00Z");
const IN_PERIOD = new Date("2026-06-10T00:00:00Z");

describe("burnByMode (R17a): the mode comes from the join, never from ref_type", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;
  let activationId: string;
  let scope: WorkspaceScope;

  /** A second creator in the SAME workspace — the cross-profile axis. */
  let otherProfileId: string;
  let otherActivationId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedDb(db);
    await seedAuthUser(db, "burn_mode_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "burn_mode_user", name: "A" })
    ).workspace.id;
    [profileId, otherProfileId] = await Promise.all([
      newProfile("Anna"),
      newProfile("Ben"),
    ]);
    [activationId, otherActivationId] = await Promise.all([
      newActivation(profileId),
      newActivation(otherProfileId),
    ]);
    scope = await withWorkspace(db, { authUserId: "burn_mode_user" });
    // M13's fixture, present from the first line of every test: our vendor
    // cost for this workspace-month, in micro-USD, at a grain with no mode.
    await db.insert(workspaceSpendMonthly).values({
      workspaceId,
      periodMonth: "2026-06-01",
      tier: "free",
      costMicroUsd: 987_654n,
      callCount: 42,
      unknownCallCount: 0,
    });
  });

  async function newProfile(displayName: string): Promise<string> {
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName })
      .returning();
    return p.id;
  }

  async function newActivation(forProfile: string): Promise<string> {
    const [s] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId: forProfile, workspaceId })
      .returning();
    return s.id;
  }

  /**
   * A full claim → vendor_started → vendor_complete → settled generation,
   * through the SAME write capabilities the real settlement uses. Building the
   * rows by hand would let this suite assert against a shape the product
   * cannot produce.
   */
  async function settledGeneration(args: {
    attemptId: string;
    mode: string;
    profile?: string;
    activation?: string;
  }): Promise<void> {
    const prof = args.profile ?? profileId;
    const act = args.activation ?? activationId;
    const ws = await withWorkspace(db, { authUserId: "burn_mode_user" });
    const caps = writeCapabilities(await ProfileScope.mint(db, ws, prof));
    await db.transaction((tx) =>
      caps.claimGenerationAttempt(
        {
          attemptId: args.attemptId,
          purpose: "generation",
          mode: args.mode,
          payloadSha256: sha(args.attemptId),
        },
        tx
      )
    );
    await db.transaction((tx) =>
      caps.advanceGenerationAttempt(
        { attemptId: args.attemptId, to: "vendor_started" },
        tx
      )
    );
    await db.transaction((tx) =>
      caps.advanceGenerationAttempt(
        {
          attemptId: args.attemptId,
          to: "vendor_complete",
          candidate: { v: 1, outcome: "usable" },
        },
        tx
      )
    );
    await db.transaction((tx) =>
      caps.settleGeneration(
        {
          attemptId: args.attemptId,
          mode: args.mode,
          brainActivationId: act,
          frameworkVersions: [],
          contextInputIds: [],
          request: { mode: args.mode },
          model: "claude-test",
          promptBundleVersion: "modes/test@aaaaaaaaaaaa",
          configVersion: 1,
          outcome: "usable",
          output: { hooks: [] },
          weakestPoint: "no results are logged for this creator yet",
          refusalReason: null,
          killTest: { outcome: "passed" },
          rewriteCount: 0,
          debitLedgerId: null,
        },
        tx
      )
    );
  }

  /** A claim that stops at `vendor_started` — charged, never settled. */
  async function nonTerminalClaim(attemptId: string, mode: string) {
    const ws = await withWorkspace(db, { authUserId: "burn_mode_user" });
    const caps = writeCapabilities(await ProfileScope.mint(db, ws, profileId));
    await db.transaction((tx) =>
      caps.claimGenerationAttempt(
        {
          attemptId,
          purpose: "generation",
          mode,
          payloadSha256: sha(attemptId),
        },
        tx
      )
    );
    await db.transaction((tx) =>
      caps.advanceGenerationAttempt({ attemptId, to: "vendor_started" }, tx)
    );
  }

  const debit = (
    refId: string,
    credits: number,
    over: { workspaceId?: string; createdAt?: Date } = {}
  ) =>
    db.insert(creditLedger).values({
      workspaceId: over.workspaceId ?? workspaceId,
      delta: -credits,
      kind: "debit",
      // THE SAME `ref_type` BOTH PURPOSES USE (R-63). Every debit in this
      // suite is an `inference` debit; nothing here is separable by it.
      refType: "inference",
      refId,
      createdAt: over.createdAt ?? IN_PERIOD,
    });

  // -------------------------------------------------------------- the point

  it("an onboarding-inference debit and a generation debit are present at once: the generation is a mode, the onboarding one is NOT", async () => {
    await settledGeneration({ attemptId: "att_gen", mode: "hooks" });
    await debit("att_gen", 3);
    // The onboarding voice build: same ref_type, same attempt-id grain, and
    // NO row in `generation_attempts` — that absence is the discriminator.
    await debit("att_onboarding_voice", 17);

    const result = await burnByMode(db, scope, PERIOD_START);

    expect(result.byMode).toEqual([{ mode: "hooks", credits: 3, debits: 1 }]);
    // The onboarding charge never wears a mode...
    expect(result.byMode.map((r) => r.credits)).not.toContain(17);
    // ...and it is not dropped either: it is counted where it belongs.
    expect(result.notAGeneration).toEqual({ credits: 17, debits: 1 });
    expect(result.nonTerminalClaim).toEqual({ credits: 0, debits: 0 });
  });

  it("the buckets ACCOUNT FOR the whole period: byMode + notAGeneration + nonTerminalClaim equals monthlySpend's unclamped total", async () => {
    await settledGeneration({ attemptId: "att_gen", mode: "hooks" });
    await debit("att_gen", 3);
    await debit("att_onboarding_voice", 17);
    await nonTerminalClaim("att_stuck", "hooks");
    await debit("att_stuck", 5);

    const split = await burnByMode(db, scope, PERIOD_START);
    const total = await monthlySpend(db, scope, PERIOD_START);
    const summed =
      split.byMode.reduce((n, r) => n + r.credits, 0) +
      split.notAGeneration.credits +
      split.nonTerminalClaim.credits;
    expect(summed).toBe(total.totalDebit);
    expect(summed).toBe(25);
  });

  it("two modes are split by their own settled generations — a number no single-row, mode-less cost rollup can produce (mutation M13)", async () => {
    await settledGeneration({ attemptId: "att_hooks", mode: "hooks" });
    await settledGeneration({ attemptId: "att_caption", mode: "caption" });
    await debit("att_hooks", 3);
    await debit("att_caption", 11);
    await debit("att_onboarding_voice", 17);

    const result = await burnByMode(db, scope, PERIOD_START);

    // Sorted by credits DESC, so the order is a property, not an accident.
    expect(result.byMode).toEqual([
      { mode: "caption", credits: 11, debits: 1 },
      { mode: "hooks", credits: 3, debits: 1 },
    ]);
    expect(result.notAGeneration).toEqual({ credits: 17, debits: 1 });
    // The rollup row this fixture holds (987654 micro-USD over 42 calls) can
    // express none of the three numbers above, and has no column that could
    // separate `hooks` from `caption` at all.
  });

  it("two debits on the same mode add up, and their charge COUNT is reported separately from their credits", async () => {
    await settledGeneration({ attemptId: "att_1", mode: "hooks" });
    await settledGeneration({ attemptId: "att_2", mode: "hooks" });
    await debit("att_1", 3);
    await debit("att_2", 4);

    const result = await burnByMode(db, scope, PERIOD_START);
    expect(result.byMode).toEqual([{ mode: "hooks", credits: 7, debits: 2 }]);
  });

  // ------------------------------------------------- the non-terminal case

  it("a debit whose claim never settled is REPORTED, never bucketed into the mode its claim asked for", async () => {
    await nonTerminalClaim("att_stuck", "hooks");
    await debit("att_stuck", 5);

    const result = await burnByMode(db, scope, PERIOD_START);

    // `generation_attempts.mode` is 'hooks' on that row, and using it would be
    // one line. It would tell a creator they spent 5 credits on a hook set
    // they do not have.
    expect(result.byMode).toEqual([]);
    expect(result.nonTerminalClaim).toEqual({ credits: 5, debits: 1 });
    expect(result.notAGeneration).toEqual({ credits: 0, debits: 0 });
  });

  it("a settled attempt whose generation row is absent falls to nonTerminalClaim, not to a mode", async () => {
    // `generation_attempts_settled_has_generation` is an EQUALITY (R-63), so
    // this state is unrepresentable through the write capabilities — the row is
    // reached by deleting the generation, which is the closest a test can get
    // to the shape the LEFT JOIN's second half is written to survive.
    await settledGeneration({ attemptId: "att_gen", mode: "hooks" });
    await debit("att_gen", 3);
    await db.delete(generations);

    const result = await burnByMode(db, scope, PERIOD_START);
    expect(result.byMode).toEqual([]);
    expect(result.nonTerminalClaim).toEqual({ credits: 3, debits: 1 });
  });

  // ------------------------------------------------------ the period window

  it("a debit BEFORE periodStart is excluded; expiry and negative adjust rows are never burn", async () => {
    await settledGeneration({ attemptId: "att_in", mode: "hooks" });
    await settledGeneration({ attemptId: "att_before", mode: "hooks" });
    await debit("att_in", 3);
    await debit("att_before", 99, {
      createdAt: new Date("2026-05-31T23:59:59Z"),
    });
    await db.insert(creditLedger).values([
      {
        workspaceId,
        delta: -200,
        kind: "expiry",
        refType: "lot",
        refId: "lot_1",
        createdAt: IN_PERIOD,
      },
      {
        workspaceId,
        delta: -75,
        kind: "adjust",
        reasonCode: "operator_correction",
        createdAt: IN_PERIOD,
      },
    ]);

    const result = await burnByMode(db, scope, PERIOD_START);
    expect(result.byMode).toEqual([{ mode: "hooks", credits: 3, debits: 1 }]);
    expect(result.notAGeneration).toEqual({ credits: 0, debits: 0 });
    expect(result.nonTerminalClaim).toEqual({ credits: 0, debits: 0 });
  });

  it("periodStart is the CALLER's — a wider window includes what the narrow one excluded", async () => {
    await settledGeneration({ attemptId: "att_before", mode: "hooks" });
    await debit("att_before", 99, {
      createdAt: new Date("2026-05-31T23:59:59Z"),
    });
    const narrow = await burnByMode(db, scope, PERIOD_START);
    expect(narrow.byMode).toEqual([]);
    const wide = await burnByMode(db, scope, new Date("2026-05-01T00:00:00Z"));
    expect(wide.byMode).toEqual([{ mode: "hooks", credits: 99, debits: 1 }]);
  });

  // ----------------------------------------------------------- the two axes

  it("T1 (workspace axis): workspace A's split NEVER includes workspace B's modes or credits, however large", async () => {
    await seedAuthUser(db, "burn_mode_user_b");
    const workspaceIdB = (
      await ensureUserWorkspace(db, {
        authUserId: "burn_mode_user_b",
        name: "B",
      })
    ).workspace.id;
    const [pb] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: workspaceIdB, displayName: "Bea" })
      .returning();
    const [sb] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId: pb.id, workspaceId: workspaceIdB })
      .returning();
    const wsB = await withWorkspace(db, { authUserId: "burn_mode_user_b" });
    const capsB = writeCapabilities(await ProfileScope.mint(db, wsB, pb.id));
    await db.transaction((tx) =>
      capsB.claimGenerationAttempt(
        {
          attemptId: "att_b",
          purpose: "generation",
          mode: "caption",
          payloadSha256: sha("att_b"),
        },
        tx
      )
    );
    await db.transaction((tx) =>
      capsB.advanceGenerationAttempt(
        { attemptId: "att_b", to: "vendor_started" },
        tx
      )
    );
    await db.transaction((tx) =>
      capsB.advanceGenerationAttempt(
        {
          attemptId: "att_b",
          to: "vendor_complete",
          candidate: { v: 1, outcome: "usable" },
        },
        tx
      )
    );
    await db.transaction((tx) =>
      capsB.settleGeneration(
        {
          attemptId: "att_b",
          mode: "caption",
          brainActivationId: sb.id,
          frameworkVersions: [],
          contextInputIds: [],
          request: { mode: "caption" },
          model: "claude-test",
          promptBundleVersion: "modes/test@aaaaaaaaaaaa",
          configVersion: 1,
          outcome: "usable",
          output: { caption: "x" },
          weakestPoint: "nothing is logged yet",
          refusalReason: null,
          killTest: { outcome: "passed" },
          rewriteCount: 0,
          debitLedgerId: null,
        },
        tx
      )
    );
    await debit("att_b", 9_000, { workspaceId: workspaceIdB });
    await settledGeneration({ attemptId: "att_a", mode: "hooks" });
    await debit("att_a", 3);

    const a = await burnByMode(db, scope, PERIOD_START);
    const b = await burnByMode(db, wsB, PERIOD_START);

    expect(a.byMode).toEqual([{ mode: "hooks", credits: 3, debits: 1 }]);
    expect(a.notAGeneration).toEqual({ credits: 0, debits: 0 });
    expect(a.nonTerminalClaim).toEqual({ credits: 0, debits: 0 });
    expect(b.byMode).toEqual([{ mode: "caption", credits: 9_000, debits: 1 }]);
  });

  it("T1 (workspace axis, the join's OWN predicate): a debit naming ANOTHER workspace's attempt id is never labelled with that workspace's mode", async () => {
    // THIS DRIVES THE FALSE BRANCH of `eq(generationAttempts.workspaceId,
    // creditLedger.workspaceId)`, which every other test here leaves unexercised
    // — attempt ids are globally unique (`generation_attempts_attempt_uq`), so
    // in a well-formed fixture the join matches the right workspace anyway and
    // deleting the predicate stays GREEN. Measured: it did (2026-09-01), which
    // is CLAUDE.md's 2026-08-26 rule — a predicate with no witness reads like a
    // guard and is not one.
    //
    // The row below is a WRITER DEFECT, not a reachable product state (R-63:
    // "two workspaces claiming one attempt is a writer defect that must FAIL
    // CLOSED"). What must not happen is that it fails OPEN into a by-mode
    // panel: workspace A's creator seeing a mode only workspace B ever ran.
    await seedAuthUser(db, "burn_mode_leak_b");
    const workspaceIdB = (
      await ensureUserWorkspace(db, {
        authUserId: "burn_mode_leak_b",
        name: "B",
      })
    ).workspace.id;
    const [pb] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: workspaceIdB, displayName: "Bea" })
      .returning();
    const [sb] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId: pb.id, workspaceId: workspaceIdB })
      .returning();
    const wsB = await withWorkspace(db, { authUserId: "burn_mode_leak_b" });
    const capsB = writeCapabilities(await ProfileScope.mint(db, wsB, pb.id));
    await db.transaction((tx) =>
      capsB.claimGenerationAttempt(
        {
          attemptId: "att_b_only",
          purpose: "generation",
          mode: "caption",
          payloadSha256: sha("att_b_only"),
        },
        tx
      )
    );
    await db.transaction((tx) =>
      capsB.advanceGenerationAttempt(
        { attemptId: "att_b_only", to: "vendor_started" },
        tx
      )
    );
    await db.transaction((tx) =>
      capsB.advanceGenerationAttempt(
        {
          attemptId: "att_b_only",
          to: "vendor_complete",
          candidate: { v: 1, outcome: "usable" },
        },
        tx
      )
    );
    await db.transaction((tx) =>
      capsB.settleGeneration(
        {
          attemptId: "att_b_only",
          mode: "caption",
          brainActivationId: sb.id,
          frameworkVersions: [],
          contextInputIds: [],
          request: { mode: "caption" },
          model: "claude-test",
          promptBundleVersion: "modes/test@aaaaaaaaaaaa",
          configVersion: 1,
          outcome: "usable",
          output: { caption: "x" },
          weakestPoint: "nothing is logged yet",
          refusalReason: null,
          killTest: { outcome: "passed" },
          rewriteCount: 0,
          debitLedgerId: null,
        },
        tx
      )
    );
    // A's ledger, naming B's attempt id.
    await debit("att_b_only", 42);

    const a = await burnByMode(db, scope, PERIOD_START);
    expect(a.byMode).toEqual([]);
    expect(a.byMode.map((r) => r.mode)).not.toContain("caption");
    // Counted, and counted honestly: A really was charged 42 credits, and the
    // page must show them somewhere — just never under a mode B owns.
    expect(a.notAGeneration).toEqual({ credits: 42, debits: 1 });
    // NON-VACUOUS: there really IS an attributable `caption` generation on the
    // other side of that attempt id, so "no caption in A's split" is the
    // predicate refusing a reachable label rather than there being none to
    // find. (B cannot hold its own debit for it: `ref_id` is globally unique
    // under `credit_ledger_inference_debit_uq`, and A's row took it — which is
    // precisely why this fixture is a writer defect and not a product state.)
    const [bGen] = await db
      .select()
      .from(generations)
      .where(eq(generations.workspaceId, workspaceIdB));
    expect(bGen.mode).toBe("caption");
  });

  it("T2 (profile axis): two creators in ONE workspace each land in their OWN mode — the workspace's burn is the sum, never one profile's label on the other's credits", async () => {
    await settledGeneration({ attemptId: "att_anna", mode: "hooks" });
    await settledGeneration({
      attemptId: "att_ben",
      mode: "caption",
      profile: otherProfileId,
      activation: otherActivationId,
    });
    await debit("att_anna", 3);
    await debit("att_ben", 11);

    const result = await burnByMode(db, scope, PERIOD_START);
    expect(result.byMode).toEqual([
      { mode: "caption", credits: 11, debits: 1 },
      { mode: "hooks", credits: 3, debits: 1 },
    ]);
  });

  it("T2 (profile axis, structural): a generation naming ANOTHER profile's attempt is refused by the database, which is why the join carries profile_id", async () => {
    // The `profile_id` column in `burnByMode`'s second join cannot be
    // falsified by a fixture — `generations_attempt_fk` makes the disagreement
    // unrepresentable. So the property is proved where it actually lives, by
    // RUNNING it (Golden rule 1) rather than by arguing the join is safe.
    await nonTerminalClaim("att_unsettled", "hooks");
    const row = {
      workspaceId,
      attemptId: "att_unsettled",
      mode: "hooks",
      brainActivationId: activationId,
      request: {},
      model: "claude-test",
      promptBundleVersion: "modes/test@aaaaaaaaaaaa",
      configVersion: 1,
      outcome: "usable" as const,
      output: { hooks: [] },
      weakestPoint: "none logged",
      killTest: {},
    };
    await expect(
      db.insert(generations).values({ ...row, profileId: otherProfileId })
    ).rejects.toThrow();
    // NON-VACUOUS: the same insert differing ONLY in `profile_id` is accepted,
    // so the rejection above is the FK and not some other defect in the row.
    await expect(
      db.insert(generations).values({ ...row, profileId })
    ).resolves.toBeDefined();
  });

  // --------------------------------------------------------------- the cage

  it("a forged scope is refused before any query runs", async () => {
    const forged = {
      workspaceId,
      role: "owner",
      userId: "u",
      accessors: {},
    } as unknown as WorkspaceScope;
    await expect(burnByMode(db, forged, PERIOD_START)).rejects.toBeInstanceOf(
      ScopeForgeryError
    );
  });
});

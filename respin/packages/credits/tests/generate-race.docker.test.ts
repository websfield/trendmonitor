// THE GENERATION RACES PGlite CANNOT EXPRESS, on real Postgres with two
// connections (slice 6, stage C).
//
// The in-process suite proves the ORDER of the gates against a provider that
// throws if reached. What it cannot prove is what happens when two of these run
// at once, because PGlite is single-connection: its race is a sequence. Every
// property below is about money, and every one of them was a claim made by
// reading the code until this file existed.
//
//   1. DUPLICATE CLAIMS. Two submissions of one attempt id must produce ONE
//      vendor sequence, one terminal row and one debit. The winner is decided
//      by `generation_attempts_attempt_uq` — an INSERT ... ON CONFLICT DO
//      NOTHING whose `.returning()` is empty for the loser — and not by a
//      read-then-write, which two connections both answer "no" to.
//   2. THE BALANCE THAT DROPS MID-FLIGHT. The pre-call check passes, a
//      concurrent debit spends the balance, and the settlement must refuse
//      ATOMICALLY: no generation, no debit, no output — and the `model_usage`
//      rows must survive, because each was its own committed transaction.
//   3. TWO RETRIES OF ONE `vendor_complete` ATTEMPT. R14c says a retry settles
//      the stored candidate; with two of them, exactly one may take the debit
//      and the other must be handed the winner's record rather than an error.
//      The decision is made INSIDE the workspace lock, which is a thing one
//      connection cannot be wrong about — PGlite's version of this race is a
//      sequence in which the first caller has always already committed.
//   4. THE DEBIT'S UNIQUENESS IS A DATABASE CONSTRAINT, asserted BY NAME
//      (R-63): a generation debit reuses `credit_ledger_inference_debit_uq`
//      rather than minting a sixth partial unique, and a later slice moving
//      generation debits to their own `ref_type` turns THIS test red instead of
//      silently opening a double-debit window.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  brainActivationSnapshots,
  brainDocs,
  createDockerTestDb,
  creditLedger,
  ensureUserWorkspace,
  generationAttempts,
  generations,
  modelUsage,
  seedAuthUser,
  seedDb,
  withWorkspace,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import type { LlmProvider } from "@respin/llm";
import { createProfile } from "../src/profiles";
import { debitCredits } from "../src/ledger";
import { generate } from "../src/generate";
import {
  GenerationInFlightError,
  GenerationRecoveryRequiredError,
  PostCallDebitError,
} from "../src/errors";
import { anySlots } from "./support/run-slots";
import { dbThatFailsWhen } from "./support/crash-db";
import {
  PLATFORM,
  hooksOutput,
  killTestReply,
  reply,
} from "./support/generation-fixtures";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[credits generate-race.docker.test] SKIPPED - TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: that two CONCURRENT submissions of one attempt id " +
      "produce exactly one vendor sequence, one generation and one debit (the " +
      "loser observing the winner's claim rather than both inserting); that a " +
      "balance spent by another connection AFTER the vendor answered produces an " +
      "ATOMIC refusal with no generation/debit split and no output leak, while the " +
      "model_usage rows survive it; that TWO CONCURRENT retries of one vendor_complete attempt settle EXACTLY ONCE, with the loser handed the winner's record instead of an error and neither calling a vendor; and that the at-most-one-debit-per-attempt " +
      "guarantee is held by `credit_ledger_inference_debit_uq` BY NAME. PGlite " +
      "cannot express any of these - it is single-connection, so its race is a " +
      "sequence. Start the docker-compose DB and set TEST_DATABASE_URL to " +
      "postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

/** A provider that HOLDS its FIRST call until released. */
function heldProvider(): {
  provider: LlmProvider;
  inFlight: Promise<void>;
  release: () => void;
  callCount: () => number;
} {
  let signalInFlight!: () => void;
  const inFlight = new Promise<void>((r) => {
    signalInFlight = r;
  });
  let releaseFn!: () => void;
  const released = new Promise<void>((r) => {
    releaseFn = r;
  });
  const state = { calls: 0 };
  const provider: LlmProvider = {
    vendor: "held-stub",
    complete: async () => {
      state.calls += 1;
      const first = state.calls === 1;
      if (first) {
        signalInFlight();
        await released;
      }
      return {
        text: first ? reply(hooksOutput()) : killTestReply(["/rules/0"]),
        servedModel: "claude-sonnet-5",
        usage: {
          tokensIn: 10,
          tokensOut: 5,
          raw: { input_tokens: 10, output_tokens: 5 },
        },
      };
    },
  };
  return {
    provider,
    inFlight,
    release: () => releaseFn(),
    callCount: () => state.calls,
  };
}

/** The instrument: a provider whose invocation fails the test. */
const never = (): LlmProvider => ({
  vendor: "must-not-be-called",
  complete: async () => {
    throw new Error("THE VENDOR WAS CALLED a second time for one attempt.");
  },
});

describe.skipIf(!MAINTENANCE_URL)("generate under REAL concurrency", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let owner: WorkspaceScope;
  let ws: VerifiedWorkspaceId;
  let profileId: string;
  let n = 0;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_genrace"
    );
    await seedDb(harness.db);
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  beforeEach(async () => {
    // A FRESH WORKSPACE PER CASE rather than a truncate: "one attempt id, twice"
    // is the whole subject, so state left by an earlier case would silently
    // make a later one exercise a different path.
    n += 1;
    const user = `genrace_user_${n}`;
    await seedAuthUser(harness.db, user, `${user}@test.dev`);
    await ensureUserWorkspace(harness.db, { authUserId: user, name: `W${n}` });
    owner = await withWorkspace(harness.db, { authUserId: user });
    ws = owner.workspaceId;
    const profile = await createProfile(harness.db, owner, "Anna", new Date());
    profileId = profile.id;
    await activateBrain();
  }, 60_000);

  async function activateBrain(): Promise<void> {
    const evidence = [
      {
        field: "/register",
        quote: "c",
        inputId: "00000000-0000-4000-8000-000000000001",
        startUtf16: 0,
        endUtf16: 1,
      },
    ];
    const confirmed = {
      confirmedAt: new Date(),
      confirmedContentSha256: "0".repeat(64),
      activatedAt: new Date(),
    };
    const [voice] = await harness.db
      .insert(brainDocs)
      .values({
        profileId,
        workspaceId: ws,
        kind: "voice",
        version: 1,
        content: {
          register: "plain and direct",
          sentenceRhythm: "short lines",
          signatureMoves: ["opens on what went wrong"],
          avoid: ["never uses hype words"],
        },
        reason: "Version 1: you edited this document.",
        sourceEvidence: evidence,
        status: "active",
        ...confirmed,
      })
      .returning();
    const [killtest] = await harness.db
      .insert(brainDocs)
      .values({
        profileId,
        workspaceId: ws,
        kind: "killtest",
        version: 1,
        content: { rules: ["it must not sound like an advert"] },
        reason: "Version 1: you edited this document.",
        sourceEvidence: evidence,
        status: "active",
        ...confirmed,
      })
      .returning();
    // THE SNAPSHOT NAMES ITS DOCUMENTS (tenancy gate, 2026-09-01), which
    // `activateBrainDocCoherent` has always done and this fixture did not.
    // It was invisible while `generate` read "whatever is active"; it is
    // load-bearing now that `generate` assembles from the documents its
    // recorded snapshot NAMES, and a snapshot naming nothing is a brain of no
    // sentences.
    await harness.db.insert(brainActivationSnapshots).values({
      profileId,
      workspaceId: ws,
      voiceDocId: voice.id,
      killtestDocId: killtest.id,
    });
  }

  /**
   * PRE-WARM the pool, for the reason `concurrency.docker.test.ts` records at
   * length: an unwarmed racer opens a real TCP connection plus auth, which is
   * slower than a short transaction — so the racers arrive one at a time and
   * the case passes without ever having contended.
   */
  async function prewarmPool(count: number): Promise<void> {
    const clients = await Promise.all(
      Array.from({ length: count }, () => harness.pool.connect())
    );
    for (const c of clients) c.release();
  }

  const params = (attemptId: string) => ({
    mode: "hooks" as const,
    attemptId,
    input: "what my first year actually looked like",
    platform: PLATFORM,
  });

  const inferenceDebits = () =>
    harness.db
      .select()
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.workspaceId, ws),
          eq(creditLedger.kind, "debit"),
          eq(creditLedger.refType, "inference")
        )
      );

  it("two CONCURRENT submissions of one attempt id: one vendor sequence, one generation, one debit", async () => {
    await prewarmPool(4);
    const held = heldProvider();
    const winner = generate(
      harness.db,
      owner,
      profileId,
      held.provider,
      anySlots(),
      params("race-1"),
      new Date()
    );
    // The winner is inside the vendor call, holding an uncommitted... no: the
    // claim is COMMITTED before the call, which is exactly what lets the loser
    // observe it from another connection.
    await held.inFlight;
    const loser = generate(
      harness.db,
      owner,
      profileId,
      never(),
      anySlots(),
      params("race-1"),
      new Date()
    );
    await expect(loser).rejects.toBeInstanceOf(GenerationInFlightError);
    held.release();
    const result = await winner;

    expect(result.replayed).toBe(false);
    expect(held.callCount()).toBe(2); // the draft and the creator-rule scoring
    expect(
      await harness.db
        .select()
        .from(generationAttempts)
        .where(eq(generationAttempts.attemptId, "race-1"))
    ).toHaveLength(1);
    expect(
      await harness.db
        .select()
        .from(generations)
        .where(eq(generations.attemptId, "race-1"))
    ).toHaveLength(1);
    expect(await inferenceDebits()).toHaveLength(1);
  });

  it("a SEQUENTIAL retry after settlement replays the stored record, with no second vendor call and no second debit", async () => {
    const held = heldProvider();
    held.release();
    const first = await generate(
      harness.db,
      owner,
      profileId,
      held.provider,
      anySlots(),
      params("replay-1"),
      new Date()
    );
    const again = await generate(
      harness.db,
      owner,
      profileId,
      never(),
      anySlots(),
      params("replay-1"),
      new Date()
    );
    expect(again.replayed).toBe(true);
    expect(again.generation.id).toBe(first.generation.id);
    expect(again.creditsChargedNow).toBe(0);
    expect(await inferenceDebits()).toHaveLength(1);
  });

  it("a balance spent by ANOTHER CONNECTION mid-flight makes the settlement refuse ATOMICALLY", async () => {
    await prewarmPool(4);
    const held = heldProvider();
    const run = generate(
      harness.db,
      owner,
      profileId,
      held.provider,
      anySlots(),
      params("drop-1"),
      new Date()
    );
    await held.inFlight;
    // The pre-call check has already passed. Spend the whole balance from a
    // second connection while the vendor call is in flight.
    const before = await harness.db
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.workspaceId, ws));
    const minted = before
      .filter((r) => r.refType === "free_allowance")
      .reduce((sum, r) => sum + r.delta, 0);
    expect(minted, "the Free allowance was never minted").toBeGreaterThan(0);
    await harness.db.transaction((tx) =>
      debitCredits(tx, {
        workspaceId: ws,
        cost: minted,
        refType: "test_drain",
        refId: "drain-1",
        at: new Date(),
        configVersion: 1,
      })
    );
    held.release();

    await expect(run).rejects.toBeInstanceOf(PostCallDebitError);
    // NEITHER HALF COMMITTED — no usable generation exists unpaid, and no
    // debit exists without its generation.
    expect(
      await harness.db
        .select()
        .from(generations)
        .where(eq(generations.attemptId, "drop-1"))
    ).toHaveLength(0);
    expect(await inferenceDebits()).toHaveLength(0);
    // ...and THE SPEND SURVIVED, because each `model_usage` row was its own
    // committed transaction (R14a): a settlement refusal must not erase what
    // the vendor was already paid for.
    const usage = await harness.db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.attemptId, "drop-1"));
    expect(usage.length).toBeGreaterThan(0);
    // ...and the attempt records the refusal without exposing output.
    const [attempt] = await harness.db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.attemptId, "drop-1"));
    expect(attempt.state).toBe("refused");
    expect(attempt.generationId).toBeNull();
    expect(attempt.debitLedgerId).toBeNull();
  });

  it("R14c: TWO CONCURRENT retries of one `vendor_complete` attempt — one settles, the other is handed the record, and no vendor is called", async () => {
    await prewarmPool(4);
    // STRAND AN ATTEMPT AT `vendor_complete`, the way a lost process does: the
    // checkpoint commits, and then every transaction after it fails — including
    // the bookkeeping that would otherwise flag the attempt — so the row sits
    // where the last COMMITTED transaction put it, holding the candidate.
    const held = heldProvider();
    held.release();
    const crashing = dbThatFailsWhen(
      harness.db,
      async () => {
        const [a] = await harness.db
          .select()
          .from(generationAttempts)
          .where(eq(generationAttempts.attemptId, "retry-1"));
        return a?.state === "vendor_complete";
      },
      "always"
    );
    await expect(
      generate(
        crashing,
        owner,
        profileId,
        held.provider,
        anySlots(),
        params("retry-1"),
        new Date()
      )
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    const [stranded] = await harness.db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.attemptId, "retry-1"));
    expect(stranded.state).toBe("vendor_complete");
    expect(stranded.candidate).not.toBeNull();
    expect(await inferenceDebits()).toHaveLength(0);
    const vendorCallsBefore = held.callCount();

    // TWO RETRIES AT ONCE, both with a provider that fails the test if reached.
    const [a, b] = await Promise.all([
      generate(
        harness.db,
        owner,
        profileId,
        never(),
        anySlots(),
        params("retry-1"),
        new Date()
      ),
      generate(
        harness.db,
        owner,
        profileId,
        never(),
        anySlots(),
        params("retry-1"),
        new Date()
      ),
    ]);

    // EXACTLY ONE SETTLED IT, and the other was handed what it produced —
    // neither is an error a creator would have to interpret.
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(a.generation.id).toBe(b.generation.id);
    expect(a.creditsChargedNow + b.creditsChargedNow).toBe(
      Math.max(a.creditsChargedNow, b.creditsChargedNow)
    );
    expect(Math.max(a.creditsChargedNow, b.creditsChargedNow)).toBeGreaterThan(0);
    expect(
      await harness.db
        .select()
        .from(generations)
        .where(eq(generations.attemptId, "retry-1"))
    ).toHaveLength(1);
    expect(await inferenceDebits()).toHaveLength(1);
    // AND NOTHING WAS CALLED. `never()` would have thrown from inside the
    // provider; the count is the second, independent statement of it.
    expect(held.callCount()).toBe(vendorCallsBefore);
    const [after] = await harness.db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.attemptId, "retry-1"));
    expect(after.state).toBe("settled");
    // The candidate does not outlive the settlement that consumed it.
    expect(after.candidate).toBeNull();
  });

  it("R-63: the generation debit's uniqueness is `credit_ledger_inference_debit_uq`, BY NAME", async () => {
    const held = heldProvider();
    held.release();
    await generate(
      harness.db,
      owner,
      profileId,
      held.provider,
      anySlots(),
      params("uq-1"),
      new Date()
    );
    // A SECOND debit for the same attempt, attempted directly, names the
    // constraint that refuses it. This is the tripwire R-63 describes: a later
    // slice moving generation debits to their own `ref_type` turns this red
    // rather than silently opening a double-debit window.
    //
    // THROUGH THE RAW POOL, because drizzle wraps the driver error and the
    // constraint name survives only on the pg error object. "It threw" would
    // pass for any constraint at all.
    const client = await harness.pool.connect();
    let violation: { constraint?: string; code?: string } = {};
    try {
      await client.query(
        // `id` explicitly — see the sibling note in `free-mint.docker.test.ts`:
        // the column's default is drizzle-side, not a database default.
        `INSERT INTO credit_ledger (id, workspace_id, delta, kind, ref_type, ref_id, config_version)
         VALUES (gen_random_uuid(), $1, -2, 'debit', 'inference', 'uq-1', 1)`,
        [ws]
      );
    } catch (e) {
      violation = e as { constraint?: string; code?: string };
    } finally {
      client.release();
    }
    expect(violation.code).toBe("23505");
    expect(
      violation.constraint,
      "a second debit for one attempt was refused by the WRONG constraint"
    ).toBe("credit_ledger_inference_debit_uq");
    expect(await inferenceDebits()).toHaveLength(1);
  });
});

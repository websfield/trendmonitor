// Slice 7 stage A — REVISION LINEAGE (R6) and FEEDBACK CAPTURE (R10/R11),
// RUN rather than read.
//
// Same discipline and same reason as `generation-schema.test.ts` one file
// over: migration 0011 once shipped a composite FK referencing a unique INDEX
// drizzle-kit emits AFTER the FK, and it was verified by reading the SQL.
// Everything here runs the committed migrations into PGlite and attempts the
// row each constraint exists to forbid. PGlite is Postgres — the CHECKs, the
// composite FKs and (measured, 2026-09-01) the plpgsql trigger migration 0022
// adds all behave here exactly as they do on the server — so the division with
// the `.docker.test.ts` sibling is the repo's usual one: CONSTRAINTS here,
// CONCURRENCY there, because PGlite is single-connection and its "race" is a
// sequence.
//
// THE FOUR PROPERTIES R6 CLAIMS, and where each is proved:
//   same-tenant parent      — the three-column `generations_parent_fk`, below.
//   an EARLIER parent       — `settleGeneration`'s `created_at < now()`
//                             predicate, driven with a FUTURE-stamped parent
//                             so the guard's false branch actually runs
//                             (CLAUDE.md 2026-08-29: a required parameter
//                             reads exactly like a guard and is not one until
//                             a test drives its false branch).
//   no self-parent          — `generations_parent_is_not_self`, which is NOT
//                             redundant with the FK: a self-referencing FK
//                             ACCEPTS `INSERT ... VALUES (x, x)`, measured.
//   immutable after insert  — the `generations_parent_id_immutable` trigger,
//                             driven by ATTEMPTING the UPDATE.
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import {
  GENERATION_FEEDBACK_REACTIONS,
  generationAttempts,
  generationFeedback,
  generationFeedbackReaction,
  generations,
} from "../src/generation-schema";
import {
  FeedbackDuplicateError,
  FeedbackNoteError,
  FeedbackReactionError,
  FeedbackTargetError,
  GenerationLineageError,
  ProfileRoleError,
} from "../src/errors";
import { FEEDBACK_NOTE_MAX } from "../src/storage-limits";
import { listFeedback, recordFeedback } from "../src/feedback-ops";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type SettleGenerationParams,
} from "../src/with-workspace";

const HASH = "a".repeat(64);

/**
 * The message a rejected drizzle query ACTUALLY carries, causes included.
 *
 * Drizzle wraps a driver error in its own `Failed query: …` and puts the
 * database's message on `cause`, so `rejects.toThrow(/immutable/i)` matches
 * the WRAPPER and would pass on any failure at all — a NOT NULL violation in a
 * broken fixture included. Found by running it: the first version of the
 * immutability case reported "the trigger is not there" while the trigger had
 * fired correctly. Walking the chain is what makes "refused FOR THIS REASON" a
 * different claim from "refused".
 */
async function refusalMessage(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    const parts: string[] = [];
    let current: unknown = error;
    while (current instanceof Error) {
      parts.push(current.message);
      current = (current as { cause?: unknown }).cause;
    }
    return parts.join(" | ");
  }
  throw new Error("the statement was NOT refused");
}

describe("slice 7 stage A: revision lineage and feedback capture", () => {
  let db: TestDb;
  let wsA: string;
  let wsB: string;
  let pA1: string;
  let pA2: string;
  let pB: string;
  let snapshotA1: string;
  let snapshotA2: string;
  let snapshotB: string;

  const attemptFor = (
    profileId: string,
    workspaceId: string,
    attemptId: string
  ) => ({
    profileId,
    workspaceId,
    attemptId,
    purpose: "generation",
    mode: "hookSet",
    payloadSha256: HASH,
  });

  const settleParams = (
    attemptId: string,
    snapshotId: string,
    over: Partial<SettleGenerationParams> = {}
  ): SettleGenerationParams => ({
    attemptId,
    mode: "hookSet",
    brainActivationId: snapshotId,
    frameworkVersions: [],
    contextInputIds: [],
    request: { idea: "a hook about shipping on a Friday" },
    model: "claude-opus-5",
    promptBundleVersion: "pb-1",
    configVersion: 1,
    outcome: "usable",
    output: { hooks: ["Ship it on a Friday."] },
    weakestPoint: "you have logged no results, so nothing here is evidence about you",
    refusalReason: null,
    killTest: { rulesFired: [], rewritten: false },
    rewriteCount: 0,
    debitLedgerId: null,
    ...over,
  });

  /**
   * Walk one generation through the real lifecycle and return its row.
   *
   * THE LIFECYCLE IS WALKED, not short-circuited, for the reason
   * `profile-scope.test.ts`'s own fixture records: the constraint pair refuses
   * a settled attempt naming no generation AND a generation naming no attempt,
   * so neither row can be written first in its final state.
   */
  async function settleOne(
    scope: ProfileScope,
    attemptId: string,
    snapshotId: string,
    over: Partial<SettleGenerationParams> = {}
  ) {
    const caps = writeCapabilities(scope);
    return db.transaction(async (tx) => {
      await caps.claimGenerationAttempt(
        { attemptId, purpose: "generation", mode: "hookSet", payloadSha256: HASH },
        tx
      );
      await caps.advanceGenerationAttempt({ attemptId, to: "vendor_started" }, tx);
      await caps.advanceGenerationAttempt(
        { attemptId, to: "vendor_complete", candidate: { v: 1 } },
        tx
      );
      const { generation } = await caps.settleGeneration(
        settleParams(attemptId, snapshotId, over),
        tx
      );
      return generation;
    });
  }

  const mint = (profileId: string, authUserId = "lf_a") =>
    withWorkspace(db, { authUserId }).then((scope) =>
      ProfileScope.mint(db, scope, profileId)
    );

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "lf_a");
    await seedAuthUser(db, "lf_b");
    wsA = (await ensureUserWorkspace(db, { authUserId: "lf_a", name: "A" }))
      .workspace.id;
    wsB = (await ensureUserWorkspace(db, { authUserId: "lf_b", name: "B" }))
      .workspace.id;
    const profiles = await db
      .insert(creatorProfiles)
      .values([
        { workspaceId: wsA, displayName: "A-one" },
        { workspaceId: wsA, displayName: "A-two" },
        { workspaceId: wsB, displayName: "B-one" },
      ])
      .returning();
    pA1 = profiles[0].id;
    pA2 = profiles[1].id;
    pB = profiles[2].id;
    const snapshots = await db
      .insert(brainActivationSnapshots)
      .values([
        { profileId: pA1, workspaceId: wsA },
        { profileId: pA2, workspaceId: wsA },
        { profileId: pB, workspaceId: wsB },
      ])
      .returning();
    snapshotA1 = snapshots[0].id;
    snapshotA2 = snapshots[1].id;
    snapshotB = snapshots[2].id;
  });

  // ------------------------------------------------------------------- R6

  it("R6: a revision stores its parent, and the stored value is the requested one (M5)", async () => {
    const scope = await mint(pA1);
    const parent = await settleOne(scope, "att_parent", snapshotA1);
    const child = await settleOne(scope, "att_child", snapshotA1, {
      parentId: parent.id,
    });
    // M5 ("parent_id written as null on revision") reddens HERE. `toBe`
    // against the parent's id rather than `not.toBeNull()`, because a writer
    // that stored SOME other generation's id would pass the weaker assertion.
    expect(child.parentId).toBe(parent.id);
    // ...and it really is on the row, not only in the returned object.
    const [stored] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, child.id));
    expect(stored.parentId).toBe(parent.id);
    // NON-VACUITY, the other direction: an ORIGINAL stores null, so "parent is
    // set" is a statement about revisions rather than about every row.
    expect(parent.parentId).toBeNull();
  });

  it("R6 (verification 13): a CROSS-WORKSPACE parent id refuses, by NAME", async () => {
    const scopeA = await mint(pA1);
    const scopeB = await mint(pB, "lf_b");
    const theirs = await settleOne(scopeB, "att_b", snapshotB);
    await expect(
      settleOne(scopeA, "att_a_child", snapshotA1, { parentId: theirs.id })
    ).rejects.toBeInstanceOf(GenerationLineageError);
    // ...and a SAME-WORKSPACE SIBLING PROFILE is refused too, which is the
    // half a workspace-only predicate would miss (R-9 is about profiles, not
    // only workspaces).
    const scopeA2 = await mint(pA2);
    const siblings = await settleOne(scopeA2, "att_a2", snapshotA2);
    await expect(
      settleOne(scopeA, "att_a_child2", snapshotA1, { parentId: siblings.id })
    ).rejects.toBeInstanceOf(GenerationLineageError);
  });

  it("R6 (verification 13): a NONEXISTENT and a MALFORMED parent id refuse identically", async () => {
    const scope = await mint(pA1);
    const missing = await settleOne(scope, "att_m", snapshotA1, {
      parentId: "00000000-0000-4000-8000-000000000001",
    }).catch((e: Error) => e);
    const malformed = await settleOne(scope, "att_n", snapshotA1, {
      parentId: "not-a-uuid",
    }).catch((e: Error) => e);
    expect(missing).toBeInstanceOf(GenerationLineageError);
    expect(malformed).toBeInstanceOf(GenerationLineageError);
    // BYTE-IDENTICAL: a malformed id must not be distinguishable from an
    // absent one, and neither from a foreign one — a uuidv7 leaks creation
    // TIME as well as existence, so a distinguishable refusal here is a
    // sharper oracle than `ProfileAccessError`'s.
    expect((missing as Error).message).toBe((malformed as Error).message);
  });

  it("R6 (verification 13): a parent that is NOT EARLIER refuses — the guard's false branch", async () => {
    // THE CASE A REQUIRED PARAMETER CANNOT PROVE BY EXISTING. `created_at` is
    // `now()` (TRANSACTION START), so a transaction that began before a
    // sibling committed can name a parent stamped after it. Driven by
    // stamping a parent in the FUTURE, which is the same observable.
    const scope = await mint(pA1);
    const parent = await settleOne(scope, "att_future", snapshotA1);
    await db
      .update(generations)
      .set({ createdAt: sql`now() + interval '1 hour'` })
      .where(eq(generations.id, parent.id));
    await expect(
      settleOne(scope, "att_child_of_future", snapshotA1, { parentId: parent.id })
    ).rejects.toBeInstanceOf(GenerationLineageError);
    // NON-VACUITY: the SAME parent, stamped in the past, is accepted — so the
    // refusal is about the ordering and not about this fixture.
    await db
      .update(generations)
      .set({ createdAt: sql`now() - interval '1 hour'` })
      .where(eq(generations.id, parent.id));
    const child = await settleOne(scope, "att_child_ok", snapshotA1, {
      parentId: parent.id,
    });
    expect(child.parentId).toBe(parent.id);
  });

  it("R6 (M9): the FK carries profile AND workspace — a bare id FK would accept this row", async () => {
    // M9 is "parent_id FK drops profile/workspace columns". It is a MIGRATION
    // mutation, so the behavioural witness is what the three-column FK refuses
    // that a one-column FK would accept: a raw INSERT (bypassing the writer's
    // named refusal entirely) naming another profile's generation.
    const scopeA = await mint(pA1);
    const scopeA2 = await mint(pA2);
    const theirs = await settleOne(scopeA2, "att_owner", snapshotA2);
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_raw"));
    await expect(
      db.insert(generations).values({
        profileId: pA1,
        workspaceId: wsA,
        attemptId: "att_raw",
        mode: "hookSet",
        brainActivationId: snapshotA1,
        request: {},
        model: "m",
        promptBundleVersion: "pb-1",
        configVersion: 1,
        outcome: "usable",
        output: { hooks: [] },
        weakestPoint: "nothing here is evidence about you",
        killTest: {},
        // pA2's generation, under pA1's scope columns. A single-column FK to
        // `generations(id)` would find this id and accept the row.
        parentId: theirs.id,
      }),
      "a cross-profile parent was accepted — the FK is not carrying both scope columns"
    ).rejects.toThrow();
    void scopeA;
  });

  it("R6: a SELF-PARENT is refused — the FK alone accepts it, measured", async () => {
    // `generations_parent_is_not_self` is not defensive tidying. A
    // self-referencing FK ACCEPTS `INSERT ... VALUES (x, x)` because Postgres
    // checks the new row against itself after inserting it — reproduced on
    // this repo's own PGlite build on 2026-09-01, which is why the CHECK
    // exists. This drives the CHECK directly, since no writer can produce the
    // row (`settleGeneration` mints the id itself).
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_self"));
    const id = "01960000-0000-7000-8000-000000000abc";
    await expect(
      db.insert(generations).values({
        id,
        parentId: id,
        profileId: pA1,
        workspaceId: wsA,
        attemptId: "att_self",
        mode: "hookSet",
        brainActivationId: snapshotA1,
        request: {},
        model: "m",
        promptBundleVersion: "pb-1",
        configVersion: 1,
        outcome: "usable",
        output: { hooks: [] },
        weakestPoint: "nothing here is evidence about you",
        killTest: {},
      }),
      "a one-row lineage cycle was accepted"
    ).rejects.toThrow();
  });

  it("R6 (verification 13): parent_id is IMMUTABLE — the mutation is attempted and refused", async () => {
    const scope = await mint(pA1);
    const parent = await settleOne(scope, "att_p", snapshotA1);
    const child = await settleOne(scope, "att_c", snapshotA1, {
      parentId: parent.id,
    });
    const other = await settleOne(scope, "att_o", snapshotA1);

    // THE MUTATION, ATTEMPTED. Not "there is no update writer" — that is a
    // scan over our own source (`tests/table-writers.test.ts`) and says
    // nothing about what an incident-time hand-run UPDATE can do. This is the
    // database refusing, and `refusalMessage` is what makes it "refused FOR
    // THIS REASON" rather than merely "refused" (see its docblock — the first
    // version of this case matched drizzle's wrapper and would have passed on
    // any failure at all).
    expect(
      await refusalMessage(
        db
          .update(generations)
          .set({ parentId: other.id })
          .where(eq(generations.id, child.id))
      ),
      "parent_id was rewritten — the immutability trigger is not there"
    ).toMatch(/parent_id is immutable after insert/i);
    // ...clearing it is a change too (`IS DISTINCT FROM`, not `<>`).
    expect(
      await refusalMessage(
        db
          .update(generations)
          .set({ parentId: null })
          .where(eq(generations.id, child.id))
      )
    ).toMatch(/parent_id is immutable after insert/i);
    // ...and SETTING one on an original is refused as well, which is the
    // direction that would let a cycle be built from the other end.
    expect(
      await refusalMessage(
        db
          .update(generations)
          .set({ parentId: child.id })
          .where(eq(generations.id, parent.id))
      )
    ).toMatch(/parent_id is immutable after insert/i);

    // NON-VACUITY, and it is the interesting half: the trigger is NARROW. An
    // update that leaves `parent_id` alone still succeeds, so the control is
    // not an outage for a future deletion/pseudonymisation executor.
    await expect(
      db
        .update(generations)
        .set({ model: "claude-opus-5-1" })
        .where(eq(generations.id, child.id))
    ).resolves.toBeDefined();
    const [after] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, child.id));
    expect(after.parentId).toBe(parent.id);
    expect(after.model).toBe("claude-opus-5-1");
  });

  // ------------------------------------------------------------- R10 / R11

  it("R10: the closed reaction set in code and the pgEnum are the SAME set", () => {
    // Two halves of one vocabulary — the database's and application code's —
    // asserted equal rather than assumed to have been typed on the same day.
    expect([...GENERATION_FEEDBACK_REACTIONS].sort()).toEqual(
      [...generationFeedbackReaction.enumValues].sort()
    );
    expect(GENERATION_FEEDBACK_REACTIONS.length).toBeGreaterThan(1);
  });

  it("R10: feedback is stored as a structured event, and read back RAW", async () => {
    const scope = await withWorkspace(db, { authUserId: "lf_a" });
    const generation = await settleOne(await mint(pA1), "att_fb", snapshotA1);
    const row = await recordFeedback(db, scope, pA1, {
      generationId: generation.id,
      reaction: "off_voice",
      note: "the second hook sounds like a LinkedIn post",
    });
    expect(row.reaction).toBe("off_voice");
    expect(row.generationId).toBe(generation.id);
    expect(row.profileId).toBe(pA1);
    expect(row.workspaceId).toBe(wsA);

    // R11's behavioural half: the reader returns the STORED EVENTS, column for
    // column — no count, no grouping, no derived label. A scan cannot prove
    // this (its own header says so); this can.
    const read = await listFeedback(db, scope, pA1);
    expect(read).toHaveLength(1);
    const [stored] = await db
      .select()
      .from(generationFeedback)
      .where(eq(generationFeedback.id, row.id));
    expect(read[0]).toEqual(stored);
    expect(Object.keys(read[0]).sort()).toEqual(
      [
        "id",
        "profileId",
        "workspaceId",
        "generationId",
        "reaction",
        "note",
        "createdAt",
      ].sort()
    );
  });

  it("R11: the RELATIONAL-QUERY API reaches this table unscoped — which is why the scan must see it", async () => {
    // WHY THIS TEST EXISTS AT ALL (tenancy gate, 2026-09-01). R11's "exactly
    // one raw reader" is held up by a SOURCE SCAN
    // (`tests/feedback-readers.test.ts`), and that scan's population was every
    // spelling that reaches the table through `.from(...)`. Drizzle's
    // relational-query API reaches it through none of them: measured,
    // `db.query.generationFeedback.findMany()` returned an UNSCOPED row while
    // the scan returned ZERO findings for that source.
    //
    // THIS IS THE HALF THE SCAN CANNOT ASSERT. The scan now sees the spelling;
    // what makes seeing it matter is that the spelling WORKS and returns rows
    // with no cage — proved here rather than argued, so nobody later reads the
    // new rule as defensive tidiness. `drizzle(pool, { schema })` in
    // `packages/db/src/client.ts` is what builds the accessor, for every table
    // in the schema, and `createTestDb` builds its handle the same way.
    const scopeA = await withWorkspace(db, { authUserId: "lf_a" });
    const scopeB = await withWorkspace(db, { authUserId: "lf_b" });
    const genA = await settleOne(await mint(pA1), "att_qa", snapshotA1);
    const genB = await settleOne(await mint(pB, "lf_b"), "att_qb", snapshotB);
    await recordFeedback(db, scopeA, pA1, {
      generationId: genA.id,
      reaction: "used_as_is",
    });
    await recordFeedback(db, scopeB, pB, {
      generationId: genB.id,
      reaction: "off_voice",
    });

    const unscoped = await db.query.generationFeedback.findMany();
    expect(
      unscoped.length,
      "the relational-query accessor returned nothing — this test is measuring an API that is not there"
    ).toBe(2);
    // BOTH WORKSPACES' ROWS, from one call, with no predicate: the leak the
    // source scan is the only control against.
    expect(new Set(unscoped.map((r) => r.workspaceId)).size).toBe(2);
    // ...and the CAGED reader, on the same data, returns one profile's rows.
    expect(await listFeedback(db, scopeA, pA1)).toHaveLength(1);
  });

  it("R10: SEVERAL reactions per output are allowed; the SAME one twice is refused", async () => {
    const scope = await withWorkspace(db, { authUserId: "lf_a" });
    const generation = await settleOne(await mint(pA1), "att_fb2", snapshotA1);
    await recordFeedback(db, scope, pA1, {
      generationId: generation.id,
      reaction: "used_with_edits",
    });
    // A coherent pair — "I used it, and it was off voice" — must remain two
    // facts rather than collapsing to one.
    await expect(
      recordFeedback(db, scope, pA1, {
        generationId: generation.id,
        reaction: "off_voice",
      })
    ).resolves.toBeDefined();
    // ...and the same reaction twice is ONE fact. Refused by NAME rather than
    // swallowed, because a swallowed duplicate reports success on a note that
    // was not kept.
    await expect(
      recordFeedback(db, scope, pA1, {
        generationId: generation.id,
        reaction: "off_voice",
        note: "this note would have been silently discarded",
      })
    ).rejects.toBeInstanceOf(FeedbackDuplicateError);
    expect(await listFeedback(db, scope, pA1)).toHaveLength(2);
  });

  it("R10 (verification 13): a CROSS-SCOPE generation id refuses BY NAME", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "lf_a" });
    const theirs = await settleOne(await mint(pB, "lf_b"), "att_fbb", snapshotB);
    const siblings = await settleOne(await mint(pA2), "att_fba2", snapshotA2);
    // FOUR CASES, ONE CLASS, ONE MESSAGE. `toThrow()` alone would have passed
    // on the raw 23503 the composite FK raises — which is what this path did
    // until the author's adversarial re-read, and a 23503 reaching `app/**`
    // renders as "Something went wrong".
    const messages: string[] = [];
    for (const [label, id] of [
      ["another workspace's output", theirs.id],
      // The same-workspace SIBLING PROFILE — the case a workspace-only
      // predicate would miss, and the reason the FK carries all three columns.
      ["a sibling profile's output", siblings.id],
      ["an output that does not exist", "00000000-0000-4000-8000-000000000001"],
      ["a malformed id", "not-a-uuid"],
    ] as [string, string][]) {
      const error = await recordFeedback(db, scopeA, pA1, {
        generationId: id,
        reaction: "used_as_is",
      }).catch((e: Error) => e);
      expect(error, label).toBeInstanceOf(FeedbackTargetError);
      messages.push((error as Error).message);
    }
    expect(
      new Set(messages).size,
      "the four refusals are distinguishable — that is an oracle over other creators' generation ids"
    ).toBe(1);
    // NON-VACUITY: this profile's own output is accepted.
    const mine = await settleOne(await mint(pA1), "att_fba1", snapshotA1);
    await expect(
      recordFeedback(db, scopeA, pA1, {
        generationId: mine.id,
        reaction: "used_as_is",
      })
    ).resolves.toBeDefined();
  });

  it("R10: an unknown reaction is refused at RUNTIME, not only in the type", async () => {
    const scope = await withWorkspace(db, { authUserId: "lf_a" });
    const generation = await settleOne(await mint(pA1), "att_fb3", snapshotA1);
    // `as unknown as` rather than only `@ts-expect-error`: proving a field
    // cannot be TYPED is not proving it cannot be CAST (CLAUDE.md 2026-08-21),
    // and without the runtime check this reaches the pgEnum and the creator
    // sees a driver error rather than a refusal.
    await expect(
      recordFeedback(db, scope, pA1, {
        generationId: generation.id,
        reaction: "loved_it" as unknown as "used_as_is",
      })
    ).rejects.toBeInstanceOf(FeedbackReactionError);
    // ...and the REACTION check runs BEFORE the target read, so an unknown
    // code on a valid output is a reaction refusal rather than a target one —
    // the two say opposite things to the person reading them.
    expect(
      await recordFeedback(db, scope, pA1, {
        generationId: generation.id,
        reaction: "loved_it" as unknown as "used_as_is",
      }).catch((e: Error) => e)
    ).not.toBeInstanceOf(FeedbackTargetError);
    // ...and the row really was not written.
    expect(await listFeedback(db, scope, pA1)).toHaveLength(0);
  });

  it("R10: the note is optional, bounded, and never blank-but-present", async () => {
    const scope = await withWorkspace(db, { authUserId: "lf_a" });
    const generation = await settleOne(await mint(pA1), "att_fb4", snapshotA1);
    // Optional: absent is a real answer and stores NULL.
    const bare = await recordFeedback(db, scope, pA1, {
      generationId: generation.id,
      reaction: "discarded",
    });
    expect(bare.note).toBeNull();
    // Blank-but-present is refused rather than silently stored as NULL — a
    // creator who typed only whitespace and pressed send would otherwise never
    // be told their words were dropped.
    for (const blank of ["", "   ", "\n\t "]) {
      await expect(
        recordFeedback(db, scope, pA1, {
          generationId: generation.id,
          reaction: "too_generic",
          note: blank,
        }),
        JSON.stringify(blank)
      ).rejects.toBeInstanceOf(FeedbackNoteError);
    }
    await expect(
      recordFeedback(db, scope, pA1, {
        generationId: generation.id,
        reaction: "too_generic",
        note: "x".repeat(FEEDBACK_NOTE_MAX + 1),
      })
    ).rejects.toBeInstanceOf(FeedbackNoteError);
    // ...and the CHECK behind the application rule refuses a blank note that
    // arrives by raw SQL, so the column's promise does not depend on the
    // writer being the only door.
    await expect(
      db.insert(generationFeedback).values({
        profileId: pA1,
        workspaceId: wsA,
        generationId: generation.id,
        reaction: "wrong_angle",
        note: "   ",
      })
    ).rejects.toThrow();
  });

  it("R10: a VIEWER cannot record feedback", async () => {
    // The role gate, driven rather than described. Feedback is an assertion
    // about a creator's output that slice 9 may build a proposal from.
    const generation = await settleOne(await mint(pA1), "att_fb5", snapshotA1);
    await seedAuthUser(db, "lf_viewer");
    const { schema } = await import("../src/index");
    const [viewerUser] = await db
      .insert(schema.users)
      .values({ authUserId: "lf_viewer" })
      .returning();
    await db
      .insert(schema.memberships)
      .values({ userId: viewerUser.id, workspaceId: wsA, role: "viewer" });
    const viewerScope = await withWorkspace(db, {
      authUserId: "lf_viewer",
      workspaceId: wsA,
    });
    expect(viewerScope.role).toBe("viewer");
    await expect(
      recordFeedback(db, viewerScope, pA1, {
        generationId: generation.id,
        reaction: "used_as_is",
      })
    ).rejects.toBeInstanceOf(ProfileRoleError);
    // ...but a viewer MAY read, like every other profile read in this package.
    await expect(listFeedback(db, viewerScope, pA1)).resolves.toEqual([]);
  });

  it("R10/R11: feedback JOINS THE EXPORT, as raw rows", async () => {
    const scope = await withWorkspace(db, { authUserId: "lf_a" });
    const generation = await settleOne(await mint(pA1), "att_fb6", snapshotA1);
    const written = await recordFeedback(db, scope, pA1, {
      generationId: generation.id,
      reaction: "not_filmable",
      note: "there is no way I am renting a drone for this",
    });
    const profileScope = await mint(pA1);
    const page = (await profileScope.accessors.exportPage(
      "generation_feedback",
      0
    )) as Record<string, unknown>[];
    expect(page).toHaveLength(1);
    expect(page[0]).toEqual(written);
    // The export branch and the accessor are the SAME query at a different
    // page size, which is what keeps "exactly one raw reader" true — so they
    // must agree row for row.
    expect(page[0]).toEqual((await listFeedback(db, scope, pA1))[0]);
  });
});

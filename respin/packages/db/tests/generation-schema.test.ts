// Slice 6 stage A — the generation substrate's constraints, RUN rather than
// read (R9, R9a, R11, R14 and R14c's schema halves).
//
// Same discipline as `brain-schema.test.ts`, and the same reason: migration
// 0011 once shipped a composite FK referencing a unique INDEX drizzle-kit
// emits AFTER the FK, and it was verified by reading the SQL. "The constraint
// is emitted" and "the constraint is emitted in a working order" are different
// checks, and only running the migration tells them apart. Everything here
// runs the committed migrations into PGlite and attempts the row each
// constraint exists to forbid; the emitted-SQL companions (explicit ON DELETE,
// the inline UNIQUE, the partial index's WHERE) live in
// `migration-shape.test.ts`, because no INSERT can demonstrate any of them.
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import { generationAttempts, generations } from "../src/generation-schema";
import {
  ProfileScope,
  UsageRawError,
  withWorkspace,
  writeCapabilities,
} from "../src/with-workspace";

/**
 * R14c's durable candidate, as this table sees it: an opaque `jsonb` document
 * whose WINDOW — not whose contents — is what the schema has an opinion about.
 */
const CANDIDATE = { v: 1, outcome: "usable", output: { hooks: [] } };

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

/** A settled attempt's four stamps, so each fixture names only what varies. */
const settledStamps = () => ({
  vendorStartedAt: new Date(),
  vendorCompletedAt: new Date(),
  terminalAt: new Date(),
});

describe("slice 6 stage A: generation_attempts / generations constraints", () => {
  let db: TestDb;
  let wsA: string;
  let wsB: string;
  let pA1: string;
  let pA2: string;
  let pB: string;
  let snapshotA1: string;

  const attemptFor = (
    profileId: string,
    workspaceId: string,
    attemptId: string,
    over: Record<string, unknown> = {}
  ) => ({
    profileId,
    workspaceId,
    attemptId,
    purpose: "generation",
    mode: "hookSet",
    payloadSha256: HASH_A,
    ...over,
  });

  const generationFor = (
    profileId: string,
    workspaceId: string,
    attemptId: string,
    over: Record<string, unknown> = {}
  ) => ({
    profileId,
    workspaceId,
    attemptId,
    mode: "hookSet",
    brainActivationId: snapshotA1,
    request: { idea: "a hook about shipping on a Friday" },
    model: "claude-opus-5",
    promptBundleVersion: "pb-1",
    configVersion: 1,
    outcome: "usable" as const,
    output: { hooks: ["Ship it on a Friday."] },
    weakestPoint: "you have logged no results, so nothing here is evidence about you",
    killTest: { rulesFired: [], rewritten: false },
    ...over,
  });

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "gen_a");
    await seedAuthUser(db, "gen_b");
    wsA = (await ensureUserWorkspace(db, { authUserId: "gen_a", name: "A" }))
      .workspace.id;
    wsB = (await ensureUserWorkspace(db, { authUserId: "gen_b", name: "B" }))
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
    const [snapshot] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId: pA1, workspaceId: wsA })
      .returning();
    snapshotA1 = snapshot.id;
  });

  // ------------------------------------------------------------------- R9

  it("R9: the composite FK refuses a cross-parented row, in BOTH directions", async () => {
    // The property MATCH SIMPLE would silently drop if either half were
    // nullable: a row naming a parent that does not exist. Both directions,
    // because `brain-schema.ts`'s header records both being reproduced.
    await expect(
      db.insert(generationAttempts).values(attemptFor(pA1, wsB, "att_x"))
    ).rejects.toThrow();
    await expect(
      db.insert(generationAttempts).values(attemptFor(pB, wsA, "att_y"))
    ).rejects.toThrow();

    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_ok"));
    await expect(
      db.insert(generations).values(generationFor(pA1, wsB, "att_ok"))
    ).rejects.toThrow();
    await expect(
      db.insert(generations).values(generationFor(pB, wsA, "att_ok"))
    ).rejects.toThrow();

    // NON-VACUITY: the same rows with a coherent pair land.
    await expect(
      db.insert(generations).values(generationFor(pA1, wsA, "att_ok"))
    ).resolves.toBeDefined();
  });

  it("R9: both FK columns are NOT NULL on BOTH tables — a NULL half cannot be smuggled in", async () => {
    // `as unknown as` rather than only a type error: proving a column cannot be
    // TYPED null is not proving it cannot be CAST null (CLAUDE.md 2026-08-21),
    // and a nullable half is precisely what makes MATCH SIMPLE skip the whole
    // composite FK.
    for (const [label, row] of [
      ["attempt, null workspace", attemptFor(pA1, null as unknown as string, "att_n1")],
      ["attempt, null profile", attemptFor(null as unknown as string, wsA, "att_n2")],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(generationAttempts).values(row as never),
        label + " was accepted"
      ).rejects.toThrow();
    }
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_n3"));
    for (const [label, row] of [
      ["generation, null workspace", generationFor(pA1, null as unknown as string, "att_n3")],
      ["generation, null profile", generationFor(null as unknown as string, wsA, "att_n3")],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(generations).values(row as never),
        label + " was accepted"
      ).rejects.toThrow();
    }
  });

  it("R9: UNIQUE (id, profile_id, workspace_id) is USABLE as a same-tenant FK target, and refuses a cross-tenant child", async () => {
    // The reason the constraint exists at all: slices 7 and 9 hang lineage and
    // results off it. Asserting it is "present" in pg_constraint would pass on
    // a constraint added too late to be referenced — the exact migration-0011
    // defect — so this DOES what slice 7 will do, in a rolled-back transaction.
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_fk"));
    const [generation] = await db
      .insert(generations)
      .values(generationFor(pA1, wsA, "att_fk"))
      .returning();

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(`CREATE TABLE slice7_probe (
            id uuid PRIMARY KEY,
            generation_id uuid NOT NULL,
            profile_id uuid NOT NULL,
            workspace_id uuid NOT NULL,
            CONSTRAINT slice7_probe_generation_fk
              FOREIGN KEY (generation_id, profile_id, workspace_id)
              REFERENCES generations (id, profile_id, workspace_id)
              ON DELETE CASCADE
          )`)
        );
        // The same-tenant child lands...
        await tx.execute(
          sql.raw(
            `INSERT INTO slice7_probe VALUES ('00000000-0000-4000-8000-000000000001',
              '${generation.id}', '${pA1}', '${wsA}')`
          )
        );
        // ...and the SIBLING profile naming the same generation does not,
        // which is the whole point of the composite target.
        await expect(
          tx.execute(
            sql.raw(
              `INSERT INTO slice7_probe VALUES ('00000000-0000-4000-8000-000000000002',
                '${generation.id}', '${pA2}', '${wsA}')`
            )
          )
        ).rejects.toThrow();
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");
  });

  // ------------------------------------------------------------------ R14

  it("R14: a second claim on the same attempt_id cannot land, whatever its payload", async () => {
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_dup"));
    // SAME payload — the honest retry. The schema still refuses the INSERT,
    // which is what forces the retry path to READ the stored claim rather than
    // insert beside it (the read-then-compare half is stage C's).
    await expect(
      db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_dup"))
    ).rejects.toThrow();
    // DIFFERENT payload — R14's "same attempt_id + different payload refuses".
    await expect(
      db
        .insert(generationAttempts)
        .values(attemptFor(pA1, wsA, "att_dup", { payloadSha256: HASH_B }))
    ).rejects.toThrow();
    // ...and a DIFFERENT WORKSPACE claiming the same attempt id fails closed
    // too, which is the property that keeps this table and
    // `credit_ledger_inference_debit_uq` (global on (ref_type, ref_id))
    // agreeing about what one attempt is.
    await expect(
      db.insert(generationAttempts).values(attemptFor(pB, wsB, "att_dup"))
    ).rejects.toThrow();
    // NON-VACUITY: a genuinely different attempt id lands.
    await expect(
      db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_other"))
    ).resolves.toBeDefined();
  });

  it("R14: the payload hash must BE a hash — anything else is not an identity", async () => {
    for (const bad of ["", "not-a-hash", HASH_A.toUpperCase(), HASH_A.slice(1)]) {
      await expect(
        db
          .insert(generationAttempts)
          .values(attemptFor(pA1, wsA, "att_h_" + bad.length, { payloadSha256: bad })),
        `payload_sha256 accepted ${JSON.stringify(bad)}`
      ).rejects.toThrow();
    }
  });

  it("R14: every state carries the evidence it claims", async () => {
    const REFUSED: [string, Record<string, unknown>][] = [
      // A claim that has not called anything cannot carry a start stamp.
      ["claimed with a vendor start", { state: "claimed", vendorStartedAt: new Date() }],
      // ...and a state that implies the call happened cannot omit it.
      ["vendor_started with no start stamp", { state: "vendor_started", terminalAt: null }],
      [
        "vendor_complete with no completion stamp",
        {
          state: "vendor_complete",
          vendorStartedAt: new Date(),
          candidate: CANDIDATE,
        },
      ],
      // R14c, BOTH DIRECTIONS OF THE CANDIDATE'S EQUALITY. One direction is
      // the retention rule — no terminal row, and no pre-call row, may carry
      // the words. The other is what makes the retry total: a checkpoint that
      // stored nothing is a `vendor_complete` attempt no retry could settle,
      // and it is unrepresentable rather than merely unlikely.
      [
        "vendor_complete storing NO candidate",
        {
          state: "vendor_complete",
          vendorStartedAt: new Date(),
          vendorCompletedAt: new Date(),
        },
      ],
      [
        "claimed already holding a candidate",
        { state: "claimed", candidate: CANDIDATE },
      ],
      [
        "vendor_started already holding a candidate",
        {
          state: "vendor_started",
          vendorStartedAt: new Date(),
          candidate: CANDIDATE,
        },
      ],
      [
        "refused still holding a candidate",
        {
          state: "refused",
          terminalAt: new Date(),
          refusalCode: "post_call_debit",
          candidate: CANDIDATE,
        },
      ],
      [
        "recovery_required still holding a candidate",
        {
          state: "recovery_required",
          vendorStartedAt: new Date(),
          terminalAt: new Date(),
          candidate: CANDIDATE,
        },
      ],
      // ...and a candidate has to BE a document. `'null'::jsonb` is not SQL
      // NULL, so it satisfies `IS NOT NULL` while carrying nothing to settle.
      [
        "vendor_complete whose candidate is the jsonb scalar null",
        {
          state: "vendor_complete",
          vendorStartedAt: new Date(),
          vendorCompletedAt: new Date(),
          candidate: sql`'null'::jsonb`,
        },
      ],
      [
        "vendor_complete whose candidate is a jsonb array",
        {
          state: "vendor_complete",
          vendorStartedAt: new Date(),
          vendorCompletedAt: new Date(),
          candidate: [1, 2, 3],
        },
      ],
      [
        "recovery_required with no start stamp",
        { state: "recovery_required", terminalAt: new Date() },
      ],
      // A terminal state without its terminal stamp, and a live state wearing
      // one — the equality refuses both.
      [
        "settled with no terminal stamp",
        {
          state: "settled",
          vendorStartedAt: new Date(),
          vendorCompletedAt: new Date(),
          generationId: "00000000-0000-4000-8000-00000000000a",
        },
      ],
      ["claimed with a terminal stamp", { state: "claimed", terminalAt: new Date() }],
      // Settlement that settled into nothing.
      ["settled naming no generation", { state: "settled", ...settledStamps() }],
      // A refusal that does not say why.
      ["refused with no code", { state: "refused", terminalAt: new Date() }],
      // A debit recorded against an attempt that never settled.
      [
        "a debit on a refused attempt",
        {
          state: "refused",
          terminalAt: new Date(),
          refusalCode: "insufficient_credits",
          debitLedgerId: "00000000-0000-4000-8000-00000000000b",
        },
      ],
    ];
    for (const [label, over] of REFUSED) {
      await expect(
        db
          .insert(generationAttempts)
          .values(attemptFor(pA1, wsA, "att_st_" + label.length, over)),
        label + " was accepted"
      ).rejects.toThrow();
    }

    // NON-VACUITY, and it is the whole lifecycle rather than one row: each
    // legal state is reachable, so the nine refusals above are a measurement
    // of the constraints rather than of a table that refuses everything.
    const [row] = await db
      .insert(generationAttempts)
      .values(attemptFor(pA1, wsA, "att_life"))
      .returning();
    expect(row.state).toBe("claimed");
    for (const step of [
      { state: "vendor_started" as const, vendorStartedAt: new Date() },
      {
        state: "vendor_complete" as const,
        vendorCompletedAt: new Date(),
        candidate: CANDIDATE,
      },
    ]) {
      await expect(
        db.update(generationAttempts).set(step).where(eq(generationAttempts.id, row.id))
      ).resolves.toBeDefined();
    }
    const [generation] = await db
      .insert(generations)
      .values(generationFor(pA1, wsA, "att_life"))
      .returning();
    await expect(
      db
        .update(generationAttempts)
        .set({
          state: "settled",
          terminalAt: new Date(),
          generationId: generation.id,
          candidate: null,
        })
        .where(eq(generationAttempts.id, row.id))
    ).resolves.toBeDefined();
    // ...and the SAME settlement WITHOUT clearing the candidate is refused, so
    // the line above is a constraint being satisfied rather than a habit.
    const [live] = await db
      .insert(generationAttempts)
      .values(
        attemptFor(pA1, wsA, "att_life2", {
          state: "vendor_complete",
          vendorStartedAt: new Date(),
          vendorCompletedAt: new Date(),
          candidate: CANDIDATE,
        })
      )
      .returning();
    const [g2] = await db
      .insert(generations)
      .values(generationFor(pA1, wsA, "att_life2"))
      .returning();
    await expect(
      db
        .update(generationAttempts)
        .set({ state: "settled", terminalAt: new Date(), generationId: g2.id })
        .where(eq(generationAttempts.id, live.id)),
      "a settled attempt kept its candidate"
    ).rejects.toThrow();
    // ...and the two terminal states that are not `settled`.
    await expect(
      db.insert(generationAttempts).values(
        attemptFor(pA1, wsA, "att_ref", {
          state: "refused",
          terminalAt: new Date(),
          refusalCode: "insufficient_credits",
        })
      )
    ).resolves.toBeDefined();
    await expect(
      db.insert(generationAttempts).values(
        attemptFor(pA1, wsA, "att_rec", {
          state: "recovery_required",
          vendorStartedAt: new Date(),
          terminalAt: new Date(),
        })
      )
    ).resolves.toBeDefined();
  });

  it("R14: a generation cannot name another profile's attempt, or a different mode than it was claimed for", async () => {
    await db.insert(generationAttempts).values(attemptFor(pA2, wsA, "att_sib"));
    // The SIBLING's attempt, from a profile in the SAME workspace — the axis a
    // workspace-only FK would miss entirely.
    await expect(
      db.insert(generations).values(generationFor(pA1, wsA, "att_sib"))
    ).rejects.toThrow();

    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_mode"));
    // The mode the claim was priced and tier-gated for is the mode the record
    // must carry — a hookSet claim cannot settle as a fullScript generation.
    await expect(
      db
        .insert(generations)
        .values(generationFor(pA1, wsA, "att_mode", { mode: "fullScript" }))
    ).rejects.toThrow();
    // NON-VACUITY: the matching mode lands.
    await expect(
      db.insert(generations).values(generationFor(pA1, wsA, "att_mode"))
    ).resolves.toBeDefined();
    // ...and a generation with no attempt at all is refused, which is what
    // "the claim is committed BEFORE outbound HTTP" costs a writer.
    await expect(
      db.insert(generations).values(generationFor(pA1, wsA, "att_never_claimed"))
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------- the record

  it("a stored generation must be either a usable output or a stated refusal — never half of one", async () => {
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_out"));
    const REFUSED: [string, Record<string, unknown>][] = [
      ["usable with no output", { output: null }],
      ["usable with no weakest point", { weakestPoint: null }],
      ["usable with a blank weakest point", { weakestPoint: "   " }],
      [
        "usable carrying a refusal reason",
        { refusalReason: "everything died" },
      ],
      [
        "an honest refusal that still leaked the output",
        {
          outcome: "honest_refusal",
          refusalReason: "every hook broke your own kill rules",
          weakestPoint: null,
        },
      ],
      [
        "an honest refusal that says nothing",
        { outcome: "honest_refusal", output: null, weakestPoint: null },
      ],
      [
        "an honest refusal whose reason is blank",
        {
          outcome: "honest_refusal",
          output: null,
          weakestPoint: null,
          refusalReason: "\n ",
        },
      ],
      ["a second automatic rewrite", { rewriteCount: 2 }],
      ["a negative rewrite count", { rewriteCount: -1 }],
    ];
    for (const [label, over] of REFUSED) {
      await expect(
        db.insert(generations).values(generationFor(pA1, wsA, "att_out", over)),
        label + " was accepted"
      ).rejects.toThrow();
    }
    // NON-VACUITY, both shapes: the usable one and the honest refusal REQ-C03
    // says is the product working. They need separate attempts, because one
    // attempt settles into exactly one generation.
    await expect(
      db.insert(generations).values(generationFor(pA1, wsA, "att_out", { rewriteCount: 1 }))
    ).resolves.toBeDefined();
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_out2"));
    await expect(
      db.insert(generations).values(
        generationFor(pA1, wsA, "att_out2", {
          outcome: "honest_refusal",
          output: null,
          weakestPoint: null,
          refusalReason:
            "every hook broke a rule you wrote, and the rewrite broke one too — here is a sharper angle",
        })
      )
    ).resolves.toBeDefined();
  });

  it("R14: ON UPDATE RESTRICT — a settled attempt's identity cannot be rewritten under its generation", async () => {
    // THE ONE PIECE OF R14's "IMMUTABLE" THE DATABASE HOLDS ON ITS OWN, and
    // the file's comment claims it, so it is asserted here rather than left as
    // prose. Everything else about immutability (the payload hash, the
    // timestamps) is writer discipline held by `tests/table-writers.test.ts`,
    // which is stated as a limit in `generation-schema.ts` rather than implied
    // to be a constraint.
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_imm"));
    const [row] = await db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.attemptId, "att_imm"));
    // BEFORE a generation exists, the identity is still editable — stated so
    // the assertion below is a statement about the FK rather than about the
    // column, and so the narrowness of the guarantee is on the record.
    await expect(
      db
        .update(generationAttempts)
        .set({ mode: "caption" })
        .where(eq(generationAttempts.id, row.id))
    ).resolves.toBeDefined();
    await db
      .update(generationAttempts)
      .set({ mode: "hookSet" })
      .where(eq(generationAttempts.id, row.id));

    await db.insert(generations).values(generationFor(pA1, wsA, "att_imm"));
    for (const [label, patch] of [
      ["the attempt id", { attemptId: "att_imm_renamed" }],
      ["the mode", { mode: "fullScript" }],
      ["the profile", { profileId: pA2 }],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db
          .update(generationAttempts)
          .set(patch as never)
          .where(eq(generationAttempts.id, row.id)),
        label + " was rewritten under a stored generation"
      ).rejects.toThrow();
    }
    // ...and the STATE still moves, which is the whole reason this table is
    // not append-only: a RESTRICT that froze the state machine would be the
    // control becoming the outage.
    await expect(
      db
        .update(generationAttempts)
        .set({ state: "refused", terminalAt: new Date(), refusalCode: "post_call_debit" })
        .where(eq(generationAttempts.id, row.id))
    ).resolves.toBeDefined();
  });

  it("R14c: one terminal generation per attempt — a second cannot be minted", async () => {
    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_one"));
    await db.insert(generations).values(generationFor(pA1, wsA, "att_one"));
    await expect(
      db.insert(generations).values(generationFor(pA1, wsA, "att_one"))
    ).rejects.toThrow();
  });

  // ------------------------------------------------------------------ R9a

  it("R9a: a later brain edit and a later activation cannot rewrite a stored generation's explanation", async () => {
    // The activation the generation ran under, with a real Voice document id
    // recorded on it.
    const [voiceV1] = await db
      .insert(brainDocs)
      .values({
        profileId: pA1,
        workspaceId: wsA,
        kind: "voice",
        version: 1,
        content: { register: "dry, second person" },
        reason: "Version 1: you edited this document.",
        sourceEvidence: [
          {
            field: "/register",
            quote: "c",
            inputId: "00000000-0000-4000-8000-000000000001",
            startUtf16: 0,
            endUtf16: 1,
          },
        ],
      })
      .returning();
    const [activation] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId: pA1, workspaceId: wsA, voiceDocId: voiceV1.id })
      .returning();

    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_hist"));
    const [generation] = await db
      .insert(generations)
      .values(
        generationFor(pA1, wsA, "att_hist", { brainActivationId: activation.id })
      )
      .returning();

    // TIME PASSES: the creator edits their Voice (a NEW version, because
    // `brain_docs` is append-only) and activates it, which APPENDS a second
    // coherent snapshot rather than rewriting the first.
    const [voiceV2] = await db
      .insert(brainDocs)
      .values({
        profileId: pA1,
        workspaceId: wsA,
        kind: "voice",
        version: 2,
        content: { register: "warm, first person plural" },
        reason: "Version 2: you edited this document.",
        sourceEvidence: [
          {
            field: "/register",
            quote: "c",
            inputId: "00000000-0000-4000-8000-000000000001",
            startUtf16: 0,
            endUtf16: 1,
          },
        ],
      })
      .returning();
    const [laterActivation] = await db
      .insert(brainActivationSnapshots)
      .values({ profileId: pA1, workspaceId: wsA, voiceDocId: voiceV2.id })
      .returning();
    expect(laterActivation.id).not.toBe(activation.id);

    // THE CLAIM, MEASURED: the generation still names the FIRST activation,
    // and that activation still names the FIRST voice version — so "which
    // brain wrote this" is answerable from the historical row alone, and the
    // answer did not move when the brain did.
    const [stored] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, generation.id));
    expect(stored.brainActivationId).toBe(activation.id);
    const [snapshotNow] = await db
      .select()
      .from(brainActivationSnapshots)
      .where(eq(brainActivationSnapshots.id, activation.id));
    expect(snapshotNow.voiceDocId).toBe(voiceV1.id);
    const [voiceNow] = await db
      .select()
      .from(brainDocs)
      .where(eq(brainDocs.id, voiceV1.id));
    expect(voiceNow.content).toEqual({ register: "dry, second person" });
    // NON-VACUITY: the edit really happened — the profile now has two
    // versions and two snapshots, so "nothing changed" is not why this passes.
    expect(
      (await db.select().from(brainDocs).where(eq(brainDocs.profileId, pA1))).length
    ).toBe(2);
  });

  // ------------------------------------------------------------------ R11

  it("R11: the completion text this table stores is the same text `usage_raw` refuses", async () => {
    // R11 is a REMINDER that the temptation exists, so the honest witness is
    // the PAIR, driven with ONE string: the output column takes it, and
    // `assertMeteringOnly` refuses the identical value one table over. Either
    // half alone would leave "output text lives here and never there" as two
    // separate facts nobody compared.
    const COMPLETION =
      "Hook 1: Ship it on a Friday. Hook 2: The deploy nobody wanted. Hook 3: [check]";

    await db.insert(generationAttempts).values(attemptFor(pA1, wsA, "att_r11"));
    const [stored] = await db
      .insert(generations)
      .values(
        generationFor(pA1, wsA, "att_r11", { output: { hooks: [COMPLETION] } })
      )
      .returning();
    expect((stored.output as { hooks: string[] }).hooks[0]).toBe(COMPLETION);

    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "gen_a" }),
      pA1
    );
    await expect(
      db.transaction((tx) =>
        writeCapabilities(scope).recordModelUsage(
          {
            attemptId: "att_r11",
            purpose: "generation",
            model: "claude-opus-5",
            tokensIn: 100,
            tokensOut: 200,
            usageRaw: { completion: COMPLETION },
            costMicroUsd: 1234n,
            costState: "estimated",
            resolvedTier: "free",
            promptBundleVersion: "pb-1",
            configVersion: 1,
            outcome: "succeeded",
            consumedIncludedBuild: true,
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(UsageRawError);
  });
});

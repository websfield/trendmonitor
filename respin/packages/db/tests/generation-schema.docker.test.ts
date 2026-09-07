// Slice 6 stage A — the three uniqueness invariants that are only invariants
// on REAL Postgres, plus the two tenancy refusals worth re-proving there.
//
// WHY THIS SUITE EXISTS SEPARATELY FROM `generation-schema.test.ts`. PGlite is
// a SINGLE CONNECTION, so it cannot hold two transactions open at once and its
// "race" is a sequence. Every claim below is about what happens when two
// connections try the same thing at the same time, which is precisely the case
// a read-then-write in application code gets wrong and a unique index gets
// right — the distinction `credit_ledger`'s five existing partial uniques were
// each added for, and the one `packages/credits/tests/inference-race.docker.test.ts`
// records PGlite being unable to catch.
//
// The three:
//   R14  — one durable claim per `attempt_id`, so two clicks cannot both go on
//          to execute the vendor sequence.
//   R14c — one debit per attempt, via the EXISTING
//          `credit_ledger_inference_debit_uq`. Stage A's decision, made
//          explicit here rather than left for stage C to discover: a
//          generation debit uses `ref_type = 'inference'` and
//          `ref_id = attempt_id`, so the constraint that already protects the
//          onboarding debit protects this one too. If a later slice moves
//          generation debits to a different `ref_type`, THIS TEST GOES RED,
//          which is the point of writing the decision as a test.
//   R17  — one Free allowance per workspace per calendar month, and — the half
//          a global index would break — a DIFFERENT workspace's grant for the
//          SAME month still lands.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uuidv7 } from "uuidv7";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import { creatorProfiles } from "../src/brain-schema";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.error(
    "[generation-schema.docker.test] SKIPPED — TEST_DATABASE_URL is not set. NOT PROVEN in this run: that migration 0020's three uniqueness invariants hold under REAL CONCURRENCY — one generation_attempts claim per attempt_id (R14), one credit_ledger debit per attempt via credit_ledger_inference_debit_uq (R14c), and one free_allowance grant per workspace per month while a SECOND workspace's grant for the same month still lands (R17). PGlite is single-connection, so its version of each is a sequence and would pass against an implementation with no index at all. Start the docker-compose DB and set TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const describeIfDocker = MAINTENANCE_URL ? describe : describe.skip;

describeIfDocker("slice 6 stage A: the generation substrate on real Postgres", () => {
  let db: Awaited<ReturnType<typeof createDockerTestDb>>["db"];
  let pool: Awaited<ReturnType<typeof createDockerTestDb>>["pool"];
  let wsA: string;
  let wsB: string;
  let pA1: string;
  let pA2: string;
  let pB: string;

  beforeAll(async () => {
    ({ db, pool } = await createDockerTestDb(
      MAINTENANCE_URL!,
      "respin_test_generation"
    ));
    await seedAuthUser(db, "gen_docker_a");
    await seedAuthUser(db, "gen_docker_b");
    wsA = (
      await ensureUserWorkspace(db, { authUserId: "gen_docker_a", name: "A" })
    ).workspace.id;
    wsB = (
      await ensureUserWorkspace(db, { authUserId: "gen_docker_b", name: "B" })
    ).workspace.id;
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
  });

  afterAll(async () => {
    await pool.end();
  });

  /**
   * TWO CONNECTIONS, ONE KEY. Both open a transaction and attempt the same
   * insert; the first commits, and the second — which has been BLOCKING on the
   * unique index the whole time, which is the behaviour under test — is
   * released and refused.
   *
   * Returns the second connection's outcome so each case can assert on it,
   * rather than swallowing it here: "the second one failed" and "the second
   * one failed FOR THIS REASON" are different claims, and a test that only
   * makes the first would pass on a NOT NULL violation in a broken fixture.
   */
  async function raceOneKey(
    statement: string,
    firstParams: unknown[],
    secondParams: unknown[]
  ): Promise<{ constraint?: string; code?: string } | "both succeeded"> {
    const c1 = await pool.connect();
    const c2 = await pool.connect();
    try {
      await c1.query("BEGIN");
      await c2.query("BEGIN");
      await c1.query(statement, firstParams);
      // THE HANDLER IS ATTACHED IN THE SAME EXPRESSION THAT CREATES THE
      // PROMISE, and that is the whole point of the shape below.
      //
      // The previous version held a bare `c2.query(...)` promise and did not
      // await it until after `await c1.query("COMMIT")`. That await yields to
      // the event loop; c1's COMMIT is exactly what releases the lock and lets
      // c2's insert conflict, so `second` REJECTED WITH NO HANDLER ATTACHED and
      // Node emitted `unhandledRejection`. The later `await second` then caught
      // it, so every test still PASSED while the suite exited non-zero — 2352
      // green tests and a red gate, reported as `duplicate key value violates
      // unique constraint "credit_ledger_free_allowance_uq"`.
      //
      // Settling into a tagged VALUE rather than leaving a rejection in flight
      // means there is no window in which the promise is unhandled, whatever
      // the interleaving. A racing helper whose whole job is to make one side
      // fail must own that failure from the instant it can happen.
      const second = c2
        .query(statement, secondParams)
        .then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error })
        );
      await c1.query("COMMIT");
      const settled = await second;
      if (settled.ok) {
        await c2.query("COMMIT");
        return "both succeeded";
      }
      const e = settled.error as { constraint?: string; code?: string };
      return { constraint: e.constraint, code: e.code };
    } finally {
      await c1.query("ROLLBACK").catch(() => undefined);
      await c2.query("ROLLBACK").catch(() => undefined);
      c1.release();
      c2.release();
    }
  }

  const CLAIM = `INSERT INTO generation_attempts
      (id, profile_id, workspace_id, attempt_id, purpose, mode, payload_sha256)
      VALUES ($1, $2, $3, $4, 'generation', 'hookSet', $5)`;

  it("R14: two connections claiming one attempt_id — exactly one claim exists", async () => {
    const attemptId = "att_race_" + uuidv7();
    const outcome = await raceOneKey(
      CLAIM,
      [uuidv7(), pA1, wsA, attemptId, "a".repeat(64)],
      // A DIFFERENT payload, deliberately: R14's "same attempt_id + different
      // payload refuses" must not depend on the payloads matching, and a
      // second connection that inserted a second claim would leave two rows
      // whose only difference is the hash — with nothing to say which one the
      // vendor sequence belongs to.
      [uuidv7(), pA1, wsA, attemptId, "b".repeat(64)]
    );
    expect(outcome).not.toBe("both succeeded");
    // EITHER attempt-uniqueness constraint is a pass here, and which one fires
    // is not a property worth pinning: the inline four-column table constraint
    // is checked before the separate index, so an identical (attempt, mode,
    // profile, workspace) duplicate is caught by it. The case below is the one
    // that can ONLY be caught by the global index — and naming both here
    // rather than asserting the one that happened to fire keeps this test from
    // going red for a reason that is not a defect.
    expect(
      [
        "generation_attempts_attempt_uq",
        "generation_attempts_attempt_mode_profile_workspace_uq",
      ],
      "the second claim was refused, but not by an attempt-uniqueness constraint"
    ).toContain((outcome as { constraint?: string }).constraint);
    const { rows } = await pool.query(
      "SELECT payload_sha256 FROM generation_attempts WHERE attempt_id = $1",
      [attemptId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload_sha256).toBe("a".repeat(64));
  });

  it("R14: the GLOBAL attempt index is what catches a claim the four-column constraint cannot see", async () => {
    // THE POPULATION THE INLINE CONSTRAINT MISSES, stated as cases rather than
    // left implied. `(attempt_id, mode, profile_id, workspace_id)` is unique,
    // so it says nothing at all about the same attempt id arriving under a
    // different mode, profile or workspace — and each of those is a second
    // claim on one attempt, which is exactly what
    // `credit_ledger_inference_debit_uq` (global on `(ref_type, ref_id)`)
    // would then refuse to debit twice. Without the global index here the two
    // tables would disagree about what one attempt is: the claim table would
    // hold two rows and the ledger would pay one of them.
    const attemptId = "att_global_" + uuidv7();
    await pool.query(CLAIM, [uuidv7(), pA1, wsA, attemptId, "a".repeat(64)]);
    for (const [label, profileId, workspaceId, mode] of [
      ["another workspace", pB, wsB, "hookSet"],
      ["a sibling profile", pA2, wsA, "hookSet"],
      ["a different mode", pA1, wsA, "fullScript"],
    ] as const) {
      await expect(
        pool.query(
          `INSERT INTO generation_attempts
             (id, profile_id, workspace_id, attempt_id, purpose, mode, payload_sha256)
             VALUES ($1, $2, $3, $4, 'generation', $5, $6)`,
          [uuidv7(), profileId, workspaceId, attemptId, mode, "b".repeat(64)]
        ),
        label + " was allowed a second claim on one attempt id"
      ).rejects.toMatchObject({ constraint: "generation_attempts_attempt_uq" });
    }
  });

  const DEBIT = `INSERT INTO credit_ledger
      (id, workspace_id, delta, kind, ref_type, ref_id, created_at)
      VALUES ($1, $2, -25, 'debit', 'inference', $3, now())`;

  it("R14c: two connections debiting one generation attempt — exactly one debit", async () => {
    // The attempt id is the ledger's `ref_id`, which is what makes the
    // EXISTING inference index the generation debit's protection too.
    const attemptId = "att_debit_" + uuidv7();
    await pool.query(CLAIM, [uuidv7(), pA1, wsA, attemptId, "c".repeat(64)]);
    const outcome = await raceOneKey(
      DEBIT,
      [uuidv7(), wsA, attemptId],
      [uuidv7(), wsA, attemptId]
    );
    expect(outcome).not.toBe("both succeeded");
    expect((outcome as { constraint?: string }).constraint).toBe(
      "credit_ledger_inference_debit_uq"
    );
    const { rows } = await pool.query(
      "SELECT id FROM credit_ledger WHERE ref_type = 'inference' AND ref_id = $1",
      [attemptId]
    );
    expect(rows, "one attempt was charged twice").toHaveLength(1);
  });

  const FREE_GRANT = `INSERT INTO credit_ledger
      (id, workspace_id, delta, kind, ref_type, ref_id, expires_at, created_at)
      VALUES ($1, $2, 25, 'grant', 'free_allowance', $3, now() + interval '1 month', now())`;

  it("R17: two concurrent first balance reads mint ONE monthly allowance", async () => {
    const period = "2026-08";
    const outcome = await raceOneKey(
      FREE_GRANT,
      [uuidv7(), wsA, period],
      [uuidv7(), wsA, period]
    );
    expect(outcome).not.toBe("both succeeded");
    expect((outcome as { constraint?: string }).constraint).toBe(
      "credit_ledger_free_allowance_uq"
    );
    const { rows } = await pool.query(
      "SELECT id FROM credit_ledger WHERE ref_type = 'free_allowance' AND workspace_id = $1 AND ref_id = $2",
      [wsA, period]
    );
    expect(rows, "a Free workspace was granted 50 credits in one month").toHaveLength(1);
  });

  it("R17: a SECOND workspace's grant for the SAME month still lands", async () => {
    // The half a global `(ref_type, ref_id)` index — the shape all five
    // siblings use — would break. Those key on Stripe object ids, which are
    // globally unique; `ref_id` here is the period key '2026-08', which every
    // workspace on the platform mints. A global index would let the first Free
    // workspace to derive a balance in a month take the key and refuse every
    // other workspace's grant for the rest of it. This is the non-vacuity for
    // the case above: it fails only if the index is scoped correctly.
    await expect(
      pool.query(FREE_GRANT, [uuidv7(), wsB, "2026-08"])
    ).resolves.toBeDefined();
    // ...and the SAME workspace in a DIFFERENT month is a different key, which
    // is what makes it a MONTHLY allowance rather than a one-off.
    await expect(
      pool.query(FREE_GRANT, [uuidv7(), wsB, "2026-09"])
    ).resolves.toBeDefined();
    // ...while a repeat of an already-minted (workspace, month) is refused
    // even with no concurrency at all.
    await expect(
      pool.query(FREE_GRANT, [uuidv7(), wsB, "2026-08"])
    ).rejects.toMatchObject({ constraint: "credit_ledger_free_allowance_uq" });
  });

  it("R17: a free_allowance row with no period key is refused — NULLs do not slip past the index", async () => {
    // NULLs are DISTINCT in a unique index, so without
    // `credit_ledger_free_allowance_ref` a writer that forgot the period key
    // would mint an unlimited number of 25-credit grants and the index would
    // see nothing wrong — the same NULL-bypass `credit_ledger_expiry_ref`
    // exists to close for the expiry index. Proved by attempting the bypass
    // TWICE, because one refused insert is also what a NOT NULL column would
    // produce; the point is that the CHECK is what stands between the writer
    // and a second grant.
    for (const attempt of [1, 2]) {
      await expect(
        pool.query(
          `INSERT INTO credit_ledger
             (id, workspace_id, delta, kind, ref_type, ref_id, expires_at, created_at)
             VALUES ($1, $2, 25, 'grant', 'free_allowance', NULL, now() + interval '1 month', now())`,
          [uuidv7(), wsA]
        ),
        `bypass attempt ${attempt} was accepted`
      ).rejects.toMatchObject({ constraint: "credit_ledger_free_allowance_ref" });
    }
    // NON-VACUITY: a NULL `ref_id` is genuinely legal on this table for any
    // OTHER row, so the refusal above is about the free-allowance rule rather
    // than about the column.
    await expect(
      pool.query(
        `INSERT INTO credit_ledger (id, workspace_id, delta, kind, reason_code, created_at)
           VALUES ($1, $2, 5, 'adjust', 'goodwill', now())`,
        [uuidv7(), wsA]
      )
    ).resolves.toBeDefined();
  });

  it("R9: the composite FK refuses a cross-parented row on real Postgres too", async () => {
    // MATCH SIMPLE is the DATABASE's semantics, not drizzle's, so the tenancy
    // refusal is re-proved against the engine that will actually run it.
    await expect(
      pool.query(CLAIM, [uuidv7(), pA1, wsB, "att_x_" + uuidv7(), "d".repeat(64)])
    ).rejects.toMatchObject({
      constraint: "generation_attempts_profile_workspace_fk",
    });
    await expect(
      pool.query(CLAIM, [uuidv7(), pB, wsA, "att_y_" + uuidv7(), "d".repeat(64)])
    ).rejects.toMatchObject({
      constraint: "generation_attempts_profile_workspace_fk",
    });
  });

  it("R9: UNIQUE (id, profile_id, workspace_id) is a usable same-tenant FK target on real Postgres", async () => {
    const attemptId = "att_fk_" + uuidv7();
    await pool.query(CLAIM, [uuidv7(), pA1, wsA, attemptId, "e".repeat(64)]);
    const generationId = uuidv7();
    await pool.query(
      `INSERT INTO generations
        (id, profile_id, workspace_id, attempt_id, mode, brain_activation_id,
         request, model, prompt_bundle_version, config_version, outcome, output,
         weakest_point, kill_test)
       VALUES ($1, $2, $3, $4, 'hookSet', $5, '{}'::jsonb, 'claude-opus-5', 'pb-1', 1,
               'usable', '{"hooks":[]}'::jsonb, 'you have logged no results yet',
               '{}'::jsonb)`,
      [generationId, pA1, wsA, attemptId, uuidv7()]
    );
    // What slice 7's lineage FK and slice 9's results FK will do, done now, so
    // "the unique constraint exists" is proved by USING it rather than by
    // reading pg_constraint — the migration-0011 defect was a constraint that
    // existed and existed too late.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE TABLE slice7_probe (
        id uuid PRIMARY KEY,
        generation_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        workspace_id uuid NOT NULL,
        CONSTRAINT slice7_probe_generation_fk
          FOREIGN KEY (generation_id, profile_id, workspace_id)
          REFERENCES generations (id, profile_id, workspace_id)
          ON DELETE CASCADE
      )`);
      await expect(
        client.query("INSERT INTO slice7_probe VALUES ($1, $2, $3, $4)", [
          uuidv7(),
          generationId,
          pA1,
          wsA,
        ])
      ).resolves.toBeDefined();
      // The SIBLING profile in the SAME workspace naming the same generation
      // is refused, which is the whole reason the target is composite.
      await expect(
        client.query("INSERT INTO slice7_probe VALUES ($1, $2, $3, $4)", [
          uuidv7(),
          generationId,
          pA2,
          wsA,
        ])
      ).rejects.toMatchObject({ constraint: "slice7_probe_generation_fk" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

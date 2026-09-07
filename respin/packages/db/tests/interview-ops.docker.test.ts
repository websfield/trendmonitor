// slice 3b, post-gate self-review finding: `saveInterviewDraft` was the ONE
// brain-affecting write in `interview-ops.ts` with no advisory lock, while
// every sibling (`submitInterview`, `writeBrainDoc`, `confirmBrainDocFields`,
// `activateBrainDoc`) takes the SAME `brain:{workspace}:{profile}` lock as
// their first statement. Found by a fresh adversarial read during this
// slice's mutation-planting pass, not by the original author. This suite
// proves the fix on real Postgres — a PGlite version cannot express two
// transactions interleaved (single connection), so it would pass against the
// broken (unlocked) implementation too, which is worse than no test
// (`activate.docker.test.ts`'s own precedent for why this class of proof
// needs real Postgres).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { creatorProfiles } from "../src/brain-schema";
import { onboardingInterviewDrafts } from "../src/onboarding-schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import { withWorkspace } from "../src/with-workspace";
import { saveInterviewDraft } from "../src/interview-ops";
import { eq } from "drizzle-orm";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.error(
    "[interview-ops.docker.test] SKIPPED — TEST_DATABASE_URL is not set. NOT PROVEN in this run: that saveInterviewDraft's advisory lock genuinely serialises two concurrent patches for the same profile, and that both patches' fields survive rather than one being lost to a race on `existingAnswers`. Start the docker-compose DB and set TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

describe.skipIf(!MAINTENANCE_URL)(
  "saveInterviewDraft's advisory lock, on real Postgres",
  () => {
    let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
    let workspaceId: string;
    let profileId: string;

    beforeAll(async () => {
      harness = await createDockerTestDb(
        MAINTENANCE_URL as string,
        "respin_test_interviewops"
      );
      const { db } = harness;
      await seedAuthUser(db, "interview_race_user", "interview_race@test.dev");
      workspaceId = (
        await ensureUserWorkspace(db, {
          authUserId: "interview_race_user",
          name: "R",
        })
      ).workspace.id;
      const [p] = await db
        .insert(creatorProfiles)
        .values({ workspaceId, displayName: "R" })
        .returning();
      profileId = p.id;
    }, 60_000);

    afterAll(async () => {
      await harness?.pool.end();
    });

    it(
      "two concurrent saveInterviewDraft calls SERIALISE on the per-profile advisory lock, and NEITHER patch is lost",
      { timeout: 60_000 },
      async () => {
        // WHAT IS ASSERTED IS THE BLOCKING, not just the outcome — two saves
        // that simply both succeed prove nothing (they would succeed with the
        // lock and without it, since neither field collides on a unique
        // index). `pg_locks.granted = false` on the exact key is Postgres's
        // own statement that a transaction is genuinely waiting on this
        // lock, scoped to THIS database and THIS key so a neighbour Docker
        // suite's own advisory-lock contention cannot make the witness go
        // green for free (`activate.docker.test.ts`'s G-14 precedent, and
        // its round-3 correction after a cluster-wide-count first draft did
        // exactly that).
        const { db, pool } = harness;
        const scope = await withWorkspace(db, {
          authUserId: "interview_race_user",
        });

        const waitingOnAdvisory = async (
          key: string,
          timeoutMs: number
        ): Promise<boolean> => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const res = await pool.query(
              `SELECT count(*)::int AS n
                 FROM pg_locks
                WHERE locktype = 'advisory'
                  AND NOT granted
                  AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
                  AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
              [key]
            );
            if ((res.rows[0] as { n: number }).n > 0) return true;
            await new Promise((r) => setTimeout(r, 25));
          }
          return false;
        };

        // A) a raw connection holding the exact key `saveInterviewDraft`
        //    itself takes — not a second call in flight, so there is only
        //    ever one thing for the real call to be waiting ON.
        const a = await pool.connect();
        await a.query("BEGIN");
        await a.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`brain:${workspaceId}:${profileId}`]
        );

        // B) the real call. Every guard in it runs; only the lock can stop it.
        const patchB = saveInterviewDraft(db, scope, profileId, {
          positioning: { status: "decided", value: "short clips, one idea each" },
        });

        const blocked = await waitingOnAdvisory(
          `brain:${workspaceId}:${profileId}`,
          5_000
        );

        // While B is still blocked, create the draft row directly under A's
        // own transaction — no row exists yet for this fresh profile, so this
        // is A's own "first save" — the shape of the lost-update this lock
        // exists to prevent: without serialisation, B's `saveInterviewDraft`
        // would already have read "no existing row" before A commits, and
        // would then try to INSERT too (racing the unique index) or, if B
        // read second but merged against a stale snapshot, would silently
        // drop A's field on its own UPDATE.
        await a.query(
          `INSERT INTO onboarding_interview_drafts (id, profile_id, workspace_id, answers)
                VALUES ($1, $2, $3, '{"audience": {"status": "decided", "value": "early-career switchers"}}'::jsonb)`,
          [randomUUID(), profileId, workspaceId]
        );

        await a.query("COMMIT");
        a.release();
        await patchB;

        expect(
          blocked,
          "the concurrent saveInterviewDraft call never waited — the per-profile lock is not serialising, and the read-then-merge is unprotected"
        ).toBe(true);

        // Both fields survived: A's direct write (audience) AND B's patch
        // (positioning) — neither call's merge overwrote the other's,
        // because B's merge could only run AFTER A committed and released
        // the lock, so B's `existingAnswers` snapshot genuinely included A's
        // write.
        const [row] = await db
          .select()
          .from(onboardingInterviewDrafts)
          .where(eq(onboardingInterviewDrafts.profileId, profileId));
        const answers = row.answers as Record<string, unknown>;
        expect(answers.audience).toEqual({
          status: "decided",
          value: "early-career switchers",
        });
        expect(answers.positioning).toEqual({
          status: "decided",
          value: "short clips, one idea each",
        });
      }
    );
  }
);

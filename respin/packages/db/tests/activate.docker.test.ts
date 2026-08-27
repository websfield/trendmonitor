// AC-63 — THE COMMIT-ORDER RACE, which is the whole reason C-29 records an id
// set instead of comparing timestamps.
//
// WHY THIS CANNOT LIVE IN THE PGLITE SUITE. The defect needs two transactions
// interleaved: one that STARTS before a brain write and COMMITS after it.
// PGlite is a single connection, so it cannot hold two transactions open at
// once and cannot express the interleaving at all — a PGlite version of this
// test would pass against the broken implementation, which makes it worse than
// no test.
//
// THE DEFECT, precisely. `onboarding_inputs.created_at` is `defaultNow()`, and
// in Postgres `now()` is TRANSACTION START time, not statement time. So an
// input whose transaction began at T0 and committed at T2 carries `created_at =
// T0` while being invisible to anything reading at T1. A brain write at T1
// therefore does not see it — and any corpus rebuilt at activation with
// `created_at <= <the write's timestamp>` DOES include it, because T0 precedes
// T1. Activation then refuses a version the write had already cleared.
//
// That refusal is PERMANENT: `onboarding_inputs` is immutable with no delete
// path, brain versions are append-only, and the only way forward is a rebuild
// the creator pays for. A tighter timestamp does not remove the class — there
// is no timestamp that is both "what the write saw" and derivable later. The
// recorded id set is what removes it, because activation re-reads the exact set
// the write was judged against.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { onboardingInputs } from "../src/onboarding-schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
} from "../src/with-workspace";
import type { BrainDocReason } from "../src/brain-reason";
import {
  CHECK,
  enumerateClaimFields,
  readPointer,
} from "../src/brain-content";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.error(
    "[activate.docker.test] SKIPPED — TEST_DATABASE_URL is not set. NOT PROVEN in this run: AC-63, that an `onboarding_input` whose transaction STARTS BEFORE and COMMITS AFTER a brain write does not brick that version's activation. This is the interleaving `created_at` cannot see (now() is transaction-start time) and the one PGlite cannot express (single connection), so it is the only evidence that C-29's recorded id set removes the class rather than narrowing it. Start the docker-compose DB and set TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

const REASON: BrainDocReason = { code: "onboarding_inference" };

const STRATEGY = {
  audience: CHECK,
  positioning:
    "the practitioner who shows the work rather than the guru who sells the outcome",
  pillars: [CHECK],
};

const confirmAll = (content: unknown) =>
  enumerateClaimFields("strategy", content).map((pointer) => ({
    pointer,
    asPlaceholder: readPointer(content, pointer) === CHECK,
  }));

describe.skipIf(!MAINTENANCE_URL)("AC-63 on real Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let workspaceId: string;
  let profileId: string;

  beforeAll(async () => {
    // ITS OWN DATABASE NAME. Every Docker suite must have one: vitest runs
    // files in parallel and this harness drops schema public, so a shared name
    // means a neighbour resets your database mid-run.
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_activate"
    );
    const { db } = harness;
    await seedAuthUser(db, "race_user", "race_user@test.dev");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "race_user", name: "R" })
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
    "AC-63: an input that STARTS before and COMMITS after the write does not brick activation",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const scope = await ProfileScope.mint(
        db,
        await withWorkspace(db, { authUserId: "race_user" }),
        profileId
      );
      const caps = writeCapabilities(scope);

      const ownText = "I always open on the beat, never on the setup";
      const own = await caps.appendOnboardingInput({
        inputClass: "own_post",
        content: ownText,
      });
      const evidence = [
        {
          field: "/positioning",
          quote: ownText.slice(0, 12),
          inputId: own.id,
          startUtf16: 0,
          endUtf16: 12,
        },
      ];

      // ---- THE INTERLEAVING -------------------------------------------
      // A) open a transaction and INSERT a reference post that echoes the
      //    content we are about to store. Do NOT commit. Its `created_at` is
      //    stamped NOW — before the brain write below.
      let releaseA: () => void = () => {};
      const holdA = new Promise<void>((r) => {
        releaseA = r;
      });
      let committedA = false;
      const txA = db
        .transaction(async (tx) => {
          await tx.insert(onboardingInputs).values({
            profileId,
            workspaceId,
            inputClass: "reference",
            content: `${STRATEGY.positioning} and a good deal more text besides`,
            contentSha256: "0".repeat(64),
          });
          // Hold the transaction open across the brain write.
          await holdA;
          committedA = true;
        })
        .catch(() => {
          /* surfaced by the assertions below */
        });

      // Give A time to reach its INSERT and park.
      await new Promise((r) => setTimeout(r, 250));

      // B) the brain write, in its own transaction. It CANNOT see A's row.
      const doc = await db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY,
            sourceEvidence: evidence,
            reason: REASON,
          },
          tx
        )
      );
      expect(committedA, "A committed before the write — no race was staged").toBe(
        false
      );
      // The write cleared: A's row was invisible, so the recorded corpus omits it.
      expect(doc.referenceCorpusIds).toEqual([]);

      // C) NOW let A commit. Its `created_at` PRECEDES the brain doc's.
      releaseA();
      await txA;

      const [ref] = await db
        .select({
          id: onboardingInputs.id,
          createdAt: onboardingInputs.createdAt,
        })
        .from(onboardingInputs)
        .where(eq(onboardingInputs.inputClass, "reference"));
      const [written] = await db
        .select({ createdAt: brainDocs.createdAt })
        .from(brainDocs)
        .where(eq(brainDocs.id, doc.id));
      // THE PREMISE OF THE WHOLE TEST, asserted rather than assumed: a
      // `created_at`-bounded corpus WOULD have included this row. If this ever
      // stops holding, the test below proves nothing and must be re-derived.
      expect(
        ref.createdAt.getTime(),
        "the staged row does not predate the write — the race was not reproduced, so the assertion below is vacuous"
      ).toBeLessThanOrEqual(written.createdAt.getTime());

      // ---- THE ASSERTION ----------------------------------------------
      await db.transaction((tx) =>
        caps.confirmBrainDocFields(
          { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
          tx
        )
      );
      const active = await db.transaction((tx) =>
        caps.activateBrainDoc({ brainDocId: doc.id }, tx)
      );
      expect(
        active.status,
        "activation refused a version the write had cleared — the corpus was rebuilt, not re-read, and this version is now permanently unactivatable"
      ).toBe("active");
    }
  );

  it(
    "AC-63 non-vacuity: a `created_at`-bounded corpus DOES see the raced row",
    { timeout: 60_000 },
    async () => {
      // The counterfactual, run against the database rather than argued in a
      // comment: the rejected implementation really would have refused. Without
      // this the test above passes on a system where the race never happened.
      const { db } = harness;
      const [doc] = await db
        .select({ createdAt: brainDocs.createdAt })
        .from(brainDocs)
        .where(eq(brainDocs.profileId, profileId))
        .limit(1);
      const wouldHaveSeen = await db.execute(
        sql`SELECT count(*)::int AS n FROM onboarding_inputs
            WHERE profile_id = ${profileId}
              AND input_class = 'reference'
              AND created_at <= ${doc.createdAt}`
      );
      expect(
        (wouldHaveSeen.rows[0] as { n: number }).n,
        "the timestamp-bounded corpus saw nothing, so it would not have refused, so AC-63 proves nothing"
      ).toBeGreaterThan(0);
    }
  );
});

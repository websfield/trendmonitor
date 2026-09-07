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

  it(
    "G-14: two concurrent brain writes SERIALISE on the per-profile advisory lock",
    { timeout: 60_000 },
    async () => {
      // THE GAP THIS CLOSES, in the register's own words: "No test races two
      // `writeBrainDoc` calls; deleting the advisory lock leaves the suite
      // green." The lock guards a read-then-write with no natural
      // serialisation — the retained-span budget reads every retained span and
      // decides whether this write adds new material — and two writes of
      // DIFFERENT KINDS conflict on no unique index, because
      // `(profile_id, kind, version)` is per-kind. So both used to commit, the
      // "retained union <= ceiling" invariant broke, and the profile was
      // refused thereafter with nothing the creator could do about it.
      //
      // WHAT IS ASSERTED IS THE BLOCKING, not just the outcome, and that is
      // the difference between this case and a vacuous one. Two writes that
      // simply both succeed prove nothing: they succeed with the lock and
      // without it. `pg_locks.granted = false` on an advisory lock is
      // Postgres's own statement that one transaction is waiting on another,
      // which is exactly the claim the lock makes. Verified by planting the
      // lock's removal: this case goes red, the rest of the suite does not.
      const { db, pool } = harness;
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

      /**
       * Postgres's own answer to "is a transaction waiting on THIS advisory
       * lock?" — scoped to this database AND this key (tenancy gate round 3,
       * 2026-08-29): the first version counted ANY non-granted advisory lock
       * cluster-wide, and other Docker suites (`migrate-config.docker`,
       * `brain-concurrency`) contend their own advisory locks concurrently —
       * so under a full parallel run this witness could go green off a
       * NEIGHBOUR's contention even with the lock under test deleted. A
       * mutation-witness that can flake toward green is not a witness.
       * `classid`/`objid` are the high/low 32 bits of the bigint key, so
       * reconstructing them recovers exactly `hashtextextended(key, 0)`.
       */
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

      // A) A RAW CONNECTION HOLDING THE EXACT KEY, rather than a second
      //    `writeBrainDoc` held open inside a drizzle transaction.
      //
      //    Naming the key here is what makes the assertion specific: this is
      //    not "some advisory lock was contended", it is "the per-profile brain
      //    key was". It also keeps the test free of a second in-flight write,
      //    whose own internal reads would muddy which statement was waiting.
      const a = await pool.connect();
      await a.query("BEGIN");
      await a.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`brain:${workspaceId}:${profileId}`]
      );

      // B) the real write. Every guard in it runs; only the lock can stop it.
      const txB = db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            // DELIBERATELY NOT `STRATEGY.positioning`. The AC-63 case above
          // committed a reference post containing that exact sentence into
          // this same profile, so reusing it here is refused by the R-3 echo
          // bar — a correct refusal about the wrong subject, which would make
          // this case fail for a reason that has nothing to do with the lock.
          content: {
            ...STRATEGY,
            positioning: "short clips that end on an unresolved question",
          },
            sourceEvidence: evidence,
            reason: REASON,
          },
          tx
        )
      );

      const blocked = await waitingOnAdvisory(
        `brain:${workspaceId}:${profileId}`,
        5_000
      );
      await a.query("COMMIT");
      a.release();
      await txB;

      expect(
        blocked,
        "the second brain write never waited — the per-profile lock is not serialising, and the budget's read-then-write is unprotected"
      ).toBe(true);

      // ...and both writes landed, in an order, rather than one being lost.
      const rows = await db
        .select({ version: brainDocs.version })
        .from(brainDocs)
        .where(eq(brainDocs.profileId, profileId));
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(new Set(rows.map((r) => r.version)).size).toBe(rows.length);
    }
  );

  it(
    "confirm and activate SERIALISE on the same per-profile lock (slice 3)",
    { timeout: 60_000 },
    async () => {
      // THE GAP THE TENANCY GATE NAMED IN ROUND 2, and it is G-14's exact
      // shape one capability over: both decision acts are read-then-write with
      // a plain SELECT, so under READ COMMITTED activation can read ten
      // confirmed positions, a concurrent confirm can commit `[]`, and
      // activation's UPDATE — whose predicate tests only ids — proceeds. The
      // row ends `active`, stamped with a real human's `confirmed_by`, with
      // ZERO positions confirmed: a silent brain activation (R-8, REQ-B02).
      //
      // `brain_docs_active_is_confirmed` cannot catch it (it tests NOT NULL,
      // not coverage) and AC-26 is application-code only by design, which is
      // precisely why the two acts must serialise.
      //
      // THE BLOCKING IS WHAT IS ASSERTED, not the outcome — two acts that both
      // succeed prove nothing, because they succeed with the lock and without
      // it. Deleting either `tx.execute` left 1226 tests green, which is the
      // whole reason this case exists.
      const { db, pool } = harness;
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
      const doc = await db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: {
              ...STRATEGY,
              positioning: "clips that stop on the question rather than answer it",
            },
            sourceEvidence: [
              {
                field: "/positioning",
                quote: ownText.slice(0, 12),
                inputId: own.id,
                startUtf16: 0,
                endUtf16: 12,
              },
            ],
            reason: REASON,
          },
          tx
        )
      );

      // Scoped to this database and THIS key, same as its sibling above and
      // for the same reason (tenancy gate round 3, 2026-08-29): counting any
      // non-granted advisory lock cluster-wide lets a NEIGHBOUR suite's
      // contention turn this witness green with the lock under test deleted.
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

      // CONFIRM waits on the key.
      const holdA = await pool.connect();
      await holdA.query("BEGIN");
      await holdA.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`brain:${workspaceId}:${profileId}`]
      );
      const confirmTx = db.transaction((tx) =>
        caps.confirmBrainDocFields(
          { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
          tx
        )
      );
      const confirmBlocked = await waitingOnAdvisory(
        `brain:${workspaceId}:${profileId}`,
        5_000
      );
      await holdA.query("COMMIT");
      holdA.release();
      await confirmTx;
      expect(
        confirmBlocked,
        "confirmBrainDocFields never waited — its read-then-write is unprotected, and a concurrent confirm can empty the set activation is about to trust"
      ).toBe(true);

      // ACTIVATE waits on the same key.
      const holdB = await pool.connect();
      await holdB.query("BEGIN");
      await holdB.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`brain:${workspaceId}:${profileId}`]
      );
      const activateTx = db.transaction((tx) =>
        caps.activateBrainDoc({ brainDocId: doc.id }, tx)
      );
      const activateBlocked = await waitingOnAdvisory(
        `brain:${workspaceId}:${profileId}`,
        5_000
      );
      await holdB.query("COMMIT");
      holdB.release();
      const activated = await activateTx;
      expect(
        activateBlocked,
        "activateBrainDoc never waited — a concurrent confirm can empty confirmed_fields between its read and its write, producing an active brain nobody confirmed"
      ).toBe(true);
      expect(activated.status).toBe("active");
    }
  );

  it(
    "activateBrainDocCoherent: two concurrent activations of DIFFERENT kinds SERIALISE on the same per-profile lock, and the LATER one observes the EARLIER's committed snapshot (slice 3b, R8)",
    { timeout: 60_000 },
    async () => {
      // THE GAP THIS CLOSES: `activateBrainDocCoherent` calls `activateBrainDoc`
      // (which takes the per-profile advisory lock as ITS first statement) and
      // then reads every kind's current active id in the SAME transaction —
      // but "the lock protects the READ" is only true if the two concurrent
      // callers actually contend it. A version with no genuine race could pass
      // by two independent transactions each seeing a database with only their
      // own write in it, which proves nothing about ordering.
      //
      // A JS-TIMING HANDSHAKE WAS TRIED FIRST AND ROOT-CAUSED TO A FLAKE (this
      // session's immediately prior slice, 1 failure in 7 runs) — replaced here
      // with the SAME `pg_locks`-based advisory-lock witness this file's own
      // G-14 and "confirm and activate SERIALISE" cases already use, per
      // CLAUDE.md's 2026-08-30 lesson.
      const { db, pool } = harness;
      const scope = await ProfileScope.mint(
        db,
        await withWorkspace(db, { authUserId: "race_user" }),
        profileId
      );
      const caps = writeCapabilities(scope);

      // Two DIFFERENT kinds, untouched by every earlier case in this file
      // (which all use 'strategy') — so the two activations below are
      // genuinely independent claims, and any cross-kind field on the
      // snapshot is attributable to THIS race, not to fixture reuse.
      const voiceOwn = await caps.appendOnboardingInput({
        inputClass: "own_post",
        content: "a voice sample sentence, said the same way every single time",
      });
      const voiceContent = {
        register: voiceOwn.content.slice(0, 12),
        sentenceRhythm: CHECK,
        signatureMoves: [CHECK],
        avoid: [CHECK],
      };
      const voiceDoc = await db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: voiceContent,
            sourceEvidence: [
              {
                field: "/register",
                quote: voiceOwn.content.slice(0, 12),
                inputId: voiceOwn.id,
                startUtf16: 0,
                endUtf16: 12,
              },
            ],
            reason: REASON,
          },
          tx
        )
      );
      await db.transaction((tx) =>
        caps.confirmBrainDocFields(
          {
            brainDocId: voiceDoc.id,
            confirmedFields: enumerateClaimFields("voice", voiceContent).map((pointer) => ({
              pointer,
              asPlaceholder: readPointer(voiceContent, pointer) === CHECK,
            })),
          },
          tx
        )
      );

      const killtestOwn = await caps.appendOnboardingInput({
        inputClass: "own_post",
        content: "never promise a guaranteed result, that line is not who I am",
      });
      const killtestContent = {
        rules: [killtestOwn.content.slice(0, 12)],
      };
      const killtestDoc = await db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "killtest",
            content: killtestContent,
            sourceEvidence: [
              {
                field: "/rules/0",
                quote: killtestOwn.content.slice(0, 12),
                inputId: killtestOwn.id,
                startUtf16: 0,
                endUtf16: 12,
              },
            ],
            reason: REASON,
          },
          tx
        )
      );
      await db.transaction((tx) =>
        caps.confirmBrainDocFields(
          {
            brainDocId: killtestDoc.id,
            confirmedFields: enumerateClaimFields("killtest", killtestContent).map(
              (pointer) => ({
                pointer,
                asPlaceholder: readPointer(killtestContent, pointer) === CHECK,
              })
            ),
          },
          tx
        )
      );

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

      // A) A RAW CONNECTION HOLDING THE EXACT KEY — the same shape G-14 uses,
      //    so the second real call is the one genuinely forced to wait.
      const a = await pool.connect();
      await a.query("BEGIN");
      await a.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`brain:${workspaceId}:${profileId}`]
      );

      // B) the real coherent activation of VOICE. Every guard in it runs;
      //    only the lock can stop it.
      const txB = db.transaction((tx) =>
        caps.activateBrainDocCoherent({ brainDocId: voiceDoc.id }, tx)
      );
      const blocked = await waitingOnAdvisory(
        `brain:${workspaceId}:${profileId}`,
        5_000
      );
      await a.query("COMMIT");
      a.release();
      const first = await txB;

      expect(
        blocked,
        "activateBrainDocCoherent never waited on the per-profile lock — the snapshot read is unprotected"
      ).toBe(true);
      expect(first.doc.status).toBe("active");
      expect(first.snapshot.voiceDocId).toBe(voiceDoc.id);
      // FIRST TO COMMIT: killtest had not been activated yet, so its column
      // is still null on THIS snapshot.
      expect(first.snapshot.killtestDocId).toBeNull();

      // C) NOW the coherent activation of KILLTEST, sequenced strictly AFTER
      //    the first one committed (this suite proves the LOCK separately
      //    above; this half proves what a caller sees once it wins the
      //    lock — the coherence claim itself, not the mutual exclusion).
      const second = await db.transaction((tx) =>
        caps.activateBrainDocCoherent({ brainDocId: killtestDoc.id }, tx)
      );
      expect(second.snapshot.killtestDocId).toBe(killtestDoc.id);
      // THE COHERENCE CLAIM: the SECOND snapshot carries VOICE's id forward
      // UNCHANGED, because by the time this transaction ran, the first
      // activation was already committed and visible — no lost update, no
      // torn read across the two concurrent-then-sequential activations.
      expect(second.snapshot.voiceDocId).toBe(voiceDoc.id);

      // Exactly two snapshot rows exist for this profile — append-only, one
      // per activation, and BOTH callers' terminal state is exactly this.
      const rows = await db.execute(
        sql`SELECT voice_doc_id, killtest_doc_id FROM brain_activation_snapshots WHERE profile_id = ${profileId}`
      );
      expect(rows.rows).toHaveLength(2);
    }
  );

});

// AC-9 + AC-17 on REAL POSTGRES — the two M2a properties PGlite cannot prove.
//
// PGlite is single-session, so "two concurrent inserts of an active brain doc"
// is a serialized approximation there and proves nothing about the partial
// unique index. And `mode: "bigint"` is a node-postgres type-parser property:
// PGlite's driver and the pg driver decode int8 differently, so a round-trip
// that passes in-process says nothing about production.
//
// Without TEST_DATABASE_URL this suite SKIPS LOUDLY, naming exactly what was
// not proven. Its own database name — `respin_test_brain` — is required by the
// harness and must be unique per suite: vitest runs FILES in parallel and each
// suite starts by dropping schema public, so a shared name is a suite being
// reset mid-run by its neighbour.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles, frameworks } from "../src/brain-schema";
import { modelUsage, onboardingInputs } from "../src/onboarding-schema";
import { createRunSlotPool } from "../src/client";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import { editBrainDocument } from "../src/brain-ops";
import { openBrainExport } from "../src/export";
import {
  ExportBusyError,
  OnboardingInputLimitError,
  ProvenanceError,
} from "../src/errors";
import { POST_COUNT_MAX } from "../src/storage-limits";
import { pgRunSlots } from "../src/run-slot";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
} from "../src/with-workspace";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[brain-concurrency.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: (1) that the partial unique index on brain_docs " +
      "(profile_id, kind) WHERE status='active' actually holds under TRUE " +
      "concurrency, so 'at most one active version per kind' is a database " +
      "guarantee rather than a serialized approximation; and (2) that " +
      "model_usage.cost_micro_usd round-trips 9007199254740993 as a bigint " +
      "through node-postgres, which returns int8 as a STRING by default — the " +
      "one column a margin dashboard sums. Start the docker-compose DB and set " +
      "TEST_DATABASE_URL to postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

/** Migration 0012 made `source_evidence` NOT NULL with a non-empty CHECK. */
const RAW_EVIDENCE = [
  {
    quote: "c",
    inputId: "00000000-0000-4000-8000-000000000001",
    startUtf16: 0,
    endUtf16: 1,
    confidence: "high",
  },
];

describe.skipIf(!MAINTENANCE_URL)("M2a on real Postgres", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>>;
  let workspaceId: string;
  let profileId: string;

  beforeAll(async () => {
    harness = await createDockerTestDb(
      MAINTENANCE_URL as string,
      "respin_test_brain"
    );
    await seedAuthUser(harness.db, "brain_user", "brain_user@test.dev");
    workspaceId = (
      await ensureUserWorkspace(harness.db, {
        authUserId: "brain_user",
        name: "Brain",
      })
    ).workspace.id;
    const [p] = await harness.db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "P" })
      .returning();
    profileId = p.id;
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it(
    "AC-9: eight PARALLEL inserts of an active brain doc leave exactly one",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, (_, i) =>
          db.insert(brainDocs).values({
            profileId,
            workspaceId,
            kind: "voice",
            version: i + 1,
            content: { i },
            reason: "race",
            // Migration 0012: `source_evidence` is NOT NULL and non-empty, and
            // an `active` row must carry its confirmation columns.
            // MIGRATION 0015 (B-5) added `activated_at` to that CHECK, and this
            // fixture was one of the rows it caught: eight inserts that all
            // failed the constraint made the partial-unique assertion below
            // pass for the WRONG REASON — zero survivors reads as "one" to a
            // filter that only counts fulfilled, until the length is checked.
            // The racer must be a row the database would really accept, or the
            // index under test is never reached.
            sourceEvidence: RAW_EVIDENCE,
            status: "active",
            confirmedAt: new Date(),
            confirmedContentSha256: "0".repeat(64),
            activatedAt: new Date(),
          })
        )
      );
      // Distinct `version` per racer, so the (profile, kind, version) unique
      // index cannot be what refuses them — this is the PARTIAL index or
      // nothing. Without it every insert would land.
      expect(
        results.filter((r) => r.status === "fulfilled"),
        "more than one active version survived — the partial unique index is not enforcing REQ-C05"
      ).toHaveLength(1);

      const active = await db
        .select()
        .from(brainDocs)
        .where(eq(brainDocs.status, "active"));
      expect(active).toHaveLength(1);

      // NON-VACUITY, and it is the assertion that makes the count above mean
      // something: the index is PARTIAL, so any number of PROPOSED rows for the
      // same (profile, kind) is fine. A plain unique index would refuse these.
      await db.insert(brainDocs).values([
        { profileId, workspaceId, kind: "voice", version: 20, content: {}, reason: "p1", sourceEvidence: RAW_EVIDENCE },
        { profileId, workspaceId, kind: "voice", version: 21, content: {}, reason: "p2", sourceEvidence: RAW_EVIDENCE },
      ]);
      const proposed = await db
        .select()
        .from(brainDocs)
        .where(eq(brainDocs.status, "proposed"));
      expect(proposed.length).toBeGreaterThanOrEqual(2);
    }
  );

  it(
    "AC-17: cost_micro_usd round-trips 9007199254740993 through node-postgres",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      // 2^53 + 1. Chosen because 2^53 + 2 IS exactly representable as a double
      // and would pass vacuously under `mode: "number"`; this value is not, so
      // a number-mode column returns 9007199254740992 and the test fails.
      const value = 9007199254740993n;
      const [row] = await db
        .insert(modelUsage)
        .values({
          profileId,
          workspaceId,
          attemptId: "att_big",
          purpose: "onboarding_brain_build",
          model: "claude-opus-5",
          tokensIn: 1,
          tokensOut: 1,
          costMicroUsd: value,
          costState: "estimated",
          resolvedTier: "free",
          promptBundleVersion: "pb-1",
          configVersion: 1,
          outcome: "succeeded",
        })
        .returning();
      expect(typeof row.costMicroUsd).toBe("bigint");
      expect(row.costMicroUsd).toBe(value);

      const [read] = await db
        .select()
        .from(modelUsage)
        .where(eq(modelUsage.id, row.id));
      expect(read.costMicroUsd).toBe(value);
      // ...and the DATABASE agrees, so this is not two copies of the same
      // JS-side decode agreeing with each other.
      const raw = await db.execute(
        sql`select cost_micro_usd::text as v from model_usage where id = ${row.id}`
      );
      expect((raw.rows[0] as { v: string }).v).toBe("9007199254740993");
    }
  );

  it(
    "parallel sanctioned brain writes leave exactly one proposed version",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const workspaceScope = await withWorkspace(db, {
        authUserId: "brain_user",
        workspaceId,
      });
      const profileScope = await ProfileScope.mint(
        db,
        workspaceScope,
        profileId
      );
      const caps = writeCapabilities(profileScope);
      const input = await caps.appendOnboardingInput({
        inputClass: "own_post",
        content: "Direct",
      });
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () =>
          db.transaction((tx) =>
            caps.writeBrainDoc(
              {
                kind: "voice",
                content: {
                  register: "Direct",
                  sentenceRhythm: "[check]",
                  signatureMoves: [],
                  avoid: [],
                },
                sourceEvidence: [
                  {
                    field: "/register",
                    quote: input.content,
                    inputId: input.id,
                    startUtf16: 0,
                    endUtf16: input.content.length,
                  },
                ],
                reason: { code: "onboarding_inference" },
              },
              tx
            )
          )
        )
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
        "the profile advisory lock did not serialize every sanctioned writer"
      ).toHaveLength(6);

      const proposals = await db
        .select()
        .from(brainDocs)
        .where(
          and(
            eq(brainDocs.workspaceId, workspaceId),
            eq(brainDocs.profileId, profileId),
            eq(brainDocs.kind, "voice"),
            eq(brainDocs.status, "proposed")
          )
        );
      expect(
        proposals,
        "removing the proposal-supersede transition leaves every parallel write current"
      ).toHaveLength(1);
    }
  );

  it(
    "two edits from one base commit exactly one authored input and one proposal",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const [profile] = await db
        .insert(creatorProfiles)
        .values({ workspaceId, displayName: "Edit race" })
        .returning();
      const workspaceScope = await withWorkspace(db, {
        authUserId: "brain_user",
        workspaceId,
      });
      const profileScope = await ProfileScope.mint(db, workspaceScope, profile.id);
      const caps = writeCapabilities(profileScope);
      const input = await caps.appendOnboardingInput({
        inputClass: "own_post",
        content: "I write directly",
      });
      const base = await db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: {
              register: "Direct",
              sentenceRhythm: "[check]",
              signatureMoves: [],
              avoid: [],
            },
            sourceEvidence: [
              {
                field: "/register",
                quote: input.content,
                inputId: input.id,
                startUtf16: 0,
                endUtf16: input.content.length,
              },
            ],
            reason: { code: "onboarding_inference" },
          },
          tx
        )
      );

      const results = await Promise.allSettled([
        editBrainDocument(db, workspaceScope, profile.id, base.id, [
          { pointer: "/register", value: "Plain" },
        ]),
        editBrainDocument(db, workspaceScope, profile.id, base.id, [
          { pointer: "/register", value: "Candid" },
        ]),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ProvenanceError);

      const authored = await db
        .select()
        .from(onboardingInputs)
        .where(
          and(
            eq(onboardingInputs.workspaceId, workspaceId),
            eq(onboardingInputs.profileId, profile.id),
            eq(onboardingInputs.inputClass, "creator_authored")
          )
        );
      expect(authored).toHaveLength(1);
      const proposals = await db
        .select()
        .from(brainDocs)
        .where(
          and(
            eq(brainDocs.workspaceId, workspaceId),
            eq(brainDocs.profileId, profile.id),
            eq(brainDocs.kind, "voice"),
            eq(brainDocs.status, "proposed")
          )
        );
      expect(proposals).toHaveLength(1);
      expect(proposals[0].id).not.toBe(base.id);
    }
  );

  it(
    "concurrent direct input capabilities enforce the exact immutable row ceiling",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const [profile] = await db
        .insert(creatorProfiles)
        .values({ workspaceId, displayName: "Input race" })
        .returning();
      await db.insert(onboardingInputs).values(
        Array.from({ length: POST_COUNT_MAX - 1 }, (_, index) => ({
          workspaceId,
          profileId: profile.id,
          inputClass: "own_post" as const,
          content: `seed-${index}`,
          contentSha256: "0".repeat(64),
        }))
      );
      const workspaceScope = await withWorkspace(db, {
        authUserId: "brain_user",
        workspaceId,
      });
      const profileScope = await ProfileScope.mint(db, workspaceScope, profile.id);
      const caps = writeCapabilities(profileScope);
      const results = await Promise.allSettled([
        caps.appendOnboardingInput({ inputClass: "own_post", content: "last-a" }),
        caps.appendOnboardingInput({ inputClass: "own_post", content: "last-b" }),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(OnboardingInputLimitError);
      const rows = await db
        .select()
        .from(onboardingInputs)
        .where(
          and(
            eq(onboardingInputs.workspaceId, workspaceId),
            eq(onboardingInputs.profileId, profile.id)
          )
        );
      expect(rows).toHaveLength(POST_COUNT_MAX);
    }
  );

  it(
    "streams one repeatable-read snapshot across a page-boundary append",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const [profile] = await db
        .insert(creatorProfiles)
        .values({ workspaceId, displayName: "Export snapshot" })
        .returning();
      await db.insert(frameworks).values(
        Array.from({ length: 26 }, (_, index) => ({
          slug: `snapshot-${index}`,
          name: `Snapshot ${index}`,
          beats: [],
          whyItConverts: "snapshot",
          applicability: [],
          sourceReferences: [],
          evidenceEntries: [],
          testedCaveats: [],
          confidence: "unsupported" as const,
          saturation: "observed" as const,
          visibility: "private" as const,
          rightsBasis: "profile_private" as const,
          ownerProfileId: profile.id,
          workspaceId,
        }))
      );
      const workspaceScope = await withWorkspace(db, {
        authUserId: "brain_user",
        workspaceId,
      });
      const iterable = await openBrainExport(
        db,
        workspaceScope,
        profile.id,
        "json"
      );
      const iterator = iterable[Symbol.asyncIterator]();
      let json = "";
      for (;;) {
        const next = await iterator.next();
        if (next.done) break;
        json += next.value;
        if (next.value.includes('"slug":"snapshot-')) break;
      }
      await db.insert(frameworks).values({
        slug: "snapshot-late",
        name: "Snapshot late",
        beats: [],
        whyItConverts: "late",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "private",
        rightsBasis: "profile_private",
        ownerProfileId: profile.id,
        workspaceId,
      });
      for (;;) {
        const next = await iterator.next();
        if (next.done) break;
        json += next.value;
      }
      const parsed = JSON.parse(json) as {
        tables: { frameworks: Array<{ slug: string }> };
      };
      expect(parsed.tables.frameworks).toHaveLength(26);
      expect(new Set(parsed.tables.frameworks.map((row) => row.slug)).size).toBe(26);
      expect(parsed.tables.frameworks.map((row) => row.slug)).not.toContain(
        "snapshot-late"
      );
    }
  );

  it(
    "refuses a second control export slot across real Postgres sessions",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const [profile] = await db
        .insert(creatorProfiles)
        .values({ workspaceId, displayName: "Export busy" })
        .returning();
      const workspaceScope = await withWorkspace(db, {
        authUserId: "brain_user",
        workspaceId,
      });
      const slotPool = createRunSlotPool(harness.url, 2);
      const slots = pgRunSlots(slotPool);
      const held = await slots.acquire(workspaceScope.workspaceId, 1, "export");
      expect(held.granted).toBe(true);
      try {
        await expect(
          openBrainExport(db, workspaceScope, profile.id, "json", slots)
        ).rejects.toBeInstanceOf(ExportBusyError);
      } finally {
        if (held.granted) await held.lease.release();
        await slotPool.end();
      }
    }
  );

  it(
    "holds the export slot until an after-first-pull cancellation has rolled its transaction back",
    { timeout: 60_000 },
    async () => {
      const { db } = harness;
      const [profile] = await db
        .insert(creatorProfiles)
        .values({ workspaceId, displayName: "Export cancellation" })
        .returning();
      const workspaceScope = await withWorkspace(db, {
        authUserId: "brain_user",
        workspaceId,
      });
      const slotPool = createRunSlotPool(harness.url, 2);
      const slots = pgRunSlots(slotPool);
      const blocker = await harness.pool.connect();
      let blockerOpen = false;
      let cancelling: Promise<IteratorResult<string>> | undefined;
      try {
        await blocker.query("BEGIN");
        blockerOpen = true;
        await blocker.query("LOCK TABLE brain_docs IN ACCESS EXCLUSIVE MODE");

        const source = await openBrainExport(
          db,
          workspaceScope,
          profile.id,
          "json",
          slots
        );
        const iterator = source[Symbol.asyncIterator]();
        for (;;) {
          const next = await iterator.next();
          expect(next.done).toBe(false);
          if (next.value?.includes('"brain_docs":[')) break;
        }

        await expect
          .poll(
            async () => {
              const { rows } = await harness.pool.query(
                `SELECT count(*)::int AS n
                   FROM pg_locks l
                   JOIN pg_class c ON c.oid = l.relation
                  WHERE c.relname = 'brain_docs' AND l.granted = false`
              );
              return Number(rows[0]?.n ?? 0);
            },
            { timeout: 5_000 }
          )
          .toBeGreaterThan(0);

        let cancelSettled = false;
        cancelling = iterator.return!().then((result) => {
          cancelSettled = true;
          return result;
        });
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(
          cancelSettled,
          "reader cancellation resolved before the blocked producer transaction settled"
        ).toBe(false);
        await expect(
          openBrainExport(db, workspaceScope, profile.id, "json", slots)
        ).rejects.toBeInstanceOf(ExportBusyError);

        await blocker.query("COMMIT");
        blockerOpen = false;
        await cancelling;
        expect(cancelSettled).toBe(true);

        const afterRollback = await openBrainExport(
          db,
          workspaceScope,
          profile.id,
          "json",
          slots
        );
        await afterRollback[Symbol.asyncIterator]().return?.();
      } finally {
        if (blockerOpen) await blocker.query("ROLLBACK");
        await cancelling?.catch(() => undefined);
        blocker.release();
        await slotPool.end();
      }
    }
  );
});

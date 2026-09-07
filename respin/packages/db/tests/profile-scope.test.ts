// P1-P4 + the pause exemptions + the normalisation round-trip + the
// module-duplication case, for the PROFILE half of the tenancy cage
// (`docs/plans/respin-m2a-cage-plan.md`).
//
// Companion to `with-workspace.test.ts`, which owns the workspace half. Split
// by grain rather than appended, because the two suites seed different fixtures
// (this one needs profiles and their three child tables) and a single
// `beforeEach` serving both would make each suite pay for the other's rows.
//
// The shape is deliberately the same as the workspace suite's: one breach
// validator per accessor, one arg map, and a completeness assertion tying them
// to the accessor map itself (AC-3) — so an accessor added without a validator
// fails loudly instead of escaping to reviewer memory.
//
// TWO AXES, not one (AC-4). Round 1 of the plan gate showed the original
// fixture could not fail: it seeded workspace-B rows under a B profile, where a
// profile-only query returns only A's rows anyway. So every accessor is checked
// against BOTH a cross-workspace row (reachable only by dropping the composite
// FK inside a transaction, since the constraint makes it unrepresentable) and a
// same-workspace sibling profile.
import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import type { BrainDocReason } from "../src/brain-reason";
import {
  ContentSchemaError,
} from "../src/brain-content";
import { CHECK } from "../src/brain-content";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { pausePeriods } from "../src/billing-schema";
import { brainDocs, creatorProfiles, frameworks } from "../src/brain-schema";
import {
  CALLER_SUPPLIABLE_BRAIN_FIELDS,
  GUARDED_WRITE_FIELDS,
  CALLER_SUPPLIABLE_PROFILE_FIELDS,
} from "../src/with-workspace";

/** The `NoServerFields` shape, reachable for the compile-level assertions. */
type NoServerFieldsProbe = {
  [K in (typeof GUARDED_WRITE_FIELDS)[number]]?: never;
};
import {
  brainActivationSnapshots,
  firstBillableAttempts,
  modelUsage,
  onboardingInputs,
  onboardingInterviewDrafts,
} from "../src/onboarding-schema";
import {
  generationAttempts,
  generationFeedback,
  generations,
} from "../src/generation-schema";
import {
  autopsies,
  autopsyCacheClaims,
  trackedNiches,
  trendItems,
  trendSources,
  trendTranscripts,
} from "../src/trends-schema";
import { results } from "../src/results-schema";
import {
  promotionProposals,
  proposalEvidenceFeedback,
  proposalEvidenceResults,
} from "../src/promotion-schema";
import {
  COMPARISON_POPULATION_MAX,
  brainAssetSummary,
  PROFILE_EXPORT_TABLES,
  ProfileAccessError,
  ComparisonStratumError,
  ProfileScope,
  ProvenanceError,
  UsageRawError,
  withWorkspace,
  writeCapabilities,
  WorkspacePausedError,
  type ProfileExportTable,
  type ProfileWriteCapabilities,
} from "../src/with-workspace";


// Every fixture's reason is a CODE, not a sentence (C-42): `brain_docs.reason`
// is exported whole, so the stored text is server-rendered and no caller prose
// can reach the column.
const FIXTURE_REASON: BrainDocReason = { code: "creator_edit" };

// What a raw drizzle INSERT (bypassing the write capability) must put in the
// column: the rendered sentence, because that is what the capability stores.
const RENDERED_REASON = "Version 1: you edited this document.";

// Migration 0012 made `source_evidence` NOT NULL with a non-empty CHECK, and
// made an `active` row require its confirmation columns. A RAW insert (one that
// bypasses the write capability) therefore has to supply all of it — the DB
// does not check the entries against `onboarding_inputs`, which is
// `validateSourceEvidence`'s job, so a synthetic entry is enough here.
const RAW_EVIDENCE = [
  {
    field: "/register",
    quote: "c",
    inputId: "00000000-0000-4000-8000-000000000001",
    startUtf16: 0,
    endUtf16: 1,
  },
];
/**
 * Evidence for fixtures that go THROUGH `writeBrainDoc`. It must name a real
 * `onboarding_inputs` row of this profile, because `validateSourceEvidence`
 * checks the id, the offsets and that the quote is verbatim — so it is built
 * per test from the seeded input rather than being a constant.
 */
const evidenceFor = (inputId: string, content: string, field = "/register") => [
  {
    field,
    quote: content.slice(0, 7),
    inputId,
    startUtf16: 0,
    endUtf16: 7,
  },
];

let FIXTURE_EVIDENCE: ReturnType<typeof evidenceFor>;

/**
 * EVERY seeded input id, including the sibling profile's and the foreign
 * workspace's — what `onboardingInputsByIds` is driven with.
 *
 * MUTATED IN PLACE rather than reassigned: `accessorArgs` is built once at
 * collection time, before any `beforeEach` has run, so it captures this array
 * object and must see the ids through it. Reassigning would leave the args map
 * holding the empty original — and the accessor returns `[]` for an empty id
 * set BY DESIGN, so the test would pass while asking the accessor for nothing.
 */
const ALL_INPUT_IDS: string[] = [];

/**
 * EVERY seeded brain-doc id, including the sibling profile's and the foreign
 * workspace's — what `brainDocsByIds` is driven with, for the reason
 * `ALL_INPUT_IDS` exists one comment up: this accessor takes CALLER-SUPPLIED
 * ids, so the interesting question is what it does when asked for somebody
 * else's. `brain_activation_snapshots`' doc-id columns carry no FK, so a
 * snapshot really can name a document this profile does not own, and the scope
 * predicate is the only thing that refuses it.
 *
 * MUTATED IN PLACE for the same reason, and the same trap applies: the accessor
 * returns `[]` for an empty id set BY DESIGN, so a reassignment would leave the
 * args map asking for nothing and the test passing vacuously.
 */
const ALL_BRAIN_DOC_IDS: string[] = [];

/** One real proposal per profile, so the id-scoped review accessor is non-vacuous. */
const PROPOSAL_ID_BY_PROFILE = new Map<string, string>();

/**
 * The comparison stratum each profile's fixture result lives in (slice 9a).
 *
 * A PER-PROFILE MAP, and that is exactly why `comparableResults` cannot ride
 * the shared P4 loops: `accessorArgs` is ONE TUPLE PER ACCESSOR, built at
 * collection time, and this accessor's `metricDeclaredByDocIds` predicate names
 * `brain_docs` rows that are DIFFERENT for every profile - a static tuple
 * would return p1's rows on p1's run and NOTHING on the sibling's, which the
 * loop reads as "its validator would be vacuous". So it is skipped there, with
 * its own both-axes cases below, which is the arrangement `exportPage` already
 * uses and documents.
 *
 * MUTATED IN PLACE, the `ALL_BRAIN_DOC_IDS` rule: reassignment would leave any
 * closure built at collection time holding an empty map.
 */
const RESULT_STRATUM: Map<string, {
  platform: string;
  audienceClass: "organic" | "paid";
  metricKey: string;
  metricDeclaredByDocIds: readonly string[];
  observedFrom: Date;
  observedTo: Date;
}> = new Map();

/**
 * The stamps an `active` row must carry, per `brain_docs_active_is_confirmed`.
 *
 * `activatedAt` JOINED THIS IN SLICE 3 (B-5), and the widened CHECK caught the
 * omission on its first run: every fixture here inserted `status: "active"`
 * with a NULL `activated_at` — precisely the row B-5 says must not exist, in
 * twenty-one tests, none of which was about activation. That is the constraint
 * doing exactly what it was widened to do, on the same day it was widened, so
 * the fixture is corrected rather than the constraint relaxed.
 */
const RAW_CONFIRMED = {
  confirmedAt: new Date(),
  confirmedContentSha256: "0".repeat(64),
  activatedAt: new Date(),
};

// `writeBrainDoc` PARSES its content against the per-kind schema now (task 3),
// so a fixture going through the write capability must be schema-valid. These
// used to be `{}` and `{ v: 2 }` — which reached the assertion under test only
// because nothing on the write path looked at content at all.
// C-28 IS BUILT NOW, so a fixture cannot state a claim nothing cites. Every
// declared position is either cited by an evidence entry or written as
// `[check]` — which is exactly the shape a real inference produces when it only
// has support for some fields, so the fixtures got MORE realistic, not less.
const VOICE_CONTENT = {
  register: "dry, second person",
  sentenceRhythm: CHECK,
  signatureMoves: [CHECK],
  avoid: [CHECK],
};
const STRATEGY_CONTENT = {
  audience: "solo founders",
  positioning: CHECK,
  pillars: [CHECK],
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const sha256 = (s: string) =>
  createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");

/** A usage row's caller-supplied half, so each fixture names only what varies. */
const usageInput = (attemptId: string) => ({
  attemptId,
  // THE PURPOSE THE ACCESSOR IS ACTUALLY DRIVEN WITH. It read
  // "onboarding_brain_build" while `accessorArgs` passes "onboarding_brain",
  // so `countBillableAttempts` matched NO fixture row and returned 0 with the
  // cage intact, 0 with the profile predicate dropped, and 0 with no cage at
  // all — the cross-parented case could not discriminate (tenancy gate,
  // 2026-08-28, who ran all three). A scoping test whose fixture the query
  // cannot see is not a scoping test.
  purpose: "onboarding_brain",
  model: "claude-opus-5",
  tokensIn: 100,
  tokensOut: 200,
  usageRaw: { input_tokens: 100, output_tokens: 200 },
  costMicroUsd: 1234n,
  costState: "estimated" as const,
  resolvedTier: "free" as const,
  promptBundleVersion: "pb-1",
  configVersion: 1,
  outcome: "succeeded" as const,
  consumedIncludedBuild: true,
});

describe("ProfileScope — the profile tenancy cage", () => {
  let db: TestDb;
  let aWorkspaceId: string;
  let bWorkspaceId: string;
  let p1: string; // workspace A
  let p2: string; // workspace A — the SAME-workspace sibling
  let p3: string; // workspace B — the CROSS-workspace foreigner

  beforeEach(async () => {
    db = await createTestDb();
    ALL_INPUT_IDS.length = 0;
    ALL_BRAIN_DOC_IDS.length = 0;
    PROPOSAL_ID_BY_PROFILE.clear();
    RESULT_STRATUM.clear();
    await seedAuthUser(db, "user_a");
    await seedAuthUser(db, "user_b");
    aWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "user_a", name: "A" })
    ).workspace.id;
    bWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "user_b", name: "B" })
    ).workspace.id;

    const profiles = await db
      .insert(creatorProfiles)
      .values([
        { workspaceId: aWorkspaceId, displayName: "A-one" },
        { workspaceId: aWorkspaceId, displayName: "A-two" },
        { workspaceId: bWorkspaceId, displayName: "B-one" },
      ])
      .returning();
    p1 = profiles[0].id;
    p2 = profiles[1].id;
    p3 = profiles[2].id;

    // Rows for ALL THREE profiles, so every breach validator has something
    // foreign to find. A suite that proves isolation by returning nothing
    // proves nothing (the M1 phase-2 lesson, applied here).
    for (const [profileId, workspaceId] of [
      [p1, aWorkspaceId],
      [p2, aWorkspaceId],
      [p3, bWorkspaceId],
    ] as const) {
      const [ownInput] = await db
        .insert(onboardingInputs)
        .values({
          profileId,
          workspaceId,
          inputClass: "own_post",
          content: `content for ${profileId}`,
          contentSha256: sha256(`content for ${profileId}`),
        })
        .returning();
      ALL_INPUT_IDS.push(ownInput.id);
      // Captured so fixtures that go THROUGH `writeBrainDoc` can cite a real
      // input: `validateSourceEvidence` checks the id, the offsets and that the
      // quote is verbatim, so a constant would be refused.
      if (profileId === p1) {
        FIXTURE_EVIDENCE = evidenceFor(
          ownInput.id,
          `content for ${profileId}`
        );
      }
      // A REFERENCE input per profile, so `referenceCorpusAsOf`'s breach
      // validator is non-vacuous on BOTH axes: the P4 loop refuses an accessor
      // that returns nothing, precisely so a validator cannot pass by having
      // no rows to check. Without this the corpus accessor would be the one
      // cage member nobody actually tested.
      await db.insert(onboardingInputs).values({
        profileId,
        workspaceId,
        inputClass: "reference",
        content: `somebody else wrote this for ${profileId}`,
        contentSha256: sha256(`somebody else wrote this for ${profileId}`),
      });
      const [trendSource] = await db.insert(trendSources).values({
        kind: "submitted", externalId: `source_${profileId}`, sourceUrl: "https://example.test/source", profileId, workspaceId,
      }).returning();
      await db.insert(trackedNiches).values({
        profileId,
        workspaceId,
        niche: `tracked niche ${profileId}`,
      });
      const [trendItem] = await db.insert(trendItems).values({
        sourceId: trendSource.id, externalVideoId: `video_${profileId}`, niche: "business", title: "fixture",
        channelId: `channel_${profileId}`, videoViews: 200n, channelMedianRecentViews: "100.00000000",
        baselineSampleSize: 2, baselineObservationIds: ["a", "b"], baselineWindowStartsAt: new Date("2026-08-01"), baselineWindowEndsAt: new Date("2026-09-01"), sourcePublishedAt: new Date("2026-08-31"), outlierRatio: "2.00000000", rightsScope: "profile_private",
        profileId, workspaceId, transcriptState: "transcript_available", saturation: "unmeasured", saturationUnmeasuredReason: "incomplete_provenance",
      }).returning();
      await db.insert(trendTranscripts).values({
        trendItemId: trendItem.id, rightsScope: "profile_private", profileId, workspaceId,
        rightsBasis: "profile_private",
        content: `transcript ${profileId}`, contentDigest: `digest_${profileId}`, provenance: {},
      });
      await db.insert(autopsies).values({
        trendItemId: trendItem.id, contentDigest: `digest_${profileId}`, analysisVersion: "v1",
        rightsScope: "profile_private", profileId, workspaceId, status: "completed", analysis: {},
        rightsBasis: "profile_private",
      });
      await db.insert(autopsyCacheClaims).values({
        trendItemId: trendItem.id,
        contentDigest: `claim_digest_${profileId}`,
        analysisVersion: "v1",
        rightsScope: "profile_private",
        rightsBasis: "profile_private",
        profileId,
        workspaceId,
        cacheScopeKey: profileId,
        status: "pending",
      });
      const [voiceDoc] = await db
        .insert(brainDocs)
        .values({
          profileId,
          workspaceId,
          kind: "voice",
          version: 1,
          content: { note: profileId },
          reason: RENDERED_REASON,
          sourceEvidence: RAW_EVIDENCE,
          status: "active",
          ...RAW_CONFIRMED,
        })
        .returning();
      ALL_BRAIN_DOC_IDS.push(voiceDoc.id);
      // Slice 9a fix pass: a STRATEGY version per profile, so
      // `strategyMetricVersions` has rows on both axes. Its metric carries no
      // `key` — `metric.key` is `serverOwned` and stripped before storage, so a
      // fixture with one would be data the producer cannot produce (the
      // slice-9a BLOCK).
      const [strategyDoc] = await db.insert(brainDocs).values({
        profileId,
        workspaceId,
        kind: "strategy",
        version: 1,
        content: {
          metric: {
            label: "Followers",
            unit: "per 1k views",
            direction: "higher_is_better",
          },
        },
        reason: RENDERED_REASON,
        sourceEvidence: RAW_EVIDENCE,
      }).returning();
      await db.insert(modelUsage).values({
        profileId,
        workspaceId,
        ...usageInput(`att_${profileId}`),
      });
      // R-80: the claim `recordModelUsage` would have written for that row.
      // Inserted directly, like the usage row above it — this fixture builds
      // rows for all three profiles including the FOREIGN one, which the write
      // capability cannot do (it only ever writes inside its own cage), and the
      // P4 loops refuse an accessor that returns nothing.
      await db.insert(firstBillableAttempts).values({
        profileId,
        workspaceId,
        purpose: "onboarding_brain",
        attemptId: `att_${profileId}`,
      });
      await db.insert(onboardingInterviewDrafts).values({
        profileId,
        workspaceId,
        answers: {},
      });
      const [snapshot] = await db
        .insert(brainActivationSnapshots)
        .values({
          profileId,
          workspaceId,
        })
        .returning();
      // Slice 6 (stage A): the claim and the record, for ALL THREE profiles,
      // so `exportPage("generations")`'s branch has something foreign to leak.
      // The lifecycle is walked rather than short-circuited — the attempt is
      // inserted at `vendor_complete`, the generation is written, and only
      // then does the attempt move to `settled` — because
      // `generation_attempts_settled_has_generation` refuses a settled row
      // naming no generation and `generations_attempt_fk` refuses a generation
      // naming no attempt. Neither row can be written first in its final
      // state, which is the constraint pair doing its job on the fixture.
      const [attempt] = await db
        .insert(generationAttempts)
        .values({
          profileId,
          workspaceId,
          attemptId: `gen_att_${profileId}`,
          purpose: "generation",
          mode: "hookSet",
          payloadSha256: sha256(`payload for ${profileId}`),
          state: "vendor_complete",
          vendorStartedAt: new Date(),
          vendorCompletedAt: new Date(),
          // R14c: `generation_attempts_candidate_iff_vendor_complete` is an
          // EQUALITY, so this state cannot exist without the settlement input
          // it exists to hold. The fixture carries one for the same reason it
          // walks the lifecycle rather than short-circuiting it.
          candidate: { v: 1, outcome: "usable" },
        })
        .returning();
      const [generation] = await db
        .insert(generations)
        .values({
          profileId,
          workspaceId,
          attemptId: attempt.attemptId,
          mode: "hookSet",
          brainActivationId: snapshot.id,
          request: { idea: `idea for ${profileId}` },
          model: "claude-opus-5",
          promptBundleVersion: "pb-1",
          configVersion: 1,
          outcome: "usable",
          output: { hooks: [`hook for ${profileId}`] },
          weakestPoint: "no posted results yet, so nothing here is evidence about you",
          killTest: { rulesFired: [], rewritten: false },
        })
        .returning();
      await db
        .update(generationAttempts)
        .set({
          state: "settled",
          terminalAt: new Date(),
          generationId: generation.id,
          // ...and settling CONSUMES it: `generations` above is the record now.
          candidate: null,
        })
        .where(eq(generationAttempts.id, attempt.id));
      // `confidence: "unsupported"` because `evidenceEntries` is `[]` —
      // slice 7's `frameworks_confidence_matches_evidence` CHECK ties the two,
      // so a fixture claiming a rung its evidence does not support is now
      // UNSTORABLE. That is the R-29 property doing its job on the fixtures the
      // day it landed, exactly as B-5's widened CHECK did to twenty-one
      // fixtures in slice 3.
      await db.insert(frameworks).values({
        slug: `private-${profileId}`,
        name: `Private ${profileId}`,
        beats: [],
        whyItConverts: "Private fixture",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "private",
        rightsBasis: "profile_private",
        ownerProfileId: profileId,
        workspaceId,
      });
      // A SECOND private framework that IS recommendable, so
      // `eligibleFrameworks`' private arm is non-vacuous on both axes: the P4
      // loops refuse an accessor that returns nothing, and an approved,
      // non-retired, non-superseded row is the only kind that arm can return.
      await db.insert(frameworks).values({
        slug: `approved-private-${profileId}`,
        name: `Approved private ${profileId}`,
        beats: [],
        whyItConverts: "Approved private fixture",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "unsupported",
        saturation: "observed",
        visibility: "private",
        rightsBasis: "profile_private",
        curatorStatus: "approved",
        ownerProfileId: profileId,
        workspaceId,
      });
      // Slice 7 (R10): one feedback event per profile, so every
      // `generation_feedback` branch has something foreign to leak.
      const [feedbackRow] = await db.insert(generationFeedback).values({
        profileId,
        workspaceId,
        generationId: generation.id,
        reaction: "used_as_is",
        note: `feedback for ${profileId}`,
      }).returning();
      // Slice 9a (R5): one logged result per profile, so the `results`
      // accessor and the `results` export branch each have something foreign
      // to leak.
      //
      // INSERTED DIRECTLY, not through `recordResult` — this fixture builds
      // rows for all three profiles INCLUDING THE FOREIGN ONE, which the write
      // capability cannot do (it only ever writes inside its own cage), and the
      // P4 loops refuse an accessor that returns nothing. The same reason the
      // `model_usage` and `first_billable_attempts` rows above are direct.
      //
      // `metricDeclaredByDocIds` names this profile's Strategy document. The
      // composite FK proves the stored result and declaration share both
      // tenant axes; the scoped reader below must preserve those axes when it
      // accepts more than one tuple-equivalent declaration id.
      RESULT_STRATUM.set(profileId, {
        platform: "shorts",
        audienceClass: "organic",
        metricKey: "followers",
        metricDeclaredByDocIds: [strategyDoc.id],
        // A window that CONTAINS the row's, not one equal to it, so the
        // containment predicate is exercised rather than an equality that
        // would pass under either reading.
        observedFrom: new Date("2026-07-01"),
        observedTo: new Date("2026-09-01"),
      });
      const [resultRow] = await db.insert(results).values({
        profileId,
        workspaceId,
        generationId: generation.id,
        platform: "shorts",
        audienceClass: "organic",
        metricKey: "followers",
        metricDeclaredByDocId: strategyDoc.id,
        observedFrom: new Date("2026-08-01"),
        observedTo: new Date("2026-08-08"),
        treatmentKey: `|hookSet|${snapshot.id}|followers`,
        evidenceState: "quantified_self_reported",
        reachValue: "4000",
        reachDenominator: "1000",
      }).returning();
      const [proposal] = await db
        .insert(promotionProposals)
        .values({
          profileId,
          workspaceId,
          source: "results",
          targetKind: "performance_meta",
          targetPointer: "/rules/-",
          payload: { fixture: true },
          familyKey: `fixture:${profileId}`,
          evidenceDigest: sha256(`fixture:${profileId}`),
          strength: "early",
        })
        .returning();
      PROPOSAL_ID_BY_PROFILE.set(profileId, proposal.id);
      await db.insert(proposalEvidenceResults).values({
        proposalId: proposal.id,
        profileId,
        workspaceId,
        resultId: resultRow.id,
        role: "treatment",
      });
      const [feedbackProposal] = await db.insert(promotionProposals).values({
        profileId,
        workspaceId,
        source: "feedback",
        targetKind: "voice",
        targetPointer: "/avoid/-",
        payload: { value: "fixture" },
        familyKey: `feedback-fixture:${profileId}`,
        evidenceDigest: sha256(`feedback-fixture:${profileId}`),
        strength: "repeated",
        basisBrainDocId: voiceDoc.id,
      }).returning();
      await db.insert(proposalEvidenceFeedback).values({
        proposalId: feedbackProposal.id,
        profileId,
        workspaceId,
        feedbackId: feedbackRow.id,
      });
    }
  });

  /**
   * CLOSE THE IN-PROCESS DATABASE (9a-G1, 2026-09-04).
   *
   * `createTestDb()` constructs a `new PGlite()` per call and this file's
   * `beforeEach` calls it for EVERY test, so before this hook the suite held 45
   * live WASM heaps at once and released none — `grep -c 'close()'` on this
   * file returned 0. That is the recorded residue behind `9a-G1`, the birpc
   * 60 s worker timeout whose discriminator is "zero failing tests and exactly
   * one Errors line naming an RPC method": a worker starved by in-process WASM
   * cannot pump the message answering its own in-flight `onTaskUpdate`.
   *
   * `db.$client` is drizzle's handle on the driver it was constructed with, and
   * `profile-selection.test.ts` already closes its own PGlite — the API was
   * there, this file simply never reached for it because `createTestDb` does
   * not hand the client back.
   */
  afterEach(async () => {
    await (db as unknown as { $client?: { close?: () => Promise<void> } })
      .$client?.close?.();
  });

  const mintP1 = async () =>
    ProfileScope.mint(db, await withWorkspace(db, { authUserId: "user_a" }), p1);

  // ---------------------------------------------------------------- P1 / P2

  it("P1: a profile in another workspace is refused (ProfileAccessError)", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    await expect(ProfileScope.mint(db, scopeA, p3)).rejects.toBeInstanceOf(
      ProfileAccessError
    );
    // ...and the sibling in the SAME workspace is not refused, so the refusal
    // is about the workspace predicate rather than about minting at all.
    await expect(ProfileScope.mint(db, scopeA, p2)).resolves.toBeDefined();
  });

  it("P2: foreign and nonexistent are byte-identical — no enumeration oracle", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const foreign = await ProfileScope.mint(db, scopeA, p3).catch(
      (e: Error) => e
    );
    const missing = await ProfileScope.mint(db, scopeA, NIL_UUID).catch(
      (e: Error) => e
    );
    // A malformed id takes the same path: a uuid cast error would otherwise
    // distinguish "not a uuid" from "not yours" for free.
    const malformed = await ProfileScope.mint(db, scopeA, "not-a-uuid").catch(
      (e: Error) => e
    );
    for (const e of [foreign, missing, malformed]) {
      expect(e).toBeInstanceOf(ProfileAccessError);
    }
    expect((missing as Error).message).toBe((foreign as Error).message);
    expect((malformed as Error).message).toBe((foreign as Error).message);
    expect((foreign as Error).message).not.toContain(p3);
    expect((foreign as Error).message).not.toContain(aWorkspaceId);
  });

  // ------------------------------------------------------------------- P3

/**
 * Accessors that return a SCALAR rather than rows.
 *
 * `countOnboardingInputs` (added with the write-side row ceiling) is a scoped
 * read like any other and belongs in the completeness enumeration — it simply
 * has no rows for the row loops below to walk, and "returns at least one row"
 * is not the non-vacuity question for a number. Its isolation property is
 * asserted by VALUE in "countOnboardingInputs counts THIS profile's inputs
 * only" below, which is the same both-axes check the row validators make.
 * (That case did not exist when this comment first cited it, either — two
 * citations to tests nobody had written, found by the tenancy gate on
 * 2026-08-28. Both exist now.)
 *
 * A SET rather than a name check inside each loop, so a second scalar accessor
 * has to be added here deliberately instead of silently skipping the loops.
 */
/*
 * `PER_PROFILE_ARG_ACCESSORS` STOOD HERE AND IS GONE (2026-09-04), which is
 * worth a note rather than a silent deletion. It held `comparableResults`,
 * whose stratum names a different `brain_docs` row per profile — so a static
 * `accessorArgs` tuple would have matched NOTHING and the cross-parented case
 * would have passed `toHaveLength(0)` VACUOUSLY, for the wrong reason, on the
 * one axis this file exists to prove. Making the stratum OPTIONAL removed the
 * problem instead of routing around it: called with no argument the accessor
 * returns this profile's whole result population, which is a real, non-vacuous
 * invocation for every profile, so it rides the shared loops like everything
 * else. Its stratum branch keeps its own cases below.
 */

const SCALAR_ACCESSORS = new Set<keyof ProfileScope["accessors"]>([
  "brainAssetSummary",
  "countOnboardingInputs",
  // Slice 2a's `countBillableAttempts` WAS HERE and is gone (R-80). Its
  // replacement, `firstBillableAttempt`, returns ROWS — so it is not a scalar,
  // it walks the P4 row loops with a breach validator like every other row
  // accessor, and its isolation is asserted on both axes there rather than by
  // a number in a case of its own.
  // Slice 3. A number, like its two siblings; its both-axes isolation is
  // asserted BY VALUE in "countOwnPosts counts THIS profile's own posts only".
  "countOwnPosts",
  // Slice 3, billing round 2: the bound on attempts we paid for and did not
  // charge for. Both-axes isolation asserted BY VALUE in "the two UNCHARGED
  // bounds count and sum THIS profile only, on both axes" — a title that, until
  // round 2 of the 8c close-out, these comments cited without it existing.
  "countUnchargedBillableAttempts",
  // Slice 8c close-out, billing 2026-09-04: the same population in MONEY, and
  // asserted by the same case, which is the only one whose fixture makes either
  // accessor return a non-zero number.
  "sumUnchargedBillableCostMicroUsd",
  // Slice 4. Same shape as `countOwnPosts`: a number, so the row loops have
  // nothing to walk. Its both-axes isolation is asserted BY VALUE in
  // "countReferencePosts counts THIS profile's reference posts only".
  "countReferencePosts",
]);

  /** One breach validator per accessor: no row may name another profile. */
  const breachValidators: Record<
    keyof ProfileScope["accessors"],
    (
      rows: unknown[],
      ownProfile: string,
      ownWorkspace: string
    ) => void | Promise<void>
  > = {
    profile: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { id: string; workspaceId: string }[]) {
        expect(row.id).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    brainDocs: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    brainDocsByKind: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string; kind: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
        expect(row.kind).toBe("voice");
      }
    },
    brainDocsByIds: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Scalar: the row loop has nothing to walk, and the isolation property is
    // asserted by number in its own test below ("the count is per profile").
    countOnboardingInputs: () => {},
    onboardingInputs: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    exportPage: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId?: string; workspaceId?: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 3. The id-keyed read the confirm screen resolves its evidence
    // through. It takes CALLER-SUPPLIED IDS, which makes it the accessor most
    // worth walking both axes: the ids come off a jsonb column the composite
    // FK cannot see, so the `both()` predicate is the only thing standing
    // between a cited id and another profile's row.
    onboardingInputsByIds: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 3. The corpus the priced inference actually sends to a vendor —
    // both axes, and additionally that it never returns a `reference` row.
    countUnchargedBillableAttempts: () => {
      // Scalar — asserted by value below.
    },
    sumUnchargedBillableCostMicroUsd: () => {
      // Scalar — asserted by value below.
    },
    countOwnPosts: () => {
      // Scalar — the row loops have nothing to walk. Its isolation is asserted
      // by value in its own test below.
    },
    countReferencePosts: () => {
      // Scalar — the row loops have nothing to walk. Its isolation is asserted
      // by value in "countReferencePosts counts THIS profile's reference posts
      // only" below.
    },
    ownPostsNewest: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as {
        profileId: string;
        workspaceId: string;
        inputClass: string;
      }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
        expect(row.inputClass).toBe("own_post");
      }
    },
    modelUsage: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 6: the coherent activation a generation records. Its id carries NO
    // foreign key (`generation-schema.ts` records why), so THIS accessor is
    // the only thing that keeps a stored generation from naming another
    // profile's snapshot — which makes both axes here the actual control.
    latestBrainActivation: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // THE ONE VALIDATOR THAT HAS TO GO BACK TO THE TABLE, and the reason is
    // worth stating: `referenceCorpusAsOf` PROJECTS to `{id, content}` because
    // that is the shape the echo bar consumes, so the returned rows carry no
    // `profileId` for this validator to read. Asserting the shape it does
    // return would test nothing about tenancy. So each returned id is looked
    // up in `onboarding_inputs` and its OWNER is checked — which is the actual
    // property (a corpus row belonging to a sibling profile is the leak), and
    // it is non-vacuous because the P4 fixtures seed reference inputs under
    // both profiles.
    referenceCorpusAsOf: async (rows, ownProfile, ownWorkspace) => {
      const returned = rows as { id: string; content: string }[];
      for (const row of returned) {
        const [owner] = await db
          .select({
            profileId: onboardingInputs.profileId,
            workspaceId: onboardingInputs.workspaceId,
            inputClass: onboardingInputs.inputClass,
          })
          .from(onboardingInputs)
          .where(eq(onboardingInputs.id, row.id));
        expect(owner, "the corpus named an input that does not exist").toBeDefined();
        expect(owner.profileId).toBe(ownProfile);
        expect(owner.workspaceId).toBe(ownWorkspace);
        // ...and it is a REFERENCE corpus: an own_post leaking in would make
        // the R-3 bar refuse a creator for quoting themselves.
        expect(owner.inputClass).toBe("reference");
      }
    },
    // R-80. The durable included-build claim. A leak here is the sharpest one
    // over this table: the row it returns DECIDES A PRICE, so a claim from
    // another profile would either charge a creator for the build they were
    // promised or hand a second one out free.
    firstBillableAttempt: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 7 (R10/R11). The ONE raw feedback reader — both scope columns, like
    // every profile-grained accessor above it.
    generationFeedback: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 9a (R5). The creator's own outputs, for the result log's picker.
    // Both scope columns, like every profile-grained accessor here.
    generationsNewest: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 9a fix pass (billing CHANGE 1). The projected strategy-metric read
    // — both scope columns are IN the projection precisely so this validator
    // is not the one thing a narrowing quietly removed.
    strategyMetricVersions: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 9a (C5). The comparison population - the same both-columns check
    // as `results`, and it is CALLED from this accessor's own dedicated cases
    // below rather than from the shared loops (see `RESULT_STRATUM`), so it is
    // not inert.
    comparableResults: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    brainAssetSummary: () => {},
    promotionResultInputs: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    promotionFeedbackInputs: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    promotionProposalReview: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    promotionProposalHistory: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 9a (R5). The logged results — both scope columns, like every
    // profile-grained accessor above it. The row also carries a
    // `metric_declared_by_doc_id` and a `generation_id`, and neither is checked
    // here on purpose: this validator's job is "no row of another profile", and
    // what stops those two POINTERS naming another profile's rows is the two
    // composite FKs, which `results-schema.test.ts` drives directly.
    results: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as { profileId: string; workspaceId: string }[]) {
        expect(row.profileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
      }
    },
    // Slice 7 (R5c). `frameworks` names its owner differently and library rows
    // have NO owner, which is why these two get their own validators rather
    // than the shared profileId/workspaceId one — and why the `visibility`
    // assertion is here: a shared row leaking into the PRIVATE list would pass
    // a null-owner check and fails this.
    privateFrameworks: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as {
        ownerProfileId: string;
        workspaceId: string;
        visibility: string;
      }[]) {
        expect(row.ownerProfileId).toBe(ownProfile);
        expect(row.workspaceId).toBe(ownWorkspace);
        expect(row.visibility).toBe("private");
      }
    },
    // Slice 7 (R5b + R5c). TWO ARMS, so the assertion is a disjunction rather
    // than an equality: a shared library row legitimately has NULL owner
    // columns, and a private row must be THIS profile's. A row that is neither
    // is the leak.
    eligibleFrameworks: (rows, ownProfile, ownWorkspace) => {
      for (const row of rows as {
        ownerProfileId: string | null;
        workspaceId: string | null;
        visibility: string;
        curatorStatus: string;
        retiredAt: Date | null;
        supersededAt: Date | null;
      }[]) {
        if (row.visibility === "shared") {
          expect(row.ownerProfileId).toBeNull();
          expect(row.workspaceId).toBeNull();
        } else {
          expect(row.visibility).toBe("private");
          expect(row.ownerProfileId).toBe(ownProfile);
          expect(row.workspaceId).toBe(ownWorkspace);
        }
        // ...and R5b's recommendability rule, asserted on every row this
        // accessor hands out. M8 ("a reader that returns proposed or retired
        // frameworks") reddens here as well as in `frameworks.test.ts`.
        expect(row.curatorStatus).toBe("approved");
        expect(row.retiredAt).toBeNull();
        expect(row.supersededAt).toBeNull();
      }
    },
  };

  /**
   * Args typed against the accessor map itself, so an accessor that GAINS a
   * parameter fails to compile here rather than being invoked with `undefined`.
   */
  const accessorArgs: {
    [K in keyof ProfileScope["accessors"]]: Parameters<
      ProfileScope["accessors"][K]
    >;
  } = {
    profile: [],
    brainDocs: [],
    brainDocsByKind: ["voice"],
    // EVERY profile's brain-doc ids, the sibling's and the foreigner's
    // included: this is the read that stands where a
    // `brain_activation_snapshots` doc-id column has no foreign key, so asking
    // it for somebody else's document is the whole question.
    brainDocsByIds: [ALL_BRAIN_DOC_IDS],
    brainAssetSummary: [],
    exportPage: ["onboarding_inputs", 0],
    onboardingInputs: [],
    // The SIBLING PROFILE'S input ids, deliberately: the P4 loops run this
    // against a world where the other profile's rows exist, so passing its ids
    // asks the accessor to hand them over. An empty result here is the pass,
    // and the non-vacuity is that those rows really are in the table.
    // EVERY profile's input ids, the sibling's and the foreigner's included:
    // this accessor takes caller-supplied ids, so the interesting question is
    // what it does when asked for somebody else's. Only P1's row may come back.
    onboardingInputsByIds: [ALL_INPUT_IDS],
    ownPostsNewest: [50],
    countOwnPosts: [],
    countReferencePosts: [],
    // `since: new Date(0)` — the LIFETIME window, so the P4 breach loops count
    // every seeded row rather than none. The window itself is a product
    // decision driven in `packages/credits/tests/generation-pricing.test.ts`;
    // what this file asks of the accessor is the tenancy question.
    countUnchargedBillableAttempts: [
      { purpose: "onboarding_brain", since: new Date(0) },
    ],
    sumUnchargedBillableCostMicroUsd: [
      { purpose: "onboarding_brain", since: new Date(0) },
    ],
    latestBrainActivation: [],
    countOnboardingInputs: [],
    modelUsage: [],
    // `settlement: "unsettled"` is the branch that may answer "no claim". The
    // `"settled"` branch REFUSES that answer and is driven by its own case
    // below — a required parameter no test drives the false side of is not a
    // guard (CLAUDE.md, 2026-08-29).
    firstBillableAttempt: [
      { purpose: "onboarding_brain", settlement: "unsettled" },
    ],
    // No ids => "the corpus as it stands now", the write-time shape. The
    // activation shape (an explicit recorded set) is exercised in activate.test.ts.
    referenceCorpusAsOf: [],
    // Slice 7.
    generationFeedback: [],
    privateFrameworks: [],
    eligibleFrameworks: [],
    // Slice 9a. Default page, like `generationFeedback` — the clamp itself is
    // the accessor's, and its own case drives it.
    results: [],
    generationsNewest: [],
    strategyMetricVersions: [],
    // NO STRATUM — the branch 9a actually walks, and the reason this accessor
    // can ride the shared loops at all: `[]` means "this profile's whole result
    // population", which is non-vacuous for every profile. A stratum here would
    // name one profile's `brain_docs` row and return nothing for the sibling.
    // The stratum branch has its own cases further down.
    comparableResults: [],
    promotionResultInputs: [],
    promotionFeedbackInputs: [],
    promotionProposalReview: [NIL_UUID],
    promotionProposalHistory: [],
  };

  const invoke = async (
    scope: ProfileScope,
    name: keyof ProfileScope["accessors"]
  ): Promise<unknown[]> => {
    const args = name === "promotionProposalReview"
      ? [PROPOSAL_ID_BY_PROFILE.get(scope.profileId) ?? NIL_UUID]
      : accessorArgs[name] as unknown[];
    const result = await (
      scope.accessors[name] as (...a: unknown[]) => Promise<unknown>
    )(...args);
    // Every accessor but one returns rows. `referenceCorpusAsOf` returns
    // `{ids, inputs}` because its caller has to RECORD the id set, so the
    // rows this machinery checks are its `inputs`. Normalised here, once, with
    // an explicit shape test rather than a name test — a second accessor
    // adopting the shape gets the same treatment without editing this.
    if (Array.isArray(result)) return result;
    const promotionInputs = result as {
      strategyMetricVersions?: unknown[];
      population?: { rows?: unknown[] };
    };
    if (
      Array.isArray(promotionInputs.strategyMetricVersions) &&
      Array.isArray(promotionInputs.population?.rows)
    ) {
      return [
        ...promotionInputs.strategyMetricVersions,
        ...promotionInputs.population.rows,
      ];
    }
    const proposalReview = result as {
      proposal?: unknown;
      resultEvidence?: unknown[];
      feedbackEvidence?: unknown[];
    };
    if (
      proposalReview.proposal &&
      Array.isArray(proposalReview.resultEvidence) &&
      Array.isArray(proposalReview.feedbackEvidence)
    ) {
      return [
        proposalReview.proposal,
        ...proposalReview.resultEvidence,
        ...proposalReview.feedbackEvidence,
      ];
    }
    // A SCALAR accessor — `countOnboardingInputs`, added with the write-side
    // row ceiling (production gate, 2026-08-27). It is a scoped read like any
    // other and belongs in this enumeration; it simply has no rows to inspect,
    // so the cross-profile question it answers is "does the count include the
    // sibling's rows", which its validator checks by NUMBER. Normalised to an
    // empty row list here so the shared loop stays uniform, and given its own
    // assertion below.
    // A SCALAR accessor's "rows" are its COUNT — `Array.from({length: n})`, so
    // `rows.length` is a true statement about it. That matters for the
    // cross-parented case below, which asserts emptiness: returning `[]` there
    // would have made a count that WRONGLY included the foreign row pass
    // vacuously. The breach validators never inspect these elements (the
    // scalar's validator is a no-op) and the non-vacuity loops skip it.
    if (typeof result === "number") return Array.from({ length: result });
    // Slice 9a: `comparableResults` returns `{rows, truncated, limit}` because
    // a clipped population is a different claim from a complete one, and the
    // caller must be able to tell them apart. Unwrapped by SHAPE like
    // `{inputs}` above, for the reason that comment gives.
    const rowsShape = (result as { rows?: unknown }).rows;
    if (Array.isArray(rowsShape)) return rowsShape;
    const wrapped = (result as { inputs?: unknown }).inputs;
    expect(
      Array.isArray(wrapped),
      `accessor ${name} returned neither rows nor {inputs} nor {rows}`
    ).toBe(true);
    return wrapped as unknown[];
  };

  it("P3: accessor keys, validator keys, arg keys and capability keys agree", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const accessorNames = Object.keys(scope.accessors).sort();
    // The NAMED MINIMUM stops `{} === {}` passing while the AC-4 loop below
    // runs zero times (round-3 finding: an empty map agrees with an empty map).
    expect(accessorNames).toEqual(
      [
        "brainDocs",
        "brainDocsByIds",
        "brainDocsByKind",
        "brainAssetSummary",
        "countOnboardingInputs",
        // Slice 3, added deliberately: the id-keyed evidence read the confirm
        // screen resolves quotes through, the class-filtered corpus the priced
        // inference sends to a vendor, and its count.
        "countOwnPosts",
        // Slice 4: the reference-post count, closing the corpus-starvation
        // window `ownPostsNewest`'s docblock names.
        "countReferencePosts",
        "countUnchargedBillableAttempts",
        "sumUnchargedBillableCostMicroUsd",
        // R-80: the durable per-(profile, purpose) included-build claim, which
        // replaced the derived `countBillableAttempts` ranking.
        "firstBillableAttempt",
        // Slice 5: one fixed-size, registry-selected page. The shared P4 loops
        // can only drive ONE table through it (`accessorArgs` is one tuple per
        // accessor), so all six branches get their own parameterised cases in
        // this file — "exportPage: EVERY classified table…", "exportPage:
        // frameworks is PRIVATE-ONLY…" and "exportPage cross-workspace axis…".
        "exportPage",
        // Slice 6: the newest coherent brain activation, which every
        // generation records the id of (R9a).
        "latestBrainActivation",
        "modelUsage",
        "onboardingInputs",
        "onboardingInputsByIds",
        "ownPostsNewest",
        "profile",
        "referenceCorpusAsOf",
        // Slice 7: the ONE raw feedback reader (R11), the creator's own live
        // private frameworks, and the recommendable set generation reads
        // (R5b/R5c). Named here rather than left to the loop because the point
        // of this list is that a new accessor is a decision somebody made, not
        // a diff nobody read.
        "generationFeedback",
        "privateFrameworks",
        "eligibleFrameworks",
        // Slice 9a: the creator's own outputs, for the result log's picker —
        // the FIRST scoped reader of `generations` that is not `exportPage`.
        "generationsNewest",
        // Slice 9a fix pass: four scalars per strategy version, never the
        // `content` jsonb — the read that shares a render with the comparison.
        "strategyMetricVersions",
        // Slice 9a: the comparison population, filtered IN SQL by the five
        // stratum predicates and reporting whether it clipped - the accessor
        // that exists so a comparison is never computed over a silently
        // truncated population.
        "comparableResults",
        // Slice 9a: the creator's own logged results, RAW — the rows
        // `@respin/brain`'s comparison builder receives already scoped.
        // Named here rather than left to the loop for the reason the list
        // exists: a new accessor is a decision somebody made, not a diff
        // nobody read.
        "results",
        "promotionResultInputs",
        "promotionFeedbackInputs",
        "promotionProposalReview",
        "promotionProposalHistory",
      ].sort()
    );
    expect(Object.keys(breachValidators).sort()).toEqual(accessorNames);
    expect(Object.keys(accessorArgs).sort()).toEqual(accessorNames);
    expect(Object.keys(caps).sort()).toEqual(
      [
        "appendOnboardingInput",
        "recordModelUsage",
        "writeBrainDoc",
        "confirmBrainDocFields",
        "activateBrainDoc",
        // Slice 3b, R8: the coherent-activation wrapper that also records a
        // brain_activation_snapshots row in the same transaction.
        "activateBrainDocCoherent",
        // Slice 6 (R14/R14b/R14c): the durable claim, its guarded transitions,
        // the settlement that writes the generation and the transition
        // together, and the read that lets a re-submission return the stored
        // record instead of calling a vendor twice.
        "claimGenerationAttempt",
        "advanceGenerationAttempt",
        "settleGeneration",
        "readGenerationForAttempt",
        // R14c: the claim re-read INSIDE the settlement lock, which is what
        // decides which of two callers holding one `vendor_complete` row may
        // take the debit.
        "readGenerationAttempt",
        // Slice 7 (R10): the append-only feedback event. Role-gated,
        // cage-asserted, every scope column built from the scope, and the
        // closed reaction set checked at RUNTIME rather than only in the type.
        "recordGenerationFeedback",
        // Slice 9a (R5-R9): the append-only logged result. Role-gated,
        // cage-asserted, every scope column built from the scope, the closed
        // vocabularies checked at RUNTIME rather than only in the type, and
        // five columns with no caller parameter at all.
        "recordResult",
        "refreshPromotionProposals",
        "appendPromotionSummaryForProposal",
        "decidePromotionProposal",
      ].sort()
    );
  });

  // ------------------------------------------------------------------- P4

  it("P4 same-workspace axis: every accessor returns only P1's rows, non-vacuously", async () => {
    const scope = await mintP1();
    for (const name of Object.keys(
      scope.accessors
    ) as (keyof ProfileScope["accessors"])[]) {
      if (SCALAR_ACCESSORS.has(name)) continue;
      const rows = await invoke(scope, name);
      expect(
        rows.length,
        `${name} returned no rows — its validator would be vacuous`
      ).toBeGreaterThan(0);
      await breachValidators[name](rows, p1, aWorkspaceId);
    }
  });

  it("P4 same-workspace axis, run as the SIBLING profile (attempted from both sides)", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const scope = await ProfileScope.mint(db, scopeA, p2);
    for (const name of Object.keys(
      scope.accessors
    ) as (keyof ProfileScope["accessors"])[]) {
      if (SCALAR_ACCESSORS.has(name)) continue;
      const rows = await invoke(scope, name);
      expect(rows.length).toBeGreaterThan(0);
      await breachValidators[name](rows, p2, aWorkspaceId);
    }
  });

  it("promotion reads exclude both the same-workspace sibling and the foreign workspace", async () => {
    const scope = await mintP1();
    const resultInputs = await scope.accessors.promotionResultInputs();
    expect(resultInputs.strategyMetricVersions.length).toBeGreaterThan(0);
    expect(resultInputs.population.rows.length).toBeGreaterThan(0);
    for (const row of [
      ...resultInputs.strategyMetricVersions,
      ...resultInputs.population.rows,
    ]) {
      expect(row.profileId).toBe(p1);
      expect(row.workspaceId).toBe(aWorkspaceId);
    }
    const feedback = await scope.accessors.promotionFeedbackInputs();
    expect(feedback.length).toBeGreaterThan(0);
    expect(feedback.every((row) =>
      row.profileId === p1 && row.workspaceId === aWorkspaceId
    )).toBe(true);
    const history = await scope.accessors.promotionProposalHistory();
    expect(history).toHaveLength(2);
    expect(history.every((row) =>
      row.profileId === p1 && row.workspaceId === aWorkspaceId
    )).toBe(true);
    await expect(
      scope.accessors.promotionProposalReview(PROPOSAL_ID_BY_PROFILE.get(p1)!)
    ).resolves.toMatchObject({
      proposal: { profileId: p1, workspaceId: aWorkspaceId },
    });
    await expect(
      scope.accessors.promotionProposalReview(PROPOSAL_ID_BY_PROFILE.get(p2)!)
    ).resolves.toBeNull();
    await expect(
      scope.accessors.promotionProposalReview(PROPOSAL_ID_BY_PROFILE.get(p3)!)
    ).resolves.toBeNull();
  });

  // ------------------------------------------------ exportPage, ALL SIX BRANCHES
  //
  // `accessorArgs.exportPage` drives ONE table (`onboarding_inputs`), so the P4
  // loops above prove one of six branches and the arg map cannot express the
  // other five — it is one tuple per accessor. Five live branches therefore had
  // NO cross-profile and NO cross-workspace assertion at all, while
  // `exportPage` is the single reader the creator-data export streams every
  // included table through (tenancy gate round 1, 2026-08-31). Parameterised
  // here instead.
  const EXPORT_ROW_OWNER: Record<
    ProfileExportTable,
    (row: Record<string, unknown>) => { profile: unknown; workspace: unknown }
  > = {
    // The anchor row itself: its own `id` is the profile grain.
    creator_profiles: (row) => ({ profile: row.id, workspace: row.workspaceId }),
    brain_docs: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    onboarding_inputs: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    onboarding_interview_drafts: (row) => ({
      profile: row.profileId,
      workspace: row.workspaceId,
    }),
    brain_activation_snapshots: (row) => ({
      profile: row.profileId,
      workspace: row.workspaceId,
    }),
    generations: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    // `frameworks` names its owner differently, and library rows have NO
    // owner — which is exactly why R15's private-only rule is a property of
    // this branch and not of the `both()` helper the others share.
    frameworks: (row) => ({ profile: row.ownerProfileId, workspace: row.workspaceId }),
    // Slice 7 (R10). The ordinary shape — both scope columns on the row.
    generation_feedback: (row) => ({
      profile: row.profileId,
      workspace: row.workspaceId,
    }),
    // Slice 8 fix pass (tenancy CHANGE 5, 2026-09-03): the SUBMITTED sources.
    // Ownerless youtube rows have a NULL pair and never match `both()`.
    trend_sources: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    tracked_niches: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    trend_items: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    trend_transcripts: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    autopsies: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    autopsy_cache_claims: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    // Slice 9a (R5). The ordinary shape — both scope columns on the row.
    results: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    promotion_proposals: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    proposal_evidence_results: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
    proposal_evidence_feedback: (row) => ({ profile: row.profileId, workspace: row.workspaceId }),
  };

  it("exportPage: EVERY classified table returns this profile's rows only, non-vacuously", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    for (const [self, selfWorkspace] of [
      [p1, aWorkspaceId],
      // Run as the sibling too, so "returns only mine" is not satisfied by an
      // accessor that happens to return the first profile in the workspace.
      [p2, aWorkspaceId],
    ] as const) {
      const scope = await ProfileScope.mint(db, scopeA, self);
      for (const table of PROFILE_EXPORT_TABLES) {
        const rows = (await scope.accessors.exportPage(table, 0)) as Record<
          string,
          unknown
        >[];
        expect(
          rows.length,
          `${table} returned no rows for ${self} — the branch is untested, not proven`
        ).toBeGreaterThan(0);
        for (const row of rows) {
          const owner = EXPORT_ROW_OWNER[table](row);
          expect(owner.profile, `${table} leaked another profile's row`).toBe(self);
          expect(owner.workspace, `${table} leaked another workspace's row`).toBe(
            selfWorkspace
          );
        }
      }
    }
  });

  it("exportPage: frameworks is PRIVATE-ONLY — a shared library row is never a creator's data", async () => {
    await db.insert(frameworks).values({
      slug: "shared-library-row",
      name: "SHARED-LIBRARY-ROW",
      beats: [],
      whyItConverts: "Library content, owned by nobody",
      applicability: [],
      sourceReferences: [],
      evidenceEntries: [],
      testedCaveats: [],
      // `unsupported`, because `evidenceEntries` is `[]` — slice 7's
      // `frameworks_confidence_matches_evidence` CHECK makes any other rung
      // unstorable for a row with no evidence (R-29).
      confidence: "unsupported",
      saturation: "observed",
      visibility: "shared",
      rightsBasis: "independently_licensed",
      rightsEvidenceId: "test-license:profile-scope",
    });
    const scope = await mintP1();
    const rows = (await scope.accessors.exportPage("frameworks", 0)) as {
      slug: string;
      visibility: string;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.visibility).toBe("private");
    expect(rows.map((row) => row.slug)).not.toContain("shared-library-row");
    // Non-vacuity: the shared row is really in the table this branch reads.
    expect(
      (await db.select().from(frameworks)).map((row) => row.slug)
    ).toContain("shared-library-row");
  });

  it("exportPage cross-workspace axis: a cross-parented row is invisible in EVERY branch", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    // `creator_profiles` is the ANCHOR, not a child: re-parenting p1's own row
    // to workspace B makes `ProfileScope.mint` itself refuse, which is P1's
    // case above. The five child branches are the ones a dropped `workspace_id`
    // predicate would open.
    //
    // `fks` IS A LIST, not a single name (slice 6). The re-parenting UPDATE
    // below has to be legal once the constraints are dropped, and a table can
    // be held by MORE THAN ONE composite FK carrying `workspace_id`:
    // `generations` has its `creator_profiles` one AND a four-column one to
    // `generation_attempts` (attempt_id, mode, profile_id, workspace_id).
    // Dropping only the first leaves the UPDATE refused, which would turn this
    // case into a test that fails for the wrong reason — or, worse, one
    // somebody "fixes" by removing the branch.
    //
    // AND A CONSTRAINT IS NOT THE ONLY THING THAT REFUSES THE RE-PARENTING
    // UPDATE (tenancy gate, 2026-09-01). Migration 0023 added
    // `frameworks_ownership_immutable`, a BEFORE UPDATE TRIGGER that refuses a
    // change to `visibility`, `owner_profile_id` or `workspace_id` — the guard
    // that stops a private framework becoming shared library content in one
    // statement. It refuses this fixture's UPDATE too, and it must: a fixture
    // that could still perform the move would mean the trigger was not there.
    // So `triggers` is a second list beside `fks`, disabled inside the same
    // transaction and restored by the same rollback. Found by running the full
    // suite, exactly as the four constraints below were.
    const CHILD_BRANCHES = [
      {
        table: "brain_docs",
        // SLICE 9A ADDED THE SECOND PAIR, and it is the shape this list's own
        // `generations` comment predicted: `results_metric_doc_fk` lives on the
        // CHILD table and references `brain_docs(id, profile_id, workspace_id)`
        // with ON UPDATE RESTRICT, so it refuses a change to the parent's
        // `workspace_id` from the other side. Found by RUNNING the suite —
        // the failure was "expected to throw rollback" and named neither the
        // table nor the constraint, exactly as recorded there.
        fks: [
          ["brain_docs", "brain_docs_profile_workspace_fk"],
          ["results", "results_metric_doc_fk"],
          ["promotion_proposals", "promotion_proposals_basis_doc_fk"],
        ],
        triggers: [],
        column: "profile_id",
      },
      {
        table: "onboarding_inputs",
        fks: [["onboarding_inputs", "onboarding_inputs_profile_workspace_fk"]],
        triggers: [],
        column: "profile_id",
      },
      {
        table: "onboarding_interview_drafts",
        fks: [
          [
            "onboarding_interview_drafts",
            "onboarding_interview_drafts_profile_workspace_fk",
          ],
        ],
        triggers: [],
        column: "profile_id",
      },
      {
        table: "brain_activation_snapshots",
        fks: [
          [
            "brain_activation_snapshots",
            "brain_activation_snapshots_profile_workspace_fk",
          ],
        ],
        triggers: [],
        column: "profile_id",
      },
      // FOUR CONSTRAINTS FROM SLICE 7, AND ONE OF THEM IS ON ANOTHER TABLE —
      // which is why `fks` is now a list of (table, constraint) PAIRS rather
      // than of names. Two things changed at once and each broke the
      // re-parenting UPDATE on its own:
      //
      //   `generations_parent_fk` is a SELF-referencing composite FK carrying
      //   `workspace_id`, exactly the second-FK shape this list's own comment
      //   predicted for `generations`.
      //
      //   `generation_feedback_generation_fk` lives on the CHILD table and
      //   references `generations(id, profile_id, workspace_id)` with ON
      //   UPDATE RESTRICT, so it refuses a change to the parent's
      //   `workspace_id` from the other side. Nothing in the previous shape
      //   could express that, and the failure it produced ("expected to throw
      //   rollback") named neither the table nor the constraint.
      //
      // Found by running the full suite, not by reading the list.
      {
        table: "generations",
        fks: [
          ["generations", "generations_profile_workspace_fk"],
          ["generations", "generations_attempt_fk"],
          ["generations", "generations_parent_fk"],
          ["generation_feedback", "generation_feedback_generation_fk"],
          // Slice 9a, the same shape once more: `results_generation_fk` is on
          // the child and carries ON UPDATE RESTRICT.
          ["results", "results_generation_fk"],
        ],
        // `generations_parent_id_immutable` (migration 0022) is NOT here, and
        // that is the narrowness working rather than an omission: it compares
        // `parent_id` only, and this fixture rewrites `workspace_id`.
        triggers: [],
        column: "profile_id",
      },
      {
        table: "frameworks",
        fks: [["frameworks", "frameworks_owner_profile_workspace_fk"]],
        triggers: [["frameworks", "frameworks_ownership_immutable"]],
        column: "owner_profile_id",
      },
      // Slice 7 (R10). TWO FKs, for the reason `generations` has two: the
      // re-parenting UPDATE below must be legal once the constraints are
      // dropped, and this table is held by its `creator_profiles` FK AND by
      // the three-column `generation_feedback_generation_fk`, which also
      // carries `workspace_id`. Dropping only the first leaves the UPDATE
      // refused — a case that fails for the wrong reason.
      {
        table: "generation_feedback",
        fks: [
          ["generation_feedback", "generation_feedback_profile_workspace_fk"],
          ["generation_feedback", "generation_feedback_generation_fk"],
          ["proposal_evidence_feedback", "proposal_evidence_feedback_feedback_fk"],
        ],
        triggers: [],
        column: "profile_id",
      },
      { table: "trend_sources", fks: [["trend_sources", "trend_sources_profile_workspace_fk"]], triggers: [], column: "profile_id" },
      { table: "tracked_niches", fks: [["tracked_niches", "tracked_niches_profile_workspace_fk"]], triggers: [], column: "profile_id" },
      { table: "trend_items", fks: [["trend_items", "trend_items_profile_workspace_fk"]], triggers: [], column: "profile_id" },
      { table: "trend_transcripts", fks: [["trend_transcripts", "trend_transcripts_profile_workspace_fk"]], triggers: [], column: "profile_id" },
      { table: "autopsies", fks: [["autopsies", "autopsies_profile_workspace_fk"]], triggers: [], column: "profile_id" },
      { table: "autopsy_cache_claims", fks: [["autopsy_cache_claims", "autopsy_cache_claims_profile_workspace_fk"]], triggers: [], column: "profile_id" },
      // Slice 9a (R5). THREE pairs, the most of any entry here: this table is
      // held by its `creator_profiles` FK and by the two same-tenant FKs that
      // make its `generation_id` and `metric_declared_by_doc_id` pointers
      // tenancy-proving rather than decorative. All three carry `workspace_id`,
      // so the re-parenting UPDATE is refused until all three are dropped.
      {
        table: "results",
        fks: [
          ["results", "results_profile_workspace_fk"],
          ["results", "results_generation_fk"],
          ["results", "results_metric_doc_fk"],
          ["proposal_evidence_results", "proposal_evidence_results_result_fk"],
        ],
        triggers: [],
        column: "profile_id",
      },
      {
        table: "promotion_proposals",
        fks: [
          ["promotion_proposals", "promotion_proposals_profile_workspace_fk"],
          ["promotion_proposals", "promotion_proposals_basis_doc_fk"],
          ["proposal_evidence_results", "proposal_evidence_results_proposal_fk"],
          ["proposal_evidence_feedback", "proposal_evidence_feedback_proposal_fk"],
        ],
        triggers: [],
        column: "profile_id",
      },
      {
        table: "proposal_evidence_results",
        fks: [
          ["proposal_evidence_results", "proposal_evidence_results_proposal_fk"],
          ["proposal_evidence_results", "proposal_evidence_results_result_fk"],
        ],
        triggers: [],
        column: "profile_id",
      },
      {
        table: "proposal_evidence_feedback",
        fks: [
          ["proposal_evidence_feedback", "proposal_evidence_feedback_proposal_fk"],
          ["proposal_evidence_feedback", "proposal_evidence_feedback_feedback_fk"],
        ],
        triggers: [],
        column: "profile_id",
      },
    ] as const;
    const covered = new Set<string>(CHILD_BRANCHES.map((b) => b.table));
    expect(
      PROFILE_EXPORT_TABLES.filter(
        (table) => table !== "creator_profiles" && !covered.has(table)
      ),
      "an exportable table has no cross-workspace case — adding a branch costs one entry here"
    ).toEqual([]);

    for (const { table, fks, triggers, column } of CHILD_BRANCHES) {
      await expect(
        db.transaction(async (tx) => {
          // Each entry names its OWN table: slice 7's
          // `generation_feedback_generation_fk` sits on the child and refuses
          // a change to the parent's `workspace_id` from the other side.
          for (const [fkTable, fk] of fks) {
            await tx.execute(sql.raw(`ALTER TABLE ${fkTable} DROP CONSTRAINT ${fk}`));
          }
          // ...and the same for a TRIGGER that refuses the move. DISABLE
          // rather than DROP, so the rollback restores it by definition.
          for (const [trTable, trigger] of triggers as readonly (readonly [string, string])[]) {
            await tx.execute(
              sql.raw(`ALTER TABLE ${trTable} DISABLE TRIGGER ${trigger}`)
            );
          }
          await tx.execute(
            sql.raw(
              `UPDATE ${table} SET workspace_id = '${bWorkspaceId}' WHERE ${column} = '${p1}'`
            )
          );
          const scope = await ProfileScope.mint(tx, scopeA, p1);
          expect(
            await scope.accessors.exportPage(table as ProfileExportTable, 0, tx),
            `exportPage(${table}) leaked a cross-parented row`
          ).toHaveLength(0);
          const profileOnly = await tx.execute(
            sql.raw(`SELECT 1 FROM ${table} WHERE ${column} = '${p1}'`)
          );
          expect(
            profileOnly.rows.length,
            `${table} fixture is vacuous — the re-parented row does not exist`
          ).toBeGreaterThan(0);
          throw new Error("rollback");
        })
      ).rejects.toThrow("rollback");
    }

    // THE CONSTRAINTS SURVIVE THE ROLLBACK — the next test is not poisoned.
    // Moved here (round 2) from `CROSS_PARENTED`'s own loop, which owned this
    // check for `onboarding_interview_drafts`, `brain_activation_snapshots`
    // and `frameworks` until their accessors were deleted. Every FK this test
    // drops is checked, so the population is the one this test actually
    // touches rather than a second hand-written list.
    for (const { fks, triggers } of CHILD_BRANCHES) {
      for (const [fkTable, fk] of fks) {
        const found = await db.execute(
          sql.raw(
            `SELECT 1 FROM pg_constraint WHERE conname = '${fk}' AND conrelid = '${fkTable}'::regclass`
          )
        );
        expect(found.rows.length, `${fk} was not restored`).toBe(1);
      }
      // A DISABLED TRIGGER IS STILL PRESENT, so `EXISTS` would pass on one the
      // rollback failed to re-enable. `tgenabled = 'O'` is Postgres' "enabled,
      // origin" state — the default — and it is what makes this check about
      // the guard being ARMED rather than about the row existing.
      for (const [trTable, trigger] of triggers as readonly (readonly [string, string])[]) {
        const found = await db.execute(
          sql.raw(
            `SELECT tgenabled FROM pg_trigger WHERE tgname = '${trigger}' AND tgrelid = '${trTable}'::regclass`
          )
        );
        expect(found.rows.length, `${trigger} is gone entirely`).toBe(1);
        expect(
          (found.rows[0] as { tgenabled: string }).tgenabled,
          `${trigger} was left DISABLED — every later test in this file runs without it`
        ).toBe("O");
      }
    }
  });

  /**
   * The CROSS-WORKSPACE axis, which the composite FK makes unrepresentable in
   * normal operation — so the row is created inside a transaction with the
   * constraint dropped, and rolled back.
   *
   * The mechanism was verified against the installed PGlite (0.3.16) by three
   * reviewers independently before it was written down: `BEGIN; ALTER TABLE …
   * DROP CONSTRAINT …; INSERT cross-parented; ROLLBACK` prints
   * "IN-TX composite: 1 profile-only: 2", with the constraint restored after.
   *
   * Without this axis, "the accessor filters on workspace_id too" is a claim
   * no test can fail, because the constraint hides the only row that would
   * expose its absence.
   */
  const CROSS_PARENTED = [
    {
      table: "brain_docs",
      // PAIRS, NOT NAMES (slice 9a) — the correction `CHILD_BRANCHES` above
      // took in slice 6 and again in slice 7, arriving here for the identical
      // reason: `results_metric_doc_fk` lives on ANOTHER table and refuses a
      // change to THIS one's `workspace_id` from the other side (ON UPDATE
      // RESTRICT), so a name alone cannot say which table to drop it from.
      // Found by running the suite, not by reading the list.
      fks: [
        ["brain_docs", "brain_docs_profile_workspace_fk"],
        ["results", "results_metric_doc_fk"],
        ["promotion_proposals", "promotion_proposals_basis_doc_fk"],
      ],
      triggers: [],
      profileColumn: "profile_id",
      // ALL THREE accessors over this table, not just one. The tenancy gate
      // once noted that the third was applicable and skipped, making AC-4's
      // "per accessor, both axes" 4/5 in practice — and they only share the
      // `both()` helper today, which is a property of the current
      // implementation rather than of the test. `brainDocsByIds` (which
      // replaced `activeBrainDocs` on 2026-09-01, so the generation path reads
      // the documents its recorded snapshot NAMES rather than whatever is
      // active at that instant) is now the sharpest of the three, for the
      // reason `onboardingInputsByIds` is sharpest over its own table: it takes
      // caller-supplied ids that reach it from an FK-free snapshot column, so
      // `both()` is the only thing between a named id and another profile's
      // document.
      accessors: [
        "brainDocs",
        "brainDocsByKind",
        "brainDocsByIds",
        // Slice 9a fix pass: the projected read. It is the sharpest of the
        // four here, because a projection is exactly where a scope column gets
        // dropped by accident.
        "strategyMetricVersions",
      ],
    },
    {
      table: "onboarding_inputs",
      fks: [["onboarding_inputs", "onboarding_inputs_profile_workspace_fk"]],
      triggers: [],
      profileColumn: "profile_id",
      // BOTH accessors over this table. `referenceCorpusAsOf` was omitted when
      // it landed, and a tenancy mutation dropping its workspace predicate
      // survived the entire db suite — the IDENTICAL omission this file's own
      // comment above records fixing by hand for the third brain-docs
      // accessor. Hand-listing
      // recurred; the completeness assertion below now derives the population
      // from the accessor map so a third accessor over a covered table cannot
      // be skipped by forgetting to type it here.
      accessors: [
        "onboardingInputs",
        "referenceCorpusAsOf",
        "countOnboardingInputs",
        // Slice 3's three, all over this same table. `onboardingInputsByIds`
        // is the one most worth the cross-workspace axis: it takes CALLER
        // -SUPPLIED IDS off a jsonb column the composite FK cannot see, so
        // `both()` is the only thing between a cited id and another
        // workspace's row.
        "onboardingInputsByIds",
        "ownPostsNewest",
        "countOwnPosts",
        // Slice 4, same table, same reasoning: a dropped workspace predicate
        // here would let a sibling workspace's reference posts count toward
        // this profile's corpus-starvation bound.
        "countReferencePosts",
      ],
    },
    // Slice 6: `brain_activation_snapshots` HAS AN ACCESSOR AGAIN, so it is
    // back on this axis. It is the sharpest case in the list:
    // `generations.brain_activation_id` carries NO foreign key at all
    // (`generation-schema.ts` records why a bare FK would be worse than none),
    // so a dropped workspace predicate here would let a stored generation
    // record — permanently, in an immutable row — that it ran under another
    // workspace's coherent brain.
    {
      table: "brain_activation_snapshots",
      fks: [
        ["brain_activation_snapshots", "brain_activation_snapshots_profile_workspace_fk"],
      ],
      triggers: [],
      profileColumn: "profile_id",
      accessors: ["latestBrainActivation"],
    },
    // `onboarding_interview_drafts` and `frameworks` USED TO HAVE ENTRIES
    // HERE, one accessor each. Those three
    // accessors were deleted as unreachable (tenancy gate round 2 — see
    // `ProfileAccessors` in with-workspace.ts), and an entry with an empty
    // accessor list is a case that asserts nothing while looking like a case.
    // NOTHING IS UNTESTED AS A RESULT: `exportPage` is now the only scoped
    // reader over all three, and "exportPage cross-workspace axis: a
    // cross-parented row is invisible in EVERY branch" above drives exactly
    // this drop-constraint / re-parent / rollback mechanism through each of
    // them — including the constraint-restoration check this list also owned.
    // Slice 7 (R10/R11). `generation_feedback` HAS an accessor —
    // `generationFeedback`, the ONE sanctioned raw reader — so it belongs on
    // this axis, and it is a sharp case: that accessor is the single door
    // between these rows and every consumer, including `packages/brain` in
    // slice 9. A dropped workspace predicate here would put another
    // workspace's reactions into whatever slice 9 eventually counts, which is
    // the leak R-9 and R-10 are both about.
    {
      table: "generation_feedback",
      // TWO, like `generations` above: this table is held by its
      // `creator_profiles` FK AND by the three-column
      // `generation_feedback_generation_fk`, which also carries `workspace_id`.
      fks: [
        ["generation_feedback", "generation_feedback_profile_workspace_fk"],
        ["generation_feedback", "generation_feedback_generation_fk"],
        ["proposal_evidence_feedback", "proposal_evidence_feedback_feedback_fk"],
      ],
      triggers: [],
      profileColumn: "profile_id",
      accessors: ["generationFeedback"],
    },
    // Slice 7 (R5c). `frameworks` HAS accessors again — the note further up
    // this list records that its old single accessor was deleted as
    // unreachable, and these two are not: `privateFrameworks` is the creator's
    // own list and `eligibleFrameworks` is what generation reads. Both are
    // covered here because a dropped workspace predicate on the private arm
    // would put another creator's framework into this creator's prompt.
    {
      table: "frameworks",
      fks: [["frameworks", "frameworks_owner_profile_workspace_fk"]],
      // A TRIGGER REFUSES THIS FIXTURE'S UPDATE TOO (migration 0023).
      // `frameworks_ownership_immutable` is what stops a private framework
      // becoming shared library content in one statement, and it therefore
      // also stops the fixture that manufactures a cross-parented row on
      // purpose. Disabling it inside the transaction is the same move the
      // constraint drops above are, and its presence is re-asserted after the
      // rollback beside them.
      triggers: ["frameworks_ownership_immutable"],
      profileColumn: "owner_profile_id",
      accessors: ["privateFrameworks", "eligibleFrameworks"],
    },
    // Slice 9a (R5). `generations` HAS AN ACCESSOR NOW — `generationsNewest`,
    // the result log's output picker — so the table joins this axis for the
    // first time. Until 9a its only scoped reader was `exportPage`, whose own
    // parameterised cases above cover both axes; a dropped workspace predicate
    // on the new accessor would put another creator's outputs into the list a
    // creator picks the SUBJECT OF A RESULT from, which is a cross-profile row
    // one click from being cited as this creator's own evidence.
    //
    // FIVE PAIRS, the same set `CHILD_BRANCHES` carries for this table: the
    // profile FK, the attempt FK, the SELF-referencing parent FK, and the two
    // child-side FKs (`generation_feedback` and, since 9a, `results`) that
    // reference `generations(id, profile_id, workspace_id)` ON UPDATE RESTRICT
    // and therefore refuse a change to this table's `workspace_id` from the
    // other side.
    {
      table: "generations",
      fks: [
        ["generations", "generations_profile_workspace_fk"],
        ["generations", "generations_attempt_fk"],
        ["generations", "generations_parent_fk"],
        ["generation_feedback", "generation_feedback_generation_fk"],
        ["results", "results_generation_fk"],
      ],
      triggers: [],
      profileColumn: "profile_id",
      accessors: ["generationsNewest"],
    },
    // Slice 9a (R5). `results` has an accessor, and it is a sharp case for the
    // same reason `generation_feedback` is: that accessor is the single door
    // between these rows and every consumer, including the comparison
    // `@respin/brain` builds from them. A dropped workspace predicate here
    // would put another workspace's numbers into a creator's own cohort or
    // baseline — which is not a weaker claim, it is a claim about somebody
    // else, and the leak R-9 and R-10 are both about.
    {
      table: "results",
      // THREE, the most of any entry in this list: this table is held by its
      // `creator_profiles` FK, by `results_generation_fk` and by
      // `results_metric_doc_fk`, and the last two also carry `workspace_id` —
      // so the re-parenting UPDATE this case performs is illegal until all
      // three are dropped. That is the `fks`-is-a-LIST correction slices 6 and
      // 7 each took, arriving a third time.
      fks: [
        ["results", "results_profile_workspace_fk"],
        ["results", "results_generation_fk"],
        ["results", "results_metric_doc_fk"],
        ["proposal_evidence_results", "proposal_evidence_results_result_fk"],
      ],
      triggers: [],
      profileColumn: "profile_id",
      // BOTH readers of this table. `comparableResults` is driven with NO
      // stratum here (see `accessorArgs`), which is the call 9a makes and the
      // only one that is non-vacuous for an arbitrary profile — a re-parented
      // row it returned would be a cross-workspace result inside a creator's
      // own comparison.
      accessors: ["results", "comparableResults"],
    },
    {
      table: "model_usage",
      fks: [["model_usage", "model_usage_profile_workspace_fk"]],
      triggers: [],
      profileColumn: "profile_id",
      // BOTH accessors over this table (slice 2a). `countBillableAttempts` was
      // the third and is gone (R-80) — the pricing question it answered moved
      // to `first_billable_attempts`, which has its own entry below.
      accessors: [
        "modelUsage",
        // Slice 3, billing round 2: the bound on attempts we paid for and did
        // not charge for. A dropped workspace predicate here would let another
        // workspace's failures exhaust this creator's cap.
        "countUnchargedBillableAttempts",
        // Same table, same reason, in money: a dropped workspace predicate
        // here would let another workspace's spend exhaust this creator's cap.
        "sumUnchargedBillableCostMicroUsd",
      ],
    },
    // R-80. The durable included-build claim, and the sharpest money case on
    // this axis: the row `firstBillableAttempt` returns decides whether a
    // build is free or costs a rebuild, so a cross-parented claim leaking in
    // would price one creator's run off another workspace's history.
    {
      table: "first_billable_attempts",
      fks: [["first_billable_attempts", "first_billable_attempts_profile_workspace_fk"]],
      triggers: [],
      profileColumn: "profile_id",
      accessors: ["firstBillableAttempt"],
    },
  ] as const;

  // ------------------------------------------- the BY-VALUE count cases
  //
  // Two comments in this file cited these by name for weeks and neither
  // existed (tenancy gate, 2026-08-28). A count has no rows for the P4 loops
  // to walk, so the row validators skip it entirely — which means a scalar
  // accessor's isolation is asserted here or nowhere.
  //
  // `countBillableAttempts`'s case USED TO OPEN THIS BLOCK. The accessor is
  // gone (R-80) and its replacement returns rows, so its isolation now runs in
  // the P4 loops with every other row accessor. What replaces the case here is
  // the property no loop can express: the claim is written ONCE, by the FIRST
  // billable attempt, and no later attempt moves it.

  it("the included-build claim is written ONCE, by the first billable attempt, per profile", async () => {
    // THE MONEY PROPERTY, by value. `firstBillableAttempt` decides whether a
    // build is free or costs a rebuild, so two things have to hold: my later
    // attempts must not MOVE my claim (or every run would be free), and the
    // sibling's attempts must not APPEAR as mine (or their history would price
    // my debit).
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const sibling = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      p2
    );
    const holder = async (sc: typeof scope): Promise<string | undefined> => {
      const [row] = await sc.accessors.firstBillableAttempt({
        purpose: "onboarding_brain",
        settlement: "unsettled",
      });
      return row?.attemptId;
    };
    // The shared fixture already seeded one claim per profile, naming that
    // profile's own attempt — which is the state a real profile is in after
    // its first build, and the state the "does a later attempt move it" half
    // needs.
    expect(await holder(scope)).toBe(`att_${p1}`);
    expect(await holder(sibling)).toBe(`att_${p2}`);

    for (const id of ["p1-a", "p1-b"]) {
      await db.transaction((tx) => caps.recordModelUsage(usageInput(id), tx));
    }
    const siblingCaps = writeCapabilities(sibling);
    for (const id of ["p2-a", "p2-b", "p2-c"]) {
      await db.transaction((tx) =>
        siblingCaps.recordModelUsage(usageInput(id), tx)
      );
    }

    // FIVE more billable attempts across two profiles, and NEITHER claim moved.
    expect(
      await holder(scope),
      "a later attempt took over this profile's included build"
    ).toBe(`att_${p1}`);
    expect(await holder(sibling)).toBe(`att_${p2}`);
    // ...and there is exactly ONE claim row per (profile, purpose) — the
    // database's own count, not the accessor's.
    const claims = await db
      .select()
      .from(firstBillableAttempts)
      .where(eq(firstBillableAttempts.profileId, p1));
    expect(claims).toHaveLength(1);
  });

  it("a NON-CONSUMING billable attempt claims nothing — a truncation is not a free build", async () => {
    // The 2026-08-29 billing gate's property, restated against the claim
    // writer. A truncated reply is billable (the vendor generated a full
    // ceiling and charged us) and NON-consuming (the cause is our own reply
    // limit). If the claim writer read `outcome` alone, this row would take the
    // creator's included build for an outage they did not cause and cannot fix.
    const [fresh] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: aWorkspaceId, displayName: "A-three" })
      .returning();
    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      fresh.id
    );
    const caps = writeCapabilities(scope);
    await db.transaction((tx) =>
      caps.recordModelUsage(
        {
          ...usageInput("truncated-1"),
          outcome: "schema_invalid",
          consumedIncludedBuild: false,
        },
        tx
      )
    );
    expect(
      await scope.accessors.firstBillableAttempt({
        purpose: "onboarding_brain",
        settlement: "unsettled",
      }),
      "a truncated reply consumed the creator's included build"
    ).toEqual([]);

    // ...and the NEXT attempt, which really does consume it, takes it. Without
    // this half the case passes against a writer that claims nothing ever.
    await db.transaction((tx) =>
      caps.recordModelUsage(usageInput("real-1"), tx)
    );
    const [claim] = await scope.accessors.firstBillableAttempt({
      purpose: "onboarding_brain",
      settlement: "unsettled",
    });
    expect(claim?.attemptId).toBe("real-1");
  });

  it("`settlement: settled` REFUSES an absent claim; `unsettled` reports it", async () => {
    // BOTH BRANCHES OF THE REQUIRED PARAMETER, driven. A required parameter
    // whose false side no test drives reads like a guard and is not one
    // (CLAUDE.md, 2026-08-29) — and this one is the reason a missing claim
    // cannot be read as an entitlement: at the debit, R11 guarantees this
    // attempt's billable usage row has already committed, so no claim means
    // the claim writer did not run, and answering "unclaimed" would hand out a
    // free build on the strength of a missing record.
    const [fresh] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: aWorkspaceId, displayName: "A-four" })
      .returning();
    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      fresh.id
    );
    expect(
      await scope.accessors.firstBillableAttempt({
        purpose: "onboarding_brain",
        settlement: "unsettled",
      })
    ).toEqual([]);
    await expect(
      scope.accessors.firstBillableAttempt({
        purpose: "onboarding_brain",
        settlement: "settled",
      })
    ).rejects.toThrow(/no first-billable claim exists/);

    // ...and once a claim exists, the settled read returns it rather than
    // throwing — so the refusal is about ABSENCE, not about the parameter.
    await db.transaction((tx) =>
      writeCapabilities(scope).recordModelUsage(usageInput("settled-1"), tx)
    );
    const [claim] = await scope.accessors.firstBillableAttempt({
      purpose: "onboarding_brain",
      settlement: "settled",
    });
    expect(claim?.attemptId).toBe("settled-1");
  });

  it("countOnboardingInputs counts THIS profile's inputs only", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const sibling = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      p2
    );
    const before = {
      mine: await scope.accessors.countOnboardingInputs(),
      theirs: await sibling.accessors.countOnboardingInputs(),
    };
    await caps.appendOnboardingInput({ inputClass: "own_post", content: "mine one" });
    await caps.appendOnboardingInput({ inputClass: "own_post", content: "mine two" });
    await writeCapabilities(sibling).appendOnboardingInput({
      inputClass: "own_post",
      content: "theirs",
    });

    expect((await scope.accessors.countOnboardingInputs()) - before.mine).toBe(2);
    expect(
      (await sibling.accessors.countOnboardingInputs()) - before.theirs
    ).toBe(1);
  });

  it("countReferencePosts counts THIS profile's reference posts only", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const sibling = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      p2
    );
    const before = {
      mine: await scope.accessors.countReferencePosts(),
      theirs: await sibling.accessors.countReferencePosts(),
    };
    await caps.appendOnboardingInput({ inputClass: "reference", content: "mine ref one" });
    await caps.appendOnboardingInput({ inputClass: "reference", content: "mine ref two" });
    await writeCapabilities(sibling).appendOnboardingInput({
      inputClass: "reference",
      content: "theirs ref",
    });

    expect(
      (await scope.accessors.countReferencePosts()) - before.mine,
      "the sibling's reference posts leaked into this profile's count"
    ).toBe(2);
    expect(
      (await sibling.accessors.countReferencePosts()) - before.theirs
    ).toBe(1);
  });

  it("brainAssetSummary uses exact database counts beyond list pages and isolates both tenant axes", async () => {
    const scope = await mintP1();
    const workspaceScope = await withWorkspace(db, { authUserId: "user_a" });
    const sibling = await ProfileScope.mint(db, workspaceScope, p2);
    const foreign = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_b" }),
      p3
    );
    const before = {
      mine: await scope.accessors.brainAssetSummary(),
      sibling: await sibling.accessors.brainAssetSummary(),
      foreign: await foreign.accessors.brainAssetSummary(),
    };

    const rule = (suffix: string) => ({
      metricLabel: `Followers ${suffix}`,
      metricKey: `followers-${suffix}`,
      metricUnit: "followers per 1k views",
      metricDirection: "higher_is_better" as const,
      lever: "reach" as const,
      platform: "shorts",
      audienceClass: "organic" as const,
      observedFrom: "2026-08-01T00:00:00.000Z",
      observedTo: "2026-08-31T00:00:00.000Z",
      treatmentN: 3,
      baselineN: 3,
      treatmentMedianPer1k: 2,
      baselineMedianPer1k: 1,
      effectPer1k: 1,
      pastOutcome: "better" as const,
      evidenceStrength: "early" as const,
      selfReportedN: 6,
      connectorVerifiedN: 0,
      confounders: [],
    });
    const rules = [rule("one"), rule("two"), rule("three")];
    await db.insert(brainDocs).values([
      {
        profileId: p1,
        workspaceId: aWorkspaceId,
        kind: "performance_meta",
        version: 199,
        content: { rules: rules.slice(0, 1) },
        reason: RENDERED_REASON,
        sourceEvidence: RAW_EVIDENCE,
        status: "superseded",
      },
      {
        profileId: p1,
        workspaceId: aWorkspaceId,
        kind: "performance_meta",
        version: 200,
        content: { rules },
        reason: RENDERED_REASON,
        sourceEvidence: RAW_EVIDENCE,
        status: "superseded",
      },
    ]);

    const metricDeclaredByDocId = RESULT_STRATUM.get(p1)!.metricDeclaredByDocIds[0]!;
    const extraCount = 201;
    await db.insert(results).values(Array.from({ length: extraCount }, (_, index) => ({
      profileId: p1,
      workspaceId: aWorkspaceId,
      platform: `summary-${index}`,
      audienceClass: "organic" as const,
      metricKey: "summary-metric",
      metricDeclaredByDocId,
      observedFrom: new Date("2026-08-01T00:00:00.000Z"),
      observedTo: new Date("2026-08-31T00:00:00.000Z"),
      evidenceState: "unquantified" as const,
      confounders: [],
    })));

    const [activation] = await db.insert(brainActivationSnapshots).values({
      profileId: p1,
      workspaceId: aWorkspaceId,
    }).returning();
    const attempts = Array.from({ length: extraCount }, (_, index) => ({
      profileId: p1,
      workspaceId: aWorkspaceId,
      attemptId: `brain-asset-summary-${index}`,
      purpose: "generation",
      mode: "hookSet",
      payloadSha256: index.toString(16).padStart(64, "0"),
    }));
    await db.insert(generationAttempts).values(attempts);
    const generated = await db.insert(generations).values(attempts.map((attempt, index) => ({
      profileId: p1,
      workspaceId: aWorkspaceId,
      attemptId: attempt.attemptId,
      mode: attempt.mode,
      brainActivationId: activation.id,
      request: { idea: `summary ${index}` },
      model: "fixture-model",
      promptBundleVersion: "fixture-bundle",
      configVersion: 1,
      outcome: "usable" as const,
      output: { hooks: [`hook ${index}`] },
      weakestPoint: "fixture",
      killTest: { rulesFired: [], rewritten: false },
    }))).returning();
    await db.insert(generationFeedback).values(generated.map((generation) => ({
      profileId: p1,
      workspaceId: aWorkspaceId,
      generationId: generation.id,
      reaction: "used_as_is" as const,
    })));

    const after = await brainAssetSummary(db, workspaceScope, p1);
    expect(after).toEqual({
      brainVersions: before.mine.brainVersions + 2,
      testedRules: Math.max(before.mine.testedRules, rules.length),
      loggedResults: before.mine.loggedResults + extraCount,
      feedback: before.mine.feedback + extraCount,
    });
    expect(await scope.accessors.results({ limit: 200 })).toHaveLength(200);
    expect(await scope.accessors.generationFeedback({ limit: 200 })).toHaveLength(200);
    expect(await sibling.accessors.brainAssetSummary()).toEqual(before.sibling);
    expect(await foreign.accessors.brainAssetSummary()).toEqual(before.foreign);
    await expect(brainAssetSummary(db, workspaceScope, p3)).rejects.toBeInstanceOf(
      ProfileAccessError
    );
  });

  it("P4 cross-workspace axis: a cross-parented row is invisible to the accessor", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    // THE HAND-LIST IS CHECKED AGAINST THE ACCESSOR MAP. Every accessor whose
    // table appears here must be named; a new accessor over a covered table
    // fails HERE rather than silently going untested on the cross-workspace
    // axis. `profile` is the anchor row itself, not a child, so it is not in
    // this table at all.
    {
      const scope = await mintP1();
      const covered = new Set<string>(CROSS_PARENTED.flatMap((c) => c.accessors));
      const tableOf: Record<string, string | undefined> = {
        brainDocs: "brain_docs",
        brainDocsByKind: "brain_docs",
        brainDocsByIds: "brain_docs",
        // One aggregate spans four scoped tables and has a dedicated
        // same-profile/sibling/cross-workspace count witness above.
        brainAssetSummary: undefined,
        onboardingInputs: "onboarding_inputs",
        referenceCorpusAsOf: "onboarding_inputs",
        modelUsage: "model_usage",
        firstBillableAttempt: "first_billable_attempts",
        countOnboardingInputs: "onboarding_inputs",
        onboardingInputsByIds: "onboarding_inputs",
        ownPostsNewest: "onboarding_inputs",
        countOwnPosts: "onboarding_inputs",
        countReferencePosts: "onboarding_inputs",
        countUnchargedBillableAttempts: "model_usage",
        sumUnchargedBillableCostMicroUsd: "model_usage",
        latestBrainActivation: "brain_activation_snapshots",
        profile: "creator_profiles",
        // One accessor spans every included table, so it cannot be assigned
        // ONE table in this one-table completeness map. Its all-table
        // isolation is not therefore unasserted: the three `exportPage` cases
        // above cover both axes across every branch, and export.test.ts drives
        // the same six through `openBrainExport` end to end.
        exportPage: undefined,
        // Slice 7.
        generationFeedback: "generation_feedback",
        privateFrameworks: "frameworks",
        eligibleFrameworks: "frameworks",
        // Slice 9a.
        strategyMetricVersions: "brain_docs",
        results: "results",
        generationsNewest: "generations",
        comparableResults: "results",
        // Composition accessors span more than one scoped table (and review
        // includes relational evidence joins), so each gets its explicit
        // cross-axis witnesses in the focused promotion suite rather than a
        // misleading single-table classification here.
        promotionResultInputs: undefined,
        promotionFeedbackInputs: undefined,
        promotionProposalReview: undefined,
        promotionProposalHistory: undefined,
      };
      const namedTables = new Set<string>(CROSS_PARENTED.map((c) => c.table));
      const missing = Object.keys(scope.accessors).filter((a) => {
        const t = tableOf[a];
        return t !== undefined && namedTables.has(t) && !covered.has(a);
      });
      expect(
        missing,
        "an accessor over a cross-parented table is not in CROSS_PARENTED — it would never be tested on the workspace axis"
      ).toEqual([]);
      // ...and the map itself must know every accessor, so adding one without
      // classifying its table fails here too.
      expect(
        Object.keys(scope.accessors).filter((a) => !(a in tableOf))
      ).toEqual([]);
    }
    for (const { table, fks, triggers, profileColumn, accessors } of CROSS_PARENTED) {
      await expect(
        db.transaction(async (tx) => {
          // `fks` IS A LIST, not a single name (slice 7) — the same correction
          // `CHILD_BRANCHES` above took in slice 6, and for the identical
          // reason: the re-parenting UPDATE has to be LEGAL once the
          // constraints are dropped, and a table can be held by more than one
          // composite FK carrying `workspace_id`. `generation_feedback` is the
          // first entry here that is.
          for (const [fkTable, fk] of fks) {
            await tx.execute(
              sql.raw(`ALTER TABLE ${fkTable} DROP CONSTRAINT ${fk}`)
            );
          }
          // A CONSTRAINT IS NOT THE ONLY THING THAT REFUSES THE UPDATE.
          // DISABLE rather than DROP, so the rollback restores it.
          for (const trigger of triggers as readonly string[]) {
            await tx.execute(
              sql.raw(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`)
            );
          }
          // p1's id, but B's workspace: the shape the composite FK forbids.
          await tx.execute(
            sql.raw(
              `UPDATE ${table} SET workspace_id = '${bWorkspaceId}' WHERE ${profileColumn} = '${p1}'`
            )
          );
          const scope = await ProfileScope.mint(tx, scopeA, p1);
          for (const key of accessors) {
            const scoped = await invoke(
              scope,
              key as keyof ProfileScope["accessors"]
            );
            // The two-predicate accessor sees NOTHING; a profile-only query
            // would still see the re-parented row. That difference is the whole
            // assertion — drop the workspace_id predicate and this goes red.
            expect(
              scoped,
              `${table}.${key} leaked a cross-parented row`
            ).toHaveLength(0);
          }
          const profileOnly = await tx.execute(
            sql.raw(`SELECT id FROM ${table} WHERE ${profileColumn} = '${p1}'`)
          );
          expect(
            profileOnly.rows.length,
            `${table} fixture is vacuous — the re-parented row does not exist`
          // AT LEAST one, not exactly one. The assertion's job is
          // non-vacuity — "the row the scoped accessor refused to return does
          // exist" — and pinning the exact count made it a fixture-size
          // assertion as well, so seeding a second `onboarding_inputs` row for
          // the corpus accessor broke a test that has nothing to do with
          // corpora.
          ).toBeGreaterThan(0);
          throw new Error("rollback");
        })
      ).rejects.toThrow("rollback");
    }
    // The constraints survive the rollback — the next test is not poisoned.
    // EVERY FK this test drops is checked, so the population is the one the
    // test actually touches rather than a second hand-written list.
    for (const { fks } of CROSS_PARENTED) {
      for (const [fkTable, fk] of fks) {
        const found = await db.execute(
          sql.raw(
            `SELECT 1 FROM pg_constraint WHERE conname = '${fk}' AND conrelid = '${fkTable}'::regclass`
          )
        );
        expect(found.rows.length, `${fk} was not restored`).toBe(1);
      }
    }
  });

  // ------------------------------------------------------- comparableResults
  //
  // TWO BRANCHES, TESTED IN TWO PLACES, and the division is deliberate:
  //
  //   NO STRATUM — the call 9a makes. `accessorArgs.comparableResults` is `[]`,
  //     so the SHARED P4 loops and the CROSS_PARENTED loop drive it on both
  //     axes like every other accessor, and its bound gets its own case below.
  //
  //   WITH A STRATUM — 9b's per-cohort fetch, which the shared loops cannot
  //     drive (one tuple per accessor, and the stratum names a different
  //     `brain_docs` row per profile). Its cases are here, and they are the
  //     control that keeps this SQL and `@respin/brain`'s `inStratum` reading
  //     the stratum the same way — the agreement slice 8c's most expensive
  //     defect was the absence of.

  it("comparableResults WITH A STRATUM returns THIS profile's rows only, from BOTH sides", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    for (const self of [p1, p2] as const) {
      const scope = await ProfileScope.mint(db, scopeA, self);
      const population = await scope.accessors.comparableResults(
        RESULT_STRATUM.get(self)!
      );
      expect(
        population.rows.length,
        `comparableResults returned nothing for ${self} - its validator would be vacuous`
      ).toBeGreaterThan(0);
      // The shared breach validator, called explicitly so it is not inert.
      await breachValidators.comparableResults(population.rows, self, aWorkspaceId);
      expect(population.truncated).toBe(false);
      expect(population.limit).toBe(COMPARISON_POPULATION_MAX);
    }
    // THE SHARPEST CASE, and the reason `metricDeclaredByDocIds` is a predicate
    // rather than a display field: p1 NAMES THE SIBLING'S declared-metric
    // document set explicitly. The composite FK cannot help here - the ids are
    // query ARGUMENT, not a stored column - so the profile predicate in the
    // WHERE is the only thing between a named sibling id and the sibling's
    // rows. Drop it and this returns p2's result.
    const scope = await ProfileScope.mint(db, scopeA, p1);
    const foreign = await scope.accessors.comparableResults(
      RESULT_STRATUM.get(p2)!
    );
    expect(
      foreign.rows,
      "naming the SIBLING's declared-metric document reached the sibling's results"
    ).toEqual([]);
  });

  it("comparableResults WITH A STRATUM: cross-workspace axis, a cross-parented row is invisible", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const RESULT_FKS = [
      "results_profile_workspace_fk",
      "results_generation_fk",
      "results_metric_doc_fk",
    ];
    await expect(
      db.transaction(async (tx) => {
        for (const fk of RESULT_FKS) {
          await tx.execute(sql.raw(`ALTER TABLE results DROP CONSTRAINT ${fk}`));
        }
        await tx.execute(sql.raw(
          "ALTER TABLE proposal_evidence_results DROP CONSTRAINT proposal_evidence_results_result_fk"
        ));
        await tx.execute(
          sql.raw(
            `UPDATE results SET workspace_id = '${bWorkspaceId}' WHERE profile_id = '${p1}'`
          )
        );
        const scope = await ProfileScope.mint(tx, scopeA, p1);
        const population = await scope.accessors.comparableResults(
          RESULT_STRATUM.get(p1)!
        );
        // The two-predicate query sees NOTHING; a profile-only query would
        // still see the re-parented row. That difference is the assertion -
        // drop the workspace_id predicate and this goes red.
        expect(
          population.rows,
          "comparableResults leaked a cross-parented row"
        ).toHaveLength(0);
        const profileOnly = await tx.execute(
          sql.raw(`SELECT id FROM results WHERE profile_id = '${p1}'`)
        );
        expect(
          profileOnly.rows.length,
          "the results fixture is vacuous - the re-parented row does not exist"
        ).toBeGreaterThan(0);
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");
    // The constraints survive the rollback - the next test is not poisoned.
    for (const fk of RESULT_FKS) {
      const found = await db.execute(
        sql.raw(
          `SELECT 1 FROM pg_constraint WHERE conname = '${fk}' AND conrelid = 'results'::regclass`
        )
      );
      expect(found.rows.length, `${fk} was not restored`).toBe(1);
    }
  });

  it("comparableResults filters IN SQL: each stratum predicate excludes on its own", async () => {
    // THE DERIVED-GUARD DISCIPLINE (CLAUDE.md 2026-08-21): six planted rows,
    // each differing on exactly ONE predicate. A predicate dropped from the
    // WHERE reddens exactly one case and names it, rather than being invisible
    // because some other predicate happened to exclude the row too.
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const scope = await ProfileScope.mint(db, scopeA, p1);
    const stratum = RESULT_STRATUM.get(p1)!;
    // A SECOND Strategy version for p1 with the exact same semantic metric
    // tuple. The default one-id stratum excludes it; the widened two-id
    // stratum below proves SQL IN pools it without weakening either scope axis.
    const [otherDoc] = await db
      .insert(brainDocs)
      .values({
        profileId: p1,
        workspaceId: aWorkspaceId,
        kind: "strategy",
        version: 2,
        content: {
          metric: {
            label: "Followers",
            unit: "per 1k views",
            direction: "higher_is_better",
          },
        },
        reason: RENDERED_REASON,
        sourceEvidence: RAW_EVIDENCE,
      })
      .returning();
    const base = {
      profileId: p1,
      workspaceId: aWorkspaceId,
      platform: stratum.platform,
      audienceClass: stratum.audienceClass,
      metricKey: stratum.metricKey,
      metricDeclaredByDocId: stratum.metricDeclaredByDocIds[0]!,
      observedFrom: new Date("2026-08-02"),
      observedTo: new Date("2026-08-09"),
      evidenceState: "quantified_self_reported" as const,
      reachValue: "1",
      reachDenominator: "1000",
    };
    const before = (await scope.accessors.comparableResults(stratum)).rows.length;
    const planted: [string, Record<string, unknown>][] = [
      ["another platform", { platform: "reels" }],
      ["the other audience class", { audienceClass: "paid" }],
      ["another metric key", { metricKey: "watch_time" }],
      // Same KEY, different declared VERSION - the predicate `ComparisonStratum`
      // could not express until Amendment 1, and the one a metric edit produces.
      ["another declared metric VERSION", { metricDeclaredByDocId: otherDoc.id }],
      ["a window starting before the stratum", { observedFrom: new Date("2026-06-01") }],
      ["a window ending after the stratum", { observedTo: new Date("2026-10-01") }],
    ];
    for (const [label, over] of planted) {
      const [planted_row] = await db
        .insert(results)
        .values({ ...base, ...over } as never)
        .returning();
      const after = await scope.accessors.comparableResults(stratum);
      expect(
        after.rows.length,
        `a result with ${label} entered the population - that predicate is not in the query`
      ).toBe(before);
      await db.delete(results).where(eq(results.id, planted_row.id));
    }
    // NON-VACUITY: a row that matches every predicate DOES enter, so the six
    // exclusions above are the predicates working rather than an empty query.
    await db.insert(results).values(base as never);
    expect((await scope.accessors.comparableResults(stratum)).rows.length).toBe(
      before + 1
    );
    const [equivalentVersionResult] = await db.insert(results).values({
      ...base,
      metricDeclaredByDocId: otherDoc.id,
      observedFrom: new Date("2026-08-03"),
      observedTo: new Date("2026-08-10"),
    } as never).returning();
    expect((await scope.accessors.comparableResults(stratum)).rows)
      .not.toContainEqual(expect.objectContaining({ id: equivalentVersionResult.id }));
    const pooled = await scope.accessors.comparableResults({
      ...stratum,
      metricDeclaredByDocIds: [stratum.metricDeclaredByDocIds[0]!, otherDoc.id],
    });
    expect(pooled.rows).toContainEqual(
      expect.objectContaining({ id: equivalentVersionResult.id })
    );
  });

  // =========================================================================
  // WHAT A GREEN RUN OF THE NEXT CASE DOES AND DOES NOT PROVE.
  //
  // Written out in the shape `tests/results-honesty.test.tsx` uses for R20, and
  // for the same reason: this case ends in a NEGATIVE pattern over copy, and a
  // reader who sees it green beside the words "unconditional promise" will
  // believe more than is true unless the limit is on the page.
  //
  // IT PROVES THREE THINGS:
  //
  //   1. Every false branch of the stratum check is DRIVEN and raises
  //      `ComparisonStratumError` — not `WorkspaceAccessError`, whose copy
  //      would tell the reader to sign in as somebody else, and not a raw
  //      driver error.
  //   2. The three refusals are DISTINGUISHABLE from each other and name no
  //      uuid, so a reader (or a log) learns which part of the stratum was
  //      unusable without learning a `brain_docs` id's creation time.
  //   3. The usable remedy is present, and the specific WRONG instruction
  //      ("sign in", "the account that owns it", "ask its owner") cannot
  //      reappear — that one is an enumerated ban over a THREE-STRING space
  //      taken verbatim from the copy this class was split out of, so the
  //      enumeration really is the class there.
  //
  // IT DOES NOT PROVE THAT THIS REFUSAL MAKES NO PROMISE ABOUT WHAT WAS
  // PRESERVED. The last assertion is a pattern over words, and the promise can
  // be written without any of them: "your results are intact", "we kept
  // everything", "your log is exactly as you left it" would all pass. That gap
  // is real, it is the author's own least-confident line carried in rather than
  // discovered later, and the two ways to close it are both worse:
  //
  //   - A BIGGER ALTERNATION is counterexamples wearing the word "class".
  //     CLAUDE.md's 2026-08-18 lesson is precisely this failure — a guard
  //     hardened twice against named counterexamples and failing a third gate
  //     round with nine more over-accepts in unlisted classes — and every entry
  //     added makes the pattern LOOK more complete while covering no more of
  //     the space.
  //   - AN ALLOWLIST OF PERMITTED SENTENCES would make every copy edit a test
  //     edit, which is how a control becomes a formality people route around.
  //
  // SO WHAT THIS ASSERTION IS FOR is the regression it can actually catch: the
  // exact sentence that WAS here (`— nothing was changed`) being typed back in
  // by somebody being kind, which is the likely edit and is what the mutation
  // run on 2026-09-04 confirmed it reddens on. Whether some NEW wording quietly
  // promises the same thing is a judgement, and the person who makes it is the
  // reviewer at the learning-honesty gate — with this paragraph telling them
  // the suite did not make it for them.
  // =========================================================================
  it("comparableResults REFUSES an unusable stratum, with a remedy the reader can act on", async () => {
    const scope = await mintP1();
    const stratum = RESULT_STRATUM.get(p1)!;
    // Each false branch driven: an Invalid Date reaches the driver as NaN, a
    // reversed window is a population nobody can state, and an audience class
    // outside the closed set reaches the pgEnum as a 22P02.
    const attempt = (over: Record<string, unknown>) =>
      scope.accessors
        .comparableResults({ ...stratum, ...over } as never)
        .catch((e: unknown) => e);
    const cases: [string, Record<string, unknown>][] = [
      ["an Invalid Date", { observedTo: new Date("nonsense") }],
      [
        "a reversed window",
        { observedFrom: stratum.observedTo, observedTo: stratum.observedFrom },
      ],
      ["an audience class outside the closed set", { audienceClass: "boosted" }],
    ];
    const messages: string[] = [];
    for (const [label, over] of cases) {
      const error = await attempt(over);
      // A DISTINCT CLASS, not `WorkspaceAccessError` (2026-09-04). That class
      // IS covered in `billing-errors.ts`, so this would not have been
      // "Something went wrong" - it would have been that code's copy, which
      // tells the reader to sign in with a different account. A usable and
      // WRONG remedy is the failure this split closes.
      expect(error, label).toBeInstanceOf(ComparisonStratumError);
      const message = (error as Error).message;
      messages.push(message);
      // THE REMEDY IS ASSERTED, not just the class: the requirement on this
      // message is that the printed fix is something the reader can actually
      // do, and the specific WRONG instruction is pinned OUT.
      expect(message, label).not.toMatch(/sign in|account that owns|ask its owner/i);
      expect(message, label).toContain("Reload the page");
      // ...AND THE UNCONDITIONAL REASSURANCE IS PINNED OUT. The message used to
      // end "nothing was changed", which was true while the only raiser was a
      // scoped READ and becomes a confident, WRONG promise the moment 9b
      // raises this class from inside a transaction that has already written.
      // A caller that can honestly make that promise makes it itself, where
      // the knowledge is (`ComparisonStratumError`'s docblock; the four
      // refusals in `errors.ts` that DO keep the sentence carry their basis
      // beside it). READ THE DISCLOSURE ABOVE THIS CASE before trusting this
      // line: it bans the spellings it enumerates, NOT the class of claim.
      expect(
        message,
        `${label}: the refusal makes an unconditional promise about what was preserved - see ComparisonStratumError's docblock`
      ).not.toMatch(
        /nothing was (changed|saved|stored|written|lost)|(is|are|remain[s]?) (safe|untouched|unaffected)|no( thing)? .{0,20}(was|were) (changed|written)/i
      );
      // ...and it names WHICH part was unusable in words, never a uuid - the
      // `ProfileAccessError` rule, because a stratum carries a `brain_docs` id
      // and echoing one leaks creation time.
      for (const docId of stratum.metricDeclaredByDocIds) {
        expect(message, label).not.toContain(docId);
      }
    }
    // The three refusals are DISTINGUISHABLE from each other, so whoever reads
    // one knows which part of the stratum was wrong.
    expect(new Set(messages).size).toBe(3);
  });

  it("comparableResults refuses empty or cast-forged metric declaration sets before querying", async () => {
    const scope = await mintP1();
    const stratum = RESULT_STRATUM.get(p1)!;
    for (const metricDeclaredByDocIds of [
      [],
      "not-an-array",
      ["not-a-uuid"],
      [stratum.metricDeclaredByDocIds[0]!, stratum.metricDeclaredByDocIds[0]!],
    ]) {
      await expect(
        scope.accessors.comparableResults({
          ...stratum,
          metricDeclaredByDocIds,
        } as never)
      ).rejects.toBeInstanceOf(ComparisonStratumError);
    }
  });

  it("P4 write side: a write carries the SCOPE's ids, never the caller's", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);

    // A caller that tries to name another profile/workspace: the ids are not
    // in the input type at all (AC-11 proves that at compile time), so the
    // runtime attempt has to be cast in. Both halves are asserted — the strip
    // AND the ids-last spread.
    const forged = {
      inputClass: "own_post" as const,
      content: "smuggled",
      profileId: p2,
      workspaceId: bWorkspaceId,
      id: NIL_UUID,
      contentSha256: "0".repeat(64),
    } as unknown as Parameters<
      ProfileWriteCapabilities["appendOnboardingInput"]
    >[0];
    const written = await caps.appendOnboardingInput(forged);
    expect(written.profileId).toBe(p1);
    expect(written.workspaceId).toBe(aWorkspaceId);
    expect(written.id).not.toBe(NIL_UUID);
    expect(written.contentSha256).toBe(sha256("smuggled"));

    // P2's rows are untouched.
    const p2Scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      p2
    );
    const p2Inputs = await p2Scope.accessors.onboardingInputs();
    expect(p2Inputs.map((r) => r.content)).not.toContain("smuggled");
  });

  it("P4 write side: writeBrainDoc derives status and version server-side", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        { kind: "voice", content: VOICE_CONTENT, sourceEvidence: FIXTURE_EVIDENCE, reason: FIXTURE_REASON },
        tx
      )
    );
    // M2a writes 'proposed' ONLY (A-10) — the fixture seeded an ACTIVE v1, so
    // a caller-chosen status would show up as a second active row.
    expect(doc.status).toBe("proposed");
    // max+1 over the (profile, kind) pair, not 1 and not the caller's number.
    expect(doc.version).toBe(2);
    expect(doc.profileId).toBe(p1);
    expect(doc.workspaceId).toBe(aWorkspaceId);
  });

  it("P4 write side: a cast-in status and version are STRIPPED at runtime, not merely untypeable", async () => {
    // AC-11 proves the ids, status, version and the two timestamps cannot be
    // TYPED. This is the other half, and it is not redundant: a mutation that
    // removed both the `GUARDED` strip and the explicit `status: "proposed"`
    // left the suite GREEN, because the column DEFAULTS to 'proposed' and no
    // test smuggled one past the type system. That is round 2's silent-brain-
    // activation finding re-opened one layer down — typed shut, runtime open.
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const smuggled = {
      kind: "voice",
      content: VOICE_CONTENT,
      sourceEvidence: FIXTURE_EVIDENCE,
      reason: FIXTURE_REASON,
      status: "active",
      version: 99,
      activatedAt: new Date(),
      supersededAt: new Date(),
      id: NIL_UUID,
      profileId: p2,
      workspaceId: bWorkspaceId,
    } as unknown as Parameters<ProfileWriteCapabilities["writeBrainDoc"]>[0];
    const doc = await db.transaction((tx) => caps.writeBrainDoc(smuggled, tx));
    expect(doc.status, "a caller-supplied status reached the row").toBe(
      "proposed"
    );
    expect(doc.version, "a caller-supplied version reached the row").toBe(2);
    expect(doc.activatedAt).toBeNull();
    expect(doc.supersededAt).toBeNull();
    expect(doc.id).not.toBe(NIL_UUID);
    expect(doc.profileId).toBe(p1);
    expect(doc.workspaceId).toBe(aWorkspaceId);
    // ...and the fixture's ACTIVE v1 is still the only active row, which is
    // what a smuggled 'active' would have broken.
    const active = (await scope.accessors.brainDocsByKind("voice")).filter(
      (d) => d.status === "active"
    );
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(1);
  });

  it("P4 write side: writeBrainDoc PARSES — the strip, the schema and the writable-kind set all run HERE", async () => {
    // THE BLOCK. Round 6 closed the `serverOwned` strip inside
    // `parseBrainContent` and reddened its mutation — but `writeBrainDoc`
    // never called `parseBrainContent`, so on the only live brain-write
    // surface a model-supplied value at a server-owned position was stored
    // unstripped, and content-schema validation, the claim enumeration and
    // `WRITABLE_BRAIN_KINDS` were all disarmed with it. Three mutations of the
    // wiring survived every other test in this file.
    const scope = await mintP1();
    const caps = writeCapabilities(scope);

    // (a) A server-owned position does not survive the write.
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: { ...VOICE_CONTENT, provenance: { schemaVersion: 999 } },
          sourceEvidence: FIXTURE_EVIDENCE,
          reason: FIXTURE_REASON,
        },
        tx
      )
    );
    expect(
      JSON.stringify(doc.content),
      "a caller value at a serverOwned position was STORED"
    ).not.toContain("999");
    // Non-vacuity: the rest of the document did land.
    expect((doc.content as { register: string }).register).toBe(
      VOICE_CONTENT.register
    );

    // (b) The content schema is enforced at the write, not only in a unit test.
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: { ...VOICE_CONTENT, sneaky: "an undeclared position" },
            sourceEvidence: FIXTURE_EVIDENCE,
            reason: FIXTURE_REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(ContentSchemaError);

    // (c) Slice 9b makes `performance_meta` writable. An invalid payload now
    // reaches its exact closed schema rather than the old not-yet-writable
    // refusal; only the promotion ceremony supplies a valid version.
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "performance_meta",
            content: {},
            sourceEvidence: FIXTURE_EVIDENCE,
            reason: FIXTURE_REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(ContentSchemaError);
  });

  it("P4 write side: every field of the params is read ONCE — a getter cannot swap the content after it is checked", async () => {
    // C-40. `WriteBrainDocParams` is a plain object type, so a caller can hand
    // in one whose `content` is a GETTER. Validate on one read and store on
    // another and every guard passes on a value that is not the one stored.
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    let reads = 0;
    const shifting = {
      kind: "voice",
      sourceEvidence: FIXTURE_EVIDENCE,
      reason: FIXTURE_REASON,
      get content() {
        reads += 1;
        return { ...VOICE_CONTENT, register: reads === 1 ? "FIRST" : "SECOND" };
      },
    } as unknown as Parameters<ProfileWriteCapabilities["writeBrainDoc"]>[0];
    const doc = await db.transaction((tx) => caps.writeBrainDoc(shifting, tx));
    expect(
      (doc.content as { register: string }).register,
      "the stored content came from a LATER read than the one that was checked"
    ).toBe("FIRST");
    expect(reads, "content was read more than once").toBe(1);
  });

  it("P4 write side: the stored `reason` is SERVER-RENDERED — caller prose never reaches the column", async () => {
    // A MUTATION SURVIVOR, found by running it rather than by reading. The
    // renderer's own suite proves `renderBrainReason` ignores a smuggled
    // `detail`; nothing proved that `writeBrainDoc` CALLS it. A mutant that
    // stored `reason.detail` when present, falling back to the renderer,
    // passed every other test in this file — so on the one live brain-write
    // surface an invented specific was still storable and exportable.
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const smuggled = {
      kind: "voice",
      content: VOICE_CONTENT,
      sourceEvidence: FIXTURE_EVIDENCE,
      reason: {
        code: "creator_edit",
        detail: "a devout Catholic mother in Leeds, 42000 followers",
      },
    } as unknown as Parameters<ProfileWriteCapabilities["writeBrainDoc"]>[0];
    const doc = await db.transaction((tx) => caps.writeBrainDoc(smuggled, tx));
    expect(doc.reason, "caller prose reached brain_docs.reason").not.toContain(
      "Leeds"
    );
    expect(doc.reason).not.toContain("42000");
    // Positively: it is the sentence the server writes, at the version the
    // server derived — so the assertion cannot be satisfied by an empty column.
    expect(doc.reason).toBe(`Version ${doc.version}: you edited this document.`);
  });

  it("writeBrainDoc validates every source-evidence quote against THIS profile's inputs", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    // SELECTED BY CLASS, not by position. This read `[own] = ...` and relied on
    // the accessor's insertion order — an order it never promised. Slice 1 gave
    // `onboardingInputs` an explicit newest-first ordering (one display order,
    // one place), and the reference input this profile also holds is the newer
    // one, so position 0 became the reference and this test began failing on a
    // rule it was not written to exercise.
    const inputs = await scope.accessors.onboardingInputs();
    const own = inputs.find((i) => i.inputClass === "own_post")!;
    expect(own, "the fixture must hold an own_post input").toBeDefined();
    const [foreign] = await db
      .select()
      .from(onboardingInputs)
      .where(eq(onboardingInputs.profileId, p3));

    // An inputId belonging to ANOTHER profile is refused — the composite FK
    // cannot see inside jsonb, so this is the only guard there is.
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: VOICE_CONTENT,
            sourceEvidence: [
              {
                field: "/register",
                quote: foreign.content.slice(0, 5),
                inputId: foreign.id,
                startUtf16: 0,
                endUtf16: 5,
              },
            ],
            reason: FIXTURE_REASON,
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProfileAccessError);

    // A quote that is not verbatim at the stated offsets is refused too: an
    // invented quote carries a fabricated warrant, which is worse than an
    // invented field.
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: VOICE_CONTENT,
            sourceEvidence: [
              {
                field: "/register",
                quote: "words nobody wrote",
                inputId: own.id,
                startUtf16: 0,
                endUtf16: 5,
              },
            ],
            reason: FIXTURE_REASON,
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProvenanceError);

    // ...and the honest one lands.
    const ok = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: VOICE_CONTENT,
          sourceEvidence: [
            {
              field: "/register",
              quote: own.content.slice(3, 9),
              inputId: own.id,
              startUtf16: 3,
              endUtf16: 9,
            },
          ],
          reason: FIXTURE_REASON,
        },
        tx
      )
    );
    expect(ok.version).toBe(2);
  });

  // ------------------------------------------------------------------ AC-11

  it("AC-11: no server-derived column is caller-settable (compile-level)", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    // Non-literals, so excess-property checking does NOT fire — this is the
    // shape round 3 found compiling at exit 0 (`declare const full: NewBrainDoc`).
    const withIds = JSON.parse("{}") as {
      kind: "voice";
      content: unknown;
      sourceEvidence: null;
      reason: BrainDocReason;
      profileId: string;
    };
    const withStatus = JSON.parse("{}") as {
      kind: "voice";
      content: unknown;
      sourceEvidence: null;
      reason: BrainDocReason;
      status: "active";
    };
    const withVersion = JSON.parse("{}") as {
      kind: "voice";
      content: unknown;
      sourceEvidence: null;
      reason: BrainDocReason;
      version: number;
    };
    const withActivatedAt = JSON.parse("{}") as {
      kind: "voice";
      content: unknown;
      sourceEvidence: null;
      reason: BrainDocReason;
      activatedAt: Date;
    };
    const never = () => {
      // @ts-expect-error — a non-literal carrying profileId must not compile.
      void caps.writeBrainDoc(withIds, null as never);
      // @ts-expect-error — nor one carrying status (round-2's silent activation).
      void caps.writeBrainDoc(withStatus, null as never);
      // @ts-expect-error — nor one carrying version (round-3's missing field).
      void caps.writeBrainDoc(withVersion, null as never);
      // @ts-expect-error — nor one carrying activatedAt.
      void caps.writeBrainDoc(withActivatedAt, null as never);
    };
    expect(typeof never).toBe("function");
  });

  it("AC-11: a duplicate (profile, kind, version) is refused by the index", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    await db.transaction((tx) =>
      caps.writeBrainDoc(
        { kind: "voice", content: VOICE_CONTENT, sourceEvidence: FIXTURE_EVIDENCE, reason: FIXTURE_REASON },
        tx
      )
    );
    // The fixture's v1 plus the v2 just written: a hand-written duplicate of
    // either must be refused, which is what makes "version is max+1" a
    // property rather than a convention.
    await expect(
      db.insert(brainDocs).values({
        profileId: p1,
        workspaceId: aWorkspaceId,
        kind: "voice",
        version: 2,
        content: {},
        reason: RENDERED_REASON,
        sourceEvidence: RAW_EVIDENCE,
      })
    ).rejects.toThrow();
  });

  // ------------------------------------------------------------------ AC-12

  it("AC-12: writeBrainDoc refuses under an open pause; the other two do not", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    await db
      .insert(pausePeriods)
      .values({ workspaceId: aWorkspaceId, startedAt: new Date() });

    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          { kind: "voice", content: VOICE_CONTENT, sourceEvidence: FIXTURE_EVIDENCE, reason: FIXTURE_REASON },
          tx
        )
      )
    ).rejects.toBeInstanceOf(WorkspacePausedError);

    // THE CONTRAST CASES (A-7). Storing the creator's own submitted text is not
    // an entitlement, and refusing it would silently discard their work;
    // recording spend already incurred is R-28's settlement tail.
    await expect(
      caps.appendOnboardingInput({ inputClass: "own_post", content: "kept" })
    ).resolves.toBeDefined();
    await expect(
      db.transaction((tx) => caps.recordModelUsage(usageInput("att_paused"), tx))
    ).resolves.toBeDefined();
  });

  it("AC-12 drift fixture: an open pause with a CLEAN mirror is still a pause", async () => {
    // `hasOpenPause` is the AUTHORITY; `subscriptions.pausedAt` is a mirror.
    // An implementation that read the mirror (an `isPausedSubscription`) would
    // pass every other case here and go green on a workspace with no
    // subscription row at all — which is every M2 onboarding workspace.
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const subs = await db.query.subscriptions.findMany();
    expect(
      subs.filter((s) => s.workspaceId === aWorkspaceId),
      "the fixture must have NO subscription row, or the drift case is not distinguishing"
    ).toHaveLength(0);
    await db
      .insert(pausePeriods)
      .values({ workspaceId: aWorkspaceId, startedAt: new Date() });
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          { kind: "voice", content: VOICE_CONTENT, sourceEvidence: FIXTURE_EVIDENCE, reason: FIXTURE_REASON },
          tx
        )
      )
    ).rejects.toBeInstanceOf(WorkspacePausedError);
  });

  // --------------------------------------------------- normalisation (A-8)

  it("A-8: content is NFC/LF-normalised, hashed over the normalised bytes, offsets are UTF-16", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    // A decomposed é, an astral emoji, and a CRLF — the three things that make
    // an unstated unit and an unstated normalisation wrong in production and
    // green under ASCII fixtures.
    const raw = "café \u{1F600}\r\nnext";
    const normalised = raw.normalize("NFC").replace(/\r\n/g, "\n");
    const row = await caps.appendOnboardingInput({
      inputClass: "creator_authored",
      content: raw,
      // Required for this class from slice 3b — see
      // `onboarding_inputs_field_key_iff_creator_authored` and
      // `OnboardingInputFieldKeyError`.
      fieldKey: "positioning",
    });
    expect(row.content).toBe(normalised);
    expect(row.contentSha256).toBe(sha256(normalised));
    // The emoji occupies TWO UTF-16 code units; a code-point implementation
    // would return a different slice from the same offsets.
    const start = normalised.indexOf("\u{1F600}");
    const end = start + 2;
    expect(normalised.slice(start, end)).toBe("\u{1F600}");
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "voice",
          content: VOICE_CONTENT,
          sourceEvidence: [
            {
              field: "/register",
              quote: "\u{1F600}",
              inputId: row.id,
              startUtf16: start,
              endUtf16: end,
            },
          ],
          reason: FIXTURE_REASON,
        },
        tx
      )
    );
    expect(doc.sourceEvidence).toBeTruthy();
  });

  // ------------------------------------------------------------------ AC-17


  it("the two UNCHARGED bounds count and sum THIS profile only, on both axes", async () => {
    // THE WITNESS THESE TWO ACCESSORS SHIPPED WITHOUT (billing gate, round 2).
    // A reviewer planted the removal of `both(modelUsage)` — the workspace AND
    // profile predicate — from both accessors and watched 1,199 tests stay
    // green. The reason is in this file's own fixture: its `model_usage` row is
    // `consumedIncludedBuild: true`, and both accessors filter for `false`, so
    // in the ordinary state they BOTH RETURN 0 and the cross-workspace loop's
    // `toHaveLength(0)` cannot discriminate. Three comments above also cited a
    // test by a title that did not exist in this file. This is that test.
    //
    // It is the same defect this file records against itself at the
    // `countBillableAttempts` note — "0 with the cage intact, 0 with the
    // profile predicate dropped, and 0 with no cage at all" — reintroduced by
    // copying the fixture forward.
    const uncharged = (profileId: string, workspaceId: string, cost: bigint) => ({
      profileId,
      workspaceId,
      ...usageInput(`uncharged_${profileId}`),
      // THE TWO FIELDS THAT MAKE THE ROW VISIBLE to these accessors. Without
      // both, this test is the vacuous one it replaces.
      consumedIncludedBuild: false,
      outcome: "schema_invalid" as const,
      costMicroUsd: cost,
    });
    await db.insert(modelUsage).values([
      uncharged(p1, aWorkspaceId, 11n),
      // The SAME-workspace sibling: a dropped PROFILE predicate reads this.
      uncharged(p2, aWorkspaceId, 2200n),
      // The CROSS-workspace foreigner: a dropped WORKSPACE predicate reads it.
      uncharged(p3, bWorkspaceId, 330000n),
    ]);

    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      p1
    );
    const args = { purpose: usageInput("x").purpose, since: new Date(0) };

    // ONE attempt and ELEVEN micro-USD — p1's row and nothing else. The three
    // costs are deliberately different orders of magnitude so a leak in either
    // direction changes the NUMBER rather than merely the row count.
    await expect(
      scope.accessors.countUnchargedBillableAttempts(args)
    ).resolves.toBe(1);
    await expect(
      scope.accessors.sumUnchargedBillableCostMicroUsd(args)
    ).resolves.toBe(11);
  });

  it("NON-VACUITY: the foreign rows this test plants are real and visible to their OWN scopes", async () => {
    // Without this, the case above passes against an accessor that returns
    // 1 and 11 for reasons unrelated to scoping — or against rows that were
    // never inserted. Each foreign profile sees its own row and only its own.
    const uncharged = (profileId: string, workspaceId: string, cost: bigint) => ({
      profileId,
      workspaceId,
      ...usageInput(`uncharged_${profileId}`),
      consumedIncludedBuild: false,
      outcome: "schema_invalid" as const,
      costMicroUsd: cost,
    });
    await db.insert(modelUsage).values([
      uncharged(p1, aWorkspaceId, 11n),
      uncharged(p2, aWorkspaceId, 2200n),
      uncharged(p3, bWorkspaceId, 330000n),
    ]);
    const args = { purpose: usageInput("x").purpose, since: new Date(0) };
    for (const [profileId, authUserId, cost] of [
      [p2, "user_a", 2200],
      [p3, "user_b", 330000],
    ] as const) {
      const scope = await ProfileScope.mint(
        db,
        await withWorkspace(db, { authUserId }),
        profileId
      );
      await expect(
        scope.accessors.sumUnchargedBillableCostMicroUsd(args)
      ).resolves.toBe(cost);
    }
  });
  it("cost_micro_usd round-trips as a bigint (PGlite half of AC-17)", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const row = await db.transaction((tx) =>
      caps.recordModelUsage(
        { ...usageInput("att_big"), costMicroUsd: 9007199254740993n },
        tx
      )
    );
    const [read] = await db
      .select()
      .from(modelUsage)
      .where(eq(modelUsage.id, row.id));
    expect(read.costMicroUsd).toBe(9007199254740993n);
  });
});

// ---------------------------------------------------------------------------
// The two claims the tenancy gate found asserted-but-unenforced (2026-08-23).
// ---------------------------------------------------------------------------

describe("the input_class and usage_raw rules are ENFORCED, not commented", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "enf_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "enf_user", name: "E" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "E" })
      .returning();
    profileId = p.id;
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "enf_user" }),
      profileId
    );

  it("C-41: the reference-quote budget spans RETAINED VERSIONS, and a rebuild citing the same spans still writes", async () => {
    // Two halves of one decision, and they pull against each other — which is
    // why they are one test. C-37 set the unit to (profile, inputId) across
    // versions and made the measure a SUM, so a first build citing the ceiling
    // bricked every later PRICED rebuild. The measure is the UNION of covered
    // ranges: new material still accrues across versions, re-cited material
    // costs nothing.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const text = "x".repeat(2000);
    const ref = await caps.appendOnboardingInput({
      inputClass: "reference",
      content: text,
    });
    const span = (at: number, len: number) => ({
      field: "/audience",
      quote: text.slice(at, at + len),
      inputId: ref.id,
      startUtf16: at,
      endUtf16: at + len,
    });
    const write = (evidence: ReturnType<typeof span>[]) =>
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY_CONTENT,
            sourceEvidence: evidence,
            reason: FIXTURE_REASON,
          },
          tx
        )
      );

    // v1 takes 400 distinct characters of the reference post.
    await write([span(0, 200), span(200, 200)]);

    // THE BRICKING CASE: rebuilding on exactly the same spans, repeatedly.
    // Under a monotone sum the second of these is already over the 600 ceiling.
    for (let i = 0; i < 5; i++) {
      await expect(
        write([span(0, 200), span(200, 200)]),
        "a rebuild citing spans already cited was refused — after its tokens were spent"
      ).resolves.toBeTruthy();
    }

    // ...and the bar C-37 was raised to close still holds: NEW material across
    // versions accrues, so the post cannot be reassembled a version at a time.
    await expect(
      write([span(400, 200), span(600, 200)])
    ).rejects.toThrow(/further characters/);
  });

  it("D-M2-10: a `reference` input cannot be provenance for a `voice` brain doc", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const text = "someone else wrote this sentence";
    const ref = await caps.appendOnboardingInput({
      inputClass: "reference",
      content: text,
    });
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: text,
    });
    const evidence = (inputId: string, field = "/register") => [
      { field, quote: text.slice(0, 8), inputId, startUtf16: 0, endUtf16: 8 },
    ];

    // This is the T2 route: a third party's sentence becoming the creator's
    // voice rules. The similarity gate does not cover it (spin-only).
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          { kind: "voice", content: VOICE_CONTENT, sourceEvidence: evidence(ref.id), reason: FIXTURE_REASON },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProvenanceError);

    // NON-VACUITY, both axes. The creator's OWN post is fine as voice
    // provenance...
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          { kind: "voice", content: VOICE_CONTENT, sourceEvidence: evidence(own.id), reason: FIXTURE_REASON },
          tx
        )
      )
    ).resolves.toBeDefined();
    // ...and a `reference` input is fine on a kind that is ABOUT other people's
    // posts, which is why the barred set is `voice` and not "everything".
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          { kind: "strategy", content: STRATEGY_CONTENT, sourceEvidence: evidence(ref.id, "/audience"), reason: FIXTURE_REASON },
          tx
        )
      )
    ).resolves.toBeDefined();
  });

  it("usage_raw accepts metering values and REFUSES anything that can carry text", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const base = usageInput("att_enf");

    // The real shape a provider returns.
    await expect(
      db.transaction((tx) =>
        caps.recordModelUsage(
          {
            ...base,
            usageRaw: {
              input_tokens: 100,
              output_tokens: 200,
              cache_read_input_tokens: 0,
              cached: true,
              detail: null,
            },
          },
          tx
        )
      )
    ).resolves.toBeDefined();

    // Every route text could take. `model_usage` is EXCLUDED from the REQ-A04
    // export on the ground that it holds no creator content — so a string here
    // is not a style question, it is the export exclusion becoming false.
    for (const [label, usageRaw] of [
      ["a top-level string", { prompt: "write me a hook about..." }],
      ["a nested string", { meta: { completion: "here is your hook" } }],
      ["a string in an array", { messages: ["system text"] }],
      ["a bare string", "the whole completion"],
      ["a bigint", { n: 1n }],
    ] as [string, unknown][]) {
      await expect(
        db.transaction((tx) =>
          caps.recordModelUsage({ ...base, attemptId: "att_" + label, usageRaw }, tx)
        ),
        label + " reached usage_raw"
      ).rejects.toBeInstanceOf(UsageRawError);
    }

    // ...and nothing was written by the refusals.
    const rows = await scope.accessors.modelUsage();
    expect(rows).toHaveLength(1);
  });
});

describe("C-32: every brain_docs column is CLASSIFIED — the completeness instrument", () => {
  // THE INSTRUMENT THE HAND-LIST KEPT NEEDING. `GUARDED_WRITE_FIELDS` has now
  // missed exactly one field in four consecutive rounds — `status`, `version`,
  // `evidence_counts`, and then the one the plan PREDICTED it would miss and
  // did: `reference_corpus_ids`, the column that decides which corpus the R-3
  // echo bar runs over. A list maintained by memory will miss a fifth.
  //
  // So the check is class-level: enumerate the drizzle table's OWN property
  // space and require every column to be either caller-suppliable or guarded.
  // Adding a column without classifying it fails HERE, at the point of adding.
  //
  // DRIZZLE PROPERTY SPACE, not snake_case, and that is measured rather than
  // stylistic: `stripGuarded` deletes keys from the object handed to
  // `.values()`, and drizzle reads `evidenceCounts`, never `evidence_counts` —
  // so a snake_case entry guards a key drizzle never looks at.
  const columns = Object.keys(getTableColumns(brainDocs));

  it("classifies every column as guarded or caller-suppliable", () => {
    expect(columns.length, "the enumeration is empty — it reads nothing").toBeGreaterThan(
      10
    );
    const classified = new Set<string>([
      ...GUARDED_WRITE_FIELDS,
      ...CALLER_SUPPLIABLE_BRAIN_FIELDS,
    ]);
    const unclassified = columns.filter((c) => !classified.has(c));
    expect(
      unclassified,
      "a brain_docs column is neither guarded nor declared caller-suppliable — decide which it is"
    ).toEqual([]);
  });

  it("...and the check REJECTS a planted unclassified column", () => {
    // A scan that finds nothing is indistinguishable from a scan that is broken
    // (2026-08-21), so the negative case is asserted rather than assumed.
    const planted = [...columns, "someNewServerColumn"];
    const classified = new Set<string>([
      ...GUARDED_WRITE_FIELDS,
      ...CALLER_SUPPLIABLE_BRAIN_FIELDS,
    ]);
    expect(planted.filter((c) => !classified.has(c))).toEqual([
      "someNewServerColumn",
    ]);
  });

  it("names `referenceCorpusIds` specifically — the fourth miss, and the one A-3 was", () => {
    // Pinned by name as well as by the class check above. The class check would
    // catch its removal from the guarded list only if it were not silently
    // moved to the caller-suppliable list instead, and moving it there is
    // exactly the change that would hand the R-3 bar to the caller.
    expect(GUARDED_WRITE_FIELDS).toContain("referenceCorpusIds");
    expect(CALLER_SUPPLIABLE_BRAIN_FIELDS).not.toContain("referenceCorpusIds");
    for (const col of [
      "confirmedAt",
      "confirmedBy",
      "confirmedContentSha256",
      "confirmedFields",
      "evidenceCounts",
    ]) {
      expect(GUARDED_WRITE_FIELDS, `${col} is not guarded`).toContain(col);
    }
  });

  it("the TYPE refuses every guarded brain_docs column (the compile-level half)", () => {
    // @ts-expect-error — the corpus id set is server-derived.
    void ({ referenceCorpusIds: [] } satisfies NoServerFieldsProbe);
    // @ts-expect-error — so is the confirmation attribution.
    void ({ confirmedBy: "x" } satisfies NoServerFieldsProbe);
    expect(true).toBe(true);
  });
});

describe("creator_profiles is CLASSIFIED too — the same instrument, one table over", () => {
  // C-32 gave `brain_docs` a class-level check because the hand-maintained
  // `GUARDED_WRITE_FIELDS` had missed exactly one field in four consecutive
  // rounds. `creator_profiles` becomes a WRITTEN table for the first time in
  // slice 1, so it gets the instrument at the point of becoming writable rather
  // than after its own fourth miss.
  const columns = Object.keys(getTableColumns(creatorProfiles));

  it("classifies every column as guarded or caller-suppliable", () => {
    expect(columns.length, "the enumeration is empty — it reads nothing").toBeGreaterThan(
      4
    );
    const classified = new Set<string>([
      ...GUARDED_WRITE_FIELDS,
      ...CALLER_SUPPLIABLE_PROFILE_FIELDS,
    ]);
    expect(
      columns.filter((c) => !classified.has(c)),
      "a creator_profiles column is neither guarded nor declared caller-suppliable — decide which it is"
    ).toEqual([]);
  });

  it("...and the check REJECTS a planted unclassified column", () => {
    // A scan that finds nothing is indistinguishable from a scan that is
    // broken (2026-08-21), so the negative case is asserted rather than assumed.
    const classified = new Set<string>([
      ...GUARDED_WRITE_FIELDS,
      ...CALLER_SUPPLIABLE_PROFILE_FIELDS,
    ]);
    expect(
      [...columns, "someNewServerColumn"].filter((c) => !classified.has(c))
    ).toEqual(["someNewServerColumn"]);
  });

  it("names `state` specifically — the cap's whole meaning rests on it", () => {
    // Pinned by name as well as by the class check, for the reason C-32 pins
    // `referenceCorpusIds`: the class check would miss its removal from the
    // guarded list if it were silently moved to the caller-suppliable one, and
    // moving it there is exactly the change that hands the per-tier cap to the
    // caller — a profile created straight into `archived` costs nothing.
    expect(GUARDED_WRITE_FIELDS).toContain("state");
    expect(CALLER_SUPPLIABLE_PROFILE_FIELDS).not.toContain("state");
    expect(CALLER_SUPPLIABLE_PROFILE_FIELDS).toEqual(["displayName"]);
  });
});

/**
 * THE BOUND, PAID FOR ONCE (9a-G1, 2026-09-04).
 *
 * ITS OWN TOP-LEVEL DESCRIBE WITH A `beforeAll`, because these two cases are
 * the most expensive in the file by an order of magnitude: measured at 4,887 ms
 * and 4,820 ms against a ~760 ms median across the 45 cases next door, each
 * inserting 50,001 rows into a FRESH in-process PGlite. Synchronous CPU on the
 * worker thread is exactly the class `9a-G1` names, and paying it on top of the
 * sibling describe's per-test database was what made this file the trigger.
 *
 * WHAT IS NOT NEGOTIABLE, and is unchanged: both cases still drive the REAL
 * `COMPARISON_POPULATION_MAX`. A bound only the test uses is not the bound
 * production runs under, so the fixture is still 50,000 real rows — it is
 * built ONCE for both cases instead of twice, and once instead of on top of 45
 * live WASM heaps.
 *
 * HOW BOTH SIDES OF THE BOUNDARY ARE STILL ASSERTED FROM ONE FIXTURE: the
 * shared state sits EXACTLY AT the bound, and each case adds the row that
 * crosses it inside a TRANSACTION IT ROLLS BACK, passing that `tx` to the
 * accessor. So neither case leaves the fixture changed for the other and there
 * is no order dependence between them — which a shared `beforeAll` would
 * otherwise quietly introduce.
 */
describe("comparableResults at the REAL bound (fixture paid once)", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;
  let docId: string;
  let stratum: {
    platform: string;
    audienceClass: "organic" | "paid";
    metricKey: string;
    metricDeclaredByDocIds: readonly string[];
    observedFrom: Date;
    observedTo: Date;
  };

  const scopeFor = async () =>
    ProfileScope.mint(db, await withWorkspace(db, { authUserId: "bound_a" }), profileId);

  beforeAll(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "bound_a");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "bound_a", name: "Bound" })
    ).workspace.id;
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "bound" })
      .returning();
    profileId = profile.id;
    const [doc] = await db
      .insert(brainDocs)
      .values({
        profileId,
        workspaceId,
        kind: "strategy",
        version: 1,
        content: {
          metric: {
            label: "bound metric",
            unit: "per 1k views",
            direction: "higher_is_better",
          },
        },
        reason: RENDERED_REASON,
        sourceEvidence: RAW_EVIDENCE,
      })
      .returning();
    docId = doc.id;
    stratum = {
      platform: "shorts",
      audienceClass: "organic",
      metricKey: "followers",
      metricDeclaredByDocIds: [docId],
      observedFrom: new Date("2026-07-01"),
      observedTo: new Date("2026-09-01"),
    };
    // EXACTLY AT THE BOUND. One statement, not 50,000 parameter binds: the
    // naive fixture is what makes the real bound untestable in practice, and a
    // suite that slow is a suite somebody lowers the bound to speed up.
    await fill(db, 1, COMPARISON_POPULATION_MAX);
  }, 120_000);

  afterAll(async () => {
    await (db as unknown as { $client?: { close?: () => Promise<void> } })
      .$client?.close?.();
  });

  /** `count` rows for this profile, all inside `stratum`, one statement. */
  const fill = async (conn: TestDb, from: number, count: number) => {
    await conn.execute(
      sql.raw(`INSERT INTO results (
          id, profile_id, workspace_id, platform, audience_class, metric_key,
          metric_declared_by_doc_id, observed_from, observed_to, evidence_state,
          reach_value, reach_denominator
        )
        SELECT gen_random_uuid(), '${profileId}', '${workspaceId}', 'shorts',
               'organic'::result_audience_class, 'followers', '${docId}',
               timestamptz '2026-08-02',
               timestamptz '2026-08-03' + (i * interval '1 second'),
               'quantified_self_reported'::result_evidence_state, i, 1000
          FROM generate_series(${from}, ${from + count - 1}) AS i`)
    );
  };

  for (const [label, withStratum] of [
    ["WITH A STRATUM", true],
    ["WITH NO STRATUM (the branch 9a walks)", false],
  ] as const) {
    it(`comparableResults ${label} reports truncation at the real bound`, async () => {
      // CLAUDE.md 2026-08-29: a flag no test ever sets true reads exactly like
      // a guard and is not one. Both branches set it true, at the real bound.
      const scope = await scopeFor();
      const read = (conn?: TestDb) =>
        withStratum
          ? scope.accessors.comparableResults(stratum, conn as never)
          : scope.accessors.comparableResults(undefined, conn as never);

      // A population EQUAL to the bound is NOT clipped — a full page is
      // indistinguishable from a clipped one unless the probe asks for one
      // more row, so the boundary is asserted from BOTH sides.
      const atBound = await read();
      expect(atBound.rows.length).toBe(COMPARISON_POPULATION_MAX);
      expect(
        atBound.truncated,
        "a population EQUAL to the bound was reported as clipped"
      ).toBe(false);
      expect(atBound.limit).toBe(COMPARISON_POPULATION_MAX);

      // ...and one more row flips it. Inside a transaction that ROLLS BACK, so
      // the shared fixture is unchanged for the sibling case.
      await expect(
        db.transaction(async (tx) => {
          await fill(tx as unknown as TestDb, COMPARISON_POPULATION_MAX + 1, 1);
          const over = await read(tx as unknown as TestDb);
          expect(
            over.truncated,
            "a population LARGER than the bound was reported as complete - a comparison over it would be a false claim, not a weaker one"
          ).toBe(true);
          expect(over.rows.length).toBe(COMPARISON_POPULATION_MAX);
          // WHICH ROWS SURVIVED THE CLIP: the newest OBSERVATIONS. The row with
          // the earliest `observed_to` is the one dropped, which is the
          // documented bias - asserted, because a bias nobody checks is a bias
          // nobody knows about.
          const kept = new Set(over.rows.map((row) => row.id));
          const all = await tx
            .select({ id: results.id })
            .from(results)
            .where(eq(results.profileId, profileId))
            .orderBy(desc(results.observedTo), desc(results.id));
          expect(all.length).toBe(COMPARISON_POPULATION_MAX + 1);
          expect(kept.has(all[0].id), "the newest observation was clipped").toBe(
            true
          );
          expect(
            kept.has(all[all.length - 1].id),
            "the oldest observation survived a clip documented as newest-first"
          ).toBe(false);
          throw new Error("rollback");
        })
      ).rejects.toThrow("rollback");

      // ...and the fixture really is back at the bound for the next case.
      expect((await read()).truncated).toBe(false);
    }, 120_000);
  }
});

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
import { beforeEach, describe, expect, it } from "vitest";
import { eq, getTableColumns, sql } from "drizzle-orm";
import type { BrainDocReason } from "../src/brain-reason";
import {
  ContentSchemaError,
  KindNotYetWritableError,
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
  modelUsage,
  onboardingInputs,
  onboardingInterviewDrafts,
} from "../src/onboarding-schema";
import { generationAttempts, generations } from "../src/generation-schema";
import {
  PROFILE_EXPORT_TABLES,
  ProfileAccessError,
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
      await db.insert(modelUsage).values({
        profileId,
        workspaceId,
        ...usageInput(`att_${profileId}`),
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
      await db.insert(frameworks).values({
        slug: `private-${profileId}`,
        name: `Private ${profileId}`,
        beats: [],
        whyItConverts: "Private fixture",
        applicability: [],
        sourceReferences: [],
        evidenceEntries: [],
        testedCaveats: [],
        confidence: "observed",
        saturation: "observed",
        visibility: "private",
        ownerProfileId: profileId,
        workspaceId,
      });
    }
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
const SCALAR_ACCESSORS = new Set<keyof ProfileScope["accessors"]>([
  "countOnboardingInputs",
  // Slice 2a. Same shape as its sibling: a number, so the row loops have
  // nothing to walk, and its both-axes isolation is asserted BY VALUE in
  // "countBillableAttempts counts THIS profile's billed attempts only" below.
  // That case did not exist when this comment first claimed it did.
  "countBillableAttempts",
  // Slice 3. A number, like its two siblings; its both-axes isolation is
  // asserted BY VALUE in "countOwnPosts counts THIS profile's own posts only".
  "countOwnPosts",
  // Slice 3, billing round 2: the bound on attempts we paid for and did not
  // charge for. Its both-axes isolation is asserted BY VALUE in
  // "countUnchargedBillableAttempts and countOwnPosts count THIS profile only".
  "countUnchargedBillableAttempts",
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
    // A scalar accessor: it yields no rows for this loop to walk, so the
    // breach it could commit is a COUNT that includes someone else's attempts.
    // That is asserted by value in its own case below; here the contract is
    // only that it never hands back rows to inspect.
    countBillableAttempts: (rows) => {
      expect(rows).toEqual([]);
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
    latestBrainActivation: [],
    countOnboardingInputs: [],
    modelUsage: [],
    countBillableAttempts: [{ purpose: "onboarding_brain" }],
    // No ids => "the corpus as it stands now", the write-time shape. The
    // activation shape (an explicit recorded set) is exercised in activate.test.ts.
    referenceCorpusAsOf: [],
  };

  const invoke = async (
    scope: ProfileScope,
    name: keyof ProfileScope["accessors"]
  ): Promise<unknown[]> => {
    const result = await (
      scope.accessors[name] as (...a: unknown[]) => Promise<unknown>
    )(...(accessorArgs[name] as unknown[]));
    // Every accessor but one returns rows. `referenceCorpusAsOf` returns
    // `{ids, inputs}` because its caller has to RECORD the id set, so the
    // rows this machinery checks are its `inputs`. Normalised here, once, with
    // an explicit shape test rather than a name test — a second accessor
    // adopting the shape gets the same treatment without editing this.
    if (Array.isArray(result)) return result;
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
    const wrapped = (result as { inputs?: unknown }).inputs;
    expect(
      Array.isArray(wrapped),
      `accessor ${name} returned neither rows nor {inputs}`
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
        "countBillableAttempts",
        "countOnboardingInputs",
        // Slice 3, added deliberately: the id-keyed evidence read the confirm
        // screen resolves quotes through, the class-filtered corpus the priced
        // inference sends to a vendor, and its count.
        "countOwnPosts",
        // Slice 4: the reference-post count, closing the corpus-starvation
        // window `ownPostsNewest`'s docblock names.
        "countReferencePosts",
        "countUnchargedBillableAttempts",
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
      confidence: "observed",
      saturation: "observed",
      visibility: "shared",
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
    const CHILD_BRANCHES = [
      { table: "brain_docs", fks: ["brain_docs_profile_workspace_fk"], column: "profile_id" },
      {
        table: "onboarding_inputs",
        fks: ["onboarding_inputs_profile_workspace_fk"],
        column: "profile_id",
      },
      {
        table: "onboarding_interview_drafts",
        fks: ["onboarding_interview_drafts_profile_workspace_fk"],
        column: "profile_id",
      },
      {
        table: "brain_activation_snapshots",
        fks: ["brain_activation_snapshots_profile_workspace_fk"],
        column: "profile_id",
      },
      {
        table: "generations",
        fks: ["generations_profile_workspace_fk", "generations_attempt_fk"],
        column: "profile_id",
      },
      {
        table: "frameworks",
        fks: ["frameworks_owner_profile_workspace_fk"],
        column: "owner_profile_id",
      },
    ] as const;
    const covered = new Set<string>(CHILD_BRANCHES.map((b) => b.table));
    expect(
      PROFILE_EXPORT_TABLES.filter(
        (table) => table !== "creator_profiles" && !covered.has(table)
      ),
      "an exportable table has no cross-workspace case — adding a branch costs one entry here"
    ).toEqual([]);

    for (const { table, fks, column } of CHILD_BRANCHES) {
      await expect(
        db.transaction(async (tx) => {
          for (const fk of fks) {
            await tx.execute(sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${fk}`));
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
            sql.raw(`SELECT id FROM ${table} WHERE ${column} = '${p1}'`)
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
    for (const { table, fks } of CHILD_BRANCHES) {
      for (const fk of fks) {
        const found = await db.execute(
          sql.raw(
            `SELECT 1 FROM pg_constraint WHERE conname = '${fk}' AND conrelid = '${table}'::regclass`
          )
        );
        expect(found.rows.length, `${fk} was not restored`).toBe(1);
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
      fk: "brain_docs_profile_workspace_fk",
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
      accessors: ["brainDocs", "brainDocsByKind", "brainDocsByIds"],
    },
    {
      table: "onboarding_inputs",
      fk: "onboarding_inputs_profile_workspace_fk",
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
      fk: "brain_activation_snapshots_profile_workspace_fk",
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
    {
      table: "model_usage",
      fk: "model_usage_profile_workspace_fk",
      profileColumn: "profile_id",
      // BOTH accessors over this table (slice 2a). `countBillableAttempts`
      // prices a creator's rebuild off this count, so a dropped workspace
      // predicate here would let another workspace's attempts consume this
      // creator's included build — the same class of omission this file
      // records twice already, for `brainDocsByIds` and `referenceCorpusAsOf`.
      accessors: [
        "modelUsage",
        "countBillableAttempts",
        // Slice 3, billing round 2: the bound on attempts we paid for and did
        // not charge for. A dropped workspace predicate here would let another
        // workspace's failures exhaust this creator's cap.
        "countUnchargedBillableAttempts",
      ],
    },
  ] as const;

  // ------------------------------------------- the two BY-VALUE count cases
  //
  // Two comments in this file cited these by name for weeks and neither
  // existed (tenancy gate, 2026-08-28). A count has no rows for the P4 loops
  // to walk, so the row validators skip it entirely — which means a scalar
  // accessor's isolation is asserted here or nowhere. `countBillableAttempts`
  // is the accessor that PRICES A DEBIT: if its profile predicate were ever
  // dropped, a creator's included run would be consumed by a sibling profile's
  // history, and until this case existed the whole suite stayed green.

  it("countBillableAttempts counts THIS profile's billed attempts only", async () => {
    const scope = await mintP1();
    const caps = writeCapabilities(scope);
    const sibling = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "user_a" }),
      p2
    );
    const count = (sc: typeof scope) =>
      sc.accessors.countBillableAttempts({ purpose: "onboarding_brain" });

    // DELTAS, not absolutes: the shared fixture already seeds rows, and a case
    // that pins totals would break every time a fixture gains one. The
    // property is that MY writes move MY count and the sibling's do not.
    const before = { mine: await count(scope), theirs: await count(sibling) };

    for (const id of ["p1-a", "p1-b"]) {
      await db.transaction((tx) => caps.recordModelUsage(usageInput(id), tx));
    }
    const siblingCaps = writeCapabilities(sibling);
    for (const id of ["p2-a", "p2-b", "p2-c"]) {
      await db.transaction((tx) =>
        siblingCaps.recordModelUsage(usageInput(id), tx)
      );
    }

    // BOTH AXES, BY VALUE. +2 is only correct if the profile predicate holds;
    // without it this is +5, and the sibling's attempts would price my debit.
    expect(
      (await count(scope)) - before.mine,
      "the sibling's attempts leaked into this profile's count"
    ).toBe(2);
    // ...and from the SIBLING's side, so the check is not one-directional.
    expect((await count(sibling)) - before.theirs).toBe(3);
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
        onboardingInputs: "onboarding_inputs",
        referenceCorpusAsOf: "onboarding_inputs",
        modelUsage: "model_usage",
        countBillableAttempts: "model_usage",
        countOnboardingInputs: "onboarding_inputs",
        onboardingInputsByIds: "onboarding_inputs",
        ownPostsNewest: "onboarding_inputs",
        countOwnPosts: "onboarding_inputs",
        countReferencePosts: "onboarding_inputs",
        countUnchargedBillableAttempts: "model_usage",
        latestBrainActivation: "brain_activation_snapshots",
        profile: "creator_profiles",
        // One accessor spans every included table, so it cannot be assigned
        // ONE table in this one-table completeness map. Its all-table
        // isolation is not therefore unasserted: the three `exportPage` cases
        // above cover both axes across every branch, and export.test.ts drives
        // the same six through `openBrainExport` end to end.
        exportPage: undefined,
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
    for (const { table, fk, profileColumn, accessors } of CROSS_PARENTED) {
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(
            sql.raw(`ALTER TABLE ${table} DROP CONSTRAINT ${fk}`)
          );
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
    for (const { table, fk } of CROSS_PARENTED) {
      const found = await db.execute(
        sql.raw(
          `SELECT 1 FROM pg_constraint WHERE conname = '${fk}' AND conrelid = '${table}'::regclass`
        )
      );
      expect(found.rows.length, `${fk} was not restored`).toBe(1);
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

    // (c) R-10 where writes actually happen: `performance_meta` is written
    // from verified results, never inferred at onboarding.
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
    ).rejects.toThrow(KindNotYetWritableError);
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

// Slice 1 — the two app-reachable intake operations, and the workspace-grained
// write capability underneath them.
//
// The isolation cases run with TWO workspaces and TWO profiles present, so a
// dropped predicate shows up as somebody else's row rather than as an empty
// result. A suite that proves isolation by returning nothing proves nothing.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { creditLedger } from "../src/billing-schema";
import { memberships } from "../src/schema";
import {
  brainActivationSnapshots,
  modelUsage,
  onboardingInputs,
  onboardingInterviewDrafts,
} from "../src/onboarding-schema";
import {
  ProfileAccessError,
  PostAttestationError,
  PostContentError,
  ProfileRoleError,
  ReferenceEchoError,
  ScopeForgeryError,
} from "../src/errors";
import {
  POST_CONTENT_MAX,
  POST_COUNT_MAX,
  REFERENCE_COUNT_MAX,
  appendOwnPost,
  appendReferencePost,
  checkCandidateReferenceSafety,
  listOnboardingInputs,
} from "../src/onboarding-ops";
import {
  ProfileScope,
  withWorkspace,
  workspaceWriteCapabilities,
  writeCapabilities,
  type WorkspaceScope,
} from "../src/with-workspace";
import { CHECK } from "../src/brain-content";

type World = {
  a: { scope: WorkspaceScope; profileId: string };
  b: { scope: WorkspaceScope; profileId: string };
};

async function world(db: TestDb): Promise<World> {
  const make = async (authId: string, name: string) => {
    await seedAuthUser(db, authId);
    await ensureUserWorkspace(db, { authUserId: authId, name });
    const scope = await withWorkspace(db, { authUserId: authId });
    const profile = await db.transaction((tx) =>
      workspaceWriteCapabilities(scope).createProfile(
        { displayName: `${name}'s creator` },
        tx
      )
    );
    return { scope, profileId: profile.id };
  };
  return { a: await make("ob_a", "A"), b: await make("ob_b", "B") };
}

describe("appendOwnPost (R9, R11)", () => {
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  it("stores through the EXISTING write path — one normalisation, one hash (R9)", async () => {
    // CRLF and a decomposed character in the same string: the first proves the
    // line-ending normalisation ran, the second proves the NFC pass did, and
    // both matter because `brain_docs.source_evidence` records UTF-16 offsets
    // INTO this stored value. If this operation had re-implemented either, the
    // offsets a later slice records would index text nobody kept.
    const raw = "line one\r\nline two é";
    const row = await appendOwnPost(db, w.a.scope, w.a.profileId, raw, true);
    expect(row.content).toBe("line one\nline two é");
    expect(row.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    // The hash is over the NORMALISED bytes — the same rule `appendOnboardingInput`
    // already owned, asserted here so this caller cannot be the one that breaks it.
    const { createHash } = await import("node:crypto");
    expect(row.contentSha256).toBe(
      createHash("sha256").update(Buffer.from(row.content, "utf8")).digest("hex")
    );
  });

  it("R8: REFUSES without the creator's attestation, and writes nothing", async () => {
    // G-12's creator half. The `own_post` label this function hard-codes is
    // what switches BOTH R-3 controls off — a reference input may not ground a
    // voice rule, and reference inputs are the echo corpus — so the assertion
    // behind it has to be an act, at every call site.
    //
    // THE MUTATION THIS EXISTS FOR: deleting the `attested !== true` line.
    // Without this test every call site passes `true`, so the refusal has no
    // witness and the guard could be removed with the suite green — the exact
    // "a matrix is blind to a control that was never written" shape.
    await expect(
      appendOwnPost(db, w.a.scope, w.a.profileId, "mine", false)
    ).rejects.toBeInstanceOf(PostAttestationError);
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
  });

  it("R8: the attestation is checked BEFORE the content, so the message is useful", async () => {
    // A creator who filled the textarea and forgot the tick is told about the
    // tick. Checking content first would tell somebody with a blank box and no
    // tick only about the box, and they would tick nothing and fail again.
    await expect(
      appendOwnPost(db, w.a.scope, w.a.profileId, "", false)
    ).rejects.toBeInstanceOf(PostAttestationError);
  });

  it("R8: it does NOT claim to verify authorship — the message says what it is", async () => {
    // An unverified label the product KNOWS is unverified is a different risk
    // from one it presents as verified, and the copy has to stay on the right
    // side of that line.
    const err = await appendOwnPost(
      db,
      w.a.scope,
      w.a.profileId,
      "mine",
      false
    ).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/confirming that you wrote it/i);
    expect((err as Error).message).not.toMatch(/verif|we checked/i);
  });

  it("can only ever produce `own_post` — the class is not a parameter (R11)", async () => {
    const row = await appendOwnPost(db, w.a.scope, w.a.profileId, "mine", true);
    expect(row.inputClass).toBe("own_post");
    // Structural, not incidental: there is no argument to pass. `reference` is
    // unreachable from here — which is what slice 4 will deliberately change,
    // with G-12 beside it.
    //
    // ASSERTED BY NAMING THE PARAMETERS, not by counting them. This used to be
    // `expect(appendOwnPost.length).toBe(4)`, which passed for the wrong
    // reason the moment slice 3 added `attested` — arity went to 5 and the test
    // failed, but a test that fails on ANY signature change is not a test that
    // an input-class parameter was not added: adding `inputClass` and removing
    // `attested` would have left it green. The source is read instead, so the
    // claim in the sentence above is the claim being checked.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../src/onboarding-ops.ts", import.meta.url),
        "utf8"
      )
    );
    const signature = src.slice(
      src.indexOf("export async function appendOwnPost("),
      src.indexOf("): Promise<OnboardingInput>")
    );
    expect(signature).not.toMatch(/inputClass|input_class|InputClass/);
    // ...and non-vacuity: the scan really does see this signature's parameters.
    expect(signature).toMatch(/attested: boolean/);
  });

  it("stamps the SCOPE's ids, never the caller's", async () => {
    const row = await appendOwnPost(db, w.a.scope, w.a.profileId, "mine", true);
    expect(row.workspaceId).toBe(w.a.scope.workspaceId as string);
    expect(row.profileId).toBe(w.a.profileId);
  });

  it("REFUSES another workspace's profile id — foreign, nonexistent and malformed alike", async () => {
    for (const [label, id] of [
      ["foreign", w.b.profileId],
      ["nonexistent", "00000000-0000-7000-8000-000000000000"],
      ["malformed", "not-a-uuid"],
    ] as const) {
      await expect(
        appendOwnPost(db, w.a.scope, id, "mine", true),
        label
      ).rejects.toBeInstanceOf(ProfileAccessError);
    }
    // ...with the SAME message for all three, so the refusal is not an
    // enumeration oracle over other workspaces' profiles (P2).
    const messages = await Promise.all(
      [w.b.profileId, "00000000-0000-7000-8000-000000000000", "not-a-uuid"].map(
        (id) =>
          appendOwnPost(db, w.a.scope, id, "x", true).catch((e: Error) => e.message)
      )
    );
    expect(new Set(messages).size).toBe(1);
    // ...and nothing was written into B on the way past.
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
  });

  it("REFUSES a forged scope", async () => {
    const forged = Object.assign({}, w.a.scope) as unknown as WorkspaceScope;
    await expect(
      appendOwnPost(db, forged, w.a.profileId, "mine", true)
    ).rejects.toBeInstanceOf(ScopeForgeryError);
  });

  it("REFUSES blank and over-length content, and accepts the boundary", async () => {
    for (const bad of ["", "   ", "\n\n"]) {
      await expect(
        appendOwnPost(db, w.a.scope, w.a.profileId, bad, true),
        JSON.stringify(bad)
      ).rejects.toBeInstanceOf(PostContentError);
    }
    await expect(
      appendOwnPost(db, w.a.scope, w.a.profileId, "x".repeat(POST_CONTENT_MAX + 1), true)
    ).rejects.toBeInstanceOf(PostContentError);
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
    // The ceiling is a ceiling: exactly at the limit is stored.
    const ok = await appendOwnPost(
      db,
      w.a.scope,
      w.a.profileId,
      "x".repeat(POST_CONTENT_MAX),
    true
    );
    expect(ok.content).toHaveLength(POST_CONTENT_MAX);
  });
});

describe("appendReferencePost (R1, R2, R3, slice 4)", () => {
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  it("R1: writes input_class 'reference', through the SAME write path as appendOwnPost", async () => {
    const row = await appendReferencePost(
      db,
      w.a.scope,
      w.a.profileId,
      "Someone else's post, worth studying."
    );
    expect(row.inputClass).toBe("reference");
    expect(row.contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("R2: carries NO attestation control — an attempt to smuggle one through is simply ignored", async () => {
    // There is no `attested` argument to pass at all, so this proves the
    // absence rather than a refusal: a caller cannot even express the
    // question this operation does not ask.
    const row = await appendReferencePost(
      db,
      w.a.scope,
      w.a.profileId,
      "A reference post."
    );
    expect(row).not.toHaveProperty("attested");
  });

  it("R1/R2: `sourceUrl` is optional, and stored when given", async () => {
    const withUrl = await appendReferencePost(
      db,
      w.a.scope,
      w.a.profileId,
      "A post with a source.",
      "https://example.com/post/1"
    );
    expect(withUrl.sourceUrl).toBe("https://example.com/post/1");
    const withoutUrl = await appendReferencePost(
      db,
      w.a.scope,
      w.a.profileId,
      "A post with no source."
    );
    expect(withoutUrl.sourceUrl).toBeNull();
  });

  it("R3: REFUSES past REFERENCE_COUNT_MAX, counting reference posts only — own posts don't count against it", async () => {
    for (let i = 0; i < REFERENCE_COUNT_MAX; i++) {
      await appendReferencePost(db, w.a.scope, w.a.profileId, `reference ${i}`);
    }
    await appendOwnPost(db, w.a.scope, w.a.profileId, "an own post", true);
    await expect(
      appendReferencePost(db, w.a.scope, w.a.profileId, "one too many")
    ).rejects.toBeInstanceOf(PostContentError);
    expect(
      (await db.select().from(onboardingInputs)).filter(
        (r) => r.inputClass === "reference"
      )
    ).toHaveLength(REFERENCE_COUNT_MAX);
  });

  it("R3: corpus starvation is handled — 50 references does not starve own posts out of the voice corpus window", async () => {
    // ownPostsNewest's own docblock names this risk: a class filter IN THE
    // QUERY (not after a shared page) is what protects it. This is the
    // integration proof under a reference-heavy corpus.
    for (let i = 0; i < REFERENCE_COUNT_MAX; i++) {
      await appendReferencePost(db, w.a.scope, w.a.profileId, `reference ${i}`);
    }
    for (let i = 0; i < 5; i++) {
      await appendOwnPost(db, w.a.scope, w.a.profileId, `own post ${i}`, true);
    }
    const profileScope = await ProfileScope.mint(db, w.a.scope, w.a.profileId);
    const own = await profileScope.accessors.ownPostsNewest(50);
    expect(own).toHaveLength(5);
    expect(own.every((r) => r.inputClass === "own_post")).toBe(true);
  });

  it("REFUSES a foreign, nonexistent or malformed profile id — same message as appendOwnPost", async () => {
    await expect(
      appendReferencePost(db, w.a.scope, w.b.profileId, "x")
    ).rejects.toBeInstanceOf(ProfileAccessError);
  });

  it("REFUSES a forged scope", async () => {
    const forged = { ...w.a.scope, role: "owner" } as WorkspaceScope;
    await expect(
      appendReferencePost(db, forged, w.a.profileId, "x")
    ).rejects.toBeInstanceOf(ScopeForgeryError);
  });

  it("REFUSES blank and over-length content, and accepts the boundary", async () => {
    await expect(
      appendReferencePost(db, w.a.scope, w.a.profileId, "   ")
    ).rejects.toBeInstanceOf(PostContentError);
    await expect(
      appendReferencePost(
        db,
        w.a.scope,
        w.a.profileId,
        "x".repeat(POST_CONTENT_MAX + 1)
      )
    ).rejects.toBeInstanceOf(PostContentError);
    const ok = await appendReferencePost(
      db,
      w.a.scope,
      w.a.profileId,
      "x".repeat(POST_CONTENT_MAX)
    );
    expect(ok.content).toHaveLength(POST_CONTENT_MAX);
  });

  it("REFUSES for a viewer — the class, not the field (G-13's rule applied here too)", async () => {
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, w.a.scope.workspaceId as string));
    const viewerScope = await withWorkspace(db, { authUserId: "ob_a" });
    expect(viewerScope.role, "the fixture must actually be a viewer").toBe(
      "viewer"
    );
    await expect(
      appendReferencePost(db, viewerScope, w.a.profileId, "x")
    ).rejects.toBeInstanceOf(ProfileRoleError);
  });
});

describe("checkCandidateReferenceSafety (R14/R14a)", () => {
  let db: TestDb;
  let w: World;

  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  const writeCandidate = async (
    scope: WorkspaceScope,
    profileId: string,
    candidate: string,
    evidenceInputId: string,
    evidenceQuote: string
  ): Promise<boolean> => {
    const profileScope = await ProfileScope.mint(db, scope, profileId);
    try {
      await db.transaction((tx) =>
        writeCapabilities(profileScope).writeBrainDoc(
          {
            kind: "voice",
            content: {
              register: candidate,
              sentenceRhythm: CHECK,
              signatureMoves: [CHECK],
              avoid: [CHECK],
            },
            sourceEvidence: [
              {
                field: "/register",
                quote: evidenceQuote,
                inputId: evidenceInputId,
                startUtf16: 0,
                endUtf16: evidenceQuote.length,
              },
            ],
            reason: { code: "onboarding_inference" },
          },
          tx
        )
      );
      return true;
    } catch (error) {
      if (error instanceof ReferenceEchoError) return false;
      throw error;
    }
  };

  it.each([
    [
      "accept",
      "Use a clipped opening and land the turn quickly.",
      true,
    ],
    [
      "refuse",
      "Build the tension slowly then reveal the useful answer at the end.",
      false,
    ],
  ] as const)(
    "preview and hard write agree on %s for the same candidate and corpus",
    async (_label, candidate, expected) => {
      const own = await appendOwnPost(
        db,
        w.a.scope,
        w.a.profileId,
        "This is my own source line.",
        true
      );
      await appendReferencePost(
        db,
        w.a.scope,
        w.a.profileId,
        "Build the tension slowly then reveal the useful answer at the end."
      );

      const preview = await checkCandidateReferenceSafety(
        db,
        w.a.scope,
        w.a.profileId,
        candidate
      );
      const writeAccepted = await writeCandidate(
        w.a.scope,
        w.a.profileId,
        candidate,
        own.id,
        own.content
      );

      expect(preview.decision === "accept").toBe(expected);
      expect(writeAccepted).toBe(expected);
      expect(preview.candidateReferenceSpanCount).toBe(0);
    }
  );

  it("does not trust an accepted preview: a changed corpus is rechecked by the hard write", async () => {
    const candidate =
      "Build the tension slowly then reveal the useful answer at the end.";
    const own = await appendOwnPost(
      db,
      w.a.scope,
      w.a.profileId,
      "This is my own source line.",
      true
    );
    const preview = await checkCandidateReferenceSafety(
      db,
      w.a.scope,
      w.a.profileId,
      candidate
    );
    expect(preview.decision).toBe("accept");

    await appendReferencePost(
      db,
      w.a.scope,
      w.a.profileId,
      candidate
    );

    expect(
      await writeCandidate(
        w.a.scope,
        w.a.profileId,
        candidate,
        own.id,
        own.content
      )
    ).toBe(false);
  });

  it("stores neither candidate nor result on pass or refusal, and returns actionable refusal data", async () => {
    const reference = await appendReferencePost(
      db,
      w.a.scope,
      w.a.profileId,
      "Build the tension slowly then reveal the useful answer at the end."
    );
    const sentinel = "CANDIDATE_SENTINEL_DO_NOT_STORE_4C";
    const snapshot = async () => ({
      creatorProfiles: await db.select().from(creatorProfiles),
      onboardingInputs: await db.select().from(onboardingInputs),
      interviewDrafts: await db.select().from(onboardingInterviewDrafts),
      brainDocs: await db.select().from(brainDocs),
      activationSnapshots: await db.select().from(brainActivationSnapshots),
      modelUsage: await db.select().from(modelUsage),
      creditLedger: await db.select().from(creditLedger),
    });
    const before = await snapshot();

    const pass = await checkCandidateReferenceSafety(
      db,
      w.a.scope,
      w.a.profileId,
      `${sentinel} - an unrelated draft with no copied sequence.`
    );
    expect(pass.decision).toBe("accept");
    expect(await snapshot()).toEqual(before);

    const refusal = await checkCandidateReferenceSafety(
      db,
      w.a.scope,
      w.a.profileId,
      `${sentinel}. Build the tension slowly then reveal the useful answer at the end.`
    );
    if (refusal.decision !== "refuse") {
      throw new Error("the echoing candidate unexpectedly passed");
    }
    expect(refusal).toMatchObject({
      decision: "refuse",
      reason: "reference_echo",
      match: { inputId: reference.id, pointer: "/" },
      candidateReferenceSpanCount: 0,
    });
    expect(refusal.message).toMatch(/own words|rewrite/i);
    const afterRefusal = await snapshot();
    expect(afterRefusal).toEqual(before);
    expect(
      JSON.stringify(afterRefusal, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    ).not.toContain(sentinel);
  });

  it("isolates sibling-profile corpus and refuses foreign profiles without an oracle", async () => {
    const sibling = await db.transaction((tx) =>
      workspaceWriteCapabilities(w.a.scope).createProfile(
        { displayName: "A sibling" },
        tx
      )
    );
    const siblingReference =
      "Keep the opening spare and reveal the central point only after the final turn.";
    await appendReferencePost(
      db,
      w.a.scope,
      sibling.id,
      siblingReference
    );

    const ownProfile = await checkCandidateReferenceSafety(
      db,
      w.a.scope,
      w.a.profileId,
      siblingReference
    );
    expect(
      ownProfile.decision,
      "a sibling profile's reference corpus must not leak into this profile"
    ).toBe("accept");

    const ids = [
      w.b.profileId,
      "00000000-0000-7000-8000-000000000000",
      "not-a-uuid",
    ];
    const errors = await Promise.all(
      ids.map(async (profileId): Promise<Error> => {
        try {
          await checkCandidateReferenceSafety(
            db,
            w.a.scope,
            profileId,
            siblingReference
          );
          throw new Error("a foreign profile unexpectedly passed");
        } catch (error) {
          return error as Error;
        }
      })
    );
    expect(errors.every((error) => error instanceof ProfileAccessError)).toBe(
      true
    );
    expect(new Set(errors.map((error) => error.message)).size).toBe(1);
  });
});

describe("listOnboardingInputs (R10)", () => {
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  it("lists NEWEST FIRST", async () => {
    for (const t of ["first", "second", "third"]) {
      await appendOwnPost(db, w.a.scope, w.a.profileId, t, true);
    }
    const rows = await listOnboardingInputs(db, w.a.scope, w.a.profileId);
    expect(rows.map((r) => r.content)).toEqual(["third", "second", "first"]);
  });

  it("is scoped to the signed-in workspace — B's posts are invisible to A, and the reverse", async () => {
    await appendOwnPost(db, w.a.scope, w.a.profileId, "A's post", true);
    await appendOwnPost(db, w.b.scope, w.b.profileId, "B's post", true);
    // NON-VACUITY FIRST: both rows really exist, so an empty result below would
    // be a broken query rather than isolation.
    expect(await db.select().from(onboardingInputs)).toHaveLength(2);

    const forA = await listOnboardingInputs(db, w.a.scope, w.a.profileId);
    expect(forA.map((r) => r.content)).toEqual(["A's post"]);
    // BOTH SIDES. A one-sided isolation test passes against a query that
    // hardcodes A's workspace id.
    const forB = await listOnboardingInputs(db, w.b.scope, w.b.profileId);
    expect(forB.map((r) => r.content)).toEqual(["B's post"]);
  });

  it("refuses to list another workspace's profile", async () => {
    await appendOwnPost(db, w.b.scope, w.b.profileId, "B's post", true);
    await expect(
      listOnboardingInputs(db, w.a.scope, w.b.profileId)
    ).rejects.toBeInstanceOf(ProfileAccessError);
  });

  it("returns an empty list for a profile with no posts (not an error)", async () => {
    expect(await listOnboardingInputs(db, w.a.scope, w.a.profileId)).toEqual([]);
  });

  it("tenancy gate CHANGE (slice 4 round 2): `inputClass` filters IN THE QUERY — a small page of one class is not starved by a larger corpus of the OTHER class", async () => {
    // The defect: `page.tsx` used to fetch one unfiltered page and split it by
    // class in JavaScript AFTER paging. Seed enough `reference` rows to fill
    // a 3-row page on their own, THEN add a smaller number of `own_post` rows
    // — under the old code, a class-unaware page of size 3 would return only
    // (newest-first) reference rows and the own-post list would wrongly
    // render empty, even though own posts exist.
    for (let i = 0; i < 5; i++) {
      await appendReferencePost(db, w.a.scope, w.a.profileId, `reference ${i}`);
    }
    await appendOwnPost(db, w.a.scope, w.a.profileId, "own post one", true);
    await appendOwnPost(db, w.a.scope, w.a.profileId, "own post two", true);

    const ownPage = await listOnboardingInputs(
      db,
      w.a.scope,
      w.a.profileId,
      { limit: 3 },
      "own_post"
    );
    expect(
      ownPage.map((r) => r.content),
      "own posts must not be starved out by a larger reference corpus"
    ).toEqual(["own post two", "own post one"]);
    expect(ownPage.every((r) => r.inputClass === "own_post")).toBe(true);

    const referencePage = await listOnboardingInputs(
      db,
      w.a.scope,
      w.a.profileId,
      { limit: 3 },
      "reference"
    );
    expect(referencePage).toHaveLength(3);
    expect(referencePage.every((r) => r.inputClass === "reference")).toBe(true);

    // ...and the UNFILTERED read (no third argument) still returns everything,
    // newest first, unaffected — confirming the filter is additive, not a
    // silent behaviour change for every OTHER caller of this function.
    const everything = await listOnboardingInputs(db, w.a.scope, w.a.profileId);
    expect(everything).toHaveLength(7);
  });
});

describe("workspaceWriteCapabilities — the capability under the decision", () => {
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  it("REFUSES a forged scope, and refuses a genuinely minted PROFILE scope (wrong grain)", async () => {
    const forged = Object.assign({}, w.a.scope, {
      role: "owner",
    }) as unknown as WorkspaceScope;
    expect(() => workspaceWriteCapabilities(forged)).toThrow(ScopeForgeryError);
    // The grain check is separate from the forgery check and is why the cage
    // has two registries rather than one plus an `instanceof`: a ProfileScope
    // is genuinely minted, and a viewer can hold one.
    const { ProfileScope } = await import("../src/with-workspace");
    const profileScope = await ProfileScope.mint(db, w.a.scope, w.a.profileId);
    expect(() =>
      workspaceWriteCapabilities(profileScope as unknown as WorkspaceScope)
    ).toThrow(ScopeForgeryError);
  });

  it("STRIPS a smuggled workspaceId, id and state at RUNTIME — not merely at the type level", async () => {
    // The 2026-08-21 lesson, applied to the newest write surface: proving a
    // field cannot be TYPED is not proving it cannot be CAST. `state` is the
    // one that matters most and the one a happy-path test cannot see, because
    // the column has a DEFAULT — so the smuggled value is `archived`, which
    // the default can never produce. Remove the strip and this goes red.
    const smuggled = {
      displayName: "Anna",
      id: "00000000-0000-7000-8000-000000000001",
      workspaceId: w.b.scope.workspaceId as string,
      state: "archived",
    } as unknown as { displayName: string };

    const row = await db.transaction((tx) =>
      workspaceWriteCapabilities(w.a.scope).createProfile(smuggled, tx)
    );
    expect(row.workspaceId).toBe(w.a.scope.workspaceId as string);
    expect(row.id).not.toBe("00000000-0000-7000-8000-000000000001");
    expect(row.state).toBe("active");
    // ...and nothing landed in B.
    const inB = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.workspaceId, w.b.scope.workspaceId as string));
    expect(inB).toHaveLength(1);
    expect(inB[0].displayName).toBe("B's creator");
  });

  it("countActiveProfiles counts ACTIVE rows in THIS workspace only", async () => {
    // Both axes: the state predicate and the workspace predicate. B already has
    // one profile, so a dropped workspace predicate reads 2 instead of 1.
    expect(
      await db.transaction((tx) =>
        workspaceWriteCapabilities(w.a.scope).countActiveProfiles(tx)
      )
    ).toBe(1);
    await db
      .update(creatorProfiles)
      .set({ state: "archived" })
      .where(eq(creatorProfiles.id, w.a.profileId));
    expect(
      await db.transaction((tx) =>
        workspaceWriteCapabilities(w.a.scope).countActiveProfiles(tx)
      ),
      "an archived profile does not count against the cap — see creatorProfileState"
    ).toBe(0);
    // B is untouched by A's archive.
    expect(
      await db.transaction((tx) =>
        workspaceWriteCapabilities(w.b.scope).countActiveProfiles(tx)
      )
    ).toBe(1);
  });
});

describe("REQ-A02 / G-13 — a viewer cannot write a creator's record", () => {
  // THESE TESTS EXIST BECAUSE THE ROUND-2 GATE FOUND THEIR ABSENCE. Round 1
  // BLOCKed on a viewer being able to append to `onboarding_inputs` through the
  // new paste form; the fix added the shared role gate to all five profile-grained
  // capabilities — and nothing asserted any of it, so deleting any of the four
  // calls left 891 tests green. That is the same absence-class the fix was for,
  // one level up: a control that exists where nothing checks it.
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  /** A viewer scope over A's workspace, minted through the real path. */
  async function viewerProfileScope() {
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, w.a.scope.workspaceId as string));
    const viewer = await withWorkspace(db, { authUserId: "ob_a" });
    expect(viewer.role, "the fixture must actually be a viewer").toBe("viewer");
    return { viewer, profile: await ProfileScope.mint(db, viewer, w.a.profileId) };
  }

  it("REFUSES appendOnboardingInput — the write this slice made browser-reachable", async () => {
    const { profile } = await viewerProfileScope();
    await expect(
      writeCapabilities(profile).appendOnboardingInput({
        inputClass: "own_post",
        content: "a viewer's paste",
      })
    ).rejects.toBeInstanceOf(ProfileRoleError);
    // NOTHING WRITTEN. `onboarding_inputs` is immutable with no delete path, so
    // a row that lands here is not reversible by the owner — which is why this
    // was a BLOCK rather than a CHANGE.
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
  });

  it("REFUSES writeBrainDoc too — the class, not the field", async () => {
    const { profile } = await viewerProfileScope();
    await expect(
      db.transaction((tx) =>
        writeCapabilities(profile).writeBrainDoc(
          {
            kind: "voice",
            content: {},
            sourceEvidence: [],
            reason: { code: "creator_edit" },
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProfileRoleError);
  });

  it("does NOT refuse recordModelUsage — the settlement tail must never refuse", async () => {
    // THE DIRECTION THAT MUST NOT CHANGE (billing gate, 2026-08-27). The G-13
    // fix briefly gated this too. `model_usage` records spend the provider has
    // already billed us for, and it composes into the generation's transaction
    // — so a refusal here rolls back the debit after the tokens are burnt and
    // destroys the only record of the spend. A viewer writing one is not the
    // hazard; losing it is. The act to gate is the generation.
    const { profile } = await viewerProfileScope();
    const row = await db.transaction((tx) =>
      writeCapabilities(profile).recordModelUsage(
        {
          attemptId: "a1",
          purpose: "test",
          model: "m",
          tokensIn: 1,
          tokensOut: 1,
          costState: "unknown",
          resolvedTier: "free",
          promptBundleVersion: "v1",
          configVersion: 1,
          outcome: "succeeded",
          consumedIncludedBuild: true,
        },
        tx
      )
    );
    expect(row.attemptId).toBe("a1");
  });

  it("REFUSES createProfile at the CAPABILITY, not only at its caller", async () => {
    // The belt-and-braces half. `workspaceWriteCapabilities` is exported from
    // `@respin/db`'s root, so a package-side caller reaches it without the
    // gate in `packages/credits/src/profiles.ts` — a caller-side-only guard on
    // a documented direct entrypoint is a documented bypass.
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, w.a.scope.workspaceId as string));
    const viewer = await withWorkspace(db, { authUserId: "ob_a" });
    await expect(
      db.transaction((tx) =>
        workspaceWriteCapabilities(viewer).createProfile({ displayName: "X" }, tx)
      )
    ).rejects.toBeInstanceOf(ProfileRoleError);
  });

  it("R-118: an EDITOR is refused durable profile writes; an OWNER may do both", async () => {
    await db
      .update(memberships)
      .set({ role: "editor" })
      .where(eq(memberships.workspaceId, w.a.scope.workspaceId as string));
    const editor = await withWorkspace(db, { authUserId: "ob_a" });
    await expect(
      appendOwnPost(db, editor, w.a.profileId, "an editor's paste", true)
    ).rejects.toBeInstanceOf(ProfileRoleError);
    await expect(
      db.transaction((tx) =>
        workspaceWriteCapabilities(editor).createProfile(
          { displayName: "Second" },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProfileRoleError);
    await db
      .update(memberships)
      .set({ role: "owner" })
      .where(eq(memberships.workspaceId, w.a.scope.workspaceId as string));
    const owner = await withWorkspace(db, { authUserId: "ob_a" });
    const row = await appendOwnPost(db, owner, w.a.profileId, "an owner's paste", true);
    expect(row.content).toBe("an owner's paste");
    const created = await db.transaction((tx) =>
      workspaceWriteCapabilities(owner).createProfile({ displayName: "Second" }, tx)
    );
    expect(created.displayName).toBe("Second");
  });
});

describe("the per-profile row ceiling (production gate: the unbounded write half)", () => {
  let db: TestDb;
  let w: World;
  beforeEach(async () => {
    db = await createTestDb();
    w = await world(db);
  });

  it("REFUSES past POST_COUNT_MAX, counting THIS profile only", async () => {
    // Seeded directly rather than through 2,000 appends: the ceiling's reader
    // is what is under test, not the append loop.
    const rows = Array.from({ length: POST_COUNT_MAX }, (_, i) => ({
      profileId: w.a.profileId,
      workspaceId: w.a.scope.workspaceId as string,
      inputClass: "own_post" as const,
      content: `post ${i}`,
      contentSha256: "0".repeat(64),
    }));
    await db.insert(onboardingInputs).values(rows);

    await expect(
      appendOwnPost(db, w.a.scope, w.a.profileId, "one too many", true)
    ).rejects.toBeInstanceOf(PostContentError);

    // BOTH AXES, and this is the half a per-table count would get wrong: B's
    // profile is untouched by A being full.
    const inB = await appendOwnPost(db, w.b.scope, w.b.profileId, "B is not full", true);
    expect(inB.content).toBe("B is not full");
  });

  it("NON-VACUITY: one BELOW the ceiling still stores", async () => {
    const rows = Array.from({ length: POST_COUNT_MAX - 1 }, (_, i) => ({
      profileId: w.a.profileId,
      workspaceId: w.a.scope.workspaceId as string,
      inputClass: "own_post" as const,
      content: `post ${i}`,
      contentSha256: "0".repeat(64),
    }));
    await db.insert(onboardingInputs).values(rows);
    const ok = await appendOwnPost(db, w.a.scope, w.a.profileId, "the last one", true);
    expect(ok.content).toBe("the last one");
  });
});

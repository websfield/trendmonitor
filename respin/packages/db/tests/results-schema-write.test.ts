// Slice 9a — `recordResult`, the ONE writer of `results` (R5-R9, C3/C4).
//
// The schema half lives in `results-schema.test.ts` (every CHECK, run against
// a violating row). THIS file is about the capability: what a caller can and
// cannot decide, what the server derives, and which refusals are sayable.
//
// TWO LESSONS SHAPE EVERY CASE HERE, and they are cited rather than assumed:
//
//   CLAUDE.md 2026-08-21 — proving a field cannot be TYPED is not proving it
//   cannot be CAST. Every server-derived column is smuggled in through
//   `as unknown as` and the STORED row is read back, because a column default
//   (or, here, a value that is simply never copied) can make a missing strip
//   invisible to a type-level assertion.
//
//   CLAUDE.md 2026-08-29 — a required parameter with no default reads exactly
//   like a guard and is not one until a test drives its FALSE branch. The
//   declared-metric read (R8) is that shape: every happy-path call has an
//   active strategy with a usable metric, so the refusals get their own cases.
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { CHECK } from "../src/brain-content";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import { generationAttempts, generations } from "../src/generation-schema";
import { memberships } from "../src/schema";
import { pausePeriods } from "../src/billing-schema";
import { results, treatmentKeyFor } from "../src/results-schema";
import {
  ProfileRoleError,
  ResultDuplicateError,
  ResultInputError,
  ResultTargetError,
} from "../src/errors";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type RecordResultParams,
} from "../src/with-workspace";
import {
  countResults,
  declaredMetricForProfile,
  listResults,
  recordResult,
} from "../src/results-ops";
import { resultComparisons } from "../src/results-comparison-ops";
import { saveInterviewDraft, submitInterview } from "../src/interview-ops";
import { enumerateClaimFields, readPointer } from "../src/brain-content";

const WINDOW = {
  observedFrom: new Date("2026-08-01T00:00:00Z"),
  observedTo: new Date("2026-08-08T00:00:00Z"),
};

/**
 * A STORED strategy metric, shaped like one the product actually writes.
 *
 * THERE IS NO `key`, AND THAT ABSENCE IS THE FIXTURE'S WHOLE POINT NOW (slice
 * 9a BLOCK, 2026-09-04). This constant used to carry `key: "followers"`, which
 * no stored document has ever had: `metric.key` is `serverOwned`,
 * `parseBrainContent` strips it in the single funnel, and `writeBrainDoc`
 * stores the stripped output. Both results suites hand-built `brain_docs` rows
 * WITH a key and so tested against data the producer cannot produce —
 * CLAUDE.md's slice-8c lesson, word for word, and the reason a BLOCK reached a
 * reviewer with 4,176 tests green. The identity is derived from `label` now,
 * so this fixture is faithful; the case that proves the real producer agrees is
 * "R8/BLOCK: a result logs against a strategy document written by
 * `submitInterview`" below.
 */
const METRIC = {
  label: "New followers",
  unit: "followers per 1k views",
  direction: "higher_is_better",
};

/** What `metricKeyFromLabel` derives from `METRIC.label`. Pinned, not guessed. */
const METRIC_KEY = "new-followers";

describe("recordResult — the one writer of `results`", () => {
  let db: TestDb;
  let wsA: string;
  let wsB: string;
  let pA1: string;
  let pA2: string;
  let pB: string;
  let strategyA1: string;
  let snapshotA1: string;
  let generationA1: string;
  let generationA2: string;

  /** The legal params a creator's form produces, with only the varied bits over. */
  const params = (over: Partial<RecordResultParams> = {}): RecordResultParams =>
    ({
      platform: "shorts",
      audienceClass: "organic",
      ...WINDOW,
      reach: { value: "4000", denominator: "1000" },
      ...over,
    }) as RecordResultParams;

  const scopeFor = async (profileId: string, authUserId = "res_a") =>
    ProfileScope.mint(db, await withWorkspace(db, { authUserId }), profileId);

  const write = async (
    profileId: string,
    p: RecordResultParams,
    authUserId = "res_a"
  ) => {
    const scope = await scopeFor(profileId, authUserId);
    const caps = writeCapabilities(scope);
    return db.transaction((tx) => caps.recordResult(p, "full", tx));
  };

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "res_a");
    await seedAuthUser(db, "res_b");
    wsA = (await ensureUserWorkspace(db, { authUserId: "res_a", name: "A" }))
      .workspace.id;
    wsB = (await ensureUserWorkspace(db, { authUserId: "res_b", name: "B" }))
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

    // An ACTIVE strategy version per profile. `brain_docs_active_is_confirmed`
    // makes the three confirmation stamps mandatory for an active row, so the
    // fixture carries them.
    //
    // STILL A DIRECT INSERT, and the reason is stated rather than assumed: this
    // loop builds a row for pB, in ANOTHER WORKSPACE, which no write capability
    // can produce (it only ever writes inside its own cage) and which the
    // cross-tenant refusals need. What has changed is that the CONTENT is now
    // faithful — `METRIC` carries no `key`, exactly as a stripped stored
    // document does — so these fixtures can no longer pass on data the real
    // producer cannot make. The real producer is driven end to end in the
    // `submitInterview` case below.
    for (const [profileId, workspaceId] of [
      [pA1, wsA],
      [pA2, wsA],
      [pB, wsB],
    ] as const) {
      const [doc] = await db
        .insert(brainDocs)
        .values({
          profileId,
          workspaceId,
          kind: "strategy",
          version: 1,
          content: { metric: METRIC },
          reason: "fixture",
          sourceEvidence: [{ field: "/metric/label" }],
          status: "active",
          confirmedAt: new Date(),
          confirmedContentSha256: "0".repeat(64),
          activatedAt: new Date(),
        })
        .returning();
      if (profileId === pA1) strategyA1 = doc.id;
      const [snapshot] = await db
        .insert(brainActivationSnapshots)
        .values({ profileId, workspaceId })
        .returning();
      if (profileId === pA1) snapshotA1 = snapshot.id;
      const attemptId = `att_${profileId}`;
      await db.insert(generationAttempts).values({
        profileId,
        workspaceId,
        attemptId,
        purpose: "generation",
        mode: "hookSet",
        payloadSha256: "a".repeat(64),
      });
      const [generation] = await db
        .insert(generations)
        .values({
          profileId,
          workspaceId,
          attemptId,
          mode: "hookSet",
          brainActivationId: snapshot.id,
          frameworkVersions: [{ id: "fw-1", version: 2 }],
          request: { idea: "shipping on a Friday" },
          model: "claude-opus-5",
          promptBundleVersion: "pb-1",
          configVersion: 1,
          outcome: "usable",
          output: { hooks: ["Ship it on a Friday."] },
          weakestPoint: "you have logged no results, so nothing here is evidence about you",
          killTest: { rulesFired: [], rewritten: false },
        })
        .returning();
      if (profileId === pA1) generationA1 = generation.id;
      if (profileId === pA2) generationA2 = generation.id;
    }
  });

  // ------------------------------------------------------ the happy paths

  it("stores a quantified self-reported result and stamps the scope's ids", async () => {
    const row = await write(pA1, params({ generationId: generationA1 }));
    expect(row.profileId).toBe(pA1);
    expect(row.workspaceId).toBe(wsA);
    expect(row.evidenceState).toBe("quantified_self_reported");
    expect(row.reachValue).toBe("4000.00000000");
    expect(row.conversionValue).toBeNull();
    expect(row.confounders).toEqual([]);
  });

  it("R6: numbers a creator typed are self-reported, never verified — and none is `unquantified`", async () => {
    const quantified = await write(pA1, params({ generationId: generationA1 }));
    expect(quantified.evidenceState).toBe("quantified_self_reported");
    // Verification 3's other half: no numbers at all is STORED, not refused,
    // and carries no lever column for any cohort to pick up (R16).
    const unquantified = await write(pA1, params({ reach: undefined }));
    expect(unquantified.evidenceState).toBe("unquantified");
    expect([
      unquantified.reachValue,
      unquantified.reachDenominator,
      unquantified.conversionValue,
      unquantified.conversionDenominator,
    ]).toEqual([null, null, null, null]);
  });

  it.each([
    ["reach value only", params({ reach: { value: "4000", denominator: "" } })],
    ["reach denominator only", params({ reach: { value: "", denominator: "1000" } })],
    ["conversion value only", params({ conversion: { value: "12", denominator: "" } })],
    ["conversion denominator only", params({ conversion: { value: "", denominator: "1000" } })],
  ])("refuses %s at the real writer and inserts no row", async (_label, partial) => {
    await expect(write(pA1, partial)).rejects.toThrow(ResultInputError);
    expect(await db.select().from(results)).toHaveLength(0);
  });

  it("R9: the two levers are stored APART — nothing here produces one number", async () => {
    const row = await write(
      pA1,
      params({
        reach: { value: "4000", denominator: "1000" },
        conversion: { value: "12", denominator: "1000" },
      })
    );
    expect(row.reachValue).toBe("4000.00000000");
    expect(row.reachDenominator).toBe("1000.00000000");
    expect(row.conversionValue).toBe("12.00000000");
    expect(row.conversionDenominator).toBe("1000.00000000");
    // There is no summed column, and no key on the stored row whose name
    // suggests one. A test cannot prove a score is never computed anywhere;
    // what it can prove is that this row does not carry one.
    expect(Object.keys(row)).not.toContain("score");
    expect(Object.keys(row)).not.toContain("value");
  });

  // ----------------------------------------- the five server-derived columns

  it("CAST, not merely untypeable: no server-derived column survives from a caller", async () => {
    // The 2026-08-21 lesson, applied to all five at once. Every one of these
    // keys is either absent from `RecordResultParams` or `?: never` on it, so
    // the cast is the ONLY way to attempt them — and the assertion is about the
    // STORED row, not about the type.
    const forged = {
      ...params({ generationId: generationA1 }),
      // R6: the state a v1 caller must never be able to claim.
      evidenceState: "connector_verified",
      connectorSource: "youtube_analytics",
      connectorEventId: "evt_1",
      connectorObservedAt: new Date("2026-08-09T00:00:00Z"),
      // C3: the declared metric is READ, never taken.
      metricKey: "vanity_metric",
      metricDeclaredByDocId: "00000000-0000-4000-8000-000000000000",
      // C4: the treatment key is COMPUTED.
      treatmentKey: "smuggled",
      // ...and the scope, for the same reason every other capability asserts it.
      profileId: pA2,
      workspaceId: wsB,
      id: "00000000-0000-4000-8000-000000000001",
    } as unknown as RecordResultParams;

    const row = await write(pA1, forged);
    expect(row.evidenceState, "a cast reached `evidence_state`").toBe(
      "quantified_self_reported"
    );
    expect(row.connectorSource).toBeNull();
    expect(row.connectorEventId).toBeNull();
    expect(row.connectorObservedAt).toBeNull();
    expect(row.metricKey, "a cast reached `metric_key`").toBe(METRIC_KEY);
    expect(row.metricDeclaredByDocId).toBe(strategyA1);
    expect(row.treatmentKey, "a cast reached `treatment_key`").toBe(
      treatmentKeyFor({
        generation: {
          mode: "hookSet",
          frameworkVersions: [{ id: "fw-1", version: 2 }],
          brainActivationId: snapshotA1,
        },
        metricKey: METRIC_KEY,
      })
    );
    expect(row.profileId).toBe(pA1);
    expect(row.workspaceId).toBe(wsA);
    expect(row.id).not.toBe("00000000-0000-4000-8000-000000000001");
  });

  it("C4: the treatment key is derived from the generation, and a result without one has NO key", async () => {
    const linked = await write(pA1, params({ generationId: generationA1 }));
    expect(linked.treatmentKey).toBe(
      "fw-1@2|hookSet|" + snapshotA1 + "|" + METRIC_KEY
    );
    // R5's other shape: a post this product did not write. Stored, keyless —
    // and therefore baseline-eligible and cohort-ineligible by construction,
    // which is a database property (`results_treatment_key_iff_generation`)
    // rather than something the comparison has to remember.
    const unlinked = await write(pA1, params({ observedTo: new Date("2026-08-09T00:00:00Z") }));
    expect(unlinked.generationId).toBeNull();
    expect(unlinked.treatmentKey).toBeNull();
  });

  // ------------------------------------------------------ R8, both branches

  it("BLOCK, END TO END: real writer -> recordResult -> resultComparisons -> a real group", async () => {
    // THE TEST THE SLICE SHOULD HAVE BEEN BUILT ON, and the one whose absence
    // let a BLOCK reach a reviewer with 4,176 tests green.
    //
    // NOT ONE HOP IS FAKED. There is no hand-built `brain_docs` row anywhere in
    // this case, no directly-inserted `results` row, and no call to
    // `buildComparisonGroups`. Each hop is a place a fixture hid the defect:
    //
    //   the real WRITER      catches the `serverOwned` strip — the BLOCK itself.
    //                        `metric.key` never reaches storage, so a fixture
    //                        that carried one agreed with nothing.
    //   `recordResult`       catches the R8 refusal a direct INSERT skips: the
    //                        declaration is read from the profile's own active
    //                        Strategy, not handed in.
    //   `resultComparisons`  catches a `declaredMetrics` map that resolves in a
    //                        fixture and not in production — the second-order
    //                        version of the same defect. Calling the builder
    //                        directly would supply the map by hand and prove
    //                        nothing about where it comes from.
    //
    // AND IT LIVES IN `packages/db`, which is not a preference either: builder
    // C established that `respin/tests/` CANNOT import `@respin/brain` (it is
    // absent from the app package's `node_modules`), so this path is provable
    // here and nowhere else. That structural fact is what made hand-built
    // fixtures the only option upstream, and the habit is what this case ends.
    const workspaceScope = await withWorkspace(db, { authUserId: "res_a" });

    // 1. THE REAL WRITER. Draft, submit, confirm, activate — the whole
    //    ceremony a creator walks, with nothing inserted by hand.
    await saveInterviewDraft(db, workspaceScope, pA1, {
      metricLabel: { status: "decided", value: "Weekly saves" },
      metricUnit: { status: "decided", value: "saves per 1k views" },
      metricDirection: { status: "decided", value: "higher_is_better" },
    });
    await submitInterview(db, workspaceScope, pA1);
    const scope = await scopeFor(pA1);
    const caps = writeCapabilities(scope);
    const proposed = (await scope.accessors.brainDocsByKind("strategy")).find(
      (doc) => doc.status === "proposed"
    );
    expect(proposed, "submitInterview wrote no proposed strategy").toBeDefined();
    // THE STRIP, RE-PROVEN IN THIS CASE rather than cited from another: the
    // document the real writer produced carries NO `metric.key`.
    expect(
      "key" in
        (((proposed!.content as { metric?: Record<string, unknown> }).metric) ?? {}),
      "a stored strategy document now HAS a metric.key — re-read declaredMetricOf"
    ).toBe(false);
    await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        {
          brainDocId: proposed!.id,
          confirmedFields: enumerateClaimFields("strategy", proposed!.content).map(
            (pointer) => ({
              pointer,
              asPlaceholder: readPointer(proposed!.content, pointer) === CHECK,
            })
          ),
        },
        tx
      )
    );
    const activated = await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: proposed!.id }, tx)
    );
    expect(activated.status).toBe("active");

    // 2. `recordResult`, THREE TIMES, through the capability. Same generation,
    //    same platform/class/metric, three observation windows — which is what
    //    `results_generation_metric_window_uq` exists to permit, and it puts
    //    three rows in ONE stratum sharing ONE treatment key.
    for (const [from, to] of [
      ["2026-08-01", "2026-08-08"],
      ["2026-08-01", "2026-08-15"],
      ["2026-08-01", "2026-08-22"],
    ] as const) {
      const row = await write(
        pA1,
        params({
          generationId: generationA1,
          observedFrom: new Date(from),
          observedTo: new Date(to),
        })
      );
      // The identity is DERIVED from the creator's decided label, every time.
      expect(row.metricKey).toBe("weekly-saves");
      expect(row.metricDeclaredByDocId).toBe(activated.id);
    }

    // 3. R-115 (Phase 10a C1), ON THE REAL WRITER: the three rows the only
    //    production writer can mint are self-reported, and self-reported never
    //    enters a population. SINCE R-170 (audit Phase 2, P2-A1) NO GROUP IS
    //    BUILT AT ALL: a group headed by a self-reported row could never be
    //    filled, and the page said "N more results would make one" under the
    //    notice that verified analytics are not connected. This is that state,
    //    proven from the write path.
    const selfReportedGroups = await resultComparisons(db, workspaceScope, pA1);
    expect(selfReportedGroups, "a group was built that no self-reported result could ever fill").toEqual([]);

    // 3b. VERIFIED ROWS, inserted directly because no production writer can
    //     mint them (R-115: only the future connector seam may): same stratum,
    //     same treatment key, three windows. From here the case is the
    //     original one — the `declaredMetrics` map either resolves from stored
    //     documents or it does not.
    const written = await db.select().from(results).where(eq(results.profileId, pA1));
    expect(written).toHaveLength(3);
    await db.insert(results).values(written.map((row, index) => ({
      profileId: row.profileId,
      workspaceId: row.workspaceId,
      generationId: row.generationId,
      platform: row.platform,
      audienceClass: row.audienceClass,
      metricKey: row.metricKey,
      metricDeclaredByDocId: row.metricDeclaredByDocId,
      observedFrom: new Date(row.observedFrom.getTime() + 24 * 60 * 60_000 * (index + 40)),
      observedTo: new Date(row.observedTo.getTime() + 24 * 60 * 60_000 * (index + 40)),
      treatmentKey: row.treatmentKey,
      evidenceState: "connector_verified" as const,
      connectorSource: "fixture-connector",
      connectorEventId: `evt-e2e-${index}`,
      connectorObservedAt: new Date("2026-09-01T00:00:00Z"),
      reachValue: row.reachValue,
      reachDenominator: row.reachDenominator,
      confounders: [],
    })));
    const groups = await resultComparisons(db, workspaceScope, pA1);
    expect(
      groups.length,
      "no comparison group was produced from three real results — the declaredMetrics map did not resolve"
    ).toBeGreaterThan(0);

    // 4. A REAL GROUP, with the creator's own unit and direction on it.
    const group = groups[0];
    expect(group.stratum.profileId).toBe(pA1);
    expect(group.stratum.metricKey).toBe("weekly-saves");
    expect(group.stratum.metricDeclaredByDocIds).toEqual([activated.id]);
    expect(group.treatmentKey).toContain("weekly-saves");
    expect(group.comparisons.length).toBeGreaterThan(0);
    const reach = group.comparisons.find((c) => c.lever === "reach");
    expect(reach, "the reach lever is missing from the group").toBeDefined();
    // THE UNIT AND DIRECTION COME FROM THE DOCUMENT THE INTERVIEW WROTE, which
    // is the whole chain in one assertion: label -> derived key -> result row ->
    // declaredMetrics map -> group.
    expect(reach!.unit).toBe("saves per 1k views");
    expect(reach!.direction).toBe("higher_is_better");
    // 5. THE READ FACADE THE PAGE USES agrees with the write path about the
    //    same document. Folded in from a narrower real-producer case that used
    //    to sit above this one: two tests walking the same ceremony is the
    //    duplication a future builder copies the wrong half of.
    expect(await declaredMetricForProfile(db, workspaceScope, pA1)).toEqual({
      key: "weekly-saves",
      label: "Weekly saves",
      unit: "saves per 1k views",
      direction: "higher_is_better",
    });
    // ...and the population is the logged POST, so the group is not an empty
    // shell that happens to carry the right labels. THREE ROWS OF ONE
    // GENERATION OVER NESTED WINDOWS ARE ONE POST (R-170, audit Phase 2
    // P2-A1): this read `present`, n = 3 until n counted distinct posts. The
    // state is asserted BEFORE the count because `Population` is a
    // discriminated union whose `truncated` arm carries no `n`.
    expect(reach!.treatment.state).toBe("short");
    if (reach!.treatment.state === "short") {
      expect(reach!.treatment.n).toBe(1);
      expect(reach!.treatment.resultIds).toHaveLength(1);
    }
  });

  it("R8: it REFUSES when there is no compatible metric declaration — every absence", async () => {
    // The 2026-08-29 lesson: this read looks like a guard on the happy path and
    // is only one if its false branches are driven. Four of them are.
    //
    // (a) No strategy document at all.
    await db.delete(brainDocs).where(eq(brainDocs.profileId, pA1));
    await expect(write(pA1, params())).rejects.toThrow(ResultInputError);
    await expect(write(pA1, params())).rejects.toThrow(/Strategy/);

    // (b) A strategy that is PROPOSED, not active — the metric a creator has
    //     not adopted is not the metric their results are measured against.
    const proposed = async (content: unknown) => {
      await db.delete(brainDocs).where(eq(brainDocs.profileId, pA1));
      await db.insert(brainDocs).values({
        profileId: pA1,
        workspaceId: wsA,
        kind: "strategy",
        version: 1,
        content: content as never,
        reason: "fixture",
        sourceEvidence: [{ field: "/metric/label" }],
      });
    };
    await proposed({ metric: METRIC });
    await expect(write(pA1, params())).rejects.toThrow(ResultInputError);

    // (c) An ACTIVE strategy that declares no metric, and (d) one whose unit
    //     and direction are still `[check]` — a number with no unit has no
    //     meaning, and "better" cannot be inferred without a direction.
    const active = async (content: unknown) => {
      await db.delete(brainDocs).where(eq(brainDocs.profileId, pA1));
      await db.insert(brainDocs).values({
        profileId: pA1,
        workspaceId: wsA,
        kind: "strategy",
        version: 1,
        content: content as never,
        reason: "fixture",
        sourceEvidence: [{ field: "/metric/label" }],
        status: "active",
        confirmedAt: new Date(),
        confirmedContentSha256: "0".repeat(64),
        activatedAt: new Date(),
      });
    };
    for (const [label, content] of [
      ["no metric", {}],
      // A BLANK OR UNDECIDED LABEL, which is what "no identity yet" actually
      // looks like now. This case used to be `key: "unset"` — a condition that
      // can no longer occur, because no stored document has a key at all and
      // `declaredMetricOf` does not read one. Replacing it rather than deleting
      // it keeps the population "every way a declaration can be unusable".
      ["a blank label", { metric: { ...METRIC, label: "   " } }],
      ["a [check] label", { metric: { ...METRIC, label: CHECK } }],
      ["a [check] unit", { metric: { ...METRIC, unit: CHECK } }],
      ["a [check] direction", { metric: { ...METRIC, direction: CHECK } }],
    ] as [string, unknown][]) {
      await active(content);
      await expect(write(pA1, params()), label).rejects.toThrow(ResultInputError);
      await expect(write(pA1, params()), label).rejects.toThrow(/north-star metric/);
    }

    // NON-VACUITY: restore a usable declaration and the same call succeeds, so
    // the refusals above are about the declaration and not about the fixture.
    await active({ metric: METRIC });
    await expect(write(pA1, params())).resolves.toBeDefined();
  });

  // ------------------------------------------------------------- the refusals

  it("R5: a foreign, missing or malformed generation id is ONE byte-identical refusal", async () => {
    const messages: string[] = [];
    for (const generationId of [
      generationA2, // a SIBLING profile's output, same workspace
      "00000000-0000-4000-8000-000000000000", // does not exist
      "not-a-uuid", // malformed — must not be a different observable
    ]) {
      const error = await write(pA1, params({ generationId })).catch((e) => e);
      expect(error, String(generationId)).toBeInstanceOf(ResultTargetError);
      messages.push((error as Error).message);
    }
    expect(new Set(messages).size, "the three refusals are distinguishable — that is an oracle").toBe(1);
    // ...and the message names no id, so a uuidv7's creation time does not leak.
    expect(messages[0]).not.toContain(generationA2);
  });

  it("the closed vocabularies are refused at RUNTIME — the boundary takes WIRE types", async () => {
    // THE PARAMS ARE `string` AND `readonly string[]` ON PURPOSE (2026-09-04).
    // These values arrive from a form post, and builder C refused to cast them
    // at the call site — correctly, because a cast makes the closed set a claim
    // the TYPE makes about a value the WIRE controls (the 2026-08-26
    // trusted-`input_class` finding), leaving the pgEnum as the only thing
    // between a form and a 22P02 rendered as "Something went wrong". So NONE of
    // these cases needs a cast to compile, which is the property: they are what
    // a browser can actually send.
    for (const [label, p, names] of [
      [
        "an audience class outside the two",
        params({ audienceClass: "boosted" }),
        "boosted",
      ],
      ["an empty audience class", params({ audienceClass: "" }), '""'],
      [
        "a confounder outside the six",
        params({ confounders: ["seasonality"] }),
        "seasonality",
      ],
      [
        "a known confounder beside an unknown one",
        params({ confounders: ["topic_overlap", "seasonality"] }),
        "seasonality",
      ],
    ] as [string, RecordResultParams, string][]) {
      const error = await write(pA1, p).catch((e) => e);
      expect(error, label).toBeInstanceOf(ResultInputError);
      // IT NAMES WHAT ARRIVED. "That is not a confounder we have" is
      // unactionable when a form posted six checkboxes and one is stale.
      expect((error as Error).message, label).toContain(names);
    }
    // ...and the shapes that are not text at all, which a cast IS needed to
    // reach — the type says `string[]`, and a runtime check is still what
    // stands between `[7]` and the column (CLAUDE.md 2026-08-21).
    for (const [label, p] of [
      ["an audience class that is not text", params({ audienceClass: 7 as never })],
      ["a confounder that is not text", params({ confounders: [7] as never })],
      ["confounders that are not a list", params({ confounders: "topic_overlap" as never })],
    ] as [string, RecordResultParams][]) {
      await expect(write(pA1, p), label).rejects.toThrow(ResultInputError);
    }
  });

  it("the refusal's echo of wire input is BOUNDED and flattened", async () => {
    // An unbounded echo turns a paste-bomb into a paste-bomb in an error
    // message and in a log line, and a newline in a refusal breaks the
    // one-sentence shape every other error in this package keeps.
    const bomb = "x".repeat(5_000);
    const error = await write(pA1, params({ audienceClass: bomb })).catch((e) => e);
    expect(error).toBeInstanceOf(ResultInputError);
    const message = (error as Error).message;
    expect(message.length, "the whole paste reached the refusal").toBeLessThan(400);
    expect(message).toContain("xxxx");
    const multiline = await write(
      pA1,
      params({ audienceClass: "organic\nbut also paid" })
    ).catch((e) => e);
    expect((multiline as Error).message).not.toContain("\n");
  });

  it("R4: an Invalid Date is refused HERE, not by the CHECK that cannot see it", async () => {
    // `new Date("last tuesday")` is a real Date whose time is NaN, and
    // `results_window_forward` DOES NOT CATCH IT: every comparison against NaN
    // is false, so Postgres refuses the row with a 23514 that
    // `billing-errors.ts` has no case for. The refusal has to be here, and it
    // has to say which end of the window is unreadable.
    const start = await write(
      pA1,
      params({ observedFrom: new Date("last tuesday") })
    ).catch((e) => e);
    expect(start).toBeInstanceOf(ResultInputError);
    expect((start as Error).message).toContain("start of the observation window");
    const end = await write(
      pA1,
      params({ observedTo: new Date("nonsense") })
    ).catch((e) => e);
    expect(end).toBeInstanceOf(ResultInputError);
    expect((end as Error).message).toContain("end of the observation window");
    // ...and the two refusals are DIFFERENT, so a creator is not sent to fix
    // the field that was fine.
    expect((start as Error).message).not.toBe((end as Error).message);
    // THE PREMISE, MEASURED rather than argued: an Invalid Date really does
    // slip past the CHECK's comparison, so this refusal is load-bearing. The
    // row is refused — by a raw driver error, which is the outcome the typed
    // refusal above replaces.
    // WRAPPED IN AN ASYNC THUNK, because the failure is SYNCHRONOUS: drizzle
    // maps a timestamp parameter with `toISOString()` while BUILDING the
    // query, so an Invalid Date throws a RangeError before any promise exists
    // and a bare `.catch()` never attaches. That is a sharper version of the
    // point this case makes - the unreadable failure happens even earlier than
    // the CHECK, and `recordResult` is the only place a creator-readable
    // refusal can come from.
    const raw = await (async () =>
      db.insert(results).values({
        profileId: pA1,
        workspaceId: wsA,
        platform: "shorts",
        audienceClass: "organic",
        metricKey: "followers",
        metricDeclaredByDocId: strategyA1,
        observedFrom: new Date("2026-08-01T00:00:00Z"),
        observedTo: new Date("nonsense"),
        evidenceState: "quantified_self_reported",
        reachValue: "1",
        reachDenominator: "1000",
      } as never))().catch((e) => e);
    expect(raw, "an Invalid Date was STORED").toBeInstanceOf(Error);
    expect(
      (raw as Error).message,
      "the driver's error is what a creator would have read without the typed refusal"
    ).not.toContain("observation window");
  });

  it("the window must still be two real dates that move forward", async () => {
    for (const [label, p] of [
      ["a reversed window", params({ observedTo: new Date("2026-07-01T00:00:00Z") })],
      [
        "a zero-width window",
        params({ observedTo: new Date("2026-08-01T00:00:00Z") }),
      ],
      // A string is what a form field produces before somebody parses it. It
      // must be a NAMED refusal rather than a driver error.
      ["a string instead of a date", params({ observedFrom: "2026-08-01" as never })],
    ] as [string, RecordResultParams][]) {
      await expect(write(pA1, p), label).rejects.toThrow(ResultInputError);
    }
  });

  it("the note follows `generation_feedback`'s rules exactly", async () => {
    await expect(write(pA1, params({ note: "   " }))).rejects.toThrow(ResultInputError);
    await expect(write(pA1, params({ note: "\n\t" }))).rejects.toThrow(ResultInputError);
    await expect(
      write(pA1, params({ note: "x".repeat(2001) }))
    ).rejects.toThrow(ResultInputError);
    await expect(write(pA1, params({ note: 7 as never }))).rejects.toThrow(
      ResultInputError
    );
    // NFC + CRLF->LF, so two notes a person cannot tell apart are one note.
    const row = await write(pA1, params({ note: "line one\r\nline two" }));
    expect(row.note).toBe("line one\nline two");
  });

  it("the platform is normalised, bounded and non-blank", async () => {
    await expect(write(pA1, params({ platform: "  " }))).rejects.toThrow(
      ResultInputError
    );
    await expect(
      write(pA1, params({ platform: "p".repeat(81) }))
    ).rejects.toThrow(ResultInputError);
    const row = await write(pA1, params({ platform: "  YouTube Shorts " }));
    expect(row.platform).toBe("YouTube Shorts");
  });

  it("confounders are deduplicated and stored in the vocabulary's order", async () => {
    const row = await write(
      pA1,
      params({
        confounders: [
          "account_growth",
          "topic_overlap",
          "account_growth",
        ],
      })
    );
    // Deduplicated, because the same confounder named twice is one fact; and
    // ordered by the vocabulary, so two identical sets are the same bytes.
    expect(row.confounders).toEqual(["topic_overlap", "account_growth"]);
  });

  it("a duplicate observation is REFUSED, never swallowed", async () => {
    await write(pA1, params({ generationId: generationA1 }));
    await expect(
      write(pA1, params({ generationId: generationA1 }))
    ).rejects.toThrow(ResultDuplicateError);
    // A different window is a different observation, which is the way forward
    // the refusal's copy names.
    await expect(
      write(
        pA1,
        params({
          generationId: generationA1,
          observedTo: new Date("2026-08-15T00:00:00Z"),
        })
      )
    ).resolves.toBeDefined();
  });

  it("a VIEWER may not log a result", async () => {
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, wsA));
    await expect(write(pA1, params())).rejects.toThrow(ProfileRoleError);
  });

  it("REQ-G08: it is DELIBERATELY not pause-gated, and the warrant is in WRITE_PAUSE_POLICY", async () => {
    // A-7 exemption 1: input the creator submitted, about a window that has
    // already passed and cannot be re-observed later. The entry in
    // `WRITE_PAUSE_POLICY` is what makes this a decision rather than an
    // oversight — `with-workspace.test.ts` derives that map's population from
    // the source, so this case asserts the BEHAVIOUR the warrant claims.
    await db.insert(pausePeriods).values({
      workspaceId: wsA,
      startedAt: new Date("2026-07-01T00:00:00Z"),
      startedKnownAt: new Date("2026-07-01T00:00:00Z"),
    });
    await expect(write(pA1, params())).resolves.toBeDefined();
  });

  // ------------------------------------------------------- the scoped reader

  it("the accessor and the ops facade return THIS profile's results only", async () => {
    await write(pA1, params({ generationId: generationA1 }));
    await write(pA2, params({ generationId: generationA2 }));
    const scope = await scopeFor(pA1);
    const mine = await scope.accessors.results();
    expect(mine.map((r) => r.profileId)).toEqual([pA1]);
    // ...and through the app-facing facade, which is the door the route uses.
    const workspaceScope = await withWorkspace(db, { authUserId: "res_a" });
    expect(
      (await listResults(db, workspaceScope, pA2)).map((r) => r.profileId)
    ).toEqual([pA2]);
    // NON-VACUITY: the sibling's row exists and is visible to its OWN scope.
    expect((await db.select().from(results)).length).toBe(2);
  });

  // AUDIT P6-R6 (register item 8): THE CROSS-PROFILE WITNESS for the count
  // behind Studio's and first ideas' results sentence. A count that leaked a
  // sibling's or a foreign workspace's rows would tell a creator "you have
  // logged N results" about rows that are not theirs.
  it("countResults counts THIS profile's results only: a sibling in the same workspace and a foreign workspace both count zero for A", async () => {
    // B-side rows only: the same-workspace sibling (pA2) logs two, the
    // foreign workspace's profile (pB) logs one, and A has logged nothing.
    await write(pA2, params({ generationId: generationA2 }));
    await write(
      pA2,
      params({ generationId: generationA2, observedTo: new Date("2026-08-15T00:00:00Z") })
    );
    await write(pB, params(), "res_b");
    expect((await db.select().from(results)).length, "the fixture rows exist").toBe(3);

    const workspaceA = await withWorkspace(db, { authUserId: "res_a" });
    const workspaceB = await withWorkspace(db, { authUserId: "res_b" });
    // Through the ops facade (mint, then the scope's own accessor) ...
    expect(await countResults(db, workspaceA, pA1)).toBe(0);
    // ... and through the accessor directly, on the same profile.
    expect(await (await scopeFor(pA1)).accessors.countResults()).toBe(0);
    // The sibling counts its own two, and only those.
    expect(await countResults(db, workspaceA, pA2)).toBe(2);
    // The foreign profile counts its own one through its own workspace...
    expect(await countResults(db, workspaceB, pB)).toBe(1);
    // ...and workspace A's scope cannot count it at all: the mint refuses.
    await expect(countResults(db, workspaceA, pB)).rejects.toThrow();

    // A's own row moves A from the zero branch to one, and nobody else moves.
    await write(pA1, params({ generationId: generationA1 }));
    expect(await countResults(db, workspaceA, pA1)).toBe(1);
    expect(await countResults(db, workspaceA, pA2)).toBe(2);
    expect(await countResults(db, workspaceB, pB)).toBe(1);
  });

  it("the ops facade writes through the same capability, in its own transaction", async () => {
    const workspaceScope = await withWorkspace(db, { authUserId: "res_a" });
    const row = await recordResult(
      db,
      workspaceScope,
      pA1,
      params({ generationId: generationA1 }),
      "full"
    );
    expect(row.profileId).toBe(pA1);
    // ...and a foreign profile is refused at the mint, before anything is
    // written, so the facade cannot be the way around the cage.
    await expect(
      recordResult(db, workspaceScope, pB, params(), "full")
    ).rejects.toThrow();
    expect((await db.select().from(results)).length).toBe(1);
  });
});

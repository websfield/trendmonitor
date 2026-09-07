// Slice 9a — the `results` table's constraints, RUN rather than read (R5-R9,
// contract C1-C4).
//
// The `generation-schema.test.ts` discipline and the same reason: migration
// 0011 once shipped a composite FK referencing a unique INDEX drizzle-kit emits
// AFTER the FK, and it was verified by READING the SQL. "The constraint is
// emitted" and "the constraint is emitted in a working order" are different
// checks, and only running the migration tells them apart — which matters more
// for 0029 than for most, because that migration's statement order was
// hand-corrected (its `results_metric_doc_fk` was generated AHEAD of the
// `brain_docs` unique it references). Every case below runs the committed
// migrations into PGlite and attempts the row each constraint exists to forbid.
//
// EVERY ONE OF CONTRACT C2's SIX INVARIANTS HAS ITS OWN CASE HERE, plus the
// three this schema adds (the lever-pair equality, the treatment-key equality
// and the closed confounder set). A CHECK nothing has ever tried to violate is
// a comment.
//
// AND EVERY CASE IS NON-VACUOUS BY CONSTRUCTION: each one that asserts a
// refusal also lands the nearest LEGAL row, so "the database refused it" is
// never satisfied by a fixture that could not have been stored anyway.
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { CHECK, parseBrainContent } from "../src/brain-content";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import { generationAttempts, generations } from "../src/generation-schema";
import {
  RESULT_CONFOUNDER_CODES,
  type ResultConfounderCode,
  declaredMetricOf,
  results,
  treatmentKeyFor,
} from "../src/results-schema";
import { TreatmentKeyError } from "../src/errors";

const WINDOW = {
  observedFrom: new Date("2026-08-01T00:00:00Z"),
  observedTo: new Date("2026-08-08T00:00:00Z"),
};

describe("slice 9a: the results table's constraints", () => {
  let db: TestDb;
  let wsA: string;
  let wsB: string;
  let pA1: string;
  let pA2: string;
  let pB: string;
  /** pA1's brain doc — the C3 declared-metric pointer's target. */
  let docA1: string;
  let docA2: string;
  let docB: string;
  let generationA1: string;
  let generationA2: string;

  /** A LEGAL row for pA1, with only what a case varies overridden. */
  const resultFor = (
    profileId: string,
    workspaceId: string,
    over: Record<string, unknown> = {}
  ) => ({
    profileId,
    workspaceId,
    platform: "shorts",
    audienceClass: "organic" as const,
    metricKey: "followers",
    metricDeclaredByDocId:
      profileId === pA1 ? docA1 : profileId === pA2 ? docA2 : docB,
    ...WINDOW,
    evidenceState: "quantified_self_reported" as const,
    reachValue: "4000",
    reachDenominator: "1000",
    ...over,
  });

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

    const docs = await db
      .insert(brainDocs)
      .values(
        [
          [pA1, wsA],
          [pA2, wsA],
          [pB, wsB],
        ].map(([profileId, workspaceId]) => ({
          profileId,
          workspaceId,
          kind: "strategy" as const,
          version: 1,
          content: {
            metric: {
              key: "followers",
              label: "New followers",
              unit: "followers per 1k views",
              direction: "higher_is_better",
            },
          },
          reason: "fixture",
          sourceEvidence: [{ field: "/metric/label" }],
        }))
      )
      .returning();
    docA1 = docs[0].id;
    docA2 = docs[1].id;
    docB = docs[2].id;

    // Two generations in workspace A, one per profile, so the same-tenant FK
    // has something FOREIGN to refuse rather than only something missing.
    const built: string[] = [];
    for (const [profileId, workspaceId] of [
      [pA1, wsA],
      [pA2, wsA],
    ] as const) {
      const [snapshot] = await db
        .insert(brainActivationSnapshots)
        .values({ profileId, workspaceId })
        .returning();
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
      built.push(generation.id);
    }
    generationA1 = built[0];
    generationA2 = built[1];
  });

  // ------------------------------------------------- contract C2, invariant 1

  it("C2.1: an `unquantified` row cannot carry ANY lever column", async () => {
    // The structural half of R16 — `unquantified` never enters a numerical
    // cohort because there is no number on the row for a cohort to include.
    for (const [label, over] of [
      ["reach value", { reachValue: "4000", reachDenominator: "1000" }],
      ["conversion value", { conversionValue: "12", conversionDenominator: "1000" }],
      // The single-column shapes too: `results_lever_pairs_complete` also
      // refuses these, and asserting them here keeps THIS invariant's claim
      // ("all four NULL") true of each column rather than of the pairs.
      ["a bare reach value", { reachValue: "4000" }],
      ["a bare conversion denominator", { conversionDenominator: "1000" }],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(
          resultFor(pA1, wsA, {
            evidenceState: "unquantified",
            reachValue: null,
            reachDenominator: null,
            ...over,
          }) as never
        ),
        `an unquantified result carrying ${label} was accepted`
      ).rejects.toThrow();
    }
    // NON-VACUITY: the same row with no levers at all lands.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          evidenceState: "unquantified",
          reachValue: null,
          reachDenominator: null,
        })
      )
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------- contract C2, invariant 2

  it("C2.2: a quantified row must carry at least one COMPLETE lever pair", async () => {
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, { reachValue: null, reachDenominator: null })
      ),
      "a `quantified_self_reported` result with no numbers at all was accepted — that is the deceptive boolean R6 replaced, wearing an enum"
    ).rejects.toThrow();
    // NON-VACUITY, on the OTHER lever: conversion alone is enough.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          reachValue: null,
          reachDenominator: null,
          conversionValue: "12",
          conversionDenominator: "1000",
        })
      )
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------- contract C2, invariant 3

  it("C2.3: a lever is a PAIR — a value with no denominator is refused, on both levers", async () => {
    for (const [label, over] of [
      ["reach value, no denominator", { reachDenominator: null }],
      ["reach denominator, no value", { reachValue: null }],
      [
        "conversion value, no denominator",
        { conversionValue: "12", conversionDenominator: null },
      ],
      [
        "conversion denominator, no value",
        { conversionValue: null, conversionDenominator: "1000" },
      ],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, over) as never),
        `${label} was accepted — a per-1k over an absent denominator is undefined too`
      ).rejects.toThrow();
    }
    // NON-VACUITY: both complete pairs on one row is legal, and is the shape a
    // creator who has both numbers logs.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          conversionValue: "12",
          conversionDenominator: "1000",
        })
      )
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------- contract C2, invariant 4

  it("C2.4 (M16): a denominator of zero — or below — is refused on both levers", async () => {
    for (const [label, over] of [
      ["reach denominator 0", { reachDenominator: "0" }],
      ["reach denominator -1", { reachDenominator: "-1" }],
      [
        "conversion denominator 0",
        { conversionValue: "12", conversionDenominator: "0" },
      ],
      [
        "conversion denominator -0.00000001",
        { conversionValue: "12", conversionDenominator: "-0.00000001" },
      ],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, over) as never),
        `${label} was accepted — a per-1k over a zero denominator is not a small number, it is undefined`
      ).rejects.toThrow();
    }
    // NON-VACUITY: the smallest storable positive denominator lands, so the
    // constraint is `> 0` and not `>= some floor` nobody wrote down.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, { reachDenominator: "0.00000001" })
      )
    ).resolves.toBeDefined();
  });

  it("C2.4b: a NaN figure is refused on ALL FOUR lever columns", async () => {
    // THE DEFECT THIS CASE EXISTS FOR (builder C, 2026-09-04): `numeric` has a
    // NaN, and every constraint on this table passed it. A case that only
    // asserted `-1` and `0` was refused would have been green BEFORE the fix
    // and AFTER it, which is the "green suite that proves nothing" this repo
    // keeps recording.
    for (const [label, over] of [
      ["a NaN reach denominator", { reachDenominator: "NaN" }],
      ["a NaN reach value", { reachValue: "NaN" }],
      [
        "a NaN conversion denominator",
        { conversionValue: "12", conversionDenominator: "NaN" },
      ],
      [
        "a NaN conversion value",
        { conversionValue: "NaN", conversionDenominator: "1000" },
      ],
      ["NaN on both halves of a pair", { reachValue: "NaN", reachDenominator: "NaN" }],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, over) as never),
        `${label} was accepted — a NaN figure produces a NaN per-1k, which then enters a median`
      ).rejects.toThrow();
    }
    // NON-VACUITY: the same rows with real figures land, so these five are the
    // NaN being refused rather than the fixture being unstorable.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, { conversionValue: "12", conversionDenominator: "1000" })
      )
    ).resolves.toBeDefined();
  });

  it("C2.4b: the OLD constraint's insufficiency is real — pinned, not assumed", async () => {
    // THE MIGRATION'S REASON, ASSERTED SO IT CANNOT QUIETLY STOP BEING TRUE.
    // 0031 exists because `results_denominators_positive` ADMITS NaN. If a
    // future Postgres made `NaN > 0` false, or made NaN sort as NULL, this case
    // goes red and the constraint's warrant is re-read rather than inherited.
    // Same shape as the refusal-copy pins: the WRONG behaviour is pinned, not
    // the right one.
    const [admitted] = (
      await db.execute(
        sql`select ('NaN'::numeric > 0) as gt_zero,
                   ('NaN'::numeric is null) as is_null,
                   ('NaN'::numeric = 'NaN'::numeric) as self_equal,
                   (42::numeric <> 'NaN'::numeric) as real_number_detected`
      )
    ).rows as unknown as {
      gt_zero: boolean;
      is_null: boolean;
      self_equal: boolean;
      real_number_detected: boolean;
    }[];
    // The hole: the old predicate's two escape routes both fail to catch NaN.
    expect(admitted.gt_zero, "`NaN > 0` no longer true — re-read 0031's reason").toBe(true);
    expect(admitted.is_null, "`NaN IS NULL` became true — re-read 0031's reason").toBe(false);
    // The trap in FIXING it: numeric NaN equals itself, so `x = x` detects
    // nothing and `<> 'NaN'` is what the constraint had to use.
    expect(admitted.self_equal, "numeric NaN stopped equalling itself").toBe(true);
    expect(admitted.real_number_detected).toBe(true);
  });

  it("C2.4b: INFINITY is refused by the COLUMN TYPE, not by a CHECK", async () => {
    // WHY 0031 CARRIES NO INFINITY CLAUSE: it could never fire. `numeric(24,8)`
    // refuses both signs with "numeric field overflow" before any constraint is
    // consulted. This case is what makes that a checked property rather than a
    // comment — removing the precision/scale from the columns reopens the hole
    // and turns this red.
    for (const [label, over] of [
      ["Infinity denominator", { reachDenominator: "Infinity" }],
      ["Infinity value", { reachValue: "Infinity" }],
      ["-Infinity value", { reachValue: "-Infinity" }],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, over) as never),
        `${label} was accepted`
      ).rejects.toThrow();
    }
  });

  // ------------------------------------------------- contract C2, invariant 5

  it("C2.5: the observation window must move forward", async () => {
    const at = new Date("2026-08-01T00:00:00Z");
    for (const [label, over] of [
      ["a zero-width window", { observedFrom: at, observedTo: at }],
      [
        "a reversed window",
        { observedFrom: at, observedTo: new Date("2026-07-31T00:00:00Z") },
      ],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, over) as never),
        `${label} was accepted — a ratio with no period is an undefined denominator`
      ).rejects.toThrow();
    }
    // NON-VACUITY: one millisecond of width is enough, so this is a strict
    // inequality rather than a minimum-duration rule nobody declared.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          observedFrom: at,
          observedTo: new Date(at.getTime() + 1),
        })
      )
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------- contract C2, invariant 6

  it("C2.6 (M15): `connector_verified` holds IFF all three connector columns do", async () => {
    // The state is UNREACHABLE IN V1 as a DATABASE property, not as a ban:
    // claiming it without provenance is refused...
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, { evidenceState: "connector_verified" }) as never
      ),
      "`connector_verified` was accepted with no connector provenance"
    ).rejects.toThrow();
    // ...and each PARTIAL provenance is refused too, so "two of three" cannot
    // buy the label.
    for (const [label, over] of [
      ["source only", { connectorSource: "youtube_analytics" }],
      [
        "source + event",
        { connectorSource: "youtube_analytics", connectorEventId: "evt_1" },
      ],
      [
        "source + observed_at",
        {
          connectorSource: "youtube_analytics",
          connectorObservedAt: new Date("2026-08-09T00:00:00Z"),
        },
      ],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(
          resultFor(pA1, wsA, {
            evidenceState: "connector_verified",
            ...over,
          }) as never
        ),
        `\`connector_verified\` was accepted with ${label}`
      ).rejects.toThrow();
    }
    // ...and the OTHER direction: provenance columns on a row that does not
    // claim the state are refused, so the three columns cannot be quietly
    // filled in on a self-reported row and then relabelled later.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          connectorSource: "youtube_analytics",
          connectorEventId: "evt_1",
          connectorObservedAt: new Date("2026-08-09T00:00:00Z"),
        }) as never
      ),
      "connector provenance was accepted on a `quantified_self_reported` row"
    ).rejects.toThrow();
    // NON-VACUITY, AND THE DECISION ITSELF: with all three, the state IS
    // storable. This is why contract C1 refuses a `CHECK evidence_state <>
    // 'connector_verified'` — that would need lifting by migration the day a
    // connector lands, and this equality opens exactly when there is evidence
    // to open it with. Nothing in v1 can produce this row: `recordResult` has
    // no parameter for any of the three columns, which
    // `results-schema-write.test.ts` drives with a cast.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          evidenceState: "connector_verified",
          connectorSource: "youtube_analytics",
          connectorEventId: "evt_1",
          connectorObservedAt: new Date("2026-08-09T00:00:00Z"),
        })
      )
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------------- the note predicate

  it("the note CHECK is `generation_feedback_note_says_something`, verbatim", async () => {
    for (const note of ["", " ", "\n", "\t\r\n "]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, { note }) as never),
        `a blank-but-present note (${JSON.stringify(note)}) was accepted`
      ).rejects.toThrow();
    }
    // NON-VACUITY: NULL is legal (the note is optional) and so is real text
    // with whitespace around it — the predicate is "says something", not
    // "is trimmed".
    await expect(
      db.insert(results).values(resultFor(pA1, wsA, { note: null }))
    ).resolves.toBeDefined();
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          note: "\n I posted this at a different time than usual \n",
          observedTo: new Date("2026-08-09T00:00:00Z"),
        })
      )
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------ the treatment-key equality

  it("the treatment key exists EXACTLY when a generation does (C4)", async () => {
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          generationId: generationA1,
          treatmentKey: null,
        }) as never
      ),
      "a generation-linked result with no treatment key was accepted"
    ).rejects.toThrow();
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          generationId: null,
          treatmentKey: "fabricated",
        }) as never
      ),
      "a result naming no generation was accepted WEARING a treatment key — 'do not fabricate a key' is the database's rule, not a habit"
    ).rejects.toThrow();
    // NON-VACUITY, BOTH LEGAL SHAPES: linked-with-a-key, and the R5 result
    // about a post this product did not write (no generation, no key, and
    // therefore baseline-eligible and cohort-ineligible by construction).
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          generationId: generationA1,
          treatmentKey: "fw-1@2|hookSet|snap|followers",
        })
      )
    ).resolves.toBeDefined();
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          generationId: null,
          treatmentKey: null,
          observedTo: new Date("2026-08-09T00:00:00Z"),
        })
      )
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------------- the confounder set

  it("the confounder codes are CLOSED at the database (R7)", async () => {
    for (const [label, confounders] of [
      ["an unknown code", ["seasonality"]],
      ["a known code beside an unknown one", ["topic_overlap", "seasonality"]],
      ["a number", [3]],
      // `<@` alone would accept the bare scalar, because a scalar IS contained
      // in an array that holds it. `jsonb_typeof(...) = 'array'` is the half
      // that refuses it, and this case is why that half exists.
      ["a bare scalar", "topic_overlap"],
      ["an object", { topic_overlap: true }],
    ] as [string, unknown][]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, { confounders }) as never),
        `${label} was accepted as a confounder`
      ).rejects.toThrow();
    }
    // NON-VACUITY: every code in the vocabulary lands, together, and so does
    // the default empty array. If the CHECK were built from a stale copy of the
    // list, this is what would go red.
    const [all] = await db
      .insert(results)
      .values(
        resultFor(pA1, wsA, { confounders: [...RESULT_CONFOUNDER_CODES] })
      )
      .returning();
    expect(all.confounders).toEqual([...RESULT_CONFOUNDER_CODES]);
    // THE CLOSED SET SURVIVES INTO THE ROW TYPE ($type<ResultConfounderCode[]>).
    // Builder B measured its absence: a bare `jsonb()` reads back as
    // `unknown`, so the comparison builder could not accept a `ResultRow`
    // without widening its input to a vocabulary nobody owns. Asserted at BOTH
    // levels, because either alone is the half that fails - the assignment is
    // the compile-level half...
    const typed: ResultConfounderCode[] = all.confounders;
    // @ts-expect-error a code outside the vocabulary is not assignable
    const rejected: ResultConfounderCode[] = [...typed, "seasonality"];
    expect(rejected.length).toBe(typed.length + 1);
    // ...and this is the runtime half: the type is a promise the DATABASE
    // keeps (`results_confounders_closed_set`), not one the annotation keeps,
    // so what was actually stored is checked against the vocabulary too.
    for (const code of all.confounders) {
      expect(RESULT_CONFOUNDER_CODES).toContain(code);
    }
    const [none] = await db
      .insert(results)
      .values(
        resultFor(pA1, wsA, { observedTo: new Date("2026-08-09T00:00:00Z") })
      )
      .returning();
    expect(none.confounders, "the default is an empty array, not NULL").toEqual([]);
  });

  // ---------------------------------------------------------- the three FKs

  it("R5/C3: the composite FKs refuse a cross-parented row, in BOTH directions", async () => {
    await expect(
      db.insert(results).values(resultFor(pA1, wsB, {}) as never),
      "pA1 with workspace B was accepted"
    ).rejects.toThrow();
    await expect(
      db.insert(results).values(
        resultFor(pB, wsA, { metricDeclaredByDocId: docB }) as never
      ),
      "pB with workspace A was accepted"
    ).rejects.toThrow();
  });

  it("C3: the declared-metric pointer cannot name ANOTHER profile's brain document", async () => {
    // The property the `brain_docs_id_profile_workspace_uq` added by migration
    // 0029 exists to buy. A bare FK to `id` alone would accept both of these —
    // "worse than none, because it would look like tenancy".
    for (const [label, docId] of [
      ["a SIBLING profile's document, same workspace", docA2],
      ["another workspace's document", docB],
    ] as [string, string][]) {
      await expect(
        db
          .insert(results)
          .values(resultFor(pA1, wsA, { metricDeclaredByDocId: docId }) as never),
        `${label} was accepted as this result's declared metric`
      ).rejects.toThrow();
    }
    // ...and a document that does not exist at all.
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          metricDeclaredByDocId: "00000000-0000-4000-8000-000000000000",
        }) as never
      )
    ).rejects.toThrow();
    // NON-VACUITY: this profile's own document lands.
    await expect(
      db.insert(results).values(resultFor(pA1, wsA, {}))
    ).resolves.toBeDefined();
  });

  it("R5: the generation pointer cannot name ANOTHER profile's output", async () => {
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          generationId: generationA2,
          treatmentKey: "k",
        }) as never
      ),
      "a sibling profile's generation was accepted as this result's subject"
    ).rejects.toThrow();
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, {
          generationId: "00000000-0000-4000-8000-000000000000",
          treatmentKey: "k",
        }) as never
      )
    ).rejects.toThrow();
    await expect(
      db.insert(results).values(
        resultFor(pA1, wsA, { generationId: generationA1, treatmentKey: "k" })
      )
    ).resolves.toBeDefined();
  });

  it("R5: both scope columns are NOT NULL — a NULL half cannot be smuggled in", async () => {
    // `as unknown as` rather than only a type error: proving a column cannot be
    // TYPED null is not proving it cannot be CAST null (CLAUDE.md 2026-08-21),
    // and a nullable half is precisely what makes MATCH SIMPLE skip the whole
    // composite FK.
    for (const [label, over] of [
      ["null workspace", { workspaceId: null as unknown as string }],
      ["null profile", { profileId: null as unknown as string }],
    ] as [string, Record<string, unknown>][]) {
      await expect(
        db.insert(results).values(resultFor(pA1, wsA, over) as never),
        `${label} was accepted`
      ).rejects.toThrow();
    }
  });

  // --------------------------------------------------------- the duplicate bar

  it("one observation per (output, metric, class, window) — three submits are not a cohort", async () => {
    const row = resultFor(pA1, wsA, {
      generationId: generationA1,
      treatmentKey: "fw-1@2|hookSet|snap|followers",
    });
    await db.insert(results).values(row);
    await expect(
      db.insert(results).values(row as never),
      "the same observation was logged twice — a cohort minimum reached by pressing submit three times is a rule warranted by one post"
    ).rejects.toThrow();
    // WHAT IT STILL PERMITS, each asserted rather than assumed: a different
    // window (day 1 and day 7 are two observations), a DIFFERENT PLATFORM (one
    // draft posted to two places is two results — migration 0032; before it
    // this was refused and the refusal told the creator to falsify their
    // window, on an append-only table), a different audience class (paid and
    // organic are never pooled, so they are separate rows), and any number of
    // results naming NO generation — which have no identity to be a duplicate
    // of, and which the PARTIAL index therefore does not touch.
    await expect(
      db.insert(results).values({
        ...row,
        observedTo: new Date("2026-08-15T00:00:00Z"),
      })
    ).resolves.toBeDefined();
    await expect(
      db.insert(results).values({ ...row, audienceClass: "paid" })
    ).resolves.toBeDefined();
    // THE 0032 CASE: the same post, the same window, the same class, a second
    // platform. This was REFUSED before the index carried `platform`, and the
    // refusal's remedy would have had the creator invent a window.
    await expect(
      db.insert(results).values({ ...row, platform: "reels" }),
      "a second platform was refused as a duplicate — 0032's defect is back"
    ).resolves.toBeDefined();
    const unlinked = resultFor(pA1, wsA, {
      generationId: null,
      treatmentKey: null,
    });
    await db.insert(results).values(unlinked);
    await expect(
      db.insert(results).values(unlinked)
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------------------ the cascades

  it("REQ-A04: a result leaves with its profile, and with its generation", async () => {
    await db.insert(results).values(
      resultFor(pA1, wsA, {
        generationId: generationA1,
        treatmentKey: "fw-1@2|hookSet|snap|followers",
      })
    );
    await db.insert(results).values(
      resultFor(pA2, wsA, { generationId: null, treatmentKey: null })
    );
    expect((await db.select().from(results)).length).toBe(2);

    // Deleting the GENERATION takes the result about it: a number with no post
    // to be about is an observation nobody could interpret.
    await db.delete(generations).where(eq(generations.id, generationA1));
    expect((await db.select().from(results)).map((r) => r.profileId)).toEqual([
      pA2,
    ]);
    // ...and deleting the profile takes the rest.
    await db.delete(creatorProfiles).where(eq(creatorProfiles.id, pA2));
    expect(await db.select().from(results)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C4 — the treatment key. A pure function, so these need no database.
// ---------------------------------------------------------------------------

describe("treatmentKeyFor (contract C4)", () => {
  const generation = {
    mode: "hookSet",
    frameworkVersions: [{ id: "fw-b", version: 2 }],
    brainActivationId: "snap-1",
  };

  it("emits all four positions, in the fixed order", () => {
    expect(treatmentKeyFor({ generation, metricKey: "followers" })).toBe(
      "fw-b@2|hookSet|snap-1|followers"
    );
  });

  it("is STABLE under framework ORDER — the offer order is not the treatment", () => {
    const a = treatmentKeyFor({
      generation: {
        ...generation,
        frameworkVersions: [
          { id: "fw-b", version: 2 },
          { id: "fw-a", version: 1 },
        ],
      },
      metricKey: "followers",
    });
    const b = treatmentKeyFor({
      generation: {
        ...generation,
        frameworkVersions: [
          { id: "fw-a", version: 1 },
          { id: "fw-b", version: 2 },
        ],
      },
      metricKey: "followers",
    });
    expect(a).toBe(b);
    expect(a).toBe("fw-a@1+fw-b@2|hookSet|snap-1|followers");
  });

  it("a DIFFERENT framework version is a different treatment", () => {
    expect(
      treatmentKeyFor({
        generation: { ...generation, frameworkVersions: [{ id: "fw-b", version: 3 }] },
        metricKey: "followers",
      })
    ).not.toBe(treatmentKeyFor({ generation, metricKey: "followers" }));
  });

  it("`[]` frameworks leaves the position EMPTY rather than omitting it", () => {
    // Omission would make the key positionally ambiguous — see the function's
    // docblock. The leading separator is the cost of that decision, and it is
    // pinned here so the spelling cannot drift.
    expect(
      treatmentKeyFor({
        generation: { ...generation, frameworkVersions: [] },
        metricKey: "followers",
      })
    ).toBe("|hookSet|snap-1|followers");
  });

  it("REFUSES rather than guesses — blank parts, a smuggled separator, an unreadable array", () => {
    const cases: [string, () => string][] = [
      ["a blank mode", () => treatmentKeyFor({ generation: { ...generation, mode: "  " }, metricKey: "followers" })],
      ["a blank metric key", () => treatmentKeyFor({ generation, metricKey: "" })],
      [
        "a metric key carrying the separator",
        () => treatmentKeyFor({ generation, metricKey: "follow|ers" }),
      ],
      [
        "a mode carrying the separator",
        () => treatmentKeyFor({ generation: { ...generation, mode: "hook|Set" }, metricKey: "f" }),
      ],
      [
        "framework versions that are not an array",
        () =>
          treatmentKeyFor({
            generation: {
              ...generation,
              frameworkVersions: { id: "fw", version: 1 } as unknown as unknown[],
            },
            metricKey: "followers",
          }),
      ],
      [
        "a framework entry with no integer version",
        () =>
          treatmentKeyFor({
            generation: {
              ...generation,
              frameworkVersions: [{ id: "fw", version: "2" }],
            },
            metricKey: "followers",
          }),
      ],
      [
        "a framework entry with a non-text id",
        () =>
          treatmentKeyFor({
            generation: {
              ...generation,
              frameworkVersions: [{ id: 7, version: 2 }],
            },
            metricKey: "followers",
          }),
      ],
    ];
    for (const [label, run] of cases) {
      expect(run, `${label} produced a key instead of refusing`).toThrow(
        TreatmentKeyError
      );
    }
  });

  it("normalises to NFC, so two keys a person cannot tell apart are one key", () => {
    // WRITTEN AS ESCAPES, NOT AS TWO LITERALS THAT LOOK DIFFERENT: an editor,
    // a formatter or a git filter can normalise a source file, and two
    // literals meant to differ only by encoding would then be the same bytes —
    // a case that passes while asserting nothing. The inequality below is the
    // guard against exactly that.
    const composed = "café_views";
    const decomposed = "café_views";
    expect(composed, "the fixture is vacuous - these are the same string").not.toBe(
      decomposed
    );
    expect(treatmentKeyFor({ generation, metricKey: composed })).toBe(
      treatmentKeyFor({ generation, metricKey: decomposed })
    );
    // ...and the trim is real too: leading or trailing space is not a treatment.
    expect(treatmentKeyFor({ generation, metricKey: "  followers " })).toBe(
      treatmentKeyFor({ generation, metricKey: "followers" })
    );
  });
});

// ---------------------------------------------------------------------------
// C3 — reading the declared metric off a strategy version.
// ---------------------------------------------------------------------------

describe("declaredMetricOf (contract C3)", () => {
  // A STORED metric, shaped like one the product actually writes: NO `key`.
  // `metric.key` is `serverOwned`, `parseBrainContent` strips it in the single
  // funnel and `writeBrainDoc` stores the stripped output, so no document any
  // product path has written has ever carried one. The fixture used to carry a
  // key, which is how this suite agreed with data the producer cannot produce.
  const metric = {
    label: "New followers",
    unit: "followers per 1k views",
    direction: "higher_is_better",
  };

  it("DERIVES the key from the label, and returns the unit and direction", () => {
    expect(declaredMetricOf({ metric })).toEqual({
      key: "new-followers",
      label: "New followers",
      unit: "followers per 1k views",
      direction: "higher_is_better",
    });
  });

  it("THE PREMISE, ASSERTED: `parseBrainContent` really does strip `metric.key`", () => {
    // This case is what turned the slice-9a BLOCK from an argument into a
    // fact, and it is kept because the derivation above depends on it: if
    // `metric.key` ever STOPPED being stripped, a stored key would exist and
    // "derive, never read" would be a choice worth re-examining rather than
    // the only option.
    const parsed = parseBrainContent("strategy", {
      audience: "creators",
      positioning: "p",
      pillars: [],
      metric: { ...metric, key: "smuggled" },
    }) as { metric?: Record<string, unknown> };
    expect(parsed.metric, "the fixture did not parse into a metric").toBeDefined();
    expect(
      "key" in (parsed.metric ?? {}),
      "`parseBrainContent` no longer strips `metric.key` — re-read declaredMetricOf's derivation"
    ).toBe(false);
  });

  it("IGNORES a stored key even when one is present — one source, not two", () => {
    // THE CORRECTED INFERENCE. This case used to read "RETURNS THE KEY — which
    // is why it does not go through `parseBrainContent`", and that conclusion
    // was exactly backwards: the strip had ALREADY run on the write, so
    // reading the stored position returned `undefined` for every creator and
    // made the whole slice unreachable. Reading storage was never the fix;
    // deriving is.
    //
    // A hand-built row CAN still carry a key (a fixture, a legacy insert, a
    // psql session). Preferring it would be a second answer to "what is this
    // metric's identity", and the second answer is the one that does not exist
    // in production — so it is ignored, and this case is what says so.
    expect(declaredMetricOf({ metric: { ...metric, key: "followers" } })?.key).toBe(
      "new-followers"
    );
  });

  it("is NULL for every absence, so the caller refuses instead of guessing", () => {
    for (const [label, content] of [
      ["no content", null],
      ["content that is not an object", "followers"],
      ["no metric at all", {}],
      // THE IDENTITY'S SOURCE IS THE LABEL, so an undecided or blank label is
      // what "no identity yet" now looks like. (The `key: "unset"` case that
      // stood here can no longer occur: nothing reads a stored key.)
      ["a [check] label", { metric: { ...metric, label: CHECK } }],
      ["a blank label", { metric: { ...metric, label: "   " } }],
      ["a non-text label", { metric: { ...metric, label: 3 } }],
      ["a [check] unit", { metric: { ...metric, unit: CHECK } }],
      ["a blank unit", { metric: { ...metric, unit: "" } }],
      ["a [check] direction", { metric: { ...metric, direction: CHECK } }],
      ["a direction outside the closed set", { metric: { ...metric, direction: "up" } }],
      ["a non-text unit", { metric: { ...metric, unit: 3 } }],
    ] as [string, unknown][]) {
      expect(declaredMetricOf(content), label).toBeNull();
    }
  });
});

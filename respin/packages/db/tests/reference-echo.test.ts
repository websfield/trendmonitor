// R-30.10 / task 42 (slice 4): `REFERENCE_BARRED_KINDS` widened from `{voice}`
// to `{voice, killtest, performance_meta}` — a `reference` input may not be
// the provenance of any of the three. `strategy` stays EXEMPT (REQ-D04, R-9):
// learning a mechanism from someone else's post is what the shared library is
// for, and the operative control on that span is `REFERENCE_QUOTE_MAX_CHARS`
// in echo.ts, not this provenance bar.
//
// Slice 9b made `performance_meta` writable. Its witness below therefore drives
// the live write path and must reach this provenance bar; an earlier
// not-yet-writable refusal would no longer prove the reference boundary.
import { beforeEach, describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { creatorProfiles } from "../src/brain-schema";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type ProfileWriteCapabilities,
} from "../src/with-workspace";
import { ProvenanceError, ReferenceEchoError } from "../src/errors";
import { assertNoReferenceEcho } from "../src/echo";
import type { BrainDocReason } from "../src/brain-reason";
import { CHECK } from "../src/brain-content";
import { brainDocs } from "../src/brain-schema";
import { eq } from "drizzle-orm";

const REASON: BrainDocReason = { code: "onboarding_inference" };

describe("R-30.10 / task 42 — REFERENCE_BARRED_KINDS widened", () => {
  let db: TestDb;
  let profileId: string;
  let caps: ProfileWriteCapabilities;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "ref_echo_user");
    const workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "ref_echo_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "A" })
      .returning();
    profileId = p.id;
    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "ref_echo_user" }),
      profileId
    );
    caps = writeCapabilities(scope);
  });

  const REFERENCE_TEXT =
    "Someone else's post, kept only to learn a mechanism from it.";
  const QUOTE = "learn a mechanism";
  const QUOTE_START = REFERENCE_TEXT.indexOf(QUOTE);
  const QUOTE_END = QUOTE_START + QUOTE.length;

  const seedReferenceInput = async () =>
    caps.appendOnboardingInput({
      inputClass: "reference",
      content: REFERENCE_TEXT,
    });

  it("the hard echo refusal carries the matched field, reference and span as structured in-process data", () => {
    const reference = {
      id: "00000000-0000-7000-8000-000000000099",
      content:
        "build the tension slowly then reveal the useful answer at the end",
    };
    let raised: ReferenceEchoError | null = null;
    try {
      assertNoReferenceEcho(
        { register: "Build the tension slowly, then reveal the useful answer." },
        [reference]
      );
    } catch (error) {
      if (error instanceof ReferenceEchoError) raised = error;
      else throw error;
    }

    expect(raised).not.toBeNull();
    expect(raised?.match).toEqual({
      pointer: "/register",
      inputId: reference.id,
      span: "build the tension slowly then reveal the useful",
    });
  });

  it("voice: a reference input cannot be provenance (already worked pre-slice-4)", async () => {
    const ref = await seedReferenceInput();
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "voice",
            content: {
              register: "deadpan",
              sentenceRhythm: "short",
              signatureMoves: [],
              avoid: [],
            },
            sourceEvidence: [
              {
                field: "/register",
                quote: QUOTE,
                inputId: ref.id,
                startUtf16: QUOTE_START,
                endUtf16: QUOTE_END,
              },
            ],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(/cannot be provenance for a 'voice'/);
  });

  it("killtest: a reference input cannot be provenance — NEW in this slice, not just the one that already worked", async () => {
    const ref = await seedReferenceInput();
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "killtest",
            content: { rules: [QUOTE] },
            sourceEvidence: [
              {
                field: "/rules/0",
                quote: QUOTE,
                inputId: ref.id,
                startUtf16: QUOTE_START,
                endUtf16: QUOTE_END,
              },
            ],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(/cannot be provenance for a 'killtest'/);
  });

  it("performance_meta: the live 9b writer refuses reference provenance and stores no version", async () => {
    const ref = await seedReferenceInput();
    const before = await db.select().from(brainDocs).where(eq(brainDocs.profileId, profileId));
    const err = await db
      .transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "performance_meta",
            content: {
              rules: [{
                metricLabel: "Followers",
                metricKey: "followers",
                metricUnit: "followers per 1k views",
                metricDirection: "higher_is_better",
                lever: "reach",
                platform: "shorts",
                audienceClass: "organic",
                observedFrom: "2026-08-01T00:00:00.000Z",
                observedTo: "2026-08-31T00:00:00.000Z",
                treatmentN: 3,
                baselineN: 3,
                treatmentMedianPer1k: 2,
                baselineMedianPer1k: 1,
                effectPer1k: 1,
                pastOutcome: "better",
                evidenceStrength: "early",
                selfReportedN: 6,
                connectorVerifiedN: 0,
                confounders: [],
              }],
            },
            sourceEvidence: [
              {
                field: "/rules/0/metricLabel",
                quote: QUOTE,
                inputId: ref.id,
                startUtf16: QUOTE_START,
                endUtf16: QUOTE_END,
              },
            ],
            reason: REASON,
          },
          tx
        )
      )
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(ProvenanceError);
    if (!(err instanceof ProvenanceError)) throw err;
    expect(err.message).toContain(
      "a 'reference' input cannot be provenance for a 'performance_meta' brain document"
    );
    expect(await db.select().from(brainDocs).where(eq(brainDocs.profileId, profileId))).toEqual(before);
  });

  it("strategy stays EXEMPT: a reference input MAY be cited as strategy provenance (REQ-D04, R-9)", async () => {
    const ref = await seedReferenceInput();
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content: {
            audience: CHECK,
            positioning: QUOTE,
            pillars: [CHECK],
          },
          sourceEvidence: [
            {
              field: "/positioning",
              quote: QUOTE,
              inputId: ref.id,
              startUtf16: QUOTE_START,
              endUtf16: QUOTE_END,
            },
          ],
          reason: REASON,
        },
        tx
      )
    );
    expect(doc.status).toBe("proposed");
  });

  it("the refusal for a barred kind is `ProvenanceError`, matching the pre-existing voice case", async () => {
    const ref = await seedReferenceInput();
    const err = await db
      .transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "killtest",
            content: { rules: [QUOTE] },
            sourceEvidence: [
              {
                field: "/rules/0",
                quote: QUOTE,
                inputId: ref.id,
                startUtf16: QUOTE_START,
                endUtf16: QUOTE_END,
              },
            ],
            reason: REASON,
          },
          tx
        )
      )
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(ProvenanceError);
  });
});

describe("G-16: a stored inverted range does not brick the profile", () => {
  let db: TestDb;
  let profileId: string;
  let caps: ProfileWriteCapabilities;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "g16_user");
    const workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "g16_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "A" })
      .returning();
    profileId = p.id;
    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "g16_user" }),
      profileId
    );
    caps = writeCapabilities(scope);
  });

  it("retainedReferenceSpans SKIPS a stored inverted/negative range; a NEW write with a valid range still succeeds", async () => {
    // A row like this cannot be produced through the validated write path —
    // `assertUsableSpan` refuses an inverted range on a NEW span — so it is
    // planted directly, the shape a corrupted or hand-edited row would take.
    const ownText = "I always open on the beat, never on the setup";
    const ownQuote = "I always open on the beat";
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: ownText,
    });
    const ref = await caps.appendOnboardingInput({
      inputClass: "reference",
      content: "y".repeat(50),
    });
    const first = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content: { audience: CHECK, positioning: "y".repeat(50), pillars: [CHECK] },
          sourceEvidence: [
            {
              field: "/positioning",
              quote: "y".repeat(50),
              inputId: ref.id,
              startUtf16: 0,
              endUtf16: 50,
            },
          ],
          reason: REASON,
        },
        tx
      )
    );
    // PLANT the malformed row: an inverted range on the FIRST version's
    // source_evidence, bypassing every write-time guard.
    await db
      .update(brainDocs)
      .set({
        sourceEvidence: [
          {
            field: "/positioning",
            quote: "",
            inputId: ref.id,
            startUtf16: 40,
            endUtf16: 0, // inverted
          },
        ],
      })
      .where(eq(brainDocs.id, first.id));

    // A SECOND write, citing an ORDINARY own-post quote, must NOT be bricked
    // by the malformed row sitting in the profile's retained history.
    const second = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "killtest",
          content: { rules: [ownQuote] },
          sourceEvidence: [
            {
              field: "/rules/0",
              quote: ownQuote,
              inputId: own.id,
              startUtf16: 0,
              endUtf16: ownQuote.length,
            },
          ],
          reason: REASON,
        },
        tx
      )
    );
    expect(second.status).toBe("proposed");
  });
});

describe("task 12 — normaliseContent byte-identical regression pin (G-11 Layer A's precondition)", () => {
  // `normaliseContent` is module-private in with-workspace.ts, so this drives
  // it through the ONE public path that calls it — `appendOnboardingInput` —
  // and pins EXACT expected bytes rather than re-deriving "NFC + CRLF->LF"
  // from the same formula the function itself uses. G-11 Layer A's digest
  // (`referenceBudgetKey`) is keyed on a DERIVATIVE of this stored value, so a
  // silent change to normalisation here would silently change every echo
  // budget key it feeds — this is the regression pin the phase card names.
  let db: TestDb;
  let profileId: string;
  let caps: ProfileWriteCapabilities;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "norm_user");
    const workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "norm_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "A" })
      .returning();
    profileId = p.id;
    const scope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "norm_user" }),
      profileId
    );
    caps = writeCapabilities(scope);
  });

  it.each([
    // [label, raw input, exact expected stored bytes]
    ["CRLF -> LF", "line one\r\nline two", "line one\nline two"],
    ["lone CR is left alone (only \\r\\n is folded)", "a\rb", "a\rb"],
    [
      "NFC composes a decomposed accent",
      "café", // e + COMBINING ACUTE ACCENT
      "café", // precomposed é
    ],
    [
      "an already-precomposed character is unchanged",
      "café",
      "café",
    ],
    // Full-width forms are NOT folded by NFC (that's NFKC, which
    // `normaliseContent` deliberately does not use — only `echoComparisonForm`
    // does, and only for comparison, never for the stored value).
    ["full-width is NOT folded by NFC (unlike echoComparisonForm's NFKC)", "Ａ", "Ａ"],
  ])("%s", async (_label, raw, expected) => {
    const row = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: raw,
    });
    expect(row.content).toBe(expected);
  });
});

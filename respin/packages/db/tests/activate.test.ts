// Confirmation and activation, and the ONE reference corpus both R-3 bars take
// (C-29, closing register item A-3).
//
// THE DEFECT THIS SUITE EXISTS TO KEEP CLOSED. The echo bar has to run twice —
// once when a version is written, once when it is activated — because content
// can be activated long after it was written. Rebuild the corpus at activation
// and the second run asks a DIFFERENT question from the first: a `reference`
// input appended in between makes activation refuse a version the write had
// already cleared. `onboarding_inputs` is immutable with no delete path and
// brain versions are append-only, so that refusal is PERMANENT, and the only
// remedy is a rebuild the creator PAYS for. A compliance bar that becomes an
// unclearable refusal on the money path is not a bar, it is an outage.
//
// The fix is not a tighter timestamp — `created_at` is `defaultNow()`, i.e.
// TRANSACTION START time, so an input whose transaction starts before the write
// and commits after it is invisible to the write AND inside any
// timestamp-bounded corpus rebuilt later. The fix is that the write RECORDS the
// id set it was judged against and activation RE-READS that set. The
// commit-order half needs true concurrency and lives in
// `activate.docker.test.ts`; everything expressible on one connection is here.
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import { memberships } from "../src/schema";
import { pausePeriods } from "../src/billing-schema";
import {
  BrainRoleError,
  ProfileAccessError,
  ProvenanceError,
  ReferenceEchoError,
  WorkspacePausedError,
} from "../src/errors";
import {
  ProfileScope,
  withWorkspace,
  writeCapabilities,
  type ProfileWriteCapabilities,
} from "../src/with-workspace";
import type { BrainDocReason } from "../src/brain-reason";
import {
  CHECK,
  enumerateClaimFields,
  readPointer,
} from "../src/brain-content";

const REASON: BrainDocReason = { code: "onboarding_inference" };

// `positioning` is LONG ON PURPOSE. The echo bar needs at least
// ECHO_MIN_SEGMENTS (8) word-like segments before it will call a span an echo,
// so a short fixture makes every test in this file pass whether the bar runs or
// not — which is precisely the vacuity the AC-62 pair exists to rule out. The
// first draft of this suite used a five-word string and its non-vacuity test
// caught it.
const STRATEGY = {
  // `/audience` and `/pillars/0` are `[check]` because C-28 requires every
  // declared position to be cited or visibly unknown, and this fixture cites
  // exactly one. `/positioning` is long on purpose: the echo bar needs at least
  // ECHO_MIN_SEGMENTS (8) word-like segments, so a short fixture would make the
  // AC-62 pair pass whether the bar runs or not.
  audience: CHECK,
  positioning:
    "the practitioner who shows the work rather than the guru who sells the outcome",
  pillars: [CHECK],
};

/**
 * Confirm EVERY declared position, with the placeholder flag matching what the
 * value actually is.
 *
 * The suite used to pass `confirmedFields: confirmAll(STRATEGY)` everywhere, which is precisely
 * why nothing could see that activation never checked coverage. Building the
 * list from the content is the shape a real confirmation UI would submit.
 */
const confirmAll = (content: unknown) =>
  enumerateClaimFields("strategy", content).map((pointer) => ({
    pointer,
    asPlaceholder: readPointer(content, pointer) === CHECK,
  }));

describe("confirm → activate, and the recorded reference corpus (C-29)", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "act_user");
    await seedAuthUser(db, "act_user2", "act_user2@test.dev");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "act_user", name: "A" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "A" })
      .returning();
    profileId = p.id;
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "act_user" }),
      profileId
    );

  /** One own_post input, and the evidence entry citing it. */
  const seedOwnEvidence = async (caps: ProfileWriteCapabilities) => {
    const text = "I always open on the beat, never on the setup";
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: text,
    });
    return [
      {
        field: "/positioning",
        quote: text.slice(0, 12),
        inputId: own.id,
        startUtf16: 0,
        endUtf16: 12,
      },
    ];
  };

  const writeDoc = async (caps: ProfileWriteCapabilities) => {
    const evidence = await seedOwnEvidence(caps);
    return db.transaction((tx) =>
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
  };

  // ------------------------------------------------------------- the column

  it("A-3: the write RECORDS the corpus id set on the row", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const ref = await caps.appendOnboardingInput({
      inputClass: "reference",
      content: "somebody else wrote this whole sentence right here",
    });
    const doc = await writeDoc(caps);
    // The column exists, is populated by the server, and names the corpus that
    // was actually in force. Before migration 0012 there was no column at all,
    // so this assertion could not be written — which is what made AC-62/AC-63
    // "unimplementable as written".
    expect(doc.referenceCorpusIds).toEqual([ref.id]);
  });

  it("A-3: an empty corpus is RECORDED as empty, not as absent", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    // "This profile genuinely has no reference inputs" and "nobody built a
    // corpus" have to be different values — `assertNoReferenceEcho` refuses the
    // second outright, so recording `[]` is what says the first.
    expect(doc.referenceCorpusIds).toEqual([]);
  });

  it("A-3: the corpus id set is SERVER-DERIVED — a cast-in value is stripped", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const ref = await caps.appendOnboardingInput({
      inputClass: "reference",
      content: "somebody else wrote this whole sentence right here",
    });
    const evidence = await seedOwnEvidence(caps);
    // The smuggle goes through `as unknown as`, not `@ts-expect-error`: proving
    // a field cannot be TYPED is not proving it cannot be CAST (2026-08-21).
    // An empty set here would turn the R-3 bar off for this version.
    const smuggled = {
      kind: "strategy",
      content: STRATEGY,
      sourceEvidence: evidence,
      reason: REASON,
      referenceCorpusIds: [],
    } as unknown as Parameters<ProfileWriteCapabilities["writeBrainDoc"]>[0];
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(smuggled, tx)
    );
    expect(
      doc.referenceCorpusIds,
      "a caller-supplied corpus set reached the row — the R-3 bar is caller-controlled"
    ).toEqual([ref.id]);
  });

  it("an EMPTY evidence list is refused BY NAME, not by a raw constraint violation", async () => {
    // Migration 0012's non-empty CHECK is the backstop; this is the refusal a
    // person reads. Without it the creator sees `violates check constraint
    // "brain_docs_source_evidence_non_empty"`, which names no action they can
    // take — the 2026-07-30 lesson is that a control whose printed remedy is
    // not something the reader may do is the outage.
    //
    // It is also where the C-28 interaction surfaces: an ALL-PLACEHOLDER
    // version cites nothing and lands here, deliberately.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const err = await db
      .transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY,
            sourceEvidence: [],
            reason: REASON,
          },
          tx
        )
      )
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(ProvenanceError);
    expect((err as Error).message).toMatch(/at least one onboarding input/);
    expect(
      (err as Error).message,
      "the raw constraint name reached the caller"
    ).not.toMatch(/check constraint/i);
  });

  // ------------------------------- what the four Critical-Path gates found

  it("C-28: a claim stated as fact with nothing cited for it is REFUSED", async () => {
    // THE COMPLIANCE + LEARNING BLOCK. C-28 was recorded as closed in three
    // documents while its task was TODO, and this exact document — the
    // reviewers' own fixture — stored, confirmed and ACTIVATED with none of its
    // three claim positions cited by anything.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const evidence = await seedOwnEvidence(caps);
    const err = await db
      .transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: {
              audience: "devout Catholic mothers in Leeds, 42000 followers",
              positioning: STRATEGY.positioning,
              pillars: ["teardowns"],
            },
            // Cites `/positioning` only; `/audience` and `/pillars/0` are
            // stated as fact with nothing behind them.
            sourceEvidence: evidence,
            reason: REASON,
          },
          tx
        )
      )
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(ProvenanceError);
    expect((err as Error).message).toContain("/audience");
    expect((err as Error).message).toContain("/pillars/0");
    // ...and the same document with those positions marked unknown DOES write.
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY,
            sourceEvidence: evidence,
            reason: REASON,
          },
          tx
        )
      )
    ).resolves.toBeDefined();
  });

  it("C-28: an evidence entry pointing at a position the document does not declare is REFUSED", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const evidence = await seedOwnEvidence(caps);
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY,
            sourceEvidence: [{ ...evidence[0], field: "/not/a/position" }],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(/does not declare/);
  });

  it("G-10: an evidence entry citing a `[check]` position is REFUSED — the THIRD C-28 direction (R7)", async () => {
    // The two directions above are declared<=>cited (an entry must name a
    // real position) and stated=>cited (a stated claim must be cited). Neither
    // ever checked cited=>stated: an entry could point at `/audience`, which
    // STRATEGY leaves as `[check]`, and store an unbounded quote as "evidence"
    // for a claim the document never actually makes.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const evidence = await seedOwnEvidence(caps);
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY, // /audience is CHECK
            sourceEvidence: [
              ...evidence,
              { ...evidence[0], field: "/audience" },
            ],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(/holds '\[check\]'/);
  });

  it("G-10/R8: the bijection holds in BOTH directions at once (stated<=>cited)", async () => {
    // A single test asserting both, so a future widening cannot quietly
    // re-open one side while the other stays green (R8's exact wording).
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const evidence = await seedOwnEvidence(caps);
    // stated => cited: a stated position with nothing cited for it refuses
    // (already covered above by the first C-28 test) — re-asserted here
    // alongside its sibling so both directions live in one place.
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: { ...STRATEGY, audience: "a stated but uncited claim" },
            sourceEvidence: evidence,
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toBeInstanceOf(ProvenanceError);
    // cited => stated: a cited `[check]` position refuses (G-10).
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY,
            sourceEvidence: [...evidence, { ...evidence[0], field: "/audience" }],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(/holds '\[check\]'/);
    // ...and a document where every stated position is cited, and nothing
    // cites a [check], still writes.
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          { kind: "strategy", content: STRATEGY, sourceEvidence: evidence, reason: REASON },
          tx
        )
      )
    ).resolves.toBeDefined();
  });

  it("the evidence key space is CLOSED — a smuggled key is refused, not stored", async () => {
    // The tenancy gate stored `{"smuggled":"her home address is 12 Acacia Ave"}`
    // on the export-included provenance column, because the entry went to jsonb
    // verbatim and only four of its keys were ever looked at.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const evidence = await seedOwnEvidence(caps);
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY,
            sourceEvidence: [
              {
                ...evidence[0],
                smuggled: "her home address is 12 Acacia Ave",
              } as unknown as (typeof evidence)[0],
            ],
            reason: REASON,
          },
          tx
        )
      )
    ).rejects.toThrow(/not the shape provenance takes/);
  });

  it("a GETTER on an evidence entry cannot swap the quote after it is validated", async () => {
    // THE COMPLIANCE BLOCK. Reading `doc.sourceEvidence` once guards the ARRAY,
    // not its ELEMENTS: drizzle's serialiser re-reads every property when it
    // stringifies, so an entry validated as a 10-character quote stored a
    // 900-character one and left a recorded range that under-counts it forever.
    // Measured read counts on one write were quote x3, startUtf16 x6.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const text = "I always open on the beat, never on the setup";
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: text,
    });
    let reads = 0;
    const entry = {
      field: "/positioning",
      inputId: own.id,
      startUtf16: 0,
      endUtf16: 8,
      get quote() {
        reads += 1;
        // Verbatim on the first read (so validation passes), longer after.
        return reads === 1 ? text.slice(0, 8) : text;
      },
    };
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content: STRATEGY,
          sourceEvidence: [entry as unknown as { field: string; quote: string; inputId: string; startUtf16: number; endUtf16: number }],
          reason: REASON,
        },
        tx
      )
    );
    const stored = doc.sourceEvidence as { quote: string }[];
    expect(
      stored[0].quote,
      "a later read of the getter reached the stored row"
    ).toBe(text.slice(0, 8));
    expect(stored[0].quote.length).toBe(8);
  });

  it("the reason's numerator counts DISTINCT inputs, not evidence entries", async () => {
    // A LEARNING MUTATION SURVIVOR (their MUT1). `citedInputCount:
    // clean.length` instead of the distinct-`inputId` count survived every
    // suite — and it is the number the creator READS, in the sentence that
    // says where their brain came from. `brain-reason.test.ts` injects `facts`
    // directly, so it can never see how the numerator is derived; this drives
    // it through `writeBrainDoc`.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const text = "I always open on the beat, never on the setup";
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: text,
    });
    // TWO entries, ONE input — the case that discriminates.
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content: {
            audience: "solo founders",
            positioning: STRATEGY.positioning,
            pillars: [CHECK],
          },
          sourceEvidence: [
            { field: "/audience", quote: text.slice(0, 8), inputId: own.id, startUtf16: 0, endUtf16: 8 },
            { field: "/positioning", quote: text.slice(9, 20), inputId: own.id, startUtf16: 9, endUtf16: 20 },
          ],
          reason: REASON,
        },
        tx
      )
    );
    expect(
      doc.reason,
      "the reason counted evidence entries rather than the inputs they came from"
    ).toContain("1 of your onboarding input.");
    expect(doc.reason).not.toContain("2 of your");
  });

  it("AC-26: activation refuses while ANY claim position is unconfirmed", async () => {
    // THE TENANCY + LEARNING BLOCK. `activateBrainDoc` checked only
    // `confirmed_at` and the sha; it never compared `confirmed_fields` to the
    // claim set, and every fixture in this file used to pass
    // `confirmedFields: []` — so a version activated with ZERO of its positions
    // confirmed and nothing could see it.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    const all = confirmAll(STRATEGY);
    expect(all.length).toBeGreaterThan(1);

    // Confirm all but one.
    await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        { brainDocId: doc.id, confirmedFields: all.slice(0, -1) },
        tx
      )
    );
    const err = await db
      .transaction((tx) => caps.activateBrainDoc({ brainDocId: doc.id }, tx))
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(ProvenanceError);
    expect((err as Error).message).toContain(all[all.length - 1].pointer);

    // Confirm the last one and it activates — so the gate is not simply "always
    // refuse", which would pass the assertion above just as well.
    await db.transaction((tx) =>
      caps.confirmBrainDocFields({ brainDocId: doc.id, confirmedFields: all }, tx)
    );
    const active = await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: doc.id }, tx)
    );
    expect(active.status).toBe("active");
  });

  it("a GETTER on the confirmedFields ARRAY cannot swap the record after validation", async () => {
    // THE TENANCY RE-GATE BLOCK. Validation read `params.confirmedFields` and
    // the store read it AGAIN, so a getter served `[]` to the loop (which then
    // passed trivially, zero iterations) and the full claim set with every flag
    // INVERTED to the column — and the document activated. `/audience` (holding
    // `[check]`) was recorded as a confirmed real claim; `/positioning` (holding
    // real text) as still unknown. Both laundering routes the validation exists
    // to close, through the property the validation reads.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    const honest = confirmAll(STRATEGY);
    const inverted = honest.map((f) => ({
      pointer: f.pointer,
      asPlaceholder: !f.asPlaceholder,
    }));
    let reads = 0;
    const params = {
      brainDocId: doc.id,
      get confirmedFields() {
        reads += 1;
        // Empty on the first read (validation sees nothing to object to),
        // inverted on every read after it.
        return reads === 1 ? [] : inverted;
      },
    } as unknown as Parameters<
      ProfileWriteCapabilities["confirmBrainDocFields"]
    >[0];
    // THE ATTACK NOW FAILS EARLIER AND LOUDER (tenancy + compliance gates,
    // 2026-08-29). The getter's first read is `[]`, and an empty submission is
    // refused BY NAME rather than stored — so the laundering route closes at
    // the confirmation instead of at activation two steps later, and no
    // attributable `confirmed_by` stamp is written over an empty decision.
    await expect(
      db.transaction((tx) => caps.confirmBrainDocFields(params, tx))
    ).rejects.toThrow(/at least one field/);
    // THE READ-ONCE PROPERTY IS UNCHANGED and is still the thing under test:
    // the inverted payload the getter would serve on a second read never
    // reached anything, because there was no second read.
    expect(reads, "confirmedFields was read more than once").toBe(1);
    // ...and nothing was recorded, so activation still refuses — the property
    // that actually protects the creator, now reachable by a shorter path.
    await expect(
      db.transaction((tx) => caps.activateBrainDoc({ brainDocId: doc.id }, tx))
    ).rejects.toThrow(/not been confirmed/);
  });

  it("a GETTER on a confirmedFields ELEMENT cannot swap it either", async () => {
    // The array getter is not the whole class: validation reads `f.pointer`
    // and `f.asPlaceholder` off each ENTRY, so an element-level getter can
    // serve one value to the check and another to the serialiser.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    let reads = 0;
    const sneaky = {
      asPlaceholder: true,
      get pointer() {
        reads += 1;
        // `/audience` holds CHECK, so `asPlaceholder: true` validates; a later
        // read swaps in a position holding a real value.
        return reads <= 2 ? "/audience" : "/positioning";
      },
    };
    const confirmed = await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        {
          brainDocId: doc.id,
          confirmedFields: [
            sneaky as unknown as { pointer: string; asPlaceholder: boolean },
          ],
        },
        tx
      )
    );
    const stored = confirmed.confirmedFields as {
      pointer: string;
      asPlaceholder: boolean;
    }[];
    expect(
      stored[0].pointer,
      "a later read of the element getter reached the stored column"
    ).toBe("/audience");
    expect(stored[0].asPlaceholder).toBe(true);
  });

  it("the confirmation key space is CLOSED — a smuggled key is refused", async () => {
    // `confirmed_fields` is on the export-included row. The tenancy gate stored
    // a home address in it and activated.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    await expect(
      db.transaction((tx) =>
        caps.confirmBrainDocFields(
          {
            brainDocId: doc.id,
            confirmedFields: confirmAll(STRATEGY).map((f) => ({
              ...f,
              smuggled: "her home address is 12 Acacia Ave",
            })) as unknown as { pointer: string; asPlaceholder: boolean }[],
          },
          tx
        )
      )
    ).rejects.toThrow(/not the shape a confirmation takes/);
  });

  it("confirming the same position twice is refused", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    const one = confirmAll(STRATEGY)[0];
    await expect(
      db.transaction((tx) =>
        caps.confirmBrainDocFields(
          { brainDocId: doc.id, confirmedFields: [one, one] },
          tx
        )
      )
    ).rejects.toThrow(/confirmed twice/);
  });

  it("confirmation refuses a pointer the document does not declare", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    await expect(
      db.transaction((tx) =>
        caps.confirmBrainDocFields(
          {
            brainDocId: doc.id,
            confirmedFields: [
              { pointer: "/not/a/real/position", asPlaceholder: true },
            ],
          },
          tx
        )
      )
    ).rejects.toThrow(/not a position this document declares/);
  });

  it("confirmation refuses a placeholder flag that disagrees with the value", async () => {
    // Marking a REAL claim as "still unknown" launders it; marking a `[check]`
    // as a real confirmation launders the other way. Both matter the moment
    // C-21's "N of your M posts" label reads `confirmed_fields`.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    await expect(
      db.transaction((tx) =>
        caps.confirmBrainDocFields(
          {
            brainDocId: doc.id,
            // `/positioning` holds a real value.
            confirmedFields: [{ pointer: "/positioning", asPlaceholder: true }],
          },
          tx
        )
      )
    ).rejects.toThrow(/cannot be confirmed as a placeholder/);
    await expect(
      db.transaction((tx) =>
        caps.confirmBrainDocFields(
          {
            brainDocId: doc.id,
            // `/audience` holds CHECK.
            confirmedFields: [{ pointer: "/audience", asPlaceholder: false }],
          },
          tx
        )
      )
    ).rejects.toThrow(/only be confirmed as still unknown/);
  });

  it("activation refuses when the recorded corpus cannot be read back whole", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const ref = await caps.appendOnboardingInput({
      inputClass: "reference",
      content: "somebody else wrote this whole sentence right here today",
    });
    const doc = await writeDoc(caps);
    expect(doc.referenceCorpusIds).toEqual([ref.id]);
    await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
        tx
      )
    );
    // Record an id that no longer resolves. A partial corpus is an absent
    // corpus for that input — the bar must not quietly run over what is left.
    await db
      .update(brainDocs)
      .set({
        referenceCorpusIds: [ref.id, "00000000-0000-4000-8000-00000000beef"],
      })
      .where(eq(brainDocs.id, doc.id));
    await expect(
      db.transaction((tx) => caps.activateBrainDoc({ brainDocId: doc.id }, tx))
    ).rejects.toThrow(/could be read back/);
  });

  // ------------------------------------------------------------------ AC-62

  it("AC-62: BOTH bars take the same corpus accessor, and activation re-reads THE RECORDED SET", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    const confirmed = await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
        tx
      )
    );
    expect(confirmed.confirmedAt).not.toBeNull();

    // A reference post appended AFTER the write, echoing the stored content.
    // Under a rebuilt corpus this refuses activation forever.
    await caps.appendOnboardingInput({
      inputClass: "reference",
      content: `${STRATEGY.positioning} and a good deal more text besides`,
    });

    const active = await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: doc.id }, tx)
    );
    expect(
      active.status,
      "a reference post appended after the write bricked activation — the corpus was rebuilt instead of re-read"
    ).toBe("active");
    expect(active.activatedAt).not.toBeNull();
  });

  it("AC-62 non-vacuity: the bar DOES still refuse an echo of a corpus the write recorded", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    // The reference post exists BEFORE the write, so it is in the recorded set.
    // The write itself must refuse — which also proves the write-side bar runs.
    await caps.appendOnboardingInput({
      inputClass: "reference",
      content: `${STRATEGY.positioning} and a good deal more text besides`,
    });
    const evidence = await seedOwnEvidence(caps);
    await expect(
      db.transaction((tx) =>
        caps.writeBrainDoc(
          {
            kind: "strategy",
            content: STRATEGY,
            sourceEvidence: evidence,
            reason: REASON,
          },
          tx
        )
      ),
      "the write-side echo bar did not run over the recorded corpus"
    ).rejects.toThrow(ReferenceEchoError);
  });

  // ------------------------------------------------- confirmation integrity

  it("activation refuses a version that is not PROPOSED (re-activation and rollback)", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const v1 = await writeDoc(caps);
    await db.transaction((tx) =>
      caps.confirmBrainDocFields({ brainDocId: v1.id, confirmedFields: confirmAll(STRATEGY) }, tx)
    );
    await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: v1.id }, tx)
    );
    // Re-activating the ACTIVE one would supersede the row and then activate
    // it — active, with a supersession date, which no reader can interpret.
    await expect(
      db.transaction((tx) => caps.activateBrainDoc({ brainDocId: v1.id }, tx))
    ).rejects.toThrow(/only a proposed version can be activated/);

    // ...and rolling BACK to a superseded version is refused too: it is a
    // capability this milestone never specified, and it would resurrect
    // content on a confirmation given before whatever replaced it.
    const v2 = await writeDoc(caps);
    await db.transaction((tx) =>
      caps.confirmBrainDocFields({ brainDocId: v2.id, confirmedFields: confirmAll(STRATEGY) }, tx)
    );
    await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: v2.id }, tx)
    );
    await expect(
      db.transaction((tx) => caps.activateBrainDoc({ brainDocId: v1.id }, tx))
    ).rejects.toThrow(/only a proposed version can be activated/);
  });

  it("activation refuses an UNCONFIRMED version", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    await expect(
      db.transaction((tx) => caps.activateBrainDoc({ brainDocId: doc.id }, tx))
    ).rejects.toThrow(/has not been confirmed/);
  });

  it("activation refuses when the content CHANGED since confirmation (round-2 V3)", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    await db.transaction((tx) =>
      caps.confirmBrainDocFields({ brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) }, tx)
    );
    // Rewrite the stored content behind the confirmation's back.
    await db
      .update(brainDocs)
      .set({ content: { ...STRATEGY, positioning: "something else entirely" } })
      .where(eq(brainDocs.id, doc.id));
    await expect(
      db.transaction((tx) => caps.activateBrainDoc({ brainDocId: doc.id }, tx))
    ).rejects.toThrow(/changed since it was confirmed/);
  });

  it("`confirmed_by` is SERVER-DERIVED from the session (round-1 T3)", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    const confirmed = await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        // A cast-in confirmedBy must not be read: a confirmation is an
        // attributable act, so it takes an id nobody can pass in.
        {
          brainDocId: doc.id,
          confirmedFields: confirmAll(STRATEGY),
          confirmedBy: "00000000-0000-4000-8000-00000000dead",
        } as unknown as Parameters<
          ProfileWriteCapabilities["confirmBrainDocFields"]
        >[0],
        tx
      )
    );
    expect(confirmed.confirmedBy).toBe(scope.userId);
    expect(confirmed.confirmedBy).not.toBe(
      "00000000-0000-4000-8000-00000000dead"
    );
  });

  it("activation SUPERSEDES the incumbent, leaving exactly one active version", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const v1 = await writeDoc(caps);
    await db.transaction((tx) =>
      caps.confirmBrainDocFields({ brainDocId: v1.id, confirmedFields: confirmAll(STRATEGY) }, tx)
    );
    await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: v1.id }, tx)
    );
    const v2 = await writeDoc(caps);
    await db.transaction((tx) =>
      caps.confirmBrainDocFields({ brainDocId: v2.id, confirmedFields: confirmAll(STRATEGY) }, tx)
    );
    await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: v2.id }, tx)
    );
    const rows = await db
      .select()
      .from(brainDocs)
      .where(eq(brainDocs.profileId, profileId));
    expect(rows.filter((r) => r.status === "active").map((r) => r.id)).toEqual([
      v2.id,
    ]);
    expect(rows.find((r) => r.id === v1.id)?.status).toBe("superseded");
    expect(rows.find((r) => r.id === v1.id)?.supersededAt).not.toBeNull();
  });

  // -------------------------------------------------------------- the roles

  it("C-12: a VIEWER can neither confirm nor activate", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    // Demote, then mint a fresh scope so the role is read off the membership.
    await db
      .update(memberships)
      .set({ role: "viewer" })
      .where(eq(memberships.workspaceId, workspaceId));
    const viewerCaps = writeCapabilities(await scopeFor());
    await expect(
      db.transaction((tx) =>
        viewerCaps.confirmBrainDocFields(
          { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
          tx
        )
      )
    ).rejects.toThrow(BrainRoleError);
    await expect(
      db.transaction((tx) =>
        viewerCaps.activateBrainDoc({ brainDocId: doc.id }, tx)
      )
    ).rejects.toThrow(BrainRoleError);
  });

  it("C-12 non-vacuity: an EDITOR can do both", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    await db
      .update(memberships)
      .set({ role: "editor" })
      .where(eq(memberships.workspaceId, workspaceId));
    const editorCaps = writeCapabilities(await scopeFor());
    await db.transaction((tx) =>
      editorCaps.confirmBrainDocFields(
        { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
        tx
      )
    );
    const active = await db.transaction((tx) =>
      editorCaps.activateBrainDoc({ brainDocId: doc.id }, tx)
    );
    expect(active.status).toBe("active");
  });

  it("the pause gate on BOTH new capabilities is real (REQ-G08)", async () => {
    // A TENANCY MUTATION SURVIVOR. Removing `hasOpenPause` from both
    // capabilities left 214/214 db tests green: AC-12 covered only the three
    // older capabilities, and the two that shipped today had no detector at
    // all. A brain write is an entitlement, so it is refused while paused.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    await db.insert(pausePeriods).values({
      workspaceId,
      startedAt: new Date(Date.now() - 60_000),
      startedKnownAt: new Date(Date.now() - 60_000),
    });
    await expect(
      db.transaction((tx) =>
        caps.confirmBrainDocFields(
          { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
          tx
        )
      )
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    await expect(
      db.transaction((tx) => caps.activateBrainDoc({ brainDocId: doc.id }, tx))
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    // NON-VACUITY: with the pause closed, both proceed.
    await db.update(pausePeriods).set({ endedAt: new Date() });
    await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        { brainDocId: doc.id, confirmedFields: confirmAll(STRATEGY) },
        tx
      )
    );
    const active = await db.transaction((tx) =>
      caps.activateBrainDoc({ brainDocId: doc.id }, tx)
    );
    expect(active.status).toBe("active");
  });

  it("BOTH cage predicates are load-bearing on the confirm/activate read", async () => {
    // A TENANCY MUTATION SURVIVOR. Deleting the WORKSPACE predicate from
    // `readOwnBrainDoc` left every suite green — while the function's own
    // comment calls both predicates load-bearing. The profile predicate alone
    // is wrong for a re-parented row, which is what this drives.
    //
    // The composite FK makes a cross-parented row unrepresentable, so it is
    // created inside a transaction with the constraint dropped, exactly as the
    // M2a cage suite does, and rolled back.
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const doc = await writeDoc(caps);
    const otherWorkspace = (
      await ensureUserWorkspace(db, { authUserId: "act_user2", name: "Z" })
    ).workspace.id;

    await expect(
      db.transaction(async (tx) => {
        await tx.execute(
          sql.raw(
            `ALTER TABLE brain_docs DROP CONSTRAINT brain_docs_profile_workspace_fk`
          )
        );
        await tx.execute(
          sql.raw(
            `UPDATE brain_docs SET workspace_id = '${otherWorkspace}' WHERE id = '${doc.id}'`
          )
        );
        // The row still names THIS profile, so a profile-only read finds it.
        const profileOnly = await tx.execute(
          sql.raw(
            `SELECT id FROM brain_docs WHERE profile_id = '${profileId}' AND id = '${doc.id}'`
          )
        );
        expect(
          profileOnly.rows.length,
          "fixture is vacuous — the re-parented row does not exist"
        ).toBe(1);
        // ...and the scoped capability must NOT.
        const scoped = await ProfileScope.mint(tx, await withWorkspace(tx as never, { authUserId: "act_user" }), profileId);
        await expect(
          writeCapabilities(scoped).activateBrainDoc({ brainDocId: doc.id }, tx)
        ).rejects.toBeInstanceOf(ProfileAccessError);
        throw new Error("rollback");
      })
    ).rejects.toThrow("rollback");
  });

  it("P2: a brain doc in another profile is refused with the SAME message as a nonexistent one", async () => {
    const scope = await scopeFor();
    const caps = writeCapabilities(scope);
    const [sibling] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "B" })
      .returning();
    const siblingScope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "act_user" }),
      sibling.id
    );
    const siblingDoc = await writeDoc(writeCapabilities(siblingScope));

    const foreign = await db
      .transaction((tx) =>
        caps.activateBrainDoc({ brainDocId: siblingDoc.id }, tx)
      )
      .catch((e: Error) => e);
    const missing = await db
      .transaction((tx) =>
        caps.activateBrainDoc(
          { brainDocId: "00000000-0000-4000-8000-000000000009" },
          tx
        )
      )
      .catch((e: Error) => e);
    const malformed = await db
      .transaction((tx) => caps.activateBrainDoc({ brainDocId: "nope" }, tx))
      .catch((e: Error) => e);
    expect((missing as Error).message).toBe((foreign as Error).message);
    expect((malformed as Error).message).toBe((foreign as Error).message);
    expect((foreign as Error).message).not.toContain(siblingDoc.id);
  });
});

// --------------------------------------------------- activateBrainDocCoherent

describe("activateBrainDocCoherent — the coherent-activation snapshot (slice 3b, R8)", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "coherent_user");
    workspaceId = (
      await ensureUserWorkspace(db, { authUserId: "coherent_user", name: "C" })
    ).workspace.id;
    const [p] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "C" })
      .returning();
    profileId = p.id;
  });

  const scopeFor = async () =>
    ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "coherent_user" }),
      profileId
    );

  /** Write, confirm and (coherently) activate ONE strategy version, distinguished by `positioning`. */
  const activateStrategy = async (
    caps: ProfileWriteCapabilities,
    positioning: string
  ) => {
    const ownText = `I always open on the beat about ${positioning}, never on the setup`;
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: ownText,
    });
    const content = { audience: CHECK, positioning, pillars: [CHECK] };
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content,
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
    await db.transaction((tx) =>
      caps.confirmBrainDocFields(
        { brainDocId: doc.id, confirmedFields: confirmAll(content) },
        tx
      )
    );
    return db.transaction((tx) => caps.activateBrainDocCoherent({ brainDocId: doc.id }, tx));
  };

  it("activating the FIRST kind records a snapshot naming it, and NULL for every kind never touched", async () => {
    const caps = writeCapabilities(await scopeFor());
    const { doc, snapshot } = await activateStrategy(caps, "clip one");
    expect(doc.status).toBe("active");
    expect(snapshot.profileId).toBe(profileId);
    expect(snapshot.workspaceId).toBe(workspaceId);
    expect(snapshot.strategyDocId).toBe(doc.id);
    expect(snapshot.voiceDocId).toBeNull();
    expect(snapshot.killtestDocId).toBeNull();
    expect(snapshot.performanceMetaDocId).toBeNull();
  });

  it("a SECOND activation of the SAME kind carries a NEW snapshot naming the NEW active id, not the superseded one", async () => {
    const caps = writeCapabilities(await scopeFor());
    const first = await activateStrategy(caps, "clip one");
    const second = await activateStrategy(caps, "clip two — a different, unrelated line entirely");
    expect(second.doc.id).not.toBe(first.doc.id);
    expect(second.snapshot.strategyDocId).toBe(second.doc.id);
    // Two snapshot rows exist, append-only — the first is NOT rewritten.
    const rows = await db
      .select()
      .from(brainActivationSnapshots)
      .where(eq(brainActivationSnapshots.profileId, profileId));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.strategyDocId).sort()).toEqual(
      [first.doc.id, second.doc.id].sort()
    );
  });

  it("activating VOICE carries STRATEGY's already-active id forward UNCHANGED (coherence across kinds)", async () => {
    const caps = writeCapabilities(await scopeFor());
    const { doc: strategyDoc } = await activateStrategy(caps, "clip one");

    const ownText = "a voice sample sentence, said the same way every time";
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: ownText,
    });
    const voiceContent = {
      register: ownText.slice(0, 12),
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
    const { snapshot } = await db.transaction((tx) =>
      caps.activateBrainDocCoherent({ brainDocId: voiceDoc.id }, tx)
    );
    expect(snapshot.voiceDocId).toBe(voiceDoc.id);
    // STRATEGY's id is carried forward, unchanged, even though THIS
    // activation only touched voice.
    expect(snapshot.strategyDocId).toBe(strategyDoc.id);
    expect(snapshot.killtestDocId).toBeNull();
  });

  it("every gate `activateBrainDoc` has still applies — a VIEWER is refused, nothing is written", async () => {
    const editorScope = await scopeFor();
    const caps = writeCapabilities(editorScope);
    const ownText = "I always open on the beat, never on the setup";
    const own = await caps.appendOnboardingInput({
      inputClass: "own_post",
      content: ownText,
    });
    const content = { audience: CHECK, positioning: "clip one", pillars: [CHECK] };
    const doc = await db.transaction((tx) =>
      caps.writeBrainDoc(
        {
          kind: "strategy",
          content,
          sourceEvidence: [
            { field: "/positioning", quote: ownText.slice(0, 12), inputId: own.id, startUtf16: 0, endUtf16: 12 },
          ],
          reason: REASON,
        },
        tx
      )
    );
    await db.transaction((tx) =>
      caps.confirmBrainDocFields({ brainDocId: doc.id, confirmedFields: confirmAll(content) }, tx)
    );

    await db.update(memberships).set({ role: "viewer" }).where(eq(memberships.workspaceId, workspaceId));
    const viewerScope = await ProfileScope.mint(
      db,
      await withWorkspace(db, { authUserId: "coherent_user" }),
      profileId
    );
    await expect(
      db.transaction((tx) =>
        writeCapabilities(viewerScope).activateBrainDocCoherent({ brainDocId: doc.id }, tx)
      )
    ).rejects.toBeInstanceOf(BrainRoleError);
    expect(await db.select().from(brainActivationSnapshots)).toHaveLength(0);
    const [row] = await db.select().from(brainDocs).where(eq(brainDocs.id, doc.id));
    expect(row.status).toBe("proposed");
  });
});

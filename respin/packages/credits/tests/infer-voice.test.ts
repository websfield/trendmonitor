// `inferVoice` — THE COMPOSED VOICE INFERENCE, and the compliance surface that
// had no witness at all.
//
// WHY THIS FILE EXISTS (compliance gate BLOCK, 2026-08-29). `inferVoice` was
// called by no test in the repo: `grep "inferVoice("` returned three hits, all
// production. `isolation.test.ts` waives it as "internal, composition only",
// which is a fair TENANCY argument and not a compliance one — so the single
// query deciding which of a creator's inputs reach a model vendor, i.e. all of
// G-12's product half, could have been deleted with the whole suite green.
//
// That is CLAUDE.md's 2026-08-26 lesson twice over: a control with no witness,
// and — worse — a control whose COMMENT claimed a second check that did not
// exist ("the assertion is in `assembleVoicePrompt`"; there is none, and there
// could not be, because `OwnPost` carries only `id` and `content`).
//
// THE INSTRUMENT is the one `inference.ts` established: the evidence that a
// `reference` post never reached the vendor is the PROMPT THE STUB CAPTURED,
// read back and searched — not a spy's call count, and not the filter's own
// source. A test that asserts the filter exists is a test of the filter's
// spelling.
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  ensureUserWorkspace,
  brainDocs,
  seedAuthUser,
  seedDb,
  withWorkspace,
  writeCapabilities,
  mintProfileScope,
  ONBOARDING_PAGE_MAX,
  type TestDb,
  type WorkspaceScope,
} from "@respin/db";
import { respinConfigV1 } from "@respin/config";
import { LlmUnavailableError } from "@respin/llm";
import type { InferenceRequest, LlmProvider } from "@respin/llm";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { inferVoice, VOICE_CORPUS_MAX_POSTS } from "../src/infer-voice";
import { anySlots } from "./support/run-slots";

/** A provider that records what it was asked, and answers with valid JSON. */
const capturing = (reply: string) => {
  const calls: InferenceRequest[] = [];
  const provider: LlmProvider = {
    vendor: "stub",
    complete: async (req) => {
      calls.push(req);
      return {
        text: reply,
        servedModel: "claude-sonnet-5",
        usage: {
          tokensIn: 10,
          tokensOut: 10,
          raw: { input_tokens: 10, output_tokens: 10 },
        },
      };
    },
  };
  return { provider, calls };
};

/** A provider whose invocation IS the failure — the pre-call gate instrument. */
const never = (): LlmProvider => ({
  vendor: "must-not-be-called",
  complete: async () => {
    throw new Error(
      "THE VENDOR WAS CALLED. A gate that must run BEFORE the model call did not."
    );
  },
});

const OWN_A =
  "I open on a number every single time, and then I say why it matters.";
const OWN_B =
  "The camera is not the problem. Your first three seconds are the problem.";
const OWN_C =
  "Say the thing that costs you something to admit. Discomfort travels far.";
const REFERENCE =
  "SOMEBODY ELSE ENTIRELY wrote this sentence and it is not the creator's own.";

/** A reply citing one span of one post, with `[check]` everywhere else. */
const replyCiting = (inputId: string, quote: string) =>
  JSON.stringify({
    fields: [
      { key: "register", values: [{ value: "Direct", inputId, quote }] },
      // `inputId`/`quote` are NULLABLE, not optional — the closed schema wants
      // them present and null for a placeholder.
      {
        key: "sentenceRhythm",
        values: [{ value: "[check]", inputId: null, quote: null }],
      },
      {
        key: "signatureMoves",
        values: [{ value: "[check]", inputId: null, quote: null }],
      },
      { key: "avoid", values: [{ value: "[check]", inputId: null, quote: null }] },
    ],
  });

describe("inferVoice — R4: only the creator's OWN posts reach a vendor", () => {
  let db: TestDb;
  let owner: WorkspaceScope;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "iv_user");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "iv_user", name: "W" });
    owner = await withWorkspace(db, { authUserId: "iv_user" });
    const profile = await createProfile(db, owner, "Anna", new Date());
    profileId = profile.id;
    await db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: owner.workspaceId,
        amount: 500,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test",
        refId: "grant-iv",
        configVersion: 1,
      })
    );
  });

  /** Paste posts through the real capability, so `input_class` is real. */
  const paste = async (
    entries: { content: string; inputClass: "own_post" | "reference" }[]
  ) => {
    const scope = await mintProfileScope(db, owner, profileId);
    const caps = writeCapabilities(scope);
    const out: { id: string; content: string }[] = [];
    for (const e of entries) {
      const row = await caps.appendOnboardingInput({
        inputClass: e.inputClass,
        content: e.content,
      });
      out.push({ id: row.id, content: row.content });
    }
    return out;
  };

  it("a REFERENCE post reaches neither the prompt nor the vendor at all", async () => {
    // THE PLANTED VIOLATION. A reference input sits in the same table, for the
    // same profile, newer than two of the three own posts — so a filter that
    // ran after a page, or not at all, would send it.
    const rows = await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: OWN_B, inputClass: "own_post" },
      { content: OWN_C, inputClass: "own_post" },
      { content: REFERENCE, inputClass: "reference" },
    ]);
    const reference = rows[3];
    const { provider, calls } = capturing(
      replyCiting(rows[0].id, OWN_A.slice(0, 20))
    );

    await inferVoice(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      "att-r4",
      3,
      VOICE_CORPUS_MAX_POSTS,
      new Date()
    );

    expect(calls, "the vendor should have been called exactly once").toHaveLength(1);
    const sent = `${calls[0].system}\n${calls[0].prompt}`;
    // NEITHER THE TEXT NOR THE ID. The text is the disclosure that matters; the
    // id matters because a prompt naming an input the model may cite lets a
    // reference span become provenance for a voice rule (G-12).
    expect(sent, "a reference post's TEXT reached the vendor").not.toContain(
      REFERENCE
    );
    expect(sent, "a reference post's ID reached the vendor").not.toContain(
      reference.id
    );
    // NON-VACUITY: the creator's own posts really are in there, so the two
    // assertions above are not passing over an empty prompt.
    expect(sent).toContain(OWN_A);
    expect(sent).toContain(OWN_B);
    expect(sent).toContain(OWN_C);
  });

  it("REFERENCE posts do not count toward the minimum, and refuse BEFORE the vendor", async () => {
    // The starvation shape the compliance gate named: with the class filter
    // applied after a page, recent references would crowd out own posts and a
    // creator with plenty of their own would be refused. Here they simply do
    // not count — and the refusal happens with a provider whose invocation is
    // the failure, so "nothing was sent" is proved rather than observed.
    await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: REFERENCE, inputClass: "reference" },
      { content: `${REFERENCE} two`, inputClass: "reference" },
      { content: `${REFERENCE} three`, inputClass: "reference" },
    ]);
    await expect(
      inferVoice(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        "att-min",
        3,
        VOICE_CORPUS_MAX_POSTS,
        new Date()
      )
    ).rejects.toThrow(/not enough to infer a voice/i);
    // ...and no brain document was written on the way past.
    expect(await db.select().from(brainDocs)).toHaveLength(0);
  });

  it("reports the corpus bound it USED and what the creator has (compliance gate)", async () => {
    // The screen states "the most recent N of your M" rather than implying the
    // whole corpus was read. Both numbers come off this result.
    const rows = await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: OWN_B, inputClass: "own_post" },
      { content: OWN_C, inputClass: "own_post" },
      { content: REFERENCE, inputClass: "reference" },
    ]);
    const { provider } = capturing(replyCiting(rows[0].id, OWN_A.slice(0, 20)));
    const result = await inferVoice(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      "att-count",
      3,
      VOICE_CORPUS_MAX_POSTS,
      new Date()
    );
    expect(result.postsUsed).toBe(3);
    // The reference row is NOT counted as one of their own posts.
    expect(result.postsAvailable).toBe(3);
    expect(result.postsUsed).toBeLessThanOrEqual(VOICE_CORPUS_MAX_POSTS);
  });

  it("the three 50s are ONE ceiling — schema max, accessor bound, constant — enforced, not narrated", () => {
    // Tenancy gate round 3 (2026-08-29). Three docblocks claim
    // `VOICE_CORPUS_MAX_POSTS` is "the hard ceiling the schema and the
    // accessor both cap against", and nothing tied the three numbers: the
    // schema max is a literal at `config/src/schema.ts`, the accessor refuses
    // against `ONBOARDING_PAGE_MAX`, and the constant was read only by tests.
    // Drift — raising one without the others — turns every `inferVoice` on a
    // raised config into a permanent refusal: an operator-shaped outage, and
    // the exact "stated bound the read never honoured" class this slice fixed.
    // A comment claiming a property gets a test or the comment goes
    // (CLAUDE.md, 2026-07-30).
    expect(VOICE_CORPUS_MAX_POSTS).toBe(ONBOARDING_PAGE_MAX);
    const onboardingSchema = respinConfigV1.shape.onboarding;
    const at = (voiceCorpusMaxPosts: number) =>
      onboardingSchema.safeParse({
        minOwnPostsForVoice: 3,
        voiceCorpusMaxPosts,
        maxUnchargedBillableAttempts: 3,
      });
    expect(at(VOICE_CORPUS_MAX_POSTS).success).toBe(true);
    expect(
      at(VOICE_CORPUS_MAX_POSTS + 1).success,
      "the schema accepts a corpus bound above the accessor's ceiling — every inferVoice on that config refuses forever"
    ).toBe(false);
  });

  it("an unreadable reply is retried ONCE, on one attempt id, and still writes NO brain document", async () => {
    // R2's fail-closed half, driven through the composition rather than through
    // the parser alone.
    //
    // THIS TEST ASSERTED `toHaveLength(1)` UNTIL 2026-09-18, and the number
    // changed for a reason rather than to make a red test green: the parse used
    // to run AFTER `runInference` returned, so an unreadable reply consumed the
    // creator's one included build with no second attempt anywhere on the path.
    // It is now `runInference`'s `validate` predicate, which buys exactly one
    // more vendor call. Two calls really happened, so R13 requires two spend
    // records — "the vendor was really paid" is now true twice.
    const rows = await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: OWN_B, inputClass: "own_post" },
      { content: OWN_C, inputClass: "own_post" },
    ]);
    expect(rows).toHaveLength(3);
    const { provider, calls } = capturing(
      "I am terribly sorry, but here is some prose."
    );
    await expect(
      inferVoice(
        db,
        owner,
        profileId,
        provider,
        anySlots(),
        "att-parse",
        3,
        VOICE_CORPUS_MAX_POSTS,
        new Date()
      )
    ).rejects.toThrow();
    expect(
      await db.select().from(brainDocs),
      "a refused parse must never leave a partially-filled document"
    ).toHaveLength(0);
    // THE BOUND IS THE POINT. A predicate that never accepts must cost exactly
    // one extra call, not a loop against a creator's balance.
    expect(
      calls,
      "an unreadable reply buys ONE retry — never an unbounded loop"
    ).toHaveLength(2);
    expect(
      new Set(calls.map((c) => c.attemptId)),
      "the retry is the SAME attempt — a second id would take a second debit and break the REQ-G05 join"
    ).toEqual(new Set(["att-parse"]));
    const { modelUsage, creditLedger } = await import("@respin/db");
    const usage = await db.select().from(modelUsage);
    expect(
      usage,
      "both calls were really made and really charged to us — R13 records each one"
    ).toHaveLength(2);
    expect(
      usage.map((u) => u.outcome).sort(),
      "a reply we could not read is `schema_invalid`, which USAGE_OUTCOME_BILLABLE already classes billable"
    ).toEqual(["schema_invalid", "schema_invalid"]);
    // THE MONEY INVARIANT THE RETRY MUST NOT BREAK: two vendor calls, at most
    // one debit. `credit_ledger_inference_debit_uq` keys on the attempt id, so
    // sharing it is what makes the second call free to the creator.
    expect(
      (await db.select().from(creditLedger)).filter(
        (e) => e.refType === "inference"
      ),
      "one attempt is at most one debit, however many HTTP calls it took"
    ).toHaveLength(0);
  });

  it("a first reply that is unreadable and a second that is good writes the document, and charges once", async () => {
    // The other half of the retry: the case it exists FOR. Without it this
    // creator lost their included build to one drifted reply.
    const rows = await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: OWN_B, inputClass: "own_post" },
      { content: OWN_C, inputClass: "own_post" },
    ]);
    expect(rows).toHaveLength(3);
    const good = replyCiting(rows[0].id, OWN_A.slice(0, 20));
    const calls: InferenceRequest[] = [];
    const provider: LlmProvider = {
      vendor: "stub",
      complete: async (req) => {
        calls.push(req);
        return {
          // FIRST reply unreadable, SECOND good — the live `bad_shape` shape.
          text: calls.length === 1 ? "not json at all" : good,
          servedModel: "claude-sonnet-5",
          usage: {
            tokensIn: 10,
            tokensOut: 10,
            raw: { input_tokens: 10, output_tokens: 10 },
          },
        };
      },
    };
    const result = await inferVoice(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      "att-recovered",
      3,
      VOICE_CORPUS_MAX_POSTS,
      new Date()
    );
    expect(calls, "one retry was enough").toHaveLength(2);
    expect(
      await db.select().from(brainDocs),
      "the recovered reply really does produce the document the creator paid for"
    ).toHaveLength(1);
    expect(result.brainDocId).toBeTruthy();
    const { modelUsage } = await import("@respin/db");
    const usage = await db.select().from(modelUsage);
    expect(usage, "both calls are recorded").toHaveLength(2);
    expect(
      usage.map((u) => u.outcome).sort(),
      "the discarded attempt stays visible as `schema_invalid` — a recovered build must not hide what it cost us"
    ).toEqual(["schema_invalid", "succeeded"]);
    expect(
      result.run.creditsCharged,
      "this profile's included build covers the WHOLE attempt, retry included"
    ).toBe(0);
    const { firstBillableAttempts } = await import("@respin/db");
    expect(
      (await db.select().from(firstBillableAttempts)).map((r) => r.attemptId),
      "two vendor calls, ONE claim on the included build"
    ).toEqual(["att-recovered"]);
  });

  it("an unreadable reply then a VENDOR error leaves the included build UNCLAIMED", async () => {
    // THE BLOCK THE BILLING GATE FOUND, pinned so it cannot come back.
    //
    // The discarded attempt used to claim the included build before the
    // operation's outcome was known. When the retry then died on an
    // `LlmError`, the claim was held permanently while the creator's screen
    // said "this attempt did not use up your first run for this creator" — a
    // false sentence on a money surface, and on Free with a zero balance the
    // next press is priced as a paid build, i.e. locked out of onboarding.
    //
    // The entitlement is the invariant this whole change moved, and NOTHING
    // asserted it until this test.
    const rows = await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: OWN_B, inputClass: "own_post" },
      { content: OWN_C, inputClass: "own_post" },
    ]);
    expect(rows).toHaveLength(3);
    const calls: InferenceRequest[] = [];
    const provider: LlmProvider = {
      vendor: "stub",
      complete: async (req) => {
        calls.push(req);
        // Call 1 answers unreadably; call 2 is a vendor outage — the exact
        // interleaving that produced the false copy.
        if (calls.length === 1) {
          return {
            text: "not json at all",
            servedModel: "claude-sonnet-5",
            usage: {
              tokensIn: 10,
              tokensOut: 10,
              raw: { input_tokens: 10, output_tokens: 10 },
            },
          };
        }
        throw new LlmUnavailableError(null, "network");
      },
    };
    await expect(
      inferVoice(
        db,
        owner,
        profileId,
        provider,
        anySlots(),
        "att-vendor-died",
        3,
        VOICE_CORPUS_MAX_POSTS,
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(calls, "the retry really was attempted").toHaveLength(2);
    const { modelUsage, firstBillableAttempts } = await import("@respin/db");
    const usage = await db.select().from(modelUsage);
    expect(usage, "both calls are recorded — R13 does not care that we failed").toHaveLength(2);
    // THE ASSERTION THAT WOULD HAVE CAUGHT THE BLOCK.
    expect(
      await db.select().from(firstBillableAttempts),
      "a vendor outage after an unreadable reply must leave the creator's included build intact — the surfaced copy says exactly that"
    ).toHaveLength(0);
    expect(
      usage.filter((u) => u.consumedIncludedBuild),
      "no row may claim consumption when the surfaced refusal says nothing was consumed"
    ).toHaveLength(0);
  });

  it("two unreadable replies DO consume the included build, matching what the screen says", async () => {
    // The other side of the same rule: the operation ended having burnt the
    // vendor's tokens twice, and `inference_unusable`'s copy tells the creator
    // "Your run was still made, so it counted." That sentence has to be true,
    // so the terminal attempt consumes — which is also what the pre-change
    // single-call path did.
    const rows = await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: OWN_B, inputClass: "own_post" },
      { content: OWN_C, inputClass: "own_post" },
    ]);
    expect(rows).toHaveLength(3);
    const { provider, calls } = capturing("still not json");
    await expect(
      inferVoice(
        db,
        owner,
        profileId,
        provider,
        anySlots(),
        "att-both-bad",
        3,
        VOICE_CORPUS_MAX_POSTS,
        new Date()
      )
    ).rejects.toThrow();
    expect(calls).toHaveLength(2);
    const { modelUsage, firstBillableAttempts } = await import("@respin/db");
    expect(
      (await db.select().from(modelUsage)).filter((u) => u.consumedIncludedBuild),
      "exactly the TERMINAL attempt consumes — never the discarded one"
    ).toHaveLength(1);
    expect(
      (await db.select().from(firstBillableAttempts)).map((r) => r.attemptId),
      "one claim, on the attempt the creator actually pressed"
    ).toEqual(["att-both-bad"]);
  });
});

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

  it("a reply that is not JSON writes NO brain document, and the spend record stands", async () => {
    // R2's fail-closed half, driven through the composition rather than through
    // the parser alone — the ordering the billing gate asked for: the refusal
    // lands AFTER `runInference` has committed `model_usage`, so the tokens the
    // vendor really charged for survive the refusal.
    const rows = await paste([
      { content: OWN_A, inputClass: "own_post" },
      { content: OWN_B, inputClass: "own_post" },
      { content: OWN_C, inputClass: "own_post" },
    ]);
    expect(rows).toHaveLength(3);
    const { provider } = capturing("I am terribly sorry, but here is some prose.");
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
    const { modelUsage } = await import("@respin/db");
    expect(
      await db.select().from(modelUsage),
      "the spend record must survive the refusal — the vendor was really paid"
    ).toHaveLength(1);
  });
});

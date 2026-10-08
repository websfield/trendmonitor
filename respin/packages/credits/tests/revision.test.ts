// REVISION, LINEAGE AND ITS PRICE (slice 7, R6/R7/R8) — plus the tenancy of
// the framework library the same call now reads.
//
// THE INSTRUMENT IS `generate.test.ts`'s, unchanged: every refusal that is
// supposed to happen before the vendor is proved with a provider whose
// `complete` THROWS IF INVOKED, so "nothing reached the model" is the stub's
// own refusal rather than an assertion about a spy.
//
// WHAT THIS FILE IS THE WITNESS FOR, stated because the card names three
// mutations against it:
//   M1  a revision inherits its parent's kill-test verdict  -> "a revision that
//       breaks a hard rule is REFUSED even though its parent passed"
//   M3  a revision is priced at its parent MODE's cost      -> "priced as a
//       revision", which asserts the number AND asserts the two numbers differ,
//       because a pricing test between two equal prices proves nothing
//   M5  `parent_id` written as null on revision             -> "the stored row
//       names its parent"
import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  CONFIG_V1_SEED,
  brainActivationSnapshots,
  brainDocs,
  createTestDb,
  creditLedger,
  ensureUserWorkspace,
  frameworks,
  generationAttempts,
  generationFeedback,
  generations,
  seedAuthUser,
  seedDb,
  subscriptions,
  withWorkspace,
  approvePrivateFramework,
  createPrivateFramework,
  type TestDb,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { CHECK, type InferenceRequest, type LlmProvider } from "@respin/llm";
import {
  renderDraft,
  runKillTest,
  type GenerationContext,
  type ScriptOutput,
} from "@respin/modes";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import {
  UNIVERSAL_LAWS,
  generate,
  hashRequest,
  reportedSpecificsOf,
  revisionInput,
  unvouchedSpecifics,
} from "../src/generate";
import { privateFrameworkEntitlement } from "../src/mode-access";
import {
  GenerationPayloadMismatchError,
  GenerationRecoveryRequiredError,
  RevisionParentError,
} from "../src/errors";
import { CreativeRequestError } from "@respin/modes";
import {
  FORM_EXCERPT,
  FULL_SCRIPT_COST,
  formParams,
  legacyIdeas,
  v2Ideas,
  v2Script,
} from "./support/form-fixtures";
import { anySlots } from "./support/run-slots";
import { dbThatFailsWhen } from "./support/crash-db";
import {
  PLATFORM,
  hooksOutput,
  killTestReply,
  longHookOutput,
  reply,
} from "./support/generation-fixtures";

// FROM THE SEED, never mirrored as literals: an operator moving a price in
// `CONFIG_V1_SEED` must move this file's expectations with it, or the money
// test is agreeing with itself.
const CAPTION_COST = CONFIG_V1_SEED.creditCosts.caption;
const REVISION_COST = CONFIG_V1_SEED.creditCosts.revision;
const HOOK_SET_COST = CONFIG_V1_SEED.creditCosts.hookSet;

/** A valid caption document. Digit-free, for `generation-fixtures.ts`' reason. */
function captionOutput(
  over: Partial<{ text: string; weakestPoint: string }> = {}
): ScriptOutput {
  return {
    caption: {
      text:
        over.text ??
        "the part nobody tells you about starting out is that most of it looks like nothing happening",
      hashtags: ["#creators", "#firstyear"],
    },
    whyThisPerforms: {
      reasoning:
        "it names the feeling a viewer already has before it offers them anything to do about it",
      weakestPoint:
        over.weakestPoint ??
        "none of this is grounded in a result you have logged, so it is a guess about attention and not a claim about reach",
    },
    disclosure: {
      platform: PLATFORM,
      guidance:
        "mark the post as made with the help of an assistant in the platform's own disclosure control",
    },
  };
}

const captionParams = (over: Partial<{ attemptId: string; input: string }> = {}) => ({
  mode: "caption" as const,
  attemptId: over.attemptId ?? "cap-1",
  input: over.input ?? "i want to talk about what my first year actually looked like",
  platform: PLATFORM,
});

const never = (): LlmProvider => ({
  vendor: "must-not-be-called",
  complete: async () => {
    throw new Error(
      "THE VENDOR WAS CALLED. A gate that is supposed to run BEFORE the model call did not."
    );
  },
});

function scripted(texts: string[]): {
  provider: LlmProvider;
  calls: InferenceRequest[];
} {
  const calls: InferenceRequest[] = [];
  return {
    calls,
    provider: {
      vendor: "stub",
      complete: async (req) => {
        calls.push(req);
        const text = texts[calls.length - 1];
        if (text === undefined) {
          throw new Error(
            `the provider was called ${calls.length} times and only ${texts.length} replies were scripted`
          );
        }
        return {
          text,
          servedModel: "claude-sonnet-5",
          usage: {
            tokensIn: 100,
            tokensOut: 200,
            raw: { input_tokens: 100, output_tokens: 200 },
          },
        };
      },
    },
  };
}

describe("revision, lineage and its price (R6/R7/R8)", () => {
  let db: TestDb;
  let ws: VerifiedWorkspaceId;
  let owner: WorkspaceScope;
  let profileId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" });
    owner = await withWorkspace(db, { authUserId: "user_a" });
    ws = owner.workspaceId;
    profileId = (await createProfile(db, owner, "Anna", new Date())).id;
    await activateBrain(db, ws, profileId);
  });

  const grant = (amount: number) =>
    db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: ws,
        amount,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test",
        refId: `grant-${amount}`,
        configVersion: 1,
      })
    );

  async function setTier(tier: "creator" | "pro" | "studio"): Promise<void> {
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, stripePriceMap: { [`price_${tier}`]: tier } },
      "test-admin"
    );
    await db.insert(subscriptions).values({
      workspaceId: ws,
      stripeCustomerId: "cus_tier",
      stripeSubscriptionId: "sub_tier",
      stripePriceId: `price_${tier}`,
      status: "active",
    });
  }

  const debitsOf = () =>
    db
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.workspaceId, ws), eq(creditLedger.kind, "debit")));

  const attemptsOf = () =>
    db
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.workspaceId, ws));

  const generationsOf = () =>
    db.select().from(generations).where(eq(generations.workspaceId, ws));

  /**
   * The moment after the durable response checkpoint has committed
   * (`generate.test.ts`'s predicate, keyed on an attempt id because this file
   * has two attempts in flight in one case).
   *
   * A PREDICATE OVER THE ATTEMPT'S OWN STATE rather than "fail the Nth
   * transaction", for `crash-db.ts`'s stated reason: a metering call added or
   * removed would silently move a counted failure somewhere else.
   */
  const afterCheckpoint = (attemptId: string) => async () =>
    (
      await db
        .select()
        .from(generationAttempts)
        .where(eq(generationAttempts.attemptId, attemptId))
    )[0]?.state === "vendor_complete";

  // ------------------------------------------------------------------ R6/R8

  it("V3: a revision is a NEW row that names its parent, and is priced as a revision", async () => {
    // NON-VACUITY FIRST, and it is the whole reason this case uses `caption`.
    // `creditCosts.hookSet` and `creditCosts.revision` are BOTH 2 in the seed,
    // so a pricing test written on the hooks mode would pass under mutation M3
    // ("revision priced at the parent mode's cost") while proving nothing. This
    // asserts the two numbers really differ before it asserts which one was
    // charged.
    expect(
      REVISION_COST,
      "the parent mode's price and the revision price are equal, so nothing below distinguishes them"
    ).not.toBe(CAPTION_COST);

    const s = scripted([
      reply(captionOutput()),
      killTestReply(["/rules/0"]),
      reply(captionOutput({ text: "starting out mostly looks like nothing, and that is the part worth showing" })),
      killTestReply(["/rules/0"]),
    ]);
    const parent = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      captionParams(),
      new Date()
    );
    expect(parent.creditsChargedNow).toBe(CAPTION_COST);
    expect(parent.generation.parentId).toBeNull();

    const revision = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      {
        ...captionParams({
          attemptId: "cap-2",
          input: "make it less wistful and land it on the thing i actually did",
        }),
        revisionOfAttemptId: "cap-1",
      },
      new Date()
    );

    // R6: a NEW row, and it names the one it came from. M5 ("parent_id written
    // as null on revision") reddens on the second assertion.
    expect(await generationsOf()).toHaveLength(2);
    expect(revision.generation.id).not.toBe(parent.generation.id);
    expect(revision.generation.parentId).toBe(parent.generation.id);
    // R8: `creditCosts.revision`, not `creditCosts.caption`. M3 reddens here.
    expect(revision.creditsChargedNow).toBe(REVISION_COST);
    expect(revision.creditsChargedNow).not.toBe(CAPTION_COST);
    const debits = await debitsOf();
    expect(debits).toHaveLength(2);
    expect(debits.map((d) => Math.abs(d.delta)).sort()).toEqual(
      [CAPTION_COST, REVISION_COST].sort()
    );

    // R7's material half: the model was given the PARENT'S OWN DRAFT and the
    // creator's note, and it ran its own pipeline to do it — four vendor calls,
    // two per generation, so nothing was reused.
    expect(s.calls).toHaveLength(4);
    const revisionPrompt = s.calls[2].prompt;
    expect(revisionPrompt).toContain("make it less wistful");
    expect(
      revisionPrompt,
      "the parent's own words never reached the revision, so the model was asked to revise nothing"
    ).toContain(captionOutput().caption!.text);
    // ...and the creator's RECORD stores the note they typed, not the composed
    // block: `generations.request.input` is what they asked for.
    expect((revision.generation.request as { input: string }).input).toBe(
      "make it less wistful and land it on the thing i actually did"
    );
  });

  it("R7: the revision runs its OWN kill test — a scoring call and a verdict of its own", async () => {
    const s = scripted([
      reply(captionOutput()),
      killTestReply(["/rules/0"]),
      reply(captionOutput({ text: "most of the first year looks like nothing, and that is the part worth showing" })),
      killTestReply(["/rules/0"]),
    ]);
    await generate(db, owner, profileId, s.provider, anySlots(), captionParams(), new Date());
    const revision = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      { ...captionParams({ attemptId: "cap-2", input: "sharpen the ending" }), revisionOfAttemptId: "cap-1" },
      new Date()
    );
    const killTest = revision.generation.killTest as {
      outcome: string;
      creatorRulesScored: boolean;
      finalAttempt: { hardRules: unknown[] };
    };
    expect(killTest.outcome).toBe("passed");
    // The creator's own criteria were scored on THIS draft — a fourth vendor
    // call happened, which an inherited verdict would not have made.
    expect(killTest.creatorRulesScored).toBe(true);
    expect(killTest.finalAttempt.hardRules).toEqual([]);
    expect(s.calls).toHaveLength(4);
  });

  it("V4 / M1: a revision that breaks a hard rule is REFUSED, though its parent passed", async () => {
    // THE CARD'S WHOLE POINT FOR R7. The parent passes; the revision's two
    // drafts both carry a sixteen-word hook, which `hook_too_long` refuses in
    // code. A revision that INHERITED its parent's verdict would settle this as
    // usable and hand a creator unvetted text with a `passed` badge.
    const s = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
      reply(longHookOutput()),
      reply(longHookOutput()),
    ]);
    const parent = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      { mode: "hooks", attemptId: "h-1", input: "my first year", platform: PLATFORM },
      new Date()
    );
    expect(parent.generation.outcome).toBe("usable");

    const revision = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      {
        mode: "hooks",
        attemptId: "h-2",
        input: "punchier hooks please",
        platform: PLATFORM,
        revisionOfAttemptId: "h-1",
      },
      new Date()
    );

    // REFUSED, WITH ITS LINEAGE INTACT. A refusal is still a record of what the
    // creator asked for, so it names its parent like any other revision.
    expect(revision.generation.outcome).toBe("honest_refusal");
    expect(revision.generation.output).toBeNull();
    expect(revision.generation.parentId).toBe(parent.generation.id);
    expect(revision.generation.refusalReason).toMatch(/\S/);
    // AND IT IS CHARGED, at the revision price: slice 6's question-4 table
    // makes an honest refusal the product working, and R8 prices it as what it
    // was — a revision.
    expect(revision.creditsChargedNow).toBe(REVISION_COST);
    // ONE DRAFT AND ONE REWRITE FOR THE REVISION, and no scoring call: the
    // pipeline does not pay to score criteria on a draft nobody will read.
    expect(s.calls).toHaveLength(4);
    expect(parent.creditsChargedNow).toBe(HOOK_SET_COST);
  });

  // ------------------------------------------------------- the four refusals

  it("R6 tenancy: another workspace's output cannot be revised, and no vendor is reached", async () => {
    // The other creator's generation is REAL — built through the same path, in
    // its own workspace — so this is a cross-tenant read of a row that exists,
    // not a lookup of an id nobody ever minted.
    await seedAuthUser(db, "user_b");
    await ensureUserWorkspace(db, { authUserId: "user_b", name: "Other" });
    const otherOwner = await withWorkspace(db, { authUserId: "user_b" });
    const otherProfile = (
      await createProfile(db, otherOwner, "Bea", new Date())
    ).id;
    await activateBrain(db, otherOwner.workspaceId, otherProfile);
    const s = scripted([reply(captionOutput()), killTestReply(["/rules/0"])]);
    const theirs = await generate(
      db,
      otherOwner,
      otherProfile,
      s.provider,
      anySlots(),
      captionParams({ attemptId: "theirs-1" }),
      new Date()
    );
    expect(theirs.generation.workspaceId).not.toBe(ws);

    await expect(
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        { ...captionParams({ attemptId: "cap-2" }), revisionOfAttemptId: "theirs-1" },
        new Date()
      )
    ).rejects.toBeInstanceOf(RevisionParentError);
    // Nothing was claimed in THIS workspace and nothing was charged.
    expect(await attemptsOf()).toHaveLength(0);
    expect(await debitsOf()).toHaveLength(0);
  });

  it("R6: a nonexistent parent and a foreign one are the SAME refusal, byte for byte", async () => {
    // The enumeration rule: a refusal that distinguished "somebody else's
    // output" from "no such output" would be an oracle over every workspace's
    // attempt ids.
    const foreignish = await capture(() =>
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        { ...captionParams({ attemptId: "cap-2" }), revisionOfAttemptId: "does-not-exist" },
        new Date()
      )
    );
    const missing = await capture(() =>
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        { ...captionParams({ attemptId: "cap-3" }), revisionOfAttemptId: "also-not-a-thing" },
        new Date()
      )
    );
    expect(foreignish).toBeInstanceOf(RevisionParentError);
    expect((foreignish as RevisionParentError).reason).toBe("not_this_creators");
    expect(missing!.message).toBe(foreignish!.message);
    // R15: the refusal says nothing was spent and sells nothing.
    expect(foreignish!.message).toContain("nothing was spent");
    expect(foreignish!.message.toLowerCase()).not.toContain("upgrade");
  });

  it("R8's discount hole: an HONEST REFUSAL cannot be revised", async () => {
    // Pricing, not tidiness. `creditCosts.revision` is below every script
    // price, and a refusal carries no draft — so if a refusal could be
    // "revised", generating at the revision price forever would be one failed
    // generation away.
    const s = scripted([
      reply(longHookOutput()),
      reply(longHookOutput()),
    ]);
    const refused = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      { mode: "hooks", attemptId: "h-1", input: "my first year", platform: PLATFORM },
      new Date()
    );
    expect(refused.generation.outcome).toBe("honest_refusal");

    const e = await capture(() =>
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        {
          mode: "hooks",
          attemptId: "h-2",
          input: "try again but sharper",
          platform: PLATFORM,
          revisionOfAttemptId: "h-1",
        },
        new Date()
      )
    );
    expect(e).toBeInstanceOf(RevisionParentError);
    expect((e as RevisionParentError).reason).toBe("not_revisable");
    expect(e!.message).toContain("nothing was spent");
    // ONE generation, ONE debit: the second press produced neither.
    expect(await generationsOf()).toHaveLength(1);
    expect(await debitsOf()).toHaveLength(1);
  });

  it("a revision may not change MODE", async () => {
    const s = scripted([reply(captionOutput()), killTestReply(["/rules/0"])]);
    await generate(db, owner, profileId, s.provider, anySlots(), captionParams(), new Date());
    const e = await capture(() =>
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        {
          mode: "hooks",
          attemptId: "h-2",
          input: "turn this into hooks",
          platform: PLATFORM,
          revisionOfAttemptId: "cap-1",
        },
        new Date()
      )
    );
    expect(e).toBeInstanceOf(RevisionParentError);
    expect((e as RevisionParentError).reason).toBe("different_mode");
    expect(e!.message.toLowerCase()).not.toContain("upgrade");
  });

  // ------------------------------------------------ the payload identity (R14)

  it("a revision and an original with the SAME note are different payloads", async () => {
    // Without `parentGenerationId` in the hash, a creator submitting the second
    // under an id the first already used would be handed the first's stored
    // output as though it were an answer to what they asked.
    const base = {
      mode: "caption",
      platform: PLATFORM,
      input: "make it less wistful",
      brainActivationId: "00000000-0000-4000-8000-000000000001",
      promptBundleVersion: "bundle-x",
      spinAutopsyId: null,
      spinAnalysisVersion: null,
      creative: null,
      origin: null,
    };
    expect(hashRequest({ ...base, parentGenerationId: null })).not.toBe(
      hashRequest({ ...base, parentGenerationId: "00000000-0000-4000-8000-0000000000ab" })
    );
    // ...and two revisions of DIFFERENT parents are different too.
    expect(
      hashRequest({ ...base, parentGenerationId: "00000000-0000-4000-8000-0000000000ab" })
    ).not.toBe(
      hashRequest({ ...base, parentGenerationId: "00000000-0000-4000-8000-0000000000ac" })
    );
  });

  it("R-148: the creative half is part of request identity — every field of it, and its absence", () => {
    const base = {
      mode: "ideation",
      platform: PLATFORM,
      input: "an idea",
      brainActivationId: "00000000-0000-4000-8000-000000000001",
      promptBundleVersion: "bundle-x",
      parentGenerationId: null,
      spinAutopsyId: null,
      spinAnalysisVersion: null,
      origin: null,
    };
    const limits = {
      people: null,
      maxMinutes: null,
      locations: [] as string[],
      equipment: [] as string[],
      footage: null,
    };
    const auto = { formChoice: "auto" as const, constraints: limits };
    const variants = [
      null,
      auto,
      { ...auto, formChoice: "explain_opinion" as const },
      { ...auto, formChoice: "demonstration_experiment" as const },
      { ...auto, formChoice: "personal_story_observation" as const },
      { ...auto, constraints: { ...limits, people: "solo" as const } },
      { ...auto, constraints: { ...limits, people: "with_help" as const } },
      { ...auto, constraints: { ...limits, maxMinutes: 10 } },
      { ...auto, constraints: { ...limits, maxMinutes: 11 } },
      { ...auto, constraints: { ...limits, locations: ["kitchen"] } },
      { ...auto, constraints: { ...limits, equipment: ["kitchen"] } },
      { ...auto, constraints: { ...limits, footage: "kitchen" } },
      // A LIST IS NOT ITS JOINED STRING: one item "a,b" is not two items.
      { ...auto, constraints: { ...limits, locations: ["a,b"] } },
      { ...auto, constraints: { ...limits, locations: ["a", "b"] } },
    ];
    const hashes = variants.map((creative) => hashRequest({ ...base, creative }));
    expect(new Set(hashes).size, "two different creative halves share one identity").toBe(
      variants.length
    );
  });

  it("R-148: a creator's text cannot forge the canonical form's separators inside the creative record", () => {
    const base = {
      mode: "ideation",
      platform: PLATFORM,
      input: "an idea",
      brainActivationId: "00000000-0000-4000-8000-000000000001",
      promptBundleVersion: "bundle-x",
      parentGenerationId: null,
      spinAutopsyId: null,
      spinAnalysisVersion: null,
      origin: null,
    };
    const limits = { people: null, maxMinutes: null, locations: [], equipment: [], footage: null };
    // Two halves whose RAW concatenation would agree if the separators were not
    // escaped: one footage note carrying a record separator, against the same
    // text split across two fields.
    const forged = hashRequest({
      ...base,
      creative: { formChoice: "auto", constraints: { ...limits, footage: "a\u0001b" } },
    });
    const split = hashRequest({
      ...base,
      creative: { formChoice: "auto", constraints: { ...limits, footage: "a", locations: ["b"] } },
    });
    expect(forged).not.toBe(split);
    // NON-VACUITY: identical halves DO hash identically — the check is not
    // passing because every call is unique.
    expect(
      hashRequest({ ...base, creative: { formChoice: "auto", constraints: limits } })
    ).toBe(hashRequest({ ...base, creative: { formChoice: "auto", constraints: limits } }));
  });

  it("two Spins with the same creator input but different server-derived autopsy revisions have different payloads", () => {
    const base = {
      mode: "analyseAndSpin",
      platform: "youtube",
      input: "Make this original.",
      brainActivationId: "00000000-0000-4000-8000-000000000001",
      promptBundleVersion: "bundle-x",
      parentGenerationId: null,
      creative: null,
      origin: null,
    } as const;
    expect(
      hashRequest({
        ...base,
        spinAutopsyId: "00000000-0000-4000-8000-0000000000a1",
        spinAnalysisVersion: "spin-v1",
      })
    ).not.toBe(
      hashRequest({
        ...base,
        spinAutopsyId: "00000000-0000-4000-8000-0000000000a1",
        spinAnalysisVersion: "spin-v2",
      })
    );
    expect(
      hashRequest({
        ...base,
        spinAutopsyId: "00000000-0000-4000-8000-0000000000a1",
        spinAnalysisVersion: "spin-v1",
      })
    ).not.toBe(
      hashRequest({
        ...base,
        spinAutopsyId: "00000000-0000-4000-8000-0000000000a2",
        spinAnalysisVersion: "spin-v1",
      })
    );
  });

  it("REQ-G05: what a REVISION costs us against what it charges, MEASURED", async () => {
    // THE QUESTION NOBODY HAD ANSWERED (billing gate NOTE, 2026-09-01). A
    // revision runs the FULL pipeline on a strictly larger prompt — the note
    // AND the whole parent draft — and is charged `creditCosts.revision` (2)
    // where the script modes charge `creditCosts.fullScript` (5). That is
    // PRD §4G's own number and it is config, so it is not a defect. What was
    // missing is the measurement: no figure for vendor cost per revision
    // existed anywhere, so nobody could say whether the discount was one this
    // product can afford.
    //
    // WHAT IS MEASURED HERE AND WHAT IS NOT. Characters of prompt, not tokens:
    // nothing in this repo tokenises, and `generation-frameworks.test.ts`
    // already states why a character count is the honest proxy (English prose
    // runs ~3.5-4.5 characters per token, so a chars/4 estimate over-states
    // tokens rather than under-stating them). OUTPUT is unchanged — the same
    // document contract, the same `llm.maxOutputTokens` ceiling — so the
    // difference between an original and a revision is INPUT, which is exactly
    // what this measures.
    const s = scripted([
      reply(captionOutput()),
      killTestReply(["/rules/0"]),
      reply(
        captionOutput({
          text: "most of the first year looks like nothing, and that is the part worth showing",
        })
      ),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      captionParams(),
      new Date()
    );
    await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      {
        ...captionParams({ attemptId: "cap-2", input: "sharpen the ending" }),
        revisionOfAttemptId: "cap-1",
      },
      new Date()
    );

    const chars = (i: number) =>
      s.calls[i].system.length + s.calls[i].prompt.length;
    const original = chars(0);
    const revision = chars(2);
    const added = revision - original;

    // THE FIGURE, measured on this build with this fixture (2026-09-01):
    //
    //   original caption prompt   2,825 characters
    //   its revision              3,567 characters
    //   added by the revision       742  (1.26x)
    //
    // The 742 is the parent's rendered draft plus `revisionInput`'s two
    // framing lines. Converted at the CONSERVATIVE end of the range
    // (3.5 characters per token, the end that over-states tokens) that is
    // ~212 input tokens, and at `llm.prices["claude-sonnet-5"]
    // .inputNanoUsdPerToken` = 3,000 nano-USD/token, ~636,000 nano-USD =
    // 0.00064 USD per call. A revision attempt makes at most two calls
    // carrying this prompt (the draft and R6's one rewrite; the scoring call
    // carries the rendered draft, which an original pays for too), so the
    // revision's EXTRA vendor cost is ~0.0013 USD.
    //
    // AGAINST WHAT IT IS COMPARED WITH: the same attempt's OUTPUT ceiling is
    // 140,000,000 nano-USD = 0.14 USD (`packages/config/src/schema.ts` works
    // that arithmetic out from the same seeded prices), so the extra input a
    // revision pays for is under 1% of one attempt's ceiling. `creditCosts
    // .revision` = 2 against `fullScript` = 5 is PRD §4G's own number, and
    // this measurement is the thing that was missing rather than a challenge
    // to it: the discount is not where this product's margin goes. Recorded in
    // `decisions.md` R-74.
    expect(added, "a revision's prompt did not grow at all, so this measures nothing").toBeGreaterThan(0);
    // PINNED AS A RATIO, not as a literal: fixture wording moves the absolute
    // numbers and must not redden this, while a revision prompt that grew to
    // several times its original would be a real change in what we pay.
    expect(
      revision / original,
      `a revision prompt is now ${(revision / original).toFixed(2)}x its original (${original} -> ${revision} characters) — re-measure the per-revision vendor cost before raising this`
    ).toBeLessThan(2.5);
    // ...and the parent's draft really is what it grew by, so the growth is
    // the thing being priced rather than an artefact of the fixture.
    expect(added).toBeGreaterThan(captionOutput().caption!.text.length);
  });

  it("a PRE-DEPLOY attempt's hash cannot match this build's, so it is refused on the HASH", () => {
    // THE MECHANISM `CANDIDATE_VERSION`'s DOCBLOCK NAMES, run rather than
    // argued (billing gate, 2026-09-01). The docblock said a v1 candidate
    // "refuses, stays at `vendor_complete` ... the behaviour `readCandidate`'s
    // docblock already specifies". It cannot reach `readCandidate`:
    // `hashRequest` gained its sixth field in the SAME change that bumped the
    // envelope, so the stored hash of an attempt started by the previous build
    // is the hash of a FIVE-field canonical string and can never equal this
    // build's. `generate` compares the hashes before it observes the claim.
    //
    // The five-field string is written out here because that is exactly what
    // it is — a historical constant, the bytes an older deployment hashed —
    // and there is no other honest way to name it.
    const request = {
      mode: "caption",
      platform: PLATFORM,
      input: "sharpen the ending",
      brainActivationId: "00000000-0000-4000-8000-000000000001",
      promptBundleVersion: "bundle-x",
      parentGenerationId: null,
      spinAutopsyId: null,
      spinAnalysisVersion: null,
      creative: null,
      origin: null,
    };
    const FIELD_SEP = "\u0000";
    const RECORD_SEP = "\u0001";
    const beforeSliceSeven = createHash("sha256")
      .update(
        [
          "mode" + FIELD_SEP + request.mode,
          "platform" + FIELD_SEP + request.platform,
          "input" + FIELD_SEP + request.input,
          "brainActivationId" + FIELD_SEP + request.brainActivationId,
          "promptBundleVersion" + FIELD_SEP + request.promptBundleVersion,
        ].join(RECORD_SEP),
        "utf8"
      )
      .digest("hex");
    expect(hashRequest(request)).not.toBe(beforeSliceSeven);
    // ...and the ordering half — the hash check running BEFORE the candidate
    // is read — is driven by "a retry that DROPS the revision flag is refused
    // rather than re-priced" above, where an attempt sitting at
    // `vendor_complete` WITH a stored candidate is refused on the hash.
  });

  it("a retry that DROPS the revision flag is refused rather than re-priced", async () => {
    // THE HOLE THIS CLOSES, stated: the priced operation used to be built from
    // `params` and carried into the settlement, so re-submitting a revision's
    // attempt id without the flag would have settled the stored revision
    // candidate at the parent MODE's price. Two doors now stand in the way and
    // this drives both: the payload hash refuses the mismatched submission
    // outright, and `settle` derives the price from the CANDIDATE rather than
    // from `params`, so even a matching submission cannot mis-price it.
    const s = scripted([
      reply(captionOutput()),
      killTestReply(["/rules/0"]),
      reply(captionOutput({ text: "the first year mostly looks like nothing, and that is the part worth showing" })),
      killTestReply(["/rules/0"]),
    ]);
    await generate(db, owner, profileId, s.provider, anySlots(), captionParams(), new Date());

    const revisionParams = {
      ...captionParams({ attemptId: "cap-2", input: "sharpen the ending" }),
      revisionOfAttemptId: "cap-1",
    };
    // Crash between the response checkpoint and the settlement, so the stored
    // candidate survives and the attempt sits at `vendor_complete`.
    const crashing = dbThatFailsWhen(db, afterCheckpoint("cap-2"), "always");
    await expect(
      generate(crashing, owner, profileId, s.provider, anySlots(), revisionParams, new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);

    // Door 1: the same attempt id WITHOUT the flag is a different payload.
    const asOriginal = { ...revisionParams, revisionOfAttemptId: undefined };
    await expect(
      generate(db, owner, profileId, never(), anySlots(), asOriginal, new Date())
    ).rejects.toBeInstanceOf(GenerationPayloadMismatchError);

    // Door 2: the honest retry settles the stored candidate — as a revision,
    // at the revision price, with its lineage, and with no vendor call.
    const settled = await generate(
      db,
      owner,
      profileId,
      never(),
      anySlots(),
      revisionParams,
      new Date()
    );
    expect(settled.creditsChargedNow).toBe(REVISION_COST);
    expect(settled.generation.parentId).not.toBeNull();
    expect(s.calls).toHaveLength(4);
  });

  // -------------------------------------------- the framework library (R5/R9a)

  it("R5b: the approved shared library reaches the prompt, and its versions are recorded when named", async () => {
    const [library] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"))
      .limit(1);
    expect(library, "the seed did not write a shared library").toBeDefined();

    const named: ScriptOutput = {
      ...hooksOutput(),
      framework: {
        name: library.name,
        why: "it opens on the thing the viewer already suspects and then pays it off",
      },
    };
    const s = scripted([reply(named), killTestReply(["/rules/0"])]);
    const result = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      { mode: "hooks", attemptId: "h-1", input: "my first year", platform: PLATFORM },
      new Date()
    );
    // It was OFFERED...
    expect(s.calls[0].prompt).toContain(library.name);
    // ...and the row records the version that was used (R9a), not the whole
    // library and not `[]`.
    expect(result.generation.frameworkVersions).toEqual([
      { id: library.id, version: library.version },
    ]);
  });

  it("R5c tenancy: another profile's private framework never reaches this profile's prompt", async () => {
    // Studio, because the profile cap is 1 on Free and this needs two profiles
    // in ONE workspace — the axis a workspace-only predicate would miss.
    await setTier("studio");
    await grant(200);
    const other = (await createProfile(db, owner, "Second", new Date())).id;
    await activateBrain(db, ws, other);
    const created = await createPrivateFramework(db, owner, other, {
      content: privateFrameworkContent(),
      // THE MAP UNDER TEST, used as its only production caller will use it.
      entitlement: privateFrameworkEntitlement("studio"),
    });
    // Created rows are `proposed`; only an APPROVED one is recommendable.
    const approved = await approvePrivateFramework(
      db,
      owner,
      other,
      created.id,
      privateFrameworkEntitlement("studio")
    );
    expect(approved.curatorStatus).toBe("approved");

    const s = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      { mode: "hooks", attemptId: "h-1", input: "my first year", platform: PLATFORM },
      new Date()
    );
    expect(
      s.calls[0].prompt,
      "another profile's private framework entered this profile's assembly"
    ).not.toContain(approved.name);

    // NON-VACUITY, and it is the half that makes the assertion above mean
    // something: the framework really is eligible — for its OWNER.
    await generate(
      db,
      owner,
      other,
      s.provider,
      anySlots(),
      { mode: "hooks", attemptId: "h-2", input: "my first year", platform: PLATFORM },
      new Date()
    );
    expect(s.calls[2].prompt).toContain(approved.name);
  });

  // ------------------------------------------------ REQ-I05, END TO END

  /**
   * A hooks document whose first hook names an amount, marked or bare.
   *
   * ONE FIXTURE FOR BOTH SIDES, so the only difference between the parent this
   * product stores and the revision it must refuse is the marker itself.
   */
  const amountHooks = (marked: boolean): ScriptOutput =>
    hooksOutput({
      hookTexts: [
        marked
          ? `the $4,000 ${CHECK} rig cost you the whole year`
          : "the $4,000 rig cost you the whole year",
        "the part nobody tells you about starting out",
        "why my first year looked like nothing was working",
      ],
    });

  const hookParams = (attemptId: string, input: string) => ({
    mode: "hooks" as const,
    attemptId,
    input,
    platform: PLATFORM,
  });

  it("REQ-I05: a `[check]` in the PARENT does not vouch for the bare specific in the revision", async () => {
    // THE WHOLE WIRING, not the seam: the parent is generated, gated and
    // STORED by this product, and the revision reads the parent's own
    // `kill_test` back out of the row. Deleting the `unvouchedSpecifics` call
    // in `generate.ts` — or the `stripMarkedSpecifics` strip one package over
    // — leaves the pure cases green and this one red.
    const s = scripted([
      reply(amountHooks(true)),
      killTestReply(["/rules/0"]),
      // The revision's draft and its ONE rewrite both drop the marker.
      reply(amountHooks(false)),
      reply(amountHooks(false)),
    ]);
    const parent = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      hookParams("i05-1", "hooks about the gear year"),
      new Date()
    );
    // NON-VACUITY: the marked parent really is a document this gate stores.
    expect(parent.generation.outcome).toBe("usable");

    const revision = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      {
        ...hookParams("i05-2", "make the first one sharper"),
        revisionOfAttemptId: "i05-1",
      },
      new Date()
    );
    expect(revision.generation.outcome).toBe("honest_refusal");
    expect(revision.generation.refusalReason).toContain("invented_specific");
    // Two drafts: the gate fired on the first and the rewrite did not fix it.
    expect(s.calls).toHaveLength(4);
  });

  it("...and a revision that KEEPS the marker is still accepted", async () => {
    // The other direction, end to end. A fix that refused the marked form too
    // would make `[check]` useless — and this is the case that would catch a
    // deny list built without the creator-material filter.
    const s = scripted([
      reply(amountHooks(true)),
      killTestReply(["/rules/0"]),
      reply(amountHooks(true)),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      hookParams("i05-3", "hooks about the gear year"),
      new Date()
    );
    const revision = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      {
        ...hookParams("i05-4", "make the first one sharper"),
        revisionOfAttemptId: "i05-3",
      },
      new Date()
    );
    expect(revision.generation.outcome).toBe("usable");
  });

  it("REQ-I05: a specific the parent's gate only FLAGGED does not vouch in the revision either", async () => {
    // THE SECOND CHANNEL, END TO END, and it is the one the `[check]` strip
    // does NOT cover: R-68 made `/disclosure/` flag-only BY FIELD, so this
    // amount was reported rather than traced, the parent was still stored, and
    // it used to vouch for the same amount in the revision's HOOK.
    //
    // IT IS ALSO THE ONE CASE THAT DRIVES THE WIRING. A planted mutation
    // dropping `parent.reportedSpecifics` at the call site left every other
    // case in this file green — the pure tests drive `unvouchedSpecifics` as a
    // function, and the `[check]` cases are closed inside `@respin/modes`
    // whether or not the deny list is passed at all.
    const parent = hooksOutput();
    parent.disclosure = {
      platform: PLATFORM,
      guidance:
        "say the $4,000 build was made with the help of an assistant, in the platform's own disclosure control",
    };
    const s = scripted([
      reply(parent),
      killTestReply(["/rules/0"]),
      reply(amountHooks(false)),
      reply(amountHooks(false)),
    ]);
    const stored = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      hookParams("i05-5", "hooks about the gear year"),
      new Date()
    );
    // NON-VACUITY, both halves: the parent was STORED, and its own gate
    // REPORTED the amount rather than tracing it.
    expect(stored.generation.outcome).toBe("usable");
    const reported = (
      stored.generation.killTest as {
        finalAttempt: { traceability: { token: string }[] };
      }
    ).finalAttempt.traceability.map((f) => f.token);
    expect(reported).toContain("$4,000");

    const revision = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      {
        ...hookParams("i05-6", "make the first one sharper"),
        revisionOfAttemptId: "i05-5",
      },
      new Date()
    );
    expect(revision.generation.outcome).toBe("honest_refusal");
    expect(revision.generation.refusalReason).toContain("invented_specific");
  });

  it("R5b: a PROPOSED private framework is not offered even to its owner", async () => {
    await setTier("studio");
    await grant(200);
    const created = await createPrivateFramework(db, owner, profileId, {
      content: privateFrameworkContent(),
      entitlement: privateFrameworkEntitlement("studio"),
    });
    expect(created.curatorStatus).toBe("proposed");
    const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      { mode: "hooks", attemptId: "h-1", input: "my first year", platform: PLATFORM },
      new Date()
    );
    expect(s.calls[0].prompt).not.toContain(created.name);
  });

  it("a CAPTION is offered no library at all — the mode carries no framework", async () => {
    const s = scripted([reply(captionOutput()), killTestReply(["/rules/0"])]);
    await generate(db, owner, profileId, s.provider, anySlots(), captionParams(), new Date());
    const [library] = await db
      .select()
      .from(frameworks)
      .where(eq(frameworks.visibility, "shared"))
      .limit(1);
    expect(s.calls[0].prompt).not.toContain(library.name);
    expect(s.calls[0].prompt).toContain("Frameworks available: none this time");
  });

  // ------------------------------------------- R-148 (launch L1) revisions

  it("R-148: a revision of a v2 parent KEEPS v2, its form and its limits — and costs a revision, with no extra call", async () => {
    const limits = { formChoice: "explain_opinion", constraints: { people: "solo", maxMinutes: 30 } };
    const s = scripted([
      JSON.stringify(v2Ideas(["explain_opinion"])),
      killTestReply(["/rules/0"]),
      JSON.stringify(v2Ideas(["explain_opinion"])),
      killTestReply(["/rules/0"]),
    ]);
    const parent = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ creative: limits }), new Date()
    );
    expect(parent.generation.outcome).toBe("usable");
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ attemptId: "gen-2", input: "make the second one shorter", revisionOfAttemptId: "gen-1" }),
      new Date()
    );
    expect(revision.generation.outcome).toBe("usable");
    expect(revision.generation.parentId).toBe(parent.generation.id);
    // INHERITED FROM THE STORED PARENT, not from anything the request said.
    expect((revision.generation.request as Record<string, unknown>).creative).toEqual(
      (parent.generation.request as Record<string, unknown>).creative
    );
    expect((revision.generation.output as Record<string, unknown>).contractVersion).toBe(2);
    expect((revision.generation.output as Record<string, unknown>).requestedForm).toBe("explain_opinion");
    // The revision's prompt carried the parent's form and limits.
    expect(s.calls[2].prompt).toContain("Argue one claim");
    expect(s.calls[2].prompt).toContain("The most time they have, in minutes: 30");
    // THE SAME CALL SHAPE AS ANY REVISION (draft + scoring) at the revision price.
    expect(s.calls).toHaveLength(4);
    expect(revision.creditsChargedNow).toBe(REVISION_COST);
  });

  it("R-148: a revision of a 'Choose for me' SCRIPT keeps the form that script resolved to", async () => {
    await setTier("creator");
    await grant(FULL_SCRIPT_COST + REVISION_COST);
    const s = scripted([
      JSON.stringify(v2Script("personal_story_observation")),
      killTestReply(["/rules/0"]),
      JSON.stringify(v2Script("personal_story_observation")),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ mode: "ideaToScript", creative: { formChoice: "auto" } }), new Date()
    );
    // "Choose for me" on a SCRIPT adds no call: the draft and the scoring, as
    // any script (round-1 billing Low).
    expect(s.calls).toHaveLength(2);
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({
        mode: "ideaToScript",
        attemptId: "gen-2",
        input: "tighten the opening",
        revisionOfAttemptId: "gen-1",
      }),
      new Date()
    );
    const creative = (revision.generation.request as Record<string, unknown>).creative as {
      formChoice: string;
    };
    expect(creative.formChoice).toBe("personal_story_observation");
    expect((revision.generation.output as Record<string, unknown>).requestedForm).toBe(
      "personal_story_observation"
    );
  });

  it("L2 (R-151): a revision KEEPS its parent's form — a form swap is refused before anything runs, a limits-only override runs at the revision price", async () => {
    // THE L1 CARD'S DEFERRAL, decided: a different form is a different script,
    // which is a new commission at its mode's price — never a swap priced as a
    // revision. Before L2 this override ran and charged `REVISION_COST`.
    const s = scripted([
      JSON.stringify(v2Ideas(["explain_opinion"])),
      killTestReply(["/rules/0"]),
      JSON.stringify(v2Ideas(["explain_opinion"])),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ creative: { formChoice: "explain_opinion" } }), new Date()
    );
    const callsBefore = s.calls.length;
    const debitsBefore = (await debitsOf()).length;
    const swap = await capture(() =>
      generate(
        db, owner, profileId, never(), anySlots(),
        formParams({
          attemptId: "gen-2",
          input: "try it as a demonstration",
          revisionOfAttemptId: "gen-1",
          creative: { formChoice: "demonstration_experiment" },
        }),
        new Date()
      )
    );
    expect(swap).toBeInstanceOf(CreativeRequestError);
    expect((swap as CreativeRequestError).reason).toBe("revision_keeps_form");
    expect(s.calls.length).toBe(callsBefore);
    expect((await debitsOf()).length).toBe(debitsBefore);
    expect(
      (await db.select().from(generationAttempts)).map((a) => a.attemptId)
    ).not.toContain("gen-2");
    // THE SAME FORM WITH NEW LIMITS is the same piece made easier to film: it
    // runs, as a revision, at the revision price.
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({
        attemptId: "gen-3",
        input: "make it quicker to film",
        revisionOfAttemptId: "gen-1",
        creative: { formChoice: "explain_opinion", constraints: { maxMinutes: 30 } },
      }),
      new Date()
    );
    expect(revision.generation.outcome).toBe("usable");
    expect(revision.creditsChargedNow).toBe(REVISION_COST);
    expect((revision.generation.output as Record<string, unknown>).requestedForm).toBe(
      "explain_opinion"
    );
  });

  it("R-148: a revision of a LEGACY parent stays legacy — and an override is refused before anything runs", async () => {
    const s = scripted([
      JSON.stringify(legacyIdeas()),
      killTestReply(["/rules/0"]),
      JSON.stringify(legacyIdeas()),
      killTestReply(["/rules/0"]),
    ]);
    await generate(db, owner, profileId, s.provider, anySlots(), formParams(), new Date());
    // The override: refused, with the closed reason, before the claim.
    const err = await capture(() =>
      generate(
        db, owner, profileId, never(), anySlots(),
        formParams({
          attemptId: "gen-2",
          input: "make it a story",
          revisionOfAttemptId: "gen-1",
          creative: { formChoice: "personal_story_observation" },
        }),
        new Date()
      )
    );
    expect(err).toBeInstanceOf(CreativeRequestError);
    expect((err as CreativeRequestError).reason).toBe("revision_keeps_legacy_format");
    expect((await attemptsOf()).map((a) => a.attemptId)).toEqual(["gen-1"]);
    // Without an override it runs, as legacy: no stamp, no creative half.
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ attemptId: "gen-3", input: "make it shorter", revisionOfAttemptId: "gen-1" }),
      new Date()
    );
    expect(revision.generation.outcome).toBe("usable");
    expect("contractVersion" in (revision.generation.output as object)).toBe(false);
    expect((revision.generation.request as Record<string, unknown>).creative).toBeNull();
  });

  it("R-148 / REQ-I05: the PARENT's own words can never become a revision's 'material' basis", async () => {
    // The parent invented an event and honestly marked it [check]. The revision
    // then QUOTES that invented event as if it were the creator's material —
    // exactly the laundering the basis corpus blanks the parent draft to stop.
    const invented = "you drop the camera into the sink on the first take [check]";
    const parentDoc = v2Ideas(["personal_story_observation"], {
      0: {
        premise: {
          whatHappens: invented,
          interest: "everyone has kept going on a shoot they should have stopped",
          payoff: "the take worth keeping comes after checking the dial",
          basis: { kind: "unconfirmed" },
        },
      },
    });
    const launders = v2Ideas(["personal_story_observation"], {
      0: {
        premise: {
          whatHappens: "you drop the camera into the sink on the first take",
          interest: "everyone has kept going on a shoot they should have stopped",
          payoff: "the take worth keeping comes after checking the dial",
          basis: { kind: "material", excerpt: "drop the camera into the sink on the first take" },
        },
      },
    });
    const s = scripted([
      JSON.stringify(parentDoc),
      killTestReply(["/rules/0"]),
      JSON.stringify(launders),
      JSON.stringify(launders),
    ]);
    const parent = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ creative: { formChoice: "personal_story_observation" } }), new Date()
    );
    expect(parent.generation.outcome).toBe("usable");
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ attemptId: "gen-2", input: "make the first one punchier", revisionOfAttemptId: "gen-1" }),
      new Date()
    );
    // NON-VACUITY: the quote really IS in the revision's prompt, inside the
    // parent draft — so the traceability corpus saw it, and only the basis
    // corpus refused to count it.
    expect(s.calls[2].prompt).toContain("drop the camera into the sink on the first take");
    expect(revision.generation.outcome).toBe("honest_refusal");
    expect(revision.generation.refusalReason).toContain("unsupported_experience");
  });

  it("R-148 round 1 (compliance BLOCK, revision half): a revision that RELABELS a parent's [check]ed event and drops the marker is refused", async () => {
    await grant(10);
    const parentEvent = "you drop the camera into the sink on the first take [check]";
    const parentDoc = v2Ideas(["personal_story_observation"], {
      0: {
        premise: {
          whatHappens: parentEvent,
          interest: "everyone has kept going on a shoot they should have stopped",
          payoff: "the take worth keeping comes after checking the dial",
          basis: { kind: "unconfirmed" },
        },
      },
    });
    // The revision calls it an opinion, says the event in the PRESENT tense —
    // which no tense-based shape can see — and drops the [check].
    const relabelled = v2Ideas(["explain_opinion"], {
      0: {
        premise: {
          whatHappens: "you drop the camera into the sink on the first take",
          interest: "everyone has kept going on a shoot they should have stopped",
          payoff: "the take worth keeping comes after checking the dial",
          basis: { kind: "none" },
        },
      },
    });
    const s = scripted([
      JSON.stringify(parentDoc),
      killTestReply(["/rules/0"]),
      JSON.stringify(relabelled),
      JSON.stringify(relabelled),
    ]);
    const parent = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ creative: { formChoice: "auto" } }), new Date()
    );
    expect(parent.generation.outcome).toBe("usable");
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ attemptId: "gen-2", input: "make the first one punchier", revisionOfAttemptId: "gen-1" }),
      new Date()
    );
    expect(revision.generation.outcome).toBe("honest_refusal");
    expect(revision.generation.refusalReason).toContain("unsupported_experience");
    // Stored on the kill test; the client-facing reason quotes nothing of the refused draft.
    expect(JSON.stringify((revision.generation.killTest as { finalAttempt: { hardRules: unknown } }).finalAttempt.hardRules)).toContain("the draft this revises marked this unconfirmed");
    // THE MONEY OF IT (billing round 2, Note C): the parent's draft and its
    // scoring, then the revision's draft and its ONE rewrite — no scoring call
    // for a refusal — and the refusal is charged at the revision price.
    expect(s.calls).toHaveLength(4);
    expect(revision.creditsChargedNow).toBe(REVISION_COST);
  });

  it("R-148 round 1 (tenancy Medium): a revision may not quote this product's own SCAFFOLD as the creator's words — each sentence of it", async () => {
    await grant(20);
    const s = scripted([
      JSON.stringify(v2Ideas(["personal_story_observation"])),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ creative: { formChoice: "auto" } }), new Date()
    );
    // NON-VACUITY: every scaffold quote below really is in the revision's
    // composed input (so the traceability corpus sees it) — only the basis
    // corpus, built from the creator's own note, refuses it.
    const composed = revisionInput("make the first one punchier", "D").toLowerCase();
    const scaffold = [
      "a revision of a draft you produced earlier",
      "what the creator asked to change",
      "rewrite it to answer the note above",
    ];
    for (const [i, excerpt] of scaffold.entries()) {
      expect(composed, excerpt).toContain(excerpt);
      const quoting = v2Ideas(["personal_story_observation"], {
        0: {
          premise: {
            whatHappens: `you ${excerpt} and keep going`,
            interest: "everyone has kept going on a shoot they should have stopped",
            payoff: "the take worth keeping comes after checking the dial",
            basis: { kind: "material", excerpt },
          },
        },
      });
      const r = scripted([JSON.stringify(quoting), JSON.stringify(quoting)]);
      const revision = await generate(
        db, owner, profileId, r.provider, anySlots(),
        formParams({
          attemptId: `scaffold-${i}`,
          input: "make the first one punchier",
          revisionOfAttemptId: "gen-1",
        }),
        new Date()
      );
      expect(revision.generation.outcome, excerpt).toBe("honest_refusal");
      expect(
        JSON.stringify((revision.generation.killTest as { finalAttempt: { hardRules: unknown } }).finalAttempt.hardRules),
        excerpt
      ).toContain("not in your brain or in what you gave this generation");
      // Billing round 2, Note C: one draft and its one rewrite, no scoring
      // call, charged at the revision price.
      expect(r.calls, excerpt).toHaveLength(2);
      expect(revision.creditsChargedNow, excerpt).toBe(REVISION_COST);
    }
  });

  it("R-148: ...whereas a basis the PARENT's gate verified is carried, so a kept story keeps its quote", async () => {
    const s = scripted([
      JSON.stringify(v2Ideas(["personal_story_observation"])),
      killTestReply(["/rules/0"]),
      JSON.stringify(v2Ideas(["personal_story_observation"])),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ creative: { formChoice: "personal_story_observation" } }), new Date()
    );
    // The NOTE does not repeat the quote, and the parent draft is blanked out
    // of the basis corpus — so the only thing that can vouch for it is the
    // parent's own verified excerpt, carried.
    const note = "make the first one punchier";
    expect(note).not.toContain(FORM_EXCERPT);
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ attemptId: "gen-2", input: note, revisionOfAttemptId: "gen-1" }),
      new Date()
    );
    expect(revision.generation.outcome).toBe("usable");
  });

  // ---------------------------------------------- launch L3 (R-152)

  it("L3: a revision's PARENT is material, never history — excluded and recorded as such — while the creator's REACTION to it is still sent as a labelled note", async () => {
    await grant(100);
    const s = scripted([
      JSON.stringify(legacyIdeas()),
      killTestReply(["/rules/0"]),
      JSON.stringify(legacyIdeas()),
      killTestReply(["/rules/0"]),
    ]);
    const parent = await generate(
      db, owner, profileId, s.provider, anySlots(), formParams({ attemptId: "p-1" }), new Date()
    );
    const [reaction] = await db
      .insert(generationFeedback)
      .values({
        profileId,
        workspaceId: ws,
        generationId: parent.generation.id,
        reaction: "too_generic",
        note: "these could be anyone's",
      })
      .returning();
    const revision = await generate(
      db, owner, profileId, s.provider, anySlots(),
      formParams({ attemptId: "r-1", input: "make them about my own shoots", revisionOfAttemptId: "p-1" }),
      new Date()
    );
    expect(revision.generation.parentId).toBe(parent.generation.id);
    const snap = (await attemptsOf()).find((a) => a.attemptId === "r-1")!.requestSnapshot as {
      recentContext: {
        records: { kind: string; id: string; labels: string[] }[];
        exclusions: { kind: string; id: string; reason: string }[];
      };
    };
    // THE PARENT IS NOT SENT TWICE: it is the revision's material, so it is an
    // `already_material` exclusion and never a draft record.
    expect(snap.recentContext.exclusions).toContainEqual({
      kind: "draft",
      id: parent.generation.id,
      reason: "already_material",
    });
    expect(snap.recentContext.records.some((r) => r.id === parent.generation.id)).toBe(false);
    // ...but the creator's reaction to it IS — the most relevant correction a
    // revision can have — as a note, under its reaction label.
    expect(snap.recentContext.records).toContainEqual(
      expect.objectContaining({ kind: "note", id: reaction.id, labels: ["rejected_too_generic"] })
    );
    const prompt = s.calls[2].prompt;
    expect(prompt).toContain("these could be anyone's");
    // The parent draft still reaches the revision exactly as before (its input).
    expect(prompt).toContain(legacyIdeas().ideas[0].thesis);
  });
});

// ------------------------------------------- the residual, MEASURED not assumed

describe("what a revision's traceability corpus gains, and what it does NOT (REQ-I03/I05)", () => {
  // PURE — no database. The claim under test is a property of the composed
  // input, and it is here rather than in a comment because `generate.ts`
  // STATES it and a stated property with no test is a hope.
  //
  // WHAT THIS BLOCK USED TO CLAIM, AND WHY IT WAS REWRITTEN (spin-compliance
  // gate, 2026-09-01). It asserted that a revision "widens the corpus by
  // exactly one document — the one this product already gated and stored", and
  // drove that with a parent the gate WOULD NEVER HAVE STORED: the very same
  // document, run as an original one case earlier, is REFUSED. So the claim
  // that mattered had no witness, and the one path by which a parent
  // legitimately carries a hard-shaped specific — the `[check]` marker the
  // model is INSTRUCTED to write — was the path nothing covered. Every parent
  // below is a document this product's own gate accepts, asserted here rather
  // than assumed.
  const BRAIN = ["register: plain and direct, like talking to one person"];
  const context = (
    input: string,
    unvouched: readonly string[] = []
  ): GenerationContext => ({
    universalLaws: UNIVERSAL_LAWS,
    frameworks: [],
    brain: { voice: BRAIN, strategy: [], killtest: [] },
    input,
    platform: PLATFORM,
    unvouchedSpecifics: unvouched,
    creative: null,
    recentWork: null,
  });

  const findingsFor = (
    output: ScriptOutput,
    input: string,
    unvouched: readonly string[] = []
  ) => runKillTest({ output, mode: "hooks", context: context(input, unvouched) });

  const invented = (
    output: ScriptOutput,
    input: string,
    unvouched: readonly string[] = []
  ) =>
    findingsFor(output, input, unvouched).hardRules.filter(
      (f) => f.rule === "invented_specific"
    );

  /** A hooks document whose first hook is whatever is passed. */
  const withHook = (text: string): ScriptOutput =>
    hooksOutput({
      hookTexts: [
        text,
        "the part nobody tells you about starting out",
        "why my first year looked like nothing was working",
      ],
    });

  /**
   * The REVISION as `generate` composes it: the note and the parent's draft,
   * plus the deny list `generate` derives from the parent's stored findings.
   *
   * IT GOES THROUGH THE REAL `unvouchedSpecifics` rather than a hand-written
   * list, because that filter is the half that decides whether an honest draft
   * gets refused, and a test that supplied the answer would not be driving it.
   */
  const asRevisionOf = (
    parent: ScriptOutput,
    parentInput: string,
    revisionNote: string
  ) => {
    const reported = findingsFor(parent, parentInput).traceability.map(
      (f) => f.token
    );
    return {
      input: revisionInput(revisionNote, renderDraft(parent)),
      unvouched: unvouchedSpecifics(
        { brain: BRAIN, input: [revisionNote, PLATFORM] },
        reported
      ),
    };
  };

  // A CURRENCY, not a bare number: `traceability.ts` enforces `plain-number`
  // and `proper-noun` as FLAG (a bare integer is a step number or a list
  // length, and refusing there charges a creator for an honest listicle) and
  // only dates, currency, percentages and multipliers as HARD. A case written
  // on a place name would find nothing and prove nothing.
  const AMOUNT = "$4,000";
  const MARKED_HOOK = "the " + AMOUNT + " " + CHECK + " rig cost you the whole year";
  const BARE_HOOK = "the " + AMOUNT + " rig cost you the whole year";
  const NOTE = "make the first one sharper";

  it("NON-VACUITY: the bare specific is refused in an ORIGINAL", () => {
    expect(invented(withHook(BARE_HOOK), NOTE).length).toBeGreaterThan(0);
  });

  it("a `[check]`-MARKED parent is a document this gate really would have stored", () => {
    // THE FIXTURE'S OWN LICENCE, and the thing the old block never checked:
    // the marked hook passes as an ORIGINAL, so a parent carrying it is a
    // parent this product would accept, settle and store.
    const findings = findingsFor(withHook(MARKED_HOOK), NOTE);
    expect(findings.hardRules).toEqual([]);
    expect(findings.traceability).toEqual([]);
  });

  it("...and its MARKER does not vouch for the same specific in the revision", () => {
    // REQ-I05. Before the fix this was `hardRules: []` and `traceability: []`
    // — the amount displayed as a traced specific, under the sentence "Every
    // number, date and name in this draft was found in your brain or in what
    // you typed in." A `[check]` is the model's own statement that the
    // material does NOT carry the specific; it is the one token that can never
    // put it into the corpus.
    const revision = asRevisionOf(withHook(MARKED_HOOK), NOTE, NOTE);
    expect(
      invented(withHook(BARE_HOOK), revision.input, revision.unvouched).length
    ).toBeGreaterThan(0);
  });

  it("...and the marker still clears the specific it sits BESIDE, in the revision too", () => {
    // The opposite direction, because a fix that refused the marked form as
    // well would have made `[check]` useless — `REWRITE_INSTRUCTION` tells the
    // model to write exactly this.
    const revision = asRevisionOf(withHook(MARKED_HOOK), NOTE, NOTE);
    expect(
      invented(withHook(MARKED_HOOK), revision.input, revision.unvouched)
    ).toEqual([]);
  });

  it("a specific the parent's scan FLAGGED BY FIELD does not vouch either", () => {
    // The second channel, and it is not the `[check]` one: R-68 made the whole
    // `/disclosure/` section flag-only BY FIELD, so a currency written there
    // is reported whatever its shape and was never traced to anything. The
    // parent still passed the gate — asserted on the next line — and that
    // amount used to vouch for the same amount in the revision's HOOK.
    // A HOOK THAT IS NOT ONE OF THE OTHER TWO. It used to be the literal text
    // of `withHook`'s SECOND hook, which made this parent a hook set with the
    // same sentence twice — a document `checkHookSpread` refuses outright as
    // of the round-2 identity fix, so it could not have been "a document this
    // gate really would have stored". The amount under test is in the
    // DISCLOSURE, so any clean first hook serves.
    const parent = withHook("nobody warns you how quiet the first year is");
    parent.disclosure = {
      platform: PLATFORM,
      guidance:
        "say it cost " +
        AMOUNT +
        " to make, in the platform's own disclosure control",
    };
    const parentFindings = findingsFor(parent, NOTE);
    expect(parentFindings.hardRules).toEqual([]);
    expect(parentFindings.traceability.map((f) => f.enforcement)).toContain(
      "flag"
    );
    const revision = asRevisionOf(parent, NOTE, NOTE);
    expect(
      invented(withHook(BARE_HOOK), revision.input, revision.unvouched).length
    ).toBeGreaterThan(0);
  });

  it("THE WIDENING THAT REMAINS: a specific the parent's scan CLEARED still vouches", () => {
    // This is the residual, stated as narrowly as it is true. The parent's own
    // INPUT carried the amount, so the parent's scan reported nothing about
    // it; the revision's note does not repeat it, and it is still accepted.
    // That is deliberate — the creator supplied it once — and it is the whole
    // of what a revision's corpus gains.
    const parentInput = "i spent " + AMOUNT + " on the rig in my first year";
    const parent = withHook(BARE_HOOK);
    expect(findingsFor(parent, parentInput).hardRules).toEqual([]);
    const revision = asRevisionOf(parent, parentInput, NOTE);
    expect(
      invented(withHook(BARE_HOOK), revision.input, revision.unvouched)
    ).toEqual([]);
  });

  it("the FILTER never denies a specific the creator typed in their own note", () => {
    // THE INVERSION THIS FIX COULD HAVE CAUSED, written as a test rather than
    // as a hope: `buildCorpusIndex` deletes `unvouched` tokens globally, so a
    // filter that let through one the creator's own note carries would refuse
    // a draft its author supplied the number for — a rewrite, and possibly a
    // debited refusal, on honest work.
    expect(
      unvouchedSpecifics(
        { brain: BRAIN, input: ["i spent " + AMOUNT + " on it", PLATFORM] },
        [AMOUNT]
      )
    ).toEqual([]);
    expect(
      unvouchedSpecifics({ brain: ["the rig cost " + AMOUNT], input: [] }, [
        AMOUNT,
      ])
    ).toEqual([]);
    // ...and it DOES deny one that nothing of the creator's carries.
    expect(
      unvouchedSpecifics({ brain: BRAIN, input: [NOTE, PLATFORM] }, [AMOUNT])
    ).toEqual([AMOUNT]);
  });

  it("a specific NEITHER the note NOR the parent said is still refused", () => {
    // THE BOUND ON THE RESIDUAL, unchanged: a revision does not switch the
    // scan off.
    const revision = asRevisionOf(hooksOutput(), NOTE, NOTE);
    expect(
      invented(withHook(BARE_HOOK), revision.input, revision.unvouched).length
    ).toBeGreaterThan(0);
  });

  it("`reportedSpecificsOf` fails CLOSED on a kill_test this build cannot read", () => {
    // `kill_test` is jsonb written by whatever build settled the parent, and a
    // silent `[]` here would not be a smaller answer — it would be the WRONG
    // one, saying "the parent's scan reported nothing", which is exactly the
    // sentence that lets a never-traced specific vouch for the revision.
    expect(reportedSpecificsOf({ finalAttempt: { traceability: [] } })).toEqual(
      []
    );
    expect(
      reportedSpecificsOf({
        finalAttempt: { traceability: [{ token: AMOUNT }] },
      })
    ).toEqual([AMOUNT]);
    for (const unreadable of [
      {},
      { finalAttempt: null },
      { finalAttempt: { traceability: "none" } },
      { finalAttempt: { traceability: [{ shape: "currency" }] } },
    ]) {
      expect(() => reportedSpecificsOf(unreadable)).toThrow(RevisionParentError);
    }
  });
});

// --------------------------------------------------------------------- utils

/** Run and return what it threw, so two refusals can be compared. */
async function capture(run: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await run();
  } catch (e) {
    return e as Error;
  }
  return undefined;
}


/** A mechanism-level private framework: no handle, no link, no metric, no name. */
function privateFrameworkContent() {
  return {
    name: "The Quiet Ladder",
    beats: [
      "Open on the smallest visible step.",
      "Show the step being taken, not described.",
      "Name what the step made possible.",
    ],
    whyItConverts:
      "A step small enough to copy is a step a viewer believes, and belief is what makes them stay for the second one.",
    applicability: [
      {
        goal: "follows" as const,
        niche: "any" as const,
        note: "Needs a step the creator has actually taken.",
      },
    ],
    sourceReferences: [{ kind: "internal_autopsy" as const, ref: "corpus-batch-0" }],
    evidenceEntries: [
      {
        kind: "internal_autopsy" as const,
        ref: "corpus-batch-0",
        observation: "One piece built this way held its audience to the last step.",
      },
    ],
    testedCaveats: ["A step too large to copy reads as a boast."],
    saturation: "observed" as const,
  };
}

/**
 * An ACTIVE coherent brain, written raw — `generate.test.ts`'s fixture, for its
 * reason: this file's subject is lineage and money, not slice 3b's lifecycle.
 */
async function activateBrain(
  db: TestDb,
  workspaceId: string,
  profileId: string
): Promise<void> {
  const evidence = [
    {
      field: "/register",
      quote: "c",
      inputId: "00000000-0000-4000-8000-000000000001",
      startUtf16: 0,
      endUtf16: 1,
    },
  ];
  const confirmed = {
    confirmedAt: new Date(),
    confirmedContentSha256: "0".repeat(64),
    activatedAt: new Date(),
  };
  const [voice] = await db
    .insert(brainDocs)
    .values({
      profileId,
      workspaceId,
      kind: "voice",
      version: 1,
      content: {
        register: "plain and direct, like talking to one person",
        sentenceRhythm: "short lines, then one long one",
        signatureMoves: ["opens on the thing that went wrong"],
        avoid: ["never uses hype words"],
      },
      reason: "Version 1: you edited this document.",
      sourceEvidence: evidence,
      status: "active",
      ...confirmed,
    })
    .returning();
  const [killtest] = await db
    .insert(brainDocs)
    .values({
      profileId,
      workspaceId,
      kind: "killtest",
      version: 1,
      content: { rules: ["it must not sound like an advert"] },
      reason: "Version 1: you edited this document.",
      sourceEvidence: evidence,
      status: "active",
      ...confirmed,
    })
    .returning();
  await db.insert(brainActivationSnapshots).values({
    profileId,
    workspaceId,
    voiceDocId: voice.id,
    killtestDocId: killtest.id,
  });
}

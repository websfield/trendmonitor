// `generate` — THE ORDER IS THE REQUIREMENT, AND SO IS QUESTION 4'S TABLE
// (slice 6, stage C).
//
// THE INSTRUMENT THIS FILE IS BUILT ON, inherited from `inference.test.ts`:
// every pre-call gate is proved with a provider whose `complete` THROWS IF
// INVOKED. The evidence that nothing reached the vendor is then the stub's own
// refusal, not an assertion about a spy's call count — a spy proves "we did not
// observe a call", this proves "a call would have failed the test". That is
// only possible because `generate` takes its provider as a PARAMETER.
//
// AND THE SECOND INSTRUMENT, WHICH IS NEW HERE: several cases hand in a
// provider that QUERIES THE DATABASE from inside `complete`. R14's whole claim
// is "a durable row is committed BEFORE outbound HTTP", and the only way to
// assert an ORDERING between a commit and an HTTP call is to look at the
// database from inside the call. Asserting the row's existence afterwards
// cannot tell "committed before" from "committed after".
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  brainActivationSnapshots,
  brainDocs,
  autopsies,
  createTrendSource,
  CONFIG_V1_SEED,
  createTestDb,
  creditLedger,
  ensureUserWorkspace,
  generationAttempts,
  generations,
  modelUsage,
  seedAuthUser,
  subscriptions,
  seedDb,
  recordSharedTrendItem,
  recordSharedTrendTranscript,
  withWorkspace,
  mintProfileScope,
  type TestDb,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { REFERENCE_BLOCK_HEADER } from "@respin/modes";
import {
  LlmRateLimitedError,
  LlmSchemaInvalidError,
  LlmTruncatedError,
  type InferenceRequest,
  type LlmProvider,
} from "@respin/llm";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { recordPauseStart } from "../src/pause";
import { generate, GENERATION_REFUSAL_CODES } from "../src/generate";
import { GENERATION_PURPOSE } from "../src/inference";
import {
  BrainNotActivatedError,
  GenerationAlreadyRefusedError,
  GenerationInFlightError,
  GenerationPayloadMismatchError,
  GenerationRecoveryRequiredError,
  GenerationUnchargedAttemptCapError,
  GenerationUnchargedCostCapError,
  InsufficientCreditsError,
  PostCallDebitError,
  WorkspacePausedError,
} from "../src/errors";
import { ModeNotInPlanError } from "../src/mode-access";
import {
  setFrameworkOfferDroppedMetricSink,
  setUnchargedAttemptCapMetricSink,
  type FrameworkOfferDroppedMetric,
  type UnchargedAttemptCapMetric,
} from "../src/metrics";
import { InferenceRoleError, ProfileArchivedError, RunSlotBusyError } from "../src/inference";
import { anySlots, refusing } from "./support/run-slots";
import { dbThatFailsWhen, dbThatRunsBefore } from "./support/crash-db";
import {
  PLATFORM,
  hooksOutput,
  killTestReply,
  longHookOutput,
  reply,
} from "./support/generation-fixtures";

// FROM THE SEED, NOT A LITERAL (billing gate, 2026-09-01). This mirrored the
// seeded number as a `2`, so an operator changing the price in `CONFIG_V1_SEED`
// would leave this file asserting the old one — a money test agreeing with
// itself. `free-mint.test.ts` already reads its allowance this way; this is the
// same rule on the same kind of number.
const HOOK_SET_COST = CONFIG_V1_SEED.creditCosts.hookSet;
const SPIN_COST = CONFIG_V1_SEED.creditCosts.spin;

const params = (over: Partial<{ attemptId: string; input: string }> = {}) => ({
  mode: "hooks" as const,
  attemptId: over.attemptId ?? "gen-1",
  input: over.input ?? "i want to talk about what my first year actually looked like",
  platform: PLATFORM,
});

const SPIN_REFERENCE = {
  hookMechanic: "open on a visible renovation regret",
  beats: [
    "show the cabinet-paint shortcut",
    "turn on the hidden preparation cost",
    "return to the weekend constraint",
  ],
  ending: "name the preparation step that would have prevented the regret",
  followTrigger: "compare one slower preparation choice",
  subjectTerms: ["kitchen renovation", "cabinet paint", "weekend makeover"],
  hook: "I painted my kitchen cabinets in one weekend and regret every shortcut",
  structure: { beatCount: 3, turnBeat: 1 },
} as const;

const spinParams = (spinAutopsyId?: string, attemptId = "spin-1") => ({
  mode: "analyseAndSpin" as const,
  attemptId,
  input: "Turn this autopsy into an original filming lesson.",
  platform: PLATFORM,
  spinAutopsyId,
});

const nearCopySpinOutput = () =>
  JSON.stringify({
    thesis: {
      statement: "You lose more takes to a setting you never checked than to nerves",
      why: "the footage from today shows the same lens change failing twice",
    },
    framework: { name: "cost reveal", why: "the cost is the reshoot nobody sees" },
    hooks: [
      { text: SPIN_REFERENCE.hook, mechanic: "cold open" },
      { text: "The setting you skipped is the one your viewer notices first", mechanic: "cost reveal" },
      { text: "Nobody tells you the boring part is where the work happens", mechanic: "withheld detail" },
    ],
    beats: [
      { atSeconds: 0, vo: "open on the take that failed and say why you kept it", isTurn: false },
      { atSeconds: 6, vo: "here is the dial nobody checks before a lens change", isTurn: true },
      { atSeconds: 14, vo: "show the same shot again with the dial set correctly", isTurn: false },
      { atSeconds: 20, vo: "keep the one take that proves the point", isTurn: false },
    ],
    shotMap: [
      { beatIndex: 0, shot: "wide handheld of the take that failed", note: "keep the room audio" },
      { beatIndex: 1, shot: "close on the dial", note: "hold it long enough to read" },
    ],
    onScreenText: [
      { atSeconds: 1, text: "the take that failed" },
      { atSeconds: 7, text: "the dial nobody checks" },
    ],
    caption: { text: "The reshoot nobody sees is the one that costs you the whole day.", hashtags: ["filmmaking", "solocreator"] },
    whyThisPerforms: {
      reasoning: "It opens on a cost the viewer already recognises and then hands them one thing to copy today.",
      weakestPoint: "None of this has been checked against how your own audience actually behaves.",
    },
    disclosure: { platform: "youtube", guidance: "Say in the description that a tool helped draft this, in your own words." },
  });

/** The instrument: a provider that fails the test if it is ever reached. */
const never = (): LlmProvider => ({
  vendor: "must-not-be-called",
  complete: async () => {
    throw new Error(
      "THE VENDOR WAS CALLED. A gate that is supposed to run BEFORE the model call did not."
    );
  },
});

/** A provider that answers with a scripted sequence of replies. */
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

const throwing = (e: Error): LlmProvider => ({
  vendor: "stub",
  complete: async () => {
    throw e;
  },
});

describe("generate", () => {
  let db: TestDb;
  let ws: VerifiedWorkspaceId;
  let owner: WorkspaceScope;
  let profileId: string;
  let rightsSubjectUserId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedDb(db);
    rightsSubjectUserId = (await ensureUserWorkspace(db, { authUserId: "user_a", name: "W" })).user.id;
    owner = await withWorkspace(db, { authUserId: "user_a" });
    ws = owner.workspaceId;
    const profile = await createProfile(db, owner, "Anna", new Date());
    profileId = profile.id;
  });

  /**
   * An ACTIVE coherent brain, written raw.
   *
   * RAW RATHER THAN THROUGH `writeBrainDoc`/`activateBrainDocCoherent`, and the
   * reason is scope: this file's subject is the money path, and driving the
   * whole confirm-then-activate lifecycle here would make every case in it
   * depend on slice 3b's. The lifecycle has its own suites; what this file
   * needs is the STATE they produce.
   */
  async function activateBrain(
    over: { rules?: string[] } = {}
  ): Promise<string> {
    return (await activateBrainDetail(over)).snapshotId;
  }

  /**
   * The same fixture, returning the ids as well — for the cases that assert
   * WHICH documents the prompt was built from.
   *
   * THE SNAPSHOT NAMES ITS DOCUMENTS, which it did not before 2026-09-01 and
   * which `activateBrainDocCoherent` has always done. That omission was
   * invisible while `generate` read "whatever is active"; it is load-bearing
   * now that `generate` reads the documents its recorded snapshot names, and a
   * snapshot naming nothing is a brain of no sentences.
   */
  async function activateBrainDetail(
    over: { rules?: string[] } = {}
  ): Promise<{ snapshotId: string; voiceDocId: string; killtestDocId: string }> {
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
        workspaceId: ws,
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
        workspaceId: ws,
        kind: "killtest",
        version: 1,
        content: { rules: over.rules ?? ["it must not sound like an advert"] },
        reason: "Version 1: you edited this document.",
        sourceEvidence: evidence,
        status: "active",
        ...confirmed,
      })
      .returning();
    const [snapshot] = await db
      .insert(brainActivationSnapshots)
      .values({
        profileId,
        workspaceId: ws,
        voiceDocId: voice.id,
        killtestDocId: killtest.id,
      })
      .returning();
    return {
      snapshotId: snapshot.id,
      voiceDocId: voice.id,
      killtestDocId: killtest.id,
    };
  }

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

  /**
   * Move this workspace onto a paid tier THROUGH THE ONE AUTHORITY.
   *
   * `getWorkspaceBillingState` resolves the tier from a live `subscriptions`
   * row plus the config's `stripePriceMap`, so both halves are written — a
   * subscription with an unmapped price resolves to FREE, which is the exact
   * trap `free-mint.test.ts` records.
   */
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

  async function sharedSpinAutopsy(): Promise<string> {
    const source = await createTrendSource(db, {
      kind: "youtube",
      externalId: "spin-shared-source",
      sourceUrl: "https://example.test/spin-shared-source",
    });
    const item = await recordSharedTrendItem(db, {
      sourceId: source.id,
      externalVideoId: "spin-shared-video",
      niche: "filmmaking",
      title: "A permitted shared reference",
      channelId: "spin-shared-channel",
      videoViews: 2_000n,
      channelMedianRecentViews: "1000",
      baselineSampleSize: 1,
      baselineObservationIds: ["spin-shared-baseline"],
      baselineWindowStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      baselineWindowEndsAt: new Date("2026-01-31T00:00:00.000Z"),
      sourcePublishedAt: new Date("2026-01-15T00:00:00.000Z"),
      transcriptState: "transcript_required",
      saturation: "unmeasured",
      saturationUnmeasuredReason: "incomplete_provenance",
    });
    const transcript = await recordSharedTrendTranscript(db, {
      trendItemId: item.id,
      content: "Reference transcript is available through the scoped reader.",
      rightsSubjectUserId,
      provenance: {
        provider: "youtube_creator_owned_oauth",
        sourceReference: "https://www.youtube.com/watch?v=spin-shared-video",
        sharedAnalysisRightsBasis: "creator_owned_caption_consent",
        consentEvidenceId: "spin-shared-consent",
      },
    });
    const [autopsy] = await db
      .insert(autopsies)
      .values({
        trendItemId: item.id,
        contentDigest: transcript.contentDigest,
        analysisVersion: "spin-v1",
        rightsScope: "shared_analysis",
        rightsBasis: transcript.rightsBasis,
        rightsSubjectUserId: transcript.rightsSubjectUserId,
        rightsEvidenceId: transcript.rightsEvidenceId,
        status: "completed",
        analysis: SPIN_REFERENCE,
      })
      .returning();
    return autopsy.id;
  }

  const attemptsOf = () =>
    db.select().from(generationAttempts).where(eq(generationAttempts.workspaceId, ws));
  const attemptRow = async (attemptId = "gen-1") =>
    (
      await db
        .select()
        .from(generationAttempts)
        .where(eq(generationAttempts.attemptId, attemptId))
    )[0];
  const usageOf = () =>
    db.select().from(modelUsage).where(eq(modelUsage.workspaceId, ws));
  const debitsOf = () =>
    db
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.workspaceId, ws), eq(creditLedger.kind, "debit")));

  // ------------------------------------------------------------ THE ORDER
  //
  // One case per gate, each driving the gate's FALSE branch with a provider
  // that throws if reached — CLAUDE.md 2026-08-29: a refusal with no witness is
  // not a guard.

  it("1-2. a VIEWER cannot generate, and no vendor is reached", async () => {
    await activateBrain();
    await db
      .update((await import("@respin/db")).memberships)
      .set({ role: "viewer" })
      .where(eq((await import("@respin/db")).memberships.workspaceId, ws));
    const viewer = await withWorkspace(db, { authUserId: "user_a" });
    await expect(
      generate(db, viewer, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(InferenceRoleError);
    expect(await attemptsOf()).toHaveLength(0);
  });

  it("3. an ARCHIVED profile refuses, before the vendor", async () => {
    await activateBrain();
    const { creatorProfiles } = await import("@respin/db");
    await db
      .update(creatorProfiles)
      .set({ state: "archived" })
      .where(eq(creatorProfiles.id, profileId));
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(ProfileArchivedError);
    expect(await attemptsOf()).toHaveLength(0);
  });

  it("4. a PAUSED workspace refuses, before the vendor (REQ-G08)", async () => {
    await activateBrain();
    await db.transaction((tx) =>
      recordPauseStart(
        tx,
        ws,
        new Date(),
        new Date(Date.now() + 30 * 86400_000),
        new Date()
      )
    );
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    expect(await attemptsOf()).toHaveLength(0);
  });

  it("5. R18: the mode gate distinguishes an unknown mode from plan exclusion", async () => {
    await activateBrain();
    // A string that is not one of the seven is not a plan question at all —
    // telling someone their plan excludes `fullScript` would be a false
    // statement about their plan.
    await expect(
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        { ...params(), mode: "fullScript" as never },
        new Date()
      )
    ).rejects.toThrow(/not one of this product's modes/);
    // ...and `ideaToScript` IS a real mode id that Free does not include.
    await expect(
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        { ...params(), mode: "ideaToScript" },
        new Date()
      )
    ).rejects.toBeInstanceOf(ModeNotInPlanError);

    expect(await attemptsOf()).toHaveLength(0);
  });

  it("6. R16: the uncharged-billable bound refuses before the vendor, on its OWN purpose", async () => {
    await activateBrain();
    const { content } = await getActiveConfig(db);
    const cap = content.generation.maxUnchargedBillableAttempts;
    for (let i = 0; i < cap; i++) {
      await db.insert(modelUsage).values({
        profileId,
        workspaceId: ws,
        attemptId: `burned-${i}`,
        purpose: GENERATION_PURPOSE,
        model: "claude-sonnet-5",
        tokensIn: 1,
        tokensOut: 1,
        usageRaw: {},
        costMicroUsd: 1n,
        costState: "estimated",
        resolvedTier: "free",
        promptBundleVersion: "b",
        configVersion: 1,
        outcome: "schema_invalid",
        consumedIncludedBuild: false,
      });
    }
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(GenerationUnchargedAttemptCapError);

    // R12's grain, driven rather than argued: the SAME rows booked against the
    // ONBOARDING purpose do not bound a generation, because the count is per
    // purpose. A generation sharing `ONBOARDING_BRAIN_PURPOSE` would be
    // bounded — and priced — by the wrong operation's history.
    await db
      .update(modelUsage)
      .set({ purpose: "onboarding_brain" })
      .where(eq(modelUsage.workspaceId, ws));
    const { provider } = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    const run = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(run.generation.outcome).toBe("usable");
  });


  it("6g. The uncharged bound in MONEY refuses before the vendor, on FEW but EXPENSIVE attempts", async () => {
    // THE GAP THIS CAP EXISTS FOR (billing gate, 2026-09-04). The attempt cap
    // above bounds a COUNT; what it protects is SPEND. `llm.maxOutputTokens`
    // moved 4,000 -> 12,000 on 2026-09-04, the worst case per uncharged attempt
    // went 0.14 -> 0.42 USD, and not one control noticed — because no control
    // here was denominated in money.
    //
    // TWO ROWS, WELL UNDER THE ATTEMPT CAP OF 10, and the money cap still bites.
    // That is the whole point: without it these two are invisible.
    await activateBrain();
    const { content } = await getActiveConfig(db);
    const costCap = content.generation.maxUnchargedBillableCostMicroUsd;
    const attemptCap = content.generation.maxUnchargedBillableAttempts;
    const half = BigInt(Math.ceil(costCap / 2));
    for (let i = 0; i < 2; i++) {
      await db.insert(modelUsage).values({
        profileId,
        workspaceId: ws,
        attemptId: `expensive-${i}`,
        purpose: GENERATION_PURPOSE,
        model: "claude-sonnet-5",
        tokensIn: 1,
        tokensOut: 12_000,
        usageRaw: {},
        costMicroUsd: half,
        costState: "estimated",
        resolvedTier: "free",
        promptBundleVersion: "b",
        configVersion: 1,
        outcome: "schema_invalid",
        consumedIncludedBuild: false,
      });
    }
    // NON-VACUITY, FIRST: the attempt cap CANNOT be what refuses this.
    expect(2).toBeLessThan(attemptCap);

    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(GenerationUnchargedCostCapError);
  });

  it("6h. The money bound is silent on CHEAP attempts, and an UNKNOWN cost is never invented", async () => {
    // THE DIRECTION THAT MUST NOT CHANGE, and the stated imprecision driven
    // rather than argued. A row whose `cost_state` is `unknown` carries a NULL
    // cost and contributes ZERO to the sum. That understates in the dangerous
    // direction, which is exactly why this cap REPLACES NOTHING: the attempt
    // cap is what bounds the rows whose cost we could not compute.
    await activateBrain();
    const { content } = await getActiveConfig(db);
    expect(content.generation.maxUnchargedBillableCostMicroUsd).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      await db.insert(modelUsage).values({
        profileId,
        workspaceId: ws,
        attemptId: `unknown-cost-${i}`,
        purpose: GENERATION_PURPOSE,
        model: "claude-sonnet-5",
        tokensIn: 1,
        tokensOut: 1,
        usageRaw: {},
        // NULL cost — the table CHECK requires this exactly when state is
        // `unknown`, so this is the real shape, not a contrived one.
        costMicroUsd: null,
        costState: "unknown",
        resolvedTier: "free",
        promptBundleVersion: "b",
        configVersion: 1,
        outcome: "schema_invalid",
        consumedIncludedBuild: false,
      });
    }
    const profileScope = await mintProfileScope(db, owner, profileId);
    await expect(
      profileScope.accessors.sumUnchargedBillableCostMicroUsd({
        purpose: GENERATION_PURPOSE,
        since: new Date(0),
      })
    ).resolves.toBe(0);
    // ...while the COUNT bound sees all three: the control that owns this case.
    await expect(
      profileScope.accessors.countUnchargedBillableAttempts({
        purpose: GENERATION_PURPOSE,
        since: new Date(0),
      })
    ).resolves.toBe(3);
  });

  it("6b. R16's bound is a WINDOW, not a life sentence — attempts older than it do not refuse", async () => {
    // AN UNWINDOWED COUNT OVER AN APPEND-ONLY TABLE IS A PERMANENT REFUSAL
    // (billing gate, 2026-09-01). `model_usage` only grows, so N unparseable
    // replies EVER used to refuse this profile's generations for good — the
    // remedy being an operator raising a GLOBAL key, with nothing listing which
    // profiles were stuck. What the bound exists to stop is a deterministic
    // failure repeating under a creator's finger, which happens inside one
    // sitting.
    //
    // THE SAME ROWS, TWICE, DIFFERING ONLY IN `created_at`: at the cap inside
    // the window they refuse; moved outside it they do not. That is the only
    // shape that proves the predicate is the window rather than the count.
    await activateBrain();
    await grant(HOOK_SET_COST);
    const { content } = await getActiveConfig(db);
    const cap = content.generation.maxUnchargedBillableAttempts;
    const windowMs = content.generation.unchargedAttemptWindowMinutes * 60_000;
    for (let i = 0; i < cap; i++) {
      await db.insert(modelUsage).values({
        profileId,
        workspaceId: ws,
        attemptId: `stale-${i}`,
        purpose: GENERATION_PURPOSE,
        model: "claude-sonnet-5",
        tokensIn: 1,
        tokensOut: 1,
        usageRaw: {},
        costMicroUsd: 1n,
        costState: "estimated",
        resolvedTier: "free",
        promptBundleVersion: "b",
        configVersion: 1,
        outcome: "schema_invalid",
        consumedIncludedBuild: false,
      });
    }
    // INSIDE the window (the rows were just written): refused, no vendor.
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(GenerationUnchargedAttemptCapError);

    // OUTSIDE it: the same cap-many rows, aged past the window, and the
    // creator can generate again without an operator touching anything.
    await db
      .update(modelUsage)
      .set({ createdAt: new Date(Date.now() - windowMs - 60_000) })
      .where(eq(modelUsage.workspaceId, ws));
    const { provider } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    const run = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(run.generation.outcome).toBe("usable");
  });

  it("6c. crossing the cap EMITS a metric — the widened channel has a counter", async () => {
    // WHY THE COUNTER EXISTS (billing gate round 2, 2026-09-01). Windowing the
    // cap in 6b was the right trade — the lifetime version was a permanent,
    // operator-only, globally-keyed refusal on the product's main verb — but
    // it turned a bounded-FOREVER exposure into an unbounded-RATE one, on a
    // tier that needs no card (R-55) and whose email addresses nothing bounds
    // (R17). Nothing counted or surfaced that channel, so the first abuse of
    // it would have been learned about from an invoice. The gap was never the
    // number 10; it was that no operator could see the number being reached.
    await activateBrain();
    const { content } = await getActiveConfig(db);
    const cap = content.generation.maxUnchargedBillableAttempts;
    const seen: UnchargedAttemptCapMetric[] = [];
    setUnchargedAttemptCapMetricSink((m) => seen.push(m));
    try {
      // UNDER the cap: the FALSE branch, driven first. An emitter that fired
      // on every press would be noise indistinguishable from a signal, and a
      // "does it fire" test alone cannot tell the two apart.
      await grant(HOOK_SET_COST);
      const { provider } = scripted([
        reply(hooksOutput()),
        killTestReply(["/rules/0"]),
      ]);
      await generate(db, owner, profileId, provider, anySlots(), params(), new Date());
      expect(seen, "a metric fired on an ordinary generation").toEqual([]);

      for (let i = 0; i < cap; i++) {
        await db.insert(modelUsage).values({
          profileId,
          workspaceId: ws,
          attemptId: `capped-${i}`,
          purpose: GENERATION_PURPOSE,
          model: "claude-sonnet-5",
          tokensIn: 1,
          tokensOut: 1,
          usageRaw: {},
          costMicroUsd: 1n,
          costState: "estimated",
          resolvedTier: "free",
          promptBundleVersion: "b",
          configVersion: 1,
          outcome: "schema_invalid",
          consumedIncludedBuild: false,
        });
      }
      await expect(
        generate(db, owner, profileId, never(), anySlots(), params(), new Date())
      ).rejects.toBeInstanceOf(GenerationUnchargedAttemptCapError);

      expect(seen).toHaveLength(1);
      // THE PAYLOAD HAS TO BE ACTIONABLE WITHOUT A SECOND QUERY, because the
      // operator surface R-67 asks for does not exist yet: which profile, in
      // which workspace, on which purpose, at what count, over what window.
      expect(seen[0]).toMatchObject({
        workspaceId: ws,
        profileId,
        purpose: GENERATION_PURPOSE,
        cap,
        windowMinutes: content.generation.unchargedAttemptWindowMinutes,
      });
      expect(seen[0]!.attempts).toBeGreaterThanOrEqual(cap);
      // `windowMinutes` IS THE FACT THAT DISTINGUISHES THE TWO CAP SITES: a
      // number means the refusal clears itself, `null` (onboarding) means a
      // stuck profile only an operator can free. A generation must never
      // report the second.
      expect(seen[0]!.windowMinutes).not.toBeNull();
    } finally {
      setUnchargedAttemptCapMetricSink(null);
    }
  });


  it("6i. the COST refusal is distinguishable from the ATTEMPT refusal in telemetry", async () => {
    // WHAT THIS FIXES (billing + code review, round 2, independently). R-102
    // reused this metric verbatim for the money cap, so a cost refusal printed
    // `attempts=2 cap=10` — numbers saying the cap was NOT crossed — on the
    // only operator surface either control has. R-102's own warrant is "two
    // different diagnoses for an operator", and the telemetry made them one.
    await activateBrain();
    const { content } = await getActiveConfig(db);
    const costCap = content.generation.maxUnchargedBillableCostMicroUsd;
    const attemptCap = content.generation.maxUnchargedBillableAttempts;
    const seen: UnchargedAttemptCapMetric[] = [];
    setUnchargedAttemptCapMetricSink((m) => seen.push(m));
    try {
      for (let i = 0; i < 2; i++) {
        await db.insert(modelUsage).values({
          profileId,
          workspaceId: ws,
          attemptId: `costly-${i}`,
          purpose: GENERATION_PURPOSE,
          model: "claude-sonnet-5",
          tokensIn: 1,
          tokensOut: 12_000,
          usageRaw: {},
          costMicroUsd: BigInt(Math.ceil(costCap / 2)),
          costState: "estimated",
          resolvedTier: "free",
          promptBundleVersion: "b",
          configVersion: 1,
          outcome: "schema_invalid",
          consumedIncludedBuild: false,
        });
      }
      await expect(
        generate(db, owner, profileId, never(), anySlots(), params(), new Date())
      ).rejects.toBeInstanceOf(GenerationUnchargedCostCapError);

      expect(seen).toHaveLength(1);
      // THE DISCRIMINATOR, and the money numbers that make the line readable.
      expect(seen[0].bound).toBe("cost");
      expect(seen[0].costMicroUsd).toBeGreaterThanOrEqual(costCap);
      expect(seen[0].capMicroUsd).toBe(costCap);
      // ...and the attempt numbers it carries are NOT a cap crossing, which is
      // exactly why the discriminator had to exist.
      expect(seen[0].attempts).toBeLessThan(attemptCap);
    } finally {
      setUnchargedAttemptCapMetricSink(null);
    }
  });

  it("6d. a metric sink that THROWS cannot replace the refusal a creator reads", async () => {
    // THE FALSE BRANCH OF "NEVER THROWS INTO THE CALLER". Telemetry fires
    // immediately before this throw, so a sink that raised would swallow
    // `GenerationUnchargedAttemptCapError` — the refusal whose whole job is to
    // tell the creator what happened — and render as "Something went wrong" on
    // a money screen. A try/catch nothing drives is not a guard (CLAUDE.md
    // 2026-08-26/29).
    await activateBrain();
    const { content } = await getActiveConfig(db);
    const cap = content.generation.maxUnchargedBillableAttempts;
    for (let i = 0; i < cap; i++) {
      await db.insert(modelUsage).values({
        profileId,
        workspaceId: ws,
        attemptId: `sink-${i}`,
        purpose: GENERATION_PURPOSE,
        model: "claude-sonnet-5",
        tokensIn: 1,
        tokensOut: 1,
        usageRaw: {},
        costMicroUsd: 1n,
        costState: "estimated",
        resolvedTier: "free",
        promptBundleVersion: "b",
        configVersion: 1,
        outcome: "schema_invalid",
        consumedIncludedBuild: false,
      });
    }
    setUnchargedAttemptCapMetricSink(() => {
      throw new Error("collector is down");
    });
    try {
      await expect(
        generate(db, owner, profileId, never(), anySlots(), params(), new Date())
      ).rejects.toBeInstanceOf(GenerationUnchargedAttemptCapError);
    } finally {
      setUnchargedAttemptCapMetricSink(null);
    }
  });

  it("6e. a framework the budget DROPS is recorded, and an ordinary offer records nothing", async () => {
    // WHY THIS METRIC EXISTS (billing gate, 2026-09-01). A row that does not
    // fit the framework context budget is simply not offered — the model never
    // sees it, `framework_eligibility` refuses any output that names it, and
    // NOTHING anywhere said so. Measured before the fix: with private
    // frameworks of ordinary size (526 characters against a curated average of
    // 593), a profile at 40 private rows lost ALL NINE seeded frameworks and
    // paid full price for the generation that lost them.
    // offer order; this is the half that makes the remaining drops visible.
    await activateBrain();
    const seen: FrameworkOfferDroppedMetric[] = [];
    setFrameworkOfferDroppedMetricSink((m) => seen.push(m));
    try {
      const { content } = await getActiveConfig(db);
      // NON-VACUITY FIRST: on the seeded budget the whole curated library
      // fits, so an ordinary generation emits NOTHING. A metric that fired on
      // every press would be a line with no information in it.
      const clean = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
      await generate(
        db,
        owner,
        profileId,
        clean.provider,
        anySlots(),
        params(),
        new Date()
      );
      expect(
        seen,
        "a drop was recorded on a generation where the whole library fits"
      ).toEqual([]);

      // Now a budget that cannot carry the library. It is CONFIG, so this is
      // the operator's own dial rather than a stub — and the refusal it
      // produces is silent by design, which is the thing being measured.
      await appendConfigVersion(
        db,
        {
          ...content,
          generation: { ...content.generation, frameworkContextCharBudget: 900 },
        },
        "test-admin"
      );
      const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
      await generate(
        db,
        owner,
        profileId,
        s.provider,
        anySlots(),
        params({ attemptId: "drop-1" }),
        new Date()
      );

      expect(seen).toHaveLength(1);
      // ACTIONABLE WITHOUT A SECOND QUERY, the rule its sibling states: which
      // profile, in which workspace, on which mode, how much of the library
      // was lost, and against what budget.
      expect(seen[0]).toMatchObject({
        workspaceId: ws,
        profileId,
        mode: "hooks",
        charBudget: 900,
      });
      expect(seen[0]!.eligible).toBeGreaterThan(seen[0]!.offered);
      // THE SPLIT IS THE POINT: a dropped CURATED row is the product
      // rationing its own library, which is a different fact from a creator
      // filling the budget with their own frameworks.
      expect(seen[0]!.droppedShared).toBeGreaterThan(0);
      expect(seen[0]!.droppedPrivate).toBe(0);
    } finally {
      setFrameworkOfferDroppedMetricSink(null);
    }
  });

  it("6e-bis. the DROP LEAVES THE PACKAGE, so a screen can say it (R17)", async () => {
    // THE GAP THIS CLOSES (slice 7 cross-boundary pass, 2026-09-01). Until
    // this field the only thing that learned about a drop was the server
    // metric above: a creator whose own frameworks did not fit paid full price
    // for a prompt missing material they wrote, and no screen could say so
    // because `generate` did not return it.
    await activateBrain();
    const { content } = await getActiveConfig(db);

    // ON THE SEEDED BUDGET: an offer was built and NOTHING was dropped, which
    // is a real answer and is reported as one.
    const clean = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    const fits = await generate(
      db,
      owner,
      profileId,
      clean.provider,
      anySlots(),
      params({ attemptId: "offer-fits" }),
      new Date()
    );
    expect(fits.frameworkOffer).not.toBeNull();
    expect(fits.frameworkOffer!.droppedPrivate).toBe(0);
    expect(fits.frameworkOffer!.droppedShared).toBe(0);
    expect(fits.frameworkOffer!.offered).toBe(fits.frameworkOffer!.eligible);

    // ON A BUDGET THAT CANNOT CARRY IT: the same four numbers the metric got.
    await appendConfigVersion(
      db,
      {
        ...content,
        generation: { ...content.generation, frameworkContextCharBudget: 900 },
      },
      "test-admin"
    );
    const seen: FrameworkOfferDroppedMetric[] = [];
    setFrameworkOfferDroppedMetricSink((m) => seen.push(m));
    let dropped;
    try {
      const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
      dropped = await generate(
        db,
        owner,
        profileId,
        s.provider,
        anySlots(),
        params({ attemptId: "offer-drops" }),
        new Date()
      );
    } finally {
      setFrameworkOfferDroppedMetricSink(null);
    }
    expect(dropped.frameworkOffer).not.toBeNull();
    expect(dropped.frameworkOffer!.eligible).toBeGreaterThan(
      dropped.frameworkOffer!.offered
    );
    // ONE COMPUTATION, TWO CONSUMERS: the operator's dashboard and the
    // creator's screen cannot disagree about how many rows the budget dropped.
    expect(seen).toHaveLength(1);
    expect(dropped.frameworkOffer).toEqual({
      eligible: seen[0]!.eligible,
      offered: seen[0]!.offered,
      droppedShared: seen[0]!.droppedShared,
      droppedPrivate: seen[0]!.droppedPrivate,
    });

    // A REPLAY HAS NO ANSWER, and `null` is how it says so. Re-submitting a
    // settled attempt id assembles no prompt, so a zero here would claim
    // nothing was dropped on a press that never built an offer.
    const replay = await generate(
      db,
      owner,
      profileId,
      scripted([]).provider,
      anySlots(),
      params({ attemptId: "offer-drops" }),
      new Date()
    );
    expect(replay.replayed).toBe(true);
    expect(replay.frameworkOffer).toBeNull();
  });

  it("6f. a dropped-offer sink that THROWS cannot break the generation it observed", async () => {
    // THE FALSE BRANCH OF "NEVER THROWS INTO THE CALLER". This one fires on
    // the SUCCESS path, before the vendor call, so a sink that raised would
    // turn a working generation into an error the creator learns nothing from
    // — worse than the refusal case, because nothing was even wrong.
    await activateBrain();
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      {
        ...content,
        generation: { ...content.generation, frameworkContextCharBudget: 900 },
      },
      "test-admin"
    );
    setFrameworkOfferDroppedMetricSink(() => {
      throw new Error("collector down");
    });
    try {
      const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
      const result = await generate(
        db,
        owner,
        profileId,
        s.provider,
        anySlots(),
        params(),
        new Date()
      );
      expect(result.generation.outcome).toBe("usable");
    } finally {
      setFrameworkOfferDroppedMetricSink(null);
    }
  });

  it("7. R15: a ZERO balance is refused before the vendor, with nothing claimed", async () => {
    await activateBrain();
    const { content } = await getActiveConfig(db);
    // Priced above the Free allowance the balance read is about to mint, so
    // the refusal is a real shortfall rather than an absence of the mint.
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, hookSet: 999 } },
      "test-admin"
    );
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(await attemptsOf()).toHaveLength(0);
  });

  it("8. the RUN SLOT refuses before the vendor, and leaves no claim behind", async () => {
    await activateBrain();
    const { slots, log } = refusing("workspace_limit");
    await expect(
      generate(db, owner, profileId, never(), slots, params(), new Date())
    ).rejects.toBeInstanceOf(RunSlotBusyError);
    expect(log.acquired).toHaveLength(1);
    // THE CLAIM IS TAKEN AFTER THE SLOT, and this is the assertion that pins
    // it: a slot refusal that left a `claimed` row would make a creator's
    // retry of the same attempt id read "already running" forever.
    expect(await attemptsOf()).toHaveLength(0);
  });

  it("9. R9a: no COHERENT BRAIN refuses before the vendor", async () => {
    // No `activateBrain()` — the profile exists and has no activation.
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(BrainNotActivatedError);
    expect(await attemptsOf()).toHaveLength(0);
  });

  // ------------------------------------------------- R14: THE DURABLE CLAIM

  it("R14: the claim is COMMITTED BEFORE the vendor call — observed from inside it", async () => {
    await activateBrain();
    let seen: { state: string; payloadSha256: string } | undefined;
    let seenCalls = 0;
    const provider: LlmProvider = {
      vendor: "observing",
      complete: async () => {
        // READ FROM INSIDE THE CALL. Asserting afterwards cannot tell
        // "committed before HTTP" from "committed after it".
        const [row] = await db
          .select()
          .from(generationAttempts)
          .where(eq(generationAttempts.workspaceId, ws));
        seen = row;
        seenCalls += 1;
        return {
          text: seenCalls === 1 ? reply(hooksOutput()) : killTestReply(["/rules/0"]),
          servedModel: "claude-sonnet-5",
          usage: { tokensIn: 1, tokensOut: 1, raw: {} },
        };
      },
    };
    await generate(db, owner, profileId, provider, anySlots(), params(), new Date());
    expect(seen, "no attempt row existed when the vendor was called").toBeDefined();
    expect(seen!.state).toBe("vendor_started");
    expect(seen!.payloadSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("R14: the same attempt id with a DIFFERENT payload refuses, and calls nothing", async () => {
    await activateBrain();
    const { provider } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    await generate(db, owner, profileId, provider, anySlots(), params(), new Date());
    await expect(
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        params({ input: "a completely different thing i want to say" }),
        new Date()
      )
    ).rejects.toBeInstanceOf(GenerationPayloadMismatchError);
  });

  it("R14c: re-submitting a SETTLED attempt returns the stored record, with no second vendor call and no second debit", async () => {
    await activateBrain();
    const first = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    const a = await generate(
      db,
      owner,
      profileId,
      first.provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(a.replayed).toBe(false);
    expect(a.creditsChargedNow).toBe(HOOK_SET_COST);

    const b = await generate(
      db,
      owner,
      profileId,
      never(),
      anySlots(),
      params(),
      new Date()
    );
    expect(b.replayed).toBe(true);
    expect(b.generation.id).toBe(a.generation.id);
    expect(b.creditsChargedNow).toBe(0);
    expect(await debitsOf()).toHaveLength(1);
    expect(await db.select().from(generations)).toHaveLength(1);
  });

  // ------------------------------------------- R14c: THE DURABLE CANDIDATE
  //
  // R14c draws a line through the middle of a generation, at the durable
  // response checkpoint, and says opposite things on either side of it: BEFORE
  // it, a crash is `recovery_required` and the creator is charged nothing;
  // AFTER it, a retry SETTLES the stored candidate without another vendor call.
  // A test that only walks the happy path cannot tell those apart, so these
  // cases put a real failure on each side of the line — `dbThatFailsWhen`, and
  // its own docblock says what it does and does not reproduce.
  //
  // THE INSTRUMENT FOR "NO SECOND VENDOR CALL" IS `never()`, not a call count:
  // the retry is handed a provider that FAILS THE TEST if it is invoked, so the
  // property is enforced by the stub rather than observed after the fact.

  /** The moment after the vendor has answered and before the checkpoint. */
  const beforeCheckpoint = (calls: () => number) => async () => {
    const attempt = await attemptRow();
    // Every call this run made has its `model_usage` row (R14a), and the
    // attempt has not moved off `vendor_started`. That is true of exactly one
    // transaction: the checkpoint.
    return attempt?.state === "vendor_started" && (await usageOf()).length === calls();
  };

  /** The moment after the checkpoint has committed. */
  const afterCheckpoint = async () =>
    (await attemptRow())?.state === "vendor_complete";

  it("R14c: a crash BEFORE the checkpoint is `recovery_required` — nothing stored, nothing charged, and no retry calls the vendor again", async () => {
    await activateBrain();
    const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    const crashing = dbThatFailsWhen(
      db,
      beforeCheckpoint(() => s.calls.length),
      // ONCE, so the code under test can still run its own bookkeeping. A
      // database that stayed down would prove nothing about whether this path
      // flags the attempt, because nothing could write the flag.
      "once"
    );
    await expect(
      generate(
        crashing,
        owner,
        profileId,
        s.provider,
        anySlots(),
        params(),
        new Date()
      )
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);

    const attempt = await attemptRow();
    // OPERATOR-VISIBLE, and it says the vendor was reached.
    expect(attempt.state).toBe("recovery_required");
    expect(attempt.vendorStartedAt).not.toBeNull();
    expect(attempt.terminalAt).not.toBeNull();
    // NOTHING TO RECOVER FROM, which is the honest half of R14c: the answer
    // was in this process's memory and the transaction that would have made it
    // durable is the one that failed.
    expect(attempt.candidate).toBeNull();
    // NO CHARGE, NO OUTPUT.
    expect(await db.select().from(generations)).toHaveLength(0);
    expect(await debitsOf()).toHaveLength(0);
    // ...and THE SPEND SURVIVED, because each metering row was its own
    // committed transaction (R14a).
    expect(await usageOf()).toHaveLength(2);

    // THE SYSTEM NEVER GUESSES BY CALLING THE VENDOR AGAIN.
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    expect((await attemptRow()).state).toBe("recovery_required");
    expect(await debitsOf()).toHaveLength(0);
  });

  it("R14c: a crash AFTER the checkpoint leaves the validated candidate on the attempt, and a retry SETTLES it with no vendor call and no second debit", async () => {
    await activateBrain();
    const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    // ALWAYS, from the checkpoint onwards: the settlement fails AND so does the
    // bookkeeping that would otherwise flag the attempt. That is what a lost
    // process leaves behind — a row sitting where the last COMMITTED
    // transaction put it.
    const crashing = dbThatFailsWhen(db, afterCheckpoint, "always");
    await expect(
      generate(
        crashing,
        owner,
        profileId,
        s.provider,
        anySlots(),
        params(),
        new Date()
      )
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);

    const stranded = await attemptRow();
    expect(stranded.state).toBe("vendor_complete");
    // THE POINT OF THE WHOLE MIGRATION: the validated output we already paid
    // for is on disk, not in a dead process.
    expect(stranded.candidate).not.toBeNull();
    expect(await db.select().from(generations)).toHaveLength(0);
    expect(await debitsOf()).toHaveLength(0);

    // THE RETRY. `never()` is the instrument: a vendor call here fails the test
    // from inside the provider.
    const settled = await generate(
      db,
      owner,
      profileId,
      never(),
      anySlots(),
      params(),
      new Date()
    );
    // NOT A REPLAY — this call did the settling and took the debit — and `run`
    // is null because this call did not produce it.
    expect(settled.replayed).toBe(false);
    expect(settled.run).toBeNull();
    expect(settled.creditsChargedNow).toBe(HOOK_SET_COST);
    expect(settled.generation.outcome).toBe("usable");
    // NO OFFER WAS BUILT BY THIS CALL, and `null` is the honest answer rather
    // than a zeroed summary (round 2, 2026-09-01 — the billing reviewer drove
    // this and found it true, unasserted). This call assembled no prompt: it
    // settled a candidate the FIRST call had already validated. A
    // `{eligible: 0, offered: 0, dropped…: 0}` here would tell a creator
    // "nothing was dropped" about a question this call never asked — and it is
    // `settle`'s `frameworkOffer: null` sitting BEFORE `...outcome.settled`
    // that makes it so.
    expect(settled.frameworkOffer).toBeNull();
    // ...and what settled is what the VENDOR said, round-tripped through the
    // column and re-parsed by the mode's own parser.
    expect(settled.generation.output).toEqual(hooksOutput());

    const after = await attemptRow();
    expect(after.state).toBe("settled");
    expect(after.generationId).toBe(settled.generation.id);
    // THE CANDIDATE DOES NOT OUTLIVE ITS PURPOSE: `generations` is the record
    // now, and a second permanent copy of the same words is what R11 forbids.
    expect(after.candidate).toBeNull();
    expect(await debitsOf()).toHaveLength(1);
    // NO THIRD VENDOR CALL — the metering rows are still the two the first
    // attempt paid for.
    expect(await usageOf()).toHaveLength(2);
    expect(s.calls).toHaveLength(2);
  });

  it("R14c: a stored candidate this build cannot READ refuses without calling anything, and does not destroy the bytes an operator needs", async () => {
    await activateBrain();
    const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    const crashing = dbThatFailsWhen(db, afterCheckpoint, "always");
    await expect(
      generate(
        crashing,
        owner,
        profileId,
        s.provider,
        anySlots(),
        params(),
        new Date()
      )
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);
    // A document from some other envelope version — the rolling-deploy case
    // the version field exists for, forged here because a rolling deploy is
    // not a thing a test can stage.
    const corrupt = { v: 99, outcome: "usable", output: { hooks: [] } };
    await db
      .update(generationAttempts)
      .set({ candidate: corrupt })
      .where(eq(generationAttempts.attemptId, "gen-1"));

    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);

    const after = await attemptRow();
    // LEFT WHERE IT WAS, deliberately: flagging it `recovery_required` would
    // CLEAR the candidate (the equality CHECK nulls it on that transition), and
    // the bytes are the only evidence of what the reader failed on.
    expect(after.state).toBe("vendor_complete");
    expect(after.candidate).toEqual(corrupt);
    expect(await debitsOf()).toHaveLength(0);
    expect(await db.select().from(generations)).toHaveLength(0);
  });

  it("R14c: a settlement that loses the lock takes NO second debit — it is handed the winner's record", async () => {
    await activateBrain();
    const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    let inner: Awaited<ReturnType<typeof generate>> | undefined;
    // THE INTERLEAVING AS A FACT, not as a scheduling accident: a RETRY settles
    // the stored candidate in the window between this call reading its claim
    // and taking the workspace lock. On the fresh path the first transaction
    // opened while the attempt reads `vendor_complete` IS the settlement, so
    // this fires in exactly the place the in-lock re-read exists for.
    const raced = dbThatRunsBefore(
      db,
      afterCheckpoint,
      async () => {
        inner = await generate(
          db,
          owner,
          profileId,
          never(),
          anySlots(),
          params(),
          new Date()
        );
      }
    );
    const outer = await generate(
      raced,
      owner,
      profileId,
      s.provider,
      anySlots(),
      params(),
      new Date()
    );

    // THE RETRY SETTLED IT — from the candidate this call had just stored, with
    // no vendor of its own.
    expect(inner?.replayed).toBe(false);
    expect(inner?.creditsChargedNow).toBe(HOOK_SET_COST);
    // ...and THIS call, which lost the lock, charged nothing and returned the
    // same record rather than an error or a second debit.
    expect(outer.replayed).toBe(true);
    expect(outer.creditsChargedNow).toBe(0);
    expect(outer.generation.id).toBe(inner?.generation.id);
    expect(await debitsOf()).toHaveLength(1);
    expect(await db.select().from(generations)).toHaveLength(1);
    expect((await attemptRow()).state).toBe("settled");
    // ONE VENDOR SEQUENCE for the whole story.
    expect(s.calls).toHaveLength(2);
    expect(await usageOf()).toHaveLength(2);
  });

  it("R14c: the candidate is SERVER-DERIVED — one cast into the call's params never reaches the row", async () => {
    await activateBrain();
    const s = scripted([reply(hooksOutput()), killTestReply(["/rules/0"])]);
    // CLAUDE.md 2026-08-21: proving a field cannot be TYPED is not proving it
    // cannot be CAST. If a caller could supply the candidate, they could hand
    // themselves any output they liked and have it settled and debited as the
    // vendor's answer — so the smuggled document carries a sentinel and the
    // stored one is checked for it.
    const forged = {
      ...params(),
      candidate: {
        v: 1,
        outcome: "usable",
        output: hooksOutput({ hookTexts: ["SMUGGLED-BY-THE-CALLER"] }),
      },
    } as unknown as ReturnType<typeof params>;
    const crashing = dbThatFailsWhen(db, afterCheckpoint, "always");
    await expect(
      generate(
        crashing,
        owner,
        profileId,
        s.provider,
        anySlots(),
        forged,
        new Date()
      )
    ).rejects.toBeInstanceOf(GenerationRecoveryRequiredError);

    const stranded = await attemptRow();
    expect(stranded.candidate).not.toBeNull();
    expect(
      JSON.stringify(stranded.candidate),
      "a caller-supplied candidate reached the durable row"
    ).not.toContain("SMUGGLED-BY-THE-CALLER");
    // NON-VACUITY: the row really does hold the VENDOR's answer, so the
    // assertion above is about which document landed and not about an empty
    // column.
    expect(JSON.stringify(stranded.candidate)).toContain(
      hooksOutput().hooks![0].text
    );
  });

  it("R14: a claim that is still RUNNING refuses a duplicate rather than calling twice", async () => {
    await activateBrain();
    // The winner is held inside the vendor call while a second submission of
    // the same attempt id arrives.
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let inFlight!: () => void;
    const started = new Promise<void>((r) => (inFlight = r));
    let heldCalls = 0;
    const holder: LlmProvider = {
      vendor: "held",
      complete: async () => {
        heldCalls += 1;
        if (heldCalls === 1) {
          inFlight();
          await held;
        }
        return {
          text: heldCalls === 1 ? reply(hooksOutput()) : killTestReply(["/rules/0"]),
          servedModel: "claude-sonnet-5",
          usage: { tokensIn: 1, tokensOut: 1, raw: {} },
        };
      },
    };
    const winner = generate(
      db,
      owner,
      profileId,
      holder,
      anySlots(),
      params(),
      new Date()
    );
    await started;
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(GenerationInFlightError);
    release();
    await winner;
  });

  // ------------------------------------------- QUESTION 4'S TABLE, ROW BY ROW

  it("Q4 row 1: success, kill test passes -> one usage row per call, ONE debit, a usable generation", async () => {
    await activateBrain();
    const { provider, calls } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    const result = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(calls).toHaveLength(2); // one draft + the creator-rule scoring
    expect(await usageOf()).toHaveLength(2);
    expect(result.generation.outcome).toBe("usable");
    expect(result.generation.rewriteCount).toBe(0);
    expect(result.creditsChargedNow).toBe(HOOK_SET_COST);
    const debits = await debitsOf();
    expect(debits).toHaveLength(1);
    expect(debits[0].delta).toBe(-HOOK_SET_COST);
    // THE DEBIT NAMES THE ATTEMPT, which is what `credit_ledger_inference_debit_uq`
    // keys on and what REQ-G05 joins spend to revenue with.
    expect(debits[0].refType).toBe("inference");
    expect(debits[0].refId).toBe("gen-1");
    // ...and the attempt names the debit and the generation back.
    const [attempt] = await attemptsOf();
    expect(attempt.state).toBe("settled");
    expect(attempt.generationId).toBe(result.generation.id);
    expect(attempt.debitLedgerId).toBe(debits[0].id);
    // R11: the output lives on the generation and NEVER in usage_raw.
    for (const row of await usageOf()) {
      for (const v of Object.values(row.usageRaw ?? {})) {
        expect(typeof v).toBe("number");
      }
    }
    // REQ-I04: the stored generation names its weakest point.
    expect(result.generation.weakestPoint).toMatch(/\S/);
  });

  it("Q4 row 2: kill test fails, ONE rewrite passes -> a usage row per CALL, still ONE debit", async () => {
    await activateBrain();
    const { provider, calls } = scripted([
      reply(longHookOutput()), // a 16-word hook: M3's fourth planted violation
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    const result = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(calls).toHaveLength(3);
    expect(await usageOf()).toHaveLength(3);
    expect(result.generation.outcome).toBe("usable");
    expect(result.generation.rewriteCount).toBe(1);
    expect(await debitsOf()).toHaveLength(1);
  });

  it("Q4 row 3: the rewrite ALSO fails -> an honest refusal is STORED and DEBITED (REQ-C03)", async () => {
    await activateBrain();
    const { provider, calls } = scripted([
      reply(longHookOutput()),
      reply(longHookOutput()),
    ]);
    const result = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    // NO THIRD CALL: the creator's own rules are not scored on a draft they
    // will never see.
    expect(calls).toHaveLength(2);
    expect(result.generation.outcome).toBe("honest_refusal");
    expect(result.generation.output).toBeNull();
    expect(result.generation.refusalReason).toMatch(/\S/);
    expect(result.generation.rewriteCount).toBe(1);
    // THE ROW WORTH ARGUING ABOUT, and the card argues it: the creator got a
    // real answer, so the debit is taken.
    expect(result.creditsChargedNow).toBe(HOOK_SET_COST);
    expect(await debitsOf()).toHaveLength(1);
    const [attempt] = await attemptsOf();
    expect(attempt.state).toBe("settled");
  });

  it("a caller-supplied reference cannot replace an opaque autopsy id, so the vendor remains untouched", async () => {
    await activateBrain();
    await setTier("creator");
    await grant(SPIN_COST);
    const s = scripted([nearCopySpinOutput(), nearCopySpinOutput()]);
    const forged = {
      ...spinParams(),
      spinReference: SPIN_REFERENCE,
    } as unknown as ReturnType<typeof spinParams>;
    await expect(
      generate(db, owner, profileId, s.provider, anySlots(), forged, new Date()),
    ).rejects.toThrow(/opaque identifier/i);
    expect(s.calls).toHaveLength(0);
    expect(await debitsOf()).toHaveLength(0);
  });

  it("Spin near-copy is gated before candidate output, settlement, and the returned projection", async () => {
    await activateBrain();
    await setTier("creator");
    await grant(SPIN_COST);
    const autopsyId = await sharedSpinAutopsy();
    const s = scripted([nearCopySpinOutput(), nearCopySpinOutput()]);
    const result = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      spinParams(autopsyId),
      new Date(),
    );

    expect(s.calls).toHaveLength(2);
    expect(result.run?.status).toBe("refused");
    expect(result.generation.outcome).toBe("honest_refusal");
    expect(result.generation.output).toBeNull();
    expect(result.creditsChargedNow).toBe(SPIN_COST);
    expect(await debitsOf()).toHaveLength(1);
    const attempt = await attemptRow("spin-1");
    expect(attempt.state).toBe("settled");
    expect(attempt.candidate).toBeNull();
    expect(JSON.stringify(result.generation)).not.toContain(SPIN_REFERENCE.hook);
  });

  it("Spin near-copy in a NON-HOOK field (the caption) is gated on the same persisted path", async () => {
    // THE POPULATION BLOCK ON THE DURABLE PATH (compliance gate round 1,
    // 2026-09-03). The sibling above plants the reference hook in `hooks[0]`;
    // this one keeps every hook clean and puts the verbatim reference hook in
    // the caption, which `displayableSpin` renders. Before the fix this run
    // settled as `usable` and the stored generation carried the reference hook.
    await activateBrain();
    await setTier("creator");
    await grant(SPIN_COST);
    const autopsyId = await sharedSpinAutopsy();
    const captionCopy = () => {
      const doc = JSON.parse(nearCopySpinOutput());
      doc.hooks[0] = { text: "You are shooting three takes when one honest take would do", mechanic: "contradiction" };
      doc.caption = { text: SPIN_REFERENCE.hook, hashtags: ["filmmaking"] };
      return JSON.stringify(doc);
    };
    const s = scripted([captionCopy(), captionCopy()]);
    const result = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      spinParams(autopsyId, "spin-caption-1"),
      new Date(),
    );

    expect(s.calls).toHaveLength(2);
    expect(result.run?.status).toBe("refused");
    if (result.run?.status !== "refused") return;
    expect(result.run.killTest.finalAttempt.hardRules.map((f) => f.rule)).toContain("similarity");
    expect(result.generation.outcome).toBe("honest_refusal");
    expect(result.generation.output).toBeNull();
    expect(result.creditsChargedNow).toBe(SPIN_COST);
    expect(await debitsOf()).toHaveLength(1);
    const attempt = await attemptRow("spin-caption-1");
    expect(attempt.state).toBe("settled");
    expect(attempt.candidate).toBeNull();
    expect(JSON.stringify(result.generation)).not.toContain(SPIN_REFERENCE.hook);
  });

  it("R11: the Spin PROMPT carries the reference's MECHANISM and never its hook or subject terms (R-97)", async () => {
    // Slice 8c. The durable path builds ONE `GenerationContext` for a Spin;
    // this asserts what that context put in front of the model, on the
    // prompt the scripted provider actually received. Same fixture as the
    // siblings: `SPIN_REFERENCE` carries BOTH the mechanism fields and the
    // gate fields, and the gate fires on draft 1's copied hook in this very
    // run — so the two objects are proven live and separate in one call.
    await activateBrain();
    await setTier("creator");
    await grant(SPIN_COST);
    const autopsyId = await sharedSpinAutopsy();
    const s = scripted([nearCopySpinOutput(), nearCopySpinOutput()]);
    const result = await generate(
      db,
      owner,
      profileId,
      s.provider,
      anySlots(),
      spinParams(autopsyId, "spin-prompt-1"),
      new Date(),
    );
    expect(result.run?.status).toBe("refused");
    if (result.run?.status !== "refused") return;
    expect(result.run.killTest.firstAttempt.hardRules.map((f) => f.rule)).toContain("similarity");
    expect(s.calls).toHaveLength(2);

    // THE POPULATION: draft 1's whole prompt, and draft 2's prompt above
    // "Your previous draft:" — the rewrite legitimately quotes the model its
    // own near copy back as the thing to fix, so the hook is in that quoted
    // draft by construction; the assembled context must never carry it.
    const draftAt = s.calls[1].prompt.indexOf("Your previous draft:");
    expect(draftAt).toBeGreaterThan(0);
    for (const prompt of [s.calls[0].prompt, s.calls[1].prompt.slice(0, draftAt)]) {
      expect(prompt).toContain(REFERENCE_BLOCK_HEADER);
      expect(prompt).toContain(SPIN_REFERENCE.hookMechanic);
      for (const beat of SPIN_REFERENCE.beats) expect(prompt).toContain(beat);
      expect(prompt).toContain(SPIN_REFERENCE.ending);
      expect(prompt).toContain(SPIN_REFERENCE.followTrigger);
      // The GATE's object, field by field.
      expect(prompt).not.toContain(SPIN_REFERENCE.hook);
      for (const term of SPIN_REFERENCE.subjectTerms) expect(prompt).not.toContain(term);
      expect(prompt).not.toContain("beatCount");
      expect(prompt).not.toContain("turnBeat");
      // ...and it is the creator's OWN angle under the input label.
      expect(prompt).toContain("The angle they want to make their own:");
    }
    // The stored generation carries nothing of the reference either way.
    expect(JSON.stringify(result.generation)).not.toContain(SPIN_REFERENCE.hook);
    expect(JSON.stringify(result.generation)).not.toContain(SPIN_REFERENCE.hookMechanic);
  });

  it("Q4 row 4: a reply we could not PARSE is billable and NOT debited", async () => {
    await activateBrain();
    const { provider } = scripted(["this is not json at all"]);
    await expect(
      generate(db, owner, profileId, provider, anySlots(), params(), new Date())
    ).rejects.toThrow();
    const [usage] = await usageOf();
    expect(usage.outcome).toBe("schema_invalid"); // billable
    expect(usage.consumedIncludedBuild).toBe(false); // and NOT charged
    expect(await debitsOf()).toHaveLength(0);
    expect(await db.select().from(generations)).toHaveLength(0);
    const [attempt] = await attemptsOf();
    expect(attempt.state).toBe("refused");
    expect(attempt.refusalCode).toBe(GENERATION_REFUSAL_CODES.parse_failed);
  });

  it("a CALLER-SIDE assembly refusal records `assembly_refused`, not `parse_failed`", async () => {
    // THE COLUMN STOPS BLAMING THE VENDOR (billing gate, 2026-09-02).
    // `assembleGenerationPrompt` refuses an empty input INSIDE the pipeline —
    // after the claim and after `vendor_started`, because this file does not
    // call it before either, whatever its comment used to say. Nothing is
    // spent and no model is called (the provider below throws if reached), but
    // a `generation_attempts` row IS written, and it used to say
    // `parse_failed`: an operator filtering that column read "the model
    // answered with something unusable" about an attempt with no vendor call
    // behind it.
    await activateBrain();
    await expect(
      generate(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        params({ attemptId: "gen-assembly", input: "   " }),
        new Date()
      )
    ).rejects.toThrow();
    const [attempt] = await attemptsOf();
    expect(attempt.state).toBe("refused");
    expect(attempt.refusalCode).toBe(GENERATION_REFUSAL_CODES.assembly_refused);
    // ...and "costs nothing" still holds in the money sense.
    expect(await debitsOf()).toHaveLength(0);
    expect(await db.select().from(generations)).toHaveLength(0);
    // The code is not the parser's — the two are told apart, which is the
    // whole point of giving this one its own.
    expect(GENERATION_REFUSAL_CODES.assembly_refused).not.toBe(
      GENERATION_REFUSAL_CODES.parse_failed
    );
  });

  it("Q4 row 4b: an LlmSchemaInvalidError from the vendor is billable and NOT debited", async () => {
    await activateBrain();
    await expect(
      generate(
        db,
        owner,
        profileId,
        throwing(new LlmSchemaInvalidError("no_text_block", true)),
        anySlots(),
        params(),
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmSchemaInvalidError);
    const [usage] = await usageOf();
    expect(usage.outcome).toBe("schema_invalid");
    expect(usage.consumedIncludedBuild).toBe(false);
    expect(await debitsOf()).toHaveLength(0);
  });

  it("Q4 row 5: a TRUNCATED reply writes a billable usage row and takes NO debit (R-48)", async () => {
    await activateBrain();
    await expect(
      generate(
        db,
        owner,
        profileId,
        throwing(
          new LlmTruncatedError(4096, { tokensIn: 900, tokensOut: 4096 })
        ),
        anySlots(),
        params(),
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmTruncatedError);
    const [usage] = await usageOf();
    // A truncation is the ONE failure that knows what it cost.
    expect(usage.tokensOut).toBe(4096);
    expect(usage.costState).toBe("estimated");
    expect(usage.consumedIncludedBuild).toBe(false);
    expect(await debitsOf()).toHaveLength(0);
    const [attempt] = await attemptsOf();
    expect(attempt.state).toBe("refused");
    expect(attempt.refusalCode).toBe(GENERATION_REFUSAL_CODES.vendor_failed);
  });

  it("Q4 row 6: a RATE LIMIT writes a NON-billable usage row and takes no debit", async () => {
    await activateBrain();
    await expect(
      generate(
        db,
        owner,
        profileId,
        throwing(new LlmRateLimitedError()),
        anySlots(),
        params(),
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmRateLimitedError);
    const [usage] = await usageOf();
    expect(usage.outcome).toBe("rate_limited"); // NOT billable
    expect(usage.consumedIncludedBuild).toBe(false);
    expect(await debitsOf()).toHaveLength(0);
  });

  it("a REFUSED attempt is not run again under the same id", async () => {
    await activateBrain();
    await expect(
      generate(
        db,
        owner,
        profileId,
        throwing(new LlmRateLimitedError()),
        anySlots(),
        params(),
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmRateLimitedError);
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(GenerationAlreadyRefusedError);
  });

  // --------------------------------------------------------- R14b: SETTLEMENT

  it("R14b: a balance that DROPS after the vendor answered refuses ATOMICALLY — no generation, no debit, no output", async () => {
    await activateBrain();
    // The workspace can pay at the pre-call check, and cannot by settlement:
    // the price moves under it, which is the same shape as the balance moving
    // and is the one a single-connection driver can express.
    const { content } = await getActiveConfig(db);
    let raised = false;
    const provider: LlmProvider = {
      vendor: "price-mover",
      complete: async (req) => {
        if (!raised) {
          raised = true;
          await appendConfigVersion(
            db,
            { ...content, creditCosts: { ...content.creditCosts, hookSet: 9999 } },
            "test-admin"
          );
        }
        return {
          text:
            req.prompt.includes("criteria")
              ? killTestReply(["/rules/0"])
              : reply(hooksOutput()),
          servedModel: "claude-sonnet-5",
          usage: { tokensIn: 1, tokensOut: 1, raw: {} },
        };
      },
    };
    await expect(
      generate(db, owner, profileId, provider, anySlots(), params(), new Date())
    ).rejects.toBeInstanceOf(PostCallDebitError);
    // NEITHER HALF COMMITTED.
    expect(await db.select().from(generations)).toHaveLength(0);
    expect(await debitsOf()).toHaveLength(0);
    // ...and the SPEND SURVIVED, because each usage row was its own committed
    // transaction (R14a).
    expect((await usageOf()).length).toBeGreaterThan(0);
    const [attempt] = await attemptsOf();
    expect(attempt.state).toBe("refused");
    expect(attempt.refusalCode).toBe(GENERATION_REFUSAL_CODES.post_call_debit);
  });

  it("R9a: the prompt is built from the documents the RECORDED SNAPSHOT NAMES, not from whatever is active", async () => {
    // THE TENANCY-GATE FINDING OF 2026-09-01, as a deterministic fixture.
    //
    // `latestBrainActivation()` and the brain-document read used to be two
    // independent statements against two independent authorities, outside any
    // transaction and outside the per-profile brain lock. A coherent activation
    // committing between them stored `brain_activation_id = N` on a generation
    // whose prompt had been built from N+1's documents — the stored explanation
    // wrong from birth, reachable with two tabs or two members, and asserted by
    // nothing (the only provenance check was that the id looked like a uuid).
    //
    // THE STATE THAT RACE PRODUCES, held still: the snapshot names voice v1,
    // and the document that is ACTIVE is v2. "Whatever is active" reaches for
    // v2 while recording the snapshot that names v1. There is no window to time
    // here — the disagreement is simply present, and the assertion is which
    // document the vendor was actually sent.
    //
    // v1 IS SUPERSEDED RATHER THAN LEFT ACTIVE ALONGSIDE v2, because
    // `brain_docs_one_active_uq` refuses two active documents of one kind for
    // one profile — the database will not hold the state I first wrote, and the
    // state it does hold is the one an activation really produces.
    const brain = await activateBrainDetail();
    const V1_MARK = "plain and direct, like talking to one person";
    const V2_MARK = "loud and jokey, like shouting across a bar";
    await db
      .update(brainDocs)
      .set({ status: "superseded", supersededAt: new Date() })
      .where(eq(brainDocs.id, brain.voiceDocId));
    await db.insert(brainDocs).values({
      profileId,
      workspaceId: ws,
      kind: "voice",
      version: 2,
      content: {
        register: V2_MARK,
        sentenceRhythm: "short lines, then one long one",
        signatureMoves: ["opens on the thing that went wrong"],
        avoid: ["never uses hype words"],
      },
      reason: "Version 2: you edited this document.",
      sourceEvidence: [
        {
          field: "/register",
          quote: "c",
          inputId: "00000000-0000-4000-8000-000000000001",
          startUtf16: 0,
          endUtf16: 1,
        },
      ],
      status: "active",
      confirmedAt: new Date(),
      confirmedContentSha256: "0".repeat(64),
      activatedAt: new Date(),
    });
    await grant(HOOK_SET_COST);
    const { provider, calls } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    const { generation } = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    const sent = calls
      .map((c) => [c.system, c.prompt].join(" "))
      .join(" ");
    expect(sent, "the snapshot's own voice document was not sent").toContain(
      V1_MARK
    );
    expect(
      sent,
      "a document the recorded snapshot does not name reached the vendor"
    ).not.toContain(V2_MARK);
    // ...and the row records the snapshot those documents belong to, so the
    // explanation and the prompt describe one brain.
    expect(generation.brainActivationId).toBe(brain.snapshotId);
  });

  it("R9a: a snapshot naming a document this profile does not own yields NOTHING for it", async () => {
    // `brain_activation_snapshots`' doc-id columns carry no foreign key, and
    // `generations.brain_activation_id` carries none either, so "the snapshot
    // names it" is not by itself a tenancy claim. `brainDocsByIds` is scope
    // -predicated, so a foreign id resolves to no document at all — and with no
    // voice and no kill-test sentences the assembly refuses rather than
    // silently generating from a stranger's brain.
    // ANOTHER WORKSPACE'S PROFILE, because the free tier caps this one at a
    // single profile — which makes this the CROSS-WORKSPACE axis, the harder of
    // the two.
    await seedAuthUser(db, "user_b");
    await ensureUserWorkspace(db, { authUserId: "user_b", name: "B" });
    const otherOwner = await withWorkspace(db, { authUserId: "user_b" });
    const other = await createProfile(db, otherOwner, "Bea", new Date());
    const [foreignVoice] = await db
      .insert(brainDocs)
      .values({
        profileId: other.id,
        workspaceId: otherOwner.workspaceId,
        kind: "voice",
        version: 1,
        content: { register: "somebody else's register entirely" },
        reason: "Version 1: you edited this document.",
        sourceEvidence: [
          {
            field: "/register",
            quote: "c",
            inputId: "00000000-0000-4000-8000-000000000002",
            startUtf16: 0,
            endUtf16: 1,
          },
        ],
        status: "active",
        confirmedAt: new Date(),
        confirmedContentSha256: "0".repeat(64),
        activatedAt: new Date(),
      })
      .returning();
    await db.insert(brainActivationSnapshots).values({
      profileId,
      workspaceId: ws,
      voiceDocId: foreignVoice.id,
    });
    await grant(HOOK_SET_COST);
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toThrow();
    // NOTHING WAS GENERATED AND NOTHING WAS CHARGED.
    expect(await db.select().from(generations)).toHaveLength(0);
    expect(await debitsOf()).toHaveLength(0);
  });

  it("R14b: the generation records the config version, the model and the bundle it ran under", async () => {
    await activateBrain();
    const { provider } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    const { generation } = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(generation.model).toBe("claude-sonnet-5");
    expect(generation.promptBundleVersion).toMatch(/^modes\/hooks@[0-9a-f]{12}$/);
    expect(generation.configVersion).toBeGreaterThan(0);
    expect(generation.brainActivationId).toMatch(/^[0-9a-f-]{36}$/);
    // ...and every `model_usage` row books its spend against the SAME bundle.
    for (const row of await usageOf()) {
      expect(row.promptBundleVersion).toBe(generation.promptBundleVersion);
      expect(row.purpose).toBe(GENERATION_PURPOSE);
    }
  });

  it("B5: the kill-test scoring call runs on the CHEAP model, and its price row fails closed BEFORE the vendor", async () => {
    // CARD R5 SAYS "the cheap model call". Both `meteredCall` closures were
    // handed the SAME model — `llm.models.generation` — so `llm.models
    // .classification` (Haiku-class, seeded since M1) had zero production
    // readers and every successful hook set cost two Sonnet calls instead of
    // Sonnet plus Haiku. That moves REQ-G05's margin, which is the number the
    // pricing decision is tuned against.
    await activateBrain();
    await grant(HOOK_SET_COST);
    const { provider, calls } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    const { content } = await getActiveConfig(db);
    // THE DRAFT ON THE GENERATION MODEL, THE SCORING CALL ON THE CHEAP ONE.
    // Read off the config rather than hard-coded, so an operator changing the
    // model ids does not leave this test asserting the old ones.
    expect(calls).toHaveLength(2);
    expect(calls[0].model).toBe(content.llm.models.generation);
    expect(calls[1].model).toBe(content.llm.models.classification);
    expect(calls[1].model).not.toBe(calls[0].model);
  });

  it("B5: a config with NO price row for the cheap model refuses BEFORE the vendor", async () => {
    // The A-9 rule for anything that bills, on the model this slice just
    // started calling: a cost we incur and cannot price understates cost and
    // therefore OVERSTATES margin. The provider throws if reached, so the
    // evidence is that a call would have failed the test.
    await activateBrain();
    await grant(HOOK_SET_COST);
    const { content } = await getActiveConfig(db);
    const prices = { ...content.llm.prices };
    delete prices[content.llm.models.classification];
    await appendConfigVersion(
      db,
      { ...content, llm: { ...content.llm, prices } },
      "test-admin"
    );
    await expect(
      generate(db, owner, profileId, never(), anySlots(), params(), new Date())
    ).rejects.toThrow();
    // Nothing was claimed, nothing was charged.
    expect(await attemptsOf()).toHaveLength(0);
    expect(await debitsOf()).toHaveLength(0);
  });

  it("a mode an operator prices at ZERO still SETTLES, with a generation and no debit", async () => {
    // THE `settled_has_generation` EQUALITY, driven rather than argued (R-63's
    // open question). The database refuses a `settled` attempt with no stored
    // generation, and stage A left the revisit trigger as "the first settlement
    // path that needs a legal `settled` with no generation". This is the case
    // that would have needed one — a zero-cost settlement, where `debitCredits`
    // refuses a zero outright and no ledger row exists — and it does NOT need
    // one: the generation is what is stored, and the debit is the optional
    // half. `generation_attempts_debit_only_when_settled` is one-directional
    // for exactly this reason.
    await activateBrain();
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, creditCosts: { ...content.creditCosts, hookSet: 0 } },
      "test-admin"
    );
    const { provider } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    const result = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(result.creditsChargedNow).toBe(0);
    expect(result.generation.outcome).toBe("usable");
    expect(await debitsOf()).toHaveLength(0);
    const [attempt] = await attemptsOf();
    expect(attempt.state).toBe("settled");
    expect(attempt.generationId).toBe(result.generation.id);
    expect(attempt.debitLedgerId).toBeNull();
  });

  it("a workspace with credits it did not mint still pays exactly the mode's price", async () => {
    await activateBrain();
    await grant(100);
    const { provider } = scripted([
      reply(hooksOutput()),
      killTestReply(["/rules/0"]),
    ]);
    const result = await generate(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      params(),
      new Date()
    );
    expect(result.creditsChargedNow).toBe(HOOK_SET_COST);
    expect(result.balanceAfter).toBe(100 + 25 - HOOK_SET_COST);
  });
});

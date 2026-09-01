// `runInference` — THE ORDER IS THE REQUIREMENT (slice 2a).
//
// THE INSTRUMENT THIS FILE IS BUILT ON: every pre-call gate is proved with a
// provider whose `complete` THROWS IF INVOKED. The evidence that nothing
// reached the vendor is then the stub's own refusal, not an assertion about a
// spy's call count — a spy proves "we did not observe a call", this proves
// "a call would have failed the test". That is only possible because
// `runInference` takes its provider as a PARAMETER; `vi.mock` cannot express
// it, having already replaced the module whose non-invocation is the evidence.
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_V1_SEED,
  createTestDb,
  creditLedger,
  ensureUserWorkspace,
  modelUsage,
  schema,
  seedAuthUser,
  seedDb,
  usageOutcome,
  USAGE_OUTCOME_BILLABLE,
  withWorkspace,
  type TestDb,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import {
  INFERENCE_OUTCOMES,
  LlmRateLimitedError,
  LlmRefusedError,
  LlmSchemaInvalidError,
  LlmTruncatedError,
  LlmUnavailableError,
  type InferenceRequest,
  type LlmProvider,
} from "@respin/llm";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { recordPauseStart } from "../src/pause";
import { UnchargedAttemptCapError } from "../src/errors";
import {
  runInference,
  InferenceRoleError,
  ProfileArchivedError,
  RunSlotBusyError,
  TopupInFlightError,
  ONBOARDING_BRAIN_PURPOSE,
} from "../src/inference";
import { InsufficientCreditsError, WorkspacePausedError } from "../src/errors";
import { ConfigNotMigratedError } from "@respin/config";
import {
  setUnchargedAttemptCapMetricSink,
  type UnchargedAttemptCapMetric,
} from "../src/metrics";
import { anySlots, bounded, granting, refusing } from "./support/run-slots";

const REQ = { attemptId: "attempt-1", system: "s", prompt: "p", promptBundleVersion: "test-bundle" };

/** The instrument: a provider that fails the test if it is ever reached. */
const never = (): LlmProvider => ({
  vendor: "must-not-be-called",
  complete: async () => {
    throw new Error(
      "THE VENDOR WAS CALLED. A gate that is supposed to run BEFORE the model call did not."
    );
  },
});

const ok = (over: Partial<{ tokensIn: number; tokensOut: number; model: string }> = {}) => {
  const calls: InferenceRequest[] = [];
  const provider: LlmProvider = {
    vendor: "stub",
    complete: async (req) => {
      calls.push(req);
      return {
        text: "hello",
        servedModel: over.model ?? "claude-sonnet-5",
        usage: {
          tokensIn: over.tokensIn ?? 1000,
          tokensOut: over.tokensOut ?? 1000,
          raw: {
            input_tokens: over.tokensIn ?? 1000,
            output_tokens: over.tokensOut ?? 1000,
          },
        },
      };
    },
  };
  return { provider, calls };
};

const failing = (e: Error): LlmProvider => ({
  vendor: "stub",
  complete: async () => {
    throw e;
  },
});

describe("runInference", () => {
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
    const profile = await createProfile(db, owner, "Anna", new Date());
    profileId = profile.id;
  });

  /**
   * Write a config document to `config_versions` WITHOUT going through
   * `appendConfigVersion`, and this is the only way to build the state R19
   * guards against.
   *
   * `appendConfigVersion` runs `respinConfigV1.parse`, which APPLIES the
   * `.default()` — so a document handed to it with `onboardingBrainRebuild`
   * deleted is stored WITH it, and the deploy window cannot be reproduced
   * through that door at all. `migrate-config.ts` already records the same
   * fact from the other side ("the reverse window opens at the first
   * /admin/config append AFTER the deploy, because appendConfigVersion stores
   * the PARSED document").
   *
   * What that means for R19 is worth stating plainly, because it narrows the
   * claim: the window exists ONLY for documents written before the code that
   * knows the key was deployed — i.e. for every database that already exists.
   * That is exactly the case the guard is for, and it is what this raw insert
   * reproduces. A test that used `appendConfigVersion` here would have been
   * green against a document that DID carry the key, proving nothing.
   */
  const storeRawConfig = async (content: unknown) => {
    await db
      .insert(schema.configVersions)
      .values({ content: content as never, createdBy: "pre-deploy" });
  };

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

  // ---------------------------------------------------------------- the order

  it("R17: refuses an ARCHIVED profile, reading the state AT OPERATION TIME", async () => {
    // The state is read now, not carried on the scope — so a profile archived
    // while a page sat open does not still generate.
    await db.execute(
      (await import("drizzle-orm"))
        .sql`UPDATE creator_profiles SET state = 'archived'`
    );
    await expect(
      runInference(db, owner, profileId, never(), anySlots(), REQ, new Date())
    ).rejects.toBeInstanceOf(ProfileArchivedError);
    expect(await db.select().from(modelUsage)).toHaveLength(0);
  });

  it("R8: refuses under an OPEN PAUSE — and this gate cannot live in debitCredits", async () => {
    // THE POINT OF THIS TEST is the second assertion. The first attempt for a
    // profile is FREE, and a zero cost never reaches `debitCredits` at all
    // (`assertPositiveInt` rejects 0). So `debitCredits`'s own pause gate is
    // structurally unable to protect the included build, and a paused workspace
    // would burn our tokens on precisely the call that costs the creator
    // nothing. That is why R8 puts the gate at operation entry.
    await db.transaction((tx) => recordPauseStart(tx, ws, new Date(), new Date()));
    await expect(
      runInference(db, owner, profileId, never(), anySlots(), REQ, new Date())
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    expect(await db.select().from(modelUsage)).toHaveLength(0);
    // ...and the cost this attempt WOULD have had is zero, which is what makes
    // the debit's gate unreachable. If this ever stops being 0, re-read R8.
    const { content } = await getActiveConfig(db);
    expect(content.creditCosts.onboardingBrainBuild).toBe(0);
  });

  it("REQ-A02: a VIEWER cannot spend the workspace's credits", async () => {
    const { eq } = await import("drizzle-orm");
    await db
      .update(schema.memberships)
      .set({ role: "viewer" })
      .where(eq(schema.memberships.workspaceId, ws));
    const viewer = await withWorkspace(db, { authUserId: "user_a" });
    expect(viewer.role).toBe("viewer");
    await expect(
      runInference(db, viewer, profileId, never(), anySlots(), REQ, new Date())
    ).rejects.toBeInstanceOf(InferenceRoleError);
    expect(await db.select().from(modelUsage)).toHaveLength(0);
    // NON-VACUITY, and it is the SAME workspace and the SAME profile — only
    // the role differs. A gate that refuses everything passes every
    // one-directional test ever written about it.
    await db
      .update(schema.memberships)
      .set({ role: "editor" })
      .where(eq(schema.memberships.workspaceId, ws));
    const editor = await withWorkspace(db, { authUserId: "user_a" });
    const { provider, calls } = ok();
    await runInference(db, editor, profileId, provider, anySlots(), REQ, new Date());
    expect(calls).toHaveLength(1);
  });

  it("refuses ANOTHER workspace's profile id, before the vendor", async () => {
    await seedAuthUser(db, "user_b");
    await ensureUserWorkspace(db, { authUserId: "user_b", name: "B" });
    const ownerB = await withWorkspace(db, { authUserId: "user_b" });
    await expect(
      runInference(db, ownerB, profileId, never(), anySlots(), REQ, new Date())
    ).rejects.toThrow();
    expect(await db.select().from(modelUsage)).toHaveLength(0);
  });

  // ------------------------------------------------------- pricing and config

  it("appendConfigVersion CANNOT produce the pre-deploy state — the default is applied on write", async () => {
    // Recorded as its own assertion rather than left in a comment, because it
    // is the fact that decides how R19 must be tested, and getting it wrong is
    // how a green test proves nothing. The first draft of the R19 case below
    // used `appendConfigVersion` and passed a document with the key deleted;
    // the stored row came back WITH the key, the guard correctly did not fire,
    // and the throwing provider caught it.
    const { content } = await getActiveConfig(db);
    const stripped = JSON.parse(JSON.stringify(content));
    delete stripped.creditCosts.onboardingBrainRebuild;
    const version = await appendConfigVersion(db, stripped, "test");
    const [row] = await db
      .select()
      .from(schema.configVersions)
      .where((await import("drizzle-orm")).eq(schema.configVersions.version, version));
    expect(
      (row.content as { creditCosts: Record<string, number> }).creditCosts
        .onboardingBrainRebuild,
      "appendConfigVersion parses, so the default lands in storage"
    ).toBe(50);
  });

  it("R19: refuses when the STORED config lacks the key that would price it", async () => {
    // The window between a code deploy and `config:migrate` is real: the
    // running code supplies a default, but a debit stamped with this config
    // version could not be reconciled against the document. Fail closed rather
    // than spend — and NOT by calling the vendor first.
    const { content } = await getActiveConfig(db);
    const stripped = JSON.parse(JSON.stringify(content));
    delete stripped.creditCosts.onboardingBrainRebuild;
    await storeRawConfig(stripped);
    const err = await runInference(
      db,
      owner,
      profileId,
      never(),
      anySlots(),
      REQ,
      new Date()
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigNotMigratedError);
    expect((err as Error).message).toContain("onboardingBrainRebuild");
    expect((err as Error).message).toContain("config:migrate");
    expect(await db.select().from(modelUsage)).toHaveLength(0);
  });

  it("R19: the check is NARROW — a missing price for ANOTHER model does not refuse", async () => {
    // A workspace that never touches the configured model must not be refused
    // for a price row it does not use.
    const { content } = await getActiveConfig(db);
    const narrowed = JSON.parse(JSON.stringify(content));
    delete narrowed.llm.prices["claude-haiku-4-5"];
    await storeRawConfig(narrowed);
    const { provider } = ok();
    await expect(
      runInference(db, owner, profileId, provider, anySlots(), REQ, new Date())
    ).resolves.toMatchObject({ creditsCharged: 0 });
  });

  it("R6: an unpriced ACTIVE model is refused BEFORE the vendor is paid", async () => {
    const { content } = await getActiveConfig(db);
    const unpriced = JSON.parse(JSON.stringify(content));
    delete unpriced.llm.prices[unpriced.llm.models.generation];
    await storeRawConfig(unpriced);
    // The R19 check fires first — `llm.prices.<model>` is one of the paths it
    // requires — which is the correct order: both refuse, and the one that
    // names the remedy an operator can act on wins.
    await expect(
      runInference(db, owner, profileId, never(), anySlots(), REQ, new Date())
    ).rejects.toBeInstanceOf(ConfigNotMigratedError);
    expect(await db.select().from(modelUsage)).toHaveLength(0);
  });

  // ------------------------------------------------------------ balance & cost

  it("R9/R10: a zero balance on a REBUILD refuses BEFORE the call, and promises nothing", async () => {
    const { provider, calls } = ok();
    // Burn the included build first.
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    expect(calls).toHaveLength(1);
    // The rebuild is priced at 50 and the balance is 0.
    const err = await runInference(
      db,
      owner,
      profileId,
      never(),
      anySlots(),
      { ...REQ, attemptId: "attempt-2" },
      new Date()
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect((err as InsufficientCreditsError).cost).toBe(50);
    // NO TOP-UP WAS ARMED, so this is the plain refusal rather than the
    // in-flight one — and neither is a `TopupInFlightError`, which would tell
    // the creator money is moving when none is.
    expect(err).not.toBeInstanceOf(TopupInFlightError);
    // ...and the failed rebuild wrote NO usage row: it never reached a vendor.
    expect(await db.select().from(modelUsage)).toHaveLength(1);
  });

  it("D-M2-2: the FIRST attempt is free, the SECOND is debited at the config price", async () => {
    await grant(500);
    const { provider } = ok();
    const first = await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    expect(first.creditsCharged).toBe(0);
    // 500 GRANTED PLUS THE WORKSPACE'S OWN FREE ALLOWANCE (slice 6, R17): this
    // workspace has no subscription row, so `getWorkspaceBillingState` resolves
    // it to `free` and the balance read inside the debit transaction mints its
    // monthly grant. `creditsCharged` — what this case is actually about — is
    // unchanged, and the SECOND attempt below still asserts the exact debit.
    expect(first.balanceAfter).toBe(500 + CONFIG_V1_SEED.allowances.free);

    const second = await runInference(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      { ...REQ, attemptId: "attempt-2" },
      new Date()
    );
    expect(second.creditsCharged).toBe(50);
    // The debit is the number this case is about, and it is exact. The balance
    // it leaves carries the same Free-allowance term the first assertion
    // explains (R17), so it is written as the same sum minus the charge.
    expect(second.balanceAfter).toBe(
      500 + CONFIG_V1_SEED.allowances.free - 50
    );

    // THE DEBIT NAMES THE ATTEMPT (REQ-G05 joins spend to revenue on it).
    const debits = (await db.select().from(creditLedger)).filter(
      (r) => r.refType === "inference"
    );
    expect(debits).toHaveLength(1);
    expect(debits[0].refId).toBe("attempt-2");
    expect(debits[0].delta).toBe(-50);
  });

  it("THE PRICE IS THE STORED CONFIG: changing it moves the charge, with no deploy", async () => {
    await grant(500);
    const { provider } = ok();
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    const { content } = await getActiveConfig(db);
    const cheaper = JSON.parse(JSON.stringify(content));
    cheaper.creditCosts.onboardingBrainRebuild = 7;
    await appendConfigVersion(db, cheaper, "owner");
    const second = await runInference(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      { ...REQ, attemptId: "attempt-2" },
      new Date()
    );
    expect(second.creditsCharged).toBe(7);
  });

  // ------------------------------------------------- the settlement tail (R11)

  it("R11/R13: a vendor 500 STILL writes the spend record, with no debit", async () => {
    await grant(500);
    await expect(
      runInference(
        db,
        owner,
        profileId,
        failing(new LlmUnavailableError(500, "server")),
        anySlots(),
        REQ,
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmUnavailableError);
    const rows = await db.select().from(modelUsage);
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("unavailable");
    expect(rows[0].attemptId).toBe("attempt-1");
    // NO DEBIT. The call failed; nothing is charged for it.
    expect(
      (await db.select().from(creditLedger)).filter((r) => r.refType === "inference")
    ).toHaveLength(0);
  });

  it("R14: a 429 does NOT consume the included build — the next attempt is still free", async () => {
    await expect(
      runInference(db, owner, profileId, failing(new LlmRateLimitedError()), anySlots(), REQ, new Date())
    ).rejects.toBeInstanceOf(LlmRateLimitedError);
    // A row exists (the attempt happened) but it is NOT billable, so it does
    // not count. Charging a creator's included build for our provider's rate
    // limit is charging them for our outage.
    expect(await db.select().from(modelUsage)).toHaveLength(1);
    const { provider } = ok();
    const next = await runInference(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      { ...REQ, attemptId: "attempt-2" },
      new Date()
    );
    expect(next.creditsCharged).toBe(0);
  });

  it("R14 (the other direction): a REFUSAL is billable and DOES consume it", async () => {
    await grant(500);
    await expect(
      runInference(db, owner, profileId, failing(new LlmRefusedError()), anySlots(), REQ, new Date())
    ).rejects.toBeInstanceOf(LlmRefusedError);
    const { provider } = ok();
    const next = await runInference(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      { ...REQ, attemptId: "attempt-2" },
      new Date()
    );
    expect(next.creditsCharged).toBe(50);
  });

  it("a TRUNCATION is billable but does NOT consume the included build", async () => {
    // THE WITNESS THE ROUND-2 FIX SHIPPED WITHOUT (billing gate). Every
    // `model_usage` row any other test writes carries `consumed_included_build
    // = true`, so `eq(consumedIncludedBuild, true)` in `countBillableAttempts`
    // was a tautology under test and deleting it stayed green. This is the only
    // case that writes `false`.
    await grant(500);
    await expect(
      runInference(
        db,
        owner,
        profileId,
        failing(new LlmTruncatedError(1024, { tokensIn: 816, tokensOut: 1024 })),
        anySlots(),
        REQ,
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmTruncatedError);

    const [row] = await db.select().from(modelUsage);
    // BILLABLE: the vendor produced a full ceiling and charged for it, so the
    // cost must reach the REQ-G05 rollup...
    expect(row.outcome).toBe("schema_invalid");
    expect(row.tokensOut).toBe(1024);
    expect(row.costState).toBe("estimated");
    expect(row.costMicroUsd).not.toBeNull();
    // ...and NOT consuming, because the cause is our own reply ceiling.
    expect(row.consumedIncludedBuild).toBe(false);

    // THE PROPERTY THAT ACTUALLY MATTERS TO THE CREATOR: the next press is
    // still their included one, not a 50-credit rebuild.
    const { provider } = ok();
    const next = await runInference(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      { ...REQ, attemptId: "attempt-after-truncation" },
      new Date()
    );
    expect(
      next.creditsCharged,
      "a truncation charged the creator for our own misconfiguration"
    ).toBe(0);
  });

  it("REFUSES past the uncharged-attempt cap, BEFORE the vendor", async () => {
    // THE BOUND THE ENTITLEMENT SPLIT MADE NECESSARY. A billable non-consuming
    // attempt costs us a full ceiling and the creator nothing, so `priceOf`
    // returns 0 and the balance check never runs — without a cap the press
    // repeats forever at our expense, and truncation is deterministic.
    await grant(500);
    const truncate = () =>
      runInference(
        db,
        owner,
        profileId,
        failing(new LlmTruncatedError(1024, { tokensIn: 8, tokensOut: 1024 })),
        anySlots(),
        { ...REQ, attemptId: `att-${Math.random()}` },
        new Date()
      );
    // The seeded cap is 3.
    for (let i = 0; i < 3; i++) {
      await expect(truncate()).rejects.toBeInstanceOf(LlmTruncatedError);
    }
    // The FOURTH is refused before any vendor call — proved with a provider
    // whose invocation is the failure.
    await expect(
      runInference(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        { ...REQ, attemptId: "att-capped" },
        new Date()
      )
    ).rejects.toBeInstanceOf(UnchargedAttemptCapError);
  });

  it("crossing THIS cap emits the metric too, and says LIFETIME on the wire", async () => {
    // THE POPULATION IS A LIST OF CAP SITES, NOT ONE PATH (CLAUDE.md
    // 2026-08-29). The counter was asked for by the GENERATION cap's newly
    // widened window, and a counter wired only there would be the same
    // one-path guard this repo has now shipped three times. This site is the
    // one whose refusal is still PERMANENT — onboarding's count is a lifetime
    // count — so a profile stuck here is precisely what an operator has no
    // other way to learn about, and `windowMinutes: null` is that fact on the
    // wire rather than a missing field.
    await grant(500);
    const seen: UnchargedAttemptCapMetric[] = [];
    setUnchargedAttemptCapMetricSink((m) => seen.push(m));
    try {
      const truncate = () =>
        runInference(
          db,
          owner,
          profileId,
          failing(new LlmTruncatedError(1024, { tokensIn: 8, tokensOut: 1024 })),
          anySlots(),
          { ...REQ, attemptId: `att-${Math.random()}` },
          new Date()
        );
      // UNDER the cap first — the false branch. Three billable truncations
      // reach the vendor and none of them is a cap crossing.
      for (let i = 0; i < 3; i++) {
        await expect(truncate()).rejects.toBeInstanceOf(LlmTruncatedError);
      }
      expect(seen, "a metric fired below the cap").toEqual([]);

      await expect(
        runInference(
          db,
          owner,
          profileId,
          never(),
          anySlots(),
          { ...REQ, attemptId: "att-capped-metric" },
          new Date()
        )
      ).rejects.toBeInstanceOf(UnchargedAttemptCapError);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        workspaceId: ws,
        profileId,
        purpose: ONBOARDING_BRAIN_PURPOSE,
      });
      // DERIVED FROM THE `since` THE COUNT ACTUALLY USED, not restated as a
      // literal — the day onboarding is windowed this reports the window
      // instead of quietly keeping the word "lifetime".
      expect(seen[0]!.windowMinutes).toBeNull();
      // The two purposes emit under DIFFERENT purpose strings, which is what
      // makes the metric splittable by an operator at all.
      expect(seen[0]!.purpose).not.toBe("generation");
    } finally {
      setUnchargedAttemptCapMetricSink(null);
    }
  });

  it("the cap is READ FROM CONFIG, not a literal that happens to agree with it", async () => {
    // The concurrency-limit precedent (below), applied to the cap the moment a
    // reviewer named the gap (billing gate round 3, 2026-08-29): the case above
    // drives the SEEDED cap of 3, so a planted literal `3` at the check site
    // keeps it green. Store a cap no seed carries and the second press must be
    // refused — a hard-coded anything admits it and fails here.
    await grant(500);
    const { content } = await getActiveConfig(db);
    const DISTINCTIVE = 1;
    expect(
      content.onboarding.maxUnchargedBillableAttempts,
      "pick a cap the seed does not carry, or the case stops discriminating"
    ).not.toBe(DISTINCTIVE);
    await appendConfigVersion(
      db,
      {
        ...content,
        onboarding: {
          ...content.onboarding,
          maxUnchargedBillableAttempts: DISTINCTIVE,
        },
      },
      "test"
    );
    await expect(
      runInference(
        db,
        owner,
        profileId,
        failing(new LlmTruncatedError(1024, { tokensIn: 8, tokensOut: 1024 })),
        anySlots(),
        { ...REQ, attemptId: "att-cap1-first" },
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmTruncatedError);
    await expect(
      runInference(
        db,
        owner,
        profileId,
        never(),
        anySlots(),
        { ...REQ, attemptId: "att-cap1-second" },
        new Date()
      )
    ).rejects.toBeInstanceOf(UnchargedAttemptCapError);
  });

  it("R13: every outcome value is classified, and the enum and the adapter agree", async () => {
    // The two sets are DECLARED in different packages — `@respin/llm` must not
    // depend on `@respin/db` — so this is what stops them drifting apart.
    expect([...INFERENCE_OUTCOMES].sort()).toEqual(
      [...usageOutcome.enumValues].sort()
    );
    for (const v of usageOutcome.enumValues) {
      expect(USAGE_OUTCOME_BILLABLE, v).toHaveProperty(v);
    }
  });

  // ------------------------------------------------------ the recorded row (R15)

  it("R15/R7: the row is built field by field — tier, cost state and cost are server-derived", async () => {
    const { provider } = ok({ tokensIn: 1000, tokensOut: 1000 });
    const result = await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    const [row] = await db.select().from(modelUsage);
    expect(row.resolvedTier).toBe("free"); // from state.ts, the ONE authority
    expect(row.costState).toBe("estimated");
    expect(row.purpose).toBe(ONBOARDING_BRAIN_PURPOSE);
    // THE OPERATION'S OWN BUNDLE, not a module default (billing gate round 2).
    // `promptBundleVersion` is a required param now, so the row records the
    // bundle that actually produced the prompt — a new operation that forgets
    // is a compile error rather than a row attributed to slice 2a's ping.
    expect(row.promptBundleVersion).toBe("test-bundle");
    expect(row.workspaceId).toBe(ws as string);
    // 1000 in * 3000 nano + 1000 out * 15000 nano = 18_000_000 nano = 18_000 micro.
    expect(row.costMicroUsd).toBe(18000n);
    expect(result.costMicroUsd).toBe(18000n);
    // METERING ONLY — the usage blob carries numbers and nothing else.
    expect(row.usageRaw).toEqual({ input_tokens: 1000, output_tokens: 1000 });
  });

  it("D-M2-13: a model the vendor SERVED but config does not price records cost_state=unknown, never zero", async () => {
    // The vendor is paid by the time this is known, so the honest record is "we
    // do not know what this cost" — a NULL cost with `unknown`, which is the
    // state the table's CHECK constraint exists to express. A zero here would
    // understate cost and overstate margin.
    const { provider } = ok({ model: "claude-some-future-model" });
    const result = await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    const [row] = await db.select().from(modelUsage);
    expect(row.model).toBe("claude-some-future-model");
    expect(row.costState).toBe("unknown");
    expect(row.costMicroUsd).toBeNull();
    expect(result.costMicroUsd).toBeNull();
  });

  it("the row records what the vendor SERVED, not what was asked for", async () => {
    // Pricing what we asked for rather than what we got is how a fallback to a
    // more expensive model books at the cheaper one's rate.
    const { provider } = ok({ model: "claude-haiku-4-5", tokensIn: 1000, tokensOut: 0 });
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    const [row] = await db.select().from(modelUsage);
    expect(row.model).toBe("claude-haiku-4-5");
    // Haiku input is 1000 nano/token, so 1000 tokens = 1_000_000 nano = 1000 micro.
    expect(row.costMicroUsd).toBe(1000n);
  });

  it("a text-less response is schema_invalid and IS billable", async () => {
    await expect(
      runInference(
        db,
        owner,
        profileId,
        failing(new LlmSchemaInvalidError("no_text_block", true)),
        anySlots(),
        REQ,
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmSchemaInvalidError);
    const [row] = await db.select().from(modelUsage);
    expect(row.outcome).toBe("schema_invalid");
  });

  it("R12: re-running the SAME attemptId cannot debit twice", async () => {
    // The structural half is the partial unique index; this is the behaviour a
    // retry actually produces. A second attempt with the same id is the shape a
    // double-submit or a redeployed job creates.
    await grant(500);
    const { provider } = ok();
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    await runInference(
      db,
      owner,
      profileId,
      provider,
      anySlots(),
      { ...REQ, attemptId: "attempt-2" },
      new Date()
    );
    await expect(
      runInference(
        db,
        owner,
        profileId,
        provider,
        anySlots(),
        { ...REQ, attemptId: "attempt-2" },
        new Date()
      )
    ).rejects.toThrow();
    const debits = (await db.select().from(creditLedger)).filter(
      (r) => r.refType === "inference"
    );
    expect(debits, "one debit per attempt, settled in the schema").toHaveLength(1);
  });

  it("the attempt id reaches the provider, so a retry inside it shares one id (R5)", async () => {
    const { provider, calls } = ok();
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    expect(calls[0].attemptId).toBe("attempt-1");
    const [row] = await db.select().from(modelUsage);
    expect(row.attemptId).toBe(calls[0].attemptId);
  });

  it("the max output tokens come from CONFIG, not from a constant", async () => {
    const { content } = await getActiveConfig(db);
    const { provider, calls } = ok();
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    expect(calls[0].maxOutputTokens).toBe(content.llm.maxOutputTokens);
  });

  // ------------------------------------------ the run slot (tech-spec S6)
  //
  // The REAL semaphore is proved against real Postgres in
  // `inference-race.docker.test.ts` -- two connections, one refused. PGlite is
  // single-connection, so nothing here could express a contended lock. What
  // these cases prove is the half that lives in THIS file: that the operation
  // asks for a slot at all, asks with the right limit, refuses correctly when
  // told no, and gives the slot back on every exit path.

  it("takes a slot with the limit CONFIG gives for the tier, and gives it back", async () => {
    const { content } = await getActiveConfig(db);
    const { provider } = ok();
    const { slots, log } = granting();
    await runInference(db, owner, profileId, provider, slots, REQ, new Date());
    // The tier here is `free` (no subscription row), which is the tier every
    // M2 onboarding workspace actually has.
    expect(log.acquired).toEqual([
      { workspaceId: ws, limit: content.concurrencyLimits.free },
    ]);
    expect(log.released, "the slot is released on the success path").toBe(1);
  });

  it("the limit is READ FROM CONFIG, not a literal that happens to agree with it", async () => {
    // THE NON-VACUITY OF THE CASE ABOVE, AND THE FIRST DRAFT OF IT WAS VACUOUS.
    //
    // That draft asserted the operation asked for `concurrencyLimits.free`,
    // which is 2 -- and a planted mutation replacing the whole lookup with the
    // literal `2` PASSED IT. The assertion compared the shipped value against a
    // number that agreed with the defect. Found by planting the mutation, not
    // by reading the test (CLAUDE.md, 2026-08-26).
    //
    // The fix is to move the config off every plausible literal: 7 is not a
    // value any tier carries, so a hard-coded anything fails here. The config
    // is written through `appendConfigVersion`, so this is also the append-only
    // path an operator editing /admin/config would take.
    const { content } = await getActiveConfig(db);
    const DISTINCTIVE = 7;
    expect(
      Object.values(content.concurrencyLimits),
      "pick a limit no tier already uses, or the case stops discriminating"
    ).not.toContain(DISTINCTIVE);
    await appendConfigVersion(
      db,
      {
        ...content,
        concurrencyLimits: { ...content.concurrencyLimits, free: DISTINCTIVE },
      },
      "test"
    );
    const { provider } = ok();
    const { slots, log } = granting();
    await runInference(db, owner, profileId, provider, slots, REQ, new Date());
    expect(log.acquired[0].limit).toBe(DISTINCTIVE);
  });

  it("REFUSES with RunSlotBusyError at the workspace limit, and the vendor is never called", async () => {
    const { slots } = refusing("workspace_limit");
    // `never()` THROWS IF INVOKED, so "no model was called" is the stub's own
    // refusal rather than an assertion about a counter.
    const err = await runInference(
      db,
      owner,
      profileId,
      never(),
      slots,
      REQ,
      new Date()
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunSlotBusyError);
    expect((err as RunSlotBusyError).reason).toBe("workspace_limit");
    // THE TWO CLAIMS THE COPY MAKES, asserted rather than trusted: nothing was
    // spent, and the included build was not used. The second is what makes the
    // refusal safe to retry -- if a refused attempt consumed the free run, a
    // creator at their limit would be charged for pressing too fast.
    expect(await db.select().from(modelUsage)).toHaveLength(0);
    expect(
      (await db.select().from(creditLedger)).filter(
        (r) => r.refType === "inference"
      )
    ).toHaveLength(0);
  });

  it("a server_capacity refusal is a DIFFERENT reason, and never blames the creator's own runs", async () => {
    const { slots } = refusing("server_capacity");
    const err = await runInference(
      db,
      owner,
      profileId,
      never(),
      slots,
      REQ,
      new Date()
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunSlotBusyError);
    expect((err as RunSlotBusyError).reason).toBe("server_capacity");
    // The message must not blame the creator's own usage -- they may have none.
    expect((err as Error).message).not.toMatch(/this workspace already has/i);
    expect(await db.select().from(modelUsage)).toHaveLength(0);
  });

  it("RELEASES the slot when the VENDOR throws, so a failed run does not shrink the limit", async () => {
    // The leak this covers is silent and cumulative: every vendor failure would
    // permanently consume one of the tier's slots, so a workspace with a flaky
    // afternoon would end the day unable to generate at all -- the control
    // becoming the outage (CLAUDE.md, 2026-07-30).
    const { slots, log } = granting();
    await expect(
      runInference(
        db,
        owner,
        profileId,
        failing(new LlmRateLimitedError()),
        slots,
        REQ,
        new Date()
      )
    ).rejects.toThrow();
    expect(log.acquired).toHaveLength(1);
    expect(log.released, "released even though the call threw").toBe(1);
  });

  it("RELEASES the slot when the tail throws AFTER the vendor answered", async () => {
    // The other exit path, and the one furthest from the acquire: the model has
    // answered, `model_usage` has committed, and the DEBIT then refuses.
    // `finally` is what makes this case and the one above have the same answer.
    //
    // THE INTERLEAVING IS CREATED BY THE PROVIDER ITSELF, which is only
    // possible because the provider is a parameter: its `complete` opens a
    // pause while the "vendor" is working, so `debitCredits` -- which reads the
    // pause inside the step-9 transaction -- refuses on an attempt that has
    // already been paid for. No sleep, no clock, no race: the ordering is the
    // call stack.
    //
    // An earlier draft of this case tried to reach the refusal by running the
    // priced attempt against a zero balance. That refuses at the PRE-CALL check
    // (step 6), which is BEFORE the slot is taken -- so it asserted a release
    // that had no acquire, and passed for the wrong reason until the class
    // assertion caught it.
    await grant(500);
    const first = ok();
    await runInference(db, owner, profileId, first.provider, anySlots(), REQ, new Date());
    const paused: LlmProvider = {
      vendor: "stub-that-pauses-mid-call",
      complete: async () => {
        await db.transaction((tx) =>
          recordPauseStart(tx, ws, new Date(), new Date())
        );
        return {
          text: "hello",
          servedModel: "claude-sonnet-5",
          usage: {
            tokensIn: 10,
            tokensOut: 10,
            raw: { input_tokens: 10, output_tokens: 10 },
          },
        };
      },
    };
    const { slots, log } = granting();
    await expect(
      runInference(
        db,
        owner,
        profileId,
        paused,
        slots,
        { ...REQ, attemptId: "attempt-2" },
        new Date()
      )
    ).rejects.toThrow();
    // The spend record survives the refusal (R11), which is what makes this a
    // POST-call failure rather than a pre-call one -- without this assertion
    // the case could not tell the two apart.
    const rows = await db.select().from(modelUsage);
    expect(rows.map((r) => r.attemptId)).toContain("attempt-2");
    expect(log.acquired).toHaveLength(1);
    expect(log.released, "released after a post-call refusal").toBe(1);
  });

  it("the slot is taken AFTER the cheap refusals, so a paused workspace does not burn one", async () => {
    // ORDERING, and it is not cosmetic. A refusal that consumes a slot on its
    // way out lets a paused or archived workspace exhaust its own concurrency
    // by pressing a button that was never going to do anything.
    await db.transaction((tx) =>
      recordPauseStart(tx, ws, new Date(), new Date())
    );
    const { slots, log } = granting();
    await expect(
      runInference(db, owner, profileId, never(), slots, REQ, new Date())
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    expect(
      log.acquired,
      "no slot is taken for an attempt that was already refused"
    ).toEqual([]);
  });

  it("the (n+1)th run is refused while the first n are held, and allowed once one frees", async () => {
    // The semaphore's SHAPE without a database -- `bounded(1)` grants once and
    // then refuses, which is what the real advisory-lock keyspace does when
    // every key is held. Real contention across two connections is the Docker
    // suite's job; this asserts `runInference` does the right thing with the
    // answer it is given, in BOTH directions.
    const { slots } = bounded(1);
    const { provider } = ok();
    const held = await slots.acquire(ws, 1);
    expect(held.granted).toBe(true);
    const err = await runInference(
      db,
      owner,
      profileId,
      never(),
      slots,
      REQ,
      new Date()
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunSlotBusyError);
    // ...and once the holder gives its slot back, the same call goes through.
    // Without this half, an `acquire` hard-wired to refuse would also pass.
    if (held.granted) await held.lease.release();
    const second = await runInference(
      db,
      owner,
      profileId,
      provider,
      slots,
      REQ,
      new Date()
    );
    expect(second.attemptId).toBe(REQ.attemptId);
    expect(await db.select().from(modelUsage)).toHaveLength(1);
  });

  // ---------------------------- cost_state: absence is never a zero (D-M2-13)

  it("a failed attempt that reported NO usage is cost_state 'unknown', never an estimated 0", async () => {
    // MADE ROUTINE BY THE DEADLINE (R-40). An aborted call reports no usage, so
    // both token counts are 0 -- and arithmetic over zero tokens yields a
    // perfectly well-formed `0n` that would have been stamped `estimated`. That
    // is a POSITIVE CLAIM that the attempt cost us nothing, and for an abort it
    // is very likely false: the vendor may have processed and billed the input
    // before we hung up.
    //
    // THE DIRECTION IS WHAT MAKES IT SERIOUS. Understating cost OVERSTATES
    // margin, the direction tech-spec 2 and D-M2-13 both name as the one to
    // fail away from, on the single number pricing is tuned against.
    await expect(
      runInference(
        db,
        owner,
        profileId,
        failing(new LlmRateLimitedError()),
        anySlots(),
        REQ,
        new Date()
      )
    ).rejects.toThrow();
    const [row] = await db.select().from(modelUsage);
    expect(row.outcome).not.toBe("succeeded");
    expect(row.costState, "no usage report means we do NOT know the cost").toBe(
      "unknown"
    );
    expect(
      row.costMicroUsd,
      "and the CHECK constraint requires the cost to be NULL when it is unknown"
    ).toBeNull();
  });

  it("...but a SUCCESSFUL run still prices normally, so this is not just 'always unknown'", async () => {
    // THE DISCRIMINATING HALF. Without it the case above passes against a
    // `recordUsage` that gave up on pricing entirely -- which would report a
    // margin of nothing at all rather than a margin that is too good.
    const { provider } = ok({ tokensIn: 1000, tokensOut: 1000 });
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    const [row] = await db.select().from(modelUsage);
    expect(row.outcome).toBe("succeeded");
    expect(row.costState).toBe("estimated");
    expect(row.costMicroUsd).not.toBeNull();
    expect(BigInt(row.costMicroUsd as bigint)).toBeGreaterThan(0n);
  });

  // ------------------------------- the bookkeeping must not mask the vendor

  it("a FAILED model_usage write must not replace the vendor error that caused it", async () => {
    // WHY THIS MATTERS MORE THAN IT LOOKS. On the failure path the spend record
    // is written and THEN the vendor error is rethrown. If the write itself
    // throws, ITS error is what leaves the function -- and `e` is what every
    // downstream decision is made from: `billingErrorCode` reads
    // `LlmError.billable` to decide whether the creator's included build was
    // consumed, and the copy table maps the class to a sentence. Losing it
    // turns a named, true refusal into "Something went wrong", on a path where
    // money may already be gone.
    //
    // DRIVEN BY BREAKING THE DATABASE, not by mocking `recordUsage`: the
    // subject is what `runInference` does when its bookkeeping fails, and a
    // stubbed-out `recordUsage` would be testing the stub. The proxy only
    // starts refusing once the vendor has thrown, so every pre-call read runs
    // against the real handle.
    let vendorFailed = false;
    const bookkeepingFailure = new Error("model_usage write failed");
    const vendorFailure = new LlmRateLimitedError();
    const provider: LlmProvider = {
      vendor: "stub-that-fails",
      complete: async () => {
        vendorFailed = true;
        throw vendorFailure;
      },
    };
    const brokenDb = new Proxy(db as object, {
      get(target, prop) {
        if (prop === "transaction" && vendorFailed) {
          return () => Promise.reject(bookkeepingFailure);
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as typeof db;

    const err = await runInference(
      brokenDb,
      owner,
      profileId,
      provider,
      anySlots(),
      REQ,
      new Date()
    ).catch((e: unknown) => e);

    // THE VENDOR ERROR IS WHAT LEAVES -- the same instance, so its class and
    // its `billable` flag both survive.
    expect(err).toBe(vendorFailure);
    expect(err).not.toBe(bookkeepingFailure);
    // ...AND THE BOOKKEEPING FAILURE IS NOT SWALLOWED. Without this half the
    // test would pass against a bare `catch {}`, which loses the fact that a
    // spend record is missing -- the silence this repo has shipped before.
    expect((err as Error).cause).toBe(bookkeepingFailure);
  });

  // --------------------------------------- the overall deadline (CHANGE 6)

  it("hands the provider a signal, so the bound spans the RETRY LOOP not one attempt", async () => {
    const { provider, calls } = ok();
    await runInference(db, owner, profileId, provider, anySlots(), REQ, new Date());
    const signal = calls[0].signal;
    expect(signal, "no signal means the ~181s worst case is back").toBeDefined();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal!.aborted, "not already spent when the call starts").toBe(false);
  });

  it("the deadline is SHORTER than timeoutMs x (maxRetries + 1), or it bounds nothing new", async () => {
    // The whole reason the key exists. If this stops holding, the deadline is
    // not bounding anything the per-attempt timeout did not already bound, and
    // the tech-spec budget is breached again.
    const { content } = await getActiveConfig(db);
    const worstCaseWithoutIt =
      content.llm.timeoutMs * (content.llm.maxRetries + 1);
    expect(content.llm.overallDeadlineMs).toBeLessThan(worstCaseWithoutIt);
    // ...and inside the budget it exists to protect (full script under 45s),
    // with room left over for the post-call commit and the debit.
    expect(content.llm.overallDeadlineMs).toBeLessThan(45_000);
  });

  it("the OPERATION is bounded even when the provider IGNORES the signal", async () => {
    // THE DEFECT THE PRODUCTION GATE FOUND, written as the test that closes it.
    //
    // Passing a signal bounds the SDK's REQUESTS. It does not bound the sleeps
    // between them: `@anthropic-ai/sdk@0.71.2`'s retry backoff is
    // `await sleep(ms)` with no signal, and it honours a vendor `retry-after`
    // of up to 60s — so a 429 could hold the slot, a pool connection and a
    // server-action worker for ~85s against a 40s deadline.
    //
    // THE STUB IGNORES THE SIGNAL ON PURPOSE. That is not a contrived fixture:
    // it is precisely what the SDK does inside its backoff, so a provider that
    // honoured the signal would test the half that already worked. If
    // `runInference` only passed the signal along, this case would hang until
    // vitest killed it.
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, llm: { ...content.llm, overallDeadlineMs: 30 } },
      "test"
    );
    let stubFinished = false;
    const ignoresSignal: LlmProvider = {
      vendor: "stub-that-ignores-the-deadline",
      complete: async () => {
        await new Promise((r) => setTimeout(r, 3_000));
        stubFinished = true;
        return {
          text: "too late",
          servedModel: "claude-sonnet-5",
          usage: { tokensIn: 1, tokensOut: 1, raw: { input_tokens: 1 } },
        };
      },
    };
    const started = Date.now();
    const err = await runInference(
      db,
      owner,
      profileId,
      ignoresSignal,
      anySlots(),
      REQ,
      new Date()
    ).catch((e: unknown) => e);
    const elapsed = Date.now() - started;

    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect(
      elapsed,
      "the operation returned on the DEADLINE, not on the provider"
    ).toBeLessThan(2_000);
    expect(
      stubFinished,
      "and it did not wait for the provider that ignored the bound"
    ).toBe(false);
    // A timeout is NOT billable, so the creator keeps their included run — the
    // generous direction, and the one the copy promises.
    const [row] = await db.select().from(modelUsage);
    expect(row.outcome).toBe("unavailable");
    expect(USAGE_OUTCOME_BILLABLE.unavailable).toBe(false);
  });

  it("the slot is RELEASED when the deadline fires, not held by the abandoned call", async () => {
    // The exit path the race adds. `provider.complete` is still running when
    // `runInference` returns, so if the slot were tied to that promise rather
    // than to the `finally`, a timed-out run would hold its slot for as long as
    // the vendor felt like taking — turning a deadline into a leak.
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(
      db,
      { ...content, llm: { ...content.llm, overallDeadlineMs: 30 } },
      "test"
    );
    const { slots, log } = granting();
    await expect(
      runInference(
        db,
        owner,
        profileId,
        {
          vendor: "stub-that-ignores-the-deadline",
          complete: async () => {
            await new Promise((r) => setTimeout(r, 3_000));
            return {
              text: "too late",
              servedModel: "claude-sonnet-5",
              usage: { tokensIn: 1, tokensOut: 1, raw: { input_tokens: 1 } },
            };
          },
        },
        slots,
        REQ,
        new Date()
      )
    ).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(log.acquired).toHaveLength(1);
    expect(log.released, "released on the deadline path too").toBe(1);
  });

  it("the signal really ABORTS, at the deadline the stored config names", async () => {
    // NOT an assertion that a number was passed somewhere: the signal is
    // observed FIRING, inside the vendor call, at a deadline that came out of
    // the database. That is the property the real call experiences.
    //
    // REAL TIMERS, and a tiny deadline written to config, rather than fake
    // timers: `AbortSignal.timeout` schedules its timer when the signal is
    // CONSTRUCTED, which happens inside `runInference` -- so a
    // `vi.useFakeTimers()` installed after the call returns has nothing left to
    // advance, and the first draft of this case failed for exactly that reason.
    // Shrinking the config value tests the same wire in the same direction and
    // needs no clock control at all.
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(db, {
      ...content,
      llm: { ...content.llm, overallDeadlineMs: 20 },
    }, "test");
    let abortedDuringCall: boolean | null = null;
    const slow: LlmProvider = {
      vendor: "stub-slower-than-the-deadline",
      complete: async (req) => {
        await new Promise((r) => setTimeout(r, 120));
        abortedDuringCall = req.signal?.aborted ?? null;
        return {
          text: "hello",
          servedModel: "claude-sonnet-5",
          usage: {
            tokensIn: 1,
            tokensOut: 1,
            raw: { input_tokens: 1, output_tokens: 1 },
          },
        };
      },
    };
    // THE OPERATION NOW REJECTS ON THE DEADLINE — it no longer waits for a
    // provider that ignores the bound (production CHANGE 4). This case is
    // about the OTHER half: that the signal genuinely reaches the vendor call,
    // so the in-flight HTTP request is really cancelled rather than merely
    // abandoned. Both halves matter — the race stops us WAITING, the signal
    // stops the request COSTING.
    await expect(
      runInference(db, owner, profileId, slow, anySlots(), REQ, new Date())
    ).rejects.toBeInstanceOf(LlmUnavailableError);
    // The stub is still in flight when the operation returns; wait for it so
    // the flag it sets is readable.
    await new Promise((r) => setTimeout(r, 200));
    expect(
      abortedDuringCall,
      "the signal did not reach the provider — the vendor request was abandoned rather than cancelled"
    ).toBe(true);
  });

});

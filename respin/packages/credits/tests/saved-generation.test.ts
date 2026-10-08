// THE SAVED RECORDING PACK, FROM THE PACKAGE (launch L4, R-153).
//
// Generate -> revise -> select -> reopen, through the REAL money path
// (`generate`, a paid tier set through the `setTier` authority pattern, the
// one debit per operation) and then the read, on BOTH backends: PGlite always,
// and real Postgres when `TEST_DATABASE_URL` is set (the plan's E-27 proof).
//
// THE INSTRUMENT for "a read spends nothing": the read functions take no
// provider at all, and every case counts `credit_ledger`, `model_usage` and
// `generation_attempts` before and after — a read that wrote any of them, or
// re-entered `generate`, turns these red. The revision presses use a provider
// that answers by call kind; every other provider here THROWS if called.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  BASIS_EXCERPT_MIN_WORDS,
  EVENT_CONFIRMATION_ITEM,
} from "@respin/modes";
import {
  CreativePieceError,
  ProfileRoleError,
  WorkspacePausedError,
  autopsies,
  createTrendSource,
  recordSharedTrendItem,
  recordSharedTrendTranscript,
  users,
  brainActivationSnapshots,
  brainDocs,
  createDockerTestDb,
  createTestDb,
  creatorProfiles,
  creativePieces,
  creditLedger,
  ensureUserWorkspace,
  generationAttempts,
  generations,
  memberships,
  modelUsage,
  pausePeriods,
  seedAuthUser,
  seedDb,
  subscriptions,
  withWorkspace,
  type DbLike,
  type VerifiedWorkspaceId,
  type WorkspaceScope,
} from "@respin/db";
import type { LlmProvider } from "@respin/llm";
import { appendConfigVersion, getActiveConfig } from "@respin/config";
import { createProfile } from "../src/profiles";
import { grantCredits } from "../src/ledger";
import { generate } from "../src/generate";
import { selectConcept } from "../src/creative-work";
import {
  GenerationQuoteChangedError,
  RevisionParentError,
  RevisionPresetError,
} from "../src/errors";
import { InferenceRoleError } from "../src/inference";
import { PRESENTED_DISCLOSURE_GUIDANCE } from "../src/presented-output";
import {
  MODEL_DISCLOSURE_FIELD_PREFIX,
  REVISION_PRESETS,
  RECENT_SAVED_MAX,
  readSavedGeneration,
  readSavedKillTest,
  recentSavedGenerations,
  reviseSaved,
  selectSavedVersion,
  type SavedGenerationRead,
  type SavedGenerationView,
} from "../src/saved-generation";
import { anySlots } from "./support/run-slots";
import {
  CLAIM_ONLY_REASONING,
  MIXED_CAUSE_REASONING,
  PLATFORM,
  hooksOutput,
  killTestReply,
  withReasoning,
} from "./support/generation-fixtures";
import { FORM_INPUT, legacyIdeas, v2Ideas, v2Script } from "./support/form-fixtures";
import type { GenerateResult } from "../src/generate";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;
if (!MAINTENANCE_URL) {
  console.warn(
    "[credits saved-generation.test] the REAL-POSTGRES half SKIPPED - TEST_DATABASE_URL is not set. NOT PROVEN in this run on a real server (the PGlite half still runs): that generate -> revise -> select -> reopen reads back the exact selected version with zero provider calls and zero ledger, usage or claim rows, that a stale selection is refused, and that the wrong-scope, tombstone and membership refusals hold. Set TEST_DATABASE_URL=postgres://respin:respin_local_dev@localhost:5435/respin."
  );
}

/** A distinctive model-authored disclosure sentence that must never leave the package. */
const MODEL_GUIDANCE = "use the built in label zqxvmodelsentence on the post";

/** The instrument: a provider whose invocation fails the test. */
const never = (): LlmProvider => ({
  vendor: "must-not-be-called",
  complete: async () => {
    throw new Error("a saved-pack READ called the vendor");
  },
});

/** Answers the scoring prompt with a pass, and every draft call with `draft`. */
function byKind(draft: object): { provider: LlmProvider; calls: () => number } {
  const state = { calls: 0 };
  return {
    provider: {
      vendor: "by-kind",
      complete: async (req) => {
        state.calls += 1;
        return {
          text: req.system.startsWith("You score") ? killTestReply(["/rules/0"]) : JSON.stringify(draft),
          servedModel: "claude-sonnet-5",
          usage: { tokensIn: 10, tokensOut: 5, raw: { input_tokens: 10, output_tokens: 5 } },
        };
      },
    },
    calls: () => state.calls,
  };
}

/**
 * Answers the scoring prompt with a pass, and the Nth draft call with
 * `drafts[N]` — the instrument for R-173's draft-then-rewrite sequences. A
 * draft call past the script fails the test.
 */
function drafting(drafts: readonly object[]): { provider: LlmProvider; draftCalls: () => number } {
  const state = { drafts: 0 };
  return {
    provider: {
      vendor: "drafting",
      complete: async (req) => {
        if (req.system.startsWith("You score")) {
          return { text: killTestReply(["/rules/0"]), servedModel: "claude-sonnet-5", usage: { tokensIn: 10, tokensOut: 5, raw: { input_tokens: 10, output_tokens: 5 } } };
        }
        const draft = drafts[state.drafts];
        state.drafts += 1;
        if (draft === undefined) throw new Error(`draft call ${state.drafts} was not scripted`);
        return { text: JSON.stringify(draft), servedModel: "claude-sonnet-5", usage: { tokensIn: 10, tokensOut: 5, raw: { input_tokens: 10, output_tokens: 5 } } };
      },
    },
    draftCalls: () => state.drafts,
  };
}

/** The script with a model disclosure we can look for, and a shorter revision of it. */
function scriptReply() {
  return { ...v2Script("explain_opinion"), disclosure: { platform: "tiktok", guidance: MODEL_GUIDANCE } };
}
/** The Spin reference's bounded analysis (the trends fixtures' shape). */
const SPIN_REFERENCE = {
  hookMechanic: "open on a visible renovation regret",
  beats: ["show the cabinet-paint shortcut", "turn on the hidden preparation cost", "return to the weekend constraint"],
  ending: "name the preparation step that would have prevented the regret",
  followTrigger: "compare one slower preparation choice",
  subjectTerms: ["kitchen renovation", "cabinet paint", "weekend makeover"],
  hook: "I painted my kitchen cabinets in one weekend and regret every shortcut",
  structure: { beatCount: 3, turnBeat: 1 },
} as const;

/** A full-script document for the two modes that read other material (Spin, source reel). */
function fullScriptReply(firstHook: string) {
  return {
    thesis: { statement: "You lose more takes to a setting you never checked than to nerves", why: "a reshoot traces back to one dial" },
    framework: { name: "the evidence tutorial", why: "the cost is the reshoot nobody sees" },
    hooks: [
      { text: firstHook, mechanic: "contradiction" },
      { text: "The setting you skipped is the one your viewer notices first", mechanic: "cost reveal" },
      { text: "Nobody tells you the boring part is where the work happens", mechanic: "withheld detail" },
    ],
    beats: [
      { atSeconds: 0, vo: "open on the take that failed and say why you kept it", isTurn: false },
      { atSeconds: 6, vo: "here is the dial nobody checks before a lens change", isTurn: true },
      { atSeconds: 14, vo: "show the same shot again with the dial set correctly", isTurn: false },
      { atSeconds: 20, vo: "keep the one take that proves the point", isTurn: false },
    ],
    shotMap: [{ beatIndex: 1, shot: "close on the dial", note: "hold it long enough to read" }],
    onScreenText: [{ atSeconds: 7, text: "the dial nobody checks" }],
    caption: { text: "The reshoot nobody sees is the one that costs you the whole day.", hashtags: ["filmmaking"] },
    whyThisPerforms: {
      reasoning: "It opens on a cost the viewer already recognises and hands them one thing to copy today.",
      weakestPoint: "None of this has been checked against how your own audience actually behaves.",
    },
    disclosure: { platform: "tiktok", guidance: MODEL_GUIDANCE },
  };
}
const spinReply = (firstHook = "You are shooting three takes when one honest take would do") => fullScriptReply(firstHook);
const reelReply = () => fullScriptReply("You are shooting three takes when one honest take would do");
/** A source that shares no eight-word run with `reelReply()`. */
const SOURCE_TEXT =
  "An essay on exposure for people who film alone: most missed shots come from a setting left unchecked, rarely from the lens chosen.";

function shorterReply() {
  const s = scriptReply();
  return {
    ...s,
    beats: [
      { atSeconds: 0, vo: "most people change the lens again and again before they check one dial", isTurn: false },
      { atSeconds: 6, vo: "here is the dial nobody checks before a lens change", isTurn: true, pivot: "turn" },
    ],
  };
}

type Backend = {
  name: string;
  open: () => Promise<{ db: DbLike; close: () => Promise<void> }>;
};

const BACKENDS: Backend[] = [
  {
    name: "PGlite",
    open: async () => {
      const db = await createTestDb();
      await seedDb(db);
      return { db: db as unknown as DbLike, close: async () => {} };
    },
  },
  ...(MAINTENANCE_URL
    ? [
        {
          name: "REAL Postgres",
          open: async () => {
            const harness = await createDockerTestDb(MAINTENANCE_URL, "respin_test_savedgen");
            await seedDb(harness.db);
            return { db: harness.db as unknown as DbLike, close: () => harness.pool.end() };
          },
        },
      ]
    : []),
];

describe.each(BACKENDS)("the saved recording pack on $name", (backend) => {
  let db: DbLike;
  let close: () => Promise<void>;
  let owner: WorkspaceScope;
  let ws: VerifiedWorkspaceId;
  let profileId: string;
  let user: string;
  let rightsSubjectUserId: string;
  let n = 0;

  beforeAll(async () => {
    if (backend.name !== "PGlite") ({ db, close } = await backend.open());
  }, 120_000);
  afterAll(async () => {
    if (backend.name !== "PGlite") await close?.();
  });

  beforeEach(async () => {
    if (backend.name === "PGlite") ({ db, close } = await backend.open());
    n += 1;
    user = `saved_user_${Date.now()}_${n}`;
    await seedAuthUser(db as unknown as Parameters<typeof seedAuthUser>[0], user, `${user}@test.dev`);
    rightsSubjectUserId = (await ensureUserWorkspace(db, { authUserId: user, name: `W${n}` })).user.id;
    owner = await withWorkspace(db, { authUserId: user });
    ws = owner.workspaceId;
    profileId = (await createProfile(db, owner, "Anna", new Date())).id;
    await activateBrain(profileId);
  }, 60_000);

  async function activateBrain(forProfile: string): Promise<void> {
    const evidence = [{ field: "/register", quote: "c", inputId: "00000000-0000-4000-8000-000000000001", startUtf16: 0, endUtf16: 1 }];
    const confirmed = { confirmedAt: new Date(), confirmedContentSha256: "0".repeat(64), activatedAt: new Date() };
    const [voice] = await db.insert(brainDocs).values({
      profileId: forProfile, workspaceId: ws, kind: "voice", version: 1,
      content: { register: "plain and direct", sentenceRhythm: "short lines", signatureMoves: ["opens on what went wrong"], avoid: ["never uses hype words"] },
      reason: "Version 1: you edited this document.", sourceEvidence: evidence, status: "active", ...confirmed,
    }).returning();
    const [killtest] = await db.insert(brainDocs).values({
      profileId: forProfile, workspaceId: ws, kind: "killtest", version: 1,
      content: { rules: ["it must not sound like an advert"] },
      reason: "Version 1: you edited this document.", sourceEvidence: evidence, status: "active", ...confirmed,
    }).returning();
    await db.insert(brainActivationSnapshots).values({
      profileId: forProfile, workspaceId: ws, voiceDocId: voice.id, killtestDocId: killtest.id,
    });
  }

  async function setTier(tier: "creator"): Promise<void> {
    if ((await db.select().from(subscriptions)).some((r) => r.workspaceId === (ws as string))) return;
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(db, { ...content, stripePriceMap: { ...content.stripePriceMap, [`price_${tier}`]: tier } }, "test-admin");
    await db.insert(subscriptions).values({
      workspaceId: ws, stripeCustomerId: `cus_${ws}`, stripeSubscriptionId: `sub_${ws}`,
      stripePriceId: `price_${tier}`, status: "active",
    });
  }
  const grant = (amount: number) =>
    db.transaction((tx) =>
      grantCredits(tx, {
        workspaceId: ws, amount, expiresAt: new Date(Date.now() + 365 * 24 * 3600_000),
        refType: "test", refId: `grant-${ws}-${amount}-${Math.random()}`, configVersion: 1,
      })
    );

  /** Every row a read must never write, counted for this workspace. */
  async function footprint() {
    const ledger = (await db.select().from(creditLedger)).filter((r) => r.workspaceId === (ws as string));
    const usage = (await db.select().from(modelUsage)).filter((r) => r.workspaceId === (ws as string));
    const claims = (await db.select().from(generationAttempts)).filter((r) => r.workspaceId === (ws as string));
    return { ledger: ledger.length, usage: usage.length, claims: claims.length };
  }

  /** Concepts -> choose -> commission: a paid, settled, v2 script of a piece. */
  async function scriptedPiece() {
    await setTier("creator");
    await grant(100);
    const ideas = byKind(v2Ideas(["explain_opinion"]));
    await generate(db, owner, profileId, ideas.provider, anySlots(), {
      mode: "ideation", attemptId: `ideas-${n}`, input: FORM_INPUT, platform: PLATFORM, creative: { formChoice: "auto" },
    }, new Date());
    const piece = await selectConcept(db, owner, profileId, { sourceAttemptId: `ideas-${n}`, ideaIndex: 0 }, new Date());
    const script = await generate(db, owner, profileId, byKind(scriptReply()).provider, anySlots(), {
      mode: "ideaToScript", attemptId: piece.operationAttemptId, input: FORM_INPUT, platform: PLATFORM, pieceId: piece.pieceId,
    }, new Date());
    expect(script.generation.outcome).toBe("usable");
    return { pieceId: piece.pieceId, scriptAttemptId: script.attemptId, ideasAttemptId: `ideas-${n}` };
  }

  const saved = (read: SavedGenerationRead): SavedGenerationView => {
    if (read.status !== "saved") throw new Error(`expected a saved view, got ${read.status}`);
    return read.view;
  };

  it("GENERATE -> REVISE -> SELECT -> REOPEN: the selected version reads back exactly, and reopening it spends NOTHING", async () => {
    const p = await scriptedPiece();
    const { content } = await getActiveConfig(db);

    // REVISE: one press of a fixed preset — a same-mode revision, one debit at
    // the configured REVISION price, the parent being the version shown.
    const before = await footprint();
    const reviser = byKind(shorterReply());
    const revised = await reviseSaved(db, owner, profileId, reviser.provider, anySlots(), {
      attemptId: `rev-${n}`, parentAttemptId: p.scriptAttemptId, preset: "shorter", quotedConfigVersion: await activeVersion(),
    }, new Date());
    expect(revised.generation.outcome).toBe("usable");
    expect(revised.generation.mode).toBe("ideaToScript");
    expect(revised.creditsChargedNow).toBe(content.creditCosts.revision);
    const [parentRow] = await db.select().from(generations).where(eq(generations.attemptId, p.scriptAttemptId));
    expect(revised.generation.parentId).toBe(parentRow.id);
    expect((revised.generation.request as { input?: unknown }).input).toBe("Make it shorter.");
    const afterRevise = await footprint();
    expect(afterRevise.ledger - before.ledger).toBe(1);
    expect(afterRevise.claims - before.claims).toBe(1);

    // THE COST AND THE PARENT WERE DISCLOSED BEFORE THE PRESS: the parent's
    // own view states the configured revision price.
    const parentView = saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date()));
    expect(parentView.revision).toEqual({
      revisable: true, blocked: null, credits: content.creditCosts.revision, quoteConfigVersion: await activeVersion(), inPlan: true,
    });
    // ...and the parent's page lists the revision it now has (M2).
    expect(parentView.revisions.map((r) => r.attemptId)).toEqual([`rev-${n}`]);

    // SELECT the revision — zero cost, under the version token the page showed.
    const revisedView = saved(await readSavedGeneration(db, owner, profileId, `rev-${n}`, new Date()));
    expect(revisedView.piece?.isSelected).toBe(false);
    expect(revisedView.piece?.selectable).toBe(true);
    expect(revisedView.lineage.parent).toEqual({ attemptId: p.scriptAttemptId, modeLabel: parentView.modeLabel });
    const preSelect = await footprint();
    const moved = await selectSavedVersion(db, owner, profileId, {
      attemptId: `rev-${n}`, pieceId: p.pieceId, expectedVersion: revisedView.piece!.version,
    });
    expect(moved.version).toBe(revisedView.piece!.version + 1);
    expect(await footprint()).toEqual(preSelect);

    // REOPEN — "close the context and authenticate again": a FRESH scope, the
    // same attempt id, many reads. Nothing is written, nothing is called.
    const fresh = await withWorkspace(db, { authUserId: user });
    const preRead = await footprint();
    const reads = await Promise.all([1, 2, 3].map(() => readSavedGeneration(db, fresh, profileId, `rev-${n}`, new Date())));
    const view = saved(reads[0]);
    expect(await footprint()).toEqual(preRead);
    expect(reads.map((r) => JSON.stringify(r))).toEqual(reads.map(() => JSON.stringify(reads[0])));
    expect(view.piece?.isSelected).toBe(true);
    expect(view.piece?.selectedAttemptId).toBe(`rev-${n}`);
    expect(view.piece?.versions.map((v) => [v.attemptId, v.isSelected, v.isThis, v.parentAttemptId])).toEqual([
      [p.scriptAttemptId, false, false, null],
      [`rev-${n}`, true, true, p.scriptAttemptId],
    ]);
    expect(view.lineage.source).toEqual({ attemptId: p.ideasAttemptId, ideaIndex: 0 });
    // THE EXACT VERSION: the stored beats of the revision, as stored.
    const [stored] = await db.select().from(generations).where(eq(generations.attemptId, `rev-${n}`));
    expect(view.output?.beats).toEqual((stored.output as { beats: unknown }).beats);
    expect(view.output?.contractVersion).toBe(2);
    expect(view.weakestPoint).toBe(stored.weakestPoint);
    // ...and an unparsed v2 output never reaches the DTO: the server's checks ride along.
    expect(view.output?.contractVersion === 2 ? view.output.serverChecks : undefined).toBeDefined();
  });

  it("THE MODEL'S DISCLOSURE NEVER LEAVES THE PACKAGE, NOR A MODEL NOTE QUOTING IT: product guidance, no finding in the model's section, and each rule verdict named by the creator's own rule text; a verdict note and a hard-rule finding planted with the model's disclosure sentence reach no DTO field", async () => {
    const p = await scriptedPiece();
    // A stored finding INSIDE the model's disclosure and one outside it; a
    // creator-rule verdict whose MODEL NOTE quotes the model's disclosure; and
    // a hard-rule finding pointing into the disclosure (A1, A6).
    const [row] = await db.select().from(generations).where(eq(generations.attemptId, p.scriptAttemptId));
    const kt = row.killTest as Record<string, unknown>;
    const final = kt.finalAttempt as Record<string, unknown>;
    await db.update(generations).set({
      killTest: {
        ...kt,
        creatorRuleVerdicts: [{ ruleId: "/rules/0", passed: false, note: `it says to ${MODEL_GUIDANCE}` }],
        finalAttempt: {
          ...final,
          hardRules: [{ rule: "forbidden_claim", field: "/disclosure/guidance", excerpt: MODEL_GUIDANCE, remedy: "r" }],
          traceability: [
            { kind: "currency", shape: "currency", enforcement: "flag", token: "$4,000", field: "/disclosure/guidance", unit: MODEL_GUIDANCE, startUtf16: 0, endUtf16: 1 },
            { kind: "proper_noun", shape: "proper-noun", enforcement: "flag", token: "Lagos", field: "/hooks/0/text", unit: "I filmed in Lagos.", startUtf16: 0, endUtf16: 1 },
          ],
          claims: [{ shape: "skip the label", family: "concealment", enforcement: "flag", token: "skip the label", field: "/disclosure/guidance", unit: MODEL_GUIDANCE }],
        },
      },
    }).where(eq(generations.id, row.id));
    const view = saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date()));
    expect(JSON.stringify(view)).not.toContain("zqxvmodelsentence");
    expect(view.output?.disclosure).toEqual({ platform: PLATFORM, guidance: PRESENTED_DISCLOSURE_GUIDANCE.policy_check_required });
    expect(view.disclosureGuidance).toBe(PRESENTED_DISCLOSURE_GUIDANCE.policy_check_required);
    expect(view.killTest?.finalAttempt.traceability.map((f) => f.token)).toEqual(["Lagos"]);
    expect(view.killTest?.finalAttempt.claims).toEqual([]);
    for (const f of view.killTest?.finalAttempt.traceability ?? []) {
      expect(f.field.startsWith(MODEL_DISCLOSURE_FIELD_PREFIX)).toBe(false);
    }
    // THE VERDICT: pass/fail and the CREATOR's rule from the kill-test document
    // this generation ran under; the model's note is gone (A1).
    expect(view.killTest?.creatorRuleVerdicts).toEqual([{ ruleId: "/rules/0", passed: false, ruleText: "it must not sound like an advert" }]);
    expect(JSON.stringify(view.killTest)).not.toContain('"note"');
    // THE WITHHELD HARD RULE is counted, not shown (A6).
    expect(view.killTest?.finalAttempt.hardRules).toEqual([]);
    expect(view.killTest?.disclosureHardRulesWithheld).toBe(true);
  });

  it("LEGACY AND NEW OUTPUTS: an unversioned stored output reads as legacy, a stamped one as version 2 with its confirmation item", async () => {
    await setTier("creator");
    await grant(100);
    await generate(db, owner, profileId, byKind(hooksOutput()).provider, anySlots(), {
      mode: "hooks", attemptId: `hooks-${n}`, input: "what my first year actually looked like", platform: PLATFORM,
    }, new Date());
    const legacy = saved(await readSavedGeneration(db, owner, profileId, `hooks-${n}`, new Date()));
    expect(legacy.output?.contractVersion).toBeUndefined();
    expect(legacy.output?.hooks?.length).toBe(hooksOutput().hooks!.length);
    expect(legacy.piece).toBeNull();
    expect(legacy.lineage).toEqual({ parent: null, source: null });
    const p = await scriptedPiece();
    const v2 = saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date()));
    expect(v2.output?.contractVersion).toBe(2);
    expect(EVENT_CONFIRMATION_ITEM.length).toBeGreaterThan(0);
  });

  it("MISSING, PENDING, NOT STORED, UNSUPPORTED AND CORRUPT are honest, NON-SPENDING states — nothing is regenerated", async () => {
    const p = await scriptedPiece();
    const before = await footprint();
    const status = async (id: string) => (await readSavedGeneration(db, owner, profileId, id, new Date())).status;
    expect(await status("no-such-attempt")).toBe("missing");
    expect(await status("")).toBe("missing");
    expect(await status("x".repeat(500))).toBe("missing");
    // A claim with no generation: in flight, then refused, then recovery required.
    await db.insert(generationAttempts).values({
      profileId, workspaceId: ws, attemptId: `claim-${n}`, purpose: "generation", mode: "hooks", payloadSha256: "c".repeat(64),
    });
    expect(await status(`claim-${n}`)).toBe("pending");
    await db.update(generationAttempts).set({ state: "refused", refusalCode: "vendor_failed", terminalAt: new Date() }).where(eq(generationAttempts.attemptId, `claim-${n}`));
    const refused = await readSavedGeneration(db, owner, profileId, `claim-${n}`, new Date());
    expect(refused).toEqual({ status: "not_stored", claim: "refused" });
    await db.update(generationAttempts).set({ state: "recovery_required", refusalCode: null, vendorStartedAt: new Date() }).where(eq(generationAttempts.attemptId, `claim-${n}`));
    expect(await readSavedGeneration(db, owner, profileId, `claim-${n}`, new Date())).toEqual({ status: "not_stored", claim: "recovery_required" });
    // A stored output from a NEWER contract, then a DAMAGED one.
    const [row] = await db.select().from(generations).where(eq(generations.attemptId, p.scriptAttemptId));
    await db.update(generations).set({ output: { ...(row.output as object), contractVersion: 3 } }).where(eq(generations.id, row.id));
    expect(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date())).toEqual({ status: "unreadable", reason: "unsupported_contract" });
    await db.update(generations).set({ output: { beats: "not a list" } }).where(eq(generations.id, row.id));
    expect(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date())).toEqual({ status: "unreadable", reason: "corrupt" });
    // An unreadable stored CHECK is said, never shown as an empty list.
    await db.update(generations).set({ output: row.output, killTest: { outcome: "passed" } }).where(eq(generations.id, row.id));
    expect(saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date())).killTest).toBeNull();
    // Only the one raw claim row this case inserted; no ledger, no usage.
    const after = await footprint();
    expect(after).toEqual({ ...before, claims: before.claims + 1 });
  });

  it("WRONG SCOPE: another profile's attempt is missing; another profile id under this scope is refused by the cage; nothing is selected or revised across it", async () => {
    const p = await scriptedPiece();
    const [sibling] = await db.insert(creatorProfiles).values({ workspaceId: ws, displayName: "Bo" }).returning();
    expect((await readSavedGeneration(db, owner, sibling.id, p.scriptAttemptId, new Date())).status).toBe("missing");
    const reason = async (run: () => Promise<unknown>) => {
      try {
        await run();
        return "accepted";
      } catch (e) {
        if (e instanceof CreativePieceError || e instanceof RevisionParentError) return e.reason;
        return (e as Error).name;
      }
    };
    expect(await reason(() => selectSavedVersion(db, owner, sibling.id, { attemptId: p.scriptAttemptId, pieceId: p.pieceId, expectedVersion: 2 }))).toBe("not_found");
    expect(await reason(() => reviseSaved(db, owner, sibling.id, never(), anySlots(), { attemptId: `x-${n}`, parentAttemptId: p.scriptAttemptId, preset: "shorter", quotedConfigVersion: 1 }, new Date()))).toBe("not_this_creators");
    // ANOTHER WORKSPACE: its owner cannot name this profile at all.
    const other = `saved_other_${Date.now()}_${n}`;
    await seedAuthUser(db as unknown as Parameters<typeof seedAuthUser>[0], other, `${other}@test.dev`);
    await ensureUserWorkspace(db, { authUserId: other, name: "Other" });
    const otherScope = await withWorkspace(db, { authUserId: other });
    expect(await reason(() => readSavedGeneration(db, otherScope, profileId, p.scriptAttemptId, new Date()))).toBe("ProfileAccessError");
    const [piece] = await db.select().from(creativePieces).where(eq(creativePieces.id, p.pieceId));
    expect(piece.version).toBe(2);
  });

  it("STALE SELECTION is refused and changes nothing; re-choosing the selected version is a no-op", async () => {
    const p = await scriptedPiece();
    await reviseSaved(db, owner, profileId, byKind(shorterReply()).provider, anySlots(), {
      attemptId: `rev-${n}`, parentAttemptId: p.scriptAttemptId, preset: "natural", quotedConfigVersion: await activeVersion(),
    }, new Date());
    const shown = saved(await readSavedGeneration(db, owner, profileId, `rev-${n}`, new Date())).piece!.version;
    await selectSavedVersion(db, owner, profileId, { attemptId: `rev-${n}`, pieceId: p.pieceId, expectedVersion: shown });
    // The ORIGINAL's page was rendered before the move: its token is stale now.
    let reason = "accepted";
    try {
      await selectSavedVersion(db, owner, profileId, { attemptId: p.scriptAttemptId, pieceId: p.pieceId, expectedVersion: shown });
    } catch (e) {
      reason = (e as CreativePieceError).reason;
    }
    expect(reason).toBe("stale");
    const [row] = await db.select().from(creativePieces).where(eq(creativePieces.id, p.pieceId));
    const [rev] = await db.select().from(generations).where(eq(generations.attemptId, `rev-${n}`));
    expect(row.selectedGenerationId).toBe(rev.id);
    expect(row.version).toBe(shown + 1);
    // Re-choosing the version that IS selected, even on the stale token, is a no-op.
    const again = await selectSavedVersion(db, owner, profileId, { attemptId: `rev-${n}`, pieceId: p.pieceId, expectedVersion: shown });
    expect(again.version).toBe(shown + 1);
  });

  it("ZERO BALANCE AND A PAUSE KEEP READ RIGHTS; a pause refuses the selection; a TOMBSTONE and a LOST MEMBERSHIP refuse the read", async () => {
    const p = await scriptedPiece();
    // Spend the balance to zero with a raw debit row of the ledger's own shape.
    const balanceRows = (await db.select().from(creditLedger)).filter((r) => r.workspaceId === (ws as string));
    const balance = balanceRows.reduce((sum, r) => sum + r.delta, 0);
    await db.insert(creditLedger).values({ workspaceId: ws, delta: -balance, kind: "debit", refType: "test", refId: `zero-${n}`, configVersion: 1 });
    expect(saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date())).attemptId).toBe(p.scriptAttemptId);
    await db.insert(pausePeriods).values({ workspaceId: ws, startedAt: new Date(Date.now() - 60_000), startedKnownAt: new Date(Date.now() - 60_000) });
    const view = saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date()));
    expect(view.attemptId).toBe(p.scriptAttemptId);
    await expect(
      selectSavedVersion(db, owner, profileId, { attemptId: p.scriptAttemptId, pieceId: p.pieceId, expectedVersion: view.piece!.version })
    ).rejects.toBeInstanceOf(WorkspacePausedError);
    // A LOST MEMBERSHIP: the scope minted before the membership was removed no
    // longer reads — the capability's per-transaction lifecycle fence refuses it.
    const held = await withWorkspace(db, { authUserId: user });
    const [membership] = (await db.select().from(memberships)).filter((m) => m.workspaceId === (ws as string));
    await db.delete(memberships).where(eq(memberships.id, membership.id));
    const lost = await readSavedGeneration(db, held, profileId, p.scriptAttemptId, new Date()).then(() => "read", (e: Error) => e.name);
    expect(lost).toBe("ProfileAccessError");
    await db.insert(memberships).values(membership);
    // A CHANGED membership (its version moved after the scope was minted): the
    // per-transaction fence refuses the stale scope.
    const stale = await withWorkspace(db, { authUserId: user });
    await db.update(memberships).set({ version: membership.version + 1 }).where(eq(memberships.id, membership.id));
    const staleRead = await readSavedGeneration(db, stale, profileId, p.scriptAttemptId, new Date()).then(() => "read", (e: Error) => e.message);
    expect(staleRead).toBe("lifecycle_refused:scope_stale");
    // A TOMBSTONED PROFILE: refused even through a freshly minted scope.
    await db.update(creatorProfiles).set({ state: "deletion_tombstoned" }).where(and(eq(creatorProfiles.id, profileId), eq(creatorProfiles.workspaceId, ws)));
    const afterTombstone = await withWorkspace(db, { authUserId: user });
    const tomb = await readSavedGeneration(db, afterTombstone, profileId, p.scriptAttemptId, new Date()).then(() => "read", (e: Error) => e.name);
    expect(tomb).toBe("ProfileAccessError");
  });

  it("THE REVISION PRESETS: a closed list, refused before anything when unknown, and each note too short to vouch for anything", async () => {
    const p = await scriptedPiece();
    for (const preset of REVISION_PRESETS) {
      const words = preset.note.split(/\s+/).filter((w) => /\p{L}/u.test(w));
      expect(words.length, preset.id).toBeLessThan(BASIS_EXCERPT_MIN_WORDS);
    }
    const before = await footprint();
    await expect(
      reviseSaved(db, owner, profileId, never(), anySlots(), { attemptId: `bad-${n}`, parentAttemptId: p.scriptAttemptId, preset: "make it viral", quotedConfigVersion: await activeVersion() }, new Date())
    ).rejects.toBeInstanceOf(RevisionPresetError);
    expect(await footprint()).toEqual(before);
  });

  it("A PRESET NOTE CANNOT VOUCH: a revision that narrates the preset's own words as an event is refused, while the same words as the CREATOR's note pass", async () => {
    const p = await scriptedPiece();
    // A reply whose opening beat narrates the preset note as something that happened.
    const narrated = {
      ...shorterReply(),
      beats: [
        { atSeconds: 0, vo: "i made it shorter and easier to film today", isTurn: false },
        { atSeconds: 6, vo: "here is the dial nobody checks before a lens change", isTurn: true, pivot: "turn" },
      ],
    };
    const viaPreset = await reviseSaved(db, owner, profileId, byKind(narrated).provider, anySlots(), {
      attemptId: `vouch-preset-${n}`, parentAttemptId: p.scriptAttemptId, preset: "easier_to_film", quotedConfigVersion: await activeVersion(),
    }, new Date());
    expect(viaPreset.generation.outcome).toBe("honest_refusal");
    const fired = (viaPreset.generation.killTest as { finalAttempt: { hardRules: { rule: string }[] } }).finalAttempt.hardRules.map((h) => h.rule);
    expect(fired).toContain("unsupported_experience");
    // NON-VACUITY: the SAME reply, when the creator's own note carries those words, passes.
    const viaCreator = await generate(db, owner, profileId, byKind(narrated).provider, anySlots(), {
      mode: "ideaToScript", attemptId: `vouch-creator-${n}`, input: "i made it shorter and easier to film today",
      platform: PLATFORM, revisionOfAttemptId: p.scriptAttemptId,
    }, new Date());
    expect(viaCreator.generation.outcome).toBe("usable");
  });


  /** The active config version — what the saved page's quote names. */
  const activeVersion = async () => (await getActiveConfig(db)).version;

  /** Appends a config version with a different REVISION price (an operator's change). */
  async function repriceRevision(by: number): Promise<{ before: number; after: number }> {
    const { content } = await getActiveConfig(db);
    const before = content.creditCosts.revision;
    await appendConfigVersion(db, { ...content, creditCosts: { ...content.creditCosts, revision: before + by } }, "test-admin");
    return { before, after: before + by };
  }

  /** A transport stub that counts every call; throws so a refused press cannot pass by answering. */
  function countingNever(): { provider: LlmProvider; calls: () => number } {
    const state = { calls: 0 };
    return {
      provider: {
        vendor: "counting-never",
        complete: async () => {
          state.calls += 1;
          throw new Error("a refused saved-page press called the vendor");
        },
      },
      calls: () => state.calls,
    };
  }

  it("M1 THE QUOTE IS BOUND: a price appended between the read and the press refuses with zero claims, ledger rows, usage rows and provider calls; an unchanged price runs", async () => {
    const p = await scriptedPiece();
    const shown = saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date()));
    expect(shown.revision.quoteConfigVersion).toBe(await activeVersion());
    expect(shown.revision.credits).toBe((await getActiveConfig(db)).content.creditCosts.revision);
    // THE OPERATOR CHANGES THE PRICE while the page is open.
    const { before, after } = await repriceRevision(3);
    const pre = await footprint();
    const vendor = countingNever();
    let refusal: unknown = null;
    try {
      await reviseSaved(db, owner, profileId, vendor.provider, anySlots(), {
        attemptId: `quote-${n}`, parentAttemptId: p.scriptAttemptId, preset: "shorter", quotedConfigVersion: shown.revision.quoteConfigVersion!,
      }, new Date());
    } catch (e) {
      refusal = e;
    }
    expect(refusal).toBeInstanceOf(GenerationQuoteChangedError);
    expect((refusal as GenerationQuoteChangedError).quoted).toBe(before);
    expect((refusal as GenerationQuoteChangedError).current).toBe(after);
    expect(await footprint()).toEqual(pre);
    expect(vendor.calls()).toBe(0);
    // ABSENT, GARBAGE AND UNSTORED quotes refuse too — never "use the active price".
    for (const quoted of [Number.NaN, 0, -1, 1.5, undefined, "3", 999_999] as unknown[]) {
      await expect(
        reviseSaved(db, owner, profileId, vendor.provider, anySlots(), {
          attemptId: `quote-bad-${n}`, parentAttemptId: p.scriptAttemptId, preset: "shorter", quotedConfigVersion: quoted as number,
        }, new Date()),
        String(quoted)
      ).rejects.toBeInstanceOf(RevisionPresetError);
    }
    expect(await footprint()).toEqual(pre);
    expect(vendor.calls()).toBe(0);
    // CONTROL: re-read (the new quote), press — it runs and charges the price it showed.
    const reread = saved(await readSavedGeneration(db, owner, profileId, p.scriptAttemptId, new Date()));
    expect(reread.revision.credits).toBe(after);
    const ran = await reviseSaved(db, owner, profileId, byKind(shorterReply()).provider, anySlots(), {
      attemptId: `quote-ok-${n}`, parentAttemptId: p.scriptAttemptId, preset: "shorter", quotedConfigVersion: reread.revision.quoteConfigVersion!,
    }, new Date());
    expect(ran.creditsChargedNow).toBe(after);
    // AN UNRELATED config change (same revision price) does not refuse the old quote.
    const { content } = await getActiveConfig(db);
    await appendConfigVersion(db, { ...content, creditCosts: { ...content.creditCosts, hookSet: content.creditCosts.hookSet + 1 } }, "test-admin");
    const unrelated = await reviseSaved(db, owner, profileId, byKind(shorterReply()).provider, anySlots(), {
      attemptId: `quote-same-${n}`, parentAttemptId: p.scriptAttemptId, preset: "natural", quotedConfigVersion: reread.revision.quoteConfigVersion!,
    }, new Date());
    expect(unrelated.creditsChargedNow).toBe(after);
  });

  it("M2 A VERSION'S OWN REVISIONS are read back for EVERY mode, piece or not, newest first, scoped and same-mode", async () => {
    await setTier("creator");
    await grant(100);
    await generate(db, owner, profileId, byKind(hooksOutput()).provider, anySlots(), {
      mode: "hooks", attemptId: `hooks-${n}`, input: "what my first year actually looked like", platform: PLATFORM,
    }, new Date());
    expect(saved(await readSavedGeneration(db, owner, profileId, `hooks-${n}`, new Date())).revisions).toEqual([]);
    // The press settled; the creator's response was lost. Reopening shows it.
    await reviseSaved(db, owner, profileId, byKind(hooksOutput()).provider, anySlots(), {
      attemptId: `hooks-rev-${n}`, parentAttemptId: `hooks-${n}`, preset: "shorter", quotedConfigVersion: await activeVersion(),
    }, new Date());
    const parent = saved(await readSavedGeneration(db, owner, profileId, `hooks-${n}`, new Date()));
    expect(parent.piece).toBeNull();
    expect(parent.revisions.map((r) => [r.attemptId, r.outcome])).toEqual([[`hooks-rev-${n}`, "usable"]]);
    expect(parent.revisionsTruncated).toBe(false);
    // A revision lists only ITS OWN children, not its siblings or its parent.
    expect(saved(await readSavedGeneration(db, owner, profileId, `hooks-rev-${n}`, new Date())).revisions).toEqual([]);
    // ANOTHER PROFILE's same-attempt read sees nothing (scoped).
    const [sibling] = await db.insert(creatorProfiles).values({ workspaceId: ws, displayName: "Cy" }).returning();
    expect((await readSavedGeneration(db, owner, sibling.id, `hooks-${n}`, new Date())).status).toBe("missing");
  });

  /** A shared, completed autopsy this profile may read (the trends fixtures' shape). */
  async function sharedAutopsy(): Promise<string> {
    const source = await createTrendSource(db, { kind: "youtube", externalId: `saved-src-${n}`, sourceUrl: `https://example.test/saved-src-${n}` });
    const item = await recordSharedTrendItem(db, {
      sourceId: source.id, externalVideoId: `saved-video-${n}`, niche: "filmmaking", title: "A permitted shared reference",
      channelId: "saved-channel", videoViews: 2_000n, channelMedianRecentViews: "1000", baselineSampleSize: 1,
      baselineObservationIds: ["saved-baseline"], baselineWindowStartsAt: new Date("2026-01-01T00:00:00.000Z"),
      baselineWindowEndsAt: new Date("2026-01-31T00:00:00.000Z"), sourcePublishedAt: new Date("2026-01-15T00:00:00.000Z"),
      transcriptState: "transcript_required", saturation: "unmeasured", saturationUnmeasuredReason: "incomplete_provenance",
    });
    const transcript = await recordSharedTrendTranscript(db, {
      trendItemId: item.id, content: `Reference transcript ${n} is available through the scoped reader.`, rightsSubjectUserId,
      provenance: {
        provider: "youtube_creator_owned_oauth", sourceReference: `https://www.youtube.com/watch?v=saved-video-${n}`,
        sharedAnalysisRightsBasis: "creator_owned_caption_consent", consentEvidenceId: `saved-consent-${n}`,
      },
    });
    const [autopsy] = await db.insert(autopsies).values({
      trendItemId: item.id, contentDigest: transcript.contentDigest, analysisVersion: "spin-v1", rightsScope: "shared_analysis",
      rightsBasis: transcript.rightsBasis, rightsSubjectUserId: transcript.rightsSubjectUserId, rightsEvidenceId: transcript.rightsEvidenceId,
      status: "completed", analysis: SPIN_REFERENCE,
    }).returning();
    return autopsy.id;
  }

  it("A2/A3 A SAVED SPIN keeps its reference, and its paid revision re-runs the similarity gate against the SAME stored reference", async () => {
    await setTier("creator");
    await grant(100);
    const autopsyId = await sharedAutopsy();
    const made = await generate(db, owner, profileId, byKind(spinReply()).provider, anySlots(), {
      mode: "analyseAndSpin", attemptId: `spin-${n}`, input: "Turn this autopsy into an original filming lesson.", platform: PLATFORM, spinAutopsyId: autopsyId,
    }, new Date());
    expect(made.generation.outcome, JSON.stringify(made.generation.killTest)).toBe("usable");
    const view = saved(await readSavedGeneration(db, owner, profileId, `spin-${n}`, new Date()));
    expect(view.reference).toEqual({
      kind: "spin",
      summary: { source: "YouTube", title: "A permitted shared reference", mechanismSummary: SPIN_REFERENCE.hookMechanic },
    });
    expect(view.revision.blocked).toBeNull();
    // The gate's own fields never ride on the DTO.
    expect(JSON.stringify(view)).not.toContain(SPIN_REFERENCE.hook);
    // A3: the revision carries the PARENT's stored reference id and the gate runs:
    // a revision that copies the reference's hook is refused for similarity.
    const copied = await reviseSaved(db, owner, profileId, byKind(spinReply(SPIN_REFERENCE.hook)).provider, anySlots(), {
      attemptId: `spin-rev-copy-${n}`, parentAttemptId: `spin-${n}`, preset: "shorter", quotedConfigVersion: await activeVersion(),
    }, new Date());
    expect(copied.generation.outcome).toBe("honest_refusal");
    const fired = (copied.generation.killTest as { finalAttempt: { hardRules: { rule: string }[] } }).finalAttempt.hardRules.map((h) => h.rule);
    expect(fired).toContain("similarity");
    expect((copied.generation.request as { spinAutopsyId?: unknown }).spinAutopsyId).toBe(autopsyId);
    // ...and a clean revision is usable, linked to its parent, and keeps the reference.
    const clean = await reviseSaved(db, owner, profileId, byKind(spinReply()).provider, anySlots(), {
      attemptId: `spin-rev-${n}`, parentAttemptId: `spin-${n}`, preset: "natural", quotedConfigVersion: await activeVersion(),
    }, new Date());
    expect(clean.generation.outcome).toBe("usable");
    expect((clean.generation.request as { spinAutopsyId?: unknown }).spinAutopsyId).toBe(autopsyId);
    expect(saved(await readSavedGeneration(db, owner, profileId, `spin-rev-${n}`, new Date())).reference).toEqual(view.reference);
    // A LEGACY ROW with no stored reference id: an honest "not available", no crash, no paid press.
    const [row] = await db.select().from(generations).where(eq(generations.attemptId, `spin-${n}`));
    await db.update(generations).set({ request: { ...(row.request as object), spinAutopsyId: null } }).where(eq(generations.id, row.id));
    const legacy = saved(await readSavedGeneration(db, owner, profileId, `spin-${n}`, new Date()));
    expect(legacy.reference).toEqual({ kind: "spin", summary: null });
    expect(legacy.revision).toMatchObject({ revisable: false, blocked: "reference_unavailable" });
  });

  it("A2 + the A3 note: a SOURCE REEL keeps its source beside it; its revision's copy check reads the PARENT DRAFT, so a revision keeping eight of its words in a row is a CHARGED refusal — the saved page offers no press", async () => {
    await setTier("creator");
    await grant(100);
    const made = await generate(db, owner, profileId, byKind(reelReply()).provider, anySlots(), {
      mode: "sourceToReel", attemptId: `reel-${n}`, input: SOURCE_TEXT, platform: PLATFORM,
    }, new Date());
    expect(made.generation.outcome, JSON.stringify(made.generation.killTest)).toBe("usable");
    const view = saved(await readSavedGeneration(db, owner, profileId, `reel-${n}`, new Date()));
    expect(view.reference).toEqual({ kind: "source", text: SOURCE_TEXT, truncated: false, checkedAgainst: "source" });
    expect(view.revision).toMatchObject({ revisable: false, blocked: "source_to_reel" });
    // THE REVIEWER'S UNVERIFIED NOTE, RUN: a revision through `generate` that
    // keeps one beat of the parent unchanged (the note says "keep everything
    // the note does not ask you to change") is refused as `summarised_source`
    // — against the PARENT DRAFT, not the source — and the refusal is charged.
    const before = await footprint();
    const revised = await generate(db, owner, profileId, byKind(reelReply()).provider, anySlots(), {
      mode: "sourceToReel", attemptId: `reel-rev-${n}`, input: "Make it shorter.", platform: PLATFORM, revisionOfAttemptId: `reel-${n}`,
    }, new Date());
    expect(revised.generation.outcome).toBe("honest_refusal");
    const fired = (revised.generation.killTest as { finalAttempt: { hardRules: { rule: string }[] } }).finalAttempt.hardRules.map((h) => h.rule);
    expect(fired).toContain("summarised_source");
    expect(revised.creditsChargedNow).toBeGreaterThan(0);
    expect((await footprint()).ledger - before.ledger).toBe(1);
    // The revision's page says which text its check read.
    const revView = saved(await readSavedGeneration(db, owner, profileId, `reel-rev-${n}`, new Date()));
    expect(revView.reference).toEqual({ kind: "source", text: SOURCE_TEXT, truncated: false, checkedAgainst: "revised_draft" });
  });

  // ------------------------------------------------------------------
  // R-173 (owner decision 2026-10-07, "strict + free refusal"): EVERY PRICED
  // PATH, THREE OUTCOMES. A refusal whose only final cause is the claim scan
  // costs nothing and writes no ledger row (its usage stays unconsumed system
  // spend); a rewrite that clears the claim is charged once at the normal
  // price; a refusal with any other cause beside it keeps today's charge.
  // ------------------------------------------------------------------
  type PricedPath = {
    path: string;
    priceKey: "hookSet" | "ideationBatch" | "spin" | "revision" | "fullScript";
    /** Prepares whatever the press needs, and returns the press itself. */
    prepare: () => Promise<{ base: () => { whyThisPerforms: { reasoning: string; weakestPoint: string } }; press: (drafts: readonly object[], attemptId: string) => Promise<GenerateResult> }>;
  };
  const PRICED_PATHS: PricedPath[] = [
    {
      path: "studio (hooks)",
      priceKey: "hookSet",
      prepare: async () => ({
        base: () => hooksOutput(),
        press: (drafts, attemptId) =>
          generate(db, owner, profileId, drafting(drafts).provider, anySlots(), { mode: "hooks", attemptId, input: FORM_INPUT, platform: PLATFORM }, new Date()),
      }),
    },
    {
      path: "first ideas (onboarding ideation)",
      priceKey: "ideationBatch",
      prepare: async () => ({
        base: () => legacyIdeas(),
        // The first-ideas action's own request shape: mode, id, input, platform.
        press: (drafts, attemptId) =>
          generate(db, owner, profileId, drafting(drafts).provider, anySlots(), { mode: "ideation", attemptId, input: FORM_INPUT, platform: PLATFORM }, new Date()),
      }),
    },
    {
      path: "Spin",
      priceKey: "spin",
      prepare: async () => {
        const autopsyId = await sharedAutopsy();
        return {
          base: () => spinReply(),
          press: (drafts, attemptId) =>
            generate(db, owner, profileId, drafting(drafts).provider, anySlots(), {
              mode: "analyseAndSpin", attemptId, input: "Turn this autopsy into an original filming lesson.", platform: PLATFORM, spinAutopsyId: autopsyId,
            }, new Date()),
        };
      },
    },
    {
      path: "saved revision",
      priceKey: "revision",
      prepare: async () => {
        const p = await scriptedPiece();
        return {
          base: () => shorterReply(),
          press: async (drafts, attemptId) =>
            reviseSaved(db, owner, profileId, drafting(drafts).provider, anySlots(), {
              attemptId, parentAttemptId: p.scriptAttemptId, preset: "shorter", quotedConfigVersion: await activeVersion(),
            }, new Date()),
        };
      },
    },
    {
      path: "piece commission",
      priceKey: "fullScript",
      prepare: async () => {
        const ideas = byKind(v2Ideas(["explain_opinion"]));
        await generate(db, owner, profileId, ideas.provider, anySlots(), {
          mode: "ideation", attemptId: `free-ideas-${n}`, input: FORM_INPUT, platform: PLATFORM, creative: { formChoice: "auto" },
        }, new Date());
        const piece = await selectConcept(db, owner, profileId, { sourceAttemptId: `free-ideas-${n}`, ideaIndex: 0 }, new Date());
        return {
          base: () => scriptReply(),
          // The commission's id is the piece's operation id, minted by the selection.
          press: (drafts) =>
            generate(db, owner, profileId, drafting(drafts).provider, anySlots(), {
              mode: "ideaToScript", attemptId: piece.operationAttemptId, input: FORM_INPUT, platform: PLATFORM, pieceId: piece.pieceId,
            }, new Date()),
        };
      },
    },
  ];

  /** This workspace's debits, its unconsumed usage rows, and its balance-bearing ledger. */
  async function money(attemptId: string) {
    const debits = (await db.select().from(creditLedger)).filter(
      (r) => r.workspaceId === (ws as string) && r.kind === "debit" && r.refId === attemptId
    );
    const usage = (await db.select().from(modelUsage)).filter((r) => r.attemptId === attemptId);
    const [attempt] = await db.select().from(generationAttempts).where(eq(generationAttempts.attemptId, attemptId));
    return { debits, usage, attempt };
  }

  const rulesOf = (r: GenerateResult) =>
    [...new Set((r.generation.killTest as { finalAttempt: { hardRules: { rule: string }[] } }).finalAttempt.hardRules.map((h) => h.rule))].sort();

  it.each(PRICED_PATHS)("R-173 $path: a CLAIM-ONLY refusal costs 0 credits, writes no debit, and leaves its usage as system spend", async ({ priceKey, prepare }) => {
    await setTier("creator");
    await grant(100);
    const { base, press } = await prepare();
    const attemptId = `free-claim-${priceKey}-${n}`;
    const claim = withReasoning(base(), CLAIM_ONLY_REASONING);
    const result = await press([claim, claim], attemptId);
    expect(result.generation.outcome, JSON.stringify(result.generation.killTest)).toBe("honest_refusal");
    expect(rulesOf(result)).toEqual(["forbidden_claim"]);
    expect(result.creditsChargedNow).toBe(0);
    expect(result.freeClaimRefusal).toBe(true);
    const m = await money(result.attemptId);
    expect(m.debits).toHaveLength(0);
    expect(m.attempt.state).toBe("settled");
    expect(m.attempt.debitLedgerId).toBeNull();
    // Both drafts were billed to US: written, never marked consumed.
    expect(m.usage.length).toBeGreaterThanOrEqual(2);
    expect(m.usage.every((u) => u.consumedIncludedBuild === false)).toBe(true);
  });

  it.each(PRICED_PATHS)("R-173 $path: a claim the REWRITE clears is charged EXACTLY ONCE at the normal price", async ({ priceKey, prepare }) => {
    await setTier("creator");
    await grant(100);
    const { base, press } = await prepare();
    const { content } = await getActiveConfig(db);
    const attemptId = `rewrite-ok-${priceKey}-${n}`;
    const result = await press([withReasoning(base(), CLAIM_ONLY_REASONING), base()], attemptId);
    expect(result.generation.outcome, JSON.stringify(result.generation.killTest)).toBe("usable");
    expect(result.generation.rewriteCount).toBe(1);
    expect(result.creditsChargedNow).toBe(content.creditCosts[priceKey]);
    expect(result.freeClaimRefusal).toBe(false);
    const m = await money(result.attemptId);
    expect(m.debits).toHaveLength(1);
    expect(m.debits[0].delta).toBe(-content.creditCosts[priceKey]);
    expect(m.attempt.debitLedgerId).toBe(m.debits[0].id);
    expect(m.usage.every((u) => u.consumedIncludedBuild === true)).toBe(true);
  });

  it.each(PRICED_PATHS)("R-173 $path: a MIXED-CAUSE refusal keeps today's charge", async ({ priceKey, prepare }) => {
    await setTier("creator");
    await grant(100);
    const { base, press } = await prepare();
    const { content } = await getActiveConfig(db);
    const attemptId = `mixed-${priceKey}-${n}`;
    const mixed = withReasoning(base(), MIXED_CAUSE_REASONING);
    const result = await press([mixed, mixed], attemptId);
    expect(result.generation.outcome).toBe("honest_refusal");
    expect(rulesOf(result)).toContain("forbidden_claim");
    expect(rulesOf(result).length, JSON.stringify(rulesOf(result))).toBeGreaterThan(1);
    expect(result.creditsChargedNow).toBe(content.creditCosts[priceKey]);
    expect(result.freeClaimRefusal).toBe(false);
    const m = await money(result.attemptId);
    expect(m.debits).toHaveLength(1);
    expect(m.attempt.debitLedgerId).toBe(m.debits[0].id);
    expect(m.usage.every((u) => u.consumedIncludedBuild === true)).toBe(true);
  });

  /** A second seat in this workspace with the given role. */
  async function seat(role: "viewer" | "editor"): Promise<WorkspaceScope> {
    const authUserId = `saved_${role}_${Date.now()}_${n}`;
    await seedAuthUser(db as unknown as Parameters<typeof seedAuthUser>[0], authUserId, `${authUserId}@test.dev`);
    const [u] = await db.insert(users).values({ authUserId }).returning();
    await db.insert(memberships).values({ userId: u.id, workspaceId: ws, role });
    return withWorkspace(db, { authUserId, workspaceId: ws });
  }

  it("SEATS ON THE SAVED PATH: a viewer reads but cannot choose or revise (no claim, no debit); an editor's choice lands", async () => {
    const p = await scriptedPiece();
    await reviseSaved(db, owner, profileId, byKind(shorterReply()).provider, anySlots(), {
      attemptId: `rev-${n}`, parentAttemptId: p.scriptAttemptId, preset: "shorter", quotedConfigVersion: await activeVersion(),
    }, new Date());
    const viewer = await seat("viewer");
    const shown = saved(await readSavedGeneration(db, viewer, profileId, `rev-${n}`, new Date()));
    expect(shown.attemptId).toBe(`rev-${n}`);
    const pre = await footprint();
    await expect(
      selectSavedVersion(db, viewer, profileId, { attemptId: `rev-${n}`, pieceId: p.pieceId, expectedVersion: shown.piece!.version })
    ).rejects.toBeInstanceOf(ProfileRoleError);
    const vendor = countingNever();
    await expect(
      reviseSaved(db, viewer, profileId, vendor.provider, anySlots(), {
        attemptId: `viewer-rev-${n}`, parentAttemptId: `rev-${n}`, preset: "shorter", quotedConfigVersion: await activeVersion(),
      }, new Date())
    ).rejects.toBeInstanceOf(InferenceRoleError);
    expect(await footprint()).toEqual(pre);
    expect(vendor.calls()).toBe(0);
    const [unmoved] = await db.select().from(creativePieces).where(eq(creativePieces.id, p.pieceId));
    expect(unmoved.version).toBe(shown.piece!.version);
    // AN EDITOR's choice lands.
    const editor = await seat("editor");
    const moved = await selectSavedVersion(db, editor, profileId, { attemptId: `rev-${n}`, pieceId: p.pieceId, expectedVersion: shown.piece!.version });
    expect(moved.version).toBe(shown.piece!.version + 1);
  });

  it("THE RECENT LIST is this profile's, newest first, bounded, and a read", async () => {
    const p = await scriptedPiece();
    const before = await footprint();
    const list = await recentSavedGenerations(db, owner, profileId);
    expect(list[0].attemptId).toBe(p.scriptAttemptId);
    expect(list.map((r) => r.attemptId)).toContain(p.ideasAttemptId);
    expect(list.length).toBeLessThanOrEqual(RECENT_SAVED_MAX);
    expect(list[0].title).toBe(v2Script("explain_opinion").thesis.statement);
    expect(await footprint()).toEqual(before);
  });
});

describe("readSavedKillTest — validated, never cast", () => {
  const good = {
    outcome: "passed", attempts: 1, rewritten: false, creatorRulesScored: true,
    creatorRuleVerdicts: [{ ruleId: "/rules/0", passed: false, note: "n" }],
    traceabilityLimitNote: "limit",
    finalAttempt: { hardRules: [], traceability: [], claims: [] },
    refusal: null,
  };
  it("reads a well-formed stored kill test — the verdict's model NOTE is validated and then dropped for the creator's rule text", () => {
    expect(readSavedKillTest(good)?.creatorRuleVerdicts).toEqual([{ ruleId: "/rules/0", passed: false, ruleText: null }]);
    const named = readSavedKillTest(good, new Map([["/rules/0", "my own rule"]]));
    expect(named?.creatorRuleVerdicts).toEqual([{ ruleId: "/rules/0", passed: false, ruleText: "my own rule" }]);
    expect(JSON.stringify(named)).not.toContain('"note"');
    expect(named?.disclosureHardRulesWithheld).toBe(false);
  });
  it("SENTINEL: a REFUSED draft's sentences never leave the package — token and field only", () => {
    const DRAFT = "SENTINEL-DRAFT this hook is guaranteed to work";
    const read = readSavedKillTest({
      ...good,
      outcome: "failed", attempts: 2, rewritten: true,
      finalAttempt: {
        hardRules: [{ rule: "forbidden_claim", field: "/hooks/0/text", excerpt: DRAFT, remedy: "r" }],
        traceability: [{ kind: "currency", enforcement: "hard", token: "$4,000", field: "/caption/text", unit: DRAFT }],
        claims: [{ family: "certainty", enforcement: "hard", token: "guarantee", field: "/hooks/0/text", unit: DRAFT }],
      },
      refusal: { headline: "h", sharperAngle: "s" },
    });
    expect(read).not.toBeNull();
    expect(JSON.stringify(read)).not.toContain("SENTINEL-DRAFT");
    expect(read!.finalAttempt.claims[0]).toMatchObject({ token: "guarantee", field: "/hooks/0/text", unit: null });
    // NON-VACUITY: a USABLE draft's flag still carries its sentence (it is on the page).
    const usable = readSavedKillTest({
      ...good,
      finalAttempt: { hardRules: [], traceability: [], claims: [{ family: "certainty", enforcement: "flag", token: "guarantee", field: "/caption/text", unit: DRAFT }] },
    });
    expect(usable!.finalAttempt.claims[0]!.unit).toBe(DRAFT);
  });
  it.each([
    ["not an object", null],
    ["an unknown outcome", { ...good, outcome: "great" }],
    ["three attempts", { ...good, attempts: 3 }],
    ["no limit note", { ...good, traceabilityLimitNote: undefined }],
    ["a verdict without a note", { ...good, creatorRuleVerdicts: [{ ruleId: "r", passed: true }] }],
    ["no claims list", { ...good, finalAttempt: { hardRules: [], traceability: [] } }],
    ["no hard-rule list", { ...good, finalAttempt: { traceability: [], claims: [] } }],
    ["a finding with an unknown enforcement", { ...good, finalAttempt: { hardRules: [], claims: [], traceability: [{ kind: "k", enforcement: "soft", token: "t", field: "/f", unit: "u" }] } }],
    ["a refusal with no headline", { ...good, refusal: { sharperAngle: "s" } }],
  ])("returns null for %s — an unreadable check is said, never an empty list", (_label, value) => {
    expect(readSavedKillTest(value as unknown)).toBeNull();
  });
});

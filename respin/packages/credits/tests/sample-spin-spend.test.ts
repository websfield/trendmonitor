// Phase 10a plans C2/C3/C4, end to end on PGlite: the reservation formula, the
// metered orchestrator against a stub vendor, the money facts it leaves, the
// rows it never touches, the bucket it consumes, and the words it never
// returns.
import { count, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_V1_SEED,
  PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS,
  PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS,
  createTestDb,
  parsePublicSampleSpinKeyring,
  publicSampleSpinBuckets,
  publicSampleSpinInFlightCount,
  recoverStalePublicSampleSpinAttempts,
  schema,
  type DbLike,
} from "@respin/db";
import { appendConfigVersion, getActiveConfig, type RespinConfigV1 } from "@respin/config";
import { LlmTruncatedError, LlmUnavailableError, type InferenceRequest, type LlmProvider } from "@respin/llm";
import {
  SAMPLE_SPIN_DRAFT_MAX_INPUT_TOKENS,
  SAMPLE_SPIN_DRAFT_MAX_OUTPUT_TOKENS,
  SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS,
  SAMPLE_SPIN_SCORE_MAX_OUTPUT_TOKENS,
  loadSampleSpinFixture,
  runPublicSampleSpin,
  sampleSpinDeadlineMs,
  sampleSpinReservationMicroUsd,
  type SampleSpinDeps,
} from "../src/sample-spin";

const fixture = loadSampleSpinFixture();
const KEYRING = parsePublicSampleSpinKeyring(`v1=${"a".repeat(64)}`)!;
const NOW = new Date("2026-09-09T10:00:00.000Z");
const REQUEST = "11111111-2222-4333-8444-555555555555";
const REQUEST_2 = "11111111-2222-4333-8444-555555555556";

/** A digit-free, name-free full script that names an offered framework and stays clear of the reference. */
const ACCEPTED_OUTPUT = {
  thesis: {
    statement: "You lose more chairs to a joint you never checked than to rot",
    why: "the seat that split this week had a loose stretcher underneath it for a season first",
  },
  framework: { name: "failure first", why: "the wrong fix shown first is what makes the right one land" },
  hooks: [
    { text: "You are sanding a seat when the stretcher underneath is what moved", mechanic: "contradiction" },
    { text: "The rail you skipped is the one your visitor feels first", mechanic: "cost reveal" },
    { text: "Nobody tells you the dull part is where the chair is saved", mechanic: "withheld detail" },
  ],
  beats: [
    { atSeconds: 0, vo: "open on the seat that split and say out loud why you kept the chair", isTurn: false },
    { atSeconds: 6, vo: "here is the stretcher nobody checks before a refinish", isTurn: true },
    { atSeconds: 14, vo: "show the same chair again with the stretcher seated where it should have been", isTurn: false },
  ],
  shotMap: [
    { beatIndex: 0, shot: "wide handheld of the split seat on the bench", note: "keep the room audio" },
    { beatIndex: 1, shot: "close on the stretcher tenon", note: "hold it long enough to read the gap" },
  ],
  onScreenText: [
    { atSeconds: 1, text: "the seat that split" },
    { atSeconds: 7, text: "the stretcher nobody checks" },
  ],
  caption: { text: "The refinish nobody sees is the one that costs you the whole chair.", hashtags: ["chairrepair", "restoration"] },
  whyThisPerforms: {
    reasoning: "It opens on a cost the viewer already recognises and then hands them the one thing they can check today.",
    weakestPoint: "None of this has been checked against how a real audience of first-time repairers actually behaves.",
  },
  disclosure: { platform: "tiktok", guidance: "Say in the caption that a tool helped draft this, in your own words." },
};

/** The same document with the reference hook copied in verbatim: the similarity gate must refuse it. */
const NEAR_COPY = {
  ...ACCEPTED_OUTPUT,
  hooks: [{ text: fixture.gate.hook, mechanic: "confession" }, ...ACCEPTED_OUTPUT.hooks.slice(1)],
};

const DRAFT_MARKER = "the stretcher nobody checks";

function scoringReply(): string {
  return JSON.stringify({
    verdicts: fixture.creatorRules.map((rule, index) => ({ ruleId: rule.id, passed: index !== 3, note: "it does the thing" })),
  });
}

/** A vendor that answers from a script and records every HTTP attempt it saw; `serve` names the model the vendor claims to have served. */
function stubProvider(replies: readonly (string | Error)[], serve: (request: InferenceRequest) => string = (request) => request.model) {
  const requests: InferenceRequest[] = [];
  const provider: LlmProvider = {
    vendor: "stub",
    async complete(request) {
      requests.push(request);
      const reply = replies[requests.length - 1];
      if (reply === undefined) throw new Error("the stub was asked for more replies than it was given");
      if (reply instanceof Error) throw reply;
      return { text: reply, servedModel: serve(request), usage: { tokensIn: 1_000, tokensOut: 400, raw: {} } };
    },
  };
  return { provider, requests };
}

async function seeded(): Promise<{ db: DbLike; content: RespinConfigV1; version: number }> {
  const db = await createTestDb();
  await appendConfigVersion(db, CONFIG_V1_SEED, "test");
  const active = await getActiveConfig(db);
  return { db, content: active.content, version: active.version };
}

function depsFor(db: DbLike, content: RespinConfigV1, version: number, provider: LlmProvider, keyring = KEYRING): SampleSpinDeps {
  return { db, provider, content, configVersion: version, keyring, now: () => NOW };
}

describe("the R-123 reservation", () => {
  it("is the exact three-call worst case at the recorded launch prices: $0.61856", () => {
    expect(sampleSpinReservationMicroUsd(CONFIG_V1_SEED)).toBe(618_560n);
    // Derived, not typed: 2 × (40,000 × $3/MTok + 12,000 × $15/MTok) + (16,000 × $1/MTok + 512 × $5/MTok).
    const sonnet = CONFIG_V1_SEED.llm.prices[CONFIG_V1_SEED.llm.models.generation]!;
    const haiku = CONFIG_V1_SEED.llm.prices[CONFIG_V1_SEED.llm.models.classification]!;
    const nano =
      2n * (BigInt(SAMPLE_SPIN_DRAFT_MAX_INPUT_TOKENS) * BigInt(sonnet.inputNanoUsdPerToken) + BigInt(SAMPLE_SPIN_DRAFT_MAX_OUTPUT_TOKENS) * BigInt(sonnet.outputNanoUsdPerToken)) +
      (BigInt(SAMPLE_SPIN_SCORE_MAX_INPUT_TOKENS) * BigInt(haiku.inputNanoUsdPerToken) + BigInt(SAMPLE_SPIN_SCORE_MAX_OUTPUT_TOKENS) * BigInt(haiku.outputNanoUsdPerToken));
    expect(sampleSpinReservationMicroUsd(CONFIG_V1_SEED)).toBe(nano / 1000n);
  });

  it("the deadline is the config value CLAMPED to the compiled 120 s ceiling, and the lease covers it (billing gate round 1)", () => {
    expect(sampleSpinDeadlineMs(CONFIG_V1_SEED)).toBe(120_000);
    const raised = structuredClone(CONFIG_V1_SEED) as RespinConfigV1;
    raised.llm.overallDeadlineMs = 300_000;
    expect(sampleSpinDeadlineMs(raised)).toBe(PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS);
    const tightened = structuredClone(CONFIG_V1_SEED) as RespinConfigV1;
    tightened.llm.overallDeadlineMs = 45_000;
    expect(sampleSpinDeadlineMs(tightened)).toBe(45_000);
    expect(PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS).toBeGreaterThan(PUBLIC_SAMPLE_SPIN_DEADLINE_CODE_CEILING_MS);
  });

  it("moves with the active prices, never a compiled dollar figure", () => {
    const pricier = structuredClone(CONFIG_V1_SEED) as RespinConfigV1;
    pricier.llm.prices[pricier.llm.models.generation]!.inputNanoUsdPerToken *= 2;
    expect(sampleSpinReservationMicroUsd(pricier)).toBeGreaterThan(618_560n);
  });
});

describe("runPublicSampleSpin", () => {
  let db: DbLike;
  let content: RespinConfigV1;
  let version: number;
  beforeEach(async () => {
    ({ db, content, version } = await seeded());
  });

  it("accepted: two metered calls, one measured money fact, the bucket consumed, and no tenant row anywhere", async () => {
    const { provider, requests } = stubProvider([JSON.stringify(ACCEPTED_OUTPUT), scoringReply()]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), {
      requestId: REQUEST,
      canonicalIp: "203.0.113.7",
      body: { idea: "The rocking chair my neighbour was about to throw out." },
    });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(requests).toHaveLength(2);
    expect(requests[0]!.model).toBe(content.llm.models.generation);
    expect(requests[1]!.model).toBe(content.llm.models.classification);
    expect(requests[1]!.maxOutputTokens).toBe(SAMPLE_SPIN_SCORE_MAX_OUTPUT_TOKENS);
    expect(requests[0]!.maxOutputTokens).toBeLessThanOrEqual(SAMPLE_SPIN_DRAFT_MAX_OUTPUT_TOKENS);
    expect(requests.every((r) => r.signal instanceof AbortSignal)).toBe(true);
    // The response: every gate input, the weakest point, the rules the gate
    // says held, the neutral disclosure — and never the model's disclosure.
    expect(result.spin.some((u) => u.text === DRAFT_MARKER)).toBe(true);
    expect(result.spin.some((u) => u.field.startsWith("/disclosure/"))).toBe(false);
    expect(JSON.stringify(result)).not.toContain("Say in the caption that a tool helped");
    expect(result.disclosure).toEqual({ kind: "policy_check_required" });
    expect(result.highlightedRules.map((r) => r.id)).toEqual(fixture.creatorRules.slice(0, 3).map((r) => r.id));
    expect(result.original).toEqual(fixture.original);
    expect(result.versions).toMatchObject({ fixture: fixture.version, model: content.llm.models.generation, configVersion: version });
    expect(result.rewritten).toBe(false);

    // THE MONEY FACT: one claim at the exact reservation, one usage row,
    // measured, two calls, priced from the served model.
    const [claim] = await db.select().from(schema.systemSpendClaims);
    expect(claim).toMatchObject({ jobAttemptId: `sample:${REQUEST}`, jobId: REQUEST, purpose: "public_sample_spin", status: "reserved", reservedMicroUsd: 618_560n, trendItemId: null, autopsyCacheClaimId: null });
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ jobAttemptId: `sample:${REQUEST}`, purpose: "public_sample_spin", outcome: "succeeded", costState: "measured", callCount: 2, unknownCallCount: 0, tokensIn: 2_000, tokensOut: 800, errorCode: null, trendItemId: null });
    expect(usage!.costMicroUsd).toBeGreaterThan(0n);
    const [daily] = await db.select().from(schema.systemSpendDaily);
    expect(daily).toMatchObject({ businessDate: "2026-09-09", reservedMicroUsd: 618_560n, callCount: 2, unknownCallCount: 0 });

    // NOTHING TENANT-SIDE MOVED: no ledger row, no tenant model_usage row, no
    // generation, no session, no profile.
    for (const table of [schema.creditLedger, schema.modelUsage, schema.generations, schema.session, schema.creatorProfiles, schema.workspaces]) {
      const [row] = await db.select({ n: count() }).from(table);
      expect(row!.n).toBe(0);
    }
    // The bucket: opened under the current key, consumed once, no raw IP.
    const [bucket] = await db.select().from(publicSampleSpinBuckets);
    expect(bucket).toMatchObject({ keyVersion: "v1", admitted: 1, refused: 0, duplicate: 0, blocked: 0 });
    expect(JSON.stringify(bucket)).not.toContain("203.0.113.7");
    expect(bucket!.expiresAt.getTime() - bucket!.bucketStartedAt.getTime()).toBe(24 * 60 * 60_000);
  });

  it("gate-refused: two drafts, no scoring call, an analysis_invalid money fact, and NOT ONE WORD of either draft anywhere", async () => {
    const { provider, requests } = stubProvider([JSON.stringify(NEAR_COPY), JSON.stringify(NEAR_COPY)]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), {
      requestId: REQUEST,
      canonicalIp: "203.0.113.7",
      body: { idea: "Why a loose spindle keeps coming out after you glue it." },
    });
    expect(result).toMatchObject({ status: "refused", reason: "gate_refused" });
    expect(requests).toHaveLength(2);
    const rendered = JSON.stringify(result);
    expect(rendered).not.toContain(DRAFT_MARKER);
    expect(rendered).not.toContain(fixture.gate.hook);
    expect(rendered).not.toContain("similarity gate");
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "analysis_invalid", errorCode: "gate_refused", callCount: 2, costState: "measured" });
    // Every system row, serialised: the candidate text is in none of them.
    for (const table of [schema.systemModelUsage, schema.systemSpendClaims, schema.systemSpendDaily, publicSampleSpinBuckets]) {
      const rows = await db.select().from(table);
      expect(JSON.stringify(rows, (_key, value) => (typeof value === "bigint" ? value.toString() : value))).not.toContain(DRAFT_MARKER);
    }
    const [bucket] = await db.select().from(publicSampleSpinBuckets);
    expect(bucket).toMatchObject({ admitted: 1, refused: 1 });
  });

  it("a retry of the same refused request id is the same terminal refusal with no new vendor sequence", async () => {
    const { provider, requests } = stubProvider([JSON.stringify(NEAR_COPY), JSON.stringify(NEAR_COPY)]);
    const deps = depsFor(db, content, version, provider);
    const input = { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "Why a loose spindle keeps coming out." } };
    await runPublicSampleSpin(deps, input);
    const again = await runPublicSampleSpin(deps, input);
    expect(again).toMatchObject({ status: "refused", reason: "gate_refused" });
    expect(requests).toHaveLength(2);
    const [bucket] = await db.select().from(publicSampleSpinBuckets);
    expect(bucket).toMatchObject({ admitted: 1, duplicate: 1 });
  });

  it("vendor failure on the first call: an UNKNOWN money fact with one unknown call, and a content-free refusal", async () => {
    const { provider } = stubProvider([new LlmUnavailableError(503, "server")]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), {
      requestId: REQUEST,
      canonicalIp: "203.0.113.7",
      body: { idea: "A chair." },
    });
    expect(result).toMatchObject({ status: "refused", reason: "service_unavailable" });
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "vendor_failed", errorCode: "vendor_unavailable", costState: "unknown", callCount: 1, unknownCallCount: 1, costMicroUsd: null });
    const [daily] = await db.select().from(schema.systemSpendDaily);
    expect(daily!.unknownCallCount).toBe(1);
  });

  it("a second admitted request from the same address inside 24 h is bucket_exhausted before any money moves", async () => {
    const { provider, requests } = stubProvider([JSON.stringify(ACCEPTED_OUTPUT), scoringReply()]);
    const deps = depsFor(db, content, version, provider);
    await runPublicSampleSpin(deps, { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } });
    const second = await runPublicSampleSpin(deps, { requestId: REQUEST_2, canonicalIp: "203.0.113.7", body: { idea: "Another chair." } });
    expect(second).toMatchObject({ status: "refused", reason: "bucket_exhausted" });
    expect(requests).toHaveLength(2);
    const [claims] = await db.select({ n: count() }).from(schema.systemSpendClaims);
    expect(claims!.n).toBe(1);
    const [bucket] = await db.select().from(publicSampleSpinBuckets);
    expect(bucket).toMatchObject({ admitted: 1, blocked: 1 });
  });

  it("an invalid idea is refused before admission: no claim, no bucket, no call", async () => {
    const { provider, requests } = stubProvider([]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), {
      requestId: REQUEST,
      canonicalIp: "203.0.113.7",
      body: { idea: "x".repeat(601) },
    });
    expect(result).toMatchObject({ status: "refused", reason: "idea_invalid" });
    expect(requests).toHaveLength(0);
    const [claims] = await db.select({ n: count() }).from(schema.systemSpendClaims);
    const [buckets] = await db.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(claims!.n).toBe(0);
    expect(buckets!.n).toBe(0);
  });

  it("the purpose cap refuses at the money, not the bucket: a tightened $0 cap is budget_exhausted with the window untouched", async () => {
    const tightened = structuredClone(content) as RespinConfigV1;
    tightened.publicSampleSpin.dailyCapMicroUsd = 0;
    const { provider, requests } = stubProvider([]);
    const result = await runPublicSampleSpin(depsFor(db, tightened, version, provider), {
      requestId: REQUEST,
      canonicalIp: "203.0.113.7",
      body: { idea: "A chair." },
    });
    expect(result).toMatchObject({ status: "refused", reason: "budget_exhausted" });
    expect(requests).toHaveLength(0);
    const [claim] = await db.select().from(schema.systemSpendClaims);
    expect(claim).toMatchObject({ status: "cap_exhausted", purpose: "public_sample_spin" });
    const [buckets] = await db.select({ n: count() }).from(publicSampleSpinBuckets);
    expect(buckets!.n).toBe(0);
  });

  it("REWRITE THEN ACCEPT: three metered calls, callCount 3, rewritten true", async () => {
    const { provider, requests } = stubProvider([JSON.stringify(NEAR_COPY), JSON.stringify(ACCEPTED_OUTPUT), scoringReply()]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } });
    expect(result).toMatchObject({ status: "accepted", rewritten: true });
    expect(requests).toHaveLength(3);
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "succeeded", callCount: 3, costState: "measured", tokensIn: 3_000 });
    // The weakest point travels once, on its own field.
    if (result.status === "accepted") expect(result.spin.some((u) => u.field === "/whyThisPerforms/weakestPoint")).toBe(false);
  });

  it("a truncated reply keeps the vendor's usage: the attempt is measured, billable, and refused as an unusable draft", async () => {
    const { provider } = stubProvider([new LlmTruncatedError(12_000, { tokensIn: 900, tokensOut: 12_000 })]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } });
    expect(result).toMatchObject({ status: "refused", reason: "draft_unusable" });
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "analysis_invalid", errorCode: "reply_truncated", costState: "measured", callCount: 1, tokensIn: 900, tokensOut: 12_000 });
  });

  it("a served ALIAS is priced at the alias's price; an unpriced alias is an UNKNOWN cost with the tokens kept, and the visitor is still served", async () => {
    const generation = content.llm.models.generation;
    const classification = content.llm.models.classification;
    // Priced alias: the draft is served by the cheaper model.
    const priced = stubProvider([JSON.stringify(ACCEPTED_OUTPUT), scoringReply()], (r) => (r.model === generation ? classification : r.model));
    const first = await runPublicSampleSpin(depsFor(db, content, version, priced.provider), { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } });
    expect(first.status).toBe("accepted");
    const [cheap] = await db.select().from(schema.systemModelUsage);
    // Both calls at the classification price: 2 × (1,000 × $1/MTok + 400 × $5/MTok) = 6,000 micro-USD.
    expect(cheap).toMatchObject({ costState: "measured", costMicroUsd: 6_000n });
    // Unpriced alias, a second visitor.
    const unpriced = stubProvider([JSON.stringify(ACCEPTED_OUTPUT), scoringReply()], (r) => (r.model === generation ? "claude-mystery-alias" : r.model));
    const second = await runPublicSampleSpin(depsFor(db, content, version, unpriced.provider), { requestId: REQUEST_2, canonicalIp: "203.0.113.8", body: { idea: "Another chair." } });
    expect(second.status).toBe("accepted");
    const [unknown] = await db.select().from(schema.systemModelUsage).where(eq(schema.systemModelUsage.jobAttemptId, `sample:${REQUEST_2}`));
    expect(unknown).toMatchObject({ outcome: "succeeded", costState: "unknown", costMicroUsd: null, unknownCallCount: 1, callCount: 2, tokensIn: 2_000, tokensOut: 800 });
  });

  it("THE WEAKEST BET, EXECUTED: the vendor succeeds, the finalising write fails, the attempt stays in flight until the lease, then recovers unknown — and the window stays consumed", async () => {
    const { provider, requests } = stubProvider([JSON.stringify(ACCEPTED_OUTPUT), scoringReply()]);
    // Every transaction after the admission fails once: that is the finalise.
    let transactions = 0;
    const flaky = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return (...args: unknown[]) => {
            transactions += 1;
            if (transactions === 2) throw new Error("connection reset by peer");
            return (target.transaction as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, property, receiver);
      },
    }) as DbLike;
    await expect(runPublicSampleSpin(depsFor(flaky, content, version, provider), { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } })).rejects.toThrow(/connection reset/);
    expect(requests).toHaveLength(2);
    // In flight: reserved, no usage row, inside the lease.
    await db.transaction(async (tx) => expect(await publicSampleSpinInFlightCount(tx)).toBe(1));
    const [bucket] = await db.select().from(publicSampleSpinBuckets);
    expect(bucket).toMatchObject({ admitted: 1 });
    // The lease passes; the tick recovers it as unknown / recovery_required and the slot frees.
    await db.update(schema.systemSpendClaims).set({ createdAt: new Date(Date.now() - PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS - 60_000) }).where(eq(schema.systemSpendClaims.jobAttemptId, `sample:${REQUEST}`));
    await expect(recoverStalePublicSampleSpinAttempts(db)).resolves.toEqual({ recovered: 1, failed: 0 });
    await db.transaction(async (tx) => expect(await publicSampleSpinInFlightCount(tx)).toBe(0));
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "vendor_failed", errorCode: "recovery_required", costState: "unknown", callCount: 3 });
  });

  it("THE RACE THE OTHER WAY: recovery lands BEFORE the finalise's existence read — the late measured fact RECONCILES the unknown row, the visitor is served, the day's unknown count returns to zero", async () => {
    const { provider: inner } = stubProvider([JSON.stringify(ACCEPTED_OUTPUT), scoringReply()]);
    // The tick fires after the vendor's LAST reply and before the finalise
    // touches the db: the claim is aged past the lease and recovered unknown.
    let recovered = false;
    const provider: LlmProvider = {
      vendor: "stub",
      async complete(request) {
        const reply = await inner.complete(request);
        if (request.attemptId.endsWith(":2")) {
          await db.update(schema.systemSpendClaims).set({ createdAt: new Date(Date.now() - PUBLIC_SAMPLE_SPIN_ATTEMPT_LEASE_MS - 60_000) }).where(eq(schema.systemSpendClaims.jobAttemptId, `sample:${REQUEST}`));
          await expect(recoverStalePublicSampleSpinAttempts(db)).resolves.toEqual({ recovered: 1, failed: 0 });
          recovered = true;
        }
        return reply;
      },
    };
    const deps = depsFor(db, content, version, provider);
    const result = await runPublicSampleSpin(deps, { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } });
    expect(result.status).toBe("accepted");
    expect(recovered).toBe(true);
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "vendor_failed", errorCode: "recovery_required", costState: "unknown" });
    const reconciliations = await db.select().from(schema.systemModelUsageReconciliations);
    expect(reconciliations).toHaveLength(1);
    expect(reconciliations[0]!.actualCostMicroUsd).toBeGreaterThan(0n);
    const [daily] = await db.select().from(schema.systemSpendDaily);
    expect(daily).toMatchObject({ unknownCallCount: 0 });
    expect(daily!.knownCostMicroUsd).toBeGreaterThan(0n);
  });

  it("a gate-passed draft too long for the scorer's bound is an UNUSABLE DRAFT (draft_too_large), one paid call, never a 503 (lean gate round 1 R-4; witnessed round 2)", async () => {
    const long = { ...ACCEPTED_OUTPUT, whyThisPerforms: { ...ACCEPTED_OUTPUT.whyThisPerforms, reasoning: "the stretcher nobody checks is the joint that moved ".repeat(600) } };
    const { provider, requests } = stubProvider([JSON.stringify(long), scoringReply()]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } });
    expect(result).toMatchObject({ status: "refused", reason: "draft_unusable" });
    expect(requests).toHaveLength(1);
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "analysis_invalid", errorCode: "draft_too_large", costState: "measured", callCount: 1 });
    expect(JSON.stringify(result)).not.toContain("the stretcher nobody checks is the joint");
  });

  it("an error that is neither the vendor's answer nor its absence names no cause: could_not_complete, live and on replay", async () => {
    const { provider } = stubProvider([new TypeError("something the pipeline did not expect")]);
    const input = { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } };
    const live = await runPublicSampleSpin(depsFor(db, content, version, provider), input);
    expect(live).toMatchObject({ status: "refused", reason: "could_not_complete" });
    if (live.status === "refused") expect(live.nextAction).not.toContain("provider");
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "vendor_failed", errorCode: "unclassified_failure" });
    const again = await runPublicSampleSpin(depsFor(db, content, version, provider), input);
    expect(again).toMatchObject({ status: "refused", reason: "could_not_complete" });
  });

  it("a replayed budget-refused id is told budget_exhausted, never in_progress (lean gate round 1, R-2)", async () => {
    const tightened = structuredClone(content) as RespinConfigV1;
    tightened.publicSampleSpin.dailyCapMicroUsd = 0;
    const { provider } = stubProvider([]);
    const input = { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } };
    await runPublicSampleSpin(depsFor(db, tightened, version, provider), input);
    const again = await runPublicSampleSpin(depsFor(db, tightened, version, provider), input);
    expect(again).toMatchObject({ status: "refused", reason: "budget_exhausted" });
  });

  it("an unparseable reply is an UNUSABLE DRAFT, not a provider outage: the refusal says so and the money fact is analysis_invalid", async () => {
    const { provider } = stubProvider(["this is not the JSON document the pipeline asked for"]);
    const result = await runPublicSampleSpin(depsFor(db, content, version, provider), { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } });
    expect(result).toMatchObject({ status: "refused", reason: "draft_unusable" });
    if (result.status === "refused") expect(result.nextAction).not.toContain("provider");
    const [usage] = await db.select().from(schema.systemModelUsage);
    expect(usage).toMatchObject({ outcome: "analysis_invalid", errorCode: "reply_unparseable", callCount: 1 });
  });

  it("the replay of a completed request is a terminal refusal that names completion, never the output again", async () => {
    const { provider, requests } = stubProvider([JSON.stringify(ACCEPTED_OUTPUT), scoringReply()]);
    const deps = depsFor(db, content, version, provider);
    const input = { requestId: REQUEST, canonicalIp: "203.0.113.7", body: { idea: "A chair." } };
    const first = await runPublicSampleSpin(deps, input);
    expect(first.status).toBe("accepted");
    const again = await runPublicSampleSpin(deps, input);
    expect(again).toMatchObject({ status: "refused", reason: "already_completed" });
    expect(JSON.stringify(again)).not.toContain(DRAFT_MARKER);
    expect(requests).toHaveLength(2);
    const [rows] = await db.select({ n: count() }).from(schema.systemModelUsage).where(eq(schema.systemModelUsage.jobAttemptId, `sample:${REQUEST}`));
    expect(rows!.n).toBe(1);
  });
});

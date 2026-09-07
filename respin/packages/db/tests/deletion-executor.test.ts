// Phase 10b-1 Task 4.3/4.4 — the deletion executor on a POPULATED fixture.
//
// One workspace with two owners, a profile tree (inputs, brain document,
// activation, generation attempt/generation/feedback/result/proposal), private
// trend source/item/transcript/autopsy/claim with their system-spend rows, a
// SHARED independently-licensed item that must survive, Stripe mirror rows,
// a ledger row, a monthly spend rollup, sessions, verification rows, a rate
// limit row and an admitted auth mail. Each scope walks the real request
// path, then the executor ticks it to `complete`; the assertions are about
// what is gone, what is pseudonymised, and what survived.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  admitAuthMail,
  createAuthMailRecoveryDelivery,
  type AuthMailPort,
} from "../src/auth-mail";
import { authMailOutbox } from "../src/auth-mail-schema";
import { rateLimit, session, user as authUser, verification } from "../src/auth-schema";
import { creditLedger, stripeEvents, subscriptions } from "../src/billing-schema";
import { ensureUserWorkspace } from "../src/bootstrap";
import { brainDocs, creatorProfiles } from "../src/brain-schema";
import { brainActivationSnapshots } from "../src/onboarding-schema";
import {
  advanceDeletionOperations,
  DELETION_EXECUTOR_MAX_ERASURE_FAILURES,
  ERASURE_DISABLED,
  erasureHold,
  unretainedFinancialChainTables,
  type DeletionExecutorPorts,
} from "../src/deletion-executor";
import { JSON_PATH_INVENTORY, LIFECYCLE_REGISTRY, ROW_CLASS_INVENTORY, SUPPORTING_LIFECYCLE_STORES } from "../src/creator-data-registry";
import type { LifecycleExecutionTarget, LifecycleRuntimeSubjects } from "../src/lifecycle-executors";
import { deriveExpectedResidueProbes, LIFECYCLE_PROBES } from "../src/lifecycle-probes";
import { createSqlResidueProbePort, loadTableMetaInTx } from "../src/lifecycle-sql-port";
import {
  SENTINEL_INSTALLATION_ID,
  sentinelIdentitySubject,
  sentinelWorkspaceSubject,
  targetAppliesToOperation,
} from "../src/lifecycle-subjects";
import { deletionExternalCommands, deletionMembershipSnapshots, deletionOperations, deletionOperationTransitions } from "../src/lifecycle-schema";
import {
  dispatchExternalCommands,
  recordExternalCommandOutcome,
  type ExternalCommandPort,
  type ExternalCommandResult,
} from "../src/deletion-external-commands";
import {
  cancelScopedDeletion,
  requestIdentityDeletion,
  requestProfileDeletion,
  requestWorkspaceDeletion,
  transitionDeletionOperation,
} from "../src/deletion-lifecycle";
import type { DeletionJournalPort, JournalTransitionRequest } from "../src/deletion-ports";
import { journalReceiptDigest, journalRequestChecksum } from "../src/deletion-ports";
import { generationAttempts, generations } from "../src/generation-schema";
import { migrationInventory } from "../src/lifecycle-inventory";
import { modelUsage, onboardingInputs, workspaceSpendMonthly } from "../src/onboarding-schema";
import { memberships, users, workspaces } from "../src/schema";
import { systemModelUsage, systemModelUsageReconciliations, systemSpendClaims, systemSpendDaily } from "../src/system-spend-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { autopsies, autopsyCacheClaims, trendItems, trendSources, trendTranscripts } from "../src/trends-schema";
import { ProfileScope, withWorkspace, writeCapabilities } from "../src/with-workspace";

const RESPIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS = join(RESPIN, "packages/db/migrations");
const migrations = migrationInventory(
  readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }))
);
const HOUR = 60 * 60 * 1_000;
const DAY = 24 * HOUR;

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function journal(): { port: DeletionJournalPort; requests: JournalTransitionRequest[] } {
  const requests: JournalTransitionRequest[] = [];
  return {
    requests,
    port: {
      appendTransition: async (request) => {
        requests.push(request);
        const object = {
          objectKey: `test/deletion-journal/${request.operationId}/${String(request.version).padStart(8, "0")}.json`,
          objectVersionId: `version-${request.version}`,
          checksumSha256: journalRequestChecksum(request),
        };
        return { outcome: "confirmed" as const, ...request, ...object, receiptDigest: journalReceiptDigest(request, object) };
      },
    },
  };
}

function commandPort(results: Partial<Record<string, ExternalCommandResult[]>> = {}) {
  const executed: string[] = [];
  const reconciled: string[] = [];
  const port: ExternalCommandPort = {
    execute: vi.fn(async (command) => {
      executed.push(command.kind);
      return results[command.kind]?.shift() ?? { outcome: "succeeded" as const, providerRef: `${command.kind}:ok` };
    }),
    reconcile: vi.fn(async (command) => {
      reconciled.push(command.kind);
      return { outcome: "succeeded" as const };
    }),
  };
  return { port, executed, reconciled };
}

const mailer: AuthMailPort = { send: async () => ({ outcome: "accepted", providerMessageId: "re_ok" }) };

async function addSession(db: TestDb, authUserId: string, id: string) {
  await db.insert(session).values({
    id,
    token: `token-${id}`,
    userId: authUserId,
    expiresAt: new Date(Date.now() + HOUR),
    updatedAt: new Date(),
    reauthenticatedAt: new Date(),
  });
}

type Fixture = Awaited<ReturnType<typeof populate>>;

async function populate(db: TestDb) {
  await seedAuthUser(db, "owner-auth", "owner@example.test");
  await seedAuthUser(db, "survivor-auth", "survivor@example.test");
  const owner = await ensureUserWorkspace(db, { authUserId: "owner-auth", name: "Owner" });
  const survivor = await ensureUserWorkspace(db, { authUserId: "survivor-auth", name: "Survivor" });
  const workspaceId = owner.workspace.id;
  await db.insert(memberships).values({ userId: survivor.user.id, workspaceId, role: "owner" });
  await addSession(db, "owner-auth", "session-owner-auth");
  await addSession(db, "survivor-auth", "session-survivor-auth");
  await db.insert(verification).values([
    { id: "ver-owner", identifier: `reset-password:${"a".repeat(24)}`, value: "owner-auth", expiresAt: new Date(Date.now() + HOUR), updatedAt: new Date() },
    { id: "ver-survivor", identifier: `reset-password:${"b".repeat(24)}`, value: "survivor-auth", expiresAt: new Date(Date.now() + HOUR), updatedAt: new Date() },
  ]);
  await db.insert(rateLimit).values({ id: "rl-1", key: "sign-in:1.2.3.4", count: 1, lastRequest: Date.now() });
  await admitAuthMail(db, { purpose: "email_verification", authUserId: "owner-auth", actionExpiresAt: new Date(Date.now() + HOUR) });
  // The survivor's own mail: the identity walk must leave ITS recipient link
  // intact, or the "every link nulled" assertion is vacuous (round-1 tenancy).
  await admitAuthMail(db, { purpose: "email_verification", authUserId: "survivor-auth", actionExpiresAt: new Date(Date.now() + HOUR) });

  const [profile] = await db.insert(creatorProfiles).values({ workspaceId, displayName: "Owner Creator" }).returning();
  const workspaceScope = await withWorkspace(db, { authUserId: "owner-auth" });
  const profileScope = await ProfileScope.mint(db, workspaceScope, profile!.id);
  const caps = writeCapabilities(profileScope);
  const input = await caps.appendOnboardingInput({ inputClass: "own_post", content: "OWNER-PRIVATE-POST" });
  const doc = await db.transaction((tx) =>
    caps.writeBrainDoc(
      {
        kind: "voice",
        content: { register: "OWNER-VOICE", sentenceRhythm: "[check]", signatureMoves: [], avoid: [] },
        sourceEvidence: [{ field: "/register", quote: input.content, inputId: input.id, startUtf16: 0, endUtf16: input.content.length }],
        reason: { code: "onboarding_inference" },
      },
      tx
    )
  );
  const [snapshot] = await db.insert(brainActivationSnapshots).values({ workspaceId, profileId: profile!.id, voiceDocId: doc.id }).returning();
  await db.insert(generationAttempts).values({
    profileId: profile!.id,
    workspaceId,
    attemptId: "att_exec_1",
    purpose: "generation",
    mode: "hookSet",
    payloadSha256: "a".repeat(64),
  });
  await db.insert(generations).values({
    profileId: profile!.id,
    workspaceId,
    attemptId: "att_exec_1",
    mode: "hookSet",
    brainActivationId: snapshot!.id,
    request: { idea: "OWNER-IDEA" },
    model: "claude-opus-5",
    promptBundleVersion: "pb-1",
    configVersion: 1,
    outcome: "usable",
    output: { hooks: ["OWNER-SCRIPT"] },
    weakestPoint: "unproven",
    killTest: { rulesFired: [], rewritten: false },
  });

  const [privateSource] = await db.insert(trendSources).values({
    kind: "submitted",
    externalId: "OWNER-SOURCE",
    sourceUrl: "https://example.test/owner",
    profileId: profile!.id,
    workspaceId,
  }).returning();
  const item = (workspace: string | null, profileIdValue: string | null, sourceId: string, marker: string) => ({
    sourceId,
    externalVideoId: `${marker}-VIDEO`,
    niche: `${marker}-NICHE`,
    title: `${marker}-TREND`,
    channelId: `${marker}-CHANNEL`,
    videoViews: 200n,
    channelMedianRecentViews: "100",
    baselineSampleSize: 1,
    baselineObservationIds: [`${marker}-BASELINE`],
    baselineWindowStartsAt: new Date("2026-08-01T00:00:00.000Z"),
    baselineWindowEndsAt: new Date("2026-09-01T00:00:00.000Z"),
    sourcePublishedAt: new Date("2026-08-31T00:00:00.000Z"),
    outlierRatio: "2",
    rightsScope: (workspace ? "profile_private" : "shared_analysis") as "profile_private" | "shared_analysis",
    profileId: profileIdValue,
    workspaceId: workspace,
    transcriptState: "transcript_available" as const,
    saturation: "unmeasured" as const,
    saturationUnmeasuredReason: "incomplete_provenance" as const,
  });
  const [privateItem] = await db.insert(trendItems).values(item(workspaceId, profile!.id, privateSource!.id, "OWNER")).returning();
  await db.insert(trendTranscripts).values({
    trendItemId: privateItem!.id,
    rightsScope: "profile_private",
    rightsBasis: "profile_private",
    profileId: profile!.id,
    workspaceId,
    content: "OWNER-TRANSCRIPT",
    contentDigest: "digest_owner",
    provenance: { provider: "creator_paste" },
  });
  await db.insert(autopsies).values({
    trendItemId: privateItem!.id,
    contentDigest: "digest_owner",
    analysisVersion: "v1",
    rightsScope: "profile_private",
    rightsBasis: "profile_private",
    profileId: profile!.id,
    workspaceId,
    status: "completed",
    analysis: { marker: "OWNER-AUTOPSY" },
  });
  const [claim] = await db.insert(autopsyCacheClaims).values({
    trendItemId: privateItem!.id,
    contentDigest: "claim_owner",
    analysisVersion: "v1",
    rightsScope: "profile_private",
    rightsBasis: "profile_private",
    profileId: profile!.id,
    workspaceId,
    cacheScopeKey: profile!.id,
    status: "pending",
  }).returning();
  const [sharedSource] = await db.insert(trendSources).values({ kind: "youtube", externalId: "SHARED-SOURCE", sourceUrl: "https://example.test/shared" }).returning();
  const [sharedItem] = await db.insert(trendItems).values(item(null, null, sharedSource!.id, "SHARED")).returning();
  await db.insert(trendTranscripts).values({
    trendItemId: sharedItem!.id,
    rightsScope: "shared_analysis",
    rightsBasis: "independently_licensed",
    rightsEvidenceId: "licence-1",
    content: "SHARED-TRANSCRIPT",
    contentDigest: "digest_shared",
    provenance: { sourceReference: "licence-1" },
  });
  // A consent-only shared row whose basis is the OWNER's consent (plan C3):
  // it survives workspace and profile erasure and goes with the identity.
  await db.insert(trendTranscripts).values({
    trendItemId: sharedItem!.id,
    rightsScope: "shared_analysis",
    rightsBasis: "creator_consent",
    rightsSubjectUserId: owner.user.id,
    rightsEvidenceId: "consent-1",
    content: "CONSENT-TRANSCRIPT",
    contentDigest: "digest_consent",
    provenance: { consentEvidenceId: "consent-1" },
  });

  const businessDate = new Date().toISOString().slice(0, 10);
  await db.insert(systemSpendDaily).values({ businessDate, capMicroUsd: 1_000_000n, reservedMicroUsd: 10n });
  await db.insert(systemSpendClaims).values({
    jobAttemptId: "att-owner-1",
    jobId: `autopsy:${claim!.id}`,
    trendItemId: privateItem!.id,
    autopsyCacheClaimId: claim!.id,
    purpose: "trend_autopsy",
    model: "m",
    businessDate,
    reservedMicroUsd: 10n,
    requestedMicroUsd: 10n,
    status: "reserved",
  });
  await db.insert(systemModelUsage).values({
    jobAttemptId: "att-owner-1",
    jobId: `autopsy:${claim!.id}`,
    trendItemId: privateItem!.id,
    purpose: "trend_autopsy",
    model: "m",
    tokensIn: 10,
    tokensOut: 5,
    costMicroUsd: 5n,
    reservedCostMicroUsd: 10n,
    reservationOverrunMicroUsd: 0n,
    costState: "measured",
    outcome: "succeeded",
    callCount: 4,
    unknownCallCount: 0,
    businessDate,
  });
  await db.insert(systemSpendClaims).values({
    jobAttemptId: "att-shared-1",
    jobId: `autopsy:shared`,
    trendItemId: sharedItem!.id,
    autopsyCacheClaimId: claim!.id === "" ? claim!.id : "00000000-0000-4000-8000-00000000abcd",
    purpose: "trend_autopsy",
    model: "m",
    businessDate,
    reservedMicroUsd: 10n,
    requestedMicroUsd: 10n,
    status: "reserved",
  });

  await db.insert(systemModelUsageReconciliations).values({ jobAttemptId: "att-owner-1", businessDate, actualCostMicroUsd: 5n });
  // Per-attempt cost facts (R-122 "model-usage … facts", REQ-G05's margin
  // input): plan C3 names them in the mandatory population; round-2 billing
  // CHANGE found the fixture without one.
  await db.insert(modelUsage).values({
    profileId: profile!.id,
    workspaceId,
    attemptId: "att-model-1",
    purpose: "generation",
    model: "m",
    tokensIn: 10,
    tokensOut: 5,
    costMicroUsd: 7n,
    costState: "estimated",
    resolvedTier: "creator",
    promptBundleVersion: "v1",
    configVersion: 1,
    outcome: "succeeded",
  });

  await db.insert(subscriptions).values({
    workspaceId,
    stripeCustomerId: "cus_owner",
    stripeSubscriptionId: "sub_owner",
    status: "active",
  });
  // v1-armed: the only armed shape production holds under the durable
  // protocol (the legacy bit is fenced off by migration 0048 and stays
  // false) — round-1 billing BLOCK: the fixture used to arm the legacy bit.
  // 0048's insert trigger normalises a new row to protocol 0 / v1 OFF, so v1
  // is armed by UPDATE, the way the owner action arms it.
  await db
    .update(subscriptions)
    .set({ autoTopupProtocolVersion: 1, autoTopupAttemptCutoverAt: new Date(), autoTopupV1Enabled: true, autoTopupMonthlyCapCents: 1_000 })
    .where(eq(subscriptions.workspaceId, workspaceId));
  await db.insert(stripeEvents).values({
    id: "evt_owner_1",
    type: "invoice.paid",
    payload: { customer: "cus_owner", email: "owner@example.test" },
    workspaceId,
    stripeCustomerId: "cus_owner",
    receiptAttribution: "workspace_attributed",
    outcome: "processed",
    // Governed JSON paths, populated so the probe's path check has a witness
    // (round-1 lean S2).
    tierInvoiceAuthority: {
      respin_tier_invoice_id: "in_owner_1",
      respin_tier_subscription_id: "sub_owner",
      respin_tier_workspace_id: workspaceId,
      respin_tier_customer_id: "cus_owner",
      respin_tier_price_id: "price_creator",
    },
  });
  await db.insert(creditLedger).values({ workspaceId, delta: 100, kind: "grant", expiresAt: new Date(Date.now() + 30 * DAY) });
  await db.insert(workspaceSpendMonthly).values({ workspaceId, periodMonth: "2026-09-01", tier: "creator" });

  return {
    owner,
    survivor,
    workspaceId,
    profileId: profile!.id,
    docId: doc.id,
    privateItemId: privateItem!.id,
    sharedItemId: sharedItem!.id,
    claimId: claim!.id,
    workspaceName: owner.workspace.name,
  };
}

async function backdateGrace(db: TestDb, operationId: string) {
  const past = new Date(Date.now() - DAY);
  const [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, operationId));
  await db
    .update(deletionOperations)
    .set({
      graceExpiresAt: past,
      ...(current!.scope === "identity"
        ? {
            recoveryExpiresAt: past,
            recoveryDeliveryAttemptedAt: new Date(past.getTime() - HOUR),
            recoveryDeliveredAt: new Date(past.getTime() - HOUR + 1_000),
          }
        : {}),
    })
    .where(eq(deletionOperations.id, operationId));
}

async function tickUntilTerminal(db: TestDb, ports: DeletionExecutorPorts, operationId: string, max = 8) {
  const codes: string[] = [];
  for (let index = 0; index < max; index += 1) {
    const summary = await advanceDeletionOperations(db, ports, { workerName: "test-worker", migrations });
    codes.push(...summary.outcomes.map((item) => `${item.from}->${item.to ?? "wait"}:${item.code}`));
    const [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, operationId));
    if (current!.state === "complete" || current!.state === "blocked") return { state: current!.state, codes, operation: current! };
  }
  const [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, operationId));
  return { state: current!.state, codes, operation: current! };
}

describe("deletion executor — populated erasure", () => {
  let db: TestDb;
  let fixture: Fixture;

  beforeEach(async () => {
    db = await createTestDb();
    fixture = await populate(db);
  });

  it("reports zeros when nothing is due and never claims an unacknowledged request", async () => {
    const { port: journalPort } = journal();
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commandPort().port, enablement: ERASURE_DISABLED };
    expect(await advanceDeletionOperations(db, ports, { workerName: "w", migrations })).toEqual({
      claimed: 0, advanced: 0, waiting: 0, blocked: 0, erased: 0, outcomes: [],
    });
  });

  it("erases a workspace: reversible fences first, irreversible commands only after erasing, stub receipts, shared rows survive", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-1", typedName: fixture.workspaceName },
      journalPort
    );
    expect(requested.state).toBe("tombstoned");
    // The fence has a real witness: v1 armed, legacy bit false.
    expect((await db.select().from(subscriptions).where(eq(subscriptions.workspaceId, fixture.workspaceId)))[0]).toMatchObject({
      autoTopupEnabled: false,
      autoTopupV1Enabled: true,
      autoTopupProtocolVersion: 1,
    });
    const commands = commandPort();
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };

    // Tick 1: pre-grace fences enqueued. Tick 2: dispatched → grace.
    let summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => o.to)).toEqual(["external_actions_pending"]);
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => o.to)).toEqual(["grace"]);
    expect(commands.executed).toEqual(["stripe_subscription_cancel_at_period_end", "auto_topup_disable"]);
    // Grace window open: nothing irreversible.
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => o.code)).toEqual(["grace_window_open"]);
    expect(commands.executed).toHaveLength(2);

    await backdateGrace(db, requested.id);
    // R-122 / round-1 billing CHANGE: the ledger, subscription and pause rows
    // still cascade with the workspace, so the executor refuses workspace
    // erasure even with enablement on. Task 6 re-registers those tables under
    // the seven-year receiver; until then this hold is the production truth.
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(unretainedFinancialChainTables("workspace")).toEqual(["credit_ledger", "subscriptions", "pause_periods", "model_usage"]);
    expect(summary.outcomes.map((o) => o.code)).toEqual(["erasure_disabled:financial_chain_unretained:credit_ledger,subscriptions,pause_periods,model_usage"]);
    expect(commands.executed).toHaveLength(2);
    // What erasure DOES once that gate opens is still proven end to end: the
    // worker transition below is exactly the step handleGrace would take.
    await transitionDeletionOperation(db, requested.id, "erasing", journalPort);
    const result = await tickUntilTerminal(db, ports, requested.id);
    expect(result.state, result.codes.join("\n")).toBe("complete");
    expect(commands.executed.slice(2)).toEqual(["stripe_subscription_cancel_now", "stripe_customer_personal_fields_clear"]);

    // The workspace and its whole tree are gone; the survivor's own workspace is untouched.
    expect(await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId))).toHaveLength(0);
    expect(await db.select().from(creatorProfiles).where(eq(creatorProfiles.workspaceId, fixture.workspaceId))).toHaveLength(0);
    expect(await db.select().from(brainDocs)).toHaveLength(0);
    expect(await db.select().from(onboardingInputs)).toHaveLength(0);
    expect(await db.select().from(generations)).toHaveLength(0);
    expect(await db.select().from(trendItems).where(eq(trendItems.id, fixture.privateItemId))).toHaveLength(0);
    // TASK-6 FLIP POINT, not desired behaviour: today's physical truth is that
    // the ledger cascades with the workspace. R-122 keeps the financial chain
    // seven years; Task 6's receiver replaces this line with a retained,
    // pseudonymised ledger (round-1 billing CHANGE).
    expect(await db.select().from(creditLedger)).toHaveLength(0);
    expect(await db.select().from(modelUsage)).toHaveLength(0); // TASK-6 FLIP POINT as above (R-122 model-usage facts)
    expect(await db.select().from(workspaces).where(eq(workspaces.id, fixture.survivor.workspace.id))).toHaveLength(1);
    // Shared rows survive with content intact — the licensed one and the
    // consent-only one (its basis is the owner's identity, not the workspace).
    expect(await db.select().from(trendItems).where(eq(trendItems.id, fixture.sharedItemId))).toHaveLength(1);
    expect((await db.select().from(trendTranscripts)).map((row) => row.content).sort()).toEqual(["CONSENT-TRANSCRIPT", "SHARED-TRANSCRIPT"]);
    // Sessions are global: none revoked by a workspace deletion.
    expect(await db.select().from(session)).toHaveLength(2);
    expect(await db.select().from(users)).toHaveLength(2);

    // Retained system-spend facts cannot re-link to the private sources.
    const usage = await db.select().from(systemModelUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0]!.trendItemId).not.toBe(fixture.privateItemId);
    expect(usage[0]!.jobId).not.toBe(`autopsy:${fixture.claimId}`);
    expect(usage[0]!.jobAttemptId).not.toBe("att-owner-1");
    expect(usage[0]!.costMicroUsd).toBe(5n);
    const claims = await db.select().from(systemSpendClaims);
    expect(claims).toHaveLength(2);
    const ownerClaim = claims.find((row) => row.reservedMicroUsd === 10n && row.jobAttemptId !== "att-shared-1")!;
    expect(ownerClaim.trendItemId).not.toBe(fixture.privateItemId);
    expect(ownerClaim.autopsyCacheClaimId).not.toBe(fixture.claimId);
    expect(claims.find((row) => row.jobAttemptId === "att-shared-1")!.trendItemId).toBe(fixture.sharedItemId);
    const [reconciliation] = await db.select().from(systemModelUsageReconciliations);
    expect(reconciliation!.jobAttemptId).not.toBe("att-owner-1");
    expect(reconciliation!.actualCostMicroUsd).toBe(5n);
    // Stripe receipts keep economics, lose the workspace and the customer link
    // and every governed JSON path.
    const [event] = await db.select().from(stripeEvents);
    expect(event!.workspaceId).toBeNull();
    expect(event!.stripeCustomerId).not.toBe("cus_owner");
    expect(event!.stripeCustomerId).not.toBeNull();
    expect(event!.receiptAttribution).toBe("workspace_attributed");
    expect(event!.tierInvoiceAuthority).toBeNull();
    // RECEIVER CLOCK, stated not hidden (round-1 lean S1 / tenancy): the raw
    // provider payload still carries the subject's email. It is classified
    // `delete_explicit` under `stripe_payload_90_days` because it is Task 6's
    // finance-extract INPUT; subject erasure does not touch it and Task 6's
    // receiver purges it. EVERY scope's erasure is refused in production until
    // Task 6 lands (`erasureHold`: the financial chain for workspace and
    // profile, the unwired payload receiver for identity), so no completed
    // erasure can hold this residue before the receiver exists.
    expect(event!.payload).toEqual({ customer: "cus_owner", email: "owner@example.test" });
    // Monthly spend outlives the workspace under a fresh random id.
    const [spend] = await db.select().from(workspaceSpendMonthly);
    expect(spend!.workspaceId).not.toBe(fixture.workspaceId);
    expect(spend!.tier).toBe("creator");

    // The receipt names a stub, never the erased workspace, and every
    // transition receipt agrees with its parent.
    const [operation] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(operation!.state).toBe("complete");
    expect(operation!.workspaceId).not.toBe(fixture.workspaceId);
    expect(operation!.targetKey).toBe(`workspace:${operation!.workspaceId}`);
    expect(operation!.payloadHash).not.toBe(requested.payloadHash);
    expect(operation!.idempotencyKey).not.toBe("ws-delete-1");
    expect(operation!.requestSessionDigest).toBeNull();
    expect(operation!.leaseOwner).toBeNull();
    const [stub] = await db.select().from(workspaces).where(eq(workspaces.id, operation!.workspaceId!));
    expect(stub).toMatchObject({ name: "Deleted workspace", lifecycleState: "tombstoned" });
    const transitions = await db
      .select()
      .from(deletionOperationTransitions)
      .where(eq(deletionOperationTransitions.operationId, requested.id))
      .orderBy(deletionOperationTransitions.version);
    expect(transitions.map((row) => row.toState)).toEqual([
      "journal_pending",
      "tombstoned",
      "external_actions_pending",
      "grace",
      "erasing",
      "verifying",
      "complete",
    ]);
    for (const row of transitions) {
      expect(row.workspaceId).toBe(operation!.workspaceId);
      expect(row.targetKey).toBe(operation!.targetKey);
      expect(row.payloadHash).toBe(operation!.payloadHash);
    }
    const commandRows = await db.select().from(deletionExternalCommands).where(eq(deletionExternalCommands.operationId, requested.id));
    expect(commandRows).toHaveLength(4);
    expect(commandRows.every((row) => row.workspaceId === operation!.workspaceId && row.status === "succeeded")).toBe(true);
    expect(JSON.stringify([operation, transitions, commandRows])).not.toContain(fixture.workspaceId);
  });

  it("erases an identity: the target's rows go, shared workspace work and the co-owner stay, the receipt points at a stub member", async () => {
    const { port: journalPort } = journal();
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, mailer, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}#${secret}`,
    });
    const requested = await requestIdentityDeletion(
      db,
      { sessionId: "session-owner-auth", idempotencyKey: "identity-delete-1" },
      { recoveryDelivery, journal: journalPort }
    );
    expect(requested.acknowledged).toBe(true);
    expect(requested.operation.state).toBe("tombstoned");
    const ownerUserId = fixture.owner.user.id;
    const commands = commandPort();
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };

    await backdateGrace(db, requested.operation.id);
    // Identity erasure is held too (round-2 lean S-R2-1): the workspace's raw
    // Stripe payload carries this contact's email until Task 6's receiver.
    expect(erasureHold("identity")).toBe("stripe_payload_receiver_unwired");
    const held = await tickUntilTerminal(db, ports, requested.operation.id, 4);
    expect(held.state).toBe("grace");
    expect(held.codes.at(-1)).toBe("grace->wait:erasure_disabled:stripe_payload_receiver_unwired");
    await transitionDeletionOperation(db, requested.operation.id, "erasing", journalPort); // Task-6 flip point
    const result = await tickUntilTerminal(db, ports, requested.operation.id);
    expect(result.state, result.codes.join("\n")).toBe("complete");
    // No workspace-level external commands exist for an identity deletion.
    expect(commands.executed).toEqual([]);
    // RECEIVER CLOCK, pinned for the identity scope as well: the raw payload of
    // the workspace's receipt still names this contact. Task 6 purges it (or
    // plan C3's billing-contact binding refuses the deletion) before any scope
    // is enabled.
    expect((await db.select().from(stripeEvents))[0]!.payload).toEqual({ customer: "cus_owner", email: "owner@example.test" });

    expect(await db.select().from(users).where(eq(users.id, ownerUserId))).toHaveLength(0);
    expect(await db.select().from(authUser).where(eq(authUser.id, "owner-auth"))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.userId, "owner-auth"))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.userId, "survivor-auth"))).toHaveLength(1);
    expect((await db.select().from(verification)).map((row) => row.id)).toEqual(["ver-survivor"]);
    // The consent-only shared row's basis WAS this identity: gone. The
    // licensed one stays, and so does the profile's private one (the
    // workspace and its profiles belong to the surviving co-owner).
    expect((await db.select().from(trendTranscripts)).map((row) => row.content).sort()).toEqual(["OWNER-TRANSCRIPT", "SHARED-TRANSCRIPT"]);
    expect(await db.select().from(memberships).where(eq(memberships.userId, ownerUserId))).toHaveLength(0);
    // Shared workspace work stays with the surviving owner.
    expect(await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId))).toHaveLength(1);
    expect(await db.select().from(brainDocs).where(eq(brainDocs.id, fixture.docId))).toHaveLength(1);
    expect(await db.select().from(memberships).where(and(eq(memberships.workspaceId, fixture.workspaceId), eq(memberships.role, "owner")))).toHaveLength(1);

    const stubs = await db.select().from(authUser);
    const stub = stubs.find((row) => row.name === "Deleted member")!;
    expect(stub).toBeDefined();
    expect(stub.email).toMatch(/@deleted\.invalid$/);
    expect(stub.ordinaryLoginDisabledAt).not.toBeNull();
    const [operation] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.operation.id));
    expect(operation!.state).toBe("complete");
    expect(operation!.userId).not.toBe(ownerUserId);
    expect(operation!.targetKey).toBe(`identity:${operation!.userId}`);
    expect(operation!.requesterUserId).toBeNull();
    // The unkeyed requester digest was sha256 of the user id: a known-id
    // dictionary would relink it. It is replaced per operation, and every
    // transition receipt carries the same replacement (composite FK).
    expect(operation!.requesterDigest).not.toBe(requested.operation.requesterDigest);
    expect(operation!.requesterDigest).toMatch(/^[0-9a-f]{64}$/);
    const identityTransitions = await db
      .select()
      .from(deletionOperationTransitions)
      .where(eq(deletionOperationTransitions.operationId, requested.operation.id));
    expect(identityTransitions.length).toBeGreaterThanOrEqual(6);
    expect(identityTransitions.every((row) => row.requesterDigest === operation!.requesterDigest && row.requesterUserId === null)).toBe(true);
    expect(operation!.recoverySecretDigest).toBeNull();
    expect(operation!.recoveryDeliveryRecipientDigest).not.toBe(requested.operation.recoveryDeliveryRecipientDigest);
    const [stubUser] = await db.select().from(users).where(eq(users.id, operation!.userId!));
    expect(stubUser).toMatchObject({ lifecycleState: "tombstoned", authUserId: stub.id });
    const snapshots = await db.select().from(deletionMembershipSnapshots).where(eq(deletionMembershipSnapshots.operationId, requested.operation.id));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.userId).toBe(operation!.userId);
    expect(snapshots[0]!.workspaceId).toBe(fixture.workspaceId);
    // The owner's admitted mails keep their outcome and lose the recipient
    // link; the SURVIVOR's mail keeps its link (cross-identity isolation).
    const mails = await db.select().from(authMailOutbox);
    const survivorMails = mails.filter((row) => row.authUserId === "survivor-auth");
    expect(survivorMails).toHaveLength(1);
    expect(survivorMails[0]!.recipientDigest).not.toBeNull();
    const scrubbed = mails.filter((row) => row.authUserId !== "survivor-auth");
    expect(scrubbed.length).toBeGreaterThanOrEqual(2);
    expect(scrubbed.every((row) => row.authUserId === null && row.recipientDigest === null)).toBe(true);
    // The recovery mail keeps its opaque operation link: the receipt it names
    // no longer carries the identity either.
    expect(mails.find((row) => row.purpose === "identity_deletion_recovery")!.operationId).toBe(requested.operation.id);
    expect(JSON.stringify([operation, snapshots, mails, identityTransitions])).not.toContain(ownerUserId);
    expect(JSON.stringify([operation, snapshots, mails, identityTransitions])).not.toContain("owner-auth");
  });

  it("erases a profile: the profile tree and its system links go, the workspace, co-owner and shared rows stay", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestProfileDeletion(
      db,
      scope,
      fixture.profileId,
      { sessionId: "session-owner-auth", idempotencyKey: "profile-delete-1", typedName: "Owner Creator" },
      journalPort
    );
    const commands = commandPort();
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };
    await backdateGrace(db, requested.id);
    // R-122 (round-2 billing CHANGE): `model_usage` carries seven-year cost
    // facts and still cascades with the profile, so profile erasure holds at
    // grace too until Task 6 re-registers it.
    expect(unretainedFinancialChainTables("profile")).toEqual(["model_usage"]);
    expect(unretainedFinancialChainTables("identity")).toEqual([]);
    const held = await tickUntilTerminal(db, ports, requested.id, 4);
    expect(held.state).toBe("grace");
    expect(held.codes.at(-1)).toContain("erasure_disabled:financial_chain_unretained:model_usage");
    await transitionDeletionOperation(db, requested.id, "erasing", journalPort); // Task-6 flip point
    const result = await tickUntilTerminal(db, ports, requested.id);
    expect(result.state, result.codes.join("\n")).toBe("complete");
    expect(commands.executed).toEqual([]);
    expect(await db.select().from(modelUsage)).toHaveLength(0); // TASK-6 FLIP POINT (R-122 model-usage facts)

    expect(await db.select().from(creatorProfiles).where(eq(creatorProfiles.id, fixture.profileId))).toHaveLength(0);
    expect(await db.select().from(brainDocs)).toHaveLength(0);
    expect(await db.select().from(generations)).toHaveLength(0);
    expect(await db.select().from(trendItems).where(eq(trendItems.id, fixture.privateItemId))).toHaveLength(0);
    expect(await db.select().from(trendItems).where(eq(trendItems.id, fixture.sharedItemId))).toHaveLength(1);
    expect(await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId))).toHaveLength(1);
    expect(await db.select().from(session)).toHaveLength(2);
    expect(await db.select().from(subscriptions)).toHaveLength(1);
    expect(await db.select().from(creditLedger)).toHaveLength(1);
    const [usage] = await db.select().from(systemModelUsage);
    expect(usage!.trendItemId).not.toBe(fixture.privateItemId);
    expect(usage!.costMicroUsd).toBe(5n);
    const [operation] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(operation!.state).toBe("complete");
    expect(operation!.workspaceId).toBe(fixture.workspaceId);
    expect(operation!.profileId).not.toBe(fixture.profileId);
    expect(operation!.targetKey).toBe(`profile:${fixture.workspaceId}:${operation!.profileId}`);
    const [stub] = await db.select().from(creatorProfiles).where(eq(creatorProfiles.id, operation!.profileId!));
    expect(stub).toMatchObject({ displayName: "Deleted profile", state: "deletion_tombstoned", workspaceId: fixture.workspaceId });
    // Both shared rows survive a profile erasure.
    expect((await db.select().from(trendTranscripts)).map((row) => row.content).sort()).toEqual(["CONSENT-TRANSCRIPT", "SHARED-TRANSCRIPT"]);
    // No retained receipt names the erased profile (round-1 tenancy).
    const profileTransitions = await db.select().from(deletionOperationTransitions).where(eq(deletionOperationTransitions.operationId, requested.id));
    const profileCommands = await db.select().from(deletionExternalCommands).where(eq(deletionExternalCommands.operationId, requested.id));
    expect(profileTransitions.length).toBeGreaterThanOrEqual(6);
    expect(JSON.stringify([operation, profileTransitions, profileCommands])).not.toContain(fixture.profileId);
  });

  it("blocks on residue with the code on the row, releases the abandoned journal reservation, and resumes to complete once clean", async () => {
    // Round-1 lean BLOCK C1: without the release, the `blocked` plan met the
    // erasure plan's leftover reservation and refused `journal_plan_conflict`
    // on every tick, so this path had never run.
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort, requests } = journal();
    const requested = await requestProfileDeletion(
      db,
      scope,
      fixture.profileId,
      { sessionId: "session-owner-auth", idempotencyKey: "profile-delete-residue", typedName: "Owner Creator" },
      journalPort
    );
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commandPort().port, enablement: { erasureEnabled: () => true } };
    await backdateGrace(db, requested.id);
    let summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations }); // → external_actions_pending
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations }); // → grace
    await transitionDeletionOperation(db, requested.id, "erasing", journalPort); // Task-6 flip point (financial-chain hold)
    // Plant one unit of residue through the probe seam: the erasure rolls back.
    const planted = vi.spyOn(LIFECYCLE_PROBES.profile_residue, "execute").mockResolvedValueOnce(1);
    try {
      summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    } finally {
      planted.mockRestore();
    }
    expect(summary.outcomes.map((o) => [o.to, o.code])).toEqual([["blocked", "residue_detected:1"]]);
    let [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current).toMatchObject({ state: "blocked", blockedResumeState: "erasing", lastFailureCode: "residue_detected:1" });
    // Nothing of the rolled-back erasure survived, including its reservation.
    expect(current!.journalIntentPlanDigest).toBeNull();
    expect(await db.select().from(creatorProfiles).where(eq(creatorProfiles.id, fixture.profileId))).toHaveLength(1);
    // Both receipts are appended after the probes, inside the transaction, so
    // a rolled-back erasure appended NOTHING: no orphaned journal version, no
    // version reused with different content (round-2 billing CHANGE — the
    // first fix had appended `verifying` before the effects).
    expect(requests.filter((request) => request.toState === "verifying")).toHaveLength(0);
    expect(await db.select().from(deletionOperationTransitions).where(and(eq(deletionOperationTransitions.operationId, requested.id), eq(deletionOperationTransitions.toState, "verifying")))).toHaveLength(0);
    // Blocked → erasing (nothing failed to retry) → one clean erasure.
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => [o.to, o.code])).toEqual([["erasing", "resumed_after_retry"]]);
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => o.to)).toEqual(["complete"]);
    [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current!.lastFailureCode).toBeNull();
    expect(await db.select().from(creatorProfiles).where(eq(creatorProfiles.id, fixture.profileId))).toHaveLength(0);
    // Every journal version was appended exactly once, in order, with one
    // `verifying` and one `complete`: plan C4's append-only store never sees
    // a version twice.
    const versions = requests.map((request) => request.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(requests.filter((request) => request.toState === "verifying")).toHaveLength(1);
    expect(requests.filter((request) => request.toState === "complete")).toHaveLength(1);
  });

  it("re-reads enablement at every irreversible step: erasing, blocked resume (round-1 tenancy CHANGE, witnessed)", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-8", typedName: fixture.workspaceName },
      journalPort
    );
    const commands = commandPort();
    let enabled = true;
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => enabled } };
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await backdateGrace(db, requested.id);
    await transitionDeletionOperation(db, requested.id, "erasing", journalPort); // Task-6 flip point
    // Switched off while in `erasing`: nothing irreversible dispatches, nothing changes.
    enabled = false;
    let summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => [o.to, o.code])).toEqual([[null, "erasure_disabled"]]);
    expect(commands.executed).toHaveLength(2);
    let [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current).toMatchObject({ state: "erasing", lastFailureCode: null, retryCount: 0 });
    // On: the irreversible commands run, then a planted residue blocks it.
    enabled = true;
    const planted = vi.spyOn(LIFECYCLE_PROBES.workspace_residue, "execute").mockResolvedValueOnce(1);
    try {
      summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    } finally {
      planted.mockRestore();
    }
    expect(summary.outcomes.map((o) => o.to)).toEqual(["blocked"]);
    // Off again while blocked: the resume is refused, state unchanged.
    enabled = false;
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => [o.to, o.code])).toEqual([[null, "erasure_disabled"]]);
    [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current!.state).toBe("blocked");
    expect(await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId))).toHaveLength(1);
    // On: resumed and completed; no command was enqueued or dispatched twice.
    enabled = true;
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => o.to)).toEqual(["erasing"]);
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => o.to)).toEqual(["complete"]);
    const rows = await db.select().from(deletionExternalCommands).where(eq(deletionExternalCommands.operationId, requested.id));
    expect(rows.map((row) => [row.kind, row.attempt, row.status]).sort()).toEqual([
      ["auto_topup_disable", 1, "succeeded"],
      ["stripe_customer_personal_fields_clear", 1, "succeeded"],
      ["stripe_subscription_cancel_at_period_end", 1, "succeeded"],
      ["stripe_subscription_cancel_now", 1, "succeeded"],
    ]);
    expect(commands.executed).toHaveLength(4);
  });

  it("bounds the erase → rollback → resume loop: after the third failure the operation waits for an operator (round-2 lean C-R2-1)", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestProfileDeletion(
      db,
      scope,
      fixture.profileId,
      { sessionId: "session-owner-auth", idempotencyKey: "profile-delete-loop", typedName: "Owner Creator" },
      journalPort
    );
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commandPort().port, enablement: { erasureEnabled: () => true } };
    await backdateGrace(db, requested.id);
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await transitionDeletionOperation(db, requested.id, "erasing", journalPort); // Task-6 flip point
    // Residue on every attempt (exactly one unit, on the root probe): a real
    // executor/probe disagreement that no retry can clear.
    const planted = vi
      .spyOn(LIFECYCLE_PROBES.profile_residue, "execute")
      .mockImplementation(async (_port, probe) => (probe.table === "creator_profiles" ? 1 : 0));
    const codes: string[] = [];
    try {
      for (let tick = 0; tick < DELETION_EXECUTOR_MAX_ERASURE_FAILURES * 2; tick += 1) {
        const summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
        codes.push(...summary.outcomes.map((o) => o.code));
      }
    } finally {
      planted.mockRestore();
    }
    expect(codes).toEqual([
      "residue_detected:1",
      "resumed_after_retry",
      "residue_detected:1",
      "resumed_after_retry",
      "erasure_failures_exhausted:residue_detected:1",
      "blocked_awaiting_operator:erasure_failures_exhausted",
    ]);
    let [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current).toMatchObject({
      state: "blocked",
      blockedResumeState: "erasing",
      lastFailureCode: "erasure_failures_exhausted:residue_detected:1",
      retryCount: DELETION_EXECUTOR_MAX_ERASURE_FAILURES,
    });
    expect(await db.select().from(creatorProfiles).where(eq(creatorProfiles.id, fixture.profileId))).toHaveLength(1);
    // Still exhausted on the next tick: no erasure re-run, the row untouched.
    expect((await advanceDeletionOperations(db, ports, { workerName: "w", migrations })).outcomes.map((o) => o.code)).toEqual(["blocked_awaiting_operator:erasure_failures_exhausted"]);
    expect((await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id)))[0]!.lastFailureCode).toBe("erasure_failures_exhausted:residue_detected:1");
    // The operator's decision, simulated: reset the count.
    await db.update(deletionOperations).set({ retryCount: 0 }).where(eq(deletionOperations.id, requested.id));
    const result = await tickUntilTerminal(db, ports, requested.id);
    expect(result.state, result.codes.join("\n")).toBe("complete");
    [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current!.lastFailureCode).toBeNull();
  });

  it("refuses cancellation while a fence is in flight, and never dispatches a cancelled operation's fence (round-2 billing CHANGE)", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-7", typedName: fixture.workspaceName },
      journalPort
    );
    const commands = commandPort();
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations }); // fences enqueued, undispatched
    // The executor marks a row dispatched BEFORE the provider call; mark the
    // period-end fence that way (in flight, outcome unknown to everyone).
    const [fence] = await db
      .select()
      .from(deletionExternalCommands)
      .where(and(eq(deletionExternalCommands.operationId, requested.id), eq(deletionExternalCommands.kind, "stripe_subscription_cancel_at_period_end")));
    await db.update(deletionExternalCommands).set({ dispatchedAt: new Date() }).where(eq(deletionExternalCommands.id, fence!.id));
    await expect(
      cancelScopedDeletion(db, requested.id, { sessionId: "session-owner-auth" }, journalPort)
    ).rejects.toThrow("external_command_refused:command_in_flight");
    // The provider answers: the fence landed. Cancellation now proceeds and owes the reopen.
    await recordExternalCommandOutcome(db, { commandId: fence!.id, attempt: fence!.attempt }, { outcome: "succeeded", providerRef: "sub_owner" });
    const cancelled = await cancelScopedDeletion(db, requested.id, { sessionId: "session-owner-auth" }, journalPort);
    expect(cancelled.state).toBe("cancelled");
    // The still-undispatched auto-top-up fence can no longer reach the
    // provider: the dispatch mark refuses on a terminal operation.
    const late = commandPort();
    const summary = await dispatchExternalCommands(db, requested.id, "pre_grace", late.port);
    expect(late.executed).toEqual([]);
    expect(summary.pending).toBe(1);
    // …while the owed reversal does dispatch.
    const tick = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(tick.outcomes.map((o) => o.code)).toEqual(["cancellation_reversal_succeeded"]);
    expect(commands.executed).toEqual(["stripe_subscription_reopen"]);
  });

  it("erases a workspace after one of its owners erased their identity: the membership snapshot's RESTRICT workspace link repoints (round-1 tenancy BLOCK)", async () => {
    const { port: journalPort } = journal();
    const recoveryDelivery = createAuthMailRecoveryDelivery(db, mailer, {
      actionUrl: (operationId, secret) => `https://app.example/deletion/${operationId}#${secret}`,
    });
    const identity = await requestIdentityDeletion(
      db,
      { sessionId: "session-owner-auth", idempotencyKey: "identity-delete-then-workspace" },
      { recoveryDelivery, journal: journalPort }
    );
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commandPort().port, enablement: { erasureEnabled: () => true } };
    await backdateGrace(db, identity.operation.id);
    await tickUntilTerminal(db, ports, identity.operation.id, 4); // → grace (held: payload receiver unwired)
    await transitionDeletionOperation(db, identity.operation.id, "erasing", journalPort); // Task-6 flip point
    const identityResult = await tickUntilTerminal(db, ports, identity.operation.id);
    expect(identityResult.state, identityResult.codes.join("\n")).toBe("complete");
    expect(await db.select().from(deletionMembershipSnapshots)).toHaveLength(1);

    // The surviving co-owner deletes the shared workspace.
    const scope = await withWorkspace(db, { authUserId: "survivor-auth", workspaceId: fixture.workspaceId });
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-survivor-auth", idempotencyKey: "ws-delete-after-identity", typedName: fixture.workspaceName },
      journalPort
    );
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await backdateGrace(db, requested.id);
    await transitionDeletionOperation(db, requested.id, "erasing", journalPort); // Task-6 flip point (see the workspace walk)
    const result = await tickUntilTerminal(db, ports, requested.id);
    expect(result.state, result.codes.join("\n")).toBe("complete");
    expect(await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId))).toHaveLength(0);
    const [snapshot] = await db.select().from(deletionMembershipSnapshots);
    const [operation] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(snapshot!.workspaceId).not.toBe(fixture.workspaceId);
    expect(snapshot!.workspaceId).toBe(operation!.workspaceId);
    expect(JSON.stringify([snapshot, operation])).not.toContain(fixture.workspaceId);
  });

  it("sentinel subjects match no row on the populated fixture, and the scope filter admits exactly the operation's own targets", async () => {
    const sentinels: LifecycleRuntimeSubjects = {
      identity: sentinelIdentitySubject(),
      workspace: sentinelWorkspaceSubject(),
      system: { scope: "system", installationId: SENTINEL_INSTALLATION_ID },
      activeOperation: { scope: "workspace" },
    };
    const real: LifecycleRuntimeSubjects = {
      ...sentinels,
      identity: { ...sentinelIdentitySubject(), userId: fixture.owner.user.id, authUserId: "owner-auth" },
      workspace: { ...sentinelWorkspaceSubject(), workspaceId: fixture.workspaceId },
    };
    const cascadeProbes = (subjects: LifecycleRuntimeSubjects) =>
      deriveExpectedResidueProbes(migrations, LIFECYCLE_REGISTRY, ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, subjects, SUPPORTING_LIFECYCLE_STORES)
        .filter((probe) => probe.resourceKind === "app_table" && probe.action === "cascade" && probe.subject.scope !== "system");
    const count = (subjects: LifecycleRuntimeSubjects, subjectScope?: "identity" | "workspace") =>
      db.transaction(async (tx) => {
        const meta = await loadTableMetaInTx(tx);
        const port = createSqlResidueProbePort(tx, { scope: "workspace", meta });
        let total = 0;
        for (const probe of cascadeProbes(subjects)) {
          if (subjectScope && probe.subject.scope !== subjectScope) continue;
          total += await port.countResidual(probe);
        }
        return total;
      });
    expect(cascadeProbes(sentinels).length).toBeGreaterThan(10);
    expect(await count(sentinels)).toBe(0);
    // The same probes with the real ids see the fixture, PER SCOPE (round-2
    // tenancy NOTE: an aggregate count could hide one scope matching nothing).
    expect(await count(real, "identity")).toBeGreaterThan(0);
    expect(await count(real, "workspace")).toBeGreaterThan(0);
    expect(await count(real)).toBeGreaterThan(10);

    // The scope filter, table-driven over every (operation scope × subject × selector).
    const subjectShapes: readonly LifecycleExecutionTarget["subject"][] = [
      sentinelIdentitySubject(),
      sentinelWorkspaceSubject(),
      { scope: "profile", workspaceId: SENTINEL_INSTALLATION_ID, profileId: SENTINEL_INSTALLATION_ID, sourceIds: sentinelWorkspaceSubject().sourceIds },
      { scope: "system", installationId: SENTINEL_INSTALLATION_ID },
      { scope: "related", activeScope: "workspace", activeSubject: sentinelWorkspaceSubject() },
      { scope: "related", activeScope: "profile", activeSubject: { scope: "profile", workspaceId: SENTINEL_INSTALLATION_ID, profileId: SENTINEL_INSTALLATION_ID, sourceIds: sentinelWorkspaceSubject().sourceIds } },
    ];
    const selectorScopes = ["identity", "profile", "workspace", "system"] as const;
    const seen: string[] = [];
    for (const operationScope of ["identity", "profile", "workspace"] as const) {
      for (const subject of subjectShapes) {
        for (const selectorScope of selectorScopes) {
          const admitted = targetAppliesToOperation(operationScope, {
            selector: { scope: selectorScope } as LifecycleExecutionTarget["selector"],
            subject,
          });
          const subjectKey = subject.scope === "related" ? `related:${subject.activeScope}` : subject.scope;
          if (admitted) seen.push(`${operationScope}|${subjectKey}|${selectorScope}`);
        }
      }
    }
    expect(seen.sort()).toEqual([
      // identity operations: identity subjects only, whatever the selector says
      "identity|identity|identity", "identity|identity|profile", "identity|identity|system", "identity|identity|workspace",
      // profile operations: the profile's own rows, plus related rows of a profile-active subject
      "profile|profile|profile",
      "profile|related:profile|identity", "profile|related:profile|profile", "profile|related:profile|system", "profile|related:profile|workspace",
      // workspace operations: workspace- and profile-selected rows, plus related rows of a workspace-active subject
      "workspace|profile|profile", "workspace|profile|workspace",
      "workspace|related:workspace|identity", "workspace|related:workspace|profile", "workspace|related:workspace|system", "workspace|related:workspace|workspace",
      "workspace|workspace|profile", "workspace|workspace|workspace",
    ].sort());
  });

  it("holds at grace while erasure is disabled, and never enqueues an irreversible command before erasing", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-2", typedName: fixture.workspaceName },
      journalPort
    );
    const commands = commandPort();
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: ERASURE_DISABLED };
    await backdateGrace(db, requested.id);
    const result = await tickUntilTerminal(db, ports, requested.id, 4);
    expect(result.state).toBe("grace");
    expect(result.codes.at(-1)).toContain("erasure_disabled");
    expect(commands.executed).toEqual(["stripe_subscription_cancel_at_period_end", "auto_topup_disable"]);
    expect(await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId))).toHaveLength(1);
    const kinds = (await db.select().from(deletionExternalCommands)).map((row) => row.kind);
    expect(kinds).not.toContain("stripe_subscription_cancel_now");
  });

  it("waits on an unknown fence outcome, reconciles it, and blocks then resumes after a failed one", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-3", typedName: fixture.workspaceName },
      journalPort
    );
    const commands = commandPort({
      stripe_subscription_cancel_at_period_end: [
        { outcome: "unknown", reconciliationDigest: sha("timeout") },
      ],
      auto_topup_disable: [{ outcome: "failed", failureCode: "mirror_locked" }],
    });
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    let summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes[0]!.code).toBe("external_command_unknown");
    let [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current!.state).toBe("external_actions_pending");
    // Next tick reconciles the unknown one; the failed one blocks the operation.
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(commands.reconciled).toEqual(["stripe_subscription_cancel_at_period_end"]);
    expect(summary.outcomes[0]!.to).toBe("blocked");
    [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current!.blockedResumeState).toBe("external_actions_pending");
    // The blocked tick retries the failed command (attempt 2) and resumes.
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes[0]!.code).toBe("resumed_after_retry");
    const attempts = await db
      .select()
      .from(deletionExternalCommands)
      .where(and(eq(deletionExternalCommands.operationId, requested.id), eq(deletionExternalCommands.kind, "auto_topup_disable")));
    expect(attempts.map((row) => [row.attempt, row.status]).sort()).toEqual([[1, "failed"], [2, "succeeded"]]);
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes[0]!.to).toBe("grace");
  });

  it("cancelling inside grace refuses while a fence is unknown, then reopens the subscription THIS operation scheduled to end (round-1 billing BLOCK)", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-4", typedName: fixture.workspaceName },
      journalPort
    );
    const commands = commandPort({
      stripe_subscription_cancel_at_period_end: [{ outcome: "unknown", reconciliationDigest: sha("timeout") }],
    });
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    let summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes[0]!.code).toBe("external_command_unknown");
    // Plan C2: an unknown pre-grace outcome blocks cancellation until reconciled.
    await expect(
      cancelScopedDeletion(db, requested.id, { sessionId: "session-owner-auth" }, journalPort)
    ).rejects.toThrow("external_command_refused:unknown_outcome_pending");
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes[0]!.to).toBe("grace");
    expect(commands.reconciled).toEqual(["stripe_subscription_cancel_at_period_end"]);

    const cancelled = await cancelScopedDeletion(db, requested.id, { sessionId: "session-owner-auth" }, journalPort);
    expect(cancelled.state).toBe("cancelled");
    expect((await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId)))[0]!.lifecycleState).toBe("active");
    // The reversal is a durable command row BEFORE any provider call…
    const reopen = await db
      .select()
      .from(deletionExternalCommands)
      .where(and(eq(deletionExternalCommands.operationId, requested.id), eq(deletionExternalCommands.kind, "stripe_subscription_reopen")));
    expect(reopen.map((row) => [row.phase, row.status])).toEqual([["cancellation", "pending"]]);
    // …dispatched by the next tick, after which the cancelled operation is no longer due.
    summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    expect(summary.outcomes.map((o) => [o.to, o.code])).toEqual([["cancelled", "cancellation_reversal_succeeded"]]);
    expect(commands.executed).toEqual(["stripe_subscription_cancel_at_period_end", "auto_topup_disable", "stripe_subscription_reopen"]);
    expect((await advanceDeletionOperations(db, ports, { workerName: "w", migrations })).claimed).toBe(0);
  });

  it("does not reopen a subscription the owner had already scheduled to end before requesting deletion", async () => {
    await db.update(subscriptions).set({ cancelAtPeriodEnd: true }).where(eq(subscriptions.workspaceId, fixture.workspaceId));
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-5", typedName: fixture.workspaceName },
      journalPort
    );
    const commands = commandPort();
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    // Only the auto-top-up fence: the period-end cancellation was the owner's, not ours.
    expect(commands.executed).toEqual(["auto_topup_disable"]);
    await cancelScopedDeletion(db, requested.id, { sessionId: "session-owner-auth" }, journalPort);
    const kinds = (await db.select().from(deletionExternalCommands).where(eq(deletionExternalCommands.operationId, requested.id))).map((row) => row.kind);
    expect(kinds).not.toContain("stripe_subscription_reopen");
    expect((await advanceDeletionOperations(db, ports, { workerName: "w", migrations })).claimed).toBe(0);
  });

  it("retries a failed reversal under the attempt bound, then stops claiming the cancelled operation with the failure on the row", async () => {
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const { port: journalPort } = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "ws-delete-6", typedName: fixture.workspaceName },
      journalPort
    );
    const failed = { outcome: "failed" as const, failureCode: "provider_rate_limited" };
    const commands = commandPort({ stripe_subscription_reopen: [failed, failed, failed] });
    const ports: DeletionExecutorPorts = { journal: journalPort, commands: commands.port, enablement: { erasureEnabled: () => true } };
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
    await cancelScopedDeletion(db, requested.id, { sessionId: "session-owner-auth" }, journalPort);
    const codes: string[] = [];
    for (let tick = 0; tick < 3; tick += 1) {
      const summary = await advanceDeletionOperations(db, ports, { workerName: "w", migrations });
      codes.push(...summary.outcomes.map((o) => o.code));
    }
    expect(codes).toEqual(["external_command_failed", "external_command_failed", "external_command_failed"]);
    const attempts = await db
      .select()
      .from(deletionExternalCommands)
      .where(and(eq(deletionExternalCommands.operationId, requested.id), eq(deletionExternalCommands.kind, "stripe_subscription_reopen")));
    expect(attempts.map((row) => [row.attempt, row.status]).sort()).toEqual([[1, "failed"], [2, "failed"], [3, "failed"]]);
    // Exhausted: not due any more; the row says why; the workspace stayed active.
    expect((await advanceDeletionOperations(db, ports, { workerName: "w", migrations })).claimed).toBe(0);
    const [current] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(current).toMatchObject({ state: "cancelled", lastFailureCode: "external_command_failed" });
    expect((await db.select().from(workspaces).where(eq(workspaces.id, fixture.workspaceId)))[0]!.lifecycleState).toBe("active");
  });
});

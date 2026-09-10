// Phase 10b-1 phase-review fix round: EVERY sweep spec gets a populated row,
// and one tick sweeps them all together.
//
// Two rounds of reviewers found six BLOCKs that a green ~4,800-test gate
// could not see, and every one of them was a sweep spec asserting against an
// empty table. This suite closes the CLASS rather than the instances: the
// fixture map below is a LIST in bijection with `retentionSweepSpecs()` (a spec
// with no entry is red, an entry with no spec is red), each entry seeds rows
// through the real producer where one exists in-process, the clock columns
// are backdated to just past the deadline, and ONE tick runs over every spec
// in the receiver's own order. That last part is what exercises the
// `deletion_*::receipt_facts` RESTRICT graph the reviewers named as the sharp
// case: five child tables and their parent are overdue in the same tick, so a
// parent swept before its children fails the batch, is counted as poisoned,
// and reddens this suite.
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { NO_ACTIVATION_EXCLUSIONS } from "../src/activation";
import { createAuthMailRecoveryDelivery, type AuthMailPort } from "../src/auth-mail";
import { account, rateLimit, session, verification } from "../src/auth-schema";
import {
  beginIdentityCancellationRecoverySession,
  createIdentityCancellationProofWithPassword,
} from "../src/auth-lifecycle";
import { stripeEvents, subscriptions } from "../src/billing-schema";
import { ensureUserWorkspace } from "../src/bootstrap";
import { creatorProfiles } from "../src/brain-schema";
import { advanceDeletionOperations, type DeletionExecutorPorts } from "../src/deletion-executor";
import { EXTERNAL_COMMAND_KINDS, EXTERNAL_COMMAND_SCOPES_BY_KIND } from "../src/deletion-external-commands";
import {
  cancelIdentityDeletion,
  cancelScopedDeletion,
  requestIdentityDeletion,
  requestProfileDeletion,
  requestWorkspaceDeletion,
} from "../src/deletion-lifecycle";
import type { DeletionJournalPort } from "../src/deletion-ports";
import { journalReceiptDigest, journalRequestChecksum } from "../src/deletion-ports";
import { generationAttempts } from "../src/generation-schema";
import { migrationInventory } from "../src/lifecycle-inventory";
import { activationCohortDaily } from "../src/lifecycle-schema";
import { publicSampleSpinBuckets } from "../src/public-sample-spin-schema";
import { LIFECYCLE_COLUMN_CENSUS } from "../src/lifecycle-column-census";
import { memberships, users } from "../src/schema";
import { recordSystemWorkerHealth } from "../src/system-spend";
import { retentionSweepSpecs, type RetentionSweepSpec } from "../src/retention-clocks";
import { runRetentionTick } from "../src/retention-receiver";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { withWorkspace } from "../src/with-workspace";

const RESPIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS = join(RESPIN, "packages/db/migrations");
const migrations = migrationInventory(
  readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }))
);

const DAY = 86_400_000;
const mailer: AuthMailPort = { send: async () => ({ outcome: "accepted", providerMessageId: "re_fixture" }) };

function journal(): DeletionJournalPort {
  return {
    appendTransition: async (request) => {
      const object = {
        objectKey: `test/deletion-journal/${request.operationId}/${String(request.version).padStart(8, "0")}.json`,
        objectVersionId: `version-${request.version}`,
        checksumSha256: journalRequestChecksum(request),
      };
      return { outcome: "confirmed" as const, ...request, ...object, receiptDigest: journalReceiptDigest(request, object) };
    },
  };
}

/**
 * How a spec's rows come to exist. `producer` names the code path that
 * creates them in production, so a reviewer can check the fixture is not a
 * hand-built shape; `unproducible` is the one honest alternative — a spec
 * whose rows NO production path can create today — and it must say why, and
 * the reason is asserted below so the day it stops being true this list
 * demands a fixture.
 */
type Fixture =
  | Readonly<{ producer: string; family: keyof typeof FAMILIES }>
  | Readonly<{ unproducible: string }>;

/**
 * Row producers, grouped because one production walk creates several tables'
 * rows at once. Each returns nothing; the tick and the per-spec probe below do
 * the asserting.
 */
const FAMILIES = {
  async simple_rows(db: TestDb) {
    await seedAuthUser(db, "simple-auth", "simple@example.test");
    const { workspace } = await ensureUserWorkspace(db, { authUserId: "simple-auth", name: "Simple" });
    await db.insert(session).values({
      id: "session-simple",
      token: "token-simple",
      userId: "simple-auth",
      expiresAt: new Date(Date.now() + DAY),
      updatedAt: new Date(),
    });
    await db.insert(rateLimit).values({ id: "rl-fixture", key: "sign-in:9.9.9.9", count: 1, lastRequest: Date.now() });
    await db.insert(publicSampleSpinBuckets).values({
      ipHmac: "a".repeat(64),
      keyVersion: "v1",
      bucketStartedAt: new Date(),
      expiresAt: new Date(Date.now() + DAY),
      admitted: 1,
    });
    await db.insert(verification).values({
      id: "ver-fixture",
      identifier: `reset-password:${"z".repeat(24)}`,
      value: "simple-auth",
      expiresAt: new Date(Date.now() + DAY),
      updatedAt: new Date(),
    });
    await db.insert(activationCohortDaily).values({ cohortDate: new Date(Date.now() - DAY).toISOString().slice(0, 10), signups: 3, activated: 1, excluded: 0, metricVersion: 1 });
    await recordSystemWorkerHealth(db, {
      workerName: "fixture-worker",
      lastHeartbeatAt: new Date(),
      scheduleLagSeconds: 0,
      activeCount: 0,
      parkedCount: 0,
      deadLetterCount: 0,
      poolInUse: 0,
      poolCapacity: 1,
      budgetExhausted: false,
    });
    // One Stripe event per attribution class, the way the webhook stores them,
    // plus a finance extract row in the `complete` class.
    const payload = (id: string) => ({
      data: { object: { object: "invoice", id, currency: "usd", payment_intent: `pi_${id}`, lines: { data: [] }, customer_email: "person@example.test" } },
    });
    await db.insert(stripeEvents).values([
      { id: "evt_ws", type: "invoice.paid", outcome: "processed", receivedAt: new Date(), receiptAttribution: "workspace_attributed", stripeCustomerId: "cus_fix", workspaceId: workspace.id, payload: payload("in_ws") },
      // `tier_invoice_authority` present, so the provider_financial_authority
      // redaction has something to null (an already-NULL column is "done").
      { id: "evt_cus", type: "invoice.paid", outcome: "processed", receivedAt: new Date(), receiptAttribution: "customer_attributed", stripeCustomerId: "cus_fix2", workspaceId: null, payload: payload("in_cus"), tierInvoiceAuthority: { respin_tier_invoice_id: "in_cus" } },
      { id: "evt_none", type: "invoice.paid", outcome: "refused_unknown_customer", receivedAt: new Date(), receiptAttribution: "unattributed", stripeCustomerId: null, workspaceId: null, payload: payload("in_none"), tierInvoiceAuthority: { respin_tier_invoice_id: "in_none" } },
    ]);
    await db.execute(sql`
      INSERT INTO "stripe_finance_extracts"
        (id, source_stripe_event_id, object_type, object_id, status, incomplete_reason,
         currency, amount_excluding_tax_cents, extraction_version, ingested_at)
      VALUES (gen_random_uuid(), 'evt_ws', 'invoice_line', 'il_fixture', 'complete', NULL, 'USD', 100, 1, now())
    `);
  },

  async terminal_attempt(db: TestDb) {
    await seedAuthUser(db, "attempt-auth", "attempt@example.test");
    const { workspace } = await ensureUserWorkspace(db, { authUserId: "attempt-auth", name: "Attempt" });
    const [profile] = await db.insert(creatorProfiles).values({ workspaceId: workspace.id, displayName: "Attempt Creator" }).returning();
    await db.insert(generationAttempts).values({
      attemptId: "att-refused-1",
      profileId: profile!.id,
      workspaceId: workspace.id,
      purpose: "generation",
      mode: "hook",
      state: "refused",
      refusalCode: "abandoned_before_vendor",
      payloadSha256: "a".repeat(64),
      claimedAt: new Date(),
      terminalAt: new Date(),
    });
  },

  /** The three scoped and identity walks the owner surface makes, each driven to a TERMINAL state. */
  async deletion_family(db: TestDb) {
    const password = "fixture-cancellation-password";
    await seedAuthUser(db, "del-owner-auth", "del-owner@example.test");
    await seedAuthUser(db, "del-survivor-auth", "del-survivor@example.test");
    const owner = await ensureUserWorkspace(db, { authUserId: "del-owner-auth", name: "Deletion Owner" });
    const survivor = await ensureUserWorkspace(db, { authUserId: "del-survivor-auth", name: "Deletion Survivor" });
    await db.insert(memberships).values({ userId: survivor.user.id, workspaceId: owner.workspace.id, role: "owner" });
    await db.insert(account).values({
      id: "credential-del-owner-auth",
      accountId: "del-owner-auth",
      providerId: "credential",
      userId: "del-owner-auth",
      password: await hashPassword(password),
    });
    for (const [authUserId, id] of [["del-owner-auth", "session-del-owner"], ["del-survivor-auth", "session-del-survivor"]] as const) {
      await db.insert(session).values({
        id,
        token: `token-${id}`,
        userId: authUserId,
        expiresAt: new Date(Date.now() + DAY),
        updatedAt: new Date(),
        reauthenticatedAt: new Date(),
      });
    }
    const log = journal();
    // A live subscription with auto-top-up armed, so the workspace walk
    // enqueues and dispatches BOTH pre-grace fences (real command rows), and
    // the cancel enqueues the reversal. The survivor holds the billing contact
    // so the identity walk below is admitted (plan C3).
    await db.insert(subscriptions).values({
      workspaceId: owner.workspace.id,
      stripeCustomerId: "cus_fixture",
      stripeSubscriptionId: "sub_fixture",
      status: "active",
      billingContactUserId: survivor.user.id,
    });
    await db
      .update(subscriptions)
      .set({ autoTopupProtocolVersion: 1, autoTopupAttemptCutoverAt: new Date(), autoTopupV1Enabled: true, autoTopupMonthlyCapCents: 1_000 })
      .where(eq(subscriptions.workspaceId, owner.workspace.id));

    // WORKSPACE: request -> pre-grace commands enqueued and dispatched -> cancel -> reversal dispatched.
    const ownerScope = await withWorkspace(db, { authUserId: "del-owner-auth" });
    const ws = await requestWorkspaceDeletion(
      db,
      ownerScope,
      { sessionId: "session-del-owner", idempotencyKey: "fixture-ws", typedName: owner.workspace.name },
      log
    );
    const ports: DeletionExecutorPorts = {
      journal: log,
      commands: { execute: async (c) => ({ outcome: "succeeded", providerRef: `${c.kind}:ok` }), reconcile: async () => ({ outcome: "succeeded" }) },
      enablement: { erasureEnabled: () => false },
    };
    await advanceDeletionOperations(db, ports, { workerName: "fixture", migrations, activationExclusions: NO_ACTIVATION_EXCLUSIONS });
    await advanceDeletionOperations(db, ports, { workerName: "fixture", migrations, activationExclusions: NO_ACTIVATION_EXCLUSIONS });
    await cancelScopedDeletion(db, ws.id, { sessionId: "session-del-owner" }, log);
    await advanceDeletionOperations(db, ports, { workerName: "fixture", migrations, activationExclusions: NO_ACTIVATION_EXCLUSIONS });

    // PROFILE: request -> cancel. The scope is re-minted: the workspace walk
    // above bumped the workspace lifecycle version, so the first scope is
    // stale by design (`scope_stale`).
    const [profile] = await db.insert(creatorProfiles).values({ workspaceId: owner.workspace.id, displayName: "Fixture Creator" }).returning();
    const freshScope = await withWorkspace(db, { authUserId: "del-owner-auth" });
    const pr = await requestProfileDeletion(
      db,
      freshScope,
      profile!.id,
      { sessionId: "session-del-owner", idempotencyKey: "fixture-profile", typedName: "Fixture Creator" },
      log
    );
    await cancelScopedDeletion(db, pr.id, { sessionId: "session-del-owner" }, log);

    // IDENTITY: request (mail outbox + membership snapshots + recovery secret)
    // -> recovery session -> password proof -> cancel (cancellation proof).
    let secret = "";
    const inner = createAuthMailRecoveryDelivery(db, mailer, {
      actionUrl: (operationId, s) => {
        secret = s;
        return `https://app.example/deletion/${operationId}#${s}`;
      },
    });
    const requested = await requestIdentityDeletion(
      db,
      { sessionId: "session-del-owner", idempotencyKey: "fixture-identity" },
      { recoveryDelivery: inner, journal: log, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(requested.operation.state).toBe("tombstoned");
    const rateLimitKeyDigest = "f".repeat(64);
    const recovery = await beginIdentityCancellationRecoverySession(db, requested.operation.id, secret, rateLimitKeyDigest);
    const proof = await createIdentityCancellationProofWithPassword(db, requested.operation.id, recovery.recoverySession, password, rateLimitKeyDigest);
    await cancelIdentityDeletion(
      db,
      requested.operation.id,
      secret,
      { proofId: proof.proofId, cancellationReceipt: proof.cancellationReceipt },
      { journal: log, membershipRestore: { mayRestore: vi.fn(async () => ({ allowed: true, refusal: null })) } }
    );

    // A SECOND identity, requested and left in `tombstoned` with its recovery
    // secret LIVE: the seven-day secret redaction needs a row whose digest is
    // still present (a cancelled operation's secret is already spent), and a
    // non-terminal row is exactly what the one-year receipt delete must leave.
    await seedAuthUser(db, "del-third-auth", "del-third@example.test");
    await db.insert(session).values({
      id: "session-del-third",
      token: "token-session-del-third",
      userId: "del-third-auth",
      expiresAt: new Date(Date.now() + DAY),
      updatedAt: new Date(),
      reauthenticatedAt: new Date(),
    });
    const [third] = await db.insert(users).values({ authUserId: "del-third-auth" }).returning();
    expect(third).toBeDefined();
    const live = await requestIdentityDeletion(
      db,
      { sessionId: "session-del-third", idempotencyKey: "fixture-identity-live" },
      {
        recoveryDelivery: createAuthMailRecoveryDelivery(db, mailer, { actionUrl: (operationId, s) => `https://app.example/deletion/${operationId}#${s}` }),
        journal: log,
        activationExclusions: NO_ACTIVATION_EXCLUSIONS,
      }
    );
    expect(live.operation.state).toBe("tombstoned");
    expect(live.operation.recoverySecretDigest).not.toBeNull();
  },
} as const;

/**
 * THE LIST. Keys are the spec keys `retentionSweepSpecs()` emits; the bijection
 * is asserted first, so a new sweep cannot ship without a row here.
 */
const FIXTURES: Readonly<Record<string, Fixture>> = {
  "activation_cohort_daily::system_row::complete_row": { producer: "applyActivationContributionInTx (row shape inserted directly)", family: "simple_rows" },
  "auth_mail_outbox::identity_row::delivery_outcome_facts": { producer: "createAuthMailRecoveryDelivery via requestIdentityDeletion", family: "deletion_family" },
  "deletion_cancellation_proofs::identity_row::complete_row": { producer: "createIdentityCancellationProofWithPassword", family: "deletion_family" },
  "deletion_external_commands::identity_row::receipt_facts": {
    unproducible: "no external command kind admits the identity scope (EXTERNAL_COMMAND_SCOPES_BY_KIND), so no identity operation ever holds a command row",
  },
  "deletion_external_commands::profile_row::receipt_facts": {
    unproducible: "no external command kind admits the profile scope (EXTERNAL_COMMAND_SCOPES_BY_KIND), so no profile operation ever holds a command row",
  },
  "deletion_external_commands::workspace_row::receipt_facts": { producer: "handleTombstoned + dispatchExternalCommands (pre-grace fences)", family: "deletion_family" },
  "deletion_membership_snapshots::identity_row::receipt_facts": { producer: "requestIdentityDeletion", family: "deletion_family" },
  "deletion_operation_transitions::identity_row::receipt_facts": { producer: "transitionDeletionOperation (identity request + cancel)", family: "deletion_family" },
  "deletion_operation_transitions::profile_row::receipt_facts": { producer: "transitionDeletionOperation (profile request + cancel)", family: "deletion_family" },
  "deletion_operation_transitions::workspace_row::receipt_facts": { producer: "transitionDeletionOperation (workspace request, ticks, cancel)", family: "deletion_family" },
  "deletion_operations::identity_row::receipt_facts": { producer: "requestIdentityDeletion -> cancelIdentityDeletion", family: "deletion_family" },
  "deletion_operations::identity_row::recovery_secret": { producer: "requestIdentityDeletion (retention-receiver.test.ts also witnesses the live-secret shape)", family: "deletion_family" },
  "deletion_operations::profile_row::receipt_facts": { producer: "requestProfileDeletion -> cancelScopedDeletion", family: "deletion_family" },
  "deletion_operations::profile_row::recovery_secret": {
    unproducible: "deletion_operations_recovery_shape forces recovery_expires_at NULL for every non-identity scope (refused insert asserted below, on the real profile operation)",
  },
  "deletion_operations::workspace_row::receipt_facts": { producer: "requestWorkspaceDeletion -> cancelScopedDeletion", family: "deletion_family" },
  "deletion_operations::workspace_row::recovery_secret": {
    unproducible: "deletion_operations_recovery_shape forces recovery_expires_at NULL for every non-identity scope (refused insert asserted below, on the real workspace operation)",
  },
  "deletion_recovery_sessions::identity_row::complete_row": { producer: "beginIdentityCancellationRecoverySession", family: "deletion_family" },
  "generation_attempts::profile_row::complete_row": { producer: "generation attempt terminal write (row shape inserted directly)", family: "terminal_attempt" },
  "public_sample_spin_buckets::system_row::complete_row": { producer: "admitPublicSampleSpin (row shape inserted directly)", family: "simple_rows" },
  "rate_limit::system_row::complete_row": { producer: "Better Auth limiter (row shape inserted directly)", family: "simple_rows" },
  "session::identity_row::complete_row": { producer: "Better Auth session (row shape inserted directly)", family: "simple_rows" },
  "stripe_events::stripe_customer_attributed::linkable_source_ids": { producer: "webhook store (row shape inserted directly)", family: "simple_rows" },
  "stripe_events::stripe_customer_attributed::provider_financial_authority": { producer: "webhook store (row shape inserted directly)", family: "simple_rows" },
  "stripe_events::stripe_customer_attributed::provider_payload": { producer: "webhook store (row shape inserted directly)", family: "simple_rows" },
  "stripe_events::stripe_unattributed::provider_financial_authority": { producer: "webhook store (row shape inserted directly)", family: "simple_rows" },
  "stripe_events::stripe_unattributed::provider_payload": { producer: "webhook store (row shape inserted directly)", family: "simple_rows" },
  "stripe_events::stripe_workspace_attributed::provider_payload": { producer: "webhook store (row shape inserted directly)", family: "simple_rows" },
  "stripe_finance_extracts::finance_extract_complete::complete_row": { producer: "extractBeforeRedaction (row shape inserted directly)", family: "simple_rows" },
  "system_worker_health::system_row::complete_row": { producer: "recordSystemWorkerHealth", family: "simple_rows" },
  "verification::identity_row::complete_row": { producer: "Better Auth verification (row shape inserted directly)", family: "simple_rows" },
};

/** Columns a backdate may move, per table: the clock column plus the ordering columns CHECKs tie it to. */
const CLOCK_COMPANIONS: Readonly<Record<string, readonly string[]>> = {
  deletion_operations: ["requested_at", "created_at", "updated_at", "tombstoned_at", "acknowledged_at", "recovery_expires_at", "recovery_delivery_attempted_at", "recovery_delivered_at", "grace_expires_at", "identity_cancellation_receipt_expires_at"],
  deletion_operation_transitions: ["created_at"],
  deletion_external_commands: ["created_at", "updated_at", "dispatched_at", "resolved_at"],
  deletion_membership_snapshots: ["created_at", "outcome_at"],
  deletion_cancellation_proofs: ["created_at", "factor_verified_at", "expires_at", "consumed_at"],
  deletion_recovery_sessions: ["created_at", "expires_at", "consumed_at"],
  auth_mail_outbox: ["created_at", "updated_at", "admitted_at", "dispatched_at", "resolved_at", "action_expires_at"],
  // Phase 10a C4: `expires_at <= bucket_started_at + 24 h` is CHECKed, so the two move together.
  public_sample_spin_buckets: ["bucket_started_at", "expires_at", "updated_at"],
};

async function backdate(db: TestDb, spec: RetentionSweepSpec, past: Date): Promise<void> {
  const table = spec.measure.table;
  const columns = new Set(LIFECYCLE_COLUMN_CENSUS[table] ?? []);
  const clock = spec.measure.measuredFrom;
  if (spec.measure.measuredAs === "epoch_millis") {
    await db.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(clock)} = ${past.getTime()}`);
    return;
  }
  if (table === "activation_cohort_daily") {
    await db.execute(sql`UPDATE "activation_cohort_daily" SET cohort_date = ${past.toISOString().slice(0, 10)}::date`);
    return;
  }
  // SHIFT, never set: every companion moves by the same per-row delta the
  // clock moves, so the exact-interval CHECKs (`expires_at = created_at + 15
  // minutes`, `expires_at = factor_verified_at + 10 minutes`, `resolved_at >=
  // dispatched_at`, ...) hold after the backdate exactly as they held before.
  // Postgres evaluates every right-hand side against the OLD row, which is
  // what lets the clock's old value appear in each companion's expression.
  const clockId = sql.identifier(clock);
  const companions = (CLOCK_COMPANIONS[table] ?? []).filter((c) => c !== clock && columns.has(c));
  const assignments = [
    sql`${clockId} = CASE WHEN ${clockId} IS NULL THEN NULL ELSE ${past}::timestamptz END`,
    ...companions.map(
      (c) => sql`${sql.identifier(c)} = CASE WHEN ${clockId} IS NULL OR ${sql.identifier(c)} IS NULL THEN ${sql.identifier(c)} ELSE ${sql.identifier(c)} - (${clockId} - ${past}::timestamptz) END`
    ),
  ];
  await db.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.join(assignments, sql`, `)}`);
}

async function count(db: TestDb, table: string, where: ReturnType<typeof sql> = sql`TRUE`): Promise<number> {
  const result = (await db.execute(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)} WHERE ${where}`)) as unknown as { rows: { n: number }[] };
  return result.rows[0]!.n;
}

describe("every retention sweep spec has a populated witness, and one tick sweeps them all", () => {
  const specs = retentionSweepSpecs();

  it("the fixture list is in BIJECTION with the sweep specs (a new spec cannot ship without a row here)", () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(specs.map((spec) => spec.key).sort());
  });

  it("every `unproducible` reason is still true", () => {
    const commandScopes = new Set<string>(EXTERNAL_COMMAND_KINDS.flatMap((kind) => [...EXTERNAL_COMMAND_SCOPES_BY_KIND[kind]]));
    expect(commandScopes.has("identity")).toBe(false);
    expect(commandScopes.has("profile")).toBe(false);
    for (const [key, fixture] of Object.entries(FIXTURES)) {
      if (!("unproducible" in fixture)) continue;
      expect(fixture.unproducible.length, key).toBeGreaterThan(20);
    }
  });

  describe("populated, backdated, swept", () => {
    let db: TestDb;
    const populated = specs.filter((spec) => "producer" in FIXTURES[spec.key]!);
    const past = new Date(Date.now() - 8 * 365 * DAY); // older than the seven-year clock's cutoff

    beforeAll(async () => {
      db = await createTestDb();
      for (const family of Object.values(FAMILIES)) await family(db);
    }, 60_000);

    it("the two non-identity `recovery_secret` specs are dead BY CHECK — both halves, on the real rows (tenancy gate, fix round 2)", async () => {
      // Half one: the database refuses giving a workspace or profile operation
      // a recovery expiry, which the measure's precondition requires.
      for (const scope of ["workspace", "profile"]) {
        let refusal: { code?: string; constraint?: string } | null = null;
        try {
          await db.execute(sql`UPDATE "deletion_operations" SET recovery_expires_at = now() WHERE scope = ${scope}::deletion_scope`);
        } catch (error) {
          const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
          refusal = { code: cause.code, constraint: cause.constraint };
        }
        expect(refusal, scope).toEqual({ code: "23514", constraint: "deletion_operations_recovery_shape" });
      }
      // Half two: the measure's own UPDATE is LEGAL on those rows, RUN FOR
      // REAL on every workspace and profile operation (the previous version
      // hid behind `AND FALSE`, touched zero rows, and so proved only that the
      // statement parsed — while the measure it vouched for carried the
      // identity stamp the CHECK forbids here). The identity measure's stamp
      // is asserted ILLEGAL on the same rows, which is why the two classes
      // carry different effects.
      const assignment = (column: string, to: string) =>
        to === "null" ? sql`${sql.identifier(column)} = NULL`
        : to === "now_if_null" ? sql`${sql.identifier(column)} = COALESCE(${sql.identifier(column)}, now())`
        : sql`${sql.identifier(column)} = '{}'::jsonb`;
      for (const spec of specs.filter((s) => s.measure.table === "deletion_operations" && s.measure.fieldSet === "recovery_secret" && s.measure.rowClass !== "identity_row")) {
        expect(spec.measure.effect.kind).toBe("redact_columns");
        if (spec.measure.effect.kind !== "redact_columns") continue;
        const scope = spec.measure.rowClass === "workspace_row" ? "workspace" : "profile";
        const rows = (await db.execute(sql`SELECT count(*)::int AS n FROM "deletion_operations" WHERE scope = ${scope}::deletion_scope`)) as unknown as { rows: { n: number }[] };
        expect(rows.rows[0]!.n, scope).toBeGreaterThan(0);
        // The measure's real effect: legal (no CHECK fires).
        await db.execute(sql`
          UPDATE "deletion_operations"
          SET ${sql.join(spec.measure.effect.columns.map((c) => assignment(c.column, c.to)), sql`, `)}
          WHERE scope = ${scope}::deletion_scope
        `);
        // The identity measure's stamp on the same rows: refused.
        let refusal: { code?: string; constraint?: string } | null = null;
        try {
          await db.execute(sql`UPDATE "deletion_operations" SET recovery_consumed_at = COALESCE(recovery_consumed_at, now()) WHERE scope = ${scope}::deletion_scope`);
        } catch (error) {
          const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? (error as { code?: string; constraint?: string });
          refusal = { code: cause.code, constraint: cause.constraint };
        }
        expect(refusal, `${scope}: the identity stamp must be illegal here`).toEqual({ code: "23514", constraint: "deletion_operations_recovery_shape" });
      }
    });

    it("every producible spec has at least one row BEFORE the sweep", async () => {
      for (const spec of populated) {
        expect(await count(db, spec.measure.table), spec.key).toBeGreaterThan(0);
      }
    });

    it("nothing is swept one tick BEFORE any deadline", async () => {
      const summary = await runRetentionTick(db, new Date(), specs);
      expect(summary.failures).toEqual([]);
      expect(summary.poisoned).toBe(0);
      expect(summary.deleted + summary.redacted).toBe(0);
    });

    it("ONE tick over every spec, all overdue, sweeps every populated table and reports NO failure and NO poison — including the RESTRICT receipt graph", async () => {
      for (const spec of populated) await backdate(db, spec, past);
      const before = Object.fromEntries(await Promise.all(populated.map(async (spec) => [spec.key, await count(db, spec.measure.table)] as const)));
      const summary = await runRetentionTick(db, new Date(), specs);
      expect(summary.failures, JSON.stringify(summary.tables.filter((t) => t.failureCode), null, 2)).toEqual([]);
      expect(summary.poisoned).toBe(0);
      for (const spec of populated) {
        const outcome = summary.tables.find((table) => table.key === spec.key)!;
        expect(outcome, spec.key).toBeDefined();
        if (spec.measure.effect.kind === "delete_row") {
          expect(outcome.deleted, `${spec.key} deleted rows (had ${before[spec.key]})`).toBeGreaterThan(0);
        } else {
          expect(outcome.redacted, `${spec.key} redacted rows (had ${before[spec.key]})`).toBeGreaterThan(0);
          for (const column of spec.measure.effect.columns) {
            const remaining = await count(
              db,
              spec.measure.table,
              column.to === "null"
                ? sql`${sql.identifier(column.column)} IS NOT NULL`
                : column.to === "empty_jsonb"
                  ? sql`${sql.identifier(column.column)} <> '{}'::jsonb`
                  : column.to === "now_if_null"
                    ? sql`${sql.identifier(column.column)} IS NULL`
                    : sql`FALSE`
            );
            // Every row of the table is overdue here, so a redacted column is
            // redacted on all rows OF THAT CLASS; rows of other classes may
            // legitimately keep the column, so this is asserted only when the
            // whole table is one class.
            const classes = specs.filter((s) => s.measure.table === spec.measure.table).map((s) => s.measure.rowClass);
            if (new Set(classes).size === 1) expect(remaining, `${spec.key} ${column.column}`).toBe(0);
          }
        }
        // Idempotent: nothing is left overdue for this spec.
        expect(outcome.oldestOverdueMs, `${spec.key} still overdue`).toBeNull();
      }
      // The terminal deletion family is gone: every cancelled operation and
      // every child receipt row, in the receiver's own order, in one tick. The
      // one NON-terminal operation (the live identity request) survives with
      // its secret redacted and consumed — a shape the CHECK admits.
      for (const table of ["deletion_external_commands", "deletion_membership_snapshots", "deletion_cancellation_proofs", "deletion_recovery_sessions"]) {
        expect(await count(db, table), table).toBe(0);
      }
      expect(await count(db, "deletion_operations", sql`state IN ('complete', 'cancelled')`)).toBe(0);
      expect(await count(db, "deletion_operations", sql`state = 'tombstoned' AND recovery_secret_digest IS NULL AND recovery_consumed_at IS NOT NULL`)).toBe(1);
    }, 60_000);

    it("a second tick is a no-op", async () => {
      const summary = await runRetentionTick(db, new Date(), specs);
      expect(summary.failures).toEqual([]);
      expect(summary.deleted + summary.redacted).toBe(0);
    });
  });
});

// Keep the import used even when every deletion-family fixture is produced
// through the real walks above: the id helps a reader plant a variant.
void randomUUID;
void eq;

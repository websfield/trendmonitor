import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { and, eq, like, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { account, rateLimit, session, user as authUser } from "../src/auth-schema";
import { subscriptions } from "../src/billing-schema";
import {
  assertReauthenticatedWorkspaceScopeInTx,
  AUTH_PASSWORD_MAX_LENGTH,
  beginIdentityCancellationRecoverySession,
  createIdentityCancellationProofWithPassword,
  reauthenticateSessionWithPassword,
} from "../src/auth-lifecycle";
import { ensureUserWorkspace } from "../src/bootstrap";
import { creatorProfiles } from "../src/brain-schema";
import type { TxLike } from "../src/db-like";
import {
  assertBillingContactReleased,
  assertDeletionTransition,
  PENDING_DELETION_STATES,
  cancelIdentityDeletion,
  cancelScopedDeletion,
  DELETION_GRACE_MS,
  DELETION_REAUTH_MAX_AGE_MS,
  IDENTITY_CASCADE_KEY_PREFIX,
  requestIdentityDeletion,
  requestProfileDeletion,
  requestWorkspaceDeletion,
  resumeIdentityDeletionRequest,
  resumeIdentityDeletionCancellation,
  resumeScopedDeletionCancellation,
  resumeProfileDeletionRequest,
  resumeWorkspaceDeletionRequest,
  transitionDeletionOperation,
  readIdentityCancellationStatus,
  pendingDeletionsForScope,
  resumeWedgedDeletionOperations,
} from "../src/deletion-lifecycle";
import { NO_SEAT_CAP_RESTORE_POLICY } from "../src/deletion-ports";
import { deriveActivationCohorts, NO_ACTIVATION_EXCLUSIONS } from "../src/activation";
import { runRetentionTick } from "../src/retention-receiver";
import type {
  DeletionJournalPort,
  JournalTransitionRequest,
  RecoveryDeliveryPort,
} from "../src/deletion-ports";
import {
  journalReceiptDigest,
  journalRequestChecksum,
} from "../src/deletion-ports";
import {
  deletionMembershipSnapshots,
  deletionCancellationProofs,
  deletionOperations,
  deletionOperationTransitions,
  deletionRecoverySessions,
  deletionOperationState,
  type DeletionOperation,
  type DeletionOperationState,
} from "../src/lifecycle-schema";
import { memberships, users, workspaces } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import {
  isReadGradeScope,
  ProfileScope,
  withWorkspace,
  WorkspacePendingDeletionError,
} from "../src/with-workspace";

const NOW = new Date();
const HOUR = 60 * 60 * 1_000;

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function confirmedJournal() {
  const requests: JournalTransitionRequest[] = [];
  const port: DeletionJournalPort = {
    appendTransition: vi.fn(async (request) => {
      requests.push(request);
      const object = {
        objectKey: `test/deletion-journal/${request.operationId}/${String(request.version).padStart(8, "0")}.json`,
        objectVersionId: `version-${request.version}`,
        checksumSha256: journalRequestChecksum(request),
      };
      return {
        outcome: "confirmed" as const,
        schemaVersion: request.schemaVersion,
        operationId: request.operationId,
        scope: request.scope,
        target: request.target,
        requesterDigest: request.requesterDigest,
        version: request.version,
        fromState: request.fromState,
        toState: request.toState,
        payloadHash: request.payloadHash,
        priorReceiptDigest: request.priorReceiptDigest,
        requestedAt: request.requestedAt,
        effectiveAt: request.effectiveAt,
        retainUntil: request.retainUntil,
        ...object,
        receiptDigest: journalReceiptDigest(request, object),
      };
    }),
  };
  return { port, requests };
}

function confirmedDeliveryResult(
  request: Parameters<RecoveryDeliveryPort["deliverIdentityRecovery"]>[0],
  deliveredAt = new Date()
) {
  return {
    outcome: "confirmed" as const,
    operationId: request.operationId,
    commandId: request.commandId,
    attempt: request.attempt,
    secretDigest: request.secretDigest,
    recipientDigest: request.recipientDigest,
    expiresAt: request.expiresAt,
    deliveredAt,
    deliveryReceiptDigest: sha(`delivery:${request.commandId}:${request.attempt}`),
  };
}

async function addSession(
  db: TestDb,
  authUserId: string,
  id: string,
  reauthenticatedAt = NOW
) {
  await db.insert(session).values({
    id,
    token: `token-${id}`,
    userId: authUserId,
    expiresAt: new Date(NOW.getTime() + HOUR),
    updatedAt: NOW,
    reauthenticatedAt,
    reauthenticatedMethod: "password",
  });
}

async function bootstrap(db: TestDb, authUserId: string, name: string) {
  await seedAuthUser(db, authUserId);
  const result = await ensureUserWorkspace(db, { authUserId, name });
  await addSession(db, authUserId, `session-${authUserId}`);
  return result;
}

async function identityFixture(db: TestDb) {
  const target = await bootstrap(db, "target-auth", "Target");
  const survivor = await bootstrap(db, "survivor-auth", "Survivor");
  await db.insert(memberships).values({
    userId: survivor.user.id,
    workspaceId: target.workspace.id,
    role: "owner",
  });
  return { target, survivor };
}

describe("Phase 10b-1 deletion lifecycle", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("keeps the state graph forward-only, and asserts EVERY (state, cancelled) pair accepted or refused", () => {
    const accepted: readonly [DeletionOperationState, DeletionOperationState][] = [
      ["requested", "journal_pending"],
      ["journal_pending", "tombstoned"],
      ["tombstoned", "external_actions_pending"],
      ["external_actions_pending", "grace"],
      ["grace", "erasing"],
      ["erasing", "verifying"],
      ["verifying", "complete"],
      // R-162: the TWO resume targets `handleBlocked` produces, and no other.
      ["blocked", "external_actions_pending"],
      ["blocked", "erasing"],
    ];
    for (const [from, to] of accepted) {
      expect(() => assertDeletionTransition(from, to)).not.toThrow();
    }
    for (const [from, to] of [
      ["tombstoned", "requested"],
      ["complete", "grace"],
      ["blocked", "requested"],
      // R-162: the three resume edges nothing produced are gone.
      ["blocked", "tombstoned"],
      ["blocked", "grace"],
      ["blocked", "verifying"],
    ] as const) {
      expect(() => assertDeletionTransition(from, to)).toThrow(
        `deletion_refused:invalid_transition:${from}:${to}`
      );
    }
    // THE PAIR TABLE (R-162, P5-R4): every state, cancellation decided. The
    // table is keyed by the ENUM, so a new state is a red test until decided.
    const cancellation: Readonly<Record<DeletionOperationState, "accepted" | "refused">> = {
      // No `requested -> cancelled`: it would bypass the journal.
      requested: "refused",
      journal_pending: "accepted",
      tombstoned: "accepted",
      external_actions_pending: "accepted",
      grace: "accepted",
      // R-162: blocked's way out. Bounded by the grace window and refused
      // as `erasure_started` when its resume state is irreversible work.
      blocked: "accepted",
      erasing: "refused",
      verifying: "refused",
      complete: "refused",
      cancelled: "refused",
    };
    expect(Object.keys(cancellation).sort()).toEqual([...deletionOperationState.enumValues].sort());
    for (const state of deletionOperationState.enumValues) {
      if (cancellation[state] === "accepted") {
        expect(() => assertDeletionTransition(state, "cancelled"), state).not.toThrow();
      } else {
        expect(() => assertDeletionTransition(state, "cancelled"), state).toThrow(
          `deletion_refused:invalid_transition:${state}:cancelled`
        );
      }
    }
  });

  it("records recent reauthentication only after the exact session password verifies", async () => {
    await bootstrap(db, "reauth-target", "Reauth Target");
    const password = "phase-10b1-reauth-password";
    await db.insert(account).values({
      id: "credential-reauth-target",
      accountId: "reauth-target",
      providerId: "credential",
      userId: "reauth-target",
      password: await hashPassword(password),
    });
    await db
      .update(session)
      .set({ reauthenticatedAt: null })
      .where(eq(session.id, "session-reauth-target"));

    await expect(
      reauthenticateSessionWithPassword(db, {
        authUserId: "reauth-target",
        sessionId: "session-reauth-target",
        password: `${password}-wrong`,
        rateLimitKeyDigest: sha("reauth-client"),
      })
    ).rejects.toThrow("auth_lifecycle_refused");
    expect(
      await db
        .select({ reauthenticatedAt: session.reauthenticatedAt })
        .from(session)
        .where(eq(session.id, "session-reauth-target"))
    ).toEqual([{ reauthenticatedAt: null }]);

    const proof = await reauthenticateSessionWithPassword(db, {
      authUserId: "reauth-target",
      sessionId: "session-reauth-target",
      password,
      rateLimitKeyDigest: sha("reauth-client"),
    });
    expect(proof).toMatchObject({
      authUserId: "reauth-target",
      sessionId: "session-reauth-target",
      reauthenticatedAt: expect.any(Date),
    });
    const counters = await db.select().from(rateLimit);
    expect(counters).toHaveLength(2);
    expect(counters).toEqual([
      expect.objectContaining({ key: expect.stringMatching(/^r118:/), count: 2 }),
      expect.objectContaining({ key: expect.stringMatching(/^r118:/), count: 2 }),
    ]);
    expect(counters.every((counter) => !counter.key.includes("reauth-target"))).toBe(true);
  });

  it("refuses a real foreign current session even with the target account password", async () => {
    await bootstrap(db, "reauth-target", "Reauth Target");
    await bootstrap(db, "reauth-foreign", "Reauth Foreign");
    const password = "phase-10b1-target-password";
    await db.insert(account).values({
      id: "credential-reauth-target",
      accountId: "reauth-target",
      providerId: "credential",
      userId: "reauth-target",
      password: await hashPassword(password),
    });
    await expect(
      reauthenticateSessionWithPassword(db, {
        authUserId: "reauth-target",
        sessionId: "session-reauth-foreign",
        password,
        rateLimitKeyDigest: sha("reauth-foreign-session-client"),
      })
    ).rejects.toThrow("auth_lifecycle_refused");
    expect(
      await db
        .select({ id: session.id, reauthenticatedAt: session.reauthenticatedAt })
        .from(session)
    ).toEqual(
      expect.arrayContaining([
        { id: "session-reauth-target", reauthenticatedAt: NOW },
        { id: "session-reauth-foreign", reauthenticatedAt: NOW },
      ])
    );
    expect(await db.select().from(rateLimit)).toHaveLength(2);
  });

  it("makes the durable per-account limiter non-vacuous across distinct clients", async () => {
    await bootstrap(db, "bounded-reauth", "Bounded Reauth");
    const password = "phase-10b1-bounded-password";
    await db.insert(account).values({
      id: "credential-bounded-reauth",
      accountId: "bounded-reauth",
      providerId: "credential",
      userId: "bounded-reauth",
      password: await hashPassword(password),
    });
    await db
      .update(session)
      .set({ reauthenticatedAt: null })
      .where(eq(session.id, "session-bounded-reauth"));
    const input = {
      authUserId: "bounded-reauth",
      sessionId: "session-bounded-reauth",
    } as const;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        reauthenticateSessionWithPassword(db, {
          ...input,
          password: `${password}-wrong-${attempt}`,
          rateLimitKeyDigest: sha(`bounded-reauth-client-${attempt}`),
        })
      ).rejects.toThrow("auth_lifecycle_refused");
    }
    await expect(
      reauthenticateSessionWithPassword(db, {
        ...input,
        password,
        rateLimitKeyDigest: sha("bounded-reauth-client-correct"),
      })
    ).rejects.toThrow("auth_lifecycle_refused");
    expect(
      await db
        .select({ reauthenticatedAt: session.reauthenticatedAt })
        .from(session)
        .where(eq(session.id, input.sessionId))
    ).toEqual([{ reauthenticatedAt: null }]);
    const counters = await db.select().from(rateLimit);
    expect(counters.filter((counter) => counter.key.startsWith("r118:account:"))).toEqual([
      expect.objectContaining({ count: 5 }),
    ]);
    expect(counters.filter((counter) => counter.key.startsWith("r118:client:"))).toHaveLength(6);
  });

  it("makes the durable pseudonymous-client limiter non-vacuous across fresh account buckets", async () => {
    await bootstrap(db, "bounded-client", "Bounded Client");
    const password = "phase-10b1-client-password";
    await db.insert(account).values({
      id: "credential-bounded-client",
      accountId: "bounded-client",
      providerId: "credential",
      userId: "bounded-client",
      password: await hashPassword(password),
    });
    await db
      .update(session)
      .set({ reauthenticatedAt: null })
      .where(eq(session.id, "session-bounded-client"));
    const input = {
      authUserId: "bounded-client",
      sessionId: "session-bounded-client",
      rateLimitKeyDigest: sha("one-pseudonymous-client"),
    } as const;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        reauthenticateSessionWithPassword(db, {
          ...input,
          password: `${password}-wrong-${attempt}`,
        })
      ).rejects.toThrow("auth_lifecycle_refused");
      // Reset only the independent account dimension so this test proves the
      // shared client bucket is itself authoritative rather than succeeding
      // because the same account happened to reach its own ceiling too.
      await db.delete(rateLimit).where(like(rateLimit.key, "r118:account:%"));
    }
    await expect(
      reauthenticateSessionWithPassword(db, { ...input, password })
    ).rejects.toThrow("auth_lifecycle_refused");
    const counters = await db.select().from(rateLimit);
    expect(counters.filter((counter) => counter.key.startsWith("r118:client:"))).toEqual([
      expect.objectContaining({ count: 5 }),
    ]);
    expect(counters.filter((counter) => counter.key.startsWith("r118:account:"))).toEqual([
      expect.objectContaining({ count: 1 }),
    ]);
  });

  it("refuses passwords above the auth authority ceiling before durable admission", async () => {
    await bootstrap(db, "bounded-password", "Bounded Password");
    await expect(
      reauthenticateSessionWithPassword(db, {
        authUserId: "bounded-password",
        sessionId: "session-bounded-password",
        password: "x".repeat(AUTH_PASSWORD_MAX_LENGTH + 1),
        rateLimitKeyDigest: sha("bounded-password-client"),
      })
    ).rejects.toThrow("auth_lifecycle_refused");
    expect(await db.select().from(rateLimit)).toEqual([]);
  });

  it.each([
    ["stale", -DELETION_REAUTH_MAX_AGE_MS - 1_000, HOUR],
    ["future", 60_000, HOUR],
    ["tied to an expired session", 0, -1_000],
  ] as const)("refuses an exact-session proof that is %s", async (_case, proofOffsetMs, expiryOffsetMs) => {
    const owner = await bootstrap(db, "proof-boundary", "Proof Boundary");
    const scope = await withWorkspace(db, { authUserId: "proof-boundary" });
    const checkedAt = new Date();
    const reauthenticatedAt = new Date(checkedAt.getTime() + proofOffsetMs);
    await db
      .update(session)
      .set({
        reauthenticatedAt,
        reauthenticatedMethod: "password",
        expiresAt: new Date(checkedAt.getTime() + expiryOffsetMs),
      })
      .where(eq(session.id, "session-proof-boundary"));
    await expect(
      db.transaction((tx) =>
        assertReauthenticatedWorkspaceScopeInTx(tx, scope, {
          authUserId: "proof-boundary",
          sessionId: "session-proof-boundary",
          reauthenticatedAt,
        })
      )
    ).rejects.toThrow("auth_lifecycle_refused");
    expect(owner.workspace.id).toBe(scope.workspaceId);
  });

  it("THE SEVEN-DAY RECOVERY-SECRET SWEEP ACTUALLY RUNS — against a row the real request path produced", async () => {
    // Round 2 of the Tasks 6-9 gate. This measure had NEVER redacted a row:
    // `deletion_operations_recovery_shape` admits an identity row only as LIVE
    // (consumed_at NULL, digest + prefix present) or SPENT (consumed_at set,
    // both NULL). Nulling the digest without stamping consumed_at lands between
    // them, so the UPDATE violated the CHECK and the batch aborted every tick --
    // the single-use recovery credential was retained indefinitely and the
    // worker would have paged `critical` forever. Nothing caught it because no
    // test had ever put a real row in front of this spec.
    const target = await bootstrap(db, "target-auth", "Target Auth");
    await db
      .delete(memberships)
      .where(and(eq(memberships.userId, target.user.id), eq(memberships.workspaceId, target.workspace.id)));
    const recoveryDelivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
      reconcileIdentityRecovery: vi.fn(),
    };
    const requested = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "identity-recovery-sweep" },
      { recoveryDelivery, journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS },
    );
    const [before] = await db
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, requested.operation.id));
    // The producer really did mint a live secret, or the sweep below is vacuous.
    expect(before!.recoverySecretDigest).not.toBeNull();
    expect(before!.recoverySecretPrefix).not.toBeNull();
    expect(before!.recoveryConsumedAt).toBeNull();

    // Advance the TICK's clock rather than backdating the row: the delivery
    // shape CHECK requires `recovery_delivered_at <= recovery_expires_at`, so
    // moving the expiry backwards would be refused.
    //
    // DAY 8, NOT DAY 15. The clock is seven days measured from `requested_at`,
    // so it lands AT the seven-day expiry. It used to be measured from
    // `recovery_expires_at` — itself request + 7 days — which gave a FOURTEEN
    // day window while the measure's own `why` asserted it was "not an extra
    // window on top". Day 15 passed under both, so the old test could not tell
    // them apart; day 8 can.
    const dayEight = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const stillLive = await runRetentionTick(db, new Date(Date.now() + 6 * 24 * 60 * 60 * 1000));
    expect(stillLive.tables.filter((table) => table.failureCode !== null)).toEqual([]);
    const [atDaySix] = await db
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, requested.operation.id));
    // Not yet: the secret is still usable inside its own grace window.
    expect(atDaySix!.recoverySecretDigest).not.toBeNull();

    const summary = await runRetentionTick(db, dayEight);

    // No table may fail: a CHECK violation here aborts the whole batch.
    expect(summary.tables.filter((table) => table.failureCode !== null)).toEqual([]);
    const [after] = await db
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, requested.operation.id));
    expect(after!.recoverySecretDigest).toBeNull();
    expect(after!.recoverySecretPrefix).toBeNull();
    // The companion the CHECK requires — and what makes the expired secret
    // unusable, since both cancel paths read a non-null consumed_at as "gone".
    expect(after!.recoveryConsumedAt).not.toBeNull();
    // The state machine owns this one; a clock may not null it (its own CHECK
    // forbids nulling before the operation is terminal).
    expect(after!.requestSessionDigest).not.toBeNull();
  });

  it("THE EXCLUSION SET REACHES THE CAPTURE — an audited id is captured excluded, through the real request seam", async () => {
    // R-121 / C4. `activationExclusions` used to be optional with an EMPTY
    // default: every test omitted it and one optional line in
    // worker/production.ts was the only supplier, so nothing witnessed that a
    // real set ever arrives. It is required now, and this is the witness that
    // a NON-empty one is honoured at the seam rather than merely accepted.
    const target = await bootstrap(db, "target-auth", "Target Auth");
    // Sole ownership refuses identity deletion (last_owner); this test is about
    // the exclusion capture, not that rule, which has its own tests.
    await db
      .delete(memberships)
      .where(and(eq(memberships.userId, target.user.id), eq(memberships.workspaceId, target.workspace.id)));
    const recoveryDelivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
      reconcileIdentityRecovery: vi.fn(),
    };
    const requested = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "identity-excluded-capture" },
      {
        recoveryDelivery,
        journal: confirmedJournal().port,
        activationExclusions: { adminUserIds: new Set([target.user.id]), excludedUserIds: new Set<string>() },
      },
    );

    const [row] = await db
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.id, requested.operation.id));
    // Membership in either audited set yields exactly (true, 0, 0).
    expect(row!.activationExcluded).toBe(true);
    expect(row!.activationDenominator).toBe(0);
    expect(row!.activationNumerator).toBe(0);
    expect(row!.activationExclusionSource).toBe("admin_user_ids");
  });

  it("counts well-formed invalid recovery credentials before comparing the secret", async () => {
    await identityFixture(db);
    let recoverySecret = "";
    const recoveryDelivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        recoverySecret = request.secret;
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(),
    };
    const requested = await requestIdentityDeletion(
      db,
      {
        sessionId: "session-target-auth",
        idempotencyKey: "identity-invalid-recovery-budget",
      },
      { recoveryDelivery, journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    const rateLimitKeyDigest = sha("invalid-recovery-client");
    const wrongSecret = Buffer.alloc(32, 0x5a).toString("base64url");
    expect(wrongSecret).not.toBe(recoverySecret);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        beginIdentityCancellationRecoverySession(
          db,
          requested.operation.id,
          wrongSecret,
          rateLimitKeyDigest
        )
      ).rejects.toThrow("auth_lifecycle_refused");
    }
    await expect(
      beginIdentityCancellationRecoverySession(
        db,
        requested.operation.id,
        recoverySecret,
        rateLimitKeyDigest
      )
    ).rejects.toThrow("auth_lifecycle_refused");
    expect(
      await db
        .select({ consumedAt: deletionRecoverySessions.consumedAt })
        .from(deletionRecoverySessions)
        .where(eq(deletionRecoverySessions.operationId, requested.operation.id))
    ).toEqual(Array.from({ length: 5 }, () => ({ consumedAt: expect.any(Date) })));
  });

  it("R-160: a last owner's account deletion CASCADES its workspace instead of refusing; stale proof still refuses", async () => {
    const target = await bootstrap(db, "last-owner-auth", "Last Owner");
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
      reconcileIdentityRecovery: vi.fn(),
    };
    const journal = confirmedJournal();

    // RE-DECIDED (R-160). This test pinned `last_owner` here: the sole owner
    // of their own workspace could never request their own erasure, and the
    // printed remedy named two surfaces that do not exist.
    const result = await requestIdentityDeletion(
      db,
      {
        sessionId: "session-last-owner-auth",
        idempotencyKey: "identity-last-owner",
      },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(result).toMatchObject({ acknowledged: true, operation: { state: "tombstoned" } });
    const [cascaded] = await db
      .select()
      .from(deletionOperations)
      .where(and(eq(deletionOperations.scope, "workspace"), eq(deletionOperations.workspaceId, target.workspace.id)));
    expect(cascaded).toMatchObject({
      state: "tombstoned",
      requesterUserId: target.user.id,
      idempotencyKey: `identity-cascade:${result.operation.id}:${target.workspace.id}`,
    });
    expect(
      (await db.select({ state: workspaces.lifecycleState }).from(workspaces).where(eq(workspaces.id, target.workspace.id)))[0]
    ).toEqual({ state: "tombstoned" });
    // A workspace with no owner is a state only a deletion may hold: every
    // workspace the person was the last owner of carries a non-terminal
    // deletion of its own, journalled before the identity's.
    expect(journal.requests.map((r) => `${r.scope}:${r.toState}`)).toEqual([
      "workspace:journal_pending",
      "workspace:tombstoned",
      "identity:journal_pending",
      "identity:tombstoned",
    ]);
    const ownerless = await db.execute(sql`
      SELECT w.id FROM workspaces w
      WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.workspace_id = w.id AND m.role = 'owner' AND m.lifecycle_state = 'active')
        AND NOT EXISTS (SELECT 1 FROM deletion_operations d WHERE d.scope = 'workspace' AND d.workspace_id = w.id AND d.state NOT IN ('complete', 'cancelled'))
    `);
    expect((ownerless as unknown as { rows: unknown[] }).rows).toEqual([]);

    await db
      .update(session)
      .set({ reauthenticatedAt: new Date(Date.now() - DELETION_REAUTH_MAX_AGE_MS - 1_000) })
      .where(eq(session.id, "session-last-owner-auth"));
    const stale = await bootstrap(db, "stale-proof-auth", "Stale Proof");
    await db
      .update(session)
      .set({ reauthenticatedAt: new Date(Date.now() - DELETION_REAUTH_MAX_AGE_MS - 1_000) })
      .where(eq(session.id, "session-stale-proof-auth"));
    const staleScope = await withWorkspace(db, { authUserId: "stale-proof-auth" });
    await expect(
      requestWorkspaceDeletion(
        db,
        staleScope,
        {
          sessionId: "session-stale-proof-auth",
          idempotencyKey: "workspace-stale-proof",
          typedName: stale.workspace.name,
        },
        journal.port
      )
    ).rejects.toThrow("deletion_refused:reauthentication_missing_or_stale");
  });

  it.each([
    ["a GOOGLE stamp (R-164's billing arm)", "google"],
    ["a stamp with NO recorded method", null],
  ] as const)("R-166: the deletion guard refuses %s — only a password stamp authorises a deletion", async (_label, method) => {
    const owner = await bootstrap(db, "method-auth", "Method");
    await db.update(session).set({ reauthenticatedMethod: method }).where(eq(session.id, "session-method-auth"));
    const scope = await withWorkspace(db, { authUserId: "method-auth" });
    await expect(
      requestWorkspaceDeletion(
        db,
        scope,
        { sessionId: "session-method-auth", idempotencyKey: "workspace-method", typedName: owner.workspace.name },
        confirmedJournal().port
      )
    ).rejects.toThrow("deletion_refused:reauthentication_method_not_accepted");
    expect(await db.select().from(deletionOperations)).toEqual([]);
  });

  it("R-166: a client idempotency key carrying the cascade prefix is refused — only the server mints cascade keys", async () => {
    const owner = await bootstrap(db, "prefix-auth", "Prefix");
    const scope = await withWorkspace(db, { authUserId: "prefix-auth" });
    await expect(
      requestWorkspaceDeletion(
        db,
        scope,
        {
          sessionId: "session-prefix-auth",
          idempotencyKey: `${IDENTITY_CASCADE_KEY_PREFIX}forged-0000`,
          typedName: owner.workspace.name,
        },
        confirmedJournal().port
      )
    ).rejects.toThrow("deletion_refused:invalid_idempotency_key");
  });

  it("R-160: a workspace ALREADY under deletion leaves the last-owner population; its owner's account deletion proceeds without a second cascade", async () => {
    const target = await bootstrap(db, "workspace-remedy-auth", "Workspace Remedy");
    const scope = await withWorkspace(db, { authUserId: "workspace-remedy-auth" });
    const journal = confirmedJournal();
    await requestWorkspaceDeletion(
      db,
      scope,
      {
        sessionId: "session-workspace-remedy-auth",
        idempotencyKey: "workspace-remedy-request",
        typedName: target.workspace.name,
      },
      journal.port
    );
    const recoveryDelivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
      reconcileIdentityRecovery: vi.fn(),
    };

    // RE-DECIDED (R-160). This pinned `last_owner` until the workspace's
    // membership was erased — a refusal whose only remedy was waiting out an
    // irreversible erasure. The workspace's own deletion decides it; the
    // person's account deletion is no longer held hostage to it.
    await expect(
      requestIdentityDeletion(
        db,
        {
          sessionId: "session-workspace-remedy-auth",
          idempotencyKey: "identity-after-workspace-remedy",
        },
        { recoveryDelivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
      )
    ).resolves.toMatchObject({ acknowledged: true, operation: { state: "tombstoned" } });
    // ...and no second workspace operation was minted for the same workspace.
    expect(
      await db
        .select({ id: deletionOperations.id })
        .from(deletionOperations)
        .where(and(eq(deletionOperations.scope, "workspace"), eq(deletionOperations.workspaceId, target.workspace.id)))
    ).toHaveLength(1);
  });

  it("leaves identity/session/membership active when recovery delivery fails", async () => {
    const { target } = await identityFixture(db);
    let deliveredSecret = "";
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        deliveredSecret = request.secret;
        return {
          outcome: "failed" as const,
          failureCode: "provider_rejected" as const,
        };
      }),
      reconcileIdentityRecovery: vi.fn(),
    };
    const journal = confirmedJournal();
    const result = await requestIdentityDeletion(
      db,
      {
        sessionId: "session-target-auth",
        idempotencyKey: "identity-delivery-failure",
      },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );

    expect(result.acknowledged).toBe(false);
    expect(result.delivery).toBe("failed");
    expect(result.operation.state).toBe("requested");
    expect(result.operation.recoveryDeliveryStatus).toBe("failed");
    expect(result.operation.recoverySecretDigest).toBe(sha(deliveredSecret));
    expect(JSON.stringify(result.operation)).not.toContain(deliveredSecret);
    expect(journal.requests).toHaveLength(0);
    const replay = await resumeIdentityDeletionRequest(db, result.operation.id, { recoveryDelivery: delivery, journal: journal.port });
    expect(replay).toMatchObject({
      acknowledged: false,
      delivery: "failed",
      operation: { id: result.operation.id, state: "requested" },
    });
    expect(delivery.reconcileIdentityRecovery).not.toHaveBeenCalled();
    expect(journal.requests).toHaveLength(0);
    expect(
      await db.select().from(session).where(eq(session.userId, "target-auth"))
    ).toHaveLength(1);
    expect(
      await db.select().from(memberships).where(eq(memberships.userId, target.user.id))
    ).toEqual([
      expect.objectContaining({ lifecycleState: "active", version: 1 }),
    ]);
    await addSession(db, "target-auth", "session-target-auth-rebound");
    const rebound = await requestIdentityDeletion(
      db,
      {
        sessionId: "session-target-auth-rebound",
        idempotencyKey: "identity-delivery-failure",
      },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(rebound.operation.id).toBe(result.operation.id);
    expect(rebound.delivery).toBe("failed");
    expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(2);
  });

  it("rejects backdated and future delivery receipts before journaling or tombstoning", async () => {
    await identityFixture(db);
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) =>
        confirmedDeliveryResult(request, new Date(0))
      ),
      reconcileIdentityRecovery: vi.fn(async (request) =>
        confirmedDeliveryResult(request, new Date(Date.now() + HOUR))
      ),
    };
    const journal = confirmedJournal();
    const params = {
      sessionId: "session-target-auth",
      idempotencyKey: "identity-invalid-delivery-time",
    } as const;

    // NAMED codes, not one opaque `delivery_receipt_mismatch` for eleven
    // different conditions. Both directions are far outside the 60s clock
    // tolerance (epoch, and a full hour ahead), so the tolerance that keeps
    // ordinary cross-machine skew from refusing a real delivery does not weaken
    // either of these.
    await expect(
      requestIdentityDeletion(db, params, { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
    ).rejects.toThrow("deletion_refused:delivery_receipt_before_attempt");
    await expect(
      requestIdentityDeletion(db, params, { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
    ).rejects.toThrow("deletion_refused:delivery_receipt_in_future");

    expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(1);
    expect(delivery.reconcileIdentityRecovery).toHaveBeenCalledTimes(1);
    expect(journal.requests).toHaveLength(0);
    expect(
      await db
        .select({
          state: deletionOperations.state,
          delivery: deletionOperations.recoveryDeliveryStatus,
          base: deletionOperations.journalIntentBaseVersion,
          digest: deletionOperations.journalIntentPlanDigest,
          at: deletionOperations.journalIntentEffectiveAt,
        })
        .from(deletionOperations)
        .where(eq(deletionOperations.idempotencyKey, params.idempotencyKey))
    ).toEqual([
      {
        state: "requested",
        delivery: "pending",
        base: null,
        digest: null,
        at: null,
      },
    ]);
  });

  it("persists confirmed delivery before journaling and retries without redelivery or expiry extension", async () => {
    const { target } = await identityFixture(db);
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(async (request) => ({
        outcome: "confirmed" as const,
        operationId: request.operationId,
        commandId: request.commandId,
        attempt: request.attempt,
        secretDigest: request.secretDigest,
        recipientDigest: request.recipientDigest,
        expiresAt: request.expiresAt,
        deliveredAt: new Date(),
        deliveryReceiptDigest: sha(`delivery:${request.commandId}:${request.attempt}`),
      })),
    };
    let failFirstJournal = true;
    const attempted: JournalTransitionRequest[] = [];
    const confirmed = confirmedJournal();
    const journal: DeletionJournalPort = {
      appendTransition: vi.fn(async (request) => {
        attempted.push(request);
        if (failFirstJournal) {
          failFirstJournal = false;
          return { outcome: "unknown" as const, reconciliationKey: "journal-unknown-1" };
        }
        return confirmed.port.appendTransition(request);
      }),
    };
    const params = {
      sessionId: "session-target-auth",
      idempotencyKey: "identity-journal-retry",
    } as const;

    await expect(
      requestIdentityDeletion(db, params, {
        recoveryDelivery: delivery,
        journal,
        activationExclusions: NO_ACTIVATION_EXCLUSIONS,
      })
    ).rejects.toThrow("deletion_refused:journal_unknown");
    const [afterTimeout] = await db
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.idempotencyKey, "identity-journal-retry"));
    expect(afterTimeout).toMatchObject({
      state: "requested",
      recoveryDeliveryStatus: "confirmed",
      recoveryDeliveredAt: expect.any(Date),
      recoveryExpiresAt: expect.any(Date),
    });

    // A different live session may not rewrite fields already bound into the
    // durable journal intent and strand the original response-loss retry.
    await addSession(db, "target-auth", "session-target-auth-second");
    await expect(
      requestIdentityDeletion(
        db,
        { ...params, sessionId: "session-target-auth-second" },
        { recoveryDelivery: delivery, journal, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
      )
    ).rejects.toThrow("deletion_refused:request_session_mismatch");
    expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(1);
    expect(attempted).toHaveLength(1);

    // The durable, authority-bound journal reservation is the commit point.
    // Losing the exact session after an object-store timeout must not strand an
    // already-authorized request in `requested` forever.
    await db.delete(session).where(eq(session.id, params.sessionId));

    const retried = await resumeIdentityDeletionRequest(
      db,
      afterTimeout.id,
      { recoveryDelivery: delivery, journal }
    );
    expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(1);
    expect(retried.operation.id).toBe(afterTimeout.id);
    expect(retried.operation.recoveryExpiresAt).toEqual(afterTimeout.recoveryExpiresAt);
    expect(retried).toMatchObject({ acknowledged: true, delivery: "confirmed" });
    expect(retried.operation.state).toBe("tombstoned");
    expect(attempted[1]).toEqual(attempted[0]);
    expect(
      await db
        .select({ version: deletionOperationTransitions.version })
        .from(deletionOperationTransitions)
        .where(eq(deletionOperationTransitions.operationId, retried.operation.id))
    ).toEqual([{ version: 1 }, { version: 2 }]);
    expect(
      await db.select().from(session).where(eq(session.userId, "target-auth"))
    ).toHaveLength(0);
    expect(
      await db.select().from(memberships).where(eq(memberships.userId, target.user.id))
    ).toEqual([
      expect.objectContaining({
        lifecycleState: "deletion_suspended",
        suspendedRole: "owner",
        suspendedVersion: 1,
        version: 2,
      }),
    ]);
    await expect(withWorkspace(db, { authUserId: "target-auth" })).rejects.toThrow(
      "identity is tombstoned"
    );
    let loginFailure: unknown;
    try {
      await addSession(db, "target-auth", "session-disabled-identity");
    } catch (error) {
      loginFailure = error;
    }
    expect(loginFailure).toBeInstanceOf(Error);
    expect(
      (loginFailure as Error & { cause?: { message?: string } }).cause?.message
    ).toContain("ordinary login disabled while identity deletion is pending");
  });

  it("reconciles a pre-reservation delivery after process and session loss", async () => {
    await identityFixture(db);
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async () => {
        throw new Error("simulated process loss after provider acceptance");
      }),
      reconcileIdentityRecovery: vi.fn(async (request) => ({
        outcome: "confirmed" as const,
        operationId: request.operationId,
        commandId: request.commandId,
        attempt: request.attempt,
        secretDigest: request.secretDigest,
        recipientDigest: request.recipientDigest,
        expiresAt: request.expiresAt,
        deliveredAt: new Date(),
        deliveryReceiptDigest: sha(`delivery:${request.commandId}:${request.attempt}`),
      })),
    };
    const params = {
      sessionId: "session-target-auth",
      idempotencyKey: "identity-pre-reservation-process-loss",
    } as const;

    await expect(
      requestIdentityDeletion(db, params, { recoveryDelivery: delivery, journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
    ).rejects.toThrow("simulated process loss after provider acceptance");
    const [pending] = await db
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.idempotencyKey, params.idempotencyKey));
    expect(pending).toMatchObject({
      state: "requested",
      recoveryDeliveryStatus: "pending",
      journalIntentPlanDigest: null,
    });
    await db.delete(session).where(eq(session.id, params.sessionId));

    const resumed = await resumeIdentityDeletionRequest(db, pending.id, { recoveryDelivery: delivery, journal: confirmedJournal().port });
    expect(resumed).toMatchObject({
      acknowledged: true,
      delivery: "confirmed",
      operation: { id: pending.id, state: "tombstoned" },
    });
    expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(1);
    expect(delivery.reconcileIdentityRecovery).toHaveBeenCalledTimes(1);
    expect(delivery.reconcileIdentityRecovery).toHaveBeenCalledWith(
      expect.not.objectContaining({ secret: expect.anything() })
    );
  });

  it("journals an expired recovery reservation as cancelled and permits a fresh request", async () => {
    const { target } = await identityFixture(db);
    let firstDelivery = true;
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        if (firstDelivery) {
          firstDelivery = false;
          return {
            outcome: "unknown" as const,
            reconciliationDigest: sha("expired-before-reservation"),
          };
        }
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(),
    };
    const attempted: JournalTransitionRequest[] = [];
    let failFirstJournal = true;
    const confirmed = confirmedJournal();
    const journal: DeletionJournalPort = {
      appendTransition: vi.fn(async (request) => {
        attempted.push(request);
        if (failFirstJournal) {
          failFirstJournal = false;
          return { outcome: "unknown" as const, reconciliationKey: "expired-recovery" };
        }
        return confirmed.port.appendTransition(request);
      }),
    };
    const params = {
      sessionId: "session-target-auth",
      idempotencyKey: "identity-expired-after-reservation",
    } as const;

    const pending = await requestIdentityDeletion(db, params, {
      recoveryDelivery: delivery,
      journal,
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(pending).toMatchObject({ acknowledged: false, delivery: "unknown" });
    const expiredRecoveryAt = new Date(Date.now() - 1);
    await db
      .update(deletionOperations)
      .set({ recoveryExpiresAt: expiredRecoveryAt })
      .where(eq(deletionOperations.idempotencyKey, params.idempotencyKey));

    await expect(
      requestIdentityDeletion(db, params, { recoveryDelivery: delivery, journal, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
    ).rejects.toThrow("deletion_refused:journal_unknown");
    // A late reconciliation response may land after the expired-abandonment
    // plan is durable. Its receipt must not change those already-authorised
    // journal bytes or make operation-only recovery impossible.
    await db
      .update(deletionOperations)
      .set({
        recoveryDeliveryStatus: "confirmed",
        recoveryDeliveryReceiptDigest: sha("late-confirmed-delivery"),
        recoveryDeliveryReconciliationDigest: null,
        recoveryDeliveredAt: new Date(expiredRecoveryAt.getTime() - 1),
        lastFailureCode: null,
      })
      .where(eq(deletionOperations.id, pending.operation.id));
    await db.delete(session).where(eq(session.id, params.sessionId));
    const abandoned = await resumeIdentityDeletionRequest(
      db,
      pending.operation.id,
      { recoveryDelivery: delivery, journal }
    );
    expect(abandoned).toMatchObject({
      acknowledged: false,
      delivery: "confirmed",
      operation: {
        state: "cancelled",
        acknowledgedAt: null,
        tombstonedAt: null,
        cancellationReplayDigest: null,
        identityCancellationReceiptExpiresAt: null,
        recoverySecretDigest: null,
        recoverySecretPrefix: null,
        recoveryConsumedAt: expect.any(Date),
        lastFailureCode: "recovery_expired_before_tombstone",
      },
    });
    expect(attempted).toHaveLength(3);
    expect(attempted[1]).toEqual(attempted[0]);
    expect(attempted[2]).toMatchObject({
      version: 2,
      fromState: "journal_pending",
      toState: "cancelled",
    });
    expect(
      await db.select({ state: users.lifecycleState }).from(users).where(eq(users.id, target.user.id))
    ).toEqual([{ state: "active" }]);
    expect(await db.select().from(session).where(eq(session.userId, "target-auth"))).toHaveLength(0);

    const replay = await resumeIdentityDeletionRequest(
      db,
      pending.operation.id,
      { recoveryDelivery: delivery, journal }
    );
    expect(replay.operation.id).toBe(abandoned.operation.id);
    expect(attempted).toHaveLength(3);

    await addSession(db, "target-auth", "session-target-auth-fresh");
    const fresh = await requestIdentityDeletion(
      db,
      {
        ...params,
        sessionId: "session-target-auth-fresh",
        idempotencyKey: "identity-after-expired-reservation",
      },
      { recoveryDelivery: delivery, journal: confirmed.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(fresh).toMatchObject({ acknowledged: true, operation: { state: "tombstoned" } });
    expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(2);
  });

  it("terminally abandons expired pending, unknown, and failed recovery delivery attempts", async () => {
    for (const status of ["pending", "unknown", "failed"] as const) {
      const caseDb = await createTestDb();
      const { target, survivor } = await identityFixture(caseDb);
      const delivery: RecoveryDeliveryPort = {
        deliverIdentityRecovery: vi.fn(async () => {
          if (status === "pending") throw new Error("simulated process loss before delivery");
          if (status === "unknown") {
            return { outcome: "unknown" as const, reconciliationDigest: sha(`unknown:${status}`) };
          }
          return { outcome: "failed" as const, failureCode: "not_delivered" as const };
        }),
        reconcileIdentityRecovery: vi.fn(async () => {
          throw new Error("expired delivery must not be reconciled");
        }),
      };
      const params = {
        sessionId: "session-target-auth",
        idempotencyKey: `identity-expired-${status}`,
      } as const;
      if (status === "pending") {
        await expect(
          requestIdentityDeletion(caseDb, params, { recoveryDelivery: delivery, journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
        ).rejects.toThrow("simulated process loss before delivery");
      } else {
        await expect(
          requestIdentityDeletion(caseDb, params, { recoveryDelivery: delivery, journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
        ).resolves.toMatchObject({ acknowledged: false, delivery: status });
      }
      await caseDb
        .update(deletionOperations)
        .set({ recoveryExpiresAt: new Date(Date.now() - 1) })
        .where(eq(deletionOperations.idempotencyKey, params.idempotencyKey));
      if (status === "pending") {
        await caseDb
          .delete(memberships)
          .where(
            and(
              eq(memberships.userId, survivor.user.id),
              eq(memberships.workspaceId, target.workspace.id)
            )
          );
      }

      const abandoned = await requestIdentityDeletion(caseDb, params, { recoveryDelivery: delivery, journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS });
      expect(abandoned).toMatchObject({
        acknowledged: false,
        delivery: status,
        operation: {
          state: "cancelled",
          cancellationReplayDigest: null,
          recoverySecretDigest: null,
          recoverySecretPrefix: null,
          recoveryConsumedAt: expect.any(Date),
          lastFailureCode: "recovery_expired_before_tombstone",
        },
      });
      expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(1);
      expect(delivery.reconcileIdentityRecovery).not.toHaveBeenCalled();
    }
  });

  it("R-160: a co-owner who leaves AFTER the reservation is caught by the cascade top-up, not by a dead-end refusal", async () => {
    const { target, survivor } = await identityFixture(db);
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
      reconcileIdentityRecovery: vi.fn(),
    };
    let failFirstJournal = true;
    const attempted: JournalTransitionRequest[] = [];
    const confirmed = confirmedJournal();
    const journal: DeletionJournalPort = {
      appendTransition: vi.fn(async (request) => {
        attempted.push(request);
        if (failFirstJournal) {
          failFirstJournal = false;
          return { outcome: "unknown" as const, reconciliationKey: "owner-race-unknown" };
        }
        return confirmed.port.appendTransition(request);
      }),
    };
    const params = {
      sessionId: "session-target-auth",
      idempotencyKey: "identity-owner-race",
    } as const;

    await expect(
      requestIdentityDeletion(db, params, { recoveryDelivery: delivery, journal, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
    ).rejects.toThrow("deletion_refused:journal_unknown");
    await db
      .delete(memberships)
      .where(
        and(
          eq(memberships.userId, survivor.user.id),
          eq(memberships.workspaceId, target.workspace.id)
        )
      );

    // RE-DECIDED (R-160). The replay used to refuse `last_owner` here, and
    // every later replay refused the same way: a reserved request no retry
    // could finish. The top-up re-measures the sole-owned set under the graph
    // locks and reserves the newly sole-owned workspace's deletion first.
    const recovered = await requestIdentityDeletion(db, params, {
      recoveryDelivery: delivery,
      journal,
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(recovered).toMatchObject({ acknowledged: true, operation: { state: "tombstoned" } });
    expect(delivery.deliverIdentityRecovery).toHaveBeenCalledTimes(1);
    // The identity's first attempt is replayed byte-for-byte AFTER the
    // cascaded workspace's two appends.
    expect(attempted.map((r) => `${r.scope}:${r.toState}`)).toEqual([
      "identity:journal_pending",
      "workspace:journal_pending",
      "workspace:tombstoned",
      "identity:journal_pending",
      "identity:tombstoned",
    ]);
    expect(attempted[3]).toEqual(attempted[0]);
    expect(
      await db
        .select({ state: deletionOperations.state })
        .from(deletionOperations)
        .where(and(eq(deletionOperations.scope, "workspace"), eq(deletionOperations.workspaceId, target.workspace.id)))
    ).toEqual([{ state: "tombstoned" }]);
  });

  it("finishes an authority-bound scoped request after journal uncertainty and later demotion", async () => {
    const owner = await bootstrap(db, "reserved-owner-auth", "Reserved Workspace");
    const ownerScope = await withWorkspace(db, { authUserId: "reserved-owner-auth" });
    const confirmed = confirmedJournal();
    const attempted: JournalTransitionRequest[] = [];
    let failFirstJournal = true;
    const journal: DeletionJournalPort = {
      appendTransition: vi.fn(async (request) => {
        attempted.push(request);
        if (failFirstJournal) {
          failFirstJournal = false;
          return { outcome: "unknown" as const, reconciliationKey: "scoped-request-unknown" };
        }
        return confirmed.port.appendTransition(request);
      }),
    };
    const params = {
      sessionId: "session-reserved-owner-auth",
      idempotencyKey: "reserved-workspace-request",
      typedName: owner.workspace.name,
    } as const;

    await expect(
      requestWorkspaceDeletion(db, ownerScope, params, journal)
    ).rejects.toThrow("deletion_refused:journal_unknown");
    const [reserved] = await db
      .select()
      .from(deletionOperations)
      .where(eq(deletionOperations.idempotencyKey, params.idempotencyKey));
    expect(reserved).toMatchObject({
      state: "requested",
      journalIntentPlanDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      journalIntentEffectiveAt: expect.any(Date),
    });

    await db
      .update(memberships)
      .set({ role: "viewer", version: 2 })
      .where(eq(memberships.userId, owner.user.id));
    await db.delete(session).where(eq(session.id, params.sessionId));

    const intruder = await bootstrap(
      db,
      "reserved-intruder-auth",
      "Reserved Intruder Workspace"
    );
    await db.insert(memberships).values([
      {
        userId: intruder.user.id,
        workspaceId: owner.workspace.id,
        role: "viewer",
      },
      {
        userId: owner.user.id,
        workspaceId: intruder.workspace.id,
        role: "viewer",
      },
    ]);
    const remintedViewerScope = await withWorkspace(db, {
      authUserId: "reserved-owner-auth",
      workspaceId: owner.workspace.id,
    });
    expect(remintedViewerScope).toMatchObject({ role: "viewer", membershipVersion: 2 });
    const intruderOnTarget = await withWorkspace(db, {
      authUserId: "reserved-intruder-auth",
      workspaceId: owner.workspace.id,
    });
    const requesterOnWrongWorkspace = await withWorkspace(db, {
      authUserId: "reserved-owner-auth",
      workspaceId: intruder.workspace.id,
    });

    await expect(
      resumeWorkspaceDeletionRequest(db, reserved.id, intruderOnTarget, journal)
    ).rejects.toThrow("deletion_refused:operation_not_available");
    await expect(
      resumeWorkspaceDeletionRequest(
        db,
        reserved.id,
        requesterOnWrongWorkspace,
        journal
      )
    ).rejects.toThrow("deletion_refused:operation_not_available");
    await expect(
      resumeProfileDeletionRequest(db, reserved.id, remintedViewerScope, journal)
    ).rejects.toThrow("deletion_refused:operation_not_available");
    expect(attempted).toHaveLength(1);

    // A fresh process authenticates the same server-side actor and remints its
    // now-viewer scope. The persisted reservation, rather than the stale
    // capability epoch or deleted form session, remains the commit authority.
    const retried = await resumeWorkspaceDeletionRequest(
      db,
      reserved.id,
      remintedViewerScope,
      journal
    );
    expect(retried).toMatchObject({ state: "tombstoned", acknowledgedAt: expect.any(Date) });
    expect(retried.graceExpiresAt).toEqual(
      new Date(reserved.requestedAt.getTime() + DELETION_GRACE_MS)
    );
    expect(attempted).toHaveLength(3);
    expect(attempted[1]).toEqual(attempted[0]);
  });

  it("reclaims unreserved profile and workspace drafts after rename, session loss, and owner takeover", async () => {
    const original = await bootstrap(db, "draft-original-auth", "Draft Original");
    const successor = await bootstrap(db, "draft-successor-auth", "Draft Successor");
    const [successorMembership] = await db
      .insert(memberships)
      .values({
        userId: successor.user.id,
        workspaceId: original.workspace.id,
        role: "owner",
      })
      .returning();
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: original.workspace.id, displayName: "Draft Profile Old" })
      .returning();
    const originalScope = await withWorkspace(db, { authUserId: "draft-original-auth" });
    const originalProfileScope = await ProfileScope.mint(db, originalScope, profile.id);
    const staleDraftRequestedAt = new Date(
      Date.now() - DELETION_GRACE_MS - 60_000
    );
    const [profileDraft] = await db
      .insert(deletionOperations)
      .values({
        scope: "profile",
        targetKey: `profile:${original.workspace.id}:${profile.id}`,
        workspaceId: original.workspace.id,
        profileId: profile.id,
        profilePriorState: "active",
        requesterUserId: original.user.id,
        requesterDigest: sha(`respin:deletion-requester:v1:${original.user.id}`),
        requestSessionDigest: sha("session-draft-original-auth"),
        requestMembershipVersion: originalProfileScope.membershipVersion,
        requestWorkspaceLifecycleVersion: originalProfileScope.workspaceLifecycleVersion,
        requestProfileLifecycleVersion: originalProfileScope.profileLifecycleVersion,
        idempotencyKey: "profile-draft-old-key",
        payloadHash: sha(JSON.stringify({
          schema: 1,
          scope: "profile",
          target: profile.id,
          confirmation: "Draft Profile Old",
        })),
        requestedAt: staleDraftRequestedAt,
      })
      .returning();
    const [workspaceDraft] = await db
      .insert(deletionOperations)
      .values({
        scope: "workspace",
        targetKey: `workspace:${original.workspace.id}`,
        workspaceId: original.workspace.id,
        requesterUserId: original.user.id,
        requesterDigest: sha(`respin:deletion-requester:v1:${original.user.id}`),
        requestSessionDigest: sha("session-draft-original-auth"),
        requestMembershipVersion: originalScope.membershipVersion,
        requestWorkspaceLifecycleVersion: originalScope.workspaceLifecycleVersion,
        idempotencyKey: "workspace-draft-old-key",
        payloadHash: sha(JSON.stringify({
          schema: 1,
          scope: "workspace",
          target: original.workspace.id,
          confirmation: original.workspace.name,
        })),
        requestedAt: staleDraftRequestedAt,
      })
      .returning();

    await db
      .update(creatorProfiles)
      .set({
        displayName: "Draft Profile New",
        state: "archived",
        lifecycleVersion: 2,
      })
      .where(eq(creatorProfiles.id, profile.id));
    await db
      .update(workspaces)
      .set({ name: "Draft Workspace New", lifecycleVersion: 2 })
      .where(eq(workspaces.id, original.workspace.id));
    await db
      .update(memberships)
      .set({ role: "viewer", version: 2 })
      .where(eq(memberships.userId, original.user.id));
    await db.delete(session).where(eq(session.id, "session-draft-original-auth"));

    const successorScope = await withWorkspace(db, {
      authUserId: "draft-successor-auth",
      workspaceId: original.workspace.id,
    });
    expect(successorScope.membershipVersion).toBe(successorMembership.version);
    const journal = confirmedJournal();
    const reboundProfile = await requestProfileDeletion(
      db,
      successorScope,
      profile.id,
      {
        sessionId: "session-draft-successor-auth",
        idempotencyKey: "profile-draft-new-key",
        typedName: "Draft Profile New",
      },
      journal.port
    );
    expect(reboundProfile).toMatchObject({
      id: profileDraft.id,
      state: "tombstoned",
      profilePriorState: "archived",
      requesterUserId: successor.user.id,
      requesterDigest: sha(`respin:deletion-requester:v1:${successor.user.id}`),
      requestSessionDigest: sha("session-draft-successor-auth"),
      idempotencyKey: "profile-draft-new-key",
    });
    expect(reboundProfile.requestedAt.getTime()).toBeGreaterThan(
      staleDraftRequestedAt.getTime()
    );
    expect(reboundProfile.graceExpiresAt?.getTime()).toBe(
      reboundProfile.requestedAt.getTime() + DELETION_GRACE_MS
    );
    expect(reboundProfile.graceExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    await cancelScopedDeletion(
      db,
      reboundProfile.id,
      { sessionId: "session-draft-successor-auth" },
      journal.port
    );
    const [restoredArchived] = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.id, profile.id));
    expect(restoredArchived.state).toBe("archived");

    const [activeRebindDraft] = await db
      .insert(deletionOperations)
      .values({
        scope: "profile",
        targetKey: `profile:${original.workspace.id}:${profile.id}`,
        workspaceId: original.workspace.id,
        profileId: profile.id,
        profilePriorState: "archived",
        requesterUserId: successor.user.id,
        requesterDigest: sha(`respin:deletion-requester:v1:${successor.user.id}`),
        requestSessionDigest: sha("session-draft-successor-auth"),
        requestMembershipVersion: successorScope.membershipVersion,
        requestWorkspaceLifecycleVersion: successorScope.workspaceLifecycleVersion,
        requestProfileLifecycleVersion: restoredArchived.lifecycleVersion,
        idempotencyKey: "profile-draft-archived-key",
        payloadHash: sha(JSON.stringify({
          schema: 1,
          scope: "profile",
          target: profile.id,
          confirmation: "Draft Profile New",
        })),
      })
      .returning();
    await db
      .update(creatorProfiles)
      .set({
        state: "active",
        lifecycleVersion: restoredArchived.lifecycleVersion + 1,
      })
      .where(eq(creatorProfiles.id, profile.id));
    const reboundActiveProfile = await requestProfileDeletion(
      db,
      successorScope,
      profile.id,
      {
        sessionId: "session-draft-successor-auth",
        idempotencyKey: "profile-draft-active-key",
        typedName: "Draft Profile New",
      },
      journal.port
    );
    expect(reboundActiveProfile).toMatchObject({
      id: activeRebindDraft.id,
      state: "tombstoned",
      profilePriorState: "active",
    });
    await cancelScopedDeletion(
      db,
      reboundActiveProfile.id,
      { sessionId: "session-draft-successor-auth" },
      journal.port
    );
    expect(
      await db
        .select({ state: creatorProfiles.state })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profile.id))
    ).toEqual([{ state: "active" }]);

    const reboundWorkspace = await requestWorkspaceDeletion(
      db,
      successorScope,
      {
        sessionId: "session-draft-successor-auth",
        idempotencyKey: "workspace-draft-new-key",
        typedName: "Draft Workspace New",
      },
      journal.port
    );
    expect(reboundWorkspace).toMatchObject({
      id: workspaceDraft.id,
      state: "tombstoned",
      requesterUserId: successor.user.id,
      requesterDigest: sha(`respin:deletion-requester:v1:${successor.user.id}`),
      requestSessionDigest: sha("session-draft-successor-auth"),
      idempotencyKey: "workspace-draft-new-key",
    });
    expect(reboundWorkspace.requestedAt.getTime()).toBeGreaterThan(
      staleDraftRequestedAt.getTime()
    );
    expect(reboundWorkspace.graceExpiresAt?.getTime()).toBe(
      reboundWorkspace.requestedAt.getTime() + DELETION_GRACE_MS
    );
    expect(reboundWorkspace.graceExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("resumes a durably reserved scoped cancellation without session plaintext", async () => {
    const requester = await bootstrap(db, "cancel-resume-auth", "Cancel Resume");
    const survivor = await bootstrap(db, "cancel-resume-survivor-auth", "Cancel Survivor");
    await db.insert(memberships).values({
      userId: survivor.user.id,
      workspaceId: requester.workspace.id,
      role: "owner",
    });
    const scope = await withWorkspace(db, { authUserId: "cancel-resume-auth" });
    const requestJournal = confirmedJournal();
    const operation = await requestWorkspaceDeletion(
      db,
      scope,
      {
        sessionId: "session-cancel-resume-auth",
        idempotencyKey: "cancel-resume-request",
        typedName: requester.workspace.name,
      },
      requestJournal.port
    );
    const confirmed = confirmedJournal();
    let unknown = true;
    const cancellationJournal: DeletionJournalPort = {
      appendTransition: vi.fn(async (request) => {
        if (unknown) {
          unknown = false;
          return { outcome: "unknown" as const, reconciliationKey: "cancel-resume-unknown" };
        }
        return confirmed.port.appendTransition(request);
      }),
    };
    await expect(
      cancelScopedDeletion(
        db,
        operation.id,
        { sessionId: "session-cancel-resume-auth" },
        cancellationJournal
      )
    ).rejects.toThrow("deletion_refused:journal_unknown");
    await db.delete(session).where(eq(session.id, "session-cancel-resume-auth"));
    await db
      .update(memberships)
      .set({ role: "viewer", version: 2 })
      .where(eq(memberships.userId, requester.user.id));

    const resumed = await resumeScopedDeletionCancellation(
      db,
      operation.id,
      cancellationJournal
    );
    expect(resumed).toMatchObject({
      state: "cancelled",
      requestSessionDigest: null,
      cancellationReplayDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(
      await db
        .select({ state: workspaces.lifecycleState })
        .from(workspaces)
        .where(eq(workspaces.id, requester.workspace.id))
    ).toEqual([{ state: "active" }]);
  });

  it("concurrent scoped cancellation replay returns the same terminal operation", async () => {
    const requester = await bootstrap(db, "cancel-race-auth", "Cancel Race");
    const scope = await withWorkspace(db, { authUserId: "cancel-race-auth" });
    const journal = confirmedJournal();
    const operation = await requestWorkspaceDeletion(
      db,
      scope,
      {
        sessionId: "session-cancel-race-auth",
        idempotencyKey: "cancel-race-request",
        typedName: requester.workspace.name,
      },
      journal.port
    );
    let transactionCount = 0;
    let winner: DeletionOperation | null = null;
    const interleavedDb = {
      select: db.select.bind(db),
      transaction: async <T>(callback: (tx: TxLike) => Promise<T>): Promise<T> => {
        transactionCount += 1;
        if (transactionCount === 2) {
          winner = await cancelScopedDeletion(
            db,
            operation.id,
            { sessionId: "session-cancel-race-auth" },
            journal.port
          );
        }
        return db.transaction(callback);
      },
    } as unknown as TestDb;

    const replay = await cancelScopedDeletion(
      interleavedDb,
      operation.id,
      { sessionId: "session-cancel-race-auth" },
      journal.port
    );
    expect(winner).not.toBeNull();
    expect(replay).toEqual(winner);
    expect(replay.state).toBe("cancelled");
    expect(journal.requests).toHaveLength(3);
  });

  it("cancels identity deletion with exact secret plus fresh proof and restores only unchanged memberships", async () => {
    const { target, survivor } = await identityFixture(db);
    const password = "phase-10b1-cancellation-password";
    await db.insert(account).values({
      id: "credential-target-auth",
      accountId: "target-auth",
      providerId: "credential",
      userId: "target-auth",
      password: await hashPassword(password),
    });
    await db.insert(memberships).values({
      userId: target.user.id,
      workspaceId: survivor.workspace.id,
      role: "editor",
    });
    let secret = "";
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        secret = request.secret;
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(async (request) => ({
        outcome: "confirmed" as const,
        operationId: request.operationId,
        commandId: request.commandId,
        attempt: request.attempt,
        secretDigest: request.secretDigest,
        recipientDigest: request.recipientDigest,
        expiresAt: request.expiresAt,
        deliveredAt: NOW,
        deliveryReceiptDigest: sha(`delivery:${request.commandId}:${request.attempt}`),
      })),
    };
    const journal = confirmedJournal();
    const requested = await requestIdentityDeletion(
      db,
      {
        sessionId: "session-target-auth",
        idempotencyKey: "identity-cancel",
      },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    const snapshots = await db
      .select()
      .from(deletionMembershipSnapshots)
      .where(eq(deletionMembershipSnapshots.operationId, requested.operation.id));
    expect(snapshots).toHaveLength(2);
    const changed = snapshots.find((row) => row.workspaceId === survivor.workspace.id)!;
    await db
      .update(memberships)
      .set({ version: changed.membershipVersion + 2 })
      .where(eq(memberships.id, changed.membershipId));
    const rateLimitKeyDigest = sha("identity-cancellation-test-client");
    const failedRecoverySession = await beginIdentityCancellationRecoverySession(
      db,
      requested.operation.id,
      secret,
      rateLimitKeyDigest
    );
    const duplicatePassword = "phase-10b1-duplicate-credential-password";
    await db.insert(account).values({
      id: "credential-target-auth-duplicate",
      accountId: "target-auth-duplicate",
      providerId: "credential",
      userId: "target-auth",
      password: await hashPassword(duplicatePassword),
    });
    for (const candidate of [password, duplicatePassword]) {
      await expect(
        createIdentityCancellationProofWithPassword(
          db,
          requested.operation.id,
          failedRecoverySession.recoverySession,
          candidate,
          rateLimitKeyDigest
        )
      ).rejects.toThrow("auth_lifecycle_refused");
    }
    expect(
      await db
        .select()
        .from(deletionCancellationProofs)
        .where(eq(deletionCancellationProofs.operationId, requested.operation.id))
    ).toHaveLength(0);
    await db
      .delete(account)
      .where(eq(account.id, "credential-target-auth-duplicate"));
    await expect(
      createIdentityCancellationProofWithPassword(
        db,
        requested.operation.id,
        failedRecoverySession.recoverySession,
        `${password}-wrong`,
        rateLimitKeyDigest
      )
    ).rejects.toThrow("auth_lifecycle_refused");
    await expect(
      createIdentityCancellationProofWithPassword(
        db,
        requested.operation.id,
        failedRecoverySession.recoverySession,
        password,
        rateLimitKeyDigest
      )
    ).rejects.toThrow("auth_lifecycle_refused");
    const recoverySession = await beginIdentityCancellationRecoverySession(
      db,
      requested.operation.id,
      secret,
      rateLimitKeyDigest
    );
    await expect(
      createIdentityCancellationProofWithPassword(
        db,
        requested.operation.id,
        recoverySession.recoverySession,
        "x".repeat(1025),
        rateLimitKeyDigest
      )
    ).rejects.toThrow("auth_lifecycle_refused");
    const [storedRecoverySession] = await db
      .select({ id: deletionRecoverySessions.id })
      .from(deletionRecoverySessions)
      .where(eq(deletionRecoverySessions.secretDigest, sha(recoverySession.recoverySession)));
    const malformedFactorAt = new Date();
    await expect(
      db.insert(deletionCancellationProofs).values({
        operationId: requested.operation.id,
        recoverySessionId: storedRecoverySession.id,
        // Both referenced identities exist. Only the composite relationship is
        // false, so this proves the proof cannot be rebound across identities.
        authUserId: "survivor-auth",
        statusReceiptDigest: sha("malformed-cross-identity-receipt"),
        factorVerifiedAt: malformedFactorAt,
        expiresAt: new Date(malformedFactorAt.getTime() + DELETION_REAUTH_MAX_AGE_MS),
      })
    ).rejects.toThrow();
    const replacementRecoverySession = await beginIdentityCancellationRecoverySession(
      db,
      requested.operation.id,
      secret,
      rateLimitKeyDigest
    );
    await beginIdentityCancellationRecoverySession(
      db,
      requested.operation.id,
      secret,
      rateLimitKeyDigest
    );
    await beginIdentityCancellationRecoverySession(
      db,
      requested.operation.id,
      secret,
      rateLimitKeyDigest
    );
    await expect(
      beginIdentityCancellationRecoverySession(
        db,
        requested.operation.id,
        secret,
        rateLimitKeyDigest
      )
    ).rejects.toThrow("auth_lifecycle_refused");
    const cancellationProof = await createIdentityCancellationProofWithPassword(
      db,
      requested.operation.id,
      recoverySession.recoverySession,
      password,
      rateLimitKeyDigest
    );
    let failCancellationJournal = true;
    const cancellationJournal: DeletionJournalPort = {
      appendTransition: vi.fn(async (request) => {
        if (failCancellationJournal) {
          failCancellationJournal = false;
          return {
            outcome: "unknown" as const,
            reconciliationKey: "cancellation-proof-reservation-unknown",
          };
        }
        return journal.port.appendTransition(request);
      }),
    };

    await expect(
      cancelIdentityDeletion(
        db,
        requested.operation.id,
        `${secret}-wrong`,
        {
          proofId: cancellationProof.proofId,
          cancellationReceipt: cancellationProof.cancellationReceipt,
        },
        {
          journal: journal.port,
          membershipRestore: {
            mayRestore: vi.fn(async () => ({ allowed: true, refusal: null })),
          },
        }
      )
    ).rejects.toThrow("deletion_refused:recovery_secret_invalid");
    expect(
      await db
        .select({
          base: deletionOperations.journalIntentBaseVersion,
          digest: deletionOperations.journalIntentPlanDigest,
          at: deletionOperations.journalIntentEffectiveAt,
        })
        .from(deletionOperations)
        .where(eq(deletionOperations.id, requested.operation.id))
    ).toEqual([{ base: null, digest: null, at: null }]);

    await expect(
      cancelIdentityDeletion(
        db,
        requested.operation.id,
        secret,
        {
          proofId: cancellationProof.proofId,
          cancellationReceipt: cancellationProof.cancellationReceipt,
        },
        {
          journal: cancellationJournal,
          membershipRestore: {
            mayRestore: vi.fn(async () => ({ allowed: true, refusal: null })),
          },
        }
      )
    ).rejects.toThrow("deletion_refused:journal_unknown");
    await expect(
      createIdentityCancellationProofWithPassword(
        db,
        requested.operation.id,
        replacementRecoverySession.recoverySession,
        password,
        rateLimitKeyDigest
      )
    ).rejects.toThrow("auth_lifecycle_refused");

    let restoreCompletedAt = 0;
    secret = "";
    const cancelled = await resumeIdentityDeletionCancellation(
      db,
      requested.operation.id,
      {
        journal: cancellationJournal,
        membershipRestore: {
          mayRestore: vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
            restoreCompletedAt = Date.now();
            return { allowed: true, refusal: null };
          }),
        },
      }
    );
    expect(cancelled.operation).toMatchObject({
      state: "cancelled",
      recoverySecretDigest: null,
      recoverySecretPrefix: null,
      recoveryConsumedAt: expect.any(Date),
    });
    expect(cancelled.operation.identityCancellationReceiptExpiresAt?.getTime()).toBeGreaterThanOrEqual(
      restoreCompletedAt + DELETION_REAUTH_MAX_AGE_MS
    );
    expect(cancelled.operation.cancellationReplayDigest).toBe(
      sha(cancellationProof.cancellationReceipt)
    );
    expect(cancelled.restoredMembershipIds).toHaveLength(1);
    expect(cancelled.conflicts).toEqual([
      { membershipId: changed.membershipId, outcome: "changed" },
    ]);
    const oldSessions = await db
      .select({ id: session.id })
      .from(session)
      .where(eq(session.id, "session-target-auth"));
    expect(oldSessions).toHaveLength(0);
    expect(
      await db.select({ id: session.id }).from(session).where(eq(session.userId, "target-auth"))
    ).toHaveLength(0);
    expect(
      await db.select().from(users).where(eq(users.id, target.user.id))
    ).toEqual([expect.objectContaining({ lifecycleState: "active" })]);
    expect(
      await db.select().from(authUser).where(eq(authUser.id, "target-auth"))
    ).toEqual([expect.objectContaining({ ordinaryLoginDisabledAt: null })]);
    await expect(
      cancelIdentityDeletion(
        db,
        requested.operation.id,
        secret,
        {
          proofId: cancellationProof.proofId,
          cancellationReceipt: cancellationProof.cancellationReceipt,
        },
        {
          journal: journal.port,
          membershipRestore: {
            mayRestore: vi.fn(async () => ({ allowed: true, refusal: null })),
          },
        }
      )
    ).rejects.toThrow();
    await expect(
      readIdentityCancellationStatus(
        db,
        requested.operation.id,
        cancellationProof.cancellationReceipt
      )
    ).resolves.toEqual({
      state: "cancelled",
      restoredMembershipIds: cancelled.restoredMembershipIds,
      conflicts: cancelled.conflicts,
    });
    expect(journal.requests).toHaveLength(3);
    await expect(
      addSession(db, "target-auth", "session-after-cancellation")
    ).resolves.toBeUndefined();
  });

  it("tombstones and cancels a profile while already-minted profile capabilities fail closed", async () => {
    const owner = await bootstrap(db, "profile-owner-auth", "Profile Owner");
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId: owner.workspace.id, displayName: "Creator Alpha" })
      .returning();
    const workspaceScope = await withWorkspace(db, { authUserId: "profile-owner-auth" });
    const profileScope = await ProfileScope.mint(db, workspaceScope, profile.id);
    const journal = confirmedJournal();
    const params = {
      sessionId: "session-profile-owner-auth",
      idempotencyKey: "delete-profile-alpha",
      typedName: "Creator Alpha",
    } as const;
    const requested = await requestProfileDeletion(
      db,
      workspaceScope,
      profile.id,
      params,
      journal.port
    );
    expect(requested).toMatchObject({ state: "tombstoned", acknowledgedAt: expect.any(Date) });
    await expect(profileScope.accessors.profile()).rejects.toThrow(
      "lifecycle_refused:profile_tombstoned"
    );
    await expect(ProfileScope.mint(db, workspaceScope, profile.id)).rejects.toThrow();
    await db
      .update(creatorProfiles)
      .set({ displayName: "Creator Renamed While Tombstoned" })
      .where(eq(creatorProfiles.id, profile.id));
    const replay = await requestProfileDeletion(
      db,
      workspaceScope,
      profile.id,
      params,
      journal.port
    );
    expect(replay.id).toBe(requested.id);
    const duplicateKeyReplay = await requestProfileDeletion(
      db,
      workspaceScope,
      profile.id,
      { ...params, idempotencyKey: "delete-profile-alpha-duplicate" },
      journal.port
    );
    expect(duplicateKeyReplay.id).toBe(requested.id);
    await expect(
      requestProfileDeletion(
        db,
        workspaceScope,
        profile.id,
        {
          ...params,
          idempotencyKey: "delete-profile-alpha-conflict",
          typedName: "Creator Renamed While Tombstoned",
        },
        journal.port
      )
    ).rejects.toThrow("deletion_refused:idempotency_conflict");
    expect(journal.requests).toHaveLength(2);

    const cancelled = await cancelScopedDeletion(
      db,
      requested.id,
      {
        sessionId: "session-profile-owner-auth",
      },
      journal.port
    );
    expect(cancelled.state).toBe("cancelled");
    const cancellationReplay = await cancelScopedDeletion(
      db,
      requested.id,
      {
        sessionId: "session-profile-owner-auth",
      },
      journal.port
    );
    expect(cancellationReplay).toEqual(cancelled);
    expect(journal.requests).toHaveLength(3);
    expect(
      await db.select().from(creatorProfiles).where(eq(creatorProfiles.id, profile.id))
    ).toEqual([expect.objectContaining({ state: "active" })]);
  });

  it("deletes and restores an archived profile through workspace-owner authority", async () => {
    const owner = await bootstrap(db, "archived-profile-owner-auth", "Archived Owner");
    const [profile] = await db
      .insert(creatorProfiles)
      .values({
        workspaceId: owner.workspace.id,
        displayName: "Archived Creator",
        state: "archived",
      })
      .returning();
    const workspaceScope = await withWorkspace(db, {
      authUserId: "archived-profile-owner-auth",
    });
    const journal = confirmedJournal();
    const params = {
      sessionId: "session-archived-profile-owner-auth",
      idempotencyKey: "delete-archived-profile",
      typedName: "Archived Creator",
    } as const;
    const requested = await requestProfileDeletion(
      db,
      workspaceScope,
      profile.id,
      params,
      journal.port
    );
    expect(requested).toMatchObject({
      state: "tombstoned",
      profilePriorState: "archived",
    });
    const cancelled = await cancelScopedDeletion(
      db,
      requested.id,
      { sessionId: params.sessionId },
      journal.port
    );
    expect(cancelled).toMatchObject({ state: "cancelled", requestSessionDigest: null });
    expect(
      await db
        .select({ state: creatorProfiles.state })
        .from(creatorProfiles)
        .where(eq(creatorProfiles.id, profile.id))
    ).toEqual([{ state: "archived" }]);
    const duplicate = await requestProfileDeletion(
      db,
      workspaceScope,
      profile.id,
      params,
      journal.port
    );
    expect(duplicate.id).toBe(requested.id);
    expect(duplicate.requestSessionDigest).toBeNull();
    await expect(
      resumeProfileDeletionRequest(db, requested.id, workspaceScope, journal.port)
    ).resolves.toEqual(cancelled);
  });

  it("makes malformed, nonexistent, and foreign profile deletion targets indistinguishable", async () => {
    const owner = await bootstrap(db, "profile-target-owner-auth", "Target Owner");
    const foreignOwner = await bootstrap(
      db,
      "profile-target-foreign-auth",
      "Foreign Owner"
    );
    const [foreignProfile] = await db
      .insert(creatorProfiles)
      .values({
        workspaceId: foreignOwner.workspace.id,
        displayName: "Invisible Creator",
      })
      .returning();
    const workspaceScope = await withWorkspace(db, {
      authUserId: "profile-target-owner-auth",
      workspaceId: owner.workspace.id,
    });
    const journal = confirmedJournal();
    const refusalFor = async (profileId: string, idempotencyKey: string) =>
      requestProfileDeletion(
        db,
        workspaceScope,
        profileId,
        {
          sessionId: "session-profile-target-owner-auth",
          idempotencyKey,
          typedName: "Invisible Creator",
        },
        journal.port
      ).then(
        () => "unexpected_success",
        (error: unknown) => (error as Error).message
      );

    expect(
      await Promise.all([
        refusalFor("not-a-uuid", "bad-profile-target"),
        refusalFor("00000000-0000-0000-0000-000000000000", "missing-profile-target"),
        refusalFor(foreignProfile.id, "foreign-profile-target"),
      ])
    ).toEqual([
      "deletion_refused:target_not_authorized",
      "deletion_refused:target_not_authorized",
      "deletion_refused:target_not_authorized",
    ]);
    expect(journal.requests).toHaveLength(0);
  });

  it("workspace tombstone blocks old scopes without revoking global sessions and worker cannot bypass acknowledgement", async () => {
    const owner = await bootstrap(db, "workspace-owner-auth", "Workspace Owner");
    const oldScope = await withWorkspace(db, { authUserId: "workspace-owner-auth" });
    const journal = confirmedJournal();
    const requested = await requestWorkspaceDeletion(
      db,
      oldScope,
      {
        sessionId: "session-workspace-owner-auth",
        idempotencyKey: "delete-workspace-owner",
        typedName: owner.workspace.name,
      },
      journal.port
    );
    await expect(oldScope.accessors.workspace()).rejects.toThrow(
      "lifecycle_refused:workspace_access_tombstoned_or_suspended"
    );
    expect(
      await db
        .select({ id: session.id })
        .from(session)
        .where(eq(session.userId, "workspace-owner-auth"))
    ).toEqual([{ id: "session-workspace-owner-auth" }]);

    const [unacknowledgedWorkspace] = await db
      .insert(workspaces)
      .values({ name: "Unacknowledged Worker Fixture" })
      .returning();
    const [unacknowledged] = await db
      .insert(deletionOperations)
      .values({
        scope: "workspace",
        targetKey: `workspace:${unacknowledgedWorkspace.id}`,
        workspaceId: unacknowledgedWorkspace.id,
        requesterUserId: owner.user.id,
        requesterDigest: sha(`respin:deletion-requester:v1:${owner.user.id}`),
        requestSessionDigest: sha("unacknowledged-worker-session"),
        requestMembershipVersion: 1,
        requestWorkspaceLifecycleVersion: 1,
        idempotencyKey: "unacknowledged-worker-op",
        payloadHash: sha("unacknowledged-worker-op"),
      })
      .returning();
    await expect(
      transitionDeletionOperation(
        db,
        unacknowledged.id,
        "journal_pending",
        journal.port
      )
    ).rejects.toThrow("deletion_refused:operation_not_acknowledged");
    expect(
      await db
        .select({
          base: deletionOperations.journalIntentBaseVersion,
          digest: deletionOperations.journalIntentPlanDigest,
          at: deletionOperations.journalIntentEffectiveAt,
        })
        .from(deletionOperations)
        .where(eq(deletionOperations.id, unacknowledged.id))
    ).toEqual([{ base: null, digest: null, at: null }]);

    const [blockedWorkspace] = await db
      .insert(workspaces)
      .values({ name: "Blocked Reconciliation Fixture" })
      .returning();
    const [blocked] = await db
      .insert(deletionOperations)
      .values({
        scope: "workspace",
        targetKey: `workspace:${blockedWorkspace.id}`,
        workspaceId: blockedWorkspace.id,
        requesterUserId: owner.user.id,
        requesterDigest: sha(`respin:deletion-requester:v1:${owner.user.id}`),
        requestSessionDigest: sha("blocked-worker-session"),
        requestMembershipVersion: 1,
        requestWorkspaceLifecycleVersion: 1,
        idempotencyKey: "blocked-worker-op",
        payloadHash: sha("blocked-worker-op"),
        state: "blocked",
        blockedResumeState: "grace",
        acknowledgedAt: NOW,
      })
      .returning();
    // Task 4: a blocked operation resumes only at its recorded resume state.
    await expect(
      transitionDeletionOperation(db, blocked.id, "erasing", journal.port)
    ).rejects.toThrow("deletion_refused:blocked_reconciliation_target_mismatch");
    expect(
      await db
        .select({
          base: deletionOperations.journalIntentBaseVersion,
          digest: deletionOperations.journalIntentPlanDigest,
          at: deletionOperations.journalIntentEffectiveAt,
        })
        .from(deletionOperations)
        .where(eq(deletionOperations.id, blocked.id))
    ).toEqual([{ base: null, digest: null, at: null }]);

    const externalPending = await transitionDeletionOperation(
      db,
      requested.id,
      "external_actions_pending",
      journal.port
    );
    const grace = await transitionDeletionOperation(
      db,
      requested.id,
      "grace",
      journal.port
    );
    expect([externalPending.state, grace.state]).toEqual([
      "external_actions_pending",
      "grace",
    ]);
    await expect(
      cancelScopedDeletion(
        db,
        requested.id,
        { sessionId: "missing-workspace-session" },
        journal.port
      )
    ).rejects.toThrow("deletion_refused:foreign_session");
    // Task 4: the seven-day window is checked in the transaction; the
    // irreversible receipts themselves are only appended by the executor's
    // erasure transaction, never by this worker seam.
    await expect(
      transitionDeletionOperation(db, requested.id, "erasing", journal.port)
    ).rejects.toThrow("deletion_refused:grace_window_open");
    await expect(
      transitionDeletionOperation(db, requested.id, "verifying", journal.port)
    ).rejects.toThrow("deletion_refused:irreversible_transition_requires_erasure_transaction");
    expect(
      await db
        .select({
          base: deletionOperations.journalIntentBaseVersion,
          digest: deletionOperations.journalIntentPlanDigest,
          at: deletionOperations.journalIntentEffectiveAt,
        })
        .from(deletionOperations)
        .where(eq(deletionOperations.id, requested.id))
    ).toEqual([{ base: null, digest: null, at: null }]);
    const cancelled = await cancelScopedDeletion(
      db,
      requested.id,
      {
        sessionId: "session-workspace-owner-auth",
      },
      journal.port
    );
    expect(cancelled.state).toBe("cancelled");
    expect(
      await db.select().from(workspaces).where(eq(workspaces.id, owner.workspace.id))
    ).toEqual([expect.objectContaining({ lifecycleState: "active" })]);
  });

  it("uses the exact session and lets runtime tighten but never widen the ten-minute proof", async () => {
    const owner = await bootstrap(db, "reauth-owner-auth", "Reauth Owner");
    const ownerScope = await withWorkspace(db, { authUserId: "reauth-owner-auth" });
    const journal = confirmedJournal();
    await addSession(
      db,
      "reauth-owner-auth",
      "boundary-session",
      new Date(Date.now() - DELETION_REAUTH_MAX_AGE_MS + 1_000)
    );
    const operation = await requestWorkspaceDeletion(
      db,
      ownerScope,
      {
        sessionId: "boundary-session",
        idempotencyKey: "reauth-boundary",
        typedName: owner.workspace.name,
      },
      journal.port
    );
    expect(operation.state).toBe("tombstoned");

    await cancelScopedDeletion(
      db,
      operation.id,
      {
        sessionId: "boundary-session",
      },
      journal.port
    );
    await expect(
      requestWorkspaceDeletion(
        db,
        await withWorkspace(db, { authUserId: "reauth-owner-auth" }),
        {
          sessionId: "boundary-session",
          idempotencyKey: "reauth-tightened",
          typedName: owner.workspace.name,
          reauthMaxAgeMs: DELETION_REAUTH_MAX_AGE_MS - 2_000,
        },
        journal.port
      )
    ).rejects.toThrow("deletion_refused:reauthentication_missing_or_stale");
    await expect(
      requestWorkspaceDeletion(
        db,
        await withWorkspace(db, { authUserId: "reauth-owner-auth" }),
        {
          sessionId: "boundary-session",
          idempotencyKey: "reauth-widened",
          typedName: owner.workspace.name,
          reauthMaxAgeMs: DELETION_REAUTH_MAX_AGE_MS + 1,
        },
        journal.port
      )
    ).rejects.toThrow("deletion_refused:invalid_reauth_window");
  });
});

describe("deletion authority clocks are read only after graph locks", () => {
  const SRC = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../src/deletion-lifecycle.ts"
    ),
    "utf8"
  );

  function bodyOf(name: string): string {
    const start = SRC.indexOf(`async function ${name}(`);
    expect(start, `${name} must exist`).toBeGreaterThan(-1);
    const next = SRC.indexOf("\nasync function ", start + 1);
    return SRC.slice(start, next === -1 ? SRC.length : next);
  }

  it("scoped cancellation measures session and grace cutoffs after both graph locks", () => {
    const body = bodyOf("requireScopedCancellationAuthorityInTx");
    const identityLock = body.indexOf("lockIdentityMembershipGraph");
    const workspaceLock = body.indexOf("lockWorkspaceMembershipGraph");
    const clock = body.indexOf("databaseNow(tx)");
    const proof = body.indexOf("requireReauthenticatedSession");
    const grace = body.indexOf("cancellation_window_closed");
    expect(identityLock).toBeGreaterThan(-1);
    expect(identityLock).toBeLessThan(workspaceLock);
    expect(workspaceLock).toBeLessThan(clock);
    expect(clock).toBeLessThan(proof);
    expect(proof).toBeLessThan(grace);
  });

  it("identity request and cancellation measure expiry only after ordered graph locks", () => {
    const request = bodyOf("finalizeIdentityDeletionRequest");
    expect(request.indexOf("lockIdentityWorkspaces")).toBeLessThan(
      request.indexOf("databaseNow(tx)")
    );
    expect(request.indexOf("databaseNow(tx)")).toBeLessThan(
      request.indexOf("const recoveryExpired")
    );
    expect(request.indexOf("const recoveryExpired")).toBeLessThan(
      request.indexOf("appendJournalTransitionInTx")
    );
    expect(request.indexOf("hasExactJournalReservation")).toBeLessThan(
      request.indexOf("await assertWorkspacesReleasable")
    );
    expect(request.indexOf("await assertWorkspacesReleasable")).toBeLessThan(
      request.indexOf("appendJournalTransitionInTx")
    );

    const cancellation = bodyOf("requireIdentityCancellationAuthorityInTx");
    expect(cancellation.indexOf("lockIdentityMembershipGraph")).toBeLessThan(
      cancellation.indexOf("for (const workspaceId")
    );
    expect(cancellation.indexOf("for (const workspaceId")).toBeLessThan(
      cancellation.indexOf("databaseNow(tx)")
    );
    expect(cancellation.indexOf("databaseNow(tx)")).toBeLessThan(
      cancellation.indexOf("const [locked] = await selectAuthority()")
    );
  });
});

describe("Plan C3 — the billing contact must be released before an identity can leave", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createTestDb();
  });

  const confirmedDelivery = (): RecoveryDeliveryPort => ({
    deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
    reconcileIdentityRecovery: vi.fn(),
  });

  it("refuses the current contact, refuses an UNKNOWN contact, and admits once another owner holds it — before any delivery or journal work", async () => {
    const { target, survivor } = await identityFixture(db);
    await db.insert(subscriptions).values({
      workspaceId: target.workspace.id,
      stripeCustomerId: "cus_target",
      status: "active",
      billingContactUserId: target.user.id,
    });
    const params = { sessionId: "session-target-auth", idempotencyKey: "identity-billing-contact" } as const;

    const delivery = confirmedDelivery();
    const journal = confirmedJournal();
    await expect(
      requestIdentityDeletion(db, params, { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
    ).rejects.toThrow("deletion_refused:billing_contact_handover_required");

    // NULL is "unknown" — a mapping from before C3 — and is refused the same
    // way, because the unknown contact might be this person.
    await db.update(subscriptions).set({ billingContactUserId: null }).where(eq(subscriptions.workspaceId, target.workspace.id));
    await expect(
      requestIdentityDeletion(db, params, { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS })
    ).rejects.toThrow("deletion_refused:billing_contact_unknown");
    expect(delivery.deliverIdentityRecovery).not.toHaveBeenCalled();
    expect(journal.requests).toHaveLength(0);

    // Handed over: the request proceeds exactly as before.
    await db.update(subscriptions).set({ billingContactUserId: survivor.user.id }).where(eq(subscriptions.workspaceId, target.workspace.id));
    const result = await requestIdentityDeletion(db, params, {
      recoveryDelivery: delivery,
      journal: journal.port,
      activationExclusions: NO_ACTIVATION_EXCLUSIONS,
    });
    expect(result.acknowledged).toBe(true);
    expect(result.operation.state).toBe("tombstoned");
  });

  it("an UNKNOWN contact refuses every MEMBER of that workspace, a viewer included — only an owner can lift it", async () => {
    const { target, survivor } = await identityFixture(db);
    // A workspace the survivor owns and the target merely VIEWS; its customer
    // predates C3 (contact unknown).
    const [other] = await db.insert(workspaces).values({ name: "Viewed" }).returning();
    await db.insert(memberships).values([
      { userId: survivor.user.id, workspaceId: other!.id, role: "owner" },
      { userId: target.user.id, workspaceId: other!.id, role: "viewer" },
    ]);
    await db.insert(subscriptions).values({ workspaceId: other!.id, stripeCustomerId: "cus_viewed", status: "active", billingContactUserId: null });
    await expect(
      requestIdentityDeletion(
        db,
        { sessionId: "session-target-auth", idempotencyKey: "identity-viewer-unknown" },
        { recoveryDelivery: confirmedDelivery(), journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
      )
    ).rejects.toThrow("deletion_refused:billing_contact_unknown");
    // The owner accepts (the binding moves to the survivor); the viewer is admitted.
    await db.update(subscriptions).set({ billingContactUserId: survivor.user.id }).where(eq(subscriptions.workspaceId, other!.id));
    const result = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "identity-viewer-unknown" },
      { recoveryDelivery: confirmedDelivery(), journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(result.operation.state).toBe("tombstoned");
  });

  it("matches the binding by USER, not by membership: a contact who left the workspace is still refused", async () => {
    const { target, survivor } = await identityFixture(db);
    // A second workspace the survivor alone owns; the target once started its
    // Checkout and is still its contact, but holds no membership there now.
    const [other] = await db.insert(workspaces).values({ name: "Other" }).returning();
    await db.insert(memberships).values({ userId: survivor.user.id, workspaceId: other!.id, role: "owner" });
    await db.insert(subscriptions).values({
      workspaceId: other!.id,
      stripeCustomerId: "cus_other",
      status: "active",
      billingContactUserId: target.user.id,
    });
    await expect(
      requestIdentityDeletion(
        db,
        { sessionId: "session-target-auth", idempotencyKey: "identity-left-workspace" },
        { recoveryDelivery: confirmedDelivery(), journal: confirmedJournal().port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
      )
    ).rejects.toThrow("deletion_refused:billing_contact_handover_required");
    // The exported authority the executor calls at erasure: same two answers.
    await db.transaction(async (tx) => {
      await expect(assertBillingContactReleased(tx, target.user.id, [])).rejects.toThrow("billing_contact_handover_required");
      await expect(assertBillingContactReleased(tx, survivor.user.id, [])).resolves.toBeUndefined();
      // Unknown contact on a workspace this person belongs to: refused; on one
      // they do not belong to: not their problem.
      await tx.update(subscriptions).set({ billingContactUserId: null }).where(eq(subscriptions.workspaceId, other!.id));
      await expect(assertBillingContactReleased(tx, survivor.user.id, [other!.id])).rejects.toThrow("billing_contact_unknown");
      await expect(assertBillingContactReleased(tx, target.user.id, [target.workspace.id])).resolves.toBeUndefined();
    });
  });
});

describe("activation denominator through the real request path (learning gate, round-2 BLOCK)", () => {
  let db: TestDb;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("a requested-then-CANCELLED identity deletion never changes the signup count", async () => {
    const { target } = await identityFixture(db);
    const password = "activation-denominator-password";
    await db.insert(account).values({
      id: "credential-target-auth",
      accountId: "target-auth",
      providerId: "credential",
      userId: "target-auth",
      password: await hashPassword(password),
    });
    const signups = async () => {
      const rows = await deriveActivationCohorts(db, NO_ACTIVATION_EXCLUSIONS, new Date(NOW.getTime() + 2 * 24 * HOUR));
      return rows.reduce((n, r) => n + r.signups, 0);
    };
    const before = await signups();
    expect(before).toBeGreaterThan(0);
    let secret = "";
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        secret = request.secret;
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(),
    };
    const journal = confirmedJournal();
    const requested = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "identity-denominator" },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(requested.operation.state).toBe("tombstoned");
    // Tombstoned at request, contribution pending: counted from the capture.
    expect(await signups(), "pending").toBe(before);
    const rateLimitKeyDigest = "a".repeat(64);
    const recovery = await beginIdentityCancellationRecoverySession(db, requested.operation.id, secret, rateLimitKeyDigest);
    const proof = await createIdentityCancellationProofWithPassword(db, requested.operation.id, recovery.recoverySession, password, rateLimitKeyDigest);
    await cancelIdentityDeletion(
      db,
      requested.operation.id,
      secret,
      { proofId: proof.proofId, cancellationReceipt: proof.cancellationReceipt },
      { journal: journal.port, membershipRestore: { mayRestore: vi.fn(async () => ({ allowed: true, refusal: null })) } }
    );
    // Active again, the stale capture ignored: counted live, once.
    expect(await signups(), "cancelled").toBe(before);
    expect(
      (await db.select({ state: users.lifecycleState }).from(users).where(eq(users.id, target.user.id)))[0]!.state
    ).toBe("active");
    // REQUEST AGAIN. The cancelled operation still carries a `pending` capture
    // and the person is tombstoned once more; only the NEW operation's capture
    // may count (tenancy gate on fix pass 3: this counted 3 where 2 is right).
    await db.insert(session).values({
      id: "session-target-auth-2",
      token: "token-session-target-auth-2",
      userId: "target-auth",
      expiresAt: new Date(NOW.getTime() + HOUR),
      updatedAt: NOW,
      reauthenticatedAt: NOW,
      reauthenticatedMethod: "password",
    });
    const again = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth-2", idempotencyKey: "identity-denominator-again" },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(again.operation.state).toBe("tombstoned");
    expect(again.operation.id).not.toBe(requested.operation.id);
    expect(await signups(), "pending again, after a cancel").toBe(before);
  });
});

describe("the pending-states list is bound to the enum (consolidating review, round 2)", () => {
  it("PENDING_DELETION_STATES is exactly every operation state minus the two terminal ones", () => {
    const terminal = new Set(["complete", "cancelled"]);
    const expected = deletionOperationState.enumValues.filter((state) => !terminal.has(state)).sort();
    expect([...PENDING_DELETION_STATES].sort()).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Audit Phase 5 — the erasure lifecycle's dead ends (R-160 … R-163).
// ---------------------------------------------------------------------------

const REFUSING_DELIVERY: RecoveryDeliveryPort = {
  deliverIdentityRecovery: async () => {
    throw new Error("deletion_refused:no_delivery_in_this_test");
  },
  reconcileIdentityRecovery: async () => {
    throw new Error("deletion_refused:no_delivery_in_this_test");
  },
};

/** A journal whose FIRST append throws — the process dying after the reservation committed. */
function crashingOnceJournal() {
  const confirmed = confirmedJournal();
  let crashed = false;
  const port: DeletionJournalPort = {
    appendTransition: vi.fn(async (request) => {
      if (!crashed) {
        crashed = true;
        throw new Error("simulated process loss after the reservation committed");
      }
      return confirmed.port.appendTransition(request);
    }),
  };
  return { port, requests: confirmed.requests };
}

async function operationRow(db: TestDb, id: string): Promise<DeletionOperation> {
  const [row] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, id));
  return row!;
}

/**
 * Every session's proof stamped NOW, not at module load: the file-level `NOW`
 * the shared `addSession` default uses is minutes old by the time these tests
 * run in a loaded suite, and the reauthentication window is ten minutes — the
 * live run measured exactly that flake on the two slowest tests here.
 */
async function freshProofs(db: TestDb): Promise<void> {
  await db.update(session).set({ reauthenticatedAt: new Date(), expiresAt: new Date(Date.now() + HOUR) });
}

describe("Phase 5 — the erasure lifecycle reaches a terminal state", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("AC2/AC3 (R-161, R-163): no replacement workspace; the read grade sees the deletion; ANY page cancels it to exactly one workspace", async () => {
    const solo = await bootstrap(db, "solo-auth", "Solo");
    await freshProofs(db);
    const scope = await withWorkspace(db, { authUserId: "solo-auth" });
    const journal = confirmedJournal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-solo-auth", idempotencyKey: "solo-ws-delete", typedName: solo.workspace.name },
      journal.port
    );
    expect(requested.state).toBe("tombstoned");

    // The next render's bootstrap mints NOTHING: it returns the tombstoned
    // workspace as the existing authority (`bootstrap.test.ts` re-decides
    // the pinned replacement for the no-operation case).
    const again = await ensureUserWorkspace(db, { authUserId: "solo-auth", name: "Solo" });
    expect(again).toMatchObject({ created: false, workspace: { id: solo.workspace.id, lifecycleState: "tombstoned" } });
    expect(await db.select().from(memberships).where(eq(memberships.userId, solo.user.id))).toHaveLength(1);

    // The write grade refuses WITH A WAY FORWARD; the read grade mints.
    await expect(withWorkspace(db, { authUserId: "solo-auth" })).rejects.toBeInstanceOf(WorkspacePendingDeletionError);
    const read = await withWorkspace(db, { authUserId: "solo-auth" }, { grade: "read" });
    expect(isReadGradeScope(read)).toBe(true);
    expect(read.workspaceId).toBe(solo.workspace.id);
    const pending = await pendingDeletionsForScope(db, read);
    expect(pending.map((op) => op.id)).toEqual([requested.id]);

    // The cancel takes a session proof, never a scope (there is no write
    // scope to give it), and checks owner membership itself.
    const cancelled = await cancelScopedDeletion(db, requested.id, { sessionId: "session-solo-auth" }, journal.port);
    expect(cancelled.state).toBe("cancelled");
    const after = await withWorkspace(db, { authUserId: "solo-auth" });
    expect(isReadGradeScope(after)).toBe(false);
    expect(after.workspaceId).toBe(solo.workspace.id);
    expect(
      await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .innerJoin(memberships, eq(memberships.workspaceId, workspaces.id))
        .where(eq(memberships.userId, solo.user.id))
    ).toEqual([{ id: solo.workspace.id }]);
  });

  it("AC14 (R-165): cancelScopedDeletion runs the held-money replay AFTER its commit, once, for the restored workspace", async () => {
    const solo = await bootstrap(db, "held-port-auth", "Held Port");
    await freshProofs(db);
    const scope = await withWorkspace(db, { authUserId: "held-port-auth" });
    const journal = confirmedJournal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-held-port-auth", idempotencyKey: "held-port-ws", typedName: solo.workspace.name },
      journal.port
    );
    const seen: string[] = [];
    const heldMoney = {
      replayHeldEvents: vi.fn(async (workspaceId: string) => {
        // The cancellation has COMMITTED: the workspace the replay will mint
        // into is already active when it runs.
        const [row] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
        seen.push(`${workspaceId}:${row!.lifecycleState}`);
        return { replayed: 0, alreadySettled: 0, failed: 0, stillHeld: 0 };
      }),
    };
    await cancelScopedDeletion(db, requested.id, { sessionId: "session-held-port-auth" }, journal.port, { heldMoney });
    expect(seen).toEqual([`${solo.workspace.id}:active`]);
    expect(heldMoney.replayHeldEvents).toHaveBeenCalledTimes(1);
  });

  it("R-161: the requesterUserId arm keeps a scoped request visible from ANOTHER workspace's page", async () => {
    const { target, survivor } = await identityFixture(db);
    await freshProofs(db);
    await db.insert(memberships).values({ userId: target.user.id, workspaceId: survivor.workspace.id, role: "owner" });
    const survivorWorkspaceScope = await withWorkspace(db, { authUserId: "target-auth", workspaceId: survivor.workspace.id });
    const journal = confirmedJournal();
    const requested = await requestWorkspaceDeletion(
      db,
      survivorWorkspaceScope,
      { sessionId: "session-target-auth", idempotencyKey: "cross-ws-delete", typedName: survivor.workspace.name },
      journal.port
    );
    const ownScope = await withWorkspace(db, { authUserId: "target-auth", workspaceId: target.workspace.id });
    // Neither the workspace arm (another workspace) nor the user arm (NULL on
    // a scoped row, by schema) matches; the requester arm does.
    expect((await pendingDeletionsForScope(db, ownScope)).map((op) => op.id)).toEqual([requested.id]);
  });

  it("R-162 (P5-R5): ANY active owner cancels; a non-owner is refused; the canceller need not be the requester", async () => {
    const { target, survivor } = await identityFixture(db);
    await freshProofs(db);
    await seedAuthUser(db, "editor-auth");
    const editor = await ensureUserWorkspace(db, { authUserId: "editor-auth", name: "Editor" });
    await addSession(db, "editor-auth", "session-editor-auth");
    await db.insert(memberships).values({ userId: editor.user.id, workspaceId: target.workspace.id, role: "editor" });
    const scope = await withWorkspace(db, { authUserId: "target-auth", workspaceId: target.workspace.id });
    const journal = confirmedJournal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-target-auth", idempotencyKey: "co-owner-cancel", typedName: target.workspace.name },
      journal.port
    );
    await expect(
      cancelScopedDeletion(db, requested.id, { sessionId: "session-editor-auth" }, journal.port)
    ).rejects.toThrow("deletion_refused:owner_required");
    const cancelled = await cancelScopedDeletion(db, requested.id, { sessionId: "session-survivor-auth" }, journal.port);
    expect(cancelled).toMatchObject({ state: "cancelled", requesterUserId: target.user.id });
    expect(survivor.user.id).not.toBe(target.user.id);
  });

  it("AC5 (R-162): a real BLOCKED operation cancels through cancelScopedDeletion; one blocked on erasure refuses", async () => {
    const solo = await bootstrap(db, "blocked-auth", "Blocked");
    await freshProofs(db);
    const scope = await withWorkspace(db, { authUserId: "blocked-auth" });
    const journal = confirmedJournal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-blocked-auth", idempotencyKey: "blocked-ws", typedName: solo.workspace.name },
      journal.port
    );
    await transitionDeletionOperation(db, requested.id, "external_actions_pending", journal.port);
    const blocked = await transitionDeletionOperation(db, requested.id, "blocked", journal.port);
    expect(blocked).toMatchObject({ state: "blocked", blockedResumeState: "external_actions_pending" });
    // The real path: prepareJournalPlan → appendJournalTransitionInTx's
    // blocked guard (which refused `blocked_reconciliation_target_mismatch`
    // here until R-162) → the workspace restored.
    const cancelled = await cancelScopedDeletion(db, requested.id, { sessionId: "session-blocked-auth" }, journal.port);
    expect(cancelled).toMatchObject({ state: "cancelled", blockedResumeState: null });
    expect(journal.requests.at(-1)).toMatchObject({ fromState: "blocked", toState: "cancelled" });
    expect((await db.select().from(workspaces).where(eq(workspaces.id, solo.workspace.id)))[0]!.lifecycleState).toBe("active");

    // Blocked on IRREVERSIBLE work never cancels.
    const second = await bootstrap(db, "blocked-erasing-auth", "Blocked Erasing");
    await freshProofs(db);
    const secondScope = await withWorkspace(db, { authUserId: "blocked-erasing-auth" });
    const op = await requestWorkspaceDeletion(
      db,
      secondScope,
      { sessionId: "session-blocked-erasing-auth", idempotencyKey: "blocked-erasing-ws", typedName: second.workspace.name },
      journal.port
    );
    await db
      .update(deletionOperations)
      .set({ state: "blocked", blockedResumeState: "erasing" })
      .where(eq(deletionOperations.id, op.id));
    await expect(
      cancelScopedDeletion(db, op.id, { sessionId: "session-blocked-erasing-auth" }, journal.port)
    ).rejects.toThrow("deletion_refused:erasure_started");
  });

  it("AC6 (R-162): a crash between a reservation and its transaction is finished by the worker sweep — scoped, identity and cancellation", async () => {
    // (1) A scoped request: the reservation committed, the tombstone
    // transaction's first journal append died with the process.
    const solo = await bootstrap(db, "wedge-auth", "Wedge");
    await freshProofs(db);
    const scope = await withWorkspace(db, { authUserId: "wedge-auth" });
    const crashing = crashingOnceJournal();
    await expect(
      requestWorkspaceDeletion(
        db,
        scope,
        { sessionId: "session-wedge-auth", idempotencyKey: "wedge-ws", typedName: solo.workspace.name },
        crashing.port
      )
    ).rejects.toThrow("simulated process loss");
    const [wedged] = await db.select().from(deletionOperations).where(eq(deletionOperations.idempotencyKey, "wedge-ws"));
    expect(wedged).toMatchObject({ state: "requested" });
    expect(wedged!.journalIntentPlanDigest).toMatch(/^[0-9a-f]{64}$/);

    // (2) An identity request wedged the same way.
    const { target } = await identityFixture(db);
    await freshProofs(db);
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
      reconcileIdentityRecovery: vi.fn(),
    };
    const identityCrash = crashingOnceJournal();
    await expect(
      requestIdentityDeletion(
        db,
        { sessionId: "session-target-auth", idempotencyKey: "wedge-identity" },
        { recoveryDelivery: delivery, journal: identityCrash.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
      )
    ).rejects.toThrow("simulated process loss");
    const [wedgedIdentity] = await db
      .select()
      .from(deletionOperations)
      .where(and(eq(deletionOperations.scope, "identity"), eq(deletionOperations.userId, target.user.id)));
    expect(wedgedIdentity).toMatchObject({ state: "requested" });

    // Nothing else could finish these: the executor claims only acknowledged
    // operations. The sweep (no session, no scope) does — from a DIFFERENT
    // journal instance, as a restarted worker would hold.
    const restarted = confirmedJournal();
    const outcomes = await resumeWedgedDeletionOperations(
      db,
      { journal: restarted.port, recoveryDelivery: REFUSING_DELIVERY, membershipRestore: NO_SEAT_CAP_RESTORE_POLICY },
      { olderThanMs: 0 }
    );
    expect(outcomes.filter((o) => o.result === "resumed").map((o) => `${o.seam}:${o.code}`).sort()).toEqual([
      "identity_request:tombstoned",
      "scoped_request:tombstoned",
    ]);
    expect(outcomes.filter((o) => o.result === "refused")).toEqual([]);
    expect((await operationRow(db, wedged!.id)).state).toBe("tombstoned");
    expect((await operationRow(db, wedgedIdentity!.id)).state).toBe("tombstoned");

    // (3) A cancellation wedged after ITS reservation.
    const cancelCrash = crashingOnceJournal();
    await expect(
      cancelScopedDeletion(db, wedged!.id, { sessionId: "session-wedge-auth" }, cancelCrash.port)
    ).rejects.toThrow("simulated process loss");
    expect((await operationRow(db, wedged!.id)).state).toBe("tombstoned");
    const second = await resumeWedgedDeletionOperations(
      db,
      { journal: restarted.port, recoveryDelivery: REFUSING_DELIVERY, membershipRestore: NO_SEAT_CAP_RESTORE_POLICY },
      { olderThanMs: 0 }
    );
    expect(second.find((o) => o.operationId === wedged!.id)).toMatchObject({
      seam: "scoped_cancellation",
      result: "resumed",
      code: "cancelled",
    });
    expect((await operationRow(db, wedged!.id)).state).toBe("cancelled");
    // ...and a reservation younger than the threshold is left to its live path.
    expect(
      await resumeWedgedDeletionOperations(db, {
        journal: restarted.port,
        recoveryDelivery: REFUSING_DELIVERY,
        membershipRestore: NO_SEAT_CAP_RESTORE_POLICY,
      })
    ).toEqual([]);
  });

  it("AC6 (R-162): a wedged IDENTITY CANCELLATION — a reservation that is none of the executor's plans — is classified and resumed by the sweep", async () => {
    const { target } = await identityFixture(db);
    await freshProofs(db);
    const password = "phase-5-wedged-cancel-password";
    await db.insert(account).values({
      id: "credential-target-auth",
      accountId: "target-auth",
      providerId: "credential",
      userId: "target-auth",
      password: await hashPassword(password),
    });
    let secret = "";
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        secret = request.secret;
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(),
    };
    const journal = confirmedJournal();
    const identity = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "wedged-identity-cancel" },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(identity.operation.state).toBe("tombstoned");
    const rateLimitKeyDigest = sha("phase-5-wedged-cancel-client");
    const recovery = await beginIdentityCancellationRecoverySession(db, identity.operation.id, secret, rateLimitKeyDigest);
    const proof = await createIdentityCancellationProofWithPassword(
      db,
      identity.operation.id,
      recovery.recoverySession,
      password,
      rateLimitKeyDigest
    );
    // The cancellation's reservation commits; its journal append dies.
    const crashing = crashingOnceJournal();
    await expect(
      cancelIdentityDeletion(
        db,
        identity.operation.id,
        secret,
        { proofId: proof.proofId, cancellationReceipt: proof.cancellationReceipt },
        { journal: crashing.port, membershipRestore: NO_SEAT_CAP_RESTORE_POLICY }
      )
    ).rejects.toThrow("simulated process loss");
    const wedged = await operationRow(db, identity.operation.id);
    expect(wedged.state).toBe("tombstoned");
    // THE SHAPE: a reservation on an identity row that is NOT any of the
    // executor's one-step transition plans from this state.
    expect(wedged.journalIntentPlanDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(
      ["external_actions_pending", "blocked"].map((to) =>
        sha(JSON.stringify({ schema: 1, steps: [{ from: "tombstoned", to }] }))
      )
    ).not.toContain(wedged.journalIntentPlanDigest);

    const outcomes = await resumeWedgedDeletionOperations(
      db,
      { journal: confirmedJournal().port, recoveryDelivery: REFUSING_DELIVERY, membershipRestore: NO_SEAT_CAP_RESTORE_POLICY },
      { olderThanMs: 0 }
    );
    expect(outcomes).toEqual([
      { operationId: identity.operation.id, scope: "identity", seam: "identity_cancellation", result: "resumed", code: "cancelled" },
    ]);
    expect((await operationRow(db, identity.operation.id)).state).toBe("cancelled");
    expect(
      (await db.select().from(memberships).where(eq(memberships.userId, target.user.id))).map((m) => m.lifecycleState)
    ).toEqual(["active"]);
  });

  it("AC6 (R-162): an executor's OWN identity reservation is left to the executor, never resumed as a cancellation", async () => {
    await identityFixture(db);
    await freshProofs(db);
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => confirmedDeliveryResult(request)),
      reconcileIdentityRecovery: vi.fn(),
    };
    const journal = confirmedJournal();
    const identity = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "executor-reservation" },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    // The executor's tombstoned -> external_actions_pending plan, reserved and
    // then interrupted (its next tick would resume it with the same plan).
    const crashing = crashingOnceJournal();
    await expect(
      transitionDeletionOperation(db, identity.operation.id, "external_actions_pending", crashing.port)
    ).rejects.toThrow("simulated process loss");
    expect((await operationRow(db, identity.operation.id)).journalIntentPlanDigest).toMatch(/^[0-9a-f]{64}$/);
    const outcomes = await resumeWedgedDeletionOperations(
      db,
      { journal: confirmedJournal().port, recoveryDelivery: REFUSING_DELIVERY, membershipRestore: NO_SEAT_CAP_RESTORE_POLICY },
      { olderThanMs: 0 }
    );
    expect(outcomes).toEqual([
      { operationId: identity.operation.id, scope: "identity", seam: null, result: "skipped", code: "not_a_wedge" },
    ]);
    expect((await operationRow(db, identity.operation.id)).state).toBe("tombstoned");
  });

  it("AC10 (P5-R6): a delivery-retry rotation RESETS recoveryExpiresAt — two rotations, the second later than the first", async () => {
    await bootstrap(db, "rotate-auth", "Rotate");
    await bootstrap(db, "rotate-co-auth", "Rotate Co");
    const failing: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async () => ({
        outcome: "failed" as const,
        failureCode: "provider_rejected" as const,
      })),
      reconcileIdentityRecovery: vi.fn(),
    };
    const params = { sessionId: "session-rotate-auth", idempotencyKey: "rotate-identity" } as const;
    const journal = confirmedJournal();
    const expiries: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await requestIdentityDeletion(db, params, {
        recoveryDelivery: failing,
        journal: journal.port,
        activationExclusions: NO_ACTIVATION_EXCLUSIONS,
      });
      expect(result).toMatchObject({ acknowledged: false, delivery: "failed" });
      expiries.push(result.operation.recoveryExpiresAt!.getTime());
    }
    // The first value is the creation; the next two are ROTATIONS.
    expect(expiries[1]).toBeGreaterThan(expiries[0]!);
    expect(expiries[2]).toBeGreaterThan(expiries[1]!);
    expect(journal.requests).toHaveLength(0);
  });

  it("P5-R5: workspace-then-identity — the identity cancellation restores the membership INTO the pending-deletion workspace, and its owner cancels it; nothing stays suspended", async () => {
    const { target, survivor } = await identityFixture(db);
    await freshProofs(db);
    // The target is the SOLE owner of a second workspace too — the survivor's
    // co-ownership covers only `target.workspace`.
    await db.delete(memberships).where(and(eq(memberships.userId, survivor.user.id), eq(memberships.workspaceId, target.workspace.id)));
    const password = "phase-5-restore-password";
    await db.insert(account).values({
      id: "credential-target-auth",
      accountId: "target-auth",
      providerId: "credential",
      userId: "target-auth",
      password: await hashPassword(password),
    });
    const journal = confirmedJournal();
    const scope = await withWorkspace(db, { authUserId: "target-auth" });
    const workspaceOp = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-target-auth", idempotencyKey: "ws-then-identity", typedName: target.workspace.name },
      journal.port
    );
    let secret = "";
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        secret = request.secret;
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(),
    };
    // The workspace is ALREADY deleting, so it is not in the last-owner
    // population and is not cascaded a second time.
    const identity = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "identity-after-ws" },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    expect(identity.operation.state).toBe("tombstoned");
    const [suspended] = await db.select().from(memberships).where(eq(memberships.userId, target.user.id));
    expect(suspended!.lifecycleState).toBe("deletion_suspended");

    const rateLimitKeyDigest = sha("phase-5-restore-client");
    const recovery = await beginIdentityCancellationRecoverySession(db, identity.operation.id, secret, rateLimitKeyDigest);
    const proof = await createIdentityCancellationProofWithPassword(
      db,
      identity.operation.id,
      recovery.recoverySession,
      password,
      rateLimitKeyDigest
    );
    const report = await cancelIdentityDeletion(
      db,
      identity.operation.id,
      secret,
      { proofId: proof.proofId, cancellationReceipt: proof.cancellationReceipt },
      { journal: journal.port, membershipRestore: NO_SEAT_CAP_RESTORE_POLICY }
    );
    // ONE STATE, NOT TWO THAT DRIFT: restored, though the workspace is still
    // tombstoned — it was `workspace_unavailable` and stranded before R-162.
    expect(report.restoredMembershipIds).toEqual([suspended!.id]);
    expect(report.conflicts).toEqual([]);
    const status = await readIdentityCancellationStatus(db, identity.operation.id, proof.cancellationReceipt);
    expect(status).toMatchObject({ restoredMembershipIds: [suspended!.id], conflicts: [] });
    // The person signs in again: the read grade shows the deletion, and they
    // cancel it with a fresh session.
    await addSession(db, "target-auth", "session-target-again");
    await freshProofs(db);
    const read = await withWorkspace(db, { authUserId: "target-auth" }, { grade: "read" });
    expect((await pendingDeletionsForScope(db, read)).map((op) => op.id)).toEqual([workspaceOp.id]);
    await cancelScopedDeletion(db, workspaceOp.id, { sessionId: "session-target-again" }, journal.port, {
      membershipRestore: NO_SEAT_CAP_RESTORE_POLICY,
    });
    expect(await db.select().from(memberships).where(eq(memberships.lifecycleState, "deletion_suspended"))).toEqual([]);
  });

  it.each([
    ["erasing", { state: "erasing" as const }],
    // R-166 (gate M2): `blocked` on the way to erasing is outside the window too.
    ["blocked, resuming into erasing", { state: "blocked" as const, blockedResumeState: "erasing" as const }],
  ])("P5-R5: a membership the identity cancellation could NOT restore (workspace deletion %s) has a second way out when its workspace's deletion is cancelled", async (_label, plant) => {
    const { target, survivor } = await identityFixture(db);
    await freshProofs(db);
    const journal = confirmedJournal();
    const password = "phase-5-stranded-password";
    await db.insert(account).values({
      id: "credential-target-auth",
      accountId: "target-auth",
      providerId: "credential",
      userId: "target-auth",
      password: await hashPassword(password),
    });
    // The target co-owns `target.workspace` with the survivor, and requests
    // its deletion, then their own account's.
    const scope = await withWorkspace(db, { authUserId: "target-auth" });
    const workspaceOp = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-target-auth", idempotencyKey: "stranded-ws", typedName: target.workspace.name },
      journal.port
    );
    let secret = "";
    const delivery: RecoveryDeliveryPort = {
      deliverIdentityRecovery: vi.fn(async (request) => {
        secret = request.secret;
        return confirmedDeliveryResult(request);
      }),
      reconcileIdentityRecovery: vi.fn(),
    };
    const identity = await requestIdentityDeletion(
      db,
      { sessionId: "session-target-auth", idempotencyKey: "stranded-identity" },
      { recoveryDelivery: delivery, journal: journal.port, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
    );
    // A state the first path cannot restore into (the workspace's deletion
    // already erasing, as it could be by the time the person returns) —
    // planted directly, then put back, so the SECOND path is what is tested.
    await db.update(deletionOperations).set(plant).where(eq(deletionOperations.id, workspaceOp.id));
    const rateLimitKeyDigest = sha("phase-5-stranded-client");
    const recovery = await beginIdentityCancellationRecoverySession(db, identity.operation.id, secret, rateLimitKeyDigest);
    const proof = await createIdentityCancellationProofWithPassword(db, identity.operation.id, recovery.recoverySession, password, rateLimitKeyDigest);
    const report = await cancelIdentityDeletion(
      db,
      identity.operation.id,
      secret,
      { proofId: proof.proofId, cancellationReceipt: proof.cancellationReceipt },
      { journal: journal.port, membershipRestore: NO_SEAT_CAP_RESTORE_POLICY }
    );
    expect(report.conflicts.map((c) => c.outcome)).toEqual(["workspace_unavailable"]);
    // The conflict is what `/recover-deletion` now renders — not "no
    // memberships were restored" as if nothing were wrong.
    const status = await readIdentityCancellationStatus(db, identity.operation.id, proof.cancellationReceipt);
    expect(status.conflicts.map((c) => c.outcome)).toEqual(["workspace_unavailable"]);
    await db
      .update(deletionOperations)
      .set({ state: "grace", blockedResumeState: null })
      .where(eq(deletionOperations.id, workspaceOp.id));
    // The co-owner cancels the workspace deletion; the stranded membership
    // comes back with it.
    await cancelScopedDeletion(db, workspaceOp.id, { sessionId: "session-survivor-auth" }, journal.port, {
      membershipRestore: NO_SEAT_CAP_RESTORE_POLICY,
    });
    const [restored] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, target.user.id), eq(memberships.workspaceId, target.workspace.id)));
    expect(restored).toMatchObject({ lifecycleState: "active", role: "owner", suspensionOperationId: null });
    const [snapshot] = await db
      .select()
      .from(deletionMembershipSnapshots)
      .where(eq(deletionMembershipSnapshots.operationId, identity.operation.id));
    expect(snapshot!.outcome).toBe("restored");
    // R-166 (gate M4): the CO-OWNER cancelled, not the requester — and the
    // receipt records who, by id and by digest, in the reserving transaction.
    const [cancelledOp] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, workspaceOp.id));
    expect(cancelledOp).toMatchObject({
      state: "cancelled",
      requesterUserId: target.user.id,
      cancelledByUserId: survivor.user.id,
      cancelledByDigest: sha(`respin:deletion-requester:v1:${survivor.user.id}`),
    });
  });
});

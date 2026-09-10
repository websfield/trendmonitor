// R-119 cancellation recovery rate limiting on REAL Postgres.
//
// PGlite has one session, so a shared-key COUNT+INSERT test there is only a
// sequential approximation. These racers target different identity operations:
// the per-operation locks cannot serialize them, and the pseudonymous shared
// rate-key lock is therefore the only mechanism that can hold the global cap.
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { session } from "../src/auth-schema";
import { NO_ACTIVATION_EXCLUSIONS } from "../src/activation";
import {
  beginIdentityCancellationRecoverySession,
  CANCELLATION_FACTOR_MAX_ATTEMPTS,
} from "../src/auth-lifecycle";
import { ensureUserWorkspace } from "../src/bootstrap";
import {
  requestIdentityDeletion,
  resumeIdentityDeletionRequest,
} from "../src/deletion-lifecycle";
import {
  journalReceiptDigest,
  journalRequestChecksum,
  type DeletionJournalPort,
  type RecoveryDeliveryPort,
} from "../src/deletion-ports";
import { deletionOperations, deletionRecoverySessions } from "../src/lifecycle-schema";
import { lockWorkspaceMembershipGraph } from "../src/membership-lifecycle";
import { memberships, users } from "../src/schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[deletion-recovery-concurrency.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: concurrent cancellation-recovery sessions across different " +
      "identity operations cannot exceed the shared pseudonymous client-key cap."
  );
}

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function expectCheckViolation(
  run: Promise<unknown>,
  constraint: string
): Promise<void> {
  const error = await run.then(
    () => null,
    (caught) => caught as { cause?: { code?: string; constraint?: string } }
  );
  expect(error, `${constraint} must refuse the write`).not.toBeNull();
  expect(error!.cause?.code).toBe("23514");
  expect(error!.cause?.constraint).toBe(constraint);
}

const journal: DeletionJournalPort = {
  appendTransition: async (request) => {
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
  },
};

describe.skipIf(!MAINTENANCE_URL)(
  "identity cancellation recovery rate key on real Postgres",
  () => {
    let harness: Awaited<ReturnType<typeof createDockerTestDb>>;

    beforeAll(async () => {
      harness = await createDockerTestDb(
        MAINTENANCE_URL as string,
        "respin_test_deletionrecovery"
      );
    }, 60_000);

    afterAll(async () => {
      await harness?.pool.end();
    });

    it(
      "six invalid-secret racers sharing one rate key durably consume exactly five attempts",
      { timeout: 120_000 },
      async () => {
        const { db } = harness;
        await seedAuthUser(db, "recovery-survivor");
        const survivor = await ensureUserWorkspace(db, {
          authUserId: "recovery-survivor",
          name: "Recovery Survivor",
        });
        const secrets = new Map<string, string>();
        const recoveryDelivery: RecoveryDeliveryPort = {
          deliverIdentityRecovery: async (request) => {
            secrets.set(request.operationId, request.secret);
            const deliveredAt = new Date();
            return {
              outcome: "confirmed" as const,
              operationId: request.operationId,
              commandId: request.commandId,
              attempt: request.attempt,
              secretDigest: request.secretDigest,
              recipientDigest: request.recipientDigest,
              expiresAt: request.expiresAt,
              deliveredAt,
              deliveryReceiptDigest: sha(
                `delivery:${request.commandId}:${request.attempt}`
              ),
            };
          },
          reconcileIdentityRecovery: async () => ({
            outcome: "failed" as const,
            failureCode: "provider_rejected" as const,
          }),
        };

        const operations: { operationId: string; secret: string }[] = [];
        for (let index = 0; index < 6; index += 1) {
          const authUserId = `recovery-target-${index}`;
          await seedAuthUser(db, authUserId);
          const target = await ensureUserWorkspace(db, {
            authUserId,
            name: `Recovery Target ${index}`,
          });
          await db.insert(memberships).values({
            userId: survivor.user.id,
            workspaceId: target.workspace.id,
            role: "owner",
          });
          const reauthenticatedAt = new Date();
          const sessionId = `recovery-session-${index}`;
          await db.insert(session).values({
            id: sessionId,
            token: `recovery-token-${index}`,
            userId: authUserId,
            expiresAt: new Date(reauthenticatedAt.getTime() + 60 * 60 * 1_000),
            reauthenticatedAt,
            updatedAt: reauthenticatedAt,
          });
          const requested = await requestIdentityDeletion(
            db,
            {
              sessionId,
              idempotencyKey: `recovery-rate-race-${index}`,
            },
            { recoveryDelivery, journal, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
          );
          const secret = secrets.get(requested.operation.id);
          expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
          operations.push({ operationId: requested.operation.id, secret: secret! });
        }

        const clients = await Promise.all(
          Array.from({ length: 6 }, () => harness.pool.connect())
        );
        for (const client of clients) client.release();

        const rateLimitKeyDigest = sha("one-shared-pseudonymous-client");
        const wrongSecret = Buffer.alloc(32, 0x5a).toString("base64url");
        const attempts = await Promise.allSettled(
          operations.map(({ operationId }) =>
            beginIdentityCancellationRecoverySession(
              db,
              operationId,
              wrongSecret,
              rateLimitKeyDigest
            )
          )
        );
        expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(0);
        expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(6);
        expect(
          await db
            .select({ consumedAt: deletionRecoverySessions.consumedAt })
            .from(deletionRecoverySessions)
            .where(eq(deletionRecoverySessions.rateLimitKeyDigest, rateLimitKeyDigest))
        ).toEqual(
          Array.from({ length: CANCELLATION_FACTOR_MAX_ATTEMPTS }, () => ({
            consumedAt: expect.any(Date),
          }))
        );
        await expect(
          beginIdentityCancellationRecoverySession(
            db,
            operations[0]!.operationId,
            operations[0]!.secret,
            rateLimitKeyDigest
          )
        ).rejects.toThrow("auth_lifecycle_refused");
      }
    );

    it(
      "rechecks last-owner status in the reserved request's final transaction",
      { timeout: 120_000 },
      async () => {
        const { db } = harness;
        await seedAuthUser(db, "owner-race-target");
        const target = await ensureUserWorkspace(db, {
          authUserId: "owner-race-target",
          name: "Owner Race Target",
        });
        await seedAuthUser(db, "owner-race-survivor");
        const survivor = await ensureUserWorkspace(db, {
          authUserId: "owner-race-survivor",
          name: "Owner Race Survivor",
        });
        const [survivorTargetMembership] = await db
          .insert(memberships)
          .values({
            userId: survivor.user.id,
            workspaceId: target.workspace.id,
            role: "owner",
          })
          .returning({ id: memberships.id });
        const sessionId = "owner-race-target-session";
        const reauthenticatedAt = new Date();
        await db.insert(session).values({
          id: sessionId,
          token: "owner-race-target-token",
          userId: "owner-race-target",
          expiresAt: new Date(reauthenticatedAt.getTime() + 60 * 60 * 1_000),
          reauthenticatedAt,
          updatedAt: reauthenticatedAt,
        });
        const recoveryDelivery: RecoveryDeliveryPort = {
          deliverIdentityRecovery: async (request) => ({
            outcome: "confirmed" as const,
            operationId: request.operationId,
            commandId: request.commandId,
            attempt: request.attempt,
            secretDigest: request.secretDigest,
            recipientDigest: request.recipientDigest,
            expiresAt: request.expiresAt,
            deliveredAt: new Date(),
            deliveryReceiptDigest: sha(`owner-race:${request.commandId}`),
          }),
          reconcileIdentityRecovery: async () => ({
            outcome: "failed" as const,
            failureCode: "provider_rejected" as const,
          }),
        };
        const params = {
          sessionId,
          idempotencyKey: "owner-race-reserved-request",
        } as const;
        await expect(
          requestIdentityDeletion(db, params, {
            activationExclusions: NO_ACTIVATION_EXCLUSIONS,
            recoveryDelivery,
            journal: {
              appendTransition: async () => ({
                outcome: "unknown" as const,
                reconciliationKey: "owner-race-reservation",
              }),
            },
          })
        ).rejects.toThrow("deletion_refused:journal_unknown");
        const [reserved] = await db
          .select()
          .from(deletionOperations)
          .where(eq(deletionOperations.idempotencyKey, params.idempotencyKey));
        expect(reserved).toMatchObject({
          state: "requested",
          journalIntentPlanDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        });

        let releaseWorkspaceLock!: () => void;
        const mayRemoveOwner = new Promise<void>((resolve) => {
          releaseWorkspaceLock = resolve;
        });
        let reportWorkspaceLock!: () => void;
        const workspaceLocked = new Promise<void>((resolve) => {
          reportWorkspaceLock = resolve;
        });
        const removeSurvivor = db.transaction(async (tx) => {
          await lockWorkspaceMembershipGraph(tx, target.workspace.id);
          reportWorkspaceLock();
          await mayRemoveOwner;
          await tx
            .delete(memberships)
            .where(eq(memberships.id, survivorTargetMembership!.id));
        });
        await workspaceLocked;

        const replayJournalRequests: unknown[] = [];
        const replayJournal: DeletionJournalPort = {
          appendTransition: async (request) => {
            replayJournalRequests.push(request);
            return journal.appendTransition(request);
          },
        };
        let replaySettled = false;
        const replay = resumeIdentityDeletionRequest(db, reserved!.id, {
          recoveryDelivery,
          journal: replayJournal,
        }).finally(() => {
          replaySettled = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(replaySettled).toBe(false);
        expect(replayJournalRequests).toHaveLength(0);

        releaseWorkspaceLock();
        await removeSurvivor;
        await expect(replay).rejects.toThrow("deletion_refused:last_owner");
        expect(replayJournalRequests).toHaveLength(0);
        expect(
          await db
            .select({ state: deletionOperations.state })
            .from(deletionOperations)
            .where(eq(deletionOperations.id, reserved!.id))
        ).toEqual([{ state: "requested" }]);
        expect(
          await db
            .select({ state: users.lifecycleState })
            .from(users)
            .where(eq(users.id, target.user.id))
        ).toEqual([{ state: "active" }]);
      }
    );

    it(
      "rejects NULL-bypass deletion authority and journal shapes on real Postgres",
      { timeout: 120_000 },
      async () => {
        const { db } = harness;
        await seedAuthUser(db, "constraint-survivor");
        const survivor = await ensureUserWorkspace(db, {
          authUserId: "constraint-survivor",
          name: "Constraint Survivor",
        });
        await seedAuthUser(db, "constraint-target");
        const target = await ensureUserWorkspace(db, {
          authUserId: "constraint-target",
          name: "Constraint Target",
        });
        await db.insert(memberships).values({
          userId: survivor.user.id,
          workspaceId: target.workspace.id,
          role: "owner",
        });
        const sessionId = "constraint-target-session";
        const reauthenticatedAt = new Date();
        await db.insert(session).values({
          id: sessionId,
          token: "constraint-target-token",
          userId: "constraint-target",
          expiresAt: new Date(reauthenticatedAt.getTime() + 60 * 60 * 1_000),
          reauthenticatedAt,
          updatedAt: reauthenticatedAt,
        });
        const recoveryDelivery: RecoveryDeliveryPort = {
          deliverIdentityRecovery: async (request) => ({
            outcome: "confirmed" as const,
            operationId: request.operationId,
            commandId: request.commandId,
            attempt: request.attempt,
            secretDigest: request.secretDigest,
            recipientDigest: request.recipientDigest,
            expiresAt: request.expiresAt,
            deliveredAt: new Date(),
            deliveryReceiptDigest: sha(`constraint:${request.commandId}`),
          }),
          reconcileIdentityRecovery: async () => ({
            outcome: "failed" as const,
            failureCode: "provider_rejected" as const,
          }),
        };
        const identity = await requestIdentityDeletion(
          db,
          { sessionId, idempotencyKey: "constraint-identity" },
          { recoveryDelivery, journal, activationExclusions: NO_ACTIVATION_EXCLUSIONS }
        );
        const [workspaceOperation] = await db
          .insert(deletionOperations)
          .values({
            scope: "workspace",
            targetKey: `workspace:${survivor.workspace.id}`,
            workspaceId: survivor.workspace.id,
            requesterUserId: survivor.user.id,
            requesterDigest: sha(`respin:deletion-requester:v1:${survivor.user.id}`),
            requestSessionDigest: sha("constraint-workspace-session"),
            requestMembershipVersion: 1,
            requestWorkspaceLifecycleVersion: 1,
            idempotencyKey: "constraint-workspace",
            payloadHash: sha("constraint-workspace"),
          })
          .returning({ id: deletionOperations.id });

        await expectCheckViolation(
          db.execute(
            sql`UPDATE deletion_operations SET request_session_digest = NULL WHERE id = ${identity.operation.id}`
          ),
          "deletion_operations_request_session_digest_shape"
        );
        await expectCheckViolation(
          db.execute(
            sql`UPDATE deletion_operations SET request_session_digest = NULL WHERE id = ${workspaceOperation.id}`
          ),
          "deletion_operations_request_session_digest_shape"
        );
        await expectCheckViolation(
          db.execute(
            sql`UPDATE deletion_operations SET request_membership_version = NULL WHERE id = ${workspaceOperation.id}`
          ),
          "deletion_operations_request_authority_epoch_shape"
        );
        await expectCheckViolation(
          db.execute(
            sql`UPDATE deletion_operations SET journal_intent_base_version = 0, journal_intent_plan_digest = NULL, journal_intent_effective_at = clock_timestamp() WHERE id = ${workspaceOperation.id}`
          ),
          "deletion_operations_journal_intent_shape"
        );
        await expectCheckViolation(
          db.execute(
            sql`UPDATE deletion_operations SET recovery_delivery_recipient_digest = NULL WHERE id = ${identity.operation.id}`
          ),
          "deletion_operations_recovery_delivery_shape"
        );
        await expectCheckViolation(
          db.execute(
            sql`UPDATE deletion_operations SET state = 'cancelled' WHERE id = ${workspaceOperation.id}`
          ),
          "deletion_operations_cancellation_replay_shape"
        );
      }
    );
  }
);

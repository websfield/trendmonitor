// Phase 10b-1 Task 4.1 — the external-command outbox.
//
// Every assertion here is about durable state: a command identity exists
// before the provider is called, an unknown outcome blocks, a terminal outcome
// cannot be rewritten, and a racing dispatcher never reaches the provider.
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import {
  assertNoUnknownExternalCommands,
  dispatchExternalCommands,
  enqueueExternalCommandInTx,
  EXTERNAL_COMMAND_KINDS,
  EXTERNAL_COMMAND_PHASE_BY_KIND,
  externalCommandSummary,
  recordExternalCommandOutcome,
  retryFailedExternalCommandInTx,
  type ExternalCommandPort,
} from "../src/deletion-external-commands";
import {
  deletionExternalCommands,
  deletionOperations,
  type DeletionOperation,
  type DeletionOperationState,
} from "../src/lifecycle-schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function workspaceOperation(
  db: TestDb,
  state: DeletionOperationState,
  suffix = "a"
): Promise<DeletionOperation> {
  const authUserId = `owner-${suffix}`;
  await seedAuthUser(db, authUserId);
  const { user, workspace } = await ensureUserWorkspace(db, {
    authUserId,
    name: `Owner ${suffix}`,
  });
  const terminal = state === "complete" || state === "cancelled";
  const [operation] = await db
    .insert(deletionOperations)
    .values({
      scope: "workspace",
      targetKey: `workspace:${workspace.id}`,
      workspaceId: workspace.id,
      requesterUserId: user.id,
      requesterDigest: sha(`requester:${user.id}`),
      requestSessionDigest: terminal ? null : sha(`session:${suffix}`),
      requestMembershipVersion: 1,
      requestWorkspaceLifecycleVersion: 1,
      idempotencyKey: `workspace-delete-${suffix}`,
      payloadHash: sha(`payload:${suffix}`),
      state,
      ...(state === "cancelled"
        ? { cancellationReplayDigest: sha(`cancel:${suffix}`) }
        : {}),
    })
    .returning();
  return operation!;
}

function port(overrides: Partial<ExternalCommandPort> = {}): ExternalCommandPort {
  return {
    execute: vi.fn(async () => ({ outcome: "succeeded" as const, providerRef: "sub_123" })),
    reconcile: vi.fn(async () => ({ outcome: "succeeded" as const })),
    ...overrides,
  };
}

describe("external-command outbox", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("keeps the kind population closed and phase-bound", () => {
    expect([...EXTERNAL_COMMAND_KINDS].sort()).toEqual(
      Object.keys(EXTERNAL_COMMAND_PHASE_BY_KIND).sort()
    );
    expect(EXTERNAL_COMMAND_PHASE_BY_KIND.stripe_subscription_cancel_now).toBe("erasing");
    expect(EXTERNAL_COMMAND_PHASE_BY_KIND.stripe_customer_personal_fields_clear).toBe("erasing");
    expect(EXTERNAL_COMMAND_PHASE_BY_KIND.stripe_subscription_reopen).toBe("cancellation");
  });

  it("stores the command identity before dispatch and returns the same row on replay", async () => {
    const operation = await workspaceOperation(db, "tombstoned");
    const first = await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, operation, "stripe_subscription_cancel_at_period_end")
    );
    const second = await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, operation, "stripe_subscription_cancel_at_period_end")
    );
    expect(second.id).toBe(first.id);
    expect(first).toMatchObject({
      status: "pending",
      phase: "pre_grace",
      attempt: 1,
      dispatchedAt: null,
      workspaceId: operation.workspaceId,
      targetKey: operation.targetKey,
    });
    expect(first.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await db.select().from(deletionExternalCommands).where(eq(deletionExternalCommands.operationId, operation.id))
    ).toHaveLength(1);
  });

  it("refuses an irreversible command before the operation is erasing, and reversal outside cancellation", async () => {
    const grace = await workspaceOperation(db, "grace", "g");
    await expect(
      db.transaction((tx) => enqueueExternalCommandInTx(tx, grace, "stripe_subscription_cancel_now"))
    ).rejects.toThrow("external_command_refused:kind_phase_state:erasing:grace");
    await expect(
      db.transaction((tx) => enqueueExternalCommandInTx(tx, grace, "stripe_subscription_reopen"))
    ).rejects.toThrow("external_command_refused:kind_phase_state:cancellation:grace");
    const erasing = await workspaceOperation(db, "erasing", "e");
    const command = await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, erasing, "stripe_subscription_cancel_now")
    );
    expect(command.phase).toBe("erasing");
  });

  it("refuses a workspace-only kind for an identity operation and the database refuses a kind/phase mismatch", async () => {
    const operation = await workspaceOperation(db, "tombstoned", "i");
    const identityShaped = { ...operation, scope: "identity" as const };
    await expect(
      db.transaction((tx) => enqueueExternalCommandInTx(tx, identityShaped, "auto_topup_disable"))
    ).rejects.toThrow("external_command_refused:kind_scope_mismatch");
    // The driver wraps the violation; the SQLSTATE and constraint name live on
    // the cause, so assert those rather than the wrapper text.
    await expect(
      db.insert(deletionExternalCommands).values({
        operationId: operation.id,
        scope: "workspace",
        targetKey: operation.targetKey,
        workspaceId: operation.workspaceId,
        kind: "stripe_subscription_cancel_now",
        phase: "pre_grace",
        payloadHash: sha("smuggled"),
      })
    ).rejects.toSatisfy((error: unknown) => {
      const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
      return (
        cause?.code === "23514" &&
        cause.constraint === "deletion_external_commands_kind_phase_shape"
      );
    });
  });

  it("dispatches pending commands once, records the outcome, and reports the summary from durable state", async () => {
    const operation = await workspaceOperation(db, "tombstoned", "d");
    await db.transaction(async (tx) => {
      await enqueueExternalCommandInTx(tx, operation, "stripe_subscription_cancel_at_period_end");
      await enqueueExternalCommandInTx(tx, operation, "auto_topup_disable");
    });
    const adapter = port();
    const summary = await dispatchExternalCommands(db, operation.id, "pre_grace", adapter);
    expect(summary).toEqual({ pending: 0, succeeded: 2, failed: 0, unknown: 0 });
    expect(adapter.execute).toHaveBeenCalledTimes(2);
    const rows = await db
      .select()
      .from(deletionExternalCommands)
      .where(eq(deletionExternalCommands.operationId, operation.id));
    for (const row of rows) {
      expect(row.status).toBe("succeeded");
      expect(row.dispatchedAt).not.toBeNull();
      expect(row.resolvedAt!.getTime()).toBeGreaterThanOrEqual(row.dispatchedAt!.getTime());
    }
    const cancel = rows.find((row) => row.kind === "stripe_subscription_cancel_at_period_end")!;
    expect(cancel.providerRefDigest).toBe(
      sha(`external-command:${cancel.id}:${cancel.attempt}:sub_123`)
    );
    expect(JSON.stringify(rows)).not.toContain("sub_123");
    // A second dispatch tick finds nothing pending and never calls the provider again.
    const again = await dispatchExternalCommands(db, operation.id, "pre_grace", adapter);
    expect(again).toEqual(summary);
    expect(adapter.execute).toHaveBeenCalledTimes(2);
  });

  it("records an adapter throw as unknown, blocks on it, and reconciles rather than re-executing", async () => {
    const operation = await workspaceOperation(db, "tombstoned", "u");
    await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, operation, "stripe_subscription_cancel_at_period_end")
    );
    const adapter = port({
      execute: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
      reconcile: vi.fn(async () => ({ outcome: "succeeded" as const, providerRef: "sub_999" })),
    });
    expect(await dispatchExternalCommands(db, operation.id, "pre_grace", adapter)).toEqual({
      pending: 0,
      succeeded: 0,
      failed: 0,
      unknown: 1,
    });
    await expect(
      db.transaction((tx) => assertNoUnknownExternalCommands(tx, operation.id))
    ).rejects.toThrow("external_command_refused:unknown_outcome_pending");
    const [unknown] = await db
      .select()
      .from(deletionExternalCommands)
      .where(eq(deletionExternalCommands.operationId, operation.id));
    expect(unknown!.reconciliationDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(unknown!.dispatchedAt).not.toBeNull();

    expect(await dispatchExternalCommands(db, operation.id, "pre_grace", adapter)).toEqual({
      pending: 0,
      succeeded: 1,
      failed: 0,
      unknown: 0,
    });
    expect(adapter.execute).toHaveBeenCalledTimes(1);
    expect(adapter.reconcile).toHaveBeenCalledTimes(1);
    await expect(
      db.transaction((tx) => assertNoUnknownExternalCommands(tx, operation.id))
    ).resolves.toBeUndefined();
  });

  it("refuses a success or unknown outcome for a command that was never dispatched", async () => {
    const operation = await workspaceOperation(db, "tombstoned", "n");
    const command = await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, operation, "auto_topup_disable")
    );
    const ref = { commandId: command.id, attempt: command.attempt };
    await expect(
      recordExternalCommandOutcome(db, ref, { outcome: "succeeded" })
    ).rejects.toThrow("external_command_refused:outcome_before_dispatch");
    await expect(
      recordExternalCommandOutcome(db, ref, { outcome: "unknown", reconciliationDigest: sha("x") })
    ).rejects.toThrow("external_command_refused:outcome_before_dispatch");
    const failed = await recordExternalCommandOutcome(db, ref, {
      outcome: "failed",
      failureCode: "adapter_refused_before_dispatch",
    });
    expect(failed.status).toBe("failed");
    expect(failed.dispatchedAt).toBeNull();
  });

  it("makes terminal outcomes immutable except for an identical replay, and retries only a failed attempt", async () => {
    const operation = await workspaceOperation(db, "tombstoned", "t");
    await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, operation, "stripe_subscription_cancel_at_period_end")
    );
    const failing = port({
      execute: vi.fn(async () => ({ outcome: "failed" as const, failureCode: "provider_rejected" })),
    });
    expect(await dispatchExternalCommands(db, operation.id, "pre_grace", failing)).toEqual({
      pending: 0,
      succeeded: 0,
      failed: 1,
      unknown: 0,
    });
    const [first] = await db
      .select()
      .from(deletionExternalCommands)
      .where(eq(deletionExternalCommands.operationId, operation.id));
    const ref = { commandId: first!.id, attempt: first!.attempt };
    await expect(
      recordExternalCommandOutcome(db, ref, { outcome: "succeeded" })
    ).rejects.toThrow("external_command_refused:terminal_outcome_conflict");
    await expect(
      recordExternalCommandOutcome(db, ref, { outcome: "failed", failureCode: "different" })
    ).rejects.toThrow("external_command_refused:terminal_outcome_conflict");
    await expect(
      recordExternalCommandOutcome(db, ref, { outcome: "failed", failureCode: "provider_rejected" })
    ).resolves.toMatchObject({ id: first!.id, status: "failed" });

    const retry = await db.transaction((tx) =>
      retryFailedExternalCommandInTx(tx, operation, "stripe_subscription_cancel_at_period_end")
    );
    expect(retry.attempt).toBe(2);
    expect(retry.id).not.toBe(first!.id);
    // The summary follows the LATEST attempt only.
    expect(
      await db.transaction((tx) => externalCommandSummary(tx, operation.id, "pre_grace"))
    ).toEqual({ pending: 1, succeeded: 0, failed: 0, unknown: 0 });
    // An out-of-order duplicate for attempt 1 (arriving after attempt 2 exists)
    // still cannot flip attempt 1 and cannot touch attempt 2.
    await expect(
      recordExternalCommandOutcome(db, ref, { outcome: "succeeded" })
    ).rejects.toThrow("external_command_refused:terminal_outcome_conflict");
    await expect(
      db.transaction((tx) =>
        retryFailedExternalCommandInTx(tx, operation, "stripe_subscription_cancel_at_period_end")
      )
    ).rejects.toThrow("external_command_refused:retry_requires_failed:pending");
  });

  it("never retries an unknown command as a new attempt", async () => {
    const operation = await workspaceOperation(db, "tombstoned", "k");
    await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, operation, "auto_topup_disable")
    );
    await dispatchExternalCommands(db, operation.id, "pre_grace", port({
      execute: vi.fn(async () => ({ outcome: "unknown" as const, reconciliationDigest: sha("timeout") })),
    }));
    await expect(
      db.transaction((tx) => retryFailedExternalCommandInTx(tx, operation, "auto_topup_disable"))
    ).rejects.toThrow("external_command_refused:retry_requires_failed:unknown");
  });

  it("does not call the provider when a racing dispatcher already marked the row dispatched", async () => {
    const operation = await workspaceOperation(db, "tombstoned", "r");
    const command = await db.transaction((tx) =>
      enqueueExternalCommandInTx(tx, operation, "auto_topup_disable")
    );
    await db
      .update(deletionExternalCommands)
      .set({ dispatchedAt: new Date() })
      .where(eq(deletionExternalCommands.id, command.id));
    const adapter = port();
    const summary = await dispatchExternalCommands(db, operation.id, "pre_grace", adapter);
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(summary).toEqual({ pending: 1, succeeded: 0, failed: 0, unknown: 0 });
  });
});

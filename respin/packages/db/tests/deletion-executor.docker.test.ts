// Phase 10b-1 Task 4.3 — the executor lease under REAL PostgreSQL concurrency.
//
// Two workers tick the same due operation at the same moment. Exactly one
// claims it, exactly one journal version is appended, and the loser reports
// nothing rather than a duplicate transition. PGlite is single-session, so
// only this suite proves the `claimLease` conditional update is a fence.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { session } from "../src/auth-schema";
import { ensureUserWorkspace } from "../src/bootstrap";
import { advanceDeletionOperations, type DeletionExecutorPorts } from "../src/deletion-executor";
import { requestWorkspaceDeletion } from "../src/deletion-lifecycle";
import type { DeletionJournalPort } from "../src/deletion-ports";
import { journalReceiptDigest, journalRequestChecksum } from "../src/deletion-ports";
import { migrationInventory } from "../src/lifecycle-inventory";
import { deletionOperations, deletionOperationTransitions } from "../src/lifecycle-schema";
import { createDockerTestDb, seedAuthUser } from "../src/testing";
import { withWorkspace } from "../src/with-workspace";

const MAINTENANCE_URL = process.env.TEST_DATABASE_URL;

if (!MAINTENANCE_URL) {
  console.warn(
    "[deletion-executor.docker.test] SKIPPED — TEST_DATABASE_URL is not set. " +
      "NOT PROVEN in this run: two concurrent executor ticks cannot both claim one due operation."
  );
}

const describeLive = MAINTENANCE_URL ? describe : describe.skip;
const RESPIN = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const MIGRATIONS = join(RESPIN, "packages/db/migrations");
const migrations = migrationInventory(
  readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }))
);

function journal(): { port: DeletionJournalPort; appends: number } {
  const state = { appends: 0 };
  const port: DeletionJournalPort = {
    appendTransition: async (request) => {
      state.appends += 1;
      // A real store would serialise here; the count is what this suite proves.
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      const object = {
        objectKey: `test/deletion-journal/${request.operationId}/${String(request.version).padStart(8, "0")}.json`,
        objectVersionId: `version-${request.version}`,
        checksumSha256: journalRequestChecksum(request),
      };
      return { outcome: "confirmed" as const, ...request, ...object, receiptDigest: journalReceiptDigest(request, object) };
    },
  };
  return { port, get appends() { return state.appends; } };
}

describeLive("deletion executor lease on real PostgreSQL", () => {
  let harness: Awaited<ReturnType<typeof createDockerTestDb>> | undefined;

  beforeAll(async () => {
    harness = await createDockerTestDb(MAINTENANCE_URL as string, "respin_test_deletionexecutor");
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it("lets exactly one of four simultaneous workers advance a due operation", async () => {
    const db = harness!.db;
    await seedAuthUser(db, "owner-auth", "owner@example.test");
    const owner = await ensureUserWorkspace(db, { authUserId: "owner-auth", name: "Owner" });
    await db.insert(session).values({
      id: "session-owner-auth",
      token: "token-owner",
      userId: "owner-auth",
      expiresAt: new Date(Date.now() + 3_600_000),
      updatedAt: new Date(),
      reauthenticatedAt: new Date(),
    });
    const scope = await withWorkspace(db, { authUserId: "owner-auth" });
    const log = journal();
    const requested = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-owner-auth", idempotencyKey: "executor-race-1", typedName: owner.workspace.name },
      log.port
    );
    expect(requested.state).toBe("tombstoned");
    const appendsBefore = log.appends;

    const commands = { execute: vi.fn(async () => ({ outcome: "succeeded" as const })), reconcile: vi.fn(async () => ({ outcome: "succeeded" as const })) };
    const ports: DeletionExecutorPorts = { journal: log.port, commands, enablement: { erasureEnabled: () => false } };
    const summaries = await Promise.all(
      ["w1", "w2", "w3", "w4"].map((workerName) =>
        advanceDeletionOperations(db, ports, { workerName, migrations })
      )
    );
    expect(summaries.reduce((total, summary) => total + summary.claimed, 0)).toBe(1);
    expect(summaries.reduce((total, summary) => total + summary.advanced, 0)).toBe(1);
    expect(log.appends - appendsBefore).toBe(1);
    const [operation] = await db.select().from(deletionOperations).where(eq(deletionOperations.id, requested.id));
    expect(operation!.state).toBe("external_actions_pending");
    expect(operation!.leaseOwner).toBeNull();
    const transitions = await db
      .select()
      .from(deletionOperationTransitions)
      .where(eq(deletionOperationTransitions.operationId, requested.id));
    expect(transitions.map((row) => row.version).sort()).toEqual([1, 2, 3]);
  }, 60_000);
});

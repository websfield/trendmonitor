import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifierProbe = vi.hoisted(() => ({
  activeTransactions: 0,
  run: null as null | (() => Promise<boolean>),
}));

vi.mock("better-auth/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("better-auth/crypto")>();
  return {
    ...actual,
    verifyPassword: vi.fn(async (...args: Parameters<typeof actual.verifyPassword>) => {
      if (verifierProbe.run) return verifierProbe.run();
      return actual.verifyPassword(...args);
    }),
  };
});

import { account, session } from "../src/auth-schema";
import {
  assertReauthenticatedWorkspaceScopeInTx,
  reauthenticateSessionWithPassword,
} from "../src/auth-lifecycle";
import { ensureUserWorkspace } from "../src/bootstrap";
import type { DbLike, TxLike } from "../src/db-like";
import { memberships } from "../src/schema";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { withWorkspace, type WorkspaceScope } from "../src/with-workspace";

function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function trackedTransactions(db: TestDb): DbLike {
  return new Proxy(db, {
    get(target, property) {
      if (property === "transaction") {
        return async <T>(callback: (tx: TxLike) => Promise<T>): Promise<T> =>
          target.transaction(async (tx) => {
            verifierProbe.activeTransactions += 1;
            try {
              return await callback(tx);
            } finally {
              verifierProbe.activeTransactions -= 1;
            }
          });
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as DbLike;
}

async function fixture(db: TestDb): Promise<{
  scope: WorkspaceScope;
  authUserId: string;
  sessionId: string;
}> {
  const authUserId = "auth-lifecycle-race";
  const sessionId = "session-auth-lifecycle-race";
  await seedAuthUser(db, authUserId);
  await ensureUserWorkspace(db, { authUserId, name: "Auth Lifecycle Race" });
  const now = new Date();
  await db.insert(session).values({
    id: sessionId,
    token: "token-auth-lifecycle-race",
    userId: authUserId,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
    updatedAt: now,
  });
  await db.insert(account).values({
    id: "credential-auth-lifecycle-race",
    accountId: authUserId,
    providerId: "credential",
    userId: authUserId,
    password: "verifier-is-controlled-by-this-test",
    updatedAt: now,
  });
  return {
    scope: await withWorkspace(db, { authUserId }),
    authUserId,
    sessionId,
  };
}

function pauseVerifier(): {
  entered: Promise<void>;
  release: () => void;
} {
  let enteredResolve: (() => void) | undefined;
  let releaseResolve: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });
  verifierProbe.run = async () => {
    expect(verifierProbe.activeTransactions).toBe(0);
    enteredResolve?.();
    await released;
    return true;
  };
  return {
    entered,
    release: () => releaseResolve?.(),
  };
}

describe("exact-session reauthentication locking", () => {
  let db: TestDb;

  beforeEach(async () => {
    verifierProbe.activeTransactions = 0;
    verifierProbe.run = null;
    db = await createTestDb();
  });

  it.each(["session", "account"] as const)(
    "runs password verification outside transactions and refuses a concurrent %s refresh",
    async (changed) => {
      const current = await fixture(db);
      const verifier = pauseVerifier();
      const pending = reauthenticateSessionWithPassword(trackedTransactions(db), {
        authUserId: current.authUserId,
        sessionId: current.sessionId,
        password: "correct-for-controlled-verifier",
        rateLimitKeyDigest: sha(`client-${changed}`),
      });
      await verifier.entered;

      if (changed === "session") {
        await db
          .update(session)
          .set({ updatedAt: new Date(Date.now() + 1_000) })
          .where(eq(session.id, current.sessionId));
      } else {
        await db
          .update(account)
          .set({ updatedAt: new Date(Date.now() + 1_000) })
          .where(eq(account.id, "credential-auth-lifecycle-race"));
      }

      verifier.release();
      await expect(pending).rejects.toThrow("auth_lifecycle_refused");
      expect(
        await db
          .select({ reauthenticatedAt: session.reauthenticatedAt })
          .from(session)
          .where(eq(session.id, current.sessionId))
      ).toEqual([{ reauthenticatedAt: null }]);
    }
  );

  it("lets a concurrent demotion land during verification, then rejects the stale owner scope", async () => {
    const current = await fixture(db);
    const verifier = pauseVerifier();
    const pending = reauthenticateSessionWithPassword(trackedTransactions(db), {
      authUserId: current.authUserId,
      sessionId: current.sessionId,
      password: "correct-for-controlled-verifier",
      rateLimitKeyDigest: sha("client-demotion"),
    });
    await verifier.entered;

    await db
      .update(memberships)
      .set({ role: "editor", version: sql`${memberships.version} + 1` })
      .where(
        and(
          eq(memberships.userId, current.scope.userId),
          eq(memberships.workspaceId, current.scope.workspaceId)
        )
      );
    verifier.release();
    const proof = await pending;

    await expect(
      db.transaction((tx) =>
        assertReauthenticatedWorkspaceScopeInTx(tx, current.scope, proof)
      )
    ).rejects.toThrow("lifecycle_refused:scope_stale");
  });
});

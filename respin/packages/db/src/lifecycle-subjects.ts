// Phase 10b-1 Task 4.3 — runtime lifecycle subjects captured from the database.
//
// The registry compiles executor targets and independent probes from ONE
// `LifecycleRuntimeSubjects` value. This module builds that value for a real
// deletion operation inside the erasure transaction, so the snapshot sets
// (verification rows, Stripe event ids, job/trend/claim ids) are read before
// the rows they name disappear and stay usable for the probe afterwards.
//
// Scopes the operation does not target are filled with SENTINELS that match
// no row, and `targetAppliesToOperation` keeps the executor from running any
// target that is not the operation's own. A sentinel that ever matched a row
// would be a tenancy breach, so the sentinel ids are fixed and witnessed:
// deletion-executor.test.ts compiles every cascade probe from sentinel
// subjects against the populated fixture and counts zero rows, while the
// same probes with real subjects count the fixture.
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { verification } from "./auth-schema";
import { stripeEvents, subscriptions } from "./billing-schema";
import type { TxLike } from "./db-like";
import type {
  BetterAuthVerificationSnapshot,
  IdentityLifecycleSubject,
  LifecycleExecutionTarget,
  LifecycleRuntimeSubjects,
  LifecycleSourceIdSnapshot,
  WorkspaceLifecycleSubject,
} from "./lifecycle-executors";
import type { DeletionOperation, DeletionScope } from "./lifecycle-schema";
import { users } from "./schema";
import { systemModelUsage, systemModelUsageReconciliations, systemSpendClaims } from "./system-spend-schema";
import { autopsyCacheClaims, trendItems } from "./trends-schema";

/** Nil-shaped UUIDs never minted by uuidv7; they match no row anywhere. */
export const SENTINEL_UUID = "00000000-0000-4000-8000-000000000000";
export const SENTINEL_AUTH_USER_ID = "respin:lifecycle:no-identity";
export const SENTINEL_INSTALLATION_ID = "respin:installation";

function refuse(code: string): never {
  throw new Error(`lifecycle_subjects_refused:${code}`);
}

const EMPTY_SOURCE_IDS: LifecycleSourceIdSnapshot = {
  jobIds: [],
  jobAttemptIds: [],
  trendItemIds: [],
  autopsyCacheClaimIds: [],
};

export function sentinelIdentitySubject(): IdentityLifecycleSubject {
  return {
    scope: "identity",
    userId: SENTINEL_UUID,
    authUserId: SENTINEL_AUTH_USER_ID,
    verificationRows: [],
  };
}

export function sentinelWorkspaceSubject(): WorkspaceLifecycleSubject {
  return {
    scope: "workspace",
    workspaceId: SENTINEL_UUID,
    stripeEventIds: [],
    stripeCustomerIds: [],
    sourceIds: EMPTY_SOURCE_IDS,
  };
}

/**
 * Exact identity-linked Better Auth rows, in the two shapes the installed
 * runtime writes (pinned by `lifecycle-registry.test.ts`): password-reset
 * tokens keyed `reset-password:<token>` with the auth user id as value, and
 * OAuth state rows whose JSON value links `userId`.
 */
export async function captureVerificationRowsInTx(
  tx: TxLike,
  authUserId: string
): Promise<readonly BetterAuthVerificationSnapshot[]> {
  const rows = await tx
    .select({ identifier: verification.identifier, value: verification.value })
    .from(verification)
    .where(
      or(
        and(like(verification.identifier, "reset-password:%"), eq(verification.value, authUserId)),
        sql`length(${verification.identifier}) = 32 AND ${verification.value} LIKE '%"userId"%'`
      )
    );
  const captured: BetterAuthVerificationSnapshot[] = [];
  for (const row of rows) {
    if (row.identifier.startsWith("reset-password:")) {
      if (row.identifier.length !== "reset-password:".length + 24 || row.value !== authUserId) continue;
      captured.push({
        kind: "password_reset",
        identifier: row.identifier as `reset-password:${string}`,
        value: row.value,
      });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      continue;
    }
    const link = parsed && typeof parsed === "object" ? (parsed as { link?: unknown }).link : undefined;
    const linkedUserId = link && typeof link === "object" ? (link as { userId?: unknown }).userId : undefined;
    if (linkedUserId !== authUserId) continue;
    captured.push({ kind: "oauth_account_link", identifier: row.identifier, value: row.value });
  }
  return captured;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

/**
 * Private-scope source ids: the trend items and autopsy cache claims the
 * subject owns, plus every system-spend job/attempt id those rows produced.
 * Shared (`shared_analysis`) rows are deliberately never collected.
 */
export async function captureSourceIdsInTx(
  tx: TxLike,
  target: Readonly<{ workspaceId: string; profileId?: string }>
): Promise<LifecycleSourceIdSnapshot> {
  const profileFilter = target.profileId ? eq(trendItems.profileId, target.profileId) : undefined;
  const items = await tx
    .select({ id: trendItems.id })
    .from(trendItems)
    .where(
      and(
        eq(trendItems.rightsScope, "profile_private"),
        eq(trendItems.workspaceId, target.workspaceId),
        ...(profileFilter ? [profileFilter] : [])
      )
    );
  const claimProfileFilter = target.profileId
    ? eq(autopsyCacheClaims.profileId, target.profileId)
    : undefined;
  const claims = await tx
    .select({ id: autopsyCacheClaims.id })
    .from(autopsyCacheClaims)
    .where(
      and(
        eq(autopsyCacheClaims.rightsScope, "profile_private"),
        eq(autopsyCacheClaims.workspaceId, target.workspaceId),
        ...(claimProfileFilter ? [claimProfileFilter] : [])
      )
    );
  const trendItemIds = unique(items.map((row) => row.id));
  const autopsyCacheClaimIds = unique(claims.map((row) => row.id));
  const jobIds: string[] = [];
  const jobAttemptIds: string[] = [];
  if (trendItemIds.length > 0 || autopsyCacheClaimIds.length > 0) {
    const claimRows = await tx
      .select({ jobId: systemSpendClaims.jobId, jobAttemptId: systemSpendClaims.jobAttemptId })
      .from(systemSpendClaims)
      .where(
        or(
          ...(trendItemIds.length > 0 ? [inArray(systemSpendClaims.trendItemId, trendItemIds)] : []),
          ...(autopsyCacheClaimIds.length > 0
            ? [inArray(systemSpendClaims.autopsyCacheClaimId, autopsyCacheClaimIds)]
            : [])
        )
      );
    for (const row of claimRows) {
      jobIds.push(row.jobId);
      jobAttemptIds.push(row.jobAttemptId);
    }
    if (trendItemIds.length > 0) {
      const usageRows = await tx
        .select({ jobId: systemModelUsage.jobId, jobAttemptId: systemModelUsage.jobAttemptId })
        .from(systemModelUsage)
        .where(inArray(systemModelUsage.trendItemId, trendItemIds));
      for (const row of usageRows) {
        jobIds.push(row.jobId);
        jobAttemptIds.push(row.jobAttemptId);
      }
    }
    if (jobAttemptIds.length > 0) {
      const reconciliations = await tx
        .select({ jobAttemptId: systemModelUsageReconciliations.jobAttemptId })
        .from(systemModelUsageReconciliations)
        .where(inArray(systemModelUsageReconciliations.jobAttemptId, unique(jobAttemptIds)));
      for (const row of reconciliations) jobAttemptIds.push(row.jobAttemptId);
    }
  }
  return {
    jobIds: unique(jobIds),
    jobAttemptIds: unique(jobAttemptIds),
    trendItemIds,
    autopsyCacheClaimIds,
  };
}

/** The subjects for one operation; the non-target scopes are sentinels. */
export async function captureLifecycleSubjectsInTx(
  tx: TxLike,
  operation: DeletionOperation
): Promise<LifecycleRuntimeSubjects> {
  const system = { scope: "system" as const, installationId: SENTINEL_INSTALLATION_ID };
  if (operation.scope === "identity") {
    if (!operation.userId) refuse("identity_target_missing");
    const [identity] = await tx
      .select({ authUserId: users.authUserId })
      .from(users)
      .where(eq(users.id, operation.userId))
      .limit(1);
    if (!identity) refuse("identity_row_missing");
    return {
      identity: {
        scope: "identity",
        userId: operation.userId,
        authUserId: identity.authUserId,
        verificationRows: await captureVerificationRowsInTx(tx, identity.authUserId),
      },
      workspace: sentinelWorkspaceSubject(),
      system,
      // The runtime-subjects type has two shapes (profile-active with a
      // profile subject, workspace-active without). An identity operation
      // borrows the workspace-active shape with a SENTINEL workspace; every
      // related (workspace-active) target is excluded for identity operations
      // by `targetAppliesToOperation`, so the shape never puts one in play.
      activeOperation: { scope: "workspace" },
    };
  }
  if (!operation.workspaceId) refuse("workspace_target_missing");
  if (operation.scope === "profile") {
    if (!operation.profileId) refuse("profile_target_missing");
    const sourceIds = await captureSourceIdsInTx(tx, {
      workspaceId: operation.workspaceId,
      profileId: operation.profileId,
    });
    return {
      identity: sentinelIdentitySubject(),
      profile: {
        scope: "profile",
        profileId: operation.profileId,
        workspaceId: operation.workspaceId,
        sourceIds,
      },
      workspace: {
        scope: "workspace",
        workspaceId: operation.workspaceId,
        stripeEventIds: [],
        stripeCustomerIds: [],
        sourceIds: EMPTY_SOURCE_IDS,
      },
      system,
      activeOperation: { scope: "profile" },
    };
  }
  const events = await tx
    .select({ id: stripeEvents.id, stripeCustomerId: stripeEvents.stripeCustomerId })
    .from(stripeEvents)
    .where(eq(stripeEvents.workspaceId, operation.workspaceId));
  const customers = await tx
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.workspaceId, operation.workspaceId));
  return {
    identity: sentinelIdentitySubject(),
    workspace: {
      scope: "workspace",
      workspaceId: operation.workspaceId,
      stripeEventIds: unique(events.map((row) => row.id)),
      // The customer ids the receipts may still carry after the workspace
      // link is nulled: the independent probe checks them (round-1 lean S2).
      stripeCustomerIds: unique([
        ...customers.map((row) => row.stripeCustomerId),
        ...events.map((row) => row.stripeCustomerId).filter((value): value is string => value !== null),
      ]),
      sourceIds: await captureSourceIdsInTx(tx, { workspaceId: operation.workspaceId }),
    },
    system,
    activeOperation: { scope: "workspace" },
  };
}

/**
 * Which compiled targets ONE operation may touch. Identity operations erase
 * identity-owned rows only; profile operations erase the profile's rows and
 * the system-spend rows its private sources produced; workspace operations
 * erase workspace- and profile-scoped rows plus their related system rows.
 * Everything else is another scope's business and stays untouched.
 */
export function targetAppliesToOperation(
  scope: DeletionScope,
  target: Pick<LifecycleExecutionTarget, "selector" | "subject">
): boolean {
  if (scope === "identity") return target.subject.scope === "identity";
  if (target.subject.scope === "related") return target.subject.activeScope === scope;
  if (target.subject.scope === "identity" || target.subject.scope === "system") return false;
  if (scope === "profile") return target.selector.scope === "profile" && target.subject.scope === "profile";
  return target.selector.scope === "workspace" || target.selector.scope === "profile";
}

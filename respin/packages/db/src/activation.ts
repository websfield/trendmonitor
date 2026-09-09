// Phase 10b-1 Task 7 / R-121 — the sole activation classifier and the
// identifier-free cohort contribution a deleting account leaves behind.
//
// The metric: of the distinct production signups on a UTC signup day, the share
// that verified email, activated a complete brain, and settled a first usable
// full-script generation within 24 h of `users.created_at`. Admin and audited
// excluded ids leave the denominator entirely; everyone else is in it whether
// or not they activated — a deleted-before-maturity signup is a non-activation,
// not an absence.
//
// A deleting user cannot earn later events, so the contribution captured at
// REQUEST time (before memberships suspend, before any config set changes) is
// final. It is applied to `activation_cohort_daily` exactly once, immediately
// before erasure, in the erasure transaction; then the identifier-bearing hash
// is erased and only a receipt digest that names no user survives.
import { createHash } from "node:crypto";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";

import { user as authUser } from "./auth-schema";
import { creatorProfiles } from "./brain-schema";
import type { DbLike, TxLike } from "./db-like";
import { generations } from "./generation-schema";
import { activationCohortDaily, deletionOperations, type DeletionOperation } from "./lifecycle-schema";
import { lockIdentityMembershipGraph } from "./membership-lifecycle";
import { RETENTION_CLOCKS } from "./retention-clocks";
import { brainActivationSnapshots } from "./onboarding-schema";
import { memberships, users } from "./schema";

export const ACTIVATION_METRIC_VERSION = 1;
export const ACTIVATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** R-121's closed full-script set. Hooks, captions, ideation and Sample Spin never qualify. */
export const ACTIVATION_FULL_SCRIPT_MODES = [
  "footageToThesis",
  "ideaToScript",
  "sourceToReel",
  "analyseAndSpin",
] as const;

export const ADMIN_USER_IDS_ENV = "ADMIN_USER_IDS";
export const ACTIVATION_EXCLUDED_USER_IDS_ENV = "ACTIVATION_EXCLUDED_USER_IDS";

export type ActivationExclusions = Readonly<{
  adminUserIds: ReadonlySet<string>;
  excludedUserIds: ReadonlySet<string>;
}>;

export const NO_ACTIVATION_EXCLUSIONS: ActivationExclusions = Object.freeze({
  adminUserIds: new Set<string>(),
  excludedUserIds: new Set<string>(),
});

const parseIdList = (raw: string | undefined): ReadonlySet<string> =>
  new Set((raw ?? "").split(",").map((part) => part.trim()).filter(Boolean));

/** The two audited deployment sets, read once per process. Never an email-domain or name heuristic (R-121). */
export function resolveActivationExclusions(
  env: Readonly<Record<string, string | undefined>>,
): ActivationExclusions {
  return {
    adminUserIds: parseIdList(env[ADMIN_USER_IDS_ENV]),
    excludedUserIds: parseIdList(env[ACTIVATION_EXCLUDED_USER_IDS_ENV]),
  };
}

export type ExclusionSource = "admin_user_ids" | "activation_excluded_user_ids";

export type ActivationSignals = Readonly<{
  signupAt: Date;
  emailVerified: boolean;
  brainActivatedAt: Date | null;
  firstFullScriptAt: Date | null;
}>;

export type ActivationContribution = Readonly<{
  cohortDate: string;
  excluded: boolean;
  exclusionSource: ExclusionSource | null;
  denominator: 0 | 1;
  numerator: 0 | 1;
  metricVersion: number;
}>;

const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

const within = (at: Date | null, signupAt: Date): boolean =>
  at !== null && at.getTime() - signupAt.getTime() <= ACTIVATION_WINDOW_MS && at.getTime() >= signupAt.getTime();

/**
 * Pure. Membership in either audited set yields exactly (true, 0, 0) — even if
 * the operator later removes the id. An ordinary account yields (false, 1, x).
 * Email verification carries no timestamp in Better Auth, so "verified" means
 * verified as of the capture; the other two steps are timestamped and bounded.
 */
export function classifyActivation(
  userId: string,
  signals: ActivationSignals,
  exclusions: ActivationExclusions,
): ActivationContribution {
  const cohortDate = utcDay(signals.signupAt);
  const exclusionSource: ExclusionSource | null = exclusions.adminUserIds.has(userId)
    ? "admin_user_ids"
    : exclusions.excludedUserIds.has(userId)
      ? "activation_excluded_user_ids"
      : null;
  if (exclusionSource) {
    return { cohortDate, excluded: true, exclusionSource, denominator: 0, numerator: 0, metricVersion: ACTIVATION_METRIC_VERSION };
  }
  const activated =
    signals.emailVerified &&
    within(signals.brainActivatedAt, signals.signupAt) &&
    within(signals.firstFullScriptAt, signals.signupAt);
  return {
    cohortDate,
    excluded: false,
    exclusionSource: null,
    denominator: 1,
    numerator: activated ? 1 : 0,
    metricVersion: ACTIVATION_METRIC_VERSION,
  };
}

/** The user's signals from source events, across every workspace they can reach. */
export async function loadActivationSignals(tx: TxLike, userId: string): Promise<ActivationSignals | null> {
  const [identity] = await tx
    .select({ createdAt: users.createdAt, authUserId: users.authUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!identity) return null;
  const [auth] = await tx
    .select({ emailVerified: authUser.emailVerified })
    .from(authUser)
    .where(eq(authUser.id, identity.authUserId))
    .limit(1);
  const workspaceIds = (
    await tx.select({ workspaceId: memberships.workspaceId }).from(memberships).where(eq(memberships.userId, userId))
  ).map((row) => row.workspaceId);
  if (workspaceIds.length === 0) {
    return { signupAt: identity.createdAt, emailVerified: auth?.emailVerified ?? false, brainActivatedAt: null, firstFullScriptAt: null };
  }
  const profileIds = (
    await tx.select({ id: creatorProfiles.id }).from(creatorProfiles).where(inArray(creatorProfiles.workspaceId, workspaceIds))
  ).map((row) => row.id);
  let brainActivatedAt: Date | null = null;
  let firstFullScriptAt: Date | null = null;
  if (profileIds.length > 0) {
    const [brain] = await tx
      .select({ at: sql<Date | null>`min(${brainActivationSnapshots.createdAt})` })
      .from(brainActivationSnapshots)
      .where(
        and(
          inArray(brainActivationSnapshots.profileId, profileIds),
          sql`${brainActivationSnapshots.voiceDocId} IS NOT NULL AND ${brainActivationSnapshots.strategyDocId} IS NOT NULL AND ${brainActivationSnapshots.killtestDocId} IS NOT NULL AND ${brainActivationSnapshots.performanceMetaDocId} IS NOT NULL`,
        ),
      );
    brainActivatedAt = brain?.at ? new Date(brain.at) : null;
    const [script] = await tx
      .select({ at: sql<Date | null>`min(${generations.createdAt})` })
      .from(generations)
      .where(
        and(
          inArray(generations.profileId, profileIds),
          eq(generations.outcome, "usable"),
          inArray(generations.mode, [...ACTIVATION_FULL_SCRIPT_MODES]),
        ),
      );
    firstFullScriptAt = script?.at ? new Date(script.at) : null;
  }
  return { signupAt: identity.createdAt, emailVerified: auth?.emailVerified ?? false, brainActivatedAt, firstFullScriptAt };
}

/** The live-account wrapper 10a consumes: membership snapshot under the shared lock, then the classifier. */
export async function queryActivation(
  tx: TxLike,
  userId: string,
  exclusions: ActivationExclusions,
): Promise<ActivationContribution | null> {
  await lockIdentityMembershipGraph(tx, userId);
  const signals = await loadActivationSignals(tx, userId);
  return signals ? classifyActivation(userId, signals, exclusions) : null;
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

/** Keyed to the operation AND the user: a replay under another operation or user cannot present this hash. */
export function activationPayloadHash(operationId: string, userId: string, contribution: ActivationContribution): string {
  return sha256(
    ["activation-contribution", operationId, userId, contribution.cohortDate, contribution.excluded ? 1 : 0,
      contribution.exclusionSource ?? "", contribution.denominator, contribution.numerator, contribution.metricVersion].join("|"),
  );
}

/** Names the random operation id and the numbers only — never the user, so a known-id dictionary cannot relink it. */
export function activationReceiptDigest(
  operationId: string,
  contribution: ActivationContribution,
  appliedAt: Date,
  outcome: "applied",
): string {
  return sha256(
    ["activation-receipt", operationId, contribution.cohortDate, contribution.excluded ? 1 : 0,
      contribution.denominator, contribution.numerator, contribution.metricVersion, outcome, appliedAt.toISOString()].join("|"),
  );
}

export type ActivationCaptureColumns = Pick<
  typeof deletionOperations.$inferInsert,
  | "activationCohortDate" | "activationExcluded" | "activationExclusionSource" | "activationDenominator"
  | "activationNumerator" | "activationMetricVersion" | "activationMembershipVersion" | "activationPayloadHash"
  | "activationContributionState"
>;

/**
 * The capture, for the identity-request transaction: BEFORE memberships become
 * `deletion_suspended` and before any deployment set changes. The membership
 * version sum is the reachability snapshot the plan asks for.
 */
export async function captureActivationContributionInTx(
  tx: TxLike,
  operationId: string,
  userId: string,
  exclusions: ActivationExclusions,
): Promise<ActivationCaptureColumns> {
  const signals = await loadActivationSignals(tx, userId);
  if (!signals) throw new Error("activation_capture_identity_missing");
  const contribution = classifyActivation(userId, signals, exclusions);
  const [reach] = await tx
    .select({ version: sql<number>`coalesce(sum(${memberships.version}), 0)::int` })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  return {
    activationCohortDate: contribution.cohortDate,
    activationExcluded: contribution.excluded,
    activationExclusionSource: contribution.exclusionSource,
    activationDenominator: contribution.denominator,
    activationNumerator: contribution.numerator,
    activationMetricVersion: contribution.metricVersion,
    activationMembershipVersion: reach?.version ?? 0,
    activationPayloadHash: activationPayloadHash(operationId, userId, contribution),
    activationContributionState: "pending",
  };
}

export class ActivationContributionRefusal extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ActivationContributionRefusal";
  }
}

function contributionOf(operation: DeletionOperation): ActivationContribution | null {
  if (
    operation.activationCohortDate === null || operation.activationExcluded === null ||
    operation.activationDenominator === null || operation.activationNumerator === null ||
    operation.activationMetricVersion === null
  ) return null;
  return {
    cohortDate: operation.activationCohortDate,
    excluded: operation.activationExcluded,
    exclusionSource: (operation.activationExclusionSource as ExclusionSource | null) ?? null,
    denominator: operation.activationDenominator as 0 | 1,
    numerator: operation.activationNumerator as 0 | 1,
    metricVersion: operation.activationMetricVersion,
  };
}

/**
 * Immediately before erasure, in the erasure transaction. Exactly once: the
 * `pending → applied` transition and the aggregate increment commit together,
 * and a replay finds `applied` and does nothing. A missing or mismatched
 * contribution BLOCKS erasure (plan C5) — it is never recomputed here, because
 * by now memberships are suspended and the config may have changed.
 *
 * The id is refused while it is still in either configured set: erasing it
 * would leave a re-linkable copy in deployment config (plan C4).
 */
export async function applyActivationContributionInTx(
  tx: TxLike,
  operation: DeletionOperation,
  exclusions: ActivationExclusions,
  now: Date,
): Promise<Readonly<{ applied: boolean; receiptDigest: string }>> {
  if (operation.scope !== "identity" || !operation.userId) throw new ActivationContributionRefusal("activation_not_identity_scope");
  if (exclusions.adminUserIds.has(operation.userId) || exclusions.excludedUserIds.has(operation.userId)) {
    throw new ActivationContributionRefusal("operator_config_removal_required");
  }
  const contribution = contributionOf(operation);
  if (!contribution) throw new ActivationContributionRefusal("activation_contribution_missing");
  if (operation.activationPayloadHash !== activationPayloadHash(operation.id, operation.userId, contribution)) {
    throw new ActivationContributionRefusal("activation_contribution_mismatch");
  }
  const receiptDigest = activationReceiptDigest(operation.id, contribution, now, "applied");
  if (operation.activationContributionState === "applied") return { applied: false, receiptDigest: operation.activationReceiptDigest ?? receiptDigest };

  const [claimed] = await tx
    .update(deletionOperations)
    .set({ activationContributionState: "applied", activationAppliedAt: now, activationReceiptDigest: receiptDigest })
    .where(and(eq(deletionOperations.id, operation.id), eq(deletionOperations.activationContributionState, "pending")))
    .returning({ id: deletionOperations.id });
  if (!claimed) return { applied: false, receiptDigest };

  await tx
    .insert(activationCohortDaily)
    .values({
      cohortDate: contribution.cohortDate,
      metricVersion: contribution.metricVersion,
      signups: contribution.denominator,
      activated: contribution.numerator,
      excluded: contribution.excluded ? 1 : 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [activationCohortDaily.cohortDate, activationCohortDaily.metricVersion],
      set: {
        signups: sql`${activationCohortDaily.signups} + ${contribution.denominator}`,
        activated: sql`${activationCohortDaily.activated} + ${contribution.numerator}`,
        excluded: sql`${activationCohortDaily.excluded} + ${contribution.excluded ? 1 : 0}`,
        updatedAt: now,
      },
    });
  return { applied: true, receiptDigest };
}

/**
 * The limitation every consumer of this metric must carry, attached to the
 * returned shape rather than left in a review manifest (T69-R1). Better Auth
 * stores no email-verification TIMESTAMP, so the classifier reads
 * `emailVerified` as of capture -- not "verified within 24 hours of signup". A
 * cohort therefore over-counts anyone who verified late, and no consumer can
 * caveat a fact it was never handed.
 */
export const ACTIVATION_VERIFICATION_LIMITATION =
  "emailVerified is read as of capture; Better Auth stores no verification timestamp, so late verifiers are counted as activated";

export type ActivationCohort = Readonly<{
  cohortDate: string;
  /**
   * The rules this row was judged under. Rows of different versions are NEVER
   * summed: the aggregate used to be read `WHERE metric_version = current`, so
   * bumping the version silently dropped every deleted account's retained
   * contribution while the live pass re-judged the same cohorts under the new
   * rules -- a metric that changed shape and lost history in one step.
   */
  metricVersion: number;
  signups: number;
  activated: number;
  excluded: number;
  /** Denominator < 10 must be suppressed at any external sink (R-121); shown internally, never treated as zero. */
  smallCell: boolean;
  /**
   * TRUE when this cohort is older than the aggregate's own retention, so the
   * deleted-account half of its denominator has already been swept and only
   * survivors remain. Publishing a rate from such a cohort is survivorship bias
   * in the direction that flatters activation, so it must be withheld rather
   * than shown -- the two halves used to expire on different clocks with
   * nothing on the row to say so.
   */
  aggregateExpired: boolean;
  /** Always present, so a consumer cannot render the number without it. */
  limitation: string;
}>;

/**
 * The public metric: the retained aggregate plus the classifier over remaining
 * live accounts, with no double count. An account whose contribution has been
 * applied to the aggregate is excluded from the live pass by its operation's
 * `applied` state — and after erasure its `users` row is gone anyway.
 */
export async function deriveActivationCohorts(
  db: DbLike,
  exclusions: ActivationExclusions,
  asOf: Date,
): Promise<readonly ActivationCohort[]> {
  // Keyed by (cohort date, metric version). Mixing versions in one bucket is
  // what the old `WHERE metric_version = current` filter avoided by DELETING
  // history; keying by both keeps it instead.
  const totals = new Map<
    string,
    { cohortDate: string; metricVersion: number; signups: number; activated: number; excluded: number }
  >();
  const keyOf = (date: string, version: number) => date + "|" + String(version);
  const bump = (date: string, version: number, c: ActivationContribution) => {
    const key = keyOf(date, version);
    const row = totals.get(key) ?? {
      cohortDate: date,
      metricVersion: version,
      signups: 0,
      activated: 0,
      excluded: 0,
    };
    row.signups += c.denominator;
    row.activated += c.numerator;
    row.excluded += c.excluded ? 1 : 0;
    totals.set(key, row);
  };
  await db.transaction(async (tx) => {
    // EVERY version, not just the current one. Reading only the current version
    // meant a bump to v2 silently discarded every deleted account's retained v1
    // contribution from the public metric.
    for (const row of await tx.select().from(activationCohortDaily)) {
      const key = keyOf(row.cohortDate, row.metricVersion);
      const t = totals.get(key) ?? {
        cohortDate: row.cohortDate,
        metricVersion: row.metricVersion,
        signups: 0,
        activated: 0,
        excluded: 0,
      };
      t.signups += row.signups; t.activated += row.activated; t.excluded += row.excluded;
      totals.set(key, t);
    }
    const applied = new Set(
      (await tx
        .select({ userId: deletionOperations.userId })
        .from(deletionOperations)
        .where(and(eq(deletionOperations.scope, "identity"), eq(deletionOperations.activationContributionState, "applied"))))
        .map((r) => r.userId)
        .filter((id): id is string => id !== null),
    );
    // A PENDING identity deletion is still a signup. `requestIdentityDeletion`
    // tombstones the person's own `users` row at REQUEST time, so the live
    // pass below (which skips tombstoned rows, see there) would drop them from
    // the denominator for the whole request -> erasure window — seven days at
    // least, forever for a blocked operation — in the direction that flatters
    // the rate (the learning gate's round-2 BLOCK, reproduced). Their
    // contribution was CAPTURED at request, keyed to the operation and final
    // (plan C5), so it is counted from the capture while it is pending and from
    // the aggregate once applied. A CANCELLED operation keeps its capture at
    // `pending` (cancellation clears only the recovery fields) and its person
    // may request again — so the query filters on the OPERATION's state, never
    // on the user's tombstone alone: the first version joined only on the
    // tombstoned user and counted a cancel-and-retry person twice while the
    // second request was pending (tenancy gate on fix pass 3, reproduced), and
    // would have kept counting the cancelled row after erasure repointed its
    // user id to the stub. Terminal operations are excluded here; a complete
    // one is already in the aggregate.
    const pending = await tx
      .select({
        cohortDate: deletionOperations.activationCohortDate,
        metricVersion: deletionOperations.activationMetricVersion,
        numerator: deletionOperations.activationNumerator,
        denominator: deletionOperations.activationDenominator,
        excluded: deletionOperations.activationExcluded,
      })
      .from(deletionOperations)
      .innerJoin(users, eq(users.id, deletionOperations.userId))
      .where(
        and(
          eq(deletionOperations.scope, "identity"),
          eq(deletionOperations.activationContributionState, "pending"),
          notInArray(deletionOperations.state, ["cancelled", "complete"]),
          eq(users.lifecycleState, "tombstoned"),
        ),
      );
    for (const row of pending) {
      if (row.cohortDate === null || row.metricVersion === null || row.numerator === null || row.denominator === null || row.excluded === null) continue;
      bump(row.cohortDate, row.metricVersion, {
        cohortDate: row.cohortDate,
        metricVersion: row.metricVersion,
        numerator: row.numerator as 0 | 1,
        denominator: row.denominator as 0 | 1,
        excluded: row.excluded,
        exclusionSource: null,
      });
    }
    const matureBefore = new Date(asOf.getTime() - ACTIVATION_WINDOW_MS);
    const liveRows = await tx
      .select({ id: users.id, createdAt: users.createdAt })
      .from(users)
      // TOMBSTONED ROWS ARE NOT SIGNUPS. Erasure inserts a stub `users` row
      // whose `created_at` defaults to the erasure instant. It was excluded
      // only by ACCIDENT -- its id happened to appear in the `applied` set
      // above -- and `deletion_receipt_one_year` DELETES that operation row
      // after a year. One year after every identity erasure, each deleted
      // account would then have begun contributing one invented, never-activated
      // signup to the denominator, dated the day it was erased, permanently.
      .where(ne(users.lifecycleState, "tombstoned"));
    for (const live of liveRows) {
      if (applied.has(live.id)) continue;
      // Report only matured cohorts (R-121): a signup inside its 24 h window is not yet a data point.
      if (live.createdAt.getTime() > matureBefore.getTime()) continue;
      const signals = await loadActivationSignals(tx, live.id);
      if (signals) {
        bump(utcDay(signals.signupAt), ACTIVATION_METRIC_VERSION, classifyActivation(live.id, signals, exclusions));
      }
    }
  });
  // The aggregate's own retention horizon. Past it, the deleted half of a
  // cohort's denominator has been swept while the live pass has no lower bound,
  // so only survivors remain and the rate is biased upward.
  const aggregateHorizon = asOf.getTime() - RETENTION_CLOCKS.cohort_two_years.durationMs;
  return [...totals.values()]
    .sort((a, b) => a.cohortDate.localeCompare(b.cohortDate) || a.metricVersion - b.metricVersion)
    .map((t) => ({
      cohortDate: t.cohortDate,
      metricVersion: t.metricVersion,
      signups: t.signups,
      activated: t.activated,
      excluded: t.excluded,
      smallCell: t.signups < 10,
      aggregateExpired: Date.parse(t.cohortDate + "T00:00:00.000Z") < aggregateHorizon,
      limitation: ACTIVATION_VERIFICATION_LIMITATION,
    }));
}

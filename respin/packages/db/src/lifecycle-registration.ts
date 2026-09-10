// Phase 10b-1 Task 9 — the one call that proves a table is registered with
// the lifecycle everywhere it has to be. 10a, 10b-2 and 10c run this in the
// same change that adds a table (R-119); `REGISTERING-A-TABLE.md` lists the
// edit sites it checks, in order.
//
// It composes the closures that already exist rather than re-deriving any of
// them, so a slice cannot satisfy this and still miss one: the registry/writer/
// row-class/JSON closure, the retention-clock bijection, and the executor ↔
// probe agreement over a synthetic subject set. The first violation throws,
// naming its site.
import {
  EXTERNAL_WRITER_AUTHORITIES,
  JSON_COLUMN_INVENTORY,
  JSON_PATH_INVENTORY,
  LIFECYCLE_REGISTRY,
  LIFECYCLE_WRITER_INVENTORY,
  ROW_CLASS_INVENTORY,
  SUPPORTING_LIFECYCLE_STORES,
  validateLifecycleClosure,
  type LifecycleClassEntry,
} from "./creator-data-registry";
import {
  compileLifecycleExecutionTargets,
  LIFECYCLE_EXECUTORS,
  type LifecycleRuntimeSubjects,
} from "./lifecycle-executors";
import type { MigrationInventory } from "./lifecycle-inventory";
import {
  assertExecutorProbeAgreement,
  assertProbeClosure,
  deriveExpectedResidueProbes,
  LIFECYCLE_PROBES,
} from "./lifecycle-probes";
import { assertRetentionClockClosure } from "./retention-clocks";

/**
 * A synthetic subject for every scope. The values are opaque: the closures
 * only need each scope to have SOME subject so that every predicate compiles
 * and every probe is derivable — they never reach a database.
 */
export const REGISTRATION_SUBJECTS = {
  identity: {
    scope: "identity",
    userId: "registration_user",
    authUserId: "registration_auth_user",
    verificationRows: [],
  },
  profile: {
    scope: "profile",
    profileId: "registration_profile",
    workspaceId: "registration_workspace",
    sourceIds: { jobIds: [], jobAttemptIds: [], trendItemIds: [], autopsyCacheClaimIds: [] },
  },
  workspace: {
    scope: "workspace",
    workspaceId: "registration_workspace",
    stripeEventIds: [],
    stripeCustomerIds: [],
    sourceIds: { jobIds: [], jobAttemptIds: [], trendItemIds: [], autopsyCacheClaimIds: [] },
  },
  system: { scope: "system", installationId: "registration_installation" },
  activeOperation: { scope: "profile" },
} as const satisfies LifecycleRuntimeSubjects;

export type LifecycleRegistrationInput = Readonly<{
  migrations: MigrationInventory;
  /** Defaults to the shipped registry; tests plant alternatives. */
  registry?: readonly LifecycleClassEntry[];
}>;

export function assertLifecycleRegistration(input: LifecycleRegistrationInput): void {
  const registry = input.registry ?? LIFECYCLE_REGISTRY;
  validateLifecycleClosure({
    migrations: input.migrations,
    registry,
    writers: LIFECYCLE_WRITER_INVENTORY,
    rowClasses: ROW_CLASS_INVENTORY,
    jsonPaths: JSON_PATH_INVENTORY,
    jsonColumns: JSON_COLUMN_INVENTORY,
    externalWriters: EXTERNAL_WRITER_AUTHORITIES,
    supportingStores: SUPPORTING_LIFECYCLE_STORES,
    executors: LIFECYCLE_EXECUTORS,
    probes: LIFECYCLE_PROBES,
  });
  assertRetentionClockClosure({ registry, migrations: input.migrations });
  const expected = deriveExpectedResidueProbes(
    input.migrations, registry, ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, REGISTRATION_SUBJECTS, SUPPORTING_LIFECYCLE_STORES,
  );
  const targets = compileLifecycleExecutionTargets(
    input.migrations, registry, ROW_CLASS_INVENTORY, JSON_PATH_INVENTORY, REGISTRATION_SUBJECTS, SUPPORTING_LIFECYCLE_STORES,
  );
  assertProbeClosure(expected, LIFECYCLE_PROBES);
  assertExecutorProbeAgreement(targets, expected);
}

// Phase 10b-1 Task 4.3 — the worker-side composition of the deletion executor.
//
// The eraser runs ONLY here (plan C2: "never inside the HTTP request"). One
// pg-boss tick a minute claims due operations and advances each one step.
// Three ports are composed at startup and every one of them fails closed:
//
//   journal     — Task 5 supplies the S3 append-only store. Until it lands,
//                 `unavailableDeletionJournal` refuses every append, so no
//                 operation can advance past the state its request left it in.
//   commands    — the Stripe-backed adapter from @respin/credits/deletion-server.
//   enablement  — `RESPIN_DELETION_ERASURE_SCOPES` names the scopes whose
//                 irreversible erasure may run; unset means none (R-119 rollout).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  advanceDeletionOperations,
  composeDeletionJournal,
  parseDeletionJournalEnv,
  parseDeletionScopeList,
  resolveActivationExclusions,
  ERASURE_DISABLED,
  erasureHold,
  migrationInventory,
  type DbLike,
  type DeletionExecutorPorts,
  type DeletionJournalPort,
  type DeletionLifecycleTickSummary,
  type DeletionScope,
  type ErasureEnablementPort,
  type MigrationInventory,
} from "@respin/db";
// The AWS client enters the process through this one sanctioned entrypoint, the
// same shape as `@respin/credits/deletion-server`, so the app bundle never
// pulls the SDK in and the import-boundary test can keep it out.
import { createS3JournalClient, s3JournalWriter } from "@respin/db/deletion-journal-s3";

export const DELETION_ERASURE_SCOPES_ENV = "RESPIN_DELETION_ERASURE_SCOPES";

/**
 * Comma-separated closed scope list. An unknown token refuses startup rather
 * than silently enabling nothing or everything; blank/unset disables erasure.
 */
export function resolveErasureEnablement(
  env: Readonly<Record<string, string | undefined>>,
  hold: (scope: DeletionScope) => string | null = erasureHold
): ErasureEnablementPort {
  // The same closed parser the app's request flag uses (@respin/db), so the
  // two flags cannot drift in what they accept.
  const enabled = parseDeletionScopeList(env[DELETION_ERASURE_SCOPES_ENV], DELETION_ERASURE_SCOPES_ENV);
  if (enabled.size === 0) return ERASURE_DISABLED;
  for (const scope of enabled) {
    // The executor's own hold derivation (R-122 financial chain, the unwired
    // payload receiver). Naming a held scope is a misconfiguration — refused
    // loudly at startup rather than held silently at grace.
    //
    // It refuses NOTHING today: Task 6 emptied `FINANCIAL_CHAIN_TABLES` and
    // wired the payload receiver, so `erasureHold` returns null for every
    // scope. The check stays because it is the seam a future retained financial
    // table re-arms, and the executor's tests plant a hold through its
    // parameters to prove it still refuses. The previous comment claimed
    // "until Task 6 every scope is held", which stopped being true in Task 6.
    const reason = hold(scope);
    if (reason !== null) {
      throw new Error(
        `${DELETION_ERASURE_SCOPES_ENV} names ${scope}, but its erasure is held: ${reason} — enable it only after Task 6 wires the receivers`
      );
    }
  }
  return { erasureEnabled: (scope) => enabled.has(scope) };
}

export {
  DELETION_JOURNAL_ENV,
  JOURNAL_UNAVAILABLE_CODE,
  unavailableDeletionJournal,
} from "@respin/db";

/**
 * Compose the real S3 journal, or the refusing one when nothing is configured.
 * The parsing (including the partial-configuration refusal) is shared with the
 * app's request path in `@respin/db`'s `deletion-journal-compose`; the worker
 * differs only in supplying the statically imported adapter.
 */
export function resolveDeletionJournal(
  env: Readonly<Record<string, string | undefined>>
): DeletionJournalPort {
  return composeDeletionJournal(parseDeletionJournalEnv(env), (input) =>
    s3JournalWriter(createS3JournalClient(input))
  );
}

/** The committed migrations are the registry's schema authority at runtime too. */
export function loadMigrationInventory(
  migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../packages/db/migrations")
): MigrationInventory {
  return migrationInventory(
    readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), "utf8") }))
  );
}

export type DeletionLifecycleTick = (scheduledAt: Date) => Promise<DeletionLifecycleTickSummary>;

export function createDeletionLifecycleTick(input: Readonly<{
  db: DbLike;
  workerName: string;
  ports: DeletionExecutorPorts;
  migrations: MigrationInventory;
  limit?: number;
  /** Task 7: the process environment, read ONCE here for ADMIN_USER_IDS / ACTIVATION_EXCLUDED_USER_IDS. */
  env?: Readonly<Record<string, string | undefined>>;
}>): DeletionLifecycleTick {
  const activationExclusions = resolveActivationExclusions(input.env ?? {});
  return () =>
    advanceDeletionOperations(input.db, input.ports, {
      workerName: input.workerName,
      migrations: input.migrations,
      activationExclusions,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });
}

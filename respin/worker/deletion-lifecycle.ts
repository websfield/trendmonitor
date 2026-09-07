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
  assertJournalConfig,
  createDeletionJournalStore,
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
const SCOPES: readonly DeletionScope[] = ["identity", "profile", "workspace"];

/**
 * Comma-separated closed scope list. An unknown token refuses startup rather
 * than silently enabling nothing or everything; blank/unset disables erasure.
 */
export function resolveErasureEnablement(
  env: Readonly<Record<string, string | undefined>>,
  hold: (scope: DeletionScope) => string | null = erasureHold
): ErasureEnablementPort {
  const raw = env[DELETION_ERASURE_SCOPES_ENV]?.trim();
  if (!raw) return ERASURE_DISABLED;
  const enabled = new Set<DeletionScope>();
  for (const token of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (!(SCOPES as readonly string[]).includes(token)) {
      throw new Error(`${DELETION_ERASURE_SCOPES_ENV} names an unknown scope; allowed: ${SCOPES.join(",")}`);
    }
    enabled.add(token as DeletionScope);
  }
  for (const scope of enabled) {
    // The executor's own hold derivation (R-122 financial chain, the unwired
    // payload receiver). Naming a held scope is a misconfiguration — refused
    // loudly at startup rather than held silently at grace. Until Task 6
    // every scope is held, and this refuses every value.
    const reason = hold(scope);
    if (reason !== null) {
      throw new Error(
        `${DELETION_ERASURE_SCOPES_ENV} names ${scope}, but its erasure is held: ${reason} — enable it only after Task 6 wires the receivers`
      );
    }
  }
  return { erasureEnabled: (scope) => enabled.has(scope) };
}

export const JOURNAL_UNAVAILABLE_CODE = "journal_store_not_configured";

/**
 * Refuses every append. This is the composition when the deployment has no
 * journal configured — which is the state until an owner provisions the bucket
 * — and it is deliberately a REFUSAL rather than a local fallback: a journal
 * that quietly writes somewhere else is worse than no journal, because the
 * operation would advance on a durability promise nothing is keeping.
 */
export const unavailableDeletionJournal: DeletionJournalPort = Object.freeze({
  async appendTransition() {
    return { outcome: "conflict" as const, code: JOURNAL_UNAVAILABLE_CODE };
  },
});

export const DELETION_JOURNAL_ENV = Object.freeze({
  bucket: "RESPIN_DELETION_JOURNAL_BUCKET",
  region: "RESPIN_DELETION_JOURNAL_REGION",
  environment: "RESPIN_DELETION_JOURNAL_ENVIRONMENT",
  endpoint: "RESPIN_DELETION_JOURNAL_ENDPOINT",
});

/**
 * Compose the real S3 journal, or the refusing one when nothing is configured.
 *
 * PARTIAL configuration is a startup error, not a fallback. "Bucket set, region
 * missing" is an operator halfway through provisioning, and silently handing
 * that deployment a journal that refuses every append would look identical to a
 * deployment that never configured one — so it says so and stops.
 */
export function resolveDeletionJournal(
  env: Readonly<Record<string, string | undefined>>
): DeletionJournalPort {
  const bucket = env[DELETION_JOURNAL_ENV.bucket]?.trim();
  const region = env[DELETION_JOURNAL_ENV.region]?.trim();
  const environment = env[DELETION_JOURNAL_ENV.environment]?.trim();
  const endpoint = env[DELETION_JOURNAL_ENV.endpoint]?.trim();

  const present = [bucket, region, environment].filter((value) => Boolean(value)).length;
  if (present === 0) return unavailableDeletionJournal;
  if (present < 3) {
    throw new Error(
      `the deletion journal is partially configured: ${DELETION_JOURNAL_ENV.bucket}, ${DELETION_JOURNAL_ENV.region} and ${DELETION_JOURNAL_ENV.environment} must all be set, or all be unset. Set the missing one, or clear the others to run without a journal (every append then refuses and no deletion can advance).`
    );
  }

  const config = assertJournalConfig({
    bucket: bucket as string,
    region: region as string,
    environment: environment as string,
  });
  return createDeletionJournalStore({
    config,
    transport: s3JournalWriter(
      createS3JournalClient({
        region: config.region,
        ...(endpoint === undefined || endpoint.length === 0 ? {} : { endpoint }),
      })
    ),
  });
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
}>): DeletionLifecycleTick {
  return () =>
    advanceDeletionOperations(input.db, input.ports, {
      workerName: input.workerName,
      migrations: input.migrations,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });
}

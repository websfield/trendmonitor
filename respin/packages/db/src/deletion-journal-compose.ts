// Phase 10b-1 Task 8 — one journal composition for both processes.
//
// The worker composed the R-124 S3 journal from the environment in Task 5. The
// owner-facing request path (Task 8) needs the SAME composition, because a
// request is not acknowledged until its first journal record is durable (plan
// C4) — so the app must append too, and two copies of the env parsing would be
// two places for "partially configured" to be decided differently.
//
// The one thing the two processes do differently is HOW the S3 client enters:
// the worker imports the adapter statically; the app must not carry the AWS
// SDK in its bundle graph (Task 5's import boundary), so it loads the adapter
// lazily and only when the journal is actually configured. That difference is
// the `transport` argument, and nothing else.
import {
  assertJournalConfig,
  createDeletionJournalStore,
  type DeletionJournalConfig,
  type JournalWriterTransport,
} from "./deletion-journal";
import type { DeletionJournalPort } from "./deletion-ports";

export const DELETION_JOURNAL_ENV = Object.freeze({
  bucket: "RESPIN_DELETION_JOURNAL_BUCKET",
  region: "RESPIN_DELETION_JOURNAL_REGION",
  environment: "RESPIN_DELETION_JOURNAL_ENVIRONMENT",
  endpoint: "RESPIN_DELETION_JOURNAL_ENDPOINT",
});

export const JOURNAL_UNAVAILABLE_CODE = "journal_store_not_configured";

/**
 * Refuses every append. The composition when no journal is configured — the
 * state until an owner provisions the bucket — and deliberately a REFUSAL, not
 * a local fallback: a journal that quietly writes somewhere else is worse than
 * none, because the operation would advance on a durability promise nothing
 * is keeping. A deletion request made against this journal stops at
 * `journal_pending`, which is what the owner page shows.
 */
export const unavailableDeletionJournal: DeletionJournalPort = Object.freeze({
  async appendTransition() {
    return { outcome: "conflict" as const, code: JOURNAL_UNAVAILABLE_CODE };
  },
});

export type DeletionJournalEnv = Readonly<
  | { configured: false }
  | { configured: true; config: DeletionJournalConfig; endpoint: string | undefined }
>;

/**
 * Parse the environment. PARTIAL configuration throws: "bucket set, region
 * missing" is an operator halfway through provisioning, and a deployment that
 * silently got the refusing journal would look identical to one that never
 * configured anything.
 */
export function parseDeletionJournalEnv(env: Readonly<Record<string, string | undefined>>): DeletionJournalEnv {
  const bucket = env[DELETION_JOURNAL_ENV.bucket]?.trim();
  const region = env[DELETION_JOURNAL_ENV.region]?.trim();
  const environment = env[DELETION_JOURNAL_ENV.environment]?.trim();
  const endpoint = env[DELETION_JOURNAL_ENV.endpoint]?.trim();
  const present = [bucket, region, environment].filter(Boolean).length;
  if (present === 0) return { configured: false };
  if (present < 3) {
    throw new Error(
      `the deletion journal is partially configured: ${DELETION_JOURNAL_ENV.bucket}, ${DELETION_JOURNAL_ENV.region} and ${DELETION_JOURNAL_ENV.environment} must all be set, or none`,
    );
  }
  return {
    configured: true,
    config: assertJournalConfig({ bucket: bucket!, region: region!, environment: environment! }),
    endpoint: endpoint || undefined,
  };
}

export type JournalTransportFactory = (input: Readonly<{ region: string; endpoint?: string }>) => JournalWriterTransport;

/** The sync core both processes share; the parsed env decides refusing-vs-real. */
export function composeDeletionJournal(parsed: DeletionJournalEnv, transport: JournalTransportFactory): DeletionJournalPort {
  if (!parsed.configured) return unavailableDeletionJournal;
  const { config, endpoint } = parsed;
  return createDeletionJournalStore({
    config,
    transport: transport({ region: config.region, ...(endpoint ? { endpoint } : {}) }),
  });
}

/**
 * The app-side resolver. The adapter is imported ONLY here and ONLY when the
 * journal is configured, so an unprovisioned deployment never loads the SDK.
 */
export async function resolveAppDeletionJournal(
  env: Readonly<Record<string, string | undefined>>,
): Promise<Readonly<{ configured: boolean; journal: DeletionJournalPort }>> {
  const parsed = parseDeletionJournalEnv(env);
  if (!parsed.configured) return { configured: false, journal: unavailableDeletionJournal };
  const s3 = await import("./deletion-journal-s3");
  return {
    configured: true,
    journal: composeDeletionJournal(parsed, (input) => s3.s3JournalWriter(s3.createS3JournalClient(input))),
  };
}

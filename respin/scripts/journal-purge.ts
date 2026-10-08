// Phase 10b-1 Task 5 — the day-28 journal purge (R-119).
//
//   pnpm -C respin journal:purge                 # dry run: lists, deletes nothing
//   pnpm -C respin journal:purge --apply         # deletes expired versions
//
// It runs as the PURGE principal, whose only verb is "delete this exact object
// version". Two independent things have to agree before a byte is removed:
//
//   1. this script computes the candidate set from each record's own
//      retain-until, read back out of the object; and
//   2. S3 Object Lock in COMPLIANCE mode refuses the delete anyway if the lock
//      has not expired — for every principal, the account root included.
//
// So a bug here cannot delete a live journal version; it can only fail to
// delete an expired one, which is the safe direction. The script never writes,
// never repairs, and refuses to purge an operation whose chain does not verify:
// a damaged chain is evidence, and evidence is not garbage-collected.
import {
  assertJournalConfig,
  journalPurgeCandidates,
  listJournalOperations,
  loadJournalChain,
  type DeletionJournalConfig,
} from "@respin/db";
import {
  createS3JournalClient,
  s3JournalPurger,
  s3JournalVerifier,
} from "@respin/db/deletion-journal-s3";
import { isEntrypoint } from "./entrypoint";

function configFromEnv(
  env: Readonly<Record<string, string | undefined>>
): DeletionJournalConfig {
  const bucket = env.RESPIN_DELETION_JOURNAL_BUCKET?.trim();
  const region = env.RESPIN_DELETION_JOURNAL_REGION?.trim();
  const environment = env.RESPIN_DELETION_JOURNAL_ENVIRONMENT?.trim();
  if (!bucket || !region || !environment) {
    throw new Error(
      "RESPIN_DELETION_JOURNAL_BUCKET, _REGION and _ENVIRONMENT must all be set to purge the journal"
    );
  }
  return assertJournalConfig({ bucket, region, environment });
}

/**
 * What `main` reads and deletes through. The command line never passes this:
 * it builds the real S3 verifier and purger from the environment.
 * `tests/journal-purge.test.ts` passes the in-memory fake's, the same seam
 * `restore-verify.ts` has, so the exit codes and the never-purged unparseable
 * key are witnessed rather than described. Both types are derived from
 * functions this script already imports, so the operator-script import
 * allowlist does not widen.
 */
export type JournalPurgeDeps = Readonly<{
  verifier?: Parameters<typeof loadJournalChain>[0];
  purger?: ReturnType<typeof s3JournalPurger>;
}>;

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
  deps: JournalPurgeDeps = {}
): Promise<number> {
  const apply = argv.includes("--apply");
  const config = configFromEnv(env);
  const client =
    deps.verifier && deps.purger
      ? null
      : createS3JournalClient({
          region: config.region,
          ...(env.RESPIN_DELETION_JOURNAL_ENDPOINT
            ? { endpoint: env.RESPIN_DELETION_JOURNAL_ENDPOINT }
            : {}),
        });
  const verifier = deps.verifier ?? s3JournalVerifier(client!);
  const purger = deps.purger ?? s3JournalPurger(client!);

  const listing = await listJournalOperations(verifier, config);
  const operationIds = listing.operationIds;
  // A key the listing cannot parse belongs to no chain this script can verify,
  // so it is never a purge candidate — and it is never silent either: each one
  // is named here and the run exits 2 (register 2026-10-05 item 44). The
  // remedy is the one `restore-verify.ts` prints for the same key.
  for (const key of listing.unparseableKeys) {
    process.stdout.write(`UNPARSEABLE ${key} — not a {environment}/deletion-journal/{operationId}/{version}.json key, so it is never purged here; find what wrote it and stop that writer, then delete its versions by versionId once their COMPLIANCE lock has expired\n`);
  }
  let expired = 0;
  let deleted = 0;
  let blocked = 0;
  let refused = 0;
  let unknown = 0;

  for (const operationId of operationIds) {
    const chain = await loadJournalChain(verifier, config, operationId);
    if (chain.outcome === "conflict") {
      // A chain that does not verify is a finding, not a purge candidate.
      blocked += 1;
      process.stdout.write(
        `BLOCKED ${operationId}: ${chain.conflicts.map((c) => c.code).join(", ")} — investigate before any purge\n`
      );
      continue;
    }
    for (const candidate of journalPurgeCandidates(chain.records, now)) {
      expired += 1;
      if (!apply) {
        process.stdout.write(
          `would purge ${candidate.key} (version ${candidate.versionId}, lock expired ${candidate.retainUntil.toISOString()})\n`
        );
        continue;
      }
      const result = await purger.deleteObjectVersion(
        config.bucket,
        candidate.key,
        candidate.versionId
      );
      if (result.outcome === "deleted") {
        deleted += 1;
        process.stdout.write(`purged ${candidate.key} (${candidate.versionId})\n`);
      } else if (result.outcome === "refused") {
        refused += 1;
        process.stdout.write(
          `REFUSED ${candidate.key} (${candidate.versionId}): ${result.code}\n`
        );
      } else {
        // `unknown` is not `refused`: the version may or may not be gone, and
        // collapsing the two discards the distinction the transport preserves.
        unknown += 1;
        process.stdout.write(
          `UNKNOWN ${candidate.key} (${candidate.versionId}): ${result.code} — re-run to reconcile\n`
        );
      }
    }
  }

  process.stdout.write(
    `\noperations=${operationIds.length} unparseable_keys=${listing.unparseableKeys.length} expired_versions=${expired} deleted=${deleted} refused=${refused} unknown=${unknown} blocked_chains=${blocked} mode=${apply ? "apply" : "dry-run"}\n`
  );
  // Four outcomes must not pass silently. A blocked chain means the journal is
  // not trustworthy. A refusal means the purge principal cannot do its job — an
  // IAM drift, say — so day-28 removal is quietly not happening. An unknown
  // means a delete may or may not have landed. Round 1 caught this exiting 0
  // after every single delete had been refused (code CHANGE 11). An
  // unparseable key is an object this script will never purge.
  return blocked > 0 || refused > 0 || unknown > 0 || listing.unparseableKeys.length > 0 ? 2 : 0;
}

// Resolved paths, not URL-suffix matching: see ./entrypoint.ts (R-155).
if (isEntrypoint(import.meta.url, process.argv[1])) {
  void main(process.argv.slice(2), process.env, new Date()).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  );
}

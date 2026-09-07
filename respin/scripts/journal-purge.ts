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
  listJournalOperationIds,
  loadJournalChain,
  type DeletionJournalConfig,
} from "@respin/db";
import {
  createS3JournalClient,
  s3JournalPurger,
  s3JournalVerifier,
} from "@respin/db/deletion-journal-s3";

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

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  now: Date
): Promise<number> {
  const apply = argv.includes("--apply");
  const config = configFromEnv(env);
  const client = createS3JournalClient({
    region: config.region,
    ...(env.RESPIN_DELETION_JOURNAL_ENDPOINT
      ? { endpoint: env.RESPIN_DELETION_JOURNAL_ENDPOINT }
      : {}),
  });
  const verifier = s3JournalVerifier(client);
  const purger = s3JournalPurger(client);

  const operationIds = await listJournalOperationIds(verifier, config);
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
    `\noperations=${operationIds.length} expired_versions=${expired} deleted=${deleted} refused=${refused} unknown=${unknown} blocked_chains=${blocked} mode=${apply ? "apply" : "dry-run"}\n`
  );
  // Three outcomes must not pass silently. A blocked chain means the journal is
  // not trustworthy. A refusal means the purge principal cannot do its job — an
  // IAM drift, say — so day-28 removal is quietly not happening. An unknown
  // means a delete may or may not have landed. Round 1 caught this exiting 0
  // after every single delete had been refused (code CHANGE 11).
  return blocked > 0 || refused > 0 || unknown > 0 ? 2 : 0;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
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

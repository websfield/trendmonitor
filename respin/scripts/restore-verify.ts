// Phase 10b-1 Task 5 — restore-time journal verification (plan C4, steps 3-5).
//
// A restored database is the deletion record's own account of itself, rolled
// back to whenever the dump was taken. That is exactly the thing a deletion
// must survive, so before anything serves, the restored state is checked
// against the external journal, which lives outside the backup.
//
// This script answers three questions and refuses on any of them:
//
//   3. Does every journal record read, checksum, chain, and carry
//      the right COMPLIANCE lock? (`loadJournalChain` / `verifyJournalChain`)
//   5a. Is the restored database AHEAD of the journal — claiming a transition
//      the journal does not carry? Then the backup postdates a journal write
//      that is now missing, and the journal wins. (`compareRestoredState`)
//   5b. What must be replayed before traffic: which operations get their
//      tombstone reapplied, which get their erasure replayed, and which — only
//      a VERIFIED latest `cancelled` — may have access restored?
//      (`planJournalRestore`)
//
// WHAT IT DOES NOT DO, stated rather than implied: it does not perform the
// replay and it does not run a standalone residue sweep. The replay is the
// worker executor's erasure transaction, which already rolls back on non-zero
// residue; this script produces the plan and REFUSES to declare the restore
// serviceable, so "verified" can never be mistaken for "safe to serve".
//
//   pnpm -C respin exec tsx scripts/restore-verify.ts --operations <file.json>
//
// The restored database's own claims arrive as a JSON file that
// `restore-drill.sh` produces with psql, rather than through a client library
// here: this script then opens no connection at all, which is the property that
// makes it safe to run against a restore target that must not be written to.
//
// Exit codes:
//   0  every chain verified, no database-ahead conflict, plan printed
//   2  a conflict was found, or the journal is not configured/readable
import { readFileSync } from "node:fs";

/** R-119: journal objects are locked for 28 days and purged after. */
const JOURNAL_RETENTION_DAYS = 28;
const JOURNAL_RETENTION_MS = JOURNAL_RETENTION_DAYS * 86_400_000;

import {
  assertJournalConfig,
  compareRestoredState,
  listJournalOperationIds,
  loadJournalChain,
  planJournalRestore,
  type DeletionJournalConfig,
  type JournalOperationChain,
} from "@respin/db";
import { createS3JournalClient, s3JournalVerifier } from "@respin/db/deletion-journal-s3";

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function configFromEnv(
  env: Readonly<Record<string, string | undefined>>
): DeletionJournalConfig {
  const bucket = env.RESPIN_DELETION_JOURNAL_BUCKET?.trim();
  const region = env.RESPIN_DELETION_JOURNAL_REGION?.trim();
  const environment = env.RESPIN_DELETION_JOURNAL_ENVIRONMENT?.trim();
  if (!bucket || !region || !environment) {
    // Fail closed with a way forward. A restore that cannot reach the journal
    // must not serve, but the operator has to be told which knob is missing.
    throw new Error(
      "the deletion journal is not configured, so this restore cannot be verified and must not serve. Set RESPIN_DELETION_JOURNAL_BUCKET, _REGION and _ENVIRONMENT to the bucket the backup's era wrote to (infra/s3-deletion-journal/README.md)."
    );
  }
  return assertJournalConfig({ bucket, region, environment });
}

type RestoredOperation = Readonly<{
  id: string;
  state: string;
  journalVersion: number | null;
  requestedAt: string | null;
}>;

/**
 * What the restored database itself claims, as produced by restore-drill.sh.
 *
 * A malformed or absent file is a REFUSAL, not an empty map: "no operations"
 * and "could not read the operations" must never reach the same conclusion,
 * because the first permits serving and the second is an unknown.
 */
export function readRestoredOperations(
  path: string
): ReadonlyMap<string, { state: string; version: number; requestedAt: Date | null }> {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(
      `${path} does not contain a JSON array of deletion operations, so the restored state is unknown and this restore must not serve`
    );
  }
  const map = new Map<string, { state: string; version: number; requestedAt: Date | null }>();
  for (const row of parsed as readonly RestoredOperation[]) {
    if (typeof row?.id !== "string" || typeof row?.state !== "string") {
      throw new Error(`${path} contains a row without an id and state; the restored state is unknown`);
    }
    const requestedAt = row.requestedAt === null || row.requestedAt === undefined ? null : new Date(row.requestedAt);
    map.set(row.id, {
      state: row.state,
      version: row.journalVersion ?? 0,
      requestedAt: requestedAt !== null && Number.isNaN(requestedAt.getTime()) ? null : requestedAt,
    });
  }
  return map;
}

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>
): Promise<number> {
  const operationsFile = flag(argv, "operations");
  if (!operationsFile) {
    throw new Error(
      "--operations <file.json> is required: the restored database's deletion_operations rows, as produced by restore-drill.sh"
    );
  }

  const config = configFromEnv(env);
  const verifier = s3JournalVerifier(
    createS3JournalClient({
      region: config.region,
      ...(env.RESPIN_DELETION_JOURNAL_ENDPOINT
        ? { endpoint: env.RESPIN_DELETION_JOURNAL_ENDPOINT }
        : {}),
    })
  );

  let failures = 0;
  let preJournal = 0;
  let purgedChains = 0;
  {
    const restored = readRestoredOperations(operationsFile);
    const journalIds = await listJournalOperationIds(verifier, config);
    const chains: JournalOperationChain[] = [];

    // Step 3 — every journal record verifies.
    for (const operationId of journalIds) {
      const chain = await loadJournalChain(verifier, config, operationId);
      chains.push(chain);
      if (chain.outcome === "conflict") {
        failures += 1;
        for (const conflict of chain.conflicts) {
          process.stdout.write(`CONFLICT ${operationId} ${conflict.code}: ${conflict.detail}\n`);
        }
      }
    }

    // Step 5a — the restored database must not be ahead of the journal, and
    // must not claim an operation the journal has never heard of.
    for (const [operationId, row] of restored) {
      const chain = chains.find((candidate) => candidate.operationId === operationId);
      if (!chain) {
        // A restored row with NO journal chain is not automatically a conflict.
        // Round 2 found that treating it as one made the drill unpassable, and
        // there are two states that produce it legitimately — so the population
        // is enumerated here rather than derived from "no chain found".
        //
        //   1. PRE-JOURNAL. `journal_version` is `NOT NULL DEFAULT 0` and a
        //      request row commits at `requested` in its own transaction BEFORE
        //      any journal append. Version 0 means no version was ever written.
        //   2. PURGED. Journal objects are deleted at their day-28 Object Lock
        //      expiry; nothing deletes `deletion_operations` rows. From day 28
        //      onward EVERY completed deletion has a row and no chain, so the
        //      old check would have refused every production restore forever —
        //      a refusal whose printed remedy was impossible to satisfy.
        //
        // Anything else — a row claiming a journal version inside the retention
        // window with no object to show for it — is a genuine missing write.
        if (row.version === 0) {
          preJournal += 1;
          process.stdout.write(
            `pre-journal  ${operationId} state=${row.state} — no journal version was ever written (v0); the worker will append when it next claims it\n`
          );
          continue;
        }
        const purged =
          row.requestedAt !== null &&
          row.requestedAt.getTime() + JOURNAL_RETENTION_MS <= Date.now();
        if (purged) {
          purgedChains += 1;
          process.stdout.write(
            `purged       ${operationId} state=${row.state} v${row.version} — requested ${row.requestedAt?.toISOString()}, past the day-28 lock, so its objects are expected to be gone\n`
          );
          continue;
        }
        failures += 1;
        process.stdout.write(
          `CONFLICT ${operationId} database_ahead_of_journal: the restored database claims journal version ${row.version} (state ${row.state}${row.requestedAt ? `, requested ${row.requestedAt.toISOString()}` : ", requested date unknown"}) but the journal holds nothing for it, and it is inside the ${JOURNAL_RETENTION_DAYS}-day retention window\n`
        );
        continue;
      }
      const conflict = compareRestoredState({
        operationId,
        databaseState: row.state as never,
        databaseVersion: row.version,
        chain,
      });
      if (conflict) {
        failures += 1;
        process.stdout.write(`CONFLICT ${operationId} ${conflict.code}: ${conflict.detail}\n`);
      }
    }

    // Step 5b — the replay plan.
    const plan = planJournalRestore(chains);

    // Round-1 tenancy BLOCK 2. `advanceDeletionOperations` claims work by
    // SELECTing from `deletion_operations`; an operation the journal knows about
    // and the restored database does not is never claimed, so telling the
    // operator "run the worker and every step above is executed" was a false
    // remedy — the pre-request-backup case (plan C4's headline) would silently
    // leave a tombstoned workspace live. Nothing in this tree re-materialises a
    // journal-only operation, so this REFUSES rather than pretending.
    const unexecutable = plan.steps.filter(
      (step) => step.action !== "restore_access" && !restored.has(step.operationId)
    );
    for (const step of unexecutable) {
      failures += 1;
      process.stdout.write(
        `CONFLICT ${step.operationId} journal_operation_absent_from_database: the journal records this operation at ${step.state} (v${step.latestVersion}) and needs "${step.action}", but the restored database has no row for it, so the worker cannot claim it. The backup predates the request. Re-materialising a journal-only operation is not implemented; this restore must not serve.
`
      );
    }
    process.stdout.write(
      `\njournal_operations=${journalIds.length} restored_operations=${restored.size} pre_journal=${preJournal} purged=${purgedChains} conflicts=${failures}\n`
    );
    for (const step of plan.steps) {
      process.stdout.write(
        `  ${step.action.padEnd(18)} ${step.operationId} scope=${step.scope} state=${step.state} v${step.latestVersion}\n`
      );
    }

    if (failures > 0 || plan.outcome === "blocked") {
      process.stdout.write(
        "\nRESTORE REFUSED. Do not enable workers or traffic. Every conflict above must be explained before this database serves anyone.\n"
      );
      return 2;
    }

    process.stdout.write(
      [
        "",
        "JOURNAL VERIFIED. This is NOT yet permission to serve.",
        "",
        "Every operation above has a row in the restored database, so the worker",
        "can claim it. Before any worker or traffic is enabled:",
        "  1. run the deletion worker against THIS database with the journal configured,",
        "     so every reapply_tombstone / replay_erasure step above is executed;",
        "  2. confirm the erasure transactions committed (a non-zero residue rolls them",
        "     back and leaves the operation blocked, which is the intended outcome);",
        "  3. only then enable workers, then traffic.",
        "",
        "A standalone post-replay residue sweep is not wired into this script; the",
        "residue check that exists today runs inside the executor's erasure",
        "transaction. Until the production restore walk records one, treat step 2 as",
        "the residue evidence and say so in the transcript.",
        "",
      ].join("\n")
    );
    return 0;
  }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  void main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  );
}

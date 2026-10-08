// Phase 10b-1 Task 5 — the operator projection of the deletion-journal cost
// forecast and the new-account/public enablement decision it gates.
//
//   pnpm -C respin journal:forecast
//   pnpm -C respin journal:forecast --region eu-west-2
//   pnpm -C respin journal:forecast --measured-bytes 1234 --measured-puts 50 --measured-reads 900
//   pnpm -C respin journal:forecast --owner-ceiling-cents 250   # a RECORDED owner decision raising the USD 1 ceiling
//
// Exit codes are the point of this script, because they are what a deployment
// checklist can actually gate on:
//
//   0  a forecast exists and enablement is allowed
//   0  ...and it is at or above the USD 0.50 alert (the alert is printed)
//   2  enablement is BLOCKED: the forecast is over the ceiling, or withheld
//
// It reads a price sheet off disk and prints arithmetic. It holds no
// credential, opens no socket, creates no AWS resource, and cannot touch a
// deletion operation — which is the whole reason the forecast lives in a pure
// module the executor does not import.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeForecast,
  forecastDeletionJournalCost,
  journalEnablementDecision,
  type JournalUsageBasis,
} from "@respin/db";
import { isEntrypoint } from "./entrypoint";

const SNAPSHOT_PREFIX = "price-snapshot.";
const SNAPSHOT_SUFFIX = ".json";
/** Not a region. The shipped template must never price anything. */
const TEMPLATE_REGION = "EXAMPLE";

function snapshotDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../infra/s3-deletion-journal");
}

/** Every operator-recorded snapshot on disk. The template is skipped by name. */
export function loadPriceSnapshots(dir = snapshotDir()): readonly unknown[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .filter(
      (name) =>
        name.startsWith(SNAPSHOT_PREFIX) &&
        name.endsWith(SNAPSHOT_SUFFIX) &&
        name.slice(SNAPSHOT_PREFIX.length, -SNAPSHOT_SUFFIX.length) !== TEMPLATE_REGION
    )
    .sort()
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown);
}

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

function integerFlag(argv: readonly string[], name: string): number | undefined {
  const raw = flag(argv, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`--${name} must be a non-negative integer, got ${JSON.stringify(raw)}`);
  }
  return value;
}

export function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  now: Date,
  /**
   * The price sheets the forecast reads. Defaults to the ones on disk; a test
   * injects a reviewed sheet so the three priced exit codes (allowed, alert,
   * blocked-over-ceiling) are executed THROUGH this artefact rather than only
   * in the pure module — the 10b-1 phase review found every CLI case took the
   * `withheld` branch because nothing could inject a price.
   */
  snapshots: readonly unknown[] = loadPriceSnapshots()
): number {
  const region = flag(argv, "region") ?? env.RESPIN_DELETION_JOURNAL_REGION ?? null;
  // The ONE producer of `ownerCostCeilingCents`: an operator citing a recorded
  // owner decision. It can only RAISE the ceiling (the module clamps at the
  // USD 1 default), never lower it, and it never touches the alert line.
  const ownerCeiling = integerFlag(argv, "owner-ceiling-cents");

  const bytes = integerFlag(argv, "measured-bytes");
  const puts = integerFlag(argv, "measured-puts");
  const reads = integerFlag(argv, "measured-reads");
  const measured = [bytes, puts, reads].filter((value) => value !== undefined).length;
  if (measured > 0 && measured < 3) {
    // A partial measurement would silently price the missing terms at zero,
    // which is the one direction a budget check must never round.
    throw new Error(
      "--measured-bytes, --measured-puts and --measured-reads must be given together, or not at all"
    );
  }
  const usage: JournalUsageBasis | undefined =
    measured === 3
      ? {
          basis: "measured",
          storedBytes: bytes as number,
          putRequests: puts as number,
          readRequests: reads as number,
          windowStart: new Date(now.getTime() - 30 * 86_400_000),
          windowEnd: now,
        }
      : undefined;

  const forecast = forecastDeletionJournalCost({
    region,
    snapshots,
    now,
    ...(usage === undefined ? {} : { usage }),
    ...(ownerCeiling === undefined ? {} : { ownerCostCeilingCents: BigInt(ownerCeiling) }),
  });
  const decision = journalEnablementDecision(forecast);

  process.stdout.write(`${describeForecast(forecast)}\n\n`);
  process.stdout.write(
    `New-account / public enablement: ${decision.allowed ? "ALLOWED" : "BLOCKED"} (${decision.code})\n`
  );
  process.stdout.write(`${decision.reason}\n`);
  if (decision.alert) {
    process.stdout.write("\nALERT: this forecast needs an operator's attention.\n");
  }
  process.stdout.write(
    "\nActive deletions, journal appends, purges, restores and residue verification are NEVER gated by this number.\n"
  );

  return decision.allowed ? 0 : 2;
}

// `import.meta.url` guard so the module can be imported by a test without
// running and without setting a process exit code.
// Resolved paths, not URL-suffix matching: see ./entrypoint.ts (R-155).
if (isEntrypoint(import.meta.url, process.argv[1])) {
  process.exitCode = main(process.argv.slice(2), process.env, new Date());
}

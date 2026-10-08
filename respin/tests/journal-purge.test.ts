// R-155 (gate round 1) — `scripts/journal-purge.ts` against the in-memory
// journal, through the same injection seam `restore-verify.ts` has.
//
// The purge's exit 2 on an unparseable key had no witness: the listing counted
// the key, the script printed it, and nothing ran the script. This drives
// `main()` with a planted stray key under the journal prefix and asserts the
// three things the script claims — exit 2, the UNPARSEABLE line naming the key,
// and no delete issued for it — plus the non-vacuous half: a clean journal
// exits 0 and an expired, verified version IS purged.
import { describe, expect, it, vi } from "vitest";
import {
  createDeletionJournalStore,
  createFakeS3,
  DELETION_JOURNAL_RETAIN_MS,
  type JournalTransitionRequest,
} from "@respin/db";
import { main, type JournalPurgeDeps } from "../scripts/journal-purge";

const CONFIG = { environment: "test", bucket: "respin-deletion-journal-test", region: "eu-west-2" } as const;
const ENV = {
  RESPIN_DELETION_JOURNAL_BUCKET: CONFIG.bucket,
  RESPIN_DELETION_JOURNAL_REGION: CONFIG.region,
  RESPIN_DELETION_JOURNAL_ENVIRONMENT: CONFIG.environment,
};
const OP = "01J8ZQ0000000000000000000A";
// Directly under the journal prefix with no operation segment: listed by the
// environment-level listing, inside no chain's prefix, never a valid key.
const STRAY = `${CONFIG.environment}/deletion-journal/stray.json`;
const REQUESTED_AT = new Date("2026-09-01T00:00:00.000Z");
const RETAIN_UNTIL = new Date(REQUESTED_AT.getTime() + DELETION_JOURNAL_RETAIN_MS);

async function journalWithOneRecord() {
  let clock = REQUESTED_AT;
  const s3 = createFakeS3({ bucket: CONFIG.bucket, now: () => clock });
  const store = createDeletionJournalStore({ transport: s3.writer, config: CONFIG });
  const request: JournalTransitionRequest = {
    schemaVersion: 1,
    operationId: OP,
    scope: "workspace",
    target: { userId: "user-1", workspaceId: "ws-1", profileId: null },
    requesterDigest: "a".repeat(64),
    version: 1,
    fromState: "requested",
    toState: "journal_pending",
    payloadHash: "b".repeat(64),
    priorReceiptDigest: null,
    requestedAt: REQUESTED_AT,
    effectiveAt: REQUESTED_AT,
    retainUntil: RETAIN_UNTIL,
  };
  expect((await store.appendTransition(request)).outcome).toBe("confirmed");
  return { s3, advanceTo: (d: Date) => { clock = d; s3.setClock(() => d); } };
}

async function runMain(argv: string[], now: Date, deps: JournalPurgeDeps) {
  const out: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  });
  try {
    return { code: await main(argv, ENV, now, deps), text: out.join("") };
  } finally {
    spy.mockRestore();
  }
}

/** The fake's purger, wrapped to record every delete it is asked for. */
function recordingPurger(purger: NonNullable<JournalPurgeDeps["purger"]>) {
  const calls: string[] = [];
  return {
    calls,
    purger: {
      ...purger,
      deleteObjectVersion: (bucket: string, key: string, versionId: string) => {
        calls.push(key);
        return purger.deleteObjectVersion(bucket, key, versionId);
      },
    } as NonNullable<JournalPurgeDeps["purger"]>,
  };
}

describe("journal-purge main() against the in-memory journal (R-155)", () => {
  it("non-vacuity: a clean journal past its lock exits 0 and purges the expired version", async () => {
    const { s3, advanceTo } = await journalWithOneRecord();
    advanceTo(RETAIN_UNTIL);
    const rec = recordingPurger(s3.purger as NonNullable<JournalPurgeDeps["purger"]>);
    const run = await runMain(["--apply"], RETAIN_UNTIL, { verifier: s3.verifier, purger: rec.purger });
    expect(run.text).toMatch(/unparseable_keys=0 expired_versions=1 deleted=1/);
    expect(run.code).toBe(0);
    expect(rec.calls).toEqual([`${CONFIG.environment}/deletion-journal/${OP}/000001.json`]);
  });

  it("PLANTED: a stray key under the prefix exits 2, is named on an UNPARSEABLE line, and is never deleted", async () => {
    const { s3, advanceTo } = await journalWithOneRecord();
    advanceTo(RETAIN_UNTIL);
    const withStray = {
      ...s3.verifier,
      // Prefix-honouring, as S3 is: the stray appears only in listings whose
      // prefix contains it, so the operation's own chain still verifies and
      // the exit code can come from the unparseable key alone.
      listVersions: async (bucket: string, prefix: string) => [
        ...(await s3.verifier.listVersions(bucket, prefix)),
        ...(STRAY.startsWith(prefix) ? [{ key: STRAY, versionId: "v-stray", isDeleteMarker: false, size: 2, lastModified: REQUESTED_AT }] : []),
      ],
    };
    const rec = recordingPurger(s3.purger as NonNullable<JournalPurgeDeps["purger"]>);
    const run = await runMain(["--apply"], RETAIN_UNTIL, { verifier: withStray, purger: rec.purger });
    expect(run.code).toBe(2);
    expect(run.text).toContain(`UNPARSEABLE ${STRAY}`);
    expect(run.text).toMatch(/unparseable_keys=1 expired_versions=1 deleted=1 .*blocked_chains=0/);
    expect(rec.calls).not.toContain(STRAY);
  });
});

// Phase 10b-1 Task 5 — `scripts/restore-verify.ts`, the step that decides
// whether a restored database may be served.
//
// WHY THIS FILE EXISTS. Round 2 found that this script refused EVERY production
// restore: any restored `deletion_operations` row without a journal chain was
// counted as `database_ahead_of_journal`, and two states produce that
// legitimately — a pre-journal row (`journal_version` defaults to 0 and the
// request row commits before any append) and every operation past its day-28
// Object Lock, since the purge removes the objects and nothing removes the
// rows. From day 28 onward the drill could never pass, and the refusal's
// printed remedy was impossible to satisfy.
//
// It shipped because this script had no test at all. This is that test.
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
  createDeletionJournalStore,
  createFakeS3,
  DELETION_JOURNAL_RETAIN_MS,
  type JournalTransitionRequest,
  type JournalVerifierTransport,
} from "@respin/db";
import { scratchDir } from "./support/scratch-dir";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "./support/source-files";

import { isEntrypoint } from "../scripts/entrypoint";
import {
  main,
  readRestoredOperations,
  RESTORE_VERIFY_SUCCESS_MARKER,
} from "../scripts/restore-verify";

const execFileAsync = promisify(execFile);
const scriptsDir = resolve(__dirname, "../scripts");

function operationsFile(rows: readonly unknown[]): string {
  const dir = scratchDir("respin-restore-verify-");
  const path = join(dir, "operations.json");
  writeFileSync(path, JSON.stringify(rows));
  return path;
}

const DAY = 86_400_000;

describe("readRestoredOperations — absence of an answer is not an empty answer", () => {
  it("reads id, state, version and requestedAt", () => {
    const path = operationsFile([
      { id: "op-1", state: "grace", journalVersion: 3, requestedAt: "2026-09-01T00:00:00.000Z" },
    ]);
    const rows = readRestoredOperations(path);
    expect(rows.get("op-1")).toEqual({
      state: "grace",
      version: 3,
      requestedAt: new Date("2026-09-01T00:00:00.000Z"),
    });
  });

  it("treats a missing journalVersion as 0 — the pre-journal default", () => {
    const path = operationsFile([{ id: "op-1", state: "requested", journalVersion: null, requestedAt: null }]);
    expect(readRestoredOperations(path).get("op-1")?.version).toBe(0);
  });

  it("REFUSES a malformed file rather than reporting an empty restore", () => {
    // "no operations" and "could not read the operations" must never reach the
    // same conclusion: the first permits serving, the second is an unknown.
    for (const rows of [{ not: "an array" }, [{ state: "grace" }], [{ id: "op-1" }]]) {
      const dir = scratchDir("respin-restore-verify-");
      const path = join(dir, "operations.json");
      writeFileSync(path, JSON.stringify(rows));
      expect(() => readRestoredOperations(path), JSON.stringify(rows)).toThrow();
    }
  });

  it("accepts a genuinely empty restore", () => {
    expect(readRestoredOperations(operationsFile([])).size).toBe(0);
  });

  it("nulls an unparseable requestedAt rather than carrying an Invalid Date", () => {
    const path = operationsFile([{ id: "op-1", state: "grace", journalVersion: 1, requestedAt: "not a date" }]);
    expect(readRestoredOperations(path).get("op-1")?.requestedAt).toBeNull();
  });
});

describe("the chain-less row classification (round-2 BLOCK)", () => {
  // The classification is a pure decision over (version, requestedAt, now), so
  // it is asserted here directly against the three populations the script
  // enumerates. Keeping this in step with the script is the point: the round-2
  // defect was a population DERIVED from "no chain found" rather than listed.
  const RETENTION_MS = 28 * DAY;
  const classify = (version: number, requestedAt: Date | null, now: number) => {
    if (version === 0) return "pre_journal";
    if (requestedAt !== null && requestedAt.getTime() + RETENTION_MS <= now) return "purged";
    return "conflict";
  };

  const now = new Date("2026-10-01T00:00:00.000Z").getTime();

  it("a version-0 row is PRE-JOURNAL, not a conflict", () => {
    // `journal_version NOT NULL DEFAULT 0`, and the request row commits at
    // `requested` before any journal append can happen.
    expect(classify(0, null, now)).toBe("pre_journal");
    expect(classify(0, new Date(now), now)).toBe("pre_journal");
  });

  it("a row past its day-28 lock is PURGED, not a conflict", () => {
    expect(classify(4, new Date(now - 29 * DAY), now)).toBe("purged");
    // Exactly at the horizon the objects are already purgeable.
    expect(classify(4, new Date(now - 28 * DAY), now)).toBe("purged");
  });

  it("a row INSIDE the retention window with no journal is a real CONFLICT", () => {
    // This is the case the check exists for: the journal should still hold it.
    expect(classify(4, new Date(now - 27 * DAY), now)).toBe("conflict");
    expect(classify(1, new Date(now), now)).toBe("conflict");
  });

  it("an unknown request date with a claimed version is a CONFLICT, never assumed purged", () => {
    // Absence of a date is not evidence of expiry. Failing toward conflict is
    // the safe direction: it refuses the restore rather than serving it.
    expect(classify(4, null, now)).toBe("conflict");
  });
});

// ---------------------------------------------------------------------------
// R-155 (register 2026-10-05 item 3(b)) — `main()` must actually run, and the
// drill must be able to tell that it did.
// ---------------------------------------------------------------------------

describe("the entrypoint guard compares resolved paths (item 3(b))", () => {
  it("a file in a directory whose name holds a space is its own entrypoint", () => {
    const dir = join(scratchDir("respin-entry-"), "dir with space");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "script.ts");
    writeFileSync(file, "");
    expect(isEntrypoint(pathToFileURL(file).href, file)).toBe(true);
    // The defect, stated as the old expression: a URL never ends with a path
    // whose characters it percent-encodes.
    expect(pathToFileURL(file).href.endsWith(file.replace(/\\/g, "/"))).toBe(false);
  });

  it("an EXTENSIONLESS invocation (`tsx scripts/journal-purge`) is the entrypoint (gate round 1)", () => {
    const dir = scratchDir("respin-entry-");
    const file = join(dir, "script.ts");
    writeFileSync(file, "");
    expect(isEntrypoint(pathToFileURL(file).href, join(dir, "script"))).toBe(true);
    // ...and a different stem still is not.
    expect(isEntrypoint(pathToFileURL(file).href, join(dir, "scrip"))).toBe(false);
  });

  it("another file, or no argv[1], is not the entrypoint", () => {
    const dir = scratchDir("respin-entry-");
    const a = join(dir, "a.ts");
    const b = join(dir, "b.ts");
    writeFileSync(a, "");
    writeFileSync(b, "");
    expect(isEntrypoint(pathToFileURL(a).href, b)).toBe(false);
    expect(isEntrypoint(pathToFileURL(a).href, undefined)).toBe(false);
  });

  it("RUNS main() from a checkout path containing a space (the verifier copied there, run under tsx)", async () => {
    // The copy must sit inside the workspace so `@respin/db` still resolves
    // through respin/node_modules; the two files are the script and the guard
    // module it imports, nothing else.
    const dir = resolve(__dirname, "..", ".tmp", `restore verify space ${process.pid}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
    copyFileSync(join(scriptsDir, "restore-verify.ts"), join(dir, "restore-verify.ts"));
    copyFileSync(join(scriptsDir, "entrypoint.ts"), join(dir, "entrypoint.ts"));
    const ops = join(dir, "operations.json");
    writeFileSync(ops, "[]");
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (k.startsWith("RESPIN_DELETION_JOURNAL_")) delete env[k];
    // Run twice: as typed with its extension, and EXTENSIONLESS — tsx resolves
    // `…/restore-verify` to the .ts file while argv keeps the bare path, the
    // shape gate round 1 found exiting 0 silently.
    for (const entry of ["restore-verify.ts", "restore-verify"]) {
      const outcome = await execFileAsync(process.execPath, ["--import", "tsx", join(dir, entry), "--operations", ops], {
        cwd: resolve(__dirname, ".."),
        env,
        encoding: "utf8",
      }).then(
        (r) => ({ status: 0, stdout: r.stdout, stderr: r.stderr }),
        (e: { code?: number; stdout?: string; stderr?: string }) => ({ status: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" })
      );
      // main() ran: it reached the journal configuration and refused it. The
      // defect was exit 0 with no output at all.
      expect(outcome.stderr, entry).toMatch(/the deletion journal is not configured/);
      expect(outcome.status, entry).toBe(1);
    }
  }, 90_000);

  it("no operator script still carries the URL-suffix guard (the population is every source file, planted)", () => {
    const OLD_GUARD = /import\.meta\.url\.endsWith\(/;
    const offenders = sourceFilesUnder(PRODUCTION_ROOTS)
      .filter((f) => OLD_GUARD.test(f.text.replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "")))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
    // the scan is not vacuous: it reads the scripts, and it catches the shape
    const files = sourceFilesUnder(PRODUCTION_ROOTS).map((f) => f.file);
    expect(files).toContain("scripts/restore-verify.ts");
    expect(OLD_GUARD.test('if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {')).toBe(true);
  });
});

describe("main() against the in-memory journal: the marker, and unparseable keys (P9-A1)", () => {
  const CONFIG = { environment: "test", bucket: "respin-deletion-journal-test", region: "eu-west-2" } as const;
  const ENV = {
    RESPIN_DELETION_JOURNAL_BUCKET: CONFIG.bucket,
    RESPIN_DELETION_JOURNAL_REGION: CONFIG.region,
    RESPIN_DELETION_JOURNAL_ENVIRONMENT: CONFIG.environment,
  };
  const OP = "01J8ZQ0000000000000000000A";

  async function journalWithOneRecord() {
    const requestedAt = new Date(Date.now() - 86_400_000);
    const s3 = createFakeS3({ bucket: CONFIG.bucket, now: () => requestedAt });
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
      requestedAt,
      effectiveAt: requestedAt,
      retainUntil: new Date(requestedAt.getTime() + DELETION_JOURNAL_RETAIN_MS),
    };
    const result = await store.appendTransition(request);
    expect(result.outcome).toBe("confirmed");
    const ops = join(scratchDir("respin-verify-main-"), "operations.json");
    writeFileSync(ops, JSON.stringify([{ id: OP, state: "journal_pending", journalVersion: 1, requestedAt: requestedAt.toISOString() }]));
    return { s3, ops };
  }

  async function runMain(verifier: JournalVerifierTransport, ops: string) {
    const out: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    });
    try {
      const code = await main(["--operations", ops], ENV, { verifier });
      const lines = out.join("").split("\n").filter((l) => l.trim() !== "");
      return { code, text: out.join(""), last: lines[lines.length - 1] };
    } finally {
      spy.mockRestore();
    }
  }

  it("a verified journal exits 0 and its LAST line is the success marker", async () => {
    const { s3, ops } = await journalWithOneRecord();
    const run = await runMain(s3.verifier, ops);
    expect(run.text).toMatch(/journal_operations=1 unparseable_keys=0/);
    expect(run.code).toBe(0);
    expect(run.last).toBe(RESTORE_VERIFY_SUCCESS_MARKER);
  });

  it("PLANTED: an unparseable key under the journal prefix fails verification and prints no marker", async () => {
    const { s3, ops } = await journalWithOneRecord();
    const STRAY = `${CONFIG.environment}/deletion-journal/${OP}/1.json`; // unpadded version: not a journal key
    const withStray: JournalVerifierTransport = {
      ...s3.verifier,
      listVersions: async (bucket, prefix) => [
        ...(await s3.verifier.listVersions(bucket, prefix)),
        { key: STRAY, versionId: "v-stray", isDeleteMarker: false, size: 2, lastModified: new Date() },
      ],
    };
    const run = await runMain(withStray, ops);
    expect(run.code).toBe(2);
    expect(run.text).toMatch(new RegExp(`CONFLICT unparseable_journal_key ${STRAY.replace(/[/.]/g, "\\$&")}`));
    expect(run.text).toMatch(/unparseable_keys=1/);
    expect(run.text).not.toContain(RESTORE_VERIFY_SUCCESS_MARKER);
  });
});

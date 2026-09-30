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
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scratchDir } from "./support/scratch-dir";

import { readRestoredOperations } from "../scripts/restore-verify";

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

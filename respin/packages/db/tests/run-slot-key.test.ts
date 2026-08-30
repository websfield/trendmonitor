// The run-slot key is INJECTIVE, asserted as a property.
//
// WHY THIS FILE EXISTS. The tenancy gate (round 2, 2026-08-28) found that
// `run-slot.ts` claimed its prefix made the run-slot and workspace-lock
// keyspaces "disjoint by construction". It does not — every key goes through
// one `hashtextextended` into one 64-bit space — and the Docker case backing
// the claim compared exactly ONE pair of workspace ids, which is the
// list-of-counterexamples shape CLAUDE.md's 2026-08-18 lesson names.
//
// What IS true, and what a cross-tenant denial of service depends on, is that
// distinct `(workspaceId, index)` pairs produce distinct key STRINGS. That is a
// property, so it is tested as one: generatively, over the id shapes a real
// system produces plus the adversarial ones a uuid assumption would miss.
import { describe, expect, it } from "vitest";
import {
  RUN_SLOT_KEY_PREFIX,
  CONTROL_SLOT_KEY_PREFIX,
  runSlotKeyName,
  type VerifiedWorkspaceId,
} from "@respin/db";

/** The brand is server-minted; a test names ids directly and must say so. */
const ws = (id: string) => id as VerifiedWorkspaceId;

/**
 * Id shapes chosen to BREAK a naive key, not to confirm a working one.
 *
 * The colon-bearing entries are the ones that matter: `runslot:{ws}:{i}` would
 * be ambiguous if an id could itself contain the separator AND the index could
 * be non-numeric. It cannot — the index is an integer — and these prove that
 * rather than assuming a uuid shape the type does not enforce (`VerifiedWorkspaceId`
 * is `string & {…}`, so any string can carry the brand).
 */
const WORKSPACE_IDS = [
  "0195aa11-2222-7333-8444-555566667777",
  "0195aa11-2222-7333-8444-555566667778",
  "",
  "a",
  "a:b",
  "a:b:c",
  "runslot:a",
  "runslot:a:1",
  ":",
  "1",
  "11",
  "a:1",
  "é中文",
  "with space",
];

const INDEXES = [0, 1, 2, 9, 10, 11, 99, 100];

describe("the run-slot key is injective in (workspaceId, index)", () => {
  it("no two distinct pairs produce the same key, across adversarial id shapes", () => {
    const seen = new Map<string, string>();
    for (const id of WORKSPACE_IDS) {
      for (const i of INDEXES) {
        const key = runSlotKeyName(ws(id), i);
        const pair = JSON.stringify([id, i]);
        const clash = seen.get(key);
        expect(
          clash,
          `two workspaces would share a slot: ${clash} and ${pair} both map to ${key}`
        ).toBeUndefined();
        seen.set(key, pair);
      }
    }
    // NON-VACUITY: the loop really did compare a meaningful population, and a
    // count is the cheapest way to say so — an empty WORKSPACE_IDS would
    // otherwise pass this test having proved nothing.
    expect(seen.size).toBe(WORKSPACE_IDS.length * INDEXES.length);
    expect(seen.size).toBeGreaterThan(100);
  });

  it("NON-VACUITY: a key that DROPPED the workspace id would fail this test", () => {
    // The mutation the Docker suite catches, reproduced here as a property so
    // the two instruments fail for the same reason. If this ever passes, the
    // test above has stopped discriminating.
    const naive = (_id: VerifiedWorkspaceId, i: number) =>
      `${RUN_SLOT_KEY_PREFIX}${i}`;
    const a = naive(ws("workspace-a"), 0);
    const b = naive(ws("workspace-b"), 0);
    expect(a, "a key without the workspace id collides across tenants").toBe(b);
    // ...while the real one does not, for the same two ids.
    expect(runSlotKeyName(ws("workspace-a"), 0)).not.toBe(
      runSlotKeyName(ws("workspace-b"), 0)
    );
  });

  it("every key is namespaced, so it cannot be confused with another lock family", () => {
    // The workspace lock hashes the BARE id and the brain lock uses `brain:`.
    // This does not make the hashed keyspaces disjoint — see the prefix's own
    // docblock — but it does mean no run-slot NAME is ever equal to a name
    // another family would build.
    for (const id of WORKSPACE_IDS) {
      const key = runSlotKeyName(ws(id), 0);
      expect(key.startsWith(RUN_SLOT_KEY_PREFIX)).toBe(true);
      expect(key).not.toBe(id);
      expect(key.startsWith("brain:")).toBe(false);
    }
  });

  it("keeps edit and export slots distinct from generation for the same workspace", () => {
    const workspace = ws("workspace-a");
    expect(runSlotKeyName(workspace, 0, "brain-edit")).not.toBe(
      runSlotKeyName(workspace, 0)
    );
    expect(runSlotKeyName(workspace, 0, "export")).not.toBe(
      runSlotKeyName(workspace, 0, "brain-edit")
    );
    expect(runSlotKeyName(workspace, 0, "export")).toBe(
      `${CONTROL_SLOT_KEY_PREFIX}export:workspace-a:0`
    );
  });

  it("is injective across the closed operation namespace as well", () => {
    const seen = new Set<string>();
    for (const namespace of ["generation", "brain-edit", "export"] as const) {
      for (const id of WORKSPACE_IDS) {
        for (const index of INDEXES) {
          const key = runSlotKeyName(ws(id), index, namespace);
          expect(seen.has(key), `${namespace}:${id}:${index} collided at ${key}`).toBe(false);
          seen.add(key);
        }
      }
    }
    expect(seen.size).toBe(3 * WORKSPACE_IDS.length * INDEXES.length);
  });
});

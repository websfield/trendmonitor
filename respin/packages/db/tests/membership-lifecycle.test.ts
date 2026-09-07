import { describe, expect, it, vi } from "vitest";
import type { TxLike } from "../src/db-like";
import {
  sortedWorkspaceIds,
  withMembershipGraphLocks,
} from "../src/membership-lifecycle";

function embeddedLockKey(query: unknown): string {
  const encoded = JSON.stringify(query);
  const match = encoded.match(/(identity|workspace)-membership:[^"\\]+/);
  if (!match) throw new Error(`missing advisory-lock key in ${encoded}`);
  return match[0];
}

describe("membership lifecycle lock authority", () => {
  it("deduplicates workspace ids into stable lexical order without mutating input", () => {
    const input = ["workspace-z", "workspace-a", "workspace-z", "workspace-m"];
    expect(sortedWorkspaceIds(input)).toEqual([
      "workspace-a",
      "workspace-m",
      "workspace-z",
    ]);
    expect(input).toEqual([
      "workspace-z",
      "workspace-a",
      "workspace-z",
      "workspace-m",
    ]);
  });

  it("takes the identity lock first, then each sorted workspace lock, before mutation", async () => {
    const calls: string[] = [];
    const tx = {
      execute: vi.fn(async (query: unknown) => {
        calls.push(embeddedLockKey(query));
        return [];
      }),
    } as unknown as TxLike;
    const mutate = vi.fn(async () => {
      expect(calls).toEqual([
        "identity-membership:user-1",
        "workspace-membership:workspace-a",
        "workspace-membership:workspace-m",
        "workspace-membership:workspace-z",
      ]);
      return "done";
    });

    await expect(
      withMembershipGraphLocks(
        tx,
        "user-1",
        ["workspace-z", "workspace-a", "workspace-m", "workspace-a"],
        mutate
      )
    ).resolves.toBe("done");
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("never invokes the mutation when any lock acquisition fails", async () => {
    let attempts = 0;
    const tx = {
      execute: vi.fn(async () => {
        attempts += 1;
        if (attempts === 2) throw new Error("lock unavailable");
        return [];
      }),
    } as unknown as TxLike;
    const mutate = vi.fn(async () => "must-not-run");

    await expect(
      withMembershipGraphLocks(tx, "user-1", ["workspace-a"], mutate)
    ).rejects.toThrow("lock unavailable");
    expect(mutate).not.toHaveBeenCalled();
  });
});

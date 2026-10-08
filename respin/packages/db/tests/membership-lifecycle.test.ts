import { describe, expect, it, vi } from "vitest";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "../../../tests/support/source-files";
import type { TxLike } from "../src/db-like";
import {
  MEMBERSHIP_KEYS_SETTING,
  sortedWorkspaceIds,
  withMembershipGraphLocks,
} from "../src/membership-lifecycle";

/** The lock-order ledger's read (audit Phase 8, P8-A1) carries no key. */
function isLedgerRead(query: unknown): boolean {
  const encoded = JSON.stringify(query);
  return encoded.includes("current_setting") && !encoded.includes("membership:");
}

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
        if (!isLedgerRead(query)) calls.push(embeddedLockKey(query));
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
      execute: vi.fn(async (query: unknown) => {
        if (isLedgerRead(query)) return [];
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

// ---------------------------------------------------------------------------
// THE READER/WRITER LIST (audit Phase 8, P8-A3, R-177; register 2026-10-05
// item 12) — every caller of the membership-graph lock, by the form it takes.
// A LIST, compared two-way against a scan of the tree (CLAUDE.md Respin rule
// 7): a new caller, a vanished caller, or a caller that changes form is red
// until this list is edited.
//
// Measured 2026-10-07 with
//   grep -rn "lockWorkspaceMembershipGraph(\|lockIdentityMembershipGraph(\|withMembershipGraphLocks(" app packages/*/src worker scripts lib
// BEFORE Phase 8's edits: 44 sites (the plan counted 41 on 2026-10-05; Phase 5
// added `read-grade-lifecycle.ts`'s two read fences and `webhooks.ts`'s
// held-money replay). Phase 8 moved the 14 money-path pairs into ONE ordered
// helper (`@respin/credits` `takeWorkspaceLockInOrder`, two sites), so the
// tree now holds 32: 8 SHARED readers, 4 whose form the CALLER passes
// (bootstrap's two — shared on the no-mint path, exclusive on the mint retry —
// and `withMembershipGraphLocks`' own two), and 20 EXCLUSIVE writers.
// ---------------------------------------------------------------------------

type Form = "shared" | "exclusive" | "caller";

const EXPECTED_MEMBERSHIP_LOCK_SITES: Record<string, { form: Form; count: number }> = {
  // --- readers: the shared form ---------------------------------------------
  "packages/credits/src/clock.ts#takeWorkspaceLockInOrder": { form: "shared", count: 2 },
  "packages/db/src/activation.ts#queryActivation": { form: "shared", count: 1 },
  "packages/db/src/membership-lifecycle.ts#assertWorkspaceLifecycleTransactionAccess": { form: "shared", count: 1 },
  "packages/db/src/membership-lifecycle.ts#assertProfileLifecycleTransactionAccess": { form: "shared", count: 1 },
  "packages/db/src/membership-lifecycle.ts#isActiveProfileLifecycleForSystemInTx": { form: "shared", count: 1 },
  "packages/db/src/read-grade-lifecycle.ts#assertWorkspaceReadTransactionAccess": { form: "shared", count: 1 },
  "packages/db/src/read-grade-lifecycle.ts#assertProfileReadTransactionAccess": { form: "shared", count: 1 },
  // --- the caller decides ---------------------------------------------------
  "packages/db/src/bootstrap.ts#bootstrapInTx": { form: "caller", count: 2 },
  "packages/db/src/membership-lifecycle.ts#withMembershipGraphLocks": { form: "caller", count: 2 },
  // --- writers: the exclusive form ------------------------------------------
  "packages/db/src/bootstrap.ts#bootstrapInTx/mint": { form: "exclusive", count: 1 },
  "packages/db/src/auth-lifecycle.ts#*": { form: "exclusive", count: 1 },
  "packages/db/src/deletion-executor.ts#*": { form: "exclusive", count: 2 },
  "packages/db/src/deletion-lifecycle.ts#*": { form: "exclusive", count: 16 },
};

const CALL = /\b(lockWorkspaceMembershipGraph|lockIdentityMembershipGraph|withMembershipGraphLocks)\(/;
const DEFINITION = /\bfunction\s+(lockWorkspaceMembershipGraph|lockIdentityMembershipGraph|withMembershipGraphLocks)\b/;

/** The call's own text, from its name to its balanced closing parenthesis. */
function callText(lines: readonly string[], index: number, start: number): string {
  let depth = 0;
  let out = "";
  for (let i = index; i < lines.length; i += 1) {
    const line = i === index ? lines[i].slice(start) : lines[i];
    for (const ch of line) {
      out += ch;
      if (ch === "(") depth += 1;
      if (ch === ")") {
        depth -= 1;
        if (depth === 0) return out;
      }
    }
    out += "\n";
  }
  return out;
}

function enclosingFunction(lines: readonly string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const m = lines[i].match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (m) return m[1];
  }
  return "<module>";
}

/** The form a call's own text asks for: a literal "shared", a pass-through, or the exclusive default. */
/**
 * The call's LAST top-level argument (gate note: by position, never "the
 * word appears somewhere in the call", which a `"shared"` inside a nested
 * callback would satisfy).
 */
function lastArgument(text: string): string {
  const open = text.indexOf("(");
  const inner = text.slice(open + 1, text.lastIndexOf(")"));
  let depth = 0;
  let last = inner;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    else if (ch === "," && depth === 0) {
      if (inner.slice(i + 1).trim() !== "") last = inner.slice(i + 1);
    }
  }
  return last.trim().replace(/,$/, "").trim();
}

/** The form a call asks for, from its LAST argument: `"shared"`, a pass-through, or the exclusive default. */
function formOf(text: string): Form {
  const last = lastArgument(text);
  if (last === '"shared"') return "shared";
  if (last === '"exclusive"') return "exclusive";
  if (last === "mode" || last === "lockMode") return "caller";
  return "exclusive";
}

/** Every membership-lock call site under `files`, keyed and classified. */
function membershipLockSites(
  files: Readonly<Record<string, string>>
): Record<string, { form: Form; count: number }> {
  const out: Record<string, { form: Form; count: number }> = {};
  for (const [rel, src] of Object.entries(files)) {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      const m = CALL.exec(line);
      if (!m || DEFINITION.test(line)) return;
      const form = formOf(callText(lines, index, m.index));
      let fn = enclosingFunction(lines, index);
      // The deletion and auth writers are listed per FILE: "every one of them
      // is an exclusive writer" is the claim, and their function names churn
      // with each lifecycle change.
      if (/deletion-lifecycle\.ts$|deletion-executor\.ts$|auth-lifecycle\.ts$/.test(rel)) fn = "*";
      // Bootstrap's one exclusive site is the MINT, named apart from its two
      // caller-decided ones.
      if (rel.endsWith("bootstrap.ts") && form === "exclusive") fn = `${fn}/mint`;
      const key = `${rel}#${fn}`;
      const prior = out[key];
      out[key] =
        prior === undefined
          ? { form, count: 1 }
          : prior.form === form
            ? { form, count: prior.count + 1 }
            : { form: "caller", count: -1 }; // mixed forms under one key: never expected
    });
  }
  return out;
}

/** The shared production population, minus test files (a test may stage a lock). */
function treeSources(): Record<string, string> {
  return Object.fromEntries(
    sourceFilesUnder(PRODUCTION_ROOTS)
      .filter(({ file }) => !/^packages\/[^/]+\/tests\//.test(file))
      .map(({ file, text }) => [file, text])
  );
}

describe("P8-A3: every membership-graph lock caller is a READER (shared) or a WRITER (exclusive), by list", () => {
  const files = treeSources();
  const actual = membershipLockSites(files);

  it("non-vacuity: the scan reads the tree and finds the 32 sites", () => {
    expect(Object.keys(files).length).toBeGreaterThan(100);
    expect(Object.values(actual).reduce((n, s) => n + s.count, 0)).toBe(32);
  });

  it("the classified population equals the written list, two-way", () => {
    expect(actual).toEqual(EXPECTED_MEMBERSHIP_LOCK_SITES);
  });

  it("PLANTED: a new reader that takes the EXCLUSIVE form is red until listed", () => {
    const planted = {
      ...files,
      "packages/db/src/planted.ts":
        "export async function plantedRead(tx, ws) {\n  await lockWorkspaceMembershipGraph(tx, ws);\n}\n",
    };
    expect(membershipLockSites(planted)).not.toEqual(EXPECTED_MEMBERSHIP_LOCK_SITES);
  });

  it("PLANTED: a listed reader flipped to the exclusive form is red", () => {
    const rel = "packages/db/src/activation.ts";
    const flipped = {
      ...files,
      [rel]: files[rel].replace('lockIdentityMembershipGraph(tx, userId, "shared")', "lockIdentityMembershipGraph(tx, userId)"),
    };
    expect(flipped[rel]).not.toBe(files[rel]);
    expect(membershipLockSites(flipped)[`${rel}#queryActivation`]).toEqual({ form: "exclusive", count: 1 });
  });

  it("formOf reads the LAST argument only: a \"shared\" elsewhere in the call does not make it a reader", () => {
    expect(formOf('lockWorkspaceMembershipGraph(tx, ws, "shared")')).toBe("shared");
    expect(formOf("lockWorkspaceMembershipGraph(tx, ws)")).toBe("exclusive");
    expect(formOf('withMembershipGraphLocks(tx, u, [w], () => f("shared"))')).toBe("exclusive");
    expect(formOf("withMembershipGraphLocks(tx, u, [w], () => g(tx), mode)")).toBe("caller");
    expect(formOf('withMembershipGraphLocks(\n  tx,\n  u,\n  [w],\n  () => g(tx),\n  "shared"\n)')).toBe("shared");
  });

  it("the lock-order ledger setting is the one the guard reads", () => {
    expect(MEMBERSHIP_KEYS_SETTING).toBe("respin.membership_keys");
  });
});

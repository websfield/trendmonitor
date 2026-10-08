// THE ONE GLOBAL LOCK ORDER (audit Phase 8, P8-A1, R-177; register 2026-10-05
// item 5): identity membership → workspace membership → billing.
//
// Two witnesses, because each covers what the other cannot:
//
//  1. THE LIST (CLAUDE.md Respin rule 7). Every call site of the billing lock
//     — `takeWorkspaceLock(` and the ordered helper `takeWorkspaceLockInOrder(`
//     — is written out below with its class, by file and enclosing function,
//     and compared TWO-WAY against a scan of the tree: a new site, a vanished
//     site, or a site that moved class is red until this list is edited.
//  2. THE RUNTIME GUARD. A lexical scan cannot see an inversion three calls
//     deep (the plan counted `settleParkedAutopsies` "billing alone"; its
//     `parkedAutopsyClaimsForProfile` runs the profile lifecycle fence after
//     the billing lock — found at build). So every membership-lock request
//     reads the transaction's own lock ledger and refuses, BEFORE waiting, a
//     new key after billing and an exclusive request on a key held shared.
//     The cases below drive each allowed and each refused shape on a real
//     (PGlite) transaction. The four-way race on real Postgres is
//     `lock-order.docker.test.ts`.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertProfileLifecycleTransactionAccess,
  assertWorkspaceLifecycleTransactionAccess,
  createTestDb,
  ensureUserWorkspace,
  LockOrderError,
  lockIdentityMembershipGraph,
  lockWorkspaceMembershipGraph,
  seedAuthUser,
  seedDb,
  trustWorkspaceId,
  withMembershipGraphLocks,
  withWorkspace,
} from "@respin/db";
import { createProfile } from "../src/profiles";
import { sql } from "drizzle-orm";
import {
  takeWorkspaceLock,
  takeWorkspaceLockInOrder,
  tryWorkspaceLock,
} from "../src/clock";
import { PRODUCTION_ROOTS, sourceFilesUnder } from "../../../tests/support/source-files";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(resolve(dir, e.name))
      : e.name.endsWith(".ts")
        ? [resolve(dir, e.name)]
        : []
  );
}

type SiteClass =
  /** Membership graph (shared) then billing, through the one ordered helper. */
  | "ordered-helper"
  /** A lifecycle fence (shared membership) runs first in the same body, then billing. */
  | "fence-then-billing"
  /** A re-entrant ledger/balance/pause primitive: billing only, joins the caller's tx. */
  | "billing-primitive"
  /** The helper's own body. */
  | "helper-body";

/**
 * THE LIST. `file#function → class × count`. Re-measured 2026-10-07 with
 * `grep -rn "takeWorkspaceLock(" app packages/*\/src worker scripts lib`: 35
 * call sites (the plan's 2026-10-05 count was 34; Phase 5 added the held-money
 * replay at `webhooks.ts`'s `replayHeldStripeEvents`). 19 now go through the
 * ordered helper (the plan's class (a) — 3 named + `pasted-reference.ts`'s two,
 * both confirmed at build — and class (b)'s 14 pairs), 16 stay direct, and the
 * helper's own body is the 17th direct call.
 */
const EXPECTED_SITES: Record<string, { class: SiteClass; count: number }> = {
  // --- the ordered helper: membership (shared) → billing -------------------
  "generate.ts#settle": { class: "ordered-helper", count: 1 },
  "inference.ts#runInference": { class: "ordered-helper", count: 1 },
  "profiles.ts#createProfile": { class: "ordered-helper", count: 1 },
  "pasted-reference.ts#submitPastedReference": { class: "ordered-helper", count: 1 },
  "pasted-reference.ts#settleParkedAutopsies": { class: "ordered-helper", count: 1 },
  // Reservation, dispatch, the three recovery transactions and the charge.
  "stripe/auto-topup.ts#maybeAutoTopup": { class: "ordered-helper", count: 6 },
  "stripe/auto-topup-v1-reconcile.ts#bindObservedAttempt": { class: "ordered-helper", count: 1 },
  "stripe/auto-topup-v1-reconcile.ts#retireCanceledAttempt": { class: "ordered-helper", count: 1 },
  "stripe/auto-topup-v1-reconcile.ts#claimExpiredProviderAbsentAttempt": { class: "ordered-helper", count: 1 },
  "stripe/auto-topup-v1-reconcile.ts#clearProviderAbsentOperatorClaim": { class: "ordered-helper", count: 1 },
  "stripe/auto-topup-v1-reconcile.ts#exactLocalAttemptAppeared": { class: "ordered-helper", count: 1 },
  "stripe/tier-checkout-v1-reconcile.ts#reconcileTierCheckoutV1Session": { class: "ordered-helper", count: 1 },
  "stripe/webhooks.ts#handleStripeEventInTransaction": { class: "ordered-helper", count: 1 },
  "stripe/webhooks.ts#replayHeldStripeEvents": { class: "ordered-helper", count: 1 },
  // --- a lifecycle fence first, then billing --------------------------------
  // `requireReauthenticatedOwnerInTx` / `assertReauthenticatedWorkspaceScopeInTx`
  // run `assertWorkspaceLifecycleTransactionAccess` (shared membership) before
  // the billing lock in the same body; a second call after it is a re-entry.
  "stripe/actions.ts#createTierCheckoutUrl": { class: "fence-then-billing", count: 3 },
  "stripe/actions.ts#createPackCheckoutUrl": { class: "fence-then-billing", count: 2 },
  "stripe/actions.ts#createPortalUrl": { class: "fence-then-billing", count: 1 },
  "stripe/actions.ts#createInvoiceRecoveryUrl": { class: "fence-then-billing", count: 1 },
  "stripe/actions.ts#pauseSubscription": { class: "fence-then-billing", count: 1 },
  "stripe/actions.ts#resumeSubscription": { class: "fence-then-billing", count: 1 },
  "stripe/actions.ts#setAutoTopup": { class: "fence-then-billing", count: 1 },
  "stripe/billing-contact.ts#acceptBillingContact": { class: "fence-then-billing", count: 1 },
  // --- re-entrant billing primitives ---------------------------------------
  "balance.ts#deriveBalanceInTx": { class: "billing-primitive", count: 1 },
  "ledger.ts#adjustCredits": { class: "billing-primitive", count: 1 },
  "ledger.ts#refundCredits": { class: "billing-primitive", count: 1 },
  "ledger.ts#debitCredits": { class: "billing-primitive", count: 1 },
  "pause.ts#recordPauseStart": { class: "billing-primitive", count: 1 },
  // --- the helper itself -----------------------------------------------------
  "clock.ts#takeWorkspaceLockInOrder": { class: "helper-body", count: 1 },
};

/** The enclosing named function of a line: the nearest declaration above it. */
function enclosingFunction(lines: readonly string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const m = lines[i].match(
      /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/
    );
    if (m) return m[1] ?? m[2];
  }
  return "<module>";
}

type Scanned = Record<string, { helper: number; direct: number; fenceFirst: number }>;

/**
 * Scan `files` (path → text) for both call shapes. A DIRECT call is
 * `fenceFirst` when a lifecycle fence call appears earlier in the same
 * function body — the textual evidence that membership came first.
 */
function scanSites(files: Readonly<Record<string, string>>): Scanned {
  const out: Scanned = {};
  for (const [file, text] of Object.entries(files)) {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      const helper = /\btakeWorkspaceLockInOrder\(/.test(line) && !/function\s+takeWorkspaceLockInOrder/.test(line);
      const direct = /\btakeWorkspaceLock\(/.test(line) && !/function\s+takeWorkspaceLock\(/.test(line);
      if (!helper && !direct) return;
      const fn = enclosingFunction(lines, index);
      const key = `${file}#${fn}`;
      out[key] ??= { helper: 0, direct: 0, fenceFirst: 0 };
      if (helper) out[key].helper += 1;
      if (direct) {
        out[key].direct += 1;
        let start = index;
        while (start > 0 && enclosingFunction(lines, start - 1) === fn) start -= 1;
        const before = lines.slice(start, index).join("\n");
        if (/requireReauthenticatedOwnerInTx\(|assertReauthenticatedWorkspaceScopeInTx\(/.test(before)) {
          out[key].fenceFirst += 1;
        }
      }
    });
  }
  return out;
}

function classify(scanned: Scanned): Record<string, { class: SiteClass; count: number }> {
  const out: Record<string, { class: SiteClass; count: number }> = {};
  for (const [key, s] of Object.entries(scanned)) {
    if (s.helper > 0 && s.direct > 0) {
      out[key] = { class: "ordered-helper", count: -1 }; // mixed: never expected
    } else if (s.helper > 0) {
      out[key] = { class: "ordered-helper", count: s.helper };
    } else if (key.startsWith("clock.ts#takeWorkspaceLockInOrder")) {
      out[key] = { class: "helper-body", count: s.direct };
    } else if (s.fenceFirst === s.direct) {
      out[key] = { class: "fence-then-billing", count: s.direct };
    } else {
      out[key] = { class: "billing-primitive", count: s.direct };
    }
  }
  return out;
}

function treeFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const abs of walk(SRC)) {
    files[relative(SRC, abs).replace(/\\/g, "/")] = readFileSync(abs, "utf8");
  }
  return files;
}

describe("THE LIST: every billing-lock call site, classified, two-way", () => {
  const files = treeFiles();
  const actual = classify(scanSites(files));

  it("the scan found sites at all (non-vacuity floor)", () => {
    const total = Object.values(actual).reduce((n, s) => n + s.count, 0);
    // 19 helper calls + 16 direct + the helper's own body.
    expect(total).toBe(36);
  });

  it("the classified population equals the written list exactly", () => {
    expect(actual).toEqual(EXPECTED_SITES);
  });

  it("no billing-lock call exists in shipped code outside packages/credits/src", () => {
    // The shared production population (tests/support/source-files.ts), minus
    // test files — a test may take the lock to stage a race.
    const shipped = sourceFilesUnder(PRODUCTION_ROOTS).filter(
      ({ file }) => !/^packages\/[^/]+\/tests\//.test(file) && !file.startsWith("packages/credits/src/")
    );
    expect(shipped.length).toBeGreaterThan(100);
    const hits = shipped
      .filter(({ text }) => /\btakeWorkspaceLock(InOrder)?\(/.test(text))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  it("PLANTED: a 35th-site addition is red until listed", () => {
    const planted = {
      ...files,
      "planted.ts": "export async function plantedLocker(tx) {\n  await takeWorkspaceLock(tx, ws);\n}\n",
    };
    expect(classify(scanSites(planted))).not.toEqual(EXPECTED_SITES);
  });

  it("PLANTED: a site that moves class is red until re-listed", () => {
    // `createProfile` reverting to the bare billing lock — the inversion shape.
    const reverted = {
      ...files,
      "profiles.ts": files["profiles.ts"].replace(
        /await takeWorkspaceLockInOrder\(tx, \{[\s\S]*?\}\);/,
        "await takeWorkspaceLock(tx, scope.workspaceId);"
      ),
    };
    expect(reverted["profiles.ts"]).not.toBe(files["profiles.ts"]);
    const moved = classify(scanSites(reverted));
    expect(moved["profiles.ts#createProfile"]).toEqual({ class: "billing-primitive", count: 1 });
    expect(moved).not.toEqual(EXPECTED_SITES);
  });
});

describe("THE RUNTIME GUARD, case by case, on a real transaction", () => {
  const WS = trustWorkspaceId("00000000-0000-4000-8000-0000000000a1");
  const OTHER_WS = trustWorkspaceId("00000000-0000-4000-8000-0000000000b2");
  const USER = "00000000-0000-4000-8000-0000000000c3";

  async function inTx<T>(fn: Parameters<Awaited<ReturnType<typeof createTestDb>>["transaction"]>[0]): Promise<T> {
    const db = await createTestDb();
    return db.transaction(fn) as Promise<T>;
  }

  it("ALLOWED: the ordered helper, then the guarded calls settle/inference/createProfile make (shared re-entry)", async () => {
    await inTx(async (tx) => {
      await takeWorkspaceLockInOrder(tx, { workspaceId: WS, userId: USER });
      // What settle's `caps.readGenerationAttempt`, inference's
      // `firstBillableAttempt` and createProfile's capabilities run: the fence's
      // two shared keys, both already held.
      await withMembershipGraphLocks(tx, USER, [WS], async () => undefined, "shared");
      await lockIdentityMembershipGraph(tx, USER, "shared");
      await lockWorkspaceMembershipGraph(tx, WS, "shared");
      // The billing lock again (a ledger primitive inside the same tx).
      await takeWorkspaceLock(tx, WS);
    });
  });

  it("ALLOWED, through the REAL function: createProfile takes the helper, then its fenced capabilities re-enter (no LockOrderError)", async () => {
    // AC11's createProfile case driven end to end on PGlite. Measured
    // 2026-10-07: planting `profiles.ts` back to the bare `takeWorkspaceLock`
    // turns 9 of `profiles.test.ts`'s 13 cases red with
    // `LockOrderError("after_billing")` on the identity key. settle and
    // inferVoice are driven through their real functions in
    // `lock-order.docker.test.ts`'s four-way race.
    const db = await createTestDb();
    await seedDb(db);
    await seedAuthUser(db, "lock_order_profile_user", "lock_order_profile_user@test.dev");
    await ensureUserWorkspace(db, { authUserId: "lock_order_profile_user", name: "LO" });
    const scope = await withWorkspace(db, { authUserId: "lock_order_profile_user" });
    const created = await createProfile(db, scope, "Lee", new Date()).then(
      (p) => p,
      (e: unknown) => e
    );
    expect(created).not.toBeInstanceOf(LockOrderError);
    expect((created as { id?: string }).id).toEqual(expect.any(String));
  });

  it("ALLOWED: the real lifecycle fences after the helper refuse for lifecycle, never for lock order", async () => {
    // No rows exist, so the fences' lifecycle check refuses — by its own
    // message. What matters is that it is NOT a LockOrderError: the lock
    // request itself was admitted as a re-entry.
    await inTx(async (tx) => {
      await takeWorkspaceLockInOrder(tx, { workspaceId: WS, userId: USER });
      const refusal = await assertWorkspaceLifecycleTransactionAccess(tx, USER, WS).then(
        () => null,
        (e: unknown) => e
      );
      expect(refusal).not.toBeInstanceOf(LockOrderError);
      expect(String(refusal)).toMatch(/lifecycle_refused/);
    });
  });

  it("ALLOWED: an exclusive request on a DIFFERENT key than a shared one held, billing not held", async () => {
    await inTx(async (tx) => {
      await lockWorkspaceMembershipGraph(tx, WS, "shared");
      await lockWorkspaceMembershipGraph(tx, OTHER_WS, "exclusive");
    });
  });

  it("ALLOWED: a shared request on a key held exclusive (the stronger form covers it)", async () => {
    await inTx(async (tx) => {
      await lockWorkspaceMembershipGraph(tx, WS, "exclusive");
      await takeWorkspaceLock(tx, WS);
      await lockWorkspaceMembershipGraph(tx, WS, "shared");
    });
  });

  it("REFUSED: a NEW membership key after billing — the settle inversion register item 5 found", async () => {
    let caught: unknown;
    await inTx(async (tx) => {
      // The pre-Phase-8 settle: billing first, then the profile fence.
      await takeWorkspaceLock(tx, WS);
      try {
        await assertProfileLifecycleTransactionAccess(tx, USER, WS, "00000000-0000-4000-8000-0000000000d4");
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(LockOrderError);
    expect((caught as LockOrderError).reason).toBe("after_billing");
    expect((caught as LockOrderError).key).toBe(`identity-membership:${USER}`);
  });

  it("REFUSED: a new key after a SUCCESSFUL try-lock too (the display read records billing the same way)", async () => {
    let caught: unknown;
    await inTx(async (tx) => {
      expect(await tryWorkspaceLock(tx, WS)).toBe(true);
      try {
        await lockWorkspaceMembershipGraph(tx, WS, "shared");
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(LockOrderError);
    expect((caught as LockOrderError).reason).toBe("after_billing");
  });

  it("REFUSED: an exclusive request on a key this transaction holds only shared (the upgrade)", async () => {
    let caught: unknown;
    await inTx(async (tx) => {
      await lockWorkspaceMembershipGraph(tx, WS, "shared");
      try {
        await lockWorkspaceMembershipGraph(tx, WS, "exclusive");
      } catch (e) {
        caught = e;
      }
    });
    expect(caught).toBeInstanceOf(LockOrderError);
    expect((caught as LockOrderError).reason).toBe("upgrade");
  });

  it("the ledger is TRANSACTION-LOCAL: the next transaction on the same connection starts clean", async () => {
    const db = await createTestDb();
    await db.transaction(async (tx) => {
      await lockWorkspaceMembershipGraph(tx, WS, "shared");
      await takeWorkspaceLock(tx, WS);
    });
    // PGlite is ONE connection, so this is literally the same session.
    await db.transaction(async (tx) => {
      const r = (await tx.execute(
        sql`SELECT current_setting('respin.billing_lock_held', true) AS billing, current_setting('respin.membership_keys', true) AS keys`
      )) as unknown as { rows: { billing: string | null; keys: string | null }[] };
      expect(r.rows[0].billing ?? "").toBe("");
      expect(r.rows[0].keys ?? "").toBe("");
      // ...so a fresh membership key is admitted, not refused as after-billing.
      await lockWorkspaceMembershipGraph(tx, OTHER_WS, "exclusive");
    });
  });
});

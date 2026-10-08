// The T1 breach-attempting suite (tenancy skill checklist item 1): every scoped
// accessor is ATTEMPTED against the other workspace and must refuse or return
// nothing foreign. Enumeration is programmatic over the accessor map (AC-1),
// with a completeness assertion so a new accessor without a validator fails
// loudly (AC-7), instead of escaping to reviewer memory.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ensureUserWorkspace } from "../src/bootstrap";
import { createTestDb, seedAuthUser, type TestDb } from "../src/testing";
import { creditLedger, subscriptions } from "../src/billing-schema";
import { creatorProfiles } from "../src/brain-schema";
import {
  assertReadScoped,
  assertScoped,
  isReadGradeScope,
  LEDGER_PAGE_MAX,
  ProfileAccessError,
  ProfileScope,
  ReadGradeProfileScope,
  ReadGradeWorkspaceScope,
  ScopeForgeryError,
  WorkspaceAccessError,
  WorkspacePendingDeletionError,
  WRITE_PAUSE_POLICY,
  withWorkspace,
  workspaceWriteCapabilities,
  writeCapabilities,
  type WorkspaceScope,
} from "../src/with-workspace";
import { session } from "../src/auth-schema";
import { membershipProfileSelections as selections } from "../src/brain-schema";
import { readBrainHistory } from "../src/brain-ops";
import { requestWorkspaceDeletion, transitionDeletionOperation } from "../src/deletion-lifecycle";
import { journalReceiptDigest, journalRequestChecksum, type DeletionJournalPort } from "../src/deletion-ports";
import { openBrainExport } from "../src/export";
import { deletionOperations } from "../src/lifecycle-schema";
import { selectedProfileForMember } from "../src/profile-selection";
import { memberships } from "../src/schema";

const HOUR = 3_600_000;

describe("withWorkspace tenancy scope", () => {
  let db: TestDb;
  let aWorkspaceId: string;
  let bWorkspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "user_a");
    await seedAuthUser(db, "user_b");
    aWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "user_a", name: "A" })
    ).workspace.id;
    bWorkspaceId = (
      await ensureUserWorkspace(db, { authUserId: "user_b", name: "B" })
    ).workspace.id;
    // Billing rows for BOTH workspaces: the accessor loop below asserts each
    // accessor returns at least one row, so an empty table would make the
    // breach validators vacuous — a suite that proves isolation by returning
    // nothing proves nothing (the phase-2 lesson, applied here).
    await db.insert(subscriptions).values([
      { workspaceId: aWorkspaceId, stripeCustomerId: "cus_a", status: "active" },
      { workspaceId: bWorkspaceId, stripeCustomerId: "cus_b", status: "active" },
    ]);
    await db.insert(creditLedger).values([
      {
        workspaceId: aWorkspaceId,
        delta: 250,
        kind: "grant",
        refType: "invoice",
        refId: "in_a",
        expiresAt: new Date(Date.now() + 24 * HOUR),
      },
      {
        workspaceId: bWorkspaceId,
        delta: 999,
        kind: "grant",
        refType: "invoice",
        refId: "in_b",
        expiresAt: new Date(Date.now() + 24 * HOUR),
      },
    ]);
    // Slice 1: a profile in EACH workspace, for the same non-vacuity reason the
    // billing rows above exist. Each is NAMED AFTER ITS OWN WORKSPACE so the
    // breach validator can assert which row came back, symmetrically from
    // either side.
    await db.insert(creatorProfiles).values([
      { workspaceId: aWorkspaceId, displayName: `profile-of-${aWorkspaceId}` },
      { workspaceId: bWorkspaceId, displayName: `profile-of-${bWorkspaceId}` },
    ]);
  });

  /**
   * One breach validator per accessor, keyed by accessor name. The rows an
   * accessor returns must never reference the foreign workspace.
   */
  const breachValidators: Record<
    keyof WorkspaceScope["accessors"],
    (rows: unknown[], own: string, foreign: string) => void
  > = {
    workspace: (rows, own, foreign) => {
      for (const row of rows as { id: string }[]) {
        expect(row.id).toBe(own);
        expect(row.id).not.toBe(foreign);
      }
    },
    members: (rows, own, foreign) => {
      for (const row of rows as { workspaceId: string }[]) {
        expect(row.workspaceId).toBe(own);
        expect(row.workspaceId).not.toBe(foreign);
      }
    },
    subscription: (rows, own, foreign) => {
      for (const row of rows as { workspaceId: string }[]) {
        expect(row.workspaceId).toBe(own);
        expect(row.workspaceId).not.toBe(foreign);
      }
    },
    ledger: (rows, own, foreign) => {
      for (const row of rows as { workspaceId: string }[]) {
        expect(row.workspaceId).toBe(own);
        expect(row.workspaceId).not.toBe(foreign);
      }
    },
    creatorProfiles: (rows, own, foreign) => {
      // BOTH AXES. The id axis alone would pass a query that returned nothing,
      // so the name axis pins WHICH row came back: each workspace's profile is
      // named after its own id, so a dropped workspace predicate surfaces the
      // sibling's name here even before the count changes. (The validator runs
      // from both sides, so it must be symmetric — an earlier version keyed on
      // the literal word "foreign" and failed when run AS the workspace whose
      // profile carried it, which is the shape a one-sided fixture always has.)
      for (const row of rows as { workspaceId: string; displayName: string }[]) {
        expect(row.workspaceId).toBe(own);
        expect(row.workspaceId).not.toBe(foreign);
        expect(row.displayName).toBe(`profile-of-${own}`);
        expect(row.displayName).not.toContain(foreign);
      }
    },
  };

  /**
   * The arguments each accessor needs, typed against the accessor map itself —
   * so an accessor that GAINS a parameter fails to compile here rather than
   * being silently invoked with `undefined` (the round-1 shape of "the loop
   * exercised something, just not what the name said").
   */
  const accessorArgs: {
    [K in keyof WorkspaceScope["accessors"]]: Parameters<
      WorkspaceScope["accessors"][K]
    >;
  } = {
    workspace: [],
    members: [],
    subscription: [],
    ledger: [{ limit: 50 }],
    creatorProfiles: [],
  };

  const invoke = (
    scope: WorkspaceScope,
    name: keyof WorkspaceScope["accessors"]
  ): Promise<unknown[]> =>
    (
      scope.accessors[name] as (...args: unknown[]) => Promise<unknown[]>
    )(...(accessorArgs[name] as unknown[]));

  it("covers every scoped accessor (AC-7 completeness assertion)", async () => {
    const scope = await withWorkspace(db, { authUserId: "user_a" });
    expect(Object.keys(breachValidators).sort()).toEqual(
      Object.keys(scope.accessors).sort()
    );
    // ...and the ARGS map covers the same set, so a new accessor cannot join
    // the loop below without someone deciding how it is called.
    expect(Object.keys(accessorArgs).sort()).toEqual(
      Object.keys(scope.accessors).sort()
    );
  });

  it("every accessor returns only the scope's own workspace rows (AC-1)", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const accessorNames = Object.keys(
      scopeA.accessors
    ) as (keyof WorkspaceScope["accessors"])[];
    expect(accessorNames.length).toBeGreaterThan(0);
    for (const name of accessorNames) {
      const rows = await invoke(scopeA, name);
      expect(rows.length, `${name} returned no rows — validator would be vacuous`).toBeGreaterThan(0);
      breachValidators[name](rows, aWorkspaceId, bWorkspaceId);
    }
  });

  it("and the SAME loop run as workspace B sees only B (the breach is attempted from both sides)", async () => {
    const scopeB = await withWorkspace(db, { authUserId: "user_b" });
    for (const name of Object.keys(
      scopeB.accessors
    ) as (keyof WorkspaceScope["accessors"])[]) {
      const rows = await invoke(scopeB, name);
      expect(rows.length).toBeGreaterThan(0);
      breachValidators[name](rows, bWorkspaceId, aWorkspaceId);
    }
  });

  it("creatorProfiles() returns ACTIVE profiles only — the page's count and the server's must agree", async () => {
    // UNPINNED UNTIL NOW (tenancy + billing gates, 2026-08-27, independently).
    // The accessor's docblock states the property — the page's displayed
    // `used` and the server's enforced `countActiveProfiles` have to be the
    // same question — and nothing checked it: both fixture rows are default
    // state, so the predicate was inert in every existing assertion. Delete
    // `eq(creatorProfiles.state, "active")` and the whole suite stayed green.
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    expect(await scopeA.accessors.creatorProfiles()).toHaveLength(1);

    await db
      .update(creatorProfiles)
      .set({ state: "archived" })
      .where(eq(creatorProfiles.workspaceId, aWorkspaceId));

    expect(
      await scopeA.accessors.creatorProfiles(),
      "an archived profile must not count towards the cap the page displays"
    ).toHaveLength(0);
    // ...and B, which shares the table, is untouched.
    const scopeB = await withWorkspace(db, { authUserId: "user_b" });
    expect(await scopeB.accessors.creatorProfiles()).toHaveLength(1);
  });

  it("ledger() CLAMPS the page size — an unbounded caller cannot read the whole table", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const extra = Array.from({ length: 9 }, (_, i) => ({
      workspaceId: aWorkspaceId,
      delta: 1,
      kind: "grant" as const,
      refType: "invoice",
      refId: `in_a_${i}`,
      expiresAt: new Date(Date.now() + 24 * HOUR),
    }));
    await db.insert(creditLedger).values(extra);
    expect(await scopeA.accessors.ledger({ limit: 3 })).toHaveLength(3);
    // A caller asking for more than the ceiling gets the ceiling, not the table.
    expect(LEDGER_PAGE_MAX).toBeLessThan(10_000);
    expect(
      (await scopeA.accessors.ledger({ limit: 10_000 })).length
    ).toBeLessThanOrEqual(LEDGER_PAGE_MAX);
    // ...and a nonsense page size still returns a bounded, non-negative page.
    expect(await scopeA.accessors.ledger({ limit: 0 })).toHaveLength(1);
    expect(
      await scopeA.accessors.ledger({ limit: 5, offset: -3 })
    ).toHaveLength(5);
  });

  it("ledger() clamps NaN and Infinity — the shapes a URL actually produces (round-2 CHANGE 4)", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const extra = Array.from({ length: 9 }, (_, i) => ({
      workspaceId: aWorkspaceId,
      delta: 1,
      kind: "grant" as const,
      refType: "invoice",
      refId: `in_nan_${i}`,
      expiresAt: new Date(Date.now() + 24 * HOUR),
    }));
    await db.insert(creditLedger).values(extra);
    const total = (await scopeA.accessors.ledger({ limit: LEDGER_PAGE_MAX }))
      .length;
    // The premise: there is more than one row, so "the whole table" and "one
    // clamped row" are distinguishable answers.
    expect(total).toBeGreaterThan(1);

    // `Number(searchParams.rows)` on absent or garbage input is NaN, and
    // `Math.min(Math.max(1, NaN), 200)` is NaN — drizzle then drops the LIMIT
    // from the SQL entirely and the accessor served the ENTIRE table while the
    // doc-comment said the limit "is CLAMPED rather than trusted".
    for (const bad of [Number("abc"), NaN, Infinity, -Infinity]) {
      const rows = await scopeA.accessors.ledger({ limit: bad });
      expect(rows.length, `limit ${bad} must stay bounded`).toBeLessThanOrEqual(
        LEDGER_PAGE_MAX
      );
      expect(
        rows.length,
        `limit ${bad} must not serve the whole table`
      ).toBeLessThan(total);
    }
    // A non-finite OFFSET must not become a NaN OFFSET either (which Postgres
    // rejects outright) — it degrades to 0, i.e. the newest page.
    const offsetNaN = await scopeA.accessors.ledger({
      limit: 3,
      offset: Number("nope"),
    });
    expect(offsetNaN).toHaveLength(3);
    expect(offsetNaN.map((r) => r.id)).toEqual(
      (await scopeA.accessors.ledger({ limit: 3, offset: 0 })).map((r) => r.id)
    );
  });

  it("ledger() pages newest-first and the offset does not re-serve the same row", async () => {
    const scopeA = await withWorkspace(db, { authUserId: "user_a" });
    const base = Date.now();
    await db.insert(creditLedger).values([
      {
        workspaceId: aWorkspaceId, delta: 1, kind: "grant",
        refType: "invoice", refId: "in_older",
        createdAt: new Date(base - 2 * HOUR),
        expiresAt: new Date(base + 24 * HOUR),
      },
      {
        workspaceId: aWorkspaceId, delta: 2, kind: "grant",
        refType: "invoice", refId: "in_newer",
        createdAt: new Date(base + 2 * HOUR),
        expiresAt: new Date(base + 24 * HOUR),
      },
    ]);
    const firstPage = await scopeA.accessors.ledger({ limit: 1 });
    expect(firstPage[0].refId).toBe("in_newer");
    const secondPage = await scopeA.accessors.ledger({ limit: 1, offset: 1 });
    expect(secondPage[0].refId).not.toBe("in_newer");
  });

  it("refuses an explicit request for a workspace the user is not a member of (AC-1 breach attempt)", async () => {
    await expect(
      withWorkspace(db, { authUserId: "user_b", workspaceId: aWorkspaceId })
    ).rejects.toThrow(WorkspaceAccessError);
  });

  it("honors an explicit request for the user's own workspace (verify-then-scope)", async () => {
    const scope = await withWorkspace(db, {
      authUserId: "user_b",
      workspaceId: bWorkspaceId,
    });
    expect(scope.workspaceId).toBe(bWorkspaceId);
    expect(scope.role).toBe("owner");
  });

  it("refuses an unknown user", async () => {
    await expect(
      withWorkspace(db, { authUserId: "user_never_bootstrapped" })
    ).rejects.toThrow(/unknown user/);
  });

  it("refuses a user with no workspace (bootstrap-first)", async () => {
    await seedAuthUser(db, "user_no_ws");
    await db.insert((await import("../src/schema")).users).values({
      authUserId: "user_no_ws",
    });
    await expect(
      withWorkspace(db, { authUserId: "user_no_ws" })
    ).rejects.toThrow(/no workspace/);
  });

  it("requires explicit selection when the user belongs to multiple workspaces", async () => {
    const schema = await import("../src/schema");
    const [userA] = await db
      .select()
      .from(schema.users)
      .where(
        (await import("drizzle-orm")).eq(schema.users.authUserId, "user_a")
      );
    // Give A a second membership (B's workspace) to simulate M2+/Studio shape.
    await db.insert(schema.memberships).values({
      userId: userA.id,
      workspaceId: bWorkspaceId,
      role: "viewer",
    });
    await expect(
      withWorkspace(db, { authUserId: "user_a" })
    ).rejects.toThrow(/explicit workspaceId is required/);
    // ...and the explicit path still verifies membership before scoping.
    const scope = await withWorkspace(db, {
      authUserId: "user_a",
      workspaceId: bWorkspaceId,
    });
    expect(scope.role).toBe("viewer");
  });
});

// ---------------------------------------------------------------------------

/**
 * REQ-G08: EVERY CAPABILITY IS CLASSIFIED, AND THE POPULATION IS THE SOURCE.
 *
 * THE DEFECT (billing gate, 2026-09-02). A-7's exemptions from the pause gate
 * lived in ONE COMMENT inside `writeBrainDoc`, naming two capabilities. Slice 7
 * added a third unpaused write — `recordGenerationFeedback`, measured ACCEPTED
 * against a live database with an open `pause_periods` row — and the comment
 * was not touched. The behaviour is defensible; "defensible" and "decided" are
 * different, and only one of them is written down. A hand-maintained list is
 * what failed, so the list is no longer what this suite trusts.
 *
 * WHAT IT DOES. It parses `with-workspace.ts`, finds the object literal each
 * capability factory returns, and classifies every member from its own body:
 *   - it WRITES if its subtree calls `.insert(` / `.update(` / `.delete(`;
 *   - it is GATED if its subtree names `hasOpenPause`, or CALLS a sibling
 *     capability that is gated (`activateBrainDocCoherent` is the second
 *     shape — it delegates rather than repeating the gate).
 * Then every member must agree with `WRITE_PAUSE_POLICY`, and an ungated write
 * must carry a NON-EMPTY WARRANT. A capability added tomorrow is in the
 * population the moment it is written.
 *
 * IT IS A SOURCE SCAN, SO IT PLANTS ITS OWN VIOLATIONS (CLAUDE.md 2026-08-21):
 * a scan that reports zero findings is indistinguishable from a scan whose
 * pattern broke, and this one would fail OPEN in the direction that matters.
 */
describe("REQ-G08: the pause policy covers every capability, derived from source", () => {
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const source = () => readFileSync(join(SRC, "with-workspace.ts"), "utf8");

  type Member = { name: string; writes: boolean; gated: boolean; calls: string[] };

  /** Classify every capability member of a `with-workspace.ts` source text. */
  function classifyCapabilities(text: string): Member[] {
    const sf = ts.createSourceFile("w.ts", text, ts.ScriptTarget.Latest, true);
    const members: Member[] = [];
    const readMember = (prop: ts.PropertyAssignment) => {
      const name = prop.name.getText(sf);
      let writes = false;
      let gated = false;
      const calls: string[] = [];
      const walk = (n: ts.Node): void => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
          const method = n.expression.name.getText(sf);
          if (["insert", "update", "delete"].includes(method)) writes = true;
          // `caps.activateBrainDoc(...)` — a delegated gate.
          if (n.expression.expression.getText(sf) === "caps") calls.push(method);
        }
        if (ts.isIdentifier(n) && n.getText(sf) === "hasOpenPause") gated = true;
        ts.forEachChild(n, walk);
      };
      walk(prop.initializer);
      members.push({ name, writes, gated, calls });
    };
    const visit = (node: ts.Node): void => {
      // The two capability factories return one object literal each; every
      // property of those literals is a capability. Nothing else in this file
      // returns an object of arrow functions, and the count assertion below is
      // what makes that claim checkable rather than assumed.
      if (ts.isFunctionDeclaration(node) && node.name) {
        const fn = node.name.getText(sf);
        if (fn === "writeCapabilities" || fn === "workspaceWriteCapabilities") {
          const inner = (n: ts.Node): void => {
            if (ts.isObjectLiteralExpression(n)) {
              for (const prop of n.properties) {
                if (
                  ts.isPropertyAssignment(prop) &&
                  (ts.isArrowFunction(prop.initializer) ||
                    ts.isFunctionExpression(prop.initializer))
                ) {
                  readMember(prop);
                }
              }
            }
            ts.forEachChild(n, inner);
          };
          inner(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return members;
  }

  /** Gated directly, or by delegation to a sibling that is. */
  const isGated = (m: Member, all: Member[]): boolean =>
    m.gated ||
    m.calls.some((c) => {
      const target = all.find((x) => x.name === c);
      return target ? target.gated : false;
    });

  it("the classifier SEES the real capabilities (it is not scanning nothing)", () => {
    const members = classifyCapabilities(source());
    const names = members.map((m) => m.name);
    // Non-vacuity by count AND by naming one of each answer, so a parse that
    // silently returned fewer members cannot pass.
    expect(names.length, "the capability walk found nothing").toBeGreaterThanOrEqual(
      12
    );
    expect(names).toContain("writeBrainDoc");
    expect(names).toContain("recordGenerationFeedback");
    expect(names).toContain("createProfile");
    const brain = members.find((m) => m.name === "writeBrainDoc");
    expect(brain?.writes, "writeBrainDoc does not look like a write").toBe(true);
    expect(brain?.gated, "writeBrainDoc does not look gated").toBe(true);
    const read = members.find((m) => m.name === "readGenerationAttempt");
    expect(read?.writes, "a select was classified as a write").toBe(false);
  });

  it("EVERY capability is in WRITE_PAUSE_POLICY, and the policy matches the code", () => {
    const members = classifyCapabilities(source());
    for (const m of members) {
      const policy = WRITE_PAUSE_POLICY[m.name];
      expect(
        policy,
        `\`${m.name}\` is a capability with no entry in WRITE_PAUSE_POLICY. If it writes and is deliberately not pause-gated, add it WITH ITS WARRANT — an unpaused write nobody wrote down is exactly the finding this guard exists for (REQ-G08, A-7).`
      ).toBeDefined();
      const gated = isGated(m, members);
      if (policy === "gated") {
        expect(gated, `${m.name} is declared gated and takes no pause gate`).toBe(true);
      } else if (policy === "read") {
        expect(m.writes, `${m.name} is declared a read and it writes`).toBe(false);
        expect(gated, `${m.name} is declared a read and takes a pause gate`).toBe(false);
      } else {
        expect(m.writes, `${m.name} is declared an exempt WRITE and writes nothing`).toBe(
          true
        );
        expect(gated, `${m.name} is declared exempt and IS gated — update the policy`).toBe(
          false
        );
        expect(
          typeof policy === "object" ? policy.exempt.length : 0,
          `${m.name}'s exemption has no warrant`
        ).toBeGreaterThan(80);
      }
    }
    // ...and nothing in the policy names a capability that no longer exists.
    const names = new Set(members.map((m) => m.name));
    expect(
      Object.keys(WRITE_PAUSE_POLICY).filter((k) => !names.has(k)),
      "WRITE_PAUSE_POLICY names a capability that is gone — a policy about nothing"
    ).toEqual([]);
  });

  it("...and a PLANTED unlisted write is caught (the scan is not vacuous)", () => {
    // The mutation this exists for: a new capability that writes, takes no
    // pause gate, and is in nobody's list. Planted into a doctored copy of the
    // REAL source, so the negative case is this repo minus the property.
    const original = source();
    const newCapabilityAnchor = "    recordGenerationFeedback: async (params, tx) => {";
    expect(original.split(newCapabilityAnchor)).toHaveLength(2);
    const doctored = original.replace(
      newCapabilityAnchor,
      [
        "    recordSomethingNew: async (params, tx) => {",
        "      return tx.insert(generations).values(params).returning();",
        "    },",
        "    recordGenerationFeedback: async (params, tx) => {",
      ].join("\n")
    );
    expect(
      doctored,
      "the doctoring anchor is gone — this probe is measuring nothing"
    ).not.toBe(original);
    const planted = classifyCapabilities(doctored).find(
      (m) => m.name === "recordSomethingNew"
    );
    expect(planted?.writes, "the planted write was not seen as a write").toBe(true);
    expect(WRITE_PAUSE_POLICY[planted!.name]).toBeUndefined();

    // ...and the GATE half of the classifier is planted too: removing
    // `hasOpenPause` from `writeBrainDoc` must make it read as ungated, or
    // "declared gated and takes no pause gate" is an assertion about nothing.
    const brainPauseGate = / {6}if \(await hasOpenPause\(tx, scope\.workspaceId\)\) \{\r?\n {8}throw new WorkspacePausedError\(\);\r?\n {6}\}\r?\n(?= {6}\/\/ EVERY FIELD OF `doc` IS READ EXACTLY ONCE)/g;
    expect(
      [...original.matchAll(brainPauseGate)],
      "writeBrainDoc must have exactly one structurally anchored pause gate"
    ).toHaveLength(1);
    const ungated = original.replace(brainPauseGate, "");
    expect(ungated, "the pause-gate plant did not change the source").not.toBe(original);
    const members = classifyCapabilities(ungated);
    const brain = members.find((m) => m.name === "writeBrainDoc");
    expect(isGated(brain!, members), "the classifier still calls it gated").toBe(false);
  });
});

// ---------------------------------------------------------------------------
// R-163 (audit P5-R3, row 17): the READ GRADE — minted inside the cage, refused
// by every writer by type AND at runtime, re-checked on every read.
// ---------------------------------------------------------------------------

function readGradeJournal(): DeletionJournalPort {
  return {
    appendTransition: async (request) => {
      const object = {
        objectKey: `test/deletion-journal/${request.operationId}/${String(request.version).padStart(8, "0")}.json`,
        objectVersionId: `version-${request.version}`,
        checksumSha256: journalRequestChecksum(request),
      };
      return { outcome: "confirmed" as const, ...request, ...object, receiptDigest: journalReceiptDigest(request, object) };
    },
  };
}

describe("R-163: the read grade", () => {
  let db: TestDb;
  let workspaceId: string;
  let profileId: string;
  let operationId: string;
  const journal = readGradeJournal();

  beforeEach(async () => {
    db = await createTestDb();
    await seedAuthUser(db, "rg_owner");
    const boot = await ensureUserWorkspace(db, { authUserId: "rg_owner", name: "Read Grade" });
    workspaceId = boot.workspace.id;
    await db.insert(session).values({
      id: "session-rg",
      token: "token-rg",
      userId: "rg_owner",
      expiresAt: new Date(Date.now() + HOUR),
      updatedAt: new Date(),
      reauthenticatedAt: new Date(),
      reauthenticatedMethod: "password",
    });
    const [profile] = await db
      .insert(creatorProfiles)
      .values({ workspaceId, displayName: "RG Creator" })
      .returning();
    profileId = profile!.id;
    const scope = await withWorkspace(db, { authUserId: "rg_owner" });
    const writer = writeCapabilities(await ProfileScope.mint(db, scope, profileId));
    await writer.appendOnboardingInput({ inputClass: "own_post", content: "RG-OWN-POST" });
    await db
      .insert(selections)
      .values({ id: boot.membership.id, userId: boot.user.id, workspaceId, profileId });
    const op = await requestWorkspaceDeletion(
      db,
      scope,
      { sessionId: "session-rg", idempotencyKey: "rg-delete", typedName: boot.workspace.name },
      journal
    );
    await transitionDeletionOperation(db, op.id, "external_actions_pending", journal);
    await transitionDeletionOperation(db, op.id, "grace", journal);
    operationId = op.id;
  });

  async function drain(source: AsyncIterable<string>): Promise<string> {
    let text = "";
    for await (const chunk of source) text += chunk;
    return text;
  }

  it("mints ONLY for a tombstoned workspace in the read window; the write grade refuses with the way forward", async () => {
    await expect(withWorkspace(db, { authUserId: "rg_owner" })).rejects.toBeInstanceOf(WorkspacePendingDeletionError);
    await expect(withWorkspace(db, { authUserId: "rg_owner" })).rejects.toThrow("/settings/account");
    const read = await withWorkspace(db, { authUserId: "rg_owner" }, { grade: "read" });
    expect(isReadGradeScope(read)).toBe(true);
    expect(read).toBeInstanceOf(ReadGradeWorkspaceScope);
    expect((await read.accessors.workspace())[0]!.lifecycleState).toBe("tombstoned");
    expect((await read.accessors.creatorProfiles()).map((p) => p.id)).toEqual([profileId]);
    // AC4: the export streams under the read grade (the route answers 200)...
    const exported = await drain(await openBrainExport(db, read, profileId, "json"));
    expect(exported).toContain("RG-OWN-POST");
    // ...and history reads.
    expect(await readBrainHistory(db, read, profileId, "voice")).toEqual([]);
    expect((await selectedProfileForMember(db, read))?.id).toBe(profileId);
    // Erasing: no grade mints.
    await db.update(deletionOperations).set({ state: "erasing" }).where(eq(deletionOperations.id, operationId));
    await expect(withWorkspace(db, { authUserId: "rg_owner" }, { grade: "read" })).rejects.toThrow(/being erased/);
  });

  it("R-166 (gate M2): `blocked` admits the read grade only while its resume state is before irreversible work", async () => {
    await db
      .update(deletionOperations)
      .set({ state: "blocked", blockedResumeState: "external_actions_pending" })
      .where(eq(deletionOperations.id, operationId));
    expect(isReadGradeScope(await withWorkspace(db, { authUserId: "rg_owner" }, { grade: "read" }))).toBe(true);
    for (const resume of ["erasing", "verifying"] as const) {
      await db
        .update(deletionOperations)
        .set({ state: "blocked", blockedResumeState: resume })
        .where(eq(deletionOperations.id, operationId));
      await expect(withWorkspace(db, { authUserId: "rg_owner" }, { grade: "read" })).rejects.toThrow(/being erased/);
    }
  });

  it("a writer refuses it by TYPE, and smuggled through `as unknown as` the cage-has class refuses at runtime", async () => {
    const read = await withWorkspace(db, { authUserId: "rg_owner" }, { grade: "read" });
    if (!isReadGradeScope(read)) throw new Error("expected the read grade");
    // @ts-expect-error a ReadGradeWorkspaceScope is not a WorkspaceScope: no writer's signature accepts it.
    expect(() => workspaceWriteCapabilities(read)).toThrow(ScopeForgeryError);
    // (a) the cage-`has` class: smuggled past the type, refused by the cage.
    expect(() => workspaceWriteCapabilities(read as unknown as WorkspaceScope)).toThrow(ScopeForgeryError);
    // The `assertScoped`-only class's own fence is byte-identical, so it refuses...
    expect(() => assertScoped(read)).toThrow(ScopeForgeryError);
    // ...while the readers' assertion admits it.
    expect(() => assertReadScoped(read)).not.toThrow();
    // A profile scope minted from it is the read grade too, never a ProfileScope.
    const profileRead = await ReadGradeProfileScope.mint(db, read, profileId);
    expect(() => writeCapabilities(profileRead as unknown as ProfileScope)).toThrow(ScopeForgeryError);
    expect(() => assertScoped(profileRead)).toThrow(ScopeForgeryError);
  });

  it("(c) the lifecycle re-read: minted in grace, the operation then ERASING — every read refuses at the read sibling", async () => {
    const read = await withWorkspace(db, { authUserId: "rg_owner" }, { grade: "read" });
    if (!isReadGradeScope(read)) throw new Error("expected the read grade");
    const profileRead = await ReadGradeProfileScope.mint(db, read, profileId);
    await db.update(deletionOperations).set({ state: "erasing" }).where(eq(deletionOperations.id, operationId));
    const refusal = "lifecycle_refused:workspace_access_tombstoned_or_suspended";
    await expect(read.accessors.creatorProfiles()).rejects.toThrow(refusal);
    await expect(profileRead.accessors.brainDocsByKind("voice")).rejects.toThrow(refusal);
    await expect(selectedProfileForMember(db, read)).rejects.toThrow(refusal);
    await expect(readBrainHistory(db, read, profileId, "voice")).rejects.toBeInstanceOf(ProfileAccessError);
    await expect(openBrainExport(db, read, profileId, "json")).rejects.toBeInstanceOf(ProfileAccessError);
  });

  it("(d) the epoch: a membership-version bump after the mint makes the next read refuse scope_stale", async () => {
    const read = await withWorkspace(db, { authUserId: "rg_owner" }, { grade: "read" });
    if (!isReadGradeScope(read)) throw new Error("expected the read grade");
    const profileRead = await ReadGradeProfileScope.mint(db, read, profileId);
    await db
      .update(memberships)
      .set({ version: read.membershipVersion + 1 })
      .where(eq(memberships.workspaceId, workspaceId));
    await expect(read.accessors.creatorProfiles()).rejects.toThrow("lifecycle_refused:scope_stale");
    await expect(profileRead.accessors.brainDocsByKind("voice")).rejects.toThrow("lifecycle_refused:scope_stale");
    await expect(readBrainHistory(db, read, profileId, "voice")).rejects.toThrow("lifecycle_refused:scope_stale");
  });

  it("assertScoped is BYTE-IDENTICAL to its pre-R-163 body: two cages, never the read grade's", () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), "../src/with-workspace.ts"),
      "utf8"
    ).replace(/\r\n/g, "\n");
    const start = source.indexOf("export function assertScoped(");
    const body = source.slice(start, source.indexOf("\n}\n", start) + 2);
    expect(body).toBe(
      [
        "export function assertScoped(",
        "  s: unknown",
        "): asserts s is ProfileScope | WorkspaceScope {",
        "  if (",
        '    typeof s !== "object" ||',
        "    s === null ||",
        "    !(profileCage.has(s) || workspaceCage.has(s))",
        "  ) {",
        '    throw new ScopeForgeryError("This value");',
        "  }",
        "}",
      ].join("\n")
    );
  });
});

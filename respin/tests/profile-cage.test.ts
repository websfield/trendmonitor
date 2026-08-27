// P5 + P7 — the FORGERY suite, and the two properties the cage exists for:
// that a scope cannot be manufactured, and that every consumer checks.
//
// Read the header of `packages/db/src/with-workspace.ts` first. It records
// which guard stops which forge and — more usefully — which guards do NOT
// work, each measured rather than reasoned about across five plan-gate rounds.
//
// EVERY MUTATION BELOW IS LABELLED WITH THE TOOL THAT PRODUCES ITS RED, and
// the labels are not decorative: a previous draft labelled the
// `Reflect.construct` row "new.target" and the mutation was GREEN, because
// `Reflect.construct(target, args)` defaults newTarget to the target. Three
// rows that reviewers first called "compile-red" were in fact lint-red, which
// would have been red for the wrong reason.
//
//   compile-red  — asserted here with `@ts-expect-error`. An unused directive
//                  is TS2578, so `pnpm typecheck` fails if the forge ever
//                  starts compiling. This is a REAL assertion, not a comment.
//   runtime-red  — asserted by executing the forge and expecting
//                  ScopeForgeryError.
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  createTestDb,
  ensureUserWorkspace,
  seedAuthUser,
  creatorProfiles,
} from "@respin/db";
// The scopes are exported as TYPES ONLY from the package root (A-2b), so the
// value form is reachable only from the module itself — which is what makes
// the `@ts-expect-error` block below fail to compile at the package boundary.
// Root `tests/**` is outside the eslint package/app blocks, so it may reach in.
import {
  assertScoped,
  ProfileScope,
  ScopeForgeryError,
  withWorkspace,
  writeCapabilities,
  type ProfileAccessors,
  type VerifiedProfileId,
  type WorkspaceScope,
} from "../packages/db/src/with-workspace";

const OTHER_PROFILE = "00000000-0000-0000-0000-0000000000ff";

async function fixture() {
  const db = await createTestDb();
  await seedAuthUser(db, "cage_user");
  const workspaceId = (
    await ensureUserWorkspace(db, { authUserId: "cage_user", name: "Cage" })
  ).workspace.id;
  const [profile] = await db
    .insert(creatorProfiles)
    .values({ workspaceId, displayName: "P" })
    .returning();
  const wsScope = await withWorkspace(db, { authUserId: "cage_user" });
  const scope = await ProfileScope.mint(db, wsScope, profile.id);
  return { db, workspaceId, profile, wsScope, scope };
}

describe("P7 — the fifteen forgeries", () => {
  // ------------------------------------------------------- compile-red (9)

  it("compile-red 1-7: seven forges that do not typecheck", async () => {
    const { scope } = await fixture();
    const caps = writeCapabilities(scope);
    const other = OTHER_PROFILE as VerifiedProfileId;

    const never = () => {
      // ---- 1. SPREAD. TS2741 — the private `#cage` field cannot be copied.
      // This is the forge a `unique symbol` BRAND does NOT stop: a brand has no
      // runtime existence and spread copies symbol keys, so the branded version
      // compiled at exit 0.
      // @ts-expect-error TS2741
      const spread: ProfileScope = { ...scope, profileId: other };
      void spread;

      // ---- 2. IN-PLACE ASSIGNMENT. TS2540 — every field is `readonly`.
      // @ts-expect-error TS2540
      scope.profileId = other;

      // ---- 5. A NON-LITERAL CARRYING IDS. TS2345.
      // Excess-property checking fires ONLY on fresh object literals, so plain
      // `Omit` did not stop this — `declare const full: NewBrainDoc;
      // caps.writeBrainDoc(full, tx)` compiled at exit 0 in round 3. The
      // `?: never` mapped type is what rejects the non-literal.
      const withIds = JSON.parse("{}") as {
        kind: "voice";
        content: unknown;
        sourceEvidence: null;
        reason: string;
        profileId: string;
      };
      // @ts-expect-error TS2345
      void caps.writeBrainDoc(withIds, null as never);

      // ---- 6. A NON-LITERAL CARRYING status:"active". TS2345.
      // Round 2 guarded the ids and missed this one. It is WORSE than the leak
      // the guard was written for: a silent brain activation, bypassing the
      // creator confirmation REQ-B02 requires.
      const withStatus = JSON.parse("{}") as {
        kind: "voice";
        content: unknown;
        sourceEvidence: null;
        reason: string;
        status: "active";
      };
      // @ts-expect-error TS2345
      void caps.writeBrainDoc(withStatus, null as never);

      // ---- 6b. …and `version`, which round 3's named constant still missed.
      const withVersion = JSON.parse("{}") as {
        kind: "voice";
        content: unknown;
        sourceEvidence: null;
        reason: string;
        version: number;
      };
      // @ts-expect-error TS2345
      void caps.writeBrainDoc(withVersion, null as never);

      // ---- 7. A STRUCTURAL TYPE ALIAS DECLARED ELSEWHERE. TS2345.
      // The shape a caller would write if they wanted to describe "a scope"
      // without holding one. It has every PUBLIC field and is still rejected.
      type FakeScope = {
        workspaceId: string;
        profileId: string;
        accessors: ProfileAccessors;
      };
      const fake = JSON.parse("{}") as FakeScope;
      // @ts-expect-error TS2345
      void writeCapabilities(fake);

      // ---- P5. A BARE STRING WHERE A VerifiedProfileId IS REQUIRED. TS2345.
      const takesVerified = (id: VerifiedProfileId) => String(id);
      // @ts-expect-error TS2345
      takesVerified("just-a-string");
    };
    expect(typeof never).toBe("function");
  });

  // 3 and 4 need declaration position, so they sit outside the function above.
  // @ts-expect-error TS2675 — cannot extend a class whose constructor is private.
  class Evil extends ProfileScope {}
  it("compile-red 3: `extends ProfileScope` does not typecheck (TS2675)", () => {
    expect(typeof Evil).toBe("function");
  });

  it("compile-red 4: `new ProfileScope(...)` does not typecheck (TS2673)", () => {
    const never = () => {
      // @ts-expect-error TS2673 — the constructor is private.
      return new ProfileScope();
    };
    expect(typeof never).toBe("function");
  });

  it("compile-red 8+9: the package root exports the scopes as TYPES ONLY (TS1362)", async () => {
    // AC-15's evidence is `tsc`, NOT eslint — and that distinction was measured:
    // `allowImportNames` makes no type/value distinction, and four fixtures run
    // through the installed ESLint showed a value import and an `extends` both
    // ALLOWED under the allowlist. `export type` is what actually closes it,
    // and it closes it for app/** and packages/** alike, from one declaration.
    const mod = await import("@respin/db");
    const never = () => {
      // @ts-expect-error TS1362 — ProfileScope is exported using 'export type'.
      void mod.ProfileScope;
      // @ts-expect-error TS1362 — and so is WorkspaceScope.
      void mod.WorkspaceScope;
    };
    expect(typeof never).toBe("function");
    // ...and the runtime confirms it: the names are erased entirely, so there
    // is nothing to `extends` even from JavaScript.
    expect("ProfileScope" in mod).toBe(false);
    expect("WorkspaceScope" in mod).toBe(false);
  });

  // ------------------------------------- runtime-red via the WeakSet cage (3)

  it("runtime-red 10-12: Object.assign, a bare cast, and a Proxy are all refused", async () => {
    const { scope } = await fixture();

    // ---- 10. Object.assign. Its DECLARED return type is an intersection that
    // satisfies `#cage`, so this compiles at exit 0 — while the runtime value
    // has no private field and was never minted.
    const assigned = Object.assign({}, scope, {
      profileId: OTHER_PROFILE,
    }) as unknown as ProfileScope;
    expect(() => writeCapabilities(assigned)).toThrow(ScopeForgeryError);
    expect(() => assertScoped(assigned)).toThrow(ScopeForgeryError);

    // ---- 11. A bare cast over an empty object.
    const bare = {} as unknown as ProfileScope;
    expect(() => writeCapabilities(bare)).toThrow(ScopeForgeryError);

    // ---- 12. A Proxy over a REAL scope. `instanceof` accepts it (the target's
    // prototype is reachable) and so does `#cage in x`; only object IDENTITY
    // rejects it, which is why the cage is a WeakSet and not a brand check.
    const proxied = new Proxy(scope, {
      get: (t, k) => (k === "profileId" ? OTHER_PROFILE : Reflect.get(t, k)),
    });
    expect(proxied instanceof ProfileScope, "the premise: instanceof PASSES it").toBe(
      true
    );
    expect(() => writeCapabilities(proxied)).toThrow(ScopeForgeryError);
  });

  // ------------------------------------- runtime-red via the MINT token (3)

  it("runtime-red 13-15: Reflect.construct, `new (X as any)`, and a subclass are all refused", async () => {
    const { db, workspaceId } = await fixture();
    const args = [db, workspaceId, OTHER_PROFILE];

    // ---- 13. Reflect.construct. THE ROW A PREVIOUS DRAFT GOT WRONG.
    // `Reflect.construct(target, args)` defaults newTarget to `target`, so
    // `new.target === ProfileScope` and a new.target-only guard PASSES it — the
    // mutation was green. It reaches the constructor and would REGISTER in the
    // cage, so neither the WeakSet nor `#cage in x` could see it afterwards.
    // Only the module-private token stops it, and only because the token is a
    // module `const` rather than a `private static` field (which erases, and
    // would be readable as `(ProfileScope as any).TOKEN`).
    expect(() => Reflect.construct(ProfileScope, args)).toThrow(
      ScopeForgeryError
    );

    // ---- 14. `new (X as any)(...)` — same reach, same refusal.
    const Ctor = ProfileScope as unknown as new (...a: unknown[]) => unknown;
    expect(() => new Ctor(...args)).toThrow(ScopeForgeryError);

    // ---- 15. A RUNTIME subclass. `extends` is a compile error (row 3) and
    // erases, so this is how it is actually attempted. `super()` runs the
    // constructor, which is why a WeakSet check alone would have accepted it —
    // my own earlier claim that "the WeakSet rejects all three" was FALSE for
    // this row, measured.
    const Base = ProfileScope as unknown as new (...a: unknown[]) => object;
    class RuntimeEvil extends Base {
      constructor() {
        super(...args);
      }
    }
    expect(() => new RuntimeEvil()).toThrow(ScopeForgeryError);
  });

  it("non-vacuity: a REAL scope passes every check the forgeries fail", async () => {
    const { scope, wsScope } = await fixture();
    expect(() => assertScoped(scope)).not.toThrow();
    expect(() => assertScoped(wsScope)).not.toThrow();
    expect(() => writeCapabilities(scope)).not.toThrow();
    // ...and a WorkspaceScope is not a write-capability holder, so the second
    // check in writeCapabilities is doing work too.
    expect(() =>
      writeCapabilities(wsScope as unknown as ProfileScope)
    ).toThrow(ScopeForgeryError);
  });
});

describe("AC-13 — assertScoped blocks the viewer→owner escalation", () => {
  it("Object.assign({role:'owner'}) over a viewer scope is refused at assertOwner", async () => {
    const db = await createTestDb();
    const { schema } = await import("@respin/db");
    const [w] = await db
      .insert(schema.workspaces)
      .values({ name: "Esc" })
      .returning();
    // One auth user, one domain user and one membership PER ROLE:
    // `memberships_user_workspace_uq` forbids one user holding both on one
    // workspace, so a role matrix cannot reuse a single seeded identity.
    for (const role of ["owner", "viewer"] as const) {
      await seedAuthUser(db, `esc_${role}`);
      const [u] = await db
        .insert(schema.users)
        .values({ authUserId: `esc_${role}` })
        .returning();
      await db
        .insert(schema.memberships)
        .values({ userId: u.id, workspaceId: w.id, role });
    }
    const viewer = await withWorkspace(db, {
      authUserId: "esc_viewer",
      workspaceId: w.id,
    });
    expect(viewer.role).toBe("viewer");

    // THE FORGE. This compiles at exit 0 — `Object.assign`'s declared return
    // type is an intersection that satisfies `#cage`. Before M2a it arrived at
    // `assertOwner` as an owner and every billing action in the file ran.
    const escalated = Object.assign({}, viewer, {
      role: "owner" as const,
    }) as unknown as WorkspaceScope;

    const { createPortalUrl } = await import(
      "../packages/credits/src/stripe/actions"
    );
    await expect(
      createPortalUrl(db, escalated, "https://x")
    ).rejects.toBeInstanceOf(ScopeForgeryError);

    // NON-VACUITY, both directions: the real VIEWER is refused for being a
    // viewer (a different, honest refusal), and a real OWNER gets past the
    // gate — so the ScopeForgeryError above is about the forgery, not about
    // createPortalUrl refusing everything.
    const { BillingRoleError } = await import(
      "../packages/credits/src/stripe/actions"
    );
    await expect(
      createPortalUrl(db, viewer, "https://x")
    ).rejects.toBeInstanceOf(BillingRoleError);
    const owner = await withWorkspace(db, {
      authUserId: "esc_owner",
      workspaceId: w.id,
    });
    await expect(createPortalUrl(db, owner, "https://x")).rejects.not.toThrow(
      ScopeForgeryError
    );
  });
});

// ---------------------------------------------------------------------------
// AC-13, second half — the COMPLETENESS scan.
//
// assertScoped is inserted in exactly ONE place: assertOwner in
// packages/credits/src/stripe/actions.ts. All seven exported actions call it as
// their first statement and all seven facade methods delegate to one of them,
// so one insertion covers all fourteen WorkspaceScope-taking entries.
//
// THAT IS PRECISELY WHY THIS SCAN EXISTS. A fifteenth entry in M2b that does
// not need owner — a read, or a viewer-permitted action — would bypass the cage
// silently, and the escalation test above could never fire for it, because it
// asserts a behaviour of assertOwner. So the property is checked STRUCTURALLY:
// every function whose signature names a WorkspaceScope must reach
// assertScoped, directly or through something that does.
//
// Precedent: the takeWorkspaceLock source scan in the credits actions suite.
// ---------------------------------------------------------------------------

type Entry = {
  key: string;
  name: string;
  file: string;
  body: string;
  params: string;
};

/**
 * Entries come from a real TypeScript PARSE, not from regexes over source.
 *
 * The regex version saw exactly three shapes — `function name(`, `name: (` and
 * `const name = (` — and the tenancy gate ran it against planted sources to
 * show that a GENERIC function declaration, `const x = function (...)`, a
 * GENERIC arrow, a CLASS METHOD and a DEFAULT-EXPORT function each yielded
 * ZERO entries. Because the surface below is pinned with an exact `toEqual`,
 * such an entry was invisible to BOTH halves of AC-13 and the suite stayed
 * green: the precise silent bypass this scan exists to catch, in the scan
 * itself.
 *
 * That is the fail-open class this repo has now met twice — a source guard
 * whose pattern breaks reports zero violations because it found zero
 * candidates. A parser has no pattern to break, and the per-shape probes below
 * are the standing proof.
 */
function nameOf(node: ts.Node, sf: ts.SourceFile): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText(sf);
  }
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && parent.name) {
    return parent.name.getText(sf);
  }
  if (parent && ts.isPropertyAssignment(parent) && parent.name) {
    return parent.name.getText(sf);
  }
  if (ts.isFunctionDeclaration(node)) return "default";
  return undefined;
}

function collectEntries(files: Map<string, string>): Entry[] {
  const entries: Entry[] = [];
  for (const [file, src] of files) {
    const sf = ts.createSourceFile(
      file,
      src,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const name = nameOf(node, sf);
        if (name) {
          entries.push({
            key: file + ":" + name + ":" + node.pos,
            name,
            file,
            params: node.parameters.map((p) => p.getText(sf)).join(", "),
            body: node.body ? node.body.getText(sf) : "",
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return entries;
}

/**
 * Is this entry COVERED — i.e. can a scope reach it without having been
 * asserted?
 *
 * Two ways, and the second is the one the plan's wording requires:
 *
 *   FORWARD — the entry calls assertScoped, or calls something that does.
 *             This is what the seven exported actions do, through assertOwner.
 *             KNOWN LIMIT (tenancy gate NOTE): it does not check WHICH value is
 *             passed, so `foo(scopeA)` calling `assertOwner(scopeB)` counts as
 *             covered. Harmless while there is exactly one asserter and every
 *             action forwards its own parameter; worth tightening the moment
 *             M2b adds a second asserter, which is when the two could diverge.
 *
 *   BACKWARD — every CALLER of the entry is covered, and it has at least one.
 *             This is what `subscriptionRow` and `liveSubscription` do: they
 *             build a query from `scope.workspaceId` and assert nothing
 *             themselves, but a scope only reaches them through an action that
 *             has already asserted. Requiring a caller is what stops the rule
 *             degenerating — an entry NOBODY calls is not "covered", it is
 *             unreachable-today, which is a different claim and a weaker one.
 *
 * The scan found those two on its first run and they are the reason the
 * backward rule is implemented rather than the two functions being waved past.
 *
 * Callees resolve by NAME across all files, not within one file, and that is
 * load-bearing: app-server.ts's facade property `createPortalUrl` calls the
 * ACTION of the same name, so same-file-first resolution would find only the
 * property itself and report a self-cycle.
 */
function coveredEntries(entries: Entry[]): Set<string> {
  const byName = new Map<string, Entry[]>();
  for (const e of entries) {
    const list = byName.get(e.name) ?? [];
    list.push(e);
    byName.set(e.name, list);
  }
  const calleesOf = new Map<string, Set<string>>();
  for (const e of entries) {
    const out = new Set<string>();
    for (const m of e.body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      for (const callee of byName.get(m[1]) ?? []) {
        if (callee.key !== e.key) out.add(callee.key);
      }
    }
    calleesOf.set(e.key, out);
  }
  const callersOf = new Map<string, Set<string>>();
  for (const e of entries) callersOf.set(e.key, new Set());
  for (const [caller, callees] of calleesOf) {
    for (const callee of callees) callersOf.get(callee)?.add(caller);
  }

  // FORWARD closure, to a fixpoint.
  const covered = new Set<string>(
    entries.filter((e) => /\bassertScoped\s*\(/.test(e.body)).map((e) => e.key)
  );
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of entries) {
      if (covered.has(e.key)) continue;
      for (const callee of calleesOf.get(e.key) ?? []) {
        if (covered.has(callee)) {
          covered.add(e.key);
          changed = true;
          break;
        }
      }
    }
  }
  // BACKWARD closure, to a fixpoint, on top of it.
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of entries) {
      if (covered.has(e.key)) continue;
      const callers = callersOf.get(e.key) ?? new Set<string>();
      if (callers.size > 0 && [...callers].every((c) => covered.has(c))) {
        covered.add(e.key);
        changed = true;
      }
    }
  }
  return covered;
}

async function creditsSources(): Promise<Map<string, string>> {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join, relative, resolve: res, dirname, sep } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = res(dirname(fileURLToPath(import.meta.url)), "..");
  const files = new Map<string, string>();
  const walkDir = (d: string) => {
    for (const n of readdirSync(d)) {
      const full = join(d, n);
      if (statSync(full).isDirectory()) walkDir(full);
      else if (n.endsWith(".ts")) {
        files.set(
          relative(root, full).split(sep).join("/"),
          readFileSync(full, "utf8")
        );
      }
    }
  };
  walkDir(join(root, "packages/credits/src"));
  return files;
}

const takesScope = (e: Entry) => /\bWorkspaceScope\b/.test(e.params);

describe("AC-13 (completeness): every WorkspaceScope entry in @respin/credits reaches assertScoped", () => {
  it("pins the WorkspaceScope-taking surface by NAME, and every entry is covered", async () => {
    const entries = collectEntries(await creditsSources());
    const scoped = entries.filter(takesScope);
    // The SURFACE IS PINNED BY NAME, not by a count. If M2b adds an entry this
    // fails and someone has to look at it — which is the entire point, because
    // an uncovered new entry is invisible to every behavioural test here.
    //
    // SEVENTEEN, not the plan's fourteen, and the difference is not a defect in
    // either: the plan counted the PUBLIC surface (7 exported actions + 7
    // facade methods), while this scan also sees the three package-internal
    // helpers those actions call. Checking them too is strictly better — a
    // helper is exactly where a future refactor would move a scope read to —
    // so the number is corrected here rather than the scan narrowed to match.
    expect(
      scoped.map((e) => e.file + ":" + e.name).sort(),
      "the WorkspaceScope-taking surface changed — check the new entry reaches assertScoped, then update this list"
    ).toEqual(
      [
        // The 7 wired facade methods (app-server.ts).
        "packages/credits/src/app-server.ts:createInvoiceRecoveryUrl",
        "packages/credits/src/app-server.ts:createPackCheckoutUrl",
        "packages/credits/src/app-server.ts:createPortalUrl",
        "packages/credits/src/app-server.ts:createTierCheckoutUrl",
        "packages/credits/src/app-server.ts:pauseSubscription",
        "packages/credits/src/app-server.ts:resumeSubscription",
        "packages/credits/src/app-server.ts:setAutoTopup",
        // The 7 exported actions (stripe/actions.ts).
        "packages/credits/src/stripe/actions.ts:createInvoiceRecoveryUrl",
        "packages/credits/src/stripe/actions.ts:createPackCheckoutUrl",
        "packages/credits/src/stripe/actions.ts:createPortalUrl",
        "packages/credits/src/stripe/actions.ts:createTierCheckoutUrl",
        "packages/credits/src/stripe/actions.ts:pauseSubscription",
        "packages/credits/src/stripe/actions.ts:resumeSubscription",
        "packages/credits/src/stripe/actions.ts:setAutoTopup",
        // ...and the 3 package-internal helpers they funnel through.
        "packages/credits/src/stripe/actions.ts:assertOwner",
        "packages/credits/src/stripe/actions.ts:liveSubscription",
        "packages/credits/src/stripe/actions.ts:subscriptionRow",
      ].sort()
    );

    const covered = coveredEntries(entries);
    const uncovered = scoped
      .filter((e) => !covered.has(e.key))
      .map((e) => e.file + ":" + e.name);
    expect(
      uncovered,
      "these take a WorkspaceScope and never reach assertScoped — a forged scope arrives unchecked"
    ).toEqual([]);
  });

  it("the transitive walk is doing real work, not matching a literal everywhere", async () => {
    const entries = collectEntries(await creditsSources());
    const scoped = entries.filter(takesScope);
    const direct = scoped.filter((e) => /\bassertScoped\s*\(/.test(e.body));
    // If every entry contained the call literally, the transitive walk would be
    // untested and a broken walk would still report green.
    expect(
      direct.length,
      "every entry calls assertScoped directly — the transitive walk is untested"
    ).toBeLessThan(scoped.length);
  });

  it("NON-VACUITY: a planted UNCOVERED entry is reported", () => {
    const planted = new Map<string, string>([
      [
        "packages/credits/src/planted.ts",
        "export async function readSomething(db: DbLike, scope: WorkspaceScope) {\n" +
          "  return db.select().from(t).where(eq(t.workspaceId, scope.workspaceId));\n" +
          "}\n",
      ],
    ]);
    const entries = collectEntries(planted);
    const scoped = entries.filter(takesScope);
    expect(scoped).toHaveLength(1);
    // Uncovered BOTH ways: it asserts nothing, and nothing calls it.
    expect(coveredEntries(entries).has(scoped[0].key)).toBe(false);
  });

  it("NON-VACUITY the other way: a planted COVERED entry is not reported", () => {
    const planted = new Map<string, string>([
      [
        "packages/credits/src/planted.ts",
        "function gate(scope: WorkspaceScope) { assertScoped(scope); }\n" +
          "export async function readSomething(db: DbLike, scope: WorkspaceScope) {\n" +
          "  gate(scope);\n  return db;\n}\n",
      ],
    ]);
    const entries = collectEntries(planted);
    const covered = coveredEntries(entries);
    const scoped = entries.filter(takesScope);
    expect(scoped.length).toBeGreaterThanOrEqual(2);
    for (const e of scoped) expect(covered.has(e.key), e.name).toBe(true);
  });
});

describe("AC-13 (the scanner's own coverage): every declaration shape is seen", () => {
  // THE FIVE SHAPES THE REGEX VERSION MISSED, each yielding zero entries when
  // the tenancy gate ran them. They are ordinary TypeScript, not exotica: a
  // generic helper, a function expression, a generic arrow, a class method and
  // a default export are all things M2b will plausibly write. Every one of
  // them would have been invisible to BOTH halves of AC-13 while the pinned
  // surface stayed green.
  const SHAPES: [string, string][] = [
    [
      "generic function declaration",
      "export async function readIt<T>(db: DbLike, scope: WorkspaceScope): Promise<T> { return db as T; }",
    ],
    [
      "const = function expression",
      "export const readIt = function (db: DbLike, scope: WorkspaceScope) { return db; };",
    ],
    [
      "generic arrow",
      "export const readIt = <T,>(db: DbLike, scope: WorkspaceScope): T => db as T;",
    ],
    [
      "class method",
      "export class Reader { readIt(db: DbLike, scope: WorkspaceScope) { return db; } }",
    ],
    [
      "default-export function",
      "export default function (db: DbLike, scope: WorkspaceScope) { return db; }",
    ],
    [
      "object-literal method shorthand",
      "export const facade = { readIt(db: DbLike, scope: WorkspaceScope) { return db; } };",
    ],
  ];

  it.each(SHAPES)("sees a WorkspaceScope entry declared as a %s", (_label, src) => {
    const entries = collectEntries(
      new Map([["packages/credits/src/probe.ts", src]])
    );
    const scoped = entries.filter(takesScope);
    expect(
      scoped.length,
      "this declaration shape is invisible to the AC-13 scan"
    ).toBeGreaterThanOrEqual(1);
    // ...and it is reported UNCOVERED, since nothing here asserts — so the
    // shape being seen actually translates into the finding it should.
    expect(coveredEntries(entries).has(scoped[0].key)).toBe(false);
  });

  it("KNOWN LIMIT, pinned rather than left to be discovered", () => {
    // The scan matches the literal type NAME in the parameter text. A scope
    // reached through an alias, or through an options-object type declared in
    // another module, is invisible — resolving that needs a full type checker
    // over the program, not a per-file parse. There are ZERO such entries
    // today, which is what makes this a limit rather than a gap; R-30's
    // "Revisit" line leans on this scan, so the limit is stated here.
    const aliased = collectEntries(
      new Map([
        [
          "packages/credits/src/probe.ts",
          "type Ctx = WorkspaceScope;\nexport function readIt(db: DbLike, scope: Ctx) { return db; }",
        ],
      ])
    );
    expect(
      aliased.filter(takesScope),
      "if this ever finds the aliased entry, delete this test — the limit is gone"
    ).toHaveLength(0);
  });
});

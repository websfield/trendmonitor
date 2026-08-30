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
// assertScoped has THREE insertion points as of slice 1: `assertOwner` in
// packages/credits/src/stripe/actions.ts (the billing surface), `createProfile`
// in packages/credits/src/profiles.ts, and the two capability factories plus
// `ProfileScope.mint` in packages/db/src/with-workspace.ts. It had exactly one
// when this scan was written, and the arrival of the second is precisely what
// the old forward rule's known-limit note said to tighten for — see
// `coveredEntries` for the argument-identity rule that replaced it.
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

type Call = { callee: string; args: string[] };

type Entry = {
  key: string;
  name: string;
  file: string;
  body: string;
  params: string;
  /** Parameter NAMES of this entry whose declared type names a scope. */
  scopeParams: string[];
  /**
   * `scopeParams` plus those of every LEXICALLY ENCLOSING entry.
   *
   * The distinction is what makes the argument-identity rule below usable
   * rather than merely strict. `writeCapabilities(scope)` asserts and then
   * returns closures that use `scope` from the enclosing binding — those
   * closures have no scope PARAMETER at all, and a rule that looked only at
   * parameters would report every write capability in the repo as uncovered.
   * A closure's enclosing parameter is still a scope the caller had to supply,
   * so it counts; an arbitrary local (`const other = ...`) does not.
   */
  scopeNamesInScope: string[];
  /** Every call expression under this node: callee name + argument source. */
  calls: Call[];
  /** Key of the lexically enclosing entry, if any. */
  parentKey?: string;
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

/** The type names that make a parameter a scope parameter (task 24). */
const SCOPE_TYPE_RE = /\b(?:Workspace|Profile)Scope\b/;

/**
 * The simple NAME a call expression invokes: `assertScoped(x)` -> assertScoped,
 * `ProfileScope.mint(a, b)` -> mint, `caps.createProfile(p, tx)` -> createProfile.
 *
 * The last segment, deliberately: `byName` below resolves callees across every
 * file, so a static method and a facade property that wrap the same operation
 * both resolve, which is what lets the walk follow `ProfileScope.mint` into the
 * class method that actually asserts.
 */
function calleeName(expr: ts.Expression, sf: ts.SourceFile): string | undefined {
  if (ts.isIdentifier(expr)) return expr.getText(sf);
  if (ts.isPropertyAccessExpression(expr)) return expr.name.getText(sf);
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
    const visit = (node: ts.Node, enclosing: Entry | undefined): void => {
      let current = enclosing;
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)
      ) {
        const name = nameOf(node, sf);
        if (name) {
          const scopeParams = node.parameters
            .filter((prm) => SCOPE_TYPE_RE.test(prm.type?.getText(sf) ?? ""))
            .map((prm) => prm.name.getText(sf));
          const calls: Call[] = [];
          const collectCalls = (n: ts.Node): void => {
            if (ts.isCallExpression(n)) {
              const callee = calleeName(n.expression, sf);
              if (callee) {
                calls.push({
                  callee,
                  args: n.arguments.map((a) => a.getText(sf)),
                });
              }
            }
            ts.forEachChild(n, collectCalls);
          };
          if (node.body) collectCalls(node.body);
          const entry: Entry = {
            key: file + ":" + name + ":" + node.pos,
            name,
            file,
            params: node.parameters.map((prm) => prm.getText(sf)).join(", "),
            body: node.body ? node.body.getText(sf) : "",
            scopeParams,
            scopeNamesInScope: [
              ...new Set([...(enclosing?.scopeNamesInScope ?? []), ...scopeParams]),
            ],
            calls,
            parentKey: enclosing?.key,
          };
          entries.push(entry);
          current = entry;
        }
      }
      ts.forEachChild(node, (child) => visit(child, current));
    };
    visit(sf, undefined);
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
  // Callee keys WITH the argument texts the call site passed. The pair is what
  // argument identity needs, so the edge carries it rather than the graph being
  // rebuilt from body text a second time — and the callee names now come from
  // real CallExpression nodes rather than from an identifier-then-paren regex,
  // which also counted `if (`, `catch (` and every type assertion.
  const calleesOf = new Map<string, { key: string; args: string[] }[]>();
  for (const e of entries) {
    const out: { key: string; args: string[] }[] = [];
    for (const call of e.calls) {
      for (const callee of byName.get(call.callee) ?? []) {
        if (callee.key !== e.key) out.push({ key: callee.key, args: call.args });
      }
    }
    calleesOf.set(e.key, out);
  }
  const callersOf = new Map<string, Set<string>>();
  for (const e of entries) callersOf.set(e.key, new Set());
  for (const [caller, callees] of calleesOf) {
    for (const c of callees) callersOf.get(c.key)?.add(caller);
  }

  /** Did this call site pass one of the entry's OWN scope bindings? */
  const forwardsOwnScope = (e: Entry, args: string[]): boolean =>
    args.some((a) => e.scopeNamesInScope.includes(a.trim()));

  // FORWARD, direct: `assertScoped(s)` where `s` is this entry's own scope.
  const covered = new Set<string>(
    entries
      .filter((e) =>
        e.calls.some(
          (c) => c.callee === "assertScoped" && forwardsOwnScope(e, c.args)
        )
      )
      .map((e) => e.key)
  );
  // FORWARD transitive + ENCLOSURE, to a fixpoint.
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of entries) {
      if (covered.has(e.key)) continue;
      // ENCLOSURE — and ONLY for an entry that takes no scope of its own.
      //
      // The tenancy gate found the unguarded version re-opened the hole
      // argument identity had just closed (2026-08-27): a nested closure
      // declaring its OWN scope parameter inherited coverage unconditionally,
      // so `transfer: async (otherScope: WorkspaceScope, tx) => …` added inside
      // `workspaceWriteCapabilities` would be reported covered while never
      // asserting `otherScope`. That is the "asserts somebody else's scope"
      // case, one rule down from its own fix. The soundness argument only ever
      // held for a closure with NOTHING of its own to assert.
      if (
        e.parentKey &&
        covered.has(e.parentKey) &&
        e.scopeParams.length === 0
      ) {
        covered.add(e.key);
        changed = true;
        continue;
      }
      for (const callee of calleesOf.get(e.key) ?? []) {
        if (covered.has(callee.key) && forwardsOwnScope(e, callee.args)) {
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

/**
 * EVERY package's `src` tree, not just @respin/credits (task 24).
 *
 * The scan was written when the only scope-taking surface lived in
 * `packages/credits/src`, and R-30's own Revisit line predicted where that
 * would break: "the first new scope-taking entry outside credits". Slice 1 adds
 * three — `workspaceWriteCapabilities` and the two intake operations, all in
 * `packages/db/src` — and under the old root the scan would have reported
 * seventeen covered entries and seen none of them. A scan that reads the wrong
 * directory is indistinguishable from a scan that is working.
 */
async function packageSources(): Promise<Map<string, string>> {
  const { readdirSync, readFileSync, statSync, existsSync } = await import("node:fs");
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
  const packagesDir = join(root, "packages");
  for (const pkg of readdirSync(packagesDir)) {
    const src = join(packagesDir, pkg, "src");
    if (existsSync(src) && statSync(src).isDirectory()) walkDir(src);
  }
  return files;
}

/**
 * BOTH GRAINS (task 24). The predicate was `/\bWorkspaceScope\b/` over the
 * parameter TEXT — which sees neither `writeCapabilities(scope: ProfileScope)`
 * nor any of M2b-1's profile-grained write surface. It now reads the scope
 * parameters the collector already resolved with `SCOPE_TYPE_RE`, so the
 * collector and the filter cannot drift: one regex, both readers.
 */
const takesScope = (e: Entry) => e.scopeParams.length > 0;

describe("AC-13 (completeness): every scope-taking entry in packages/** reaches assertScoped", () => {
  it("pins the WorkspaceScope-taking surface by NAME, and every entry is covered", async () => {
    const entries = collectEntries(await packageSources());
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
        // ---- @respin/credits: the billing surface (unchanged by slice 1).
        // The 7 wired facade methods (app-server.ts)...
        "packages/credits/src/app-server.ts:createInvoiceRecoveryUrl",
        "packages/credits/src/app-server.ts:createPackCheckoutUrl",
        "packages/credits/src/app-server.ts:createPortalUrl",
        "packages/credits/src/app-server.ts:createTierCheckoutUrl",
        "packages/credits/src/app-server.ts:pauseSubscription",
        "packages/credits/src/app-server.ts:resumeSubscription",
        "packages/credits/src/app-server.ts:setAutoTopup",
        // ...the 7 exported actions (stripe/actions.ts)...
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

        // ---- Slice 1: the creator-profile entitlement decision, and its
        // facade method. `createProfile` is the SECOND asserter in the repo —
        // the arrival the old scan's known-limit note said to tighten the
        // forward rule for, which is why argument identity landed with it.
        "packages/credits/src/profiles.ts:createProfile",
        "packages/credits/src/app-server.ts:createProfile",

        // ---- Slice 2a: the metered model call, and its facade method.
        // `recordUsage` is a package-internal helper and is listed for the
        // same reason the three `stripe/actions.ts` helpers above are: a
        // helper is exactly where a future refactor would move a scope read
        // to. It takes `scope` as its OWN first parameter rather than nested
        // inside its options object, deliberately — the forward rule is
        // ARGUMENT IDENTITY, so `writeCapabilities(args.scope)` would not have
        // counted as covered and the coverage would have rested on a comment.
        // Its app-server facade method was DELETED at the slice-3 close
        // (2026-08-29): R-46 retired its only rendered caller, and it was the
        // one door to the model outside the `own_post` cage. The internal
        // function stays — it is the spend spine `inferVoice` composes.
        "packages/credits/src/inference.ts:runInference",
        "packages/credits/src/inference.ts:recordUsage",

        // ---- Slice 3: the composed voice inference, and its facade method.
        // Both take a `WorkspaceScope` and both are covered the same way
        // `runInference` is: the FIRST statement of `inferVoice` is
        // `mintProfileScope(db, workspaceScope, profileId)`, and the mint calls
        // `assertScoped` on the workspace scope before it will hand back a
        // profile grain. Listed here rather than left to the scan because the
        // point of this list is that a NEW scope-taking entry is a decision
        // somebody made, not a diff nobody read.
        "packages/credits/src/infer-voice.ts:inferVoice",
        "packages/credits/src/app-server.ts:inferVoice",

        // ---- @respin/db. NONE of these was visible before slice 1: the scan
        // walked `packages/credits/src` only and matched `WorkspaceScope`
        // only, so the entire M2b-1 profile-grained write surface — including
        // `writeCapabilities` itself — sat outside the completeness check that
        // exists to cover it. Widening the roots (task 24) is what surfaced
        // them; every one was already covered, which is the good outcome and
        // not a reason the widening was unnecessary.
        "packages/db/src/with-workspace.ts:mint",
        "packages/db/src/with-workspace.ts:writeCapabilities",
        "packages/db/src/with-workspace.ts:workspaceWriteCapabilities",
        // The three profile-grained helpers reached from inside a write
        // capability's closure. Covered by the ENCLOSURE and BACKWARD rules,
        // not by asserting themselves.
        "packages/db/src/with-workspace.ts:readOwnBrainDoc",
        "packages/db/src/with-workspace.ts:retainedReferenceSpans",
        "packages/db/src/with-workspace.ts:validateSourceEvidence",
        // Slice 1's intake pair, and their two bound facade methods.
        "packages/db/src/onboarding-ops.ts:appendOwnPost",
        "packages/db/src/onboarding-ops.ts:listOnboardingInputs",
        // Slice 4's sibling to `appendOwnPost`. Covered the same way: its
        // first scope-taking act is `ProfileScope.mint(db, scope, profileId)`,
        // which asserts the WORKSPACE scope before minting a profile grain.
        "packages/db/src/onboarding-ops.ts:appendReferencePost",
        "packages/db/src/app-server.ts:appendReferencePost",
        // Slice 2a. `ProfileScope` is a TYPE-ONLY export of @respin/db
        // (compile-red 8+9 above pins that), so `@respin/credits` — which owns
        // `runInference` and cannot move into @respin/db — had no way to obtain
        // one. This is a VERIFYING pass-through to `ProfileScope.mint`, not a
        // trust mint: it adds a function-shaped door where the class is
        // type-only, and skips no check.
        "packages/db/src/onboarding-ops.ts:mintProfileScope",
        "packages/db/src/app-server.ts:appendOwnPost",
        "packages/db/src/app-server.ts:listOnboardingInputs",

        // Slice 3: the brain trio and its three bound facade methods.
        //
        // All six are covered exactly the way slice 1's intake pair above is:
        // the FIRST statement of each `brain-ops.ts` function is
        // `ProfileScope.mint(db, scope, profileId)`, and the mint runs
        // `assertScoped` on the workspace scope before it will hand back a
        // profile grain. The `app-server.ts` three are thin binds forwarding
        // the SAME scope, which is what the argument-identity rule requires —
        // forwarding a different one would not count, and there is a test for
        // that direction.
        //
        // Pinned here rather than left to the scan for the reason this list
        // exists at all: a new scope-taking entry is a decision somebody made,
        // not a diff nobody read. Two of these three are the acts that decide
        // what the product BELIEVES about a person, so they are precisely the
        // entries that must not arrive silently.
        "packages/db/src/brain-ops.ts:readVoiceBrain",
        "packages/db/src/brain-ops.ts:confirmVoiceFields",
        "packages/db/src/brain-ops.ts:activateVoice",
        "packages/db/src/app-server.ts:readVoiceBrain",
        "packages/db/src/app-server.ts:confirmVoiceFields",
        "packages/db/src/app-server.ts:activateVoice",

        // Slice 3b (Stage B2): the same trio extended to `strategy` and
        // `killtest`, and ONE coherent activation entrypoint shared by all
        // three kinds (R8). Covered the SAME way as slice 3's brain trio
        // above — `readBrainKindDocs`/`confirmStrategyFields`/
        // `confirmKillTestFields`/`activateBrainCoherent` each open with
        // `ProfileScope.mint(db, scope, profileId)` as their first
        // scope-touching act, and the `app-server.ts` five are thin binds
        // forwarding the SAME scope. `readBrainKindDocs` IS its own entry
        // here (unlike `activateBrainDocCoherent` in `with-workspace.ts`,
        // which closes over an already-asserted `ProfileScope` and has no
        // scope PARAMETER of its own): it is a package-internal function with
        // its own `scope: WorkspaceScope` parameter, and
        // `readStrategyBrain`/`readKillTestBrain`/`readVoiceBrain` are thin
        // wrappers around it that forward their own `scope` argument.
        "packages/db/src/brain-ops.ts:readBrainKindDocs",
        "packages/db/src/brain-ops.ts:readStrategyBrain",
        "packages/db/src/brain-ops.ts:readKillTestBrain",
        "packages/db/src/brain-ops.ts:confirmStrategyFields",
        "packages/db/src/brain-ops.ts:confirmKillTestFields",
        "packages/db/src/brain-ops.ts:activateBrainCoherent",
        "packages/db/src/app-server.ts:readStrategyBrain",
        "packages/db/src/app-server.ts:readKillTestBrain",
        "packages/db/src/app-server.ts:confirmStrategyFields",
        "packages/db/src/app-server.ts:confirmKillTestFields",
        "packages/db/src/app-server.ts:activateBrainCoherent",

        // Slice 5: ordered history, creator edits, and creator-data export.
        // These were traced before pinning, rather than admitted because the
        // surface scan named them:
        //
        // - `readBrainHistory`, both materialized export helpers, and the
        //   streaming `openBrainExport` mint a ProfileScope before reaching
        //   any accessor. The streaming helpers accept that minted scope and
        //   page only through its accessors; they do not build parallel reads.
        // - `editBrainDocument` opens one transaction and mints against that
        //   transaction with THIS entry's `scope` before reading the base or
        //   obtaining write capabilities. `editDeclaredMetric` is a typed
        //   composer that forwards its SAME scope to `editBrainDocument`.
        // - the four `app-server.ts` entries are positional-scope thin binds
        //   forwarding their SAME argument to those producer operations.
        //
        // The argument-identity walk below proves each forward structurally;
        // changing any one to a different binding makes `uncovered` nonempty.
        "packages/db/src/brain-ops.ts:readBrainHistory",
        "packages/db/src/brain-ops.ts:editBrainDocument",
        "packages/db/src/brain-ops.ts:editDeclaredMetric",
        "packages/db/src/brain-ops.ts:withBrainEditSlot",
        "packages/db/src/export.ts:exportBrain",
        "packages/db/src/export.ts:exportBrainFile",
        "packages/db/src/export.ts:openBrainExport",
        "packages/db/src/export.ts:withPreparedExport",
        "packages/db/src/export.ts:acquireWorkspaceExportLock",
        "packages/db/src/export.ts:createPagedExportStream",
        "packages/db/src/export.ts:forEachExportPage",
        "packages/db/src/export.ts:inputsForDocs",
        "packages/db/src/export.ts:streamJsonExport",
        "packages/db/src/export.ts:streamMarkdownExport",
        "packages/db/src/with-workspace.ts:assertAuthoritativeBrainTarget",
        "packages/db/src/app-server.ts:readBrainHistory",
        "packages/db/src/app-server.ts:editBrainDocument",
        "packages/db/src/app-server.ts:editDeclaredMetric",
        "packages/db/src/app-server.ts:openBrainExport",

        // Slice 2b: the creator's credit burn (R7), and its bound facade
        // method. `monthlySpend` calls `assertScoped(scope)` as its OWN
        // FIRST statement — it is a standalone function, not a
        // `WorkspaceAccessors` closure entry, the same shape as
        // `mintProfileScope`/`appendOwnPost` above, and for the same reason:
        // it needs to assert the scope itself rather than join an accessor
        // map. `app-server.ts:monthlySpend` is a thin bind forwarding the
        // SAME scope, which the argument-identity rule requires.
        "packages/db/src/with-workspace.ts:monthlySpend",
        "packages/db/src/app-server.ts:monthlySpend",

        // Slice 3b: the interview trio. Covered the same way slice 1's intake
        // pair and slice 3's brain trio are — each function's FIRST
        // scope-touching act is `ProfileScope.mint(db, scope, profileId)`
        // (`saveInterviewDraft`/`getInterviewDraft` mint on the outer `db`;
        // `submitInterview` mints once on `db` to check the role before
        // opening a transaction, then AGAIN on `tx` inside it — both mints
        // forward this entry's own `scope` parameter).
        //
        // NOW SIX, NOT THREE: Stage B1 bound the trio on `app-server.ts` (the
        // "later stage's job" the note above named). The three binds are thin
        // forwards of the SAME `scope` argument, exactly the shape
        // `readVoiceBrain`/`confirmVoiceFields`/`activateVoice` and their own
        // `app-server.ts` binds already use one block up.
        "packages/db/src/interview-ops.ts:saveInterviewDraft",
        "packages/db/src/interview-ops.ts:getInterviewDraft",
        "packages/db/src/interview-ops.ts:submitInterview",
        "packages/db/src/app-server.ts:saveInterviewDraft",
        "packages/db/src/app-server.ts:getInterviewDraft",
        "packages/db/src/app-server.ts:submitInterview",
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
    const entries = collectEntries(await packageSources());
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

  // ---- The ARGUMENT-IDENTITY probes (task 46). Without these the tightening
  // is a claim about the scan rather than a property of it, which is the
  // "a comment claiming a property is not the property" failure applied to a
  // guard's own rule.

  it("ARGUMENT IDENTITY: forwarding a DIFFERENT scope does not count as covered", () => {
    // The exact hole the old rule's docblock recorded and deferred: the body
    // contains `assertScoped(` — transitively, through `gate` — but the value
    // asserted is not the one this entry was handed. Under the old text-match
    // rule `readSomething` was COVERED and its own `scope` reached the query
    // unchecked.
    const planted = new Map<string, string>([
      [
        "packages/credits/src/planted.ts",
        "function gate(s: WorkspaceScope) { assertScoped(s); }\n" +
          "export async function readSomething(db: DbLike, scope: WorkspaceScope) {\n" +
          "  const other = elsewhere();\n" +
          "  gate(other);\n" +
          "  return db.select().from(t).where(eq(t.workspaceId, scope.workspaceId));\n" +
          "}\n",
      ],
    ]);
    const entries = collectEntries(planted);
    const covered = coveredEntries(entries);
    const target = entries.find((e) => e.name === "readSomething")!;
    expect(target, "the planted entry was not even seen").toBeDefined();
    expect(
      covered.has(target.key),
      "an entry that asserts SOMEBODY ELSE'S scope is not covered for its own"
    ).toBe(false);
  });

  it("ARGUMENT IDENTITY, the direction that must NOT change: forwarding its OWN scope still counts", () => {
    // The same shape with one character changed. If this went red the rule
    // would be strict rather than correct, and the fix would be to loosen it.
    const planted = new Map<string, string>([
      [
        "packages/credits/src/planted.ts",
        "function gate(s: WorkspaceScope) { assertScoped(s); }\n" +
          "export async function readSomething(db: DbLike, scope: WorkspaceScope) {\n" +
          "  gate(scope);\n  return db;\n}\n",
      ],
    ]);
    const entries = collectEntries(planted);
    const covered = coveredEntries(entries);
    const target = entries.find((e) => e.name === "readSomething")!;
    expect(covered.has(target.key)).toBe(true);
  });

  it("ENCLOSURE: a closure inside a covered entry is covered; inside an UNCOVERED one it is not", () => {
    // This rule is what keeps `writeCapabilities`' returned closures — which
    // have no scope parameter at all — from being reported as uncovered. Both
    // directions are planted, because a rule that says yes to everything would
    // pass the first half alone.
    const planted = new Map<string, string>([
      [
        "packages/credits/src/planted.ts",
        "export function good(scope: ProfileScope) {\n" +
          "  assertScoped(scope);\n" +
          "  return { doIt: async (x: number) => helper(scope, x) };\n" +
          "}\n" +
          "export function bad(scope: ProfileScope) {\n" +
          "  return { doIt2: async (x: number) => helper(scope, x) };\n" +
          "}\n" +
          "function helper(scope: ProfileScope, x: number) { return x; }\n",
      ],
    ]);
    const entries = collectEntries(planted);
    const covered = coveredEntries(entries);
    const byName = (n: string) => entries.find((e) => e.name === n)!;
    expect(covered.has(byName("good").key), "good asserts directly").toBe(true);
    expect(
      covered.has(byName("doIt").key),
      "a closure returned by a covered entry is unreachable except through it"
    ).toBe(true);
    expect(
      covered.has(byName("bad").key),
      "bad asserts nothing and nothing calls it"
    ).toBe(false);
    expect(
      covered.has(byName("doIt2").key),
      "a closure inside an uncovered entry inherits nothing"
    ).toBe(false);
  });

  it("ENCLOSURE does NOT cover a nested closure that takes its OWN scope", () => {
    // The tenancy gate's finding, planted. Both fixtures in the test above take
    // `x: number`, so neither exercised this — the rule could inherit coverage
    // for an entry with its own unasserted scope and no test would notice.
    const planted = new Map<string, string>([
      [
        "packages/credits/src/planted.ts",
        "export function outer(scope: ProfileScope) {\n  assertScoped(scope);\n  return { transfer: async (otherScope: ProfileScope) => otherScope.profileId };\n}\n",
      ],
    ]);
    const entries = collectEntries(planted);
    const covered = coveredEntries(entries);
    const outer = entries.find((e) => e.name === "outer")!;
    const transfer = entries.find((e) => e.name === "transfer")!;
    expect(covered.has(outer.key), "outer asserts its own scope").toBe(true);
    expect(
      covered.has(transfer.key),
      "a nested entry with its OWN scope parameter must assert THAT scope — enclosure proves nothing about it"
    ).toBe(false);
    // ...and it is reported by the surface filter too, so the finding is
    // actionable rather than merely internal to the coverage set.
    expect(takesScope(transfer)).toBe(true);
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

describe("the cap's guard is the CALLER count, not the insert site", () => {
  // BOTH MONEY-PATH REVIEWERS LANDED ON THIS (2026-08-27), and they were right
  // that the instruments the ledger named do not cover it:
  //
  //   - `tests/table-writers.test.ts` constrains the INSERT SITE. It sees a
  //     second `.insert(creatorProfiles)`; it cannot see a second CALLER of the
  //     capability that already owns the insert.
  //   - the import-boundary fixtures constrain `app/**`. They say nothing about
  //     `packages/**`.
  //
  // `workspaceWriteCapabilities` is exported from `@respin/db`'s root and
  // carries no cap — the cap lives one package up, in
  // `packages/credits/src/profiles.ts`, because `@respin/db` cannot see config
  // or the resolved tier (R-30 constraint 2). So a second caller anywhere in
  // `packages/**` creates profiles past the per-tier cap and trips neither
  // instrument. The comment in `table-writers.test.ts` says "the cap is
  // enforced by its only caller"; this is what makes that a property.
  const callSite = /\bworkspaceWriteCapabilities\s*\(/g;

  it("workspaceWriteCapabilities has exactly ONE non-test CALL SITE in packages/**", async () => {
    // A CALL COUNT, NOT A FILE SET (billing gate round 2, 2026-08-27). The
    // first version pushed a file name and compared the file list, so TWO calls
    // in `profiles.ts` produced an identical array — and that file is the
    // natural home for `reactivateProfile`, which R-35 §2 says owes the same
    // cap check. The `::update` key in `table-writers.test.ts` covers a new
    // UPDATE in `with-workspace.ts`; nothing covered a second create call here.
    const files = await packageSources();
    const sites: string[] = [];
    for (const [file, src] of files) {
      const hits = [...src.matchAll(callSite)].length;
      // The definition itself is not a call site.
      const defines = /export function workspaceWriteCapabilities\s*\(/.test(src);
      for (let i = 0; i < hits - (defines ? 1 : 0); i++) sites.push(file);
    }
    expect(
      sites.sort(),
      "a second CALL of workspaceWriteCapabilities creates creator profiles WITHOUT the per-tier cap — the cap lives in packages/credits/src/profiles.ts and cannot move into packages/db (R-30 constraint 2)"
    ).toEqual(["packages/credits/src/profiles.ts"]);
  });

  it("NON-VACUITY: the scan sees a planted second caller", () => {
    const planted = "import { workspaceWriteCapabilities } from '@respin/db';\nexport const sneak = (s) => workspaceWriteCapabilities(s).createProfile;\n";
    // ONE, not two: the scan counts CALL SITES, and an import binding is not
    // a call. That is the behaviour we want — importing the name is harmless,
    // invoking it is what skips the cap — so the number is pinned.
    expect([...planted.matchAll(callSite)].length).toBe(1);
    // ...and it does not count the definition as a call.
    const definition = "export function workspaceWriteCapabilities(scope) { return {}; }\n";
    const hits = [...definition.matchAll(callSite)].length;
    const defines = /export function workspaceWriteCapabilities\s*\(/.test(definition);
    expect(hits - (defines ? 1 : 0)).toBe(0);
  });
});

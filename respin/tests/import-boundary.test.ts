import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { SCAN_ROOTS, blankComments } from "./support/app-surface";
import { PLANTED_PROBE_PATHS } from "./support/probe-artifacts";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const respinRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One shared engine: per-test ESLint construction contended with the parallel
// PGlite suites and flaked a timeout once (code-review finding 3).
const eslint = new ESLint({ cwd: respinRoot });

// `git grep`, ASYNC — never `execFileSync`. Measured 2026-08-27: run alone this
// file costs 4.5s, but inside the full parallel suite a worker executing it
// blocked for 23s straight. A synchronous child process stops the WHOLE worker
// thread, including the birpc message pump that answers vitest's
// `onTaskUpdate` — and that call's timeout is a hard-coded 60s inside birpc
// with no config or env knob in vitest 3.2.7
// (node_modules/vitest/dist/chunks/index.B521nVV-.js, DEFAULT_TIMEOUT = 6e4).
// A starved pump is the entry gate going RED on exit code with every test
// passing. Awaiting the child keeps the loop turning while git works.
//
// The catch DISCRIMINATES. `git grep` exits 1 for "no matches", which is the
// pass; ANY other failure — git missing, a bad pattern, output past maxBuffer —
// was previously swallowed into "no offenders", i.e. a scanner that fails OPEN
// and is indistinguishable from one that works (CLAUDE.md, 2026-08-21).
const execFileAsync = promisify(execFile);

/** Every .ts/.tsx under a directory, recursively. Local to the sync-child scan. */
function* walkTs(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) yield* walkTs(full);
    else if (/\.tsx?$/.test(e.name) && statSync(full).isFile()) yield full;
  }
}


async function gitGrep(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...args], {
      cwd: respinRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  } catch (e) {
    const err = e as { code?: number | string };
    if (err.code === 1) return ""; // no matches — the pass
    throw new Error(
      `git grep failed in a way that is NOT "no matches" (code ${String(err.code)}) ` +
        `— this scan would otherwise report CLEAN without having scanned: ${String(e)}`
    );
  }
}

/**
 * The dynamic-`import()` scan, in ONE place so the guard and its non-vacuity
 * probe cannot drift apart — they call this, not a re-spelled `git grep`.
 *
 * Matches BOTH ways of naming a package, because the cage is anchored to the
 * `@respin/…` form and a path spelling bypasses every rule in it:
 *   @respin/db · @/packages/db/src/client · ../../packages/db/src/client
 */
const DYNAMIC_PACKAGE_IMPORT =
  String.raw`import\s*\(\s*["'\`](@respin/|@/packages/|(\.\./)*packages/)`;
// SCAN_ROOTS is imported from ./support/app-surface — ONE definition, both
// readers (round-3 meta-finding). This file said ["app","lib","middleware.ts"]
// while action-gate.test.ts said ["app","lib"], so a swallowing catch in
// middleware.ts was scanned by neither suite.

/** The Stripe SDK, by the same mechanism (round-2 CHANGE 5). */
const DYNAMIC_STRIPE_IMPORT = String.raw`import\s*\(\s*["'\`]stripe(/|["'\`])`;

async function scanFor(
  pattern: string,
  roots: readonly string[] = SCAN_ROOTS,
  /**
   * PROBE PATHS `.gitignore` HIDES FROM THIS SCAN, named by the test that just
   * planted one (tests/support/probe-artifacts.ts).
   *
   * `git grep --untracked` searches untracked files but NOT ignored ones —
   * measured against the installed git 2.52, not assumed — and every probe
   * artifact is now gitignored so that an interrupted run cannot leave a
   * planted violation `git add -A` would commit. That is worth having twice
   * over: it also makes a probe left behind by a CONCURRENT test file
   * invisible to this scan, which is where P6b's unreproducible offender came
   * from. The cost is exactly this parameter — a non-vacuity probe must name
   * its own file to be seen, or it would keep passing while proving nothing.
   *
   * A SECOND, PATH-SCOPED `git grep` rather than `--no-exclude-standard` on the
   * first: measured 2026-09-01, adding that flag to the `packages` root walks
   * each package's own `node_modules`, which took 87 SECONDS and reported four
   * `node_modules/@respin/db/src/with-workspace.ts` copies as offenders.
   */
  includeIgnored: readonly string[] = []
): Promise<string[]> {
  const out = await gitGrep([
    "grep",
    "--untracked",
    "-n",
    "-E",
    pattern,
    "--",
    ...roots,
  ]);
  const hidden = includeIgnored.length
    ? await gitGrep([
        "grep",
        "--untracked",
        "--no-exclude-standard",
        "-n",
        "-E",
        pattern,
        "--",
        ...includeIgnored,
      ])
    : "";
  const lines = (s: string) => s.split("\n").filter(Boolean);
  return [...lines(out), ...lines(hidden)];
}

// The scanners in this file all funnel through `gitGrep`, and its catch is the
// difference between "scanned, found nothing" and "never scanned". That
// distinction has to be PROVEN, not asserted in a comment: a scanner that
// fails open reports CLEAN and is indistinguishable from one that works
// (CLAUDE.md, 2026-08-21).
describe("the scan's own failure mode is discriminated, not swallowed", () => {
  it("NO test in this repo blocks its worker with a SYNCHRONOUS child process", () => {
    // The regression guard for the entry gate's exit-code flake. A worker
    // thread that spends 23s inside `execFileSync` cannot pump the message
    // answering its own in-flight `onTaskUpdate`, whose birpc timeout is a
    // hard-coded 60s with no knob (see vitest.config.ts). Measured, not
    // argued: with these two call sites synchronous the worst worker block was
    // 23-31s; awaited, it is ~10s.
    //
    // A SCAN, so it covers the tests nobody has written yet. Built from a
    // RegExp literal, never assembled from a string: one lost backslash turns
    // the pattern into something that matches nothing and reports clean
    // (CLAUDE.md, 2026-08-21).
    const SYNC_CHILD = /\b(execFileSync|execSync|spawnSync)\b/;
    const roots = [resolve(respinRoot, "tests")];
    for (const pkg of readdirSync(resolve(respinRoot, "packages"), {
      withFileTypes: true,
    })) {
      if (!pkg.isDirectory()) continue;
      const t = resolve(respinRoot, "packages", pkg.name, "tests");
      if (existsSync(t)) roots.push(t);
    }
    // NON-VACUITY on the WALK: it must actually be reading files, or an empty
    // offender list means "found nothing" rather than "scanned nothing".
    // THIS FILE IS SKIPPED, and the exclusion is not a hole — it holds the
    // scan's own specimen strings ("const out = execFileSync(...)"), which
    // `blankComments` does not blank because they are string literals, not
    // comments. A scanner cannot scan its own fixtures. The file is covered
    // instead by the stricter import-level assertion below, which is where a
    // synchronous child process has to come from in the first place.
    const SELF = resolve(respinRoot, "tests", "import-boundary.test.ts");
    const files = roots
      .flatMap((r) => [...walkTs(r)])
      .filter((f) => resolve(f) !== SELF);
    expect(files.length, "the walk found no test files at all").toBeGreaterThan(20);

    const offenders = files.filter((f) =>
      SYNC_CHILD.test(blankComments(readFileSync(f, "utf8")))
    );
    expect(
      offenders.map((f) => f.replace(respinRoot, "")),
      "use the awaited child_process API — a synchronous one stops the whole worker thread and starves vitest's reporter RPC"
    ).toEqual([]);
  });

  it("...and THIS file, which the scan skips, imports only the ASYNC child_process API", () => {
    // The one file excluded above, checked where it counts: the import. A
    // synchronous child process cannot be called without being imported, and
    // no `*Sync` name may appear on that import line.
    const src = readFileSync(resolve(respinRoot, "tests", "import-boundary.test.ts"), "utf8");
    const imports = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"node:child_process"/g)];
    expect(imports.length, "this file must import node:child_process exactly once").toBe(1);
    const names = imports[0][1].split(",").map((n) => n.trim()).filter(Boolean);
    expect(names).toEqual(["execFile"]);
  });

  it("NON-VACUITY: the sync-child scan catches a PLANTED call", () => {
    const SYNC_CHILD = /\b(execFileSync|execSync|spawnSync)\b/;
    expect(SYNC_CHILD.test('const out = execFileSync("git", []);')).toBe(true);
    expect(SYNC_CHILD.test('const out = execSync("git");')).toBe(true);
    expect(SYNC_CHILD.test('const out = spawnSync("git");')).toBe(true);
    // ...and does NOT fire on the async API this repo now uses.
    expect(SYNC_CHILD.test('const { stdout } = await execFileAsync("git", []);')).toBe(
      false
    );
  });


  it("a git failure that is NOT 'no matches' THROWS — it never reports a clean scan", async () => {
    // An unmatched paren is a bad ERE; git exits 128, not 1. Verified against
    // the installed git: `git grep -E '((('` -> fatal, exit 128.
    await expect(scanFor(String.raw`(((`)).rejects.toThrow(
      /NOT "no matches"/
    );
  });

  it("NON-VACUITY: a well-formed pattern with zero matches still returns [] (exit 1 is the pass)", async () => {
    await expect(
      scanFor(String.raw`zzz_no_such_token_in_this_repo_zzz`)
    ).resolves.toEqual([]);
  });
});

// The `includeIgnored` argument is threaded through rather than re-spelled at
// the probe: round 3 of the tenancy gate re-spelled the git invocation in the
// probe instead of sharing it and the two arg lists had already drifted, so the
// probe proved the command worked rather than that the guard fires.
async function scanForDynamicPackageImports(
  includeIgnored: readonly string[] = []
): Promise<string[]> {
  return scanFor(DYNAMIC_PACKAGE_IMPORT, SCAN_ROOTS, includeIgnored);
}

async function scanForDynamicStripeImports(
  includeIgnored: readonly string[] = []
): Promise<string[]> {
  return scanFor(DYNAMIC_STRIPE_IMPORT, SCAN_ROOTS, includeIgnored);
}

// AC-3 (phase 1): the import-direction rule is alive, not a comment.
// A file under packages/ importing from app/ must fail lint.
describe("import-direction boundary (tech-spec §1)", () => {
  it("rejects an app/ import from inside packages/", async () => {
    const results = await eslint.lintText(
      `import Layout from "../../app/layout";\nexport const x = Layout;\n`,
      { filePath: resolve(respinRoot, "packages/fixture/src/bad.ts") }
    );
    const messages = results.flatMap((r) => r.messages);
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  it("allows the same import shape inside app/ (rule is scoped, not global)", async () => {
    const results = await eslint.lintText(
      `import Layout from "./app/layout";\nexport const x = Layout;\n`,
      { filePath: resolve(respinRoot, "app/ok.ts") }
    );
    const messages = results.flatMap((r) => r.messages);
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      false
    );
  });
});

// AC-5 (phase 3): the sanctioned-surface guard is default-deny and alive.
describe("sanctioned @respin/db surface from app/** (tenancy T1)", () => {
  const lintInApp = async (code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, "app/fixture/route.ts"),
    });
    return results.flatMap((r) => r.messages);
  };

  it("rejects importing `schema` from app/**", async () => {
    const messages = await lintInApp(
      `import { schema } from "@respin/db";\nexport const x = schema;\n`
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  // Names what it proves: this rule denies the STATIC named import. The
  // dynamic and path spellings are separate mechanisms with their own tests
  // below — "the connection is unreachable" is the conclusion of all three
  // together, never of this one assertion (tenancy round 4 CHANGE).
  it("rejects the static named import of `createDb` from app/**", async () => {
    const messages = await lintInApp(
      `import { createDb } from "@respin/db";\nexport const x = createDb;\n`
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  it("rejects a deep import into @respin/db from app/**", async () => {
    const messages = await lintInApp(
      `import { users } from "@respin/db/src/schema";\nexport const x = users;\n`
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  it("DEFAULT-DENY: an export not on the allowlist is rejected even if it exists", async () => {
    const messages = await lintInApp(
      `import { seedDb } from "@respin/db";\nexport const x = seedDb;\n`
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  it("allows the sanctioned surface (respinDb + types)", async () => {
    const messages = await lintInApp(
      `import { respinDb, WorkspaceAccessError, type WorkspaceScope } from "@respin/db";\n` +
        `export const x = { respinDb, WorkspaceAccessError };\nexport type Y = WorkspaceScope;\n`
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      false
    );
  });

  // SLICE 5 STAGE 2 (G0). The shared display vocabulary `/brain` and
  // `/onboarding/interview` re-export rather than redeclare. Asserted BOTH
  // ways in one test on purpose: the widening is only safe because the brain
  // WRITE surface stayed off the list, and an ALLOW fixture with no matching
  // DENY fixture is how "we widened the allowlist" quietly becomes "we opened
  // the cage". `tests/shared-copy-identity.test.ts` is the other half — it
  // proves the app files consume these by re-export, not by a second literal.
  it("allows the SHARED COPY vocabulary and still denies the brain write surface", async () => {
    const shared = [
      "PLACEHOLDER_ABSENCE",
      "INTERVIEW_PLACEHOLDER_ABSENCE",
      "VOICE_FIELD_LABELS",
      "STRATEGY_FIELD_LABELS",
      "STRATEGY_METRIC_FIELD_LABELS",
      "KILLTEST_FIELD_LABELS",
      "METRIC_DIRECTION_LABELS",
      "claimLabel",
      "strategyClaimLabel",
      "killtestClaimLabel",
      "isMetricPointer",
      "quoteIntro",
    ];
    const allowed = await lintInApp(
      `import { ${shared.join(", ")} } from "@respin/db";\n` +
        `export const x = [${shared.join(", ")}];\n`
    );
    expect(
      allowed
        .filter((m) => m.ruleId === "no-restricted-imports")
        .map((m) => m.message)
    ).toEqual([]);
    // The neighbours in the SAME module (`packages/db/src/export.ts`) that are
    // not display copy stay denied — `openBrainExport` reaches app/** through
    // `respinDb`, and `exportPlan` is the registry decision itself.
    for (const name of ["openBrainExport", "exportPlan", "exportAbsenceSentence"]) {
      const messages = await lintInApp(
        `import { ${name} } from "@respin/db";\nexport const x = ${name};\n`
      );
      expect(
        messages.some((m) => m.ruleId === "no-restricted-imports"),
        `${name} must stay off the app allowlist`
      ).toBe(true);
    }
  });

  it("rejects importing `createAuth`/`getAuth` (the raw instance) from app/** (AC-5)", async () => {
    for (const name of ["createAuth", "getAuth"]) {
      const messages = await lintInApp(
        `import { ${name} } from "@respin/auth";\nexport const x = ${name};\n`
      );
      expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
        true
      );
    }
  });

  it("allows the sanctioned @respin/auth surface and the /client deep import (AC-5)", async () => {
    const messages = await lintInApp(
      `import { requireUser, requireAdmin, authHandlers } from "@respin/auth";\n` +
        `import { authClient } from "@respin/auth/client";\n` +
        `export const x = { requireUser, requireAdmin, authHandlers, authClient };\n`
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      false
    );
  });

  it("rejects any OTHER deep import into @respin/auth (AC-5)", async () => {
    const messages = await lintInApp(
      `import { createAuth } from "@respin/auth/src/create-auth";\nexport const x = createAuth;\n`
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });
});

// AC-8 (M1 phase 2): the trustWorkspaceId cage is an ALLOWLIST of named files.
describe("trustWorkspaceId allowlist cage (tenancy T1, M1 phase 2 AC-8)", () => {
  const CODE = `import { trustWorkspaceId } from "@respin/db";\nexport const x = trustWorkspaceId;\n`;
  const lintAt = async (relPath: string) => {
    const results = await eslint.lintText(CODE, {
      filePath: resolve(respinRoot, relPath),
    });
    return results.flatMap((r) => r.messages);
  };

  it("allows the sanctioned webhook-resolution files", async () => {
    for (const p of [
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
    ]) {
      const messages = await lintAt(p);
      expect(
        messages.some((m) => m.ruleId === "no-restricted-imports"),
        p
      ).toBe(false);
    }
  });

  it("allows package test files", async () => {
    const messages = await lintAt("packages/credits/tests/anything.test.ts");
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      false
    );
  });

  it("DENIES app/** (the allowlist doesn't carry it)", async () => {
    const messages = await lintAt("app/fixture/action.ts");
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
      true
    );
  });

  it("DENIES a non-allowlisted packages/** file (the cage is the allowlist, not an app deny-list)", async () => {
    for (const p of [
      "packages/credits/src/ledger.ts",
      "packages/config/src/index.ts",
      "packages/credits/src/stripe/actions.ts",
    ]) {
      const messages = await lintAt(p);
      expect(
        messages.some((m) => m.ruleId === "no-restricted-imports"),
        p
      ).toBe(true);
    }
  });

  it("no live import site exists outside the allowlist (grep assertion; Phase 3 tightens to exact-match)", async () => {
    // --untracked: respin/ may be uncommitted; without it the assertion is
    // vacuous on untracked trees (tenancy round-1 CHANGE).
    const out = await gitGrep([
      "grep",
      "--untracked",
      "-l",
      "trustWorkspaceId",
      "--",
      "app",
      "packages",
      "lib",
    ]);
    const files = out.split("\n").filter(Boolean);
    const allowed = new Set([
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
      "packages/db/src/with-workspace.ts", // the definition itself
      "packages/db/src/index.ts", // the re-export
    ]);
    const offenders = files.filter(
      (f) =>
        !allowed.has(f.replace(/\\/g, "/")) &&
        // Package test files only — the old `/tests/` filter would also have
        // excused a hypothetical app/tests/** importer (code-review NOTE).
        !/^packages\/[^/]+\/tests\//.test(f.replace(/\\/g, "/"))
    );
    expect(offenders).toEqual([]);
  });
});

// M1 phase 3 task 8b: the app-facing facades and the admin-only config write.
describe("package facades from app/** (tenancy T1, M1 phase 3)", () => {
  const lintAt = async (code: string, relPath: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, relPath),
    });
    return results.flatMap((r) => r.messages);
  };

  it("allows @respin/credits/app-server and @respin/config/app-server from app/**", async () => {
    const messages = await lintAt(
      `import { respinCredits } from "@respin/credits/app-server";\n` +
        `import { getActiveConfigServer } from "@respin/config/app-server";\n` +
        `export const x = { respinCredits, getActiveConfigServer };\n`,
      "app/fixture/action.ts"
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(false);
  });

  it("DENIES the raw @respin/credits and @respin/config roots from app/**", async () => {
    for (const spec of ["@respin/credits", "@respin/config"]) {
      const messages = await lintAt(
        `import * as pkg from "${spec}";\nexport const x = pkg;\n`,
        "app/fixture/action.ts"
      );
      expect(
        messages.some((m) => m.ruleId === "no-restricted-imports"),
        spec
      ).toBe(true);
    }
  });

  it("DENIES @respin/config/admin-server outside app/(admin)/**", async () => {
    const code = `import { appendConfigVersionServer } from "@respin/config/admin-server";\nexport const x = appendConfigVersionServer;\n`;
    const productMessages = await lintAt(code, "app/(product)/settings/x.ts");
    expect(
      productMessages.some((m) => m.ruleId === "no-restricted-imports")
    ).toBe(true);
    const adminMessages = await lintAt(code, "app/(admin)/admin/config/x.ts");
    expect(
      adminMessages.some((m) => m.ruleId === "no-restricted-imports")
    ).toBe(false);
  });

  it("DENIES @respin/credits/webhook-server outside app/api/stripe/** (code-review CHANGE)", async () => {
    const code =
      `import { respinStripeWebhook } from "@respin/credits/webhook-server";\n` +
      `export const x = respinStripeWebhook;\n`;
    // A server action must NOT be able to dispatch a hand-built Stripe event
    // past the signature layer.
    for (const p of [
      "app/(product)/settings/billing/actions.ts",
      "app/(admin)/admin/config/x.ts",
      "app/api/other/route.ts",
      // SIBLING Stripe routes are denied too (code-review CHANGE): these are
      // where a checkout/portal route will live, and they verify no
      // signature — the grant is the webhook route, not the stripe folder.
      "app/api/stripe/checkout/route.ts",
      "app/api/stripe/portal/route.ts",
      // ...and a HELPER beside the webhook route itself (round-3 NOTE). The
      // grant used to be the `app/api/stripe/webhook/**` SUBTREE, so this file
      // inherited dispatch rights it does not earn — it verifies no signature,
      // and `export * from "stripe"` here would have re-exported the SDK to any
      // sibling importing it. The grant is now exactly `route.ts`.
      "app/api/stripe/webhook/helper.ts",
      "app/api/stripe/webhook/lib/dispatch.ts",
    ]) {
      const messages = await lintAt(code, p);
      expect(
        messages.some((m) => m.ruleId === "no-restricted-imports"),
        p
      ).toBe(true);
    }
    // ...and IS importable from the one route that verifies the signature.
    const allowed = await lintAt(code, "app/api/stripe/webhook/route.ts");
    expect(allowed.some((m) => m.ruleId === "no-restricted-imports")).toBe(false);
  });

  // THE SPECIFIER-SHAPE HOLE (tenancy round 4 CHANGE). Every rule above names
  // a `@respin/…` package, so all of them were bypassable by spelling the same
  // module as a path — `@/*` maps to `./*` in tsconfig, so both forms resolve.
  // Each fixture below reached something the cage exists to deny, from a file
  // the cage was supposed to cover, with zero lint errors.
  it.each([
    ["the raw connection", `import { createDb } from "@/packages/db/src/client";`],
    [
      "the non-session workspace-id mint",
      `import { trustWorkspaceId } from "../../packages/db/src/with-workspace";`,
    ],
    ["a raw table", `import { creditLedger } from "@/packages/db/src/billing-schema";`],
    [
      "the Stripe dispatcher",
      `import { handleStripeEvent } from "../../packages/credits/src/stripe/webhooks";`,
    ],
    [
      "the admin config write",
      `import { appendConfigVersion } from "../../packages/config/src/index";`,
    ],
  ])("denies %s spelled as a PATH into packages/, from every app-side location", async (_what, stmt) => {
    const code = `${stmt}\nexport const x = 1;\n`;
    for (const p of [
      "app/(product)/studio/page.tsx",
      "app/(admin)/admin/page.tsx",
      "app/api/other/route.ts",
      "app/api/stripe/webhook/route.ts",
      "lib/routes.ts",
    ]) {
      const messages = await lintAt(code, p);
      expect(
        messages.some((m) => m.ruleId === "no-restricted-imports"),
        `${p} :: ${stmt}`
      ).toBe(true);
    }
  });

  it("...and the package-name form of the SAME modules stays importable where it is sanctioned (the deny is shape-blind, not a blanket ban)", async () => {
    const messages = await lintAt(
      `import { respinDb } from "@respin/db";\nexport const x = respinDb;\n`,
      "app/(product)/studio/page.tsx"
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(false);
  });

  it("the webhook override keeps the base denies (raw roots + db still unimportable in app/api/stripe)", async () => {
    for (const code of [
      `import { createDb } from "@respin/db";\nexport const x = createDb;\n`,
      `import * as pkg from "@respin/credits";\nexport const x = pkg;\n`,
      `import { trustWorkspaceId } from "@respin/db";\nexport const x = trustWorkspaceId;\n`,
      `import { appendConfigVersionServer } from "@respin/config/admin-server";\nexport const x = appendConfigVersionServer;\n`,
    ]) {
      const messages = await lintAt(code, "app/api/stripe/webhook/route.ts");
      expect(
        messages.some((m) => m.ruleId === "no-restricted-imports"),
        code
      ).toBe(true);
    }
  });

  // ESLint's no-restricted-imports registers ImportDeclaration /
  // ExportNamedDeclaration / ExportAllDeclaration only — it has NO
  // ImportExpression handler, so `await import("@respin/db")` is invisible to
  // every rule above and would hand app/** the raw connection and
  // trustWorkspaceId in one line (code-review CHANGE). Static analysis of the
  // rule cannot fix that; a source scan can, in the same shape as the
  // trustWorkspaceId grep assertion.
  it("NO dynamic import() of a package exists in app/, lib/ or middleware — by package NAME or by PATH (the hole no-restricted-imports cannot see)", async () => {
    expect(
      await scanForDynamicPackageImports(),
      "a dynamic import bypasses the whole no-restricted-imports cage — use a static import so the lint can see it"
    ).toEqual([]);
  });

  // Every planted shape must be caught by the SAME function the guard above
  // calls — round 3's probe re-spelled the git invocation instead of sharing
  // it, and the two arg lists had already drifted (the guard scanned
  // app+lib+middleware.ts, the probe scanned app), so it proved the command
  // worked, not that the guard fires (tenancy round 4 NOTE).
  it.each([
    ["package name", `(await import("@respin/db")).createDb`],
    ["@/-aliased path", `(await import("@/packages/db/src/client")).createDb`],
    [
      "relative path",
      `(await import("../../packages/db/src/with-workspace")).trustWorkspaceId`,
    ],
  ])(
    "the dynamic-import scan is NOT vacuous: it finds a planted violation spelled as a %s",
    async (_shape, expr) => {
      const { writeFileSync, rmSync, mkdirSync } = await import("node:fs");
      // EVERY WRITE INSIDE THE `try`. The `mkdirSync`/`writeFileSync` pair used
      // to sit outside it, so an interruption between the write and the `try`
      // never reached the `finally` — which is not hypothetical: slice 6 found
      // this probe on disk after an interrupted run, untracked and (then) not
      // gitignored, one `git add -A` from committing a planted tenancy
      // violation into `app/`.
      const probe = resolve(respinRoot, PLANTED_PROBE_PATHS.dynamicImport);
      try {
        mkdirSync(dirname(probe), { recursive: true });
        writeFileSync(probe, `export const x = async () => ${expr};\n`);
        const hits = await scanForDynamicPackageImports([
          PLANTED_PROBE_PATHS.dynamicImport,
        ]);
        expect(hits.join("\n")).toContain("__scan_probe__");
      } finally {
        rmSync(dirname(probe), { recursive: true, force: true });
      }
    }
  );

  // THE SDK ITSELF (round-2 CHANGE 5). Every rule above denies a DOMAIN route
  // to Stripe and left `stripe` — a direct dependency of the app package —
  // importable from anywhere in app/**. A probe importing seven denied things
  // from app/(product)/usage produced six errors; `import Stripe from "stripe"`
  // produced none. That bypasses the adapter's pinned API version and
  // `isStripeConfigured()`'s keyless refusal, reads STRIPE_SECRET_KEY at the
  // page layer, and is invisible to the AC-9 "only getStripe constructs a
  // client" scan, which walks packages/credits/src only.
  describe("the Stripe SDK is denied in app/** except the webhook signature check", () => {
    const SHAPES = [
      `import Stripe from "stripe";\nexport const x = Stripe;\n`,
      `import type Stripe from "stripe";\nexport type X = Stripe.Event;\n`,
      `import { Stripe } from "stripe";\nexport const x = Stripe;\n`,
      `import Stripe from "stripe/esm/stripe.core.js";\nexport const x = Stripe;\n`,
    ];

    it.each([
      "app/(product)/usage/page.tsx",
      "app/(product)/settings/billing/actions.ts",
      "app/(product)/settings/billing/page.tsx",
      "app/(admin)/admin/config/actions.ts",
      "app/api/other/route.ts",
      // The SIBLING Stripe routes, exactly like the webhook-server grant: a
      // checkout/portal route verifies no signature and gets no SDK.
      "app/api/stripe/checkout/route.ts",
      // ...and a helper INSIDE the webhook directory: the grant is the one
      // file that does the signature check, not the folder (round-3 NOTE).
      "app/api/stripe/webhook/helper.ts",
      "lib/routes.ts",
    ])("DENIES every import shape of `stripe` from %s", async (path) => {
      for (const code of SHAPES) {
        const messages = await lintAt(code, path);
        expect(
          messages.some((m) => m.ruleId === "no-restricted-imports"),
          `${path} :: ${code.split("\n")[0]}`
        ).toBe(true);
      }
    });

    it("ALLOWS the package root in the webhook route ONLY — the static constructEvent check needs no key", async () => {
      const messages = await lintAt(
        `import Stripe from "stripe";\nexport const x = Stripe.webhooks;\n`,
        "app/api/stripe/webhook/route.ts"
      );
      expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
        false
      );
    });

    it("...but not its INTERNALS, even there (the grant is the documented surface)", async () => {
      const messages = await lintAt(
        `import Stripe from "stripe/esm/stripe.core.js";\nexport const x = Stripe;\n`,
        "app/api/stripe/webhook/route.ts"
      );
      expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(
        true
      );
    });

    it("NO app-side file constructs a Stripe client (source scan — the AC-9 rule, where AC-9 cannot see)", async () => {
      const { readdirSync, readFileSync } = await import("node:fs");
      const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const full = resolve(dir, e.name);
          return e.isDirectory()
            ? walk(full)
            : /\.tsx?$/.test(e.name)
              ? [full]
              : [];
        });
      const files = ["app", "lib"].flatMap((r) => walk(resolve(respinRoot, r)));
      // Non-vacuity: it is reading a real, non-trivial tree.
      expect(files.length).toBeGreaterThan(10);
      const offenders = files.filter((f) =>
        /new\s+Stripe\s*\(/.test(readFileSync(f, "utf8"))
      );
      expect(
        offenders.map((f) => f.replace(/\\/g, "/").split("/respin/")[1] ?? f),
        "app/** never constructs a Stripe client — getStripe() in packages/credits owns the lazy adapter, the pinned API version and the keyless refusal"
      ).toEqual([]);
      // ...and the scan's regex is the one that finds a construction.
      expect(
        /new\s+Stripe\s*\(/.test('const s = new Stripe(process.env.KEY!);')
      ).toBe(true);
    });

    it("a DYNAMIC import of the SDK is caught too (no-restricted-imports has no ImportExpression handler)", async () => {
      const { writeFileSync, rmSync, mkdirSync } = await import("node:fs");
      // Writes INSIDE the try, and the probe named from the shared list — the
      // same two corrections as the dynamic-package probe above.
      const probe = resolve(respinRoot, PLANTED_PROBE_PATHS.dynamicStripe);
      try {
        mkdirSync(dirname(probe), { recursive: true });
        writeFileSync(
          probe,
          `export const x = async () => (await import("stripe")).default;\n`
        );
        expect(
          await scanForDynamicStripeImports([PLANTED_PROBE_PATHS.dynamicStripe])
        ).not.toEqual([]);
      } finally {
        rmSync(dirname(probe), { recursive: true, force: true });
      }
      // ...and with the probe gone, the live tree is clean.
      expect(await scanForDynamicStripeImports()).toEqual([]);
    });
  });

  // THE THIRD MECHANISM (round-3 NOTE). `packages/db/src/with-workspace.ts`
  // named two mechanisms — the static lint and the dynamic-import source scan —
  // and NEITHER sees `require("@respin/db")`. It IS denied, by
  // `@typescript-eslint/no-require-imports` from the recommended config, which
  // was incidental, unnamed by that comment and asserted by no fixture. The
  // comment now names it; this is the fixture, so the claim is worth something.
  it("a CommonJS require() of a package is denied in app/** and lib/** (no-require-imports — the third mechanism)", async () => {
    const shapes = [
      'const { createDb } = require("@respin/db");\nexport const x = createDb;\n',
      'const { trustWorkspaceId } = require("@respin/db");\nexport const x = trustWorkspaceId;\n',
      'const { createDb } = require("@/packages/db/src/client");\nexport const x = createDb;\n',
      'const Stripe = require("stripe");\nexport const x = Stripe;\n',
    ];
    for (const p of [
      "app/(product)/usage/page.tsx",
      "app/(product)/settings/billing/actions.ts",
      "app/api/stripe/webhook/route.ts",
      "lib/routes.ts",
    ]) {
      for (const code of shapes) {
        const messages = await lintAt(code, p);
        expect(
          messages.some((m) => m.ruleId === "@typescript-eslint/no-require-imports"),
          `${p} :: ${code.split("\n")[0]}`
        ).toBe(true);
      }
    }
  });

  it("the admin override keeps the base denies (raw roots still unimportable in app/(admin))", async () => {
    const messages = await lintAt(
      `import { createDb } from "@respin/db";\nexport const x = createDb;\n`,
      "app/(admin)/admin/config/x.ts"
    );
    expect(messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
  });
});

// ===========================================================================
// M2a — the profile tenancy cage (`docs/plans/respin-m2a-cage-plan.md`)
// ===========================================================================

/**
 * P6 scans PRODUCT SOURCE, which for the profile brand means packages/** as
 * well as app/**: the risk is a convenience mint appearing inside a package,
 * where the app allowlist cannot see it.
 */
const P6_ROOTS = [...SCAN_ROOTS, "packages"] as const;

describe("AC-15 (eslint half): the M2a write surface is denied to app/**", () => {
  const lintInApp = async (code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, "app/fixture/route.ts"),
    });
    return results.flatMap((r) => r.messages);
  };
  const denied = async (code: string) =>
    (await lintInApp(code)).some((m) => m.ruleId === "no-restricted-imports");

  // The default-deny does this work — the names are simply absent from the
  // allowlist. Asserted per name anyway, because "it is not on a list" is a
  // property of a file nobody re-reads, and these three are the whole cage.
  it("DENIES writeCapabilities, assertScoped and VerifiedProfileId", async () => {
    expect(
      await denied(
        'import { writeCapabilities } from "@respin/db";\nexport const x = writeCapabilities;\n'
      ),
      "writeCapabilities in app/** would let a route write a brain doc directly"
    ).toBe(true);
    expect(
      await denied(
        'import { assertScoped } from "@respin/db";\nexport const x = assertScoped;\n'
      )
    ).toBe(true);
    expect(
      await denied(
        'import type { VerifiedProfileId } from "@respin/db";\nexport type X = VerifiedProfileId;\n'
      ),
      "the brand must not be nameable in app/** — a cast to it compiles at exit 0"
    ).toBe(true);
  });

  it("DENIES the M2a table objects (a raw insert needs the table)", async () => {
    for (const name of [
      "brainDocs",
      "creatorProfiles",
      "onboardingInputs",
      "modelUsage",
      "frameworks",
      "workspaceSpendMonthly",
    ]) {
      expect(
        await denied(
          'import { ' + name + ' } from "@respin/db";\nexport const x = ' + name + ';\n'
        ),
        name
      ).toBe(true);
    }
  });

  it("ALLOWS the scope TYPE and the typed refusals (the sanctioned M2a surface)", async () => {
    expect(
      await denied(
        'import { WorkspacePausedError, ProfileAccessError, ProvenanceError, ScopeForgeryError, type ProfileScope } from "@respin/db";\n' +
          'export const x = { WorkspacePausedError, ProfileAccessError, ProvenanceError, ScopeForgeryError };\nexport type Y = ProfileScope;\n'
      )
    ).toBe(false);
  });
});

// ---- Slice 1 additions to the same cage (R5, R6).

describe("slice 1: the new write surface is denied to app/**", () => {
  const lintInApp = async (code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, "app/fixture/route.ts"),
    });
    return results
      .flatMap((r) => r.messages)
      .some((m) => m.ruleId === "no-restricted-imports");
  };

  it("DENIES workspaceWriteCapabilities and the raw intake operations", async () => {
    // `workspaceWriteCapabilities` is the workspace-grained twin of
    // `writeCapabilities`, and it is the one that INSERTS a creator profile
    // without consulting the cap — the cap lives one layer up, in
    // @respin/credits. Reachable from app/**, it would BE the cap's bypass.
    expect(
      await lintInApp(
        'import { workspaceWriteCapabilities } from "@respin/db";\nexport const x = workspaceWriteCapabilities;\n'
      ),
      "workspaceWriteCapabilities in app/** would create profiles past the per-tier cap"
    ).toBe(true);
    // The module-level operations, as opposed to the `respinDb`-bound methods:
    // app/** gets the facade, not the functions, because the functions take a
    // `db` handle and the facade is what supplies the pooled one.
    for (const name of ["appendOwnPost", "listOnboardingInputs"]) {
      expect(
        await lintInApp(
          "import { " + name + ' } from "@respin/db";\nexport const x = ' + name + ";\n"
        ),
        name
      ).toBe(true);
    }
  });

  it("ALLOWS the slice-1 refusals and row types, and STILL denies the tables", async () => {
    expect(
      await lintInApp(
        'import { ProfileCapError, ProfileNameError, ProfileRoleError, PostContentError, type CreatorProfile, type OnboardingInput } from "@respin/db";\n' +
          "export const x = { ProfileCapError, ProfileNameError, ProfileRoleError, PostContentError };\n" +
          "export type Y = [CreatorProfile, OnboardingInput];\n"
      ),
      "app/** must be able to instanceof these, or a typed refusal renders as 'Something went wrong'"
    ).toBe(false);
    // The row TYPE is allowed; the TABLE of the same subject is not. If this
    // ever flips, a page can build its own query.
    expect(
      await lintInApp(
        'import { creatorProfiles } from "@respin/db";\nexport const x = creatorProfiles;\n'
      )
    ).toBe(true);
  });
});

// ---- Slice 3b, Stage B1 additions to the same cage.

describe("slice 3b: the interview surface's SHAPES are allowed, its WRITES stay denied", () => {
  const lintInApp = async (code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, "app/fixture/route.ts"),
    });
    return results
      .flatMap((r) => r.messages)
      .some((m) => m.ruleId === "no-restricted-imports");
  };

  it("DENIES the raw interview operations — app/** gets respinDb, not the functions", async () => {
    // Same reason as slice 1's `appendOwnPost`/`listOnboardingInputs` above:
    // these take a bare `db` handle, and only the facade supplies the pooled
    // one. `saveInterviewDraft`/`getInterviewDraft`/`submitInterview` are
    // reachable from app/** ONLY through `respinDb.*`.
    for (const name of ["saveInterviewDraft", "getInterviewDraft", "submitInterview"]) {
      expect(
        await lintInApp(
          "import { " + name + ' } from "@respin/db";\nexport const x = ' + name + ";\n"
        ),
        name
      ).toBe(true);
    }
  });

  it("ALLOWS the interview's two refusals, its field registry/types, and the metric-direction vocabulary", async () => {
    expect(
      await lintInApp(
        'import { InterviewAnswerError, InterviewDraftSubmittedError, INTERVIEW_FIELDS, INTERVIEW_ANSWER_MAX, METRIC_DIRECTIONS, type InterviewAnswers, type InterviewFieldKey, type OnboardingInterviewDraft } from "@respin/db";\n' +
          "export const x = { InterviewAnswerError, InterviewDraftSubmittedError, INTERVIEW_FIELDS, INTERVIEW_ANSWER_MAX, METRIC_DIRECTIONS };\n" +
          "export type Y = [InterviewAnswers, InterviewFieldKey, OnboardingInterviewDraft];\n"
      ),
      "app/** must be able to render the field registry and instanceof the refusals, or the interview screen renders 'Something went wrong'"
    ).toBe(false);
  });
});

describe("R6 — a NEW @respin/* package is denied from app/** by DEFAULT (task 25)", () => {
  // The hole this closes: every app-side rule was anchored to a package that
  // exists TODAY, so `@respin/llm` (slice 2a) and the three after it would have
  // landed OUTSIDE the import boundary with every fixture in this file green.
  // A boundary that admits by omission is not a boundary.
  const lintAt = async (path: string, code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, path),
    });
    return results
      .flatMap((r) => r.messages)
      .some((m) => m.ruleId === "no-restricted-imports");
  };
  const imp = (spec: string) =>
    'import * as x from "' + spec + '";\nexport const y = x;\n';

  // The four the finish plan actually creates, plus a name nobody has proposed
  // — so the fixture is about the CLASS, not about a list of good guesses.
  const UNSANCTIONED = [
    "@respin/llm",
    "@respin/modes",
    "@respin/trends",
    "@respin/brain",
    "@respin/whatever-comes-next",
  ];

  it.each(UNSANCTIONED)("denies %s from app/**", async (pkg) => {
    expect(await lintAt("app/fixture/route.ts", imp(pkg))).toBe(true);
  });

  it.each(UNSANCTIONED)("denies %s from lib/** too", async (pkg) => {
    expect(await lintAt("lib/fixture.ts", imp(pkg))).toBe(true);
  });

  it("denies a DEEP entrypoint — of an unsanctioned package and of a sanctioned one", async () => {
    for (const spec of [
      "@respin/llm/app-server",
      "@respin/llm/a/b",
      "@respin/auth/server",
      "@respin/db/app-server",
    ]) {
      expect(await lintAt("app/fixture/route.ts", imp(spec)), spec).toBe(true);
    }
  });

  it("NON-VACUITY: every SANCTIONED entrypoint still passes, where it is sanctioned", async () => {
    // The direction that makes this a boundary rather than a wall — and it is
    // not hypothetical: the catch-all's first draft broke all six sanctioned
    // imports at once. `no-restricted-imports` matches with GITIGNORE
    // semantics, which cannot re-include a child of an excluded parent, so
    // negating the deep entrypoints without also negating their package roots
    // made every negation inert.
    //
    // The two packages carrying an `allowImportNames` allowlist are probed with
    // a NAMED import of a sanctioned name, because a namespace import of them
    // is denied by that older rule and always was — using `import * as` here
    // would make this fixture pass for the wrong reason on the day the
    // catch-all broke them.
    const SANCTIONED: [string, string][] = [
      ["app/fixture/route.ts", 'import { respinDb } from "@respin/db";\nexport const y = respinDb;\n'],
      ["app/fixture/route.ts", 'import { requireUser } from "@respin/auth";\nexport const y = requireUser;\n'],
      ["app/fixture/route.ts", imp("@respin/auth/client")],
      ["app/fixture/route.ts", imp("@respin/credits/app-server")],
      ["app/fixture/route.ts", imp("@respin/config/app-server")],
      ["app/(admin)/fixture/page.tsx", imp("@respin/config/admin-server")],
      ["app/api/stripe/webhook/route.ts", imp("@respin/credits/webhook-server")],
    ];
    for (const [path, code] of SANCTIONED) {
      expect(await lintAt(path, code), path + " <- " + code.slice(0, 60)).toBe(
        false
      );
    }
  });

  it("the admin and webhook grants stay SCOPED to their own files", async () => {
    // Neither grant may have been widened by being negated in the catch-all.
    expect(
      await lintAt("app/fixture/route.ts", imp("@respin/config/admin-server")),
      "the config WRITE surface leaked outside app/(admin)"
    ).toBe(true);
    expect(
      await lintAt("app/fixture/route.ts", imp("@respin/credits/webhook-server")),
      "the Stripe dispatcher leaked outside the webhook route"
    ).toBe(true);
  });
});


describe("slice 6 R1: @respin/modes joins the boundary DELIBERATELY", () => {
  // The card's R1: a new package "joins the import boundary deliberately",
  // and for `@respin/modes` the deliberate decision is that it STAYS DENIED
  // from app/** — recorded in eslint.config.mjs's catch-all comment, fixtured
  // here. The precedent is `@respin/llm`: a server action that can build a
  // prompt can reach a model with arbitrary text, and this one has the credit
  // debit behind it as well. app/** reaches a generation through
  // @respin/credits/app-server.
  const messagesAt = async (path: string, code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, path),
    });
    return results
      .flatMap((r) => r.messages)
      .filter((m) => m.ruleId === "no-restricted-imports")
      .map((m) => m.message);
  };
  const denied = async (path: string, code: string) =>
    (await messagesAt(path, code)).length > 0;
  const imp = (spec: string) =>
    'import * as x from "' + spec + '";\nexport const y = x;\n';

  it("the package this fixture is about actually EXISTS", () => {
    // A deny fixture for a package nobody wrote is a fixture about a string.
    expect(
      existsSync(resolve(respinRoot, "packages/modes/package.json")),
      "packages/modes is missing — this whole block would be vacuous"
    ).toBe(true);
    const pkg = JSON.parse(
      readFileSync(resolve(respinRoot, "packages/modes/package.json"), "utf8")
    ) as { name: string };
    expect(pkg.name).toBe("@respin/modes");
  });

  it("is denied from app/** and lib/**", async () => {
    expect(await denied("app/fixture/route.ts", imp("@respin/modes"))).toBe(true);
    expect(await denied("lib/fixture.ts", imp("@respin/modes"))).toBe(true);
  });

  it("NON-VACUITY: it is the CATCH-ALL that denies it, not some older rule", async () => {
    // The fixture would still be green if a differently-scoped rule happened to
    // fire, and then removing the catch-all would leave it green while the
    // package went un-caged. The message is the discriminator.
    const messages = await messagesAt("app/fixture/route.ts", imp("@respin/modes"));
    expect(messages.join(" ")).toMatch(/denied by default/);
  });

  it("denies its DEEP entrypoints, including ones nobody has proposed", async () => {
    for (const spec of [
      "@respin/modes/app-server",
      "@respin/modes/src/pipeline",
      "@respin/modes/a/b",
    ]) {
      expect(await denied("app/fixture/route.ts", imp(spec)), spec).toBe(true);
    }
  });

  it("denies a PATH spelling of it from app/**", async () => {
    // Anchoring a rule to a package NAME is bypassable by spelling the same
    // module as a path — the class the `patterns` group closes. Proved for the
    // new package rather than assumed to be inherited.
    for (const spec of [
      "@/packages/modes/src/pipeline",
      "../../packages/modes/src/hard-rules",
    ]) {
      expect(await denied("app/fixture/route.ts", imp(spec)), spec).toBe(true);
    }
  });

  it("packages/** MAY reach its root — stage C composes the generation there", async () => {
    // The direction that makes this a boundary rather than a wall. If this
    // flips, `packages/credits/src/generate.ts` cannot be written at all.
    expect(
      await denied("packages/credits/src/fixture.ts", imp("@respin/modes"))
    ).toBe(false);
  });

  it("...but never into its src/, by name or by relative climb", async () => {
    for (const spec of [
      "@respin/modes/src/pipeline",
      "../../modes/src/hard-rules",
    ]) {
      expect(
        await denied("packages/credits/src/fixture.ts", imp(spec)),
        spec
      ).toBe(true);
    }
  });
});

describe("AC-15 (the packages/** half): the specifier-shape hole, one directory over", () => {
  const lintAt = async (path: string, code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, path),
    });
    return results
      .flatMap((r) => r.messages)
      .some((m) => m.ruleId === "no-restricted-imports");
  };
  const CREDITS = "packages/credits/src/fixture.ts";

  // Both of these were ALLOWED before M2a — probe-confirmed — in the milestone
  // that puts the tenancy cage inside that exact module. Every rule in this
  // config is anchored to a `@respin/...` package NAME, so a path spelling
  // bypassed all of them from one directory over.
  it("DENIES a deep import into another package's src, by package name", async () => {
    expect(
      await lintAt(
        CREDITS,
        'import { writeCapabilities } from "@respin/db/src/with-workspace";\nexport const x = writeCapabilities;\n'
      )
    ).toBe(true);
  });

  it("DENIES the same module spelled as a relative climb", async () => {
    expect(
      await lintAt(
        CREDITS,
        'import { writeCapabilities } from "../../db/src/with-workspace";\nexport const x = writeCapabilities;\n'
      )
    ).toBe(true);
  });

  it("DENIES it from a subdirectory too (one level deeper)", async () => {
    expect(
      await lintAt(
        "packages/credits/src/stripe/fixture.ts",
        'import { writeCapabilities } from "../../../db/src/with-workspace";\nexport const x = writeCapabilities;\n'
      )
    ).toBe(true);
  });

  it("DENIES it from a package TEST too — a trustWorkspaceId grant is not a path grant", async () => {
    expect(
      await lintAt(
        "packages/credits/tests/fixture.test.ts",
        'import { writeCapabilities } from "../../db/src/with-workspace";\nexport const x = writeCapabilities;\n'
      )
    ).toBe(true);
  });

  it("NOT a blanket ban: the package ROOT and DECLARED entrypoints still import", async () => {
    expect(
      await lintAt(
        CREDITS,
        'import { withWorkspace, assertScoped } from "@respin/db";\nexport const x = { withWorkspace, assertScoped };\n'
      ),
      "the root is where the sanctioned surface lives — denying it would break every package"
    ).toBe(false);
    expect(
      await lintAt(
        CREDITS,
        'import { getActiveConfig } from "@respin/config";\nexport const x = getActiveConfig;\n'
      )
    ).toBe(false);
    // ...and a SAME-package relative import is untouched.
    expect(
      await lintAt(
        CREDITS,
        'import { foldLedger } from "./fold";\nexport const x = foldLedger;\n'
      )
    ).toBe(false);
  });
});

describe("P6 — there is no trustProfileId, under any name", () => {
  // `trustWorkspaceId` exists because a Stripe webhook arrives with no session.
  // NOTHING analogous exists for a profile: a profile is always reached from a
  // workspace scope the caller already holds. So a mint that registers in the
  // cage and is importable from a package would be `trustProfileId` under
  // another name — and this scan is what stops one appearing by convenience.
  const CAST = String.raw`as\s+VerifiedProfileId`;

  it("no product source outside with-workspace.ts casts to VerifiedProfileId", async () => {
    const hits = await scanFor(CAST, P6_ROOTS);
    const offenders = hits.filter(
      (l) => !l.startsWith("packages/db/src/with-workspace.ts")
    );
    expect(
      offenders,
      "the brand compiles from any string — the ONLY sanctioned cast is inside ProfileScope.mint"
    ).toEqual([]);
  });

  it("no export named like a profile-id trust mint exists anywhere", async () => {
    const hits = await scanFor(
      String.raw`export\s+(async\s+)?(function|const)\s+(trust|unsafe|raw|assume|force)[A-Za-z]*Profile`,
      P6_ROOTS
    );
    expect(hits).toEqual([]);
  });

  it("the cage registries are never re-exported (only this module may register)", async () => {
    const hits = await scanFor(
      String.raw`export\s+.*respin\.scope\.cage`,
      P6_ROOTS
    );
    expect(hits).toEqual([]);
  });

  // THE PROBE'S NAME IS LOAD-BEARING. It must live under `lib/` for the scan to
  // reach it, which means `tsc` reaches it too — and the file is deliberately
  // uncompilable (`VerifiedProfileId` is never imported). The `finally` below
  // removes it on any test outcome, but NOT when the run is killed mid-test,
  // and a survivor then fails `pnpm typecheck` on every later run until someone
  // notices a stray file. `tsconfig.json` therefore excludes `**/__*_probe.ts`;
  // rename this file and that exclude stops covering it.
  it("NON-VACUITY: the scan finds a planted cast", async () => {
    const { writeFileSync, rmSync, mkdirSync } = await import("node:fs");
    const file = resolve(respinRoot, PLANTED_PROBE_PATHS.profileBrandCast);
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        'export const x = "id" as unknown as VerifiedProfileId;\n'
      );
      const hits = await scanFor(CAST, P6_ROOTS, [
        PLANTED_PROBE_PATHS.profileBrandCast,
      ]);
      expect(hits.some((l) => l.includes("__p6_probe"))).toBe(true);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

describe("P6b — the WORKSPACE brand has the scan its profile twin already had", () => {
  // WHY THIS EXISTS, AND WHY IT WAS MISSING (tenancy gate, round 2, 2026-08-28).
  //
  // `VerifiedProfileId` has two instruments: an eslint deny on
  // `trustProfileId`, and the P6 source scan above with a planted-cast probe.
  // `VerifiedWorkspaceId` had only the first — the `trustWorkspaceId` IMPORT
  // allowlist — and a bare `x as VerifiedWorkspaceId` is invisible to an import
  // rule. The brand is `string & {…}`, so it compiles from any string.
  //
  // The run slot is what made the gap cost something. `pgRunSlots.acquire`
  // takes a `VerifiedWorkspaceId` and decides WHICH TENANT'S semaphore a run
  // consumes, so a forged id there is a cross-tenant denial of service — one
  // workspace exhausting another's slots. The brand is also on app/**'s
  // allowlist and `respinCredits.getBalance`/`getBillingState` take one
  // directly.
  //
  // No live bypass exists today: the two casts in product source are both
  // inside `with-workspace.ts`, which is where the mint lives. This is the scan
  // that keeps it that way.
  const WS_CAST = String.raw`as\s+VerifiedWorkspaceId`;

  /**
   * PRODUCT SOURCE ONLY — test files are excluded, and the exclusion is stated
   * rather than left as an impression.
   *
   * A suite legitimately names workspace ids to build fixtures (this scan's own
   * sibling, `packages/db/tests/run-slot-key.test.ts`, does exactly that to
   * prove the key is injective over adversarial id shapes). A forged brand in a
   * test is reachable by nobody; a forged brand in `app` or in a package's `src`
   * is reachable by a request. The scan is drawn where the risk is.
   *
   * NOTE the divergence from P6 above, which scans tests as well: that is
   * incidental, not designed — no test happens to cast to `VerifiedProfileId`
   * today, so the question has never been put to it. Recorded here so the two
   * are not assumed to be the same rule.
   */
  const isProductSource = (line: string) =>
    !/\/tests?\//.test(line) && !/\.test\.tsx?:/.test(line);

  it("no product source outside with-workspace.ts casts to VerifiedWorkspaceId", async () => {
    const hits = await scanFor(WS_CAST, P6_ROOTS);
    const offenders = hits
      .filter(isProductSource)
      .filter((l) => !l.startsWith("packages/db/src/with-workspace.ts"));
    expect(
      offenders,
      "the brand compiles from any string — the only sanctioned casts are the mint and trustWorkspaceId, both in with-workspace.ts"
    ).toEqual([]);
  });

  it("no export named like a SECOND workspace-id trust mint exists", async () => {
    // `trustWorkspaceId` is sanctioned and import-restricted (a Stripe webhook
    // arrives with no session). A second one under another name would be that
    // restriction routed around by convenience.
    const hits = await scanFor(
      String.raw`export\s+(async\s+)?(function|const)\s+(unsafe|raw|assume|force)[A-Za-z]*Workspace`,
      P6_ROOTS
    );
    expect(hits).toEqual([]);
  });

  it("NON-VACUITY: the scan finds a planted workspace-brand cast", async () => {
    // Same probe-name convention as P6 above, so `tsconfig.json`'s
    // `**/__*_probe.ts` exclude covers it and an interrupted run cannot poison
    // every later typecheck.
    const { writeFileSync, rmSync, mkdirSync } = await import("node:fs");
    const file = resolve(respinRoot, PLANTED_PROBE_PATHS.workspaceBrandCast);
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        'export const x = "id" as unknown as VerifiedWorkspaceId;\n'
      );
      const hits = (
        await scanFor(WS_CAST, P6_ROOTS, [
          PLANTED_PROBE_PATHS.workspaceBrandCast,
        ])
      ).filter(isProductSource);
      expect(
        hits.some((l) => l.includes("__p6b_probe")),
        "a scan that finds nothing reports a clean tree — plant one and it must be seen"
      ).toBe(true);
    } finally {
      rmSync(file, { force: true });
    }
  });
});

describe("the cage registries are unreachable from product code (tenancy gate BLOCK, 2026-08-23)", () => {
  // THE RESIDUAL, AND WHY THIS SCAN IS THE CONTROL FOR IT.
  //
  // The scope registries live on `globalThis[Symbol.for("respin.scope.cage.*")]`
  // so that a duplicated module graph shares them (AC-19). A WeakSet published
  // that way has a public `add`, and the tenancy gate PROVED the consequence by
  // running it: a plain `{workspaceId, role: "owner", accessors: {}}` added to
  // the workspace registry passed `assertScoped` and reached `assertOwner` AS AN
  // OWNER — `createPortalUrl` returned NoStripeCustomerError rather than
  // ScopeForgeryError. Four lines, and no import at all, so every rule in
  // eslint.config.mjs is blind to it (the gate confirmed: zero messages).
  //
  // THE PREVIOUS JUSTIFICATION WAS WRONG, not merely thin. The module header
  // said the residual was acceptable because "app code cannot run module-scope
  // code" — false for Next.js: a server action or route module body IS
  // module-scope code in the same process.
  //
  // The real reason it is acceptable is narrower and checkable: the threat
  // model here is CODE IN THIS REPOSITORY, and repo code is gated. Imports are
  // gated by eslint; this shape needs no import, so it is gated by this scan.
  // Nothing defends against arbitrary in-process module-scope execution, and
  // nothing can — a WeakSet reachable by two module copies is reachable by
  // anything else in the process, by construction. So the honest control is a
  // tripwire on the STRING, and R-30 says so.
  const CAGE_REF = String.raw`respin\.scope\.(cage|db)`;
  const CAGE_ROOTS = [...SCAN_ROOTS, "packages"] as const;

  it("no product source outside with-workspace.ts names a cage registry key", async () => {
    const hits = await scanFor(CAGE_REF, CAGE_ROOTS);
    const offenders = hits.filter(
      (l) => !l.startsWith("packages/db/src/with-workspace.ts")
    );
    expect(
      offenders,
      "this reaches the scope registries with NO import, so eslint cannot see it — a value registered here passes assertScoped and clears assertOwner as owner"
    ).toEqual([]);
  });

  it("NON-VACUITY: the scan finds a planted registration, in app/** and in packages/**", async () => {
    const { writeFileSync, rmSync, mkdirSync } = await import("node:fs");
    const probePaths = [
      PLANTED_PROBE_PATHS.cageRegistrationApp,
      PLANTED_PROBE_PATHS.cageRegistrationPackage,
    ];
    const probes = probePaths.map((p) => resolve(respinRoot, p));
    try {
      for (const file of probes) {
        // The gate's own four-line forge, verbatim in shape.
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(
          file,
          'const cage = (globalThis as never)[Symbol.for("respin.scope.cage.workspace")];\n' +
            'export const forged = { workspaceId: "w", role: "owner", accessors: {} };\n' +
            "(cage as { add: (o: object) => void }).add(forged);\n"
        );
      }
      const hits = await scanFor(CAGE_REF, CAGE_ROOTS, probePaths);
      for (const file of probes) {
        const rel = file.includes("credits")
          ? "packages/credits/src/__cage_probe"
          : "lib/__cage_probe";
        expect(
          hits.some((l) => l.includes("__cage_probe")),
          "the scan missed a planted registration at " + rel
        ).toBe(true);
      }
    } finally {
      for (const file of probes) rmSync(file, { force: true });
    }
  });
});

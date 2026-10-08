import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { SCAN_ROOTS, blankComments } from "./support/app-surface";
import { PLANTED_PROBE_PATHS } from "./support/probe-artifacts";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const respinRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One shared engine: per-test ESLint construction contended with the parallel
// PGlite suites and flaked a timeout once (code-review finding 3).
const eslint = new ESLint({ cwd: respinRoot });

// THE ESLINT WARM-UP — a known flake carried in rather than discovered again.
//
// THE MEASUREMENT (2026-09-04 full-suite run, 149 files, TEST_DATABASE_URL
// live): `rejects an app/ import from inside packages/` TIMED OUT AT 60s, and
// the same case passed in 802ms run alone. That is the discriminator
// vitest.config.ts writes down for contention — a file's FIRST test, in setup
// rather than in an assertion, green in isolation — and this file's first
// `lintText` is where ESLint's flat config and the TypeScript parser are
// actually loaded. Slice 9a adds eight more cases to this file, which makes it
// slower, so the flake is paid down here rather than left to be rediscovered.
//
// WHAT THIS IS NOT: a relaxed expectation. NOT ONE ASSERTION CHANGES. The
// warm-up moves the one-time config load out of an `it` and into a hook with
// its own generous budget, so each case's 60s timeout measures LINT WORK
// instead of module initialisation. A builder who finds themself widening an
// expectation to make this green has left the fix and entered the class
// CLAUDE.md's 2026-07-30 lesson names.
//
// TWO PATHS, because the resolved config differs by file and each resolution
// is what gets cached on the shared instance: one under packages/** (the
// import-direction and cross-package rules) and one under app/** (the
// sanctioned-surface allowlist). Both are throwaway sources; the results are
// deliberately ignored.
beforeAll(async () => {
  await eslint.lintText("export const warm = 1;\n", {
    filePath: resolve(respinRoot, "packages/fixture/src/warmup.ts"),
  });
  await eslint.lintText("export const warm = 1;\n", {
    filePath: resolve(respinRoot, "app/fixture/warmup.ts"),
  });
}, 240_000);

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
      // Audit Phase 2 (P2-R8): the `[check]` marker's one home, for the
      // server-reachable files that decide against it.
      "CHECK",
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

  it("`outputTextUnits` stays UNREACHABLE from app/** (audit Phase 2, P2-R6)", async () => {
    // The Spin projection used to be a hand-listed five-of-ten field list; it
    // is now the facade's `presentedTextUnits`. The tempting shortcut —
    // importing the package's own population — must stay red, by name, by
    // deep entry and by path, and neither facade the app may read re-exports
    // it.
    const named = 'import { outputTextUnits } from "@respin/modes";\nexport const y = outputTextUnits;\n';
    expect(await denied("app/(product)/trends/fixture.ts", named)).toBe(true);
    for (const spec of ["@respin/modes/src/output", "../../../packages/modes/src/output"]) {
      expect(
        await denied("app/(product)/trends/fixture.ts", `import { outputTextUnits } from "${spec}";\nexport const y = outputTextUnits;\n`),
        spec
      ).toBe(true);
    }
    for (const facade of ["packages/credits/src/app-server.ts", "packages/db/src/index.ts"]) {
      expect(readFileSync(resolve(respinRoot, facade), "utf8"), facade).not.toMatch(/\boutputTextUnits\b/);
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

describe("slice 8 R2: @respin/trends joins the boundary deliberately", () => {
  const messagesAt = async (path: string, code: string) => {
    const results = await eslint.lintText(code, { filePath: resolve(respinRoot, path) });
    return results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === "no-restricted-imports")
      .map((message) => message.message);
  };
  const imp = (specifier: string) => `import * as trends from "${specifier}"; export const x = trends;`;

  it("the package exists, so this boundary fixture is non-vacuous", () => {
    const packagePath = resolve(respinRoot, "packages/trends/package.json");
    expect(existsSync(packagePath)).toBe(true);
    expect(JSON.parse(readFileSync(packagePath, "utf8"))).toMatchObject({ name: "@respin/trends" });
  });

  it("denies app/lib broad and deep imports via the default catch-all", async () => {
    for (const path of ["app/fixture/route.ts", "lib/fixture.ts"]) {
      for (const specifier of ["@respin/trends", "@respin/trends/src/sources", "@respin/trends/app-server"]) {
        const messages = await messagesAt(path, imp(specifier));
        expect(messages.length, `${path} <- ${specifier}`).toBeGreaterThan(0);
        expect(messages.join(" ")).toMatch(/denied by default/);
      }
    }
  });

  it("does not make trends a packages/** wall", async () => {
    expect(await messagesAt("packages/credits/src/fixture.ts", imp("@respin/trends"))).toEqual([]);
  });
});

describe("slice 8 dedicated worker package surface", () => {
  const lintInWorker = async (code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, "worker/fixture.ts"),
    });
    return results.flatMap((result) => result.messages);
  };

  it("allows only the worker's trend root and named system DB composition surface", async () => {
    const messages = await lintInWorker(
      'import { validateAutopsyAnalysis } from "@respin/trends";\n' +
        'import { AUTOPSY_ATTEMPT_CODE_CEILING, AUTOPSY_VENDOR_CALLS_PER_ATTEMPT, AUTOPSY_CLAIM_LEASE_MS, assertAutopsyDeadlineWithinLease, SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD, assertAutopsyFrameworkCandidate, createSystemWorkerDb, closeSystemWorkerDb, createSystemAutopsyAttemptStore, recordSystemWorkerHealth, recoverStaleSystemAutopsyAttempts, systemAutopsyQueueCandidates, systemWorkerOperationalState, systemRefreshNiches, type DbLike } from "@respin/db";\n' +
        'import { getActiveConfig, getActiveConfigRequiringStored, type ActiveConfig } from "@respin/config";\n' +
        'import { createAnthropicProvider, costMicroUsd, priceFor, type LlmProvider } from "@respin/llm";\n' +
        "export const x = { validateAutopsyAnalysis, AUTOPSY_ATTEMPT_CODE_CEILING, AUTOPSY_VENDOR_CALLS_PER_ATTEMPT, AUTOPSY_CLAIM_LEASE_MS, assertAutopsyDeadlineWithinLease, SYSTEM_AUTOPSY_DAILY_CODE_CEILING_MICRO_USD, assertAutopsyFrameworkCandidate, createSystemWorkerDb, closeSystemWorkerDb, createSystemAutopsyAttemptStore, recordSystemWorkerHealth, recoverStaleSystemAutopsyAttempts, systemAutopsyQueueCandidates, systemWorkerOperationalState, systemRefreshNiches, getActiveConfig, getActiveConfigRequiringStored, createAnthropicProvider, costMicroUsd, priceFor };\n" +
        "export type Config = ActiveConfig;\n" +
        "export type Provider = LlmProvider;\n" +
        "export type X = DbLike;\n",
    );
    expect(messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(false);
  });

  it("admits the deletion command adapter entrypoint and the executor composition names (10b-1 Task 4)", async () => {
    const messages = await lintInWorker(
      'import { createStripeExternalCommandPort } from "@respin/credits/deletion-server";\n' +
        'import { advanceDeletionOperations, ERASURE_DISABLED, migrationInventory, type DeletionExecutorPorts, type DeletionJournalPort, type ErasureEnablementPort, type MigrationInventory, type DeletionScope } from "@respin/db";\n' +
        "export const x = { createStripeExternalCommandPort, advanceDeletionOperations, ERASURE_DISABLED, migrationInventory };\n" +
        "export type P = DeletionExecutorPorts | DeletionJournalPort | ErasureEnablementPort | MigrationInventory | DeletionScope;\n",
    );
    expect(messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(false);
  });

  it("denies the app facade, the webhook dispatcher and the credits root from the worker; denies the deletion entrypoint from app/**", async () => {
    for (const code of [
      'import { getServerCredits } from "@respin/credits/app-server";\nexport const x = getServerCredits;\n',
      'import { respinStripeWebhook } from "@respin/credits/webhook-server";\nexport const x = respinStripeWebhook;\n',
      'import { getStripe } from "@respin/credits";\nexport const x = getStripe;\n',
    ]) {
      const messages = await lintInWorker(code);
      expect(messages.some((message) => message.ruleId === "no-restricted-imports"), code).toBe(true);
    }
    const appResults = await eslint.lintText(
      'import { createStripeExternalCommandPort } from "@respin/credits/deletion-server";\nexport const x = createStripeExternalCommandPort;\n',
      { filePath: resolve(respinRoot, "app/fixture/route.ts") },
    );
    expect(appResults.flatMap((result) => result.messages).some((message) => message.ruleId === "no-restricted-imports")).toBe(true);
  });

  it("audit P3-R1(b): scripts/** take @respin/credits/operator-server and NOT the app facade; app/** and worker/** may not take operator-server", async () => {
    const restricted = async (code: string, file: string) =>
      (await eslint.lintText(code, { filePath: resolve(respinRoot, file) }))
        .flatMap((result) => result.messages)
        .filter((message) => message.ruleId === "no-restricted-imports");
    const operatorImport =
      'import { operatorSettleCandidate } from "@respin/credits/operator-server";\nexport const x = operatorSettleCandidate;\n';
    expect(await restricted(operatorImport, "scripts/fixture.ts")).toEqual([]);
    expect(
      await restricted('import { respinCredits } from "@respin/credits/app-server";\nexport const x = respinCredits;\n', "scripts/fixture.ts")
    ).not.toEqual([]);
    expect(await restricted(operatorImport, "app/fixture/route.ts")).not.toEqual([]);
    expect(await restricted(operatorImport, "worker/fixture.ts")).not.toEqual([]);
  });

  it("admits the R-124 S3 journal adapter and its composition names in the worker (10b-1 Task 5)", async () => {
    const messages = await lintInWorker(
      'import { createS3JournalClient, s3JournalWriter } from "@respin/db/deletion-journal-s3";\n' +
        'import { assertJournalConfig, createDeletionJournalStore, type DeletionJournalConfig } from "@respin/db";\n' +
        "export const x = { createS3JournalClient, s3JournalWriter, assertJournalConfig, createDeletionJournalStore };\n" +
        "export type C = DeletionJournalConfig;\n",
    );
    expect(messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(false);
  });

  it("denies the S3 journal adapter from app/** and lib/** — the AWS SDK never enters the app bundle (10b-1 Task 5)", async () => {
    // The adapter is a NEW deep entrypoint into @respin/db, so the boundary rule
    // requires it to be denied everywhere it was not deliberately admitted. A
    // negation added to the worker list must not widen the app's door.
    for (const filePath of ["app/fixture/route.ts", "lib/fixture.ts"]) {
      const results = await eslint.lintText(
        'import { s3JournalWriter } from "@respin/db/deletion-journal-s3";\nexport const x = s3JournalWriter;\n',
        { filePath: resolve(respinRoot, filePath) },
      );
      expect(
        results.flatMap((result) => result.messages).some((message) => message.ruleId === "no-restricted-imports"),
        filePath,
      ).toBe(true);
    }
  });

  it("the cost forecast is STRUCTURALLY unable to touch lifecycle work (10b-1 Task 5)", async () => {
    // `deletion-journal-cost.ts` claims in its own header that "nothing in this
    // file imports the executor, and the executor imports nothing from here;
    // the import-boundary test pins that". Round 1 found no such test existed —
    // a comment promising an absence, which the repo's own 2026-07-30 lesson
    // says must be asserted or deleted. This is the assertion.
    const costSource = await readFile(
      resolve(respinRoot, "packages/db/src/deletion-journal-cost.ts"),
      "utf8",
    );
    // It has no imports at all, so it cannot reach a connection, a credential,
    // a network call, or an operation — the property that lets R-124's alert
    // thresholds be operational signals rather than a brake on a deletion.
    expect(costSource).not.toMatch(/^\s*import\s/m);

    for (const consumer of [
      "packages/db/src/deletion-executor.ts",
      "packages/db/src/deletion-lifecycle.ts",
      "packages/db/src/deletion-journal.ts",
      "packages/db/src/deletion-journal-restore.ts",
      "worker/deletion-lifecycle.ts",
    ]) {
      const source = await readFile(resolve(respinRoot, consumer), "utf8");
      expect(source, consumer).not.toMatch(/deletion-journal-cost/);
      expect(source, consumer).not.toMatch(/forecastDeletionJournalCost|journalEnablementDecision/);
    }
  });

  it("worker/main.ts forwards EVERY env-bearing option the worker declares (10b-1 Task 5)", async () => {
    // Task 4 declared `erasureScopesEnv` and main.ts never passed it, so
    // RESPIN_DELETION_ERASURE_SCOPES silently did nothing in production and no
    // test could see it (the property is optional, so typecheck cannot either).
    // Task 5 wired it; this is what stops it being un-wired again.
    const main = await readFile(resolve(respinRoot, "worker/main.ts"), "utf8");
    const envExample = await readFile(resolve(respinRoot, "env.example"), "utf8");

    for (const option of ["erasureScopesEnv", "journalEnv"]) {
      expect(main, option).toContain(option);
    }
    for (const envVar of [
      "RESPIN_DELETION_ERASURE_SCOPES",
      "RESPIN_DELETION_JOURNAL_BUCKET",
      "RESPIN_DELETION_JOURNAL_REGION",
      "RESPIN_DELETION_JOURNAL_ENVIRONMENT",
      "RESPIN_DELETION_JOURNAL_ENDPOINT",
    ]) {
      expect(main, envVar).toContain(`env.${envVar}`);
      // ...and documented, so an operator can discover it.
      expect(envExample, envVar).toContain(`${envVar}=`);
    }
  });

  it("admits the operator scripts' PURE projections and the verifier/purge principals (10b-1 Task 5)", async () => {
    const results = await eslint.lintText(
      'import { forecastDeletionJournalCost, journalEnablementDecision, loadJournalChain, journalPurgeCandidates } from "@respin/db";\n' +
        'import { createS3JournalClient, s3JournalVerifier, s3JournalPurger } from "@respin/db/deletion-journal-s3";\n' +
        "export const x = { forecastDeletionJournalCost, journalEnablementDecision, loadJournalChain, journalPurgeCandidates, createS3JournalClient, s3JournalVerifier, s3JournalPurger };\n",
      { filePath: resolve(respinRoot, "scripts/fixture.ts") },
    );
    expect(
      results.flatMap((r) => r.messages).filter((m) => m.ruleId === "no-restricted-imports"),
    ).toEqual([]);
  });

  it("DENIES the journal WRITER to operator scripts — it is the credential that can append a version", async () => {
    // Round-1 tenancy C4. A script holding the writer could append a forged
    // `cancelled` version, which is exactly the input the restore verifier's
    // cancellation-after-erasure check exists to refuse. The writer is the
    // worker's alone.
    const results = await eslint.lintText(
      'import { s3JournalWriter } from "@respin/db/deletion-journal-s3";\nexport const x = s3JournalWriter;\n',
      { filePath: resolve(respinRoot, "scripts/fixture.ts") },
    );
    expect(
      results.flatMap((r) => r.messages).some((m) => m.ruleId === "no-restricted-imports"),
    ).toBe(true);
    // ...and the worker still holds it, or the fix would have broken production.
    const worker = await lintInWorker(
      'import { s3JournalWriter } from "@respin/db/deletion-journal-s3";\nexport const x = s3JournalWriter;\n',
    );
    expect(worker.some((m) => m.ruleId === "no-restricted-imports")).toBe(false);
  });

  it("denies operator scripts the write capabilities, raw DB construction and table objects", async () => {
    for (const code of [
      'import { writeCapabilities } from "@respin/db";\nexport const x = writeCapabilities;\n',
      'import { createDb } from "@respin/db";\nexport const x = createDb;\n',
      'import { withWorkspace } from "@respin/db";\nexport const x = withWorkspace;\n',
      'import { schema } from "@respin/db";\nexport const x = schema;\n',
      'import { createFakeS3 } from "@respin/db";\nexport const x = createFakeS3;\n',
    ]) {
      const results = await eslint.lintText(code, {
        filePath: resolve(respinRoot, "scripts/fixture.ts"),
      });
      expect(
        results.flatMap((r) => r.messages).some((m) => m.ruleId === "no-restricted-imports"),
        code,
      ).toBe(true);
    }
  });

  it("denies every OTHER deep import into @respin/db from the worker — one door, not an open package", async () => {
    // Admitting `deletion-journal-s3` must not admit the package's internals.
    for (const specifier of [
      "@respin/db/src/deletion-journal",
      "@respin/db/deletion-journal",
      "@respin/db/src/schema",
      "@respin/db/testing",
    ]) {
      const messages = await lintInWorker(`import * as x from "${specifier}";\nexport const y = x;\n`);
      expect(messages.some((message) => message.ruleId === "no-restricted-imports"), specifier).toBe(true);
    }
  });

  it("still denies raw DB construction, tables, and package internals", async () => {
    for (const code of [
      'import { createDb } from "@respin/db";\nexport const x = createDb;\n',
      'import { systemSpendDaily } from "@respin/db";\nexport const x = systemSpendDaily;\n',
      'import { appendConfigVersion } from "@respin/config";\nexport const x = appendConfigVersion;\n',
      'import { assembleVoicePrompt } from "@respin/llm";\nexport const x = assembleVoicePrompt;\n',
      'import { validateAutopsyAnalysis } from "@respin/trends/src/autopsy";\nexport const x = validateAutopsyAnalysis;\n',
    ]) {
      const messages = await lintInWorker(code);
      expect(messages.some((message) => message.ruleId === "no-restricted-imports")).toBe(true);
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

describe("slice 9a R3: @respin/brain joins the boundary DELIBERATELY", () => {
  // Phase-9 R3: the package "joins the import boundary deliberately
  // (`eslint.config.mjs`'s negation catch-all + a deny fixture), like every
  // package before it".
  //
  // FOR `@respin/brain` THE DELIBERATE DECISION IS THAT IT STAYS DENIED, and
  // its reason is recorded beside the catch-all rather than only here: the
  // comparison builder takes rows its own docblock calls "ALREADY
  // profile-scoped by the caller", so the tenancy property of a comparison
  // belongs to whatever fetched those rows through `withWorkspace`. Granting
  // the root to app/** would put the fetch and the comparison on opposite
  // sides of a package boundary and leave a screen responsible for scoping a
  // cohort (REQ-A03, R-9).
  //
  // AND THE DENY BEING THE DEFAULT IS PRECISELY WHY THESE CASES EXIST. The
  // catch-all refuses any `@respin/*` nobody negated, so a new package is
  // caged whether or not anybody decided to cage it — which is a guard that
  // passes because it found no candidates, the fail-open shape CLAUDE.md's
  // 2026-08-21 lesson names. A fixture is what turns "denied because nobody
  // looked" into "denied, and somebody checked which rule did it".
  const messagesAt = async (path: string, code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, path),
    });
    return results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === "no-restricted-imports")
      .map((message) => message.message);
  };
  const denied = async (path: string, code: string) =>
    (await messagesAt(path, code)).length > 0;
  const imp = (specifier: string) =>
    'import * as brain from "' + specifier + '";\nexport const x = brain;\n';

  it("the package this fixture is about actually EXISTS", () => {
    // A deny fixture for a package nobody wrote is a fixture about a string —
    // the `@respin/modes` and `@respin/trends` precedent, kept.
    const packagePath = resolve(respinRoot, "packages/brain/package.json");
    expect(
      existsSync(packagePath),
      "packages/brain is missing — this whole block would be vacuous"
    ).toBe(true);
    expect(JSON.parse(readFileSync(packagePath, "utf8"))).toMatchObject({
      name: "@respin/brain",
    });
  });

  it("is denied from app/** and lib/**", async () => {
    expect(await denied("app/fixture/route.ts", imp("@respin/brain"))).toBe(true);
    expect(await denied("lib/fixture.ts", imp("@respin/brain"))).toBe(true);
  });

  it("NON-VACUITY: it is the CATCH-ALL that denies it, not some older rule", async () => {
    // Without this the block stays green if a differently-scoped rule happens
    // to fire, and removing the catch-all would then leave the package
    // un-caged with every case above still passing. The message discriminates.
    const messages = await messagesAt("app/fixture/route.ts", imp("@respin/brain"));
    expect(messages.join(" ")).toMatch(/denied by default/);
  });

  it("denies its DEEP entrypoints, including ones nobody has proposed", async () => {
    for (const specifier of [
      "@respin/brain/app-server",
      "@respin/brain/src/comparison",
      "@respin/brain/src/vocabulary",
      "@respin/brain/a/b",
    ]) {
      expect(await denied("app/fixture/route.ts", imp(specifier)), specifier).toBe(true);
    }
  });

  it("denies a PATH spelling of it from app/**", async () => {
    // Anchoring a rule to a package NAME is bypassable by spelling the same
    // module as a path. Proved for the new package rather than assumed to be
    // inherited from the `patterns` group.
    for (const specifier of [
      "@/packages/brain/src/comparison",
      "../../packages/brain/src/comparison",
    ]) {
      expect(await denied("app/fixture/route.ts", imp(specifier)), specifier).toBe(true);
    }
  });

  it("a TYPE-ONLY import is denied too — the grant would be the same grant", async () => {
    // `billing-errors.ts`'s recorded precedent: widening a package boundary so
    // a screen or a test can name a class is "loosening a tenancy boundary for
    // a convenience". A screen that needs the comparison's shape names it
    // through the facade's own result type, as `app/(product)/studio/
    // projection.ts` does for `@respin/modes`.
    const code =
      'import type { LeverComparison } from "@respin/brain";\nexport type X = LeverComparison;\n';
    expect(await denied("app/fixture/route.ts", code)).toBe(true);
  });

  it("packages/** MAY reach its root — that is where 9b's caller lives", async () => {
    // The direction that makes this a boundary rather than a wall. If this
    // flips, nothing can compose the comparison at all and the package is
    // unreachable from anywhere.
    expect(await denied("packages/credits/src/fixture.ts", imp("@respin/brain"))).toBe(false);
    expect(await denied("packages/db/src/fixture.ts", imp("@respin/brain"))).toBe(false);
  });

  it("...but never into its src/, by name or by relative climb", async () => {
    for (const specifier of ["@respin/brain/src/comparison", "../../brain/src/comparison"]) {
      expect(
        await denied("packages/credits/src/fixture.ts", imp(specifier)),
        specifier
      ).toBe(true);
    }
  });
});

describe("slice 9a: every name on the results surface crossed after a measured denial", () => {
  // A WIDENING IS THE THING THIS CAGE EXISTS TO MAKE DELIBERATE, so it gets
  // both halves as fixtures: what crossed, and what did not. The first half
  // alone is the shape that reads as green while the write surface quietly
  // opened.
  //
  // THE COUNT IS RETIRED, AND ITS RETIREMENT IS THE POINT. This block was
  // titled "widened by EIGHT names, and no more" through two review rounds
  // while the surface carried ELEVEN, and stayed green the whole time —
  // because a title is not an assertion, and the three later names simply had
  // no fixture. A number written into a name has to be re-verified by whoever
  // adds the next entry, which is the one moment nobody re-reads a title.
  //
  // THE DURABLE PROPERTY, which cannot go stale, is the one
  // `eslint.config.mjs` now states on its own side: every name crossed only
  // after an ACTUAL `eslint app lib` denial named it, never for symmetry with
  // a sibling. What this block adds is that the ALLOW half covers the WHOLE
  // population rather than the part somebody remembered — a fixture set
  // narrower than the list it describes is the shape this repo has now hit
  // five times, so the case below DERIVES the population instead of
  // restating it.
  const lintInApp = async (code: string) => {
    const results = await eslint.lintText(code, {
      filePath: resolve(respinRoot, "app/(product)/results/fixture.ts"),
    });
    return results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === "no-restricted-imports");
  };
  const named = (names: readonly string[]) =>
    "import { " + names.join(", ") + ' } from "@respin/db";\n' +
    "export const x = { " + names.join(", ") + " };\n";

  /**
   * THE RESULTS SURFACE, PINNED BY NAME AND NOT BY A COUNT — the
   * `profile-cage.test.ts` idiom: if a twelfth name arrives this list fails
   * and somebody has to look at it, which is the entire point.
   *
   *   THE SIX TYPED REFUSALS — inert values `billing-errors.ts` maps to copy.
   *     Without them a refusal renders as "Something went wrong", which is
   *     open finding 8c-R15's exact shape. `tests/billing-ui.test.tsx` holds
   *     the other half (that each HAS copy); this holds that app/** may reach
   *     them. `ComparisonInputError` is `@respin/brain`'s own refusal,
   *     re-exported through `@respin/db` — which is what lets a screen hold
   *     the class for `instanceof` WITHOUT `@respin/brain` joining the
   *     sanctioned surface.
   *   THE FOUR CLOSED VOCABULARIES — the log form renders each as controls.
   *     The alternative is four app-side literal copies of four closed sets.
   *   THE NOTE CEILING — the form states the limit instead of typing 2000
   *     into the screen. `results.note` has no database ceiling (its only
   *     CHECK is non-blankness), so this constant IS the limit, and a copy of
   *     it on the screen would be a second answer to a question with one.
   */
  const RESULTS_SURFACE = [
    "TreatmentKeyError",
    "ResultInputError",
    "ResultTargetError",
    "ResultDuplicateError",
    "ComparisonStratumError",
    "ComparisonInputError",
    "RESULT_NOTE_MAX",
    "RESULT_EVIDENCE_STATES",
    "RESULT_AUDIENCE_CLASSES",
    "RESULT_CONFOUNDER_CODES",
    "RESULT_LEVERS",
  ] as const;

  it("the pinned list IS the results surface on the allowlist — no name without a fixture", () => {
    // DERIVED FROM THE CONFIG, so the ALLOW half cannot be narrower than the
    // population it claims to cover. A hand-list checked by eye is what let
    // three granted names sit with no fixture through two review rounds.
    //
    // A REGEXP LITERAL, never assembled from a string: one lost backslash and
    // it matches nothing, then reports agreement with an empty set (CLAUDE.md
    // 2026-08-21). It reads the BARE QUOTED ENTRIES of the allowlist — one per
    // line, which is that file's format — so a name mentioned in a comment is
    // never mistaken for a granted one.
    const ALLOWLIST_ENTRY = /^\s*"([A-Za-z_][A-Za-z0-9_]*)",$/gm;
    const config = readFileSync(resolve(respinRoot, "eslint.config.mjs"), "utf8");
    const entries = [...config.matchAll(ALLOWLIST_ENTRY)].map((match) => match[1]);
    expect(
      entries.length,
      "the scan read no allowlist entries — it would report agreement having scanned nothing"
    ).toBeGreaterThan(50);

    // The results surface BY SHAPE rather than by slice: every name this
    // slice added begins one of these four ways, and nothing older does.
    const onAllowlist = entries.filter((name) =>
      /^(RESULT_|Result|Comparison|TreatmentKey)/.test(name)
    );
    expect(
      [...onAllowlist].sort(),
      "the results surface changed — give the new name an ALLOW fixture by adding it here, or take it back off the allowlist"
    ).toEqual([...RESULTS_SURFACE].sort());
  });

  it("ALLOWS every name on that surface, together and one at a time", async () => {
    // TOGETHER, because that is how `billing-errors.ts` and `page.tsx` really
    // import them.
    //
    // ONE AT A TIME FOR THE FAILURE MESSAGE, NOT FOR COVERAGE, and the first
    // draft of this comment claimed the opposite — that a lone denial could
    // hide inside a passing multi-name import. It cannot:
    // `no-restricted-imports` reports one message per denied name, so the
    // combined case above already fails when any single name is refused
    // (measured — taking `RESULT_NOTE_MAX` off the allowlist reddens both
    // cases). What the loop adds is WHICH name, which is the difference
    // between a red test somebody can act on and one they have to bisect.
    expect(await lintInApp(named([...RESULTS_SURFACE]))).toEqual([]);
    for (const name of RESULTS_SURFACE) {
      expect(await lintInApp(named([name])), name + " was denied").toEqual([]);
    }
  });

  it("STILL DENIES the results write surface and the treatment-key builder", async () => {
    // Every name below is REALLY EXPORTED by @respin/db's root, so each case
    // is a rule refusing a reachable import rather than a rule refusing a
    // typo. `treatmentKeyFor` is the sharpest: contract C4 makes the key
    // server-computed and never creator-typed, and a screen that could
    // compute one could fabricate one.
    for (const name of [
      "results",
      "treatmentKeyFor",
      "declaredMetricOf",
      "resultEvidenceState",
      "resultAudienceClass",
    ]) {
      const messages = await lintInApp(named([name]));
      expect(messages.length, name + " crossed the boundary").toBeGreaterThan(0);
    }
  });

  it("STILL DENIES the row TYPES — the screen reaches those by indexed access", async () => {
    // `allowImportNames` makes no type/value distinction, which this list
    // relies on: `app/(product)/results/projection.ts` names the row shape
    // through `Awaited<ReturnType<typeof respinDb.listResults>>[number]`, so
    // no result type needs to cross and none does.
    for (const name of ["ResultRow", "NewResult", "ResultLever", "ResultConfounderCode"]) {
      const messages = await lintInApp(
        "import type { " + name + ' } from "@respin/db";\n' +
          "export type X = " + name + ";\n"
      );
      expect(messages.length, name + " crossed the boundary").toBeGreaterThan(0);
    }
  });

  it("NON-VACUITY: they are allowed because they are LISTED, not because the rule stopped firing", async () => {
    // The failure this case exists for: a rule accidentally scoped away denies
    // nothing, and every ALLOW fixture above goes green for the wrong reason.
    // So an unlisted @respin/db export must still be refused from the very
    // same file path.
    const messages = await lintInApp(named(["createDb"]));
    expect(
      messages.length,
      "the sanctioned-surface rule is not firing here at all — every ALLOW case above is vacuous"
    ).toBeGreaterThan(0);
  });
});

describe("deletion request flag (Phase 10b-1 rollout)", () => {
  it("every request facade asserts RESPIN_DELETION_REQUEST_SCOPES for ITS scope, cancellation asserts nothing, and the flag is documented", async () => {
    const source = await readFile(resolve(respinRoot, "packages/db/src/app-server.ts"), "utf8");
    for (const scope of ["workspace", "profile", "identity"]) {
      expect(source, scope).toContain(`assertDeletionRequestsEnabled(resolveDeletionRequestEnablement(process.env), "${scope}")`);
    }
    // Exactly three call sites: one per request facade, none on cancellation.
    expect(source.match(/assertDeletionRequestsEnabled\(/g)).toHaveLength(3);
    // Each cancellation facade body, from its key to the next facade key.
    const body = (from: string, to: string) => {
      // Both anchors must EXIST: a missing one made `slice` return a wrong,
      // non-empty window that satisfied the assertion (lean gate R-3).
      expect(source.indexOf(from), from).toBeGreaterThanOrEqual(0);
      expect(source.indexOf(to), to).toBeGreaterThanOrEqual(0);
      return source.slice(source.indexOf(from), source.indexOf(to));
    };
    for (const facade of [
      body("cancelScopedDeletion: async", "requestIdentityDeletion: async"),
      body("cancelIdentityDeletion: async", "beginIdentityCancellationRecoverySession:"),
    ]) {
      expect(facade.length).toBeGreaterThan(0);
      expect(facade).not.toContain("assertDeletionRequestsEnabled");
    }
    const envExample = await readFile(resolve(respinRoot, "env.example"), "utf8");
    expect(envExample).toContain("RESPIN_DELETION_REQUEST_SCOPES=");
  });
});

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";
import { SCAN_ROOTS } from "./support/app-surface";

const respinRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// One shared engine: per-test ESLint construction contended with the parallel
// PGlite suites and flaked a timeout once (code-review finding 3).
const eslint = new ESLint({ cwd: respinRoot });

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

async function scanFor(pattern: string): Promise<string[]> {
  const { execFileSync } = await import("node:child_process");
  try {
    return execFileSync(
      "git",
      ["grep", "--untracked", "-n", "-E", pattern, "--", ...SCAN_ROOTS],
      { cwd: respinRoot, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // git grep exits 1 on no matches — that is the pass
  }
}

async function scanForDynamicPackageImports(): Promise<string[]> {
  return scanFor(DYNAMIC_PACKAGE_IMPORT);
}

async function scanForDynamicStripeImports(): Promise<string[]> {
  return scanFor(DYNAMIC_STRIPE_IMPORT);
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
    const { execFileSync } = await import("node:child_process");
    let out = "";
    try {
      out = execFileSync(
        "git",
        // --untracked: respin/ may be uncommitted; without it the assertion is
        // vacuous on untracked trees (tenancy round-1 CHANGE).
        ["grep", "--untracked", "-l", "trustWorkspaceId", "--", "app", "packages", "lib"],
        { cwd: respinRoot, encoding: "utf8" }
      );
    } catch {
      // git grep exits 1 on no matches — that's a pass (zero sites).
      out = "";
    }
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
      const dir = resolve(respinRoot, "app/__scan_probe__");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, "probe.ts"),
        `export const x = async () => ${expr};\n`
      );
      try {
        const hits = await scanForDynamicPackageImports();
        expect(hits.join("\n")).toContain("__scan_probe__");
      } finally {
        rmSync(dir, { recursive: true, force: true });
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
      const dir = resolve(respinRoot, "app/__stripe_scan_probe__");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, "probe.ts"),
        `export const x = async () => (await import("stripe")).default;\n`
      );
      try {
        expect(await scanForDynamicStripeImports()).not.toEqual([]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
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

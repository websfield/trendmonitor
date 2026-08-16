// AC-10 (plan-review CHANGE 1): the relocated server-layer gate is guarded by
// MECHANISM, not memory. Every entrypoint whose URL falls under
// PROTECTED_PREFIXES must import a gate helper — a future M1/M3 page that
// forgets requireUser()/requireAdmin() fails this test, not a code review.
//
// "Entrypoint" is DERIVED, not enumerated (round-3 meta-finding): see
// tests/support/app-surface.ts for the three holes a filename list left open
// and for why `layout` is deliberately not in the served set.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROTECTED_PREFIXES, isProtectedPath } from "../lib/routes";
import {
  METADATA_ROUTE_BASENAMES,
  NEXT_DEFAULT_PAGE_EXTENSIONS,
  PAGE_EXTENSIONS,
  PINNED_PAGE_EXTENSIONS,
  blankComments,
  classifyAppFile,
  findAppEntrypoints,
  isUseServerModule,
  urlForAppFile,
} from "./support/app-surface";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app");
// A real IMPORT from @respin/auth, not a bare word — a comment containing
// "requireUser" must not satisfy the guard (code-gate note: the mechanism
// itself must not be comment-satisfiable).
const GATE_IMPORT =
  /import\s+(type\s+)?\{[^}]*\b(requireUser|requireAdmin|getSessionUser)\b[^}]*\}\s+from\s+["']@respin\/auth["']/;

/** Route groups whose files are, by construction, behind a gate. */
const GATED_GROUPS = ["(product)", "(admin)"];

const rel = (root: string, f: string) => relative(root, f).split(sep).join("/");

/**
 * Entrypoints inside a gated route group whose URL is NOT under any
 * PROTECTED_PREFIX — the default-OPEN hole (round-2 CHANGE 3).
 *
 * Everything else in this file starts from `isProtectedPath`, so it only ever
 * inspects files whose URL ALREADY matches a hand-maintained prefix list. A new
 * product page at a new top-level URL (`app/(product)/brain/page.tsx` → /brain)
 * was therefore invisible to all of it: ungated, unscoped, 10/10 green. The
 * prefix list is the thing that must be exhaustive, and this is what makes it
 * so — a page in a product route group either maps to a protected URL or fails
 * here, with the fix being one line in `lib/routes.ts`.
 *
 * (The `(product)` layout also calls `requireUser()`, so the blast radius today
 * is bounded — but `middleware.ts` states the doctrine this repo runs on: the
 * layout is not the gate, because client navigation caches it.)
 */
export function findUngatedGroupFiles(appRoot: string): string[] {
  return findAppEntrypoints(appRoot)
    .filter((f) =>
      relative(appRoot, f)
        .split(sep)
        .some((seg) => GATED_GROUPS.includes(seg))
    )
    .filter((f) => !isProtectedPath(urlForAppFile(appRoot, f)));
}

/** Returns protected entrypoints lacking a gate-helper reference. */
export function findUnguarded(appRoot: string): string[] {
  return findAppEntrypoints(appRoot)
    .filter((f) => isProtectedPath(urlForAppFile(appRoot, f)))
    .filter((f) => !GATE_IMPORT.test(readFileSync(f, "utf8")));
}

// ------------------------------------------------------------ app/api/**
//
// `app/api/**` sits in no route group and under no PROTECTED_PREFIX, so both
// walks above skipped it entirely: a planted `app/api/zzbrain/route.ts`
// returning cross-workspace data passed 29/29 with lint exit 0 (round-3 NOTE).
// M1's two API routes are legitimately session-free, so the answer is an
// EXPLICIT allowlist plus default-deny for everything else — not silence.

/**
 * API routes that legitimately carry no session gate, each with the mechanism
 * that authenticates them instead. Adding a path here is the deliberate act;
 * anything else under `app/api/**` must import a gate helper.
 */
const SESSION_FREE_API_ROUTES: { file: string; why: string }[] = [
  {
    file: "api/auth/[...all]/route.ts",
    why: "Better Auth's own catch-all handler — it IS the thing that establishes a session, so it cannot require one.",
  },
  {
    file: "api/stripe/webhook/route.ts",
    why: "authenticated by Stripe's signature (Stripe.webhooks.constructEvent), not by a session; the caller is Stripe, never a browser.",
  },
];

/**
 * An ENFORCING gate: imported AND called.
 *
 * `GATE_IMPORT` above also accepts `getSessionUser`, which is correct for a
 * page (it is a legitimate way to read a session), but is NOT a gate:
 * `packages/auth/src/server.ts` defines it as returning `null` for a signed-out
 * caller — it refuses nothing. Pages are backstopped by NAMED_PROTECTED_PAGES,
 * which names the specific helper each one must import AND call; `api/` had no
 * such backstop, so a route that merely imported `getSessionUser` satisfied the
 * walk (phase-4 round-4 tenancy CHANGE). The planted proof was an
 * `app/api/zzghost/route.ts` that called `getSessionUser()`, ignored the null,
 * and answered anyway: 26/26 green with `ƒ /api/zzghost` in the build. Because
 * `withWorkspace` takes `authUserId: string`, such a route can pass a
 * caller-supplied id and get a *correctly filtered* read of another tenant's
 * workspace — a correctly-filtered bypass is still a bypass.
 */
const ENFORCING_GATES = ["requireUser", "requireAdmin"] as const;

/**
 * The LOCAL names bound to an enforcing gate by a value import from
 * `@respin/auth`.
 *
 * Resolving the binding rather than matching the name closes both halves of
 * the alias problem (round-5 tenancy NOTE): `import { getSessionUser as
 * requireUser }` no longer counts — the round-4 defect wearing the gate's name
 * — and `import { requireUser as ru }` now correctly DOES, where a name match
 * reported it as ungated. `import type { … }` is excluded: a type-only import
 * binds nothing at runtime and cannot refuse anyone.
 */
function enforcingGateBindings(src: string): string[] {
  const bindings: string[] = [];
  const importRe = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']@respin\/auth["']/g;
  for (const m of src.matchAll(importRe)) {
    if (m[1]) continue; // `import type` — no runtime binding
    for (const spec of m[2].split(",")) {
      const [imported, local] = spec.split(/\s+as\s+/).map((s) => s.trim());
      if (!imported || imported === "type") continue;
      if ((ENFORCING_GATES as readonly string[]).includes(imported)) {
        bindings.push(local || imported);
      }
    }
  }
  return bindings;
}

function hasEnforcingGate(file: string): boolean {
  const src = blankComments(readFileSync(file, "utf8"));
  const bindings = enforcingGateBindings(src);
  // Imported AND called, under the name it was actually bound to.
  return bindings.some((name) =>
    new RegExp(`(?<![.\\w$])${name}\\s*\\(`).test(src)
  );
}

/**
 * Entrypoints under app/api/** that are neither allowlisted nor gated by a
 * helper that actually REFUSES (see hasEnforcingGate).
 */
export function findUngatedApiEntrypoints(appRoot: string): string[] {
  const allowed = new Set(SESSION_FREE_API_ROUTES.map((r) => r.file));
  return findAppEntrypoints(appRoot)
    .filter((f) => rel(appRoot, f).startsWith("api/"))
    .filter((f) => !allowed.has(rel(appRoot, f)))
    .filter((f) => !hasEnforcingGate(f))
    .map((f) => rel(appRoot, f));
}

// ------------------------------------------------- ALL of app/, default-deny
//
// The three walks above each answer a question about a KNOWN PLACE: a gated
// route group, a protected URL prefix, `api/`. So an entrypoint at a new
// top-level URL OUTSIDE every group was seen by none of them — the tenancy
// gate planted `app/zzbrain5/page.tsx` and got 22/22 green while a keyless
// `next build` served `ƒ /zzbrain5` (phase-4 round-3 CHANGE 1). That is the M2
// filename that matters: `app/brain/page.tsx` would be ungated, unscoped, and
// would not even inherit `(product)/layout.tsx`'s requireUser().
//
// The entrypoint DEFINITION is derived (app-surface.ts); this makes its
// LOCATION derived too. Every entrypoint under app/ must now be one of:
//   - protected (its URL is under a PROTECTED_PREFIX) and importing a gate,
//   - an allowlisted session-free API route, or
//   - on PUBLIC_ENTRYPOINTS below, with its reason written down.
// Anything else fails. Adding a page is then a deliberate act in one of three
// lists, never a silent default-open.

/**
 * Entrypoints that are public BY DESIGN, each with why. A signed-out visitor
 * must be able to reach all of these; that is the whole product surface that
 * is legitimately un-gated at M1.
 */
const PUBLIC_ENTRYPOINTS: { file: string; why: string }[] = [
  {
    file: "(marketing)/page.tsx",
    why: "the marketing landing page — the first thing a signed-out visitor sees.",
  },
  {
    file: "(auth)/sign-in/page.tsx",
    why: "sign-in cannot require a session; it is how one is obtained.",
  },
  {
    file: "(auth)/sign-up/page.tsx",
    why: "sign-up cannot require a session; it is how an account is created.",
  },
];

/**
 * Entrypoints anywhere under app/ that are neither protected-and-gated, nor an
 * allowlisted session-free API route, nor an explicitly public page.
 */
export function findUnclassifiedEntrypoints(appRoot: string): string[] {
  const publicFiles = new Set(PUBLIC_ENTRYPOINTS.map((r) => r.file));
  const apiAllowed = new Set(SESSION_FREE_API_ROUTES.map((r) => r.file));
  return findAppEntrypoints(appRoot)
    .filter((f) => {
      const r = rel(appRoot, f);
      if (publicFiles.has(r) || apiAllowed.has(r)) return false;
      // Protected URLs are covered by findUnguarded (which also checks the
      // gate is actually imported); this walk is about entrypoints no list
      // mentions at all.
      if (isProtectedPath(urlForAppFile(appRoot, f))) return false;
      if (r.startsWith("api/")) return false; // findUngatedApiEntrypoints owns these
      return true;
    })
    .map((f) => rel(appRoot, f));
}

describe("the entrypoint definition is DERIVED (round-3 meta-finding)", () => {
  it("PAGE_EXTENSIONS comes from the installed Next, and matches the set this repo was written against", () => {
    // The derivation must have actually produced something: a moved internal
    // path returning undefined would make every walk below vacuously empty.
    expect(Array.isArray(NEXT_DEFAULT_PAGE_EXTENSIONS)).toBe(true);
    expect(PAGE_EXTENSIONS.length).toBeGreaterThan(0);
    expect(
      [...PAGE_EXTENSIONS].sort(),
      "the installed Next's pageExtensions changed. The walk has ALREADY widened (it is derived) — re-read this file's fixtures and respin/eslint.config.mjs's globs, then update PINNED_PAGE_EXTENSIONS deliberately."
    ).toEqual([...PINNED_PAGE_EXTENSIONS].sort());
  });

  it("classifies by PROPERTY: page.ts / route.js are entrypoints, a `use server` module by ANY name is one, a layout is not", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-classify-"));
    const write = (p: string, body: string) => {
      const full = join(root, ...p.split("/"));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
      return full;
    };
    expect(classifyAppFile(write("a/page.ts", "export default () => null;\n"))).toBe(
      "url-entrypoint"
    );
    expect(classifyAppFile(write("b/page.jsx", "export default () => null;\n"))).toBe(
      "url-entrypoint"
    );
    expect(classifyAppFile(write("c/route.js", "export const GET = () => null;\n"))).toBe(
      "url-entrypoint"
    );
    expect(
      classifyAppFile(write("d/mutations.ts", '"use server";\nexport async function f(){}\n')),
      "a POST endpoint does not become safe by being called something else"
    ).toBe("server-actions");
    expect(classifyAppFile(write("e/layout.tsx", "export default () => null;\n"))).toBe(
      "layout-family"
    );
    expect(classifyAppFile(write("f/helper.ts", "export const x = 1;\n"))).toBe("module");
    // The metadata conventions are URL-addressable, so they are entrypoints —
    // default-deny for the first one M2 adds.
    expect(classifyAppFile(write("g/sitemap.ts", "export default () => [];\n"))).toBe(
      "url-entrypoint"
    );
    expect(METADATA_ROUTE_BASENAMES).toContain("sitemap");
  });

  it("`use server` is the FIRST DIRECTIVE, not a substring — the two prose mentions in this tree are the non-vacuity cases", () => {
    expect(isUseServerModule('"use server";\nexport async function f(){}')).toBe(true);
    expect(isUseServerModule("// leading comment\n'use server';\nexport async function f(){}")).toBe(
      true
    );
    expect(isUseServerModule("/* block */\n\"use server\";\n")).toBe(true);
    expect(isUseServerModule('// a `"use server"` file may export only async functions\nexport const x = 1;')).toBe(
      false
    );
    expect(isUseServerModule('"use client";\nexport const x = 1;')).toBe(false);
    // ...and the two real files that DISCUSS the directive are not actions.
    for (const f of [
      "(product)/billing-errors.ts",
      "(admin)/admin/config/config-form-state.ts",
    ]) {
      expect(
        classifyAppFile(join(appDir, ...f.split("/"))),
        `${f} mentions "use server" in prose only`
      ).toBe("module");
    }
  });
});

describe("gate completeness (derived from PROTECTED_PREFIXES)", () => {
  it("every protected entrypoint imports a gate helper (AC-10)", () => {
    expect(PROTECTED_PREFIXES.length).toBeGreaterThan(0);
    const protectedFiles = findAppEntrypoints(appDir).filter((f) =>
      isProtectedPath(urlForAppFile(appDir, f))
    );
    // Sanity: the suite is not vacuously green — M0 ships protected pages.
    expect(protectedFiles.length).toBeGreaterThan(0);
    expect(findUnguarded(appDir)).toEqual([]);
  });

  it("fails when a protected page lacks the gate helper (fixture proof)", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-gate-"));
    const bad = join(root, "(product)", "studio", "rogue");
    mkdirSync(bad, { recursive: true });
    writeFileSync(
      join(bad, "page.tsx"),
      "export default function Rogue(){ return null; }\n"
    );
    const unguarded = findUnguarded(root);
    expect(unguarded).toHaveLength(1);
    expect(unguarded[0]).toContain("rogue");
  });

  it("does not flag public files (auth API route, marketing, sign-in)", () => {
    expect(isProtectedPath("/api/auth/anything")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/sign-in")).toBe(false);
  });
});

// ---- M1 phase 4, AC-1 ----
//
// The walk above proves "every protected entrypoint imports SOME gate helper".
// That is necessary and not sufficient: an entrypoint can be added under a
// protected prefix and be seen by nobody, and a product page could import
// `requireAdmin` (or an admin page `requireUser`) and still satisfy the regex.
// So the pages this milestone adds are ALSO named here, with the gate each one
// must carry, and the derived set is asserted to equal the named set — a new
// protected entrypoint cannot ship without joining this fixture (CLAUDE.md
// 2026-08-10: a page that is not SEEN by the suite is present-and-unrun).
const NAMED_PROTECTED_PAGES: {
  file: string;
  url: string;
  gate: "requireUser" | "requireAdmin";
}[] = [
  { file: "(product)/studio/page.tsx", url: "/studio", gate: "requireUser" },
  { file: "(product)/usage/page.tsx", url: "/usage", gate: "requireUser" },
  {
    file: "(product)/settings/billing/page.tsx",
    url: "/settings/billing",
    gate: "requireUser",
  },
  // The two "use server" modules. They are POST endpoints in their own right —
  // a stable action id is invocable without their page ever rendering — so each
  // carries its own gate, above its own try (round-2 CHANGE 1 and 2).
  {
    file: "(product)/settings/billing/actions.ts",
    url: "/settings/billing",
    gate: "requireUser",
  },
  { file: "(admin)/admin/page.tsx", url: "/admin", gate: "requireAdmin" },
  {
    file: "(admin)/admin/config/page.tsx",
    url: "/admin/config",
    gate: "requireAdmin",
  },
  {
    file: "(admin)/admin/config/actions.ts",
    url: "/admin/config",
    gate: "requireAdmin",
  },
];

describe("named gate fixture (M1 phase 4, AC-1)", () => {
  it.each(NAMED_PROTECTED_PAGES)(
    "$file is under a protected prefix and carries $gate",
    ({ file, url, gate }) => {
      const full = join(appDir, ...file.split("/"));
      const source = readFileSync(full, "utf8");
      expect(isProtectedPath(url), `${url} must be protected`).toBe(true);
      // Imported from @respin/auth by NAME (not merely mentioned) ...
      expect(
        new RegExp(
          String.raw`import\s+\{[^}]*\b${gate}\b[^}]*\}\s+from\s+["']@respin/auth["']`
        ).test(source),
        `${file} must import ${gate} from @respin/auth`
      ).toBe(true);
      // ... and actually CALLED. An unused import is not a gate.
      expect(
        new RegExp(String.raw`\b${gate}\s*\(`).test(source),
        `${file} must call ${gate}()`
      ).toBe(true);
    }
  );

  it("the fixture is EXHAUSTIVE: every protected entrypoint on disk is named above", () => {
    const onDisk = findAppEntrypoints(appDir)
      .filter((f) => isProtectedPath(urlForAppFile(appDir, f)))
      .map((f) => rel(appDir, f))
      .sort();
    const named = NAMED_PROTECTED_PAGES.map((p) => p.file).sort();
    expect(
      onDisk,
      "a protected entrypoint exists that this fixture does not name — add it (with its gate) rather than relying on the regex walk alone"
    ).toEqual(named);
  });

  it("DEFAULT-DENY: every entrypoint in (product)/(admin) maps to a PROTECTED url", () => {
    // The direction the rest of this file cannot see: not "is this protected
    // file gated" but "is every file that ought to be protected, protected".
    expect(
      findUngatedGroupFiles(appDir).map((f) => rel(appDir, f)),
      "a product/admin entrypoint sits at a URL no PROTECTED_PREFIX covers — add the prefix to lib/routes.ts (the layout is not the gate: client navigation caches it)"
    ).toEqual([]);
  });

  it("fails when a product page is added at an UNLISTED url — INCLUDING as page.ts (fixture proof)", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-prefix-"));
    // The exact probes the tenancy gate ran. `page.tsx` was caught; `page.ts`
    // and the admin `page.ts` were NOT, because the walk matched filenames.
    for (const [dir, file] of [
      ["zzbrain", "page.tsx"],
      ["zzbrain2", "page.ts"],
      ["zzbrain3", "page.jsx"],
    ] as const) {
      const d = join(root, "(product)", dir);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, file), "export default function B(){ return null; }\n");
    }
    const admin = join(root, "(admin)", "admin", "zztools");
    mkdirSync(admin, { recursive: true });
    writeFileSync(join(admin, "page.ts"), "export default function T(){ return null; }\n");

    const found = findUngatedGroupFiles(root).map((f) => rel(root, f)).sort();
    expect(found).toEqual([
      "(product)/zzbrain/page.tsx",
      "(product)/zzbrain2/page.ts",
      "(product)/zzbrain3/page.jsx",
    ]);
    // `/admin/zztools` IS under a protected prefix, so it is not a default-deny
    // offender — it is an UNGUARDED one, and the other walk must say so.
    expect(findUnguarded(root).map((f) => rel(root, f))).toEqual([
      "(admin)/admin/zztools/page.ts",
    ]);
  });

  it("fails when an UNGATED server-action module is added under a protected prefix, WHATEVER it is called (fixture proof)", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-action-"));
    const dir = join(root, "(product)", "settings", "profile");
    mkdirSync(dir, { recursive: true });
    // The M2 shape the walk could not see: a mutation invocable by POST with a
    // stable action id, scoping off caller-supplied input, and no gate. The
    // billing gate defeated the old walk by renaming this to mutations.ts.
    for (const name of ["actions.ts", "mutations.ts", "save.tsx"]) {
      writeFileSync(
        join(dir, name),
        '"use server";\nexport async function saveProfile(fd: FormData) { return fd.get("uid"); }\n'
      );
    }
    expect(findUnguarded(root).map((f) => rel(root, f)).sort()).toEqual([
      "(product)/settings/profile/actions.ts",
      "(product)/settings/profile/mutations.ts",
      "(product)/settings/profile/save.tsx",
    ]);
  });

  it("the URLs this phase adds really are protected (and look-alikes are not)", () => {
    expect(isProtectedPath("/usage")).toBe(true);
    expect(isProtectedPath("/settings")).toBe(true);
    expect(isProtectedPath("/settings/billing")).toBe(true);
    expect(isProtectedPath("/admin/config")).toBe(true);
    expect(isProtectedPath("/usages")).toBe(false);
    expect(isProtectedPath("/settingsx")).toBe(false);
  });
});

describe("app/api default-deny (round-3 NOTE: the walk excluded it entirely)", () => {
  it("every API entrypoint is either session-gated or on the explicit session-free allowlist", () => {
    expect(
      findUngatedApiEntrypoints(appDir),
      "an app/api route has no session gate and is not on SESSION_FREE_API_ROUTES — gate it, or add it to that list WITH the mechanism that authenticates it instead"
    ).toEqual([]);
  });

  it("the allowlist is not stale: every file it names exists and really carries no gate", () => {
    expect(SESSION_FREE_API_ROUTES.length).toBeGreaterThan(0);
    for (const { file, why } of SESSION_FREE_API_ROUTES) {
      const src = readFileSync(join(appDir, ...file.split("/")), "utf8");
      expect(why.length).toBeGreaterThan(20);
      expect(
        GATE_IMPORT.test(src),
        `${file} now imports a gate helper — take it off the session-free allowlist`
      ).toBe(false);
    }
  });

  it("fails when a NEW api route is added with no gate and no allowlist entry (fixture proof)", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-api-"));
    // The tenancy gate's probe: a cross-workspace reader at a URL nothing
    // covers. It passed 29/29 green with lint exit 0.
    const dir = join(root, "api", "zzbrain");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "route.ts"),
      "export async function GET() { return Response.json({ everyWorkspace: true }); }\n"
    );
    // ...and a `use server` module under api/, which is the same hole again.
    writeFileSync(
      join(dir, "mutations.ts"),
      '"use server";\nexport async function wipe() {}\n'
    );
    expect(findUngatedApiEntrypoints(root).sort()).toEqual([
      "api/zzbrain/mutations.ts",
      "api/zzbrain/route.ts",
    ]);
  });

  it("...and a GATED api route is NOT reported (the deny is default-deny, not a blanket ban)", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-api-ok-"));
    const dir = join(root, "api", "zzreport");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "route.ts"),
      'import { requireUser } from "@respin/auth";\nexport async function GET() { await requireUser(); return Response.json({}); }\n'
    );
    expect(findUngatedApiEntrypoints(root)).toEqual([]);
  });

  it("the gate must REFUSE: getSessionUser returns null, so importing (or even calling) it is not a gate", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-api-ghost-"));
    const write = (p: string, body: string) => {
      const full = join(root, "api", ...p.split("/"));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    };
    // The round-4 probe, verbatim: it imports AND calls a session reader, then
    // answers anyway. `withWorkspace` takes `authUserId: string`, so this shape
    // can serve a correctly-filtered read of ANOTHER tenant's workspace.
    write(
      "zzghost/route.ts",
      'import { getSessionUser } from "@respin/auth";\n' +
        "export async function GET() {\n" +
        "  const user = await getSessionUser();\n" +
        "  return Response.json({ caller: user?.id ?? null, everyWorkspace: true });\n" +
        "}\n"
    );
    // Imported but never called is not a gate either.
    write(
      "zzimport-only/route.ts",
      'import { requireUser } from "@respin/auth";\nexport async function GET() { return Response.json({}); }\n'
    );
    // ...nor is the name appearing only in a comment (the comment-satisfiable trap).
    write(
      "zzcomment/route.ts",
      "// this route is safe because requireUser() runs in middleware\nexport async function GET() { return Response.json({}); }\n"
    );
    expect(findUngatedApiEntrypoints(root).sort()).toEqual([
      "api/zzcomment/route.ts",
      "api/zzghost/route.ts",
      "api/zzimport-only/route.ts",
    ]);
  });

  it("resolves the IMPORT BINDING, not the name: an aliased non-gate is caught, an aliased real gate is not", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-api-alias-"));
    const write = (p: string, body: string) => {
      const full = join(root, "api", ...p.split("/"));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    };
    // The round-5 probe: the round-4 defect wearing the gate's NAME. Both
    // halves of a name-matching predicate pass, and it refuses nobody.
    write(
      "zzalias2/route.ts",
      'import { getSessionUser as requireUser } from "@respin/auth";\n' +
        "export async function GET() { await requireUser(); return Response.json({ everyWorkspace: true }); }\n"
    );
    // ...and the false positive the same round found: a genuinely gated route
    // that a name-matching predicate reported as ungated.
    write(
      "zzalias-ok/route.ts",
      'import { requireUser as ru } from "@respin/auth";\nexport async function GET() { await ru(); return Response.json({}); }\n'
    );
    // A type-only import binds nothing at runtime and cannot refuse anyone.
    write(
      "zztype/route.ts",
      'import type { requireUser } from "@respin/auth";\nexport async function GET() { return Response.json({}); }\n'
    );
    // A METHOD call on some other object is not our gate, even when the real
    // helper is imported beside it — the binding must be called bare.
    write(
      "zzobj/route.ts",
      'import { requireUser } from "@respin/auth";\nconst auth = { requireUser: async () => null };\nexport async function GET() { await auth.requireUser(); return Response.json({}); }\n'
    );
    expect(findUngatedApiEntrypoints(root).sort()).toEqual([
      "api/zzalias2/route.ts",
      "api/zzobj/route.ts",
      "api/zztype/route.ts",
    ]);
  });
});

describe("ALL of app/ is default-deny (phase-4 round-3 CHANGE 1)", () => {
  it("every entrypoint under app/ is protected, session-free-by-allowlist, or explicitly public", () => {
    expect(
      findUnclassifiedEntrypoints(appDir),
      "an entrypoint under app/ belongs to no list: it is not under a PROTECTED_PREFIX, not an allowlisted session-free API route, and not on PUBLIC_ENTRYPOINTS. Add its URL to lib/routes.ts (and gate it), or record it as public WITH a reason."
    ).toEqual([]);
  });

  it("the public allowlist is not stale: every file it names exists, and none of them is secretly gated", () => {
    expect(PUBLIC_ENTRYPOINTS.length).toBeGreaterThan(0);
    for (const { file, why } of PUBLIC_ENTRYPOINTS) {
      const full = join(appDir, ...file.split("/"));
      expect(
        classifyAppFile(full),
        `${file} is on PUBLIC_ENTRYPOINTS but is not an entrypoint any more — remove the stale entry`
      ).toBe("url-entrypoint");
      expect(why.length).toBeGreaterThan(20);
      expect(
        isProtectedPath(urlForAppFile(appDir, full)),
        `${file} is now under a PROTECTED_PREFIX — take it off PUBLIC_ENTRYPOINTS`
      ).toBe(false);
    }
  });

  it("catches a page at a NEW TOP-LEVEL URL outside every route group — the M2 `app/brain/page.tsx` shape", () => {
    const root = mkdtempSync(join(tmpdir(), "respin-toplevel-"));
    // The tenancy gate's probe: 22/22 green, and `next build` served /zzbrain5.
    for (const p of ["zzbrain5/page.tsx", "zzbrain6/page.ts", "zztools/mutations.ts"]) {
      const full = join(root, ...p.split("/"));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(
        full,
        p.endsWith("mutations.ts")
          ? '"use server";\nexport async function f(){}\n'
          : "export default () => null;\n"
      );
    }
    expect(findUnclassifiedEntrypoints(root).sort()).toEqual([
      "zzbrain5/page.tsx",
      "zzbrain6/page.ts",
      "zztools/mutations.ts",
    ]);
  });

  it("a metadata route under a PROTECTED prefix is an entrypoint — INCLUDING Next's numeric variants", () => {
    // Next builds every image/sitemap matcher with `variantsMatcher = '\\d?'`
    // (lib/metadata/is-metadata-route.js), so an exact-basename list missed
    // `opengraph-image2` — planted, it classified as "module" while a keyless
    // build served /usage/opengraph-image2-1m8hwu (round-3 CHANGE 2).
    const root = mkdtempSync(join(tmpdir(), "respin-metadata-"));
    const write = (p: string) => {
      const full = join(root, ...p.split("/"));
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, "export default () => null;\n");
      return full;
    };
    for (const base of METADATA_ROUTE_BASENAMES) {
      expect(classifyAppFile(write(`m-${base}/${base}.tsx`)), `${base} is a metadata route`).toBe(
        "url-entrypoint"
      );
    }
    // The half the literal list cannot spell. Only the four
    // STATIC_METADATA_IMAGES matchers take the `\d?` variant suffix...
    for (const p of ["v1/opengraph-image2.tsx", "v2/icon2.tsx", "v3/apple-icon3.tsx"]) {
      expect(
        classifyAppFile(write(p)),
        `${p} is a Next metadata VARIANT and is URL-addressable`
      ).toBe("url-entrypoint");
    }
    // ...and `sitemap` does NOT, which is the half the round-3 comment got
    // wrong. Asserted so the corrected claim is a property, not prose.
    expect(
      classifyAppFile(write("v5/sitemap2.tsx")),
      "sitemap takes no variant suffix in Next — sitemap2 is an ordinary module"
    ).toBe("module");
    // ...and a file that merely starts with a metadata name is NOT one.
    expect(classifyAppFile(write("v4/iconography.tsx"))).toBe("module");
  });
});

// Respin's own ESLint config, pinned inside respin/ deliberately: a nested
// self-rooted project with "no config" silently inherits the enclosing repo's
// (CLAUDE.md lesson 2026-08-02). Nothing here references anything above respin/.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * The app-side default-deny rule value, built by ONE function so every
 * override cannot drift from the base (M1 phase 3 task 8b).
 * `adminSurface: true` additionally admits @respin/config/admin-server —
 * the global config WRITE entrypoint, admin routes only (tenancy round 2).
 * `webhookSurface: true` additionally admits @respin/credits/webhook-server —
 * the Stripe event dispatcher, `app/api/stripe/webhook/route.ts` EXACTLY
 * (narrowed from the subtree in phase-4 round 3: a nested helper could
 * otherwise re-export the SDK and a sibling could import the helper),
 * because dispatching an event is only legitimate BEHIND the signature check.
 */
const STRIPE_SDK_DENY =
  "app/** never constructs a Stripe client — every Stripe call goes through @respin/credits/app-server, which owns the lazy adapter, the pinned API version and the keyless refusal (AC-9). The ONE exception is app/api/stripe/webhook/route.ts EXACTLY, which needs the static Stripe.webhooks.constructEvent signature check (no API key, keyless-build safe); the grant is that single file, not the subtree, so a helper beside it cannot re-export the SDK.";

function appRestrictedImports({ adminSurface = false, webhookSurface = false } = {}) {
  return [
    "error",
    {
      paths: [
        {
          name: "@respin/db",
          allowImportNames: [
            "respinDb",
            "WorkspaceAccessError",
            // types only below
            "Db",
            "DbLike",
            "User",
            "Workspace",
            "Membership",
            "MembershipRole",
            "BootstrapParams",
            "BootstrapResult",
            "WorkspaceCtx",
            "WorkspaceScope",
            "VerifiedWorkspaceId",
          ],
          message:
            "app/** may import only the sanctioned @respin/db surface (respinDb, WorkspaceAccessError, types) — every query goes through withWorkspace (tenancy T1)",
        },
        {
          name: "@respin/auth",
          allowImportNames: [
            "getSessionUser",
            "requireUser",
            "requireAdmin",
            "authHandlers",
            "isGoogleConfigured",
            "adminAllowed",
            "parseAdminAllowlist",
            // types
            "SessionUser",
          ],
          message:
            "app/** may import only the sanctioned @respin/auth surface — createAuth/getAuth (the raw instance) stay package-only; client components use @respin/auth/client",
        },
        {
          name: "@respin/credits",
          message:
            "app/** never imports the raw @respin/credits root — use the wired facade @respin/credits/app-server (tenancy T1, M1 phase 3 task 8b)",
        },
        {
          name: "@respin/config",
          message:
            "app/** never imports the raw @respin/config root — use @respin/config/app-server (reads) or, from app/(admin) only, @respin/config/admin-server (writes)",
        },
        // The cage denied every DOMAIN route to Stripe and left the SDK itself
        // wide open (round-2 CHANGE 5). `stripe` is a direct dependency of the
        // app package, so `new Stripe(process.env.STRIPE_SECRET_KEY!)` in a
        // server action lint-passed, bypassed the adapter's pinned API version
        // and `isStripeConfigured()`'s keyless refusal, read the secret at the
        // page layer, and was invisible to the AC-9 "only getStripe constructs
        // a client" scan, which walks packages/credits/src only.
        //
        // `webhookSurface` re-admits it for the ONE file that needs the static
        // `Stripe.webhooks.constructEvent` signature check — that helper needs
        // no API key and is what makes the route trustworthy in the first place.
        ...(webhookSurface
          ? []
          : [
              {
                name: "stripe",
                message: STRIPE_SDK_DENY,
              },
            ]),
      ],
      patterns: [
        {
          // THE SPECIFIER-SHAPE HOLE (tenancy round 4 CHANGE). Every rule
          // above is anchored to a `@respin/…` package name, so all of them
          // were bypassable by spelling the same module as a path:
          //   import { createDb } from "@/packages/db/src/client"
          //   import { trustWorkspaceId } from "../../packages/db/src/with-workspace"
          // Both resolve (tsconfig maps `@/*` → `./*`), and neither is a
          // `@respin/*` specifier, so no rule fired. That reached the raw
          // connection, the non-session workspace-id mint, the raw tables, the
          // Stripe dispatcher and the admin config write — i.e. the whole cage.
          //
          // This is the 2026-08-02/07-30 lesson in one line: round 3 fixed the
          // FIELD (dynamic import of @respin names) and not the CLASS
          // (specifier shape). app/ and lib/ have no legitimate reason to
          // reach a package by path, so the deny is blanket.
          group: [
            "packages/*",
            "packages/**",
            "@/packages/*",
            "@/packages/**",
            "**/packages/*",
            "**/packages/**",
          ],
          message:
            "app/** and lib/** reach packages ONLY through their @respin/* package names, so the sanctioned-surface rules apply — a relative or @/-aliased path into packages/ bypasses every one of them (tenancy T1)",
        },
        {
          // Deep spellings of the same SDK (`stripe/lib/...`), denied even in
          // the webhook route: the sanctioned surface there is the package
          // root's static webhook helper, not its internals.
          group: ["stripe/*"],
          message: STRIPE_SDK_DENY,
        },
        {
          group: ["@respin/db/*"],
          message:
            "no deep imports into @respin/db from app/** — the package root's sanctioned surface is the only door (tenancy T1)",
        },
        {
          group: ["@respin/auth/*", "!@respin/auth/client"],
          message:
            "the only sanctioned deep import into @respin/auth is ./client (the browser entrypoint)",
        },
        {
          group: webhookSurface
            ? [
                "@respin/credits/*",
                "!@respin/credits/app-server",
                "!@respin/credits/webhook-server",
              ]
            : ["@respin/credits/*", "!@respin/credits/app-server"],
          message: webhookSurface
            ? "sanctioned @respin/credits entrypoints here: ./app-server (the wired facade) and ./webhook-server (the Stripe dispatcher, behind the signature check)"
            : "the only sanctioned deep import into @respin/credits is ./app-server (the wired facade) — ./webhook-server dispatches Stripe events and is app/api/stripe/** only",
        },
        {
          group: adminSurface
            ? [
                "@respin/config/*",
                "!@respin/config/app-server",
                "!@respin/config/admin-server",
              ]
            : ["@respin/config/*", "!@respin/config/app-server"],
          message: adminSurface
            ? "sanctioned @respin/config entrypoints here: ./app-server (reads) and ./admin-server (admin writes)"
            : "the only sanctioned @respin/config entrypoint outside app/(admin) is ./app-server — the WRITE surface (./admin-server) is admin-only",
        },
      ],
    },
  ];
}

export default tseslint.config(
  {
    ignores: [".next/**", "node_modules/**", "**/node_modules/**", "next-env.d.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // tech-spec §1: app/ imports from packages/; packages never import from app/.
    // PLUS the trustWorkspaceId cage (tenancy plan-gate finding 4): the
    // non-session mint is importable ONLY from the named sanctioned files
    // (Stripe webhook resolution) and tests — an ALLOWLIST of files, not a
    // deny-list of app/**. The sanctioned files get their own block below.
    files: ["packages/**/*.ts", "packages/**/*.tsx"],
    ignores: [
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
      "packages/*/tests/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@respin/db",
              importNames: ["trustWorkspaceId"],
              message:
                "trustWorkspaceId mints a VerifiedWorkspaceId WITHOUT session verification — only the Stripe webhook resolution files (packages/credits/src/stripe/{webhooks,customers}.ts) and tests may import it (tenancy T1)",
            },
          ],
          patterns: [
            {
              group: ["**/app/**", "@/app/**"],
              message:
                "packages/ must never import from app/ (tech-spec §1 import-direction rule)",
            },
          ],
        },
      ],
    },
  },
  {
    // The sanctioned trustWorkspaceId call sites: the import-direction rule
    // still binds; only the trustWorkspaceId path restriction is lifted.
    files: [
      "packages/credits/src/stripe/webhooks.ts",
      "packages/credits/src/stripe/customers.ts",
      "packages/*/tests/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/app/**", "@/app/**"],
              message:
                "packages/ must never import from app/ (tech-spec §1 import-direction rule)",
            },
          ],
        },
      ],
    },
  },
  // T1 default-deny (respin-brain-tenancy; plan-review finding 5): app code
  // may import ONLY the sanctioned package surfaces. allowImportNames makes
  // this an allowlist — an export added in M1 stays unimportable from app/**
  // by default. createDb + drizzle's sql tag would bypass withWorkspace with
  // zero schema imports, so the connection is denied here too — by BOTH
  // package name and path spelling. Stated precisely, because a claim is only
  // worth what enforces it: THIS rule sees static `import`/`export … from`
  // only. ESLint's no-restricted-imports registers no ImportExpression
  // handler, so `await import(...)` is invisible to it and is covered instead
  // by the source scan in tests/import-boundary.test.ts. Two mechanisms, both
  // asserted; neither one alone is "unreachable".
  // Scope is EVERYTHING except packages/** and tests/**. The rule value is
  // built by ONE function so the app/(admin) override cannot drift from the
  // base (M1 phase 3 task 8b): `adminSurface` additionally admits the config
  // WRITE entrypoint (@respin/config/admin-server) — admin routes only.
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["packages/**", "tests/**"],
    rules: {
      "no-restricted-imports": appRestrictedImports(),
    },
  },
  {
    // app/(admin)/** — same rule via the same builder, plus the config WRITE
    // entrypoint. Never widened elsewhere.
    files: ["app/(admin)/**/*.ts", "app/(admin)/**/*.tsx"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ adminSurface: true }),
    },
  },
  {
    // app/api/stripe/webhook/route.ts — THE ONE FILE, not a subtree. Same rule
    // via the same builder, plus the Stripe SDK and the event dispatcher.
    //
    // Round 2 scoped this to `app/api/stripe/**` → `app/api/stripe/webhook/**`,
    // which is still a subtree: a helper module beside the route inherits both
    // grants, and `export * from "stripe"` there would re-export the SDK to any
    // sibling that imports `@/app/api/stripe/webhook/helper` (probe-confirmed
    // ALLOWed, round-3 NOTE). Only `route.ts` exists today and only `route.ts`
    // performs the signature check that makes dispatch legitimate, so the grant
    // is exactly `route.ts`. A future helper must either be gate-free or get
    // its own named entry here — a deliberate act, with a deny fixture at
    // app/api/stripe/webhook/helper.ts proving the default.
    files: ["app/api/stripe/webhook/route.ts"],
    rules: {
      "no-restricted-imports": appRestrictedImports({ webhookSurface: true }),
    },
  }
);

// GENERATION-ONLY config for Better Auth's schema generator (phase-1 task 1).
// Lives in packages/auth (which owns the better-auth dependency and typechecks
// this file — code-gate note). Schema regeneration, from respin/:
//   pnpm dlx auth@1.6.28 generate --config packages/auth/better-auth.cli.ts --output .tmp/auth-schema.generated.ts -y
//
// THE GENERATOR IS PINNED to the installed `better-auth` version (P9-R11;
// bump the two together). From the 1.6 line the CLI is the `auth` package,
// which depends on `better-auth` at exactly its own version; the unpinned
// `@better-auth/cli` this comment used to name stops at 1.4.x on npm, so it
// fetched whatever 1.4 release was latest and generated against an older
// Better Auth. Measured 2026-10-05: `auth@1.6.28` accepts these flags and
// writes a schema.
//
// IT WRITES TO A SCRATCH PATH, NOT OVER packages/db/src/auth-schema.ts. That
// file carries hand-added columns and a table the generator does not produce
// (`ordinaryLoginDisabledAt`, `reauthenticatedAt`, the `rateLimit` table), so
// writing the generator's output over it would delete them. Diff the scratch
// output against it and merge by hand.
// Options here must mirror createAuth's feature set (email+password, Google) —
// they determine which tables/columns are generated. The dummy adapter DB is
// never connected; generation only reads the options.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: { clientId: "generation-placeholder", clientSecret: "generation-placeholder" },
  },
});

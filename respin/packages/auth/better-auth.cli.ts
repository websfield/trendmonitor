// GENERATION-ONLY config for `@better-auth/cli generate` (phase-1 task 1).
// Lives in packages/auth (which owns the better-auth dependency and typechecks
// this file — code-gate note). Schema regeneration, from respin/:
//   pnpm dlx @better-auth/cli generate --config packages/auth/better-auth.cli.ts --output packages/db/src/auth-schema.ts -y
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

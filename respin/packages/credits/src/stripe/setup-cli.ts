// CLI entrypoint for the setup script. It needs DATABASE_URL as well as
// STRIPE_SECRET_KEY now: the pack price comes from the active config, which is
// also what makes re-running this the divergence check between the Stripe pack
// price and `pack.priceUsd` (billing round-7 CHANGE 4).
import { createDb } from "@respin/db";
import { stripeSetup } from "./setup";

/**
 * REQUIRED_ENV is checked here, together, BEFORE anything is constructed
 * (tenancy round-10 CHANGE 2). Two defects lived in the one line this
 * replaces:
 *
 *  1. `createDb(process.env.DATABASE_URL)` was evaluated as an ARGUMENT, so
 *     its synchronous throw happened before `.catch()` was attached — the
 *     operator got a raw Node stack trace, not the typed remedy. Phase-3
 *     Verification Step 6 requires "a clean typed error naming the missing
 *     env (never a stack trace) — tested by running it", and `setup.test.ts`
 *     exercises `stripeSetup(db)` only: present-and-unrun.
 *  2. Even fixed, a DB-first construction told a cold operator about
 *     DATABASE_URL and never mentioned STRIPE_SECRET_KEY, so the remedy in
 *     setup.ts became unreachable for the person who needs it most. Naming
 *     BOTH missing variables in one message is the only version that ends
 *     the operator's guessing in one run.
 */
const REQUIRED_ENV = ["STRIPE_SECRET_KEY", "DATABASE_URL"] as const;

async function main(): Promise<void> {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `stripe:setup needs ${missing.join(" and ")} — not set. STRIPE_SECRET_KEY is a test-mode secret key from the Stripe dashboard; DATABASE_URL points at the database holding the active config (the pack price is created at its \`pack.priceUsd\`). Run:\n  STRIPE_SECRET_KEY=sk_test_... DATABASE_URL=postgres://... pnpm stripe:setup`
    );
  }
  await stripeSetup(createDb(process.env.DATABASE_URL));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

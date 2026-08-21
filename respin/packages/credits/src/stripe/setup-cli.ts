// CLI entrypoint for the setup script. It needs DATABASE_URL as well as
// STRIPE_SECRET_KEY now: the pack price comes from the active config, which is
// also what makes re-running this the divergence check between the Stripe pack
// price and `pack.priceUsd` (billing round-7 CHANGE 4).
import { fileURLToPath } from "node:url";
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

/**
 * Load `respin/.env.local` the way the README says this script works.
 *
 * Found by RUNNING the runbook (evidence run, 2026-08-17): README Services step
 * 4.1 says "put it in .env.local … Success check: `pnpm stripe:setup` no longer
 * prints the 'not set' remedy", and that was false. Only Next reads `.env.local`;
 * nothing in this repo loaded it for a CLI, so the operator did exactly what the
 * doc said and still hit the refusal — a success check that cannot succeed.
 *
 * `process.loadEnvFile` is Node's own loader (>=20.12; this package requires
 * node >=22), so no dependency. It never OVERWRITES an already-set variable, so
 * `STRIPE_SECRET_KEY=sk_test_... pnpm stripe:setup` still wins — and a missing
 * file is not an error here, because passing the env inline is a supported way
 * to run this and the typed refusal below is what reports a genuinely absent
 * variable.
 */
function loadDotEnvLocal(): void {
  // `RESPIN_ENV_FILE` names the file to load. It exists because the degraded-path
  // tests must be able to run this CLI with NOTHING loaded: on a developer's
  // machine `.env.local` is present and full, so without an override those tests
  // would silently stop exercising the refusal they exist to prove — passing in
  // CI (no .env.local) and proving nothing locally, which is the
  // present-and-unrun shape this repo keeps catching. Pointing it at a
  // non-existent path is how a caller says "load nothing".
  const target =
    process.env.RESPIN_ENV_FILE ??
    fileURLToPath(new URL("../../../../.env.local", import.meta.url));
  try {
    process.loadEnvFile(target);
  } catch {
    // No such file (CI, or env supplied inline) — REQUIRED_ENV reports what is
    // actually missing, with its remedy.
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
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

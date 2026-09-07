// Operator entrypoint for converging durable v1 attempts after lost webhooks.
import { createDb } from "@respin/db";
import { reconcileBoundAutoTopupAttempts } from "./auto-topup-v1-reconcile";

function required(
  name:
    | "DATABASE_URL"
    | "STRIPE_SECRET_KEY"
    | "RESPIN_AUTO_TOPUP_AUTHORITY_KEY"
    | "RESPIN_STRIPE_ACCOUNT_ID"
    | "RESPIN_STRIPE_LIVEMODE"
): string {
  const value = process.env[name];
  if (!value) throw new Error(`stripe:auto-topup:reconcile-v1 requires ${name}`);
  return value;
}

async function main(): Promise<void> {
  required("STRIPE_SECRET_KEY");
  required("RESPIN_AUTO_TOPUP_AUTHORITY_KEY");
  required("RESPIN_STRIPE_ACCOUNT_ID");
  required("RESPIN_STRIPE_LIVEMODE");
  const db = createDb(required("DATABASE_URL"));
  try {
    const report = await reconcileBoundAutoTopupAttempts(db);
    console.log(JSON.stringify(report, null, 2));
    if (!report.clear) {
      const awaitingVisibility = report.attempts.filter(
        (attempt) => attempt.outcome === "awaiting_provider_visibility"
      ).length;
      const awaitingTerminal = report.attempts.filter(
        (attempt) => attempt.outcome === "awaiting_provider_terminal"
      ).length;
      throw new Error(
        `${awaitingVisibility} attempt(s) are awaiting provider visibility; ${awaitingTerminal} attempt(s) are awaiting a terminal Stripe status`
      );
    }
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "auto-top-up v1 reconciliation failed"
  );
  process.exitCode = 1;
});

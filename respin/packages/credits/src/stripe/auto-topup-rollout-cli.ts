// Operator-only protocol-0 -> durable-attempt cutover. This is deliberately a
// single cutover command: ingress and the old fleet stay stopped while the DB
// fence, complete paginated Stripe audit, and activation run to completion.
import { createDb } from "@respin/db";
import {
  activateAutoTopupAttemptProtocol,
  auditAutoTopupLegacyDrain,
  beginAutoTopupProtocolDrain,
  getAutoTopupProtocolRollout,
  LEGACY_AUTO_TOPUP_QUIESCENCE_MS,
  restartAutoTopupProtocolDrain,
} from "./auto-topup-rollout";
import { reconcileMissingLegacyAutoTopups } from "./auto-topup-rollout-reconcile";

type OperatorDb = ReturnType<typeof createDb>;

async function closePool(db: OperatorDb): Promise<void> {
  await db.$client.end();
}

function required(name: "DATABASE_URL" | "STRIPE_SECRET_KEY" | "RESPIN_AUTO_TOPUP_AUTHORITY_KEY" | "RESPIN_STRIPE_ACCOUNT_ID" | "RESPIN_STRIPE_LIVEMODE"): string {
  const value = process.env[name];
  if (!value) throw new Error(`stripe:auto-topup:rollout requires ${name}`);
  return value;
}

function quiescedAtArg(): Date {
  const prefix = "--fleet-quiesced-at=";
  const raw = process.argv.slice(3).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!raw) {
    throw new Error(
      `cutover requires --fleet-quiesced-at=<UTC ISO timestamp>; stop every ingress/old-fleet process, record the instant, and wait at least ${LEGACY_AUTO_TOPUP_QUIESCENCE_MS}ms before running this command`
    );
  }
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new Error("--fleet-quiesced-at is not a valid timestamp");
  return value;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || !["status", "audit", "cutover", "restart-drain"].includes(command)) {
    throw new Error(
      "usage: pnpm stripe:auto-topup:rollout -- <status|audit|cutover|restart-drain> [--fleet-quiesced-at=<UTC ISO>]"
    );
  }
  const db = createDb(required("DATABASE_URL"));
  try {
    if (command === "status") {
      console.log(JSON.stringify(await getAutoTopupProtocolRollout(db), null, 2));
      return;
    }
    required("STRIPE_SECRET_KEY");
    required("RESPIN_AUTO_TOPUP_AUTHORITY_KEY");
    required("RESPIN_STRIPE_ACCOUNT_ID");
    required("RESPIN_STRIPE_LIVEMODE");
    if (command === "audit") {
      console.log(JSON.stringify(await auditAutoTopupLegacyDrain(db), null, 2));
      return;
    }
    if (command === "restart-drain") {
      console.log(
        JSON.stringify(
          await restartAutoTopupProtocolDrain(db, quiescedAtArg()),
          null,
          2
        )
      );
      return;
    }
    await beginAutoTopupProtocolDrain(db, quiescedAtArg());
    const recovered = await reconcileMissingLegacyAutoTopups(db);
    if (!recovered.report.clear) {
      throw new Error(
        `cutover remains blocked by ${recovered.report.blockers.length} legacy PaymentIntent(s): ${recovered.report.blockers
          .map((blocker) => `${blocker.paymentIntentId}:${blocker.reason}`)
          .join(", ")}`
      );
    }
    const active = await activateAutoTopupAttemptProtocol(db);
    console.log(JSON.stringify(active, null, 2));
  } finally {
    await closePool(db);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "auto-top-up rollout failed");
  process.exitCode = 1;
});

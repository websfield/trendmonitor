// Operator-only legacy -> durable tier-Checkout cutover. Keep ingress and the
// old app/webhook fleet stopped from `begin` through successful `activate`.
import { createDb } from "@respin/db";
import {
  activateTierCheckoutAttemptProtocol,
  auditTierCheckoutLegacyDrain,
  beginTierCheckoutProtocolDrain,
  getTierCheckoutProtocolRollout,
  LEGACY_TIER_CHECKOUT_QUIESCENCE_MS,
  restartTierCheckoutProtocolDrain,
} from "./tier-checkout-rollout";
import { reconcileTierCheckoutV1Session } from "./tier-checkout-v1-reconcile";

type OperatorDb = ReturnType<typeof createDb>;

function required(
  name:
    | "DATABASE_URL"
    | "STRIPE_SECRET_KEY"
    | "RESPIN_STRIPE_ACCOUNT_ID"
    | "RESPIN_STRIPE_LIVEMODE"
): string {
  const value = process.env[name];
  if (!value) throw new Error(`stripe:tier-checkout:rollout requires ${name}`);
  return value;
}

function quiescedAtArg(): Date {
  const prefix = "--fleet-quiesced-at=";
  const raw = process.argv
    .slice(3)
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
  if (!raw) {
    throw new Error(
      `begin/restart requires --fleet-quiesced-at=<UTC ISO timestamp>; stop ingress and every old app/webhook process first, then keep them stopped for the ${LEGACY_TIER_CHECKOUT_QUIESCENCE_MS}ms database-authored drain window and provider audit`
    );
  }
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new Error("--fleet-quiesced-at is not a valid timestamp");
  }
  return value;
}

async function closePool(db: OperatorDb): Promise<void> {
  await db.$client.end();
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (
    !command ||
    ![
      "status",
      "begin",
      "audit",
      "activate",
      "restart-drain",
      "reconcile-active",
    ].includes(command)
  ) {
    throw new Error(
      "usage: pnpm stripe:tier-checkout:rollout -- <status|begin|audit|activate|restart-drain|reconcile-active> [--fleet-quiesced-at=<UTC ISO>] [--session-id=cs_...]"
    );
  }
  const db = createDb(required("DATABASE_URL"));
  try {
    if (command === "status") {
      console.log(JSON.stringify(await getTierCheckoutProtocolRollout(db), null, 2));
      return;
    }
    required("STRIPE_SECRET_KEY");
    required("RESPIN_STRIPE_ACCOUNT_ID");
    required("RESPIN_STRIPE_LIVEMODE");
    if (command === "begin") {
      console.log(
        JSON.stringify(
          await beginTierCheckoutProtocolDrain(db, quiescedAtArg()),
          null,
          2
        )
      );
      return;
    }
    if (command === "restart-drain") {
      console.log(
        JSON.stringify(
          await restartTierCheckoutProtocolDrain(db, quiescedAtArg()),
          null,
          2
        )
      );
      return;
    }
    if (command === "audit") {
      console.log(JSON.stringify(await auditTierCheckoutLegacyDrain(db), null, 2));
      return;
    }
    if (command === "reconcile-active") {
      const sessionId = process.argv
        .slice(3)
        .find((arg) => arg.startsWith("--session-id="))
        ?.slice("--session-id=".length);
      if (!sessionId) {
        throw new Error("reconcile-active requires --session-id=cs_...");
      }
      console.log(
        JSON.stringify(await reconcileTierCheckoutV1Session(db, sessionId), null, 2)
      );
      return;
    }
    console.log(
      JSON.stringify(await activateTierCheckoutAttemptProtocol(db), null, 2)
    );
  } finally {
    await closePool(db);
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "tier Checkout rollout failed"
  );
  process.exitCode = 1;
});

// Stripe webhook endpoint — the ONE non-session entry (D-M1-6). Thin by
// contract: raw body → signature verify → package handler. Authentication is
// the Stripe signature; the auth matchers exclude /api/* (routes.test.ts).
import Stripe from "stripe";
import {
  respinStripeWebhook,
  getWebhookSecret,
  DuplicateStripeEvent,
  StripeNotConfiguredError,
} from "@respin/credits/webhook-server";
import { rethrowNextControlFlow } from "../../../../lib/next-control-flow";

const STRIPE_WEBHOOK_MAX_BODY_BYTES = 1024 * 1024;

async function readBoundedBody(req: Request): Promise<string | null> {
  const declaredLength = req.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > STRIPE_WEBHOOK_MAX_BODY_BYTES
  ) {
    return null;
  }
  if (!req.body) return "";

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return body + decoder.decode();
      bytesRead += value.byteLength;
      if (bytesRead > STRIPE_WEBHOOK_MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });
  const body = await readBoundedBody(req);
  if (body === null) return new Response("payload too large", { status: 413 });

  let event: Stripe.Event;
  try {
    // ONE reader of the webhook secret (the adapter's), so the two cannot
    // drift apart on env name or refusal semantics (code-review NOTE).
    const secret = getWebhookSecret();
    // Static verification helper — needs no API key, keyless-build safe.
    event = Stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    rethrowNextControlFlow(err);
    if (err instanceof StripeNotConfiguredError) {
      return new Response("webhook secret not configured", { status: 500 });
    }
    // Unauthenticated payload: 400, and NO stripe_events row (nothing to make
    // idempotent — the event never authenticated).
    return new Response("invalid signature", { status: 400 });
  }

  try {
    const outcome = await respinStripeWebhook.handleEvent(event);
    return Response.json({ received: true, outcome });
  } catch (err) {
    rethrowNextControlFlow(err);
    if (err instanceof DuplicateStripeEvent) {
      return Response.json({ received: true, outcome: "duplicate" });
    }
    // Handler failure: the whole tx (incl. the event row) rolled back —
    // non-2xx makes Stripe redeliver (fail closed, self-healing).
    console.error(
      `[stripe-webhook] ${event.id} handler failed: ${err instanceof Error ? err.message : "unknown"}`
    );
    return new Response("handler error", { status: 500 });
  }
}

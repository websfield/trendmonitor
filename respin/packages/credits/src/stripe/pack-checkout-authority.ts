import { createHmac, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import {
  AUTO_TOPUP_AUTHORITY_KEY_ID,
  getAutoTopupAuthorityKey,
  type StripeAccountIdentity,
} from "./adapter";
import type { PackPrice } from "./pack-price";

export type PackCheckoutAuthority = Readonly<{
  attemptId: string;
  workspaceId: string;
  customerId: string;
  priceId: string;
  amountCents: number;
  currency: string;
  credits: number;
  validityMonths: number;
  configVersion: number;
  stripeAccountId: string;
  stripeLivemode: boolean;
}>;

export class PackCheckoutAuthorityError extends Error {
  constructor(detail: string) {
    super(`Pack Checkout authority refused: ${detail}`);
    this.name = "PackCheckoutAuthorityError";
  }
}

function canonical(authority: PackCheckoutAuthority): string {
  return JSON.stringify([
    "respin-pack-checkout-authority-v1",
    AUTO_TOPUP_AUTHORITY_KEY_ID,
    authority.attemptId,
    authority.workspaceId,
    authority.customerId,
    authority.priceId,
    authority.amountCents,
    authority.currency,
    authority.credits,
    authority.validityMonths,
    authority.configVersion,
    authority.stripeAccountId,
    authority.stripeLivemode,
  ]);
}

function sign(authority: PackCheckoutAuthority): string {
  return createHmac("sha256", getAutoTopupAuthorityKey())
    .update(canonical(authority))
    .digest("hex");
}

export function packCheckoutAuthorityMetadata(
  attemptId: string,
  workspaceId: string,
  customerId: string,
  pack: PackPrice,
  provider: StripeAccountIdentity
): Record<string, string> {
  const authority: PackCheckoutAuthority = {
    attemptId,
    workspaceId,
    customerId,
    priceId: pack.priceId,
    amountCents: pack.amountCents,
    currency: pack.currency,
    credits: pack.credits,
    validityMonths: pack.validityMonths,
    configVersion: pack.configVersion,
    stripeAccountId: provider.accountId,
    stripeLivemode: provider.livemode,
  };
  return {
    respin_kind: "pack",
    authority_key_id: AUTO_TOPUP_AUTHORITY_KEY_ID,
    respin_pack_attempt_id: attemptId,
    workspace_id: workspaceId,
    customer_id: customerId,
    price_id: pack.priceId,
    amount_cents: String(pack.amountCents),
    currency: pack.currency,
    credits: String(pack.credits),
    validity_months: String(pack.validityMonths),
    config_version: String(pack.configVersion),
    stripe_account_id: provider.accountId,
    stripe_livemode: String(provider.livemode),
    respin_authority_sig: sign(authority),
  };
}

function positiveInteger(raw: string | undefined, field: string): number {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
    throw new PackCheckoutAuthorityError(`${field} is not a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new PackCheckoutAuthorityError(`${field} exceeds safe integer range`);
  }
  return value;
}

export function verifyPackCheckoutAuthority(
  session: Stripe.Checkout.Session,
  expectedWorkspaceId: string,
  event: Stripe.Event,
  currentProvider: StripeAccountIdentity
): PackCheckoutAuthority {
  const metadata = session.metadata;
  if (metadata?.authority_key_id !== AUTO_TOPUP_AUTHORITY_KEY_ID) {
    throw new PackCheckoutAuthorityError("authority key id is missing or unsupported");
  }
  const authority: PackCheckoutAuthority = {
    attemptId: metadata.respin_pack_attempt_id ?? "",
    workspaceId: metadata.workspace_id ?? "",
    customerId: metadata.customer_id ?? "",
    priceId: metadata.price_id ?? "",
    amountCents: positiveInteger(metadata.amount_cents, "amount_cents"),
    currency: metadata.currency ?? "",
    credits: positiveInteger(metadata.credits, "credits"),
    validityMonths: positiveInteger(metadata.validity_months, "validity_months"),
    configVersion: positiveInteger(metadata.config_version, "config_version"),
    stripeAccountId: metadata.stripe_account_id ?? "",
    stripeLivemode:
      metadata.stripe_livemode === "true"
        ? true
        : metadata.stripe_livemode === "false"
          ? false
          : (() => {
              throw new PackCheckoutAuthorityError("stripe_livemode is invalid");
            })(),
  };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      authority.attemptId
    )
  ) {
    throw new PackCheckoutAuthorityError("attempt id is not a UUID");
  }
  if (
    authority.workspaceId !== expectedWorkspaceId ||
    authority.currency !== "usd" ||
    !authority.customerId ||
    !authority.priceId
  ) {
    throw new PackCheckoutAuthorityError("workspace, customer, price, or currency is invalid");
  }
  const supplied = metadata.respin_authority_sig ?? "";
  const expected = sign(authority);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) {
    throw new PackCheckoutAuthorityError("signature is missing or malformed");
  }
  const suppliedBytes = Buffer.from(supplied, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new PackCheckoutAuthorityError("signature does not verify");
  }
  const lines = session.line_items?.data ?? [];
  const linePrice =
    lines.length === 1
      ? typeof lines[0]?.price === "string"
        ? lines[0].price
        : lines[0]?.price?.id ?? null
      : null;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    customerId !== authority.customerId ||
    session.amount_total !== authority.amountCents ||
    session.currency !== authority.currency ||
    linePrice !== authority.priceId ||
    session.livemode !== authority.stripeLivemode ||
    event.livemode !== authority.stripeLivemode ||
    authority.stripeAccountId !== currentProvider.accountId ||
    authority.stripeLivemode !== currentProvider.livemode ||
    (event.account !== undefined && event.account !== authority.stripeAccountId)
  ) {
    throw new PackCheckoutAuthorityError(
      "Session, event, or current provider differs from signed purchase authority"
    );
  }
  return authority;
}

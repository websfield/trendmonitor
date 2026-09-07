import { createHmac, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";
import type { PendingAutoTopupAttempt } from "./auto-topup";
import {
  AUTO_TOPUP_AUTHORITY_KEY_ID,
  getAutoTopupAuthorityKey,
} from "./adapter";

export type AutoTopupSignedAuthority = Readonly<{
  attemptId: string;
  workspaceId: string;
  periodMonthUtc: string;
  amountCents: number;
  currency: string;
  priceId: string;
  credits: number;
  validityMonths: number;
  configVersion: number;
  customerId: string;
}>;

export class AutoTopupAuthoritySignatureError extends Error {
  constructor(detail: string) {
    super(`Auto-top-up provider authority refused: ${detail}`);
    this.name = "AutoTopupAuthoritySignatureError";
  }
}

function canonical(authority: AutoTopupSignedAuthority): string {
  return JSON.stringify([
    "respin-auto-topup-authority-v1",
    AUTO_TOPUP_AUTHORITY_KEY_ID,
    authority.attemptId,
    authority.workspaceId,
    authority.periodMonthUtc,
    authority.amountCents,
    authority.currency,
    authority.priceId,
    authority.credits,
    authority.validityMonths,
    authority.configVersion,
    authority.customerId,
  ]);
}

function signature(authority: AutoTopupSignedAuthority): string {
  return createHmac("sha256", getAutoTopupAuthorityKey())
    .update(canonical(authority))
    .digest("hex");
}

export function autoTopupAuthorityMetadata(
  workspaceId: string,
  attempt: PendingAutoTopupAttempt
): Record<string, string> {
  const authority: AutoTopupSignedAuthority = {
    attemptId: attempt.id,
    workspaceId,
    periodMonthUtc: attempt.periodMonthUtc,
    amountCents: attempt.amountCents,
    currency: attempt.currency,
    priceId: attempt.priceId,
    credits: attempt.credits,
    validityMonths: attempt.validityMonths,
    configVersion: attempt.configVersion,
    customerId: attempt.customerId,
  };
  return {
    respin_kind: "auto_topup",
    authority_key_id: AUTO_TOPUP_AUTHORITY_KEY_ID,
    workspace_id: authority.workspaceId,
    respin_attempt_id: authority.attemptId,
    period_month_utc: authority.periodMonthUtc,
    amount_cents: String(authority.amountCents),
    currency: authority.currency,
    price_id: authority.priceId,
    credits: String(authority.credits),
    validity_months: String(authority.validityMonths),
    config_version: String(authority.configVersion),
    customer_id: authority.customerId,
    respin_authority_sig: signature(authority),
  };
}

function positiveInteger(raw: string | undefined, field: string): number {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
    throw new AutoTopupAuthoritySignatureError(`${field} is not a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new AutoTopupAuthoritySignatureError(`${field} exceeds safe integer range`);
  }
  return value;
}

export function verifyAutoTopupAuthority(
  pi: Stripe.PaymentIntent,
  expectedWorkspaceId: string
): AutoTopupSignedAuthority {
  const m = pi.metadata;
  if (m?.authority_key_id !== AUTO_TOPUP_AUTHORITY_KEY_ID) {
    throw new AutoTopupAuthoritySignatureError(
      "authority key id is missing or unsupported"
    );
  }
  const authority: AutoTopupSignedAuthority = {
    attemptId: m?.respin_attempt_id ?? "",
    workspaceId: m?.workspace_id ?? "",
    periodMonthUtc: m?.period_month_utc ?? "",
    amountCents: positiveInteger(m?.amount_cents, "amount_cents"),
    currency: m?.currency ?? "",
    priceId: m?.price_id ?? "",
    credits: positiveInteger(m?.credits, "credits"),
    validityMonths: positiveInteger(m?.validity_months, "validity_months"),
    configVersion: positiveInteger(m?.config_version, "config_version"),
    customerId: m?.customer_id ?? "",
  };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authority.attemptId)) {
    throw new AutoTopupAuthoritySignatureError("attempt id is not a UUID");
  }
  if (authority.workspaceId !== expectedWorkspaceId) {
    throw new AutoTopupAuthoritySignatureError("workspace does not match receipt attribution");
  }
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(authority.periodMonthUtc)) {
    throw new AutoTopupAuthoritySignatureError("period month is invalid");
  }
  if (authority.currency !== "usd" || !authority.priceId || !authority.customerId) {
    throw new AutoTopupAuthoritySignatureError("currency, price, or customer is invalid");
  }
  const supplied = m?.respin_authority_sig ?? "";
  const expected = signature(authority);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) {
    throw new AutoTopupAuthoritySignatureError("signature is missing or malformed");
  }
  const suppliedBytes = Buffer.from(supplied, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new AutoTopupAuthoritySignatureError("signature does not verify");
  }
  const piCustomer =
    typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null;
  if (
    pi.amount !== authority.amountCents ||
    pi.currency !== authority.currency ||
    piCustomer !== authority.customerId
  ) {
    throw new AutoTopupAuthoritySignatureError(
      "PaymentIntent amount, currency, or customer differs from signed authority"
    );
  }
  return authority;
}

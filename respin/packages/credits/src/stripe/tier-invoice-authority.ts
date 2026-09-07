import { createHmac, timingSafeEqual } from "node:crypto";
import type { SubscriptionTier } from "@respin/config";
import {
  AUTO_TOPUP_AUTHORITY_KEY_ID,
  getAutoTopupAuthorityKey,
  type StripeAccountIdentity,
} from "./adapter";

type PaidTier = Exclude<SubscriptionTier, "free">;

export type TierInvoiceAuthority = Readonly<{
  invoiceId: string;
  subscriptionId: string;
  workspaceId: string;
  customerId: string;
  checkoutAttemptId: string | null;
  priceId: string;
  periodStart: number;
  periodEnd: number;
  tier: PaidTier;
  allowance: number;
  configVersion: number;
  monthlyPeriodDays: Readonly<{ min: number; max: number }>;
  stripeAccountId: string;
  stripeLivemode: boolean;
}>;

export class TierInvoiceAuthorityError extends Error {
  constructor(detail: string) {
    super(`Tier Invoice authority refused: ${detail}`);
    this.name = "TierInvoiceAuthorityError";
  }
}

const REQUIRED_METADATA_KEYS = [
  "respin_tier_invoice_authority_key_id",
  "respin_tier_invoice_id",
  "respin_tier_subscription_id",
  "respin_tier_workspace_id",
  "respin_tier_customer_id",
  "respin_tier_price_id",
  "respin_tier_period_start",
  "respin_tier_period_end",
  "respin_tier_tier",
  "respin_tier_allowance",
  "respin_tier_config_version",
  "respin_tier_monthly_band",
  "respin_tier_stripe_account_id",
  "respin_tier_stripe_livemode",
  "respin_tier_invoice_authority_sig",
] as const;

const ALL_METADATA_KEYS = [
  ...REQUIRED_METADATA_KEYS,
  "respin_tier_checkout_attempt_id",
] as const;

function positiveInteger(raw: string | undefined, field: string): number {
  if (!raw || !/^[1-9][0-9]*$/.test(raw)) {
    throw new TierInvoiceAuthorityError(`${field} is not a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new TierInvoiceAuthorityError(`${field} exceeds safe integer range`);
  }
  return value;
}

function canonical(authority: TierInvoiceAuthority): string {
  return JSON.stringify([
    "respin-tier-invoice-authority-v1",
    AUTO_TOPUP_AUTHORITY_KEY_ID,
    authority.invoiceId,
    authority.subscriptionId,
    authority.workspaceId,
    authority.customerId,
    authority.checkoutAttemptId,
    authority.priceId,
    authority.periodStart,
    authority.periodEnd,
    authority.tier,
    authority.allowance,
    authority.configVersion,
    authority.monthlyPeriodDays.min,
    authority.monthlyPeriodDays.max,
    authority.stripeAccountId,
    authority.stripeLivemode,
  ]);
}

function signature(authority: TierInvoiceAuthority): string {
  return createHmac("sha256", getAutoTopupAuthorityKey())
    .update(canonical(authority))
    .digest("hex");
}

function assertAuthorityShape(authority: TierInvoiceAuthority): void {
  if (
    !authority.invoiceId.startsWith("in_") ||
    !authority.subscriptionId.startsWith("sub_") ||
    !authority.customerId.startsWith("cus_") ||
    !authority.priceId.startsWith("price_") ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      authority.workspaceId
    ) ||
    (authority.checkoutAttemptId !== null &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        authority.checkoutAttemptId
      )) ||
    !Number.isSafeInteger(authority.periodStart) ||
    authority.periodStart <= 0 ||
    !Number.isSafeInteger(authority.periodEnd) ||
    authority.periodEnd <= authority.periodStart ||
    !Number.isSafeInteger(authority.allowance) ||
    authority.allowance <= 0 ||
    !Number.isSafeInteger(authority.configVersion) ||
    authority.configVersion <= 0 ||
    !Number.isSafeInteger(authority.monthlyPeriodDays.min) ||
    authority.monthlyPeriodDays.min <= 0 ||
    !Number.isSafeInteger(authority.monthlyPeriodDays.max) ||
    authority.monthlyPeriodDays.max < authority.monthlyPeriodDays.min ||
    !authority.stripeAccountId.startsWith("acct_")
  ) {
    throw new TierInvoiceAuthorityError("identity or economic fields are malformed");
  }
  const periodDays = (authority.periodEnd - authority.periodStart) / 86_400;
  if (
    periodDays < authority.monthlyPeriodDays.min ||
    periodDays > authority.monthlyPeriodDays.max
  ) {
    throw new TierInvoiceAuthorityError(
      `service period ${periodDays.toFixed(1)} days is outside signed monthly band ${authority.monthlyPeriodDays.min}-${authority.monthlyPeriodDays.max}`
    );
  }
}

export function tierInvoiceAuthorityMetadata(
  authority: TierInvoiceAuthority
): Record<string, string> {
  assertAuthorityShape(authority);
  return {
    respin_tier_invoice_authority_key_id: AUTO_TOPUP_AUTHORITY_KEY_ID,
    respin_tier_invoice_id: authority.invoiceId,
    respin_tier_subscription_id: authority.subscriptionId,
    respin_tier_workspace_id: authority.workspaceId,
    respin_tier_customer_id: authority.customerId,
    ...(authority.checkoutAttemptId
      ? { respin_tier_checkout_attempt_id: authority.checkoutAttemptId }
      : {}),
    respin_tier_price_id: authority.priceId,
    respin_tier_period_start: String(authority.periodStart),
    respin_tier_period_end: String(authority.periodEnd),
    respin_tier_tier: authority.tier,
    respin_tier_allowance: String(authority.allowance),
    respin_tier_config_version: String(authority.configVersion),
    respin_tier_monthly_band: `${authority.monthlyPeriodDays.min},${authority.monthlyPeriodDays.max}`,
    respin_tier_stripe_account_id: authority.stripeAccountId,
    respin_tier_stripe_livemode: String(authority.stripeLivemode),
    respin_tier_invoice_authority_sig: signature(authority),
  };
}

export function hasTierInvoiceAuthorityMetadata(
  metadata: Record<string, string> | null | undefined
): boolean {
  return ALL_METADATA_KEYS.some((key) => metadata?.[key] !== undefined);
}

export function tierInvoiceAuthorityMetadataFromProvider(
  metadata: Record<string, string> | null | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of REQUIRED_METADATA_KEYS) {
    const value = metadata?.[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new TierInvoiceAuthorityError(`metadata field ${key} is missing`);
    }
    result[key] = value;
  }
  const attemptId = metadata?.respin_tier_checkout_attempt_id;
  if (attemptId !== undefined) result.respin_tier_checkout_attempt_id = attemptId;
  return result;
}

export function verifyTierInvoiceAuthority(
  metadata: Record<string, string> | null | undefined,
  expected: Readonly<{
    invoiceId: string;
    subscriptionId: string;
    workspaceId: string;
    customerId: string;
    priceId: string;
    periodStart: number;
    periodEnd: number;
  }>,
  provider: StripeAccountIdentity
): TierInvoiceAuthority {
  if (
    metadata?.respin_tier_invoice_authority_key_id !==
    AUTO_TOPUP_AUTHORITY_KEY_ID
  ) {
    throw new TierInvoiceAuthorityError(
      "authority key id is missing or unsupported"
    );
  }
  const band = (metadata.respin_tier_monthly_band ?? "").split(",");
  if (band.length !== 2) {
    throw new TierInvoiceAuthorityError("monthly band is malformed");
  }
  const tier = metadata.respin_tier_tier;
  if (tier !== "creator" && tier !== "pro" && tier !== "studio") {
    throw new TierInvoiceAuthorityError("tier is invalid");
  }
  const livemode =
    metadata.respin_tier_stripe_livemode === "true"
      ? true
      : metadata.respin_tier_stripe_livemode === "false"
        ? false
        : (() => {
            throw new TierInvoiceAuthorityError("livemode is malformed");
          })();
  const authority: TierInvoiceAuthority = {
    invoiceId: metadata.respin_tier_invoice_id ?? "",
    subscriptionId: metadata.respin_tier_subscription_id ?? "",
    workspaceId: metadata.respin_tier_workspace_id ?? "",
    customerId: metadata.respin_tier_customer_id ?? "",
    checkoutAttemptId: metadata.respin_tier_checkout_attempt_id ?? null,
    priceId: metadata.respin_tier_price_id ?? "",
    periodStart: positiveInteger(
      metadata.respin_tier_period_start,
      "period start"
    ),
    periodEnd: positiveInteger(metadata.respin_tier_period_end, "period end"),
    tier,
    allowance: positiveInteger(metadata.respin_tier_allowance, "allowance"),
    configVersion: positiveInteger(
      metadata.respin_tier_config_version,
      "config version"
    ),
    monthlyPeriodDays: {
      min: positiveInteger(band[0], "monthly minimum"),
      max: positiveInteger(band[1], "monthly maximum"),
    },
    stripeAccountId: metadata.respin_tier_stripe_account_id ?? "",
    stripeLivemode: livemode,
  };
  assertAuthorityShape(authority);
  if (
    authority.invoiceId !== expected.invoiceId ||
    authority.subscriptionId !== expected.subscriptionId ||
    authority.workspaceId !== expected.workspaceId ||
    authority.customerId !== expected.customerId ||
    authority.priceId !== expected.priceId ||
    authority.periodStart !== expected.periodStart ||
    authority.periodEnd !== expected.periodEnd ||
    authority.stripeAccountId !== provider.accountId ||
    authority.stripeLivemode !== provider.livemode
  ) {
    throw new TierInvoiceAuthorityError(
      "signed authority differs from invoice core identity or provider"
    );
  }
  const supplied = metadata.respin_tier_invoice_authority_sig ?? "";
  const expectedSignature = signature(authority);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) {
    throw new TierInvoiceAuthorityError("signature is missing or malformed");
  }
  const suppliedBytes = Buffer.from(supplied, "hex");
  const expectedBytes = Buffer.from(expectedSignature, "hex");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new TierInvoiceAuthorityError("signature does not verify");
  }
  return authority;
}

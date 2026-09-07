import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AUTO_TOPUP_AUTHORITY_KEY_ID,
  getAutoTopupAuthorityKey,
  type StripeAccountIdentity,
} from "./adapter";

/** Checkout authority identifies a provider generation, never its economics. */
export type TierCheckoutAuthority = Readonly<{
  attemptId: string;
  workspaceId: string;
  customerId: string;
  stripeAccountId: string;
  stripeLivemode: boolean;
}>;

export class TierCheckoutAuthorityError extends Error {
  constructor(detail: string) {
    super(`Tier Checkout authority refused: ${detail}`);
    this.name = "TierCheckoutAuthorityError";
  }
}

const TIER_AUTHORITY_METADATA_KEYS = [
  "respin_tier_authority_key_id",
  "respin_tier_stripe_account_id",
  "respin_tier_stripe_livemode",
  "respin_tier_authority_sig",
] as const;

function canonical(authority: TierCheckoutAuthority): string {
  return JSON.stringify([
    "respin-tier-checkout-generation-v1",
    AUTO_TOPUP_AUTHORITY_KEY_ID,
    authority.attemptId,
    authority.workspaceId,
    authority.customerId,
    authority.stripeAccountId,
    authority.stripeLivemode,
  ]);
}

function signature(authority: TierCheckoutAuthority): string {
  return createHmac("sha256", getAutoTopupAuthorityKey())
    .update(canonical(authority))
    .digest("hex");
}

function isProviderIdentity(value: unknown): value is StripeAccountIdentity {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as StripeAccountIdentity).accountId === "string" &&
      typeof (value as StripeAccountIdentity).livemode === "boolean"
  );
}

export function tierCheckoutAuthorityMetadata(
  attemptId: string,
  workspaceId: string,
  customerId: string,
  provider: StripeAccountIdentity
): Record<string, string>;
/** Compatibility for the unshipped draft call shape; economics are ignored. */
export function tierCheckoutAuthorityMetadata(
  attemptId: string,
  workspaceId: string,
  customerId: string,
  legacyConfigVersion: number,
  legacyContent: unknown,
  provider: StripeAccountIdentity
): Record<string, string>;
export function tierCheckoutAuthorityMetadata(
  attemptId: string,
  workspaceId: string,
  customerId: string,
  providerOrLegacyVersion: StripeAccountIdentity | number,
  _legacyContent?: unknown,
  legacyProvider?: StripeAccountIdentity
): Record<string, string> {
  const provider = isProviderIdentity(providerOrLegacyVersion)
    ? providerOrLegacyVersion
    : legacyProvider;
  if (!provider) {
    throw new TierCheckoutAuthorityError("provider identity is missing");
  }
  const authority: TierCheckoutAuthority = {
    attemptId,
    workspaceId,
    customerId,
    stripeAccountId: provider.accountId,
    stripeLivemode: provider.livemode,
  };
  return {
    respin_tier_authority_key_id: AUTO_TOPUP_AUTHORITY_KEY_ID,
    respin_tier_stripe_account_id: authority.stripeAccountId,
    respin_tier_stripe_livemode: String(authority.stripeLivemode),
    respin_tier_authority_sig: signature(authority),
  };
}

export function tierCheckoutAuthorityMetadataFromProvider(
  metadata: Record<string, string> | null | undefined
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of TIER_AUTHORITY_METADATA_KEYS) {
    const value = metadata?.[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new TierCheckoutAuthorityError(`metadata field ${key} is missing`);
    }
    result[key] = value;
  }
  return result;
}

export function verifyTierCheckoutAuthority(
  metadata: Record<string, string> | null | undefined,
  expected: Readonly<{
    attemptId: string;
    workspaceId: string;
    customerId: string;
  }>,
  provider: StripeAccountIdentity
): TierCheckoutAuthority {
  if (metadata?.respin_tier_authority_key_id !== AUTO_TOPUP_AUTHORITY_KEY_ID) {
    throw new TierCheckoutAuthorityError("authority key id is missing or unsupported");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      expected.attemptId
    ) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      expected.workspaceId
    ) ||
    !expected.customerId.startsWith("cus_")
  ) {
    throw new TierCheckoutAuthorityError(
      "attempt, workspace, or customer generation identity is malformed"
    );
  }
  const livemode =
    metadata.respin_tier_stripe_livemode === "true"
      ? true
      : metadata.respin_tier_stripe_livemode === "false"
        ? false
        : (() => {
            throw new TierCheckoutAuthorityError("livemode authority is malformed");
          })();
  const authority: TierCheckoutAuthority = {
    ...expected,
    stripeAccountId: metadata.respin_tier_stripe_account_id ?? "",
    stripeLivemode: livemode,
  };
  if (
    authority.stripeAccountId !== provider.accountId ||
    authority.stripeLivemode !== provider.livemode
  ) {
    throw new TierCheckoutAuthorityError(
      "provider identity differs from signed generation authority"
    );
  }
  const supplied = metadata.respin_tier_authority_sig ?? "";
  const expectedSignature = signature(authority);
  if (!/^[0-9a-f]{64}$/i.test(supplied)) {
    throw new TierCheckoutAuthorityError("signature is missing or malformed");
  }
  const suppliedBytes = Buffer.from(supplied, "hex");
  const expectedBytes = Buffer.from(expectedSignature, "hex");
  if (
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  ) {
    throw new TierCheckoutAuthorityError("signature does not verify");
  }
  return authority;
}

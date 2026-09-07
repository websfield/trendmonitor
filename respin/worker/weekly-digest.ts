import type { ExternalEvidenceBlocker } from "./refresh";
import { strictCalendarDate } from "./calendar-date";

export interface DigestItem {
  readonly title: string;
  readonly url: string;
  readonly outlier: {
    readonly ratio: number;
    readonly baseline: number;
    readonly baselineSampleSize: number;
    readonly window: { readonly startsAt: string; readonly endsAt: string };
  };
}

export interface WeeklyDigestInput {
  readonly digestId: string;
  readonly weekStart: string;
  readonly nicheLabel: string;
  readonly items: readonly DigestItem[];
}

export interface ComposedDigest {
  readonly digestId: string;
  readonly subject: string;
  readonly text: string;
}

function oneLine(value: string, label: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length === 0) throw new Error(`${label} is required`);
  return clean;
}

function publicUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("digest item URL must be HTTP(S)");
  }
  return parsed.toString();
}

function outlierEvidence(item: DigestItem): string {
  const evidence = item.outlier as DigestItem["outlier"] | undefined;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("complete outlier evidence is required");
  }
  if (!Number.isFinite(evidence.ratio) || evidence.ratio < 0) {
    throw new Error("outlier ratio must be non-negative");
  }
  if (!Number.isFinite(evidence.baseline) || evidence.baseline <= 0) {
    throw new Error("outlier baseline must be positive");
  }
  if (!Number.isSafeInteger(evidence.baselineSampleSize) || evidence.baselineSampleSize <= 0) {
    throw new Error("outlier baseline sample size must be a positive safe integer");
  }
  if (!evidence.window || typeof evidence.window !== "object" || Array.isArray(evidence.window)) {
    throw new Error("complete outlier baseline window is required");
  }
  const startsAt = Date.parse(evidence.window.startsAt);
  const endsAt = Date.parse(evidence.window.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
    throw new Error("outlier baseline window must contain increasing timestamps");
  }
  return `${evidence.ratio}x against baseline ${evidence.baseline} from ${evidence.baselineSampleSize} recent items, ${evidence.window.startsAt} through ${evidence.window.endsAt}`;
}

export function composeWeeklyDigest(input: WeeklyDigestInput): ComposedDigest {
  const digestId = oneLine(input.digestId, "digestId");
  const nicheLabel = oneLine(input.nicheLabel, "nicheLabel");
  const weekStart = strictCalendarDate(input.weekStart, "weekStart");
  const lines = input.items.map((item, index) => {
    return `${index + 1}. ${oneLine(item.title, "item title")} — ${outlierEvidence(item)} — ${publicUrl(item.url)}`;
  });
  return {
    digestId,
    subject: `Respin weekly trends: ${nicheLabel}`,
    text: [`Week of ${weekStart}`, nicheLabel, "", ...lines].join("\n"),
  };
}

export const RESEND_DELIVERY_EVIDENCE_BLOCKER: ExternalEvidenceBlocker = Object.freeze({
  status: "blocked_external_evidence",
  blockerCode: "resend_delivery_unavailable_unverified",
  externalSystem: "resend",
  evidenceNeeded: "installed sender adapter, provisioned account, and an observed delivery result",
});

export interface DigestDeliveryPort {
  deliver(digest: ComposedDigest): Promise<
    | ExternalEvidenceBlocker
    | { readonly status: "delivered"; readonly deliveryId: string }
  >;
}

export const unavailableDigestDelivery: DigestDeliveryPort = Object.freeze({
  async deliver(): Promise<ExternalEvidenceBlocker> {
    return RESEND_DELIVERY_EVIDENCE_BLOCKER;
  },
});

export type WeeklyDigestRunResult =
  | ExternalEvidenceBlocker
  | { readonly status: "delivered"; readonly deliveryId: string };

/** Compose first, then cross the injected sender boundary; no sender is implied. */
export async function runWeeklyDigest(
  input: WeeklyDigestInput,
  delivery: DigestDeliveryPort,
): Promise<WeeklyDigestRunResult> {
  const result = await delivery.deliver(composeWeeklyDigest(input));
  if (result.status === "blocked_external_evidence") {
    if (result.externalSystem !== "resend"
      || !/\S/.test(result.blockerCode)
      || !/\S/.test(result.evidenceNeeded)) {
      throw new Error("weekly digest returned an invalid external-evidence blocker");
    }
    return result;
  }
  return { status: "delivered", deliveryId: oneLine(result.deliveryId, "deliveryId") };
}

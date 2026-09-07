// Phase 10b-1 Task 5.4 — `forecastDeletionJournalCost`, the sole budget
// authority for the deletion journal (R-124).
//
// TWO THINGS THIS MODULE MUST NEVER DO, and the reason it is a leaf:
//
//   1. It never spends or provisions. It has no transport, no client, no
//      credential and no network import. It is arithmetic over a recorded
//      price sheet.
//   2. It never touches lifecycle work. A forecast at ANY value — alerting,
//      over ceiling, or withheld entirely — may not refuse, pause, abandon or
//      disable an active deletion, a journal append, a purge, a restore or a
//      residue verification. The only thing it gates is turning NEW-ACCOUNT or
//      PUBLIC access on. Nothing in this file imports the executor, and the
//      executor imports nothing from here; the import-boundary test pins that,
//      because a comment promising an absence is not an absence.
//
// NO PRICE IS COMPILED IN. Not one. The prices that decide whether public
// launch is allowed are facts about a vendor's current price list on a specific
// date in a specific region, and a number recalled from training and dressed up
// with a `reviewedAt` would be a fabricated citation on the money path. So the
// snapshot is an operator-recorded artefact (`infra/s3-deletion-journal/
// price-snapshot.<region>.json`), and a deployment with no reviewed snapshot
// for its region gets a WITHHELD forecast, which blocks enablement and names
// exactly what to record. R-124 already demands this: "re-priced for the
// selected deployment region before provisioning".

/** R-124's compiled planning envelope. Counts, not prices — these are ours. */
export const R124_LAUNCH_ENVELOPE = Object.freeze({
  deletionRequestsPerMonth: 1_000,
  versionsPerRequest: 10,
  bytesPerVersion: 8 * 1024,
  verificationOperationsPerMonth: 100_000,
  publicEgressBytesPerMonth: 0,
});

/** R-124's operational thresholds, in whole US cents to stay exact. */
export const JOURNAL_FORECAST_ALERT_CENTS = 50n; // USD 0.50 — alert
export const JOURNAL_FORECAST_CEILING_CENTS = 100n; // USD 1.00 — enablement ceiling

/**
 * A snapshot older than this has not been re-reviewed and cannot be trusted.
 *
 * DERIVATION, because round 1 correctly flagged this as the one uncited number
 * deciding when enablement blocks: R-124 says only "stale". 90 days is the same
 * window R-122 gives the other content-free provider metadata this system
 * re-reviews, and it is deliberately shorter than the annual cadence a vendor
 * price list changes on. It is the PERMISSIVE direction, so if it is ever
 * wrong it should move DOWN; a shorter window only withholds more forecasts,
 * and a withheld forecast blocks enablement rather than allowing it.
 */
export const JOURNAL_PRICE_SNAPSHOT_MAX_AGE_DAYS = 90;

const BYTES_PER_GIB = 1024n * 1024n * 1024n;
/** All money is integer nano-USD; nothing here touches a float. */
const NANO_PER_USD = 1_000_000_000n;
const NANO_PER_CENT = NANO_PER_USD / 100n;

export type S3PriceSnapshot = Readonly<{
  region: string;
  currency: "USD";
  /** Where the operator read these numbers. */
  sourceUrl: string;
  /** When the vendor's price list said these prices were in effect (ISO date). */
  effectiveAt: string;
  /** When a human last checked them against that source (ISO date). */
  reviewedAt: string;
  /** Decimal USD strings, exactly as the price list prints them. */
  storagePerGibMonth: string;
  putPer1000Requests: string;
  getPer1000Requests: string;
  /**
   * LIST is billed in the PUT/COPY/POST tier, not the GET tier, and the
   * verifier issues one ListObjectVersions per operation. Round 1 caught the
   * first version pricing the whole verification class at the GET rate — an
   * entire request class rounded to the cheaper one, in a module whose contract
   * is "never round a breach away". Optional so an existing snapshot stays
   * valid; when absent the PUT rate is used, which is the conservative
   * direction (LIST and PUT are the same tier on AWS's list).
   */
  listPer1000Requests?: string;
}>;

export const JOURNAL_FORECAST_WITHHELD_CODES = [
  "no_snapshot_for_region",
  "snapshot_region_mismatch",
  "snapshot_stale",
  "snapshot_malformed",
  "region_not_configured",
] as const;

export type JournalForecastWithheldCode = (typeof JOURNAL_FORECAST_WITHHELD_CODES)[number];

export type JournalUsageBasis =
  /** Before provisioning: the compiled R-124 envelope. */
  | Readonly<{ basis: "envelope" }>
  /** After provisioning: rolling measured bytes and operation counts. */
  | Readonly<{
      basis: "measured";
      storedBytes: number;
      putRequests: number;
      readRequests: number;
      windowStart: Date;
      windowEnd: Date;
    }>;

export type DeletionJournalForecast =
  | Readonly<{
      outcome: "forecast";
      basis: "envelope" | "measured";
      region: string;
      currency: "USD";
      /** Exact, rounded UP to the cent — a forecast must never round a breach away. */
      amountCents: bigint;
      amountUsd: string;
      alert: boolean;
      overCeiling: boolean;
      ceilingCents: bigint;
      snapshot: S3PriceSnapshot;
      inputs: Readonly<{
        storedBytes: number;
        putRequests: number;
        readRequests: number;
        egressBytes: number;
      }>;
      /** How the read class was split for pricing; LIST bills at the PUT tier. */
      listRequests: number;
      getRequests: number;
    }>
  | Readonly<{
      outcome: "withheld";
      code: JournalForecastWithheldCode;
      region: string | null;
      detail: string;
    }>;

/** Strict decimal-USD parser. No float, no scientific notation, no silent NaN. */
export function parseUsdToNano(value: string): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,9})(?:\.(\d{1,9}))?$/.exec(value.trim());
  if (!match) return null;
  const whole = BigInt(match[1] as string);
  const fraction = (match[2] ?? "").padEnd(9, "0");
  return whole * NANO_PER_USD + BigInt(fraction);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export type SnapshotValidation =
  | Readonly<{ ok: true; snapshot: S3PriceSnapshot }>
  | Readonly<{ ok: false; detail: string }>;

/** Validate an operator-recorded snapshot. Anything short of complete is refused. */
export function validatePriceSnapshot(raw: unknown): SnapshotValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, detail: "price snapshot is not an object" };
  }
  const value = raw as Record<string, unknown>;
  const stringFields = [
    "region",
    "sourceUrl",
    "effectiveAt",
    "reviewedAt",
    "storagePerGibMonth",
    "putPer1000Requests",
    "getPer1000Requests",
  ] as const;
  for (const field of stringFields) {
    if (typeof value[field] !== "string" || (value[field] as string).length === 0) {
      return { ok: false, detail: `price snapshot field "${field}" is missing or not a string` };
    }
  }
  if (value.currency !== "USD") {
    return { ok: false, detail: `price snapshot currency must be "USD", got ${JSON.stringify(value.currency)}` };
  }
  if (!/^https:\/\//.test(value.sourceUrl as string)) {
    return { ok: false, detail: "price snapshot sourceUrl must be an https URL naming the price list it was read from" };
  }
  if (!isIsoDate(value.effectiveAt) || !isIsoDate(value.reviewedAt)) {
    return { ok: false, detail: "price snapshot effectiveAt and reviewedAt must be YYYY-MM-DD dates" };
  }
  for (const field of ["storagePerGibMonth", "putPer1000Requests", "getPer1000Requests"] as const) {
    if (parseUsdToNano(value[field] as string) === null) {
      return { ok: false, detail: `price snapshot field "${field}" is not a plain decimal USD amount` };
    }
  }
  if (value.listPer1000Requests !== undefined) {
    if (
      typeof value.listPer1000Requests !== "string" ||
      parseUsdToNano(value.listPer1000Requests) === null
    ) {
      return { ok: false, detail: 'price snapshot field "listPer1000Requests" is not a plain decimal USD amount' };
    }
  }
  return { ok: true, snapshot: value as unknown as S3PriceSnapshot };
}

function ceilNanoToCents(nano: bigint): bigint {
  return (nano + NANO_PER_CENT - 1n) / NANO_PER_CENT;
}

function centsToUsd(cents: bigint): string {
  const whole = cents / 100n;
  const rest = cents % 100n;
  return `${whole}.${String(rest).padStart(2, "0")}`;
}

export type ForecastInput = Readonly<{
  /** The AWS region the deployment targets. `null` = not chosen yet. */
  region: string | null;
  /** Every reviewed snapshot the deployment holds, in any order. */
  snapshots: readonly unknown[];
  usage?: JournalUsageBasis;
  now: Date;
  /** A recorded owner cost decision may RAISE the ceiling, never lower it. */
  ownerCostCeilingCents?: bigint;
}>;

/**
 * The sole budget authority. Pure, total, and unable to spend.
 */
export function forecastDeletionJournalCost(input: ForecastInput): DeletionJournalForecast {
  if (input.region === null || input.region.trim().length === 0) {
    return {
      outcome: "withheld",
      code: "region_not_configured",
      region: null,
      detail:
        "no AWS region is configured for the deletion journal, so no price list applies. Set the journal region, then record infra/s3-deletion-journal/price-snapshot.<region>.json.",
    };
  }
  const region = input.region.trim();

  const validated: S3PriceSnapshot[] = [];
  for (const raw of input.snapshots) {
    const result = validatePriceSnapshot(raw);
    if (!result.ok) {
      return { outcome: "withheld", code: "snapshot_malformed", region, detail: result.detail };
    }
    validated.push(result.snapshot);
  }

  // Two snapshots for one region must not resolve silently to whichever sorts
  // first: the older, cheaper file would win and under-report on the one path
  // that authorises public launch. The restore verifier refuses duplicate
  // logical keys on exactly this principle (round-1 billing CHANGE 5).
  const forRegion = validated.filter((candidate) => candidate.region === region);
  if (forRegion.length > 1) {
    return {
      outcome: "withheld",
      code: "snapshot_malformed",
      region,
      detail: `${forRegion.length} reviewed price snapshots claim region ${region} (reviewed ${forRegion.map((s) => s.reviewedAt).join(", ")}). Delete the superseded file so exactly one priced snapshot exists per region.`,
    };
  }
  const snapshot = forRegion[0];
  if (!snapshot) {
    return {
      outcome: "withheld",
      code: validated.length === 0 ? "no_snapshot_for_region" : "snapshot_region_mismatch",
      region,
      detail:
        validated.length === 0
          ? `no reviewed S3 price snapshot exists. Record infra/s3-deletion-journal/price-snapshot.${region}.json from the current AWS S3 price list for ${region}, with its sourceUrl and reviewedAt date.`
          : `the reviewed snapshots cover ${validated.map((s) => s.region).join(", ")}, not ${region}. Cross-region pricing is not a forecast for ${region}.`,
    };
  }

  const reviewedAt = new Date(`${snapshot.reviewedAt}T00:00:00.000Z`);
  const ageDays = Math.floor((input.now.getTime() - reviewedAt.getTime()) / 86_400_000);
  if (ageDays > JOURNAL_PRICE_SNAPSHOT_MAX_AGE_DAYS) {
    return {
      outcome: "withheld",
      code: "snapshot_stale",
      region,
      detail: `the ${region} price snapshot was last reviewed ${ageDays} days ago (limit ${JOURNAL_PRICE_SNAPSHOT_MAX_AGE_DAYS}). Re-check it against ${snapshot.sourceUrl} and update reviewedAt.`,
    };
  }
  if (ageDays < 0) {
    return {
      outcome: "withheld",
      code: "snapshot_malformed",
      region,
      detail: `the ${region} price snapshot claims a future review date (${snapshot.reviewedAt}).`,
    };
  }

  const usage = input.usage ?? { basis: "envelope" as const };
  if (usage.basis === "measured") {
    // Total means total. `BigInt(8.5)` and `BigInt(NaN)` throw, so a
    // non-integer here would turn the budget authority into a crash rather
    // than a forecast — and it was only guarded at its one CLI caller.
    for (const [field, value] of [
      ["storedBytes", usage.storedBytes],
      ["putRequests", usage.putRequests],
      ["readRequests", usage.readRequests],
    ] as const) {
      if (!Number.isInteger(value) || value < 0) {
        return {
          outcome: "withheld",
          code: "snapshot_malformed",
          region,
          detail: `measured usage field "${field}" must be a non-negative integer, got ${JSON.stringify(value)}`,
        };
      }
    }
  }
  const inputs =
    usage.basis === "envelope"
      ? {
          storedBytes:
            R124_LAUNCH_ENVELOPE.deletionRequestsPerMonth *
            R124_LAUNCH_ENVELOPE.versionsPerRequest *
            R124_LAUNCH_ENVELOPE.bytesPerVersion,
          putRequests:
            R124_LAUNCH_ENVELOPE.deletionRequestsPerMonth * R124_LAUNCH_ENVELOPE.versionsPerRequest,
          readRequests: R124_LAUNCH_ENVELOPE.verificationOperationsPerMonth,
          egressBytes: R124_LAUNCH_ENVELOPE.publicEgressBytesPerMonth,
        }
      : {
          storedBytes: usage.storedBytes,
          putRequests: usage.putRequests,
          readRequests: usage.readRequests,
          egressBytes: 0,
        };

  // R-124's envelope says "100,000 GET/HEAD/LIST verification operations", and
  // LIST is billed in the PUT tier rather than the GET tier.
  //
  // ON THE MEASURED BASIS THE WHOLE READ CLASS IS PRICED AT THE PUT TIER.
  // The first version used `usage.putRequests` as a proxy for the LIST count,
  // which is an undeclared substitution: it made the envelope and measured
  // bases disagree by 10x on the same physical quantity (USD 0.22 vs 0.30 on
  // identical figures), contradicting the plan's "the same snapshot/formula".
  // Until a real measured LIST counter exists, the conservative direction is
  // the only defensible one — a forecast must never round a breach away.
  const listRequests =
    usage.basis === "envelope"
      ? Math.min(inputs.readRequests, R124_LAUNCH_ENVELOPE.deletionRequestsPerMonth)
      : inputs.readRequests;
  const getRequests = inputs.readRequests - listRequests;

  const storagePerGib = parseUsdToNano(snapshot.storagePerGibMonth) as bigint;
  const putPer1000 = parseUsdToNano(snapshot.putPer1000Requests) as bigint;
  const getPer1000 = parseUsdToNano(snapshot.getPer1000Requests) as bigint;

  // Integer arithmetic throughout; the storage term rounds UP to the nano so a
  // sub-nano fraction is never rounded away from a budget breach.
  const storageNano =
    (BigInt(inputs.storedBytes) * storagePerGib + BYTES_PER_GIB - 1n) / BYTES_PER_GIB;
  const putNano = (BigInt(inputs.putRequests) * putPer1000 + 999n) / 1000n;
  const listPer1000 = snapshot.listPer1000Requests
    ? (parseUsdToNano(snapshot.listPer1000Requests) as bigint)
    : putPer1000;
  const listNano = (BigInt(listRequests) * listPer1000 + 999n) / 1000n;
  const getNano = (BigInt(getRequests) * getPer1000 + 999n) / 1000n;
  const amountCents = ceilNanoToCents(storageNano + putNano + listNano + getNano);

  const ceilingCents =
    input.ownerCostCeilingCents !== undefined &&
    input.ownerCostCeilingCents > JOURNAL_FORECAST_CEILING_CENTS
      ? input.ownerCostCeilingCents
      : JOURNAL_FORECAST_CEILING_CENTS;

  return {
    outcome: "forecast",
    basis: usage.basis,
    region,
    currency: "USD",
    amountCents,
    amountUsd: centsToUsd(amountCents),
    alert: amountCents >= JOURNAL_FORECAST_ALERT_CENTS,
    overCeiling: amountCents > ceilingCents,
    ceilingCents,
    snapshot,
    inputs,
    listRequests,
    getRequests,
  };
}

// ---------------------------------------------------------------------------
// The enablement gate — the ONLY thing the forecast is allowed to decide
// ---------------------------------------------------------------------------

export type JournalEnablementDecision = Readonly<{
  /** May new-account signup / public traffic be switched ON? */
  allowed: boolean;
  /** An operational alert is due even when enablement is allowed. */
  alert: boolean;
  code: "allowed" | "forecast_withheld" | "over_ceiling";
  reason: string;
}>;

/**
 * Derived from the forecast alone. It answers exactly one question — may
 * new-account/public enablement be turned on — and it answers nothing about an
 * operation already in flight.
 */
export function journalEnablementDecision(
  forecast: DeletionJournalForecast
): JournalEnablementDecision {
  if (forecast.outcome === "withheld") {
    return {
      allowed: false,
      alert: true,
      code: "forecast_withheld",
      reason: `new-account and public enablement are blocked because the deletion-journal cost forecast is withheld (${forecast.code}): ${forecast.detail}`,
    };
  }
  if (forecast.overCeiling) {
    return {
      allowed: false,
      alert: true,
      code: "over_ceiling",
      reason: `new-account and public enablement are blocked: the ${forecast.region} deletion-journal forecast is USD ${forecast.amountUsd}/month, above the USD ${centsToUsd(forecast.ceilingCents)} ceiling. A recorded owner cost decision must raise the ceiling before enablement. Active deletions, appends, purges, restores and residue verification are unaffected.`,
    };
  }
  return {
    allowed: true,
    alert: forecast.alert,
    code: "allowed",
    reason: forecast.alert
      ? `new-account and public enablement are allowed; the ${forecast.region} deletion-journal forecast is USD ${forecast.amountUsd}/month, at or above the USD ${centsToUsd(JOURNAL_FORECAST_ALERT_CENTS)} alert threshold.`
      : `new-account and public enablement are allowed; the ${forecast.region} deletion-journal forecast is USD ${forecast.amountUsd}/month.`,
  };
}

/** Operator-facing projection: everything the forecast must SHOW, per R-124. */
export function describeForecast(forecast: DeletionJournalForecast): string {
  if (forecast.outcome === "withheld") {
    return `Deletion-journal forecast WITHHELD (${forecast.code})${forecast.region ? ` for region ${forecast.region}` : ""}: ${forecast.detail}`;
  }
  const { snapshot, inputs } = forecast;
  return [
    `Deletion-journal forecast: USD ${forecast.amountUsd}/month (${forecast.basis} basis, region ${forecast.region}).`,
    `Alert at USD ${centsToUsd(JOURNAL_FORECAST_ALERT_CENTS)}: ${forecast.alert ? "YES" : "no"}. Over the USD ${centsToUsd(forecast.ceilingCents)} enablement ceiling: ${forecast.overCeiling ? "YES" : "no"}.`,
    `Price source: ${snapshot.sourceUrl} (region ${snapshot.region}, effective ${snapshot.effectiveAt}, reviewed ${snapshot.reviewedAt}).`,
    `Prices: storage USD ${snapshot.storagePerGibMonth}/GiB-month, PUT USD ${snapshot.putPer1000Requests}/1000, LIST USD ${snapshot.listPer1000Requests ?? snapshot.putPer1000Requests}/1000${snapshot.listPer1000Requests ? "" : " (PUT tier — no LIST rate recorded)"}, GET USD ${snapshot.getPer1000Requests}/1000.`,
    `Inputs: ${inputs.storedBytes} stored bytes, ${inputs.putRequests} PUT, ${inputs.readRequests} read (${forecast.listRequests} LIST + ${forecast.getRequests} GET), ${inputs.egressBytes} egress bytes.`,
    `This projection cannot create an AWS resource, incur a charge, or stop an active deletion, append, purge, restore or residue verification.`,
  ].join("\n");
}

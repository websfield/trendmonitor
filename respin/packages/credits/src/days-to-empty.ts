import {
  assertScoped,
  hasOpenPause,
  ScopeForgeryError,
  usageRunwayDebits,
  type DbLike,
  type TxLike,
  type UsageRunwayDebits,
  type WorkspaceScope,
} from "@respin/db";
import { getActiveConfig, type RespinConfigV1 } from "@respin/config";
import { deriveBalanceInTx, type BalanceView } from "./balance";
import { getDbNow } from "./clock";

export type DaysToEmptyConfig = RespinConfigV1["daysToEmpty"];

/**
 * The workspace-grain cage gate shared by every runway entry point.
 * `assertScoped` rejects forgeries; the second check rejects a genuinely
 * minted ProfileScope cast to WorkspaceScope before any field is trusted.
 */
export function assertUsageRunwayScope(
  scope: unknown
): asserts scope is WorkspaceScope {
  assertScoped(scope);
  if ("profileId" in scope) {
    throw new ScopeForgeryError("A usage-runway workspace scope");
  }
}

type UsageRunwayReadFields = {
  asOf: Date;
  windowStart: Date;
  trailingWindowDays: number;
  minimumDebitDays: number;
  debitDayCount: number;
  balance: number;
  totalDebit: number;
};

export type UsageRunwayResult =
  | (UsageRunwayReadFields & {
      state: "estimate";
      dailyRate: number;
      daysToEmpty: number;
    })
  | (UsageRunwayReadFields & { state: "paused" })
  | (UsageRunwayReadFields & { state: "no_spend" })
  | (UsageRunwayReadFields & { state: "too_few_debit_days" })
  | {
      state: "read_unavailable";
      component: "config" | "pause" | "balance" | "ledger";
      asOf: Date;
      trailingWindowDays?: number;
      minimumDebitDays?: number;
      paused?: boolean;
      balance?: number;
    };

export type UsageRunwayProjectionInput = {
  config: DaysToEmptyConfig;
  paused: boolean;
  balance: number;
  ledger: UsageRunwayDebits;
};

/** Pure C8 projection. Thresholds come only from the active config. */
export function projectUsageRunway(
  input: UsageRunwayProjectionInput
): Exclude<UsageRunwayResult, { state: "read_unavailable" }> {
  const fields: UsageRunwayReadFields = {
    asOf: input.ledger.asOf,
    windowStart: input.ledger.windowStart,
    trailingWindowDays: input.config.trailingWindowDays,
    minimumDebitDays: input.config.minimumDebitDays,
    debitDayCount: input.ledger.distinctDebitDays,
    balance: input.balance,
    totalDebit: input.ledger.totalDebit,
  };

  if (input.paused) return { state: "paused", ...fields };
  if (input.ledger.totalDebit === 0) {
    return { state: "no_spend", ...fields };
  }
  if (input.ledger.distinctDebitDays < input.config.minimumDebitDays) {
    return { state: "too_few_debit_days", ...fields };
  }

  const dailyRate = input.ledger.totalDebit / input.config.trailingWindowDays;
  return {
    state: "estimate",
    ...fields,
    dailyRate,
    daysToEmpty: Math.ceil(input.balance / dailyRate),
  };
}

/**
 * Explicit read ports keep each unavailable component independently testable.
 * Production supplies the closed constant below; no app-facing caller can
 * replace an authority or inject a visible-ledger/model-usage substitute.
 */
export type UsageRunwayReaders = {
  asOf: (tx: TxLike) => Promise<Date>;
  config: (tx: TxLike) => Promise<DaysToEmptyConfig>;
  pause: (
    tx: TxLike,
    workspaceId: WorkspaceScope["workspaceId"]
  ) => Promise<boolean>;
  balance: (
    tx: TxLike,
    workspaceId: WorkspaceScope["workspaceId"],
    asOf: Date
  ) => Promise<BalanceView>;
  ledger: (
    tx: TxLike,
    scope: WorkspaceScope,
    asOf: Date,
    trailingWindowDays: number
  ) => Promise<UsageRunwayDebits>;
};

const AUTHORITATIVE_READERS: UsageRunwayReaders = {
  asOf: getDbNow,
  config: async (tx) => (await getActiveConfig(tx)).content.daysToEmpty,
  pause: hasOpenPause,
  balance: deriveBalanceInTx,
  ledger: usageRunwayDebits,
};

/** One already-open transaction; exported for focused authority-wiring tests. */
export async function usageRunwayInTx(
  tx: TxLike,
  scope: WorkspaceScope,
  readers: UsageRunwayReaders
): Promise<UsageRunwayResult> {
  assertUsageRunwayScope(scope);
  // Clock failures are not relabelled as one of the four data components: C8
  // defines no honest projection state without an authoritative DB instant.
  const asOf = await readers.asOf(tx);

  let config: DaysToEmptyConfig;
  try {
    config = await readers.config(tx);
  } catch {
    return { state: "read_unavailable", component: "config", asOf };
  }

  let paused: boolean;
  try {
    paused = await readers.pause(tx, scope.workspaceId);
  } catch {
    return {
      state: "read_unavailable",
      component: "pause",
      asOf,
      ...config,
    };
  }

  let balance: BalanceView;
  try {
    balance = await readers.balance(tx, scope.workspaceId, asOf);
  } catch {
    return {
      state: "read_unavailable",
      component: "balance",
      asOf,
      ...config,
      paused,
    };
  }
  if (balance.asOf.getTime() !== asOf.getTime()) {
    return {
      state: "read_unavailable",
      component: "balance",
      asOf,
      ...config,
      paused,
    };
  }

  let ledger: UsageRunwayDebits;
  try {
    ledger = await readers.ledger(
      tx,
      scope,
      asOf,
      config.trailingWindowDays
    );
  } catch {
    return {
      state: "read_unavailable",
      component: "ledger",
      asOf,
      ...config,
      paused,
      balance: balance.balance,
    };
  }
  if (
    ledger.asOf.getTime() !== asOf.getTime() ||
    !Number.isFinite(ledger.totalDebit) ||
    ledger.totalDebit < 0 ||
    !Number.isInteger(ledger.distinctDebitDays) ||
    ledger.distinctDebitDays < 0
  ) {
    return {
      state: "read_unavailable",
      component: "ledger",
      asOf,
      ...config,
      paused,
      balance: balance.balance,
    };
  }

  return projectUsageRunway({
    config,
    paused,
    balance: balance.balance,
    ledger,
  });
}

/**
 * C8's sole runway transaction: one repeatable snapshot, one DB as-of, and no
 * visible-ledger, model-usage, or monthly-spend reader.
 */
export async function usageRunwayFor(
  db: DbLike,
  scope: WorkspaceScope
): Promise<UsageRunwayResult> {
  assertUsageRunwayScope(scope);
  return usageRunwayForWithReaders(db, scope, AUTHORITATIVE_READERS);
}

/** Package-internal test seam; deliberately absent from the package barrel. */
export async function usageRunwayForWithReaders(
  db: DbLike,
  scope: WorkspaceScope,
  readers: UsageRunwayReaders
): Promise<UsageRunwayResult> {
  assertUsageRunwayScope(scope);
  return db.transaction(
    (tx) => usageRunwayInTx(tx, scope, readers),
    { isolationLevel: "repeatable read" }
  );
}

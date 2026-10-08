// Phase 10b-1 Task 6.6 — the worker-side composition of the retention receiver.
//
// The receiver runs ONLY here, for the reason the deletion executor does (plan
// C2: never inside an HTTP request). Two ticks share one schedule:
//
//   * `runRetentionTick` — every scheduled retention clock the registry
//     declares, including the Stripe payload redaction and its same-transaction
//     finance extract.
//   * `runGenerationRecoveryTick` — the attempt boundaries, which C5 puts on a
//     ONE-MINUTE clock rather than the retention cadence because a candidate
//     unsettled for five minutes is money in an unknown state.
//
// Everything this module emits is codes and counts. C5: "Metrics/logs contain
// codes/counts/opaque request ids only" — so no table row, no failure message
// from the driver, and no identifier reaches an event.
import type { SafeWorkerEventInput } from "./health";
import {
  UNSETTLED_CANDIDATE_ALERT_MS,
  runGenerationRecoveryTick,
  runRetentionTick,
  recoverStalePublicSampleSpinAttempts,
  type DbLike,
  type GenerationRecoveryOutcome,
  type RetentionTickSummary,
} from "@respin/db";

/** C5's clocks are daily-to-yearly; a minute's cadence is the attempt receiver's. */
export const RETENTION_TICK_CRON = "*/1 * * * *";

export type RetentionRunSummary = Readonly<{
  retention: RetentionTickSummary;
  generation: GenerationRecoveryOutcome;
  /** Phase 10a: public Sample Spin attempts recovered unknown this tick, and candidates whose recovery FAILED (each is retried next tick, and pages while it keeps failing). */
  sampleSpin: Readonly<{ recovered: number; failed: number }>;
}>;

export type RetentionTickPorts = Readonly<{
  db: DbLike;
  /**
   * The active config's `llm.overallDeadlineMs`, resolved by the caller ONCE
   * per tick — the same discipline the autopsy dispatcher follows, so a config
   * change mid-sweep cannot move the boundary under half the rows.
   */
  overallDeadlineMs: number;
}>;

export async function runRetentionAndRecovery(
  ports: RetentionTickPorts,
  now: Date,
): Promise<RetentionRunSummary> {
  const retention = await runRetentionTick(ports.db, now);
  const generation = await runGenerationRecoveryTick(ports.db, now, {
    overallDeadlineMs: ports.overallDeadlineMs,
  });
  // Phase 10a (R-117): an outbound-started public Sample Spin whose process
  // died is finalised unknown / recovery-required here, on the same
  // traffic-independent tick, and never reissued.
  const sampleSpin = await recoverStalePublicSampleSpinAttempts(ports.db);
  return { retention, generation, sampleSpin };
}

/**
 * The alert conditions C5 names for this receiver, evaluated from a summary
 * alone so the thresholds are testable without a database.
 *
 * `retention_overdue_backlog` is the one that matters and the one a heartbeat
 * cannot give you: a receiver can tick green every minute while falling further
 * behind, and the age of the oldest still-overdue row is what shows it.
 */
export type RetentionAlertCode =
  | "retention_sweep_failed"
  | "retention_overdue_backlog"
  | "retention_batch_truncated"
  | "retention_poisoned_rows"
  | "generation_recovery_failed"
  | "generation_started_past_deadline"
  | "generation_unsettled_aging"
  | "generation_candidates_cleared"
  | "sample_spin_recovery_failed";

/**
 * The alert's payload is typed as the worker's content-safe event input, NOT as
 * a free record. `toSafeWorkerEvent` silently drops any field outside its
 * allowlist, so an untyped detail bag would emit an alert with no numbers in it
 * and look fine — the vacuous-metric shape the 2026-09-04 lesson names. Typing
 * it here makes an un-allowlisted field a typecheck failure instead.
 */
export type RetentionAlertDetail = Omit<SafeWorkerEventInput, "code" | "observedAt">;

export type RetentionAlert = Readonly<{
  code: RetentionAlertCode;
  severity: "warning" | "critical";
  detail: RetentionAlertDetail;
}>;

/**
 * A governed row more than a day past its deadline means the receiver is not
 * keeping up with a clock whose shortest window is 24 hours, so the row has
 * already outlived the promise made about it.
 */
export const OVERDUE_BACKLOG_MS = 24 * 60 * 60_000;

export function evaluateRetentionAlerts(summary: RetentionRunSummary): readonly RetentionAlert[] {
  const alerts: RetentionAlert[] = [];
  for (const table of summary.retention.tables) {
    if (table.failureCode !== null) {
      alerts.push({
        code: "retention_sweep_failed",
        severity: "critical",
        detail: { retentionKey: table.key, reasonCode: table.failureCode },
      });
    }
    if (table.truncated) {
      alerts.push({
        code: "retention_batch_truncated",
        severity: "warning",
        detail: { retentionKey: table.key, retentionScanned: table.scanned },
      });
    }
  }
  // A row that cannot be written EVEN ALONE. Before the batch-isolation fix
  // one such row rolled its whole batch back and the table never advanced
  // again, on any tick, while the per-table catch reported a single failure
  // code and `oldestOverdueMs` read null. It now makes progress around the bad
  // row -- which means the bad row would otherwise sit there silently forever,
  // so it has to page.
  if (summary.retention.poisoned > 0) {
    alerts.push({
      code: "retention_poisoned_rows",
      severity: "critical",
      detail: { retentionPoisoned: summary.retention.poisoned },
    });
  }
  const oldest = summary.retention.oldestOverdueMs;
  if (oldest !== null && oldest > OVERDUE_BACKLOG_MS) {
    alerts.push({
      code: "retention_overdue_backlog",
      severity: "critical",
      detail: { retentionOldestOverdueMs: oldest },
    });
  }
  if (summary.generation.failureCode !== null) {
    alerts.push({
      code: "generation_recovery_failed",
      severity: "critical",
      detail: { reasonCode: summary.generation.failureCode },
    });
  }
  // A public attempt whose recovery fails EVEN ALONE (round-2 code review and
  // billing, 2026-09-09): the per-candidate isolation that keeps the tick
  // alive would otherwise turn a loud job failure into a claim that loops
  // silently forever, its unknown fact never appended. Same shape as
  // `retention_poisoned_rows`: progress around it, and page.
  if (summary.sampleSpin.failed > 0) {
    alerts.push({
      code: "sample_spin_recovery_failed",
      severity: "critical",
      detail: { sampleSpinRecoveryFailed: summary.sampleSpin.failed },
    });
  }
  // A STARTED ATTEMPT PAST ITS DEADLINE (audit P3-A6). The sweep moves it to
  // `recovery_required` and never retries it, because the provider may have
  // produced — and billed — a completion this process never saw. That is
  // vendor spend with no settled output and no customer debit, so it pages
  // rather than sitting in a counter nobody reads.
  if (summary.generation.startedPastDeadline > 0) {
    alerts.push({
      code: "generation_started_past_deadline",
      severity: "critical",
      detail: { generationPastDeadline: summary.generation.startedPastDeadline },
    });
  }
  // THE PAGE BEFORE THE CLEAR (audit P3-R1(a)). `generation_candidates_cleared`
  // below fires when the paid output is destroyed; this one fires while it can
  // still be settled — by the creator's "Finish this draft" or the operator's
  // `scripts/settle-candidate.ts` — on the age of the OLDEST waiting candidate,
  // the `retentionOldestOverdueMs` shape.
  const oldestUnsettled = summary.generation.oldestUnsettledMs;
  if (oldestUnsettled !== null && oldestUnsettled > UNSETTLED_CANDIDATE_ALERT_MS) {
    alerts.push({
      code: "generation_unsettled_aging",
      severity: "critical",
      detail: {
        generationOldestUnsettledMs: oldestUnsettled,
        generationSettleable: summary.generation.settleableCandidates,
      },
    });
  }
  if (summary.generation.hardCleared > 0) {
    // C5 requires an alert on the 24-hour clear specifically: every cleared row
    // is a candidate whose provider call may already have been charged for and
    // whose settlement never happened. It needs a human, not just a counter.
    alerts.push({
      code: "generation_candidates_cleared",
      severity: "critical",
      detail: { generationHardCleared: summary.generation.hardCleared },
    });
  }
  return alerts;
}

/**
 * The content-safe event body for one tick's aggregates. Per-table counts are
 * emitted separately by `retentionTableEvents` rather than flattened into
 * dynamic `rows_<table>` keys: the allowlist cannot carry a dynamic key, and a
 * dropped key is a metric that reads zero forever.
 *
 * `retentionOldestOverdueMs` is OMITTED rather than sent as a sentinel when
 * nothing is overdue — the allowlist rejects negatives, and "no backlog"
 * charted as a number would be indistinguishable from a real measurement.
 */
export function retentionTickEvent(summary: RetentionRunSummary): RetentionAlertDetail {
  const event: {
    retentionScanned: number;
    retentionRedacted: number;
    retentionDeleted: number;
    retentionFinanceExtracts: number;
    retentionFailures: number;
    retentionTruncated: number;
    generationAbandoned: number;
    generationPastDeadline: number;
    generationSettleable: number;
    generationHardCleared: number;
    generationOldestUnsettledMs?: number;
    retentionPoisoned: number;
    sampleSpinRecovered: number;
    sampleSpinRecoveryFailed: number;
    retentionOldestOverdueMs?: number;
  } = {
    retentionScanned: summary.retention.scanned,
    retentionRedacted: summary.retention.redacted,
    retentionDeleted: summary.retention.deleted,
    retentionFinanceExtracts: summary.retention.financeExtractsWritten,
    retentionFailures: summary.retention.failures.length,
    retentionTruncated: summary.retention.tables.filter((table) => table.truncated).length,
    // Declared in health.ts's allowlist since the fix round but never sent —
    // the "declared and unbuilt" shape (consolidating review, round 2).
    retentionPoisoned: summary.retention.poisoned,
    generationAbandoned: summary.generation.abandonedBeforeVendor,
    generationPastDeadline: summary.generation.startedPastDeadline,
    generationSettleable: summary.generation.settleableCandidates,
    generationHardCleared: summary.generation.hardCleared,
    sampleSpinRecovered: summary.sampleSpin.recovered,
    sampleSpinRecoveryFailed: summary.sampleSpin.failed,
  };
  if (summary.retention.oldestOverdueMs !== null) {
    event.retentionOldestOverdueMs = summary.retention.oldestOverdueMs;
  }
  // Omitted, not zeroed, when nothing waits — the same rule as the backlog age.
  if (summary.generation.oldestUnsettledMs !== null) {
    event.generationOldestUnsettledMs = summary.generation.oldestUnsettledMs;
  }
  return event;
}

/**
 * One event per swept table — "rows scanned/redacted/deleted BY TABLE", which
 * C5 requires the worker to export. Only tables that actually did something are
 * emitted, so a quiet tick stays quiet.
 */
export function retentionTableEvents(summary: RetentionRunSummary): readonly RetentionAlertDetail[] {
  return summary.retention.tables
    .filter((table) => table.scanned > 0 || table.deleted > 0 || table.redacted > 0)
    .map((table) => {
      const event: RetentionAlertDetail & { retentionOldestOverdueMs?: number } = {
        retentionKey: table.key,
        retentionScanned: table.scanned,
        retentionRedacted: table.redacted,
        retentionDeleted: table.deleted,
      };
      if (table.oldestOverdueMs !== null) event.retentionOldestOverdueMs = table.oldestOverdueMs;
      return event;
    });
}

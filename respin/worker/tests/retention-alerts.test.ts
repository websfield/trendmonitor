// Phase 10b-1 round 3 — the retention receiver's ALERTS, and the fact that
// anything schedules it at all.
//
// Both were unwitnessed. `evaluateRetentionAlerts` and `OVERDUE_BACKLOG_MS` had
// no test of any kind: a grep for either name across the whole tree returned
// nothing outside their own source file. So did `RETENTION_QUEUE` and
// `runRetentionAndRecovery`. Every clock this slice ships — the 90-day Stripe
// payload redaction, the seven-day recovery digest, the two-year activation
// aggregate — rides a registration nothing asserted, behind an
// `if (this.#sources.runRetention)` that a composition can simply not satisfy.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { toSafeWorkerEvent } from "../health";
import { OVERDUE_BACKLOG_MS, evaluateRetentionAlerts, retentionTickEvent, type RetentionRunSummary } from "../retention";

const WORKER = dirname(dirname(fileURLToPath(import.meta.url)));

const table = (over: Partial<RetentionRunSummary["retention"]["tables"][number]> = {}) => ({
  key: "stripe_events::stripe_unattributed::provider_payload",
  table: "stripe_events",
  rule: "stripe_payload_90_days",
  scanned: 0,
  redacted: 0,
  deleted: 0,
  oldestOverdueMs: null,
  truncated: false,
  poisoned: 0,
  failureCode: null,
  ...over,
});

const summary = (over: Partial<RetentionRunSummary["retention"]> = {}): RetentionRunSummary => ({
  retention: {
    startedAt: new Date("2026-09-08T00:00:00.000Z"),
    tables: [table()],
    scanned: 0,
    redacted: 0,
    deleted: 0,
    financeExtractsWritten: 0,
    oldestOverdueMs: null,
    poisoned: 0,
    failures: [],
    ...over,
  },
  generation: {
    abandonedBeforeVendor: 0,
    startedPastDeadline: 0,
    settlementAttempted: 0,
    hardCleared: 0,
    failureCode: null,
  },
  sampleSpin: { recovered: 0, failed: 0 },
});

const codes = (s: RetentionRunSummary) => evaluateRetentionAlerts(s).map((alert) => alert.code).sort();

describe("retention alerts", () => {
  it("a public Sample Spin candidate whose recovery failed pages, and both counts survive the event allowlist (round 2, 2026-09-09)", () => {
    const failing = { ...summary(), sampleSpin: { recovered: 2, failed: 1 } };
    const alerts = evaluateRetentionAlerts(failing);
    expect(alerts).toEqual([{ code: "sample_spin_recovery_failed", severity: "critical", detail: { sampleSpinRecoveryFailed: 1 } }]);
    // The allowlist keeps the two keys (a dropped key is a metric that reads zero forever).
    const event = toSafeWorkerEvent({ code: "retention_tick", observedAt: "2026-09-09T00:00:00.000Z", ...retentionTickEvent(failing) });
    expect(event).toMatchObject({ sampleSpinRecovered: 2, sampleSpinRecoveryFailed: 1 });
    // Recovered-only is a quiet tick.
    expect(codes({ ...summary(), sampleSpin: { recovered: 3, failed: 0 } })).toEqual([]);
  });

  it("a clean tick raises nothing — the non-vacuity baseline", () => {
    expect(codes(summary())).toEqual([]);
  });

  it("raises retention_sweep_failed on a table failure, carrying the CODE and never a message", () => {
    const alerts = evaluateRetentionAlerts(summary({ tables: [table({ failureCode: "sqlstate_23514" })] }));
    expect(alerts.map((a) => a.code)).toEqual(["retention_sweep_failed"]);
    expect(alerts[0]!.severity).toBe("critical");
    expect(alerts[0]!.detail).toEqual({
      retentionKey: "stripe_events::stripe_unattributed::provider_payload",
      reasonCode: "sqlstate_23514",
    });
  });

  it("raises retention_poisoned_rows for a row that cannot be written even alone", () => {
    // Before the batch-isolation fix such a row rolled its whole batch back and
    // the table never advanced again. It now makes progress AROUND the bad row,
    // which means the bad row would otherwise sit there silently for ever.
    const alerts = evaluateRetentionAlerts(summary({ poisoned: 2, tables: [table({ poisoned: 2 })] }));
    expect(alerts.map((a) => a.code)).toContain("retention_poisoned_rows");
    expect(alerts.find((a) => a.code === "retention_poisoned_rows")!.detail).toEqual({ retentionPoisoned: 2 });
  });

  it("raises retention_batch_truncated when the tick's batch ceiling stopped it short", () => {
    expect(codes(summary({ tables: [table({ truncated: true, scanned: 10_000 })] }))).toEqual([
      "retention_batch_truncated",
    ]);
  });

  describe("the overdue backlog threshold", () => {
    it("is quiet AT the boundary and critical one millisecond past it", () => {
      // The exact-boundary case, because a `>` and a `>=` differ here by a day
      // of undetected non-compliance.
      expect(codes(summary({ oldestOverdueMs: OVERDUE_BACKLOG_MS }))).toEqual([]);
      expect(codes(summary({ oldestOverdueMs: OVERDUE_BACKLOG_MS + 1 }))).toEqual([
        "retention_overdue_backlog",
      ]);
    });

    it("is quiet when nothing is overdue", () => {
      expect(codes(summary({ oldestOverdueMs: null }))).toEqual([]);
    });

    it("is one day, which is the shortest clock the receiver governs", () => {
      expect(OVERDUE_BACKLOG_MS).toBe(24 * 60 * 60 * 1000);
    });
  });

  it("a wedged table raises BOTH the failure and the backlog — the alarm is not muted by the failure", () => {
    // The defect this pins: `oldestOverdueMs` used to be computed only on the
    // success path, so a failing table reported null and the one signal that
    // measures the compliance deadline went quiet exactly when it mattered.
    expect(
      codes(summary({
        oldestOverdueMs: OVERDUE_BACKLOG_MS * 3,
        poisoned: 1,
        tables: [table({ failureCode: "sqlstate_23514", poisoned: 1, oldestOverdueMs: OVERDUE_BACKLOG_MS * 3 })],
      }))
    ).toEqual(["retention_overdue_backlog", "retention_poisoned_rows", "retention_sweep_failed"]);
  });
});

describe("the retention sweep is actually scheduled", () => {
  // Source-level, deliberately: the property is that the PRODUCTION composition
  // supplies the tick and the runtime registers it on a cron. Nothing asserted
  // either, and `runRetention` is optional in `PgBossRuntimeSources` — a
  // composition that omits it registers no queue and every clock in this slice
  // silently stops, with a green worker and a healthy heartbeat.
  const runtime = readFileSync(join(WORKER, "pg-boss-runtime.ts"), "utf8");
  const production = readFileSync(join(WORKER, "production.ts"), "utf8");

  it("the runtime schedules RETENTION_QUEUE on a cron and works it", () => {
    expect(runtime).toMatch(/schedule\(\s*RETENTION_QUEUE\s*,\s*RETENTION_CRON/);
    expect(runtime).toMatch(/RETENTION_CRON\s*=/);
  });

  it("the production composition supplies runRetention, so the guard above is not skipped", () => {
    // `if (this.#sources.runRetention)` is what gates registration. This is the
    // half that makes the condition true in production.
    expect(production).toMatch(/runRetention\s*:/);
    expect(production).toMatch(/runRetentionAndRecovery/);
  });

  it("the retention tick calls the public Sample Spin's stale recovery (Phase 10a; billing gate round 1)", () => {
    // Deleting the call left every test green: the recovery had no witness
    // on the tick that runs it. Source-level for the same reason as above.
    const retention = readFileSync(join(WORKER, "retention.ts"), "utf8");
    expect(retention).toMatch(/await recoverStalePublicSampleSpinAttempts\(ports\.db\)/);
  });

  it("the deletion lifecycle is scheduled too, on its own queue", () => {
    expect(runtime).toMatch(/schedule\(\s*DELETION_LIFECYCLE_QUEUE\s*,\s*DELETION_LIFECYCLE_CRON/);
  });
});

describe("the retention tick event carries the poisoned count (consolidating review, round 2)", () => {
  it("retentionPoisoned is SENT, not only allowlisted", async () => {
    const { retentionTickEvent } = await import("../retention");
    const event = retentionTickEvent({
      retention: {
        startedAt: new Date(),
        tables: [],
        scanned: 0,
        redacted: 0,
        deleted: 0,
        financeExtractsWritten: 0,
        oldestOverdueMs: null,
        poisoned: 3,
        failures: [],
      },
      generation: { abandonedBeforeVendor: 0, startedPastDeadline: 0, hardCleared: 0 },
      sampleSpin: { recovered: 0, failed: 0 },
    } as never);
    expect(event.retentionPoisoned).toBe(3);
  });
});

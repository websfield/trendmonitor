// Fold observability (audit 2026-08-17 #22, decision R-25/D-AUDIT-3).
//
// The architecture critic's finding was not that the O(n) fold is wrong today —
// it is that R-20/D-M1-7's escape hatch ("revisit if fold cost bites") names no
// metric and no threshold, so it is an escape hatch that CANNOT FIRE: nothing
// measures the thing that would trip it. D-AUDIT-3 fixed that by naming both.
// This module is where the numbers actually come from.
//
// Deliberately NOT a metrics library. There is no metrics backend in this
// project yet and inventing a dependency for two counters would be the
// over-engineering the keeping-it-lean rule warns about. A sink indirection
// costs one function and lets the Lightsail runbook point it at whatever it
// ends up using, while the default emits a structured, greppable line — the
// same shape the webhook refusal log uses, for the same reason.
//
// PII: the payload is a workspace UUID and two numbers. A workspace id is an
// internal identifier, not personal data (D-AUDIT-3 says so explicitly), and no
// creator identity, email or ledger content is ever in scope here.

import type { VerifiedWorkspaceId } from "@respin/db";

/** The metric names D-AUDIT-3 committed to. Changing one is a decision edit. */
export const FOLD_ROW_COUNT_METRIC = "respin.credits.fold.row_count";
export const FOLD_DURATION_METRIC = "respin.credits.fold.duration_ms";

/**
 * The revisit trigger that is observable from a SINGLE fold. D-AUDIT-3 names
 * two; only this one can fire from one call.
 *
 * The other — "seven-day p95 fold duration exceeds 250 ms" — is an aggregate
 * over a window this process does not hold, and it is NOT faked here. Claiming
 * a p95 from one sample would be exactly the measurement dishonesty the audit
 * exists to catch. The duration is emitted on every fold so the aggregate can
 * be computed where aggregates belong (the dashboard named in D-AUDIT-3, which
 * is deployment-gated); this constant is what a single fold can honestly assert.
 */
export const FOLD_ROW_COUNT_REVISIT_TRIGGER = 10_000;

/**
 * The p95 duration threshold, recorded so the number lives beside its sibling
 * and beside the code that produces the samples — NOT evaluated here, for the
 * reason above. It exists to be read by whatever computes the window.
 */
export const FOLD_DURATION_P95_REVISIT_TRIGGER_MS = 250;

export type FoldMetric = {
  workspaceId: VerifiedWorkspaceId;
  /** Ledger rows this fold replayed — the O(n) that D-M1-7 is about. */
  rowCount: number;
  durationMs: number;
};

export type FoldMetricSink = (m: FoldMetric) => void;

function defaultSink(m: FoldMetric): void {
  // One line, machine-readable, naming both metrics by their committed names so
  // a log-based collector needs no mapping table.
  console.info(
    `[respin-metric] ${FOLD_ROW_COUNT_METRIC}=${m.rowCount} ${FOLD_DURATION_METRIC}=${m.durationMs} workspace=${m.workspaceId}`
  );
  // The one trigger a single sample can honestly assert (see the constant).
  if (m.rowCount >= FOLD_ROW_COUNT_REVISIT_TRIGGER) {
    console.warn(
      `[respin-metric] REVISIT TRIGGER: workspace ${m.workspaceId} folded ${m.rowCount} ledger rows, at or past the ${FOLD_ROW_COUNT_REVISIT_TRIGGER}-row threshold recorded in decisions.md R-25/D-AUDIT-3. The fold is O(n) over a workspace's whole history under its advisory lock; this is the point at which the snapshot design D-M1-7 already names should be revisited.`
    );
  }
}

let sink: FoldMetricSink = defaultSink;

/** Point the metrics somewhere else (a collector, or a test's recorder). */
export function setFoldMetricSink(next: FoldMetricSink | null): void {
  sink = next ?? defaultSink;
}

/**
 * Emit one fold sample. NEVER throws into the caller: the balance authority is
 * the money path, and an observability failure must not be able to take down a
 * balance read. That is the whole reason this is a function and not an inline
 * console call — the try/catch has one place to live.
 */
export function emitFoldMetric(m: FoldMetric): void {
  try {
    sink(m);
  } catch (err) {
    console.warn("[respin-metric] fold metric sink threw; ignoring", err);
  }
}

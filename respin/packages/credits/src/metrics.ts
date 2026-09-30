// Money-path observability. TWO metrics live here, and the second one is not a
// fold metric — see the divider below.
//
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
// PII: the FOLD payload is a workspace UUID and two numbers. A workspace id is
// an internal identifier, not personal data (D-AUDIT-3 says so explicitly), and
// no creator identity, email or ledger content is ever in scope here. The cap
// metric below states its own payload separately rather than inheriting this
// sentence — it carries a profile id, which this one does not.

import type { VerifiedProfileId, VerifiedWorkspaceId } from "@respin/db";

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
    warnSinkThrew("fold", err);
  }
}

/**
 * The one way this module reports a sink throwing.
 *
 * NEVER THE ERROR OBJECT ITSELF (P1-R6, audit REG-13). A sink is arbitrary
 * caller code, so its throw can carry anything: a `DrizzleQueryError`'s message
 * embeds the bound query parameters, which on the intake path is the creator's
 * own post text. The closed-alphabet CLASS LABEL is the whole safe payload —
 * the same field `app/(product)/safe-log.ts`'s `errorName` emits, spelled here
 * because `packages/**` cannot import from `app/**`.
 *
 * ONE HELPER, NOT THREE CALL SITES. All three metric emitters below carried the
 * identical `console.warn("… threw; ignoring", err)` line, and all three were
 * invisible to the scan that guards this rule: it bounded its match with
 * `[^;]`, so the `;` in "threw; ignoring" ended the match before the `, err`.
 * Fixing one and leaving two is how this defect class comes back, so the shape
 * now exists in exactly one place. The scan reads the call's arguments instead
 * of bounding a character class (`tests/safe-log.test.ts`).
 */
function warnSinkThrew(which: string, err: unknown): void {
  console.warn(
    `[respin-metric] ${which} metric sink threw; ignoring errorName=${sinkErrorName(err)}`
  );
}

/** Closed-alphabet class label — constructor metadata is attacker-controlled too. */
function sinkErrorName(err: unknown): string {
  if (!(err instanceof Error)) {
    return typeof err === "object" && err !== null ? "UnknownObject" : typeof err;
  }
  const candidate = err.constructor?.name ?? err.name;
  return /^[A-Za-z][A-Za-z0-9]*$/.test(candidate) ? candidate : "Error";
}

// ---------------------------------------------------------------------------
// THE UNCHARGED-BILLABLE CAP (billing gate round 2, 2026-09-01).
//
// WHY THIS COUNTER EXISTS AT ALL. `generation.unchargedAttemptWindowMinutes`
// turned the uncharged-billable cap from a LIFETIME count into a 60-minute
// one, which was the right trade — the lifetime version was a permanent,
// operator-only, globally-keyed refusal on the product's main verb — but it
// converted a bounded-forever exposure into an UNBOUNDED-RATE one: a profile
// may burn a windowful of vendor calls we pay for and the creator does not,
// every window, forever. That is on a Free tier that requires no card (R-55)
// and whose email addresses nothing bounds (R17). The number is not the gap;
// the gap was that NOTHING COUNTED OR SURFACED the channel, so the first abuse
// of it would be learned about from an invoice rather than from the system.
//
// WHAT ONE SAMPLE CAN HONESTLY ASSERT, and what it cannot — the same line the
// fold metrics draw above. One sample says "this profile is AT its cap right
// now, and here is what it cost the shape of". It does NOT say a rate, and no
// rate is faked here: "how many distinct profiles capped this hour" is an
// aggregate over a window this process does not hold, and it is computed where
// aggregates belong. No threshold constant sits here for the same reason —
// inventing one would be a specific nobody chose (non-negotiable 6).
//
// THE POPULATION IS A LIST, NOT A PATH (CLAUDE.md 2026-08-29). Both cap sites
// emit: `generate.ts`'s generation cap and `inference.ts`'s onboarding cap.
// Adding a third priced purpose is what costs a third emit, and
// `unchargedAttemptCap`'s total `Record` is where that is compulsory.
//
// PII: a workspace UUID, a profile UUID, a purpose string and three numbers.
// A creator-profile id is an internal identifier — the profile's display name,
// its posts and its brain are not in scope here and must never be added.

/** The metric name. Changing it is a decision edit, like its fold siblings. */
export const UNCHARGED_ATTEMPT_CAP_METRIC =
  "respin.credits.uncharged_billable_attempts.capped";

export type UnchargedAttemptCapMetric = {
  workspaceId: VerifiedWorkspaceId;
  profileId: VerifiedProfileId;
  /** Which priced operation's count this is — the caps are per purpose. */
  purpose: string;
  /** Distinct uncharged-billable attempts counted inside the window. */
  attempts: number;
  /**
   * The configured ATTEMPT cap. NOT necessarily the one that was crossed —
   * read `bound` for that.
   */
  cap: number;
  /**
   * WHICH OF THE TWO BOUNDS ACTUALLY REFUSED (billing + code review, round 2).
   *
   * R-102 added a money-denominated twin of the attempt cap and reused this
   * metric verbatim for it, so a cost refusal printed `attempts=2 cap=10` —
   * numbers that say the cap was NOT crossed — on the only operator surface
   * this control has. The two refusals were indistinguishable in telemetry,
   * which is exactly the failure the counter exists to prevent ("the first
   * abuse of an unmeasured channel is learned about from an invoice").
   */
  bound: "attempts" | "cost";
  /** Spend in the window, and the money cap — present on a cost refusal. */
  costMicroUsd?: number;
  capMicroUsd?: number;
  /**
   * The window the count was taken over, or `null` for a LIFETIME count.
   *
   * `null` is not "unknown" — it is the onboarding purpose's real answer
   * (`unchargedAttemptWindowStart` returns the epoch for it), and the two
   * cases mean opposite things to an operator reading this line: a windowed
   * cap clears itself, a lifetime one does not and names a stuck profile.
   */
  windowMinutes: number | null;
};

export type UnchargedAttemptCapMetricSink = (
  m: UnchargedAttemptCapMetric
) => void;

function defaultCapSink(m: UnchargedAttemptCapMetric): void {
  // `warn`, not `info`, and that is the difference from the fold line above: a
  // fold sample is the ordinary case and this one is a refusal that already
  // happened. The line carries everything needed to find the profile without a
  // second query, because the operator surface R-67 asks for does not exist
  // yet and a log line that needs a join is not one.
  // `bound` FIRST after the name, because it decides how to read the rest.
  const money =
    m.bound === "cost"
      ? ` cost_micro_usd=${m.costMicroUsd ?? "unknown"} cap_micro_usd=${m.capMicroUsd ?? "unknown"}`
      : "";
  console.warn(
    `[respin-metric] ${UNCHARGED_ATTEMPT_CAP_METRIC}=1 bound=${m.bound} purpose=${m.purpose} attempts=${m.attempts} cap=${m.cap}${money} window_minutes=${m.windowMinutes ?? "lifetime"} workspace=${m.workspaceId} profile=${m.profileId}`
  );
}

let capSink: UnchargedAttemptCapMetricSink = defaultCapSink;

/** Point the cap metric somewhere else (a collector, or a test's recorder). */
export function setUnchargedAttemptCapMetricSink(
  next: UnchargedAttemptCapMetricSink | null
): void {
  capSink = next ?? defaultCapSink;
}

/**
 * Emit one cap crossing. NEVER throws into the caller, for a sharper reason
 * than the fold's: this fires immediately before a typed refusal, so a sink
 * that threw would replace `GenerationUnchargedAttemptCapError` — a refusal
 * whose whole job is to tell the creator what happened — with a telemetry
 * stack trace rendered as "Something went wrong". Driven in `generate.test.ts`.
 */
export function emitUnchargedAttemptCapMetric(
  m: UnchargedAttemptCapMetric
): void {
  try {
    capSink(m);
  } catch (err) {
    warnSinkThrew("uncharged-attempt cap", err);
  }
}

// ---------------------------------------------------------------------------
// THE FRAMEWORK OFFER'S DROPPED ROWS (billing gate, 2026-09-01).
//
// WHY THIS COUNTER EXISTS. `frameworksForContext` bounds how much of one
// prompt the framework library may occupy, and a row that does not fit is
// simply not offered — the model never sees it, and nothing anywhere says so.
// The gate measured what that hides: with private frameworks of 526 characters
// against a curated average of 593 — ordinary rows, not pathological ones — a
// profile at 30 private frameworks lost two of the nine seeded ones and at 40
// lost ALL NINE, because the accessor ORDERED BY `slug ASC` alone and every
// curated framework is named "The ..." (it sorts shared rows first now — see
// `eligibleFrameworks` — which is the other half of the same fix).
// The eviction is fixed at the offer (curated first); this is the other half —
// a creator can still fill the budget with their OWN rows, and when the
// product stops offering material a paying creator's plan includes, that must
// be a line somewhere rather than a silence. It is the
// `UNCHARGED_ATTEMPT_CAP_METRIC` precedent one file over: the first abuse of
// an unmeasured channel is learned about from an invoice.
//
// WHAT ONE SAMPLE CAN HONESTLY ASSERT: "this generation offered N of M
// eligible frameworks, and here is the split by visibility". It does NOT say a
// rate, and no rate is faked here. It is emitted on the drop only, not on
// every generation — a metric on the ordinary path would be a line per press
// with nothing in it.
//
// PII: a workspace UUID, a profile UUID, a mode id and four numbers. No
// framework name, no creator content, no prompt text — a private framework's
// NAME is the creator's own material and must never be added here.

/** The metric name. Changing it is a decision edit, like its siblings. */
export const FRAMEWORK_OFFER_DROPPED_METRIC =
  "respin.credits.framework_offer.dropped";

export type FrameworkOfferDroppedMetric = {
  workspaceId: VerifiedWorkspaceId;
  profileId: VerifiedProfileId;
  /** The mode whose prompt this offer was built for. */
  mode: string;
  /** Eligible rows the accessor returned. */
  eligible: number;
  /** Rows actually offered to the model. */
  offered: number;
  /**
   * SHARED rows dropped — the number that should be ZERO, always.
   *
   * It is a separate field rather than a total because the two mean different
   * things to an operator: a dropped PRIVATE row is a creator who has written
   * more frameworks than one prompt can carry, which is working as designed; a
   * dropped SHARED row is the curated library being rationed, which the offer
   * order is supposed to make impossible and which a single curated row larger
   * than the whole budget could still cause.
   */
  droppedShared: number;
  droppedPrivate: number;
  /** The budget this offer was measured against, in characters. */
  charBudget: number;
};

export type FrameworkOfferDroppedMetricSink = (
  m: FrameworkOfferDroppedMetric
) => void;

function defaultOfferSink(m: FrameworkOfferDroppedMetric): void {
  // `warn` when a CURATED row was dropped, `info` otherwise, and the split is
  // the point: one of those is the product rationing its own library and the
  // other is a creator using theirs.
  const line = `[respin-metric] ${FRAMEWORK_OFFER_DROPPED_METRIC}=1 mode=${m.mode} eligible=${m.eligible} offered=${m.offered} dropped_shared=${m.droppedShared} dropped_private=${m.droppedPrivate} char_budget=${m.charBudget} workspace=${m.workspaceId} profile=${m.profileId}`;
  if (m.droppedShared > 0) console.warn(line);
  else console.info(line);
}

let offerSink: FrameworkOfferDroppedMetricSink = defaultOfferSink;

/** Point the offer metric somewhere else (a collector, or a test's recorder). */
export function setFrameworkOfferDroppedMetricSink(
  next: FrameworkOfferDroppedMetricSink | null
): void {
  offerSink = next ?? defaultOfferSink;
}

/**
 * Emit one dropped-offer sample. NEVER throws into the caller: this runs on
 * the generation path BEFORE the vendor call, so a sink that threw would turn
 * a working generation into an error the creator was charged nothing for and
 * learned nothing from.
 */
export function emitFrameworkOfferDroppedMetric(
  m: FrameworkOfferDroppedMetric
): void {
  try {
    offerSink(m);
  } catch (err) {
    warnSinkThrew("framework offer", err);
  }
}

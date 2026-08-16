// Pause record-keeping (D-M1-3, REQ-G08). recordPauseStart/End are
// record-keepers only — the pauseMonths bounds check lives in Phase 3's
// pauseSubscription action, which resolves months against config BEFORE
// calling Stripe and this. Closing the open row (ended_at) is pause_periods'
// ONE sanctioned update; the schema CHECK enforces ended_at > started_at.
//
// DUAL-TRUTH WARNING (Phase 3 contract): pause truth lives in pause_periods
// (debit guard) AND the subscriptions.pausedAt mirror (billing state) — they
// stay in sync ONLY because these two functions write both in one tx. Phase 3
// must NEVER write subscriptions.pausedAt directly; always go through here.
//
// TWO CLOCKS, FOUR COLUMNS (round-3 CHANGE 1 — read this before touching a
// bound). Every pause bound in this file compares a caller's KNOWLEDGE time
// (`event.created` for a webhook; "now" for the owner's own action) against a
// stored bound. `started_at`/`ended_at` are PROCESSING times — the DB clock at
// the moment we wrote the row, which for a webhook delivered after Stripe's
// backoff can be minutes later. `started_known_at`/`ended_known_at` are the
// knowledge times. A bound that mixes the two is a live money defect in both
// directions, and both directions have now happened:
//   - the OPEN side (migration 0007): a late-processed resume made a real,
//     current pause look stale, so no pause row was written at all;
//   - the CLOSE side (migration 0008): a late-processed PAUSE made a real,
//     current resume look stale, so the pause stayed OPEN forever — frozen
//     expiry clocks, `state: "paused"`, and M3's debit refusing, while Stripe
//     bills normally and no further event is coming.
// Knowledge is compared with knowledge on BOTH sides now, with the
// `?? <processing column>` fallback keeping pre-migration rows conservative.
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { PausePeriod, TxLike, VerifiedWorkspaceId } from "@respin/db";
import { pausePeriods, subscriptions } from "@respin/db";
import { assertWriteClock, CLOCK_SKEW_MS } from "./clock";
import { LedgerIntegrityError } from "./fold";

export async function hasOpenPause(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<boolean> {
  const [open] = await tx
    .select({ id: pausePeriods.id })
    .from(pausePeriods)
    .where(
      and(
        eq(pausePeriods.workspaceId, workspaceId),
        isNull(pausePeriods.endedAt)
      )
    )
    .limit(1);
  return open !== undefined;
}

/**
 * @param knownAt the moment the CALLER knew about this pause — `event.created`
 * for a webhook, omitted (then `at`) for the owner's own action. Stored as
 * `started_known_at` so the CLOSE-side staleness bound compares knowledge with
 * knowledge rather than with our processing time (round-3 CHANGE 1).
 */
export async function recordPauseStart(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date,
  resumesAt?: Date,
  knownAt?: Date
): Promise<PausePeriod> {
  await assertWriteClock(tx, workspaceId, at);
  if (await hasOpenPause(tx, workspaceId)) {
    throw new LedgerIntegrityError(
      "recordPauseStart: an open pause already exists for this workspace"
    );
  }
  const [row] = await tx
    .insert(pausePeriods)
    .values({ workspaceId, startedAt: at, startedKnownAt: knownAt ?? at })
    .returning();
  await tx
    .update(subscriptions)
    .set({ pausedAt: at, resumesAt: resumesAt ?? null })
    .where(eq(subscriptions.workspaceId, workspaceId));
  return row;
}

/**
 * CONVERGENT pause record-keepers (code-review CHANGE). A pause is committed
 * locally by TWO writers — the owner's pauseSubscription action and the
 * reconciling customer.subscription.updated webhook — in either order. These
 * converge (returning whether they changed anything) instead of throwing, so
 * whichever writer loses the race never surfaces a failure for an operation
 * Stripe has already performed.
 *
 * The strict recordPauseStart/recordPauseEnd keep their throwing contract for
 * callers that genuinely mean "this must be a state change".
 *
 * A true concurrent interleaving (both see no open pause, both insert) is
 * still caught by pause_periods_open_uq; that 23505 is NOT an idempotency
 * constraint, so it propagates and Stripe redelivers — it never becomes a
 * silent 200.
 */
/**
 * @param knownAt OPTIONAL staleness bound, SYMMETRIC with ensurePauseEnded's
 * (billing round-10 NOTE 3). Round 8 bounded the CLOSE side and left the OPEN
 * side unbounded, which leaves this live:
 *
 *   the owner pauses; the reconciling `customer.subscription.updated` (created
 *   during the pause, carrying `pause_collection`) is delayed; the owner then
 *   RESUMES, and `resumeSubscription` deliberately does not stamp
 *   `mirrorEventAt` (that watermark means "a full subscription snapshot", and
 *   stamping it from a partial write is a regression this handler has already
 *   made once); the delayed snapshot sails through the order guard and
 *   RE-OPENS the pause. Credits frozen and `state = "paused"` for a paying
 *   customer, plus a permanent spurious `pause_periods` row that shifts every
 *   lot's effective expiry through the D-M1-7 fold — and no further event is
 *   coming, because Stripe has already told us everything it knows.
 *
 * A pause period that ENDED after the moment the caller is reporting on cannot
 * be one the caller knows about, so its snapshot must not start a new one. Same
 * CLOCK_SKEW_MS tolerance and the same reason as the close side: Stripe's
 * `event.created` is second-granularity while `ended_at` is the millisecond DB
 * clock, so the ordinary pause-then-reconcile is routinely a few hundred ms
 * "older" than the row it reconciles. Omitted (the owner's own pause action)
 * means "now" — no bound.
 *
 * `knownAt` is also RECORDED (as `started_known_at`), because it is what a
 * later ensurePauseEnded compares itself against — round-3 CHANGE 1.
 */
export async function ensurePauseStarted(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date,
  resumesAt?: Date,
  knownAt?: Date
): Promise<boolean> {
  // THE STALENESS TEST RUNS FIRST — before the already-open early return
  // (billing round-11 NOTE, `pause.ts:104-119`). It used to sit below it, so
  // the bound protected only the "open a pause" branch while the `resumesAt`
  // write below ran UNBOUNDED. That leaves this live: pause 1 (resumes in
  // March) → owner resumes → owner pauses again (pause 2, resumes in June) →
  // the delayed pause-1-era snapshot lands, sees an open pause, and rewrites
  // the mirror's `resumesAt` to MARCH — a date belonging to a pause that ended,
  // on a pause that has not. No further event is coming to correct it. It is
  // display-only today (`state.ts` reads `resumesAt` into `BillingState`; the
  // expiry fold reads `pause_periods`, never this column) — and Phase 4 is what
  // displays it, on both the usage page's frozen notice and the settings page.
  //
  // A caller whose knowledge predates a resume we have already recorded knows
  // nothing about the pause that is open now, so it may neither start one nor
  // restate its resume date.
  if (knownAt) {
    const lastClose = await lastPauseCloseKnownAt(tx, workspaceId);
    if (lastClose && lastClose.getTime() - knownAt.getTime() > CLOCK_SKEW_MS) {
      return false;
    }
  }
  if (await hasOpenPause(tx, workspaceId)) {
    // Already paused — converge on the FACT of the pause, but never let the
    // resume DATE drift (code-review CHANGE): a re-pause of a different
    // length gives Stripe a new resumes_at, and if the mirror keeps the old
    // one the owner is shown a date that will never happen. Before the
    // convergence change the strict recordPauseStart threw here, so this
    // information could not be silently lost; converging without this update
    // would have made losing it the normal path.
    if (resumesAt) {
      await tx
        .update(subscriptions)
        .set({ resumesAt })
        .where(eq(subscriptions.workspaceId, workspaceId));
    }
    return false;
  }
  await recordPauseStart(tx, workspaceId, at, resumesAt, knownAt);
  return true;
}

/**
 * Converge the MIRROR on "not paused" when no pause period is open.
 *
 * The owner's resume path could reach a state where the two truths disagreed —
 * `subscriptions.pausedAt` set, no open `pause_periods` row (a reconciling
 * webhook closed the period without touching the mirror, or a pause was ever
 * recorded only in the mirror). `ensurePauseEnded` returns false there, and
 * `resumeSubscription` then redirected with no error at all: the Resume button
 * appeared to do nothing while the page kept saying "Paused", with no event
 * coming to correct it (round-2 NOTE 4).
 *
 * It lives HERE, beside the other two writers, because of this file's own
 * dual-truth rule: nothing outside pause.ts writes `subscriptions.pausedAt`.
 * It is deliberately NOT called from `ensurePauseEnded` — that helper's `false`
 * also means "this snapshot is too stale to be believed", and clearing the
 * mirror on THAT branch would undo a pause the owner just opened.
 */
export async function clearPauseMirror(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<boolean> {
  if (await hasOpenPause(tx, workspaceId)) return false;
  const rows = await tx
    .update(subscriptions)
    .set({ pausedAt: null, resumesAt: null })
    .where(
      and(
        eq(subscriptions.workspaceId, workspaceId),
        isNotNull(subscriptions.pausedAt)
      )
    )
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}

/**
 * The KNOWLEDGE time of the most recent close (the open-side bound's left half).
 *
 * Ordered AND projected on `coalesce(ended_known_at, ended_at)` — one
 * expression, so "most recent" and "what is returned" cannot disagree
 * (round-3 NOTE). Ordering on `ended_at` while returning `ended_known_at` was
 * safe only via the separate argument that pause periods cannot overlap; that
 * reasoning step is now removed rather than re-verified.
 *
 * The fallback covers rows written before `ended_known_at` existed, where the
 * processing time is the only close time we have (the old, conservative
 * behaviour).
 */
async function lastPauseCloseKnownAt(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<Date | null> {
  const closeKnownAt = sql<Date>`coalesce(${pausePeriods.endedKnownAt}, ${pausePeriods.endedAt})`;
  const [row] = await tx
    .select({ knownAt: closeKnownAt })
    .from(pausePeriods)
    .where(
      and(
        eq(pausePeriods.workspaceId, workspaceId),
        isNotNull(pausePeriods.endedAt)
      )
    )
    .orderBy(desc(closeKnownAt))
    .limit(1);
  if (!row?.knownAt) return null;
  return row.knownAt instanceof Date ? row.knownAt : new Date(row.knownAt);
}

/**
 * @param knownAt OPTIONAL staleness bound for callers whose knowledge has a
 * timestamp — the webhook's `event.created` (billing round-7 NOTE). A pause
 * that STARTED after the moment the caller is reporting on cannot be one the
 * caller knows about, so it must not be closed by it: the owner's
 * `pauseSubscription` writes the local pause without stamping `mirrorEventAt`
 * (that watermark means "a full subscription snapshot", and stamping it from a
 * partial write is a regression this handler has already made once), so a
 * `customer.subscription.updated` older than the pause but newer than the last
 * snapshot sails through the order guard and would close a pause opened
 * seconds ago. Omitted (the owner's own resume action) means "now" — no bound.
 *
 * The left half of the comparison is the pause's KNOWLEDGE time
 * (`started_known_at`, falling back to `started_at` for pre-0008 rows), NOT its
 * processing time. Migration 0007 fixed the open side and left this one mixing
 * clocks, which round 3 reproduced in PGlite through the real migrations: a
 * pause Stripe applied at T0 but processed at T0+5min, then resumed in Stripe
 * at T0+2min, saw 3 minutes of "staleness" and returned false — the pause row
 * stays OPEN, `effectiveExpiry` freezes every lot's clock indefinitely, and
 * NO FURTHER EVENT IS COMING. It self-heals only if the owner presses Resume
 * in-app.
 *
 * The comparison carries the package's existing CLOCK_SKEW_MS tolerance, and
 * must: Stripe's `event.created` is SECOND-granularity while `started_known_at`
 * is second-granularity for webhooks and the millisecond DB clock for the
 * owner's own pause, so the reconciling snapshot for a pause Stripe has just
 * applied is routinely a few hundred ms "older" than the row it is
 * reconciling. Without the tolerance this guard would refuse the ordinary
 * resume. It bites where it should: a snapshot created MINUTES before the
 * pause was known about.
 */
export async function ensurePauseEnded(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date,
  knownAt?: Date
): Promise<boolean> {
  const open = await openPause(tx, workspaceId);
  if (!open) return false;
  const openKnownAt = open.startedKnownAt ?? open.startedAt;
  if (knownAt && openKnownAt.getTime() - knownAt.getTime() > CLOCK_SKEW_MS) {
    return false;
  }
  // `knownAt` is RECORDED, not only checked: it is what a later
  // ensurePauseStarted compares itself against, and `at` (processing time) is
  // not the same clock (round-2 NOTE 3).
  await recordPauseEnd(tx, workspaceId, at, knownAt);
  return true;
}

/** The workspace's open pause row, if any (the one shape both helpers need). */
async function openPause(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId
): Promise<PausePeriod | undefined> {
  const [open] = await tx
    .select()
    .from(pausePeriods)
    .where(
      and(
        eq(pausePeriods.workspaceId, workspaceId),
        isNull(pausePeriods.endedAt)
      )
    )
    .limit(1);
  return open;
}

/**
 * @param knownAt the moment the CALLER knew about this resume — `event.created`
 * for a webhook, omitted (then `at`) for the owner's own action. Stored as
 * `ended_known_at` so the open-side staleness bound compares knowledge with
 * knowledge rather than with our processing time.
 */
export async function recordPauseEnd(
  tx: TxLike,
  workspaceId: VerifiedWorkspaceId,
  at: Date,
  knownAt?: Date
): Promise<PausePeriod> {
  await assertWriteClock(tx, workspaceId, at);
  const [open] = await tx
    .select()
    .from(pausePeriods)
    .where(
      and(
        eq(pausePeriods.workspaceId, workspaceId),
        isNull(pausePeriods.endedAt)
      )
    )
    .limit(1);
  if (!open) {
    throw new LedgerIntegrityError(
      "recordPauseEnd: no open pause exists for this workspace"
    );
  }
  if (at.getTime() <= open.startedAt.getTime()) {
    throw new LedgerIntegrityError(
      `recordPauseEnd: at (${at.toISOString()}) must be after the pause start (${open.startedAt.toISOString()})`
    );
  }
  const [closed] = await tx
    .update(pausePeriods)
    .set({ endedAt: at, endedKnownAt: knownAt ?? at })
    .where(eq(pausePeriods.id, open.id))
    .returning();
  await tx
    .update(subscriptions)
    .set({ pausedAt: null, resumesAt: null })
    .where(eq(subscriptions.workspaceId, workspaceId));
  return closed;
}

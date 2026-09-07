// The pause PREDICATE, moved here from @respin/credits on 2026-08-21 (plan A-7).
//
// WHY IT IS HERE AND NOT INJECTED. The M2a plan originally passed the predicate
// in at mint time, on the premise that packages/db could not reach it without a
// dependency cycle. That premise was false and two gates found it separately:
// `pause_periods` is defined at `billing-schema.ts:263` — packages/db OWNS the
// table — so the predicate is a six-line select that simply lives here. The
// injection bought a caller-side hole the graph never required (`isPaused` was
// structurally typed, so `async () => false` satisfied it) and had no wiring
// layer that could ever supply the real one.
//
// @respin/credits re-exports this, so its existing call sites are unchanged and
// there is still exactly ONE implementation.
//
// The pause WRITERS stay in @respin/credits: they also write the
// `subscriptions.pausedAt` mirror and must stay beside the dual-truth rule that
// governs it. Only the read moved.
import { and, eq, isNull } from "drizzle-orm";
import { pausePeriods } from "./billing-schema";
import type { DbLike, TxLike } from "./db-like";
import type { VerifiedWorkspaceId } from "./with-workspace";

/**
 * Is there an OPEN pause period? — the AUTHORITY on "is this workspace
 * paused", as opposed to the `subscriptions.pausedAt` mirror.
 *
 * Reading the mirror instead is the drift bug this function exists to make
 * impossible: an M2 onboarding workspace has no `subscriptions` row at all, so
 * a mirror-reading predicate answers "not paused" for every workspace on Free.
 *
 * Accepts a plain connection as well as a transaction: it is a single-row read
 * with no write to order against, and `createPackCheckoutUrl` — which must ask
 * this before charging — has no transaction to hand it.
 */
export async function hasOpenPause(
  tx: DbLike | TxLike,
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

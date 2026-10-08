// ONE DISPLAY READ PER REQUEST (audit Phase 8, gate M1).
//
// A Next App Router layout and the page beneath it render CONCURRENTLY, and
// both show the balance: the rail (`layout.tsx`) and the page's own figure
// (`/studio`'s cost sentence, `/usage`, `/onboarding`, first ideas). Each used
// to call `respinCredits.getDisplayBalance` itself, so one request ran two
// display reads at once — and the one that lost `pg_try_advisory_xact_lock`
// to the other came back `settling: true` with no money path running at all,
// showing two different numbers on one screen.
//
// React's `cache` (React 19, RSC) memoises per server request, keyed on the
// workspace id: the layout and the page share ONE promise, so one request
// makes one display read and every figure on the screen is the same read.
// The facade stays the only route to credits; this file is the only caller of
// `respinCredits.getDisplayBalance` under `app/(product)/**`, asserted by
// `packages/credits/tests/balance-contention.docker.test.ts`'s scan.
import { cache } from "react";
import {
  respinCredits,
  type DisplayBalanceView,
} from "@respin/credits/app-server";

/** The facade's own parameter: the same `VerifiedWorkspaceId` brand. */
type WorkspaceId = Parameters<typeof respinCredits.getDisplayBalance>[0];

export const displayBalanceFor = cache(
  (workspaceId: WorkspaceId): Promise<DisplayBalanceView> =>
    respinCredits.getDisplayBalance(workspaceId)
);

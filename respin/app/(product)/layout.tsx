// Authenticated product shell. Middleware only does the optimistic cookie
// redirect — requireUser() HERE (and on every page below, per the
// gate-completeness test) is the real gate. First authenticated visit runs
// the lazy idempotent workspace bootstrap (R-16b).
import type { ReactNode } from "react";
import { requireUser } from "@respin/auth";
import { RenderLockTimeoutError, respinDb } from "@respin/db";
import { displayBalanceFor } from "./display-balance";
import { rethrowNextControlFlow } from "../../lib/next-control-flow";
import { logRefusal } from "./safe-log";
import { ProductShell } from "./product-shell";

export const dynamic = "force-dynamic";

/** The shell's workspace label while the bootstrap could not be read in time. */
const BUSY_WORKSPACE_LABEL = "Your workspace";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  // THE BOOTSTRAP IS BOUNDED (audit Phase 8, gate M2): its shared no-mint
  // attempt runs READ ONLY with `lock_timeout = 5000`, so behind a deletion
  // writer that is itself queued behind a webhook's shared hold it refuses
  // with `RenderLockTimeoutError` instead of holding this render open. The
  // shell then renders without a workspace name or balance and the page below
  // renders its own named refusal (`render_lock_timeout`, through
  // `scopeForUser`) — never a hang, never Next's error page.
  let workspace: { name: string };
  try {
    ({ workspace } = await respinDb.ensureUserWorkspace({
      authUserId: user.id,
      name: user.name || undefined,
    }));
  } catch (error) {
    rethrowNextControlFlow(error);
    if (!(error instanceof RenderLockTimeoutError)) throw error;
    logRefusal("[shell] workspace bootstrap timed out", error);
    return (
      <ProductShell workspaceName={BUSY_WORKSPACE_LABEL} credits={null}>
        {children}
      </ProductShell>
    );
  }

  // The rail shows the derived balance when it CAN be derived; on any refusal
  // it maps to null, and `ShellRail` renders NOTHING for null — asserted by
  // `tests/shell-rail.test.tsx`, which also pins this catch's null-mapping in
  // source. The pages own their full refusal copy; the shell never blocks.
  //
  // THE RAIL NEVER WAITS ON THE MONEY LOCK (audit Phase 8, P8-R1, R-177):
  // `getDisplayBalance` tries the billing lock and, when another transaction
  // holds it, renders the committed fold with `settling` set instead of
  // queueing this render behind it. Contention is therefore never `null` —
  // `null` stays the refusal render below. ONE read per request
  // (`displayBalanceFor`, gate M1): the page below reads the same promise, so
  // the rail and the page can never race each other for the lock.
  //
  // THE SHELL NEVER HOLDS A READ-GRADE SCOPE (R-163). Since R-161 the
  // bootstrap above returns a workspace tombstoned by a pending deletion
  // instead of minting a replacement, so during grace this write-grade
  // `withWorkspace` refuses (`WorkspacePendingDeletionError`), the catch maps
  // it to `credits = null`, and the line below logs on EVERY render of the
  // grace window. That is noise, named here so it is not mistaken for silence
  // or for a fault: the three pages that serve the grace window hold the read
  // grade themselves.
  let credits: number | null = null;
  let settling = false;
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    const view = await displayBalanceFor(scope.workspaceId);
    credits = view.balance;
    settling = view.settling;
  } catch (err) {
    rethrowNextControlFlow(err);
    // Logged, not swallowed: a LedgerIntegrityError here will not fix itself
    // on a reload, and /usage is the only other reader that would say so.
    logRefusal("[shell] balance unavailable", err);
    credits = null;
  }

  return (
    <ProductShell workspaceName={workspace.name} credits={credits} creditsSettling={settling}>
      {children}
    </ProductShell>
  );
}

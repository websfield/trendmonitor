// Authenticated product shell. Middleware only does the optimistic cookie
// redirect — requireUser() HERE (and on every page below, per the
// gate-completeness test) is the real gate. First authenticated visit runs
// the lazy idempotent workspace bootstrap (R-16b).
import type { ReactNode } from "react";
import { requireUser } from "@respin/auth";
import { respinDb } from "@respin/db";
import { respinCredits } from "@respin/credits/app-server";
import { rethrowNextControlFlow } from "../../lib/next-control-flow";
import { SignOutButton } from "./sign-out-button";
import { ProductNav } from "./nav";
import { ShellRail } from "./shell-rail";
import { logRefusal } from "./safe-log";

export const dynamic = "force-dynamic";

export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const { workspace } = await respinDb.ensureUserWorkspace({
    authUserId: user.id,
    name: user.name || undefined,
  });

  // The rail shows the derived balance when it CAN be derived; on any refusal
  // it maps to null, and `ShellRail` renders NOTHING for null — asserted by
  // `tests/shell-rail.test.tsx`, which also pins this catch's null-mapping in
  // source. The pages own their full refusal copy; the shell never blocks.
  let credits: number | null = null;
  try {
    const scope = await respinDb.withWorkspace({ authUserId: user.id });
    credits = (await respinCredits.getBalance(scope.workspaceId)).balance;
  } catch (err) {
    rethrowNextControlFlow(err);
    // Logged, not swallowed: a LedgerIntegrityError here will not fix itself
    // on a reload, and /usage is the only other reader that would say so.
    logRefusal("[shell] balance unavailable", err);
    credits = null;
  }

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <span className="shell-wordmark">Respin</span>
        {/* The three M1 pages were reachable only by typed URL — the evidence
            runbook said "from /settings/billing" without saying how one gets
            there (round-2 NOTE 6). Same links, now the Signal rail. */}
        <ProductNav />
        <div className="shell-foot">
          <ShellRail workspaceName={workspace.name} credits={credits} />
          <SignOutButton />
        </div>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
  );
}
